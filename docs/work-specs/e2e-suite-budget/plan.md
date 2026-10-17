# Phased plan

Each phase is one or more pull requests, each independently verified with `/check` and landed with
`/queue-merge`, each recording before/after figures (AC-10) in its description and in `spec.md`'s
"Completed maintenance". Full suites never run on the shared local machine; CI runs them. Rollback
for every phase is named with it.

## Phase 0: evidence and spec (this pull request)

`spec.md`, `work.json`, `evidence/`, `interventions.md`, this plan. Nothing else changes.
Verification: docs checks in `npm run build`; `node scripts/work-spec.mjs status` reports ten open
criteria with AC-1 ready for review.

## Phase 1: selection safety, the budget, instructions (week 1-2)

1. **Shared-change set** (`scripts/e2e-lists.mjs`, `scripts/e2e-affected.mjs`, headers): retire
   `// focus` and `E2E_SPRINT_FOCUS` in favour of `SHARED_CHANGE_SET` with reasons; `// untraced`
   for own-context specs; pin the five scenario plans in `scripts/e2e-affected.test.mjs`; narrow the
   catalog-registry headers (candidate 16). Measure with `scripts/replay-selection.mjs` before and
   after (planned minutes p50/p75/p90 over 150 landings). Rollback: revert the lists; the planner's
   fail-toward-more rule is untouched.
2. **Capacity check** (`scripts/e2e-durations.mjs`, `ci.yml` e2e-report): usage, lines, exceptions
   with expiry, p90 for unmeasured, three separate cost figures in the check summary; constant
   `MAIN_RUNNERS`; unit tests for the lines and the exception grammar. Rollback: the check is
   advisory for its first week (warning only), then refusing.
3. **Protection check** (`scripts/check-e2e-protection.mjs`, `// gate: build`): refuses spec or
   test removal, added skips and timeouts above 120 s in the gate set without a maintenance entry;
   mutation-tested against a change that deletes a test. Auto-fix rule amended (one sentence) with
   `npm run learn`. Rollback: header `gate: none - <why>`.
4. **Instructions**: placement rule replaces `root/give-any-new-flow-playwright-spec`;
   `docs/VERIFICATION.md` corrected ("no unit-test suite"); work-spec README asks acceptance
   criteria to name the tier; `docs/TEST_SELECTION.md` describes the shared-change set.
5. **Miss measurement** starts: a weekly job (in `e2e-durations-refresh.yml`'s pull request body)
   lists failures found by full main runs and whether the culprit's pull-request plan would have
   selected them.
6. **Small contained wins**: catalog gate on main only when flagged; retry refusal fix (#1025);
   quarantine expiry after 14 days; `dashboard-hosted-walk` root cause or scheduled.

Before/after for the phase: usage %, planned gate minutes p50/p75/p90 (replay), queue entry to
landed p50/p90, runner minutes per week.

## Phase 2: cadence and cost (week 2-4, after phase 1's criteria pass)

1. **Batched validation** behind `NOACG_MAIN_VALIDATION=batched`: the plan job on a push to main
   checks the last validated snapshot (`noacg/validated` status on main's commits, written by
   after-gate), skips when every landing since it planned `none`, otherwise pins the tip, runs the
   full suite plus the catalog gate when any landing in the range flagged it, records
   `validated.json` (pinned SHA, range, started, finished); never cancels; a finished validation
   dispatches the next if relevant landings arrived. Stale alarm in `nightly-drift.yml`'s style:
   no completed validation within 60 minutes of a relevant landing opens or updates the rolling
   red-main issue with the range. Bisect job: on a confirmed red, the failed specs run per landing
   SHA in the range in one job; `red-main-issue.mjs` names the culprit; `revert-landing.mjs` takes
   that landing. Drill (E5) before enabling. Rollback: the variable.
2. **Configured suite** triggered by the validation run with the same range (E4 measured first).
3. **Experiments** E1, E2, E3 on an experiment branch at night; results into `evidence/`; adopt
   only what measured.
4. **Task walks** (interventions row 6): one scheduled walk file assembled from the five, focused
   counterparts extended, maintenance entries with fault-injection receipts.

Before/after: full runs per week, detection p50/p90 (observed, not replayed), runner minutes,
landing p50/p90, slowest shard p50/p90.

## Phase 3: portfolio maintenance (ongoing, one candidate a week)

The weekly refresh pull request carries usage, the week's adders and the ranked candidates; the
monthly quality review assigns the top ones as wave rows with an owner, a completion trigger (a
measured saving landed) and the result recorded in `spec.md`. Order: candidates 4, 10, 7, 11-12,
5-6, 9, 13-14, 15, 17-18. Each row: profile, change at the cheapest layer, fault-injection or
defect replay receipt, maintenance entry, before/after minutes.

## Verification across phases

- Replays (`evidence/scripts/`) are re-run at each phase on the same commit range for
  comparability; new measurements cite run IDs.
- No phase raises `timeout-minutes`, lowers an assertion, or lets a stop-at-cap read as a verdict.
- The owner is asked only if a phase's evidence requires changing the protection or detection
  targets in `spec.md`.

## Phase notes

Each landing of a phase adds here what the next phase must allow for.

### 2026-10-12, night of the spec (phases 0 and 1a-1e)

Landed or queued, each its own pull request through the merge queue:

- #1033 phase 0: this spec, the evidence and the plan. Landed 21:21 UTC.
- #1037 phase 1a: the catalog gate on main follows the push's own diff (`--catalog-since=<before>`,
  `scripts/e2e-affected.mjs catalogSince`); quarantine entries older than 14 days are reported in
  one rolling issue from `quarantine.yml`'s list job (`e2e-quarantine.mjs stale --issue`). The
  retry fix for #1025 was written here too and dropped when main landed its own (ce433426d,
  429e42d2d); keep main's.
