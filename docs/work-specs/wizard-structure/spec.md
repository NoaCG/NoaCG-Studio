# Wizard structure: a thin shell over Node-tested walk modules

Baseline: main `dba61b8e1`, 2026-10-13; every line number below is of that revision. Authority:
owner, 2026-10-13 (see `work.json`). Plan for `/plan-run wizard-shell`: nine mandatory sequential
phases (S1a, S1b, S1c, then S2 to S7), each built by one session and checked by another on `main`, then two optional
phases the owner adds after reading the first run's notes. The Create with AI step is the child
plan `docs/work-specs/wizard-ai/spec.md` (`/plan-run wizard-ai`), which runs beside this one on
disjoint files (section 8). Together they pick up wizard rows 3 to 5 of the 2026-09-06 workflow
plan (`git show 353527c3:docs/WORKFLOW_ARCHITECTURE.md`, lines 349-358); rows 1 and 2 landed on
2026-09-06 and 2026-09-07 (`docs/metrics/2026-09-07-phase-2a-module-rows.md`).

## Verdict

Restructure, now: small prerequisites first, then the extractions each justified by a measured
benefit, a mandatory close-out inside the first run, and a reassessment after it. The wizard's
behaviour, URLs, step names, test ids, copy and persisted formats do not change. What changes is
where the walk's rules live and how they are proved: the step tables, the walk's transitions and
the finish doors become pure modules with Node tests, the shell holds screen state and rendering,
the Import-graphic capability's drop handlers go behind its own index, and the instruction chain
every wizard edit loads shrinks before any file moves.

Not promised: that this makes the next graphic better by itself, or that the co-change number
reaches its target in this plan's window (it is measured over a later window of real work,
section 7). It makes a template-road or import-road change stop needing a shell edit, which is
what lets two agents work in the wizard at once, and it makes the shell's regressions cheaper
to find.

Biggest risk: the walk's open, rewind and restore transitions, which decide what a reader gets
back after Home, browser Back or a finished walk, and whose three implementations today keep
different things (section 1.3). Second: the finish doors, which save, publish-gate, pool into a
production and navigate, where a reordered write or an unguarded second press loses work or
makes a duplicate. Both are addressed by characterising today's behaviour first (section 5), by
the door contracts in section 3, and by pinning the transition policies per intent before the
reducer exists (section 4).

## Why

`src/components/wizard/CreationWizard.tsx` is 2,601 lines: 57 imports at 1-94, module constants
and types at 96-261, one component function at 270-2601 with no props, 29 `useState(`, 14 refs,
10 `useEffect(`, 8 `useCallback(`, no reducer, 720 comment-only lines. It changed in 155 commits
over the last 90 days (12 landed pull requests), 165 hunks in its first 200 lines and 241 in
lines 200-799. The September audit measured the wizard's coupling and set a target
(`docs/METRICS.md`): a commit touching only one capability's files should edit a shared giant at
most 10% of the time. On 2026-10-13 (`npm run metrics:cochange -- --days 90`): template-only
commits 59% (45 of 76), import-only 32% (64 of 203), AI-only 20% (12 of 60). The giants named by
the metric are `CreationWizard.tsx`, `draft.ts`, `draft/core.ts`, `draft/format.ts`,
`model/wizard.ts`, `templates/contract.ts` and `model/templateVocabulary.ts`; of these only the
shell churns (`draft/core.ts` 4 commits, `kitPlan.ts` 7 in the same window).

Three things the shell does today that make every capability change a shell change:

- Seven hard-coded step-title arrays (122-141, 204) and the mode union (144), with step indices
  compared as numbers at 691, 764, 775, 779, 783, 1543-1552, 1605-1609, 1648, 1830, 1859,
  1902-2465 and 2489, and the mode-to-component ladder at 1902-2465 (20 branches).
- About 290 lines of Import-graphic handlers inline in JSX: `onSvg` 2006-2127, `onArt`
  2159-2193, `onTemplateFile` 2142, `onClearSvg` 2131; `ImportDesignStep` takes 14 props. The
  seam `docs/ARCHITECTURE.md` section 5 pins at six names is now eight: `armTimerClock`,
  `pollDrivenLayers`, `proposeSvgExtras`, `graphicNameFromFile` and `proposeSvgBehaviour` are
  read by the shell, `behaviourSummary` by `FinishStep.tsx`, `svgDesignOptions` and
  `withSvgImportPasses` by `draft/core.ts`.
- Three walk-reset sites that keep different things: the restore branch 571-608, the fresh branch
  611-662 and `leaveStep` 884-913; "pick a design" written three ways (2226-2238, 2335-2349,
  706-716); the export door three times (1309-1322, 1386-1401, 1509-1522); the editor door twice;
  the kit and AI package doors pairwise identical (1203-1225, 1242-1266).

The instruction chain is the other cost. `src/components/wizard/AGENTS.md` is 35,238 bytes and
the Codex chain for any wizard file is 58,678 bytes against the 65,536-byte cap; the build fails
below 4,096 bytes free (`node scripts/check-shared-instructions.mjs`), so 2,762 bytes remain for
new rules. The compiler places each rule in the deepest directory carrying its marker
(`scripts/contracts-lib.mjs:571`, `ruleHomes`); `import/`, `steps/` and `steps/ai/` carry none,
so 75 of the 107 active wizard rules compile into the shell's file for want of three one-line
files. Claude loads the same rules by path from `.claude/rules/` and is not near a limit.

## Goal

The shell becomes a thin router over Node-tested walk modules under `src/components/wizard/`:
the walks as data, the walk's durable state and its transitions in one reducer, the finish doors
as one implementation over injected IO, the Import-graphic drop handlers behind that
capability's index, the kit as operations over the reducer's state. Every moved rule is pinned by
a test that existed or was written before the move. The instruction chain for a wizard edit is
measured and reduced, markers first.

## Non-goals

Hoisting the draft record or `buildDraftTemplate` to `blocks/` or `templates/` (section 1.2, D1);
nesting `WizardDraft` into slices (row 6); the full capabilities registry shape
`{ id, modes, steps[], draftSlice, previewOverrides?, doors, testidPrefixes }`; moving
`CreationWizard.tsx` to another path; the AI step's internals (the child plan); the SVG import
capability's own internals (`import/`, `templates/importedDesign/`, docs/SVG_IMPORT_PLAN.md: a
neighbour with a fixed seam here); the `App.tsx` route handshake (225-285); the Video door;
deleting the Pro code (#771 is the owner's); any UX, copy, URL, step slug, test id or
persisted-format change; fixing a defect inside an extraction (D10).

## 1. Decisions

### 1.1 Owner decisions (2026-10-13)

1. **Both tracks.** The shell plan (this spec) and the AI plan (the child) are both authorised;
   each is its own `/plan-run` name and they may run beside each other.
2. **Pro code is preserved, not deleted.** `AiStep.tsx:346-357` records the standing decision
   to keep the Pro branches intact pending issue #771; the child plan quarantines them.

### 1.2 Derived decisions (revertible; each says how)

- **D1 The draft stays under `components/wizard/draft/`.** Measured, not grandfathered:
  `blocks/` cannot import the `WizardDraft` type (nothing imports `components/`, eslint Stage
  A); `templates/` widens the affected-spec plan for the most-edited wizard files from 40 to
  59-132 specs (`node scripts/e2e-affected.mjs --list --files <path>`, 2026-10-13: `templates/`
  paths plan 59-132, `blocks/` 15, `wizard/` 40-43); `buildDraftTemplate` (core.ts:289-352) calls
  `withSvgImportPasses` from `../import` at 337, the very passes section 5 refused to move; and
  the file does not churn (4 commits in 90 days). Node tests need no move: the repo's Node tests
  bundle a `src/**.ts` entry with rolldown (`scripts/field-auto-map.test.mjs:30-40`). Close-out
  rewords section 5's sentence to its purpose: transforms over documents live below
  `components/`; a UI state machine that reads the store or the draft lives as `.ts` beside its
  component. Revert: none needed, nothing moves.
- **D2 One owner of durable walk state: a `useReducer` in the shell** over exactly the record
  that is already snapshotted, restored and reset today (`FinishedWalk`, 234-247: draft, mode,
  step, browseFilters, aiResult, aiThread, importedFile, contextProductionId, brandChoices,
  brandId) plus the kit picker (buildMode, kitPack, kitSelected, kit) and the two baselines
  (`startDraft` 288, `lastStep` 291). Screen state stays `useState`: the four SVG overlay states
  343-371, `stretchDemo` 343, `replayKey` 308, `kitBusy`/`kitError` 432-433, the three confirm
  asks, `stepOverflow` 438, `finishLibrary` 814. `madeThisOpen` (337) and `finishedWalk` (329)
  stay refs: `saveBuiltGraphic` (1014) reads `madeThisOpen.current` across awaits, and a state
  value captured at render would be stale under a second press. The trap
  `wizard/keep-browse-filter-state-creationwizard-back` (the setter is a React `Dispatch`) is
  met by a stable `onFilters: Dispatch<SetStateAction<BrowseFilters>>` that dispatches
  `{ type: 'filters', update }`. No store, no new framework. Revert: inline the reducer.
- **D3 Three explicit transition policies**, not one reset: fresh-open, rewind (the close
  control and Escape) and restore (a step URL with a finished walk in memory), plus Continue (a
  held walk) and Close. Each policy has a keep/clear table per field in section 4, filled from
  what the code does today and from the decisions of S1c; the differences the code keeps on
  purpose stay, the accidental ones are decided and fixed apart. Revert: keep the three sites.
- **D4 Doors as one implementation over injected IO.** `makeDoors(io)` returns `export`,
  `addToProduction`, `editArtwork`, `openSet` and `exportSet`; `apply` is the mode's own applier
  (`applyDraftProject` 1341-1363, `applyAiProject` 1276-1302, `applyImportedFile` 1492-1499),
  which stays with its mode. `io` carries `saveBuiltGraphic`, `openExport`, `addGraphicToShow`,
  `publishGate`, `commitDurableWrites`, `createShowNamedChecked`, `loadShows`, `setShowLook`,
  `captureLookFromTemplate`, `trackEvent`, `raiseStorageAlert`, the router and `closeGallery`.
  The kit and AI package doors become `openSet` and `exportSet` over `saveTemplateSet`. Revert:
  inline the copies.
- **D5 Import drop doors behind `import/index.ts`.** `import/drop.ts` exports `svgDropPatch`,
  `artDropPatch`, `clearSvgPatch` and `templateFileDropped`, each returning a `DraftPatch` (or
  the effect the shell applies) from the shell's inline bodies at 2006-2127, 2159-2193, 2131 and
  2142; the brand spread is the caller's, through one `brandOrClearPatch(brand)` added to
  `draft/template.ts` beside `brandPatch` and `brandClearPatch` (44-79), so `import/` never
  imports `../draft`. The section 5 counter is widened to count `index.ts` exports named outside
  `import/`; S2 records the new number and it may not rise after. Revert: inline the bodies.
- **D6 The kit as operations over the reducer's state.** `template/useKit.ts` supplies
  `moveKitTo`, `openKitGraphic`, `buildFromKitStep`, `applyKitStyle`, `saveKit` and the rail
  interception (1072-1134, 1138-1152, 1579-1596) and owns only transient UI (the two asks 426-427,
  `kitProductionName` 429, busy, error); `template/KitConfirms.tsx` renders the two confirms
  (2518-2564); `template/walk.ts` holds the template and kit `WalkSpec`s. Revert: inline.
- **D7 Markers first.** S1a adds the compiler's marker to `src/components/wizard/import/AGENTS.md`,
  `steps/AGENTS.md` and `steps/ai/AGENTS.md` and runs `npm run contracts:compile`; no rule is
  edited. When the child plan creates `wizard/ai/` and S8 creates `template/`, the marker moves
  with the folder. Revert: delete the marker files and recompile.
- **D8 Size gate.** The gate is production-page's D8 (`scripts/check-file-budgets.mjs`, header
  `// gate: build`, `measured(n, 'budgeted files')`, `package.json` `check:file-budgets`). Budgets
  live one JSON per budgeted file under `scripts/file-budgets/` so three plans never edit one
  line: `scripts/file-budgets/components-wizard-CreationWizard.json` installed at 2,601. If
  production-page's phase 1 landed its single `scripts/file-budgets.json` first, S1b extends the
  gate to read the directory as well, in its own small pull request, and leaves that file alone;
  if this plan lands first, the gate is installed reading both layouts and production-page's
  builder follows its own D8 unchanged. The number never rises; a phase that shrinks the shell
  lowers it to the actual count. Revert: delete the gate.
- **D9 Never weaken.** A phase pull request may change a selector in a characterisation spec,
  never an assertion; the checker diffs the e2e files for that. A skipped test is not coverage
  (`e2e/_create.ts:16`): bringing one back counts, adding a skip needs a `## Test maintenance`
  line and is refused by `scripts/check-e2e-protection.mjs` otherwise.
- **D10 Defects apart from extraction.** A suspected existing defect (1.3) is reproduced first;
  a confirmed one is fixed in its own pull request that carries its regression test, landed
  before the extraction that would otherwise pin the defect; a refuted one is recorded as
  today's behaviour by a characterisation test. A behaviour change found during an extraction
  goes the same way, never into the phase.
