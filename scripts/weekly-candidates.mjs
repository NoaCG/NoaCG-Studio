#!/usr/bin/env node
// THE WEEKLY REVIEW'S CANDIDATE ROWS - did any of them reach a wave, and if not, does anything say so?
//
//   node scripts/weekly-candidates.mjs           # the rows, and how the newest wave plan classified each
//   node scripts/weekly-candidates.mjs --json
//   node scripts/weekly-candidates.mjs --plan <path>
//
// WHY. The weekly owner review (`.agent-workflows/orchestrator-week.md`) ends by writing at most
// three candidate rows - GOAL, WHY, TOUCHES, POOL - so the next `/orchestrator` can lift one
// straight into a wave. On 2026-09-08 it wrote three good ones and both of that day's wave plans
// were written afterwards without lifting any of them or mentioning the file at all. Nothing
// recorded the miss. The obligation was in prose in two contracts
// (`.agent-workflows/orchestrator/grounding.md`, `docs/ROUTINES.md`) and in nothing that counts,
// which is this repository's named shape for a rule whose only enforcement is somebody remembering.
//
// So a plan owes each candidate row ONE LINE: planned as a row, deferred with a reason, or
// rejected with a reason. Any of the three passes. SILENCE FAILS. The point is not that a row gets
// planned - the owner's standing ruling is that nothing in his queue expires and nothing is forced
// into a wave - it is that a skipped row is skipped on purpose and says so.
//
// THE ID, and why the weekly file does not have to carry one. A candidate row is identified by the
// week it was proposed in and its position in the file: `WEEK-<the file's date>-<n>`, counted over
// the file's GOAL lines in order. That means the rule works on weekly files written before this
// check existed - including the 2026-09-08 one that started it - and it means the weekly workflow
// has no new syntax to remember. The file is overwritten per date and read newest-first, so the
// numbering is stable for as long as anything consults it.
//
// THE SECTION A PLAN WRITES, the same shape as `## Handoffs` (scripts/handoff-drain.mjs):
//
//   ## Weekly review
//
//   - planned: WEEK-2026-09-08-1 -> row F
//   - deferred: WEEK-2026-09-08-2 - the walk rewrite needs the route grouping first
//   - rejected: WEEK-2026-09-08-3 - landed on 2026-09-09 as claude/x-capability-reprobe
//
// A `planned` line names the wave-table row that carries it; a `deferred` or `rejected` line
// carries a reason a person can argue with. Read-only: this edits nothing and refuses nothing on
// its own - `wave-plan-check.mjs` is where the refusal happens.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { newestWeeklyFile, weeklyDir } from './alignment-answers.mjs';
import { newestWavePlan } from './handoff-drain.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long a weekly review's rows stay owed. One week, because that is the cadence: the next
 * review replaces them, and a plan seven days later is planning against a page nobody has read
 * since. This is a WINDOW, never an expiry - a row nobody lifted is still in the file, and the
 * weekly review reads the file it wrote.
 */
export const WINDOW_DAYS = 7;

/** What a plan may say about a candidate row. All three pass; only silence fails. */
export const CLASSES = Object.freeze(['planned', 'deferred', 'rejected']);

// A candidate row's GOAL line, in every shape the workflow and the files it produced use:
// `- **GOAL** - ...`, `**GOAL:** ...`, `GOAL - ...`. The bold markers and the leading bullet are
// optional because the weekly file is written by a session in markdown, not by a serializer.
const GOAL_LINE = /^\s*(?:[-*]\s*)?\*{0,2}GOAL\*{0,2}\s*[-:]\s*(.+?)\s*$/;

// The title a session puts above a row - `**Row: the wave plan outlives its worktree**`. Optional:
// when it is absent the GOAL text is the title, so a row is never invisible for want of a heading.
const ROW_TITLE = /^\s*(?:[-*]\s*)?\*{0,2}Row\s*[-:]\s*(.+?)\*{0,2}\s*$/i;

const WEEKLY_DATE = /^(\d{4}-\d{2}-\d{2})-orchestrator-week\.local\.md$/;

