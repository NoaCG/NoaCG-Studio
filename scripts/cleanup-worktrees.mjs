// Bulk cleanup of stale worktrees, their merged local and GitHub branches, stale worktree
// metadata, and empty leftover folders - safely, from the primary `main` checkout.
//
// Default is a read-only DRY RUN. Pass --apply to actually delete. The shared cleanup workflow
// drives this: dry-run, show the plan, then apply when the assessment is clean.
//
// The ONE trustworthy test for "this work is safely in main" is commit containment:
//   git rev-list --count <ref> --not main   == 0
// (equivalently `git merge-base --is-ancestor <ref> main`). Branch names, `gone` upstream
// markers, and human/AI memory are NEVER trusted for a deletion decision - a branch that
// merged main into itself, or an old ancestor tip, both look alarming by name/diff yet are
// fully contained. Automatic removal requires containment in BOTH local main and origin/main:
// local containment proves the primary checkout has the work, and remote containment proves it
// has been backed up outside this machine. Ahead, behind, and divergence are surfaced explicitly.
//
// Containment only sees true ancestry, so a branch merged via "squash and merge" (a new commit,
// not an ancestor of the original branch) never passes it. Those are caught separately by a
// tree-equality heuristic (possiblySquashMerged) and reported for manual review - never deleted
// automatically, since tree equality is a weaker signal than ancestry.
//
// The freshness of `origin/main` is part of the safety condition, not a courtesy: containment
// measured against a ref fetched an hour ago is a claim about an hour-old world. Every
// assessment therefore refuses unless this checkout fetched within ORIGIN_FRESHNESS_MS.
//
// IGNORED CONTENT - THREE CLASSES, THREE ANSWERS. `git status --porcelain`, the clean-tree test
// every guard here relies on, does not mention ignored files at all, and `git worktree remove`
// deletes them anyway. Measured: a worktree holding `dist/precious.json` and `.env` reports zero
// porcelain lines, removes with exit 0 and no `--force`, and both files are gone. So each
// ignored path is classified and handled, never merely counted:
//   - REGENERABLE (node_modules/, dist/, caches): removed with the worktree, no ceremony.
//   - SECRETS (.env and friends): removed with the worktree, and NEVER read, printed, copied or
//     archived - only their paths are named. A secret is only removable when the primary
//     checkout still has a file at the same path to hand out again; one that exists nowhere else
//     refuses the removal instead.
//   - VALUABLE and unrebuildable (paid bench rounds, generated galleries, eval results):
//     ARCHIVED OUTSIDE THE REPO AND VERIFIED FIRST (scripts/cleanup-archive.mjs). A failed or
//     unprovable copy refuses the removal; no flag overrides it.
//
// LIVENESS. Containment cannot see whether somebody is still sitting in a worktree - a session
// that just landed its branch has a clean tree and a contained branch. scripts/session-liveness.mjs
// answers that from the session transcripts - including the parent-filed ones a worktree-isolated
// subagent writes - and a `locked` worktree (that is how the harness marks an agent RUNNING right
// now) is refused outright rather than forced. Neither signal sees a Codex or plain-shell session,
// which is stated in that file: liveness protects politeness, containment protects work.
//
// Hard rules (never broken, even with --apply):
//   - never `git branch -D`, never `git worktree remove --force`, never touch main or the
//     current branch;
//   - never delete a GitHub branch unless its exact fetched head is protected by a lease and
//     fully contained in both local main and origin/main;
//   - never remove a worktree with uncommitted changes, and never a worktree with NO BRANCH at
//     all: a detached worktree is infrastructure or an investigation in progress, and "its commit
//     is already on main" is the wrong reason to delete either (infrastructureReason);
//   - never remove a worktree whose unrebuildable ignored content has not been archived AND
//     verified, and never one holding a secret that exists nowhere else;
//   - never delete a non-empty unregistered folder (report it for manual review);
//   - only delete branches in a managed namespace (MANAGED_BRANCH_PREFIXES) whose commits are
//     fully contained in local main and origin/main, and even then let `git branch -d` refuse as
//     a final backstop.

import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { primaryCheckout } from './reattach-main.mjs';
import { pruneStalePorts } from './dev-port.mjs';
import {
  archiveAndVerify,
  archiveRoot,
  formatBytes,
  isSecretPath,
  planArchive,
  walkFiles,
} from './cleanup-archive.mjs';
import { HOME_RELATIVE_PATH as ORCHESTRATOR_HOME_PATH } from './orchestrator-home.mjs';
import { resetSessionScanCache, sessionHold } from './session-liveness.mjs';
import {
  git,
  inspectLeftoverFolders,
  normalize,
  reapDelegationTrees,
  samePath,
  worktreeRoots,
  sweepEmptyLeftoverFolders,
} from './worktree-cleanup-lib.mjs';

/**
 * Ignored paths that removal may destroy without asking, because the repo can rebuild every one
 * of them from a command. EVERYTHING ELSE that git is ignoring is treated as possible work:
 * either a secret (below) or something that has to be archived before it can go.
 */
const REGENERABLE_IGNORED = [
  // Directory names that are rebuildable WHEREVER they appear - `cli/node_modules/` is as
  // disposable as the root one, and an anchored list quietly archived 50MB of it every sweep.
  { anywhere: 'node_modules/' },
  { anywhere: '.turbo/' },
  { path: 'dist/' },
  { path: 'test-results/' },
  { path: 'playwright-report/' },
  { path: 'blob-report/' },
  { path: 'playwright/.cache/' },
  { path: 'coverage/' },
  { path: 'public/player-host/' },
  { path: 'render-worker/bundle/' },
  { path: 'render-worker/remotion/videoFontFaces.generated.ts' },
  { path: 'supabase/.temp/' },
  // Everything .gitignore itself documents as regenerated on demand, with its own wording:
  { path: 'ograf-starters-out/' }, // "REGENERATED from the catalog in seconds"
  { path: 'stinger-review-out/' }, // "Regenerated on demand in one second"
  { path: 'stinger-gate-out/' }, // "regenerated in two minutes"
  { path: 'stinger-sheets/' },
  { path: '.render-dev/' }, // "regenerated on demand by scripts/make-render-manifest.mjs"
  { path: 'dev-bench.log' }, // "meaningless anywhere else"
  // Generated per checkout and documented as never-hand-edited (AGENTS.md, docs/DEV_PORTS.md).
  { path: '.claude/launch.json' },
  { path: '.claude/dev-port.json' },
  // Permission choices, not work: losing it costs a few re-approvals, nothing unrecoverable.
  { path: '.claude/settings.local.json' },
];

/**
 * Is this ignored path one the repo can rebuild? A `path` rule anchors at the worktree root; an
 * `anywhere` rule matches that directory at any depth. Both compare whole SEGMENTS, so
 * `.claude/launch.json.bak` is not mistaken for `.claude/launch.json`.
 */
function regenerable(entry) {
  const path = entry.replace(/\/+$/, '');
  return REGENERABLE_IGNORED.some((rule) => {
    if (rule.anywhere) {
      const name = rule.anywhere.replace(/\/+$/, '');
      return path === name || path.endsWith(`/${name}`) || path.includes(`/${name}/`) || path.startsWith(`${name}/`);
    }
    const known = rule.path.replace(/\/+$/, '');
    return path === known || path.startsWith(`${known}/`);
  });
}

const MAIN = 'main';
const REMOTE_MAIN = 'origin/main';
/**
 * The branch namespaces this sweep OWNS, and may therefore delete once containment passes.
 * Anything else that passes containment is REPORTED instead: containment says the commits are
 * safe, never whose branch it is, and a name outside these namespaces was chosen by a person.
 *
 * `worktree-agent-` is the harness's own namespace, not a human's. An agent launched with
 * worktree isolation mints `.claude/worktrees/agent-<id>` together with a `worktree-agent-<id>`
 * branch pointing at the same tip as the `claude/*` branch it was shadowing, and never pushes it.
 * The sweep already removed those worktrees, so leaving the prefix out only stranded the
 * branches - 48 had accumulated by 2026-09-02, every one contained in `main`, none on `origin`.
 */
