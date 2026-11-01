# Phase ci18: resource and delivery-time growth controls

Phase ci18 of the cicd-improvement plan (run issue #1842), acceptance AC-9 and D7 of
[the spec](../spec.md). It builds on the ceilings ci01 froze ([phase-ci01.md](phase-ci01.md)
section 4) and changes none of them.

## 1. What changed

All of it sits in the existing capacity, report and maintenance machinery. No new service, and
no aggregate pull-request gate.

| Piece | Where | What it does |
| --- | --- | --- |
| Frozen table | `scripts/growth-ceilings.json` | ci01 version 1, verbatim: four tiers (per landing and per day), 85%/95%, 30-day exceptions, the 28,800 runner-minute daily envelope, the 8-day freshness bound, the age and pooled timing ceilings. Also: the conservative prices for new cases, the seed measurement until the first weekly report, and the append-only exception ledger with ci04's catalog-gate exception. |
| Rules | `scripts/growth-controls.mjs` | Pure. Tier of every job, pricing what a change adds, evidence states, table freshness, exceptions, ledger protection, per-tier verdicts, slowdown attribution, clocks, age alarms, pooled timing, breach carry-over and growth stops, test admission, the weekly text. |
| PR and merge-group gate | `scripts/e2e-capacity.mjs`, the `E2E capacity line (estimate)` step of `ci.yml` | The existing `capacity` verdict, which the CI gate already refuses on, now also carries the four tiers judged alone, the table's age, and changes to the ceilings or the exception records. The new step before it fetches the newest weekly report. |
| Weekly report | `scripts/growth-report.mjs collect`, new `growth` job in `weekly-audit.yml` | Prices the week's runner-minutes into tiers (failed, cancelled and re-run attempts included), attributes slowdowns to a landing range, reports the aggregate against the envelope, keeps owned and dated actions in one rolling issue, and publishes the `growth-report` artifact the gate reads. |
| Age alarms | `scripts/growth-report.mjs ages`, new `ages` job in `post-land.yml` | After every landing: every open PR's ready and queue clock against its age ceiling; one overdue item is enough for an owned, dated action in one rolling issue. |
| Tests | `scripts/growth-controls.test.mjs` (103 tests) | Each names the acceptance line it proves; section 2. |

## 2. Acceptance, criterion by criterion

### (a) D7 in existing machinery, ci01 ceilings, envelope, no aggregate gate, offline unchanged

- The tiers, shares and envelope are ci01 version 1 exactly: test `(a) the tiers are ci01 version 1`.
  Their allocations sum to 767 per landing and 418 per day: 767 x 17.4 + 418 = 13,764 of 28,800.
- Every job counts once, in one tier: `(a) every job counts once`.
- The per-PR verdict has no aggregate: `(a) the aggregate is a weekly report line`. The weekly
  report prints the aggregate against the envelope and the allocation at the week's workload.
- The offline line is untouched: `MAIN_RUNNERS` 13, 85%, 95%, and the per-landing offline tier
  is a companion that never prices offline specs (the table line keeps doing that).

### (b) Per-tier warning and refusal, setup, conservative estimates, evidence, freshness, exceptions

| Claim | Proof |
| --- | --- |
| 85% warns, 95% refuses additive growth; adding nothing is never refused, also over a ceiling | `(b) each tier warns at 85%...` |
| No cross-tier offset | `(b) no cross-tier offset` |
| Setup cost: a configured case brings its share of a stack (2.3 min per 10 test-minutes), on every PR, landing and scheduled run it joins; a new job is priced per run it joins, by trigger, and a scheduled job per cron firing | `(b) a new case is priced conservatively...`, `(b) a new workflow job is priced...` |
| Conservative new-case prices: the slowest measured unit of each kind (configured spec 2.6 min, run 41233844505, p90 1.47; catalog spec time 4.1 min; a new job 6.0 min, the Build job) | `growth-ceilings.json` `estimates.why`; test above |
| Missing evidence refuses added cost; partial or stale evidence refuses it from the 85% line | `(b) missing evidence refuses...` |
| Durations table alarm past 8 days, an open refresh PR is not fresh, and a stale table refuses added offline minutes from 85% | `(b) the durations table alarms...` |
| Exceptions owned, reviewed, scoped, at most 30 days; expiry restores refusal | `(b) an exception is owned...` |
| No same-scope renewal without a measured repayment receipt (runs named): scope is the tier, so every exception after a tier's first needs one, whatever its id, name, file or covers; one active per tier | `(b) a later exception in a tier is never renewed...`, `Rule X3`, `Rule X4`, `Rule replay: ...` |
| Ledger append-only; ceilings, estimates and seed move only by a new version with a reviewed rationale and authority; `MAIN_RUNNERS` cannot rise quietly (no shard-budget inflation) | `(b) the ledger is append-only...` |
| ci04's catalog-gate exception (item 1 below) | `(b) the ci04 catalog-gate exception...` |
| Offline work-spec exception lines: append-only, one scope with the offline tier's ceilings exceptions; a later one needs `, repaid <m> min in run <id> on <date>` | `(b) offline exception lines...`, `Rule X5` |

### (c) Indirect slowdown

- Found only in complete post-landing points, attributed to the landing range between the last
  point before and the first after: `(c) an indirect slowdown ... attributed to a landing range`.
- One slow run is noise: `(c) one slow run is noise`. A step needs three complete points after it,
  every one above every point before.
- Only equal work is compared: a point's workload is its workflow and that tier's job names, and a
  selected, affected or subset run (whose size its names do not show) is never a complete point. The
  backend series therefore comes from the full configured suite on main, not CI's selections:
  `(c) a slowdown is found only between equal workloads`.
- The estimate rises and the ceiling does not; the NEXT additive change is refused while a change
  adding nothing still lands: `(c) the attributed slowdown raises the estimate...`.
- A PR's own run never refuses it for an unchanged spec: `(c) a PR's own run never refuses it...`.
  The table line reads unchanged specs from the table, not from the run.

### (d) Clocks, ages and pooling

- PR ready-to-merge: first all-green worker receipt, else first `noacg/reviewed` stamp clipped to
  the PR's opening, else unknown (never zero); repairs, new heads and requeues never reset it;
  a PR closed unmerged keeps its age: `(d) the PR clock...`.
- Phase: first ledger `build` to final `pass`; failed and repaired work keep ageing, a cancelled
  phase keeps its age; queue clock from the first entry: `(d) the phase clock...`.
- One overdue item gets an owned, dated action, no sample minimum; unknown starts are reported,
  not alarmed: `(d) ONE overdue item...`.
- Pooled: 12 samples across categories, categories kept, low volume descriptive, sustained only
  after two adequate weeks: `(d) pooled timing...`.
- Future merge-time data never gates its own PR: the per-PR verdict takes no timing input; a
  timing breach reaches PRs only as a stop after its correction failed: `(d) future merge-time data...`.

### (e) Ownership, correction, growth stop, admission

- A breach gets an owner, a correction due in 7 days (an age breach: 1 day), one correction
  only, then a growth stop in its affected tiers (cost: that tier; ready or queue latency: the
  pre-merge tiers; an item's age: escalation, no tier stop), cleared when back in bounds:
  `(e) a breach gets an owner...`, `(e) a growth stop refuses additive growth...`.
- The weekly report from a fixture week: missing report, overdue refresh, exception expiry alert
  and a cost breach, each owned and dated, and the stop a week later:
  `(e) the weekly report owns...`, `(e) the weekly report prices tiers...`.
- Admission for a backend test (contention on a panel lease, needs concurrency), a graphics
  fixture (right-to-left long value, needs real font shaping) and a critical journey (extends
  `e2e/dashboard-operator-walk.spec.ts`), each naming contract, failure, overlap, layer, why not
  cheaper, cadence, owner and cost; missing parts and a refusing tier refuse it: `(e) admission...`.

## 3. Live evidence (bounded passes, 100 API calls each)

- **Backend tier, measured.** Every configured-suite push (33) and dispatch (50) run of
  2026-10-29T21Z to 2026-10-31T21Z: 3,544 runner-minutes over 33 landings, **107.4 per
  landing** (ci01 froze 94; ceiling 117, 92%). Dispatches came from 15 worker branches of both
  plan runs. ci06 landed at 21:15Z, after this window, and the JEV branch dispatched again at
  21:38Z (run 41244504178), so ci06's selected PR runs are added (+56 projected) while the
  dispatches continue: about 160 per landing, 137%, until #1871 or the dispatch change takes
  effect. The seed now carries 107.4 as partial evidence, so additive backend growth is refused
  from the 85% line today.
- **A live weekly collection** (7 days, 100 calls, so thin by design: production uses 550):
  2,934 completed runs in 29 strata, 115 landings, every tier partial, backend 167.6 per landing
  (143%) raised as `cost:backend` with an owner and a due date; aggregate 8,826 runner-minutes a
  day, 30.6% of the envelope. Its first version starved the last strata when the budget ran out;
  sampling is now round-robin.
- **Age alarms, live:** #1834 (stamped 2026-10-30T22:27Z) and #1840 (06:06Z) were past both
  their ready and queue ceilings: one item each was enough for an action.
- **Durations table:** recorded 2026-10-19, 12 days old; #1503 open since 2026-10-19 (merge
  state blocked) is reported as pending, not accepted. Tracked in #1847.
- This PR's own gate run: the overhead tier prices its two new jobs (post-land `ages` 6.0 per
  landing, weekly `growth` 0.9 per day): 90 of 105, a warning, not a refusal.

## 4. Carried items, held and not hidden

1. **Graphics.** ci04's catalog gate is held as the ledger exception `ci04-catalog-gate`: 17.7
   per landing, owner the plan coordinator, review
   https://github.com/NoaCG/NoaCG-Studio/issues/1863#issuecomment-6545849957, from 2026-10-31,
   expires 2026-11-30, repayment #1862. On 2026-12-01 its cost counts again (255% of the
   ceiling), additive graphics growth is refused, and the weekly report raises `cost:graphics`.
   A renewal for the same job without a measured repayment receipt is invalid under any id, tier or job name.
2. **Backend.** Measured above: 107.4 before ci06, about 160 after while dispatches continue,
   over the 117 ceiling. The controls refuse further additive backend growth; cost-reducing
   maintenance lands. Reduction work: #1871.
3. **Durations table.** Stale; #1503 is pending, not a refresh. Every PR is warned, a stale table
   refuses added offline minutes from 85% (today 77%), and the weekly report raises `table:stale`.

These are baseline overruns the controls refuse growth over (spec D7: "Measured baseline
overruns can pass ci18 only when the controls correctly refuse growth and allow faithful
cost-reducing maintenance"). Live outcomes, including the first scheduled weekly report and its
issue, remain for ci17.

## 5. Decisions

- **Stale or partial evidence refuses added cost from the 85% line, missing evidence refuses
  all added cost.** The spec says to refuse added cost "whose headroom cannot be established";
  the warning band is the margin unmeasured drift may use. Refusing every addition on a stale
  table would stop every new offline spec in both live runs at 77% usage for a refresh that is
  an owned failure, not their change's.
- **The offline table line still prices offline specs; the measured offline tier refuses them at
  its line.** An offline spec is priced once, in table-minutes, by the existing line. The weekly
  offline tier (runner-minutes per landing, including any attributed slowdown) refuses a change
  whose offline minutes, run in every CI run of a landing and in each nightly run, would take it
  to 95% (85% on partial or stale evidence; any addition when the tier is unmeasured), as every
  other tier does, and its stop refuses them after a failed correction.
- **The seed labels offline and fixed overhead complete.** ci01 estimated part of their PR-event
  minutes from dense-window samples scaled to exact run counts, the same stratified estimate the
  weekly sampler calls complete. Backend and graphics are partial in the seed because each misses
  a whole kind of cost (unsampled cancelled dispatches; ci04's unmeasured catalog gate).
- **An exception on record that a rename or removal makes invalid covers nothing; it does not
  refuse the change.** Only an exception the change itself adds is judged by the gate, so
  removing an excepted job (cost-reducing maintenance) lands.
- **One exception ledger in `growth-ceilings.json`,** append-only, and an exception's scope is
  its tier (Rules X3 to X5). A pull request controls every part of a job's identity (key, name,
  workflow file, a cover's wording), so four review rounds each found a new way to renew one job's
  exception under a new identity; no identity a change can rename ties a renewal to what it
  renews. The tier cannot be renamed away: the first exception ever recorded in a tier needs no
  receipt, every later one in that tier needs a measured repayment receipt, and only one is
  active per tier at a time. Every cover must name a real workflow job or spec in the
  exception's own tier: re-filing ci04's catalog job under backend, or rewording it, covers
  nothing and offsets nothing. Its credit is capped at what the covered items cost:
  a job at its measured per-job cost from the weekly report (the seed carries the catalog gate
  at ci04's 17.7), a spec at nothing, because a spec has only a deliberately high estimate. An
  exception on a spec only keeps that spec's addition from counting. The review link must be an
  issue comment recording the decision, and a change that adds an exception is warned for its
  separate review. Work-spec offline lines keep their format, gain a dated repayment clause
  (`, repaid <minutes> min in run <id> on <date>`) and become append-only too. They are the same
  offline scope as an offline exception in `growth-ceilings.json`.
- **What the stricter rule means today.** ci04's catalog-gate exception (#1863, to 2026-11-30)
  is the graphics tier's first exception and stays valid with no receipt; any later graphics
  exception, for any job, needs a measured repayment receipt. The offline tier already holds
  work-spec lines (codebase-lean, e2e-suite-budget, wizard-ai), so a new offline line waits until
  the last of them expires (2026-11-16) and then carries a dated receipt. No existing line
  carries a receipt, so none needs migrating. Receipts are checked for shape and date by the gate;
  that the runs exist is confirmed by the person who reviews the exception.
- **Run sampling, not a full read.** A week is about 2,900 runs; the job token allows 1,000 calls
  an hour. Run lists are read in full and each stratum's jobs on an even spread, scaled to exact
  run counts; an unsampled stratum or failed read makes tiers partial.
- **Phase ages reach the alarm through the coordinator.** The phase clock lives in the plan-run
  wave file, outside the repository, so `.agent-workflows/plan-run.md` has the coordinator run
  `growth-report.mjs ages --ledger <wave file> --issue` on every check-in; one phase past 12 hours
  since its first `build` (repairs included) gets its owned, dated action then.
- **Age alarms after every landing,** in `post-land.yml`, not on a new schedule: a 6-hourly job
  is priced at 24 overhead runner-minutes a day (4 x 6.0) against a scheduled overhead ceiling
  of 10, and these controls refuse it.
- **Unknown is never zero, and never "clean".** A diff the gate cannot read refuses the change;
  a weekly report the gate cannot fetch leaves every tier without evidence, so additions are
  refused (a fetch that finds no report at all writes `{ "none": true }` and the seed stands in);
  the weekly job refuses to publish when last week's report cannot be read, rather than reset its
  breaches and stops; the age check that cannot read every open item raises what it found and
  never closes the alarm issue.
- **Tests added inside an existing spec are not priced per PR.** As the offline table line has
  always done, an edited spec counts at its last measured cost; what it adds reaches the tier
  through the weekly measurement and slowdown attribution, and refuses later additions from there.
- **Renames add nothing; removals earn no credit.** A renamed spec, job key or job name is the
  same case; moving a spec into `e2e/configured/` or `e2e/catalog/` is a new case there. Pricing
  a removed job as credit would let a cheap removal pay for an expensive addition.
- **Every trigger is priced.** Pull request, merge group and push by their runs per landing;
  `workflow_run`, `deployment_status` and check events as every run; any other trigger at least
  once per landing, except a `workflow_dispatch` beside a cron, which is that schedule's re-run.
- **A new job is priced at the slowest measured job of its own tier** (backend 12.7, graphics
  11.2, overhead 6.0), times its static matrix size; a matrix built at run time counts as 15
  entries. A rename that moves a job into another tier is priced there as a new job of that tier. Making an
  existing job longer (more steps, a longer timeout) is not priced at PR time: like tests added
  inside a spec, it reaches the tier through the weekly measurement and slowdown attribution.
- **Neither offline capacity lever moves quietly.** `MAIN_RUNNERS`, `SHARD_CAP_MINUTES` and every
  frozen value can rise only with a new version whose revision links the issue comment recording
  the decision, and even then the gate names the revision for the owner to confirm.
- **Cadence counts as growth.** A more frequent cron, a new trigger on an existing job, or a new
  entry in a job's static matrix (axes or `include`) is priced as the runs it adds; a cheaper schedule adds nothing.
  A matrix built at run time cannot be counted from the file and is measured weekly.
- **Pooled timing is collected live and carried forward.** Each weekly run reads an even spread
  of the week's merged PRs (stamp-based ready clock, first queue entry), categorised by line of
  work (JEV plan, cicd plan, bot, quarantine, other), and carries the samples in its report so the
  next run pools 28 days without re-reading them. Receipt-based starts and phase ledgers live
  outside the repository; `collect --clocks <file>` adds them. A PR whose start cannot be read is
  listed as unknown, never sampled as zero. Live check, one day at 100 calls: 27 merged, 6
  sampled, ready p50 12.7 minutes, queue p50 7.7.
- **Weekly stops reach offline additions.** A stop on the offline tier, or a weekly report the
  gate could not read, refuses a change that adds table-minutes, beside the table line.
- **A breach clears only on a measurement that is complete AND in bounds.** Cost: the tier
  completely measured (run list complete, every stratum sampled, no failed read) and at or under
  its ceiling. Latency: an adequate pool, not above its ceiling, with every read behind it
  complete. Age: a complete read of the item (open PRs from GitHub, drafts included; a phase only
  from a clocks file that was read). Table, exception and report alarms are re-derived in full
  each week. Any other kind never clears by default. A week with an unsampled stratum or a
  cut-short run list publishes tier cost as a lower bound, marked before anything is judged.
- **A ready clock survives a rewritten head, merged or still open.** The weekly collector hands its
  recorded starts to the merged-PR reader too, and keeps a closed PR's start for 30 days.
- **A ready clock survives a rewritten head.** A PR whose timeline shows a force-push gets an
  unknown clock and an incomplete read unless an earlier read recorded its start: the age job
  carries starts from its own open alarm issue, the weekly report in `openStarts`. A run still
  queued or running at collection keeps its tier partial.
- **A long outage is never a first week.** The fetch lists every `growth-report` artifact on
  main, expired ones included. No report ever means the first week (`{ "none": true }`); only
  expired reports means weeks went unreported: the fetch fails, the weekly run refuses to publish
  and the gate refuses additions. The way back is the owner's: a `reportRestart` (`at`, reason)
  recorded in `growth-ceilings.json`, which needs a new version and a reviewed revision like any
  other change there; dated after the newest report, it makes the next run a first week.
- **Renaming a covered spec or job is no way round renewal.** Scope is the tier, so a renamed,
  replaced or moved job's next exception is a later exception in the same tier and needs a
  receipt. No rename record is kept: `Rule replay: ...` tests replay each earlier escape.
- **An exception waives added cost only up to its allowance.** What it already excepts of the
  measured cost is spent first; growing an excepted job beyond its recorded allowance is charged
  to the tier like any addition. A second exception overlapping the first in its tier is
  invalid, so allowances never add up.
- **Alarm issues are found whoever opened them.** The workflow token, an app or the
  coordinator's own account on a plan-run check-in; an outsider's issue with the same title is
  never taken for an alarm.
- **A capped read is a partial read.** A timeline, a commit's statuses or a run's jobs still
  full at the last permitted page leaves the read incomplete: unread history neither raises nor
  clears an alarm, and a run with unread jobs is a lower bound that never clears a stop and is
  never a complete slowdown point. A planned job read that the call budget stopped is unread,
  and its stratum is partial, so a thin sample left by an exhausted budget never clears a stop.
- **A job is one tier by either of its names.** A workflow's own job name can hold `${{ }}`
  expressions (`E2E ${{ matrix.shardIndex }}/...`) that become numbers at run time
  (`E2E 1/6 (full)`); both resolve to the same tier, and a cover credits only measured jobs of its
  own tier, so no exception can move offline cost into overhead headroom.
- **Credit is the measured jobs a cover names, not its wording.** A `${{ }}` cover matches
  measured jobs by pattern within its tier, and its credit is its allowance capped at those jobs'
  measured cost; a spec or a job nothing measured earns nothing.
- **An alarm keeps its first date.** An item still overdue at the next check keeps the
  corrective date its first alarm set (PR and phase alarms alike); once that date passes, the
  line reads "missed". The correction is bounded, never extended by re-checking.
- **An unread alarm issue is never rewritten.** If the open age alarm issue cannot be read, the
  per-landing check leaves it as it was and fails, rather than dropping the lines it could not
  re-read.
- **A series point is one attempt's work.** Job reads return every attempt; cost counts them all,
  but a slowdown point uses the latest attempt only, so a re-run landing is not a slowdown.
- **Which breaches stop growth.** Only cost (that tier) and ready or queue latency (every tier
  with pre-merge jobs, graphics included). Age, phase latency, a stale table, a missing report and exception alarms are owned,
  dated actions without a stop: an item's age is not caused by added capacity, and the others
  already refuse growth through the evidence and exception rules. A breach that clears and comes
  back is a new breach with a fresh correction; clearing needs a complete, in-bounds week.

## 6. Phase notes

### Rules

The two rule families that kept recurring in review, written as observable lines. Each line has
one test named after it (`Rule E1: ...` to `Rule E22: ...` and `Rule X1: ...` to `Rule X10: ...` in `scripts/growth-controls.test.mjs`),
and each test fails when its line is broken in the code (mutation-checked). Where order matters,
the first matching line wins.

**Evidence completeness (E).** A tier's evidence comes from the newest weekly report, or from the
frozen seed until one is published. First match wins:

- E1. No measurement of the tier, or no window end: **missing**.
- E2. Window end more than 8 days before today: **stale**.
- E3. The tier's evidence is not complete (E5 to E11): **partial**.
- E4. Otherwise: **complete**.

A week's measurement is **partial for every tier** when any of these holds:

- E5. The run list was cut short (a failed list read, or a 6-hour slice reporting over 1,000 runs).
- E6. A stratum (workflow and event) has no sampled run.
- E7. A planned job read failed.
- E8. A planned job read was stopped by the call budget. Planned reads never exceed what is left of
  the budget: one per stratum first, then rounds of shares by weight (post-landing strata count
  twice), never more than a stratum's completed runs. So this happens only when a read needs extra
  pages; a stratum the budget cannot reach stays unsampled (E6).
- E9. A run was still unfinished at collection.
- E10. A run's jobs were still full at the last permitted page; its jobs count as a lower bound.
- E11. The window holds no landing. The weekly collector then publishes no report and fails for its
  owner, so the gate keeps the previous report, which turns stale (E2). A measurement with no
  per-landing figure reads as missing (E1).

How runs become cost and slowdown points:

- E12. Cost counts every attempt of a run; a slowdown point counts the latest attempt only.
- E13. A slowdown point is complete only for a successful run whose jobs all completed and were all
  read, and whose tier jobs are not a selected, affected or subset run. Points are compared only
  within one workload (the workflow plus that tier's job names).
- E14. The durations table is stale when its recorded date is missing or more than 8 days old. An
  open refresh pull request is pending and never makes it fresh.

What each state lets the controls do. A change that adds nothing is never refused by evidence.

- E15. Complete: added cost warns from 85% of a ceiling and is refused at 95%.
- E16. Partial or stale: added cost is refused from 85%.
- E17. Missing: any added cost is refused.
- E18. A weekly report that was asked for and could not be read: any added cost is refused, offline
  included.
- E19. A stale durations table: the offline table line refuses from 85% instead of 95%.
- E20. A breach clears only on evidence that judges it, and is otherwise kept with its stop: cost
  when the tier is complete and at or under 100%; latency when the timing read is complete,
  adequate and in bounds; age when its read was complete.
- E21. A growth stop refuses any addition to its tier, whether or not an exception waives it.
  Offline included: the stop, like an unreadable report (E18), is judged before any waiver.
- E22. The search for the newest weekly report reads every page of the artifact listing, and
  counts only reports from this repository's main: a run whose head repository is a fork is never
  read, even from a branch called main. Only a finished listing with no such report establishes a
  first week; a listing it cannot finish, or one that does not say how long it is and has not
  ended on a short page, fails the weekly run, like reports that all expired.

**Exception scope and credit (X).** An exception's scope is its tier. A pull request controls every
part of a job's identity (its key, name, workflow file and a cover's wording), so no identity drawn
from those can tie a renewal to what it renews; the tier is the one scope a change cannot rename.

- X1. A cover's tier: for `job:<workflow>/<name>`, the tier of that job with each `${{ }}` read as a
  number; for `spec:<path>`, its folder (`configured/` backend, `catalog/` graphics, else offline).
- X2. An exception is valid only with: an id no earlier entry has; a known tier; at least one cover,
  each in the exception's tier (X1) and naming a real job or spec; a positive per-landing or per-day
  allowance; an owner; a review link that is an issue comment in NoaCG/NoaCG-Studio; and from and
  expires dates at most 30 days apart.
- X3. The first exception ever recorded in a tier needs no receipt. Every later exception in that
  tier (a renewal, a replacement or a new one, whatever its id, name, file or covers) needs a
  measured repayment receipt: a positive repayment, at least one run id, every run id numeric,
  measured on or after the latest earlier exception's from-date in that tier and on or before its
  own from-date. Without one it is invalid. This never lapses,
  and every earlier entry counts whatever its state today: a change cannot add an invalid entry, so
  one that reads invalid now was valid when it landed.
- X4. At most one exception is active per tier: a later exception that starts on or before an
  earlier one in its tier expires is invalid.
- X5. The offline tier is one scope across both lists: the offline exceptions in
  `growth-ceilings.json` and the lines in work specs (`- e2e/x.spec.ts: N min, ...`). The lines a
  change adds are one exception that starts the day the gate judges it. A line records no start, so
  its expiry stands for it. A new line expires no earlier than the day it is judged and at most 30
  days after it. Lines carry no owner or review link: the work spec that holds them and the pull
  request that adds them are their record. Once any offline exception exists, X3 and X4 apply
  across both lists: a new line carries `, repaid <minutes> min in run <run id> on <YYYY-MM-DD>`
  dated between the latest earlier start and the day it is judged, and every earlier offline
  exception has expired. A change may not add both
  a line and an offline `growth-ceilings.json` exception.
- X6. The exception ledger is append-only and in order: an entry removed, edited, placed before an
  existing one, or repeating an existing id is refused at PR time. Offline lines stay on record.
- X7. Status, first match wins: invalid (no credit, covers nothing); expired (no credit, counted
  again); not yet started (no credit); active.
- X8. Credit is the allowance, capped at the measured cost this window of the jobs its covers match:
  for a job cover, the jobs of the same workflow whose run-time names match its name (each `${{ }}`
  matching anything) and that are in its tier. A spec cover, or a job nothing measured, earns 0.
  A cover follows its name: whatever job carries the name this window is credited, up to the
  reviewed allowance and only until expiry, as an edit to the job's own steps would be. No check
  can tell a job given a covered name from the covered job given new work, so the allowance and
  the 30 days are the bound, and the next exception in the tier needs a receipt (X3).
- X9. A covered addition is waived up to the room left: the allowance minus the measured cost of its
  jobs. No room is given when the tier's evidence is missing, or for an existing job no measurement
  prices: only a spec, or a job new to the repository in this change (not one moved into the tier,
  X10), keeps its full allowance. Offline spec additions
  take the same route, so an approved offline exception in `growth-ceilings.json` waives them in
  the tier check; a work-spec line clears only the table line.
- X10. Credit never crosses tiers (X1, X8), and a job moved into another tier, by its own name or
  its workflow file's name, is priced as new in that tier, so it has no measured room there (X9).
  A job is an existing one only by its key, or by its name when its old key is gone from the head,
  and each old job has at most one such successor: a copy under a new key that repeats an existing
  job's name, or a second copy of a removed one, is a new job.
  Offline jobs are priced the same way, at the slowest measured offline job; offline spec minutes
  stay the table line's to price. So a new or more frequent offline job meets the offline tier's
  line and its growth stop (E21).
  No exception moves a ceiling, an estimate, `MAIN_RUNNERS` or `SHARD_CAP_MINUTES`: those need a new
  version and a reviewed revision, and are still named for the owner.

Each earlier escape is replayed against these lines in `Rule replay: ...` tests: covers worded
differently over one job, a templated name in another tier, a rename, a retirement plus a new key, a
duplicate id, a move to another workflow file, an unmeasured job priced at zero, a made-up rename
target and a workflow file rename that moves a tier. Each is refused or earns no credit, with no
rename record anywhere.

- **Previous verified main:** `26095c826f1a0ee910d17070d42026a841b9f284` (ci06 merge: push CI,
  configured suite, post-land and quarantine green). The branch starts at `af39c249`, whose
  push CI failed in `E2E 3/15 (full)` (run 41244292482), outside this change.
- **Revert:** `git revert -m 1 <merge commit of this PR>`, landed through `/queue-merge`. It
  removes the tier verdicts, the weekly growth job and the age job together; the offline line
  returns to its previous behaviour.
- **Traps:**
  - `actions/runs?created=<day>` filters by UTC calendar day: a window that starts mid-day has to
    list from that day's start, or the last day is silently skipped (found and fixed here).
  - A budget-bounded sampler must go round-robin across strata, or the strata read last
    (scheduled runs) are the ones left unmeasured.
  - Two review rounds found variants of one missing rule (evidence that cannot prove recovery
    cleared a breach). Per the repeated-family checkpoint, a fresh read-only review reassessed the
    rule model before the repair; its five further cases are fixed with replay tests.
  - Evidence completeness and exception scope kept recurring after that, each fresh review finding
    the next edge. They are now written as the Rules above, one test per line, mutation-checked:
    a later finding is a change to a line and its test, never a standalone patch.
  - Exception scope by job identity cannot be closed: four Rules-attack rounds found one hole
    (renewal under a new identity) in four places. An independent diagnosis of the rule model
    recommended scope by tier, which replaced the rename and successor rules.
  - Phase age alarms keep their own rolling issue per plan (`Plan phases past their age ceiling:
    <wave file>`): the post-landing check reads no ledger, and a coordinator checking one plan
    must never close or overwrite another plan's phase alarm.
  - Every child process under `scripts/` must pass `windowsHide` (`scripts/windows-hide.test.mjs`).
  - ci06 landed at 21:15Z on 2026-10-31: no complete measurement of its selected PR runs exists
    yet, so its cost stays a projection.
