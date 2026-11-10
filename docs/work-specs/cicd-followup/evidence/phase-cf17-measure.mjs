#!/usr/bin/env node
// cf17 trial measurement: the three trial plans' PRs, their queue clocks, CI runs and jobs, read
// from GitHub (REST GETs only) and judged against phase-cf17.md sections 2 to 4.
//
//   node phase-cf17-measure.mjs --since <iso> --until <iso> --cache <dir> [--max-calls 100]
//
// Each pass makes at most --max-calls API calls and stops; run it again to continue (the output
// says `complete: false` until every read it needs is cached). Lists are re-read per pass; the jobs
// of a COMPLETED run and the timeline of a CLOSED PR are immutable and cached for good. No log is
// read, and no token or signed URL is written to the cache or the output.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { queueClock, tierOfJob, TIERS } from "../../../../scripts/growth-controls.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
    return acc;
  }, []),
);
const { since: SINCE, until: UNTIL, cache: CACHE } = args;
const MAX = Number(args["max-calls"] ?? 100);
if (!SINCE || !UNTIL || !CACHE) {
  console.error("usage: --since <iso> --until <iso> --cache <dir> [--max-calls 100]");
  process.exit(2);
}
fs.mkdirSync(CACHE, { recursive: true });
const REPO = "NoaCG/NoaCG-Studio";
// The trial plans' phase branches (build, repair, check); coordinator and recovery branches are not phases.
export const TRIAL = /^(?:claude|codex)\/plan-(live-publishing|vmix|editor-r1-5)-(?!coordinator)([a-z0-9.]+)-(build|repair|check)$/;

let calls = 0;
let complete = true;
class Budget extends Error {}
function api(url) {
  if (calls >= MAX) throw new Budget();
  calls += 1;
  return JSON.parse(execFileSync("gh", ["api", "-H", "Accept: application/vnd.github+json", url], { encoding: "utf8", maxBuffer: 64 << 20 }));
}
const file = (name) => path.join(CACHE, name.replace(/[^a-z0-9._-]/gi, "_") + ".json");
const cached = (name) => (fs.existsSync(file(name)) ? JSON.parse(fs.readFileSync(file(name), "utf8")) : null);
const keep = (name, v) => fs.writeFileSync(file(name), JSON.stringify(v));
function read(name, url, immutable) {
  const hit = cached(name);
  if (hit) return hit;
  try {
    const v = url();
    if (immutable(v)) keep(name, v);
    return v;
  } catch (e) {
    if (e instanceof Budget) { complete = false; return null; }
    throw e;
  }
}
const min = (a, b) => (Date.parse(b) - Date.parse(a)) / 60000;
const inWindow = (t) => t && t >= SINCE && t <= UNTIL;
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)] : null; };

// 1. Trial PRs: every open PR on a trial phase branch, and every one closed since the start.
const prs = [];
const take = (p) => {
  const m = TRIAL.exec(p.head.ref);
  if (!m || prs.some((x) => x.number === p.number)) return;
  if (p.state !== "open" && !(p.closed_at >= SINCE)) return;
  prs.push({ number: p.number, plan: m[1], phase: m[2], kind: m[3], ref: p.head.ref, head: p.head.sha, createdAt: p.created_at, mergedAt: p.merged_at, mergeSha: p.merge_commit_sha, state: p.state });
};
for (let page = 1; page <= 3; page++) {
  const list = read(`open-${page}`, () => api(`repos/${REPO}/pulls?state=open&per_page=100&page=${page}`), () => false);
  if (!list) break;
  list.forEach(take);
  if (list.length < 100) break;
}
for (let page = 1; page <= 3; page++) {
  const list = read(`closed-${page}`, () => api(`repos/${REPO}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`), () => false);
  if (!list) break;
  list.forEach(take);
  if (list.length < 100 || list.at(-1).updated_at < SINCE) break;
}

// 2. Queue clock and removals from each PR's timeline (immutable once the PR is closed).
for (const pr of prs) {
  const tl = read(`timeline-${pr.number}`, () => api(`repos/${REPO}/issues/${pr.number}/timeline?per_page=100`), () => pr.state === "closed");
  if (!tl) continue;
  const queued = tl.filter((e) => e.event === "added_to_merge_queue").map((e) => e.created_at);
  pr.queueEntries = queued.length;
  pr.queueRemovals = tl.filter((e) => e.event === "removed_from_merge_queue").length;
  pr.queue = queueClock({ queued, mergedAt: pr.mergedAt, now: UNTIL });
}

// 3. Every workflow run created in the window (the list is re-read; runs still change).
const runs = [];
for (let page = 1; page <= 10; page++) {
  const r = read(`runs-${page}`, () => api(`repos/${REPO}/actions/runs?created=${SINCE}..${UNTIL}&per_page=100&page=${page}`), () => false);
  if (!r) break;
  runs.push(...r.workflow_runs);
  if (r.workflow_runs.length < 100) break;
}
const byPr = new Map(prs.map((p) => [p.number, p]));
const owner = (run) => {
  const q = /^gh-readonly-queue\/main\/pr-(\d+)-/.exec(run.head_branch ?? "");
  if (q && byPr.has(Number(q[1]))) return byPr.get(Number(q[1]));
  if (run.event === "push" && run.head_branch === "main") return prs.find((p) => p.mergeSha === run.head_sha) ?? null;
  return prs.find((p) => p.ref === run.head_branch) ?? null;
};
// Trial runs first, so the budget reads what the criteria need before the repository-wide peak.
const ordered = [...runs].sort((a, b) => Number(!owner(a)) - Number(!owner(b)));
const jobsOf = new Map();
for (const run of ordered) {
  const j = read(`jobs-${run.id}-${run.run_attempt}`, () => api(`repos/${REPO}/actions/runs/${run.id}/jobs?filter=all&per_page=100`), () => run.status === "completed");
  if (j) jobsOf.set(run.id, j.jobs);
}