const MANAGED_BRANCH_PREFIXES = ['claude/', 'codex/', 'worktree-agent-'];

/**
 * Worktrees that are INFRASTRUCTURE, named in ONE place so adding the next one is a line here
 * rather than a condition repeated across three files. Matched on the worktree's folder name.
 *
 * The orchestrator's permanent home is here BY NAME as well as by shape. It sits detached at
 * origin/main on purpose (git will not let a second worktree hold `main` while the primary
 * checkout has it), so the branchless rule below already refuses it - but a home that is only
 * safe while it stays detached is one reattachment away from being swept, and the folder name is
 * the fact that does not change. The name comes from the module that CREATES it, so the two
 * cannot drift apart.
 */
const INFRASTRUCTURE_WORKTREE_NAMES = [ORCHESTRATOR_HOME_PATH.split('/').at(-1)];

/**
 * Why this worktree is never removed, or null if it is an ordinary session's.
 *
 * The three cases are answered EXPLICITLY, because the eligibility rule ("every commit is an
 * ancestor of a fresh origin/main") quietly assumes every worktree has a branch, and one does
 * not have to. A detached worktree sitting on a commit that IS on main passes the ancestor test
 * for the worst possible reason: it is either infrastructure or somebody mid-investigation, and
 * neither becomes disposable because the commit under it happens to have landed.
 */
export function infrastructureReason({ path, primaryRoot, branch, folder = worktreeFolder(path) }) {
  if (primaryRoot && samePath(path, primaryRoot)) {
    return (
      'this is the primary checkout - the landing queue CHECKS OUT, MERGES, BUILDS and RESETS it ' +
      'during every integration, so any read taken here can be wrong with nothing saying so'
    );
  }
  if (branch === MAIN) return `it holds ${MAIN}`;
  if (INFRASTRUCTURE_WORKTREE_NAMES.includes(folder)) return 'it is named as permanent infrastructure';
  if (!branch) {
    return (
      'it has no branch - a detached worktree is either infrastructure or an investigation in ' +
      'progress, and "its commit is already on main" is exactly the wrong reason to delete either'
    );
  }
  return null;
}

function worktreeFolder(path) {
  return normalize(path).split('/').filter(Boolean).at(-1) ?? '';
}

/**
 * How old a fetch may be before containment stops being evidence. Ten minutes: long enough that
 * one fetch serves a whole assessment, short enough that no branch can land, be superseded and
 * be force-pushed over inside the window.
 */
export const ORIGIN_FRESHNESS_MS = 10 * 60 * 1000;

/**
 * When did this checkout last hear from origin? `git fetch` writes FETCH_HEAD, so its mtime is
 * the answer, and `--git-path` resolves the per-worktree location correctly.
 *
 * Returns `{ fresh, ageMs, why }`. Fails CLOSED: no FETCH_HEAD, an unreadable one, or one older
 * than the window all report `fresh: false`, because "we never checked" and "we checked long
 * ago" are the same amount of evidence.
 */
export function originFreshness(cwd, { now = Date.now, maxAgeMs = ORIGIN_FRESHNESS_MS, stat = statSync } = {}) {
  const located = git(['rev-parse', '--git-path', 'FETCH_HEAD'], cwd);
  if (!located.ok || !located.stdout) {
    return { fresh: false, ageMs: null, why: 'could not locate FETCH_HEAD for this checkout' };
  }
  const path = isAbsolute(located.stdout) ? located.stdout : join(cwd, located.stdout);
  let mtimeMs;
  try {
    ({ mtimeMs } = stat(path));
  } catch {
    return { fresh: false, ageMs: null, why: `${REMOTE_MAIN} has never been fetched in this checkout` };
  }
  const ageMs = now() - mtimeMs;
  if (ageMs < 0) {
    // A fetch dated in the future means the clock moved, and an age computed from it is
    // meaningless. Clamping it to zero made a stale ref read as fresh - the fail-closed gate
    // failing open on the one input it cannot trust.
    return { fresh: false, ageMs, why: 'FETCH_HEAD is dated in the future - this clock cannot time a fetch' };
  }
  if (ageMs > maxAgeMs) {
    return {
      fresh: false,
      ageMs,
      why:
        `origin was last fetched ${Math.round(ageMs / 60_000)} minute(s) ago - containment against ` +
        `a stale ${REMOTE_MAIN} is not evidence`,
    };
  }
  return { fresh: true, ageMs, why: null };
}

export function managedBranch(name) {
  return MANAGED_BRANCH_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function remoteBranchRef(name) {
  return `refs/remotes/origin/${name}`;
}

function remoteBranchHead(name, cwd) {
  return git(['rev-parse', '--verify', '--quiet', remoteBranchRef(name)], cwd).stdout || null;
}

function deleteRemoteBranch(name, expectedHead, cwd) {
  return git(
    [
      'push',
      `--force-with-lease=refs/heads/${name}:${expectedHead}`,
      'origin',
      '--delete',
      name,
    ],
    cwd,
  );
}

/** True when every commit of `ref` is already reachable from `target`. */
function containedIn(ref, target, cwd) {
  const res = git(['rev-list', '--count', ref, '--not', target], cwd);
  return res.ok && res.stdout === '0';
}

/**
 * Automatic deletion requires the work to be on ORIGIN's main. Nothing else.
 *
 * It used to require the local `main` as well, and while every landing fast-forwarded the primary
 * checkout that cost nothing - the two refs agreed. GitHub's merge queue never touches the laptop,
 * so the local ref stops moving and the AND turns into a refusal for exactly the worktrees this
 * command exists to reclaim: measured with the local ref ten commits behind, three worktrees whose
 * branches had landed were each reported as "has commits not in main". The worktrees then
 * accumulate, and each one costs about a gigabyte.
 *
 * The remote is the right and sufficient test on its own. It is the published history the queue
 * writes and nothing local can rewrite; a stale local `main` adds no safety, and the freshness
 * guard above already refuses to treat an unfetched `origin/main` as evidence. The opposite case -
 * contained locally but never pushed - keeps its own refusal below, which is the direction the
 * pair was actually guarding.
 */
function safelyBackedUp(ref, cwd) {
  return containedIn(ref, REMOTE_MAIN, cwd);
}

/**
 * True when `ref`'s tree is already identical to main's, even though its commits are not
 * ancestors of main - the signature of a squash or rebase merge (GitHub "Squash and merge"
 * rewrites history, so ancestry containment never sees it). `git diff --quiet` exits 0 for no
 * difference; only called after containedInMain has already failed, so this never re-flags a
 * true ancestor. Reporting only - never a deletion signal, since a false positive (e.g. a
 * branch that coincidentally matches main's tree without being merged) is possible.
 */
function possiblySquashMerged(ref, cwd) {
  // `REMOTE_MAIN` for the same reason `safelyBackedUp` uses it: the local ref no longer moves when
  // the queue lands something, so a branch squash-merged today would be compared against a tree
  // from ten landings ago and never match.
  const res = git(['diff', '--quiet', REMOTE_MAIN, ref], cwd);
  return res.ok;
}

/**
 * The branch a worktree has checked out, or null if detached, plus whether git has it LOCKED.
 * A lock is the harness saying "an agent is running here right now"; `git worktree remove` refuses a locked
 * worktree without `--force`, which this file never passes, so the lock is reported as its own
 * refusal rather than left to surface as a confusing failure at apply time.
 */
function worktreeBranches(cwd) {
  const res = git(['worktree', 'list', '--porcelain'], cwd);
  const map = new Map(); // normalized path -> { branch|null, head, locked }
  if (!res.ok) return map;
  let path = null;
  for (const line of res.stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      path = normalize(line.slice('worktree '.length));
      map.set(path, { branch: null, head: null, locked: false });
    } else if (line.startsWith('HEAD ')) {
      if (path) map.get(path).head = line.slice('HEAD '.length).trim();
    } else if (line.startsWith('branch ')) {
      const ref = line.slice('branch '.length).trim();
      if (path) map.get(path).branch = ref.replace('refs/heads/', '');
    } else if (line === 'locked' || line.startsWith('locked ')) {
      if (path) map.get(path).locked = true;
    }
  }
  return map;
}

