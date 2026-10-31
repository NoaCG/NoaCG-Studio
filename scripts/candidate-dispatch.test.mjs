// gate: build
// guards: scripts/candidate-dispatch.mjs, .github/workflows/configured-suite.yml
// measures: none - an in-memory GitHub run model and the workflow's own concurrency text, no live Actions
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { attribute, dispatch, exitCode, main, reconcile, saver, SETTLE_MS, settle } from './candidate-dispatch.mjs';

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
  const state = { heads: { ...heads }, runs: [], nextId: 100, clock: T0, posts: 0, onPost: null, failPost: null };
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
      const after = Date.parse(q.get('created').slice(2));
      const rows = state.runs.filter((r) => r.event === q.get('event') && r.head_branch === q.get('branch')
        && Date.parse(r.created_at) >= after).sort((a, b) => b.id - a.id);
      return ok({ total_count: rows.length, workflow_runs: rows });
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
      return ok(returnsId && body.return_run_details ? { workflow_run_id: r.id, html_url: r.html_url } : null);
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
    assert.match(sent.reason, /tested 8{40}, not the requested 1{40}/);
  } finally { h.done(); }
});

test('without a returned run ID the one new run is found; two new runs are ambiguous', () => {
  const h = harness({ 'claude/one': sha('1') }, { returnsId: false });
  try {
    h.gh.dispatchByOther('claude/one'); // Before the request: in the prior snapshot, never attributed.
    h.gh.clock += 60_000;
    const sent = h.send('claude/one');
    assert.equal(sent.state, 'running');
    assert.equal(sent.run.id, 101);
    h.gh.onPost = () => h.gh.dispatchByOther('claude/one'); // Someone else dispatches the same branch at once.
    h.gh.clock += 60_000;
    const clash = h.send('claude/one');
    assert.equal(clash.state, 'ambiguous');
    assert.equal(clash.runIds.length, 2);
  } finally { h.done(); }
});

test('a lost acknowledgement reconciles from the recorded intent', () => {
  const h = harness({ 'claude/one': sha('1') });
  try {
    h.gh.failPost = 'lost';
    const seen = [];
    const save = h.deps.save;
    const sent = dispatch({ repository: REPO, workflow: WF, ref: 'claude/one', sha: sha('1') },
      { ...h.deps, save: (intent, file) => { seen.push(intent.delivery); return save(intent, file); } });
    assert.deepEqual(seen, ['requested', 'uncertain', 'accepted']);
    assert.equal(sent.state, 'running');
    assert.equal(sent.run.head_sha, sha('1'));
    assert.equal(h.records()[0].runId, sent.run.id);
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
    assert.equal(cli(['reconcile', first.record, '--recover']), 0);
    const recovered = lines.at(-1);
    assert.equal(recovered.recoveredFrom.state, 'recover');
    assert.equal(recovered.state, 'running');
    assert.equal(JSON.parse(readFileSync(first.record, 'utf8')).recoveredBy, recovered.record);
    assert.equal(cli(['reconcile', first.record, '--recover']), 0, 'the old record now follows its replacement');
    assert.equal(lines.at(-1).state, 'superseded');
    assert.equal(lines.at(-1).by.id, recovered.run.id);
    Object.assign(h.gh.runs.find((r) => r.id === recovered.run.id), { status: 'completed', conclusion: 'cancelled' });
    assert.equal(cli(['reconcile', first.record, '--recover']), 1, 'a record recovers at most once');
    assert.match(lines.at(-1).reason, /already recovered/);

    // The head moved on: the old commit's run is obsolete here.
    h.gh.heads['claude/one'] = sha('2');
    const moved = settle(intent(), { ...firstRun }, { runs: h.gh.runs, head: sha('2') });
    assert.equal(moved.state, 'obsolete');
    assert.match(moved.reason, /exact-SHA check branch/);
  } finally { h.done(); }
});

test('a run found without a returned ID is kept, so a later run on the ref cannot make it ambiguous', () => {
  const h = harness({ 'claude/one': sha('1') }, { returnsId: false });
  try {
    const first = h.send('claude/one');
    assert.equal(first.state, 'running');
    assert.equal(JSON.parse(readFileSync(first.record, 'utf8')).runId, first.run.id);
    Object.assign(h.gh.runs.find((r) => r.id === first.run.id), { status: 'completed', conclusion: 'cancelled' });
    h.gh.clock += 1000;
    h.cli(['reconcile', first.record, '--recover']);
    assert.equal(h.lines.at(-1).state, 'running');
    h.cli(['reconcile', first.record]);
    assert.equal(h.lines.at(-1).state, 'superseded');
  } finally { h.done(); }
});

test('a same-second replacement is found by run ID; a run cancelled after it started is never auto-recovered', () => {
  const intent = { workflow: WF, ref: 'claude/one', sha: sha('1') };
  const at = '2026-10-31T12:00:00Z';
  const base = { event: 'workflow_dispatch', head_branch: 'claude/one', head_sha: sha('1'), path: `.github/workflows/${WF}`, created_at: at };
  const cancelled = { ...base, id: 10, status: 'completed', conclusion: 'cancelled' };
  const twin = { ...base, id: 11, status: 'queued', conclusion: null };
  assert.equal(settle(intent, cancelled, { runs: [twin, cancelled], head: sha('1') }).by.id, 11);
  assert.equal(settle(intent, { ...twin, id: 9 }, { runs: [cancelled], head: sha('1') }).state, 'running');
  const byHand = settle(intent, cancelled, { runs: [cancelled], started: true, head: sha('1') });
  assert.equal(byHand.state, 'cancelled');
  assert.equal(exitCode(byHand), 2);
  assert.equal(settle(intent, cancelled, { runs: [cancelled], head: sha('1') }).state, 'recover');
});

test('exit codes: 0 running or passing, 1 refused or failing, 2 no verdict yet', () => {
  assert.equal(exitCode({ state: 'running' }), 0);
  assert.equal(exitCode({ state: 'superseded' }), 0);
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

test('the CLI refuses unknown commands with exit 1', () => {
  const lines = [];
  assert.equal(main(['nonsense'], { api: () => ({ ok: false }), print: (l) => lines.push(JSON.parse(l)) }), 1);
  assert.equal(lines[0].state, 'refused');
});
