// Shared worktree-hygiene helpers, so the SessionStart hook and the shared cleanup-worktrees
// workflow can never drift on the rules that actually delete things.
//
// The one non-negotiable here is the empty-leftover-folder sweep: on Windows `git worktree
// remove` cannot delete a folder while a session is cwd'd inside it, so it deregisters the
// worktree and empties the files but leaves the now-empty directory behind. Once that session
// ends the folder unlocks and the next run removes the husk. The rule is deliberately strict:
// only a COMPLETELY EMPTY, git-UNREGISTERED folder that is not a protected cwd is removed. A
// still-busy folder stays locked (rmdir throws, we skip it); any non-empty stub is reported,
// never deleted - that is someone's working tree until proven otherwise.

import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path with forward slashes, for cross-checkout comparison on Windows. */
export function normalize(path) {
  return resolve(path).replaceAll('\\', '/');
}

/** Case-insensitive path equality (Windows filesystems are case-insensitive). */
export function samePath(a, b) {
  return normalize(a).toLowerCase() === normalize(b).toLowerCase();
}

/**
 * How long a reap gets before the removal goes ahead without it.
 *
 * The reap asks each broker to shut down and gives the family five seconds to go, so a worktree
 * with several finished delegations can legitimately take a few of those. Thirty seconds is well
 * past that and still bounded: cleanup runs unattended at night, and a step that can hang is a
 * cleanup that silently stops running.
 */
const REAP_TIMEOUT_MS = 30_000;

/** The reaper's exit code for "a delegation in this workspace has not finished" - not a failure. */
export const REAP_BUSY = 3;

/**
 * Close the Codex delegation families that belong to a worktree about to be removed.
 *
 * WHY THE CLEANUP OWNS THIS AT ALL. A delegation's `codex.exe` runs with the worktree as its
 * working directory, and its parent links are cut within seconds of the launch - so a worktree
 * could be torn down while the family it started went on running, which is exactly how three
 * trees survived their sessions on 2026-09-09. On Windows a live process holding that directory
 * is also why a removal comes back "folder may be locked/busy", so this runs BEFORE the removal
 * rather than after it.
 *
 * NO NEW MACHINERY, AND NO NEW JUDGEMENT. It is one more caller of `codex-rescue.mjs reap`, which
 * closes only what a delegation RECORDED launching, only once every delegation in that workspace
 * has an outcome, only while the machine still agrees each pid is that same process, and never
 * anything belonging to the owner's desktop Codex app. `--workspace` keeps it to this worktree's
 * own delegations; nobody else's are its business.
 *
 * Never throws and never blocks a removal: a reap that fails leaves memory behind, which is what
 * was happening anyway, while a cleanup that throws leaves the worktree.
 */
export function reapDelegationTrees(worktreePath, { run = spawnSync } = {}) {
  const script = join(dirname(fileURLToPath(import.meta.url)), 'codex-rescue.mjs');
  if (!worktreePath || !existsSync(script)) return { ok: false, busy: false, output: 'no reaper to run' };
  try {
    // `--cwd` and `--workspace` name the same directory on purpose: the first decides whose JOB
    // RECORDS are read, the second whose PROCESSES are swept. Left to itself the reaper would
    // take its cwd from this cleanup - which runs in the primary checkout - and rewrite the
    // primary's job store under a command that says it is scoped to a worktree.
    const res = run(process.execPath, [script, 'reap', '--cwd', worktreePath, '--workspace', worktreePath], {
      encoding: 'utf8',
      timeout: REAP_TIMEOUT_MS,
      windowsHide: true,
    });
    return {
      ok: res?.status === 0,
      // Exit 3: a delegation in this worktree has NOT finished. Nothing failed - there is simply
      // work running in the directory the caller is about to delete.
      busy: res?.status === REAP_BUSY,
      output: `${res?.stdout ?? ''}${res?.stderr ?? ''}`.trim() || 'nothing to collect',
    };
  } catch (error) {
    return { ok: false, busy: false, output: error?.message ?? 'the reaper could not be run' };
  }
}

/** Run git with the given args in `cwd`; return { ok, stdout, stderr } all trimmed. */
export function git(args, cwd) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return {
    ok: res.status === 0,
    stdout: typeof res.stdout === 'string' ? res.stdout.trim() : '',
    stderr: typeof res.stderr === 'string' ? res.stderr.trim() : '',
  };
}