/**
 * Split the worktree's IGNORED content into the three classes the mechanism can act on:
 * `regenerable` (rebuild it), `secrets` (delete it, never read it), `valuable` (archive it
 * first), plus `unbackedSecrets` - a secret with no copy in the primary checkout, which is the
 * one shape that refuses the removal outright.
 *
 * `--ignored=matching` reports whole ignored directories as one entry rather than walking into
 * them, so the git call stays cheap even next to a 400MB bench directory. Only the valuable
 * entries are then walked, because those are the ones whose copy has to be proven later; sizes
 * come from that same walk, so the report and the verification cannot disagree.
 *
 * `primaryRoot` is where a secret's replacement would come from. Without it, every secret is
 * treated as unbacked - fail closed.
 */
export function classifyIgnored(worktreePath, { primaryRoot = null, exists = existsSync } = {}) {
  // -z, because the default output C-QUOTES any path with a non-ASCII byte: a folder named
  // `bench-käyttö/` comes back as "bench-k\303\244ytt\303\266/", which names nothing on disk, and
  // every later step (walk, archive, verify) would fail on a path that was only ever an escape
  // sequence. NUL-separated output is never quoted and never escaped.
  const res = git(['status', '--porcelain', '-z', '--ignored=matching'], worktreePath);
  const empty = { regenerable: [], secrets: [], unbackedSecrets: [], valuable: [] };
  if (!res.ok) return { ...empty, unreadable: true };

  const out = { ...empty, unreadable: false };
  for (const record of res.stdout.split('\0')) {
    if (!record.startsWith('!! ')) continue;
    const entry = record.slice(3);
    if (!entry) continue;

    if (regenerable(entry)) {
      out.regenerable.push(entry);
      continue;
    }
    // Secrets are checked BEFORE value: a secret is never archived, whatever else it looks like.
    // A secret nested inside an ignored DIRECTORY is caught later, by planArchive, because git
    // collapses such a directory to one line and never names what is inside it.
    if (isSecretPath(entry)) {
      const mirrored = Boolean(primaryRoot) && exists(join(primaryRoot, entry.replace(/\/+$/, '')));
      if (mirrored) out.secrets.push({ path: entry });
      else out.unbackedSecrets.push({ path: entry });
      continue;
    }
    const files = walkFiles(join(worktreePath, entry.replace(/\/+$/, '')));
    out.valuable.push({
      path: entry,
      files: files === null ? null : files.length,
      bytes: files === null ? null : files.reduce((sum, file) => sum + file.bytes, 0),
      unreadable: files === null,
    });
  }
  return out;
}

/**
 * A merge, rebase, cherry-pick or bisect stopped part-way, named rather than left to surface as
 * "the tree is dirty" - and a BISECT leaves the tree perfectly clean while its state lives only
 * in this worktree's own gitdir, so nothing else here would notice it.
 */
function operationInProgress(worktreePath) {
  // Tested as FILES, not as revisions. `git rev-parse --verify BISECT_LOG` exits 1 - a bisect log
  // is not a ref - so the older rev-parse form silently never fired for the one operation that
  // leaves no other trace, and `rebase-merge/`/`rebase-apply/` are directories that no rev-parse
  // can see either. `--git-path` resolves each to this worktree's own gitdir.
  for (const marker of [
    'MERGE_HEAD',
    'CHERRY_PICK_HEAD',
    'REVERT_HEAD',
    'BISECT_LOG',
    'rebase-merge',
    'rebase-apply',
  ]) {
    const located = git(['rev-parse', '--git-path', marker], worktreePath);
    if (!located.ok || !located.stdout) continue;
    const path = isAbsolute(located.stdout) ? located.stdout : join(worktreePath, located.stdout);
    if (existsSync(path)) return marker;
  }
  return null;
}

/** Everything in this worktree that must be archived before the worktree may be removed. */
function valuableEntries(ignored) {
  return ignored?.valuable ?? [];
}

/** Blockers a worktree's ignored content raises on its own, independent of git state. */
function ignoredBlockers(ignored) {
  const blockers = [];
  if (!ignored) return blockers;
  if (ignored.unreadable) blockers.push('could not read the ignored-file list');
  for (const entry of ignored.unbackedSecrets ?? []) {
    blockers.push(
      `${entry.path} looks like a secret and the primary checkout has no copy of it - ` +
        'removal would destroy the only one',
    );
  }
  for (const entry of ignored.valuable ?? []) {
    if (entry.unreadable) blockers.push(`${entry.path} could not be read, so its copy could never be proven`);
  }
  return blockers;
}

/**
 * SELF cleanup - the worktree the caller is sitting in, removing itself at the end of a session.
 *
 * The bulk `assess()` below deliberately refuses the current worktree and the current branch,
 * because a sweep must never pull the floor out from under the session driving it. Handoff is
 * the one moment where that is exactly the point: the work has landed, the chat is finished,
 * and the folder is litter that the next session would otherwise mistake for live work.
 *
 * What Windows actually allows, measured rather than assumed: run from the PRIMARY checkout,
 * `git worktree remove` on a worktree that still has a live process inside DEREGISTERS it and
 * deletes every file, failing only on the now-empty directory ("Permission denied"). So the
 * session can clear essentially all of itself; the empty husk unlocks the moment the session
 * exits and `sweepEmptyLeftoverFolders` (already wired into the SessionStart hook) reaps it.
 *
 * Every deletion rule of this file still applies - no `--force`, no `-D`, never `main`, never
 * another worktree, and containment in BOTH local `main` and a FRESHLY FETCHED `origin/main`
 * before anything goes.
 *
 * Returns `{ ok, reasons, primaryRoot, path, branch, head, remoteBranchHead, ignored, archive }`;
 * `reasons` lists every blocker found, so a refusal explains itself completely instead of one
 * item at a time. `remoteBranchHead` is present only when that exact GitHub ref is also safe to
 * retire, and `archive` is the copy that must succeed and verify before anything is removed.
 */
export function assessSelf(cwd) {
  const reasons = [];
  const here = normalize(cwd);
  const primaryRoot = primaryCheckout(here);
  if (!primaryRoot) return { ok: false, reasons: ['could not locate the primary checkout'], primaryRoot: null, path: null, branch: null, head: null };

  const worktrees = worktreeBranches(primaryRoot);
  // The caller's cwd is usually the worktree root, but may be nested inside it; the longest
  // registered path that contains it is the one that owns this session.
  const path = [...worktrees.keys()]
    .filter((root) => here.toLowerCase() === root.toLowerCase() || here.toLowerCase().startsWith(`${root.toLowerCase()}/`))
    .sort((a, b) => b.length - a.length)[0];
  if (!path) return { ok: false, reasons: ['this directory is not a registered worktree'], primaryRoot, path: null, branch: null, head: null };

  const self = worktrees.get(path);
  const result = {
    ok: false,
    reasons,
    primaryRoot,
    path,
    branch: self.branch,
    head: self.head,
    remoteBranchHead: null,
  };

  // One predicate, shared with the sweep: the primary checkout, a worktree holding main, a named
  // infrastructure worktree, and ANY detached worktree are all refused here by rule.
  const infrastructure = infrastructureReason({ path, primaryRoot, branch: self.branch });
  if (infrastructure) reasons.push(infrastructure);
  if (self.locked) reasons.push('this worktree is locked - git refuses to remove it, and this never forces');

  // Containment is only evidence when the ref it is measured against is current.
  const freshness = originFreshness(primaryRoot);
  result.freshness = freshness;
  if (!freshness.fresh) reasons.push(freshness.why);

  const status = git(['status', '--porcelain'], path);
  if (!status.ok) reasons.push('could not read the working tree status');
  else if (status.stdout !== '') reasons.push(`${status.stdout.split('\n').length} uncommitted file(s)`);

  // A merge/rebase/cherry-pick in progress usually leaves the tree dirty too, but naming it is
  // clearer than reporting the symptom - and a bisect leaves no symptom at all.
  const inProgress = operationInProgress(path);
  if (inProgress) reasons.push(`a ${inProgress} operation is in progress`);

  // Stashes are NOT checked: they live in the shared common dir as refs, so they survive the
  // worktree that made them. Removing this folder cannot lose one.

  if (self.branch && self.branch !== MAIN && !safelyBackedUp(self.branch, primaryRoot)) {
    reasons.push(
      containedIn(self.branch, MAIN, primaryRoot)
        ? `${self.branch} is in local ${MAIN} but not in ${REMOTE_MAIN} - it is not backed up off this machine`
        : `${self.branch} has commits that are not in ${REMOTE_MAIN}`,
    );
  }
  if (self.branch && managedBranch(self.branch)) {
    const remoteHead = remoteBranchHead(self.branch, primaryRoot);
    const remoteRef = remoteBranchRef(self.branch);
    if (
      remoteHead &&
      containedIn(remoteRef, MAIN, primaryRoot) &&
      containedIn(remoteRef, REMOTE_MAIN, primaryRoot)
    ) {
      result.remoteBranchHead = remoteHead;
    }
  }

  // Ignored content is not a question for a person any more - it is three answers in code.
  // Regenerable content goes; a secret goes unread as long as the primary checkout still has
  // one; anything unrebuildable must be archived and PROVEN first, and the plan for that copy
  // is made here so the report can show exactly where it lands.
  result.ignored = classifyIgnored(path, { primaryRoot });
  reasons.push(...ignoredBlockers(result.ignored));
  result.archive = planArchive({ worktreePath: path, entries: valuableEntries(result.ignored) });
  if (!result.archive.ok) reasons.push(`cannot archive this worktree's output: ${result.archive.refuse}`);

  result.ok = reasons.length === 0;
  return result;
}