/** `WEEK-2026-09-08-2` - the week it was proposed in, and which row of that week. */
export function candidateId(date, n) {
  return `WEEK-${date}-${n}`;
}

/**
 * The candidate rows in one weekly file, in the order they appear.
 *
 * EVERY GOAL LINE IN THE FILE COUNTS, not only those under an "Improve" heading. Anchoring on the
 * heading would be more precise and would fail SILENTLY the first time a session numbered or
 * renamed the section - and a silent miss is the exact defect this file exists to end. Counting
 * one GOAL line too many costs a plan one extra sentence; counting one too few costs a row.
 *
 * Pure, so the parsing is testable without a checkout: pass the text and the file's date.
 */
/** Markdown emphasis around a captured phrase, which `**GOAL:** text` leaves on the front. */
const unbold = (text) => text.replace(/^\*+\s*/, '').replace(/\s*\*+$/, '').trim();

export function parseCandidateRows(text, date) {
  const rows = [];
  let title = null;
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const match = line.match(GOAL_LINE);
    if (match) {
      const goal = unbold(match[1]);
      rows.push({ id: candidateId(date, rows.length + 1), n: rows.length + 1, title: title ?? goal, goal });
      title = null;
      continue;
    }
    // Only a line that is nothing but a title claims one, so a sentence mentioning a row does not
    // rename the next candidate.
    const heading = line.match(ROW_TITLE);
    if (heading) title = unbold(heading[1]);
  }
  return rows;
}

/**
 * The `## Weekly review` section of a wave plan as `Map<id, { cls, trace }>`. Everything after
 * the id is the trace: the row a `planned` line names, or the reason a `deferred` or `rejected`
 * line gives.
 */
export function parseCandidateSection(planText) {
  const classified = new Map();
  let inside = false;
  for (const line of String(planText ?? '').replace(/\r\n/g, '\n').split('\n')) {
    if (/^#{1,6}\s+/.test(line)) {
      // "Weekly review", and deliberately NOT "weekly candidates": the night refill loop opens its
      // own table at the first heading containing "candidates" (scripts/candidates.mjs), so a
      // section named that way would swallow the loop's list and leave it with nothing to launch.
      inside = /^#{1,6}\s+weekly review\b/i.test(line);
      continue;
    }
    if (!inside) continue;
    const match = line.match(/^\s*[-*]\s*(planned|deferred|rejected)\s*:\s*(?:`)?(WEEK-\d{4}-\d{2}-\d{2}-\d+)(?:`)?\s*(.*)$/i);
    if (!match) continue;
    classified.set(match[2].toUpperCase(), { cls: match[1].toLowerCase(), trace: match[3].replace(/^[-:>\s]+/, '').trim() });
  }
  return classified;
}

/** The date in `<date>-<day|night>-wave-plan.local.md`, or null when the name carries none. */
export function planDate(planPath) {
  return /^(\d{4}-\d{2}-\d{2})/.exec(path.basename(String(planPath ?? '')))?.[1] ?? null;
}

/**
 * What the checkout knows: which weekly file is newest, where it was read from, and which of its
 * candidate rows a plan of `date` owes a line.
 *
 * `owed` is empty - and the reason is on the record - when there is no weekly file, when the plan
 * predates it, or when the review is older than the window. The RECORD is the point: this returns
 * the directory it searched whatever it found, because "nothing is owed" and "I read the wrong
 * folder" were indistinguishable for a week (docs/backlog, 2026-09-09).
 */
