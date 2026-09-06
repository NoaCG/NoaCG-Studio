# Dynamic (measured) motion — scope for migrating tickers & credits

This is the design scope for the one gap that keeps **tickers** and **end credits** on the legacy
patchers (and therefore blocks Phase 8 of `docs/TIMELINE_V2_PLAN.md`). It is the follow-up the
loop/yoyo work named: loop/yoyo unblocked starting-soon, but explicitly **not** tickers/credits,
because their motion is computed from live DOM measurement, which the static keyframe model
deliberately cannot express (`docs/PRESET_MODEL_REVIEW.md` gap 6, and gap 3's spirit).

Status: **BUILT AND SHIPPED.** The `dynamics` primitive is in the model, the interpreter, the
importer, validation, and the timeline; tickers and end credits create as data blocks on it. The
open questions in §8 are ratified below. This document is now the *rationale* record — the
binding contracts live in `src/blocks/CLAUDE.md` (the engine) and `src/templates/CLAUDE.md` (the
category runtimes).

**The one design change from the sketch below:** the region does not need a new "reference a
builder" syntax invented for it, because the preset emits an ordinary `tl.add(builderName(target))`
and the *legacy* reader was taught to see it. That single move keeps ONE choreography source (the
preset emitter) and means measured motion rides the existing importer exactly as `tl.call` hooks
already do — no second code path, and the parity harness compares data against the real legacy emit.

## 1. What these categories actually need (from the code)

The five loop presets (`src/templates/tickers/tickerPresets.ts`,
`src/templates/endCredits/creditsPresets.ts`) split into two hard requirements:

**a) Measured scalar values** — a keyframe value and/or a tween duration derived from a live DOM
measurement, not a literal:

- `ticker-marquee`: `oneSet = track.scrollWidth / 2; x → -oneSet; duration = oneSet / (140 * speed)`, `repeat: -1`.
- `credits-roll`: `endY = -listHeight; duration = (startY - endY) / (90 * speed)`, where `listHeight`
  reaches the closing `.credits-end` block rather than the track's full height - the roll runs the
  list all the way off the top, and the mark arrives after it as its own beat (owner walk
  2026-08-28). Before that walk it was `-(track.scrollHeight - box.clientHeight/2 - endBlock.offsetHeight/2)`,
  which stopped with the last names still on screen and the logo held in the middle.
- `credits-crawl`: `endX = -listWidth; duration = distance / (160 * speed)` - the same change along x
  (previously `-(track.scrollWidth - box.clientWidth)`).

The magnitudes change with the operator's text, so **no static keyframe number can hold them** —
baking a measured pixel value into the data would be wrong the moment the content changes.

**b) Content-driven sequences** — the *number* of animation segments equals the number of DOM
children at runtime:

- `ticker-flip`: `gsap.timeline({repeat:-1})` with one flip-in / hold / flip-out per `.ticker-item`.
- `credits-pages`: one fade-in per `.credits-page`, with a per-page hold derived from the page's row count.

No fixed-length keyframe track can represent "one segment per child."

## 2. Approaches considered and why they lose

- **Measured-value keyframes** (a keyframe whose `value`/`time` is a `{ measure: el, of: "scrollWidth" }`
  descriptor the interpreter resolves at play time). Handles (a)'s simplest case, but credits-roll's
  three-measurement arithmetic needs a real expression, and it cannot express (b) at all (dynamic
  segment count). Two shapes to cover the five presets.
- **A restricted formula grammar** (named measurements + a safe `+ - * / ()` evaluator over them).
  Covers (a) including the arithmetic, still cannot express (b), and it introduces a mini-language —
  against the house rule of simple, obvious code, and adjacent to the no-`eval` posture the community
  bench guards.
- **Keep them fully hand-crafted (status quo).** They then never get the data-block surface, so the
  classic strip and legacy patchers can never be retired for them — Phase 8 stays blocked.

## 3. The proposed primitive: named dynamic motion segments