/**
 * Perform the self cleanup an `assessSelf` plan approved. Re-verifies from scratch first: the
 * assessment may be seconds old, but this deletes things, and `main` moves under long sessions.
 *
 * `folderRemains` is the expected Windows outcome, not a failure - the worktree is deregistered
 * and empty, and the husk goes when the session that holds it exits.
 */
export function applySelf(
  plan,
  {
    prunePorts = pruneStalePorts,
    refreshRemote = () => git(['fetch', 'origin', '--prune'], plan.primaryRoot),
    archive = archiveAndVerify,
    // Injectable for the same reason `archive` is: a test that removes a temp worktree has no
    // delegations to collect, and spawning the reaper to prove it costs a full enumeration of the
    // machine's processes per removal.
    reap = spawnSync,
  } = {},
) {
  const done = {
    removedWorktree: false,
    folderRemains: false,
    deletedBranch: null,
    deletedRemoteBranch: null,
    archived: null,
    releasedPorts: [],
    reapedDelegations: [], // { path, said } - this worktree's delegations, on the way out
    errors: [],
  };

  const refreshed = refreshRemote();
  if (!refreshed?.ok) {
    done.errors.push(`could not refresh origin before self cleanup: ${refreshed?.stderr || refreshed?.stdout || 'fetch failed'}`);
    return done;
  }

  const recheck = assessSelf(plan.path);
  if (
    !recheck.ok ||
    recheck.branch !== plan.branch ||
    recheck.remoteBranchHead !== plan.remoteBranchHead
  ) {
    done.errors.push(`state changed since assessment - ${recheck.reasons.join('; ') || 'branch moved'}`);
    return done;
  }

  // The one thing a clean tree does not prove. Everything unrebuildable leaves the worktree
  // BEFORE the worktree does, and an unproven copy stops the removal dead - there is no flag
  // for it, because the whole point is that nobody has to be awake to notice.
  const archived = archive(recheck.archive);
  done.archived = archived;
  if (!archived.ok) {
    done.errors.push(`refusing: ${archived.reason} - nothing was removed`);
    return done;
  }

  // The delegations this worktree started are closed BEFORE the folder goes: their `codex.exe`
  // runs with this directory as its working directory, so one still running both leaks memory
  // and holds the folder open against the removal below.
  //
  // AND A DELEGATION THAT HAS NOT FINISHED STOPS THE REMOVAL DEAD. A delegation deliberately
  // outlives the session that launched it, and nothing else here can see one: the session hold
  // only knows about Claude sessions. Removing the worktree would delete every file underneath a
  // running Codex worker's working directory.
  const reaped = reapDelegationTrees(plan.path, { run: reap });
  done.reapedDelegations = [{ path: plan.path, said: reaped.output }];
  if (reaped.busy) {
    done.errors.push(
      `a Codex delegation is still running in ${plan.path} - it outlives the session that started `
        + 'it, so nothing was removed. Let it finish, or cancel it with '
        + '`node scripts/codex-rescue.mjs cancel`, and clean up again.',
    );
    return done;
  }

  // Never --force: a refusal here is git protecting something this assessment did not see.
  const removed = git(['worktree', 'remove', plan.path], plan.primaryRoot);
  const stillRegistered = worktreeBranches(plan.primaryRoot).has(plan.path);
  if (stillRegistered) {
    done.errors.push(`could not remove the worktree: ${removed.stderr || removed.stdout || 'git worktree remove failed'}`);
    return done;
  }
  done.removedWorktree = true;
  done.folderRemains = existsSync(plan.path);

  // Lowercase -d only, as everywhere else here: it refuses anything not fully merged.
  const deleted = git(['branch', '-d', plan.branch], plan.primaryRoot);
  if (deleted.ok) done.deletedBranch = plan.branch;
  else done.errors.push(`worktree removed, but the branch was kept: ${deleted.stderr || deleted.stdout || 'git branch -d refused'}`);

  if (done.deletedBranch && plan.remoteBranchHead) {
    const deletedRemote = deleteRemoteBranch(
      plan.branch,
      plan.remoteBranchHead,
      plan.primaryRoot,
    );
    if (deletedRemote.ok) done.deletedRemoteBranch = plan.branch;
    else {
      done.errors.push(
        `local branch deleted, but origin/${plan.branch} was kept: ` +
          `${deletedRemote.stderr || deletedRemote.stdout || 'remote delete refused'}`,
      );
    }
  }

  try {
    // Tickets, not numbers - the bulk path maps them the same way, and the CLI prints them.
    done.releasedPorts = (prunePorts() ?? []).map((ticket) => ticket?.port ?? ticket);
  } catch (error) {
    done.errors.push(`could not release the dev port: ${error?.message ?? error}`);
  }

  return done;
}

/**
 * `liveness` is passed straight to `sessionHold` - the tests point it at a transcript tree they
 * built, which is the only way the production call site itself gets covered rather than the
 * helper in isolation.
 */
