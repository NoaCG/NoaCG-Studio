// guards: src/control/seqSend.ts
//
// The protocol-2 send (Phase 6 Step 2, migration 0071): what a page tells control_send_seq about
// each press (its id, press number, epoch and the revisions it had seen when the operator pressed),
// what it learns from answers and frames, what it does with each answer, and the one-send-in-flight
// queue per graphic that keeps two Nexts from arriving in the wrong order. Run in Node. The wiring
// is sendControlVerb in src/control/hostedControl.ts; the server half is 0071's own self-check.

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  createGraphicFifo,
  createPressBook,
  createSeqSession,
  isStale,
  learnHead,
  readSendAnswer,
  senderBody,
  settleAnswer,
  staleNotice,
  staleSentence,
} = await import('../src/control/seqSend.ts');

test('a session learns the resolve, then only ever raises a revision within one epoch', () => {
  const s = createSeqSession('E1', { A: { rev: 3 }, B: { cue: 'x' } });
  assert.deepEqual([...s.revs], [['A', 3]], 'a graphic with no revision yet is not guessed at');
  learnHead(s, 'E1', { A: { rev: 5 } });
  learnHead(s, 'E1', { A: { rev: 4 } });
  assert.equal(s.revs.get('A'), 5, 'a frame that arrives after a newer answer cannot pull it back');
});

test('another epoch forgets every revision; a first epoch after none keeps them', () => {
  const s = createSeqSession(null, {});
  learnHead(s, null, { A: { rev: 1 } });
  learnHead(s, 'E1', { B: { rev: 2 } });
  assert.deepEqual(Object.fromEntries(s.revs), { A: 1, B: 2 });
  learnHead(s, 'E2', { B: { rev: 1 } });
  assert.equal(s.epoch, 'E2');
  assert.deepEqual(Object.fromEntries(s.revs), { B: 1 }, 'a republished production is a new log');
});

test('the sender body carries what the page saw at press time, and marks All out', () => {
  const s = createSeqSession('E1', { A: { rev: 7 } });
  assert.deepEqual(senderBody(s, 'id-1', 12, ['A', 'B'], false), { id: 'id-1', press: 12, epoch: 'E1', base: { A: 7, B: 0 } });
  assert.equal(senderBody(s, 'id-1', 13, ['A'], true).all_out, true);
});

test('answers are read defensively: only the two refusals and ok are answers at all', () => {
  assert.deepEqual(readSendAnswer({ ok: true, epoch: 'E', head: { graphics: { A: { rev: 2 } } } }), {
    ok: true,
    duplicate: false,
    epoch: 'E',
    graphics: { A: { rev: 2 } },
    skipped: [],
  });
  assert.equal(readSendAnswer({ ok: true, duplicate: true, epoch: 'E', head: {} }).duplicate, true);
  assert.equal(readSendAnswer({ ok: false, refused: 'stale', epoch: 'E', graphics: {} }).refused, 'stale');
  assert.deepEqual(readSendAnswer({ ok: true, epoch: 'E', head: {}, skipped: ['X', 3] }).skipped, ['X']);
  const epochRefusal = readSendAnswer({ ok: false, refused: 'stale', why: 'epoch', epoch: 'E', graphics: {}, stale: ['A'] });
  assert.equal(epochRefusal.epochChanged, true);
  assert.deepEqual(epochRefusal.stale, ['A']);
  assert.equal(readSendAnswer({ ok: false, refused: 'maybe' }), null);
  assert.equal(readSendAnswer(null), null);
  assert.equal(readSendAnswer('ok'), null);
});

test('landed and duplicate both land, and teach the page the new revision', () => {
  const s = createSeqSession('E1', { A: { rev: 1 } });
  assert.deepEqual(settleAnswer(s, readSendAnswer({ ok: true, epoch: 'E1', head: { graphics: { A: { rev: 3 } } } }), ['A']), {
    outcome: 'landed',
    skipped: [],
  });
  assert.equal(s.revs.get('A'), 3);
  assert.equal(settleAnswer(s, readSendAnswer({ ok: true, duplicate: true, epoch: 'E1', head: { graphics: {} } }), ['A']).outcome, 'landed');
});

