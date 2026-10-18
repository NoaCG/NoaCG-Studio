# Make the codebase lean, starting with the retired editor

Status: **approved and running. The old shell, timeline/canvas/preview group and singles-a
through singles-i, the panels and the released editor/account checks have landed. This branch restores the kept Sheet and insertion cases; obsolete helpers and verification docs remain
before #800 closes, with step 6 last.**
The owner accepted keeping issue #800 for live-product tests and prioritizes a clean, simple
codebase over speculative retention. The original inventory is pinned to
`3010e41134f1e3a6ebf3933582eb9b7e52055241`; the admin assessment and concurrency check use
`ea71261c97a7bca8c8fd3b68adef1307561588dd` (2026-10-17).
The current scope below supersedes the original broad test-deletion draft.

## Why

The repository still carries an editor that no route opens, its skipped tests and its old
instructions. Maintaining those files obscures the wizard, playout and the new editor, and
would waste the planned code-health work. Large folders alone do not establish waste:
the catalog, saved-data compatibility and real on-air regression checks have current consumers.

## Goal

Remove retired product surfaces with their tests, tooling and instructions; preserve loading
and playback of saved graphics/projects; reduce repeated browser work without losing named
failure coverage. Make each deletion a small, reviewable change with measured before/after
size and timing. This report supplies the old-editor inventory and order, not implementation permission. The
separate admin removal is explicitly authorized under decision 8 below.

## Non-goals

- No deletion, schema migration, feature switch, runner purchase, CI cadence change or plan run.
- No local full-suite run or production build. This documentation task has no build risk;
  this cloud worker also reports unknown ancestor CPU/memory limits.
- No removal based only on filenames, lack of clicks, a missing package script or Knip output.
- No port of retired old-editor interactions. Tests of current product behavior are resolved
  under #800: retain an existing equivalent check or implement the smallest missing check.
- No source refactor before retirement; no new size limits, exemptions or scheduler.

## Decisions and authority

