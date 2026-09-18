> Current status, 2026-09-18: the owner now authorizes commit/push of the planning package
> for second opinion. Earlier uncommitted-only instructions below are historical. Product
> implementation remains on hold. Start with the [review brief](../research/editor-review-brief-2026-09-18.md).

# Editor plan consolidation

2026-09-17. Branch `codex/editor-baseline-design`, worktree
`C:/Users/ahonemi/.codex/worktrees/editor-baseline-design/NoaCG-Studio`, base
`49a2f31ee72a6ebc938b03639355b9a5e92e8b09`. Planning and evidence only, deliberately
uncommitted for owner review. No product implementation, merge or queue declaration.
Do not edit the separate frozen `codex/editor-unified-roadmap` worktree.

## Read first

1. [EDITOR_PLAN.md](../EDITOR_PLAN.md): the only authority for scope, order and completion.
2. [Animation mechanisms](../EDITOR_REBUILD_PLAN.md) and
   [collection mechanisms](../STARTER_COLLECTIONS_PLAN.md).
3. [Acceptance ledger](../research/editor-acceptance-register-2026-09-17.md): E01-E24 and
   B01-B18 retained, unmeasured tasks assigned to slices without marking them passed.
4. [Revised mockup](../research/editor-consolidated-proposal-2026-09-17/README.md).
   Its rendered HTML opens locally; screenshots include SVG editing and the branded gallery.

## Current decisions

- First implementation journey, only after authorization: Illustrator SVG -> existing import
  wizard -> Edit -> real imported layers/groups -> base edits and keyframes -> scrub, undo,
  save/reopen and export. Use actual wizard output. Preserve gradients/clips/appearance in R1.
- R1 also completes everyday animation, bounded AI/CLI round-trip and the visible template
  gallery, Home brands, selected Starter set and production rundown installation. It replaces
  the default editor only after human acceptance. R2 adds Lottie/paint/effects; R3 adds structured
  live data and full paired co-authoring. R1 alone is not full Studio parity.
- No node editor or States tab in this rebuild. Preserve code, schemas, regression tests and
  [lessons](../research/editor-node-editor-deferred-2026-09-17.md). Editor authors reveal motion;
  playout triggers it. Take/Next/Out in the editor is local rehearsal. P2 is not cancelled.
- Permanent canvas, professional docks and property tracks; no global Layout/Animate mode.
  Per-property stopwatch and diamond with explicit base/key scope. Five ease choices.
  Optional Code stays beside the canvas; Monaco is not a release requirement.
- Keep canonical source, interpreter/export/assets and sound editing seams. Replace deficient
  workspace/gesture/timeline/preview interaction as specified. No product code changed here.
- Read Studio source as reference; current decision is to write our own small helpers.
  Exact candidate/licence research is retained. Do not silently import third-party runtime.

## Consolidation

Old roadmaps/research/timeline plans are redirected to the master plan. Their full content
is archived under `docs/research/editor-consolidation-2026-09-17/` with supersession notices.
Runtime/schema/SVG research stays in place with a current-direction notice. Programmes,
goals, docs index and backlog references now agree. Backlog identity metadata is retained.
Earlier handoffs are historical; they do not grant implementation or queue permission.

M0 is closed as an inventory/classification, not a product pass. Paired B02-B07, nested
transforms, input-to-pixel instrumentation, blank-stage reproduction and real human/host
acceptance still need the assigned R1 slices. The owner must explicitly resume implementation.

## Verification and continuation

Mockup job j-1337 exited 0 with 27 checks and no runtime errors. Layouts at 1920/1366/1024/320,
dark/light screenshots, direct seek, Next, local loop, per-property scope/undo, template
categories, brand/set selection and distinct screen/logo previews were checked. This is a
bounded design prototype; no product B task passes because its illustrative interaction works.
Earlier failing layout pilots and limitations are recorded in its README.

Build j-1333 stopped at the goals line-budget check (201 versus 200), before the full test
suite. The editor summary was shortened without changing the cap. Replacement build j-1336
exited 0; its full log and final verification receipt are in the revised-mockup evidence. The link/coverage audit has no missing local
document targets, all 24 E and 18 B identities, and all five preserved node artifacts present.
`git diff --check` passed; changed/untracked project files are under `docs/` only.

Next: owner reviews the consolidated scope and mockup. Keep work uncommitted until that review;
do not start R1, open a product implementation session, or run `/queue-merge` from the old
Fable instructions. Once authorized, land the planning package through the normal owner-branch
workflow, then take R1.1 as a bounded slice. The preceding uncommitted baseline evidence belongs
to this planning package and must not be dropped.

## 2026-09-18 transform and SVG follow-up

Owner approved the general appearance and requested familiar Adobe transform/key behavior,
clear step creation and careful wizard integration. This does not authorize product work.
The master/mechanisms/acceptance register now include all five 2D transform groups, one first
key at the playhead, disable-retains-current-value, key-side easing, scrubbable values,
+ Step/Edit Out, optional wizard Finish handoff, text exposure and OGraf host acceptance.
Read [comparison](../research/editor-adobe-svg-contract-2026-09-18.md) and
[focused study](../research/editor-transform-proposal-2026-09-18/README.md).
Earlier prototype key semantics are superseded. Existing template/brand/AI scope is unchanged.
Plan remains uncommitted for design review. Implementation remains on hold.

Follow-up verification: j-1342 passed 37 mockup checks; j-1339 build exited 0
(1798 passed, one skipped). Final evidence and prototype limits are in the focused study.
No source/application files changed, and the planning package remains uncommitted.

## Latest owner correction: timeline-first In/hold/Out

Read [timeline-first correction](../research/editor-timeline-first-2026-09-18.md) and the
[new study](../research/editor-timeline-proposal-2026-09-18/README.md). They supersede prior
Add Step/Edit Out forms, mandatory duration selection and no-cross-cue rules. Place flags
at the playhead; show layer bars with move/trim; canvas drags key animated properties.
First acceptance is simple In -> indefinite hold -> Out, with reverse or manually authored
exit keys. Next/additive layers follows; folders/bins and real precomps follow within R1.2.
All accepted wider editor scope remains. No product implementation or commit authorized here.

Timeline-first verification: j-1345 passed 34 preview checks, and build j-1344 exited 0.
Screenshots, limitations and receipts are in the new study. Planning remains uncommitted.

## Final review preparation

Latest canvas study anchors the reverse prompt next to Add Out and demonstrates canvas Text,
Rectangle/Ellipse creation and pointer scale handles. Master, mechanisms and acceptance
include full production behavior; the study's limits are documented. All wider scope is
retained in the review brief. Commit/push this docs-only package; wait for second opinion
and explicit product authorization before implementation or merge queue submission.

Final review checkpoint: build j-1347 passed; browser j-1348 passed 31
canvas/prompt checks and j-1350 passed 34 timeline regression checks. All are local
prototype evidence, not product acceptance. Owner authorized a docs-only commit and push
to `codex/editor-baseline-design` for second opinion. No merge queue or implementation.
