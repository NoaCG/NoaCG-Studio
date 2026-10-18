# Faster landings within $50/month

Research date: 2026-10-17. Application source: `3010e41134f1e3a6ebf3933582eb9b7e52055241`.
The research itself changed no landing configuration, account plan or purchase. The worker pilot ran only on
`scratch/landing-worker-pilot`, without a pull request or land label.

Follow-up, 2026-10-18: the owner upgraded NoaCG to GitHub Team for a one-month trial on
2026-10-17. The comparison window is 2026-10-17 20:15:36 through 2026-10-24 20:15:36 UTC;
results are pending. Standard public runners remain in use; paid runners are deferred.
Secret scanning, Dependabot and CodeQL were also activated during the trial, followed by
security fixes. Count their added CI workload separately when interpreting the comparison.
The measurements below remain the original pre-upgrade baseline, not a measured Team result.

**Recommendation: try GitHub Team for one month, then finish the agreed selection safety and
batched validation work.** For the observed one-member organization, the expected additional
bill is **$4/month plus applicable tax (E)**. Keep standard public runners. Do not rent a server,
buy a mini PC or move the whole suite to paid runners. Qualify more Playwright workers only if
the bounded pilot earns a larger experiment. Keep the remaining budget unspent.

Labels throughout: **M** = measured, including vendor-published quotes and code inspection;
**E** = estimate or calculation; **U** = unknown. Vendor quotes were checked on the research
date; checkout, tax and exchange rates can change the bill. Planning time estimates are
engineering days, not paid services.

## Evidence and expected landing time

The census covers **2026-10-03 00:00 through 2026-10-17 06:00 UTC**, a **14.25-day (M)** window:
**5,189 workflow runs and 470 merged PRs (M)**. Queue entry means the first recorded queue entry,
including removal, repair and re-entry; it does not start at the final successful CI run.

| Cohort | Queue to landed p50 / p90, minutes (M) |
|---|---:|
| All 470 PRs | **7.6 / 27.0** |
| First seven days, 161 PRs | 10.3 / 23.7 |
| Remaining window, 309 PRs | 5.8 / 30.4 |
| All PRs, counting only the last queue entry | 7.2 / 25.1 |

The median already meets the agreed **10-minute target**. The **20-minute p90 target** does
not. Fourteen PRs re-entered (M); excluding that time does not cure the tail.

All **1,890 CI, 539 configured-suite and 17 nightly attempts (M)** have job receipts.
The covered workflows hit **20 concurrent runners for 17.0% of covered busy time (M)**;
other workflows are only partly covered, so that percentage is not an exact organization-wide
utilization measure. CI shard waiting was p50 **0.05 / p90 8.13 minutes (M)**. Setup was only
**0.28 / 0.38 minutes (M)**. Faster dependency installation is not the main opportunity.

A scheduling sensitivity over the same **470 PRs** gives **p50 6.8 / p90 19.6 minutes (E)**
if half of each final successful merge run's overhead above modeled uninterrupted execution disappears;
removing all of it gives **5.5 / 14.2 (E)**. Execution times and earlier repair/re-entry time
stay unchanged. This deliberately optimistic model also removes workflow/dependency overhead,
not just runner waiting, and uses the current dependency graph. It is **not a simulation of
Team's 60 slots**. The half-delay result is a testable planning hypothesis, not measured savings.

CI consumed **114,539 runner-minutes (M)**; main pushes took **61.4% (E)** of that, making safe
batching a substantial load lever. Configured jobs took p50 **25.4 minutes**, of which local-stack
startup was **2.0** and tests **22.8 (M, 528 jobs)**: setup does not dominate there either.
The first post-fix full main run in this window used **13 shards**, with its slowest at
**15.8 minutes (M)**, but creation to gate still took **31.2 minutes (M)**.
[Run receipt](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39005842892).

**Expected result:** the combination is intended to reach the agreed p50 <=10 / p90 <=20
minutes. A causal numerical forecast for Team or batching is **U** until the trial. The
measured baseline and the scheduling sensitivity above are the defensible numerical range,
not a promise that buying concurrency alone meets the target. Accept the plan only through
observed queue-to-land results, including failures and busy periods.

## Options and cost

