# Independent review reconciliation

The owner supplied an independent review on 2026-10-17. Its container could not read the
report/archive, so it independently audited main `6cd6f3059`; it did not validate this report's
manifest. Current follow-up main is `ea71261c9`. No original source deletion candidate or
old-helper spec changed between those pins and the original baseline.

## Accepted changes

- The original analysis proved the transitive skip mechanism, but treated it as a retirement
  decision. The owner now explicitly accepts keeping #800 for live-product subjects. The
  broad 474-case deletion draft and its 30,244-line source/test forecast are withdrawn.
- Preserve SystemNoticeBar and backend/systemNotice pending the admin decision: admin still
  publishes `public_system_notice`. A disconnected consumer can indicate a feature gap.
- Keep machineEdit/lottieInsert and current runtime/schema protection. No fixture replacement
  solely to move lines out of src is required. MachineGraph UI can still be retired.
- Use a seven-source-file first PR, with no test-body, state, routing, saving or CSS changes.
- Name header, copy-baseline, active rule identity, contract-evidence and architecture updates
  per PR. Retire contract rules; do not delete their files. Keep no-old-editor's rule identity.
- Resolve remaining #800 cases during the cleanup run, before old helper deletion and before
  declaring completion. Retire obsolete/duplicate cases with evidence; do not port every walk.

## Corrections to the independent review

- The named source set excluding both notice files is **27 files / 10,760 lines**, not 29 /
  10,875. The two retained notice files account for 115 lines.
- pasteboard.spec.ts has five declarations. All skip through createProject, directly or via
  createHairline. Three contain imports of pasteboard.ts, but those calls are not live coverage.
- The 20-file UI starting list totals **4,561 lines / 0.268 spec-minutes**. Some files still
  contain live subjects: flows includes export/wizard behavior; images includes logo handling
  and ZIP structure; ux includes validation and wizard presets. Its own subject rule therefore
  requires case review rather than blanket deletion of those files.
- format.spec.ts's four pure formatter cases also skip through enableAdvancedMode. The first
  audit correctly detected the skip, but these remain current behavior under the revised policy.
- Its 467/34/42 test estimate and the original 474/36/41 are different static methods. The
  original evidence gives a reproducible AST inventory, all case identities and helper chains;
  neither is a Playwright-expanded runtime count or a policy decision.
- The existing report already retained Monaco, catalog templates, CanvasGuides and shared CSS,
  and claimed neither bundle savings nor dependency removal. These protections continue.
- “Zero product risk” is not supported. Use the normal review/build/CI gates. Full local suites
  and unadmitted builds remain outside the owner's constraints.

## Fresh concurrent work

Harness-ladder L0 landed in #1389, on CLI/skill/benchmark paths. Editor #1391 then landed a
save transaction repair affecting templateStore, saveActions, router, durableStore, project,
library and wizard walkState; it carries an additive reservedGraphicId and the eight legacy
skips in its maintained selection. The independent checker status is separate from that merge.
Keep these paths and carried test receipts reserved until their phase releases them. The
first seven deletion files remain disjoint, but every implementation PR must recheck main and
other worker allocations; this is a snapshot, not a permanent reservation.

## Authority

The owner's latest instruction accepts retaining #800 and asks to resolve it within the planned
cleanup, while prioritizing simple code over “just in case” retention. It also asks to measure
admin weight before deciding its future. It does not authorize deletion, posting issue changes,
creating a routine or launching a plan run. The spec records these limits and the next decision.
