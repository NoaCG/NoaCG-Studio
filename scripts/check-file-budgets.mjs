#!/usr/bin/env node
// gate: build
// guards: src/components/wizard/CreationWizard.tsx, src/components/wizard/ai/AiStep.tsx, scripts/file-budgets/*.json
//
// A FILE THAT IS BEING TAKEN APART MUST NOT QUIETLY GROW BACK.
//
// The wizard shell (`src/components/wizard/CreationWizard.tsx`, 2,601 lines when its split was
// planned) is being split into tested modules, one phase at a time, by a plan that runs for days
// (docs/work-specs/wizard-structure/spec.md D8). Every phase moves code out; nothing in
// review notices when an unrelated change moves code back in, and a split that is undone a
// hundred lines at a time is never finished. So each such file carries a line budget, and this
// gate fails the build when a budgeted file is longer than its budget.
//
// THE BUDGET ONLY GOES DOWN. A phase that shrinks a file lowers its budget to the new count in
// the same pull request; nothing raises one. That is a rule of the plans, not of this script: a
// pull request that raises a number here is the thing a reviewer refuses.
//
// WHERE BUDGETS LIVE. One JSON file per budgeted file under `scripts/file-budgets/`, so two plans
// lowering two budgets never edit the same line:
//
//   scripts/file-budgets/components-wizard-CreationWizard.json
//   { "file": "src/components/wizard/CreationWizard.tsx", "lines": 2601, "why": "..." }
//
// `scripts/file-budgets.json` is read as well when it exists (an older single-file layout),
// holding one such entry or an array of them. A file budgeted
// twice is refused rather than resolved, because two numbers for one file is two owners.
//
// HOW A LINE IS COUNTED: as `wc -l` counts a checked-out file with LF endings, so a Windows
// checkout (CRLF) and the Linux runner agree, and a last line without a newline still counts.
//
//   node scripts/check-file-budgets.mjs
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { measured } from './measured.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The per-file layout, and the single-file one beside it. Both repo-relative. */
export const BUDGET_DIR = 'scripts/file-budgets';
export const BUDGET_FILE = 'scripts/file-budgets.json';

/** Lines in a text, as `wc -l` counts the LF-normalised file. */
export function countLines(text) {
  const lf = text.replace(/\r\n?/g, '\n');
  if (lf === '') return 0;
  const breaks = (lf.match(/\n/g) ?? []).length;
  return lf.endsWith('\n') ? breaks : breaks + 1;
}

/** One budget entry, checked for shape. `source` names the JSON it came from, for messages. */
function entryOf(value, source) {
  const ok =
    value &&
    typeof value === 'object' &&
    typeof value.file === 'string' &&
    value.file.trim() !== '' &&
    Number.isInteger(value.lines) &&
    value.lines > 0;
  if (!ok) {
    throw new Error(`${source}: a budget is { "file": "<repo path>", "lines": <positive whole number> }, got ${JSON.stringify(value)}`);
  }
  return { file: value.file.replace(/\\/g, '/'), lines: value.lines, source };
}

/**
 * Every budget, from both layouts under `root`. Throws on a malformed entry or a file budgeted
 * twice: either is a budget nobody can read with confidence, and a gate that guessed would pass.
 */
export function readBudgets(root = ROOT) {
  const sources = [];
  const dir = path.join(root, BUDGET_DIR);
  if (existsSync(dir)) {
    for (const name of readdirSync(dir).sort()) {
      if (name.endsWith('.json')) sources.push(`${BUDGET_DIR}/${name}`);
    }
  }
  if (existsSync(path.join(root, BUDGET_FILE))) sources.push(BUDGET_FILE);

  const budgets = [];
  for (const source of sources) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(path.join(root, source), 'utf8'));
    } catch (error) {
      throw new Error(`${source}: not readable JSON (${error.message})`, { cause: error });
    }
    for (const value of Array.isArray(parsed) ? parsed : [parsed]) budgets.push(entryOf(value, source));
  }

  const seen = new Map();
  for (const b of budgets) {
    if (seen.has(b.file)) throw new Error(`${b.file} is budgeted twice, in ${seen.get(b.file)} and ${b.source}; keep one`);
    seen.set(b.file, b.source);
  }
  return budgets;
}

/**
 * Measure each budgeted file. Returns one row per budget, `over` true when the file is longer
 * than its budget and `missing` true when the file is gone (a stale budget, which fails too: it
 * would otherwise pass forever over nothing).
 */
export function measureBudgets(budgets, root = ROOT) {
  return budgets.map((b) => {
    const absolute = path.join(root, b.file);
    if (!existsSync(absolute)) return { ...b, count: null, missing: true, over: false };
    const count = countLines(readFileSync(absolute, 'utf8'));
    return { ...b, count, missing: false, over: count > b.lines };
  });
}

function main() {
  let rows;
  try {
    rows = measureBudgets(readBudgets());
  } catch (error) {
    process.exitCode = 1;
    console.error(`check-file-budgets: ${error.message}`);
    return;
  }
  // Required, not optional: zero would mean the directory moved or emptied, which is this gate
  // going blind rather than the budgets being met.
  measured(rows.length, 'budgeted files');

  const failing = rows.filter((r) => r.over || r.missing);
  for (const r of rows) {
    const state = r.missing ? 'MISSING' : r.over ? 'OVER' : 'ok';
    const detail = r.missing ? 'the budgeted file does not exist' : `${r.count} of ${r.lines} lines`;
    console.log(`${state.padEnd(7)} ${r.file}  ${detail}  (${r.source})`);
  }
  if (failing.length) {
    process.exitCode = 1;
    console.error('');
    for (const r of failing) {
      if (r.missing) {
        console.error(`${r.file} is budgeted in ${r.source} but does not exist. A moved file takes its budget with it; a deleted one drops it.`);
      } else {
        console.error(`${r.file} has ${r.count} lines; its budget is ${r.lines} (${r.source}).`);
      }
    }
    console.error('');
    console.error('A budget only goes down. Move the new code into a module beside the file instead of raising the number.');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