- **D11 Rule edits only in close-out.** S2 to S6 edit no rule file and do not recompile; every
  shell retirement and rescope happens in S7 through `npm run learn`, after the child plan's A5
  (section 8). Rules scoped to `CreationWizard.tsx` keep loading on the shell file until then,
  which is correct: the shell still calls the moved modules.
- **D12 Measurement.** The direct check of the coupling claim is the representative-change
  probe at S6: three written capability changes (a template-walk gating rule, a kit confirm, an
  import drop kind), each answered in the phase notes with the files it would touch. Co-change
  is re-measured in S7 and again over a later window of real work, with the matcher fixed first:
  `scripts/metrics/cochange.mjs:76` matches shared files by exact path (`shared.includes(f)`), so
  the new `shell/` files must be listed by path or the matcher changed to a prefix, as the
  capability prefixes at 18-38 already are. The instruction-chain target is reported, not gated
  (section 7). Revert: keep the metric as is.
- **D13 No new ARCHITECTURE edge.** `shell/*.ts`, `import/drop.ts` and `template/*.ts` runtime-
  import only wizard siblings and the lower domains the shell already imports through their
  seams (`model/`, `templates/`, `blocks/`, `validation/publishGate`, `control/productionAdmission`);
  the store, the router, durable writes and telemetry arrive through `io`. `npm run depcruise`
  passes with no config change; the `wizard-import-through-its-index` rule
  (`.dependency-cruiser.cjs:57-75`) stands and S8 extends it to `template/`.
- **D14 Paths that must keep resolving.** `src/components/wizard/draft.ts` (ten e2e and script
  loaders import it by Vite path inside `page.evaluate`: `e2e/_create.ts:97,202`,
  `e2e/wizard-brand.spec.ts`, `e2e/wizard-kit.spec.ts`, `e2e/editor-foundation.spec.ts`, six
  scripts) and `src/components/brand/BrandEditor.tsx:9` (four symbols) keep their imports;
  `CreationWizard.tsx:100`'s lazy import of `./steps/AiStep` keeps resolving until S7 retargets
  it after the child's A4.

### 1.3 Suspected existing defects (S1c reproduces each; decided on evidence)

- **S1 A stale template file makes an empty walk held.** The fresh branch (611-662) never
  clears `importedFile` or `importedFileError`, and `walkHasWork` (536-543) counts
  `importedFile`. Reproduce: drop a template file on the Create with AI card (file mode), Home,
  "+ New graphic", Start fresh, browser Back off Entry; expected today: `heldWalk` set over a walk
  with nothing in it, and Continue lands on `lastStep.current = 0`. Confirmed: own fix pull
  request (clear it in the fresh policy) with its regression test; refuted: characterised.
- **S2 Re-picking a design keeps or resets the steps answer depending on the door.**
  `TemplateStep.onPickVariant` (2344) sends `animation.steps: null`; `BrowseStep.onPickVariant`
  (2226-2238) and the deep link (706-716) do not. Reproduce: pick a stepped design, untick steps
  on Animation, Back, pick another stepped design on Browse; the answer carries.
  `wizard/resolve-deep-linked-through-hit-apply` requires the deep link to equal the Browse
  patch, which holds today only because both share the omission.
- **S3 A deep link drops the production-context brand from the draft.** The open effect merges
  `brandPatch` into `start` (658) and sets `brandId`; the deep-link effect rebuilds `startDraft`
  from `initialDraft()` (706) without it. Reproduce: open the wizard for a production that names
  a brand and a `#/new/<id>` link on the same open; the chooser names the brand, the preview
  shows catalog colours. Needs `pendingProductionId` and `pendingDesignId` on one open; rare,
  cheap to characterise either way.
- **S4 Rewind keeps what fresh clears, and the reverse.** `leaveStep` (884-913) keeps
  `importedFile`, `contextProductionId` and `acceptedAiGeneration`; the fresh branch keeps
  `importedFile`, `importedFileError`, the four SVG overlay states, `replayKey` and `kitBusy`.
  S1c decides the intended keep/clear table per intent (section 4) and the reducer pins it.
- **S5 Two kit bypasses.** `editSummaryStep` (1601-1610) and `revealFormatPicker`'s fallback
  (1624) call `setStep` around `moveKitTo`, so in kit mode they skip `commitKitGraphic`
  (1072-1088); and `kitBusy` (432) is never reset on open, so a save in flight across a close
  survives into the next walk. Reproduce both in kit mode with a held durable write.

Also noticed, not defects: the kit and Pro-package endings snapshot no walk (954-957, recorded as
backlog); the AI package doors (1242-1266) are reachable only with `proMode` and so never today
(the child plan's quarantine takes them); `resetKit`'s comment says seven values and it resets
eight (512-521).

## 2. Module boundaries

Each row is justified by a maintenance or testing benefit, not by size. The shell keeps: screen
state, the hooks that bind the modules, the header, rail, footer and preview chrome, and the
step ladder. Required for the measured wins: S2 to S7. Optional: S8, S9.

| Module | Responsibility | Owns | Runtime imports / injected IO | Interface | Benefit |
|---|---|---|---|---|---|
| `src/components/wizard/shell/walks.ts` | the walks as data | nothing | none / none | `WalkSpec` {titles, subs, slugs, animStep, finishStep, previewFrom, brandChooserFrom, canProceed(state), railJump(state, index), summaryKeys}; `walkOf(mode, kitWalk)`, `StepId`, `stepSlug` (181-183) | replaces the seven arrays (122-141, 204), `stepTitlesFor` (167-176), `STEP_SUBS` (189-203), `nextDisabled` (1543-1552), `showPreview` (1563-1570), `editSummaryStep` (1601-1610), the rail rule (1851-1860) and the index arithmetic in `goToStep` (1579-1596); a Node test pins today's literal titles, subs and indices per (mode, kitWalk) |
| `shell/walkState.ts` | the walk's durable state and its transitions | the record of D2 | `draft/core`, `draft/template`, `kitPlan` / none | `transition(state, intent)` for the five intents of section 4, `reduce(state, action)` for `go`, `setMode`, `patch`, `pickDesign`, `chooseBrand`, `filters`, the kit actions; `snapshotWalk(state)`, `walkHasWork(state)` | the three reset sites become one implementation whose differences are deliberate and tested per intent; one pick patch for Browse, Template and the deep link |
| `shell/useWalkLifecycle.ts` | the open and close effect's IO | nothing | react; `store/saveActions` (`useSaveUi`), `store/templateStore` (`pendingDesignId`, `pendingProductionId`), `app/router`, `model/packets` (`loadLooks`), `model/shows` (`loadShows`), `templates/catalog` (`variantById`) | reads the route and the one-shots, computes the intent, dispatches once; sets `heldWalk` on close (663-673) | the 125-line effect (550-674) and the deep-link effect (695-719) become IO only; the decision is in the reducer |
| `shell/doors.ts` | one implementation of each ending | nothing | `validation/publishGate`, `model/shows`, `model/durableStore`, `model/packets` through `io` | `makeDoors(io)` -> `export(apply, name)`, `addToProduction(apply, dest, name)`, `editArtwork(apply)`, `openSet(saveSet, dest)`, `exportSet(saveSet, dest)` | the three export copies, two editor copies, three production wrappers and the kit and AI set pairs collapse; the `addToProduction` ladder (1415-1484) and `saveBuiltGraphic` (1013-1034) get Node tests with held writes |
| `import/drop.ts`, exported through `import/index.ts` | what a dropped SVG, raster or template file does to the draft | nothing | `import/draft`, `assets/svgImport`, `model/fonts`; `importTemplateFile` injected | `svgDropPatch(result, ctx)`, `artDropPatch(file, ctx)`, `clearSvgPatch(draft)`, `templateFileDropped(file, io)` | about 290 shell lines leave; the fit-to-frame, furniture, prefix and naming decisions are tested at plan width 13 instead of 50 |
| `draft/template.ts` (one function added) | brand or clear | nothing | as today | `brandOrClearPatch(brand)` | four copies (2120, 2186, 2235, 2346) become one |
| `template/useKit.ts`, `template/KitConfirms.tsx`, `template/walk.ts` | the kit as an extension of the template walk | transient UI only (the two asks, productionName, busy, error) | react, `kitPlan`, `templates/kit` (dynamic, as 1110) | `useKit({ state, dispatch, walk, brandFields })` -> the operations of D6; `KitConfirms` renders 2518-2564; `walk.ts` exports the template and kit `WalkSpec`s | about 170 lines and two confirms leave the shell; one owner of kit state |
| `scripts/wizard-draft.test.mjs`, `wizard-kit-plan.test.mjs`, `wizard-walks.test.mjs`, `wizard-walk-state.test.mjs`, `wizard-doors.test.mjs`, `import-drop.test.mjs` | Node guards | nothing | rolldown `load()` as `scripts/field-auto-map.test.mjs:30-40` | `// guards:` headers naming the module | the wizard's logic tested outside Playwright for the first time |

Not made: a separate `finishedWalk.ts` (two pure functions in `walkState.ts`), a zustand walk
store, a capability registry carrying `draftSlice`, `previewOverrides` or `testidPrefixes`, a
footer component (props, not a benefit), a `shell/CreationWizard.tsx` move (155 commits in 90
days: every open branch would conflict).

## 3. Door contracts (reconciled against the code)

### 3.1 Rules

- **R1 Build before any write.** Every door first applies the built graphic to the store with
  the wizard kept open: catalog and AI through `applyGenerated` (1046-1050: Prettier on the HTML,
  `applyTemplate(..., { resetSampleData: true, keepGalleryOpen: true })`, `toSpxShell`), a
  finished file byte-faithfully through `applyImportedFile` (1492-1499). `rememberWalk`
  (959-973) snapshots the walk before the apply. The legibility settings and, for AI, the spec
  and thread are set on the store after the swap (1288-1290, 1353).
- **R2 The save resolves by name, once.** `saveBuiltGraphic` (1013-1034): over the record this
  walk made (`madeThisOpen`), else over the record already carrying the name
  (`librarySaveEffect`), else mint through `saveGraphicAs`. A `needs-name` answer mid-write (the
  record went meanwhile) mints. Failure returns `{ ok: false, error }`; it never throws.
- **R3 A failed save is never silent, and it never moves the reader.** The export door reports
  through `reportFailedCreateSave` (113-120) and still opens the export window over the unsaved
  graphic (1317-1321, 1396-1400, 1516-1520); the production door raises the storage alert and
  returns with the wizard open on Finish (1417-1426).
- **R4 Production admission.** After the save: `publishGate(template, true)` refuses before any
  rundown write (1430-1434); an existing production is looked up by id and a missing one
  replaced by a new unnamed one (1452-1456); creating the production and pooling the copy are
  each awaited through `commitDurableWrites` and reported naming the production (1439-1445,
  1458-1466, 1468-1476); the look is captured onto a production that has none (1478); then
  `noteMade`, `closeGallery`, `router.replace` to the production (1481-1483).
- **R5 Set doors.** `saveTemplateSet` (1162-1186) gates every member with `publishGate` before
  writing, `kitBusy` guards the press and `kitError` carries the failure; then `closeGallery` and
  navigate (1203-1209), the export variant setting `pendingProductionExport` first (1218-1225).
- **R6 The editor door saves nothing.** `noteMade` with `landedOn: editor-foundation`, then
  `openNewEditor({ replace: true })`, then `closeGallery` (1367-1374, 1501-1507).
- **R7 Second presses.** Entry's New production is guarded by `creatingProduction` (340); a
  second pass down the same walk writes over `madeThisOpen` (977-989) once the first completed;
  the set doors are guarded by `kitBusy`. The catalog, AI and file doors carry no press guard
  during their await: S1b characterises a second press while the durable write is held, and S1c
  decides whether that is a defect.
- **R8 When navigation happens.** The production door after the pooled write committed (1483);
  the editor door right after the apply; the export door never (the window opens over the
  wizard, which stays on the last creation step); the set doors after the show resolved.

### 3.2 Per door (today's order; kept)

| Door | At press | Writes, in order | On failure | Lands |
|---|---|---|---|---|
| Add to the production, catalog (1529-1534 -> 1415) | `applyDraftProject` (snapshot, apply, legibility, activation) | library save (R2); publish gate; production create if new, awaited; pool, awaited; look capture | alert naming the step to retry; wizard stays on Finish; library record kept | `router.replace` production |
| Add to the production, AI (1326-1331) | `applyAiProject` (snapshot, accepted generation, staged pick committed, apply, spec and thread, Lite outcome `accepted`, activation) | as above | as above | as above |
| Add to the production, file (1524-1527) | `applyImportedFile` (snapshot, byte-faithful apply, activation) | as above | as above | as above |
| Export, catalog (1386-1401) | `applyDraftProject` | library save (R2) | `reportFailedCreateSave`; export window opens anyway over the unsaved graphic | nowhere; export window over the wizard |
| Export, AI (1309-1322) | `applyAiProject` | as above | as above | as above |
| Export, file (1509-1522) | `applyImportedFile` | as above | as above | as above |
| Edit this graphic, catalog (1367-1374) and file (1501-1507) | the mode's applier | none | n/a | new editor, wizard closed |
| Kit production (1203-1209) and export (1218-1225) | `saveKit` -> `saveTemplateSet` | every member gated; set saved to the production | `kitError`; wizard stays | production page (export variant with `pendingProductionExport`) |
| AI package doors (1242-1266) | `saveTemplateSet` | as kit | as kit | as kit; unreachable today (`proMode`) |

Each row becomes a Node test in S4 with a scripted `io` whose durable write answers late, fails,
or sees a second press; the e2e journeys of S1b pin the same rows through the UI first.

## 4. Walk lifetime (the transition policies)

The five intents and what each keeps, as the code does today; S1c settles the cells marked
"decide" and the reducer of S5 pins the table.

| Field | Continue (held walk, 557-562) | Restore (step URL + finished walk, 569-610) | Fresh (611-662) | Rewind (`leaveStep`, 884-913) | Close (663-673) |
|---|---|---|---|---|---|
| draft, mode, step | kept; step = `lastStep` | from the snapshot; URL replaced with the ended step | `initialDraft()` + production brand; mode template; step from the URL or 0 | reset to Entry | step 0 |
| browseFilters, aiResult, aiThread | kept | from the snapshot | cleared | cleared | kept |
| importedFile, importedFileError | kept | from the snapshot; error cleared | **decide** (S1: kept today) | kept (S4) | kept |
| contextProductionId | kept | the production the walk landed in, else the snapshot's | the one-shot `pendingProductionId` | kept (S4) | kept |
| brandChoices, brandId | kept | from the snapshot | saved looks; None, or the production's brand | **decide** | kept |
| acceptedAiGeneration | kept | kept | cleared | kept (S4) | kept |
| kit state | kept | `resetKit` | `resetKit` | `resetKit` | kept |
| stretchDemo, overlays, replayKey | kept | stretchDemo cleared | **decide** (kept today) | cleared | kept |
| `heldWalk` | cleared on open | cleared on open | cleared on open | n/a | set when left with work (`walkHasWork`) |
| `resumeAsk` | none | raised | cleared | n/a | n/a |

Deep link (695-719) is Fresh followed by `pickDesign` jumping to Fields in template mode; S3
decides whether the production brand survives it. A plain `#/new` open discards a finished walk
(`forgetWalk`, 611); only a step URL offers it back, behind the warning that names what
re-entering resets (`wz-resume-confirm`, 2566-2598).

## 5. Safety net

### 5.1 Environments

Everything here runs offline (`playwright.config.ts`, backend pinned off); no configured spec is
needed because no door reaches the backend. Durable writes are held or failed with the fakes the
suite already uses (`e2e/_durable.ts`: `settleDurableWrites`, `awaitDurableReady`; a quota
failure as `e2e/storage-full.spec.ts` induces it). Node tests load a `src/**.ts` entry with
rolldown (`scripts/field-auto-map.test.mjs:30-40`); S1b verifies that `draft/core.ts` loads that
way (it reaches `model/fonts.ts`, whose DOM use sits inside functions, and `blocks/presetApply`).
Local targeted runs go through the browser queue: `node scripts/e2e-runs.mjs --wait && npx
playwright test <files>`; broad affected suites stay on GitHub Actions.

### 5.2 Inventory (reconciled against `origin/main` on 2026-10-13)

There are no `src/**/*.test.*` files, no vitest, no snapshots. Levels: Node `scripts/*.test.mjs`
(`node --test`, discovered by `scripts/gates.mjs` from `// gate:` and `// guards:` headers);
offline Playwright `e2e/*.spec.ts` selected by `// covers:` headers (`scripts/e2e-lists.mjs`) and
the traced map; the configured suite (not a pull request gate). A change to `CreationWizard.tsx`
alone plans 50 specs (52 table-minutes); `e2e/wizard-draft-guard.spec.ts` names it by path,
`e2e/template-deep-link.spec.ts` and `e2e/route-transition-flash.spec.ts` declare `covers: none`
although they exercise the shell's deep link and first-visit open, and
`e2e/mark-legibility.spec.ts` covers only `src/assets/assetInfo.ts`.

Live today (offline gate): `wizard-shell` (12 tests: counter, header, close control, Escape,
Home, one history entry per step, a named step URL surviving reload), `wizard-entry-fit` (19),
`wizard-filters` (21), `wizard-finish` (16: door order, production door and confirm, the
Back-after-create warning at 117, skip to finish, export saves and opens the window at 239 and
380, save-over by name 314, the package folder name), `wizard-kit` (18), `wizard-preview` (9),
`wizard-draft-guard` (4: Continue, Discard, Back-left walk, production-page doors),
`new-graphic-guard`, `project` (2 of 3), `no-old-editor`, `template-deep-link`,
`route-transition-flash`, `community-packs`, `motion-presets`, `mark-legibility`, `storage-full`
(full quota on the production and export doors), `studio-evening-reliability`, the import road
(13 specs) and four Node tests under `scripts/` for `import/`.

Skipped at runtime through the retired-editor helpers (`e2e/_create.ts:16`, issue #800), so not
coverage: `wizard-brand` 7 of 7, `wizard-logo` 6 of 7, `wizard-setup-fields` 9 of 10,
`project-format` 11 of 11, `flows` 7 of 7, `ux` 6 of 6, `end-credits` 8 of 8, `package`; the AI
files are the child plan's. About ten of the forty specs on the shared wizard covers line are
all-skipped.

No test at all: `draft/core.ts`, `draft/template.ts`, `draft/format.ts`, `kitPlan.ts` (Node);
the TemplateStep continuation (images then template); the brand chooser's effect on the built
graphic; a finished walk restored beyond `wizard-finish` 117; a second press on a door during a
held write; VideoStep duration, aspect and fps; the signed-out Video door.

### 5.3 Coverage by behaviour and what S1b adds

| Behaviour (shell code) | Proved today | New in S1b (passing behaviour only) |
|---|---|---|
| Entry cards, Playout row, header doors (1902-1955, 1738-1820) | wizard-entry-fit, wizard-shell, no-old-editor | none |
| Step history and URL (455-474, 1837-1886) | wizard-shell 373/404, wizard-draft-guard 74 | a reload on every mode's step URL lands on that step (template, import, design, svg, file, ai) |
| Held walk (663-673, `saveActions.ts:187-227`) | wizard-draft-guard | Continue returns to `lastStep` with filters, draft and imported file intact; the held flag is false after a fresh open in every mode |
| Restore a finished walk (569-610) | wizard-finish 117 | after the production door: browser Back offers the walk, declining lands on the production; after the export door: nothing to walk back from; a plain `#/new` discards it |
| Deep link (695-719) | template-deep-link (covers none) | header gets real covers; the draft after a deep link equals the draft after the Browse pick of the same design |
| Production context brand (640-660) | wizard-brand (skipped) | the chooser preselects the production's brand and the preview carries its palette (the chooser half only; the palette assertion comes with S2's `wizard-brand` revival) |
| Pick a design, three ways (2226-2238, 2335-2349, 706-716) | wizard-filters, wizard-kit | S2's regression or characterisation per S1c |
| Finish doors (section 3.2) | wizard-finish, storage-full, import-name-collision, no-old-editor | with a held durable write: the production door's library record exists before the rundown row, the alert names the retry on a failed pool, no navigation before the commit; the export door opens the window with the save failed; a second press during the hold (recorded as today's behaviour, R7) |
| Kit doors and hub (1072-1226) | wizard-kit (18) | `editSummaryStep` in kit mode (S5's outcome) |
| Draft and kit plan (core.ts, template.ts, format.ts, kitPlan.ts) | none in Node; `wizard-kit` 414/599 in-page | Node: `initialDraft`/`mergeDraft` nesting, `draftToOptions` per design (lines, logo, brand mark, palette resolution incl. a captured palette), `buildDraftTemplate` name, fonts, overrides, out-preset mix; `brandPatch` known and captured; `universalPick`; `kitLookPatch`, `buildKit`, `reconcileKit`, `rebrandKit`, `commitKitGraphic` |

Rules from `e2e/AGENTS.md` apply: wait for the preview rebuild on what the document shows, never
on stamps; a seed waits for `awaitDurableReady`; a guard fix is asserted backwards and
mutation-tested. Rule `root/put-durable-check-cheapest-layer-proves` decides the layer: pure
logic in Node, journeys appended to the flow's existing file (`wizard-shell`, `wizard-finish`,
`wizard-kit`), no new spec file; the capacity line is at 93.8% of its envelope and a change that
adds spec minutes above 95% needs a `## Budget exceptions` entry.

