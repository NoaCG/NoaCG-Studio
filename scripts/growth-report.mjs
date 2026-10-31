#!/usr/bin/env node
// gate: workflow weekly-audit.yml
// guards: scripts/growth-controls.mjs, scripts/growth-ceilings.json, scripts/e2e-durations.json
// THE WEEKLY GROWTH REPORT - D7's measurement, attribution and ownership half
// (docs/work-specs/cicd-improvement/spec.md D7 and AC-9; the rules are in growth-controls.mjs).
//
//   node scripts/growth-report.mjs collect [--days 7] [--budget 550] [--previous prev.json]
//        [--clocks clocks.json] [--out report.json] [--summary file] [--now ISO]
//        [--issue]                                            # keep the weekly rolling issue
//   node scripts/growth-report.mjs ages [--issue]              # open items past their age ceiling
//   node scripts/growth-report.mjs fetch --out report.json     # the latest published report
//
// `collect` reads this repository's Actions runs for the window (ending six hours ago, so runs
// have finished) and prices every job's runner-minutes into its tier: offline, backend,
// graphics, fixed overhead. Every completed run is counted; failed, cancelled and re-run attempts
// count, because they held runners. It reads at most `--budget` API calls: run lists in full,
// then the jobs of an evenly spread sample of each (workflow, event) stratum, scaled to the
// stratum's exact run count. A stratum it could not sample, or a read that failed, makes that
// tier's evidence partial, never zero. Sampled post-landing runs form the series an indirect
// slowdown is found and attributed in. Open pull requests' clocks give the per-item age alarms;
// an even spread of the window's merged pull requests gives the pooled ready and queue samples,
// carried forward report to report for the 28-day window; `--clocks` adds receipts-based samples
// and phase ledgers (the plan-run ledger and worker receipts are not in the repository).
// Breaches carry over from `--previous`, and only complete evidence clears one.
//
// The report is a step summary and a JSON artifact (`growth-report`); the capacity line in
// ci.yml fetches the newest one, so its stops and its measurement reach every pull request.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TIERS, ageAlarms, applySlowdown, assessTiers, carryBreaches, costBreaches, detectSlowdown, exceptionStatus,
  expiringSoon, phaseClock, pooledTiming, prClock, queueClock, reportCadence, sustained, tableFreshness, tierOfJob, weeklyMarkdown,
} from './growth-controls.mjs';
import { measured } from './measured.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = process.env.GH_REPO || process.env.GITHUB_REPOSITORY || 'NoaCG/NoaCG-Studio';
const DAY = 86_400_000;

/** A bounded reader over `gh api`: it counts calls and refuses past its budget. */
export function makeReader(budget, run = (args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 << 20, windowsHide: true })) {
  const reader = { calls: 0, failures: 0, exhausted: false };
  reader.get = (route) => {
    if (reader.calls >= budget) { reader.exhausted = true; return null; }
    reader.calls += 1;
    try { return JSON.parse(run(['api', '-X', 'GET', route])); } catch { reader.failures += 1; return null; }
  };
  return reader;
}

const minutes = (j) => (j.started_at && j.completed_at ? Math.max(0, (Date.parse(j.completed_at) - Date.parse(j.started_at)) / 60_000) : 0);

/** Evenly spread `k` of `n` indices, always including the first and the last. */
export function spread(n, k) {
  if (k >= n) return [...Array(n).keys()];
  if (k <= 1) return [n - 1];
  return [...new Set([...Array(k).keys()].map((i) => Math.round((i * (n - 1)) / (k - 1))))];
}

/**
 * Price sampled runs into tiers and scale each stratum to its run count. Pure.
 * `runs` are `{ id, workflow, event, branch, sha, created, conclusion, jobs|null }`, `jobs` null
 * when the run was not sampled (or its read failed: `failed: true`).
 */
