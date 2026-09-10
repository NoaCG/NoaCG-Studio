// The BROWSER-ENGINE FLOOR sweep: builds every catalog variant and reports, per design, every
// CSS or JS feature that a given playout engine's browser is too old to understand.
//
// WHY IT EXISTS. A playout application embeds its own copy of Chromium, frozen at whatever the
// host app shipped with, and a declaration it does not know is DROPPED — silently and
// completely. The 2026-08-06 acceptance pass found the Arena Quiz board on air as "just the blue
// line and the numbers", because every answer chip is filled with `color-mix()` (Chromium 111)
// and that server's engine had never heard of it. Nothing warned, because nothing was looking.
//
// WHAT IT GATES ON. `SUPPORTED_FLOOR` in src/validation/engineSupport.ts — Chromium 117, which
// is CasparCG 2.4, the server the maintainer's school runs productions on. That is the default
// bar here, so a bare run answers the question that actually matters. Everything else measured
// (a current OBS at 127, CasparCG 2.5 at 142) sits above it; the 2.3 rows sit below it and are
// reported honestly rather than hidden.
//
// It MEASURES rather than listing known-bad designs, for the same reason field-coverage.mjs
// renders instead of grepping for `id="fN"`: a hand-maintained list of names is wrong the day
// after it is written, and it can only ever describe the designs somebody already noticed.
//
// The scanner itself is src/validation/engineSupport.ts — the SAME module the export flow shows
// its verdict from, so the gate and the user-facing warning can never disagree.
//
// Usage (dev server must be running for this checkout — scripts/dev-port.mjs):
//   node scripts/engine-floor.mjs                        # every design, against the FLOOR
//   node scripts/engine-floor.mjs --engine casparcg-23   # against another engine
//   node scripts/engine-floor.mjs --chromium 80          # against a bare Chromium version
//   node scripts/engine-floor.mjs quiz                   # one category
//   node scripts/engine-floor.mjs --json out.json        # machine-readable report
//   node scripts/engine-floor.mjs --fail                 # exit 1 when anything is unsupported
//
// It still REPORTS by default and exits 0, so pointing it at an engine BELOW the floor stays a
// question you can ask without failing anything. `--fail` is the gate, and the nightly catalog
// job runs it at the default bar — the catalogue clears 117 today, so the line is holdable.

import { chromium as playwrightChromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { devPort } from './dev-port.mjs';

const argv = process.argv.slice(2);
const VALUE_FLAGS = ['--json', '--engine', '--chromium'];
const flagValueAt = new Set(argv.flatMap((a, i) => (VALUE_FLAGS.includes(a) ? [i + 1] : [])));
const flag = (name) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : null;
};
const only = argv.find((a, i) => !a.startsWith('-') && !flagValueAt.has(i)) ?? null;
const jsonPath = flag('--json');
// No --engine given means "the bar we actually hold": SUPPORTED_FLOOR, resolved in the browser
// alongside the engine table so the number has exactly one home.
const engineId = flag('--engine');
const chromiumFlag = flag('--chromium');
const shouldFail = argv.includes('--fail');

const browser = await playwrightChromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
await page.goto(`http://localhost:${devPort()}/app`, { waitUntil: 'domcontentloaded' });

await page.evaluate(async () => {
  window.__cat = await import('/src/templates/catalog.ts');
  window.__wiz = await import('/src/model/wizard.ts');
  window.__eng = await import('/src/validation/engineSupport.ts');
});

// Resolve the bar in the browser, so the engine table has exactly one home.
const bar = await page.evaluate(
  ({ engineId, chromiumFlag }) => {
    if (chromiumFlag) return { label: `Chromium ${chromiumFlag}`, chromium: Number(chromiumFlag) };
    if (!engineId) {
      const floor = window.__eng.PLAYOUT_ENGINES.find((e) => e.chromium === window.__eng.SUPPORTED_FLOOR);
      return { label: `the supported floor${floor ? ` — ${floor.label}` : ''}`, chromium: window.__eng.SUPPORTED_FLOOR };
    }
    const engine = window.__eng.PLAYOUT_ENGINES.find((e) => e.id === engineId);
    return engine ? { label: engine.label, chromium: engine.chromium } : null;
  },
  { engineId, chromiumFlag },
);
if (!bar) {
  const ids = await page.evaluate(() => window.__eng.PLAYOUT_ENGINES.map((e) => e.id).join(', '));
  console.error(`Unknown engine "${engineId}". Known: ${ids}`);
  await browser.close();
  process.exit(2);
}
if (bar.chromium === null) {
  console.error(`"${bar.label}" has no fixed engine version — nothing to measure against.`);
  await browser.close();
  process.exit(2);
}

