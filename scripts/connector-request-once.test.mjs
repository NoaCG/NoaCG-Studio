// guards: src/backend/connectorAccess.ts
//
// The connector consent page reads its authorization from Supabase Auth ONCE per page. Auth
// answers one of two overlapping reads of a fresh authorization with a 404, and React StrictMode
// runs the page's effect twice, so a second read turned a good sign-in request into "This sign-in
// request cannot continue" on most dev loads (docs/REMOTE_MCP_PLAN.md, phase 2 notes). The real
// module runs here against a counted, delayed Auth stub.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/backend/connectorAccess.ts', import.meta.url), 'utf8');

/** A fresh copy of the module, whose Auth answers each read when the test says so. */
function harness() {
  const reads = [];
  const answer = (id) => new Promise((resolve) => reads.push({ id, resolve }));
  const stubs = {
    './supabase': { getSupabase: async () => ({ auth: { oauth: { getAuthorizationDetails: answer } } }) },
    './agentAccess': {},
  };
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
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

test('a read after the first settled is answered without asking Auth again', async () => {
  const { module, reads } = harness();
  const first = module.readConnectorRequest('authz-1');
  await settle();
  reads[0].resolve(asks('authz-1'));
  await first;
  const again = module.readConnectorRequest('authz-1');
  await settle();
  assert.equal(reads.length, 1);
  assert.equal(await again, await first);
});

test('a refusal is not asked again either, and is still reported to every reader', async () => {
  const { module, reads } = harness();
  const first = module.readConnectorRequest('authz-1');
  const second = module.readConnectorRequest('authz-1');
  await settle();
  assert.equal(reads.length, 1);
  reads[0].resolve({ data: null, error: { status: 404 } });
  await assert.rejects(first, /unknown or has expired/);
  await assert.rejects(second, /unknown or has expired/);
  const again = module.readConnectorRequest('authz-1');
  await settle();
  assert.equal(reads.length, 1);
  await assert.rejects(again, /unknown or has expired/);
});

test('each authorization is read on its own', async () => {
  const { module, reads } = harness();
  module.readConnectorRequest('authz-1');
  module.readConnectorRequest('authz-2');
  await settle();
  assert.deepEqual(reads.map((r) => r.id), ['authz-1', 'authz-2']);
});
