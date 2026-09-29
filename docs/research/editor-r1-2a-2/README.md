# R1.2a.2: key-side easing over multi-key selection

Base: R1.2a.1 landed through PR #515 as `96ad4179a`; production reported `3cb2759b5`, which
contains it (`/version.json`). This worktree branch `claude/editor-r1-2a-2-b82003` started from
fetched `origin/main` `709fdd3ad`.

Why: an operator who wants a key to ease in, ease out, settle with a bounce or hold its value
needs to say so on the keys they selected, and the editor and every played graphic must agree
about the curve that results. The old editor's menu wrote one whole-segment ease INTO one key.

Goal: Linear, Easy Ease In, Easy Ease Out, Easy Ease, Bounce, Overshoot and Hold, applied as one
atomic, undoable batch to keys selected by marquee and Ctrl/Cmd/Shift across rows, from a
timeline toolbar dropdown and a key context menu. Editor sampling equals the simulator and every
executed export, a Hold included.

Non-goals (the next phase and later): Step/Next editing, cross-cue key moves, key retiming,
nudge, copy/paste, a curve graph, loops, and machine/call/dynamics authoring.

## Reproduction (before any change)

Measured in Node against the unmodified code and the bundled GSAP 3.15 (the rolldown loader of
`scripts/ease-runtime.test.mjs`):

- The old key menu (`setKeyframeEase`, `StepTimeline.tsx`) writes one whole-segment ease INTO a
  key. On the first key of a track, which has no incoming segment, it writes an ease that plays
  nowhere (`{"time":0,"value":-80,"ease":"power1.inOut"}`, x at 0.5 s unchanged). On a middle
  key it leaves the segment leaving that key unchanged. A key has no Out side at all.
- `hold` is not in the shared grammar (`parseEase('hold')` is null) and GSAP does not know it,
  so a tween eased `hold` plays GSAP's default `power1.out` (0.75 at 50%).
- GSAP's `steps(1)` jumps at 50% (0 at 0.49, 1 at 0.5) and `steps(1, true)` is already 1 at 0.
  Neither holds a value until the next key.
- GSAP rounds timeline times to 1e-7 s, so a seek to exactly a key's time can hand the arriving
  segment's ease a progress of 0.9999987 rather than 1 (keys 0.2 to 0.3 s at speed 1.3).
- The new editor has no key selection: a timeline key is a button that selects its layer and
  seeks.

## Decisions

Terms: a segment is the part of one track between key `k` and key `k + 1` of the same cue. Its
stored ease is on key `k + 1` (the ease INTO a key). Key `k + 1`'s **In side** arrives through
that segment; key `k`'s **Out side** departs through it.

- **Presets and sides.**

  | Preset | Sides of each selected key | Writes |
  |---|---|---|
  | Linear | In and Out | points (1/3, 1/3) departing, (2/3, 2/3) arriving |
  | Easy Ease In | In | arriving point (2/3, 1) |
  | Easy Ease Out | Out | departing point (1/3, 0) |
  | Easy Ease | In and Out | both points above |
  | Bounce | In | the whole arriving segment: `bounce.out` |
  | Overshoot | In | the whole arriving segment: `back.out(1.6)`, the house Overshoot |
  | Hold | Out | the whole departing segment: `hold` |

  Points are written as `cubic-bezier(x1,y1,x2,y2)` at twelve significant digits, as the mirror
  writes. A segment whose two points both lie on the diagonal is an exact straight line and is
  written `none`, so an all-Linear result needs no newer runtime.
