// gate: factory
// needs: browser
// guards: src/blocks/edit.ts, src/templates/catalog.ts, src/templates/**
//
// The catalog-line add (src/blocks/edit.ts addCatalogLine, live through blocks/baseEdits.ts's
// text tool) is gated on the standard line SHAPE, never the category. Fixed contracts and
// data-driven categories fail the shape gate, and the editor then refuses the add with the
// reason: a definition-only field nothing shows is the silent on-air no-op this gate exists to
// end. A scoreboard's cells are a grid ({p}-team / {p}-score, not the line ladder), a quiz's
// rows are their own shape, a ticker's lines live in one hidden textarea source.
//
// A factory gate rather than a build one: `variant.create()` parses the html it emits with
// `DOMParser`, so the bundled modules run in one blank Chromium page (the wizard-draft.test.mjs
// pattern, loaded through scripts/wizard-load.mjs). This was e2e/ux.spec.ts's case until the
// gate ran here (#800).
//
//   node --test scripts/catalog-line-gate.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { wizardBrowserScript as browserScript } from './wizard-load.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (relative) => path.join(projectRoot, 'src', relative);

test('the catalog-line add is gated on the standard line SHAPE, never the category', async () => {
  // Bundled before the browser starts, so a bundle that fails leaves no Chromium behind.
  const scripts = await Promise.all([
    browserScript(src('templates/catalog.ts'), 'NOACG_CATALOG'),
    browserScript(src('blocks/edit.ts'), 'NOACG_EDIT'),
  ]);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const content of scripts) await page.addScriptTag({ content });
    const result = await page.evaluate(() => {
      const { variantById } = window.NOACG_CATALOG;
      const { addCatalogLine } = window.NOACG_EDIT;
      const tryAdd = (id) =>
        addCatalogLine(variantById(id).create({}), { title: 'Extra', ftype: 'textfield' }) !== null;
      return {
        lowerThird: tryAdd('lt01'),
        infoCard: tryAdd('card01'),
        scoreboard: tryAdd('sb01'),
        quiz: tryAdd('qz01'),
        ticker: tryAdd('tk01'),
      };
    });
    assert.deepEqual(result, { lowerThird: true, infoCard: true, scoreboard: false, quiz: false, ticker: false });
  } finally {
    await browser.close();
  }
});