test('an All out hands back what it left alone, so a page does not mark those graphics off', () => {
  const s = createSeqSession('E1', {});
  const answer = readSendAnswer({ ok: true, epoch: 'E1', head: { graphics: {} }, skipped: ['X'] });
  assert.deepEqual(settleAnswer(s, answer, ['X', 'Y']).skipped, ['X']);
});

test('superseded says nothing: the page\'s own later press is what stands on air', () => {
  const s = createSeqSession('E1', {});
  const answer = readSendAnswer({ ok: false, refused: 'superseded', epoch: 'E1', graphics: { A: { rev: 9 } } });
  assert.equal(settleAnswer(s, answer, ['A']).outcome, 'superseded');
  assert.equal(s.revs.get('A'), 9);
});

/** The error `settleAnswer` throws for this answer. */
function staleThrown(session, raw, graphics) {
  try {
    settleAnswer(session, readSendAnswer(raw), graphics);
  } catch (e) {
    return e;
  }
  return null;
}

test('stale throws the plain sentence and still teaches the page what is on air now', () => {
  const s = createSeqSession('E1', { A: { rev: 1 } });
  const thrown = staleThrown(s, { ok: false, refused: 'stale', epoch: 'E1', graphics: { A: { rev: 4 } }, stale: ['A'] }, ['A']);
  assert.ok(isStale(thrown));
  assert.equal(thrown.message, 'A was changed from another screen, so air did not change.');
  assert.equal(s.revs.get('A'), 4, 'the next press is made on what is on air now, so it lands');
  assert.doesNotMatch(staleSentence(thrown), /monitor/, 'a press that did not move this monitor says nothing about it');
  thrown.aired = true;
  assert.match(staleSentence(thrown), /on this monitor only\. Press again if you still want it\.$/);
  assert.equal(staleNotice(['A', 'B']), 'A and B were changed from another screen, so air did not change.');
  assert.doesNotMatch(staleNotice(['A', 'B', 'C']), /—/);
});

test('the sentence names only the graphics another screen changed, not every one in the press', () => {
  const s = createSeqSession('E1', {});
  const thrown = staleThrown(s, { ok: false, refused: 'stale', epoch: 'E1', graphics: {}, stale: ['A'] }, ['A', 'B']);
  assert.equal(thrown.message, 'A was changed from another screen, so air did not change.');
});

test('a press made against a republished production says that, not "another screen"', () => {
  const s = createSeqSession('E1', {});
  const thrown = staleThrown(s, { ok: false, refused: 'stale', why: 'epoch', epoch: 'E2', graphics: {}, stale: ['A'] }, ['A']);
  assert.ok(isStale(thrown));
  assert.equal(thrown.message, 'This production was published again while this page was open, so air did not change.');
  assert.equal(s.epoch, 'E2', 'and the page now follows the new log');
});

test('an answer the page cannot read is an error, never a silent success', () => {
  assert.throws(() => settleAnswer(createSeqSession('E1', {}), null, ['A']), /cannot read/);
});

/** A send that answers when told to. */
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

test('one send in flight per graphic: the next leaves when the previous answers', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fifo = createGraphicFifo(1500);
  const started = [];
  const first = deferred();
  const second = deferred();
  const a = fifo.run(['A'], () => (started.push(1), first.promise));
  const b = fifo.run(['A'], () => (started.push(2), second.promise));
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(started, [1]);
  first.resolve('one');
  await a;
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(started, [1, 2]);
  second.resolve('two');
  assert.equal(await b, 'two');
  // Nothing is left queued: the next send of the graphic leaves at once.
  const third = fifo.run(['A'], () => (started.push(3), Promise.resolve()));
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(started, [1, 2, 3]);
  await third;
});