- **The untouched side.** A point preset on one side keeps the segment's other side exactly or
  refuses; it never fits a curve.
  - Keeping the arriving side: a `cubic-bezier` keeps its own (x2, y2) text; `none`, `linear`
    and `power0` keep (2/3, 2/3); a Hold keeps (2/3, 2/3), because a Hold only departs; a named
    curve with an exact cubic form keeps its exact arriving point: `power1`/`quad`, `power2`/
    `cubic` and `back(s)` with `.in` or `.out` (G01's test pins these curves as beziers with
    x1 = 1/3, x2 = 2/3). Anything else refuses: other named curves, `.inOut`, slices, steps,
    the reversed Hold (`jump`) and unrecognized strings.
  - Keeping the departing side: a `cubic-bezier` keeps its own (x1, y1) text; a Hold refuses,
    and so does the first part of a split bezier whose departure was set on its own (a slice
    from 0), which has no point of its own. Every other ease keeps (1/3, 1/3). **This deviates from the phase brief's default**, which
    also kept a named curve's exact departing point. Reason from the code: the format and the
    old menu store a named ease as the ease INTO its key, so the whole curve is the arriving
    key's own and the departing key never set a side. Under the default, Easy Ease In on an
    Overshoot or `power2.out` key changes nothing (their exact arriving point is already
    (2/3, 1)), and Easy Ease In or Linear on a Bounce key refuses. To revert, make
    `departingPoint` in `easeRuntime.ts` return the exact cubic departing point of power1/quad,
    power2/cubic and back(s) with `.in` or `.out` (the arriving point's partner in
    `arrivingPoint`) and null for every other named curve, and revisit `departsOnItsOwn`, which
    decides what Bounce and Overshoot protect. A consequence of either reading: Overshoot's
    overshoot sits in its departing control point, so an Out side set on the key before an
    Overshoot key replaces the overshoot and keeps its arrival.
- **Whole-segment presets.** Bounce and Overshoot replace the whole arriving segment. They
  refuse when the departing side was set on its own: a `cubic-bezier` whose departing point is
  not Linear's, or a Hold. Named curves are replaced, as the old menu replaced them. Hold
  replaces the whole departing segment without refusing: a held segment has no approach into the
  next key, so nothing of that key's In side could still play (undo restores it).
- **Hold form.** `hold` keeps the departing key's value and jumps to the arriving key's value at
  the end of the segment. Its curve is 0 below p = 1 - 1e-5 and 1 from there, so GSAP's 1e-7 s
  time rounding still lands on the arriving key at its exact time for any segment of 10 ms or
  more, and a 60 s hold jumps less than a millisecond early. Below 10 ms of played time the
  arriving value can be a frame late and the next tween can start from the held one, so the Hold
  preset and a split that would leave the jump in a shorter part refuse. It is in the shared
  grammar, so editor sampling and every runtime use the same function.
- **Mirror.** E_rev(u) = 1 - E(1 - u) turns `hold` into `jump`: 0 at p <= 1e-5, then 1, which
  jumps to the arriving value just after the departing key and keeps it. Each is the other's
  mirror, so reversal of an entrance with a Hold is exact. `jump` is written only by reversal;
  the menu offers Hold alone.
- **Split.** A held segment splits into two held halves: the new key keeps the departing value
  with `hold`, and the arriving key keeps `hold`. A `jump` segment splits the same way with the
  arriving value. No slice of either exists (a slice would rescale a flat part), and
  `slice(hold, ...)` is not in the grammar. Every value is kept except within the jump's edge:
  each half's jump sits 1e-5 of its own length from its key, so the instant moves by at most
  1e-5 of the other half, under the stored 1 ms for any segment shorter than 100 s.
- **Set Out, reversal and interrupted Out.** Set Out across a held segment splits it as above and
  moves the held rest into Out, which then holds and jumps at the original absolute time.
  Reverse writes `jump` where the entrance held. An interrupted Out tweens from the live value to
  the last exit key with that key's ease as today, so a `hold` there keeps the live value until
  the last key and then jumps. A final `jump` (a reversed entrance whose first segment held)
  would jump at once over that stretched tween, so the interrupted exit starts it where its own
  segment starts, as the uninterrupted exit does, and keeps the live value until then. That is
  the one further interpreter change.
