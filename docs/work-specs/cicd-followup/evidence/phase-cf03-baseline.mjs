#!/usr/bin/env node
// cf03 baseline: per-merge records from the collector's cache, then M1 to M5, spread and sample sizes.
//
//   node docs/work-specs/cicd-followup/evidence/phase-cf03-baseline.mjs derive --cache <dir> --out <records.json>
//   node docs/work-specs/cicd-followup/evidence/phase-cf03-baseline.mjs report --records <records.json>
//   node docs/work-specs/cicd-followup/evidence/phase-cf03-baseline.mjs rule <merge-sha>   # which sides it ends
//
// `derive` needs the collector's cache (phase-cf03-collect.mjs) and git history of main back to the
// window start (merge diffs give the changed paths). `report` needs only the records file, which is
// committed beside this script (phase-cf03-records.json), so a checker can recompute every number in
// phase-cf03.md without the API. Definitions are in phase-cf03.md section 1; this file implements
// them and nothing else. Times are minutes.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tierOfJob } from '../../../../scripts/growth-controls.mjs';

// The window: the same two values as phase-cf03-collect.mjs (that file runs on import, so it is not imported).
const FROM = '2026-10-24T10:00:45Z';
const UNTIL = '2026-11-03T12:00:00Z';
const CI = '.github/workflows/ci.yml';
const CONFIGURED = '.github/workflows/configured-suite.yml';
// Manual-only workflows (drills and trials) are not a per-landing cost (#2011, PR #2012): their
// minutes are reported apart as drill minutes, not in M3.
const MANUAL_ONLY = /^\.github\/workflows\/(endurance|alarm-test|jev-svg-qualification|rerecord-screenshots|jev-svg-eval)\.yml$/;

// ---- which landings end a before or after side (phase-cf03.md section 4.2) ----
// A landing ends a side when it changes how CI runs a change: a per-change workflow or action, a
// script one of them runs, any module such a script imports (its import closure, read from the
// merge commit), a data file the planner packs from, a Playwright or stack config, the dependencies
// or the build's toolchain. The group and metric follow from who runs the file. Anything else is
// workload that landed throughout the reference window and is inside the spread.
const CFG = (g) => g.endsWith('+cfg');
const SHARDED = (g) => !g.startsWith('none');
const ALL = 'all';
const notTest = (f) => !/\.test\.m?js$/.test(f);
// What `npm run build` runs besides the gates: its configs and build steps (the Build job is the
// critical path of most runs). Its scripts are also reached as roots below.
const BUILD_TOOLCHAIN = /^(eslint\.config\.js|tsconfig[^/]*\.json|vite\.config\.ts|\.dependency-cruiser\.cjs)$/;
// Per-change workflows and the metrics and groups a change to what they run can move.
const RUNNERS = [
  { file: CI, metrics: ['m1', 'm2', 'm3'], groups: ALL },
  { file: CONFIGURED, metrics: ['m1', 'm3'], groups: CFG, alsoM3All: true },
  { file: '.github/workflows/post-land.yml', metrics: ['m3'], groups: ALL },
  { file: '.github/workflows/quarantine.yml', metrics: ['m3'], groups: ALL },
  { file: '.github/workflows/deploy-verify.yml', metrics: ['m3'], groups: ALL },
];
// A root script's own scope, where it is narrower than its workflow's: the configured suite's
// scripts move M1 only for the +cfg groups (and M3 for all, the suite runs on every landing), the
// catalog gate's only for the sharded groups.
const rootScope = (f) => (/^scripts\/configured-/.test(f) ? { metrics: ['m1', 'm3'], groups: CFG, alsoM3All: true }
  : /^scripts\/(catalog-|e2e-run-integrity)/.test(f) ? { metrics: ['m1', 'm2', 'm3'], groups: SHARDED } : null);

