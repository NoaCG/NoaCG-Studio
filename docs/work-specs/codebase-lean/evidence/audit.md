# What can go, and what must stay

Source pin: `3010e41134f1e3a6ebf3933582eb9b7e52055241`, inspected 2026-10-17.
This is the original pinned ownership analysis. No product file, test, instruction or stored record was changed.
The current spec and second-opinion-response.md supersede its broad test-retirement and fixture-replacement proposals.
Raw skip counts below are discovery evidence, not current deletion authorization.

## Old editor: evidence and boundary

`src/main.tsx:40` hydrates durable storage before dynamically importing App.
`src/App.tsx:399` selects the new editor, Home, graphic control, production, video and wizard
surfaces. It never imports or renders `components/AppShell.tsx`. AppShell's lazy import of
CodeEditor is included in the graph. The graph starts at all HTML entry modules, includes
server/CLI/worker imports into `src`, build inputs, type imports, literal dynamic imports,
`new URL` and CSS imports. `entrypoints.json` gives every root and its reason;
`source-files.tsv` gives a concrete entry-to-file path for every retained reachable file.

The 30-file AppShell-only closure is 11,191 lines. `src/teach/cssReference.ts` adds 79 lines:
it has no incoming import or string-registry reader, and describes the retired Learn/property
chip UI. Of those 31 candidates, lottieInsert (124 lines) and machineEdit (271 lines) still build
fixtures for live tests. The manifest therefore proposes **27 source candidates, 10,760 TS/TSX
lines**, after excluding the two system-notice files. Keep the two current fixture helpers; no replacement is required merely to move code between folders.
All 31 candidates are also flagged by Knip, demonstrating why a tool finding alone is insufficient. These are whole-file candidates, not a proposal to remove
the 195,904 lines of shared dependencies that the old shell happens to import.

| Ownership | Delete | Keep and why |
|---|---|---|
| Shell and code editing | AppShell, CodeEditor, WorkspaceDock, SidePanel, ProjectFormatMeta | VideoAppShell and VideoCodeEditor are reachable; Monaco, its workers, CommentVisibilityControl and commentVisibility remain |
| Old canvas | CanvasInteraction, CanvasSelection, partLocks, pasteboard | CanvasGuides is used by VideoPlayerFrame; new-editor canvas and transform adapters remain |
| Old timeline and state graph | Inspector, StepTimeline, LegacyTimeline, MachineGraph, PlayoutSimulator; layerTimeline and stepAssign after their last source callers disappear | animData, animMachine, animImport, animMigration, timelineModel and editorAnimation are shared with templates, playout, export or the new editor |
| Panels | AIPromptPanel, ControlPanel, ExportPanel, SampleDataPanel, StylePanel | AssetsPanel and InsertTemplateDialog are used by the new editor; ExportSurface/ExportWindow, FieldControl and StyleControls are current wizard/control surfaces |
| Notices and teaching | showchat/ModerationPanel, teach/explain, teach/knowledge, teach/cssReference | Keep SystemNoticeBar/backend notice reader pending admin decision; showchat/SendIn and production chat data remain live |
| Workspace preferences | Dock-only types, constants and read/write functions in model/layout after the storage decision | `clampRatio` is used by both VideoAppShell and model/videoLayout; extract/reuse it before removing dock code |

### Shared state is a selective edit

There are no separate old-editor Zustand slices to delete. `templateStore.ts` is a 634-line
shared store used by the wizard, save UI and new editor. `store-fields.tsv` enumerates all 81
top-level fields/actions and candidate live store consumers; 36 have no field-name occurrence
in live modules that mention templateStore. This lexical filter can over-retain names shared
with the video store and cannot establish full alias/dataflow ownership.
That is a removal-review list, not a proof that all 36 can be cut independently: internal
actions, subscriptions, document ports and serialized values still need to agree.

Remove old code-tab/hover/change-highlight, dock-reveal, old simulator commands, old canvas
tool/lock/gesture and old timeline targeting state once their last callers are gone. The
remaining `setActiveTab` calls in LooksSection and InsertTemplateDialog only target the
retired code pane; remove those calls with that state. Trace `requestReplay`, selection and
playhead ownership before cutting their fields: a writer can remain after its consumer died.
Keep template, baseline, sample data, saved-link/dirty state, history used by live actions,
AI spec/thread, legibility, gallery routing, pending production/export state and autosave.
No partial-store line saving is included in the forecast.

### Routes, flags, styles and instructions

- Rename the router's misleading `view: 'editor'` fallback only with App's boot routing and
  callers. Its behavior is Home today. Keep unknown auth fragments byte-for-byte and preserve
  `#/graphic/<id>` as a compatibility redirect to `#/control/<id>`; CLI-created links still use it.