## 6. Verification matrix (one per phase; the builder follows it as written)

Every phase runs `/check`, `npm run depcruise`, `node scripts/gates.mjs run --changed
origin/main`, AC-9's scope fence and the Node files it adds; local targeted specs through the
browser queue; broad affected suites on GitHub Actions. Assessment A = a fresh read-only session
with the `/so` brief (`.agent-workflows/so.md`) by `wave-row` (Opus, high).

| Phase | Local targeted specs | Node | Assessment | Measurement |
|---|---|---|---|---|
| S1a | wizard-shell (the contracts compile and load) | compile-contracts, check-shared-instructions | none | `npm run metrics:contracts` and the chain check, recorded |
| S1b | wizard-shell, wizard-finish, wizard-kit, wizard-draft-guard, template-deep-link, storage-full | wizard-draft, wizard-kit-plan, the gate's test | none | plan widths and table-minutes recorded |
| S1c | the spec file each defect lands in | the regression test each fix carries | none | baseline evidence recorded after the last decision |
| S2 | import-svg, import-graphic, import-prepare, import-name-collision, wizard-brand (revived), wizard-shell | import-drop | none | section 5 counter on `index.ts` exports |
| S3 | wizard-shell, wizard-finish, wizard-kit, project-format (revived), every mode's step-URL journey | wizard-walks | none | none |
| S4 | wizard-finish, storage-full, import-name-collision, wizard-kit, no-old-editor | wizard-doors (every 3.2 row with late, failed and second-press writes) | A | none |
| S5 | wizard-shell, wizard-draft-guard, wizard-finish, wizard-logo and wizard-setup-fields (revived), template-deep-link, wizard-brand | wizard-walk-state (every section 4 cell; `walkHasWork` false after fresh in every mode; snapshot and restore round-trip) | A | none |
| S6 | wizard-kit, wizard-filters, community-packs | wizard-walks (kit spec) | none | the representative-change probe |
| S7 | the full affected plan for the shell on CI | all of the above | none | chain sizes, co-change (matcher fixed), budgets |
| S8 | build, depcruise, the affected plan | none | none | plan widths after the move |
| S9 | the affected plan | none | A | the probe repeated |

Evidence (`evidence/phase-<n>.md`): the candidate sha, each command and its summary, the
assessor's verdict with the reviewed sha. Revalidation, evidence-only commits and mappings follow
`docs/work-specs/production-page-refactor/spec.md` section 6 word for word: a material commit
restarts the matrix; a new Node test carries `// guards:`; a spec whose `// covers:` named a
moved behaviour gains the new path in the same pull request; `node scripts/e2e-affected.mjs
--list --files <new module>` must select the specs that covered the behaviour before the move.

## 7. Instruction weight

Markers alone (S1a) are expected to give the shell edit about 34 KB (root 2,750 + `src` 8,987 +
`components` 11,697 + a wizard contract of about 32 rules) and a step or capability edit about
44 KB (the same plus about 26 rules): under the 65,536 cap with room, still above the 40,960
target of `docs/METRICS.md`. S1a measures the real numbers. S7 then retires the structural traps
the reducer and the walks table turn into code (candidates:
`wizard/keep-browse-filter-state-creationwizard-back`,
`wizard/hold-import-images-continuation-old-importstep`,
`wizard/resolve-deep-linked-through-hit-apply`,
`wizard/spread-every-handler-patches-make-visible` if the drop doors absorb it), rescopes the
door rules (`send-all-three-finish-doors-through`, `snapshot-walk-each-three-appliers-finish`,
`lead-finish-add-production-every-finish`) and the lifecycle rules
(`give-every-wizard-step-own-history`, `keep-browse-filter-state-creationwizard-back`,
`resolve-deep-linked-through-hit-apply`) to the modules that now carry the behaviour, and drops
the e2e scopes of the seven retired rules that still carry one. The stale citations in
`contracts/records/ai/2026-09-07-*` are the child plan's.

**AC-7 is a measured target with a reporting obligation.** This plan is complete when the listed
reductions are done and the chain sizes are reported in `docs/metrics/<date>-wizard-shell.md` at
S1a and S7; reaching 40,960 bytes on every wizard chain is the series' goal, and a miss names
the next candidates. Never by weakening `src/AGENTS.md` or `src/components/AGENTS.md`, which are
outside this plan. `npm run audit:instructions` runs in S7.

## 8. Parallel execution rules

- **Two documents, two ledgers.** This track writes only this spec (its `## Phase notes`) and
  its `work.json`; the AI track writes only `docs/work-specs/wizard-ai/spec.md` and its
  `work.json`. No shared notes file.
