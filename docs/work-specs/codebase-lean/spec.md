# Make the codebase lean, starting with the retired editor

Status: **approved and running. The seven-file old-shell deletion landed in PR #1410; the
timeline, canvas and preview group is this branch; admin retirement merged and deployed in
PR #1396. The CI capacity follow-up (#1405) closed with PR #1409.**
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
competition-pack, audience-pack, graphic-types, state-machine, machine-edit) lose the retired
advanced-mode call from their boot helper, so 73 live-gap cases run again, 87 cases in all
across the eight files, 5.2 minutes locally on two workers (queue job `j-0010`, every case
passing, none skipped). Three cases needed more than the boot swap: the kicker-on-air case
drives the production page's cue editor and Update and reads PROGRAM, the competition pack's
discoverability case plays the created graphic in the harness iframe, and the measured-motion
case keeps its runtime half without the old step timeline's row. One case went: the simulator
snap case duplicated production-controls.spec.ts's live control page check (its entry under Test
maintenance). The machine-edit header names `src/blocks/**`. The duration table still weighs the
eight files at seconds, so their minutes stand as budget exceptions until the weekly refresh
records them. Still skipping: the other 158 live-gap cases, whose bootstraps create a graphic
through the retired wizard door; they are the next revival groups.

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
4. **Schedule mixed editor specs after the editor phase releases them.** library, project and
   wizard-finish contain the eight legacy skips carried in the repair receipts. Leave those
   files and the carried challenges untouched until editor Phase 2 closes or its owner
   explicitly hands over the paths. Record the changed baseline in the editor phase note.
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

## Budget exceptions

The runtime-harness revival (Phase 2, #800) turns 73 live-gap cases in eight files back on. They
skipped since the old editor went, so the duration table weighs each file at a few seconds; the
minutes below are this change's local measurement (two workers, `j-0010`), recorded so the
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
