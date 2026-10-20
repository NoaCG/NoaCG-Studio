# Live continuation receipt, 2026-10-20

One live run of free stop-and-continue against `NoaCG/NoaCG-Studio` on GitHub, before the
production-page run opens. Code under test: branch `claude/plan-run-continuation-evidence` at
`4d098b454` (main `69ebf4ac4` plus the recovery-ref move and the short state paths in this PR).
Machine: the owner's Windows laptop. Local paths below are shortened to `<scratch>`.

Disposable project `plan-continuation-test-2026-10-20`: two phases, three-hour deadline, its own
recovery ref `refs/noacg-recovery/plan-continuation-test-2026-10-20`, pinned source
`claude/plan-run-continuation-evidence@f2ce46072`.

## Session A opens, records, ends

Session A was the coordinating Claude Code session. A script opened the project with
`wave-plan-store` `openWave`, registered it, ran `start-block` (owner `session-a`, epoch 1)
and recorded phase 1 `build`, `landed`, `check` and `pass` through `run-supervisor record`.
Then the process ended. The remote checkpoint was `e240bb7`.

## Session B continues with the same line

Session B was a fresh `claude -p` session (`40ec49d2-9e57-4686-90b3-ab0b60165c31`, Sonnet),
started in a checkout of the repository with no knowledge of A. It ran:

    node scripts/run-supervisor.mjs continue <scratch>/ncl-b continuation-test session-b

- First attempt: the restore succeeded and was published (`28ed020`). The new block's
  publication (`36968fc`, epoch 2) reached GitHub, then a DNS failure (`Could not resolve
  host: github.com`) broke the read-back. `continue` answered `blocked` with that cause.
- The same session typed the same line again once the network was back. It restored `36968fc`
  and answered `continued` with block epoch 3, owner `session-b`, and next `launch build
  phase 2`, carrying phase 1's PASS. B recorded `phase 2 build {"actor":"session-b-builder"}`
  with exit 0. The checkpoint was `bf249cb`.

B's ledger after the step:

    - 09:18:00Z phase 1 build {"actor":"session-a-builder"}
    - 09:18:04Z phase 1 landed disposable ledger, no PR
    - 09:18:08Z phase 1 check {"actor":"session-a-checker"}
    - 09:18:12Z phase 1 pass {"actor":"session-a-checker",...}
    - 09:23:00Z phase 2 build {"actor":"session-b-builder"}

The checkpoint chain on the ref, from the source, was: register, A's block, A's four records
(`e240bb7`), B's first restore and block (`28ed020`, `36968fc`), then B's second restore, block
and record (`a8d1997`, `13db000`, `bf249cb`).

## Session A's store is refused

Session A's original store, run after B continued:

| Command | Exit | Answer |
| --- | --- | --- |
| `record ... 2 build --authority block.json` | 1 | `superseded: another coordinator continued this project; stop` |
| `next` | 1 | same |
| `tick` | 0 | verdict `superseded` |

A's ledger file was byte-for-byte unchanged, so nothing was recorded or launched.

## No deploy for checkpoints

Checkpoints now live outside `refs/heads`. The checkpoint commits `e240bb7`, `36968fc`,
`13db000` and `bf249cb` have no commit statuses, no check runs and no GitHub deployments. The
branch commit `4d098b454` received `Vercel=success`. Before this change, the first live attempt
published to `refs/heads/noacg-recovery/...`, and Vercel built each checkpoint and failed.

## Cleanup

The disposable refs were deleted: `refs/noacg-recovery/plan-continuation-test-2026-10-20`, and
from the first attempt `refs/heads/noacg-recovery/plan-continuation-test-2026-10-20` and
`refs/heads/claude/continuation-test-2026-10-20`. Session B's restored worktrees were removed.

## Found by this run

- On Windows, the restored checkout is the whole repository (longest path 112 characters). A
  long state root failed checkout at the 260-character limit. This PR shortens the per-session
  directory names, and the runbook says to keep the state root short.
- A network failure after a publication was accepted is safe. The next `continue` restores the
  accepted state, and nothing is lost or duplicated.
