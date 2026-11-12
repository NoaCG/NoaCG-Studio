// guards: src/control/runConfirm.ts, src/control/runReport.ts
//
// WHAT EVERY OUTPUT HAS CONFIRMED (live-publishing G2 sections 1 and 6, R1, R12, R13): an output's
// run report says, per graphic, the last command it ran; the page owes every command it knows of
// and reads green only when every expected output has confirmed all of them. Pure, in Node.

import test from 'node:test';
import assert from 'node:assert/strict';

const { confirmLines, newerRun, pruneOwed } = await import('../src/control/runConfirm.ts');
const { listed, ranFor, readRun, withoutRun } = await import('../src/control/runReport.ts');

const run = (p, h = {}, o = 'out-a', e = 'ep1') => ({ o, p, h, e });
const out = (r, extra = {}) => ({ id: r ? r.o : 'out-a', name: 'Desk A', run: r, present: true, speaks: !!r, ...extra });
const owed = (at, graphic, learnedAt = 0) => ({ at, graphic, learnedAt });
const lines = (o, outputs, now = 0, presenceJoined = true) => confirmLines({ now, owed: o, outputs, presenceJoined });

test('ran(o, g) is the cursor, or just before a listed graphic\'s held work (R1)', () => {
  const r = run(50, { Scorebug: [40, 'loading'] });
  assert.equal(ranFor(r, 'Scorebug'), 39);
  assert.equal(ranFor(r, 'Clock'), 50);
});

test('a truncated list lowers the cursor below every unlisted graphic (R1)', () => {
  const h = {};
  for (let i = 0; i < 14; i += 1) h[`g${i}`] = [100 + i, 'loading'];
  const short = listed(run(200, h), 12);
  assert.equal(Object.keys(short.h).length, 12);
  assert.equal(short.p, 111, 'g12 starts at 112: nothing at or above it is claimed');
  for (let i = 0; i < 14; i += 1) assert.ok(ranFor(short, `g${i}`) <= 100 + i - 1);
});

test('the wire: what is read, what is dropped, and the run stripped from machine state', () => {
  assert.equal(readRun(null), null);
  assert.equal(readRun({ o: 'x' }), null);
  const r = readRun({ o: 'x', p: 3, e: 'abcdefghij', h: { A: [2, 'late'], B: [1, 'nonsense'], C: [1, 'failed', 'unpublished'] } });
  assert.deepEqual(r, { o: 'x', p: 3, e: 'abcdefgh', h: { A: [2, 'late'], C: [1, 'failed', 'unpublished'] } });
  assert.deepEqual(withoutRun({ groups: { a: 'b' }, run: { o: 'x' } }), { groups: { a: 'b' } });
  assert.equal(withoutRun({ run: { o: 'x' } }), null);
  assert.equal(withoutRun(null), null);
});

test('confirmed per graphic: a held graphic never blocks another graphic\'s commands (R12)', () => {
  const r = run(60, { Scorebug: [40, 'failed', 'unpublished'] });
  const got = lines([owed(55, 'Clock')], [out(r)]);
  assert.equal(got.length, 1, 'only the failure is said');
  assert.equal(got[0].tone, 'bad');
  assert.equal(got[0].short, 'Scorebug did not play');
  assert.equal(ranFor(r, 'Clock'), 60);
  assert.ok(ranFor(r, 'Scorebug') < 45);
});

test('a received position its h entry covers is judged by the entry, never by its age (R12)', () => {
  const r = run(60, { Scorebug: [50, 'late'] });
  const got = lines([owed(50, 'Scorebug', 0)], [out(r)], 20_000);
  assert.equal(got.length, 1);
  assert.equal(got[0].tone, 'warn');
  assert.match(got[0].label, /it will appear without its entrance/);
  const loading = lines([owed(50, 'Scorebug', 0)], [out(run(60, { Scorebug: [50, 'loading'] }))], 20_000);
  assert.equal(loading[0].short, 'Updating outputs');
});

