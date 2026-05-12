import OpenAI from "openai";
import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

// Wired to the live kai-agent on Railway (cheatcode-ai.up.railway.app).
//
// Flow:
//   1. Open SSE stream to kai-agent /api/chat/stream.
//   2. Forward tool_start / tool_end events to the browser as NDJSON lines
//      so the avatar can pulse regions in real time (instead of waiting ~27s
//      for the blocking response).
//   3. When the agent finishes (`reply` event), accumulate tool names →
//      regions, split the reply into sentences, render each sentence through
//      OpenAI TTS, and emit audio chunks as they're ready. Finally emit a
//      `done` event.

export const runtime = "nodejs";
// Vercel Fluid Compute / streaming functions can run longer than the legacy
// 60s blocking cap. 300s is well above the typical p99 for a multi-tool agent
// turn while still keeping a hard ceiling on runaway turns.
export const maxDuration = 300;

type RegionId =
  | "memory"
  | "market"
  | "technicals"
  | "alerts"
  | "watchlist"
  | "users"
  | "news"
  | "options";

/** Map a tool name to one of Kai's 8 cognitive regions. */
function toolToRegion(toolName: string): RegionId | null {
  const n = toolName.toLowerCase();
  if (/(memor|recall|vault|history)/.test(n)) return "memory";
  if (/(sector|market|regime|macro|tape|index)/.test(n)) return "market";
  if (/(chart|snapshot|ticker|breakout|technical|score|pattern|level)/.test(n))
    return "technicals";
  if (/(alert|signal|winner)/.test(n)) return "alerts";
  if (/(watchlist|saved|fav)/.test(n)) return "watchlist";
  if (/(user|community|pulse|chatter|subscriber|sentiment)/.test(n))
    return "users";
  if (/(news|headline|story)/.test(n)) return "news";
  if (/(option|flow|unusual|chain|strike)/.test(n)) return "options";
  return null;
}

const CHARS_PER_SEC = 14.0;

/**
 * Split text into sentence-sized chunks for sequential TTS rendering. Keeps
 * trailing punctuation. Trims and drops empty pieces.
 */
function splitSentences(text: string): string[] {
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts.length > 0 ? parts : [text.trim()];
}

/** NDJSON line: one JSON object per `\n`-terminated line. */
function ndjson(event: object): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(event) + "\n");
}

/**
 * Parse SSE events from a streamed buffer. Returns extracted events plus the
 * leftover (partial) buffer. SSE events are separated by `\n\n`; each event
 * has `event: <name>` and `data: <json>` lines.
 */
function parseSseChunk(
  buf: string,
): { events: Array<{ event: string; data: unknown }>; rest: string } {
  const events: Array<{ event: string; data: unknown }> = [];
  let rest = buf;
  while (true) {
    const idx = rest.indexOf("\n\n");
    if (idx === -1) break;
    const block = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    let eventName = "message";
    let dataStr = "";
    for (const rawLine of block.split("\n")) {
      const line = rawLine.trimEnd();
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataStr += line.slice(5).trim();
      }
    }
    let data: unknown = null;
    if (dataStr) {
      try {
        data = JSON.parse(dataStr);
      } catch {
        data = dataStr;
      }
    }
    events.push({ event: eventName, data });
  }
  return { events, rest };
}

