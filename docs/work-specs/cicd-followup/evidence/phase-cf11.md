# Phase cf11: the three selection misses and the reader rule for shared core files

Row cf11 of the [cicd-followup spec](../spec.md) (#1900, #1942, #1944, #1921). Built 2026-11-04 by
the cf11 builder (Claude Code Cloud worker of plan run #1967) from `main` at
`4276b4bfacdfa80b185932ff94f6ce7e43ec0b1d` (#2122).

Acceptance, verbatim:

- (a) "Each of the three misses is reproduced and explained."
- (b) "The dependency-aware rule for shared core files (#1921) and the missing `covers` metadata
  are applied, with regression checks showing the affected tests are now selected."
- (c) "Similar dependencies are inspected so the fix is not limited to three examples; incomplete
  information keeps selection broad."
- (d) "All known selector corrections, including cf12's change to selection, land before or with
  this phase's final selector change, and the audit reset is recorded there. Any later phase that
  changes selection states in its PR that it restarts the audit, and cf18's earliest date moves
  with it."

## Summary

- **(a)** All three misses reproduce on today's planner run as CI runs it
  (`node scripts/e2e-affected.mjs --json --files <culprit files>`): none selects the failed spec.
  None of the three is a dependency gap. In each, the culprit's changed files reach the code the
  failing test drives only through `src/App.tsx`, which imports the whole app, or not at all. Each
  failure has evidence that the culprit did not cause it (section 1).
- **(b)** The planner now counts a module a spec **loads** as a module it reads: by its dev-server
  URL inside `page.evaluate` (`import('/src/store/templateStore.ts')`) or by an extensionless
  import (`'../src/control/playoutProtocol'`). A CORE file now plans its reader specs beside the
  shared-change set. The bound #1921 asked for is the app shell: `app.html` keeps the old plan,
  because every spec opens it. This adds 1,740 spec-to-module links that no `covers:` line held,
  over 201 specs and 100 modules (37 of them CORE). They are read off the specs, not written as
  header lines, so they cannot drift. Two new tests fail on the old planner and pass on the new one
  (section 3).
- **(c)** Five dependency classes were inspected (section 2). Where information is incomplete the
  plan stays broad, and a new test fails if a module URL a spec loads names no file.
- **(d)** cf12's selection change landed first (`e15e8d68`, #2037). No other known correction is
  open. This PR changes selector code, so the miss audit's 14-day window restarts at its merge, and
  its commit carries a `Selection-audit-reset:` trailer. cf18's earliest date moves to 14 days
  after this merge (section 4).
- **Cost** over the last 81 merges to `main`, replayed with CI's flags: 13 merges gain specs, a
  mean of **+0.72** measured spec-minutes per merge (median 0, p90 2.0, max 22.9) on plans of
  15 to 104 minutes. No merge loses a spec, no plan changes mode, and no catalog gate flips.

## 1. (a) The three misses, reproduced and explained

Reproduction on `4276b4bf`, run as CI runs it (shared-change escalation, traced map, headers):

| Issue | Spec | Culprit | Today's plan | Spec selected |
| --- | --- | --- | --- | --- |
| #1900 | `video-hyperframes` | `aa2717b3` (#825) | subset, 136 specs | no |
| #1942 | `editor-foundation` | `b0331ecb` (#538) | subset, 90 specs | no |
| #1944 | `editor-base-edits` | `97311f15` (#607) | subset, 36 specs | no |

(The counts are a little higher than ci15's 133, 88 and 26 because cf12 added the critical
journeys to every product change.) The new planner still selects none of them, which is correct,
because there is no dependency to select on:

### #1900: `video-hyperframes` at run 37828961726 (`a2523f82`)

- **Failure.** Shard 8 died before it reported. The retry job ran its files once as their first
  verdict, and `create with the HyperFrames engine -> stub generation -> live preview renders`
  failed at `video-hyperframes.spec.ts:39`: the `composition.html` code-pane button was not found.
  The stub generation and the preview had already passed (`GAME ON` visible, `video-ai-done`).
- **No dependency.** `aa2717b3` changed `EditorFoundation.tsx`, `PreviewController.ts`,
  `commandAdapter.ts`, `commands.ts`, `documentAdapter.ts` and `session.ts`. At that commit
  `CreationWizard.tsx` imported only `openNewEditor.ts` from `editorFoundation/`, which `aa2717b3`
  did not change. Today, as then, no file under the spec's covers (`src/ai/video/**`,
  `src/video/**`, `src/components/video/**`, the wizard) imports any of the six, directly or
  through others; nothing under the video folders imports `editorFoundation` at all. The issue's
  premise ("the wizard imports from `../editorFoundation/`") is true only of that untouched file.
- **Cleared by later runs.** Red-main issue #830 records main green again at `938a22fe` (run
  37852246414, full suite), with `aa2717b3` still in the tree. Between the two runs no file under
  `src/components/video/`, `src/video/` or `src/ai/video/` changed; the intervening product
  changes were the catalog-on-demand and community-pack rows.

### #1942: `editor-foundation` at run 36597679836 (`04c509a8`)

- **Failure.** `catalog opens visibly; ...` failed in the spec's own `seed`, at
  `editor-foundation.spec.ts:15`: `page.evaluate: Execution context was destroyed, most likely
  because of a navigation`. That is the first `page.evaluate` after `page.goto`, before the test
  drives anything. The retry job could not re-run it (a shard died before reporting).
- **No dependency.** `b0331ecb` changed `CueRundown.tsx`, `FolderRow.tsx` and
  `playout-dashboard.css`. The only import chain from them to the spec's covers is
  `CueRundown.tsx <- HostedControlPage.tsx <- src/App.tsx`, the app shell, which imports
  every surface. The editor-foundation route never mounts the rundown.
- **Cleared by later runs.** Run 36598143123 on `fae96ced`, created 4 minutes later, passed the
  full suite with `b0331ecb` in the tree. The three commits between the two changed only cloud
  session setup scripts: no file under `src/` or `e2e/`.

### #1944: `editor-base-edits` at run 36932722985 (`2db3e6a6`)

- **Failure.** `B04 edited svg survives save/reopen and SPX/CasparCG/OGraf export` failed in the
  spec's `seed`, at `editor-base-edits.spec.ts:34`, on the same error as #1942. That is the
  test's first line (`:434`), before any edit or export. The retry job could not re-run it.
- **No dependency.** `97311f15` changed `src/export/showExport.ts` and added
  `src/export/spxProject.ts`. `spxProject.ts` is imported only by `showExport.ts`, and that only
  by the production page's export dialog (`ProductionExportDialog.tsx`, `exportAppearances.ts`).
  No file under the spec's covers reaches either file.
- **Same failure, cleared on its own commit.** At `8ce08b39` (run 36985533946, 11 hours later,
  with `97311f15` in the tree) the same test failed with the same error at the same line, and the
  retry job passed it on that commit (CI gate green). That is a fail-then-pass receipt for this
  exact failure. Neither the second candidate `4abaa4a5` nor `97311f15` is needed to explain it.

### What the three have in common

None of them is a selection miss in the sense the audit cares about: a change that broke a test
the plan left out. Two are one setup race in the spec helpers (a page reload during the seed's
`page.evaluate`), and the third is an intermittent code-pane wait that passed on the next full run
with no video change. The only static path from each culprit to the failing spec runs through
`src/App.tsx`, and following that path would select nearly the whole suite for every file
(section 2, class 5). They are closed as explained, with no header correction.

## 2. (c) Similar dependencies inspected

| Class | What was checked | Result |
| --- | --- | --- |
| 1. Modules a spec loads in the page by URL (`/src/...` in `page.evaluate`) | 281 e2e files reference `/src/` modules (235 distinct). `readerIndex` skipped every literal starting with `/`, so none of these specs was planned for a change to the module it loads. | **Gap, fixed.** Such a URL now names its file; a query cut from a template (`?t=${now}`) still names the file, and a URL cut at `${` names a prefix. |
| 2. Modules a spec imports in Node without an extension (`'../src/control/playoutProtocol'`) | 33 such references, in 30 specs and helpers. The reference resolved to `src/control/playoutProtocol` with no extension, which names no file. | **Gap, fixed.** An extensionless reference, or one written `.js` for a TypeScript module, now names the module as the bundler resolves it. About half are `import type`, which a test run erases: those specs are now planned for a type change they cannot fail on. That is the broad side of the error, and small (`src/model/types.ts` gains 19 specs). |
| 3. Shared stores and other CORE files | CORE escalated to the shared-change set and its own headers, never its readers (#1921). With classes 1 and 2, 37 CORE modules have readers. | **Gap, fixed** (#1921): a CORE file plans its readers too, except `app.html`, whose readers are all 227 specs. Example: `src/store/videoProjectStore.ts` now plans the six video specs, `video-hyperframes` among them. |
| 4. Shared e2e helpers and generated modules | Helpers: `helperReach` plans a helper's importers, and helpers that load modules by URL now pass those modules' readers through to every spec that imports them (`e2e/_create.ts` loads `formatCode.ts` and `ExportWindow.tsx`). Generated modules: `?raw` text plans its importers (`rawImportEdges`); the generators (`gen-video-font-css.mjs` writes into `render-worker/`, which no offline spec loads; `build-player-host.mjs` and the pack builders are suite-critical scripts). | Covered; nothing further to change. |
| 5. A covered module's own imports (the #1900 premise: the spec covers the wizard, the wizard imports X) | Measured over all 1,316 non-CORE `src/` modules: following importers one hop adds a mean of 10.8 specs per file (p90 40); two hops 22.5; transitively, stopping at CORE, a median of 128 of 239 specs, because almost every module reaches `src/App.tsx`. | **Not adopted.** The graph is complete, so this is not missing information; it is not evidence of use either. All three misses had an import path only through the shell, and none was caused by it. Stated here so a later phase can revisit it with a runtime signal (the traced map already adds the specs whose browser ran a file). |

**Incomplete information keeps selection broad.** A module the reader's tokenizer cannot follow
already reads everything (`unread`, tested since ci05). New here: a test fails when a `/src/`
module URL or extensionless import in `e2e/` names no file in the checkout, so a module that moves
cannot silently leave its readers planning nothing. The rule only adds specs: every file in the
repository was planned with the old and new planner, and none lost a spec, changed mode or flipped
the catalog gate.

The configured selection grows too, through the same readers: nine files now select more
configured specs, six of them all 69, because shared helpers that every configured spec imports
load them by URL (`e2e/configured/_helpers.ts` loads `syncController.ts`). Those are real loads.
None of the nine is CORE, so none selected the whole configured set before.

## 3. (b) The change and its regression checks

`scripts/e2e-affected.mjs`:

- `readerIndex`: a literal starting `/src/` is the repository file at that path (query and hash
  dropped); a cut template or a folder (`'/src/packs/' + name`) is a prefix.
- `refNames`: an extensionless reference, or a `.js` one, also names the module with that stem and
  a module extension.
- `planFor`, CORE branch: `addReaders(file)` unless the file is `app.html` (`APP_SHELL`).

`scripts/e2e-affected.test.mjs`, run against the old planner (a copy of `4276b4bf`) and the new:

| Test | Old planner | New planner |
| --- | --- | --- |
| `cf11: a module URL or an extensionless import names the module it loads` | fails | passes |
| `cf11: a CORE file plans the specs that load it, beside the shared-change set` (`videoProjectStore.ts` plans `video-hyperframes`; `composeDocument.ts` gains its readers; `app.html` unchanged) | fails | passes |
| `cf11: every module URL a spec loads names a file or folder in this checkout` | passes (forward guard) | passes |

`scripts/e2e-traced.test.mjs` "the traced map adds the spec a covers header missed" now passes
`readers: null`, as the neighbouring planner tests do: with a synthetic header and the real reader
index it saw the specs that load `svg.ts` by URL. Its assertion is unchanged and still exact.

Cost, replayed with `planFor(files, { sprintFocus: true, specsOnDisk, helpers })` over the 81
first-parent merges in this clone (`main` to `eab37f56`, 2026-11-02 to 2026-11-04), spec-minutes
from `scripts/e2e-durations.json`:

| | Value |
| --- | --- |
| merges that gain specs | 13 of 81 |
| added spec-minutes per merge | mean 0.72, median 0, p90 1.97, max 22.94 |
| largest gains | `5787a44a` (#2084, `composeDocument.ts` and preview protocol) +40 specs, 22.9 min on 76.1; `91971d0b` (#2060, same files) +26, 13.2 on 97.2 |

Single files with the largest gains: `src/templates/catalog.ts` (+97), `src/format/formatCode.ts`
(+94), `src/store/templateStore.ts` (+85), `src/components/ExportWindow.tsx` (+83). Each is loaded
in the page by that many specs, mostly through the `_create.ts` helper.

## 4. (d) Audit reset and cf13 sides

- **Known corrections.** cf12's change to selection landed first (`e15e8d68`, #2037, with its
  own reset). No other open issue asks for a selection correction: #1868 is about run-integrity
  and lint checks (which specs run is unchanged) and #1862 asks to narrow unmapped paths for cost,
  which is a later selection change, not a correction after a miss. Open PR #2124 (JEV) edits one
  `IGNORE` pattern in `scripts/e2e-affected.mjs` so more `docs/tutorials/svg-examples/*.md` files
  plan specs; if it lands after this, it changes selector code and restarts the audit itself.
- **Audit reset.** This changes selector code (`scripts/e2e-affected.mjs`), so the miss audit's
  14-day window restarts at this merge, and the commit carries a `Selection-audit-reset:` trailer.
  This is meant as the run's final selector change. cf18's earliest date is 14 days after this
  merge; any later phase or PR that changes selection says in its PR that it restarts the audit,
  and cf18's date moves with it.
- **cf13 sides (cf03 section 4.2).** `scripts/e2e-affected.mjs` is a script ci.yml runs, so this
  merge ends the M1, M2 and M3 sides of every group. Confirm with
  `node docs/work-specs/cicd-followup/evidence/phase-cf03-baseline.mjs rule <merge-sha>`.

## 5. Issues

- Closed by this phase: #1900, #1942, #1944 (explained, section 1), #1921 (item 1 fixed).
- #1921's items 2 to 4 are not selection and move to #2141 (P3, `area:e2e`).

## 6. Verification

- `node --test scripts/e2e-affected.test.mjs scripts/catalog-affected.test.mjs
  scripts/configured-selection.test.mjs scripts/keyed-selection.test.mjs
  scripts/e2e-selection-misses.test.mjs scripts/e2e-traced.test.mjs scripts/check-docs-index.test.mjs
  scripts/command-match.test.mjs scripts/execution-profile.test.mjs scripts/gates.test.mjs
  scripts/harness-reprobe.test.mjs`: 394 of 394 pass, after the traced-test isolation above
  (before it, one failed).
- The cf11 tests against the old planner: two fail, as section 3 shows.
- Every file in the repository (7,824 non-image files) planned alone with the old and new planner:
  no spec lost, no mode change, no catalog flip.
- GitHub reads: the three runs' failed jobs and their retry jobs, run 36985533946's failed shard,
  the main CI runs around each culprit, three compares, quarantine at six commits, red-main issue
  #830. About 40 API calls.

## 7. Phase notes

- Previous verified main: `4276b4bfacdfa80b185932ff94f6ce7e43ec0b1d` (#2122, CI run 41875887514
  green).
- Revert: `git revert -m 1 <this PR's merge commit>`, landed through `/queue-merge`. The revert
  changes selector code too, so it is also an audit reset and ends cf13 sides again.
- Decisions: the missing metadata is derived from what the specs load, not written into `covers:`
  lines, because hand-written lines are what drifted. The CORE bound is `app.html` only, because
  it is the one CORE file whose readers are the whole suite. Covered modules' own imports are not
  followed (section 2, class 5). The three misses are closed as explained, with no header change.
- Traps: a `planFor` test with made-up coverage and the real reader index now sees URL-loaded
  modules; pass `readers: null` to keep such a test to its own rule. In the history replay, pass
  the `helpers` map as CI does, or a changed helper escalates as CORE and its importers appear as
  readers. Not followed, stated: a module URL built from a variable or a full origin
  (`${baseURL}/src/x.ts`); `e2e/` has none today. A Bash command whose text contains the word `vite` trips the dev-server hook in this
  repository; keep it out of regexes in ad hoc commands.
