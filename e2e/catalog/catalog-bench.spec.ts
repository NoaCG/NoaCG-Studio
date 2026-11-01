import { test, expect } from '@playwright/test';
import { toApp, HELPERS } from '../_bench';
import { ONLY_DESIGNS, SCOPE_NOTE, categoryOutOfScope } from '../_catalogScope';
import { BENCH_CATEGORIES, REPORT, benchSlices, unitLabel } from './_bench-scope.mjs';

// The CALIBRATION TRIPWIRE: every catalog variant's create() output must pass its own runtime
// bench (src/validation/runtimeBench.ts) - the house catalog is the ground truth the thresholds
// are tuned against, so a bench change that fails the catalog is a bench bug, not a catalog bug.
// This is a CATALOG-WIDE quality gate, not a feature-flow test: it does not run as part of the
// default `npm run test:e2e` merge-gate suite (excluded via playwright.config.ts's testIgnore,
// same as e2e/configured/). Run it explicitly with `npm run test:e2e:catalog` after any change to
// the catalog itself or to the bench, same as `node scripts/type-floor.mjs` and
// `node scripts/overflow-sweep.mjs` - see AGENTS.md's "Catalog quality gates" section.

// The categories and slice budgets live in e2e/catalog/_bench-scope.mjs, beside the reporter that
// checks a run measured every selected design: the two must agree, so there is one list.
test.describe('catalog calibration tripwire', () => {
  for (const category of BENCH_CATEGORIES) {
    const slices = benchSlices(category);
    for (let slice = 0; slice < slices; slice++) {
      const label = unitLabel(category, slice, slices);
      // The annotation names the unit for the scope guard even when the unit is skipped.
      const unit = { type: REPORT, description: JSON.stringify({ category, slice, slices }) };
      test(`every ${label} variant passes the bench${SCOPE_NOTE}`, { annotation: unit }, async ({ page }) => {
        // BEFORE THE APP BOOTS, not after. The in-page filter below decides which designs are
        // benched; this decides whether the unit runs at all. Without it a run scoped to one lower
        // third still paid 30 app boots and 30 catalog imports to bench one design, which is most
        // of the cost this scoping exists to remove. The category list only ever arrives from
        // scripts/catalog-affected.mjs, and the scope guard (e2e/catalog/_bench-scope.mjs) fails
        // the run if it leaves out a category the scoped designs live in.
        test.skip(categoryOutOfScope(category), `${category} holds none of the scoped designs`);
        test.setTimeout(120_000);
        await toApp(page);
        // The SLICE ASSIGNMENT is unchanged by scoping - variant i still belongs to slice
        // i % slices - so a scoped run measures exactly the designs a full run would, in the
        // same units. Only the ones nobody asked for are dropped.
        const rows = await page.evaluate(`(async (category, slice, slices, only) => { ${HELPERS}
          const { CATALOG } = await import('/src/templates/catalog.ts');
          const out = [];
          const all = CATALOG[category] || [];
          for (let i = 0; i < all.length; i++) {
            if (i % slices !== slice) continue;
            const v = all[i];
            if (only && only.indexOf(v.id) < 0) continue;
            const res = await bench(v.create());
            out.push({ id: v.id, ok: res.ok, errors: res.errors.map((e) => e.rule + ': ' + e.message) });
          }
          return out;
        })(${JSON.stringify(category)}, ${slice}, ${slices}, ${JSON.stringify(ONLY_DESIGNS)})`);
        const measured = rows as { id: string; ok: boolean; errors: string[] }[];
        // WHAT THIS UNIT MEASURED, for the scope guard, before any assertion can stop the test: a
        // unit that fails still measured its designs, and the guard checks the run's units
        // together measured exactly the selected designs.
        await test.info().attach(REPORT, {
          body: JSON.stringify(measured.map((r) => ({ id: r.id, ok: r.ok }))),
          contentType: 'application/json',
        });
        // An empty unit is only ever legitimate under an explicit scope, and even then only when
        // the run's units together measured every selected design (the scope guard, rule S8).
        // Unscoped, it means the category vanished or the slice arithmetic broke - a gate
        // measuring nothing and saying it passed is the failure mode this whole file exists to avoid.
        if (!ONLY_DESIGNS) expect(measured.length, `${label} benched no variants`).toBeGreaterThan(0);
        const failed = measured.filter((r) => !r.ok);
        expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
      });
    }
  }
});
