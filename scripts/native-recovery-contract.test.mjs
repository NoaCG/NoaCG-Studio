// gate: build
// guards: scripts/native-recovery-contract.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectNative, policyFingerprint, rearmNative, reconcileNative, wakeHealth } from './native-recovery-contract.mjs';

const now = Date.parse('2026-10-17T09:40:00Z');
const policy = { approval: 'on-request', sandbox: 'workspace-write', network: 'restricted', writableRoots: ['/workspace/owned'] };
const target = { provider: 'claude-cloud', sessionId: 'native-session', environmentId: 'native-environment', revision: 'a'.repeat(40), policySha256: policyFingerprint(policy) };
const observed = () => ({ ...target, state: 'running', observedAt: new Date(now).toISOString(), evidence: 'native get_session read-back' });
const intent = { ...target, actionId: 'run:1', requestSha256: 'b'.repeat(64) };
const receipt = () => ({ ...intent, state: 'accepted', nativeId: 'native-submission', evidence: 'native exact-id read-back' });
const wake = () => ({
  authorization: { source: 'test owner', scope: 'prepared phase', permissionPolicy: 'original policy', policySha256: target.policySha256, startedAt: '2026-10-17T09:00:00Z', deadline: '2026-10-17T11:00:00Z' },
  target,
  previous: { ...target, state: 'fired', actionId: 'wake:1', nativeId: 'trigger-1', firedAt: '2026-10-17T09:35:00Z', evidence: 'native fire plus executing turn' },
  next: { ...target, actionId: 'wake:2', previousNativeId: 'trigger-1', deadline: '2026-10-17T11:00:00Z', dueAt: '2026-10-17T10:26:00Z' },
});

test('policy fingerprints are independent of object key order and detect permission expansion', () => {
  assert.equal(policyFingerprint(policy), policyFingerprint(Object.fromEntries(Object.entries(policy).reverse())));
  for (const patch of [{ approval: 'never' }, { sandbox: 'unrestricted' }, { network: 'unrestricted' }, { writableRoots: ['/'] }]) {
    assert.notEqual(policyFingerprint(policy), policyFingerprint({ ...policy, ...patch }));
  }
  assert.throws(() => policyFingerprint({ sandbox: 'workspace-write' }));
});

test('native inspection binds exact identity, revision and actual permission evidence', () => {
  assert.deepEqual(inspectNative(target, observed(), now), { state: 'running', workerId: target.sessionId });
  for (const key of Object.keys(target)) {
    assert.equal(inspectNative(target, { ...observed(), [key]: 'different' }, now).state, 'unknown');
  }
  for (const patch of [{ observedAt: new Date(now - 30_001).toISOString() }, { observedAt: new Date(now + 1).toISOString() }, { evidence: '' }]) {
    assert.equal(inspectNative(target, { ...observed(), ...patch }, now).state, 'unknown');
  }
});

test('idle with a pending or unknown turn cannot authorize another worker; explicit waits survive', () => {
  for (const pendingTurn of [undefined, true]) assert.equal(inspectNative(target, { ...observed(), state: 'idle', pendingTurn }, now).state, 'unknown');
  assert.equal(inspectNative(target, { ...observed(), state: 'idle', pendingTurn: false }, now).state, 'gone');
  const wait = { kind: 'permission', reason: 'awaiting native approval', until: null };
  assert.deepEqual(inspectNative(target, { ...observed(), state: 'waiting', wait }, now), { state: 'waiting', wait });
  assert.equal(inspectNative(target, { ...observed(), state: 'waiting', wait: { ...wait, until: 'invalid' } }, now).state, 'unknown');
});

test('uncertain submissions remain parked; only exact identity or authoritative final non-delivery resolves them', () => {
  for (const observation of [null, { state: 'absent', tasks: [] }, { ...receipt(), requestSha256: 'wrong' }, { ...receipt(), actionId: 'wrong' }, { ...receipt(), nativeId: '' }]) {
    assert.equal(reconcileNative(intent, observation).state, 'unknown');
  }
  assert.deepEqual(reconcileNative(intent, receipt()), { state: 'delivered', workerId: 'native-submission' });
  assert.equal(reconcileNative({ ...intent, nativeId: 'original' }, receipt()).state, 'unknown');
  const absent = { ...intent, state: 'not-delivered', authoritative: true, final: true, evidence: 'provider rejection before acceptance' };
  assert.equal(reconcileNative(intent, absent).state, 'not-delivered');
  for (const patch of [{ authoritative: false }, { final: false }, { evidence: '' }]) assert.equal(reconcileNative(intent, { ...absent, ...patch }).state, 'unknown');
  assert.equal(reconcileNative({ ...intent, nativeId: 'already-accepted' }, absent).state, 'unknown');
});

