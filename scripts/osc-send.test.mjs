// guards: src/control/oscSend.ts, src/control/playoutLink.ts, src/control/verbDispatch.ts, src/control/takeBlockers.ts
//
// AN OSC CUE'S TAKE (docs/work-specs/osc-control-cues/spec.md AC-3, AC-6), run in Node: what one
// press sends and why it would not, the held key that fires once, the take refusal that names the
// cue's own problem, and the page's call to the Bridge - zero requests for an unpaired browser,
// one per press, an old Bridge named as such, and a timeout reported as uncertain, never resent.

import test from 'node:test';
import assert from 'node:assert/strict';
import './lib/tsResolve.mjs';

const { oscBlocker, oscNote, oscRequest, oscRowSummary, sendIds } = await import('../src/control/oscSend.ts');
const { decideVerb } = await import('../src/control/verbDispatch.ts');
const { verbView } = await import('../src/control/verbView.ts');
const { directBlocker, takeBlockerFor } = await import('../src/control/takeBlockers.ts');
const { sendOsc, forgetBridges } = await import('../src/control/playoutLink.ts');

const desk = { id: 'desk', name: 'Lighting desk', host: ' 192.168.1.40 ', port: 8830 };
const control = (extra = {}) => ({ v: 1, kind: 'osc', destinationId: 'desk', address: ' /zeros/cue/go ', args: [{ type: 's', value: '0' }, { type: 's', value: '5' }], ...extra });
const osc = (id, extra = {}) => ({ id, sourceId: '', source: 'control', label: id, values: {}, control: control(), ...extra });

test('a press sends the cue as it stands, to its own destination, under its own send id', () => {
  const ids = sendIds('page-1');
  const built = oscRequest(osc('Lights'), [desk], ids('Lights'));
  assert.equal(built.ok, true);
  assert.deepEqual(built.request, { sendId: 'page-1:1:Lights', host: '192.168.1.40', port: 8830, address: '/zeros/cue/go', args: [{ type: 's', value: '0' }, { type: 's', value: '5' }] });
  assert.equal(ids('Lights'), 'page-1:2:Lights', 'a second press is a new send');
});

test('the cue names its own problem, and never falls back to another destination', () => {
  assert.equal(oscBlocker(osc('L'), [desk], true), null);
  assert.match(oscBlocker(osc('L'), [{ ...desk, id: 'other' }], true), /no longer has/);
  assert.match(oscBlocker(osc('L', { control: control({ destinationId: '' }) }), [desk], true), /no destination/);
  assert.match(oscBlocker(osc('L', { control: control({ address: '  ' }) }), [desk], true), /no OSC address/);
  assert.match(oscBlocker(osc('L', { control: { v: 2 } }), [desk], true), /newer version/);
  assert.match(oscBlocker(osc('L'), [desk], false), /Connect NoaCG Bridge/);
  assert.equal(oscRequest(osc('L'), [], 'x').ok, false);
});

test('the rundown row says where it sends and what, strings quoted and numbers bare', () => {
  assert.equal(oscRowSummary(osc('L'), [desk]), 'Lighting desk  /zeros/cue/go  "0" "5"');
  assert.equal(oscRowSummary(osc('L', { control: control({ args: [{ type: 'i', value: '5' }, { type: 'f', value: '1.5' }] }) }), [desk]), 'Lighting desk  /zeros/cue/go  5 1.5');
  assert.equal(oscRowSummary(osc('L', { control: control({ destinationId: '', address: '', args: [] }) }), []), 'no destination  no address');
  assert.equal(oscRowSummary(osc('L', { control: { v: 2 } }), [desk]), 'OSC cue from a newer version');
});

test('the note says sent, not sent with the reason, or uncertain', () => {
  assert.equal(oscNote('Lights', 'Lighting desk', { state: 'sent', to: '192.168.1.40:8830', repeat: false }), '✓ Lights: OSC sent to Lighting desk');
  assert.equal(oscNote('Lights', 'Lighting desk', { state: 'refused', detail: 'Too many.' }), 'Lights was not sent: Too many.');
  assert.equal(oscNote('Lights', 'Lighting desk', { state: 'uncertain', detail: 'Send uncertain. Check the desk.' }), 'Lights: Send uncertain. Check the desk.');
});