- `advancedMode` is already absent as a setting. Keep the prefs v1-to-v2 reader that strips it
  while preserving unrelated preferences and refusing writes to future versions.
- `?editor=foundation` is the **new** editor's live flag. It stays. `flags.tsv` inventories
  client environment selectors; absence of a deployed value is never evidence of dead code.
- `AI_PRO_CUSTOM_ENABLED` still controls the advertised `customLane` status in
  `api/_lib/pro/status.ts:24`, despite the old custom loop being research-only in the graph.
  Keep it pending a product decision and reconcile the advertised contract in any later retirement.
- Review the 12 CSS files listed in the manifest (2,043 lines); their total is **not** a
  deletion saving. `learn.css` includes current `.wz-match` and `.wz-footer` rules; `editor.css`,
  `panels.css`, `app-shell.css`, `mobile.css`, `selection.css` and `machine-graph.css` have shared
  or cascade-sensitive rules. Remove selectors with their sole component and preserve cascade order.
- `old-editor-references.tsv` lists live code, tests, docs and instruction references, with line
  numbers. Update source rules and compile contracts, never edit generated AGENTS.md directly.
  Retire the shell/dock/old-canvas/timeline instructions, narrow mixed rules to current behavior,
  and replace the root rule's “keep its source until” clause. Do not erase frozen decision records
  merely because they mention the old editor; replace their active authority.
- `.agent-workflows/plan-run.md` maps `editor` to **current** EDITOR_REBUILD_PLAN.md. Keep that
  workflow and the new-editor plan. Update the superseded #800 wording in the E2E budget spec,
  candidate inventory and `_create.ts` comments in the relevant removal PR.

### Live test factories block two immediate source deletions

`e2e/_ografBuild.ts:113` calls lottieInsert for current OGraf isolation, lifecycle, parity and
conformance coverage. Four unskipped cases in machine-graph.spec.ts at lines 279, 735, 786 and
852 call machineEdit while checking runtime upgrades, step rehoming and animation semantics.
Keep those cases and assertions. These are current consumers, so retain the helpers. Do not create replacement fixtures merely
to move code out of src; no removal saving is credited. Runtime and schema behavior remain protected.

## Saved data: compatibility that survives

No production data was queried. Client readers and fixtures establish compatibility requirements,
not the number or age of records stored on users' devices. Browser-local records cannot be ruled
out by a zero-row server query.

| Stored shape/key | Current read/write chain | Plan |
|---|---|---|
| `spx-gfx-project`, SavedProject | durable hydration → templateStore initialProject; saveActions/autosave; backend/storage project singleton | Keep template, optional baseline fallback, graphicId, dirty, AI spec/thread and legibility, including absent older fields |
| `spx-gfx-graphics`, GraphicDoc v1 | library/loadAllGraphics → Home/control/new editor; backend/storage and CLI/API model contract | Keep IDs, source, assets, metadata and unknown/additive data; no schema version change |
| `spx-gfx-packets`, embedded graphics v1 | durable key list → library/migrateEmbeddedGraphics → stable library IDs, packet v2; packets also owns current looks | Keep migration and durable key. Do not delete packets.ts based on the old feature name |
| `spx-gfx-shows` and published graphics | shows/control/publish/export → output renderer | Keep referenced templates and saved production behavior, including older source formats |
| Legacy animation/source in a saved template | animData/animImport/timelineModel; prepareOutRuntime in composeDocument and saveActions | Keep parsers and exact historical runtime upgrades. Removing an authoring panel does not retire playback of its output |
| `spx-gfx-prefs` v1/v2/future | model/prefs → current settings, video comment controls and Home | Keep migration and future-version read-only behavior |
| `spx-gfx-layout` old dock geometry | only AppShell calls loadLayout/saveLayout; video imports only clampRatio | Ask before dropping this stored format; never clear the key as cleanup. No graphics or project source is stored here |
| `spx-gfx-video-layout`, video project/saved records | videoLayout/videoProject/videoProjectStore | Keep: these belong to the live video workspace |

Current checks to retain include no-old-editor's prefs, unknown-hash and stale-link cases;
project, library, account-library, storage-full, project-format, library-productions;
editor-foundation and the new-editor save/reopen suites; configured library-arrival;
anim-engine's surviving pure parity case and current export/runtime checks. Tests of retired UI interactions are removed; skipped tests of current operations are resolved
under #800. A skip is not evidence that today's operation is protected or obsolete.
The deletion PR must prove the retained compatibility fixtures actually run; missing current
compatibility protection gets its own current-surface test, not a port of an old editor walk.

