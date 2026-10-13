# Lifecycle comparison

Fresh clones were inspected in this phase's ignored directory. Exact revisions,
file hashes and Studio release equivalence are in [reference-source.json](reference-source.json).
No upstream implementation is copied into NoaCG.

## Zero Density Studio

Source `3142fc7d02934494931eb14e7dc255393e4110d0`. The nine inspected files are
byte-identical to official v0.17 source `a1e9776120fa19d9f3f9d40ab4b10ae1be034347`.
The runtime download is verified against SHA-256
`9ba1de317cdc8380c38a694f1d201964d7b805833597419111dab9eea9a02681`.

`panels/Menubar.tsx` asks a native confirmation before New, then calls
`projectStore.newProject`, resets history and clears selection. Open reads a
native file and loads it without the same confirmation. Remote Open asks after
downloading. Save calls `fileIO.saveProjectToFile`, which captures a snapshot,
certifies it and writes a native file, with the documented download fallback.
`projectStore.loadProject` migrates the document and resets timeline and clipboard
state. `Stage.tsx` and `LayerNode.tsx` render the changed project. `useAutosave.ts`
separately saves the working project after 500 ms. `fileIO.test.ts` checks remote
read failures/limits; `projectTimelineSync.test.ts` checks load/New reset and
autosave startup; `projectStore.test.ts` checks project creation. Upstream unit
suites were inspected, not executed.

The fresh runtime task entered text, cancelled New, saved native source, changed
the text, accepted New, checked that the saved file was unchanged, and reopened
that file with the original wording. It passed in the baseline reproduction run
[38445327031](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38445327031).
The screenshot of the reopened source was inspected. Automation uses the
documented download/file-input fallback, not an OS file-picker claim.

NoaCG deliberately asks Save / Discard / Cancel before leaving the editor and
keeps explicit named library Save separate from the working slot. Studio's New
confirmation has no inline Save choice and is not a dirty-state-specific prompt.
Its direct file Open is not evidence for NoaCG's stronger pre-navigation contract.

## Eyevinn ograf-editor

Source and executed checkout `616841bd949e3a21137579451123f66c292543f0`, using its
committed dependency lockfile. `main.js` creates a template through
`TemplateManager.createTemplate`; that method immediately saves the library.
Selecting a template calls `setCurrentTemplate` and refreshes the editor,
properties and preview. `VisualEditor.js` and `PropertyPanel.js` update model
elements and call `saveToStorage`. `TemplateManager` serializes every template
plus current selection to localStorage. Explicit Delete confirms, removes only
that record, persists and refreshes the views. `bugfix-model-io.test.js` checks
storage-error reporting and corrupt storage; `ograf-lifecycle.test.js` executes
the exported OGraf component. Upstream unit suites were inspected, not executed.

The fresh task created two templates, switched back to the kept one, cancelled
deletion of the experiment, confirmed deletion and reloaded with the kept template
still present. The first driver stopped before Delete because that control is
shown only on hover. Adding the ordinary hover step corrected the driver; no
reference behavior or assertion was changed. Both reference tasks passed in the
reference step of [38446367624](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38446367624).

Eyevinn has no equivalent unsaved experiment: creation and edits already belong
to its saved library, so removing one requires explicit library deletion.
NoaCG deliberately retains a draft that can be discarded without creating or
deleting a GraphicDoc. This is a bounded lifecycle comparison, not whole-editor
parity or owner acceptance.
