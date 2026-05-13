# CheatCode AI — Design Language

> The aesthetic bible. Sensory and feel-oriented — covers *what the product is supposed to feel like* in a way that the structural docs (PROJECT.md, UX.md) deliberately don't. Read this BEFORE opening Figma.

---

## 1. North star

A late-night cigar lounge. Warm low light. Your best friend — the one who happens to be a brilliant trader — sitting across from you, glass of whiskey on the table, charts spread out, asking what you want to look at tonight. There's music humming somewhere distant. The room *knows you*: your jacket is on the chair you always sit in, the speakers play what you like, the lighting is already set.

That's the feel. Not Bloomberg. Not a sci-fi command center. **A relationship rendered as a product.**

Kai is the friend. The interface is the room you're in together. Dark, yes — but the dark of a candlelit den, not a server room. Amber, yes — but the amber of whiskey and warm wood, not industrial alerts. Information appears when you'd want it, dissolves when you don't, and the room never feels empty between exchanges.

**You should never feel like you're using a tool. You should feel like you're with someone who has your back.**

---

## 2. References — study these before designing

### Spaces (physical references — these matter more than apps)
- **Speakeasy bars** — intimate, dimly lit, amber lighting, leather, warm wood. Soho House lounges. The kind of room that makes you exhale when you walk in.
- **Architects' studios at night** — drafting tables under task lights, dark surroundings but warm focus zones, materials laid out organized but lived-in.
- **A friend's apartment for whiskey night** — not staged, not professional, but cared for. Personal.
- **Late-night radio studios** — the warmth of an "On Air" sign, soft glow on the host's face, headphones, a single guest across the table.
- **Tea houses** — minimal, dark, but inviting and human. Restraint with warmth.

### Apps / products (digital references)
- **Granola** (AI meeting notes) — warm dark mode, friendly typography, personality without being childish.
- **Things 3 / Linear (the softer parts)** — restraint in dark mode, but a real human shaped these screens.
- **iA Writer in dark mode** — calm, focused, deeply warm despite being mostly dark/grey.
- **Notion's dark mode** — proof that dark can feel inviting, not industrial.
- **Headspace** — the only meditation app to pull off "calm and personable" simultaneously. Their amber/orange palette is a useful tonal cousin.
- **The Browser Company's Arc** — confident chrome with warmth, design that has *a point of view*.

### Films / atmosphere
- **Lost in Translation** (Sofia Coppola) — neon and intimacy, late-night warmth in a foreign city.
- **Iron Man (the relationship moments)** — Tony in the workshop, talking to Jarvis like a friend. The *interaction*, not the hologram screens.
- **In Bruges** — bar interiors, amber warmth, two friends in conversation.
- **Black Mirror "San Junipero"** — warm interior lighting, intimacy.

### Anti-references (study these to know what we are NOT)
- **Bloomberg Terminal** — too severe, too dense, too "professional cold". We respect what it does for traders, but it doesn't have a heart.
- **Webull / Trading 212 / generic stock apps** — gradient-everywhere, neon-pulsing, "engagement-bait" interfaces.
- **Robinhood** — too consumer, too "fintech for kids", emoji-driven, white backgrounds.
- **Most AI assistants** (ChatGPT, Claude.ai web) — sterile, dialog-box-on-white, no presence, no warmth.
- **Casino/gambling UIs** — anything that uses bright colors to manufacture excitement.

What unites the anti-references: they don't feel like a place a person would *want to be*.

---

## 3. Light + atmosphere

The whole product lives in a warm dark room. The lighting source is not a screen — it's a candle, or a low pendant lamp, or firelight. Whatever it is, it casts amber.

- **Background** — `#0a0805` (warm near-black, hint of brown undertone; *never* the cool blue-black of an iPhone settings screen)
- **Surface elevation** — `#10120E` → `#161812` → `#1c1f17` (each step adds a hair more warmth and a hair more brightness)
- **Amber wash** — `rgba(220, 161, 0, 0.06)` painted over elevated surfaces, especially in corners and behind the avatar. A barely-there warmth that says "this room is alive."
- **A single warm vignette** at the screen edges in major moments (avatar idle, panel materialization) — `radial-gradient` from `rgba(220, 161, 0, 0)` at the center to `rgba(0, 0, 0, 0.3)` at the corners. Pulls focus toward the warmth in the middle.

