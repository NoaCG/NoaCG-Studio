import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, UI_URI } from '../server.mjs';

test('MCP registers the actual thread app resource and keeps request tool app-only', async () => {
  const server = await createServer();
  const client = new Client({ name: 'protocol test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(a);
    await client.connect(b);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 2);
    const open = tools.find(({ name }) => name === 'noacg_preview');
    assert.equal(open._meta.ui.resourceUri, UI_URI);
    assert.deepEqual(open._meta['openai/ui'].entrypoints, [{ type: 'thread' }]);
    assert.deepEqual(tools.find(({ name }) => name === 'noacg_preview_request')._meta.ui.visibility, ['app']);
    const resource = await client.readResource({ uri: UI_URI });
    assert.equal(resource.contents[0].mimeType, 'text/html;profile=mcp-app');
    assert.deepEqual(resource.contents[0]._meta['openai/ui'], { availableDisplayModes: ['inline', 'fullscreen'], preferredDisplayMode: 'fullscreen' });
    assert.match(resource.contents[0].text, /sandbox="allow-scripts"/);
    assert.doesNotMatch(resource.contents[0].text, /allow-same-origin/);
    const refused = await client.callTool({ name: 'noacg_preview_request', arguments: { revision: 'unknown', selection: { kind: 'element', id: 'f0' }, request: 'Change name' } });
    assert.equal(refused.isError, true);
    assert.match(refused.content[0].text, /Refresh/);
  } finally { await client.close(); await server.close(); }
});
