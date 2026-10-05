// guards: src/model/cueShortcuts.ts, src/control/serverState.ts, src/control/panelFeedback.ts, scripts/compare-studio-media.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { directCue, cueShortcutBindings, normalizeCueShortcut } from '../src/model/cueShortcuts.ts';
import { applyAccepted, applyReading, applyClearedSlot, NO_OWNERSHIP, remainingAt } from '../src/control/serverState.ts';
import { judgePress } from '../src/control/panelFeedback.ts';
import { compareClips, packetFacts } from './compare-studio-media.mjs';

test('direct cue keeps its own output settings and cannot launch a folder or next cue', () => {
  const original = { id: 'effect', sourceId: 'sound', source: 'playout', label: 'Victory', values: {}, folderId: 'quiz', hotkey: 'v', playback: { end: 'next', gain: 0.5, trim: { in: 2 } }, auto: { after: 4, then: 'out-next' } };
  const direct = directCue(original);
  assert.equal(direct.folderId, undefined);
  assert.equal(direct.playback.end, 'hold');
  assert.deepEqual(direct.playback.trim, { in: 2 });
  assert.equal(direct.auto.then, 'out');
  assert.equal(original.playback.end, 'next');
  assert.equal(normalizeCueShortcut('Shift+V'), 'shift+v');
  assert.equal(normalizeCueShortcut('Shift+1'), null);
  assert.equal(normalizeCueShortcut('ctrl+v'), null);
  assert.deepEqual(cueShortcutBindings([{ id: 'a', hotkey: 'V' }, { id: 'b', hotkey: 'v' }]), { bindings: {}, conflicts: ['v'] });
});

const slot = { adapter: 'casparcg', channel: 2, layer: 10 };
const cue = { id: 'bad-cue', sourceId: 'bad-file', source: 'playout', label: 'Broadcast timer', values: {} };
const item = { id: 'bad-file', adapter: 'casparcg', kind: 'media', name: 'G2/BROADCASTTIMER', channel: 2, layer: 10 };
const ctx = now => ({ channel: 2, now, cues: [cue], items: [item], slotOf: () => slot });
const reply = (position, extras = {}) => ({ session: 'bridge', slots: [{ layer: 10, producer: 'video', file: item.name, instance: 'bridge:1', cueId: cue.id, generation: 1, paused: false, loop: false, segment: { start: 0, length: 35 }, position, ...extras }] });

test('frozen or invalid timing becomes estimated while ownership stays intact; advancing reports recover', () => {
  let parts = applyAccepted({ ownership: NO_OWNERSHIP, timing: {} }, { verb: 'take', slot, generation: 1, session: 'bridge', instance: 'bridge:1', itemId: item.id, cueId: cue.id, now: 0, readable: true, length: 35 });
  parts = applyReading(parts, reply(2), ctx(2000));
  const ownership = parts.ownership;
  parts = applyReading(parts, reply(2), ctx(3000));
  parts = applyReading(parts, reply(2), ctx(6500));
  assert.equal(parts.ownership, ownership);
  assert.equal(parts.timing['2-10'].source, 'estimate');
  assert.ok(remainingAt(parts.timing['2-10'], 7000) < 33);
  parts = applyReading(parts, reply(8), ctx(8000));
  assert.equal(parts.timing['2-10'].source, 'server');
  parts = applyReading(parts, reply(Number.NaN), ctx(9000));
  assert.equal(parts.ownership, ownership);
  assert.equal(parts.timing['2-10'].source, 'estimate');
});

test('explicit clearing removes only its slot, including diagnostics and queued files, and rejects old state', () => {
  const parts = { ownership: { ...NO_OWNERSHIP, onAir: { video: { cueId: 'v', slot }, sound: { cueId: 's', slot: { ...slot, layer: 5 } } }, unidentified: [{ slot, file: item.name }], queued: { '2-10': { file: 'NEXT', auto: true } } }, timing: { '2-10': { at: 0, paused: false, loop: false, source: 'estimate' } } };
  const cleared = applyClearedSlot(parts, { slot, generation: 2, session: 'bridge' });
  assert.deepEqual(Object.keys(cleared.ownership.onAir), ['sound']);
  assert.deepEqual(cleared.ownership.unidentified, []);
  assert.deepEqual(cleared.ownership.queued, {});
  assert.equal(applyReading(cleared, reply(5), ctx(5000)).ownership.onAir[item.id], undefined);
});

test('remote direct cue needs a current cue row; selection and toggle changes do not redirect it', () => {
  const snapshot = { title: 'Quiz', selected: 'question', live: [], allowed: {}, blocked: [], rows: [{ id: 'effect', kind: 'cue' }] };
  const press = { verb: 'trigger-cue', target: 'effect' };
  const runs = new Set(['trigger-cue']);
  assert.equal(judgePress(press, { ...snapshot, selected: 'next', live: ['effect'] }, snapshot, runs), null);
  assert.equal(judgePress(press, snapshot, undefined, runs).outcome, 'stale');
  assert.equal(judgePress(press, { ...snapshot, rows: [] }, snapshot, runs).outcome, 'stale');
  assert.equal(judgePress(press, { ...snapshot, blocked: ['effect'] }, snapshot, runs).outcome, 'not-allowed');
});

test('media comparison requires the affected file first and two controls, and reports timestamp facts without declaring a cause', () => {
  assert.throws(() => compareClips(['one']), /three/);
  const facts = packetFacts([{ pts_time: '1', dts_time: '0' }, { pts_time: '0.5', dts_time: '1' }, {}]);
  assert.equal(facts.backwardsPts, 1); assert.equal(facts.backwardsDts, 0); assert.equal(facts.missingPts, 1);
  assert.equal(packetFacts([{ pts_time: null }, { pts_time: '' }, { pts_time: ' ' }]).missingPts, 3);
  const clips = compareClips(['bad.mov', 'good.mp4', 'good2.mp4'], args => args.includes('-show_format') ? { format: { duration: '35', format_name: 'mov' }, streams: [{ codec_name: 'h264' }] } : { packets: [] });
  assert.deepEqual(clips.map(c => c.role), ['problematic', 'working-1', 'working-2']);
});
