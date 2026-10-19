// Protocol/browser evidence, never proof of a real Codex desktop integration.
import assert from 'node:assert/strict';
import { UI_URI } from '../server.mjs';

export async function mountHost(client, bench, initial) {
  const resource = (await client.readResource({ uri: UI_URI })).contents[0];
  const html = resource.text.replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; font-src data:; connect-src \'none\'; frame-src \'none\'">');
  const page = await bench.newPage();
  const errors = [];
  const calls = [];
  const consoleMessages = [];
  const failedRequests = [];
  page.on('console', (message) => { if (['warning', 'error'].includes(message.type())) consoleMessages.push({ type: message.type(), text: message.text().slice(0, 2000) }); });
  page.on('requestfailed', (request) => failedRequests.push({ url: request.url().startsWith('data:') ? '<embedded resource>' : request.url(), error: request.failure()?.errorText }));
  page.on('pageerror', (error) => errors.push(error.message));
  const prefix = 'mcp__preview_trial__';
  const openTool = (await client.listTools()).tools.find(({ name }) => name === 'noacg_preview');
  await page.exposeBinding('callTrialTool', ({ frame }, { name, ...params }) => {
    assert.equal(frame, page.mainFrame(), 'only the simulated trusted host may call tools');
    assert.ok(name.startsWith(prefix), 'host requires the qualified tool name');
    calls.push({ name, ...params });
    return client.callTool({ ...params, name: name.slice(prefix.length) });
  });
  await page.setViewportSize({ width: 1100, height: 1400 });
  await page.setContent('<iframe id="app" style="width:800px;height:1300px;border:0"></iframe>');
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
  }, { html, initial, qualifiedTool: { ...openTool, name: prefix + openTool.name } });
  const ui = page.frameLocator('#app');
  await ui.getByRole('status').filter({ hasText: 'Ready' }).waitFor();
  return { page, ui, graphic: ui.frameLocator('#graphic'), errors, calls, consoleMessages, failedRequests };
}