- **Interpreter.** Adding `hold` and `jump` changes the emitted interpreter text. The R1.2a.1 body
  is frozen by content hash, its text kept as `e2e/fixtures/interpreter-whole-ease-v1.js`, and
  upgrades once on preview, save and export. The grammar's capability comment becomes
  `shared-ease-v2`. Export validation blocks a `hold` or `jump` under an interpreter without
  them and asks for one save, as G01 does for `cubic-bezier` and `slice`.
- **Batch.** One registry operation, `key.ease`, carries the selected keys and the preset, and
  one session transaction writes it: one undo. Each selected key's sides map to segments; a
  segment requested from both of its keys takes both points and keeps nothing. A selected side
  with no segment (the In side of a first key, the Out side of a last key) is skipped. The batch
  refuses whole, naming the layer, property and key (its time as the timeline shows it, after
  speed), when nothing applies, a key is gone, a track is not numeric, or any side cannot be
  written exactly. A graphic with loops, calls, dynamics or a state machine refuses as all
  animation authoring in this editor does. Two keys at one moment are an instant jump: the In
  side arrives at the first and the Out side leaves from the last. A segment whose new ease
  equals its current one (the step default included) is not rewritten, so re-applying a preset
  changes no bytes and adds no history.
- **Selection.** Key selection is editor UI state, never written into the document. Keys of
  different properties at one moment used to overlap on a layer row, one hidden under another,
  so B06's single X key could not be picked with a pointer. A layer row now shows one key per
  moment standing for every property keyed there, and opens (the triangle beside its name) into
  one row per animated property. A plain click selects a key (and its layer, and seeks, as
  before); Ctrl, Cmd or Shift toggles it; a marquee dragged from empty lane space (any property
  row, or a layer row outside its bars) selects the keys whose centre it covers across rows,
  adding with a modifier; a click on empty lane space clears the selection; Escape cancels a
  marquee in progress. The last key of one cue and the first key of the next share a moment and
  show as one boundary key, which arrives in one cue and leaves in the other. A key is named by
  its stored time, so an edit that moves or adds keys (a bar move, Set Out, a new key) clears the
  selection rather than re-point it; an undo that moves no key keeps it. Undo and redo keys work
  from the dropdown, which keeps focus after it edits. The toolbar shows the count and the state: the preset every selected key
  already has, else Mixed (Custom for one key). The dropdown and the context menu call the same
  operation. Right-click keeps an existing selection that contains the key, else selects that
  key. The context menu opens from the keyboard with the context-menu key or Shift+F10 on a
  focused key, moves with the arrow keys and closes with Escape, returning focus to the key.
