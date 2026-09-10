// Assemble a graphics pack (src/packs/graphicsPack.ts, format `noacg-pack` v1) from a
// FILE-BASED pack source directory: packs/<pack>/manifest.json + one directory per graphic
// holding template.html / style.css / logic.js. Output: public/packs/<slug>.noacgpack.json
// plus the pack's entry UPSERTED into public/packs/index.json (never overwriting other
// packs' entries - build-news-pack.mjs shares the index the same way).
//
// The app-side importer re-validates every graphic through the export gate at import time;
// this script guards what plain node can check: the format shape, the SPX contract's
// presence, the CasparCG-CEF ES5 rule, the inline-hidden-holder rule and the bundled-font
// url() convention (the same gates as build-news-pack.mjs, adapted to file sources).
// e2e/production-pack.spec.ts installs the emitted file through the real gate.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const packDir = process.argv[2] ?? join(repo, 'packs', 'fight-night');
const slug = basename(packDir);
const outDir = join(repo, 'public', 'packs');
const outFile = join(outDir, `${slug}.noacgpack.json`);

const failures = [];
const fail = (msg) => failures.push(msg);

// Template sources reach the working tree with platform line endings (core.autocrlf), but
// the emitted JSON is a committed artifact - normalize to LF so a build on any platform
// reproduces the same bytes.
const readSource = (path) => readFileSync(path, 'utf8').replace(/\r\n?/g, '\n');

const manifest = JSON.parse(readFileSync(join(packDir, 'manifest.json'), 'utf8'));
if (!manifest.name || !Array.isArray(manifest.graphics) || manifest.graphics.length === 0) {
  console.error('build-production-pack: manifest.json needs a name and a non-empty graphics list');
  process.exit(1);
}

const names = new Set();
const graphics = manifest.graphics.map((entry) => {
  const where = `"${entry.name}"`;
  if (!entry.slug || !entry.name || !entry.type) fail(`${where}: needs slug + name + type`);
  if (names.has(entry.name)) fail(`${where}: duplicate graphic name`);
  names.add(entry.name);

  const dir = join(packDir, entry.slug);
  const html = readSource(join(dir, 'template.html'));
  const css = readSource(join(dir, 'style.css'));
  const js = readSource(join(dir, 'logic.js'));

  if (!html.includes('window.SPXGCTemplateDefinition')) {
    fail(`${where}: no SPXGCTemplateDefinition in the HTML`);
  }
  // The SPX entry points. These sources assign the globals (`window.play = function () {`),
  // the equivalent of build-news-pack's `function play()` declarations.
  for (const fn of ['window.play', 'window.stop', 'window.update']) {
    if (!js.includes(`${fn} = function`)) fail(`${where}: missing ${fn} = function`);
  }
  // The CasparCG 2.3.x CEF (Chromium 71) rule: template JS stays ES5. Comments are
  // stripped first - the rule is about code, and several files NAME the rule in a comment.
  const stripped = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  for (const [token, label] of [
    ['=>', 'an arrow function'],
    ['`', 'a template literal'],
    ['?.', 'optional chaining'],
    ['??', 'nullish coalescing'],
  ]) {
    if (stripped.includes(token)) fail(`${where}: template JS carries ${label} (${token})`);
  }
  // Data holders hide by CSS rule, never inline style (the editor's entrance reset clears
  // inline props - src/templates/AGENTS.md).
  if (/id="f\d+"[^>]*style="[^"]*display:\s*none/.test(html)) {
    fail(`${where}: a field holder hides with an inline style`);
  }
  // Bundled-font references must be the relative fonts/ path the exports collect.
  if (css.includes('url(') && !css.includes('url("fonts/')) {
    fail(`${where}: a url() reference outside the bundled fonts/ convention`);
  }
  // Every declared field has its element (the fN contract).
  for (const m of html.matchAll(/"field":\s*"(f\d+)"/g)) {
    if (!html.includes(`id="${m[1]}"`)) fail(`${where}: field ${m[1]} has no element id="${m[1]}"`);
  }

  return {
    name: entry.name,
    type: entry.type,
    layer: entry.layer,
    html,
    css,
    js,
    resolution: { width: 1920, height: 1080 },
    fps: 50,
  };
});

const cues = (manifest.cues ?? []).map((cue) => {
  if (!names.has(cue.graphic)) fail(`cue "${cue.label}" points at unknown graphic "${cue.graphic}"`);
  return cue;
});

if (failures.length) {
  console.error('build-production-pack: refusing to emit —');
  for (const f of failures) console.error(`  · ${f}`);
  process.exit(1);
}

const PACK = {
  format: 'noacg-pack',
  version: 1,
  name: manifest.name,
  description: manifest.description ?? '',
  graphics,
  ...(cues.length ? { cues } : {}),
};

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(PACK, null, 2) + '\n');

// Upsert this pack's entry into the shared index (the Productions section's installable list).
const indexPath = join(outDir, 'index.json');
const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : [];
const entry = {
  file: `${slug}.noacgpack.json`,
  name: manifest.name,
  description: manifest.indexDescription ?? manifest.description ?? '',
};
const at = index.findIndex((p) => p.file === entry.file);
if (at >= 0) index[at] = entry;
else index.push(entry);
writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');

const bytes = JSON.stringify(PACK).length;
console.log(
  `build-production-pack: wrote ${graphics.length} graphics, ${cues.length} cues (${(bytes / 1024).toFixed(0)} kB) -> public/packs/${slug}.noacgpack.json`,
);
