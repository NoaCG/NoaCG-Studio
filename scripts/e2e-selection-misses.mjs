#!/usr/bin/env node
// gate: workflow weekly-audit.yml
// guards: scripts/e2e-affected.mjs, scripts/ci-failure-set.mjs, scripts/e2e-lists.mjs, scripts/e2e-quarantine.mjs
// DID SELECTION MISS IT? The AC-4 miss audit (cicd-improvement ci07, evidence/phase-ci07.md Rules
// A1 to A5 and Q5). Every red full run on main - the offline suite in ci.yml and the configured
// suite in configured-suite.yml - is replayed against the ORIGINAL selection of each landing that
// could have caused it, and the audit window is measured from the latest audit reset.
//
//   node scripts/e2e-selection-misses.mjs [--days 7] [--before 0] [--limit 100] [--calls 100] [--ref HEAD] [--json]
//   node scripts/e2e-selection-misses.mjs resets [--ref HEAD] [--landings 400] [--json]
//
// THE ORIGINAL SELECTION, NOT TODAY'S PLANNER. The question is whether the plan that actually ran
// before a landing merged selected the spec its full run then failed. That plan is printed by the
// E2E plan job of the landing's merge-group CI run (`plan: {...}`; the merge group's commit is the
// landed commit), so it is read from that job's log. A plan that cannot be read is `unknown`, which
// counts with the misses as unexplained; it is never taken for `selected`. Replaying today's
// planner instead would credit a later header to an earlier landing.
//
// FLAKES ARE INVESTIGATED, NOT DROPPED. A spec the quarantine store knows from the window keeps its
// verdict and is marked `flake`: a fail-then-pass on main is still a fault the selection may have
// let in. A spec the plan left out as quarantined is a `quarantined` coverage gap (Rules Q1 to Q5).
//
// RESETS. The two-week comparison runs from the latest audit reset (docs/work-specs/cicd-improvement
// runbook.md "Audit reset and coverage rules"): a landing that changes selector code, adds or
// removes a shared-change (`// focus`) or critical-journey (`// critical:`) header line, or whose
// commits carry a `Selection-audit-reset: <reason>` trailer (a mapping corrected after a miss, or
// any other selection change the files alone do not show). Read from git, so it cannot go stale.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchFailureSet, ghJsonLines, resolveRepo } from './ci-failure-set.mjs';
import { loadIncidentContext, quarantineIncidents, readStore } from './e2e-quarantine.mjs';
import { measured } from './measured.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * SELECTOR CODE (reset class "selector or header/list semantics" and "critical/shared membership").
 * The planner, its header and list reader, the traced-map reader, copy matching, spec identity, the
 * quarantine split, the catalog slicer and the contract map. The traced map's data
 * (scripts/e2e-traced.json) and the durations table are refreshes, not semantics.
 */
export const SELECTION_CODE = [
  'scripts/e2e-affected.mjs',
  'scripts/e2e-affected-copy.mjs',
  'scripts/e2e-lists.mjs',
  'scripts/e2e-traced.mjs',
  'scripts/e2e-spec-names.mjs',
  'scripts/e2e-quarantine.mjs',
  'scripts/catalog-affected.mjs',
  'scripts/e2e-contracts.mjs',
];

/** The commit trailer that declares a reset the files alone do not show. */
export const RESET_TRAILER = 'Selection-audit-reset';

