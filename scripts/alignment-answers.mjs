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

import { primaryCheckout } from './primary-checkout.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');

/** Where the weekly session writes, and where the rulings live once a session has recorded them. */
export const HANDOFF_DIR = path.join('docs', 'handoffs');
export const RULINGS_FILE = 'docs/OWNER_RULINGS.md';

/**
 * THE DIRECTORY THE WEEKLY FILE IS ACTUALLY IN - the PRIMARY checkout's, never this one's.
 *
 * The weekly session writes an absolute path into the primary checkout and `.gitignore` keeps the
 * file out of git, so a linked worktree never has a copy. Reading `<this checkout>/docs/handoffs`
 * therefore answered "no weekly file" in every session that ran anywhere but the primary tree -
 * including every orchestrator session, which `orchestrator-home.mjs` pins to
 * `.claude/worktrees/orchestrator`. The refusal below then passed every plan for a week without
 * anything saying it had looked in an empty directory (2026-09-08, verified from a linked
 * worktree). `primaryCheckout` answers `root` itself when there is no `.git`, so a test's
 * temporary checkout still reads its own files.
 */
export function weeklyDir(root = REPO_ROOT) {
  return path.join(primaryCheckout(root), HANDOFF_DIR);
}

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
 *
 * A FIELD RUNS UNTIL THE NEXT BLANK LINE, not until the end of its own line. Every markdown file
 * in this repository wraps at about a hundred columns and the first session to run the weekly
 * procedure cold wrapped all three questions without thinking about it (dry run, 2026-09-10), so
 * reading one physical line took the question down to a fragment ending mid-clause. The question
 * only looks untidy in a report; the ANSWER is the damage. `rulingBlock` composes what a session
 * appends to `docs/OWNER_RULINGS.md` out of these two strings, so an owner who answers in three
 * sentences gets one and a half recorded, permanently, and the refusal clears as though the whole
 * ruling had landed - the failure this file exists to prevent, one level down and silent.
 *
 * Holding whoever fills the answer in to "never press enter" would be a rule that depends on
 * remembering, which is the shape this repository calls a missing mechanism (owner, 2026-08-29).
 * So the parser takes the wrapping.
 */
export function parseAlignmentQuestions(text) {
  const questions = [];
  let current = null;
  // The field the last `**Question:**` or `**Answer:**` line opened, while its continuation lines
  // are still arriving: 'question', 'answer', or null between fields.
  let field = null;
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const heading = line.match(HEADING);
    if (heading) {
      current = { id: heading[1], question: '', answer: '' };
      questions.push(current);
      field = null;
      continue;
    }
    // Any other heading closes the block, so an answer never bleeds into the next question.
    if (current && /^#{1,6}\s/.test(line)) current = null;
    if (!current) continue;
    const opened = line.match(FIELD);
    if (opened) {
      field = opened[1].toLowerCase();
      current[field] = opened[2].trim();
      continue;
    }
    // A BLANK LINE ENDS AN EMPTY FIELD, AND ONLY AN EMPTY ONE. The two failures either side of
    // this line are the same one at different sizes, so neither may be traded for the other:
    //
    //  - an EMPTY `**Answer:**`, a blank line, then the section's own prose. Resuming there would
    //    invent an answer he never gave, refuse every wave plan over it and write it into the
    //    rulings file. An empty field never resumes, so it cannot happen.
    //  - an answer given in TWO PARAGRAPHS, which is how a man who talks in paragraphs answers.
    //    Ending the field at the first blank line drops the second half exactly as silently as
    //    reading one physical line dropped the second line. A started field resumes.
    //
    // What closes a block outright is a heading, checked above, so an answer never runs past the
    // next question or into section 3.
    if (!line.trim()) { if (field && !current[field]) field = null; continue; }
    if (field) current[field] = `${current[field]} ${line.trim()}`.trim();
  }
  return questions.map((entry) => ({ ...entry, answered: entry.answer.length > 0 }));
}

