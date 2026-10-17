import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { regionFromPoints, selectionAt } from '../protocol.mjs';

// UI behavior with a minimal DOM and host, not a native Codex compatibility test.
async function mount({ toolName = 'noacg_preview', serverTools = {} } = {}) {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { style: {}, dataset: {}, value: '', handlers: {}, addEventListener(name, handler) { this.handlers[name] = handler; }, getBoundingClientRect() { return { left: 0, top: 0, width: 1920, height: 1080 }; } });
    return elements.get(id);
  };
  element('mode').value = 'element';
  const snapshot = { document: '<p>Preview</p>', targets: [{ id: 'f0', label: 'Name', bounds: { x: 10, y: 20, width: 30, height: 10 } }], sourceRoot: '/fixture', sourceFiles: ['graphic.css'], revision: 'revision' };
  const calls = [];
  let app;
  class HostApp {
    constructor() { app = this; }
    async connect() {}
    getHostCapabilities() { return { serverTools }; }
    getHostContext() { return { toolInfo: { tool: { name: toolName } } }; }
    async callServerTool(args) {
      calls.push(args.name);
      const prefix = toolName.slice(0, -'noacg_preview'.length);
      if (!args.name.startsWith(prefix)) return { isError: true, content: [{ type: 'text', text: 'Tool name must be qualified' }] };
      return args.name.endsWith('_request') ? { _meta: { message: { content: [] } } } : { _meta: { preview: snapshot } };
    }
  }
  class Extensions { message = { async send() { return {}; } }; }
  const source = (await readFile(new URL('../app.mjs', import.meta.url), 'utf8')).replace(/^import .*;\r?$/gm, '');
  vm.runInNewContext(source, { App: HostApp, OpenAIExtensions: Extensions, regionFromPoints, selectionAt, document: { getElementById: element }, ResizeObserver: class { observe() {} } });
  await new Promise(setImmediate);
  app.ontoolresult({ _meta: { preview: snapshot } });
  element('selection-layer').handlers.pointerdown({ clientX: 20, clientY: 25 });
  element('request').value = 'Make the name larger';
  element('request').handlers.input();
  return { calls, element };
}

for (const toolName of ['noacg_preview', 'mcp__preview_trial__noacg_preview', 'preview.noacg_preview']) {
  test(`panel routes request and refresh using host tool name ${toolName}`, async () => {
    const { calls, element } = await mount({ toolName });
    assert.equal(element('send').disabled, false);
    await element('send').handlers.click();
    assert.equal(element('status').textContent, 'Change and image sent to this task');
    await element('refresh').handlers.click();
    assert.deepEqual(calls, [toolName + '_request', toolName]);
  });
}

test('a message-only host cannot enable tool-dependent actions', async () => {
  const { element } = await mount({ serverTools: null });
  assert.equal(element('refresh').disabled, true);
  assert.equal(element('send').disabled, true);
});