#!/usr/bin/env node
// cicd-followup cf12: the runner-minutes the critical-journey rule added to real product changes,
// measured from GitHub Actions history after the rule was enabled.
//
//   node docs/work-specs/cicd-followup/evidence/phase-cf12-measure.mjs --since <ISO time> --cache <dir> [--max-calls 100]
//
// `--since` is when the enabling merge reached main. Every pull request merged after it is a
// candidate; for each, every ci.yml run of the change is read (its pull_request runs on the head
// branch created after `--since`, and its merge_group runs), with their jobs and the `E2E plan`
// job's annotations. A run counts when its plan printed the `Critical journeys` notice, which the
// plan job prints only for a product change. Its added runner-minutes are:
//
//   the E2E shards' test-step minutes x (added table-minutes / the blocking plan's table-minutes)
//   + (shards - shards without the journeys) x the run's median shard setup (job minus test step)
//   + the Combined E2E report job, when the plan without the journeys ran no shard at all
//
// A change's added minutes are the sum over its runs (superseded and failed runs included: they
// were paid for). The change is a product change when any of its runs printed the notice. The verdict
// waits for MIN_N product changes and judges their mean against the 22.5-minute ceiling. Each pass
// makes at most --max-calls API calls and caches every read of a completed run, so repeat it until
// it prints "complete". Reads metadata and annotations only, no logs. Prints JSON.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const SINCE = arg('--since');
const CACHE = arg('--cache');
const MAX_CALLS = Number(arg('--max-calls', 100));
const CEILING = 22.5;
// The verdict waits for this many product changes: cf03's minimum sample per side for an M3
// median (section 5.1, the `none` and `cap+cfg` rows). Below it the script reports and judges nothing.
const MIN_N = 12;
if (!SINCE || !CACHE) {
  console.error('usage: --since <ISO time> --cache <dir> [--max-calls 100]');
  process.exit(2);
}
mkdirSync(CACHE, { recursive: true });
const REPO = 'repos/NoaCG/NoaCG-Studio';
let calls = 0;
class Budget extends Error {}

