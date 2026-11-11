#!/usr/bin/env node
// cicd-followup cf22 collector: the repair loop's GitHub history into a local cache.
//
//   node docs/work-specs/cicd-followup/evidence/phase-cf22-collect.mjs --cache <dir> [--max-calls 100]
//
// One invocation is one bounded pass of at most --max-calls API calls (default 100). Run it again
// until it prints `complete`. Read-only: nothing is written to GitHub. Needs `gh` signed in.
// Completed runs, their jobs, closed pull requests' events and job logs are immutable, so each read
// is cached once and never repeated. Job logs are read only for a failed job whose failed step
// cannot be classed by its name (section 2 of phase-cf22.md); only matching marker lines are kept,
// never the log or its signed URL.
//
// The window is fixed so a re-run reads the same history: the 14 days before the phase started.

import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'NoaCG/NoaCG-Studio';
export const FROM = '2026-10-28T18:30:00Z';
export const UNTIL = '2026-11-11T18:30:00Z';
// Runs are listed from a week before FROM so a PR's earlier history is known. The last day is
// listed whole as it stood when read, so the next green of a bounce near the end is seen when it
// came by then; a bounce with none is reported as unresolved.
const LIST_FROM = '2026-10-21';
const LIST_UNTIL = UNTIL;

// Run as a script only: the analysis imports the window and the shared rules from this file.
const MAIN = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
const args = process.argv.slice(2);
const opt = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const CACHE = opt('--cache');
const MAX_CALLS = Number(opt('--max-calls', '100'));
if (MAIN && !CACHE) {
  console.error('usage: --cache <dir> [--max-calls 100]');
  process.exit(2);
}

let calls = 0;
let errors = 0; // server errors this pass: the item stays unread and the next pass reads it again
class Budget extends Error {}
function tolerant(fn) {
  try { fn(); } catch (e) { if (e instanceof Budget) throw e; errors += 1; }
}
function api(path, raw = false) {
  if (calls >= MAX_CALLS) throw new Budget();
  calls += 1;
  const out = execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  return raw ? out : JSON.parse(out);
}
const execFileP = promisify(execFile);
async function apiAsync(path, raw = false) {
  if (calls >= MAX_CALLS) throw new Budget();
  calls += 1;
  const { stdout } = await execFileP('gh', ['api', path], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  return raw ? stdout : JSON.parse(stdout);
}
// Six reads in flight; the call budget still bounds the pass.
async function pool(items, fn, width = 6) {
  let next = 0;
  let budget = false;
  async function worker() {
    while (next < items.length && !budget) {
      const it = items[next++];
      try { await fn(it); } catch (e) { if (e instanceof Budget) budget = true; else errors += 1; }
    }
  }
  await Promise.all(Array.from({ length: width }, worker));
  if (budget) throw new Budget();
}
const file = (name) => join(CACHE, name);
const load = (name, dflt) => (existsSync(file(name)) ? JSON.parse(readFileSync(file(name), 'utf8')) : dflt);
const save = (name, value) => writeFileSync(file(name), JSON.stringify(value));

function days(from, until) {
  const out = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(until); d = new Date(d.getTime() + 86400000)) out.push(d.toISOString().slice(0, 10));
  return out;
}

// 1. Every pull request updated since the listing start (open, closed and merged).
function pulls() {
  const state = load('pulls.json', { page: 1, done: false, items: {} });
  while (!state.done) {
    const page = api(`repos/${REPO}/pulls?state=all&sort=updated&direction=desc&per_page=100&page=${state.page}`);
    for (const p of page) {
      state.items[p.number] = {
        number: p.number, title: p.title, created_at: p.created_at, closed_at: p.closed_at, merged_at: p.merged_at,
        state: p.state, draft: p.draft, head_ref: p.head.ref, head_sha: p.head.sha, user: p.user?.login,
      };
    }
    state.page += 1;
    if (!page.length || page[page.length - 1].updated_at < `${LIST_FROM}T00:00:00Z`) state.done = true;
    save('pulls.json', state);
  }
  return Object.values(state.items);
}

