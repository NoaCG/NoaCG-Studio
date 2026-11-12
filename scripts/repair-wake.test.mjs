// guards: scripts/repair-wake.mjs, scripts/e2e-capacity.mjs, .github/workflows/ci.yml, scripts/alarm-owner.mjs, scripts/growth-report.mjs, scripts/growth-ceilings.json, .github/workflows/post-land.yml, .agent-workflows/plan-run.md
// A red PR nobody is repairing reaches the owner alarm (cicd-followup cf22 fix 1). Each case is
// stated from the Rules in docs/work-specs/cicd-followup/evidence/cf22-fix-1-repair-wake.md, with
// its expected outcome written by hand, against a fake GitHub; no network. The first cases replay
// the four long idle stretches cf22 measured (#1840, #2218, #2227, #2374) from their real times.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { ownedAlarmTitles } from './alarm-owner.mjs';
import { BOUND_MINUTES, budgetedGh, failureOf, keysIn, MAX_CALLS, nextAlarm, ownerKindsIn, ownerText, raise, RED_ISSUE, runCheck } from './repair-wake.mjs';

const CEILINGS = JSON.parse(readFileSync(new URL('./growth-ceilings.json', import.meta.url), 'utf8'));
const plus = (iso, min) => new Date(Date.parse(iso) + min * 60_000).toISOString().replace('.000Z', 'Z');

const person = (at, body = 'looking at it') => ({ created_at: at, updated_at: at, body, user: { login: 'miwco', type: 'User' }, author_association: 'OWNER' });
const bot = (at, body = 'Codex Review: no issues') => ({ created_at: at, updated_at: at, body, user: { login: 'chatgpt-codex-connector[bot]', type: 'Bot' }, author_association: 'NONE' });
const ownerRecord = (at, text, updated = at) => ({ ...person(at, `<!-- noacg:repair-owner\nowner: ${text}\nrepair-attempts: 0\n-->`), updated_at: updated });

/** A PR run whose `CI gate` ended `gate` at `end`; started at `start` (its newest attempt). */
const prRun = ({ id, sha, start, end, gate = 'failure', conclusion = gate === 'success' ? 'success' : 'failure', status = 'completed', attempt = 1, event = 'pull_request', attemptStart = start }) => ({
  run: { id, head_sha: sha, event, status, conclusion: status === 'completed' ? conclusion : null, created_at: start, run_started_at: attemptStart, updated_at: end, run_attempt: attempt, html_url: `https://github.com/x/actions/runs/${id}` },
  jobs: [{ name: 'Build', conclusion: 'success', completed_at: end }, { name: 'Reviewed', conclusion: 'success', completed_at: end }, { name: 'CI gate', conclusion: gate, completed_at: end }],
});
/** A merge-group run; `gate` is its `CI gate` (a red `Reviewed` alone leaves the gate green). */
const groupRun = ({ id, pr, start, end, conclusion = 'failure', status = 'completed', gate = conclusion }) => ({
  id, event: 'merge_group', run_attempt: 1, run_started_at: start, jobs: [{ name: 'Reviewed', conclusion, completed_at: end }, { name: 'CI gate', conclusion: gate, completed_at: end }], head_branch: `gh-readonly-queue/main/pr-${pr}-0123abcd`, status, conclusion: status === 'completed' ? conclusion : null, created_at: start, updated_at: end, html_url: `https://github.com/x/actions/runs/${id}`,
});

/** A fake GitHub over `gh api` arguments: open PRs, ci.yml runs, jobs, comments and issues. It
 * reads `world` live, so a test changes what GitHub shows by changing it. */
function fakeGitHub(world = {}) {
  const { issues = [], fail = () => false } = world;
  const state = { issues: issues.map((i) => ({ state: 'open', assignees: [], user: { type: 'Bot' }, author_association: 'NONE', ...i })), posted: [], next: 900 };
  const run = (args) => {
    const [, , method, route] = args;
    const field = (name) => args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
    if (fail(route)) throw new Error('HTTP 502');
    const url = new URL(route, 'https://api.github.com/');
    const { prs = [], runs = [], groups = [], comments = {} } = world;
    const p = url.pathname;
    if (method === 'GET' && p.endsWith('/pulls')) return JSON.stringify(prs.map((x) => ({ draft: false, ...x, head: { sha: x.sha } })));
    if (method === 'GET' && p.endsWith('/actions/workflows/ci.yml/runs')) {
      if (url.searchParams.get('event') === 'merge_group') {
        const from = Date.parse(url.searchParams.get('created').slice(2)), page = Number(url.searchParams.get('page') ?? 1);
        const inWindow = groups.filter((g) => Date.parse(g.created_at) >= from);
        return JSON.stringify({ workflow_runs: inWindow.slice((page - 1) * 100, page * 100) });
      }
      const sha = url.searchParams.get('head_sha');
      return JSON.stringify({ workflow_runs: runs.filter((r) => r.run.head_sha === sha).map((r) => r.run) });
    }
    let m;
    if (method === 'GET' && (m = /\/actions\/runs\/(\d+)\/attempts\/\d+\/jobs$/.exec(p))) return JSON.stringify({ jobs: (runs.find((r) => r.run.id === Number(m[1])) ?? groups.find((g) => g.id === Number(m[1]))).jobs });
    if (method === 'GET' && (m = /\/check-runs\/([^/]+)\/annotations$/.exec(p))) return JSON.stringify(world.annotations?.[m[1]] ?? []);
    if (method === 'GET' && (m = /\/actions\/runs\/(\d+)$/.exec(p))) {
      const found = runs.find((r) => r.run.id === Number(m[1]))?.run ?? groups.find((g) => g.id === Number(m[1]));
      if (!found) throw new Error('HTTP 404');
      return JSON.stringify(found);
    }
    if (method === 'GET' && (m = /\/issues\/(\d+)\/comments$/.exec(p))) return JSON.stringify(Number(url.searchParams.get('page') ?? 1) === 1 ? comments[m[1]] ?? [] : []);
    if (method === 'GET' && p.endsWith('/issues')) {
      const page = Number(url.searchParams.get('page') ?? 1), size = Number(url.searchParams.get('per_page') ?? 30);
      const listed = state.issues.filter((i) => i.state === (url.searchParams.get('state') ?? 'open')).reverse();
      return JSON.stringify(listed.slice((page - 1) * size, page * size));
    }
    if (method === 'POST' && p.endsWith('/issues')) {
      const made = { number: state.next++, title: field('title'), body: field('body'), state: 'open', assignees: [], user: { type: 'Bot' }, author_association: 'NONE' };
      state.issues.push(made);
      state.posted.push(['open', made.number]);
      return JSON.stringify(made);
    }
    if (method === 'PATCH' && (m = /\/issues\/(\d+)$/.exec(p))) {
      const i = state.issues.find((x) => x.number === Number(m[1]));
      if (field('body') !== undefined) { i.body = field('body'); state.posted.push(['edit', i.number]); }
      if (field('state')) i.state = field('state');
      return JSON.stringify(i);
    }
    if (method === 'POST' && (m = /\/issues\/(\d+)\/comments$/.exec(p))) { state.posted.push(['comment', Number(m[1]), field('body')]); return '{}'; }
    if (method === 'POST' && (m = /\/issues\/(\d+)\/assignees$/.exec(p))) {
      const i = state.issues.find((x) => x.number === Number(m[1]));
      const login = field('assignees[]');
      i.assignees = [{ login }];
      return JSON.stringify({ number: i.number, assignees: i.assignees });
    }
    throw new Error(`unexpected ${method} ${route}`);
  };
  return { run, state };
}