export function assess(cwd, { liveness = {} } = {}) {
  const plan = {
    ok: true,
    reason: null,
    primaryRoot: null,
    currentBranch: null,
    mainSync: null, // { ahead, behind, state }
    freshness: null, // { fresh, ageMs, why }
    archiveRoot: archiveRoot(),
    worktrees: [], // { path, branch|null, head, action: 'remove'|'skip', why, ignored, archive }
    branches: [], // { name, head, action: 'delete'|'skip', why }
    remoteBranches: [], // managed origin branches, same action shape as local branches
    otherMerged: [], // branches outside managed prefixes (reported, not deleted)
    possibleSquashMerges: [], // tree matches main but not an ancestor - reported, not deleted
    prune: [], // stale worktree metadata git would prune
    emptyFolders: { empty: [], nonEmpty: [], unreadable: [] },
  };

  const primaryRoot = primaryCheckout(cwd);
  if (!primaryRoot) {
    return { ...plan, ok: false, reason: 'not inside a git checkout' };
  }
  plan.primaryRoot = primaryRoot;

  // Rule #8: only ever run from the PRIMARY checkout. A linked worktree cannot delete the
  // folder it is running inside, and its git ops fall through here confusingly.
  const roots = worktreeRoots(cwd);
  const containing = roots
    .filter((r) => samePath(cwd, r) || normalize(cwd).toLowerCase().startsWith(r.toLowerCase() + '/'))
    .sort((a, b) => b.length - a.length)[0];
  if (!containing || !samePath(containing, primaryRoot)) {
    return {
      ...plan,
      ok: false,
      reason:
        `this must run from the primary checkout (${primaryRoot}); current location resolves to ` +
        `${containing ?? normalize(cwd)}. A worktree cannot safely delete itself - cd to the ` +
        'primary checkout and rerun.',
    };
  }

  // main must exist to test containment against.
  if (!git(['rev-parse', '--verify', '--quiet', `refs/heads/${MAIN}`], primaryRoot).ok) {
    return { ...plan, ok: false, reason: `local branch ${MAIN} does not exist` };
  }
  plan.currentBranch =
    git(['symbolic-ref', '-q', '--short', 'HEAD'], primaryRoot).stdout || null; // null when detached
  if (plan.currentBranch !== MAIN) {
    return {
      ...plan,
      ok: false,
      reason:
        `the primary checkout must be on ${MAIN}; it is ` +
        `${plan.currentBranch ? `on ${plan.currentBranch}` : 'detached'}`,
    };
  }

  // Containment is measured against origin/main, so a stale fetch makes every verdict below a
  // claim about an older world. Refuse rather than qualify it.
  plan.freshness = originFreshness(primaryRoot);
  if (!plan.freshness.fresh) {
    return { ...plan, ok: false, reason: plan.freshness.why };
  }

  // Sync status vs origin/main (read-only; fetch is done by the caller before assess()).
  const lr = git(['rev-list', '--left-right', '--count', `${MAIN}...origin/${MAIN}`], primaryRoot);
  if (!lr.ok || !/^\d+\s+\d+$/.test(lr.stdout)) {
    return { ...plan, ok: false, reason: `could not compare ${MAIN} with ${REMOTE_MAIN}` };
  }
  const [ahead, behind] = lr.stdout.split(/\s+/).map(Number);
  const state = ahead && behind ? 'diverged' : ahead ? 'ahead' : behind ? 'behind' : 'in-sync';
  plan.mainSync = { ahead, behind, state };

  const wtInfo = worktreeBranches(primaryRoot);

  // Classify each registered worktree except the primary root itself.
  for (const path of roots) {
    const info = wtInfo.get(path) ?? { branch: null, head: null, locked: false };
    const entry = {
      path,
      branch: info.branch,
      head: info.head,
      locked: Boolean(info.locked),
      action: 'skip',
      why: '',
      // Does this skip need a PERSON, or is it just "not today"? Carried as a flag rather than
      // re-derived from the prose: `assessmentRisks` used to match `why` by substring, and one
      // blocker saying "could not be read" slipped past a test for "could not read", which
      // silently let an unattended --apply proceed past irreplaceable unreadable output.
      needsPerson: false,
      ignored: null,
      archive: null,
    };
    const refuse = (why, { needsPerson = false } = {}) => {
      entry.action = 'skip';
      entry.why = why;
      entry.needsPerson = needsPerson;
    };

    // Infrastructure first, and by RULE - before any question about what its commits contain.
    // This is the case the eligibility rule quietly assumed away: a worktree need not have a
    // branch, and a detached one sitting on a landed commit used to pass the ancestor test.
    const infrastructure = infrastructureReason({ path, primaryRoot, branch: info.branch });
    const status = infrastructure ? { ok: true, stdout: '' } : git(['status', '--porcelain'], path);
    const inProgress = infrastructure ? null : operationInProgress(path);
    if (infrastructure) {
      refuse(infrastructure);
    } else if (!status.ok) {
      refuse('could not read working-tree status', { needsPerson: true });
    } else if (status.stdout !== '') {
      refuse('uncommitted changes present', { needsPerson: true });
    } else if (inProgress) {
      // A bisect or a stopped rebase leaves a CLEAN tree on a contained commit, and its state
      // lives in the worktree's own gitdir - so removing it destroys the bisection silently.
      refuse(`a ${inProgress} operation is in progress`, { needsPerson: true });
    } else if (info.locked) {
      // git refuses to remove a locked worktree, and --force is not something this file owns.
      refuse('the worktree is locked - a session is holding it');
    } else if (safelyBackedUp(info.branch, primaryRoot)) {
      entry.action = 'remove';
      entry.why = `branch ${info.branch} contained in main and origin/main`;
    } else if (containedIn(info.branch, MAIN, primaryRoot)) {
      refuse(`branch ${info.branch} is only contained in local main, not origin/main`, { needsPerson: true });
    } else {
      refuse(`branch ${info.branch} has commits not in ${REMOTE_MAIN}`, { needsPerson: true });
    }

    // Only a worktree git says is disposable is worth the two remaining questions: is somebody
    // still in it, and does removing it destroy something the repo cannot rebuild?
    if (entry.action === 'remove') {
      const hold = sessionHold(path, liveness);
      if (hold.busy) {
        refuse(hold.why);
        entry.sessionIdleMinutes = hold.activity.idleMinutes;
      }
    }
    if (entry.action === 'remove') {
      entry.ignored = classifyIgnored(path, { primaryRoot });
      const blockers = ignoredBlockers(entry.ignored);
      if (blockers.length > 0) {
        refuse(blockers.join('; '), { needsPerson: true });
      } else {
        entry.archive = planArchive({
          worktreePath: path,
          entries: valuableEntries(entry.ignored),
        });
        if (!entry.archive.ok) {
          refuse(`cannot archive its output: ${entry.archive.refuse}`, { needsPerson: true });
        }
      }
    }
    plan.worktrees.push(entry);
  }

  // Which branches remain checked out in a worktree we are NOT removing? Those cannot be deleted.
  const keptWorktreeBranches = new Set(
    plan.worktrees.filter((w) => w.action !== 'remove' && w.branch).map((w) => w.branch),
  );

  // Branch classification. Default scope: fully merged managed branches, including ones whose
  // worktree still exists. Other merged branches are reported only.
  const branchList = git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], primaryRoot);
  const localBranches = branchList.ok ? branchList.stdout.split('\n').filter(Boolean) : [];
  for (const name of localBranches) {
    if (name === MAIN) continue;
    if (name === plan.currentBranch) continue; // never the current branch
    const head = git(['rev-parse', name], primaryRoot).stdout || null;
    if (!containedIn(name, MAIN, primaryRoot)) {
      // Not an ancestor of main - but a squash/rebase merge lands the same tree under a new
      // commit, so check for that signature before writing the branch off as unmerged.
      if (possiblySquashMerged(name, primaryRoot)) plan.possibleSquashMerges.push(name);
      if (managedBranch(name)) {
        plan.branches.push({
          name,
          head,
          action: 'skip',
          why: 'has commits not contained in local main',
        });
      }
      continue; // unmerged (or unconfirmed) branches are left entirely alone
    }
    if (!safelyBackedUp(name, primaryRoot)) {
      plan.branches.push({
        name,
        head,
        action: 'skip',
        why: 'contained in local main but not backed up to origin/main',
      });
      continue;
    }
    if (!managedBranch(name)) {
      plan.otherMerged.push(name);
      continue;
    }
    if (keptWorktreeBranches.has(name)) {
      plan.branches.push({
        name,
        head,
        action: 'skip',
        why: 'still checked out in a worktree left in place',
      });
    } else {
      plan.branches.push({
        name,
        head,
        action: 'delete',
        why: 'contained in main and origin/main',
      });
    }
  }

  // GitHub branch classification. A remote branch is eligible only when its exact tip is
  // contained in both copies of main and no same-named local branch or kept worktree still
  // needs it. Deletion later uses a force-with-lease pinned to this head, so a push racing the
  // cleanup is refused instead of discarded.
  const localBranchEntries = new Map(plan.branches.map((entry) => [entry.name, entry]));
  const remoteList = git(
    ['for-each-ref', '--format=%(refname)', 'refs/remotes/origin'],
    primaryRoot,
  );
  const remoteNames = remoteList.ok
    ? remoteList.stdout
        .split('\n')
        .filter((ref) => ref.startsWith('refs/remotes/origin/'))
        .map((ref) => ref.slice('refs/remotes/origin/'.length))
        .filter((name) => name && name !== 'HEAD' && name !== MAIN)
    : [];
  for (const name of remoteNames) {
    if (!managedBranch(name)) continue;
    const ref = remoteBranchRef(name);
    const head = git(['rev-parse', '--verify', '--quiet', ref], primaryRoot).stdout || null;
    const localEntry = localBranchEntries.get(name);
    if (!head || !containedIn(ref, MAIN, primaryRoot) || !containedIn(ref, REMOTE_MAIN, primaryRoot)) {
      plan.remoteBranches.push({
        name,
        head,
        action: 'skip',
        why: 'has commits not contained in both local main and origin/main',
      });
    } else if (keptWorktreeBranches.has(name)) {
      plan.remoteBranches.push({
        name,
        head,
        action: 'skip',
        why: 'still belongs to a worktree left in place',
      });
    } else if (localEntry && localEntry.action !== 'delete') {
      plan.remoteBranches.push({
        name,
        head,
        action: 'skip',
        why: 'same-named local branch is not eligible for deletion',
      });
    } else {
      plan.remoteBranches.push({
        name,
        head,
        action: 'delete',
        why: 'contained in main and origin/main; no local work depends on it',
      });
    }
  }

  // Stale worktree metadata git would prune (folders already gone). -n reports without acting.
  const pruneDry = git(['worktree', 'prune', '-n', '-v'], primaryRoot);
  if (pruneDry.ok && pruneDry.stdout) {
    plan.prune = pruneDry.stdout.split('\n').filter(Boolean);
  }

  plan.emptyFolders = inspectLeftoverFolders({
    primaryRoot,
    registeredRoots: roots,
    protect: [cwd],
  });
  return plan;
}

