# Design Language

The taste rulebook for every generated template. Anyone (human or agent) building or judging a
template follows this. The bar: **every template should look like a paid MotionArray / Envato
Elements asset**, not a tutorial demo. When in doubt, remove something.

Values below are for a **1920×1080 canvas**; scale linearly for other resolutions (multiply by
`height / 1080`).

---

## 0. Words we use

The product is a design tool, so its own vocabulary has to be right. Two terms get confused
everywhere, including in this codebase's history:

- **Typeface** — the FAMILY. Inter, Oswald, Playfair Display. It is what a designer chooses.
- **Font** — that family at a particular size, weight and style. "Inter Bold 24px" is a font;
  "Inter" is a typeface.

So a control that picks a family is labelled **Typeface**, and "font size" and "font weight"
stay exactly as they are — those are correct usage, because a size and a weight are what turn a
typeface into a font. **"Font family" never appears in UI copy**: it is the CSS property's name,
not the user's word for the thing.

This is a copy rule, not a feature. Code identifiers, CSS custom properties (`--font-heading`)
and test ids keep their existing names — renaming those would be churn with no reader on the
other end. It joins the product's other settled vocabulary: the operator verbs
(`docs/CONTROL_LAYER.md`), "production" rather than rundown (`docs/CLOUD_PLAYOUT.md`), and
user-facing facet names rather than CSS jargon (`docs/TEMPLATE_TAXONOMY_PROPOSAL.md`).

---

## 1. Typography

- **One family per graphic** (two max: heading + label). Pick from the bundled fonts registry.
- **Contrast through weight and size, not more fonts.** A lower third is typically:
  - **Name / headline:** 44–92 px, weight 600–800, line-height 1.05–1.15, letter-spacing 0 to
    −0.01em (big text tightens). The upper half of the range (65–92 px) is flagship-show
    territory — talk shows, entertainment — measured from real broadcast packages (ratified
    2026-08-02, docs/SPX_EXAMPLES_CORPUS.md); news-style straps stay in the lower half.
  - **Title / role line:** 22–46 px, weight 400–500, line-height 1.2–1.35 — the top half
    exists only to keep the name:title ratio when the name runs flagship-size.
  - **Kicker / label** (small caps line like "LIVE" or a category): 16–22 px, weight 600–700,
    `text-transform: uppercase`, letter-spacing **0.08–0.2em** (small caps breathe).
- Size ratio between name and title ≈ **1.8–2.2 : 1**. Closer than 1.5:1 looks indecisive.
- **The type floor: nothing renders below 20 px at 1080p.** Corner bugs are the one exception at
  16 px, because a persistent station mark is small by construction. This is not a taste rule -
  below the floor, text stops surviving broadcast compression and is simply gone on a
  phone-sized stream window. `node scripts/type-floor.mjs` renders the whole catalog and fails
  on any violation, so a design that wants a quieter voice gets it through weight, color and
  tracking, never through size. If a design cannot make its hierarchy work above the floor, the
  design is too dense - cut a line rather than shrink one.
- **The binding legibility numbers live in `src/model/designRules.ts`** (the owner's ratified
  size table by role x mode x viewing profile, plus the weight, stroke, safe-area and
  contrast+protection floors - docs/DESIGN_RULES_PLAN.md). This document is the taste; that
  module is the measurement, read by the AI prompts, the iterate loop's instruments and the
  product validator's warn-first checks alike. Never copy one of its numbers into prose here -
  point at it.
