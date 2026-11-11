# Growth ceilings proposal, 2026-11 (for owner approval)

Status: proposal only. `scripts/growth-ceilings.json` is unchanged until the owner (miwco)
approves; the approved numbers then land as version 3 with this file as its rationale.

Source: the complete weekly growth report of 2026-11-11, weekly-audit run
[43014542120](https://github.com/NoaCG/NoaCG-Studio/actions/runs/43014542120) (window
2026-11-04 to 2026-11-11, 147 landings, 550 of 550 API calls, every tier `complete`), with the
earlier reports for the trend.

## Measured, per landing / per day (runner-minutes)

| Report | Run | State | Landings | Offline | Backend | Graphics (raw) | Overhead |
|---|---|---|---|---|---|---|---|
| frozen seed (10-24 to 10-30) | phase-ci01 | backend, graphics partial | 122 | 410 / 166 | 107.4 / 62 | 25.5 / 92 | 84 / 8 |
| 2026-11-02 | 41470215342 | complete | 113 | 457.5 / 168.6 | 138.9 / 72.8 | 20.7 / 91.0 | 122.4 / 4.5 |
| 2026-11-03 | 41704224273 | complete | 131 | 419.3 / 173.3 | 164.7 / 65.0 | 22.3 / 90.7 | 132.1 / 6.1 |
| 2026-11-09 | 42647874522 | partial (1 failed read) | 158 | 375.6 / 189.3 | 148.2 / 79.1 | 25.2 / 90.2 | 93.4 / 10.5 |
| 2026-11-11 | 43014542120 | complete | 147 | **654.3 / 191.5** | **219.9 / 79.7** | **36.3 / 90.3** | 91.8 / 11.4 |
| current ceiling | v2 | | | 535 / 215 | 117 / 78 | 10 / 115 | 105 / 10 |

What moved in the week to 2026-11-11 (the report's per-job figures):

- Offline: the pull request E2E subset shards roughly doubled per landing (for example
  `E2E 9/15 (subset)` 17.3 to 37.7). PR runs per landing are 475 / 147 = 3.23 against the 2.84
  the estimates assume. The PR stratum was sampled at 9 of 475 runs, so this figure is noisy;
  that is why the margin below is about 10%, not 5%.
- Backend: the selected configured shards on pull requests (ci06) cost 33 to 34 each per landing,
  about 133 together, on top of the push suite.
- Graphics: the catalog calibration gate is the whole tier, 36.3 per landing. cf16 found it runs
  twice on the same commit (pull request and merge group).
- Overhead: in bounds per landing (87%). Per day it is 11.4 raw, 6.2 net of the
  production-load-watch exception.

## Proposal

The 95% refuse line applies to each proposed ceiling, so "room" is what a change may add before
it is refused.

| Tier | Measured 2026-11-11 | Current line | Proposed line | Share at proposal | Room before refusal | Why |
|---|---|---|---|---|---|---|
| offline per landing | 654.3 | 535 | **720** | 91% | 30 per landing, about 6 spec-minutes | measured plus about 10% for the noisy PR stratum |
| offline per day | 191.5 | 215 | 215 (no change) | 89% | 12.8 | already in bounds |
| backend per landing | 219.9 | 117 | **235** | 94% | 3.4 | measured plus 7%: one configured spec (6.9) is still refused until the cost comes down |
| backend per day | 79.7 | 78 | **88** | 91% | 3.9 | measured plus 10% |
| graphics per landing | 36.3 raw, 18.6 net of ci04 | 10 | **20** | 93% net | 0.4 | net of the active exception; see the interaction below |
| graphics per day | 90.3 | 115 | 115 (no change) | 79% | | in bounds |
| overhead | 91.8 / 6.2 net | 105 / 10 | no change | 87% / 62% | | in bounds; see the 2026-12-03 note |

Envelope check: proposed per landing 720 + 235 + 20 + 105 = 1,080, per day 428. At the reference
17.4 landings a day that is 19,220 runner-minutes a day, and at last week's 21 landings a day
23,108, both inside the 28,800 envelope.

## Reduction plan (owner: miwco)

| Tier | 2026-12-14 | 2027-01-11 | 2027-02-08 | Work that brings it down |
|---|---|---|---|---|
| offline per landing | 600 | 535 (v2 line) | 535 | #2168 (stop counting jobs a re-run attempt only copied), #1994 (four specs grew 4.2 minutes), PR runs per landing back to 2.84 or below |
| backend per landing | 180 | 140 | 117 (v2 line) | #1871 (cache stack images, share shard and merge steps), #2172 (price stack count changes) |
| backend per day | 82 | 78 (v2 line) | 78 | #1871 |
| graphics per landing | 19 raw, when cf14 ends | 10 (v2 line) | 10 | cf16's finding: run the catalog gate once per commit, not on both the pull request and the merge group (about half of 36.3); then #2165 (bring the gate under its ceiling) |

Each step is a new version of the ceilings file that lowers the line, landed on that date only if
the latest complete report shows the tier at or under the new line. A step the measurement does
not support is not forced: it comes back to the owner with the new figure.

## How this interacts with the exceptions

- `ci04-catalog-gate` (graphics, 17.7 per landing, to 2026-11-30) and
  `cf14-catalog-gate-extension` (graphics, 17.3, 2026-12-01 to 2026-12-14): the proposed 20 is
  measured net of them. When cf14 ends on 2026-12-14 the raw gate (36.3) would be 182% of 20, so
  the once-per-commit fix must land before then. Neither exception is renewed; no new exception is
  proposed.
- `jev-svg-import-journey` (backend): credits 0 today (capped at what it covers); unaffected.
- `production-load-watch` (overhead, per day, to 2026-12-03): without it overhead per day is 11.4
  of 10 (114%). #2019 decides its future before 2026-12-03; if the watch stays, overhead per day
  needs about 13 in a later version.
- Exceptions still credit only against completely measured tiers (Rule X9); this proposal changes
  no exception.

## What the owner approves

Version 3 of `scripts/growth-ceilings.json`: offline per landing 720, backend 235 per landing and
88 per day, graphics 20 per landing, everything else unchanged, with the dated reduction plan
above as its rationale and this file as its reviewed source.
