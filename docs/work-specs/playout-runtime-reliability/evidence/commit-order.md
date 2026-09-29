# The §5.3 commit-order run no longer reproduces (AC-12)

2026-09-30, preview branch B (migrated). Never production.

## What ran

Job j-2481 through the machine's job queue: the Phase 6 measurement harness's app scenario S5
(`harness/app-run.mjs --scenarios S5 --trials 5`, session scratchpad) with `--app` pointing at this
branch's worktree, through the preview-branch wrapper with `branch-b.env`, twice:

- `--hold shows`: the research's run exactly. Per trial: a new output, operator A, operator B and a
  watcher (three new hosted pages) on `p6-harness main`; the production's `control_shows` row held
  2.5 s by an ordinary UPDATE (one Management API call); A presses Take while it is held, B
  presses Update 0.7 s later; then A presses Out. Read: the watcher's action log (built only from
  durable rows), the rows in the database, the frames each page received.
- `--hold heads`: the same, with the production's `control_heads` row held instead: the new send's
  own lock, so A's Take really waits and B's Update waits behind the same lock.

Before Step 2 (research §5.3, 5 of 5): B's Update committed past A's waiting Take, the watcher's
follower moved its cursor past the gap, and the watcher's log never recorded A's Take.

## What was observed

| Hold | Watcher recorded A's Take | Recorded B's Update | Recorded A's Out | A's Take waited on the lock | Output played A's Take |
|---|---|---|---|---|---|
| control_shows row | 5 of 5 | 5 of 5 | 5 of 5 | 0 of 5 (answered in 71-81 ms) | 5 of 5 |
| control_heads row | 5 of 5 | 5 of 5 | 5 of 5 | 5 of 5 | 5 of 5 |

- With the row held, the new send did not wait for it at all (it takes the row only at KEY
  SHARE), so the skip's cause is gone before ordering is even needed.
- With the head held, A's first attempt answered 55P03 at 2.07 s (the send's own 2 s lock
  timeout) and was sent again; B's Update got the head first when it was released. Trial 1's rows:
  B's Update seq 505 (id 622), A's Take seq 506-508 (ids 623-625). The watcher and the output both
  received them in seq order on `live-<show>` and applied all of them, whichever committed first.
  A row with a higher number cannot commit before a lower one, so there is no gap to skip.

## Limitations

- Three new pages and a new output. A watcher running the OLD bundle (following by id) still has
  the id road's exposure to this skip; Step 0's re-read window (logFollow.ts, landed) is what
  covers it there, and this run does not exercise it.
- Five trials per hold, one production, one graphic per operator.
