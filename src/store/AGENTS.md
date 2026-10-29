# src/store - store contracts

Three stores: **templateStore** (the SPX editor - template + UI state), **videoProjectStore**
(the parallel AI-video editor), and **docKindStore** (which shell App.tsx renders; persisted
via model/docKind.ts). The SPX and video stores are fully parallel - neither imports or
mutates the other; only the wizard flips docKind.

## videoProjectStore.ts

Holds ONE VideoProject + the video editor's UI state, mirroring templateStore's contracts:

- **applyProject(next)** - the undoable choke point (30-cap history). AI results bundle
  tsx + motionPlan + chat turns into ONE snapshot so undo reverts them together.
- **patchSettings / addAsset / removeAsset / setAssetUse** - undoable single applies.
  `setAssetUse(path, use)` records what an upload is FOR (model/imagePurpose.ts) in the
  additive-optional `assetUses` map; `undefined` means composition material, and the map is
  dropped entirely once nothing is tagged - an ABSENT map is the canonical "every asset is
  composition material", so writing `{}` would persist a difference that means nothing.
  `removeAsset` drops the tag with the file, or a stale entry would re-tag the next upload
  that happened to reuse the path.
- **setInputValue(key, value) / resetInputs** - edit the editable inputs (the video Template
  Definition). Consecutive edits to the SAME key COALESCE into one undo checkpoint (a colour
  drag, a headline typed char by char) via a module-level `inputEditKey`; every other mutator
  calls `resetCoalesce()` so the next field edit starts fresh. resetInputs restores every
  value to its default in one checkpoint. The Content panel edits live (VideoContentPanel);
  the preview updates instantly through the player host's set-props channel (no recompile).
- **setSource** - manual typing into the project's live source field (`tsx` or `html`,
  whichever the engine reads - model/videoTypes.ts withVideoSource): NO history snapshot
  (Monaco native undo while focused), clears `future`.
- **appendChat / dropLastChat** - optimistic chat turns without history spam; dropLastChat
  rolls back a failed send.
- **loadProject** - whole-document replace (wizard create / reopen): clears history.
- **autosave** - 800 ms-debounced subscription -> saveCurrentVideoProject; a quota failure
  sets `autosaveFailed` (the shell warns - never lose video work silently).
- **busy** - the in-flight AI stage label; blocks concurrent sends.
- **replayNonce / previewError / activePanel** - UI state, no history.

## saveActions.ts

