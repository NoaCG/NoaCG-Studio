#!/usr/bin/env node
// THE WAVE-PLAN STORE - where a wave's plan lives so that it outlives the session that wrote it.
//
//   node scripts/wave-plan-store.mjs --path 2026-09-09 night   # the path to write, dir created
//   node scripts/wave-plan-store.mjs --dir                     # just the directory
//   node scripts/wave-plan-store.mjs --list                    # every plan in the store, newest first
//
// WHY. The wave plan is the ONLY record of which pools ran, what the routing was, and every
// `DECIDED:` line the orchestrator wrote when it took a decision on the owner's behalf. It is
// gitignored, so git is not its archive - unlike every other handoff, which is the exception that
// made this possible to miss.
//
// It used to be written to `docs/handoffs/` in whatever checkout the orchestrator session happened
// to occupy. On 2026-09-08 the first weekly review over a real week found NO plan anywhere on the
// machine: the plans for 09-05, 09-06 and 09-07 had been written into throwaway worktrees and died
// with them, while nine lettered rows landed on 09-05 alone. A week of the owner's own oversight
// mechanism reported zero because its input no longer existed.
//
// WHY HERE and not the orchestrator's home worktree. The contract already calls
// `.claude/worktrees/orchestrator` permanent, and the cleanup sweep exempts it by name - and it
// still did not exist for the eight days after `orchestrator-home.mjs` landed, because a session
// has to remember to run a script for a worktree to be there at all. The git common directory is
// not remembered into existence: it is there because the repository is there. `noacg-jobs/` beside
// it was born 2026-08-25 and still holds files written the next day, across every worktree removal,
// every `git clean` and every rewrite the landing queue made of the primary tree in between.
// `relay.mjs` already keeps human-written markdown here for the same reason, so this is the
// second use of a shape that is already load-bearing, not a new idea about where files go.
//
// The `.local.md` suffix stays even though nothing here is inside a checkout. It still means what
// it always meant - not tracked by git - and keeping it means one glob matches a plan in the store
// and a plan in the legacy `docs/handoffs/` location, which is what lets the weekly review read
// across the move without a second pattern to keep in step.

import { existsSync, mkdirSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { jobsDir } from './jobs-store.mjs';

/** The store's folder name inside the job store, beside `logs/` and `relay/`. */
export const WAVE_PLANS_DIR = 'wave-plans';

/** Every plan file matches this, in the store and in the legacy checkout location alike. */
export const PLAN_SUFFIX = '-wave-plan.local.md';

/** The store's directory, or null outside a git checkout. */
export function wavePlansDir(dir = jobsDir()) {
  return dir ? path.join(dir, WAVE_PLANS_DIR) : null;
}

/** The same, created if it is not there yet. The orchestrator writes the file, so nothing else will. */
export function ensureWavePlansDir(dir = jobsDir()) {
  const folder = wavePlansDir(dir);
  if (folder) mkdirSync(folder, { recursive: true });
  return folder;
}

/** The one filename a plan may have: `<date>-<day|night>-wave-plan.local.md`. */
export function wavePlanName(date, kind) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ''))) throw new Error(`date must be YYYY-MM-DD, got "${date}"`);
  if (kind !== 'day' && kind !== 'night') throw new Error(`kind must be day or night, got "${kind}"`);
  return `${date}-${kind}${PLAN_SUFFIX}`;
}

/**
 * One comparable spelling of a path. Windows gives back both separators and either case for the
 * same file, and a location check that says "not in the store" about a file that IS in the store
 * would refuse every plan on this machine.
 */
function comparable(file) {
  let resolved = path.resolve(file);
  try {
    resolved = realpathSync(resolved);
  } catch {
    // Not on disk yet, or a link we may not follow: the resolved spelling is still the right answer.
  }
  return resolved.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/** Is `file` inside the store? The refusal in the plan check and the launch ledger asks this. */
export function inStore(file, dir = jobsDir()) {
  const folder = wavePlansDir(dir);
  if (!folder || !file) return false;
  return comparable(file) === comparable(path.join(folder, path.basename(file)));
}

/** Every plan in the store, newest name first. Names sort by date because the date leads them. */
export function wavePlanFiles(dir = jobsDir()) {
  const folder = wavePlansDir(dir);
  if (!folder || !existsSync(folder)) return [];
  return readdirSync(folder).filter((name) => name.endsWith(PLAN_SUFFIX)).sort().reverse();
}

const USAGE = `Usage: node scripts/wave-plan-store.mjs --path <YYYY-MM-DD> <day|night>
       node scripts/wave-plan-store.mjs --dir
       node scripts/wave-plan-store.mjs --list`;

export function main(argv = process.argv.slice(2)) {
  const folder = wavePlansDir();
  if (!folder) {
    process.stderr.write('wave-plan-store: not inside a git checkout, so there is no store.\n');
    return 1;
  }
  if (argv[0] === '--dir') {
    process.stdout.write(`${ensureWavePlansDir()}\n`);
    return 0;
  }
  if (argv[0] === '--list') {
    const names = wavePlanFiles();
    process.stdout.write(names.length ? `${names.map((name) => path.join(folder, name)).join('\n')}\n` : 'no wave plans in the store\n');
    return 0;
  }
  if (argv[0] === '--path') {
    let name;
    try {
      name = wavePlanName(argv[1], argv[2]);
    } catch (error) {
      process.stderr.write(`wave-plan-store: ${error.message}\n\n${USAGE}\n`);
      return 2;
    }
    process.stdout.write(`${path.join(ensureWavePlansDir(), name)}\n`);
    return 0;
  }
  process.stderr.write(`${USAGE}\n`);
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
