#!/usr/bin/env node
// cicd-followup land-c-measure collector: the failed PR CI browser jobs of the PRs merged in the
// window, into a local cache.
//
//   node docs/work-specs/cicd-followup/evidence/land-c-measure-collect.mjs --cache <dir> [--max-calls 100]
//
// One invocation is one bounded pass of at most --max-calls GitHub API calls. Run it again until it
// prints `complete`. Read-only: nothing is written to GitHub. Needs `gh` signed in and `git` with
// `origin`. Completed runs, their jobs and job logs are immutable, so each is read once and cached.
// Of a job log only lines naming a spec file or a runner/network error are kept (no signed URL,
// no timestamps). Changed files come from local git (no API call): the PR head of the failing run
// diffed against its merge base with main as main stood when the run was created.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'NoaCG/NoaCG-Studio';
// PRs merged in [FROM, UNTIL). UNTIL is fixed at the time the measurement started, so a re-run reads
// the same history.
export const FROM = '2026-10-29T00:00:00Z';
export const UNTIL = '2026-11-12T19:00:00Z';
// Runs are listed from a week before FROM: a PR merged early in the window ran CI before it.
const LIST_FROM = '2026-10-22';

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
let errors = 0;
class Budget extends Error {}
function api(path, raw = false) {
  if (calls >= MAX_CALLS) throw new Budget();
  calls += 1;
  const out = execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  return raw ? out : JSON.parse(out);
}
const file = (name) => join(CACHE, name);
const load = (name, dflt) => (existsSync(file(name)) ? JSON.parse(readFileSync(file(name), 'utf8')) : dflt);
const save = (name, value) => writeFileSync(file(name), JSON.stringify(value));
function days(from, until) {
  const out = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(until); d = new Date(d.getTime() + 86400000)) out.push(d.toISOString().slice(0, 10));
  return out;
}

// The browser jobs this measurement is about: the offline E2E shards and the configured suite.
export const BROWSER_JOB = /^(E2E \d+\/\d+|Configured E2E \d+\/\d+)/;
export const failed = (j) => j.conclusion === 'failure' || j.conclusion === 'timed_out';

// 1. Closed PRs, newest update first, until the listing passes FROM.
function pulls() {
  const state = load('pulls.json', { page: 1, done: false, items: {} });
  while (!state.done) {
    const page = api(`repos/${REPO}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${state.page}`);
    for (const p of page) {
      state.items[p.number] = { number: p.number, title: p.title, merged_at: p.merged_at, head_ref: p.head.ref, head_sha: p.head.sha };
    }
    state.page += 1;
    if (!page.length || page[page.length - 1].updated_at < FROM) state.done = true;
    save('pulls.json', state);
  }
  return Object.values(state.items).filter((p) => p.merged_at && p.merged_at >= FROM && p.merged_at < UNTIL);
}

