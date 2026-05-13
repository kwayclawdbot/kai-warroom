# CheatCode AI — UX Doc

> Companion to **PROJECT.md**. Captures screens, flows, components, and interaction patterns. Designer should treat this as a structural brief, not a visual spec — pixel decisions live in Figma. When in doubt, default to the **War Room Jarvis aesthetic** (dark, amber, mono, cinematic motion).

## Design pillars

1. **Voice-first, screen-when-it-matters.** Default modality is speak-and-listen. The screen reinforces what Kai says — it doesn't compete with him. When Kai mentions a level, the level appears on the chart. When he mentions news, the news panel materializes.
2. **Calm in the chaos.** Markets are volatile. The app shouldn't add to that. Numbers snap, don't tick. Motion is confident, not jittery. Color is purposeful, not decorative.
3. **One thing visible at a time on mobile.** Phone screens are small. Don't stack five panels. Tabs let users move between views — only the active one renders.
4. **Trust through transparency.** When Kai uses a tool, the avatar pulses the region (memory, market, technicals, alerts). User sees Kai *think*. When he draws on the chart, the level animates in synced to his voice.
5. **Kai is the protagonist.** The avatar is always visible (or one tap away). Settings, billing, profile — those are accessed *from* Kai, not parallel to him.

## Sitemap

```
App root
├── (auth)
│   ├── Sign in (phone OTP, fallback email)
│   └── Onboard (5-screen voice intro)
│
├── Home (Kai voice screen) — DEFAULT TAB
│   ├── Avatar (full screen, panels overlay)
│   ├── Push-to-talk button (bottom center)
│   ├── Caption strip (optional, off by default per existing decision)
│   ├── Panel host (right side / bottom sheet on mobile)
│   │   ├── Chart panel
│   │   ├── Quote card panel
│   │   ├── News panel
│   │   ├── Earnings panel
│   │   ├── Options chain panel
│   │   └── (future) Portfolio panel
│   └── Recent conversation drawer (swipe down)
│
├── Alerts — TAB
│   ├── Today
│   ├── This week
│   ├── Performance (P&L on alerts user took)
│   └── Detail screen (per alert)
│
├── Watchlist — TAB
│   ├── List of tickers (drag-reorder)
│   ├── Tap → opens Home with that ticker pre-loaded
│   ├── + Add (search)
│   └── (per ticker) Mini chart + Kai note from last conversation
│
├── Portfolio — TAB (Pro+ only)
│   ├── Connected broker badge + sync state
│   ├── Open positions (live P&L)
│   ├── Recent closes (last 30 days)
│   ├── Performance stats (win rate, avg R, best/worst)
│   └── Connect broker flow (SnapTrade OAuth)
│
└── Profile — TAB
    ├── Account (phone, email, subscription tier)
    ├── Voice preferences (default depth: quick/technical/full/etc)
    ├── Notification preferences (which alerts, which hours)
    ├── Privacy + data export
    ├── Billing (Stripe portal)
    └── Sign out
```

Bottom tab bar: **Home · Alerts · Watchlist · Portfolio · Profile**.

## Core flows

### 1. First-time onboard (5 screens, ~90 seconds)

1. **Welcome** — Kai voice greeting plays automatically while a single line animates in: *"Hey. I'm Kai — your trading desk in your pocket. Let's get you set up in two minutes."* (CTA: tap to continue)
2. **Phone** — phone number + OTP (no email required to start). Phone is the canonical user ID, matches existing kai-agent users table.
3. **Tier select** — Basic / Pro / VIP / VIP+. Each card: 3-line description + price + "what's gated" pill. Stripe checkout opens for paid tiers; Basic continues free.
4. **Voice preferences** — 3 questions, voice-answered if user wants: *"What's your trading style — swing, intraday, or long-term?"* / *"Do you usually want quick takes, full breakdowns, or specific angles?"* / *"What sectors do you watch most?"* Stored in `warroom_user_prefs`.
5. **Permissions** — push notifications + microphone. Voice playback explains why each is needed. Skip allowed but flagged.