function currentPrimaryBranch(primaryRoot) {
  return git(['symbolic-ref', '-q', '--short', 'HEAD'], primaryRoot).stdout || null;
}

function worktreeStillSafeToRemove(worktree, primaryRoot, liveness = {}) {
  const status = git(['status', '--porcelain'], worktree.path);
  if (!status.ok || status.stdout !== '') return false;
  if (operationInProgress(worktree.path)) return false;
  const current = worktreeBranches(primaryRoot).get(normalize(worktree.path));
  if (!current) return false;
  if (current.locked) return false;
  // A session may have opened the folder since the assessment - which is only true if the scan
  // is redone. The cache is per (root, window), so without this reset the "re-check" would
  // return the snapshot assess() took, possibly minutes and several archive copies ago.
  resetSessionScanCache();
  if (sessionHold(worktree.path, liveness).busy) return false;
  // The same rule the assessment applied, re-asked: a worktree that went detached between the two
  // is infrastructure or an investigation now, whatever it was when the plan was made.
  if (infrastructureReason({ path: worktree.path, primaryRoot, branch: current.branch })) return false;
  return (
    current.branch === worktree.branch &&
    current.head === worktree.head &&
    safelyBackedUp(current.branch, primaryRoot)
  );
}

export function assessmentRisks(plan) {
  const risks = [];
  if (!plan.ok) return [plan.reason ?? 'assessment failed'];
  if (plan.mainSync?.ahead) {
    risks.push(`local main has ${plan.mainSync.ahead} commit(s) not in origin/main`);
  }
  // The flag, never the prose: which skips need a person is decided where the skip is made.
  for (const worktree of plan.worktrees.filter((entry) => entry.action === 'skip' && entry.needsPerson)) {
    risks.push(`${worktree.path}: ${worktree.why}`);
  }
  for (const branch of plan.branches.filter((entry) => entry.action === 'skip')) {
    if (
      branch.why.includes('not backed up to origin/main') ||
      branch.why.includes('not contained in local main')
    ) {
      risks.push(`${branch.name}: ${branch.why}`);
    }
  }
  for (const branch of plan.remoteBranches.filter((entry) => entry.action === 'skip')) {
    if (branch.why.includes('not contained in both')) {
      risks.push(`origin/${branch.name}: ${branch.why}`);
    }
  }
  for (const folder of plan.emptyFolders.nonEmpty) {
    risks.push(`${folder}: non-empty unregistered folder`);
  }
  for (const folder of plan.emptyFolders.unreadable) {
    risks.push(`${folder}: unreadable unregistered folder`);
  }
  return risks;
}

export function applyPlan(
  plan,
  cwd,
  {
    prunePorts = pruneStalePorts,
    refreshRemote = () => git(['fetch', 'origin', '--prune'], plan.primaryRoot),
    archive = archiveAndVerify,
    liveness = {},
    // See `applySelf`: injectable so the safety suite does not enumerate the machine's processes
    // once per removed worktree.
    reap = spawnSync,
  } = {},
) {
  const done = {
    removedWorktrees: [],
    reapedDelegations: [], // { path, said } - each worktree's finished delegations, on the way out
    archived: [], // { path, destination, files, bytes }
    deletedBranches: [],
    deletedRemoteBranches: [],
    pruned: false,
    sweep: null,
    releasedPorts: [],
    errors: [],
  };

  const refreshed = refreshRemote();
  if (!refreshed?.ok) {
    done.errors.push(
      `could not refresh origin before applying cleanup: ` +
        `${refreshed?.stderr || refreshed?.stdout || 'fetch failed'}`,
    );
    return done;
  }
  if (currentPrimaryBranch(plan.primaryRoot) !== MAIN) {
    done.errors.push(`primary checkout is no longer on ${MAIN} - no cleanup actions applied`);
    return done;
  }

  for (const w of plan.worktrees.filter((x) => x.action === 'remove')) {
    if (!worktreeStillSafeToRemove(w, plan.primaryRoot, liveness)) {
      done.errors.push(`worktree ${w.path}: safety state changed after assessment - skipped`);
      continue;
    }

    // Re-classify rather than trust the plan: ignored content can appear between assessment and
    // apply (a bench finishing, an .env being written), and it is invisible to every git check
    // above. Then archive, and prove the archive, before anything is destroyed.
    const ignored = classifyIgnored(w.path, { primaryRoot: plan.primaryRoot });
    const blockers = ignoredBlockers(ignored);
    if (blockers.length > 0) {
      done.errors.push(`worktree ${w.path}: ${blockers.join('; ')} - skipped`);
      continue;
    }
    const archivePlan = planArchive({ worktreePath: w.path, entries: valuableEntries(ignored) });
    const archived = archive(archivePlan);
    if (!archived.ok) {
      done.errors.push(`worktree ${w.path}: ${archived.reason} - nothing removed`);
      continue;
    }
    if (archived.files > 0) {
      done.archived.push({
        path: w.path,
        destination: archived.destination,
        files: archived.files,
        bytes: archived.bytes,
      });
    }

    // Close this worktree's finished delegations first: their `codex.exe` runs with this folder
    // as its working directory, so one still running is both leaked memory and a reason the
    // removal below comes back "folder may be locked/busy". One that has NOT finished keeps the
    // worktree - a delegation outlives its session by design, and nothing else in this sweep can
    // see one.
    const reaped = reapDelegationTrees(w.path, { run: reap });
    done.reapedDelegations.push({ path: w.path, said: reaped.output });
    if (reaped.busy) {
      done.errors.push(`worktree ${w.path}: a Codex delegation is still running there - kept`);
      continue;
    }

    const res = git(['worktree', 'remove', w.path], plan.primaryRoot); // never --force
    // Judge by REGISTRATION, not exit code, exactly as applySelf does. On Windows a folder
    // something holds open is deregistered and emptied, and only the rmdir fails - reporting
    // that as `[FAILED]` claimed the worktree survived while every file in it was already gone,
    // and the branch deletions below then ran anyway.
    if (!worktreeBranches(plan.primaryRoot).has(normalize(w.path))) {
      done.removedWorktrees.push(w.path);
      if (existsSync(w.path)) {
        done.errors.push(
          `worktree ${w.path}: removed and emptied, but the now-empty folder is still held open - ` +
            'it is swept once whatever holds it exits',
        );
      }
    } else {
      done.errors.push(`worktree remove ${w.path}: ${res.stderr || res.stdout || 'failed (folder may be locked/busy)'}`);
    }
  }

  // Re-derive deletable branches after removals (a just-freed branch is now deletable). Keep
  // the same containment gate; `git branch -d` is the final backstop that refuses unmerged.
  for (const b of plan.branches.filter((x) => x.action === 'delete')) {
    if (
      !managedBranch(b.name) ||
      !b.head ||
      git(['rev-parse', b.name], plan.primaryRoot).stdout !== b.head ||
      !safelyBackedUp(b.name, plan.primaryRoot)
    ) {
      done.errors.push(`branch ${b.name}: identity or backup state changed after assessment - skipped`);
      continue;
    }
    const res = git(['branch', '-d', b.name], plan.primaryRoot);
    if (res.ok) done.deletedBranches.push(b.name);
    else done.errors.push(`branch -d ${b.name}: ${res.stderr || res.stdout || 'refused'}`);
  }

  // Delete the GitHub ref only after the local worktree and branch are gone. The lease binds
  // deletion to the exact head assessed after the latest fetch; if somebody pushed meanwhile,
  // Git refuses the delete and the work survives.
  for (const b of plan.remoteBranches.filter((x) => x.action === 'delete')) {
    const localStillExists = git(
      ['show-ref', '--verify', '--quiet', `refs/heads/${b.name}`],
      plan.primaryRoot,
    ).ok;
    const currentRemoteHead = remoteBranchHead(b.name, plan.primaryRoot);
    if (
      !managedBranch(b.name) ||
      !b.head ||
      localStillExists ||
      currentRemoteHead !== b.head ||
      !containedIn(remoteBranchRef(b.name), MAIN, plan.primaryRoot) ||
      !containedIn(remoteBranchRef(b.name), REMOTE_MAIN, plan.primaryRoot)
    ) {
      done.errors.push(`origin/${b.name}: identity, containment, or local dependency changed - skipped`);
      continue;
    }
    const res = deleteRemoteBranch(b.name, b.head, plan.primaryRoot);
    if (res.ok) done.deletedRemoteBranches.push(b.name);
    else done.errors.push(`delete origin/${b.name}: ${res.stderr || res.stdout || 'refused'}`);
  }

  if (plan.prune.length > 0) {
    const res = git(['worktree', 'prune'], plan.primaryRoot);
    done.pruned = res.ok;
    if (!res.ok) done.errors.push(`worktree prune: ${res.stderr || res.stdout}`);
  }

  done.sweep = sweepEmptyLeftoverFolders({
    primaryRoot: plan.primaryRoot,
    registeredRoots: worktreeRoots(plan.primaryRoot),
    protect: [cwd],
  });

  // A removed worktree cannot hand its dev-port reservation back itself, so give it back here -
  // otherwise the port stays held until some later allocation happens to land on it
  // (docs/DEV_PORTS.md). Only reservations whose worktree is gone are touched.
  try {
    done.releasedPorts = prunePorts().map((t) => t.port);
  } catch (err) {
    done.errors.push(`dev-port reservations: ${err.message}`);
  }

  return done;
}

