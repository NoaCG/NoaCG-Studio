# Reference source inspection and pending execution

2026-10-10. Engineering research only; runtime reproduction is pending.

## Pinned primary reference
Zero Density OGraf Studio source `3142fc7d02934494931eb14e7dc255393e4110d0`, fetched into the existing isolated research clone. Official v0.17 release manifest identifies executed-source candidate `a1e9776120fa19d9f3f9d40ab4b10ae1be034347`. The relevant LayerListPanel, TimelinePanel, InspectorPanel, NumericScrubController and numericScrub files have no diff between those revisions.

Downloaded official Windows server SHA-256: `88836062eab024aac85e5f71400bcf2e198ca09f12447fe4c52ebc1e7473cebd`, matching the published release manifest/checksum. The executable and reference source remain ignored research inputs, outside the product/CLI/export closure. No upstream code is copied.

Inspected paths and source behavior:
- `apps/editor/src/panels/LayerListPanel.tsx`: row selection uses selectMany or Ctrl/Cmd toggleMany; eye calls toggleLayerVisibility. Layer-list names are spans, not inline rename controls. Do not assume the primary reference implements every reported convention.
- `apps/editor/src/panels/TimelinePanel.tsx`: properties can expand without authored tracks and add a property track; layer/key context menus and key selection own separate interactions. Folder double-click renames; Shift range code observed applies to keys on the same track.
- `apps/editor/src/panels/InspectorPanel.tsx`: Name input calls renameLayer without changing its ID; transform inputs expose current-frame values and write layer transforms.
- `apps/editor/src/state/projectStore.ts`: renameLayer changes only layer.name; toggleLayerVisibility changes isVisible on the same layer. `canvas/LayerNode.tsx` returns no rendered node when isVisible is false.
- `apps/editor/src/components/NumericScrubController.tsx`, `numericScrub.ts`, `numericScrub.test.ts`: numeric-input pointer capture, 3 px threshold, one declared step per 2 horizontal pixels, Shift 10x, Alt 0.1x. Preview publishes input events; release publishes change. No Escape cancellation handler appears in the inspected controller. This is a source observation pending runtime proof.
- `apps/editor/src/components/PropertyRow.tsx`: aligned resizable label/value columns, hover help and aria-description.
- `apps/editor/src/state/historyStore.ts`, `historyStore.test.ts`: 500 ms edit bursts coalesce; discrete commands flush before and after.
- `apps/editor/src/state/selectionStore.ts`, `selectionStore.test.ts`: additive layer selection and key selection remain UI state, separate from the project.
- `apps/editor/src/state/editorShortcuts.ts`: input ownership and Ctrl/Cmd Undo/Redo.
- `apps/editor/src/panels/timelinePropertyVisibility.test.ts`: static compatibility channels hide; explicit constant tracks remain meaningful.

Source tests were inspected, not executed. Runtime matches, shortfalls and deliberate NoaCG differences must be recorded after the comparable task, before correction design.

## Execution status
Local transform browser job j-4201 was held below the scheduler 4 GB RAM floor and cancelled before execution. Local baseline/reference probe is queued through the same scheduler. No browser-memory limit or user application was changed.

A disposable manual-only CI probe is prepared in ignored `.noacg/layer-property/research.spec.ts` and `probe-workflow.yml`. It grants only contents:read, verifies the Linux release binary checksum and uploads test-results. Automatic approval review rejected creating/pushing/dispatching this remote probe because it expands remote workflow/binary execution. User approval is pending; no remote probe branch/workflow was created. These local preparations are not passing runtime evidence.

## NoaCG source candidates
Current-main inspection shows the Properties inspector already exposes Position/Layout offset, Scale and Rotation without keys and distinct accessibility names for property animation and current-key actions. Composition and Back to Composition are visible source routes. Canvas additive selection, persistent tools and existing source/session history remain in place.

Candidate gaps awaiting ordinary-route reproduction: Shift layer rows toggle rather than range; artwork rows have no inline rename, eye or layer context menu; Delete is not handled in the canvas/layer selection routes inspected; AnimationNumber is typed-only; the current-key diamond lacks a title; timeline expansion only appears when keys exist. No product fix or runtime pass is claimed yet.

## Smaller second reference
Fetched Eyevinn ograf-editor `616841bd949e3a21137579451123f66c292543f0` into ignored research storage. Inspected `src/components/PropertyPanel.js`, `src/components/TimelinePanel.js` and `test/bugfix-element-id-rename.test.js`. The property panel listens for elementSelected/elementUpdated and updates position inputs without destroying focus. Timeline mirrors the same selection and preserves its scroll positions across renders. Its Element ID rename migrates the model ID and timeline lane, with collision and slug guards. That is a different operation from the requested NoaCG display-label rename, whose stable ID must survive. No Eyevinn runtime interaction or parity verdict is claimed.

## Protected evidence
The source branch contains the completed independent transform comparison through #960/fb3edd49. Nothing in `docs/work-specs/editor-transform-qualification/independent/` or the maintained `e2e/editor-cli-round-trip.spec.ts` has been changed. Their regression assertions and output/source/channel/context contracts remain binding.
