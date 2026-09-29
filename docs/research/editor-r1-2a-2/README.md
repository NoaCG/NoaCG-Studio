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
  - Keeping the departing side: a `cubic-bezier` keeps its own (x1, y1) text; a Hold refuses.
    Every other ease keeps (1/3, 1/3). **This deviates from the phase brief's default**, which
    also kept a named curve's exact departing point. Reason from the code: the format and the
    old menu store a named ease as the ease INTO its key, so the whole curve is the arriving
    key's own and the departing key never set a side. Under the default, Easy Ease In on an
    Overshoot or `power2.out` key changes nothing (their exact arriving point is already
    (2/3, 1)), and Easy Ease In or Linear on a Bounce key refuses. Revert by making the
    departing branch of `keptSidePoint` in `easeRuntime.ts` use `cubicPoints` as the arriving
    branch does.
- **Whole-segment presets.** Bounce and Overshoot replace the whole arriving segment. They
  refuse when the departing side was set on its own: a `cubic-bezier` whose departing point is
  not Linear's, or a Hold. Named curves are replaced, as the old menu replaced them. Hold
  replaces the whole departing segment without refusing: a held segment has no approach into the
  next key, so nothing of that key's In side could still play (undo restores it).
- **Hold form.** `hold` keeps the departing key's value and jumps to the arriving key's value at
  the end of the segment. Its curve is 0 below p = 1 - 1e-5 and 1 from there, so GSAP's 1e-7 s
  time rounding still lands on the arriving key at its exact time for any segment of 10 ms or
  more, and a 60 s hold jumps less than a millisecond early. It is in the shared grammar, so
  editor sampling and every runtime use the same function.
- **Mirror.** E_rev(u) = 1 - E(1 - u) turns `hold` into `jump`: 0 at p <= 1e-5, then 1, which
  jumps to the arriving value just after the departing key and keeps it. Each is the other's
  mirror, so reversal of an entrance with a Hold is exact. `jump` is written only by reversal;
  the menu offers Hold alone.
- **Split.** A held segment splits into two held halves: the new key keeps the departing value
  with `hold`, and the arriving key keeps `hold`. A `jump` segment splits the same way with the
  arriving value. No slice of either exists (a slice would rescale a flat part), and
  `slice(hold, ...)` is not in the grammar.
- **Set Out, reversal and interrupted Out.** Set Out across a held segment splits it as above and
  moves the held rest into Out, which then holds and jumps at the original absolute time.
  Reverse writes `jump` where the entrance held. An interrupted Out tweens from the live value to
  the last exit key with that key's ease as today, so a `hold` there keeps the live value until
  the last key and then jumps; a `hold` is not a slice, so `noacgWholeEase` leaves it alone.
- **Interpreter.** Adding `hold` and `jump` changes the emitted interpreter text. The R1.2a.1 body
  is frozen by content hash, its text kept as `e2e/fixtures/interpreter-whole-ease-v1.js`, and
  upgrades once on preview, save and export. The grammar's capability comment becomes
  `shared-ease-v2`. Export validation blocks a `hold` or `jump` under an interpreter without
  them and asks for one save, as G01 does for `cubic-bezier` and `slice`.
- **Batch.** One registry operation, `key.ease`, carries the selected keys and the preset, and
  one session transaction writes it: one undo. Each selected key's sides map to segments; a
  segment requested from both of its keys takes both points and keeps nothing. A selected side
  with no segment (the In side of a first key, the Out side of a last key) is skipped. The batch
  refuses whole, naming the layer, property and key, when nothing applies, a key is gone, a
  track is not numeric or loops, or any side cannot be written exactly. A segment whose new ease
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
  marquee in progress. The toolbar shows the count and the state: the preset every selected key
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
