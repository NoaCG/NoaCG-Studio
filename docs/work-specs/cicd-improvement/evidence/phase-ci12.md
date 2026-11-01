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
