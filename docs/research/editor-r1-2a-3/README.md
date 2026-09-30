# R1.2a.3: Out from any step

Base: R1.2a.2 landed through PR #547 as `1b4e63691`; production reported `1b4e63691` with
`deployedCommitIsCurrent: true` (`/version.json`). This worktree branch
`claude/editor-r1-2a-3-out-afe1ee` started from fetched `origin/main` `7fd2b99f4`.

Why: an operator who takes a stepped graphic off air before its last Next cue wants it to leave
from what is on screen. Today it first jumps to the pose of the last step and plays motion the
viewer never saw.

Goal: the owner's 2026-09-29 contract (`docs/EDITOR_PLAN.md`, `docs/EDITOR_REBUILD_PLAN.md`
"Flags and transport" and "Interrupted exit (D02)", register rows D01 and D02). Out always
animates the graphic out from its current state, whichever step is active, and never plays or
reveals an unreached Next step. At the last step Out plays its authored animation from the held
pose. At an earlier step each visible layer animates from its live pose to its end-of-Out pose
(the interrupted-Out policy), and layers from unreached steps stay hidden.

Non-goals (R1.2a.4 and R1.2a.5): Add Step, flag drags, rename and delete, G02 editing the
departing side at a flag, cross-cue key moves, and Set Out crossing from a Next cue (the R1.2a.2
guard in `moveOutBoundary` stays).

## Reproduction (before any change)

Measured in Node against the unmodified emitted interpreter and the bundled GSAP 3.15, run in a
`vm` context over a stub DOM (the harness of `scripts/out-step.test.mjs`). The graphic: In moves
`#box` x from -900 to 0; a Next cue moves it on to 300; Out holds the keys an R1.2a.1 Set Out left
after crossing that Next cue (300, then the moved rest to 500 at 0.4 s, then -900 at 1 s).

- Parked after In, x reads 0. On Out, x reads 300 at exit time 0: a 300 px jump to the Out's first
  key, which is the last step's pose. It then plays the moved Next motion, 450 at 0.2 s and 500 at
  0.4 s, before leaving (-900 at 1 s).
- The cause is `noacgExitTimeline`: it decides `interrupted` only from whether the live timeline
  has finished. Parked at an earlier flag the entrance has finished, so Out plays the settled,
  authored exit, which sets every Out track's first key at time 0.
- The editor's Out button calls the same function with `interrupted` computed from the parked
  playhead (`exit` in `src/components/editorFoundation/runtime.ts`), so it plays the same jump.
- `next()` pressed during or after that Out plays the Next cue: its first keys jump in and its
  bars reveal its layers while the exit runs.

The browser reproduction in the simulator, every export and the editor is the new spec queued
on the unmodified code (`j-2394`, receipt below): parked after In, #box x jumps from 0 to 300 when
Out is pressed and reaches 509 where the interrupted policy gives 6; parked after Step 2, #title y
jumps from 0 to Step 3's -50; next() after Out starts a Next cue; the editor's Out plays the same
jump (it equals the simulator and misses the policy by 498 px). The last-step, 40%-interrupted and
machine scenarios already passed in all five.

## Decisions

Terms: a machine-less graphic's cues are In, then Next cues, then Out. The runtime counts the cues
it has played (`noacgStepsPlayed`: play() makes it 1, each next() adds one).

- **Earlier and last step.** The graphic is at its last step once every cue before Out has
  played. It is at an earlier step while at least one cue has played and a Next cue has not. With
  one Next cue, that is parked after In; with several, parked after In or after any Next cue but
  the last. A graphic without Next cues (In, Out) and the legacy one-step graphic have no earlier
  step. Off air (nothing played) is neither and stays as today.
- **Out at an earlier step is the interrupted Out**, whether or not the cue's timeline finished.
  Each exit track of a layer visible when Out starts tweens from its live value to its last Out
  key over that track's span, holding the live value through any leading delay, with the last
  key's ease played as its whole curve (a slice as the curve it was cut from). A final `hold`
  keeps the live value until the last key and then takes it; a final `jump` jumps where its own
  segment starts. Intermediate Out keys, including motion an R1.2a.1 Set Out moved out of a Next
  cue, are bypassed. This is the D02 policy unchanged; only when it applies changes.
