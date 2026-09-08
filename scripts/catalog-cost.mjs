#!/usr/bin/env node
// gate: none - reports what the next design costs and never gates, by its own header
// guards: src/templates/**
//
// WHAT THE NEXT DESIGN COSTS - the owner's question of 2026-09-04, answered as a number rather
// than a paragraph:
//
//   "one thing I want to make sure of before we implement more graphics is that it won't make
//    our site heavier. It won't make our CI and E2E tests take even longer, because right now
//    iteration speed is still more important than a broad template gallery."
//
//   npm run check:catalog-cost
//
// It REPORTS and never gates, like `check:freshness` (root AGENTS.md, verifying-changes rule 6):
// the point is a number somebody can read before agreeing to another weekly package of designs,
// and a red build would only teach people to stop reading it.
//
// THE THREE PLACES A DESIGN COSTS ANYTHING, and they are not the same kind of cost:
//
//   1. THE PRERENDER, paid by EVERY build including the one gating a one-line fix. One HTML page
//      per design, forever. Measured here, live, by running the real loader and the real page
//      loop out of scripts/prerender.mjs - not a copy of them, so this number cannot drift away
//      from what a build actually pays.
//   2. THE CLIENT BUNDLE, paid by whoever opens a page that pulls the chunk. `src/templates/
//      catalog.ts` carries static imports, so the question is which chunk the designs land in and
//      which of the ten pages hold that chunk in their FIRST PAYLOAD. Read off `dist/` when a
//      build is there, and the answer differs sharply by page - see `measureBundle`.
//   3. THE RENDERED CATALOG GATES, paid ONLY by a change that can move a design, and then only
//      for the designs it can move (scripts/catalog-affected.mjs). This is the O(designs) half,
//      and its slope comes from two real CI runs of the same workflow on the same runner class -
//      see RENDERED below.
//
// THE MECHANISM THAT KEEPS IT FLAT is `catalog-affected.mjs`, not a promise: an ordinary catalog
// change measures its own designs and pays the fixed overhead once, so the 332nd design adds
// nothing to it. The slope below only applies to a FULL sweep, which happens when a SHARED file
// changes - and that is the one case where measuring everything is the whole point.
import { readFile, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';

import { measured } from './measured.mjs';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const distDir = path.join(projectRoot, 'dist');

/**
 * THE CI SLOPE, MEASURED, not modelled.
 *
 * Two runs of `.github/workflows/catalog-gates.yml` on 2026-09-04, same workflow, same steps,
 * same runner class, differing only in how many designs they were scoped to - which is exactly
 * the A/B this number needs and the only pair of its kind that exists:
 *
 *   run 33896869659  the WHOLE catalog (it escalated by accident, which is what makes it useful)
 *                    - sweeps 657 s; emit 6 s + catalog specs 243 s
 *   run 33898338599  ONE design - sweeps 32 s; emit 2 s + catalog specs 39 s
 *   run 33900304138  ONE design, repeated - sweeps 31 s; emit 3 s + catalog specs 41 s
 *
 * The catalog held 502 designs through all three: the only src/templates commits that day were
 * comment edits to lt01, the scaffolding those runs used, since reverted. An individual sweep
 * prints a smaller denominator - `numerals` says "1 of 331 designs" - because each sweep has its
 * own idea of which designs it can measure at all. The line below is per CATALOG design, which
 * is the unit the question is asked in.
 *
 * Slope and intercept are the straight line through the full-catalog point and the mean of the
 * two one-design points. The two jobs run in PARALLEL, so wall clock follows the slower of them
 * while runner minutes are their sum; both are reported because they answer different questions.
 *
 * TO RE-MEASURE: `gh workflow run catalog-gates.yml --ref main -f designs=lt01`, then again with
 * `-f designs=all`, and read the step durations out of
 * `gh api repos/:owner/:repo/actions/runs/<id>/jobs`. Two runs, about fifteen minutes, no laptop.
 */
export const RENDERED = {
  measured: '2026-09-04',
  runs: [33896869659, 33898338599, 33900304138],
  designs: 502,
  /** Wall-clock seconds of the "Rendered catalog sweeps" step: type floor, overflow, field
   *  coverage, numerals. */
  sweeps: { full: 657, one: (32 + 31) / 2 },
  /** The sibling job: the emit fingerprints plus catalog-baseline.spec.ts. */
  specs: { full: 6 + 243, one: (2 + 39 + (3 + 41)) / 2 },
};

/** Seconds per design, and what is left over however few designs are in scope. */
export function slope({ full, one }, designs) {
  const perDesign = (full - one) / (designs - 1);
  return { perDesign, at: (n) => one + perDesign * (n - 1) };
}
export const SWEEPS = slope(RENDERED.sweeps, RENDERED.designs);
export const SPECS = slope(RENDERED.specs, RENDERED.designs);

const seconds = (ms) => ms / 1000;
const minutes = (s) => s / 60;
const kb = (bytes) => bytes / 1024;

/** Time the prerender exactly as a build runs it, split into its fixed and per-design halves. */
async function measurePrerender() {
  const { loadCatalogEntries, writeTemplatePages } = await import('./prerender.mjs');
  const t0 = performance.now();
  const entries = await loadCatalogEntries();
  const t1 = performance.now();
  // A throwaway directory, never dist/: this must not be able to leave a half-written prerender
  // behind for a build that ran before it and is about to be deployed.
  const out = mkdtempSync(path.join(tmpdir(), 'noacg-catalog-cost-'));
  try {
    await writeTemplatePages(entries, path.join(out, 'templates'));
  } finally {
    await rm(out, { recursive: true, force: true });
  }
  const t2 = performance.now();
  return { entries, loadSeconds: seconds(t1 - t0), pagesSeconds: seconds(t2 - t1) };
}

/**
 * Which built chunks carry the designs, and whether the entry HTML pulls them on first paint.
 *
 * Attribution is by counting the design ids that survive minification as string literals. It is
 * a lower bound rather than an exact byte split - a chunk holds shared code too - which is
 * enough for the question actually being asked: are the designs in the chunk every visitor
 * downloads, or in one that loads when somebody opens the catalog.
 *
 * ALL THREE QUOTE CHARACTERS, and the backtick is the one that matters: the minifier rewrites
 * `id: 'lt01'` to id:`lt01`, so a check looking only for the quotes the SOURCE uses finds
 * nothing and reports the catalog as absent from a bundle it is plainly in.
 *
 * "FIRST PAYLOAD" MEANS STATICALLY REACHABLE from a page's own script tag, walked transitively. A
 * chunk the entry reaches only through `await import(...)` is not part of the first payload
 * however certain it is to be fetched a moment later, and calling those the same thing would
 * answer the wrong question: the studio's App chunk IS dynamically imported, right after boot, on
 * every visit to /app.
 *
 * EVERY PAGE, enumerated from `dist/` rather than named. This is a ten-page MPA and the first
 * version of this check looked at `index.html` and `app.html` only - which reported the catalog
 * as absent from every first payload while `/ograf` was statically pulling 3.7 MB of it from its
 * own entry chunk. A hardcoded page list answers for the pages somebody remembered.
 */
export const QUOTES = ['"', "'", '`'];

/** Static imports only: `from"./x.js"` and a bare `import"./x.js"`, never `import("./x.js")`. */
export const STATIC_IMPORT = /(?:from|\bimport)\s*["'`](\.\/[^"'`]+\.js)["'`]/g;

async function measureBundle(ids) {
  const assets = path.join(distDir, 'assets');
  let files;
  try {
    files = (await readdir(assets)).filter((f) => f.endsWith('.js'));
  } catch {
    return null;
  }
  // ONE READ PER CHUNK, keeping the two small facts rather than the text. This build ships 135
  // chunks and 22 MB of JavaScript, most of it Monaco's language definitions, and both passes
  // below want something out of every one of them.
  const chunk = new Map();
  for (const file of files) {
    const body = await readFile(path.join(assets, file), 'utf8');
    chunk.set(file, {
      imports: [...body.matchAll(STATIC_IMPORT)].map(([, spec]) => path.basename(spec)),
      ids: ids.filter((id) => QUOTES.some((q) => body.includes(`${q}${id}${q}`))).length,
      bytes: (await stat(path.join(assets, file))).size,
    });
  }

  // Every chunk a page's own <script src> pulls in without asking for it, per page - WHICH page
  // is the useful half of the answer, not just whether some page does it.
  const eagerFor = new Map();
  for (const page of (await readdir(distDir)).filter((f) => f.endsWith('.html'))) {
    const html = await readFile(path.join(distDir, page), 'utf8');
    const seen = new Set();
    const queue = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map(([, src]) => path.basename(src));
    while (queue.length) {
      const file = queue.pop();
      if (seen.has(file) || !chunk.has(file)) continue;
      seen.add(file);
      queue.push(...chunk.get(file).imports);
    }
    eagerFor.set(page, seen);
  }

  return [...chunk]
    // A couple of ids is a cross-reference, not the catalog.
    .filter(([, c]) => c.ids >= 5)
    .map(([file, c]) => ({
      file,
      ids: c.ids,
      bytes: c.bytes,
      pages: [...eagerFor].filter(([, seen]) => seen.has(file)).map(([page]) => page),
    }))
    .sort((a, b) => b.ids - a.ids);
}

function line(label, value) {
  console.log(`  ${label.padEnd(26)}${value}`);
}

/**
 * WHICH BUILD the bundle half just measured. `dist/` is whatever was built last, which on a
 * worktree that has moved on is a different commit from the one being asked about - and a stale
 * number read as a current one is the failure a report like this has to be least able to cause.
 */
async function builtFrom() {
  try {
    const v = JSON.parse(await readFile(path.join(distDir, 'version.json'), 'utf8'));
    const at = v.builtAt ? ` built ${v.builtAt}` : '';
    return `${v.ref ?? 'unknown ref'}@${(v.commit ?? '').slice(0, 10) || 'unknown'}${at}`;
  } catch {
    return null;
  }
}

async function main() {
  const { entries, loadSeconds, pagesSeconds } = await measurePrerender();
  const n = entries.length;
  // Every number below is per design, so an empty catalog does not report a cost of nothing - it
  // divides by zero and prints "design 1 costs NaN ms" as if that were an answer.
  measured(n, 'catalog designs');
  const ids = entries.map((e) => e.variant.id);
  const perPageMs = (pagesSeconds * 1000) / n;

  console.log(`\nCATALOG COST - what design ${n + 1} adds to a CI run. ${n} designs today.\n`);

  console.log('EVERY BUILD pays this, whatever changed:');
  line('prerender, catalog load', `${loadSeconds.toFixed(1)} s   fixed, does not grow`);
  line('prerender, one page each', `${pagesSeconds.toFixed(1)} s for ${n} pages -> ${perPageMs.toFixed(1)} ms/design`);

  const carriers = await measureBundle(ids);
  if (!carriers) {
    line('client bundle', 'no dist/ - run `npm run build` first for this half');
  } else if (carriers.length === 0) {
    line('client bundle', 'no chunk carries design ids - unexpected, check the attribution');
  } else {
    line('client bundle, from', (await builtFrom()) ?? 'dist/, which carries no version stamp');
    for (const c of carriers) {
      line(
        c.pages.length ? 'bundle, FIRST PAYLOAD' : 'bundle, on demand',
        `${c.file}  ${kb(c.bytes).toFixed(0)} KB, ${c.ids} design ids -> ${(kb(c.bytes) / c.ids).toFixed(1)} KB/design` +
          (c.pages.length ? `  on ${c.pages.join(', ')}` : ''),
      );
    }
  }

  const sweeps = SWEEPS.at(n);
  const specs = SPECS.at(n);
  const perDesign = SWEEPS.perDesign + SPECS.perDesign;
  console.log('\nONLY A CATALOG CHANGE pays this, and only for the designs it can move');
  console.log(`(measured ${RENDERED.measured} on catalog-gates runs ${RENDERED.runs.join(', ')}):`);
  line('one design', `${minutes(SWEEPS.at(1)).toFixed(1)} min wall - the ordinary case, and it does not grow`);
  line(
    'the whole catalog',
    `${minutes(Math.max(sweeps, specs)).toFixed(1)} min wall, ${minutes(sweeps + specs).toFixed(1)} runner min - only when a SHARED file changes`,
  );
  line('marginal, full sweep', `${SWEEPS.perDesign.toFixed(2)} s wall, ${perDesign.toFixed(2)} s runner`);

  console.log(`\nTHE ANSWER: design ${n + 1} costs ${perPageMs.toFixed(1)} ms on every build and`);
  console.log(`${SWEEPS.perDesign.toFixed(1)} s on a FULL catalog sweep. It costs NOTHING on an ordinary`);
  console.log('catalog change, because scripts/catalog-affected.mjs scopes that run to the designs the');
  console.log(
    `change can move. At 600 designs a full sweep would be ${minutes(SWEEPS.at(600)).toFixed(1)} min wall,`,
  );
  console.log(`against ${minutes(Math.max(sweeps, specs)).toFixed(1)} today.\n`);
  return 0;
}

process.exitCode = await main();
