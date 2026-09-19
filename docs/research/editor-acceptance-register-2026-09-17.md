# Editor acceptance register

2026-09-17. Live task/evidence ledger under [EDITOR_PLAN.md](../EDITOR_PLAN.md).
All earlier E/B identities are retained; no task is passed by moving it between releases.
M0 closes as an inventory. Product implementation remains on owner hold.
Updated after independent review of d5e8c1db: decisions are recorded below; no closing test
has been executed for the replacement editor. The corrected ordering supersedes prior receipts.
Owner approved group/precomposition scope on 2026-09-19; product tests remain unverified.
The [whole-workspace review](editor-whole-workspace-2026-09-19/README.md) now shows canvas,
assets/layers, tools, timeline, gallery and wizard handoff together with each phase's purpose.
Its browser inspection verifies only the design study; no E/B/D product task is closed by it.
Owner accepted the overall view. [Workflow refinements](editor-workflow-review-2026-09-19/README.md)
now govern the optional Outline, imports/Pen, easing batches, AI help-first and project/library
ownership. The current pre-R1.0 checkpoint reviews these refinements; no product test is passed.

| Task | Exact outcome | Responsible slice | Current evidence |
|---|---|---|---|
| B01 | Fresh default session: create a catalog graphic, find Edit, select title; return Home and reopen it. Repeat from SVG import and saved graphic. No undocumented Advanced-mode prerequisite | R1.0 route; R1.1a/d wizard; R1.4 gallery | Partial historical observations; full task unverified |
| B02 | Find a nested layer, select overlapping artwork, multi-select, lock/unlock, rename and reorder within its parent; selection stays consistent across panels | R1.0 selection; R1.1d nested; R1.2b tools | Partial historical observations; full task unverified |
| B03 | Move base X by 40 px, resize and rotate supported artwork; numeric and canvas results agree. Cancel a second drag, undo and redo; animation offsets and siblings remain intact | R1.1-R1.2 | Partial historical observations; full task unverified |
| B04 | File chooser/OS drop parity; Pen open/closed paths, curve handles where supported, cancel/undo/export; change title/font/colour; test a long title; replace logo; add a rectangle, ellipse, image and text; duplicate/delete, align/distribute eligible objects; reopen and verify source/bindings | R1.1a core creation; R1.2b full E05-E07 | Unverified for the replacement editor |
| B05 | Animate title X -80 to 0 in 1 s; opacity 0 to 1 in 0.3 s; set the starting X key to Easy Ease Out; move end to 0.8 s; scrub both ways, undo/redo, save/reopen and play export | R1.1-R1.2 | Unverified for the replacement editor |
| B06 | Marquee/Ctrl/Cmd/Shift-select keys across rows; dropdown/right-click parity for Linear/Ease/Bounce/Overshoot/Hold, mixed selection and atomic refusal; select two X keys, retime together, nudge one frame, snap/bypass, copy/paste; occupied target refuses atomically; explicit cross-cue moves preserve source ownership. Set outgoing Hold on the first key and sample immediately before/at the following key; opacity unchanged | R1.2 | Unverified for the replacement editor |
| B07 | Rehearse two reveals, update a score during motion and hold, run Out during entry, replay; scrub without firing score/timer/external effects | R1.1c early Out; R1.2a Next; R1.2c loop regression | Unverified for the replacement editor |
| B08 | From Home choose collection, select three items, choose/create brand, customize one item, install into production with cues, rehearse and run; no code/keyframes required | R1.4 | Unverified for the replacement editor |
| B09 | Apply brand, undo including visible logo, redo; locally override title colour, change saved brand, explicitly reapply with override preserved; untouched graphics stay unchanged | R1.4 | Unverified for the replacement editor |
| B10 | Interrupt selected-set installation, reload and retry; no duplicates. Attempt revert after later edit; conflict is visible. Export and play bundled font/logo on a clean host and named production target | R1.4-R1.5 | Unverified for the replacement editor |
| B11 | Repeated selection, canvas drags, scrubs and panel resize in 30-layer/300-key scene; measure visible feedback and inspect both viewports | R1.0 harness; every interactive slice | Partial historical observations; full task unverified |
| B12 | If Monaco ships: CSS edit, visual move, opacity key, brand apply, chronological undo/redo, invalid source and concurrent edit, save/reopen/export. | Optional Monaco only | Conditional; excluded from release gate if Monaco is deferred |
| B13 | Direct ruler/playhead seek with labelled seconds/frames; permanent Out and Set Out at playhead; empty/manual/reverse exit, hold and interruption without jump; named Next, span/body/trim semantics, effective clocks and existing timed behavior. | R1.0 scrub/units; R1.1b keys/body; R1.1c Out/parity; R1.1d trim; R1.2a Next/cross-cue; R1.2c loops | Unverified for the replacement editor |
| B14 | R2.1b: numbered image sequence ordering/gaps/source FPS, trim/loop/reverse seek/memory budget and offline export; R1: supported HTML/SVG property loops with repeat/yoyo, independent local ruler, deterministic backward seek and finite Out. R2: imported Lottie at differing FPS, trims/ranges, seamless repeated loop, reverse seek, interruption/Out and clean-host packages; reject missing assets/unsupported features honestly | R1.2 loops; R2.1a Lottie / b image sequences | Unverified for the replacement editor |
| B15 | Gradient stops/geometry, mask/source, ordered effects and animated supported parameters; undo/save/reopen/export parity; reject cyclic/dangling masks | R2.2 | Unverified for the replacement editor |
| B16 | Bind text/image/colour to object/array values; grow/shrink/reorder collection by stable item ID; missing fields and empty/overflow states; stale feed/reconnect and deterministic replay; target compatibility | R3.1 | Unverified for the replacement editor |
| B17 | CLI-generated graphic -> visual edit -> MCP edit -> save/reopen -> three exports/internal rehearsal; exact unrelated source preservation; stale concurrent edit refused | R1.3 core; R3.2 paired bridge | Unverified for the replacement editor |
| B18 | Free helper explanation/basic edit, BYOK and external tool equivalence; selection context; cancel, invalid tools, stale revision, undo, quota/timeout and offline fallback; real model task quality separately measured | R1.3 core; R3.2 full | Unverified for the replacement editor |
| B19 | One project holds lower third + intro; edit/switch/undo independently, reload both drafts, save, find on Home, bulk add to two rundowns and open playout. Master edits leave existing/on-air copies unchanged. Failed save/install, rename, project removal and legacy migration preserve documents | R1.0 ownership boundary; R1.4a/c/d | Unverified |

