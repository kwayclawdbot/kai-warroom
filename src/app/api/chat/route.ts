import OpenAI from "openai";
import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

// Wired to the live kai-agent on Railway (cheatcode-ai.up.railway.app).
//
// Two paths, picked by `classifyIntent` (pure regex, no LLM call):
//
//   • DATA  — anything that looks like it needs Kai's tool loop (tickers,
//     watchlist, alerts, "what's happening with…", etc). Routed to the
//     kai-agent SSE stream. The agent loop takes 10–27s, so we emit a
//     speculative filler mp3 the instant we start the upstream connection,
//     pulse regions live as `tool_start` events arrive, and stream TTS per
//     sentence once the reply comes back. Same flow as before.
//
//   • CASUAL — small talk, vibes, "hey what's up". Bypasses kai-agent
//     entirely and streams a tight gpt-4o-mini completion directly (~1–2s
//     to first audio). No tools, no regions, no filler — filler would
//     overlap real audio on this fast path.
//
// Both paths emit the same NDJSON event contract (`tool_start`, `tool_end`,
// `text`, `regions`, `audio_chunk`, `done`, `error`, `filler`) so the client
// is path-agnostic.

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

// ───────────────────────── Ticker / intent helpers ─────────────────────────
//
// Ticker pattern: 1–5 uppercase letters, optional leading `$`, on a word
// boundary. Filler matcher uses 2–5 to skip single-letter false positives
// like "I"; classifier uses 1–5 since a single capital with `$` (e.g. "$F")
// is still a real ticker.
const TICKER_BLOCKLIST = new Set([
  "A", "I", "IT", "NO", "OK", "OR", "AND", "THE", "ON", "IS", "BE", "US",
  "MY", "ME", "GO", "HI", "HEY", "OH", "AH", "YO", "LOL", "OMG", "WTF",
  "IDK", "TBH", "IMO", "BTW", "FYI", "LMK", "NVM", "RIP", "AF", "ASAP",
]);
const TICKER_RE_FILLER = /\b\$?[A-Z]{2,5}\b/;
const TICKER_RE_CLASSIFIER = /(?:\$[A-Z]{1,5}\b|\b[A-Z]{2,5}\b)/;

/** True if `msg` contains a probable stock ticker (not in the blocklist). */
function hasTicker(msg: string, re: RegExp): boolean {
  const matches = msg.match(new RegExp(re.source, "g"));
  if (!matches) return false;
  for (const m of matches) {
    const sym = m.replace(/^\$/, "");
    if (!TICKER_BLOCKLIST.has(sym)) return true;
  }
  return false;
}

/** Filler ids — keep in sync with public/audio/fillers/<id>.mp3. */
type FillerId =
  | "checking"
  | "one_sec"
  | "scanning"
  | "pulling_up"
  | "watchlist"
  | "alerts"
  | "tape"
  | "ticker"
  | "thinking"
  | "into_it";

const RANDOM_FILLERS: FillerId[] = ["checking", "one_sec", "into_it"];

/**
 * Heuristic match a filler clip to the user's question. Cheap keyword scan,
 * picked server-side so the same intent gets the same filler consistently.
 */
function pickFiller(message: string): FillerId {
  const m = message.toLowerCase();
  if (hasTicker(message, TICKER_RE_FILLER)) return "ticker";
  if (/\bwatchlist\b/.test(m)) return "watchlist";
  if (/\balerts?\b/.test(m)) return "alerts";
  if (/\b(setup|chart|level)\b/.test(m)) return "pulling_up";
  if (/what do you think|should i\b/.test(m)) return "thinking";
  if (/\b(market|today|tape)\b/.test(m)) {
    return Math.random() < 0.5 ? "tape" : "scanning";
  }
  return RANDOM_FILLERS[Math.floor(Math.random() * RANDOM_FILLERS.length)];
}

// ─────────────────────────── Intent classifier ────────────────────────────
//
// Pure regex — zero LLM latency. Anything that looks like it wants real
// market data goes to the kai-agent tool loop ("data"); everything else
// falls through to the casual gpt-4o-mini path.
const DATA_KEYWORDS = [
  "watchlist", "alert", "alerts", "position", "portfolio", "setup", "entry",
  "target", "stop loss", "chart", "level", "support", "resistance",
  "breakout", "macd", "rsi", "ema", "vwap", "volume", "earnings", "dividend",
  "tomorrow", "this week", "gap up", "gap down", "premarket",
  "aftermarket", "news on", "what's happening with", "show me", "pull up",
  "scan", "screen", "find me", "bias", "recap",
];

function classifyIntent(message: string): "data" | "casual" {
  if (hasTicker(message, TICKER_RE_CLASSIFIER)) return "data";
  const m = message.toLowerCase();
  for (const kw of DATA_KEYWORDS) {
    if (m.includes(kw)) return "data";
  }
  return "casual";
}

