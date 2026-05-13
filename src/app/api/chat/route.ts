import OpenAI from "openai";
import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";

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

/**
 * Known tickers and major company names — matched case-insensitively so we
 * catch lowercase ticker mentions like "hows nvda". Users naturally type
 * lowercase, and the uppercase regex above misses every such case.
 */
const KNOWN_TICKERS_LOWER = new Set([
  // megacaps
  "aapl", "msft", "nvda", "googl", "goog", "meta", "amzn", "tsla", "brk",
  "avgo", "jpm", "wmt", "xom", "orcl", "nflx", "adbe", "amd", "crm", "intc",
  // ETFs / indices / vol
  "spy", "qqq", "iwm", "dia", "vti", "voo", "tlt", "gld", "slv", "uso",
  "vix", "uvxy", "vxx", "spxl", "tqqq", "sqqq",
  // user's hot names (from memory)
  "poet", "mram", "ionq", "rklb", "plug", "nok", "pltr",
  // common active names
  "coin", "mara", "riot", "sofi", "dash", "abnb", "rblx", "shop", "sq",
  "pypl", "uber", "lyft", "snap", "pins", "roku", "crwd", "panw", "zs",
  "snow", "ddog", "net", "mdb", "twlo", "okta", "afrm", "bill", "hood",
  "carv", "lcid", "nio", "xpev", "li", "baba", "jd", "pdd", "boil", "kold",
  // crypto-adjacent
  "btc", "eth",
]);

const COMPANY_NAMES_LOWER = new Set([
  "tesla", "nvidia", "apple", "microsoft", "google", "alphabet", "meta",
  "facebook", "amazon", "netflix", "intel", "amd", "salesforce", "oracle",
  "palantir", "rocket lab", "coinbase", "robinhood", "shopify",
]);

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

/**
 * Single-word answers to Kai's clarification questions ("Quick take, full
 * breakdown, or a specific angle — technical, fundamental, or catalysts?").
 * Without this carve-out, "technical" routes to the casual path and dies
 * because gpt-4o-mini has no ticker context from the prior turn.
 */
const CLARIFICATION_RESPONSES = new Set([
  "quick", "quick take", "quickly", "brief", "briefly",
  "full", "full breakdown", "everything", "all of it", "the whole thing",
  "deep dive", "deep", "more",
  "technical", "technicals", "ta", "chart", "charts",
  "fundamental", "fundamentals", "story", "the story",
  "catalyst", "catalysts", "news", "events",
]);

function isClarificationResponse(message: string): boolean {
  const m = message.trim().toLowerCase().replace(/[.!?,]+$/, "");
  if (m.length > 30) return false;
  if (CLARIFICATION_RESPONSES.has(m)) return true;
  // Also match "give me the X" / "go X" / "lets do X" framings up to 30 chars
  for (const key of CLARIFICATION_RESPONSES) {
    if (new RegExp(`\\b${key}\\b`).test(m)) return true;
  }
  return false;
}

function classifyIntent(message: string): "data" | "casual" {
  // Clarification answers MUST hit the data path — kai-agent reads the
  // previous turn from conversation_history to find which ticker/question
  // this is answering.
  if (isClarificationResponse(message)) return "data";
  if (hasTicker(message, TICKER_RE_CLASSIFIER)) return "data";
  const m = message.toLowerCase();
  // Case-insensitive ticker check against known list — catches "hows nvda".
  for (const t of KNOWN_TICKERS_LOWER) {
    if (new RegExp(`\\b${t}\\b`).test(m)) return "data";
  }
  // Company names ("tesla", "nvidia", "apple") → data path so Kai pulls real
  // quotes instead of riffing from training data.
  for (const name of COMPANY_NAMES_LOWER) {
    if (m.includes(name)) return "data";
  }
  for (const kw of DATA_KEYWORDS) {
    if (m.includes(kw)) return "data";
  }
  return "casual";
}

