// Only disposable marketplace clones, never the installed cache or archived work.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  appendFileSync,
  closeSync,
  existsSync,
  lstatSync,
  openSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listProcesses } from './agent-processes.mjs';

export const STAGING_RETENTION_MS = 7 * 24 * 60 * 60_000;
const MAX_REMOVALS = 5;
const normalize = (path) => resolve(path).replaceAll('\\', '/').toLowerCase();
export const stagingRoot = () =>
  join(process.env.CODEX_HOME || join(homedir(), '.codex'), '.tmp', 'marketplaces', '.staging');

function git(path, args) {
  const out = spawnSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', path, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GCM_INTERACTIVE: 'Never' },
  });
  return out.status === 0 ? out.stdout.trim() : null;
}

function remoteHeads(path) {
  const result = git(path, ['ls-remote', 'origin', 'HEAD', 'refs/heads/*']);
  if (result === null) return null;
  return result
    .split('\n')
    .map((line) => line.split(/\s+/)[0])
    .filter((sha) => /^[a-f0-9]{40}$/.test(sha));
}

// Read metadata only, and refuse links rather than following them outside the clone.
function inventory(path) {
  const stack = [path];
  let newest = 0;
  let bytes = 0;
  let files = 0;
  while (stack.length) {
    const current = stack.pop();
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error('contains a link or junction');
    if (stat.isDirectory()) stack.push(...readdirSync(current).map((name) => join(current, name)));
    else if (stat.isFile()) {
      newest = Math.max(newest, stat.mtimeMs, stat.ctimeMs);
      bytes += stat.size;
      files++;
    } else throw new Error('contains a special file');
    if (files + stack.length > 100_000) throw new Error('inventory exceeds the bounded scan');
  }
  return { newest, bytes, files };
}

function githubContains(origin, sha, tip) {
  const match = /^https:\/\/github\.com\/(openai|NoaCG)\/([A-Za-z0-9_.-]+)$/i.exec(origin ?? '');
  if (!match) return false;
  const repo = match[2].replace(/\.git$/, '');
  const out = spawnSync('gh', ['api', `repos/${match[1]}/${repo}/compare/${sha}...${tip}`, '--jq', '[.base_commit.sha,.merge_base_commit.sha,.status]|@tsv'], {
    encoding: 'utf8', windowsHide: true, timeout: 15_000,
    env: { ...process.env, GH_PROMPT_DISABLED: '1' },
  });
  if (out.status !== 0) return false;
  const [base, ancestor, status] = out.stdout.trim().split('\t');
  return base === sha && ancestor === sha && ['ahead', 'identical'].includes(status);
}

function inspectClone(path, now, heads, contains) {
  if (!lstatSync(path).isDirectory() || !lstatSync(join(path, '.git')).isDirectory())
    throw new Error('not an ordinary Git clone');
  if (
    [
      'MERGE_HEAD',
      'CHERRY_PICK_HEAD',
      'REVERT_HEAD',
      'BISECT_LOG',
      'rebase-merge',
      'rebase-apply',
      'index.lock',
      'config.lock',
      'shallow.lock',
      'packed-refs.lock',
    ].some((name) => existsSync(join(path, '.git', name)))
  )
    throw new Error('Git operation or lock in progress');
  const state = inventory(path);
  if (now - state.newest < STAGING_RETENTION_MS)
    throw new Error('recently changed; retained for at least seven days');
  const origin = git(path, ['remote', 'get-url', 'origin']);
  // The known provider marketplaces only. Other origins require manual assessment.
  if (!/^https:\/\/github\.com\/(?:openai|NoaCG)\/[A-Za-z0-9_.-]+(?:\.git)?$/i.test(origin ?? ''))
    throw new Error('unrecognized marketplace origin');
  if (git(path, ['status', '--porcelain=v1', '--untracked-files=all', '--ignored=matching']) !== '')
    throw new Error('dirty, ignored or unreadable content');
  if (git(path, ['rev-parse', '--show-superproject-working-tree']) !== '')
    throw new Error('submodule or unreadable state');
  if (git(path, ['config', '--get', 'core.worktree']) !== null)
    throw new Error('external working-tree configuration');
  if (
    git(path, ['worktree', 'list', '--porcelain'])
      ?.split('\n')
      .filter((line) => line.startsWith('worktree ')).length !== 1
  )
    throw new Error('shared or unreadable worktree registration');
  const head = git(path, ['rev-parse', 'HEAD']);
  const remote = heads(path);
  if (!head || !Array.isArray(remote) || remote.length === 0)
    throw new Error('remote backup could not be verified');
  const known = remote.filter((sha) => /^[a-f0-9]{40}$/.test(sha) && git(path, ['cat-file', '-t', sha]) === 'commit');
  // A current upstream tip may be newer than this old clone. Prove the cached
  // upstream commits through GitHub instead of fetching/mutating the candidate.
  const unbacked = git(path, ['rev-list', '--count', 'HEAD', '--all', '--reflog', '--not', '--remotes=origin']);
  if (unbacked !== '0') throw new Error('local commits or refs are not backed by the remote');
  const oldTips = git(path, ['for-each-ref', '--format=%(objectname)', 'refs/remotes/origin']);
  if (oldTips === null) throw new Error('remote-tracking refs unreadable');
  for (const sha of new Set(oldTips.split('\n').filter(Boolean))) {
    if (known.some((tip) => git(path, ['merge-base', '--is-ancestor', sha, tip]) !== null)) continue;
    if (!/^[a-f0-9]{40}$/.test(sha) || !contains(origin, sha, remote[0])) throw new Error('current remote ancestry could not be verified');
    known.push(sha);
  }
  if (!known.length || git(path, ['rev-list', '--count', 'HEAD', '--all', '--reflog', '--not', ...known]) !== '0') throw new Error('local commits or refs are not backed by the current remote');
  return { ...state, head, backedBy: known };
}

