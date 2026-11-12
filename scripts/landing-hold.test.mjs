// gate: build
// guards: scripts/landing-hold.mjs, .github/workflows/landing-hold.yml, .github/workflows/ci.yml
// measures: none - an in-memory issue store standing in for GitHub, and the workflows' own text
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ATTEMPTS, LABEL, check, confirm, main, makeApi, readHold, set } from './landing-hold.mjs';

const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/landing-hold.yml', import.meta.url), 'utf8');
const REPO = 'NoaCG/fixture';
const noSleep = async () => {};

// A tiny GitHub: issues with labels, comments, and a switch that makes every call fail.
function github({ fail = 0, answer } = {}) {
  const store = { issues: [], comments: [], labels: [], calls: 0, failures: fail };
  let next = 1;
  const reply = (status, data) => ({ ok: status < 300, status, text: async () => (data === undefined ? '' : JSON.stringify(data)) });
  const fetch = async (url, init) => {
    store.calls += 1;
    if (store.failures > 0) { store.failures -= 1; throw new Error('network down'); }
    assert.equal(init.headers.authorization, 'Bearer t');
    const { pathname, searchParams } = new URL(url);
    const route = pathname.replace(`/repos/${REPO}`, '');
    const body = init.body ? JSON.parse(init.body) : null;
    if (init.method === 'GET' && route === '/issues') {
      if (answer !== undefined) return reply(200, answer);
      const label = searchParams.get('labels');
      return reply(200, store.issues.filter((i) => i.state === 'open' && i.labels.some((l) => l.name === label)));
    }
    if (init.method === 'POST' && route === '/labels') {
      if (store.labels.includes(body.name)) return reply(422, { message: 'already_exists' });
      store.labels.push(body.name);
      return reply(201, {});
    }
    if (init.method === 'POST' && route === '/issues') {
      const issue = { number: next++, state: 'open', title: body.title, body: body.body, labels: body.labels.map((name) => ({ name })), html_url: `https://github.com/${REPO}/issues/${next - 1}`, created_at: '2026-11-12T00:00:00Z' };
      store.issues.push(issue);
      return reply(201, issue);
    }
    const match = /^\/issues\/(\d+)(\/comments)?$/.exec(route);
    if (match) {
      const issue = store.issues.find((i) => i.number === Number(match[1]));
      if (match[2]) { store.comments.push({ number: issue.number, body: body.body }); return reply(201, {}); }
      Object.assign(issue, body);
      return reply(200, issue);
    }
    return reply(404, { message: 'not found' });
  };
  return { store, api: makeApi({ fetch, token: 't', repo: REPO, sleep: noSleep }), fetch };
}

const request = { actor: 'owner-login', reason: 'live window', runUrl: 'https://example.invalid/run/1' };

test('R1/R5: no hold issue reads off, and the gate passes', async () => {
  const { api } = github();
  assert.deepEqual(await check(api), { code: 0, lines: ['Landing hold: off.'] });
});

test('R1/R3: on names who set it, why and the issue; the gate fails', async () => {
  const { api, store } = github();
  await set(api, { state: 'on', ...request });
  assert.equal(store.issues.length, 1);
  assert.deepEqual(store.labels, [LABEL]);
  const { code, lines } = await check(api);
  assert.equal(code, 1);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^::error title=CI gate::Landing hold: set by owner-login, reason: live window\. https:\/\/github\.com\/NoaCG\/fixture\/issues\/1\./);
});

test('R1: a pull request carrying the label, or a closed issue, is not a hold', async () => {
  const { api } = github({ answer: [{ number: 9, state: 'open', pull_request: {}, labels: [{ name: LABEL }] }] });
  assert.equal((await readHold(api)).on, false);
});

test('R1/R3: an issue labelled by hand holds, and names whoever opened it', async () => {
  const { api } = github({ answer: [{ number: 3, state: 'open', body: 'stop', user: { login: 'someone' }, labels: [{ name: LABEL }], html_url: 'u3' }] });
  const { code, lines } = await check(api);
  assert.equal(code, 1);
  assert.match(lines[0], /Landing hold: set by someone \(opened the issue by hand\), reason: none given\. u3\./);
});

test('R4: unreadable state fails closed, after every attempt', async () => {
  const down = github({ fail: 99 });
  const result = await check(down.api);
  assert.equal(result.code, 1);
  assert.match(result.lines[0], /^::error title=CI gate::Landing hold state could not be read \(network down \(after 3 attempts\)\)/);
  assert.equal(down.store.calls, ATTEMPTS);
  for (const answer of [{ message: 'oops' }, null, 'text']) {
    const odd = github({ answer });
    assert.match((await check(odd.api)).lines[0], /could not be read/);
  }
});