- **Unreached steps stay hidden.** Out animates only layers visible as it starts
  (`noacgExitVisible`: hidden by a bar, pre-hidden by a later cue's `reveals`, or inside a hidden
  parent), and the interrupted exit applies no Out bar while it runs, so nothing appears on the way
  out. Tracks without Out keys hold their live value. The exit keeps its authored duration. At its
  end each visible layer takes its Out bar's end state and the root hides, so every still-visible
  layer is cleared, including one outside the root that only its bar hides (review fix; this also
  closes that gap for Out during In or a Next, which left such a layer on air). A layer visible at
  the earlier step that the authored exit would hide partway stays visible until the end.
- **Cuts stay cuts.** A one-key or zero-time Out track is an explicit cut under D02: it takes its
  value when Out starts, at every step. No catalog design has one (all 48 stepped designs were
  read); an author who wants a continuous Out from an earlier step gives that track an Out span.
- **Out during In or during a Next** is interrupted as today: the rule adds nothing there.
- **Out at the last step** is unchanged: the authored exit from the held pose.
- **Next after Out does nothing until play().** Out from an earlier step leaves Next cues unplayed,
  and a next() then would play one on the way out. A machine already ignores next() off air; the
  classic walk now does too while an Out is active or done.
- **Machine graphics are unchanged.** A graphic with a state machine (Quiz, polls, stream
  notifications: 44 of the 48 stepped catalog designs) keeps its Out from every state, because its
  states are an authored graph rather than a linear reveal. The rule reads `NOACG_ANIM.machine`.
  Changing that needs the owner.
- **Editor.** The Out button starts the exit from the parked pose through the same interpreter,
  passing the parked cue as the played count, so the preview follows the rule. Two older editor
  readings are corrected (review): a flag is read from summed cue lengths and can sit a float step
  short of its cue's end, which played the last flag as interrupted, so the bridge counts within a
  microsecond of a cue's end as its end; and Edit Out (Out's first frame, where the authored exit
  starts) now plays the authored exit instead of an interrupted one.
- **An Out preview is not an authoring pose.** Paused during the editor's Out, the pose can be one
  the Out cue's keys never hold (from an earlier step it is the interrupted exit), and keying it
  would write that pose into the authored exit. The bridge marks exit poses and every pose edit
  refuses there with a reason; a click on the timeline returns to the Out cue's own pose.
- **Upgrade.** The rule changes the emitted interpreter text. The R1.2a.2 body is frozen by content
  hash, its text kept as `e2e/fixtures/interpreter-hold-v1.js`, and upgrades once on preview,
  save and export like the bodies before it. No validation change: the video render, the one path
  that does not upgrade, plays every cue before Out, so it never takes Out from an earlier step.

## Acceptance

The fixture: text, box and badge layers with In, two Next cues and Out; the box's Out ends on a
slice and the text's on a hold, a Next cue reveals the badge by a bar and another one reveals an
extra layer outside the root by `reveals`; distinct cue lengths at speed 1.25.

| Portion | Observable result |
|---|---|
| Last step | Out after the last Next cue: dense exit samples equal the authored Out keys (editor sampling) within 2e-3 in the simulator, SPX, CasparCG, OGraf and single-file exports. |
| Earlier step | Out parked after In and after the first Next cue: the dispatch discontinuity is under 1 px per position channel and .01 opacity; dense exit samples equal the interrupted-policy model (live value to last key, leading delay, whole slice curve, hold) within 2e-3; the badge and the outside layer are never visible; the root is hidden at the end; in all five. |
| Interrupted | Out at 40% of In and at 40% of each Next cue: the same model, as today, in all five. At its end a layer outside the root takes its Out bar's end state. |
| Next after Out | next() during and after an Out from an earlier step changes nothing until play(); play() then replays normally. |
| Editor | Parked on the flag after In or after Step 2, the Out button leaves from the parked pose and its poses during the exit equal the simulator's at the same exit times within 2e-3. Parked on the last flag (also at speed 1, where the flag sums a float step short) and at Edit Out, it plays the authored exit. |
| Out preview | Paused during the editor's Out, a key or pose edit refuses with its reason and leaves source and history unchanged; after a click on the timeline the same control edits the Out cue. |
| Upgrade | A graphic saved with the R1.2a.2 interpreter upgrades once, by content hash, in preview, save and export, then plays Out from an earlier step by this rule; a custom body still refuses. |
| Machines | A machine graphic parked at its first state plays its authored exit as today. |
| Catalog | `npm run catalog:affected` gates pass; only JS fingerprints move; taste frames of an earlier-step Out for card26 read as a clean exit. |
| Preserved | The Out, ease, key-ease, keys, fidelity-trim, base-edits, usability, foundation and alpha-entry editor specs, anim-engine and inspector pass unchanged. |

