#!/usr/bin/env node
// No `gate:` header: git invokes this, not the build. Its decisions are pinned by
// scripts/contracts-merge-driver.test.mjs, which the build discovers on disk like any other test.
//
// Resolve a conflict in a GENERATED contract by regenerating it (docs/WORKFLOW_ARCHITECTURE.md §5.3).
//
//   node scripts/contracts-merge-driver.mjs --install        # register the driver in this clone
//   node scripts/contracts-merge-driver.mjs %O %A %B %P      # what git runs, per conflicted file
//
// WHY. Every file under `.claude/rules/`, every migrated `AGENTS.md` and `contracts/index.md` is
// rendered from `contracts/rules/`. Merging their TEXT is meaningless: the answer is not a blend
// of two renderings, it is the rendering of the merged store. Two branches that each recorded a
// rule produce a textual conflict in a file whose correct content neither side contains.
//
// WHAT IT DOES NOT PROMISE. Git merges files in its own order, so the store may not be merged yet
// when this runs. Then the regeneration is made from whatever the store currently says, which can
// be one side of it - and that is caught immediately, because `contracts:compile --check` runs in
// `npm run build`, which is the CI gate. The driver removes a conflict nobody can resolve by hand;
// the check is what makes the result true. If regeneration fails outright the driver keeps the
// file git already wrote and exits 0, because a merge that stops dead on a generated file is
// worse than one that stops at the build.

import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LABEL = '[contracts-merge-driver]';
export const DRIVER_NAME = 'noacg-contracts';

const git = (args, cwd = ROOT) => spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });

/** Is the driver registered in this clone? A worktree shares the common dir's config. */
export function isInstalled(cwd = ROOT) {
  return git(['config', '--get', `merge.${DRIVER_NAME}.driver`], cwd).status === 0;
}

/**
 * Register the driver. Idempotent, and safe to call on every compile: git config is per clone and
 * is not committed, so a fresh checkout has it missing rather than wrong.
 */
export function install(cwd = ROOT) {
  const command = `node "${path.join(ROOT, 'scripts', 'contracts-merge-driver.mjs')}" %O %A %B %P`;
  git(['config', `merge.${DRIVER_NAME}.name`, 'Regenerate a compiled contract from the rule store'], cwd);
  return git(['config', `merge.${DRIVER_NAME}.driver`, command], cwd).status === 0;
}

/**
 * Git hands us the ancestor (%O), OUR version (%A, and the file to write), THEIR version (%B) and
 * the path in the tree (%P). Only %A and %P matter: the output is a function of the store.
 */
function resolve(ours, target) {
  const compile = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'compile-contracts.mjs')], {
    cwd: ROOT, encoding: 'utf8', windowsHide: true,
  });
  if (compile.status !== 0) {
    console.error(`${LABEL} could not regenerate ${target} - keeping what git wrote. Run \`npm run contracts:compile\` before committing.`);
    return 0;
  }
  const generated = path.join(ROOT, target);
  if (!existsSync(generated)) {
    // The merged store no longer produces this file - the compiler deleted it. Git still wants
    // something at `ours`; leaving it alone lets the delete land as an ordinary tree change.
    console.error(`${LABEL} the merged store no longer produces ${target}.`);
    return 0;
  }
  copyFileSync(generated, ours);
  return 0;
}

function main(argv) {
  if (argv.includes('--install')) {
    const ok = install();
    console.log(`${LABEL} ${ok ? 'registered' : 'could not register'} merge.${DRIVER_NAME}.driver in this clone`);
    return ok ? 0 : 1;
  }
  const [, ours, , target] = argv;
  if (!ours || !target) {
    console.error(`${LABEL} expects git's %O %A %B %P, or --install.`);
    return 2;
  }
  return resolve(ours, target);
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) process.exit(main(process.argv.slice(2)));
