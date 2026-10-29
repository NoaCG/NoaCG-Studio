import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readSource } from './source.mjs';
import { capture } from './capture.mjs';
import { buildChangeMessage } from './protocol.mjs';
import { closeBrowser } from './dist/browser.mjs';

export const UI_URI = 'ui://noacg-preview-phase2-trial/v0.1.4/panel.html';

export async function createServer({ fixtureRoot, packageRoot = fixtureRoot, entry = 'graphic.html' } = {}) {
  const server = new McpServer({ name: 'noacg-preview-phase2-trial', version: '0.1.4' });
  const html = await readFile(new URL('./app.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('./dist/app.js', import.meta.url), 'utf8');
  let snapshot;
  let operations = [];
  const loadSource = () => readSource(packageRoot, entry);
  const previewResult = (next) => {
    snapshot = next;
    const { document, targets, image, ...identity } = snapshot;
    return {
      content: [{ type: 'text', text: `Local package ${identity.revision}\nEditable source: ${identity.sourceRoot}` }, { type: 'image', data: image, mimeType: 'image/png' }],
      structuredContent: identity,
      _meta: { preview: snapshot },
    };
  };
  let pending = Promise.resolve();
  const serial = (work) => {
    const result = pending.then(work);
    pending = result.catch(() => {});
    return result;
  };
  registerAppResource(server, 'NoaCG preview trial', UI_URI, {}, async () => ({ contents: [{
    uri: UI_URI, mimeType: RESOURCE_MIME_TYPE, text: html.replace('<!-- APP_SCRIPT -->', () => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`),
    _meta: {
      ui: { csp: { connectDomains: [], resourceDomains: [], frameDomains: [] } },
      'openai/ui': { availableDisplayModes: ['inline', 'fullscreen'], preferredDisplayMode: 'fullscreen' },
    },
  }] }));
  registerAppTool(server, 'noacg_preview', {
    title: 'Open or refresh local graphic preview',
    description: 'Open the configured local graphic package beside this task, or refresh after native file edits. Returns an exact source revision and its PNG. No saved graphics or on-air output are changed.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: UI_URI }, 'openai/ui': { entrypoints: [{ type: 'thread' }] } },
  }, () => serial(async () => {
    const source = await loadSource();
    const next = await capture(source);
    if ((await loadSource()).revision !== source.revision) throw new Error('Source changed during capture. Refresh again.');
    operations = [];
    return previewResult(next);
  }));
  registerAppTool(server, 'noacg_preview_rehearse', {
    title: 'Rehearse this local graphic',
    description: 'Apply sample values or a lifecycle/operator action only in the isolated local preview. Never writes source or operates an output.',
    inputSchema: { revision: z.string(), viewId: z.string().optional(), cmd: z.enum(['update', 'play', 'next', 'stop', 'event', 'reset']), values: z.record(z.string().max(4000)).optional(), event: z.string().max(120).optional() },
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: { ui: { visibility: ['app'] } },
  }, (args) => serial(async () => {
    const source = await loadSource();
    if (!snapshot || source.revision !== args.revision) throw new Error('The source changed. Refresh and select again.');
    if (args.viewId !== snapshot.viewId) throw new Error('The rehearsal changed. Refresh and select again.');
    const operation = { cmd: args.cmd };
    if (args.cmd === 'update') {
      if (!snapshot.lifecycle.includes('update')) throw new Error('This graphic has no Update control.');
      const keys = new Set(snapshot.fields.map((field) => field.key));
      if (!args.values || Object.keys(args.values).some((key) => !keys.has(key))) throw new Error('Only declared graphic fields can be rehearsed.');
      operation.values = args.values;
    } else if (args.cmd === 'event') {
      if (!snapshot.actions.some((action) => action.event === args.event && !action.disabled)) throw new Error('Unknown operator action.');
      operation.event = args.event;
    } else if (args.cmd !== 'reset' && !snapshot.lifecycle.includes(args.cmd)) throw new Error('Unsupported lifecycle control.');
    const nextOperations = args.cmd === 'reset' ? [] : [...operations, operation];
    if (nextOperations.length > 24) throw new Error('Reset rehearsal before adding more actions (24 maximum).');
    const next = await capture(source, nextOperations);
    if ((await loadSource()).revision !== source.revision) throw new Error('Source changed during rehearsal. Refresh again.');
    operations = nextOperations;
    return previewResult(next);
  }));
  registerAppTool(server, 'noacg_preview_request', {
    title: 'Prepare selected graphic change',
    description: 'Checks the displayed source revision and returns its PNG with selection and explicit change request for ui/message to the active conversation. Does not edit source.',
    inputSchema: { revision: z.string(), viewId: z.string().optional(), selection: z.union([z.object({ kind: z.literal('element'), id: z.string() }), z.object({ kind: z.literal('region'), bounds: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }) })]), request: z.string().min(1).max(4000) },
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: { ui: { visibility: ['app'] } },
  }, (args) => serial(async () => {
    if (!snapshot || (await loadSource()).revision !== args.revision) throw new Error('The source changed. Refresh and select again.');
    if (args.viewId !== snapshot.viewId) throw new Error('The rehearsal changed. Refresh and select again.');
    const message = buildChangeMessage(snapshot, args);
    return { content: message.content, _meta: { message } };
  }));
  return server;
}

export async function start() {
  const config = JSON.parse(await readFile(new URL('./runtime.local.json', import.meta.url), 'utf8'));
  const server = await createServer({ packageRoot: config.packageRoot, entry: config.entry });
  process.once('SIGINT', async () => { await closeBrowser(); await server.close(); });
  process.once('SIGTERM', async () => { await closeBrowser(); await server.close(); });
  await server.connect(new StdioServerTransport());
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await start();
