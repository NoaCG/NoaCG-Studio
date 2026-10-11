import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { toApp } from '../_bench';
import { ONLY_DESIGNS, SCOPE_NOTE } from '../_catalogScope';
import { expectParity, paritySweep, STRETCH_PROBE, type ParitySource } from '../_ografParity';

// THE SHADOW MOUNT PAINTS THE LIGHT MOUNT'S FRAME, over the whole catalog and the SVG corpus
// (AC-3 of docs/work-specs/ograf-shadow-root/spec.md). How the frames are taken and compared, on a
// virtual clock: e2e/_ografParity.ts. The default suite runs one design per category
// (e2e/ograf-parity.spec.ts); this runs everything, on every change to the OGraf wrapper
// (src/export/targets/ograf.ts is a catalog trigger in scripts/e2e-affected.mjs) and nightly.
//
// Each unit also prints what it read, one line per design that is not a clean match, so the
// catalog job's log carries the record: the designs whose two light mounts disagree (not
// compared), and the designs whose light frame differs from the studio's own document. That last
// reading is a RECORD for the flip, where the studio document becomes the reference (decision 5),
// never a failure here.

/** Parallel units over the catalog: design i belongs to unit i % CATALOG_UNITS. */
const CATALOG_UNITS = 24;
/** Parallel units over the SVG corpus and the two probes. */
const CORPUS_UNITS = 2;

const CORPUS_DIR = fileURLToPath(new URL('../fixtures/svg-corpus/', import.meta.url));

test.describe('OGraf shadow mount parity', () => {
  for (let unit = 0; unit < CATALOG_UNITS; unit++) {
    const label = `catalog unit ${unit + 1} of ${CATALOG_UNITS}`;
    test(`the shadow mount paints the light mount's frame, ${label}${SCOPE_NOTE}`, async ({ page, browser }) => {
      test.setTimeout(300_000);
      await toApp(page);
      const ids = await page.evaluate(async ({ unit, units, only }) => {
        const { CATALOG } = await import('/src/templates/catalog.ts');
        return Object.values(CATALOG)
          .flatMap((variants) => (variants ?? []).map((v) => v.id))
          .filter((id, i) => i % units === unit && (!only || only.includes(id)));
      }, { unit, units: CATALOG_UNITS, only: ONLY_DESIGNS });
      test.skip(ids.length === 0 && !!ONLY_DESIGNS, 'none of the scoped designs is in this unit');
      // Unscoped, an empty unit means the catalog or the unit arithmetic broke, not a pass.
      expect(ids.length, `${label} holds no designs`).toBeGreaterThan(0);
      const rows = await paritySweep(page, browser, ids.map((id) => ({ kind: 'design', id })));
      await expectParity(label, rows, ids.length);
    });
  }

  for (let unit = 0; unit < CORPUS_UNITS; unit++) {
    const label = `SVG corpus unit ${unit + 1} of ${CORPUS_UNITS}`;
    test(`the shadow mount paints the light mount's frame, ${label}`, async ({ page, browser }) => {
      // The corpus is not catalog: a run scoped to some catalog designs leaves it out.
      test.skip(!!ONLY_DESIGNS, 'scoped to catalog designs');
      test.setTimeout(300_000);
      await toApp(page);
      const files = readdirSync(CORPUS_DIR).filter((file) => file.endsWith('.svg')).sort();
      const sources: ParitySource[] = [
        ...files.map((file) => ({ kind: 'svg' as const, name: file.replace(/\.svg$/, ''), source: readFileSync(`${CORPUS_DIR}${file}`, 'utf8') })),
        { kind: 'lottie' },
        STRETCH_PROBE,
      ].filter((_, i) => i % CORPUS_UNITS === unit);
      const rows = await paritySweep(page, browser, sources);
      // Some corpus files are refused at import on purpose (an external reference, a script):
      // those come back as build errors, which is the import road's verdict, not the mount's.
      const built = rows.filter((row) => !/^build: /.test(row.error ?? ''));
      expect(built.length, `${label}: most of the corpus did not even build`).toBeGreaterThan(sources.length / 2);
      await expectParity(label, rows, sources.length, { refusable: true });
    });
  }
});
