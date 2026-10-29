// gate: build
// guards: scripts/verification-dispatch.mjs, scripts/queue-pr.mjs, scripts/cloud-queue.mjs, scripts/jobs.mjs, .agent-workflows/verify.md, .agent-workflows/queue-merge.md
// measures: none - controlled dispatch/evidence adapters, no live Actions
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import JSZip from 'jszip';
import { ciInputs, dispatchRecovery, main, observeVerification } from './verification-dispatch.mjs';
import { requestIdentity } from './verification-lookup.mjs';
import { queuePullRequest } from './queue-pr.mjs';
import { reviveReviewed, RUN_POLL_MS } from './cloud-queue.mjs';

const NOW = Date.parse('2026-10-19T12:00:00Z'), SHA = 'a'.repeat(40);
const source = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const request = () => ({ version: 1, repository: 'NoaCG/fixture', testedRevision: SHA,
  workflow: { path: '.github/workflows/ci.yml', revision: SHA, configurationSha256: sha256(source) },
  ...ciInputs(source), selection: ['test-project:a.spec.ts:test'], environment: { os: 'ubuntu-24.04', browser: 'fixture-browser' },
  purpose: 'CI verification', freshness: { maxAgeMs: 3_600_000 }, requiredReports: ['complete-report'] });
const run = () => ({ id: 42, head_sha: SHA, run_attempt: 2, status: 'completed', conclusion: 'success', path: '.github/workflows/ci.yml',
  html_url: 'https://github.com/NoaCG/fixture/actions/runs/42', updated_at: new Date(NOW - 1000).toISOString(), run_started_at: new Date(NOW - 60_000).toISOString() });
const evidence = () => ({ identity: request(), evidenceAttempt: 2, trust: 'provider-read-back', complete: true,
  evidenceUrl: `${run().html_url}/artifacts/77`, jobs: [{ status: 'completed', conclusion: 'success' }],
  reports: [{ name: 'complete-report', attempt: 2, complete: true, expired: false, sha256: 'b'.repeat(64), url: `${run().html_url}/artifacts/78` }] });
function reads({ rows = [run()], total = rows.length, revision = SHA, definition = source, extra } = {}) {
  const calls = [];
  const gh = (args, options) => {
    calls.push({ args, options });
    const endpoint = args[1];
    let value;
    if (endpoint === 'repos/{owner}/{repo}' || endpoint === 'repos/NoaCG/fixture') value = { full_name: 'NoaCG/fixture' };
    else if (endpoint?.includes('/actions/runs?')) value = { total_count: total, workflow_runs: rows };
    else if (endpoint?.includes('/commits/')) value = { sha: revision };
    else if (endpoint?.includes('/contents/')) value = { encoding: 'base64', content: Buffer.from(definition).toString('base64') };
    else if (extra) return extra(args, options);
    else return { status: 1, out: '', err: 'fixture denied' };
    return { status: 0, out: JSON.stringify(value), err: '' };
  };
  return { gh, calls };
}

test('observer reads existing job/admission and provider records but does not infer missing selection', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'verification-observation-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(path.join(dir, 'j-0001.json'), JSON.stringify({ id: 'j-0001', state: 'done', verification: { source: SHA, kind: 'broader', runUrl: run().html_url } }));
  const f = reads(), lines = [];
  const result = observeVerification({ ref: 'feature', expectedRevision: SHA, gh: f.gh, now: () => NOW, dir, print: (line) => lines.push(line) });
  assert.equal(result.mode, 'observe'); assert.equal(result.decision, 'UNRESOLVED');
  assert.match(result.reason, /selection/); assert.equal(result.history.length, 2);
  assert.ok(result.links.includes(run().html_url)); assert.equal(lines.length, 1);
  assert.ok(f.calls.every((c) => c.args[0] === 'api'));
  assert.ok(f.calls.every((c) => c.options.timeout > 0 && c.options.timeout <= 3000));
});

test('resolved default inputs are bound to their actual schema; unknown/changed defaults refuse inference', () => {
  assert.deepEqual(ciInputs(source).inputs, { diff_base: '', require_review: false });
  assert.deepEqual(ciInputs(source, { require_review: 'true' }).inputs, { diff_base: '', require_review: true });
  assert.throws(() => ciInputs(source.replace('default: false', 'default: true')));
  assert.throws(() => ciInputs(source, { unexpected: 'x' }));
  assert.throws(() => ciInputs(source, { require_review: 'maybe' }));
});