1. Retire the old editor and tests whose subject is its UI. Following independent review, the
   owner accepted retaining [issue #800](https://github.com/NoaCG/NoaCG-Studio/issues/800) for
   skipped tests of live features. A call to an old bootstrap proves a test is disabled, not
   that its subject is obsolete. Resolve #800 inside this cleanup run, not as an indefinite
   follow-up. The implementation session recorded this scope and order in
   [issue #800](https://github.com/NoaCG/NoaCG-Studio/issues/800#issuecomment-6235372874).
2. Saved graphics and projects keep loading. Retain live readers/migrations and ask before
   dropping any stored format. The separate old dock-layout record is an explicit pending question.
3. Keep the live video workspace, CLI/Bridge, exports, public output, audience and account
   surfaces. They are reachable dependencies or existing product surfaces; the short
   product description is not permission to retire them.
4. A disappearance from an import graph is evidence to investigate. Bench tools, SSR loaders,
   ambient types, string registries and fixtures are checked before a dead-code verdict.
5. All deletion PRs use `/check`, `/queue-merge` and full GitHub CI. No skip, weakened assertion,
   smaller validation set, raised limit or budget exception substitutes for a reviewed removal.
6. Finish the approved deletions before the codebase-health documentation run and any source
   cleanup on the same files. Disjoint E2E infrastructure research may continue.
7. Recheck the system-notice reader and bar after admin retirement: their only mount is the
   retired shell, and #1396 removes its dashboard publisher. Delete them with the remaining
   old-editor UI when the consumer scan confirms that; do not build a new mount to justify
   retention. Keep machineEdit, lottieInsert and the animation runtime with their current
   tests; moving a working helper just to reduce the app directory is not required cleanup.
8. The owner explicitly approved removing the entire admin page and replacing it with
   commands/sessions and routines. [PR #1396](https://github.com/NoaCG/NoaCG-Studio/pull/1396)
   landed the dashboard and unused HTTP-handler retirement, preserves deployed data and
   live access enforcement, and adds aggregate reporting plus a weekly Codex brief. Its scope
   and verification live in `docs/work-specs/admin-command-operations/spec.md` on main.
   Production reports merge `6f91096350150627887bbd81886b1042410731a3`; `/admin` and
   `/api/admin/session` return 404, while `/app` and `/api/me/entitlement` return 200.
   Deployment verification and post-landing migration/advisor checks passed. The PR's repair
   receipt tracks the remaining CI results and the SVG quarantine follow-up in #1400.
   Future role-management UI waits for a real need; no speculative dashboard is kept. No paid
   benchmarks, model promotions or database mutations are authorized by the reporting routine.

### Owner decisions and load-time format notice (2026-10-18)

The owner kept Google Sheet live data and Add template graphic, and requested a notice when
loading a saved format absent from the catalogue. Their original live-subject cases stay gaps
until their current UI checks run. The format notice belongs to the existing save status.
Why: loading compatibility alone does not warn the operator. Goal: warn before Save while
preserving authored dimensions, frame rate and playback. No format migration or new dialog.
Acceptance: a restored 1920×1880 graphic opens and shows an amber warning before any save;
a supported catalogue format clears it; saved/dirty/failure wording remains truthful and
the header fits at its existing width bands. The regression must fail without the load validator.

## Measured baseline

Physical lines include blanks/comments, tracked files only. `src` and `e2e` below count TS/TSX;
scripts include JS/MJS/CJS/TS/TSX, with test files separated. Docs count Markdown. The evidence
also includes CSS and all-code totals, so unlike scopes cannot silently be compared.

| Area | Files | Lines |
|---|---:|---:|
| src TS/TSX | 1,361 | 303,553 |
| src CSS, separate | 46 | 13,255 |
| e2e TS/TSX, including configured tests/helpers/fixtures | 358 | 116,035 |
| scripts excluding test files | 395 | 106,976 |
| scripts test files | 253 | 55,586 |
| docs Markdown before this report | 615 | 129,125 |

There are **233 offline specs, 57 configured specs and 7 catalog specs**, plus **308 Node test
files** across the repository. The inventory names 6,061 static test declarations (2,073 offline);
loops and generated cases make runtime counts different. These are fresh measurements, not a
claim that the request's earlier approximate counts were wrong.

The offline duration table totals **183.252 spec-minutes**. It is the recorded 80th-percentile
cost across six full main runs, not wall time or total billed runner-minutes. Source run
[39000659873](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39000659873) is pinned to
`ea3ef9a1d4837111fb24382f514877a713a27a80`. Its Build job took 210 seconds; the named
typecheck/lint/bundle step took 157 seconds. Full logs were denied by the network policy;
per-test skip durations and individual build substep costs are unknown. No local build was run
to fill that gap. See [measurement receipt](evidence/README.md) and [CI metadata](evidence/ci-baseline.json).

**Post-landing capacity finding, 2026-10-17:** [issue #1405](https://github.com/NoaCG/NoaCG-Studio/issues/1405)
tracked the 20-minute shard timeouts seen after admin retirement. Resolved by
[PR #1409](https://github.com/NoaCG/NoaCG-Studio/pull/1409): the unmeasured 107-case save-transaction
matrix cost 26.7 minutes on one runner, so it is six spec files weighted from the retry's complete
timing, `MAX_SHARDS` is 15 (the envelope `MAIN_RUNNERS` stays 13, so the capacity line reads 98%),
and the first complete main run after the landing, [39068140602](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39068140602),
finished all fifteen shards green in 8.4 to 16.4 minutes; the issue closed itself on it. In main run
[39048521384](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39048521384), 12 of 13 browser
shards passed; shard 7 reached declaration 215/289 before cancellation, with no assertion failure
in its complete log. `save-transaction.spec.ts` is absent from the duration table and was packed
at its 0.397-minute median, but had already consumed about eight minutes before cancellation.
That is a lower bound, not a completed timing measurement. Refresh from complete authoritative
reports and rebalance before adding substantial revived coverage under #800. This is a separate
CI-capacity follow-up; keep the tests and time limits intact. The
[repair-owner comment](https://github.com/NoaCG/NoaCG-Studio/pull/1400#issuecomment-6236077488)
tracks the recovery and final gate.

## Phase 1: remove the old editor and resolve #800

The [review reconciliation](evidence/second-opinion-response.md) explains corrections to both
reports. The [manifest](evidence/removal-manifest.json) distinguishes the seven-file first PR,
remaining source candidates, retained helpers and tests requiring subject review.

| Scope | Current evidence | Decision |
|---|---|---|
| First source PR | AppShell, WorkspaceDock, CodeEditor, SidePanel and the three teach files: 7 files, 1,230 lines | Done in this branch (receipt below); no test-body deletion, shared state or CSS edit |
| Remaining whole-source candidates | 20 further files, 9,530 lines; total 27 files / 10,760 lines | The timeline, canvas and preview group (13 files, 8,249 lines) is this branch (receipt below); the panels (7 files) and the two notice files remain |
| System notices | 2 files, 115 lines | Recheck consumers after #1396; remove with old-editor UI if unused |
| Current fixture helpers | lottieInsert and machineEdit: 395 lines | Keep their active OGraf and mutator tests; no replacement project for its own sake |
| Old-helper test discovery | 474 static declarations in 77 specs at the original pin | Classification input, not a deletion list; retired UI and live-product subjects are different |
| Old timeline/WYSIWYG documents | 8 files, 1,280 lines | Remove only after current schema facts and live references have a maintained home |

The former 30,244-line source/test removal total is withdrawn. The old 36 whole-file plus
41 mixed-file grouping describes where an unconditional skip occurs, not approved retirement.
The independent review's 20-file UI starting list also contains live-feature subjects in flows,
images, ux, assets and template-insert. Judge individual behavior and replacement evidence;
never make an entire file disposable from its title or its helper.

### One bounded first pull request

Delete only the seven named source files. Preserve every test body, including no-old-editor's
module request guard and its navigation/prefs checks. Repair that spec's obsolete covers paths,
keep the existing root retirement rule active with amended wording, retire/narrow obsolete
contract clauses through the normal rule mechanism, regenerate compiled guidance, remove only
stale copy-baseline rows and update ARCHITECTURE's teaching/shell references.

Checks: rules for the actual changed paths before editing; targeted gates; affected-planner
Node tests; contract freshness/evidence; copy and E2E protection checks. Inspect the resulting
browser selection. Production build and full authoritative validation run on GitHub through
`/check` and `/queue-merge`, not a full local suite. Nothing is described as zero-risk.

### Phase 1 receipt: the seven-file first PR

Measured on main `c1e02c6e9` (2026-10-17): `src` TS/TSX went from 299,461 to 298,231 physical
lines, the seven files' 1,230. Nothing imported them: `src/App.tsx` had not imported AppShell
since 2026-09-24, and the other six were reached only through it. With them went the two
copy-baseline rows they held, the `teach/` row of ARCHITECTURE's layer table and its import
edge, the covers line of `e2e/no-old-editor.spec.ts` that named them (every test body is intact,
including the module-request guard), the AppShell/CodeEditor scopes of the two active contract
rules that still named them, and the root retirement rule's wording, which now says the shell is
deleted and never comes back under the same identity and spec. `contracts/retired.json` records
the shell, its dock, its Monaco pane and its teaching layer as a retired mechanism, so a contract
that instructs them again fails the build. Instruction prose that described AppShell as live
(the store, canvas, timeline and video contracts, FORMATTING, the Monaco setup comment) now says
so as history. No store, router, prefs or CSS line changed; the orphaned panels, canvas and
timeline files are the next groups.

The review of this PR named what the deletion leaves for those groups, recorded here so none is
lost: `InsertTemplateDialog` has no mount now (AppShell was its only one) while its two openers
stay, so the next editor surface that offers "Add template graphic" mounts it or the openers go
with the canvas group; `templateStore`'s `activePanel`, `setActivePanel` and `panelRevealNonce`
have no reader left and wait for the store cleanup (step 6); `src/format/formatCode.ts`'s
`minimalTextChange` and `monacoSetup`'s HTML/CSS workers served only the deleted pane; the code
comments in `src/model/layout.ts`, `src/store/templateStore.ts`, `src/components/canvas/CanvasInteraction.tsx`
and `src/components/editorFoundation/openNewEditor.ts` still describe the shell as live and belong
to those reserved groups; and `e2e/_code.ts`'s `showCode` waits for markers only the deleted shell
rendered, which is why the nine specs importing it are #800's code-pane cases (step 3), not live
coverage. The compiler and the two instruction gates now treat a retired rule and the index's
retired rows as history, so later deletions need no edit to the retired rules that pinned them.

### Phase 1 receipt: the timeline, canvas and preview group

The second deletion, on main `116022568` (2026-10-17): `src/components/PreviewFrame.tsx`,
`ProjectFormatMeta.tsx`, `canvas/{CanvasInteraction,CanvasSelection}.tsx`,
`canvas/{partLocks,pasteboard}.ts`, `timeline/{Inspector,LegacyTimeline,MachineGraph,PlayoutSimulator,StepTimeline}.tsx`
and `src/blocks/{layerTimeline,stepAssign}.ts`: thirteen files, 8,249 lines, reached only through
the deleted AppShell (`src` TS/TSX 298,233 to 289,911, the Space-key helpers below included). `CanvasGuides` stays for the video stage.
With them went the tests whose subject was that UI, from the complete classification of all 474
old-helper cases ([evidence/test-dispositions.tsv](evidence/test-dispositions.tsv): 122 retired,
107 covered by a named running check, 231 live gaps, 5 undecided, 9 reserved): seven spec files
deleted (canvas-fit, canvas-keyframe, canvas-selection, inline-edit, keyboard, multi-select,
text-tools) and nine trimmed (timeline-v2, machine-graph, legacy-timeline, inspector, layout,
pasteboard, machine-edit, wysiwyg, preview-error), 3,735 `e2e` spec lines, each case listed under
Test maintenance with its retired surface or covering check. The eleven live cases left in the
trimmed files still skip through the retired bootstrap and are revived or re-homed with the other
gaps in the next PRs; fourteen covers headers that named the deleted paths, or planned nothing for
what a spec drives, now name what the specs observe (the canvas folder is the video stage's guides), the planner test that pinned the old dock's mapping pins the new editor's directory,
the two active contract rules scoped to the deleted files are retired or reworded, the timeline
folder's contracts are gone and the canvas folder's describes CanvasGuides, and `retired.json`
lists the group so an instruction that names it fails the build. No store, router, prefs or CSS
line changed. `src/components/spaceKey.ts` lost the Space pan-or-tap helpers nothing called any
more, so `activeSurface` and `pointerOverStage` join `partLocks`, `replayNonce` and
`setFilterComponent` as reader-less store state for step 6. Eight code comments in six live files
now name what replaced the deleted ones; 28 comment lines in `src/preview/{simulatorRuntime,composeDocument,canvasControlProtocol,previewProtocol,settleGraphic}.ts`,
`src/blocks/{timelineModel,timelineLens}.ts`, `src/store/{templateStore,saveActions}.ts`,
`src/styles/{editor,video-editor,timeline-switch}.css`, `src/templates/cornerBug/statusParts.ts`
and `src/validation/runtimeBench.ts` still name them as history and go with step 6 or the next
edit of each file. The helpers only the removed cases called (`timelineProgress`,
`applyUnconvertibleRegion`, `applyUnreadableRegion`, `frameRect`, `frameStyleProp`) are gone from
`e2e/_keys.ts`, `e2e/_legacy.ts` and `e2e/_frame.ts`.

### Phase 2 receipt: the runtime-harness revival

The first revival, on main `54ee2dcc` (2026-10-18): the eight specs whose live-gap cases boot
in-page against the composer and the runtime (sports, public-service, anim-engine,
competition-pack, audience-pack, graphic-types, state-machine, machine-edit) boot through
`e2e/_bench.ts`'s shared `toApp` instead of a local copy that called the retired advanced mode,
so 73 live-gap cases run again: 87 cases in all across the eight files, 5.0 case-minutes (2.6 min
wall on two workers, queue job `j-0011`, every case passing, none skipped). Twelve of the 87 are
cases the classification marked covered; each cover is partial by its own TSV note (a chip, a
column or a design the named check does not pin), they cost half a case-minute together, and
they stay. Three cases needed more than the boot swap: the kicker-on-air case drives the
production page's cue editor and Update and reads PROGRAM, the competition pack's
discoverability case walks the wizard's Browse shelf and card and plays the created graphic in
the harness iframe, and the measured-motion
case keeps its runtime half without the old step timeline's row. One case went: the simulator
snap case duplicated production-controls.spec.ts's live control page check (its entry under Test
maintenance). The covers headers now name what the running cases drive beyond the templates:
`src/blocks/**` and `src/export/**` on the pack sweeps, the production page and its field
control on the kicker case, `src/templates/shared/**` on machine-edit. The eight files' minutes
are under Budget exceptions. Still skipping: the other 158 live-gap cases, whose bootstraps
create a graphic through the retired wizard door; they are the next revival groups.

### Phase 2 receipt: the import family revival

The second revival, on main `37e4c661` (2026-10-18): the nine import specs (import-svg,
import-prepare, import-graphic, import-canvas, import-svg-behaviour, import, import-svg-corpus,
import-stretch, import-svg-sticker-sample) ended their wizard walks with the retired
advanced-mode switch and the old "Create project" door; they finish through the Finish step's
"Edit this graphic" door now, so 54 live-gap cases run again: 178 cases in all across the nine
files, 13.0 case-minutes locally on two workers (queue jobs `j-0016` to `j-0021`: `j-0016` and
`j-0018` each carried one file that failed on a fix still missing, rerun green as `j-0019` and
`j-0021`; every file's last run passes every case, none skipped). What the cases read moved with
them: the editor's preview document (`editorPreview` in `e2e/_frame.ts`) where they read the old
stage, the export window where they clicked the old dock's export tab, and the working document
mounted in a composer iframe (`mountWorkingDocument`, the same helper) where they typed into the
old Data tab, so `update()` and `play()` are driven the way playout drives them. The
import-graphic fixture takes its Name and Title fields from the Text step's proposal instead of
the old dock, and the no-AI open of a dropped file follows the file walk's Finish. 47 cases went
(23 retired UI, 24 covered by a maintained check, listed under Test maintenance) with the helpers
and constants only they used; the covers headers name the editor door, the export window, the
layout module and the export registry the cases reach. The nine files' minutes are under Budget
exceptions. Still skipping: the remaining 104 live-gap cases, in the production, pack and
single-case families.

### Phase 2 receipt: the production-data revival

The third revival, on main `d5030ad4` (2026-10-18): the nine production-data cases that opened
with the retired advanced-mode skip drive the production page and its Data workspace, never
the old editor, so the skip was all that stood between them and running. The three two-graphic
cases added their second graphic through the old dock's Control tab ("+ Add current"); they add
it through the catalog door the rundown's "+ Add" uses (`addCatalogGraphic` in
`e2e/_create.ts`), on the production the page is already showing. 24 cases in the file, 24
passing, none skipped, 2.4 case-minutes locally on two workers (queue job `j-0030`); no case
removed. The file's minutes are under Budget exceptions. Still skipping: the remaining 95
live-gap cases, in the pack and single-case families.

### Phase 2 receipt: the design-rules-product revival

The fourth revival, on main `61d37ae2` (2026-10-18): design-rules-product's beforeEach switched
to the retired advanced mode, so every case in the file skipped. Seven live-gap cases run again:
the AI step's viewing and floors controls persisting with the working document and reaching the
request (the AI walk's Finish offers the production and export doors and no editor door, so the
two cases that pressed the old "Edit in the editor" door press "Export it", which applies and
saves the created graphic and opens the export window over the wizard), the legibility warnings
read in that export window where the old dock's export tab was, a shipped design warned through
the live bootstrap, the frame-scaled floors, and the floors tri-state read on the AI step as
three radios and as the `data-legibility` stamp its request carries. Three cases went (listed
under Test maintenance): the untouched project's empty legibility key and the readiness row's
two size rules are pinned in Node (`scripts/design-rules.test.mjs`, the latter moved into
`scripts/validator-registries.test.mjs` beside its "not checked" sibling), and the editor's
viewing-target change has no live surface since the Style panel lost its mount. 7 cases in the
file, 7 passing, none skipped, 0.5 case-minutes locally on two workers (queue job `j-0034`).
The file's minutes are under Budget exceptions. Still skipping: the remaining 87 live-gap cases,
in the pack and single-case families.

### Phase 2 receipt: the holding-pack revival

The fifth revival, on main `50c677af` (2026-10-18): holding-pack's wizard walk and its
runtime-harness cases opened with the retired advanced-mode switch. Nine live-gap cases run
again: the three families browsable with every design offered, the holding set found under its
own type, the ceremony card created and landed in the new editor through the Finish step's
door, and the six harness cases (the wall-clock countdown, its self-correction through a stalled
loop, Update re-arming a running countdown while an unrelated update leaves it alone, the
clock-less holding screen, the reel's seam and clone count, the static board) on the bench's app
door, driving play() and update() in their own iframe the way playout does. No case was removed:
the classification had marked the browsability and the running-countdown cases as covered, and
the pull request's review showed the named replacements partial (wizard-filters compares
filtered counts for two other categories only; on-air-corrections sends its updates to a
finished timer and never moves the wall-clock field), so both run again and their rows say so.
10 cases in the file, 10 passing, none skipped, 0.8 case-minutes locally on two workers (queue
job `j-0036`). The file's minutes are under Budget exceptions. Still skipping: the remaining 80
live-gap cases, in the pack and single-case families.

### Phase 2 receipt: the end-credits revival

The sixth revival, on main `aeafa14e` (2026-10-18): end-credits' paste cases created their
graphic through the old "Create project" door and read the old stage, and its wizard and
harness cases opened with the retired advanced-mode switch. Eight cases run again: the credit
roll pasted as one field and read as one role over its names, the unmarked list read as names,
the column design's geometry, the Fields step's one paste box, the closing logo as a default,
the Style step's emphasis choice, and the two harness loops (every credits design settling with
its names on screen on both recipes; the roll and the crawl running the list off the frame
before the mark). The paste cases bootstrap the design through the live door and read the
working graphic mounted the way playout composes it (`mountWorkingDocument` and
`updateWorkingDocument` in `e2e/_frame.ts`), the wizard cases land in the new editor through the
Finish step's door and read the same mounted document, and the harness loops open on the bench's
app door. No case was removed: the classification had marked the unmarked-list case as covered
by the parser's Node test, which pins the parsing and not the DOM the roll paints, so it runs
again and its row says so. 10 cases in the file (the two loops count four), 10 passing, none skipped, 0.7 case-minutes
locally on two workers (queue job `j-0039`). The file's minutes are under Budget exceptions.
Still skipping: the remaining 73 live-gap cases, in the pack and single-case families.

### Phase 2 receipt: the package revival

The seventh revival, on main `cd35484b` (2026-10-18): every package case walked the wizard into
the retired advanced mode and read the old stage. Six cases run again: the custom hex landing in
the generated :root and the imported font bundled into the export, the info card creating,
binding and playing, the credits field driving the parsed roll, the ticker's marquee moving and
its endless marquee honouring the timed hold. The wizard walk lands in the new editor through
the Finish step's door and the cases read the working graphic mounted the way playout composes
it (`mountWorkingDocument`, with `play()` and `update()` driven on that document), and the font
case opens the export window where the old dock's export tab was. The info card case stays
although the classification marked it covered: the catalog baseline fingerprints the composed
design on air, not its creation through the wizard. One case went (listed under Test
maintenance): the old timeline Inspector's preset picker, which has no live surface. The saved
brand carried to another variant left with the first landing as covered by wizard-brand and came
back after review (2026-10-18): wizard-brand seeds its brands as literals, so the capture of a
custom accent from a created template into a persisted look was pinned nowhere. The font case
reads the generated @font-face, the applied family and the bundled binary since the same review.
7 cases in the file, 7 passing, none skipped, 0.6 case-minutes locally on two workers
(queue job `j-0043`, re-measured as `j-0067`). The file's minutes are under Budget exceptions. Still skipping: the
remaining 68 live-gap cases, in the pack and single-case families.

### Phase 2 receipt: the image-purpose revival

The eighth revival, on main `0bdf5a47` (2026-10-18): the image-purpose cases opened the Create
with AI step behind the retired advanced-mode switch, which one of them needed for the old
editor's Assets panel. Five cases run again: the preselect reading a picture as mark or not,
the fixed/swappable choice belonging to "use it as it is" alone, each purpose reaching the
model as its own instruction, a reference never bundled into the created template, and a
design that improves an as-is picture being held back. Four of them only drop the switch; the
bundle case reads the package the export writes, through the Finish step's export door, because
every entry of the template's assets list ships there as a file (`src/export/common.ts`
`addSharedAssets`), so the zip's listing is the assets list as playout receives it. No case was
removed. 6 cases in the file, 6 passing, none skipped, 0.5 case-minutes locally on two
workers (queue job `j-0044`). The file's minutes are under Budget exceptions. Still skipping: the
remaining 63 live-gap cases, in the pack and single-case families.

### Phase 2 receipt: the house revival

The ninth revival, on main `6d303a14` (2026-10-18): the house cases created their variant through
the old "Create project" door and read the old stage. Four cases run again: the house strap
creating and playing in the mono label voice, the clock bug ticking with the three-bar
placeholder, the markets ticker colouring its deltas by sign, and the breaking strap stacking
its chip above the headline. Each bootstraps the variant through the live door and reads the
working graphic mounted the way playout composes it (`mountWorkingDocument`), fed the sample
data the create put in the store (`updateWorkingDocument`): the mounted document renders the
design's own defaults until an update arrives, and the markets list lives in the sample. No
case was removed. 4 cases in the file, 4 passing, none skipped, 0.3 case-minutes locally on two
workers (queue job `j-0046`). The file's minutes are under Budget exceptions. Still skipping: the
remaining 59 live-gap cases, in the pack and single-case families.

### Phase 2 receipt: the shows revival

The tenth revival, on main `50da1a61` (2026-10-18): the shows cases created their graphics through
the old "Create project" door and added them to a production from the old editor's Productions
block. Four cases run again: a production collecting two graphics in rundown order and
exporting one aggregated panel that drives each independently, the hosted control route
answering honestly offline, the layer stack retyping and removing with the production's
two-step delete keeping nothing behind, and a rundown export shipping the live library graphic
rather than the add-time snapshot. The working graphic reaches the production through the
production door (`openProductionWithCurrent`) and the second graphic through the rundown's own
add (`addCatalogGraphic`); the live-graphic case saves in the new editor's header first, where
the old topbar's save controls were. The offline case keeps its route half alone and is
renamed to say so: the "Shows section grows no cloud UI" half read the retired editor block,
and Home's Productions section is productions.spec.ts's. No case went in the end: Home listing
productions and the production page exporting the package left with the first landing as
covered by production-pack, wizard-kit and productions, and came back after review (2026-10-18)
through the production door. production-pack downloads the pack format, wizard-kit downloads
from the production page and productions creates rather than opens from Home, so the card's
count words, the card's standard download, the dialog close and the Home-to-production door were
pinned nowhere else. 12 cases in the file, 12 passing, none skipped, 0.5 case-minutes
locally on two workers (queue job `j-0047`, re-measured as `j-0067`). The file's minutes are under Budget exceptions. Still skipping: the remaining 55
live-gap cases, in the pack and single-case families.

### Phase 2 receipt: the format revival

The eleventh revival, on main `d5a6cfba` (2026-10-18): the format cases opened the app behind the
retired advanced-mode switch, three of them only to reach the formatter's pure functions and
three to drive the deleted code pane's Format button. The pure cases moved to Node as
`scripts/format-code.test.mjs` (gate: build, guarding `src/format/formatCode.ts`), with their
assertions as they were: the three formatters normalising messy code, formatJs refusing a file
that owns an animation region, and formatTemplate formatting HTML while leaving CSS and JS
alone; the formatTemplate fixture is the three code strings, which is all the function reads.
One journey runs again in the browser: a newly created project starting from a
Prettier-formatted HTML baseline, through the wizard's first lower third and the Finish step's
editor door. Three cases went (listed under Test maintenance): minimalTextChange, which served
the deleted Monaco pane alone, and the two Format-button cases of that pane. 1 case in the
file, 1 passing, none skipped, 0.1 case-minutes locally on two workers (queue job `j-0048`);
the Node test passes 3 of 3. The file's minutes are under Budget exceptions. Still skipping:
the remaining 51 live-gap cases, in the pack and single-case families.

### Phase 2 receipt: the production-chat-intake revival

The twelfth revival, on main `9bf42f8aa` (2026-10-18): three production-chat-intake cases carried a
`skipOldEditor()` from the editor phase although their bodies already ran on live surfaces (the
test chat source seam, the audience workspace, Take). They run again with the skip deleted and
nothing else changed: a chat line reaching air the way a phone question does, the throttle and
the dedupe refusing visibly, and pause, resume and remove on the source. No case was removed. 5
cases in the file, 5 passing, none skipped, 0.6 case-minutes locally on two workers (queue job
`j-0049`). The file's minutes are under Budget exceptions. Still skipping: the remaining 48
live-gap cases, in the pack and single-case families.

### Phase 2 receipt: the wave2 revival

The thirteenth revival, on main `6d5789d9e` (2026-10-18): the wave2 cases created their variant
through the old "Create project" door and read the old stage. Three cases run again: the
starting-soon countdown ticking after its hold, the game timer's label binding and its clock
running, and the infographic stat counting up to its figure. Each bootstraps the variant
through the live door and reads the working graphic mounted the way playout composes it
(`mountWorkingDocument`, fed the store's sample data), with `play()` on that document. Three
cases went (listed under Test maintenance): the scoreboard's score change, the corner bug's
placeholder mark and the quiz reveal, each pinned on a live surface by production-controls,
catalog-baseline and community-packs. 3 cases in the file, 3 passing, none skipped, 0.3
case-minutes locally on two workers (queue job `j-0051`). The file's minutes are under Budget
exceptions. Still skipping: the remaining 45 live-gap cases, in the pack and single-case families.

### Phase 2 receipt: the ux revival

The fourteenth revival, on main `e41fa2002` (2026-10-18): the ux cases created Hairline behind the
retired advanced-mode switch and read the old shell. Two cases run again in the browser: export
validation showing inline and gating the download on a broken template, now in the export
window the working graphic opens (`openExportWindow`), and the wizard's direction control
mixing a different exit preset at create, through the Finish step's editor door and the
working graphic mounted the way playout composes it for its play. The catalog-line shape gate
moved to Node as `scripts/catalog-line-gate.test.mjs` (gate: factory, needs: browser, guarding
`src/blocks/edit.ts`): the same five designs and the same verdicts, in a blank Chromium page
because `variant.create()` needs `DOMParser`. Three cases went (listed under Test
maintenance): the old shell's dock geometry, the Data panel's add row (the new editor's text
tool is editor-base-edits's) and the code pane's change highlight. 2 cases in the file, 2
passing, none skipped, 0.2 case-minutes locally on two workers (queue job `j-0052`); the Node
test passes 1 of 1. The file's minutes are under Budget exceptions. Still skipping: the
remaining 42 live-gap cases, in the pack and single-case families.

### Phase 2 receipt: the counting-settle revival

The fifteenth revival, on main `71ac6227a` (2026-10-18): the counting-settle sweeps opened the app
behind the retired advanced-mode switch. Three cases run again, their bodies as they were
behind the app door: every counting design settling on its real figure the way every card and
thumbnail settles it, every counting design playing its figure up from zero on both seeds, and
a counting graphic taken again on air never painting its old figure. The settle sweep used to
run twice, once per recipe; the canvas recipe composed with the old editor's simulator channel,
which no live surface composes with, so the sweep runs the shared settle recipe alone and its
title drops the recipe, so the sweep's canvas run went (listed under Test maintenance).
4 cases in the file (the seed loop counts two), 4
passing, none skipped, 3.1 case-minutes locally on two workers (queue job `j-0053`). The file's
minutes are under Budget exceptions. Still skipping: the remaining 39 live-gap cases, in the
pack and single-case families.

### Phase 2 receipt: the ai-more-control revival

The sixteenth revival, on main `1485487ce` (2026-10-18): the More control cases opened the Create
with AI step behind the retired advanced-mode switch, which one of them needed for the Finish
step's editor door. Three cases run again: the structured setup's pinned category, user fields
and intensity landing in the created project, now read off the working document after the
Finish step's export door (which builds the graphic before it opens the window); collapsing
sections and closing the wizard preserving the entered setup, with the second close landing on
Home and the wizard reopened through Home's new-graphic door; and prompt-only generation
injecting no structured setup. No case was removed. 3 cases in the file, 3 passing, none
skipped, 0.3 case-minutes locally on two workers (queue job `j-0054`). The file's minutes are
under Budget exceptions. Still skipping: the remaining 36 live-gap cases, in the pack and
single-case families.

### Phase 2 receipt: the adapt-first revival

The seventeenth revival, on main `85911aa73` (2026-10-18): the adapt-first cases opened the Create
with AI step behind the retired advanced-mode switch, which the first of them needed for the
Finish step's editor door. Three cases run again: a brief becoming a customized graphic
adapted from a proven design, whose last claim now takes the Finish step's export door and
reads the working graphic mounted the way playout composes it (the bottom band measured in
that document, the brief's content in its field, validation and the override block off the
store); the shortlist shown and another design rebuilding for free; and an off-catalog brief
keeping the full catalog listing. No case was removed. 3 cases in the file, 3 passing, none
skipped, 0.4 case-minutes locally on two workers (queue job `j-0055`). The file's minutes are
under Budget exceptions. Still skipping: the remaining 33 live-gap cases, in the pack and
single-case families.

### Phase 2 receipt: the first singles (mark-legibility, production-controls, productions)

The eighteenth revival, on main `b18a652c3` (2026-10-18): three single cases in three files whose
bodies already ran on live surfaces and which only a retired call kept skipping. The wizard's
mark-legibility notice while the palette that broke it is still on screen (the advanced-mode
switch dropped, the walk as it was); the production page's live-number bump airing a figure
without publishing other staged edits, and a published production reading SHOW while an
unpublished one says so and offers no rehearsal (each with its `skipOldEditor()` deleted and
nothing else changed). No case was removed. mark-legibility: 4 cases, 4 passing;
production-controls: every case in the file passing; productions: every case in the file
passing, the covered case at line 40 of the classification still skipping for its own
disposition; none skipped otherwise. Case-minutes locally on two workers (queue job `j-0056`):
mark-legibility 0.3, production-controls 1.8, productions 1.1. The files' minutes are under
Budget exceptions. Still skipping: the remaining 30 live-gap cases, in the pack and single-case
families.

### Phase 2 receipt: the second singles (exports, template-pack-4, template-pack-10)

The nineteenth revival, on main `620f14cc4` (2026-10-18): four cases in three files that read the
old editor's panels or topbar around bodies that already ran live. The HTML overlay export
baking the typed value and autoplaying now types the value into the store's sample data, which
is what the old Data panel wrote; the notice's level events reaching the generated control page
saves the graphic through the same save the editor's header runs and opens its own control
route, where the old Rehearse panel was; a pack graphic surviving save, reload and reopen waits
for the new editor and the durable store after the reload; and the commerce card's round trip
edits in the new editor, reads the retyped price off the working graphic mounted the way
playout composes it, and reads the reopened name off the editor's document tab. No case was
removed. Every case in the three files passes, none skipped. Case-minutes locally on two
workers (queue job `j-0057`): exports 1.0, template-pack-4 0.3, template-pack-10 0.2. The files'
minutes are under Budget exceptions. Still skipping: the remaining 26 live-gap cases, in the
pack and single-case families.

### Phase 2 receipt: the third singles (flows, wizard-filters)

The twentieth revival, on main `8b9ccedb3` (2026-10-18): five cases in two files. The flows cases
walked the wizard into the retired advanced mode and read the old editor's panels; three run
again on the created graphic: a Fields-step title flowing into the created field (read off the
store after the Finish step's editor door, and renamed to say the graphic rather than the
retired Data panel), steps mode holding line 2 behind its mask until next() on the working
graphic mounted the way playout composes it, and the AI-step picture landing in Number Badge's
logo slot through the import continuation's own footer and Finish's export door. Four flows
cases went (listed under Test maintenance): the defaults create and the SPX download, which
wizard-finish and exports pin, and the retired topbar Reset and Style panel. The wizard-filters
brand cases seed the glass look off the design's own created template on the wizard's door
instead of saving it from the old editor, then run as they were: the chosen brand ranking its
family first without filtering, and a brand chosen after paging re-ranking in place. flows: 3
cases, 3 passing; wizard-filters: every case passing; none skipped. Case-minutes locally on
two workers (queue job `j-0058`): flows 0.2, wizard-filters 1.4. The files' minutes are under
Budget exceptions. Still skipping: the remaining 21 live-gap cases, in the pack and single-case
families.

### Phase 2 receipt: the fourth singles (inspector, pasteboard, legacy-timeline)

The twenty-first revival, on main `05b766bd5` (2026-10-18): three single cases whose subject
outlived the old editor surface that drove them. The redo-branch case is now a test of the
store's history: the retired Inspector's speed knob wrote the data block's speed, so the same
write is made on the store and the store's own undo() and redo(), which the editor's keys call,
are what the classic cut is judged on (renamed to say so). The pasteboard case drops the canvas
drag that fed it and keeps its invariant: the persisted template carries no pad concept and the
composer's default document clips to the canvas while only its authoring option opens a margin.
The legacy settled view composes the working graphic with the shared settle recipe
(`settleWithData`, what every card and thumbnail runs) and reads the settled document; the
legacy-region helper no longer waits for the retired dock's chips. No case was removed. Every
case in the three files passes, none skipped. Case-minutes locally on two workers (queue job
`j-0059`): inspector 0.1, pasteboard 0.1, legacy-timeline 0.1. The files' minutes are
under Budget exceptions. Still skipping: the remaining 18 live-gap cases, in the pack and
single-case families.

### Phase 2 receipt: the images revival

The twenty-second revival, on main `7088e031f` (2026-10-18): the images cases walked the wizard into
the retired advanced mode and uploaded through the old Data panel's image control. Three cases
run again: a logo uploaded through the Logo field landing in the credits end block, an oversized
logo shrunk to the frame at the door with a small one left alone, and the corner bug's logo
field replacing the placeholder mark. The file is picked in the Fields step's own "Upload a
logo" input (`components/wizard/steps/FieldsStep.tsx`, which shrinks it at the door through
`importImageFile` and points the slot at it), the placeholder is read on the step's own preview
before the pick, the wizard walk lands in the new editor through the Finish step's door, and
the runtime claims read the working graphic mounted the way playout composes it, which inlines
the asset the field names. Two cases went (listed under Test maintenance): the Data
panel's add-field row, retired with that panel, and the export folder structure, which
editor-images pins. 3 cases in the file, 3 passing, none skipped, 0.2 case-minutes locally on
two workers (queue job `j-0060`; the Fields-step upload passed 9 of 9 at three repeats in
`j-0070`). The file's minutes are under Budget exceptions. Still skipping:
the remaining 15 live-gap cases, in the pack and single-case families.

### Phase 2 receipt: the assets group (assets, asset-workflow, wysiwyg)

The twenty-third revival, on main `44f1971d9` (2026-10-18): three single cases on three files whose
other cases were the old editor's. The Assets panel's info section runs again in the new editor,
where the panel is mounted by the Project panel and opened by the image tool; the panel's
usage marks run again there too, with the second placement asserted as what the new editor
makes of it (one more field, no second asset) rather than the old canvas's element id; and
the zone+nudge code patch runs again from the wizard's Style step zone picker, which writes
the same `zoneCssText` the retired canvas drag wrote, read off the created graphic mounted the
way playout composes it (renamed to say the Style step). Thirteen cases went (listed under
Test maintenance): the old canvas chip, Inspector rows and video insert of asset-workflow; and
the Assets tab's imports, removals, folder moves and canvas drops, which editor-images and
editor-folders-bins pin, and its old-dock Lottie drop, layout migration and mobile strip.
wysiwyg's corner handle, empty-canvas drag and Escape went on 2026-10-17 with the old editor's
sources (their entry is the earlier one); this change removes no wysiwyg case. 1 case in each file, each passing, none skipped. Case-minutes
locally on two workers (queue job `j-0062`): assets 0.1, asset-workflow 0.1, wysiwyg 0.1. The
files' minutes are under Budget exceptions. Still skipping: the remaining 12 live-gap cases,
in the pack and single-case families.

### Phase 2 receipt: the seventh singles (production-audience, google-fonts, render, video-project, project-format)

The twenty-fourth revival, on main `3c036da34` (2026-10-18): seven cases in five files. The two
production-audience workflows (a chat line arriving, edited, approved, sent and aired; a vote
reaching air the way a question does) only carried a `skipOldEditor()` and run again with it
deleted. The Google typeface case ends the import walk in the new editor through the Finish
step's door instead of the retired "Create project" footer. The render section measured off the
saved record saves in the new editor's header first, then takes the Home row's export door as
before. The video reload case replaces the retired Blank SPX door with the live catalogue walk,
checks that the SPX editor replaces the video shell, and then reopens the saved video. The
render output settings case opens the working graphic's export window instead of the old
Export dock. The restored unsupported-format case retains both compatibility and a visible
warning before Save, per the owner's decision. SaveControls derives that notice from the loaded
document while preserving the saved/dirty/failure wording; narrow widths keep an accessible
warning icon. The save case separately checks the save validator's recorded issues. The vote
case waits for each staged write and now checks the final tally after the operator presses Take.
One case went (listed under Test maintenance): blank artwork requiring an authored format, whose Blank
entry card is gone. Every case in the five files passes, none skipped. Case-minutes locally on
two workers (queue job `j-0063`): production-audience 0.7, google-fonts 0.1, render 0.9,
video-project 0.7, project-format 0.6. The files' minutes are under Budget exceptions. Still
skipping: the remaining 10 live-gap cases: two machine-graph runtime cases, one timeline-v2
case, the preview command-error case, the configured signed-in header case, the Google Sheet
live-data case, and four Add template graphic cases. The last five are
retained by the owner decisions above, rather than counted as two undecided families.

Continuation verification on that merged main: queue job `j-4597` ran all 46 cases in the
five files, all passed and none skipped (1.4 minutes wall time). ESLint on the changed specs
and SaveControls, `tsc --noEmit -p tsconfig.json`, E2E protection and the changed-path gates
passed. The missing load warning reproduced first in `j-4592`; the final check covers its
visible notice and accessible icon at 1440, 1366, 1280 and 1100 pixels, with screenshots
visually inspected at 1440 and 1100. Earlier selections are not green evidence: `j-4594`
was cancelled for missing player-host setup, and `j-4596` had 45 passes and a failed added
vote assertion that selected the existing House Vote cue. The final test selects the exact
staged cue and verifies the eight-vote closed tally on Program. Review and simplify ran inline;
no full local production build or suite was run. The player-host dependency bundle was prepared
for this fresh worktree, without changing package inputs or Vite access rules.


### Phase 2 receipt: the eighth singles (machine-graph, timeline-v2, preview-error)

The twenty-fifth revival, on main `7b3e3022d` (2026-10-18), keeps the runtime
halves of machine-graph and timeline-v2 and restores the preview command-error case. The graph
UI was deleted on 2026-10-17: machine-graph intentionally calls blocks/machineEdit directly
and runs the composed graphic. The scoreboard case drives update after play in that graphic.

Review found that preview-error's proposed replacement tested a startup exception, not a
command failing after readiness. The case stays, with Edit Out triggering an injected broken
interpreter, a visible error from that command, and Reload preview recovering from unchanged
source. No preview-error case is removed by this branch. Its disposition remains a live gap
resolved here, rather than claiming that a different startup test covers it.

The fade test now observes the opacity dip during the transition as well as its final pose.
A temporary fade-to-cut mutation passed the old assertion (`j-4598`) and failed the strengthened
one (`j-4599`, minimum opacity stayed 1). Restoring the fade passed all eight cases across the
three files (`j-4600`). Suppressing the command-error reply separately failed the retained
case (`j-4601`); restoring the runtime passed it (`j-4602`). Both mutations are fully reverted.
Those diagnostic runs preceded reconciliation with singles-g. The final main-reconciled
selection below is the landing verdict.
Acceptance: a fade visibly fades and lands; lifecycle guards and scoreboard score-pop still
hold; a command exception after a healthy load is visible and Reload preview recovers. No
new runtime behavior or graph UI is introduced. Still skipping: the remaining 6 live-gap
cases are the configured signed-in header case, the kept Google Sheet CSV case and four kept
Add template graphic cases, before singles-i's own subject review.

Final verification on the merged main: queue job `j-4604`, 8 passed, none skipped in
19.5 seconds. ESLint on all three changed specs, changed-path gates and E2E protection passed.
Review fixed two coverage findings inline; simplify ran inline without a behavior change.
The preceding receipt's skip count is corrected from eight to ten because it omitted the
still-skipped command-error and configured signed-in header cases. This revival resolves four
cases, leaving the six above. A complete remaining-caller scan confirms the signed-in case
is still a live gap and separately identifies nine RESERVED cases in library/project/wizard-finish.
No full local suite or production build was run.


### Phase 2 receipt: the retired and covered removals (ten files)

The twenty-sixth cleanup, on main `60320e909` (2026-10-18), was reviewed case by case.
Ten retired or already-covered cases go from ten files: the old AI panel's three cases,
ai-consent's old-panel stub case, three old Control
tab cases, one anonymous old-editor case and the Data-panel/canvas-context insertion doors.
Their individual evidence remains under Test maintenance. Only ai-panel's empty file goes.

The continuation review kept four cases whose named replacements cover only part of the
journey: UI-created library entries reaching a production by graphicId; the quiz's non-default
Answers shown value reaching the created graphic; opening and editing in the editor with
third-party hosts blocked; and a returning visitor's working source surviving the landing CTA
and wizard dismissal. These now run through the current editor, control page and wizard.
Queue job `j-4603` passed those four current-UI cases on the unreconciled branch; it is
preparation evidence, not the final main-reconciled verdict. After merging current main
`60320e909`, queue job `j-4605` ran the eight changed offline files: 56 passed, 7 skipped,
1.2 minutes on three workers. The seven skips are the retained Sheet and insertion cases.
The configured anonymous file is excluded by the offline runner and was linted, not locally
verified against a backend; the landed configured-suite supplies its authoritative result.
The comment-control checks were subsequently restored after Codex review found their live
video consumer; that repair has its own verification below. ESLint on all nine existing
changed specs, the protection check against origin/main and
the changed-file gates passed. No production source or check limit changed.

The owner kept Google Sheet live data and Add template graphic on 2026-10-18. The Sheet block's
add/remove check and the incompatible-donor refusal therefore stay too. Still skipping:
the remaining 11 live-gap cases outside the nine formerly reserved editor cases: two Sheet
cases, five insertion cases and four configured account cases (signed-in header layout,
anonymous account-purpose/dismissal, signed-in save wording and expiry recovery). On 2026-10-18 the
owner released those nine skipped cases to this cleanup, bringing the remaining live-gap
work to twenty. Current coverage precedes removing the retired helpers.
The old `j-0066` result (52 passed, 5 skipped) predates the continuation and is not evidence
for the revised branch. The original receipt also miscounted its removals as eighteen; the
actual original diff removed twenty-one declarations, eleven of which are retained here.
The additional configured account case stays because the named replacements omit its inline
account-purpose text and Escape dismissal. It remains a live gap until that journey runs
through current Home and wizard doors.

### Continuation review: live video comment controls

Codex review of PR #1484 found the graphics-pane classification too broad: VideoCodeEditor
still mounts CommentVisibilitySelect and useCommentVisibility. All four interaction cases
therefore stay, with their rows corrected to G. They drive the video pane's mode control,
check transparent/35%/normal rendering without source or history writes, edit and undo a
comment through Monaco, remount and reload the pane with the mode remembered, and exercise
selection and find reveals. The controller's model-swap contract uses Monaco's API explicitly;
there is no model-tab UI in the video pane. Queue job `j-4608` passed all five comment cases.
The temporary mutation probe was rejected by automatic approval review before execution;
no production source changed and no fault-injection result is claimed. The actual mode
round trip supplies the visible positive and negative assertions.

The first PR CI build also reproduced an affected-planner failure: offline.spec.ts named
all wizard imports although its flow only creates a catalog graphic. Its covers header now
excludes wizard/import, matching the journey it runs, and the unchanged affected-planner
checks pass all 92 cases. No assertion, selector expectation, gate or limit was relaxed.
The final repair selection `j-4609` passed 60 cases with the same seven retained Sheet
and insertion skips in 1.2 minutes. All nine existing changed specs passed ESLint;
changed protection and gates passed after the repair. Review fixed ten findings including
the live video consumer, the planner header and the complete helper-chain count; simplification removed only dead helpers
from retired flows. The earlier 56-case receipt is superseded by this final selection.

The final helper-chain audit also found two cases outside the original 474-row inventory:
configured/account's expiry recovery and configured/signed-in-ux's save wording both call
configured/_helpers.createGraphic, which calls finishIntoEditor and skips. They are appended
to the disposition evidence as live gaps. The pinned original inventory is preserved as
history; the current remaining count includes these two cases. No test body changed for
this receipt correction, so the final 60-pass selection still covers the reviewed source.

### Phase 1 receipt: the exclusive panels and notice pair

On main `76afb8cb6` (2026-10-18), the seven remaining exclusive panels have no entry-point
consumer: AIPromptPanel, ControlPanel, ExportPanel, SampleDataPanel, StylePanel, SpxFieldRow
and showchat/ModerationPanel. SpxFieldRow is imported only by the two removed panels;
ModerationPanel only by ControlPanel. The system-notice bar has no mount and its reader has
no other consumer after admin retirement. Repository-wide name, import and dynamic-loader
scans found no live caller outside that deletion set. These nine files remove 1,396 physical
source lines: 1,324 src TS/TSX files / 290,280 lines become 1,315 files / 288,884 lines.
No bundle or browser-time saving is claimed for already unreachable source.

Why: unmounted UI and its instructions obscure the live surfaces. Goal: delete only those
exclusive adapters and correct their covers/instruction references. Non-goals: no stored
shape, database/RPC, account enforcement, runtime block, shared controller, CSS or test-body
change. AssetsPanel, InsertTemplateDialog, liveData, machineEdit, lottieInsert, FieldControl,
ExportSurface and the video code editor stay. The kept Sheet and insertion cases still need
current reachable UI; panel deletion is not feature retirement.

Acceptance: no current import or registry resolves any deleted file; the existing retired
editor guard and current control-page checks pass; saved-data readers and live output/export
paths remain; every active instruction names an existing surface. Nine covers headers drop
only the deleted panel paths, all case bodies stay. The export props invariant keeps its
ExportSurface scope and unchanged text; the retired-name gate records the removed mechanism.
Four obsolete per-file copy rows are removed without changing any retained count. Current
remaining live gaps stay twenty, including the nine explicitly handed-over editor cases.

Verification: queue job `j-4610` passed all 19 cases in no-old-editor, control-panel-types
and assets in 36.6 seconds, with no skips. ESLint passed on the nine changed spec headers;
tsc --noEmit passed; dependency-cruiser found no violation across 1,334 modules and 6,108
edges. All 92 affected-planner tests passed. Changed gates passed their contract, instruction,
copy, dependency-boundary metadata and 17 selected Node checks. A direct comparison proves
all nine changed spec imports/bodies identical to main and all retained copy counts unchanged.
Review corrected the new retirement pattern's collision with live controlpanel.html names
and updated the export guide to name its actual props consumer and all three operator-page
targets. Simplification kept this to deletion and reference repair. No local full suite or
app production build ran: these files had no entry-point consumer, and Actions supplies the
authoritative bundle and broader checks.

### Released editor cases: current UI restoration

Why: nine carried skips still hide live library, persistence, control, video and wizard
behavior. Goal: restore those exact subjects through the current editor, Home rows, control
page and wizard. Non-goals: no Phase 2 repair-check or acceptance change, and no production
behavior change merely to satisfy an obsolete selector. Keep every original live promise;
retired code-pane highlighting and the old Advanced door are replaced by current source,
preview and editor-door assertions. Drive edits through Artwork text and wizard controls,
not direct store writes. Observe durable writes before reload. Acceptance: all nine subjects
run without retired helpers; save state follows edits/reopen, navigation preserves the right
working source, entry deletion stays armed, custom looks persist/apply, and Finish names the
working graphic without saving a library record. Preparation selection `j-4611` passed all
nine cases in 31.4 seconds. Review then changed the old-package assertion to a fresh bookmark
load so prior Home visibility cannot satisfy it. Queue job `j-4612` then passed all 49 cases in the three files in 1.3 minutes, with no
skips, including the stronger bookmark assertion. A stale Advanced-era title was clarified
without changing that running case's assertions. The branch then merged panel main `2c36ba0be224d464938538428d02b8b77c56b5b9` with a merge commit. Its production source is identical to the panel source already in the tested branch. No production behavior changed during these restorations. Review corrected the project disposition left as RESERVED after handover; all nine are resolved G rows with executed evidence. Final branch gates pass, including all 27 configured-verdict tests.
The source has no retired helper calls in these three files; eleven live gaps remain outside
them: four configured account cases, two Sheet cases and five insertion cases.

### Configured account cases: current surfaces

Why: the remaining account skips still point to the retired graphics editor. Goal: keep the
four live promises on Home, the current editor and the explicit recovery notice. The signed-in
bar retains its width/name/title/settings checks; the save dialog keeps its account-location
words; the anonymous gate keeps account-purpose copy and Escape dismissal; real session loss
preserves saved local work and resumes sync after the user chooses Sign in. An unsolicited
expiry modal is obsolete: the current notice says editing is paused and preserves pending
work. Non-goals: no auth, sync, stored-data or Phase 2 repair behavior change. Run these
against the existing isolated configured stack in Actions, never the production environment.
Raise the configured test floor by four and remove the three old-editor skip allowances.
Preparation: the four restored cases and shared helper pass ESLint; all 27 configured-verdict
Node checks pass with the floor raised from 100 to 104 and the three old-editor allowances
removed. All four restored cases passed first attempt against the isolated stack in Actions
[39150461649](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39150461649) on
`d0c5c2d5079f918211252778981afae0ea472e6f`. The full suite ran 108 cases: 107 passed,
one unchanged deep-link case failed then passed, and three permitted skips. Its overall
workflow verdict remains failure. Read the whole configured job log; account loss, account
purpose, the width ladder and signed-in save wording all passed without retries. The standard quarantine command confirms that this file is already recorded since
2026-10-16 from run 38874823120, so it writes nothing. Off-main configured dispatches deliberately
keep every flake red, including existing quarantine files. Preserve that policy and the failed
workflow verdict. The file keeps running on every main push and earns release through the
existing 20-pass rule; no assertion, floor, skip allowance, workflow or limit changes. Local changed
gates and ESLint pass; no offline skip substitutes for this configured evidence. Still
skipping: the remaining seven live-gap cases in Sheet data and template insertion.

### Kept live features: Sheet data and template insertion

Why: the owner kept Sheet live data and Add template graphic, but their entry points were
retired with the old shell. Goal: connect the retained generator and picker/merge engine to
the current editor through its bounded operations and session history. Non-goals: no return
of retired panels, code pane or timeline; no auth, stored-format or Phase 2 repair changes.
Acceptance: UI adds/removes a mapped polling block and mocked CSV values reach the preview;
insertion preserves host source/fields, namespaces the donor, scopes its look, retains middle
steps and runtime behavior, exposes selectable inserted lines, refuses unsupported donors,
and undoes as one complete edit. An inserted graphic's appearance can still move between
Play and a named step. Dialogs close at document boundaries and all writes use the active
session. No equivalent reference-editor implementation of NoaCG's SPX donor merge or emitted
CSV polling block is available in this environment; verify these contracts directly without
claiming reference-editor usability or whole-editor parity.

The first current-surface probe `j-4613` failed because the insertion button was absent.
After wiring it, `j-4614` passed six cases but the old preview's pre-play pose assertion did
not apply to the current artwork preview. `j-4615` exercised a standalone emitted graphic;
`j-4616` then reproduced a real merge-engine fault: the donor root stayed at opacity zero
after Play because it sits outside the host's root. Explicit arrival and exit data fixed
that; `j-4617` passed Play, both Next steps, Out and replay. `j-4618` exposed a changing CSV
fixture racing two sequential field reads. Keep each row stable until both fields are
observed, then change the fixture so the next real poll must show the second row. Queue job `j-4620` passed all 13 cases in both complete files in 35.8 seconds, with no skips. Review then strengthened appearance retargeting: carry the inserted children's entrance tracks with their container, refusing collisions instead of losing authored motion. Its real Play/Next, source equality and full Undo proof passed in `j-4621`. Final queue job `j-4622` passed all 13 cases in 37.0 seconds, with no skips.
No assertion or limit was relaxed. The four new Node checks cover source preservation,
replacement/removal, atomic refusal, unknown host data, stale edits and session undo/redo.
Catalog emit passed for all 528 designs; TypeScript and ESLint passed. No local full suite,
full catalog sweep or production build ran; authoritative bundle/factory and broader browser
checks remain in Actions. The 75-file affected plan is recorded as broad, not claimed locally.
Rendered captures show the existing picker at 1440px, the merged artwork and the Sheet form
at 1280px. Catalog thumbnails load only on intersection; wait for the six visible roots before
judging the picker. Review also corrected duplicate component keys, modal Escape/focus return, the binding covers headers, and carrying the donor entrance when its appearance moves. All 27 changed Node checks pass. Public copy is plain; only its two reduced copy-baseline
counts change (AssetsPanel 10 to 9, InsertTemplateDialog 5 to zero). The retained generator and
merge helper remain the only implementations, with one bounded session edit per UI action. The final targeted navigation check `j-4623` also passed: Escape restores focus, browser Back closes the picker, and Forward cannot resurrect it or change the document.

Reconciled on main `f79b9b5176aa540944bda5f3b0d4d91fa7bc0745` after PR #1489 landed, with a merge commit and regenerated contracts. All seven kept live-gap cases now run; one covered production duplicate still calls the retired skip helper and needs its final equivalence audit before helper deletion. Final main-reconciled queue job `j-4625` passed all 13 cases in both complete files in 35.0 seconds, with no skips. Changed gates passed all 27 selected Node checks, and contract regeneration produced no additional branch changes.

### Remaining order and the #800 exit condition

1. **Classify subjects while the first shell PR proceeds.** Start from the complete case table.
   Give each old-helper case one disposition: retired interaction; current behavior already
   protected by a named check; or a current protection gap. Record the evidence, not just a
   filename mapping. The issue's historic section count is not a current execution inventory.
2. **Delete exclusive panels/canvas/timeline and their retired UI tests in small groups.**
   Remove PreviewFrame before its imported canvas children; keep partLocks until its final
   consumer goes. Keep CanvasGuides/video, AssetsPanel, InsertTemplateDialog and current export
   surfaces. Update all covers headers naming removed paths, including live playout-baseline;
   update affected-planner examples without weakening their selection properties. Delete the
   pasteboard helper only with its skipped old-UI checks. Its three test imports are not live.
3. **Resolve #800 by product family in the same run.** Handle pure formatting/runtime cases in
   Node where suitable; keep real import, wizard, playout, library, export and persistence
   journeys in the browser. Reuse current coverage and retain historical defect cases. Where
   coverage already exists, demonstrate equivalence and remove the duplicate instead of
   porting every old test. Where protection is missing, add a minimal current-surface check
   and prove its relevant failure. Each removal has its reviewed per-spec maintenance entry.
4. **Resolve the released mixed-editor skips.** On 2026-10-18 the owner explicitly released
   the nine skipped cases in library (seven), project (one) and wizard-finish (one) to this
   cleanup. The earlier eight-case receipt omitted one library case. This handover covers
   those skipped cases only; editor Phase 2 keeps its repair checks and acceptance work.
   Classify each released subject and prove current coverage before removing its old helper.
   Record the changed skip baseline in the editor phase note without claiming its acceptance.
5. **Remove obsolete helpers only after #800's consumers are resolved.** No remaining test may
   call skipOldEditor, enableAdvancedMode, switchToAdvancedMode, finishIntoEditor or createProject.
   Keep _create's live exports, including bootstrapGraphic and addToProductionFromFinish.
   Delete unused _code/_ai-notice helpers only after checking all remaining callers. Update
   VERIFICATION's old bootstrap instructions.
6. **Finish selective shared cleanup last.** Store, router, saved-data/prefs and CSS remain
   reserved during editor repair. Preserve URL behavior and stored shapes; a supported format
   needs its own owner decision before removal. Review CSS rule by rule. No wholesale parts.

**#800 is part of completion, not a reason to delay the isolated first PR.** The run is not done
until every original live-subject case has either a running current check or evidence that a
named existing check covers it; all retired skip-helper callers are gone; and CI passes on the
landed result. Then update/close #800 under the implementation task's issue authorization.
Restoring missing protection may increase active test time; measure it rather than promising
that all restored tests save minutes. Do not leave skipped tests indefinitely "just in case".

For every subsequent PR: run worktree-activity, fetch main, inspect remote PR/plan allocations,
reserve shared paths, and recheck the actual diff. CORE changes such as PreviewFrame or shared
styles trigger the existing broad CI selection. Bank only removed copy/evidence baseline rows;
never loosen a gate. Capture the landed SHA and fresh size/time receipt.

Current concurrency evidence: harness-ladder and cloud-recovery work have no direct overlap
with the seven-file first PR. Editor repair #1391 has now landed and changes store, router,
project/library and durable state. Its independent acceptance is not inferred from merging.
Keep those paths reserved. No code-health refactor runs on files awaiting retirement.

## Remaining candidates, ranked by saving and confidence

Confidence is evidence quality, not a numerical probability. Within the approved old-editor
phase the largest proved deletions go first. Beyond it, prioritize a large measurable saving
with strong evidence over a large folder with uncertain purpose. Times below are current
whole-spec costs or explicitly historical estimates; they are not promised net savings.

| Rank | Action | Candidate and current footprint | Confidence, proof needed and saving |
|---|---|---|---|
| 1 | delete / resolve | 27 exclusive source candidates: 10,760 lines; test subjects reviewed under #800 | High for isolated shell; conditional for remaining groups. No blanket test-line/time credit |
| 2 | move / consolidate | Proposal/command task walks (7.014 min), drawing task (1.541), two transform/property qualifications (2.347), SVG example walk (2.077) | Medium; up to 12.979 browser-minutes can move out of the frequent suite, less retained short journeys. Keep all in scheduled validation; zero total-validation saving claimed. Fault-inject command apply, proposal normalization, pen persistence and transform save first |
| 3 | delete, pending product decision | 35 research-only AI modules, 10,566 src lines; linked creative/spike/Pro tools and tests | Medium for reachability, low for retirement. Owner decides promised lanes; measured whole cluster is not a deletion list. Keep shared live AI modules |
| 4 | move | creative-routing and render-schedule pure checks (0.915 min) | High candidate confidence; preserve every branch/negative pair in new Node tests. Net CI saving awaits Node timing |
| 5 | move or delete with lane | creative-pilot (2.061 min) | Conditional on rank 3. Existing mutation twins transfer unchanged if lane survives; never count movement and retirement twice |
| 6 | consolidate | editor-groups + editor-arrangement (4.914 min), existing arrangement Node tests | Medium; common setup is not equivalent behavior. Move arithmetic, retain rendered bounds/button/undo journeys; mutate geometry and group transforms. Prior 2–3 min estimate is unverified |
| 7 | consolidate | import-svg-corpus (5.750 min), import-svg (4.940), import-svg-behaviour (4.443) | Medium; delete retired cases first; retain exporter defect fixtures/sidecars and current wizard/production journey. Old study's ~3 min corpus estimate must be remeasured |
| 8 | consolidate | playout-folders (7.080), Bridge pairing (4.108), production-controls (2.500), playout-cues/clock (4.955) | Medium; preserve isolated failures, delayed replies and on-air state. Profile boot and use controlled clocks; no banked time saving |
| 9 | move | bench (2.395) and five Lite rendering suites (3.489) to minimal browser fixtures | Medium; keep real paint/layout and mutation detection. No whole-suite Node move or quantified saving |
| 10 | consolidate / move | quiz-live-consistency (2.055) | Medium; retain both answer models and historical Reveal defect replay; exhaustive catalog walk may be scheduled. No change before protection proof |
| 11 | delete | Eight superseded old-editor documents, 1,280 lines | High after live references/schema facts move; active instruction-loaded and new-editor documents stay |
| 12 | delete | Three one-off catalog/shop screenshot probes, 193 script lines | High no-caller evidence; no assertions, workflows, hooks or package entries. Approval still required beyond Phase 1 |
| 13 | move | templates/blank.ts, 104 lines, into current test fixtures | High test-only evidence; source shrinks, total code does not. Keep sound/project-format checks |
| 14 | keep / review | Other unused-export findings, remaining uninvoked scripts, completed research docs | Low retirement confidence; inventories name callers and behaviors. No blanket deletion or percentage target |
| 15 | keep | Registered templates, configured/HTTP tests, media/render/iframe tests, active gates and public assets | Current consumers; 34,153-byte unreferenced public mark still needs a public-URL decision |

This incorporates all twenty candidates from the earlier E2E budget study. Its broad-header,
never-selected and configured-cadence items remain inputs to the separate selection/infrastructure
work; none establishes that a behavior can disappear. No CI job is proved unnecessary here.
Use [audit details](evidence/audit.md) for no-UI false positives, Node discovery and schema boundaries.

## Expected end size and savings

Scenarios use the original source pin so comparisons remain like-for-like; current main has
additional unrelated work. Re-pin before implementation. Revised forecast:

| Area | Original baseline | Supported scenario |
|---|---:|---|
| src TS/TSX | 303,553 | 302,323 after the seven-file first PR; 292,793 if all 27 source candidates are retired |
| e2e TS/TSX | 116,035 | Unchanged by the first PR; final net size depends on #800 classification and replacement checks |
| scripts implementation | 106,976 | No whole-file deletion in Phase 1; planner edits and later approved probe removal measured separately |
| scripts tests | 55,586 | No whole Node test file proved obsolete |
| docs Markdown | 129,125 | 127,845 after the eight conditional document cuts, before this report and retained schema text |

No test minutes are credited to the first PR. The historical 0.497 minutes is the cost of the
36 helper-skipped files, not the saving now approved. The review's 20-file starting list totals
4,561 lines / 0.268 minutes, but its live subjects still require classification. Keep these as
context, not promised reductions. Later Node/consolidation candidates remain separate.

**Whole CI jobs saved: zero proved. Build seconds saved: unknown.** AppShell is already absent
from the production app path. No Monaco/dependency saving is proposed. The admin assessment
has separate measured shipped assets and costs; no admin removal is included in this forecast.
See forecast.json for arithmetic, excluded costs and the report's own footprint.

## Stop the bloat returning

Proposed rule, to land with the first approved retirement: **a feature removal removes its
exclusive code, tests, fixtures, tools and active instructions/docs in that PR. Shared readers
or helpers stay with a named current consumer. A required temporary remainder has a named
follow-up PR and compatibility reason.** Git preserves obsolete design history.

Reuse `contracts/retired.json` for the retired surface name, date, replacement and reason.
Extend the existing affected planner and protection check to consume the same retirement
record's source/spec identities; do not create a second scheduler or a skip list. A retired
source appearing again is a review failure, not a reason to omit its tests. Add a focused
fail-then-pass check for accidental reintroduction and for an unlisted test removal. Keep
`check-retired-names`, dependency checks and protection gates enabled.

Maintenance entries are authored only in the removal's reviewed work spec and name exact
retired behavior or replacement/fault evidence. The [maintenance procedure](evidence/test-maintenance-draft.md)
contains no active blanket gate approval; the former broad drafts have been withdrawn. Do not add a rule demanding more
process for every unrelated change; use the existing feature-removal/review path.

## Test maintenance

One line per spec file whose declarations a cleanup PR removed, naming each case and whether it
was retired old-editor UI (the surface it drove) or current behaviour already protected by a named
running check. The full disposition of all 474 old-helper cases is
[evidence/test-dispositions.tsv](evidence/test-dispositions.tsv): retired (R), covered (C),
gap (G, a live behaviour revived or re-homed in a later PR of this run), undecided (?) and
reserved by the editor phase.

- 2026-10-17 `e2e/timeline-v2.spec.ts`: 24 case(s) removed with the old editor's timeline, canvas and preview sources, 1 live case(s) kept for issue #800; receipt evidence/test-dispositions.tsv. "v2: step clips on a ruler with cue markers — steps are the clips" (retired UI: tlv2-clip-*/tlv2-hold/tlv2-kf-* are StepTimeline.tsx in the retired dock; the new editor's own timeline is covered by e2e/editor-steps.spec.ts.); "v2: clicking the timeline moves the playhead and scrubs the preview — no history" (retired UI: Ruler click, tlv2-playhead and the retired PreviewFrame scrub (iframe.preview-frame): StepTimeline.tsx. New editor scrubbing is covered by the editor-* specs.); "v2: zoom scales the clips; row labels drive the shared selection" (retired UI: tlv2-zoom-in and .tlv2-labels .timeline-label shared selection: StepTimeline.tsx (retired).); "v2 keyframes: convert, arm at the playhead, auto-key, interpolate — the ratified workflow" (retired UI: inspector-kf-x / inspector-input-x auto-key on the old Inspector.tsx + StepTimeline (retired). New editor keying: editor-keys.spec.ts:142/208/222.); "v2 keyframes: dragging a diamond retimes it; Delete removes it; undo restores" (retired UI: tlv2-kf diamond drag, Delete, undo: StepTimeline.tsx (retired). New editor: editor-keys.spec.ts:142 ('diamond last removal ... exact undo'), editor-cross-cue.spec.ts:279.); "v2 presets: In and Out apply independently; applying a preset cleanly swaps the targeted motion" (covered: motion-presets.spec.ts:94 (running): on the control page In and Out are picked independently (Rise in, Fade out) and a pick is a clean swap of the unit's motion; :156 proves the engine on every category. inspector-preset-* belongs to the retired Inspector.tsx.); "v2 presets: a single layer takes a preset into ITS activation step (In is layer-relative)" (retired UI: A per-layer preset into the layer's own reveal step is Inspector.tsx's layer-scoped presetApply (retired); live surfaces apply motion per unit (motion-presets.spec.ts:94, wizard :458).); "v2: the canvas chip moves a layer between presses on a data template" (retired UI: The canvas-appears chip is CanvasInteraction.tsx (retired canvas) over src/blocks/stepAssign.ts (deletion candidate).); "v2 clips: right-edge resize preserves keyframe timing; Alt-drag stretches it" (retired UI: tlv2-clip-handle resize/Alt-stretch semantics belong to StepTimeline.tsx (retired); the new editor retimes by flag drags keeping absolute times (editor-steps.spec.ts:406, scripts/step-authoring.test.mjs:356).); "v2 clips: context menu duplicates, renames, deletes; the definition follows" (covered: scripts/step-authoring.test.mjs:392 'applyStep ... keeps the step count and the SPX definition' (add/rename/delete keep settings.steps and the html definition) and e2e/editor-steps.spec.ts:352 (rename/delete are one undo each and reopen). tlv2-menu-* is StepTimeline.tsx (retired).); "v2 clips: »+ adds an authoring step; the hold popover edits how the graphic leaves" (retired UI: The hold popover (tlv2-hold, tlv2-out-mode) writing settings.out is StepTimeline.tsx only; no current surface edits the SPX out mode (RenderPanel only reads it). tlv2-add-step's half is covered live by editor-steps.spec.ts:352 and step-authoring.test.mjs:392.); "v2: Space plays; arrows nudge the selected keyframe on the grid" (retired UI: Space/arrow handling of the old dock (spaceKey + StepTimeline nudge and the canvas handshake): retired. New editor keyboard nudges: editor-cross-cue.spec.ts:279/305.); "v2: a finished run reports itself FINISHED — the strip returns to idle" (retired UI: timelineState()/strip idle and the 'no re-settle after Stop' guard are the simulate channel of the retired PreviewFrame.tsx (the only caller passing simulate:true to composeDocument) and simulatorRuntime's __activeTl release.); "v2 polish: the playhead cap drags; the view follows playback when zoomed in" (retired UI: tlv2-playhead-cap drag and .tlv2-scroll follow: StepTimeline.tsx (retired).); "v2 polish: keyframe and step eases from the menus; ◀ ▶ jumps; label scrubbing" (retired UI: tlv2-kf-ease/tlv2-menu-ease/inspector-prev-*/label scrubbing: StepTimeline.tsx + Inspector.tsx (retired). New editor eases: editor-key-ease.spec.ts:77, editor-ease.spec.ts.); "v2 layer blocks: the existence span renders; its left edge drags the activation" (retired UI: tlv2-block-*/tlv2-block-edge activation drag: StepTimeline.tsx over stepAssign.ts (deletion candidate). New editor bars: editor-keys.spec.ts:188.); "v2 layer blocks: the right edge sets an early exit (hides) and upgrades the interpreter" (retired UI: The tlv2-block-hide drag is StepTimeline.tsx (retired). The step.hides it wrote is legacy visibility the new model converts or refuses (scripts/step-authoring.test.mjs:252/322, cross-cue.test.mjs:146); no verified running playback of a saved hides graphic (vm harness if wanted).); "v2 keyframe sets: shift-click, group nudge, delete, copy/paste at the playhead" (retired UI: Shift-click sets, group nudge, copy/paste at the playhead: StepTimeline.tsx (retired). New editor multi-key: editor-key-ease.spec.ts:77 (marquee), editor-keys.spec.ts:239.); "v2 keyframe lasso: a marquee over the rows selects diamonds; Ctrl/Cmd+D duplicates them" (retired UI: tlv2 marquee lasso and Ctrl+D duplicate: StepTimeline.tsx (retired); new editor marquee: editor-key-ease.spec.ts:77/181.); "v2 property rows: a layer expands into per-property sub-rows with their own diamonds" (retired UI: tlv2-expand-* and [data-proprow] sub-rows: StepTimeline.tsx (retired).); "v2: corner bugs create as data blocks — the step timeline is their native surface" (covered: motion-presets.spec.ts:156 (running) reports 'corner-bug: no data block' if Glass Mark stops creating as data; scripts/step-authoring.test.mjs:392 keeps settings.steps derived from the data on step.add. timeline-v2/timeline-v2-convert are retired testids.); "v2 read-only glyphs: a looping track shows a repeat tail, and lifecycle calls get their own row" (retired UI: tlv2-loop-*/tlv2-call-* glyph geometry: StepTimeline.tsx (retired). The data they draw (ss01 loop, startClock/stopClock calls) is anim-engine's subject (rows 252 and 191).); "v2 read-only glyphs: a finite repeat ends where it really ends, and is capped when it fits" (retired UI: tlv2-loop-f0 finite-repeat cap geometry: StepTimeline.tsx (retired).); "v2: the quiz Continue is a real step — its reveal is a lifecycle call, and the SPX steps setting is derived" (covered: quiz-live-consistency.spec.ts:75 and production-controls.spec.ts:129 (running): the reveal state's lifecycle call paints quiz-correct on PROGRAM; scripts/step-authoring.test.mjs:392 keeps settings.steps derived across edits. tlv2-clip-1/tlv2-call-revealAnswer are StepTimeline.tsx (retired).)
- 2026-10-17 `e2e/machine-graph.spec.ts`: 18 case(s) removed with the old editor's timeline, canvas and preview sources, 2 live case(s) kept for issue #800; receipt evidence/test-dispositions.tsv. "the dock toggles between the step timeline and the machine graph" (retired UI: timeline-surface-toggle / machine-graph / mg-state-* / .tlv2-body are MachineGraph.tsx + StepTimeline.tsx in the retired dock.); "a machine-less template shows its derived walk, honestly labelled" (retired UI: mg-state-main-off, .mg-derived-chip and .mg-arrow-walk labels: MachineGraph.tsx (retired). deriveMachine itself runs in motion-presets.spec.ts:156 and scripts/out-step.test.mjs:203.); "clicking a state snaps the preview there and its card opens the timeline at its step" (retired UI: mg-state click, mg-state-card copy, mg-open-step and the store playhead: MachineGraph.tsx/StepTimeline.tsx (retired). Snap itself: production-controls.spec.ts:129 (machine-snap) and snap-recovery.spec.ts:98.); "the transition card edits an arrow: event rename, illegal names refused, styles applied" (retired UI: mg-arrow/mg-transition-card/mg-event/mg-style/mg-style-duration: MachineGraph.tsx (retired). Residue for the machineEdit classifier: setTransitionEvent's reserved-name refusal has no running check (machine-edit.spec.ts skips).); "drawing an arrow from a port creates a transition; the walk's only edge refuses deletion" (retired UI: Port drag, mg-delete-transition and the walk-edge card: MachineGraph.tsx (retired). machine-graph.spec.ts 'the stop edge...(rehoming)' (running) pins removeTransition on a lifecycle edge; the walk-edge refusal is machineEdit residue.); "a state nothing can enter is marked where it was authored, and the mark clears" (retired UI: mg-problem-*, mg-state-problem copy and .mg-badge: MachineGraph.tsx (retired). validateMachine's unreachable error is only asserted clean on catalog machines (template-pack-10:143, full-frame-offering:205); a positive Node case on blocks/animMachine would be the smallest if wanted.); "branch states and parallel groups add and delete; a dragged box parks and persists" (retired UI: mg-add-pose/mg-add-group/mg-del-group and the dragged box's `at` layout field are MachineGraph.tsx (retired); `at` has no other reader.); "editing a derived machine materializes it, and Reset restores the shipped template" (retired UI: Graph drag materializing a derived machine plus topbar reset-project (no such testid left in src). Materialization by a mutator is pinned by machine-graph.spec.ts 'the stop edge...(rehoming)' (running: setTransitionStyle on derived lt01 yields a machine) and motion-presets.spec.ts:156.); "a layer gets its own timeline from the graph: ▤ step, cut style, Delete restores by undo" (retired UI: mg-add-layer-*, the 'Name In' layer timeline and its cut style: MachineGraph.tsx + src/blocks/layerTimeline.ts (deletion candidates).); "the timeline clips and the switch carry the layer/graphic vocabulary" (retired UI: timeline-surface-timeline/toggle text and .tlv2-clip-kind badges: StepTimeline.tsx (retired).); "two complete graphic timelines chain on the path (the ◇ > ◇ rundown case)" (retired UI: Graphic badges on .tlv2-clip-kind-graphic and .mg-kind-graphic (retired UI). duplicateStep/renameStep mutators: machine-graph.spec.ts 'structural step edits carry the walk's arrows' (running) and scripts/graphic-sound.test.mjs:19.); "a branch state gets its own timeline, and it really plays" (covered: Runtime half: entering a branch state by dispatch plays its inline timeline: production-controls.spec.ts:129 (Arena Quiz select/lock/judge paint quiz-sel/quiz-locked/quiz-correct on PROGRAM) and exports.spec.ts:677 (OGraf custom actions). Graph authoring, lens and state scrub are retired UI.); "the timeline says how each step is really reached, timers included" (retired UI: tlv2-clip title copy 'Plays on.../Plays by itself' and the timer cue exist only in StepTimeline.tsx (no such copy in editorFoundation). Timer mutator: machine-graph.spec.ts 'structural step edits...a timer survives a delete' (running).); "the editor greys an event the machine would drop" (covered: production-controls.spec.ts:129 (production page: revealChoice grey from Question, select greys after lock with the chip naming the state) and control.spec.ts:209 (exported panel greys illegal events). The sim-event-* strip is PlayoutSimulator.tsx (retired).); "a state that only fires a lifecycle call is not described as doing nothing" (retired UI: mg-state-card copy ('changes the whole graphic', 'holds the look it arrives with', 'the rest state') and .mg-kind-graphic: MachineGraph.tsx (retired).); "the transition card names the two ends the way the boxes do" (retired UI: mg-state-name rename, .mg-card-name and its title: MachineGraph.tsx (retired). Id stability under rename (id stays step-2) is machineEdit residue (machine-edit.spec.ts skips).); "every "+ state" entry is reachable at the default dock size" (retired UI: mg-add-menu geometry inside the machine-graph dock: MachineGraph.tsx (retired).); "the transition card is reachable and stays put while the diagram scrolls" (retired UI: mg-transition-card geometry and pinning against .mg-viewport: MachineGraph.tsx (retired).)
- 2026-10-17 `e2e/legacy-timeline.spec.ts`: 4 case(s) removed with the old editor's timeline, canvas and preview sources, 1 live case(s) kept for issue #800; receipt evidence/test-dispositions.tsv. "the dock picks the surface from the CODE: data edits, readable legacy converts" (retired UI: Asserts timeline-v2 / timeline-v2-convert chips and the .tabs JS tab of the retired dock (StepTimeline.tsx, old code pane via showCode). The importer itself (convert/refuse) is pinned by scripts/pro-harness.test.mjs:563.); "a region the importer refuses is still CHARTED — read-only, and honest about why" (retired UI: Asserts the read-only legacy chart of LegacyTimeline.tsx (timeline-ov-sec-in/out, .timeline-bar, timeline-readonly-note, timeline-phase-preset...) in the retired dock; no current surface charts a legacy region.); "scrubbing the read-only chart drives the preview and writes nothing" (retired UI: Scrubs LegacyTimeline.tsx's timeline-scrub/timeline-playhead/timeline-time in the retired dock; the preview it drives is the retired PreviewFrame (iframe.preview-frame).); "start over: the escape hatch out of unconvertible code writes DATA, and undo goes back" (retired UI: timeline-preset-reset ('start over') and timeline-unreadable live in StepTimeline/LegacyTimeline.tsx (retired); no current surface offers a preset on an unreadable legacy region (the control page Motion section needs a data block: motion-presets.spec.ts:94).)
- 2026-10-17 `e2e/canvas-selection.spec.ts`: 9 case(s) removed with the old editor's timeline, canvas and preview sources, file deleted; receipt evidence/test-dispositions.tsv. "clicking a text line selects it: outline + a chip naming the field — no code written" (covered: e2e/editor-foundation.spec.ts:99 'canvas, timeline and Outline share selection': track click shows .ef-selection rect and the inspector names #f0, a canvas click re-selects, template equals stored source after (no code written). Chip/change-dot are retired UI.); "hovering a selectable element previews its name; leaving clears it" (retired UI: canvas-hover/hover-tag are CanvasSelection overlay testids; the new Canvas.tsx onPointerMove (line 323) drives gestures only and shows no hover name.); "clicking empty canvas or pressing Escape deselects" (retired UI: Empty-click/Escape deselect is CanvasSelection's model; the new editor maps Escape to session.cancel() (EditorFoundation.tsx:171) and an empty-stage drag to a marquee (editor-base-edits.spec.ts:144); its selection model has its own specs (editor-foundation.spec.ts:99, editor-usability.spec.ts:203).); "clicking the selected part again climbs to its container; the whole graphic keeps the scale handle" (retired UI: Climb-to-container on re-click and the root scale-handle are CanvasSelection/CanvasInteraction UI; the new editor cycles nested hits with Alt-click (Canvas.tsx:297, editor-groups.spec.ts:148) and has no --scale corner handle.); "selection layers cleanly under inline editing and never blocks drag-to-move" (covered: e2e/editor-base-edits.spec.ts:94 'B04 artwork content...': dblclick opens .ef-inline-text, Escape cancels with source unchanged, Apply writes; editor-arrangement.spec.ts:165 inline textarea owns keys and selection survives; B02 (:144) covers drag-to-move with a selection.); "selection is shared: a canvas click highlights the timeline row, a row label selects on canvas" (covered: e2e/editor-foundation.spec.ts:99: a track click selects on canvas (.ef-selection rect) and in Outline (aria-pressed), a canvas click changes the shared selection, and the template is unchanged after.); "the chip assigns the selected part to a press — the data chain, from the canvas" (retired UI: canvas-appears chip and stepAssign.ts/setLayerActivation have only retired callers (CanvasInteraction, Inspector, StepTimeline, layerTimeline). The new editor authors visibility as bars; step-authoring.test.mjs:252/331 treat reveals as legacy; runtime reading kept by editor-steps.spec.ts:556.); "mobile: the chip drops the desktop-gesture hints and stays inside the canvas" (retired UI: selection-chip and .canvas-chip-hint are CanvasSelection UI; the mobile stack (SidePanel) is deleted.); "a block element outside the root joins the press chain: hidden until its press, gone with the exit" (covered: scripts/cross-cue.test.mjs:229 'a layer outside the root fades where the exit starts...': #outside (stage.contains false) has opacity 0 'unreached from an earlier step' and fades once the exit starts; out-step.test.mjs fixture reveals #outside in Step 3. The chip half is retired.)
- 2026-10-17 `e2e/inspector.spec.ts`: 7 case(s) removed with the old editor's timeline, canvas and preview sources, 1 live case(s) kept for issue #800; receipt evidence/test-dispositions.tsv. "inspector: sits in the right dock, empty until something is selected" (retired UI: dock-slot-right, dock-tab-inspector and toggle-inspector are WorkspaceDock UI (deleted 2026-10-17).); "inspector: selecting a timeline row shows that layer — selection synced all around" (covered: e2e/editor-foundation.spec.ts:99: track click -> .ef-inspector contains '#f0', shift-click -> '2 layers selected'; editor-transforms.spec.ts:185 reads the selected row's keyed value (Layout offset Y shows its yPercent) in the inspector.); "inspector: canvas clicks drive it too (select it to affect it)" (covered: e2e/editor-foundation.spec.ts:99: a mouse click on the canvas selection rect changes the selection the .ef-inspector shows.); "inspector: a new selection reveals it; an explicit close holds until the selection changes" (retired UI: Reveal-on-select and explicit-close hold are WorkspaceDock/panelRevealNonce behaviour; the store's activePanel/panelRevealNonce have no reader (spec receipt) and await the store cleanup.); "inspector: the pivot sets the transform-origin, and the runtime honours it" (covered: e2e/editor-canvas-transforms.spec.ts:646 'a turned row's anchor moves only its pivot, so its whole reveal turns about it' (runtime honours the pivot); :401 asserts the written transform-origin CSS. The transformOrigin keyframe track is retired: the new editor refuses layers carrying one (:540-548).); "inspector: the 3D transform rows arm and key a rotation (docs/PRESET_MODEL_REVIEW.md gap 7)" (retired UI: inspector-kf-rotationY/perspective rows are Inspector.tsx UI; the new editor exposes no rotationX/Y/perspective/z channel (only animPresets.ts/animImport.ts mention them). rotationY is an ordinary numeric track whose keying is generic (editor-keys.spec.ts).); "inspector: filter rows compose into one filter track without clobbering each other (gap 8)" (covered: e2e/inspector.spec.ts:258 'filter track: every keyframe keeps the same shape...' (RUNNING, bootstrapGraphic): setFilterComponent blur then brightness -> every keyframe carries both, runtime mid-tween moves both. setFilterComponent's only UI caller is Inspector.tsx, so it becomes dead code with it.)
- 2026-10-17 `e2e/layout.spec.ts`: 8 case(s) removed with the old editor's timeline, canvas and preview sources, the running cases kept; receipt evidence/test-dispositions.tsv. "the default framing: code CLOSED, Inspector + tools on the right, timeline in the centre" (retired UI: toggle-code, dock-slot-left, dock-tab-*, center-stage are WorkspaceDock/AppShell UI (deleted); no-old-editor.spec.ts pins toggle-code/center-stage never render.); "opening the code pane narrows the centre, and the OPEN state persists" (retired UI: Code pane (CodeEditor) and the left dock are deleted; dock-tab-code never renders.); "closing a panel removes its dock and widens the centre; the closed state persists" (retired UI: Dock close/reopen via dock-add-right menu is WorkspaceDock UI (deleted).); "dragging a dock divider resizes it, and the size persists" (retired UI: left-divider is a WorkspaceDock divider; model/layout.ts's only live import is clampRatio in VideoAppShell.tsx:15 (its own code/preview split, not docks).); "a panel moves between docks via its tab menu" (retired UI: dock-tab-menu-style / 'Move to left' are WorkspaceDock UI (deleted).); "the timeline sits in the centre at an editing scale with real room" (retired UI: center-timeline and .tlv2-row are the old shell's StepTimeline framing; the new editor's timeline room has its own checks (editor-foundation.spec.ts:99 timeline >=240px at 1366x768; editor-canvas-short-height.spec.ts:17).); "the timeline height is resizable via the centre divider, and persists" (retired UI: timeline-divider is WorkspaceDock UI; the new editor sizes its timeline per breakpoint (editor-canvas-short-height.spec.ts:17 asserts 180/240px).); "mobile: the Inspector is a panel tab, so a selected layer can still be edited" (retired UI: panel-tab-inspector belongs to SidePanel (deleted); the old inspector is Inspector.tsx (deletion candidate).)
- 2026-10-17 `e2e/text-tools.spec.ts`: 8 case(s) removed with the old editor's timeline, canvas and preview sources, file deleted; receipt evidence/test-dispositions.tsv. "T tool: click places point text, typing lands on the canvas, Enter commits a real f0" (covered: e2e/editor-base-edits.spec.ts:313 'B04 tools create real text fields...' (text tool creates a real field with its own id, selected track, wrapper box) and :547 (click adds a field); typing goes through the inline textarea + Apply (:94) rather than live on canvas.); "T tool: Escape (or committing empty) removes the just-created field again" (covered: e2e/editor-drawing-persistence.spec.ts:101 'text: Escape, pointer loss and explicit tool choice discard only the draft': Escape during the text gesture leaves source unchanged and Undo disabled. The new editor never creates an empty field, so 'commit empty removes it' has no counterpart.); "T tool: ids continue the existing sequence — a Data-tab f0 makes the tool text f1" (covered: e2e/editor-base-edits.spec.ts:313/:547: the created field is fields.at(-1) with a unique id resolved by '#'+id and '#fw'+id locators (nextFieldId, designLayout.ts:582/720, same function). The Data-tab add path (SampleDataPanel) is retired.); "area tool: a drag becomes a wrapping lorem text box of the dragged width" (covered: e2e/editor-base-edits.spec.ts:313: a text-tool drag creates a text box; a long value wraps inside it and Width 120 makes it taller while the glyph size stays 48px.); "area tool: the corner handle resizes the box and the text rewraps to it" (covered: e2e/editor-typography.spec.ts:264 'a text box resizes from its sides without stretching its letters': an edge drag widens the slot by the pointer move, font-size stays 48px, one undo, Escape cancels.); "text tools: Escape disarms back to Select and the canvas gestures return" (covered: e2e/editor-drawing-persistence.spec.ts:117 'Escape returns to whole-layer Select' and :101 (explicit tool choice retains select, nothing created). The 't' hotkey is a property reveal in the new editor (EditorFoundation.tsx:168), not a tool switch.); "tool-created text survives a reload as a real field of the saved project" (covered: e2e/editor-base-edits.spec.ts:443 'B04 edited ... survives save/reopen and SPX/CasparCG/OGraf export': text tool adds a field, save dialog, settleDurableWrites, reload, fields compared; editor-typography.spec.ts:383 saves and reopens typed text.); "the text tools are a placed-design surface: a catalog template offers no toolbar switch" (retired UI: tool-switch is CanvasInteraction's toolbar; the new editor offers its tools on catalog graphics too (editor-base-edits.spec.ts:313 on the Hairline seed).)
- 2026-10-17 `e2e/canvas-keyframe.spec.ts`: 6 case(s) removed with the old editor's timeline, canvas and preview sources, file deleted; receipt evidence/test-dispositions.tsv. "dragging a selected layer keys x/y at the playhead — the drag itself arms" (covered: e2e/editor-transforms.spec.ts:185 'Clean Steps: Position Y ... a canvas drag key it at the playhead': drag writes the key at the parked playhead, one history entry, undo restores; editor-keys.spec.ts:239 drag writes an x track. Channels are now armed explicitly (design change).); "a multi-selection drags together — every layer keys its own pair, one apply" (covered: e2e/editor-base-edits.spec.ts:144 'B02 multi-object drag, marquee and cancel share one undo transaction': two Ctrl-selected layers move by the same delta, one Undo restores all; editor-keys.spec.ts:239 'mixed multi-selection keys only armed channels and commits one undo'.); "arrow keys nudge a selected layer — x/y keyframes at the playhead, one apply per burst" (covered: e2e/editor-arrangement.spec.ts:57 'held canvas arrows preview then commit and undo as one gesture': real auto-repeat moves 5px, commits once on release, one undo. A nudge now writes base layout, not a keyframe (design change, not a gap).); "a real arrow key press reaches the nudge handler" (covered: e2e/editor-arrangement.spec.ts:57 drives real keyboard.down/holdKeyRepeats on the focused canvas and asserts the move; :37 'baseline probe' presses a real ArrowRight. Same fault (dispatch-only handler) caught.); "with nothing selected, the drag still re-anchors the root (zone patch)" (retired UI: Root re-anchoring by a canvas drag is CanvasInteraction's zone-move; in the new editor a drag on empty stage is a marquee (editor-base-edits.spec.ts:144). The zone patch it wrote is the live subject of wysiwyg.spec.ts:45 (see that row).); "Escape cancels a layer drag — nothing written, the layers spring back" (covered: e2e/editor-base-edits.spec.ts:144 B02: Escape mid-drag leaves source equal and the selection rect springs back to its start x; editor-transforms.spec.ts:185 drag(..., {escape:true}) leaves source equal to original.)
- 2026-10-17 `e2e/keyboard.spec.ts`: 6 case(s) removed with the old editor's timeline, canvas and preview sources, file deleted; receipt evidence/test-dispositions.tsv. "a held Space over the timeline plays ONCE, not once per key-repeat" (covered: e2e/editor-usability.spec.ts:40 'B02 B04 B13 usable authoring': holdKeyRepeats on Space with the canvas focused leaves the clock at the boundary (repeats never replay; EditorFoundation.tsx:102 ignores event.repeat).); "a Space TAP over the stage plays, exactly like one over the timeline" (covered: e2e/editor-usability.spec.ts:40: canvas focused, press Space -> clock advances and Play toggles; :134 parkFocusOffControls then Space plays from the beginning.); "a HELD Space over the stage stays a pan and never plays" (covered: e2e/editor-usability.spec.ts:140 'B11 losing pointer capture cancels Space panning without playback': held Space + drag pans the artboard, clock and source unchanged; :66-73 held Space with auto-repeat stays a pan.); "Space on a focused button activates the button instead of playing" (covered: e2e/editor-usability.spec.ts:159 lines 193-197: Space with a focused numeric field leaves the clock parked and no Pause button (same spaceKey activatableFocus guard, EditorFoundation.tsx:100). The focused-BUTTON variant is not asserted separately.); "a modal takes the editor shortcuts: Delete behind the wizard changes nothing" (covered: e2e/editor-usability.spec.ts:159 lines 198-201: Space inside the save dialog starts no playback behind it. Delete is target-scoped to .ef-layer/canvas (EditorFoundation.tsx:177) so a dialog's focus cannot reach it; modalOpen() also pauses playback (:114).); "Ctrl+C yields to a live text selection instead of swallowing the copy" (retired UI: The Ctrl+C claimant was StepTimeline's keyframe copy; the new editor registers no copy/clipboard handler (grep editorFoundation), so nothing can swallow the browser copy.)
- 2026-10-17 `e2e/multi-select.spec.ts`: 5 case(s) removed with the old editor's timeline, canvas and preview sources, file deleted; receipt evidence/test-dispositions.tsv. "shift-click builds a multi-selection synced across canvas, timeline, and Inspector" (covered: e2e/editor-foundation.spec.ts:99: shift-click a second track -> 2 selection rects, inspector '2 layers selected', click -> 1; editor-usability.spec.ts:203 Ctrl/Shift toggles with source unchanged.); "preview zoom: the buttons scale the viewport, and a click still hits the right element" (covered: e2e/editor-base-edits.spec.ts:547 'base scale agrees with handles at zoom': Canvas zoom 1.5 then a handle drag still hits and edits, undo; editor-canvas-short-height.spec.ts:17 zoom 2 + middle-drag pan persists. The 100%/125% readout is old UI.); "timeline labels shift-click into the same multi-selection" (covered: e2e/editor-usability.spec.ts:203 'B02 Quiz whole selection, modifier selection...': Ctrl-click adds, Shift-click ranges, a plain click replaces (selected() asserted), source unchanged.); "a drag on empty canvas lassos the parts it touches — no code, no history" (covered: e2e/editor-base-edits.spec.ts:144 B02: a drag from empty stage encloses the composition and selects both tracks with source unchanged; editor-usability.spec.ts:203 marquee selects .quiz-box.); "canvas: a selected layer shows scale + rotate handles that key at the playhead" (covered: e2e/editor-keys.spec.ts:222 'armed scale handles key both axes in one transaction': corner handle drag writes scaleX/scaleY keys at the playhead, one undo; rotation handle: editor-transform-qualification.spec.ts:73 (turn() then undo). Handles key only ARMED channels now.)
- 2026-10-17 `e2e/pasteboard.spec.ts`: 4 case(s) removed with the old editor's timeline, canvas and preview sources, 1 live case(s) kept for issue #800; receipt evidence/test-dispositions.tsv. "the pasteboard is sized by the authored motion, and grows when the motion does" (retired UI: computePad/pasteboard.ts is consumed only by PreviewFrame (and composeDocument's authoring option it alone passes); the new editor viewport clips (foundation.css:51 overflow hidden) and has no pasteboard.); "drag an element fully into the pasteboard: negative keyframe, still visible + selectable" (retired UI: Off-canvas visibility/selection is the PreviewFrame pasteboard; negative keys by drag are generic keying (editor-keys.spec.ts:239).); "code ↔ canvas: a negative x written in code renders on the pasteboard and stays selectable" (retired UI: Rendering a negative x on the pasteboard is PreviewFrame-only; the keyframe round-trip is generic animData parse/splice.); "preset-authored off-canvas: a slide preset entrance renders + selects on the pasteboard" (retired UI: Pasteboard rendering is PreviewFrame-only; presetApply itself is covered by e2e/motion-presets.spec.ts (running, addToProductionFromFinish).)
- 2026-10-17 `e2e/machine-edit.spec.ts`: 2 case(s) removed with the old editor's timeline, canvas and preview sources, 3 live case(s) kept for issue #800; receipt evidence/test-dispositions.tsv. "deleting a step drops its waypoint, and DEMOTES one an authored branch still points at" (retired UI: deleteStep's only callers are StepTimeline.tsx:1731 and MachineGraph.tsx:485 (MachineGraph mounts only in StepTimeline); the new editor refuses structural step edits on machines (step-authoring.test.mjs:417). Non-machine deleteStep stays covered by graphic-sound.test.mjs:17.); "the press chain edits under a machine, and the edited graphic still walks its path" (retired UI: setLayerActivation's only route is stepAssign.ts, whose callers (CanvasInteraction, Inspector, StepTimeline, layerTimeline) are all retired. The machine walk itself is covered by scripts/out-step.test.mjs:203 'a machine graphic keeps its authored exit from every state'.)
- 2026-10-17 `e2e/wysiwyg.spec.ts`: 3 case(s) removed with the old editor's timeline, canvas and preview sources, 1 live case(s) kept for issue #800; receipt evidence/test-dispositions.tsv. "W2: dragging the corner handle writes the --scale variable" (covered: e2e/wizard-preview.spec.ts:95 'style step: font and size choices land in the rebuilt preview': Graphic size L -> --scale 1.25 in the preview, whole graphic (type scale separate). The handle and its undo are retired; the max-width var(--scale) follow is not asserted separately.); "a drag starting on empty canvas does nothing" (covered: e2e/editor-base-edits.spec.ts:144 B02: a drag starting on empty stage is a marquee and the source equals the prior state afterwards.); "Escape cancels a drag without touching the code" (covered: e2e/editor-base-edits.spec.ts:144 B02: Escape mid-drag leaves source equal and restores geometry; editor-transforms.spec.ts:185 drag with escape leaves source equal.)
- 2026-10-17 `e2e/inline-edit.spec.ts`: 2 case(s) removed with the old editor's timeline, canvas and preview sources, file deleted; receipt evidence/test-dispositions.tsv. "double-click edits text in place: live value + definition default, undoable" (covered: e2e/editor-base-edits.spec.ts:94 'B04 artwork content, appearance and structure': dblclick -> .ef-inline-text textarea, Apply -> preview #f0 shows the text, Undo restores the source; the operator sample value is deliberately kept (design change).); "Escape cancels an inline edit without changes" (covered: e2e/editor-base-edits.spec.ts:94: fill 'Canceled' in the inline textarea, Escape, source equals the pre-edit template.)
- 2026-10-17 `e2e/canvas-fit.spec.ts`: 2 case(s) removed with the old editor's timeline, canvas and preview sources, file deleted; receipt evidence/test-dispositions.tsv. "the graphic is scaled onto the canvas, not collapsed" (retired UI: Asserts iframe.preview-frame transform + preview-stage: PreviewFrame-only (no live importer). New editor Canvas.tsx:65 clamps fit>=0.01 with editor-canvas-short-height.spec.ts:17 (viewport>=180px at five sizes); the wizard stage is pinned by layout.spec.ts:217 (running).); "a zero-sized stage never commits a zero scale" (retired UI: The zero-measurement commit rule is PreviewFrame's ResizeObserver path (retired). New editor Canvas.tsx:65 Math.max(0.01, fit) cannot commit zero; its layout checks are editor-canvas-short-height.spec.ts:17 and editor-foundation.spec.ts:263.)
- 2026-10-17 `e2e/preview-error.spec.ts`: 1 case(s) removed with the old editor's timeline, canvas and preview sources, 1 live case(s) kept for issue #800; receipt evidence/test-dispositions.tsv. "a template runtime error is worn on the stage, and clears on the next good build" (covered: e2e/editor-foundation.spec.ts:361 'broken source reports failure and recovers': applyTemplate with a throwing js shows .ef-stage-error with the message; restoring the source returns to ready. (ExportWindow no longer passes runtimeError to ExportSurface; only the deleted ExportPanel did.))
- 2026-10-18 `e2e/state-machine.spec.ts`: 1 case(s) removed with the old editor's playout simulator, its surface; receipt evidence/test-dispositions.tsv. "preview: snap-to-state works in the editor, and the event strip guards like the graph" (covered: sim-events/sim-state-chip/.simulator are PlayoutSimulator.tsx (retired). The live surface is covered: production-controls.spec.ts:129 snaps to 'Locked in' (chip, locked pose), greys select after lock, and a legal event (judge) plays through to PROGRAM; control.spec.ts:209 for the exported panel.)
- 2026-10-18 `e2e/import-svg.spec.ts`: 22 case(s) removed with the import family's revival (its Phase 2 receipt above); receipt evidence/test-dispositions.tsv, whose line numbers are the classification's, at main `116022568`. "svg import: overflow-only text fit — a long value shrinks, a short one stays exact" (covered: scripts/svg-fit-rungs.test.mjs 835 rungs 'fits' (a value the room holds paints at the drawn size; drawn values again restore the design), 'room' (never paints past its box) and 'floors' (an unreported squeeze fails) on 49 corpus files at LADDER_VALUES - same runtime, same faults.); "svg import: bound text and top-level groups are registry parts — selectable and animatable" (covered: New-editor tracks come from the same getTemplateParts (editorFoundation/timelineView.ts): editor-foundation.spec.ts 132 opens this fixture there and clicks .ef-track[data-selector="#f0"]; editor-fidelity-trim.spec.ts 52 lists an imported SVG's groups by name. Canvas click/chip/tlv2 row retired.); "svg import: the layer stagger preset walks the artwork’s own top-level layers, as per-layer data" (covered: motion-presets.spec.ts 281 'wizard: the layer stagger spends its beats on what is visible...' reads the saved graphic's animData after Finish: per-member start times staggered (gap >=0.07s), words open at 0, cascade <2.5s - the same per-layer-offset emission. The reversed exit (the words first, then the layers, each opposite to its entrance) is pinned there since this revival.); "svg import: a clock-shaped layer can bind as a countdown — the node ticks, the operator sets minutes" (covered: import-svg-behaviour.spec.ts 1066 (map-svg-kind countdown, minutes field, take starts it, hold/reset on the production page) and svg-examples.spec.ts 79 (Countdown: minutes '5', readout ticks, reset '5:00') drive the same binding and clock runtime; only the hand-pick on a scoreboard clock differs.); "svg import: a value fills the panel it was drawn in before any of it shrinks" (covered: scripts/svg-fit-rungs.test.mjs 849/861 mirror gate: the runtime's room-derived insetX is compared with the step's independent boxFitOf on every bound line (findings pinned) - a room handed back as the drawn width fails it; corpus 831 rule 1/2 (shrink last, inside the box) sweeps shrink mode.); "svg import: copy too long for any size floors instead of vanishing, and says so" (covered: scripts/svg-fit-rungs.test.mjs 835 'floors' on every file at LADDER_VALUES.absurd: never under 30%, under 55% must be reported, squeeze >=70% and reported; corpus 831 shrink/absurd.); "svg import: a lower third climbs the ladder in order — wider, then onto a new line, and only then smaller" (covered: import-svg-corpus.spec.ts 954 'a panel told to get wider AND taller spends both, at the drawn size' on the same effects-gradient-shadow fixture (wider, taller, wrapped, not shrunk, no overrun into the role) + corpus 831 rule 1 order; floors via rungs. Upward-only plate growth is not pinned.); "svg import: a word CENTRED in its plate gets the plate as its room, not its own width" (covered: svg-fit-rungs mirror gate compares insetX for middle-anchored lines (min(anchor-left, right-anchor) - room/2) against the step's box reading on figma-centred-title-card/offset-centred-endboard; corpus 1083 keeps a centred title centred and inside at over1/over3/unbroken; floors via rungs 835.); "svg import: a wrapped value is re-fitted as the words the operator typed" (covered: scripts/svg-fit-rungs.test.mjs 835 'settle': fitSvgText twice and refitSvgText must paint byte-identical markup at every ladder value on every file - a second pass fitting the tspans joined without spaces changes the painting and fails.); "svg import: a panel told to grow taller wraps into the new height instead of shrinking" (covered: corpus 954 (gradient LT grow-xy: plate taller, wrapped at the drawn size, no shrink) and corpus 831 grow-y mode on the owner board (rule 1 no shrink with room, rule 2 inside roomH+extraH); cap at the frame via rungs 'margin' and the sweep's overgrown column (558).); "svg import: growing downwards settles on ONE geometry, whatever order the values arrive in" (covered: scripts/svg-fit-rungs.test.mjs 835 'settle' (second fitSvgText/refitSvgText change nothing, every file, every value) + corpus 1363 'the same question fits the same way whatever was toggled before it' + corpus 831 rule 4 (height offer never depends on history).); "svg import: a value wraps inside the height the design drew, and never past it" (covered: corpus 831 on shrink mode: rule 2 blockH <= roomH (+extraH) and rule 1 shrink only after wrapping; import-svg.spec.ts 2354 (running) on the same 300-tall board reads the wrapped rows at the drawn size within the room.); "svg import: with NOTHING chosen, a long name grows the banner instead of shrinking" (covered: corpus 558 reads the measured default per sidecar growth column on every banner-shaped file; passes `step`/`layout`/`runtime` records (629) pin the default rule and the grown box per ladder value; corpus 831 rule 5 and 1123 prove the plate widens at the drawn size.); "svg import: growth is symmetrical and a line stops at whatever is drawn beside it" (covered: scripts/svg-fit-rungs.test.mjs 835 'margin' (growth never passes the design's mirrored margin; a flat 4% cap fails as 'inside the N it mirrors') and 'neighbour' (a line never paints past what pens it, where it stands now) across the corpus; the largest-size-that-fits probe is not pinned.); "svg import: past the floor a value is squeezed inside its room, never painted outside it" (covered: svg-fit-rungs 'floors' (under 30% never; under 55% reported; squeeze >=70%) and the passes `runtime` record of size% at absurd on every corpus file; the 'never outside the panel' half is exempted for reported lines by the same ruling 2773 pins.); "svg import: the squeeze stops at the legibility floor rather than smearing the words" (covered: scripts/svg-fit-rungs.test.mjs 835 'floors': any squeezed line must be reported and its textLength >=70% of the natural advance, on every file at every value.); "svg import: wider THEN wrap is one choice, and it is two rows on one panel" (covered: corpus 954 (grow-xy: wider AND taller at the drawn size, no shrink) + corpus 831 rule 5 (grow-xy widens the plate at over3/absurd); the double stamp 'g0 g1' sits in the passes bind/layout records of every grow-xy-default file.); "svg import: a rounded-rectangle PATH is the panel that grows, and the ladder options differ" (covered: corpus 954 grows the effects-gradient-shadow PATH plate (plate.width increases, drawn size kept) and the sweep's growthShape column (558) names the growing shape per sidecar; the grown plate keeping its corner curves is asserted there since this revival (curve commands still in the live document), with the shift arithmetic itself (only the far side moves, every corner cubic keeps its shape) pinned in scripts/svg-shape-shift.test.mjs.); "svg import: a rotated panel is measured where it is PAINTED, so the right plate grows" (covered: scripts/svg-geometry.test.mjs 108 'the owner's quiz board: the question plate is a wide band, not a tall one' + corpus 831 shrink mode on the same board (rule 1: no shrink while it can wrap) + sweep growth column (default shrink).); "svg import: a line centred in its box keeps its size, its centre and its neighbours" (covered: corpus 831 on the same board at every mode and length: rule 1 (no shrink while it can wrap), rule 3 (block within 1 unit of the plate centre on both axes), rule 6 (answer plates never move).); "svg import: a board that draws a repeated row keeps every box as drawn" (covered: corpus 558 growth column (sidecar default for the owner board, growthNow reads every box) + corpus 831 rule 6 (answers never move at any length) + import-svg.spec.ts 4032 (running) counts the five box controls.); "svg import: one box can answer the too-long question on its own" (covered: corpus 831 selects boxGrowOf(question) per mode on the same board: rule 5 (grow-x widens the question plate) and rule 6 (answer plates untouched) - the same two claims; the one-rule table is not pinned.)
- 2026-10-18 `e2e/import-graphic.spec.ts`: 13 case(s) removed with the import family's revival (its Phase 2 receipt above); receipt evidence/test-dispositions.tsv, whose line numbers are the classification's, at main `116022568`. "import graphic: the wizard is a setup flow — create lands in the editor, Data tab open" (retired UI: Asserts the old dock handoff (dock-tab-data active, 'No fields on your design yet', Style panel 'Text size' knob). Live halves run: six-stop rail import-svg.spec.ts 4132; PNG to Finish 4302; imported art opens in the new editor project-format.spec.ts 122.); "import graphic: fields added from the Data tab are real placed layers — the wizard step, replaced" (retired UI: Old Data tab add row (.field-add-row, dock-tab-data) and tlv2 rows. Placed-line creation in the new editor runs in editor-base-edits.spec.ts 313 (text tool makes a real field with #fw wrapper, update() drives it, undo removes it).); "import graphic: dragging a field places it in the CSS — never a keyframe" (retired UI: Old canvas drag on iframe.preview-frame with tlv2 row select and the old shell's Control+z. New-editor drag writes base layout: editor-base-edits.spec.ts 144 (B02) and 286 (D03 base layout independent of the animation channel).); "import graphic: Escape cancels a placement drag without touching the code" (retired UI: Old canvas drag cancel (#fw0 inline style on the old preview). New editor: editor-base-edits.spec.ts 144 'B02 multi-object drag, marquee and cancel share one undo transaction'.); "import graphic: an added field is live — sample data drives it with no manual wiring" (retired UI: Old Data panel field row + Update button + export dock. Field binding through update() on a created field runs in editor-base-edits.spec.ts 313 and every production walk.); "import graphic: adding an image field creates a placed slot on the design" (retired UI: Old Data tab add with ftype select and old line-size-handle. Image layers/slots in the new editor: editor-images.spec.ts 27, 127 (raster drop adds a placed #fw layer; imp01 artwork replace) and 357 (binding executes in SPX/CasparCG/OGraf).); "import graphic: arrow keys nudge a selected field — one placement apply per burst" (retired UI: Old canvas arrow-nudge on a tlv2 selection with the old shell's undo. New-editor placement edits (drag, numeric, undo) run in editor-base-edits.spec.ts B02/D03 (144, 237, 262).); "import graphic: the corner handle resizes a field's text in the CSS" (retired UI: Old line-size-handle corner resize on the retired stage. New-editor resize: editor-typography.spec.ts 264 'a text box resizes from its sides...; its corners and point text still scale'.); "import graphic: the Inspector Style tab restyles a selected placed field" (retired UI: Old Inspector Style tab (inspector-style-*). The new inspector writes the line's own rule: editor-typography.spec.ts 119 (weight), 181 (spacing), 345 (SVG text).); "import graphic: the Style tab's Content rows rename and retext a field" (retired UI: Old Inspector Content rows (inspector-style-label/text-value) and tlv2 row label. New-editor text/appearance controls: editor-base-edits.spec.ts 62/313.); "import graphic: a long name shrinks to stay inside its slot, and a short one springs back" (covered: editor-typography.spec.ts 209 'long text: Shrink to fit, Wrap and Run on answer a 61-character value': Shrink with a Width keeps one row inside the slot at >=55% of 48px through fitPlacedText (data-fit=shrink) - same runtime, same fault (uncapped nowrap line); spring-back there is via undo.); "import graphic: wrap flows a long value onto more rows, Free lets it run" (covered: editor-typography.spec.ts 209: Wrap keeps 48px and flows rows>1 inside the slot width; Run on (overflow) runs past 900px on one row; each one undo - the same lineFit modes on a placed line.); "import graphic: the artwork and a field animate as separate layers from the Inspector" (retired UI: Old Inspector Animations tab (inspector-preset-select/apply) on tlv2 rows. Per-layer keys in the new editor run in editor-keys.spec.ts 208/222/239.)
- 2026-10-18 `e2e/import-canvas.spec.ts`: 12 case(s) removed with the import family's revival (its Phase 2 receipt above); receipt evidence/test-dispositions.tsv, whose line numbers are the classification's, at main `116022568`. "import graphic: scaling the design scales the artwork and its fields together" (retired UI: Old canvas design-scale gesture: scale-handle/layer-scale-handle on the retired PreviewFrame, .tlv2-labels rows, old inspector testid. New-editor base scaling runs in editor-base-edits.spec.ts B03 (411, 593).); "import graphic: dragging visible text moves the TEXT, not the artwork under it" (retired UI: Old canvas press-and-drag on iframe.preview-frame (.canvas-world, .tlv2-labels, selectedParts of the old shell). New-editor drag and cancel run in editor-base-edits.spec.ts 144 (B02 drag/marquee/cancel) and 219 (B03).); "import graphic: the locked artwork never captures a drag — bare artwork moves the graphic" (retired UI: Old canvas lock chip (canvas-lock) and the old root re-anchor drag; no lock chip exists in editorFoundation (no lock testid in editor-*.spec.ts).); "import graphic: unlocking the artwork gives it back its own layer gestures" (retired UI: Old canvas-lock chip toggling the retired PreviewFrame's layer gestures (artTracks keyed from the old drag).); "canvas: holding Space pans the view and moves nothing in the document" (retired UI: Old PreviewFrame pan (.canvas-world transform, preview-stage 'panning' class). The new editor's Space pan has its own check: editor-usability.spec.ts 140 'B11 losing pointer capture cancels Space panning without playback'.); "canvas: an armed Space-pan does not also play the graphic" (retired UI: Old stage/tlv2-timeline Space arbitration (preview-stage panning, stampTimeline/timelineState of the old timeline). New-editor equivalent: editor-usability.spec.ts 140 (Space pan never plays).); "canvas: Space follows the ACTIVE SURFACE - timeline plays even over the stage" (retired UI: Old tlv2 timeline vs old stage ownership of Space (.tlv2-labels, preview-stage panning); both surfaces deleted.); "canvas: Space only pans over the stage, and never while typing" (retired UI: Old dock Data tab input (.field-add-row) and preview-stage panning class of the retired stage.); "canvas: the cursor names the gesture in progress, not one that is merely possible" (retired UI: Old canvas-layer cursor states (canvas-layer, line-size-handle, tool-text/tool-select of the old stage toolbar).); "import graphic: a scaled design still previews, validates, and exports" (retired UI: Old design scale-handle, old simulator Play button and export dock (dock-tab-export). New-editor base scaling: editor-base-edits.spec.ts 593 'B03 base scaling preserves an animated catalog line through reload'; package checks on exports.spec.ts 892/946.); "canvas: any part can be locked from the Inspector, and the rotate handle is not a hand" (retired UI: Old Inspector lock (inspector-lock, inspector-part-label), canvas-lasso and layer-rotate-handle cursor of the retired canvas.); "canvas: Escape disarms the text tool WITHOUT throwing away the selection" (retired UI: Old stage text tool (tool-text, canvasTool, .tlv2-labels selection). New-editor tools and Escape run in editor-base-edits.spec.ts 313/547 and editor-images.spec.ts 217/301.)
- 2026-10-18 `e2e/design-rules-product.spec.ts`: 3 case(s) removed with the design-rules-product revival (its Phase 2 receipt above); receipt evidence/test-dispositions.tsv, whose line numbers are the classification's, at main `116022568`. "an untouched project serializes NO legibility key at all" (covered: scripts/design-rules.test.mjs 168 'normalizeLegibility: the DEFAULT state serializes to nothing' pins the rule that makes an untouched project carry no key; a bootstrapGraphic + loadProject check would only re-prove the plumbing.); "the editor can change the viewing target of an already-saved project" (retired UI: dock-tab-style / StylePanel.tsx, the ViewingControls host, has no mount left; ViewingControls renders only on the wizard AI step, so no live surface changes a saved project's viewing target.); "supporting text has its own size rule, reported on the readiness row and never gating" (covered: scripts/validator-registries.test.mjs 'the readiness report claims both legibility size rules on its row, as warnings that never gate', the same readinessRows/unclaimedFindings assertions on the same two findings, beside its LEGIBILITY_UNMEASURED sibling.)
- 2026-10-18 `e2e/package.spec.ts`: 1 case(s) removed with the package revival (its Phase 2 receipt above); receipt evidence/test-dispositions.tsv, whose line numbers are the classification's, at main `116022568`. "the post-creation preset picker withholds a structural preset" (retired UI: inspector-preset-select belonged to the old timeline Inspector, the only reader of swappablePresetsForTemplate's structural flag; the live pickers, the wizard's Animation step and the control page's Motion section, offer no structural swap.)
- 2026-10-18 `e2e/format.spec.ts`: 6 case(s) removed with the format revival (its Phase 2 receipt above); receipt evidence/test-dispositions.tsv, whose line numbers are the classification's, at main `116022568`. "formatHtml / formatCss / formatJs normalize messy code" (covered: scripts/format-code.test.mjs 'formatHtml / formatCss / formatJs normalize messy code', the same inputs and assertions in Node.); "formatJs refuses any file that owns an animation region" (covered: scripts/format-code.test.mjs 'formatJs refuses any file that owns an animation region', the data-block and legacy fixtures as they were.); "formatTemplate formats HTML but leaves CSS and JS alone by default" (covered: scripts/format-code.test.mjs 'formatTemplate formats HTML but leaves CSS and JS alone by default', the same three strings; formatTemplate reads nothing else of its fixture.); "minimalTextChange returns only the changed span (cursor-stable, merge-friendly)" (retired UI: minimalTextChange served only the deleted Monaco code pane, which the Phase 1 receipt names orphaned by the CodeEditor deletion.); "the Format button reformats the active tab through Monaco and the store" (retired UI: `.format-btn` of the deleted CodeEditor toolbar, opened by showCode.); "the Format button is disabled on the JS tab of a data-block template (region protected)" (retired UI: the same deleted Format button and JS tab.)
- 2026-10-18 `e2e/wave2.spec.ts`: 3 case(s) removed with the wave2 revival (its Phase 2 receipt above); receipt evidence/test-dispositions.tsv, whose line numbers are the classification's, at main `116022568`. "scoreboard: all four fields bind and a score change lands" (covered: e2e/production-controls.spec.ts 398 'a scoreboard GOAL raises the flag AND moves that side's score on the same press' moves House Score's program #f1 0 to 1 to 2 on a live press; dashboard-operator-walk.spec.ts 80 lands typed and stepped score fields on program and preview.); "corner bug: plays with the placeholder mark" (covered: e2e/catalog-baseline.spec.ts 392 'every catalog variant renders identically' settles Glass Mark on air with its placeholder mark and 'LIVE' text, fingerprinted per element.); "quiz: options bind and Next reveals the correct answer" (covered: e2e/community-packs.spec.ts 29 'the shelf lists the seeded pub quiz, and Install opens a production whose graphic takes, reveals and goes out' marks .quiz-option-2 correct on verb-next and dims the rest, the shared quiz runtime; production-controls.spec.ts 129 judges Arena Quiz.)
- 2026-10-18 `e2e/ux.spec.ts`: 4 case(s) removed with the ux revival (its Phase 2 receipt above); receipt evidence/test-dispositions.tsv, whose line numbers are the classification's, at main `116022568`. "layout: code dock left ONCE OPENED, canvas + timeline in the centre, tool tabs right" (retired UI: `.editor-host`, the dock-right tab labels and the centre stage are the deleted AppShell and WorkspaceDock geometry.); "data: add-field lands as a REAL line on a catalog template, in the assembler's own idiom" (covered: e2e/editor-base-edits.spec.ts 313 'B04 tools create real text fields, shapes, selection and bars; box reflows; undo removes the whole addition' lands a REAL field painted in the preview on a catalog template through baseEdits and addCatalogLine; the Data panel's add row is retired.); "data: the catalog-line add is gated on the standard line SHAPE, never the category" (covered: scripts/catalog-line-gate.test.mjs 'the catalog-line add is gated on the standard line SHAPE, never the category', the same five designs and verdicts.); "style: a color change highlights the changed CSS lines" (retired UI: `.editor-host .changed-line` is the deleted Monaco pane's change highlight.)
- 2026-10-18 `e2e/flows.spec.ts`: 4 case(s) removed with the third singles revival (its Phase 2 receipt above); receipt evidence/test-dispositions.tsv, whose line numbers are the classification's, at main `116022568`. "wizard: create a lower third with defaults" (covered: e2e/wizard-finish.spec.ts 239 'finish: the export door saves the graphic and opens the export window over the wizard' lands a defaults-created Hairline record; e2e/catalog-baseline.spec.ts 392 renders every catalog variant on air.); "reset: the topbar button restores the original state, undoably" (retired UI: `reset-project` left src with AppShell's topbar.); "style panel: accent retints the live preview" (retired UI: `dock-tab-style` and `style-var-accent` are the old StylePanel's; custom colours at create are package.spec.ts 43's subject.); "export: downloads a plug-and-play SPX zip" (covered: e2e/exports.spec.ts 371 'spx: the folder package plays like a host drives it, and a late update never hides it' downloads the SPX zip through the export window and plays it.)
- 2026-10-18 `e2e/images.spec.ts`: 2 case(s) removed with the images revival (its Phase 2 receipt above); receipt evidence/test-dispositions.tsv, whose line numbers are the classification's, at main `116022568`. "data panel: the add-field types are the broadcast set, and an unanswerable add is refused" (retired UI: the 'Add a field' select and `add-field-refused` exist only in the retired SampleDataPanel; the new editor adds text through its text tool, editor-base-edits.spec.ts 313, and the shape gate's pure half is scripts/catalog-line-gate.test.mjs.); "export: the zip is [project]/[project].html with images under [project]/images/" (covered: e2e/editor-images.spec.ts 357 'saved image and its binding reopen and execute in SPX, CasparCG and OGraf' downloads the SPX zip with the image under images/ as a real binary.)
- 2026-10-18 `e2e/asset-workflow.spec.ts`: 6 case(s) removed with the assets group revival (its Phase 2 receipt above); receipt evidence/test-dispositions.tsv, whose line numbers are the classification's, at main `116022568`. "drop a logo, make it the NEXT STEP from the canvas chip — connected everywhere, fully undoable" (retired UI: the old canvas chip `canvas-appears`, the timeline surface toggle and the old timeline rows; the drop-adds-one-layer half runs in editor-images.spec.ts 127 and the new editor's step model in editor-steps.spec.ts 352.); "an image kept visible from the beginning stays out of every reveal list, and its row exists" (retired UI: `canvas-appears` and the old timeline's `.timeline-label[data-part]`, which nothing live renders.); "drop into an EXISTING step, then retarget participation afterwards from the Inspector" (retired UI: `inspector-appears` of the old timeline Inspector and the old canvas chip.); "the Inspector names the preset targets and writes an early exit (Disappears)" (retired UI: `inspector-preset-target` and `inspector-disappears` of the old timeline Inspector.); "a preset Delay shifts the written keyframes and grows the step — no keyframe editing needed" (retired UI: the old Inspector's preset select, duration and delay rows; no live surface applies a per-layer preset delay.); "video assets: capped import, VIDEO badge, and a muted looping <video> on drop" (retired UI: the <video> insert is the retired canvas's assetOps.insertVideoElement with no live caller; the import cap is covered by editor-images.spec.ts 250 'file validation guards refuse invalid resource batches'.)
- 2026-10-18 `e2e/assets.spec.ts`: 7 case(s) removed with the assets group revival (its Phase 2 receipt above); receipt evidence/test-dispositions.tsv, whose line numbers are the classification's, at main `116022568`. "import via the Assets tab: rows appear grouped, and a multi-file import is ONE undo step" (covered: e2e/editor-images.spec.ts 27 'Image opens Assets; atomic import, byte deduplication, collisions, rename and safe delete each undo' imports a multi-file batch through assets-import-input in the new editor and one Undo restores the whole source.); "remove is undoable; a Lottie file imports with its badge; junk JSON is rejected" (covered: editor-images.spec.ts 27 removes an unused asset and Undo restores the source, 280 'SVG, font and Lottie resource import stays separate from placement' accepts a Lottie, 250 refuses bad.json.); "moving an asset into a new folder nests its path; undo restores it" (covered: e2e/editor-folders-bins.spec.ts 90 'bins persist empty, rename and move references in one exact undo' and 142 'asset moves preserve folder labels and retain emptied inferred bins in one history receipt'.); "dragging an asset onto the canvas inserts a positioned <img> as one undo step" (covered: editor-images.spec.ts 127 'OS drop and chooser produce the same source; asset drag and a drop over an image always add layers' adds a positioned layer on an asset drop and undo removes it.); "dropping a Lottie asset on the canvas inserts a playing animation element" (retired UI: the canvas Lottie drop is the retired CanvasInteraction's lottieInsert, its only caller; the Lottie import itself runs in editor-images.spec.ts 280.); "a saved v2 layout gains the Assets tab once (v2 -> v3 migration)" (retired UI: the v2 to v3 layout migration and the dock-right tab labels are the deleted WorkspaceDock's record.); "mobile: the Assets tab is in the side-panel strip" (retired UI: `.panel-tabs .tab` is the old SidePanel's mobile strip, deleted 2026-10-17.)
- 2026-10-18 `e2e/project-format.spec.ts`: 1 case(s) removed with the seventh singles revival (its Phase 2 receipt above); receipt evidence/test-dispositions.tsv, whose line numbers are the classification's, at main `116022568`. "blank artwork requires an authored format before creation" (retired UI: the Blank entry card is gone (EntryStep.tsx says there is no Blank card, and no data-entry=blank or blank-step exists in src); no-old-editor.spec.ts pins its absence, and the import half runs in the same file's import case.)
- 2026-10-18 `e2e/ai-consent.spec.ts`: 1 case(s) removed with the retired and covered removals (its Phase 2 receipt above); receipt evidence/test-dispositions.tsv, whose line numbers are the classification's, at main `116022568`. "the offline stub generates without ever showing the notice" (retired UI: the old editor's AI panel (dock-tab-ai, 'AI assistant', Generate) is the unmounted AIPromptPanel; the AI step disables Create without a key (ai.spec.ts 1081) and the notice-free Create with AI runs in the same file's first case.)
- 2026-10-18 `e2e/ai-panel.spec.ts`: 3 case(s) removed with the retired and covered removals (its Phase 2 receipt above), and the file deleted with them; receipt evidence/test-dispositions.tsv, whose line numbers are the classification's, at main `116022568`. "a bench-failing modify burns real repair rounds and the card reports the failure" (retired UI: the old AI panel's Modify and `.change-preview` Apply are the unmounted AIPromptPanel; the live repair rounds run in ai.spec.ts 1014 'invalid first answer triggers the automatic repair round' and 645, and bench.spec.ts 364.); "a clean modify passes the injected gate and applies" (retired UI: the same panel applying into the old preview frame; ai.spec.ts 1028 'refine sends the current code back through modify' and 475 run one clean emit with no repair round.); "with no AI configured, \"add a lower third\" adds one rather than crashing the offline stub" (retired UI: stubProvider.modify was reachable only through the old AI panel; the AI step's Create is disabled without a key (ai.spec.ts 1081) and ProposalPanel disables Propose when unconfigured.)
- 2026-10-18 `e2e/control.spec.ts`: 3 case(s) removed with the retired and covered removals (its Phase 2 receipt above); receipt evidence/test-dispositions.tsv, whose line numbers are the classification's, at main `116022568`. "control tab live-drives the preview from a field control" (covered: e2e/library.spec.ts 211 'a saved graphic's control panel: entries create, play with the active entry, persist' fills an entry field and plays it into the control page preview; production-data.spec.ts 24 lands cue values on the Cue preview.); "a number field becomes a +/- stepper (no per-template code)" (covered: e2e/import-svg-behaviour.spec.ts 141 'imported scoreboard: a numeric layer is a ± stepper that acts on air, and survives a reload', and production-controls.spec.ts 987 pins the .ctl-num steppers in the cue editor.); "the Control tab renders labeled event buttons from the machine and fires them" (covered: e2e/control-panel-types.spec.ts 175 'the control page drives a quiz-board by its own machine' and 252 'event buttons carry the sections the type declared'; production-controls.spec.ts 129 fires select into the machine.)
- 2026-10-18 `e2e/configured/anonymous.spec.ts`: 1 case removed: "the topbar says which account state it is in, not only what it offers" measured the retired editor bar; the current wizard and Home account-state words run in anonymous.spec.ts and shared-lab-computer.spec.ts. The account-feature explanation and Escape journey is retained as a live gap because its named replacements were partial.
- 2026-10-18 `e2e/template-insert.spec.ts`: 2 case(s) removed with the retired and covered removals (its Phase 2 receipt above); receipt evidence/test-dispositions.tsv, whose line numbers are the classification's, at main `116022568`. "after an insertion the Data panel still adds a REAL line to the HOST design" (retired UI: the old editor's Data panel '+ Add'; no dock-tab-* test id is left in src.); "the canvas context menu opens the same insert flow" (retired UI: canvas-context-menu and canvas-ctx-insert-template were the old canvas's.)
- 2026-10-18 `e2e/counting-settle.spec.ts`: 1 case(s) removed with the counting-settle revival (its Phase 2 receipt above); receipt evidence/test-dispositions.tsv, whose line numbers are the classification's, at main `116022568`. "every counting design settles on its real figure (canvas)" (retired UI: the canvas recipe composed with the old editor's simulator channel (composeDocument with simulate), which no live surface composes with; the shared settle recipe, what every card and thumbnail composes with, keeps the sweep as "every counting design settles on its real figure". The recipe loop was one declaration, so the declaration count is unchanged; this is the runtime case that went.)

