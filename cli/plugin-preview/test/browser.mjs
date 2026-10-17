// Local protocol evidence only. This host stub never establishes Codex desktop AC-1/AC-2.
import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, UI_URI } from '../server.mjs';
import { FIXTURE_ROOT, SOURCE_FILES } from '../source.mjs';
import { launchBrowser, closeBrowser, newBenchContext } from '../dist/browser.mjs';

test('actual PNG, isolated live fixture, selection, stale refusal and refreshed source in browser host stub', { timeout: 30000 }, async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'noacg-preview-browser-'));
  await cp(FIXTURE_ROOT, temporary, { recursive: true });
  const server = await createServer({ fixtureRoot: temporary });
  const client = new Client({ name: 'browser stub test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const bench = await newBenchContext(await launchBrowser(), 'https://preview.invalid');
  try {
    await server.connect(a);
    await client.connect(b);
    // Exercise the unmodified package before the preview's automatic Take. This catches
    // lifecycle failures that a screenshot of an always-visible fixture would conceal.
    const lifecycle = await bench.newPage();
    await lifecycle.route('https://preview.invalid/fixture/*', async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').pop();
      if (!SOURCE_FILES.includes(name)) return route.abort();
      const contentType = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' }[path.extname(name)];
      await route.fulfill({ contentType, body: await readFile(path.join(temporary, name)) });
    });
    await lifecycle.goto('https://preview.invalid/fixture/graphic.html');
    assert.equal(await lifecycle.locator('#lower-third').evaluate((node) => getComputedStyle(node).opacity), '0');
    const offImage = await lifecycle.screenshot({ omitBackground: true });
    await lifecycle.evaluate(() => window.play());
    assert.equal(await lifecycle.locator('#lower-third').evaluate((node) => getComputedStyle(node).opacity), '1');
    assert.notDeepEqual(await lifecycle.screenshot({ omitBackground: true }), offImage);
    await lifecycle.evaluate(() => { window.update({ f0: 'Native fixture update' }); window.stop(); });
    assert.equal(await lifecycle.locator('#f0').textContent(), 'Native fixture update');
    assert.equal(await lifecycle.locator('#lower-third').evaluate((node) => getComputedStyle(node).opacity), '0');
    await lifecycle.close();
    const initial = await client.callTool({ name: 'noacg_preview', arguments: {} });
    assert.ok(!initial.isError, JSON.stringify(initial.content));
    assert.equal(Buffer.from(initial.content[1].data, 'base64').subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    const resource = (await client.readResource({ uri: UI_URI })).contents[0];
    // Enforce the standard host's network/iframe policy, including its default frame-src
    // none. The graphic is a srcdoc document; this test catches host-CSP incompatibility.
    const html = resource.text.replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; font-src data:; connect-src \'none\'; frame-src \'none\'">');
    const page = await bench.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const prefix = 'mcp__preview_trial__';
    const openTool = (await client.listTools()).tools.find(({ name }) => name === 'noacg_preview');
    const qualifiedTool = { ...openTool, name: prefix + openTool.name };
    await page.exposeFunction('callTrialTool', ({ name, ...params }) => {
      assert.ok(name.startsWith(prefix), 'host requires the qualified tool name');
      return client.callTool({ ...params, name: name.slice(prefix.length) });
    });
    await page.setContent('<iframe id="app" style="width:800px;height:800px;border:0"></iframe>');
    await page.evaluate(({ html, initial, qualifiedTool }) => {
      const appFrame = document.getElementById('app');
      window.received = [];
      window.addEventListener('message', async (event) => {
        if (event.source !== appFrame.contentWindow || event.data?.jsonrpc !== '2.0') return;
        const { id, method, params } = event.data;
        const reply = (result) => appFrame.contentWindow.postMessage({ jsonrpc: '2.0', id, result }, '*');
        if (method === 'ui/initialize') reply({ protocolVersion: '2026-01-26', hostInfo: { name: 'test stub', version: '1' }, hostCapabilities: { serverTools: {}, message: { text: {}, image: {} }, experimental: { 'openai/message': {} } }, hostContext: { theme: 'light', displayMode: 'inline', toolInfo: { tool: qualifiedTool } } });
        if (method === 'ui/notifications/initialized') appFrame.contentWindow.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: initial }, '*');
        if (method === 'tools/call') reply(await window.callTrialTool(params));
        if (method === 'ui/message') { window.received.push(params); reply({}); }
      });
      appFrame.srcdoc = html;
    }, { html, initial, qualifiedTool });
    const ui = page.frameLocator('#app');
    await ui.getByRole('status').filter({ hasText: 'Ready' }).waitFor();
    const graphic = ui.frameLocator('#graphic');
    assert.equal(await graphic.locator('#f0').textContent(), 'Alex Morgan');
    const isolation = await graphic.locator('body').evaluate(() => {
      try { return { parentReadable: !!window.parent.document, openai: !!window.openai }; }
      catch { return { parentReadable: false, openai: !!window.openai }; }
    });
    assert.deepEqual(isolation, { parentReadable: false, openai: false });
    const target = initial._meta.preview.targets.find(({ id }) => id === 'f0');
    async function selectName() {
      const box = await ui.locator('#selection-layer').boundingBox();
      await page.mouse.click(box.x + (target.bounds.x + target.bounds.width / 2) / 1920 * box.width, box.y + (target.bounds.y + target.bounds.height / 2) / 1080 * box.height);
      assert.equal(await ui.locator('#selected').textContent(), 'Name');
    }
    await selectName();
    await ui.locator('#request').fill('Make the name larger');
    await ui.getByRole('button', { name: 'Send change to this task' }).click();
    await ui.getByRole('status').filter({ hasText: 'Change and image sent' }).waitFor();
    const received = await page.evaluate(() => window.received);
    assert.equal(received.length, 1);
    assert.equal(received[0].content[1].data, initial.content[1].data);
    assert.match(received[0].content[0].text, /"id": "f0"/);
    assert.deepEqual(received[0]._meta['openai/message'], { target: 'active', send: true });
    const cssPath = path.join(temporary, 'graphic.css');
    await writeFile(cssPath, (await readFile(cssPath, 'utf8')).replace('52px', '66px'));
    await ui.getByRole('button', { name: 'Send change to this task' }).click();
    await ui.getByRole('status').filter({ hasText: 'source changed' }).waitFor();
    assert.equal((await page.evaluate(() => window.received)).length, 1);
    await ui.getByRole('button', { name: 'Refresh source' }).click();
    await ui.getByRole('status').filter({ hasText: 'Ready' }).waitFor();
    assert.equal(await graphic.locator('#f0').evaluate((node) => getComputedStyle(node).fontSize), '66px');
    assert.equal(await ui.locator('#highlight').isVisible(), false);
    const after = await client.callTool({ name: 'noacg_preview', arguments: {} });
    assert.notEqual(after.structuredContent.revision, initial.structuredContent.revision);
    assert.notEqual(after.content[1].data, initial.content[1].data);
    await page.evaluate(() => { document.getElementById('app').style.width = '460px'; });
    await ui.locator('#mode').selectOption('region');
    const area = await ui.locator('#selection-layer').boundingBox();
    await page.mouse.move(area.x + area.width * .1, area.y + area.height * .6);
    await page.mouse.down();
    await page.mouse.move(area.x + area.width * .5, area.y + area.height * .9);
    await page.mouse.up();
    assert.equal(await ui.locator('#selected').textContent(), 'Selected region');
    await ui.getByRole('button', { name: 'Send change to this task' }).click();
    await ui.getByRole('status').filter({ hasText: 'Change and image sent' }).waitFor();
    const regionMessage = (await page.evaluate(() => window.received))[1];
    const context = JSON.parse(regionMessage.content[0].text.slice(regionMessage.content[0].text.indexOf('{')));
    assert.equal(context.selection.kind, 'region');
    assert.ok(Math.abs(context.selection.bounds.width - 768) < 8);
    assert.equal(context.revision, after.structuredContent.revision);
    await page.screenshot({ path: fileURLToPath(new URL('../dist/browser-stub.png', import.meta.url)) });
    assert.deepEqual(errors, []);
    process.stdout.write(`Browser stub PNG and before/after revisions verified; native desktop remains unverified.\n`);
  } finally {
    await bench.close(); await client.close(); await server.close(); await closeBrowser();
    await rm(temporary, { recursive: true, force: true });
  }
});
