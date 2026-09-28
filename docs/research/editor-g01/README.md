# G01: shared easing correctness

Base: R1.1d landed through PR #476 as `7b0c5cc35bae0f087c8fee09fbdd3b5eed6377d0` and
production was confirmed at that revision. This worktree branch
`claude/editor-g01-easing-76aa37` started from fetched `origin/main` `fb4917350`, which
contains it. This is the prerequisite to R1.2a, not R1.2a itself.

Why: split, reversal and every later multi-key easing tool need the editor and the played
graphic to agree about the same ease string. Today they do not.

Goal: one parser and evaluator for serialized ease strings, used by editor sampling, exact
split and exact reversal, and by the interpreter emitted into preview, simulator and every
export. GSAP never substitutes its default for an ease the editor recognizes.

## Reproduced divergences (before any fix)

Measured against the bundled GSAP 3.15.0 (`src/assets/gsap.min.js`) in Node.

| # | Divergence | Evidence |
|---|---|---|
| 1 | `cubic-bezier(...)` is not a GSAP ease. A tween given it silently plays GSAP's default `power1.out` (0.75 at 50%). The interpreter passes key eases to GSAP as raw strings. | `gsap.parseEase` returns undefined; tween reads 64.0 at 40% where the bezier is elsewhere |
| 2 | The editor sampler `resolveValue` interpolates linearly. X -80 to 0 with `power2.out` reads -40 at 50%; the runtime shows -10. | `src/blocks/animEval.ts`; earlier probe in the 2026-09-17 baseline supplement |
| 3 | Out reversal maps `steps(1)` to `steps(1,true)`. GSAP's `steps(1)` jumps at 50% and `steps(1,true)` is at its end value from the first frame, so the reversed exit is wrong by the whole move. | max error 1 over 205,098 samples |
| 4 | Out reversal refuses `back`, `bounce`, `elastic` and `cubic-bezier` entrances although exact mirrors exist. | `mirrorEase` accepts only power/sine/expo/circ |
| 5 | Inserting a key inside an eased segment changes the curve: the new key inherits the step default and the next key's ease runs over a shorter span. | `setKeyframe` in `src/blocks/animEdit.ts` |

Items 1 and 3 are reproduced again in executable form by the first queued browser run below.

## Decisions

- **One implementation.** `src/templates/shared/easeRuntime.ts` holds the ease grammar and
  curves as one plain ES5 source string. The interpreter emits that string inside the
  ANIMATION region, so every export bundles it locally with the template. The editor compiles
  the same string once. Named curves reproduce GSAP 3.15's formulas and operation order, so
  existing graphics play bit-for-bit as before.
- **Grammar.** `none`; `linear`, `power0`-`power4`, `quad`, `cubic`, `quart`, `quint`,
  `strong`, `sine`, `expo`, `circ`, `bounce`, `back(s)` and `elastic(a, p)` with `.in`,
  `.out` or `.inOut` (bare means `.out`); `steps(n)` and `steps(n, true)`;
  `cubic-bezier(x1, y1, x2, y2)` with finite values and x1, x2 in [0, 1] (monotonic x);
  and `slice(ease, a, b)`, the part of a recognized ease between a and b rescaled to 0..1.
  Strings are never rewritten on read. Anything else is not recognized: it still reaches
  GSAP untouched, exactly as today, and exact operations refuse it.
- **Interpreter.** Every key, loop, exit and transition ease is resolved through the shared
  evaluator and handed to GSAP as a function. Dynamics builders keep receiving the step's
  string unless GSAP cannot read it and the evaluator can.
- **Upgrade.** The current interpreter body is frozen by exact content hash as a known body.
  Preview, save and export upgrade it as R1.1c did. Writing `cubic-bezier` or `slice` data
  requires the new interpreter; a custom interpreter refuses the write and blocks export.
- **Exact split.** Splitting a segment at time t writes the sampled value on a new key with
  `slice(E, 0, s)` and moves the rest to `slice(E, s, 1)` on the segment's destination key.
  Neither side depends on the step default, and no other key changes. Values keep the
  format's 3-decimal quantum, so "exact" means within one quantum of the stored unit.
  The split is a pure capability in this phase; no UI calls it.
- **Exact reversal.** E_rev(u) = 1 - E(1 - u). Named `.in`/`.out` swap, `.inOut` and linear
  map to themselves, `cubic-bezier(x1,y1,x2,y2)` becomes `cubic-bezier(1-x2,1-y2,1-x1,1-y1)`
  and a slice mirrors its base and bounds. The mirrored ease moves to the other key of the
  reversed segment, as now.
- **Sampler.** `resolveValue` evaluates the recognized ease and clamps opacity to 0..1, as
  the renderer does. Unrecognized strings keep the legacy linear reading for display only.

## Acceptance and atomic refusals

| Portion | Observable result | Refusal (source and history unchanged) |
|---|---|---|
| Shared evaluation | Every accepted named ease equals GSAP 3.15 bitwise on a dense grid. Editor sampling equals simulator, SPX, CasparCG, OGraf and single-file export poses on dense samples, for power, back, bounce, elastic, expo and cubic-bezier keys. No recognized string reaches GSAP as a string at a key site. | Unrecognized strings play as before; exact operations name them. |
| Split at 40% | Dense samples, endpoints and left/right boundary velocities agree before and after in editor sampling, simulator and executable exports. Neighbouring key sides and the step default are unchanged. | Equal-endpoint slice with motion between, stepped or unrecognized ease, looping or non-numeric track, time not strictly inside a segment, bounded value outside 0..1, or a result outside one quantum. |
| Reversal | Named `.in`/`.out` pairs, back, bounce, elastic, cubic-bezier and slice reverse exactly; Out at time u equals In at end - u densely in simulator and exports; ease ownership moves to the reversed destination key. | Stepped and unrecognized eases refuse with the existing message. |
| Piecewise and bounds | Bounce/back peaks and overshoot survive split and reversal; opacity is clamped identically in sampler and runtime; flat (equal-endpoint) segments split exactly. | As above. |
| Upgrade and pairing | A pre-G01 saved graphic upgrades once in preview, save and export and plays new forms correctly. | Custom interpreter: write refused, export blocked by validation. |
| Preserved behaviour | Set Out still refuses before the last In key. R1.1b numeric keys and body moves, R1.1c Out and interruption, R1.1d nested identities and trims, speed, FPS, save/reopen and export parity all pass their existing regressions. | Unchanged. |

Non-goals: Step/Next, cross-cue authoring, ease or multi-key UI, a Hold key form, graph
editor, loops, advanced tools, lifting the Set Out restriction, default-editor switch and
closing whole acceptance rows. GSAP's `steps(1)` is not a hold; R1.2a's Hold Keyframe needs
its own form.

Verification: a Node test pinned against the bundled GSAP for the mathematics; a focused
queued browser spec executing the bundled runtime in simulator and exported packages;
affected editor regressions; catalog JS fingerprints re-recorded (interpreter text only);
build, `/check`, `/queue-merge` and the deployed revision.
