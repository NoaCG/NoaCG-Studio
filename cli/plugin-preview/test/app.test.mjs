import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { regionFromPoints, selectionAt } from '../protocol.mjs';

// UI behavior with a minimal DOM and host, not a native Codex compatibility test.
async function mount({ toolName = 'noacg_preview', serverTools = {} } = {}) {
  const elements = new Map();
  const domNode = () => ({
    style: {}, dataset: {}, value: '', handlers: {}, attributes: {}, children: [],
    addEventListener(name, handler) { this.handlers[name] = handler; },
    setAttribute(name, value) { this.attributes[name] = value; },
    append(node) { this.children.push(node); node.parent = this; },
    remove() { this.parent.children = this.parent.children.filter((node) => node !== this); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1920, height: 1080 }; }
  });
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, domNode());
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
  vm.runInNewContext(source, { App: HostApp, OpenAIExtensions: Extensions, regionFromPoints, selectionAt, document: { getElementById: element, createElement: domNode }, ResizeObserver: class { observe() {} } });
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
test('named hit targets select by click or keyboard activation and yield to region selection', async () => {
  const { element } = await mount();
  const layer = element('selection-layer');
  const name = layer.children.find((node) => node.attributes['aria-label'] === 'Select Name');
  assert.ok(name);
  assert.equal(name.hidden, false);
  name.handlers.click();
  assert.equal(element('selected').textContent, 'Name');
  assert.equal(element('send').disabled, false);
  element('mode').value = 'region';
  element('mode').handlers.change();
  assert.equal(name.hidden, true);
  assert.equal(element('send').disabled, true);
  name.handlers.click();
  assert.equal(element('selected').textContent, 'Select part of the graphic');
  element('mode').value = 'element';
  element('mode').handlers.change();
  assert.equal(name.hidden, false);
  await element('refresh').handlers.click();
  assert.equal(layer.children.length, 1);
  assert.equal(element('send').disabled, true);
});
