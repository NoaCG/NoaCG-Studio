> Historical handoff. Continue from [EDITOR_PLAN.md](../EDITOR_PLAN.md) and [the consolidation handoff](2026-09-17-editor-plan-consolidation.md). Earlier ordering is superseded; implementation remains on hold.

# Unified editor roadmap: review package

## Outcome and hold

Owner asked to complete the combined plan/baseline before further implementation.
[EDITOR_DELIVERY_ROADMAP.md](../EDITOR_DELIVERY_ROADMAP.md) is the single scope/order/status
entry point: 17 required capability rows, nine milestones with bounded slices, three complete
user journeys and distinct implementation/automation/human/comparison states. Existing detailed
editor and Starter Collections plans now defer to it. P7 and both backlog receipts carry the hold.

No product code changed. Prior PR #323 merged at 2026-09-17T14:11:19Z; this planning branch
starts from `d2f11efedb49bb6faf464f55defaf7d90413be45`. The earlier instruction to continue
brand application is explicitly superseded. A merged plan must not release the implementation hold.

## Baseline evidence and limits

[Baseline receipt](../research/editor-baseline-2026-09-17.md) contains current source findings,
required target/patch examples, proposed protocol cases, fixtures, 11 task scripts and a
performance/visual protocol. It includes committed Hairline source and two inspected screenshots.
The selected title's unarmed X/Y/scale/opacity are dashes, the artwork is small in the stage,
and basic properties compete with filter/3D controls. These are current aided observations.

Existing-contract browser job j-1297 passed 45 tests in 1.3 minutes, no retries. Capture
j-1299 passed two viewport observations in 14.5 seconds. j-1298 failed because the temporary
capture assumed unarmed X already had an input; correcting that assumption produced j-1299.
The temporary capture spec was removed. Both successful jobs used the suite's 50 ms preview
debounce and provide no normal-authoring performance result. No product fix was made.

Full M0 remains incomplete: actual default entry walkthrough, paired Studio tasks, remaining
baseline fixture artifacts, production-configured performance, precise preview/transform
fixtures and owner-machine walk remain open. No first-time-user, benchmark or hardware pass
is claimed. Future unavailable capabilities may be recorded unavailable; M0 does not require
implementing collections merely to measure their current absence.

## Review

Bounded design consultation found an M0 dependency loop, insufficient target examples,
missing collection draft retention and underspecified on-air isolation. Addressed in the
roadmap, baseline and detailed collection plan. Ordinary text/shape/image editing remains
within the earlier basic-editor scope; advanced illustration and arbitrary reparenting are
explicit exclusions for owner review.

Final branch review and simplify are inline: no dedicated callable review/simplify capability
was found. Review scope from `scripts/review-request.mjs` used the base above and only this
branch's documents/evidence; the final handoff and receipt updates are included in the final
scope check. No duplicate runtime, product format or implementation was introduced.

Verification: full `npm run build` completed with its own exit code 0; 1,798 script tests
passed, one skipped, then type checking, lint, bundle/prerender and after-build gates passed.
Docs index and `git diff --check` passed; 38 local Markdown links across the plan/receipt
documents resolved. This verifies the documentation/evidence slice, not full M0 acceptance.
Final review scope is the 13 changed documents/evidence artifacts reported by review-request
against `d2f11efedb49bb6faf464f55defaf7d90413be45`; no product or test file remains changed.

## Continuation

Review the roadmap's capability table, milestone sequence and exclusions with the owner.
Continue the remaining M0 evidence as baseline work, including the owner walk. Do not start
M1-M8 product implementation, brand application or collection construction until the baseline
gate is satisfied and the owner explicitly resumes implementation. This handoff does not
declare the complete planning-plus-baseline request or editor rebuild finished.