## Verification plan

`scripts/out-step.test.mjs` (build gate) runs the emitted interpreter and bundled GSAP over a stub
DOM for every row above that needs no browser, and each new guard is mutation-tested.
`e2e/editor-out-step.spec.ts` is written first and queued on the unmodified code, then the
editor regressions, the full affected run, build, re-recorded catalog JS fingerprints, the catalog
battery against this worktree's own dev server, taste frames, `/check` with one review workflow,
`/queue-merge` and the deployed `/version.json`.

## Implementation

- [animRuntime.ts](../../../src/templates/shared/animRuntime.ts), in the emitted interpreter:
  `noacgExitTimeline` takes Out as interrupted when a machine-less graphic has played a cue and a
  Next cue is still unplayed; `revealNextStep` returns null while an Out is active or done;
  `noacgBuildExit` gives an interrupted exit each visible layer's Out bar end state at its end.
  The R1.2a.2 body is `ANIM_INTERPRETER_BEFORE_STEP_OUT_HASH` in
  [animRuntimeLegacy.ts](../../../src/templates/shared/animRuntimeLegacy.ts), its text in
  `e2e/fixtures/interpreter-hold-v1.js`, and joins `writeOutData`'s known bodies.
- [runtime.ts](../../../src/components/editorFoundation/runtime.ts) (the editor's preview bridge):
  `exit` reads a cue end within a microsecond as the end, plays Edit Out as authored, and marks
  its poses `exiting`; [animationAuthoring.ts](../../../src/components/editorFoundation/animationAuthoring.ts)
  refuses pose edits on them.
- Tests: [out-step.test.mjs](../../../scripts/out-step.test.mjs) (build gate) and
  [editor-out-step.spec.ts](../../../e2e/editor-out-step.spec.ts), both reading
  `e2e/fixtures/out-steps.json`. `scripts/taste-frame-review.mjs --out` renders Out pressed from the
  hold and from each answered step, frozen at 25 and 60 percent of the exit.

## Review and simplification

`/check` review ran as one workflow: four read-only reviewers (runtime exit; upgrade and exports;
editor preview and UI; tests, docs and scope), each followed by one agent trying to refute its
findings (8 agents, merge base `7fd2b99f4`, every agent listed what it read). Of 16 findings, 5
were refuted and 11 stood.

- Fixed: a visible layer outside the root that only its Out bar hides stayed on air after an
  interrupted exit, now reached from any earlier step (the bar's end state now applies at the
  exit's end); Edit Out then Out played the interrupted exit; pausing an Out from an earlier flag
  left a pose that key and drag edits wrote into the Out cue (edits now refuse on an Out preview);
  the Node test did not assert that bars stay off during the interrupted exit (a mutation survived);
  the test models read a zero-time Out track as its first key throughout; the editor test covered
  one earlier flag; this receipt was empty while the plans called the phase verified.
- Recorded rather than changed: machine graphics keep their exit (see Decisions; the Quiz taste
  frames show its Out from the Question state reveals nothing, so no owner item is filed), and
  the owner-queue item carries `answered: true` as the brief asked, with `done: true` so it is
  never presented again.
- Refuted: next() after a snap to the off state (nothing becomes visible, as on a fresh load),
  repeated stop() in two category scaffolds (older, outside this change), a video render that skips
  Next cues (nothing in the product sets `stepsToPlay`), an In edit refused on a customised R1.2a.2
  region (unchanged refusal), the editor's reveal pre-arm parity, and a dropped "repeat Next"
  obligation in the register.

Simplify ran as four parallel cleanup reviewers (reuse, simplification, efficiency, altitude).
Adopted: one exit model per test file, the browser model brought into agreement with the Node one
(zero-time tracks, the outside-root fade), fixture timings derived from the fixture, the editor
test's setup and sampling as helpers, the sibling spec's pose-cue check restored in `ready()`,
parallel module loads, one Out-cue index in the bridge, and one walk per design in the taste
`--out` loop that stops at the first refusal. The altitude reviewer found the float flag reading
above. Skipped: one model shared by the Node test and the spec (a shared `e2e/_*.ts` helper widens
the affected run to the whole suite), parallel scenario pages, a lighter page than the editor for
export-only tests, and rewording the interpreter's span-time expression (text churn only).

## Verification receipt

- Reproduction first: the Node probe above, `scripts/out-step.test.mjs` on the unmodified code
  (the earlier-step, next-after-Out and upgrade tests failed; last step, interrupted, machine and
  off-air passed), then `j-2393` and `j-2394`, the new browser spec on the unmodified code (numbers
  above; the first run also exposed two harness faults, OGraf's step count and an unawaited
  single-file build, fixed before `j-2394`).
- Node (build gate): `scripts/out-step.test.mjs`, 8 tests. Nine mutations each fail it: no
  earlier-step rule, the last step counted as earlier, machines included, off air included, next()
  after Out allowed, a wrong recorded hash, the hash left out of the known bodies, no Out bar end
  state in an interrupted exit, and every Out bar applied during it.
- Browser, first implementation: `j-2395`, the 8 new tests passed in the simulator, SPX, CasparCG,
  OGraf and single-file exports and the editor. `j-2396` (browser mutations): allowing next() after
  Out failed the Next check in all five targets, and including machines failed the machine test in
  the simulator and OGraf by 503.5 px. `j-2397`: the editor regressions with the new spec, 171
  passed, 20 configured old-editor skips. `j-2398`: the full affected run (61 spec files) with 3
  workers, 473 passed, 244 configured skips, none failed; catalog calibration 35/35; "Overall:
  passed".
- After review, fixes and simplification (tip `db3a7e904`): `j-2436`, the editor regressions with
  the new spec, 173 passed, 20 configured skips, none failed. `j-2451` (browser mutations of the
  editor fixes): reading flags exactly again failed Edit Out by 211 px and the speed-1 last flag by
  210 px, and dropping the Out-preview guard let the key edit through; all three tests failed as
  intended. `j-2452`: `npm run build` exited 0 with 2,088 Node tests (none failed) and the
  TypeScript, lint, dependency, bundle, prerender and after-build gates green.
- Catalog: `check-catalog-emit` re-recorded exactly 528 JS fingerprints and no HTML or CSS row,
  twice (the rule, then the review fixes).
- `j-2453`, the catalog battery against this worktree's own dev server (checked before every
  sweep): type-floor 526 variants, overflow 528 with no regression against its baseline, field
  coverage 526 (105 variants undriven, as before), numerals 349, catalog specs 35 plus 4 baseline
  tests, and factory 317/317 with all candidates passing. Its hold, long and step frames for lt01
  and qz02 are byte-identical to R1.2a.2's. Its Out frames were not: they equalled the frame Out
  was pressed from, because the new `--out` option froze the exit after a freeze had paused GSAP's
  global timeline, where the exit's `gsap.set` writes queue unrendered. Reproduced in the browser
  pane on lt01 (every seek of the exit left `#f0` at 0) and fixed by resuming the global timeline
  before Out and each seek, as `__next` already did (`#f0` then reads 9.06 at 25% and 110 at 60%).
  The product never pauses that timeline around an Out (only the video composition driver pauses
  it, for its own timelines).
- `j-2489`: the [taste frames](taste/) again with the fix (32 rendered; 14 kept here). All were
  opened. card26 (five cues, rows revealed one per Next): Out from the hold and from Step 2, both
  earlier steps, moves only the heading and the rows already on screen, shows no unreached row, and
  leaves only the accent rule at 60%; Out from the last step lifts all four rows in their stagger.
  qz02 (a machine graphic, unchanged): Out from the Question state fades and lifts the board and
  never shows the amber answer. lt01 (In and Out only): the name drops out behind its mask as before.
- `j-2494`, the full affected run on the final code (tip `02e84adb9`, 61 spec files) with 3 workers:
  475 passed, 244 configured skips, none failed; catalog calibration 35/35; "Overall: passed".
- A walk of card26 in the editor through the desktop browser pane (parked on the flag after its
  entrance, then Out) was attempted and gave no evidence: the pane drew no frames (screenshots timed
  out) and the sandboxed preview never answered the exit, a limitation of the pane. The same Out,
  Pause, Play and Edit Out buttons are pressed in headless Chromium by the editor tests above, which
  compare every pose with the simulator.

Not checked: a headed browser walk of the editor, physical 125% displays, receiving-host fonts, a
real OGraf host, and the two first-time-user trials, which stay pending as before. No owner item is
filed for this phase: Out from an earlier step is agent-verifiable, and the Step/Next workflow is
ready for an owner look only once R1.2a.4 adds step authoring. This is scoped engineering evidence,
not owner acceptance; the default editor is unchanged.
