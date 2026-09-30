---
v: 2
source: derived
kind: finding
raised: 2026-09-30
state: unstarted
found: "On Windows the cloud-session-setup test that kills a hung git probe cannot remove its temp worktree afterwards, so npm run build is red on every branch on that machine."
serves: NOW
size: small
touches: scripts/hooks/cloud-session-setup.test.mjs, scripts/hooks/cloud-session-setup.mjs
needs-owner: none
---

# A hung-probe test cannot clean up its worktree on Windows

**Filed:** 2026-09-30, by the Phase 6 session, while verifying a docs-only change.

## Why

`node --test scripts/hooks/cloud-session-setup.test.mjs` fails on the owner's Windows 10 laptop in
"the real probe is quiet on a reachable origin, and a hung one is killed at the cap" (line 309):
the `finally` block's `rmSync(base, { recursive: true, force: true })` throws `EPERM, Permission
denied` on the `freshen-XXXX` directory under `%TEMP%`. It reproduced on three runs in a row, so
`npm run build` (which runs the node test gates) is red locally on every branch there, and every
session's verify leg has to explain the same unrelated failure.

The test points `GIT_SSH_COMMAND` at `sleep 5; true` with a 500 ms cap, so a killed
`git ls-remote` likely leaves a child (MSYS `sh` or `sleep`, or git itself) holding the directory.
If the probe itself leaks that child on timeout, it is a product defect of the setup hook, not only
of the test.

## What it would take

- Find what holds the directory (Sysinternals `handle`, or the processes whose working directory
  is inside it) right after the assertion.
- If the probe leaks its child, kill the process tree on timeout (`taskkill /T` on Windows).
- Otherwise make the test's cleanup wait for the holder, without hiding a real leak.

## Evidence

- Tried and did not help: `rmSync(..., { maxRetries: 30, retryDelay: 250 })`, which retries
  for longer than the five-second sleep.
- Last change to the test: `0144e21aa` ("Remove the test worktree from the primary checkout, not
  from inside itself").