**Soft shadows are allowed** when they earn their keep — but they're always *warm-tinted* (`rgba(220, 161, 0, 0.08)`), not the standard cool grey of "Material Design 4dp elevation." Shadows feel like *light cast by a candle*, not a fluorescent panel.

**No bright white anywhere.** Pure white feels like a clinical bathroom. Strongest text is `rgba(255, 245, 230, 0.94)` — a hair of warmth even at 94% alpha. Secondary text `rgba(255, 245, 230, 0.62)`. Tertiary `0.36`.

---

## 4. Surfaces + materials

Three material moods, used deliberately:

### Warm glass
- Used on panels (chart, news, quote card, etc.)
- `backdrop-blur(20px) saturate(120%)` over `bg-[#0a0805]/88`
- The blur is gentle, not "frosted glass at a club." Think *condensation on a window in a warm room*.
- Edges: 1px solid `rgba(220, 161, 0, 0.15)` on the leading edge only. The rest of the panel fades into the room.
- Rounded corners: `border-radius: 14px` (not 4px, not 0px — 14px reads as *touchable* and *cared for*).

### Cozy dark (the room)
- The app chrome — tab bar, navigation, the dark behind the avatar
- Solid colors from the elevation stack, no blur
- Reads as *the space we're in together*.

### Honey light (data, accents)
- Numbers, ticker symbols, charts, status indicators
- The amber palette is the only thing that *emits light*. Everything else *receives*.
- Numbers carry a faint glow (`text-shadow: 0 0 12px rgba(220, 161, 0, 0.2)` on hero numbers) — like reading a price tag under a warm pendant.

**One layer of blur, max.** No glassmorphism stacks. The room is dim — that does the atmospheric work. Blur is a special-occasion treatment, not a default.

---

## 5. Color story

The whole product is built from the CCA SH1 heatmap palette. But the *feeling* of this palette is honey and whiskey, not industrial alert systems.

```
#ff0000 #ff0d00 #fe1e00 #fc3700 #f96200 #f57000  (deep red → glowing ember)
#f07e00 #ea8a00 #e39600 #dca100 #d3ac00 #c9b600  (amber → honey — the brand zone)
#bfc000 #b3ca00 #a6d400 #97dd00 #86e600          (warm lime — sunlight through glass)
#1fa237 #1ea780 #189daf #0e89cb #0080ff          (forest green → twilight blue)
```

When designer thinks "amber" they should think *whiskey-aged-in-oak* and *late-afternoon sun through a cabin window*. Not *traffic light* or *factory warning*.

### Functional roles

| Role | Hex | Use |
|---|---|---|
| Brand primary | `#dca100` | Kai's accent, active states, primary CTAs, the room's warmth |
| Brand bright | `#fbbf24` | "This is special" moments — wins, key levels, focus rings |
| Bullish / Long / Support | `#1fa237` | Forest green — alive, steady, the right side of a setup |
| Bearish / Short / Resistance | `#ff1e00` | Glowing ember red — heat, intensity, careful |
| Overbought / Extended | `#0080ff` | Twilight blue — *unsustainable, watch out* |
| Warm neutral data | `#dca100` | VWAP, EMAs, "neutral" levels |
| Warm warning | `#f07e00` | Caution states — like seeing a candle flicker |
| Body text | `rgba(255, 245, 230, 0.94)` | Always slightly warm, never pure white |
| Secondary text | `rgba(255, 245, 230, 0.62)` | Labels, captions |
| Tertiary text | `rgba(255, 245, 230, 0.36)` | Disabled, hints |

**Never use**: blue-for-info, purple-for-anything, pastel-anything, gradient buttons, rainbow data viz, traffic-light reds/greens. One palette, used semantically — but always *warm*.

---

