// guards: src/control/liveDock.ts
//
// THE LIVE DOCK (docs/work-specs/obs-scenes/spec.md OS6, rules K3, K6, K7): which scenes it shows,
// its health line, and the break deadline it writes. Pure, in Node. The deadline cases run in a
// zone with summer time, and the random walk checks the scene choice against an oracle written from
// K3's words.

process.env.TZ = 'Europe/Helsinki';

import test from 'node:test';
import assert from 'node:assert/strict';
import './lib/tsResolve.mjs';

const { dockScenes, sceneHealth, startTimeField, deadlinePaths, deadlineText, deadlineIn, deadlineAtLocal, deadlineOf } = await import('../src/control/liveDock.ts');
const { clockRuntimeJs } = await import('../src/templates/shared/clock.ts');

const SCENES = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

test('K3: the scenes on program, in rundown order, else the pick or the first scene', () => {
  assert.equal(dockScenes([], [], null), null);
  assert.deepEqual(dockScenes(SCENES, [], null), { mode: 'picked', ids: ['a'], picked: 'a' });
  assert.deepEqual(dockScenes(SCENES, [{ id: 'b', obs: 'unknown' }], 'c'), { mode: 'picked', ids: ['c'], picked: 'c' });
  // A pick of a scene no longer flagged falls back to the first.
  assert.deepEqual(dockScenes(SCENES, [], 'gone'), { mode: 'picked', ids: ['a'], picked: 'a' });
  // A shared source on program beside the scene's own: both, in rundown order, whatever the pick.
  assert.deepEqual(dockScenes(SCENES, [{ id: 'c', obs: 'program' }, { id: 'a', obs: 'program' }, { id: 'b', obs: 'preview' }], 'b'), { mode: 'program', ids: ['a', 'c'], picked: 'b' });
  // A row on program for a scene no longer in the list shows nothing of it.
  assert.deepEqual(dockScenes(SCENES, [{ id: 'gone', obs: 'program' }], null), { mode: 'picked', ids: ['a'], picked: 'a' });
});

test('K3: a random walk against the rule as written', () => {
  const positions = ['program', 'preview', 'hidden', 'unknown', null];
  let seed = 7;
  const rand = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n);
  for (let i = 0; i < 2000; i++) {
    const scenes = SCENES.slice(0, 1 + rand(3));
    const rows = ['a', 'b', 'c', 'x'].filter(() => rand(2)).map((id) => ({ id, obs: positions[rand(positions.length)] }));
    const pick = [null, 'a', 'b', 'c', 'x'][rand(5)];
    const got = dockScenes(scenes, rows, pick);
    const listed = scenes.map((s) => s.id);
    const program = listed.filter((id) => rows.some((r) => r.id === id && r.obs === 'program'));
    const picked = pick && listed.includes(pick) ? pick : listed[0];
    assert.deepEqual(got, program.length ? { mode: 'program', ids: program, picked } : { mode: 'picked', ids: [picked], picked });
  }
});

test('K6: one line toned as the worst row', () => {
  assert.equal(sceneHealth([]), null);
  const ok = (name) => ({ name, tone: 'ok', state: 'Ready, connected' });
  assert.deepEqual(sceneHealth([ok('Desk')]), { tone: 'ok', words: 'The scene is ready', title: 'Desk: Ready, connected' });
  assert.equal(sceneHealth([ok('Desk'), ok('Game')]).words, 'All 2 scenes ready');
  const mixed = sceneHealth([ok('Desk'), { name: 'Game', tone: 'warn', state: 'Loaded twice' }, { name: 'Break', tone: 'bad', state: 'Not answering (40 s)' }, { name: 'End', tone: 'bad', state: 'Not answering (50 s)' }]);
  assert.equal(mixed.tone, 'bad');
  assert.equal(mixed.words, '1 of 4 ready · Break: Not answering (40 s)');
  assert.equal(mixed.title.split('\n').length, 4);
  assert.equal(sceneHealth([{ name: 'Desk', tone: 'idle', state: 'Not loaded' }]).words, '0 of 1 ready · Desk: Not loaded');
});

test('K7: the start-time field is found in the clock the design emits, never in a duration clock', () => {
  assert.equal(startTimeField(clockRuntimeJs('starting-soon', 'f2', 'f3')), 'f3');
  assert.equal(startTimeField(clockRuntimeJs('starting-soon', 'f2')), null);
  assert.equal(startTimeField(clockRuntimeJs('game-timer', 'f1')), null);
  const withStart = { name: 'Break', template: { js: clockRuntimeJs('starting-soon', 'f2', 'f3') } };
  const copy = { name: 'Break · Desk', template: { js: withStart.template.js } };
  const duration = { name: 'Timer', template: { js: clockRuntimeJs('game-timer', 'f1') } };
  const bindings = { Break: { f3: 'break.deadline', f0: 'title' }, 'Break · Desk': { f3: 'break.deadline' }, Timer: { f1: 'break.minutes' } };
  assert.deepEqual(deadlinePaths([withStart, duration, copy], bindings), [{ path: 'break.deadline', graphics: ['Break', 'Break · Desk'] }]);
  assert.deepEqual(deadlinePaths([withStart], undefined), []);
  assert.deepEqual(deadlinePaths([withStart], { Break: { f0: 'x' } }), []);
});

