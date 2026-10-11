// Canonical gate: "is it safe to reattach the primary checkout to `main`, and if so, do it?"
//
// ONE definition, shared by two callers so they can never drift:
//   - scripts/hooks/session-start.mjs   auto self-heal on every session start
//   - the shared safe-merge workflow    Phase 1 assessment + Phase 2 reattach
//
// The primary checkout (repo root) is our canonical `main` worktree. The client's worktree
// machinery parks it on a DETACHED HEAD (same commit, off the branch) whenever it spins up a
// linked worktree, so `main` drifts off the root. This heals that - but only when it is
// unambiguously safe.
//
// Reattaching means `git switch main` in the root. It is safe ONLY when ALL of these hold:
//   - HEAD is detached                    already on a branch -> nothing to heal
//   - the working tree is clean           no staged / unstaged / untracked changes
//   - no git operation is in progress     merge / rebase / cherry-pick / revert / bisect
//   - the detached commit holds NO unique work unreachable from any branch or remote
//   - `main` exists and is checked out in NO worktree (it is free to take)
// If any is false or uncertain, do NOTHING and report why. Never switch, reset, stash,
// discard, or overwrite anything on a hunch.
//
// ONE deliberate widening, opt-in and never the default: `{ fromBranch }`. The root sitting ON
// a feature branch is the normal rhythm here, not damage - it is where the work was done - so
// the detached-only rule reported every safe-merge of a root-checked-out branch as a risk, and
// three in a row were waved through identically. A stop nobody reads is not a stop. With
// `fromBranch: '<branch>'` the gate ALSO accepts HEAD attached to exactly that branch, subject
// to every other condition above, unchanged. Attached to any OTHER branch still refuses.
//
// The caller must earn that option: switching off `<branch>` leaves it with no worktree, so
// safe-merge only passes it for the branch it is merging and only reattaches AFTER verification
// has finished in that worktree. The SessionStart hook passes nothing and keeps the strict
// detached-only behaviour - it must never yank the root off a branch someone is working on.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAIN_BRANCH = 'main';

/** Run git in `cwd`; return { ok, stdout (trimmed), stderr (trimmed) }. */
function git(args, cwd) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  return {
    ok: res.status === 0,
    stdout: typeof res.stdout === 'string' ? res.stdout.trim() : '',
    stderr: typeof res.stderr === 'string' ? res.stderr.trim() : '',
  };
}

/** The primary checkout (repo root) for the worktree containing `cwd`, or null. */
export function primaryCheckout(cwd) {
  const res = git(['worktree', 'list', '--porcelain'], cwd);
  if (!res.ok) return null;
  const first = res.stdout.split('\n').find((l) => l.startsWith('worktree '));
  return first ? first.slice('worktree '.length).trim() : null;
}

/** True if any registered worktree currently has `main` checked out. */
function mainCheckedOutSomewhere(cwd) {
  const res = git(['worktree', 'list', '--porcelain'], cwd);
  if (!res.ok) return true; // can't tell -> assume occupied (fail safe)
  return res.stdout.split('\n').some((l) => l === `branch refs/heads/${MAIN_BRANCH}`);
}

/** True if a merge/rebase/cherry-pick/revert/bisect is mid-flight in `root`'s git dir. */
function operationInProgress(root) {
  const dir = git(['rev-parse', '--absolute-git-dir'], root);
  if (!dir.ok) return true; // can't tell -> fail safe
  const g = dir.stdout;
  return (
    existsSync(join(g, 'MERGE_HEAD')) ||
    existsSync(join(g, 'CHERRY_PICK_HEAD')) ||
    existsSync(join(g, 'REVERT_HEAD')) ||
    existsSync(join(g, 'BISECT_LOG')) ||
    existsSync(join(g, 'rebase-merge')) ||
    existsSync(join(g, 'rebase-apply'))
  );
}

/**
 * Assess whether `root` can be safely reattached to `main`. Pure inspection - changes
 * nothing. Returns an object; `safe` is true only when every condition above holds.
 *
 * `options.fromBranch` (optional) additionally accepts HEAD attached to exactly that branch -
 * see the opt-in widening described at the top of this file. Every other check still applies.
 */