/**
 * Every registered worktree for the checkout containing `cwd`, primary first, as
 * `{ root, head, branch, detached }`. One `git worktree list` already knows each worktree's
 * HEAD and branch, so nothing downstream needs a per-worktree `rev-parse` to learn them.
 */
export function worktreeEntries(cwd) {
  const res = git(['worktree', 'list', '--porcelain'], cwd);
  if (!res.ok) return [];
  const entries = [];
  for (const line of res.stdout.split('\n').map((l) => l.trim())) {
    if (line.startsWith('worktree ')) {
      entries.push({ root: normalize(line.slice('worktree '.length)), head: null, branch: null, detached: false });
      continue;
    }
    const current = entries.at(-1);
    if (!current) continue;
    if (line.startsWith('HEAD ')) current.head = line.slice('HEAD '.length);
    else if (line.startsWith('branch ')) current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
    else if (line === 'detached') current.detached = true;
  }
  return entries;
}

/** All registered worktree roots for the checkout containing `cwd`, primary first. */
export function worktreeRoots(cwd) {
  return worktreeEntries(cwd).map((entry) => entry.root);
}

/**
 * Inspect leftover worktree folders without changing them.
 *
 * A folder is removed ONLY when all of these hold:
 *   - it is not a registered git worktree (`registeredRoots`),
 *   - it is not a protected path (`protect`, e.g. the caller's own cwd),
 *   - it is completely empty.
 *
 * Returns { empty, nonEmpty, unreadable }. Never throws - hygiene must never break session
 * start or the cleanup command.
 */
export function inspectLeftoverFolders({ primaryRoot, registeredRoots, protect = [] }) {
  const empty = [];
  const nonEmpty = [];
  const unreadable = [];
  try {
    const worktreesDir = join(primaryRoot, '.claude', 'worktrees');
    if (!existsSync(worktreesDir)) return { empty, nonEmpty, unreadable };
    for (const name of readdirSync(worktreesDir)) {
      const dir = normalize(join(worktreesDir, name));
      if (registeredRoots.some((r) => samePath(r, dir))) continue; // a live registered worktree
      if (protect.some((p) => samePath(p, dir))) continue; // never touch a protected path
      let entries;
      try {
        entries = readdirSync(dir);
      } catch {
        unreadable.push(dir);
        continue;
      }
      if (entries.length > 0) {
        nonEmpty.push(dir); // stub with files - report only, never auto-delete
        continue;
      }
      empty.push(dir);
    }
  } catch {
    // Best-effort: a surprise here must never propagate.
  }
  return { empty, nonEmpty, unreadable };
}

// --- The unattended sweep: where it keeps its state, how it is started, and its lock ----------
//
// Finished work cleans itself up (docs/work-specs/worktree-lifecycle/spec.md): session start and
// every landing START `cleanup-worktrees.mjs --unattended` in the background. These helpers are
// here rather than in that file because the SessionStart hook calls them, and it must not load
// the whole sweep to decide that a sweep ran ten minutes ago.

/** How often the unattended sweep may run at most. Its own idle holds are hours long. */
export const SWEEP_THROTTLE_MS = 30 * 60_000;

/** A lock older than this belongs to a sweep that died; a live one finishes in minutes. */
const SWEEP_LOCK_MAX_AGE_MS = 2 * 60 * 60_000;

/**
 * The directory the sweep keeps its lock, its start stamp and its last result in:
 * `<git-common-dir>/noacg-cleanup`, or `NOACG_CLEANUP_STATE_DIR`. Null outside a checkout.
 */
export function cleanupStateDir(primaryRoot, { env = process.env } = {}) {
  if (env.NOACG_CLEANUP_STATE_DIR) return resolve(env.NOACG_CLEANUP_STATE_DIR);
  if (!primaryRoot) return null;
  const res = git(['rev-parse', '--git-common-dir'], primaryRoot);
  if (!res.ok || !res.stdout) return null;
  return join(resolve(primaryRoot, res.stdout), 'noacg-cleanup');
}

/** When the last unattended sweep STARTED, as epoch ms, or null. */
export function lastSweepStart(stateDir) {
  try {
    return statSync(join(stateDir, 'last-start')).mtimeMs;
  } catch {
    return null;
  }
}

/** Mark that a sweep started now - the throttle reads this. */
export function markSweepStart(stateDir) {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, 'last-start'), `${new Date().toISOString()}\n`);
}

