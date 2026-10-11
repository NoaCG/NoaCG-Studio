# Animation in SVG-based graphics - direction

**Status: design review, 2026-08-28.** Owner brief: a professional live graphic has continuous
motion ON AIR - moving patterns, looping accents, animated masks, glows, gradients, subtle
pulses. SVG provides the artwork and layer structure; NoaCG provides the behaviour. This
document answers where that lives in the EXISTING model, what is genuinely missing, and what
one phase of work would close. Nothing here is scheduled; it proposes, the owner decides.

Grounding: `docs/STATE_MACHINE_SCHEMA.md` (the model), `docs/SVG_IMPORT_PLAN.md` (how artwork
arrives), `docs/DYNAMIC_MOTION_SCOPE.md` §11 (how endless motion settles),
[issue #774](https://github.com/NoaCG/NoaCG-Studio/issues/774) (the known open edge this direction
triggers), `docs/EDITOR_RESEARCH.md` (the market read on looping).

---

## 0. One-page summary

**Three classes of motion, one model, and two of the three are already whole:**

| Class | What it is | Where it lives today | Gap |
|---|---|---|---|
| **In/out** | The graphic arriving and leaving | `steps` + the lifecycle edges (`play`/`stop`), transition styles | None - shipped and complete |
| **State/event** | Motion fired by an operator event or a timer | `machine` transitions, entry timelines, snap | None - shipped and complete |
| **Ambient** | Motion that continues WHILE the graphic is on air | `loops` per track (repeat/yoyo/repeatDelay) + `dynamics` builders - both shipped runtime primitives | Real, and smaller than it looks: a definition of "end", a rest contract, and an authoring surface |

**The brief's framing is challenged in one place.** Ambient is not a new class needing new
machinery - the model already runs a `loops` track in its own repeating sub-timeline (the
"ambient breath" that let STARTING SOON flip to data blocks), and `docs/EDITOR_RESEARCH.md`
measures our loop model as already better than every competitor's, "one editing affordance
short". What is actually missing is that the runtime's notion of a timeline's END is
`progress(1)`, and an endless child poisons that end: a timer never arms on it
(`validateMachine` rightly refuses), and a settle/snap seeks ten billion seconds into the loop.
**The one semantic change this direction asks for is: "end" means the FINITE end** - the last
moment anything with an end is still moving - everywhere the emitted runtime asks (timer
arming, step finish, snap, settle). With that, ambient stops being a special case and becomes
an ordinary track property, legal in any state, coexisting with timers, surviving snap.

**Recommended decisions (§9):** ratify finite-end as the model rule; ratify ambient = `loops`
tracks under a rest-pose-first preset contract, no new primitive, no second animation system;
approve the one-phase MVP (§6); answer the ambient-scope question (§8.1).

---

## 1. The three classes on the one model

**In/out** is the default path's first and last waypoints, materialised as `lifecycle`
transitions so the entrance and exit are stylable arrows. Whole-graphic in/out for an imported
SVG already works: the design presets animate the wrapper, `design-stagger` animates the
top-level named groups with per-layer offsets. Nothing to change.

**State/event** is the machine: operator events through the serial queue, timers armed at the
entry timeline's end, structural guards, snap as the instant entry. An imported SVG gets
behaviour by taking a graphic TYPE (the quiz, the scoreboard - the current push), whose machine
addresses the SVG's layers exactly as it addresses any DOM. Nothing to change.

**Ambient** is a track that repeats while the graphic is up. The primitive exists twice over:

- `step.loops[selector][prop] = { repeat, yoyo, repeatDelay }` - a keyframe track played in its
  own repeating sub-timeline, added at the track's first keyframe time (`animRuntime.ts`
  `buildStepTimeline`). This covers the brief's pulses, glows, drifts, sheens, breathing -
  authored motion with a fixed period.
