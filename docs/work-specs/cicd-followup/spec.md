# CI follow-up: faster, reliable merges with measured turnaround

Status: authorized by the owner on 2026-11-02 (policy and words in [launch.md](launch.md)).
Successor to [cicd-improvement](../cicd-improvement/spec.md) (run issue #1842), which landed and
passed all 18 phases but met only AC-3. Its final report is
[phase-ci17.md](../cicd-improvement/evidence/phase-ci17.md). This plan does not mark any of those
criteria achieved; it closes the evidence gaps and fixes what blocks faster, reliable merges.

## Goal

Merges that are faster and more reliable, with evidence that total turnaround improved. Success is
measured turnaround, rerun and cost change, not the number of CI changes shipped. Speeding up one
suite is not assumed to speed up merging.

## Rules for every phase

- Never weaken a check, test, limit or budget, and never write a test-maintenance entry or budget
  exception to pass a gate. The one exception is a short dated extension the owner allowed (#1953
  in cf09, #1863 in cf14, and a dated phase under the rule below): it is written only with the
  reason, current cost or failure evidence, an owner and a reduction or repair plan, before the
  old date passes, and the PR names this rule. Quarantine is containment, not a fix.
- Flake fixes wait on observable application state or completion, and investigate product races.
  No arbitrary sleeps or extra retries as the main fix. Stability is shown under representative CI
  conditions before a quarantine is lifted.
- Where dependency information is incomplete, selection stays broad.
- Cancel obsolete PR runs only where safe; required merge-queue and exact-merge coverage
  verification is never cancelled or replaced.
- Exceptions are owned, justified and time-limited, with a dated repayment plan. No automatic or
  indefinite renewal. A short extension needs current cost evidence, an owner and a reduction plan.
- Human operational ownership (the owner, `miwco`, with the weekly owner session as backup;
  #1951) is distinct from agent coordination.
- Small, independently reviewable PRs. Behaviour changes ride their implementation PR; only
  genuinely related documentation-only changes are bundled.
- Long audit and observation windows are tracked explicitly; pending goals are never labelled
  complete.
- Phases cf07, cf09, cf05, cf08 and cf14 carry owner dates: each phase's date is the earliest repair
  due or expiry date in its issues (cf07: #1805, 2026-11-11; cf09: #1953, 2026-11-13 and 2026-11-16;
  cf05: the repair dates cf01(c) records for #1924 and #1603; cf08: #1954, 2026-11-14; cf14: #1863,
  2026-11-30). If a dated phase
  cannot PASS by its date, the coordinator records a dated extension under the incident or
  exception policy before the date passes, never after.
- Execution order is the numbered `## Phases` list; phase ids are names, not positions.

## Measurement contract (used by cf03, cf13 and cf20)

From existing GitHub Actions history, with sample sizes, for comparable changes and workloads:

- M1. Median and p95 time from a ready PR to successful required checks.
- M2. Merge-queue waiting time and execution time, reported separately.
- M3. Total CI minutes per successful merge, including retries and reruns.
- M4. Flake and rerun rate, and the jobs that waste the most time.
- M5. Critical-path jobs, split into setup, build and test time.

The baseline also explains why the improvements already landed (cicd-improvement ci01 to ci18) did
or did not reduce total turnaround.

## Phases

1. [cf01] Route alarms and incidents to the accepted owner, and keep one incident record per quarantined spec (#1951, #1907, #1945).
2. [cf07] Fix the late-send-abandoned flake (#1805).
3. [cf09] Settle the offline tier exceptions (#1953).
4. [cf05] Fix the production-chat-intake and production-data flakes (#1924, #1603).
5. [cf08] Track and exercise the SVG import incidents (#1954, #1926, #1834).
6. [cf04] Isolate configured backend stacks (#1865, #1829).
7. [cf06] Fix the production-controls flakes (#1946, #1778).
8. [cf03] Baseline merge turnaround, cost and flake waste.
9. [cf12] Run the ten critical tests on every product change (#1895).
10. [cf11] Correct test selection for the three misses and similar dependencies (#1900, #1942, #1944, #1921).
11. [cf10] Make the test-removal check see loop tests and expire exceptions (#1911).
12. [cf14] Pay down the graphics tier exception (#1863).
13. [cf13] Shorten the measured critical path.
14. [cf02] Archive finished worker sessions in the plan-run workflow.
15. [cf15] Finish the cicd-improvement documentation follow-ups.
16. [cf16] Assess the coverage model for catalog narrowing.
17. [cf17] Run one bounded three-plan trial.
18. [cf18] Re-qualify catalog narrowing after a clean audit.
19. [cf19] Activate qualified narrowing or keep full protection.
20. [cf20] Report measured outcomes.

## Acceptance per phase

Each phase below lists its acceptance verbatim for briefs and checkers.

- **cf01.** (a) Every owner string for the growth, age and quarantine alarms and the quarantine
  incident list names `miwco` as primary owner and the weekly owner session as backup coverage.
  (b) An alarm or incident notification, raised by the live routing (a deliberately triggered test
  alarm counts), is observed reaching `miwco`, with its receipt. The alarm is raised by the workflow's own token
  (not `miwco`'s), and the receipt is either the notification thread in `miwco`'s GitHub
  notifications or the owner's confirmation on #1951; #1951 closes only after that.
  (c) Before cf01 closes, each quarantined spec in `e2e/quarantine.json` has one open incident
  issue carrying owner, impact, repair date and restoration criteria, coordinated with its existing
  owner. Issues that overlap #1924, #1946, #1603, #1778, #1805, #1874 or #1954 are merged or cross-linked
  so each spec has exactly one tracking issue.
- **cf02.** (a) `.agent-workflows/plan-run.md` says to archive a phase's builder, repairer,
  checker, diagnose and review sessions once its result and required handoff evidence are
  recorded, without disrupting active work (on main since 78c1cd8); the checker confirms the text
  and that the coordinator has archived each finished phase's sessions so far. This is not counted
  as new work in cf20.
- **cf03.** (a) M1 to M5 measured from existing history with sample sizes, before and after the
  cicd-improvement landings, for comparable changes. (b) An explanation of why each landed
  improvement did or did not change total turnaround, and a ranked list of candidate optimizations
  (duplicate work, cache misses, setup, shard balance, concurrency) with expected effect. Each of
  the five categories gets at least one candidate or a measured reason it has none. (c) For
  M1, M2 and M3, the run-to-run spread on comparable changes and the minimum sample size per side
  for a before/after comparison, each derived from the history with the method stated. cf13 uses
  these values unchanged. It also states the rule for grouping comparable changes (for example by
  changed-path class and selected shard count). cf13 and cf20 use this rule, the spread and the
  minimum sample sizes unchanged.
- **cf04.** (a) Concurrent configured stacks are isolated, with safe port allocation, readiness
  checks and cleanup on failure or cancellation, and the collision cause is diagnosed. (b)
  Concurrent execution is verified in CI; no unrelated process is killed and startup is not merely
  retried. Cleanup is shown in CI after one failed and one cancelled run, with no stack process or
  port left held.
- **cf05.** (a) Each named flake is reproduced or explained, with a root-cause fix that waits on
  observable state (or a product fix for a race). A wait or dialog dismissal in the test does not
  count as the fix when the failure shows product behaviour that breaks a documented rule (for #1603,
  the save rule); that needs the product fix.
  (b) Stability is shown under representative CI conditions (a repeat count on CI runners with the
  CI worker count, written in the phase brief before the run, large enough that the failure rate measured before
  the fix (or, if it was not reproduced, the rate from CI history since it was quarantined or
  reported) would give at least a 95% chance of one failure, with the rate and arithmetic shown, with
  zero failures), and any
  quarantine is released only by the documented route. (c) Each incident issue carries owner,
  impact, repair date and restoration criteria, and is closed when its spec leaves quarantine by
  the documented route.
- **cf06.** (a) Each named flake is reproduced or explained, with a root-cause fix that waits on
  observable state (or a product fix for a race). A wait or dialog dismissal in the test does not
  count as the fix when the failure shows product behaviour that breaks a documented rule; that needs
  the product fix.
  (b) Stability is shown under representative CI conditions (a repeat count on CI runners with the
  CI worker count, written in the phase brief before the run, large enough that the failure rate measured before
  the fix (or, if it was not reproduced, the rate from CI history since it was quarantined or
  reported) would give at least a 95% chance of one failure, with the rate and arithmetic shown, with
  zero failures), and any
  quarantine is released only by the documented route. (c) Each incident issue carries owner,
  impact, repair date and restoration criteria, and is closed when its spec leaves quarantine by
  the documented route.
- **cf07.** (a) Each named flake is reproduced or explained, with a root-cause fix that waits on
  observable state (or a product fix for a race). A wait or dialog dismissal in the test does not
  count as the fix when the failure shows product behaviour that breaks a documented rule; that needs
  the product fix. The fix rules out a backend stack or port collision (#1865, #1829) as the cause,
  or names it and leaves the setup fix to cf04.
  (b) Stability is shown under representative CI conditions (a repeat count on CI runners with the
  CI worker count, written in the phase brief before the run, large enough that the failure rate measured before
  the fix (or, if it was not reproduced, the rate from CI history since it was quarantined or
  reported) would give at least a 95% chance of one failure, with the rate and arithmetic shown, with
  zero failures), and any
  quarantine is released only by the documented route. (c) Each incident issue carries owner,
  impact, repair date and restoration criteria, and is closed when its spec leaves quarantine by
  the documented route.
- **cf08.** (a) #1954 and #1926 carry a named owner, target date and link to the JEV run, which
  keeps implementation; if the JEV run has not accepted them with a target date by the time cf08 starts, a coordinated fix is split out as an issue with a named owner and target date, linked from #1926. (b) CI
  exercises and reports the missing svg01 case. (c) #1834 is reviewed against current main: it lands
  as an updated, policy-compliant quarantine with issue, owner and expiry, or is closed as obsolete
  or as a duplicate of an existing quarantine. A deterministic product regression is not
  quarantined. A critical-test quarantine follows the incident process. (d) For #1954: if the JEV
  run has accepted it with a target date, cf08 records that date, and if the date passes with the
  spec still quarantined, the coordinator records a dated extension under the incident policy and
  cf20 reports it open. Otherwise cf08 repairs it itself under the same criteria as cf05(a) to (c):
  root-cause fix (a product fix if the failure is a product race), the pre-written CI repeat count
  with zero failures, and release by the documented route.
- **cf09.** (a) Each offline exception expiring 2026-11-13 or 2026-11-16 is paid down, or extended
  briefly, only where pay-down is not practical before the expiry, with the reason recorded,
  current cost evidence, an owner and a reduction plan. Coverage is not weakened to
  meet a limit.
- **cf10.** (a) The test-removal check counts tests declared inside loops through reliable
  discovery or parsing, with a mutation-tested regression. (b) Exceptions are owned, justified and
  time-limited, and an expired exception fails with an actionable message.
- **cf11.** (a) Each of the three misses is reproduced and explained. (b) The dependency-aware rule
  for shared core files (#1921) and the missing `covers` metadata are applied, with regression
  checks showing the affected tests are now selected. (c) Similar dependencies are inspected so the
  fix is not limited to three examples; incomplete information keeps selection broad. (d) All known
  selector corrections, including cf12's change to selection, land before or with this phase's
  final selector change, and the audit reset is recorded there. Any later phase that changes
  selection states in its PR that it restarts the audit, and cf18's earliest date moves with it.
- **cf12.** (a) The ten critical tests run on every product change while their added
  minutes per product change, measured on product changes after enabling, stay under a ceiling written in the phase brief
  before the change lands, stated as a share of cf03's median M3 per merge with the reason and not above 5% unless the owner
  approves a higher share, without running the same tests twice in one validation pipeline. If the measured added minutes exceed the ceiling, the tests are not
  enabled on every product change, the measurement is recorded, and the owner is told in the phase
  result. (b) The 2-of-6 result
  from cicd-improvement ci11 is explained, with what the set does and does not protect, and the
  missed faults turned into worthwhile coverage improvements or recorded follow-ups.
- **cf13.** (a) At least one optimization chosen from the cf03 ranking lands. Before and after M1
  and M3 on comparable changes, with sample sizes stated and at least the sample size cf03 judged
  sufficient, show M1 median or p95 lower or M3 lower beyond cf03's measured run-to-run spread, with
  no regression in M2 waiting time, M2 execution time or M4. The before side of each comparison is
  the merges after the last earlier phase that changed CI landed and before the candidate lands;
  cf03's baseline is not the before side. If no candidate improves beyond that spread, the phase records the result,
  reverts or keeps the change on cost grounds with its reason, and moves to the next ranked
  candidate. Candidates are tried in ranked order, at most three; untried candidates go to cf20(c)
  as measured next steps. It does not PASS on landing alone. If every tried candidate (at most three) has failed to show an
  improvement beyond the spread, the phase PASSES with that negative result recorded, the speed goal
  stays open, and cf20 reports it as open. (b) Obsolete PR runs are
  cancelled where safe, with required merge and coverage verification preserved.
- **cf14.** (a) The graphics tier cost is paid down before 2026-11-30, prioritising measured waste
  and critical-path impact, or, only if the remaining work cannot safely finish by then and the
  reason is recorded, a short dated extension is recorded with current cost evidence, an owner and
  a concrete reduction plan (no automatic or indefinite renewal). Coverage is not weakened to meet a
  limit.
- **cf15.** (a) The documentation-only follow-ups (#1914, #1920 (its documentation part; the full-shard figure is cf18's), #1928, #1932, #1939, #1949, #1849,
  plus any documentation-only remainder of #1945 and #1953) are completed in one cleanup PR; behaviour changes are left to their implementation phase.
- **cf16.** (a) Whether merge-queue validation already gives equivalent evidence for each exact
  merged revision is established. (b) Total CI cost and capacity are estimated for full validation
  of every exact merged revision within 24 hours, with the capacity and monitoring needed to meet
  that deadline, with latency and CI-minute tradeoffs reported
  both ways. (c) A recommendation: adopt that model, or keep full pre-merge coverage and optimize
  its execution. Full pre-merge testing stays until cf18 qualifies. (d) This phase changes no
  coverage. Its recommendation is re-read against cf18's result before cf19 acts on it.
- **cf17.** (a) Success criteria, stop thresholds for contention and failure rate, and a resource
  and spend ceiling within existing capacity and budget constraints are written before execution. (b)
  One bounded three-plan trial measures completed work per unit time, queue delay, contention,
  retries and CI cost, and stops if contention or failure rates cross the thresholds written in (a). (c) Permanent
  three-plan concurrency is enabled only if the trial meets the success criteria written in (a).
- **cf18.** (a) After the final selector change's clean audit window and every other
  prerequisite, a focused repeat of cicd-improvement ci15 is run, with the missing risky-change
  samples collected, and the other evidence cicd-improvement ci17 section 6 lists as missing
  (exact-commit replay drill, imported-design bench #1926, ci10 full-shard figure #1920) collected
  or recorded as still open. (b) Acceptance criteria are not relaxed to close the run. (c) If the
  audit window restarts twice because of selection misses after cf11's final selector change, or has not completed clean by
  2026-12-31, the phase stops waiting: it records re-qualification as not met, with the open misses,
  without relaxing any criterion. cf19 then takes the no-activation outcome with full protection
  retained, and cf20 reports re-qualification as open. (The limit is the coordinator's default;
  the owner may set another.)
- **cf19.** (a) A focused repeat of cicd-improvement ci16: activation only on a qualified cf18
  PASS with still-current evidence, when cf16's recommendation, re-read against cf18's result, is
  to adopt the model, and the full validation of every exact merged revision from cf16(b) is
  running with its capacity and monitoring, finishing within 24 hours. Otherwise the no-activation
  outcome with full pre-merge protection retained.
- **cf20.** (a) Before and after merge turnaround and CI cost with sample sizes, using cf03's
  comparability rule and spread; change in flaky
  failures and reruns (M4) with sample sizes. (b) Which cicd-improvement and cicd-followup criteria now pass and which
  stay open. (c) The next highest-impact optimization supported by measurements.

## Environment

`CA: qualified Claude Code Cloud worker plus GitHub Actions` for every phase. Measurements use
existing Actions history; drills and trials are bounded standard runs.
