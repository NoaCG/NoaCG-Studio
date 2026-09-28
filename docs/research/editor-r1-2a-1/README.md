# R1.2a.1: Set Out across the last In key

Base: G01 landed through PR #505 as `81055bf716d276e79cc1f7a28d5216a73aedc897`; production
reported `188da0648`, which contains it (`/version.json`, `deployedCommitIsCurrent: true`).
This worktree branch `claude/editor-r1-2a-1-66dfbe` started from fetched `origin/main`
`188da0648`.

Why: an operator who sets Out partway through the entrance wants the graphic to hold there,
and the rest of the entrance to play when Out is pressed. Today that refuses.

Owner decision, 2026-09-28: allow Set Out to cross the last In key, splitting each crossed
segment with `splitKeyframeSegment`. One atomic operation and one undo. If any crossed
segment cannot be split exactly, refuse the whole move with source and history unchanged.

Goal: Set Out at any frame of the last pre-Out cue. Playing In and then Out reproduces the
original motion at every absolute time on the concatenated ruler, in the editor, the
simulator and every executed export.

Non-goals (R1.2a.2 and later): the key-side ease menu, the Hold form, multi-key selection,
Step/Next and cross-cue key drags, loops, machine/call/dynamics authoring, a curve graph.

## Reproduction (before any change)

A two-second entrance with `power2.out` and `back.out(1.6)` keys, Set Out at 1.2 s through
`applyOut` in Node (the rolldown loader of `scripts/ease-runtime.test.mjs`): refused with
"Set Out cannot move before the last In key until exact curve splitting is supported." and the
template unchanged. The browser refusal matrix in `e2e/editor-out.spec.ts` asserts the same for
`out.set` at 0.4 s on the linear text-and-box fixture.

## Decisions

Terms: `b` is the new boundary on the last pre-Out cue's stored clock (the frame-snapped
playhead through speed, at the serializer's 3 decimals), `D` that cue's old duration and
`delta = D - b`. A track is crossed when it has a key after `b`. Out moving later
(`delta < 0`) and a move with nothing after `b` behave as today, except that visibility bars
now repartition instead of refusing.

- **Keys hold their absolute times.** For each crossed track the entrance keeps a key at `b`:
  the existing key there, else `splitKeyframeSegment` at `b`, else (b before its first key) a
  hold key with the first key's value, which the runtime already applies from the cue start.
  Keys after `b` move to Out at `t - b`. A copy of the key at `b` starts the exit at Out time 0.
  A moved key's ease becomes explicit (its own, else the In cue default), so it no longer
  depends on the Out cue default. Existing Out keys shift by `delta`, as today.
- **Joining existing Out keys.** A crossed track that already has Out keys must meet them
  without a jump: the first Out key must hold the value the entrance ends with. Then the gap is
  flat, which any ease keeps constant, and a moved key landing on that key's time merges with
  it. A different value refuses, because the runtime jumps at Out start and a key there would
  turn that jump into motion.
- **Visibility spans are bars at absolute times.** On the last pre-Out cue each interval is
  clipped at `b`; the part after `b` moves into Out. After the old boundary the layer keeps
  what the original Out did: its own Out intervals shifted by `delta`, visible through the
  exit if it was visible at the old hold with no Out intervals, else hidden. A layer with Out
  intervals but none on the moved cue kept its visibility through the moved part, so its Out
  intervals gain a leading one from 0 to `delta`. Touching intervals join. The arriving side
  decides the hold, as today: a bar ending exactly at `b` is visible there. This replaces the
  blanket "crosses a visibility span" refusal. Never clip.
