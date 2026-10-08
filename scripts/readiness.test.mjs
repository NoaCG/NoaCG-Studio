// guards: src/control/readiness.ts, src/control/payloadVersion.ts
//
// READY (Phase 6 Step 3, docs/work-specs/playout-ready/spec.md). The output's own answer, the
// operator's reading of every output (both surfaces take their words from `describeReadiness`),
// the expected outputs, and the version stamp publishing writes. All pure, run here in Node.

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  outputReadiness,
  readOutputReady,
  describeReadiness,
  rememberOutputs,
  forgetOutput,
  outputStateWords,
  NOT_ANSWERING_MS,
  MAX_ISSUES,
} = await import('../src/control/readiness.ts');
const { stampPayload, changedGraphics, readPayloadVersion, versionLabel } = await import('../src/control/payloadVersion.ts');

const ok = { done: true, error: null, silent: false, fontsFailed: [], fontsLoading: [], imagesBroken: [] };
const V12 = { n: 12, h: 'aaaa' };
const V13 = { n: 13, h: 'bbbb' };
const NOW = 1_800_000_000_000;

/** An output entry as readLiveEntry hands it on. */
function output(over = {}) {
  return {
    kind: 'output',
    id: 'out1',
    engine: 'CasparCG · Chromium 71',
    build: 'abc1234',
    proto: 2,
    surface: 'output',
    log: true,
    cmd: null,
    at: NOW,
    ready: { n: 4, of: 4, v: V12, is: [] },
    ...over,
  };
}
const FALLBACK = { tone: 'ok', label: '● 1 output · CasparCG · Chromium 71', short: '● 1 output', why: 'fallback', outputs: 1, source: 'presence', show: true };
const read = (over = {}) =>
  describeReadiness({ presence: 'joined', peers: [output()], expected: [], published: V12, fallback: FALLBACK, now: NOW, ...over });

test('an output counts its graphics as they finish, and names what fails', () => {
  const graphics = ['Strap', 'Frost Quiz', 'Bug', 'Clock'];
  const checks = new Map([
    ['Strap', ok],
    ['Frost Quiz', { ...ok, error: 'SyntaxError: Unexpected token ?' }],
  ]);
  const preparing = outputReadiness({ graphics, checks, version: V12 });
  assert.equal(preparing.n, 2);
  assert.equal(preparing.of, 4);
  assert.equal(outputStateWords(preparing), 'Preparing 2 of 4 (v12)');

  checks.set('Bug', { ...ok, fontsFailed: ['Manrope'], imagesBroken: ['logo.png'] });
  checks.set('Clock', { ...ok, silent: true, fontsLoading: ['Manrope'] });
  const done = outputReadiness({ graphics, checks, version: V12, catchingUp: true });
  assert.equal(done.n, 4);
  assert.deepEqual(
    done.is.map((i) => `${i.k}:${i.g ?? ''}:${i.d ?? ''}`),
    ['script:Frost Quiz:SyntaxError: Unexpected token ?', 'silent:Clock:', 'font:Bug:Manrope', 'image:Bug:logo.png', 'sync::'],
    'script errors first, a typeface named once, then images, then sync',
  );
  assert.equal(outputStateWords(done), 'Not ready: Frost Quiz (script error), Clock (did not answer) (v12)');
});

test('a font the stage released a graphic without counts only while it is still missing', () => {
  const held = new Map([
    ['Strap', { fonts: ['Oswald'], late: false }],
    ['Bug', { fonts: ['Inter'], late: true }],
  ]);
  const r = outputReadiness({ graphics: ['Strap', 'Bug'], checks: new Map([['Strap', ok], ['Bug', ok]]), held, version: null });
  assert.deepEqual(r.is, [{ k: 'font', g: 'Strap', d: 'Oswald' }]);
  assert.equal(outputStateWords(r), 'Using a fallback font for Oswald');
});

