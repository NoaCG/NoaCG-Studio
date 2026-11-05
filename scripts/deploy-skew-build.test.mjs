// gate: factory
// needs: browser
// guards: src/app/deploySkew.ts, src/main.tsx, vite.config.ts, app.html, scripts/skewProtectionPlugin.mjs
//
// A STUDIO PAGE LEFT OPEN ACROSS A DEPLOY RECOVERS (issue #758).
//
// The built app names its code files by content hash, and the host serves only the newest deploy.
// This builds the app, opens /app, and then stands in for a deploy: every code file the open page
// has not loaded yet answers 404, as an old deploy's files do once a new one is live, while a fresh
// request for the page itself gets the new deploy, whose files are all there. Opening the template
// browser then needs a missing file. Before #758 the page stayed broken ("The designs did not
// load"); now it reloads, and the reloaded page shows the designs on the same step. A page whose
// files fail again right after that reload is a network that blocks them, not a deploy: it reloads
// once and stays, and a wizard draft or unsaved brand edits do not reload at all: they live only
// in memory. The rules about air are in scripts/deploy-skew.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'noacg-deploy-skew-'));
await build({ root, configFile: path.join(root, 'vite.config.ts'), logLevel: 'error', build: { outDir: dist, emptyOutDir: true } });
// The same app as a Vercel build with Skew Protection on: every file reference carries the id
// (scripts/skewProtectionPlugin.mjs), and the host answers `?dpl=dpl_A` from this deploy.
const pinnedDist = fs.mkdtempSync(path.join(os.tmpdir(), 'noacg-deploy-skew-pinned-'));
const PINNED_ENV = { VERCEL_SKEW_PROTECTION_ENABLED: '1', VERCEL_DEPLOYMENT_ID: 'dpl_A' };
const saved = Object.fromEntries(Object.keys(PINNED_ENV).map((key) => [key, process.env[key]]));
Object.assign(process.env, PINNED_ENV);
try {
  await build({ root, configFile: path.join(root, 'vite.config.ts'), logLevel: 'error', build: { outDir: pinnedDist, emptyOutDir: true } });
} finally {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };

/** A static host for the build, with `cleanUrls` as vercel.json has. `deploy()` makes every code
 *  file not yet asked for answer 404; a later request for a page brings the new deploy back unless
 *  `blocked` keeps the files gone. With `pinned`, it serves that build and answers a request naming
 *  `?dpl=dpl_A` from the old deploy, as Vercel's Skew Protection does. */
