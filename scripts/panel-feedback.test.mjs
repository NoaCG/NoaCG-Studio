// guards: src/control/panelFeedback.ts, src/control/panelActions.ts, src/model/rundownRows.ts, supabase/migrations/0103_panel_graphic_actions.sql
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
  const rows = rundownPanelRows(rundownView({ cues, folders }).rows);
  assert.deepEqual(rows, [
    { id: 'a', label: 'Anna', kind: 'cue', source: 'graphic' },
    { id: 'folder:f', label: 'Opening', kind: 'folder', source: null },
    { id: 'vt', label: 'Opening VT', kind: 'cue', source: 'server', folder: 'f' },
    { id: 'b', label: 'Ben', kind: 'cue', source: 'graphic', folder: 'f' },
    // Collapsed: the header is the drawn row, and its cue still gets a key.
    { id: 'folder:shut', label: 'Untitled folder', kind: 'folder', source: null },
    { id: 'c', label: 'Cleo', kind: 'cue', source: 'graphic', folder: 'shut' },
  ]);
  // A take-cue for a hidden cue is judged against these rows, so it is a row and not stale.
  assert.equal(judgePress(press({ verb: 'take-cue', target: 'c' }), snap({ rows }), snap({ rows }), ALL), null);
});


// ── GRAPHIC ACTIONS (docs/work-specs/playout-companion-actions/spec.md E6.1, protocol.md §10) ──────

await import('./lib/tsResolve.mjs');
const { readFileSync } = await import('node:fs');
const {
  ACTIONS_PROTOCOL, ACTION_VERB, ACTION_ARGS_MAX_CHARS, ACTION_ARGS_MAX_DEPTH, ACTION_CAPS_MAX, ACTION_GRAPHICS_MAX, CAP_ID,
  ActionsRing, capabilityPress, foreignCapabilities, graphicCapabilities, judgeAction, panelGraphic, readActionPress, wireActions,
} = await import('../src/control/panelActions.ts');
const { arrangeControls, fieldDescriptors } = await import('../src/control/controlModel.ts');
const { liveNumberFields, pickOptions } = await import('../src/control/liveControls.ts');

/** A quiz-and-score graphic as the page reads it: a goal, a reveal, a pick off the default path,
 *  a hidden reset, and two number fields one of which the goal moves. */
const quizButtons = [
  { event: 'goal', label: 'Goal', adjust: { home: 1 } },
  { event: 'reveal', label: 'Reveal', section: 'Quiz' },
  { event: 'choose', label: 'Answer', payload: ['picked'] },
  { event: 'reset', label: 'Reset', set: { home: '0' } },
];
const quizFields = fieldDescriptors([
  { field: 'home', ftype: 'number', title: 'Home', value: '0' },
  { field: 'away', ftype: 'number', title: 'Away', value: '0' },
  { field: 'picked', ftype: 'dropdown', title: 'Picked', value: '', items: [{ text: '—', value: '' }, { text: 'Answer A', value: 'A' }, { text: 'Answer B', value: 'B' }] },
]);
const path = new Set(['reveal']);
const arrange = { goal: { name: '+1 HOME', pinned: true }, reset: { hidden: true } };
const controls = (over = {}) => ({
  graphic: 'Quiz',
  pinned: false,
  live: 'cue_q1',
  cue: 'Question 1',
  arranged: arrangeControls(quizButtons, arrange, (b) => pickOptions(b, quizFields, path, quizButtons)),
  numbers: liveNumberFields(quizFields, quizButtons),
  legal: (event) => event !== 'reveal',
  stepping: true,
  aired: { picked: 'B' },
  ...over,
});