test('an entry carries at most a handful of issues, and a garbled one is read defensively', () => {
  const checks = new Map(Array.from({ length: 9 }, (_, i) => [`g${i}`, { ...ok, error: 'boom' }]));
  const r = outputReadiness({ graphics: [...checks.keys()], checks, version: null });
  assert.equal(r.is.length, MAX_ISSUES);
  assert.equal(readOutputReady(null), undefined);
  assert.equal(readOutputReady({ n: 'x', of: 2 }), undefined);
  const odd = readOutputReady({ n: 9, of: 2, v: { n: 'v', h: 1 }, is: [{ k: 'nope' }, { k: 'font', d: 'Manrope' }], chg: { s: 'weird' } });
  assert.deepEqual(odd, { n: 2, of: 2, v: null, is: [{ k: 'font', d: 'Manrope' }] });
});

test('the operator reads the plan’s words for every state', () => {
  assert.equal(read({ peers: [output({ ready: { n: 18, of: 24, v: V12, is: [] } })] }).summary.label, '○ Preparing 18 of 24');
  const ready = read();
  assert.equal(ready.summary.label, '● Ready for playout · 1 of 1 output');
  assert.equal(ready.summary.short, '● Ready 1/1');
  assert.equal(ready.summary.tone, 'ok');
  assert.equal(ready.outputs[0].state, 'Ready for playout');

  const broken = read({ peers: [output({ ready: { n: 4, of: 4, v: V12, is: [{ k: 'script', g: 'Frost Quiz', d: 'boom' }] } })] });
  assert.equal(broken.summary.label, '▲ Not ready: Frost Quiz (script error)');
  assert.equal(broken.summary.tone, 'warn');
  // The production page's status reads these, never the label's words.
  assert.equal(broken.outputs[0].broken, 'Not ready: Frost Quiz', 'marked for the production page, which reads it red');
  assert.deepEqual(broken.summary.broken, { line: 'Not ready: Frost Quiz (script error)', short: 'Not ready: Frost Quiz' });
  assert.equal(broken.summary.lead, 'Not ready: Frost Quiz (script error)');
  assert.equal(ready.outputs[0].broken, undefined);
  assert.equal(ready.summary.broken, null);
  assert.equal(ready.summary.lead, 'Ready for playout · 1 of 1 output');
  const loading = read({ peers: [output({ ready: { n: 18, of: 24, v: V12, is: [] } })] });
  assert.deepEqual([loading.summary.lead, loading.summary.preparing], ['Preparing 18 of 24', true]);
  assert.equal(ready.summary.preparing, false);
  assert.match(broken.outputs[0].detail[0], /Frost Quiz threw an error while loading: boom/);

  const font = read({ peers: [output({ ready: { n: 4, of: 4, v: V12, is: [{ k: 'font', g: 'Strap', d: 'Manrope' }] } })] });
  assert.equal(font.summary.label, '▲ Using a fallback font for Manrope');
  // A font host out of reach is said once, with every typeface it costs.
  const fonts = read({
    peers: [output({ log: false, ready: { n: 4, of: 4, v: V12, is: [{ k: 'font', g: 'A', d: 'Space Grotesk' }, { k: 'font', g: 'A', d: 'JetBrains Mono' }, { k: 'font', g: 'B', d: 'Inter' }] } })],
  });
  assert.equal(fonts.outputs[0].state, 'Commands may arrive up to 30 s late');
  // What to do about the headline first, then what else is wrong.
  assert.match(fonts.outputs[0].detail[0], /not on the live channel/);
  assert.equal(fonts.outputs[0].detail[1], 'Also: Using a fallback font for Space Grotesk, JetBrains Mono and Inter.');

  const late = read({ peers: [output({ log: false })] });
  assert.equal(late.summary.label, '▲ Commands may arrive up to 30 s late');
});

test('behind means an older version, never merely a newer number for the same graphics', () => {
  assert.equal(read({ published: V13 }).summary.label, '▲ Behind: showing v12');
  // A cue-only publish moves n but not h: the output holds what airs.
  assert.equal(read({ published: { n: 13, h: 'aaaa' } }).summary.label, '● Ready for playout · 1 of 1 output');
  // A page that opened before a publish learns it from an output that booted after it.
  const learned = read({ published: { n: 11, h: 'zzzz' } });
  assert.equal(learned.summary.label, '● Ready for playout · 1 of 1 output');
  // An output that booted a payload from before stamps, with a stamped one published, is behind.
  assert.equal(read({ peers: [output({ ready: { n: 4, of: 4, v: null, is: [] } })] }).summary.label, '▲ Behind: showing an older version');
  // With nothing published that carries a stamp, nothing is ever behind.
  assert.equal(read({ published: null, peers: [output({ ready: { n: 4, of: 4, v: null, is: [] } })] }).summary.label, '● Ready for playout · 1 of 1 output');
});

