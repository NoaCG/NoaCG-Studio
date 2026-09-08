# Timeline & advanced animation — direction plan

> **STATUS 2026-07-22: HISTORICAL.** Every slice here shipped (T1-T3.x), and the
> literal-patching architecture this plan is written around was then retired by
> **Timeline v2** (`docs/TIMELINE_V2_PLAN.md` - the migration is complete; the patchers are
> deleted). The binding interaction contract today is `docs/TIMELINE_INTERACTION_MODEL.md`;
> the engine contracts live in `src/blocks/AGENTS.md`. Kept as the rationale record for the
> segment-chain model and the competitive research (Loopic / SPX steps).

The timeline's job: make **complex broadcast animation sequencing controllable and
reusable** — timing, easing, per-line choreography, and next()/step triggers — for people
who will never hand-edit GSAP. It is deliberately NOT the graphics creation surface (the
wizard + panels own creation) and NOT a Loopic-style keyframe composer clone.

## The anchor principle

The marked ANIMATION region is already a deterministic, re-emittable program: presets emit
`buildInTimeline()/buildOutTimeline()` with named knobs (`animSpeed`, `easeIn`, `easeOut`)
and per-phase preset comments the Motion panel can read back (`blocks/animPatch.ts`). The
timeline is a **richer view + richer knobs over that same region** — every timeline gesture
re-emits readable GSAP code between the markers; hand-written code outside them is never
touched. If the timeline can express it, the code shows it; if the code can't show it
readably, the timeline doesn't offer it.

## Phases

### T1 — Read-only timeline view (see the choreography) — ✅ SHIPPED + T1.5 (2026-07-08)
Parse the emitted region (we wrote it, so parsing is by construction, not heuristics) into
tracks: one row per animated element (accent, box, each line mask), bars for start/duration,
ease labels, phase markers (IN · OUT). Scrub pauses the live preview via the simulator.
**T1.5 (user feedback):** the timeline moved OUT of the Motion tab to where animation tools
put it — a collapsible strip directly under the preview, above the transport buttons — with a
**live playhead**: the simulator owns the running timeline (`window.__activeTl`), a rAF loop
follows it, ▶ Play sweeps the In phase, ■ Stop auto-switches to Out and sweeps it, loops wrap.
Idle parks at the end of In (the settled design-view state).

### T2 — Timing knobs on the tracks — ✅ SHIPPED (2026-07-08), simpler than planned
Implemented as **literal patching, not knob emission**: dragging a bar's body (start) or its
right-edge handle (duration) rewrites that tween's literals in the already-emitted region —
`patchTweenTiming` in blocks/timelineModel.ts, the T1 parser in reverse. Durations stay the
readable `N / animSpeed` form; a moved tween gets an explicit absolute position
(`N / animSpeed` — plain GSAP), replacing its '-=' overlap. Zero preset-module changes; the
emitted code keeps its sequential, commented shape; the speed knob still scales everything.
0.05s snap keeps literals two-decimal readable. One undoable applyTemplate per release +
auto-replay so the new timing is heard immediately. set() ticks and measured durations
(marquee width/speed) are non-editable by construction. Preset swaps still re-emit cleanly
(customizations are intentionally preset-scoped). **Per-element eases: deferred to T2.5**
(the easing vocabulary + direction doctrine in model/easings.ts stays the law).

### T3 — Steps & next() sequencing (the live-graphics differentiator) — PLANNED 2026-07-08

**Competitive research (sources: docs.loopic.io API docs, SPX HTML template docs):**
- **Loopic** models multi-phase graphics as ONE keyframe timeline with **Stop actions** (the
  playhead pauses there; the next command resumes toward the following stop) and an **Outro
  action** (the stop command plays from that frame). Intuitive AE-style authoring — but the
  step count is baked into the keyframes, so data-driven graphics (N credit lines, N quiz
  options) can't adapt; and their SPX "Steps" support was still listed as upcoming in their
  LiveOS integration notes.
- **SPX** itself only counts: `steps ≥ 2` shows the operator a **Continue** button; each press
  calls the template's `next()`. What a step DOES is entirely template-defined, and SPX shows
  nothing about what comes next.
- **CasparCG** `next()` = same contract; **H2R** has no next at all; **Singular.Live** uses
  state/payload control, a different paradigm.

