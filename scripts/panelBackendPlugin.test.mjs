// guards: scripts/panelBackendPlugin.mjs
//
// /panel.json (docs/work-specs/hardware-panel-control/protocol.md §7.1): the Companion module's
// only way to find this app's backend from the address an operator types. It carries the two
// values every page already carries, in the shape the module reads, and nothing at all when the
// build has no backend.

import test from 'node:test';
import assert from 'node:assert/strict';
import { panelBackendJson } from './panelBackendPlugin.mjs';

test('panel.json names the backend the app itself uses, in the shape the module reads', () => {
  const body = panelBackendJson({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: 'pub-key', OTHER: 'x' });
  assert.deepEqual(JSON.parse(body), { v: 1, supabaseUrl: 'https://abc.supabase.co', supabaseKey: 'pub-key' });
});

test('with no backend configured there is no panel.json', () => {
  assert.equal(panelBackendJson({}), null);
  assert.equal(panelBackendJson({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: '' }), null);
});