export function priceRuns(runs, { days }) {
  const strata = {};
  for (const r of runs) (strata[`${r.workflow}|${r.event}`] ??= []).push(r);
  const totals = Object.fromEntries(TIERS.map((t) => [t, { landing: 0, scheduled: 0, partial: [] }]));
  for (const [key, list] of Object.entries(strata)) {
    const sampled = list.filter((r) => r.jobs);
    const event = key.split('|')[1];
    const bucket = event === 'schedule' ? 'scheduled' : 'landing';
    const missing = list.filter((r) => r.failed || (!r.jobs && sampled.length === 0)).length;
    if (sampled.length === 0) { for (const t of TIERS) totals[t].partial.push(`${key}: ${list.length} run(s) not sampled`); continue; }
    if (missing) for (const t of TIERS) totals[t].partial.push(`${key}: ${missing} read(s) failed`);
    const perRun = Object.fromEntries(TIERS.map((t) => [t, 0]));
    for (const r of sampled) for (const j of r.jobs) perRun[tierOfJob(r.workflow, j.name)] += minutes(j);
    for (const t of TIERS) totals[t][bucket] += (perRun[t] / sampled.length) * list.length;
  }
  const landings = runs.filter((r) => r.workflow === 'ci.yml' && r.event === 'push' && r.branch === 'main').length;
  const tiers = {};
  for (const t of TIERS) {
    const partial = totals[t].partial;
    tiers[t] = {
      perLanding: landings ? totals[t].landing / landings : null,
      perDay: totals[t].scheduled / days,
      evidence: landings && partial.length === 0 ? 'complete' : 'partial',
      // With a stratum unsampled the number is a lower bound, never the cost: it may raise a
      // breach, and it can never clear one (buildReport's `confirmed`).
      ...(partial.length ? { lowerBound: true } : {}),
      ...(partial.length ? { why: partial.slice(0, 4).join('; ') + (partial.length > 4 ? ` and ${partial.length - 4} more` : '') } : {}),
      totalLanding: totals[t].landing,
      totalScheduled: totals[t].scheduled,
    };
  }
  return { landings, tiers };
}

/** Post-landing series per tier, oldest first, from sampled push runs on main. Pure. */
export function seriesOf(runs) {
  const out = Object.fromEntries(TIERS.map((t) => [t, []]));
  const pushes = runs.filter((r) => r.jobs && r.event === 'push' && r.branch === 'main' && (r.workflow === 'ci.yml' || r.workflow === 'configured-suite.yml'))
    .sort((a, b) => a.created.localeCompare(b.created));
  for (const r of pushes) {
    const per = Object.fromEntries(TIERS.map((t) => [t, 0]));
    for (const j of r.jobs) per[tierOfJob(r.workflow, j.name)] += minutes(j);
    const complete = r.conclusion === 'success' && r.jobs.every((j) => j.status === 'completed');
    for (const t of TIERS) if (per[t] > 0) out[t].push({ sha: r.sha, at: r.created, complete, value: per[t] });
  }
  return out;
}

