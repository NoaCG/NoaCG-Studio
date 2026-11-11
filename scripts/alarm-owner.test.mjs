// guards: scripts/alarm-owner.mjs, scripts/growth-report.mjs, scripts/e2e-quarantine.mjs, scripts/growth-ceilings.json
// The growth, age and quarantine alarms reach their owner (#1951, cicd-followup cf01): every owner
// string names miwco as primary and the weekly owner session as backup, every raised alarm issue
// is assigned to miwco, a route GitHub did not take is an error, and the test alarm goes the
// same way. All through an injected `gh`; no network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { alarmOwner, issueNumber, isOwnedAlarm, pastDate, ownedAlarmTitles, raiseTestAlarm, routeOrWarn, routeToOwner, testAlarmBody, TEST_ALARM_PREFIX } from './alarm-owner.mjs';
import { ledgerChanges } from './growth-controls.mjs';
import { AGE_ISSUE, rollingIssue, WEEKLY_ISSUE } from './growth-report.mjs';
import { incidentIssueBody, quarantineIncidents } from './e2e-quarantine.mjs';

const CEILINGS = JSON.parse(readFileSync(new URL('./growth-ceilings.json', import.meta.url), 'utf8'));

/** A fake `gh api` that records calls and answers assignments as GitHub would. */
function fakeGh({ issues = [], assignable = true } = {}) {
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    const [, , method, route] = args;
    if (method === 'GET') return JSON.stringify(issues);
    if (method === 'POST' && /\/assignees$/.test(route)) {
      const login = args.find((a) => a.startsWith('assignees[]=')).split('=')[1];
      return JSON.stringify({ number: Number(route.split('/').at(-2)), assignees: assignable ? [{ login }] : [] });
    }
    if (method === 'POST' && /\/issues$/.test(route)) return JSON.stringify({ number: 77, html_url: 'https://github.com/NoaCG/NoaCG-Studio/issues/77' });
    return '{}';
  };
  return { gh, calls, assigned: () => calls.filter((c) => /\/assignees$/.test(c[3])).map((c) => [Number(c[3].split('/').at(-2)), c.at(-1)]) };
}

test('(a) the recorded owner is miwco, primary, with the weekly owner session as backup coverage', () => {
  const { owner, login } = alarmOwner(CEILINGS);
  assert.equal(login, 'miwco');
  assert.match(owner, /^miwco \(primary\)/);
  assert.match(owner, /weekly owner session \(backup coverage\)/);
  assert.doesNotMatch(owner, /coordinator/, 'agent coordination is not the operational owner');
  assert.throws(() => alarmOwner({ owner: 'x' }), /no owner or ownerLogin/);
  assert.throws(() => alarmOwner({ owner: 'x', ownerLogin: 'a b' }), /not a GitHub login/);
});

test('(a) the quarantine incident list prints that owner on every row', () => {
  const store = { specs: { 'e2e/a.spec.ts': { since: '2026-11-01', count: 1 } } };
  const incidents = quarantineIncidents(store, { headers: new Map(), today: '2026-11-02', owner: alarmOwner(CEILINGS).owner });
  assert.equal(incidents[0].owner, alarmOwner(CEILINGS).owner);
  assert.match(incidentIssueBody(incidents, '2026-11-02'), /\| miwco \(primary\); the weekly owner session \(backup coverage\) \|/);
});

test('(a) the owner change is a reviewed revision of the ceilings, with no ceiling moved', () => {
  // Version 1 as it stood on main at b6f59fb1: the same file with the coordinator as owner.
  const base = { ...CEILINGS, version: 1, owner: 'cicd-improvement plan coordinator (run issue #1842) until ci17 hands off' };
  delete base.ownerLogin;
  delete base.revisions;
  assert.deepEqual(ledgerChanges({ base, head: CEILINGS }), []);
  assert.match(ledgerChanges({ base, head: { ...CEILINGS, revisions: [] } }).join(), /without a new version and a reviewed revision/, 'the owner moves only by a reviewed revision');
  assert.equal(CEILINGS.revisions.find((r) => r.version === 2).reviewed, 'https://github.com/NoaCG/NoaCG-Studio/issues/1951#issuecomment-6570085219');
});

test('(b) a raised or updated rolling alarm is assigned to the owner; a closed one is not', () => {
  const opened = fakeGh();
  assert.equal(rollingIssue(WEEKLY_ISSUE, 'body', 'miwco', opened.gh), 'opened #77; #77 routed to miwco');
  assert.deepEqual(opened.assigned(), [[77, 'assignees[]=miwco']]);

  const existing = { number: 12, title: AGE_ISSUE, user: { type: 'Bot' }, author_association: 'NONE' };
  const updated = fakeGh({ issues: [existing] });
  assert.equal(rollingIssue(AGE_ISSUE, 'new body', 'miwco', updated.gh), 'updated #12; #12 routed to miwco');
  assert.deepEqual(updated.assigned(), [[12, 'assignees[]=miwco']]);

  const closed = fakeGh({ issues: [existing] });
  assert.equal(rollingIssue(AGE_ISSUE, '', 'miwco', closed.gh), 'closed #12');
  assert.deepEqual(closed.assigned(), []);
});