## Tests: complete inventory and specific dispositions

`test-files.tsv` names every E2E spec and Node test file, its layer, size, headers, imports,
behavior summary, old-helper count and measured spec minutes where available.
`test-cases.tsv` names every static declaration, including dynamic-title expressions, with
line ranges and the helper chain that skips it. Static declarations are not expanded runtime
counts: loops, parameterized wrappers and credential-based skips require runner evidence.
Helper functions are not counted as test files. Runtime enumeration was not run locally.
`skip-sites.tsv` also records the non-editor skip conditions. Missing backend credentials,
Windows-only process tests, selected catalog scopes and unavailable private fixtures remain
valid conditional checks; they are not turned into retirement candidates by this audit.

The old-helper closure identifies **474 declarations in 77 files**: 36 entirely helper-skipped files
(10,715 lines; 0.497 table-minutes), plus 41 mixed files (39 offline and two configured).
The marked declaration spans in mixed files total 8,654 lines; surrounding imports/helpers
are not counted. Keep the unmarked tests. This conservative, current-source list replaces
copying the earlier “40 fully skipped files” figure into a deletion command.

The mixed offline files cost 43.478 minutes **in total**. That is not their removal saving:
they contain active checks. No per-case attribution is available. Do not prorate by test count.
The older 2.6-minute import-svg waste estimate is historical, not a fresh measurement.
Configured old cases have no offline-table duration and receive no invented saving.

`test-maintenance-draft.md` now withdraws the former broad entries. Subject classification and
exact replacement/retirement evidence must precede each removal's entry in the active work spec. The current
gate matches by spec filename, not test identity; `/check` must compare the actual removed
declarations to the receipt, including every retained assertion. No automatic repair may
turn these drafts into permissions to pass a failure.

Keep `e2e/no-old-editor.spec.ts` as a current navigation/compatibility check. Its ten tests
protect wizard exits, Home, new-editor doors, diagnostic boot, old links and prefs. Keep
its module-request guard and behavior checks in the first PR; only obsolete covers paths change.

Node tests are not dead because package.json does not list them: gates.mjs discovers every
`scripts/**/*.test.mjs`. `gates-build.tsv` and `gates-factory.tsv` record actual discovery.
No whole Node test file is proved obsolete by the AppShell removal. Remove/replace the two
legacy timeline-mapping case at `scripts/e2e-affected.test.mjs:757` and the retired `ux.spec.ts`
expectation in the motion-picker case at `:776` with current selection-safety examples;
preserve the planner properties they prove. Replace the old AppShell
example path in catalog-affected.test without dropping its non-catalog selection assertion.

### Browser-free candidates and false positives

| Specs | Decision and evidence required |
|---|---|
| creative-routing; render-schedule | Move pure routing/normalization and schedule/limit checks to Node; 0.915 browser-minutes available. Carry every existing mutation/negative pair and assert the same results |
| creative-pilot | Owner decides whether the research lane still exists first. If kept, move its deterministic 30-case compile/style/diversity suite to Node (2.061 browser-minutes); preserve mutation twins and isolate any DOM-dependent compile check. If retired, delete with that lane instead; never count both savings |
| ai-retrieval | Split pure ranking/retrieval from live generation/DOM boundaries after reviewing each body; no saving credited yet |
| bench; lite-field-paint/line-content/line-fit/parity/type-floor | Keep rendering/fault detection; remove app boot where a blank browser page suffices. These need layout/paint, so moving them wholesale to Node is wrong |
| graphic-sound; live-field-change; live-path; ograf-*; output-*; foreign-ograf-sandbox | Keep browser media, iframe, custom-element, animation-clock, isolation and network integration boundaries |
| ai-dev-routes; data-api | Keep HTTP handler/middleware integration. They already use Playwright's request fixture, not a browser page; no-click does not mean browser waste |
| publish-drift/publish-gate; rundown-history-storage; sync; account-library | Keep persistence/events/durability integration; pure validators can move separately with fault evidence |
| legal; feedback; public-chrome-baseline; route-transition-flash; import-svg-centred-title | Keep current DOM/visual/first-paint assertions even when they never click |
| bridge/bridge-ograf; video-player-host; video-surface-tag; video-generation-corpus; specialist-lower-thirds; pro-custom/pro-language; spike-instruments | Keep host/protocol/render or benchmark contract checks pending individual lane review; no blanket no-UI deletion |

### Consolidation and qualification

The previous budget study's top twenty are reviewed against the fresh duration table in the
spec's candidate ranking. None is an approved equivalence claim. Editor proposal/command walks
duplicate setup, but exercise different mutation authorities. Retain focused proposal/command
checks, a short save/reopen/export journey and fault injection in both application paths before
moving the larger viewport walks. Group/arrangement geometry has a Node home; rendered bounds,
undo and buttons still need browser journeys. A zero-assertion diagnostic probe is not protection,
but removing it still needs an exact maintenance entry.

