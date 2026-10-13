import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkConnectorSendRateLimit, hitRateLimit, type RateLimitCaps } from './rateLimit.js';

// The gates share ONE bucket map on globalThis, and their windows differ (5 s ingest, 60 s
// per-IP, 3600 s feedback). The sweep must therefore compare bucket AGES in milliseconds -
// window indices are incommensurable across gates, and an index-compared sweep wiped every
// other gate's live counters the moment a short-window gate crossed the map-size threshold.

const MINUTE: RateLimitCaps = { windowMs: 60_000, max: 5 };
const FIVE_SEC: RateLimitCaps = { windowMs: 5_000, max: 25 };

test('a short-window gate\'s sweep never wipes a long-window gate\'s live counter', () => {
  const now = 1_000_000_000_000;
  // A minute-gate client spends its whole budget - it must stay refused.
  for (let i = 0; i < MINUTE.max; i += 1) hitRateLimit('sweep-victim', MINUTE, now);
  assert.equal(hitRateLimit('sweep-victim', MINUTE, now).allowed, false);
  // Push the shared map past the sweep threshold from the 5 s gate (the flood case the
  // gates exist for), in the same instant.
  for (let i = 0; i < 5_100; i += 1) hitRateLimit(`sweep-noise-${i}`, FIVE_SEC, now);
  // The minute bucket is mid-window and must have survived the sweep: still refused.
  assert.equal(hitRateLimit('sweep-victim', MINUTE, now + 1_000).allowed, false);
});

test('a genuinely dead bucket is swept by its own gate\'s age, freeing the memory', () => {
  const now = 2_000_000_000_000;
  hitRateLimit('sweep-dead', FIVE_SEC, now);
  // Two of the 5 s gate's own windows later, a sweep triggered by fresh keys removes it;
  // the client then starts a clean window and is allowed again.
  const later = now + 3 * FIVE_SEC.windowMs;
  for (let i = 0; i < 5_100; i += 1) hitRateLimit(`sweep-noise2-${i}`, FIVE_SEC, later);
  assert.equal(hitRateLimit('sweep-dead', FIVE_SEC, later).allowed, true);
});

// The connector's send budget (docs/REMOTE_MCP_PLAN.md phase 5): "10 a minute" means exactly 10 in
// any minute. On the two-window estimate a call made 61 s earlier still cost most of a slot, so a
// send, a minute's wait and a burst let only 9 through (the phase 4 check's finding).

test('the send budget: exactly ten in a minute, and a call over a minute old no longer counts', () => {
  const t0 = 3_000_000_005_000; // 5 s into a minute, where the estimate charged the old call most
  assert.equal(checkConnectorSendRateLimit('budget-a', t0), null);
  const burst = Array.from({ length: 11 }, (_, i) => checkConnectorSendRateLimit('budget-a', t0 + 61_000 + i));
  assert.equal(burst.filter((d) => d === null).length, 10, 'ten in the minute after the first call aged out');
  assert.ok(burst[10] && burst[10].retryAfterSec >= 1 && burst[10].retryAfterSec <= 60, 'the eleventh waits, at most a minute');
  for (let i = 0; i < 10; i += 1) assert.equal(checkConnectorSendRateLimit('budget-b', t0 + i * 1_000), null, `call ${i + 1} of a fresh user`);
  assert.notEqual(checkConnectorSendRateLimit('budget-b', t0 + 59_000), null, 'the eleventh inside the minute is refused');
});

test('the send budget counts a refused call, so a loop stays refused until it stops for a minute', () => {
  const t0 = 4_000_000_000_000;
  for (let i = 0; i < 10; i += 1) checkConnectorSendRateLimit('budget-loop', t0);
  for (let s = 1; s <= 120; s += 1) assert.notEqual(checkConnectorSendRateLimit('budget-loop', t0 + s * 1_000), null, `still looping at ${s} s`);
  assert.equal(checkConnectorSendRateLimit('budget-loop', t0 + 180_000), null, 'a minute after the loop stopped');
});
