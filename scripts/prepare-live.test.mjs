// guards: src/control/prepareLive.ts
//
// PREPARE FOR LIVE (Phase 6 Step 3 landing b, docs/work-specs/playout-ready/spec.md AC-8 to AC-11):
// when an output has finished preparing, the checklist's lines, the stamp and its words, and the
// Bridge and CasparCG checks. Pure, run here in Node.

import test from 'node:test';
import assert from 'node:assert/strict';

const { outputSettled, outputChecks, stampOf, stampWords, bridgeChecks, readPrepRequest, preparedOutputs, slotHolds, requestId, PREPARE_WAIT_MS } = await import(
  '../src/control/prepareLive.ts'
);

const V12 = { n: 12, h: 'aaaa' };
const V13 = { n: 13, h: 'bbbb' };
const entry = (ready, over = {}) => ({ kind: 'output', id: 'o1', engine: 'OBS', build: 'x', proto: 2, surface: 'output', log: true, cmd: null, at: 1, ready, ...over });

test('an output has finished preparing when it is ready on the target, or its change failed or waits for air', () => {
  assert.equal(outputSettled(entry({ n: 4, of: 4, v: V13, is: [] }), V13, null), true);
  assert.equal(outputSettled(entry({ n: 3, of: 4, v: V13, is: [] }), V13, null), false, 'still loading');
  assert.equal(outputSettled(entry({ n: 4, of: 4, v: V12, is: [] }), V13, null), false, 'not on the target yet');
  assert.equal(outputSettled(entry({ n: 4, of: 4, v: V12, is: [], chg: { s: 'preparing', v: V13, of: 1, n: 0 } }), V13, null), false);
  assert.equal(outputSettled(entry({ n: 4, of: 4, v: V12, is: [], chg: { s: 'failed', v: V13, of: 1, n: 1 } }), V13, null), true);
  assert.equal(outputSettled(entry({ n: 4, of: 4, v: V12, is: [], chg: { s: 'waiting', v: V13, of: 1, n: 1, air: 2 } }), V13, null), true);
  // The last run's answer is not this run's: pressed again after an Out, it waits for the reload.
  const old = entry({ n: 4, of: 4, v: V12, is: [], chg: { s: 'waiting', v: V13, of: 1, n: 1, air: 1, id: 'run1' } });
  assert.equal(outputSettled(old, V13, null, 'run2'), false);
  assert.equal(outputSettled(old, V13, null, 'run1'), true);
  assert.equal(outputSettled(entry(undefined), V13, null), true, 'loaded before READY: it cannot say more');
  assert.equal(outputSettled(undefined, V13, 3_000), false, 'just left: preparing reloads it');
  assert.equal(outputSettled(undefined, V13, 20_000), true, 'gone for good');
});

test('the checklist keeps a settled output’s words, and one still going turns amber when the wait is over', () => {
  const lines = [
    { id: 'a', name: 'CasparCG 1-20', tone: 'ok', state: 'Ready for playout', detail: ['Holds v13 · CasparCG.'], present: true, gone: false },
    { id: 'b', name: 'OBS', tone: 'idle', state: 'Preparing 2 of 4', detail: [], present: true, gone: false },
  ];
  const running = outputChecks(lines, new Set(['a']), false);
  assert.deepEqual(running.map((l) => `${l.tone}|${l.label}`), ['ok|CasparCG 1-20: Ready for playout', 'running|OBS: Preparing 2 of 4']);
  const late = outputChecks(lines, new Set(['a']), true);
  assert.equal(late[1].tone, 'warn');
  assert.equal(late[1].label, `OBS: still preparing after ${PREPARE_WAIT_MS / 1000} s`);
  assert.equal(outputChecks([], new Set(), false)[0].label, 'No output is connected to this production');
  assert.deepEqual(preparedOutputs([entry({}, { id: 'x' }), { ...entry({}, { id: 'op' }), kind: 'operator' }], [{ id: 'gone', name: 'A', seen: 1 }]), ['gone', 'x']);
});

