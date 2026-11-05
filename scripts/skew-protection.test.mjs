// guards: scripts/skewProtectionPlugin.mjs, vite.config.ts
//
// EVERY REFERENCE A BUILD WRITES TO ITS OWN FILES CARRIES THE DEPLOYMENT ID, OR NONE DOES
// (issue #758). Vercel answers `?dpl=<id>` from the deploy that served the page; a reference left
// without it reaches the newest deploy, and one module reached by two URLs runs twice.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pinReferences, skewDeploymentId, skewProtectionPlugin } from './skewProtectionPlugin.mjs';

const NAMES = ['app-AbC1.js', 'BrowseStep-x_9.js', 'draft-Q2.css', 'editor.worker-Z.js', 'font-k.woff2'];
const pin = (code) => pinReferences(code, NAMES, 'dpl_A');

test('chunk imports, static and lazy, in every quote style', () => {
  assert.equal(pin('import{a}from"./app-AbC1.js";'), 'import{a}from"./app-AbC1.js?dpl=dpl_A";');
  assert.equal(pin("import('./BrowseStep-x_9.js')"), "import('./BrowseStep-x_9.js?dpl=dpl_A')");
  assert.equal(pin('import(`./BrowseStep-x_9.js`)'), 'import(`./BrowseStep-x_9.js?dpl=dpl_A`)');
});

test('the preload list, worker URLs, HTML tags and CSS url()', () => {
  assert.equal(pin('m.f=["assets/BrowseStep-x_9.js","assets/draft-Q2.css"]'), 'm.f=["assets/BrowseStep-x_9.js?dpl=dpl_A","assets/draft-Q2.css?dpl=dpl_A"]');
  assert.equal(pin('new Worker(`/assets/editor.worker-Z.js`,{})'), 'new Worker(`/assets/editor.worker-Z.js?dpl=dpl_A`,{})');
  assert.equal(
    pin('<script type="module" crossorigin src="/assets/app-AbC1.js"></script><link rel="stylesheet" href="/assets/draft-Q2.css">'),
    '<script type="module" crossorigin src="/assets/app-AbC1.js?dpl=dpl_A"></script><link rel="stylesheet" href="/assets/draft-Q2.css?dpl=dpl_A">',
  );
  assert.equal(pin('src:url(./font-k.woff2)format("woff2")'), 'src:url(./font-k.woff2?dpl=dpl_A)format("woff2")');
});

test('leaves alone what is not a reference to a built file', () => {
  for (const code of [
    'fetch("/api/app-AbC1.js")', // another path
    '"./app-AbC1.json"', // another name that merely starts the same
    '"./other-AbC1.js"', // a name the build did not write
    '"./app-AbC1.js?dpl=dpl_B"', // already pinned
    'const s="app-AbC1.js"', // a bare name, not a path
  ]) {
    assert.equal(pin(code), code, code);
  }
});

test('pinning twice changes nothing more', () => {
  const once = pin('import("./app-AbC1.js");x=["assets/draft-Q2.css"]');
  assert.equal(pin(once), once);
});

test('only a Vercel build with Skew Protection on is pinned', () => {
  assert.equal(skewDeploymentId({ VERCEL_SKEW_PROTECTION_ENABLED: '1', VERCEL_DEPLOYMENT_ID: 'dpl_A' }), 'dpl_A');
  assert.equal(skewDeploymentId({ VERCEL_DEPLOYMENT_ID: 'dpl_A' }), null);
  assert.equal(skewDeploymentId({ VERCEL_SKEW_PROTECTION_ENABLED: '1' }), null);
  assert.equal(skewDeploymentId({}), null);
});

/** A written build in a temp dir, and the plugin's writeBundle run over it. Returns the files after
 *  and what the plugin logged. */
function runPlugin(env) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noacg-skew-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  const files = {
    'app.html': '<script type="module" src="/assets/app-AbC1.js"></script>',
    'assets/app-AbC1.js': 'import("./BrowseStep-x_9.js");m.f=["assets/draft-Q2.css"]',
    'assets/BrowseStep-x_9.js': 'export const a=1',
    'assets/draft-Q2.css': 'a{}',
  };
  for (const [file, code] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), code);
  const logged = [];
  const log = console.log;
  console.log = (line) => logged.push(line);
  try {
    skewProtectionPlugin(env).writeBundle.handler({ dir }, Object.fromEntries(Object.keys(files).map((f) => [f, {}])));
  } finally {
    console.log = log;
  }
  const after = Object.fromEntries(Object.keys(files).map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));
  fs.rmSync(dir, { recursive: true, force: true });
  return { files, after, logged };
}

test('without the Vercel variables the plugin changes nothing and says it is off', () => {
  for (const env of [{}, { VERCEL_DEPLOYMENT_ID: 'dpl_A' }, { VERCEL_SKEW_PROTECTION_ENABLED: '1' }]) {
    const { files, after, logged } = runPlugin(env);
    assert.deepEqual(after, files, JSON.stringify(env));
    assert.equal(logged.length, 1);
    assert.match(logged[0], /^\[skew-protection\] off: /);
  }
});

test('with them it pins every reference and the log line counts them', () => {
  const { after, logged } = runPlugin({ VERCEL_SKEW_PROTECTION_ENABLED: '1', VERCEL_DEPLOYMENT_ID: 'dpl_A' });
  assert.equal(after['app.html'], '<script type="module" src="/assets/app-AbC1.js?dpl=dpl_A"></script>');
  assert.equal(after['assets/app-AbC1.js'], 'import("./BrowseStep-x_9.js?dpl=dpl_A");m.f=["assets/draft-Q2.css?dpl=dpl_A"]');
  assert.deepEqual(logged, ['[skew-protection] on: dpl_A, 3 reference(s) pinned in 2 file(s), 0 unpinned']);
});