test('a graphic advertises exactly the controls its live block draws: ids, labels, order, places, options and greying (AC-1)', () => {
  const caps = graphicCapabilities(controls());
  // The block's own order: pinned, the sections in first-seen order, More, then the ± numbers.
  assert.deepEqual(
    caps.map((c) => [c.id, c.label, c.place, c.section ?? null, c.allowed]),
    [
      ['event:goal', '+1 HOME', 'pinned', null, true],
      ['event:reveal', 'Reveal', 'section', 'Quiz', false],
      ['event:choose', 'Answer', 'section', 'Actions', true],
      ['event:reset', 'Reset', 'more', null, true],
      ['step:home', 'Home', 'section', null, true],
      ['step:away', 'Away', 'section', null, true],
    ],
  );
  // A field an event carries as payload gets no stepper: the page's own rule, not a copy of it.
  assert.equal(graphicCapabilities(controls({ numbers: liveNumberFields(quizFields, [...quizButtons, { event: 'show', label: 'Show', payload: ['away'] }]) })).some((c) => c.id === 'step:away'), false);
  const pick = caps.find((c) => c.id === 'event:choose');
  assert.deepEqual(pick.options, [{ value: 'A', label: 'Answer A' }, { value: 'B', label: 'Answer B' }]);
  assert.equal(pick.active, 'B');
  assert.deepEqual(pick.args.properties[0].node.enum, ['A', 'B']);
  assert.equal(caps.find((c) => c.id === 'event:reveal').note, "Reveal cannot fire in the graphic's state now");
  // Off air, everything is drawn and nothing may be pressed, saying why.
  const off = graphicCapabilities(controls({ live: null }));
  assert.ok(off.every((c) => !c.allowed && c.note === 'Quiz is off air'));
  // A layer airing a cue this page does not hold: controls follow `legal`, numbers do not step.
  assert.equal(graphicCapabilities(controls({ stepping: false })).find((c) => c.id === 'step:away').allowed, false);
});

test('a graphic with nothing to press, or a name the relay cannot carry, is not offered', () => {
  assert.equal(panelGraphic(controls({ arranged: { pinned: [], sections: [], more: [] }, numbers: [] })), null);
  assert.equal(panelGraphic(controls({ graphic: 'x'.repeat(129) })), null);
  assert.equal(panelGraphic(controls({ graphic: 'x'.repeat(128) }))?.graphic.length, 128);
  const many = { pinned: Array.from({ length: ACTION_CAPS_MAX + 4 }, (_, i) => ({ button: { event: `e${i}`, label: `E${i}` }, label: `E${i}`, named: false })), sections: [], more: [] };
  assert.equal(graphicCapabilities(controls({ arranged: many, numbers: [] })).length, ACTION_CAPS_MAX);
  assert.deepEqual([ACTION_CAPS_MAX, ACTION_GRAPHICS_MAX], [48, 32]);
});

test('the actions event carries `av` and no `v`, so a module that predates it ignores it (AC-3)', () => {
  const graphics = Array.from({ length: ACTION_GRAPHICS_MAX + 1 }, (_, i) => ({ graphic: `G${i}`, pinned: false, live: null, cue: null, caps: [] }));
  const w = wireActions({ relay: true, graphics }, { actionsVer: 7_000_001, page: 'p', claim: 7 });
  assert.equal('v' in w, false);
  assert.equal(w.av, ACTIONS_PROTOCOL);
  assert.equal(w.graphics.length, ACTION_GRAPHICS_MAX);
  assert.equal(w.more, true);
});

/** A relayed press as `panel_press` (0103) forwards it. */
const actionPress = (over = {}) => ({ v: 2, verb: ACTION_VERB, target: 'Quiz', seen: 4, press_id: 'deck01:1', claim: 7, panel: { id: 'k', label: 'Desk' }, cap: 'event:choose', instance: 'cue_q1', args: { option: 'A' }, ...over });
const offered = (over = {}) => ({ relay: true, graphics: [panelGraphic(controls(over))] });

