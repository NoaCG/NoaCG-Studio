# Editor acceptance register

2026-09-17. Live task/evidence ledger under [EDITOR_PLAN.md](../EDITOR_PLAN.md).
All earlier E/B identities are retained; no task is passed by moving it between releases.
M0 closes as an inventory. Product implementation remains on owner hold.

| Task | Exact outcome | Responsible slice | Current evidence |
|---|---|---|---|
| B01 | Fresh default session: create a catalog graphic, find Edit, select title; return Home and reopen it. Repeat from SVG import and saved graphic. No undocumented Advanced-mode prerequisite | R1.1 / R1.4 | Partial historical observations; full task unverified |
| B02 | Find a nested layer, select overlapping artwork, multi-select, lock/unlock, rename and reorder within its parent; selection stays consistent across panels | R1.1-R1.2 | Partial historical observations; full task unverified |
| B03 | Move base X by 40 px, resize and rotate supported artwork; numeric and canvas results agree. Cancel a second drag, undo and redo; animation offsets and siblings remain intact | R1.1-R1.2 | Partial historical observations; full task unverified |
| B04 | Change title/font/colour; test a long title; replace logo; add a rectangle, ellipse, image and text; duplicate/delete, align/distribute eligible objects; reopen and verify source/bindings | R1.2 | Unverified for the replacement editor |
| B05 | Animate title X -80 to 0 in 1 s; opacity 0 to 1 in 0.3 s; set the starting X key to Easy Ease Out; move end to 0.8 s; scrub both ways, undo/redo, save/reopen and play export | R1.1-R1.2 | Unverified for the replacement editor |
| B06 | Select two X keys, retime together, nudge one frame, snap/bypass, copy/paste; occupied target refuses atomically; explicit cross-cue moves preserve source ownership. Set outgoing Hold on the first key and sample immediately before/at the following key; opacity unchanged | R1.2 | Unverified for the replacement editor |
| B07 | Rehearse two reveals, update a score during motion and hold, run Out during entry, replay; scrub without firing score/timer/external effects | R1.2 | Unverified for the replacement editor |
| B08 | From Home choose collection, select three items, choose/create brand, customize one item, install into production with cues, rehearse and run; no code/keyframes required | R1.4 | Unverified for the replacement editor |
| B09 | Apply brand, undo including visible logo, redo; locally override title colour, change saved brand, explicitly reapply with override preserved; untouched graphics stay unchanged | R1.4 | Unverified for the replacement editor |
| B10 | Interrupt selected-set installation, reload and retry; no duplicates. Attempt revert after later edit; conflict is visible. Export and play bundled font/logo on a clean host and named production target | R1.4-R1.5 | Unverified for the replacement editor |
| B11 | Repeated selection, canvas drags, scrubs and panel resize in 30-layer/300-key scene; measure visible feedback and inspect both viewports | R1.1 onward | Partial historical observations; full task unverified |
| B12 | If Monaco ships: CSS edit, visual move, opacity key, brand apply, chronological undo/redo, invalid source and concurrent edit, save/reopen/export. | Optional Monaco only | Conditional; excluded from release gate if Monaco is deferred |
| B13 | Direct ruler/playhead seek and frame entry; key retime independent of seek; editable Out boundary; manual exit, preservation of existing timed behavior and interruption from In/loop; repeated actions; no jump. Include a named second reveal on Next, layer existence span and step-local effective clocks. | R1.2 | Unverified for the replacement editor |
| B14 | R1: supported HTML/SVG property loops with repeat/yoyo, independent local ruler, deterministic backward seek and finite Out. R2: imported Lottie at differing FPS, trims/ranges, seamless repeated loop, reverse seek, interruption/Out and clean-host packages; reject missing assets/unsupported features honestly | R1.2 loops; R2.1 Lottie | Unverified for the replacement editor |
| B15 | Gradient stops/geometry, mask/source, ordered effects and animated supported parameters; undo/save/reopen/export parity; reject cyclic/dangling masks | R2.2 | Unverified for the replacement editor |
| B16 | Bind text/image/colour to object/array values; grow/shrink/reorder collection by stable item ID; missing fields and empty/overflow states; stale feed/reconnect and deterministic replay; target compatibility | R3.1 | Unverified for the replacement editor |
| B17 | CLI-generated graphic -> visual edit -> MCP edit -> save/reopen -> three exports/internal rehearsal; exact unrelated source preservation; stale concurrent edit refused | R1.3 core; R3.2 paired bridge | Unverified for the replacement editor |
| B18 | Free helper explanation/basic edit, BYOK and external tool equivalence; selection context; cancel, invalid tools, stale revision, undo, quota/timeout and offline fallback; real model task quality separately measured | R1.3 core; R3.2 full | Unverified for the replacement editor |

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
| Illustrator-style wizard output, nested/overlapping selection, parent-transform and source patch fixtures | R1.1 | First SVG gesture slice acceptance |
| Owner-machine blank-stage reproduction or explicitly unreproduced attempt with environment | R1.1 | Claim that the blank-stage problem is resolved |
| Input-to-pixel latency, revisions/acks, long tasks, reverse seek, 125% zoom | R1.1 | Shared interaction acceptance; repeat at R1.5 |
| Paired B02-B07 sequences and first/last-key, mixed axes, per-step inheritance | R1.1-R1.2 | Relevant animation slice acceptance |
| Templates/gallery, brands and installation recovery | R1.4 | Full creation-to-rundown acceptance |
| First-time-user walks and real output-host acceptance | R1.5 | Default editor switch |
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

