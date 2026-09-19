# Editor baseline: evidence and repeatable acceptance tasks

> Historical receipt. Current decisions/order: [EDITOR_PLAN.md](../EDITOR_PLAN.md).
> M0 inventory is closed; outstanding evidence lives in the [acceptance register](editor-acceptance-register-2026-09-17.md).
> Old phase gates and superseded UI proposals below are preserved as history only.

Date: 2026-09-17. Planning/source baseline for the
[unified roadmap](../EDITOR_DELIVERY_ROADMAP.md). **Not a completed usability or performance
baseline.** Product implementation is paused by the owner pending clarity and review.

## 1. Fixed evidence identities

- NoaCG source inspected: `d2f11efe` (freshly fetched `origin/main`, containing PR #323).
- Studio comparison revision: `3142fc7d02934494931eb14e7dc255393e4110d0` throughout the gate.
- Prior source research: [Studio evidence](ograf-2026-09-13.md), not a browser trial.
- Prior NoaCG integrated verification: [PR #323 receipt](../handoffs/2026-09-17-editor-rebuild-review-followup.md),
  at `8376987d`: build passed, 1,122 integration checks and 35 catalog checks passed.
  These prove regression coverage on that revision, not first-time usability or Studio parity.
- Current narrow regression run: queue job `j-1297`, existing timeline, inspector, canvas
  keyframe and legacy timeline specs: **45 passed in 1.3 minutes, no retries**, two workers.
  Uses the suite's 50 ms preview debounce; it cannot establish 350 ms authoring responsiveness.

Every later observation names commit, fixture hash, route, browser/version, viewport, OS,
display scaling, hardware and production/development configuration. Never describe an old
receipt as a current observation. Changing baseline fixtures requires a recorded reason and
rerunning both editors, not silently making the test easier.

## 2. Current source findings, not new browser diagnoses

| Area | Verified source evidence at baseline | Consequence / missing proof |
|---|---|---|
| Entry | `e2e/_create.ts` enables Advanced mode and creates through store helpers; normal entry flow is bypassed in editor-subject tests | Current green editor tests do not prove a new user can reach the editor. Walk the default Home/create/import/saved-graphic route explicitly |
| Independent tracks | `e2e/timeline-v2.spec.ts` and `src/blocks/animData.ts` already cover property rows and independent keys | Preserve the primitive; measure and improve the interaction |
| Conflicting key creation | Inspector spec arms a property before numeric editing; `canvas-keyframe.spec.ts` says the drag itself arms | Unified Layout/Animate must be validated for predictability |
| Feedback | `PreviewFrame.tsx` defaults to a 350 ms rebuild debounce; Inspector has 650 ms re-seek timers | Measure actual delay; define revision-aware hot updates before rewriting gestures |
| Easing | `animEval.ts:resolveValue` explicitly interpolates linearly between keys | Values at keys passing does not establish eased midpoint agreement |
| Cancel | Canvas has active drag Escape handling; StepTimeline has pointer-cancel handlers and menu Escape, without an equivalent shared gesture rollback contract | Exercise each drag kind and require exact source/pose restoration |
| Existing coverage | Timeline specs exercise retime, undo, transport, property rows, loops, quiz calls and scoreboard coexistence | Reuse safety assertions, replace interaction assumptions deliberately |
| Brand application | `model/packets.ts:applyLookToTemplate` returns only a template and writes declared roles/slots | Applied/skipped/unsupported reporting and provenance remain planned |
| Creator | Home brand form and preview debounce landed in PR #323 | Useful foundation, not evidence the integrated editor/collection workflow works |

No code has been changed to address these findings in this planning round. An apparent source
gap is not a claim that every visible interaction fails. Reproduce before a later fix.

Historical defect inventory from the editor plan remains open where appropriate:
Space handling and run completion have source fixes; branch scrubbing has a source fix;
owner-machine blank stage remains unreproduced here; align/distribute is an identified gap;
catalog typography reach is limited. Each needs its own present-tense observation.

### Limited rendered baseline, observed 2026-09-17

Queued capture `j-1299` passed both viewport captures in 14.5 seconds. Chromium
149.0.7827.55 on this Windows laptop, offline Vite development configuration, suite preview
debounce 50 ms, default browser zoom. This is a static aided inspection, not B01/B05/B11
completion or production-configured performance evidence.

Procedure: fresh page at `/app#/home`; then the existing `e2e/_create.ts:createProject(page,
'Hairline')` helper (which enables Advanced mode), select timeline label `#f0`, wait for
`inspector-part-label` to read Name, capture viewport and canonical template. No product edit.
The temporary capture spec was removed after capture; reproduce those same steps via the
existing helper in a queued observation. The initial capture `j-1298` wrongly expected an X
input before arming; both attempts failed that assumption. Corrected capture waits for layer
identity instead. This is recorded rather than misreported as a product regression or flake.

Artifacts committed with this receipt:

- [1366x768 editor](editor-baseline-2026-09-17/hairline-1366.png).
- [1920x1080 editor](editor-baseline-2026-09-17/hairline-1920.png).
- [F1 source snapshot](editor-baseline-2026-09-17/hairline.json), SHA-256
  `f7bf6add5066c9edc7cf98cab5f394c37f25b21261e4f1c34283e68bafd65189`.

Observed findings and design implications:

1. Selected Name layer shows Position X/Y, Scale, Opacity and Rotation as dashes with
   diamonds; the animated mask property has a numeric input. Source and existing tests
   confirm the arming rule. A selected layer does not immediately expose editable base X/Y.
   This supports M1's explicit base-layout requirement; it does not yet test the replacement.
2. The lower-third artwork occupies a small part of a large checkerboard stage at both
   sizes. Selection guidance sits immediately above the title. Fit/zoom and overlay density
   need a deliberate editing-task review rather than accepting this default as usable.
3. Inspector filter and 3D rows occupy substantial vertical space while ordinary text/font
   controls are absent from this selected Properties view. At 1366x768 the pivot reaches the
   bottom edge; the explanatory arming text visible at 1920x1080 is below the captured fold.
   M2 must prioritize relevant ordinary properties and independently usable panel scrolling.
4. Timeline rows and the selected layer agree in this capture; the stage is not blank.
   This does not close the owner's environment-specific blank-stage report.
5. Default Home shows Productions, Graphics, Videos and Brands plus New graphic. It does
   not establish the whole default creation-to-editor route; the helper bypass remains explicit.

## 3. Fixture specification

### Required target inventory and patch examples

The table below is the planning contract for M0/M2, not a claim that every patch already
exists. Tests must cover both sides of each before/after, then undo and save/reopen.

| Target | Required edit | Existing seam / planned readable patch | Preservation example |
|---|---|---|---|
| Catalog title/subtitle | Content, font, size/weight/colour/alignment and base offsets | `blocks/edit.ts:setFieldDefault` for declared fields; style contract variables for typography; new per-element base offset emission in M1 | Change title `Home` to `Away`: static text and declared default agree; score behavior and unrelated keys unchanged |
| Placed imported text | Content, typography, fit and X/Y | `designLayout.ts:placeLine`, `setLineTextStyle`, `setLineFit`; `designFields.ts` field seam | Wrapper left 100 -> 140 at unchanged top 80; child animation translation still -80 -> 0 |
| Placed image/logo slot | Replace asset, dimensions, fit/crop | `assetOps.ts`, `imageImport.ts`, `designLayout.ts:setSlotSize`; consistent field default and asset reference | Box 200x100 -> 300x150 changes dimensions; transform scale remains 1. Replacement does not move the slot |
| Existing imported group | Select, move/scale/rotate as a unit | Source-derived group identity and parent transform composition; exact wrapper policy still needs M0 fixture proof | Two children keep their local offsets and bindings; moving group does not rewrite individual child keys |
| New supported text/shape/image | Insert, style, select and animate | `edit.ts:addCatalogLine`, `designLayout.ts:addPlacedLine`, `assetOps.ts:insertImageElement` where applicable; simple shape insertion needs a deterministic source transform | Insert one rectangle with unique target identity and commented styling; undo restores original source exactly |
| Duplicate eligible layer | Copy content/style and owned animation; mint fresh identities | Validate all selector/field/asset references before one transaction; no new opaque scene | `f0` duplicate gets a free field ID; copied track targets that ID; shared asset bytes may be reused without sharing mutable field identity |
| Delete bound layer | Remove eligible unbound object; report bindings before destructive removal | Dependency inspection across fields, tracks and behavior; explicitly confirm listed removals or refuse unsupported dependency rewrite | Deleting a decorative rectangle removes its owned tracks; deleting score text cannot silently remove the score capability |
| Reorder eligible siblings | Change paint order in one supported parent | Deterministic markup ordering with identity unchanged; refuse unsupported stacking-context changes | Swap two overlapping rectangles; selectors and timing remain byte-equivalent |
| Align/distribute | Use rendered bounds in common parent coordinates, write base offsets | Same Layout patch as drag/numeric edit, atomically applied to eligible selection | Align three labels left; widths and independent animation remain unchanged |

Resolved scope: required catalog title/subtitle/panel, required editable fields and existing
groups of F2, and all F3 brand-role objects cannot be classified unsupported merely because
the current implementation lacks their transform. Unknown arbitrary source remains a separate
preservation fixture. Exact wrapper/pivot CSS and preview message examples are still an M0
engineering proof obligation; this table alone is not that proof.

### Proposed preview protocol cases to settle before M1

Derived from the accepted interaction plan; these specify required outcomes, not current API names:

1. Commit supported key data at document revision R2/request 12 while parked at 0.4 s.
   Update the existing interpreter, acknowledge the matching request, then show the R2 pose
   at 0.4 s. A delayed R1/request 11 response cannot change pose, selection or time.
2. Replace asset bytes at the same path. Revision changes, rebuild completes, then re-seek.
   A path-only identity must fail this fixture. Preserve font/asset readiness in the proof.
3. Begin a drag at R2 and show transient poses; Escape restores R2 source and pose without
   adding history. Pointer-up instead commits one transaction and one final acknowledgement.
4. Undo R2 to previous source uses a new ordered request, even if content hash matches an old
   revision; it re-seeks current parked time. Redo cannot be overwritten by the earlier undo ack.
5. External code edit during a drag cancels the stale gesture before applying a patch to a
   different document. Unsupported hot updates explicitly take rebuild, not partial mutation.

Agree message fields and refusal behavior against these examples during M0, then implement
the protocol in M1. No synthetic message fixture should be described as live runtime proof.

Freeze actual baseline source/export files and SHA-256 hashes before the comparative run.
F1/F2/F4/F5 are baseline inputs. F3 starts as a design/asset brief; F6 starts as specified
negative scenarios. Their future installation/provenance states are built with M5-M7, not
prerequisites that would force product implementation during M0. These rows define required
fixtures; they do not claim all fixture artifacts exist.

| Fixture | Required content | Purpose |
|---|---|---|
| F1 catalog lower third | Existing Hairline variant, title/subtitle/panel, stable target IDs, documented original defaults | Ordinary editing and independent X/opacity animation; no imported-only workaround |
| F2 imported SVG scoreboard | Nested groups, two team names/scores, logo slot, existing binding/behavior, transformed parent | Import hierarchy, text/logo changes, multi-selection, Next/update/Out regression |
| F3 Starter set | Lower third, headline, logo bug, holding and end screen; one brand with bundled font and PNG/SVG logo | Complete customize-to-production route and consistent styling |
| F4 stress scene | Exactly 30 rendered selectable layers and 300 keys, independent X/opacity tracks, fixed durations and assets | Repeatable feedback measurement and dense timeline hit targets |
| F5 preservation set | Legacy source, unsupported/unknown animation version, custom ease, loop, lifecycle call, branch state and handwritten CSS/JS | Honest refusals, no source loss and existing behavior preserved |
| F6 failure set | Same-name different-collection items, renamed installed item, local overrides, conflicting later revision, interrupted save | Durable installation, retry and guarded revert |

Use identical artwork dimensions, content, fonts, assets, key counts and requested output in
both editors where supported. Setup/import conversion is recorded as work, not removed from
the workflow timing. Where a fixture cannot be represented, record the limitation and manual
steps. Do not substitute arbitrary JS execution for source recovery.

## 4. Baseline and final task matrix

Each task is run first against the existing product, then again at its milestone and M8.
Outcomes: pass / fail / unavailable / blocked / untested. Record an unbuilt capability as
unavailable after inspecting its entry path, including manual alternatives. Baseline failures are expected evidence, not a
reason to hide the task. Existing automated spec passes are recorded separately below.

| ID | Exact task and expected result | Fixture / milestone | NoaCG task observation | Studio task observation |
|---|---|---|---|---|
| B01 | Fresh default session: create a catalog graphic, find Edit, select title; return Home and reopen it. Repeat from SVG import and saved graphic. No undocumented Advanced-mode prerequisite | F1/F2 / M2 | Untested | Untested |
| B02 | Find a nested layer, select overlapping artwork, multi-select, lock/unlock, rename and reorder within its parent; selection stays consistent across panels | F1/F2 / M2 | Partial: F1 row/inspector selection observed; remaining sequence untested | Untested |
| B03 | Move base X by 40 px, resize and rotate supported artwork; numeric and canvas results agree. Cancel a second drag, undo and redo; animation offsets and siblings remain intact | F1/F2 / M1-M2 | Untested | Untested |
| B04 | Change title/font/colour; test a long title; replace logo; add a rectangle, ellipse, image and text; duplicate/delete, align/distribute eligible objects; reopen and verify source/bindings | F1/F2 / M2 | Untested | Untested |
| B05 | Animate title X -80 to 0 in 1 s; opacity 0 to 1 in 0.3 s; set X Ease out; move end to 0.8 s; scrub both ways, undo/redo, save/reopen and play export | F1/F2 / M2 | Untested | Untested |
| B06 | Select two X keys, retime together, nudge one frame, snap/bypass, copy/paste; occupied target refuses atomically. Set Hold and sample immediately before/at destination; opacity unchanged | F1/F4 / M3 | Untested | Untested |
| B07 | Rehearse two reveals, update a score during motion and hold, run Out during entry, replay; scrub without firing score/timer/external effects | F2/F5 / M4 | Untested | Untested |
| B08 | From Home choose collection, select three items, choose/create brand, customize one item, install into production with cues, rehearse and run; no code/keyframes required | F3 / M6-M7 | Untested | Untested; record external work if unavailable |
| B09 | Apply brand, undo including visible logo, redo; locally override title colour, change saved brand, explicitly reapply with override preserved; untouched graphics stay unchanged | F3/F6 / M5 | Untested | Untested; record capability differences |
| B10 | Interrupt selected-set installation, reload and retry; no duplicates. Attempt revert after later edit; conflict is visible. Export and play bundled font/logo on a clean host and named production target | F3/F6 / M7-M8 | Untested | Untested; separate unsupported steps |
| B11 | Repeated selection, canvas drags, scrubs and panel resize in 30-layer/300-key scene; measure visible feedback and inspect both viewports | F4 / every milestone | F1 static viewports inspected; F4 feedback unmeasured | Unmeasured |

For each row record: ordered actions, completion, elapsed time, wrong turns, assistance,
unexpected edits, visual defects, console errors, source before/after and artifact links.
Preserve failure clips as well as successful results. Provide a concise source-inspection
receipt for the comparable Studio implementation using the pinned inventory in the research.

Human walk: use 2-3 first-time users and alternate editor order. First test individual basic
edits (one minute each without instruction), then introduce keyframes equally and run B05
(five-minute target without code/assistance). B08 has a five-minute target. Setup counts.
Record each participant's outcome and preference, not just an average. These targets are
not measurements or a statistical market study.

Owner baseline walk: open the normal current-main entry route, repeat the previously blank
stage scenario and explain aloud where editing feels wrong. If blank stage does not recur,
record the attempted route/environment and keep the original report unresolved. This cannot
be replaced by an automated headless pass.

## 5. Performance and visual measurement protocol

Queue browser workloads through `npm run queue`. Benchmark with production debounce settings;
the existing e2e configuration may shorten them. Record cold load separately from warmed
interaction. A performance harness is still to be built as baseline tooling, not product code;
it is not delivered by writing this protocol.

At each viewport (1366x768 and 1920x1080), record at least 30 selections, 10 continuous
canvas drags, 10 forward/back scrubs and 10 undo/redo cycles in F4. Preserve raw samples.
Measure input-to-visible-render latency, changed rendered poses per second, final pointer-up
latency, iframe rebuild duration, request/ack identities, rAF intervals and long tasks.
Report median, p95, maximum and individual stalls; a running rAF callback is not visible
feedback. Do not use source revision acknowledgement alone as a pixel change measurement.

Targets from the interaction plan: selection within 100 ms; continuous feedback at least
30 visible updates/second; no visible freeze over 100 ms; pointer-up final pose within 150 ms.
Report expensive rebuild cases separately without excluding them from the user's task time.
Record OS/browser zoom and monitor scaling; inspect 100% and 125% browser zoom at both sizes.

Visual review inspects panel alignment, typography, numeric units, focus, clipping, scroll
boundaries, selection contrast, tooltip obstruction, key hit areas and adjacent-key selection.
Save full-workspace screenshots plus close-ups of defects. No acceptance from DOM assertions
alone. Clean export comparison samples start, eased midpoint, key boundaries, Hold and exit;
font readiness and missing assets must be checked in a fresh host without editor caches.

## 6. Evidence ledger and readiness

| Evidence | State | What closes it |
|---|---|---|
| Pinned source inventory and gap assessment | Recorded in this receipt | Refresh only for an explicitly changed baseline revision |
| Existing-contract regression run j-1297 | 45 passed, no retries, 1.3 minutes | Current-contract regression only; no new contract or comparative usability acceptance |
| Actual default entry routes and paired task recordings | Pending | B01-B10 observations in both editors, including unavailable steps |
| Fixed baseline fixture artifacts/hashes | F1 source/hash recorded; remaining inputs pending | F2/F4/F5 sources and equivalent reference inputs; F3 design brief/F6 negative scenarios suffice until their implementation milestones |
| Performance measurements | Pending | F4 harness plus raw production-configured samples for B11 |
| Owner-machine blank-stage/current experience walk | Pending | Dated owner observation, reproduction or explicit unreproduced record |
| Preview/transform contract examples | Specified in detailed plan, fixtures pending | Worked source-before/after and message-order cases for M1, including stale ack/undo/cancel |
| Unified scope review and implementation release | Pending | Owner reviews roadmap/exclusions and explicitly resumes implementation |

The planning documents may be reviewed and committed while these evidence items remain open.
**M0 is not complete and M1 is not authorized by this receipt.** The next session must finish
the pending baseline work rather than jump to brand application or a timeline rewrite.

## Additional review evidence, 2026-09-17

Read the [baseline supplement](editor-design-review-2026-09-17/baseline-supplement.md) for
actual default catalog/SVG entry observations, reference-editor screenshots, fixed stress
fixtures, sampling limitations and the mockup checks. It updates the evidence ledger without
turning partial tasks or automated scripts into human acceptance. M0 remains open.

B12 is conditional on shipping optional Monaco (roadmap E18): edit CSS in Monaco, move the same title visually, add an opacity
key, apply a brand logo, undo all four in order, redo, save/reopen and export. Exercise invalid
JS and an external code edit during a gesture. It is not an implementation-entry or whole-editor blocker when Monaco is deferred. The new
combined transaction is not implemented and B12 is not passed by retaining the dependency.

The owner rejected the first mockup on 2026-09-17. Read the revised
[professional direction](../EDITOR_PROFESSIONAL_DIRECTION.md) for required B13-B18: direct
playhead/Out triggers, Lottie/loops, gradients/masks/effects, structured live data, CLI/MCP
round-trip and embedded AI. These new cases are specified but NOT measured. Add their fixed
fixtures and classify current capability before closing M0; do not reinterpret older stress
measurements as their acceptance.