/** The notifications a check sent: issues opened and comments, not body edits. */
const notices = (gh) => gh.state.posted.filter((p) => p[0] !== 'edit').map((p) => p[0]);

/** One check, as the workflow runs it: sweep within the budget, then raise. */
function check(gh, now) {
  const r = runCheck({ now, ceilings: CEILINGS, issue: true, repo: 'NoaCG/NoaCG-Studio', run: gh.run });
  return { ...r, alarm: gh.state.issues.find((i) => i.title === RED_ISSUE && i.state === 'open') };
}

// The four long idle stretches of cf22 section 3.4, each as it stood after its failure.
const REPLAY = {
  1840: () => ({ prs: [{ number: 1840, sha: 'a1840' }], runs: [prRun({ id: 1, sha: 'a1840', start: '2026-10-31T06:06:40Z', end: '2026-10-31T06:10:30Z', gate: 'success' })], groups: [groupRun({ id: 41175546812, pr: 1840, start: '2026-10-31T06:10:55Z', end: '2026-10-31T06:13:39Z' })], comments: { 1840: [bot('2026-10-31T06:06:38Z')] }, failure: '2026-10-31T06:13:39Z' }),
  2218: () => ({ prs: [{ number: 2218, sha: 'c2bf443a' }], runs: [prRun({ id: 42032378756, sha: 'c2bf443a', start: '2026-11-05T13:30:00Z', end: '2026-11-05T13:50:15Z' })], comments: { 2218: [bot('2026-11-05T13:03:37Z')] }, failure: '2026-11-05T13:50:15Z' }),
  2227: () => ({ prs: [{ number: 2227, sha: '20660ea4' }], runs: [prRun({ id: 42052718464, sha: '20660ea4', start: '2026-11-05T15:15:00Z', end: '2026-11-05T15:30:09Z' })], comments: { 2227: [person('2026-11-05T15:33:40Z', 'E2E 11/15 failed 3 tests this PR does not touch'), person('2026-11-05T15:39:33Z', 'these failures belong to main')] }, failure: '2026-11-05T15:30:09Z' }),
  2374: () => ({ prs: [{ number: 2374, sha: 'cb0f639a' }], runs: [prRun({ id: 42964189955, sha: 'cb0f639a', start: '2026-11-11T05:12:00Z', end: '2026-11-11T05:28:01Z' })], comments: { 2374: [bot('2026-11-11T04:50:08Z'), ownerRecord('2026-11-11T04:50:31Z', 'Active Codex Cloud coordinator')] }, failure: '2026-11-11T05:28:01Z' }),
};

