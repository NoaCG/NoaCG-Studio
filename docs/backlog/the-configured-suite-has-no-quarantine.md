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

**Not the same item as `repeat-failures-across-shas-go-unseen.md`**, which is about what the
`ci.yml` quarantine admits: a fail-then-pass on the SAME sha, so a spec that fails on several
different commits never enters. That one narrows an existing mechanism; this one is a tier with no
mechanism. Whoever takes either should read the other - the second half of this file (what a
non-blocking tier should carry) is easier to answer once that admission rule is settled.