test('a relayed press is read only within the relay\'s own bounds, each pinned at its edge; one past a bound is answered, never dropped', () => {
  const ok = (over) => {
    const r = readActionPress(actionPress(over));
    return !!r && !('invalid' in r);
  };
  const out = (over) => readActionPress(actionPress(over))?.invalid;
  assert.equal(readActionPress(actionPress()).cap, 'event:choose');
  // Not a graphic action, or nothing to answer it by: not this reader's.
  assert.equal(readActionPress(actionPress({ verb: 'take' })), null);
  assert.equal(readActionPress(actionPress({ press_id: 7 })), null);
  // Out of bounds: answered `invalid` with the bound, under the press's own id and claim.
  assert.deepEqual(readActionPress(actionPress({ v: 1 })), { invalid: 'a graphic action of another protocol', pressId: 'deck01:1', claim: 7, panel: { id: 'k', label: 'Desk' } });
  assert.equal(out({ target: '' }), 'target');
  assert.ok(ok({ target: 'x'.repeat(128) }));
  assert.equal(out({ target: 'x'.repeat(129) }), 'target');
  assert.ok(ok({ cap: `event:${'x'.repeat(96)}` }));
  assert.equal(out({ cap: `event:${'x'.repeat(97)}` }), 'cap');
  assert.equal(out({ cap: 'paste:x' }), 'cap');
  assert.equal(out({ cap: 'event:a\u0007' }), 'cap');
  assert.ok(ok({ instance: 'x'.repeat(128) }));
  assert.equal(out({ instance: 'x'.repeat(129) }), 'instance');
  assert.equal(out({ args: [1] }), 'args');
  // `{"t":"…"}` is the string and eight characters.
  assert.deepEqual([ACTION_ARGS_MAX_CHARS, ACTION_ARGS_MAX_DEPTH], [4096, 8]);
  assert.ok(ok({ args: { t: 'x'.repeat(4088) } }));
  assert.equal(out({ args: { t: 'x'.repeat(4089) } }), 'args-size');
  // Counted in characters as the relay counts them, not in UTF-16 units: 4088 emoji are 4096.
  assert.ok(ok({ args: { t: '\u{1F600}'.repeat(4088) } }));
  assert.equal(out({ args: { t: '\u{1F600}'.repeat(4089) } }), 'args-size');
  let deep = 1;
  for (let i = 0; i < 7; i++) deep = [deep];
  assert.ok(ok({ args: { d: deep } }), 'the object and seven more levels');
  assert.equal(out({ args: { d: [deep] } }), 'args: nested deeper than 8', 'one more is refused');
  // The relay's regular expressions say the same as the page's: one source of truth in the SQL.
  const sql = readFileSync(new URL('../supabase/migrations/0103_panel_graphic_actions.sql', import.meta.url), 'utf8');
  assert.match(sql, /length\(v_args::text\) > 4096/);
  assert.match(sql, /v_depth > 8/);
  assert.match(sql, /\^\(event\|step\|foreign\):\[\^\[:cntrl:\]\]\{1,96\}\$/);
  assert.ok(CAP_ID.test('step:home'));
});

test('hostile argument input is refused in time linear in its size (AC-3)', () => {
  const time = (args) => {
    const t = process.hrtime.bigint();
    assert.ok(readActionPress(actionPress({ args })).invalid);
    return Number(process.hrtime.bigint() - t) / 1e6;
  };
  // Deep nesting is refused at its depth, never followed (and never overflows the stack).
  let deep = {};
  for (let i = 0; i < 100_000; i++) deep = { d: deep };
  // Wide input is refused by the value count before its text is ever made.
  const wide = { list: Array.from({ length: 200_000 }, (_, i) => i) };
  // One long string is measured to its bound and no further.
  const long = { t: 'x'.repeat(5_000_000) };
  const ms = [time(deep), time(wide), time(long)];
  assert.ok(ms.every((m) => m < 500), `took ${ms.join(', ')} ms`);
});

test('a graphic action is judged by capability id, instance, arguments and greying, against what its key showed (AC-2)', () => {
  const now = offered();
  const ring = new ActionsRing();
  ring.put(4, now);
  const judge = (over, current = now) => judgeAction(readActionPress(actionPress(over)), current, ring.get(readActionPress(actionPress(over)).seen));
  assert.deepEqual(judge({}).run.args, { option: 'A' });
  assert.equal(judge({}).run.cap.id, 'event:choose');
  assert.deepEqual(judge({ seen: 3 }), { refused: 'stale', note: 'the key was drawn too long ago' });
  assert.deepEqual(judge({ target: 'Banner' }), { refused: 'stale', note: 'Banner is no longer in the production' });
  // A saved key is never rebound by label or position: an unknown id is stale.
  assert.deepEqual(judge({ cap: 'event:choose2' }), { refused: 'stale', note: 'that action is no longer on Quiz' });
  // The cue the key showed live is no longer the one on the layer: another question was taken.
  assert.deepEqual(judge({ instance: 'cue_q0' }), { refused: 'stale', note: 'the cue on Quiz changed' });
  assert.deepEqual(judge({ instance: 'cue_q1' }, offered({ live: null })), { refused: 'not-allowed', note: 'Quiz is off air' });
  assert.deepEqual(judge({ args: { option: 'C' } }), { refused: 'invalid', note: 'Answer: option "C" is not one of the declared values' });
  assert.deepEqual(judge({ args: {} }), { refused: 'invalid', note: 'Answer: option required' });
  assert.deepEqual(judge({ cap: 'event:goal', args: { extra: 1 } }), { refused: 'invalid', note: '+1 HOME: "event:goal" takes no arguments' });
  assert.equal(judge({ cap: 'event:goal', args: {} }).run.cap.id, 'event:goal');
  assert.deepEqual(judge({ cap: 'event:reveal', args: {} }), { refused: 'not-allowed', note: "Reveal cannot fire in the graphic's state now" });
  assert.deepEqual(judge({ cap: 'step:away', args: { delta: 2 } }), { refused: 'invalid', note: 'Away: delta 2 is not one of the declared values' });
  assert.equal(judge({ cap: 'step:away', args: { delta: -1 } }).run.cap.kind, 'step');
  // The declaration changed since the key was drawn (a package edit): stale, never re-read.
  const edited = offered();
  edited.graphics[0].caps.find((c) => c.id === 'event:choose').args.properties[0].node.enum = ['A', 'B', 'C'];
  assert.deepEqual(judge({}, edited), { refused: 'stale', note: 'Answer changed on Quiz since the key was drawn' });
});

