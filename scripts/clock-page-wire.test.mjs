// guards: src/control/matchClockPageJs.ts, src/control/matchClockWire.ts
//
// THE EXPORTED PAGES' CLOCK IS THE WIRE'S CLOCK (#1887). The standalone control panel and the
// production controller cannot import the wire, so they carry a vanilla copy of its decision
// (`clockAfterUpdate`, `clockRowStep` in MATCH_CLOCK_PAGE_JS). This runs that copy against the TS
// (`clockValueAfterUpdate`, `clockRowEffect`) over every clock kind, every row kind and every held
// shape, so the two cannot drift: an operator switching between the hosted dashboard and an
// exported page must get the same clock.
//
//   node --test scripts/clock-page-wire.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { MATCH_CLOCK_PAGE_JS } from '../src/control/matchClockPageJs.ts';
import { clockRowEffect, clockValueAfterUpdate } from '../src/control/matchClockWire.ts';

const page = new Function(`${MATCH_CLOCK_PAGE_JS}\nreturn { clockAfterUpdate, clockRowStep };`)();

const IMPORTED = { start: 'clock_start', stop: 'clock_pause', reset: 'clock_reset' };
const CLOCKS = {
  native: { field: 'f5', countsDown: false, seed: '0:00', resetTo: '0:00' },
  nativeDown: { field: 'f5', countsDown: true, seed: '45:00', resetTo: '45:00' },
  importedUp: { field: 'f2', countsDown: false, seed: '0:00', resetTo: '0:00', events: IMPORTED, startsOnTake: false },
  duration: { field: 'f2', countsDown: true, seed: '0:30', resetTo: '0:30', events: IMPORTED, startsOnTake: true },
  target: { field: 'f2', countsDown: true, seed: '5:00@1800000000000', resetTo: '5:00@1800000000000', events: IMPORTED, fixedInstant: true },
};
const T = 1_800_000_000_000;
const HELD = [
  undefined, '0:30', '0:25', '1:10', '45:00@1799999000000',
  '0:30@1799990000000/0:30/0:30', '0:30@1799999990500/0:30/0:30', '0:00@1799999990500/0:00/0:00', '0:18@/0:30/0:25', '0:18@out/0:30/0:30', '0:25@0/0:30/0:25',
  '0:30@/0:30', '5:00@1800000000000', 'junk@x/y/z/w',
];
const ROWS = [
  { t: 'play' }, { t: 'stop' }, { t: 'next' },
  ...['clockStart', 'clockStop', 'clockReset', 'clock_start', 'clock_pause', 'clock_reset', 'goal'].map((event) => ({ t: 'event', event })),
];
const INCOMING = ['0:30', '0:25', '0:18', '1:10', '0:30@1800000005000', '0:20@/0:30/0:20'];

test('the exported pages fold an Update into the clock exactly as the wire does', () => {
  let cases = 0;
  for (const held of HELD) {
    for (const incoming of INCOMING) {
      assert.equal(page.clockAfterUpdate(held, incoming), clockValueAfterUpdate(held, incoming), `${held} <- ${incoming}`);
      cases += 1;
    }
  }
  assert.equal(cases, HELD.length * INCOMING.length);
});

test('the exported pages read every row as the same clock move as the wire', () => {
  let moved = 0;
  for (const [name, clock] of Object.entries(CLOCKS)) {
    for (const held of HELD) {
      const rows = [...ROWS, ...INCOMING.map((v) => ({ t: 'update', data: { [clock.field]: clockValueAfterUpdate(held, v) } }))];
      for (const msg of rows) {
        // An update's effect reads the value it has just written, as the renderer's does.
        const wireHeld = msg.t === 'update' ? msg.data[clock.field] : held;
        const want = clockRowEffect({ msg }, clock, wireHeld, T);
        assert.deepEqual(page.clockRowStep(clock, msg, wireHeld, T), want, `${name}: ${JSON.stringify(msg)} over ${held}`);
        if (want) moved += 1;
      }
    }
  }
  // The table reaches the moves, not only the nulls: every clock kind moves somewhere.
  assert.ok(moved > 100, `only ${moved} rows moved a clock`);
});