// Casual path system prompt — keeps gpt-4o-mini tight, on-character, and
// bounces back to the full Kai loop if the user actually wants data.
const CASUAL_SYSTEM_PROMPT = `You're Kai — a buddy on the trading desk. Talk like a person, not an assistant.

Sound like this: "Yeah I'm good, just watching the tape." / "Tough open, we'll see how it shapes up." / "Real talk, that idea's solid."

Not like this: "Great question!" / "I'd be happy to help with that." / "Here are some thoughts..."

One or two sentences. Contractions always. No bullet points, no preamble. If they ask about specific tickers, alerts, watchlist, or actual market data, just say "hold on, switching to full Kai" and stop.`;

/**
 * Split text into sentence-sized chunks for sequential TTS rendering. Keeps
 * trailing punctuation. Decimal-aware (won't split "$198.50") and merges
 * tiny fragments back into the previous sentence so words don't get clipped
 * at chunk boundaries.
 */
function splitSentences(text: string): string[] {
  const parts = text
    .split(/(?<=[.!?])(?<!\d\.\d?)(?<!\b[A-Z]\.)\s+(?=[A-Z"'\(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const merged: string[] = [];
  for (const s of parts) {
    if (merged.length > 0 && (s.length < 12 || /^[\d%)\]]/.test(s))) {
      merged[merged.length - 1] += " " + s;
    } else {
      merged.push(s);
    }
  }
  return merged.length > 0 ? merged : [text.trim()];
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

  const intent = classifyIntent(message);
  console.log(
    `[chat] intent=${intent} msg=${JSON.stringify(message.slice(0, 80))}`,
  );

  const openai = new OpenAI({ apiKey: openaiKey });

  // Casual path — bypass kai-agent entirely. ~1–2s to first audio.
  if (intent === "casual") {
    return streamCasual(openai, message);
  }

  // Data path — proxy to kai-agent, emit filler immediately.
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
  return streamData(openai, message, {
    agentUrl,
    agentToken,
    userId,
  });
}

// ───────────────────────────── Data path ─────────────────────────────────

interface AgentConfig {
  agentUrl: string;
  agentToken: string;
  userId: string;
}

async function streamData(
  openai: OpenAI,
  message: string,
  cfg: AgentConfig,
): Promise<Response> {
  // Pick a filler clip before we even open the upstream. The client preloads
  // /audio/fillers/<id>.mp3 (a static asset, ~25KB) and plays it through the
  // same audio queue as the real `audio_chunk` events — so the trader hears
  // Kai start talking ~50ms after pressing send, while the tool loop chugs.
  const fillerId = pickFiller(message);

  // Connect to kai-agent's SSE endpoint.
  let upstream: Response;
  try {
    upstream = await fetch(`${cfg.agentUrl}/api/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.agentToken}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        user_id: cfg.userId,
        message,
        channel: "avatar",
      }),
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

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Filler MUST be the first event on the wire so the client can fetch
      // and queue the mp3 while the tool loop runs.
      controller.enqueue(
        ndjson({
          type: "filler",
          id: fillerId,
          url: `/audio/fillers/${fillerId}.mp3`,
        }),
      );

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

// ──────────────────────────── Casual path ────────────────────────────────
//
// Streams a `gpt-4o-mini` chat completion, accumulates tokens into sentence
// boundaries, and renders each completed sentence through OpenAI TTS-1.
// No tool events, no regions — the brain pulses stay on their idle loop.

async function streamCasual(
  openai: OpenAI,
  message: string,
): Promise<Response> {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let chunkIndex = 0;
      let fullReply = "";

      const renderSentence = async (sentence: string) => {
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
      };

      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          stream: true,
          messages: [
            { role: "system", content: CASUAL_SYSTEM_PROMPT },
            { role: "user", content: message },
          ],
        });

        // Accumulate streamed tokens into a buffer. When the buffer contains
        // a sentence-terminating punctuation followed by whitespace (or we
        // hit end-of-stream), flush the completed sentence to TTS.
        let pending = "";
        for await (const chunk of completion) {
          const delta = chunk.choices?.[0]?.delta?.content ?? "";
          if (!delta) continue;
          pending += delta;
          fullReply += delta;

          // Split on sentence boundaries; keep the last (potentially
          // incomplete) piece in `pending`.
          const pieces = pending.split(/(?<=[.!?])\s+/);
          if (pieces.length > 1) {
            const complete = pieces.slice(0, -1);
            pending = pieces[pieces.length - 1];
            for (const s of complete) {
              const trimmed = s.trim();
              if (trimmed) await renderSentence(trimmed);
            }
          }
        }
        const tail = pending.trim();
        if (tail) await renderSentence(tail);

        // Emit a `text` event with the full reply for any caption hand-off.
        // Same shape as the data path so the client doesn't branch.
        controller.enqueue(ndjson({ type: "text", text: fullReply.trim() }));
      } catch (e) {
        const detail = e instanceof Error ? e.message : "unknown";
        controller.enqueue(
          ndjson({ type: "error", message: `casual stream failed: ${detail}` }),
        );
      }

      controller.enqueue(ndjson({ type: "done", chunks: chunkIndex }));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
      "X-Accel-Buffering": "no",
    },
  });
}