- **Set Out from a Next cue (guard, owner-approved default).** Until Step/Next editing lands, Set
  Out refuses to move keys or visibility-bar edges from a Next cue into Out: when Out is pressed
  before that cue, its moved motion would play. A boundary with nothing after it in that cue
  still moves (only the cue's still air shortens), and crossing the In cue stays allowed. This
  replaces R1.2a.1's narrower refusal for revealed layers outside the root, which only a Next
  cue could reach; R1.2a.1 assertions that encoded crossing from a Next cue now expect the guard.

## Step/Next contract for the next phase (owner decision, 2026-09-29)

Recorded here and in the plans; not implemented in this phase.

- A graphic may have any number of Step/Next states, and Next advances through them in order.
- Out always animates the graphic out from its current state, whichever step is active, and never
  plays or reveals an unreached Next step on the way out.
- The editor is strict about timeline arrangements: In, Step, Next and Out markers cannot be
  dragged onto each other or into combinations the runtime cannot interpret safely.
- At the last step, Out plays its authored animation from the held pose. At an earlier step, each
  visible layer animates from its live pose to its end-of-Out pose (today's interrupted-Out
  policy), and layers from unreached steps stay hidden.

## Acceptance and atomic refusals

| Portion | Observable result | Refusal (source and history byte-identical, clear reason) |
|---|---|---|
| Presets | On a selection across two layers and several properties, with first, middle and last keys and both sides, each preset writes exactly the eases in the table; unselected sides and all other source are byte-identical. | Nothing applies; a stale key; a string or looping track; a kept side without an exact point; Bounce or Overshoot over a departing point or Hold. |
| Transactions | One batch is one undo; redo, Escape, save/reopen and a second save agree; re-applying is a no-op with no history. | A refused batch adds no history and shows its reason. |
| Parity | For every preset, editor sampling equals the executed simulator, SPX, CasparCG, OGraf and single-file playback within 2e-3 on dense samples. An outgoing Hold on the first X key reads the first value one frame before the next key and the next value at it, in all five, with opacity unchanged. | Unchanged. |
| Hold algebra | `hold` and `jump` mirror each other exactly; each splits into two exact halves; Set Out across a held segment plays In then Out as before; reversal of a held entrance plays it backwards. | Unrecognized forms refuse as before; no slice of a Hold. |
| Upgrade | A graphic saved with the R1.2a.1 interpreter upgrades once, by content hash, in preview, save and export, and then plays a Hold; validation asks for one save under an older interpreter. | Custom interpreters refuse the write and block export. |
| Guard | Set Out inside a Next cue that would move keys or bars refuses; inside In it crosses as in R1.2a.1. | Source and history unchanged, in Node and the browser. |
| UI | Marquee across rows, modifier toggles, count and mixed state, dropdown and context menu parity, keyboard context access, Escape cancels a marquee and closes the menu. | The reason appears beside the control. |
| Preserved | R1.2a.1, G01, R1.1b-d and the Out specs pass; only assertions that encoded a lifted rule (Set Out crossing from a Next cue) change. | Machines, calls, dynamics, loops: unchanged. |

## Verification plan

Node tests beside `scripts/ease-runtime.test.mjs` and `scripts/out-boundary.test.mjs` for the
grammar, key-side mapping, split and mirror, each guard mutation-tested. Browser tests written
first and queued on the unmodified code, then the editor regressions, the full affected run
(validation changes, so the whole suite), build, re-recorded catalog JS fingerprints, the
catalog battery against this worktree's own dev server, taste frames for lt01 and qz02, `/check`
with one review workflow, `/queue-merge` and the deployed `/version.json`.

## Implementation

- [easeRuntime.ts](../../../src/templates/shared/easeRuntime.ts): `hold` and `jump` in the shared
  grammar (capability `shared-ease-v2`), their mirror, and the key-side algebra: `arrivingPoint`,
  `departingPoint`, `joinPoints` and `departsOnItsOwn`, with the Linear and Easy Ease points.
- [animEdit.ts](../../../src/blocks/animEdit.ts): `planKeyEase` maps the selected keys' sides to
  segments and writes or refuses them; `easeKeys` applies the plan; `KEY_EASE_PRESETS` names the
  seven presets. `splitKeyframeSegment` splits a hold or jump into two halves of the same form.
- [editorAnimation.ts](../../../src/blocks/editorAnimation.ts): `applyKeyEase`, the `key.ease`
  operation in the [registry](../../../src/components/editorFoundation/operations.ts). It writes
  through `writeAnimData`, or `writeOutData` when an Out key changes, so a known older interpreter
  upgrades and a custom one refuses.
- [editorOut.ts](../../../src/blocks/editorOut.ts): the Next-cue guard in `moveOutBoundary`.
- [animRuntime.ts](../../../src/templates/shared/animRuntime.ts): the interrupted exit starts a
  final `jump` where its own segment starts. `hasHoldRuntime` and `dataUsesHoldEase` pair data
  with the runtime; the R1.2a.1 body is `ANIM_INTERPRETER_BEFORE_HOLD_HASH` in
  [animRuntimeLegacy.ts](../../../src/templates/shared/animRuntimeLegacy.ts), its text in
  `e2e/fixtures/interpreter-whole-ease-v1.js`. [validateTemplate.ts](../../../src/validation/validateTemplate.ts)
  blocks a hold or jump under an interpreter without them.
- [Timeline.tsx](../../../src/components/editorFoundation/Timeline.tsx),
  [KeyEase.tsx](../../../src/components/editorFoundation/KeyEase.tsx) and
  [keySelection.ts](../../../src/components/editorFoundation/keySelection.ts): property rows, one
  key per moment, selection, marquee, the dropdown and the context menu. Frames at 1366 and 1920
  are in [built](built/).

## Review and simplification

`/check` review ran as one workflow: four read-only reviewers (grammar, split and mirror; key-side
mapping and batch semantics; runtime and exports; UI, history, tests and scope), each followed by
one agent trying to refute its findings (8 agents, merge base `709fdd3ad`, every agent listed what
it read). Of 24 findings, 3 were refuted and 21 stood, 20 of them distinct (two reviewers found the
interrupted jump).

- Fixed in this phase: an interrupted Out ending on a reversed Hold jumped at once (it now jumps
  where its segment starts); two keys at one moment sent the Out side to the empty segment
  between them; a departure set on its own was unprotected once a split wrapped it in a slice;
  a Hold under 10 ms of played time could land a frame late (Hold and such splits now refuse); a
  Next cue's legacy hide moved with Out; the In landing key and the Out first key overlapped on
  the timeline (now one boundary key); a bar move re-pointed the key selection (edits that move
  keys now clear it); a marquee left focus on the last control; clicking a property-row key
  scrolled it away; the key menu lost keyboard focus on a padding click and could let the browser
  menu open over it (the Windows Menu key case is defended but not checked in a headed Windows
  browser); undo did not work from the dropdown; refusals named stored rather than shown
  times and advised a selection that could not help; control names lacked their layer. The
  spec's revert instruction, split wording and handoff advice were corrected.
- Fixed in its own commit: a pre-existing R1.2a.1 defect where Out moved later than its cue's end
  left a layer's bar ending at the old hold, so Out skipped that layer.
- Kept as reported: text-equal "already applied" detection (a `linear` or spaced bezier is
  rewritten once; the product never writes those spellings) and one-sided presets refusing next
  to a curve without an exact arrival (Linear or Easy Ease on both keys works).
- Refuted: Overshoot's overshoot being replaced by an Out side on the key before (the spec
  states it), Set Out shortening a Next cue's still air (Out keys keep their absolute times, as
  R1.2a.1 defined), and a claim that the upgrade test missed two exports (CasparCG and
  single-file share the self-contained path the upgrade runs first in).