/** One REST read; `immutable` reads are cached for good, the rest only for this pass. */
function api(path, { immutable = false } = {}) {
  const file = join(CACHE, `${path.replace(/[^a-z0-9]+/gi, '_')}.json`);
  if (immutable && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  if (calls >= MAX_CALLS) throw new Budget();
  calls += 1;
  const out = JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  if (immutable) writeFileSync(file, JSON.stringify(out));
  return out;
}

const minutes = (a, b) => (Date.parse(b) - Date.parse(a)) / 60000;
const median = (xs) => {
  const s = [...xs].sort((x, y) => x - y);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : 0;
};
const NOTICE = /product change: (?:added (\d+) critical spec\(s\) \(([\d.]+) of ([\d.]+) table-min; shards (\d+) -> (\d+)\)|all critical specs already planned)/;

/** A completed run's added minutes, or null when its plan printed no critical notice. */
function runAdded(run) {
  const jobs = api(`${REPO}/actions/runs/${run.id}/jobs?per_page=100&filter=all`, { immutable: true }).jobs;
  const plan = jobs.find((j) => j.name === 'E2E plan');
  if (!plan) return null;
  const notes = api(`${REPO}/check-runs/${plan.id}/annotations?per_page=100`, { immutable: true });
  const note = notes.map((n) => NOTICE.exec(n.message ?? '')).find(Boolean);
  if (!note) return null;
  if (!note[1]) return { id: run.id, event: run.event, added: 0, minutes: 0 };
  const [, , addedMin, planMin, without, shards] = note.map(Number);
  const shardJobs = jobs.filter((j) => /^E2E \d+\/\d+/.test(j.name) && j.started_at && j.completed_at);
  const parts = shardJobs.map((j) => {
    const step = (j.steps ?? []).find((s) => s.name === 'E2E shard' && s.started_at && s.completed_at);
    const job = minutes(j.started_at, j.completed_at);
    const test = step ? minutes(step.started_at, step.completed_at) : 0;
    return { job, test, setup: job - test };
  });
  const report = jobs.find((j) => j.name === 'Combined E2E report' && j.started_at && j.completed_at);
  const share = planMin > 0 ? addedMin / planMin : 0;
  const test = parts.reduce((s, p) => s + p.test, 0) * share;
  const setup = Math.max(0, shards - without) * median(parts.map((p) => p.setup));
  const rep = without === 0 && report ? minutes(report.started_at, report.completed_at) : 0;
  return { id: run.id, event: run.event, added: Number(note[1]), shards, without, minutes: Number((test + setup + rep).toFixed(2)) };
}

const result = { since: SINCE, ceiling: CEILING, complete: false, calls: 0, changes: [] };
try {
  const pulls = [];
  for (let page = 1; page <= 5; page += 1) {
    const batch = api(`${REPO}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`);
    pulls.push(...batch.filter((p) => p.merged_at && p.merged_at > SINCE));
    if (batch.length < 100 || batch.every((p) => p.updated_at < SINCE)) break;
  }
  // Every merge-group run since enabling, read once per pass and paged to the end (newest first,
  // so one page would drop the earliest changes' runs once more than 100 exist).
  const groupRuns = [];
  for (let page = 1; ; page += 1) {
    const batch = api(`${REPO}/actions/workflows/ci.yml/runs?event=merge_group&created=${encodeURIComponent(`>=${SINCE}`)}&per_page=100&page=${page}`).workflow_runs;
    groupRuns.push(...batch);
    if (batch.length < 100) break;
  }
  for (const pr of pulls.sort((a, b) => a.merged_at.localeCompare(b.merged_at))) {
    const branch = encodeURIComponent(pr.head.ref);
    const mine = api(`${REPO}/actions/workflows/ci.yml/runs?branch=${branch}&event=pull_request&per_page=100`, { immutable: true }).workflow_runs
      .filter((r) => r.created_at > SINCE && r.created_at <= pr.merged_at);
    const groups = groupRuns.filter((r) => r.head_branch?.includes(`/pr-${pr.number}-`) && r.created_at > SINCE && r.created_at <= pr.merged_at);
    const runs = [];
    for (const run of [...mine, ...groups]) {
      if (run.status !== 'completed') continue;
      const added = runAdded(run);
      if (added) runs.push(added);
    }
    if (!runs.length) continue;
    result.changes.push({ number: pr.number, merged_at: pr.merged_at, runs, minutes: Number(runs.reduce((s, r) => s + r.minutes, 0).toFixed(2)) });
  }
  result.complete = true;
} catch (error) {
  if (!(error instanceof Budget)) throw error;
}
result.calls = calls;
const per = result.changes.map((c) => c.minutes);
result.n = per.length;
result.mean = per.length ? Number((per.reduce((a, b) => a + b, 0) / per.length).toFixed(2)) : null;
result.median = per.length ? Number(median(per).toFixed(2)) : null;
result.max = per.length ? Math.max(...per) : null;
result.minN = MIN_N;
// Whether the plan job's notice was seen at all: n 0 with no notice is a broken pipe, not a cheap rule.
result.noticeRuns = result.changes.reduce((s, c) => s + c.runs.length, 0);
result.underCeiling = per.length < MIN_N ? null : result.mean <= CEILING;
if (per.length < MIN_N) result.verdict = `not yet: ${per.length} of ${MIN_N} product changes measured`;
else result.verdict = result.underCeiling ? `under the ${CEILING}-minute ceiling` : `OVER the ${CEILING}-minute ceiling: revert the rule and tell the owner`;
console.log(JSON.stringify(result, null, 1));
console.error(result.complete ? 'complete' : `stopped at ${calls} calls; run again to continue`);
