# Phase ci04: broad/shared and catalog selection

Row ci04 of the [cicd-improvement spec](../spec.md) (P1b; AC-4). Built 2026-10-31 by the ci04
builder (Claude Code Cloud worker of plan run #1842) from `main` at
`99c461b8ed30c2a03dfc87a002573263473a2425`. It hardens the two selection gaps the spec assigns to
this row: broad traced files, and the catalog fallback under sprint focus. Renames, `test.only`,
`output.html`, filesystem-read fixtures, short-regex copy and the `spaceKey.ts` header are ci05.
AC-4 as a whole stays open: its miss audit and two-week window start in ci07.

## 1. Reproduction

Both reported misses reproduce, at the commit the report names and at this row's base. Each
line is `planFor([file], { sprintFocus: true, traced })` as CI runs it, with the committed traced
map read on its own day (`/tmp` scratch script, not committed; the same calls are pinned in
`scripts/e2e-affected.test.mjs`).

| File | 55f98f9e6 (report) | 99c461b8 (base) | ci04 |
| --- | --- | --- | --- |
| `src/components/canvas/CanvasGuides.tsx` (broad: 213 of 241 traced specs) | 1 spec, no catalog | 1 spec, no catalog | shared-change set (77) + its 1, no catalog (outside the reach) |
| `src/model/easings.ts` (21 template files import it) | shared-change set, **catalog false** | same | shared-change set, catalog |
| `src/preview/composeDocument.ts` (every catalog spec renders through it) | shared-change set, **catalog false** | same | shared-change set, catalog |
| `package.json` | shared-change set, **catalog false** | same | shared-change set, catalog |
| `public/fonts/anton.woff2` (found here, not in the report) | not run | 2 specs, **catalog false** | 2 specs, catalog |
| `src/export/bundledFonts.ts` (found here) | not run | 53 specs, **catalog false** | 53 specs, catalog |
| `src/styles/base.css` (control: no catalog spec loads it) | shared-change set, no catalog | same | same |

Correction to the report: it names `src/preview/compose.ts`, which is not a file at 55f98f9e6 or
at the base; the composer is `src/preview/composeDocument.ts`, and it shows the same defect. The
other counts match: 314 broad files, `CanvasGuides.tsx` in 213 specs selecting 1.

Causes, in the base source:

- `scripts/e2e-traced.mjs` `BROAD_ESCALATES = false`: a broad file kept only its curated
  selection, so a file most of the suite executes ran whatever its header named.
- `scripts/e2e-affected.mjs` `planFor`: the full-to-catalog coupling (`if (full) catalog = true`)
  ran after sprint focus had already turned `full` off, so every core or unmapped escalation on a
  PR or merge group planned no catalog gate unless the file matched `CATALOG_TRIGGERS` by name.
  CI branches on that flag alone (`e2e-catalog` job, `if: needs.plan.outputs.catalog == 'true'`).
  Main's post-landing run uses `catalogForChange` without focus and was not affected.
- Font files are fetched by URL, so no rule named them and no import graph could find them.

## 2. Design (decided by the builder)

1. **Broad files escalate.** `BROAD_ESCALATES = true`. Under sprint focus that is the shared-change
   set (the `// focus` specs, the conservative shared protection ci07 will later split into
   critical and shared sets) plus the curated selection. With `--full-escalation` it is the full
   suite. The constant stays the one-line revert.
2. **The catalog reach.** `catalogReachOf` reads the catalog specs (`e2e/catalog/*.spec.ts`),
   follows their Node imports (`e2e/_bench.ts`, `_catalogScope.ts`, `_ografParity.ts`, the `src/`
   modules those import, and scripts such as `scripts/rules.mjs` whose text feeds assertions),
   every literal in-page `import('/src/...')`, CSS `@import`, and `new URL(..., import.meta.url)`,
   including directories a spec reads from disk (`e2e/fixtures/svg-corpus/`, `public/fonts/`).
   At the base it holds 857 entries. The walk is strict: an import, `@import` or URL it cannot
   resolve, or an `import.meta.glob`, makes the whole reach unknown rather than smaller. A
   changed file in it raises the catalog gate whatever else the plan does, before the offline
   IGNORE list is consulted.
3. **Conservative fallback.** When sprint focus intercepts an escalation, the gate is raised
   unless every escalating file is a `src/` module (`.ts`, `.tsx`, `.js`, `.mjs`, `.jsx`, `.css`)
   that the walk can see and did not reach (`outsideCatalog`). Anything else raises it: a
   dependency manifest, the build config, `app.html`, a `public/` asset, an unknown root file, or
   any escalation at all when the reach is unknown (no catalog spec, no page import, or an edge
   the walk cannot resolve; the plan then says so, `catalogReachUnknown`). A stale traced map
   escalates the offline plan; the catalog question is still answered by the import reach, which
   the map does not inform.
4. **Fonts.** `^public/fonts/` joins `CATALOG_TRIGGERS`.

Why this shape: it reuses the dependency machinery the planner already has (`importClosure`,
the `?raw` and helper walks) instead of a second list, and it keeps the cost cut the old focus
rule was for (an app-only styles change still skips the catalog) only where an import walk proves
it. `catalog-affected.mjs` asks `planFor` per file, so its slicing inherits the new triggers:
a non-template file in the reach escalates the whole catalog there, as shared machinery should.

What the reach cannot see, stated: a non-literal `import(x)` inside a catalog spec (the one today,
`_ografParity.ts` `import(url)`, loads the package the spec just built through `src/export`,
which is in the reach); a disk read through a path built at run time rather than a literal
`new URL`; and text a module only emits (a quoted `'./${lib.lottie}'` inside a template literal
is skipped as output, not an import). The general filesystem-read fixture mapping for the
offline suite stays ci05's.

## 3. Acceptance

| Criterion | Evidence | Result |
| --- | --- | --- |
| (a) Reproduce broad-trace and catalog-fallback misses or correct the report with evidence | Section 1, at 55f98f9e6 and 99c461b8; the one wrong path in the report corrected | pass |
| (a) shared/model/render/font changes reach affected contracts and catalog or conservatively escalate | tests `ci04: ... raises the catalog gate under sprint focus` (easings, composeDocument, package.json, package-lock.json, vite.config.ts; planner and CLI), `a font file or a non-escalating module in the reach raises the catalog gate on its own` (public/fonts, bundledFonts.ts), `a script a catalog spec imports raises the catalog gate` (scripts/rules.mjs), `the catalog reach ... holds what they render through` (catalog.ts, composeDocument, runtimeBench, easings, bundledFonts, ograf.ts). Render: `src/render/*` is the server video path, not in the reach; its headers keep selecting its 2-13 specs, and `src/preview`/`src/model` escalate | pass |
| (b) Unknown, dynamic or unsupported dependencies cannot silently select nothing | tests `an unknown reach, an unknown root file or a stale map never plans an escalation without the catalog gate`, `catalogReachOf ... refuses what it cannot resolve` (no spec, no page import, a page import naming no file, an unresolvable import, CSS `@import`, asset URL or a glob are all `null`, never a smaller set) | pass |
| (b) preserve conservative shared protection until ci07 | the focus set is unchanged and is still what every escalation plans; broad files now reach it; replay (section 4): no landing planned fewer specs or lost its catalog gate | pass |

Mutation check, each fix reverted alone with the new tests run: broad off 1 failure, the focus
catalog coupling removed 4, the reach trigger removed 1, the fonts line removed 1.

## 4. Cost (safety work, reported, not a regression)

Replay of every first-parent merge landing in this clone's `origin/main` history (56, `302d565b`
to `99c461b8`), both planners, sprint focus on, the map of 2026-10-30:

| Planner | none | shared-change set | catalog gate | planned E2E test-minutes |
| --- | ---: | ---: | ---: | ---: |
| base 99c461b8 | 33 | 17 | 2 | 1,439 |
| ci04 | 33 | 20 | 20 | 1,484 (+3%) |

No landing was planned narrower. The 18 extra catalog runs come from: `src/control/*` and
`src/export/*` reached through `_ografParity.ts`'s package build (6), dependency manifests (5),
unmapped non-`src/` paths that already escalated (`e2e/fixtures/jev-svg/`, `companion-module/`,
`benchmarks/harness/`, `e2e/endurance/`; 6), and `src/preview/composeDocument.ts` (1, the
reported defect itself, landing 55f98f9e).

One catalog gate job took 11.2 minutes (run 41204535069, 13:12:58 to 13:24:10). It runs beside
the E2E shards, so it adds runner-minutes more than wall-clock. Against ci01's frozen graphics
tier (7.8 baseline, 10 ceiling runner-minutes per landing), 18 more raised plans in 56 landings at
about 11 minutes, on each of a landing's merge-group run and its about 3.9 PR runs (ci01 reference
workload), projects to roughly +15 to +18 graphics runner-minutes per landing. That is over the
frozen graphics ceiling. ci18 owns enforcement; this row reports the overrun as the intentional
safety cost P1(b) may add (spec, P1 and AC-8). The largest avoidable share is unmapped paths that
escalate both the focus set and the catalog; mapping them is a selection change outside ci04
(follow-up issue, section 6).

## 5. Phase notes

- Previous verified main: `99c461b8ed30c2a03dfc87a002573263473a2425` (ci03 merge).
- Revert: `git revert -m 1 <this PR's merge commit>`; the broad half alone is
  `BROAD_ESCALATES = false` in `scripts/e2e-traced.mjs`.
- Decisions: broad files escalate rather than adding a separate critical set (ci07 defines that
  set; until then the focus set is the conservative shared protection). The catalog reach is
  computed from the checkout once per process, not cached in a committed file, so it cannot go
  stale. Non-`src/` escalations raise the catalog rather than trying to prove them outside it.
- Traps for later rows: the catalog reach already raises the gate for `e2e/fixtures/svg-corpus/`
  (ograf-parity reads it from disk); ci05's offline fixture mapping must not route those files
  around that check, and a catalog spec that reads a fixture through a computed path is invisible
  to the walk. `importClosure` (the dev-server walk) still resolves fewer extensions than the
  reach's `resolveModule`; unifying them changes the dev-server closure and is left out of this
  row on purpose. ci07's
  critical set must not shrink what a broad file plans below what this row pins without a reset
  under the runbook's selector-semantics class. `scripts/e2e-traced.json` is untouched (bot PR
  #1840 owns it).

## 6. Verification run

- `node --test` over `scripts/e2e-affected.test.mjs`, `e2e-traced.test.mjs`,
  `catalog-affected.test.mjs`, `e2e-selection-misses.test.mjs`, `keyed-selection.test.mjs`,
  `catalog-line-gate.test.mjs`: 264 pass, 0 fail.
- `/check`: the code review's 10 findings were all confirmed and fixed (strict walk, lazy reach,
  Node-side scripts in the reach, comment stripping, stale comments and narration, two weak tests,
  fewer CLI starts); simplify merged the comment filter, cached reads and directory prefixes, and
  replaced the escalation list with one `escalate()` helper. The replay in section 4 was rerun on
  the final code with identical totals.
- `npm run gates -- run --changed origin/main`: all gates ok, 150 tests pass.
- `npx eslint` on the four changed scripts: clean.
- No browser suite run here: the change is planner logic with no product surface; CI's own plan
  for this PR exercises it.
