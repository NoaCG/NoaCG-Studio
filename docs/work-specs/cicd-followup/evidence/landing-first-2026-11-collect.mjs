#!/usr/bin/env node
// Landing-first study (run #1967, owner steps 3 to 5): two weeks of Actions history into a cache.
//
//   node docs/work-specs/cicd-followup/evidence/landing-first-2026-11-collect.mjs --cache <dir> [--max-calls 100]
//
// Read-only. One pass makes at most --max-calls API calls; run again until it prints `complete`.
// Run lists are paged by day so no query meets GitHub's 1000-result cap. Jobs are read for a
// sample only: every nightly, and the push, configured and merge-group runs named by --jobs-sample
// (default 40 each, spread evenly over the window). Completed runs and their jobs are immutable,
// so each read is cached once.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = 'NoaCG/NoaCG-Studio';
export const FROM = '2026-10-29';
export const UNTIL = '2026-11-12'; // exclusive
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const CACHE = opt('--cache');
const MAX = Number(opt('--max-calls', '100'));
const SAMPLE = Number(opt('--jobs-sample', '40'));
if (!CACHE) { console.error('usage: --cache <dir>'); process.exit(2); }
mkdirSync(CACHE, { recursive: true });

let calls = 0;
const api = (path) => {
  if (calls >= MAX) throw new Error('budget');
  calls += 1;
  return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 1 << 29 }));
};
const read = (name) => JSON.parse(readFileSync(join(CACHE, name), 'utf8'));
const cached = (name, fn) => {
  const f = join(CACHE, name);
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  const v = fn();
  writeFileSync(f, JSON.stringify(v));
  return v;
};
const slim = (r) => ({
  id: r.id, event: r.event, status: r.status, conclusion: r.conclusion, head_sha: r.head_sha,
  head_branch: r.head_branch, created_at: r.created_at, run_started_at: r.run_started_at,
  updated_at: r.updated_at, run_attempt: r.run_attempt,
  prs: (r.pull_requests || []).map((p) => p.number),
});

function days() {
  const out = [];
  for (let d = new Date(`${FROM}T00:00:00Z`); d < new Date(`${UNTIL}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// [workflow file, events listed per day or for the whole window]
const LISTS = [
  ['ci.yml', 'push', 'window'],
  ['ci.yml', 'merge_group', 'window'],
  ['ci.yml', 'pull_request', 'day'],
  ['configured-suite.yml', 'push', 'window'],
  ['nightly.yml', null, 'window'],
];

let done = true;
try {
  for (const [wf, event, by] of LISTS) {
    const spans = by === 'day' ? days().map((d) => [d, d]) : [[FROM, days().at(-1)]];
    for (const [a, b] of spans) {
      const key = `runs-${wf}-${event || 'all'}-${a}-${b}.json`;
      cached(key, () => {
        const runs = [];
        for (let page = 1; ; page += 1) {
          const q = `repos/${REPO}/actions/workflows/${wf}/runs?per_page=100&page=${page}&created=${a}..${b}${event ? `&event=${event}` : ''}`;
          const r = api(q);
          runs.push(...r.workflow_runs.map(slim));
          if (r.workflow_runs.length < 100) break;
        }
        if (runs.length >= 1000) throw new Error(`${key} hit the 1000 cap`);
        return runs;
      });
    }
  }
  const all = (wf, ev) => {
    const out = [];
    for (const [w, e, by] of LISTS) {
      if (w !== wf || e !== ev) continue;
      const spans = by === 'day' ? days().map((d) => [d, d]) : [[FROM, days().at(-1)]];
      for (const [a, b] of spans) out.push(...JSON.parse(readFileSync(join(CACHE, `runs-${w}-${e || 'all'}-${a}-${b}.json`), 'utf8')));
    }
    return out;
  };
  const pick = (runs, n) => {
    const done = runs.filter((r) => r.status === 'completed').sort((x, y) => x.created_at.localeCompare(y.created_at));
    if (done.length <= n) return done;
    return Array.from({ length: n }, (_, i) => done[Math.floor((i * done.length) / n)]);
  };
  // Push runs that ran the full suite are the ones that did not cancel as superseded.
  const want = [
    ...all('nightly.yml', null).filter((r) => r.status === 'completed'),
    ...pick(all('ci.yml', 'push').filter((r) => r.conclusion !== 'cancelled'), SAMPLE),
    ...pick(all('configured-suite.yml', 'push'), SAMPLE),
    ...pick(all('ci.yml', 'merge_group'), SAMPLE),
    // Every push run that was cancelled or re-run: its conclusion is only the LAST attempt's, so
    // the CI gate's verdict in each attempt is read from the jobs (a run can be red, then green).
    ...all('ci.yml', 'push').filter((r) => r.conclusion === 'cancelled' || r.run_attempt > 1),
    // The push runs on each nightly's commit: did their pass need the failed-spec retry?
    ...all('ci.yml', 'push').filter((r) => all('nightly.yml', null).some((n) => n.head_sha === r.head_sha)),
    // Pull request runs, by outcome: what a superseded head costs before it is cancelled.
    ...pick(days().flatMap((d) => read(`runs-ci.yml-pull_request-${d}-${d}.json`)).filter((r) => r.conclusion === 'cancelled'), SAMPLE),
    ...pick(days().flatMap((d) => read(`runs-ci.yml-pull_request-${d}-${d}.json`)).filter((r) => r.conclusion !== 'cancelled'), SAMPLE),
  ];
  for (const r of want) {
    cached(`jobs-${r.id}.json`, () => {
      const j = api(`repos/${REPO}/actions/runs/${r.id}/jobs?filter=all&per_page=100`);
      return j.jobs.map((x) => ({ name: x.name, conclusion: x.conclusion, started_at: x.started_at, completed_at: x.completed_at, run_attempt: x.run_attempt }));
    });
  }
} catch (e) {
  if (e.message !== 'budget') throw e;
  done = false;
}
console.log(`${done ? 'complete' : 'incomplete, run again'} (${calls} calls this pass)`);
