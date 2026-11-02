# Phase cf07: the late-send-abandoned flake (#1805)

Plan run #1967 (cicd-followup), phase cf07. Builder session on branch
`claude/plan-cicd-followup-cf07-build`, from `main` at 4a1ee559.

## Repeat-count brief (written and pushed before the repeat run)

This section is the phase's written brief for the count, committed on its own before the run
starts (acceptance (b)).

**Pre-fix failure rate.** Two measures, both counted; the count below is sized for the lower.

| Source | Runs | Failed | Rate |
| --- | --- | --- | --- |
| CI history since the quarantine (2026-10-28T20:00Z to 2026-11-02): the `noacg/quarantine/e2e/configured/late-send-abandoned.spec.ts` status on every main commit the configured suite ran on (push and schedule), each run with the suite's one retry, so "failed" means any attempt failed | 94 | 12 | 12.8% |
| Measured before the fix: three trials of the unchanged spec and helper on a CI runner, retries off (endurance.yml runs 41533158591, 41537602966, 41539944252) | 80 | 15 (9 of 40, 5 of 20, 1 of 20) | 18.75% |

**Repeat count.** N = 40 runs, retries off, on one `ubuntu-latest` runner with the CI worker
count (`playwright.live.config.ts` `workers: 1`, as each configured shard runs it), against the
local Supabase stack started as the configured suite starts it (CLI 2.111.0,
`supabase start -x studio,edge-runtime`), through `endurance.yml` with
`npm run trial:late-send-abandoned -- --minutes 40`.

**Arithmetic.** N must satisfy 1 - (1 - r)^N >= 0.95, so N >= ln(0.05) / ln(1 - r).

- At the lower rate r = 12/94 = 0.1277: ln(0.05) / ln(0.8723) = -2.9957 / -0.1366 = 21.9, so N >= 22.
- At the measured rate r = 15/80 = 0.1875: -2.9957 / ln(0.8125) = -2.9957 / -0.2076 = 14.4, so N >= 15.
- N = 40 gives 1 - 0.8723^40 = 0.9958 at the lower rate, and 1 - 0.8125^40 = 0.9998 at the
  measured one.

**Pass condition.** All 40 runs pass with zero failures, and exactly 40 ran
(`scripts/configured-trial.mjs`: a fail-then-pass cannot hide, retries are off).