test('a held Take key fires an OSC cue once; a graphic keeps its own rule', () => {
  const L = osc('L');
  const v = {
    ...verbView({ spaceMode: 'take', published: false, cues: [L], selectedCue: L, selectedGraphic: null, liveCue: {}, selectedPlayoutLive: false, selectedItemKind: null, editTarget: 'preview', previewCueId: 'L', casparOn: false, bridgeDown: false, takeBlocked: null, advances: true, folder: null, clearing: false, anyUp: false, unnamedUp: () => false }),
    cues: [L], items: [], rows: [], rowOf: new Map(), folderId: null, step: null, onAirNow: () => false, stepBlocked: () => null, directBlocked: () => null,
  };
  assert.equal(decideVerb('take', { repeat: false }, v).do, 'take');
  assert.equal(decideVerb('take', { repeat: true }, v).do, 'none');
  // Companion's take_cue on an OSC cue sends it, or says why not; it never drops the press.
  assert.deepEqual(decideVerb('take-cue', { repeat: false, cue: 'L' }, v), { do: 'take', cue: L });
  assert.deepEqual(decideVerb('take-cue', { repeat: false, cue: 'L' }, { ...v, directBlocked: () => 'L has no OSC address.' }), { do: 'note', text: 'Take was not sent: L has no OSC address.' });
});

test('a Take of an OSC cue is refused with the cue\'s own reason, never as a graphic', () => {
  const L = osc('L');
  const ctx = { cues: [L], members: new Map(), graphicOf: () => null, itemOf: () => null, controlBlocker: (c) => oscBlocker(c, [], true) };
  assert.match(takeBlockerFor(L, ctx), /no longer has/);
  assert.match(directBlocker(L, ctx, {}), /no longer has/);
  assert.equal(takeBlockerFor(L, { ...ctx, controlBlocker: () => null }), null);
});

// ── The page's call to the Bridge ──────────────────────────────────────────────────────────────

function fakeBridge(reply, { features = ['osc'] } = {}) {
  const calls = [];
  const old = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, body: init.body ? JSON.parse(init.body) : null });
    if (url.endsWith('/health')) return new Response(JSON.stringify({ ok: true, agent: 'noacg-bridge', v: 2, version: '0.13.0', adapters: ['casparcg'], features }));
    return reply(init);
  };
  return { calls, restore: () => (globalThis.fetch = old) };
}

const paired = { agentUrl: 'http://127.0.0.1:8899', agentToken: 'tok' };
const request = { sendId: 'p:1:L', host: '192.168.1.40', port: 8830, address: '/a', args: [] };

test('an unpaired browser asks nothing of any local address', async () => {
  forgetBridges();
  const f = fakeBridge(() => new Response('{}'));
  try {
    const r = await sendOsc({ agentUrl: '', agentToken: '' }, request);
    assert.equal(r.state, 'no-bridge');
    assert.equal(f.calls.length, 0);
  } finally {
    f.restore();
  }
});

test('one press is one /osc request; an old Bridge is named and sent nothing', async () => {
  forgetBridges();
  const f = fakeBridge(() => new Response(JSON.stringify({ ok: true, v: 2, sent: { to: '192.168.1.40:8830', bytes: 8 } })));
  try {
    assert.deepEqual(await sendOsc(paired, request), { state: 'sent', to: '192.168.1.40:8830', repeat: false });
    assert.deepEqual(f.calls.filter((c) => c.url.endsWith('/osc')).map((c) => c.body), [request]);
  } finally {
    f.restore();
  }
  forgetBridges();
  const old = fakeBridge(() => new Response('{}'), { features: ['state'] });
  try {
    const r = await sendOsc(paired, request);
    assert.equal(r.state, 'no-bridge');
    assert.match(r.detail, /too old/);
    assert.equal(old.calls.filter((c) => c.url.endsWith('/osc')).length, 0);
  } finally {
    old.restore();
  }
});