/** Assemble the report from collected facts. Pure, so the whole report replays from fixtures. */
export function buildReport({ ceilings, runs, days, windowEnd, now, previous = null, openItems = [], openComplete = true, listComplete = true, timingComplete = true, clocksRead = false, finished = [], pending = [], tableRecordedAt, collection }) {
  const priced = priceRuns(runs, { days });
  // An incomplete run list makes every tier partial BEFORE anything is judged from it.
  if (!listComplete) for (const t of TIERS) Object.assign(priced.tiers[t], { evidence: 'partial', lowerBound: true, why: 'the run list was cut short' });
  let measurement = { source: 'weekly growth report', windowStart: new Date(Date.parse(windowEnd) - days * DAY).toISOString().slice(0, 10), windowEnd: windowEnd.slice(0, 10), landings: priced.landings, tiers: {} };
  for (const t of TIERS) measurement.tiers[t] = Object.fromEntries(Object.entries(priced.tiers[t]).filter(([k]) => !k.startsWith('total')));
  const series = seriesOf(runs);
  const slowdowns = {};
  for (const t of TIERS) {
    if (!(measurement.tiers[t].perLanding > 0)) continue;
    const s = detectSlowdown(series[t]);
    if (s.found) { slowdowns[t] = s; measurement = applySlowdown(measurement, t, s); }
  }
  const today = now.slice(0, 10);
  const prevStops = previous?.stops ?? {};
  const assessment = assessTiers({ ceilings, measurement, items: [], today, stops: prevStops });
  const perDayLandings = priced.landings / days;
  const aggregate = {
    perDay: TIERS.reduce((a, t) => a + (measurement.tiers[t].perLanding ?? 0) * perDayLandings + measurement.tiers[t].perDay, 0),
    allocatedPerDay: TIERS.reduce((a, t) => a + ceilings.tiers[t].perLanding * perDayLandings + ceilings.tiers[t].perDay, 0),
  };
  const table = tableFreshness({ recordedAt: tableRecordedAt, today, boundDays: ceilings.freshnessDays, pending });
  const ex = exceptionStatus(ceilings.exceptions, today, ceilings.exceptionMaxDays);
  const soon = new Set(expiringSoon(ex.active, today).map((e) => e.id));
  const exceptions = [
    ...ex.active.map((e) => ({ ...e, state: 'active', soon: soon.has(e.id) })),
    ...ex.expired.map((e) => ({ ...e, state: 'expired, counted again' })),
    ...ex.invalid.map((e) => ({ ...e, state: 'invalid, covers nothing' })),
  ];
  // Finished samples accumulate across reports for the rolling 28-day window: this week's plus
  // the ones last week's report carried, each read once.
  const cutoff = Date.parse(now) - ceilings.timing.pooledWindowDays * DAY;
  const seen = new Set();
  const samples = [...finished, ...(previous?.timingSamples ?? [])].filter((x) => {
    const key = `${x.measure}|${x.id ?? ''}|${x.finishedAt}`;
    if (seen.has(key) || Date.parse(x.finishedAt) < cutoff) return false;
    seen.add(key);
    return true;
  });
  const timing = ['prReady', 'phase', 'queue'].map((m) => {
    const t = pooledTiming(samples.filter((s) => s.measure === m), m, ceilings, now);
    const before = previous?.timing?.find((p) => p.measure === m);
    return { ...t, sustained: sustained(before, t) };
  });
  const current = [
    ...costBreaches(assessment),
    ...timing.filter((t) => t.sustained).map((t) => ({ key: `latency:${t.measure}`, kind: 'latency', subject: t.measure, detail: `${t.measure} pooled p50 ${t.pooled.p50} / p90 ${t.pooled.p90} over p50 ${t.ceiling.p50} / p90 ${t.ceiling.p90} two adequately sampled weeks running` })),
    ...ageAlarms(openItems, ceilings, now),
    ...(table.stale ? [{ key: 'table:stale', kind: 'table', subject: 'e2e-durations', detail: table.reason }] : []),
    ...exceptions.filter((e) => e.soon).map((e) => ({ key: `exception:${e.id}`, kind: 'exception', subject: e.id, due: e.expires, detail: `exception ${e.id} expires ${e.expires}; expiry restores refusal; renewal needs a measured repayment (${e.repayment ?? 'no repayment named'})` })),
    ...ex.invalid.map((e) => ({ key: `exception-invalid:${e.id}`, kind: 'exception', subject: e.id, detail: `exception ${e.id} covers nothing: ${e.problems.join('; ')}` })),
  ];
  const cadence = previous ? reportCadence({ generatedAt: previous.generatedAt, today, maxAgeDays: ceilings.reportMaxAgeDays }) : { overdue: false };
  if (cadence.overdue) current.push({ key: 'report:missing', kind: 'report', subject: 'weekly', detail: `${cadence.reason}: a week went unreported` });
  // What this week's evidence can clear: a cost breach needs its tier completely measured, a
  // latency breach an adequate pool, an age breach a complete read of the open items.
  // A breach clears only on a measurement that is complete AND in bounds for its subject. Every
  // kind is named; anything else stays.
  const confirmed = (b) => {
    const [kind, subject] = b.key.split(':');
    if (kind === 'cost') { const share = assessment.tiers[subject]?.share; return measurement.tiers[subject]?.evidence === 'complete' && Number.isFinite(share) && share <= 1; }
    if (kind === 'latency') { const t = timing.find((x) => x.measure === subject); return Boolean(timingComplete && t?.adequate && !t.above); }
    // An age item: its read was complete (open PRs from GitHub, phases from a clocks file that was read).
    if (kind === 'age') return b.category === 'phase' ? clocksRead : openComplete;
    // Re-derived in full from files every week: the table's date, the exception ledger, this report.
    return ['table', 'exception', 'exception-invalid', 'report'].includes(kind);
  };
  const carried = carryBreaches({ previous: previous?.breaches ?? [], current, today, owner: ceilings.owner, confirmed });
  const report = {
    generatedAt: now, ceilingsVersion: ceilings.version, owner: ceilings.owner, measurement, slowdowns,
    assessment: { status: assessment.status, tiers: Object.fromEntries(TIERS.map((t) => [t, { status: assessment.tiers[t].status, why: assessment.tiers[t].why, evidence: assessment.tiers[t].evidence, share: assessment.tiers[t].share }])) },
    aggregate, table, exceptions: exceptions.map(({ id, tier, covers, expires, repayment, state, soon: s, problems }) => ({ id, tier, covers, expires, repayment, state, soon: s, problems })),
    timing, timingSamples: samples, unknownClocks: openItems.filter((i) => i.clock.source === 'unknown').map((i) => i.id),
    breaches: carried.breaches, stops: carried.stops, cleared: carried.cleared, collection, ceilings: { tiers: ceilings.tiers, envelopeRunnerMinutesPerDay: ceilings.envelopeRunnerMinutesPerDay, timing: ceilings.timing },
  };
  return { report, markdown: weeklyMarkdown({ ...report, ceilings: { ...report.ceilings }, assessment: { tiers: Object.fromEntries(TIERS.map((t) => [t, assessment.tiers[t]])) } }) };
}

