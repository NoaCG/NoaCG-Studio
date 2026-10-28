# Full planned-run second opinion

```text
Review the complete prepared NoaCG Studio CI/CD improvement run for readiness, safety and likely interruptions. This is a read-only second opinion. Do not implement, open a runtime project, launch workers, dispatch experiments, change settings or touch the production-page run.

Repository: NoaCG/NoaCG-Studio. Plan name: cicd-improvement.
Read the registration PR/branch supplied with this prompt, or current main only after confirming it contains that registration. The preparation branch is codex/cicd-master-plan. Pin the exact reviewed commit and document hashes; distinguish newer main from that reviewed source. If the documents are unavailable, ask for them rather than reviewing an older draft.

Read:
- .agent-workflows/plan-run.md
- docs/work-specs/cicd-improvement/spec.md
- docs/work-specs/cicd-improvement/runbook.md
- docs/work-specs/cicd-improvement/evidence/research.md
- docs/work-specs/cicd-improvement/evidence/opus-review-2026-10-28.txt
- docs/work-specs/cicd-improvement/evidence/run-readiness.md
- docs/work-specs/continuing-plan-preparation/runbook.md
- .agent-workflows/check.md, verify.md, queue-merge.md and cloud-delegate.md
Inspect the existing runner, supervisor, authorization and relevant CI/selector code where needed to verify operational claims. Use the repository's second-opinion procedure; do not modify source or live state.

The owner authorized preparation and registration only. Implementation has NOT been authorized. No finite execution deadline has been given and no runtime project should exist for this preparation. Full production-page completion remains the start gate, including final owner/studio acceptance; starting after software phase 50 was suggested but not approved.

Initial implementation is P0-P4 only, represented by 15 numbered executable rows. AC-1..AC-6 and AC-8 define initial acceptance. P5 batching, P6 automatic reuse and AC-7 are optional follow-ups, excluded from initial completion. The optional worker-backend pilot is also excluded. Selected configured tests on triggered PRs are included; full backend tests remain per landing, and merge groups intentionally skip that selected backend job. Check that this integration risk is stated honestly.

Review the run as if you had to operate it without the original planner. Look for:
1. Missing registration, invalid phase parsing, ambiguous row scope or acceptance, unsupported supervisor behavior, or a mismatch between spec, row details and eventual project metadata.
2. Circular dependencies, oversized rows, incomplete stop/resume rules, or waits that would stall the plan unnecessarily. The runner is serial; it does not implement an arbitrary dependency graph.
3. Whether the two-week audit is timed correctly after the last selection correction, without blocking useful implementation early or falsely passing on elapsed time alone. Can ten risky rows and three four-row plans actually be obtained from separately authorized useful work? No fabricated filler work or silent deadline extensions.
4. Whether the selected backend PR gate, selector safety repairs, scoped-catalog integrity and 24-hour detection protections cover the concrete defects in the earlier Opus review. A midday scoped pass cannot certify cases it never ran. What could still silently pass without testing anything?
5. Whether required exact-merge results survive supersession, moved refs, missing reports and lost dispatch acknowledgements. Are retries, quarantine, culprit attribution and repair ownership preserved?
6. Whether coordinator/worker qualification, finite authorization, native result retrieval, block expiry, durable wakes and recovery survive laptop sleep, reclaimed workers, lost network, competing owners or a fresh session. Separate what source tests prove from what requires live qualification.
7. Collision risks with production work, dependency updates, selectors, workflow files and test fixtures. Can other authorized work continue during the audit without invalidating measurements? Do not treat different filenames as semantic independence.
8. Whether rollback can restore protection without reviving known selector bugs. Are safety increases in PR cost separated from optimization savings? Are product failures distinct from infrastructure waits?
9. Whether initial completion correctly excludes optional AC-7 even though the existing full-record convergence tool lists it as open. No new ledger/framework or fake acceptance flags.
10. Whether the smallest first implementation slice and the whole sequence are practical. Recommend removing unnecessary ceremony or splitting genuinely oversized work, not more speculative infrastructure.

Return AGREE, AGREE WITH CORRECTIONS or DISAGREE. Lead with any launch-blocking issue. For each issue give the exact file/section, a concrete interruption/failure scenario and the smallest correction. List missing owner decisions separately from operational choices the coordinator can make. Provide a corrected order only if necessary, what may run concurrently, and an honest readiness verdict: prepared, executable after named prerequisites, or still structurally blocked.

Do not claim implementation acceptance from this review. State exactly what you inspected or tested and what remains unverified. Return the opinion to the owner for the master planning chat; do not send messages elsewhere or start the run.
```
