# CheatCode AI — Design Language

> The Jarvis aesthetic bible. Sensory and feel-oriented — covers *what the product is supposed to feel like* in a way that PROJECT.md and UX.md (the structural docs) deliberately don't. Read this BEFORE opening Figma. When in doubt about a visual decision: re-read this, then decide.

---

## 1. North star

A command center on the bridge of a quiet ship at night. Lights are low, the room hums faintly, every surface is *responsive but disciplined*. The information you need glows softly when relevant, vanishes when it doesn't. A voice — calm, focused, brilliant — anticipates what you need.

That voice is Kai. The interface is his canvas.

You should never feel busy. You should feel *focused*. The app is the answer to "what does it feel like to have a Bloomberg terminal that loves you?"

---

## 2. References — study these before designing

### Film / fiction
- **Iron Man (2008) — Tony Stark's workshop HUD.** Floating holograms, amber-on-dark, panels that materialize and dissolve, Jarvis as ambient voice. The *spiritual* reference, not literal.
- **Blade Runner 2049.** Atmosphere, light through smoke/fog, scale, the way information feels carved out of the air.
- **Ex Machina (Ava's room interfaces).** Minimal, white-on-dark, glass surfaces, soft glow.
- **Westworld S1 (delos labs).** Glass + amber + diagnostic readouts.

### Real products
- **Linear.** Closest production reference. Dark, restrained, mono accents, motion that always means something.
- **Bloomberg Terminal.** For data density and the trader-feel. We're not as severe, but we honor it.
- **Vercel dashboard.** Black on black done right; restraint with subtle gradients.
- **Arc browser.** Confident chrome, things that animate in like they've always been there.

### Anti-references (things this is NOT)
- Robinhood — too friendly, too "consumer", emoji-driven, white backgrounds, playful curves
- Webull / Trading 212 — busy, gradient-everywhere, neon-pulsing
- Generic fintech — pastel greens/reds, illustration-heavy, "your financial wellness" energy
- Any app where the home screen has a marketing card

The user is a trader, not a wellness consumer.

---

## 3. Light + atmosphere

The whole product lives in a dark room. There is one ambient light: a low amber glow. Everything else is response to that glow — surfaces reflect it weakly, edges catch it, text reads against it.

- **Background**: `#05080A` (near-black with a hint of cool — not pure black, never grey)
- **Surface elevation**: layered as `#0a0f14` → `#10161b` → `#161d23` (panels float above background by tinting up, not by drop shadow)
- **Amber wash**: `rgba(220, 161, 0, 0.04)` applied to elevated surfaces — a barely-there warmth that anchors the room

**No drop shadows.** Depth comes from surface tint and 1px amber-tinted borders (`rgba(252, 211, 77, 0.08)` to `0.15`), not from blur.

**No bright white.** Pure white (`#ffffff`) appears nowhere. Text is `rgba(255, 255, 255, 0.92)` at strongest, falling to `0.55` for secondary, `0.30` for tertiary.

---

## 4. Surfaces + materials

Three material moods, used deliberately:

### Glass / blur
- Used on overlay panels (panel host, modals, push notifications)
- `backdrop-blur(18px) saturate(140%)` with `bg-[#05080A]/92`
- Edges: 1px solid `rgba(252,211,77,0.15)` on the inside-facing border (the edge nearest content), 0 elsewhere
- This is the *Jarvis material*. Use it for things that "appear" rather than "exist"

### Solid dark (anchor)
- Used for tab bars, the chrome of the app, anything always-on
- Just the elevation colors above with no blur
- Reads as *here, always*

### Amber-lit data
- Numbers, charts, status indicators
- The `#dca100` palette is the only thing that *emits*. Everything else *receives*.
- Numbers don't have backgrounds — they sit on dark with amber color and faint glow

**No glassmorphism stack**. One layer of glass, max. We're not Frutiger Aero.

---

## 5. Color story

The whole product is built from one 22-step gradient (the CCA SH1 heatmap). Every functional color comes from this single source so everything visually belongs together:

```
#ff0000 #ff0d00 #fe1e00 #fc3700 #f96200 #f57000  (red → orange — bearish, oversold)
#f07e00 #ea8a00 #e39600 #dca100 #d3ac00 #c9b600  (amber — neutral, primary brand)
#bfc000 #b3ca00 #a6d400 #97dd00 #86e600          (lime — slight bullish)
#1fa237 #1ea780 #189daf #0e89cb #0080ff          (green → blue — bullish, overbought)
```

### Functional roles

| Role | Hex | Use |
|---|---|---|
| Primary brand | `#dca100` | Kai's accent, active states, primary CTAs, the "amber wash" |
| Brand bright | `#fbbf24` | Highlights, focus rings, "this matters" moments |
| Bullish / Long / Support | `#1fa237` | Green candles, support levels, profit, up arrows |
| Bearish / Short / Resistance | `#ff1e00` | Red candles, resistance, loss, down arrows |
| Overbought / Extended | `#0080ff` | Top of reversal bands, extreme states |
| Neutral data | `#dca100` | VWAP, EMAs, "neutral" levels |
| Warm warning | `#f07e00` | Caution states, pre-alert |
| Body text | `rgba(255,255,255,0.92)` | Always |
| Secondary text | `rgba(255,255,255,0.55)` | Labels, captions |
| Tertiary text | `rgba(255,255,255,0.30)` | Disabled, hints |

**Never use**: blue-for-info, purple-for-anything, pastel greens/reds, gradient buttons, rainbow data viz. One palette, used semantically.

---

## 6. Typography

Two faces, used ritually:

### Mono (data, numbers, tickers, code, regions)
- **JetBrains Mono** (or Geist Mono as alternative — both work)
- Tabular numbers are critical — prices must align across rows
- Track wider for headers (`tracking-[0.2em]` to `0.22em`) — that uppercase-mono-spaced look that says "system readout"
- Used in ALL CAPS for labels, micro-headers, status pills
- Size scale: 9px (micro labels, tracking-[0.22em]), 11px (data rows), 14px (numbers in cards), 24px+ (hero numbers)

### Sans (body, headlines, Kai's voice transcripts)
- **Geist Sans** or **Inter**
- Used for Kai's words, body copy, button labels, descriptive text
- Mixed case, default tracking
- Size scale: 13px (body), 15px (emphasis), 20px (section headers), 32-40px (hero greeting)

### Display moments
- Kai's opening greeting and the hero number on a quote card are the only places where type gets *big*
- Display = Geist Sans at 32-40px, light weight, slightly tracked-out

**Never use**: serif (anywhere), italic (except in quoted Kai text on its own line), display fonts with personality (no Pacifico, no Lobster, no decorative).

---

## 7. Iconography

- **Lucide React** as the primary icon set — 1.5px stroke, line-based, geometric
- Stroke color: `rgba(255,255,255,0.55)` default, `#dca100` on active/highlighted
- Size: 16px in lists, 20px in headers, 24px in primary actions
- No filled icons except in single accent moments (selected tab indicator, recording state on the mic button)
- No emoji anywhere except inside user-typed messages (and even then, Kai responds in words)

---

## 8. Motion — the signature

Motion is what makes this feel like Jarvis. Get this wrong and the whole vibe collapses.

### The five rules

1. **Materialize, don't slide.** New panels don't slide in from off-screen. They *appear* — scale from 0.8 to 1, fade in opacity, with a tiny y-translate (12 → 0). It looks like the panel was always there and just became visible. Duration: 250ms. Easing: `cubic-bezier(0.22, 1, 0.36, 1)` (out-expo).

2. **Snap data, don't tick.** Numbers update by replacing in place with a single 180ms flash (color brightens, then settles). Never count up like a slot machine. Never tween. Markets are too fast for that.

3. **Stagger meaningfully.** When Kai draws levels on the chart, they appear one at a time, 700ms apart, in narration order. The chart *fills in* as he speaks. Same principle applies to news headlines (one row at a time on first load, 80ms each).

4. **Confidence in transitions.** No bounces, no springy overshoot, no playful wobble. Easing is always out-cubic or out-expo. Things arrive *decisively*.

5. **The avatar is always alive.** Idle = slow ~3s gentle breath pulse. Thinking = faster region pulses + soft amber wash intensifies. Speaking = audio-driven amplitude on the orb itself. Never freeze the avatar. If Kai is silent, he's still breathing.

### Signature animations (build a Lottie library of these)

| Moment | What | Timing |
|---|---|---|
| Panel materialize | scale 0.8→1, y 12→0, opacity 0→1 | 250ms out-expo |
| Panel dismiss | reverse + slight blur | 200ms ease-in |
| Tab swap | crossfade with 6px y-translate | 200ms ease-out |
| Chart level draw-in | line extends left-to-right + label fades after | 400ms ease-out |
| Number flash | color shifts to bright amber, settles 180ms later | 180ms ease-in-out |
| Avatar region pulse | amber peak then exponential decay | 2200ms exponential |
| Push-to-talk press | scale 1→0.95, glow intensifies | 80ms spring |
| Alert arriving (push notif) | slides down from top with subtle blur tail | 350ms out-expo |
| Mic listening state | concentric ring breath at recording amplitude | live waveform |
| Order confirmation card | slides up with weight (heavier easing) | 320ms out-quart |

### Motion = meaning

Every animation tells you what just happened. Panel appears = new info arrived. Number flashes = price changed. Region pulses = Kai is using that capability. Chart level draws = Kai just thought of that level. Designer should be able to look at a frozen frame and know what state the app is in.

---

## 9. Sound design (yes, sound)

A Jarvis feel without sound is half a product. We need a small library of subtle, designed sounds — none of them obtrusive, all of them confirming. Designer should commission or curate these (Soundsnap, Splice, or a designer like Joel Bunting).

### Voice (Kai)
- OpenAI gpt-4o-mini-tts `onyx` voice with style instructions ("mid-thirties trader, slight rasp, eager, fast pace, varied energy")
- Sample rate: 24kHz mp3 chunks
- Voice is *warm but precise* — like a senior analyst talking on a Zoom

### UI sounds (very subtle, opt-out)
- **Send (push-to-talk release)** — single soft sub-bass pulse, 80ms
- **Panel materialize** — quiet "thrum" like a hologram emitter, 250ms
- **Alert arrives** — three-note descending chime, mono-spaced (think MAY-DAY-DAY pitched warmly), 600ms total
- **Order confirmed** — single ascending tone, 400ms, confident
- **Order canceled** — single descending tone, 300ms, settling
- **Number flash on green** — barely-audible click + tiny rising tone
- **Number flash on red** — barely-audible click + tiny falling tone

### Ambient (off by default, optional)
- A 30-second loop of *war room hum* — soft drone in C, distant terminal beeps, occasional paper rustle
- Plays under conversations on Pro+ users who opt in
- Like having NPR's *Marketplace* on in the background, but ambient

**Sound is OFF by default on first launch.** Onboarding has a "try the sound design" moment that plays a single panel-materialize sound and asks "leave sounds on or off?" — user decides upfront.

---

## 10. The avatar — Kai's visual presence

The 3D neural-orb cloud (2000 orbs, R3F) is the protagonist of the visual identity.

### Visual character
- A constellation of soft amber orbs forming a brain-like shape that gently rotates
- Subtle synapse arcs between nearby orbs — these light up when Kai's "regions" fire
- Eight semantic regions inside the cloud: memory, market, technicals, alerts, watchlist, users, news, options — each has a spatial location in the cloud
- When Kai uses a tool, the region for that tool pulses brighter and longer — you can *watch him think*

### States
- **Idle (no conversation)**: slow breath pulse, amber wash at 50% intensity, all regions quiet
- **Listening (mic recording)**: cloud tightens slightly, amber intensifies on the rim, no region activity
- **Thinking (tools running)**: regions pulse in sequence as tools fire; amber wash intensifies; subtle synapse cascade
- **Speaking**: audio-driven amplitude — the cloud breathes with Kai's voice; brightest amber; region activity quiets
- **Alert/excited**: amber gets a hint of `#fbbf24` (brighter); a single ripple expands outward from center; held for the duration of the punctuation

### What it should NEVER do
- Bounce like a Slack icon
- Have eyes / face / expression — it's a *mind*, not a character
- Animate on schedule (timer-driven) — only animates in response to state
- Use any color outside the palette
- Use anime/cartoon shading — it's a *cloud of light*

### Performance fallback (mobile)
- On lower-end devices, swap the 2000-orb R3F cloud for a Lottie-rendered "abstract orb with region rings" — same color, same behaviors, fewer particles. Detect via WebGL perf check on first load. Designer should mock both.

---

## 11. Anatomy of a moment

Designer should sketch these in detail — they're the make-or-break feel checks.

### A. Opening the app on a market morning
- 0ms: app launches, dark background fades in (200ms)
- 200ms: avatar appears via materialize animation (250ms)
- 450ms: amber wash settles, idle breath begins
- 500ms: Kai's first words start playing: *"Morning, Kway."* (audio fade-in 100ms)
- ~1500ms: morning brief continues, region pulses fire as Kai's tool calls execute
- Bottom tab bar fades in last (after 800ms) — it's chrome, not the moment

### B. Asking "what about MU"
- 0ms: user releases push-to-talk
- 100ms: amber pulse fades from button, mic icon dims
- 300ms: filler audio begins ("yeah Kway, MU — let me pull the levels real quick")
- 800ms: regions begin pulsing as tools fire (technicals, market)
- 1500ms: chart panel materializes (250ms) showing MU
- 2200ms: first chart level draws in (line extends, label fades)
- 2900ms: second level
- 3600ms: third level
- ~4500ms: Kai's real reply begins ("MU's holding the 50-day with rising volume — above the next line you're looking at a real swing")

### C. An alert arriving
- Background event: push notification fires natively (system handles)
- User taps notification
- App opens to Home (cold start) OR refocuses (warm)
- Avatar already speaking by the time visual chrome settles: *"Hey Kway — MRAM just broke."*
- Chart materializes mid-sentence
- Breakout level draws in synced to the word "broke"
- Two action chips fade in below avatar: **trade it** | **add to watchlist**

### D. Order confirmation
- User: "send it"
- Kai voice: *"Sending fifty MRAM at 5.10..."*
- Order card slides up from bottom with weight (320ms out-quart)
- Confirmation tone plays as card settles
- Card shows live status: PLACING → ROUTING → FILLED
- On FILLED: card flashes amber briefly, then settles to filled state
- Kai voice: *"Done — filled at 5.10. I'll watch it for you."*
- Card stays visible for 8 seconds, then minimizes to a small chip in the corner

---

## 12. What this is NOT — anti-patterns

Designer should review this list every time they're tempted by a flourish:

- ❌ Gradient backgrounds (purple-to-pink, blue-to-cyan, anything)
- ❌ Glassmorphism stacks (more than one layer of blur)
- ❌ Drop shadows of any kind
- ❌ Emoji in UI copy (user input only)
- ❌ Illustrations of people / things / "trading buddies" — no characters
- ❌ Confetti, celebrations, "you're a star!" microcopy
- ❌ Tooltips with personality ("hey! 👋 click here to...")
- ❌ Empty-state cartoons or mascot characters
- ❌ Loading spinners (use skeletons that match the panel shape)
- ❌ Toast notifications floating in mid-screen — Kai *tells* the user via voice + the relevant panel updates
- ❌ Modal dialogs blocking the app for confirmations — use bottom sheets that don't grab focus
- ❌ Carousels of feature highlights on home
- ❌ "Pro tips" floating cards
- ❌ Numbered tutorial overlays
- ❌ Star ratings for anything Kai-related
- ❌ "Trending now" UI patterns
- ❌ Reaction emoji on chart annotations

The product never asks for the user's attention with personality. It earns it with usefulness.

---

## 13. Designer checklist (before any screen ships)

For every screen / state, ask:

- Does it feel like a tool a serious trader would respect at 3am?
- Could a stranger glance at it and instantly know what state the app is in?
- Is the amber being earned (highlights what matters) or just decorative?
- If you hid Kai's voice, would the visual *still* tell the right story?
- Is every animation telling you something happened, or is it just there for flavor?
- Does it sound like Jarvis when paired with the voice + UI sounds?
- Would the designer at Linear or Vercel ship this screen?

If any answer is shaky, the screen isn't done.

---

## 14. Deliverables checklist for designer

Beyond the per-screen Figma files (already specced in UX.md), this aesthetic doc requires:

- [ ] **Sound library** — 8 UI sounds + 1 ambient loop, royalty-free or commissioned, delivered as .mp3 + .ogg for cross-platform
- [ ] **Lottie animation library** — at minimum: panel materialize, panel dismiss, alert arriving, order confirmation, avatar region pulse (8 variants, one per region), number flash green/red, mic recording ring
- [ ] **Avatar reference renders** — at least 6 hero frames showing idle / listening / thinking (3 levels) / speaking / excited states, plus the Lottie fallback for low-perf devices
- [ ] **Brand assets** — Kai logo (mark only + wordmark + lockup), CheatCode logo, app icon (with Apple/Google sizing), splash screen
- [ ] **Brand video** — 30-second mood film cutting between actual product screens + film references + ambient music — used for marketing AND as the internal "this is what we're building" reference
- [ ] **Component library Figma** — every atom + molecule + organism with all states, motion notes per component

---

End of design language. Cross-references: PROJECT.md (scope/tech), UX.md (screens/flows). Live web prototype: kai-warroom.vercel.app — designer should use it.
