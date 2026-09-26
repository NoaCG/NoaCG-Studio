#!/usr/bin/env node
// No `gate:` header: git invokes this, not the build. Its decisions are pinned by
// scripts/contracts-merge-driver.test.mjs, which the build discovers on disk like any other test.
//
// Resolve a conflict in a GENERATED contract by regenerating it (docs/WORKFLOW_ARCHITECTURE.md §2).
//
//   node scripts/contracts-merge-driver.mjs --install        # register the driver in this clone
//   node scripts/contracts-merge-driver.mjs %O %A %B %P      # what git runs, per conflicted file
//
// WHY. Every file under `.claude/rules/`, every migrated `AGENTS.md` and `contracts/index.md` is
// rendered from `contracts/rules/`. Merging their TEXT is meaningless: the answer is not a blend
// of two renderings, it is the rendering of the merged store. Two branches that each recorded a
// rule produce a textual conflict in a file whose correct content neither side contains.
//
// WHAT IT DOES NOT PROMISE. It never sees the merged store. Merge-ort, git's default strategy
// since 2.34, settles every path in memory and writes the working tree ONCE, after the last
// content merge - so when this runs, `contracts/rules/` on disk is still the pre-merge tree.
// Measured 2026-09-16 with a stub driver that read a second file's bytes mid-merge: it read the
// base content whether that file sorted before or after the driver's own, so path order buys
// nothing and there is no ordering to arrange. Two consequences:
//
//   - When both sides touched the store the regeneration is made from OUR side of it, always.
//     `contracts:compile --check` runs in `npm run build`, which is the CI gate, so the merge
//     lands clean and the build then calls the generated tree stale; one `npm run
//     contracts:compile` settles it. The driver removes a conflict nobody can resolve by hand,
//     and the check is what makes the result true.
//   - Pre-merge means the WORKING TREE, so an uncommitted edit under `contracts/rules/` is
//     compiled into what git stages - content that is on neither side of the merge. The same
//     check catches it, but only on a clean checkout, which means CI rather than the laptop
//     that made it: a local `--check` compiles from that same dirty store and agrees.
//
// docs/backlog/contracts-merge-driver-regenerates-before-the-store-is-merged.md carries the
// measurement and what a real fix would take. If regeneration fails outright the driver keeps the
// file git already wrote and exits 0, because a merge that stops dead on a generated file is
// worse than one that stops at the build.

import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  install as registerMergeDriver,
  isInstalled as mergeDriverIsInstalled,
  registeredCommand as mergeDriverRegisteredCommand,
} from './merge-driver-registration.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LABEL = '[contracts-merge-driver]';
export const DRIVER_NAME = 'noacg-contracts';

/**
 * Set for the compiler this script spawns, and honoured by `scripts/compile-contracts.mjs`: do not
 * register the merge driver on this run. Exported so the compiler and the tests name one string.
 */
export const SKIP_INSTALL_ENV = 'NOACG_CONTRACTS_SKIP_DRIVER_INSTALL';

/**
 * The command git is told to run, with the script named RELATIVELY.
 *
 * Git runs a merge driver from the TOP of the working tree it is merging into, including when the
 * merge was started from a subdirectory - measured on 2026-09-16 and pinned by this script's test.
 * So one relative command is correct in every worktree of the clone at once, which matters because
 * `git config` is per clone and every worktree shares it, while this repository makes and deletes
 * a worktree per session. An absolute path is correct only until the worktree that wrote it goes.
 *
 * It had already gone. On 2026-09-16 this clone's registration named
 * `.claude/worktrees/agent-ae47713a44213dee3`, a directory that no longer existed, and what git
 * does with a driver it cannot run is worse than doing nothing: it reports `CONFLICT (content)`,
 * marks the file `UU`, and leaves OUR version in the working tree WITH NO CONFLICT MARKERS IN IT.
 * Measured the same day, both when the two sides touched different lines - a merge plain git
 * settles cleanly - and when they touched the same one. A person opens the file git called
 * conflicted, sees clean text, stages it, and the merge commit records ours alone; `git merge`
 * then answers "Already up to date" and the other side's change is never offered again.
 */
export const DRIVER_COMMAND = 'node "scripts/contracts-merge-driver.mjs" %O %A %B %P';

/** What git would actually run for this driver in `cwd`'s clone, or null when nothing is set. */
export function registeredCommand(cwd = ROOT) {
  return mergeDriverRegisteredCommand(DRIVER_NAME, cwd);
}

/**
 * Is this clone registered with the command we would write? Presence is not enough: a clone
 * carrying an older version's absolute path has the key and no working driver, and reading only
 * presence is how that survived. A worktree shares the common dir's config, so this is per clone.
 * The shape - and the sibling that shares it - is scripts/merge-driver-registration.mjs.
 */
export function isInstalled(cwd = ROOT) {
  return mergeDriverIsInstalled(DRIVER_NAME, DRIVER_COMMAND, cwd);
}

/**
 * Register the driver, or correct it. Unconditional and cheap - two `git config` writes - and it
 * must be unconditional, because a clone where the entry is WRONG is worse than one where it is
 * missing and only a write can tell those apart.
 *
 * `--replace-all` (inside the shared helper) because a plain `git config <key> <value>` REFUSES a
 * key that carries more than one value: exit 5, "cannot overwrite multiple values with a single
 * value", and the stale command survives the repair that was meant to remove it. A doubled key is
 * exactly the shape a clone picks up from two tools writing the same config, and `--get` answers
 * with the last value, so nothing else would have noticed.
 *
 * What it returns is what is REGISTERED afterwards, not whether our own write is the one that put
 * it there. Every worktree of this clone shares one `.git/config` and several sessions compile at
 * once, so a lost race for `config.lock` is a failed write and not a failed registration.
 */
export function install(cwd = ROOT) {
  return registerMergeDriver(DRIVER_NAME, DRIVER_COMMAND, 'Regenerate a compiled contract from the rule store', cwd);
}

/**
 * Git hands us the ancestor (%O), OUR version (%A, and the file to write), THEIR version (%B) and
 * the path in the tree (%P). Only %A and %P matter: the output is a function of the store.
 */
function resolve(ours, target) {
  const compile = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'compile-contracts.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
    // The compiler registers this driver on every write, which is right when a person runs it and
    // wrong here: git is mid-merge, the whole clone shares one `.git/config`, and a driver that is
    // running is a driver that is already registered. Once per conflicted file it would also be
    // several writes deep in a single merge.
    env: { ...process.env, [SKIP_INSTALL_ENV]: '1' },
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