const targets = await page.evaluate(
  (only) =>
    window.__wiz.CATEGORIES.filter((c) => !only || c.id === only).flatMap((c) =>
      (window.__cat.CATALOG[c.id] || []).map((v) => ({ id: v.id, cat: c.id, name: v.name })),
    ),
  only,
);
if (!targets.length) {
  console.error(only ? `No variants for category "${only}".` : 'No variants found.');
  await browser.close();
  process.exit(2);
}

// Batched, because building 400+ templates in one evaluate is a single long task the page
// cannot be interrupted out of — the same reason the other sweeps batch.
const BATCH = 25;
const results = [];
for (let i = 0; i < targets.length; i += BATCH) {
  const batch = targets.slice(i, i + BATCH);
  const part = await page.evaluate(
    ({ batch, floor }) =>
      batch.map(({ id, cat, name }) => {
        try {
          const variant = window.__cat.variantById(id);
          const support = window.__eng.scanEngineSupport(variant.create({}));
          return {
            id,
            cat,
            name,
            minChromium: support.minChromium,
            // Only what THIS bar cannot render, and only what actually costs the picture —
            // a cosmetic or shimmed finding is listed by the app but never counts as a failure,
            // and the gate must not disagree with the surface it shares a scanner with.
            missing: support.findings
              .filter((f) => f.feature.since > floor && window.__eng.raisesTheBar(f.feature.effect))
              .map((f) => ({
                feature: f.feature.id,
                label: f.feature.label,
                since: f.feature.since,
                where: f.feature.where,
                effect: f.feature.effect,
                line: f.line,
                source: f.source,
              })),
            error: null,
          };
        } catch (e) {
          return { id, cat, name, minChromium: null, missing: [], error: String((e && e.message) || e) };
        }
      }),
    { batch, floor: bar.chromium },
  );
  results.push(...part);
  process.stdout.write(`\r  scanned ${results.length}/${targets.length}`);
}
process.stdout.write('\n');
await browser.close();

// ── The report ─────────────────────────────────────────────────────────────────────────────
const built = results.filter((r) => !r.error);
const broke = results.filter((r) => r.error);
const affected = built.filter((r) => r.missing.length > 0);
const blank = affected.filter((r) => r.missing.some((m) => m.effect === 'kills-the-file'));

console.log(`\nBrowser-engine floor — ${bar.label} (Chromium ${bar.chromium})`);
console.log(`  ${built.length} designs scanned${broke.length ? `, ${broke.length} failed to build` : ''}`);
console.log(`  ${affected.length} use something it cannot render; ${blank.length} of those would render BLANK\n`);

// By FEATURE first: this is the number that decides whether one systemic fix is worth it.
const byFeature = new Map();
for (const r of affected) {
  for (const m of r.missing) {
    const row = byFeature.get(m.feature) ?? { label: m.label, since: m.since, effect: m.effect, designs: [] };
    row.designs.push(r.id);
    byFeature.set(m.feature, row);
  }
}
const ranked = [...byFeature.entries()].sort((a, b) => b[1].designs.length - a[1].designs.length);
console.log('BY FEATURE — how many designs each one costs:');
for (const [id, row] of ranked) {
  const kills = row.effect === 'kills-the-file' ? '  ← the whole graphic goes blank' : '';
  console.log(`  ${String(row.designs.length).padStart(4)}  ${row.label} (Chromium ${row.since})${kills}`);
  console.log(`        ${id}`);
}

console.log('\nBY DESIGN:');
for (const r of affected.sort((a, b) => b.minChromium - a.minChromium)) {
  const worst = r.missing.some((m) => m.effect === 'kills-the-file') ? 'BLANK ' : 'partial';
  console.log(`  ${worst} ${r.id.padEnd(8)} ${r.name} — needs Chromium ${r.minChromium}`);
  for (const m of r.missing) console.log(`            ${m.label} (${m.since}, ${m.where} line ${m.line}): ${m.source}`);
}

for (const r of broke) console.log(`  BUILD FAILED ${r.id}: ${r.error}`);

if (jsonPath) {
  writeFileSync(jsonPath, JSON.stringify({ engine: bar, results }, null, 2));
  console.log(`\nWrote ${jsonPath}`);
}

// A design that will not BUILD is a real failure whatever the flags say — the sweep could not
// measure it, which is not the same as it being fine.
if (broke.length) process.exit(1);
process.exit(shouldFail && affected.length ? 1 : 0);