test('a capability presses the graphic\'s own control: a pick as its option set, a number as its step', () => {
  const pickOf = (b) => pickOptions(b, quizFields, path, quizButtons);
  const run = (cap, args) => ({ graphic: 'Quiz', cap: graphicCapabilities(controls()).find((c) => c.id === cap), args });
  assert.deepEqual(capabilityPress(run('event:choose', { option: 'A' }), quizButtons, pickOf), { event: { event: 'choose', label: 'Answer', set: { picked: 'A' } } });
  assert.deepEqual(capabilityPress(run('event:goal', {}), quizButtons, pickOf), { event: quizButtons[0] });
  assert.deepEqual(capabilityPress(run('step:away', { delta: -1 }), quizButtons, pickOf), { step: 'away', delta: -1 });
  // A control the graphic no longer declares presses nothing.
  assert.equal(capabilityPress(run('event:goal', {}), quizButtons.slice(1), pickOf), null);
});

test("a foreign package's actions are typed descriptors from E1's model, validated against its fixtures, never invocable", () => {
  const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/ograf-typed/${name}.ograf.json`, import.meta.url), 'utf8'));
  const score = foreignCapabilities(fixture('ebu-scoreboard'));
  assert.deepEqual(score.caps.map((c) => [c.id, c.label, c.args, c.invocable, c.allowed]), [
    ['foreign:goal-home', 'Goal (Home)', null, false, false],
    ['foreign:goal-away', 'Goal (Away)', null, false, false],
  ]);
  assert.deepEqual(score.refused, []);
  const stranger = foreignCapabilities(fixture('stranger'));
  const highlight = stranger.caps.find((c) => c.id === 'foreign:highlight');
  assert.deepEqual(highlight.args.properties.map((p) => [p.key, p.required, p.node.type]), [['team', true, 'integer'], ['colour', false, 'string'], ['pulse', false, 'object']]);
  assert.equal(highlight.args.properties[1].node.colour, 'rrggbbaa');
  assert.equal(foreignCapabilities(fixture('ebu-weather')).caps.length, 0);
  // An action whose arguments use something E1 does not carry is refused with E1's reason.
  const bad = fixture('stranger');
  bad.customActions[0].schema.properties.team.oneOf = [{ maximum: 1 }, { minimum: 3 }];
  const refused = foreignCapabilities(bad);
  assert.deepEqual(refused.refused, [{ action: 'highlight', reason: 'this keyword is not supported' }]);
  assert.deepEqual(refused.caps.map((c) => c.id), ['foreign:reset']);
  // Advertised, a press on one is refused before anything runs.
  const ring = new ActionsRing();
  const withForeign = { relay: true, graphics: [{ graphic: 'Results', pinned: false, live: 'cue_r', cue: 'R', caps: stranger.caps }] };
  ring.put(4, withForeign);
  const p = readActionPress(actionPress({ target: 'Results', instance: 'cue_r', cap: 'foreign:reset', args: {} }));
  assert.deepEqual(judgeAction(p, withForeign, ring.get(4)), { refused: 'not-here', note: 'Reset cannot be pressed from a panel' });
});