test('submission reconciliation requires the original native binding, even for final rejection', () => {
  const absent = { ...intent, state: 'not-delivered', authoritative: true, final: true, evidence: 'provider rejection' };
  for (const key of Object.keys(target)) {
    for (const value of [undefined, 'another']) {
      assert.equal(reconcileNative(intent, { ...receipt(), [key]: value }).state, 'unknown');
      assert.equal(reconcileNative(intent, { ...absent, [key]: value }).state, 'unknown');
    }
    assert.equal(reconcileNative({ ...intent, [key]: undefined }, receipt()).state, 'unknown');
  }
  assert.equal(reconcileNative(intent, { ...absent, nativeId: 'accepted-task' }).state, 'unknown');
});

test('exact cadence uses executor arrival and rejects rounding or update-relative drift', () => {
  const record = wake();
  record.authorization.cadenceMs = 3_600_000;
  record.previous.arrivedAt = '2026-10-17T09:35:08.797Z';
  record.next.dueAt = '2026-10-17T10:35:08.797Z';
  assert.equal(rearmNative(record, now).state, 'eligible');
  for (const dueAt of ['2026-10-17T10:35:09Z', '2026-10-17T10:35:00Z', '2026-10-17T10:40:00Z']) {
    assert.equal(rearmNative({ ...record, next: { ...record.next, dueAt } }, now).state, 'unknown');
  }
  for (const arrivedAt of [undefined, 'invalid', '2026-10-17T08:59:00Z', '2026-10-17T09:40:01Z']) {
    assert.equal(rearmNative({ ...record, previous: { ...record.previous, arrivedAt } }, now).state, 'unknown');
  }
  for (const cadenceMs of [null, 0, -1, 0.5, NaN, Infinity]) {
    assert.equal(rearmNative({ ...record, authorization: { ...record.authorization, cadenceMs } }, now).state, 'unknown');
  }
});

test('re-arm preserves the owner, actual permissions and absolute window', () => {
  assert.equal(rearmNative(wake(), now).state, 'eligible');
  const expanded = wake(); expanded.authorization.policySha256 = 'another';
  assert.equal(rearmNative(expanded, now).state, 'unknown');
  for (const location of ['previous', 'next']) for (const key of ['provider', 'sessionId', 'environmentId', 'policySha256']) {
    const record = wake(); record[location][key] = 'another';
    assert.equal(rearmNative(record, now).state, 'unknown');
  }
  for (const patch of [{ state: 'accepted' }, { nativeId: '' }, { evidence: '' }, { firedAt: 'invalid' }]) {
    const record = wake(); Object.assign(record.previous, patch);
    assert.equal(rearmNative(record, now).state, 'unknown');
  }
  for (const patch of [{ deadline: '2026-10-18T11:00:00Z' }, { dueAt: wake().authorization.deadline }, { dueAt: new Date(now).toISOString() }, { previousNativeId: 'wrong' }, { actionId: 'wake:1' }]) {
    const record = wake(); Object.assign(record.next, patch);
    assert.equal(rearmNative(record, now).state, 'unknown');
  }
});

test('terminal/expired windows stop, waits suppress re-arm and restart grants no renewal', () => {
  assert.equal(rearmNative({ ...wake(), terminal: true }, now).state, 'stop');
  assert.equal(rearmNative(wake(), Date.parse(wake().authorization.deadline)).state, 'stop');
  assert.equal(rearmNative({ ...wake(), wait: { kind: 'permission' } }, now).state, 'waiting');
  const record = wake(); record.authorization.deadline = '2026-10-18T11:00:00Z';
  assert.equal(rearmNative(record, now).state, 'unknown');
});

test('a dead wake chain is visible without automatically granting a second owner', () => {
  const health = { dueAt: '2026-10-17T09:35:00Z', deadline: wake().authorization.deadline };
  assert.equal(wakeHealth(health, now).state, 'unknown');
  assert.equal(wakeHealth({ ...health, firedAt: health.dueAt }, now).state, 'unknown');
  assert.equal(wakeHealth({ ...health, firedAt: health.dueAt, nextNativeId: 'confirmed-next' }, now).state, 'rearmed');
  assert.equal(wakeHealth({ ...health, dueAt: new Date(now + 60_000).toISOString() }, now).state, 'pending');
  assert.equal(wakeHealth({ ...health, terminal: true }, now).state, 'stop');
});

test('a wake at or beyond the fixed deadline is invalid before the window expires', () => {
  for (const dueAt of ['2026-10-17T11:00:00Z', '2026-10-17T11:30:00Z']) {
    assert.equal(wakeHealth({ dueAt, deadline: '2026-10-17T11:00:00Z' }, now).state, 'unknown');
  }
});
