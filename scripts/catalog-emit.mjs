// EMITTING THE WHOLE CATALOG WITHOUT THE DEV SERVER, THE APP, OR ONE IFRAME PER DESIGN.
//
// `variant.create({})` builds strings, and the fingerprint gate over those strings
// (e2e/catalog-baseline.spec.ts, "every catalog variant emits byte-identical code") used to be
// reachable only through a Playwright spec: boot Vite, load /app, import the catalog through the
// dev server's module graph, then evaluate. That is minutes of machine time to answer a question
// about text.
//
// IT STILL NEEDS A DOM, AND THAT IS NOT AN OVERSIGHT. Creating a design applies its motion
// preset, and `blocks/presetRegistry.ts` resolves the design's own class prefix and SVG layers by
// PARSING the html it just emitted (`model/structure.ts` detectPrefix / svgLayerSelectors, both
// `new DOMParser()`) rather than by pattern-matching text - deliberately, because a prefix is a
// DOM fact. Measured 2026-08-29: all 504 catalog designs fail in bare Node with
// `ReferenceError: DOMParser is not defined`, so "emit the catalog in a node test" is not a thing
// that can be done honestly without either a new HTML-parser dependency or a hand-rolled parser
// whose disagreements with Chromium would be silent.
//
// What CAN go is everything else. Rolldown (already this repo's bundler) turns the catalog into
// one browser script in ~0.15 s, Playwright's Chromium opens a blank page in ~0.15 s, and the 504
// designs emit in ~2 s. Total: about two and a half seconds against a Playwright spec run, for
// exactly the same answer - the DOM is a real Chromium DOM, so there is no fidelity trade at all.
//
// WHAT THIS IS NOT: a second source of truth. The browser spec compares the SAME
// `e2e/catalog-baseline.json`, so if this path and the Vite-served one ever disagreed about what
// a design emits, one of the two would go red against the shared file. And it is not a RENDERED
// measurement: what a design looks like once laid out still needs a real page (the render
// baseline, the four sweeps, the calibration tripwire).
//
// Usage:
//   node scripts/catalog-emit.mjs                 # id, category and pane hashes, one line each
//   node scripts/catalog-emit.mjs --only lt01,sb14
//   node scripts/catalog-emit.mjs --json          # the full records as JSON on stdout
//   import { emitCatalog, fingerprints } from './catalog-emit.mjs'
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { rolldown } from 'rolldown';
import { parseOnly } from './catalog-scope.mjs';
import { rawSuffix } from './rolldown-raw.mjs';

const CATALOG_ENTRY = fileURLToPath(new URL('../src/templates/catalog.ts', import.meta.url));

/** The 16-hex-char fingerprint the baseline is written in (e2e/catalog-baseline.spec.ts). */
export const hash = (s) => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16);

/** One module of the catalog's graph as a self-contained browser script, exposed as
 *  `window[globalName]`. */
async function bundleModule(entry, globalName) {
  const bundle = await rolldown({
    input: entry,
    platform: 'browser',
    plugins: [rawSuffix],
    logLevel: 'silent',
  });
  const { output } = await bundle.generate({ format: 'iife', name: globalName, codeSplitting: false });
  await bundle.close();
  return output[0].code;
}

/**
 * Open ONE blank Chromium page with each `{ entry, globalName }` bundled onto it, and hand the
 * page to `fn`.
 *
 * The DOM is the whole point (see the header): anything that CREATES a design parses the html it
 * just emitted, and the search index is built out of created designs, so a question about either
 * needs a real DOM. Chromium's is the honest one and costs about a second.
 *
 * It takes a LIST because a caller often needs two modules of the same graph on one page — the
 * search engine and the metadata validator, say — and launching a second browser to ask the
 * second question would double the cost of the answer.
 *
 * @template T
 * @param {{ entry: string, globalName: string }[]} specs modules to bundle, in load order
 * @param {(page: import('@playwright/test').Page) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withBundledPage(specs, fn) {
  // Independent, so overlapped: the bundles do not need the browser and the browser does not
  // need them, and this is the one function every fast catalog gate goes through.
  const [scripts, browser] = await Promise.all([
    Promise.all(specs.map((s) => bundleModule(s.entry, s.globalName))),
    chromium.launch(),
  ]);
  try {
    const page = await browser.newPage();
    for (const content of scripts) await page.addScriptTag({ content });
    return await fn(page);
  } finally {
    await browser.close();
  }
}

/**
 * Open ONE blank Chromium page with the bundled catalog on it and hand it to `fn`.
 *
 * Exported because a caller that wants two answers (the whole catalog's names AND one slice's
 * emitted code) should pay for the bundle and the browser once, not twice.
 *
 * @template T
 * @param {(page: import('@playwright/test').Page) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withCatalogPage(fn) {
  return withBundledPage([{ entry: CATALOG_ENTRY, globalName: 'NOACG_CATALOG' }], fn);
}

/**
 * THE EMIT, as a string evaluated in the page. Mirrors the `EMIT` snippet in
 * e2e/catalog-baseline.spec.ts exactly, including the sort, so the two can be compared against
 * one baseline file.
 */