- **File ownership.** Shell: `src/components/wizard/CreationWizard.tsx`, `shell/`, `import/`,
  `template/`, `draft/`, `kitPlan.ts`, `KitTray.tsx`, `steps/` except the AI files,
  `e2e/_create.ts`, `e2e/wizard-*.spec.ts`, `e2e/project-format.spec.ts`,
  `e2e/template-deep-link.spec.ts`, `e2e/route-transition-flash.spec.ts`,
  `e2e/mark-legibility.spec.ts`, `scripts/wizard-*.test.mjs`, `scripts/import-drop.test.mjs`. AI:
  `steps/AiStep.tsx`, `steps/ai/*`, the future `wizard/ai/`, `src/ai/*`, `e2e/_ai-step.ts`,
  `e2e/ai*.spec.ts`, `e2e/pro*.spec.ts`, `scripts/ai-lite-bench.test.mjs`,
  `scripts/ai-creation.test.mjs`. A phase that needs the other track's file stops and records it
  in its notes; the owner decides the order.
- **Generated contracts and rule files: one writer at a time, in this order.** S1a (markers,
  recompile) -> A4 (scopes and the `wizard/ai/` marker, recompile) -> A5 (the AI track's rule
  edits) -> S7 (every shell rule edit). S2 to S6 edit no rule and do not recompile. The
  coordinator of `wizard-shell` reads `wizard-ai`'s ledger before launching S7 and records a
  `stop` while A4 or A5 is open (launched, not landed); the coordinator of `wizard-ai` does the
  same before A4 while S1a or S7 is open. A track that has not started holds nothing: the order
  above serialises concurrent writers, it is not a dependency.
- **Other shared files.** `scripts/e2e-affected.test.mjs` pins paths for both tracks: A4 before
  S8. `scripts/file-budgets/`: one JSON per budgeted file. `package.json`: S1b adds the one
  `check:file-budgets` line if production-page has not; the AI track adds none.
  `.agent-workflows/plan-run.md`: this landing only. `docs/ARCHITECTURE.md`: S7 only.
  `docs/metrics/`: one file per track. `CreationWizard.tsx:100`: S7 retargets the lazy import if
  A4 landed, else records the leftover.
- **Beside `production-page`.** Disjoint `src/`; shared only the size gate (D8: a directory of
  budgets, whichever plan lands its gate first sets the layout and the other follows) and the
  `package.json` script line. Plan runs of different plans may run side by side
  (`.agent-workflows/plan-run.md`), never two on one file.

## 9. Execution settings

- **Coordinator:** `/plan-run wizard-shell`, sequential; the wave file lists the phases still to
  build as `N. Phase <k> of the spec: <name> (AC-...)`; the first run's list is S1a to S7; a later
  window is a new run whose list starts at the first unfinished phase and may include S8 and S9
  only if the owner added them to this spec's phase list after reading S6's probe.
- **Builders and ordinary checks:** `wave-row` (Opus, high). One builder owns the shell in any
  phase.
- **`wave-row-deciding`** (Opus, xhigh): the pre-merge assessments of S4 and S5 (A), and a narrow
  state or lifetime decision this spec does not settle (recorded in the phase notes; never
  widening scope).
- **Optional review mechanisms** (explicit opt-in; none stacked by default): the Workflow tool,
  `/code-review ultra`, `/so`. At most one for S5.
- **Preflight before S1a** (recorded in the wave file): `node scripts/work-spec.mjs status
  docs/work-specs/wizard-structure/work.json` clean and the plan listed under "Runnable plans";
  `origin/main` CI green; the browser queue idle enough (`npm run test:e2e:runs`); `gh`
  authenticated; `wave-row` and `wave-row-deciding` available; no open wave or plan run on these
  files (`scripts/wave-plan-store.mjs --list`); the owner's window in Helsinki time with its
  offset.
- **Preflight before S2** (from S1c's notes): S1b's tests and the gate green on main; S1 to S5
  decided with evidence and any confirmed fix landed in its own pull request; the baseline
  evidence recorded.

## 10. How the owner starts this plan

1. Execution is `/plan-run`, never an ordinary session working through the list by hand. One
   coordinator session opens the run, launches each phase's builder and, after the landing, its
   independent checker (`.agent-workflows/plan-run.md` section 2), and advances by itself when
   the check passes. Every builder lands through `/check` and `/queue-merge`; only the merge
   queue writes `main`.
2. The deadline comes from the owner at the start. This spec carries no date. A start without a
   deadline is answered with one question for it. The runner's ceiling is 24 hours per window.
3. Start template, once the plan is registered under "Runnable plans":

   ```
   /plan-run wizard-shell until <date and time with UTC offset>
   ```

   The AI track starts the same way as `/plan-run wizard-ai`, in its own coordinator session,
   beside this one or later.
4. Continuation in a fresh session, an expired window and the end-of-window report follow
   `docs/work-specs/production-page-refactor/spec.md` section 10, points 5 and 6. The plan is
   never restarted from S1a and no active step is launched twice.
5. After S7's landing the owner reads the probe in the phase notes and decides whether to add S8
   and S9 to the phase list for a later window.

## 11. Acceptance criteria

### AC-1: The prerequisites exist before any extraction
S1a's markers and measurements, S1b's Node tests, journeys, covers headers and the gate, and
S1c's decisions with their fixes are on `main` before S2 lands.

### AC-2: Behaviour is identical at every phase
Every section 5 spec and every S1b journey passes at every phase with unchanged assertions; the
checker confirms the e2e diff changed selectors at most; no URL, step slug, test id, copy or
persisted format changed.

### AC-3: Every new pure module runs in Node
`walks.ts`, `walkState.ts`, `doors.ts`, `import/drop.ts` and the draft and kit modules each have
a `scripts/*.test.mjs` with `// guards:`, loaded through rolldown, taking browser IO through
`io`; `npm run depcruise` passes with no config change.

### AC-4: One transition implementation with a tested policy table
Every cell of section 4 is a Node test of `transition`; `walkHasWork` is false right after a
fresh open in every mode; `snapshotWalk` then restore round-trips; no second implementation of
a reset remains in the shell.

### AC-5: Each door's contract holds through one implementation
Every row of section 3.2 is a Node test of `doors.ts` with a late, a failed and a second-press
write; the S1b door journeys pass unchanged; no second implementation of an export, editor or
production door remains in the shell.

### AC-6: The import seam is counted and does not grow
The section 5 counter runs over `import/index.ts` exports; S2 records the number; no later phase
raises it; the shell reads no `import/draft.ts` function directly.

### AC-7: Instruction weight is measured and reported (target, not gate)
Chain sizes for a shell edit and a step edit are recorded at S1a and S7 in the metrics file; the
retirements and rescopes of section 7 are done; a chain still above 40,960 bytes names the next
candidates. The build's chain check stays green at every phase.

### AC-8: The coupling claim is checked directly
S6's representative-change probe is recorded with the files each change would touch; S7 re-runs
co-change with the matcher fixed and records it, with the note that the window is re-read later
over real work.

### AC-9: Each phase stays inside its fence
`git diff --name-only origin/main...HEAD -- src` lists only the phase's allowed files.

### AC-10: The size gate never rose
The shell's budget was installed at 2,601, lowered by each shrinking phase, and never raised.

### AC-11: Docs and rules follow the code inside the first run
S7 rewrote `docs/ARCHITECTURE.md` section 5 (the draft's measured reasoning, the widened
counter, the shell modules), updated section 8, wrote the metrics file, fixed the co-change
matcher and retired or rescoped the rules through `npm run learn`; `npm run audit:instructions`
ran.

### AC-12: Suspected defects were decided on evidence
S1 to S5 are each reproduced or refuted in S1c; a confirmed one was fixed in its own pull
request carrying its regression test before the extraction that would have pinned it.

### AC-13 and AC-14
Inherited by the child plan (the AI run module and the Pro quarantine); not criteria of this
track.

### AC-15: Nothing visible changed
`wizard-shell`, `wizard-entry-fit` and `wizard-finish` pass unchanged at every phase.

## Phases

Each phase runs `/check` and the section 6 matrix and lands with `/queue-merge`; the builder
adds the next phase's notes under `## Phase notes` (the previous verified `main` sha, the merge
sha, the revert command, decisions, traps, the check's findings). Allowed `src` files are
exactly those named. Temporary interfaces are the callbacks a module takes from the shell while
the shell still owns the state; each is removed in the phase that moves that state.

1. **S1a. Instruction relief** (AC-7). Files: `src/components/wizard/import/AGENTS.md`,
   `src/components/wizard/steps/AGENTS.md`, `src/components/wizard/steps/ai/AGENTS.md` (the
   marker line each), the regenerated contracts, `evidence/phase-s1a.md`. No rule file, no `src`
   logic.
2. **S1b. Characterisation of passing behaviour and the gate** (AC-1, AC-10). Files:
   `scripts/wizard-draft.test.mjs`, `scripts/wizard-kit-plan.test.mjs`, `e2e/wizard-shell.spec.ts`,
   `e2e/wizard-finish.spec.ts`, `e2e/wizard-kit.spec.ts`, `e2e/wizard-draft-guard.spec.ts`
   (journeys appended), `e2e/template-deep-link.spec.ts`, `e2e/route-transition-flash.spec.ts`,
   `e2e/mark-legibility.spec.ts` (headers), the gate files of D8, `package.json` (one line) if
   needed, `evidence/*`. No `src/`. Only tests that pass on today's code.
3. **S1c. Defect decisions** (AC-12). One pull request per confirmed defect (the fix and its
   regression test in the spec file that owns the flow); refuted ones characterised in S1b's
   files; the baseline evidence recorded last.
4. **S2. Import drop doors** (AC-2, AC-3, AC-6, AC-9). Prerequisite landed first:
   `e2e/wizard-brand.spec.ts` revived through the export door. Files: `import/drop.ts`,
   `import/index.ts`, `draft/template.ts` (`brandOrClearPatch`), `CreationWizard.tsx`,
   `scripts/import-drop.test.mjs`. No temporary interface. Budget lowered.
5. **S3. Walks table** (AC-2, AC-3, AC-9). Prerequisite: `e2e/project-format.spec.ts` revived.
   Files: `shell/walks.ts`, `CreationWizard.tsx`, `scripts/wizard-walks.test.mjs`. The ladder is
   re-keyed by `StepId`; no props move. Temporary interface: the kit's rail interception stays
   inline until S6.
6. **S4. Doors** (AC-2, AC-3, AC-5, AC-9). Files: `shell/doors.ts`, `CreationWizard.tsx`,
   `scripts/wizard-doors.test.mjs`. Temporary interface: `noteMade`, `rememberWalk` and
   `saveBuiltGraphic` injected from the shell until S5. No rule edits.
7. **S5. Walk reducer and lifecycle** (AC-2, AC-3, AC-4, AC-9). Safety-sensitive. Prerequisite:
   `e2e/wizard-logo.spec.ts` and `e2e/wizard-setup-fields.spec.ts` revived. Files:
   `shell/walkState.ts`, `shell/useWalkLifecycle.ts`, `CreationWizard.tsx`,
   `scripts/wizard-walk-state.test.mjs`. Removes S4's temporary interfaces. `App.tsx` untouched.
   No rule edits.
8. **S6. The kit as operations, and the probe** (AC-2, AC-8, AC-9). Files: `template/useKit.ts`,
   `template/KitConfirms.tsx`, `template/walk.ts`, `shell/walks.ts`, `CreationWizard.tsx`. The
   representative-change probe is written into the phase notes.
9. **S7. Close-out** (AC-7, AC-8, AC-10, AC-11). Files: `docs/ARCHITECTURE.md`,
   `docs/metrics/<date>-wizard-shell.md`, `scripts/metrics/cochange.mjs`, the budgets, the rule
   files through `npm run learn` and the regenerated contracts, `CreationWizard.tsx:100` if A4
   landed, `evidence/*`. Lands after the child's A5 when that track is running (section 8).

Optional, added to this list by the owner after reading S6 and S7:

- **S8. Template folder move** (AC-2, AC-9, AC-11). Files: the moved template files and
  `kitPlan.ts` under `template/`, covers headers, rule scopes, `.dependency-cruiser.cjs`, the
  marker, `docs/ARCHITECTURE.md` section 8. No logic change.
- **S9. Capability `Steps` components** (AC-2, AC-8, AC-9). Only if S6's probe still named the
  shell for a template-only change. Files: `template/TemplateSteps.tsx`,
  `import/ImportSteps.tsx`, `CreationWizard.tsx`.

## What the plan can demonstrate, and what stays uncertain

Demonstrable: behaviour identical on every pinned journey and every Node contract; one owner of
walk state with tested policies; the doors' write order, failure outcomes and navigation moments
under held writes; the chain sizes before and after; whether a representative capability change
still touches the shell. Uncertain: the co-change percentage until a window of real work has
been done on the new layout; whether the folder move (S8) is worth its width; the AI track's
outcome, which this plan only reads through its ledger.

## Readiness

Before S1a: this spec and `work.json` on `main`, `work-spec.mjs status` clean, the "Runnable
plans" line present; `origin/main` CI green; the browser queue idle; `gh auth status` ok;
`wave-row` and `wave-row-deciding` available; no open wave or plan run on these files; the
owner's window supplied. Before S2: S1a's numbers and S1b's tests on main; S1 to S5 decided with
evidence; the baseline recorded.

## Phase notes

Each phase's pull request adds here what the next phase must allow for, newest first: the
previous verified `main` sha, the merge sha, the revert command, decisions taken, traps found,
and the check's findings. The AI track's notes live in its own spec.

### S7. Close-out (built 2026-10-14)

- **Check's findings (S6 check: PASS).** Try-out probes 38627070754 (`2df104e67`) and 38627074089
  (`33fa907c4`) gave 29 of 30 observation lines identical, the one difference #1224's held kit;
  merge group 38623598707 on `33fa907c4` green (wizard-kit 22, wizard-filters 21, community-packs
  4); Node 12/12 and 82/82; D9, D10, D11, D13, AC-9 and AC-10 hold, budget 1,419 of 1,419; the
  moved code equal statement for statement. Carried: 29 of 35 checker mutations red, and four Node
  gaps (Next from Style to the hub, which e2e catches; the draft in hand after a build, because
  the fixture is always on graphic 0; "Back to the kit" with a different kit picked; the
  template-only guard on the kit footer labels). Probe answer 1 holds only for Next: a gate that
  also holds "Skip to finish" edits the shell, whose Skip button computes its own disabled state;
  answers 2 and 3 hold (recorded in the metrics file). Open review items unchanged from `main`: the
  build's read after an await, the step builder written twice (`shell/walks.ts`,
  `template/walk.ts`), the `animStep` fallback 4.