Mirror the §3b step-calls model exactly, but for **motion** instead of side effects. A step gains an
optional `dynamics` list; each entry names a **design-owned builder function** (a bare identifier,
resolved by `window[name]` at build time — no `eval`, no arguments-as-code) that **returns a GSAP
tween/timeline**, which the interpreter adds to the step timeline:

```json
{ "name": "Enter", "duration": 0.5, "ease": "power2.out",
  "dynamics": [ { "build": "marqueeLoop", "target": "#ticker-track", "time": 0.5 } ],
  "layers": { ".ticker-box": { "opacity": [ { "time": 0, "value": 0 }, { "time": 0.5, "value": 1 } ] } }
}
```

- `build` — a global function defined in the template's **own JS, OUTSIDE the marked region** (a
  design-owned runtime, exactly like the countdown clock engine `shared/clock.ts` that game-timers
  and starting-soon already ship). It reads the DOM, does whatever arithmetic it needs in plain
  readable JS, and returns a GSAP object (or `null`).
- `target` — an optional selector passed to the builder, so one builder can serve many targets.
- `time` — optional placement on the step's clock (the marquee starts after the entrance fade).
- Schema key order on the step becomes `name, duration, ease, reveals, hides, calls, dynamics, loops, layers`.

### Interpreter (additive to `animRuntime.ts`)

```js
// Dynamic motion: a design-owned builder measures the DOM and returns a GSAP tween/timeline
// (a marquee's width-derived travel, a credits roll). Resolved by name at build time — the
// timeline never owns this logic. A missing builder is a silent no-op.
for (var d = 0; d < (step.dynamics || []).length; d++) {
  (function (name, target, at) {
    var fn = window[name];
    if (typeof fn !== 'function') return;
    var seg = fn(target, { speed: speed });
    if (seg) tl.add(seg, (at || 0) / speed);
  })(step.dynamics[d].build, step.dynamics[d].target, step.dynamics[d].time);
}
```

### The design-owned builder (outside the region, ships in every export)

```js
// The marquee travel — measured at play() time. The track holds the items twice, so sliding
// exactly one set (-scrollWidth/2) and repeating looks seamless. Edit the speed here.
function marqueeLoop(target) {
  var el = document.querySelector(target);
  var oneSet = el.scrollWidth / 2;
  var pxPerSec = 140 * motionSpeed();        // motionSpeed(): NOACG_ANIM.speed, else 1
  return gsap.fromTo(el, { x: 0 },
    { x: -oneSet, duration: oneSet / pxPerSec, ease: 'none', repeat: -1 });
}
```

credits-roll's three-measurement formula and ticker-flip's/credits-pages' per-child sequences are
just ordinary JS inside their builders — the same code they are today, lifted out of `buildInTimeline`
into a named function the data references.

## 4. Why this is the right shape

- **It fits every one of the five presets uniformly** — measured scalars and content-driven
  sequences both reduce to "a builder returns a timeline," where two other approaches each cover only
  part.
- **It is the smallest possible addition** — one optional step field, ~7 interpreter lines, a direct
  copy of the ratified §3b calls pattern (`{ call }` side effects → `{ build }` motion).
- **It honors every pillar.** No `eval` (a `window[name]` lookup). Code is real and the source of
  truth — the measured logic stays readable JS where it belongs. The visual timeline **correctly
  steps aside** for a track it cannot meaningfully keyframe (you cannot visually keyframe "travel by
  measured width"); it renders the segment read-only ("measured motion — `marqueeLoop()` — edit in
  code"), which is honest, not a limitation. Preview/export parity is structural (the builder ships
  verbatim, one implementation). Offline-first is untouched.
- **It unblocks Phase 8 for these categories** — they gain the NOACG_ANIM data-block shape (static
  entrance/exit as keyframes + a dynamic segment for the travel), so they render on `StepTimeline` and
  no longer need the classic strip.

## 5. How each preset maps

As built (the builders live in `src/templates/tickers/tickerMotion.ts` and
`src/templates/endCredits/creditsMotion.ts`):

