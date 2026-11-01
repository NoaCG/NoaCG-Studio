#!/usr/bin/env node
// HOW LONG EACH LANDING WAITS FOR A COMPLETE SCHEDULED VERDICT, and which landing has waited longest.
//
//   node scripts/schedule-coverage.mjs [--since <iso>] [--now <iso>] [--json] [--summary <file>]
//
// WHY (cicd-improvement ci13, spec D4 and AC-5). The nightly is the only automated run of the
// whole E2E suite, the unscoped catalog sweeps and engine-floor. nightly-drift.yml alarms when the
// nightly did not START inside 26 hours. That is a start alarm, not a coverage measurement: a run
// can start, be cancelled or skip a job, and the drift alarm stays green. This answers the
// question the spec asks instead: for each landing on main, when did a COMPLETE nightly that
// contains it finish, and which landing is still waiting.
//
// IDENTITY, NOT ANCESTRY. A run speaks for the commit it requested (its `head_sha`), and only when
// that commit is itself a landing on main's first-parent line. It covers that landing and every
// earlier one on the line: that is range evidence, the combined tree, never an exact verdict on an
// earlier landing's own tree, and the report says how many landings were checked exactly. A run on
// a branch, or on a commit that is not a first-parent landing, covers nothing here.
//
// COMPLETE means every job the nightly owns reached success or failure: the plan, every planned
// E2E shard, the catalog tripwire, the five catalog gates, the report and the verdict. A cancelled,
// skipped or missing job leaves the run incomplete, and an incomplete run covers nothing. A RED
// complete run is a detection, not a clearance: the strict delay waits for a GREEN complete run,
// and the landings in a red run's range are the culprit replay's input.
//
// It reads; it never files, comments or fails a gate. nightly-drift.yml runs it as a report.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs as nodeParseArgs } from 'node:util';

const HOUR = 3_600_000;

/** The bound the spec sets: landing to completed coverage verdict, queue and setup included. */
export const DEADLINE_HOURS = 24;

/** nightly.yml's cron, `20 0 * * *`. The projection below starts from it. */
export const NIGHTLY_CRON_UTC = { hour: 0, minute: 20 };

/**
 * The jobs a complete nightly carries, by name prefix. `Nightly E2E ` is the shard matrix: the
 * shard count is read from the names (`Nightly E2E 3/12`), and every shard 1..N must be present.
 */
export const NIGHTLY_JOBS = [
  'Nightly shard plan',
  'Nightly E2E ',
  'Catalog calibration tripwire',
  'Type floor, overflow sweep and field coverage',
  'Combined nightly report',
  'Nightly verdict',
];

/**
 * The contracts the ci13 evidence measures one by one, each with the jobs that carry it in each
 * workflow that can. catalog-gates.yml does not run engine-floor or the E2E suite, so those two
 * have one carrier: the nightly. The whole-nightly contract is NIGHTLY_JOBS.
 */
export const CONTRACTS = {
  'catalog battery (emit, calibration, four sweeps)': {
    'nightly.yml': ['Catalog calibration tripwire', 'Type floor, overflow sweep and field coverage'],
    'catalog-gates.yml': ['Which designs', 'Emit fingerprints and catalog specs', 'Type floor, overflow, field coverage, numerals'],
  },
  'engine-floor': { 'nightly.yml': ['Type floor, overflow sweep and field coverage'] },
  'full E2E suite': { 'nightly.yml': ['Nightly shard plan', 'Nightly E2E ', 'Combined nightly report'] },
};

const FINISHED = new Set(['success', 'failure']);

/**
 * pending | incomplete | green | red, with the reasons. `run` is { status, conclusion, jobs:
 * [{ name, conclusion }], required?, scope? }. The verdict is read from the REQUIRED jobs only, so
 * one contract (the catalog battery, say) can be judged on a run another contract failed. A run
 * carries its own `required` list when it is judged for a contract other than the whole nightly,
 * and `scope` when its workflow can measure part of the catalog: anything but `full` is incomplete
 * for a whole-catalog contract.
 */
