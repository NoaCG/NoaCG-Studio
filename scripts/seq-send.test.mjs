// guards: src/control/seqSend.ts
//
// The protocol-2 send (Phase 6 Step 2, migration 0070): what a page tells control_send_seq about
// each press (its id, press number, epoch and the revisions it had seen when the operator pressed),
// what it learns from answers and frames, what it does with each answer, and the one-send-in-flight
// queue per graphic that keeps two Nexts from arriving in the wrong order. Run in Node. The wiring
// is sendControlVerb in src/control/hostedControl.ts; the server half is 0070's own self-check.

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  createGraphicFifo,
  createSeqSession,
  isStale,
  learnHead,
  mintSenderId,
  readSendAnswer,
  senderBody,
  settleAnswer,
  staleNotice,
  staleSentence,
} = await import('../src/control/seqSend.ts');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('a sender id is a uuid (the server refuses anything else), fresh per call', () => {
  const a = mintSenderId();
  assert.match(a, UUID);
  assert.notEqual(a, mintSenderId());
});

test('the fallback id is still a v4 uuid when randomUUID is missing (older CEF)', (t) => {
  const real = globalThis.crypto.randomUUID;
  t.after(() => Object.defineProperty(globalThis.crypto, 'randomUUID', { value: real, configurable: true }));
  Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
  assert.match(mintSenderId(), UUID);
});

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
  assert.match(staleSentence(thrown, true), /on this monitor only\. Press again if you still want it\.$/);
  assert.doesNotMatch(staleSentence(thrown, false), /monitor/);
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
  assert.equal(fifo.busy, 0);
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
