// Build the Uutishuone news pack: assemble the template sources under
// scripts/packs/newsroom/ into public/packs/uutishuone.noacgpack.json (+ the pack index).
//
//   node scripts/build-news-pack.mjs
//
// The emitted JSON is the DOWNLOADABLE artifact (served at /packs/…, git-tracked); the
// .mjs sources here are its readable, reviewable form. The app-side importer
// (src/packs/graphicsPack.ts) re-validates every graphic through the export gate at import
// time — this script only guards what node can check without the app: the format shape,
// the SPX contract's presence, and the CasparCG-CEF ES5 rule for template JS.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { graphic as opener } from './packs/newsroom/opener.mjs';
import { graphic as nameStrap } from './packs/newsroom/nameStrap.mjs';
import { graphic as headline } from './packs/newsroom/headline.mjs';
import { graphic as ticker } from './packs/newsroom/ticker.mjs';
import { graphic as bugClock } from './packs/newsroom/bugClock.mjs';
import { graphic as endboard } from './packs/newsroom/endboard.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Pool order is the layer PAINT order (index 0 furthest back) — keep it back-to-front so
// the stack reads right even before the explicit layer numbers apply.
const graphics = [ticker, bugClock, nameStrap, headline, endboard, opener];

const PACK = {
  format: 'noacg-pack',
  version: 1,
  name: 'Uutishuone',
  description:
    'A complete modern news package: opener, name strap, headline insert, rotating bottom ticker, corner bug with a live clock, and an endboard. Finnish sample content.',
  graphics: graphics.map((g) => ({
    name: g.name,
    type: g.type,
    layer: g.layer,
    html: g.html,
    css: g.css,
    js: g.js,
    cues: g.cues,
  })),
};

// ── Sanity gates (fail the build, never emit a half-right pack) ─────────────────────────
const failures = [];
const names = new Set();
for (const g of PACK.graphics) {
  const where = `"${g.name}"`;
  if (names.has(g.name)) failures.push(`${where}: duplicate graphic name`);
  names.add(g.name);
  if (!g.html.includes('window.SPXGCTemplateDefinition')) {
    failures.push(`${where}: no SPXGCTemplateDefinition in the HTML`);
  }
  for (const fn of ['function play()', 'function stop()', 'function update(data)']) {
    if (!g.js.includes(fn)) failures.push(`${where}: missing ${fn}`);
  }
  // The CasparCG 2.3.x CEF (Chromium 71) rule: template JS stays ES5 — no arrow
  // functions, template literals, optional chaining or nullish coalescing
  // (docs/CLOUD_PLAYOUT.md §3).
  for (const [token, label] of [
    ['=>', 'an arrow function'],
    ['`', 'a template literal'],
    ['?.', 'optional chaining'],
    ['??', 'nullish coalescing'],
  ]) {
    if (g.js.includes(token)) failures.push(`${where}: template JS carries ${label} (${token})`);
  }
  // Data holders hide by CSS rule, never inline style (the editor's entrance reset
  // clears inline props — src/templates/AGENTS.md).
  if (/id="f\d+"[^>]*style="[^"]*display:\s*none/.test(g.html)) {
    failures.push(`${where}: a field holder hides with an inline style`);
  }
  // Bundled-font references must be the relative fonts/ path the exports collect.
  if (g.css.includes('url(') && !g.css.includes('url("fonts/')) {
    failures.push(`${where}: a url() reference outside the bundled fonts/ convention`);
  }
}
if (failures.length) {
  console.error('build-news-pack: refusing to emit —');
  for (const f of failures) console.error(`  · ${f}`);
  process.exit(1);
}

// ── Emit ────────────────────────────────────────────────────────────────────────────────
const outDir = join(root, 'public', 'packs');
mkdirSync(outDir, { recursive: true });

const packPath = join(outDir, 'uutishuone.noacgpack.json');
writeFileSync(packPath, JSON.stringify(PACK, null, 2) + '\n', 'utf8');

// The index the Productions section lists installable packs from. UPSERT this pack's
// entry - the index is shared with every other pack builder (build-production-pack.mjs),
// so overwriting it wholesale would silently drop their entries.
const indexPath = join(outDir, 'index.json');
const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : [];
const entry = {
  file: 'uutishuone.noacgpack.json',
  name: 'Uutishuone',
  description: 'Modern news package — opener, straps, ticker, bug & clock, endboard',
};
const at = index.findIndex((p) => p.file === entry.file);
if (at >= 0) index[at] = entry;
else index.push(entry);
writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf8');

const bytes = JSON.stringify(PACK).length;
console.log(
  `build-news-pack: wrote ${PACK.graphics.length} graphics (${(bytes / 1024).toFixed(0)} kB) -> public/packs/uutishuone.noacgpack.json`,
);
