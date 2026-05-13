# K.ai — Design Language

> The aesthetic bible. Sensory and feel-oriented — covers *what the product is supposed to feel like* in a way that the structural docs (PROJECT.md, UX.md) deliberately don't. Read this BEFORE opening Figma.
>
> Cross-references: K.ai Brand Guide (the visual identity bible — wordmark, palette, mark, iconography). This doc EXTENDS the brand guide into product feel, motion, sound, microcopy, and atmosphere.

---

## 1. North star

A trader's room at night, but it's not a man-cave and it's not a Bloomberg terminal — it's a **boldly designed loft owned by someone who reads Highsnobiety and Bloomberg both.** The lighting is dim. The art on the walls is curated. The speakers are good. There's a sneaker collection visible but the laptop on the desk has six monitors of charts.

That's the feel. **Bold, colorful, vibrant — but disciplined.** Hypebeast-adjacent in confidence and typography, dead-serious about being a power tool. The product respects the trader's intelligence (no hand-holding cuteness) and the trader's culture (the kind of person who sees a great chart and a great pair of shoes with the same eye).

**The interface is your guy K.ai's place — and he has taste.** Color is used like a weapon, not wallpaper. Type makes statements. Motion is cinematic. The vibe never compromises the work.

You should feel like you're using something *cool people made for cool people who happen to take making money seriously*.

---

## 2. References

### Cultural / aesthetic (the hypebeast spine)
- **Hypebeast / Highsnobiety editorial layouts** — bold typography, big imagery, color used decisively, dark sophisticated chrome
- **A24 marketing** — cinematic, art-directed, dark with vivid hits, never apologetic
- **Nike SNKRS app** — bold dark interface, statement product imagery, one functional color hit per screen
- **Off-White / Virgil-era branding** — confident, restrained, the typography IS the design
- **Cash App** — vibrant single-color hits on near-black, no decoration, "the product is the point"

### Personable / mentor (the warmth spine)
- **Granola** (AI meeting notes) — warm dark mode, friendly typography, personality without being childish
- **Linear** (the soft parts) — restraint, motion that means something
- **Headspace** — calm + personable simultaneously, a useful tonal cousin
- **Notion's dark mode** — proof dark can be inviting

### Power-tool gravitas (the serious spine)
- **Bloomberg Terminal** — for data density and trader respect. We don't *look* like it but we honor what it does.
- **Arc browser** — confident chrome, design with a point of view
- **iA Writer in dark mode** — calm focus, deeply considered

### Atmosphere / film
- **Lost in Translation** — neon and intimacy
- **Drive (2011)** — synth + magenta + cool restraint
- **Black Mirror "Hang the DJ"** — vibrant dark interiors, controlled neon
- **Iron Man (the relationship moments, not the HUDs)** — Tony talking to Jarvis like a friend

### Anti-references
- **Robinhood / Webull / Trading 212** — too consumer, gradient-everywhere, no point of view
- **Generic AI chat UIs (ChatGPT, Claude.ai)** — sterile, dialog-box-on-white, no presence
- **Casino / gambling apps** — bright color to manufacture excitement
- **Most fintech "modernizations"** — sans-everything, pastel, friendly to a fault
- **80s sci-fi neon** — we're vibrant but not retro; not Tron, not Vaporwave

What unites the anti-references: **they don't have taste.**

---

## 3. Light + atmosphere

The whole product lives in dark. But dark with **deliberate color hits** — not amber-everywhere, not monochrome.

- **Background** — `#08090C` (near-black with a hair of blue undertone — gives chromatic colors more pop than warm-black)
- **Surface elevation** — `#0E1115` → `#141820` → `#1B2029` (cool dark steps, slightly more saturated than pure greyscale)
- **The brand colors are the light source.** Whichever semantic color is relevant for the moment glows softly behind it.
- **No amber wash painted over everything.** Color is contextual and earned: a long position glows green, an alert glows orange, intelligence glows violet. Surfaces that aren't conveying state stay quietly dark.
- **Color bleeds at edges** when meaningful — a `box-shadow: 0 0 40px rgba(<active-color>, 0.18)` on important panels. Not on everything. Make it count.

**No drop shadows of grey.** Depth comes from surface tint, edge color, and (occasionally) colored glow. The product never feels like a stack of paper cards.

**No bright white anywhere.** Strongest text is `rgba(248, 250, 252, 0.96)` — a hair of cool to match the background. Secondary `0.62`. Tertiary `0.38`.

---