// ---------------------------------------------------------------------------------------------
// I/O.

export function listRuns(reader, from, to) {
  const runs = [];
  let complete = true;
  // Six-hour slices: `created=` returns at most 1,000 runs per query, and a busy day has more
  // than that. A slice that still reports more than it can page is an incomplete list.
  const SLICE = DAY / 4;
  for (let a = Math.floor(from / SLICE) * SLICE; a < to; a += SLICE) {
    const range = `${new Date(a).toISOString().slice(0, 19)}Z..${new Date(a + SLICE - 1000).toISOString().slice(0, 19)}Z`;
    for (let page = 1; ; page++) {
      const body = reader.get(`repos/${REPO}/actions/runs?created=${range}&per_page=100&page=${page}&exclude_pull_requests=true`);
      if (!body) return { runs, complete: false };
      if ((body.total_count ?? 0) > 1000) complete = false;
      for (const r of body.workflow_runs ?? []) {
        const at = Date.parse(r.created_at);
        if (at < from || at >= to) continue;
        runs.push({ id: r.id, workflow: String(r.path ?? '').split('/').pop().replace(/@.*$/, ''), event: r.event, branch: r.head_branch, sha: r.head_sha, created: r.created_at, conclusion: r.conclusion, status: r.status, jobs: null });
      }
      if ((body.workflow_runs ?? []).length < 100 || page >= 10) break;
    }
  }
  return { runs, complete };
}