export function runVerdict(run, required = run.required ?? NIGHTLY_JOBS) {
  if (run.status !== 'completed') return { verdict: 'pending', reasons: [`status ${run.status}`] };
  const jobs = run.jobs ?? [];
  const reasons = [];
  if (run.scope !== undefined && run.scope !== 'full') reasons.push(`scope ${run.scope}, not the whole catalog`);
  let failed = false;
  for (const prefix of required) {
    const matching = jobs.filter((j) => j.name.startsWith(prefix));
    if (matching.length === 0) reasons.push(`no "${prefix.trim()}" job`);
    for (const j of matching) {
      if (j.conclusion === 'failure') failed = true;
      else if (!FINISHED.has(j.conclusion)) reasons.push(`${j.name}: ${j.conclusion ?? 'no conclusion'}`);
    }
    if (prefix === 'Nightly E2E ' && matching.length) {
      const totals = new Set();
      const seen = new Set();
      for (const j of matching) {
        const m = /(\d+)\/(\d+)\s*$/.exec(j.name);
        if (!m) continue;
        seen.add(Number(m[1]));
        totals.add(Number(m[2]));
      }
      if (totals.size !== 1) reasons.push('E2E shard totals disagree or are unreadable');
      else {
        const n = [...totals][0];
        for (let i = 1; i <= n; i++) if (!seen.has(i)) reasons.push(`E2E shard ${i}/${n} missing`);
      }
    }
  }
  if (reasons.length) return { verdict: 'incomplete', reasons };
  return failed ? { verdict: 'red', reasons: ['a required job failed'] } : { verdict: 'green', reasons: [] };
}

/**
 * Per landing: the first complete run (green or red) and the first green complete run that
 * contain it, by requested-commit identity on the first-parent line, and the delays.
 *
 * landings: [{ sha, at }] oldest first (at in ms). runs: [{ id, headSha, branch, createdAt,
 * completedAt, status, conclusion, jobs }] (times in ms). Returns { landings, runs } annotated.
 */
export function coverageTimeline({ landings, runs, now, deadlineHours = DEADLINE_HOURS }) {
  const position = new Map(landings.map((l, i) => [l.sha, i]));
  const judged = runs.map((r) => {
    const v = runVerdict(r);
    const pos = r.branch === 'main' && position.has(r.headSha) ? position.get(r.headSha) : null;
    return { ...r, ...v, position: pos, attributable: pos !== null };
  });
  const finishing = judged
    .filter((r) => r.attributable && (r.verdict === 'green' || r.verdict === 'red') && r.completedAt <= now)
    .sort((a, b) => a.completedAt - b.completedAt);
  const deadline = deadlineHours * HOUR;
  const rows = landings.map((l, i) => {
    const any = finishing.find((r) => r.position >= i) ?? null;
    const green = finishing.find((r) => r.position >= i && r.verdict === 'green') ?? null;
    const delay = (r) => (r ? r.completedAt - l.at : null);
    const strict = delay(green);
    const waited = strict ?? now - l.at;
    return {
      sha: l.sha,
      at: l.at,
      firstVerdictRun: any?.id ?? null,
      firstVerdict: any?.verdict ?? null,
      anyDelayMs: delay(any),
      greenRun: green?.id ?? null,
      greenDelayMs: strict,
      exact: green ? green.headSha === l.sha : false,
      covered: green !== null,
      breach: waited > deadline,
      deadlineAt: l.at + deadline,
    };
  });
  return { landings: rows, runs: judged };
}

/** The oldest landing with no green complete run, and how long it has left. Null when none waits. */
export function oldestUncovered(timeline, now) {
  const row = timeline.landings.find((l) => !l.covered);
  if (!row) return null;
  return { sha: row.sha, at: row.at, ageMs: now - row.at, deadlineAt: row.deadlineAt, remainingMs: row.deadlineAt - now };
}

