# A test run that fills the disk prints a passing tail and exits 0

**Filed:** 2026-09-09, carried out of `git show 3228fae6:docs/handoffs/2026-09-06-f-growth-question.md` during the
handoff drain. **Source:** measurement - it happened to that row.

## Why

A full e2e run on this laptop died on `ENOSPC` while its reporter was summarising. Playwright
artifacts plus the sibling worktrees had filled the disk, workers were being killed as the summary
printed, and the run ended with a passing tail and **exit code 0**. Read the way the repo tells you
to read a build - the process's own exit code, never a pipe's - it was green.

This is the same class as `root/read-build-own-exit-code-never` and
`root/read-which-jobs-ran-before-believing`, and it defeats both. The exit code is the right thing to
read and it lied; the job list is the right thing to check and there was no CI run to check. A
verdict taken from that run would have been a false green on the one machine that runs the full
suite before landing.

It gets more likely, not less: the machine carries a dozen worktrees at a time and Playwright's
artifact directories are per-run.

## What it would take

Two independent halves, either useful alone.

The cheap half is a floor check the runner already has a place for. `scripts/reclaim.mjs` knows the
4 GB floor and the queue enforces it before a browser-driving job starts; the same reading taken
AFTER a run, compared against the start, turns a silent kill into a stated one. A run that ends with
less than the floor free reports "disk, not a verdict" whatever its exit code says.

The honest half is not trusting the tail. A run that killed workers leaves that in the Playwright
JSON reporter output even when the exit code does not carry it; a post-run check of the report's
counts against the spec count catches a truncated run generally, not just this cause.

Do not solve it by raising a threshold or pruning artifacts on a timer. The failure is that a
truncated run is indistinguishable from a complete one, and more free space only moves when it
happens next.

## Evidence

Measured 2026-09-06 on `claude/f-growth-question`, landed as `856f8792`. A repo-wide grep for
`ENOSPC` during the 2026-09-09 drain found it in the handoff and nowhere else - not in
`e2e/AGENTS.md`, `docs/VERIFICATION.md` or `docs/CI_STABILITY.md`.

The same family on the CI side is `docs/backlog/ci-plans-from-a-run-that-never-finished.md`: a run
covering less than it appears to and reporting green. Different mechanism, same reason it survives -
nothing compares what a run was asked to cover against what it actually got through.