## 6. Typography

Two faces with personality:

### Sans (the voice of the product)
- **Geist Sans** — warm humanist sans with personality, designed by Vercel but feels like Apple
- This is the *primary* face — Kai's words, body copy, button labels, headings
- Mixed case, real punctuation, contractions everywhere
- Size scale: 14px (body), 16px (emphasis), 22px (section headers), 34-42px (hero greeting)

### Mono (the data face)
- **JetBrains Mono** — tabular numbers, predictable spacing
- Used for: numbers, ticker symbols, code, "system readout" labels (UPPERCASE with `tracking-[0.2em]`)
- Mono is supporting cast, not the lead. It's the *Bloomberg ghost* but used sparingly so the room doesn't feel like a terminal.
- Size scale: 10px (micro labels in caps), 12px (data rows), 14px (data in cards), 28px+ (hero numbers)

### Voice moments
- Kai's first greeting on app open: 34-42px Geist Sans Light, generously tracked, like text on a poster you're proud of
- "Wins" moments (a trade closed at a target): a brief 28px display moment with warmth

**Never use**: serif (we'd feel like a newspaper), italic-for-style (italic only inside literal quotes from Kai), decorative display faces, all-caps for body text (only for tiny mono labels).

---

## 7. Iconography

- **Lucide React** stroke icons — 1.5px stroke, geometric but with rounded line-caps (`stroke-linecap: round`) for warmth
- Default color: `rgba(255, 245, 230, 0.62)`
- Active/highlighted: `#dca100` with a faint amber glow on the stroke
- Size: 18px in lists, 22px in headers, 26px in primary actions
- Filled icons appear only in: selected-tab indicator, recording-active state, "fire" alerts (a single subtle flame icon)
- Custom icon set commissioned for the brand: Kai's mark, the neural-orb glyph, the "panel" glyphs (chart, news, earnings, options) — all with the same warm-stroke personality

---

## 8. Motion — the signature

Motion makes this feel like the room is *alive*. Get this wrong and the app feels like dead software.

### The five principles

1. **Materialize, like memory surfacing.** New panels don't slide in from off-screen — they *appear*, like a thought you just had. Scale 0.85 → 1, opacity 0 → 1, slight y-translate 10 → 0. Duration 300ms. Easing: `cubic-bezier(0.34, 1.20, 0.64, 1)` — a *gentle* overshoot, like settling into a chair.

2. **Snap data, don't tick.** Numbers update in place with a soft amber pulse (180ms color flash). Never a slot-machine ticker. Markets are too quick for cute, and you respect the user's pattern-matching brain.

3. **Stagger like conversation.** When Kai draws levels on the chart, they appear one at a time, ~700ms apart, in narration order. The chart fills in as he speaks — like a friend pointing things out as he describes them.

4. **Breath, always.** The avatar never freezes. Idle = slow 3.5s breath pulse. Thinking = faster breath + region warmth. Speaking = audio amplitude on the cloud. Silence has its own life.

5. **Exhale at the end of moments.** Order filled → confirmation card settles with a softer ease-out and a brief amber wash. Setup spotted → avatar flares warm for a beat before returning to idle. The product *enjoys* the user's wins.

### Signature animations (build a Lottie library of these)

| Moment | What happens | Timing |
|---|---|---|
| Panel materialize | scale 0.85→1, y 10→0, opacity 0→1 | 300ms gentle overshoot |
| Panel dismiss | scale to 0.92 + opacity → 0 + soft blur | 240ms ease-in |
| Tab swap | crossfade with 6px y-translate | 220ms ease-out |
| Chart level draw-in | line extends left-to-right + label fades after | 450ms ease-out |
| Number flash | amber pulse on update, then settles | 200ms ease-in-out |
| Avatar idle breath | slow size + amber amplitude rise/fall | 3.5s, infinite |
| Avatar region pulse | warm amber peak, exponential settle | 2400ms exponential |
| Push-to-talk press | scale 1→0.94, warmth intensifies | 100ms spring |
| Alert arriving | warm pill drops from top edge with bloom | 380ms gentle overshoot |
| Order confirmation | card settles up with weighted ease | 320ms ease-out-quart |
| Win moment | brief screen-wide warm wash + amber bloom | 600ms (one-time per event) |

### Motion = meaning + warmth

Animation isn't decoration. Every motion confirms something happened *and* communicates that the room cares. A new panel doesn't slide in — it shows up *for you*. A number doesn't tick — it *acknowledges* you saw it. The avatar doesn't sit static — it *breathes with you*.

---

## 9. Sound design

A personable Jarvis without sound is half a product. We need a small library of subtle, warm, designed sounds. None of them obtrusive, all of them feeling like *the room responding to you*.

### Voice (Kai)
- OpenAI gpt-4o-mini-tts `onyx` voice with style instructions ("warm, eager, slight rasp like he's been talking all morning, mid-thirties trader-friend, addresses you by first name, varied pacing")
- Voice is the personality of the room — not narration. He breathes audibly, occasionally chuckles, uses contractions and short fragments.

### UI sounds (subtle, opt-out)
- **Send (push-to-talk release)** — a soft warm thrum, like a wooden door closing
- **Panel appears** — a brief "ahh" — like the warmth of a fireplace catching, 280ms
- **Alert arrives** — three warm notes, like a friend tapping the table to get your attention (not three sharp beeps)
- **Order confirmed** — a single ascending tone, deep and confident — like the sound of a stamp on paper
- **Order canceled** — a single descending tone, settling — like setting a glass down
- **Number flash on green** — a soft warm tone (almost subliminal), barely-there
- **Number flash on red** — a slightly lower warm tone, calm not alarming
- **Win moment** — a single resonant chime, warm, held — like a wineglass being raised

Avoid: any sound that's bright, high-pitched, digital-y, or "notification-app energy." Every sound should pass the "would this sound bad in a quiet library?" test — *quietly*, yes; *jarringly*, never.

### Ambient (off by default, opt-in)
- **War-room hum is dead.** Replace with **"den at night"**: 45-second loop of faint rain on a window, distant city sounds (one car passing every 20s), the soft pop of a fireplace, occasional creak of leather. Like sitting in a den when it's quiet outside.
- Plays under conversations for users who opt in. Stops automatically during Kai's voice playback.

Sound is **off by default on first launch.** Onboarding has a moment that plays the "panel appears" sound and asks: *"want the room to make sounds when things happen?"* — user decides upfront.

---

## 10. The avatar — Kai's presence

The 3D neural-orb cloud (2000 orbs, R3F) is the *visual body* of Kai. It's not just a graphic — it's the way you sense he's there with you.

### Visual character
- A constellation of warm amber orbs forming an organic, brain-like shape that gently drifts
- The orbs catch warmth differently — some glow stronger, some are nearly out — like a fire that's *settled but alive*
- Subtle synapse arcs between nearby orbs light up when Kai's regions fire
- Eight regions inside the cloud (memory, market, technicals, alerts, watchlist, users, news, options) — each has a soft spatial location

### States
- **Idle** — slow 3.5s breath pulse, amber wash at 50%, occasional single-orb flickers (like distant thoughts), region activity quiet. The cloud is *present, not asleep*.
- **Listening (mic recording)** — cloud tightens almost imperceptibly, amber on the rim warms, an inner ring of orbs subtly tracks your audio amplitude. Like a friend leaning in.
- **Thinking (tools running)** — regions warm in sequence as tools fire, the whole cloud's amber wash deepens slightly. You're watching him *consider*.
- **Speaking** — audio-driven amplitude on the orbs themselves; the cloud "breathes" with his voice; one or two orbs near the speaking region brighten with the cadence. He has a *voice and a body*.
- **Excited / win moment** — a single ring of warmth expands outward from center, the cloud's amber brightens to `#fbbf24` for ~600ms, then settles back. Earned, not constant.

### What it should NEVER do
- Bounce, wobble, or have springy personality animation. Kai is calm.
- Have eyes / face / mouth — he's a *mind*, not a cartoon character
- Animate on a schedule timer — only animates in response to state
- Use cool colors (blues, purples, greens) — the body is *warm light*
- Look stylized or "cute" — it's a serious presence, not a mascot
- Appear when it has nothing to say — the cloud is always there, but never demands attention

### Performance fallback
On lower-end devices, swap the 2000-orb R3F cloud for a **Lottie-rendered warm orb** with the same eight regions as glowing markers and the same breath behavior. Detect via WebGL perf check on first load. Designer should mock both — and the Lottie version should feel like *the same Kai*, just simpler.

---

## 11. Personability — where warmth shows up

The product feels personable not because of decoration, but because of *moments where Kai is human*. The designer should look for these and make them feel like they matter:

- **Greeting** — uses your first name. Always. *"Morning Kway."* Not *"Welcome back, USER123."*
- **Acknowledgments** — when you take a winning trade, Kai notices. *"Nice play, Kway. That's exactly where I thought it'd go."* Not a generic "trade closed."
- **Memory** — Kai references things from previous sessions. *"You were watching MRAM last week — it just hit the level you flagged."* That moment of being remembered is the entire product.
- **Discretion** — Kai doesn't comment on losses unless asked. He just shows up the next day, same energy, ready to find the next setup. Silence is a kindness.
- **Humor** — small, dry, occasional. *"That was an ugly fill. You'll live."* — never forced or scripted-feeling.
- **The room ages** — small details accrue over time: a tiny "we've been at this 47 days together" pill in the profile, a "you've taken 12 of my alerts this week, hit rate 67%" stat shown only when you ask. Personal accumulation, not gamification.

### Microcopy guidelines

- Empty states: *not* "No alerts yet ✨" — but a soft Kai line: *"Tape's quiet right now. I'll let you know when something matters."*
- Error states: *not* "Something went wrong" — but: *"Lost the connection for a sec. Try that again?"*
- Loading: *not* a spinner with "Loading…" — but: skeletons or a quiet *"Pulling that up."* from Kai
- Confirmations: *not* "Trade submitted successfully ✅" — but: *"Sent. You're filled at 5.10. Watching it for you."*
- Onboarding: *not* "Step 1 of 5" — but a continuous voice greeting that guides you through

The voice is consistent across spoken audio AND written text. Anywhere copy appears, it should sound like Kai said it.

---

## 12. Anatomy of moments

Designer should sketch these in detail — they're the make-or-break feel checks.

### A. First open of the day
- 0ms: app launches, warm dark background fades in (260ms)
- 260ms: avatar appears via materialize (300ms with gentle overshoot)
- 560ms: amber vignette settles in screen corners
- 600ms: Kai voice begins: *"Morning, Kway."* (audio fade-in 120ms)
- 1500ms: morning brief continues, region pulses fire warmly
- 1800ms: subtle "den at night" ambient fades in (if user has it on)
- Bottom tab bar fades in last (after 900ms) — chrome, not the moment

### B. Asking "what about MU"
- 0ms: push-to-talk released
- 100ms: button amber pulse fades, mic dims warmly
- 300ms: filler audio begins: *"Yeah Kway, MU — let me pull the levels real quick."*
- 800ms: regions begin warming as tools fire
- 1500ms: chart panel materializes
- 2200ms: first chart level draws in (line extends + label fades)
- 2900ms: second level
- 3600ms: third level
- ~4500ms: Kai's real reply begins, voice has more energy: *"MU's holding the 50-day with rising volume — above the next line you're looking at a real swing."*

### C. A win moment
- User: *"closed half at 5.80"*
- Kai voice: *"Nice play, Kway. That's exactly where I thought it'd go."*
- Screen-wide warm wash for 600ms (amber bloom)
- Resonant single chime in audio
- A tiny "+0.7R" pill animates into the position card
- Avatar's amber deepens for two breaths before settling

### D. An alert arrives (push)
- Push notification appears natively
- User taps → app opens to Home
- Avatar is already saying *"Hey Kway — MRAM just broke."* by the time visual chrome settles
- Chart materializes mid-sentence
- Breakout level draws in synced to the word "broke"
- Two action chips fade in below avatar: **trade it** | **add to watchlist**
- Ambient stays warm — this isn't a panic moment, it's a friend nudging you

### E. End of session
- User stops engaging
- After 2 min idle, Kai voice: *"Heading out? Tape's slowing down anyway. Catch you tomorrow."*
- Avatar idle breath slows further
- Amber wash dims by 15%
- App doesn't close — it just *rests*

---

## 13. What this is NOT — anti-patterns

Designer should review this list whenever tempted by a flourish:

- ❌ Gradient backgrounds (purple-to-pink, blue-to-cyan, anything bright)
- ❌ Glassmorphism stacks (more than one layer of blur)
- ❌ Cool-grey drop shadows (only warm-tinted shadows when earned)
- ❌ Emoji in UI copy generated by us (user typing them is fine — Kai responds in words)
- ❌ Illustrations of "trading characters" / mascots / cartoon friends
- ❌ Confetti, fireworks, "🎉 You did it!" microcopy
- ❌ Empty-state cartoons
- ❌ Generic loading spinners (use skeletons matching panel shape)
- ❌ Toast notifications mid-screen (Kai's voice + the relevant panel update is how we notify)
- ❌ Modal dialogs that block the app (use bottom sheets that don't grab focus)
- ❌ Pro tips / feature highlights / tutorial overlays after onboarding
- ❌ Star ratings, kudos buttons, like counts
- ❌ "Trending now" UI (Kai surfaces this conversationally instead)
- ❌ Pure-white surfaces
- ❌ Industrial typography (Helvetica, Arial, anything generic-system)
- ❌ Hard 90° corners on cards (always softer rounding)
- ❌ Bright neon accents (cyan, magenta, electric anything)

**Test for every screen**: would you want to spend 45 minutes here at 10pm with a glass of bourbon? If not, we did it wrong.

---

## 14. Designer checklist (before any screen ships)

For every screen + state, ask:

- Does this feel like a place a person would *want to be*?
- Is the amber being earned (a warm light source) or just decorative?
- Is there enough negative space? (Empty room = breathing room = warmth)
- If you hid Kai's voice, would the visual *still* feel personable?
- Is every animation telling you something happened AND feeling like the room cares?
- Could a stranger glance at this and feel like the room is on their side?
- Does the microcopy sound like Kai said it, or like a product manager wrote it?

If any answer is shaky, the screen isn't done.

---

## 15. Deliverables for designer

Beyond the per-screen Figma files (already specced in UX.md), this aesthetic doc requires:

- [ ] **Sound library** — 8 UI sounds + 1 ambient "den at night" loop. Royalty-free or commissioned. .mp3 + .ogg cross-platform.
- [ ] **Lottie animation library** — panel materialize (gentle overshoot), panel dismiss, alert arriving, order confirmation, win moment, 8 avatar region pulses, number flash green/red, mic recording ring
- [ ] **Avatar reference renders** — 6+ hero frames showing idle / listening / thinking (3 levels) / speaking / win states, plus the Lottie fallback
- [ ] **Brand assets** — Kai logo (mark + wordmark + lockup), CheatCode logo, app icon, splash screen, all in iOS/Google sizing
- [ ] **Brand mood film** — 45-90 second video cutting between product screens, film references, ambient music. Used for marketing AND as internal "this is the feeling" reference for everyone shipping the product.
- [ ] **Component library Figma** — every atom, molecule, organism, with all states + motion notes
- [ ] **Custom icon set** — at minimum the 8 panel icons + Kai's brand mark + 12 frequently-used app icons (search, watchlist add, share, settings cog, mic, push-to-talk, alert bell, broker connect, etc.)

---

End of design language. Cross-references: PROJECT.md for scope/tech/strategy; UX.md for screens/flows/components. Live web prototype: kai-warroom.vercel.app — designer should *use* it before designing.

The product's job is to make you feel like you have a friend in your pocket who happens to be the best trader you know. Everything follows from that.
