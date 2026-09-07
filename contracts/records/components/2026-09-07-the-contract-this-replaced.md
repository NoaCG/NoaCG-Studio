# The contract src/components/AGENTS.md carried before it was compiled

**Recorded 2026-09-07**, the day the area moved into the rule store. This is the file verbatim as
it stood at `origin/main`, kept for one reason: the rules that replaced it are written in their own
words, and a rule in somebody else's words loses the exact symbol names the prose used to carry -
the CSS class you would grep for, the helper the mechanism actually lives in, the spec that pins it.

Nothing loads this. It is the evidence behind forty-odd rules at once, in the same way a record
holds the evidence behind one, and `node scripts/contract-migrate.mjs audit` reads it when checking
that the migration lost nothing the contract knew.

**It is history, not a contract.** Where it disagrees with a rule in the store, the rule is right.
Four of its claims were already false when this was taken, and none of them was migrated as
written: the default layout does not dock the code panel on the left (the left and bottom docks
open EMPTY and the code panel starts closed); `loadLayout` does not migrate every non-v2 layout to
the default (it reads version 2 and version 3, and migrates a v2 layout by adding `assets`); the
sample-data panel has no definition-only fallback for long text, off-design images or off-shape
templates (an add that cannot land as a real element is refused with the reason); and
`render/RenderPanel` does not take the same three props as the export surface (its third is the
validation result, not `graphicId`). Its opening paragraph also counted eight nested contracts
under this directory when there are nine - `teams/` was never added to the list - and said each
has a thin `CLAUDE.md`, which stopped being true of `wizard/` the day that area compiled.

`docs/metrics/2026-09-07-components-migrated.md` is the full report: what became a rule, what was
false, and what is true but no longer worth loading.

---

# src/components - the React app

Loaded alongside the root AGENTS.md when working in this directory (Claude reads it via this directory's CLAUDE.md import; Codex reads it directly). Keep it accurate. The
store-side halves of these contracts are in src/store/AGENTS.md; the code patchers they call are
in src/blocks/AGENTS.md.

**Eight subdirectories own their own contract** - `wizard/`, `canvas/`, `timeline/`, `video/`,
`home/`, `fields/`, `style/` and `auth/`, each an `AGENTS.md` with a thin `CLAUDE.md` importing it, loaded
only when you work in that directory. A section that describes ONE directory belongs there, not
here: this file is read in full by every session touching any component, and the chain through it
is among the tightest in the repository (`npm run check:shared-instructions` prints the remaining
headroom). When it runs short, MOVE a section into the directory that owns the files it describes
- and if those files are still loose in this folder, moving them into one is the fix, not shorter
prose (`canvas/` on 2026-08-22 is the worked example; the dialog anatomy going to `src/styles/`
on 2026-08-29 is the same move to a sibling).

## Dialog anatomy - binding, and it lives in `src/styles/AGENTS.md`

**Read it before writing dialog markup.** EVERY dialog shares one anatomy, defined once in
`src/styles/wizard-and-dialogs.css`: the header row and its hard-right ✕, the checkbox row, the
`110px | 1fr` form row, the one-row footer, and the `.spacer`-is-not-a-push trap. Those defects
are what happens when six dialogs each invent a header, so do not restate or fork the rules here.

## Shell & editor

- **AppShell** - the workspace layout: a flexible DOCKABLE-PANEL model (model/layout.ts). The
  centre is fixed - the canvas (stage + transport) over the timeline, split by a draggable
  divider - and three docks (LEFT, RIGHT, BOTTOM) flank it, each hosting any panels
  (`code`, `inspector`, `data`, `control`, `style`, `ai`, `export`) as tabs. Default: code left,
  Inspector + the tool panels right, timeline roomy in the centre, bottom empty. Each dock renders
  only when it holds panels; the splitters resize the adjacent region. A tab can be MOVED to
  another dock or CLOSED via its ▾ menu; a dock's "+" re-adds any hidden panel (a closed panel
  stays closed across reloads). The DockState (panels/active/size) + timelineSize persist via
  model/layout.ts (loadLayout migrates any non-v2 layout to the default).
  The dock component is **WorkspaceDock**; the panel bodies come from AppShell's `renderPanel`
  (the tool panels wrapped in `.panel-body`); MOBILE keeps the fused preview column + SidePanel.
  A NEW selection (any surface) reveals the Inspector - activates its tab, or re-docks it if it
  was closed - DEFERRED half a second past the double-click window: any new pointer press cancels
  the pending reveal and a live canvas gesture (store canvasGestureActive) skips it at fire time,
  so the workspace never resizes between the two clicks of a text double-click or under a drag
  (e2e/inline-edit.spec.ts pins this). The store's `activePanel` is a "reveal this panel" signal
  (the wizard shows Export after an import, Data after an Import Graphic create) - the docks key
  the reveal on `panelRevealNonce` (bumped by every setActivePanel call), so re-requesting the
  stored default still reveals, and mount never does. The topbar
  ◨/code toggles close-or-reveal those panels. Binds global Ctrl/Cmd+Z to undo() and
  Ctrl/Cmd+Shift+Z (+ Ctrl+Y) to redo() (skipped when focus is in Monaco or a form field).
  useIsMobile/useSplitter support the mobile and resizable layouts.
