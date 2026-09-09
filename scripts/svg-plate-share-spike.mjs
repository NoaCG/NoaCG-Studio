// THE PLATE SPIKE - how big is a background plate, measured over the SVG corpus?
//
// Why this exists: the mapping step's unmatched notice counts every unclaimed drawing an empty
// role could take, and on a vote board an empty gauge role pools every plain rectangle in the
// file. A full-bleed plate, a rule and a panel behind the rows are all counted, so the reader is
// told the file has layers nothing is using and sent hunting for layers that do not exist
// (docs/acceptance/owner-queue/2026-09-09-c-the-unmatched-count-stops-naming-plates.md).
//
// Excluding a plate needs a number, and a guessed number is how you get a rule that throws away
// somebody's bar. This prints the DISTRIBUTION the number has to come out of: for every drawing
// the mapping step would offer, how much of the artwork it covers, on three denominators -
//
//   frame  - the viewBox, which is what the backlog first proposed
//   ink    - the union of every candidate's box, which is the artwork a lower third actually
//            draws inside a full-frame artboard
//   holds  - how many OTHER candidates the drawing's box contains, which is the plainest reading
//            of "a plate is the thing that is bigger than what sits on it"
//
// Read the table beside the file, decide by eye which drawings are plates, and see whether the
// two populations separate. `--json` writes every row for that reading.
//
// IT MEASURES THE REAL IMPORTER AND A REAL RENDER, which is the only way the numbers mean
// anything: the boxes come from `getBoundingClientRect` on the marked-up artwork with every
// hiding lifted, exactly as `measureLayers` in MapSvgFieldsStep.tsx reads them, so a number here
// is a number the step could act on. It needs a DOM for both halves, so it bundles
// `src/assets/svgImport.ts` with Rolldown and opens one blank Chromium page - the pattern
// `scripts/svg-samples-check.mjs` already uses. No dev server and no app.
//
// It is an INSTRUMENT and always exits 0. It opens Chromium, so run it through `npm run queue`
// like any other job; its name carries `spike`, which is how `SWEEP_SCRIPTS` sees it.
//
// Usage:
//   node scripts/svg-plate-share-spike.mjs
//   node scripts/svg-plate-share-spike.mjs --only illustrator-live-vote-band
//   node scripts/svg-plate-share-spike.mjs --json out.json
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';

const IMPORTER = fileURLToPath(new URL('../src/assets/svgImport.ts', import.meta.url));
const FILL = fileURLToPath(new URL('../src/components/wizard/import/fieldAutoMap.ts', import.meta.url));
/** The three folders that hold artwork: the exporter corpus, the practice library, and the
 *  show boards the behaviour recipes were written against. */
const FOLDERS = [
  ['corpus', fileURLToPath(new URL('../e2e/fixtures/svg-corpus/', import.meta.url))],
  ['samples', fileURLToPath(new URL('../docs/svg-samples/', import.meta.url))],
  ['shows', fileURLToPath(new URL('../e2e/fixtures/svg-shows/', import.meta.url))],
];

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? (args[at + 1] ?? null) : null;
};
const only = flag('--only');
const jsonOut = flag('--json');

/** One module of the app's graph as a self-contained browser script on `window[name]`. */
async function bundleForPage(input, name) {
  const bundle = await rolldown({ input, platform: 'browser', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'iife', name, codeSplitting: false });
  await bundle.close();
  return output[0].code;
}

/** Every artwork file in the three folders, tagged with the folder it came from. */
function corpus() {
  const wanted = only ? new Set(only.split(',').map((s) => s.trim())) : null;
  const out = [];
  for (const [folder, dir] of FOLDERS) {
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.svg'))) {
      const name = f.replace(/\.svg$/, '');
      if (wanted && !wanted.has(name)) continue;
      out.push({ folder, name, file: join(dir, f) });
    }
  }
  return out.sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name));
}

/**
 * Run in the page. Imports the source, paints the marked-up artwork, and measures every
 * candidate's box the way the mapping step does - with hiding lifted, in the artwork's own units.
 *
 * The DRAWINGS are `groups` and `shapes` together, because that is exactly `scoreDrawnPool` in
 * components/wizard/import/draft.ts - the inventory a gauge role is filled from and the one the
 * notice counts. Everything else (text, pictures, outlines) is measured too, but only to say
 * where the ink is and what a drawing holds.
 *
 * The `plate` column is the SHIPPED rule - `isPlate` and `artworkInk` out of fieldAutoMap.ts, not
 * a copy of them here - so a change to the constant, the slack or the second condition shows up in
 * this table on the next run rather than confirming a distribution the code has left behind.
 */
