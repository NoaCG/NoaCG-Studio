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
| Tests | `scripts/growth-controls.test.mjs` (67 tests) | Each names the acceptance line it proves; section 2. |

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
| No same-scope renewal without a measured repayment receipt (runs named), whatever the id | `(b) the same scope is never renewed...` |
| Ledger append-only; ceilings, estimates and seed move only by a new version with a reviewed rationale and authority; `MAIN_RUNNERS` cannot rise quietly (no shard-budget inflation) | `(b) the ledger is append-only...` |
| ci04's catalog-gate exception (item 1 below) | `(b) the ci04 catalog-gate exception...` |
| Offline work-spec exception lines: append-only, renewal needs `, repaid <m> min in run <id>` | `(b) offline exception lines...` |

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
- **One exception ledger in `growth-ceilings.json`,** append-only, so renewal is detectable by
  scope (`covers`) rather than by name, file or tier. Every cover must name a real workflow job
  or spec in the exception's own tier: re-filing ci04's catalog job under backend, or rewording
  it, covers nothing and offsets nothing. Its credit is capped at what the covered items cost:
  a job at its measured per-job cost from the weekly report (the seed carries the catalog gate
  at ci04's 17.7), a spec at nothing, because a spec has only a deliberately high estimate. An
  exception on a spec only keeps that spec's addition from counting. The review link must be an
  issue comment recording the decision, and a change that adds an exception is warned for its
  separate review. Work-spec offline lines keep their format, gain an
  optional repayment clause and become append-only too.
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
- **Renaming a covered job is no way round renewal.** An earlier exception in the same tier whose
  cover no longer names a real job, and that ran within 30 days of a new one, counts as the same
  scope, so the new one needs a measured repayment.
- **An exception waives added cost only up to its allowance.** What it already excepts of the
  measured cost is spent first; growing an excepted job beyond its recorded allowance is charged
  to the tier like any addition. Where a renewal overlaps its predecessor, an item draws the
  larger allowance left, never the sum of both; the same bound holds for the measured cost
  they except.
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
  - Phase age alarms keep their own rolling issue per plan (`Plan phases past their age ceiling:
    <wave file>`): the post-landing check reads no ledger, and a coordinator checking one plan
    must never close or overwrite another plan's phase alarm.
  - Every child process under `scripts/` must pass `windowsHide` (`scripts/windows-hide.test.mjs`).
  - ci06 landed at 21:15Z on 2026-10-31: no complete measurement of its selected PR runs exists
    yet, so its cost stays a projection.
