// guards: src/control/clockTarget.ts, src/control/matchClockWire.ts
//
// A CLOCK COUNTING DOWN TO A SET TIME (docs/work-specs/jev-svg-import/spec.md row 10, AC-9): what a
// person types resolves to one instant in a zone, and that instant rides the match clock's existing
// stamped countdown, so a resend, a replay or a reload reads the same second. `now` and the zone are
// injected; the rules are T1-T6 in docs/work-specs/jev-svg-import/evidence/phase-10.md.
//
//   node --test scripts/clock-target.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatClockTarget,
  parseClockTarget,
  parseTargetTime,
  resolveClockTarget,
  targetClockValue,
} from '../src/control/clockTarget.ts';
import { clockValueAfterUpdate, clockValueAt } from '../src/control/matchClockWire.ts';

const HEL = 'Europe/Helsinki';
const NY = 'America/New_York';
/** 2026-11-01 15:20:30 in Helsinki (UTC+2). */
const NOW = Date.parse('2026-11-01T13:20:30Z');

function resolved(input, now = NOW) {
  const r = resolveClockTarget(input, now);
  assert.equal(r.kind, 'resolved', JSON.stringify(r));
  return r;
}

test('the ways a time of day is typed', () => {
  assert.equal(parseTargetTime('19:00'), 19 * 60);
  assert.equal(parseTargetTime('7 pm'), 19 * 60);
  assert.equal(parseTargetTime('7PM'), 19 * 60);
  assert.equal(parseTargetTime('7:30 p.m.'), 19 * 60 + 30);
  assert.equal(parseTargetTime('12 am'), 0);
  assert.equal(parseTargetTime('12 pm'), 12 * 60);
  assert.equal(parseTargetTime('0:00'), 0);
  for (const bad of ['7', '24:00', '19:60', '13 pm', '0 am', '', 'soon', '19:00:00']) {
    assert.equal(parseTargetTime(bad), null, bad);
  }
});

test('T1: a bare 7 pm is tonight, proposed, with its date and zone to confirm', () => {
  const r = resolved({ time: '7 pm', zone: HEL });
  assert.equal(r.at, Date.parse('2026-11-01T17:00:00Z'));
  assert.deepEqual([r.date, r.time, r.zone, r.offset, r.proposed, r.expired], ['2026-11-01', '19:00', HEL, '+02:00', true, false]);
  assert.equal(formatClockTarget(r), '2026-11-01T19:00:00+02:00[Europe/Helsinki]');
});

test('T1: a bare time already gone today is tomorrow, never expired', () => {
  const r = resolved({ time: '15:20', zone: HEL });
  assert.equal(r.at, Date.parse('2026-11-02T13:20:00Z'));
  assert.equal(r.date, '2026-11-02');
  assert.equal(r.expired, false);
  // The same instant read in another zone is that zone's wall time.
  const ny = resolved({ time: '7 pm', zone: NY });
  assert.equal(ny.at, Date.parse('2026-11-01T19:00:00-05:00'), 'New York left summer time this morning');
  assert.equal(ny.offset, '-05:00');
});

test('T2: an explicit date is that day, and a past one stays expired', () => {
  const future = resolved({ time: '19:00', date: '2026-11-14', zone: HEL });
  assert.equal(future.at, Date.parse('2026-11-14T17:00:00Z'));
  assert.equal(future.proposed, false);
  const past = resolved({ time: '19:00', date: '2026-10-31', zone: HEL });
  assert.equal(past.at, Date.parse('2026-10-31T17:00:00Z'), 'never rolled forward to a later day');
  assert.equal(past.expired, true);
  const earlierToday = resolved({ time: '09:00', date: '2026-11-01', zone: HEL });
  assert.equal(earlierToday.expired, true, 'today, explicitly, but gone');
  assert.deepEqual(resolveClockTarget({ time: '19:00', date: '2026-02-30', zone: HEL }, NOW), { kind: 'invalid', reason: 'date' });
  assert.deepEqual(resolveClockTarget({ time: '19:00', zone: 'Mars/Olympus' }, NOW), { kind: 'invalid', reason: 'zone' });
  assert.deepEqual(resolveClockTarget({ time: 'later', zone: HEL }, NOW), { kind: 'invalid', reason: 'time' });
});

test('T3: midnight starts a day; a bare midnight is the next one', () => {
  const bare = resolved({ time: '12 am', zone: HEL });
  assert.equal(bare.at, Date.parse('2026-11-01T22:00:00Z'));
  assert.equal(bare.date, '2026-11-02');
  const dated = resolved({ time: '00:00', date: '2026-11-14', zone: HEL });
  assert.equal(dated.at, Date.parse('2026-11-13T22:00:00Z'), 'the start of the 14th, not its end');
  // Just before midnight, the next midnight is minutes away, never a day later.
  const late = resolved({ time: '0:00', zone: HEL }, Date.parse('2026-11-01T21:59:00Z'));
  assert.equal(late.at, Date.parse('2026-11-01T22:00:00Z'));
});

