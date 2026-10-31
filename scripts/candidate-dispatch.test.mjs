// gate: build
// guards: scripts/candidate-dispatch.mjs, .github/workflows/configured-suite.yml
// measures: none - an in-memory GitHub run model and the workflow's own concurrency text, no live Actions
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { attribute, dispatch, exitCode, main, reconcile, saver, SETTLE_MS, settle, WORKFLOW } from './candidate-dispatch.mjs';

const workflowText = readFileSync(new URL('../.github/workflows/configured-suite.yml', import.meta.url), 'utf8');
const REPO = 'NoaCG/fixture', WF = 'configured-suite.yml';
const sha = (c) => c.repeat(40);
const T0 = Date.parse('2026-10-31T12:00:00Z');

// The concurrency group, evaluated the way Actions does for these operators (&&/|| return operands).
function group(context) {
  const expression = /^ {2}group: configured-suite-\$\{\{ (.+) \}\}$/m.exec(workflowText)[1];
  const js = expression.replace(/github\.(\w+)/g, (_, key) => `ctx.${key}`).replace(/==/g, '===').replace(/!===/g, '!==');
  return `configured-suite-${new Function('ctx', `return (${js});`)(context)}`;
}

test('concurrency: schedules, main dispatches, branch dispatches and landings never share a group', () => {
  const groups = {
    landingA: group({ event_name: 'push', sha: sha('a'), ref: 'refs/heads/main' }),
    landingB: group({ event_name: 'push', sha: sha('b'), ref: 'refs/heads/main' }),
    schedule: group({ event_name: 'schedule', sha: sha('c'), ref: 'refs/heads/main' }),
    mainDispatch: group({ event_name: 'workflow_dispatch', sha: sha('c'), ref: 'refs/heads/main' }),
    one: group({ event_name: 'workflow_dispatch', sha: sha('d'), ref: 'refs/heads/claude/one' }),
    two: group({ event_name: 'workflow_dispatch', sha: sha('e'), ref: 'refs/heads/claude/two' }),
    three: group({ event_name: 'workflow_dispatch', sha: sha('f'), ref: 'refs/heads/claude/three' }),
  };
  assert.equal(new Set(Object.values(groups)).size, Object.keys(groups).length, JSON.stringify(groups, null, 1));
  assert.equal(groups.schedule, 'configured-suite-schedule');
  assert.equal(groups.one, 'configured-suite-refs/heads/claude/one');
  // Same branch, newer head: the same group, so GitHub replaces the pending run (settle() recovers it).
  assert.equal(group({ event_name: 'workflow_dispatch', sha: sha('9'), ref: 'refs/heads/claude/one' }), groups.one);
  assert.match(workflowText, /^ {2}cancel-in-progress: false$/m);
});

test('checkout: every job tests github.sha, the commit fixed when the event was created', () => {
  const lines = workflowText.split('\n');
  let checkouts = 0;
  lines.forEach((line, at) => {
    const m = /^(\s*)- uses: actions\/checkout@/.exec(line);
    if (!m) return;
    checkouts += 1;
    for (let i = at + 1; i < lines.length && (lines[i].trim() === '' || lines[i].search(/\S/) > m[1].length); i += 1) {
      assert.doesNotMatch(lines[i], /^\s+ref:/, `checkout at line ${at + 1} pins a ref`);
    }
  });
  assert.ok(checkouts >= 3, 'the plan, shard and verdict jobs each check out');
});

