#!/usr/bin/env node
// gate: workflow ci.yml
// guards: scripts/e2e-durations.json, e2e/**, docs/work-specs/**/spec.md
// THE CAPACITY LINE - how much of the full E2E run's envelope the suite uses, and whether THIS
// change may add to it (docs/work-specs/e2e-suite-budget/spec.md, decisions 1-3).
//
//   node scripts/e2e-capacity.mjs                               # usage today, from the table
//   node scripts/e2e-capacity.mjs --changed <base>              # ...with this change's spec files
//   node scripts/e2e-capacity.mjs --changed <base> --report <merged.json>   # ...measured from the run
//   flags: --github-output (write capacity=ok|warn|refuse and capacity_reason), --summary <file>
//          (append a markdown summary), --today YYYY-MM-DD (exception expiry, tests)
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
// runners against a budget of 13, and that gap IS the overrun the line reports. A shard count
// that creeps up must not quietly raise the budget, so the two constants are separate on purpose.
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
    const m = /^-\s+`?(e2e\/[^\s:`]+\.spec\.ts)`?:\s*([\d.]+)\s*min,\s*(.+?),\s*expires\s+(\d{4}-\d{2}-\d{2})\s*$/.exec(line.trim());
    if (m) out.push({ spec: m[1], minutes: Number(m[2]), protects: m[3].trim(), expires: m[4] });
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
export function assess({ table = readTable(), suite = specFilesOnDisk(), changed = [], measured = null, exceptions = [], today = new Date().toISOString().slice(0, 10) } = {}) {
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
  if (share >= HARD_SHARE && added > 0 && uncovered.length > 0) {
    status = 'refuse';
    reason = `${reason}; this change adds ${added.toFixed(1)} minute(s) above the ${Math.round(100 * HARD_SHARE)}% line without a budget exception for ${uncovered.map((d) => d.spec).join(', ')}`;
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
  const result = assess({ table, suite, changed, measured: fromReport, exceptions: readExceptions(), today });
  const runnerMinutes = value('--runner-minutes') !== undefined ? Number(value('--runner-minutes')) : null;
  const wallMinutes = value('--wall-minutes') !== undefined ? Number(value('--wall-minutes')) : null;
  const text = summarize(result, { runnerMinutes, wallMinutes, label: fromReport ? 'measured' : 'estimate' });
  console.log(text);
  const summary = value('--summary');
  if (summary) appendFileSync(summary, `${text}\n`);
  if (args.includes('--github-output') && process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `capacity=${result.status}\ncapacity_reason=${result.reason.replace(/\r?\n/g, ' ')}\n`);
  }
  if (result.status === 'refuse') console.log(`::error title=E2E capacity::${result.reason}`);
  else if (result.status === 'warn') console.log(`::warning title=E2E capacity::${result.reason}`);
}
