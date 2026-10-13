// guards: src/backend/connectorAccess.ts
//
// The connector consent page never has two reads of one authorization in flight. Auth answers one
// of two overlapping reads of a fresh authorization with a 404, and React StrictMode runs the
// page's effect twice, so the second read turned a good sign-in request into "This sign-in request
// cannot continue" on most dev loads (docs/REMOTE_MCP_PLAN.md, phase 2 notes). The real module runs
// here against a counted, delayed Auth stub.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/backend/connectorAccess.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

/** A fresh copy of the module, whose Auth answers each read when the test says so. */
function harness() {
  const reads = [];
  const answer = (id) => new Promise((resolve) => reads.push({ id, resolve }));
  const stubs = {
    './supabase': { getSupabase: async () => ({ auth: { oauth: { getAuthorizationDetails: answer } } }) },
    './agentAccess': {},
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    URL,
    require: (name) => {
      assert.ok(name in stubs, `unexpected dependency: ${name}`);
      return stubs[name];
    },
  });
  return { module: exports, reads };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));
const asks = (id) => ({
  data: { authorization_id: id, client: { name: 'Claude' }, redirect_uri: 'https://claude.ai/api/mcp/auth_callback' },
  error: null,
});

test('two overlapping reads of one authorization ask Auth once and get the same answer', async () => {
  const { module, reads } = harness();
  const first = module.readConnectorRequest('authz-1');
  const second = module.readConnectorRequest('authz-1');
  await settle();
  assert.equal(reads.length, 1);
  reads[0].resolve(asks('authz-1'));
  const expected = { kind: 'ask', clientName: 'Claude', returnsTo: 'claude.ai' };
  assert.deepEqual({ ...(await first) }, expected);
  assert.deepEqual({ ...(await second) }, expected);
});

test('overlapping readers share a refusal too', async () => {
  const { module, reads } = harness();
  const first = module.readConnectorRequest('authz-1');
  const second = module.readConnectorRequest('authz-1');
  await settle();
  assert.equal(reads.length, 1);
  reads[0].resolve({ data: null, error: { status: 404 } });
  await assert.rejects(first, /unknown or has expired/);
  await assert.rejects(second, /unknown or has expired/);
});

test('a read after the first settled asks Auth again, under the session the page has then', async () => {
  const { module, reads } = harness();
  const first = module.readConnectorRequest('authz-1');
  await settle();
  reads[0].resolve({ data: null, error: { status: 401 } });
  await assert.rejects(first);
  const again = module.readConnectorRequest('authz-1');
  await settle();
  assert.equal(reads.length, 2);
  reads[1].resolve(asks('authz-1'));
  assert.equal((await again).clientName, 'Claude');
});

test('each authorization is read on its own', async () => {
  const { module, reads } = harness();
  module.readConnectorRequest('authz-1');
  module.readConnectorRequest('authz-2');
  await settle();
  assert.deepEqual(reads.map((r) => r.id), ['authz-1', 'authz-2']);
});

test('the page returns to a web address or a known desktop app, never to another scheme', () => {
  const { module } = harness();
  for (const url of [
    'https://claude.ai/api/mcp/auth_callback?code=x',
    'http://localhost:53682/callback?code=x',
    'claude://claude.ai/mcp-auth-callback/sdk?code=x',
  ]) {
    assert.equal(module.webRedirect(url), url);
  }
  for (const url of [
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,x',
    'file:///C:/x',
    'blob:https://noacg.studio/x',
    'search-ms:query=x',
    'ms-msdt:/id x',
    'intent://x#Intent;end',
    'cursor://anysphere.cursor-retrieval/oauth/callback?code=x',
  ]) {
    assert.throws(() => module.webRedirect(url), /will not open/, url);
  }
});

test('the consent page names an app scheme in the return address, so a client cannot pose as a web host', async () => {
  const { module, reads } = harness();
  const read = module.readConnectorRequest('authz-app');
  await settle();
  reads[0].resolve({
    data: { authorization_id: 'authz-app', client: { name: 'Claude' }, redirect_uri: 'claude://claude.ai/mcp-auth-callback/sdk' },
    error: null,
  });
  assert.equal((await read).returnsTo, 'claude://claude.ai');
});
