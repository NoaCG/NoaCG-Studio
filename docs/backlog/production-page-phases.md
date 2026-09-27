# `ProductionPage.tsx` - the state map, and the phases still to run

**Filed:** 2026-08-28, from the safe half of [[production-page-extraction]] (the measurement and
the order are there; this file is the evidence and the remaining work).

**Status.** Phase 0 landed on 2026-08-28: the three READ-ONLY pieces the report named are out,
2,968 -> 2,541 lines, zero behaviour change. Phases 1 and 2 landed on 2026-09-27 as part of the
clip playback plan's phase 0 (docs/CLIP_PLAYBACK_PLAN.md §16), together with the server cue
editor and `control/serverPlayout.ts`, 4,165 -> 3,480 lines. Phases 3 to 5 are still to run, and
each is session-sized with its own proof. **The owner runs these awake** - the file is the surface the
2026-09-12 production plays out from, and every phase past this one moves state that decides
what Take airs.

## The rule the whole plan turns on

**`liveCue` is a MAP keyed by graphic name, and every verb but Take addresses the SELECTED cue's
layer.** Take airs the cue on `liveCue[selectedGraphic]`. Lifting `liveCue` or `selectedCueId`
into a child, or splitting either across two owners, changes what Take airs - the one behaviour
in the product that must not regress quietly. No phase below moves them; the last phase moves the
cue DRAFT, which is the closest anything gets.

---

## 1. The state map (measured 2026-08-28, before anything moved)

30 `useState` calls. Grouped by the surface that READS them, with every writer named - a state
read by two surfaces cannot be lifted into either.

### Owned by exactly one surface (liftable)

| State | Surface | Written by | Note |
|---|---|---|---|
| `wireLog` | action log | the log follower, `runVerb`'s offline path | **moved in phase 0** (`ActionLog`) |
| `previewOverflow` | overflow readout + field marks | the PREVIEW message poll | derivation moved in phase 0 (`CueOverflowNote`); the state stays until phase 2 |
| `programOverflow` | overflow readout + field marks | `noteMachineState` | same, but it never moves - `noteMachineState` is the PROGRAM stage's callback |
| `linksOpen` `copied` `nameDraft` `nameNote` | links panel | `claimName`, `publish`, `copy` | **blocked** - see phase 3 |
| `addPick` | rail foot | the graphic picker | phase 1 |
| `menuCueId` `armedRemove` | rundown row menu | the row menu | phase 1 |
| `lastLoaded` `loadSide` | the cue editor's data-row loader | `loadRow`, the side picker | phase 5 |
| `stageBox` `stageEl` | PREVIEW monitor | the ResizeObserver | phase 2 |
| `bootLive` | the boot-recovery effect only | the wire resolve | never rendered; leave it beside its effect |
| `openedAt` | header clock | never | a constant |
| `exportOpen` | export dialog | the header button, the wizard's one-shot | trivial; no phase of its own |

### Read by two or more surfaces (stays on the page, or moves with everything that reads it)

| State | Read by | Why it cannot be lifted alone |
|---|---|---|
| `shows` | every surface | the record itself; `setShows` is the one write path into the store |
| `selectedCueId` | rundown, PREVIEW, editor, verb bar, keys | **the selection IS the preview gesture** - splitting it splits what Take airs |
| `liveCue` | rundown rows, verb legality, the PROGRAM header, `liveLayers`, `restoreProgram`, `unpublish` | **the Take contract** - see the rule above |
| `draft` | the editor, and `cueView` (so: rundown labels, the PREVIEW settle, Take, Update, the log) | the draft is what every verb reads through `cueView`, not just the boxes it is typed into |
| `airedData` | unsent-change detection (verb bar + editor head), `bumpLive`, `fireEvent`, `restoreProgram` | one fact answering two questions - what air shows, and whether the operator's values got there |
| `machineStates` | the action greying, the state chip, `restoreProgram` | the greying and the recovery replay read the same report |
| `editTarget` | editor head, `editingCue`, and therefore Update / bump / unsent | it picks WHICH cue every editing verb addresses |
| `note` | one status line, written by six handlers across three surfaces | the page's single status channel |
| `busy` | the links panel, written by `publish` / `unpublish` / `claimName` | phase 3 |
| `liveData` `dataKey` | the dispatch effect, the Data workspace, `resolved` -> PREVIEW, Take, Update, the editor's bound rows | **the page is the one sender**, and `dataKey === undefined` gates dispatch |
| `now` `outputSeenAt` | the header heartbeat and `rendererFresh` | ticked by two different timers |

### The refs, and why each one is a ref

`draftRef` `cuesRef` `resolvedRef` `liveDataRef` `airedRef` `liveCueRef` `machineStatesRef`
`clockSpecsRef` `speakingClocksRef` `clockValues` `speakingValues` `liveReportsRef`
`recoveredRef` `refreshRef` `ownsPlayout` `localLogId` `flushTimer` `previewIframe` `programRef`
`pictureInput`.

