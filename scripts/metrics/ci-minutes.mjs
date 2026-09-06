#!/usr/bin/env node
// What CI costs per change, from the Actions API (docs/WORKFLOW_ARCHITECTURE.md §1.2, §9).
//
//   npm run metrics:ci                       # the last 200 ci.yml runs
//   npm run metrics:ci -- --limit 500
//
// Runner minutes are summed job durations (the repo is public, so GitHub bills nothing and
// `timing` returns an empty object). The one number to watch is the share of `main` runs whose
// head sha already had a green branch run: on 2026-09-06 that was 496 of 512, 42% of all
// minutes. Needs `gh` authenticated; reads only.

import { execFileSync } from 'node:child_process';

/** `gh api --jq` prints one JSON value per line when paginating; read them all. */
function gh(args) {
  const out = execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();
  const lines = out.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  return lines.length === 1 && Array.isArray(lines[0]) ? lines[0] : lines;
}

function minutes(job) {
  if (!job.started_at || !job.completed_at) return 0;
  return (new Date(job.completed_at) - new Date(job.started_at)) / 60000;
}

function median(values) {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function main() {
  const args = process.argv.slice(2);
  const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : 200;
  const repo = execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], { encoding: 'utf8' }).trim();
  const pages = Math.max(1, Math.ceil(limit / 100));
  const list = [];
  for (let page = 1; page <= pages && list.length < limit; page += 1) {
    list.push(...gh(['api', `repos/${repo}/actions/workflows/ci.yml/runs?per_page=100&page=${page}`, '--jq', '.workflow_runs[] | {id,head_branch,head_sha,event,status,conclusion,created_at}']));
  }
  list.length = Math.min(list.length, limit);
  const greenBranchShas = new Set(list.filter((r) => r.head_branch !== 'main' && r.conclusion === 'success').map((r) => r.head_sha));
  const classes = { main: [], branch: [] };
  let cancelled = 0;
  let mainRerunOfGreen = 0;
  let mainRuns = 0;
  for (const run of list) {
    if (run.status !== 'completed') continue;
    if (run.conclusion === 'cancelled') cancelled += 1;
    const jobs = gh(['api', `repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`, '--jq', '[.jobs[] | {name,started_at,completed_at,conclusion}]']);
    const total = jobs.reduce((sum, j) => sum + minutes(j), 0);
    const shards = jobs.filter((j) => /^E2E \d+\/\d+/.test(j.name)).length;
    const cls = run.head_branch === 'main' ? 'main' : 'branch';
    classes[cls].push({ total, shards, conclusion: run.conclusion });
    if (cls === 'main') {
      mainRuns += 1;
      if (greenBranchShas.has(run.head_sha)) mainRerunOfGreen += 1;
    }
  }
  const all = [...classes.main, ...classes.branch];
  const sum = all.reduce((a, r) => a + r.total, 0);
  console.log(`[metrics:ci] ${repo}, last ${list.length} ci.yml runs`);
  console.log(`  runner minutes: ${sum.toFixed(0)} total; main ${classes.main.reduce((a, r) => a + r.total, 0).toFixed(0)}, branches ${classes.branch.reduce((a, r) => a + r.total, 0).toFixed(0)}`);
  console.log(`  per run (median): main ${median(classes.main.map((r) => r.total)).toFixed(0)} min / ${median(classes.main.map((r) => r.shards))} shards; branch ${median(classes.branch.map((r) => r.total)).toFixed(0)} min / ${median(classes.branch.map((r) => r.shards))} shards`);
  console.log(`  cancelled: ${cancelled} of ${all.length}`);
  console.log(`  main runs whose sha was already green on a branch: ${mainRerunOfGreen} of ${mainRuns}`);
}

main();