const EMIT_IN_PAGE = (wanted) => {
  const want = wanted ? new Set(wanted) : null;
  const out = [];
  for (const [category, variants] of Object.entries(window.NOACG_CATALOG.CATALOG)) {
    for (const variant of variants ?? []) {
      if (want && !want.has(variant.id)) continue;
      try {
        const tpl = variant.create({});
        out.push({
          id: variant.id,
          category,
          name: variant.name,
          templateName: tpl.name,
          html: tpl.html,
          css: tpl.css,
          js: tpl.js,
          error: null,
        });
      } catch (e) {
        out.push({
          id: variant.id,
          category,
          name: variant.name,
          templateName: null,
          html: '',
          css: '',
          js: '',
          error: String(e),
        });
      }
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
};

/** The index: `{ id, category, name }` for every design, without creating anything. */
const INDEX_IN_PAGE = () => {
  const out = [];
  for (const [category, variants] of Object.entries(window.NOACG_CATALOG.CATALOG)) {
    for (const variant of variants ?? []) out.push({ id: variant.id, category, name: variant.name });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
};

export { EMIT_IN_PAGE, INDEX_IN_PAGE };

/**
 * @typedef {object} EmittedVariant
 * @property {string} id         the catalog id (lt01, sb14, …)
 * @property {string} category   the wizard category it browses under
 * @property {string} name       the Browse card's name
 * @property {string|null} templateName  the name of the template `create` returned
 * @property {string} html
 * @property {string} css
 * @property {string} js
 * @property {string|null} error `create` threw - every other field is empty
 */

/**
 * Every catalog variant, created at its own defaults, sorted by id.
 *
 * Mirrors the `EMIT` snippet in e2e/catalog-baseline.spec.ts exactly, including the sort, so the
 * two can be compared against one baseline file.
 *
 * @param {{ only?: Iterable<string>|null }} [opts] restrict to these ids (the affected slice)
 * @returns {Promise<EmittedVariant[]>}
 */
export async function emitCatalog({ only = null } = {}) {
  return withCatalogPage((page) => page.evaluate(EMIT_IN_PAGE, only ? [...only] : null));
}

/**
 * Every design the catalog ships: `{ id, category, name }`, sorted by id. Cheaper than
 * `emitCatalog` (nothing is created), and it is what the affected-slice derivation reads to
 * decide whether a changed file names designs that actually exist.
 *
 * @returns {Promise<{ id: string, category: string, name: string }[]>}
 */
export async function catalogIndex() {
  return withCatalogPage((page) => page.evaluate(INDEX_IN_PAGE));
}

/**
 * The pane fingerprints, in the shape `e2e/catalog-baseline.json` stores them.
 *
 * @param {EmittedVariant[]} emitted
 * @returns {Record<string, { html: string, css: string, js: string }>}
 */
export function fingerprints(emitted) {
  const out = {};
  for (const e of emitted) out[e.id] = { html: hash(e.html), css: hash(e.css), js: hash(e.js) };
  return out;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
// Normalized both sides, like scripts/catalog-affected.mjs and scripts/e2e-affected.mjs: on
// Windows a drive-letter-case or separator difference makes a raw string comparison fail, and a
// failure here exits 0 having printed nothing - which reads exactly like a pass.
const isEntrypoint =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1]).replaceAll('\\', '/').toLowerCase() ===
    resolve(fileURLToPath(import.meta.url)).replaceAll('\\', '/').toLowerCase();

if (isEntrypoint) {
  const args = process.argv.slice(2);
  const { ids: only } = parseOnly(args);
  const started = Date.now();
  const emitted = await emitCatalog({ only });
  if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify(emitted, null, 1)}\n`);
  } else {
    const f = fingerprints(emitted);
    for (const e of emitted) {
      console.log(
        `${e.id.padEnd(9)} ${e.category.padEnd(18)} ${f[e.id].html} ${f[e.id].css} ${f[e.id].js}` +
          (e.error ? `  ERROR ${e.error}` : ''),
      );
    }
    console.log(`\n${emitted.length} variants emitted in ${((Date.now() - started) / 1000).toFixed(1)}s (no dev server).`);
  }
}
