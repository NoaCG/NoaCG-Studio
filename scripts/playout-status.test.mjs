// guards: src/control/playoutStatus.ts
//
// ONE STATUS BEFORE TAKE (docs/work-specs/studio-day-playout AC-7). Every state the header control
// can show, the colour the owner gave it (grey offline, amber attention, green healthy, red broken),
// the short text beside the colour, and that the check deciding it comes first in the panel.

import test from 'node:test';
import assert from 'node:assert/strict';

const { describePlayoutStatus } = await import('../src/control/playoutStatus.ts');

const OK_BRIDGE = { state: 'ok', detail: '', version: '2.5.0 69e8ad5 Stable' };
const ours = { where: '1-20', channel: 1, holds: 'ours' };
const readyOne = { tone: 'ok', label: '● Ready for playout · 1 of 1 output', outputs: 1, ready: 1 };

function status(over = {}) {
  return describePlayoutStatus({ started: true, unpublished: false, version: 'v3', bridge: OK_BRIDGE, slot: ours, ready: readyOne, ...over });
}

test('not started is grey "Offline", whatever else is true, and never red', () => {
  for (const over of [{}, { bridge: { state: 'bridge', detail: 'Start NoaCG Bridge.' } }, { slot: { ...ours, holds: 'empty' }, ready: null }]) {
    const s = status({ started: false, ...over });
    assert.equal(s.tone, 'idle');
    assert.equal(s.text, 'Offline');
  }
  // The panel still says what it found, and why it is grey.
  const s = status({ started: false, slot: { ...ours, holds: 'other' } });
  assert.equal(s.checks.find((c) => c.key === 'production').label, 'Not started');
  assert.equal(s.checks.find((c) => c.key === 'slot').tone, 'idle');
});

test('healthy is green, says where it airs, and needs a positive answer to be green', () => {
  assert.deepEqual([status().tone, status().text], ['ok', 'Ready · on air 1-20']);
  // A browser-output studio: no Bridge, an output reporting ready.
  const obs = status({ bridge: null, slot: undefined, ready: { ...readyOne, outputs: 2, ready: 2 } });
  assert.deepEqual([obs.tone, obs.text], ['ok', 'Ready · 2 outputs']);
  // The Bridge answers but the slot has not been read yet: not green yet.
  const reading = status({ slot: undefined, ready: null });
  assert.deepEqual([reading.tone, reading.text], ['idle', 'Checking…']);
});

test('attention is amber: unpublished changes, an output behind', () => {
  const s = status({ unpublished: true });
  assert.deepEqual([s.tone, s.text], ['warn', 'Unpublished changes']);
  assert.equal(s.checks[0].label, 'Unpublished changes since v3');
  const behind = status({ ready: { tone: 'warn', label: '▲ Behind: showing v2 · 1 of 1 output', outputs: 1, ready: 0 } });
  assert.deepEqual([behind.tone, behind.text], ['warn', 'Behind: showing v2']);
  // Preparation incomplete is amber too, even with the output already on its slot.
  const preparing = status({ ready: { tone: 'idle', label: '○ Preparing 0 of 1', outputs: 1, ready: 0 } });
  assert.deepEqual([preparing.tone, preparing.text], ['warn', 'Preparing 0 of 1']);
});

test('broken is red: the Bridge lost, the server silent, another production, nothing on air, an output gone', () => {
  const cases = [
    [{ bridge: { state: 'bridge', detail: 'Start NoaCG Bridge on this computer.' } }, 'Bridge not running'],
    [{ bridge: { state: 'server', detail: 'CasparCG at 10.0.0.5:5250 does not answer.' } }, 'CasparCG not answering'],
    [{ slot: { ...ours, holds: 'other' } }, 'Another production on 1-20'],
    [{ slot: { ...ours, holds: 'empty' }, ready: null }, 'Output not on air'],
    [{ ready: { tone: 'bad', label: '✕ CasparCG 1-20 not answering (40 s) · 0 of 1 output ready', outputs: 1, ready: 0 } }, 'Output not responding'],
  ];
  for (const [over, text] of cases) {
    const s = status(over);
    assert.deepEqual([s.tone, s.text], ['bad', text], JSON.stringify(over));
    assert.equal(s.checks[0].tone, 'bad', 'the deciding check comes first');
  }
  // A slot the server will not read (a channel it does not have) is a fault, never "Checking…".
  const refused = status({ slot: { ...ours, holds: 'failed', detail: 'CasparCG refused the command: 401 INFO ERROR.' }, ready: null });
  assert.deepEqual([refused.tone, refused.text], ['bad', 'Cannot read 1-20']);
  assert.equal(refused.checks[0].advice, 'CasparCG refused the command: 401 INFO ERROR.');
  // ...and attention only, when an output elsewhere already airs the graphics.
  assert.equal(status({ slot: { ...ours, holds: 'failed' } }).tone, 'warn');
  // A graphic that cannot play is red here, named, although READY's own line reads it amber.
  const broken = status({
    ready: { tone: 'warn', label: '▲ Not ready: Hairline (script error)', outputs: 1, ready: 0, broken: 'Not ready: Hairline (script error)' },
  });
  assert.deepEqual([broken.tone, broken.text], ['bad', 'Not ready: Hairline']);
  assert.equal(broken.checks[0].label, 'Not ready: Hairline (script error)');
  // Red outranks amber: an unpublished change does not hide a lost Bridge.
  assert.equal(status({ unpublished: true, bridge: { state: 'bridge', detail: '' } }).text, 'Bridge not running');
});

test('an empty CasparCG slot is not red when another output already airs the graphics', () => {
  const s = status({ slot: { ...ours, holds: 'empty' } });
  assert.deepEqual([s.tone, s.text], ['ok', 'Ready · 1 output']);
  assert.equal(s.checks.find((c) => c.key === 'slot').tone, 'idle');
});

test('a started production with nothing connected and no Bridge is amber, and says what to do', () => {
  const s = status({ bridge: null, slot: undefined, ready: null });
  assert.deepEqual([s.tone, s.text], ['warn', 'No output connected']);
  assert.match(s.checks[0].advice, /browser source/);
});

test('a Bridge that cannot say what its slot shows reads grey "Connected", never green on it alone', () => {
  const s = status({ slot: { ...ours, holds: 'unreadable' }, ready: null });
  assert.deepEqual([s.tone, s.text], ['idle', 'Connected']);
  assert.match(s.checks.find((c) => c.key === 'slot').advice, /Update NoaCG Bridge/);
  // An output reporting ready elsewhere is a positive answer of its own.
  assert.equal(status({ slot: { ...ours, holds: 'unreadable' } }).tone, 'ok');
});