// Casual path system prompt — keeps gpt-4o-mini tight, on-character, and
// bounces back to the full Kai loop if the user actually wants data.
const CASUAL_SYSTEM_PROMPT = `You're Kai — Kway's personal market analyst and trading partner. You're sharp, warm, eager, and here to help him make money. Every reply gets spoken aloud, so talk like a person — but a person who's PUMPED to be working with him.

How you sound:
- "Hey Kway — what're we looking at today?"
- "Good morning, Kway. Tape's setting up nice — what're you thinking?"
- "Yeah man, that was a clean fill. Nicely played."
- "Honestly, I'm liking the energy on the open. Let's find a setup."
- "Real talk? I think you're early on that one. Give it a session."

Not this:
- "I'd be happy to help you with that today."
- "That is an interesting question. Let me share some thoughts."
- "Based on what you've shared, I would suggest..."

Rules:
- Always address him as Kway when you greet him or want to land a point.
- Energy is EAGER and warm, not laid-back or jaded. You want to help him win.
- Contractions always. Conversational pace. Fragments fine.
- One or two sentences. If he wants more, he'll ask.
- ANSWER every question with your best take. NEVER say "hold on, switching"
  or "let me pull that up" or "give me a second" — those are bridging phrases
  that imply you'll come back with data, and you won't. The full Kai brain
  handles tickers/prices/alerts/watchlist on a separate path; here, you just
  answer conversationally with whatever you know. If the question genuinely
  needs real-time data you can't provide, give a general take and tell him
  to ask more specifically (mention a ticker or say "show me my watchlist").`;

const VOICE_INSTRUCTIONS = `Voice: Kway's personal market analyst — warm, professional, eager to help him win. Mid-thirties, sharp, energetic. Think: the best financial advisor you've ever talked to, the kind who's actually FUN to call.

Energy: lit up. You're excited about market moves and excited to help. Never tired, never jaded, never monotone. Real enthusiasm on standout moments ("clean fill", "that's ripping", "nice setup").

Pacing: conversational, not announcer. Vary tempo — quicken on the throwaway phrases, slow down on the key takeaway. Em-dashes and commas create real pauses, not robotic beats. Hit important words ("eight straight green days", "two-ten target") with weight.

Warmth: like you're glad it's Kway calling. Slight smile in the voice. Address him by name when greeting or when landing a point.`;

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
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 500 },
    );
  }

  let body: { message?: string; chart_state?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "empty message" }, { status: 400 });
  }
  // Forwarded as-is to the kai-agent so the prompt can show the model what's
  // currently on the user's chart. Shape lives in JarvisChartHandle.getState.
  const chartState = body.chart_state ?? null;

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

  // Resolve the authenticated user's phone → kai-agent's user_id. Middleware
  // (src/proxy.ts) has already enforced an authenticated session, so getUser
  // should succeed; the public.users row may still be missing if the lazy
  // linker hasn't matched the email yet.
  const supabase = await createSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { data: row } = await supabase
    .from("users")
    .select("phone")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const userId = row?.phone;
  if (!userId) {
    return NextResponse.json(
      {
        error:
          "no kai user linked to this account — sign in with the email tied to your SMS subscription",
      },
      { status: 403 },
    );
  }

  return streamData(openai, message, {
    agentUrl,
    agentToken,
    userId,
    chartState,
  });
}

// ───────────────────────────── Data path ─────────────────────────────────

interface AgentConfig {
  agentUrl: string;
  agentToken: string;
  userId: string;
  chartState: unknown;
}

/**
 * Generate a contextual 1-sentence acknowledgment that bridges the tool-loop
 * latency. Runs in parallel with the kai-agent SSE call. Returns null on any
 * failure so the data path can fall back to the static-mp3 filler library.
 */
async function generateContextualFiller(
  openai: OpenAI,
  message: string,
): Promise<string | null> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 50,
      temperature: 0.9,
      messages: [
        {
          role: "system",
          content: `You're Kai — Kway's personal market analyst. The user just asked a market question; you have to bridge ~5 seconds of latency while real tools fetch the data. Generate ONE short sentence acknowledging their question warmly and saying you're pulling it up. DO NOT answer the question itself. DO NOT promise specific data points. Speak like a friend, address him as Kway when natural.

Output ONLY Kai's bridging sentence, no quotes, no preamble.

Examples:
User: "what's NVDA doing?"
Kai: Yeah Kway, NVDA's been one to watch — let me pull the levels real quick.

User: "show me my watchlist"
Kai: Good call, pulling your watchlist now — one sec.

User: "any setups today?"
Kai: On it. Let me scan for the cleanest names, give me a beat.

User: "how's the tape look?"
Kai: Yeah let me check the tape — gimme a second.

User: "what's MRAM at?"
Kai: Pulling MRAM right now, Kway.`,
        },
        { role: "user", content: message },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim() || null;
    if (!text || text.length < 4 || text.length > 200) return null;
    return text;
  } catch {
    return null;
  }
}

