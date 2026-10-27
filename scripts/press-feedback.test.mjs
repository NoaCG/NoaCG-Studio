// WHAT A LIVE PRESS CAME TO, ON ITS BUTTON (src/control/pressFeedback.ts; E2.2, AC-3): sending,
// sent, unheard, unknown, refused and failed are told apart; nothing but a press the outputs' road
// took with an output reporting reads as sent; a mark belongs to the instance it was pressed on;
// and an older press's answer never overwrites a newer one's.
// guards: src/control/pressFeedback.ts
import test from 'node:test';
import assert from 'node:assert/strict';

const { PRESS_SAYS, pressKey, pressSending, pressSettled, settleMark, shownMark, markTitle, pruneMarks, createPressMarks } = await import('../src/control/pressFeedback.ts');

test('only an accepted press with an output reporting reads as sent', () => {
  const m = pressSending('Score', 'c1', 1);
  assert.equal(pressSettled(m, { outcome: 'accepted' }, true).state, 'sent');
  assert.equal(pressSettled(m, { outcome: 'accepted' }, false).state, 'unheard', 'a disconnected renderer is never sent');
  assert.equal(pressSettled(m, { outcome: 'unknown', note: 'n' }, true).state, 'unknown');
  assert.equal(pressSettled(m, { outcome: 'refused', note: 'n' }, true).state, 'refused');
  assert.equal(pressSettled(m, { outcome: 'failed', note: 'n' }, true).state, 'failed');
  assert.equal(pressSettled(m, { outcome: 'refused', note: 'Nothing sent: the cue on Score changed.' }, true).note, 'Nothing sent: the cue on Score changed.');
});

test('every state reads differently, by icon or by words, and sent never says on air or done', () => {
  const said = Object.values(PRESS_SAYS).map((s) => s.says);
  assert.equal(new Set(said).size, said.length);
  assert.deepEqual(Object.keys(PRESS_SAYS).sort(), ['failed', 'refused', 'sending', 'sent', 'unheard', 'unknown']);
  for (const { says } of Object.values(PRESS_SAYS)) assert.doesNotMatch(says, /on air|done|confirmed/i);
  assert.equal(PRESS_SAYS.sent.icon, '✓');
  for (const state of ['sending', 'unheard', 'unknown', 'refused', 'failed']) assert.notEqual(PRESS_SAYS[state].icon, '✓', state);
});

test('a mark is shown only while its instance is on the layer', () => {
  const m = pressSettled(pressSending('Score', 'c1', 1), { outcome: 'accepted' }, true);
  assert.equal(shownMark(m, 'c1'), m);
  assert.equal(shownMark(m, 'c2'), null, 'another cue took the layer: neither confirmed nor pending carries over');
  assert.equal(shownMark(m, null), null, 'off air');
  assert.equal(shownMark(pressSending('Score', 'c1', 2), 'c2'), null);
  assert.equal(shownMark(undefined, 'c1'), null);
});

test('an answer settles only the press it answers', () => {
  const key = pressKey('Score', 'highlight');
  assert.notEqual(pressKey('Score', 'highlight'), pressKey('Scor', 'ehighlight'));
  let marks = { [key]: pressSending('Score', 'c1', 1) };
  marks = { ...marks, [key]: pressSending('Score', 'c1', 2) };
  const late = settleMark(marks, key, 1, { outcome: 'accepted' }, true);
  assert.equal(late, marks, 'the older answer changes nothing');
  assert.equal(late[key].state, 'sending');
  const own = settleMark(marks, key, 2, { outcome: 'failed', note: 'x' }, true);
  assert.equal(own[key].state, 'failed');
  assert.equal(settleMark({}, key, 1, { outcome: 'accepted' }, true)[key], undefined);
});

test('the title says what the last press came to, then what the button does', () => {
  assert.equal(markTitle('Fires X.', null), 'Fires X.');
  assert.equal(markTitle('Fires X.', pressSettled(pressSending('Score', 'c', 1), { outcome: 'refused', note: 'the cue changed' }, true)), 'Refused: the cue changed. Fires X.');
  assert.equal(markTitle('Fires X.', pressSending('Score', 'c', 1)), 'Sending. Fires X.');
});

test('a mark is dropped once its layer holds another instance, an Out between two Takes of one cue included', async () => {
  const a = pressSettled(pressSending('Score', 'c1', 1), { outcome: 'accepted' }, true);
  const b = pressSending('Clock', 'k1', 2);
  const marks = { [pressKey('Score', 'go')]: a, [pressKey('Clock', 'go')]: b };
  assert.equal(pruneMarks(marks, { Score: 'c1', Clock: 'k1' }), marks, 'nothing moved: the same object');
  assert.deepEqual(Object.keys(pruneMarks(marks, { Clock: 'k1' })), [pressKey('Clock', 'go')]);
  const parts = createPressMarks();
  parts.part.set(marks);
  parts.prune({ Clock: 'k1' });
  parts.prune({ Score: 'c1', Clock: 'k1' });
  assert.equal(parts.part.get()[pressKey('Score', 'go')], undefined, 'taken again, the cue starts clean');
  // Following a session's `air` part: every move prunes, and stopping stops it.
  const { storePart } = await import('../src/control/storePart.ts');
  const air = storePart({ liveCue: { Score: 'c1' } });
  const followed = createPressMarks(air);
  const stop = followed.follow();
  followed.part.set({ [pressKey('Score', 'go')]: a });
  air.set({ liveCue: {} });
  assert.deepEqual(followed.part.get(), {});
  followed.part.set({ [pressKey('Score', 'go')]: a });
  stop();
  air.set({ liveCue: { Score: 'c9' } });
  assert.equal(Object.keys(followed.part.get()).length, 1);
});

test('a press is marked sending at once, then with what it came to; one that threw is failed', async () => {
  const marks = createPressMarks();
  let finish;
  const pressing = marks.press('Score', 'go', 'c1', () => new Promise((r) => (finish = r)), () => true);
  assert.equal(marks.part.get()[pressKey('Score', 'go')].state, 'sending');
  finish({ outcome: 'accepted' });
  assert.deepEqual(await pressing, { outcome: 'accepted' });
  assert.equal(marks.part.get()[pressKey('Score', 'go')].state, 'sent');
  const thrown = await marks.press('Score', 'go', 'c1', async () => { throw new Error('flush failed'); }, () => true);
  assert.deepEqual(thrown, { outcome: 'failed', note: 'flush failed' });
  assert.equal(marks.part.get()[pressKey('Score', 'go')].state, 'failed');
  // Two presses of one button, answered out of order: the newer one's answer stands.
  let first;
  const one = marks.press('Score', 'go', 'c1', () => new Promise((r) => (first = r)), () => true);
  const two = marks.press('Score', 'go', 'c1', async () => ({ outcome: 'refused', note: 'no' }), () => true);
  await two;
  first({ outcome: 'accepted' });
  await one;
  assert.equal(marks.part.get()[pressKey('Score', 'go')].state, 'refused');
});
