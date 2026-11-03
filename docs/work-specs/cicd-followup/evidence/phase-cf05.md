# Phase cf05: the production-chat-intake and production-data flakes (#1924, #1603)

Plan run #1967 (cicd-followup), phase cf05. Builder session on branch
`claude/plan-cicd-followup-cf05-build`, from `main` at ea0eaa11.

## Repeat-count brief (written and pushed before the repeat runs)

This section is the phase's written brief for both counts, committed on its own before either
repeat run starts (acceptance (b)).

**Conditions, both trials.** `endurance.yml` on this branch, one `ubuntu-latest` runner, the
offline suite's config (`playwright.config.ts`, which runs CI with `workers: 1`, as every offline
CI shard does), retries off, the one test named by `--grep`, through `scripts/configured-trial.mjs`
(its offline mode, from cf08). Both specs are offline: no backend runs.

### #1603, production-data "Connect closes only once the save landed"

**Pre-fix failure rate.** Measured, so the history rate is not used.

| Source | Runs | Failed | Rate |
| --- | --- | --- | --- |
| Measured before the fix: the unchanged spec and helper on a CI runner, retries off ([41579824448](https://github.com/NoaCG/NoaCG-Studio/actions/runs/41579824448), `trial:data-connect-save` at `b12ae614`) | 200 | 18 | 9.0% |
| For reference, CI history since the quarantine: `noacg/quarantine/e2e/production-data.spec.ts` on main, 2026-11-01 to its release | 21 | 0 | 0% |

**Repeat count.** N = 100 (`npm run trial:data-connect-save`).

**Arithmetic.** N must satisfy 1 - (1 - r)^N >= 0.95, so N >= ln(0.05) / ln(1 - r).
At r = 18/200 = 0.09: -2.9957 / ln(0.91) = -2.9957 / -0.0943 = 31.8, so N >= 32.
N = 100 gives 1 - 0.91^100 = 0.99992.

### #1924, production-chat-intake "YouTube comments: one press brings the newest 100"

**Pre-fix failure rate.** Not reproduced on a CI runner: 150 of 150 passed
([41579837751](https://github.com/NoaCG/NoaCG-Studio/actions/runs/41579837751),
`trial:chat-intake-newest-100` at `b12ae614`). So the rate is the one from CI history since the
report (the acceptance's rule when it was not reproduced):

| Source | Runs | Failed | Rate |
| --- | --- | --- | --- |
| CI history since the report: the failing run on main that reported it (8e84002d, [41336665950](https://github.com/NoaCG/NoaCG-Studio/actions/runs/41336665950)), then `noacg/quarantine/e2e/production-chat-intake.spec.ts` on every main commit it ran on until its release (21 commits, 2026-11-01T18:49Z to 2026-11-02T10:36Z, all success) | 22 | 1 | 4.5% |

The 150 trial passes are left out of that rate on purpose: counting them would lower the rate and
so the count. The race was reproduced by fault injection instead (section (a)).

**Repeat count.** N = 100 (`npm run trial:chat-intake-newest-100`).

**Arithmetic.** At r = 1/22 = 0.0455: -2.9957 / ln(0.9545) = -2.9957 / -0.0465 = 64.4, so
N >= 65. N = 100 gives 1 - 0.9545^100 = 0.9905.

**Pass condition, both.** All 100 runs pass with zero failures, and exactly 100 ran
(`scripts/configured-trial.mjs`: retries are off, so a fail-then-pass cannot hide).