| Preset | Static (keyframes) | Dynamic segment (builder) |
|---|---|---|
| ticker-marquee | `.ticker-box` opacity fade in/out | `tickerMarquee('#ticker-track')` — measured, `repeat:-1` |
| ticker-flip | box fade | `tickerFlipCycle('#ticker-track')` — per-item `timeline({repeat:-1})` |
| credits-roll | box fade | `creditsRoll('#credits-track')` — three-measurement linear travel |
| credits-crawl | box fade | `creditsCrawl('#credits-track')` — measured horizontal travel |
| credits-pages | box set | `creditsPages('#credits-track')` — per-page fade/hold sequence |

## 6. Validation & timeline UI

- **Validation** (`validateTemplate.ts`): `build` is a bare identifier and the named function is
  defined in `template.js` (warning if missing — same spirit as the dangling-selector and undefined-
  call checks); `target`, when present, should match an element.
- **Timeline** (`StepTimeline.tsx`): a read-only "measured motion" row per target, naming the
  builder, open-ended, with a tooltip that it is edited in code. The §3b calls glyph (a `lifecycle`
  row of named pins) and the `loops` repeat tail shipped alongside it, on the same principle: the
  timeline surfaces every code-owned thing in the data so it never silently hides motion, and makes
  none of them draggable so it never implies an affordance it doesn't have. See
  src/components/CLAUDE.md, "the three read-only surfaces".

## 7. Migration path

- **Catalog templates are regenerated** — the ticker/credits presets emit the new shape directly
  (data block + dynamic segment + the design-owned builder, emitted before the region like the clock
  engine). We own these; no importer round-trip is needed for them.
- **Preset swap for dynamic categories** — swapping marquee↔flip is swapping the builder reference and
  regenerating, not a keyframe edit. `presetApply` (or a category-specific regenerate path) must learn
  to carry a dynamic segment. **Open question** (§8).

## 8. The open questions — RATIFIED

1. **Saved / community / AI legacy tickers → keep a READ-ONLY legacy renderer.** The importer can
   carry a *named* builder across; it cannot lift arbitrary measured JS out of somebody's
   hand-written `buildInTimeline`, and it never guesses. So a saved ticker that inlines its own
   `scrollWidth` math is **refused honestly** and stays legacy.
   **Decision:** Phase 8 retires the classic strip's *editing* patchers (timelineModel's
   `splitTween` / `patchTweenTiming` / … — the bulk of the code) but **keeps a minimal read-only
   view**, so such a template still renders truthfully on the timeline. Converting stays an
   explicit, undoable user action. Auto-regenerating was rejected: it would silently discard
   hand-tuning, which "code is the single source of truth" forbids. Pinned by the refusal test in
   `e2e/anim-engine.spec.ts`.
2. **Preset swap → a pure data edit.** Every builder for a category ships in every template of it
   (a ticker carries both `tickerMarquee` and `tickerFlipCycle`), so swapping the preset swaps the
   `dynamics` entry's `build` name and nothing outside the marked region is touched — which the
   marker contract requires. `presetApply` carries `dynamics` on a whole-graphic swap exactly as it
   already carries `calls`; per-layer applies never touch either, because both are step-level.
   The cost is one or two unused (but commented, and callable) builders in an export — a fair price
   for a swap that stays a one-line data change, and arguably a feature: the template ships its
   category's small motion library.
3. **Speed knob stays in the builder** (code-owned), read through `motionSpeed()`. Unchanged from
   the sketch; surfacing it as a Style knob remains a possible later enhancement.
4. **Builder naming: bare globals, category-prefixed** (`tickerMarquee`, `creditsRoll`) rather than
   a namespace object. The prefix is what avoids collisions across composed packets, and a bare
   function keeps the `window[name]` lookup — and the generated code — as plain as everything else
   in a template.

## 9. Explicitly NOT in this primitive

No expression language, no measured-value keyframe type, no arbitrary JS in the data (the data holds a
name and a target — the logic stays in code), no visual editing of measured travel, no attempt to make
the importer auto-convert arbitrary hand-written measured motion.

## 10. What shipped