export function readJobs(reader, run) {
  const jobs = [];
  for (let page = 1; page <= 3; page++) {
    const body = reader.get(`repos/${REPO}/actions/runs/${run.id}/jobs?filter=all&per_page=100&page=${page}`);
    if (!body) return null;
    jobs.push(...(body.jobs ?? []).map((j) => ({ name: j.name, status: j.status, started_at: j.started_at, completed_at: j.completed_at })));
    if ((body.jobs ?? []).length < 100) break;
  }
  return jobs;
}

/**
 * Open pull requests' clocks: the stamp-based ready clock (worker receipts live outside the
 * repository) and the queue clock. A PR whose commits or statuses could not all be read gets an
 * unknown clock, never a later start; `complete` says whether every read succeeded.
 */
function openItems(reader, now) {
  const prs = reader.get(`repos/${REPO}/pulls?state=open&per_page=100`);
  if (!prs) return { items: [], pending: [], complete: false };
  const items = [];
  const pending = [];
  let complete = prs.length < 100;
  for (const pr of prs) {
    if (/^bot\/e2e-durations/.test(pr.head?.ref ?? '')) pending.push({ number: pr.number, opened: pr.created_at.slice(0, 10) });
    const commits = reader.get(`repos/${REPO}/pulls/${pr.number}/commits?per_page=100`);
    let known = Array.isArray(commits) && commits.length < 100;
    const stamps = [];
    for (const c of known ? commits : []) {
      const statuses = reader.get(`repos/${REPO}/commits/${c.sha}/statuses?per_page=100`);
      if (!statuses) { known = false; break; }
      for (const st of statuses) if (st.context === 'noacg/reviewed' && st.state === 'success') stamps.push({ at: st.created_at, head: c.sha });
    }
    if (!known) complete = false;
    const clock = known ? prClock({ stamps, openedAt: pr.created_at, now }) : { start: null, source: 'unknown', state: 'unfinished', minutes: null };
    items.push({ id: `#${pr.number}`, category: 'prReady', clock });
    // A timeline over 100 events needs paging, or its queue events go missing (ci01 traps).
    const events = [];
    for (let page = 1; page <= 5; page++) {
      const body = reader.get(`repos/${REPO}/issues/${pr.number}/timeline?per_page=100&page=${page}`);
      if (!body) { complete = false; break; }
      events.push(...body);
      if (body.length < 100) break;
    }
    const queued = events.filter((e) => e.event === 'added_to_merge_queue').map((e) => e.created_at);
    if (queued.length) items.push({ id: `#${pr.number} queue`, category: 'queue', clock: queueClock({ queued, now }) });
  }
  return { items, pending, complete };
}