test('R4: a transient failure inside the attempts still reads the state', async () => {
  const { api } = github({ fail: ATTEMPTS - 1 });
  assert.equal((await check(api)).code, 0);
});

test('R7: a write is tried once, so a timed-out create never opens a second hold', async () => {
  const { api, store } = github();
  store.failures = 1;
  await assert.rejects(api('POST', '/issues', { title: 'x', body: '', labels: [] }), /network down \(after 1 attempt\)/);
  assert.equal(store.calls, 1);
});

test('R4: no token or no repository fails closed in the gate', async () => {
  const lines = [];
  assert.equal(await main(['check'], { GITHUB_REPOSITORY: REPO }, { fetch: github().fetch, out: (l) => lines.push(l) }), 1);
  assert.match(lines[0], /could not be read \(no GitHub token/);
  assert.equal(await main(['check'], { GITHUB_TOKEN: 't' }, { fetch: github().fetch, out: (l) => lines.push(l) }), 1);
  assert.match(lines[1], /could not be read \(no repository/);
});

test('R7: on is idempotent and records the latest setter; off closes every hold with who and why', async () => {
  const { api, store } = github();
  await set(api, { state: 'on', ...request });
  await set(api, { state: 'on', ...request, actor: 'coordinator-login', reason: 'landing freeze' });
  assert.equal(store.issues.length, 1);
  assert.match((await check(api)).lines[0], /set by coordinator-login, reason: landing freeze/);
  // A second hold opened by hand: on rewrites both, off closes both.
  store.issues.push({ ...store.issues[0], number: 7, body: 'by hand' });
  await set(api, { state: 'on', ...request, reason: 'still held' });
  assert.ok((await check(api)).lines.every((line) => /reason: still held/.test(line)));
  const lifted = await set(api, { state: 'off', ...request, reason: 'window over' });
  assert.deepEqual(lifted.numbers, [1, 7]);
  assert.ok(store.issues.every((i) => i.state === 'closed'));
  assert.ok(store.comments.some((c) => c.body.startsWith('Lifted by owner-login: window over')));
  assert.equal((await check(api)).code, 0);
  assert.deepEqual(await set(api, { state: 'off', ...request }), { changed: false, numbers: [] });
});

test('R7: a reason and a known state are required; multi-line reasons stay one line', async () => {
  const { api, store } = github();
  await assert.rejects(set(api, { state: 'on', ...request, reason: '  ' }), /reason is required/);
  await assert.rejects(set(api, { state: 'maybe', ...request }), /state must be/);
  await set(api, { state: 'on', ...request, reason: 'line one\nline two' });
  assert.match(store.issues[0].body, /^Reason: line one line two$/m);
  assert.equal(store.issues.length, 1);
});

test('R8: the workflow reads the hold back and fails when it does not match', async () => {
  const { api } = github();
  await assert.rejects(confirm(api, 'on', { tries: 2, sleep: noSleep }), /does not read 'on'/);
  await set(api, { state: 'on', ...request });
  assert.equal((await confirm(api, 'on', { sleep: noSleep })).on, true);
});

test('R2/R6: the gate reads the hold in its own job on pull requests, merge groups and branch dispatches, not on main pushes', () => {
  const gate = ci.slice(ci.indexOf('  gate:\n'), ci.indexOf('  after-gate:\n'));
  assert.match(gate, /name: CI gate/);
  assert.match(gate, /issues: read/);
  const step = gate.slice(gate.indexOf('- name: Landing hold'));
  assert.match(step, /run: node scripts\/landing-hold\.mjs check/);
  assert.match(step, /if: \$\{\{ !cancelled\(\) && \(github\.event_name == 'pull_request' \|\| github\.event_name == 'merge_group' \|\| \(github\.event_name == 'workflow_dispatch' && github\.ref != 'refs\/heads\/main'\)\) \}\}/);
});

test('R7: the workflow is dispatch-only, takes a state and a required reason, and never cancels a run', () => {
  assert.match(workflow, /^on:\n {2}workflow_dispatch:\n/m);
  assert.doesNotMatch(workflow, /^ {2}(schedule|push|pull_request):/m);
  assert.match(workflow, /reason:\n(?: {8}.*\n)*? {8}required: true/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /issues: write/);
  assert.match(workflow, /run: node scripts\/landing-hold\.mjs set "\$STATE"/);
});
