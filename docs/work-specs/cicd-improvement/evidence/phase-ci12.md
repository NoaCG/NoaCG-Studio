# Phase ci12: scoped-catalog report integrity

Row ci12 of the [cicd-improvement spec](../spec.md) (P3; AC-5). Built 2026-11-01 by the ci12
builder (Claude Code Cloud worker of plan run #1842) from `main` at
`a37f0a765267a3399a96a1cfb3417852f6ee9c84`.

Acceptance, verbatim:

- (a) "Expected selected IDs and categories exactly match measured coverage; unknown IDs, omitted
  designs, missing categories, empty overall selection and missing reports fail."
- (b) "An empty individual slice passes only when the complete selected manifest ran; compare
  rendered scoped/full results. No CI calibration narrowing yet."

## Rules

The guard is `e2e/catalog/_bench-scope.mjs`, a reporter on `playwright.catalog.config.ts`. It
judges every run that plans a unit of `e2e/catalog/catalog-bench.spec.ts`, scoped or full, at the
end of the run. Each line below has one test named after it (`Rule S1: ...` and so on in
`scripts/catalog-bench-scope.test.mjs`), and each test fails when its line is broken in the code
(mutation check, section 3).

Words used below:

- **Catalog**: the ids and categories the catalog ships, read by the guard itself from the
  checkout (`catalogIndex`), not from the bench's report.
- **Selection**: `NOACG_ONLY_DESIGNS` when it is set (scoped run); otherwise every catalog id (full run).
- **Bench manifest**: the bench's categories, each with its slice count, plus the categories the
  bench declares it does not bench, each with a reason. One module holds it, and both the bench and
  the guard read it.
- **Expected**: the selected ids whose category the bench benches.
- **Unit**: one bench test, a (category, slice) pair. Its **report** is the list of ids it
  measured, with each verdict, attached to its result.

The run fails, with every reason printed, when any of these holds:

- S1. **Unknown id.** A selected id is not in the catalog.
- S2. **Empty overall selection.** `NOACG_ONLY_DESIGNS` is present but names no id, or
  `NOACG_ONLY_CATEGORIES` names categories without `NOACG_ONLY_DESIGNS` (a category filter on an
  unscoped run skips categories while looking like a full run). An empty `NOACG_ONLY_CATEGORIES`
  is unset, as the bench reads it.
- S3. **Category mismatch.** `NOACG_ONLY_CATEGORIES` is set and is not exactly the set of
  categories the selected ids live in (one left out, or one extra).
- S4. **Unaccounted category.** A catalog category holding a selected id is neither benched nor
  declared not benched. On a full run that is every catalog category.
- S5. **Missing report.** For each benched category holding an expected id, every one of its
  units must have run once (passed or failed, not skipped, interrupted or absent) with a report
  attached. A unit filtered out, skipped, cut short or reporting a different slice count fails.
- S6. **Omitted design.** An expected id appears in no report, or in more than one.
- S7. **Unexpected design.** A report names an id that is not expected.
- S8. **Empty slice.** A unit whose report is empty is not a failure in itself. It passes only
  when S1 to S7 all hold, which means the complete selected manifest ran. (Unscoped, the bench's
  own check that every unit measured something still applies.)
- S9. **Declared not benched.** Selected ids in a category the bench declares it does not bench
  are named in the summary with the reason, and are never counted as measured. A selection with
  no benched id measured nothing in the bench, and fails. Every run prints the declared categories.
- S10. **No catalog.** If the guard cannot read the catalog, the run fails: no verdict without the
  oracle.
- S11. **The honest report passes**, scoped and full, and the summary states the selected,
  expected and measured counts and the empty units.
- S12. **The guard is engaged** whenever a bench unit is planned. A run that plans no bench unit
  (another catalog spec alone) is not judged. A `--reporter` argument would replace the config's
  reporters and with them the guard, so `playwright.catalog.config.ts` and
  `scripts/catalog-specs.mjs` both refuse it.
- S13. **A report the run asked for** (`NOACG_CATALOG_BENCH_REPORT`) and could not write fails the run.

Changed after coding, from the first review round: S9 first let a selection made only of declared
designs pass by vacancy, the way the sweeps do; the review read that as the empty overall selection
the acceptance forbids, and it now fails. S13 is new: a failed write threw inside the reporter,
which Playwright only logs, and skipped the verdict. S2's empty category variable and S12's config
refusal were added in the same round.

The bench's own per-design verdicts (a design failing its runtime bench) stay the bench's
failures; the guard does not repeat them.

## 1. Reproduction at the base

At `a37f0a76`, before any change, on this cloud worker through the job queue (`j-0001`):

    NOACG_ONLY_DESIGNS=imp01 NOACG_ONLY_CATEGORIES=imported-design \
      npx playwright test --config=playwright.catalog.config.ts catalog-bench
    30 skipped        exit 0

A scoped bench run measured nothing and passed. Four holes made that possible, all in the bench
and its scope, none in the selector:

- The bench's category list was typed by hand and nothing compared it with the catalog.
  `imported-design` (2 designs, `imp01` and `svg01`) joined the catalog on 2026-10-29 (#1820) and
  was never added, so full runs in CI and the nightly have skipped both since, with no message.
- A unit skipped its whole category when `NOACG_ONLY_CATEGORIES` left it out, and nothing checked
  that list against the designs. A wrong list (`NOACG_ONLY_DESIGNS=lt01 NOACG_ONLY_CATEGORIES=ticker`)
  skipped `lower-third` and passed.
- Under a scope, a unit that measured nothing passed by design (the empty slice), and nothing
  checked that the units together measured every selected design.
- The comment in the bench cited `e2e/catalog/scope-guard.spec.ts` as the check for the second
  hole. That file does not exist at the base (the spec says so).

## 2. Design (decided by the builder)

- **One manifest, one guard.** The bench's categories and slice budgets move into
  `e2e/catalog/_bench-scope.mjs`, which both the bench and the guard read, so they cannot disagree.
  The guard is a Playwright reporter on `playwright.catalog.config.ts`, the config every catalog
  entry point uses: `npm run test:e2e:catalog` (ci.yml's calibration job and the nightly) and
  `scripts/catalog-specs.mjs` (catalog-gates and local scoped runs). No second selector or report
  path: the selection still comes only from `catalog-affected.mjs`, and the guard only checks the
  evidence. It judges full runs too, against the whole catalog: a full run that skipped a
  category is the same defect.
- **Why a reporter, not a spec.** A spec cannot see what other tests measured. The cited
  `scope-guard.spec.ts` would have covered only the category list (hole two); the reporter sees
  every unit's result at the end of the run, which holes three and four need. Each unit attaches
  what it measured as a JSON attachment, and names itself with a test annotation that is present
  even when the unit is skipped.
- **The oracle is independent of the report.** The guard reads the catalog itself
  (`catalogIndex` in `scripts/catalog-emit.mjs`, about 3 s), not from the units, so a unit that
  measured the wrong thing cannot also define what was right.
- **`imported-design` is declared, not benched.** Benching it locally (the category added to the
  list, `j-0002`): `imp01` passes, `svg01` fails `bench-entrance` (not visible after play()) and
  `bench-replay` (play() after stop() does not bring it back). Adding the category would turn
  ci.yml's catalog job red for every catalog-touching change, for a design defect or rule mismatch
  this row may not decide (the bench's comment says a bench change that fails the catalog is a
  bench bug, and the design is the JEV plan's). So `NOT_BENCHED` names it with that reason and
  issue #1926; every run prints it, and a scoped selection with no benched design fails (S9).
  Relative to the base this loosens nothing: the category was never measured; it is now visible.
- **catalog-gates keeps the guard's summary.** `NOACG_CATALOG_BENCH_REPORT` makes the guard write
  what each design's bench verdict was; catalog-gates uploads it on every run, which is how
  section 4 compares a scoped run with a full one.

## 3. Verification of the guard

- `node --test scripts/catalog-bench-scope.test.mjs`: 13 tests, one per rule, all pass.
- Mutation check: 23 mutations of the guard, each removing one check (every clause of S2, S3, S5
  and S6 separately), run against that file
  (`mutate.py` in the builder's scratchpad, not committed). Each fails the test named after its own
  rule. S6 also fails S8's test, which uses an omitted design as its failing case. The S8
  mutation (fail any empty unit) fails eight tests, every one whose honest scoped run has an
  empty slice.
- Real runs on this worker through the job queue, at the guard's first commit:
  - `j-0003`, `NOACG_ONLY_DESIGNS=lt01 NOACG_ONLY_CATEGORIES=ticker`: failed (exit 1) with S3
    (left out `lower-third`, named `ticker`), S5 (four `lower-third` slices skipped) and S6 (`lt01`
    never measured). At the base the same run passes, as `j-0001` did.
  - `j-0004`, `NOACG_ONLY_DESIGNS=lt01,lt02,sb01,imp01` with their three categories: passed,
    "measured 3 of 3 expected design(s) in 2 categories over 5 unit(s), from 4 selected; 1
    declared not benched (imp01); 2 unit(s) held none of them". Two empty lower-third slices
    passed because the complete manifest ran (S8).
- `npx playwright test --config=playwright.catalog.config.ts --list --reporter=dot` refuses with
  the guard's message (S12).