- **A live number never changes the shape of its graphic.** A clock, a countdown, a score, a
  tally, a percentage and a count-up all repaint several times a second; with proportional
  figures "11:11" is narrower than "00:00", so the box twitches on every tick. That is the most
  visible way an on-air graphic reads as amateur, and it is why clocks have been monospaced on
  television since captions were burned in. Every changing figure therefore carries BOTH halves
  of the numerals contract (`src/templates/shared/numerals.ts`):

  ```css
  font-family: var(--font-numeric);    /* a face whose digits are all one width */
  font-variant-numeric: tabular-nums;  /* ask that face for its tabular figures */
  ```

  The second declaration alone is not the rule - **it silently does nothing on a typeface
  without the feature**, and six of the seventeen bundled faces are in that class (Oswald,
  Playfair Display, Libre Franklin, Anton, Big Shoulders, DM Sans; DM Sans's digits vary by 41%
  of the em). `--font-numeric` gives three answers, in order of how much of the design's voice
  they keep:

  1. **The graphic's own typeface**, where its digits are already even. Nothing is added.
  2. **Its paired sibling** - a bundled face that shares a style family and can hold a width
     (Oswald's numbers are set in Saira, Playfair's in Source Serif 4, DM Sans's in Outfit).
     A serif keeps a serif number, a condensed sport face keeps a condensed one. Costs one more
     woff2 in the package, shipped exactly as a family's label face already is.
  3. **A monospaced stack**, only where there is no pairing to reach for - an imported typeface
     nobody has measured against a partner.

  Mono is the LAST resort, not the rule: a code face on a sport slab reads as a terminal, and
  JetBrains Mono's slashed zero cannot be turned off (measured - no `zero`, `ss19` or `ss20`
  setting changes the glyph). The house `noacg` family is the deliberate exception, since a
  mono label face is its voice already.

  Evenness is measured ACROSS a face's weight range, not at one weight: Oswald's digits are
  perfectly even at 400 and span 16% of the em at 700, which is the weight every sport
  scoreboard sets them at. `node scripts/numerals.mjs` renders the live-number categories,
  substitutes each digit in turn and fails on any box that moves - it measures the defect
  itself, so a declaration that no-ops fails exactly as a missing one does.

  A figure typed once and never repainted - a year in a credits block, a rank in a results row -
  is not covered by this and does not need it.
- **Frame-anchored geometry does not follow the type.** A near-full-width strip, a 16:9 camera
  window, the `999px` pill idiom - these are sized against the 1920x1080 frame, so scaling them
  with the design pushes the graphic off screen. Scale the type and the padding around it; leave
  the box where the frame put it.
- **Growing a graphic costs capacity.** Every design has a width budget, and the runtime bench
  (`e2e/catalog/catalog-bench.spec.ts`, `npm run test:e2e:catalog`) spends it by doubling the
  length of every text value. Enlarge the type and
  that budget shrinks: elements collide, text clips, the strap runs off frame. So a design may
  grow at most **1.25x** to reach the floor; past that, raise the small labels to the floor and
  leave the geometry alone. A design already at its bench limit takes the label change only - and
  if raising one label breaks it, the layout needs the auto-fit pattern (§5), not a bigger box.
- **Align toward the anchor.** A left-anchored graphic left-aligns, a right-anchored one
  right-aligns. Centering is allowed for a **centre-anchored** graphic only (`bottom-center`), and
  only where the composition is genuinely symmetric — a centred rule, a centred kicker over a
  centred name, the title-card grammar. A centred ragged block sitting at the left safe margin is
  the failure this rule exists to prevent; centring a two-line strap "because it looks balanced"
  is still wrong.
- `text-wrap: balance` on lines that may wrap (with the auto-fit pattern below).

## 2. Color

- **Palette discipline: exactly one accent color** per graphic + a neutral text/background system.
  Two accents = amateur hour.
- Neutrals: near-black panels are `rgba(8–18, 8–20, 14–28, 0.85–0.95)` — never pure `#000`.
  Light text is `#fff` for the name; the secondary line drops to 65–80 % opacity or a tinted
  neutral, never pure white for both.
- The accent appears in **small, sharp doses**: an accent bar, an underline, a kicker background,
  a gradient edge — not as the whole panel background (sport style may break this rule
  deliberately with a bold accent slab).
- Gradients: same-hue or adjacent-hue only (e.g. blue→indigo), 90–135°, subtle. Rainbow = never.
- Everything colorable goes through `:root` custom properties (`--accent`, `--text-color`,
  `--text-dim`, `--panel-bg`) so the Style panel can retint the whole graphic coherently.

## 3. Spacing & shape

- **Padding is generous:** text sits in a panel with 0.5–0.7em vertical / 1.0–1.4em horizontal
  padding. Cramped padding is the #1 tell of a bad lower third.
