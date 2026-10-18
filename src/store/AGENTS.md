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
(`graphicSuperseded`, `holdsCopySource`): clean when it holds exactly that, never linked to the
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
  reset from the record by openGraphicDoc. Additive optional; NO version bump. Shown read-only
  by components/AIPromptPanel.tsx.
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
  `resetToDefault()` (a blank createDefaultTemplate, unused in the UI). The topbar `↺ Reset`
  button calls it behind a confirm.
- **undo() / redo()** - undo() restores the snapshot and pushes the undone state onto the
  `future` stack; redo() re-applies from it. Any NEW edit (apply, patchCss, manual typing)
  clears `future` - the classic undo-tree cut. Global Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z
  (+ Ctrl+Y), bound by the editor shell (the retired AppShell used to), unless focus is in Monaco or a form field.
- **setHtml/setCss/setJs** - editor edits; editing HTML re-parses the definition so
  `fields`/`settings` stay in sync. The preview rebuilds on a ~350 ms debounce.
- **syncSampleData(template, existing)** - EXPORTED (not just internal): the data-carrying
  fields' values, `existing` winning over each definition default. The export surface needs
  the identical answer for a graphic that is NOT the open project (a saved record exported
  off a Home card), so what a target bakes in never depends on which door the export came
  through.
- **lastChange** - per-tab changed-line ranges from every apply (drives the editor's
  change-highlight decorations).
- **replayNonce** - motion applies used to auto-replay via the retired PlayoutSimulator; no live reader.
- **patchCss** - Style-panel patches: highlight without history spam.
- **sendScrub** - timeline view -> simulator pauses the preview's in/out timeline at a time.
- **sendControl** - the Control panel live-drives the preview through the simulator
  (update/play/stop/next). **sendEvent(name, payload?) / sendSnap(assignments)** are its
  state-machine twins (docs/STATE_MACHINE_SCHEMA.md): dispatch one operator event (the optional
  flat {field: value} payload lands only if the machine's structural guard accepts it), or enter
  states INSTANTLY - `null` assignments = every group to its initial, the VISUAL half of reset
  (the data half is resetSampleData; the two are never conflated). Both ride the same
  `controlCommand` nonce and are no-ops on templates without the machine runtime; the preview
  snaps with `{ timers: false }` so a parked design view never auto-advances.
- **selectedParts / selectedPart** - the SHARED SELECTION (multi since the interaction
  model, docs/TIMELINE_INTERACTION_MODEL.md): an ordered list of TemplatePart selectors the
  canvas, the timeline, and the Inspector all highlight; selectedPart is the PRIMARY
  (first) and every setter keeps the two in sync. setSelectedPart replaces, setSelectedParts
  replaces wholesale (the lasso), toggleSelectedPart is shift-click. UI state only - no
  history, never written into the template.
- **partLocks / setPartLock** - EXPLICIT canvas locks by part selector, read by the retired canvas (no live reader). A locked part takes no
  direct-manipulation gesture (drag, handle, lasso) but stays selectable by click and from the
  timeline. Only user toggles live here; a part with no entry follows the canvas's own default
  (an imported design's artwork starts locked - see src/components/AGENTS.md). UI state, no
  history, never in the template; CLEARED on a whole-project swap, because part selectors
  repeat across projects.
- **activeSurface / setActiveSurface, pointerOverStage, modalCount** - who owns a contested
  key. `activeSurface` ('canvas' | 'timeline', default 'canvas') flips on a pointerdown on the
  stage or the timeline strip and NOTHING else - panels and dialogs leave it alone on purpose.
  `modalCount` is pushed/popped by components/spaceKey.ts `useModalGate`, counted rather than
  flagged so stacked modals unwind correctly. Read through `getState()` in the key handlers,
  never subscribed, so they cost no renders. The predicates that combine them live in
  components/spaceKey.ts - do not re-derive one at a call site. UI state only - no history.
- **playhead / setPlayhead** - the step timeline's parked playhead `{ step, t }` (step index +
  local time in effective seconds). UI state only - no history; the Inspector stamps
  keyframes at it.
- **timelineTarget / setTimelineTarget** - WHICH timeline the step surface is editing
  (blocks/timelineLens.ts): the default path, or one branch state's own inline timeline. It
  lives here rather than in the dock because the INSPECTOR resolves values and stamps
  keyframes against the same projection - a component-local target would have it editing the
  entrance while the timeline showed a branch. The setter clears `playhead` (a step index
  means something different on the other side). UI state, no history; reset to the path on a
  whole-project swap, and the dock falls back to the path when a target stops resolving (its
  state deleted).
- **machineGroups / setMachineGroups** - the preview's live machine pointers `{group: state}`,
  null before the graphic reports. The retired PlayoutSimulator used to own the iframe and publish
  here, so every surface showing operator event buttons (the Control panel) greys from ONE source
  via controlModel `isEventLegal` - the same
  structural guard a hosted control page mirrors. The setter drops a tick that changed nothing,
  so subscribers re-render on a real state change rather than every 500ms. UI state, no
  history; CLEARED on a whole-project swap, or the previous graphic's pointers would grey the
  new one's buttons against a state it was never in.
- **addAsset / addAssets / removeAsset** - undoable in-place snapshots (NOT applyTemplate:
  an asset add must not re-parse the definition, close the gallery, or repaint the change
  highlight). `addAssets` batches a multi-file import into ONE history slot; `addAsset`
  delegates to it. Undo/redo restore whole-template snapshots, so assets travel with them.
- **canvasGestureActive / setCanvasGestureActive** - true while a canvas gesture is in flight
  (inline edit, root/layer/scale drag; the retired CanvasInteraction used to publish it). The retired AppShell's
  deferred Inspector auto-open used to check it at fire time so the workspace never resized under a gesture.
  UI state only - no history.
- **activePanel** (`SidePanel` type; the panel component itself is retired) - the mobile strip's tab AND the desktop docks' "reveal
  this panel" signal: SEVEN ids (inspector/data/control/style/assets/ai/export - a subset of
  model/layout.ts's PanelId; `code` is not a tab). Motion is not a tab - it lives on the
  timeline.
  **panelRevealNonce** bumps on EVERY setActivePanel call - the docks key their reveal effect
  on the nonce, not on the id changing, so re-requesting the stored panel still reveals it
  (the Import Graphic wizard revealing the default 'data' tab is the case that needs this).
