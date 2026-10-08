// guards: src/control/playoutStatus.ts, src/model/readyMemory.ts
//
// ONE STATUS BEFORE TAKE (docs/work-specs/playout-workflow-simplification AC-2). Every state the
// header control can show, its colour (grey quiet, green connected, amber attention, red lost or
// broken), the short text beside it, and that the check deciding it comes first in the panel.

import test from 'node:test';
import assert from 'node:assert/strict';

const { casparOutputTarget, describePlayoutStatus, relevantPlayout } = await import('../src/control/playoutStatus.ts');

test('CasparCG activity survives readiness-memory writes and only applies to its exact server and slot', async () => {
  const { loadReadyMemory, saveReadyMemory } = await import('../src/model/readyMemory.ts');
  const stored = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, v) };
  try {
    const settings = { host: ' 10.0.0.8 ', amcpPort: 5250, channel: 1, layer: 20 };
    const target = casparOutputTarget(settings);
    assert.notEqual(target, casparOutputTarget({ ...settings, layer: 30 }));
    assert.notEqual(target, casparOutputTarget({ ...settings, host: '10.0.0.9' }));
    saveReadyMemory('a', { outputs: [], stamp: null, casparOutput: target });
    saveReadyMemory('a', { ...loadReadyMemory('a'), outputs: [{ id: 'obs', name: 'OBS', seen: 1 }] });
    assert.equal(loadReadyMemory('a').casparOutput, target);
    assert.equal(loadReadyMemory('b').casparOutput, undefined);
    saveReadyMemory('a', { ...loadReadyMemory('a'), casparOutput: undefined });
    assert.equal(loadReadyMemory('a').casparOutput, undefined);
    stored.set('noacg-ready-v1-a', JSON.stringify({ v: 2, casparOutput: target }));
    saveReadyMemory('a', { outputs: [], stamp: null });
    assert.equal(JSON.parse(stored.get('noacg-ready-v1-a')).v, 2, 'future memory remains read-only');
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});


const OK_BRIDGE = { state: 'ok', detail: '', version: '2.5.0 69e8ad5 Stable' };
const ours = { where: '1-20', channel: 1, holds: 'ours' };
// READY's summaries in the shape describeReadiness gives them (scripts/readiness.test.mjs pins
// `lead`, `preparing`, `broken` and `lost` there).
const readyOne = { tone: 'ok', label: '● Ready for playout · 1 of 1 output', lead: 'Ready for playout · 1 of 1 output', outputs: 1, ready: 1 };

function status(over = {}) {
  return describePlayoutStatus({ started: true, casparOn: false, bridge: null, ready: readyOne, ...over });
}
const caspar = (over = {}) => status({ casparOn: true, bridge: OK_BRIDGE, slot: ours, ...over });
const pair = (s) => [s.tone, s.text];

test('the Bridge and the output slot matter only with CasparCG switched on', () => {
  assert.deepEqual(relevantPlayout({ configured: true, casparOn: false }), { bridge: false, slot: false }, 'a paired Bridge is irrelevant to a browser-only production');
  assert.deepEqual(relevantPlayout({ configured: false, casparOn: true }), { bridge: true, slot: false }, 'CasparCG on needs the Bridge even before pairing');
  assert.deepEqual(relevantPlayout({ configured: true, casparOn: true }), { bridge: true, slot: true });
});

test('before the first publish: grey "Not published", green "CasparCG ready" when native cues can air', () => {
  assert.deepEqual(pair(status({ started: false, ready: null })), ['idle', 'Not published']);
  // A Bridge paired in this browser says nothing about a browser-only production.
  assert.deepEqual(pair(status({ started: false, bridge: { state: 'bridge', detail: '' }, ready: null })), ['idle', 'Not published']);
  assert.deepEqual(pair(caspar({ started: false, ready: null })), ['ok', 'CasparCG ready']);
  assert.deepEqual(pair(caspar({ started: false, bridge: { state: 'bridge', detail: 'Start NoaCG Bridge.' }, ready: null })), ['bad', 'Bridge not running']);
  assert.deepEqual(pair(caspar({ started: false, bridge: { state: 'config', detail: '' }, ready: null })), ['idle', 'Pair NoaCG Bridge']);
  // The slot is not read before a publish: there is no output URL to load yet.
  assert.equal(caspar({ started: false, slot: { ...ours, holds: 'other' }, ready: null }).checks.some((c) => c.key === 'slot'), false);
});

test('published: quiet until something reports, green "Connected" once a renderer does', () => {
  assert.deepEqual(pair(status({ ready: null })), ['idle', 'Not connected'], 'a page opened before the studio is up is not an alarm');
  assert.deepEqual(pair(status()), ['ok', 'Connected']);
  assert.deepEqual(pair(status({ publishing: true, ready: null })), ['idle', 'Publishing…']);
  const preparing = status({ ready: { tone: 'idle', label: '○ Preparing 0 of 4', lead: 'Preparing 0 of 4', preparing: true, outputs: 1, ready: 0 } });
  assert.deepEqual(pair(preparing), ['idle', 'Preparing 0 of 4']);
});