- **NewGraphicButton** - THE door to the wizard, mounted by all five shells (Home, the editor,
  the control page, the production dashboard, the video shell) AND by the wizard's own header.
  One component because the five buttons had drifted on all three counts: only the editor
  guarded the working document, only the video shell went through the store FLAG rather than the
  route (so Back could not close it), and the dashboard had no door at all. Always `#/new`,
  always behind `requestSwitch`. The trio **logo -> Home -> + New graphic** OPENS every header,
  LEFT of the bar's `.spacer`, never wearing `primary` - amber is the on-air accent (owner:
  order 2026-08-28, side + colour 2026-08-29). WHICH control is Home differs by surface and is
  not drift: on Home the crumb, on the dashboard the logo. e2e/project.spec.ts pins all three on
  all five surfaces, "before the spacer" included. Inside the wizard it is a
  guarded start-over: mid-walk it rewinds to the front page with the draft kept (Back returns
  to the step); on the front page it is a no-op, checked in the component before the guard.
  Pass `productionId` on a production surface: the wizard pre-applies that show's look and
  preselects it on Finish, so a graphic made while standing in a production joins it.
- **CodeEditor** - Monaco + change-highlight decorations + change dots on inactive tabs the last
  apply touched + hover explanations (the teach/ module registers its tooltips here; there is no
  Learn tab). Its toolbar also carries the **Comments** control (src/editor/, shared with the
  video shell's VideoCodeEditor): Normal / Dimmed / Hidden is a VIEW preference - comment spans
  come from Monaco's own tokenizer and are painted with DECORATIONS, so the code, the undo stack,
  the cursor and every export stay untouched, and hidden comments leave their blank line where it
  was. It reapplies on every model swap (a language's tokenizer loads lazily - hence the bounded
  retry) and, in Hidden, temporarily reveals any comment holding the selection, a diagnostic
  marker, or a find match. Persisted in model/prefs.ts. Pinned by e2e/comments.spec.ts.
- **PreviewFrame** - the stage: the iframe + overlays live in a `.canvas-world` centred in the
  stage and translated by `pan`, scaled by fit × `zoom`. Zoom: the toolbar −/%/+ (the % resets
  to fit), Ctrl/Cmd+wheel (and trackpad pinch) toward the cursor, clamped 0.2–8×. Pan: HOLD
  SPACE and drag, a middle-mouse drag, or a plain wheel when zoomed in - all captured before
  the overlay, so a pan can only ever move the VIEW, never a document element. Space arms only
  while the pointer is over the stage (off it, Space stays the timeline's Play key) and never
  while a text field/Monaco has focus. Releasing Space restores the previous tool at once (as
  does losing window focus mid-drag). **spaceKey.ts owns who gets the key** — see below; the
  pan does not claim it and the timeline does not stand down, they both just ask. Because the overlay
  is sized `stageW × (fit×zoom)` and CanvasInteraction reads its live bounding rect, zoom and pan
  need NO coordinate changes there — the gesture math follows automatically (pinned by the zoom
  case in e2e/multi-select.spec.ts). Off-canvas VISIBILITY (a pasteboard so elements that start
  off-screen render) is a separate step — it needs the iframe to render past the canvas bounds.
  **pasteboard.ts owns HOW MUCH** margin: derived from the graphic's own authored motion (the
  largest px `x`/`y` keyframe), rounded up in steps so authoring doesn't re-fit the stage on
  every commit. Margin is not free (pasteboard.ts says why).
  Where the reach is unknowable the old flat pad stands: a legacy/unparsable region, MEASURED
  motion, or PERCENT travel (the data carries no size to resolve it against). Pinned by
  e2e/pasteboard.spec.ts.
  A template RUNTIME ERROR is worn on the stage itself (`.preview-runtime-error`, from the
  store's previewError - the same fact the Export gate reports): before it, a template whose JS
  threw at load was a silently broken canvas unless the Export panel happened to be open. The
  badge is pointer-events: none (a label, never a control) and clears itself because every
  rebuild starts by resetting previewError. Pinned by e2e/preview-error.spec.ts.
- **CanvasGuides** - the alignment guides drawn over the stage.
- **spaceKey.ts - WHO OWNS A KEY.** Several components listen on `window` for the same keys.
  They are SIBLINGS ON ONE NODE, so `stopPropagation` cannot reach across and the order they
  fire in is only the order they subscribed - which an unrelated `useEffect` dep can change.
  So no surface CLAIMS a contested key; each asks this module and acts only if the answer is
  its own. `spacePansCanvas()` is true when the CANVAS is the active surface, the pointer is
  over the stage, and nothing is being typed into; PreviewFrame arms the pan on it and
  StepTimeline plays when it is false. `activeSurface` (store) flips on a pointerdown on the
  stage or the timeline strip - panels and dialogs leave it alone, so a trip to the Inspector
  keeps whichever of the two you were in; it defaults to 'canvas'.
  `editorShortcutsLive()` gates every document-editing shortcut on "no modal, not typing", and
  `useModalGate(open)` is how a modal declares itself - **pass `open` explicitly for a surface
  that stays mounted and renders null when closed** (the wizard and the sign-in dialog both
  do), or the gate holds down for the whole session and silently kills every shortcut.
  Two rules worth keeping: a guard must answer on EVERY keydown including OS auto-repeat (a
  claim-based design covers only the first one, and a held key is the real gesture); and Space
  belongs to a focused button - the pan takes it anyway on purpose (clicking a stage tool
  leaves that button focused), play never does. Pinned by e2e/keyboard.spec.ts + the Space
  cases in e2e/import-canvas.spec.ts, which assert what did NOT happen.

## Canvas direct manipulation (canvas/)

CanvasInteraction (the gesture layer), CanvasSelection (the overlay), CanvasGuides,
**partLocks.ts** (what "locked" MEANS) and **pasteboard.ts** (how much margin) moved to
**`src/components/canvas/AGENTS.md`** (with its thin `CLAUDE.md`), which loads when you work in
that directory. Two things about it bind from out here: every gesture commits as ONE undoable
`applyTemplate`, and SELECTION is editor UI state only (store `selectedParts`) - the canvas, the
timeline and the Inspector are three consumers of the same selection, and none of it is ever
written into the template.

## Playout & timeline (timeline/)

PlayoutSimulator (the running preview timeline), MachineGraph (the state node editor),
TimelineDock / StepTimeline, LegacyTimeline and the Inspector moved to
**`src/components/timeline/AGENTS.md`** (with its thin `CLAUDE.md`), which loads when you work
in that directory. Two things about it bind from out here: every timeline edit is a pure data
mutation spliced back by `blocks/animData.ts` as ONE undoable apply, and the dock picks its
surface from the CODE, never from the category.

- **MotionPresetPicker** - the UNIVERSAL in/out picker (ten unit motions drawn as SIX family
  cards, Slide and Wipe carrying their directions as arrows; blocks/motionPresets.ts):
  presentational, hosts hold the state - every wizard Animation step whose design has a unit to
  move (wizard/) and a saved graphic's control page (home/). The no-code surface for the 80%
  case; the timeline above stays the Advanced editor. Contract in src/blocks/AGENTS.md.

## Field controls (fields/) - ONE control, every surface

**FieldControl.tsx** is THE editable-field control - the SPX Data panel, the SPX Control panel and
the video Content panel all render it, differing only in the descriptors they pass. **Do not
hand-roll a field control.** The full contract moved to **`src/components/fields/AGENTS.md`** (with
its thin `CLAUDE.md`), which loads when you work in that directory.

## Style controls (style/) - ONE set, both surfaces

**StyleControls.tsx** renders the `:root` style contract wherever a human edits it: the wizard's
Style step and the editor's Style panel. Its contract - the no-dead-knobs doctrine, complete CSS
values, alpha-preserving colours, ColorField and the bundled-typeface rule - moved to
**`src/components/style/AGENTS.md`** (with its thin `CLAUDE.md`), which loads when you work in
that directory.

## Panels (the six tool panels - Data / Control / Style / Assets / AI / Export)

On DESKTOP each is a dockable panel (AppShell renders them into the docks; see WorkspaceDock).
**SidePanel** is now the MOBILE surface only: a SEVEN-tab strip - **Inspector** leads, then the
six tool panels. The Inspector belongs there because the mobile stack has no docks, so the strip
is the only route to the surface where a layer is styled and animated. It renders RAW
(it brings its own padding + scrolling, like the desktop dock's
renderPanel); the tool panels keep the shared `.panel-body`. A new selection does NOT auto-switch
the mobile tab (AppShell's reveal effect is desktop-only: on a phone a tab swap under the fold
would be a surprise, not a reveal). There is no Motion tab: motion editing lives on the timeline
(StepTimeline via TimelineDock) plus the Inspector. Pinned by the mobile cases in
e2e/layout.spec.ts.

- **SampleDataPanel** - sample values (shared field rows, `includeHidden`: a hidden field carries
  a real input value like a countdown's duration, so it must be testable here) + add-field. On a
  placed-design template (designBoxInfo, code-derived) a text/number add goes through
  blocks/designLayout.ts addPlacedLine and an Image add through addPlacedImageSlot - a REAL
  placed field on the artwork; on a standard-contract CATALOG template a text/number add goes
  through blocks/edit.ts addCatalogLine - a real line in the assembler's own mask idiom. Both
  gates are code-derived, and both select the new layer on arrival so the Inspector reveals.
  Long text, images off-design, and off-shape templates keep the definition-only add.
- **ControlPanel** - operator view from the control/ engine (the same shared field rows, `live`
  on, hidden fields skipped as SPX skips them); live-drives the preview via store.sendControl ->
  simulator; renders the state machine's EVENT BUTTONS (controlModel eventButtons - labels/
  sections/payloads from `machine.controls`, payload values from sampleData via
  store.sendEvent, an `adjust` press writing its new figure back into sampleData), GREYED by
  `isEventLegal` against store.machineGroups exactly as a hosted control page greys them;
  downloads controlpanel.html; hosts a SLIM Productions block
  (docs/GOALS_ARCHIVE.md "Student release" step 8: create/pick a production + "+ Add current" + the
  link to its page - the layer stack, export, publishing and links all live on
  ProductionPage, so two surfaces cannot drift); adds the Google-Sheets live-data block.
- **HostedControlPage** - the `?control=<slug>` operator page (routed in App.tsx like ?chat=).
  It renders **THE PLAYOUT DASHBOARD** (docs/PLAYOUT_DASHBOARD.md), the one design the in-app
  production page and the exported controller also render: PVW + PGM monitors, the verb bar,
  the selected-cue editor, the cue rundown with its layer badges.
  **Both monitors are real and cost the backend nothing**: the published payload already
  carries every graphic's code, so PREVIEW is a local `PayloadStage` this page drives itself
  and PROGRAM is a second one driven by the shared LOG - which is what makes it show a take
  from somebody else's device. On boot it replays each live layer's last REPORTED data into
  the PROGRAM stage, or a production that has been on air all afternoon opens with an empty
  monitor beside a row marked ON AIR. That replay is safe HERE and was not in an exported
  package: this stage drives nothing but itself.
  **PARITY IS THE POINT HERE** (docs/CONTROL_PANEL_PARITY.md §4): this page and the in-app one
  render the same dashboard, so a control added to either belongs on both in the same commit.
  Since 2026-08-19 it also carries the ⚡ block whole (section grouping via `controlSections`,
  the recovery `.pd-snap`, the help line), the operator ACTIVITY log, the "N changes not on air
  yet" warning - judged against what the WIRE says was last sent, so another operator's update
  clears it - and the production DATA-ROW picker, whose rows are published by `buildPanelSpec`
  from the shared `control/cueData.ts` matcher.
  Since 2026-08-23 it also carries the **TOO LONG warning** (docs/SVG_IMPORT_PLAN.md §3): the
  graphic reports which values it could not make fit, riding the machine-state answer its
  monitors already poll for. **Keep the two monitors' reports APART** - a cue on air is judged
  by PROGRAM's answer and a staged one by PREVIEW's; one map for both warns about a cue nobody
  is typing into.
  **The VERB KEYS come from `components/playoutKeys.ts`**, the one keymap the in-app page reads
  too (the exported controller keeps its own copy - it ships without React). A key belongs in
  that module, never in a surface; the bar is `HostedVerbs`, a component of its own only because
  the hooks rule forbids binding a key while the page is still resolving its show.
  **They bind while playout is the surface ON SCREEN, never merely while it is mounted.** The
  in-app shell renders on Data and Audience too, with the playout column hidden behind them
  rather than unmounted - so bound-while-mounted meant SPACE ran Take from a screen with no
  monitors on it, and a cue went to air with nothing saying so (measured 2026-08-21: nine rows
  on the wire). Hence `usePlayoutVerbKeys(onKey, sub === null)`; this page has no workspaces and
  passes nothing. A verb acts on what the operator can SEE.
  Field edits still go to the SHARED staging buffer (local echo + debounced control_stage) and
  air only on an explicit take; event buttons still grey by structural guard; the graphic's
  saved ENTRIES stay a READ-ONLY picker in the editor head (authoring stays in
  GraphicControlPage). Login-optional by design (the slug is the capability); offline builds
  answer the route honestly, which is also why the page's UI cannot be pinned by the offline
  suite (e2e/hosted-control.spec.ts covers the publish-side spec build only).
  **e2e/configured/hosted-control-recovery.spec.ts** is the live half; what it pins and why it
  counts entrances rather than reading the picture is in `e2e/AGENTS.md`.
- **home/PayloadStage** and **home/ProgramStage** - the ONE monitor component both playout
  surfaces render, and its app-side wrapper. Contract in `src/components/home/AGENTS.md`.
- **StylePanel** - reads/writes the :root style contract (src/templates/AGENTS.md): colours,
  SHAPE, typeface swap, zone re-anchoring, post-creation typeface import (an imported face
  still lands in template.assets and shows in the Assets panel's list). The controls
  themselves are **style/StyleControls**, shared with the wizard's Style step - see below;
  this panel is the store adapter around them. It renders the SAME `wizard/FontPicker` the
  wizard does, so both surfaces search the same library and reach the same installed faces.
- **AssetsPanel** - the template's bundled files as folder-grouped ROWS (images, video loops
  .webm/.mp4 - hard-capped at MAX_VIDEO_ASSET_BYTES since assets ride the saved template as
  data URLs - Lottie .json gated by looksLikeLottie, fonts): DnD file import (one addAssets =
  one undo step), rows are drag SOURCES (`application/x-noacg-asset`, exported as
  ASSET_DRAG_TYPE) for the canvas drop (CanvasInteraction) and for folder-header drops; folders
  are path segments (one level inside the bucket) - moving/renaming goes through
  blocks/assetOps.ts moveAsset, which rewrites every code reference in the SAME undoable apply,
  then patches stale sampleData values. Empty user-created folders are ephemeral component
  state on purpose (assets sync as template JSON). Each row carries a USAGE mark (reference
  count > 0: ✓ / n×) - re-dragging a used asset adds another element instance, never a
  duplicate file. The Information section derives name/format/dimensions/aspect/size/alpha/
  Lottie timing/video duration + reference count per selection via src/assets/assetInfo.ts
  (async probe, cached) - the model stays { path, data }. The header's **"✚ Template
  graphic…"** opens InsertTemplateDialog - the catalog browser in INSERT mode over
  blocks/templateInsert.ts (whose merge contract is src/blocks/AGENTS.md's) - offering two
  choices: PLACEMENT (from the start / as a new next step) and "Its lines" (reveal together /
  step by step). Both are code-derived from one donor build per card, so a template needing its
  own runtime is greyed with the reason. Pinned by e2e/assets.spec.ts,
  e2e/asset-workflow.spec.ts + e2e/template-insert.spec.ts.
- **AIPromptPanel**; **ExportSurface** + its two hosts. The surface holds everything export
  DOES - the six zip targets, the validation gate, and (when `isRenderConfigured()`) the render
  section - and reads NO store: template, sampleData and `graphicId` arrive as props, because
  the same screen has to serve a graphic that is not the open project.
  **ExportPanel** is the dock panel, a thin store adapter that also feeds the verdict back via
  `setValidation`. **ExportWindow** is the standalone modal (`useExportUi.openExport(request)`,
  the store co-located with the component like InsertTemplateDialog's): export is not a reward
  for opening the editor, so the wizard's Finish step ends there and so does a saved graphic's
  ⬇ button on Home. It mounts ONCE in **App.tsx**, beside the routed surface - Home is a
  SIBLING of AppShell, not a child, and both open it, so mounting per shell would put two
  modals on screen. It closes on a route change (the request is a SNAPSHOT of one graphic and
  must not outlive its surface), recording the opening route on the effect's first run for a
  request so the wizard's batched close→navigate→open hop is not mistaken for navigating away.
  Sample data for a non-open graphic goes through templateStore's
  exported `syncSampleData`, so what a target bakes never depends on which door was used.
  **render/RenderPanel** takes the same three props; ProRes/sequence gate on `needsSignIn` like
  AI does, its measured In/Hold/Out breakdown re-runs when the template or sample data changes,
  and job state lives in src/render/renderJobStore.ts. Contracts in src/render/AGENTS.md;
  specs in e2e/render.spec.ts (stubbed API) + e2e/wizard-finish.spec.ts.
- **CommunityGallery** (🌐), **ModerationQueue** (🛡), **SyncStatus**, **SettingsDialog**.
  Hosted analytics is explicit opt-in: AnalyticsConsentBanner is non-blocking and mounts once
  in App; Settings owns the reversible preference. Undecided, declined, DNT/GPC, and offline
  states create no identifier and send no events.

## Save + Home (docs/SAVED_CONTENT_MODEL.md)

PACKAGES are fully RETIRED (docs/GOALS_ARCHIVE.md "Student release" step 3): every save is standalone
in the flat library and the one grouping is a PRODUCTION (model/shows.ts). Save and Home are
both routed (src/app/router.ts) so browser Back/Forward walk between surfaces.

**NEVER REPORT A SAVE THE STORAGE LAYER HAS NOT AGREED TO.** The saved documents live in
IndexedDB behind a synchronous mirror (model/durableStore.ts), which ACCEPTS a write and
confirms it a moment later - so the value a model mutator returns means accepted, not landed.
A surface that tells the user anything about the outcome must `await commitDurableWrites()`
first; it resolves to the failure message, or null, and CLAIMING it is what puts this
surface's own wording in front of the user instead of the generic app-level dialog. An e2e
SEED that reloads after writing owes the same await. Every surface that reports one does it
today (grep `commitDurableWrites`). Two rules follow from it: a flow
that CONTINUES on success (create the graphic,
then the production, then navigate) must await BEFORE the next step, or it builds half a thing
on a save that did not happen; and a background autosave that reports nothing may skip the
await entirely, because the app-level dialog already announces unclaimed failures.

- **save/SaveControls** - the topbar Save button + honest status (Not saved / Unsaved
  changes / Saving… / Saved / Save failed) + the ▾ menu (Save As, open saved) + global
  Ctrl/Cmd+S (capture phase, works inside Monaco, stands down under modals).
- **save/SaveDialogs** - the first-save/Save-As dialog (name only - every save is standalone)
  and the unsaved-changes guard (Save & continue / Save first… / Discard / Cancel), mounted
  ONCE in App.tsx after the wizard so the guard paints over it (the file says why); both
  declare useModalGate.
- **home/** - HomePage (`#/home[/<section>]`), the productions/graphics/videos/looks sections,
  GraphicThumb and GraphicControlPage moved to **`src/components/home/AGENTS.md`** (with its thin
  `CLAUDE.md`), which loads when you work in that directory.
- **AuthStatus** now routes Home from the account menu (initials avatar fallback); the
  topbar's always-visible Home button is the no-account door to the same place. Every Home
  door is the WORD alone - no emoji, no glyph (`src/styles/wizard-and-dialogs.css` says why); its NAME is still open.

## Video editor shell (video/)

Moved to **`src/components/video/AGENTS.md`** (with its thin `CLAUDE.md`), which loads when you
work in that directory. It holds the video shell's full contract: VideoAppShell, the per-ENGINE
branching, the code pane and player bridges, and the chat / content / settings / assets / export
panels.

## Wizard (wizard/)

Moved to **`src/components/wizard/AGENTS.md`** (with its thin `CLAUDE.md`), which loads when you
work in that directory. It holds the wizard's full contract: the entry modes, the rail / form /
preview layout, Browse's faceted storefront, Import graphic, Create with AI and its three
execution tiers, Finish's two doors, and the video strip.

## Auth UI (auth/)

useAuthState + authUi + SignInDialog / SignInPrompt / AuthStatus, the account essentials and the
`?agent=…` consent route moved to **`src/components/auth/AGENTS.md`** (with its thin
`CLAUDE.md`), which loads when you work in that directory. The gating pattern it holds is the
one every surface uses: read `useAuthState().needsSignIn` and render `SignInPrompt` - never
block the app. No login wall, ever - see the root AGENTS.md "Auth posture".
