#!/usr/bin/env node
// THE ALIGNMENT ANSWERS LEDGER - what the owner answered on Tuesday, and whether anybody wrote it down.
//
//   node scripts/alignment-answers.mjs            # what is open, and what is answered but unrecorded
//   node scripts/alignment-answers.mjs --check    # exit 1 while an answer is unrecorded
//   node scripts/alignment-answers.mjs --json     # the same facts, structured
//
// WHY. The weekly owner session (`.agent-workflows/orchestrator-week.md`) asks at most three
// alignment questions - the only standing gate that reaches the owner, by his 2026-09-05 ruling.
// His answers are rulings: they change what we build or in which order. But the session that asks
// them is a ROUTINE, and a routine may not write a tracked file (`docs/ROUTINES.md`), so the answer
// arrived in chat and stayed there. Whether it ever reached `docs/OWNER_RULINGS.md` depended on
// somebody remembering to lift it out, which is the exact shape this repo calls a missing mechanism
// (owner, 2026-08-29: "a rule that depends on remembering to paste is a missing mechanism").
//
// SO THE ROUTINE CAPTURES AND A SESSION WRITES, and this script is what makes the second half
// happen. The session writes each question into its own gitignored file under a stable id; when the
// owner answers, the same session fills the answer in beside it. From then on the answer is on
// disk, and `wave-plan-check.mjs` refuses a wave plan that does not mention an unrecorded one - so
// the reminder repeats every morning until a branch puts the ruling in `docs/OWNER_RULINGS.md`,
// and stops by itself the moment it is there.
//
// THE FORMAT, in `docs/handoffs/<date>-orchestrator-week.local.md`:
//
//     ### ALIGN-2026-09-15-1
//     **Question:** Does the SVG road still deserve the top of NOW, six weeks in?
//     **Answer:** Yes, until the students have used it.
//
// An `**Answer:**` with nothing after it is an OPEN question: his to answer, never anyone's to
// chase, and never a reason to refuse anything. A filled one is a RULING, and it is pending until
// `docs/OWNER_RULINGS.md` contains its id. The id is the whole join - it is what the ruling is
// written under, and what the plan check looks for.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');

/** Where the weekly session writes, and where the rulings live once a session has recorded them. */
export const HANDOFF_DIR = path.join('docs', 'handoffs');
export const RULINGS_FILE = 'docs/OWNER_RULINGS.md';

// `ALIGN-<yyyy>-<mm>-<dd>-<n>` - the date the question was asked, and its number that morning.
// The heading is read LENIENTLY: any level from `##` to `####`, and anything after the id, because
// the procedure asks each question to name its `needs: alignment` reason in its own text and a
// session that puts that on the heading line must not have its question silently dropped. A
// question the parser cannot see is a ruling nobody records, which is the failure this file exists
// to prevent - so every doubtful case parses rather than vanishes.
const HEADING = /^#{2,4}\s+(ALIGN-\d{4}-\d{2}-\d{2}-\d+)\b.*$/;
const FIELD = /^\*\*(Question|Answer):\*\*\s*(.*)$/;
const WEEKLY_FILE = /^\d{4}-\d{2}-\d{2}-orchestrator-week\.local\.md$/;

/**
 * Every alignment question in one weekly file, in the order it was asked.
 * Pure, so the parsing is testable without a checkout: pass the file's text.
 */
export function parseAlignmentQuestions(text) {
  const questions = [];
  let current = null;
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const heading = line.match(HEADING);
    if (heading) {
      current = { id: heading[1], question: '', answer: '' };
      questions.push(current);
      continue;
    }
    // Any other heading closes the block, so an answer never bleeds into the next question.
    if (current && /^#{1,6}\s/.test(line)) current = null;
    if (!current) continue;
    const field = line.match(FIELD);
    if (field) current[field[1].toLowerCase()] = field[2].trim();
  }
  return questions.map((entry) => ({ ...entry, answered: entry.answer.length > 0 }));
}

/** Every `<date>-orchestrator-week.local.md`, oldest first, so the newest is always last. */
export function weeklyFiles(root = REPO_ROOT) {
  const dir = path.join(root, HANDOFF_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => WEEKLY_FILE.test(name)).sort().map((name) => path.join(dir, name));
}

