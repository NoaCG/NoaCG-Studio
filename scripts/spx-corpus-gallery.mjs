// Visual eval gallery over the local spx_examples corpus (docs/SPX_EXAMPLES_CORPUS.md,
// workstream 4). Serves the corpus folder over HTTP so every relative reference (fonts,
// themes, webm, images) resolves exactly as in production, drives each template through
// the real SPX contract - update(defaults) then play() - and captures the settled hold
// frame over a neutral dark plate into a browsable local gallery.
//
// This renders the ORIGINAL files, not our import of them: the gallery answers "what does
// real broadcast output look like" for taste calibration (e.g. the DESIGN_LANGUAGE delta
// review), not "what does our importer produce" - that is spx-corpus-sweep.mjs's job.
//
//   node scripts/spx-corpus-gallery.mjs [corpus-dir] [out-dir] [--only=<substring>]
//
// --only keeps the templates whose path under templates/ contains the substring, and
// leaves every other frame already in the out dir alone - which is how the visual eval
// set (scripts/spx-eval-set.mjs) refreshes its six pairs in seconds instead of re-rendering
// the whole corpus. The index it writes then covers the rendered subset only.
//
// Local-only, like the sweep: exits 0 with a note when the corpus is absent. Output
// (default ./spx-corpus-out/gallery) is gitignored. Needs no dev server - it brings its
// own static server on an ephemeral port. ~3s per template, ~12 min for the full corpus.

import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice('--only='.length);
const corpusDir = resolve(positional[0] || join(process.cwd(), 'spx_examples'));
const outDir = resolve(positional[1] || './spx-corpus-out/gallery');

if (!existsSync(corpusDir)) {
  console.log(`spx-corpus-gallery: corpus not present at ${corpusDir} - nothing to do.`);
  process.exit(0);
}

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

// Static server over the corpus. Traversal-safe: the resolved path must stay inside.
const server = createServer((req, res) => {
  const clean = decodeURIComponent((req.url || '/').split('?')[0]);
  const path = resolve(join(corpusDir, clean));
  if (!path.startsWith(corpusDir) || !existsSync(path) || statSync(path).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(path).toLowerCase()] || 'application/octet-stream' });
  res.end(readFileSync(path));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const port = server.address().port;

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...htmlFiles(p));
    else if (/\.html?$/i.test(name)) out.push(p);
  }
  return out;
}
const templatesDir = join(corpusDir, 'templates');
const files = htmlFiles(templatesDir).filter(
  (f) => !only || relative(templatesDir, f).replaceAll('\\', '/').includes(only),
);
console.log(`spx-corpus-gallery: rendering ${files.length} templates from ${corpusDir}${only ? ` (--only=${only})` : ''}`);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 0.5 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 160)));

const cards = [];
for (const file of files) {
  const rel = relative(join(corpusDir, 'templates'), file).replaceAll('\\', '/');
  const url = `http://127.0.0.1:${port}/templates/${rel.split('/').map(encodeURIComponent).join('/')}`;
  pageErrors.length = 0;
  const status = { file: rel, errors: [] };
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 15000 });
    status.driven = await page.evaluate(() => {
      // The plate sits BEHIND the transparent graphic, where the program video would be.
      const plate = document.createElement('div');
      plate.style.cssText =
        'position:fixed;inset:0;z-index:-2147483648;background:' +
        'radial-gradient(ellipse at 50% 38%, #3a4150 0%, #23272f 55%, #14161b 100%)';
      document.body.appendChild(plate);
      // Drive the SPX lifecycle exactly as SPX does: update with the definition's own
      // defaults (stringified JSON), then play. Either call may not exist - report, not throw.
      const def = window.SPXGCTemplateDefinition;
      const data = {};
      for (const f of (def && def.DataFields) || []) {
        if (!f || f.field === undefined || f.field === 'comment') continue;
        let value = String(f.value ?? '');
        // Packs ship TEXT fields with empty defaults (operators fill them per rundown
        // item) and empty fields collapse their boxes - so an empty text default gets
        // the field's title as sample data, the convention a broadcaster's own example frames use.
        const ftype = String(f.ftype ?? 'textfield');
        if (!value && (ftype === 'textfield' || ftype === 'textarea') && f.title) value = String(f.title);
        data[f.field] = value;
      }
      const out = { update: false, play: false, fields: Object.keys(data).length };
      try { if (typeof window.update === 'function') { window.update(JSON.stringify(data)); out.update = true; } }
      catch (e) { out.updateError = String(e && e.message).slice(0, 160); }
      try { if (typeof window.play === 'function') { window.play(); out.play = true; } }
      catch (e) { out.playError = String(e && e.message).slice(0, 160); }
      return out;
    });
    // Production entrances run up to ~2s (docs/SPX_EXAMPLES_CORPUS.md) - settle past them.
    await page.waitForTimeout(2600);
    const shot = rel.replaceAll('/', '__') + '.png';
    await page.screenshot({ path: join(outDir, shot) });
    status.shot = shot;
  } catch (e) {
    status.errors.push(String(e && e.message ? e.message : e).slice(0, 160));
  }
  status.errors.push(...pageErrors.slice(0, 3));
  cards.push(status);
  process.stdout.write('.');
}
await browser.close();
server.close();
console.log('');