/** The next nightly cron instant strictly after `now`. */
export function nextCron(now, cron = NIGHTLY_CRON_UTC) {
  const d = new Date(now);
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), cron.hour, cron.minute);
  return t > now ? t : t + 24 * HOUR;
}

/**
 * When the next nightly can be relied on to have finished: the next cron instant plus the WORST
 * observed start delay and the WORST observed duration among recent attributable complete runs.
 * Worst, not median: the bound is per landing, so every breach counts. With no history the
 * projection is unknown (null), and the caller treats that as no margin.
 */
export function projectedCompletion(timeline, now, cron = NIGHTLY_CRON_UTC) {
  const done = timeline.runs.filter((r) => r.event === 'schedule' && (r.verdict === 'green' || r.verdict === 'red'));
  if (done.length === 0) return null;
  let startDelay = 0;
  let duration = 0;
  for (const r of done) {
    const slot = nextCron(r.createdAt - 24 * HOUR, cron);
    startDelay = Math.max(startDelay, r.createdAt - slot);
    duration = Math.max(duration, r.completedAt - r.createdAt);
  }
  return { at: nextCron(now, cron) + startDelay + duration, startDelayMs: startDelay, durationMs: duration };
}

/**
 * The repair-margin alarm: the oldest uncovered landing whose deadline falls before the projected
 * completion of the next nightly. That landing will breach unless someone runs a complete sweep
 * (a nightly dispatch on main) before its deadline, which is the repair.
 */
export function projectedBreach(timeline, now) {
  const oldest = oldestUncovered(timeline, now);
  if (!oldest) return null;
  const projection = projectedCompletion(timeline, now);
  if (!projection) return { ...oldest, projection: null, breach: true, reason: 'no complete scheduled nightly to project from' };
  return { ...oldest, projection, breach: oldest.deadlineAt < projection.at, reason: null };
}

/**
 * Scheduled days whose cron instant was followed by no scheduled run within 24 hours: the missed
 * runs. `days` are the UTC dates (YYYY-MM-DD) to check. A run that started but did not complete is
 * not missed; it is incomplete, which `runVerdict` reports.
 */
export function missedSlots(runs, days, cron = NIGHTLY_CRON_UTC) {
  const scheduled = runs.filter((r) => r.event === 'schedule');
  return days.filter((day) => {
    const slot = Date.parse(`${day}T${String(cron.hour).padStart(2, '0')}:${String(cron.minute).padStart(2, '0')}:00Z`);
    return !scheduled.some((r) => r.createdAt >= slot && r.createdAt < slot + 24 * HOUR);
  });
}

/**
 * Culprit replay over a red run's range. `range` is the landings between the last green complete
 * run (exclusive) and the red run's commit (inclusive), oldest first. `verdictAt(sha)` is the
 * replayed check's result AT THAT EXACT COMMIT: 'pass', 'fail' or undefined when not replayed.
 * `prVerdictAt(sha)`, optional, is that landing's own pre-merge result for the same check.
 *
 * The culprit is the first landing that fails when its predecessor passes (the base before the
 * range passed: it was green). A later landing that passes again is a CORRECTED SUCCESSOR: the
 * defect is still attributed to the culprit, and listed as masked, because a green run at the
 * successor would have hidden it. A culprit whose own PR passed the same check failed only in
 * combination with earlier landings: an interaction. A landing without a replay verdict leaves the
 * attribution unresolved, never guessed.
 */