/** Called by the existing sweep under its lock; standalone mode has a separate exclusive lock. */
export function cleanupStaging({
  root = stagingRoot(),
  apply = false,
  now = Date.now(),
  platform = process.platform,
  list = listProcesses,
  heads = remoteHeads,
  contains = githubContains,
} = {}) {
  root = resolve(root);
  const result = { removed: [], kept: [], errors: [] };
  if (!existsSync(root)) return result;
  let lock;
  let requests = 0;
  const boundedHeads = (path) => (++requests <= MAX_REMOVALS ? heads(path) : null);
  const boundedContains = (...args) => ++requests <= MAX_REMOVALS && contains(...args);
  const lockPath = join(root, '.noacg-cleanup.lock');
  try {
    if (lstatSync(root).isSymbolicLink()) throw new Error('staging root is a link');
    if (apply) {
      if (platform !== 'win32')
        throw new Error('automatic staging deletion requires Windows in-use protection');
      lock = openSync(lockPath, 'wx');
    }
    const processes = list();
    if (!processes?.ok || !Array.isArray(processes.processes))
      throw new Error('process inventory unavailable');
    for (const name of readdirSync(root).sort()) {
      if (!/^marketplace-upgrade-[A-Za-z0-9]{6}$/.test(name)) continue;
      const path = resolve(root, name);
      const row = { path };
      if (normalize(dirname(path)) !== normalize(root)) throw new Error('candidate escaped staging root');
      try {
        const inUse = processes.processes.some((p) =>
          [p.command, p.cwd].some(
            (value) => value && String(value).replaceAll('\\', '/').toLowerCase().includes(normalize(path)),
          ),
        );
        if (inUse) throw new Error('referenced by a running process');
        if (apply && result.removed.length >= MAX_REMOVALS) {
          result.kept.push({ ...row, why: 'bounded sweep limit; next sweep will reassess' });
          continue;
        }
        const state = inspectClone(path, now, boundedHeads, boundedContains);
        if (!apply) {
          result.kept.push({ ...row, ...state, why: 'eligible; dry run' });
          continue;
        }
        const parked = resolve(root, `.noacg-removing-${name}-${randomUUID()}`);
        const journal = join(root, 'noacg-cleanup.jsonl');
        // Persist the recovery location before the first mutation; failure keeps the clone.
        appendFileSync(
          journal,
          `${JSON.stringify({ at: new Date(now).toISOString(), path, parked, head: state.head, state: 'planned' })}\n`,
        );
        renameSync(path, parked); // Windows refuses this while a process holds the directory.
        row.parked = parked;
        try {
          // Recheck local state against the remote heads observed moments ago.
          const status = git(parked, [
            'status',
            '--porcelain=v1',
            '--untracked-files=all',
            '--ignored=matching',
          ]);
          const meta = inventory(parked);
          const unique = git(parked, ['rev-list', '--count', 'HEAD', '--all', '--reflog', '--not', ...state.backedBy]);
          if (
            git(parked, ['rev-parse', 'HEAD']) !== state.head ||
            unique !== '0' ||
            status !== '' ||
            meta.bytes !== state.bytes ||
            meta.files !== state.files ||
            meta.newest !== state.newest
          )
            throw new Error('clone changed while parking');
        } catch (changed) {
          if (!existsSync(path)) {
            renameSync(parked, path);
            delete row.parked;
          }
          throw changed;
        }
        // parked is a fresh direct child of the exact staging root and has passed a second inventory.
        rmSync(parked, { recursive: true });
        delete row.parked;
        const removed = { ...row, bytes: state.bytes, head: state.head };
        result.removed.push(removed);
        appendFileSync(
          journal,
          `${JSON.stringify({ at: new Date(now).toISOString(), ...removed, state: 'removed' })}\n`,
        );
      } catch (error) {
        if (result.removed.some((item) => item.path === path)) {
          result.errors.push(`Removed ${path}, but the completion receipt failed: ${error.message}`);
          continue;
        }
        if (row.parked && existsSync(row.parked))
          result.errors.push(`Incomplete removal at ${row.parked}: ${error.message}`);
        result.kept.push({ ...row, why: error.message });
      }
    }
  } catch (error) {
    result.errors.push(error.message);
  } finally {
    if (lock !== undefined) {
      closeSync(lock);
      try {
        unlinkSync(lockPath);
      } catch (error) {
        result.errors.push(`Could not release staging lock: ${error.message}`);
      }
    }
  }
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  console.log(JSON.stringify(cleanupStaging({ apply: process.argv.includes('--apply') }), null, 2));
}