test('a refusal carries the Bridge\'s sentence; a timeout is uncertain and is never resent', async () => {
  forgetBridges();
  const f = fakeBridge(() => new Response(JSON.stringify({ ok: false, v: 2, error: { hop: 'agent', code: 'refused', detail: '8.8.8.8 is on the internet.' } })));
  try {
    assert.deepEqual(await sendOsc(paired, request), { state: 'refused', detail: '8.8.8.8 is on the internet.' });
  } finally {
    f.restore();
  }
  forgetBridges();
  const slow = fakeBridge((init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
  try {
    const r = await sendOsc(paired, request);
    assert.deepEqual(r, { state: 'uncertain', detail: 'Send uncertain. Check the desk.' });
    assert.equal(slow.calls.filter((c) => c.url.endsWith('/osc')).length, 1);
  } finally {
    slow.restore();
  }
});

test('after the request left, a lost connection or an unreadable reply is uncertain, never "not sent"', async () => {
  for (const reply of [() => Promise.reject(new TypeError('Failed to fetch')), () => new Response('{"ok":tr'), () => new Response('')]) {
    forgetBridges();
    const f = fakeBridge(reply);
    try {
      assert.deepEqual(await sendOsc(paired, request), { state: 'uncertain', detail: 'Send uncertain. Check the desk.' });
      assert.equal(f.calls.filter((c) => c.url.endsWith('/osc')).length, 1, 'and nothing is resent');
    } finally {
      f.restore();
    }
  }
});

// ── Folders (docs/work-specs/osc-control-cues/spec.md D8, AC-1, AC-7) ───────────────────────────

const { togetherPlan, runTogether, togetherNote } = await import('../src/control/serverPlayout.ts');
const { folderStep } = await import('../src/control/folderStep.ts');

const strap = { id: 'A', sourceId: 'g-A', label: 'Winner', values: {} };
const rundown = (extra = {}) => ({ items: [], addressOf: () => '1-10', graphicOf: (c) => ({ name: c.sourceId, layer: 20 }), ability: null, blockerOf: () => null, controlBlockerOf: () => null, ...extra });

test('All together: a graphic and an OSC cue plan as one Take; a broken OSC cue refuses all of it', () => {
  const plan = togetherPlan([strap, osc('Lights')], rundown());
  assert.equal(plan.ok, true);
  assert.deepEqual([plan.graphics.map((g) => g.cue.id), plan.controls.map((c) => c.cue.id)], [['A'], ['Lights']]);
  const refused = togetherPlan([strap, osc('Lights')], rundown({ controlBlockerOf: () => 'Lights has no OSC address.' }));
  assert.deepEqual(refused, { ok: false, reason: 'Lights has no OSC address.' });
});

test('All together: OSC goes with the graphics, in rundown order, never taken back after Out', async () => {
  const plan = togetherPlan([strap, osc('L1'), osc('L2')], rundown());
  const order = [];
  let stop = false;
  let graphicDone;
  const results = await runTogether(plan, {
    server: async () => ({ ok: true, note: '' }),
    // The graphic is still on its way when the OSC cues go: they do not wait for it.
    graphic: () => new Promise((r) => { graphicDone = () => r({ ok: true, note: '✓ Winner' }); setTimeout(() => { order.push('graphic'); graphicDone(); }, 20); }),
    control: async (c) => { order.push(c.cue.id); if (c.cue.id === 'L2') stop = true; return { ok: true, note: `✓ ${c.cue.label}: OSC sent to Lighting desk` }; },
    off: async (m) => { order.push(`off ${m.cue.id}`); },
    stopped: () => stop,
  });
  assert.deepEqual(order, ['L1', 'L2', 'graphic', 'off A'], 'OSC first, in order; Out takes the late graphic off and sends nothing for OSC');
  assert.deepEqual(results.map((r) => [r.cueId, r.ok, !!r.control]), [['A', true, false], ['L1', true, true], ['L2', true, true]]);
});

test('the folder note counts OSC as sent, apart from what is on air', () => {
  const r = (id, ok, control, note = ok ? `✓ ${id}` : `${id} was not sent: no Bridge.`) => ({ cueId: id, label: id, ok, sent: true, note, ...(control ? { control: true } : {}) });
  assert.equal(togetherNote('Winner', [r('A', true), r('L', true, true)]), '✓ Take: Winner, 1 of 1 on air, 1 of 1 OSC sent');
  assert.equal(togetherNote('Lights only', [r('L', true, true)]), '✓ Take: Lights only, 1 of 1 OSC sent');
  assert.equal(togetherNote('Winner', [r('A', true), r('L', false, true)]), 'Take: Winner, 1 of 1 on air, 0 of 1 OSC sent. L was not sent: no Bridge.');
});

test('One by one: an OSC step sends and takes nothing off, so the graphic it goes with stays up', () => {
  const members = [{ id: 'A', graphic: true, replaces: 'pool:g-A' }, { id: 'L', graphic: false, replaces: 'control:L', control: true }, { id: 'B', graphic: true, replaces: 'pool:g-B' }];
  assert.deepEqual(folderStep(members, 'A', new Set(['A'])), { kind: 'take', cueId: 'L', off: [] });
  // The step remembered on the OSC cue (kept for the tab across a reload) goes on past it, never back.
  assert.deepEqual(folderStep(members, 'L', new Set()), { kind: 'take', cueId: 'B', off: [] });
});

test('a badly typed message refuses before anything is sent, as the Bridge would', () => {
  for (const [control_, says] of [
    [control({ address: 'not-an-address' }), /starts with \//],
    [control({ address: '/wild/*' }), /may not contain/],
    [control({ args: [{ type: 'i', value: '1.5' }] }), /whole number/],
    [control({ args: [{ type: 'f', value: 'abc' }] }), /decimal/],
    [control({ args: [{ type: 's', value: 'a\0b' }] }), /NUL/],
    [control({ args: [{ type: 's', value: 'x'.repeat(1100) }] }), /bytes/],
  ]) {
    assert.match(oscBlocker(osc('L', { control: control_ }), [desk], true), says);
  }
  assert.equal(oscBlocker(osc('L', { control: control({ args: [{ type: 'i', value: '-5' }, { type: 'f', value: '1.5e2' }] }) }), [desk], true), null);
});
