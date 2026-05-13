# CheatCode AI — Mobile App Project Doc

> Handoff doc for designer (Figma) and engineering. Captures the strategic shape of the app: what it is, who it's for, what it does, what it doesn't, and how it'll be built. Read alongside **UX.md** for screen-level detail.

## One-line

A voice-first AI trading concierge — Kai — that lives in your pocket. He watches the tape for you, alerts you to setups, draws on your charts, and (soon) places trades through your broker. Built for serious retail traders who want a Bloomberg terminal that *talks to them*.

## Who it's for

**Primary**: active retail traders, $25k–$500k account size, swing + day trading US equities + options. Phone-first. Already pay $30–100/mo for charting tools, Discord rooms, alerts services. Tech-comfortable but not engineers.

**Persona archetypes**:
- *"The grinder"* — works a day job, scalps mornings & evenings, wants alerts that don't waste his time
- *"The journal nerd"* — wants every trade tracked, lessons surfaced, performance graded
- *"The vibe trader"* — momentum/news-driven, wants the tape's pulse + a coach to keep him disciplined

All three want the same thing: **a friend on the desk who actually knows what they're looking at**. Kai is that.

## What it does (capabilities)

### Today (already live in War Room web prototype)
- Voice-first conversation with Kai (Whisper STT → Haiku 4.5 → OpenAI gpt-4o-mini-tts onyx)
- 3D neural-orb avatar (2000-orb cloud, region pulses on tool calls)
- Live chart panel (lightweight-charts + CheatCode CCA v5 visuals — heatmap candles, EMA clouds, reversal bands)
- Kai actively draws on the chart — price levels, trend lines, fib retracements, with active add/remove during conversation
- Auxiliary panels: quote card, news, earnings, options chain (Jarvis-style animated tabs)
- Adaptive preference learning (depth modes: quick / technical / fundamental / catalysts / full)
- Conversation memory + user profile awareness

### Next 90 days (v1 of the app)
- **Push notifications** as the new home for what was SMS — alerts, daily briefs, performance reviews
- **Trade journal** auto-populated from broker positions
- **Broker connect** via SnapTrade (read positions + P&L)
- **Trade execution** for VIP+ — Kai suggests, user confirms, order goes through
- **Community intelligence panel** — anonymized aggregate of what other users are watching/asking about
- **Watchlist sync** across devices
- **Portfolio dashboard** — current positions, win rate, recent P&L

### Out of scope for v1
- Direct user-to-user chat / DMs
- Setup posting / voting / feed
- Public leaderboards / competitions
- Charting drawing by user hand (Kai draws; user tweaks via voice/text)
- Multi-broker (SnapTrade only at launch — covers most retail brokers)
- Crypto / forex (US equities + options only)
- TradingView Pine indicator support
- Desktop native app (web + mobile only)

## Tier structure

Names match existing breakout-alert-system schema (basic/pro/vip/vip+). Pricing is **TBD by Kway** — designer should treat dollar amounts as placeholder and not over-detail them on screens.

| Tier | Voice Kai | Chart + panels | Alerts | Broker exec | Community data | Mentor slots |
|---|---|---|---|---|---|---|
| **Basic** | Text only | View-only | Daily briefs | — | — | — |
| **Pro** | Voice (limited credits) | Full | Real-time | — | Read-only | — |
| **VIP** | Voice (more credits) | Full + Kai annotations | Real-time + smart filters | — | Full | — |
| **VIP+** | Unlimited | Full | All of the above + intraday | ✅ Confirm-to-execute | Full + write | ✅ |

VIP+ targeted at ~$149/mo with credit ledger (premium actions consume credits, refill monthly or pay-per-use).

## Tech stack

| Layer | Stack | Notes |
|---|---|---|
| Mobile | **React Native** (Expo SDK 53+) | One codebase, iOS + Android. Reuses TypeScript patterns from War Room. |
| Web (continued) | Next.js 16 + R3F | War Room stays at kai-warroom.vercel.app as the "desktop power-user" surface |
| Voice brain | Anthropic Claude Haiku 4.5 | War Room fork on Railway (kai-agent-warroom service). Existing prod kai-agent stays untouched for SMS. |
| Casual chat | OpenAI gpt-4o-mini | Bypass path for non-data questions |
| STT | OpenAI Whisper | Push-to-talk recording |
| TTS | OpenAI gpt-4o-mini-tts (onyx voice + style instructions) | Voice prosody |
| Data | Polygon (primary) + EODHD (fallback) | Stocks, options, news |
| Auth | Supabase Auth (phone-OTP primary, email fallback) | Phone is the canonical identifier |
| DB | Supabase Postgres | Shared with existing kai-agent — users, alerts, conversation_history, kai_alerts, alert_performance, warroom_user_prefs |
| Push | Expo Push + APNs/FCM | Replaces SMS for in-app users |
| Payments | Stripe | Subscription + credit ledger |
| Broker | SnapTrade | Read + write for VIP+ |
| 3D avatar (native) | React Native Skia / R3F via WebView fallback | Performance is the risk — fallback to a Lottie-based "stylized brain" if R3F native is too heavy |
| Chart on mobile | lightweight-charts via WebView | Same library as web. Custom-render fallback if perf bad. |
| Realtime | Supabase Realtime (websockets) | Live position updates, community data, alert delivery |