The paid-runner comparison uses **241,135 runner-minutes/month (E)**, extrapolating
the measured CI workflow only, with the same workload and speed. It excludes other workflows,
minute rounding, storage, tax and network charges, so these are favorable estimates. Halving
that workload for a hypothetical faster runner still leaves the metered options over budget.
No vendor speed claim is treated as a NoaCG measurement. Common effect on p50/p90 for untested
compute options: **U**; they may reduce execution or waiting but do not shorten repairs.

| Option | Monthly cost; one-off | Expected effect, risk and effort |
|---|---|---|
| **GitHub Free / Team** | Free $0; Team $4 per member (M), about $4 + tax here (E); no setup fee | Standard concurrency **20 / 60 (M)**. Team removes a documented bottleneck while public compute stays free. About an hour to change and instrument (E); no test migration. Personal Pro is $4 and 40 slots (M) but does **not** upgrade this organization. [Plans](https://github.com/pricing), [limits](https://docs.github.com/en/actions/reference/limits), [organization versus personal plans](https://docs.github.com/en/get-started/learning-about-github/githubs-plans). |
| GitHub larger runners | Team plus $0.012/min at 4 CPU, $0.022 at 8 (M); **$2,898/month (E)** at 4; no setup fee | Larger runners are paid even for public repositories. More predictable sizing, still unmeasured speed. Roughly half a day to pilot (E). [Rates](https://docs.github.com/en/billing/reference/actions-runner-pricing), [billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions). |
| Blacksmith | 4 CPU $0.008/min, 3,000 free minutes/month (M); **$1,905/month (E)** even crediting all 3,000 at that size; no setup fee | Its OSS grant requires a permissive license; this repository is AGPL, so do not budget the grant. Provider permissions and actual speed need review; half to one day (E). [Pricing and OSS terms](https://www.blacksmith.sh/pricing). |
| Namespace | PAYG 4 CPU / 8 GB $0.006/min or 4 CPU / 16 GB $0.012 (M); **$1,447/month (E)** at the smaller memory size; no monthly minimum | Developer allowance is 32 concurrent vCPU (M), only eight 4-CPU jobs (E). Trial is temporary; $100/month Team is already over budget. Half to one day (E). [Pricing](https://namespace.so/pricing). |
| Depot | $20/month including 2,000 base minutes; 4 CPU / 16 GB counts double, then $0.012/min (M); **$2,902/month (E)**; no setup fee | Unlimited advertised runner concurrency (M); capacity and speed unmeasured here. No published recurring OSS grant to count. Half to one day (E). [Pricing](https://depot.dev/pricing), [normalization](https://depot.dev/docs/github-actions/runner-types). |
| Ubicloud | Standard 4 CPU / 16 GB $0.0025/min; $2.50 monthly credit (M); **$600/month (E)**; no setup fee | Cheapest ordinary metered option checked. New accounts default to premium at $0.004/min (M), so explicitly select standard. Useful for a small fallback selection, not the whole load. Half to one day (E). [Current rates](https://www.ubicloud.com/docs/about/pricing). |
| RunsOn on AWS | OSS license may be free with public attribution; otherwise €300/year upfront (M). Illustrative 4-CPU spot compute $0.0015/min (M), **$362/month (E)** before controller/storage extras | OSS/noncommercial eligibility here is U. Spot price and interruptions vary; AWS operations remain ours. One to two days (E). [License and live calculator](https://runs-on.com/pricing/). |
| Rented dedicated server | Hetzner AX42-1: $117.10/month + $59 setup, excluding tax; limited AX41 $67.10/month (M). Netcup RS2000: from €40.70/month including German VAT, 12-month term (M); delivered USD price U | Hetzner exceeds budget. Netcup offers 8 dedicated cores / 16 GB (M), but does not replace 60 elastic job slots; memory limits simultaneous browsers. Dedicated CPU reduces the runner lottery, not contention on our own host. Secure setup two to four days and one to two hours/month (E). [Hetzner current price adjustment](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/), [Netcup current catalogue](https://www.netcup.com/en/server/root-server). |
| Home mini PC | Example 8-core UM690L Slim, 32 GB / 512 GB: $575, listed out of stock (M). Power $2.92–5.84/month at 20–40 W and $0.20/kWh (E); delivery/UPS U | Even with free power, payback against Team is **144 months (E)**; against $50 rent it exceeds **12 months (E)** with power. A qualifying one-year purchase would need to cost <=$48 before power (E). Reject. Adds a separate machine, leaving the owner's RAM-limited computer free, but adds outage and security duties. [Published quote](https://store.minisforum.com/products/minisforum-um690l-slim-min-pc). |
| More workers / production preview | $0 extra compute charge on standard public runners (E); one to three days for worker qualification, preview migration U | Pilot below. Worker changes can reduce both duration and occupied slot-minutes; suite-wide safety unproven. Production preview is a test architecture change, not a configuration flip. |
| Safe batching / suite maintenance | $0 hosting increment (E); batching roughly three to five days after prerequisites, one to two days per contained maintenance candidate (E) | Batching reduces competing full runs; consolidation reduces work. Landing-time effects U until rollout. Selection mistakes or delayed diagnosis are the main risks; keep the existing protection requirements. |
| Targeted cloud checks | $0 incremental subscription budget assumed under existing access (E); capacity/quotas U | Catch relevant defects before a PR consumes CI; required green PR and merge-group checks still run. No guaranteed CI reduction. About half a day to document receipts (E); cloud setup remains separate work. |

Public GitHub compute is free; artifact/cache overages are separate. This is an incremental
compute decision, not an audit of the organization's total bill. Team needs only the actual
billable seats, with no five-seat minimum. Confirm monthly billing and the renewal quote at
checkout; the pricing page also displays a first-year offer note. [Billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions),
[plan FAQ](https://docs.github.com/en/get-started/learning-about-github/faq-about-changes-to-githubs-plans).

Persistent self-hosted runners are unsafe as an unrestricted destination for public fork PRs:
untrusted code can persist on the host and reach later jobs. Runner containers alone do not
provide GitHub's fresh-machine isolation. Any later pilot needs disposable isolated VMs,
no host Docker socket or home-network access, minimal tokens and no secrets; keep untrusted
fork jobs on GitHub. Provider-hosted runners still require a permissions and trust review.
These are additional obligations for an option that already loses on price.
[GitHub security guidance](https://docs.github.com/en/actions/reference/security/secure-use).

## Small experiments and savings that are actually available

One sequential [scratch dispatch](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39023873441)
ran the same **51 wizard, editor and playout tests** in each arm, with **zero failures, skips or
retries (M)**. Application code, assertions, trace retention and the job cap were unchanged.

| Workers | Reported test phase (M) | CPU model (M) | Interpretation |
|---:|---:|---|---|
| 1, first baseline | 318.6 seconds | EPYC 7763 | Baseline |
| 2 | 224.9 seconds | EPYC 7763 | 29.5% shorter than baseline mean (E), below the existing 35% adoption threshold |
| 4 | 165.7 seconds | EPYC 9V74 | 48.0% shorter (E), **confounded by the different CPU** |
| 1, final baseline | 318.9 seconds | EPYC 7763 | Baseline stayed stable |

This is one candidate run per worker setting, not a flakiness qualification. Aggregate peak RAM
was not measured. Four workers merit a controlled experiment stratified by runner CPU; neither
candidate is approved for the whole suite from this pilot. Full command wall times, test
identities and hardware observations are in the aggregate receipts.

The warm `/app#/home` probe used five fresh browser contexts: median **2.75 seconds**, maximum
**2.89 seconds (M)** to the visible home page. Navigation alone was roughly **0.57–0.65 seconds
(M)**. The dev server was already warm; cold transforms and representative editor/playout
startup are **U**. This does not justify multiplying the home-page figure by the whole suite.
The prior full-run profile reported navigation at **15 of 166 minutes (M, prior evidence)**;
readiness work can also be inside assertions and evaluation.

One Vite server is already shared by workers within a job (M). Sharing a mutable server across
jobs creates isolation and contention problems. **189 of 233 offline spec files (M)** directly
import `/src/` modules; helpers and the offline guard do too. A production preview cannot
preserve those source-module tests unchanged. First move suitable cases to Node or a blank
browser page; separately pilot production-built UI journeys, including route/API behavior.
Do not fund a wholesale preview migration on the present boot evidence.

Current candidate minutes below come from the checked-in slow-runner timing table (M).
Savings are **E**, gross until replacement costs are measured. The separate codebase-lean audit
owns retirement decisions; this report approves no deletion.

| Candidate | Present minutes (M) | Possible saving and retained protection |
|---|---:|---|
| Editor proposal + command task walks | 7.01 | Up to 7.01 removed from affected gate selections, minus the short retained journey (E). Combining the scheduled walks has **unknown net full-validation saving**. Keep both modes, exports and viewport assertions; inject command-adapter and proposal-normalizer faults. Moving a walk to every full validation saves no total run time by itself. |
| Groups + arrangement | 4.91 | 2–3 minutes (E) by moving geometry to Node. Keep rendered group/ungroup, align/distribute, nudge and undo/redo journeys; mutations must fail at the new layer. |
| SVG corpus | 5.75 | About 3 minutes (E) using blank-page mapping cases plus one real import journey. Every fixture/expectation and historical defect must survive. |
| Creative pilot / five Lite specs / bench | 2.06 / 3.49 / 2.40 | About 2 / 1–2 / 1 minutes gross (E), less Node or browser replacement time. Carry mutation twins and rendering checks unchanged. |
| Playout folders / Bridge waits | See candidate inventory | About 2–3 / 1–2 minutes (E), only after profiling. Preserve isolated contexts, persistence/failure cases and delayed-reply detection. |
| SVG examples / quiz exhaustive walk | 2.08 / 2.06 | Gate-placement benefit only until measured consolidation. Keep scheduled exhaustive coverage and the representative pre-merge defect checks. |

Do not sum these estimates into guaranteed capacity. Record **gate minutes, full-validation
minutes and total runner-minutes separately**, including replacement costs. Candidate details:
[inventory](candidates.md), [existing experiment criteria](experiments.md).

Cloud workers can run the changed behavior and its short critical journey on the exact reviewed
SHA: for example, editor command/model-proposal checks for that change, or the relevant playout
journey. Keep the approved **five-minute small / twelve-minute broader caps**; leave larger plans
to Actions. Existing measurements show
representative selections finishing in roughly **5–6 minutes (M)**, not a qualified full suite.
Resource checks choose workers; unknown limits mean one. Out of **658 PR CI runs, 83 failed and
77 were cancelled (M)**. Those ultimately red runs are **12.6% of PR runs (E)**; only some
are preventable by earlier checks. Earlier failures inside ultimately successful reruns and
cancellations need separate attribution. Guaranteed CI reduction is **zero (E)**.
Those red runs consumed **3,564 CI minutes (M)**, only **3.1% of all CI minutes (E)**; even
preventing every one would not remove the main-run concurrency bottleneck.
Do not remove required checks or charge for new model access to chase it.
[Cloud measurements](../../cloud-execution/evidence/measurements.md),
[current capability status](../../cloud-execution/evidence/capabilities.md).

## Why this can keep working

The suite is **183.3 / 213.9 table-minutes, 85.7% (M)**. Keep that capacity denominator fixed
when upgrading the account. More available jobs buy room between competing runs; they do not
make a growing shard finish faster. Doubling the suite at unchanged workers/shards would take
roughly **28 minutes per shard (E)** and breach the unchanged **20-minute limit**.

The **85% warning / 95% refusal** remain binding. Current headroom to refusal is only
**19.9 table-minutes (E)**. The older growth rate, about **26 minutes/week (M, prior study)**,
would consume that in about **five days (E)**; that is a stress case, not a growth forecast.
Recovered minutes are reserve, not permission to add browser specs indiscriminately.

Keep the placement rule: pure logic in Node, browser APIs/layout in isolated browser tests,
real user journeys in E2E. Every new case names its behavior and cheapest sufficient layer.
The weekly refresh reports cost adders, warning/refusal status, queue percentiles and historical
selection misses. Address one measured maintenance candidate at a time; monthly review checks
landing latency and completed-validation age. Never solve a red check with skips, retries,
longer timeouts or a repair-written budget exception.

## Phased plan, after approval

Each code phase gets its own short spec, `/check`, exact-commit evidence and `/queue-merge`,
with one acknowledged repair owner through post-landing verification. Nothing here changes
production landing behavior yet.

1. **Team trial and baseline.** Owner changes the organization plan only after approval. Observe
   at least **100 landings over seven days**, including busy periods (proposed trial size), with
   first-entry p50/p90, runner wait, shard time and spending. Accept p50 <=10 / p90 <=20; if
   it misses, retain the honest result and identify waiting versus execution versus repairs.
   Keep the fixed capacity budget. Account rollback: return to Free; no workflow migration.
2. **Qualify workers, if warranted by the pilot.** Use the existing experiment procedure on
   scratch branches in quiet hours: paired baseline/candidate full runs, warm-up excluded,
   at least five measured runs per arm, compared within the same CPU class. Require >=35%
   shorter E2E steps, no new failures,
   no missing tests, acceptable memory, and all shards below 20 minutes. Keep retries at zero,
   traces and assertions. Recompute timings from measured slow runners, never an assumed
   worker multiplier. Failure means keep one worker; rollback is the worker-config commit.
3. **Finish selection safety before batching.** Give shared critical journeys explicit reasons;
   review own-context tracing gaps. Fix the miss audit to use the culprit commit's historical
   planner, headers and trace map, with confirmed culprit attribution. Today's checker uses
   today's planner and can hide a historical miss after a header repair. Replay every full-run
   failure for the required two weeks; demonstrate an injected miss is detected. Unattributed
   failures remain unresolved. This is a rollout prerequisite, not a new reason to weaken gates.
4. **Implement batching behind a disabled switch, then drill, then enable.** The proposed
   `NOACG_MAIN_VALIDATION`, validated status and snapshot receipts are not implemented at this
   source revision (M). Keep affected tests plus critical journeys before merging. Pin each full
   snapshot and landing range; never cancel an active validation; schedule the next when needed.
   Demonstrate stale alarm, known culprit bisection and single-landing recovery. Require completed
   validation within the agreed **60 minutes** and attributable expensive coverage within
   **24 hours**. Only then enable with an immediate return-to-current-cadence switch.
   The older cadence replay estimated **32% fewer completed full runs (E)**, but its p90-duration
   stress case reached **68.3 minutes (E)**, beyond the deadline. Re-run it on this workload and
   measured candidate duration first. An hourly timer is not an acceptable substitute.
5. **Consolidate one candidate per PR, then sustain it.** Start with measured tier moves or
   shared setup, not deletion counts. Require named protection, failing mutation/defect replay,
   passing replacement and measured net savings. Full validation includes the scheduled walks.
   Configured tests follow the same pinned snapshot/range design; retain their current cadence
   until that integration is proven.
   Rollback each contained change independently. Keep the weekly/monthly controls above.

The existing [spec](../spec.md) and [cadence replay](cadence-replay.md) remain authoritative.
The current selection audit does **not** yet satisfy their historical safety requirement.

## Recorded decisions and remaining proposals

The one-month Team trial was approved and started. Publishing this research preserves its
baseline and methods and changes no CI settings. Implementation follows the agreed budget spec
and the prerequisites above. Use the trial results to choose the next bounded improvement,
keeping every existing protection and detection deadline.

No server, hardware or third-party runner purchase is recommended. A later change to the
external runner trust boundary would need a separate concrete proposal and owner decision.

## Reproduction and limits

Run `scripts/landing-speed-study.mjs` in this evidence directory with modes `runs`, `prs`,
`jobs ci.yml configured-suite.yml nightly.yml`, then `analyze`. It uses cached responses,
at most three fetching workers, a per-invocation request cap and a shared-rate-limit reserve.
Resume deferred jobs from cache; use a fresh `NOACG_CI_CACHE` directory for a different window.
The script refuses a cache recorded for a different window; set both dates and use a fresh cache
for a new study. Cached responses are not refreshed automatically: refresh incomplete runs,
attempts and PR timelines before interpreting an ongoing trial. Invalid or missing timings are
excluded from both percentiles and their sample counts. Weekly intervals stop at the study end.
Collection includes both partial calendar days when the requested window starts after midnight.
The raw cache is outside the repository. [Aggregate receipts](landing-speed-measurements.json)
record coverage and the pilot; uncached auxiliary workflows mean runner cost is a lower bound.
Partial-rerun aliases are deduplicated by actual execution interval, not job ID, to avoid
double-counting concurrency and cost. Cancelled jobs that never received a runner consume no
compute in this accounting. Percentiles use the sorted value at `floor(p * n)`.
The study did not run local browser tests, benchmark a paid provider, prove a full-suite worker
configuration or exercise a production batching system.

Research check: review and simplification were **inline**. Review corrected duplicated rerun
accounting, cancelled jobs with no runner, date-window reuse, and the scope of the cloud-savings
claim. Simplification compacted receipt rows without changing their data. Verification was
**inline**: script syntax,
receipt/percentile arithmetic, matching pilot test identities, and all five targeted repository
gates passed. The pilot completed **204 test executions (M)** without failures, skips or retries.
