// gate: workflow ci.yml
// guards: src/templates/**, scripts/catalog-emit.mjs
//
// THE SOURCE HALF OF THE CATALOG BASELINE, IN TWO AND A HALF SECONDS.
//
// Three of the four gates in e2e/catalog-baseline.spec.ts ask questions about TEXT - the emitted
// html/css/js of every design - and needed a Playwright spec, a Vite dev server and a full /app
// boot to ask them. This runs the same three against the same committed baseline file, with
// nothing but a Rolldown bundle and a blank Chromium page (scripts/catalog-emit.mjs explains why
// a page is still needed at all).
//
//   1. every design emits byte-identical code   -> e2e/catalog-baseline.json
//   2. no design hides a data holder inline     -> the canvas reset wipes it and the value airs
//   3. no two designs share a name              -> Browse cannot tell them apart
//
// The FOURTH gate in that spec - what the design LOOKS like once a browser has laid it out - is
// not here and cannot be: it is a rendered measurement.
//
// Usage:
//   node scripts/check-catalog-emit.mjs                  # the whole catalog
//   node scripts/check-catalog-emit.mjs --only lt01,lt02 # one slice (scripts/catalog-affected.mjs)
//   UPDATE_CATALOG_BASELINE=1 node scripts/check-catalog-emit.mjs   # re-record on purpose
//
// SCOPING IS SAFE HERE IN BOTH DIRECTIONS. A scoped run compares the slice against the baseline
// AND the baseline's rows for those ids against what was emitted, so a design added or deleted
// inside the slice is caught. What only a FULL run can catch is a design appearing or vanishing
// with no file in the diff naming it - which is why the whole-set comparison below runs only
// without --only, and why scripts/catalog-affected.mjs escalates to the whole catalog for any
// change it cannot attribute to specific designs.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EMIT_IN_PAGE, INDEX_IN_PAGE, fingerprints, withCatalogPage } from './catalog-emit.mjs';
import { parseOnly } from './catalog-scope.mjs';
import { measured } from './measured.mjs';

const BASELINE = fileURLToPath(new URL('../e2e/catalog-baseline.json', import.meta.url));
const UPDATE = process.env.UPDATE_CATALOG_BASELINE === '1';

const args = process.argv.slice(2);
const { ids: only } = parseOnly(args);
// A BASELINE IS A CLAIM ABOUT EVERY ROW IN IT, so one written from a slice would drop every id the
// slice did not name and retire the gate for the rest of the catalog. Both ways of writing one -
// an explicit re-record and the first-run bootstrap - are refused here, before any browser time is
// spent, rather than after the emit.
if (only && (UPDATE || !existsSync(BASELINE))) {
  console.error(
    UPDATE
      ? 'Refusing to re-record the baseline from a --only run - re-record the whole catalog.'
      : 'There is no baseline yet, and a --only run would record one holding just the slice. Run without --only.',
  );
  process.exit(2);
}

const started = Date.now();
const { emitted, index } = await withCatalogPage(async (page) => ({
  emitted: await page.evaluate(EMIT_IN_PAGE, only),
  // On a full run the emit already carries `{ id, category, name }` for every design, so the
  // second whole-catalog walk is only worth paying for when a slice made the emit narrow.
  index: only ? await page.evaluate(INDEX_IN_PAGE) : null,
}));

measured(emitted.length, 'catalog variants emitted');

const allDesigns = index ?? emitted;
const scope = only ? `${emitted.length} of ${allDesigns.length} designs` : `${emitted.length} designs`;
const problems = [];

// ── 0. create() must not throw ───────────────────────────────────────────────
if (only) {
  const missing = only.filter((id) => !emitted.some((e) => e.id === id));
  if (missing.length) {
    problems.push(
      `--only named ${missing.length} id(s) the catalog does not ship: ${missing.join(', ')}.\n` +
        '  A design that was RENAMED or DELETED is a whole-catalog change: re-run without --only.',
    );
  }
}
const threw = emitted.filter((e) => e.error);
if (threw.length) {
  problems.push(`${threw.length} design(s) threw while being created:\n${threw.map((e) => `  ${e.id}: ${e.error}`).join('\n')}`);
}

// ── 1. the emitted-code fingerprints ─────────────────────────────────────────
const actual = fingerprints(emitted);