// 2. Every ci.yml run created per day (all events). A day is cached as done once it ended an hour
// before it was listed and every run in it had completed.
function runs() {
  const state = load('runs.json', { ranges: {}, items: {} });
  let unsettled = 0;
  for (const day of days(LIST_FROM, LIST_UNTIL)) {
    const d = state.ranges[day] ?? { page: 1, done: false, open: 0 };
    if (d.done) continue;
    const listedAt = Date.now();
    for (;;) {
      const res = api(`repos/${REPO}/actions/workflows/ci.yml/runs?created=${day}&per_page=100&page=${d.page}`);
      if (res.total_count > 1000) throw new Error(`${day}: over 1,000 runs, split the range`);
      for (const r of res.workflow_runs) {
        state.items[r.id] = {
          id: r.id, event: r.event, head_branch: r.head_branch, head_sha: r.head_sha, run_attempt: r.run_attempt,
          status: r.status, conclusion: r.conclusion, created_at: r.created_at, run_started_at: r.run_started_at,
          updated_at: r.updated_at, pr: (r.pull_requests ?? []).map((p) => p.number),
        };
        if (r.status !== 'completed' && r.created_at < UNTIL) d.open += 1;
      }
      d.page += 1;
      if (res.workflow_runs.length < 100 || (d.page - 1) * 100 >= res.total_count) {
        d.listings = (d.listings ?? 0) + 1;
        const end = Math.min(new Date(`${day}T23:59:59Z`).getTime(), Date.parse(UNTIL));
        const ended = end + 600000 < listedAt; // ten minutes for late listings
        if (ended && (d.open === 0 || d.listings >= 3)) { d.done = true; if (d.open) d.stuck = d.open; }
        else { Object.assign(d, { page: 1, open: 0 }); unsettled += 1; }
        state.ranges[day] = d;
        save('runs.json', state);
        break;
      }
      state.ranges[day] = d;
      save('runs.json', state);
    }
  }
  return { list: Object.values(state.items), unsettled };
}

// The PR a run belongs to: a pull_request run by its PR list or head branch, a merge group run by
// the `gh-readonly-queue/main/pr-<n>-<sha>` branch, a dispatch run by the PR's head branch.
export function prOf(run, byRef) {
  const q = /^gh-readonly-queue\/[^/]+\/pr-(\d+)-/.exec(run.head_branch ?? '');
  if (run.event === 'merge_group') return q ? Number(q[1]) : null;
  if (run.event === 'pull_request' || run.event === 'workflow_dispatch') {
    if (run.pr?.length === 1) return run.pr[0];
    return byRef.get(run.head_branch) ?? null;
  }
  return null;
}

// 3. Issue events of every PR with a non-green ci.yml run in the window (draft and ready changes,
// merge-queue entries and removals, review stamps are statuses and are read from jobs instead).
function events(prs) {
  for (const n of prs) {
    const name = `events/${n}.json`;
    if (existsSync(file(name))) continue;
    tolerant(() => {
    const all = [];
    for (let page = 1; ; page += 1) {
      const res = api(`repos/${REPO}/issues/${n}/events?per_page=100&page=${page}`);
      all.push(...res.map((e) => ({ event: e.event, created_at: e.created_at, commit_id: e.commit_id, actor: e.actor?.login })));
      if (res.length < 100) break;
    }
    save(name, all);
    });
  }
}

// 4. Jobs (all attempts) of every completed ci.yml run of those PRs that did not end in success.
// A successful run's jobs all passed, so its CI gate time is not needed beyond the run's own times;
// the green time of a success is read from its jobs too when it ends a bounce (`greens`).
async function jobs(runList) {
  const todo = runList.filter((r) => !existsSync(file(`jobs/${r.id}-${r.run_attempt}.json`)));
  await pool(todo, async (r) => {
    const all = [];
    for (let page = 1; ; page += 1) {
      const res = await apiAsync(`repos/${REPO}/actions/runs/${r.id}/jobs?filter=all&per_page=50&page=${page}`);
      all.push(...res.jobs.map((j) => ({
        id: j.id, run_attempt: j.run_attempt, name: j.name, status: j.status, conclusion: j.conclusion,
        created_at: j.created_at, started_at: j.started_at, completed_at: j.completed_at,
        steps: (j.steps ?? []).map((st) => ({ name: st.name, conclusion: st.conclusion, started_at: st.started_at, completed_at: st.completed_at })),
      })));
      if (all.length >= res.total_count || res.jobs.length < 50) break; // 50: a 99-job list returns 502 at 100 (cf03)
    }
    save(`jobs/${r.id}-${r.run_attempt}.json`, all);
  });
}