test('K7: an absolute deadline with this computer offset, never added twice', () => {
  // 2026-11-14 17:00:00.750 UTC; Helsinki is +02:00 in winter.
  const now = Date.UTC(2026, 10, 14, 17, 0, 0, 750);
  assert.equal(deadlineText(now, 120), '2026-11-14T19:00:00+02:00');
  assert.equal(deadlineText(now, -330), '2026-11-14T11:30:00-05:30');
  assert.equal(deadlineText(now, 0), '2026-11-14T17:00:00+00:00');
  assert.equal(deadlineIn(now, 2), '2026-11-14T19:02:00+02:00');
  assert.equal(deadlineIn(now, 5), '2026-11-14T19:05:00+02:00');
  // A second press a little later is a new value from that moment, not the first plus two.
  assert.equal(deadlineIn(now + 30_000, 2), '2026-11-14T19:02:30+02:00');
  assert.equal(deadlineOf(deadlineIn(now, 2)), now - 750 + 2 * 60_000);
  // Summer time: the offset is the one at the deadline's own instant.
  assert.equal(deadlineIn(Date.UTC(2026, 6, 1, 9, 0, 0), 5), '2026-07-01T12:05:00+03:00');
});

test('K7: Set takes the next time the local HH:MM comes round', () => {
  const now = Date.UTC(2026, 10, 14, 17, 0, 0); // 19:00 in Helsinki
  assert.equal(deadlineAtLocal('19:30', now), '2026-11-14T19:30:00+02:00');
  assert.equal(deadlineAtLocal('7:05', now), '2026-11-15T07:05:00+02:00');
  // The time it is now is not ahead: tomorrow.
  assert.equal(deadlineAtLocal('19:00', now), '2026-11-15T19:00:00+02:00');
  // Across the change to winter time (25 October 2026), the offset is the day's.
  assert.equal(deadlineAtLocal('12:00', Date.UTC(2026, 9, 24, 20, 0, 0)), '2026-10-25T12:00:00+02:00');
  // The repeated hour that night: its next occurrence, the first while both are ahead.
  assert.equal(deadlineAtLocal('03:30', Date.UTC(2026, 9, 24, 20, 0, 0)), '2026-10-25T03:30:00+03:00');
  // The skipped hour of 29 March 2026 has no instant: nothing is written, never an hour later.
  assert.equal(deadlineAtLocal('03:30', Date.UTC(2026, 2, 28, 20, 0, 0)), null);
  // Another zone, given: the same HH:MM is that zone's.
  assert.equal(deadlineAtLocal('19:30', now, 'America/New_York'), '2026-11-14T19:30:00-05:00');
  for (const bad of ['', '24:00', '7', '19:60', '7pm', 'x:10']) assert.equal(deadlineAtLocal(bad, now), null, bad);
});

test('K7: a held value reads back only as a whole deadline with its offset', () => {
  assert.equal(deadlineOf('2026-11-14T19:00:00+02:00'), Date.UTC(2026, 10, 14, 17));
  assert.equal(deadlineOf('2026-11-14T17:00Z'), Date.UTC(2026, 10, 14, 17));
  // As the clock reads it: an impossible date or hour is no deadline.
  for (const v of ['19:00', '2026-11-14T19:00:00', '', null, 5, '2026-11-14 19:00+02:00', '2026-11-31T19:00:00+02:00', '2026-02-29T10:00Z', '2026-11-14T24:00:00Z', '2026-13-01T10:00Z']) assert.equal(deadlineOf(v), null, String(v));
  assert.equal(deadlineOf('2028-02-29T10:00Z'), Date.UTC(2028, 1, 29, 10));
});

test('K7: a path a source writes is never offered', () => {
  const g = { name: 'Break', template: { js: clockRuntimeJs('starting-soon', 'f2', 'f3') } };
  assert.deepEqual(deadlinePaths([g], { Break: { f3: 'feed.s1.deadline' } }, ['s1']), []);
  assert.deepEqual(deadlinePaths([g], { Break: { f3: 'sheet.s1.a' } }, ['s1']), []);
  assert.deepEqual(deadlinePaths([g], { Break: { f3: 'feed.s1.deadline' } }, ['s2']), [{ path: 'feed.s1.deadline', graphics: ['Break'] }]);
});