**Almost every one exists because a long-lived callback - the log follower, `applyProgram`,
`restoreProgram`, `runVerb` - must read the FRESHEST value without re-subscribing.** That is the
hardest constraint on this refactor, and it is not visible in the render tree: a child holding one
of these states gives the follower no way to read it. A phase that moves such a state has to move
its reader with it; threading a ref down through props is worse than the scope it replaces.

`ownsPlayout` and `recoveredRef` are a different kind: they latch once, and re-rendering on the
latch would be a render for a value the same render already read.

---

## 2. Phase 0 - DONE (2026-08-28)

The read-only pieces, each into its own component with props: no context, no new state manager.

- `home/ProductionLinks.tsx` - `ProductionLinks`, `LinkRow` and `CasparAirRow` moved verbatim
  (a file move; all three were already props-only). ~380 lines.
- `home/ActionLog.tsx` - the wire-log readout. Takes `entries: LogEntry[]` and holds nothing.
- `home/CueOverflowNote.tsx` - the "too long to fit" line, plus `cueOverflowKeys()`, the pure
  program-or-preview choice the parent still needs for the field marks.

**The surprise, recorded rather than pushed through** (the report's rule: surprise is a finding).
`unpublish` calls `setLiveCue({})`. The links panel LOOKS self-contained - its five state values
are read nowhere else on the page - but its handlers write the Take map. So the panel's STATE
could not travel with its markup, and phase 3 exists only because of that.

---

## 3. Phase 1 - the cue rundown (`home/CueRundown.tsx`) - DONE (2026-09-27)

Landed as the second step of the clip playback plan's phase 0 (docs/CLIP_PLAYBACK_PLAN.md §16).
It also owns `pickerOpen` and the picture input, which were added to the rail after this plan
was written and are read nowhere else. The page hands it the server's on-air map read-only, the
same way as `liveCue`. No spec covered the drag reorder, so `e2e/playout-cues.spec.ts` now drags
a row and pins every server verb's action after it; the move changed no screenshot in
`e2e/playout-baseline.spec.ts`.


**Move:** the `<aside className="pd-rail">` block - the rundown rows, the drag reorder, the row
overflow menu, and the rail foot (add graphic, new graphic, add pictures).

**Own:** `menuCueId`, `armedRemove`, `addPick`.

**Take as props:** `cues`, `graphicByPoolId`, `liveCue`, the selected cue id, `clashes`,
`cueView`, and the callbacks `selectCue` / `removeCue` / `removeGraphic` / `uploadPictures` /
`setShows`. `liveCue` goes in READ-ONLY, as a value - the child never calls `setLiveCue`.

**Why first:** the largest single block (~330 lines) whose only writes are to the store and to its
own menu state. `uploadPictures` stays on the page: it writes `note` and reads `library`.

**Proof:** `e2e/productions.spec.ts`, `e2e/production-persistence.spec.ts`, and the drag and menu
assertions in `e2e/production-controls.spec.ts`. Any cue path with no spec gets one in the same
commit - check drag-reorder coverage first.

## 4. Phase 2 - the two monitors (`home/PlayoutMonitors.tsx`) - DONE (2026-09-27)

Landed as the third step of the clip playback plan's phase 0. `programRef` is the page's, handed
in as a prop, and the measurement is still keyed on the node. `previewOverflow` is measured in the
monitor, which owns the frame and its messages, and reported through `onOverflow` to the page,
which keeps the value because the editor's field marks read it; the rest of the monitor's state
lives in the monitor. Proved by the specs named below (`output-cold-boot` needs the configured
backend and did not run) and the unchanged baselines.


**Move:** the `.pd-monitors` block - the PREVIEW iframe with its fit arithmetic, and the PROGRAM
frame wrapping `ProgramStage`.

**Own:** `stageBox`, `stageEl`, `previewOverflow`, `previewIframe`.

**Take as props:** `previewDoc`, `previewTemplate`, `settleData`, `stage`, `liveLayers`, `show`,
`library`, and the callbacks `onState` (`noteMachineState`), `onReady` (`restoreProgram`) and
`onOverflow`. The settle effect moves with the iframe.

**The trap:** `programRef` is a handle the PAGE calls - `applyProgram` ends in
`programRef.current?.apply(out)`, driven by the log follower. It must stay a ref FORWARDED from
the page, never one the child mints, or the follower loses its route to the monitor. Verify by
taking a cue offline and watching PROGRAM repaint.

**The second trap:** the measurement is keyed on the NODE (`stageEl`), never on `previewDoc`. The
Data-workspace round trip remounts the frame with an unchanged document, and an effect keyed on
the document never re-measures it - which is how the preview once came back unscaled. That
comment moves with the code.

**Proof:** the monitor assertions in `e2e/production-controls.spec.ts`, the Data round trip in
`e2e/production-data.spec.ts`, and `e2e/configured/output-cold-boot.spec.ts` for recovery.

## 5. Phase 3 - the publish and links STATE

**Move:** `linksOpen`, `busy`, `copied`, `nameDraft`, `nameNote` and the handlers `publish`,
`unpublish`, `claimName`, `copy` and `downloadEmbed` into a `useProductionLinks(...)` hook beside
`ProductionLinks.tsx` - the markup is already out.

**The blocker to clear first:** `unpublish` calls `setLiveCue({})`. Clearing the Take map there is
correct - nothing is on air once the capability URLs stop resolving - but it is a write to the one
state this plan protects. So the hook takes an `onUnpublished: () => void` and the PAGE keeps the
`setLiveCue({})`. If it does not land that way, stop and re-plan.

`publish` also calls `flushDraft()` and `setShows`, and both handlers write `note`. The hook
therefore takes `setNote`, `flushDraft` and `setShows` as arguments and owns nothing the page
reads back.

**Proof:** `e2e/configured/production-links.spec.ts`, `e2e/caspar-connect.spec.ts`, and an
unpublish-while-live assertion - **write that one before starting the phase**: nothing today
proves that unpublishing clears the on-air marker.

## 6. Phase 4 - the graphic actions and live numbers (`home/CueActions.tsx`)

**Move:** the `.pd-actions` block, the snap picker, and the `± LIVE NUMBERS` block.

**Own:** nothing.

**Take as props:** `events`, `legality`, `stateGroups`, `eventSections`, `machineState`,
`stateLabel`, `descriptors`, `liveNumberFields`, `selectedLayerLive`, `editingIsLive`, and the
callbacks `onFire` (`fireEvent`), `onSnap` (`snapTo`) and `onBump` (`bumpLive`).

**Why it is this late despite holding no state:** all three callbacks reach air the moment they are
pressed, and `fireEvent` writes back into the cue - into the draft when the on-air cue is the one
being edited, into the record otherwise. Passing the callbacks down is safe; RE-DERIVING any of
them inside the child is not. The adjust base must stay `airedData[graphic][key]`, never the cue's
own value, or a goal's +1 counts from a figure air is not showing.

**Proof:** `e2e/production-controls.spec.ts`, `e2e/control-panel-types.spec.ts`, and the scoreboard
and quiz output specs under `e2e/configured/`.

## 7. Phase 5 - the cue draft and the editor (`home/CueEditor.tsx`) - **LAST**

**Move:** the `.pd-editor` block - the title, the bands, the bound rows, the data-row loader, the
cue meta and the layer-clash repair.

**Own:** `lastLoaded`, `loadSide`.

**Does NOT own `draft`.** The draft is read through `cueView` by the rundown labels, the PREVIEW
settle data, `takeCue`, `updateLive`, `fireEvent` and `cueLabel` (the log). It stays on the page
with `flushDraft`; the editor receives `editingView` and `editDraft` as props.

**Why last, in one line:** everything above can be wrong and be visible. This one can be wrong and
air the previous value. Take carries `withBoundValues(graphic, cueView(cue).values)`, read through
`draftRef` - if a child's draft and the page's ref disagree by one tick, Take airs the older text
and nothing on the surface says so.

**Proof:** `e2e/production-controls.spec.ts` (the unsent-change dot), `e2e/production-data.spec.ts`
(bound fields read-only, load-row), `e2e/production-persistence.spec.ts` (the 300 ms flush), plus a
new spec that TYPES and immediately TAKES - the tick-disagreement case, which nothing covers today.

---

## Out of scope, recorded so it is not re-discovered

- **`HostedControlPage` renders the SAME activity log**, character for character apart from the
  `data-testid` prefix and one missing test id on its empty state
  (`src/components/HostedControlPage.tsx` around line 483 against `home/ActionLog.tsx`). Extracting
  the dashboard's copy is what made the duplication visible. One `ActionLog` with a
  `testIdPrefix` prop serves both, which is what docs/CONTROL_PANEL_PARITY.md asks for - and its
  home is then `components/ActionLog.tsx`, not `components/home/`, because the hosted page is one
  directory up. Deliberately NOT done in phase 0: it edits the other operator surface, and phase 0
  was scoped to changes that cannot reach air.
- **`HostedControlPage` duplicates the overflow derivation** (`src/components/HostedControlPage.tsx`
  around lines 213 and 787: the same program-or-preview choice and the same `overflowNote` call).
  Its shared home is `src/control/`, beside `cueData.ts` and `cueFieldGroups.ts`, which is where
  the parity rule (docs/CONTROL_PANEL_PARITY.md) puts anything both surfaces render. It was left
  alone on 2026-08-28 because that session's scope excluded `src/control/`.
- **The dashboard's CSS is another 1,314 lines** in `src/styles.css`. [[split-styles-css]] is the
  cheaper branch to move it in - the two halves of one surface are cheaper to move together.