// 5. Marker lines of the logs of failed jobs whose failed step's name does not decide the cause.
// Kept: lines naming a gate, a budget, a failing test, a type or lint error, a runner or network
// error. Timestamps are stripped; nothing else of the log is stored.
const MARKERS = /(::error|::warning|##\[error\]|Error:|ERR!|error TS\d+|✘|\bfailed\b|\bFAIL\b|budget|ceiling|growth|capacity|exceed|refus|Test maintenance|ETIMEDOUT|ECONNRESET|EAI_AGAIN|socket hang up|\b50[234]\b|rate limit|lost communication|shutdown signal|out of memory|ENOSPC|timed out|Timeout of|not ok \d+)/i;
async function logs(failedJobs) {
  const todo = failedJobs.filter((j) => !existsSync(file(`logs/${j.id}.json`)));
  await pool(todo, async (j) => {
    // A failed download (seen in parallel through the proxy) is not cached: the next pass retries.
    const text = await apiAsync(`repos/${REPO}/actions/jobs/${j.id}/logs`, true);
    const lines = text.split('\n').map((l) => l.replace(/^\uFEFF?\S+Z /, '').replace(/\x1b\[[0-9;]*m/g, '').trim())
      .filter((l) => MARKERS.test(l) && !/https?:\/\/\S*(sig=|token=|X-Amz)/i.test(l))
      .map((l) => l.slice(0, 300));
    save(`logs/${j.id}.json`, { lines: lines.length > 600 ? [...lines.slice(0, 100), '…', ...lines.slice(-500)] : lines });
  }, 1);
}

// Which jobs' logs are needed; shared with the analysis so both use one rule.
export const NAMED_STEP = /^(Wait for the review status|E2E protection check|E2E capacity line|Fail unless the selection|Judge the selection|Set up job|Run actions\/checkout|Run actions\/setup-node|Post |Complete job)/;
export function needsLog(job) {
  if (job.conclusion !== 'failure' && job.conclusion !== 'timed_out') return false;
  // The CI gate's own log names the input that failed it, or a capacity (growth) refusal, which
  // fails the gate with every input green.
  if (job.name === 'CI gate') return true;
  if (job.name === 'After the gate') return false;
  const step = (job.steps ?? []).find((s) => s.conclusion === 'failure' || s.conclusion === 'timed_out' || s.conclusion === 'cancelled');
  return !step || !NAMED_STEP.test(step.name);
}

if (MAIN) try {
  for (const d of ['jobs', 'events', 'logs']) mkdirSync(join(CACHE, d), { recursive: true });
  const prList = pulls();
  const byRef = new Map(prList.map((p) => [p.head_ref, p.number]));
  const { list, unsettled } = runs();
  const prRuns = list.filter((r) => r.status === 'completed' && prOf(r, byRef) != null);
  const inWindow = (r) => r.created_at >= FROM && r.created_at < UNTIL;
  const bad = (r) => r.conclusion !== 'success' && r.conclusion !== 'cancelled' && r.conclusion !== 'skipped';
  const touched = new Set(prRuns.filter((r) => inWindow(r) && bad(r)).map((r) => prOf(r, byRef)));
  events([...touched].sort((a, b) => a - b));
  // Jobs of every non-success, non-cancelled run of those PRs (and, for the green time, every run
  // of theirs created in or after the window).
  const want = prRuns.filter((r) => touched.has(prOf(r, byRef)) && r.created_at >= FROM && r.conclusion !== 'cancelled');
  await jobs(want);
  const failed = want.flatMap((r) => load(`jobs/${r.id}-${r.run_attempt}.json`, []).filter(needsLog));
  await logs(failed);
  console.log(JSON.stringify({ pass: unsettled || errors ? 'again' : 'complete', calls, errors, prs: prList.length, runs: list.length, touchedPrs: touched.size, jobRuns: want.length, logs: failed.length }));
} catch (e) {
  if (e instanceof Budget) console.log(JSON.stringify({ pass: 'budget', calls, errors }));
  // A listing that failed (a 502) is read again on the next pass.
  else console.log(JSON.stringify({ pass: 'again', calls, error: String(e.message).split('\n')[0].slice(0, 120) }));
}