test('full requirement yields proven REUSE/WAIT; mismatched ref/input/configuration cannot reuse', () => {
  const options = { ref: 'feature', request: request(), now: () => NOW, print() {}, dir: null, evidence: () => evidence() };
  assert.equal(observeVerification({ ...options, gh: reads().gh }).decision, 'REUSE');
  assert.equal(observeVerification({ ...options, gh: reads({ rows: [{ ...run(), status: 'in_progress', conclusion: null }] }).gh }).decision, 'WAIT');
  for (const patch of [{ inputs: { require_review: true } }, { gh: reads({ revision: 'c'.repeat(40) }).gh },
    { gh: reads({ definition: source + '\n# different configuration\n' }).gh }, { request: { ...request(), repository: 'Other/repo' } }, { inputsResolved: false }]) {
    assert.equal(observeVerification({ ...options, gh: reads().gh, ...patch }).decision, 'UNRESOLVED');
  }
});

test('actual exact-artifact read-back binds digest, run attempt, reports and completed jobs', async () => {
  const proof = { version: 1, runId: 42, attempt: 2, identity: request(), workflowRunHead: SHA, workflowPath: '.github/workflows/ci.yml',
    complete: true, requiredJobs: ['Required tests'], artifacts: [{ id: 78, name: 'complete-report', attempt: 2, complete: true }] };
  const zip = await new JSZip().file('verification-evidence.json', JSON.stringify(proof)).generateAsync({ type: 'nodebuffer' });
  const artifacts = [
    { id: 77, name: 'verification-evidence', expired: false, digest: `sha256:${sha256(zip)}`, workflow_run: { id: 42 } },
    { id: 78, name: 'complete-report', expired: false, digest: `sha256:${'b'.repeat(64)}`, created_at: new Date(NOW - 30_000).toISOString() },
  ];
  const gh = reads({ extra(args, options) {
    if (args[1].includes('/artifacts?')) return { status: 0, out: JSON.stringify({ total_count: 2, artifacts }) };
    if (args[1].endsWith('/77/zip')) { assert.equal(options.binary, true); return { status: 0, out: zip }; }
    if (args[1].includes('/attempts/2/jobs?')) return { status: 0, out: JSON.stringify({ total_count: 1, jobs: [{ name: 'Required tests', run_id: 42, status: 'completed', conclusion: 'success' }] }) };
    return { status: 1, out: '' };
  } }).gh;
  const result = observeVerification({ ref: 'feature', request: request(), gh, now: () => NOW, print() {}, dir: null });
  assert.equal(result.decision, 'REUSE'); assert.equal(result.original.attempt, 2);
  artifacts[1].expired = true;
  assert.equal(observeVerification({ ref: 'feature', request: request(), gh, now: () => NOW, print() {}, dir: null }).decision, 'UNRESOLVED');
});

test('lookup failure is bounded and non-secret, and incomplete enumeration never proves RUN', () => {
  let at = NOW, calls = 0;
  const result = observeVerification({ ref: 'feature', now: () => at, dir: null, print() {}, gh() {
    calls += 1; at += 9000; return { status: 0, out: JSON.stringify({ full_name: 'NoaCG/fixture' }) };
  } });
  assert.equal(result.decision, 'UNRESOLVED'); assert.equal(calls, 1);
  const canary = 'secret-canary-not-for-output';
  const failed = observeVerification({ ref: 'feature', now: () => NOW, dir: null, print() {}, gh() { throw Error(canary); } });
  assert.ok(!JSON.stringify(failed).includes(canary));
  const missing = observeVerification({ ref: 'feature', request: request(), gh: reads({ rows: [], total: 100 }).gh, now: () => NOW, dir: null, print() {} });
  assert.equal(missing.decision, 'UNRESOLVED');
});

test('manual dispatch observes every advisory and failure then calls the original command exactly once', () => {
  const args = ['workflow', 'run', 'ci.yml', '--ref', 'feature', '-f', 'require_review=true'];
  for (const decision of ['WAIT', 'REUSE', 'RUN', 'UNRESOLVED', 'throw']) {
    const order = [];
    const code = main(['--', ...args], { observe(input) {
      order.push('observe'); assert.equal(input.ref, 'feature'); assert.equal(input.inputs.require_review, 'true');
      if (decision === 'throw') throw Error('read failed'); return { mode: 'observe', decision };
    }, gh(actual) { order.push('dispatch'); assert.deepEqual(actual, args); return { status: 0 }; } });
    assert.equal(code, 0); assert.deepEqual(order, ['observe', 'dispatch']);
  }
  let observed;
  assert.equal(main(['--request', '/definitely-missing-fixture.json', '--', ...args], { observe: (input) => { observed = input; }, gh: () => ({ status: 0 }) }), 0);
  assert.equal(observed.request.resolutionGap, true);
  assert.equal(main(['--', ...args], { observe() {}, gh: () => ({ status: 1 }) }), 1); // No retry after uncertain acknowledgement.
  const qualified = ['workflow', 'run', 'ci.yml', '--ref=feature', '--repo=NoaCG/fixture', '-F', 'diff_base=@input.txt'];
  main(['--', ...qualified], { observe: (input) => { observed = input; }, gh: (actual) => { assert.deepEqual(actual, qualified); return { status: 0 }; } });
  assert.equal(observed.repository, 'NoaCG/fixture'); assert.equal(observed.inputsResolved, false);
  let duplicates = 0;
  for (let caller = 0; caller < 2; caller += 1) main(['--', ...args], { observe: () => ({ decision: 'WAIT' }), gh: () => { duplicates += 1; return { status: 0 }; } });
  assert.equal(duplicates, 2); // Observation claims no duplicate prevention or serialization.
});

