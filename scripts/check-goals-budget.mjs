#!/usr/bin/env node
// gate: build
// guards: docs/GOALS.md
//
// THE ROADMAP STAYS INSIDE THE BUDGET IT DECLARES.
//
//   node scripts/check-goals-budget.mjs        # part of `npm run build`
//
// `docs/GOALS.md` states its own cap in its opening paragraph - "Keep it under 200 lines: a roadmap
// nobody can read in one sitting steers nothing" - and for three rounds running the file ignored
// it. 460 lines on 2026-08-30, 419 when the defect was filed on the shelf, 212 after the
// 2026-09-01 condense, then 284, 308 and 310 as that condense wore off. Each round
// re-read the file and cut it by hand; each time it drifted back within a week, because nothing
// measured it between rounds. A rule visibly ignored in the one file that states it teaches a
// reader that the rules here are decorative, and the next rule they discount may be one that
// matters - which is the real cost, and the reason this is a gate rather than a reminder.
//
// WHY NOT THE LINE BUDGET THAT ALREADY EXISTS. `scripts/check-shared-instructions.mjs` enforces a
// line limit too, through `MODULAR_WORKFLOW_LINE_LIMITS` - but that Map holds the number IN THE
// SCRIPT, keyed by workflow name, which is the arrangement this gate exists to avoid. The defect
// filed against GOALS.md was that four documents restated its cap and none of them measured it, so
// a second copy of the number in a script is the bug wearing a gate's clothes. It is also keyed by
// a name that a rename would silently drop (`docs/metrics/2026-09-08-gates-that-measure-nothing.md`
// records that weakness), and GOALS.md is not a workflow file. Hence a small separate gate.
//
// THE CAP IS READ FROM THE FILE, never from this script. The number lives in one place, the
// sentence a reader meets first, so raising it deliberately is an edit to the roadmap's own prose
// and there is no second copy to drift out of step. Three other docs used to restate it; they now
// point here. If the sentence is reworded so the number cannot be found, this gate FAILS rather
// than falling back to a default: a threshold resolved by a regex that silently stops matching is
// exactly the failure `scripts/measured.mjs` exists to stop, and a default would hide it.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { measured } from './measured.mjs';

/**
 * The declared cap, read from the opening paragraph. Null when the sentence no longer says it.
 *
 * The `~` is optional because the sentence carried "under ~200 lines" until this gate was written,
 * and the archive shows that wording as the file's own habit. A reader restoring the tilde would
 * otherwise redden every build with "GOALS.md no longer states its budget" - a gate whose failure
 * message points away from its cause is worse than the drift it was built to catch.
 */
export function declaredCap(text) {
  return Number(text.split(/\r?\n## /, 1)[0].match(/\*\*Keep it under ~?(\d+) lines\*\*/)?.[1]) || null;
}

/**
 * Lines a reader would count, on either line ending, so laptop and CI agree.
 *
 * A last line with no newline after it is still a line, which is where this parts company with
 * `wc -l`: that counts newline CHARACTERS and would report one fewer. Lines are what the budget is
 * about, so this counts lines.
 */
export function lineCount(text) {
  const lines = text.split(/\r?\n/);
  return lines.at(-1) === '' ? lines.length - 1 : lines.length;
}

/**
 * The verdict, as a message and an exit code, so the rules are testable without a docs/ directory.
 * @returns {{ ok: boolean, message: string }}
 */
export function judge(cap, lines) {
  if (cap === null) {
    return { ok: false, message:
      '\ncheck-goals-budget: docs/GOALS.md no longer states its budget.\n' +
      '      Its opening paragraph must carry the sentence this gate reads:  **Keep it under <n> lines**\n' +
      '      That sentence is the only place the number lives. Restore it, or change the number there to change the cap.\n' };
  }
  if (lines > cap) {
    return { ok: false, message:
      `\ncheck-goals-budget: docs/GOALS.md is ${lines} lines against the ${cap} it declares.\n` +
      "      An outcome's current state says where it stands in a few lines; the detail, the evidence and the\n" +
      "      argument belong in the plan doc it links. Condense there rather than here (docs/GOALS_ARCHIVE.md is\n" +
      '      frozen and takes nothing new). Raising the cap is a deliberate edit to that sentence.\n' };
  }
  return { ok: true, message: `check-goals-budget: OK - docs/GOALS.md is ${lines} lines, inside the ${cap} it declares.` };
}

/** True only when this file was RUN, not imported - the same guard the other checks carry. */
const isEntrypoint =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1]).replaceAll('\\', '/').toLowerCase() ===
    resolve(fileURLToPath(import.meta.url)).replaceAll('\\', '/').toLowerCase();

if (isEntrypoint) {
  const text = readFileSync(fileURLToPath(new URL('../docs/GOALS.md', import.meta.url)), 'utf8');
  const lines = lineCount(text);
  measured(lines, 'lines of docs/GOALS.md');
  const { ok, message } = judge(declaredCap(text), lines);
  if (ok) {
    console.log(message);
  } else {
    // `process.exitCode` rather than `process.exit()`: forcing exit while an in-flight handle is
    // still closing trips a libuv assertion on Windows and the run reports 127 instead of the
    // verdict, which `scripts/measured.mjs` writes out at length. This repo runs on Windows.
    process.exitCode = 1;
    console.error(message);
  }
}
