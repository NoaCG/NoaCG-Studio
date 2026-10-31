# Three concurrent plan runs

Status: planning proposal, 2026-10-25. This document authorizes no run or workflow change.
The owner requested a docs-only specification and agreed that a modest slowdown per change
is acceptable if three plans can progress together, with every safety check retained and
delays measured. Implementation and trials require their own reviewed changes and bounded
run authorization. Nothing here changes the active production-page plan, its rows, ledger,
workers, recovery ownership or worktrees.

## Why

The owner currently serializes plans to avoid slowing CI and merging. That prevents useful
work on three separate features. The existing plan-run procedure already permits different
plans alongside each other, but a shared configured-suite dispatch group serializes their
backend verification. File separation alone also misses shared protocol, migration and
deployment dependencies. A successful landing is not the end: each row must independently
pass on its actual merge commit before its dependants start.

Most measured time occurs before queue entry, including design, tests, reviews and waiting.
Rows 26-29 averaged 3.25 hours to PASS; row 30 took 10.63 hours. Across the first 30 rows,
six first checks failed, with 52-182 minutes from failure to final PASS. The median of all
36 check attempts was 39.6 minutes. These intervals overlap Actions execution; they do not
measure active coding or review time. Configured-suite sharding changed during the sample.
See [baseline and source limits](evidence/baseline.md); no saving below is already measured.

## Goal

One owner can run three independently useful plans at once. Each plan can build, review,
verify and land without an unrelated plan replacing its required test result or consuming
its repair ownership. Report both time for each change to reach independent PASS and total
independently passed changes per elapsed hour. Accept modest contention, identify its cause,
and preserve integration safety. Later, a large plan can be prepared as a few independent
tracks using the same machinery.

## Non-goals

- Ten contributors, ten simultaneous plans, or a guarantee of zero contention.
- Paid services, larger runners, extra infrastructure or subscription upgrades. The owner's
  fixed envelope is public GitHub Team, standard runners, unlimited minutes, 60 concurrent jobs.
- A replacement scheduler, a global agent manager, a second ledger, or a remote test database.
- Weaker tests, changed assertions to obtain green, extra retries, raised time limits, automatic
  advisor acceptance, reduced independent checking, or changes to merge-queue protection.
- Activating verification reuse or batched main validation through this proposal. Their existing
  qualification and owner requirements remain binding. No new suite-budget investigation.
- Product implementation, new plan launches, or changes to the running production-page plan in
  the docs-only landing. Do not register this proposal as a runnable plan yet.

## Decisions and reversal

### D1. Three separate plans first

Use the existing supervisor, one project identity and authoritative ledger per plan, separate
owned worktrees, and one current coordinator per project. Each retains fresh builders,
independent checkers, finite authorization, provider qualification and recovery. No global
lock may serialize independent builders or checkers. A plan's next dependent row still waits
for its predecessor's PASS. Qualify enough native worker capacity for three concurrent roles;
roles can be builders, checkers or repairs, and a waiting builder cannot prevent its checker
from running. Qualify isolated cloud execution resources; three subagents sharing one VM do
not establish three cloud workers. Do not silently change models, providers or subscriptions
to obtain capacity.

Before opening the trial, coordinators record a small compatibility table in its preparation
evidence: plan IDs, owned paths, shared contracts, migration ordering, test isolation, required
cross-plan PASS receipts, and the owner of every shared edit. Inspect current projects/PRs,
not only local worktrees. Use existing collision and activity checks as evidence, not as a
distributed lock. Serialize a genuinely shared change or land its foundation first. Different
files that implement the same protocol are not independent. Use separate phase evidence files
so unrelated rows need not append to one shared document.

If ownership changes, reconcile it before the next launch. On a cross-plan defect, pause the
affected dependants and repair under the existing owner; unrelated work can continue only if
its safety is established. On an unresolved shared-main failure, use the existing failure
procedure and withhold dependent admission, never invent a green exception.

