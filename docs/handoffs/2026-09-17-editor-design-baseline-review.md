> Historical handoff. Continue from [EDITOR_PLAN.md](../EDITOR_PLAN.md) and [the consolidation handoff](2026-09-17-editor-plan-consolidation.md). Earlier ordering is superseded; implementation remains on hold.

# Editor design and baseline review

2026-09-17. Work is deliberately uncommitted on `codex/editor-baseline-design` in
`C:/Users/ahonemi/.codex/worktrees/editor-baseline-design/NoaCG-Studio`.
The user requested mockups before committing and has paused product implementation.
No application source changed. Do not queue or implement from this handoff.

Read `docs/EDITOR_DELIVERY_ROADMAP.md`, `docs/research/editor-design-review-2026-09-17.md`
and its evidence bundle's `baseline-supplement.md`, then `docs/EDITOR_PROFESSIONAL_DIRECTION.md`.
The owner rejected the first mockup. Canvas is always visible; Monaco is optional/deferrable.
Required E19-E24/B13-B18 add professional timeline/Out triggers, Lottie/loops/effects, structured
live data, embedded free basic AI/BYOK and external CLI/MCP co-authoring. Those new cases are
specified, not measured. The professional v2 mockup is awaiting review. No implementation release.

Decisions: keep the readable source/runtime/export/assets/Monaco foundations; substantially
replace the workspace, inspector, timeline and gesture controllers, history and preview
scheduling. Six exact-file Studio editor-only utilities are reuse candidates (229 lines);
the matching AGPL application licence permits a bounded adoption review, not copying code
into the Apache CLI or generated runtime without a separate boundary decision.

Evidence: actual default catalog/SVG routes lack the editor door; SVG production/Take/reload
works. Fixed stress fixture, 120 selections and 40 scrub observations, plus 10 source-changing
drag/Undo/Redo trials per editor per desktop viewport. Final drag source restoration passes;
sampling is diagnostic, not an accepted latency ranking. The linear editor/eased GSAP value
discrepancy is reproduced. Mockup checks pass, and build j-1315 exits 0 (1,798 passed, 1 skipped).
Inspect the raw record limitations and excluded pilots before using any numbers.

M0 remains incomplete: full paired B02-B07 workflows, transformed/nested SVG and branch
preservation walks, trusted input/pixel timing, long tasks/rebuild timing, reverse scrub and
125% zoom, owner blank-stage environment and human walks remain. An owner text question
about the blank-stage reproduction is pending in the task. No result is invented for it.

Next: review the mockup with the owner, finish those baseline items, then obtain the owner's
explicit implementation release. Preserve the existing M0 gate. This planning branch starts
from the earlier roadmap commit 49a2f31e / PR #324; verify that parent's landing before any
future queue operation. The original queued worktree was not edited in this round.

Professional mockup v2: `docs/research/editor-professional-proposal-2026-09-17/README.md`.
Final browser job j-1322 passes 19 assertions with no page errors. The earlier j-1319 pilot
caught key self-snapping and excessive height; both corrected. New scopes remain unmeasured.

Latest clarification: Lubic means Loopic. Its documented Stop begins at `outroFrame` / Outro
Action. The owner-supplied Studio screenshot is the primary spatial reference: chat left,
canvas centre, Layers/Properties right, timeline below. Mockup updated accordingly. Final
job j-1325 passes all 19 checks; build j-1323 passes (1798 passed, 1 skipped, zero failures,
121 test files plus bundle/post-build checks). Prior j-1322 evidence is superseded by j-1325
for the mock layout; neither is a product-editor acceptance. All work remains uncommitted.
