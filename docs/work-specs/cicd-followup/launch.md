# Owner launch policy: cicd-followup

Recorded 2026-11-02 in Claude Code Cloud coordinator session session_017SdbwPphatUYXtpZ9CHkPu
(the cicd-improvement coordinator, run issue #1842). The provider is Claude Code Cloud, under the
cicd-improvement override of 2026-10-31; do not switch providers automatically.

## Run length and standing permissions

Owner answer, verbatim, to the run-length question: "Nov 30, continue until done (Recommended)",
meaning planning target 2026-11-30, the coordinator renews 24-hour blocks itself (blockRenewal) and
may continue past 2026-11-30 until the scope is complete (untilComplete). The owner may pause or
cancel at any time.

## Alarm ownership (#1951)

Owner answer, verbatim: "Me, weekly session backup (Recommended)": Mirko (`miwco`) is the primary
owner of the growth, age and quarantine alarms and incidents; the weekly owner session reviews
open alarm and incident issues each week as backup coverage.

## Coordinator defaults (owner may change)

- cf18(c): re-qualification stops waiting after two audit restarts caused by selection misses after cf11's final selector
  change, or on 2026-12-31, and is then recorded as not met without relaxing any criterion.
- cf17: if no three-plan cohort can run, the trial is recorded as not run 7 days after the owner is
  asked; permanent three-plan concurrency stays off.
- Dated extensions: at most 14 days past the original date, once per item; any further extension
  needs the owner's approval on the item's issue.

## Owner instructions, verbatim

> Please treat this as authorization for a focused CI follow-up. The goal is faster, reliable merges, with evidence that the changes improve total turnaround time. Do not mark the original performance goals achieved just because all implementation phases landed.
>
> PRIORITIES AND MEASUREMENT
>
> Start with:
> 1. Assign operational ownership for alarms and quarantine incidents.
> 2. Fix recurring flakes and backend startup failures.
> 3. Resolve the three test-selection misses.
> 4. Optimize the measured CI critical path.
> 5. Reassess catalog narrowing only after its safety requirements pass.
>
> Before further optimization, use existing CI history to establish:
> - Median and p95 time from a ready PR to successful required checks.
> - Merge-queue waiting time and execution time, separately.
> - Total CI minutes per successful merge, including retries.
> - Flake/rerun rate and the jobs causing the most wasted time.
> - The jobs on the critical path, including setup, build and test time.
>
> Compare similar changes and workloads before and after. Show sample sizes. Investigate why the improvements already landed did or did not reduce overall turnaround time.
>
> Use these measurements to choose between reducing duplicate work, fixing cache misses, improving setup, balancing test shards, or adjusting concurrency. Do not assume that speeding up an individual suite speeds up merging. Cancel obsolete PR runs where safe, while preserving required merge and coverage verification.
>
> OPEN ISSUES
>
> 1. #1900, #1942, #1944 — selection misses
> Use the broader dependency-aware rule from #1921 for shared core changes, and correct missing "covers" metadata where needed. These are complementary fixes.
>
> First reproduce and explain each miss. Add regression checks demonstrating that the selector now includes the affected tests. Inspect similar dependencies so we do not just patch three examples. Where dependency information is incomplete, retain broad selection.
>
> Accept restarting the 14-day audit after the final relevant selector change. Correctness takes precedence over preserving the current audit date. Consolidate the known selector corrections before beginning that window.
>
> 2. #1907 / #1945 — four quarantined incidents
> Start repairing all four now, coordinated with their existing owners. Create the missing issues immediately, with an owner, impact, repair date and restoration criteria. Deduplicate any overlap with the flaky-test issues below.
>
> Prioritize critical tests and tests causing repeated merge failures. Quarantine is temporary containment, not resolution.
>
> 3. #1924, #1946, #1603, #1778 — flakes
> Handle these as one coordinated workstream, using small, independently reviewable PRs unless a shared root cause warrants combining them.
>
> Replace timing guesses with waits for observable completion or application state, and investigate product races where relevant. Avoid arbitrary sleeps or additional retries as the primary fix. Demonstrate stability under representative CI conditions before removing quarantine.
>
> 4. #1926 — svg01 / SVG import
> Keep implementation ownership with JEV, with an explicitly linked issue, named owner and target date. CI owns ensuring the missing case is exercised and reported correctly.
>
> If JEV cannot take it promptly, split out a coordinated fix. Do not let cross-run ownership leave the failure untracked or indefinitely excluded.
>
> 5. #1911 — test-removal check
> Yes, fix it. Support tests declared inside loops using reliable test discovery or appropriate parsing. Make exceptions owned, justified and time-limited, with expired exceptions producing an actionable failure.
>
> 6. #1863 — graphics cost exception
> Aim to pay down the cost before November 30, prioritizing measured waste and critical-path impact.
>
> Allow a short, explicitly dated extension only if the remaining work cannot safely finish in time. Any extension needs current cost evidence, an accountable owner and a concrete reduction plan. No automatic or indefinite renewal.
>
> 7. #1953 — offline exceptions
> Review these now because November 13 and 16 are closer deadlines. Apply the same policy: pay down where practical; otherwise use a short, documented extension with ownership and a repair plan.
>
> Do not weaken coverage simply to satisfy a cost limit.
>
> 8. #1834 — quarantine import-svg-corpus
> Review it against current main and the existing SVG incidents; do not merge a stale bot PR automatically.
>
> Land an updated quarantine only if the documented quarantine policy permits it, with a linked repair issue, owner and expiry. Critical-test quarantine must follow the incident process. Do not silently quarantine a deterministic product regression. Close the PR if it is obsolete or duplicates an existing quarantine.
>
> 9. #1865, #1829 — backend ports
> Yes, fix the CI setup early. Isolate concurrent stacks, allocate ports safely, add readiness checks and guarantee cleanup on failure or cancellation. Diagnose whether stale processes, shared resources or fixed ports cause the collisions.
>
> Verify concurrent execution. Avoid killing unrelated processes or merely retrying startup.
>
> 10. Documentation and evidence follow-ups
> Complete them. Bundle genuinely related documentation-only changes into one cleanup PR. Put behavioral changes, including selector changes in #1921, in their implementation PRs. Create missing ownership and incident records immediately rather than waiting for the cleanup bundle.
>
> DECISIONS A–G
>
> A. Alarm ownership
> Make this the first follow-up action. Identify the existing CI/platform maintainer or team and obtain explicit acceptance of primary ownership plus backup coverage. Then update alarm routing and verify delivery.
>
> Do not invent an owner or treat a CODEOWNERS entry alone as acceptance. If the repository does not establish who should own this, ask me one direct question with a recommended person/team. Keep #1951 open until ownership and routing are verified.
>
> B. Ten critical tests on product changes
> Yes, run them on every product change, provided their measured cost remains small. Avoid executing the same tests twice within the same validation pipeline.
>
> They are an additional safety net, not a replacement for broader testing. Explain the reported 2-of-6 result and what the tests do and do not protect. Use the missed faults to identify worthwhile coverage improvements.
>
> C. Scheduled full coverage
> Keep full pre-merge testing while the selection misses and coverage requirements remain unresolved.
>
> If narrowing still looks worthwhile after measurement, use full validation of every exact merged revision, with enough capacity and monitoring to finish within 24 hours. First check whether existing merge-queue validation already supplies equivalent evidence for the actual merged revision, so we do not duplicate work unnecessarily.
>
> A second daily run of the latest main revision does not prove that every intervening merge was tested. It is sufficient only if the mechanism explicitly covers each required revision and meets the deadline.
>
> Estimate total CI cost and capacity before changing the coverage model. Narrowing may improve merge latency while increasing total CI minutes; report both. If that tradeoff is poor, retain full pre-merge coverage and optimize its execution.
>
> D. Re-qualification
> Yes, do a focused repeat of ci15/ci16 after the final selector version has completed its required clean audit window and the other prerequisites are satisfied.
>
> November 15 is only the earliest date under the current audit; relevant selector fixes will move it. Collect the missing risky-change samples and any other outstanding evidence. Do not relax acceptance criteria to close the run.
>
> E. Three-plan trial
> Authorize one bounded three-plan trial after the reliability fixes and baseline measurements are in place.
>
> Define success criteria and a resource/spend ceiling before execution, using existing capacity and budget constraints. Measure completed work per unit time, queue delay, contention, retries and CI cost. Stop if contention or failure rates materially worsen. Do not enable permanent three-plan concurrency unless the trial demonstrates a benefit.
>
> F. Worker-session archival rule
> Yes, open the PR for .agent-workflows/plan-run.md. Archive finished sessions after their results and required handoff evidence are recorded, without disrupting active work.
>
> G. Follow-up organization
> Create one small follow-up run with a single coordinating agent and separate, reviewable PRs for independent fixes. Keep human operational ownership distinct from agent coordination.
>
> Keep the scope focused on reliability, selector correctness, measured speed improvements and closing the necessary evidence gaps. Track long-running audit and observation windows explicitly; do not label pending goals complete.
>
> The final report should show:
> - Before/after merge turnaround and CI cost, with sample sizes.
> - Changes in flaky failures and reruns.
> - Which acceptance criteria now pass and which remain open.
> - The next highest-impact optimization supported by measurements.
>
> Success means faster, more reliable merges—not simply more CI changes shipped.