## 4. Surfaces + materials

Three material moods, used deliberately:

### Bold glass (the K.ai panel)
- Used on the chart panel, news, quote card, options chain, earnings — the things that materialize
- `backdrop-blur(18px) saturate(135%)` over `bg-[#08090C]/86`
- **1.5px border** in the context's brand color at ~25% opacity (e.g., a quote card on a green ticker has a 1.5px market-green-25 border). Not a hairline — a confident statement edge.
- Corners: `12px` — touchable but architectural, not rounded-and-friendly
- Subtle inner-glow when active: `box-shadow: inset 0 0 60px rgba(<active-color>, 0.06)`

### Solid dark (the chrome)
- Tab bar, top status bar, navigation chrome
- Solid colors from elevation stack, no blur
- Quietly there

### Color-lit data (numbers, charts, mark)
- Numbers, ticker symbols, chart annotations
- Brand-color text with subtle text-shadow glow on hero numbers: `text-shadow: 0 0 20px rgba(<color>, 0.25)`
- **The K.ai mark itself is the only rainbow.** Everything else is single-color contextual.

**Critical restraint rule**: only ONE dominant brand color per screen at a time. The rainbow palette exists for the WHOLE product across many screens — not for one screen to use all of them. A green-themed Watchlist + a violet-themed Intelligence panel + an orange-themed Alert is the right way to use the system, NOT a single screen with rainbow.

---

## 5. Color — the six brand colors

From the K.ai Brand Guide. Used semantically, restrained, with intention.

| Color | Hex | Meaning | Use |
|---|---|---|---|
| **Market Green** | `#22D687` | Opportunity, momentum | Bull setups, longs, profit, support levels, "trade insight" state |
| **Ocean Blue** | `#1E80FF` | Information, clarity | News surface, data context, "information" state |
| **Energy Orange** | `#FF7A2A` | Alerts, action | Alert push notifications, urgency, "alert" state |
| **Risk Red** | `#FF4D4D` | Risk, volatility | Resistance, shorts, stops, "risk" state, drawdowns |
| **Violet** | `#B855CF` | Intelligence, insight | K.ai's reasoning indicators, "intelligence" state, premium tier accents |
| **Hype Pink** | `#FF20E2` | Energy, focus | Community signal, "wins", focus moments, VIP+ accents |

### The mark — only place rainbow is allowed

The `K.ai` rainbow lockup is the ONLY surface in the product where multiple brand colors coexist intentionally. Everywhere else, color is **semantic and singular** for the moment.

- App icon: rainbow K.ai diamond mark
- Splash screen: rainbow K.ai wordmark on dark
- Onboarding hero: rainbow gradient on the greeting
- Branded loading state (when one is unavoidable): a rainbow shimmer crosses the K.ai mark
- In-app primary CTA on tier upgrade: rainbow stroke around the button border (special moment only)

Outside these moments, the rainbow disappears. Each screen has ONE dominant brand color — whichever is semantically active.

### Neutrals
- Most surfaces are uncolored dark — `#08090C` background, elevation steps for depth
- Text follows the alpha scale above (`rgba(248, 250, 252, ...)`)
- "Plain" UI chrome (tab bar, scrollers, dividers) uses `rgba(248, 250, 252, 0.06-0.12)` borders

### Color in motion
- When a state changes (price moves green/red, alert fires orange), the corresponding brand color **briefly washes** the relevant panel — `350ms` flash from `rgba(<color>, 0.18)` to `0`. Feels like the data is *announcing itself*.

---

## 6. Typography

Per the K.ai Brand Guide:

### Display — **Gambetta**
- A modern serif with personality and a sharp italic. Italic Gambetta is the K.ai brand's signature display gesture (*"Trade smarter. Every day."*).
- Used for: hero greetings, "win" moments, marketing surfaces inside the app, statement headlines
- Size scale: 32px / 42px / 56px (the bigger sizes for splash + onboarding only)
- Mix roman + italic ON THE SAME LINE for emphasis (e.g., `Trade smarter. **Every day.**` where "Every day." is italic — that's the K.ai gesture)

### Body — **Inter**
- Regular, Medium, SemiBold weights
- Used for: Kai's spoken text rendered visually, all body copy, button labels, list items, settings
- Size scale: 14px (body), 16px (emphasis), 20px (section headers), 26px (small display)

### Mono — **JetBrains Mono** (supporting, not primary)
- Tabular numbers (prices align across rows), ticker symbols, "system readout" labels in ALL CAPS with `tracking-[0.22em]`
- Used SPARINGLY — mostly inside data panels and ticker chips. Mono is the data face, not the brand face.
- Size scale: 10px (micro caps labels), 12px (chart axis), 14px (data cards), 24px+ (hero numbers)

### Type as design

Bold italic Gambetta is the K.ai design gesture — use it as art-direction:
- *"Your edge."* / *"Every day."* in 56px italic Gambetta over a vivid colored hero
- Block headlines in 42px Inter SemiBold for power moments
- Numbers in JetBrains Mono with `font-feature-settings: 'tnum'` always

**Never use**: cursive, decorative display, mismatched weights mid-line, all-caps body text, any default-system font as primary.

---

## 7. The mark + iconography

### The K.ai mark
From the brand guide:
- **The diamond is focus.** Rainbow-gradient lozenge representing the trader's decision.
- **The ring is content.** Rainbow ring around the diamond representing the streams of information K.ai surfaces.
- Together: *"K.ai is the sense of every trading decision."*

Used at:
- App icon (with system rounded mask)
- Splash + onboarding hero
- Profile header
- Branded moments (premium upsell, milestone)

Variants:
1. Full rainbow K.ai wordmark (primary, on dark)
2. Rainbow K.AI (all caps, alternate)
3. K•ai (with bullet, alternate)
4. K.AI (small format)
5. Mono Kai (single color, for system-icon contexts where rainbow isn't viable)
6. KAI (all caps mono)

### State icons (from brand guide)
Six iconographic state representations, each in its brand color:

| State | Icon glyph | Color | When |
|---|---|---|---|
| **Intelligence** | violet sparkle | `#B855CF` | K.ai is reasoning, premium analysis active |
| **Trade Insight** | green ascending bars | `#22D687` | Opportunity detected, high-conviction setup |
| **Information** | blue radio/wifi | `#1E80FF` | News context, exploring data |
| **Alert** | orange lightning | `#FF7A2A` | Important alert, action recommended |
| **Risk** | red triangle | `#FF4D4D` | High risk, volatility, protection first |
| **Community** | pink people | `#FF20E2` | Collective intelligence, what others are seeing |

These six map to functional moments throughout the app:
- Tab bar tab states use these colors when active (Watchlist = green active, Alerts = orange active, etc.)
- Avatar's 8 regions inherit these colors (see Section 10)
- Push notification accents pull from the matching state color

### General iconography
- **Lucide React** for utility icons (search, settings, mic, share, etc.)
- 1.5px stroke, geometric, `stroke-linecap: round`
- Default color: `rgba(248, 250, 252, 0.62)`
- Active: takes the screen's dominant brand color
- Size: 18px in lists, 22px in headers, 26px in primary actions

---

## 8. Motion — the signature

Motion makes this feel bold AND alive. Five principles:

1. **Materialize, with confidence.** Panels appear via scale + opacity + slight y-translate. Easing has a *gentle overshoot* (`cubic-bezier(0.34, 1.20, 0.64, 1)`) — like landing decisively, not springing playfully. Duration 280ms.

2. **Snap data, never tick.** Numbers update in place with a single brand-color pulse (180ms). Never a slot-machine counter. Markets are too quick for cute.

3. **Stagger like a sentence.** Chart levels draw in one at a time (~700ms apart) synced to K.ai's narration. The chart fills in as he speaks. Same logic for news headlines on first load (one row per ~90ms).

4. **Color washes punctuate state.** When a price moves green, the relevant card briefly washes market-green at 18% opacity, then settles. When an alert arrives, the alert pill washes energy-orange. Make state changes *unmissable* without being annoying.

5. **The avatar always breathes.** Idle = slow 3.5s breath pulse. Thinking = brand-color region warmth pulses. Speaking = audio-driven amplitude. Never frozen.

### Signature animation library

| Moment | What happens | Timing |
|---|---|---|
| Panel materialize | scale 0.85→1, y 12→0, opacity 0→1, color glow ramps in | 280ms gentle overshoot |
| Panel dismiss | scale to 0.92, opacity 0, slight blur | 220ms ease-in |
| Tab swap | crossfade with 6px y-translate | 200ms ease-out |
| Chart level draw | line extends left-to-right + label fades after | 420ms ease-out |
| Number pulse on update | brand-color flash (green up, red down), then settle | 180ms ease-in-out |
| Color wash (state change) | full panel briefly tinted in semantic color | 350ms exponential decay |
| Avatar idle breath | slow size + brand-color ambient rise/fall | 3.5s infinite |
| Avatar region pulse | semantic color peak + exponential settle | 2200ms exponential |
| Push-to-talk press | scale 1→0.94, dominant color glow intensifies | 100ms spring |
| Alert arrives (push pill) | drops from top with orange bloom | 380ms gentle overshoot |
| Order confirmation | card settles up with green wash on fill | 320ms ease-out-quart |
| Win moment | screen-wide pink/violet bloom + statement type | 700ms (one-time per event) |
| Rainbow shimmer (K.ai mark) | rainbow gradient sweeps across the mark | 1800ms cubic, on brand moments only |

### Motion = meaning + brand

Every animation tells a story AND reinforces the K.ai identity. State changes wash in their brand color. The K.ai mark shimmers on brand moments. The avatar carries its region-colored glow when active.

---

## 9. Sound design

Subtle, designed, bold-but-disciplined. Designer commissions or curates.

### Voice (K.ai)
- OpenAI gpt-4o-mini-tts `onyx` voice with style instructions ("mid-thirties trader-friend, slight rasp, eager, varied pacing, addresses by first name")
- Voice is the warmth and personality. Never narration energy. Real human cadence.

### UI sounds (subtle, opt-out)
All sounds engineered to feel **expensive, not loud**. The test: would this sound at home in an Apple keynote AV mix?

- **Send (push-to-talk release)** — soft synth pulse, sub-bass tail, ~90ms
- **Panel materialize** — designed swoosh-thrum, 280ms, with a subtle high-frequency sparkle layer for the K.ai mark moments
- **Alert arrives** — three-note descending motif, modern (think Tidal new-album notification), 600ms
- **Order confirmed** — confident ascending tone, 400ms, with green-tinged "rightness"
- **Order canceled** — soft descending tone, 300ms, neutral
- **Number pulse green** — barely-audible warm click + tiny rising tone
- **Number pulse red** — barely-audible warm click + tiny falling tone
- **Win moment** — single resonant pad chord, held ~800ms, with subtle particle-like high frequency texture

Avoid: anything bright, high-pitched, "notification-app energy", retro 8-bit, or anything that announces itself loudly. Sound design should pass the "would it embarrass me in a quiet meeting" test.

### Ambient (off by default, opt-in)
- 60-second loop blending: distant rain, subtle synth pad in C, very faint city hum, occasional analog tape hiss
- Vibe: **night at the loft with the desk lamp on** — sophisticated, focused, alive
- Stops automatically during K.ai's voice playback to keep his words clear

Sound is **off by default** on first launch. Onboarding has a "want sounds on?" moment that demos the panel-materialize sound, letting the user decide upfront.

---

## 10. The avatar — K.ai's presence

The 3D neural-orb cloud (2000 orbs, R3F) is the **in-app visual body** of K.ai. The diamond+ring mark is the LOGO. The orb cloud is the AVATAR. These are different surfaces, both load-bearing.

### Visual character
- A constellation of soft glowing orbs forming an organic brain-shape that gently drifts
- **8 regions, each tied to a brand color**:

| Region | Brand color | When it pulses |
|---|---|---|
| Memory | violet `#B855CF` | K.ai recalling past sessions, fetching prefs |
| Market | ocean blue `#1E80FF` | Market/sector/macro analysis |
| Technicals | market green `#22D687` | Chart, snapshot, key levels, indicators |
| Alerts | energy orange `#FF7A2A` | Alert lookups, signal events |
| Watchlist | market green `#22D687` | Watchlist queries (shares with Technicals — both "opportunity") |
| Users | hype pink `#FF20E2` | Community data layer queries |
| News | ocean blue `#1E80FF` | News fetches (shares with Market — both "information") |
| Options | risk red `#FF4D4D` | Options chain, IV queries (risk-flavored) |

The avatar isn't monochrome — when K.ai uses multiple tools in parallel, multiple region colors light up at once. The cloud becomes a **controlled chromatic event** that maps directly to what he's thinking about.

### States
- **Idle** — slow 3.5s breath, all regions quiet, faint white-warm wash. Present, not asleep.
- **Listening** — cloud tightens slightly, rim warms in the dominant active color (last topic), inner ring tracks audio amplitude
- **Thinking** — regions pulse in their brand colors as tools fire. You see K.ai's reasoning *as color*.
- **Speaking** — audio-driven amplitude on the cloud itself; the region most relevant to the current sentence lights warmer
- **Win / excited** — bloom outward from center in pink/violet (the "wins" colors), 600ms, then settles

### What it should NEVER do
- Bounce, wobble, or have springy personality animation
- Have eyes / face / mouth — he's a mind, not a character
- Animate on a timer — only responds to state
- Use cool greys or browns — every color is from the brand palette
- Look cartoonish or "cute" — sophisticated, restrained, alive

### Performance fallback
On low-end devices, swap the R3F cloud for a Lottie-rendered version: 8 glowing region markers around an orb silhouette, each markable in its brand color, with the same breath behavior. Designer mocks both — and the Lottie version feels like *the same K.ai*, just lighter.

---

## 11. Personability — where the warmth lives

The product feels personable not because of decoration, but because of *moments where K.ai is human*. The brand guide says: **"Speak like a mentor, not a robot."** That applies everywhere:

- **Greeting** — uses first name. *"Morning Kway."* Never *"Welcome back, USER123."*
- **Acknowledgments** — on wins: *"Nice play, Kway. That's exactly where I thought it'd go."*
- **Memory** — across sessions: *"You were watching MRAM last week — it just hit the level you flagged."*
- **Discretion** — silent on losses unless asked. Shows up the next day with the same energy.
- **Humor** — small, dry, occasional. *"Ugly fill. You'll live."* — never forced or scripted.
- **The room ages** — small accrued stats appear over time: *"47 days together"*, *"hit rate 67% this week"* — visible only when you look.

### Microcopy guidelines

Every empty / error / loading / confirmation state speaks in K.ai's voice. The brand guide DO list:
- Be concise and actionable
- Use trader language naturally
- Match the user's volatility (calm when they're calm, sharp when stakes are high)
- Empower the user
- Speak like a mentor, not a robot

| Don't | Do |
|---|---|
| "No alerts yet ✨" | *"Tape's quiet. I'll let you know when something moves."* |
| "Something went wrong" | *"Lost connection for a sec. Try that again?"* |
| "Loading…" with spinner | Skeleton + Kai voice: *"Pulling that up."* |
| "Trade submitted successfully ✅" | *"Sent. You're filled at 5.10. Watching it."* |
| "Step 1 of 5" onboarding | A continuous voice greeting that guides through |
| "🎉 You did it!" | *"Nice play, Kway."* with a soft pink bloom |

---

## 12. Anatomy of moments

Designer should sketch these in detail. They're the make-or-break feel checks.

### A. First open of the day
- 0ms: rainbow K.ai mark fades in over `#08090C`
- 200ms: subtle rainbow shimmer crosses the mark (brand sting)
- 400ms: mark dissolves; avatar materializes (280ms with gentle overshoot)
- 700ms: K.ai voice begins: *"Morning, Kway."*
- ~1500ms: morning brief continues; region warmths pulse in brand colors as tools fire
- 1800ms: ambient layer fades in (if user enabled)
- Bottom tab bar fades in last (after 900ms) — chrome

### B. Asking "what about MU"
- 0ms: push-to-talk released
- 100ms: button color fades from active brand state, mic dims
- 300ms: filler audio begins: *"Yeah Kway, MU — let me pull the levels real quick."*
- 800ms: avatar's Technicals region (green) and Market region (blue) begin pulsing in parallel
- 1500ms: chart panel materializes with a 1.5px green border (technicals = green active)
- 2200ms: first chart level draws in with stagger
- 2900ms: second level
- 3600ms: third level
- ~4500ms: K.ai's real reply: *"MU's holding the 50-day with rising volume — above the next line you're looking at a real swing."*

### C. A win moment
- User: *"closed half at 5.80"*
- K.ai voice: *"Nice play, Kway. That's exactly where I thought it'd go."*
- Screen-wide pink+violet bloom (the "wins" colors) for 700ms
- Single resonant chord plays
- A `+0.7R` chip animates into the position card with hype-pink accent
- Avatar's Community region (pink) and Memory region (violet) bloom for two breaths

### D. Alert arrives (push)
- Push notification natively (with K.ai orange iconography)
- User taps → app opens
- Avatar already saying *"Hey Kway — MRAM just broke."*
- Chart materializes with energy-orange 1.5px border (alert context)
- Breakout level draws in synced to the word "broke" — line is orange (alert level)
- Two action chips fade in: **trade it** (green CTA) | **add to watchlist** (white/dim)

### E. End of session
- 2 min idle
- K.ai voice: *"Heading out? Tape's slowing down anyway. Catch you tomorrow."*
- Avatar breath slows
- All region colors dim 20%
- App rests but doesn't close

---

## 13. What this is NOT — anti-patterns

Designer reviews this list whenever tempted by a flourish:

- ❌ Rainbow used anywhere outside the K.ai mark + brand moments
- ❌ Multiple brand colors competing on one screen (one dominant at a time)
- ❌ Gradient backgrounds (the brand is rainbow ON the mark only, not as wallpaper)
- ❌ Glassmorphism stacks (one blur layer max)
- ❌ Cool-grey drop shadows (only colored glows when earned)
- ❌ Emoji in our UI copy (user typing them is fine — K.ai replies in words)
- ❌ Illustrations of trading characters / mascots / cartoon friends
- ❌ Confetti, fireworks, "🎉 You did it!" microcopy
- ❌ Empty-state cartoons
- ❌ Generic loading spinners (skeletons matching panel shape)
- ❌ Toast notifications mid-screen (K.ai's voice + the relevant panel update IS how we notify)
- ❌ Modal dialogs that block (use bottom sheets that don't grab focus)
- ❌ Pro tips / feature highlights / tutorial overlays after onboarding
- ❌ Star ratings, kudos buttons, like counts
- ❌ "Trending now" UI (K.ai surfaces this conversationally)
- ❌ Pure-white surfaces
- ❌ Generic system fonts as primary
- ❌ Hard 90° corners on cards (always 12px rounding)
- ❌ Retro neon / 80s vaporwave (we're bold and modern, not nostalgic)
- ❌ Friendliness as decoration (warmth lives in voice, not bouncing animations)

**Test for every screen**: would a designer at A24 or Off-White look at this and think *"yeah, those people get it"*? If no, ship anyway? No — fix it.

---

## 14. Designer checklist (before any screen ships)

For every screen + state, ask:

- Does the dominant brand color match the semantic moment?
- Is the K.ai mark used only in brand-significant moments (not chrome)?
- Is there enough negative space? Bold design = generous breathing room.
- If you hid K.ai's voice, would the visual still tell the right story?
- Could a trader at 3am respect this AND a Highsnobiety reader screenshot it?
- Does the microcopy sound like K.ai said it (mentor, not robot)?
- Are you using rainbow restraint? (One bold color per moment, rainbow only on the mark)
- Is every animation telling you something AND feeling like the product cares?

If any answer is shaky, the screen isn't done.

---

## 15. Deliverables for designer

Beyond per-screen Figma files (already specced in UX.md):

- [ ] **K.ai mark variants** — rainbow primary + 5 alternates (per brand guide) at all sizes, including app icon with system mask, splash screen, favicon
- [ ] **Sound library** — 8 UI sounds + 1 ambient loop, royalty-free or commissioned. .mp3 + .ogg cross-platform.
- [ ] **Lottie animation library** — panel materialize, panel dismiss, alert arriving, order confirmation, win moment, 8 avatar region pulses (one per brand color), color-wash state changes, number pulse green/red, mic recording ring, rainbow shimmer (mark only)
- [ ] **Avatar reference renders** — 6+ frames showing idle, listening, thinking (with multiple regions lit in different brand colors), speaking, win states. Plus the Lottie low-perf fallback.
- [ ] **Brand asset package** — Kai logo lockups, CheatCode parent logo (if applicable), app icon (Apple + Google sizing), splash screen
- [ ] **Brand mood film** — 60-90 second video cutting between product screens + hypebeast/A24/film references + ambient soundtrack. Used for marketing AND as the internal "this is the feeling" reference.
- [ ] **Component library Figma** — every atom / molecule / organism with all states (default, hover, active, disabled, loading, error) + motion notes
- [ ] **Custom icon set** — 6 state icons (intelligence, trade insight, information, alert, risk, community) PLUS 12+ utility icons in the brand's stroke style
- [ ] **Typography specimen** — Gambetta in roman + italic across display sizes; Inter weight ladder; JetBrains Mono tabular number specimens
- [ ] **Color usage examples** — for each of the 6 brand colors, show 2-3 example screens that demonstrate it being used semantically without overpowering

---

End of design language. Cross-references: PROJECT.md (scope/tech), UX.md (screens/flows), K.ai Brand Guide (identity foundation). Live web prototype: kai-warroom.vercel.app — designer should *use* it before designing.

The product's job is to make you feel like K.ai is the smartest, most disciplined trading partner you've ever had — and that he has impeccable taste.