- Gap between name and title lines: 4–10 px (they read as one unit), plus 8–14 px to a kicker.
- **Shape language per style tag:**
  - **minimal** — no panel or a hairline one; 0–2 px radius; accent is a 2–4 px line/bar;
    whitespace does the work; optional 1 px `rgba(255,255,255,0.15)` keyline.
  - **sport** — angled edges (`clip-path` or `transform: skewX(-6deg to -12deg)` with counter-skew
    on text), layered slabs, 0 radius, heavy weights, condensed faces, accent used boldly.
  - **glass** — 12–24 px radius, `backdrop-filter: blur(12–24px)` over a translucent panel
    (`rgba(255,255,255,0.08–0.14)` on dark), 1 px inner keyline `rgba(255,255,255,0.18)`,
    soft wide shadow `0 20px 60px rgba(0,0,0,0.35)`.
  - **editorial** — structure by RULES, not panels: a 2 px hairline above or beside the block, a
    wide-tracked small-caps kicker, 0 radius, generous whitespace between the rule and the name.
    A panel, where one is used at all, is a flat printed surface (ink or paper), never a chip.
  - **cinematic** — no panel edge at all. Text sits on a soft scrim
    (`linear-gradient(transparent, rgba(0,0,0,0.55))`, or a left-to-right one for a side-anchored
    design); the only drawn element is a 1 px hairline. Light weights, wide positive tracking.
    Readability comes from the scrim, and extra separation from `filter: drop-shadow(…)` **on the
    box** — never a `text-shadow` on a line, which the line's own overflow-hidden mask would clip.
- Shadows lift, never smear: prefer one soft large shadow over multiple small ones.

## 4. Motion (GSAP)

The animation **is** the taste. Rules:

- **Animate only** `transform` (x/y/scale/skew), `opacity`, and `clip-path`. Never `left/top/
  width/height/margin` (layout thrash = jank).
