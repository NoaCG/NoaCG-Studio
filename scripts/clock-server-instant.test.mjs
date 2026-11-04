// guards: src/control/matchClockWire.ts, src/control/hostedControl.ts
//
// AN IMPORTED CLOCK'S TAKE AND RUNNING CORRECTION ON THE SLOW ROAD (#1886). The fast road carries
// no `created_at`, so a row whose clock effect reads the row's instant is stamped by each output's
// own arrival there, and two outputs count apart. `needsServerInstant` names the Takes and Updates
// that must go slow; this proves it names EXACTLY the ones whose effect reads the instant, over
// every clock kind and held shape, and that two outputs receiving the slow row at different times
// then agree to the millisecond, where on the fast road they would differ by their arrival spread.
// The sender's road rule itself (hostedControl.ts `serverInstant`) is driven in the browser by
// e2e/quiz-live-consistency.spec.ts.
//
//   node --test scripts/clock-server-instant.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { clockRowEffect, clockValueAfterUpdate, clockValueAt, needsServerInstant, plainClockValue } from '../src/control/matchClockWire.ts';

const IMPORTED = { start: 'clock_start', stop: 'clock_pause', reset: 'clock_reset' };
const CLOCKS = {
  native: { field: 'f2', countsDown: true, seed: '45:00', resetTo: '45:00' },
  importedUp: { field: 'f2', countsDown: false, seed: '0:00', resetTo: '0:00', events: IMPORTED, startsOnTake: false },
  duration: { field: 'f2', countsDown: true, seed: '0:30', resetTo: '0:30', events: IMPORTED, startsOnTake: true },
  target: { field: 'f2', countsDown: true, seed: '5:00@1800000000000', resetTo: '5:00@1800000000000', events: IMPORTED, fixedInstant: true },
};
const T = 1_800_000_000_000;
// The clock as the sender knows it on the wire: running, held, off air, corrected, plain, unknown.
// A running origin sits half a second off a whole second before T, so the two arrivals below
// (T and T + 999 ms) fall in different seconds of the count: a row whose value reads its instant
// shows it, whatever second boundary it needs to cross.
const HELD = [
  '0:30@1799999990500/0:30/0:30', '0:18@/0:30/0:25', '0:18@out/0:30/0:30', '0:30@/0:30/0:30',
  '0:00@1799999990500/0:00/0:00', '0:12@/0:00/0:00',
];
const TYPED = ['0:30', '0:25', '0:18', '0:20', '0:00', '0:12'];
const ROWS = [{ t: 'play' }, { t: 'stop' }, { t: 'next' }, ...TYPED.map((v) => ({ t: 'update', data: { f2: v, f1: 'HOME' } })), { t: 'update', data: { f1: 'AWAY' } }];

/** What an output's clock field holds after a row, received at `arrival` (output/main.ts's order:
 *  the update merges, then the row's clock effect, stamped by `created_at` when the row has one). */
function outputAfter(clock, held, msg, createdAt, arrival) {
  let value = held;
  if (msg.t === 'update' && msg.data[clock.field] !== undefined) value = clockValueAfterUpdate(value, msg.data[clock.field]);
  const effect = clockRowEffect({ msg, created_at: createdAt }, clock, value, arrival);
  return effect ? effect.value : value;
}

