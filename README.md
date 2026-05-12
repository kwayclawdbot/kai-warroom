# Kai War Room

Your personal AI trading command center.

Voice-conversational interface for Kai — ask things like "what's the hottest trade right now?", "full analysis on RKLB", "weekly winners", "what are users saying today?" — and get back voice answers from a cinematic neural-cloud avatar, with supporting visual panels that slide in when relevant.

Built to be accessed from any device (phone, laptop, iPad) and recordable for social media (9:16 mode + R-to-record).

## Stack

- **Next.js 16** (App Router, Turbopack) on Vercel
- **React Three Fiber** for the Kai Cloud avatar (v2, GPU-accelerated, ~10k particles, audio-reactive bloom)
- **FastAPI brain** on Railway (separate repo) with Claude Opus 4.7 tool-use over 5 Phase-1 tools
- **Deepgram** streaming STT (ephemeral browser tokens, master key on the brain)
- **Voicebox** TTS via Cloudflare Tunnel (Kway voice profile, local Qwen), OpenAI TTS auto-fallback
- **Supabase** + **Polygon** + Railway `kai-agent` as data sources

## Local dev

```bash
pnpm install
cp .env.example .env.local  # fill in SHARED_PASSWORD + SESSION_SECRET
pnpm dev
```

Open <http://localhost:3000>, enter the password, see the avatar stub.

## Env vars

| Name | Where set | Purpose |
| --- | --- | --- |
| `SHARED_PASSWORD` | Vercel + local | Password to enter the War Room (just Kway for now) |
| `SESSION_SECRET` | Vercel + local | HMAC secret signing the session cookie. Generate with `openssl rand -hex 32` |
| `NEXT_PUBLIC_BRAIN_API_URL` | Vercel + local | URL of the kai-warroom-brain service on Railway |
| `NEXT_PUBLIC_DEEPGRAM_TOKEN_ENDPOINT` | Vercel + local | Path on the brain that mints short-lived Deepgram tokens |

## Auth

The whole app sits behind a single shared password. Login at `/login` exchanges the password for an HMAC-signed session cookie (`kai_session`, 30-day TTL). `src/proxy.ts` enforces the gate on every non-auth route. Multi-user support comes in Phase 2.

## Routes

- `/login` — password gate
- `/` — Avatar + push-to-talk + dock panels
- `/api/auth` — POST password → session cookie
- `/?obs=1` — OBS browser-source mode (no chrome, transparent bg) — wired in Task #9

## Build order

This repo covers the frontend half (Tasks #1, #2, #6, #7, #8, #9). The brain server lives in a separate repo (`kai-warroom-brain`).