test('an output that should be there and is not is red once it has been gone long enough', () => {
  const expected = [
    { id: 'gone', name: 'CasparCG 1-20', seen: NOW - 5_000 },
    { id: 'out1', name: 'CasparCG · Chromium 71', seen: NOW },
  ];
  const leaving = read({ expected });
  assert.equal(leaving.summary.tone, 'idle');
  assert.equal(leaving.outputs[0].state, 'not answering (5 s)');
  assert.equal(leaving.summary.label, '○ CasparCG 1-20 not answering (5 s)');
  const dead = read({ expected: [{ ...expected[0], seen: NOW - 40_000 }, expected[1]] });
  assert.equal(dead.summary.tone, 'bad');
  assert.equal(dead.summary.label, '✕ CasparCG 1-20 not answering (40 s) · 1 of 2 outputs ready');
  assert.equal(dead.summary.short, '✕ 1/2 ready');
  assert.equal(dead.outputs[0].gone, true);
  assert.equal(dead.summary.lost, 'CasparCG 1-20', 'the status names the lost output');
  assert.equal(leaving.summary.lost, undefined, 'a moment away is not lost yet');
  assert.ok(NOT_ANSWERING_MS <= 40_000);
  // With every output gone, the line still speaks (it used to fall back to "no output connected").
  const allGone = read({ peers: [], expected: [{ ...expected[0], seen: NOW - 3 * 60_000 }] });
  assert.equal(allGone.summary.label, '✕ CasparCG 1-20 not answering (3 min) · 0 of 1 output ready');
});

test('two outputs of one name are told apart, and the order is the order they were first seen', () => {
  const view = read({
    peers: [output({ id: 'b', engine: 'OBS · Chromium 127' }), output({ id: 'a', engine: 'OBS · Chromium 127' })],
    expected: [
      { id: 'a', name: 'OBS · Chromium 127', seen: NOW },
      { id: 'b', name: 'OBS · Chromium 127', seen: NOW },
    ],
  });
  assert.deepEqual(view.outputs.map((l) => `${l.id}:${l.name}`), ['a:OBS · Chromium 127', 'b:OBS · Chromium 127 #2']);
  assert.equal(view.summary.label, '● Ready for playout · 2 of 2 outputs');
});

test('the stamp crowns an all-ready summary only while it is of the published version', () => {
  const stamp = { at: new Date(2026, 9, 1, 14, 2).getTime(), v: V12, outputs: 1, ready: 1, warnings: 0, problems: 0 };
  assert.equal(read({ stamp }).summary.label, '● Ready for Live · 1 of 1 output · checked 14:02');
  assert.equal(read({ stamp: { ...stamp, warnings: 1 } }).summary.label, '● Ready for playout · 1 of 1 output');
  assert.equal(read({ stamp: { ...stamp, v: { n: 11, h: 'old' } } }).summary.label, '● Ready for playout · 1 of 1 output');
});

