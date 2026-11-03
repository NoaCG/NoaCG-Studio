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
// summed over the run's attempts (each job once: a re-run attempt's copies are dropped; an attempt
// that re-ran some shards pays the extra setup in proportion).
//
// A change's added minutes are the sum over its runs (superseded and failed runs included: they
// were paid for). The change is a product change when any of its runs printed the notice. The verdict
// waits for a complete pass and MIN_N product changes, and judges their mean against the 22.5-minute
// ceiling. Not counted: the E2E retry job, which re-runs only failed specs on merge groups (a
// flaky journey's second run there is a flake cost, M4, not this rule's per-change cost). Each pass
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
// ograf-lifecycle 0.204 + output-font-hold 0.115 (scripts/e2e-durations.json), and its testFactor.
const PROMOTED_TABLE_MINUTES = 0.319;
const TEST_FACTOR = 1.02;
if (!SINCE || !CACHE) {
  console.error('usage: --since <ISO time> --cache <dir> [--max-calls 100]');
  process.exit(2);
}
mkdirSync(CACHE, { recursive: true });
const REPO = 'repos/NoaCG/NoaCG-Studio';
let calls = 0;
class Budget extends Error {}

/**
 * One REST read. THE CACHE RULE: a read is cached only when what it returns can no longer change.
 * That is a completed run's jobs AT ONE ATTEMPT (`version` is the run's `run_attempt`, so a later
 * re-run reads afresh), or one job's annotations (a job id belongs to one attempt). Lists of pulls
 * and runs can still grow or change state, so they are read fresh on every pass.
 */
