// gate: build
// guards: scripts/native-recovery-context.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { measureRecovery } from './native-recovery-context.mjs';

const manifest = { provider: 'claude', sessionId: 'owner', identityEvidence: 'native exact-id receipt', since: '2026-10-17T09:00:00Z', until: '2026-10-17T10:00:00Z', packetBytes: 612, retrievedBytes: null };
const line = (row) => JSON.stringify(row);
const claude = (id, at = manifest.since) => line({ type: 'assistant', timestamp: at, sessionId: 'owner', requestId: `request-${id}`, message: { id, usage: { input_tokens: 10, cache_creation_input_tokens: 20, cache_read_input_tokens: 100, output_tokens: 5 } } });

test('Claude recovery windows deduplicate copied requests across files without printing content', () => {
  const a = claude('a'), b = claude('b');
  const result = measureRecovery(manifest, [a, `${a}\n${b}\n${claude('old', '2026-10-16T10:00:00Z')}`]);
  assert.equal(result.usageStatus, 'observed');
  assert.deepEqual([result.usage.records, result.usage.firstRequestInput, result.usage.uncachedInput, result.usage.cacheWrite, result.usage.cacheRead, result.usage.output], [2, 130, 20, 40, 200, 10]);
  assert.equal(result.planningTurns, null);
});

const codex = (samples, id = 'owner') => [line({ type: 'session_meta', payload: { id } }), ...samples.map(([timestamp, input, cached, output, last = 50]) => line({ timestamp, payload: { type: 'token_count', info: { total_token_usage: { input_tokens: input, cached_input_tokens: cached, output_tokens: output }, last_token_usage: { input_tokens: last } } } }))].join('\n');
const sample = () => codex([['2026-10-17T08:59:00Z', 100, 50, 10], [manifest.since, 150, 80, 15], ['2026-10-17T09:01:00Z', 210, 120, 18]]);

test('Codex counts cumulative deltas across copied files, not repeated last-token records', () => {
  const result = measureRecovery({ ...manifest, provider: 'codex' }, [sample(), sample()]);
  assert.deepEqual([result.usage.records, result.usage.firstRequestInput, result.usage.uncachedInput, result.usage.cacheRead, result.usage.cacheWrite, result.usage.output], [2, 50, 40, 70, null, 8]);
});

test('missing counters are unavailable, malformed logs are incomplete, and metrics cannot invent planning turns', () => {
  const result = measureRecovery(manifest, []);
  assert.equal(result.usageStatus, 'unavailable');
  assert.equal(result.usage, null);
  assert.equal(result.planningTurns, null);
  assert.equal(measureRecovery(manifest, [`${claude('a')}\n{"unfinished"`]).usageStatus, 'incomplete');
  assert.throws(() => measureRecovery({ ...manifest, packetBytes: -1 }, []));
  assert.throws(() => measureRecovery({ ...manifest, planningTurns: 'none' }, []));
  const partial = JSON.parse(claude('a')); delete partial.message.usage.cache_read_input_tokens;
  assert.throws(() => measureRecovery(manifest, [line(partial)]));
});

test('Codex refuses a mismatched session, missing baseline or cumulative reset', () => {
  const m = { ...manifest, provider: 'codex' };
  assert.throws(() => measureRecovery(m, [codex([], 'another')]));
  assert.throws(() => measureRecovery(m, [codex([[manifest.since, 100, 10, 1]])]));
  assert.throws(() => measureRecovery(m, [codex([['2026-10-17T08:59:00Z', 100, 10, 10], [manifest.since, 90, 8, 9]])]));
});

test('Claude refuses inherited-ID subagents, other owners and conflicting request copies', () => {
  const row = JSON.parse(claude('a'));
  assert.throws(() => measureRecovery(manifest, [line({ ...row, isSidechain: true })]));
  assert.throws(() => measureRecovery(manifest, [line({ ...row, sessionId: 'another' })]));
  const copy = structuredClone(row); copy.message.usage.output_tokens += 1;
  assert.throws(() => measureRecovery(manifest, [line(row), line(copy)]));
});

test('a missing first-request size stays unknown even when a later Codex request has it', () => {
  const text = codex([['2026-10-17T08:59:00Z', 100, 50, 10], [manifest.since, 150, 80, 15, null], ['2026-10-17T09:01:00Z', 210, 120, 18]]);
  assert.equal(measureRecovery({ ...manifest, provider: 'codex' }, [text]).usage.firstRequestInput, null);
});

test('invalid Codex counter rows cannot disappear behind earlier valid in-window totals', () => {
  const m = { ...manifest, provider: 'codex' };
  const valid = sample();
  const row = { timestamp: '2026-10-17T09:02:00Z', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 240, cached_input_tokens: 140, output_tokens: 20 } } } };
  for (const patch of [{ input_tokens: -1 }, { cached_input_tokens: undefined }, { cached_input_tokens: 241 }]) {
    const invalid = structuredClone(row); Object.assign(invalid.payload.info.total_token_usage, patch);
    assert.throws(() => measureRecovery(m, [`${valid}\n${line(invalid)}`]));
  }
  const missing = structuredClone(row); delete missing.payload.info.total_token_usage;
  assert.throws(() => measureRecovery(m, [`${valid}\n${line(missing)}`]));
  // Native rate-limit-only heartbeats have no usage info and remain valid observations.
  const heartbeat = line({ timestamp: row.timestamp, payload: { type: 'token_count', info: null } });
  assert.equal(measureRecovery(m, [`${valid}\n${heartbeat}`]).usage.records, 2);
});
