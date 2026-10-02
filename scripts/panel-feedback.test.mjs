// guards: src/control/panelFeedback.ts, src/model/rundownRows.ts
//
// HARDWARE PANELS, THE PAGE'S CHECKS (docs/work-specs/hardware-panel-control/spec.md AC-4, AC-7;
// protocol.md §6.2 and §8): a relayed press is judged against what the page shows now and what its
// key showed, a press id runs once, and the state a panel draws from changes only when something a
// key shows changed. Pure, run here in Node.

import test from 'node:test';
import assert from 'node:assert/strict';

const { judgePress, panelClip, snapshotChanged, rowsChanged, readPress, PressMemory, SnapshotRing, wireState, wireRows, rundownPanelRows, PANEL_ROWS_MAX, SHARED_PANEL_VERBS } =
  await import('../src/control/panelFeedback.ts');
const { rundownView } = await import('../src/model/rundownRows.ts');

const allowed = (over = {}) => Object.fromEntries(SHARED_PANEL_VERBS.map((v) => [v, over[v] ?? true]));
const snap = (over = {}) => ({
  title: 'Friday match',
  selected: 'cue_a',
  space: 'take',
  live: [],
  allowed: allowed(),
  blocked: [],
  clip: null,
  bridge: 'off',
  rows: [
    { id: 'cue_a', label: 'Anna', kind: 'cue', source: 'graphic' },
    { id: 'cue_b', label: 'Ben', kind: 'cue', source: 'graphic' },
  ],
  ...over,
});
const press = (over = {}) => ({ verb: 'take', target: 'cue_a', seen: 1, pressId: 'abcdef:1', claim: 3, panel: { id: 'k', label: 'Desk' }, ...over });
const ALL = new Set(['take', 'retake', 'update', 'next', 'out', 'select-prev', 'select-next', 'pause', 'resume', 'pause-toggle', 'all-out', 'select-cue', 'take-cue']);

test('a press on the row its key showed runs', () => {
  assert.equal(judgePress(press(), snap(), snap(), ALL), null);
  assert.equal(judgePress(press({ verb: 'out' }), snap(), snap(), ALL), null);
});

test('a press whose selection moved is refused stale, and says so', () => {
  const v = judgePress(press(), snap({ selected: 'cue_b' }), snap(), ALL);
  assert.deepEqual(v, { outcome: 'stale', note: 'the selection moved' });
  assert.equal(judgePress(press({ verb: 'update' }), snap({ selected: 'cue_b' }), snap(), ALL).outcome, 'stale');
});

test("Take refuses when the toggle's direction changed since the key was drawn, or the key is too old", () => {
  // The key said TAKE; the cue went on air from another screen, so SPACE would now take it off.
  assert.equal(judgePress(press(), snap({ space: 'take-off', live: ['cue_a'] }), snap(), ALL).outcome, 'stale');
  assert.equal(judgePress(press(), snap(), undefined, ALL).outcome, 'stale');
});

test('walking the rundown and All out are never stale', () => {
  for (const verb of ['select-prev', 'select-next', 'all-out']) {
    assert.equal(judgePress(press({ verb, target: '' }), snap({ selected: 'cue_b' }), undefined, ALL), null, verb);
  }
});

test('Take a cue: a cue gone from the rundown, or one that went on or off air since, is stale', () => {
  assert.equal(judgePress(press({ verb: 'take-cue', target: 'cue_b' }), snap(), snap(), ALL), null);
  assert.equal(judgePress(press({ verb: 'take-cue', target: 'gone' }), snap(), snap(), ALL).outcome, 'stale');
  assert.equal(judgePress(press({ verb: 'take-cue', target: 'cue_b' }), snap({ live: ['cue_b'] }), snap(), ALL).outcome, 'stale');
  assert.equal(judgePress(press({ verb: 'take-cue', target: 'cue_b' }), snap({ live: ['cue_b'] }), snap({ live: ['cue_b'] }), ALL), null, 'taking it off as the key showed');
  assert.equal(judgePress(press({ verb: 'select-cue', target: 'gone' }), snap(), snap(), ALL).outcome, 'stale');
});

