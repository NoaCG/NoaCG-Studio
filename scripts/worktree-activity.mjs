// What everything ELSE in this checkout is currently working on.
//
// Several worktrees are normally active at once (see AGENTS.md), so "is anyone already on
// this?" is a question both the SessionStart hook and the shared `next` workflow need to
// answer, from the same rules. The answer has TWO halves, and only reporting the first one
// leaves a hole big enough to walk into:
//
//   - WORKTREES with files in flight: uncommitted working-tree changes, or commits on their
//     branch that `main` does not have yet. This is live work, someone is probably in it now.
//   - BRANCHES ahead of `main` that no worktree currently has checked out. A session that
//     ends leaves its branch behind, and the client parks the freed worktree on a detached
//     HEAD - so unmerged work stays unmerged while becoming invisible to a worktree-only
//     scan. Observed in practice: a branch 4 commits and 26 files ahead vanished from this
//     scan the moment its session closed.
//
// This is READ-ONLY and best-effort. It never blocks anything: two sessions touching one file
// is not automatically a problem, it is just something worth knowing before starting work.
//
// Speed matters here, because `next` runs it while the user waits. Two things keep it quick:
// the whole-checkout facts are read ONCE up front (each worktree's branch and HEAD come from
// `git worktree list`, every branch's tip subject and age from a single `for-each-ref`), and
// the per-worktree calls that remain run CONCURRENTLY. Sequentially, ~5 git spawns per
// worktree over ~9 worktrees took 4-7s on Windows - `git status` alone is up to 1.5s on a
// large or freshly-built tree, and that latency is all waiting, not work.
//
// CLI (no arguments): print the live snapshot for the checkout you run it from.
//   node scripts/worktree-activity.mjs

import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { mainRef } from './main-ref.mjs';
import { HOME_RELATIVE_PATH } from './orchestrator-home.mjs';
import { normalize, samePath, worktreeEntries } from './worktree-cleanup-lib.mjs';

const execFileAsync = promisify(execFile);

/** Files shown per entry before the list is summarised with a "+N more" tail. */
const DEFAULT_FILE_LIMIT = 40;
/** Worktree-less branches listed before the rest are summarised with a "+N more" line. */
const DEFAULT_BRANCH_LIMIT = 10;

/**
 * Everything in flight in this checkout other than the caller's own worktree, as
 * `{ worktrees, branches }`.
 *
 * `worktrees` is one entry per registered worktree with anything in flight:
 *   { root, name, branch, detached, head, lastCommit, uncommitted, ahead, files }
 * where `files` is the de-duplicated union of uncommitted and ahead-of-main paths, `ahead` is
 * the number of commits the branch has that `main` lacks, and `lastCommit` is
 * `{ subject, relative }` (or null when it cannot be read). A worktree sitting clean on `main`
 * is not activity and is skipped, as is one with no changed files at all.
 *
 * `branches` is one entry per branch ahead of `main` that NO worktree has checked out -
 * { branch, ahead, files, lastCommit } - newest tip first. These have no working tree, so
 * there is nothing uncommitted to report; the files are what the branch adds to `main`.
 *
 * Both lists carry `files`, so `overlapping()` accepts either.
 */