## Evidence in hand

Default catalog/SVG routes walked; source-changing drag/undo trials; F4 30-layer/300-key
fixtures; F5 preservation inputs; nested SVG input and worked preview/transform examples;
linear editor versus eased GSAP sampler mismatch reproduced. Historical j-1315/j-1323 builds
passed; v2 mockup j-1325 passed 19 checks. None proves the new interactions or latency target.
The 120 selections/40 scrub samples include automation overhead and are diagnostic only.

Read the [baseline supplement](editor-design-review-2026-09-17/baseline-supplement.md) for
raw observations and exclusions. The old [baseline receipt](editor-baseline-2026-09-17.md)
is a dated source of fixture definitions, not a growing implementation-entry checklist.

## Assigned outstanding evidence

| Work still unmeasured | Owner | Must exist before |
|---|---|---|
| Illustrator/catalog base adapters, source patches, nested transforms and stable IDs | R1.1a core; R1.1d full fixture | Each consuming gesture slice, not postponed to d |
| Owner-machine blank-stage reproduction or explicitly unreproduced attempt with environment | R1.0-R1.1d | Claim that the blank-stage problem is resolved |
| Input-to-pixel latency, revisions/acks, long tasks, reverse seek, 125% zoom | R1.0 harness onward | Shared interaction acceptance at each slice; repeat at R1.5 |
| Paired B02-B07 sequences and first/last-key, mixed axes, per-step inheritance | R1.1-R1.2 | Relevant animation slice acceptance |
| Templates/gallery, brands and installation recovery | R1.4 | Full creation-to-rundown acceptance |
| Two first-time users on basic editing; fuller journey walks and real receiving-host acceptance | R1.1d early users; R1.5 adoption | Early feedback before widening; default switch after full adoption gates |
| Lottie profile, mixed FPS and effect/gradient/mask parity | R2 | Corresponding capability release |
| Structured data/live replay and paired MCP concurrency | R3 | Corresponding capability release |

Record fixture/source hash, action sequence, outcome, source/pixel evidence, time/errors/help,
environment, job and human result separately. Compare pinned Studio where applicable; mark
unavailable reference workflows without invented times. R1 must pass its portion before it
becomes default; full completion waits for every required portion through R3.

## Transform and wizard acceptance extension, 2026-09-18

These extend existing task IDs; no product pass is implied by the interaction study.

- B01: direct Finish -> production still works; optional Open in editor requires no Advanced
  mode and creates no rundown entry. Both consume the same final generated document.
- B03: all five 2D groups, linked/unlinked and negative scale, zero-axis handling, 2 turns
  plus degrees, numeric anchor versus compensated anchor drag, parent transforms and animated
  pivot behavior. Panel Width/Height preserves text fitting/followers rather than scaling text.
- B04: new text gets a real field and updates in playout/export; label rename keeps its key;
  decorative/driven/outlined SVG content does not gain a duplicate input. Preserve exclusions.
