# Worktree removal reads a FAILED reap as "no delegation is running here"

**Filed:** 2026-09-10. **Source:** review of `claude/av-reap-at-delegation-end`, checked against
`npm run rules -- scripts/worktree-cleanup-lib.mjs` (nothing there contradicts it; the standing
rule `root/treat-worktree-cleanup-mechanism-permission-worktree` points the same way).

## Why

Before removing a worktree, the cleanup asks the delegation reaper whether anything is still
running in it. The reaper answers with an exit code, and `scripts/worktree-cleanup-lib.mjs`
(around line 76) treats **only exit code 3** as "yes, something is running". Every other non-zero
outcome falls through to `busy: false`, which `applySelf` (`scripts/cleanup-worktrees.mjs:605`)
and `applyPlan` (:1069) read as "nothing is running here" before calling `git worktree remove`.

So a reaper that FAILS produces the same answer as a reaper that found an idle worktree, and the
directory a live `codex.exe` is standing in gets deleted. The memory half of the reaper is right
to fail open - a reaper that cannot run must not block a cleanup - but the busy half needs the
opposite default, and today it does not have one.

Not hypothetical on this laptop. One `reapTrees` can read the whole process table through
PowerShell up to three times and spends two separate `GRACE_MS` windows, so the 30 s
`REAP_TIMEOUT_MS` is reachable on a loaded machine - and a `spawnSync` that hits its timeout
returns `status: null` (SIGTERM), not 3.

## What it would take

Small in code, and the whole value is in how it is verified.

- Treat anything that is not a clean exit 0 or a clean exit 3 as "I could not tell", and let a
  caller about to delete a directory read that as "keep the worktree", with a line naming why.
  `status: null` (timeout/signal) and exit 1 (a throw reaching `main`'s error handler) are the two
  shapes to cover.
- Verify by construction, not by reading the code: make the reaper time out or throw behind a
  temporary env-var-gated injection, confirm the worktree survives and the reason is printed, then
  remove the injection before committing.

## Evidence

Found while extending the reaper on `claude/av-reap-at-delegation-end`, which deliberately left
this file alone - that row owned `scripts/codex-rescue.mjs` and was told not to touch the removal
path. That branch's two commits are the context for the `busy` contract this depends on, including
why `busy` is now answered from workspaces that have no ownership record as well as from those
that do.
