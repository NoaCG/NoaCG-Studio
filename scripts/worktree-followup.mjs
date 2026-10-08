// A FOLLOW-UP IN A CHAT WHOSE WORK HAS LANDED - what the SessionStart hook does so the owner can
// come back to the same desktop chat with a question or a quick fix and have nothing to run.
//
// Finished worktrees now clean themselves up (scripts/cleanup-worktrees.mjs --unattended; a
// landed desktop chat's worktree goes after a day of quiet, never while a process is in it). The
// owner's worry, 2026-10-08: a session whose work landed must not "just disappear" - he often
// returns to the same chat. Two shapes, both answered at session start:
//
//   A. The worktree is still there and its branch has landed. New work on that branch would sit on
//      an old main and re-land commits that are already in. So, when the tree is clean and the
//      branch has nothing that is not on origin/main, the worktree is switched to a FRESH branch
//      cut from origin/main. Nothing is lost: every commit of the old branch is on main.
//   B. The worktree is gone (the sweep removed it) and the chat is resumed. The transcript says
//      where the session last worked; a fresh worktree is made at that same path from origin/main,
//      on a fresh branch, and the session is told to enter it. Claude Code resumes a session whose
//      worktree is gone in the directory it was launched from and says so (code.claude.com,
//      "Resume a worktree session"); what the desktop app does is not documented and was not
//      observable from here - see docs/work-specs/worktree-lifecycle/spec.md.
//
// Both refuse on any doubt: a dirty tree, an operation in progress, commits not on origin/main, a
// non-empty folder git does not know - those are someone's work, and the hook's existing warnings
// handle them. Neither ever deletes anything.

import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

import { git, managedBranch, normalize, operationInProgress, samePath, worktreeEntries } from './worktree-cleanup-lib.mjs';

/**
 * The next free name after `branch`: `claude/x` -> `claude/x-2`, `claude/x-2` -> `claude/x-3`.
 * `taken(name)` says whether a name is already used anywhere that matters.
 */
export function freshBranchName(branch, taken) {
  const match = /^(.*)-(\d+)$/.exec(branch);
  const stem = match ? match[1] : branch;
  const first = match ? Number(match[2]) + 1 : 2;
  for (let n = first; n < first + 200; n += 1) {
    const name = `${stem}-${n}`;
    if (!taken(name)) return name;
  }
  return `${stem}-${Date.now()}`;
}

/** Is `name` used locally, on origin, or by a landing already recorded? */
function nameTaken(name, cwd, landed) {
  return (
    landed.has(name) ||
    git(['show-ref', '--verify', '--quiet', `refs/heads/${name}`], cwd).ok ||
    git(['show-ref', '--verify', '--quiet', `refs/remotes/origin/${name}`], cwd).ok
  );
}

/**
 * Bring origin/main up to date, best effort and bounded - this runs inside a hook, and a stale ref
 * only makes the checks here stricter (origin/main never moves backwards).
 */
function refreshMain(cwd) {
  spawnSync('git', ['fetch', '--quiet', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main'], {
    cwd,
    timeout: 15_000,
    windowsHide: true,
  });
}

/**
 * CASE A. If the worktree at `root` is on a branch the landing ledger names, with a clean tree,
 * no operation in progress and nothing that is not on origin/main, switch it to a fresh branch cut
 * from origin/main. Returns `{ from, to }` when it switched, `{ kept, why }` when it chose not to,
 * or null when there was nothing to decide.
 */
export function moveOffLandedBranch({ root, branch, landed, refresh = refreshMain }) {
  if (!branch || !managedBranch(branch) || !landed.has(branch)) return null;
  const status = git(['status', '--porcelain'], root);
  if (!status.ok) return { kept: true, why: 'could not read the working tree' };
  if (status.stdout !== '') return { kept: true, why: 'it has uncommitted changes' };
  const inProgress = operationInProgress(root);
  if (inProgress) return { kept: true, why: `a ${inProgress} operation is in progress` };
  refresh(root);
  const ahead = git(['rev-list', '--count', branch, '--not', 'origin/main'], root);
  if (!ahead.ok || ahead.stdout !== '0') return { kept: true, why: 'it has commits that are not on origin/main yet' };
  const fresh = freshBranchName(branch, (name) => nameTaken(name, root, landed));
  const switched = git(['switch', '--no-track', '-c', fresh, 'origin/main'], root);
  if (!switched.ok) return { kept: true, why: switched.stderr || 'git switch failed' };
  return { from: branch, to: fresh };
}

/** How much of a transcript's tail to read for the session's last working directory. */
const TAIL_BYTES = 256 * 1024;

/**
 * Where the session last worked before `beforeMs`, from its transcript: `{ cwd, branch }` of the
 * newest entry that records a cwd, or null. Entries written by the resume itself are newer than
 * `beforeMs` and are skipped, so the answer is where the session WAS, not where it was resumed.
 */
export function lastWorkplace(transcriptPath, { beforeMs = Date.now() - 60_000 } = {}) {
  if (!transcriptPath || !existsSync(transcriptPath)) return null;
  let fd;
  try {
    const { size } = statSync(transcriptPath);
    const from = Math.max(0, size - TAIL_BYTES);
    const buffer = Buffer.alloc(size - from);
    fd = openSync(transcriptPath, 'r');
    readSync(fd, buffer, 0, buffer.length, from);
    const lines = buffer.toString('utf8').split('\n');
    if (from > 0) lines.shift();
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (!line || line[0] !== '{') continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (typeof entry?.cwd !== 'string' || !entry.cwd) continue;
      const at = Date.parse(entry.timestamp ?? '');
      if (Number.isFinite(at) && at > beforeMs) continue;
      return { cwd: normalize(entry.cwd), branch: typeof entry.gitBranch === 'string' ? entry.gitBranch : null };
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * CASE B. The session last worked in `<primary>/.claude/worktrees/<name>`, and that worktree is
 * gone. Make a fresh one at the same path, cut from origin/main on a fresh branch, and return
 * `{ path, branch, inside }` - `inside` when the session is already sitting in that folder.
 * Null when there is nothing to recover; `{ error }` when git refused.
 */
export function recoverRemovedWorktree({ sessionCwd, primaryRoot, transcriptPath, landed, refresh = refreshMain, beforeMs }) {
  if (!primaryRoot) return null;
  const last = lastWorkplace(transcriptPath, beforeMs === undefined ? {} : { beforeMs });
  if (!last) return null;
  const home = normalize(join(primaryRoot, '.claude', 'worktrees'));
  const match = new RegExp(`^${escapeRegExp(home)}/([^/]+)`, 'i').exec(last.cwd);
  if (!match) return null;
  const path = normalize(join(home, match[1]));
  if (worktreeEntries(primaryRoot).some((entry) => samePath(entry.root, path))) return null; // still there
  if (existsSync(path)) {
    let entries;
    try {
      entries = readdirSync(path);
    } catch {
      return null;
    }
    if (entries.length > 0) return null; // a folder with files git does not know is somebody's
  }
  refresh(primaryRoot);
  const base = last.branch && managedBranch(last.branch) ? last.branch : `claude/${basename(path)}`;
  const branch = freshBranchName(base, (name) => nameTaken(name, primaryRoot, landed));
  const added = git(['worktree', 'add', '--no-track', '-b', branch, path, 'origin/main'], primaryRoot);
  if (!added.ok) return { error: added.stderr || added.stdout || 'git worktree add failed' };
  return { path, branch, inside: samePath(sessionCwd, path) };
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