The `dynamics` primitive as the direct §3b twin — schema, interpreter, importer, validation, and the
read-only timeline block — with tickers and end credits created onto it, and a parity harness that
compares each measured preset against its legacy emit at sampled times across short and long content
(`e2e/anim-engine.spec.ts`).

Where it landed differently from the sketch: the region references its builder with an ordinary
`tl.add(builderName(target))` and the legacy reader parses that, so there is exactly ONE choreography
source (the preset emitter) and the measured motion rides the existing importer the same way `tl.call`
hooks do. That also made the preset swap fall out for free as a pure data edit (§8.2).

**What it unblocks:** tickers and credits are off the legacy patchers — and then INFOGRAPHICS, which
turned out to be the purest case of all: every one of their motions is measured (the stat counts to
the operator's figure, each bar grows to its own `data-value`, the ring draws to that percent, the
cascade runs one row per line they wrote), so all four presets became a keyframed panel entrance plus
one named builder (`igMotion.ts`). Two things the infographic pass taught, both now in
src/templates/CLAUDE.md: a builder may COMPOSE another (count-up adds the bar growth once the figure
lands), and a `tl.add()` needs an EXPLICIT position whenever a phase has more than one — a segment is
zero-advance on the importer's clock but a real child on GSAP's, so a bare `'-=N'` after one resolves
differently in the two.

The quiz then flipped on §3b calls (`docs/TIMELINE_V2_PLAN.md` §3c), and INFO CARDS last of all —
so **every category now creates as a data block and the migration is complete**.

**Phase 8 then shipped (2026-07-15), and §8.1 held exactly as ratified**: the strip's *editing*
patchers are deleted, and a read-only renderer stayed — `components/timeline/LegacyTimeline.tsx` — for the
templates this document is about. A hand-written measured region is precisely the thing that can
never be auto-converted, so it is the ONE case that still needs the classic chart; an importable
legacy region gets the step timeline read-only instead, with "use keyframes" one click away.
Coverage: `e2e/legacy-timeline.spec.ts`.

## 11. How measured motion SETTLES (2026-08-26)

A surface that shows a graphic *without* a playback gesture - a Home card, a library thumbnail,
the editor canvas at rest, the operator's preview before the first take, the wizard's preview on
every step but Animation - has to park it somewhere. For keyframed motion that place is obvious:
the end. Measured motion has no obvious end at all, and the two faults below are the same fact
seen from either side.

**Its END is not `progress(1)`.** GSAP reports a `repeat: -1` child's total duration as its
"forever" sentinel, ~1e10 s, and a timeline holding one inherits it - so `progress(1)` seeks to
t = 1e10, which is a phase of whatever is still looping rather than the end of anything. Every
end-credits design carries an ambient background drift with `repeat: -1`, so every credits
timeline reports 1e10, and the two whose travel is ITSELF endless - the `credits-loop` reel,
cr06 and cr08 - settled to a **completely empty frame** on every Home card, every library
thumbnail, the editor canvas and the operator preview.

Measured on 2026-08-26, viewport coverage of the settled frame:

| recipe | cr06 | cr08 | cr01 (a roll) |
|---|---|---|---|
| one jump, `progress(1)` | 0% | 0% | 69% |
| one jump, the finite end | 51% | 69% | 69% |
| two jumps, the finite end | 100% | 100% | 69% |

Both halves ship, in `preview/settleGraphic.ts` and its twin in `preview/simulatorRuntime.ts`.
**The SECOND JUMP is the one that carries it**: a design whose `update()` re-renders its rows
throws the settled frame away with the elements it was written on, so the jump is re-derived
over whatever `update()` just built. **The finite end is the narrower correctness fix beside
it** and changes nothing at all on a roll, whose travel is finite - it earns its place because
landing on a full frame ten billion seconds in is luck, holding only because a reel clones
enough copies to cover the viewport at any phase. An endless track is left wherever the finite
motion put it, because "the end" of a thing that never ends is not a place. Gate:
`e2e/end-credits.spec.ts` measures every credits design's settled coverage - the check that was
missing, and the reason nothing in the tree could see an empty preview.