const showCache = new Map();
function show(sha, path) {
  const k = `${sha}:${path}`;
  if (!showCache.has(k)) {
    try { showCache.set(k, execFileSync('git', ['show', k], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 })); } catch { showCache.set(k, null); }
  }
  return showCache.get(k);
}
const SCRIPT_REF = /\bscripts\/[\w./-]+\.(?:mjs|cjs|js)\b/g;
// Roots: scripts a runner's text names, directly, through `npm run <name>` in package.json, or
// through a local action it uses.
function rootsOf(sha, runner) {
  const text = show(sha, runner) ?? '';
  const pkg = JSON.parse(show(sha, 'package.json') ?? '{"scripts":{}}').scripts ?? {};
  const texts = [text];
  for (const m of text.matchAll(/npm (?:run(?:-script)?|test)\s+([\w:.-]+)/g)) if (pkg[m[1]]) texts.push(pkg[m[1]]);
  for (const m of text.matchAll(/uses:\s*\.\/(\.github\/actions\/[\w.-]+)/g)) texts.push(show(sha, `${m[1]}/action.yml`) ?? '');
  return new Set(texts.flatMap((t) => [...t.matchAll(SCRIPT_REF)].map((m) => m[0])).filter(notTest));
}
// The import closure of a set of scripts: static and dynamic relative imports, resolved in the tree.
function closure(sha, roots) {
  const seen = new Set(); const stack = [...roots];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    const text = show(sha, f);
    if (text == null) continue;
    seen.add(f);
    const dir = f.split('/').slice(0, -1);
    for (const m of text.matchAll(/(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const parts = [...dir];
      for (const seg of m[1].split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
      const target = parts.join('/');
      if (/\.(mjs|cjs|js|json)$/.test(target) && !seen.has(target)) stack.push(target);
    }
  }
  return seen;
}
const closureCache = new Map();
function runnerClosures(sha) {
  if (!closureCache.has(sha)) {
    closureCache.set(sha, RUNNERS.map((r) => {
      const roots = [...rootsOf(sha, r.file)];
      return { runner: r, perRoot: roots.map((root) => ({ root, files: closure(sha, [root]) })) };
    }));
  }
  return closureCache.get(sha);
}

/** The rule entries a merge's changes match: { what, metrics, groups, alsoM3All }. */
function matchedEntries(sha, files, ci) {
  const out = [];
  const add = (what, scope) => out.push({ what, ...scope });
  for (const f of files) {
    if (f === CI) {
      if (ci.other) add('ci.yml outside the configured jobs', { metrics: ['m1', 'm2', 'm3'], groups: ALL });
      if (ci.configured) add('ci.yml configured jobs', { metrics: ['m1', 'm3'], groups: CFG });
    } else if (f === CONFIGURED || f.startsWith('.github/actions/configured-stack/')) add(`${f}`, { metrics: ['m1', 'm3'], groups: CFG, alsoM3All: true });
    else if (f.startsWith('.github/actions/')) add(`${f}`, { metrics: ['m1', 'm2', 'm3'], groups: ALL });
    else if (RUNNERS.some((r) => r.file === f)) add(`${f}`, { metrics: ['m3'], groups: ALL });
    else if (f === 'package-lock.json' || (f === 'package.json' && ci.pkg) || BUILD_TOOLCHAIN.test(f)) add(`${f} (dependencies or build toolchain)`, { metrics: ['m1', 'm2', 'm3'], groups: ALL });
    else if (f === 'scripts/e2e-durations.json' || f === 'playwright.config.ts') add(`${f} (shard packing, offline E2E config)`, { metrics: ['m1', 'm2', 'm3'], groups: ALL });
    else if (f === 'playwright.catalog.config.ts') add(`${f}`, { metrics: ['m1', 'm2', 'm3'], groups: SHARDED });
    else if (f === 'playwright.live.config.ts' || f === 'supabase/config.toml') add(`${f}`, { metrics: ['m1', 'm3'], groups: CFG, alsoM3All: true });
  }
  const code = files.filter((f) => /\.(mjs|cjs|js|json)$/.test(f) && notTest(f) && !f.startsWith('.github/'));
  if (code.length) {
    for (const sideSha of [sha, `${sha}^1`]) {
      for (const { runner, perRoot } of runnerClosures(sideSha)) {
        for (const { root, files: cl } of perRoot) {
          const hit = code.find((f) => cl.has(f));
          if (!hit) continue;
          const scopeKey = JSON.stringify(rootScope(root) ?? runner);
          if (out.some((e) => e.file === hit && e.scopeKey === scopeKey)) continue; // one line per file and scope
          const scope = rootScope(root) ?? runner;
          add(`${hit} (run by ${runner.file.split('/').pop()} via ${root})`, { metrics: scope.metrics, groups: scope.groups, alsoM3All: scope.alsoM3All, file: hit, scopeKey });
        }
      }
    }
  }
  return out;
}

const GROUPS = ['none', 'small', 'cap', 'none+cfg', 'small+cfg', 'cap+cfg'];

export const changedFiles = (sha) => execFileSync('git', ['diff', '--name-only', `${sha}^1`, sha], { encoding: 'utf8' }).split('\n').filter(Boolean);

// Which ci.yml jobs a merge's diff touches: hunks inside the `configured`/`configured-verdict` job
// blocks, or anywhere else (another job, triggers, concurrency, env).
function ciTouched(sha) {
  const diff = execFileSync('git', ['diff', '-U0', `${sha}^1`, sha, '--', CI], { encoding: 'utf8' });
  if (!diff) return { configured: false, other: false };
  const text = execFileSync('git', ['show', `${sha}:${CI}`], { encoding: 'utf8' }).split('\n');
  const blocks = [];
  text.forEach((line, i) => { const m = /^ {2}([a-z][\w-]*):\s*$/.exec(line); if (m) blocks.push({ key: m[1], at: i + 1 }); });
  const jobAt = (n) => { let k = null; for (const b of blocks) if (b.at <= n) k = b.key; return k; };
  const out = { configured: false, other: false };
  for (const h of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(h[1]); const len = h[2] === undefined ? 1 : Math.max(1, Number(h[2]));
    for (let n = start; n < start + len; n += 1) {
      if (['configured', 'configured-verdict'].includes(jobAt(n))) out.configured = true; else out.other = true;
    }
  }
  return out;
}

/** What a merge ends: { metric: [groups] }, with the rule entries that matched. */
export function sideEnds(sha, files = changedFiles(sha)) {
  const ci = files.includes(CI) ? ciTouched(sha) : { configured: false, other: false };
  // package.json counts when a changed line is a dependency version or the build script, not when
  // a script entry is added for a tool (most package.json edits).
  ci.pkg = files.includes('package.json') && execFileSync('git', ['diff', '-U0', `${sha}^1`, sha, '--', 'package.json'], { encoding: 'utf8' })
    .split('\n').some((l) => /^[+-]\s*"(build|[@\w./-]+)":\s*"(\^|~|\d|npm:|file:|git|https?:|\*|latest)/.test(l) || /^[+-]\s*"build":/.test(l));
  const ends = {}; const why = new Set();
  for (const e of matchedEntries(sha, files, ci)) {
    why.add(e.what);
    const gs = e.groups === ALL ? GROUPS : GROUPS.filter(e.groups);
    for (const m of e.metrics) ends[m] = [...new Set([...(ends[m] ?? []), ...(m === 'm3' && e.alsoM3All ? GROUPS : gs)])];
  }
  for (const m of Object.keys(ends)) ends[m] = GROUPS.filter((g) => ends[m].includes(g));
  return { ends, why: [...why] };
}

// Sides: B before ci01, D while the cicd-improvement rows landed, A after the last of them. Each
// boundary is the landing PR's merged_at, when it reached main (its merge commit's own time is
// earlier, while it waited in the queue).
export const CI01_AT = '2026-10-31T10:07:34Z'; // #1848
export const CI16_AT = '2026-11-02T00:56:41Z'; // #1948
export const CF04_AT = '2026-11-03T09:50:01Z'; // #2014
export function side(t) {
  if (t < CI01_AT) return 'B';
  if (t < CI16_AT) return 'D';
  if (t < CF04_AT) return 'A';
  return 'A2'; // after cf04, the first landing of this run that ends a side
}

const min = (a, b) => (new Date(b) - new Date(a)) / 60000;
const jobMinutes = (j) => (j.started_at && j.completed_at ? Math.max(0, min(j.started_at, j.completed_at)) : 0);

// ---- grouping (phase-cf03.md section 4) ----
export function pathClass(files) {
  const bot = (f) => f === 'e2e/quarantine.json' || f === 'scripts/e2e-traced.json';
  if (files.length && files.every(bot)) return 'bot';
  const docs = (f) => /\.md$/.test(f) || f.startsWith('docs/') || f.startsWith('contracts/rules/');
  if (files.length && files.every(docs)) return 'docs';
  const infra = (f) => f.startsWith('.github/') || /^package(-lock)?\.json$/.test(f) || /^playwright.*config/.test(f)
    || /^scripts\/(e2e-|configured|candidate-dispatch)/.test(f) || f.startsWith('supabase/');
  if (files.some(infra)) return 'infra';
  const product = (f) => /^(src|api|public|cli|app\.html|index\.html|vite)/.test(f);
  if (files.some(product)) return 'product';
  if (files.some((f) => f.startsWith('e2e/'))) return 'tests';
  return 'tooling';
}

// Offline E2E shards the plan gave the final head: none, a few, or the 15-shard cap (MAX_SHARDS).
export function shardBucket(mode, shards) {
  if (mode === 'none' || !shards) return 'none';
  return shards >= 15 ? 'cap' : 'small';
}

// The comparable-change group (phase-cf03.md section 4): shard bucket, plus `+cfg` when the final
// head's PR run started configured jobs (selected configured E2E on a local stack, since ci06).
export const groupOf = (r) => `${r.bucket}${r.configured_jobs > 0 ? '+cfg' : ''}`;

// Reference records for a group's spread: side B when it holds at least 12 of the group, otherwise
// every record measured after ci06 landed (the configured groups exist only from then).
export const CI06_AT = '2026-10-31T21:28:08Z'; // #1872 merged_at
export function reference(records, g) {
  const b = records.filter((r) => r.side === 'B' && groupOf(r) === g);
  const bySideAt = (list) => [...list].sort((x, y) => x.side_at.localeCompare(y.side_at));
  if (b.length >= 12) return { basis: 'B', records: bySideAt(b) };
  return { basis: 'after ci06', records: bySideAt(records.filter((r) => r.side_at >= CI06_AT && groupOf(r) === g)) };
}

// ---- derive ----
function jobKey(name) {
  if (name === 'Build') return 'build';
  if (name === 'E2E plan') return 'plan';
  if (/^E2E \d+\/\d+/.test(name)) return 'e2e';
  if (name.startsWith('E2E retry')) return 'e2e-retry';
  if (name.startsWith('Catalog calibration')) return 'e2e-catalog';
  if (name.startsWith('Guided mod')) return 'guided-mod';
  if (name === 'Factory gates') return 'factory';
  if (name.startsWith('Re-run')) return 'rerun';
  if (name.startsWith('Combined E2E report')) return 'e2e-report';
  if (name.startsWith('Configured E2E verdict')) return 'configured-verdict';
  if (name.startsWith('Configured E2E')) return 'configured';
  if (name === 'CI gate') return 'gate';
  if (name === 'Reviewed') return 'reviewed';
  return name;
}
const NEEDS = {
  e2e: ['plan'], 'e2e-retry': ['plan', 'e2e'], 'e2e-catalog': ['plan'], 'guided-mod': ['plan'],
  rerun: ['build', 'factory'], 'e2e-report': ['plan', 'e2e'], configured: ['plan'],
  'configured-verdict': ['plan', 'configured'],
  gate: ['build', 'plan', 'e2e', 'e2e-retry', 'e2e-catalog', 'factory', 'guided-mod', 'configured', 'configured-verdict'],
};

export function stepClass(name) {
  if (/^(Set up job|Run actions\/checkout|Run actions\/setup-node|Run \.\/\.github\/actions\/(node-modules|playwright-chromium|configured-stack)|Run supabase\/setup-cli|Start the local Supabase|Export the local stack|Assert the schema|Create the test account|Resolve the Playwright|Download shard|Bot token|Install Claude Code)/.test(name)) return 'setup';
  if (/^(Build \(|CLI package|Work out what this change|Pack the suite|E2E protection check|E2E capacity line|Does this change touch|Configured selection|Newest weekly growth)/.test(name)) return 'build';
  if (/^(E2E shard|Configured E2E suite|Factory-tier tests|Run factory gates|Catalog |claude plugin|Tests left the tree|Assert the suite actually ran|Configured E2E|Retry|Re-run)/.test(name)) return 'test';
  return 'other';
}

function normJob(name) {
  return name.replace(/\d+\/\d+/, 'n/m').replace(/\s*\(.*\)\s*$/, '');
}

function derive(cache, out) {
  const read = (n) => JSON.parse(readFileSync(join(cache, n), 'utf8'));
  const pulls = Object.values(read('pulls.json').items).filter((p) => p.merged_at >= FROM && p.merged_at < UNTIL)
    .sort((a, b) => a.merged_at.localeCompare(b.merged_at));
  const runs = Object.values(read('runs.json').items);
  // A re-run attempt lists every job of the run again: the ones it did not re-run are copies of the
  // earlier attempt with the same name and the same start and end times. Only the first is real.
  const parsed = new Map();
  const jobsRaw = (r) => {
    const f = join(cache, 'jobs', `${r.id}-${r.run_attempt}.json`);
    if (!parsed.has(f)) parsed.set(f, existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null);
    return parsed.get(f);
  };
  const deduped = new Map();
  const jobsOf = (r) => {
    const raw = jobsRaw(r);
    if (!raw) return null;
    if (deduped.has(raw)) return deduped.get(raw);
    const seen = new Set();
    const out = [...raw].sort((a, b) => (a.run_attempt ?? 1) - (b.run_attempt ?? 1)).filter((j) => {
      if (!j.started_at) return true;
      const k = `${j.name}|${j.started_at}|${j.completed_at}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    deduped.set(raw, out);
    return out;
  };
  const runMinutes = (r) => {
    const js = jobsOf(r);
    if (js) return { minutes: js.reduce((s, j) => s + jobMinutes(j), 0), exact: true };
    if (!r.run_started_at || r.status !== 'completed') return { minutes: 0, exact: false };
    return { minutes: Math.max(0, min(r.run_started_at, r.updated_at)), exact: false };
  };
  const records = [];
  for (const p of pulls) {
    const files = changedFiles(p.merge_sha);
    const ev = read(`events/${p.number}.json`);
    const inPr = (r) => r.created_at >= new Date(new Date(p.created_at).getTime() - 60000).toISOString() && r.created_at <= p.merged_at;
    const branchRuns = runs.filter((r) => r.head_branch === p.head_ref && inPr(r) && r.event !== 'merge_group' && r.event !== 'push');
    const prRuns = branchRuns.filter((r) => !MANUAL_ONLY.test(r.path));
    const drillRuns = branchRuns.filter((r) => MANUAL_ONLY.test(r.path));
    const prShas = new Set(prRuns.map((r) => r.head_sha));
    const prOther = runs.filter((r) => !prRuns.includes(r) && inPr(r) && (
      (r.path === 'dynamic/github-code-scanning/codeql' && r.display_title === `PR #${p.number}`)
      || (r.event === 'deployment_status' && prShas.has(r.head_sha))));
    const queueRuns = runs.filter((r) => r.path === CI && r.event === 'merge_group' && (r.head_branch ?? '').includes(`/pr-${p.number}-`));
    const landRuns = runs.filter((r) => r.head_sha === p.merge_sha && (r.event === 'push' || r.event === 'deployment_status' || r.event === 'dynamic'));

    // M1: the final head's PR CI run(s), from creation to the first successful CI gate job.
    const finalRuns = prRuns.filter((r) => r.path === CI && r.head_sha === p.head_sha && (r.event === 'pull_request' || r.event === 'workflow_dispatch'));
    let m1 = null; let finalRun = null; let gateJob = null;
    if (finalRuns.length) {
      const start = finalRuns.map((r) => r.created_at).sort()[0];
      for (const r of finalRuns) {
        for (const j of jobsOf(r) ?? []) {
          if (j.name === 'CI gate' && j.conclusion === 'success' && (!gateJob || j.completed_at < gateJob.completed_at)) { gateJob = j; finalRun = r; }
        }
      }
      if (gateJob) m1 = min(start, gateJob.completed_at);
    }
    // Both required checks: the CI gate and the Reviewed check (it reads the review stamp).
    let m1Required = null;
    if (gateJob) {
      const rev = finalRuns.flatMap((r) => (jobsOf(r) ?? []).filter((j) => j.name === 'Reviewed' && j.conclusion === 'success')).map((j) => j.completed_at).sort()[0];
      if (rev) m1Required = min(finalRuns.map((r) => r.created_at).sort()[0], rev > gateJob.completed_at ? rev : gateJob.completed_at);
    }
    const readyEv = ev.filter((e) => e.event === 'ready_for_review' && e.created_at <= p.merged_at).map((e) => e.created_at).sort();
    const readyAt = readyEv.length ? readyEv[readyEv.length - 1] : p.created_at;
    const m1Open = gateJob ? Math.max(0, min(readyAt, gateJob.completed_at)) : null;

    // M2: last queue entry before the merge; the merge group run whose head is the merge commit.
    const entries = ev.filter((e) => e.event === 'added_to_merge_queue' && e.created_at <= p.merged_at).map((e) => e.created_at).sort();
    const removals = ev.filter((e) => e.event === 'removed_from_merge_queue' && min(e.created_at, p.merged_at) > 2).length;
    const tq = entries.length ? entries[entries.length - 1] : null;
    let group = runs.find((r) => r.path === CI && r.event === 'merge_group' && r.head_sha === p.merge_sha);
    if (!group && tq) group = queueRuns.filter((r) => r.created_at >= tq).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    let m2 = null;
    if (group && tq) {
      const gj = (jobsOf(group) ?? []).filter((j) => j.name === 'CI gate' && j.conclusion === 'success').sort((a, b) => a.completed_at.localeCompare(b.completed_at))[0];
      if (gj) {
        const exec = min(group.created_at, gj.completed_at);
        const total = min(tq, p.merged_at);
        m2 = { wait: Math.max(0, total - exec), exec, pre: Math.max(0, min(tq, group.created_at)), batched: !(group.head_branch ?? '').includes(`/pr-${p.number}-`) };
      }
    }

    // M3: every job minute of the change's runs, all attempts.
    const sum = (list) => list.reduce((s, r) => s + runMinutes(r).minutes, 0);
    const queueAll = group && !queueRuns.includes(group) ? [...queueRuns, group] : queueRuns;
    const m3 = { pr: sum(prRuns) + sum(prOther), queue: sum(queueAll), land: sum(landRuns) };
    m3.total = m3.pr + m3.queue + m3.land;
    // Where the minutes go, by workflow and trigger.
    const by = {};
    const wf = (r) => `${(r.path ?? '').replace('.github/workflows/', '').replace('dynamic/github-code-scanning/', '')}:${r.event}`;
    for (const r of [...prRuns, ...prOther]) by[`pr ${wf(r)}`] = (by[`pr ${wf(r)}`] ?? 0) + runMinutes(r).minutes;
    for (const r of queueAll) by['queue ci.yml:merge_group'] = (by['queue ci.yml:merge_group'] ?? 0) + runMinutes(r).minutes;
    for (const r of landRuns) by[`land ${wf(r)}`] = (by[`land ${wf(r)}`] ?? 0) + runMinutes(r).minutes;
    // The same minutes by growth tier (scripts/growth-controls.mjs tierOfJob, the repository's own
    // split). Runs without job reads count whole under their workflow's tier; CodeQL is GitHub's
    // default setup, outside the tiers.
    const tiers = { offline: 0, backend: 0, graphics: 0, overhead: 0, codeql: 0 };
    for (const r of [...prRuns, ...prOther, ...queueAll, ...landRuns]) {
      if ((r.path ?? '').includes('codeql')) { tiers.codeql += runMinutes(r).minutes; continue; }
      const js = jobsOf(r);
      if (js) for (const j of js) tiers[tierOfJob(r.path, j.name)] += jobMinutes(j);
      // An unread run counts whole in its workflow's tier; quarantine.yml's spec jobs are `Quarantine (...)`, offline.
      else tiers[tierOfJob(r.path, r.path.endsWith('quarantine.yml') ? 'Quarantine (' : '')] += runMinutes(r).minutes;
    }
    const heads = new Set(prRuns.filter((r) => r.path === CI).map((r) => r.head_sha)).size;
    m3.approx = [...prRuns, ...prOther, ...queueAll, ...landRuns].filter((r) => !runMinutes(r).exact).reduce((s, r) => s + runMinutes(r).minutes, 0);

    // M4: waste. Per head sha and job name: a failed, timed-out or cancelled attempt before a success.
    const waste = { review: 0, flake: 0, hang: 0, superseded: 0, queueChurn: 0, repair: 0, byJob: {} };
    const flakes = []; const hangs = [];
    let reruns = 0;
    const bySha = new Map();
    // A re-run attempt counts only when it re-ran a job that tests something: re-running the
    // Reviewed check after the stamp (and the gate that follows it) is the review wait, not a re-run.
    const bookkeeping = /^(Reviewed|CI gate|After the gate|Combined E2E report|Vercel accepted)/;
    let inRunRetries = 0;
    for (const r of [...prRuns, ...queueAll, ...landRuns].filter((x) => x.path === CI || x.path === CONFIGURED)) {
      const js = jobsOf(r);
      if (!js) continue;
      const attempts = new Set(js.filter((j) => (j.run_attempt ?? 1) > 1 && j.started_at && !bookkeeping.test(j.name) && j.conclusion !== 'skipped').map((j) => j.run_attempt));
      reruns += attempts.size;
      inRunRetries += js.filter((j) => j.name.startsWith('E2E retry') && j.started_at && j.conclusion === 'success' && min(j.started_at, j.completed_at) > 0.2).length;
      const k = `${r.path}|${r.head_sha}|${r.event === 'push' ? 'push' : r.event === 'merge_group' ? 'queue' : 'pr'}`;
      if (!bySha.has(k)) bySha.set(k, []);
      bySha.get(k).push(...js.map((j) => ({ ...j, run: r })));
    }
    // timeout-minutes of each job, from ci.yml and configured-suite.yml at 561cd60c.
    const capOf = (path, n) => {
      if (path === CONFIGURED) return /^Configured shard plan/.test(n) ? 5 : /^Configured E2E shard/.test(n) ? 40 : /^Configured E2E/.test(n) ? 20 : /^Configured quarantine/.test(n) ? 10 : null;
      const k = jobKey(n);
      return { build: 15, plan: 5, e2e: 20, 'e2e-retry': 45, 'e2e-catalog': 25, 'guided-mod': 10, factory: 20, rerun: 35, 'e2e-report': 10, configured: 40, 'configured-verdict': 15, gate: 5, reviewed: 5 }[k]
        ?? (/^Vercel accepted/.test(n) ? 10 : /^After the gate/.test(n) ? 10 : null);
    };
    for (const [, js] of bySha) {
      const byName = new Map();
      for (const j of js) {
        const n = j.name;
        if (!byName.has(n)) byName.set(n, []);
        byName.get(n).push(j);
      }
      for (const [n, list] of byName) {
        if (n === 'Reviewed') {
          for (const j of list) if (j.conclusion !== 'success' && j.conclusion !== 'skipped') waste.review += jobMinutes(j);
          continue;
        }
        list.sort((a, b) => (a.started_at ?? '').localeCompare(b.started_at ?? ''));
        const ok = list.find((j) => j.conclusion === 'success');
        for (const j of list) {
          if (!ok || j === ok || (j.started_at ?? '') > (ok.started_at ?? '')) continue;
          if (j.conclusion !== 'failure' && j.conclusion !== 'cancelled' && j.conclusion !== 'timed_out') continue;
          const mins = jobMinutes(j);
          const cap = capOf(j.run.path, n);
          const isHang = cap && mins >= cap - 0.5;
          if (isHang) { waste.hang += mins; hangs.push({ job: n, run: j.run.id, attempt: j.run_attempt, minutes: +mins.toFixed(1) }); }
          else { waste.flake += mins; flakes.push({ job: n, run: j.run.id, attempt: j.run_attempt, conclusion: j.conclusion, minutes: +mins.toFixed(1) }); }
          const key = normJob(n);
          waste.byJob[key] = (waste.byJob[key] ?? 0) + mins;
        }
      }
    }
    // Superseded: PR runs cancelled while running (a newer push); repair: failed PR runs on a head that never passed.
    for (const r of prRuns.filter((x) => x.path === CI || x.path === CONFIGURED)) {
      const js = jobsOf(r) ?? [];
      const m = js.reduce((s, j) => s + jobMinutes(j), 0);
      if (r.conclusion === 'cancelled' && r.head_sha !== p.head_sha) waste.superseded += m;
      else if (r.conclusion === 'failure' && r.head_sha !== p.head_sha) waste.repair += m;
    }
    for (const r of queueAll.filter((x) => x !== group)) waste.queueChurn += runMinutes(r).minutes;

    // M5: critical path of the final PR run's successful attempt and of the merge group run.
    const crit = (r, gj) => {
      if (!r || !gj) return null;
      const js = (jobsRaw(r) ?? []).filter((j) => j.run_attempt === gj.run_attempt && j.started_at);
      const byKey = new Map();
      for (const j of js) {
        const k = jobKey(j.name);
        if (!byKey.has(k) || j.completed_at > byKey.get(k).completed_at) byKey.set(k, j);
      }
      const chain = [];
      let k = 'gate';
      while (k) {
        const j = byKey.get(k);
        if (!j) break;
        chain.unshift(j);
        const preds = (NEEDS[k] ?? []).map((x) => byKey.get(x)).filter(Boolean);
        k = preds.length ? jobKey(preds.sort((a, b) => b.completed_at.localeCompare(a.completed_at))[0].name) : null;
      }
      const parts = { wait: 0, setup: 0, build: 0, test: 0, other: 0 };
      for (const j of chain) {
        parts.wait += Math.max(0, min(j.created_at ?? j.started_at, j.started_at));
        for (const s of j.steps ?? []) if (s.started_at && s.completed_at) parts[stepClass(s.name)] += Math.max(0, min(s.started_at, s.completed_at));
      }
      // When each of the gate's inputs finished, minutes after the run was created, and the spread
      // of the sharded jobs (E2E and configured): what a candidate that shortens one chain can gain.
      const ends = {};
      for (const [key, j] of byKey) if (key !== 'gate' && key !== 'reviewed' && NEEDS.gate.includes(key)) ends[key] = +min(r.created_at, j.completed_at).toFixed(2);
      const shardStats = (k) => {
        const d = js.filter((j) => jobKey(j.name) === k && j.completed_at).map(jobMinutes).sort((a, b) => a - b);
        return d.length ? { n: d.length, max: +d[d.length - 1].toFixed(2), median: +median(d).toFixed(2), mean: +(d.reduce((a, b) => a + b, 0) / d.length).toFixed(2) } : null;
      };
      const first = js.map((j) => j.created_at ?? j.started_at).sort()[0];
      return { ends, e2eShards: shardStats('e2e'), configuredShards: shardStats('configured'), chain: chain.map((j) => normJob(j.name)).join(' > '), span: min(r.created_at, gj.completed_at), startDelay: first ? Math.max(0, min(r.created_at, first)) : 0, ...Object.fromEntries(Object.entries(parts).map(([a, b]) => [a, +b.toFixed(2)])) };
    };
    const groupGate = group ? (jobsOf(group) ?? []).filter((j) => j.name === 'CI gate' && j.conclusion === 'success').sort((a, b) => a.completed_at.localeCompare(b.completed_at))[0] : null;

    // Group: E2E mode and shard count, configured selection, from the final PR run's successful attempt.
    let mode = 'none'; let shards = 0; let configuredJobs = 0;
    if (finalRun && gateJob) {
      for (const j of (jobsRaw(finalRun) ?? []).filter((x) => x.run_attempt === gateJob.run_attempt)) {
        const mm = /^E2E \d+\/(\d+) \((\w+)\)/.exec(j.name);
        if (mm && j.conclusion !== 'skipped') { mode = mm[2]; shards = Number(mm[1]); }
        if (jobKey(j.name) === 'configured' && j.conclusion !== 'skipped' && j.started_at) configuredJobs += 1;
      }
    }
    const sideAt = finalRun ? finalRun.created_at : p.merged_at;
    const r2 = (x) => (x == null ? null : +x.toFixed(2));
    const { ends, why } = sideEnds(p.merge_sha, files);
    records.push({
      ends, ends_why: why,
      number: p.number, merged_at: p.merged_at, merge_sha: p.merge_sha, head_ref: p.head_ref, side: side(sideAt), side_at: sideAt,
      path_class: pathClass(files), files: files.length, mode, shards, bucket: shardBucket(mode, shards), configured_jobs: configuredJobs,
      m1: r2(m1), m1_required: r2(m1Required), m1_open: r2(m1Open), final_run: finalRun?.id ?? null,
      m2_wait: r2(m2?.wait), m2_exec: r2(m2?.exec), m2_pre: r2(m2?.pre), batched: m2?.batched ?? null, queue_entries: entries.length, dequeues: removals, group_run: group?.id ?? null,
      tiers: Object.fromEntries(Object.entries(tiers).map(([a, b]) => [a, r2(b)])),
      heads, drill_min: r2(sum(drillRuns)), m3_by: Object.fromEntries(Object.entries(by).map(([a, b]) => [a, r2(b)])),
      m3: r2(m3.total), m3_pr: r2(m3.pr), m3_queue: r2(m3.queue), m3_land: r2(m3.land), m3_approx: r2(m3.approx),
      reruns, in_run_retries: inRunRetries, review_wait_min: r2(waste.review), flake_min: r2(waste.flake), hang_min: r2(waste.hang), superseded_min: r2(waste.superseded), queue_churn_min: r2(waste.queueChurn), repair_min: r2(waste.repair),
      waste_by_job: Object.fromEntries(Object.entries(waste.byJob).map(([a, b]) => [a, r2(b)])), flakes, hangs,
      pr_crit: crit(finalRun, gateJob), queue_crit: crit(group, groupGate),
    });
  }
  // One record per line: diffable, and small enough to commit beside this script.
  writeFileSync(out, `{"from":${JSON.stringify(FROM)},"until":${JSON.stringify(UNTIL)},"records":[\n${records.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`);
  console.log(`[derive] ${records.length} merges -> ${out}`);
}

// ---- statistics ----
export function quantile(values, q) { // nearest rank
  const s = values.filter((v) => v != null).sort((a, b) => a - b);
  if (!s.length) return null;
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
}
export const median = (v) => quantile(v, 0.5);
export function mad(values) {
  const v = values.filter((x) => x != null);
  const m = median(v);
  return 1.4826 * median(v.map((x) => Math.abs(x - m)));
}
export function rng(seed) { // mulberry32, fixed seed so a checker gets the same numbers
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Minimum sample size per side (phase-cf03.md section 5.2): the smallest n for which, resampling the
// reference data, (1) with no change the observed statistic drops by more than the spread in at most
// 5% of trials, and (2) with a true reduction of twice the spread it drops by more than the spread
// in at least 80% of trials. Floors: 8 per side (no group is compared on fewer), and 20 for a p95
// (below 20 the nearest-rank p95 is the sample maximum).
export function minSample(values, spread, stat, { seed = 3, trials = 2000, nMin = 8, nMax = 120 } = {}) {
  const v = values.filter((x) => x != null);
  if (v.length < 8 || !(spread > 0)) return null;
  const rand = rng(seed);
  const draw = (n, shift) => Array.from({ length: n }, () => Math.max(0, v[Math.floor(rand() * v.length)] - shift));
  for (let n = nMin; n <= nMax; n += 1) {
    let fp = 0; let tp = 0;
    for (let t = 0; t < trials; t += 1) {
      const before = stat(draw(n, 0));
      if (before - stat(draw(n, 0)) > spread) fp += 1;
      if (before - stat(draw(n, 2 * spread)) > spread) tp += 1;
    }
    if (fp / trials <= 0.05 && tp / trials >= 0.8) return n;
  }
  return `>${nMax}`;
}

function summary(values) {
  const v = values.filter((x) => x != null);
  if (!v.length) return { n: 0 };
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const f = (x) => (x == null ? null : +x.toFixed(1));
  return { n: v.length, median: f(median(v)), p95: f(quantile(v, 0.95)), mean: f(mean), p25: f(quantile(v, 0.25)), p75: f(quantile(v, 0.75)) };
}

function report(recordsPath) {
  const { records } = JSON.parse(readFileSync(recordsPath, 'utf8'));
  const out = {};
  const metrics = { m1: 'm1', m1_required: 'm1_required', m1_open: 'm1_open', m2_wait: 'm2_wait', m2_exec: 'm2_exec', m3: 'm3', m3_pr: 'm3_pr', m3_queue: 'm3_queue', m3_land: 'm3_land' };
  const sides = ['B', 'D', 'A', 'A2'];
  out.bySide = {};
  for (const s of sides) {
    const rs = records.filter((r) => r.side === s);
    out.bySide[s] = { merges: rs.length };
    for (const [k, f] of Object.entries(metrics)) out.bySide[s][k] = summary(rs.map((r) => r[f]));
  }
  // Groups (section 4) and their sizes per side.
  out.groups = {};
  for (const r of records) {
    const g = groupOf(r);
    out.groups[g] ??= {};
    out.groups[g][r.side] = (out.groups[g][r.side] ?? 0) + 1;
  }
  out.bySideGroup = {};
  for (const s of sides) {
    for (const g of Object.keys(out.groups)) {
      const rs = records.filter((r) => r.side === s && groupOf(r) === g);
      if (!rs.length) continue;
      out.bySideGroup[`${s} ${g}`] = Object.fromEntries(['m1', 'm2_wait', 'm2_exec', 'm3'].map((k) => [k, summary(rs.map((r) => r[k]))]));
    }
  }
  // Spread and minimum sample size per side (section 5), per group from its reference records.
  out.spread = {};
  for (const g of Object.keys(out.groups)) {
    const ref = reference(records, g);
    if (ref.records.length < 8) { out.spread[g] = { basis: ref.basis, n: ref.records.length, note: 'fewer than 8 reference merges: no spread, no comparison' }; continue; }
    out.spread[g] = { basis: ref.basis, n: ref.records.length };
    for (const k of ['m1', 'm2_wait', 'm2_exec', 'm3']) {
      const v = ref.records.map((r) => r[k]).filter((x) => x != null);
      // The same spread inside the longest stretch of the reference with no landing that ends this
      // group's side for this metric. The larger of the two is the spread (it makes an improvement
      // harder to claim, never easier).
      const metric = k.startsWith('m2') ? 'm2' : k;
      const cuts = records.filter((r) => (r.ends[metric] ?? []).includes(g)).map((r) => r.merged_at);
      const bounds = [ref.records[0].side_at, ...cuts.filter((t) => t > ref.records[0].side_at && t < ref.records[ref.records.length - 1].side_at), '9999'];
      let longest = [];
      for (let i = 0; i + 1 < bounds.length; i += 1) {
        const seg = ref.records.filter((r) => r.side_at >= bounds[i] && r.side_at < bounds[i + 1] && r[k] != null).map((r) => r[k]);
        if (seg.length > longest.length) longest = seg;
      }
      const whole = mad(v);
      const inner = longest.length >= 8 ? mad(longest) : null;
      const sp = Math.max(whole, inner ?? 0);
      out.spread[g][k] = {
        n: v.length, median: +median(v).toFixed(1), spreadWhole: +whole.toFixed(2), longestClean: longest.length, spreadClean: inner == null ? null : +inner.toFixed(2),
        spread: +sp.toFixed(2), iqr: +(quantile(v, 0.75) - quantile(v, 0.25)).toFixed(1),
        nMedian: minSample(v, sp, median), nP95: minSample(v, sp, (x) => quantile(x, 0.95), { nMin: 20 }),
      };
    }
  }
  // M4: rates and the jobs that waste the most time.
  out.m4 = {};
  for (const s of sides) {
    const rs = records.filter((r) => r.side === s);
    const byJob = {};
    for (const r of rs) for (const [j, m] of Object.entries(r.waste_by_job)) byJob[j] = (byJob[j] ?? 0) + m;
    const total = (f) => +rs.reduce((a, r) => a + (r[f] ?? 0), 0).toFixed(1);
    out.m4[s] = {
      merges: rs.length,
      withFlake: rs.filter((r) => r.flakes.length).length,
      withHang: rs.filter((r) => r.hangs.length).length,
      withRerun: rs.filter((r) => r.reruns > 0).length,
      withInRunRetry: rs.filter((r) => r.in_run_retries > 0).length,
      dequeued: rs.filter((r) => r.dequeues > 0).length,
      multiGroup: rs.filter((r) => r.queue_churn_min > 0).length,
      minutes: { reviewWait: total('review_wait_min'), flake: total('flake_min'), hang: total('hang_min'), superseded: total('superseded_min'), queueChurn: total('queue_churn_min'), repair: total('repair_min'), all: total('m3') },
      topJobs: Object.entries(byJob).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([j, m]) => [j, +m.toFixed(1)]),
    };
  }
  // M5: critical-path composition per side, PR and merge group.
  out.m5 = {};
  for (const s of sides) {
    for (const which of ['pr_crit', 'queue_crit']) {
      const cs = records.filter((r) => r.side === s && r[which]).map((r) => r[which]);
      if (!cs.length) continue;
      const chains = {};
      for (const c of cs) (chains[c.chain] ??= []).push(c);
      out.m5[`${s} ${which}`] = {
        n: cs.length,
        span: summary(cs.map((c) => c.span)),
        byChain: Object.fromEntries(Object.entries(chains).sort((a, b) => b[1].length - a[1].length).slice(0, 4).map(([k, list]) => [k, {
          n: list.length, share: +(list.length / cs.length).toFixed(2),
          ...Object.fromEntries(['span', 'wait', 'setup', 'build', 'test', 'other'].map((f) => [f, +median(list.map((c) => c[f])).toFixed(1)])),
        }])),
      };
    }
  }
  // Candidates (section 7): each rewrites the finish time of one chain of the gate, from that
  // chain's measured parts, and the merge's M1 (or M2 execution) moves by the change in the
  // latest-finishing input. Applied to every merge measured after ci06 (today's configuration).
  const BUILD_SPLIT = 0.58; // longest part of the Build step run in parallel: the gates' share, local timing (section 7)
  const BUILD_CACHE = 0.65; // the Build step with warm ESLint and tsc caches: 35% of it is ESLint and tsc, local timing
  const CFG_SETUP = 2.0; // per configured job: configured-stack step median 1.77 plus job setup
  const CAT_SETUP = 0.9; // catalog gate start before its tests
  const transforms = {
    'configured bins halved': (e, c) => ({ ...e, ...(e['configured-verdict'] && c.configuredShards ? { 'configured-verdict': e['configured-verdict'] - 0.5 * Math.max(0, c.configuredShards.max - CFG_SETUP), configured: (e.configured ?? 0) - 0.5 * Math.max(0, c.configuredShards.max - CFG_SETUP) } : {}) }),
    'catalog gate in two jobs': (e) => ({ ...e, ...(e['e2e-catalog'] > 1.5 ? { 'e2e-catalog': e['e2e-catalog'] - 0.5 * Math.max(0, e['e2e-catalog'] - CAT_SETUP) } : {}) }),
    'Build split in parallel jobs': (e) => ({ ...e, ...(e.build ? { build: 0.4 + BUILD_SPLIT * (e.build - 0.4) } : {}) }),
    'Build with warm lint and type caches': (e) => ({ ...e, ...(e.build ? { build: 0.4 + BUILD_CACHE * (e.build - 0.4) } : {}) }),
    'E2E shards balanced': (e, c) => ({ ...e, ...(e.e2e && c.e2eShards ? { e2e: e.e2e - (c.e2eShards.max - c.e2eShards.mean), 'e2e-retry': e['e2e-retry'] ? e['e2e-retry'] - (c.e2eShards.max - c.e2eShards.mean) : undefined } : {}) }),
  };
  transforms['configured stack start halved'] = (e) => ({ ...e, ...(e['configured-verdict'] > 1.5 ? { 'configured-verdict': e['configured-verdict'] - CFG_SETUP / 2, configured: (e.configured ?? 0) - CFG_SETUP / 2 } : {}) });
  transforms['configured bins halved + catalog in two'] = (e, c) => transforms['catalog gate in two jobs'](transforms['configured bins halved'](e, c), c);
  transforms['the four chain changes together'] = (e, c) => ['configured bins halved', 'catalog gate in two jobs', 'Build split in parallel jobs', 'E2E shards balanced'].reduce((acc, k) => transforms[k](acc, c), e);
  const latest = (e) => Math.max(...Object.values(e).filter((x) => typeof x === 'number'));
  const after = records.filter((r) => r.side_at >= CI06_AT && r.pr_crit && r.m1 != null);
  const afterQ = records.filter((r) => r.side_at >= CI06_AT && r.queue_crit && r.m2_exec != null);
  const f1 = (x) => +x.toFixed(1);
  out.candidates = { basis: `merges measured after ci06: ${after.length} with M1, ${afterQ.length} with M2 execution`, base: {
    m1: { median: f1(median(after.map((r) => r.m1))), p95: f1(quantile(after.map((r) => r.m1), 0.95)) },
    m2_exec: { median: f1(median(afterQ.map((r) => r.m2_exec))), p95: f1(quantile(afterQ.map((r) => r.m2_exec), 0.95)) },
  } };
  for (const [name, t] of Object.entries(transforms)) {
    const m1 = after.map((r) => r.m1 - (latest(r.pr_crit.ends) - latest(t(r.pr_crit.ends, r.pr_crit))));
    const m2 = afterQ.map((r) => r.m2_exec - (latest(r.queue_crit.ends) - latest(t(r.queue_crit.ends, r.queue_crit))));
    const byGroup = {};
    for (const g of new Set(after.map(groupOf))) {
      const idx = after.map((r, i) => (groupOf(r) === g ? i : -1)).filter((i) => i >= 0);
      byGroup[g] = { n: idx.length, m1Before: f1(median(idx.map((i) => after[i].m1))), m1After: f1(median(idx.map((i) => m1[i]))) };
    }
    out.candidates[name] = {
      m1: { median: f1(median(m1)), p95: f1(quantile(m1, 0.95)), dMedian: f1(median(m1) - out.candidates.base.m1.median), dP95: f1(quantile(m1, 0.95) - out.candidates.base.m1.p95) },
      m2_exec: { median: f1(median(m2)), p95: f1(quantile(m2, 0.95)), dMedian: f1(median(m2) - out.candidates.base.m2_exec.median), dP95: f1(quantile(m2, 0.95) - out.candidates.base.m2_exec.p95) },
      byGroup,
    };
  }
  console.log(JSON.stringify(out, null, 1));
}

const [cmd, ...rest] = process.argv.slice(2);
const opt = (n) => (rest.includes(n) ? rest[rest.indexOf(n) + 1] : null);
if (cmd === 'derive') derive(opt('--cache'), opt('--out'));
else if (cmd === 'report') report(opt('--records'));
else if (cmd === 'rule') console.log(JSON.stringify(sideEnds(rest[0])));
else if (cmd) { console.error('usage: derive --cache <dir> --out <file> | report --records <file> | rule <merge-sha>'); process.exit(2); }
