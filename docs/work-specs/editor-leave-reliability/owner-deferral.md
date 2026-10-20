# Owner deferral of #1466 and the Phase 2 acceptance blocker

## Decision, 2026-10-20

The owner instructed the independent checker: “Lets move onfrom this issue. Create a
work around so we can continue working on noacg and not stay stuck on this issue.
We dont need this feature”. This supersedes the earlier instruction that Step 6 must
wait for a successful independent Phase 2 check. It defers further conflicted-copy
feature work and removes that project dependency; it does not accept Phase 2.

The independent verdict remains **BLOCKED** on main
`4e067b65674a9bf0a7632430b5dd0772c03a0331`. The
[immutable independent-12 receipt](https://github.com/NoaCG/NoaCG-Studio/blob/49286d650fdcca44c0b784ac7037fbf2b16ff3f2/docs/work-specs/editor-leave-reliability/independent-12/README.md)
retains the evidence and all earlier qualifications. No PASS is inferred from this decision.

## Operational workaround

Use one active authoring tab on one device per account. Close the account's other
authoring tabs and stop editing on its other devices before starting work. Do not
edit a shared saved graphic concurrently or rely on automatic conflicted-copy
handoff. The working slot is account-wide, so using different graphics in two editors
does not remove the concern.

Before moving work to another device, save on the first device and retain an exported
backup of important work. Close its editor, then open the intended saved record from
Home on the second device and check its contents before editing. A local “Saved”
label alone does not prove that another device received the cloud version. If the
expected version is absent, keep the original and backup; do not overwrite a different
version to force the handoff.

This avoids the concurrent-authoring scenario rather than repairing or disabling it.
There is no new switch, schema change, sync bypass or removal of existing save guards.
The workaround is an operating restriction, not newly executed product verification.

## Narrow reservation release

The Phase 2 checker's shared-path reservation is **released for the already approved
codebase-lean Step 6 cleanup only**, owned by the existing cleanup coordinator in chat
`01a152c8-9a1f-7452-a356-5539c360b642`. No competing cleanup or editor fixer is started.
The coordinator may proceed without a Phase 2 PASS under this later owner decision.

The release covers removal of proven unused old-editor state in
`src/store/templateStore.ts`, unused preview probes in `e2e/_keys.ts`, obsolete callers
in `src/components/home/sections/LooksSection.tsx`, `scripts/acceptance-pack.mjs` and
`e2e/import-canvas.spec.ts`, and the approved old-editor CSS audit/removals. Resolve
actual paths against current main before editing. Keep `holdKeyRepeats` and
`parkFocusOffControls` unchanged, and wait for the actual rendered field when replacing
obsolete preview commands. Preserve retained CSS bytes and relative cascade order.
The CSS candidates remain `src/styles/{timeline,timeline-legacy,timeline-switch,
machine-graph,selection,canvas}.css`; mixed `learn.css`, `inspector.css`, `panels.css`,
`editor.css` and `mobile.css` in that directory require preservation of their live rules.

All live selection, history, modal gating, save/sync, assets, account enforcement,
routing, saved graphics/projects and layout/preferences compatibility remain protected.
This grants no broader product change, saved-format retirement or Phase 3 work.
The [codebase-lean spec](../codebase-lean/spec.md) still defines the cleanup's scope,
consumer proof, verification and normal merge-queue requirements.

## Evidence and checks stay binding

- Preserve all 32 carried assertions from #1509 and every maintained assertion,
  helper, case, budget and CI gate. No green retry, reclassification or deleted test
  is authorized to make this decision look like acceptance.
- The fresh nightly [39323236011](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39323236011)
  remains failed: 2,184 passed, one failed, one existing platform skip, no retries.
  `editor-arrangement.spec.ts` failed in setup before its resize assertions. A helper
  diagnosis is proposed in the independent receipt, not proved or repaired here.
- #1517's claimed 20 fresh release passes remain unsupported; only one post-entry
  quarantine run preceded its release request. Classification does not prove a repair.
- #1498 stays open, original CI `39250656173` stays failed, #1506 stays closed, and
  ineffective historical probes stay ineffective. #1466 remains open as deferred work;
  this decision does not close it as fixed.
- New work must pass its own applicable checks and authoritative CI. An actual CI
  failure still needs its own bounded diagnosis; deferring this feature does not waive it.
- Existing browser engineering proof does not establish native/physical-host or owner
  acceptance. No further acceptance campaign is launched by this deferral.

## Verification of this decision record

The fresh worktree started at the pinned main above. The activity audit found no active
repair source edits; the existing Step 6 coordinator was idle and waiting for release.
Only documentation changes implement this decision. Product source, tests, workflows,
quarantine state and limits are unchanged. The published receipt remains immutable.

Inline review and simplification covered these four changed decision documents against
the pinned main. All five reached gates passed (contract freshness/citations, docs
index, client-secret scan and copy); relative Markdown links and `git diff --check`
also passed. The first restricted-shell gate invocation stalled in `git check-ignore`
and was cancelled without a verdict; the supported granted-shell execution completed.
No browser run or production build is required for this documentation-only decision.