- **Shas:** previous verified `main` `33fa907c4` (S6's merge); built from `33fa907c4`. The AI
  track's A4 (#1199) and A5 (#1203) had landed, so this rule pass is the last writer of section
  8's order. This phase's merge sha is the one the queue records. **Revert:** `git revert -m 1`
  this phase's merge commit, then `npm run contracts:compile -- --prune` and commit what it changes
  (the `.claude/rules` files renamed with the scopes).
- **What landed** (`evidence/phase-s7.md`): the lazy import retargeted to `ai/AiStep` and the A4
  re-export deleted; the three `doors.ts` comments; the
  two `walkState.ts` simplifications S6 named, with a Node assertion pinning `isKitEditStep` on
  every kit-walk step (two mutations that passed every test before now fail); the co-change
  matcher by prefix with `shell/` shared; the rule pass (three retired, nine rescoped, one symbol
  corrected, seven retired rules' e2e scopes dropped, recompiled); `docs/ARCHITECTURE.md` sections
  5 and 8; `docs/metrics/2026-10-14-wizard-shell.md` (chains at S1a and S7, co-change, the probe,
  budgets, plan widths). `npm run audit:instructions` ran. Chains after S7: shell 33,996 (under
  40,960), `import/` 41,536, `steps/` 41,414, the AI step 43,741, each 924 bytes lower; the next
  candidates are named in the metrics file. Budget 1,419, unchanged (AC-10).
- **Decisions** (each revertible by the revert above unless it says otherwise):
  - *No `template/` marker; it goes with S8.* While `kitPlan.ts` and `KitTray.tsx` stay in
    `wizard/`, every kit rule names a `wizard/` file and compiles into the wizard contract anyway,
    so a marker now would hold no rule and add a contract header to the `template/` chain. With S8
    the four kit rules (1,663 bytes) leave the wizard contract, the largest single cut left for
    the `import/` and AI chains. Revert: none needed.
  - *Retirements and rescopes are edits of `status:` and `scope:`, recompiled; `learn` wrote the
    reasons.* `npm run learn` writes new rules and supersessions only (contracts/README.md: retire
    by setting `status: retired`); it appended each retired rule's reason to its record and
    recorded the pass as one observation.
  - *`offer-control-can-change-graphic-front` corrected in place*, not reworded through
    `--supersedes`: its demand is unchanged, and a reword renames the id that two `import/` files,
    an e2e spec and a doc cite.
  - *`spread-every-handler-patches-make-visible` kept:* the drop doors did not absorb it.
  - *`ai/UploadCard.tsx` stays in `ai/`.* It is the AI step's card that `steps/VideoStep.tsx` also
    renders; no rule is scoped to it, and moving it would change two imports for no rule or test
    gain. Revert: none needed.
  - *The `animStep` 4 of the walks without Animation stays.* `shell/walks.ts` is outside this
    phase's list, `scripts/wizard-walks.test.mjs` pins the value against the old shell's
    expression, and nothing reads it off the template walk now that a kit acts only there.
  - *The AI track's four stale path comments wait for their files' next change (#1227).* A
    comment edit in `src/model/aiThread.ts`, `src/model/cssVars.ts` or
    `src/styles/wizard-describe.css` selects the whole browser suite, and in `src/ai/creation.ts`
    adds 11 AI specs; this pull request's plan stays the shell's 53.
  - *The Node assertion* is in `scripts/wizard-walk-state.test.mjs`, a shell-track file the
    phase list does not name; it guards this phase's own `isKitEditStep` edit.
- **For the owner (section 10, item 5):** read the probe in the metrics file and decide whether
  S8 and S9 join the phase list. The builder's view: S8 is worth its width for the instruction
  chains alone (above); S9 is needed only if template or import capability work keeps touching
  the shell, which the Skip gate and the import road (probe answers 1 and 3) still do.
- **Traps:** the command guard reads `--kind trap` in a shell line as the `trap` builtin and
  refuses it, so `learn` ran from a small script given an argument array. A scope change renames
  the per-path `.claude/rules` files, which `contracts:compile` refuses past four deletions without
  `--prune`. `npm run gates -- run --changed` fails `test:ai-gateway` on a machine whose
  `node_modules` lacks `@anthropic-ai/sdk`; CI installs it.

### S6. The kit as operations, and the probe (built 2026-10-14)

- **Check's findings (S5 check: PASS).** Try-out probes 38612104009 (before S5) and 38612112538
  (`2df104e67`) gave 63 of 63 observation lines identical; merge group 38608438772 on `2df104e67`
  all green; Node walk-state 25/25 and siblings 70/70; 18 of 20 checker mutations red; D9, D11,
  D13, AC-9 and AC-10 hold, budget 1,661 of 1,661. Carried: restore building its URL from the kit
  walk has no test (the fixture uses svg); a kit brand change skipping `committedKit` was untested
  (the fixture sat on step 0; closed here, `wizard-kit-moves`); the two `DoorIo` comments saying
  "until S5" are stale (`doors.ts` is outside this fence: S7); the throwing applier (D10) is still
  carried; #1220 is open; the kit plan outliving Back to Entry (decided below).
- **Shas:** previous verified `main` `2df104e67` (S5's merge); built from `2df104e67`.
  Prerequisite: #1224, the kit fix below, its own pull request, landed first. This phase's merge
  sha is the one the queue records. **Revert:** `git revert -m 1` this phase's merge commit (the
  shell takes its kit code and the template walks back; #1224 stays).
- **What landed** (`evidence/phase-s6.md`): `template/useKit.ts` (the kit's moves, tray, hub,
  picker, footer words, its two asks, production name and the set save's busy and error lines, and
  the `resetScreen` the lifecycle hook calls; the decisions `kitStepTarget`, `kitMove`, `kitBuilt`
  and `kitLabels` are pure and tested); `template/KitConfirms.tsx` (both confirms);
  `template/walk.ts` (`TEMPLATE_WALK` and `KIT_WALK` with the rules they answer themselves: Next on
  the design step, forward rail jumps, a built kit's preview, Skip for one graphic, the Community
  shelf); `shell/walks.ts` builds every walk from a `WalkDef`, keeps default rules for the rest and
  asks every rule over the walk's state; `scripts/wizard-kit-moves.test.mjs` (10 Node tests);
  `scripts/wizard-walks.test.mjs` re-based on `WalkState` plus two kit-walk tests; the shell 1,661
  to 1,419 lines and its budget lowered to 1,419; `// covers:` on `community-packs` gains
  `template/{useKit,walk}.ts` (its shelf rule and build-mode switch moved there).
- **The probe (D12, AC-8)**, each change with the files it would touch:
  1. *A template-walk gating rule* (Next on Fields waits for a first line): `template/walk.ts`,
     `scripts/wizard-walks.test.mjs`, the flow's journey. No shell edit.
  2. *A kit confirm* (ask before unticking an edited graphic on a built kit's Kit step):
     `template/useKit.ts`, `template/KitConfirms.tsx`, possibly `kitPlan.ts`,
     `e2e/wizard-kit.spec.ts`. No shell edit.
  3. *An import drop kind* (a Lottie file on the Import graphic step): `import/drop.ts`,
     `import/index.ts` (the counter rises past 15), `import/ImportDesignStep.tsx`,
     **`CreationWizard.tsx`** (the handler, its patch, brand and mode switch in the ladder),
     `shell/walks.ts` if it needs its own walk, the import Node test and spec. The shell is
     touched: the template road is off it, the import road is not (S9's `ImportSteps`).
- **Decisions** (each revertible by the revert above, the first by reverting #1224):
  - *A kit is HELD, never dropped, by another walk* (#1224, D10: reproduced on probe run
    38613883924). It acts only in the template walk (`activeKit`); nothing of another walk is
    recorded into it; a brand chosen there reaches its graphics but not the draft in hand; back in
    the template walk it is there with every edit. Ending it on a walk change was rejected: it
    silently lost edited graphics, which the kit's switch confirm exists to prevent.
  - *A walk answers its own rules over `WalkState`*, so a rule that reads another field needs no
    shell edit; `ProceedState` and `RailState` are gone. The template walks' rules live in
    `template/walk.ts`, which imports `shell/walks.ts` for types only (no cycle); its `step`,
    `START` and `EDIT` are written again there for that reason, and the Node test pins every title.
  - *`useKit` returns props bags* (`picker`, `tray`, `hub`) the shell spreads, and its `save`
    takes the doors' `saveSet`: the doors need the hook's busy setters, so the hook is called above
    the closed wizard's early return and the doors after it.
- **S7 must allow for:** the budget is 1,419, the shell's exact length. `doors.ts` comments: the
  two "until S5" and `setSetBusy`'s "the shell's `kitBusy`" (now `useKit`'s). In `walkState.ts`,
  `chooseBrand`'s `open ? committedKit(...) : state.kit` is `committedKit(state, state.kit)` now
  that `isKitEditStep` is guarded, and `isKitEditStep`'s `walkOf(...).animStep` is always 4; the
  `animStep` 4 of the walks without Animation can go. `template/` has no marker (D11: no recompile
  here), so its rules compile into the wizard contract and the kit rules scoped to the shell or
  `KitTray.tsx` do not load for a `template/` edit: rescope them, and decide the marker with S8.
  `scripts/metrics/cochange.mjs` needs `src/components/wizard/template/` among the template
  capability's prefixes. A deep link in the same open as Continue keeps a held kit and lets the
  link's design be recorded into it (same root as #1220; commented there).
- **Traps:** each rolldown `load()` is its own bundle and renames functions on collision, so a
  rule is compared across bundles by behaviour, never by identity or source text. A Python heredoc
  carrying quotes fails in this Git Bash; write scripts to the scratchpad and run them. Files a
  rebase checks out come back CRLF even when written LF, so a replace script must match `\r\n`.
  `merge-order.mjs` holds a branch that contains an unlanded one, so this phase queued only once
  #1224 had landed. The shell sat at its budget for the fix pull request, which therefore removed
  the one-line `editsKitGraphic` wrapper to stay under it.

### S5. Walk reducer and lifecycle (built 2026-10-14)

- **Check's findings (S4 check: PASS).** Fence 2 `src` files plus the `no-old-editor` covers line;
  budget 2,105 of 2,105; one implementation per door, the removed bodies match `doors.ts`; Node
  24/24, seven own mutations each red; depcruise clean; merge group 38551994094 on `d343b655a`
  all 11 shards green. Carried: no door catches an applier or save that throws (decided below);
  a held second Export checked by names and ids only; the file walk's Edit this graphic has
  probe-only browser evidence, no spec on `main` presses it; `saveBuiltGraphic` owed Node tests
  with held writes (done); `productionPress` must stay a ref (it does); `noteMade` must run after
  the save (it does, and its binding reads the record's id at call time).
- **Shas:** previous verified `main` `d343b655a` (S4's merge); built from `afca974f1`.
  Prerequisite: #1212 revives `e2e/wizard-logo.spec.ts` and `e2e/wizard-setup-fields.spec.ts`
  through the export door, its own pull request, landed first. This phase's merge sha is the one
  the queue records. **Revert:** `git revert -m 1` this phase's merge commit (the shell takes its
  state, open effect and save back; #1212 stays, it only revives tests).
- **What landed** (`evidence/phase-s5.md`): `shell/walkState.ts` (the record of D2 in one
  `useReducer`, `transition` for the five intents, `reduce`, `snapshotWalk`, `walkHasWork`,
  `pickPatch`, and the walk memory's `rememberWalk`, `noteMade` and `saveBuiltGraphic`);
  `shell/useWalkLifecycle.ts` (the open, close and deep-link effects as IO, and the rewind);
  `scripts/wizard-walk-state.test.mjs` (25 Node tests: every section 4 cell as S1c decided it,
  "has work" after a fresh open in all seven modes, the snapshot round trip, the reducer's moves,
  the save with late, failed, vanished and throwing writes; eleven mutations each turned one red);
  the shell 2,105 to 1,661 lines and its budget lowered to 1,661; `// covers:` on
  `wizard-draft-guard`, `template-deep-link`, `route-transition-flash` and `new-graphic-guard`
  gains the two modules (each walks the moved open, close, held walk or deep link).
- **Decisions** (each revertible by the revert above):
  - *The walk memory is one ref, `{ finished, made }`*, as D2 keeps `finishedWalk` and
    `madeThisOpen` refs. `saveBuiltGraphic` and `noteMade` now live in `walkState.ts` over it.
    `shell/doors.ts` is outside this phase's fence, so its `io.saveBuiltGraphic` and `io.noteMade`
    keys stay and the shell binds them to the module's functions; the binding adds only the
    store read of the record's id and the Finish re-read. The two `DoorIo` comments saying "the
    shell's until S5" are stale; the next phase that edits `doors.ts` rewords them.
  - *What an intent does beside the record is part of its result.* `transition` returns an
    `Outcome`: the memory (kept, forgotten, restored), the warning (kept, cleared, raised), one
    `resetScreen` flag (the stretch demo and the kit's two asks, production name and error line,
    which share every cell), `clearAcceptedAi`, the held flag and the URL step. Those stay screen
    state or refs (D2); the hook applies them, so every cell is a Node assertion.
  - *`importedFileError` is in the record*: its lifetime is `importedFile`'s in every intent.
  - *The furthest step is the reducer's rule, not an effect.* Each action's final mode and step
    feed it; a `walk` action carries the mode and the step together so the rule sees both, as
    the effect did after the commit.
  - *One pick patch* (`pickPatch`) for a Browse card, the images walk's Template step and a deep
    link. The Template step's copy had left out `category`; every catalog design's category is the
    key it is listed under (528 of 528, checked in Node), so sending it is a no-op there. The deep
    link reads the brand from the record, which the fresh transition queued before it has
    already set, so `brandInForce` is gone.
  - *`LibraryIo` carries `librarySaveEffect` too*, so the Node bundle never loads
    `model/library` and the durable store behind it.
  - *The plain setters keep the record when nothing changed*, as a React setter bails out:
    AiStep reports its thread on mount.
- **D10, decided on evidence:**
  - *A save that throws:* refuted by reading. `saveCurrentGraphic` and `saveGraphicAs` return
    their failures and never throw; a scripted throwing write rejects the save, recorded in Node
    as today's behaviour. *An applier that throws:* not reproduced (Prettier's failure is caught in
    `formatTemplate`; no draft found that makes `buildDraftTemplate` throw); still carried.
  - *Restore and a deep link in one open* (S1c's note): characterised in Node. By `App.tsx`,
    Back onto `#/new/<id>/step/<name>` hands the design to `openGallery`, so the link replaces
    the restored draft under the warning, and the surviving made record would take the link's
    design on the next finish. Not reproduced in a browser: #1220, reproduction first.
- **S6 must allow for:** the budget is 1,661, the shell's exact length. The kit's picker and plan
  are the record's (`buildMode`, `kitPick`, `kit` actions; a `kit` action may carry the draft and
  the step); `isKitEditStep` and `committedKit` are exported from `walkState.ts` and the shell
  wraps the first as `editsKitGraphic`. The kit's moves (`moveKitTo`, `openKitGraphic`,
  `buildKitAndOpenHub`, `applyKitStyle`, `saveKit`) are still inline and dispatch. Its transient
  UI (the two asks, the production name, `kitBusy`, `kitError`) is still shell `useState`, reset
  through the hook's `resetScreen` callback: `useKit` must supply that reset. A kit plan still
  outlives Back to Entry (S3's note; a mode change does not reset it).
- **Traps:** Git Bash rewrites an argument that starts with `/` into a Windows path, so a script
  argument like `//` or `/` arrives as `C:/Program Files/Git/...`. Each rolldown `load()` is its
  own bundle, so `NO_BROWSE_FILTERS` from two loads are equal but not the same object. A
  worktree-isolated session refuses compound shell lines that name git: one git command per call.
  The revived `wizard-logo` reads the wizard's preview, which plays the entrance on every
  rebuild, so its geometry waits until the boxes are at rest.

### S4. Doors (built 2026-10-14)

- **Check's findings (S3 check: PASS).** Fence 2 `src` files plus two covers lines; budget 2,357
  of 2,357, never raised; Node 10/10, the old expressions match `29883468f`, eight own mutations
  each turned one red; diff equivalence checked; merge-group run 38542146537 on `8474e38df` all
  11 shards green (wizard-shell 18/18, wizard-finish 22 plus one old skip, wizard-kit 21/21,
  project-format 9 plus 3 retired skips, template-deep-link 2/2); the step-URL try-out on probe
  38545433234 6/6 (template, kit, design, svg, file, AI). Carried: the video walk (sign-in) and
  the images walk (AI only) were not run in a browser, pinned by Node literals and the code
  compare; non-template step URLs are pinned by no spec on main (only the checker's deleted
  probe); a kit plan outlives Back to Entry (S6 owns it); the design walk's Finish rows Fields
  and Look go back to Prepare and Text (noted, not reproduced); the shell budget equalled its
  length; the kit's inline moves read `walkSpec.animStep`/`finishStep` until S6; the local
  browser queue refuses jobs on this machine (#1067), so browser evidence comes from CI.
- **Assessment A: PASS** (wave-row, read-only, `/so` brief) on `c25c1b59d`: behaviour identical
  door by door, every 3.2 row covered, type-only imports, fence and budget met. Its three low
  findings: the held production write now has its own row; the microtask wording is corrected
  below; the `noteMade` ordering and the owed `saveBuiltGraphic` tests are in S5's list.
- **Shas:** previous verified `main` `8474e38df` (S3's merge); built from `20bda8867`. This
  phase's merge sha is the one the queue records. **Revert:** `git revert -m 1` this phase's merge
  commit (the shell takes its door copies back).
- **What landed** (`evidence/phase-s4.md`): `shell/doors.ts`, `makeDoors(io)` returning
  `export(apply, name)`, `addToProduction(apply, dest, name)`, `editArtwork(apply)`,
  `saveSet(templates, fallbackName, dest, activation)`, `openSet(save, dest)` and
  `exportSet(save, dest)`; the shell's three export copies, two editor copies, three production
  wrappers, `pressProductionDoor`, `addToProduction`, `saveTemplateSet`, the kit and AI set pairs
  and `reportFailedCreateSave` gone, each Finish prop now one door call over the mode's applier;
  `scripts/wizard-doors.test.mjs` (24 Node tests, every section 3.2 row late, failed and pressed
  twice; ten mutations each turned at least one red); the shell 2,357 to 2,105 lines and its
  budget lowered to 2,105; `// covers:` on `no-old-editor` gains `shell/doors` (it names the
  shell by path and walks the editor door; the other four specs of the row select it through
  `wizard/**`).
- **Decisions** (each revertible by the revert above):
  - *`rememberWalk` is not in `io`.* The appliers call it and stay with their mode (D4), and the
    doors never snapshot, so the temporary interface is `saveBuiltGraphic` and `noteMade`. Moving
    the snapshot into the door would also snapshot a press whose applier refuses.
  - *The one-press guard's rule is the door's; its flag is the shell's `addingToProduction` ref,*
    passed as `io.productionPress`. `makeDoors` is built each render over that render's closures,
    so a flag held inside it would reset on every render. S5 may keep the ref or move it.
  - *`saveSet` is a sixth door beside D4's five.* R5's gate over every member, the busy and error
    lines and the activation event are the set rows' contract, so they moved with `openSet` and
    `exportSet`; the shell's `saveKit` and `saveAiPack` only choose the set and its name.
  - *A door's name is a thunk read after the build*, as the inline bodies read it: the catalog's
    `draftName` needs the variant its applier checked.
  - *The sync file applier is awaited like the others.* The file editor door's close and the file
    export's save now start one microtask later, so React commits one render first, with the
    wizard still open; nothing paints, and the catalog and AI doors always had this interleaving.
  - *The store-backed IO is one module constant in the shell* (`STUDIO_DOOR_IO`): the export
    window, the editor, the router, the alert and the writes, read at call time.
  - *Second presses are recorded as today's (R7):* the export and editor doors keep no guard (two
    builds, two saves; a second press while the first save is held reaches `saveBuiltGraphic`
    before the first `noteMade`, so it resolves by name, not over the record the walk made); the
    set doors rely on `busy`, raised in the press itself, which disables their buttons; the Node
    rows say so.
- **Noticed in review, not reproduced, kept as today (D10):** a second Export press during a held
  save rebuilds the working project while the first save is still committing, which may leave
  the record and the working document apart; and no door catches an applier or save that throws
  (the press then ends as an unhandled rejection with nothing said). Each needs a reproduction
  before it is called a defect; S5 moves the save and is the natural place to try both.
- **S5 must allow for:** the budget is 2,105, the shell's exact length. `doors` is rebuilt each
  render from `STUDIO_DOOR_IO` plus `saveBuiltGraphic`, `noteMade`, `closeGallery`,
  `addingToProduction`, `setKitBusy` and `setKitError`; S5 replaces the first two (they read
  `madeThisOpen` and `finishedWalk`) and the appliers' `rememberWalk` with the reducer's state.
  S6's `useKit` owns `kitBusy` and `kitError` (D6) and so supplies `setSetBusy`/`setSetError`.
  The appliers (`applyDraftProject`, `applyAiProject`, `applyImportedFile`) are still in the shell.
  Still owed from section 2: Node tests of `saveBuiltGraphic` with held writes (over a record,
  `needs-name` minting, a failure that returns and never throws), for S5 when it moves it.
  The Node rows pin `noteMade` after the save, but not why: it reads the record's id from the
  store, so whatever the reducer keeps must be read after the save too. `productionPress` must stay a ref, not reducer state: a dispatched flag is not
  visible to a second press arriving before the re-render. Sections 3.1 and 3.2 cite baseline
  line numbers; the door bodies now live in `shell/doors.ts`.
- **Traps:** a Node row that awaits a door held on a write the test never lets go hangs the run
  (a mutation found it); the test gives every case a 5-second timeout and lets holds go before
  awaiting. New files are LF in this worktree while the shell is CRLF; git normalises both.
  `onExport={onExport}` in `FinishStep` passes the click event, so the door bindings are arrows
  that drop it.

### S3. Walks table (built 2026-10-14)

- **Check's findings (S2 check: PASS).** Fence 4 `src` files; 11/11 Node, 5 mutations each turned
  one red; depcruise clean; budget 2,482 of 2,482; counter 15 of 48 on main; browser evidence from
  merge-group run 38523362578 (import-svg, import-graphic, import-prepare, name-collision 7/7,
  wizard-brand 7/7, wizard-shell 18/18, entry-fit 23/23, finish, draft-guard 8/8; every skip is
  #800); the refused-zip try-out green on probe 38527215742. Carried: `evidence/phase-s2.md` and
  S2's notes said the base count was 13 of 44, which their own command gives as 13 of 43 (both
  corrected in this pull request); no e2e drops a brand over an SVG or a picture (Node pins it);
  the refused-template-package path has no e2e (this phase does not touch it, so not pinned); the
  local browser queue still refuses jobs (RAM), so browser evidence comes from CI.
- **Shas:** previous verified `main` `7f07a0b24` (S2's merge); built from `29883468f`.
  Prerequisite: #1173 revives `e2e/project-format.spec.ts`, its own pull request, queued first
  (its CI: 9 passed, 3 skipped, run 38529200781). This phase's merge sha is the one the queue
  records. **Revert:** `git revert -m 1` this phase's merge commit (the shell takes its arrays and
  index comparisons back; #1173 stays, it only revives tests).
- **What landed** (`evidence/phase-s3.md`): `shell/walks.ts` with one `WalkSpec` per walk (titles,
  subs, URL names, a `StepId` per step, the furniture each step carries, `animStep`, `finishStep`,
  `designBy`, the Finish read-back map) and the functions the shell asks (`walkOf`, `stepIndex`,
  `slugIndex`, `railIndex`, `stepAfter`, `summaryStep`, `previewOn`, `offersBrand`,
  `needsCatalogOn`, `offersSkip`, `canProceed`, `railJump`); the shell's ladder re-keyed by
  `StepId`; `scripts/wizard-walks.test.mjs` (10 Node tests, seven mutations each turned one red);
  the shell 2,482 to 2,357 lines and its budget lowered to 2,357; `// covers:` gains
  `shell/walks.ts` on `template-deep-link` and `wizard-draft-guard`, the two specs that name the
  shell by path and walk through the moved rules (the rest select it through `wizard/**`).
- **Decisions** (each revertible by the revert above):
  - *A `StepId` names what a step is, never its URL.* The URL stays the slugged title, so the SVG
    walk's mapping step is `map` but "Fields" in the URL, and the Import graphic card's drop zone
    is `artwork` on the design and SVG walks and `file` on the file walk (its Next asks for the
    file, not a category).
  - *The shared furniture is per-step flags* (`preview`, `brand`, `skip`, `catalog`), with two
    rules left as code because they read state: a BUILT kit previews only its editing steps, and
    the template walk's Skip stands down off "one graphic". `BRAND_MODES` is gone; its role is the
    `brand` flag (the rule `wizard/offer-control-can-change-graphic-front` still names it: S7
    rewords it).
  - *Every moved rule is checked against the expression it replaced*, transcribed into the Node
    test from `29883468f` and compared over every walk, build mode, kit state, step and input
    (more than a thousand states for Next alone), not only against hand-picked cases.
  - *The three Animation branches of the ladder are one* (`stepId === 'animation' && variant`):
    same component, same props, mutually exclusive by walk.
  - *`animStep` is 4 on the walks without an Animation step (ai, file, video)*, today's number,
    because the kit's inline moves read it in whatever walk a kit plan is carried into (below).
    `finishStep` is one past the end on the video walk (it was 5; both are past its last step).
  - *The SVG preview markers are keyed through `walkOf('svg', false)`, not the on-screen
    `stepId`,* so the preview template recomputes on exactly the dependencies it did: a
    recompute is a new object, and a new object rebuilds the preview iframe.
  - *The AI step's dropped file lands on `stepIndex(walkOf('file', false), 'finish')`*, the name
    S2 asked for; the deep link on the template walk's `fields`; the images walk's Continue on
    `template`; Text's way back on `prepare`.
- **Noticed, not reproduced, kept as today (D10):**
  - *A kit plan outlives Back to Entry.* By the code: build a kit, Back to the Kit step, Back to
    Entry, choose Import graphics (or Create with AI from Browse); `kit` is still set, so the kit's
    inline moves fire in that walk (the tray on its steps 2 to 4, "← All graphics", the hub). Only
    a fresh open, a rewind or a restore calls `resetKit`. It is why `animStep` keeps 4 above. S6
    owns the kit: reproduce it before moving the kit's moves into `useKit`.
  - *The design walk's Finish read-back rows go to odd steps:* "Fields" returns to Prepare and
    "Look" to Text (the table's `summary` for `design` says so in plain words now).
- **S4 must allow for:** the shell's budget is 2,357, its exact length, so a line added beside
  this plan fails `check:file-budgets` until a phase lowers it. The shell now holds `walkSpec`
  and `stepId` beside `step`; the Finish branches of the ladder test `stepId === 'finish'` plus the
  mode, and the doors they call are untouched. The kit's own moves stay inline and numeric
  (`isKitEditStep`, `goToStep`'s kit branches, `moveKitTo`, the Back and Next labels) and read
  `walkSpec.animStep` and `walkSpec.finishStep`; S6 replaces them with the kit `WalkSpec` and can
  then drop the `animStep` 4 of the walks without one. `onOpenImported`'s `setMode('file')` and the
  import `setMode` calls are still inline (S5's).
- **Traps:** the worktree's files are CRLF (`core.autocrlf`); a script that splits on `\n` and
  writes lines back leaves mixed endings, so normalise or edit through the editor. The Node test
  imports `walks.ts` through `scripts/wizard-load.mjs`; its `import type` of `SummaryStepKey` from
  `steps/FinishStep` is erased, so the module loads without the step components. A queued
  prerequisite needs its own `/check` stamp (`npm run stamp`) on its own branch before
  `queue:merge`; the `Reviewed` check fails until then.

### S2. Import drop doors (built 2026-10-14)

- **Check's findings (S1c check: PASS).** Six fixes verified red before green on probe runs
  38485638743 and 38486142632 and green on each pull request's CI; main run 38500380159 on
  `1dc34cebd` green including the nine new tests; the D9 exception confirmed (#1158's one
  assertion); gates, protection, capacity 94%, budget 2,516 of 2,601, ledger clean. Carried:
  S1c's note said `wizard-shell` was quarantined by #1160, which is still open; that line is
  corrected below. The local browser queue refused jobs (about 1.4 GB free against its 4 GB
  floor), so browser evidence came from CI.
- **Shas:** previous verified `main` `1dc34cebd` (built from `1e9ff904b`). Prerequisite: #1163
  revives `e2e/wizard-brand.spec.ts` through the export door, in its own pull request, landed
  first as `25218ca58` (its CI run 38519527933: 7 passed; capacity 94.2%, +0.7 minutes, under
  the 95% line). This phase's merge sha is the one the queue records. **Revert:** `git revert -m 1` this
  phase's merge commit (the shell takes its inline handlers back; #1163 stays, it only revives
  tests).
- **What landed** (`evidence/phase-s2.md`): `import/drop.ts` with `svgDropPatch`, `clearSvgPatch`,
  `artDropPatch` and `templateFileDropped`, exported through `import/index.ts`;
  `brandOrClearPatch` in `draft/template.ts`, replacing the five brand-or-clear spreads (the SVG
  and picture drops, the Browse and Template picks, the deep link); `scripts/import-drop.test.mjs`
  (11 Node tests; two mutations each turned one red); the shell 2,516 to 2,482 lines and its
  budget lowered to 2,482; `// covers: src/components/wizard/import/drop.ts` on
  `import-name-collision` and `wizard-draft-guard`, the two specs that drop a template file and
  covered the shell but not `import/`.
- **Section 5 counter (AC-6): 15 of the 48 `import/index.ts` exports are named outside
  `import/`** (by text, as the old counter: 13 in code; `armTimerClock` and `DesignFieldSpec` in
  comments only). On `1e9ff904b` the same count was 13 of 43: the shell's two `import/draft.ts`
  reads (`svgDraftFromImport`, `svgDraftCleared`) left and the four drop doors came in. No later
  phase may raise 15. The shell reads no `import/draft.ts` function. The command is in
  `evidence/phase-s2.md`; S7 writes it into `docs/ARCHITECTURE.md` section 5.
- **Decisions** (each revertible as stated):
  - *`svgDropPatch` and `clearSvgPatch` call the SVG road's `svgDraftFromImport` and
    `svgDraftCleared` rather than moving them.* Since the baseline the svg-import-engine plan put
    the whole drop and clear into those two functions in `import/draft.ts`; that file is the
    neighbour's (non-goals), and the corpus harness, `scripts/svg-fit-rungs.test.mjs` and
    `scripts/driven-clock.mjs` build "as the wizard would" through those names. So the shell's
    door is a one-line call, and the fit, furniture, prefix and naming decisions stay where the
    corpus tests them; `import-drop` pins them again over hand-made inventories. Revert: move
    the two bodies into `drop.ts` once the svg-import-engine plan is done, and repoint the three
    scripts.
  - *`artDropPatch(designArt, importedImages)`, not `(file, ctx)`.* The handler receives the
    artwork the step already measured; there is no file to read and, with the brand the
    caller's, no context. Revert: none needed.
  - *`templateFileDropped` resolves to `{ ok, file }` or `{ ok: false, error }` and never
    throws*, with `importTemplateFile` injected (it pulls JSZip). The two setters and the mode
    change stay in the shell, which owns that state until S5.
  - *The mode each drop switches to stays in the shell* beside its call (`svg`, `design`,
    `file`): the walk is S3's and S5's, and a drop door returning a mode would be a second owner
    of it.
  - *`brandOrClearPatch(null)` is the three-field clear the five sites sent* (palette, custom
    palette, typeface), not `brandClearPatch()`, which also clears `customFont` and `brandLogo`;
    the chooser's own None keeps `brandClearPatch`.
  - *The prerequisite went through the export door with one wait changed.* The revived tests
    waited for the editor door to close the wizard; the export door keeps the wizard open by
    design, so they wait for the export window instead. No assertion changed.
- **Noticed in review, not reproduced, kept as today (D10):** a template file read that finishes
  after a later drop or clear still sets `importedFile` and file mode (no check that the read is
  still the current one; S5 owns that state); and both drops reset `animation` to
  `{ presetId: null, outPresetId: null }` only, so `mergeDraft` keeps `steps`, `motionIn` and
  `motionOut` from the artwork before, where the catalog picks send `steps: null`. Each needs a
  reproduction before it is called a defect.
- **S3 must allow for:** the shell's budget is 2,482, its exact length, so any line a
  beside-running plan adds to the shell fails `check:file-budgets` until S3 lowers it again; a
  plan that must add lines says so in its own notes rather than raising the number. The import
  ladder branch (`step === 1 && (mode === 'design' || mode === 'svg' || mode === 'file')`) still
  holds the `setMode` calls beside each drop door; S3 re-keys it by `StepId` and leaves the
  calls. The AI step's `onOpenImported` still writes `importedFile` and jumps to file mode's
  Finish with `setStep(2)` inline: the walks table must give that Finish a name. With #1163
  landed, `wizard-brand` (7 tests) runs on every shell change, and S3's `project-format` revival
  adds more minutes to a capacity line already at 94%.
- **Traps:** the local browser queue refused every job again (RAM). A worktree-isolated session
  cannot drive git in a second worktree, so the prerequisite was built as a second branch in this
  one; `npm run queue:merge -- <branch>` queues a branch by name.

### S1c. Defect decisions (built 2026-10-14)

- **Check's findings (S1b check: PASS).** Node 16/16 and the factory draft test 15/15, two
  mutations each turned one test red, the gate fails at 2,400 and passes at 2,485 of 2,601, the
  twelve journeys ran green on main's CI run 38481678067, selection 53 specs, capacity 93.8%.
  Carried: the local browser queue refused every job (1.3 to 2.0 GB free against its 4 GB
  floor), so journey evidence came from CI; still unpinned after S1b: the AI and file production
  and export doors, Continue for a dropped file (pinned now, below), reloads on non-template step
  URLs (pinned now, below). S1b's three candidates are decided below.
- **Shas:** previous verified `main` `d8c967270`. Fix pull requests, landed one after another,
  each from `main` after the one before: #1146 `e47c39627` (S1), #1149 `ef2ca46ee` (S1b's
  Continue), #1151 `2fee11e04` (S2), #1154 `cc888e7d0` (S3), #1155 `1b00addc0` (S5, the format
  Change), #1158 `1f7d994a0` (R7). This phase's own pull request carries the evidence, the
  characterisation tests and these notes; its merge sha is the one the queue records.
  **Revert:** `git revert -m 1` the merge commit of a fix to restore that defect (each is one
  hunk group in `CreationWizard.tsx` plus its journey); this phase's own pull request adds only
  tests and docs.
- **Evidence:** `evidence/phase-s1c.md`, one row per item: reproduced or refuted, the journey, what
  it showed, the decision. Every reproduction ran on unfixed `d8c967270` from the probe branch
  `claude/plan-wizard-shell-p3-probe` (CI runs 38485638743 and 38486142632), then green in its
  fix's own CI.
- **Decided, item by item:** S1 reproduced, fixed. S1b's Continue reproduced, fixed. S2 reproduced
  on Browse, fixed; refuted for the deep link (it starts from `initialDraft()`), which now sends
  the same reset anyway so the three picks are one patch. S3 reproduced (also reachable without
  the rare one-shot pair: any brand in force when a link lands), fixed. S5's format Change
  reproduced, fixed; S5's `editSummaryStep` refuted (it is passed only to the one-graphic Finish,
  which renders when `!kit`), characterised; `kitBusy` refuted (the save's own `finally` clears
  it; a reset on open would let a second set save start while the first still writes),
  characterised. S1b's reload refuted, characterised: a reload keeps no walk's material, so Entry
  is the honest landing. R7's second press decided a defect (a reader pressing twice expects one
  production; the entry's New production already ignores a second press), fixed. **D9 note:**
  that fix changed one assertion of an S1b journey, the one S1b wrote as "recorded, not
  endorsed" for this decision, from two productions to one: more protection, not less, and the
  test count is unchanged.
- **The walk's keep/clear table (section 4, decided; S5's reducer pins it).** Changed by a fix:
  bold.

  | Field | Continue | Restore | Fresh | Rewind | Close |
  |---|---|---|---|---|---|
  | draft, mode, step | kept; step = `lastStep`, **counted from the step a mode change happened on** (#1149) | from the snapshot; URL replaced with the ended step | `initialDraft()` + the production's brand; mode template; step from the URL (template walk only) or 0 | reset to Entry, the project format kept | step 0 |
  | browseFilters, aiResult, aiThread | kept | from the snapshot | cleared | cleared | kept |
  | importedFile, importedFileError | kept | from the snapshot; error cleared | **cleared** (#1146) | **cleared** (#1146) | kept |
  | contextProductionId | kept | the production the walk landed in, else the snapshot's | the one-shot `pendingProductionId` | kept: the production is why the wizard opened, and a rewind changes the road, not the destination | kept |
  | brandChoices, brandId | kept | from the snapshot | saved looks; None, or the production's brand | choices kept, brand None: on purpose (the code says so), since the rewind clears the draft that carried it and the chooser still offers it first | kept |
  | acceptedAiGeneration | kept | kept | cleared | kept: unobservable (the rewind clears the `aiResult` it is compared with, and generation ids are unique), so S5 keeps today's value | kept |
  | kit state | kept | `resetKit` | `resetKit` | `resetKit` | kept |
  | kitBusy | the save's, in every intent: set at the press, cleared by the save's own end | | | | |
  | stretchDemo | kept | cleared | cleared | cleared | kept |
  | SVG overlays, replayKey | no reset in any intent: the mapping step clears the overlays on unmount, which every intent causes, and `replayKey` is a replay counter whose value means nothing | | | | |
  | `heldWalk` | cleared on open | cleared on open | cleared on open | n/a | set when left with work (`walkHasWork`) |
  | `resumeAsk` | none | raised | cleared | n/a | n/a |

  Deep link: Fresh followed by `pickDesign` on Fields in template mode, **carrying the brand in
  force exactly as the Browse pick** (#1154), with `animation.steps: null` as every pick (#1151).
- **S2 must allow for (what changed in `CreationWizard.tsx`, 2,485 to 2,516 lines with the
  svg-import-engine landings; budget 2,601):**
  - The fresh branch of the open effect and `leaveStep` each clear `importedFile` and
    `importedFileError`. The Entry card's own clear (Import graphic) stays.
  - The two `lastStep` effects are one effect over `[open, mode, step]` with a `lastMode` ref.
  - The Browse pick and the deep link send `animation: { presetId: null, outPresetId: null,
    steps: null }`, as the images walk's Template step does.
  - The deep link spreads `brandPatch(brandInForce.current)` or the three-field clear, a fifth
    copy of the brand-or-clear spread for D5's `brandOrClearPatch` (2120, 2186, the Browse pick,
    the Template step pick, and this one). `brandInForce` is a ref written at render and by the
    open effect's fresh and restore branches, because a warm link lands in the same commit as the
    open; S5 removes it when the deep link becomes Fresh + `pickDesign` in the reducer.
  - `revealFormatPicker`'s fallback goes through `moveKitTo` in a kit (S3's walks table and S6's
    `useKit` take it with the rail interception).
  - `addingToProduction` (a ref beside `creatingProduction`) and `pressProductionDoor` wrap the
    catalog, AI and file production doors: a press while one is in flight is ignored. S4's
    `addToProduction` door takes the guard, and its Node second-press row asserts one production.
- **Noticed, not reproduced (for S5):** a step URL after a deep link carries the design
  (`#/new/<id>/step/<name>`, the route sync keeps `design`). By the code, browser Back onto such a
  URL after a door closed the walk opens the wizard with that design pending, so the restore and
  the deep link run in one commit and the link resets the draft under the walk-back warning. S5's
  lifecycle hook reads the route and should characterise this before it decides the intent.
- **Traps:** landed fix branches lose their local ref, and this phase's own branch, which still
  equalled `main` while the fixes landed, was gone too: recreate it from `origin/main`. The rail's
  format Change shares the class `wz-rail-change` with the kit's "All graphics" link, so a kit
  journey names it `.wz-rail-foot .wz-rail-change`. A held kit save's landing still moves the
  reader after they left and opened another walk (recorded in wizard-finish, not judged: the window
  needs a durable write held for seconds). `e2e-capacity --changed` read 94% (table values) on
  every pull request of this phase. **`e2e/wizard-shell.spec.ts` is proposed for quarantine, not
  quarantined** (#1160, still open when S2 was built; `e2e/quarantine.json` on main lists only
  `editor-foundation` and `rundown-history`): S1b's deep-link journey read the Fields rows before
  their lazy chunk had rendered (0 rows on #1158's first run 38496838758, green on its re-run);
  this phase's pull request waits for the first row before reading. The file runs in the blocking
  shards; if #1160 lands, it moves to `quarantine.yml` until released, which AC-15 and S2 to S5
  must then allow for.

### S1b. Characterisation and the gate (built 2026-10-13)

- **Check's findings (S1a check: PASS).** Carried: S1a's evidence states its limitations inline
  under no heading (S1b's has a Limitations heading); the chain numbers go into the track's one
  metrics file at S7, a decision recorded under S1a with its revert; S1a's file list did not name
  the three generated `.gitattributes`; three chains stay over 40,960 (`import/` 42,347,
  `steps/` 42,867, `steps/ai/` 51,910); the `npm run rules` lookup reads rule scopes, so the
  saving shows in the AGENTS.md chain, not in the lookup.
- **Shas:** previous verified `main` `13b326773`; built on `claude/plan-wizard-shell-p2-build`,
  pull request #1134; the merge sha is the one the queue records. **Revert:** `git revert` the
  pull request's merge commit; nothing under `src/` changed, so nothing else depends on it.
- **What landed** (`evidence/phase-s1b.md`): the size gate and the shell's budget; Node tests for
  the draft (15) and the kit plan (10); 12 journeys appended to `wizard-shell` (3),
  `wizard-draft-guard` (2), `wizard-kit` (1) and `wizard-finish` (6); real `// covers:` headers
  on `template-deep-link`, `route-transition-flash` and `mark-legibility`. The shell's plan is
  53 specs, 53.1 table-minutes (was 50, 52.0). Capacity measured on CI: 94.3% and +1.2 minutes on
  the first run, 93.6% and +0.4 on the final tip; under the 95% line, so no budget exception.
- **Decisions** (each revertible as stated):
  - *Budget at 2,601, not the shell's 2,485.* The shell is 2,485 lines on this `main` because the
    svg-import-engine plan's phase 2 shrank it after the baseline. D8 and AC-10 install 2,601, and
    a lower number could fail a beside-running plan's landing on a few lines it never meant to
    add. So 116 lines of growth pass unnoticed until S2, the first phase of this plan that shrinks
    the shell, lowers the budget to the actual count. Revert: set `lines` to 2485 now.
  - *The gate's guard is `scripts/file-budgets/*.json`, not `scripts/file-budgets/`.* A bare
    directory matches no file, so `gates.mjs audit` refuses it. Each budget is
    `{ "file", "lines", "why" }`; `scripts/file-budgets.json` (production-page's D8 layout) is read
    as one such entry or an array, and a file budgeted in both layouts is refused. Production-page
    adds its file to the gate's `// guards:` line when it budgets one.
  - *`wizard-draft.test.mjs` is a factory gate (`needs: browser`).* `variant.create()` needs
    `DOMParser` (all 528 designs fail in bare Node), so the `buildDraftTemplate` case runs the same
    bundles in one Chromium page; the other 14 cases run in Node in the same file. CI's Factory
    gates job ran it (ok). Revert: if a DOM-free build path appears, move the page case to Node and
    the file to `gate: build`.
  - *Both Node tests redirect `../import` to `import/draft.ts`* (a 9-line rolldown resolver beside
    the field-auto-map `load()`): the index also re-exports the import steps' components, which
    fail to load in Node (a stylesheet, then a module-level `DOMParser`). This answers section
    5.1's "S1b verifies that `draft/core.ts` loads that way": not as it stands, yes with the
    redirect.
  - *The kit tests use fixture designs* whose `create()` writes the options it was handed into the
    template, so each assertion reads which draft a graphic was built from. Real designs through
    the kit stay with `wizard-kit`.
  - *The production-brand journey asserts the chooser only*; the palette half waits for S2's
    `wizard-brand` revival, as section 5.3 says.
  - *`mark-legibility` covers `useMarkLegibility.ts` too*: its wizard test walks to the Style step;
    it is skipped today (Advanced mode, #800), and the header names its code for the day it is
    revived.
- **Recorded as today's behaviour, for S1c to decide:** a second press of the production door
  while the library save is held runs both presses: one library record (the second press saves
  over the first by name) and two productions named "Friday Show", each pooling the graphic
  (`wizard-finish`, "pressed twice"). R7 called this undecided; it is a duplicate production.
- **For S1c (left out because they fail on today's code):**
  - *Continue in file mode returns to Entry and the file is lost to the reader.* Reproduce: Home,
    + New graphic, Import graphic, drop a finished `.html` template (the import card shows it),
    the wizard's Home door, + New graphic, Continue: the import card is gone (CI run 38467355045,
    shard job 115538360001, `toContainText` on `import-template-card`: element not found). By the
    code: dropping a file switches the mode from `design` to `file`, the `[mode]` effect resets
    `lastStep` to 0, and the `[open, step]` effect does not re-run because the step stays 1, so
    Continue sets step 0; pressing Import graphic there clears `importedFile`. Same root as S1
    (the held-walk bookkeeping across a mode change). The journey ("Continue keeps a dropped
    template file", a fixture `.html` with one field) goes back in with the decision.
  - *A reload of a non-template walk's step URL does not land on that step.* A cold open resolves
    the step name against the template walk only (`CreationWizard.tsx`, the fresh branch of the
    open effect, "Resolved against the walk this reset installs"), so by the code a reload of
    `#/new/step/images` (import), `design`, `prepare`, `text` (design), `template-file` (file),
    `create` (AI), `video` and `kit` lands on Entry, and the svg walk's `fields` lands on the
    template walk's Fields. Reproduce: open the mode, step forward, reload. Not run: the probe was in the local run that never started. Whether a
    reload should restore a non-template walk at all (its draft is gone after a reload) is the
    decision; the journey for those walks goes in with it.
- **S1c must allow for:** the hold switch in `wizard-finish` (`armWriteSwitch`) holds or refuses
  the writes of one durable key, so a door can be observed between two writes; S1c's defect
  reproductions with a held durable write (S5's kit bypasses) can reuse it from that file. The
  shell's budget is 2,601; a fix pull request that adds lines to the shell stays under it.
- **Traps:** `gates.mjs run --changed` does not run a brand-new test file unless its guards are
  among the changed paths (a test's derived guards are its imports and sibling, not itself): run
  new Node tests directly. `e2e-capacity --changed` locally counts an edited spec at its table
  value (+0.00); the added minutes only show in CI's measured line (the Combined E2E report job).
  The import card names a dropped template by its file name, lower-cased, not by its
  `<title>`. The local browser queue held every browser job from 22:10 to 01:00 on 2026-10-13 (0.7 to
  2.8 GB free against a 4.0 GB floor), so the journeys ran on CI only. The gate does not enforce
  "only goes down": a raised number is for the reviewer to refuse. Its `// guards:` line names
  only the shell and the per-file budgets, so a plan that budgets another file adds that file
  (and `scripts/file-budgets.json` once it exists) to the line, or `gates run --changed` skips
  the gate for it. Both came from S1b's review and were left as written by D8.

### S1a. Instruction relief (built 2026-10-13)

- **Check's findings:** none (no check preceded this phase).
- **Shas:** previous verified `main` `4508e1331`; contracts commit `0e912b7f6` on
  `claude/plan-wizard-shell-p1-build`; the merge sha is the one the queue records for that pull
  request. **Revert:** delete `src/components/wizard/{import,steps,steps/ai}/AGENTS.md` and the
  `.gitattributes` beside each, run `npm run contracts:compile`, commit what it changes.
- **Measured** (`evidence/phase-s1a.md`): the 92 wizard rules now sit 31 in the wizard contract,
  19 in `import/`, 20 in `steps/`, 22 in `steps/ai/`, none lost or duplicated. Chains: shell edit
  58,678 -> 34,807 (under the 40,960 target); `import/` 42,347; `steps/` 42,867; `steps/ai/`
  51,910 (13,626 free of the cap). This supersedes the estimates in "Why" ("75 of the 107 active
  wizard rules") and section 7 ("about 32 rules", "about 44 KB"): the shell's file held 92 rules,
  61 moved, and the AI-step chain is 51,910, not about 44 KB.
- **Decision:** AC-7 and section 7 say S1a's chain sizes go in `docs/metrics/<date>-wizard-shell.md`;
  S1a's phase entry and its row name only `evidence/phase-s1a.md`, and section 8 allows one
  metrics file per track. S1a's numbers live in the evidence file, and S7 writes the track's one
  metrics file with S1a's numbers as its "before" and its own as "after", which meets AC-7's
  "recorded at S1a and S7 in the metrics file". Revert: write that file now from the evidence.
- **Next candidates for the chains still over 40,960:** `import/` (+1,387) and `steps/` (+1,907)
  share the shell contract, so S7's retirements and rescopes there count for both (about 400
  bytes per rule); `wizard/spread-every-handler-patches-make-visible` is in `import/AGENTS.md`
  now. Beyond those, the largest rules are `open-create-step-user-own-coding` (641 bytes) and
  `order-entry-step-four-equal-start` (551) in `steps/`, and
  `measure-line-room-alignment-line-own` (499) in `import/`. `src/` and `src/components/`
  (20,684 bytes together) are outside this plan.
- **S1b must allow for:** no recompile in S1b (it edits no rule and no contract). After any
  `git merge origin/main`, run `npm run contracts:compile` and commit what changes: a generated
  contract merges cleanly and can still come out wrong. The svg-import-engine plan may add files
  under `import/`; its rules already land in `import/AGENTS.md` through the same compile.
- **For the AI track (A4) and S7:** a `steps/ai/` edit pays for `steps/AGENTS.md` too (8,058),
  because `steps/ai/` sits under `steps/`; A4's move to `wizard/ai/` with the marker removes that
  and is the largest single cut left for that chain (10,950 over target). `steps/ai/` now holds a
  generated `AGENTS.md` and `.gitattributes`: A4 deletes both (a `git mv` of `steps/ai/*` would
  collide with the new `wizard/ai/AGENTS.md` and skip the dotfile, and the compiler never flags a
  `.gitattributes` whose folder lost its marker), writes the marker in `wizard/ai/`, and
  recompiles. The 31 rules left in the wizard contract include section 7's S7 candidates (the
  three door rules, the lifecycle rules, `hold-import-images-continuation-old-importstep`),
  except `spread-every-handler-patches-make-visible`, which moved to `import/`;
  `give-every-wizard-step-own-history` was never in it (it spans `src/app/router.ts`, so it lives
  in `src/AGENTS.md`).
- **Traps:** `npm run metrics:contracts` lists tracked files (`git ls-files`), so a new contract is
  invisible to it until staged. `check-shared-instructions.mjs` prints at least the three
  tightest chains (all above 80% of the cap when more), not every chain; a per-file chain is the
  sum of the `AGENTS.md` files on the path, LF-normalised, plus 2 bytes per join. Keep the
  `.gitattributes` the compiler wrote beside each new contract while its marker stays.
