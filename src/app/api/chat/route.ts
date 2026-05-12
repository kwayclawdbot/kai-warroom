import OpenAI from "openai";
import { NextResponse } from "next/server";

// Wired to the live kai-agent on Railway (cheatcode-ai.up.railway.app/api/chat).
// We forward the message to Kai's real brain (Supabase + Polygon + vault +
// scanners), receive { reply, tool_calls, citations }, run the reply through
// OpenAI TTS, and map each tool_call to a region pulse on the avatar.

export const runtime = "nodejs";
export const maxDuration = 60;

const CHARS_PER_SEC = 14.0;

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

export async function POST(req: Request) {
  const agentUrl = process.env.KAI_AGENT_URL;
  const agentToken = process.env.KAI_AVATAR_TOKEN;
  const userId = process.env.KAI_USER_ID; // phone like "+15551234567"
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

  // 1) Forward to the live kai-agent.
  let reply = "";
  let toolCalls: Array<{ name: string; args?: unknown; duration_ms?: number }> =
    [];
  try {
    const r = await fetch(`${agentUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${agentToken}`,
      },
      body: JSON.stringify({ user_id: userId, message, channel: "avatar" }),
    });
    if (!r.ok) {
      const detail = await r.text();
      return NextResponse.json(
        { error: `kai-agent ${r.status}`, detail: detail.slice(0, 400) },
        { status: 502 },
      );
    }
    const data = await r.json();
    reply = (data.reply ?? "").trim();
    if (Array.isArray(data.tool_calls)) toolCalls = data.tool_calls;
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unknown";
    return NextResponse.json(
      { error: "kai-agent unreachable", detail },
      { status: 502 },
    );
  }
  if (!reply) {
    return NextResponse.json(
      { error: "kai-agent returned empty reply" },
      { status: 502 },
    );
  }

  // 2) Build region pulse schedule from tool calls. Spread them evenly across
  // the audio duration so they fire in roughly the order Kai used the tools.
  const durationSec = Math.max(1, reply.length / CHARS_PER_SEC);
  const validRegions = toolCalls
    .map((c) => ({ ...c, region: toolToRegion(c.name) }))
    .filter((c): c is typeof c & { region: RegionId } => c.region !== null);
  const seenRegions = new Set<RegionId>();
  const regions = validRegions
    .filter((c) => {
      if (seenRegions.has(c.region)) return false;
      seenRegions.add(c.region);
      return true;
    })
    .slice(0, 5) // cap at 5 pulses
    .map((c, i, arr) => ({
      id: c.region,
      peak: 0.9,
      decay_ms: 2200,
      at_second:
        arr.length === 1
          ? durationSec * 0.3
          : (i / (arr.length - 1)) * durationSec * 0.8 + 0.2,
    }));

  // 3) Render TTS.
  const openai = new OpenAI({ apiKey: openaiKey });
  let audioBase64 = "";
  try {
    const tts = await openai.audio.speech.create({
      model: "tts-1",
      voice: "onyx",
      input: reply,
      response_format: "mp3",
    });
    audioBase64 = Buffer.from(await tts.arrayBuffer()).toString("base64");
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unknown";
    return NextResponse.json(
      { error: "TTS failed", detail },
      { status: 502 },
    );
  }

  return NextResponse.json({
    text: reply,
    audio_base64: audioBase64,
    audio_mime: "audio/mpeg",
    regions,
    duration_estimate_sec: durationSec,
  });
}
