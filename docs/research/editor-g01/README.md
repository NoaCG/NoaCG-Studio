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
| 1 | `cubic-bezier(...)` is not a GSAP ease. `gsap.parseEase` returns undefined and a tween given it silently plays GSAP's default `power1.out`. The interpreter handed every key ease to GSAP as a raw string. | Node probe; `j-2282` below |
| 2 | The editor sampler `resolveValue` interpolated linearly. X -80 to 0 with `power2.out` read -40 at 50%; the runtime shows -10. | Node test before the fix; `j-2283` below |
| 3 | Out reversal mapped `steps(1)` to `steps(1,true)`. GSAP's `steps(1)` jumps at 50% and `steps(1,true)` is at its end value from the first frame, so the reversed exit was wrong by the whole move. | max error 1 over 205,098 samples; `j-2283` below |
| 4 | Out reversal refused `back`, `bounce`, `elastic` and `cubic-bezier` entrances although exact mirrors exist. | `j-2282` below |
| 5 | Inserting a key inside an eased segment changes the curve: the new key inherits the step default and the next key's ease runs over a shorter span. | `setKeyframe` in `src/blocks/animEdit.ts` |

The focused browser spec [editor-ease.spec.ts](../../../e2e/editor-ease.spec.ts) was written
first and queued on the unmodified product code:

- `j-2282`: all 18 tests failed. In the simulator, SPX, CasparCG, OGraf and single-file
  export, all eight key eases of the fixture reached GSAP as strings, including
  `cubic-bezier(0.3,-0.4,0.6,1.5)`. Reversal of back/bounce/elastic/bezier/slice entrances
  refused, the split capability and the interpreter upgrade did not exist, and the editor's
  Yes, reverse left the source unchanged for the same entrance.
- `j-2283`: editor sampling differed from the executed simulator by up to 269.4 px on X, and
  a `steps(1)` entrance reversed into an exit that differed from the mirrored entrance by
  899.998 px (the whole move).

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
| Upgrade and pairing | A pre-G01 saved graphic upgrades once in preview, save and every package export and plays new forms correctly. If it already carries a cubic-bezier or slice key, validation asks for one save first, because the video render path does not upgrade. | Custom interpreter: write refused, export blocked by validation. |
| Preserved behaviour | Set Out still refuses before the last In key. R1.1b numeric keys and body moves, R1.1c Out and interruption, R1.1d nested identities and trims, speed, FPS, save/reopen and export parity all pass their existing regressions. | Unchanged. |

Non-goals: Step/Next, cross-cue authoring, ease or multi-key UI, a Hold key form, graph
editor, loops, advanced tools, lifting the Set Out restriction, default-editor switch and
closing whole acceptance rows. GSAP's `steps(1)` is not a hold; R1.2a's Hold Keyframe needs
its own form.

Verification: a Node test pinned against the bundled GSAP for the mathematics; a focused
queued browser spec executing the bundled runtime in simulator and exported packages;
affected editor regressions; catalog JS fingerprints re-recorded (interpreter text only);
build, `/check`, `/queue-merge` and the deployed revision.