- B05/B06: stopwatch at frame 12 creates only one key; scrub values at frame 20 creates another;
  previous/next and diamond state agree; disable at interpolated frame 16 retains the pose;
  undo restores both keys. Test modifiers, cancel, grouped/separated axes, key-side easing and
  outgoing Hold in preview/export. Verify save/reopen and no hidden start key.
- B07/B13: superseded by the timeline-first sequence below; flags are placed at the
  playhead and durations come from the timeline, without forms. Open actual wizard quiz/timer/stretch output,
  change a panel size, retain custom actions/fields/reveal logic, then save/rehearse/export.
- B17 and R1.5: validate manifest/runtime/resource behavior on an identified OGraf host;
  record YLE renderer/version/workflow separately before a YLE compatibility claim.

## Timeline-first acceptance correction, 2026-09-18

Owner correction supersedes earlier Add step/Edit Out dialog and no-cross-cue wording.

- FIRST COMPLETE EDITING TASK, B03/B05/B13 in R1.1b/c: create/import a text-and-box graphic. At frame 0 drag it left
  off canvas and enable Position/Opacity; at frame 25 (1 s at 25 fps) drag into place and change opacity.
  Two keys per changing property result. Set Out at frame 25, choose reverse; inspect normal
  exit keys, Play parks at frame 25 indefinitely, Out exits and clears. Undo/save/reopen/export
  and actual playout match. Repeat choosing No: no generated keys, manually author exit.
- B06/B13: body moves in R1.1b, trim in R1.1d, flag/cross-cue in R1.2a; snap to cue/playhead/key; move a layer with
  keys across cues; trim without stretching/deleting keys; cancel/undo exact source. Flag
  insertion through a supported curve preserves the curve; unsupported source stays intact.
- B07/B13 in R1.2: Add Step at the playhead, create a second text/shape, snap its bar start
  to the flag and animate it. Playback holds before its reveal, Next runs to Out and holds;
  Set Out reverse includes both original and later layers. All visible layers leave; early
  Out has no jump. No off-by-one or reveal-at-hold flash. Existing quiz/timer behavior survives.
- B02: folders change no rendering/timing. Group transform/parent-bar/local-ruler edits preserve
  child artwork, relative keys, field IDs, undo/save/reopen and three exports. Root flags alone
  control holds. Owner approved 2026-09-19: R1.2b delivers groups; instanced reusable precomps
  follow R1.5 as P-COMP and remain required for full completion.
- The earlier automatic-Out controls are deferred from the basic authoring flow; preserve
  existing timed graphics and test them when related source is edited.

## Final canvas/review additions, 2026-09-18

- B04/R1.1a: canvas Text, Rectangle and Ellipse creation, constrained square/circle, point
  text versus text box, field+bar creation, cancel/undo, scale handles and numeric agreement.
  R1.1d covers nested fixtures; R1.2b completes image/typography/asset/layout/keyboard tools (E05-E07).
- B03/B05: animated handle edits key the correct Scale/Position channels at the playhead;
  text-box resize reflows rather than distorting glyphs. Test zoom, zero opacity, pasteboard,
  negative/nested transforms, Shift/Alt behavior, undo/cancel/save and output parity.
- B13/B17: Set Out at playhead prompt is adjacent to the invoking control, inside the visible viewport
  at 1366/1920 and 125% zoom. Mouse and keyboard routes choose reverse/manual; Escape adds
  no keys, retains the flag and restores focus. Canvas/timeline geometry does not jump.

## Independent review decisions and closing tests, 2026-09-18

These decisions must be recorded before R1.0 (done in planning). The following tests close
implementation at the indicated slice; all remain unverified. They extend B tasks, not replace
them. Unsupported foreign source is preserved; required named fixtures must receive adapters.

| Decision | Closing test and failure condition | Slice / tasks |
|---|---|---|
| D01 permanent Out | Empty-exit In/Out document has identical source/flags/behavior after save/reopen; legacy one-step In gets a distinct derived empty exit and materializes it plus interpreter upgrade on first supported save/export, never replaying In on Out. Out always sits at the end of the last pre-Out segment. Set Out after No/Escape reoffers reverse while keys remain absent; existing keys are never silently replaced. | R1.1c / B05/B13 |
| D02 live-pose interruption | At 40% of In trigger Out; dispatch discontinuity is <1 px per position channel and <1 opacity percentage point, measured before first advancing frame. Each supported exit track starts at its live value and reaches its final exit key; finite completion hides all visible layers. Simulator and exported package both pass. Old owned runtime re-emits on write; external source sentinels survive. Repeat/replay cannot resurrect a layer. | R1.1c / B07/B13; repeat Next/loop in R1.2a/c |
| D03 Position adapter | Base Layout offset +40 px on a flow-laid catalog line preserves sibling layout and exact existing motion tracks; control is labelled as offset. Placed/absolute/SVG targets show parent coordinates and persist inverse-mapped runtime values. Test parent translate(100,80)/rotate(30)/scale(2), numeric/canvas agreement, animation, undo/save/reopen/export; no view-space coordinates leak into source. | R1.1a core, R1.1d nested / B03/B05 |
| D04 additive spans | Optional per-step selector visibility intervals round-trip; missing spans preserve legacy behavior. Static/no-key and disjoint intervals, forward/backward seek and held cue sides agree in simulator/export. Bar-body moves carry keys with relative offsets; later trim changes only spans, retaining clipped keys. Parser/serializer preserve spans; older runtime re-emits before consuming them. | R1.0 read-only bars; R1.1b writes/body; R1.1d trim / B02/B06/B13 |
| D05 bounded foundation | Flagged route works on a preview deployment and remains absent/off in the default editor. Load actual wizard/catalog fixtures; shell, selection, read-only bars and scrub work. Registry/history harness proves atomic undo/cancel/stale refusal; preview generation/revision/asset-byte checks and input-to-pixel measurement run at both viewports and 125% zoom. No mutation UI is implied by a read-only bar. | R1.0 / B01/B02/B11/B13; R1.1d two-user extension |