- **Easing doctrine** (the selectable presets live in `src/model/easings.ts`; generated code
  exposes them as the `easeIn` / `easeOut` variables in the marked ANIMATION block):
  - Movement must feel **responsive but polished** — smooth and snappy, never mechanical.
    Default to Easy Ease / ease-in-out-family curves; **avoid linear motion**.
  - **Entrances (in):** prefer **Ease Out** or **Back Out** — the object enters quickly and
    settles smoothly. Back Out (`back.out(1.4–1.8)`) is the pick for snappy pop-ins with a small
    overshoot.
  - **Exits (out):** prefer **Ease In** (`power2.in` / `power3.in`) — the object starts naturally
    and exits quickly. Exits run **30–60 % faster than entrances** (the slower the entrance,
    the bigger the gap — production packages pair 1.4 s entrances with ~0.5 s exits).
  - **Bounce and Elastic are playful options only** — offered in the picker, never defaults.
  - **Linear is never a default** — reserve it for continuous motion: tickers, timers,
    progress bars, seamless loops.
  - The full preset list: Linear, Easy Ease, Ease In, Ease Out, Ease In-Out, Back, Bounce,
    Elastic, Expo, Cubic, Sine, Circ — each mapped to direction-correct GSAP curves per phase.
    That is the ADVANCED list (the Inspector's picker). The no-code surfaces offer a short one,
    filtered by two rules (`simple` and `needs`, `src/model/easings.ts`; the measurement is in
    that file's header): near-duplicates and in-direction curves are dropped from an entrance
    picker, and **a curve whose character is overshoot or oscillation is only offered on a
    motion that animates an unclamped property**. Back, Bounce and Elastic on an opacity-only
    fade are not "playful" — they are a faster fade, a flicker and a snap, because opacity
    saturates at 1. Same for an `inset()` percentage and a blur radius.
  - **A curve needs travel to be a curve.** Two eases differing by 4 px over a whole entrance
    are one ease with two names. If a motion's travel is under ~5 % of the frame, the easing
    control above it is decoration — widen the motion, do not lengthen the list.
- **Durations:** in = 0.5–1.4 s total; out = 0.3–0.5 s. Respect `animSpeed` (divide durations).
  Above ~0.9 s an entrance reads as deliberate broadcast pacing — production packages commonly
  run 1.0–1.4 s (ratified 2026-08-02, docs/SPX_EXAMPLES_CORPUS.md); keep fast-feel graphics
  (stream overlays, alerts) at the low end.
- **Choreograph, don't blob:** elements enter in sequence with 0.06–0.25 s staggers — accent
  first, then name, then title. Longer ladders (0.15–0.25 s) suit multi-line reveals; the
  theatrical 0.4 s production extreme stays out. One `gsap.timeline()` per direction
  (`buildInTimeline()`, `buildOutTimeline()`), never a pile of loose tweens.
- **Signature reveals** (each variant has one, matched to its style):
  - *line/underline reveal:* accent line scales `scaleX 0→1` (set `transform-origin: left`),
    text slides up from behind an `overflow: hidden` line-mask with a slight y+opacity.
  - *mask wipe:* panel reveals via `clip-path: inset(0 100% 0 0)` → `inset(0 0% 0 0)`.
  - *pop-spring:* scale 0.9→1 + y 20→0 with `back.out(1.6)` (glass style).
  - *snap-stinger:* fast x-slide with skew that settles (sport; total in ≤ 0.5 s).
  - *blur-in:* opacity + `filter: blur(12px)→0` on the panel only (sparingly — filter is costly).
- Steps mode (SPX Continue): step 1 shows the name line; each `next()` reveals the following line
  with the same vocabulary. Out always takes the whole graphic.
- `will-change: transform, opacity` on animated elements (and remove nothing else — keep it simple).
- Loops (tickers/starting-soon, later): pauseable, seamless, no rewind pops.

## 5. The auto-fit text pattern (mandatory in all text graphics)

Text boxes **hug their content and wrap gracefully**; operators type any length.

```css
.lower-third-box {
  width: fit-content;              /* the panel hugs the text */
  max-width: 800px;                /* never grow past this — wrap instead (~42% of 1920) */
}
.lower-third-name {
  overflow-wrap: break-word;       /* break very long unbroken words */
  text-wrap: balance;              /* wrapped lines get even lengths */
}
```

- Anchor lower thirds with `bottom:` (not `top:`) so wrapped lines grow **upward** and the
  graphic never sinks out of the safe area.
- Line-masks used for reveals must wrap-safe: mask the *block*, not a hardcoded height.
- Max width defaults to keeping the panel inside the action-safe area from its anchor zone.

**The strap floor (a `min-width`, for filled-panel straps).** A `fit-content` panel hugs its
text, so a short name — "Al Roy / Host" — yields a tiny pill sitting where a broadcast strap
belongs. The audit measured lower-third median footprint at 24% of frame against a 32% target,
and **scaling cannot close that gap** — enlarging the type spends the runtime-bench capacity
(§1, "Growing a graphic costs capacity"). The lever that does not is a scale-aware `min-width`
on the panel, so it reserves a broadcast-width strap and the text left-aligns in the reserved
void (the BBC/Sky bar):

```css
.lower-third-box {
  min-width: calc(600px * var(--scale));   /* ~31% of frame; the void fills past the text */
  max-width: 800px;                         /* the wrap cap is unchanged */
}
```

It is **capacity-safe by construction**: long text already exceeds any `min-width`, so it never
reduces the wrap headroom the bench stresses, and it sits under the `max-width` cap, so it can
never push a box off frame. Two rules on where it applies:
- **Only filled panels / bars / slabs / glass cards** — a shape that reads as a strap. A
  panel-less minimal, editorial-rule, hairline or cinematic-scrim design hugs its text *by
  intent*; a `min-width` there just strands the block in empty space. Leave those alone.
- **Not the deliberately compact size class, nor a trailing-logo well.** A tag or a
  social-handle mark is *meant* to be small (the matrix's "compact" size), and a `min-width` on a
  `[words | bar | logo]` ident stretches the *empty* logo area into a gap when no logo is set.
  Reserved width there reads as a defect, not a strap.

## 6. Position

Nine anchor zones snapped to safe areas (5 % inset at 1080p ≈ 96 px sides / 54 px top-bottom;
use the tighter classic 120 px left inset for lower-left thirds). Zone sets the anchoring edges
(`left/right/top/bottom` + transforms for centered zones); a nudge offset adds to them.

**THE SAFE AREA BINDS INFORMATION, NOT DECORATION** (owner-ratified 2026-08-23):

> Decorative bars and backgrounds may extend beyond the safe area or bleed to the frame edge.
> Text, logos, and other essential information must remain safe.

So a full-width band, an accent rule, a scrim or a panel may reach the picture's edge when the
design means it to — `lt63` "Broadsheet Band" is the catalog's first design that does — while the
words inside it keep the full inset. The two halves are separate decisions and a design states
each one.

The gate is `e2e/catalog/long-value-containment.spec.ts`, which drives a 51-character name
through every lower third and measures the TEXT's extent, ignoring the panel behind it. It reads
the safe area rather than the frame, and that threshold was chosen by measurement: at 51
characters 106 of 106 designs keep text on the frame, so a frame assertion passes even on a
design whose rail has left the picture — it cannot fail, which is the one thing a gate must be
able to do. **Two measurement facts worth keeping** if this is ever re-derived: a hugging design
is bounded on the axis its type runs along and on no other, so a turned design (`writing-mode`)
inherits no cap at all; and a tracked label's layout box includes a letter-space after its last
glyph — ink that does not exist but width that does — which the span's rect, a Range over its
contents and a Range over its last character all report identically. Reserve for it in the
design; there is no measurement that subtracts it. (The turned-type case that found the first of
those is retired - see `src/templates/lowerThirds/AGENTS.md` - but the axis rule holds for any
design that hugs vertically.)

## 7. Generated-code style (readability & editability)

- **Simplest clear code wins.** Prefer direct HTML/CSS/JS: descriptive names, simple top-to-bottom
  control flow, minimal indirection - a few obvious lines over a clever abstraction. A beginner
  should be able to locate the code that draws a thing and understand it. Add a helper, wrapper, or
  generic pattern only when it clearly makes the code *simpler to read*. This is a preference, not a
  ban on abstraction - reach for the simplest implementation that stays correct and maintainable.
- **Naming:** one descriptive prefix per category — lower thirds use `lower-third` (`.lower-third`, `.lower-third-box`, `.lower-third-name`,
  `.lower-third-title`, `.lower-third-kicker`, `.lower-third-accent`, `.lower-third-logo`). Functions are verbs:
  `buildInTimeline()`, `buildOutTimeline()`, `update(data)`, `play()`, `stop()`, `next()`.
- **Comment every CSS property** (short, right-aligned style as in existing templates) and every
  JS section. Comments explain *what it does*, not *that it changed*.
- **`:root` style contract** at the top of the CSS: `--accent`, `--text-color`, `--text-dim`,
  `--panel-bg`, `--font-heading`, `--scale`, `--type-scale` — each commented.
- **Two size knobs.** Every dimension scales via `calc(Npx * var(--scale))` (the whole-graphic
  knob, which also folds in resolution); font sizes additionally multiply by the text-only knob:
  `font-size: calc(Npx * var(--scale) * var(--type-scale))`. Nothing else consumes
  `--type-scale` — it changes the type, never the panel around it.
- **Marked animation region** in template.js:
  ```js
  /* == ANIMATION (generated — the Animation panel rewrites this block) == */
  var animSpeed = 1;  // 1 = normal · 0.75 = slower · 1.5 = faster
  function buildInTimeline() { /* … */ }
  function buildOutTimeline() { /* … */ }
  /* == END ANIMATION == */
  ```
  Nothing outside the markers may be touched by the Animation panel.
- Keep JS ES5-flavored and plain (`var`, `function`) to match SPX's classic-template idiom; no
  build steps, no modules, no cleverness. Field convention: one element `id="fN"` per data field;
  `update(data)` writes values straight in (see `docs/SPX_TEMPLATE_FORMAT.md`).

## 8. Package consistency (cross-category)

Graphics from one project must read as **one show**. Categories are not islands: every category
ships at least one variant per style family, and that variant must look like the **sibling** of its
lower-third counterpart. The shared `:root` contract + brand mechanism carry palette and font;
these family tokens carry the *shape and motion*:

| Token | minimal | editorial | cinematic | sport | glass | noacg (house) |
|---|---|---|---|---|---|---|
| Accent geometry | hairlines 2–4 px, short underlines | 2 px printed rules — above the block, beside it, or under the kicker | one 1 px hairline, nothing else drawn | slabs 8–12 px, fused to panel edges | dots, rings, gradient edges | one 8 px amber bar fused to the panel's left edge; solid amber label chips (dark ink) |
| Panel | none or keyline `rgba(255,255,255,0.14)` | none, or a flat printed surface (ink `rgba(16,15,14,0.9)` / paper `rgba(245,243,238,0.96)`) — never a chip | NONE. A soft scrim `linear-gradient(transparent → rgba(0,0,0,0.55))` + `text-shadow` on the type | solid slab, **skewX(−8°)** where skewed | translucent white 0.08–0.14 + `blur(18px)` + keyline 0.18 | void `rgba(10,12,16,0.86–0.92)` + `blur(8px)`; strips add a `rgba(246,166,35,0.5)` top edge |
| Radius | 0–2 px | 0 | 0 | 0 | 14–18 px | 0 on panels; 6 px on chips/badges |
| Shadow | none/subtle | `0 12px 36px rgba(0,0,0,0.28)` when a panel is used at all | no box shadow; separation is the scrim, plus `filter: drop-shadow(0 2px 14px rgba(0,0,0,0.5))` on the box where needed | hard offset (sticker-slab) | soft wide `0 20px 60px rgba(0,0,0,0.35)` | `0 16px 50px rgba(0,0,0,0.5)`; restrained amber glow `0 0 22–26px rgba(246,166,35,0.4–0.6)` on accent elements ONLY |
| Type | normal width, weights 400–700 | display 600, −0.015 em; kickers 0.24 em tracked caps in the ACCENT colour | display **400 and +0.06 em** — the one family whose big type OPENS UP; labels 0.34 em, dimmed, never accented | condensed/heavy caps, 0.02–0.1 em tracking on labels | soft rounded families, weights 500–800 | display 700, −0.01/−0.02 em; labels ALWAYS JetBrains Mono caps, 0.14–0.28 em tracking, accent or dark-on-accent |
| Motion feel | expo/power3 reveals, masked lines | expo reveals with the rule drawing first — the rule is the entrance | slow sine fades, 0.7–0.9 s; nothing travels far, nothing overshoots | ≤0.5 s snap-stingers, x-slides with skew | back.out pops, blur-ins | expo/power3 reveals like minimal — controlled, newsroomy; the glow never animates on its own |
| Continuous motion (tickers/credits/loops) | `ease: 'none'` (Linear) for the travel itself; entrances/exits still eased | same | same | same | same | same |

**editorial** and **cinematic** are the two newest families. They exist because the first four had
no voice for the two commonest premium references outside sport and streaming: the magazine /
newsroom strap (rules, kickers, printed hierarchy) and the documentary name super (a scrim, wide
light caps, no panel at all). They now extend beyond lower thirds as focused information systems:
editorial covers session titles, now/next, fact-checks, explainers, notices and news tickers;
cinematic covers chapter titles, now-playing, documentary quotes and restrained alerts. Specialist
siblings add editorial results, sponsor reads, prepared captions and source folios, plus cinematic
locations and prepared lyrics. The type × family matrix (`scripts/factory.mjs matrix`) remains
deliberately sparse outside those jobs, and a template pack (`src/templates/packs.ts`) still cannot
name either as its family until its required cells are filled. An empty cell is work not yet done,
not a defect.

### The three game-show families

**sticker**, **showtime** and **arcade** were added on 2026-09-19 for a two-player quiz show. Each
ships exactly three graphics: a quiz show board (`types/quizShow.ts`), a two-player score
(`types/duelScore.ts`) and a lower third. They are Browse families like editorial and cinematic,
so no pack names one yet. They were drawn to be as far from each other as from the six above, so
picking one is a real decision.

| Token | sticker | showtime | arcade |
|---|---|---|---|
| Idea | neo-brutal labels stuck onto the picture | a theatre marquee | an arcade cabinet screen |
| Accent geometry | a tilted square tab or diamond with the same outline and hard shadow | a lit five-point star; rows of bulbs drawn with one `radial-gradient` | a column of three stacked pixels; a dashed rule of pixels |
| Panel | OPAQUE light paper, outline `inset 0 0 0 5px var(--text-color)`, tilted ±0.6 to ±0.8° on a painted layer | deep warm ground lit from above, a bulb-coloured keyline inside the edge and a dark surround outside it | near-black violet with scanlines under the type; the rim is a second clipped layer in the accent |
| Radius | 0 | full pill (`999px`), a stadium when the content is tall | 0. Corners are stair-stepped with a `clip-path`, 6 to 12 px steps |
| Shadow | hard offset `10px 10px 0 var(--text-color)`, NO blur | soft warm lift `0 12px 34px rgba(0,0,0,0.45)`, accent glow on lit elements | none. The glow is `filter: drop-shadow`, because `clip-path` cuts a box-shadow away |
| Type | Archivo 900, −0.02 em, sentence case | Playfair Display 800 for words, Oswald caps at 0.22 em for labels | Saira 800 caps with phosphor `text-shadow`; JetBrains Mono labels at 0.12 em |
| Default palette | Tangerine: cream `rgb(255,248,231)`, ink `#111`, accent `#ff5c39` | Marquee: burgundy `rgb(74,15,30)`, cream text, bulb gold `#ffc93c` | Neon Cyan: `rgb(18,11,46)`, accent `#00f0ff` |
| Motion feel | snaps. CSS state changes use `steps(2)`, never an ease | lights up: fades and soft springs; bulbs switch in `steps(2)`, they do not slide | draws on: mask-wipes; blinks, flashes and jitters all run in hard `steps()` |

Two rules hold across all three, and a new design in these families keeps them:

- **A state is never colour alone.** The pick, the correct answer and a wrong pick each change
  shape as well: a pressed-in label, a second ring, a blinking cursor; a drawn tick; a hatch, a
  dashed edge, a glitch with a drawn cross. The tick and the cross are drawn with borders and
  bars, never typed, because a playout machine without a symbol font shows an empty box.
- **A dimmed element keeps its ground.** What fades is the content, the rim or the shadow. A
  translucent panel over moving picture stops reading as the object the family is built around.

The **noacg** family is the product's own on-air look (BRAND-MANUAL §3: void `#0a0c10`, amber
`#f6a623`, paper `#e8edf2`; markets up/down `#4ac47a`/`#e57a7d`), derived from the seven
`NoaCG-Brand-Kit/overlays/` pieces. It exists so the product's built-in output showcases the
brand. Its default label face is bundled JetBrains Mono (`labelFontFaceCss`) — a design-owned
second typeface the Style panel's heading-font swap never touches. Like every family, palette
and heading font remain fully user-swappable via the `:root` contract.

Rules:
- A new category variant **must name its lower-third sibling** in its brief and be judged against
  it ("would these two appear in the same show?").
- Reuse the exact token values above (e.g. sport's −8° skew, glass's blur 18) — don't improvise
  new ones per category.
- Category structure contracts mirror `.lower-third`: `.info-card`, `.credits`, `.ticker` roots with the same
  `:root` variable names, the same marked ANIMATION region, and the same auto-fit text rules.

## 9. Judging checklist (what reviewers score)

1. **Taste** — would this pass on a paid-asset marketplace? Palette discipline, spacing, type
   hierarchy per the rules above.
2. **Motion** — choreographed timeline, correct eases, right durations, fast-out; runs without
   jank; respects `animSpeed`; steps mode works when enabled.
3. **Auto-fit** — a 60-character name wraps to new rows, box grows upward, nothing overflows or
   clips wrongly.
4. **Code readability** — naming convention, every property/section commented, `:root` contract
   present, marked animation region present, simple ES5 JS.
5. **SPX validity** — `validateTemplate` passes; `update/play/next/stop` run clean; export is
   plug-and-play (relative paths, bundled font + GSAP).