**Reverse:** stop new admissions in the additional plans through their existing pause route;
checkpoint in-flight work and retain PR repair owners. Resume serially under the same project
identities. Do not terminate useful work or reset ledgers to improve a trial result.

### D2. Give required verification an identity that survives parallel work

Correct the non-push `shared` group in `configured-suite.yml`. An unrelated candidate must
neither serialize nor replace another candidate. Identify requests by exact tested source,
workflow/configuration, inputs and purpose; preserve per-merge results on main. Keep scheduled
validation separate from candidate dispatches. A mutable branch name alone is insufficient
evidence of what ran. Compare requested and checked-out SHAs and reject a mismatch.

Preserve cancellation of superseded ordinary PR CI. Do not extend that policy to required
exact-merge checks or cancel evidence a checker still needs. Duplicate dispatch suppression
is outside this phase: the existing verification observer stays observation-only. Keep its
uncertain-delivery reconciliation and retry bounds. Record redundant requests and costs until
the separately authorized enforcement procedure is qualified.

Audit `ci.yml` too: `cancel-in-progress: false` on the shared main-ref group does not by itself
protect older pending runs from replacement. The first rollout may retain the existing exact-SHA
recovery dispatch when a required main run is superseded, but one acknowledged coordinator must
own it, record the missing run, observe before dispatch, and obtain a complete exact-SHA result.
Measure the recovery delay; do not substitute a descendant's green result. Change main grouping
only in a separately reviewed, measured scheduling fix if those recoveries are material.

**Reverse:** revert the scheduling change through the merge queue, after required in-flight
verdicts are reconciled. Return to serial candidate validation while it is repaired. Never
mark a cancelled or incomplete run as passed to complete the rollback.

### D3. Improve review convergence without reducing scrutiny

Fulfilled by cicd-improvement phase ci02: the canonical guidance is "Review checkpoints" in
`docs/plan-runs/known-traps.md`, which every plan-run brief template links. The text below is
kept as its source.

For ordering, ownership, retries or recovery work, the row brief states the invariants before
implementation: attempted versus accepted versus observed operations, unknown outcomes,
other writers, identity/revisions and reload behavior. A small executable reference model is
appropriate when these transitions are the feature; derive it independently from the contract,
not by copying the implementation. Split a large feature at complete behavioral boundaries,
not arbitrary file or line counts. Inactive foundations must preserve existing behavior until
their consumers land.

When a finding exposes a product decision the spec never made, obtain the decision under the
existing owner/coordinator policy before patching toward an invented answer. When two successive
confirmed assessment rounds expose new variants of the same invariant, reassess the boundary
assumptions independently before another patch round. This warning grants no extra attempts
and never permits ignoring a third finding. Infrastructure errors receive infrastructure diagnosis.

Keep frequent commits and required remote checkpoints. Request one review per revision and
scope while it is outstanding, collect related findings, and push coherent verified repairs.
Avoid full configured dispatches for intermediate work already known to require another repair;
run affected checks for useful feedback and every required final verification. Do not impose a
ten-minute push timer, a review-count quota, or a timeout that silently treats a review as clean.
Use the existing worker/review recovery procedure for a stalled request.

**Reverse:** revert the scoped brief/check guidance. Keep all discovered invariants, regression
cases and independent acceptance requirements. No change to runtime attempt budgets is needed.

### D4. Preserve the independent check after landing

The checker starts fresh, checks all criteria on the actual merge SHA in their required
environments, and waits for that SHA's required Actions evidence. It may use existing valid
Actions receipts rather than requesting duplicate work, under current verification policy;
the builder's assertion is never its behavioral verdict. Exactly one repair owner stays through
post-landing results, including base conflicts. Multiple plans need concurrent checker capacity,
not a single shared checker queue. Pre-merge model assessment supplements this gate.

