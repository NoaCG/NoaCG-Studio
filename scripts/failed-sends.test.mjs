// guards: src/control/failedSends.ts
//
// When a verb's send fails: which failures are sent again and for how long, and when the notice a
// failure put up comes down. Run in Node with the clock and the send faked. The wiring - that the
// send path and both operator pages use these - is read in src/control/hostedControl.ts,
// src/components/home/ProductionPage.tsx and src/components/HostedControlPage.tsx.

import test from 'node:test';
import assert from 'node:assert/strict';

const { ATTEMPT_TIMEOUT_MS, RESEND_DELAYS_MS, RESEND_WINDOW_MS, UNANSWERED, createSendDebts, isUnanswered, rpcFailure, sendWithResend, unansweredError, unansweredStatus } =
  await import('../src/control/failedSends.ts');

/** A send that fails with each of `failures` in turn, then lands, and a clock that sleeping moves.
 *  `opts` are sendWithResend's options for a press made now, with nothing newer sent since. */
function rig(...failures) {
  let t = 1_000_000;
  const slept = [];
  let attempts = 0;
  const now = () => t;
  const sleep = async (ms) => {
    slept.push(ms);
    t += ms;
  };
  return {
    attempts: () => attempts,
    slept,
    send: async () => {
      attempts += 1;
      const failure = failures[attempts - 1];
      if (failure) throw failure;
    },
    opts: { deadline: t + RESEND_WINDOW_MS, stillNewest: () => true, now, sleep },
  };
}

test('a send the server did not answer is sent again, and lands', async () => {
  const r = rig(unansweredError(), unansweredError());
  await sendWithResend(r.send, r.opts);
  assert.equal(r.attempts(), 3);
  assert.deepEqual(r.slept, [RESEND_DELAYS_MS[0], RESEND_DELAYS_MS[1]]);
});

test('a refusal is an answer and is never sent again', async () => {
  const r = rig(new Error('slow down'));
  await assert.rejects(sendWithResend(r.send, r.opts), /slow down/);
  assert.equal(r.attempts(), 1);
  assert.deepEqual(r.slept, []);
});

test('no attempt starts after the window, however long the server stays away', async () => {
  const r = rig(...Array.from({ length: 10 }, unansweredError));
  await assert.rejects(sendWithResend(r.send, r.opts), (e) => isUnanswered(e) && e.message === UNANSWERED);
  assert.equal(r.slept.reduce((a, b) => a + b, 0) <= RESEND_WINDOW_MS, true);
  assert.equal(r.attempts(), RESEND_DELAYS_MS.length + 1);
  // An attempt that itself took the whole window leaves no room for another.
  const slow = rig(unansweredError());
  await assert.rejects(sendWithResend(slow.send, { ...slow.opts, deadline: slow.opts.now() - 1 }));
  assert.equal(slow.attempts(), 1);
});

test('a newer press of the same graphic stops the resend, so it can never land behind it', async () => {
  const r = rig(unansweredError());
  let newest = true;
  const sleep = async (ms) => {
    await r.opts.sleep(ms);
    newest = false; // the operator pressed Out while this Take was waiting
  };
  await assert.rejects(sendWithResend(r.send, { ...r.opts, stillNewest: () => newest, sleep }));
  assert.equal(r.attempts(), 1);
});

/** A transport that answers each attempt as `plan` says - an Error to throw, or HANG to never
 *  answer - and a fake clock. A hung attempt ends only when its timer fires, which moves the clock
 *  by the timer's own length; a timer an answer cancelled first never moves it. */
const HANG = Symbol('hang');
function heldRig(...plan) {
  let t = 1_000_000;
  const press = t;
  const attempts = [];
  const timer = (ms, fire) => {
    const h = setImmediate(() => {
      t += ms;
      fire();
    });
    return () => clearImmediate(h);
  };
  return {
    attempts,
    press,
    now: () => t,
    send: (signal) => {
      const step = plan[attempts.length] ?? HANG;
      attempts.push({ at: t - press, signal });
      return step === HANG ? new Promise(() => {}) : Promise.reject(step);
    },
    opts: {
      deadline: press + RESEND_WINDOW_MS,
      stillNewest: () => true,
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
      timer,
    },
  };
}

