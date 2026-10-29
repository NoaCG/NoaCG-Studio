// gate: build
// guards: scripts/verification-lookup.mjs
// measures: none - exact evidence protocol, no live verification
import assert from 'node:assert/strict';
import test from 'node:test';
import { lookupVerification, offlineEnforcement, requestIdentity, VERIFICATION_MODE } from './verification-lookup.mjs';

const NOW = Date.parse('2026-10-19T12:00:00Z');
const sha = (c) => c.repeat(40), hash = (c) => c.repeat(64);
const request = () => ({ version: 1, repository: 'NoaCG/fixture', testedRevision: sha('a'),
  workflow: { path: '.github/workflows/ci.yml', revision: sha('b'), configurationSha256: hash('c') },
  inputs: { diff_base: '', require_review: false }, defaultsSha256: hash('d'),
  selection: ['project:a.spec.ts:test-1', 'project:b.spec.ts:test-2'], environment: { os: 'ubuntu-24.04', browser: 'chromium-123' },
  purpose: 'PR acceptance', freshness: { maxAgeMs: 3_600_000 }, requiredReports: ['complete-report'] });
const record = () => ({ runId: 42, attempt: 2, evidenceAttempt: 2, identity: request(), status: 'completed', conclusion: 'success',
  trust: 'provider-read-back', delivery: 'accepted', url: 'https://github.com/NoaCG/fixture/actions/runs/42',
  evidenceUrl: 'https://github.com/NoaCG/fixture/actions/runs/42/artifacts/1', completedAt: new Date(NOW - 1000).toISOString(), complete: true,
  reports: [{ name: 'complete-report', attempt: 2, complete: true, expired: false, sha256: hash('e'), url: 'https://github.com/NoaCG/fixture/actions/runs/42/artifacts/2' }],
  jobs: [{ name: 'Required tests', status: 'completed', conclusion: 'success' }] });
const lookup = (records, wanted = request(), extra = {}) => lookupVerification(wanted, { records, complete: true, ...extra }, NOW);

test('exact trusted evidence returns structured observation with original links and stable identity', () => {
  const result = lookup([record()]);
  assert.equal(VERIFICATION_MODE, 'observe'); assert.equal(result.mode, 'observe');
  assert.equal(result.decision, 'REUSE'); assert.equal(result.advisory, 'would REUSE');
  assert.equal(result.requestId, requestIdentity(request()));
  assert.equal(requestIdentity(request()), requestIdentity(Object.fromEntries(Object.entries(request()).reverse())));
  assert.equal(result.original.runId, 42); assert.equal(result.original.attempt, 2);
  assert.ok(result.links.includes(record().url)); assert.equal(result.history.length, 1);
});

test('same head cannot substitute merge revision, configuration, inputs, defaults, selection, environment or purpose', () => {
  const changes = [
    { repository: 'NoaCG/another' }, { testedRevision: sha('f') },
    { workflow: { ...request().workflow, revision: sha('f') } },
    { workflow: { ...request().workflow, configurationSha256: hash('f') } },
    { inputs: { ...request().inputs, require_review: true } }, { defaultsSha256: hash('f') },
    { selection: ['project:a.spec.ts:test-1'] }, { selection: [...request().selection, 'nominally-broader'] },
    { environment: { os: 'windows' } }, { purpose: 'merge-group acceptance' },
  ];
  for (const change of changes) assert.equal(lookup([{ ...record(), identity: { ...request(), ...change } }]).decision, 'RUN', JSON.stringify(change));
  // An actual merge commit may satisfy its own request even when the provider's nominal head differs.
  const merge = { ...request(), testedRevision: sha('f') };
  assert.equal(lookup([{ ...record(), headSha: sha('a'), identity: merge }], merge).decision, 'REUSE');
});

test('pending/running equivalent requests WAIT; later attempts supersede earlier completion', () => {
  for (const status of ['queued', 'in_progress', 'waiting', 'pending', 'requested']) {
    assert.equal(lookup([{ ...record(), status, conclusion: null, complete: false, reports: [] }]).decision, 'WAIT');
  }
  const later = { ...record(), attempt: 3, evidenceAttempt: 3, status: 'in_progress', conclusion: null };
  assert.equal(lookup([record(), later]).decision, 'WAIT');
  assert.equal(lookup([record(), { ...later, status: 'completed', conclusion: 'failure' }]).decision, 'RUN');
  assert.equal(lookup([record(), { ...later, attempt: undefined }]).decision, 'UNRESOLVED');
});

