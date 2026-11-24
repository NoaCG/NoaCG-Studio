// guards: src/control/companionHealth.ts, src/control/panelRelay.ts, src/components/control/PanelControl.tsx, supabase/migrations/0128_panel_seen.sql
//
// IS A COMPANION CONNECTED? (docs/work-specs/live-production-reliability/spec.md P4 AC-2). The
// panel chip is green only when a paired Companion reported in the last 45 s; amber when it has
// not, when it is still connecting or needs an update; red when a Companion holds a revoked key. Pure.

import test from 'node:test';
import assert from 'node:assert/strict';

const { companionHealth, panelHealth, healthWords, healthTone, panelWords, SEEN_FRESH_S } = await import('../src/control/companionHealth.ts');

const READ = 1_000_000_000_000;
const panel = (over = {}) => ({
  id: 'k1',
  label: 'Desk',
  created_at: '2026-11-23T10:00:00Z',
  last_used_at: null,
  seen_s: 3,
  module_version: '0.4.0',
  module_status: 'ok',
  ...over,
});
const list = (panels, over = {}) => ({ claim: 1, answering: null, panels, refused_s: null, readAt: READ, ...over });

test('a Companion that reported ok in the last 45 s is connected, and only that is green', () => {
  const h = companionHealth(list([panel()]), READ);
  assert.deepEqual(h, { kind: 'connected' });
  assert.equal(healthWords(h, READ), 'Companion connected');
  assert.equal(healthTone(h), 'ok');
  // Its keys refuse presses in these: amber, never green.
  for (const status of ['no-page', 'connecting', 'offline', 'pairing', null]) {
    assert.deepEqual(companionHealth(list([panel({ module_status: status })]), READ), { kind: 'connecting' }, String(status));
  }
  for (const h of [
    { kind: 'connecting' },
    { kind: 'update' },
    { kind: 'unseen', since: null },
    { kind: 'none' },
  ])
    assert.equal(healthTone(h), 'warn');
  assert.equal(healthTone({ kind: 'refused' }), 'bad');
});

test('the age counts from the database seconds and this page clock, so it turns amber after 45 s', () => {
  const l = list([panel({ seen_s: 10 })]);
  assert.equal(companionHealth(l, READ + (SEEN_FRESH_S - 11) * 1000).kind, 'connected');
  const h = companionHealth(l, READ + (SEEN_FRESH_S - 10) * 1000);
  assert.deepEqual(h, { kind: 'unseen', since: READ - 10_000 });
  assert.match(healthWords(h, READ + 60_000), /^Companion not seen since \S/);
  assert.match(panelWords(h, READ + 60_000), /^not seen since \S/);
});

test('a panel paired and never reported is not seen yet; a module from before the report needs an update', () => {
  assert.deepEqual(companionHealth(list([panel({ seen_s: null, module_version: null, module_status: null })]), READ), {
    kind: 'unseen',
    since: null,
  });
  assert.equal(healthWords({ kind: 'unseen', since: null }, READ), 'Companion not seen yet');
  const old = panel({ seen_s: null, module_version: null, module_status: null, last_used_at: '2026-11-23T10:05:00Z' });
  assert.deepEqual(panelHealth(old, READ, READ), { kind: 'update' });
  assert.equal(healthWords(companionHealth(list([old]), READ), READ), 'Companion needs an update');
  // A database from before 0128 answers no seen_s at all: the same.
  const bare = { ...old };
  delete bare.seen_s;
  delete bare.module_version;
  delete bare.module_status;
  assert.deepEqual(panelHealth(bare, READ, READ), { kind: 'update' });
});

test('what the module reports: outdated needs an update, offline is connecting', () => {
  assert.equal(healthWords(companionHealth(list([panel({ module_status: 'outdated' })]), READ), READ), 'Companion needs an update');
  assert.equal(healthWords(companionHealth(list([panel({ module_status: 'offline' })]), READ), READ), 'Companion connecting');
});

test('a time from another day carries its date', () => {
  const now = new Date(2026, 10, 23, 9, 0).getTime();
  const yesterday = new Date(2026, 10, 22, 23, 10).getTime();
  assert.ok(healthWords({ kind: 'unseen', since: yesterday }, now).includes(new Date(yesterday).toLocaleDateString()));
  assert.ok(!healthWords({ kind: 'unseen', since: now - 60_000 }, now).includes(new Date(now).toLocaleDateString()));
});

test('a revoked key still reporting says pair again, unless another Companion is connected', () => {
  const refused = companionHealth(list([], { refused_s: 5 }), READ);
  assert.deepEqual(refused, { kind: 'refused' });
  assert.equal(healthWords(refused, READ), 'Panel key refused, pair again');
  assert.equal(companionHealth(list([panel()], { refused_s: 5 }), READ).kind, 'connected');
  assert.equal(companionHealth(list([panel({ seen_s: 300 })], { refused_s: 5 }), READ).kind, 'refused');
  // A refused report older than 45 s is forgotten.
  assert.deepEqual(companionHealth(list([], { refused_s: 60 }), READ), { kind: 'none' });
});

test('with several panels: green if any is connected, else the newest time any was seen', () => {
  const h = companionHealth(list([panel({ id: 'a', seen_s: 600 }), panel({ id: 'b', seen_s: 120 })]), READ);
  assert.deepEqual(h, { kind: 'unseen', since: READ - 120_000 });
  assert.equal(companionHealth(list([panel({ id: 'a', seen_s: 600 }), panel({ id: 'b', seen_s: 2 })]), READ).kind, 'connected');
  assert.equal(companionHealth(null, READ), null);
  assert.deepEqual(companionHealth(list([]), READ), { kind: 'none' });
});
