#!/usr/bin/env node
// gate: workflow ci.yml
// guards: scripts/e2e-durations.json, scripts/growth-ceilings.json, e2e/**, docs/work-specs/**/spec.md, .github/workflows/**
// THE CAPACITY LINE - how much of the full E2E run's envelope the suite uses, and whether THIS
// change may add to it (docs/work-specs/e2e-suite-budget/spec.md, decisions 1-3).
//
//   node scripts/e2e-capacity.mjs                               # usage today, from the table
//   node scripts/e2e-capacity.mjs --changed <base>              # ...with this change's spec files
//   node scripts/e2e-capacity.mjs --changed <base> --report <merged.json>   # ...measured from the run
//   flags: --github-output (write capacity=ok|warn|refuse and capacity_reason), --summary <file>
//          (append a markdown summary), --today YYYY-MM-DD (exception expiry, tests),
//          --growth <growth-report.json> (the latest weekly growth report; the D7 tiers below)
//
// THE GROWTH TIERS (docs/work-specs/cicd-improvement/spec.md D7, scripts/growth-controls.mjs).
// Beside the table line, the same verdict judges what the change adds to each of the four frozen
// tiers (offline, backend, graphics, fixed overhead), each alone, against the latest weekly
// report's measurement; whether the durations table is past its 8-day bound (then added minutes
// are refused from the 85% line); and whether the change edits the frozen ceilings or removes
// or renews an exception without a measured repayment. There is no aggregate gate.
//
// WHY A LINE AND NOT A COUNT. The offline suite grew from 115 to 169 measured minutes in the three
// weeks to 2026-10-11, almost all of it new spec files, and the full run on main lost a shard at
// the 20-minute cap on 70 of 153 runs in one week and 49 of 121 the next. Nothing said "this is
// nearly full" before a shard said it by dying. The number the packer already lives by -
// table-minutes of the suite on disk against runners x budgetMinutes - is the one to watch, and
// this script watches it on every pull request and merge group.
//
// THE ENVELOPE IS FIXED, NOT DERIVED FROM THE SHARD COUNT. `MAX_SHARDS` in e2e-affected.mjs may
// follow the table so a full run fits its cap; MAIN_RUNNERS here is the BUDGET LINE - the share
// of the account's twenty concurrent runners a full run is budgeted, in runners' worth of
// table-minutes - and raising it is a reviewed decision that cites the measured peak concurrency
// (evidence/cost-and-growth.md: the account sat at exactly twenty running jobs for 17% of all busy
// time). It is not the count a full run holds: since 2026-10-17 a full run holds MAX_SHARDS (15)
// runners against a budget of 13, because the packer places whole files and keeps a margin for
// the slowest runner, which this fluid-fill line does not see; the line itself reads 98%. A shard
// count that creeps up must not quietly raise the budget, so the two constants are separate on
// purpose.
//
// WHAT IT REFUSES, AND WHAT IT CANNOT. Above HARD_SHARE a change that ADDS measured spec-minutes
// needs an exception line in a work spec (format below), with the spec file, the minutes, what it
// protects and an expiry at most 30 days out. Below WARN_SHARE it says nothing; between the two
// it warns. A change that adds no spec minutes is never refused, whoever made it, so there is no
// bot exemption to grant or abuse. What it cannot see is a spec made slower without being edited
// (shared code): that drift arrives in the weekly refresh pull request (e2e-durations.mjs), which
// prints the same usage line; and a shard that uploaded no report leaves its specs unmeasured,
// which counts them at the suite's p90 rather than the median so a partial report cannot flatter a
// change.
//
// Exceptions live in the pull request's own work spec, under a `## Budget exceptions` heading:
//
//   - e2e/editor-foo.spec.ts: 3.4 min, protects the saved graphic reopening as it was, expires 2026-11-10
//
// An automatic repair never writes one (root/auto-fix rule); a reviewer reads it like any claim.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { planMinutes } from './e2e-affected.mjs';
import { budgetMinutes, minutesByFile, readTable, specFilesOnDisk } from './e2e-durations.mjs';
import { TIERS, assessTiers, exceptionStatus, ledgerChanges, priceAdditions, reportCadence, summarizeTiers, tableFreshness } from './growth-controls.mjs';
import { measured } from './measured.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Runners one full main run may hold; see the header before changing it.
 *
 * 11 -> 13 on 2026-10-17, with MAX_SHARDS, because the 11 was sized on a table that read 10%
 * light: recorded from one run, it priced specs measured on fast runners as if every runner were
 * fast (scripts/e2e-durations.mjs header). At the slow-runner percentile the suite is 183.3
 * table-minutes, 101% of eleven runners - it had not fitted for days, which 32 of the 55 full
 * main runs from 2026-10-15 04:00 to 2026-10-17 04:00 showed by losing a shard at the cap. Against the twenty-job ceiling: the
 * full run's shards hold about the same slot-minutes as before (the same tests split thinner, plus
 * ~0.5 per added shard), two more slots for two to three fewer minutes. A main run's own peak was
 * 11, 13 and 14 concurrent jobs on runs 38986504813, 38990305985 and 38997059058 (the shards
 * start after build, factory and the Vercel wait have mostly finished), so 13-16 from now on.
 * This restores the fit; it is not the long-term answer the suite budget spec asks for
 * (docs/work-specs/e2e-suite-budget/spec.md), which is holding and then cutting the minutes.
 *
 * HELD AT 13 when MAX_SHARDS went to 15, later on 2026-10-17 (#1405). The suite is 209.9
 * table-minutes once the save-transaction matrix is measured (26.7 minutes the table had never
 * seen: scripts/e2e-affected.mjs MAX_SHARDS), which is 98% of thirteen runners. That reading is
 * true - the suite grew by a shard and a half in two editor repairs - and the budget spec's
 * decision 1 is that the shard count may follow the table and the envelope does not. So every
 * pull request is warned, one that adds measured minutes needs an exception, and the minutes
 * are cut or the envelope is raised by a decision that cites the twenty-job ceiling, not here.
 */
export const MAIN_RUNNERS = 13;
/** Usage above which every pull request is warned. */
export const WARN_SHARE = 0.85;
/** Usage above which added spec-minutes need a recorded, expiring exception. */
export const HARD_SHARE = 0.95;
/** The longest an exception may run; a longer need is a decision, not an exception. */
export const EXCEPTION_MAX_DAYS = 30;

/** Table-minutes one full run may carry: the envelope. */
export function capacityMinutes(table = readTable()) {
  return MAIN_RUNNERS * budgetMinutes(table);
}

const sorted = (values) => [...values].sort((a, b) => a - b);
const percentile = (values, p) => (values.length ? sorted(values)[Math.min(values.length - 1, Math.floor(p * values.length))] : 0);

/**
 * Parse the `## Budget exceptions` section of one work spec's markdown.
 * @returns {{ spec: string, minutes: number, protects: string, expires: string }[]}
 */
export function parseExceptions(markdown) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+Budget exceptions\s*$/i.test(l));
  if (start < 0) return [];
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    const m = /^-\s+`?(e2e\/[^\s:`]+\.spec\.ts)`?:\s*([\d.]+)\s*min,\s*(.+?)(?:,\s*repaid\s+([\d.]+)\s*min\s+in\s+run\s+(\d+))?,\s*expires\s+(\d{4}-\d{2}-\d{2})\s*$/.exec(line.trim());
    if (m) out.push({ spec: m[1], minutes: Number(m[2]), protects: m[3].trim(), expires: m[6], ...(m[4] ? { repaid: { minutes: Number(m[4]), run: m[5] } } : {}) });
  }
  return out;
}

/** Every exception in every work spec on disk. */
export function readExceptions(root = ROOT) {
  const dir = path.join(root, 'docs', 'work-specs');
  if (!existsSync(dir)) return [];
  const out = [];
  for (const folder of readdirSync(dir, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    const file = path.join(dir, folder.name, 'spec.md');
    if (!existsSync(file)) continue;
    for (const e of parseExceptions(readFileSync(file, 'utf8'))) out.push({ ...e, from: `docs/work-specs/${folder.name}/spec.md` });
  }
  return out;
}

/**
 * What a change does to the offline exception lines, against its base. The lines stay on record
 * after they expire (append-only), and a new line for a spec the base already excepted - in any
 * work spec, under any wording - renews that scope, which needs a measured repayment clause:
 * `, repaid <minutes> min in run <run id>` before `expires`.
 */
export function offlineExceptionChanges(base, head) {
  const key = (e) => `${e.from}|${e.spec}|${e.minutes}|${e.expires}`;
  const name = (e) => e.spec.split('/').pop();
  const baseKeys = new Set(base.map(key));
  const headKeys = new Set(head.map(key));
  const problems = [];
  for (const e of base) if (!headKeys.has(key(e))) problems.push(`the budget exception for ${e.spec} in ${e.from} (expires ${e.expires}) was removed or moved: exception lines stay on record after they expire`);
  for (const e of head) {
    if (baseKeys.has(key(e))) continue;
    if (base.some((b) => name(b) === name(e)) && !(e.repaid?.minutes > 0)) problems.push(`the new budget exception for ${e.spec} renews an earlier one for the same spec without a measured repayment (\`, repaid <minutes> min in run <id>\`)`);
  }
  return problems;
}