test('CasparCG: on its slot and reporting is Connected; the Bridge alone never is', () => {
  assert.deepEqual(pair(caspar()), ['ok', 'Connected']);
  assert.deepEqual(pair(caspar({ ready: null })), ['idle', 'Loading on 1-20']);
  assert.deepEqual(pair(caspar({ slot: { ...ours, holds: 'empty' }, ready: null })), ['idle', 'Not loaded on 1-20'], 'never loaded this session: Load is due, nothing is wrong');
  assert.deepEqual(pair(caspar({ slot: undefined, ready: null })), ['idle', 'Graphics not connected']);
  // OBS carries the graphics, the Bridge carries clips: an empty slot is not a fault.
  assert.deepEqual(pair(caspar({ slot: { ...ours, holds: 'empty' } })), ['ok', 'Connected']);
});

test('amber is attention: waiting for clear, slow commands, an old Bridge', () => {
  const behind = status({ ready: { tone: 'warn', label: '▲ Behind: showing v2', lead: 'Behind: showing v2', outputs: 1, ready: 0 } });
  assert.deepEqual(pair(behind), ['warn', 'Waiting for clear']);
  assert.equal(behind.checks[0].label, 'Behind: showing v2', 'the panel keeps READY\'s own line');
  // Per-graphic replacement names what waits, also when the line leads with its output's name.
  const named = status({ ready: { tone: 'warn', label: '▲ Waiting for clear: Scorebug', lead: 'Waiting for clear: Scorebug', outputs: 1, ready: 0 } });
  assert.deepEqual(pair(named), ['warn', 'Waiting for clear: Scorebug']);
  const two = status({ ready: { tone: 'warn', label: '▲ CasparCG 1-20: Waiting for clear: Scorebug +1', lead: 'CasparCG 1-20: Waiting for clear: Scorebug +1', outputs: 2, ready: 1 } });
  assert.deepEqual(pair(two), ['warn', 'Waiting for clear: Scorebug +1']);
  const slow = status({ ready: { tone: 'warn', label: '▲ Commands may arrive up to 30 s late', lead: 'Commands may arrive up to 30 s late', outputs: 1, ready: 0 } });
  assert.deepEqual(pair(slow), ['warn', 'Commands slow']);
  assert.deepEqual(pair(caspar({ bridge: { state: 'outdated', detail: '' } })), ['warn', 'Update NoaCG Bridge']);
});

test('red is for loss and faults, named, and the deciding check comes first', () => {
  const cases = [
    [status({ ready: { tone: 'bad', label: '✕ OBS not answering (40 s)', lead: 'OBS not answering (40 s)', outputs: 1, ready: 0, lost: 'OBS' } }), 'OBS lost'],
    [status({ ready: null, noOutputTake: true }), 'No output'],
    [caspar({ bridge: { state: 'bridge', detail: 'Start NoaCG Bridge.' } }), 'Bridge not running'],
    [caspar({ bridge: { state: 'server', detail: 'CasparCG at 10.0.0.5:5250 does not answer.' } }), 'CasparCG not answering'],
    [caspar({ slot: { ...ours, holds: 'other' } }), 'Another production on 1-20'],
    [caspar({ slot: { ...ours, holds: 'empty' }, slotLost: true, ready: null }), 'Not on 1-20'],
    [caspar({ slot: { ...ours, holds: 'failed', detail: 'CasparCG refused the command: 401 INFO ERROR.' }, ready: null }), 'Cannot read 1-20'],
    [status({ ready: { tone: 'warn', label: '▲ Not ready: Hairline (script error)', lead: 'Not ready: Hairline (script error)', outputs: 1, ready: 0, broken: { line: 'Not ready: Hairline (script error)', short: 'Not ready: Hairline' } } }), 'Not ready: Hairline'],
    [status({ ready: { tone: 'warn', label: '▲ Change failed: Lower Third (script error)', lead: 'Change failed: Lower Third (script error)', outputs: 1, ready: 0, broken: { line: 'Change failed: Lower Third (script error)', short: 'Change failed: Lower Third' } } }), 'Change failed: Lower Third'],
    [status({ playbackCheck: { key: 'playback', tone: 'bad', label: 'Photo cannot Take', short: 'Cue settings unavailable' } }), 'Cue settings unavailable'],
  ];
  for (const [s, text] of cases) {
    assert.deepEqual(pair(s), ['bad', text]);
    assert.equal(s.checks[0].tone, 'bad', `${text}: the deciding check comes first`);
  }
  // A Bridge fault means nothing with CasparCG off.
  assert.deepEqual(pair(status({ bridge: { state: 'bridge', detail: '' } })), ['ok', 'Connected']);
});