test('cloud absence protection and all existing dispatch paths preserve original behavior under observation', () => {
  for (const verdict of ['WAIT', 'REUSE', 'RUN', 'UNRESOLVED', 'throw']) {
    const calls = [];
    const observe = () => { calls.push('observe'); if (verdict === 'throw') throw Error('lookup'); return { decision: verdict }; };
    const gh = (args) => { calls.push(args); return { status: 0, out: args[0] === 'run' ? '[]' : '' }; };
    assert.deepEqual(reviveReviewed({ branch: 'feature', sha: SHA, gh, observe }), { outcome: 'dispatched' });
    assert.deepEqual(calls, [ ['run', 'list', '--workflow', 'ci.yml', '--commit', SHA, '--event', 'pull_request', '--json', 'databaseId,status', '--limit', '1'], 'observe', ['workflow', 'run', 'ci.yml', '--ref', 'feature', '-f', 'require_review=true'] ]);
    calls.length = 0;
    const result = dispatchRecovery({ dispatchCi: 'feature', command: 'original recovery' }, { gh, observe, print() {} });
    assert.equal(result, true); assert.deepEqual(calls, ['observe', ['workflow', 'run', 'ci.yml', '--ref', 'feature']]);
    calls.length = 0;
    const botGh = (args) => { calls.push(args); if (args[0] === 'pr' && args[1] === 'list') return { status: 0, out: '[{"number":7,"url":"fixture"}]' }; return { status: 0, out: '' }; };
    queuePullRequest({ branch: 'feature', title: 'fixture', body: 'fixture', mechanism: 'fixture', dispatch: true,
      git: () => ({ status: 0, out: SHA }), gh: botGh, observe });
    const at = calls.indexOf('observe');
    assert.deepEqual(calls[at + 1], ['workflow', 'run', 'ci.yml', '--ref', 'feature', '-f', 'require_review=true']);
    assert.equal(calls.filter((c) => Array.isArray(c) && c[0] === 'workflow').length, 1);
  }
  assert.equal(RUN_POLL_MS, 20_000);
  let observed = false, dispatched = false;
  assert.throws(() => reviveReviewed({ branch: 'feature', sha: SHA, observe() { observed = true; }, gh(args) { if (args[0] === 'workflow') dispatched = true; return { status: 1, err: 'denied' }; } }), /denied/);
  assert.equal(observed, false); assert.equal(dispatched, false);
  const jobs = readFileSync(new URL('./jobs.mjs', import.meta.url), 'utf8');
  assert.match(jobs, /return dispatchRecovery\(\{ dispatchCi, command \}\)/);
});

test('documented gh short ref flags resolve before or after the workflow without changing dispatch arguments', () => {
  for (const args of [
    ['workflow', 'run', 'ci.yml', '-r', 'feature', '-f', 'require_review=true'],
    ['workflow', 'run', '-r', 'feature', 'ci.yml', '-f', 'require_review=true'],
    ['workflow', 'run', 'ci.yml', '-r=feature', '-f', 'require_review=true'],
  ]) {
    let observed, dispatched = 0;
    assert.equal(main(['--', ...args], { observe(input) { observed = input; }, gh(actual) { dispatched += 1; assert.deepEqual(actual, args); return { status: 0 }; } }), 0);
    assert.equal(observed.workflow, 'ci.yml'); assert.equal(observed.ref, 'feature');
    assert.equal(observed.inputsResolved, true); assert.equal(observed.inputs.require_review, 'true');
    assert.equal(dispatched, 1);
  }
  const args = ['workflow', 'run', '-r', 'feature'];
  let observed;
  assert.equal(main(['--', ...args], { observe(input) { observed = input; }, gh(actual) { assert.deepEqual(actual, args); return { status: 0 }; } }), 0);
  assert.equal(observed.workflow, undefined); assert.equal(observed.inputsResolved, false);
});

test('failed manual/recovery acknowledgement has no automatic dispatch retry and logging is advisory', () => {
  let calls = 0;
  assert.equal(dispatchRecovery({ dispatchCi: 'feature', command: 'original' }, { observe() { throw Error('lookup failure'); }, gh() { calls += 1; return { status: 1 }; }, print() {} }), false);
  assert.equal(calls, 1);
  assert.doesNotThrow(() => observeVerification({ ref: 'feature', gh: reads().gh, dir: null, now: () => NOW, print() { throw Error('logger unavailable'); } }));
  assert.notEqual(requestIdentity(request()), requestIdentity({ ...request(), inputs: { diff_base: SHA, require_review: false } }));
});