- FIRST, B03/B05/B13 in R1.1: create/import a text-and-box graphic. At frame 0 drag it left
  off canvas and enable Position/Opacity; at frame 25 drag into place and change opacity.
  Two keys per changing property result. Add Out at frame 25, choose reverse; inspect normal
  exit keys, Play parks at frame 25 indefinitely, Out exits and clears. Undo/save/reopen/export
  and actual playout match. Repeat choosing No: no generated keys, manually author exit.
- B06/B13: drag flag and layer body/trim handles; snap to cue/playhead/key; move a layer with
  keys across cues; trim without stretching/deleting keys; cancel/undo exact source. Flag
  insertion through a supported curve preserves the curve; unsupported source stays intact.
- B07/B13 in R1.2: Add Step at the playhead, create a second text/shape, snap its bar start
  to the flag and animate it. Playback holds before its reveal, Next runs to Out and holds;
  Add Out reverse includes both original and later layers. All visible layers leave; early
  Out has no jump. No off-by-one or reveal-at-hold flash. Existing quiz/timer behavior survives.
- B02: collapsible folders change no rendering/timing. Real precompose/open/parent-bar edit/
  undo/save/reopen preserves child artwork, relative keys, field IDs and three export targets.
  Root cue flags remain authoritative; nested precomp timelines do not add independent holds.
- The earlier automatic-Out controls are deferred from the basic authoring flow; preserve
  existing timed graphics and test them when related source is edited.

## Final canvas/review additions, 2026-09-18

- B04/R1.1: canvas Text, Rectangle and Ellipse creation, constrained square/circle, point
  text versus text box, field+bar creation, cancel/undo, scale handles and numeric agreement.
  R1.2 completes image/rotation/anchor/keyboard and nested-target gesture coverage.
- B03/B05: animated handle edits key the correct Scale/Position channels at the playhead;
  text-box resize reflows rather than distorting glyphs. Test zoom, zero opacity, pasteboard,
  negative/nested transforms, Shift/Alt behavior, undo/cancel/save and output parity.
- B13/B17: Add Out prompt is adjacent to the invoking control, inside the visible viewport
  at 1366/1920 and 125% zoom. Mouse and keyboard routes choose reverse/manual; Escape adds
  no keys, retains the flag and restores focus. Canvas/timeline geometry does not jump.