// 4. Per-PR cost, retries and runner wait; repository-wide peak.
const tierMinutes = Object.fromEntries(TIERS.map((t) => [t, 0]));
let trialRunsUnread = 0;
let maxRunnerWait = 0;
for (const pr of prs) Object.assign(pr, { m3: 0, failThenPass: false, reruns: 0, postLandingFailure: false });
for (const run of runs) {
  const pr = owner(run);
  if (!pr) continue;
  if (run.run_attempt > 1) pr.reruns += 1;
  if (run.event === "push" && run.head_branch === "main" && run.path.endsWith("ci.yml") && run.conclusion === "failure") pr.postLandingFailure = true;
  const jobs = jobsOf.get(run.id);
  if (!jobs) { trialRunsUnread += 1; continue; }
  const seen = new Map();
  for (const job of [...jobs].sort((a, b) => (a.started_at ?? "").localeCompare(b.started_at ?? ""))) {
    if (!job.started_at || !job.completed_at) continue;
    const m = min(job.started_at, job.completed_at);
    pr.m3 += m;
    tierMinutes[tierOfJob(run.path, job.name)] += m;
    if (job.created_at) maxRunnerWait = Math.max(maxRunnerWait, min(job.created_at, job.started_at));
    const prev = seen.get(job.name);
    if (job.conclusion === "success" && prev && prev !== "success" && prev !== "skipped") pr.failThenPass = true;
    seen.set(job.name, job.conclusion);
  }
}
const events = [];
let jobsRead = 0;
for (const jobs of jobsOf.values()) for (const j of jobs) if (j.started_at && j.completed_at) { jobsRead += 1; events.push([j.started_at, 1], [j.completed_at, -1]); }
events.sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]);
let now = 0, peak = 0, peakAt = null;
for (const [t, d] of events) { now += d; if (now > peak) { peak = now; peakAt = t; } }

// 5. Figures and stop lines (phase-cf17.md sections 2 to 4).
const landed = prs.filter((p) => inWindow(p.mergedAt));
const q = landed.map((p) => p.queue?.minutes).filter((x) => x != null);
const contention = prs.reduce((a, p) => a + Math.max(0, (p.queueRemovals ?? 0)), 0);
const ftp = landed.filter((p) => p.failThenPass).length;
const out = {
  window: { since: SINCE, until: UNTIL },
  complete: complete && trialRunsUnread === 0,
  calls,
  trialPrs: prs.map(({ number, plan, phase, kind, state, createdAt, mergedAt, queueEntries, queueRemovals, queue, m3, failThenPass, reruns, postLandingFailure }) => ({ number, plan, phase, kind, state, createdAt, mergedAt, queueEntries, queueRemovals, queueMinutes: queue?.minutes ?? null, m3: Math.round(m3 * 10) / 10, failThenPass, reruns, postLandingFailure })),
  W: Object.fromEntries(["live-publishing", "vmix", "editor-r1-5"].map((plan) => [plan, new Set(landed.filter((p) => p.plan === plan && p.kind !== "check").map((p) => p.phase)).size])),
  Q: { n: q.length, p50: pct(q, 50), p90: pct(q, 90), max: q.length ? Math.max(...q) : null, openOver30: prs.filter((p) => p.queue?.state === "unfinished" && p.queue.minutes > 30).map((p) => p.number) },
  C: { queueRemovals: contention, maxRunnerWaitMinutes: Math.round(maxRunnerWait * 10) / 10, repoPeakConcurrentJobs: peak, peakAt, runsInWindow: runs.length, runsWithJobsRead: jobsOf.size, peakIsLowerBound: jobsOf.size < runs.length },
  R: { landings: landed.length, failThenPass: ftp, share: landed.length ? ftp / landed.length : null, postLandingFailures: landed.filter((p) => p.postLandingFailure).length, reruns: prs.reduce((a, p) => a + p.reruns, 0) },
  K: { landings: landed.length, tierMinutesPerLanding: Object.fromEntries(TIERS.map((t) => [t, landed.length ? Math.round((tierMinutes[t] / landed.length) * 10) / 10 : null])), trialRunsUnread },
};
out.stop = {
  contention: [
    contention >= 2 && "two or more merge-queue removals of trial PRs (check each is not the PR's own failure)",
    q.length >= 5 && out.Q.p90 > 20 && "queue to landing p90 above 20 minutes",
    (out.Q.max > 30 || out.Q.openOver30.length) && "a trial PR in the queue over 30 minutes",
    maxRunnerWait > 30 && "a trial job waited over 30 minutes for a runner",
    peak >= 57 && "repository-wide peak reached 57 concurrent jobs",
  ].filter(Boolean),
  failureRate: [
    landed.length >= 5 && out.R.share >= 0.29 && "fail-then-pass share at or above 29%",
    out.R.postLandingFailures >= 2 && "two post-landing failures on main from trial landings",
  ].filter(Boolean),
};
console.log(JSON.stringify(out, null, 2));