/**
 * What removing this worktree does to its ignored content, one line per class. Secrets are
 * named and never opened - the point of the line is that the reader can see WHICH secret dies,
 * not what was in it.
 */
function ignoredSummary(worktree) {
  const ignored = worktree.ignored;
  if (!ignored) return [];
  const lines = [];
  if (ignored.valuable.length > 0) {
    lines.push(
      `archived first: ${ignored.valuable.map((entry) => `${entry.path} (${formatBytes(entry.bytes ?? 0)})`).join(', ')}`,
    );
  }
  if (ignored.secrets.length > 0) {
    lines.push(
      `secrets deleted unread (the primary checkout still has each): ` +
        `${ignored.secrets.map((entry) => entry.path).join(', ')}`,
    );
  }
  if (ignored.regenerable.length > 0) {
    lines.push(`rebuildable, deleted: ${ignored.regenerable.join(', ')}`);
  }
  return lines;
}

function report(plan, done) {
  const L = [];
  const mode = done ? 'APPLIED' : 'DRY RUN';
  L.push(`# Worktree cleanup - ${mode}`);
  L.push(`Primary checkout: ${plan.primaryRoot} (current branch: ${plan.currentBranch ?? 'detached'})`);

  if (plan.mainSync) {
    const { ahead, behind, state } = plan.mainSync;
    L.push(`main vs origin/main: ${state}` + (state === 'in-sync' ? '' : ` (ahead ${ahead}, behind ${behind})`));
    if (state === 'diverged' || state === 'ahead') {
      L.push(
        `  ! local main is ${state} from origin/main. Only refs independently contained in both ` +
          'local main and origin/main are eligible for automatic deletion.',
      );
    }
  }

  const toRemove = plan.worktrees.filter((w) => w.action === 'remove');
  const wtSkip = plan.worktrees.filter((w) => w.action === 'skip');
  const toDelete = plan.branches.filter((b) => b.action === 'delete');
  const brSkip = plan.branches.filter((b) => b.action === 'skip');
  const remoteToDelete = plan.remoteBranches.filter((b) => b.action === 'delete');
  const remoteSkip = plan.remoteBranches.filter((b) => b.action === 'skip');

  if (plan.freshness) {
    L.push(
      `origin freshness: fetched ${Math.round((plan.freshness.ageMs ?? 0) / 1000)}s ago ` +
        `(containment is only evidence within ${Math.round(ORIGIN_FRESHNESS_MS / 60_000)} minutes)`,
    );
  }
  if (plan.archiveRoot) L.push(`Archive root: ${plan.archiveRoot}`);

  L.push('');
  L.push(`## Worktrees to remove (${toRemove.length})`);
  for (const w of toRemove) {
    const applied = done ? (done.removedWorktrees.some((p) => samePath(p, w.path)) ? ' [removed]' : ' [FAILED]') : '';
    L.push(`  - ${w.path} (${w.why})${applied}`);
    for (const line of ignoredSummary(w)) L.push(`      ${line}`);
  }
  if (toRemove.length === 0) L.push('  (none)');

  // After an apply, report what the APPLY archived, not what the assessment predicted: it
  // re-classifies, so a bench that finished in between is archived and would otherwise go
  // unnamed, and one that was cleaned up in between would read as a failure.
  const archiving = done
    ? done.archived.map((entry) => ({ path: entry.path, destination: entry.destination, files: entry.files, bytes: entry.bytes }))
    : toRemove
        .filter((w) => (w.archive?.files ?? 0) > 0)
        .map((w) => ({ path: w.path, destination: w.archive.destination, files: w.archive.files, bytes: w.archive.bytes }));
  L.push('');
  L.push(`## Archived ${done ? '' : 'before removal '}(${archiving.length})`);
  if (archiving.length === 0) {
    L.push(done ? '  (nothing needed archiving)' : '  (nothing here is unrebuildable)');
  }
  for (const w of archiving) {
    L.push(`  - ${w.path}`);
    L.push(`      -> ${w.destination}`);
    L.push(`      ${w.files} file(s), ${formatBytes(w.bytes)}${done ? ' [verified]' : ''}`);
  }

  L.push('');
  L.push(`## Branches to delete (${toDelete.length})`);
  for (const b of toDelete) {
    const applied = done ? (done.deletedBranches.includes(b.name) ? ' [deleted]' : ' [FAILED/refused]') : '';
    L.push(`  - ${b.name} (${b.why})${applied}`);
  }
  if (toDelete.length === 0) L.push('  (none)');

  L.push('');
  L.push(`## GitHub branches to delete (${remoteToDelete.length})`);
  for (const b of remoteToDelete) {
    const applied = done
      ? done.deletedRemoteBranches.includes(b.name)
        ? ' [deleted]'
        : ' [FAILED/refused]'
      : '';
    L.push(`  - origin/${b.name} (${b.why})${applied}`);
  }
  if (remoteToDelete.length === 0) L.push('  (none)');

  const skips = [
    ...wtSkip.map((w) => `worktree ${w.path}: ${w.why}`),
    ...brSkip.map((b) => `branch ${b.name}: ${b.why}`),
    ...remoteSkip.map((b) => `branch origin/${b.name}: ${b.why}`),
  ];
  L.push('');
  L.push(`## Skipped (${skips.length})`);
  for (const s of skips) L.push(`  - ${s}`);
  if (skips.length === 0) L.push('  (none)');

  L.push('');
  L.push('## Stale worktree metadata to prune');
  if (plan.prune.length === 0) L.push('  (none)');
  else {
    for (const p of plan.prune) L.push(`  - ${p}`);
    if (done) L.push(done.pruned ? '  [pruned]' : '  [prune FAILED]');
  }

  L.push('');
  L.push('## Empty leftover folders');
  if (done && done.sweep) {
    const { removed, nonEmpty, locked } = done.sweep;
    if (removed.length === 0 && nonEmpty.length === 0 && locked.length === 0) L.push('  (none)');
    for (const d of removed) L.push(`  - ${d} [removed]`);
    for (const d of locked) L.push(`  - ${d} [locked/busy - rerun later]`);
    for (const d of nonEmpty) L.push(`  - ${d} [NON-EMPTY - manual review, not deleted]`);
  } else {
    const { empty, nonEmpty, unreadable } = plan.emptyFolders;
    if (empty.length === 0 && nonEmpty.length === 0 && unreadable.length === 0) L.push('  (none)');
    for (const d of empty) L.push(`  - ${d} [empty - will remove]`);
    for (const d of unreadable) L.push(`  - ${d} [UNREADABLE - manual review, not deleted]`);
    for (const d of nonEmpty) L.push(`  - ${d} [NON-EMPTY - manual review, not deleted]`);
  }

  L.push('');
  L.push('## Dev-port reservations');
  if (done) {
    L.push(done.releasedPorts.length === 0 ? '  (none to release)' : `  - released ${done.releasedPorts.join(', ')}`);
  } else {
    L.push('  (released only under --apply)');
  }

  if (done?.reapedDelegations?.length > 0) {
    L.push('');
    L.push('## Codex delegation processes closed with their worktree');
    for (const { path, said } of done.reapedDelegations) L.push(`  - ${path}: ${said.replaceAll('\n', ' ')}`);
  }

  if (plan.otherMerged.length > 0) {
    L.push('');
    L.push(
      '## Also contained in main and origin/main, NOT deleted ' +
        `(branches outside ${MANAGED_BRANCH_PREFIXES.map((p) => `${p}*`).join(', ')} - remove manually if unwanted)`,
    );
    for (const n of plan.otherMerged) L.push(`  - ${n}`);
  }

  if (plan.possibleSquashMerges.length > 0) {
    L.push('');
    L.push(
      '## Possible squash merges, NOT deleted (tree matches main but history is not an ancestor - verify then remove manually)',
    );
    for (const n of plan.possibleSquashMerges) L.push(`  - ${n}`);
  }

  const manual = [
    ...wtSkip.map((w) => `${w.path} - ${w.why}`),
    ...brSkip.map((b) => `${b.name} - ${b.why}`),
    ...remoteSkip.map((b) => `origin/${b.name} - ${b.why}`),
    ...(!done ? plan.emptyFolders.nonEmpty : []).map(
      (d) => `${d} - non-empty leftover folder`,
    ),
    ...(!done ? plan.emptyFolders.unreadable : []).map(
      (d) => `${d} - unreadable leftover folder`,
    ),
    ...(done?.sweep?.nonEmpty ?? []).map((d) => `${d} - non-empty leftover folder`),
    ...(done?.sweep?.locked ?? []).map((d) => `${d} - locked, rerun later`),
    ...(done?.errors ?? []),
  ];
  L.push('');
  L.push(`## Manual cleanup remaining (${manual.length})`);
  for (const m of manual) L.push(`  - ${m}`);
  if (manual.length === 0) L.push('  (none)');

  return L.join('\n');
}