- #1039 phase 1b: the capacity line (`scripts/e2e-capacity.mjs`, `npm run check:e2e-capacity`):
  estimated in the plan job, measured in the report job, refused by the gate above 95% without a
  budget exception. Decision 2 of the spec was amended to say so. Its own pull-request run printed
  WARN at 93.8% (run 38177271445).
- #1041 phase 1c: `scripts/check-e2e-protection.mjs` in the plan job; the auto-fix rule superseded
  by one that also forbids a repair from deleting or skipping a spec or writing the unlocking
  entries; the placement rule superseding the bare new-flow spec rule (both under
  `contracts/rules/root/`, named in that pull request); `docs/VERIFICATION.md` and the work-spec
  README corrected.
- #1043 phase 1 item 5: `scripts/e2e-selection-misses.mjs` in `weekly-audit.yml`, report only. Over
  the week to 2026-10-11 it finds no miss with today's planner (the #927 case reads as selected
  because #947 fixed the header; one editor-groups failure was a quarantined flake).
- #1045 phase 1 item 1, first step: the shared-change set is the planner's default escalation with
  no `E2E_SPRINT_FOCUS`; `--full-escalation` asks for the whole suite; the five plan shapes are
  pinned in `scripts/e2e-affected.test.mjs`.

What the next phase must allow for:

- #1039 needed auto-merge enabled by a token with the `workflow` scope (the session's `gh` token
  had none); the other workflow-changing pull requests were accepted. When `add-merge` is refused
  that way, the push, the label and the `noacg/reviewed` status are already in place.
- The capacity estimate counts a new spec at the median before any run, so a pull request that
  adds one ordinary spec at 94% usage is warned, not refused; one that adds more than about 11
  table-minutes is refused until its work spec carries an exception. The first such refusal is the
  first real test of the exception grammar.
- The protection check treats a test moved between files as a removal in the source file, which
  is intended: a consolidation names its replacement in a maintenance entry.
- The shared-change set still carries the sprint-era token and 76 members; the review with a
  reason per entry (plan phase 1 item 1, second step) is the next piece of selection work, and the
  miss count from #1043's weekly step is what the batched-validation rollout (phase 2) waits on.
- Before/after for AC-10 is not yet measurable: the first full week under these changes is the
  week of 2026-10-13. Re-run `evidence/scripts/analyze-jobs.mjs` and `replay-cadence.mjs` over it.

### 2026-10-17, the table was measured on the fast runners

- 32 of the 55 full main runs from 2026-10-15 04:00 to 2026-10-17 04:00 lost a shard at the
  20-minute cap; the retry answered for each, so the gate stayed green and the red-main issue was
  closed "Green again" (#1348). Cause: GitHub gives a shard a fast or a slow runner (fitted shard
  speeds 0.68-0.95 and 1.00-1.10 over 152 shards of 14 runs), and a table recorded from one run
  priced the specs that ran on fast runners in that run as if every runner were fast.
- `scripts/e2e-durations.mjs` now records each spec at its 80th percentile over the six newest
  green full runs: 183.3 table-minutes where the one-run table said 165.9. Capacity readings
  before and after this change are not comparable; the old 92% was 101% of eleven runners.
- `MAX_SHARDS` and `MAIN_RUNNERS` went 11 -> 13: the heaviest of thirteen bins keeps 3.3 minutes
  on the slowest runner measured, twelve would not. Usage is 85.7% of the new envelope, still
  above the warning line. Phase 3 maintenance is what brings it under; the first candidate
  (`candidates.md` #1, 7.4 minutes) alone would make it about 82%.
- A job killed at its time limit on main is now reported in the red-main issue as out of time and
  keeps it open (`alarmSet` in `scripts/red-main-issue.mjs`); it never names a failure or reverts.
