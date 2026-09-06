// THE SIX /ograf STARTER PACKAGES, BUILT WITHOUT THE APP OR THE DEV SERVER.
//
// `ograf.html` hands out six curated catalog graphics as OGraf packages, and each download is
// built by the REAL exporter at click time (`ografTarget.build()` on `variant.create()`,
// src/ograf/main.ts). That is the right design for the page and the wrong shape for checking:
// putting the packages through an external conformance tool, or diffing what a packaging change
// did to all six, should not need a browser session and six clicks.
//
// This is the same trick scripts/catalog-emit.mjs uses and for the same reason - creating a
// design PARSES the html it just emitted (`new DOMParser()`), so it needs a real DOM and cannot
// honestly run in bare Node. Rolldown bundles the real modules into one browser script,
// Playwright's Chromium runs it on one page, and the packages come back as zips. It is one blank
// page for a couple of seconds, not a catalog sweep.
//
// THE PAGE IS SERVED OVER HTTP, from public/, and that is not incidental: bundled fonts reach a
// package through `fetch('/fonts/<file>')` (src/export/bundledFonts.ts), and on an about:blank
// page that fetch fails silently - `addReferencedFonts` treats a missing file as "skip", so the
// zips would come out with no fonts and no FONT_LICENSES.md and nothing would say so. That is
// the same class of silent-wrong-typeface defect the 2026-08-18 renderer round found.
//
// Usage:
//   node scripts/ograf-starters-emit.mjs                 # writes to ograf-starters-out/ (gitignored)
//   node scripts/ograf-starters-emit.mjs --out <dir>
//   node scripts/ograf-starters-emit.mjs --only Hairline,Big\ Stat
//   node scripts/ograf-starters-emit.mjs --unpack        # also expand each zip beside it
//   node scripts/ograf-starters-emit.mjs --usage post-production
//
// `--usage` is what the page does NOT offer: the starters are always built with LIVE intent
// (src/ograf/main.ts), because every card must download and the post-production gate rightly
// refuses content-driven motion. The studio's export dialog does offer the choice, and a
// post-production package is the only one that advertises `supportsNonRealTime` - so it is the
// only way to exercise the parts of a host (or a checker) that are gated on that flag. Designs
// the gate refuses are reported as failures, which is the honest answer for that intent.
//
// Exit 1 if any requested starter fails to build - a starter that cannot be packaged is a NoaCG
// defect, exactly as it is on the page (src/ograf/main.ts).
import { writeFileSync, mkdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { rolldown } from 'rolldown';
import JSZip from 'jszip';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
};
const outDir = resolve(flag('--out') ?? join(root, 'ograf-starters-out'));
const unpack = args.includes('--unpack');
const usage = flag('--usage') ?? 'live';
if (!['live', 'post-production', 'both'].includes(usage)) {
  console.error(`--usage must be live, post-production or both (got "${usage}")`);
  process.exit(2);
}

/**
 * The six cards on ograf.html, by CATALOG NAME (their `data-starter` attribute). Read off the
 * page rather than duplicated here, so a card added or renamed there is packaged here too and
 * this file cannot drift into checking a set the page no longer hands out.
 */
function starterNames() {
  const html = readFileSync(join(root, 'ograf.html'), 'utf8');
  return [...html.matchAll(/data-starter="([^"]+)"/g)].map((m) => m[1]);
}

const only = flag('--only');
const wanted = only ? only.split(',').map((s) => s.trim()) : starterNames();

// ── the bundle ───────────────────────────────────────────────────────────────

/**
 * A VIRTUAL entry module. It is addressed by a path inside src/ograf/ so its relative imports
 * resolve exactly as src/ograf/main.ts's do, but the load hook supplies its text - the file is
 * never written, so this script cannot leave a stray module in the tree.
 */
const ENTRY = join(root, 'src', 'ograf', '__starters_emit_entry.ts');
const sameFile = (a, b) => a.replace(/\\/g, '/') === b.replace(/\\/g, '/');
const virtualEntry = {
  name: 'noacg-virtual-entry',
  resolveId: (source) => (sameFile(source, ENTRY) ? ENTRY : null),
  load: (id) =>
    sameFile(id, ENTRY)
      ? {
          code: `export { CATALOG } from '../templates/catalog';
export { ografTarget } from '../export/targets/ograf';
export { slug } from '../model/slug';
export { starterGuideMd } from './guide';
`,
          moduleType: 'ts',
        }
      : null,
};

