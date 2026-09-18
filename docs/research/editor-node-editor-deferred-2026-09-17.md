# Node editor deferred, existing work preserved

Owner decision, 2026-09-17: no node editor in the rebuilt editor at this stage. It is outside
R1-R3. There is no agreed user workflow for it, so a speculative graph must not become a
prerequisite for importing, animating, customizing or running graphics.

The editor authors visual In/reveal/Out sequences and loops on its timeline. Take/Next/Out
locally rehearse those sequences. Actual cue triggering and show operation belong to playout;
this decision does not specify or authorize a new playout orchestration implementation.

Preserve `src/components/timeline/MachineGraph.tsx`, `src/blocks/machineEdit.ts`,
`src/blocks/animMachine.ts`, `src/blocks/timelineLens.ts`, `e2e/machine-graph.spec.ts`,
[state-machine schema](../STATE_MACHINE_SCHEMA.md), [behavior-authoring findings](../BEHAVIOUR_AUTHORING_RESEARCH.md)
and [earlier failure account](editor-consolidation-2026-09-17/WYSIWYG_PLAN.md).
No source or tests are deleted during planning. Retain stable state IDs, version migrations,
branch scrubbing, legal operator-event checks, finite settling of infinite loops, serialization
and exact undo. Existing behavior-bearing graphics must keep rendering, saving and playing.

The successful mechanisms do not establish a usable visual-logic authoring product. The
earlier investigation found a vocabulary/task-entry problem despite functioning graph
mechanics. A later proposal must name the user's task, show a clear interaction model and
repeat challenge-graphic/user evidence. It may reuse the runtime without reusing the graph UI.

For the future R1 switch, omit the graph/States surface from the new workspace; don't silently
convert existing graphs to a linear timeline or make simple edits damage hidden branches.
Unsupported logic changes stay source-preserving and explicit. The separate P2 research
programme is not cancelled or re-scoped by this editor-specific deferral.