test('(b) a route GitHub did not take is an error, never a quiet success, and never undoes the alarm', (t) => {
  const refused = fakeGh({ assignable: false });
  assert.throws(() => routeToOwner(5, { login: 'miwco', gh: refused.gh }), /could not be assigned to miwco/);
  // Once the alarm is written, a refused route warns in the run instead of failing the job.
  const logged = [];
  t.mock.method(console, 'log', (line) => logged.push(line));
  assert.match(rollingIssue(WEEKLY_ISSUE, 'body', 'miwco', refused.gh), /^opened #77; not routed: issue #77 could not be assigned to miwco/);
  assert.match(routeOrWarn('https://github.com/NoaCG/NoaCG-Studio/issues/9', { login: 'miwco', gh: refused.gh }), /not routed: issue #9/);
  assert.match(routeOrWarn('created, no url', { login: 'miwco', gh: refused.gh }), /not routed: no issue number/);
  assert.ok(logged.every((l) => l.startsWith('::warning title=Alarm routing::')) && logged.length === 3);
  assert.equal(routeOrWarn('https://github.com/NoaCG/NoaCG-Studio/issues/9', { login: 'miwco', gh: fakeGh().gh }), '#9 routed to miwco');
});

test('(b) the test alarm is labelled, carries no @mention, and is routed like a real alarm', () => {
  const f = fakeGh();
  const number = raiseTestAlarm({ ceilings: CEILINGS, runUrl: 'https://github.com/NoaCG/NoaCG-Studio/actions/runs/1', now: '2026-11-02T12:00:00.000Z', gh: f.gh });
  assert.equal(number, 77);
  const create = f.calls.find((c) => c[3].endsWith('/issues'));
  assert.ok(create.includes(`title=${TEST_ALARM_PREFIX} 2026-11-02 12:00 UTC`));
  const body = testAlarmBody({ owner: 'o', login: 'miwco', runUrl: 'u', now: 'n' });
  assert.match(body, /deliberate test alarm, not an incident/);
  assert.match(body, /confirm on #1951/);
  assert.doesNotMatch(body, /@miwco/, 'the assignment alone must carry it');
  assert.deepEqual(f.assigned(), [[77, 'assignees[]=miwco']]);
});

test('the weekly backup review lists exactly the owned alarms and test alarms', async () => {
  const titles = await ownedAlarmTitles();
  assert.equal(titles.length, 6);
  assert.ok(titles.includes('Growth report not complete'), 'the report alarm is in the weekly backup review');
  for (const t of titles) assert.ok(isOwnedAlarm(t, titles));
  assert.ok(isOwnedAlarm('Plan phases past their age ceiling: cicd-followup', titles));
  assert.ok(isOwnedAlarm(`${TEST_ALARM_PREFIX} 2026-11-02 12:00 UTC`, titles));
  assert.ok(!isOwnedAlarm('CI is red on main', titles));
  assert.ok(!isOwnedAlarm('Growth controls: weekly actions are odd', titles));
});

test('issue numbers are read from a gh URL or a REST answer', () => {
  assert.equal(issueNumber('https://github.com/NoaCG/NoaCG-Studio/issues/1907\n'), 1907);
  assert.equal(issueNumber('{"number": 12}'), 12);
  assert.throws(() => issueNumber('{}'), /no issue number/);
  assert.throws(() => issueNumber('plain text'), /no issue number/);
});

test('the weekly backup review sees an alarm past its date in each alarm\'s own words', () => {
  const store = { specs: { 'e2e/a.spec.ts': { since: '2026-10-01', count: 1 } } };
  const overdue = incidentIssueBody(quarantineIncidents(store, { headers: new Map(), today: '2026-11-02', owner: 'o' }), '2026-11-02');
  assert.ok(pastDate(overdue), 'a quarantine incident past its repair date');
  const onTime = incidentIssueBody(quarantineIncidents(store, { headers: new Map(), today: '2026-10-02', owner: 'o' }), '2026-10-02');
  assert.ok(!pastDate(onTime));
  // growth-controls.mjs weeklyMarkdown and growth-report.mjs ages, line for line.
  assert.ok(pastDate('- **cost:backend** (stopped): x. Owner o; growth stopped in backend until measured back in bounds.'));
  assert.ok(!pastDate('- **cost:backend** (correcting): x. Owner o; correction due 2026-11-09.'));
  assert.ok(pastDate('- prReady #1834 unfinished. Owner o; act by 2026-11-01 (missed).'));
  assert.ok(!pastDate('- prReady #1834 unfinished. Owner o; act by 2026-11-09.'));
});