test('a newer version being prepared reads as the plan words it', () => {
  const chg = (c) => [output({ ready: { n: 4, of: 4, v: V12, is: [], chg: { v: V13, of: 1, n: 0, ...c } } })];
  // Behind, but on its way: the running version stays ready while the change prepares beside it.
  const preparing = read({ published: V13, peers: chg({ s: 'preparing' }) });
  assert.equal(preparing.summary.label, '● Ready · 1 change preparing');
  assert.equal(preparing.summary.tone, 'ok');
  // Preparing a version that is no longer the published one is just behind.
  assert.equal(read({ published: { n: 14, h: 'cccc' }, peers: chg({ s: 'preparing' }) }).summary.label, '▲ Behind: showing v12');
  // A change that failed names its graphic, from any output: the graphic keeps the frame it has.
  const failed = read({ published: V13, peers: chg({ s: 'failed', is: [{ k: 'script', g: 'Frost Quiz' }] }) });
  assert.equal(failed.summary.label, '▲ Change failed: Frost Quiz (script error)');
  assert.equal(failed.summary.lead, 'Change failed: Frost Quiz (script error)');
  // …and the status reads it red, as a graphic that cannot play (playout-workflow-simplification D5).
  assert.deepEqual(failed.summary.broken, { line: 'Change failed: Frost Quiz (script error)', short: 'Change failed: Frost Quiz' });
  assert.match(failed.outputs[0].detail.join(' '), /Frost Quiz: v13 script error. It keeps playing its previous version here/);
  // An output that reloads whole (built before per-graphic replacement) waits for everything.
  const waiting = read({ published: V13, peers: chg({ s: 'waiting', n: 1, air: 2 }) });
  assert.equal(waiting.summary.label, '▲ Behind: showing v12');
  assert.equal(waiting.summary.leadShort, 'Waiting for clear');
  assert.match(waiting.outputs[0].detail[0], /2 graphics are on air here/);
});

test('per-graphic replacement: a change waiting for clear names its graphic, and only while it waits', () => {
  const chg = (c) => [output({ ready: { n: 4, of: 4, v: V12, is: [], chg: { v: V13, of: 2, n: 2, ...c } } })];
  const one = read({ published: V13, peers: chg({ s: 'waiting', air: 1, w: ['Scorebug'] }) });
  assert.equal(one.summary.label, '▲ Waiting for clear: Scorebug');
  assert.equal(one.summary.leadShort, 'Waiting for clear: Scorebug');
  assert.equal(one.summary.tone, 'warn');
  assert.equal(one.outputs[0].state, 'Waiting for clear: Scorebug');
  assert.match(one.outputs[0].detail[0], /Scorebug takes v13 after its Out or next Take/);
  assert.equal(one.summary.broken, null);
  const three = read({ published: V13, peers: chg({ s: 'waiting', air: 3, w: ['Scorebug', 'Clock', 'Bug'] }) });
  assert.equal(three.outputs[0].state, 'Waiting for clear: Scorebug +2');
  assert.equal(read({ published: V13, peers: chg({ s: 'waiting', air: 2, w: ['Scorebug', 'Clock'] }) }).outputs[0].state, 'Waiting for clear: Scorebug and Clock');
  // A failure and a wait at once: the failure leads, the wait follows it.
  const both = read({ published: V13, peers: chg({ s: 'failed', is: [{ k: 'silent', g: 'Quiz' }], w: ['Scorebug'] }) });
  assert.equal(both.outputs[0].state, 'Change failed: Quiz (did not answer)');
  assert.match(both.outputs[0].detail.join(' '), /Also: Waiting for clear: Scorebug/);
  // The wait is for the published version only: a publish since makes it plain behind.
  assert.equal(read({ published: { n: 14, h: 'cccc' }, peers: chg({ s: 'waiting', air: 1, w: ['Scorebug'] }) }).summary.label, '▲ Behind: showing v12');
  // Every graphic holds the published version: nothing waits and the line says nothing of it.
  assert.equal(read({ published: V13, peers: [output({ ready: { n: 4, of: 4, v: V13, is: [] } })] }).summary.label, '● Ready for playout · 1 of 1 output');
  // `w` survives the wire, capped and trimmed, and an older entry without it reads as before.
  const wire = readOutputReady({ n: 1, of: 1, v: V12, is: [], chg: { s: 'waiting', v: V13, of: 1, n: 1, air: 1, w: ['Scorebug', 7, 'x'.repeat(100)] } });
  assert.deepEqual(wire.chg.w, ['Scorebug', 'x'.repeat(80)]);
  assert.equal(readOutputReady({ n: 1, of: 1, v: V12, is: [], chg: { s: 'waiting', v: V13, of: 1, n: 1, air: 1 } }).chg.w, undefined);
});