// A design that threw emits three empty panes, so recording now would store hash('') for it and
// every later run would compare against that and pass. The spec this replaces asserts the same
// thing before its write block; so does this.
if (problems.length && (UPDATE || !existsSync(BASELINE))) {
  console.error('\nRefusing to record a baseline while there are problems to report:\n');
  for (const p of problems) console.error(`${p}\n`);
  process.exit(1);
}
if (UPDATE || !existsSync(BASELINE)) {
  writeFileSync(
    BASELINE,
    `${JSON.stringify(
      {
        $comment:
          'Emitted-code fingerprints for every catalog variant at its own defaults. ' +
          'Re-record with UPDATE_CATALOG_BASELINE=1 and let the diff be the review. ' +
          'Compared by scripts/check-catalog-emit.mjs (fast) and e2e/catalog-baseline.spec.ts (in the suite).',
        variants: actual,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  console.log(`Recorded ${emitted.length} variants into e2e/catalog-baseline.json.`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')).variants;
// THE OTHER HALF OF THE COMPARISON, and the half that can go missing without a word: the branch
// above re-records whatever the tree emits whenever the baseline file is absent, so a deleted or
// renamed `variants` key would leave this gate comparing 502 designs against nothing and exiting
// green. Reported here on the comparison path only - the bootstrap has no baseline to report.
measured(Object.keys(baseline ?? {}).length, 'baseline variants');

if (!only) {
  const was = Object.keys(baseline).sort();
  const now = Object.keys(actual).sort();
  const added = now.filter((id) => !baseline[id]);
  const gone = was.filter((id) => !actual[id]);
  if (added.length || gone.length) {
    problems.push(
      'The set of catalog designs changed - that must be a visible decision, never a silent pass.\n' +
        (added.length ? `  added:   ${added.join(', ')}\n` : '') +
        (gone.length ? `  removed: ${gone.join(', ')}\n` : '') +
        '  If it was the point, re-record with UPDATE_CATALOG_BASELINE=1 and review the JSON diff.',
    );
  }
} else {
  const gone = only.filter((id) => baseline[id] && !actual[id]);
  if (gone.length) problems.push(`These ids are in the baseline but the catalog no longer ships them: ${gone.join(', ')}.`);
}

const drifted = [];
for (const e of emitted) {
  const was = baseline[e.id];
  if (!was) {
    if (only) drifted.push(`${e.id} (${e.category}): NEW - no baseline row`);
    continue;
  }
  const panes = ['html', 'css', 'js'].filter((p) => was[p] !== actual[e.id][p]);
  if (panes.length) drifted.push(`${e.id} (${e.category}): ${panes.join(', ')}`);
}
if (drifted.length) {
  problems.push(
    `Emitted code moved in ${drifted.length} design(s):\n${drifted.map((d) => `  ${d}`).join('\n')}\n` +
      '  If that was the point, re-record with UPDATE_CATALOG_BASELINE=1 (whole catalog) and\n' +
      '  review the JSON diff. Dump the panes with: node scripts/catalog-emit.mjs --json',
  );
}

// ── 2. a hidden data holder is a CSS rule, never an inline style ─────────────
//
// The canvas returns a graphic to rest by clearing GSAP's inline properties over the whole root
// subtree (preview/simulatorRuntime.ts resetGraphicInline), which wipes the style attribute - and
// the holder then draws its raw value on screen. `<img id="fN">` is the deliberate exception: an
// empty image slot hides itself inline through setFieldValue and the reset restates exactly that.
const inlineHidden = /<(?!img\b)[a-z]+[^>]*\bid="f\d+"[^>]*style="[^"]*display:\s*none/gi;
const holders = [];
for (const e of emitted) {
  for (const match of e.html.match(inlineHidden) ?? []) holders.push(`${e.id} (${e.category}): ${match.trim()}`);
}
if (holders.length) {
  problems.push(
    `${holders.length} hidden data holder(s) use an inline display:none:\n${holders.map((h) => `  ${h}`).join('\n')}\n` +
      '  Give them class="noacg-data-source" (templates/shared/base.ts) - an inline style is wiped\n' +
      '  by the canvas entrance reset and the value appears on air.',
  );
}

// ── 3. no two designs share a name, and a card matches its template ──────────
//
// Checked over the WHOLE index even in a scoped run: a collision is a fact about two designs, and
// the second one is exactly the design a scoped run would not have looked at. It costs nothing -
// `variant.name` needs no `create`.
const byName = new Map();
for (const v of allDesigns) byName.set(v.name, [...(byName.get(v.name) ?? []), `${v.id} (${v.category})`]);
const collisions = [...byName.entries()].filter(([, ids]) => ids.length > 1).map(([name, ids]) => `"${name}": ${ids.join(' + ')}`);
if (collisions.length) {
  problems.push(
    `Two designs carry the same catalog name:\n${collisions.map((c) => `  ${c}`).join('\n')}\n` +
      '  Rename the one whose category the name fits worse - Browse cannot tell them apart, and a\n' +
      '  production holding both renames one in the operator\'s rundown.',
  );
}
const nameDrift = emitted
  .filter((e) => e.templateName !== null && e.templateName !== e.name)
  .map((e) => `${e.id}: card "${e.name}" vs template "${e.templateName}"`);
if (nameDrift.length) {
  problems.push(
    `A design's card name and the template it creates disagree:\n${nameDrift.map((n) => `  ${n}`).join('\n')}\n` +
      '  The user picks by the first and operates by the second.',
  );
}

// ── the verdict ─────────────────────────────────────────────────────────────
const secs = ((Date.now() - started) / 1000).toFixed(1);
if (!problems.length) {
  console.log(`Catalog emit - PASS (${scope}, ${secs}s, no dev server).`);
  process.exit(0);
}
console.error(`\nCatalog emit - FAIL (${scope}, ${secs}s)\n`);
for (const p of problems) console.error(`${p}\n`);
process.exit(1);