**Reverse:** this is the current safety boundary and is not relaxed by rollback. Moving deep
independent acceptance before merge is deferred; it would require a separate design for proving
the integrated result, and is unnecessary to qualify three plans.

### D5. One backend-test implementation, wherever a worker can execute it

After the concurrency trial, extract the existing configured-suite bootstrap and verdict rules
into shared tooling called by Actions and qualified cloud workers. Start with two suitable
Claude cloud rows because historical Docker receipts exist there. Capability is measured on
the executing worker; a provider name is not proof of Docker, network, memory or disk access.
Use Actions where the local stack is unavailable, including currently unqualified Codex workers.

Use the same pinned CLI as Actions and disposable local credentials. Verify daemon readiness,
registry access, ports, schema/migrations, default privileges, grants, realtime publication and
authentication. Reject hosted URLs, fallback credentials and stale servers from another checkout.
Initially use one stack and one browser job per worker, and retain configured tests' current
worker setting. Cleanup targets only resources created by that worker.

Run only the affected configured selection within verify.md's existing five-minute small or
single twelve-minute broader allowance. Report cold bootstrap and complete feedback time
separately; do not hide startup outside the benefit calculation or bypass command bounds.
Selected execution needs a selected-test manifest and expected counts/skips derived from that
selection, not the full-suite floor. Missing reports, unexpected skips, failed prerequisites
and fail-then-pass results retain their current failure/quarantine meaning. Full required
Actions verification stays in place. This is earlier feedback, not replacement coverage.

**Reverse:** disable the worker caller and use Actions. If shared extraction itself causes
regressions, revert it as a unit to the previous workflow implementation. Preserve the test
contract, coverage and recorded failed trial results.

### D6. Discover predictable advisor findings before landing

The current advisor script queries a hosted project; calling it before a migration does not
test the proposed schema. Trial pinned local catalog checks or the applicable Supabase Splinter
lints against the isolated migrated stack for the function-exposure classes encountered in
rows 1 and 10. Compare their normalized findings and intentional exceptions with existing
post-land receipts; schema exposure settings and hosted-only differences must be explicit.
Never copy account-wide tokens into PR CI or automatically accept a baseline finding.

Keep live post-land advisors authoritative. Start as reported evidence, then gate only the
classes proven faithful by historical defect replay and three paired local/hosted receipts.
Do not claim full advisor parity because two classes match.

**Reverse:** revert the additional pre-landing check; keep live advisors and the recorded
exposure decisions. Do not revise the baseline solely to make the trial pass.

### D7. Split future plans at proven independence boundaries

Prepare shared foundations first, then two or three separately runnable child plans, then an
integration/acceptance phase. Give each child complete criteria, file and contract ownership,
and its own existing project identity. A parent preparation document names dependencies and
the exact PASS/merge receipts needed at each join; it is a map, not another mutable run ledger.
Existing coordinators read those receipts before admitting dependent work. No inferred PASS
from a merged PR, worker completion, or another plan's latest green tip.

Keep rows serial within each child initially. Total active tracks across all plans stay within
the three-workstream trial envelope; splitting three plans does not launch nine tracks. If
current admission cannot represent a required join, keep that boundary serial and separately
specify the smallest supervisor extension. Do not claim arbitrary dependency-graph scheduling
already works. The final integration checker verifies the combined behaviors, not just each
child's individual receipts.

**Reverse:** execute the same child plans in dependency order; preserve their criteria and
identities. No product change or scheduler replacement is required to return to serial work.

## Measurement and trial

Reuse supervisor events, PR timelines, Actions jobs/reports and verification-observer output.
Store the trial report beside this spec; use each plan's existing ledger for live ownership.
Record plan/row, provider, work category, source/base/head/merge SHAs, workflow revision,
selected tests, run/attempt IDs, review request/result times, launch/land/check/PASS times,
failure families, conflicts, repairs and external waits. No agent transcripts or secrets are
needed. Report missing timestamps as unknown; do not derive active work from commit frequency.

