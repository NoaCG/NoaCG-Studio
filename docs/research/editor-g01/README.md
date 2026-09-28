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

## Implementation

- [easeRuntime.ts](../../../src/templates/shared/easeRuntime.ts) holds the grammar and curves as
  one `String.raw` ES5 source, plus the editor-only algebra: `mirrorEase`, `sliceEase` and
  `needsEaseRuntime`. The editor compiles the emitted text once, lazily, with `new Function`.
  It does not port it.
- [animRuntime.ts](../../../src/templates/shared/animRuntime.ts) emits that source in the
  region and wraps every key, loop, interrupted/settled exit and transition ease in
  `noacgEaseOf`. Dynamics builders get `noacgEaseForBuilder`, which keeps the step's string
  unless GSAP cannot read it. `hasEaseRuntime` and `dataUsesExactEase` pair data with the
  runtime. `writeAnimData` re-emits a known body for exact forms, and `writeOutData` also
  recognizes the pre-G01 body by content hash. That body's text is kept only as the
  [test fixture](../../../e2e/fixtures/interpreter-pre-g01.js).
- [animEval.ts](../../../src/blocks/animEval.ts) samples through the shared curve and holds
  opacity in 0..1. [animEdit.ts](../../../src/blocks/animEdit.ts) adds
  `splitKeyframeSegment`. [editorOut.ts](../../../src/blocks/editorOut.ts) uses the shared
  mirror. [validateTemplate.ts](../../../src/validation/validateTemplate.ts) blocks export for
  exact eases under an interpreter that cannot play them.
- The split refuses what it cannot keep exact: stepped or unrecognized eases, equal-endpoint
  slices, a bounded value outside its range, looping or string tracks, times on or outside the
  segment, and the last exit segment. An interrupted Out tweens with that segment's ease alone.
  It also refuses when the stored 3-decimal rounding would move the curve by more than one
  stored unit. That deviation is exactly the rounding times `E(x)/E(s)` on the left half and
  `(1-E(x))/(1-E(s))` on the right, so the check bounds it rather than sampling it.
- The [animEval contract](../../../contracts/rules/blocks/duplicates-only-interpreter-timeline-semantics-first.md)
  replaces the retired "interpolate linearly" rule.

## Verification receipt

- `scripts/ease-runtime.test.mjs` (build gate, under 3 s): every accepted named ease equals
  GSAP 3.15 bit for bit on 5,100+ points; strict grammar; bezier against GSAP's degree-3
  curves; mirrors against 1 - E(1 - u); slices; sampler clamping; 40% splits of every fixture
  track with dense samples, endpoints, both boundary velocities and neighbouring sides; all
  refusals with the input unchanged; a sweep holding every accepted split of elastic, back,
  bounce, bezier and expo segments within one stored unit on 4,001 samples; interpreter
  emission, ease-site coverage, ES5 text and pre-G01 upgrade/custom refusal.
- `j-2284`: the focused browser spec passed 19/19 on the implementation (40.2 s, one worker).
  Editor sampling equals simulator, SPX, CasparCG, OGraf and single-file playback within 2e-3
  on dense samples. Splits at 40% keep samples, endpoints and boundary velocities in all five.
  Reversal plays In backwards within 2e-3 in all five. Refusals are atomic, and the real editor's
  Yes, reverse writes the mirrored destination eases as one undo.
- Mutation checks: `j-2285` broke the bounce mirror and the ownership assertion failed. With
  that assertion soft, `j-2286` shows the executed comparison failing by 230.3 px on its own.
- `j-2287`: TypeScript clean. `j-2291`: catalog fingerprints re-recorded. Exactly 528 JS
  hashes moved and no HTML/CSS hash, the same shape as R1.1c.
- `j-2288`: the editor regressions plus anim-engine and this spec: 118 passed, 12 configured
  skips. One R1.1d fidelity check compared today's wizard output with its pre-G01 baseline
  byte for byte. It now requires every byte outside the interpreter to match and the
  interpreter to be the recorded body's upgrade. `j-2292`: all 11 fidelity/trim cases passed.
- `j-2293`: the full affected run (validation is core, so the whole suite) with 3 workers:
  1,084 passed, 544 configured skips, 2 failed. The inspector's filter check still expected the
  retired linear sampler; it now requires the editor to equal the runtime. The wizard-finish
  production-seed check failed once under load and passed alone. The appended catalog
  calibration suite passed 35/35.
- `j-2294`: G01, inspector, wizard-finish and Out specs after the review fixes: 58 passed, nine
  configured skips.
- `j-2296`: the final editor regressions (all nine editor/G01 specs, anim-engine and
  inspector, two workers): 120 passed, 20 configured old-editor skips, none failed.
- `j-2297`: the full catalog battery against this worktree's own dev server (the interpreter is
  shared template machinery). Type-floor passed 526 variants and overflow 528 against its
  baseline with no regressions. Field coverage passed 526, with 105 variants whose fields stay
  explicitly undriven. Numerals passed 349. Catalog specs passed 35 plus four source/render
  baseline tests, and the factory passed 317/317 candidates. No catalog baseline other than
  the JS fingerprints changed.
- `j-2298`: [taste frames](taste/) for Hairline (lt01) and Quiz (qz02). All six were opened.
  Hairline's name leads its role and keeps its shared left edge beside the amber rule; the long
  strings grow right from that anchor. Quiz's question stays centred above even, padded plates.
  The amber reveal marks Mars, and long strings keep every glyph inside their plates. This
  matches the R1.1c and R1.1d frames. It is regression evidence on the grey bed, not a
  receiving-host check.

## Review and simplification

Review was delegated to four independent reviewers: evaluator, interpreter/upgrade,
authoring semantics, and tests/scope. Each reviewed the merge-base diff against
`fb491735071652f7c9785fe805880eb5ae6a79eb` and listed the files it read. A second agent then
tried to refute each finding against the code. Ten distinct findings were reported and all
ten are addressed:

- Confirmed and fixed: a split of the last exit segment would have changed the interrupted
  Out, and now refuses. An eased filter reading could carry a negative blur into a new key;
  carried functions now stay in the range CSS accepts. The exactness check could miss a short
  half, and a dense sweep then showed it could also miss an elastic peak; it now bounds the
  exact deviation instead of sampling it. The inspector check still expected the linear
  sampler. Export validation blocked an upgradable older runtime with a message naming an
  internal function; it now asks for one save, and custom interpreters keep the
  technical message. The precision refusal had no test.
- Refuted as defects, but cheap and adopted: a straight-line ease now splits into itself,
  not a slice. Comparisons now fail on NaN. The upgrade test plays the upgraded graphic in the
  simulator and an SPX package. Covers and guards now name the legacy hash, filter and
  fixture files.

Simplification ran inline: the reversal test applies Out once, and the editor journey reuses
the spec's fixture builder. Nothing else in the diff duplicates an existing helper. The
split, sampler and mirror reuse the source writer, history transaction and lossless reader;
there is no second animation model.