// An in-memory GitHub: a dispatch creates a run on the branch head AT DISPATCH TIME.
function github({ heads, returnsId = true } = {}) {
  const state = { heads: { ...heads }, runs: [], nextId: 100, returnsId, clock: T0, posts: 0, onPost: null, failPost: null };
  const run = (ref, created) => ({ id: state.nextId++, event: 'workflow_dispatch', head_branch: ref, head_sha: state.heads[ref],
    path: `.github/workflows/${WF}`, status: 'queued', conclusion: null, run_attempt: 1, created_at: new Date(created).toISOString(),
    html_url: `https://github.com/${REPO}/actions/runs/${state.nextId - 1}` });
  state.dispatchByOther = (ref) => { const r = run(ref, state.clock); state.runs.push(r); return r; };
  state.api = (method, endpoint, body) => {
    const ok = (json) => ({ ok: true, status: 200, json });
    let m;
    if (method === 'GET' && (m = /^repos\/[^/]+\/[^/]+\/git\/ref\/heads\/(.+)$/.exec(endpoint))) {
      return state.heads[m[1]] ? ok({ object: { sha: state.heads[m[1]] } }) : { ok: false, status: 404, error: 'Not Found' };
    }
    if (method === 'GET' && (m = /\/actions\/workflows\/([^/]+)\/runs\?(.+)$/.exec(endpoint))) {
      const q = new URLSearchParams(m[2]);
      const after = q.get('created') ? Date.parse(q.get('created').slice(2)) : 0;
      const rows = state.runs.filter((r) => r.event === q.get('event') && (!q.get('branch') || r.head_branch === q.get('branch'))
        && Date.parse(r.created_at) >= after && (!q.get('head_sha') || r.head_sha === q.get('head_sha'))).sort((a, b) => b.id - a.id);
      return ok({ total_count: rows.length, workflow_runs: state.pageSize ? rows.slice(0, state.pageSize) : rows });
    }
    if (method === 'GET' && (m = /\/actions\/runs\/(\d+)\/attempts\/(\d+)$/.exec(endpoint))) {
      const r = state.runs.find((x) => x.id === Number(m[1]));
      return ok({ status: 'completed', conclusion: r?.earlierAttempts?.[Number(m[2]) - 1] ?? 'success' });
    }
    if (method === 'GET' && (m = /\/actions\/runs\/(\d+)\/jobs\?/.exec(endpoint))) {
      return ok({ total_count: state.runs.find((x) => x.id === Number(m[1]))?.jobsStarted ?? 0, jobs: [] });
    }
    if (method === 'GET' && (m = /\/actions\/runs\/(\d+)$/.exec(endpoint))) {
      const r = state.runs.find((x) => x.id === Number(m[1]));
      return r ? ok(r) : { ok: false, status: 404, error: 'Not Found' };
    }
    if (method === 'POST' && endpoint.endsWith(`/actions/workflows/${WF}/dispatches`)) {
      state.posts += 1;
      state.onPost?.(body);
      if (state.failPost === 422) return { ok: false, status: 422, error: 'gh: No ref found (HTTP 422)' };
      const r = run(body.ref, state.clock);
      state.runs.push(r);
      if (state.failPost === 'lost') return { ok: false, status: 0, error: 'connection reset' };
      return ok(state.returnsId && body.return_run_details ? { workflow_run_id: r.id, html_url: r.html_url } : null);
    }
    return { ok: false, status: 404, error: `fixture has no ${method} ${endpoint}` };
  };
  return state;
}