/** The category a PR's timing sample is reported under: which line of work opened it. */
export const categoryOf = (ref = '') => (/^claude\/plan-jev/.test(ref) ? 'jev-plan' : /^claude\/plan-cicd/.test(ref) ? 'cicd-plan' : /^bot\//.test(ref) ? 'bot' : /^quarantine\//.test(ref) ? 'quarantine' : 'other');

/**
 * Finished pull requests of the window, an even spread of at most `limit`: their ready clock
 * (stamp-based; receipts live outside the repository) and queue clock at landing, as pooled
 * samples. A PR whose start cannot be read is listed as unknown, never sampled as zero.
 */
function finishedPrs(reader, from, to, limit) {
  const merged = [];
  let complete = true;
  for (let page = 1; ; page++) {
    const body = reader.get(`repos/${REPO}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`);
    if (!body || page > 5) { complete = false; break; }
    merged.push(...body.filter((p) => p.merged_at && Date.parse(p.merged_at) >= from && Date.parse(p.merged_at) < to));
    if (body.length < 100 || Date.parse(body.at(-1).updated_at) < from) break;
  }
  merged.sort((a, b) => a.merged_at.localeCompare(b.merged_at));
  const samples = [];
  const unknown = [];
  for (const i of spread(merged.length, limit)) {
    const pr = merged[i];
    const category = categoryOf(pr.head?.ref);
    const commits = reader.get(`repos/${REPO}/pulls/${pr.number}/commits?per_page=100`);
    const stamps = [];
    let known = Array.isArray(commits) && commits.length < 100;
    for (const c of known ? commits : []) {
      const statuses = reader.get(`repos/${REPO}/commits/${c.sha}/statuses?per_page=100`);
      if (!statuses) { known = false; break; }
      for (const st of statuses) if (st.context === 'noacg/reviewed' && st.state === 'success') stamps.push({ at: st.created_at });
    }
    if (!known) complete = false;
    const ready = known ? prClock({ stamps, openedAt: pr.created_at, mergedAt: pr.merged_at, now: pr.merged_at }) : { source: 'unknown' };
    if (ready.source === 'unknown') unknown.push(`#${pr.number}`);
    else samples.push({ measure: 'prReady', id: `#${pr.number}`, category, value: ready.minutes, finishedAt: pr.merged_at, source: ready.source });
    const events = reader.get(`repos/${REPO}/issues/${pr.number}/timeline?per_page=100`);
    if (!events || events.length >= 100) { complete = false; continue; }
    const queued = events.filter((e) => e.event === 'added_to_merge_queue').map((e) => e.created_at);
    if (queued.length) samples.push({ measure: 'queue', id: `#${pr.number}`, category, value: queueClock({ queued, mergedAt: pr.merged_at, now: pr.merged_at }).minutes, finishedAt: pr.merged_at, source: 'timeline' });
  }
  return { samples, unknown, merged: merged.length, complete };
}

/** Finished samples and phase ledgers handed in as JSON: `{ samples: [...], phases: [{ id, events }] }`. */
function readClocks(file, now) {
  if (!file || !existsSync(file)) return { finished: [], open: [], read: false };
  const body = JSON.parse(readFileSync(file, 'utf8'));
  const finished = [...(body.samples ?? [])];
  const open = [];
  for (const p of body.phases ?? []) {
    const clock = phaseClock({ events: p.events, now });
    if (clock.state === 'finished') finished.push({ measure: 'phase', category: p.category ?? 'phase', value: clock.hours, finishedAt: p.events.at(-1).at });
    else open.push({ id: p.id, category: 'phase', clock });
  }
  return { finished, open, read: true };
}

export function collect({ days = 7, budget = 550, now = new Date().toISOString(), previous = null, clocksFile = null, ceilings }) {
  const reader = makeReader(budget);
  const to = Date.parse(now) - 6 * 3_600_000;
  const from = to - days * DAY;
  const listed = listRuns(reader, from, to);
  const runs = listed.runs.filter((r) => r.status === 'completed');
  const open = openItems(reader, now);
  // About a third of the budget for finished PRs' clocks (about five reads each), the rest for jobs.
  const done = finishedPrs(reader, from, to, Math.max(5, Math.floor(budget / 15)));
  const strata = {};
  for (const r of runs) (strata[`${r.workflow}|${r.event}`] ??= []).push(r);
  const keys = Object.keys(strata);
  const left = Math.max(0, budget - reader.calls);
  const k = Math.max(2, Math.floor(left / Math.max(1, keys.length)));
  // Round-robin, so a budget that runs out leaves every stratum sampled rather than the last few
  // empty. Post-landing CI runs get a double share: they are the slowdown series.
  const plan = keys.map((key) => {
    const list = strata[key].sort((a, b) => a.created.localeCompare(b.created));
    const want = key === 'ci.yml|push' || key === 'configured-suite.yml|push' ? 2 * k : k;
    return { list, picks: spread(list.length, want) };
  });
  for (let round = 0; plan.some((p) => p.picks.length > round); round++) {
    for (const { list, picks } of plan) {
      if (round >= picks.length) continue;
      const run = list[picks[round]];
      const jobs = readJobs(reader, run);
      if (jobs) run.jobs = jobs; else if (!reader.exhausted) run.failed = true;
    }
  }
  const clocks = readClocks(clocksFile, now);
  const table = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'e2e-durations.json'), 'utf8'));
  const unfinished = listed.runs.length - runs.length;
  const sampled = runs.filter((r) => r.jobs).length;
  const collection = `${reader.calls} API call(s) of ${budget}, ${runs.length} completed run(s) in ${keys.length} strata, ${sampled} sampled, ${unfinished} still running at the window end${reader.exhausted ? ', BUDGET EXHAUSTED' : ''}${listed.complete ? '' : ', RUN LIST INCOMPLETE'}${reader.failures ? `, ${reader.failures} failed read(s)` : ''}`;
  const built = buildReport({ ceilings, runs, days, windowEnd: new Date(to).toISOString(), now, previous, openItems: [...open.items, ...clocks.open], openComplete: open.complete, listComplete: listed.complete, timingComplete: done.complete, clocksRead: clocks.read, finished: [...done.samples, ...clocks.finished], pending: open.pending, tableRecordedAt: table.source?.recordedAt, collection });
  built.report.unknownClocks.push(...done.unknown);
  built.report.finishedPrs = { merged: done.merged, sampled: done.samples.filter((x) => x.measure === 'prReady').length + done.unknown.length };
  built.report.strata = Object.fromEntries(keys.map((key) => [key, { runs: strata[key].length, sampled: strata[key].filter((r) => r.jobs).length }]));
  return built;
}