function host({ blocked = false, pinned = false } = {}) {
  const dir = pinned ? pinnedDist : dist;
  let pinnedAsks = 0;
  const unpinnedAssets = [];
  const asked = new Set();
  const gone = new Set();
  let misses = 0;
  const server = http.createServer((req, res) => {
    const [rawPath, query = ''] = (req.url ?? '/').split('?');
    let file = decodeURIComponent(rawPath);
    const toOldDeploy = pinned && new URLSearchParams(query).get('dpl') === 'dpl_A';
    if (toOldDeploy) pinnedAsks += 1;
    if (pinned && rawPath.startsWith('/assets/') && !toOldDeploy) unpinnedAssets.push(rawPath);
    if (file === '/') file = '/index.html';
    else if (!path.extname(file)) file += '.html';
    // The page itself, or its own URL probed before a reload: the new deploy answers.
    if (file.endsWith('.html') && !blocked) gone.clear();
    const full = path.join(dir, file);
    if ((gone.has(file) && !toOldDeploy) || !full.startsWith(dir) || !fs.existsSync(full)) {
      if (file.endsWith('.js')) misses += 1;
      res.writeHead(404);
      res.end();
      return;
    }
    asked.add(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(full)] ?? 'application/octet-stream' });
    fs.createReadStream(full).pipe(res);
  });
  return {
    /** Code files that answered 404: proof a step really asked for a file the deploy took. */
    misses: () => misses,
    /** Requests that named the old deploy. */
    pinnedAsks: () => pinnedAsks,
    /** Requests for a built file, from page load on, that did not name the deploy. */
    unpinnedAssets: () => unpinnedAssets,
    listen: () => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`))),
    deploy: () => {
      for (const name of fs.readdirSync(path.join(dir, 'assets'))) {
        const file = `/assets/${name}`;
        // The pinned case takes stylesheets too, so a stylesheet left unpinned would show.
        if ((name.endsWith('.js') || (pinned && name.endsWith('.css'))) && !asked.has(file)) gone.add(file);
      }
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function openStudio(t, options = {}, prepare = async () => {}) {
  const site = host(options);
  const base = await site.listen();
  const browser = await chromium.launch();
  t.after(async () => {
    await browser.close();
    await site.close();
  });
  const page = await browser.newPage();
  await page.goto(`${base}/app`);
  await page.waitForFunction(() => window.__noacgBootStage === 'mounted');
  await page.getByRole('button', { name: /Start from a template/ }).waitFor();
  await prepare(page);
  site.deploy();
  let loads = 0;
  page.on('domcontentloaded', () => (loads += 1));
  return { page, site, loads: () => loads };
}

test.after(() => {
  fs.rmSync(dist, { recursive: true, force: true });
  fs.rmSync(pinnedDist, { recursive: true, force: true });
});

test('a deploy while the studio is open: loading more code reloads the page, which then works', async (t) => {
  const { page, loads } = await openStudio(t);
  await page.getByRole('button', { name: /Start from a template/ }).click();
  await page.getByTestId('wz-browse-count').waitFor({ timeout: 20_000 });
  assert.equal(loads(), 1, 'the page reloaded once, into the new deploy');
  assert.match(page.url(), /#\/new\/step\/browse/, 'the reload kept the step');
  assert.equal(await page.getByText('The designs did not load').count(), 0);
});

test('files that fail again after the reload: one reload, then the page stays with its own error', async (t) => {
  const { page, loads } = await openStudio(t, { blocked: true });
  await page.getByRole('button', { name: /Start from a template/ }).click();
  await page.getByText(/did not load/).waitFor({ timeout: 20_000 });
  // Long enough for a second reload to have started, were the guard missing.
  await page.waitForTimeout(3_000);
  assert.equal(loads(), 1, 'one reload, no loop');
});

test('a wizard draft holds the reload: the draft is in memory only', async (t) => {
  const { page, site, loads } = await openStudio(t, {}, async (p) => {
    await p.getByRole('button', { name: /Start from a template/ }).click();
    await p.getByTestId('wz-browse-count').waitFor();
    await p.locator('.wz-variant').first().click();
  });
  // The next step's code is one the deploy took away.
  await page.locator('.wz-next').first().click();
  await page.waitForTimeout(8_000);
  assert.ok(site.misses() > 0, 'the step asked for a missing code file');
  assert.equal(loads(), 0, 'no reload under a draft');
  assert.match(page.url(), /#\/new\//, 'still in the wizard');
});

test('unsaved brand edits hold the reload: they live only in the editor', async (t) => {
  const { page, site, loads } = await openStudio(t, {}, async (p) => {
    await p.evaluate(() => (window.location.hash = '#/home/looks'));
    await p.getByRole('button', { name: 'New brand' }).click();
    await p.getByPlaceholder('e.g. Channel A').fill('Channel B');
  });
  // The Google font list is loaded on demand: after the deploy its file is gone.
  await page.getByTestId('font-google').click();
  await page.getByText('The typeface list could not be loaded.').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(8_000);
  assert.ok(site.misses() > 0, 'the list asked for a missing code file');
  assert.equal(loads(), 0, 'no reload under unsaved brand edits');
  assert.equal(await page.getByPlaceholder('e.g. Channel A').inputValue(), 'Channel B');
});

test('with Skew Protection, the open page loads its own deploy: no 404, no reload', async (t) => {
  const { page, site, loads } = await openStudio(t, { pinned: true });
  await page.getByRole('button', { name: /Start from a template/ }).click();
  await page.getByTestId('wz-browse-count').waitFor({ timeout: 20_000 });
  assert.ok(site.pinnedAsks() > 0, 'the code it loaded named its deploy');
  assert.deepEqual(site.unpinnedAssets(), [], 'every built file it asked for, from the first load on, named its deploy');
  assert.equal(site.misses(), 0, 'no code file answered 404');
  assert.equal(loads(), 0, 'no reload was needed');
});
