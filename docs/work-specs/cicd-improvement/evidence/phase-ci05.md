# Phase ci05: path selection and execution integrity

Row ci05 of the [cicd-improvement spec](../spec.md) (P1b; AC-4). Built 2026-10-31 by the ci05
builder (Claude Code Cloud worker of plan run #1842) from `main` at
`b666f302d4eea1e22506a6769b058318fc30438a`. It hardens the path cases the spec assigns to this
row (renames, `output.html`, filesystem-read fixtures, short-regex copy, the `spaceKey.ts` header)
and makes a focused or vanished selected test fail CI. AC-4 as a whole stays open: its miss audit
and two-week window start in ci07, and the configured suite's selected-case verdict is ci06.

## 1. Reproduction

Each case was reproduced at the base before the fix; the test that pins it asserts the defect
first (the old-shape or `readers: null` answer), then the corrected plan. All calls are
`planFor(...)` as CI runs it, sprint focus on where it says so.

| Case | Base b666f302 | ci05 | Pinned by |
| --- | --- | --- | --- |
| Rename out of a core directory (3c64200e3: `src/preview/measureCue.ts` to `src/components/home/measureCue.ts`) | `git diff --name-only` lists only the new path: 23 specs, no escalation | both paths: the old `src/preview/` path escalates (shared-change set, 83 specs) | `ci05: a rename contributes its old and its new path, committed or staged` (real temp repo, committed and staged renames) |
| `output.html` | 1 spec (`productions.spec.ts`, its only header) | 18 specs: every spec or helper that opens `/output` | `ci05: output.html plans every spec that opens /output ...` |
| `e2e/fixtures/fidelity-nested.svg` (read with `readFileSync(new URL(...))`) | unmapped: the 77-spec shared-change set, none of its 5 readers | the same set plus its 5 readers | `ci05: a fixture read from disk plans its readers and keeps the escalation it had` |
| `scripts/fixtures/youtube/*.json` (read by `production-chat-intake.spec.ts`) | mode `none`: ignored with all of `scripts/` | its reader | same test |
| `scripts/rules.mjs` (imported by 5 offline specs) | catalog gate only, no offline spec | catalog gate plus its 5 importers | updated ci04 test |
| Short regex copy locator (`getByRole('button', { name: /save/i })`, wording `Save graphic` changed) | not selected: `save` is shorter than a distinctive phrase | selected: the regex is run against the old and new wording | `ci05: a short regex locator selects its spec ...` |
| `src/components/spaceKey.ts` | escalated only because the traced map lists it as broad; with no map (or once it stops being broad) its `covers:` line made it 1 spec, against the documented decision | escalates whatever the map says, and keeps its header spec | `shortcut guard changes escalate and keep ...` (with `traced: null`) |
| A committed `test.only` | runs alone; every other test in the loaded files is dropped and the shard passes | lint error on every change; `forbidOnly` fails the run on CI | `ci05: the lint rule refuses ...`, `ci05: every Playwright config CI runs forbids ...`, probes below |
| A selected spec that plans no test in its shard | the shard passes without it | the run-integrity reporter fails the shard and names the file | `ci05: a spec the plan selected that planned no test ...`, probes below |

## 2. Design (decided by the builder)

1. **Both rename paths.** `changedFilesSince` reads `git diff --name-status -M -z` and
   `git status --porcelain -z` and keeps both sides of a rename or copy (`nameStatusPaths`,
   `porcelainPaths`). NUL-separated, so no path is C-quoted. Every planner (offline, catalog,
   main's `--catalog-since`) gets its list from this one function.
2. **Readers, additive only.** `readerIndex` reads every spec and e2e module for the paths it
   names: `new URL(lit, import.meta.url)` resolved from the module, any other path-shaped string
   or template literal from the repository root (and `./`/`../` ones from the module too), a
   template cut at `${` or a literal ending in `/` as a prefix, and a root page `<name>.html` by its
   route (`/output?`, `'/output'`, `/output*`, `/output.html`; `/join/<name>` too, mirrored from
   vite.config.ts `PATH_PAGES` and pinned against it). Readers are followed through imports, like
   `helperReach`. `planFor` adds a file's readers wherever its header specs would be added, and
   before IGNORE, so an ignored fixture under `scripts/` is still planned. They never replace an
   escalation: an unmapped fixture keeps the shared-change set and catalog gate it had, and its
   readers come on top. CORE files skip them, as they skip headers. A catalog or configured spec
   among the readers raises that flag.
3. **Regex copy locators run as written.** `specRegexes` compiles each regex literal in a spec
   that holds two literal letters outside escapes and character classes, and is not the argument
   of `toHaveClass`, `toHaveCSS`, `toHaveId`, `toHaveURL`, `waitForURL` or `route`. `specsNaming`
   selects the spec when one matches the old or new wording. The phrase path is unchanged.
4. **`ESCALATES_WITH_HEADERS`.** A file listed there escalates like CORE and keeps the specs its
   headers name, so a header adds coverage and cannot narrow it. `spaceKey.ts` is the one entry;
   CORE itself was not used because CORE drops header specs under sprint focus, which would have
   planned one spec fewer than today.
5. **Focused tests.** `forbidOnly: Boolean(process.env.CI)` in all five Playwright configs, and an
   ESLint `no-restricted-syntax` rule on `e2e/**/*.ts` refusing any `<x>.only(...)` call, which the
   build's `eslint .` runs on every change over every file, selected or not.
6. **Selected specs cannot vanish.** The run-integrity reporter (already last in every config)
   reads `NOACG_E2E_EXPECTED_SPECS`; a passing run where a listed file planned no test fails with
   the file names. ci.yml's E2E shard step exports the shard's own file list. Checked on this
   base: all 241 offline specs list at least one test under `CI=1`, so no current spec trips it.

Why this shape: every fix reuses the planner's existing machinery (the one changed-file function,
the import walk, the copy module, the reporter every config already loads), and every planner
change only adds specs. Narrowing an escalation to a file's readers is a selection decision that
needs ci07's critical/shared sets and miss audit, so it is left out on purpose.

What the readers cannot see, stated: a path assembled at run time from parts
(`join(dir, 'fixtures', name)`) and a route built from a variable. Such a reader is not found and
the file plans what it planned before; under `scripts/` that can still be nothing, as at the base.
Test `ci05: no file under e2e/fixtures plans nothing` pins that no file under `e2e/fixtures/`
(other than markdown no spec reads) plans mode `none`.

## 3. Acceptance

| Criterion | Evidence | Result |
| --- | --- | --- |
| (a) Pin old/new rename paths | rename test: real repo, committed and staged renames, both paths listed, the old core path escalates; `git diff --name-only` shown returning the new path alone | pass |
| (a) Pin `output.html` | header-only answer 1 spec; with readers 18, including the six `/output` openers asserted by name; every root page's header set preserved | pass |
| (a) Pin filesystem-read fixtures | `fidelity-nested.svg` gains its readers and keeps its escalation; `scripts/fixtures/youtube/` goes from `none` to its reader; the svg-corpus file keeps the catalog gate (ci04 trap); unit test of `readerIndex` (URL, template prefix, concatenation through a helper, comment, run-time path, look-alike routes) | pass |
| (a) Pin short-regex copy | `/save/i` and `/^OK$/` select their specs; `/\s+/`, `/\d+/`, `/[A-Za-z]{6,}/`, `toHaveClass(/on/)` and `toHaveURL(...)` do not; through `planFor` as a copy edit | pass |
| (a) Pin the `spaceKey` override | with no traced map: mode `full`; under focus the shared-change set plus `editor-usability.spec.ts`; the header that used to narrow it still exists | pass |
| (a) Report unsupported cases conservatively | readers only add; an unmapped fixture still escalates; run-time paths stated above; `e2e/fixtures` never plans `none` | pass |
| (b) CI rejects `test.only` | ESLint rule (lint test on a real snippet, lines 2 and 3 flagged); `forbidOnly` on CI in all five configs (static test); discovery probe below | pass |
| (b) Discovery and verdict probes prove selected cases cannot disappear | real Playwright over a scratch directory under ignored `test-results/`: `--list` with the real `playwright.config.ts` and `CI=1` refuses a focused test; with `forbidOnly` off, a `test.only` that filters two selected files out fails the run naming both; a selected file the filters no longer reach fails; the same files all present pass | pass |
| (b) No focused test left committed | the probe writes its focused test into a scratch directory, removes it, and asserts `git status` is clean there; the lint rule covers the tree | pass |

Mutation check, each fix reverted alone with the tests run: rename list back to `--name-only`
(1 failure), readers off (3), regex matching off (1), `ESCALATES_WITH_HEADERS` empty (2),
`forbidOnly: false` in playwright.config.ts (2, the static test and the discovery probe), the
reporter's missing-spec check off (2, the unit test and the verdict probe).

## 4. Cost (safety work, reported, not a regression)

Replay of the last 150 first-parent landings on `origin/main` (`acfad2f4` to `b666f302`), both
planners, sprint focus on, the committed traced map, copy path off in both (as ci04 measured):

| Planner | none | shared-change set | catalog gate | planned E2E test-minutes |
| --- | ---: | ---: | ---: | ---: |
| base b666f302 | 85 | 55 | 54 | 4,690.1 |
| ci05 | 84 | 55 | 54 | 4,697.3 (+0.15%) |

No landing was planned narrower. Four planned more: `a7fe94e6` (+1, `cli/src/playout/server.ts`,
which `bridge-ograf.spec.ts` imports), `9e84a1d7` (+2, `docs.html` route readers), `fc5a4b4a`
(+1, a font read by path), `2776f9ea` (+4, `downloads.html` route readers). No rename changed a
plan in this window beyond what other files in the same landing already escalated.

Copy path, measured separately over the last 3,000 non-merge commits: 91 wording edits; 37 gain
specs through a regex, 74 specs in all (about 0.8 per wording edit).

Graphics cost: the catalog gate count is unchanged (54 of 150) in the replay, so this row adds
no measured graphics runner-minutes; nothing here leans on the ci04 exception (#1863). The run-
integrity check and the lint rule add no job; the probes add about 6 seconds to the build tier.

## 5. Phase notes

- Previous verified main: `b666f302d4eea1e22506a6769b058318fc30438a` (ci04 merge).
- Revert: `git revert -m 1 <this PR's merge commit>`.
- Decisions: readers add and never narrow (narrowing waits for ci07); `ESCALATES_WITH_HEADERS`
  rather than CORE for `spaceKey.ts`, to keep its header spec; regex literals are judged by
  running them, not by length, with class/URL/CSS assertions excluded; the verdict check lives in
  the reporter every config already loads, fed by ci.yml, not in a new job. `forbidOnly` follows
  `CI` so a local debugging run can still focus a test, which the lint rule then stops at commit.
- Traps for later rows: the readers index is computed from the checkout once per process, like
  the catalog reach, so it cannot go stale; a spec that reads a fixture through a run-time path is
  invisible to it, as to ci04's walk. The svg-corpus fixtures stay in the catalog reach (asserted
  again here). The CENTRAL `cli/` rule now lets readers through: `bridge-ograf.spec.ts` runs for a
  `cli/src/playout/server.ts` change. ci06 owns the configured suite's selected-case identity; the
  readers raise the `configured` flag when a configured spec reads a file, which nothing consumes
  yet. `NOACG_E2E_EXPECTED_SPECS` is set only by ci.yml's offline shard step; the retry job and
  local runs do not set it. `scripts/e2e-traced.json`, `e2e/quarantine.json` and
  `scripts/e2e-durations.json` are untouched (bot PRs #1840, #1834, #1503).

## 6. Verification run

- `node --test` over `scripts/e2e-affected.test.mjs`, `e2e-traced.test.mjs`,
  `catalog-affected.test.mjs`, `e2e-selection-misses.test.mjs`, `keyed-selection.test.mjs`,
  `catalog-line-gate.test.mjs`, `e2e-run-integrity.test.mjs`: 283 pass, 0 fail.
- `npm run gates -- run --changed origin/main`: 10 test files, 215 tests, all pass (one
  `windowsHide` finding in the new probe fixed first).
- `npx tsc --noEmit`, `npx eslint . --max-warnings 0`, `node scripts/check-workflows.mjs`: clean.
- `CI=1 npx playwright test --list`: 241 of 241 offline specs list a test.
- No browser suite run here: no product surface changed; CI's own plan for this PR runs the
  selected shards with the new expected-spec check.