Simplify ran inline: `easeKeys` returns its input when nothing changes, so the operation plans
once, and the selection's toggle and marquee union share one helper.

## Verification receipt

- Reproduction first: the Node probe above, then `j-2369`, the 20 new browser tests queued on the
  unmodified code, all failing for the intended reasons (no `easeKeys`, no hold split, no key
  selection UI, no Next-cue refusal, no interpreter to upgrade).
- Node (build gate): `scripts/key-ease.test.mjs` (new), plus Hold cases in
  `scripts/ease-runtime.test.mjs` and guard, Hold and Out-later cases in
  `scripts/out-boundary.test.mjs`: 35 tests. 22 mutations of the new guards each fail them: the
  rounding edge, the mirror, slices of a hold, a jump's split value, the exact arrival points,
  inOut, the named-departure deviation, a Hold departure, the straight-line collapse, both
  departure-protection branches, the no-op check, nothing-applies, string and looping tracks, a
  first key's In side, both Next-cue guard branches, the upgrade hash and the capability marker.
  The Out-later fix is mutation-tested the same way.
- Browser, first implementation: `j-2371` to `j-2373`, all 20 new tests. Every preset equals
  editor sampling within 2e-3 in the simulator, SPX, CasparCG, OGraf and single-file exports at
  speed 1.3 with every key time on the grid; B06's Hold reads -80 one frame and 1 ms before the
  following key and 0 at it in all five, with opacity unchanged; a Hold splits, crosses Set Out
  at frame 12 and reverses exactly in all five; the R1.2a.1 body upgrades once and then plays a
  Hold in the simulator, SPX and OGraf, validation asks for one save under it and blocks a custom
  one; Set Out inside a Next cue refuses with source and history unchanged; and the UI tests.
  `j-2374`: the editor regressions with these specs, 157 passed, 20 configured old-editor skips.