export async function scanActivity(cwd = process.cwd()) {
  const entries = worktreeEntries(cwd);
  if (entries.length === 0) return { worktrees: [], branches: [] };

  const primary = entries[0].root;
  const roots = entries.map((entry) => entry.root);
  const self = roots.filter((root) => isUnder(normalize(cwd), root)).sort((a, b) => b.length - a.length)[0];

  // Anything derivable for the whole checkout at once is read once, not per worktree.
  const [hasMain, landedRef, tips] = await Promise.all([
    git(['rev-parse', '--verify', '--quiet', 'main'], primary).then((res) => res.ok),
    mainRef((args) => git(args, primary)),
    branchTips(primary),
  ]);

  // The orchestrator's permanent home is INFRASTRUCTURE, never work: it is detached at
  // `origin/main` and holds nothing of its own. It would otherwise surface here for the window
  // in which local `main` lags `origin/main` - reported as in-flight work whose "files" are the
  // ones that just LANDED, which is the opposite of the truth this report exists to tell.
  const orchestratorHome = normalize(join(primary, ...HOME_RELATIVE_PATH.split('/')));

  const candidates = entries.filter((entry) => {
    if (self && samePath(entry.root, self)) return false;
    if (samePath(entry.root, orchestratorHome)) return false;
    return entry.detached || entry.branch !== 'main'; // clean on main - nothing to compare
  });

  // Every worktree is independent, so they are scanned concurrently: the wall clock becomes
  // the slowest single worktree instead of the sum of all of them.
  const scanned = await Promise.all(
    candidates.map(async (entry) => {
      const diffRef = entry.detached ? entry.head : entry.branch;

      // Branches share one object store, so anything history-only runs from the primary
      // checkout; the working-tree status is per-worktree and must run inside it.
      const [ahead, aheadFiles, uncommitted, tip] = await Promise.all([
        hasMain && diffRef ? git(['rev-list', '--count', `${landedRef}..${diffRef}`], primary).then((r) => count(r.stdout)) : 0,
        hasMain && diffRef
          ? git(['diff', '--name-only', `${landedRef}...${diffRef}`], primary).then((r) => lines(r.stdout))
          : [],
        uncommittedPaths(entry.root),
        // for-each-ref covered every branch already; only a detached worktree still needs asking.
        entry.branch && tips.has(entry.branch) ? tips.get(entry.branch) : lastCommit(entry.root),
      ]);

      const files = [...new Set([...uncommitted, ...aheadFiles])].sort();
      if (files.length === 0) return null;

      return {
        root: entry.root,
        name: entry.root.split('/').pop() ?? entry.root,
        branch: entry.detached ? null : entry.branch,
        detached: entry.detached,
        head: entry.head,
        lastCommit: tip,
        uncommitted: uncommitted.length,
        ahead,
        files,
      };
    }),
  );

  return {
    worktrees: scanned.filter(Boolean),
    branches: hasMain ? await worktreeLessBranches(primary, entries, tips, landedRef) : [],
  };
}

/**
 * Branches ahead of `main` that no worktree has checked out, newest tip first.
 *
 * `git branch --no-merged main` is the whole candidate set in one call - a branch fully
 * contained in `main` has nothing in flight by definition - so only the survivors cost
 * anything, and they are measured concurrently.
 */
async function worktreeLessBranches(primary, entries, tips, landedRef) {
  const attached = new Set(entries.filter((entry) => entry.branch).map((entry) => entry.branch));
  const res = await git(['branch', '--no-merged', landedRef, '--format=%(refname:short)'], primary);
  const names = lines(res.stdout).filter((branch) => branch !== 'main' && !attached.has(branch));

  const measured = await Promise.all(
    names.map(async (branch) => {
      const [ahead, files] = await Promise.all([
        git(['rev-list', '--count', `${landedRef}..${branch}`], primary).then((r) => count(r.stdout)),
        git(['diff', '--name-only', `${landedRef}...${branch}`], primary).then((r) => lines(r.stdout).sort()),
      ]);
      if (ahead === 0 && files.length === 0) return null;
      return { branch, ahead, files, lastCommit: tips.get(branch) ?? null };
    }),
  );

  return measured
    .filter(Boolean)
    .sort((a, b) => (b.lastCommit?.timestamp ?? 0) - (a.lastCommit?.timestamp ?? 0));
}

/**
 * The worktrees from `activity` that touch any of `paths`, as
 * `[{ entry, files }]` with `files` the overlapping paths only. Repo-relative paths with
 * forward slashes, compared case-insensitively (Windows).
 */
export function overlapping(activity, paths) {
  const wanted = new Set(paths.map((file) => file.replaceAll('\\', '/').toLowerCase()));
  return activity
    .map((entry) => ({ entry, files: entry.files.filter((file) => wanted.has(file.toLowerCase())) }))
    .filter((hit) => hit.files.length > 0);
}

/**
 * Worktree-less branches as human-readable lines. Truncation is always stated, never silent -
 * a list that quietly stops reads as "that was all of it".
 */
export function formatBranches(branches, { fileLimit = DEFAULT_FILE_LIMIT, branchLimit = DEFAULT_BRANCH_LIMIT } = {}) {
  if (branches.length === 0) return [];
  const out = [];
  for (const entry of branches.slice(0, branchLimit)) {
    const commit = entry.lastCommit ? `, last commit ${entry.lastCommit.relative}: "${entry.lastCommit.subject}"` : '';
    out.push(`  - ${entry.branch} - ${entry.ahead} commit(s) ahead of main, no worktree${commit}`);
    const shown = entry.files.slice(0, fileLimit);
    const more = entry.files.length - shown.length;
    out.push(`    files: ${shown.join(', ')}${more > 0 ? ` (+${more} more)` : ''}`);
  }
  const hidden = branches.length - Math.min(branches.length, branchLimit);
  if (hidden > 0) out.push(`  (+${hidden} more branch(es) ahead of main with no worktree)`);
  return out;
}