/** The first `plan: {...}` line of a plan job's log, parsed, or null when there is none or it does not parse. */
export function parsePrintedPlan(log) {
  const line = String(log ?? '').split('\n').find((l) => /(?:^|\s)plan: \{/.test(l));
  if (!line) return null;
  try {
    const plan = JSON.parse(line.slice(line.indexOf('plan: {') + 'plan: '.length));
    return plan && typeof plan.mode === 'string' && Array.isArray(plan.specs) ? plan : null;
  } catch {
    return null;
  }
}

/**
 * The failing configured specs a configured-suite verdict printed (`failure set (<hash>):` and its
 * indented `<spec>::<test>` lines), as repo paths, sorted. Pure. The configured jobs annotate no
 * spec, so this log is where their names are.
 */
export function configuredFailures(log) {
  const lines = String(log ?? '').split('\n').map((l) => l.replace(/^\S+Z /, ''));
  const out = new Set();
  let inSet = false;
  for (const line of lines) {
    if (/^failure set \(/.test(line)) { inSet = true; continue; }
    const m = inSet && /^\s+([\w.-]+\.spec\.ts)::/.exec(line);
    if (m) out.add(`e2e/configured/${m[1]}`);
    else inSet = false;
  }
  return [...out].sort();
}

/** One plan's answer for one failing spec. `plan` is null when it could not be read. */
function verdictOf(spec, kind, plan) {
  if (!plan) return 'unread';
  const name = spec.split('/').pop();
  if (kind === 'configured') {
    const m = plan.configured;
    if (!m || typeof m !== 'object' || !Array.isArray(m.specs)) return 'no-selection';
    if (m.specs.includes(name)) return 'selected';
    if ((m.quarantined ?? []).includes(spec)) return 'quarantined';
    return 'not-selected';
  }
  if (plan.mode === 'full') return 'full';
  if (plan.specs.includes(name)) return 'selected';
  if ((plan.quarantined ?? []).includes(spec)) return 'quarantined';
  return 'not-selected';
}

/**
 * Classify one failing spec against the original plans of every candidate culprit (Rules A1 to A3).
 * Pure. First match wins: full, selected, quarantined, unknown (a plan unread), no-selection (a
 * configured culprit before ci06), miss.
 * @param {string} spec repo-relative (`e2e/x.spec.ts`, `e2e/configured/x.spec.ts`) or a job item
 * @param {(object | null)[]} plans the candidates' printed plans, null where unread
 * @param {{ kind?: 'offline' | 'configured', flaky?: Set<string> }} [options]
 * @returns {{ spec: string, verdict: string, flake: boolean }}
 */
export function classifyAgainst(spec, plans, { kind = 'offline', flaky = new Set() } = {}) {
  const flake = flaky.has(spec.split('/').pop());
  if (!/\.spec\.ts$/.test(spec)) return { spec, verdict: 'not-a-spec', flake };
  const answers = plans.length ? plans.map((p) => verdictOf(spec, kind, p)) : ['unread'];
  for (const [answer, verdict] of [['full', 'full'], ['selected', 'selected'], ['quarantined', 'quarantined'], ['unread', 'unknown'], ['no-selection', 'no-selection']]) {
    if (answers.includes(answer)) return { spec, verdict, flake };
  }
  return { spec, verdict: 'miss', flake };
}

/**
 * Which failing specs each red run INTRODUCED. A red main stays red through the landings after it
 * until somebody fixes it, so a spec counts for the first run in which it fails after a run in
 * which it did not, and a run inherits the rest. Pure; `runs` oldest first.
 * @returns {{ sha: string, specs: string[] }[]}
 */
export function newlyFailing(runs) {
  let before = new Set();
  const out = [];
  for (const run of runs) {
    const now = new Set(run.specs ?? []);
    if (run.conclusion === 'failure') out.push({ sha: run.sha, specs: [...now].filter((s) => !before.has(s)) });
    before = now;
  }
  return out;
}

/** Basenames of specs the quarantine store entered or released on or after `sinceIso`. */
export function flakyIn(store, sinceIso) {
  const out = new Set();
  for (const [spec, e] of Object.entries(store.specs ?? {})) if (e.since >= sinceIso) out.add(spec.split('/').pop());
  for (const [spec, e] of Object.entries(store.released ?? {})) if (e.last >= sinceIso) out.add(spec.split('/').pop());
  return out;
}

/**
 * Is one first-parent landing an audit reset (Rule A4)? Pure.
 * @param {{ sha: string, date: string, files: string[], headerLines: string[], messages: string }} landing
 *   files: the landing's diff; headerLines: its added and removed spec lines (`+// focus`);
 *   messages: the commit messages it brought in
 * @returns {{ sha: string, date: string, reason: string } | null}
 */
export function resetOf(landing) {
  const reasons = [];
  const code = landing.files.filter((f) => SELECTION_CODE.includes(f));
  if (code.length) reasons.push(`selector code: ${code.join(', ')}`);
  const membership = landing.headerLines.filter((l) => /^[+-]\s*\/\/+\s*(?:focus\s*$|critical\s*:)/.test(l));
  if (membership.length) reasons.push(`critical/shared membership: ${membership.length} header line(s) changed`);
  const trailers = [...String(landing.messages ?? '').matchAll(new RegExp(`^${RESET_TRAILER}:\\s*(.+)$`, 'gm'))].map((m) => m[1].trim());
  if (trailers.length) reasons.push(`declared: ${trailers.join('; ')}`);
  return reasons.length ? { sha: landing.sha, date: landing.date, reason: reasons.join(' | ') } : null;
}

/**
 * The latest reset on main's first-parent history, newest first (Rule A4). `git` is injected.
 * Returns `{ reset, read }`: `reset` null when none was found in the `landings` read, and `read`
 * false when the history could not be read (a shallow clone), which the status treats as unknown.
 */
export function latestReset({ ref = 'HEAD', landings = 400, git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 }) } = {}) {
  let log;
  try {
    log = git('log', '--first-parent', `-${landings}`, '--format=%H %cI %P', ref).trim().split('\n').filter(Boolean);
  } catch {
    return { reset: null, read: false };
  }
  for (const line of log) {
    const [sha, date, parent] = line.split(' ');
    if (!parent) return { reset: null, read: false }; // the root, or a shallow boundary: history unread
    const files = git('diff', '--name-only', '--no-renames', parent, sha).split('\n').filter(Boolean);
    const specs = files.filter((f) => /^e2e\/(?:configured\/)?[^/]+\.spec\.ts$/.test(f));
    const headerLines = specs.length ? git('diff', '--unified=0', parent, sha, '--', ...specs).split('\n').filter((l) => /^[+-](?![+-])/.test(l)) : [];
    const messages = git('log', '--format=%B', `${parent}..${sha}`);
    const reset = resetOf({ sha, date, files, headerLines, messages });
    if (reset) return { reset, read: true };
  }
  return { reset: null, read: true };
}