export function replayCulprit(range, verdictAt, prVerdictAt = () => undefined) {
  const unresolved = [];
  const defects = [];
  let previous = 'pass';
  for (const sha of range) {
    const v = verdictAt(sha);
    if (v === undefined) {
      unresolved.push(sha);
      previous = undefined;
      continue;
    }
    if (v === 'fail' && previous === 'pass') defects.push({ culprit: sha, correctedBy: null, interaction: prVerdictAt(sha) === 'pass' });
    if (v === 'fail' && previous === undefined) unresolved.push(sha);
    if (v === 'pass' && previous === 'fail' && defects.length) defects[defects.length - 1].correctedBy ??= sha;
    previous = v;
  }
  const masked = defects.filter((d) => d.correctedBy !== null);
  return { culprit: defects[0]?.culprit ?? null, defects, masked, unresolved, resolved: unresolved.length === 0 };
}

/**
 * What a catalog selection may rely on, given this report: `scoped-eligible` only when nothing
 * below holds, otherwise `full` with every reason. ci13 activates nothing; this is the rollback
 * rule its drills exercise and that ci16 reads.
 */
export function scopeDecision({ timeline, now, missed = [], replays = [] }) {
  const reasons = [];
  const breaches = timeline.landings.filter((l) => l.breach);
  if (breaches.length) reasons.push(`${breaches.length} landing(s) waited more than ${DEADLINE_HOURS}h for a green complete nightly`);
  const incomplete = timeline.runs.filter((r) => r.attributable && r.verdict === 'incomplete');
  if (incomplete.length) reasons.push(`${incomplete.length} incomplete nightly run(s): ${incomplete.map((r) => r.id).join(', ')}`);
  if (missed.length) reasons.push(`missed scheduled slot(s): ${missed.join(', ')}`);
  const projected = projectedBreach(timeline, now);
  if (projected?.breach) reasons.push(`oldest uncovered landing ${projected.sha.slice(0, 8)} is projected past its deadline`);
  for (const r of replays) if (!r.resolved) reasons.push(`culprit replay unresolved for ${r.unresolved.map((s) => s.slice(0, 8)).join(', ')}`);
  return { scope: reasons.length ? 'full' : 'scoped-eligible', reasons };
}

/** Breach and delay counts. Every breach is counted; the maximum is reported, never a percentile. */
export function summarize(timeline) {
  const rows = timeline.landings;
  const covered = rows.filter((l) => l.covered);
  const max = (xs) => (xs.length ? Math.max(...xs) : null);
  return {
    landings: rows.length,
    covered: covered.length,
    uncovered: rows.length - covered.length,
    exact: covered.filter((l) => l.exact).length,
    breaches: rows.filter((l) => l.breach).length,
    maxGreenDelayHours: max(covered.map((l) => l.greenDelayMs / HOUR)),
    maxAnyDelayHours: max(rows.filter((l) => l.anyDelayMs !== null).map((l) => l.anyDelayMs / HOUR)),
    runs: {
      attributable: timeline.runs.filter((r) => r.attributable).length,
      green: timeline.runs.filter((r) => r.attributable && r.verdict === 'green').length,
      red: timeline.runs.filter((r) => r.attributable && r.verdict === 'red').length,
      incomplete: timeline.runs.filter((r) => r.attributable && r.verdict === 'incomplete').length,
      pending: timeline.runs.filter((r) => r.attributable && r.verdict === 'pending').length,
      unattributable: timeline.runs.filter((r) => !r.attributable).length,
    },
  };
}

const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');
const hours = (ms) => (ms / HOUR).toFixed(1);

