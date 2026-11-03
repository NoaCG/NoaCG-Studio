#!/usr/bin/env node
// cf03 baseline collector: reads GitHub Actions and pull request history into a local cache.
//
//   node docs/work-specs/cicd-followup/evidence/phase-cf03-collect.mjs --cache <dir> [--max-calls 100]
//
// One invocation is one bounded pass: it stops after --max-calls API calls (default 100) and
// prints how many calls it made and what is left. Run it again until it prints `complete`.
// Completed runs, their jobs and merged pull requests' events are immutable, so each read is
// cached once under <dir> and never repeated. Nothing is written to GitHub. Needs `gh` signed in.
// Signed log URLs are never read; only run, job, step and event metadata.
//
// The window is fixed so a re-run reads the same history: merges to main from FROM to UNTIL.

import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = 'NoaCG/NoaCG-Studio';
export const FROM = '2026-10-24T10:00:45Z'; // seven days before ci01 (139a9724); phase-cf03-baseline.mjs repeats FROM and UNTIL
export const UNTIL = '2026-11-03T12:00:00Z';
const RUN_DAYS_FROM = '2026-10-17'; // PR runs of PRs opened up to a week before the window
const JOB_WORKFLOWS = new Set(['.github/workflows/ci.yml', '.github/workflows/configured-suite.yml']);

const args = process.argv.slice(2);
const opt = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const CACHE = opt('--cache');
const MAX_CALLS = Number(opt('--max-calls', '100'));
if (!CACHE) {
  console.error('usage: --cache <dir> [--max-calls 100]');
  process.exit(2);
}
mkdirSync(CACHE, { recursive: true });