/**
 * Start the unattended sweep in the background, unless one started within SWEEP_THROTTLE_MS or
 * `NOACG_NO_AUTO_CLEANUP` is set (the off switch, and what tests set). It runs from the PRIMARY
 * checkout, as every sweep must, with the copy of the script that sits next to this file.
 * Returns `{ started, why }` and never throws: it is called from a hook and from the landing
 * watcher, and neither may fail because housekeeping could not start.
 */
export function triggerUnattendedSweep({
  primaryRoot,
  script = join(dirname(fileURLToPath(import.meta.url)), 'cleanup-worktrees.mjs'),
  env = process.env,
  now = Date.now(),
  start = spawn,
} = {}) {
  try {
    if (env.NOACG_NO_AUTO_CLEANUP) return { started: false, why: 'NOACG_NO_AUTO_CLEANUP is set' };
    if (!primaryRoot || !existsSync(script)) return { started: false, why: 'no primary checkout or no sweep script' };
    const stateDir = cleanupStateDir(primaryRoot, { env });
    if (!stateDir) return { started: false, why: 'no git common dir' };
    // A stamp a little in the future is the file clock rounding ahead of ours; one far in the
    // future means the clock moved, and must not hold every later sweep off.
    const last = lastSweepStart(stateDir);
    const age = last === null ? null : now - last;
    if (age !== null && age > -60_000 && age < SWEEP_THROTTLE_MS) {
      return { started: false, why: `a sweep started ${Math.max(0, Math.round(age / 60_000))} minute(s) ago` };
    }
    // Stamped HERE, before the child exists, so a second trigger a moment later (two sessions
    // starting together, a landing during a session start) does not spawn a second sweep that
    // would only find the lock taken.
    markSweepStart(stateDir);
    const child = start(process.execPath, [script, '--unattended'], {
      cwd: primaryRoot,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env,
    });
    child?.unref?.();
    return { started: true, why: null };
  } catch (error) {
    return { started: false, why: error?.message ?? String(error) };
  }
}

/** Is a process with this pid still running? EPERM means yes, under another user. */
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

/**
 * Take the sweep lock, shared by `--apply` and `--unattended`, so two sweeps never decide about
 * the same worktree at once. Returns `{ ok, release, why }`. A lock whose process is gone, or
 * that is older than any sweep runs, is taken over.
 */
export function acquireSweepLock(stateDir, { now = Date.now() } = {}) {
  mkdirSync(stateDir, { recursive: true });
  const path = join(stateDir, 'sweep.lock');
  const mine = { pid: process.pid, at: now, token: randomUUID() };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      writeFileSync(path, JSON.stringify(mine), { flag: 'wx' });
      const release = () => {
        try {
          if (JSON.parse(readFileSync(path, 'utf8')).token === mine.token) rmSync(path, { force: true });
        } catch {
          // already gone
        }
      };
      return { ok: true, release, why: null };
    } catch (error) {
      if (error?.code !== 'EEXIST') return { ok: false, release: () => {}, why: error?.message ?? String(error) };
    }
    let held = null;
    try {
      held = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      // unreadable: judged by age below
    }
    const age = held?.at ? now - held.at : SWEEP_LOCK_MAX_AGE_MS + 1;
    if (held?.pid && pidAlive(held.pid) && age < SWEEP_LOCK_MAX_AGE_MS) {
      return { ok: false, release: () => {}, why: `another worktree cleanup is running (pid ${held.pid})` };
    }
    try {
      const dead = `${path}.${process.pid}.${Date.now()}.dead`;
      renameSync(path, dead);
      rmSync(dead, { force: true });
    } catch {
      return { ok: false, release: () => {}, why: 'another cleanup took over the lock first' };
    }
  }
  return { ok: false, release: () => {}, why: 'could not take the cleanup lock' };
}

/**
 * Remove only folders that a fresh read-only inspection still classifies as empty and
 * unregistered. `rmdirSync` is the final non-empty backstop.
 */
export function sweepEmptyLeftoverFolders(options) {
  const removed = [];
  const locked = [];
  const assessment = inspectLeftoverFolders(options);
  for (const dir of assessment.empty) {
    try {
      rmdirSync(dir);
      removed.push(dir);
    } catch {
      locked.push(dir);
    }
  }
  return {
    removed,
    nonEmpty: assessment.nonEmpty,
    locked: [...assessment.unreadable, ...locked],
  };
}