export function weeklyCandidates(root = REPO_ROOT, date = null) {
  const dir = weeklyDir(root);
  const file = newestWeeklyFile(root);
  const state = { dir, source: null, date: null, ageDays: null, owed: [], rows: [], reason: '' };
  if (!file) {
    state.reason = `no <date>-orchestrator-week.local.md in ${dir}`;
    return state;
  }
  state.source = path.basename(file);
  state.date = WEEKLY_DATE.exec(state.source)?.[1] ?? null;
  state.rows = state.date ? parseCandidateRows(readFileSync(file, 'utf8'), state.date) : [];
  if (!state.date) {
    state.reason = `${state.source} carries no date, so its rows cannot be identified`;
    return state;
  }
  if (state.rows.length === 0) {
    state.reason = `${state.source} proposes no candidate rows`;
    return state;
  }
  if (!date) {
    state.owed = state.rows;
    return state;
  }
  state.ageDays = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${state.date}T00:00:00Z`)) / DAY_MS);
  if (state.ageDays < 0) state.reason = `${state.source} was written after this plan`;
  else if (state.ageDays > WINDOW_DAYS) state.reason = `${state.source} is ${state.ageDays} days older than this plan, past the ${WINDOW_DAYS}-day window`;
  else state.owed = state.rows;
  return state;
}

/**
 * The problems in one plan's treatment of the rows it owes a line. `letters` is the set of row
 * letters the plan's wave table actually has, so `planned: ... -> row F` cannot name a row that
 * does not exist.
 */
export function candidateProblems(owed, classified, letters = null) {
  const problems = [];
  for (const row of owed) {
    const entry = classified.get(row.id);
    const what = `${row.id} ("${row.title}")`;
    if (!entry) {
      problems.push(`weekly candidate ${what} is not classified under "## Weekly review" (planned | deferred | rejected) - lift it into a row, or say in writing why not`);
      continue;
    }
    if (entry.cls === 'planned') {
      // The letter is read case-insensitively and compared upper: a plan that wrote "row f" named
      // its row, and refusing over the case would teach nothing.
      const letter = /\brow\s+([A-Za-z]{1,2})\b/.exec(entry.trace)?.[1]?.toUpperCase() ?? null;
      if (!letter) problems.push(`weekly candidate ${what} is planned but names no row - write "planned: ${row.id} -> row <L>"`);
      else if (letters && !letters.has(letter)) problems.push(`weekly candidate ${what} is planned as row ${letter}, and the wave table has no row ${letter}`);
      continue;
    }
    if (entry.trace === '') {
      problems.push(`weekly candidate ${what} is ${entry.cls} with no reason - a skipped row is skipped on purpose and says why`);
    }
  }
  return problems;
}

/** One line for the plan check to print whatever it found, because a silent read is the defect. */
export function summaryLine(state) {
  if (state.owed.length === 0) return `weekly recap: nothing owed - ${state.reason || 'no candidate rows in the window'} (searched ${state.dir})`;
  return `weekly recap: ${state.source} proposes ${state.owed.length} candidate row(s), each owed a line under "## Weekly review" (searched ${state.dir})`;
}

function report(state, classified, planPath) {
  const lines = [summaryLine(state)];
  if (state.rows.length === 0) return lines;
  lines.push('', planPath ? `Against ${path.basename(planPath)}:` : 'No fresh wave plan found - every row reads as unclassified:');
  for (const row of state.rows) {
    const entry = classified.get(row.id);
    const cls = (entry?.cls ?? 'UNCLASSIFIED').padEnd(13);
    lines.push(`  ${cls} ${row.id}  ${row.title}`);
    if (entry?.trace) lines.push(`${' '.repeat(16)}${entry.trace}`);
  }
  const problems = candidateProblems(state.owed, classified, null);
  lines.push('', problems.length === 0
    ? '  Every candidate row in the window is accounted for.'
    : `  ${problems.length} row(s) the plan still owes a line:`);
  for (const problem of problems) lines.push(`    - ${problem}`);
  return lines;
}

export function main(argv = process.argv.slice(2), { root = REPO_ROOT, now = Date.now() } = {}) {
  const planFlag = argv.indexOf('--plan');
  const plan = planFlag >= 0 ? path.resolve(root, argv[planFlag + 1] ?? '') : newestWavePlan(root, now);
  const usable = plan && existsSync(plan) ? plan : null;
  const state = weeklyCandidates(root, planDate(usable) ?? new Date(now).toISOString().slice(0, 10));
  const classified = usable ? parseCandidateSection(readFileSync(usable, 'utf8')) : new Map();
  if (argv.includes('--json')) console.log(JSON.stringify({ plan: usable, ...state, classified: [...classified] }, null, 2));
  else for (const line of report(state, classified, usable)) console.log(line);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
