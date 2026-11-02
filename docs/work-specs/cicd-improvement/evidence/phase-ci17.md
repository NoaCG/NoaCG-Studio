# Phase ci17: initial outcomes and handoff

Row ci17 of the [cicd-improvement spec](../spec.md) (P0-P4; final reporting row). Built
2026-11-02 by the ci17 builder (Claude Code Cloud worker of plan run #1842) from `main` at
`66a61064f5f90acb4f68abef9738e38ea1ae9f3e` (ci16 merge, PR #1948). This row is evidence only. It
adds this file and the criterion review in [work.json](../work.json). It changes no code,
workflow, selector, header, list, quarantine entry, budget or ceiling.

Acceptance, verbatim:

- (a) "For every initial AC, independently report met, not met or pending with exact evidence,
  reasons, measured costs, escapes and outstanding work; disclose the ten-risky-row and
  three-plan sample limits."
- (b) "Record pass only for actually met ACs in work.json; other statuses remain non-pass. This
  row PASS means the report is accurate, not that improvement targets were achieved."
- (c) "Claim initial success only when the existing work-spec converge command is
  evidence-complete on the current reviewed source; optional cadence/reuse requirements stay
  inactive. Stop wakes and preserve any outstanding repair ownership."
- (d) "Independently assess AC-9 live tier and delivery-time evidence, sample sufficiency, weekly
  ownership and outstanding exceptions; fixture success alone cannot establish lasting gains."

## Outcome: the run concluded with unmet and pending goals

**This is not initial success.** `node scripts/work-spec.mjs converge
docs/work-specs/cicd-improvement/work.json` returns `open` (exit 1), not `evidence-complete`
(section 4). One of the eight initial criteria is met, two are not met and five are pending.

| AC | Status | work.json | One-line reason |
| --- | --- | --- | --- |
| AC-1 Baseline distinguishes delay from execution | **PENDING** | `unverified` | ci01 froze the configuration and a 21-row cohort, cut it into non-overlapping segments, triaged the nightlies and timed deployment; setup/test/report time and the dependency/concurrency wait split were never measured |
| AC-2 Review convergence improves | **PENDING** | `unverified` | 2 feasibility rows and 3 of the 10 comparison rows have landed; no improvement claim is possible yet |
| AC-3 Critical contracts detect representative defects | **MET** | `pass` | ci07 mapped every D2 contract to its faithful layer; ci11 observed ten faults fail and their corrections pass, with an independent oracle check |
| AC-4 Selection never silently narrows | **NOT MET** | `fail` | three unexplained misses are still unselected by today's planner (#1900, #1942, #1944); the 14-day window from reset `8e84002d` is still open |
| AC-5 Maintenance preserves behaviour and reduces work | **NOT MET** | `fail` | three candidates landed with measured savings, but the 24-hour scheduled bound failed (ci13 NOT QUALIFIED, ci15 NOT QUALIFIED); nothing was narrowed (ci16) |
| AC-6 Parallel validation keeps every verdict | **PENDING** | `unverified` | parallel validation parts are proved (ci03, ci05, ci06); the two-plan smoke and three-plan cohort never ran (ci14: no authorized cohort) |
| AC-8 Gains persist within the resource envelope | **PENDING** | `unverified` | no matched after-measurement exists and no weekly report has run; the backend tier is projected over its ceiling |
| AC-9 Growth is controlled for every tier and delivery time | **PENDING** | `unverified` | the controls work on fixtures and live per-PR reads, but no weekly report after activation exists, backend evidence is partial, and owners after handoff are unnamed (#1951) |

`fail` and `unverified` are the only non-pass statuses the existing tool accepts as an honest
partial review (`scripts/work-spec.mjs`, `receiptBookkeeping`): `fail` means not met on present
evidence, `unverified` means pending. Neither counts as pass.

## 1. Inputs

Every input row landed through the merge queue and has an independent checker PASS:

| Row | Merge | PR | Checker comment |
| --- | --- | --- | --- |
| ci01 | `139a9724` | #1848 | 6542211458 |
| ci02 | `1fcbb1f3` | #1852 | 6543072507 |
| ci03 | `99c461b8` | #1854 | 6545342052 |
| ci04 | `b666f302` | #1861 | 6546309131 |
| ci05 | `11523106` | #1866 | 6547595674 |
| ci06 | `26095c82` | #1872 | 6549558303 |
| ci18 | `fb15e6b8` | #1880 | 6553387120 |
| ci07 | `06d3836c` | #1896 | 6555493937 |
| ci08 | `23742966` | #1910 | 6556510450 |
| ci09 | `b2f335fb` | #1913 | 6558186162 |
| ci10 | `c2ca020a` | #1918 | 6559572853 |
| ci11 | `8e84002d` | #1922 | 6562405562 (PASS, re-judged from FAIL blocked: an untracked red push run, then tracked as #1924) |
| ci12 | `2314eeec` | #1927 | 6563361149 |
| ci13 | `d26c0ba0` | #1930 | 6564468198 |
| ci14 | `5ca8b87a` | #1936 | 6565376131 |
| ci15 | `5f60ce97` | #1943 | 6566279334 |
| ci16 | `66a61064` | #1948 | 6566823039 |

Each comment is `https://github.com/NoaCG/NoaCG-Studio/pull/<PR>#issuecomment-<id>`. I read each
row's evidence file and its checker comment; the statuses below are my own reading of those
receipts against the spec's criterion text, not a copy of the rows' own summaries.

**Escapes in this run.** 16 of 17 rows passed their first independent check. ci11's first verdict
was FAIL blocked on an exact-merge infrastructure condition (a red push run with no tracking
issue), not a product fault, and was re-judged PASS once #1924 tracked it. No checker found a
product defect that passed every PR and merge-group gate. Post-landing reds outside this plan's
diffs: five configured-suite stack starts (#1865, #1829), `production-chat-intake` (#1924) and
`production-controls` on a docs-only PR (#1946). The ci01 baseline escape rate was 2 of 21 rows.

## 2. Criterion by criterion

### AC-1: PENDING

- **Evidence.** [phase-ci01.md](phase-ci01.md), merge `139a9724`, checker PASS (comment
  6542211458). That checker judged ci01's own four row criteria, not every measure AC-1 lists.
- **What exists.** Frozen source and workflow blobs (section 1); a post-sharding cohort of 21 completed
  rows, above the 12-row minimum, with no unfinished eligible row; strata reported (backend 13,
  feature 8 provisional, extraction 0 missing); builder-to-PASS cut into consecutive,
  non-overlapping segments that add up exactly to each row's time; eligible runner wait (p50 0.03
  minutes) separated from dependency wait; queue-to-merged p50 9.2 / p90 12.1 minutes; cancelled
  and failed runner-minutes (section 5); escaped defects (3 failed checks in 2 rows); the five red
  nightlies triaged; deployment timing measured (production live 9.5 to 11.4 minutes before the
  configured verdict in 24 of 24 landings, owner decision #1846).
- **Why pending, not met.** AC-1 names measures ci01 did not take, and neither ci01 nor any later
  row labels them missing: (1) setup, test and report time per run: ci01 has no such split;
  (2) dependency and concurrency wait as components: ci01 says dependency wait "is not tabulated
  separately here" (section 2), and eligible runner wait comes from two dense sample windows,
  not the cohort; (3) PR-level finding families, never recorded (ci02 added the record for later
  rows). The first two can still be measured from existing Actions job records, so this is
  pending, not failed. The segment table and the CI-occupancy union do separate gross delay from
  execution, but they do not cover the measures AC-1 lists, so they are not reported as meeting it.
- **Other limits.** One wrong commit reference in ci01 section 4.4 is tracked in #1849 and changes
  no number.

### AC-2: PENDING (ten-risky-row sample limit)

- **Evidence.** [phase-ci02.md](phase-ci02.md), merge `1fcbb1f3`, checker PASS (comment
  6543072507): one guidance source for coherent review checkpoints, a 13-row baseline (pre-queue
  p50 167 / p90 284 / max 514 minutes), and a sample frame of 2 feasibility rows then 10
  comparison rows of separately authorized risky work.
- **The sample today.** The candidates are the JEV run's risky phases (#1850). Read 2026-11-02;
  each branch contains the ci02 merge:

  | Slot | JEV phase | PR | PR open to first queue entry, minutes | `@codex review` comments | First independent check |
  | --- | --- | --- | ---: | ---: | --- |
  | Feasibility 1 | 5 | #1864 | 45 | 3 | UNAVAILABLE (configured shard infrastructure, #1865) |
  | Feasibility 2 | 7 | #1878 | 45 | 2 | PASS |
  | Comparison 1 | 9 | #1888 | 153 | 4 | PASS |
  | Comparison 2 | 10 | #1893 | 58 | 0 | PASS |
  | Comparison 3 | 17 | #1947 | 19 | 0 | PASS |
  | Comparison 4 to 10 | 24, 25, 27, 28, 31, 35, 37 | not landed | | | missing |

  PR open to queue entry is not the baseline's pre-queue time (that starts at the ledger `build`
  event, which is in the JEV ledger and not read here), so no comparison with 167 minutes is made.
  Eligibility here is the ci02 frame's slot list (risk judged on acceptance before the outcome);
  per-row rules, finding families and repeated-family rounds are not read here and stay missing.
- **Why pending.** AC-2 forbids an improvement claim before ten comparable risky rows. Three of
  ten exist. The 25% median target, repeated-family rounds and duplicate requests are not judged.
  This is a sample limit, not a failure: the JEV run continues to 2026-11-14 under its own
  authorization, and a later assessment reads the remaining seven rows.

### AC-3: MET

- **Evidence.** [phase-ci07.md](phase-ci07.md) section 2 (contract map, merge `06d3836c`, checker
  comment 6555493937) and [phase-ci11.md](phase-ci11.md) with
  [phase-ci11-faults.json](phase-ci11-faults.json) (merge `8e84002d`, checker comment
  6562405562).
- **Why met.** Each of the six D2 contracts maps to executable checks at named faithful layers
  (node, browser, configured, artifact, catalog, deployed). Every protection class this run changed
  or replaced has an observed fault: ten injected faults F1 to F10, seven of them replays of
  recorded defects, covering cross-tab identity (F1, F2, F6), persistence (F3, F7), export
  lifecycle (F4) and asset loading (F5, F8, F10), each failing its guard and passing on the
  correction. ci12 and ci13, which came after ci11's class table, proved their own guards by
  mutation ([phase-ci12.md](phase-ci12.md) section 3, [phase-ci13.md](phase-ci13.md)
  section 4). The checker re-ran the faults on its own machine and checked the oracles. F2 exposed
  a mapping gap, corrected in the same merge (an audit reset).
- **Gaps reported, as AC-3 requires.** Physical playout hardware and vendor builds, hosted
  Supabase, browsers other than Chromium, loop-declared tests (#1911), quarantined specs (#1907),
  and two historical replays that no longer reproduce (#1921). The critical set itself caught only
  F1 and F8 (section 6 below, #1895).

### AC-4: NOT MET

- **Evidence.** [phase-ci04.md](phase-ci04.md), [phase-ci05.md](phase-ci05.md) (selection fixes,
  mutation-checked, replays of 56 and 150 landings, nothing planned narrower),
  [phase-ci07.md](phase-ci07.md) (replay of 42 days of red full runs, 126 items, none unknown),
  [phase-ci15.md](phase-ci15.md) (NOT QUALIFIED, checker comment 6566279334),
  [phase-ci16.md](phase-ci16.md) (no activation, checker comment 6566823039).
- **Why not met.** AC-4 makes zero unexplained misses necessary. ci15 replayed each pre-reset
  culprit through today's planner as CI runs it: `video-hyperframes` (culprit `aa2717b3`, #1900),
  `editor-foundation` (`b0331ecb`, #1942) and `editor-base-edits` (`97311f15`, #1944) are still
  not selected. That is demonstrated, not a missing observation. Separately, the two-week
  comparison after the last reset (`8e84002d`, 2026-11-01T18:14:35Z) cannot close before
  2026-11-15T18:14:35Z, and the audit reads `blocked` while quarantine incidents are open (four
  on `main`: #1907).
- **What is met inside it.** The pinned P1 cases (broad trace, catalog fallback, rename,
  `test.only`, output and fixture, copy and header), malformed or missing reports and omitted
  selected cases failing the gate, and the original-culprit replay.
- **Cost of the safety work (P1 b), reported apart from savings.** ci04: planned E2E test-minutes
  +3% over 56 landings, catalog gate raised on 20 instead of 2, about +15 to +18 graphics
  runner-minutes per landing, held as the dated exception `ci04-catalog-gate` (#1863). ci05:
  +0.15% over 150 landings, no graphics cost.

### AC-5: NOT MET

- **Evidence.** [phase-ci08.md](phase-ci08.md), [phase-ci09.md](phase-ci09.md),
  [phase-ci10.md](phase-ci10.md) (the three candidates), [phase-ci12.md](phase-ci12.md) (scope
  integrity), [phase-ci13.md](phase-ci13.md) (NOT QUALIFIED, checker comment 6564468198),
  [phase-ci15.md](phase-ci15.md), [phase-ci16.md](phase-ci16.md).
- **Met parts.** Three candidates, each with a behaviour, failure and boundary inventory, a fault
  replay and measured before and after cost:

  | Candidate | Merge | Measured saving per execution | Basis |
  | --- | --- | --- | --- |
  | ci08 arrangement geometry | `23742966` | 8.2 runner-seconds (61% of the changed tests) | Actions shard reports, before run 41287750200, after run 41291764565 |
  | ci09 repeated playout setup | `b2f335fb` | about 74 runner-seconds (29%), about 1.2 runner-minutes | Actions means of three before and two after samples; same-machine 30 to 31% |
  | ci10 overlapping editor walks | `c2ca020a` | about 25% on one machine (-109 s and -115 s per pair), about 1.5 runner-minutes on Actions by ratio | Same-machine alternating pairs; the full-shard Actions figure is still owed (#1920) |

  ci12 fixed scoped-catalog completeness (guard S1 to S13; one declared, never-benched category,
  #1926).
- **Why not met.** AC-5 requires a completed full or collectively exhaustive pass inside the
  24-hour bound before narrowing. ci13 measured 14 days (337 landings): 128 landings waited more
  than 24 hours for a complete green E2E verdict and 11 for engine-floor, because the nightly is
  their only carrier. ci15 accepted that as a demonstrated failure; ci16 retained full protection.
  The historical exact-commit culprit replay is also missing (ci13 checker). Nightly cause #1622 is
  open.

### AC-6: PENDING (three-plan sample limit)

- **Evidence.** [phase-ci03.md](phase-ci03.md) (three unrelated candidate SHAs dispatched together
  with attributable verdicts; moved refs, superseded runs, lost acknowledgement; checker comment
  6545342052), [phase-ci05.md](phase-ci05.md) and [phase-ci06.md](phase-ci06.md) (selected
  configured PR checks feed the CI gate; missing reports, unexpected skips and failed selected
  tests fail it; untriggered and merge-group skips exercised; checker comment 6549558303),
  [phase-ci14.md](phase-ci14.md) (cohort recorded absent, checker comment 6565376131).
- **Why pending.** The owner authorized no cohort and no third plan. The two-plan smoke and the
  three-plan cohort of four rows each never ran, so the >=2x completion rate, <=25% latency,
  pause and resume, and no-starvation targets are unmeasured. The cicd and JEV co-run (30 PRs,
  queue-to-landing p50 9.9 / p90 12.4 minutes, 0 dequeues, no admission before prerequisite PASS
  in 26 judged pairs) is unmatched operating evidence from a configuration that changed while it
  ran. AC-6 itself says small cohorts are operating evidence, not statistical proof; zero cohorts
  is less than that.
- **Added PR time and combined-tree gap (observed).** A whole-set selected configured run costs
  49.2 backend runner-minutes and finished 2.2 minutes after the last offline job; the merge group
  is still exempt, so the combined tree's backend is first checked on the landing push, 13.5
  minutes p50 after merge (#1846).

### AC-8: PENDING

- **Evidence.** ci01 (before figures), ci04 to ci06 (safety cost), ci08 to ci10 (savings), ci14
  section 2 (co-run figures), ci18 section 3 (tier reads), and the capacity check on `main` today
  (section 5 below).
- **Why pending.** AC-8 needs before and after per-change latency, completed work per hour and
  runner-minutes per accepted change, from weekly reports. No matched after-cohort exists (the
  co-run is unmatched), runner-minutes per accepted change for the run window are missing, not
  zero (ci14 section 2.5), and no weekly growth report has been published yet. No gain was
  activated (ci16), so there is no gain to persist.
- **Known risk that would make it not met.** ci06's selected PR runs project the backend tier to
  about 150 to 160 runner-minutes per landing against its 117 ceiling (128 to 137%) while worker
  full dispatches continue (#1871). Measured: 107.4 before ci06, and ci18's one live weekly
  collection (a thin 100-call sample, every tier partial) read 167.6 per landing (143%) and
  raised `cost:backend` with an owner and due date. The intentional
  safety cost of P1(b/c) is reported separately above (ci04, ci05) and here (ci06: +56 projected,
  -48 if routine dispatches stop).

### AC-9: PENDING (independent assessment for (d))

- **Evidence.** [phase-ci18.md](phase-ci18.md), merge `fb15e6b8`, checker PASS (comment
  6553387120): executable tier gates with 85% warnings and 95% refusal, conservative estimates,
  stale and partial evidence refusals, exception expiry and no-renewal-without-repayment,
  indirect-slowdown attribution, clock starts and per-item age alarms, each mutation-checked and
  replayed.
- **Live tier evidence.** Measured, not projected: backend 107.4 per landing (92% of 117) for the
  33 landings to 2026-10-31T21Z, before ci06. ci18's one live weekly collection (7 days, 100
  calls, every tier partial) read backend **167.6 per landing (143% of the ceiling)** and raised
  `cost:backend` with an owner and a due date: partial live evidence of a breach, and of an owned,
  dated action. Today's `node scripts/e2e-capacity.mjs --changed
  origin/main` on `66a61064`: offline 410/535 (77%) OK; backend 107.4/117 (92%) WARN, evidence
  partial; graphics 7.8/10 (80%) OK with the catalog-gate exception excepting 17.7 per landing to
  2026-11-30, evidence partial; overhead 84/105 (80%) OK; durations table 14 days old, over its
  8-day bound (#1847, refresh PR #1503 not landed). Its own line: "no weekly growth report has
  been published; tiers judged on the frozen seed measured to 2026-10-30".
- **Delivery-time evidence.** The post-land age alarm is live: #1892 opened 2026-11-01T04:09Z and
  last checked 2026-11-02T00:56Z, raising #1834 past its 120-minute ready and 30-minute queue
  ceilings with a dated action. That proves one overdue item raises an alarm. No pooled weekly
  delivery-time report exists.
- **Sample sufficiency.** Not sufficient. The one live weekly collection (ci18) was a 100-call
  sample against the 550 the production job uses, and every tier was partial. `weekly-audit.yml`
  runs Mondays at 06:00 UTC; its last three scheduled runs before ci18 started 6.6 to 9 hours
  late (2026-10-12 to 2026-10-26), and the first scheduled run after ci18 (2026-11-02) had not run when this file was
  written. No percentile is invented.
- **Weekly ownership.** Every owner string reads "cicd-improvement plan coordinator (run issue
  #1842) until ci17 hands off" (`scripts/growth-ceilings.json`, #1892, #1907). This row hands off
  without a successor owner: naming one is an owner decision, filed as #1951 (P1). Until it is
  decided, the alarms keep naming the coordinator, and once the coordinator stops its wakes no
  session acts on them: the weekly report, the age alarms and the quarantine incident repairs
  (due 2026-11-11 to 2026-11-15) fall to the owner by default. Who triages weekly miss rows is also
  open (#1904).
- **Outstanding exceptions.** `ci04-catalog-gate` (graphics, 17.7 per landing, expires
  2026-11-30, repayment #1862; on 2026-12-01 graphics counts at about 255% of its ceiling). The
  offline work-spec exception lines for `save-transaction`, `save-transaction-holds` and
  `save-transaction-wizard` expire 2026-11-16; a new offline line then needs a dated receipt.
- **Why pending, not met.** The controls work, but AC-9 also asks for an actual weekly report
  after activation with tier measurements, ages, owners and dated actions. Fixture success alone
  cannot establish lasting gains, and the live record has not reached one complete week.

## 3. Production-page studio acceptance

Unchanged and not claimed. It stays pending under its own plan; this row reads none of its
workers and changes none of its records.

## 4. Convergence

On this branch, with the review recorded in work.json (revision `66a61064`, the reviewed source):

```
$ node scripts/work-spec.mjs converge docs/work-specs/cicd-improvement/work.json
status: open, problems 0, gaps 7
gaps: AC-1: unverified; AC-2: unverified; AC-4: fail; AC-5: fail; AC-6: unverified; AC-8: unverified; AC-9: unverified
openCriteria: AC-1, AC-2, AC-4, AC-5, AC-6, AC-8, AC-9
exit 1
```

(The tool prints JSON; this is its content. Each gap ends "; continue its task or add a gap
task".) Not `evidence-complete`, so initial success is not claimed. Before this row the same
command returned `open` with the single gap "convergence review missing" and all eight criteria
open.

The review is a point-in-time record. `work-spec status` reports it stale once any other file
changes after `66a61064`, which is the tool's intended behaviour: a later reassessment records a
new revision.

Optional P5/P6 follow-ups, the preserved AC-7 cadence and reuse requirements and the worker backend
pilot stay inactive. Nothing here turns them on.

## 5. #1895 (D2: critical journeys on every product change): PENDING, owner decision

Not decided here. ci11's evidence: with each fault in place, the 10 critical specs (92 tests,
complete runs) caught only F1 and F8; they passed under F2, F3, F4 and F5. The ci11 checker
re-ran the set under F2 and saw one red (`project.spec.ts:154`), which then passed 4/4 with and
without F2: load noise, not a catch (comment 6562405562). The gap F2 exposed was closed by the header mapping
correction, not by the critical set. The owner decides whether the extra selection cost buys
enough.

## 6. Outstanding work, by priority

| Priority | Issue | What it blocks |
| --- | --- | --- |
| P1 | #1951 | Owner of the growth, age and quarantine alarms after handoff (AC-9 weekly ownership, AC-4 weekly reading) |
| P2 | #1900, #1942, #1944 | The three unexplained misses (AC-4; any later qualification) |
| P2 | #1895 | Owner decision on D2's critical set |
| P2 | #1907 | Four open quarantine incidents keep the audit `blocked` (AC-4, AC-8) |
| P2 | #1924, #1946, #1603, #1805, #1874 | Flaky or failing specs behind those incidents and post-landing reds |
| P2 | #1871 | Backend tier cost over its ceiling while dispatches continue (AC-8, AC-9) |
| P2 | #1862 | Repayment for the graphics exception before 2026-11-30 (AC-9) |
| P2 | #1847 (with PR #1503) | Stale durations table (AC-9 freshness) |
| P2 | #1846 | Production goes live before the configured verdict (AC-6 combined-tree gap) |
| P2 | #1926 | Imported-design category never benched (AC-5 scope integrity) |
| P2 | #1904 | Same-run flake receipts and weekly miss triage (AC-4) |
| P2 | #1911, #1921 | Loop-declared tests and CORE reader specs (AC-3 gaps) |
| P2 | #1885 | Growth-control hardening notes (AC-9) |
| P3 | #1622 | Nightly cause; blocks any qualified cadence (AC-5) |
| P3 | #1865, #1829 | Configured stack start faults (post-landing reds) |
| P3 | #1914, #1920, #1928, #1932, #1939, #1945, #1949, #1849, #1863 | Evidence and tooling follow-ups from rows ci01 to ci16; none changes a status above |
| open PR | #1834 | Pending quarantine entry (`import-svg-corpus`) and the live age alarm in #1892 |

What would move the open criteria: AC-1 needs setup/test/report time and the dependency
and concurrency wait split measured from existing job records for the ci01 cohort; AC-4 needs the three misses fixed (each a reset), the
incidents cleared and 14 clean days after the last reset; AC-5 needs a second complete carrier
for engine-floor and the omitted E2E specs, or keeping them pre-merge, then a qualified ci15-style
verdict; AC-2 needs seven more eligible risky rows; AC-6 needs an owner-authorized cohort; AC-8
and AC-9 need complete weekly reports with a named owner.

## 7. Handoff

- **Wakes.** The coordinator stops the run's wakes after this row's PASS lands, as the brief says.
  This row starts or stops nothing.
- **Repair ownership.** Every earlier PR of this run is merged. This row's own PR #1952 keeps the
  coordinator as its repair owner through its post-landing results. After the run ends, the open
  quarantine incidents and alarms fall to the owner by default until #1951 names someone (AC-9
  section above).
- **The next assessment.** A later reassessment of AC-2, AC-4 and AC-9 is meaningful after
  2026-11-15T18:14:35Z (the earliest audit close), after the remaining JEV risky rows land, and
  after at least one complete weekly report.

## 8. Phase notes

- **Previous verified `main`:** `66a61064f5f90acb4f68abef9738e38ea1ae9f3e` (ci16, PR #1948,
  checker PASS comment 6566823039).
- **Revert:** `git revert -m 1 <this PR's merge commit>` removes this file and the work.json
  review; nothing else depends on them.
- **Decisions.** (1) Pending maps to `unverified` and not met to `fail`, the two non-pass statuses
  the existing tool accepts as an honest partial review; no tool change. (2) AC-1 is pending, not met:
  AC-1's "report missing samples as provisional" covers thin samples, not measures that were
  never taken (setup/test/report time, dependency wait), and those can still be measured. (3) AC-4 and AC-5 are `fail`, not
  pending, because their failures are demonstrated and do not depend on time passing. (4) The
  successor owner is not chosen here; #1951 asks for it. (5) The review revision is this row's
  base, so the record names the exact source it judged.
- **Traps.** `work-spec converge` reports a review stale as soon as any non-review file changes
  after its revision, so merging `origin/main` into this branch means updating the revision.
  The bookkeeping only accepts `fail` and `unverified` as non-pass statuses; any other word
  (`pending`, `not-met`) makes the whole review count as a stale change.
