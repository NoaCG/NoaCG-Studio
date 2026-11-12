#!/usr/bin/env node
// cicd-followup land-c-measure analysis: would the direct set, run before the push, have caught
// the PR CI browser failures of the PRs merged in the window? Reads the collector's and the
// planner's cache; no API calls.
//
//   node docs/work-specs/cicd-followup/evidence/land-c-measure-analyze.mjs --cache <dir> [--speed <factor>]
//
// --speed: measured cloud wall minutes per CI table minute at 2 workers (section 4 of the evidence).

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BROWSER_JOB, FROM, UNTIL, failed, prOf } from './land-c-measure-collect.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const CACHE = opt('--cache');
const SPEED = Number(opt('--speed', '0.5'));
const BOOT = Number(opt('--boot', '1'));
const load = (name, dflt) => (existsSync(join(CACHE, name)) ? JSON.parse(readFileSync(join(CACHE, name), 'utf8')) : dflt);
const table = JSON.parse(readFileSync(new URL('../../../../scripts/e2e-durations.json', import.meta.url), 'utf8'));
const tableValues = Object.values(table.minutes).sort((a, b) => a - b);
const median = tableValues[Math.floor(tableValues.length / 2)];
const minutes = (specs) => specs.reduce((s, x) => s + (table.minutes[x] ?? median), 0);
const wall = (specs) => (specs.length ? minutes(specs) * SPEED + BOOT : 0);
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const bare = (s) => s.replace(/^.*\//, '');

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
        const base = { pr, run: run.id, attempt: a.attempt, sha: run.head_sha.slice(0, 12), job: job.name.replace(/ \(.*\)$/, ''), round_trip_min: r1((Date.parse(a.end) - Date.parse(run.created_at)) / 60000) };
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
            const a1 = load(`changed/${run.head_sha}.json`)?.files ?? [];
            const a2 = load(`changed/${next.head_sha}.json`)?.files;
            cause = 'defect'; why = `next green at ${next.head_sha.slice(0, 12)}${a2 ? '' : ' (repair diff not read)'}`;
            if (a2 && a2.length === a1.length && a2.every((f) => a1.includes(f))) why += ', same file set';
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

const own = failures.filter((f) => f.cause === 'defect');
const ownRuns = new Set(own.map((f) => `${f.run}/${f.attempt}`));
const caughtRuns = new Set(own.filter((f) => f.where === 'direct').map((f) => `${f.run}/${f.attempt}`));
const out = {
  window: { FROM, UNTIL, merged: merged.length, pr_runs: runs.length, speed: SPEED, boot_min: BOOT, table: table.source },
  failures_n: failures.length,
  by_cause: failures.reduce((h, f) => ({ ...h, [f.cause]: (h[f.cause] ?? 0) + 1 }), {}),
  own_failures: { specs: own.length, runs: ownRuns.size, by_where: own.reduce((h, f) => ({ ...h, [f.where]: (h[f.where] ?? 0) + 1 }), {}), runs_caught_by_direct: caughtRuns.size },
  failing_heads_direct_wall_min: { median: r1(q(own.map((f) => f.direct_wall_min), 0.5)), p90: r1(q(own.map((f) => f.direct_wall_min), 0.9)) },
  round_trip_min: { median: r1(q(failures.map((f) => f.round_trip_min), 0.5)), p90: r1(q(failures.map((f) => f.round_trip_min), 0.9)) },
  sample: { n: sample.length, direct_n_median: q(sample.map((x) => x.plan.direct.specs.length), 0.5), direct_wall_median: r1(q(sampleWall, 0.5)), direct_wall_p90: r1(q(sampleWall, 0.9)), full_n_median: q(sampleFull, 0.5), walls: sampleWall.map(r1).sort((a, b) => a - b) },
  failures,
};
console.log(JSON.stringify(out, null, 1));