/**
 * Keep ONE rolling issue per alarm title: open or update it with `body`, or close it when `body`
 * is empty. Only a run about main may raise or withdraw an alarm (the caller checks the ref).
 */
export function rollingIssue(title, body, gh = (args) => execFileSync('gh', args, { encoding: 'utf8', windowsHide: true })) {
  let found;
  for (let page = 1; page <= 10 && !found; page++) {
    const list = JSON.parse(gh(['api', '-X', 'GET', `repos/${REPO}/issues?state=open&creator=github-actions%5Bbot%5D&per_page=100&page=${page}`]) || '[]');
    found = list.find((i) => i.title === title && !i.pull_request);
    if (list.length < 100) break;
  }
  if (body && found) { gh(['api', '-X', 'PATCH', `repos/${REPO}/issues/${found.number}`, '-f', `body=${body}`]); return `updated #${found.number}`; }
  if (body) { const made = JSON.parse(gh(['api', '-X', 'POST', `repos/${REPO}/issues`, '-f', `title=${title}`, '-f', `body=${body}`])); return `opened #${made.number}`; }
  if (found) { gh(['api', '-X', 'POST', `repos/${REPO}/issues/${found.number}/comments`, '-f', 'body=Nothing overdue any more; closing.']); gh(['api', '-X', 'PATCH', `repos/${REPO}/issues/${found.number}`, '-f', 'state=closed']); return `closed #${found.number}`; }
  return 'nothing to raise';
}

export const AGE_ISSUE = 'Delivery items past their age ceiling';
export const WEEKLY_ISSUE = 'Growth controls: weekly actions';

/** The per-item age check alone: cheap enough to run after every landing. */
export function ages({ ceilings, now = new Date().toISOString(), budget = 400, reader = makeReader(budget) }) {
  const open = openItems(reader, now);
  const actions = ageAlarms(open.items, ceilings, now);
  // A partial read is not "nothing overdue": it raises what it found and never closes the issue.
  if (!open.complete && actions.length === 0) return { actions, body: null, calls: reader.calls, complete: false };
  const body = actions.length
    ? [`Owner: ${ceilings.owner}. Checked ${now} (${reader.calls} API calls). Each item below is past its age ceiling (docs/work-specs/cicd-improvement/evidence/phase-ci01.md section 4.3) and needs a corrective action by its date: land it, unblock it or close it with a reason.`, '', ...actions.map((a) => `- ${a.detail}. Owner ${a.owner}; act by ${a.due}.`)].join('\n')
    : '';
  return { actions, body, calls: reader.calls, complete: open.complete };
}

