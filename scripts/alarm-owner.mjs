#!/usr/bin/env node
// WHO THE GROWTH, AGE AND QUARANTINE ALARMS GO TO, and the proof that they get there.
//
//   node scripts/alarm-owner.mjs test-alarm --run <url>   # one labelled test alarm, routed like a real one
//   node scripts/alarm-owner.mjs list                     # the open owned alarm issues (weekly backup review)
//
// Each of those alarms keeps one rolling issue (scripts/growth-report.mjs for the weekly growth,
// delivery age and plan phase alarms; scripts/e2e-quarantine.mjs for the stale list and the
// incident list). The owner decided on #1951: `miwco` is the primary owner and the weekly owner
// session (/orchestrator-week) reviews the open ones each week as backup coverage. Both halves are
// recorded in scripts/growth-ceilings.json: `owner` is the text every alarm prints, `ownerLogin`
// the GitHub account each alarm issue is ASSIGNED to. Assignment is the routing: GitHub notifies
// the assignee when an alarm issue opens or is first routed, and keeps them subscribed to it.
// Assigning someone already assigned changes nothing and notifies no one, so a rolling issue
// that is merely updated does not mail again.
//
// A route that did not take is an error, never a quiet success: GitHub answers an assignment it
// cannot make (a login without access) with the issue unchanged, so the answer is checked.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = process.env.GH_REPO || process.env.GITHUB_REPOSITORY || 'NoaCG/NoaCG-Studio';
const ghText = (args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 16 << 20, windowsHide: true });

/** The title prefix of a deliberate test alarm; `list` shows these too, so a test is never lost. */
export const TEST_ALARM_PREFIX = 'Test alarm: owner routing check';

/** The owner text and login the ceilings file records. Throws when either is missing: an alarm with no owner is unrouted. */
export function alarmOwner(ceilings = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'growth-ceilings.json'), 'utf8'))) {
  const owner = String(ceilings?.owner ?? '').trim();
  const login = String(ceilings?.ownerLogin ?? '').trim();
  if (!owner || !login) throw new Error('scripts/growth-ceilings.json names no owner or ownerLogin, so no alarm would reach anyone');
  if (!/^[A-Za-z0-9-]+$/.test(login)) throw new Error(`scripts/growth-ceilings.json ownerLogin "${login}" is not a GitHub login`);
  return { owner, login };
}

/** The issue number in a `gh issue create` URL or a REST answer. */
export function issueNumber(answer) {
  const m = /\/issues\/(\d+)\s*$/.exec(String(answer ?? '').trim());
  if (m) return Number(m[1]);
  const n = Number(JSON.parse(String(answer))?.number);
  if (!Number.isSafeInteger(n) || n < 1) throw new Error(`no issue number in "${String(answer).slice(0, 80)}"`);
  return n;
}

/** Assign alarm issue `number` to the owner, and check GitHub's answer says it took. */
export function routeToOwner(number, { login, repo = REPO, gh = ghText }) {
  const answer = JSON.parse(gh(['api', '-X', 'POST', `repos/${repo}/issues/${number}/assignees`, '-f', `assignees[]=${login}`]) || '{}');
  const took = (answer.assignees ?? []).some((a) => String(a?.login).toLowerCase() === login.toLowerCase());
  if (!took) throw new Error(`issue #${number} could not be assigned to ${login}: the alarm is not routed to its owner`);
  return `#${number} routed to ${login}`;
}

/** The body of a test alarm: what it is, who raised it, and what the owner does with it. Pure.
 * No @mention: the assignment alone must carry it, so a receipt proves the routing real alarms use. */
export function testAlarmBody({ owner, login, runUrl, now }) {
  return [
    `**This is a deliberate test alarm, not an incident.** It was raised ${now} by the workflow's own token (${runUrl || 'run url unknown'}) and routed exactly like the growth, age and quarantine alarms: assigned to the owner that \`scripts/growth-ceilings.json\` records (${owner}).`,
    '',
    `\`${login}\`: if this reached you as a GitHub notification, please confirm on #1951 (one line is enough, for example "test alarm received"), then close this issue. Nothing else needs doing.`,
    '',
    'Raised by `node scripts/alarm-owner.mjs test-alarm` from `.github/workflows/alarm-test.yml`.',
  ].join('\n');
}

/** Open one test alarm issue and route it. Returns its number. */
export function raiseTestAlarm({ ceilings, runUrl = '', now = new Date().toISOString(), repo = REPO, gh = ghText }) {
  const { owner, login } = alarmOwner(ceilings);
  const title = `${TEST_ALARM_PREFIX} ${now.slice(0, 16).replace('T', ' ')} UTC`;
  const made = gh(['api', '-X', 'POST', `repos/${repo}/issues`, '-f', `title=${title}`, '-f', `body=${testAlarmBody({ owner, login, runUrl, now })}`]);
  const number = issueNumber(made);
  routeToOwner(number, { login, repo, gh });
  return number;
}

/** Whether an open issue is one of the owned alarms (or a test of their routing). Pure. */
export function isOwnedAlarm(title, titles) {
  const t = String(title ?? '');
  return titles.some((known) => t === known || t.startsWith(`${known}: `)) || t.startsWith(TEST_ALARM_PREFIX);
}

/** The owned alarm titles, read from the scripts that keep the issues so the list cannot drift. */
export async function ownedAlarmTitles() {
  const { AGE_ISSUE, PHASE_AGE_ISSUE, WEEKLY_ISSUE } = await import('./growth-report.mjs');
  const { STALE_ISSUE_TITLE, INCIDENT_ISSUE_TITLE } = await import('./e2e-quarantine.mjs');
  return [WEEKLY_ISSUE, AGE_ISSUE, PHASE_AGE_ISSUE, STALE_ISSUE_TITLE, INCIDENT_ISSUE_TITLE];
}

// The CLI runs after this module has finished evaluating (no top-level await): `list` imports
// growth-report.mjs and e2e-quarantine.mjs, which import this module back.
async function main() {
  const [command, ...args] = process.argv.slice(2);
  const value = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  if (command === 'test-alarm') {
    const ceilings = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'growth-ceilings.json'), 'utf8'));
    const number = raiseTestAlarm({ ceilings, runUrl: value('--run') ?? '' });
    console.log(`::notice title=Test alarm::opened #${number} and routed it to ${alarmOwner(ceilings).login}`);
  } else if (command === 'list') {
    const titles = await ownedAlarmTitles();
    const { login } = alarmOwner();
    const open = [];
    for (let page = 1; page <= 10; page++) {
      const list = JSON.parse(ghText(['api', '-X', 'GET', `repos/${REPO}/issues?state=open&per_page=100&page=${page}`]) || '[]');
      open.push(...list.filter((i) => !i.pull_request && isOwnedAlarm(i.title, titles)));
      if (list.length < 100) break;
    }
    if (open.length === 0) console.log('No owned alarm issue is open.');
    for (const i of open) {
      const to = (i.assignees ?? []).map((a) => a.login);
      console.log(`#${i.number} ${i.title} (updated ${String(i.updated_at).slice(0, 10)}${to.includes(login) ? '' : `; NOT routed to ${login}`})`);
    }
  } else {
    console.error('usage: alarm-owner.mjs test-alarm --run <url> | list');
    process.exit(2);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`::error title=Alarm owner::${String(e?.message ?? e).split('\n')[0]}`); process.exit(1); });
}