test('a position not received ages oldest first: grey, amber at 5 s, red at 15 s (R13)', () => {
  const r = run(10);
  const o = [owed(11, 'Bug', 1_000), owed(12, 'Bug', 9_000)];
  assert.equal(lines(o, [out(r)], 2_000)[0].short, 'Confirming…');
  assert.equal(lines(o, [out(r)], 6_000)[0].tone, 'warn');
  // A stream of newer commands never resets the oldest one's age.
  const got = lines(o.concat(owed(13, 'Bug', 15_900)), [out(r)], 16_000);
  assert.equal(got[0].tone, 'bad');
  assert.equal(got[0].short, 'Desk A did not confirm');
});

test('the seed waits longer, and never turns red while Presence is down (R13)', () => {
  const seed = [owed(30, null, 0)];
  assert.equal(lines(seed, [out(run(20))], 10_000)[0].tone, 'idle');
  assert.equal(lines(seed, [out(run(20))], 16_000)[0].tone, 'warn');
  assert.equal(lines(seed, [out(run(20))], 31_000)[0].tone, 'bad');
  const down = lines(seed, [out(run(20))], 60_000, false);
  assert.equal(down[0].tone, 'warn');
  assert.equal(down[0].short, 'Desk A cannot confirm');
  // Reached: nothing to say.
  assert.deepEqual(lines(seed, [out(run(30))], 60_000), []);
});

test('an output that cannot confirm: an older build, or the old log (R13)', () => {
  assert.equal(lines([owed(1, 'A')], [out(null, { speaks: false })])[0].short, 'Reload Desk A when nothing is on air');
  assert.equal(lines([], [out(null, { speaks: false })])[0].tone, 'warn', 'even with nothing owed: unknown is never green');
  assert.equal(lines([owed(1, 'A')], [out(run(5), { oldLog: true })])[0].short, 'Desk A cannot confirm');
});

test('an output with no report yet is unconfirmed, worst tone first across outputs', () => {
  const a = out(run(5, {}, 'a'));
  const b = { ...out(run(9, { X: [3, 'failed', 'load'] }, 'b')), name: 'Desk B' };
  const got = lines([owed(4, 'Y', 0), owed(9, 'X', 0)], [a, b], 7_000);
  assert.deepEqual(got.map((l) => l.tone), ['bad', 'warn']);
});

test('an All out batch: each position its graphic, each confirmed on its own', () => {
  const r = run(103, { C: [103, 'loading'] });
  const batch = [owed(101, 'A'), owed(102, 'B'), owed(103, 'C')];
  assert.deepEqual(pruneOwed(batch, [out(r)]).map((o) => o.graphic), ['C']);
});

test('the newest report wins within an epoch; a stale entry never pulls it back', () => {
  const fresh = run(50, {});
  const stale = run(40, { A: [35, 'loading'] });
  assert.equal(newerRun(fresh, stale), fresh);
  assert.equal(newerRun(stale, fresh), fresh);
  const sameP = run(50, { A: [45, 'loading'] });
  assert.equal(newerRun(fresh, sameP), sameP, 'at an equal position the one heard later wins');
  assert.equal(newerRun(run(90, {}, 'out-a', 'old'), run(3)).p, 3, 'a new epoch starts over');
});

test('a page opened mid-hold: the seed is reached, and the held work still keeps green away', () => {
  const r = run(10, { Strap: [9, 'loading'] });
  const got = lines([owed(10, null, 0)], [out(r)], 1_000);
  assert.equal(got.length, 1);
  assert.equal(got[0].short, 'Updating outputs');
  // W1's capped measurement reads grey, never amber: nothing is wrong, it has not run yet.
  assert.equal(lines([], [out(run(10, { Strap: [10, 'placing'] }))])[0].tone, 'idle');
  assert.equal(lines([], [out(run(10, { Strap: [10, 'placing'] }))])[0].short, 'Confirming…');
});
