// guards: src/model/cueShortcuts.ts, src/control/serverState.ts, src/control/panelFeedback.ts, scripts/compare-studio-media.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { directCue, cueShortcutBindings, cueShortcutLabel, normalizeCueShortcut, pressIdentities, sameCueShortcut, shortcutFromPress } from '../src/model/cueShortcuts.ts';
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
  assert.deepEqual(cueShortcutBindings([{ id: 'a', hotkey: 'V' }, { id: 'b', hotkey: 'v' }]), { bindings: {}, conflicts: ['V'] });
});

// playout-workflow-simplification AC-11 / D13: a shortcut is the key's position with its modifiers,
// labelled as the layout printed it, and the old letter shortcuts keep firing.
test('cue shortcuts: physical keys with Ctrl, Alt and Shift, Nordic letters, and the refusals', () => {
  const verbs = new Set([' ', 'r', 'u', 'n', '0', 'p', 'h', 'arrowup', 'arrowdown', 'escape']);
  const press = (code, key, mods = {}) => shortcutFromPress({ code, key, ctrl: false, alt: false, shift: false, ...mods }, verbs);
  // Captured: Å, Ä, Ö, Shift+1, Ctrl+K, Ctrl+Shift+K, Alt+K and F2.
  const captured = [
    [press('BracketLeft', 'å'), '@BracketLeft:Å', 'Å'],
    [press('Quote', 'ä'), '@Quote:Ä', 'Ä'],
    [press('Semicolon', 'ö'), '@Semicolon:Ö', 'Ö'],
    [press('Digit1', '!', { shift: true }), 'shift+@Digit1:1', 'Shift+1'],
    [press('KeyK', 'k', { ctrl: true }), 'ctrl+@KeyK:K', 'Ctrl+K'],
    [press('KeyK', 'K', { ctrl: true, shift: true }), 'ctrl+shift+@KeyK:K', 'Ctrl+Shift+K'],
    [press('KeyK', 'k', { alt: true }), 'alt+@KeyK:K', 'Alt+K'],
    [press('F2', 'F2'), '@F2:F2', 'F2'],
  ];
  for (const [answer, value, label] of captured) {
    assert.deepEqual(answer, { value });
    assert.equal(normalizeCueShortcut(value), value, 'it survives a save');
    assert.equal(cueShortcutLabel(value), label);
  }
  // Each fires from the same press: the physical form first.
  const cues = captured.map(([, value], i) => ({ id: 'c' + i, hotkey: value }));
  const { bindings } = cueShortcutBindings([...cues, { id: 'old', hotkey: 'shift+f' }]);
  assert.equal(bindings[pressIdentities({ code: 'BracketLeft', key: 'å', ctrl: false, alt: false, shift: false })[0]], 'c0');
  assert.equal(bindings[pressIdentities({ code: 'KeyK', key: 'K', ctrl: true, alt: false, shift: true })[0]], 'c5');
  assert.equal(pressIdentities({ code: 'KeyF', key: 'F', ctrl: false, alt: false, shift: true }).map((id) => bindings[id]).find(Boolean), 'old', 'a saved letter shortcut still fires');
  // Refused, each in one line.
  assert.match(press('KeyK', 'k', { ctrl: true, alt: true }).refused, /AltGr/);
  for (const f of ['F5', 'F11', 'F12']) assert.match(press(f, f).refused, /browser/);
  for (const code of ['KeyN', 'KeyT', 'KeyW', 'Tab']) {
    assert.match(press(code, code.slice(-1).toLowerCase(), { ctrl: true }).refused, /browser/);
    assert.match(press(code, code.slice(-1), { ctrl: true, shift: true }).refused, /browser/);
  }
  for (const code of ['KeyC', 'KeyX', 'KeyV', 'KeyZ', 'KeyY']) assert.match(press(code, code.slice(-1).toLowerCase(), { ctrl: true }).refused, /rundown/);
  assert.match(press('KeyZ', 'Z', { ctrl: true, shift: true }).refused, /rundown/);
  for (const [code, key] of [['Space', ' '], ['KeyR', 'r'], ['KeyU', 'u'], ['KeyN', 'n'], ['Digit0', '0'], ['KeyP', 'p'], ['KeyH', 'h']]) {
    assert.match(press(code, key).refused, /operator key/);
    assert.match(press(code, key.toUpperCase(), { shift: true }).refused, /operator key/);
  }
  // By position too, whatever this layout prints there.
  for (const [code, key] of [['KeyH', 'ĥ'], ['Numpad0', 'Insert'], ['ArrowUp', 'ArrowUp'], ['ArrowDown', 'ArrowDown']]) assert.match(press(code, key).refused, /operator key/);
  // Not answers at all: a modifier alone, and the dialog's own Tab, Enter and Escape.
  for (const [code, key] of [['ShiftLeft', 'Shift'], ['ControlLeft', 'Control'], ['Tab', 'Tab'], ['Enter', 'Enter'], ['Escape', 'Escape']]) assert.equal(press(code, key), null);
  // An older build's reading of the new form: no shortcut, never a different key.
  assert.equal(normalizeCueShortcut('ctrl+@KeyK'), null);
  // The rundown's own Delete is never a cue's.
  assert.match(press('Delete', 'Delete').refused, /rundown uses Delete/);
  assert.deepEqual(press('Delete', 'Delete', { ctrl: true }), { value: 'ctrl+@Delete:Delete' });
  // Numpad keys and named keys keep a whole label; a letter reads as the layout prints it.
  assert.deepEqual(press('Numpad1', '1'), { value: '@Numpad1:Num1' });
  assert.deepEqual(press('Backspace', 'Backspace'), { value: '@Backspace:Backspace' });
  assert.deepEqual(press('KeyQ', 'a'), { value: '@KeyQ:A' }, 'AZERTY: the key labelled A');
  assert.deepEqual(press('KeyK', 'k', { alt: true }), { value: 'alt+@KeyK:K' });
});

test('an old letter shortcut and a new one on the same key are one shortcut', () => {
  assert.equal(sameCueShortcut('v', '@KeyV:V'), true);
  assert.equal(sameCueShortcut('shift+f', 'shift+@KeyF:F'), true);
  assert.equal(sameCueShortcut('v', 'ctrl+@KeyV:V'), false, 'Ctrl+V is another press');
  assert.equal(sameCueShortcut('1', 'shift+@Digit1:1'), false);
  const { bindings, conflicts } = cueShortcutBindings([{ id: 'old', hotkey: 'v' }, { id: 'new', hotkey: '@KeyV:V' }, { id: 'k', hotkey: 'ctrl+@KeyK:K' }]);
  assert.deepEqual(conflicts, ['V'], 'neither fires until one is moved');
  assert.deepEqual(bindings, { 'ctrl+@KeyK': 'k' });
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
