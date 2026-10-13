# Source comparison and intended differences

The builder freshly cloned both references inside its ignored `.noacg` directory. The exact
pins and file hashes are in [provenance.json](provenance.json). No reference source is copied
into the product or published evidence.

## Zero Density Studio

Pin `3142fc7d02934494931eb14e7dc255393e4110d0`; official v0.17 release source
`a1e9776120fa19d9f3f9d40ab4b10ae1be034347`. The freshly downloaded official manifest hashes to
`8de3340f9f8a030f6b46fb5e1ca334a4228f669ccd6e6cc70b7f9b78268e3c52`. All eleven inspected files
are byte-identical at the pin and release. Runtime verification downloads the official Linux
server and requires SHA-256 `9ba1de317cdc8380c38a694f1d201964d7b805833597419111dab9eea9a02681`.

- `state/editorShortcuts.ts` routes Ctrl/Cmd+D into `duplicateLayerSelection`, a discrete
  history step around `projectStore.duplicateLayers`, then selects the minted IDs. Ctrl/Cmd+A
  obtains selectable composition IDs. It protects interactive targets and modal dialogs.
  `editorShortcuts.test.ts` checks clipboard preservation, input/modal ownership, history,
  repeated keys and stale selections. `layerEditing.test.ts` covers nested groups, masks,
  fresh instance/field IDs and paint order.
- `projectStore.ts` expands selected object/group roots, uses `appendLayerCopies`, and emits
  a new project through Zustand. `Stage.tsx` derives visible poses and `LayerNode.tsx` renders
  them. The NoaCG equivalent remains readable-source operations with existing reference
  checks, atomic batches and session-selected copy IDs.
- `LayerListPanel.tsx` maps Ctrl/Cmd clicks to toggles and plain/Shift clicks to a selected set.
  `selectionStore.ts` keeps editor selection apart from project source; its tests check
  toggle sets and distinct keyframe primary selection. NoaCG retains its existing Shift
  ranges and timeline-owned layer list.
- `Stage.tsx` Moveable drag callbacks update a transient DOM transform/live selection pose,
  then `updateLayerTransform` commits at the current frame. Shift constrains; no Alt copy
  path is present. The canvas context menu invokes the same explicit duplicate command.
  NoaCG adds Alt-drag duplication while retaining Alt-click hit cycling and Alt-scale pivot.
- `InspectorPanel.tsx` exposes transforms through `writeUiLayerTransform`. NoaCG keeps its
  separate Scale and box-size controls, armed/base routing and static Anchor decision.
  Property shortcuts reveal those existing controls; navigation does not author keys.
- `historyStore.ts` flushes discrete duplicate commands separately while ordinary changes
  otherwise collect in 500ms bursts. NoaCG preserves one completed gesture per transaction
  and exact cancellation instead of adopting the reference's coalescing policy.

## Eyevinn ograf-editor

Pin `616841bd949e3a21137579451123f66c292543f0`, package 1.0.0. Runtime verification installs
its committed lockfile and serves that exact checkout with its Vite dependency.

- `VisualEditor.js` owns one selected element. Mousedown selects and starts a drag/resize;
  mousemove calls `updateElementPosition`, which mutates `OGrafTemplate.updateElement`,
  renders the element DOM and dispatches `elementUpdated`. Mouseup persists through
  `TemplateManager.saveToStorage`.
- `PropertyPanel.js` listens for selection and live geometry updates. Property change
  events route through `updateSelectedElement` to the same model/render/storage path.
  Geometry inputs use integer conversion. Delete and Escape are the only artwork keyboard
  actions; editable controls are excluded. There is no artwork duplicate or context-menu
  action in the inspected implementation.
- `bugfix-propertypanel.test.js` protects colour fidelity. `bugfix-element-id-rename.test.js`
  checks explicit ID rename across timeline lanes without renaming operator tokens.
  NoaCG's label rename intentionally preserves existing source IDs and field keys.

Upstream unit suites are inspected, not executed. Runtime receipts are reported separately;
source inspection alone is not a functional verdict or whole-editor comparison.

## Executed comparison

[CI reference run 38429040294](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38429040294)
passed three tasks with one worker and zero retries on October 13. The builder inspected
both interaction screenshots and their JSON receipts. Runtime details are retained in
`reference-runtime.json`; images remain in the CI artifact and ignored local evidence.

Studio: Ctrl+D creates new IDs; undo removes the copy; redo restores those same IDs;
Ctrl+A selects both. Input-focused Ctrl+D leaves the layer count unchanged. Canvas right-click
exposes Duplicate. Alt-drag moves X from 100 to 167 with two layers before and after, without
copying. The separate cumulative task edits text to Leila Moreno, writes X at frames 0/12,
saves native .ogs, reopens through its file-input fallback and retains source IDs and tracks.
Ctrl row selection adds; Shift replaces with one row. Escape during its numeric scrub retains
the changed value (244 to 261), unlike NoaCG's exact cancellation. Layer-list context remains
absent even though canvas context exists.

Eyevinn: a Custom template starts with one text element; Add Rectangle makes two. An initial
probe incorrectly assumed an empty Custom template and stopped before interaction assertions.
The corrected task edits rectangle X to 300, preserves it under input-focused Delete,
observes no Ctrl+D copy, and moves the original to X 393.913 by Alt-drag. It exposes no canvas
context menu. Reload preserves both elements. Its short laptop view requires property-panel
scrolling; NoaCG intentionally retains the separately scrollable inspector and timeline.

These are builder comparisons, not independent checking or owner acceptance. There is no
reference Alt-copy feature to claim parity with; NoaCG's copy contract is verified directly.
