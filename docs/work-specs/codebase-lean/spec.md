# Make the codebase lean, starting with the retired editor

Status: **research complete; removal plan awaiting owner approval**. Prepared 2026-10-17
against `3010e41134f1e3a6ebf3933582eb9b7e52055241`. No deletion phase has started.

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
- No replacement of skipped old-editor tests on another surface. New-editor needs get their
  own tests when that behavior is implemented, as the owner decided.
- No source refactor before retirement; no new size limits, exemptions or scheduler.

## Decisions and authority

1. The owner's 2026-10-17 request retires the old editor completely, including its skipped tests.
   It supersedes [issue #800](https://github.com/NoaCG/NoaCG-Studio/issues/800), which was still
   open with the opposite wording when read. Update that issue only when explicitly authorized
   to communicate there; this report records the overriding decision.
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

## Phase 1: remove the old editor

The [ownership and compatibility audit](evidence/audit.md) is the detailed plan.
[The manifest](evidence/removal-manifest.json) names exact full files, partial files and totals.

| Change | Proven footprint | Credited time saving |
|---|---:|---:|
| AppShell-only source plus unused Learn reference | 29 files; 10,875 TS/TSX lines; two further files (395 lines) need live-fixture replacements | Build saving unknown; already absent from the current app import path |
| Entire retired test files | 36 files; 10,715 lines | 0.497 offline spec-minutes per full run |
| Retired declarations inside mixed specs | 41 files; 8,654 declaration lines | Unknown; the active remainder must stay |
| Shared store, route names, dock preferences and CSS | 81 store fields/actions inventoried; 12 CSS files reviewed as candidates | No speculative line/time credit |
| Four old timeline/WYSIWYG stubs and four archived plans | 8 files; 1,280 Markdown lines before any retained schema text is moved | No CI job removed |

The 474 old-helper declarations are deleted, not ported. All unlisted assertions remain.
`e2e/no-old-editor.spec.ts` remains a current routing/compatibility suite; selectively replace
its vacuous module-request assertion after AppShell disappears. Its name is not a reason to
delete wizard exits, saved-link routing, boot recovery or preference migration protection.

Keep the shared template store, library/project readers, old embedded-packet migration,
animation formats, runtime upgrades, export gates and new-editor session/command code.
Keep Monaco because the current video workspace imports it. Keep registered templates and
the common render/control engines. The saved-data table in the audit lists every relevant
key, shape, reader and required behavior.

### Order of small pull requests

Approval of this plan authorizes Phase 1 only; it does not approve later candidates or data loss.
Each row may split by one surface/test family if the diff is hard to review. Delete files and
their exclusively related tests/docs in the same PR; partial shared files get their own named
retired behavior and retained checks. Re-pin and re-inventory before each row.

| Order | One coherent change | Verification and dependencies |
|---|---|---|
| 1A | Remove AppShell, CodeEditor, SidePanel, WorkspaceDock, SystemNoticeBar/backend notice client and teaching code; remove the “retain the old source” decision and obsolete shell documentation | No current import reaches them; update the no-old-editor module assertion with its own maintenance entry; retain all navigation cases |
| 1B | Remove PreviewFrame/ProjectFormatMeta, old canvas components and their fully retired canvas/selection/text/keyboard test families; keep partLocks until 1C | Keep CanvasGuides and new-editor geometry tests; retire matching canvas instructions and selectors only |
| 1C | Remove old timeline/Inspector/MachineGraph, partLocks, layerTimeline/stepAssign and fully retired tests; preserve the two active fixture builders pending replacements | Keep animation parsing/playback/export and new-editor timeline protection; update old planner examples and schema references |
| 1D | Remove remaining old panels, simulator and moderation UI; delete the remaining entirely retired files by family | Keep current AssetsPanel, InsertTemplateDialog, ExportSurface, FieldControl and production chat; delete SpxFieldRow only with its old panels; retain the live remainder in mixed specs |
| 1E | Remove skipped declarations from mixed wizard/import files, then mixed library/playout/video/configured files as separate PRs | Exact titles/lines in retired-test-cases; 77 per-spec draft entries; no current behavior rewrite or shortened assertion |
| 1F | Remove dead state and stale calls in shared modules; rename the router fallback without changing URL behavior | Saved slot/library load, dirty state, save/reopen, wizard exit, auth hash and stale graphic link checks; stop before dropping dock-format support without its answer |
| 1G | Close remaining helpers, CSS regions, contract clauses and document links exposed by those removals | Delete `_create`'s old wrappers only when no callers remain; replace lottieInsert/machineEdit fixture construction without weakening live OGraf/animation assertions before removing those source files; preserve live helper bodies; compiler, dependency graph, contract and protection gates must still hold |

The later rows are cleanup of still-shared files, not a reason to leave whole dead feature files
or their tests behind in 1A–1D. Remove the retired plan documents as their owning surfaces go;
repair all live links in that PR. No new editor implementation runs concurrently on shared paths.

Before every PR: `node scripts/worktree-activity.mjs`, fetch/reconcile main, inspect remote PR
and plan allocations, run rules for actual changed paths, and reserve one writer for App/store/
shared CSS/ARCHITECTURE/contracts. `/check` verifies affected checks locally within cloud bounds;
the full build and suites run on GitHub through `/queue-merge`. Capture the exact landed SHA,
remaining file counts and fresh duration-table/run receipt. Keep recovered minutes as headroom.

## Remaining candidates, ranked by saving and confidence

Confidence is evidence quality, not a numerical probability. Within the approved old-editor
phase the largest proved deletions go first. Beyond it, prioritize a large measurable saving
with strong evidence over a large folder with uncertain purpose. Times below are current
whole-spec costs or explicitly historical estimates; they are not promised net savings.

| Rank | Action | Candidate and current footprint | Confidence, proof needed and saving |
|---|---|---|---|
| 1 | delete | Old tests and source above: 30,244 named source/test lines | High; retired surface + import/helper graph. 0.497 min credited; mixed-case saving unknown |
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

These are explicit scenarios for the original pinned contents, not a promised target or a cap.
Partial edits can remove more; fixture replacements, moved retained schema text and new regression checks can add lines. The two test-fixture builders (395 lines) receive no deletion credit until replacements exist.
`forecast.json` records the arithmetic and the report's separate footprint.

| Area | Baseline | After named Phase 1 cuts | Further conditional change |
|---|---:|---:|---|
| src TS/TSX | 303,553 | 292,678 | 282,112 only if all 35 research-only AI modules are retired; moving blank fixture reduces src another 104 but adds it to tests |
| e2e TS/TSX | 116,035 | 96,666 | Exact retained/new test bodies and moved cases determine further size; not forecast as a percentage |
| scripts implementation | 106,976 | 106,976 before partial planner edits | 106,783 after the three approved-later probe deletions; Node moves add replacement code |
| scripts tests | 55,586 | 55,586 before partial selection-example edits | No whole Node test deletion established |
| docs Markdown | 129,125 | 127,845 before this report/retained text | Add the measured report Markdown and any schema text kept; no blanket archive purge |

Offline frequent-suite budget after the known whole-file retirements: **182.755 minutes**,
plus an unmeasured reduction from mixed skipped cases. After the two pure Node moves it would
be **181.840 browser-minutes**, before their Node cost. Creative-pilot contributes at most
another 2.061 once, if retired or successfully moved. Qualification relocation has a separate
12.979-minute ceiling; it does not remove scheduled/full-validation cost and depends on the
other study's validated selection/cadence design.

**Whole CI jobs saved: zero proved. Build seconds saved: unknown.** Existing JS tree-shaking
already excludes AppShell. Removing CSS/dead checking inputs may help, but only the same CI
job/step on before-and-after commits, with cache and setup noted, can measure it. The current
157-second build step is a baseline, not an amount that can be claimed back.

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
retired behavior or replacement/fault evidence. The [drafts](evidence/test-maintenance-draft.md)
are deliberately not active blanket gate approvals. Do not add a rule demanding more
process for every unrelated change; use the existing feature-removal/review path.

## Acceptance criteria

- AC1: A pinned, reproducible inventory covers every source file, E2E spec, Node test file,
  script, doc and asset in the stated scopes; static inference and runtime measurements differ.
- AC2: Every proposed whole old-editor source deletion has no current entry-point consumer,
  including dynamic/SSR/string registry checks; shared modules have a named retained consumer.
- AC3: Every retired test declaration has a title, line range, skip-helper chain and per-spec
  draft maintenance entry. Current tests in mixed specs remain explicitly protected.
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

## Owner questions, asked one at a time

1. Approve the Phase 1 old-editor plan while retaining all saved graphics/project compatibility
   and the live video workspace? **Recommend yes.** No later retirement is included.
2. May the unused `spx-gfx-layout` old dock-format reader/writer be retired after preserving
   video's clamp helper, leaving stored bytes untouched? **Recommend yes.** Until answered,
   retain that compatibility code; never clear the record as cleanup.
3. Are Creative pilot, Pro custom/harness and spike lanes still promised work, or finished
   experiments that may be retired with their tools/tests? **Recommend retire only finished
   lanes, keep the live wizard AI and shared validators.** Take one named lane at a time.

These are pending decisions, not approvals inferred from elapsed time. Low-value public asset
retirement can wait; it does not block the editor work. Validation results and remaining
measurement limits are recorded in [evidence/verification.md](evidence/verification.md).