function harness(heads, options) {
  const gh = github({ heads, ...options });
  const dir = mkdtempSync(path.join(tmpdir(), 'candidate-dispatch-'));
  const observed = [];
  const deps = { api: gh.api, now: () => gh.clock, save: saver(dir),
    observe: (request) => { observed.push({ ...request, postsBefore: gh.posts }); } };
  const send = (ref, extra = {}) => dispatch({ repository: REPO, workflow: WF, ref, sha: gh.heads[ref], ...extra }, deps);
  const records = () => readdirSync(dir).map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
  const lines = [];
  const cli = (argv) => main(argv, { api: gh.api, now: () => gh.clock, observe: () => {}, print: (l) => lines.push(JSON.parse(l)) });
  return { gh, dir, deps, send, observed, records, lines, cli, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test('three unrelated candidates dispatched together each get their own run on their own commit', () => {
  const h = harness({ 'claude/one': sha('1'), 'claude/two': sha('2'), 'claude/three': sha('3') });
  try {
    const sent = ['claude/one', 'claude/two', 'claude/three'].map((ref) => h.send(ref));
    assert.deepEqual(sent.map((s) => s.state), ['running', 'running', 'running']);
    assert.equal(new Set(sent.map((s) => s.run.id)).size, 3);
    sent.forEach((s, i) => assert.equal(s.run.head_sha, sha(String(i + 1))));
    // Each finishes; each verdict reads back on its own commit.
    h.gh.runs.forEach((r) => Object.assign(r, { status: 'completed', conclusion: r.head_branch === 'claude/two' ? 'failure' : 'success' }));
    const verdicts = sent.map((s) => reconcile(JSON.parse(readFileSync(s.record, 'utf8')), h.deps));
    assert.deepEqual(verdicts.map((v) => [v.state, v.conclusion, v.run.head_sha]),
      [['verdict', 'success', sha('1')], ['verdict', 'failure', sha('2')], ['verdict', 'success', sha('3')]]);
  } finally { h.done(); }
});

test('the intent is recorded and observation runs before the dispatch, and observation never gates it', () => {
  const h = harness({ 'claude/one': sha('1') });
  try {
    h.gh.onPost = () => assert.deepEqual(h.records().map((r) => [r.delivery, r.sha, r.ref]), [['requested', sha('1'), 'claude/one']]);
    const sent = h.send('claude/one');
    assert.equal(sent.state, 'running');
    assert.deepEqual(h.observed.map((o) => [o.ref, o.expectedRevision, o.postsBefore]), [['claude/one', sha('1'), 0]]);
    assert.deepEqual(h.records().map((r) => [r.delivery, r.runId]), [['accepted', sent.run.id]]);
    h.gh.onPost = null;
    const throwing = dispatch({ repository: REPO, workflow: WF, ref: 'claude/one', sha: sha('1') },
      { ...h.deps, observe: () => { throw Error('lookup down'); } });
    assert.equal(throwing.state, 'running');
  } finally { h.done(); }
});

test('a moved ref is refused before anything is dispatched or recorded', () => {
  const h = harness({ 'claude/one': sha('1') });
  try {
    const sent = dispatch({ repository: REPO, workflow: WF, ref: 'claude/one', sha: sha('9') }, h.deps);
    assert.equal(sent.state, 'refused');
    assert.match(sent.reason, /not the requested/);
    assert.equal(h.gh.posts, 0);
    assert.deepEqual(h.records(), []);
    assert.equal(dispatch({ repository: REPO, workflow: WF, ref: 'refs/heads/x', sha: sha('1') }, h.deps).state, 'refused');
    assert.equal(dispatch({ repository: REPO, workflow: WF, ref: 'claude/one', sha: 'abc' }, h.deps).state, 'refused');
  } finally { h.done(); }
});

test('a ref that moves between the check and the dispatch yields a refused mismatch, not a verdict', () => {
  const h = harness({ 'claude/one': sha('1') });
  try {
    h.gh.onPost = () => { h.gh.heads['claude/one'] = sha('8'); };
    const sent = h.send('claude/one');
    assert.equal(sent.state, 'mismatch');
    assert.match(sent.reason, /at 8{40}, not a configured-suite\.yml dispatch on claude\/one at 1{40}/);
  } finally { h.done(); }
});

test('without a returned run ID no run is ever adopted; --recover dispatches afresh', () => {
  const h = harness({ 'claude/one': sha('1') }, { returnsId: false });
  try {
    h.gh.dispatchByOther('claude/one'); // Before the request: in the prior snapshot.
    h.gh.clock += 60_000;
    const sent = h.send('claude/one');
    assert.deepEqual([sent.state, sent.runIds, exitCode(sent)], ['unproven', [101], 2]);
    assert.equal(JSON.parse(readFileSync(sent.record, 'utf8')).runId, undefined);
    h.gh.returnsId = true;
    h.cli(['reconcile', sent.record, '--recover']);
    assert.deepEqual([h.lines.at(-1).recoveredFrom.state, h.lines.at(-1).state, h.lines.at(-1).run.id], ['unproven', 'running', 102]);
  } finally { h.done(); }
});

test('a lost acknowledgement never adopts a run, even the right one, and never passes', () => {
  const h = harness({ 'claude/one': sha('1') });
  try {
    // GitHub is still creating ours when the acknowledgement is lost; a concurrent dispatch on
    // the same ref is visible first.
    const api = (method, endpoint, body) => {
      if (method !== 'POST') return h.gh.api(method, endpoint, body);
      h.gh.dispatchByOther('claude/one');
      return { ok: false, status: 0, error: 'timeout' };
    };
    const seen = [];
    const save = h.deps.save;
    const sent = dispatch({ repository: REPO, workflow: WF, ref: 'claude/one', sha: sha('1') },
      { ...h.deps, api, save: (intent, file) => { seen.push(intent.delivery); return save(intent, file); } });
    assert.deepEqual(seen, ['requested', 'uncertain']);
    assert.equal(sent.state, 'unproven');
    // Ours appears and fails, the other passes: the record still gives no verdict at all.
    h.gh.dispatchByOther('claude/one');
    h.gh.runs.forEach((r) => Object.assign(r, { status: 'completed', conclusion: r.id === 100 ? 'success' : 'failure' }));
    const later = reconcile(JSON.parse(readFileSync(sent.record, 'utf8')), h.deps);
    assert.deepEqual([later.state, [...later.runIds].sort(), exitCode(later)], ['unproven', [100, 101], 2]);
  } finally { h.done(); }
});

test('an absent run stays uncertain until a complete listing after the settle time; a 422 is a refusal', () => {
  const h = harness({ 'claude/one': sha('1') });
  try {
    const intent = { version: 1, repository: REPO, workflow: WF, ref: 'claude/one', sha: sha('1'),
      requestedAt: new Date(T0).toISOString(), priorRunIds: [], delivery: 'uncertain' };
    assert.equal(attribute(intent, { runs: [], complete: true }, T0 + 60_000).state, 'absent');
    assert.equal(attribute(intent, { runs: [], complete: false }, T0 + SETTLE_MS).state, 'absent');
    assert.equal(attribute(intent, { runs: [], complete: true }, T0 + SETTLE_MS).state, 'not-delivered');
    assert.equal(attribute({ ...intent, delivery: 'accepted' }, { runs: [], complete: true }, T0 + SETTLE_MS).state, 'absent');
    h.gh.failPost = 422;
    const sent = h.send('claude/one');
    assert.equal(sent.state, 'refused');
    assert.equal(h.records()[0].delivery, 'refused');
  } finally { h.done(); }
});

test('same-branch pending supersession: follow the same commit, recover once, or call the old commit obsolete', () => {
  const h = harness({ 'claude/one': sha('1') });
  try {
    const first = h.send('claude/one');
    const firstRun = h.gh.runs.find((r) => r.id === first.run.id);
    Object.assign(firstRun, { status: 'completed', conclusion: 'cancelled' });
    const intent = () => JSON.parse(readFileSync(first.record, 'utf8'));

    // Nothing replaced it and the commit is still the head: recover, once.
    assert.equal(reconcile(intent(), h.deps).state, 'recover');
    const { cli, lines } = h;
    h.gh.clock += 1000;
    assert.equal(cli(['reconcile', first.record, '--recover']), 3, 'recovered: the new run is still running');
    const recovered = lines.at(-1);
    assert.equal(recovered.recoveredFrom.state, 'recover');
    assert.equal(recovered.state, 'running');
    assert.equal(JSON.parse(readFileSync(first.record, 'utf8')).recoveredBy, recovered.record);
    assert.equal(cli(['reconcile', first.record, '--recover']), 3, 'the old record now follows its replacement, still running');
    assert.equal(lines.at(-1).state, 'superseded');
    assert.equal(lines.at(-1).by.id, recovered.run.id);
    Object.assign(h.gh.runs.find((r) => r.id === recovered.run.id), { status: 'completed', conclusion: 'cancelled' });
    assert.equal(cli(['reconcile', first.record, '--recover']), 1, 'a record recovers at most once');
    assert.match(lines.at(-1).reason, /already recovered/);

    // The head moved on: the old commit's run is obsolete here.
    h.gh.heads['claude/one'] = sha('2');
    const moved = settle(intent(), { ...firstRun }, { complete: true, started: () => false, runs: h.gh.runs, head: sha('2') });
    assert.equal(moved.state, 'obsolete');
    assert.match(moved.reason, /exact-SHA check branch/);
  } finally { h.done(); }
});

test('a run that appears after not-delivered and --recover changes nothing', () => {
  const h = harness({ 'claude/one': sha('1') });
  try {
    h.gh.failPost = 'none'; // The dispatch is lost outright: no run, no acknowledgement.
    const api = (method, endpoint, body) => (method === 'POST' && h.gh.failPost === 'none'
      ? { ok: false, status: 0, error: 'timeout' } : h.gh.api(method, endpoint, body));
    const lost = dispatch({ repository: REPO, workflow: WF, ref: 'claude/one', sha: sha('1') }, { ...h.deps, api });
    assert.equal(lost.state, 'absent');
    h.gh.clock += SETTLE_MS;
    h.gh.failPost = null;
    h.cli(['reconcile', lost.record, '--recover']);
    const recovered = h.lines.at(-1);
    assert.deepEqual([recovered.recoveredFrom.state, recovered.state], ['not-delivered', 'running']);
    h.gh.dispatchByOther('claude/one'); // The lost original turns up late.
    h.cli(['reconcile', recovered.record]);
    assert.equal(h.lines.at(-1).run.id, recovered.run.id, 'the proved run, never the late one');
    assert.equal(h.cli(['reconcile', lost.record, '--recover']), 1, 'the old record recovers at most once');
  } finally { h.done(); }
});

test('a same-second replacement is found by run ID; a run cancelled after it started blocks the commit and is never auto-recovered', () => {
  const intent = { workflow: WF, ref: 'claude/one', sha: sha('1') };
  const at = '2026-10-31T12:00:00Z';
  const base = { event: 'workflow_dispatch', head_branch: 'claude/one', head_sha: sha('1'), path: `.github/workflows/${WF}`, created_at: at };
  const cancelled = { ...base, id: 10, status: 'completed', conclusion: 'cancelled' };
  const twin = { ...base, id: 11, status: 'queued', conclusion: null };
  assert.equal(settle(intent, cancelled, { complete: true, started: () => false, runs: [twin, cancelled], head: sha('1') }).by.id, 11);
  assert.equal(settle(intent, { ...twin, id: 9 }, { complete: true, started: () => false, runs: [cancelled, { ...twin, id: 9 }], head: sha('1') }).state, 'running');
  const byHand = settle(intent, cancelled, { complete: true, started: () => true, runs: [cancelled], head: sha('1') });
  assert.equal(byHand.state, 'cancelled');
  assert.equal(exitCode(byHand), 1, 'its result is unknown: the commit cannot pass');
  assert.equal(settle(intent, cancelled, { complete: true, started: () => false, runs: [cancelled], head: sha('1') }).state, 'recover');
});

test('a superseded record carries its replacement\'s verdict and exit code', () => {
  const intent = { workflow: WF, ref: 'claude/one', sha: sha('1') };
  const base = { event: 'workflow_dispatch', head_branch: 'claude/one', head_sha: sha('1'), path: `.github/workflows/${WF}`, created_at: '2026-10-31T12:00:00Z' };
  const cancelled = { ...base, id: 10, status: 'completed', conclusion: 'cancelled' };
  const settled = (replacement) => settle(intent, cancelled, { complete: true, started: () => false, runs: [cancelled, { ...base, id: 11, ...replacement }], head: sha('1') });
  const failed = settled({ status: 'completed', conclusion: 'failure' });
  assert.deepEqual([failed.state, failed.conclusion, failed.by.id], ['superseded', 'failure', 11]);
  assert.equal(exitCode(failed), 1);
  assert.equal(exitCode(settled({ status: 'completed', conclusion: 'success' })), 0);
  const running = settled({ status: 'in_progress', conclusion: null });
  assert.equal(running.conclusion, undefined);
  assert.equal(exitCode(running), 3);
});

test('only the input-free configured suite is served, and only it adopts a replacement\'s verdict', () => {
  // Rule 2 rests on this: a dispatch with no inputs on one commit is one check.
  assert.equal(WORKFLOW, 'configured-suite.yml');
  assert.match(workflowText, /^ {2}workflow_dispatch: \{\}$/m, 'configured-suite.yml gained dispatch inputs: revisit supersession');
  const h = harness({ 'claude/one': sha('1') });
  try {
    const other = dispatch({ repository: REPO, workflow: 'ci.yml', ref: 'claude/one', sha: sha('1') }, h.deps);
    assert.equal(other.state, 'refused');
    assert.equal(h.gh.posts, 0);
  } finally { h.done(); }
  const base = { event: 'workflow_dispatch', head_branch: 'claude/one', head_sha: sha('1'), path: '.github/workflows/ci.yml', created_at: '2026-10-31T12:00:00Z' };
  const cancelled = { ...base, id: 10, status: 'completed', conclusion: 'cancelled' };
  const narrower = { ...base, id: 11, status: 'completed', conclusion: 'success' }; // e.g. a diff_base run
  const ci = settle({ workflow: 'ci.yml', ref: 'claude/one', sha: sha('1') }, cancelled, { complete: true, started: () => false, runs: [cancelled, narrower], head: sha('1') });
  assert.deepEqual([ci.row, ci.state], ['V1', 'refused']);
  assert.notEqual(exitCode(ci), 0);
});

test('a failure on the commit after a cancel is never hidden by a later pass', () => {
  const intent = { workflow: WF, ref: 'claude/one', sha: sha('1') };
  const base = { event: 'workflow_dispatch', head_branch: 'claude/one', head_sha: sha('1'), path: `.github/workflows/${WF}`, created_at: '2026-10-31T12:00:00Z' };
  const a = { ...base, id: 10, status: 'completed', conclusion: 'cancelled' }; // replaced while pending
  const b = { ...base, id: 11, status: 'completed', conclusion: 'failure' }; // the run that replaced it
  const c = { ...base, id: 12, status: 'completed', conclusion: 'success' }; // a later pass on the same commit
  const failed = settle(intent, a, { complete: true, started: () => false, runs: [c, b, a], head: sha('1') });
  assert.deepEqual([failed.state, failed.conclusion, failed.by.id, exitCode(failed)], ['superseded', 'failure', 11, 1]);
  const pending = settle(intent, a, { complete: true, started: () => false, runs: [{ ...c, status: 'in_progress', conclusion: null }, { ...b, conclusion: 'success' }, a], head: sha('1') });
  assert.deepEqual([pending.conclusion, exitCode(pending)], [undefined, 3]);
  const passed = settle(intent, a, { complete: true, started: () => false, runs: [c, { ...b, conclusion: 'success' }, a], head: sha('1') });
  assert.deepEqual([passed.conclusion, passed.by.id, exitCode(passed)], ['success', 11, 0]);
});

test('a cancelled run never passes from an incomplete run listing', () => {
  const h = harness({ 'claude/one': sha('1') });
  try {
    const first = h.send('claude/one');
    Object.assign(h.gh.runs.find((r) => r.id === first.run.id), { status: 'completed', conclusion: 'cancelled' });
    // A failure on the commit, then more than a page of passing runs on the same branch and commit.
    Object.assign(h.gh.dispatchByOther('claude/one'), { status: 'completed', conclusion: 'failure' });
    for (let i = 0; i < 100; i += 1) Object.assign(h.gh.dispatchByOther('claude/one'), { status: 'completed', conclusion: 'success' });
    h.gh.pageSize = 100;
    const answer = reconcile(JSON.parse(readFileSync(first.record, 'utf8')), h.deps);
    assert.notEqual(exitCode(answer), 0, JSON.stringify({ state: answer.state, conclusion: answer.conclusion }));
    assert.equal(answer.state, 'unresolved');
    h.gh.pageSize = undefined; // The whole listing shows the failure.
    const whole = reconcile(JSON.parse(readFileSync(first.record, 'utf8')), h.deps);
    assert.deepEqual([whole.state, whole.conclusion, exitCode(whole)], ['superseded', 'failure', 1]);
  } finally { h.done(); }
});

test('rule 8: no re-dispatch, recovery or re-run turns a failure on the commit into a pass', () => {
  const h = harness({ 'claude/one': sha('1') }, { returnsId: false });
  try {
    // The reviewer's sequence: lost run ID, that run fails, --recover, the recovery passes.
    const lost = h.send('claude/one');
    assert.deepEqual([lost.state, lost.runIds], ['unproven', [100]]);
    Object.assign(h.gh.runs[0], { status: 'completed', conclusion: 'failure' });
    h.gh.returnsId = true;
    h.gh.clock += 1000;
    h.cli(['reconcile', lost.record, '--recover']);
    const recovered = h.lines.at(-1);
    Object.assign(h.gh.runs.find((r) => r.id === recovered.run.id), { status: 'completed', conclusion: 'success' });
    h.cli(['reconcile', recovered.record]);
    assert.deepEqual([h.lines.at(-1).state, h.lines.at(-1).conclusion, h.lines.at(-1).by.id], ['verdict', 'failure', 100]);
    assert.equal(h.cli(['reconcile', recovered.record]), 1);
    // A plain second dispatch after the failure: still failing.
    h.gh.clock += 1000;
    const again = h.send('claude/one');
    Object.assign(h.gh.runs.find((r) => r.id === again.run.id), { status: 'completed', conclusion: 'success' });
    const read = reconcile(JSON.parse(readFileSync(again.record, 'utf8')), h.deps);
    assert.deepEqual([read.conclusion, exitCode(read)], ['failure', 1]);
  } finally { h.done(); }
  // A re-run that passed on attempt 2 after attempt 1 failed.
  const h2 = harness({ 'claude/two': sha('2') });
  try {
    const sent = h2.send('claude/two');
    Object.assign(h2.gh.runs[0], { status: 'completed', conclusion: 'success', run_attempt: 2, earlierAttempts: ['failure'] });
    const read = reconcile(JSON.parse(readFileSync(sent.record, 'utf8')), h2.deps);
    assert.deepEqual([read.state, read.conclusion, exitCode(read)], ['verdict', 'failure', 1]);
    h2.gh.runs[0].earlierAttempts = ['success'];
    assert.equal(exitCode(reconcile(JSON.parse(readFileSync(sent.record, 'utf8')), h2.deps)), 0);
  } finally { h2.done(); }
});

test('rule 8 corrections: any branch, started cancels block, the run must be listed, failed beats running', () => {
  const intent = { workflow: WF, ref: 'claude/one', sha: sha('1') };
  const base = { event: 'workflow_dispatch', head_branch: 'claude/one', head_sha: sha('1'), path: `.github/workflows/${WF}`, created_at: '2026-10-31T12:00:00Z' };
  const mine = { ...base, id: 20, status: 'completed', conclusion: 'success' };
  const at = (runs, started = () => false) => settle(intent, mine, { complete: true, started, runs, head: sha('1') });
  assert.equal(exitCode(at([mine])), 0);
  const elsewhere = at([mine, { ...base, id: 19, head_branch: 'claude/other', status: 'completed', conclusion: 'failure' }]);
  assert.deepEqual([elsewhere.conclusion, elsewhere.by.id, exitCode(elsewhere)], ['failure', 19, 1]);
  const stopped = { ...base, id: 18, status: 'completed', conclusion: 'cancelled' };
  assert.equal(exitCode(at([mine, stopped])), 0, 'cancelled while pending: ignored');
  const byHand = at([mine, stopped], (run) => run.id === 18);
  assert.deepEqual([byHand.state, exitCode(byHand)], ['cancelled', 1]);
  const unlisted = at([]);
  assert.deepEqual([unlisted.state, exitCode(unlisted)], ['unresolved', 1]);
  const fresh = settle(intent, { ...mine, status: 'queued', conclusion: null }, { complete: true, started: () => false, runs: [], head: sha('1') });
  assert.deepEqual([fresh.state, exitCode(fresh)], ['running', 3], 'a just-dispatched run the listing lags behind');
  const racing = settle(intent, { ...mine, status: 'in_progress', conclusion: null },
    { complete: true, started: () => false, head: sha('1'), runs: [{ ...mine, status: 'in_progress', conclusion: null }, { ...base, id: 21, status: 'completed', conclusion: 'failure' }] });
  assert.deepEqual([racing.conclusion, exitCode(racing)], ['failure', 1]);
});

test('a cancelled or running re-run never erases its failed earlier attempt', () => {
  const intent = { workflow: WF, ref: 'claude/one', sha: sha('1') };
  const base = { event: 'workflow_dispatch', head_branch: 'claude/one', head_sha: sha('1'), path: `.github/workflows/${WF}`, created_at: '2026-10-31T12:00:00Z' };
  const mine = { ...base, id: 20, status: 'completed', conclusion: 'success' };
  const failedOnce = { ...base, id: 19, run_attempt: 2 };
  const attempts = (run) => (run.id === 19 ? ['failure'] : []);
  for (const second of [{ status: 'completed', conclusion: 'cancelled' }, { status: 'in_progress', conclusion: null }]) {
    const answer = settle(intent, mine, { complete: true, started: () => false, attempts, head: sha('1'), runs: [mine, { ...failedOnce, ...second }] });
    assert.deepEqual([answer.conclusion, answer.by.id, exitCode(answer)], ['failure', 19, 1], second.status);
  }
});

test('decision table: one case per row, first matching row wins', () => {
  const C = sha('c');
  const intent = { version: 1, repository: REPO, workflow: WF, ref: 'claude/one', sha: C, requestedAt: new Date(T0).toISOString(), priorRunIds: [7] };
  const run = (id, more = {}) => ({ id, event: 'workflow_dispatch', head_branch: 'claude/one', head_sha: C, path: `.github/workflows/${WF}`,
    created_at: new Date(T0).toISOString(), status: 'completed', conclusion: 'success', run_attempt: 1, ...more });
  const R = run(20);
  const facts = (runs, more = {}) => ({ complete: true, runs, started: () => false, attempts: () => ['success'], head: C, ...more });
  const check = (label, got, row, state, exit) => assert.deepEqual([got.row, got.state, exitCode(got)], [row, state, exit], label);
  const noId = { ...intent, delivery: 'uncertain' };
  check('A1 a new run, no proof', attribute(noId, { runs: [run(21)], complete: true }, T0), 'A1', 'unproven', 2);
  check('A2 nothing, settled', attribute(noId, { runs: [run(7)], complete: true }, T0 + SETTLE_MS), 'A2', 'not-delivered', 2);
  check('A3 nothing yet', attribute(noId, { runs: [], complete: true }, T0 + 1000), 'A3', 'absent', 2);
  check('A3 accepted, never final', attribute({ ...noId, delivery: 'accepted' }, { runs: [], complete: true }, T0 + SETTLE_MS), 'A3', 'absent', 2);
  check('A4 unreadable', attribute({ ...intent, runId: 20 }, { runs: [], complete: true }, T0), 'A4', 'unresolved', 1);
  check('A5 other commit', attribute({ ...intent, runId: 20 }, { runs: [run(20, { head_sha: sha('d') })], complete: true }, T0), 'A5', 'mismatch', 1);
  check('A5 other branch', attribute({ ...intent, runId: 20 }, { runs: [run(20, { head_branch: 'x' })], complete: true }, T0), 'A5', 'mismatch', 1);
  check('V1 other workflow', settle({ ...intent, workflow: 'ci.yml' }, R, facts([R])), 'V1', 'refused', 1);
  check('V2 failure elsewhere', settle(intent, R, facts([R, run(5, { head_branch: 'other', conclusion: 'failure' })])), 'V2', 'verdict', 1);
  check('V2 even from a partial list', settle(intent, R, facts([run(5, { conclusion: 'timed_out' })], { complete: false })), 'V2', 'verdict', 1);
  check('V2 own failure', settle(intent, run(20, { conclusion: 'failure' }), facts([run(20, { conclusion: 'failure' })])), 'V2', 'verdict', 1);
  check('V3 incomplete, finished', settle(intent, R, facts([R], { complete: false })), 'V3', 'unresolved', 1);
  check('V3 R not listed, running', settle(intent, run(20, { status: 'queued', conclusion: null }), facts([])), 'V3', 'running', 3);
  const rerun = run(6, { run_attempt: 3, status: 'completed', conclusion: 'cancelled' });
  check('V4 failed earlier attempt of a cancelled re-run', settle(intent, R, facts([R, rerun], { attempts: () => ['success', 'failure'] })), 'V4', 'verdict', 1);
  check('V5 attempts unreadable', settle(intent, R, facts([R, run(6, { run_attempt: 2 })], { attempts: () => { throw Error('down'); } })), 'V5', 'unresolved', 1);
  const stopped = run(6, { conclusion: 'cancelled' });
  check('V6 cancelled after start', settle(intent, R, facts([R, stopped], { started: () => true })), 'V6', 'cancelled', 1);
  check('V6 start unknown', settle(intent, R, facts([R, stopped], { started: () => { throw Error('down'); } })), 'V6', 'unresolved', 1);
  check('V7 another still running', settle(intent, R, facts([R, run(21, { status: 'in_progress', conclusion: null })])), 'V7', 'running', 3);
  const Rcancel = run(20, { conclusion: 'cancelled' });
  check('V7 R replaced, replacement running', settle(intent, Rcancel, facts([Rcancel, run(21, { status: 'queued', conclusion: null })])), 'V7', 'superseded', 3);
  check('V8 recover', settle(intent, Rcancel, facts([Rcancel, stopped])), 'V8', 'recover', 2);
  check('V8 obsolete', settle(intent, Rcancel, facts([Rcancel], { head: sha('d') })), 'V8', 'obsolete', 2);
  check('V9 pass', settle(intent, R, facts([R, run(4), stopped])), 'V9', 'verdict', 0);
  check('V9 R replaced, all passed', settle(intent, Rcancel, facts([Rcancel, run(21)])), 'V9', 'superseded', 0);
});

test('exit codes: 0 only for a passing verdict, 1 refused or failing, 2 act, 3 still running', () => {
  assert.equal(exitCode({ state: 'running' }), 3);
  assert.equal(exitCode({ state: 'superseded' }), 3);
  assert.equal(exitCode({ state: 'superseded', conclusion: 'success' }), 0);
  assert.equal(exitCode({ state: 'verdict', conclusion: 'success' }), 0);
  assert.equal(exitCode({ state: 'verdict', conclusion: 'failure' }), 1);
  assert.equal(exitCode({ state: 'mismatch' }), 1);
  assert.equal(exitCode({ state: 'absent' }), 2);
  assert.equal(exitCode({ state: 'not-delivered' }), 2);
  assert.equal(dispatch({ repository: undefined, ref: 'claude/one', sha: sha('1') }, { api: () => ({ ok: false }) }).state, 'refused');
  const lines = [];
  assert.equal(main(['reconcile', '/nonexistent/record.json'], { api: () => ({ ok: false }), print: (l) => lines.push(JSON.parse(l)) }), 1);
  assert.equal(lines[0].state, 'unresolved');
});

test('two intents for one commit at the same instant keep separate records', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'candidate-dispatch-'));
  try {
    const save = saver(dir);
    const intent = (ref) => ({ version: 1, repository: REPO, workflow: WF, ref, sha: sha('1'), requestedAt: new Date(T0).toISOString() });
    const one = save(intent('claude/one')), two = save(intent('claude/two'));
    assert.notEqual(one, two);
    assert.deepEqual([one, two].map((f) => JSON.parse(readFileSync(f, 'utf8')).ref), ['claude/one', 'claude/two']);
    save({ ...intent('claude/one'), delivery: 'accepted' }, one); // An update rewrites its own record.
    assert.equal(JSON.parse(readFileSync(one, 'utf8')).delivery, 'accepted');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('--recover sends at most once: a restart after the send, or a concurrent caller, never sends again', () => {
  const h = harness({ 'claude/one': sha('1') });
  try {
    const first = h.send('claude/one');
    Object.assign(h.gh.runs.find((r) => r.id === first.run.id), { status: 'completed', conclusion: 'cancelled' });
    // The process dies right after GitHub accepted the recovery dispatch, before any final save.
    const crash = (method, endpoint, body) => {
      const result = h.gh.api(method, endpoint, body);
      if (method === 'POST') throw Error('killed after the send');
      return result;
    };
    const lines = [];
    const cli = (api) => main(['reconcile', first.record, '--recover'],
      { api, now: () => h.gh.clock, observe: () => {}, print: (l) => lines.push(JSON.parse(l)) });
    assert.equal(cli(crash), 1);
    assert.equal(h.gh.posts, 2);
    // Restarted: the run the lost recovery started already carries the verdict, nothing is sent.
    assert.equal(cli(h.gh.api), 3);
    assert.equal(lines.at(-1).state, 'superseded');
    assert.equal(h.gh.posts, 2, 'no second recovery dispatch');
    // Even if that run is cancelled too, the claim on disk stops a second recovery.
    h.gh.runs.forEach((r) => Object.assign(r, { status: 'completed', conclusion: 'cancelled' }));
    assert.equal(cli(h.gh.api), 1);
    assert.equal(h.gh.posts, 2);
    assert.match(lines.at(-1).reason, /already recovered/);
    // The recovery's own record was written before its send and names what it recovers.
    const recovery = h.records().find((r) => r.recovers === first.record);
    assert.equal(recovery?.sha, sha('1'));
    // A concurrent caller holding the same record loses the exclusive claim too.
    const other = h.send('claude/one');
    Object.assign(h.gh.runs.find((r) => r.id === other.run.id), { status: 'completed', conclusion: 'cancelled' });
    writeFileSync(`${other.record}.recovery`, '{}\n'); // Its twin claimed it a moment earlier.
    const posts = h.gh.posts;
    assert.equal(main(['reconcile', other.record, '--recover'], { api: h.gh.api, now: () => h.gh.clock, observe: () => {}, print: () => {} }), 1);
    assert.equal(h.gh.posts, posts);
  } finally { h.done(); }
});

test('a recovery refused before sending frees its claim; one GitHub answered keeps it', () => {
  const h = harness({ 'claude/one': sha('1') });
  try {
    const first = h.send('claude/one');
    Object.assign(h.gh.runs.find((r) => r.id === first.run.id), { status: 'completed', conclusion: 'cancelled' });
    // Not-delivered then the head moves: the recovery is refused with nothing sent.
    h.gh.heads['claude/one'] = sha('2');
    const stale = { ...JSON.parse(readFileSync(first.record, 'utf8')), runId: undefined, delivery: 'uncertain' };
    writeFileSync(first.record, JSON.stringify(stale));
    h.gh.runs.length = 0;
    h.gh.clock += SETTLE_MS;
    assert.equal(h.cli(['reconcile', first.record, '--recover']), 1);
    assert.match(h.lines.at(-1).reason, /not the requested/);
    h.gh.heads['claude/one'] = sha('1');
    const posts = h.gh.posts;
    h.gh.failPost = 422;
    assert.equal(h.cli(['reconcile', first.record, '--recover']), 1, 'the claim was free again');
    assert.equal(h.gh.posts, posts + 1);
    h.gh.failPost = null;
    assert.equal(h.cli(['reconcile', first.record, '--recover']), 1, 'GitHub answered the last one: its claim holds');
    assert.match(h.lines.at(-1).reason, /already recovered/);
    assert.equal(h.gh.posts, posts + 1);
  } finally { h.done(); }
});

test('the CLI refuses unknown commands with exit 1', () => {
  const lines = [];
  assert.equal(main(['nonsense'], { api: () => ({ ok: false }), print: (l) => lines.push(JSON.parse(l)) }), 1);
  assert.equal(lines[0].state, 'refused');
});