**The NoaCG model — segment chain (the synthesis that beats both):** the graphic is a chain
`▶ IN → » Step 2 → » Step 3 → … → ■ OUT`, rendered on the timeline strip as consecutive
segments separated by playout markers — it LOOKS like Loopic's stop-point timeline (instantly
familiar), but each step segment is semantically generated from the fields, so the step count
follows the data and presets stay swappable. The operator-facing truth ("what plays on each
press") is the strip itself.

Slices:
- **T3.1 — Steps on the strip + live playhead. ✅ SHIPPED (2026-07-08).** Emit upgrade:
  `revealNextStep()` returns its tween, reads per-step knob arrays, and a fresh play resets
  `currentStep` (also fixed a latent replay bug). The strip renders the playout chain
  `▶ In · » 2 · » 3 · ■ Out` with real durations; the simulator owns each Continue's tween
  (`playNext` → `__activeTl: step-N`) so the playhead sweeps every press; templates with their
  own next() (quiz) fall back to plain `next()`. Scrubbing a step jumps IN + prior steps to
  their ends (suppressed); scrubbing OUT jumps ALL steps first (on air, everything has played).
  The `out` playout setting shows as a badge (auto-ms / no out).
- **T3.2 — Per-step timing/ease knobs. ✅ SHIPPED (2026-07-08).** The emitted steps block
  declares `var stepDurations = [...]` + `var stepEases = [...]` (readable literals, animSpeed
  still scales); `patchStepTiming`/`patchStepEase` rewrite one element; step bars stretch and
  pick eases exactly like phase bars. Older regions without the arrays simply show no step
  segments until any Motion-panel apply re-emits them.
- **T3.3 — Reveal groups (the better-than-Loopic move). ✅ SHIPPED (2026-07-08).** The emitted
  block declares `var stepGroups = [['#f1'], ['#f2', '#f3']]`; revealNextStep reveals a GROUP
  per next() (staggered 0.08s inside a group). On the strip, a step segment shows one row per
  line; dragging a row's bar onto another » tab moves the line there (`patchStepRegroup`
  rewrites all three knob arrays as one patch), an EMPTIED step disappears with its timing, and
  a »+ drop target (appears while dragging) splits a line out into a brand-new step. The
  moved line's destination segment is selected after the drop. Data-driven graphics get
  arbitrary reveal choreography with zero keyframing — the thing stop-point keyframe tools
  structurally can't offer. Legacy stepLines regions parse read-only until re-emitted.

Non-goals: freeform stop-points inside arbitrary hand-written timelines (the code editor is
the escape hatch, as ever); Singular-style state machines. The steps vocabulary stays within
the marked region + the SPX `steps` setting so every export target keeps working.

### T3.5 — Discoverability pass (user feedback) — ✅ SHIPPED (2026-07-08)
The engine worked but read as internals: rows were raw selectors, gestures and the fade
bars were only findable by hovering, and steps could only be turned on at creation (or in
the Motion checkbox nobody connects to the strip). Pure UX affordances, no new contract:
- **Plain-word rows**: labels name the element ("Whole graphic", "Panel", "Accent line",
  field titles for `#fN`); each bar carries its action verb ("fade + slide", "wipe",
  "draw", "reveal") derived from the parsed props. Raw selectors/props stay in tooltips.
- **»+ Step on the strip**: steps off → one click turns step reveal on (`setStepsMode` in
  animPatch — the SAME patch as the Motion checkbox, now shared); steps on → splits the
  last multi-line reveal group into a new Continue step (`patchStepRegroup`). Hidden when
  there is nothing to add; doubles as the new-step drop target while regrouping.
- **Inline hint line** under the tracks, per segment kind (retime/stretch/ease gestures;
  what a » segment means), and the ease chips read "ease · auto" instead of "auto".

### T4 — Custom sequences (escape hatch, later)
Add/reorder simple actions per element (move/fade/scale/blur) as new emitted tweens in the
region — still preset-grade readable output with comments. The moment a request needs
free-form keyframes, the answer is the code editor, one click away.

## Non-goals

- No general-purpose keyframe editor, no curves UI beyond the easing vocabulary.
- No timeline-owned state: the region is always the truth; reload from code at any time.
- No new runtime: GSAP timelines as today; `ease: 'none'` stays reserved for continuous
  motion (tickers/credits) per DESIGN_LANGUAGE §4.

## Sequencing vs Era 6

T1 (read-only view) can ship independently and even before WYSIWYG W2+ — it needs no new
code contracts. T2 needs a knob-emit extension per preset (touches every preset module —
plan one mechanical pass). T3 builds on the existing steps machinery. Recommended order:
W1 → T1 → T2 → W2/W3 → T3, re-evaluated against user feedback.
