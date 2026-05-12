import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { NextResponse } from "next/server";

// Inline brain: Claude generates a short spoken-style Kai reply with inline
// <region>...</region> tags; OpenAI TTS renders it; we parse out the tags
// into a pulse schedule and return everything to the browser.
//
// Hosted as a Next.js serverless function on Vercel. Defaults to 60s timeout
// via `export const maxDuration` below (overrides the 10s hobby default; Pro
// honors values up to 60s).

export const runtime = "nodejs";
export const maxDuration = 60;

const KAI_SYSTEM_PROMPT = `You are Kai, a sharp AI trading coach for Cheat Code AI.

Voice: confident, direct, no fluff. Like a trader who's been doing this for
fifteen years and has seen every setup.

Format:
- Reply in 1–3 short spoken-style sentences. NO markdown, NO bullets, NO headers.
- Use plain numbers spelled the way you'd say them ("eight fifty" not "$850.00").
- Mention specific tickers, levels, or setups when relevant.

Cognitive regions:
Your brain has 8 regions that light up as you think. Tag the regions you're
using with inline XML tags like <region>technicals</region>. Use 2–4 regions
per reply, placed inline near the relevant words. Available regions:
- memory     — pulling up prior context / vault notes
- market     — overall regime, macro, sectors
- technicals — chart patterns, scoring, levels
- alerts     — sent alerts, performance, winners
- watchlist  — user watchlists, saved tickers
- users      — community sentiment, what people are saying
- news       — headlines, sentiment, themes
- options    — chains, flow, unusual activity

Example reply:
"<region>market</region>Tape is risk-on right now. <region>technicals</region>NVDA broke eight fifty with volume — <region>alerts</region>we already fired that one this morning."`;

const VALID_REGIONS = new Set([
  "memory",
  "market",
  "technicals",
  "alerts",
  "watchlist",
  "users",
  "news",
  "options",
]);
const REGION_RE = /<region>\s*([a-z_]+)\s*<\/region>/gi;
const CHARS_PER_SEC = 14.0; // OpenAI tts-1 onyx ~speaking rate

type RegionPulse = {
  id: string;
  peak: number;
  decay_ms: number;
  at_second: number;
};

function parseRegions(rawText: string): {
  text: string;
  regions: RegionPulse[];
} {
  const regions: RegionPulse[] = [];
  const pieces: string[] = [];
  let cursor = 0;
  let charsSoFar = 0;

  for (const m of rawText.matchAll(REGION_RE)) {
    pieces.push(rawText.slice(cursor, m.index));
    charsSoFar += (m.index ?? 0) - cursor;
    const id = m[1].trim().toLowerCase();
    if (VALID_REGIONS.has(id)) {
      regions.push({
        id,
        peak: 0.9,
        decay_ms: 2200,
        at_second: charsSoFar / CHARS_PER_SEC,
      });
    }
    cursor = (m.index ?? 0) + m[0].length;
  }
  pieces.push(rawText.slice(cursor));
  return { text: pieces.join("").trim(), regions };
}

export async function POST(req: Request) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!anthropicKey || !openaiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY or OPENAI_API_KEY not configured" },
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

  const anthropic = new Anthropic({ apiKey: anthropicKey });
  const openai = new OpenAI({ apiKey: openaiKey });

  // 1) Generate Kai's reply via Claude Opus 4.7.
  let rawText: string;
  try {
    const msg = await anthropic.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 400,
      system: KAI_SYSTEM_PROMPT,
      messages: [{ role: "user", content: message }],
    });
    rawText = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "Claude rate limited — retry shortly" },
        { status: 429 },
      );
    }
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Claude ${e.status}: ${e.message}` },
        { status: 502 },
      );
    }
    const detail = e instanceof Error ? e.message : "unknown";
    return NextResponse.json(
      { error: "Claude call failed", detail },
      { status: 502 },
    );
  }

  // 2) Strip region tags + schedule pulses.
  const { text, regions } = parseRegions(rawText);
  if (!text) {
    return NextResponse.json({ error: "empty model reply" }, { status: 502 });
  }

  // 3) Generate TTS audio.
  let audioBase64: string;
  try {
    const tts = await openai.audio.speech.create({
      model: "tts-1",
      voice: "onyx",
      input: text,
      response_format: "mp3",
    });
    const buf = Buffer.from(await tts.arrayBuffer());
    audioBase64 = buf.toString("base64");
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unknown";
    return NextResponse.json(
      { error: "TTS failed", detail },
      { status: 502 },
    );
  }

  return NextResponse.json({
    text,
    audio_base64: audioBase64,
    audio_mime: "audio/mpeg",
    regions,
    duration_estimate_sec: Math.max(0.5, text.length / CHARS_PER_SEC),
  });
}