### Why React Native + WebView for chart/avatar
We get 80% of the native feel for 30% of the build cost. The two heaviest visual components (3D brain, candlestick chart) are reused via WebView wrappers around the existing web components — no rewriting them in Swift/Kotlin. RN handles the chrome (nav, panels, settings, push, broker connect).

## Backend services that already exist

These are inherited, not new — designer should know what's powering the app:

- **kai-agent** (production SMS Kai, Railway `cheatcode-kai`) — current SMS user base
- **kai-agent-warroom** (Haiku 4.5 fork, Railway) — powers War Room voice path
- **14 cron services** (morning brief, intraday alerts, weekly wrap, etc.) — generate alerts/digests
- **Supabase** project `ryprohqthwflinadqotj` — shared data store
- **Discord bot** (VIP+ signal routing — partially built)

App talks to all of these, none of them go away on launch.

## Strategic priorities (in order)

1. **Voice + chart + panels parity with War Room web** on mobile. If this works in the user's pocket, that's the value prop.
2. **Push notifications replacing SMS** — same alert flow, better delivery, no carrier costs.
3. **Broker connect (read-only)** — show the user their positions inside the app, let Kai see them and reason about them.
4. **Trade execution (confirm-to-place)** — the VIP+ moat.
5. **Community data layer** — Kai answers "what are people watching today?" / "who else is asking about MU?" using anonymized aggregates from `conversation_history` + `kai_alerts` views.
6. **Polish + retention loops** — daily briefs as the morning-coffee surface, weekly performance review.

## Success metrics

- **D7 retention** ≥ 60% (mobile finance app benchmarks are 15-25%; voice-first should beat that)
- **DAU/MAU** ≥ 0.4 (active traders use almost daily during market hours)
- **Voice messages/user/day** ≥ 3 (validates voice as primary modality vs text fallback)
- **VIP+ conversion** ≥ 15% from Pro → VIP+ within 30 days
- **Alert open rate** ≥ 70% on push (vs ~40% industry average for fintech push)

## Risks + open questions

- **R3F on iOS WebView**: 2000-orb avatar may not hit 60fps in WebView. Mitigation: Lottie-based simplified avatar for low-end devices, full R3F for capable ones. Designer should mock both.
- **Voice latency on cellular**: 1.5s on wifi is fine; on 4G with weak signal it could double. Mitigation: more aggressive speculative fillers, longer/funnier filler library.
- **Broker exec compliance**: SnapTrade handles a lot but execution is a regulated action. Need ToS + disclaimers + per-trade audit log. Probably a separate sign-off flow for VIP+ unlock.
- **SMS sunset**: existing users may resist app migration. Mitigation: SMS keeps working for 90 days after app launch; in-app deep link sent via SMS to drive install.

## Roadmap (rough)

- **Weeks 1-2** — Designer phase. Figma flows, components, screens. This doc + UX doc are the brief.
- **Weeks 3-8** — RN build. Auth → home → voice → chart panel → push → onboarding.
- **Weeks 6-10** — Broker connect + portfolio dashboard. SnapTrade integration.
- **Weeks 8-12** — Trade execution (VIP+ only) + community data panel.
- **Week 12-14** — TestFlight + Play Internal beta. 50-200 users.
- **Week 16** — Public launch.

## Brand notes for designer

- **Voice**: warm, sharp, eager, never stuffy. Kai is your guy on the desk — addresses the user by first name, uses contractions, swears occasionally on big wins. Energy is "lit up", never tired.
- **Visual**: **dark backgrounds, amber accents** (`#dca100` / `#fbbf24`), **mono fonts** (JetBrains Mono for data, Inter or Geist Sans for body), heatmap palette `#ff1e00` → `#dca100` → `#1fa237` → `#0080ff` for semantic colors (resistance / neutral / support / overbought).
- **Motion**: confident, controlled, slightly cinematic. Panels materialize (not slide). Numbers don't tick — they snap. Avatar pulses when thinking, doesn't bounce.
- **Avoid**: gradients-everywhere, glassmorphism, drop shadows, "fintech blue", playful curves. This is a power tool, not a kids' app.

## What designer needs from us before starting

- This doc ✅
- UX.md (companion) ✅
- Existing War Room URL (kai-warroom.vercel.app) for visual reference
- Brand assets package (Kai logo, CheatCode logo, palette swatches, type tokens) — to be assembled separately
- Real screen recordings of voice conversations + chart interactions on the live web prototype — designer should *use* the product before designing it
