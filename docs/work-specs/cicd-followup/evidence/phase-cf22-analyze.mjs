#!/usr/bin/env node
// cicd-followup cf22: the repair loop, measured and ranked. Read-only; no API calls.
//
//   node docs/work-specs/cicd-followup/evidence/phase-cf22-analyze.mjs derive --cache <dir> --out <records.json>
//   node docs/work-specs/cicd-followup/evidence/phase-cf22-analyze.mjs report --records <records.json>
//
// `derive` turns the collector's cache (phase-cf22-collect.mjs) into one record per bounce and per
// PR. It needs a full (not shallow) clone to read what each repair push changed, and fetches a PR's
// head ref with git when a commit is missing. `report` prints every table of phase-cf22.md from
// the records alone. The rules are in phase-cf22.md section 2; each is named where it is applied.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FROM, UNTIL, prOf } from './phase-cf22-collect.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const mode = args[0];

const min = (a, b) => (Date.parse(b) - Date.parse(a)) / 60000;
const round1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
// Nearest-rank quantiles, as cf03.
export function quantile(values, q) {
  const v = values.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.max(0, Math.ceil(q * v.length) - 1)];
}
const stats = (v) => {
  const x = v.filter((y) => y != null);
  return { n: x.length, median: round1(quantile(x, 0.5)), p90: round1(quantile(x, 0.9)), sum: round1(x.reduce((s, y) => s + y, 0)) };
};

// ---------------------------------------------------------------------------------------------
// derive

