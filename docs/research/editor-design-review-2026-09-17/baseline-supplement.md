# Baseline supplement and mockup inspection

2026-09-17. Read with the [original task matrix](../editor-baseline-2026-09-17.md)
and [combined scope/reuse review](../editor-design-review-2026-09-17.md).

## Evidence boundary

NoaCG source is `49a2f31ee72a6ebc938b03639355b9a5e92e8b09`; its application source is
unchanged from `d2f11efedb49bb6faf464f55defaf7d90413be45` (the intervening change is the
planning roadmap). Studio is pinned to `3142fc7d02934494931eb14e7dc255393e4110d0`.
Chromium 149.0.7827.55, Windows, isolated browser contexts, offline NoaCG Vite configuration,
production preview debounce 350 ms. No hosted account or real production was modified.
Browser viewport is controlled; physical monitor scaling and the owner's previous failing
environment are unverified. These are development builds, not a production-bundle benchmark.

The observation scripts use source imports only to seed declared fixtures or read snapshots.
Seeded tasks are explicitly aided, not a measurement of discoverability. Actual creation
routes below use the visible UI. The scripts and raw records are research evidence, not a
new shipped application feature or a general performance suite.

## Default routes actually walked

**Catalog:** fresh Home -> New graphic -> templates -> search Hairline -> select -> four
Next actions -> Finish. The Finish page has production and export routes but zero
`wz-finish-editor` elements. B01's requirement of a default editor door fails this route;
the existing Advanced-mode test bootstrap cannot count as a pass.
[Capture](noacg-default-finish-1366.png), `baseline-discovery.json`.

**SVG:** fresh Home -> New graphic -> Import -> shipped `docs/svg-samples/scorebug.svg` ->
recognized import -> field mapping -> Finish -> name Baseline scorebug -> new local
production Baseline laboratory -> confirm -> Take -> reload. Creation, production arrival
and saved production reopen were observed. Finish again has zero editor-door elements.
This does not prove the future nested-group editor operation, foreign export playback or
all scoreboard lifecycle cases. [Finish](noacg-svg-finish.png),
[production](noacg-svg-production.png), `baseline-additional.json` and `f2-scorebug.json`.

**Studio:** fresh startup opens its blank workspace directly. Add broadcast recipe ->
Lower Third creates four layers, independent timeline rows and populated ordinary
transform/text properties. At frame zero the recipe is in its initial hidden pose; the
black-looking stage in this capture is not evidence of the NoaCG blank-stage defect.
[Initial workspace](studio-initial.png), [recipe](studio-recipe-1366.png).
The reference exposes more text, fitting, transform and layer controls in this observed
state. Their presence is not a claim that every interaction was tested or superior.

## Fixed inputs and preservation

- F1 remains the previously frozen Hairline source and screenshots.
- `f2-scorebug.json` is a real output of the default SVG creation route. The shipped SVG
  is the source fixture; this covers two-team names/scores and a picture field. It does not
  replace the required transformed-parent/nested-group adversarial walk.
  `f2-nested-scorebug.svg` now freezes that transformed-parent input; its import/edit walk remains pending.
- `f4-noacg.json` has 30 rendered rectangular layers and exactly 300 X/opacity keys, five
  keys per property per layer over four seconds at 25 fps. All 30 parts are verified through
  `getTemplateParts`. Identities use the existing `data-gfx` contract. The first pilot omitted
  that identity marker and is excluded from canvas conclusions.
- `f4-studio.json` renders the corresponding 30 rectangles with 300 X/opacity property keys.
  Studio also uses 30 legacy full-pose frame-zero anchors to retain static Y/size. This
  representation overhead, its frame-quantized sampling and different viewport layout mean
  these records are not an exactly equal-work performance ranking. Both sources are frozen.
- `f5-source-fixtures.json` adds legacy version 1, unknown version 999, infinite/yoyo loop,
  lifecycle call and named custom-ease/handwritten source inputs. The direct source probe
  confirms legacy reads as version 2, unknown reads as null, and the other inputs parse.
  This does not demonstrate save/export preservation or the remaining branch-state fixture.
- F3 remains the five-item Starter brief. F6 remains the installation/recovery scenarios;
  their future states are not fabricated in baseline data.

Studio reference fixture data was constructed using its pinned lower-third demo factory and
modified for this observation. It is AGPL-covered reference material under the repository's
AGPL licence, not a selected NoaCG product template or runtime. No Studio application source
was imported into NoaCG. See `studio-reuse-candidates.json` for exact candidate helper hashes.

## Repeated observations and measurement limits

`baseline-measurements.json` contains 30 row selections and 10 continuous scrub gestures per
editor at each of 1366x768 and 1920x1080: 120 selections and 40 scrubs. It records per-rAF
element bounds/opacity, counting changed poses separately from rAF callbacks. It uses the
normal 350 ms NoaCG setting. Raw samples and screenshots are retained.

Selection durations in that file are explicitly named `automationRoundTripMs`. They include
Playwright transport/actionability and two animation frames, and are **not input-to-pixel
latency**. Scrub samples are computed rendered geometry/opacity, not screenshot pixel
differences. The driver itself limits input cadence. Do not compare these numbers to the
100 ms/30 updates-per-second acceptance targets or publish a speed ranking from them.
Long-task attribution, trusted input timestamps, rebuild/ack latency, pointer-up final-pose
latency, reverse scrubs and the 125% browser-zoom cases remain unmeasured.