## Budget exceptions

The runtime-harness revival (Phase 2, #800) turns 73 live-gap cases in eight files back on. They
skipped since the old editor went, so the duration table weighs each file at a few seconds; the
minutes below are this change's local measurement (case-minutes, two workers, `j-0011`), recorded so the
capacity gate can see the delta it will measure on the pull request's own run. The weekly
refresh records the real figures and these lines expire.

- e2e/sports.spec.ts: 1.1 min, protects the match clock, score and state machines of the sports pack at runtime, expires 2026-11-16
- e2e/public-service.spec.ts: 1.1 min, protects the ticker, alert and public-information runtimes and the kicker's control path, expires 2026-11-16
- e2e/anim-engine.spec.ts: 0.6 min, protects data-block parity with the legacy emits, measured motion and the serializer, expires 2026-11-16
- e2e/competition-pack.spec.ts: 1.1 min, protects the match-up, scorebug, veto, verdict, nominee and board machines at runtime, expires 2026-11-16
- e2e/audience-pack.spec.ts: 0.5 min, protects the message clamp, queue, vote board, chat highlight and pack round trips, expires 2026-11-16
- e2e/graphic-types.spec.ts: 0.6 min, protects promotion identity, the quiz walk, ticker pause and the countdown clock, expires 2026-11-16
- e2e/state-machine.spec.ts: 0.3 min, protects the machine schema, the derived machine and the export-surface walk, expires 2026-11-16
- e2e/machine-edit.spec.ts: 0.1 min, protects step edits under a machine and the off-shape export gate, expires 2026-11-16

The import family revival (Phase 2, #800) turns 54 live-gap cases in nine files back on and
removes 47 cases from three of them. The table weighs these files from their earlier runs,
with the removed cases' minutes still in it and the revived cases' not; the minutes below are
this change's local measurement (case-minutes, two workers, queue jobs `j-0016` to `j-0021`),
so the gate can read the delta where a runner measures a file above its table weight.

- e2e/import-canvas.spec.ts: 0.4 min, protects the erase seed's placement and size from the measured ink, expires 2026-11-16
- e2e/import-graphic.spec.ts: 1.0 min, protects the imported design's placement, animation, field slot and export, expires 2026-11-16
- e2e/import-prepare.spec.ts: 0.5 min, protects the erase step's created asset and seeded field, expires 2026-11-16
- e2e/import-svg-behaviour.spec.ts: 3.6 min, protects the imported boards' behaviour through the CasparCG package and its standalone panel, expires 2026-11-16
- e2e/import-svg.spec.ts: 3.4 min, protects the SVG import walk from the drop to the created template: mapping, binding, fit, growth, drawn fields and followers, expires 2026-11-16
- e2e/import-stretch.spec.ts: 0.4 min, protects the 9-slice stretch runtime and the fixed default on an imported design, expires 2026-11-16
- e2e/import-svg-corpus.spec.ts: 3.8 min, protects picture fields swapped at runtime on the corpus boards, expires 2026-11-16
- e2e/import.spec.ts: 0.3 min, protects the .html and zip import doors and the export round trip, expires 2026-11-16
- e2e/import-svg-sticker-sample.spec.ts: 0.1 min, protects the documented sticker sample: its faces, fields and panel growth, expires 2026-11-16

The production-data revival (Phase 2, #800) turns nine live-gap cases in one file back on and
removes none; the table weighs the file at 1.8 minutes from its earlier runs. The minute below is
this change's local measurement (case-minutes, two workers, queue job `j-0030`).

- e2e/production-data.spec.ts: 2.4 min, protects the Data workspace tables, the live tree and its cue bindings, the shared-value steppers and Bind all by title, expires 2026-11-16

The design-rules-product revival (Phase 2, #800) turns seven live-gap cases in one file back on
and removes three; the table weighs the file at 0.02 minutes from its all-skipped runs. The minute
below is this change's local measurement (case-minutes, two workers, queue job `j-0034`).

- e2e/design-rules-product.spec.ts: 0.5 min, protects the viewing and floors controls reaching the request and the working document, and the legibility warnings in the export window, expires 2026-11-16

The holding-pack revival (Phase 2, #800) turns nine live-gap cases in one file back on and
removes none; the table weighs the file at 0.1 minutes from its earlier runs. The minute below is
this change's local measurement (case-minutes, two workers, queue job `j-0035`).

- e2e/holding-pack.spec.ts: 0.8 min, protects the holding set's wizard discovery and editor door, the wall-clock countdown, the credit reel's loop and the static board at runtime, expires 2026-11-16

The end-credits revival (Phase 2, #800) turns ten cases in one file back on and removes none;
the table weighs the file at 0.01 minutes from its earlier runs. The minute below is this
change's local measurement (case-minutes, two workers, queue job `j-0039`).

- e2e/end-credits.spec.ts: 0.7 min, protects the one-field credit roll in the DOM, the Fields step's paste box, the logo default, the emphasis choice and the settle and travel of every credits design, expires 2026-11-16

The package revival (Phase 2, #800) turns seven cases in one file back on and removes one (the
saved-brand case came back after review); the table weighs the file at 0.01 minutes from its
earlier runs. The minute below is this change's local measurement (case-minutes, two workers,
queue job `j-0043`, re-measured as `j-0067`).

- e2e/package.spec.ts: 0.6 min, protects the custom hex and imported font reaching the package and its export bundle, the saved brand carried to another variant, the info card, the credits field and the ticker's marquee and timed hold at runtime, expires 2026-11-16

The image-purpose revival (Phase 2, #800) turns five cases in one file back on; the table weighs
the file at 0.075 minutes from its earlier runs. The minute below is this change's local
measurement (case-minutes, two workers, queue job `j-0044`).

- e2e/image-purpose.spec.ts: 0.5 min, protects the purpose preselect, the as-is binding choice, each purpose's instruction in the request, the reference kept out of the package and the as-is guard, expires 2026-11-16

The house revival (Phase 2, #800) turns four cases in one file back on; the table weighs the
file at 0.006 minutes from its earlier runs. The minute below is this change's local
measurement (case-minutes, two workers, queue job `j-0046`).

- e2e/house.spec.ts: 0.3 min, protects the house family's runtime: the strap's mono label voice, the ticking clock bug, the sign-coloured market deltas and the chip-over-headline stack, expires 2026-11-16

The shows revival (Phase 2, #800) turns five cases in one file back on (the Home production card
case came back after review); the table weighs the file at 0.47 minutes from its earlier runs.
The minute below is this change's local measurement (case-minutes, two workers, queue job
`j-0047`, re-measured as `j-0067`).

- e2e/shows.spec.ts: 0.5 min, protects the aggregated production panel driving each graphic alone, the offline answer of the hosted control route, the retyped layer stack and the two-step delete, and the live library graphic in a rundown export, and the Home production card's counts, export and door, expires 2026-11-16

The format revival (Phase 2, #800) keeps one journey in the file and moves three cases to Node;
the table weighs the file at 0.01 minutes from its earlier runs. The minute below is this
change's local measurement (case-minutes, two workers, queue job `j-0048`).

- e2e/format.spec.ts: 0.1 min, protects format-on-create: a wizard-created project starting from a Prettier-formatted HTML baseline with its fields intact, expires 2026-11-16

The production-chat-intake revival (Phase 2, #800) turns three cases in one file back on; the
table weighs the file at 0.203 minutes from its earlier runs. The minute below is this
change's local measurement (case-minutes, two workers, queue job `j-0049`).

- e2e/production-chat-intake.spec.ts: 0.6 min, protects a chat line reaching air through inbox, edit, approve, cue and Take, the visible throttle and dedupe refusals, and pause, resume and remove on a chat source, expires 2026-11-16

The wave2 revival (Phase 2, #800) turns three cases in one file back on and removes three; the
table weighs the file at 0.009 minutes from its earlier runs. The minute below is this
change's local measurement (case-minutes, two workers, queue job `j-0051`).

- e2e/wave2.spec.ts: 0.3 min, protects the starting-soon countdown, the game timer's clock and the infographic count-up at runtime, expires 2026-11-16

The ux revival (Phase 2, #800) turns two cases in one file back on, moves one to Node and
removes three; the table weighs the file at 0.009 minutes from its earlier runs. The minute
below is this change's local measurement (case-minutes, two workers, queue job `j-0052`).

- e2e/ux.spec.ts: 0.2 min, protects export validation gating the download on a broken template and the wizard's direction control mixing a different exit preset at create, expires 2026-11-16

The counting-settle revival (Phase 2, #800) turns three sweeps in one file back on and drops the
settle sweep's canvas run; the table
weighs the file at 0.007 minutes from its earlier runs. The minute below is this change's
local measurement (case-minutes, two workers, queue job `j-0053`).

- e2e/counting-settle.spec.ts: 3.1 min, protects every counting design settling on its real figure, playing its figure up from zero on both seeds and never painting its old figure on a re-take, expires 2026-11-16

The ai-more-control revival (Phase 2, #800) turns three cases in one file back on; the table
weighs the file at 0.006 minutes from its earlier runs. The minute below is this change's
local measurement (case-minutes, two workers, queue job `j-0054`).

- e2e/ai-more-control.spec.ts: 0.3 min, protects the structured setup reaching the design request and the created project, the setup draft surviving a collapse and a close, and the prompt-only default, expires 2026-11-16

The adapt-first revival (Phase 2, #800) turns three cases in one file back on; the table weighs
the file at 0.005 minutes from its earlier runs. The minute below is this change's local
measurement (case-minutes, two workers, queue job `j-0055`).

- e2e/adapt-first.spec.ts: 0.4 min, protects the retrieval shortlist reaching the design stage, the kept zone and the named proven design, the free rebuild on another shortlisted design and the untouched create route, expires 2026-11-16

The first singles revival (Phase 2, #800) turns one case back on in each of three files. The
minutes below are this change's local measurement (case-minutes, two workers, queue job
`j-0056`).

- e2e/mark-legibility.spec.ts: 0.3 min, protects the wizard's mark-legibility notice raised and cleared on the Style step, expires 2026-11-16
- e2e/production-controls.spec.ts: 1.8 min, protects the live-number bump airing without publishing other staged edits, expires 2026-11-16
- e2e/productions.spec.ts: 1.1 min, protects the published and unpublished production readings and the withheld rehearsal, expires 2026-11-16

The second singles revival (Phase 2, #800) turns four cases back on across three files. The
minutes below are this change's local measurement (case-minutes, two workers, queue job
`j-0057`).

- e2e/exports.spec.ts: 1.0 min, protects the HTML overlay baking the typed value and playing itself on load with its control panel bundled, expires 2026-11-16
- e2e/template-pack-4.spec.ts: 0.3 min, protects the notice's level events on the generated control page and a pack graphic surviving save, reload and reopen, expires 2026-11-16
- e2e/template-pack-10.spec.ts: 0.2 min, protects the commerce card's discover, edit, save and reload round trip, expires 2026-11-16

The third singles revival (Phase 2, #800) turns five cases back on across two files and removes
four. The minutes below are this change's local measurement (case-minutes, two workers, queue
job `j-0058`).

- e2e/flows.spec.ts: 0.2 min, protects a Fields-step title reaching the created field, steps mode holding a line until next(), and an uploaded picture landing in the logo slot, expires 2026-11-16
- e2e/wizard-filters.spec.ts: 1.4 min, protects Browse's facets, paging and the brand chooser's re-rank, expires 2026-11-16

The fourth singles revival (Phase 2, #800) turns one case back on in each of three files. The
minutes below are this change's local measurement (case-minutes, two workers, queue job
`j-0059`).

- e2e/inspector.spec.ts: 0.1 min, protects the store's redo branch being cut by a new edit, and the filter track's shape at runtime, expires 2026-11-16
- e2e/pasteboard.spec.ts: 0.1 min, protects the composer's default document clipping to the canvas with no pad in persisted state, expires 2026-11-16
- e2e/legacy-timeline.spec.ts: 0.1 min, protects a legacy-region template rendering settled on the shared settle recipe, expires 2026-11-16

The images revival (Phase 2, #800) turns three cases in one file back on and removes two; the
table weighs the file at 0.007 minutes from its earlier runs. The minute below is this
change's local measurement (case-minutes, two workers, queue job `j-0060`).

- e2e/images.spec.ts: 0.2 min, protects a logo field reaching the credits end block and the corner bug at runtime, and the import door shrinking an oversized picture without growing a small one, expires 2026-11-16

The assets group revival (Phase 2, #800) turns one case back on in each of three files and
removes thirteen, all in assets and asset-workflow. The minutes below are this change's local measurement (case-minutes, two
workers, queue job `j-0062`).

- e2e/assets.spec.ts: 0.1 min, protects the Assets panel's derived info section in the new editor, expires 2026-11-16
- e2e/asset-workflow.spec.ts: 0.1 min, protects the Assets panel's usage marks and a second placement being a new element, expires 2026-11-16
- e2e/wysiwyg.spec.ts: 0.1 min, protects the Style step's zone pick re-anchoring the created graphic's root rule, expires 2026-11-16

The seventh singles revival (Phase 2, #800) turns seven cases back on across five files and
removes one. The minutes below are this change's local measurement (case-minutes, two workers,
queue job `j-0063`).

- e2e/production-audience.spec.ts: 0.7 min, protects the audience workflow and the vote reaching air, expires 2026-11-16
- e2e/google-fonts.spec.ts: 0.1 min, protects a Google typeface embedded in the created graphic with nothing reaching Google at play time, expires 2026-11-16
- e2e/render.spec.ts: 0.9 min, protects the render section measured off the saved record in the standalone export window, expires 2026-11-16
- e2e/video-project.spec.ts: 0.7 min, protects the video shell's reload, explicit save and reopen, expires 2026-11-16
- e2e/project-format.spec.ts: 0.6 min, protects the explicit render scaling and a restored unsupported format still opening, expires 2026-11-16

The eighth singles revival (Phase 2, #800) restores four cases across three files and removes
no file. The earlier measurements below cover machine-graph and timeline-v2 only (case-minutes,
two workers, queue job `j-0065`); the final three-file wall time is recorded in its receipt.

- e2e/machine-graph.spec.ts: 0.3 min, protects styled transitions playing and landing on their pose, the lifecycle arrows' styles and guards, and the region re-emits under older interpreters, expires 2026-11-16
- e2e/timeline-v2.spec.ts: 0.1 min, protects a scoreboard's data block and the score pop around the region at runtime, expires 2026-11-16

## Acceptance criteria

- AC1: A pinned, reproducible inventory covers every source file, E2E spec, Node test file,
  script, doc and asset in the stated scopes; static inference and runtime measurements differ.
- AC2: Every proposed whole old-editor source deletion has no current entry-point consumer,
  including dynamic/SSR/string registry checks; shared modules have a named retained consumer.
- AC3: Every discovered old-helper declaration has a title, line range and skip chain. Before
  removal, its subject disposition and exact per-spec maintenance entry are reviewed; #800
  ends with current protection or demonstrated duplicate coverage, not unresolved skips.
- AC4: Saved-data keys/shapes/readers are mapped; no stored format is dropped without its own
  owner decision, and deletion implementation must run real compatibility cases.
- AC5: Each phase states order, affected boundaries, required checks and conflict handling;
  the code-health handoff names obsolete work without cancelling current work.
- AC6: Size arithmetic does not double-count moves/deletions; spec-minute savings distinguish
  whole-file measurement, unknown mixed savings, relocated cost and unmeasured build savings.
- AC7: Later candidates have delete/consolidate/move/keep decisions and evidence requirements;
  active gates and real product behaviors are not weakened.
- AC8: This research changes only this report directory, passes targeted documentation/evidence
  checks and requests the first owner decision before any implementation.

## Owner decisions still needed

The narrower #800 policy and complete admin-page retirement are accepted. The admin decision
landed separately in #1396; the weekly report is enabled and the live aggregate
query was checked read-only. No further admin product decision is required. The first scheduled
report has not yet run; its first delivery is scheduled for Tuesday 2026-10-20 in the morning.

Before deleting support for the old dock-layout format, ask that separate stored-data question.
Do not ask about retiring AI experiments during the active harness work; they are outside this
phase. The first seven-file source PR needs no further technical discovery from the owner.
Approval of that PR's scope and an execution window remain distinct from this research update.