/**
 * Does `text` name this alignment id - the whole id, not a longer one that starts with it?
 *
 * A plain substring test answers yes for `ALIGN-2026-09-15-1` when the file only carries
 * `ALIGN-2026-09-15-10`, so the first question reads as recorded forever and its ruling is never
 * written. The three-question cap makes that unreachable today, but the cap is a sentence in a
 * workflow and the id format allows any number, so the guard belongs in the code that depends on
 * it. Ids end in digits, so a following digit is the only thing that can extend one.
 *
 * Shared with `wave-plan-check.mjs`, whose refusal asks the same question of a wave plan.
 */
export function mentionsId(text, id) {
  return new RegExp(`${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\d)`).test(String(text ?? ''));
}

/** Every `<date>-orchestrator-week.local.md`, oldest first, so the newest is always last. */
export function weeklyFiles(root = REPO_ROOT) {
  const dir = weeklyDir(root);
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
  // TWO ROOTS, on purpose. The questions come from the PRIMARY checkout, because that is the only
  // tree the weekly file is ever written into; the rulings come from THIS checkout, because
  // `docs/OWNER_RULINGS.md` is tracked and the branch that records a ruling is the one that must
  // clear it. Reading both from one root is what broke this on 2026-09-08. Both roots are resolved
  // once here, so the `.git` link is read once per call rather than once per file.
  const primary = primaryCheckout(root);
  const dir = path.join(primary, HANDOFF_DIR);
  const files = weeklyFiles(root);
  const rulingsPath = path.join(root, ...RULINGS_FILE.split('/'));
  const rulings = existsSync(rulingsPath) ? readFileSync(rulingsPath, 'utf8') : '';
  if (files.length === 0) return { dir, source: null, open: [], pending: [], recorded: [] };
  const newest = files[files.length - 1];
  const relative = (file) => path.relative(primary, file).split(path.sep).join('/');
  const state = { dir, source: relative(newest), open: [], pending: [], recorded: [] };
  // ANSWERS are read from EVERY week, because an answer given a month ago and never written down is
  // precisely the ruling this file promises not to lose - reading only the newest week would drop
  // it the following Tuesday, quietly, which is the failure wearing a different hat.
  // OPEN questions come from the newest week alone: by the procedure a question is carried forward
  // once and then dropped, so an old unanswered one is settled by the decision taken instead.
  //
  // THE TIE-BREAK IS THE ANSWERED COPY, not the newest one. The procedure carries a question
  // forward once by writing its block again under the SAME id, so the same question legitimately
  // exists in two weeks' files. Taking the newest occurrence unconditionally means an answer
  // written into the older copy - the file that was open in front of whoever heard him say it -
  // loses to the newer empty block, and the ruling disappears with nothing reporting it.
  const seen = new Map();
  for (const file of [...files].reverse()) {
    for (const entry of parseAlignmentQuestions(readFileSync(file, 'utf8'))) {
      const previous = seen.get(entry.id);
      if (previous && (previous.answered || !entry.answered)) continue;
      seen.set(entry.id, { ...entry, source: relative(file) });
    }
  }
  for (const entry of seen.values()) {
    // `source` already says which week won, and only the newest week's questions are still open -
    // an UNANSWERED row is never replaced by the tie-break above, so its source is the file the id
    // first appeared in, walking newest first.
    if (!entry.answered) {
      if (entry.source === state.source) state.open.push(entry);
    } else if (mentionsId(rulings, entry.id)) state.recorded.push(entry);
    else state.pending.push(entry);
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
  // NAME THE DIRECTORY, always. "Nothing to record" and "I read the wrong folder" printed the same
  // sentence for a week; the path is the one fact that tells them apart.
  if (!state.source) return [`No weekly owner session file in ${state.dir} - nothing to record.`];
  const lines = [`Alignment answers from ${state.source} (in ${state.dir}):`];
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
