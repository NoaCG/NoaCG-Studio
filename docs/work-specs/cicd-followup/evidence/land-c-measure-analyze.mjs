#!/usr/bin/env node
// cicd-followup land-c-measure analysis: would the direct set, run before the push, have caught
// the PR CI browser failures of the PRs merged in the window? Reads the collector's and the
// planner's cache; no API calls.
//
//   node docs/work-specs/cicd-followup/evidence/land-c-measure-analyze.mjs --cache <dir> [--speed <factor>]
//
// --speed: measured cloud wall minutes per CI table minute at 2 workers (section 4 of the evidence).

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BROWSER_JOB, FROM, UNTIL, failed, prOf } from './land-c-measure-collect.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const CACHE = opt('--cache');
const SPEED = Number(opt('--speed', '0.5'));
const BOOT = Number(opt('--boot', '1'));
const load = (name, dflt) => (existsSync(join(CACHE, name)) ? JSON.parse(readFileSync(join(CACHE, name), 'utf8')) : dflt);
// Per-spec minutes: the summed test durations per file of one nightly's merged Playwright report
// (--report <nightly-report.json>), else the CI duration table (p80 of recent full main runs).
const table = args.includes('--report') ? (() => {
  const rep = JSON.parse(readFileSync(opt('--report'), 'utf8'));
  const minutes = {};
  const walk = (s, file) => { file = s.file || file; for (const x of s.suites || []) walk(x, file);
    for (const sp of s.specs || []) for (const t of sp.tests || []) {
      const k = (sp.file || file).replace(/^.*\//, '');
      minutes[k] = (minutes[k] ?? 0) + (t.results || []).reduce((a, r) => a + (r.duration || 0), 0) / 60000;
    } };
  for (const s of rep.suites) walk(s);
  return { source: { report: opt('--report').replace(/^.*\//, '') }, minutes };
})() : JSON.parse(readFileSync(new URL('../../../../scripts/e2e-durations.json', import.meta.url), 'utf8'));
const tableValues = Object.values(table.minutes).sort((a, b) => a - b);
const median = tableValues[Math.floor(tableValues.length / 2)];
const minutes = (specs) => specs.reduce((s, x) => s + (table.minutes[x] ?? median), 0);
const wall = (specs) => (specs.length ? minutes(specs) * SPEED + BOOT : 0);
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const bare = (s) => s.replace(/^.*\//, '');
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
// The files the PR's own commits changed between a failing head and the next green head: first
// parent, merges skipped, so main merged in does not count (cf22: a repair that only merged main
// is not the PR's own fix).
function repairFiles(from, to) {
  for (const sha of [from, to]) { try { git('cat-file', '-e', `${sha}^{commit}`); } catch { git('fetch', '-q', 'origin', sha); } }
  return [...new Set(git('log', '--first-parent', '--no-merges', '--format=', '--name-only', `${from}..${to}`).split('\n').filter(Boolean))];
}

const pulls = load('pulls.json').items;
const merged = Object.values(pulls).filter((p) => p.merged_at && p.merged_at >= FROM && p.merged_at < UNTIL);
const byRef = new Map(merged.map((p) => [p.head_ref, p.number]));
const mergedSet = new Set(merged.map((p) => p.number));
const runs = Object.values(load('runs.json').items).filter((r) => r.status === 'completed' && mergedSet.has(prOf(r, byRef)));
const runsOf = new Map();
for (const r of runs) { const n = prOf(r, byRef); runsOf.set(n, [...(runsOf.get(n) ?? []), r]); }
for (const list of runsOf.values()) list.sort((a, b) => a.created_at.localeCompare(b.created_at));

// The failing spec files a browser job's kept log names (`1) [chromium] › e2e/x.spec.ts:...`).
function failingSpecs(job) {
  const lines = load(`logs/${job.id}.json`)?.lines;
  if (!lines) return null;
  const out = new Set();
  for (const l of lines) {
    const m = /^\d+\) \[[\w-]+\] › (?:\S+\/)?([\w.-]+\.spec\.ts)/.exec(l);
    if (m) out.add(m[1]);
  }
  return [...out];
}
const SETUP = /^(Set up job|Run actions\/checkout|Run actions\/setup-node|Run \.\/\.github\/actions\/|Post |Complete job|Install|Cache)/;

// Every attempt of every PR run: its browser jobs' verdicts.
function attempts(run) {
  const js = load(`jobs/${run.id}-${run.run_attempt}.json`);
  if (!js) return [{ attempt: run.run_attempt, ok: run.conclusion === 'success', jobs: null, end: run.updated_at }];
  const by = new Map();
  for (const j of js) by.set(j.run_attempt, [...(by.get(j.run_attempt) ?? []), j]);
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([attempt, jobs]) => ({
    attempt, jobs, ok: !jobs.some(failed),
    browserFailed: jobs.filter((j) => BROWSER_JOB.test(j.name) && failed(j)),
    start: jobs.map((j) => j.started_at).filter(Boolean).sort()[0] ?? run.created_at,
    end: jobs.map((j) => j.completed_at).filter(Boolean).sort().pop() ?? run.updated_at,
  }));
}

const failures = [];
for (const [pr, list] of runsOf) {
  for (const [i, run] of list.entries()) {
    for (const a of attempts(run)) {
      for (const job of a.browserFailed ?? []) {
        const plan = load(`plans/${run.head_sha}.json`);
        const step = (job.steps ?? []).find((s) => failed(s));
        const specs = failingSpecs(job);
        const base = { pr, run: run.id, attempt: a.attempt, sha: run.head_sha.slice(0, 12), job: job.name.replace(/ \(.*\)$/, ''), round_trip_min: r1((Date.parse(a.end) - Date.parse(a.attempt === 1 ? run.created_at : a.start)) / 60000) };
        if (!step || SETUP.test(step.name) || !specs?.length) {
          failures.push({ ...base, spec: null, cause: 'infra', why: !step ? 'no failed step (runner lost)' : SETUP.test(step.name) ? `setup step: ${step.name}` : specs ? `no failing test named (step ${step.name}: hang, timeout or crash)` : 'log not read' });
          continue;
        }
        // Cause, cf22 rules: green again on the same commit = flake; a known quarantined spec =
        // flake; otherwise the next run of the PR that passed, after a push with code changed = defect.
        const sameShaGreen = list.some((r, k) => r.head_sha === run.head_sha && (k > i || r.run_attempt > a.attempt) && attempts(r).some((b) => (r.id !== run.id || b.attempt > a.attempt) && b.ok));
        const next = list.slice(i + 1).find((r) => r.head_sha !== run.head_sha && r.conclusion === 'success');
        const quarantined = new Set((plan?.full?.quarantined ?? []).map(bare));
        for (const spec of specs) {
          let cause; let why;
          if (quarantined.has(spec)) { cause = 'flake'; why = 'quarantined at the head'; }
          else if (sameShaGreen) { cause = 'flake'; why = 'green again on the same commit'; }
          else if (next) {
            const fix = repairFiles(run.head_sha, next.head_sha);
            if (!fix.length) { cause = 'main'; why = `next green at ${next.head_sha.slice(0, 12)} after only merging main`; }
            else { cause = 'defect'; why = `next green at ${next.head_sha.slice(0, 12)}; the PR's own commits changed ${fix.length} file(s)${fix.includes(`e2e/${spec}`) ? ', the failing spec among them' : ''}`; }
          } else { cause = 'unresolved'; why = 'no later green PR run'; }
          const inDirect = plan && (plan.direct.specs.includes(spec) || plan.direct.configured.includes(spec));
          const inFull = plan && (plan.full.specs.includes(spec) || plan.full.configured.includes(spec));
          const where = !plan ? 'no plan' : inDirect ? 'direct' : inFull ? 'full only' : 'neither';
          failures.push({ ...base, spec, cause, why, where, direct_n: plan?.direct.specs.length, direct_wall_min: plan ? r1(wall(plan.direct.specs)) : null, full_n: plan ? plan.full.specs.length + plan.full.configured.length : null });
        }
      }
    }
  }
}

// A spec failing on three or more PRs is not one PR's: flag it, as cf22 flags known quarantined specs.
const prsBySpec = new Map();
for (const f of failures) if (f.spec) prsBySpec.set(f.spec, new Set([...(prsBySpec.get(f.spec) ?? []), f.pr]));
for (const f of failures) if (f.spec && prsBySpec.get(f.spec).size >= 3 && f.cause === 'defect') { f.cause = 'shared'; f.why += `; failed on ${prsBySpec.get(f.spec).size} PRs`; }

// The cost side: the direct set of each sampled merged PR's final head.
const sample = merged.filter((p) => p.number % 5 === 0).map((p) => ({ pr: p.number, plan: load(`plans/${p.head_sha}.json`) })).filter((x) => x.plan);
const sampleWall = sample.map((x) => wall(x.plan.direct.specs));
const sampleFull = sample.map((x) => x.plan.full.specs.length + x.plan.full.configured.length);

// Pushes: the distinct heads a PR's runs tested. Each would pay its own pre-push run.
const heads = (pr) => new Set((runsOf.get(pr) ?? []).map((r) => r.head_sha)).size;
const BOUNCE = { median: 30.4, p90: 123.5 }; // cf22: minutes to landing lost per bounce
const ownRuns = (f) => `${f.run}/${f.attempt}`;
// The PR's first pushed head: the head of its first PR run.
const firstHead = (pr) => (runsOf.get(pr) ?? [])[0]?.head_sha;
// Two policies per cap: the direct set before the FIRST push only (cost once per landing, catches
// only failures of that head), and before EVERY push (cost per pushed head, catches all).
const thresholds = [3, 5, 8, 12, 20, 30, 45, 60, 120].map((cap) => {
  const fits = (x) => { const w = wall(x.plan.direct.specs); return w > 0 && w <= cap ? w : 0; };
  const caughtEvery = new Set(failures.filter((f) => f.cause === 'defect' && f.where === 'direct' && f.direct_wall_min <= cap).map(ownRuns));
  const caughtFirst = new Set(failures.filter((f) => f.cause === 'defect' && f.where === 'direct' && f.direct_wall_min <= cap && runsOf.get(f.pr)?.[0] && f.sha === firstHead(f.pr).slice(0, 12)).map(ownRuns));
  const costFirst = sample.reduce((t, x) => t + fits(x), 0) / sample.length;
  const costEvery = sample.reduce((t, x) => t + fits(x) * heads(x.pr), 0) / sample.length;
  const per = (n) => (n * BOUNCE.median) / merged.length;
  return {
    cap_min: cap, landings_that_run_it: `${sample.filter((x) => fits(x) > 0).length}/${sample.length}`,
    first_push: { cost: r1(costFirst), caught: caughtFirst.size, saved: r1(per(caughtFirst.size)), net: r1(per(caughtFirst.size) - costFirst) },
    every_push: { cost: r1(costEvery), caught: caughtEvery.size, saved: r1(per(caughtEvery.size)), net: r1(per(caughtEvery.size) - costEvery) },
  };
});
const own = failures.filter((f) => f.cause === 'defect');
const ownRunSet = new Set(own.map(ownRuns));
const caughtRuns = new Set(own.filter((f) => f.where === 'direct').map(ownRuns));
const first = failures.filter((f) => f.attempt === 1);
const out = {
  window: { FROM, UNTIL, merged: merged.length, pr_runs: runs.length, speed: SPEED, boot_min: BOOT, table: table.source },
  failures_n: failures.length,
  by_cause: failures.reduce((h, f) => ({ ...h, [f.cause]: (h[f.cause] ?? 0) + 1 }), {}),
  own_failures: { specs: own.length, runs: ownRunSet.size, by_where: own.reduce((h, f) => ({ ...h, [f.where]: (h[f.where] ?? 0) + 1 }), {}), runs_caught_by_direct: caughtRuns.size },
  failing_heads_direct_wall_min: { median: r1(q(own.map((f) => f.direct_wall_min), 0.5)), p90: r1(q(own.map((f) => f.direct_wall_min), 0.9)) },
  // Push to the failed verdict, first attempts only (a re-run attempt is not a push).
  round_trip_min: { median: r1(q(first.map((f) => f.round_trip_min), 0.5)), p90: r1(q(first.map((f) => f.round_trip_min), 0.9)) },
  pushes_per_landing: { mean: r1(merged.reduce((t, p) => t + heads(p.number), 0) / merged.length), median: q(merged.map((p) => heads(p.number)), 0.5) },
  thresholds,
  sample: { n: sample.length, direct_n_median: q(sample.map((x) => x.plan.direct.specs.length), 0.5), direct_wall_median: r1(q(sampleWall, 0.5)), direct_wall_p90: r1(q(sampleWall, 0.9)), full_n_median: q(sampleFull, 0.5), walls: sampleWall.map(r1).sort((a, b) => a - b) },
  failures,
};
console.log(JSON.stringify(out, null, 1));
