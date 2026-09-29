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

The browser reproduction in the simulator and every export is the new spec queued on the
unmodified code (receipt below).

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
  parent), and the interrupted exit applies no Out bars, so nothing appears on the way out. Tracks
  without Out keys hold their live value. The exit keeps its authored duration and the root hides
  at its end, clearing every still-visible layer. A layer visible at the earlier step that the
  authored exit would hide partway stays visible until then.
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
  passing the parked cue as the played count, so the preview follows the rule with no editor
  change beyond the interpreter it runs.
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
| Interrupted | Out at 40% of In and at 40% of each Next cue: the same model, as today, in all five. |
| Next after Out | next() during and after an Out from an earlier step changes nothing until play(); play() then replays normally. |
| Editor | Parked on the flag after In, the Out button's first pose is the parked pose, and its poses during the exit equal the simulator's at the same exit times within 2e-3. Parked on the last flag, it plays the authored exit. |
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