test('pause-toggle refuses when the clip, or whether it is paused, changed', () => {
  const clip = (phase) => ({ cue: 'vt', label: 'VT', phase, start: null, end: 1, remaining: 5, estimated: false, next: null });
  const p = press({ verb: 'pause-toggle', target: 'vt' });
  assert.equal(judgePress(p, snap({ clip: clip('counting') }), snap({ clip: clip('counting') }), ALL), null);
  assert.equal(judgePress(p, snap({ clip: clip('paused') }), snap({ clip: clip('counting') }), ALL).outcome, 'stale');
  assert.equal(judgePress(p, snap({ clip: null }), snap({ clip: clip('counting') }), ALL).outcome, 'stale');
});

test('a greyed verb or a blocked cue is not allowed; a verb this page does not run is not here', () => {
  assert.deepEqual(judgePress(press({ verb: 'out' }), snap({ allowed: allowed({ out: false }) }), snap(), ALL), { outcome: 'not-allowed', note: 'Out is not allowed right now' });
  assert.equal(judgePress(press({ verb: 'take-cue', target: 'cue_b' }), snap({ blocked: ['cue_b'] }), snap(), ALL).outcome, 'not-allowed');
  assert.equal(judgePress(press({ verb: 'pause', target: 'cue_a' }), snap(), snap(), new Set(['take'])).outcome, 'not-here');
});

test('a press id is remembered with its answer, for ten minutes and the last 256', () => {
  const m = new PressMemory(3, 1000);
  m.remember('a:1', { outcome: 'ran' }, 0);
  assert.deepEqual(m.get('a:1', 500), { outcome: 'ran' });
  assert.equal(m.get('a:1', 1000), null);
  for (const id of ['a:2', 'a:3', 'a:4', 'a:5']) m.remember(id, { outcome: 'ran' }, 0);
  assert.equal(m.get('a:2', 1), null, 'the oldest falls out');
  assert.deepEqual(m.get('a:5', 1), { outcome: 'ran' });
});

test('the ring keeps the last states by version', () => {
  const r = new SnapshotRing(2);
  r.put(1, snap());
  r.put(2, snap({ selected: 'cue_b' }));
  r.put(3, snap());
  assert.equal(r.get(1), undefined);
  assert.equal(r.get(2).selected, 'cue_b');
});

test('a state changes for what a key shows, never for the clock drifting between renders', () => {
  const clip = (end, remaining = 20) => ({ cue: 'vt', label: 'VT', phase: 'counting', start: null, end, remaining, estimated: false, next: null });
  assert.equal(snapshotChanged(null, snap()), true);
  assert.equal(snapshotChanged(snap(), snap()), false);
  assert.equal(snapshotChanged(snap(), snap({ live: ['cue_a'] })), true);
  assert.equal(snapshotChanged(snap({ clip: clip(10_000) }), snap({ clip: clip(10_120, 19.1) })), false);
  assert.equal(snapshotChanged(snap({ clip: clip(10_000) }), snap({ clip: clip(13_000) })), true, 'a seek or a new clip');
  assert.equal(snapshotChanged(snap({ clip: clip(10_000) }), snap({ clip: clip(null) })), true);
  assert.equal(rowsChanged(null, snap().rows), true);
  assert.equal(rowsChanged(snap().rows, snap().rows), false);
});