- **Out only animates layers visible as it starts** (`noacgExitVisible` reads the element and
  every parent). A layer hidden at the new hold that shows later in the moved part refuses, and
  so does a moved layer whose autoAlpha is 0 at `b` or that sits inside a layer hidden there
  (read from the template's document), because its moved motion would never play.
- **Exit duration keeps its absolute end** (`Dout + delta`) once the exit has keys or spans.
  An exit left with neither stays an instant cut, as today.
- **Prompt.** Reverse/manual is offered only when the resulting exit has no keys, read from
  the new source, not the view of the old one. A choice left open closes when a later Set Out
  gives the exit keys.
- **Interruption.** Out still tweens each exit track from the live value to its last key over
  that track's span. A crossed track with no Out keys of its own now ends where the entrance
  ended; one joined to Out keys ends at its own last Out key. When that last ease is a slice,
  the interruption plays the whole curve the slice was cut from: stretched over the longer way
  from the live pose, a slice can swing far past its end. This is the one interpreter change
  (`noacgWholeEase` in `animRuntime.ts`). Settled playback is unchanged.
- **Scope.** Only the last pre-Out cue and Out change. Machines, calls, dynamics and loops keep
  their existing refusal. Keys stored past a cue's end refuse a crossing: the runtime plays them
  beyond it, so no boundary splits that cue exactly.

## Acceptance and atomic refusals

| Portion | Observable result | Refusal (source and history byte-identical, clear reason) |
|---|---|---|
| Exact crossing | On an eased text-and-box entrance with back, bounce, cubic-bezier and elastic keys, Set Out at a frame before the last In key. In then Out equals the original at every absolute time within 1e-3 in editor sampling, the simulator and executed SPX, CasparCG, OGraf and single-file exports. Values and both boundary velocities at `b` agree. | Any split refusal of a crossed segment: stepped or unrecognized ease, equal-endpoint slice, bounded value outside its range, stored precision. |
| Track shapes | Crossed tracks are numeric; untouched tracks and earlier cues are byte-identical. | A crossed string track; a crossed track whose Out keys start at a different value; keys stored past the cue's end. |
| Spans | Clipped, moved, led and joined intervals give the same visibility at every absolute time; bars ending at `b` hold visible. | A layer hidden at the new hold that is visible later in the moved part; a moved layer at autoAlpha 0 or inside a layer hidden at the new hold. |
| Legacy visibility | Unaffected when nothing crosses. | Crossing a cue that hides a layer at its end (legacy `hides`), or when a Next cue reveals a layer outside the root that Out fades separately (every revealed layer counts when no document is given). |
| Transactions | One Set Out is one undo; redo, Escape (no prompt when the exit has keys), save/reopen and a second save agree; an open reverse choice closes when the exit gains keys. | A refused Set Out adds no history and shows the reason. |
| Interruption | Out during the shortened In starts from the live pose (<1 px, <.01 opacity), then plays each track to its last key on the whole curve, in the simulator and exports. | Unchanged. |
| Preserved | R1.1b keys and body moves, R1.1c Out/reverse/manual/empty/interruption, R1.1d nested identities and trims, and G01 pass. Only assertions that encoded the lifted refusals change. A graphic saved with the G01 interpreter upgrades once, by content hash. | Machines, calls, dynamics, loops, custom interpreters: unchanged. |

## Implementation

- [editorOut.ts](../../../src/blocks/editorOut.ts): `moveOutBoundary(data, boundary, contains?)` is
  the pure repartition. `applyOut` snaps the playhead, keeps the one-frame check and passes a
  `contains` answered lazily from the template's document. It reuses `splitKeyframeSegment`,
  `clone`, `round` and `EPS` from [animEdit.ts](../../../src/blocks/animEdit.ts), so the split
  and the move agree on when a key already sits at the boundary.
- [OutControls.tsx](../../../src/components/editorFoundation/OutControls.tsx) decides the prompt
  from the result template (memoised `readTimeline`) and closes an open choice otherwise.
- [animRuntime.ts](../../../src/templates/shared/animRuntime.ts): `noacgWholeEase` at the one
  interrupted-exit ease site. The G01 body is known by content hash
  (`ANIM_INTERPRETER_BEFORE_WHOLE_EASE_HASH` in `animRuntimeLegacy.ts`, text in
  `e2e/fixtures/interpreter-shared-ease-v1.js`) and upgrades on preview, save and export.
- Tests: [out-boundary.test.mjs](../../../scripts/out-boundary.test.mjs) (build gate) and the
  R1.2a.1 cases in [editor-ease.spec.ts](../../../e2e/editor-ease.spec.ts) and
  [editor-out.spec.ts](../../../e2e/editor-out.spec.ts), all reading
  `e2e/fixtures/out-text-and-box.json`. Frames of the timeline before and after a crossing at
  1.20 s are in [built](built/).

## Review and simplification

`/check` review ran as one workflow: four read-only reviewers (repartition and split semantics;
Out and interruption at runtime; undo, history and UI; tests and scope), each followed by one
agent trying to refute its findings (8 agents, merge base `188da0648`, every agent listed what it
read). Fifteen findings merge to twelve distinct ones: ten confirmed and fixed, one refuted, one
split between its two refuters.

- Confirmed on the spec's own fixture: an interrupted Out stretched the moved `slice(back.out)`
  over the live distance and overshot by about 750 px. Fixed in the interpreter as above; the new
  executed test fails by 441 px with the fix reverted.
- Out bars on a layer with no bars on the moved cue shifted without a lead, hiding the layer over
  the moved part (also reachable through trim then Add Step). Fixed with a leading interval.
- A reverse choice left open stayed open with a stale revision after a crossing Set Out. Fixed;
  the new UI test fails with the fix reverted.
- Keys stored past a cue's end let a later Out cross. They now refuse.
- The hold-visibility check ignored the runtime's parent and autoAlpha gate. Refusals added.
- The executed velocity check could not fail once values agreed; its tolerance is now tighter
  than the value check implies. Stale plan, register and README text was corrected.
- Refuted: a trimmed graphic's reverse choice refusing after Set Out. The dead end predates this
  branch and manual Out works; it is recorded in the handoff.
- Split: Out pressed at an earlier Step flag, after Set Out inside a Next cue, plays that cue's
  moved motion from the split pose. One refuter confirmed it, the other showed that any keyed Out
  already does this from an earlier flag and that no stated criterion covers it. Not changed here;
  it is a product question for Step/Next editing, recorded in the handoff.

Simplify ran as four parallel cleanup reviewers (reuse, simplification, efficiency, altitude).
Adopted: shared `round`/`EPS`/`clone`, one instant-cut rule, one "crosses an Out key" message,
a lazy hidden-parent check, the Next-cue reveal refusal narrowed to layers outside the root when
the document is known, the memoised prompt read, one shared fixture file and one refusal helper.
Skipped with reasons: consolidating the per-spec export harnesses and the rolldown loader into
shared helpers (older duplication; a shared e2e helper widens the affected run to the whole
suite), and moving the repartition into `animEdit.ts` (noted in the handoff for cross-cue work).

## Verification receipt

- Reproduction first: the refusal above in Node, then `j-2301`, the new browser tests queued on
  the unmodified code: all 11 new tests failed on "Set Out cannot move before the last In key",
  and the 42 existing Out and G01 tests passed, including the edited refusal matrix.
- `scripts/out-boundary.test.mjs` (build gate, 11 tests): dense samples on the concatenated ruler
  within one stored unit at nine boundaries, both velocities at `b`, untouched keys, explicit
  moved eases, joins and merges, bars in eight shapes plus Out-only bars, Next cues, the G01 body
  upgrade, and every refusal atomic. Nine mutations (default ease, jump refusal, Out bars, Out
  shift, hold key, Out-only lead, keys past the end, hidden parent, autoAlpha) each fail it.
- `j-2313` (final code): the Out and ease specs, 59 passed. In the simulator, SPX, CasparCG,
  OGraf and single-file exports, In then Out after Set Out at 1.20 s equals the original within
  1e-3 on 154 absolute samples of both layers, with both boundary velocities agreeing within
  0.05 + 0.1%. Out at 40% of the shortened In starts from the live pose (under 1 px and .01) and
  then follows the whole-curve policy within 2e-3 in all five. The UI crossing is one undo with
  redo, Escape, no prompt, save/reopen and a second save byte-identical; a refused crossing names
  `steps(4)` and leaves source and history unchanged; an open reverse choice closes.
- Browser mutations: shifting no Out keys (`j-2303`) was stopped by the ordering guard; copying the
  entrance's first value into Out (`j-2304`) failed the executed comparison by about 2000 px;
  reverting the whole-curve interpreter change and the prompt fix (`j-2309`) failed both new
  tests (441 px; the stale choice stayed open).
- `j-2305` before review: editor regressions, anim-engine and inspector, 131 passed, 20 configured
  old-editor skips.
- `j-2318`: the full affected run with 3 workers, 68 spec files: 472 passed, 306 configured skips
  (one quarantined spec left out by the planner), then the catalog calibration suite 35/35; its
  own verdict was "Overall: passed". The runner then recorded the job as dead without an exit
  code (`reapedAsDead`), so that verdict is read from the log.
- Catalog: `check-catalog-emit` re-recorded exactly 528 JS fingerprints and no HTML/CSS row. The
  battery against this worktree's own server: type-floor 526 and catalog specs 35 plus 4 baseline
  tests (`j-2319`, whose later legs lost the server); then `j-2327` overflow 528 with no
  regression, field coverage 526 (105 variants explicitly undriven, as before), numerals 349,
  factory 317/317 and the [taste frames](taste/) for Hairline (lt01) and Quiz (qz02). All six
  frames were opened and read as in the R1.1c, R1.1d and G01 frames.
- `j-2325`: `npm run build` exited 0 with 1,981 Node tests passing and the TypeScript, lint,
  dependency, bundle, prerender and after-build gates green.

Not checked: physical 125% displays, receiving-host fonts, a real OGraf host, and the two
first-time-user trials, which stay pending as before. This is scoped engineering evidence, not
owner acceptance; the default editor is unchanged.
