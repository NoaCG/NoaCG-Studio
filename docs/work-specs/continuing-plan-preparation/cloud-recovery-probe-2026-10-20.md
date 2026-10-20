# Cloud recovery-ref probe, 2026-10-20

Question: can a Claude cloud session continue a plan project, which means publishing
checkpoints to `refs/noacg-recovery/<id>` with `git push --force-with-lease`? Before this,
only the laptop had pushed there (`live-continuation-2026-10-20.md`).

**Answer: no.** The cloud session's git connection drops every push to
`refs/noacg-recovery/*`. Checkpoints have since moved to the `claude/noacg-recovery/<id>`
branch, which a cloud session can push (`cloud-checkpoint-branch-2026-10-20.md`).

## Setup

The laptop opened a disposable project `plan-recovery-probe-2026-10-20` (one phase, three-hour
deadline) from branch `claude/plan-run-review-fixes` at `9e1e1c5c7`, registered it with a
recovery ref, started a block and recorded `phase 1 build`. The remote checkpoint was
`8acf60fbf26fb5903abe5984e0bde565f43e1700`.

Each cloud session was a run-once routine in environment `env_017nuiDZBW9smUNLdWVQK8cf`,
created from a local `claude -p` session with `RemoteTrigger`. `claude --cloud` needs an
interactive terminal, so it cannot be used from an agent's shell.

## Runs

| Routine | Session | Code | `continue` result |
| --- | --- | --- | --- |
| `trig_01HXvDJNFfVsvTJdeR25cCk1` | `cse_016VCZJV16zu27EKHCZTZNTV` | `9e1e1c5c7` | `Recovery checkpoint identity differs` |
| `trig_01RkPxUMYx4fLKLxCy8Dfhja` | `cse_01LczcBznTfs6TrFsHDVo2Xa` | `59d4f50df` | `Recovery publication unresolved; retry before acting`, twice |
| `trig_01TahnvB7AbZ46SqX81hZAy1` | `cse_017qSfpyMAfRwUQv9cHseCrM` | `0581c4474` | the same, now with git's answer (below) |

Git's answer to the checkpoint push, in run 3 at 10:56:24Z:

    send-pack: unexpected disconnect while reading sideband packet
    fatal: the remote end hung up unexpectedly
    Everything up-to-date

In every run `git ls-remote` showed the ref unchanged at `8acf60fbf` before and after, so the
push was not accepted. Fetching the ref and fetching branches worked. The sessions' `origin` is
`https://github.com/NoaCG/NoaCG-Studio` behind an HTTPS proxy (`HTTPS_PROXY` set). Cloud
sessions are known to push `claude/*` branches, so the refused part is the ref namespace.

The compare-and-swap could not be tested on its own: the push never reached GitHub. Run 1's
raw pushes were denied by the session's permission classifier (`[Exfil Scouting]`), and run 2's
by this repository's push guard hook, which allows only explicit `refs/heads` pushes.

## Found and fixed

- Run 1: the cloud clone's remote spells the repository `NoaCG/noacg-studio`, and restore
  compared it exactly with the checkpoint's `NoaCG/NoaCG-Studio`. Names are now compared
  case-insensitively (`59d4f50df`).
- A refused push read the same as a lost connection. The error now carries git's last lines
  (`0581c4474`).

## Cleanup

`refs/noacg-recovery/plan-recovery-probe-2026-10-20` was deleted from the laptop at about
11:00Z, and no `refs/noacg-recovery/*` refs remain. The three routines were one-shot and have
fired. The laptop's local probe state in `C:\noacg-probe` was left for manual removal.
