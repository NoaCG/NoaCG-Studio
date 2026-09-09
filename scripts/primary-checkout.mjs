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
// HOW. A linked worktree's `.git` is a POINTER FILE - `gitdir: <the worktree's admin directory>` -
// while the primary checkout's `.git` is a directory. Git writes a `commondir` file inside that
// admin directory naming the shared git directory, and READING IT is what makes this exact rather
// than a guess: a pointer file also appears for a `--separate-git-dir` clone and for a submodule,
// where the target is the repository's own git directory and no `commondir` sits beside it. Taking
// two `dirname`s off every pointer would put those two cases two levels above the truth and hand
// back a path like `C:\docs\handoffs` - the failure this module exists to kill, wearing a hat.
//
// No subprocess: this is read inside a plan check and a CLI, and `spawnSync('git')` costs more than
// the whole question is worth. When there is no `.git` at all - a tarball, or a test's temporary
// directory - the answer is the root that was asked about, so callers and tests behave identically.
//
// The three other resolutions of this same fact in the repo are deliberate and stay: `dev-port.mjs`
// normalises for the port registry and sits on a hook that runs for every shell command, while
// `orchestrator-week.mjs` and `orchestrator-home.mjs` already have a git process in hand for the
// worktree list they need anyway. New callers belong here.

import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * What `<root>/.git` says: the shared git directory, and whether `root` is a LINKED WORKTREE of
 * some other checkout. Only a linked worktree has a primary checkout somewhere else.
 *
 * @returns {{ commonDir: string, linked: boolean }|null} null when `root` is not a checkout
 */
function readGitLink(root) {
  const dotGit = path.join(root, '.git');
  let text;
  try {
    if (statSync(dotGit).isDirectory()) return { commonDir: dotGit, linked: false };
    text = readFileSync(dotGit, 'utf8');
  } catch {
    return null;
  }
  const pointer = /^gitdir:\s*(.+)$/m.exec(text);
  if (!pointer) return null;
  // Resolved against `root` because the pointer may be relative - `git worktree add
  // --relative-paths` writes one.
  const gitDir = path.resolve(root, pointer[1].trim());
  try {
    const commonDir = path.resolve(gitDir, readFileSync(path.join(gitDir, 'commondir'), 'utf8').trim());
    return { commonDir, linked: true };
  } catch {
    // No `commondir` beside the pointer's target: this is not a linked worktree but a checkout
    // whose git directory lives elsewhere - `--separate-git-dir`, or a submodule. Its own working
    // tree is `root`, so there is no other checkout to reach for.
    return { commonDir: gitDir, linked: false };
  }
}

/**
 * The repository's shared git directory as seen from `root`, or null when `root` is not a checkout.
 *
 * @param {string} root any checkout of the repository - the primary one or a linked worktree
 * @returns {string|null}
 */
export function gitCommonDir(root) {
  return readGitLink(root)?.commonDir ?? null;
}

/**
 * The primary checkout of the repository containing `root`. From a linked worktree that is the
 * directory holding the shared git directory; from anything else it is `root` itself - which also
 * covers a directory that is no checkout at all, so a caller never has to branch on null and a
 * test can pass a bare temporary directory.
 *
 * @param {string} root any checkout of the repository
 * @returns {string} an absolute path
 */
export function primaryCheckout(root) {
  const link = readGitLink(root);
  return link?.linked ? path.dirname(link.commonDir) : path.resolve(root);
}