test('an attempt nobody answers is abandoned at its deadline and counted as unanswered', async () => {
  // The late Take of the research (§5.6): its request held in the browser, never answered.
  const r = heldRig();
  const e = await sendWithResend(r.send, r.opts).then(() => null, (err) => err);
  assert.equal(isUnanswered(e), true, 'an abandoned attempt ends like any unanswered send');
  // Each attempt was cut at ATTEMPT_TIMEOUT_MS and its request cancelled, then sent again after the
  // first resend delay, and no attempt started after the window closed.
  assert.deepEqual(
    r.attempts.map((a) => a.at),
    [0, ATTEMPT_TIMEOUT_MS + RESEND_DELAYS_MS[0]],
  );
  assert.equal(r.attempts.every((a) => a.signal.aborted), true, 'every abandoned request is cancelled');
  assert.equal(r.attempts.every((a) => a.at < RESEND_WINDOW_MS), true);
  assert.equal(r.now() - r.press, 2 * ATTEMPT_TIMEOUT_MS + RESEND_DELAYS_MS[0]);
});

test('no attempt runs on past the window, however late it started', async () => {
  // Three fast 503s spend the resend delays, and the fourth attempt, started at 3.4 s, hangs: it
  // is cut at the window's end rather than a whole attempt's length later.
  const r = heldRig(unansweredError(), unansweredError(), unansweredError());
  await assert.rejects(sendWithResend(r.send, r.opts), (e) => isUnanswered(e));
  assert.deepEqual(
    r.attempts.map((a) => a.at),
    [0, 400, 1400, 3400],
  );
  assert.equal(r.now() - r.press, RESEND_WINDOW_MS);
  assert.equal(r.attempts[3].signal.aborted, true);
});

test('an answer arriving after its attempt was abandoned is ignored, and the resend decides', async () => {
  let answerLate;
  const r = heldRig();
  const send = (signal) => {
    if (r.attempts.length === 0) {
      r.attempts.push({ at: r.now() - r.press, signal });
      return new Promise((resolve) => {
        answerLate = resolve;
      });
    }
    answerLate(); // the first attempt's answer turns up while the second is in flight
    r.attempts.push({ at: r.now() - r.press, signal });
    return Promise.reject(new Error('slow down'));
  };
  await assert.rejects(sendWithResend(send, r.opts), /slow down/);
  assert.equal(r.attempts.length, 2);
});

test('an abandoned Take is not sent again once a newer press of its graphic went out', async () => {
  const r = heldRig();
  let newest = true;
  const sleep = async (ms) => {
    await r.opts.sleep(ms);
    newest = false; // the operator pressed Out while the Take was held
  };
  await assert.rejects(sendWithResend(r.send, { ...r.opts, stillNewest: () => newest, sleep }), (e) => isUnanswered(e));
  assert.equal(r.attempts.length, 1);
});

test('which answers mean the server did not answer, and how each is worded', () => {
  for (const status of [0, 502, 503, 504, 520, 521, 522, 525]) assert.equal(unansweredStatus(status), true, `status ${status}`);
  for (const status of [400, 401, 403, 404, 409, 429, 500]) assert.equal(unansweredStatus(status), false, `status ${status}`);
  assert.equal(unansweredStatus(500, '57014'), true, 'a statement cancelled on its timeout was rolled back');
  const warn = console.warn;
  console.warn = () => {};
  try {
    const down = rpcFailure('control_send_many', { code: 'PGRST002', message: 'Could not query the database for the schema cache. Retrying.' }, 503);
    assert.equal(isUnanswered(down), true);
    assert.equal(down.message, UNANSWERED);
  } finally {
    console.warn = warn;
  }
  const refused = rpcFailure('control_send_many', { code: 'P0001', message: 'slow down' }, 400);
  assert.equal(isUnanswered(refused), false);
  assert.equal(refused.message, 'slow down');
});

test('a notice stays until every graphic it was about has been sent again', () => {
  const debts = createSendDebts();
  const shown = 'Take is on this monitor only.';
  debts.failed([{ graphic: 'quiz' }], shown);
  assert.equal(debts.landed([{ graphic: 'score' }])(shown), shown, 'another graphic landing settles nothing');
  assert.equal(debts.landed([{ graphic: 'quiz' }])(shown), null);
  assert.equal(debts.landed([{ graphic: 'quiz' }])('✓ Published.'), '✓ Published.', 'nothing is owed any more');

  debts.failed([{ graphic: 'quiz' }], 'Take failed: A.');
  debts.failed([{ graphic: 'score' }, { graphic: 'score' }], 'Update failed: B.');
  assert.equal(debts.landed([{ graphic: 'quiz' }])('Update failed: B.'), 'Update failed: B.', 'the score is still owed');
  const settle = debts.landed([{ graphic: 'score' }]);
  assert.equal(settle('Update failed: B.'), null);
  assert.equal(settle('Take of Quiz: 1 of 2 on air. Take failed: A.'), null, 'inside a folder summary too');
  assert.equal(settle('✓ Published.'), '✓ Published.', 'a line that moved on is left alone');
});