/**
 * The newest published report: the newest live `growth-report` artifact made on main. One call
 * lists every artifact of that name, expired ones included, so the first week (no report ever)
 * is told apart from an outage that outlived the 35-day retention: the first writes
 * `{ "none": true }`, the second writes nothing and fails, so neither the weekly run nor the gate
 * can mistake a long gap for a clean start.
 */
export function fetchLatest(out, gh = (args) => execFileSync('gh', args, { encoding: 'utf8', windowsHide: true })) {
  const all = (JSON.parse(gh(['api', '-X', 'GET', `repos/${REPO}/actions/artifacts?name=growth-report&per_page=100`])).artifacts ?? [])
    .filter((a) => a.workflow_run?.head_branch === 'main')
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (all.length === 0) {
    writeFileSync(out, `${JSON.stringify({ none: true })}\n`);
    return null;
  }
  const live = all.find((a) => !a.expired);
  if (!live) throw new Error(`every growth report has expired (newest ${all[0].created_at}): weeks went unreported, which is not a first week`);
  const dir = mkdtempSync(path.join(os.tmpdir(), 'growth-'));
  gh(['run', 'download', String(live.workflow_run.id), '-n', 'growth-report', '-D', dir, '-R', REPO]);
  const file = readdirSync(dir).find((f) => f.endsWith('.json'));
  writeFileSync(out, readFileSync(path.join(dir, file)));
  return { run: live.workflow_run.id, file: out };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  const value = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  if (command === 'fetch') {
    const got = fetchLatest(value('--out') ?? 'growth-report.json');
    console.log(got ? `growth report from weekly-audit run ${got.run} -> ${got.file}` : 'no published growth report found');
  } else if (command === 'ages') {
    const ceilings = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'growth-ceilings.json'), 'utf8'));
    const result = ages({ ceilings, now: value('--now') ?? new Date().toISOString() });
    if (result.body === null) {
      console.log(`::warning title=Delivery age alarms::the open items could not all be read (${result.calls} API calls); the alarm issue is left as it was`);
      process.exit(1);
    }
    console.log(result.body || `nothing past its age ceiling (${result.calls} API calls)`);
    if (args.includes('--issue')) console.log(rollingIssue(AGE_ISSUE, result.body));
  } else if (command === 'collect') {
    const ceilings = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'growth-ceilings.json'), 'utf8'));
    const previousFile = value('--previous');
    if (previousFile && !existsSync(previousFile)) {
      // Publishing without last week would reset every breach and drop every growth stop. Fail
      // instead: no artifact is published, the gate keeps reading the last good report, and its
      // age makes the missing week an owned failure.
      console.log(`::error title=Weekly growth report::last week's report (${previousFile}) could not be read; not publishing a report that would reset breaches and stops`);
      process.exit(1);
    }
    const read = previousFile ? JSON.parse(readFileSync(previousFile, 'utf8')) : null;
    const previous = read && !read.none ? read : null;
    const { report, markdown } = collect({ days: Number(value('--days') ?? 7), budget: Number(value('--budget') ?? 550), now: value('--now') ?? new Date().toISOString(), previous, clocksFile: value('--clocks'), ceilings });
    measured(report.measurement.landings, 'landings in the growth window');
    console.log(markdown);
    if (value('--out')) writeFileSync(value('--out'), `${JSON.stringify(report, null, 2)}\n`);
    if (value('--summary')) appendFileSync(value('--summary'), `${markdown}\n`);
    if (args.includes('--issue')) console.log(rollingIssue(WEEKLY_ISSUE, report.breaches.length ? markdown : ''));
  } else {
    console.error('usage: growth-report.mjs collect|ages|fetch [...] (see the header)');
    process.exit(2);
  }
}