/** The newest one - whose OPEN questions are the only ones still live. */
export function newestWeeklyFile(root = REPO_ROOT) {
  const files = weeklyFiles(root);
  return files.length ? files[files.length - 1] : null;
}

/**
 * What the checkout knows right now: which questions are open, and which answers nobody has
 * recorded yet. A missing weekly file is not a fault - most checkouts never have one, and CI never
 * does, because the file is gitignored per machine.
 */
export function alignmentState(root = REPO_ROOT) {
  const files = weeklyFiles(root);
  if (files.length === 0) return { source: null, open: [], pending: [], recorded: [] };
  const newest = files[files.length - 1];
  const rulingsPath = path.join(root, ...RULINGS_FILE.split('/'));
  const rulings = existsSync(rulingsPath) ? readFileSync(rulingsPath, 'utf8') : '';
  const relative = (file) => path.relative(root, file).split(path.sep).join('/');
  const state = { source: relative(newest), open: [], pending: [], recorded: [] };
  // ANSWERS are read from EVERY week, because an answer given a month ago and never written down is
  // precisely the ruling this file promises not to lose - reading only the newest week would drop
  // it the following Tuesday, quietly, which is the failure wearing a different hat.
  // OPEN questions come from the newest week alone: by the procedure a question is carried forward
  // once and then dropped, so an old unanswered one is settled by the decision taken instead.
  const seen = new Set();
  for (const file of [...files].reverse()) {
    for (const entry of parseAlignmentQuestions(readFileSync(file, 'utf8'))) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      const row = { ...entry, source: relative(file) };
      if (!entry.answered) {
        if (file === newest) state.open.push(row);
      } else if (rulings.includes(entry.id)) state.recorded.push(row);
      else state.pending.push(row);
    }
  }
  return state;
}

/** The block a session appends to `docs/OWNER_RULINGS.md`, so nobody has to compose it twice. */
export function rulingBlock(entry) {
  return [
    `## ${entry.id}`,
    '',
    `**Asked at the weekly alignment session.** ${entry.question}`,
    '',
    `> ${entry.answer}`,
  ].join('\n');
}

function report(state) {
  if (!state.source) return ['No weekly owner session file in docs/handoffs/ - nothing to record.'];
  const lines = [`Alignment answers from ${state.source}:`];
  if (state.open.length) {
    lines.push('', `  OPEN - his to answer, and nothing waits on them (${state.open.length}):`);
    for (const entry of state.open) lines.push(`    ${entry.id}  ${entry.question}`);
  }
  if (state.recorded.length) {
    lines.push('', `  RECORDED - already in ${RULINGS_FILE} (${state.recorded.length}):`);
    for (const entry of state.recorded) lines.push(`    ${entry.id}`);
  }
  if (state.pending.length) {
    lines.push('', `  ANSWERED AND NOT RECORDED (${state.pending.length}) - a wave plan is refused until each is mentioned:`);
    for (const entry of state.pending) {
      lines.push('', `    ${entry.id}`, `      Q: ${entry.question}`, `      A: ${entry.answer}`);
      // Name the week it came from when it is not this one, so a month-old ruling nobody wrote
      // down does not read as something the owner said on Tuesday.
      if (entry.source !== state.source) lines.push(`      from ${entry.source}`);
    }
    lines.push(
      '',
      `  Append each block below to ${RULINGS_FILE} on a BRANCH - never in the primary checkout,`,
      '  where an uncommitted file stops every landing on the machine. Then this clears by itself.',
      '',
    );
    for (const entry of state.pending) {
      for (const line of rulingBlock(entry).split('\n')) lines.push(`    ${line}`);
      lines.push('');
    }
  }
  if (!state.open.length && !state.pending.length) lines.push('', '  Nothing open and nothing unrecorded.');
  return lines;
}

export function main(argv = process.argv.slice(2), { root = REPO_ROOT } = {}) {
  const state = alignmentState(root);
  const failing = argv.includes('--check') && state.pending.length > 0;
  if (argv.includes('--json')) console.log(JSON.stringify(state, null, 2));
  else for (const line of report(state)) console.log(line);
  if (failing) {
    console.error(`\nAlignment: ${state.pending.length} answer(s) the owner gave are not in ${RULINGS_FILE}.`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
