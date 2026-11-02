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
  exception to pass a gate. Quarantine is containment, not a fix.
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

## Measurement contract (used by cf03 and cf21)

From existing GitHub Actions history, with sample sizes, for comparable changes and workloads:

- M1. Median and p95 time from a ready PR to successful required checks.
- M2. Merge-queue waiting time and execution time, reported separately.
- M3. Total CI minutes per successful merge, including retries and reruns.
- M4. Flake and rerun rate, and the jobs that waste the most time.
- M5. Critical-path jobs, split into setup, build and test time.

The baseline also explains why the improvements already landed (cicd-improvement ci01 to ci18) did
or did not reduce total turnaround.

## Phases

1. [cf01] Route alarms and incidents to the accepted owner (#1951).
2. [cf02] Archive finished worker sessions in the plan-run workflow.
3. [cf03] Baseline merge turnaround, cost and flake waste.
4. [cf04] Isolate configured backend stacks (#1865, #1829).
5. [cf05] Fix the production-chat-intake and production-data flakes (#1924, #1603).
6. [cf06] Fix the production-controls flakes (#1946, #1778).
7. [cf07] Fix the late-send-abandoned flake (#1805).
8. [cf08] Track and exercise the SVG import incidents (#1954, #1926, #1834).
9. [cf09] Settle the offline tier exceptions (#1953).
10. [cf10] Make the test-removal check see loop tests and expire exceptions (#1911).
11. [cf11] Correct test selection for the three misses and similar dependencies (#1900, #1942, #1944, #1921).
12. [cf12] Run the ten critical tests on every product change (#1895).
13. [cf13] Shorten the measured critical path.
14. [cf14] Pay down the graphics tier exception (#1863).
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
  (b) A real alarm or incident notification is observed reaching `miwco`, with its receipt; #1951
  closes only after that.
- **cf02.** (a) `.agent-workflows/plan-run.md` says to archive a phase's builder, repairer,
  checker, diagnose and review sessions once its result and required handoff evidence are
  recorded, without disrupting active work.
- **cf03.** (a) M1 to M5 measured from existing history with sample sizes, before and after the
  cicd-improvement landings, for comparable changes. (b) An explanation of why each landed
  improvement did or did not change total turnaround, and a ranked list of candidate optimizations
  (duplicate work, cache misses, setup, shard balance, concurrency) with expected effect.
- **cf04.** (a) Concurrent configured stacks are isolated, with safe port allocation, readiness
  checks and cleanup on failure or cancellation, and the collision cause is diagnosed. (b)
  Concurrent execution is verified in CI; no unrelated process is killed and startup is not merely
  retried.
- **cf05, cf06, cf07.** (a) Each named flake is reproduced or explained, with a root-cause fix
  that waits on observable state (or a product fix for a race). (b) Stability is shown under
  representative CI conditions, and any quarantine is released only by the documented route.
  Each incident issue carries owner, impact, repair date and restoration criteria.
- **cf08.** (a) #1954 and #1926 carry a named owner, target date and link to the JEV run, which
  keeps implementation; if JEV cannot take them promptly, a coordinated fix is split out. (b) CI
  exercises and reports the missing svg01 case. (c) #1834 is reviewed against current main: it lands
  as an updated, policy-compliant quarantine with issue, owner and expiry, or is closed as obsolete.
- **cf09.** (a) Each offline exception expiring 2026-11-13 or 2026-11-16 is paid down, or extended
  briefly with current cost evidence, an owner and a reduction plan. Coverage is not weakened to
  meet a limit.
- **cf10.** (a) The test-removal check counts tests declared inside loops through reliable
  discovery or parsing, with a mutation-tested regression. (b) Exceptions are owned, justified and
  time-limited, and an expired exception fails with an actionable message.
- **cf11.** (a) Each of the three misses is reproduced and explained. (b) The dependency-aware rule
  for shared core files (#1921) and the missing `covers` metadata are applied, with regression
  checks showing the affected tests are now selected. (c) Similar dependencies are inspected so the
  fix is not limited to three examples; incomplete information keeps selection broad. (d) All known
  selector corrections land together, and the audit reset is recorded at that final change.
- **cf12.** (a) The ten critical tests run on every product change while their measured cost stays
  small, without running the same tests twice in one validation pipeline. (b) The 2-of-6 result
  from cicd-improvement ci11 is explained, with what the set does and does not protect, and the
  missed faults turned into worthwhile coverage improvements or recorded follow-ups.
- **cf13.** (a) At least one optimization chosen from the cf03 ranking lands, with before and after
  M1 to M5 on comparable changes showing its effect on total turnaround. (b) Obsolete PR runs are
  cancelled where safe, with required merge and coverage verification preserved.
- **cf14.** (a) The graphics tier cost is paid down before 2026-11-30, prioritising measured waste
  and critical-path impact, or a short dated extension is recorded with current cost evidence, an
  owner and a concrete reduction plan.
- **cf15.** (a) The documentation-only follow-ups (#1914, #1920, #1928, #1932, #1939, #1945, #1949,
  #1953) are completed in one cleanup PR; behaviour changes are left to their implementation phase.
- **cf16.** (a) Whether merge-queue validation already gives equivalent evidence for each exact
  merged revision is established. (b) Total CI cost and capacity are estimated for full validation
  of every exact merged revision within 24 hours, with latency and CI-minute tradeoffs reported
  both ways. (c) A recommendation: adopt that model, or keep full pre-merge coverage and optimize
  its execution. Full pre-merge testing stays until cf18 qualifies.
- **cf17.** (a) Success criteria and a resource and spend ceiling are written before execution. (b)
  One bounded three-plan trial measures completed work per unit time, queue delay, contention,
  retries and CI cost, and stops if contention or failure rates materially worsen. (c) Permanent
  three-plan concurrency is enabled only if the trial shows a benefit.
- **cf18.** (a) After the final selector change's clean audit window and every other
  prerequisite, a focused repeat of cicd-improvement ci15 is run, with the missing risky-change
  samples collected. (b) Acceptance criteria are not relaxed to close the run.
- **cf19.** (a) A focused repeat of cicd-improvement ci16: activation only on a qualified cf18 PASS
  with still-current evidence, otherwise the no-activation outcome with retained protection.
- **cf20.** (a) Before and after merge turnaround and CI cost with sample sizes; change in flaky
  failures and reruns. (b) Which cicd-improvement and cicd-followup criteria now pass and which
  stay open. (c) The next highest-impact optimization supported by measurements.

## Environment

`CA: qualified Claude Code Cloud worker plus GitHub Actions` for every phase. Measurements use
existing Actions history; drills and trials are bounded standard runs.
