# R1.1d: imported artwork fidelity and visibility trimming

Base: PR #472 verified merged as `ca12699d72598cd41b478f3fe6c0f055f254f749`.
Fetched origin/main contains it. Dedicated worktree: `dbe0`, branch
`codex/editor-r1-1d`. September 27 landed usability corrections govern this work.

Why: the actual wizard result must support editing its nested artwork without
rebuilding it, and visibility needs independent start/end controls.

Goal: select and edit the nominated nested group, unnamed shape, live text and
image in an Illustrator-style import; trim visibility without retiming motion.
Preserve the original document, source references and runtime contracts.

Decisions: use source-derived transient selectors until the first committed edit;
mint stable IDs in that edit's transaction. Use separate bar edge handles, with
keyboard frame nudges, for one interval at a time. Minimum span is one effective
document frame; bounds are its cue and adjacent intervals. Invalid edits refuse
atomically instead of clamping, deleting keys or changing other intervals.

| Portion | Observable result and atomic refusal |
|---|---|
| B01/B02, G03 | Actual wizard Finish opens intact source. Nested named/unnamed groups, shapes, text and image are selectable. Inspection/cancel adds no IDs; first edit, undo/redo and reopen retain one collision-free identity. Ambiguous referenced duplicate IDs refuse with source/history unchanged. |
| D03, B03/B05 | Parent translate/rotate/scale inverse mapping agrees with numeric edits. Group base placement/scale/rotation composes with animated children. ViewBox, aspect ratio, stacking, definitions, clips/masks and sibling transforms remain intact. Singular or competing transforms refuse atomically. |
| B04 applicable | Plain live text wording, font, size, colour and opacity remain editable. Outlined lettering remains paths. Record source and raster before edits; report actual font/asset/import limits. No raster replacement or substitute editable scene. |
| D04, B05/B06/B13 | Bar body moves visibility and keys together; edge trims change only the chosen visibility interval, including static and disjoint spans. Retain clipped keys, stored/effective time, speed, FPS, inheritance, held cue sides and Out interruption. Crossing bounds, minimum duration or another interval refuses without changes. |
| B03/B05/B13 transactions | Escape/capture cancellation, one undo per completed gesture, redo, save/reopen, forward/backward scrub and executable preview/SPX/CasparCG/OGraf parity. |
| B02/B04/B11/B13 regression | Hairline/Quiz, text/appearance, numeric keys, permanent/manual/reverse/empty Out, playback and Space/pan at 1920x1080, 1366x768 and 1093x614 (125% equivalent). Inspect rendered frames and measure new gesture feedback. |

Keep source patching in blocks, identity derivation in model/structure, gesture
coordination in editorFoundation and execution in the shared runtime. Reuse the
registry, document session/history, wizard, preview and export adapters. No second
scene or history model. Existing default editor stays until R1.5 retirement.

Non-goals: Step/Next, cross-cue authoring, full easing/multi-key tools, grouping
creation, advanced tools, default-editor switch or closing whole acceptance rows.

Verification: reproduce before fixing; repository-queued browser jobs, rendered
review, affected suite, build, `/check`, `/queue-merge`, deployed revision.

## Two first-time users: pending

Use the simple imported text-and-box graphic, a short identical introduction and
the real UI: find Edit, move/resize, create two keys, Set Out/reverse or manual,
hold/exit, save/reopen. Record each ordinary edit separately against <=1 minute;
the keyframe task target is <=5 minutes after introduction. Record errors,
assistance and whether each task completed without help. Failures require
interaction changes before widening. Automation is not participant evidence.

| Participant | Ordinary edit times | Keyframe task time | Errors | Assistance | Result |
|---|---|---|---|---|---|
| First-time user 1 | Not measured | Not measured | Not observed | Not observed | Pending participant |
| First-time user 2 | Not measured | Not measured | Not observed | Not observed | Pending participant |

No participants are available in this agent session. Human acceptance remains open.
The [checkpoint](checkpoint.md) has the common introduction, simple SVG and
per-person/per-task recording sheet. The desktop owner queue carries this human
work separately from engineering verification.

## Reproduction and fidelity boundary

`j-2171` imported [fidelity-nested.svg](../../../e2e/fixtures/fidelity-nested.svg)
through the real wizard, selected Fade Dissolves and used Finish -> Edit.
Its assertions reproduced the missing nested named/unnamed targets and trim
handles. [Baseline source and screenshots](baseline/) were captured before edits.
The source has live Arial text, outlined lettering, nested unnamed artwork,
translate/rotate/scale parents, an embedded image, gradient, mask and clip.

`j-2177` reproduced another concrete failure: starting a drag inside the selected
unnamed group picked its smaller child instead. Selection now wins hit testing
for a drag; Alt cycling still reaches overlapping children. Completed and cancelled
gestures assert the target identity, not just that some artwork moved.