test('replay: #1840 alarms at the next check, #2218 and #2374 60 minutes after the failure, #2227 60 minutes after its owner last commented', () => {
  // [PR, quoted owner, minutes after the failure before which no alarm, after which one]
  for (const [pr, expected, quietFrom] of [['1840', 'none recorded', 0], ['2218', 'none recorded', 0], ['2374', 'Active Codex Cloud coordinator', 0], ['2227', null, 9]]) {
    const fx = REPLAY[pr]();
    const bound = pr === '1840' ? 0 : BOUND_MINUTES;
    if (bound) assert.equal(check(fakeGitHub(fx), plus(fx.failure, quietFrom + bound - 1)).alarm, undefined, `#${pr}: no alarm before the bound`);
    const gh = fakeGitHub(fx);
    const after = check(gh, plus(fx.failure, quietFrom + bound + 1));
    assert.ok(after.alarm, `#${pr}: alarmed`);
    if (expected === null) { assert.match(after.alarm.body, /#2227: CI gate red on the PR run since 2026-11-05 15:30 UTC, last action 2026-11-05 15:39 UTC/); continue; }
    assert.match(after.alarm.body, new RegExp(`#${pr}: CI gate red on the ${pr === '1840' ? 'merge group' : 'PR run'} since ${fx.failure.slice(0, 16).replace('T', ' ')} UTC`));
    assert.match(after.alarm.body, new RegExp(`repair owner: ${expected}`));
    assert.deepEqual(after.alarm.assignees.map((a) => a.login), ['miwco'], 'routed to the owner the ceilings file records');
  }
});

test('rule 1: only a finished red CI gate, or a newer finished red merge group, is red', () => {
  const now = '2026-11-11T12:00:00Z', t = '2026-11-11T10:00:00Z';
  const cases = [
    ['a red Reviewed beside a green CI gate is review wait', [prRun({ id: 1, sha: 's', start: t, end: t, gate: 'success', conclusion: 'failure' })], [], false],
    ['a run still going is no verdict', [prRun({ id: 1, sha: 's', start: t, end: t, status: 'in_progress' })], [], false],
    ['a cancelled run (superseded) is no verdict', [prRun({ id: 1, sha: 's', start: t, end: t, gate: 'cancelled', conclusion: 'cancelled' })], [], false],
    ['a timed-out CI gate is red', [prRun({ id: 1, sha: 's', start: t, end: t, gate: 'timed_out' })], [], true],
    ['a red gate is red', [prRun({ id: 1, sha: 's', start: t, end: t })], [], true],
    ['a newer green merge group speaks for the PR', [prRun({ id: 1, sha: 's', start: t, end: t })], [groupRun({ id: 2, pr: 7, start: plus(t, 5), end: plus(t, 9), conclusion: 'success' })], false],
    ['a merge group still running is no verdict', [prRun({ id: 1, sha: 's', start: t, end: t, gate: 'success' })], [groupRun({ id: 2, pr: 7, start: plus(t, 5), end: plus(t, 9), status: 'in_progress' })], false],
    ['a newer red merge group is red', [prRun({ id: 1, sha: 's', start: t, end: t, gate: 'success' })], [groupRun({ id: 2, pr: 7, start: plus(t, 5), end: plus(t, 9) })], true],
    ['a merge group with only Reviewed red is review wait', [prRun({ id: 1, sha: 's', start: t, end: t, gate: 'success' })], [groupRun({ id: 2, pr: 7, start: plus(t, 5), end: plus(t, 9), gate: 'success' })], false],
    ['an older red merge group is answered by the newer PR run', [prRun({ id: 1, sha: 's', start: plus(t, 20), end: plus(t, 30), gate: 'success' })], [groupRun({ id: 2, pr: 7, start: t, end: plus(t, 5) })], false],
    ['another PR\'s red merge group is not this PR\'s', [prRun({ id: 1, sha: 's', start: t, end: t, gate: 'success' })], [groupRun({ id: 2, pr: 8, start: plus(t, 5), end: plus(t, 9) })], false],
  ];
  for (const [what, runs, groups, red] of cases) {
    const r = check(fakeGitHub({ prs: [{ number: 7, sha: 's' }], runs, groups }), now);
    assert.equal(Boolean(r.alarm), red, what);
  }
  assert.equal(failureOf({ run: { id: 1, status: 'in_progress', conclusion: null }, gate: { conclusion: 'failure', completed_at: t } }), null, 'a re-run under way shows the old gate as a copy: no verdict yet');
  const draft = check(fakeGitHub({ prs: [{ number: 7, sha: 's', draft: true }], runs: [prRun({ id: 1, sha: 's', start: '2026-11-11T10:00:00Z', end: '2026-11-11T10:00:00Z' })] }), now);
  assert.equal(draft.alarm, undefined, 'a draft is not ready');
  const otherHead = check(fakeGitHub({ prs: [{ number: 7, sha: 'new' }], runs: [prRun({ id: 1, sha: 'old', start: t, end: t })] }), now);
  assert.equal(otherHead.alarm, undefined, 'a push after the failure: the red run is not on the head');
  const staleGroup = check(fakeGitHub({ prs: [{ number: 7, sha: 'new' }], runs: [prRun({ id: 1, sha: 'old', start: t, end: t, gate: 'success' })], groups: [groupRun({ id: 2, pr: 7, start: plus(t, 5), end: plus(t, 9) })] }), now);
  assert.equal(staleGroup.alarm, undefined, 'a push after a merge-group failure, its PR run not started yet: the group was about the old head');
});

test('rule 3: a push, a re-run, a person\'s comment or an edit of the owner record is an action; a bot\'s comment is not', () => {
  const t = '2026-11-11T10:00:00Z', now = plus(t, 61);
  const red = (extra = {}) => ({ prs: [{ number: 7, sha: 's' }], runs: [prRun({ id: 1, sha: 's', start: plus(t, -15), end: t, ...extra })] });
  const alarmed = (fx) => Boolean(check(fakeGitHub(fx), now).alarm);
  assert.equal(alarmed({ ...red(), comments: { 7: [bot(plus(t, 5))] } }), true, 'a bot comment is no action');
  assert.equal(alarmed({ ...red(), comments: { 7: [{ ...bot(plus(t, 5)), author_association: 'COLLABORATOR' }] } }), true, 'nor is an app\'s with write access');
  assert.equal(alarmed({ ...red(), comments: { 7: [person(plus(t, -5))] } }), true, 'a comment before the failure is no action on it');
  assert.equal(alarmed({ ...red(), comments: { 7: [person(plus(t, 5))] } }), false, 'a person commented after the failure');
  assert.equal(alarmed({ ...red(), comments: { 7: [{ ...person(plus(t, 5)), author_association: 'NONE' }] } }), true, 'an outsider is not the repair');
  assert.equal(alarmed({ ...red(), comments: { 7: [ownerRecord(plus(t, -30), 'session x', plus(t, 10))] } }), false, 'the owner record was updated after the failure');
  assert.equal(alarmed({ ...red({ attempt: 2, attemptStart: plus(t, 10) }) }), false, 'a later attempt re-ran other jobs: the gate shown is a copy');
});

test('rule 6: no repair owner and no worker left (a merge-group failure, a bot\'s PR) alarms at the next check; otherwise 60 minutes', () => {
  const t = '2026-11-11T10:00:00Z';
  const pr = (user) => ({ prs: [{ number: 7, sha: 's', user }], runs: [prRun({ id: 1, sha: 's', start: plus(t, -15), end: t })] });
  assert.ok(check(fakeGitHub(pr({ login: 'app[bot]', type: 'Bot' })), plus(t, 1)).alarm, 'a bot\'s PR with no owner');
  assert.equal(check(fakeGitHub(pr({ login: 'miwco', type: 'User' })), plus(t, 59)).alarm, undefined, 'a worker may still be on it');
  const answered = { ...pr({ login: 'app[bot]', type: 'Bot' }), comments: { 7: [person(plus(t, 1))] } };
  assert.equal(check(fakeGitHub(answered), plus(t, 4)).alarm, undefined, 'a person acted: the bound runs from that action');
  assert.ok(check(fakeGitHub(answered), plus(t, 62)).alarm, '... and then it is unattended again');
  const owned = { ...pr({ login: 'app[bot]', type: 'Bot' }), comments: { 7: [ownerRecord(plus(t, -30), 'the coordinator')] } };
  assert.equal(check(fakeGitHub(owned), plus(t, 59)).alarm, undefined, 'a bot\'s PR with an owner gets the owner\'s 60 minutes');
  const group = { prs: [{ number: 7, sha: 's' }], runs: [prRun({ id: 1, sha: 's', start: plus(t, -30), end: plus(t, -20), gate: 'success' })], groups: [groupRun({ id: 2, pr: 7, start: plus(t, -10), end: t })] };
  assert.ok(check(fakeGitHub(group), plus(t, 1)).alarm, 'an unowned merge-group failure');
  assert.equal(check(fakeGitHub({ ...group, comments: { 7: [ownerRecord(plus(t, -40), 'x')] } }), plus(t, 59)).alarm, undefined, 'an owned merge-group failure gets 60 minutes');
});

test('rule 4: the newest owner record by a member or bot is quoted, safely; an outsider\'s is not an owner', () => {
  const t = '2026-11-11T10:00:00Z', now = plus(t, 61);
  const fx = (c) => ({ prs: [{ number: 7, sha: 's' }], runs: [prRun({ id: 1, sha: 's', start: plus(t, -15), end: t })], comments: { 7: c } });
  const outsider = { ...ownerRecord(plus(t, -40), 'me'), author_association: 'NONE' };
  assert.match(check(fakeGitHub(fx([outsider])), now).alarm.body, /repair owner: none recorded/);
  const body = check(fakeGitHub(fx([ownerRecord(plus(t, -50), 'old session'), ownerRecord(plus(t, -40), 'new session')])), now).alarm.body;
  assert.match(body, /repair owner: new session/);
  assert.doesNotMatch(body, /old session/);
  assert.equal(ownerText({ body: '<!-- noacg:repair-owner\nowner: `@codex` <b>x</b>\n-->' }), 'codex bx/b', 'no mention, no markup');
  assert.equal(ownerText({ body: '<!-- noacg:repair-owner\nowner: a <script>alert(1)</script> b -->' }), 'a scriptalert(1)/script b', 'no tag can survive');
  assert.equal(ownerText({ body: '<!-- noacg:repair-owner owner: session x (row L) -->' }), 'session x (row L)', 'a one-line record ends at its marker');
  assert.equal(ownerText({ body: `<!-- noacg:repair-owner\nowner: ${'y'.repeat(200)}\n-->` }).length, 120);
});

test('rules 6 to 8: one alarm per failure, none for old history, withdrawn only by a complete check', () => {
  const t = '2026-11-11T10:00:00Z';
  const fx = { prs: [{ number: 7, sha: 's' }], runs: [prRun({ id: 1, sha: 's', start: plus(t, -15), end: t })] };
  const gh = fakeGitHub(fx);
  check(gh, plus(t, 61));
  check(gh, plus(t, 81));
  check(gh, plus(t, 60 * 30));
  assert.deepEqual(notices(gh), ['open'], 'one alarm for one failure, however many checks see it, and kept past 24 hours while unattended');
  assert.equal(gh.state.issues[0].assignees[0].login, 'miwco');

  // A second failure on another PR adds one comment to the open issue; seen again, nothing more.
  fx.prs.push({ number: 8, sha: 'u' });
  fx.runs.push(prRun({ id: 2, sha: 'u', start: plus(t, 100), end: plus(t, 110) }));
  check(gh, plus(t, 175));
  check(gh, plus(t, 195));
  assert.deepEqual(notices(gh), ['open', 'comment']);
  assert.match(gh.state.posted.find((p) => p[0] === 'comment')[2], /#8: CI gate red/);
  assert.doesNotMatch(gh.state.posted.find((p) => p[0] === 'comment')[2], /#7:/);

  // Answered, then quiet again: still the same failure, listed apart, never alarmed twice.
  fx.comments = { 7: [person(plus(t, 200), 'still on it')] };
  const answered = check(gh, plus(t, 205));
  assert.match(answered.alarm.body, /Attended to since the alarm[\s\S]*#7:/);
  check(gh, plus(t, 300));
  check(gh, plus(t, 400));
  assert.deepEqual(notices(gh), ['open', 'comment'], 'no second alarm for #7 when it goes quiet again');
  assert.equal(gh.state.issues[0].state, 'open', 'still red: kept open and remembered');

  // A failed read keeps both listed lines and closes nothing, even though #8 was answered too.
  fx.comments = { 7: [person(plus(t, 200))], 8: [person(plus(t, 200))] };
  const failing = fakeGitHub(fx);
  failing.state.issues = gh.state.issues;
  failing.state.posted = gh.state.posted;
  const partial = { ...failing, run: (args) => { if (/head_sha=s/.test(args[3])) throw new Error('HTTP 502'); return failing.run(args); } };
  const r = check(partial, plus(t, 210));
  assert.equal(r.complete, false);
  assert.equal(r.alarm.state, 'open');
  assert.match(r.alarm.body, /#7:/);

  // Both answered but still red: open, nothing new. A new verdict on both (pushes) closes it once.
  check(failing, plus(t, 420));
  assert.equal(gh.state.issues[0].state, 'open');
  fx.prs = [{ number: 7, sha: 's2' }, { number: 8, sha: 'u2' }];
  fx.runs.push(prRun({ id: 5, sha: 's2', start: plus(t, 430), end: plus(t, 445), gate: 'success' }), prRun({ id: 6, sha: 'u2', start: plus(t, 430), end: plus(t, 445), status: 'in_progress' }));
  const done = check(failing, plus(t, 450));
  assert.equal(done.alarm, undefined);
  assert.equal(gh.state.issues[0].state, 'closed');
  assert.deepEqual(notices(gh), ['open', 'comment', 'comment']);

  // History: a failure first seen more than a day after it happened raises nothing.
  const old = fakeGitHub({ prs: [{ number: 9, sha: 'v' }], runs: [prRun({ id: 3, sha: 'v', start: plus(t, -15), end: t })] });
  assert.equal(check(old, plus(t, 60 * 25)).alarm, undefined);
});

test('rule 9: an incomplete check never withdraws an alarm, whichever read failed', () => {
  const t = '2026-11-11T10:00:00Z';
  for (const failing of [/head_sha=s/, /issues\/7\/comments/]) {
    const fx = { prs: [{ number: 7, sha: 's' }], runs: [prRun({ id: 1, sha: 's', start: plus(t, -15), end: t })] };
    const gh = fakeGitHub(fx);
    check(gh, plus(t, 61));
    const broken = { ...gh, run: (args) => { if (args[2] === 'GET' && failing.test(args[3])) throw new Error('HTTP 502'); return gh.run(args); } };
    const r = check(broken, plus(t, 120));
    assert.equal(r.complete, false, String(failing));
    assert.equal(gh.state.issues[0].state, 'open', `${failing}: not closed`);
    assert.match(gh.state.issues[0].body, /#7: CI gate red/, `${failing}: the line is kept`);
  }
});

test('rule 9: a PR with more comments than a check reads is not judged, and the check is incomplete', () => {
  const t = '2026-11-11T10:00:00Z';
  const gh = fakeGitHub({ prs: [{ number: 7, sha: 's' }], runs: [prRun({ id: 1, sha: 's', start: plus(t, -15), end: t })] });
  const many = { ...gh, run: (args) => (/issues\/7\/comments/.test(args[3]) ? JSON.stringify(Array.from({ length: 100 }, () => bot(plus(t, -60)))) : gh.run(args)) };
  const r = check(many, plus(t, 61));
  assert.equal(r.complete, false);
  assert.equal(r.alarm, undefined, 'an unread comment could be the action');
});

test('rule 8: a listed merge-group failure stays listed after it leaves the two-day run listing', () => {
  const t = '2026-11-11T10:00:00Z';
  const gh = fakeGitHub({ prs: [{ number: 7, sha: 's' }], runs: [prRun({ id: 1, sha: 's', start: plus(t, -30), end: plus(t, -20), gate: 'success' })], groups: [groupRun({ id: 2, pr: 7, start: plus(t, -10), end: t })] });
  check(gh, plus(t, 1));
  const later = check(gh, plus(t, 60 * 50));
  assert.equal(later.complete, true);
  assert.equal(later.alarm?.state, 'open', 'still red, still listed');
  assert.match(later.alarm.body, /#7: CI gate red on the merge group/);
});

test('rule 8: an owner who closes the alarm by hand is not alarmed again for the same failures', () => {
  const t = '2026-11-11T10:00:00Z';
  const fx = { prs: [{ number: 7, sha: 's' }], runs: [prRun({ id: 1, sha: 's', start: plus(t, -15), end: t })] };
  const gh = fakeGitHub(fx);
  check(gh, plus(t, 61));
  gh.state.issues[0].state = 'closed';
  check(gh, plus(t, 81));
  check(gh, plus(t, 101));
  assert.deepEqual(notices(gh), ['open'], 'remembered from the closed issue');
  fx.prs.push({ number: 8, sha: 'u' });
  fx.runs.push(prRun({ id: 2, sha: 'u', start: plus(t, 90), end: plus(t, 100) }));
  const r = check(gh, plus(t, 161));
  assert.deepEqual(notices(gh), ['open', 'open'], 'a new failure opens a new alarm');
  assert.match(r.alarm.body, /#7:[\s\S]*#8:/, 'listing the remembered one too');
});

test('rule 8: the closed alarm is found past the first page of closed issues; an outsider\'s look-alike is not memory; unread memory raises nothing new', () => {
  const t = '2026-11-11T10:00:00Z';
  const fx = { prs: [{ number: 7, sha: 's' }], runs: [prRun({ id: 1, sha: 's', start: plus(t, -15), end: t })] };
  const filler = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ number: 5000 + i, title: `Other ${i}`, body: '', state: 'closed', ...extra }));
  // The owner closed the alarm, then 150 other issues closed after it.
  const gh = fakeGitHub(fx);
  check(gh, plus(t, 61));
  gh.state.issues[0].state = 'closed';
  gh.state.issues.push(...filler(150));
  assert.equal(check(gh, plus(t, 81)).complete, true, 'the memory was read, not given up on');
  assert.deepEqual(notices(gh), ['open'], 'found on the second page: remembered');

  // An outsider's closed issue with the title and a copied key is not the alarm's memory.
  const out = fakeGitHub({ ...fx, issues: [{ number: 40, title: RED_ISSUE, state: 'closed', body: '- x <!-- key: 7/1/1/2026-11-11T10:00:00Z -->', user: { type: 'User' }, author_association: 'NONE' }] });
  check(out, plus(t, 61));
  assert.deepEqual(notices(out), ['open'], 'alarmed despite the look-alike');

  // Three full pages of newer closed issues and no alarm among them: memory unread, nothing raised.
  const busy = fakeGitHub({ ...fx, issues: filler(300) });
  const r = check(busy, plus(t, 61));
  assert.equal(r.complete, false);
  assert.deepEqual(notices(busy), [], 'an unread closed alarm could already hold this failure');
});

test('rule 8: failures listed by any alarm closed by hand in the last two days stay remembered, across reopenings and incomplete checks', () => {
  const t = '2026-11-11T10:00:00Z';
  const fx = { prs: [{ number: 7, sha: 's' }], runs: [prRun({ id: 1, sha: 's', start: plus(t, -15), end: t })] };
  const gh = fakeGitHub(fx);
  check(gh, plus(t, 61));
  gh.state.issues[0].state = 'closed'; // the owner closes alarm A, listing #7
  // #7's comments cannot be read in the next check, which opens alarm B for #8.
  fx.prs.push({ number: 8, sha: 'u' });
  fx.runs.push(prRun({ id: 2, sha: 'u', start: plus(t, 50), end: plus(t, 60) }));
  const broken = { ...gh, run: (args) => { if (/issues\/7\/comments/.test(args[3])) throw new Error('HTTP 502'); return gh.run(args); } };
  check(broken, plus(t, 121));
  gh.state.issues.find((i) => i.state === 'open').state = 'closed'; // and closes alarm B too
  check(gh, plus(t, 141));
  assert.deepEqual(notices(gh), ['open', 'open'], 'two failures, two alarms: #7 is not raised a third time');
});

test('rule 1: a new alarm needs an established verdict: with the merge-group listing unread, an older red PR run raises nothing', () => {
  const t = '2026-11-11T10:00:00Z';
  const fx = { prs: [{ number: 7, sha: 's' }], runs: [prRun({ id: 1, sha: 's', start: plus(t, -15), end: t })], groups: [groupRun({ id: 2, pr: 7, start: plus(t, 5), end: plus(t, 9), conclusion: 'success' })] };
  const gh = fakeGitHub(fx);
  const broken = { ...gh, run: (args) => { if (/event=merge_group/.test(args[3])) throw new Error('HTTP 502'); return gh.run(args); } };
  const r = check(broken, plus(t, 61));
  assert.equal(r.complete, false);
  assert.deepEqual(notices(gh), []);
});

test('rule 8: a route that did not take is tried again by later checks', () => {
  const t = '2026-11-11T10:00:00Z';
  const gh = fakeGitHub({ prs: [{ number: 7, sha: 's' }], runs: [prRun({ id: 1, sha: 's', start: plus(t, -15), end: t })] });
  let refuse = true;
  const flaky = { ...gh, run: (args) => { if (refuse && /assignees$/.test(args[3])) throw new Error('HTTP 503'); return gh.run(args); } };
  check(flaky, plus(t, 61));
  assert.deepEqual(gh.state.issues[0].assignees, []);
  refuse = false;
  check(flaky, plus(t, 81));
  assert.deepEqual(gh.state.issues[0].assignees.map((a) => a.login), ['miwco']);
  assert.deepEqual(notices(gh), ['open'], 'routing again sends no second alarm');
});

test('rule 8: a notice that failed is sent by the next check, not lost to the body that already lists it', () => {
  const t = '2026-11-11T10:00:00Z';
  const fx = { prs: [{ number: 7, sha: 's' }], runs: [prRun({ id: 1, sha: 's', start: plus(t, -15), end: t })] };
  const gh = fakeGitHub(fx);
  check(gh, plus(t, 61));
  fx.prs.push({ number: 8, sha: 'u' });
  fx.runs.push(prRun({ id: 2, sha: 'u', start: plus(t, 50), end: plus(t, 60) }));
  let refuse = true;
  const flaky = { ...gh, run: (args) => { if (refuse && args[2] === 'POST' && /\/comments$/.test(args[3])) throw new Error('HTTP 503'); return gh.run(args); } };
  assert.throws(() => check(flaky, plus(t, 121)), /503/, 'a failed notice fails the run, where it is seen');
  assert.doesNotMatch(gh.state.issues[0].body, /#8:/, 'and #8 is not yet remembered');
  refuse = false;
  check(flaky, plus(t, 141));
  assert.deepEqual(notices(gh), ['open', 'comment']);
  assert.match(gh.state.posted.find((p) => p[0] === 'comment')[2], /#8:/);
  assert.match(gh.state.issues[0].body, /#8:/);
});

test('rule 6: the bound is 60 minutes exactly', () => {
  const t = '2026-11-11T10:00:00Z';
  const fx = { prs: [{ number: 7, sha: 's' }], runs: [prRun({ id: 1, sha: 's', start: plus(t, -15), end: t })] };
  assert.ok(check(fakeGitHub(fx), plus(t, BOUND_MINUTES)).alarm, 'at 60 minutes');
});

test('rule 8: an unchanged list is not rewritten; a CRLF body edited on GitHub keeps its sections', () => {
  const t = '2026-11-11T10:00:00Z';
  const fx = { prs: [{ number: 7, sha: 's' }], runs: [prRun({ id: 1, sha: 's', start: plus(t, -15), end: t })] };
  const gh = fakeGitHub(fx);
  check(gh, plus(t, 61));
  check(gh, plus(t, 81));
  check(gh, plus(t, 101));
  assert.equal(gh.state.posted.filter((p) => p[0] === 'edit').length, 0, 'no edit when only the check time would change');
  const body = ['Owner: x.', '', '- #9: a <!-- key: 9/5/1/2026-11-11T09:00:00Z -->', '', 'Attended to since the alarm, still red (listed so they do not alarm again):', '', '- #8: b <!-- key: 8/4/1/2026-11-11T09:00:00Z attended -->'].join('\r\n');
  const next = nextAlarm({ entries: [], complete: false, previousBody: body });
  assert.deepEqual(next.unattended.map((l) => keysIn(l)), [['9/5/1/2026-11-11T09:00:00Z']]);
  assert.deepEqual(next.attended.map((l) => keysIn(l)), [['8/4/1/2026-11-11T09:00:00Z']]);
  assert.ok([...next.unattended, ...next.attended].every((l) => !l.includes('\r')), 'no stray carriage return');
});

test('rule 10: a busy two days of merge groups (over 100 runs) is read in pages, and the check stays complete', () => {
  const t = '2026-11-11T10:00:00Z';
  const groups = Array.from({ length: 150 }, (_, i) => groupRun({ id: 5000 + i, pr: 900 + i, start: plus(t, -i * 10), end: plus(t, -i * 10 + 5), conclusion: 'success' }));
  const r = check(fakeGitHub({ prs: [{ number: 7, sha: 's' }], runs: [prRun({ id: 1, sha: 's', start: t, end: t, gate: 'success' })], groups }), plus(t, 61));
  assert.equal(r.complete, true);
});

test('rule 9: a check spends at most 100 calls, and a spent budget is an incomplete check', () => {
  const t = '2026-11-11T10:00:00Z';
  const prs = Array.from({ length: 60 }, (_, i) => ({ number: 100 + i, sha: `s${i}` }));
  const runs = prs.map((p, i) => prRun({ id: 1000 + i, sha: p.sha, start: plus(t, -15), end: t }));
  const r = check(fakeGitHub({ prs, runs }), plus(t, 61));
  assert.ok(r.calls <= MAX_CALLS, `${r.calls} calls`);
  assert.equal(r.complete, false);
  const gh = budgetedGh(2, () => '[]');
  gh([]); gh([]);
  assert.throws(() => gh([]), /2-call budget is spent/);
});

test('rule 10: no recorded owner, no alarm and a loud failure', () => {
  assert.throws(() => raise({ entries: [], complete: true, now: 'x', ceilings: { owner: '' }, gh: () => '[]' }), /no owner or ownerLogin/);
});

test('the script loads with only scripts/ beside it: it imports nothing heavy', async () => {
  const { mkdtempSync, cpSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const dir = mkdtempSync(join(tmpdir(), 'repair-wake-'));
  try {
    cpSync(new URL('.', import.meta.url), join(dir, 'scripts'), { recursive: true });
    const out = execFileSync(process.execPath, ['scripts/repair-wake.mjs', 'nope'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, PATH: '' } }).toString();
    assert.fail(`expected the usage exit, got ${out}`);
  } catch (e) {
    assert.equal(e.status, 2, `loads and prints its usage, not a load error: ${e.stderr}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('rule 11: the weekly owner session lists this alarm with the others', async () => {
  assert.ok((await ownedAlarmTitles()).includes(RED_ISSUE));
});

test('the check runs in the existing post-land alarm job and at each plan-run check-in, with no workflow of its own', () => {
  const wf = readFileSync(new URL('../.github/workflows/post-land.yml', import.meta.url), 'utf8');
  // The same job as the delivery-age alarm: no new job and no new trigger, so no new runs to price.
  const job = /\n {2}ages:\n([\s\S]*?)(?=\n {2}[A-Za-z0-9_-]+:\n|$)/.exec(wf)?.[1] ?? '';
  assert.match(job, /growth-report\.mjs ages --issue/, 'the age alarm\'s job');
  assert.match(job, /node scripts\/repair-wake\.mjs check --issue/);
  assert.match(job, /continue-on-error: true\n(?:.*\n){0,4}\s+run: node scripts\/repair-wake\.mjs/, 'a failed check never turns a landing\'s post-land run red');
  assert.match(job, /actions: read/);
  assert.match(job, /issues: write/);
  assert.doesNotMatch(job, /pull-requests: write|contents: write|actions: write/, 'read-only on PRs');
  assert.match(wf, /^on:\n {2}push:\n {4}branches: \[main\]/m, 'main\'s code, after each landing');
  assert.match(wf, /^concurrency:\n {2}group: post-land\n {2}cancel-in-progress: false/m, 'one landing\'s check at a time, none cancelled mid-write');
  assert.ok(!existsSync(new URL('../.github/workflows/repair-wake.yml', import.meta.url)), 'no scheduled workflow: the overhead tier has no room for one');
  const checkIn = readFileSync(new URL('../.agent-workflows/plan-run.md', import.meta.url), 'utf8');
  assert.match(checkIn, /On every check-in[^\n]*node scripts\/repair-wake\.mjs check --issue/);
});

// cf22 fix 2: a refusal only the owner can move goes to the owner at once, not round the loop.
// Stated from docs/work-specs/cicd-followup/evidence/cf22-fix-2-owner-refusals.md, rules 3 to 7.

/** A red PR run whose `CI gate` job is `gateId`; `annotations[gateId]` is what the gate said. */
const refused = (o) => { const r = prRun(o); r.jobs[2].id = o.id * 10; return r; };
const needsOwner = (kinds, tail = '') => [{ annotation_level: 'failure', message: `Needs the owner (${kinds}): E2E capacity line - ${tail}` }];

test('fix 2 rule 4: only the fixed kinds are read from the gate, in the fixed form', () => {
  assert.deepEqual(ownerKindsIn(needsOwner('full:overhead,stopped:offline')), ['full:overhead', 'stopped:offline']);
  assert.deepEqual(ownerKindsIn(needsOwner('full:overhead,ping @all,full:moon,revision')), ['full:overhead', 'revision'], 'anything else is dropped');
  assert.deepEqual(ownerKindsIn([{ message: 'E2E capacity line refused - full:overhead. Add a budget exception' }]), [], 'an agent-fixable refusal has no kind');
  assert.deepEqual(ownerKindsIn([{ message: 'needs the owner (full:overhead)' }]), [], 'the form is exact');
  assert.deepEqual(ownerKindsIn(undefined), []);
});

test('fix 2 rule 6: an owner-only refusal alarms at the next check, whatever any agent posts, and quotes no branch text', () => {
  const t = '2026-11-12T08:00:00Z';
  const fx = {
    prs: [{ number: 7, sha: 's' }], runs: [refused({ id: 1, sha: 's', start: plus(t, -15), end: t })],
    annotations: { 10: needsOwner('full:overhead', '<img src=x> @everyone') },
    comments: { 7: [ownerRecord(plus(t, 1), 'session_x'), person(plus(t, 2), 're-pushing')] },
  };
  const gh = fakeGitHub(fx);
  const r = check(gh, plus(t, 3));
  assert.deepEqual(notices(gh), ['open'], 'bound 0: a comment and an owner record defer nothing');
  assert.equal(r.entries[0].unattended, true);
  assert.match(r.alarm.body, /#7: needs the owner: full:overhead;/);
  assert.match(r.alarm.body, /<!-- key: 7\/1\/1\/2026-11-12T08:00:00Z --> <!-- owner-mark: 7:full:overhead -->/, 'fix 1\'s key form, plus the mark');
  assert.doesNotMatch(r.alarm.body, /img|everyone/, 'nothing from the branch run beyond the kinds');
  assert.deepEqual(keysIn(r.alarm.body), ['7/1/1/2026-11-12T08:00:00Z'], 'fix 1\'s memory still reads it');
});

test('fix 2 rule 6: an agent-fixable refusal keeps fix 1\'s bound', () => {
  const t = '2026-11-12T08:00:00Z';
  const fx = { prs: [{ number: 7, sha: 's' }], runs: [refused({ id: 1, sha: 's', start: plus(t, -15), end: t })], annotations: { 10: [{ message: 'E2E capacity line refused - over the line' }] }, comments: { 7: [ownerRecord(plus(t, 1), 'session_x')] } };
  const gh = fakeGitHub(fx);
  check(gh, plus(t, 30));
  assert.deepEqual(notices(gh), [], 'within 60 minutes of its owner\'s action');
  check(gh, plus(t, 1 + BOUND_MINUTES + 1));
  assert.deepEqual(notices(gh), ['open']);
});

test('fix 2 rules 6 and 7: re-pushes refused the same way are the same alarm, kept while one is in flight, withdrawn when cleared', () => {
  const t = '2026-11-12T08:00:00Z';
  const fx = { prs: [{ number: 7, sha: 's1' }], runs: [refused({ id: 1, sha: 's1', start: plus(t, -15), end: t })], annotations: { 10: needsOwner('full:overhead'), 20: needsOwner('full:overhead') } };
  const gh = fakeGitHub(fx);
  check(gh, plus(t, 1));
  // The agent re-pushes; the new run is in flight.
  fx.prs[0].sha = 's2';
  fx.runs.push(refused({ id: 2, sha: 's2', start: plus(t, 5), end: plus(t, 5), status: 'in_progress' }));
  let r = check(gh, plus(t, 6));
  assert.ok(r.alarm, 'an in-flight re-push never withdraws it');
  assert.match(r.alarm.body, /owner-mark: 7:full:overhead/);
  // It is refused the same way: listed, no new notice.
  fx.runs[1] = refused({ id: 2, sha: 's2', start: plus(t, 5), end: plus(t, 20) });
  r = check(gh, plus(t, 21));
  assert.deepEqual(notices(gh), ['open'], 'the same alarm, not a new notice');
  assert.match(r.alarm.body, /key: 7\/2\/1\//);
  // An approved exception lands; the next push passes. Withdrawn.
  fx.prs[0].sha = 's3';
  fx.runs.push(prRun({ id: 3, sha: 's3', start: plus(t, 30), end: plus(t, 45), gate: 'success' }));
  r = check(gh, plus(t, 46));
  assert.equal(r.alarm, undefined, 'closed once a finished verdict no longer carries the kind');
});

test('fix 2 rule 7: a PR that turns draft takes its owner-only line with it', () => {
  const t = '2026-11-12T08:00:00Z';
  const fx = { prs: [{ number: 7, sha: 's' }], runs: [refused({ id: 1, sha: 's', start: plus(t, -15), end: t })], annotations: { 10: needsOwner('full:table') } };
  const gh = fakeGitHub(fx);
  assert.ok(check(gh, plus(t, 1)).alarm);
  fx.prs[0].draft = true;
  assert.equal(check(gh, plus(t, 2)).alarm, undefined);
});

test('fix 2 rule 6: a different kind is a new alarm; after a closing by hand only a further refused re-push notifies', () => {
  const t = '2026-11-12T08:00:00Z';
  const fx = { prs: [{ number: 7, sha: 's1' }], runs: [refused({ id: 1, sha: 's1', start: plus(t, -15), end: t })], annotations: { 10: needsOwner('full:overhead'), 20: needsOwner('full:overhead,full:table'), 30: needsOwner('full:overhead,full:table') } };
  const gh = fakeGitHub(fx);
  check(gh, plus(t, 1));
  fx.prs[0].sha = 's2';
  fx.runs.push(refused({ id: 2, sha: 's2', start: plus(t, 5), end: plus(t, 20) }));
  check(gh, plus(t, 21));
  assert.deepEqual(notices(gh), ['open', 'comment'], 'a new kind notifies once');
  gh.state.issues[0].state = 'closed';
  check(gh, plus(t, 22));
  check(gh, plus(t, 23));
  assert.deepEqual(notices(gh), ['open', 'comment'], 'the same failure is remembered from the closed alarm');
  fx.prs[0].sha = 's3';
  fx.runs.push(refused({ id: 3, sha: 's3', start: plus(t, 25), end: plus(t, 40) }));
  check(gh, plus(t, 41));
  check(gh, plus(t, 42));
  assert.deepEqual(notices(gh), ['open', 'comment', 'open'], 'one notice for the further refused re-push');
});

test('fix 2 rule 6: an unread gate answer is no verdict, and the check is incomplete', () => {
  const t = '2026-11-12T08:00:00Z';
  const fx = { prs: [{ number: 7, sha: 's' }], runs: [refused({ id: 1, sha: 's', start: plus(t, -15), end: t })], annotations: { 10: needsOwner('full:overhead') }, fail: (route) => /annotations/.test(route) };
  const gh = fakeGitHub(fx);
  const r = check(gh, plus(t, 120));
  assert.equal(r.complete, false);
  assert.deepEqual(notices(gh), []);
  // An answer that is not a list (an error body) is unread too.
  const odd = fakeGitHub({ ...fx, fail: () => false, annotations: { 10: { message: 'Not Found' } } });
  assert.equal(check(odd, plus(t, 120)).complete, false);
  assert.deepEqual(notices(odd), []);
});

test('fix 2 rule 3: the gate\'s owner-only error says re-pushing will not pass and how to raise the alarm; the agent message stays', () => {
  const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const owner = /::error title=CI gate::Needs the owner \(\$\{CAPACITY_OWNER\}\): [^\n]*/.exec(ci)?.[0] ?? '';
  assert.match(owner, /Re-pushing will not pass/);
  assert.match(owner, /drop what it adds to that tier or table/);
  assert.match(owner, /revision only with a reviewed revision/, 'what moves each kind');
  assert.match(owner, /Any other reason named here is this change's to fix/, 'a verdict holding both kinds says both');
  assert.match(owner, /node scripts\/repair-wake\.mjs check --issue/);
  assert.match(ci, /capacityOwner: \$\{\{ steps\.capacity\.outputs\.capacity_owner \}\}/, 'the plan job outputs the kinds');
  assert.match(ci, /CAPACITY_OWNER: \$\{\{ needs\.plan\.outputs\.capacityOwner \}\}/, 'the gate reads them');
  assert.match(ci, /Add a budget exception/i, 'the agent-fixable message is unchanged');
});

test('fix 2 rule 6: a re-push refused for fewer of the listed kinds is the same alarm', () => {
  const t = '2026-11-12T08:00:00Z';
  const fx = { prs: [{ number: 7, sha: 's1' }], runs: [refused({ id: 1, sha: 's1', start: plus(t, -15), end: t })], annotations: { 10: needsOwner('full:overhead,full:table'), 20: needsOwner('full:overhead') } };
  const gh = fakeGitHub(fx);
  check(gh, plus(t, 1));
  fx.prs[0].sha = 's2';
  fx.runs.push(refused({ id: 2, sha: 's2', start: plus(t, 5), end: plus(t, 20) }));
  const r = check(gh, plus(t, 21));
  assert.deepEqual(notices(gh), ['open'], 'no new notice');
  assert.match(r.alarm.body, /owner-mark: 7:full:overhead -->/);
});

test('fix 2 rule 7: a cancelled re-push, or one whose run is not created yet, keeps the line', () => {
  const t = '2026-11-12T08:00:00Z';
  const fx = { prs: [{ number: 7, sha: 's1' }], runs: [refused({ id: 1, sha: 's1', start: plus(t, -15), end: t })], annotations: { 10: needsOwner('full:overhead') } };
  const gh = fakeGitHub(fx);
  check(gh, plus(t, 1));
  fx.prs[0].sha = 's2';
  assert.ok(check(gh, plus(t, 2)).alarm, 'no run yet for the new head');
  fx.runs.push(refused({ id: 2, sha: 's2', start: plus(t, 3), end: plus(t, 4), conclusion: 'cancelled', gate: 'cancelled' }));
  const r = check(gh, plus(t, 5));
  assert.ok(r.alarm, 'a cancelled run is no verdict');
  assert.match(r.alarm.body, /owner-mark: 7:full:overhead/);
});

test('fix 2 rule 7: an incomplete check with a re-push in flight lists the line once', () => {
  const line = '- #7: needs the owner: full:overhead; x <!-- key: 7/1/1/2026-11-12T08:00:00Z --> <!-- owner-mark: 7:full:overhead -->';
  const previousBody = `Header\n\n${line}`;
  const r = nextAlarm({ entries: [], complete: false, previousBody, inFlight: new Set([7]) });
  assert.deepEqual(r.unattended, [line]);
  assert.equal(r.close, false);
  const again = nextAlarm({ entries: [], complete: false, previousBody: `Header\n\n${r.unattended.join('\n')}`, inFlight: new Set([7]) });
  assert.deepEqual(again.unattended, [line], 'not growing check by check');
});