Repeated drag/source-undo observations are in `baseline-additional.json` (Studio) and
`baseline-noacg-drags.json` (corrected NoaCG run). Per-trial hashes distinguish a changed
document from a no-op. Studio's visible Edit -> Undo/Redo route is used after its focused
layer button intercepted the initial keyboard attempt. NoaCG uses a selected registered
layer and a parked timeline, matching its existing gesture contract. These source snapshots
do not prove the new base-layout contract, mixed Monaco history or exact parked-pose recovery.
Read `verification-summary.json` for the final run counts and failures; do not turn attempted
gestures into passes.

Harness corrections are preserved: j-1303 selected an ambiguous New graphic button;
j-1305 remained on Home after fixture seeding; j-1306 had generated script syntax damage;
j-1308/j-1309 used the incomplete first fixture or a focus-sensitive undo route; j-1313's
NoaCG probe accidentally deselected the layer with a second click. These are observation
harness errors, not reproduced application regressions. j-1311 wrote complete raw observations
but the queue subsequently marked its process reaped with no exit code; it is recorded as
raw diagnostic evidence, not a green gate. j-1312 did not launch because its prerequisite
was not marked green. j-1314 exposed a retained-selection toggle between trials; j-1316 corrects that and completes
10 source-changing drags plus exact-source Undo/Redo at each viewport in NoaCG. Studio
completed the same counts through its visible Edit menu in j-1313. These are source-history
observations, not new-contract or pixel-pose acceptance.

## Mockup checks

The [1366 Layout proposal](proposal-layout-1366.png),
[1366 Animate proposal](proposal-animate-1366.png),
[1920 Layout proposal](proposal-layout-1920.png),
[dark appearance](proposal-dark-1366.png) and
[production preview](proposal-production-1920.png) are design mockups, not product screenshots.

Queued inspections j-1310 and final j-1317 reported zero script errors and verified title-to-source update,
Undo and Fit preserving the artwork position. Rendered inspection covered 1366/1920 desktop
viewports plus reflow at 1024/320. The desktop product surface is about 757 px high at the
1334 px inner width of the 1366 screenshot; surrounding conversation-preview padding makes
the full capture slightly taller. In the actual app, independent panel scrolling/resizing
must be verified rather than assuming this mockup proves it. The narrow view is for reviewing
the proposal; full mobile animation authoring remains outside the promised milestone.

The first draft pushed the timeline below the laptop viewport. The revision puts source beside
the canvas at desktop widths, tightens the inspector and exposes both property rows. The
mockup code pane is a placement sketch, not a Monaco editor instance. Most importantly,
keeping Monaco visible is now E18/B12 and part of M1-M2, not an optional later embellishment.

## Reproduced source-level mismatch and build

`source-contract-probe.mjs` executes the repository's trusted pure TypeScript modules and
the already bundled GSAP library. It never evaluates imported graphic JavaScript to parse
animation data. For X -80 to 0 over one second with incoming `power2.out`, at 0.5 seconds
`resolveValue` returns -40 while bundled GSAP's ease gives -10. At 0.25 seconds they return
-60 and -33.75; endpoints agree. `source-contract-observations.json` records all five samples.
This reproduces the sampler discrepancy from the code review and supports the M1/M3 sampler
replacement. It is not a new visual regression test or a reason to start implementation.

Build j-1315 completed with exit 0: 1,798 tests passed, zero failed, one skipped, followed by
successful bundle and after-build checks. This verifies the unchanged application with the
planning changes; it does not pass the future editor requirements. `git diff --check` is clean.

## Remaining evidence, without changing the gate

| Task | What this round establishes | Still needed before claiming the full task |
|---|---|---|
| B01 | Default catalog and SVG editor doors are absent; SVG production/reopen works | Saved graphic editor navigation and owner walk; future corrected default route |
| B02 | Repeated row selection and matching reference control surfaces | Full nested/overlap/multi-select/lock/rename/reorder walk in both editors |
| B03 | Repeated source-changing drag and Undo/Redo observations, subject to summary | Catalog base-layout semantics; cancel, rotate/resize and exact visible-pose recovery |
| B04 | Current/ref UI property inventory and F2 source capture | Complete ordinary artwork edit, add/delete/duplicate and align/distribute comparison |
| B05-B07 | Previously recorded existing-contract regression suite; pinned reference source/fixtures | Exact paired timing/easing/Hold/copy/lifecycle workflows and clean export captures |
| B08-B10 | Combined brand/collection/rundown contracts and current entry-path inventory | Mark currently unavailable integrated capabilities separately; future milestone runtime acceptance |
| B11 | Fixed stress inputs, raw selection/scrub sampling and gesture evidence | Validated input-to-pixel/performance harness, remaining measurements and scaling cases |
| B12 | First-class Monaco scope and explicit transaction acceptance sequence | New transaction implementation and full mixed-edit acceptance in M1-M2/M8 |
| Owner/human | Previous rejection preserved; reproduction details requested | Owner blank-stage route/environment and first-time-user observations |

**M0 is not complete.** This supplement completes the reuse/disposition/design review and
adds reproducible evidence, but does not close the remaining paired workflows or performance
measurements. These remain explicit next work, alongside owner mockup review. Do not begin
M1, commit this design proposal before review, or claim Studio parity from these screenshots.
