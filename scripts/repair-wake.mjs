#!/usr/bin/env node
// A RED PULL REQUEST NOBODY IS REPAIRING REACHES THE OWNER ALARM (cicd-followup cf22 fix 1).
//
//   node scripts/repair-wake.mjs check [--issue] [--now <iso>]
//
// The wakes that work stay as they are: a cloud session subscribed to its PR, or the app's
// Auto-fix, hears of a red check at once. Nothing can wake an owner whose provider has no PR
// wake, and nothing noticed a red PR with no owner at all (cf22 section 3.4: #1840, #2218, #2374).
// This check notices them. It reads open PRs, their newest CI verdicts and their comments; when a
// red one is unattended past its bound it raises one owner alarm per failure, in a rolling issue
// assigned to the owner scripts/growth-ceilings.json records (scripts/alarm-owner.mjs). It writes
// nothing else. Rules, numbered as here: docs/work-specs/cicd-followup/evidence/cf22-fix-1-repair-wake.md.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { alarmOwner, findAlarmIssue, routeOrWarn, trustedAuthor } from './alarm-owner.mjs';
import { makeReader } from './growth-report.mjs';

const REPO = process.env.GH_REPO || process.env.GITHUB_REPOSITORY || 'NoaCG/NoaCG-Studio';
const MINUTE = 60_000;

/** Rule 6: minutes a red PR may stay unattended before the alarm. */
export const BOUND_MINUTES = 60;
/** Rule 7: a failure older than this when first found unattended raises no new alarm. */
export const WINDOW_HOURS = 24;
/** Rule 10: GitHub API calls per check, reads and alarm writes together. */
export const MAX_CALLS = 100;
/** Calls kept back from the reads for the alarm issue's find, edit, comment and routing. */
const WRITE_RESERVE = 15;
/** Rule 8: the one rolling alarm issue. */
export const RED_ISSUE = 'Red pull requests nobody is repairing';
export const OWNER_MARK = '<!-- noacg:repair-owner';
const RULES = 'docs/work-specs/cicd-followup/evidence/cf22-fix-1-repair-wake.md';
const FAILED = new Set(['failure', 'timed_out']);
const GROUP_BRANCH = /^gh-readonly-queue\/main\/pr-(\d+)-/;
const at = (iso) => Date.parse(iso ?? '');
/** When a run's newest attempt started: a re-run keeps `created_at`, so recency reads this. */
const started = (run) => Math.max(at(run?.run_started_at) || 0, at(run?.created_at) || 0);

/** Rule 3: a person with write access, not a bot (Codex's review and Vercel do not count). */
export const isPerson = (c) => c?.user?.type !== 'Bot' && ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(c?.author_association);

/** Rule 4: the newest repair-owner record by a bot or a repository member, or null. */
export function repairOwner(comments) {
  return comments.filter((c) => String(c.body ?? '').includes(OWNER_MARK) && trustedAuthor(c))
    .sort((a, b) => at(a.created_at) - at(b.created_at)).at(-1) ?? null;
}

/**
 * Rule 1: the PR's newest verdict: its newest ci.yml PR or dispatch run on the current head, or
 * its newest merge-group run when that started later. With no run on the current head there is
 * no verdict: a merge-group run alone may be about an older head. Pure.
 */
export function verdictRun({ prRun = null, groupRun = null }) {
  if (!prRun) return null;
  return groupRun && started(groupRun) > started(prRun) ? groupRun : prRun;
}

/**
 * Rules 1 and 2: the failure the verdict `run` holds, or null. `gate` is its `CI gate` job in the
 * newest attempt. A run still going is no verdict; a red `Reviewed` beside a green gate is review
 * wait. `newerAttempt` is rule 3's action: an attempt that re-ran other jobs lists the old gate
 * as a copy, so its start is when someone acted.
 */
export function failureOf({ run = null, gate = null }) {
  if (run?.status !== 'completed' || !FAILED.has(gate?.conclusion)) return null;
  return {
    kind: run.event === 'merge_group' ? 'merge group' : 'PR run',
    run: run.id,
    attempt: run.run_attempt ?? 1,
    at: gate.completed_at,
    url: run.html_url,
    newerAttempt: at(run.run_started_at) > at(gate.completed_at) ? run.run_started_at : null,
  };
}