- Browser mutations: making right-click replace the selection failed the context-menu test
  (`j-2375`). Removing the Hold's rounding edge left B06's round key times passing but failed the
  speed-1.3 preset parity in all five targets by 0.498 opacity at an exact key time (`j-2377`,
  after fixing the spec's `near()` helper, whose parameter shadowed the property labeller and
  turned every real mismatch into a TypeError).
- `j-2378`, the full affected run on the first implementation (validation changed, so the whole
  suite) with 3 workers: 1,201 passed, 544 configured skips, none failed; catalog calibration
  35/35; "Overall: passed".
- Catalog: `check-catalog-emit` re-recorded exactly 528 JS fingerprints and no HTML or CSS row,
  twice (the grammar, then the interrupted-jump change).
- After review, fixes and simplification (tip `3f52f2aa7`): `j-2381`, the editor regressions with
  every new test, 163 passed, 20 configured old-editor skips, none failed. That includes the
  interrupted Out over a reversed Hold in all five targets (live value held until 1.2 s within
  1e-6, then the end value), the boundary key, undo from the dropdown, and the selection cleared
  by a Set Out that moves keys.
- Browser mutation of the interrupted-jump fix (`j-2386`): starting the final jump at the exit's
  start again fails all five targets by 885.5 px 10 ms into the interrupted Out.
- `j-2382`, the full affected run on the same tip with 3 workers: 1,207 passed, 544 configured
  skips, none failed; catalog calibration 35/35; "Overall: passed".
- `j-2383`, the catalog battery against this worktree's own dev server (checked before every sweep):
  type-floor 526 variants, overflow 528 with no regression against its baseline, field coverage 526
  (the sponsor-placeholder exceptions as before), numerals 349, catalog specs 35 plus 4 baseline
  tests, factory all candidates, and the [taste frames](taste/) for Hairline (lt01) and Quiz (qz02).
  All six frames were opened: Hairline's name leads its role on the shared left edge beside the
  amber rule and long strings grow right from it; Quiz keeps its question centred above even
  plates, the amber reveal marks Mars, and long strings stay inside their plates. All six are
  byte-identical to the R1.2a.1 frames.
- The UI was walked in the browser pane and captured at 1366 and 1920 ([built](built/)): property
  rows under an opened layer, the translucent marquee, selected keys in white against orange, "5
  keys · Mixed" in the toolbar, the context menu at the pointer and clamped to the viewport, and a
  refusal reason under the dropdown that the next click dismisses.
- `j-2385`: `npm run build` exited 0 on tip `5e15c8e39`, with 2,077 Node tests (none failed) and
  the TypeScript, lint, dependency, bundle, prerender, owner-queue and after-build gates green.

Not checked: physical 125% displays, receiving-host fonts, a real OGraf host, the Windows Menu key
in a headed Windows browser, and the two first-time-user trials, which stay pending as before. This
is scoped engineering evidence, not owner acceptance; the default editor is unchanged. Two owner
items are filed: [a decision](../../acceptance/owner-queue/2026-09-29-editor-key-ease-named-curves.md)
on the named-curve reading and [a desktop look](../../acceptance/owner-queue/2026-09-29-editor-key-easing.md)
at the workflow.