/** An exception covers a spec today if it names it, has not expired, and does not run too long. */
export function exceptionFor(exceptions, spec, today) {
  const name = spec.split('/').pop();
  const t = Date.parse(`${today}T00:00:00Z`);
  return exceptions.find((e) => {
    if (e.spec.split('/').pop() !== name) return false;
    const exp = Date.parse(`${e.expires}T00:00:00Z`);
    return Number.isFinite(exp) && exp >= t && exp - t <= EXCEPTION_MAX_DAYS * 86_400_000;
  });
}

/**
 * The assessment. Pure.
 *
 * `changed` are the spec files (basenames) this change adds or edits; `measured` is a basename ->
 * minutes map from the run's own report, when there is one. A changed spec with no table entry
 * and no measurement counts at the median before a run and at the p90 once a report exists but
 * omits it (the shard that carried it died).
 */
export function assess({ table = readTable(), suite = specFilesOnDisk(), changed = [], measured = null, exceptions = [], today = new Date().toISOString().slice(0, 10), tableStale = false } = {}) {
  const minutes = { ...table.minutes };
  const values = Object.values(table.minutes);
  const median = percentile(values, 0.5);
  const p90 = percentile(values, 0.9);
  const capacity = capacityMinutes(table);
  const changedSet = new Set(changed.map((f) => f.split('/').pop()));
  // Before = the suite as the table knows it: a changed spec the table has measured counts at
  // its table value, a spec this change adds is not there yet.
  const before = planMinutes({ mode: 'full', specs: [] }, table, suite.filter((f) => !(changedSet.has(f) && table.minutes[f] === undefined)));
  const details = [];
  for (const name of changedSet) {
    if (!suite.includes(name)) continue; // deleted by this change
    const was = table.minutes[name];
    let now;
    let how;
    if (measured && measured[name] !== undefined) { now = measured[name]; how = 'measured in this run'; }
    else if (measured) { now = Math.max(was ?? 0, p90); how = 'not in this run\'s report - counted at the suite p90'; }
    else if (was !== undefined) { now = was; how = 'table'; }
    else { now = median; how = 'unmeasured - estimated at the median until the run reports'; }
    minutes[name] = now;
    details.push({ spec: name, was: was ?? null, now, delta: now - (was ?? 0), how, exception: exceptionFor(exceptions, name, today) ?? null });
  }
  const after = planMinutes({ mode: 'full', specs: [] }, { ...table, minutes }, suite);
  const added = details.reduce((a, d) => a + Math.max(0, d.delta), 0);
  const share = after / capacity;
  const uncovered = details.filter((d) => d.delta > 0 && !d.exception);
  let status = 'ok';
  let reason = `${after.toFixed(1)} of ${capacity.toFixed(1)} table-minutes (${(100 * share).toFixed(0)}%) on ${MAIN_RUNNERS} runners`;
  // A stale table cannot establish the last ten points of headroom (growth-controls.mjs rule 3),
  // so while it is past its freshness bound added minutes are refused from the warning line.
  const line = tableStale ? WARN_SHARE : HARD_SHARE;
  if (share >= line && added > 0 && uncovered.length > 0) {
    status = 'refuse';
    reason = `${reason}; this change adds ${added.toFixed(1)} minute(s) above the ${Math.round(100 * line)}% line${tableStale ? ' a stale durations table sets' : ''} without a budget exception for ${uncovered.map((d) => d.spec).join(', ')}`;
  } else if (share >= WARN_SHARE) {
    status = 'warn';
    reason = `${reason}; above the ${Math.round(100 * WARN_SHARE)}% line${added > 0 ? `, this change adds ${added.toFixed(1)} minute(s)` : ''}`;
  }
  return { capacity, before, after, share, added, status, reason, details, median, p90 };
}

