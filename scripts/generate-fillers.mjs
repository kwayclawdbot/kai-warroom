#!/usr/bin/env node
// One-time generator for Kai's speculative filler library.
//
// Synthesizes each phrase with OpenAI TTS-1 using the `onyx` voice (Kai's
// canonical voice) and writes to public/audio/fillers/<id>.mp3. These mp3s
// are served as static assets and preloaded by the client so they play with
// zero latency the moment Kai routes a query to the slow kai-agent path.
//
// Usage:
//   pnpm gen:fillers
//
// Idempotent — re-running overwrites existing files. Reads OPENAI_API_KEY
// from .env.local (no dotenv dependency; tiny inline parser).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const OUT_DIR = join(REPO_ROOT, "public", "audio", "fillers");

const FILLERS = [
  { id: "checking", text: "Let me check that" },
  { id: "one_sec", text: "One sec" },
  { id: "scanning", text: "Scanning the market" },
  { id: "pulling_up", text: "Pulling that up" },
  { id: "watchlist", text: "Pulling your watchlist" },
  { id: "alerts", text: "Checking your alerts" },
  { id: "tape", text: "Checking the tape" },
  { id: "ticker", text: "Looking up that ticker" },
  { id: "thinking", text: "Hmm, let me think" },
  { id: "into_it", text: "Looking into it" },
];

/** Minimal .env parser — handles `KEY=value` and quoted values. No exports. */
function loadEnvLocal() {
  const envPath = join(REPO_ROOT, ".env.local");
  if (!existsSync(envPath)) return {};
  const raw = readFileSync(envPath, "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function main() {
  const fileEnv = loadEnvLocal();
  const apiKey = process.env.OPENAI_API_KEY || fileEnv.OPENAI_API_KEY;
  if (!apiKey) {
    console.error(
      "[gen:fillers] OPENAI_API_KEY not found in env or .env.local",
    );
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const openai = new OpenAI({ apiKey });

  console.log(`[gen:fillers] writing ${FILLERS.length} mp3s → ${OUT_DIR}`);
  for (const filler of FILLERS) {
    const outPath = join(OUT_DIR, `${filler.id}.mp3`);
    process.stdout.write(`  ${filler.id.padEnd(12)} "${filler.text}" … `);
    try {
      const tts = await openai.audio.speech.create({
        model: "tts-1",
        voice: "onyx",
        input: filler.text,
        response_format: "mp3",
      });
      const buf = Buffer.from(await tts.arrayBuffer());
      writeFileSync(outPath, buf);
      console.log(`${buf.length} bytes`);
    } catch (err) {
      console.error(`failed: ${err instanceof Error ? err.message : err}`);
      process.exitCode = 1;
    }
  }
  console.log("[gen:fillers] done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