export function assessReattach(root, options = {}) {
  const fromBranch =
    typeof options.fromBranch === 'string' && options.fromBranch !== '' && options.fromBranch !== MAIN_BRANCH
      ? options.fromBranch
      : null;

  const head = git(['rev-parse', 'HEAD'], root);
  if (!head.ok) return { safe: false, reason: 'not a git checkout' };
  const headSha = head.stdout;

  // symbolic-ref succeeds only when HEAD points at a branch. Already attached means nothing to
  // heal - unless the caller named that exact branch as one it is finished with.
  const sym = git(['symbolic-ref', '-q', 'HEAD'], root);
  const branch = sym.ok ? sym.stdout.replace('refs/heads/', '') : null;
  const attached = sym.ok;
  if (attached && branch !== fromBranch) {
    const onMain = branch === MAIN_BRANCH;
    return {
      safe: false,
      attached: true,
      onMain,
      branch,
      reason: onMain ? 'already on main' : `on branch ${branch}`,
      headSha,
    };
  }

  // From here HEAD is either detached or attached to the caller's own `fromBranch`. Both go
  // through the identical remaining checks - the state that follows is what makes it safe.
  const where = attached ? { attached: true, branch } : { detached: true };
  if (operationInProgress(root)) {
    return { safe: false, ...where, reason: 'a git operation is in progress (merge/rebase/cherry-pick/revert/bisect)', headSha };
  }

  const status = git(['status', '--porcelain'], root);
  if (!status.ok) return { safe: false, ...where, reason: 'could not read working-tree status', headSha };
  if (status.stdout !== '') return { safe: false, ...where, reason: 'working tree is not clean', headSha };

  // Commits reachable from HEAD but not from any branch or remote-tracking ref = unique work.
  // (Always 0 when attached - a branch tip is reachable from its own branch - so this costs
  // nothing there and stays the one check that catches an abandoned detached commit.)
  const unique = git(['rev-list', '--count', 'HEAD', '--not', '--branches', '--remotes'], root);
  if (!unique.ok) return { safe: false, ...where, reason: 'could not check for unique unreferenced work', headSha };
  if (unique.stdout !== '0') {
    return { safe: false, ...where, reason: `detached HEAD holds ${unique.stdout} commit(s) not reachable from any branch or remote`, headSha };
  }

  const mainRef = git(['rev-parse', '--verify', '--quiet', `refs/heads/${MAIN_BRANCH}`], root);
  if (!mainRef.ok || mainRef.stdout === '') return { safe: false, ...where, reason: `local branch ${MAIN_BRANCH} does not exist`, headSha };
  if (mainCheckedOutSomewhere(root)) return { safe: false, ...where, reason: `${MAIN_BRANCH} is checked out in another worktree`, headSha, mainSha: mainRef.stdout };

  return {
    safe: true,
    ...where,
    reason: attached ? `clean, on ${branch}, main is free` : 'clean, no unique work, main is free',
    headSha,
    mainSha: mainRef.stdout,
  };
}

/**
 * Reattach `root` to `main` when (and only when) assessReattach says it is safe. Returns
 * { acted, assessment, message }. Never throws and never acts when unsafe.
 */
export function reattachMainIfSafe(root, options = {}) {
  const assessment = assessReattach(root, options);
  if (!assessment.safe) return { acted: false, assessment, message: null };
  const sw = git(['switch', MAIN_BRANCH], root);
  if (!sw.ok) {
    return { acted: false, assessment, message: `Tried to reattach the primary checkout to ${MAIN_BRANCH} but 'git switch' failed: ${sw.stderr || sw.stdout}` };
  }
  const was = assessment.attached ? `was on ${assessment.branch} at` : 'was detached at';
  return { acted: true, assessment, message: `Reattached the primary checkout to ${MAIN_BRANCH} (${was} ${assessment.headSha.slice(0, 7)}).` };
}

// CLI: `node scripts/reattach-main.mjs [--check] [--from-branch <name>] [root]`
//   --check              report the verdict only, change nothing
//   --from-branch <name> also accept HEAD attached to exactly <name> (safe-merge's own branch,
//                        after verification - it leaves <name> with no worktree)
//   root                 checkout to assess (default: the primary checkout for this directory)
// Always exits 0 - this is an advisory/self-heal tool, never a gate that blocks.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const flagIndex = args.indexOf('--from-branch');
  const valueIndex = flagIndex === -1 ? -1 : flagIndex + 1;
  const fromBranch = valueIndex === -1 ? undefined : args[valueIndex];
  const positional = args.filter((a, i) => !a.startsWith('--') && i !== valueIndex);
  const root = positional[0] || primaryCheckout(process.cwd()) || process.cwd();
  const options = { fromBranch };

  if (checkOnly) {
    const a = assessReattach(root, options);
    console.log(`${root}: ${a.safe ? 'SAFE to reattach to main' : 'will NOT reattach'} - ${a.reason}.`);
  } else {
    const { assessment, message } = reattachMainIfSafe(root, options);
    console.log(message ?? `${root}: left as-is - ${assessment.reason}.`);
  }
  process.exit(0);
}
