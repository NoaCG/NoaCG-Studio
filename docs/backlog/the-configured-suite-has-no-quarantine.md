# The configured suite has the flake failure mode and none of the machinery built for it

**Filed:** 2026-09-09, out of two drained handoffs that both named it - the phase 2b first-areas row
(`git show 3b9b0a69:docs/handoffs/2026-09-07-phase-2b-first-areas.md`, "Open, in payoff order") and
the cloud-lander row before it. **Source:** measurement - GitHub issue #94, a configured-tier flake
that stood as a red alarm until a person opened the spec.

## Why

`ci.yml` grew a full flake answer in phase 1c: a red run re-runs its failed spec files once on the
same commit, a fail-then-pass passes the gate and writes the spec into `e2e/quarantine.json`
through the merge queue, `quarantine.yml` re-runs each quarantined spec on every push to `main`,
and a spec is released after `RELEASE_AFTER` consecutive passes.

`configured-suite.yml` has none of it. It is a separate workflow rather than a job in `ci.yml`, it
runs `e2e/configured/` against a local Supabase stack, and it is the only automation that executes
the teams specs at all. Its specs have exactly the same failure mode as every other Playwright
spec, so **one flake there is a standing red alarm until a human reads the log and decides it was
noise.** That is the state the whole retry-and-quarantine mechanism was built to remove, running
beside it, on the tier that covers the feature with the most moving backend parts.

The cost is not a broken product - the configured tier does not gate a landing. The cost is that a
red configured suite teaches everyone to ignore a red configured suite, and the next real teams
regression arrives into an alarm nobody reads. #94 already happened once.

## What it would take

The mechanism exists; the question is how much of it a non-blocking tier should carry.

1. **Retry, at minimum.** `scripts/e2e-quarantine.mjs` reads the shards' blob reports and re-runs
   the failed spec files once on the same commit. `configured-suite.yml` produces the same reports.
   This is the cheap half and it removes most single-flake alarms on its own.
2. **Then decide about quarantine.** The quarantine half writes through the merge queue and is
   released off commit statuses on `main` - machinery that assumes a blocking gate. A tier that
   blocks nothing may want the retry and a plain report instead of a quarantine file, which would
   otherwise let a genuinely broken teams spec sit quarantined and unnoticed for weeks.

Read `docs/WORKFLOW_ARCHITECTURE.md`, "Phase 1c, as landed", and `docs/VERIFICATION.md`, "A red
main answers itself first", before choosing - both state the invariants the ci.yml version keeps,
and a second implementation that keeps fewer of them is worse than none.

## Evidence

- `.github/workflows/configured-suite.yml` - no retry, no quarantine, no release path.
- `scripts/e2e-quarantine.mjs` and `e2e/quarantine.json` - the machinery, wired to `ci.yml` only.
- GitHub issue #94 - the flake that made this concrete.

## What landed on 2026-09-09, and what it changes here

The sibling item about cross-commit repeats is closed (`scripts/ci-repeat-failures.mjs`, reported
weekly from `weekly-audit.yml`), and closing it settled two things this file needs.

**The admission rule stays same-sha.** Cross-commit repeats are now a REPORT a person reads, never
an automatic quarantine, because that evidence cannot tell a flake from one defect several branches
tripped over. So a non-blocking tier does not inherit a weaker admission rule from anywhere - the
retry half in step 1 is still the whole cheap answer, and a report is a legitimate second half.

**This suite can finally name its failing specs.** Until `scripts/configured-verdict.mjs` learned to
emit one `::error file=<spec>` per unclean spec, the job's annotations were `.github` placeholders
and a count, so `scripts/ci-failure-set.mjs` could say no more than
`job: Configured E2E (authenticated, local Supabase)`. Measured over the seven days to 2026-09-09:
**seven configured reds on seven distinct commits of `main`, and not one of them named a spec.**
Anything built here - a retry, a quarantine, a report - needs that identity string, so this is now
unblocked in a way it was not when the file was written.