test('without Presence, or with only outputs from before READY, Step 1’s line stands', () => {
  assert.equal(read({ presence: 'down' }).summary.label, FALLBACK.label);
  assert.equal(read({ presence: 'joined', peers: [] }).summary.label, FALLBACK.label);
  const old = read({ peers: [output({ ready: undefined })] });
  assert.equal(old.summary.label, FALLBACK.label);
  assert.equal(old.outputs[0].state, 'Connected, but loaded before READY existed');
});

test('expected outputs: kept, refreshed, replaced by a new page of the same name, forgotten', () => {
  let exp = rememberOutputs([], [output({ id: 'a', name: 'CasparCG 1-20' }), output({ id: 'b', engine: 'OBS · Chromium 127' })], 1);
  assert.deepEqual(exp.map((e) => `${e.id}:${e.name}:${e.seen}`), ['a:CasparCG 1-20:1', 'b:OBS · Chromium 127:1']);
  // The CasparCG layer is played again: a new page, a new id, the same name. It takes a's place.
  exp = rememberOutputs(exp, [output({ id: 'c', name: 'CasparCG 1-20' }), output({ id: 'b', engine: 'OBS · Chromium 127' })], 2);
  assert.deepEqual(exp.map((e) => `${e.id}:${e.seen}`), ['c:2', 'b:2']);
  // An operator page on the topic is never an output.
  exp = rememberOutputs(exp, [output({ id: 'op', kind: 'operator' })], 3);
  assert.equal(exp.length, 2);
  assert.deepEqual(forgetOutput(exp, 'c').map((e) => e.id), ['b']);
});

test('the version stamp: a digest per graphic, one identity, a number that counts publishes', async () => {
  const graphic = (key, html) => ({ key, html, css: '', js: '', assets: [], resolution: { width: 1920, height: 1080 }, fps: 50, layer: 20 });
  const payload = { resolution: { width: 1920, height: 1080 }, graphics: [graphic('Strap', '<b>1</b>'), graphic('Bug', '<i/>')] };
  const first = await stampPayload(payload, null, new Date(0));
  assert.equal(first.n, 1);
  assert.equal(versionLabel(first), 'v1');
  assert.match(first.g.Strap, /^[0-9a-f]{16}$/);
  const again = await stampPayload(payload, first, new Date(0));
  assert.equal(again.n, 2);
  assert.equal(again.h, first.h, 'the same graphics are the same version');
  const edited = await stampPayload({ ...payload, graphics: [graphic('Strap', '<b>2</b>'), payload.graphics[1]] }, again);
  assert.notEqual(edited.h, again.h);
  assert.notEqual(edited.g.Strap, again.g.Strap);
  assert.equal(edited.g.Bug, again.g.Bug);
  assert.deepEqual(changedGraphics(again, edited, ['Strap', 'Bug', 'New']), ['Strap', 'New']);
  assert.deepEqual(changedGraphics(null, edited, ['Strap', 'Bug']), ['Strap', 'Bug'], 'nothing held: everything is new');
  assert.equal(readPayloadVersion({ n: 'x' }), null);
  assert.equal(readPayloadVersion(undefined), null);
  assert.deepEqual(readPayloadVersion({ n: 3, h: 'x', g: { a: 'y', b: 7 } }), { n: 3, at: '', h: 'x', g: { a: 'y' } });
});

test('a publish renders differently only where a graphic the stamp names has another digest now (studio-day-playout AC-5)', async () => {
  const { rendersDiffer } = await import('../src/control/payloadVersion.ts');
  assert.equal(rendersDiffer({ Strap: 'aaaa' }, { Strap: 'aaaa', Clock: 'cccc' }), false);
  assert.equal(rendersDiffer({ Strap: 'bbbb' }, { Strap: 'aaaa' }), true);
  // A graphic the published stamp does not name is the record's to report, not this.
  assert.equal(rendersDiffer({ Strap: 'aaaa', Added: 'dddd' }, { Strap: 'aaaa' }), false);
  // Graphics this page does not read from its own library are simply absent from `now`.
  assert.equal(rendersDiffer({}, { Theirs: 'eeee' }), false);
});
