// guards: src/control/oscMarks.ts
//
// AN OSC CUE'S ROW SAYS WHAT ITS LAST SEND CAME TO (docs/work-specs/osc-control-cues/spec.md D9,
// owner request 2026-11-23): sending at once, then sent with its time, not sent with the reason, or
// uncertain; OUT WAITING while its On Out is owed; and a flash only as an answer lands.

import test from 'node:test';
import assert from 'node:assert/strict';
import './lib/tsResolve.mjs';

const { createOscMarks, oscTags, oscFlash, clockText, OSC_FLASH_MS } = await import('../src/control/oscMarks.ts');

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};

test('a send is marked sending at once, then with what it came to and when', async () => {
  let t = Date.UTC(2026, 10, 23, 12, 0, 0);
  const timers = [];
  const marks = createOscMarks(() => t, (run) => timers.push(run));
  const answer = deferred();
  const running = marks.send('L', 'take', () => answer.promise);
  assert.equal(marks.part.get().L.state, 'sending');
  t += 250;
  answer.resolve({ ok: true, note: '✓ L: OSC sent to Desk' });
  const done = await running;
  assert.equal(done.note, '✓ L: OSC sent to Desk', 'the answer passes through unchanged');
  assert.deepEqual(marks.part.get().L, { which: 'take', state: 'sent', at: t, seq: 1, fresh: true });
  timers.shift()();
  assert.deepEqual(marks.part.get().L, { which: 'take', state: 'sent', at: t, seq: 1 }, 'the flash ends');

  await marks.send('L', 'out', async () => ({ ok: false, note: 'L, On Out was not sent: refused' }));
  assert.equal(marks.part.get().L.state, 'refused');
  assert.equal(marks.part.get().L.note, 'L, On Out was not sent: refused');
  await marks.send('L', 'take', async () => ({ ok: false, uncertain: true, note: 'L: Send uncertain. Check the desk.' }));
  assert.equal(marks.part.get().L.state, 'uncertain');
});

test('an older send\'s answer never overwrites a newer press', async () => {
  const marks = createOscMarks(() => 0);
  const first = deferred();
  const a = marks.send('L', 'take', () => first.promise);
  await marks.send('L', 'take', async () => ({ ok: false, note: 'refused' }));
  first.resolve({ ok: true, note: 'sent' });
  await a;
  assert.equal(marks.part.get().L.state, 'refused');
  assert.equal(marks.part.get().L.seq, 2);
});

test('a send that throws is marked not sent and still throws', async () => {
  const marks = createOscMarks(() => 0);
  await assert.rejects(marks.send('L', 'take', async () => { throw new Error('boom'); }), /boom/);
  assert.equal(marks.part.get().L.state, 'refused');
});

test('the row\'s tags: the outcome with its time, then OUT WAITING', () => {
  const at = new Date(2026, 10, 23, 14, 2, 31).getTime();
  assert.equal(clockText(at), '14:02:31');
  assert.deepEqual(oscTags(undefined, false), []);
  assert.deepEqual(oscTags({ which: 'take', state: 'sent', at, seq: 1 }, true).map((t) => t.text), ['SENT 14:02:31', 'OUT WAITING']);
  assert.deepEqual(oscTags({ which: 'out', state: 'sent', at, seq: 1 }, false).map((t) => t.text), ['OUT SENT 14:02:31']);
  const refused = oscTags({ which: 'take', state: 'refused', at, seq: 1, note: 'Connect NoaCG Bridge' }, false)[0];
  assert.equal(refused.text, 'NOT SENT');
  assert.match(refused.title, /Connect NoaCG Bridge/);
  assert.equal(oscTags({ which: 'take', state: 'uncertain', at, seq: 1 }, false)[0].text, 'UNCERTAIN');
  assert.equal(oscTags({ which: 'take', state: 'sending', at, seq: 1 }, false)[0].text, 'SENDING');
  assert.deepEqual(oscTags(undefined, true).map((t) => t.text), ['OUT WAITING'], 'owed after a reload, with no send of this page');
});

test('the row flashes only while an answer is fresh', async () => {
  const mark = { which: 'take', state: 'sent', at: 1000, seq: 1, fresh: true };
  assert.equal(oscFlash(mark), 'sent');
  assert.equal(oscFlash({ ...mark, state: 'refused' }), 'warn');
  assert.equal(oscFlash({ which: 'take', state: 'sent', at: 1000, seq: 1 }), null, 'a row drawn again later does not flash again');
  // An older send's flash timer never ends a newer one's.
  const timers = [];
  const marks = createOscMarks(() => 0, (run, ms) => timers.push([run, ms]));
  await marks.send('L', 'take', async () => ({ ok: true, note: '' }));
  await marks.send('L', 'take', async () => ({ ok: true, note: '' }));
  assert.equal(timers[0][1], OSC_FLASH_MS);
  timers[0][0]();
  assert.equal(marks.part.get().L.fresh, true);
  timers[1][0]();
  assert.equal(marks.part.get().L.fresh, undefined);
});
