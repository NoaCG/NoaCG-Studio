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
(`delta < 0`) and a move with nothing after `b` behave exactly as today.

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
  exit if it was visible at the old hold with no Out intervals, else hidden. Touching intervals
  join. The arriving side decides the hold, as today: a bar ending exactly at `b` is visible
  there. This replaces the blanket "crosses a visibility span" refusal. Never clip.
- **Exit duration keeps its absolute end** (`Dout + delta`) once the exit has keys or spans.
  An exit left with neither stays an instant cut, as today.
- **Prompt.** Reverse/manual is offered only when the resulting exit has no keys, read from
  the new source, not the view of the old one.
- **Interruption** is unchanged: Out tweens each exit track from the live value to its last
  key with that key's ease. A crossed exit now ends where the entrance ended, so Out during the
  shortened In continues toward the entrance's end pose.
- **Scope.** Only the last pre-Out cue and Out change. Machines, calls, dynamics and loops keep
  their existing refusal.

## Acceptance and atomic refusals

| Portion | Observable result | Refusal (source and history byte-identical, clear reason) |
|---|---|---|
| Exact crossing | On an eased text-and-box entrance with back, bounce and cubic-bezier keys, Set Out at a frame before the last In key. In then Out equals the original at every absolute time within 1e-3 in editor sampling, the simulator and executed SPX, CasparCG, OGraf and single-file exports. Values and both boundary velocities at `b` agree. | Any split refusal of a crossed segment: stepped or unrecognized ease, equal-endpoint slice, bounded value outside its range, stored precision. |
| Track shapes | Crossed tracks are numeric; untouched tracks and earlier cues are byte-identical. | A crossed string track; a crossed track whose Out keys start at a different value. |
| Spans | Clipped, moved and joined intervals give the same visibility at every absolute time; bars ending at `b` hold visible. | A layer hidden at the new hold that is visible later in the moved part: Out never reveals a hidden layer (D02). |
| Legacy visibility | Unaffected when nothing crosses. | Crossing a cue that hides a layer at its end (legacy `hides`), or when a Next cue reveals a layer Out fades separately. |
| Transactions | One Set Out is one undo; redo, Escape (no prompt when the exit has keys), save/reopen and a second save agree. | A refused Set Out adds no history and shows the reason. |
| Interruption | Out during the shortened In starts from the live pose (<1 px, <.01 opacity) in the simulator and exports. | Unchanged. |
| Preserved | R1.1b keys and body moves, R1.1c Out/reverse/manual/empty/interruption, R1.1d nested identities and trims, and G01 pass. Only assertions that encoded the lifted refusals change. | Machines, calls, dynamics, loops, custom interpreters: unchanged. |

Verification: a Node test for the repartition maths beside `scripts/ease-runtime.test.mjs`
(dense samples on the concatenated ruler, velocities, spans and every refusal atomic); focused
browser specs written first and queued on the unmodified code; editor regressions; the full
affected run; build, `/check` (four reviewers, each followed by a refuter), `/queue-merge` and
the deployed revision.