The SAVE/OPEN semantics over the graphics library (model/library.ts), plus `useSaveUi` (the
save dialog + the unsaved-changes guard). `saveCurrentGraphic()` writes the linked GraphicDoc
('needs-name' → the first-save dialog); `saveGraphicAs(name, dest)` mints a record standalone
/ into a package / into a new package; `openGraphicDoc` loads a record as the working
document (applies its ACTIVE control entry into sample data) and re-links. Every path calls
`persistLink()` so the slot's `graphicId`/`dirty` survive a reload even when no template
change follows. Save, Save As, Discard and every caller of them (the leave guard, the naming
dialog, the wizard's Finish doors) run as ONE TRANSACTION each, one at a time, in a fixed order
written once in saveActions.ts: claim the slot writes in flight, reserve a minted record's id in
the slot (`reservedGraphicId`, so a reload after a refused link write relinks instead of
minting a duplicate, #1383), the record, the link, then the source's pending autosave. It answers
only after every one of them settled and claims their refusals, so nothing of the saved source
can be refused after the answer and raise the app notice over Home (#1382); a refused record or
link write is a failed save, and the draft stays linked to a minted record so a retry writes
into it (#1367). Writes anything else makes meanwhile stay theirs. A new door that saves goes
through these functions, never through its own sequence of writes. The reserved id is carried by
EVERY slot write of the document (`model/project.ts` `reservedGraphicId`), so it is durable before
the record even when the save's own reservation and link writes are both refused (#1383); a mint
takes it with `mintReservedGraphicId`, calls `releaseReservation()` before its link write and
`endMint()` when it settles. The reservation is the minting tab's: once a record holds the id,
other tabs' writes take a fresh one, and boot relinks only a slot written during that mint
(`mintingReserved`) or one holding exactly the record's source (#1402). It is also the minting
DEVICE's: the slot syncs with it, so boot honours only a reservation this device made
(`isOwnReservation`, a device-local list), a pull keeps the device's own, and a record that loses
a sync conflict moves the draft, in every tab, to the "(conflicted copy)" holding its saved work
(`graphicSuperseded`, `linkAfterLoss`): clean when it holds exactly that, never linked to the
record that won (#1443, #1466). While a transaction runs or waits,
`useSaveUi.inFlight` is true, and `requestSwitch` asks rather than reading `saved.dirty`, which a
Save clears before its link write settles (#1392). The leave dialog shows that save's answer over
the editor and continues only on the user's word (`saveBeforeLeave`). `requestSwitch(proceed, cancel?)` is THE guard: any action that REPLACES the
working document (open another graphic, create new) goes through it. The mounted editor
also guards leaving its route before Home/control/video renders. Other surfaces do not
ask merely because a working document exists. Discard restores the linked library copy
or a clean unlinked default, persists the slot and clears discarded undo history; it never
writes a library or production copy. It asks only when the switch would
lose work: a linked document that drifted (`dirty`), or a never-saved one that differs from
its creation `baseline`. A never-saved document is `dirty` from birth, so `dirty` alone asked
over untouched work (e2e/new-graphic-guard.spec.ts). A door that opens the wizard fresh also
passes `resume`: a walk the reader LEFT mid-way with work in it (`heldWalk`, set by the wizard
as it closes) is asked about first, and Continue reopens the wizard into it
(e2e/wizard-draft-guard.spec.ts).

## templateStore.ts

templateStore.ts (zustand) holds the template plus editor UI state.

- **aiSpec / setAiSpec** - the GenerationSpec the current project was AI-created from (null =
  not an AI creation). Rides the autosave slot (SavedProject.aiSpec) and every Save
  (GraphicDoc.aiSpec via saveActions); cleared by a whole-project swap - the AI create path
  and openGraphicDoc set the right one just after.
- **aiThread / setAiThread** - the Create-with-AI CONVERSATION the project was created from
  (model/aiThread.ts; null = not carried). Exact same rails as aiSpec - the autosave slot
  (SavedProject.aiThread) and every Save (GraphicDoc.aiThread), cleared by a whole-project swap,
  reset from the record by openGraphicDoc. Additive optional; NO version bump. The former
  read-only panel is gone; preserve the stored conversation and its save/open rails.
- **legibility / setLegibility** - the project's `ProjectLegibility` settings
  (model/designRules.ts; null = the defaults). EXACT same rails as aiSpec: the autosave slot
  and every Save (GraphicDoc.legibility), cleared by a whole-project swap, set by the wizard's
  create paths and openGraphicDoc. The setter normalizes, so the default state stores null.
- **saved** - the save LINK `{ graphicId, dirty, status }` (docs/SAVED_CONTENT_MODEL.md §2):
  the autosave subscription flips `dirty` on any template change; a whole-project swap
  (applyTemplate with resetSampleData) SEVERS the link (graphicId null) so a fresh creation
  can never overwrite the previously open record - saveActions re-links after opening a
  saved graphic. Rendered by components/save/SaveControls (topbar Save + status + Ctrl+S).

- **applyTemplate(next, opts)** - THE mutation choke point: snapshots the previous template for
  undo. Blocks, AI, panels, gallery, and canvas gestures all flow through it.
  `opts.resetSampleData` (used by the wizard on Create) starts sample data from the NEW
  template's field defaults; plain applyTemplate intentionally preserves typed sample values for
  matching field ids. Don't drop the flag from the wizard path: the old template's values would
  leak into the new graphic's fields.
- **baseline / resetToBaseline()** - `baseline` is the pristine template as the project was
  created/imported/opened; every whole-project swap (applyTemplate with `resetSampleData`)
  captures it, and it persists in the SavedProject (model/project.ts) so a reload keeps a real
  Reset target (pre-baseline projects fall back to the loaded template). `resetToBaseline()`
  restores it through applyTemplate (ONE undoable apply) + resetSampleData. Distinct from
  `resetToDefault()` (a blank createDefaultTemplate, unused in the UI).
- **undo() / redo()** - undo() restores the snapshot and pushes the undone state onto the
  `future` stack; redo() re-applies from it. Any NEW edit (apply or manual typing)
  clears `future` - the classic undo-tree cut. Global Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z
  (+ Ctrl+Y), bound by the editor shell (the retired AppShell used to), unless focus is in Monaco or a form field.
- **setHtml/setCss/setJs** - editor edits; editing HTML re-parses the definition so
  `fields`/`settings` stay in sync. The preview rebuilds on a ~350 ms debounce.
- **syncSampleData(template, existing)** - EXPORTED (not just internal): the data-carrying
  fields' values, `existing` winning over each definition default. The export surface needs
  the identical answer for a graphic that is NOT the open project (a saved record exported
  off a Home card), so what a target bakes in never depends on which door the export came
  through.
- **selectedParts / selectedPart** - the SHARED SELECTION (multi since the interaction
  model, docs/EDITOR_REBUILD_PLAN.md): an ordered list of TemplatePart selectors the
  canvas, the timeline, and the Inspector all highlight; selectedPart is the PRIMARY
  (first) and every setter keeps the two in sync. setSelectedPart replaces, setSelectedParts
  replaces wholesale (the lasso), toggleSelectedPart is shift-click. UI state only - no
  history, never written into the template.
- **modalCount / pushModal / popModal** - counted by `components/spaceKey.ts`
  `useModalGate`, so stacked dialogs unwind correctly. Current editor keyboard handlers
  stand down while a modal is mounted. UI state only, with no history or persistence.

- **addAsset / addAssets / removeAsset** - undoable in-place snapshots (NOT applyTemplate:
  an asset add must not re-parse the definition, close the gallery). `addAssets` batches a multi-file import into ONE history slot; `addAsset`
  delegates to it. Undo/redo restore whole-template snapshots, so assets travel with them.