/** Rule 3: the time of the PR's last action after `failure`, or null when there was none. */
export function lastAction(failure, comments, owner = repairOwner(comments)) {
  const t = at(failure.at);
  const times = [at(failure.newerAttempt), at(owner?.updated_at), ...comments.filter(isPerson).map((c) => at(c.created_at))]
    .filter((x) => x > t);
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

/** The first line of an owner's record, made safe to quote: no mention, no markup, short. */
export function ownerText(owner) {
  if (!owner) return 'none recorded';
  const line = String(owner.body).split(OWNER_MARK)[1]?.split('\n').map((l) => l.trim()).find((l) => l && l !== '-->') ?? '';
  const text = line.replace(/^owner:\s*/i, '').replace(/-->.*$/, '').replace(/<[^>]*>/g, '').replace(/[@`<>]/g, '').trim().replace(/\.$/, '');
  return (text.length > 120 ? `${text.slice(0, 117).trimEnd()}...` : text) || 'recorded, no text';
}

/**
 * Rules 5 and 6: the entry for a red PR, `unattended` when it is past its bound. Attended entries
 * keep an alarmed failure remembered while it is red (rule 8). `ageMinutes` is the failure's own
 * age, for rule 7, which limits new alarms only.
 */
export function decide({ pr, failure, comments, now }) {
  if (!failure) return null;
  const owner = repairOwner(comments);
  const since = lastAction(failure, comments, owner) ?? failure.at;
  // With no owner, no worker can be left on a merge-group failure or on a bot's PR: the next check
  // alarms, unless a person has acted since, whose action then gets the full bound.
  const noWorker = !owner && (failure.kind === 'merge group' || pr.user?.type === 'Bot');
  const bound = noWorker && since === failure.at ? 0 : BOUND_MINUTES;
  const unattended = (at(now) - at(since)) / MINUTE >= bound;
  const key = `${pr.number}/${failure.run}/${failure.attempt}/${failure.at}`;
  const last = since === failure.at ? '' : `, last action ${since.slice(0, 16).replace('T', ' ')} UTC`;
  const line = `- #${pr.number}: CI gate red on the ${failure.kind} since ${String(failure.at).slice(0, 16).replace('T', ' ')} UTC${last} (${failure.url}); repair owner: ${ownerText(owner)}. <!-- key: ${key} -->`;
  return { key, pr: pr.number, ageMinutes: (at(now) - at(failure.at)) / MINUTE, owned: Boolean(owner), unattended, line };
}

/** The keys an alarm body lists. Pure. */
export function keysIn(body) {
  return [...String(body ?? '').matchAll(/<!-- key: (\S+) -->/g)].map((m) => m[1]);
}

/** Every page of a PR's comments, up to three; null when they could not all be read. */
function readComments(reader, repo, number) {
  const comments = [];
  for (let page = 1; page <= 3; page++) {
    const got = reader.get(`repos/${repo}/issues/${number}/comments?per_page=100&page=${page}`);
    if (!Array.isArray(got)) return null;
    comments.push(...got);
    if (got.length < 100) return comments;
  }
  return null;
}

/** The merge-group runs of the last two days, up to three pages; `complete` when all were read. */
function readGroups(reader, repo, now) {
  const since = new Date(at(now) - 2 * WINDOW_HOURS * 60 * MINUTE).toISOString();
  const runs = [];
  for (let page = 1; page <= 3; page++) {
    const got = reader.get(`repos/${repo}/actions/workflows/ci.yml/runs?event=merge_group&per_page=100&page=${page}&created=${encodeURIComponent(`>=${since}`)}`);
    if (!Array.isArray(got?.workflow_runs)) return { runs, complete: false };
    runs.push(...got.workflow_runs);
    if (got.workflow_runs.length < 100) return { runs, complete: true };
  }
  return { runs, complete: false };
}

/**
 * Rules 1 to 6 over every open PR, within the reader's budget. Returns { entries, complete }.
 * `remembered` holds the keys already alarmed: a listed merge-group failure older than the
 * two-day listing is read by its run id, so it stays the PR's verdict at any age (rule 7).
 */
export function sweep({ reader, now, repo = REPO, remembered = [] }) {
  const prs = reader.get(`repos/${repo}/pulls?state=open&per_page=100`);
  if (!Array.isArray(prs)) return { entries: [], complete: false };
  let complete = prs.length < 100;
  // The newest merge-group run per PR, by the group branch's PR number.
  const listed = readGroups(reader, repo, now);
  if (!listed.complete) complete = false;
  const groups = new Map();
  for (const r of listed.runs) {
    const n = Number(GROUP_BRANCH.exec(r.head_branch ?? '')?.[1]);
    if (n && (!groups.has(n) || started(r) > started(groups.get(n)))) groups.set(n, r);
  }
  const alarmedRuns = new Map();
  for (const key of remembered) {
    const [n, run] = key.split('/').map(Number);
    alarmedRuns.set(n, [...(alarmedRuns.get(n) ?? []), run]);
  }
  const entries = [];
  for (const pr of prs.filter((p) => !p.draft)) {
    const runs = reader.get(`repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${pr.head.sha}&per_page=20`);
    if (!Array.isArray(runs?.workflow_runs)) { complete = false; continue; }
    const prRun = runs.workflow_runs.filter((r) => ['pull_request', 'workflow_dispatch'].includes(r.event))
      .sort((a, b) => started(b) - started(a))[0] ?? null;
    let groupRun = groups.get(pr.number) ?? null;
    for (const id of groupRun ? [] : (alarmedRuns.get(pr.number) ?? []).filter((id) => id !== prRun?.id)) {
      const old = reader.get(`repos/${repo}/actions/runs/${id}`);
      if (!old) complete = false;
      else if (old.event === 'merge_group' && (!groupRun || started(old) > started(groupRun))) groupRun = old;
    }
    const run = verdictRun({ prRun, groupRun });
    if (run?.status !== 'completed' || !FAILED.has(run.conclusion)) continue;
    const jobs = reader.get(`repos/${repo}/actions/runs/${run.id}/attempts/${run.run_attempt ?? 1}/jobs?per_page=100`);
    if (!Array.isArray(jobs?.jobs) || jobs.jobs.length >= 100) { complete = false; continue; }
    const failure = failureOf({ run, gate: jobs.jobs.find((j) => j.name === 'CI gate') ?? null });
    if (!failure) continue;
    // Unread comments could hold the action that answers the failure: no verdict on this PR.
    const comments = readComments(reader, repo, pr.number);
    if (!comments) { complete = false; continue; }
    const entry = decide({ pr, failure, comments, now });
    if (entry) entries.push(entry);
  }
  if (reader.exhausted || reader.failures) complete = false;
  return { entries, complete };
}

/**
 * Rules 7 to 9: the alarm issue's next state from this check's red PRs and its listed lines. Pure.
 * Returns { unattended, attended, fresh, close }: the lines of alarmed failures still unattended,
 * those someone has since attended to (listed while they stay red, so they never alarm twice),
 * the entries new since the last check, and whether to close the issue. An incomplete check keeps
 * every listed line it could not re-read.
 */
export function nextAlarm({ entries, complete, previousBody = '', remembered = keysIn(previousBody) }) {
  const listed = new Set(remembered);
  const fresh = entries.filter((e) => e.unattended && !listed.has(e.key) && e.ageMinutes <= WINDOW_HOURS * 60);
  const kept = entries.filter((e) => listed.has(e.key) || fresh.includes(e));
  const unattended = kept.filter((e) => e.unattended).map((e) => e.line);
  const attended = kept.filter((e) => !e.unattended).map((e) => e.line);
  if (!complete) {
    const seen = new Set(entries.map((e) => e.key));
    let section = unattended;
    for (const l of String(previousBody).split(/\r?\n/)) {
      if (l.trim() === ATTENDED_HEADING) section = attended;
      const k = keysIn(l)[0];
      if (k && !seen.has(k)) section.push(l);
    }
  }
  return { unattended, attended, fresh, close: complete && kept.length === 0 };
}

const ATTENDED_HEADING = 'Attended to since the alarm, still red (listed so they do not alarm again):';

export function alarmBody({ owner, now, unattended, attended = [] }) {
  return [
    `Owner: ${owner}. Checked ${now}. Each pull request below has a red required check that nobody has attended to for ${BOUND_MINUTES} minutes or more (at once for a merge-group failure or a bot's PR with no repair owner): no re-run and no comment by a person since the failure or the last one. Repair it, wake its repair owner, or close it with a reason. Rules: \`${RULES}\`.`,
    '',
    ...(unattended.length ? unattended : ['None unattended now.']),
    ...(attended.length ? ['', ATTENDED_HEADING, '', ...attended] : []),
  ].join('\n');
}

/**
 * Rule 8's memory: the open alarm issue, and the keys it and the newest closed one list. A closed
 * issue's keys are remembered too, so an owner who closes the alarm by hand is not alarmed again
 * for the same failures.
 */
export function readAlarm({ gh, repo = REPO }) {
  const found = findAlarmIssue(RED_ISSUE, { repo, gh });
  const closedList = JSON.parse(gh(['api', '-X', 'GET', `repos/${repo}/issues?state=closed&sort=updated&direction=desc&per_page=50`]) || '[]');
  const closed = closedList.find((i) => i.title === RED_ISSUE && !i.pull_request && trustedAuthor(i));
  return { found, remembered: [...new Set([...keysIn(found?.body), ...keysIn(closed?.body)])] };
}

/** The listed part of an alarm body, without its header and check time. Pure. */
const listedPart = (body) => String(body ?? '').split(/\r?\n/).slice(1).map((l) => l.trimEnd()).join('\n');

/** Write the alarm: open it, update it with one comment for new failures, or close it. */
export function raise({ entries, complete, now, ceilings, gh, repo = REPO, alarm = readAlarm({ gh, repo }) }) {
  const { owner, login } = alarmOwner(ceilings);
  const { found, remembered } = alarm;
  const { unattended, attended, fresh, close } = nextAlarm({ entries, complete, previousBody: found?.body ?? '', remembered });
  if (close && found) {
    gh(['api', '-X', 'POST', `repos/${repo}/issues/${found.number}/comments`, '-f', 'body=No listed pull request is red and unattended any more; closing.']);
    gh(['api', '-X', 'PATCH', `repos/${repo}/issues/${found.number}`, '-f', 'state=closed']);
    return `closed #${found.number}`;
  }
  if (!unattended.length && !attended.length) return 'nothing to raise';
  const body = alarmBody({ owner, now, unattended, attended });
  if (!found && !fresh.length) return 'nothing new: the alarm issue was closed, and its failures are remembered';
  if (!found) {
    const made = JSON.parse(gh(['api', '-X', 'POST', `repos/${repo}/issues`, '-f', `title=${RED_ISSUE}`, '-f', `body=${body}`]));
    return `opened #${made.number} with ${fresh.length} new; ${routeOrWarn(made.number, { login, repo, gh })}`;
  }
  // An unchanged list is not rewritten: each edit would only move the check time.
  if (listedPart(body) !== listedPart(found.body)) gh(['api', '-X', 'PATCH', `repos/${repo}/issues/${found.number}`, '-f', `body=${body}`]);
  if (!fresh.length) return `#${found.number} kept, nothing new`;
  // One comment per check, listing every new failure: the assignee is notified once.
  gh(['api', '-X', 'POST', `repos/${repo}/issues/${found.number}/comments`, '-f', `body=New since the last check:\n\n${fresh.map((e) => e.line).join('\n')}`]);
  return `updated #${found.number} with ${fresh.length} new; ${routeOrWarn(found.number, { login, repo, gh })}`;
}

/** A `gh` that refuses past `limit` calls, so reads and writes together stay within rule 10. */
export function budgetedGh(limit, run = (args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 16 << 20, windowsHide: true })) {
  const gh = (args) => {
    if (gh.calls >= limit) throw new Error(`the ${limit}-call budget is spent`);
    gh.calls += 1;
    return run(args);
  };
  gh.calls = 0;
  return gh;
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  const value = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  if (command !== 'check') {
    console.error('usage: repair-wake.mjs check [--issue] [--now <iso>]');
    process.exit(2);
  }
  const ceilings = JSON.parse(readFileSync(new URL('./growth-ceilings.json', import.meta.url), 'utf8'));
  alarmOwner(ceilings); // rule 12: no recorded owner, no check
  const now = value('--now') ?? new Date().toISOString();
  const gh = budgetedGh(MAX_CALLS);
  const alarm = args.includes('--issue') ? readAlarm({ gh }) : { found: null, remembered: [] };
  const { entries, complete } = sweep({ reader: makeReader(MAX_CALLS - WRITE_RESERVE, gh), now, remembered: alarm.remembered });
  console.log(`${entries.filter((e) => e.unattended).length} of ${entries.length} red PR(s) unattended past their bound; check ${complete ? 'complete' : 'incomplete'} (${gh.calls} calls)`);
  for (const e of entries) console.log(`${e.unattended ? 'UNATTENDED' : 'attended'} ${e.line}`);
  // Rule 9: an incomplete check withdraws nothing, and says so where the run is read.
  if (!complete) console.log('::warning title=Repair wake::the check was incomplete (a read failed or the call budget ran out); no alarm was withdrawn');
  if (args.includes('--issue')) console.log(raise({ entries, complete, now, ceilings, gh, alarm }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (e) { console.error(`::error title=Repair wake::${String(e?.message ?? e).split('\n')[0]}`); process.exit(1); }
}
