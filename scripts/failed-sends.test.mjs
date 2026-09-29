// guards: src/control/failedSends.ts
//
// When a verb's send fails: which failures are sent again and for how long, and when the notice a
// failure put up comes down. Run in Node with the clock and the send faked. The wiring - that the
// send path and both operator pages use these - is read in src/control/hostedControl.ts,
// src/components/home/ProductionPage.tsx and src/components/HostedControlPage.tsx.

import test from 'node:test';
import assert from 'node:assert/strict';

const { RESEND_DELAYS_MS, RESEND_WINDOW_MS, UNANSWERED, createSendDebts, isUnanswered, sendWithResend, unansweredError, unansweredStatus, withoutSettled } =
  await import('../src/control/failedSends.ts');

/** A send that fails with each of `failures` in turn, then lands; and a clock that sleeping moves. */
function rig(...failures) {
  let t = 1_000_000;
  const slept = [];
  let attempts = 0;
  return {
    attempts: () => attempts,
    slept,
    now: () => t,
    sleep: async (ms) => {
      slept.push(ms);
      t += ms;
    },
    send: async () => {
      attempts += 1;
      const failure = failures[attempts - 1];
      if (failure) throw failure;
    },
    start: t,
  };
}

test('a send the server did not answer is sent again, and lands', async () => {
  const r = rig(unansweredError(), unansweredError());
  await sendWithResend(r.send, { deadline: r.start + RESEND_WINDOW_MS, stillNewest: () => true, now: r.now, sleep: r.sleep });
  assert.equal(r.attempts(), 3);
  assert.deepEqual(r.slept, [RESEND_DELAYS_MS[0], RESEND_DELAYS_MS[1]]);
});

test('a refusal is an answer and is never sent again', async () => {
  const r = rig(new Error('slow down'));
  await assert.rejects(
    sendWithResend(r.send, { deadline: r.start + RESEND_WINDOW_MS, stillNewest: () => true, now: r.now, sleep: r.sleep }),
    /slow down/,
  );
  assert.equal(r.attempts(), 1);
  assert.deepEqual(r.slept, []);
});

test('no attempt starts after the window, however long the server stays away', async () => {
  const r = rig(...Array.from({ length: 10 }, unansweredError));
  await assert.rejects(
    sendWithResend(r.send, { deadline: r.start + RESEND_WINDOW_MS, stillNewest: () => true, now: r.now, sleep: r.sleep }),
    (e) => isUnanswered(e) && e.message === UNANSWERED,
  );
  assert.equal(r.slept.reduce((a, b) => a + b, 0) <= RESEND_WINDOW_MS, true);
  assert.equal(r.attempts(), RESEND_DELAYS_MS.length + 1);
  // An attempt that itself took most of the window leaves no room for another.
  const slow = rig(unansweredError());
  await assert.rejects(
    sendWithResend(slow.send, { deadline: slow.start - 1, stillNewest: () => true, now: slow.now, sleep: slow.sleep }),
  );
  assert.equal(slow.attempts(), 1);
});

test('a newer press of the same graphic stops the resend, so it can never land behind it', async () => {
  const r = rig(unansweredError());
  let newest = true;
  const sleep = async (ms) => {
    await r.sleep(ms);
    newest = false; // the operator pressed Out while this Take was waiting
  };
  await assert.rejects(sendWithResend(r.send, { deadline: r.start + RESEND_WINDOW_MS, stillNewest: () => newest, now: r.now, sleep }));
  assert.equal(r.attempts(), 1);
});

test('which answers mean the server did not answer', () => {
  for (const status of [0, 502, 503, 504, 520, 521, 522, 525]) assert.equal(unansweredStatus(status), true, `status ${status}`);
  for (const status of [400, 401, 403, 404, 409, 429, 500]) assert.equal(unansweredStatus(status), false, `status ${status}`);
  assert.equal(unansweredStatus(500, '57014'), true, 'a statement cancelled on its timeout was rolled back');
});

test("a notice stays until every graphic it was about has been sent again", () => {
  const debts = createSendDebts();
  debts.failed([{ graphic: 'quiz' }], 'Take is on this monitor only.');
  assert.deepEqual(debts.landed([{ graphic: 'score' }]), [], 'another graphic landing settles nothing');
  assert.deepEqual(debts.landed([{ graphic: 'quiz' }]), ['Take is on this monitor only.']);
  assert.deepEqual(debts.landed([{ graphic: 'quiz' }]), [], 'nothing is owed any more');

  debts.failed([{ graphic: 'quiz' }], 'Take failed: A.');
  debts.failed([{ graphic: 'score' }, { graphic: 'score' }], 'Update failed: B.');
  assert.deepEqual(debts.landed([{ graphic: 'quiz' }]), [], 'the score is still owed');
  assert.deepEqual(debts.landed([{ graphic: 'score' }]), ['Take failed: A.', 'Update failed: B.']);
});

test('only a notice that still shows a settled failure comes down', () => {
  const settled = ['Take of Q2 is on this monitor only.'];
  assert.equal(withoutSettled('Take of Q2 is on this monitor only.', settled), null);
  assert.equal(withoutSettled('Take of Quiz: 1 of 2 on air. Take of Q2 is on this monitor only.', settled), null);
  assert.equal(withoutSettled('✓ Published.', settled), '✓ Published.');
  assert.equal(withoutSettled(null, settled), null);
});