test("the clip clock goes out as an end in the page's clock; paused and holding say so", () => {
  const clock = (over) => ({ slot: '1-10', itemId: 'i', cueId: 'vt', label: 'Opening VT', file: 'vt.mp4', end: 'hold', phase: 'counting', remaining: 30, over: 0, estimated: false, ...over });
  assert.deepEqual(panelClip(clock({}), 1_000), { cue: 'vt', label: 'Opening VT', phase: 'counting', start: null, end: 31_000, remaining: 30, estimated: false, next: null });
  assert.equal(panelClip(clock({ phase: 'warning', remaining: 8 }), 0).phase, 'counting', 'the module works out the warnings itself');
  assert.equal(panelClip(clock({ toStudio: 50, next: { label: 'VT 2', length: 20 } }), 0).end, 50_000, 'TO STUDIO when a clip follows');
  assert.equal(panelClip(clock({ phase: 'paused', remaining: 12 }), 0).end, null);
  assert.equal(panelClip(clock({ phase: 'holding', remaining: 0, over: 3 }), 10_000).end, 7_000);
  assert.equal(panelClip(null, 0), null);
});

test('a press reads only from a well-formed payload with press_id, never Realtime\'s own id', () => {
  const p = { v: 1, id: 'realtime-uuid', verb: 'take', target: 'cue_a', seen: 4, press_id: 'abc123:7', claim: 2, panel: { id: 'k', label: 'Desk' } };
  assert.equal(readPress(p).pressId, 'abc123:7');
  assert.equal(readPress({ ...p, verb: 'paste' }), null);
  assert.equal(readPress({ ...p, press_id: undefined }), null);
});

test('the wire state and rows carry what protocol §8 names, rows capped', () => {
  const s = wireState(snap(), { ver: 4, rowsVer: 1, page: 'p', claim: 2, where: 'control', label: 'Phone', at: 9 });
  assert.deepEqual(Object.keys(s).sort(), ['allowed', 'at', 'blocked', 'bridge', 'claim', 'clip', 'label', 'live', 'page', 'rowsVer', 'selected', 'space', 'title', 'v', 'ver', 'warn', 'where'].sort());
  assert.deepEqual(s.warn, [10, 5]);
  const many = Array.from({ length: PANEL_ROWS_MAX + 5 }, (_, i) => ({ id: `c${i}`, label: `${i}`, kind: 'cue', source: 'graphic' }));
  const r = wireRows(many, 3);
  assert.equal(r.rows.length, PANEL_ROWS_MAX);
  assert.equal(r.more, true);
});

test("the production page's rows go to a panel as drawn, with a collapsed folder's cues under its header", () => {
  const cues = [
    { id: 'a', sourceId: 'g', label: 'Anna', values: {} },
    { id: 'vt', sourceId: 'i', source: 'playout', label: 'Opening VT', values: {}, folderId: 'f' },
    { id: 'b', sourceId: 'g', label: 'Ben', values: {}, folderId: 'f' },
    { id: 'c', sourceId: 'g', label: 'Cleo', values: {}, folderId: 'shut' },
  ];
  const folders = [
    { id: 'f', name: 'Opening', mode: 'manual' },
    { id: 'shut', name: ' ', mode: 'manual', collapsed: true },
  ];
  assert.deepEqual(rundownPanelRows(rundownView({ cues, folders }).rows), [
    { id: 'a', label: 'Anna', kind: 'cue', source: 'graphic' },
    { id: 'folder:f', label: 'Opening', kind: 'folder', source: null },
    { id: 'vt', label: 'Opening VT', kind: 'cue', source: 'server', folder: 'f' },
    { id: 'b', label: 'Ben', kind: 'cue', source: 'graphic', folder: 'f' },
    // Collapsed: the header is the drawn row, and its cue still gets a key.
    { id: 'folder:shut', label: 'Untitled folder', kind: 'folder', source: null },
    { id: 'c', label: 'Cleo', kind: 'cue', source: 'graphic', folder: 'shut' },
  ]);
  // A take-cue for a hidden cue is judged against these rows, so it is a row and not stale.
  const rows = rundownPanelRows(rundownView({ cues, folders }).rows);
  assert.equal(judgePress(press({ verb: 'take-cue', target: 'c' }), snap({ rows }), snap({ rows }), ALL), null);
});