test('T4: a DST gap has no instant until another time is chosen', () => {
  // Helsinki skips 03:00-03:59 on 2026-03-29.
  const gap = resolveClockTarget({ time: '03:30', date: '2026-03-29', zone: HEL }, NOW);
  assert.deepEqual(gap, { date: '2026-03-29', time: '03:30', zone: HEL, kind: 'gap' });
  assert.deepEqual(resolveClockTarget({ time: '03:30', date: '2026-03-29', zone: HEL, fold: 'later' }, NOW).kind, 'gap', 'a fold choice does not invent a gap time');
  // A bare time that falls in today's gap is today's gap, not silently tomorrow.
  const springMorning = Date.parse('2026-03-28T23:00:00Z'); // 01:00 local, 29 March
  assert.equal(resolveClockTarget({ time: '3:30 am', zone: HEL }, springMorning).kind, 'gap');
  const after = resolved({ time: '04:00', date: '2026-03-29', zone: HEL }, springMorning);
  assert.equal(after.at, Date.parse('2026-03-29T01:00:00Z'));
  assert.equal(after.offset, '+03:00');
});

test('T4: a DST fold offers both instants and resolves only on a choice', () => {
  // Helsinki repeats 03:00-03:59 on 2026-10-25.
  const fold = resolveClockTarget({ time: '03:30', date: '2026-10-25', zone: HEL }, NOW);
  assert.equal(fold.kind, 'fold');
  assert.equal(fold.earlier, Date.parse('2026-10-25T00:30:00Z'));
  assert.equal(fold.later, Date.parse('2026-10-25T01:30:00Z'));
  const earlier = resolved({ time: '03:30', date: '2026-10-25', zone: HEL, fold: 'earlier' });
  const later = resolved({ time: '03:30', date: '2026-10-25', zone: HEL, fold: 'later' });
  assert.deepEqual([earlier.at, earlier.offset], [fold.earlier, '+03:00']);
  assert.deepEqual([later.at, later.offset], [fold.later, '+02:00']);
  assert.equal(formatClockTarget(later), '2026-10-25T03:30:00+02:00[Europe/Helsinki]');
  assert.equal(parseClockTarget(formatClockTarget(earlier)).at, fold.earlier, 'the offset keeps the choice');
  // The hour either side is plain.
  assert.equal(resolved({ time: '04:00', date: '2026-10-25', zone: HEL }).offset, '+02:00');
});

test('T5: the stored form round-trips the instant and the zone', () => {
  const r = resolved({ time: '19:00', date: '2026-11-14', zone: HEL });
  assert.deepEqual(parseClockTarget(formatClockTarget(r)), { at: r.at, zone: HEL });
  for (const bad of [null, '', '2026-11-14T19:00:00+02:00', '2026-11-14T19:00:00+02:00[Nowhere/Here]', 'tonight']) {
    assert.equal(parseClockTarget(bad), null, String(bad));
  }
});

test('T6: the instant is the stamped countdown, reaching 0:00 on it', () => {
  const at = Date.parse('2026-11-01T17:00:00Z'); // 19:00 Helsinki
  const value = targetClockValue(at, NOW);
  assert.equal(value, `219:30@${NOW}`, '3 h 39 min 30 s left, true now');
  assert.equal(targetClockValue(at, NOW + 400), `219:30@${NOW}`, 'an origin between seconds moves back to the whole second before the instant');
  assert.equal(clockValueAt(value, true, NOW), '219:30');
  assert.equal(clockValueAt(value, true, at - 61_000), '1:01');
  assert.equal(clockValueAt(value, true, at - 1), '0:01');
  assert.equal(clockValueAt(value, true, at), '0:00');
  assert.equal(clockValueAt(value, true, at + 3_600_000), '0:00', 'it holds at zero after the instant');
});

test('T6: an expired target is held at 0:00 and never counts', () => {
  const past = resolved({ time: '19:00', date: '2026-10-31', zone: HEL });
  assert.equal(targetClockValue(past.at, NOW), '0:00');
  assert.equal(clockValueAt(targetClockValue(past.at, NOW), true, NOW + 3_600_000), '0:00');
  assert.equal(targetClockValue(past.at, past.at), '0:00', 'reached exactly is reached');
});

test('T6: a resend, a replay at another time and a reload all read the same second', () => {
  const at = resolved({ time: '19:00', date: '2026-11-14', zone: HEL }).at;
  const takeAt = NOW;
  const first = targetClockValue(at, takeAt);
  // A replay of the log, or a re-resolution an hour later, may stamp another origin: same reading.
  const replayed = targetClockValue(at, takeAt + 3_600_000 + 123);
  for (const read of [takeAt + 3_600_000 + 500, takeAt + 86_400_000 * 3 + 999, at - 1_500]) {
    assert.equal(clockValueAt(first, true, read), clockValueAt(replayed, true, read), `read at ${read}`);
  }
  // The wire's own merge: an Update resending the same stamped value keeps it, and so does a resend
  // of a re-stamped one; a plain resend of the time it read does not replace the instant.
  assert.equal(clockValueAfterUpdate(first, first), first);
  assert.equal(clockValueAfterUpdate(first, replayed), replayed);
  assert.equal(clockValueAfterUpdate(first, first.split('@')[0]), first);
});