Skip onboarding entirely → defaults applied, user lands on Home with a Kai message: *"Set up your prefs anytime — for now we'll figure it out as we go."*

### 2. Daily routine (the morning surface)

User opens app → push notification deep-link OR fresh open. Kai immediately:
1. Greets by name + market state ("Morning Kway, the tape's choppy")
2. Surfaces the morning brief (1-2 sentences spoken aloud, optional panel for full text)
3. Flags any overnight watchlist movement: "MRAM up 6% premarket. Want me to pull it up?"
4. Listens for the next ask

Avatar idle state shows gentle pulsing — never frozen.

### 3. Voice conversation (the core loop)

Push-to-talk button at bottom center. Hold to record, release to send. Spacebar/long-press for the same on desktop web.

While Kai works (1.5–8s):
- Contextual filler audio plays first (~1.5s — "yeah Kway, NVDA — pulling the levels real quick")
- Avatar pulses regions live as Kai's tools execute (memory / market / technicals lights)
- If a panel is relevant, it materializes mid-thought
- Real reply audio queues seamlessly after filler

User can interrupt by holding push-to-talk again (cancels Kai's current speech).

### 4. Receiving an alert (replaces SMS)

Push notification fires: *"BREAKOUT — MRAM 4.85 → 5.20, +7.2% on 3x vol. Tap to see chart."*

Tap → opens app → lands on Home with:
- Kai voice playing: *"Hey Kway — MRAM just broke. Want me to walk you through it?"*
- Chart panel pre-opened on MRAM with the breakout level marked
- Quote card materialized with current stats

Three actions visible: **trade it**, **add to watchlist**, **ignore**. (Trade it gated for VIP+; for others it's a "set price alert" instead.)

### 5. Trade execution (VIP+ only)

User asks Kai: *"set me up to buy MRAM at 5.10 with a stop at 4.80, target 5.80, half-size"*

Kai responds:
1. Voice: *"Got it. Long MRAM, fifty shares, in at 5.10, stop at 4.80, target 5.80. That's a thirty-cent risk for a seventy-cent payoff — about 2.3R. Want me to send it?"*
2. **Order Confirmation Card** materializes — shows entry / stop / target / size / risk / R-multiple / estimated commission. Two big buttons: **SEND** (amber, confirm) / **CANCEL** (subtle, grey).
3. User confirms → Kai voice: *"Sent. You're filled at 5.10 — entered at the bid. I'll let you know when something matters."*
4. Position now visible in Portfolio tab.

No tap-to-send is ever silent. Every order has a voice confirmation + visual receipt.

### 6. Connecting a broker (one-time, Pro+ for read, VIP+ for write)

From Portfolio tab → "Connect broker" → SnapTrade OAuth flow opens in WebView → user logs into their broker → SnapTrade returns auth code → app stores tokens → positions sync within 60s.

Kai narrates the journey: *"Connecting your broker now. I'll have your positions in about a minute."* On completion: *"You're hooked up — twelve open positions, looks like you're long semis. Anything you want me to dig into?"*

## Screen specs

For each screen, designer should produce: dark + (where listed) light variant, mobile portrait + tablet portrait + landscape. Define empty / loading / error states for each.

### Home (Kai voice screen)

**Always visible**:
- Avatar — fills ~60% of screen height in idle, recedes when panels open
- Push-to-talk button (FAB) — 72pt diameter, amber filled when ready, pulsing when recording, dimmer when Kai is speaking
- Top status strip — current ticker context (if any), micro indicators (mic permission, connection state)
- Bottom tab bar (hide on full-screen panels)

**On Kai speaking**:
- Subtle audio-driven brain pulsation (already wired)
- Region pulses for tool calls (memory / market / technicals / alerts / watchlist / users / news / options)
- No caption strip by default (per existing decision); user can enable in Profile

**When panel opens**:
- Right side on tablet/landscape: 46vw panel slides in (existing web behavior)
- Bottom sheet on phone portrait: 70% screen height, swipe down to dismiss, tab strip at the top
- Avatar shrinks to a 120pt orb in the top-left corner — still pulsing, still primary

**Empty state**:
- Just avatar + greeting bubble: *"Tap and hold to talk."*

### Panels (chart, quote card, news, earnings, options chain)

Each panel:
- 8pt padded header with: panel icon + title + ticker badge + close X
- Body scrollable when overflowing
- Empty/loading: skeleton matching the panel's structure (not generic spinners)
- Error: amber-tone warning with retry button

Tab strip when multiple panels open:
- Horizontal scroll on mobile (already implemented on web)
- Active tab highlighted with amber underline + subtle glow
- New tabs materialize with the existing motion (scale + y-translate)

### Alerts list

- Each row: amber pulse dot if unread, ticker + setup type (BREAKOUT / VWAP RECLAIM / TREND CHANGE / etc), one-line context, mini sparkline, time-ago
- Pull-down to refresh
- Swipe left → archive / dismiss
- Tap → detail screen with the full chart + Kai's reasoning + "what to do" CTA

### Alert detail

- Chart pre-marked with the alert level
- Kai's reasoning (text + tap-to-listen voice)
- Performance pill if alert was triggered hours/days ago (PEAK / TARGET HIT / STOPPED / OPEN)
- Action buttons: **chat about it** (returns to Home with this alert as context) / **set price alert** / **add to watchlist**

### Watchlist

- Each row: ticker, current price, day change %, mini sparkline, Kai's last note (e.g., *"Was watching this for the 50-day bounce — still in play"*)
- Tap → opens Home with this ticker pre-loaded as the conversation focus
- Long-press → reorder / remove
- + button → search modal (Polygon symbol search)

### Portfolio (Pro+)

- Top stat card: total day P&L, total open positions, win rate (30d)
- "Connected: Robinhood ✓ — synced 2m ago" pill
- Open positions list — same row pattern as Watchlist + P&L column color-coded
- Recent closes list (collapsible)
- "Ask Kai about my portfolio" CTA — voice-launches a conversation seeded with portfolio context

### Profile

- Standard list of settings sections
- Tier badge prominent at top (Basic / Pro / VIP / VIP+) with upgrade CTA if not VIP+
- Voice preferences section drives `warroom_user_prefs` table — depth default, time horizon, sectors of interest
- Notification preferences: which alert types fire push, quiet hours, do-not-disturb during market hours toggle
- Privacy: "What Kai remembers about me" — viewable, editable, deletable
- Sign out

## Component library

### Atoms
- **PALETTE**: dark backgrounds (`#05080A`, `#0a0f14`), amber accents (`#dca100`, `#fbbf24`), heatmap semantic colors (red `#ff1e00`, amber `#dca100`, green `#1fa237`, blue `#0080ff`)
- **Typography**:
  - Mono (data, numbers, ticker symbols): JetBrains Mono
  - Sans (body, headlines): Geist Sans or Inter
  - Display (Kai's greeting, hero moments): Geist Sans Bold or a custom display face
- **Iconography**: line icons, 1.5px stroke, amber stroke on dark — Lucide React-style. No emoji except in user input.

### Molecules
- **Tab pill** (panel host) — rounded top corners, amber border on active, icon + label + ticker badge + close X
- **Quote row** (watchlist/portfolio) — ticker / mini sparkline / price / change %
- **Alert card** — type badge / ticker / level / mini chart / age
- **Order confirmation card** — entry / stop / target / R-multiple / commission + Send/Cancel
- **Tier badge** — pill with tier name, amber for paid, dimmer for Basic
- **Region indicator** — small orb that lights when a brain region pulses (for users who want a quieter visual of what Kai is doing)

### Organisms
- **Avatar canvas** — full-bleed neural orb + audio-driven pulsing + region overlays
- **Panel host** — tab strip + active panel body with crossfade
- **Chart panel** — lightweight-charts canvas + drawing overlay + bottom controls (timeframe, indicators toggle)
- **Voice conversation history** — drawer showing last N turns of text + ability to replay individual messages

## Motion principles

- **Materialize, don't slide.** New panels appear via scale + opacity + slight y-translate (`scale 0.8 → 1`, `y 12 → 0`, opacity, 250ms cubic-bezier `[0.22, 1, 0.36, 1]`). Already proven in War Room.
- **Snap data, don't tick.** Numbers update by replacing in place (with optional flash on green/red), not by counting up.
- **Avatar is always alive.** Idle pulse (slow), thinking pulse (faster, regions firing), speaking (amplitude-driven). Never static.
- **Chart annotations stagger.** When Kai draws levels, they appear one at a time ~700ms apart synced to his voice. Don't dump them all at once.
- **Push notifications animate in** as a top-of-screen pill that taps to expand. Don't use the system banner alone — claim the moment.

## Animation timings (reference)

| What | Duration | Easing |
|---|---|---|
| Panel tab materialize | 250ms | `cubic-bezier(0.22, 1, 0.36, 1)` |
| Panel body crossfade | 200ms | ease-out |
| Chart level stagger | 700ms / line | linear (sequential) |
| Avatar region pulse | 2200ms peak-decay | exponential decay |
| Push-to-talk press | 80ms scale 1 → 0.95 | spring |
| Number flash on update | 180ms | ease-in-out |
| Tab swap | 200ms | ease-in-out |

## Accessibility

- **Voice-first means screen-reader-first.** Every Kai message is real text in addition to audio.
- **Dark mode is the default**, but text contrast must clear WCAG AA against the `#05080A` background. Amber `#dca100` on dark passes; lighter accent yellows may not.
- **Push-to-talk has a tap alternative** for users who can't long-press (toggle on/off via single tap mode in Profile).
- **Caption strip option** — turning it on shows Kai's spoken words as scrolling text, large mono.
- **Color is never the only signal** — every red/green has an icon or label paired.

## Community data layer (no peer features)

Per current scope, no chat or social feed. Community surfaces as **anonymized aggregate intelligence** Kai can query:

- *"What are people watching today?"* → top 5 tickers by conversation_history mentions in last 24h
- *"What's the chatter on AMKR?"* → count of users asking + a sentiment summary ("12 users discussing, mostly bullish on the earnings setup")
- *"Anyone else taking this play?"* → count of users with a similar position (broker-connected aggregate)

Surfaced via:
1. **A "Users" region** in Kai's avatar (already wired) — pulses when Kai queries community data
2. **A future Users panel** — when invoked, shows the top-N tickers / themes / questions trending in the community in the last hour/day
3. **Inline in Kai's voice replies** — *"You're not alone on this one, Kway — eight other VIPs are watching MRAM today."*

Anonymity is non-negotiable. No usernames, no profile pictures, no DMs. The community is a *data layer*, not a *room*.

## What to deliver in Figma

Designer output should include:

1. **Brand foundation** — palette swatches, type tokens, motion tokens, icon set
2. **Component library** — every atom + molecule + organism listed above, with all states (default / hover / active / disabled / loading / error)
3. **Screen designs** — every screen in the sitemap, dark + light (where applicable), portrait + landscape
4. **Flow specs** — onboarding, daily-open, voice conversation, alert tap, order confirmation, broker connect — each as a connected Figma frame sequence with arrows
5. **Empty / loading / error states** — for every panel and list
6. **Animation references** — for the motion principles, link Lottie examples or Principle/Rive prototypes where the canvas alone can't show timing
7. **Tablet + landscape variants** — at minimum for Home, Chart panel, Portfolio

## What we'll iterate on after first Figma pass

- Whether the avatar should also live in Alert and Portfolio screens (currently planned as Home-only with a small orb in nav)
- Caption strip default — off vs minimal-on
- Push notification rich preview format
- Tier upgrade prompts — where they appear, how aggressive

---

End of UX doc. Cross-references: PROJECT.md for scope/tech/strategy. Live web prototype: kai-warroom.vercel.app.