export async function POST(req: Request) {
  // Rate limit: 30 chat requests per minute per IP. In-memory + per-instance.
  const rl = rateLimit(`chat:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSec) },
      },
    );
  }

  const agentUrl = process.env.KAI_AGENT_URL;
  const agentToken = process.env.KAI_AVATAR_TOKEN;
  const userId = process.env.KAI_USER_ID;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!agentUrl || !agentToken) {
    return NextResponse.json(
      { error: "KAI_AGENT_URL or KAI_AVATAR_TOKEN not configured" },
      { status: 500 },
    );
  }
  if (!userId) {
    return NextResponse.json(
      {
        error:
          "KAI_USER_ID not set — add the phone of your kai-agent user via Vercel env",
      },
      { status: 500 },
    );
  }
  if (!openaiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 500 },
    );
  }

  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "empty message" }, { status: 400 });
  }

  // Connect to kai-agent's SSE endpoint.
  let upstream: Response;
  try {
    upstream = await fetch(`${agentUrl}/api/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${agentToken}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ user_id: userId, message, channel: "avatar" }),
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unknown";
    return NextResponse.json(
      { error: "kai-agent unreachable", detail },
      { status: 502 },
    );
  }
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return NextResponse.json(
      { error: `kai-agent ${upstream.status}`, detail: detail.slice(0, 400) },
      { status: 502 },
    );
  }

  const upstreamBody = upstream.body;
  const openai = new OpenAI({ apiKey: openaiKey });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstreamBody.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const toolNames: string[] = [];
      let replyText = "";
      let upstreamDone = false;

      try {
        while (!upstreamDone) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const { events, rest } = parseSseChunk(buf);
          buf = rest;
          for (const ev of events) {
            const data = ev.data as Record<string, unknown> | null;
            if (ev.event === "tool_start" && data) {
              const name = String(data.name ?? "");
              toolNames.push(name);
              controller.enqueue(
                ndjson({ type: "tool_start", name, args: data.args }),
              );
            } else if (ev.event === "tool_end" && data) {
              controller.enqueue(
                ndjson({
                  type: "tool_end",
                  name: String(data.name ?? ""),
                  duration_ms: Number(data.duration_ms ?? 0),
                }),
              );
            } else if (ev.event === "reply" && data) {
              replyText = String(data.text ?? "").trim();
            } else if (ev.event === "error" && data) {
              controller.enqueue(
                ndjson({
                  type: "error",
                  message: String(data.message ?? "kai-agent error"),
                }),
              );
            } else if (ev.event === "done") {
              upstreamDone = true;
            }
          }
        }
      } catch (e) {
        const detail = e instanceof Error ? e.message : "unknown";
        controller.enqueue(
          ndjson({ type: "error", message: `stream read failed: ${detail}` }),
        );
        controller.close();
        return;
      }

      if (!replyText) {
        controller.enqueue(
          ndjson({ type: "error", message: "kai-agent returned empty reply" }),
        );
        controller.close();
        return;
      }

      // Build region pulse schedule from accumulated tool calls.
      const durationSec = Math.max(1, replyText.length / CHARS_PER_SEC);
      const seenRegions = new Set<RegionId>();
      const regions = toolNames
        .map((name) => ({ name, region: toolToRegion(name) }))
        .filter((c): c is { name: string; region: RegionId } => c.region !== null)
        .filter((c) => {
          if (seenRegions.has(c.region)) return false;
          seenRegions.add(c.region);
          return true;
        })
        .slice(0, 5)
        .map((c, i, arr) => ({
          id: c.region,
          peak: 0.9,
          decay_ms: 2200,
          at_second:
            arr.length === 1
              ? durationSec * 0.3
              : (i / (arr.length - 1)) * durationSec * 0.8 + 0.2,
        }));

      // Emit text + region schedule before audio so the client can show the
      // caption while sentences render.
      controller.enqueue(ndjson({ type: "text", text: replyText }));
      controller.enqueue(
        ndjson({
          type: "regions",
          regions,
          duration_estimate_sec: durationSec,
        }),
      );

      // Render TTS per sentence. Sequential — keeps order, avoids overlap, and
      // gives the client something to play while later sentences are still
      // rendering on the server.
      const sentences = splitSentences(replyText);
      let chunkIndex = 0;
      for (const sentence of sentences) {
        try {
          const tts = await openai.audio.speech.create({
            model: "tts-1",
            voice: "onyx",
            input: sentence,
            response_format: "mp3",
          });
          const base64 = Buffer.from(await tts.arrayBuffer()).toString("base64");
          controller.enqueue(
            ndjson({
              type: "audio_chunk",
              index: chunkIndex,
              base64,
              mime: "audio/mpeg",
              text: sentence,
            }),
          );
          chunkIndex += 1;
        } catch (e) {
          const detail = e instanceof Error ? e.message : "unknown";
          controller.enqueue(
            ndjson({
              type: "error",
              message: `tts failed on sentence ${chunkIndex}: ${detail}`,
            }),
          );
        }
      }

      controller.enqueue(
        ndjson({ type: "done", chunks: chunkIndex }),
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
      // Disable proxy buffering (Vercel respects this).
      "X-Accel-Buffering": "no",
    },
  });
}