/** Vite's `?raw` suffix, taught to Rolldown (scripts/catalog-emit.mjs carries the same plugin). */
const rawSuffix = {
  name: 'noacg-raw-suffix',
  resolveId(source, importer) {
    if (!source.endsWith('?raw') || !importer) return null;
    return `${fileURLToPath(new URL(source.slice(0, -'?raw'.length), pathToFileURL(importer)))}?raw`;
  },
  load(id) {
    if (!id.endsWith('?raw')) return null;
    const text = readFileSync(id.slice(0, -'?raw'.length), 'utf8');
    return { code: `export default ${JSON.stringify(text)};`, moduleType: 'js' };
  },
};

async function bundleExporter() {
  const bundle = await rolldown({
    input: ENTRY,
    platform: 'browser',
    plugins: [virtualEntry, rawSuffix],
    logLevel: 'silent',
  });
  const { output } = await bundle.generate({ format: 'iife', name: 'NOACG_OGRAF', codeSplitting: false });
  await bundle.close();
  return output[0].code;
}

// ── public/ over http, so /fonts/<file> answers ──────────────────────────────

const MIME = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

async function servePublic() {
  const server = createServer((req, res) => {
    const path = join(root, 'public', decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (path.startsWith(join(root, 'public')) && existsSync(path) && statSync(path).isFile()) {
      res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
      res.end(readFileSync(path));
      return;
    }
    // The emit page itself: an empty document at the origin the fonts are served from.
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><meta charset="utf-8"><title>OGraf starter emit</title>');
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return { server, origin: `http://127.0.0.1:${server.address().port}/` };
}

// ── the emit, in the page ────────────────────────────────────────────────────

/** Exactly src/ograf/main.ts `downloadStarter()`: the real target, plus GUIDE.md. */
const BUILD_IN_PAGE = async ([names, intents]) => {
  const { CATALOG, ografTarget, slug, starterGuideMd } = window.NOACG_OGRAF;
  const find = (name) => {
    for (const list of Object.values(CATALOG)) {
      const hit = (list ?? []).find((v) => v.name === name);
      if (hit) return hit;
    }
    return null;
  };
  const out = [];
  for (const name of names) {
    const variant = find(name);
    if (!variant) {
      out.push({ name, error: `"${name}" is not in the current catalog` });
      continue;
    }
    for (const intent of intents) {
      try {
        const template = variant.create();
        const zip = await ografTarget.build(template, { graphicUsage: intent });
        zip.file(`${slug(template.name)}/GUIDE.md`, starterGuideMd(template));
        const suffix = intent === 'live' ? '' : `-${intent}`;
        out.push({
          name,
          intent,
          file: `${slug(template.name)}-ograf${suffix}.zip`,
          base64: await zip.generateAsync({ type: 'base64' }),
        });
      } catch (e) {
        out.push({ name, intent, error: String((e && e.message) || e) });
      }
    }
  }
  return out;
};

/** Expand a built package next to its zip, so a checker or a diff can read the files. */
async function unpackZip(bytes, dir) {
  const zip = await JSZip.loadAsync(bytes);
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const target = join(dir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, await entry.async('nodebuffer'));
  }
}

// ── run ──────────────────────────────────────────────────────────────────────

mkdirSync(outDir, { recursive: true });
const [script, { server, origin }, browser] = await Promise.all([bundleExporter(), servePublic(), chromium.launch()]);
let packages;
try {
  const page = await browser.newPage();
  page.on('pageerror', (err) => console.error(`  [page] ${err.message}`));
  await page.goto(origin);
  await page.addScriptTag({ content: script });
  packages = await page.evaluate(BUILD_IN_PAGE, [wanted, usage === 'both' ? ['live', 'post-production'] : [usage]]);
} finally {
  await browser.close();
  server.close();
}

let failed = 0;
for (const built of packages) {
  const label = `${built.name}${built.intent && built.intent !== 'live' ? ` [${built.intent}]` : ''}`;
  if (built.error) {
    failed += 1;
    console.log(`FAIL  ${label}: ${built.error}`);
    continue;
  }
  const bytes = Buffer.from(built.base64, 'base64');
  writeFileSync(join(outDir, built.file), bytes);
  if (unpack) await unpackZip(bytes, join(outDir, built.file.replace(/\.zip$/, '')));
  console.log(`ok    ${label}  ->  ${built.file}  (${(bytes.length / 1024).toFixed(0)} kB)`);
}
console.log(`\n${packages.length - failed}/${packages.length} package(s) written to ${outDir}`);
if (failed) process.exit(1);
