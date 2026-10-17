# Make the codebase lean, starting with the retired editor

Status: **revised after independent review; no deletion or plan run started**.
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
size and timing. This report supplies the inventory and order, not implementation permission.

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
   follow-up. No issue comment or change has been sent from this research task.
2. Saved graphics and projects keep loading. Retain live readers/migrations and ask before
   dropping any stored format. The separate old dock-layout record is an explicit pending question.
3. Keep the live video workspace, CLI/Bridge, exports, public output, audience, account and
   admin surfaces. They are reachable dependencies or existing product surfaces; the short
   product description is not permission to retire them.
4. A disappearance from an import graph is evidence to investigate. Bench tools, SSR loaders,
   ambient types, string registries and fixtures are checked before a dead-code verdict.
5. All deletion PRs use `/check`, `/queue-merge` and full GitHub CI. No skip, weakened assertion,
   smaller validation set, raised limit or budget exception substitutes for a reviewed removal.
6. Finish the approved deletions before the codebase-health documentation run and any source
   cleanup on the same files. Disjoint E2E infrastructure research may continue.
7. Keep the system-notice reader and bar pending the separate admin decision. Their only mount
   is retired, but the live admin page still publishes notices. Do not build a new mount during
   shell deletion. Keep machineEdit, lottieInsert and the animation runtime with their current
   tests; moving a working helper just to reduce the app directory is not required cleanup.
8. The admin page is under review at the owner's request. No admin deletion, database change,
   routine creation or purchase is authorized. See [admin assessment](evidence/admin-audit.md).

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

## Phase 1: remove the old editor and resolve #800

The [review reconciliation](evidence/second-opinion-response.md) explains corrections to both
reports. The [manifest](evidence/removal-manifest.json) distinguishes the seven-file first PR,
remaining source candidates, retained helpers and tests requiring subject review.

| Scope | Current evidence | Decision |
|---|---|---|
| First source PR | AppShell, WorkspaceDock, CodeEditor, SidePanel and the three teach files: 7 files, 1,230 lines | Ready to propose; no test-body deletion, shared state or CSS edit |
| Remaining whole-source candidates | 20 further files, 9,530 lines; total 27 files / 10,760 lines | Delete in small dependent groups after last live consumer is checked on fresh main |
| System notices | 2 files, 115 lines | Excluded from deletion pending the admin decision |
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

The narrower #800 policy is accepted. The owner does not use the current admin page and wants
its weight measured before deciding its future; cleanliness takes priority over speculative
retention. No deletion or plan-run window has been authorized in this update.

The next product question is which admin actions need an accessible control. Recommend a
periodic report for spending, failures, feedback and actual external usage; keep only a small
emergency/support surface if the owner needs one. The exact choice follows the
[admin assessment](evidence/admin-audit.md), not a blanket promise to preserve ten sections.
A reporting routine reports; it does not silently change access, budgets or model policy.

Before deleting support for the old dock-layout format, ask that separate stored-data question.
Do not ask about retiring AI experiments during the active harness work; they are outside this
phase. The first seven-file source PR needs no further technical discovery from the owner.
Approval of that PR's scope and an execution window remain distinct from this research update.