/** The markdown a summary or a person reads. */
export function render(timeline, now) {
  const s = summarize(timeline);
  const lines = [
    `### Landing coverage by the nightly (as of ${iso(now)})`,
    '',
    `${s.landings} landing(s); ${s.covered} cleared by a green complete nightly (${s.exact} exactly at their own commit), ${s.uncovered} waiting.`,
    `Breaches of the ${DEADLINE_HOURS}h bound: ${s.breaches}. Longest wait to green: ${s.maxGreenDelayHours === null ? 'n/a' : `${s.maxGreenDelayHours.toFixed(1)}h`}.`,
    `Nightly runs on main: ${s.runs.green} green, ${s.runs.red} red, ${s.runs.incomplete} incomplete, ${s.runs.pending} still running (${s.runs.unattributable} not attributable to a landing).`,
  ];
  const projected = projectedBreach(timeline, now);
  if (projected) {
    lines.push('', `Oldest uncovered landing: ${projected.sha.slice(0, 8)}, landed ${iso(projected.at)}, waiting ${hours(projected.ageMs)}h, deadline ${iso(projected.deadlineAt)}.`);
    if (projected.projection) lines.push(`Next nightly projected complete by ${iso(projected.projection.at)} (worst observed start delay ${hours(projected.projection.startDelayMs)}h, duration ${hours(projected.projection.durationMs)}h).`);
    lines.push(projected.breach ? `PROJECTED BREACH: ${projected.reason ?? 'its deadline falls before that'}. The repair is a nightly dispatch on main before the deadline.` : 'Inside the bound on the projection.');
  } else lines.push('', 'Every landing in the window is cleared.');
  for (const r of timeline.runs.filter((x) => x.attributable && x.verdict === 'incomplete')) lines.push(`- incomplete run ${r.id}: ${r.reasons.join('; ')}`);
  return lines.join('\n');
}

// ---- CLI: reads git and GitHub, read-only. ----

function gh(args) {
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
}

export function parseArgs(argv) {
  const { values } = nodeParseArgs({
    args: argv,
    options: { since: { type: 'string' }, now: { type: 'string' }, json: { type: 'boolean' }, summary: { type: 'string' }, ref: { type: 'string' } },
    strict: true,
  });
  const now = values.now ? Date.parse(values.now) : Date.now();
  // Five days: enough nightlies for the projection's worst start delay and duration, and every
  // run in the window requested a landing inside it.
  const since = values.since ? Date.parse(values.since) : now - 5 * 24 * HOUR;
  if (!Number.isFinite(now) || !Number.isFinite(since)) throw new Error('--since and --now take ISO times');
  return { now, since, json: Boolean(values.json), summary: values.summary ?? null, ref: values.ref ?? 'origin/main' };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const repo = process.env.GH_REPO;
  if (!repo) throw new Error('GH_REPO (owner/name) is required');
  const log = execFileSync('git', ['log', '--first-parent', '--reverse', '--format=%H %cI', `--since=${iso(opts.since)}`, opts.ref], { encoding: 'utf8' });
  const landings = log.split('\n').filter(Boolean).map((line) => {
    const [sha, at] = line.split(' ');
    return { sha, at: Date.parse(at) };
  });
  const listed = gh(['api', `repos/${repo}/actions/workflows/nightly.yml/runs?branch=main&per_page=30`]).workflow_runs;
  const runs = listed
    .filter((r) => Date.parse(r.created_at) >= opts.since && Date.parse(r.created_at) <= opts.now)
    .map((r) => ({
      id: r.id,
      headSha: r.head_sha,
      branch: r.head_branch,
      event: r.event,
      createdAt: Date.parse(r.created_at),
      completedAt: Date.parse(r.updated_at),
      status: r.status,
      conclusion: r.conclusion,
      jobs: r.status === 'completed' ? gh(['api', `repos/${repo}/actions/runs/${r.id}/jobs?per_page=50`]).jobs : [],
    }));
  const timeline = coverageTimeline({ landings, runs, now: opts.now });
  const text = render(timeline, opts.now);
  if (opts.summary) appendFileSync(opts.summary, `${text}\n`);
  if (opts.json) console.log(JSON.stringify({ summary: summarize(timeline), oldest: projectedBreach(timeline, opts.now), timeline }, null, 2));
  else console.log(text);
  const projected = projectedBreach(timeline, opts.now);
  if (projected?.breach) console.log(`::warning title=Landing coverage::${projected.sha.slice(0, 8)} is projected to wait past ${DEADLINE_HOURS}h for a complete nightly.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`schedule-coverage: ${error.message}`);
    process.exit(1);
  }
}