The untouched wizard is the editing baseline, not a reconstructed scene. Raw SVG
and wizard rasters were also compared. Existing import fitting moves this headline
up 3.25 local units on this Windows/Arial measurement. The rotated layout does not
offer the wizard's fit/nudge control, although its emitted fit runtime snaps the
text. [Text geometry](baseline/text-geometry.json) records both glyph boxes and
markup. This is an existing import limitation, not a claim of pixel-identical
source import; this slice preserves the actual wizard result through editing.
The general fit/alignment policy remains unchanged. Investigate the wizard/runtime
measurement disagreement as a separate bounded correction before claiming exact
source-text fidelity for such layouts.

Arial is not embedded; the wizard reports the receiving host may substitute it.
The logo uses embedded image bytes and needs no external fetch. Outlined letters
remain paths. Fonts, assets and the original SVG viewBox/aspect ratio, definitions,
mask/clip references, stacking and sibling transforms are retained by source patches.

## Scope of the implementation

The foundation registry derives source-order, indented nested targets. Definition
and hidden subtrees do not become phantom editable layers. Legacy preset consumers
retain their existing registry. Unnamed and duplicate-ID elements have read-only
structural selectors; a real edit patches only the target opening tag to mint a
collision-free ID in the same history transaction. Referenced ambiguous identities
refuse instead of retargeting references. Source references and operator bindings
are not rewritten on inspection or cancellation.

Group position, scale and rotation compose with child numeric animation. Rotation
uses the existing numeric property path. Groups and images also expose opacity.
Competing CSS transforms, singular coordinates and foreign runtime ownership
retain their existing atomic refusals.

Each positive-length visibility interval has separate start/end handles. Pointer
and keyboard edits use effective frames; stored values use speed. Trim retains all
keys, including keys outside the new interval; body movement still moves keys and
spans together. Bounds, adjacent intervals and a one-frame minimum are checked
before committing. Zero-duration Out receives an empty interval set when spans
are materialized, preserving a valid serialized document.
Row controls have an isolated stacking context so scrolled-off handles cannot
intercept the sticky ruler. `j-2204` reproduced the interception and changed
selection before the fix; the regression checks the hit target, selection and seek.

## Rendered review

All six [Hairline/Quiz frames](taste/) were opened: default and long holds, plus
Quiz's default and long answer reveal. The actual-wizard source/import rasters and
editor frames at 1920, 1366 and 1093 CSS pixels were also opened. The latter is the
125% equivalent layout, not a physical display claim.

| Taste question | Observed result |
|---|---|
| Hierarchy | Hairline's name leads its quieter role. Quiz's question leads until the amber correct answer is revealed. |
| Composition | Hairline retains its shared left edge beside the rule. Quiz has even plates, padded labels and a centred question. |
| Restraint and coherence | Neutral type/backgrounds and one amber accent remain consistent; the reveal highlight communicates state. |
| On-air quality | Reference frames are readable with stable placement on the grey bed. Real footage and receiving hosts are not checked. |
| T1 centred | Quiz's question and letter chips remain centred; Hairline stays intentionally left aligned. |
| T2 inside | Default and long strings keep every glyph inside their space. |
| T3 aligned | Shared edges and plate padding remain consistent. |
| T4 growth | Hairline grows right from its anchor; Quiz fits long text in its fixed plates without shifting the answers. |

The nested outline retains source order and indentation. Group selection and trim
edges remain visible at the three tested layouts; the inspector scrolls at laptop
height. The SVG clips at its own original viewBox, matching the source raster.

## Verification receipt

- `j-2181`: all 96 editor browser regressions passed. This includes Hairline/Quiz
  authoring, text/appearance, numeric keys, playback, Space/pan, held cue sides,
  empty/manual/reverse Out, interruption and responsive layouts.
- `j-2184`: reproduced a dangling-reference ID collision while its other eight
  focused tests passed. `j-2185`: all nine focused tests passed after reserving
  names from HTML references as well as existing IDs, CSS and scripts.
- `j-2190` and `j-2193` reproduced escaped/attribute CSS reference hazards when
  assigning IDs. The final guard reads normalized CSS without rewriting it,
  reserves escaped dangling names, and refuses identity-sensitive attribute rules.
  `j-2194`: all nine focused tests passed on the corrected source (49.5 seconds).
- `j-2195`: full affected browser run: 1,029 passed, 545 configured skips, two
  startup timeouts (18.5 minutes). Both timed out waiting for the wizard to mount,
  before their layout assertion; screenshots were blank startup frames. The
  unchanged complete wizard-entry spec then passed all 18 tests in `j-2198`
  (37.4 seconds). No wizard code, assertion or timeout was changed. The original
  full command remains a failed run; the focused rerun resolves its two failures.
  Its separate catalog calibration gate passed all 35 tests (3.7 minutes).