test('missing reports, incomplete jobs, provenance and uncertain attempts never become passing evidence', () => {
  const changes = [{ trust: 'local-record-only' }, { evidenceAttempt: 1 }, { evidenceUrl: null }, { complete: false },
    { completedAt: 'unknown' }, { completedAt: new Date(NOW + 1).toISOString() }, { reports: [] },
    { reports: [{ ...record().reports[0], attempt: 1 }] }, { reports: [{ ...record().reports[0], expired: true }] },
    { reports: [{ ...record().reports[0], complete: false }] }, { reports: [{ ...record().reports[0], sha256: null }] },
    { jobs: [] }, { jobs: [{ status: 'completed', conclusion: 'skipped' }] }, { jobs: [{ status: 'completed', conclusion: 'failure' }] },
    { identity: undefined }, { delivery: 'unknown' }, { attempt: undefined }];
  for (const change of changes) assert.equal(lookup([{ ...record(), ...change }]).decision, 'UNRESOLVED', JSON.stringify(change));
  for (const conclusion of ['failure', 'cancelled', 'skipped', 'timed_out', 'neutral']) {
    const result = lookup([{ ...record(), conclusion }]);
    assert.equal(result.decision, 'RUN'); assert.equal(result.history[0].conclusion, conclusion);
  }
  assert.equal(lookup([{ ...record(), conclusion: null }]).decision, 'UNRESOLVED');
  const failed = { ...record(), runId: 43, conclusion: 'failure' };
  assert.equal(lookup([record(), failed]).decision, 'RUN');
});

test('freshness is independently evaluated; no old result or unknown lookup proves absence', () => {
  assert.equal(lookup([{ ...record(), completedAt: new Date(NOW - 3_600_001).toISOString() }]).decision, 'RUN');
  assert.equal(lookup([record()], { ...request(), freshness: { maxAgeMs: 500 } }).decision, 'RUN');
  assert.equal(lookup([record()], { ...request(), freshness: { maxAgeMs: 3_600_000, since: new Date(NOW).toISOString() } }).decision, 'RUN');
  assert.equal(lookup([]).decision, 'RUN');
  assert.equal(lookup([], request(), { complete: false }).decision, 'UNRESOLVED');
  assert.equal(lookup([], request(), { errors: ['read denied'] }).decision, 'UNRESOLVED');
  for (const change of [{ selection: null }, { environment: null }, { freshness: null }, { defaultsSha256: null }, { requiredReports: [] }, { testedRevision: null }]) {
    assert.equal(lookup([record()], { ...request(), ...change }).decision, 'UNRESOLVED');
  }
});

test('persisted uncertain dispatch intent is reconciled before evidence can authorize reuse or replay', () => {
  const intent = { id: 'original-intent', requestId: requestIdentity(request()), state: 'unknown' };
  for (const patch of [{}, { state: 'accepted' }, { state: 'not-delivered-final' }]) {
    assert.equal(lookup([record()], request(), { intents: [{ ...intent, ...patch }] }).decision, 'UNRESOLVED');
  }
  assert.equal(lookup([record()], request(), { intents: [{ ...intent, state: 'accepted', runId: 42, evidence: 'exact provider receipt' }] }).decision, 'REUSE');
  const stricter = { ...request(), freshness: { maxAgeMs: 500 } };
  assert.equal(lookup([], stricter, { intents: [{ ...intent, identity: request() }] }).decision, 'UNRESOLVED');
  assert.equal(lookup([], request(), { intents: [{ ...intent, requestId: 'different', identity: { ...request(), purpose: 'unrelated acceptance' } }] }).decision, 'RUN');
});

test('offline enforcement requires explicit activation, authoritative acceptance and existing repair policy', () => {
  const decision = lookup([]);
  const activation = { experimentOwner: 'owner', measurementCompleteEvidence: 'explicit owner receipt' };
  const owner = { mode: 'single-authoritative', acceptanceFenced: true, evidence: 'controlled acceptance fixture only' };
  assert.equal(offlineEnforcement(decision).action, 'OBSERVE');
  assert.equal(offlineEnforcement(decision, { activation, owner: { mode: 'local-lock' } }).action, 'UNRESOLVED');
  assert.equal(offlineEnforcement(decision, { activation, owner }).action, 'UNRESOLVED');
  assert.equal(offlineEnforcement(decision, { activation, owner, policyAllowsRun: true }).action, 'RUN');
  const intent = { id: 'dispatch:1', requestId: decision.requestId };
  const options = { activation, owner, intent, policyAllowsRun: true };
  assert.equal(offlineEnforcement(decision, options).action, 'UNRESOLVED');
  assert.equal(offlineEnforcement(decision, { ...options, reconciliation: { intentId: intent.id, requestId: 'different', evidence: 'wrong' } }).action, 'UNRESOLVED');
  const accepted = { intentId: intent.id, requestId: intent.requestId, state: 'accepted', runUrl: record().url, evidence: 'accepted then ack lost' };
  assert.deepEqual(offlineEnforcement(decision, { ...options, reconciliation: accepted }), { action: 'WAIT', original: record().url });
  assert.equal(offlineEnforcement(decision, { ...options, intent: { ...intent, state: 'accepted', runUrl: 'original-run' }, reconciliation: accepted }).action, 'UNRESOLVED');
  for (const patch of [{}, { authoritative: true }]) {
    assert.equal(offlineEnforcement(decision, { ...options, reconciliation: { ...accepted, state: 'not-delivered', ...patch } }).action, 'UNRESOLVED');
  }
  assert.equal(offlineEnforcement(decision, { ...options, reconciliation: { ...accepted, state: 'not-delivered', authoritative: true, final: true } }).action, 'RUN');
  assert.equal(VERIFICATION_MODE, 'observe'); // The offline model cannot activate live code.
});