test('the stamp counts what the checklist found, and says it in the plan’s words', () => {
  const at = new Date(2026, 9, 1, 14, 2).getTime();
  const clean = stampOf(
    [
      { key: 'publish', tone: 'ok', label: 'Published' },
      { key: 'output-a', tone: 'ok', label: 'A: Ready for playout' },
      { key: 'output-b', tone: 'ok', label: 'B: Ready for playout' },
      { key: 'bridge-layer', tone: 'idle', note: true, label: 'Layer 1-20 does not show this production' },
    ],
    V12,
    at,
  );
  assert.deepEqual(clean, { at, v: V12, outputs: 2, ready: 2, warnings: 0, problems: 0 });
  assert.equal(stampWords(clean, V12, false), 'Ready for Live, checked 14:02 (v12)');
  // It keeps its honesty after a change.
  assert.equal(stampWords(clean, V13, false), 'Checked 14:02 on v12, 1 change since');
  assert.equal(stampWords(clean, V12, true), 'Checked 14:02 on v12, 1 change since');
  assert.equal(stampWords(clean, { n: 14, h: 'c' }, true), 'Checked 14:02 on v12, 3 changes since');
  const warned = stampOf([{ key: 'output-a', tone: 'warn', label: 'A: Using a fallback font' }], V12, at);
  assert.equal(stampWords(warned, V12, false), 'Checked 14:02 (v12): 1 warning');
  const bad = stampOf([{ key: 'output-a', tone: 'bad', label: 'A: not answering' }, { key: 'bridge', tone: 'bad', label: 'x' }], V12, at);
  assert.equal(stampWords(bad, V12, false), 'Not ready, checked 14:02 (v12): 2 problems');
});

test('a prepare request is read defensively', () => {
  assert.equal(readPrepRequest(null), undefined);
  assert.equal(readPrepRequest({ id: 3 }), undefined);
  assert.deepEqual(readPrepRequest({ id: 'abc', n: 2, h: 'hh', extra: 1 }), { id: 'abc', n: 2, h: 'hh' });
});

test('the Bridge and CasparCG checks say what answers, what the layer holds and what the server lacks', () => {
  const base = { configured: true, outputSlug: 'SLUG1', channel: 1, layer: 20, items: [] };
  assert.deepEqual(bridgeChecks({ ...base, configured: false, status: null }), [], 'nothing set up, nothing said');
  const down = bridgeChecks({ ...base, status: { state: 'bridge', detail: 'NoaCG Bridge is not running. Start it.' } });
  assert.deepEqual(down.map((l) => `${l.tone}|${l.advice}`), ['bad|NoaCG Bridge is not running. Start it.']);
  const ok = { state: 'ok', detail: 'ok', version: '2.5.0 69e8ad5 Stable' };
  const ours = bridgeChecks({
    ...base,
    status: ok,
    slot: { layer: 20, producer: 'html', file: 'http://x/output?production=SLUG1&name=CasparCG%201-20', paused: false, loop: false, generation: 1 },
    items: [
      { kind: 'media', name: 'AMB' },
      { kind: 'media', name: 'intro' },
      { kind: 'template', name: 'house_strap/index' },
    ],
    media: ['amb', 'OTHER'],
    templates: ['HOUSE_STRAP/INDEX'],
  });
  assert.deepEqual(
    ours.map((l) => `${l.tone}|${l.label}`),
    [
      'ok|NoaCG Bridge and CasparCG answer (CasparCG 2.5.0)',
      "ok|Layer 1-20 holds this production's output",
      'bad|1 clip the rundown cues is not on the server: intro',
      'ok|Every template the rundown cues is on the server (1)',
    ],
  );
  const other = bridgeChecks({ ...base, status: ok, slot: { layer: 20, producer: 'html', file: 'http://x/output?production=ELSE', paused: false, loop: false, generation: 1 } });
  assert.equal(other[1].tone, 'bad');
  const empty = bridgeChecks({ ...base, status: ok, slot: null });
  assert.equal(empty[1].note, true, 'an empty layer is a note: the output may run in OBS or vMix');
  const unlisted = bridgeChecks({ ...base, status: ok, items: [{ kind: 'media', name: 'a' }], media: null });
  assert.equal(unlisted[1].tone, 'warn');
});

test('the output slot is ours only for this slug exactly, never for a longer one that starts with it', () => {
  const html = (file) => ({ layer: 20, producer: 'html', file, paused: false, loop: false, generation: 1 });
  assert.equal(slotHolds(html('http://x/output?production=ab12&name=CasparCG%201-20'), 'ab12'), 'ours');
  assert.equal(slotHolds(html('http://x/output?production=ab12'), 'ab12'), 'ours');
  assert.equal(slotHolds(html('http://x/output?production=ab12x9&name=CasparCG%201-20'), 'ab12'), 'other');
  assert.equal(slotHolds(html('http://x/page.html'), 'ab12'), 'empty');
  assert.equal(slotHolds({ ...html('http://x/output?production=ab12'), producer: 'video' }, 'ab12'), 'empty');
  assert.equal(slotHolds(null, 'ab12'), 'empty');
  assert.match(requestId(), /^[a-z0-9]{12}$/);
});