- `j-2183`: full rendered catalog battery passed: 526 type-floor variants, 528
  overflow variants against baseline, 526 field-coverage variants (105 variants
  retain explicitly undriven field types), 349 numeral variants, 317/317 factory
  candidates and 12 kits. All six taste frames were opened. Catalog emit matched
  all 528 stored fingerprints; no catalog baseline was changed.
- The implementation build exited 0 with 1,908 tests passed and three skipped;
  TypeScript, lint, dependency, bundle and after-build gates passed.
- `j-2199`: build passed on product-code commit `4071646e`, again with 1,908
  tests passed and three skipped, including the corrected owner-checkpoint route.
- `j-2200`: production measurements passed catalog and SVG rows, then exposed a
  stale benchmark assertion on F4: its existing X tracks correctly change JS keys,
  but the runner required changed CSS. The runner now compares the combined
  HTML/CSS/JS source and checks that one undo restores all three exactly.
  Product code and performance thresholds were unchanged.
- `j-2201`/`j-2202` and the `j-2203` diagnostic exposed the scrolled trim-handle
  interception through a wrong SVG benchmark selection. Those incomplete timing
  runs are not final evidence. The runner now checks the displayed pose, intended
  `#f0`/`#f1` targets and source/undo, so a drag of some other artwork cannot pass.
- `j-2206`: all 98 editor regressions passed after isolating timeline-row stacking
  (6.6 minutes). This includes the ten final fidelity/trim cases, numeric keys,
  body movement, Out/interruption, base/text/appearance, Space/pan, save/reopen,
  executable packages and all three editor layouts.
- `j-2207`: target-correct production catalog/SVG measurements passed, but F4
  drag feedback measured 29.3 Hz against the 30 Hz floor. `j-2208` profiled that
  workload and identified repeated HTML ancestor-matrix/corner work. Measurement
  now reuses each layer's geometry within that single pose, never across frames.
- `j-2209`: a rotation-only edit after scrubbing changed source but not the sampled
  SVG angle (0 degrees of the expected 30-degree change). Rotation now joins
  position/scale in the existing base-transform pose invalidation. Its regression
  also checks that one undo restores the earlier angle.
- `j-2211`: all 99 editor regressions passed on the final runtime corrections
  (2.5 minutes), including all eleven actual-wizard fidelity/trim cases. Product
  commit `6908c5da` was then compiled successfully with `npm run build:vercel` for
  production-bundle measurements.
- `j-2212`: all nine production-bundle measurements passed, with unchanged
  thresholds, intended selection and exact single-undo source restoration.
  [Raw measurements](production-bundle/latency-built.json) include the build SHA,
  source hashes, Windows/Chromium version and Ryzen 7 5800H environment. Catalog
  feedback was 58.1/59.4/58.1 Hz, SVG 57.9/56.8/59.2 Hz and F4 36.0/37.8/35.1 Hz
  at 1920/1366/1093 respectively. Maximum pointer-release latency was 109 ms;
  selection maximum was 73.4 ms. Frame p95 stayed at 16.7–16.8 ms with no iframe
  long tasks. This is browser acknowledgement timing, not physical photon timing.
  All fourteen final frames were opened: nine fixture/layout frames, three tool
  frames, phone and wizard Finish. The ruler remains clear after row scrolling;
  selected text, added artwork and F4's grid retain their positions after undo.
  Laptop inspectors scroll and phone controls wrap. The SVG retains its authored
  clip masks; these performance fixtures do not replace the actual-wizard proof.
- `j-2214`: isolated trim transaction/feedback check passed (15 seconds total).
  Its [24 samples](built/trim-feedback.json) measured 17.3 ms median, 28.6 ms p95
  and 45.6 ms maximum from pointer event to handle geometry after two animation
  frames. The six-worker regression run's earlier sample had a 100.1 ms maximum;
  the isolated run separates gesture timing from that concurrent test load.

Review and simplification ran inline over the final 62-file merge-base diff against
`ca12699d72598cd41b478f3fe6c0f055f254f749`. Confirmed fixes cover selected-group hit
testing, hidden descendants in nested discovery, preserving existing stable class
targets, competing inline rotation, and identity/reference collisions (including
escaped CSS and ID attribute selectors), and scrolled trim controls intercepting
the ruler. Verification additionally found the rotation refresh and repeated
geometry work described above. These eight product findings and the benchmark's
CSS-only transaction assertion form the nine confirmed review findings.
All nine are fixed and verified; no performance threshold was relaxed.
Simplification reuses the source registry, numeric-property adapters, canonical
animation writer and existing gesture/history transaction. Identity remapping
runs only when an ID actually changed; no extra scene or history abstraction was
added. React controls were checked for bounded gesture refs, keyboard handling
and scalar effect dependencies.