Folder, Bridge, cue and clock tests protect active on-air behavior. Prefer deterministic clocks
and reusable isolated fixture preparation; neither shared production state nor shorter arbitrary
timeouts is acceptable. The importer corpus carries historical defect sidecars: retain every
fixture/expected result and a real wizard-to-production journey when factoring parser checks.
The configured suite remains intact; cadence and runner purchasing belong to the other study.

## Tooling, docs, assets and other source

Knip 5.88.1 reports 68 unused files and export/type findings in 339 files. Comparing its file
set with the explicit graph leaves two understood differences: catalogIndexBuild is loaded
by Vite's `ssrLoadModule` string (keep), and vite-env.d.ts is a TS ambient input (keep).
Knip's export findings are candidates, not independent function deletions: some are entry APIs,
string-loaded test subjects, public template contracts or bench tools. The layout exports are
a confirmed old-UI cluster; check live callers for every other symbol before changing it.

The remaining 35 application-unreachable AI files total **10,566 lines**. They are reached by
creative/spike/Pro benchmark scripts and tests, including dynamic cache-busted imports and
buildApiRuntime entry arrays. Their current purpose is research, not user-route execution.
Recommend retiring finished experiments only after the owner decides which lanes remain promised.
Keep shared structuralIntent, Lite, live Pro language generation and validators regardless.

`templates/blank.ts` (104 lines) is used by current sound and project-format tests. Recommend
moving it to a shared fixture if its public authoring entry is truly retired, with imports changed
in the same PR; this moves lines between directories and saves no total code. All other catalog
implementations are reached by CATALOG, typeVariants/mergeCatalog and string IDs. Zero sales/use
telemetry was collected; no registered template is declared dead or interchangeable by appearance.

`tooling.tsv` covers every script, including hook, workflow, package, agent-rule, config and
import references. “No machine caller” is a search result, not deletion proof: docs-driven admin,
real-host acceptance, media/render probes, catalog maintenance, cloud recovery and test loaders
remain useful. Generic subprocess dispatch and manual commands are reviewed separately.
The three proposed later deletions in the manifest are one-off catalog/shop screenshot probes
(193 lines), with no tracked caller and no assertion protecting current behavior. Keep general
capture/visual-review tools. AI benchmark and orchestration tools require their own purpose review;
no runner, safety gate, recovery workflow or whole CI job is retired by this audit.

`docs.tsv` covers every Markdown document and names instruction references separately.
Remove the four retired timeline/WYSIWYG redirect stubs and their four archived plans (1,280
lines) only after moving relevant schema explanations to current STATE_MACHINE_SCHEMA or
editor mechanism docs and repairing references. Keep current EDITOR_PLAN, EDITOR_REBUILD_PLAN,
the acceptance register, new-editor qualification evidence, reference-editor licensing/research,
active work specs and instruction-loaded docs. Finished reports are candidates only after their
active links, decisions and test receipts have a maintained home; “finished” is not enough.

`assets.tsv` includes code-managed assets and public files. The only literal-reference-free
public candidate is `public/noacg-mark-512.png` (34,153 bytes). External consumers are unknown;
keep it until its public URL's retirement is approved. Fonts, generated URLs, imported graphic
assets and catalog fixtures are not unused merely because their filenames are composed at runtime.

## Code-health sequencing

The actual plan is `docs/work-specs/codebase-health/spec.md` with `work.json`, registered for
three documentation/evidence phases, not a general source refactor. Run approved lean deletions
first, then re-pin its measurements. No whole health phase becomes unnecessary.

What becomes unnecessary: extracting the 5 CanvasInteraction + 6 StepTimeline + 4 Inspector
inline transforms grandfathered in ARCHITECTURE §5; maintaining the AppShell code-map row;
using the 2,240-line dormant canvas as a future refactor candidate; porting the old skipped
tests under #800. Remove those obsolete obligations instead of polishing them.
What remains: health phase 1's current responsibility map/production-plan handoff, phase 2's
real maintenance examples and phase 3's bounded value review; the current production-page
refactor and wizard S9 revisit. Do not change the owner's existing wizard budgets.

Before every deletion phase run `node scripts/worktree-activity.mjs`, refresh main and inspect
open PR/plan file allocations. This worker reported no other local work in flight; that is not
proof that other machines are idle. Serialize edits to App, store, CSS, ARCHITECTURE, contracts
and the editor plans with editor/code-health work. Disjoint research may continue.