// ---------- the gallery page ----------
const groups = new Map();
for (const c of cards) {
  const project = c.file.split('/')[0];
  if (!groups.has(project)) groups.set(project, []);
  groups.get(project).push(c);
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const section = ([project, items]) => `
  <h2>${esc(project)} <small>(${items.length})</small></h2>
  <div class="grid">${items.map((c) => `
    <figure class="${c.file.includes('_old_') || c.file.includes('backup') ? 'stale' : ''}">
      ${c.shot ? `<img loading="lazy" src="${encodeURIComponent(c.shot)}" alt="">` : '<div class="fail">no frame</div>'}
      <figcaption>
        <b>${esc(c.file.split('/').pop())}</b> ${esc(c.file.split('/').slice(1, -1).join('/'))}<br>
        ${c.driven ? `update ${c.driven.update ? 'OK' : '-'} / play ${c.driven.play ? 'OK' : '-'} / ${c.driven.fields} fields` : ''}
        ${(c.errors.length || (c.driven && (c.driven.updateError || c.driven.playError)))
          ? `<div class="err">${esc([c.driven?.updateError, c.driven?.playError, ...c.errors].filter(Boolean).join(' | '))}</div>` : ''}
      </figcaption>
    </figure>`).join('')}
  </div>`;
writeFileSync(join(outDir, 'index.html'), `<!DOCTYPE html>
<meta charset="utf-8"><title>spx_examples corpus gallery</title>
<style>
  body { background:#0f1115; color:#cfd3da; font:14px/1.4 system-ui; margin:24px; }
  h2 { color:#f5a623; margin:32px 0 12px; } h2 small { color:#6b7280; font-weight:400; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(420px,1fr)); gap:14px; }
  figure { margin:0; background:#171a21; border:1px solid #262b35; border-radius:8px; overflow:hidden; }
  figure.stale { opacity:.45; }
  img { width:100%; display:block; aspect-ratio:16/9; object-fit:cover; }
  figcaption { padding:8px 10px; color:#9aa1ac; } figcaption b { color:#e6e9ee; }
  .err { color:#e5534b; margin-top:4px; } .fail { aspect-ratio:16/9; display:grid; place-items:center; color:#e5534b; }
</style>
<h1>spx_examples corpus - hold frames (${cards.length} templates)</h1>
<p>Licence-restricted reference material - local viewing only, never publish or commit.
Stale pack versions (_old_/backup) are dimmed.</p>
${[...groups.entries()].map(section).join('\n')}
`);

const failed = cards.filter((c) => !c.shot).length;
const undriven = cards.filter((c) => c.shot && c.driven && !c.driven.update && !c.driven.play).length;
console.log(`captured ${cards.length - failed}/${cards.length} frames (${failed} failed, ${undriven} had no update/play to drive)`);
console.log(`gallery -> ${join(outDir, 'index.html')}`);
