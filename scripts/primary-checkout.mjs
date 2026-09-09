// THE PRIMARY CHECKOUT, named from inside any linked worktree.
//
// WHY THIS EXISTS. Some of this repository's state is per-machine rather than per-branch: it is
// gitignored, it is written once, and every checkout on the machine is supposed to read the same
// copy. The weekly owner review is the clearest case - `.agent-workflows/orchestrator-week.md`
// writes `docs/handoffs/<date>-orchestrator-week.local.md` into the primary checkout by absolute
// path, and `.gitignore` keeps it out of git, so no other working tree ever has a copy.
//
// A script that resolves such a file under its OWN root therefore reads an empty directory in
// every worktree but one, and reports "nothing here" rather than "I looked in the wrong place".
// That is not hypothetical: the alignment refusal shipped on 2026-09-08 to stop an answered owner
// ruling going unrecorded returned `{ source: null, pending: [] }` from every session that ran it,
// because `orchestrator-home.mjs` pins the orchestrator to `.claude/worktrees/orchestrator` and
// the weekly file only ever exists one directory up and two across. Nothing said so for a week.
//
// HOW. A linked worktree's `.git` is a POINTER FILE - `gitdir: <common>/worktrees/<name>` - while
// the primary checkout's `.git` is a directory. Two `dirname` calls off the pointer give the
// common git directory, and its parent is the primary checkout. No subprocess: this is read on
// paths that run inside a plan check and a CLI, and `spawnSync('git')` costs more than the whole
// question is worth. When there is no `.git` at all - a tarball, or a test's temporary directory -
// the answer is the root that was asked about, so callers and tests behave identically.
//
// The three other resolutions of this same fact in the repo are deliberate and stay: `dev-port.mjs`
// normalises for the port registry and sits on a hook that runs for every shell command, while
// `orchestrator-week.mjs` and `orchestrator-home.mjs` already have a git process in hand for the
// worktree list they need anyway. New callers belong here.

import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * The repository's shared git directory as seen from `root`, or null when `root` is not a checkout.
 *
 * @param {string} root any checkout of the repository - the primary one or a linked worktree
 * @returns {string|null}
 */
export function gitCommonDir(root) {
  const dotGit = path.join(root, '.git');
  let stat;
  try {
    stat = statSync(dotGit);
  } catch {
    return null;
  }
  if (stat.isDirectory()) return dotGit;
  const pointer = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, 'utf8'));
  if (!pointer) return null;
  // `<common>/worktrees/<name>` -> `<common>`. Resolved against `root` because the pointer may be
  // relative, which `git worktree add --relative-paths` writes.
  return path.dirname(path.dirname(path.resolve(root, pointer[1].trim())));
}

/**
 * The primary checkout of the repository containing `root` - the working tree whose `.git` is a
 * real directory. Falls back to `root` itself when nothing here is a git checkout, so a caller
 * never has to branch on null and a test can pass a bare temporary directory.
 *
 * @param {string} root any checkout of the repository
 * @returns {string} an absolute path
 */
export function primaryCheckout(root) {
  const common = gitCommonDir(root);
  return common ? path.dirname(common) : path.resolve(root);
}