function api(path, { immutable = false, version = '' } = {}) {
  const file = join(CACHE, `${path.replace(/[^a-z0-9]+/gi, '_')}${version ? `_v${version}` : ''}.json`);
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

/**
 * A completed run's jobs over every attempt, each job once. A re-run attempt lists the jobs it did
 * not re-run again, as copies with the original times (cf03 section 1), so a job is kept once by
 * name, start and end; each kept job belongs to the attempt that really ran it.
 */
function runJobs(run) {
  const all = [];
  for (let page = 1; ; page += 1) {
    const batch = api(`${REPO}/actions/runs/${run.id}/jobs?per_page=100&filter=all&page=${page}`, { immutable: true, version: String(run.run_attempt ?? 1) }).jobs;
    all.push(...batch);
    if (batch.length < 100) break;
  }
  const seen = new Set();
  return all
    .sort((a, b) => (a.run_attempt ?? 1) - (b.run_attempt ?? 1))
    .filter((j) => {
      const key = `${j.name}|${j.started_at}|${j.completed_at}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** A completed run's added minutes, summed over its attempts, or null when its plan printed no critical notice. */
function runAdded(run) {
  const jobs = runJobs(run);
  const plan = jobs.find((j) => j.name === 'E2E plan');
  if (!plan) return null;
  const notes = api(`${REPO}/check-runs/${plan.id}/annotations?per_page=100`, { immutable: true });
  const note = notes.map((n) => NOTICE.exec(n.message ?? '')).find(Boolean);
  if (!note) return null;
  // "All already planned": a shared-change or full plan. The two journeys cf12 promoted are in the
  // shared-change set because of cf12, so such a run is charged their table-minutes times the
  // table's test factor anyway (an over-count when the change's own headers selected them, which
  // keeps the judgement strict).
  if (!note[1]) return { id: run.id, event: run.event, added: 0, promoted: true, minutes: Number((PROMOTED_TABLE_MINUTES * TEST_FACTOR).toFixed(2)) };
  const [, , addedMin, planMin, without, shards] = note.map(Number);
  const share = planMin > 0 ? addedMin / planMin : 0;
  const ran = (j) => j.started_at && j.completed_at;
  let total = 0;
  const attempts = [...new Set(jobs.map((j) => j.run_attempt ?? 1))];
  for (const attempt of attempts) {
    const mine = jobs.filter((j) => (j.run_attempt ?? 1) === attempt && ran(j));
    const parts = mine.filter((j) => /^E2E \d+\/\d+/.test(j.name)).map((j) => {
      const step = (j.steps ?? []).find((s) => s.name === 'E2E shard' && ran(s));
      const job = minutes(j.started_at, j.completed_at);
      const test = step ? minutes(step.started_at, step.completed_at) : 0;
      return { test, setup: job - test };
    });
    // The extra shards' setup, in proportion to the shards this attempt really ran.
    const setup = parts.length && shards > 0 ? Math.max(0, shards - without) * median(parts.map((p) => p.setup)) * (parts.length / shards) : 0;
    const test = parts.reduce((sum, p) => sum + p.test, 0) * share;
    const report = mine.find((j) => j.name === 'Combined E2E report');
    const rep = without === 0 && report ? minutes(report.started_at, report.completed_at) : 0;
    total += test + setup + rep;
  }
  return { id: run.id, event: run.event, added: Number(note[1]), shards, without, attempts: attempts.length, minutes: Number(total.toFixed(2)) };
}

const result = { since: SINCE, ceiling: CEILING, complete: false, calls: 0, changes: [] };
try {
  // Every read that lists history must prove it reached the end, or the pass is incomplete: a list
  // that stops early drops the OLDEST entries (newest first), the first changes after enabling.
  let truncated = 0;
  const pulls = [];
  let reachedSince = false;
  for (let page = 1; page <= 30; page += 1) {
    const batch = api(`${REPO}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`);
    pulls.push(...batch.filter((p) => p.merged_at && p.merged_at > SINCE));
    if (batch.length < 100 || batch.some((p) => p.updated_at < SINCE)) {
      reachedSince = true;
      break;
    }
  }
  if (!reachedSince) truncated += 1;
  // Every ci.yml run since enabling, by event, read once per pass as one shared list (calls grow with
  // the run count, not with the number of changes). GitHub serves at most 1,000 results for a
  // filtered runs query, so the window is read one UTC day at a time, and a day whose collected runs
  // fall short of its `total_count` (or that reaches the cap) marks the pass incomplete.
  const days = [];
  for (let d = Date.parse(`${SINCE.slice(0, 10)}T00:00:00Z`); d <= Date.now(); d += 86_400_000) days.push(new Date(d).toISOString().slice(0, 10));
  const runsSince = (event) => {
    const all = [];
    for (const day of days) {
      let total = 0;
      let got = 0;
      for (let page = 1; ; page += 1) {
        const body = api(`${REPO}/actions/workflows/ci.yml/runs?event=${event}&created=${day}&per_page=100&page=${page}`);
        total = body.total_count ?? 0;
        got += body.workflow_runs.length;
        all.push(...body.workflow_runs.filter((r) => r.created_at > SINCE));
        if (body.workflow_runs.length < 100) break;
      }
      if (got < total || total >= 1000) truncated += 1;
    }
    return all;
  };
  const groupRuns = runsSince('merge_group');
  const prRuns = runsSince('pull_request');
  let pending = 0;
  for (const pr of pulls.sort((a, b) => a.merged_at.localeCompare(b.merged_at))) {
    const mine = prRuns.filter((r) => r.head_branch === pr.head.ref && r.created_at > SINCE && r.created_at <= pr.merged_at);
    const groups = groupRuns.filter((r) => r.head_branch?.includes(`/pr-${pr.number}-`) && r.created_at > SINCE && r.created_at <= pr.merged_at);
    const runs = [];
    for (const run of [...mine, ...groups]) {
      // A run still going (a re-run in progress) is not measured yet, and the pass is not complete.
      if (run.status !== 'completed') {
        pending += 1;
        continue;
      }
      const added = runAdded(run);
      if (added) runs.push(added);
    }
    if (!runs.length) continue;
    result.changes.push({ number: pr.number, merged_at: pr.merged_at, runs, minutes: Number(runs.reduce((s, r) => s + r.minutes, 0).toFixed(2)) });
  }
  result.pending = pending;
  result.truncated = truncated;
  result.complete = pending === 0 && truncated === 0;
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
// No verdict from a partial pass: the budget can stop before the newest changes are read.
result.underCeiling = !result.complete || per.length < MIN_N ? null : result.mean <= CEILING;
if (!result.complete) result.verdict = `not yet: collection incomplete (${per.length} changes so far); run again`;
else if (per.length < MIN_N) result.verdict = `not yet: ${per.length} of ${MIN_N} product changes measured`;
else result.verdict = result.underCeiling ? `under the ${CEILING}-minute ceiling` : `OVER the ${CEILING}-minute ceiling: revert the rule and tell the owner`;
console.log(JSON.stringify(result, null, 1));
console.error(result.complete ? 'complete' : `stopped at ${calls} calls; run again to continue`);
