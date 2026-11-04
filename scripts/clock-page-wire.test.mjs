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

// THE EXPORTED PAGES' CLOCK ON A SHARED RELAY (clockFollower, #1887). Both pages follow the relay
// log's clock rows, which every relay-driven output follows too. The rules, one per case:
//  R1 its own row coming back confirms it; R2 another page's row, with nothing of its own out, is the
//  clock; R3 a row before its own pending send is older than that press; R4 a send the relay refuses
//  goes back to the last confirmed clock; R5 ... or to the newer row another page sent meanwhile;
//  R6 two overlapping sends both refused go back to the confirmed clock, never to the first refused
//  one; R7 a send not back within 7 s counts as lost; R8 a later send coming back stands over an
//  earlier refused one; R9 an earlier send coming back after a later one was refused is the clock.
const clockTime = { now: 1_800_000_000_000 };
const follower = new Function('Date', `${MATCH_CLOCK_PAGE_JS}\nreturn clockFollower;`)({ now: () => clockTime.now });
const RUN = '0:30@1800000000000/0:30/0:30';
const A = '0:10@1800000001000/0:30/0:10';
const B = '0:05@1800000002000/0:30/0:05';
const OTHER = '0:20@1800000003000/0:30/0:20';

test('a page sharing a relay keeps the clock the relay confirms, whatever happens to its own sends', () => {
  const at = (f) => ({ held: f.held, confirmed: f.confirmed });
  let f = follower(undefined);
  f.row(RUN);
  assert.deepEqual(at(f), { held: RUN, confirmed: RUN }, 'R2');
  f.held = A; f.sent(A); f.row(A);
  assert.deepEqual(at(f), { held: A, confirmed: A }, 'R1');

  f = follower(RUN);
  f.held = A; f.sent(A); f.row(OTHER);
  assert.equal(f.held, A, 'R3: a row before its own pending send moves nothing yet');
  f.row(A);
  assert.deepEqual(at(f), { held: A, confirmed: A }, 'R3: its own row confirms it, the older row is gone');

  f = follower(RUN);
  f.held = A; const refuseA = f.sent(A);
  refuseA();
  assert.deepEqual(at(f), { held: RUN, confirmed: RUN }, 'R4');

  f = follower(RUN);
  f.held = A; const refuseA2 = f.sent(A); f.row(OTHER);
  refuseA2();
  assert.deepEqual(at(f), { held: OTHER, confirmed: OTHER }, 'R5');

  f = follower(RUN);
  f.held = A; const r1 = f.sent(A);
  f.held = B; const r2 = f.sent(B);
  r1();
  assert.equal(f.held, B, 'R6: the newer send still out stands');
  r2();
  assert.deepEqual(at(f), { held: RUN, confirmed: RUN }, 'R6: both refused, the confirmed clock');

  f = follower(RUN);
  f.held = A; f.sent(A);
  clockTime.now += 6_000; f.settle(null);
  assert.equal(f.held, A, 'R7: within its window it still stands');
  clockTime.now += 2_000; f.settle(null);
  assert.deepEqual(at(f), { held: RUN, confirmed: RUN }, 'R7: past it, the confirmed clock');

  f = follower(RUN);
  f.held = A; const r3 = f.sent(A);
  f.held = B; f.sent(B);
  r3(); f.row(B);
  assert.deepEqual(at(f), { held: B, confirmed: B }, 'R8');

  f = follower(RUN);
  f.held = A; f.sent(A);
  f.held = B; const r4 = f.sent(B);
  r4();
  assert.equal(f.held, B, 'R9: the earlier send is still out');
  f.row(A);
  assert.deepEqual(at(f), { held: A, confirmed: A }, 'R9');
});