// ── The command path ping (landing c, R9, AC-12) ──
const { withPing, pingSettled, pingDelay, readPingAck, PING_WAIT_MS } = await import('../src/control/prepareLive.ts');

test("the ping is said on each output's own line: a time, a wait, or that commands did not reach it", () => {
  const check = (id, name, tone = 'ok', advice) => ({ key: `output-${id}`, tone, label: `${name}: Ready for playout`, ...(advice ? { advice } : {}) });
  const checks = [check('o1', 'Desk A'), check('o2', 'Desk B'), check('o3', 'Gone'), { key: 'bridge', tone: 'ok', label: 'NoaCG Bridge and CasparCG answer' }];
  const peers = [entry(undefined, { id: 'o1', ack: { id: 'p1', ms: 110 } }), entry(undefined, { id: 'o2', ack: { id: 'old', ms: 90 } })];
  const sent = { id: 'p1', sentAt: 1_000, state: 'sent' };
  assert.deepEqual(
    withPing(checks, peers, sent, 2_000).map((l) => `${l.tone}|${l.label}`),
    [
      'ok|Desk A: Ready for playout · command path 110 ms',
      'running|Desk B: Ready for playout · checking the command path',
      'ok|Gone: Ready for playout',
      'ok|NoaCG Bridge and CasparCG answer',
    ],
    "an earlier ping's answer does not count, and an output that has gone keeps its line",
  );
  const late = withPing(checks, peers, sent, 1_000 + PING_WAIT_MS)[1];
  assert.equal(late.label, 'Desk B: Ready for playout · commands did not reach it in 15 s');
  assert.equal(late.tone, 'warn');
  assert.match(late.advice, /every 30 s/);
  const behind = withPing([check('o2', 'Desk B', 'warn', 'Take it out first.')], peers, sent, 1_000 + PING_WAIT_MS)[0];
  assert.equal(behind.advice, 'Take it out first.', "the output's own advice comes first");
  const unclocked = [entry(undefined, { id: 'o1', ack: { id: 'p1', ms: null } })];
  assert.equal(withPing(checks, unclocked, sent, 2_000)[0].label, 'Desk A: Ready for playout · commands reach it');
  const old = withPing(checks, [entry(undefined, { id: 'o1' })], sent, 1_000 + PING_WAIT_MS)[0];
  assert.equal(old.tone, 'ok', 'an output loaded before the ping cannot answer: never a false alarm');
  assert.equal(old.label, 'Desk A: Ready for playout · cannot answer the command path check');
  const missing = withPing(checks, peers, { ...sent, state: 'unavailable' }, 2_000);
  assert.equal(missing.length, checks.length + 1);
  assert.equal(missing[missing.length - 1].note, true, 'a server without 0072 is a note, never a warning');
  assert.equal(withPing(checks, peers, { ...sent, state: 'failed', detail: 'x' }, 2_000).pop().tone, 'warn');
  assert.deepEqual(withPing(checks, peers, null, 2_000), checks);
});

test('an output is done with the ping when it answers, or its wait from the send runs out', () => {
  const sent = { id: 'p1', sentAt: 1_000, state: 'sent' };
  assert.equal(pingSettled(entry(undefined, { ack: { id: 'p1', ms: 5 } }), sent, 1_100), true);
  const waiting = entry(undefined, { ack: { id: '', ms: null } });
  assert.equal(pingSettled(waiting, sent, 1_100), false);
  assert.equal(pingSettled(waiting, sent, 1_000 + PING_WAIT_MS), true);
  assert.equal(pingSettled(waiting, { ...sent, state: 'sending' }, 1_100), false);
  assert.equal(pingSettled(waiting, { ...sent, state: 'sending' }, 1_000 + PING_WAIT_MS), true, 'a send that hangs does not keep the run open');
  assert.equal(pingSettled(entry(undefined), sent, 1_100), true, 'an output that cannot answer is not waited for');
  assert.equal(pingSettled(entry(undefined), { ...sent, state: 'unavailable' }, 1_100), true);
});

test('a delay is only given when the two clocks allow it, and an answer off the wire is checked', () => {
  assert.equal(pingDelay(1_000, 1_110), 110);
  assert.equal(pingDelay(1_000, 900), null, 'the output clock behind the server: no figure');
  assert.equal(pingDelay(1_000, 1_000 + 120_000), null);
  assert.deepEqual(readPingAck({ id: 'p1', ms: 12.4 }), { id: 'p1', ms: 12 });
  assert.deepEqual(readPingAck({ id: 'p1', ms: -3 }), { id: 'p1', ms: null });
  assert.equal(readPingAck({ ms: 3 }), undefined);
});
