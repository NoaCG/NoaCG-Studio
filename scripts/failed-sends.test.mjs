// guards: src/control/failedSends.ts
//
// When a verb's send fails: which failures are sent again and for how long, and when the notice a
// failure put up comes down. Run in Node with the clock and the send faked. The wiring - that the
// send path and the production page use these - is read in src/control/hostedControl.ts and
// src/components/home/ProductionPage.tsx.

import test from 'node:test';
import assert from 'node:assert/strict';

const { ATTEMPT_TIMEOUT_MS, MIN_ATTEMPT_MS, REFUSALS_BEFORE_ABSENT, RESEND_DELAYS_MS, RESEND_WINDOW_MS, UNANSWERED, createSendDebts, isRefusal, isUnanswered, rpcFailure, sendWithResend, seqRoadVerdict, unansweredError, unansweredStatus } =
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

test('a resend that would have less than the least useful time left is not started', async () => {
  // 400 ms to wait with 500 ms of window left would leave an attempt 100 ms: cancelled before a
  // healthy answer could come, yet its request could still commit late.
  const r = heldRig(unansweredError());
  const deadline = r.now() + RESEND_DELAYS_MS[0] + MIN_ATTEMPT_MS - 1;
  await assert.rejects(sendWithResend(r.send, { ...r.opts, deadline }), (e) => isUnanswered(e));
  assert.equal(r.attempts.length, 1);
  const roomy = heldRig(unansweredError(), new Error('slow down'));
  await assert.rejects(
    sendWithResend(roomy.send, { ...roomy.opts, deadline: roomy.now() + RESEND_DELAYS_MS[0] + MIN_ATTEMPT_MS }),
    /slow down/,
  );
  assert.equal(roomy.attempts.length, 2);
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

test('a page that sends leaves the ordered road on proof the server has none, or a lasting refusal (#1697)', () => {
  const operator = { sends: true };
  const row = (refusals, timeouts = 0) => ({ refusals, timeouts });
  assert.equal(seqRoadVerdict(404, 'PGRST202', row(1), operator, false), 'absent', 'no such function: the server has no sequence road');
  // Each of these used to put the page on today's road, with no per-graphic order, at the first.
  for (const [status, code] of [[500, 'XX000'], [400, 'P0001'], [401, '42501'], [409, '40001'], [500, '40P01'], [404, '42883'], [300, 'PGRST203']]) {
    assert.equal(seqRoadVerdict(status, code, row(1), operator, false), 'ask-again', `${status} ${code}`);
  }
  assert.equal(seqRoadVerdict(500, 'XX000', row(REFUSALS_BEFORE_ABSENT - 1), operator, false), 'ask-again');
  assert.equal(seqRoadVerdict(500, 'XX000', row(REFUSALS_BEFORE_ABSENT), operator, false), 'absent', 'a lasting fault still leaves the page working');
  for (const [status, code] of [[0, undefined], [503, 'PGRST002'], [500, '57014']]) {
    assert.equal(seqRoadVerdict(status, code, row(50, 50), operator, false), 'ask-again', `unanswered ${status} ${code}`);
  }
  assert.equal(seqRoadVerdict(404, 'PGRST202', row(1), operator, true), 'ask-again', 'a road that answered once is not given up mid-session (a stale schema cache)');
  assert.equal(seqRoadVerdict(401, 'PGRST301', row(50), operator, false), 'ask-again', 'a lapsed sign-in says nothing about the server');
  assert.equal(isRefusal(401, 'PGRST301'), false);
  assert.equal(isRefusal(500, 'XX000'), true);
  assert.equal(isRefusal(503, 'PGRST002'), false);
  assert.equal(seqRoadVerdict(500, 'XX000', row(50), operator, true), 'ask-again');
});

test('a page that only follows keeps its old rule: any answer decides, and so do its timeouts', () => {
  const renderer = { sends: false, timeoutsBeforeAbsent: 3 };
  const row = (timeouts) => ({ refusals: 0, timeouts });
  assert.equal(seqRoadVerdict(500, 'XX000', row(0), renderer, false), 'absent');
  assert.equal(seqRoadVerdict(404, 'PGRST202', row(0), renderer, true), 'absent');
  assert.equal(seqRoadVerdict(503, 'PGRST002', row(0), renderer, false), 'ask-again');
  assert.equal(seqRoadVerdict(500, '57014', row(2), renderer, false), 'ask-again');
  assert.equal(seqRoadVerdict(500, '57014', row(3), renderer, false), 'absent');
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

test('a failed send whose own row comes back after all takes its notice down', () => {
  const debts = createSendDebts();
  const shown = 'That is on this monitor only.';
  const take = [{ graphic: 'quiz', msg: { t: 'play', oid: 'a1' } }, { graphic: 'quiz', msg: { t: 'cue', oid: 'a2' } }];
  debts.failed(take, shown);
  assert.equal(debts.heard([{ graphic: 'quiz', msg: { t: 'play', oid: 'other' } }]), null, 'another send of the graphic is not this one');
  assert.equal(debts.heard([{ graphic: 'quiz', msg: { t: 'play' } }]), null, 'a row with no id settles nothing');
  assert.equal(debts.heard([{ graphic: 'quiz', msg: { t: 'cue', oid: 'a2' } }])(shown), null);
  assert.equal(debts.heard([{ graphic: 'quiz', msg: { t: 'play', oid: 'a1' } }]), null, 'settled once');
});

test('only the newest failure of a graphic is settled by its row', () => {
  const debts = createSendDebts();
  debts.failed([{ graphic: 'quiz', msg: { oid: 'old' } }], 'Take failed: A.');
  debts.failed([{ graphic: 'quiz', msg: { oid: 'new' } }], 'Out failed: B.');
  assert.equal(debts.heard([{ graphic: 'quiz', msg: { oid: 'old' } }]), null, 'the older press landing late leaves the later one owed');
  assert.equal(debts.heard([{ graphic: 'quiz', msg: { oid: 'new' } }])('Out failed: B.'), null);
});

test('a row settles its graphic but not another one still owed', () => {
  const debts = createSendDebts();
  debts.failed([{ graphic: 'quiz', msg: { oid: 'q' } }], 'Take failed: A.');
  debts.failed([{ graphic: 'score', msg: { oid: 's' } }], 'Update failed: B.');
  assert.equal(debts.heard([{ graphic: 'quiz', msg: { oid: 'q' } }])('Update failed: B.'), 'Update failed: B.', 'the score is still owed');
  assert.equal(debts.landed([{ graphic: 'score' }])('Update failed: B.'), null);
});

test('owed() counts the graphics a failed send still owes, until a landing or its own row settles them (data-sources C6)', async () => {
  const { createSendDebts } = await import('../src/control/failedSends.ts');
  const debts = createSendDebts();
  assert.equal(debts.owed(), 0);
  debts.failed([{ graphic: 'A', msg: { oid: 'a1' } }, { graphic: 'B', msg: { oid: 'b1' } }], 'A and B failed');
  assert.equal(debts.owed(), 2);
  debts.landed([{ graphic: 'C' }]);
  assert.equal(debts.owed(), 2, 'another graphic landing settles neither');
  debts.heard([{ graphic: 'A', msg: { oid: 'a1' } }]);
  assert.equal(debts.owed(), 1);
  debts.landed([{ graphic: 'B' }]);
  assert.equal(debts.owed(), 0);
});

test('a bound press call is sent again only when nothing was recorded; a refusal is a refusal whatever its status (#2617)', async () => {
  const { boundPressFailure } = await import('../src/control/failedSends.ts');
  const kind = (code, status) => boundPressFailure(code === null ? null : { message: 'x', code }, status).press;
  assert.equal(kind('PGRST202', 404), 'missing');
  for (const code of ['57014', '55P03', '23514', '40001']) assert.equal(kind(code, 400), 'retry', code);
  assert.equal(kind(null, 0), 'retry', 'no answer at all');
  assert.equal(kind('', 503), 'retry');
  assert.equal(kind('PGRST301', 401), 'retry', 'a lapsed sign-in');
  assert.equal(kind('', 408), 'retry', 'a gateway timeout recorded nothing');
  assert.equal(kind(null, 429), 'retry', 'a rate limit recorded nothing');
  // PostgREST answers 42501 with 401 to a signed-out caller: still a refusal, never resent for an hour.
  assert.equal(kind('42501', 401), 'refused');
  assert.equal(kind('42501', 403), 'refused');
  assert.equal(kind('P0001', 400), 'refused', 'unknown control slug');
  assert.equal(kind('22023', 400), 'refused', 'not a press batch');
});

// ── #2655: a press sent until it lands (docs/work-specs/live-publishing/evidence/fix-2655.md) ──

const failed = await import('../src/control/failedSends.ts');

test('R2: a held press is never given up on by time: 0.4, 1 and 2 s, then every 4 s, until it lands', async () => {
  const r = rig(...Array.from({ length: 12 }, () => unansweredError()));
  await sendWithResend(r.send, { ...r.opts, held: true });
  assert.equal(r.attempts(), 13, 'twelve unanswered attempts, then the one that landed');
  assert.deepEqual(r.slept, [400, 1000, 2000, ...Array(9).fill(failed.RESEND_EVERY_MS)]);
});

test('R2 (#2671): every attempt of a held press is cut at 8 s, the first included', async () => {
  const cuts = [];
  let attempts = 0;
  const timer = (ms, fire) => {
    cuts.push(ms);
    // Every attempt hangs until its cut, except the eighth.
    if (attempts < 8) queueMicrotask(fire);
    return () => {};
  };
  await sendWithResend(
    () => {
      attempts += 1;
      return attempts === 8 ? Promise.resolve() : new Promise(() => {});
    },
    { deadline: 0, stillNewest: () => true, held: true, sleep: async () => {}, timer },
  );
  assert.deepEqual(cuts.slice(0, 8), Array(8).fill(failed.HELD_ATTEMPT_MS));
});

test('R2a (#2671): after a busy head a held press goes again in 0.4 s for its first 10 s, then R2\'s waits', async () => {
  // Each copy waits its 1.1 s at the head and is refused 55P03; the clock moves with it.
  const run = async (failure, held) => {
    let t = 1_000_000;
    const slept = [];
    let attempts = 0;
    await sendWithResend(
      async () => {
        attempts += 1;
        if (attempts > 12) return;
        t += 1100;
        throw failure();
      },
      { deadline: t + RESEND_WINDOW_MS, stillNewest: () => true, held, now: () => t, sleep: async (ms) => { slept.push(ms); t += ms; } },
    ).catch(() => {});
    return slept;
  };
  // Answers at 1.1, 2.6, 4.1, 5.6, 7.1, 8.6 s are under 10 s; the one at 10.1 s is not.
  assert.deepEqual(await run(failed.headBusyError, true), [...Array(6).fill(failed.BUSY_RESEND_MS), ...Array(6).fill(failed.RESEND_EVERY_MS)]);
  // Any other unanswered ending keeps R2's waits by attempt number.
  assert.deepEqual(await run(unansweredError, true), [400, 1000, 2000, ...Array(9).fill(failed.RESEND_EVERY_MS)]);
  // A press that is not held is unchanged: its 4 s window, R2's waits.
  assert.deepEqual(await run(failed.headBusyError, false), [400, 1000]);
  assert.equal(isUnanswered(failed.headBusyError()), true, 'a busy head is still unanswered');
  assert.equal(failed.isHeadBusy(unansweredError()), false);
});

test('R2: a press that is not held keeps today\'s 4 s window', async () => {
  const r = rig(...Array.from({ length: 12 }, () => unansweredError()));
  await assert.rejects(sendWithResend(r.send, r.opts), (e) => isUnanswered(e));
  assert.equal(r.attempts(), RESEND_DELAYS_MS.length + 1);
});

test('R2: a refusal still ends a held press at once', async () => {
  const r = rig(unansweredError(), new Error('hosted control is switched off'));
  await assert.rejects(sendWithResend(r.send, { ...r.opts, held: true }), /switched off/);
  assert.equal(r.attempts(), 2);
});

test('R6: Stop sending ends a held press during an attempt and during a wait, and nothing more is sent', async () => {
  // During an attempt: the request is cancelled at once.
  const stop = new AbortController();
  let signalSeen = null;
  const during = sendWithResend(
    (signal) => {
      signalSeen = signal;
      return new Promise(() => {});
    },
    { deadline: 0, stillNewest: () => true, held: true, stop: stop.signal },
  );
  await new Promise((r) => setImmediate(r));
  stop.abort(failed.stoppedError());
  await assert.rejects(during, (e) => failed.isStopped(e) && e.message === failed.STOPPED);
  assert.equal(signalSeen.aborted, true, 'its request was cancelled');

  // During a wait between attempts: no attempt after it.
  const stop2 = new AbortController();
  let attempts = 0;
  const between = sendWithResend(
    async () => {
      attempts += 1;
      throw unansweredError();
    },
    { deadline: 0, stillNewest: () => true, held: true, stop: stop2.signal, sleep: () => new Promise(() => {}) },
  );
  await new Promise((r) => setImmediate(r));
  stop2.abort(failed.stoppedError());
  await assert.rejects(between, (e) => failed.isStopped(e));
  assert.equal(attempts, 1);
});

test('R6: a stopped press is owed (a copy may still land) and is not sent again', () => {
  const e = failed.stoppedError();
  assert.equal(isUnanswered(e), true);
  assert.equal(failed.isUncertain(e), true);
});

test('R6a: an unknown outcome is owed but never sent again', async () => {
  const e = failed.maybeLandedError('another screen changed it while it was being sent');
  assert.equal(failed.isUncertain(e), true);
  assert.equal(isUnanswered(e), false);
  const r = rig(unansweredError(), e);
  await assert.rejects(sendWithResend(r.send, { ...r.opts, held: true }), (x) => failed.isMaybeLanded(x));
  assert.equal(r.attempts(), 2);
});

test('R7: a lost Take stays owed when an Update of its graphic lands; an Out of it settles it', () => {
  const debts = createSendDebts();
  const take = [
    { graphic: 'score', msg: { t: 'update', data: {}, oid: 't1' } },
    { graphic: 'score', msg: { t: 'play' } },
    { graphic: 'bug', msg: { t: 'stop' } },
  ];
  debts.failed(take, 'Take is on this monitor only.');
  const shown = 'Take is on this monitor only.';
  assert.equal(debts.landed([{ graphic: 'score', msg: { t: 'update', data: {} } }])(shown), shown, 'an Update does not pay a Take');
  assert.equal(debts.owed(), 2);
  assert.equal(debts.landed([{ graphic: 'score', msg: { t: 'stop' } }])(shown), shown, 'the peer the Take took off is still owed');
  assert.equal(debts.owed(), 1);
  assert.equal(debts.landed([{ graphic: 'bug', msg: { t: 'play' } }])(shown), null);
});

test('R7: a failed Update is paid by a later landed Update of its graphic, as today', () => {
  const debts = createSendDebts();
  debts.failed([{ graphic: 'score', msg: { t: 'update', data: {} } }], 'Update failed.');
  assert.equal(debts.landed([{ graphic: 'score', msg: { t: 'update', data: {} } }])('Update failed.'), null);
});

test('R7: a lost Take stays owed through a failed Update and a landed Update; its own row still settles it', () => {
  const debts = createSendDebts();
  const shown = 'Take is on this monitor only.';
  debts.failed([{ graphic: 'g', msg: { t: 'update', data: {}, oid: 'take-1' } }, { graphic: 'g', msg: { t: 'play' } }], shown);
  debts.failed([{ graphic: 'g', msg: { t: 'update', data: {}, oid: 'upd-1' } }], 'Update failed.');
  assert.equal(debts.landed([{ graphic: 'g', msg: { t: 'update', data: {} } }])(shown), shown, 'the Take is still owed');
  assert.equal(debts.owed(), 1);
  const settle = debts.heard([{ graphic: 'g', msg: { t: 'update', data: {}, oid: 'take-1' } }]);
  assert.ok(settle, 'the Take\'s own row is still recognised');
  assert.equal(settle(shown), null);
});

test('R7: a newer failed Take makes an older one moot; an older one landing late does not clear it', () => {
  const debts = createSendDebts();
  debts.failed([{ graphic: 'g', msg: { t: 'play', oid: 'a' } }], 'one');
  debts.failed([{ graphic: 'g', msg: { t: 'play', oid: 'b' } }], 'two');
  assert.equal(debts.heard([{ graphic: 'g', msg: { t: 'play', oid: 'a' } }]), null, 'the older press is not owed any more');
  assert.equal(debts.owed(), 1);
});

test('R3: its own row heard ends a held press without cutting the attempt in flight, whose answer is still read', async () => {
  const settled = new AbortController();
  let answer;
  const answered = new Promise((r) => (answer = r));
  const sending = sendWithResend(() => answered, { deadline: 0, stillNewest: () => true, held: true, settled: settled.signal });
  settled.abort();
  answer();
  await sending;
  // Heard while waiting between two attempts: no attempt after it.
  const heard = new AbortController();
  let attempts = 0;
  const waiting = sendWithResend(
    async () => {
      attempts += 1;
      throw unansweredError();
    },
    { deadline: 0, stillNewest: () => true, held: true, settled: heard.signal, sleep: () => new Promise(() => {}) },
  );
  await new Promise((r) => setImmediate(r));
  heard.abort();
  await assert.rejects(waiting, (e) => isUnanswered(e));
  assert.equal(attempts, 1);
});

test('R6: one stop ending two presses gives each its own error, so neither carries the other\'s ids', async () => {
  const stop = new AbortController();
  const hang = () => new Promise(() => {});
  const a = sendWithResend(hang, { deadline: 0, stillNewest: () => true, held: true, stop: stop.signal });
  const b = sendWithResend(hang, { deadline: 0, stillNewest: () => true, held: true, stop: stop.signal });
  await new Promise((r) => setImmediate(r));
  stop.abort(failed.stoppedError());
  const [ea, eb] = await Promise.all([a.catch((e) => e), b.catch((e) => e)]);
  assert.notEqual(ea, eb);
  assert.ok(failed.isStopped(ea) && failed.isStopped(eb) && isUnanswered(eb));
  ea.sent = ['take A'];
  assert.equal(eb.sent, undefined);
});

test('R7: an Out that landed before the Take pressed ahead of it finished failing settles that Take', () => {
  const debts = createSendDebts();
  const shown = 'Take is on this monitor only.';
  // The Out (press 2) lands while the Take (press 1) is still ending; then the Take fails.
  debts.landed([{ graphic: 'g', msg: { t: 'stop' } }], 2);
  debts.failed([{ graphic: 'g', msg: { t: 'play', oid: 't' } }], shown, 1);
  assert.equal(debts.owed(), 0, 'the Out already replaced it');
  // An Update that landed first does not pay a Take pressed before it.
  debts.landed([{ graphic: 'h', msg: { t: 'update' } }], 4);
  debts.failed([{ graphic: 'h', msg: { t: 'play', oid: 'u' } }], shown, 3);
  assert.equal(debts.owed(), 1);
  // But it pays an Update pressed before it.
  debts.landed([{ graphic: 'k', msg: { t: 'update' } }], 6);
  debts.failed([{ graphic: 'k', msg: { t: 'update', oid: 'v' } }], 'Update failed.', 5);
  assert.equal(debts.owed(), 1);
  // A press made after the landing is owed as before.
  debts.failed([{ graphic: 'g', msg: { t: 'play', oid: 'w' } }], shown, 7);
  assert.equal(debts.owed(), 2);
});

// ── #2655, the Repeated-family reassessment: the debt record's one rule, facts in any order ──

/** Every ordering of `facts`. */
function permutations(facts) {
  if (facts.length <= 1) return [facts];
  return facts.flatMap((f, i) => permutations([...facts.slice(0, i), ...facts.slice(i + 1)]).map((rest) => [f, ...rest]));
}

const apply = (debts, fact) =>
  fact.kind === 'failed' ? debts.failed(fact.items, fact.note, fact.order) : fact.kind === 'landed' ? debts.landed(fact.items, fact.order) : debts.heard(fact.items);

const take = (g, n, oid) => [{ graphic: g, msg: { t: 'update', data: {}, oid } }, { graphic: g, msg: { t: 'play' } }];
const out = (g, oid) => [{ graphic: g, msg: { t: 'stop', oid } }];
const update = (g, oid) => [{ graphic: g, msg: { t: 'update', data: {}, oid } }];

test('the debt record: the same facts in any order owe the same graphics (press order, not arrival order)', () => {
  const scenarios = [
    // Take 1 stuck, Out 2 replaces it and fails, then the Take's attempt fails: the Out is owed.
    { facts: [{ kind: 'failed', items: take('g', 1, 't1'), note: 'Take', order: 1 }, { kind: 'failed', items: out('g', 'o2'), note: 'Out', order: 2 }], owed: 1 },
    // ... and the Out's own row comes back: nothing is owed.
    {
      facts: [
        { kind: 'failed', items: take('g', 1, 't1'), note: 'Take', order: 1 },
        { kind: 'failed', items: out('g', 'o2'), note: 'Out', order: 2 },
        { kind: 'heard', items: out('g', 'o2') },
      ],
      owed: 0,
    },
    // ... the TAKE's row comes back instead: the Out is still owed (an older landing pays nothing newer).
    {
      facts: [
        { kind: 'failed', items: take('g', 1, 't1'), note: 'Take', order: 1 },
        { kind: 'failed', items: out('g', 'o2'), note: 'Out', order: 2 },
        { kind: 'heard', items: take('g', 1, 't1') },
      ],
      owed: 1,
    },
    // The Out lands by its answer, the Take before it fails: the Out paid it.
    { facts: [{ kind: 'failed', items: take('g', 1, 't1'), note: 'Take', order: 1 }, { kind: 'landed', items: out('g', 'o2'), order: 2 }], owed: 0 },
    // An older Take lands by its answer, the newer Out fails: the Out is owed.
    { facts: [{ kind: 'landed', items: take('g', 1, 't1'), order: 1 }, { kind: 'failed', items: out('g', 'o2'), note: 'Out', order: 2 }], owed: 1 },
    // A later Update lands: it pays a failed Update, never a failed Take.
    { facts: [{ kind: 'failed', items: take('g', 1, 't1'), note: 'Take', order: 1 }, { kind: 'landed', items: update('g', 'u2'), order: 2 }], owed: 1 },
    { facts: [{ kind: 'failed', items: update('g', 'u1'), note: 'Update', order: 1 }, { kind: 'landed', items: update('g', 'u2'), order: 2 }], owed: 0 },
    // Two graphics: each is settled only by its own facts.
    {
      facts: [
        { kind: 'failed', items: take('a', 1, 'a1'), note: 'Take a', order: 1 },
        { kind: 'failed', items: take('b', 2, 'b2'), note: 'Take b', order: 2 },
        { kind: 'heard', items: take('a', 1, 'a1') },
        { kind: 'landed', items: update('b', 'u3'), order: 3 },
      ],
      owed: 1,
    },
    // A press that never left but moved this monitor is owed with no ids: only a later press pays it.
    { facts: [{ kind: 'failed', items: [{ graphic: 'g', msg: { t: 'play' } }], note: 'Take', order: 1 }, { kind: 'heard', items: take('g', 9, 'x') }], owed: 1 },
    { facts: [{ kind: 'failed', items: [{ graphic: 'g', msg: { t: 'play' } }], note: 'Take', order: 1 }, { kind: 'landed', items: out('g', 'o2'), order: 2 }], owed: 0 },
  ];
  for (const [i, { facts, owed }] of scenarios.entries()) {
    for (const order of permutations(facts)) {
      const debts = createSendDebts();
      for (const fact of order) apply(debts, fact);
      assert.equal(debts.owed(), owed, `scenario ${i}, facts in the order ${order.map((f) => `${f.kind}:${f.order ?? f.items[0].msg.oid}`).join(', ')}`);
    }
  }
});

test('R7: replacedSince says whether a later REPLACING press of this page already landed on every graphic', () => {
  const debts = createSendDebts();
  debts.landed(out('g', 'o2'), 2);
  assert.equal(debts.replacedSince(take('g', 1, 't1'), 1), true, 'the Out pressed after it landed');
  assert.equal(debts.replacedSince(take('g', 3, 't3'), 3), false, 'pressed after the Out');
  debts.landed(update('h', 'u2'), 2);
  assert.equal(debts.replacedSince(take('h', 1, 't1'), 1), false, 'an Update never silences a Take');
  assert.equal(debts.replacedSince(update('h', 'u1'), 1), false, 'nor an Update: a later modifying press may carry other fields');
  assert.equal(debts.replacedSince([...take('g', 1, 't1'), ...take('k', 1, 'k1')], 1), false, 'one graphic not replaced');
  assert.equal(debts.replacedSince([], 1), false);
});

// ── #2671: the held schedule against a reference model built from the Rules (fix-2655.md R2, R2a) ──
//
// The oracle restates the Rules, not sendWithResend: each attempt ends at its answer or at the 8 s
// cut; the next starts after that end plus 0.4 s for a busy head answered before the press is 10 s
// old, otherwise R2's wait by attempt number. Attempts never overlap (one copy the page waits on).
// A virtual clock drives timers, so each scenario runs in microseconds.

function modelSchedule(plan) {
  const r2 = [400, 1000, 2000];
  const out = [];
  let start = 0;
  for (let k = 0; k < plan.length; k += 1) {
    const step = plan[k];
    const end = step.kind === 'hang' ? start + 8000 : start + step.after;
    out.push({ start, end });
    if (step.kind === 'land' || step.kind === 'refuse') break;
    const wait = step.kind === 'busy' && end < 10_000 ? 400 : (r2[k] ?? 4000);
    start = end + wait;
  }
  return out;
}

async function runHeld(plan) {
  let t = 0;
  const due = [];
  const at = (ms, fn) => {
    const e = { when: t + ms, fn, live: true };
    due.push(e);
    return () => { e.live = false; };
  };
  const seen = [];
  const sending = sendWithResend(
    () => {
      const k = seen.length;
      const step = plan[k] ?? { kind: 'land', after: 10 };
      const entry = { start: t, end: null };
      seen.push(entry);
      return new Promise((resolve, reject) => {
        if (step.kind === 'hang') return;
        at(step.after, () => {
          if (entry.end !== null) return;
          entry.end = t;
          if (step.kind === 'land') resolve();
          else if (step.kind === 'refuse') reject(new Error('refused'));
          else if (step.kind === 'busy') reject(failed.headBusyError());
          else reject(unansweredError());
        });
      });
    },
    {
      deadline: 0,
      stillNewest: () => true,
      held: true,
      now: () => t,
      timer: (ms, fire) => at(ms, () => {
        const open = seen.find((e) => e.end === null);
        if (open && ms === failed.HELD_ATTEMPT_MS) open.end = t;
        fire();
      }),
    },
  ).catch(() => {});
  let settled = false;
  void sending.then(() => { settled = true; });
  for (let guard = 0; guard < 10_000 && !settled; guard += 1) {
    await new Promise((r) => setImmediate(r));
    const live = due.filter((e) => e.live).sort((a, b) => a.when - b.when);
    if (live.length === 0) continue;
    const next = live[0];
    next.live = false;
    t = next.when;
    next.fn();
  }
  await sending;
  return seen;
}

test('R2a (#2671): the held schedule matches the reference model, one copy at a time', async () => {
  let seed = 2671;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const kinds = ['busy', 'busy', 'busy', 'hang', 'lost'];
  for (let scenario = 0; scenario < 300; scenario += 1) {
    const n = 1 + Math.floor(rand() * 10);
    const plan = Array.from({ length: n }, () => {
      const kind = kinds[Math.floor(rand() * kinds.length)];
      return { kind, after: kind === 'busy' ? 1000 + Math.floor(rand() * 400) : Math.floor(rand() * 3000) };
    });
    plan.push({ kind: rand() < 0.8 ? 'land' : 'refuse', after: Math.floor(rand() * 500) });
    const got = await runHeld(plan);
    const want = modelSchedule(plan);
    assert.deepEqual(got.map((a) => [a.start, a.end]), want.map((a) => [a.start, a.end]), `scenario ${scenario}: ${JSON.stringify(plan)}`);
    for (let k = 1; k < got.length; k += 1) assert.ok(got[k].start >= got[k - 1].end, `scenario ${scenario}: two copies out at once`);
  }
});
