// guards: src/control/loudness.ts
//
// NORMALIZE'S ARITHMETIC (docs/AUDIO_TIMELINE_LOUDNESS_PLAN.md §3.5), in Node: target minus measured,
// held by the -1 dBTP peak guard and the Level range, said honestly when a limit binds; and a stored
// result read as stale the moment its cue's level, trim or file moves. The Take's +20 dB need is in
// the same breath, because Normalize is what sets levels above +6 dB. The browser half is
// e2e/playout-cues.spec.ts.

import test from 'node:test';
import assert from 'node:assert/strict';

const L = await import('../src/control/loudness.ts');
const { playbackNeeds, playbackBlocker } = await import('../src/control/cuePlayback.ts');

test('the level is target minus measured, to the tenth', () => {
  assert.deepEqual(L.normalizeLevel(-23, -31.2, -12), { levelDb: 8.2, airsAt: -23, limit: null });
  assert.deepEqual(L.normalizeLevel(-23, -14.5, -1.5), { levelDb: -8.5, airsAt: -23, limit: null });
  assert.deepEqual(L.normalizeLevel(-16, -23, -9), { levelDb: 7, airsAt: -16, limit: null });
});

test('the true peak never goes above -1 dBTP: the level stops there and says so', () => {
  // -31 LUFS with a -4 dBTP peak wants +8 dB; only +3 dB keeps the peak at -1 dBTP.
  assert.deepEqual(L.normalizeLevel(-23, -31, -4), { levelDb: 3, airsAt: -28, limit: 'peak' });
  // Rounding never lets the peak past the ceiling: room of 2.97 dB is 2.9, not 3.0.
  assert.equal(L.normalizeLevel(-23, -40, -3.97).levelDb, 2.9);
});

test('the Level range holds a very quiet or very loud file, and says so', () => {
  assert.deepEqual(L.normalizeLevel(-14, -50, -40), { levelDb: 20, airsAt: -30, limit: 'range' });
  assert.deepEqual(L.normalizeLevel(-40, 25, 0), { levelDb: -60, airsAt: -35, limit: 'range' });
});

test('silence, a part too short and a file with no sound are not normalized, each with its reason', () => {
  assert.match(L.normalizeCue(-23, { kind: 'silent', seconds: 3 }, {}).refused, /silent/);
  assert.match(L.normalizeCue(-23, { kind: 'too-short', seconds: 0.2 }, {}).refused, /0\.4 s/);
  assert.match(L.normalizeCue(-23, { kind: 'no-audio' }, {}).refused, /no sound/);
});

test('a result is kept with what it was measured on, and is stale once the level, the trim or the file moves', () => {
  const r = L.normalizeCue(-23, { kind: 'measured', integrated: -31.2, truePeak: -12, seconds: 20, layout: 'stereo' }, { trimIn: 5 }, '100:20261120');
  assert.equal(r.levelDb, 8.2);
  const cue = { playback: { trimIn: 5, levelDb: 8.2, normalized: r.normalized } };
  assert.equal(L.normalizedState(cue), 'current');
  assert.equal(L.normalizedState(cue, '100:20261120'), 'current');
  assert.equal(L.normalizedState(cue, '200:20261121'), 'stale', 'the server lists another file');
  assert.equal(L.normalizedState({ playback: { ...cue.playback, levelDb: 6 } }), 'stale', 'the level moved by hand');
  assert.equal(L.normalizedState({ playback: { ...cue.playback, trimIn: 6 } }), 'stale', 'the trim moved');
  assert.equal(L.normalizedState({ playback: { levelDb: -6 } }), null);
  assert.equal(L.levelSetByHand({ playback: { levelDb: -6 } }), true);
  assert.equal(L.levelSetByHand(cue), false);
  assert.equal(L.levelSetByHand({ playback: { ...cue.playback, trimIn: 6 } }), false, 'trimmed after Normalize: still Normalize\'s level, measured again');
  assert.equal(L.levelSetByHand({ playback: { ...cue.playback, levelDb: 6 } }), true, 'moved by hand after Normalize');
  assert.equal(L.levelSetByHand({}), false);
  assert.equal(L.normalizedWords(r.normalized), 'Normalized to −23 LUFS');
  const limited = L.normalizeCue(-23, { kind: 'measured', integrated: -31, truePeak: -4, seconds: 20, layout: 'stereo' }, {});
  assert.equal(L.normalizedWords(limited.normalized), 'Airs at −28 LUFS, peak limited (target −23 LUFS)');
});

test('a level above +6 dB needs a Bridge with gain-20 at Take; +6 dB and under does not', () => {
  const item = { adapter: 'casparcg', mediaKind: 'audio' };
  const ability = { state: 'ok', features: ['playback'], capabilities: ['level'] };
  assert.equal(playbackBlocker(playbackNeeds({ playback: { levelDb: 6 } }, item), ability), null);
  assert.match(playbackBlocker(playbackNeeds({ playback: { levelDb: 8.2 } }, item), ability), /Update NoaCG Bridge to take it, or bring its level to \+6 dB or less/);
  assert.equal(playbackBlocker(playbackNeeds({ playback: { levelDb: 8.2 } }, item), { ...ability, features: ['playback', 'gain-20'] }), null);
});
