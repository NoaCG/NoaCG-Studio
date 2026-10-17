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

export const UI_URI = 'ui://noacg-preview-trial/v0.1.2/panel.html';

export async function createServer({ fixtureRoot } = {}) {
  const server = new McpServer({ name: 'noacg-preview-trial', version: '0.1.2' });
  const html = await readFile(new URL('./app.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('./dist/app.js', import.meta.url), 'utf8');
  let snapshot;
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
    description: 'Open the opt-in local fixture beside this task, or refresh after native file edits. Returns an exact source revision and its PNG. No saved graphics or on-air output are changed.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: UI_URI }, 'openai/ui': { entrypoints: [{ type: 'thread' }] } },
  }, () => serial(async () => {
    const source = await readSource(fixtureRoot);
    const next = await capture(source);
    if ((await readSource(fixtureRoot)).revision !== source.revision) throw new Error('Source changed during capture. Refresh again.');
    snapshot = next;
    const { document, targets, image, sampleValues, ...identity } = snapshot;
    return {
      content: [{ type: 'text', text: `Local fixture ${identity.revision}\nEditable source: ${identity.sourceRoot}` }, { type: 'image', data: image, mimeType: 'image/png' }],
      structuredContent: identity,
      _meta: { preview: { document, targets, image, sampleValues, ...identity } },
    };
  }));
  registerAppTool(server, 'noacg_preview_request', {
    title: 'Prepare selected graphic change',
    description: 'Checks the displayed source revision and returns its PNG with selection and explicit change request for ui/message to the active conversation. Does not edit source.',
    inputSchema: { revision: z.string(), selection: z.union([z.object({ kind: z.literal('element'), id: z.string() }), z.object({ kind: z.literal('region'), bounds: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }) })]), request: z.string().min(1).max(4000) },
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: { ui: { visibility: ['app'] } },
  }, (args) => serial(async () => {
    if (!snapshot || (await readSource(fixtureRoot)).revision !== args.revision) throw new Error('The source changed. Refresh and select again.');
    const message = buildChangeMessage(snapshot, args);
    return { content: message.content, _meta: { message } };
  }));
  return server;
}

export async function start() {
  const server = await createServer();
  process.once('SIGINT', async () => { await closeBrowser(); await server.close(); });
  process.once('SIGTERM', async () => { await closeBrowser(); await server.close(); });
  await server.connect(new StdioServerTransport());
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await start();