Separate these measures; overlapping intervals must not be added as exclusive work:

| Measure | Definition |
| --- | --- |
| Change completion time | First builder launch to final independent PASS, including repairs and waits |
| Completed work per hour | Rows reaching independent PASS divided by the fixed cohort's elapsed window; also list unfinished rows and their ages |
| Review delay | Request to completed result for a revision/scope, plus repeated requests and confirmed finding families |
| CI delay | Dispatch to workflow/job admission, dependency/concurrency wait where observable, eligible-job runner wait, setup, execution and report aggregation separately |
| Landing/check delay | Ready final head to queue entry; queue entry to merge; checker launch to verdict; merge to required results; exact-SHA recovery delays |
| Shared resource cost | Runner-minutes including cancelled/failed attempts, peak running jobs, provider admission waits and local bootstrap cost |
| Safety and rework | First-check failure rate, product escapes, missing required verdicts, conflicts and repair time; no erased or reset failures |

If GitHub does not expose when a job became eligible, label the interval an upper bound on
runner wait, not a runner-capacity measurement. Compare overlapping jobs and dependencies before
attributing delays. Count defect detection separately from the time spent fixing it.

### Baseline and thresholds

The historical 30-row median is 2.70 hours and mean is 3.50 hours. For the smaller comparable
rows 26-29, mean completion is 3.25 hours, giving a serial reference of 0.31 rows/hour.
Three identical independent streams with no contention would yield 0.92 rows/hour. That is
arithmetic, not a prediction. The original ten-contributor scenario is not an acceptance target.

Before the live trial, freeze its cohort and observation-window end, and a recent post-sharding
serial baseline of at least 12 completed
rows and all unfinished eligible rows in the same observation window. Stratify by extraction,
feature and backend/stateful work; record changed CI/provider configuration. If fewer comparable
rows exist, report that limitation and keep results provisional rather than mixing pre-sharding
timings or manufacturing additional baseline work. Historical row 30 remains visible as a tail
case; do not quietly exclude difficult rows from either arm.

Proposed operational thresholds, not new safety exceptions:

- Three plans each complete at least four rows, with overlapping active work and at least two
  simultaneous candidate-verification requests demonstrated. No plan is starved by the other two.
- Cohort completion rate is at least twice the matched serial rate, and each represented work
  category's median completion time rises by no more than 25%. For the 3.25-hour reference alone,
  this would mean at most 4.06 hours and at least 0.62 passed rows/hour; recompute against the
  frozen contemporary baseline. Report p90/max and each plan separately so averages cannot hide
  one blocked plan. With small cohorts these are operating signals, not statistical proof.
- Keep the existing queue-to-land p50 <= 10 / p90 <= 20 minute targets and all existing test,
  detection and attempt bounds. Any new missing required verdict, unsafe admission or duplicate
  repair owner stops the affected trial immediately. No increase in escaped defects or first-check
  failure rate may be dismissed as the price of speed; investigate before expanding the rollout.
- If timing thresholds fail, identify the responsible interval and make one bounded correction
  before repeating the affected measurement. If still outside bounds, pause additional admissions
  and report what is needed. Do not obtain better averages by cancelling slow rows or weakening gates.

### Trial order and observable acceptance

These are future implementation phases, not additions to the active production-page run.
Every implementation phase uses /check and /queue-merge with an independent acceptance receipt.