test('a stalled send releases the next at its attempt deadline, not when it finally answers', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fifo = createGraphicFifo(1500);
  const started = [];
  const hung = deferred();
  void fifo.run(['A'], () => (started.push('take'), hung.promise));
  void fifo.run(['A'], () => (started.push('out'), Promise.resolve()));
  await new Promise((r) => setImmediate(r));
  t.mock.timers.tick(1499);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(started, ['take']);
  t.mock.timers.tick(1);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(started, ['take', 'out']);
  hung.resolve();
});

test('a failed send releases the queue too, and its failure reaches its own caller', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fifo = createGraphicFifo(1500);
  const a = fifo.run(['A'], () => Promise.reject(new Error('refused')));
  const b = fifo.run(['A'], () => Promise.resolve('next'));
  await assert.rejects(a, /refused/);
  assert.equal(await b, 'next');
});

test('different graphics do not wait for each other; a payload on two waits for both', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fifo = createGraphicFifo(1500);
  const started = [];
  const onA = deferred();
  const onB = deferred();
  void fifo.run(['A'], () => (started.push('A'), onA.promise));
  void fifo.run(['B'], () => (started.push('B'), onB.promise));
  const both = fifo.run(['A', 'B'], () => (started.push('AB'), Promise.resolve()));
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(started, ['A', 'B']);
  onA.resolve();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(started, ['A', 'B'], 'still waiting for B');
  onB.resolve();
  await both;
  assert.deepEqual(started, ['A', 'B', 'AB']);
});

// Issue #914, as hosted staging ran it: Out, then a Take of the same graphic pressed while the Out
// was still on its way. The Take waits in the queue; the Out answers first.
test('an answer names the graphics pressed again since, so the page leaves the later press standing', async () => {
  const book = createPressBook();
  const session = createSeqSession('E1', { H: { rev: 2, on: true } });
  const fifo = createGraphicFifo(1500);
  const press = (n, graphics, allOut = false) => {
    const body = senderBody(session, 'page', n, graphics, allOut);
    book.pressed('show', body);
    return body;
  };
  const outAnswer = deferred();
  const out = press(3, ['H']);
  const outSent = fifo.run(['H'], () => outAnswer.promise);
  const take = press(4, ['H']);
  const takeAnswer = deferred();
  const takeSent = fifo.run(['H'], () => takeAnswer.promise);
  outAnswer.resolve();
  await outSent;
  assert.deepEqual(book.since('show', out), ['H'], 'the Out landed, and the Take pressed after it is what stands');
  // All out, pressed while the Take is still on its way: the Take's answer must not mark H on.
  const allOut = press(5, ['H'], true);
  takeAnswer.resolve();
  await takeSent;
  assert.deepEqual(book.since('show', take), ['H']);
  assert.deepEqual(book.since('show', allOut), [], 'the newest press writes what it did');
  // Per production and per graphic: another show's press, or another graphic's, changes nothing.
  book.pressed('other', senderBody(session, 'page', 6, ['H'], false));
  book.pressed('show', senderBody(session, 'page', 7, ['B'], false));
  assert.deepEqual(book.since('show', allOut), []);
  assert.deepEqual(book.since('show', senderBody(session, 'page', 5, ['H', 'B'], false)), ['B']);
});

// playout-workflow-simplification D11: the page keeps what each head says is on, for All out.
test('a session keeps each graphic\'s on flag with the revision it came with', () => {
  const s = createSeqSession('E1', { A: { rev: 2, on: true }, B: { rev: 1, on: false } });
  assert.deepEqual(Object.fromEntries(s.on), { A: true, B: false });
  learnHead(s, 'E1', { A: { rev: 3, on: false } });
  learnHead(s, 'E1', { A: { rev: 2, on: true } });
  assert.equal(s.on.get('A'), false, 'an older frame cannot put a stopped graphic back on');
  learnHead(s, 'E2', {});
  assert.equal(s.on.size, 0, 'a republished production is a new log');
});