let calls = 0;
class Budget extends Error {}
function api(path) {
  if (calls >= MAX_CALLS) throw new Budget();
  calls += 1;
  const out = execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return JSON.parse(out);
}
const execFileP = promisify(execFile);
async function apiAsync(path) {
  if (calls >= MAX_CALLS) throw new Budget();
  calls += 1;
  const { stdout } = await execFileP('gh', ['api', path], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return JSON.parse(stdout);
}
const file = (name) => join(CACHE, name);
const load = (name, dflt) => (existsSync(file(name)) ? JSON.parse(readFileSync(file(name), 'utf8')) : dflt);
const save = (name, value) => writeFileSync(file(name), JSON.stringify(value));

function days(from, until) {
  const out = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(until); d = new Date(d.getTime() + 86400000)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// 1. Merged pull requests in the window (closed PR list, newest updated first).
function pulls() {
  const state = load('pulls.json', { page: 1, done: false, items: {} });
  while (!state.done) {
    const page = api(`repos/${REPO}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${state.page}`);
    for (const p of page) {
      if (!p.merged_at) continue;
      state.items[p.number] = {
        number: p.number, created_at: p.created_at, merged_at: p.merged_at, head_ref: p.head.ref,
        head_sha: p.head.sha, merge_sha: p.merge_commit_sha, draft: p.draft, user: p.user?.login,
      };
    }
    const oldest = page.length ? page[page.length - 1].updated_at : null;
    state.page += 1;
    if (!page.length || oldest < FROM) state.done = true;
    save('pulls.json', state);
  }
  return Object.values(state.items).filter((p) => p.merged_at >= FROM && p.merged_at < UNTIL);
}

// 2. Every workflow run created in each day (all workflows, all events). GitHub returns at most
// 1,000 runs for one filtered listing, so a day with more is split into six-hour ranges, then hours.
// A range is cached as done only once it ended an hour before it was listed and every run in it had
// completed: a run still going is listed again, with its final status and attempt, on a later pass.
function runs() {
  const state = load('runs.json', { ranges: {}, items: {} });
  const queue = days(RUN_DAYS_FROM, UNTIL).map((d) => ({ key: d, end: `${d}T23:59:59Z` }));
  while (queue.length) {
    const { key, end } = queue.shift();
    const d = state.ranges[key] ?? { page: 1, done: false, split: false, open: 0 };
    if (d.split) { queue.unshift(...d.parts); continue; }
    const listedAt = new Date().toISOString();
    while (!d.done) {
      const res = api(`repos/${REPO}/actions/runs?created=${encodeURIComponent(key)}&per_page=100&page=${d.page}`);
      if (d.page === 1 && res.total_count > 1000) {
        const day = key.slice(0, 10);
        const hours = key.length === 10 ? [0, 6, 12, 18].map((h) => [h, h + 5]) : (() => { const h0 = Number(key.slice(11, 13)); return Array.from({ length: 6 }, (_, i) => [h0 + i, h0 + i]); })();
        const pad = (n) => String(n).padStart(2, '0');
        d.split = true;
        d.parts = hours.map(([h1, h2]) => ({ key: `${day}T${pad(h1)}:00:00Z..${day}T${pad(h2)}:59:59Z`, end: `${day}T${pad(h2)}:59:59Z` }));
        state.ranges[key] = d;
        save('runs.json', state);
        queue.unshift(...d.parts);
        break;
      }
      for (const r of res.workflow_runs) {
        state.items[r.id] = {
          id: r.id, name: r.name, path: r.path, event: r.event, head_branch: r.head_branch,
          head_sha: r.head_sha, run_attempt: r.run_attempt, status: r.status, conclusion: r.conclusion,
          created_at: r.created_at, run_started_at: r.run_started_at, updated_at: r.updated_at,
          display_title: r.display_title,
        };
        if (r.status !== 'completed' && r.created_at < UNTIL) d.open += 1;
      }
      d.page += 1;
      if (res.workflow_runs.length < 100 || (d.page - 1) * 100 >= res.total_count) {
        const last = end < UNTIL ? end : UNTIL; // only runs before the window end matter
        const settled = d.open === 0 && new Date(last).getTime() + 3600000 < new Date(listedAt).getTime();
        if (settled) d.done = true;
        else Object.assign(d, { page: 1, open: 0, relist: true });
        state.ranges[key] = d;
        save('runs.json', state);
        break;
      }
      state.ranges[key] = d;
      save('runs.json', state);
    }
  }
  return Object.values(state.items);
}

// 3. Jobs (all attempts) of every completed ci.yml and configured-suite.yml run tied to a sampled merge.
async function jobs(runList, merges) {
  mkdirSync(file('jobs'), { recursive: true });
  const branches = new Set(merges.map((m) => m.head_ref));
  const shas = new Set(merges.flatMap((m) => [m.merge_sha, m.head_sha]));
  const prKey = new Set(merges.map((m) => `pr-${m.number}-`));
  const wanted = runList.filter((r) => JOB_WORKFLOWS.has(r.path) && r.status === 'completed' && (
    branches.has(r.head_branch) || shas.has(r.head_sha)
    || [...prKey].some((k) => (r.head_branch ?? '').includes(k))));
  const todo = wanted.filter((r) => !existsSync(file(`jobs/${r.id}-${r.run_attempt}.json`)));
  // Eight reads in flight; the call budget still bounds the pass.
  let next = 0;
  let budgetHit = false;
  let errors = 0;
  async function worker() {
    while (next < todo.length && !budgetHit) {
      const r = todo[next++];
      try {
        const all = [];
        for (let page = 1; ; page += 1) {
          const res = await apiAsync(`repos/${REPO}/actions/runs/${r.id}/jobs?filter=all&per_page=50&page=${page}`);
          all.push(...res.jobs.map((j) => ({
            id: j.id, run_attempt: j.run_attempt, name: j.name, status: j.status, conclusion: j.conclusion,
            created_at: j.created_at, started_at: j.started_at, completed_at: j.completed_at,
            steps: (j.steps ?? []).map((st) => ({ name: st.name, conclusion: st.conclusion, started_at: st.started_at, completed_at: st.completed_at })),
          })));
          if (all.length >= res.total_count || res.jobs.length < 50) break;
        }
        save(`jobs/${r.id}-${r.run_attempt}.json`, all);
      } catch (e) {
        if (e instanceof Budget) { budgetHit = true; return; }
        // A server error (502) leaves the run unread; the next pass reads it again.
        errors += 1;
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  const unread = todo.filter((r) => !existsSync(file(`jobs/${r.id}-${r.run_attempt}.json`)));
  if (unread.length) {
    const ids = unread.length <= 5 ? `: ${unread.map((r) => r.id).join(', ')}` : '';
    throw Object.assign(new Budget(), { left: `${unread.length} (${errors} server errors this pass)${ids}` });
  }
  return wanted.length;
}

// 4. Issue events of each merged PR: ready_for_review and merge queue entries and removals.
function events(merges) {
  mkdirSync(file('events'), { recursive: true });
  for (const m of merges) {
    const name = `events/${m.number}.json`;
    if (existsSync(file(name))) continue;
    const all = [];
    for (let page = 1; ; page += 1) {
      const res = api(`repos/${REPO}/issues/${m.number}/events?per_page=100&page=${page}`);
      all.push(...res.map((e) => ({ event: e.event, created_at: e.created_at, commit_id: e.commit_id })));
      if (res.length < 100) break;
    }
    save(name, all);
  }
}

try {
  const merges = pulls();
  const runList = runs();
  events(merges);
  const n = await jobs(runList, merges);
  console.log(JSON.stringify({ pass: 'complete', calls, merges: merges.length, runs: runList.length, jobRuns: n }));
} catch (e) {
  if (!(e instanceof Budget)) throw e;
  console.log(JSON.stringify({ pass: 'budget', calls, jobRunsLeft: e.left ?? 'not yet counted' }));
}