| Phase | Acceptance and measurement | Rollback |
| --- | --- | --- |
| P0: preparation and baseline | AC-1: pin the cohort, workflow revisions and current merge rules; publish the compatibility table and timing definitions above. Qualify three native roles with bounded launch/status/result and ownership receipts. No production-plan mutation. | D1 |
| P1: candidate dispatch isolation | AC-2: three different candidate SHAs dispatched together all produce attributable complete verdicts; none is replaced or blocked by another's concurrency key. Exercise a moved branch, scheduled validation and superseded candidate; missing reports and mismatched SHAs fail. Every required merge result remains obtainable, including the existing exact-SHA recovery path. Preserve observer mode and required checks. | D2 |
| P2: three-plan trial | AC-3: after a short two-plan operational smoke, admit the third and measure the cohort against the thresholds above. Each plan completes four rows and every acceptance result links to its merge SHA. Show independent progress, bounded provider/CI waits, no cross-plan account interference, acknowledged repair ownership and a controlled pause/resume. Publish actual before/after values and all unfinished work. | D1 |
| P3: review convergence | AC-4: trial D3 on two suitable risky rows, then report ten comparable risky rows before claiming improvement. Record invariant/decision changes, repeated finding families, review delay, branch duration, CI consumption and first-check outcomes. Seek 25% lower median pre-queue time, with all normal review and acceptance retained; two rows prove feasibility only. | D3 |
| P4: earlier backend feedback | AC-5: two suitable cloud rows, three cold fresh-worker starts and three warm starts; no manual rescue. Replay a known configured defect and broken grants/auth/realtime prerequisites. Selected local and Actions verdicts agree on pinned sources with complete reports and unchanged bounds. Target at least 25% lower median commit-to-verdict time for equivalent selections, including bootstrap; report cold and warm results separately and reject a claimed benefit supported only by omitting setup or comparing against a full suite. AC-6: reproduce historical row 1/10 exposure findings before landing and compare three paired local/hosted receipts before gating the proven classes. | D5, D6 independently |
| P5: future plan decomposition | AC-7: prepare one future plan as foundation, independent children and integration. Demonstrate two children progress concurrently after foundation PASS; inject a failed or missing predecessor receipt and prove its dependant cannot start. Combined integration criteria pass. Existing supervisor remains the authority; unsupported joins stay serial pending a separately reviewed extension. | D7 |

P0-P2 establish the owner's immediate outcome. P3-P4 improve feedback after its costs are known;
do not make three concurrent plans depend on building a local stack. P5 is a subsequent pilot,
not permission to partition or reorder the running plan. Select actual future plans and finite
windows at trial admission from current owner-authorized work, not from stale backlog guesses.

One-row read/plan lookahead is deferred until these measurements exist. Its maximum useful
overlap is the smaller of preparation time and predecessor check duration, minus discarded
preparation. It cannot remove an entire check interval when preparation takes ten minutes.
If later trialled, keep implementation behind predecessor PASS and reconcile upstream repairs.

## What happens at larger scale

Three plans are not three Actions jobs: each PR, merge group and main validation can fan out
into many jobs. The supplied sample estimates about 832 runner-minutes per ordinary change,
including branch, merge and main work; at three streams and 3.25 hours/change that averages
about 13 occupied runners. It omits some workflows and repairs and is not a capacity guarantee.
Three fifteen-shard matrices already request 45 jobs before other work. Bursts, provider/review
capacity and semantic dependencies can delay work well below the average 60-job ceiling.

First remove the known shared dispatch bottleneck. Then use measured waits to choose any next
change. Do not increase merge limits or add another admission service speculatively. The live
ruleset at preparation allows five builds and five merge entries, ALLGREEN, with a minimum of
one entry and two minutes' wait. These settings are retained. Beyond three streams requires a
new capacity measurement; ten-stream arithmetic in the baseline is a stress scenario only.

## Verification of this docs-only change

Acceptance is a coherent proposal containing the owner's three-plan scope, reversible decisions,
current evidence with limitations, the phased trial and observable measurements, while preserving
all safety and the active run. Review the proposal against the linked procedures and the three
supplied independent opinions; run changed-file documentation gates and link/path checks. No
product build, browser suite, cloud-stack experiment or parallel plan is required to verify prose.
The future phase criteria above are unexecuted until their own evidence is recorded.