/** The snapshot as human-readable lines, for a hook or a CLI run. Empty when nothing is in flight. */
export function formatActivity(activity, { fileLimit = DEFAULT_FILE_LIMIT } = {}) {
  if (activity.length === 0) return [];
  const out = [];
  for (const entry of activity) {
    const where = entry.detached ? `detached @ ${entry.head?.slice(0, 7) ?? '?'}` : entry.branch;
    const commit = entry.lastCommit
      ? `, last commit ${entry.lastCommit.relative}: "${entry.lastCommit.subject}"`
      : '';
    out.push(
      `  - ${entry.name} (${where}) - ${entry.uncommitted} uncommitted, ` +
        `${entry.ahead} commit(s) ahead of main${commit}`,
    );
    const shown = entry.files.slice(0, fileLimit);
    const more = entry.files.length - shown.length;
    out.push(`    files: ${shown.join(', ')}${more > 0 ? ` (+${more} more)` : ''}`);
  }
  return out;
}

/**
 * Run git in `cwd`; resolve to `{ ok, stdout }` with stdout RAW (untrimmed) - porcelain
 * status records begin with a space for a not-staged change, and trimming would shift the
 * path by a character. Never rejects: a failed git call is missing information here, not an
 * error worth breaking a hook or a planning turn over.
 */
async function git(args, cwd) {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 32 * 1024 * 1024 });
    return { ok: true, stdout };
  } catch {
    return { ok: false, stdout: '' };
  }
}

/**
 * `{ subject, relative, timestamp }` per local branch, from ONE for-each-ref over the whole
 * checkout - so no worktree needs its own `git log`. `timestamp` is the tip's commit time in
 * seconds, used to sort worktree-less branches newest first.
 */
async function branchTips(primary) {
  const res = await git(
    [
      'for-each-ref',
      '--format=%(refname:short)%00%(contents:subject)%00%(committerdate:relative)%00%(committerdate:unix)',
      'refs/heads',
    ],
    primary,
  );
  const tips = new Map();
  for (const line of lines(res.stdout)) {
    const [branch, subject, relative, unix] = line.split('\0');
    if (branch && subject) {
      tips.set(branch, { subject, relative: relative || 'unknown', timestamp: count(unix ?? '') });
    }
  }
  return tips;
}

/** Paths with working-tree changes in `cwd`, staged, unstaged or untracked. */
async function uncommittedPaths(cwd) {
  // `-z` keeps paths with spaces or non-ASCII intact and unquoted; each record is a fixed
  // 2-character status code, a space, then the path.
  const res = await git(['status', '--porcelain', '-z'], cwd);
  return res.stdout
    .split('\0')
    .filter(Boolean)
    // A rename is two records: "R  <new>" then the bare <old> path. Both names are genuinely
    // in flight, and the bare one has no status prefix to strip.
    .map((record) => (/^[ MADRCU?!][ MADRCU?!] /.test(record) ? record.slice(3) : record))
    .filter(Boolean);
}

/** `{ subject, relative }` for the tip commit of the worktree at `root`, or null. */
async function lastCommit(root) {
  const res = await git(['log', '-1', '--format=%s%x00%cr'], root);
  const [subject, relative] = res.stdout.trim().split('\0');
  if (!subject) return null;
  return { subject, relative: relative ?? 'unknown' };
}

function lines(stdout) {
  return stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

function count(stdout) {
  const value = Number.parseInt(stdout.trim(), 10);
  return Number.isFinite(value) ? value : 0;
}

function isUnder(path, root) {
  const [a, b] = [path.toLowerCase(), root.toLowerCase()];
  return a === b || a.startsWith(`${b}/`);
}

// CLI: print the live snapshot for the checkout this is run from.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { worktrees, branches } = await scanActivity(process.cwd());
  if (worktrees.length === 0 && branches.length === 0) {
    console.log('Nothing else in this checkout has work in flight right now.');
  }
  if (worktrees.length > 0) {
    console.log('Other worktrees with work in flight (uncommitted, or committed but not yet merged into main):');
    for (const line of formatActivity(worktrees)) console.log(line);
  }
  if (branches.length > 0) {
    if (worktrees.length > 0) console.log('');
    console.log('Branches ahead of main that no worktree has checked out (unmerged work, session likely closed):');
    for (const line of formatBranches(branches)) console.log(line);
  }
}
