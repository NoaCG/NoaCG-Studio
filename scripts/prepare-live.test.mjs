// guards: src/control/prepareLive.ts
//
// PREPARE FOR LIVE (Phase 6 Step 3 landing b, docs/work-specs/playout-ready/spec.md AC-8 to AC-11):
// when an output has finished preparing, the checklist's lines, the stamp and its words, and the
// Bridge and CasparCG checks. Pure, run here in Node.

import test from 'node:test';
import assert from 'node:assert/strict';

const { outputSettled, outputChecks, stampOf, stampWords, bridgeChecks, readPrepRequest, preparedOutputs, PREPARE_WAIT_MS } = await import(
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
