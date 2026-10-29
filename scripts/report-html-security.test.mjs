// guards: scripts/pro-evidence-review.mjs, scripts/acceptance-pack.mjs, docs/research/obs-bridge-proof/obs-bridge-proof.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
// Run the actual emitters, but keep capture/browser/OBS startup outside the harness.
// Report reads/writes and HTTP requests stay in memory; no account or service is touched.
const acceptance = source('scripts/acceptance-pack.mjs');
const buildIndex = new Function(`${acceptance.slice(acceptance.indexOf('const SECTIONS ='), acceptance.indexOf('const browser = await chromium.launch();'))}; return buildIndex;`)();
const obs = source('docs/research/obs-bridge-proof/obs-bridge-proof.mjs');
const markerOf = new Function(`${obs.slice(obs.indexOf('const MARKER ='), obs.indexOf('/** The page a source shows'))}; return markerOf;`)();
const decode = (value) => value.replace(/&(amp|quot|#39|lt|gt);/g, (entity) => ({ '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>' })[entity]);
const ordinary = 'Київ "On air" & O\'Brien &quot; <3';
const injection = 'x" onload="globalThis.injected=true';

async function proPage(value) {
  let html;
  const code = source('scripts/pro-evidence-review.mjs').replace(/^#!.*\r?\n/, '').replace(/^import .*;\r?\n/gm, '');
  const render = new Function('readFile', 'readdir', 'writeFile', 'path', 'process', 'console', `return (async () => {${code}\n})();`);
  await render(async (file) => {
    if (file.endsWith('mark-clearance.test.json')) return JSON.stringify({ mark: value, frameDir: '.', rows: [{ id: value, frames: [{ state: 'bare', file: value }] }] });
    throw new Error('No optional fixture');
  }, async () => ['mark-clearance.test.json'], async (_file, content) => { html = content; }, path, { argv: ['node', 'report'] }, { log() {} });
  return html;
}

async function obsPage(graphic, pathname) {
  let handler;
  const createServer = (callback) => {
    handler = callback;
    return { listen(_port, _host, ready) { ready(); }, address() { return { port: 1234 }; } };
  };
  const setup = new Function('createServer', 'URL', 'EVENT_NAME', `${obs.slice(obs.indexOf('function json('), obs.indexOf('// ── 1.'))}\n${obs.slice(obs.indexOf('function probeServer('), obs.indexOf('async function waitFor('))}\nreturn probeServer;`)(createServer, URL, 'noacg');
  await setup();
  let html;
  handler({ method: 'GET', url: `${pathname}?graphic=${encodeURIComponent(graphic)}` }, { setHeader() {}, end(value) { html = value; } });
  return html;
}

test('ordinary report filenames and OBS names retain their existing representation', async () => {
  const html = await proPage('House Strap');
  assert.match(html, /data-id="House Strap"/);
  const pack = buildIndex([{ section: 'catalog', file: 'frame.png', title: 'House Strap', question: 'Readable?' }]);
  assert.match(pack, /<a href="\.\/frame.png"><img src="\.\/frame.png" alt="House Strap">/);
  assert.equal(markerOf(await obsPage('House Strap', '/graphic')), 'House Strap');
  assert.equal(markerOf(await obsPage('House Strap', '/output')), null);
});

test('Pro report JSON cannot add attributes or markup; display values round-trip', async () => {
  for (const value of [injection, '<img src=x onerror=alert(1)>', ordinary]) {
    const html = await proPage(value);
    const id = /data-id="([^"]*)"/.exec(html)?.[1];
    assert.equal(decode(id), value);
    assert.doesNotMatch(html, / onload="globalThis|<img src=x onerror/);
    const src = /<img src="([^"]*)"/.exec(html)?.[1];
    assert.ok(decode(src).endsWith(value));
  }
});

test('acceptance manifest values stay within href, src and alt attributes', () => {
  for (const value of [injection, 'javascript:globalThis.injected=true', 'frames/a #1?.png', 'frames\\camera.png', ordinary]) {
    const html = buildIndex([{ section: 'catalog', file: value, title: value, question: value }]);
    const image = /<a href="([^"]*)"><img src="([^"]*)" alt="([^"]*)">/.exec(html);
    assert.ok(image, 'one intact link and image');
    assert.equal(decode(image[3]), value);
    for (const attribute of image.slice(1, 3)) {
      const url = new URL(decode(attribute), 'https://report.test/pack/');
      assert.equal(url.origin, 'https://report.test');
      assert.equal(url.search, '');
      assert.equal(url.hash, '');
      assert.equal(decodeURIComponent(url.pathname.slice('/pack/'.length)), value.replace(/\\/g, '/'));
    }
    assert.doesNotMatch(html, / onload="globalThis/);
  }
});

test('OBS query data survives the marker and script parser boundaries on both page routes', async () => {
  for (const value of [injection, '</ScRiPt><script>globalThis.injected=true</script><!--', ordinary]) {
    for (const route of ['/graphic', '/output']) {
      const html = await obsPage(value, route);
      assert.equal(markerOf(html), route === '/graphic' ? value : null);
      assert.equal((html.match(/<script\b/gi) ?? []).length, 1);
      assert.equal((html.match(/<\/script\s*>/gi) ?? []).length, 1);
      assert.doesNotMatch(html, / onload="globalThis/);
      const script = /<script>([\s\S]*?)<\/script>/i.exec(html)[1];
      const context = { fetch() {}, location: { href: 'local' }, document: { visibilityState: 'visible' }, window: { addEventListener() {} } };
      vm.runInNewContext(script, context);
      assert.equal(context.GRAPHIC, value);
      assert.equal(context.injected, undefined);
    }
  }
});