**Its BEGINNING is not worth showing either.** Measured motion is content-length motion and it
starts with its content off-stage by construction: cr01's roll covers 0% of its viewport for the
first 1.5 s and is not recognisably a credit roll until about 12. The wizard's preview used to
play it from zero on every rebuild, so the Fields and Style steps answered "what does this design
look like" with an empty box at the exact moment somebody decides whether the template is any
good. It now **settles** a graphic with measured motion and plays everything else, deciding from
the data (`blocks/animData.ts` `hasMeasuredMotion`) rather than from the category. The Animation
step (`WizardPreview`'s `rehearse`) and ▶ Replay still play from zero - both are the reader asking
for the motion rather than for the picture.

### 11a. A readout's final value is a SET, never only a callback (2026-08-27)

The jump above suppresses GSAP's callbacks. A tween still writes its target under it; a callback
does not. So a value that reaches the DOM *only* from an `onUpdate` or an `onComplete` never
arrives, and the settled graphic shows whatever the opening `set` wrote.

Measured on `main`, 2026-08-27, through `composeDocument`'s real serialized bootstrap:
**seventeen counting readouts across eleven infographics rendered 0** against their own
`data-target` - ig01 "Big Stat" showing `0%` where the data said `87%`, on every Home card,
library thumbnail, Browse card and operator preview. The first number a browsing user sees was
a broken one.

**The rule, and it is a rule about the EMITTED runtime rather than about either settle recipe:**
every count ends on a `tl.set` of its real text, positioned at that count's own end. A `set` is a
zero-duration tween, so it renders under suppression - the same property that caused the bug,
used the other way. Under normal playback it writes exactly what the `onComplete` beside it
already wrote and changes nothing; under a jump it is the only thing that writes. Landed in
`templates/infographics/igMotion.ts` (four builders) and `templates/poll/pollMotion.ts` (one),
each carrying the rule in its own source.

**The audit it belongs to is "does this readout depend on a callback firing", not "is it a
number".** A width, a dashoffset, a scale and an opacity are tween TARGETS and settle correctly
on their own - which is why the bars, the rings and the milestone nodes were never wrong while
every figure beside them was. Adding a readout means adding its `set`.

**Why the fix is one layer down, and not an ordering.** For one day the two settle recipes ran in
opposite orders, because the two runtimes want opposite things and both faults were real: credits
want the jump LAST (`rebuildCredits` reassigns the track's `innerHTML`, so an `update()` after the
jump throws the settled frame away with the elements it was on), an infographic wanted the DATA
last (only a following `update()` put the figure back). No ordering of `update`/`jump`/`update`
satisfies both, which is how you know the ordering was never the question. With the rule above,
the figure survives a jump on its own and needs no ordering favour, so `preview/simulatorRuntime.ts`
takes `preview/settleGraphic.ts`'s recipe verbatim again. Measured on the editor canvas the day
the divergence was removed: cr06 51% -> 100%, cr08 69% -> 100%, cr01 unchanged at 69%, and all 21
marked readouts in the catalog reading their own figure.

**The gates.** `e2e/counting-settle.spec.ts` sweeps the whole catalog, keeps every design whose
COMPOSED DOCUMENT carries `data-target`, settles it and fails on any readout that disagrees with
its own data. The design set is discovered rather than listed, so a counting design in any
category is covered the day it lands. It runs on BOTH recipes, and so does
`e2e/end-credits.spec.ts`'s coverage sweep - two copies of a recipe that are only ever measured
one at a time are two recipes, which is exactly how the divergence lasted as long as it did.

### 11a-ii. A readout empties when the GRAPHIC appears, not when its count starts (2026-08-27)

The other end of the same timeline, found the day after 11a by playing a stat card from the
playout dashboard: the final count, a snap to zero, then the count up to the number that had just
been on screen.

**A dynamic's `time` is a HEAD START.** The step reveals the graphic at 0 and the measured motion
begins a few tenths later, once the panel has settled - which is right for the motion and wrong
for the DATA. A playout server writes the data BEFORE it takes the graphic: SPX, CasparCG and our
own dashboard all call `update()` then `play()`. So a count that empties its own readout when the
count begins leaves the operator's real figure on screen for the whole head start. The presets
were already emptying the bars, the rings and the progress lines on the entrance's first frame;
only the FIGURES were left out of that opening.

Measured 2026-08-27 in the playout order: **twelve readouts across ten designs - every counted
readout in the catalog.** 11a's settle sweep could never have seen it, because a jump renders the
zero and the figure in the same frame. Only real playback has a gap.

**The primitive grew one option and one marker, both additive.** The interpreter now hands the
head start over as `opts.lead` as well as using it as a position, and a builder that positions its
own contents from it says so by marking the timeline it returns `noacgLeadApplied`; that timeline
is added at 0, where its opening zero lands on the step's first frame:

```js
var lead = (at || 0) / speed;
var segment = build(target, { speed: speed, ease: step.ease, lead: lead });
if (segment) tl.add(segment, segment.noacgLeadApplied ? 0 : lead);
```

Absolute timings are unchanged - the count starts and lands exactly where it did; only the
emptying moved. **A builder that owns no readout ignores the lead, returns an unmarked timeline
and is added at the offset exactly as before**, which is every measured motion in every other
category. That is deliberately opt-in: making every builder lead-aware would move the emitted
bytes of the whole catalog for categories with no readout to fix.

**Neither the data model nor the region's own shape changed**, and that was a constraint rather
than a preference. `blocks/timelineModel.ts` `parseAddSegment` accepts exactly
`tl.add(builderName('#target'))` with an optional position; a second argument in a preset's emit
makes it return null, which makes `importAnimData` refuse the whole template, which silently ships
every infographic with a LEGACY region and a read-only timeline dock. The head start already lives
in the data as the dynamic's `time`, so the runtime re-derives the lead from it and the preset's
emit is untouched.

**The gate** is the played-path sweep in `e2e/counting-settle.spec.ts`: `update()` with the
design's own field defaults, `play()`, then a reading on every animation frame. It decides which
readouts COUNT by whether their text moves during the entrance - `update()` writes `data-target`
onto every field, so the mark alone also catches static captions no builder touches - and asserts
both halves: no readout shows its figure on the first frame it is visible, and every one of them
still ends the entrance on its own data.

### 11b. The emitted runtime still uses `progress(1)`, and the reason has changed

`templates/shared/animRuntime.ts` seeks with `progress(1, true)` in three places: finishing one
step's timeline before the next begins, and twice inside `noacgSnap`, which replays a state's
canonical route to enter it instantly.

The original argument for leaving it was that this is a different question - "is this step over"
rather than "where does this graphic rest". **That argument does not survive contact with
`noacgSnap`**, which is precisely "where does this graphic rest", stated in the state machine's
own vocabulary (`docs/STATE_MACHINE_SCHEMA.md`: every state is enterable by transition or by
SNAP). A state whose entry timeline holds a `repeat: -1` child - a `loops` track, or a `dynamic`
builder returning an endless timeline - reports 1e10 and snaps to an arbitrary phase of the loop,
in an export, under SPX and in the browser-output renderer, where no preview recipe reaches.

It is reachable today: `templates/types/ticker.ts` persists a machine and a ticker's marquee is
endless. It is currently harmless for exactly the reason 11 calls luck - a marquee renders its
items twice and covers the strip at any phase. The next endless entrance that does not will not
be lucky.

**Left as it is on purpose, and the why is the blast radius rather than the argument.** The fix is
the same finite-end seek, but it changes the emitted JavaScript of every template in the catalog,
so it moves both catalog baselines and wants the five catalog gates behind it. That is its own
branch, not a rider on a branch fixing a visible zero. Backlog:
`docs/backlog/settle-emitted-runtime-finite-end.md`. **Revisit the moment a machine-bearing design
carries an endless child in a state entrance whose coverage is not phase-independent** - that is
the trigger, and it is a design review question, not something a gate can ask.