const MEASURE_IN_PAGE = (source) => {
  let r;
  try {
    r = window.NOACG_SVG.importSvgMarkup(source);
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
  const host = document.getElementById('stage');
  host.innerHTML = r.markup;
  const root = host.querySelector('svg');
  if (!root) return { error: 'no svg after import' };
  // Paint it at its own size so one artwork unit is one CSS pixel and the shares below are the
  // shares the designer drew, whatever the page happens to be.
  root.setAttribute('width', String(r.width));
  root.setAttribute('height', String(r.height));
  root.style.width = `${r.width}px`;
  root.style.height = `${r.height}px`;
  host.setAttribute('data-reveal', '');
  const frame = root.getBoundingClientRect();
  const boxOf = (id) => {
    const el = host.querySelector(`[data-noacg-candidate="${id}"]`);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    if (!(b.width > 0) || !(b.height > 0)) return null;
    // The shipped shape (`FillBox`), so a box read here can be handed straight to the shipped
    // rule rather than converted on the way - a conversion is a place for the two to drift.
    return {
      left: b.left - frame.left,
      top: b.top - frame.top,
      right: b.right - frame.left,
      bottom: b.bottom - frame.top,
    };
  };
  const label = (c) => c.label ?? '';
  const every = [
    ...r.candidates.map((c) => ({ id: c.id, kind: 'text', label: label(c) })),
    ...r.images.map((c) => ({ id: c.id, kind: 'image', label: label(c) })),
    ...r.outlines.map((c) => ({ id: c.id, kind: 'outline', label: label(c) })),
    ...r.groups.map((c) => ({ id: c.id, kind: 'group', label: label(c), hidden: !!c.hidden })),
    ...r.shapes.map((c) => ({ id: c.id, kind: 'shape', label: label(c) })),
  ].map((c) => ({ ...c, box: boxOf(c.id) }));
  host.removeAttribute('data-reveal');
  host.innerHTML = '';

  const measured = every.filter((c) => c.box);
  // THE INK, from the shipped `artworkInk`: the union of every candidate's box. On a full-frame
  // artboard holding a band at the bottom this is the band, which is the artwork a reader would
  // point at.
  const ink = window.NOACG_FILL.artworkInk(measured.map((c) => c.box));
  const areaOf = (b) => Math.max(0, b.right - b.left) * Math.max(0, b.bottom - b.top);
  const inkArea = ink ? Math.max(1, areaOf(ink)) : 1;
  const frameArea = Math.max(1, r.width * r.height);
  // A box HOLDS another when it contains it whole, with a pixel of slack for a stroke. Only the
  // informational column below reads this; the plate verdict is the shipped rule's.
  const holds = (a, b) => a.left - 1 <= b.left && a.top - 1 <= b.top && a.right + 1 >= b.right && a.bottom + 1 >= b.bottom;

  const asLayer = (c) => ({ id: c.id, label: c.label, hidden: !!c.hidden, box: c.box });
  const drawn = measured.filter((c) => c.kind === 'group' || c.kind === 'shape');
  const drawnLayers = drawn.map(asLayer);
  const drawings = drawn
    .map((c) => {
      const area = areaOf(c.box);
      const others = measured.filter((o) => o.id !== c.id);
      const held = others.filter((o) => holds(c.box, o.box));
      return {
        id: c.id,
        kind: c.kind,
        hidden: !!c.hidden,
        label: c.label,
        box: { ...c.box },
        frameShare: area / frameArea,
        inkShare: area / inkArea,
        holds: held.length,
        holdsShare: others.length > 0 ? held.length / others.length : 0,
        plate: window.NOACG_FILL.isPlate('gauge', asLayer(c), ink, drawnLayers),
      };
    })
    .sort((a, b) => b.frameShare - a.frameShare);

  return {
    error: null,
    width: r.width,
    height: r.height,
    candidates: measured.length,
    unmeasured: every.length - measured.length,
    ink: ink ? { ...ink, share: inkArea / frameArea } : null,
    drawings,
  };
};

const pad = (s, n) => String(s).padEnd(n).slice(0, n);
const pct = (x) => `${(x * 100).toFixed(1)}%`.padStart(6);

const [importer, fill] = await Promise.all([
  bundleForPage(IMPORTER, 'NOACG_SVG'),
  bundleForPage(FILL, 'NOACG_FILL'),
]);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2200, height: 1400 } });
await page.setContent(
  '<!doctype html><meta charset="utf-8">'
    // The same lift the step's own stylesheet does (import/mapSvgFields.css): a drawn moment is
    // exported hidden, and a hidden element has no box to measure.
    + '<style>body{margin:0}#stage[data-reveal] svg *{display:inline!important;visibility:visible!important}</style>'
    + '<div id="stage"></div>',
);
await page.addScriptTag({ content: importer });
await page.addScriptTag({ content: fill });

const rows = [];
for (const item of corpus()) {
  const source = readFileSync(item.file, 'utf8');
  const r = await page.evaluate(MEASURE_IN_PAGE, source);
  rows.push({ ...item, ...r });
}
await browser.close();

console.log('');
console.log('THE PLATE SPIKE - every drawing the mapping step offers, by how much it covers.');
console.log('frame = share of the viewBox. ink = share of the union of every candidate box.');
console.log('holds = how many of the other candidates its box contains, and their share.');
console.log('PLATE = what the shipped rule (fieldAutoMap.ts isPlate) says about it.');
console.log('');
for (const row of rows) {
  if (row.error) {
    console.log(`${row.folder}/${row.name}: ${row.error}`);
    continue;
  }
  const inkNote = row.ink ? ` ink ${pct(row.ink.share)} of frame` : '';
  console.log(`${row.folder}/${row.name}  ${row.width}x${row.height}  ${row.candidates} candidates${inkNote}`);
  if (row.drawings.length === 0) {
    console.log('    (no drawing offered)');
    continue;
  }
  for (const d of row.drawings) {
    const holds = `${String(d.holds).padStart(3)} (${pct(d.holdsShare)})`;
    console.log(
      `    ${pad(d.id, 5)} ${pad(d.kind + (d.hidden ? '/hidden' : ''), 13)} ${pad(d.label || '(unnamed)', 30)}`
        + ` frame ${pct(d.frameShare)}  ink ${pct(d.inkShare)}  holds ${holds}  ${d.plate ? 'PLATE' : ''}`,
    );
  }
}

const all = rows.flatMap((r) => r.drawings ?? []);
console.log('');
console.log(`${rows.length} files, ${all.length} drawings offered, ${all.filter((d) => d.plate).length} of them plates.`);
if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(rows, null, 2));
  console.log(`Wrote ${jsonOut}`);
}