/** Markdown for the step summary: the three costs kept apart. */
export function summarize(result, { runnerMinutes = null, wallMinutes = null, label = 'estimate' } = {}) {
  const rows = result.details.map((d) => `| \`${d.spec}\` | ${d.was === null ? '-' : d.was.toFixed(2)} | ${d.now.toFixed(2)} | ${d.delta >= 0 ? '+' : ''}${d.delta.toFixed(2)} | ${d.how}${d.exception ? ` (exception until ${d.exception.expires})` : ''} |`);
  return [
    `### E2E capacity (${label}): ${result.status.toUpperCase()}`,
    '',
    `- Execution: ${result.after.toFixed(1)} of ${result.capacity.toFixed(1)} table-minutes, ${(100 * result.share).toFixed(1)}% of ${MAIN_RUNNERS} runners x budget (warn ${Math.round(100 * WARN_SHARE)}%, exception needed ${Math.round(100 * HARD_SHARE)}%).`,
    `- Runner minutes of this run: ${runnerMinutes === null ? 'not read here' : runnerMinutes.toFixed(1)}.`,
    `- Wall clock of this run so far: ${wallMinutes === null ? 'not read here' : `${wallMinutes.toFixed(1)} min`} (queue entry to landed is the weekly figure in docs/work-specs/e2e-suite-budget/).`,
    ...(rows.length ? ['', '| Changed spec | Table | Now | Delta | How |', '|---|---|---|---|---|', ...rows] : ['', 'No spec file added or edited by this change.']),
    '',
  ].join('\n');
}

