#!/usr/bin/env node
// THE TEXT YOU HAND A DELEGATED CODE REVIEW, so it RECEIVES its scope instead of deriving one.
//
//   node scripts/review-request.mjs                  # the request to paste, effort level high
//   node scripts/review-request.mjs --level medium   # a different level (never `ultra`)
//   node scripts/review-request.mjs --json           # branch, base and files, for the check stamp
//
// WHY THIS EXISTS, and why it is a script rather than another paragraph of instructions.
//
// `.agent-workflows/check.md` has said the right thing about scope since 2026-09-08: fetch first,
// take the merge base against `origin/main` and never against the local `main` branch, which the
// merge queue no longer moves. The row reads that file and follows it. The DELEGATE never reads
// it - a delegated review is a separate context that receives an invocation and nothing else - and
// what the row handed it was a BRANCH NAME. A branch name is not a scope. It is an instruction to
// go and derive one, and the derivation is where the stale ref gets in.
//
// So the rule was correct, complete, and pointed at the wrong reader. By 2026-09-09 that had cost
// five delegated review passes in this repository, every one paid for and thrown away:
//
//   - 2026-08-29, three rows: the review inherited the delegating tool's directory and reviewed a
//     different WORKTREE's branch.
//   - 2026-09-08, rows Q and P, and 2026-09-09, row J: the review diffed against a local `main`
//     that was days behind, and returned findings about other branches' landed files. J's pass
//     reached 26 commits back and had not one finding inside J's own diff.
//
// The quality cost is worse than the money. Row AQ's discarded pass had MISSED a real defect that
// the inline redo then found: a review of the wrong files is not merely wasted, it returns
// findings and therefore looks like it worked.
//
// WHAT THIS FIXES AND WHAT IT DOES NOT. It removes the delegate's ability to be wrong about scope,
// because there is nothing left for it to work out. It does not verify that the delegate obeyed:
// `/check` phase 2 still compares the scope the review REPORTS against this branch's real diff and
// discards the whole pass on a mismatch. That comparison caught all five, and a fix upstream of a
// detector is never a reason to remove the detector.
//
// The base is computed against `origin/main` through `scripts/main-ref.mjs`, and the git commands
// run in the worktree that CONTAINS this file rather than in the caller's current directory. Both
// failures above are therefore answered in code instead of in prose a delegate cannot see.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { mainRef } from './main-ref.mjs';

// The worktree this file belongs to, NOT `process.cwd()`. Several worktrees of this repository are
// normally live at once, and a scope answered for whichever directory a session happened to be
// sitting in is the 2026-08-29 failure exactly. Resolving from the script's own path means the
// answer belongs to the checkout the row is working in, whatever it types to invoke this.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Levels the review capability takes. `ultra` is absent on purpose - see `refuseUltra` below. */
const LEVELS = new Set(['low', 'medium', 'high', 'max']);

/**
 * Trailing whitespace only, never leading.
 *
 * `git status --porcelain=v1` puts a SIGNIFICANT space in column one - ` M path` is a tracked file
 * modified in the working tree and not staged, which is most of what a check looks at. A plain
 * `.trim()` here eats that space off the first line, `slice(3)` below then eats the first character
 * of the path with it, and the request goes out naming `agent-workflows/check.md` for a file called
 * `.agent-workflows/check.md`. Caught by reading this script's own output on its own branch.
 */
function git(args, { allowFail = false } = {}) {
  const run = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (run.status !== 0) {
    if (allowFail) return null;
    throw new Error(`git ${args.join(' ')} failed: ${(run.stderr || '').trim()}`);
  }
  return run.stdout.trimEnd();
}

/**
 * Working-tree paths from `git status --porcelain=v1`, which the diff above cannot see.
 *
 * A review reads the tree, so uncommitted and untracked work is in its scope whether or not the
 * request names it - and a file the request omits is a file the delegate is then entitled to be
 * surprised by. Renames arrive as `R  old -> new`; the NEW path is the one that exists to read.
 * Paths containing odd characters come back quoted, and git's own quoting is C-style, so the
 * quotes are stripped rather than reproduced into a list somebody will paste.
 */
export function workingTreePaths(status) {
  const paths = [];
  for (const line of status.split('\n')) {
    if (!line.trim()) continue;
    const entry = line.slice(3);
    const arrow = entry.indexOf(' -> ');
    const file = arrow === -1 ? entry : entry.slice(arrow + 4);
    paths.push(file.startsWith('"') && file.endsWith('"') ? file.slice(1, -1) : file);
  }
  return paths;
}

