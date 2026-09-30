// guards: src/control/presenceGate.ts, src/control/livePath.ts
//
// THE PAGE'S PRESENCE BUDGET (src/control/presenceGate.ts). Supabase Realtime closes a client that
// makes more than 5 Presence calls in 30 s ("Client presence rate limit exceeded"), and Step 1's
// output re-announced every 5 s, so the live channel was closed 25 to 27 s after every join on the
// preview branches. These run the gate in Node with the clock faked, and check that nothing in the
// app calls Presence around it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const { PRESENCE_CALL_INTERVAL_MS, createPresenceGate } = await import('../src/control/presenceGate.ts');

/** A gate on a fake clock. `advance` moves the clock and fires the timers that fall due, in order. */
function rig() {
  let clock = 1_000_000;
  let timers = [];
  const calls = [];
  const gate = createPresenceGate({
    now: () => clock,
    setTimer: (run, ms) => {
      const timer = { at: clock + ms, run };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      timers = timers.filter((t) => t !== timer);
    },
  });
  const advance = (ms) => {
    const until = clock + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > until) break;
      timers.shift();
      clock = next.at;
      next.run();
    }
    clock = until;
  };
  /** Ask for a call that records the state it carries and the time it went out. */
  const request = (key, state) =>
    gate.request(key, () => {
      calls.push({ at: clock, key, state });
      return true;
    });
  return { gate, calls, advance, request, now: () => clock };
}

/** The most calls in any half-open 30 s window. */
function mostIn30s(calls) {
  let most = 0;
  for (const first of calls) most = Math.max(most, calls.filter((c) => c.at >= first.at && c.at < first.at + 30_000).length);
  return most;
}

test('a burst of state changes costs at most three Presence calls in any 30 s', () => {
  const { calls, advance, request } = rig();
  // An output under a busy show: its counters change ten times a second for two minutes.
  for (let i = 0; i < 1200; i += 1) {
    request('output', i);
    advance(100);
  }
  advance(PRESENCE_CALL_INTERVAL_MS);
  assert.ok(mostIn30s(calls) <= 3, `${mostIn30s(calls)} calls in one 30 s window`);
  // Realtime's own limit, with room to spare.
  assert.ok(mostIn30s(calls) < 5);
  // Coalesced to the LATEST state: the last call carries the last change.
  assert.equal(calls.at(-1).state, 1199);
});

test('the first announce goes out at once, and a change after a quiet interval does too', () => {
  const { calls, advance, request, now } = rig();
  const joinedAt = now();
  request('output', 'joined');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].at, joinedAt);
  advance(60_000);
  request('output', 'a later change');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].at, joinedAt + 60_000);
});

test('a second change inside the interval waits for it, then goes out once with the newest state', () => {
  const { calls, advance, request, now } = rig();
  const t0 = now();
  request('operator', 'first');
  request('operator', 'second');
  request('operator', 'third');
  assert.equal(calls.length, 1);
  advance(PRESENCE_CALL_INTERVAL_MS);
  assert.deepEqual(
    calls.map((c) => [c.at - t0, c.state]),
    [
      [0, 'first'],
      [PRESENCE_CALL_INTERVAL_MS, 'third'],
    ],
  );
});

test('the budget is the page\'s: a second channel on the same page waits its turn', () => {
  const { calls, advance, request } = rig();
  request('production A', 1);
  request('production B', 1);
  advance(PRESENCE_CALL_INTERVAL_MS);
  assert.deepEqual(
    calls.map((c) => c.key),
    ['production A', 'production B'],
  );
  assert.equal(calls[1].at - calls[0].at, PRESENCE_CALL_INTERVAL_MS);
});

test('a request with nothing to send spends no budget, and a cancelled one is never made', () => {
  const { gate, calls, advance, request } = rig();
  gate.request('output', () => false);
  request('output', 'real');
  assert.equal(calls.length, 1, 'the empty request did not hold the real one back');
  request('closing', 'never');
  gate.cancel('closing');
  advance(PRESENCE_CALL_INTERVAL_MS * 3);
  assert.deepEqual(
    calls.map((c) => c.state),
    ['real'],
  );
});

test('nothing in the app calls Presence around the gate', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name)) {
        const text = readFileSync(path, 'utf8');
        const hits = text.match(/\.(untrack|track)\(/g) ?? [];
        if (hits.length > 0) offenders.push([path.replace(/\\/g, '/'), hits.length]);
      }
    }
  };
  walk(new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  // The one Presence call is livePath.ts's `track`, which only the page gate runs.
  assert.deepEqual(offenders.map(([path, n]) => [path.slice(path.indexOf('src/')), n]), [['src/control/livePath.ts', 1]]);
  const livePath = readFileSync(new URL('../src/control/livePath.ts', import.meta.url), 'utf8');
  assert.match(livePath, /pagePresenceGate\.request\(gateKey, track\)/);
});