test('the slow road gets exactly the Takes and Updates whose clock reads the row instant', () => {
  let slow = 0;
  let fast = 0;
  let outs = 0;
  let natives = 0;
  for (const [name, clock] of Object.entries(CLOCKS)) {
    for (const held of HELD) {
      for (const msg of ROWS) {
        // Two outputs, 999 ms apart, on the FAST road: no created_at, each stamps its own arrival.
        const readsInstant = outputAfter(clock, held, msg, undefined, T) !== outputAfter(clock, held, msg, undefined, T + 999);
        // THE ONE KNOWN EXCEPTION, kept fast on purpose (owner decision on #1886: the delay is
        // accepted on a duration's Take and a running correction only): an OUT banks the running
        // duration off air at its arrival, so two outputs can bank it up to a second apart. Nothing
        // shows it on air: the next Take counts the length again, not the banked time.
        const outOfRunningDuration = msg.t === 'stop' && clock.startsOnTake && readsInstant;
        if (outOfRunningDuration) {
          assert.equal(needsServerInstant(clock, msg, held), false, `${name}: an Out stays fast`);
          assert.match(outputAfter(clock, held, msg, undefined, T), /@out\//);
          outs += 1;
          continue;
        }
        // THE SECOND, kept fast for the same decision (it names imported clocks only): a native
        // clock's correction while it runs counts from the row's instant since #1889, so a reload
        // shows it running, but its Update keeps the fast road and each output counts it from its
        // own arrival, as the native runtime always did. Reported by phase-11 W2.
        const nativeCorrection = !clock.events && msg.t === 'update' && readsInstant;
        if (nativeCorrection) {
          assert.equal(needsServerInstant(clock, msg, held), false, `${name}: a native correction stays fast`);
          assert.match(outputAfter(clock, held, msg, undefined, T), /@1800000000000\//);
          natives += 1;
          continue;
        }
        assert.equal(needsServerInstant(clock, msg, held), readsInstant, `${name}: ${JSON.stringify(msg)} over ${held}`);
        if (readsInstant) slow += 1;
        else fast += 1;
      }
    }
  }
  // The table reaches both answers, and most rows stay fast.
  assert.ok(slow >= 10 && fast > slow * 3, `slow ${slow}, fast ${fast}`);
  assert.ok(outs > 0, 'the table reaches the Out of a running duration');
  assert.ok(natives > 0, 'the table reaches a native correction while it runs');
});

test('two outputs agree after a duration Take and a running correction on the slow road', () => {
  const clock = CLOCKS.duration;
  const created = new Date(T).toISOString();
  // Output A hears the row 30 ms after the commit, output B 480 ms after: the slow road's spread.
  const take = { t: 'play' };
  assert.equal(needsServerInstant(clock, take, '0:30'), true);
  const a = outputAfter(clock, '0:30', take, created, T + 30);
  const b = outputAfter(clock, '0:30', take, created, T + 480);
  assert.equal(a, b, 'the Take is stamped by the row on both');
  // Read 12.7 s later on each: the same second, to the millisecond of origin (tolerance 0 ms).
  assert.equal(clockValueAt(a, true, T + 12_700), '0:18');
  assert.equal(clockValueAt(a, true, T + 12_700), clockValueAt(b, true, T + 12_700));

  const fix = { t: 'update', data: { f2: '0:20' } };
  assert.equal(needsServerInstant(clock, fix, a), true);
  const fixedAt = new Date(T + 15_000).toISOString();
  const a2 = outputAfter(clock, a, fix, fixedAt, T + 15_030);
  const b2 = outputAfter(clock, b, fix, fixedAt, T + 15_480);
  assert.equal(a2, b2, 'the correction is stamped by the row on both');
  assert.equal(plainClockValue(a2), '0:20');

  // The same two rows on the fast road would put the outputs a whole second apart for part of
  // every second: what #1886 found.
  const fa = outputAfter(clock, '0:30', take, undefined, T + 30);
  const fb = outputAfter(clock, '0:30', take, undefined, T + 980);
  assert.notEqual(clockValueAt(fa, true, T + 30 + 12_000), clockValueAt(fb, true, T + 30 + 12_000));
});

test('a sender that knows only the plain time it sent goes slow on a changed time, never on a resend', () => {
  const clock = CLOCKS.duration;
  assert.equal(needsServerInstant(clock, { t: 'update', data: { f2: '0:30', f1: 'AWAY' } }, '0:30'), false, 'a score Update resends the time');
  assert.equal(needsServerInstant(clock, { t: 'update', data: { f2: '0:20' } }, '0:30'), true, 'a changed time may correct a running clock');
  assert.equal(needsServerInstant(clock, { t: 'update', data: { f2: '0:20' } }, undefined), true, 'nothing seen, a time off the design: the safe road');
  assert.equal(needsServerInstant(clock, { t: 'update', data: { f2: '0:30' } }, undefined), false, 'nothing seen, the design\'s own time: fast');
  assert.equal(needsServerInstant(clock, { t: 'update', data: { f1: 'AWAY' } }, undefined), false, 'no clock field, no clock move');
  assert.equal(needsServerInstant(CLOCKS.native, { t: 'update', data: { f2: '10:00' } }, undefined), false, 'a native clock keeps its road');
  assert.equal(needsServerInstant(CLOCKS.native, { t: 'play' }, undefined), false);
  assert.equal(needsServerInstant(undefined, { t: 'play' }, undefined), false, 'a graphic with no clock keeps its road');
});