- `dynamics` builders - measured motion whose magnitude only exists once the content is in the
  DOM (a marquee's travel). This covers ambient motion whose period depends on content.

What does NOT exist, and stays out: SMIL (`<animate>` is stripped on import, deliberately -
wall-clock time the render clock cannot drive), CSS animations in generated ambient (a second
clock beside GSAP's; the virtual render clock and the bench's timeScale only reach GSAP), and
any new looping primitive. HyperFrames/Remotion stay study material only.

## 2. Where ambient lives: the finite end

Three facts currently collide, and all three are the same fact:

1. **A timer never arms on a timeline that never ends** (`validateMachine hasEndlessMotion`) -
   so a state cannot both breathe and auto-advance. This is why the ticker is a rotator, and
   why today an ambient accent in a transition-type or ticker state is structurally illegal.
2. **Snap and step-finish seek with `progress(1, true)`** - a `repeat: -1` child makes GSAP
   report ~1e10s, so the emitted runtime snaps an endless entrance to an arbitrary phase, in
   exports, under SPX, in the browser-output renderer
   ([issue #774](https://github.com/NoaCG/NoaCG-Studio/issues/774)). Currently harmless by luck (a
   marquee covers its strip at any phase); the first ambient glow on a quiz board is exactly
   the design that stops being lucky. **This direction is the trigger that backlog item
   names** - the MVP starts with it.
3. **The preview recipes already solved this** - `preview/settleGraphic.ts` seeks to the
   finite end (the last moment anything finite is still moving) and leaves endless children
   where the finite motion put them. The fix is known, measured, and one runtime deeper.

**The rule proposed:** the emitted runtime adopts `noacgFiniteEnd` at every site that asks
"is this timeline done" - the three `progress(1, true)` seeks AND the timer-arming call. A
timer's `after` then counts from the finite end, which is what "the entry timeline settling"
always meant. `validateMachine`'s endless guard narrows to what is genuinely unknowable: a
`dynamics` builder's duration (measured at play time - a timer on it stays refused); a `loops`
track no longer poisons the state, because its finite siblings define the end. A state whose
timeline is ONLY a loop has finite end 0 - the timer arms at entry, which is deterministic and
right.

**The rest contract - how ambient survives snap.** Snap replays the canonical route with
suppressed callbacks and re-arms afterwards; a settled preview never plays at all. So every
ambient preset makes its FIRST KEYFRAME the rest pose - the loop starts at rest, excursions
return to rest (yoyo, or a closed cycle). Then a suppressed loop shows exactly the drawn
artwork, a settled thumbnail is the designer's file, and the phase a live loop happens to be
in never matters for recovery. This is a PRESET contract the wizard ceiling guarantees; for
agent-authored loops it is a validation WARNING, not an error (an agent may want a loop that
rests off-pose; it is told what that costs on thumbnails and snap, not refused).

## 3. Layer addressability - what import must keep, not stop doing

Import already flattens nothing: the SVG is inlined verbatim, and the layer inventory
(`assets/svgImport.ts`) already reads author-given names (`id`, `data-name`,
`inkscape:label`). `svgLayerSelectors` already exposes the top-level named groups as animation
units - `design-stagger` binds them today. The rules that keep identity animatable:

- **A layer's identity is its author-given name, and sanitization must never strip or rewrite
  it.** Binding is by id selector, never by structural position - the logo-slot lesson
  (`nth-child` renumbering) applies verbatim to anything injected beside SVG layers.
- **Depth: ambient wants more than the top level.** A glow shape, an accent line, a pattern
  group usually live INSIDE a named group. The inventory should offer named groups and named
  shapes at any depth as ambient targets, ranked outermost-first (the existing tie-break), a
  hidden outlined group still excluded. Top-level-only is a stagger decision, not an identity
  limit - the ids are already in the file. (Backlog: `svg-deep-layer-addressability.md`.)
- **`update()` and ambient never fight.** `update()` writes textContent/href into `fN` nodes;
  ambient tracks animate transform/opacity/filter on layer selectors. Disjoint properties on
  possibly-shared subtrees - the one rule is the existing one: a follower travels by its
  transform ATTRIBUTE while GSAP animates the style transform, so the two compose rather than
  overwrite.
- Gradients and masks are addressable the same way (`<linearGradient id>`, stop offsets,
  `stroke-dashoffset` travel) via GSAP `attr` tweens on the same clock - possible in the agent
  ceiling today, a preset question later (§8.5). No new mechanism.

## 4. One format, two ceilings

**The format is NOACG_ANIM, full stop.** The wizard and the agent write the same block; the
difference is what each surface is willing to write for you.

- **Wizard ceiling: ambient PRESETS.** A small named bank - breathe (scale yoyo), glow-pulse
  (opacity/filter yoyo), drift (slow translate cycle), sheen (a highlight travel) - each a
  deterministic `(template) => template` emitting `loops` tracks bound to picked layers,
  rest-pose-first by construction. Offered where `design-stagger` is offered (the Animation
  step for svg01), per layer, with period and depth as the only knobs. The editor draws the
  repeat tail it already draws; loop AUTHORING in the timeline is the separate editor slice
  `docs/EDITOR_RESEARCH.md` already queues, not this road's dependency.
- **Agent ceiling: the raw block.** A coding agent through the CLI/bridge writes any `loops`
  track on any selector, `dynamics` builders for measured motion, custom machines (open since
  2026-08-27) - gated by the same `validateTemplate`, benched by the same runtime bench. More
  freedom, never a different format: a wizard graphic opened by an agent, or an agent graphic
  opened in the editor, is the same document with nothing lost either way.

## 5. Determinism across every target

- **One clock.** All ambient motion is GSAP on the template's own timeline: the render
  pipeline's virtual clock drives it frame-exactly, the bench's timeScale accelerates it, and
  OGraf's non-real-time `goToTime` gets a pure function of t. This is the standing reason SMIL
  and CSS animations stay out of generated ambient.
- **Every surface with no preview in it** - exports, SPX, CasparCG, the `/output` renderer,
  generated control pages - runs the same emitted interpreter, so the finite-end change (§2)
  is what makes settle/snap agree everywhere. The preview recipes and the emitted runtime
  answering "where does this graphic rest" differently is the current defect, not a risk.
- **Performance is a preset discipline.** Ambient runs for hours on a playout box. Presets
  stay on compositor-friendly properties (transform, opacity; filters sparingly and named as
  a cost), and the runtime bench is the measuring instrument. An agent can exceed this; the
  bench tells it so.

## 6. MVP - one phase, honestly sized

**"The finite end, and the first ambient preset on imported SVG."** One branch:

1. **`noacgFiniteEnd` in the emitted runtime** at the three seek sites and the timer-arming
   call; `validateMachine`'s endless guard narrowed to measured `dynamics` only. This
   graduates [issue #774](https://github.com/NoaCG/NoaCG-Studio/issues/774) - its fixture demand holds:
   a machine-bearing template with an endless child in a state entrance, snapped, must land
   where the finite motion put it, and no such design exists yet, so the fixture is most of
   the test work.
2. **Two ambient presets** - breathe and glow-pulse - emitting rest-pose-first `loops` tracks
   on picked layers, offered on svg01's Animation step beside `design-stagger`.
3. **The gates:** both catalog baselines re-recorded (every template's emitted JS moves - the
   known blast radius), the five catalog gates, the new snap-rest spec, and one played-path
   spec proving a breathing graphic still timer-advances (the ticker's guarantee, inverted).

Not in the MVP: deep-layer targets, more presets, measured ambient outside the shipped
category builders, gradient/mask presets, state-scoped ambient, loop authoring in the
timeline. Each is filed (§8, backlog).

## 7. Risks

- **Whole-catalog byte churn.** The runtime change moves every template's emitted JS - the
  baseline re-record must be the healthy one-hash-per-variant diff and nothing else, and it is
  why the MVP is its own branch, never a rider.
- **Timer semantics move for loop-bearing states.** Today none can exist (validation refuses),
  so no shipped design changes behaviour - but the guard relaxation must keep the measured
  case refused, or a marquee state gains a timer that never fires, silently.
- **The rest contract is unenforceable at the agent ceiling.** A warning, thumbnails and snap
  honestly showing the cost, and nothing more - enforcement would be the expression-language
  mistake in miniature.
- **Playout-box load.** Endless tweens per layer, per graphic, on CasparCG's browser. Preset
  discipline plus the bench; a numeric budget is an open question (§8.4), not a guess to bake
  in now.

## 8. Open questions (honest, none blocking the MVP)

1. **Ambient scope: graphic-lifetime vs state-scoped.** A loop in the ENTRANCE step survives
   every later state (step-finish seeks it, nothing kills it) - graphic-lifetime ambient by
   construction, and the right default. A loop in a STATE's entry timeline also keeps running
   after the state is left, which may or may not be wanted; "stop this loop on exit" has no
   expression today. Needs a rule before per-state ambient presets ship; candidate: leaving a
   state finishes its endless children at their rest pose. (Backlog:
   `svg-ambient-state-scope.md`.)
2. **Where the wizard asks.** Ambient beside the stagger on the Animation step (proposed), or
   a later per-layer surface on the mapping step's canvas road (§6a of the import plan).
   Cheap either way; a UX walk decides.
3. **Measured ambient for arbitrary artwork.** The `dynamics` builders are category-owned; a
   generic drift/marquee builder for an imported SVG layer would be the first design-agnostic
   one. Wanted eventually, not yet - and never inline measured math in the region.
4. **A load budget** for concurrent ambient tracks, measured on the real playout box, so the
   bench has a threshold instead of an opinion.
5. **Gradient, mask and dash presets.** Addressable today at the agent ceiling via `attr`
   tweens; preset-izing them needs per-file geometry detection (which stop, which dash) -
   later, evidence first. (Folded into `svg-ambient-preset-bank.md`.)

## 9. Recommended next decisions (the owner's page)

1. **Ratify "end = the finite end"** as the model rule for the emitted runtime - the one
   semantic change everything else in this direction stands on.
2. **Ratify ambient = `loops` tracks + the rest-pose-first preset contract** - no new
   primitive, no second animation system, agents warned rather than fenced.
3. **Approve the MVP as scoped in §6** - one branch, one phase, the finite end plus two
   presets on svg01, gates included.
4. **Answer §8.1** - is graphic-lifetime the only ambient scope for now (recommended), or
   does state-scoped ambient need a rule before the preset bank grows?

## 10. What this is NOT

- Not SMIL support, not CSS-animation emission, not a Lottie strategy (Lottie stays an asset).
- Not HyperFrames/Remotion adoption - external projects are idea sources only; the runtime
  stays ours, browser-native, distributable.
- Not a loop-authoring timeline UI - that is the editor road's slice, already queued there.
- Not a change to the SVG import contract - the artwork still ships verbatim.

## 11. The four decisions, settled 2026-09-03 - and why they did not go to the owner

Section 9 put four items to the owner. Under his ruling the same day
([`docs/acceptance/OWNER_QUEUE.md`](https://github.com/NoaCG/NoaCG-Studio/blob/745c6f2dcd9ce5e82cc6655c652e08f0568800fd/docs/acceptance/OWNER_QUEUE.md), "A design default is NOT a taste question") a question with a
defensible general answer is answered rather than escalated. All four have one. They are settled
here, with the reasoning, so he can overrule a decision that exists rather than adjudicate one
that does not.

**1. "End" means the FINITE end. RATIFIED.** This is not a preference, it is the only coherent
definition. A timeline whose child repeats forever has no `progress(1)`, so every question the
runtime asks of an end - when does a timer arm, when is a step finished, where does snap land,
where does settle seek - currently has no answer, and the code already treats that as a defect
([issue #774](https://github.com/NoaCG/NoaCG-Studio/issues/774); `validateMachine` refuses to arm a timer on
an endless child; settle seeks ten billion seconds into a loop). Every animation system that
supports looping children defines end this way for the same reason. Fixing it removes a bug and
makes ambient an ordinary track property instead of a special case.

**2. Ambient is `loops` tracks under a rest-pose-first preset contract. RATIFIED.** The primitive
already exists twice over and a second animation system would violate the root contract's own
principle that there is one source of truth and no parallel model. The only real question was
whether agents are fenced or warned, and warned is right: the emitted code is the truth and an
author who wants an unusual loop should not be blocked from writing one.

**3. The MVP as scoped in §6 is approved to start.** One branch: the finite-end fix plus two
ambient presets on the imported-SVG model, gates included. Under the owner's 2026-09-03 register
ruling a date is not a gate - the test is a clear vision and no fire burning, and this has both.

**4. Graphic-lifetime is the only ambient scope for now (§8.1's own recommendation).** State-scoped
ambient - a glow that pulses only while an answer is locked in - is a real need and will come, but
it needs a rule about what happens to a running loop when a state exits, and inventing that rule
before any preset exists would be designing against nothing. Graphic-lifetime is the cheap case,
reverses cleanly, and the preset bank can grow under it. Revisit when the bank has more than two
entries, which [issue #774](https://github.com/NoaCG/NoaCG-Studio/issues/774) already tracks.

**What is still genuinely his, later:** which ambient presets ship and whether they look right on
air. That is a walk item once something moves, not a question now.