/** Spec files this change added or modified (not deleted), repo-relative, from a diff against `base`. */
export function changedSpecs(base, cwd = ROOT) {
  const out = execFileSync('git', ['diff', '--name-status', `${base}...HEAD`], { cwd, encoding: 'utf8', windowsHide: true });
  const specs = [];
  for (const line of out.split('\n')) {
    const [status, ...rest] = line.trim().split(/\s+/);
    if (!status) continue;
    const file = rest.at(-1); // a rename lists old then new
    if (/^[AMR]/.test(status) && /^e2e\/[^/]+\.spec\.ts$/.test(file)) specs.push(file);
  }
  return specs;
}

const gitShow = (rev, file, cwd = ROOT) => { try { return execFileSync('git', ['show', `${rev}:${file}`], { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
const runnersIn = (text) => Number(/export const MAIN_RUNNERS = (\d+);/.exec(text ?? '')?.[1] ?? NaN);

/**
 * The D7 half of this line, with its I/O: the latest weekly growth report (or the frozen seed
 * when there is none), the files this change adds, the workflows it touches, and the ceilings
 * and exception records before and after. Never throws: what it cannot read is missing evidence.
 */
export function growthAssessment({ base, reportPath, table, today, root = ROOT }) {
  const ceilings = JSON.parse(readFileSync(path.join(root, 'scripts', 'growth-ceilings.json'), 'utf8'));
  const reasons = [];
  // Asked for a report and none could be read (the fetch failed): the tiers have no evidence and
  // no stops can be known, so additive growth is refused. A fetch that found no report at all
  // writes `{ none: true }`, and the frozen seed stands in until the first weekly run.
  let report = null;
  let unreadable = false;
  if (reportPath) { try { report = JSON.parse(readFileSync(reportPath, 'utf8')); } catch { unreadable = true; } }
  if (report?.none) report = null;
  const measurement = unreadable ? null : report?.measurement ?? ceilings.measurement;
  if (unreadable) reasons.push('the newest weekly growth report could not be read, so no tier can establish headroom');
  const cadence = reportCadence({ generatedAt: report?.generatedAt ?? null, today, maxAgeDays: ceilings.reportMaxAgeDays });
  const fresh = tableFreshness({ recordedAt: table.source?.recordedAt, today, boundDays: ceilings.freshnessDays, pending: report?.table?.pending ?? [] });
  const added = [];
  const workflows = {};
  let ledger = [];
  let offline = [];
  let diffFailed = false;
  if (base) {
    let diff = '';
    // An unreadable diff is unknown added cost, never zero: refused, and said so.
    try { diff = execFileSync('git', ['diff', '--name-status', `${base}...HEAD`], { cwd: root, encoding: 'utf8', windowsHide: true }); } catch { diffFailed = true; reasons.push(`cannot diff ${base}: what this change adds is unknown, so it is refused`); }
    for (const line of diff.split('\n')) {
      const [status, ...rest] = line.trim().split(/\s+/);
      const file = rest.at(-1);
      if (!status || !file) continue;
      // A rename adds nothing unless it moves a case into a priced kind (an offline spec moved
      // into e2e/configured/ is a new backend case).
      const kind = (f) => (/^e2e\/configured\//.test(f) ? 'backend' : /^e2e\/catalog\//.test(f) ? 'graphics' : 'other');
      if (/^A/.test(status) || (/^R/.test(status) && kind(rest[0]) !== kind(file))) added.push(file);
      if (/^[AMR]/.test(status) && /^\.github\/workflows\/[^/]+\.ya?ml$/.test(file)) workflows[file.split('/').pop()] = { base: gitShow(base, file, root) ?? '', head: readFileSync(path.join(root, file), 'utf8') };
    }
    const baseCeilings = gitShow(base, 'scripts/growth-ceilings.json', root);
    if (baseCeilings) {
      const before = JSON.parse(baseCeilings);
      ledger = ledgerChanges({ base: before, head: ceilings, mainRunners: { base: runnersIn(gitShow(base, 'scripts/e2e-capacity.mjs', root)), head: MAIN_RUNNERS } });
      const wasInvalid = new Set(exceptionStatus(before.exceptions, today, before.exceptionMaxDays).invalid.map((e) => e.id));
      for (const e of exceptionStatus(ceilings.exceptions, today, ceilings.exceptionMaxDays).invalid) if (!wasInvalid.has(e.id)) ledger.push(`exception ${e.id} is invalid: ${e.problems.join('; ')}`);
    }
    const baseSpecs = (gitShow(base, 'docs/work-specs', root) ?? '').split('\n').filter((n) => n.endsWith('/'));
    const baseExceptions = baseSpecs.flatMap((dir) => parseExceptions(gitShow(base, `docs/work-specs/${dir}spec.md`, root) ?? '').map((e) => ({ ...e, from: `docs/work-specs/${dir}spec.md` })));
    offline = offlineExceptionChanges(baseExceptions, readExceptions(root));
  }
  const items = priceAdditions({ added, workflows, estimates: ceilings.estimates });
  const tiers = assessTiers({ ceilings, measurement, items, today, stops: report?.stops ?? {} });
  let status = tiers.status;
  for (const t of TIERS) if (tiers.tiers[t].status !== 'ok' && tiers.tiers[t].items.length) reasons.push(`${t} tier ${tiers.tiers[t].status}: ${tiers.tiers[t].why}`);
  if (ledger.length || offline.length || diffFailed) { status = 'refuse'; reasons.push(...ledger, ...offline); }
  if (cadence.overdue) { reasons.push(`${cadence.reason} - an owned failure (${ceilings.owner}); tier evidence is the frozen seed until it runs`); if (status === 'ok') status = 'warn'; }
  if (fresh.stale) { reasons.push(fresh.reason); if (status === 'ok') status = 'warn'; }
  const markdown = [
    ...summarizeTiers(tiers),
    `- ${fresh.reason}.`,
    `- ${cadence.reason}${report ? ` (week to ${report.measurement?.windowEnd})` : unreadable ? '; the newest report could not be read: no tier evidence' : `; tiers judged on the frozen seed measured to ${ceilings.measurement.windowEnd}`}.`,
    ...ledger.map((p) => `- Ceilings file: ${p}.`),
    ...offline.map((p) => `- Budget exceptions: ${p}.`),
    '',
  ].join('\n');
  return { status, reasons, markdown, table: fresh, tiers, items };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const base = value('--changed');
  const reportPath = value('--report');
  const today = value('--today') ?? new Date().toISOString().slice(0, 10);
  let changed = [];
  if (base && !/^0{40}$/.test(base)) {
    try { changed = changedSpecs(base); } catch (e) { console.error(`e2e-capacity: cannot diff ${base} (${String(e?.message ?? e).split('\n')[0]}) - assessing the table alone.`); }
  }
  let fromReport = null;
  if (reportPath) fromReport = minutesByFile(JSON.parse(readFileSync(reportPath, 'utf8')));
  const table = readTable();
  const suite = specFilesOnDisk();
  // The set this gate measures: the spec files on disk and the table entries weighing them. An
  // empty suite or an empty table is a moved directory or a lost file, never a 0% usage.
  measured(suite.length, 'e2e spec files on disk');
  measured(Object.keys(table.minutes).length, 'measured spec durations');
  // THE GROWTH TIERS (D7, scripts/growth-controls.mjs): the table's age, what this change adds to
  // each tier, and what it does to the frozen ceilings and the exception records.
  const growth = growthAssessment({ base: base && !/^0{40}$/.test(base) ? base : null, reportPath: value('--growth'), table, today });
  const result = assess({ table, suite, changed, measured: fromReport, exceptions: readExceptions(), today, tableStale: growth.table.stale });
  const runnerMinutes = value('--runner-minutes') !== undefined ? Number(value('--runner-minutes')) : null;
  const wallMinutes = value('--wall-minutes') !== undefined ? Number(value('--wall-minutes')) : null;
  const order = { ok: 0, warn: 1, refuse: 2 };
  if (order[growth.status] > order[result.status]) result.status = growth.status;
  if (growth.status !== 'ok' && growth.reasons.length) result.reason = `${result.reason}; ${growth.reasons.join('; ')}`;
  const text = `${summarize(result, { runnerMinutes, wallMinutes, label: fromReport ? 'measured' : 'estimate' })}${growth.markdown}`;
  console.log(text);
  const summary = value('--summary');
  if (summary) appendFileSync(summary, `${text}\n`);
  if (args.includes('--github-output') && process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `capacity=${result.status}\ncapacity_reason=${result.reason.replace(/\r?\n/g, ' ')}\n`);
  }
  if (result.status === 'refuse') console.log(`::error title=E2E capacity::${result.reason}`);
  else if (result.status === 'warn') console.log(`::warning title=E2E capacity::${result.reason}`);
}