/**
 * The audit's status (Rules A5 and Q5). Pure. `blocked` while a critical incident is open or any
 * incident is overdue; otherwise `misses` while a miss or unknown stands; `clean` only with none.
 * The days since the latest reset are reported, never read as qualification.
 */
export function auditStatus({ rows, incidents, reset, today }) {
  const misses = rows.filter((r) => r.verdict === 'miss');
  const unknown = rows.filter((r) => r.verdict === 'unknown');
  const blocking = incidents.filter((i) => i.severity === 'critical' || i.overdue);
  const days = reset.reset ? Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(reset.reset.date.slice(0, 10) + 'T00:00:00Z')) / 86_400_000) : null;
  const status = blocking.length ? 'blocked' : misses.length || unknown.length || !reset.read ? 'misses' : 'clean';
  return { status, misses: misses.length, unknown: unknown.length, blocking: blocking.map((i) => i.spec), days };
}

/** The report text. Pure. */
export function summarize({ rows, status, reset, incidents }) {
  const note = { miss: ' - add a covers line or a shared-set entry, and record the reset', unknown: ' - the original plan could not be read: unexplained', quarantined: ' - a quarantined coverage gap (incident)', 'no-selection': ' - no pre-merge configured check existed then (before ci06)' };
  const r = reset.reset;
  return [
    `### Selection miss audit: ${status.status}`,
    '',
    `${status.misses} miss(es) and ${status.unknown} unknown of ${rows.length} failing item(s) on ${new Set(rows.map((x) => x.runId)).size} red full run(s), each against its culprits' original plans.`,
    r ? `Latest audit reset: ${r.sha.slice(0, 9)} at ${r.date} (${r.reason}); ${status.days} day(s) since. Days are reported, not read as qualification.` : reset.read ? 'No audit reset in the history read.' : 'History unread (shallow clone?): the latest reset is unknown, so the audit is not clean.',
    status.blocking.length ? `Blocked by quarantine incidents: ${status.blocking.join(', ')} (critical or overdue; ${incidents.length} incident(s) in all).` : `Quarantine incidents: ${incidents.length}, none critical or overdue.`,
    '',
    '| Red run | Workflow | Failing spec | Culprit landings | Against the original plans |',
    '|---|---|---|---|---|',
    ...rows.map((x) => `| ${x.runId} | ${x.workflow} | \`${x.spec}\` | ${x.culprits.map((c) => c.slice(0, 9)).join(' ')} | ${x.verdict}${x.flake ? ' (flake: investigate)' : ''}${note[x.verdict] ?? ''} |`),
    '',
    'Zero misses is evidence for the per-change plan, not proof of completeness; the full runs on main stay.',
    '',
  ].join('\n');
}