A two-first-time-user checkpoint in R1.1d uses the simple imported text+box task: find Edit,
move/resize, create two keys, Set Out/reverse or manual, hold/exit, save/reopen. Record time,
errors and assistance separately for each user. Use the existing ordinary-edit <=1 minute and
keyframe-task <=5 minutes after a short introduction targets; failures change the interactions
before broadening the editor. R1.5 repeats fuller SVG and collection-to-rundown acceptance.

## Later gates, all pending evidence

| Gate | Must close before | Closing test / receipt |
|---|---|---|
| G01 shared ease strings and exact reversal | R1.2a | Shared cubic-bezier and named bounce/back evaluators in sampler and interpreter/export; exact piecewise/mirrored/sliced evaluation or explicit refusal, including equal-endpoint cases; split at 40% and compare dense samples/endpoints/tangents. Named .in/.out swap mirrors exactly; incoming ease moves to the other key in the reversed segment. Unsupported ease is preserved/refused, never silently defaulted. Until this gate passes Set Out before the last In key refuses atomically with unchanged source/history. |
| G02 playhead-at-flag edit side | First relevant flag editing, complete R1.2a | Existing held layer edits the arriving segment; a layer whose bar starts there edits departing local zero. Mixed selection is atomic and each target segment is identified. No early reveal, off-by-one or mutation of the wrong step. |
| G03 unnamed SVG identity | R1.1d | First committed edit mints collision-free IDs in that transaction; inspection/cancel creates none. Nested unnamed/duplicate-ID fixtures, references, tracks and operator fields survive undo/redo/save/reopen without unrelated source changes. |
| G04 everyday tools allocation | R1.2b | Close E05-E07/B04 in full: typography/long-text fit, image/logo replacement, canvas tools, duplicate/delete/reorder/align/distribute/group movement and field/source/export parity. R1.1a closes only its core creation portion. |
| G05 ruler consistency | R1.0 onward | At 25 fps the same position reads 1.0 s or frame 25, and frame 30 at 30 fps. Ticks, cursor, input and flags agree; a one-frame nudge is 1/FPS effective seconds at speed 0.5/1/2. Toggling units changes no stored key time. Mockup mixed-unit labels are not the contract. |
| G06 registry-only parallel path | R1.4 start from R1.1c | Gallery/brand/install operations use the tested registry revision and run without AI or unfinished R1.2 tools. Integration fixture applies brand, undoes, installs a subset, reloads/retries and rehearses against actual shared source/runtime. Parallel work does not waive B08-B10/B19 or per-document ownership tests. |
| G07 GSAP and reuse rights | R1.5 | Identify exact GSAP version/plugins/licence text/date, builder use, redistribution in exports/CLI and notices; review rights/provenance and inspect clean bundles. Unresolved restrictions block release. Third-party AGPL helpers/runtime absent from CLI/shared dependency closure/emitted graphics. No assumption of permissive rights from zero price. |
| G08 group versus instances | Scope approved 2026-09-19; product evidence at R1.2b and P-COMP exits | Owner approved: R1.2b group has transform, parent bar and local ruler; test nested pose/keys/fields/history/export. Named P-COMP after R1.5 tests shared definition/instance overrides, IDs, cycles/detach, save/reopen and exports. This replaces the old R1.2 reusable-precomp obligation; full completion still requires it. Implementation evidence remains unverified. |

The reuse policy preserves sole-holder dual-licensing freedom: third-party AGPL code cannot
be relicensed merely because our application is also AGPL. Its addition would need additional
rights for a differently licensed combined distribution. Such source must never reach the
Apache CLI or emitted packages under the project's chosen boundary; the mechanism document
records the primary licence references. Historical reference fixtures stay isolated research.