/** Branch, merge base and the complete changed set, computed once and used by both output modes. */
export function scope() {
  // Fetch before anything reads `origin/main`, because the remote-tracking ref is only as current
  // as the last fetch. Offline is survivable but must not be silent: a base computed from an
  // unfetched ref is the very staleness this script exists to remove, so the caller is told.
  const fetched = git(['fetch', '--quiet', 'origin', 'main'], { allowFail: true }) !== null;
  const ref = mainRef((args) => ({ ok: git(args, { allowFail: true }) !== null }));
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const base = git(['merge-base', ref, 'HEAD']);
  const committed = git(['diff', '--name-only', `${base}..HEAD`]).split('\n').filter(Boolean);
  const working = workingTreePaths(git(['status', '--porcelain=v1']));
  const files = [...new Set([...committed, ...working])].sort();
  return { branch, ref, base, files, fetched };
}

/**
 * `ultra` is a cloud multi-agent run that reports back OUT OF BAND. Nothing arrives in the
 * conversation that asked, so the pass cannot be scope-checked, cannot be acted on, and cannot be
 * reported as a leg that ran. `/check` has banned it in prose since it first named a level;
 * refusing it here is that ban with teeth.
 */
function refuseUltra(level) {
  if (level !== 'ultra') return;
  console.error(
    'review-request: `ultra` reports back out of band, so its result never reaches the caller ' +
      'that has to scope-check and act on it. Use `high`.',
  );
  process.exit(2);
}

/**
 * The request itself.
 *
 * Everything here is addressed to the DELEGATE, which is the only reader that matters and the one
 * that sees no repository file. It therefore carries its own justification: what the scope is,
 * that it must not be recomputed, what to do on disagreement, and what to report back. Prose in
 * `check.md` reaches the row; only this text reaches the party that was getting it wrong.
 */
export function requestText({ branch, ref, base, files, fetched }, level) {
  const stale = fetched
    ? ''
    : '\nWARNING: `git fetch` failed, so the base below was computed from a remote-tracking ref ' +
      'that may itself be behind. Say so in your output.\n';
  return `Review ONLY the ${files.length} file(s) listed at the end of this request. Effort level: ${level}.

Branch:     ${branch}
Merge base: ${base}  (against ${ref})
${stale}
THIS LIST IS THE SCOPE. It was computed in the worktree that owns the branch and handed to you
deliberately, so there is nothing for you to work out. Do not derive the changed set yourself, and
in particular do not diff against \`main\`: that local ref does not move under this project's merge
queue, and a scope taken from it reviews other branches' landed files while reporting this branch's
real diff as clean. That happened five times here by 2026-09-09, and each pass was discarded whole.

IF YOU DISAGREE, REFUSE. If a listed file is missing or unreadable, or your own view of what this
branch changed differs from this list, stop and say so: print both lists and the base sha you would
have used, and review nothing. Do not quietly review what you think changed instead. A review of
the wrong files is worse than no review, because it returns findings and so looks like it worked.

Report the merge-base sha and every file you actually read, so the caller can compare your scope
against this one. A pass that will not say what it scoped is treated as a failed pass.

FILES (${files.length}):
${files.map((file) => `  ${file}`).join('\n')}`;
}

export function main(argv = process.argv.slice(2)) {
  const levelAt = argv.indexOf('--level');
  const level = levelAt === -1 ? 'high' : (argv[levelAt + 1] ?? '');
  refuseUltra(level);
  if (!LEVELS.has(level)) {
    console.error(`review-request: unknown level "${level}". One of: ${[...LEVELS].join(', ')}.`);
    return 2;
  }

  const computed = scope();
  if (computed.files.length === 0) {
    console.error(
      `review-request: nothing to review - ${computed.branch} matches ${computed.ref} and the ` +
        'working tree is clean.',
    );
    return 1;
  }

  if (argv.includes('--json')) {
    const { branch, base, files } = computed;
    console.log(JSON.stringify({ branch, mergeBase: base, files }, null, 2));
    return 0;
  }

  if (!computed.fetched) console.error('review-request: `git fetch origin main` failed - see the warning in the request.');
  console.log(requestText(computed, level));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