const RED = new Set(['failure', 'timed_out']);
// A job stopped without a verdict counts with the failures (cf03's fail-then-pass counts failed,
// cancelled and timed-out attempts); a run cancelled as a whole (superseded) is never read here.
const STOPPED = new Set(['failure', 'timed_out', 'cancelled']);
// Jobs that only report: never a cause. CI gate restates its inputs (its log is read for the
// capacity refusal, which fails it alone); After the gate acts on main; the report merges artifacts.
const VERDICT_ONLY = new Set(['CI gate', 'After the gate', 'Combined E2E report']);
// Setup steps (cf03 M5 "setup"): a failure in one is infrastructure.
const SETUP_STEP = /^(Set up job|Run actions\/checkout|Run actions\/setup-node|Run actions\/(upload|download)-artifact|Run \.\/\.github\/actions\/|Install|Post |Complete job)/i;
// Policy steps by name: gate refusal.
const POLICY_STEP = /^(Wait for the review status|E2E protection check)/;
// Build-log policy gates (scripts/gates.mjs names): a budget or limit, not the code's behaviour.
const POLICY_CHECKS = /^\[gates\] check:(goals-budget|file-budgets|function-budget) FAILED/;
const INFRA_LINE = /^(##\[error\]|npm ERR!).*(ETIMEDOUT|ECONNRESET|EAI_AGAIN|socket hang up|\b50[234]\b|lost communication|shutdown signal|ENOSPC|out of memory|registry fetch)/i;
const SPEC_LINE = /^##\[error\]\s+\d+\) \[\w+\] › (e2e\/[\w./-]+\.spec\.ts)/;

const cacheLog = (cache, id) => {
  const f = join(cache, `logs/${id}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).lines ?? [] : null;
};

// The jobs of one attempt that it ran itself: a re-run attempt lists the jobs it did not re-run
// with their original times (cf03 "copied jobs"); each job counts once, in the attempt that ran it.
function ownJobs(jobs, attempt) {
  const seen = new Set();
  const own = [];
  for (const j of [...jobs].sort((a, b) => a.run_attempt - b.run_attempt)) {
    const key = `${j.name}|${j.started_at}|${j.completed_at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (j.run_attempt === attempt) own.push(j);
  }
  return own;
}

const failedStep = (job) => (job.steps ?? []).find((s) => STOPPED.has(s.conclusion)) ?? null;

// One failing job's class: gate | infra | hang | code, with the evidence that decided it.
function classJob(job, cache) {
  const step = failedStep(job);
  const stepName = step?.name ?? null;
  const lines = cacheLog(cache, job.id) ?? [];
  const specs = [...new Set(lines.map((l) => SPEC_LINE.exec(l)?.[1]).filter(Boolean))];
  const base = { name: job.name, step: stepName, conclusion: job.conclusion, specs,
    minutes: job.started_at && job.completed_at ? round1(min(job.started_at, job.completed_at)) : null };
  if (job.name === 'Reviewed') return { ...base, kind: 'gate', gate: 'review stamp', why: 'Reviewed: no review stamp on the head' };
  if (stepName && POLICY_STEP.test(stepName)) return { ...base, kind: 'gate', gate: 'e2e protection', why: `policy step: ${stepName}` };
  if (job.conclusion === 'timed_out' || job.conclusion === 'cancelled') return { ...base, kind: 'hang', why: `${job.conclusion} in ${stepName ?? 'no step'}` };
  if (!step) return { ...base, kind: 'infra', why: 'failed with no failed step (runner lost)' };
  if (SETUP_STEP.test(stepName)) return { ...base, kind: 'infra', why: `setup step: ${stepName}` };
  const infra = lines.find((l) => INFRA_LINE.test(l));
  const gatesFailed = lines.filter((l) => /^\[gates\] (check:\S+ FAILED|tests failed)/.test(l));
  if (gatesFailed.length && gatesFailed.every((l) => POLICY_CHECKS.test(l))) {
    return { ...base, kind: 'gate', gate: 'budget', why: gatesFailed.join('; ') };
  }
  if (infra && !specs.length && !gatesFailed.length) return { ...base, kind: 'infra', why: `log: ${infra.slice(0, 100)}` };
  const what = gatesFailed.length ? gatesFailed.join('; ') : specs.length ? `${specs.length} spec file(s) failed` : `step: ${stepName}`;
  return { ...base, kind: 'code', why: what };
}

// The CI gate's own log: a capacity (growth) refusal fails it with every input green.
function gateLog(gateJob, cache) {
  if (!gateJob) return null;
  const lines = cacheLog(cache, gateJob.id);
  const cap = (lines ?? []).find((l) => /^##\[error\]E2E capacity line/.test(l));
  const noFlag = (lines ?? []).find((l) => /^##\[error\]The E2E plan gave no configured flag/.test(l));
  return { read: lines !== null, capacity: cap ? cap.replace(/^##\[error\]/, '').replace(/\. Add a budget.*/, '').slice(0, 220) : null, noFlag: Boolean(noFlag) };
}

function git(...a) {
  try { return execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }).trim(); } catch { return null; }
}
const fetched = new Set();
function haveCommit(sha, pr) {
  if (git('cat-file', '-e', `${sha}^{commit}`) !== null) return true;
  if (pr && !fetched.has(pr)) { fetched.add(pr); git('fetch', '-q', 'origin', `+refs/pull/${pr}/head:refs/remotes/cf22-pr/${pr}`); }
  return git('cat-file', '-e', `${sha}^{commit}`) !== null;
}
// What the PR's own commits between a failed head and the green head changed. Merges of main are
// left out (--first-parent --no-merges). `code` is any path outside docs/ that is not *.md.
function repairChange(from, to, pr) {
  if (from === to) return { same: true };
  if (!haveCommit(from, pr) || !haveCommit(to, pr)) return { unknown: true };
  const files = [...new Set((git('log', '--first-parent', '--no-merges', '--format=', '--name-only', `${from}..${to}`) ?? '').split('\n').filter(Boolean))];
  const merges = Number(git('rev-list', '--first-parent', '--merges', '--count', `${from}..${to}`) ?? 0);
  const code = files.filter((f) => !f.startsWith('docs/') && !f.endsWith('.md'));
  const limits = files.filter((f) => /growth-ceilings\.json$|scripts\/file-budgets\/|e2e\/quarantine\.json$|scripts\/e2e-durations\.json$/.test(f));
  return { files: files.length, code: code.length, test: code.filter((f) => /^e2e\/|\.test\.|\.spec\./.test(f)).length, codeFiles: code.slice(0, 40), limits, merges };
}

function readyTest(events, pull) {
  // Intervals in which the PR was ready (not draft); the first draft event tells the start state.
  const marks = events.filter((e) => e.event === 'ready_for_review' || e.event === 'convert_to_draft').sort((a, b) => a.created_at.localeCompare(b.created_at));
  let ready = marks.length ? marks[0].event === 'convert_to_draft' : !pull.draft;
  const out = [];
  let since = ready ? pull.created_at : null;
  for (const m of marks) {
    if (m.event === 'ready_for_review' && !ready) { ready = true; since = m.created_at; }
    if (m.event === 'convert_to_draft' && ready) { ready = false; out.push([since, m.created_at]); }
  }
  if (ready) out.push([since, '9999']);
  return (t) => out.some(([a, b]) => t >= a && t < b);
}

function derive(cache) {
  const load = (n) => JSON.parse(readFileSync(join(cache, n), 'utf8'));
  const pulls = Object.values(load('pulls.json').items);
  const byNumber = new Map(pulls.map((p) => [p.number, p]));
  const byRef = new Map(pulls.map((p) => [p.head_ref, p.number]));
  const runs = Object.values(load('runs.json').items).filter((r) => r.status === 'completed');
  const q = JSON.parse(readFileSync(new URL('../../../../e2e/quarantine.json', import.meta.url), 'utf8'));
  const quarantined = new Set([...Object.keys(q.specs ?? {}), ...Object.keys(q.released ?? {})]);
  const jobFiles = new Set(readdirSync(join(cache, 'jobs')));

  // Every attempt of every ci.yml run whose jobs were read, per PR.
  const perPr = new Map();
  for (const r of runs) {
    const n = prOf(r, byRef);
    if (n == null || r.created_at < FROM) continue;
    if (!jobFiles.has(`${r.id}-${r.run_attempt}.json`)) continue;
    const jobs = load(`jobs/${r.id}-${r.run_attempt}.json`);
    const kind = r.event === 'merge_group' ? 'queue' : 'pr';
    for (let a = 1; a <= r.run_attempt; a += 1) {
      const own = ownJobs(jobs, a);
      const listed = jobs.filter((j) => j.run_attempt === a);
      if (!listed.length) continue;
      // A verdict counts only in the attempt that ran it: an attempt that re-ran only Reviewed lists
      // a copy of the earlier CI gate, which is no new verdict.
      const gate = own.find((j) => j.name === 'CI gate');
      const rev = own.find((j) => j.name === 'Reviewed') ?? listed.find((j) => j.name === 'Reviewed');
      const gateAny = gate ?? listed.find((j) => j.name === 'CI gate');
      // A re-run attempt starts when its first job that is not a copy was created.
      const created = a === 1 ? r.created_at : (own.map((j) => j.created_at).sort()[0] ?? r.created_at);
      let outcome;
      if (kind === 'queue') outcome = gateAny?.conclusion === 'success' && rev?.conclusion === 'success' ? 'green' : (RED.has(gate?.conclusion) || RED.has(rev?.conclusion) ? 'red' : 'other');
      // A PR run is judged by its CI gate: a red Reviewed there is review wait (cf17), not a bounce.
      else outcome = gate?.conclusion === 'success' ? 'green' : RED.has(gate?.conclusion) ? 'red' : 'other';
      // A red merge group ends when its first red required job ended; otherwise at the last of them.
      const ends = [gateAny?.completed_at, kind === 'queue' && rev ? rev.completed_at : null].filter(Boolean).sort();
      const redEnds = [RED.has(gate?.conclusion) ? gate.completed_at : null, kind === 'queue' && RED.has(rev?.conclusion) ? rev.completed_at : null].filter(Boolean).sort();
      const end = outcome === 'red' && kind === 'queue' ? redEnds[0] : ends[ends.length - 1] ?? null;
      const fails = own.filter((j) => STOPPED.has(j.conclusion) && !VERDICT_ONLY.has(j.name) && !(kind === 'pr' && j.name === 'Reviewed'));
      if (!perPr.has(n)) perPr.set(n, []);
      perPr.get(n).push({ run: r.id, attempt: a, kind, event: r.event, sha: r.head_sha, created, end, outcome, fails, gateJob: gate, ranJobs: own.map((j) => j.name),
        passed: new Set(own.filter((j) => j.conclusion === 'success').map((j) => j.name)),
        reviewedRed: RED.has(rev?.conclusion) });
    }
  }

  // Every PR run's head and time (listed from a week before the window), for a PR's head at a moment.
  const headsOf = new Map();
  for (const r of [...runs].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (r.event !== 'pull_request' && r.event !== 'workflow_dispatch') continue;
    const n = prOf(r, byRef);
    if (n == null) continue;
    if (!headsOf.has(n)) headsOf.set(n, []);
    headsOf.get(n).push(r);
  }
  const bounces = [];
  for (const [n, atts] of perPr) {
    const pull = byNumber.get(n);
    if (!pull) continue;
    const evf = join(cache, `events/${n}.json`);
    const events = existsSync(evf) ? JSON.parse(readFileSync(evf, 'utf8')) : [];
    const ready = readyTest(events, pull);
    atts.sort((a, b) => (a.end ?? a.created).localeCompare(b.end ?? b.created));
    // A merge group's commit is GitHub's own; the PR's head at a moment is the head of its latest
    // PR run created by then.
    const prHeadAt = (t) => (headsOf.get(n) ?? []).filter((r) => r.created_at <= t).pop()?.head_sha ?? null;
    let reds = atts.filter((a) => a.outcome === 'red' && a.end && a.end >= FROM && a.end < UNTIL && ready(a.created));
    // Concurrent runs of one head (a pull_request run and a dispatch on the same commit) are one
    // bounce: a red attempt created before an earlier red of the same head ended is folded into it.
    reds = reds.filter((r, i) => !reds.slice(0, i).some((p) => p.kind === r.kind && p.sha === r.sha && r.created < p.end));
    // Dequeues: GitHub records a removal also when the queue merges the PR (within a minute of
    // `merged`); that is a landing. A removal within 10 minutes after a red merge group run of this
    // PR is that run's bounce. Any other removal is its own bounce.
    const mergedAt = events.filter((e) => e.event === 'merged').map((e) => e.created_at);
    const dequeues = events.filter((e) => e.event === 'removed_from_merge_queue' && e.created_at >= FROM && e.created_at < UNTIL
      && !mergedAt.some((m) => Math.abs(min(m, e.created_at)) <= 1)
      && !reds.some((r) => r.kind === 'queue' && min(r.end, e.created_at) >= -2 && min(r.end, e.created_at) <= 10));
    const items = [...reds.map((r) => ({ type: r.kind, at: r.end, att: r })), ...dequeues.map((d) => ({ type: 'dequeue', at: d.created_at, actor: d.actor }))]
      .sort((a, b) => a.at.localeCompare(b.at));
    for (const it of items) {
      // Next green: a PR bounce ends at the next green CI gate of a PR run (dispatch runs on the
      // branch count); a queue bounce or dequeue at the next green merge group run, or the merge.
      const wantKind = it.type === 'pr' ? 'pr' : 'queue';
      const green = atts.find((a) => a.kind === wantKind && a.outcome === 'green' && a.end > it.at);
      let greenAt = green?.end ?? null;
      if (wantKind === 'queue' && pull.merged_at && pull.merged_at > it.at && (!greenAt || pull.merged_at < greenAt)) greenAt = pull.merged_at;
      // The attempt that turned green splits the loss: wait (failure to its start: noticing,
      // repairing, pushing or re-running) and CI (its start, or the failure if later, to green).
      const start = green ? green.created : null;
      const head = it.att ? (it.att.kind === 'queue' ? prHeadAt(it.at) : it.att.sha) : prHeadAt(it.at);
      const greenHead = green ? (green.kind === 'queue' ? prHeadAt(green.end) : green.sha) : (greenAt ? pull.head_sha : null);
      const b = {
        pr: n, title: pull.title, head_ref: pull.head_ref, merged: Boolean(pull.merged_at), type: it.type, at: it.at,
        run: it.att?.run ?? null, attempt: it.att?.attempt ?? null, head, green_run: green?.run ?? null, green_attempt: green?.attempt ?? null,
        green_head: greenHead, green_at: greenAt, lost_min: greenAt ? round1(min(it.at, greenAt)) : null,
        wait_min: start ? round1(Math.max(0, min(it.at, start))) : null,
        // The wait before the PR's next attempt of the same kind started (red or green): the time
        // nothing ran. wait_min above runs to the attempt that went green and can hold red rounds.
        idle_min: (() => {
          const next = atts.filter((a) => a.kind === wantKind && a.created > (it.att?.created ?? it.at) && (a.end ?? '') > it.at).sort((x, y) => x.created.localeCompare(y.created))[0];
          return next ? round1(Math.max(0, min(it.at, next.created))) : null;
        })(),
        ci_min: green ? round1(min(start > it.at ? start : it.at, green.end)) : null,
        green_by: !green ? (greenAt ? 'merge' : null) : green.run === it.att?.run ? 'rerun of the same run' : head && greenHead === head ? 'new run, same commit' : head ? 'new commit' : 'head unknown',
        rerun_failed_only: Boolean(green && green.run === it.att?.run && green.attempt > it.att?.attempt && green.ranJobs.length < 0.5 * (it.att?.ranJobs.length ?? 0)),
        actor: it.actor ?? null, jobs: [], gate_log: null,
      };
      if (it.att) {
        b.jobs = it.att.fails.map((j) => classJob(j, cache));
        for (const j of b.jobs) {
          j.quarantined = (j.specs ?? []).filter((s0) => quarantined.has(s0));
          // cf03 fail-then-pass at job level: the same job passed in a later attempt on this commit,
          // even when that attempt stayed red for another reason.
          if (j.kind !== 'gate') j.passed_later_same_commit = atts.some((a) => a.kind === it.att.kind && a.sha === it.att.sha && a.created > it.att.created && a.passed.has(j.name));
        }
        b.gate_log = gateLog(it.att.gateJob, cache);
        if (b.gate_log?.capacity) b.jobs.push({ name: 'CI gate', step: 'Require every gate', kind: 'gate', gate: 'capacity (growth)', why: b.gate_log.capacity, specs: [], quarantined: [] });
        if (b.gate_log?.noFlag) b.jobs.push({ name: 'CI gate', step: 'Require every gate', kind: 'infra', why: 'the E2E plan gave no configured flag', specs: [], quarantined: [] });
        // The configured verdict restates its shards: when a shard failed too, the shard decides.
        if (b.jobs.some((j) => /^Configured E2E \d+\/\d+/.test(j.name))) b.jobs = b.jobs.filter((j) => j.name !== 'Configured E2E verdict (selected)');
        if (!b.jobs.length) b.jobs.push({ name: 'CI gate', step: 'Require every gate', kind: 'unknown', why: b.gate_log?.read ? 'gate red with no failing input and no capacity line' : 'gate log not read', specs: [], quarantined: [] });
      }
      b.change = head && greenHead ? repairChange(head, greenHead, n) : null;
      bounces.push(b);
    }
  }

  // Causes. A dequeue by the queue bot with no red run of its own rode in another PR's merge
  // group: it takes that group's bounce's cause.
  const queueReds = bounces.filter((b) => b.type === 'queue');
  for (const b of bounces) Object.assign(b, cause(b, queueReds));

  // Per PR, and the time in red without double counting (the union of [bounce, its green]).
  const prRows = [];
  for (const n of [...new Set(bounces.map((b) => b.pr))]) {
    const mine = bounces.filter((b) => b.pr === n);
    const pull = byNumber.get(n);
    const iv = mine.filter((b) => b.green_at).map((b) => [Date.parse(b.at), Date.parse(b.green_at)]).sort((a, c) => a[0] - c[0]);
    let red = 0; let cur = null;
    for (const [s, e] of iv) { if (!cur || s > cur[1]) { if (cur) red += cur[1] - cur[0]; cur = [s, e]; } else cur[1] = Math.max(cur[1], e); }
    if (cur) red += cur[1] - cur[0];
    prRows.push({ pr: n, title: pull.title, head_ref: pull.head_ref, merged: Boolean(pull.merged_at), state: pull.state, rounds: mine.length,
      red_min: round1(red / 60000), unresolved: mine.filter((b) => !b.green_at).length, causes: mine.map((b) => b.cause) });
  }

  // Denominators: PRs and heads with a PR run in the window, and the first-attempt green PR runs
  // of the PRs whose jobs were read (the CI time of one clean pass).
  const allPrRuns = runs.filter((r) => r.created_at >= FROM && r.created_at < UNTIL && (r.event === 'pull_request' || r.event === 'workflow_dispatch') && prOf(r, byRef) != null);
  const greenFirst = [];
  for (const atts of perPr.values()) for (const a of atts) if (a.kind === 'pr' && a.outcome === 'green' && a.attempt === 1 && a.created >= FROM && a.created < UNTIL) greenFirst.push(min(a.created, a.end));
  const queueRuns = runs.filter((r) => r.event === 'merge_group' && r.created_at >= FROM && r.created_at < UNTIL);
  // Review wait (cf17), counted apart: PR attempts whose CI gate was green and Reviewed red.
  let reviewWait = 0;
  for (const atts of perPr.values()) for (const a of atts) if (a.kind === 'pr' && a.outcome === 'green' && a.reviewedRed && a.created >= FROM && a.created < UNTIL) reviewWait += 1;
  const merged = pulls.filter((p) => p.merged_at && p.merged_at >= FROM && p.merged_at < UNTIL);
  return {
    window: { from: FROM, until: UNTIL },
    denominators: {
      prs_with_a_pr_run: new Set(allPrRuns.map((r) => prOf(r, byRef))).size,
      pr_heads_with_a_pr_run: new Set(allPrRuns.map((r) => r.head_sha)).size,
      pr_runs: allPrRuns.length, pr_runs_cancelled: allPrRuns.filter((r) => r.conclusion === 'cancelled').length,
      merge_group_runs: queueRuns.length, prs_merged: merged.length,
      prs_with_a_red_run_read: perPr.size, review_wait_attempts_of_those_prs: reviewWait,
      green_first_attempt_pr_run_minutes: stats(greenFirst),
    },
    bounces: bounces.sort((a, b) => a.at.localeCompare(b.at)),
    prs: prRows.sort((a, b) => a.pr - b.pr),
  };
}

// Cause of one bounce, by the rules of phase-cf22.md section 2, in this order.
function cause(b, queueReds) {
  if (b.type === 'dequeue') {
    const host = queueReds.find((q) => q.pr !== b.pr && min(q.at, b.at) >= -2 && min(q.at, b.at) <= 10);
    if (host && /merge-queue/.test(b.actor ?? '')) {
      const c = cause(host, []);
      return { ...c, cause_why: `rode in #${host.pr}'s failed merge group: ${c.cause_why}`, rode_with: host.pr };
    }
    return { cause: 'gate', cause_why: `removed from the queue by ${b.actor ?? 'unknown'} with no red merge group run`, ambiguous: true };
  }
  // A failing part that passed later on the same commit is a fail-then-pass (cf03): it decides
  // nothing beyond flake, so the rules below read the parts that did not pass again.
  const all = b.jobs;
  const passedAgain = all.filter((j) => j.passed_later_same_commit);
  const parts = passedAgain.length < all.length ? all.filter((j) => !j.passed_later_same_commit) : all;
  const kinds = new Set(parts.map((j) => j.kind));
  const why = () => all.map((j) => `${j.name}: ${j.why}${j.passed_later_same_commit ? ' (passed again on the same commit)' : ''}`).join('; ');
  // Every failing job passed again on the same commit: infrastructure when each failed in setup or
  // on a runner (a re-run is how an infrastructure death clears), otherwise a flake.
  if (passedAgain.length && passedAgain.length === all.length) {
    if (all.every((j) => j.kind === 'infra')) return { cause: 'infra', cause_why: `passed again on the same commit; ${why()}` };
    return { cause: 'flake', cause_why: `every failing job passed again on the same commit; ${why()}` };
  }
  // 1. Gate refusal: a policy refusal (review stamp, budget, capacity, protection) with no code
  // failure beside it. An infrastructure or hang part beside a refusal does not change the cause:
  // a re-run passes those, never the refusal.
  const gateKinds = [...new Set(parts.filter((j) => j.kind === 'gate').map((j) => j.gate))];
  if (gateKinds.length && !kinds.has('code')) {
    const capWhy = parts.find((j) => j.gate === 'capacity (growth)')?.why ?? '';
    const detail = /days old/.test(capWhy) ? 'durations table too old (a bad report)' : /overhead tier refuse/.test(capWhy) ? 'overhead tier over its budget'
      : /backend tier refuse/.test(capWhy) ? 'backend tier over its budget' : capWhy ? 'the change over the capacity line' : gateKinds.join(' + ');
    return { cause: 'gate', gate: gateKinds.join(' + '), gate_detail: detail, with_flake: passedAgain.length > 0, cause_why: why() };
  }
  // 2. Infrastructure: every failing part failed in setup, with no failed step, or on a runner,
  // network or registry error.
  if (parts.every((j) => j.kind === 'infra')) return { cause: 'infra', cause_why: why() };
  // 3. Flake: the next green ran on the same commit with no change (cf03 fail-then-pass), or every
  // failing spec is a known quarantined one and the repair did not touch it.
  if (b.green_head && b.green_head === b.head) return { cause: 'flake', cause_why: `green again on the same commit (${b.green_by}); ${why()}`, with_gate: kinds.has('gate') };
  const code = parts.filter((j) => j.kind === 'code' || j.kind === 'hang');
  const c = b.change;
  const specsFailed = code.flatMap((j) => j.specs);
  // Every code part must be a failing spec that is known quarantined: a Build or other failure
  // beside it is not explained by the quarantine.
  if (code.length && code.every((j) => j.specs.length && j.specs.every((s0) => j.quarantined.includes(s0))) && !(c?.codeFiles ?? []).some((f) => specsFailed.includes(f))) {
    return { cause: 'flake', ambiguous: true, cause_why: `known quarantined spec(s) ${[...new Set(specsFailed)].join(', ')}, not changed by the repair` };
  }
  // 4. Real defect: the PR's own commits between the failed and the green head changed code or tests.
  if (c && !c.unknown && !c.same && c.code > 0) {
    return { cause: 'defect', cause_why: `repair changed ${c.code} code or test file(s); ${why()}`, with_gate: kinds.has('gate'), limit_change: c.limits.length ? c.limits : undefined };
  }
  // 5. The rest is ambiguous; each is placed by a stated rule.
  if (kinds.has('hang') && !kinds.has('code')) return { cause: 'infra', ambiguous: true, cause_why: `a job stopped without a verdict and no same-commit pass followed; ${why()}` };
  if (!b.green_at) return { cause: 'unresolved', ambiguous: true, cause_why: `no green on this PR by the end of the listing; ${why()}` };
  if (c?.unknown) return { cause: 'defect', ambiguous: true, cause_why: `repair commits not readable (force-pushed), counted as defect; ${why()}` };
  if (c && c.code === 0) return { cause: 'flake', ambiguous: true, cause_why: `green after a push with no own code change${c.merges ? ' (main merged in)' : ''}, counted as flake; ${why()}` };
  return { cause: 'defect', ambiguous: true, cause_why: `unplaced; ${why()}` };
}

// ---------------------------------------------------------------------------------------------
// report

function report(rec) {
  const B = rec.bounces;
  const out = { window: rec.window, denominators: rec.denominators };
  out.prs_bounced = rec.prs.length;
  out.prs_bounced_merged = rec.prs.filter((p) => p.merged).length;
  out.bounces = B.length;
  out.rounds = stats(rec.prs.map((p) => p.rounds));
  out.rounds_histogram = rec.prs.reduce((h, p) => ({ ...h, [p.rounds]: (h[p.rounds] ?? 0) + 1 }), {});
  out.by_type = Object.fromEntries(['pr', 'queue', 'dequeue'].map((t) => [t, B.filter((b) => b.type === t).length]));
  out.lost_per_bounce = stats(B.map((b) => b.lost_min));
  out.wait_per_bounce = stats(B.map((b) => b.wait_min));
  out.idle_per_bounce = stats(B.filter((b) => b.lost_min != null).map((b) => b.idle_min));
  out.ci_per_bounce = stats(B.map((b) => b.ci_min));
  out.red_per_pr = stats(rec.prs.map((p) => p.red_min));
  out.unresolved = B.filter((b) => b.lost_min == null).length;
  const causes = ['defect', 'flake', 'gate', 'infra', 'unresolved'];
  out.by_cause = Object.fromEntries(causes.map((c) => {
    const x = B.filter((b) => b.cause === c);
    return [c, { bounces: x.length, ambiguous: x.filter((b) => b.ambiguous).length, prs: new Set(x.map((b) => b.pr)).size,
      lost: stats(x.map((b) => b.lost_min)), wait: stats(x.map((b) => b.wait_min)), ci: stats(x.map((b) => b.ci_min)) }];
  }));
  out.capacity_kinds = B.filter((b) => /capacity/.test(b.gate ?? '')).reduce((h, b) => ({ ...h, [b.gate_detail]: (h[b.gate_detail] ?? 0) + 1 }), {});
  out.gate_kinds = B.filter((b) => b.cause === 'gate').reduce((h, b) => ({ ...h, [b.gate ?? 'dequeue']: (h[b.gate ?? 'dequeue'] ?? 0) + 1 }), {});
  out.green_by = B.reduce((h, b) => ({ ...h, [`${b.cause} / ${b.green_by}`]: (h[`${b.cause} / ${b.green_by}`] ?? 0) + 1 }), {});
  // Which failing jobs, per cause (n/m matrix names folded).
  const jobs = {};
  for (const b of B) for (const j of b.jobs) {
    const k = `${b.cause} | ${j.name.replace(/\d+\/\d+/, 'n/m')} | ${j.kind}`;
    jobs[k] = (jobs[k] ?? 0) + 1;
  }
  out.jobs = Object.fromEntries(Object.entries(jobs).sort((a, b) => b[1] - a[1]));
  out.candidates = candidates(rec);
  return out;
}

// Minutes in red that removing some bounces would save, without double counting: per PR, the
// union of every bounce's [failure, green] minus the union of the bounces that stay.
function unionMin(bs) {
  const iv = bs.filter((b) => b.green_at).map((b) => [Date.parse(b.at), Date.parse(b.green_at)]).sort((a, c) => a[0] - c[0]);
  let total = 0; let cur = null;
  for (const [s0, e] of iv) { if (!cur || s0 > cur[1]) { if (cur) total += cur[1] - cur[0]; cur = [s0, e]; } else cur[1] = Math.max(cur[1], e); }
  if (cur) total += cur[1] - cur[0];
  return total / 60000;
}
// The loop after a repeat: per PR, from the second bounce of a kind to the green after the last
// one (the red time spent after the agent had already seen the same failure once).
function loopMin(bs) {
  let total = 0;
  const byPr = new Map();
  for (const b of bs) { if (!byPr.has(b.pr)) byPr.set(b.pr, []); byPr.get(b.pr).push(b); }
  for (const mine of byPr.values()) {
    const x = mine.filter((b) => b.green_at).sort((a, c) => a.at.localeCompare(c.at));
    if (x.length < 2) continue;
    total += unionMin(x.slice(1));
  }
  return round1(total);
}
function savedByRemoving(bounces, remove) {
  let saved = 0;
  for (const pr of new Set(bounces.map((b) => b.pr))) {
    const mine = bounces.filter((b) => b.pr === pr);
    saved += unionMin(mine) - unionMin(mine.filter((b) => !remove(b)));
  }
  return round1(saved);
}

// Candidate fixes, ranked by estimated minutes saved over the window (phase-cf22.md section 4).
// Each estimate is computed from the bounce records; the assumption it rests on is in `basis`.
function candidates(rec) {
  const B = rec.bounces;
  const R = B.filter((b) => b.lost_min != null);
  const sum = (x, f) => round1(x.reduce((s0, b) => s0 + (f(b) ?? 0), 0));
  const longestFailed = (b) => Math.max(0, ...b.jobs.map((j) => j.minutes ?? 0));
  const out = [];

  // A. Re-run only the failed part. A1: the re-run itself is failed jobs only (CI time above the
  // longest failed job is saved where the green was a full new run). A2: done at once by CI, for an
  // infrastructure failure only (the run's rules allow one re-run for an infrastructure death and
  // forbid added retries as a flake fix), which also removes the wait before the re-run.
  const fi = R.filter((b) => b.cause === 'flake' || b.cause === 'infra');
  const a1 = (b) => (b.rerun_failed_only ? 0 : Math.max(0, (b.ci_min ?? 0) - longestFailed(b)));
  out.push({ id: 'A1', name: 'Re-run only the failed jobs (flake and infra bounces)', bounces: fi.length,
    already_failed_only: fi.filter((b) => b.rerun_failed_only).length, saved_min: sum(fi, a1),
    basis: 'per flake or infra bounce whose green was a new full run: its CI minutes minus the longest failed job; zero where the green was already a failed-jobs re-run' });
  const inf = R.filter((b) => b.cause === 'infra' && !b.ambiguous);
  out.push({ id: 'A2', name: 'CI re-runs an infrastructure failure\'s failed jobs at once, once', bounces: inf.length,
    saved_min: sum(inf, (b) => (b.wait_min ?? 0) + a1(b)),
    basis: 'per unambiguous infra bounce (setup step or runner): the wait before the green attempt started, plus A1 where the green was a full run; flakes stay with quarantine' });

  // B. Agents run the affected tests before pushing: the defect bounces whose failing part is a
  // build gate or unit test (Build job), a selected offline spec, or a selected configured spec are
  // avoided if the local run catches what CI caught. Split by what the agent must run.
  const defects = B.filter((b) => b.cause === 'defect' && !b.ambiguous);
  const tier = (b) => (b.jobs.some((j) => j.kind === 'code' && j.name === 'Build') ? 'build'
    : b.jobs.some((j) => j.kind === 'code' && /^E2E \d/.test(j.name)) ? 'offline e2e'
      : b.jobs.some((j) => j.kind === 'code' && /^Configured/.test(j.name)) ? 'configured e2e' : 'other');
  const tiers = {};
  for (const t of ['build', 'offline e2e', 'configured e2e', 'other']) {
    const x = defects.filter((b) => tier(b) === t);
    tiers[t] = { bounces: x.length, saved_min: savedByRemoving(B, (b) => x.includes(b)) };
  }
  out.push({ id: 'B', name: 'Agents run the affected tests before pushing (defect bounces)', bounces: defects.length,
    saved_min: savedByRemoving(B, (b) => defects.includes(b)), tiers,
    basis: 'removes each unambiguous defect bounce (union of red time per PR, no double counting), assuming the local run catches what CI caught; the cost per push is in phase-cf22.md section 4' });

  // C. Gate refusals an agent cannot fix go to the owner alarm at once instead of looping. Saved:
  // every refusal after the first on the same PR and gate kind (the loop), removed.
  // An agent can clear 'the change over the capacity line' by making its own change cheaper; the
  // tier budgets, a stale report and the protection check need the owner.
  const agentFixable = (b) => b.gate_detail === 'the change over the capacity line';
  const allGates = B.filter((b) => b.cause === 'gate' && b.type !== 'dequeue').sort((x, y) => x.at.localeCompare(y.at));
  const gates = allGates.filter((b) => !agentFixable(b));
  const seen = new Set(); const repeats = [];
  for (const b of gates) { const k = `${b.pr}|${b.gate}`; if (seen.has(k)) repeats.push(b); else seen.add(k); }
  const loopGroups = new Map();
  for (const b of gates) { const k = `${b.pr}|${b.gate}`; if (!loopGroups.has(k)) loopGroups.set(k, []); loopGroups.get(k).push(b); }
  const looping = [...loopGroups.values()].filter((g) => g.length > 1);
  const cSaved = round1(looping.reduce((t, g) => t + loopMin(g.map((b) => ({ ...b, pr: 0 }))), 0));
  const fixLoops = new Map();
  for (const b of allGates.filter(agentFixable)) { if (!fixLoops.has(b.pr)) fixLoops.set(b.pr, []); fixLoops.get(b.pr).push(b); }
  out.push({ id: 'C', name: 'Gate refusals an agent cannot fix go to the owner alarm at once', bounces: gates.length,
    agent_fixable_left_out: { bounces: allGates.length - gates.length, loop_min: round1([...fixLoops.values()].filter((g) => g.length > 1).reduce((t, g) => t + loopMin(g), 0)) },
    prs: seen.size, looping_prs: looping.length, repeats: repeats.length, saved_min: cSaved,
    removed_only_min: savedByRemoving(B, (b) => repeats.includes(b)),
    first_refusal_wait_min: sum(gates.filter((b) => !repeats.includes(b)), (b) => b.wait_min),
    basis: 'per PR and gate kind refused more than once: the red time from the second refusal to the green, which the agent spent looping after it had seen the refusal once; it assumes the owner answers an alarm within the first refusal\'s own round (median wait in by_cause.gate). removed_only_min is the floor: only the repeated bounces removed, their overlap with the first left in' });

  // D (from the data). The capacity line is computed before any test runs and its inputs are on
  // the agent's machine (scripts/e2e-capacity.mjs, as known-traps runs it): checking it before
  // pushing turns each capacity refusal into an owner question before a CI round. Saved: every
  // capacity bounce's CI round (the first refusal's CI minutes and every repeat), less C's repeats.
  const cap = allGates.filter((b) => /capacity/.test(b.gate ?? ''));
  const firstCap = cap.filter((b) => !repeats.includes(b));
  out.push({ id: 'D', name: 'Agents check the capacity line before pushing and ask the owner then', bounces: cap.length,
    saved_min: sum(firstCap.filter((b) => b.lost_min != null), (b) => b.ci_min),
    basis: 'the CI minutes of the first capacity refusal per PR, which a local check replaces; the repeats are C\'s' });

  // E (from the data). A failure in a spec that is already known flaky (in e2e/quarantine.json's
  // history) is named as such in the failure, so the agent does not repair code for it: the
  // ambiguous quarantined-spec bounces after the first on a PR are removed.
  const qf = B.filter((b) => b.cause === 'flake' && /known quarantined/.test(b.cause_why));
  const qSeen = new Set(); const qRepeat = [];
  for (const b of qf.sort((x, y) => x.at.localeCompare(y.at))) { if (qSeen.has(b.pr)) qRepeat.push(b); else qSeen.add(b.pr); }
  out.push({ id: 'E', name: 'Name a known-flaky spec in the failure so the agent does not chase it', bounces: qf.length,
    repeats: qRepeat.length, saved_min: loopMin(qf),
    basis: 'per PR with more than one bounce whose failing specs were all known flaky and untouched by the repair: the red time from the second such bounce to the green; ambiguous by rule 3' });

  // F (from the data). Most of the time lost is the wait before the next attempt starts, and a few
  // waits run for hours (overnight, or a session that ended): a red PR wakes its repair owner at
  // once. Saved: for each wait over an hour (bounces that share one green attempt counted once, at
  // their longest wait; gate refusals left to C and D), the wait above the median wait of all
  // bounces, which a woken owner is assumed to match.
  const medIdle = quantile(R.map((b) => b.idle_min), 0.5);
  const long = R.filter((b) => b.cause !== 'gate' && b.idle_min > 60);
  out.push({ id: 'F', name: 'A red PR wakes its repair owner at once', bounces: long.length, median_idle_min: medIdle,
    waits: long.map((b) => ({ pr: b.pr, at: b.at, idle_min: b.idle_min, cause: b.cause })),
    saved_min: round1(long.reduce((t, b) => t + b.idle_min - medIdle, 0)),
    basis: 'per non-gate bounce whose idle time (failure to the next attempt of any result) exceeded an hour: that time above the median idle time of all bounces; an upper bound, since part of a long idle time can be repair work done before the push' });
  return out.sort((a, b) => b.saved_min - a.saved_min);
}

if (mode === 'derive') {
  const rec = derive(opt('--cache'));
  writeFileSync(opt('--out'), `${JSON.stringify(rec, null, 1)}\n`);
  console.log(JSON.stringify({ bounces: rec.bounces.length, prs: rec.prs.length }));
} else if (mode === 'report') {
  console.log(JSON.stringify(report(JSON.parse(readFileSync(opt('--records'), 'utf8'))), null, 1));
} else {
  console.error('usage: derive --cache <dir> --out <file> | report --records <file>');
  process.exit(2);
}