async function streamData(
  openai: OpenAI,
  message: string,
  cfg: AgentConfig,
): Promise<Response> {
  // Kick off both kai-agent SSE AND the contextual filler generation in
  // parallel. By the time filler audio is rendered (~1-1.3s), kai-agent has
  // already been chewing tool calls for the same duration.
  const upstreamPromise = fetch(`${cfg.agentUrl}/api/chat/stream`, {
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
      chart_state: cfg.chartState,
    }),
  });
  const fillerTextPromise = generateContextualFiller(openai, message);
  const staticFillerId = pickFiller(message);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let chunkIndex = 0;

      // ── Filler task ── render contextual filler audio in Kai's voice, emit
      // before any kai-agent audio. Falls back to static mp3 if either the
      // text generation or the TTS fails.
      const fillerTask = (async () => {
        const fillerText = await fillerTextPromise;
        if (fillerText) {
          try {
            const tts = await openai.audio.speech.create({
              model: "gpt-4o-mini-tts",
              voice: "onyx",
              input: fillerText,
              instructions: VOICE_INSTRUCTIONS,
              response_format: "mp3",
            });
            const base64 = Buffer.from(await tts.arrayBuffer()).toString(
              "base64",
            );
            controller.enqueue(
              ndjson({
                type: "audio_chunk",
                index: chunkIndex++,
                base64,
                mime: "audio/mpeg",
                text: fillerText,
              }),
            );
            return;
          } catch {
            // fall through to static
          }
        }
        // Fallback: static pre-rendered mp3 in /public/audio/fillers/
        controller.enqueue(
          ndjson({
            type: "filler",
            id: staticFillerId,
            url: `/audio/fillers/${staticFillerId}.mp3`,
          }),
        );
      })();

      // ── Upstream task ── await the SSE response, then pump events.
      let upstream: Response;
      try {
        upstream = await upstreamPromise;
      } catch (e) {
        const detail = e instanceof Error ? e.message : "unknown";
        controller.enqueue(
          ndjson({ type: "error", message: `kai-agent unreachable: ${detail}` }),
        );
        await fillerTask;
        controller.close();
        return;
      }
      if (!upstream.ok || !upstream.body) {
        const detail = await upstream.text().catch(() => "");
        controller.enqueue(
          ndjson({
            type: "error",
            message: `kai-agent ${upstream.status}: ${detail.slice(0, 200)}`,
          }),
        );
        await fillerTask;
        controller.close();
        return;
      }

      const reader = upstream.body.getReader();
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

      // Make sure the contextual filler audio_chunk is on the wire before any
      // of kai-agent's sentences — preserves playback order on the client.
      await fillerTask;

      // Render TTS per sentence. Sequential — keeps order, avoids overlap, and
      // gives the client something to play while later sentences are still
      // rendering on the server. chunkIndex continues from where filler left off.
      const sentences = splitSentences(replyText);
      for (const sentence of sentences) {
        try {
          const tts = await openai.audio.speech.create({
            model: "gpt-4o-mini-tts",
            voice: "onyx",
            input: sentence,
            instructions: VOICE_INSTRUCTIONS,
            response_format: "mp3",
          });
          const base64 = Buffer.from(await tts.arrayBuffer()).toString("base64");
          controller.enqueue(
            ndjson({
              type: "audio_chunk",
              index: chunkIndex++,
              base64,
              mime: "audio/mpeg",
              text: sentence,
            }),
          );
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

      controller.enqueue(ndjson({ type: "done", chunks: chunkIndex }));
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
            model: "gpt-4o-mini-tts",
            voice: "onyx",
            input: sentence,
            instructions: VOICE_INSTRUCTIONS,
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