/** A gh caller that refuses past its call budget (runbook: at most 100 calls a collection pass). */
export function budgetedGh(limit, gh = ghJsonLines) {
  let used = 0;
  const spend = () => {
    if (used >= limit) throw new Error(`call budget of ${limit} spent`);
    used += 1;
  };
  const call = (args) => {
    spend();
    return gh(args);
  };
  call.spend = spend;
  call.used = () => used;
  return call;
}

/** The printed plan of a landing's merge-group CI run, or null. Three calls at most. */
export function originalPlanOf(sha, { repo, gh, rawLog }) {
  try {
    const run = gh([`repos/${repo}/actions/runs?head_sha=${sha}&event=merge_group&per_page=10`, '--jq', '.workflow_runs[] | select(.path == ".github/workflows/ci.yml") | .id'])[0];
    if (!run) return null;
    const job = gh([`repos/${repo}/actions/runs/${run}/jobs?per_page=100`, '--jq', '.jobs[] | select(.name == "E2E plan") | .id'])[0];
    return job ? parsePrintedPlan(rawLog(job)) : null;
  } catch {
    return null;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (flag, dflt) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : dflt; };
  const reset = latestReset({ ref: value('--ref', 'HEAD'), landings: Number(value('--landings', 400)) });
  if (args[0] === 'resets') {
    if (args.includes('--json')) console.log(JSON.stringify(reset));
    else console.log(reset.reset ? `latest reset ${reset.reset.sha} ${reset.reset.date}: ${reset.reset.reason}` : reset.read ? 'no reset in the history read' : 'history unread');
    process.exit(reset.read ? 0 : 1);
  }
  const days = Number(value('--days', 7));
  const limit = Number(value('--limit', 100));
  const { repo } = resolveRepo();
  if (!repo) {
    console.error('e2e-selection-misses: cannot resolve the repository (GH_REPO or the origin remote).');
    process.exit(2);
  }
  const gh = budgetedGh(Number(value('--calls', 100)));
  const rawLog = (job) => {
    gh.spend(); // a log read is one call of the budget too
    return execFileSync('gh', ['api', `repos/${repo}/actions/jobs/${job}/logs`], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  };
  // `--before <days>` moves the window back, so older history is replayed in further bounded passes.
  const until = Date.now() - Number(value('--before', 0)) * 86_400_000;
  const since = until - days * 86_400_000;
  const sinceIso = new Date(since).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const store = readStore();
  const flaky = flakyIn(store, sinceIso);
  const incidents = quarantineIncidents(store, { ...(await loadIncidentContext()), today });
  const plans = new Map();
  const planOf = (sha) => {
    if (!plans.has(sha)) plans.set(sha, originalPlanOf(sha, { repo, gh, rawLog }));
    return plans.get(sha);
  };
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  const rows = [];
  for (const [workflow, kind] of [['ci.yml', 'offline'], ['configured-suite.yml', 'configured']]) {
    let all;
    try {
      all = gh([`repos/${repo}/actions/workflows/${workflow}/runs?branch=main&event=push&status=completed&created=${new Date(since).toISOString().slice(0, 10)}..${new Date(until).toISOString().slice(0, 10)}&per_page=${Math.min(100, limit)}`, '--jq', '.workflow_runs[] | {id, head_sha, conclusion, created_at}'])
        .filter((r) => r?.id && (r.conclusion === 'failure' || r.conclusion === 'success') && Date.parse(r.created_at) >= since && Date.parse(r.created_at) < until)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
    } catch (e) {
      console.error(`e2e-selection-misses: ${workflow} runs unread (${String(e?.message ?? e).split('\n')[0]}) - its failures count as unknown.`);
      rows.push({ runId: '-', workflow, spec: `job: ${workflow} runs unread`, verdict: 'unknown', flake: false, culprits: [] });
      continue;
    }
    const red = all.filter((r) => r.conclusion === 'failure');
    measured.optional(red.length, `red ${workflow} runs on main in the window`, 'a week with no red main run has nothing to replay');
    const failing = new Map();
    // Job items stay: a failing job that annotated no spec (a build step, a lost shard) is a
    // full-run failure too, listed as `not-a-spec` rather than dropped. A configured run's specs
    // come from its verdict job's log (`configuredFailures`).
    for (const r of red) {
      try {
        let items = fetchFailureSet(r.id, { repo, gh }).items;
        if (kind === 'configured') {
          const job = gh([`repos/${repo}/actions/runs/${r.id}/jobs?per_page=100`, '--jq', '.jobs[] | select(.name | startswith("Configured E2E (")) | .id'])[0];
          const specs = job ? configuredFailures(rawLog(job)) : [];
          if (specs.length) items = [...specs, ...items.filter((i) => !/^job: Configured E2E/.test(i))];
        }
        failing.set(r.id, items);
      } catch { failing.set(r.id, null); }
    }
    const introduced = new Map(newlyFailing(all.map((r) => ({ sha: r.head_sha, conclusion: r.conclusion, specs: failing.get(r.id) ?? [] }))).map((r) => [r.sha, r.specs]));
    for (const run of red) {
      if (failing.get(run.id) === null) {
        rows.push({ runId: run.id, workflow, spec: 'failure set unread', verdict: 'unknown', flake: false, culprits: [run.head_sha] });
        continue;
      }
      const specs = introduced.get(run.head_sha) ?? [];
      if (specs.length === 0) continue;
      const previous = all[all.indexOf(run) - 1];
      // The candidates: every first-parent landing since the previous completed run. A range git
      // cannot read even after fetching both ends leaves the candidates unknown, so a null plan
      // joins them and nothing short of `selected` can come of it.
      let culprits = [run.head_sha];
      let rangeRead = !previous;
      if (previous) {
        const range = () => git('rev-list', '--first-parent', `${previous.head_sha}..${run.head_sha}`).split('\n').filter(Boolean);
        try { culprits = range(); rangeRead = true; } catch {
          try { git('fetch', '--quiet', 'origin', previous.head_sha, run.head_sha); culprits = range(); rangeRead = true; } catch { /* unread: below */ }
        }
      }
      // A red run on the commit the previous green run already had (a re-run on main) has an empty
      // range; its candidate is that commit itself.
      if (culprits.length === 0) culprits = [run.head_sha];
      const candidatePlans = [...culprits.map(planOf), ...(rangeRead ? [] : [null])];
      for (const spec of specs) rows.push({ ...classifyAgainst(spec, candidatePlans, { kind, flaky }), runId: run.id, workflow, culprits });
    }
  }
  const status = auditStatus({ rows, incidents, reset, today });
  const text = summarize({ rows, status, reset, incidents });
  if (args.includes('--json')) console.log(JSON.stringify({ days, status, reset, rows, calls: gh.used() }, null, 1));
  else console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  for (const m of args.includes('--json') ? [] : rows.filter((x) => x.verdict === 'miss' || x.verdict === 'unknown')) {
    console.log(`::warning title=Selection ${m.verdict}::${m.spec} failed on main (run ${m.runId}) and its culprits' original plans did not select it${m.verdict === 'unknown' ? ' (a plan was unreadable)' : ''}.`);
  }
}