// CLI: `node scripts/cleanup-worktrees.mjs [--apply] [--acknowledge-risks]`
// Default is a dry run. Risk acknowledgement is valid only after the user approves the safe subset.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && process.argv.includes('--self')) {
  // Self mode: the handoff workflow's last action. Dry run by default, like the bulk mode.
  const selfCwd = normalize(process.cwd());
  const selfPrimaryRoot = primaryCheckout(selfCwd);
  if (selfPrimaryRoot) {
    const fetched = git(['fetch', 'origin', '--prune'], selfPrimaryRoot);
    if (!fetched.ok) {
      console.log(
        `Cannot run self cleanup: could not refresh origin: ` +
          `${fetched.stderr || fetched.stdout || 'git fetch failed'}`,
      );
      process.exit(2);
    }
  }
  const plan = assessSelf(selfCwd);
  if (!plan.ok) {
    console.log('Self cleanup NOT safe - this worktree stays:');
    for (const reason of plan.reasons) console.log(`  - ${reason}`);
    process.exit(2);
  }

  console.log(`Self cleanup is safe: ${plan.path} (branch ${plan.branch}, contained in main and origin/main).`);

  for (const line of ignoredSummary({ ignored: plan.ignored })) console.log(`  ${line}`);
  if (plan.archive.files > 0) {
    console.log(
      `\nBefore anything is removed, ${plan.archive.files} file(s) (${formatBytes(plan.archive.bytes)}) ` +
        `are copied to\n  ${plan.archive.destination}\nand the copy is verified file by file. ` +
        'A copy that cannot be proven stops the removal.',
    );
  }

  if (!process.argv.includes('--apply')) {
    console.log('\nDry run - rerun with --self --apply to remove it.');
    process.exit(0);
  }

  const done = applySelf(plan);
  if (done.archived?.files > 0) {
    console.log(`Archived ${done.archived.files} file(s), ${formatBytes(done.archived.bytes)} -> ${done.archived.destination}`);
  }
  for (const { said } of done.reapedDelegations) console.log(`Delegation processes: ${said}`);
  if (done.removedWorktree) console.log(`Removed worktree ${plan.path}`);
  if (done.deletedBranch) console.log(`Deleted branch ${done.deletedBranch}`);
  if (done.deletedRemoteBranch) console.log(`Deleted GitHub branch origin/${done.deletedRemoteBranch}`);
  if (done.releasedPorts.length > 0) console.log(`Released dev port(s): ${done.releasedPorts.join(', ')}`);
  if (done.folderRemains) {
    console.log('The now-empty folder is still on disk - this session holds it open. It is swept automatically once this session exits.');
  }
  for (const error of done.errors) console.log(`  ! ${error}`);
  process.exit(done.errors.length > 0 ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const doApply = process.argv.includes('--apply');
  const acknowledgedRisks = process.argv.includes('--acknowledge-risks');
  const cwd = normalize(process.cwd());

  const primaryRoot = primaryCheckout(cwd);
  if (primaryRoot) {
    const fetched = git(['fetch', 'origin', '--prune'], primaryRoot);
    if (!fetched.ok) {
      console.log(
        `Cannot run cleanup: could not refresh origin: ` +
          `${fetched.stderr || fetched.stdout || 'git fetch failed'}`,
      );
      process.exit(2);
    }
  }

  const plan = assess(cwd);
  if (!plan.ok) {
    console.log(`Cannot run cleanup: ${plan.reason}`);
    process.exit(2);
  }

  const risks = assessmentRisks(plan);
  if (doApply && risks.length > 0 && !acknowledgedRisks) {
    console.log(report(plan, null));
    console.log('\nCannot apply without explicit acknowledgement of these skipped-risk items:');
    for (const risk of risks) console.log(`  - ${risk}`);
    console.log('After user approval, rerun with --apply --acknowledge-risks.');
    process.exit(2);
  }

  const done = doApply ? applyPlan(plan, cwd) : null;
  console.log(report(plan, done));
  process.exit(done?.errors.length ? 1 : 0);
}