// 2. Every ci.yml pull_request run created per day. A day is done once it ended and all its runs completed.
function runs() {
  const state = load('runs.json', { ranges: {}, items: {} });
  let unsettled = 0;
  for (const day of days(LIST_FROM, UNTIL)) {
    const d = state.ranges[day] ?? { page: 1, done: false, open: 0 };
    if (d.done) continue;
    for (;;) {
      const res = api(`repos/${REPO}/actions/workflows/ci.yml/runs?event=pull_request&created=${day}&per_page=100&page=${d.page}`);
      if (res.total_count > 1000) throw new Error(`${day}: over 1,000 runs`);
      for (const r of res.workflow_runs) {
        state.items[r.id] = {
          id: r.id, head_branch: r.head_branch, head_sha: r.head_sha, run_attempt: r.run_attempt, status: r.status,
          conclusion: r.conclusion, created_at: r.created_at, run_started_at: r.run_started_at, updated_at: r.updated_at,
          pr: (r.pull_requests ?? []).map((p) => p.number),
        };
        if (r.status !== 'completed' && r.created_at < UNTIL) d.open += 1;
      }
      d.page += 1;
      if (res.workflow_runs.length < 100 || (d.page - 1) * 100 >= res.total_count) {
        // A day is over at its end or at UNTIL, whichever is first; runs created after UNTIL do not count.
        const ended = Math.min(new Date(`${day}T23:59:59Z`).getTime(), Date.parse(UNTIL)) + 600000 < Date.now();
        // cf22's rule: a run still queued after three listings of an ended day is recorded as stuck.
        d.listings = (d.listings ?? 0) + 1;
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

export function prOf(run, byRef) {
  if (run.pr?.length === 1) return run.pr[0];
  return byRef.get(run.head_branch) ?? null;
}

// 3. Jobs of every attempt of a run that failed or was re-run.
function jobs(run) {
  const name = `jobs/${run.id}-${run.run_attempt}.json`;
  if (existsSync(file(name))) return load(name);
  const all = [];
  for (let page = 1; ; page += 1) {
    const res = api(`repos/${REPO}/actions/runs/${run.id}/jobs?filter=all&per_page=50&page=${page}`);
    all.push(...res.jobs.map((j) => ({
      id: j.id, run_attempt: j.run_attempt, name: j.name, conclusion: j.conclusion, started_at: j.started_at, completed_at: j.completed_at,
      steps: (j.steps ?? []).map((s) => ({ name: s.name, conclusion: s.conclusion })),
    })));
    if (all.length >= res.total_count || res.jobs.length < 50) break;
  }
  save(name, all);
  return all;
}

// 4. Of a failed browser job's log, the lines that name a spec file or an infrastructure error.
const KEEP = /(e2e\/[\w./-]+\.spec\.ts|\[\w+\] › |✘|Error: |ETIMEDOUT|ECONNRESET|EAI_AGAIN|socket hang up|lost communication|shutdown signal|out of memory|ENOSPC|timed out|exceeded|flaky|failed|passed|did not run)/i;
function log(job) {
  const name = `logs/${job.id}.json`;
  if (existsSync(file(name))) return;
  const text = api(`repos/${REPO}/actions/jobs/${job.id}/logs`, true);
  const lines = text.split('\n').map((l) => l.replace(/^﻿?\S+Z /, '').replace(/\x1b\[[0-9;]*m/g, '').trim())
    .filter((l) => KEEP.test(l) && !/https?:\/\/\S*(sig=|token=|X-Amz)/i.test(l))
    .map((l) => l.slice(0, 300));
  save(name, { lines: lines.length > 800 ? [...lines.slice(0, 200), '…', ...lines.slice(-600)] : lines });
}

// 5. Changed files of a run's head, from local git: the head against its merge base with main as it
// stood when the run was created (first parent: queue landings are merge commits, so a PR commit is
// itself reachable from main). Needs history back to LIST_FROM (`git fetch --shallow-since=2026-10-15 origin main`).
function changed(run) {
  const name = `changed/${run.head_sha}.json`;
  if (existsSync(file(name)) && load(name).files.length) return;
  const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try { git('cat-file', '-e', `${run.head_sha}^{commit}`); } catch { git('fetch', '-q', 'origin', run.head_sha); }
  // A landed head: main just before its landing merge commit (the merge-queue commit is made
  // before merged_at, so a time cut would already contain the head and diff to nothing).
  const landing = run.landed && git('log', '--first-parent', '--merges', '--format=%H %P', 'origin/main', `--since=${LIST_FROM}`)
    .split('\n').map((l) => l.split(' ')).find((c) => c.slice(2).includes(run.head_sha));
  const mainThen = landing ? landing[1] : git('rev-list', '-1', '--first-parent', `--before=${run.created_at}`, 'origin/main');
  const base = git('merge-base', mainThen, run.head_sha);
  const files = git('diff', '--name-only', '--no-renames', base, run.head_sha).split('\n').filter(Boolean);
  save(name, { base, mainThen, files });
}

if (MAIN) try {
  for (const d of ['jobs', 'logs', 'changed']) mkdirSync(join(CACHE, d), { recursive: true });
  const merged = pulls();
  const byRef = new Map(merged.map((p) => [p.head_ref, p.number]));
  const mergedSet = new Set(merged.map((p) => p.number));
  const { list, unsettled } = runs();
  // A fixed sample of merged PRs' final heads too (local git only): the cost side, a direct set per
  // landing. Every fifth PR number, so the sample is the same on every pass and on a re-run.
  for (const p of merged.filter((x) => x.number % 5 === 0)) {
    try { changed({ head_sha: p.head_sha, created_at: p.merged_at, landed: true }); } catch { errors += 1; }
  }
  const prRuns = list.filter((r) => r.status === 'completed' && mergedSet.has(prOf(r, byRef)));
  // A run whose listed conclusion is success can still hide a failed first attempt: read re-run ones too.
  const want = prRuns.filter((r) => r.conclusion === 'failure' || r.conclusion === 'timed_out' || r.run_attempt > 1);
  const todoLogs = [];
  for (const r of want) {
    try {
      const js = jobs(r);
      const bad = js.filter((j) => BROWSER_JOB.test(j.name) && failed(j));
      if (bad.length) { changed(r); todoLogs.push(...bad); }
    } catch (e) { if (e instanceof Budget) throw e; errors += 1; }
  }
  for (const j of todoLogs) {
    try { log(j); } catch (e) { if (e instanceof Budget) throw e; errors += 1; }
  }
  console.log(JSON.stringify({ pass: unsettled || errors ? 'again' : 'complete', calls, errors, merged: merged.length, prRuns: prRuns.length, read: want.length, browserJobsFailed: todoLogs.length }));
} catch (e) {
  if (e instanceof Budget) console.log(JSON.stringify({ pass: 'budget', calls, errors }));
  else console.log(JSON.stringify({ pass: 'again', calls, error: String(e.message).split('\n')[0].slice(0, 160) }));
}
