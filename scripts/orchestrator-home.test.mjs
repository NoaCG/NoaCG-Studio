// What the orchestrator's permanent home must do on a machine where it has never run, and must
// NOT do on one where it already has.
//
// Every test builds its own bare origin + clone in a temp directory and passes an explicit
// `path`, so no test can create, move or fast-forward the real `.claude/worktrees/orchestrator`.
// That is the whole reason `ensureOrchestratorHome` takes a path override at all.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  HOME_RELATIVE_PATH,
  ensureOrchestratorHome,
  formatResult,
  isUsable,
  primaryRoot,
} from './orchestrator-home.mjs';
import { scanActivity } from './worktree-activity.mjs';
import { samePath, worktreeEntries } from './worktree-cleanup-lib.mjs';

function runGit(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  assert.equal(
    result.status,
    0,
    `git ${args.join(' ')} failed:\n${result.stderr || result.stdout}`,
  );
  return result.stdout.trim();
}

function makeRepo(t) {
  const root = mkdtempSync(join(tmpdir(), 'noacg-orchestrator-home-'));
  const origin = join(root, 'origin.git');
  const primary = join(root, 'repo');
  runGit(root, 'init', '--bare', '--initial-branch=main', origin);
  runGit(root, 'clone', origin, primary);
  runGit(primary, 'config', 'user.name', 'Orchestrator Home Tests');
  runGit(primary, 'config', 'user.email', 'orchestrator-home@example.invalid');
  writeFileSync(join(primary, 'README.md'), 'initial\n');
  runGit(primary, 'add', 'README.md');
  runGit(primary, 'commit', '-m', 'Initial commit');
  runGit(primary, 'push', '-u', 'origin', 'main');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { origin, primary, root, home: join(primary, 'sandbox-home') };
}

/** Land one more commit on origin/main, without touching the primary checkout's own HEAD. */
function advanceOrigin(repo, message = 'Second commit') {
  const sender = join(repo.root, `sender-${Math.random().toString(36).slice(2, 8)}`);
  runGit(repo.root, 'clone', repo.origin, sender);
  runGit(sender, 'config', 'user.name', 'Orchestrator Home Tests');
  runGit(sender, 'config', 'user.email', 'orchestrator-home@example.invalid');
  writeFileSync(join(sender, `${message}.txt`), `${message}\n`);
  runGit(sender, 'add', '-A');
  runGit(sender, 'commit', '-m', message);
  runGit(sender, 'push', 'origin', 'main');
  return runGit(sender, 'rev-parse', 'HEAD');
}

function entryFor(cwd, path) {
  return worktreeEntries(cwd).find((entry) => samePath(entry.root, path)) ?? null;
}

// --- Creation ---------------------------------------------------------------------------------

test('creates the home detached at origin/main when it does not exist', (t) => {
  const repo = makeRepo(t);
  const expected = runGit(repo.primary, 'rev-parse', 'origin/main');

  const result = ensureOrchestratorHome({ cwd: repo.primary, path: repo.home });

  assert.equal(result.status, 'created');
  assert.equal(result.head, expected);
  assert.ok(isUsable(result.status));
  assert.ok(existsSync(join(repo.home, 'README.md')));

  const entry = entryFor(repo.primary, repo.home);
  assert.ok(entry, 'git must know the new path as a worktree');
  assert.equal(entry.detached, true, 'the home is always detached');
  assert.equal(entry.branch, null, 'the home never holds a branch');
});

test('creating the home twice is a no-op the second time', (t) => {
  const repo = makeRepo(t);
  const first = ensureOrchestratorHome({ cwd: repo.primary, path: repo.home });
  const second = ensureOrchestratorHome({ cwd: repo.primary, path: repo.home });

  assert.equal(first.status, 'created');
  assert.equal(second.status, 'current');
  assert.equal(second.head, first.head);
});

// --- Refreshing -------------------------------------------------------------------------------

test('fast-forwards a home that is behind origin/main', (t) => {
  const repo = makeRepo(t);
  ensureOrchestratorHome({ cwd: repo.primary, path: repo.home });
  const landed = advanceOrigin(repo, 'usage-meter');

  const result = ensureOrchestratorHome({ cwd: repo.primary, path: repo.home });

  assert.equal(result.status, 'updated');
  assert.equal(result.head, landed);
  assert.notEqual(result.from, landed);
  // The point of the whole exercise: the file that landed after the worktree was cut is readable
  // in it without anyone pulling it out of origin/main by hand.
  assert.ok(existsSync(join(repo.home, 'usage-meter.txt')));
  assert.equal(entryFor(repo.primary, repo.home).detached, true);
});

test('a home that is already current reports current and moves nothing', (t) => {
  const repo = makeRepo(t);
  ensureOrchestratorHome({ cwd: repo.primary, path: repo.home });
  const before = runGit(repo.home, 'rev-parse', 'HEAD');

  const result = ensureOrchestratorHome({ cwd: repo.primary, path: repo.home });

  assert.equal(result.status, 'current');
  assert.equal(runGit(repo.home, 'rev-parse', 'HEAD'), before);
});

// --- The cases where it must NOT act ----------------------------------------------------------

test('a dirty home is left alone, reported, and never reset over', (t) => {
  const repo = makeRepo(t);
  ensureOrchestratorHome({ cwd: repo.primary, path: repo.home });
  const before = runGit(repo.home, 'rev-parse', 'HEAD');
  writeFileSync(join(repo.home, 'owner-notes.txt'), 'do not delete me\n');
  advanceOrigin(repo, 'landed-while-dirty');

  const result = ensureOrchestratorHome({ cwd: repo.primary, path: repo.home });

  assert.equal(result.status, 'dirty');
  assert.equal(runGit(repo.home, 'rev-parse', 'HEAD'), before, 'HEAD must not move');
  assert.ok(existsSync(join(repo.home, 'owner-notes.txt')), 'the file must survive');
  assert.match(result.message, /uncommitted changes/);
  // Still usable - stale reads beat no home at all, as long as the staleness is said out loud.
  assert.ok(isUsable(result.status));
  assert.match(formatResult(result).join('\n'), /may be stale/);
});

test('a home that somehow holds a branch is left alone, not detached under the session', (t) => {
  const repo = makeRepo(t);
  runGit(repo.primary, 'worktree', 'add', '-b', 'claude/stray', repo.home, 'main');

  const result = ensureOrchestratorHome({ cwd: repo.primary, path: repo.home });

  assert.equal(result.status, 'branched');
  assert.ok(!isUsable(result.status));
  assert.equal(entryFor(repo.primary, repo.home).branch, 'claude/stray');
  assert.match(result.message, /never holds a branch/);
});

test('a stale directory git does not know is refused, never clobbered', (t) => {
  const repo = makeRepo(t);
  mkdirSync(repo.home, { recursive: true });
  writeFileSync(join(repo.home, 'left-behind.txt'), 'someone was here\n');

  const result = ensureOrchestratorHome({ cwd: repo.primary, path: repo.home });

  assert.equal(result.status, 'blocked');
  assert.ok(!isUsable(result.status));
  assert.ok(existsSync(join(repo.home, 'left-behind.txt')), 'the folder must be untouched');
  assert.equal(entryFor(repo.primary, repo.home), null);
  assert.match(formatResult(result).join('\n'), /UNAVAILABLE/);
});

test('a registered home whose directory is gone names the fix instead of a blank git error', (t) => {
  const repo = makeRepo(t);
  ensureOrchestratorHome({ cwd: repo.primary, path: repo.home });
  rmSync(repo.home, { recursive: true, force: true }); // git still has the registration

  const result = ensureOrchestratorHome({ cwd: repo.primary, path: repo.home });

  assert.equal(result.status, 'blocked');
  assert.ok(!isUsable(result.status));
  assert.match(result.message, /directory is gone/);
  assert.match(result.message, /git worktree prune/);
  // The registration is the user's to prune - this script never decides that for the repo.
  assert.ok(entryFor(repo.primary, repo.home), 'the stale registration must be left in place');
});

test('git refusing to add the worktree reports the real git error, with no retry', (t) => {
  const repo = makeRepo(t);
  // Ask for a home BELOW a tracked file, which git cannot create a worktree at. Whatever git
  // says about that is the message the caller has to see: no swallowing, no second attempt.
  const impossible = join(repo.primary, 'README.md', 'home');

  const result = ensureOrchestratorHome({ cwd: repo.primary, path: impossible });

  assert.equal(result.status, 'failed');
  assert.ok(!isUsable(result.status));
  assert.ok(result.gitError && result.gitError.length > 0, 'the git error must be carried out');
  assert.match(result.message, /git worktree add refused/);
});

test('an unresolvable remote ref fails with the git error and creates nothing', (t) => {
  const repo = makeRepo(t);

  const result = ensureOrchestratorHome({
    cwd: repo.primary,
    path: repo.home,
    branch: 'no-such-branch',
    fetch: false,
  });

  assert.equal(result.status, 'failed');
  assert.match(result.message, /cannot resolve origin\/no-such-branch/);
  assert.ok(!existsSync(repo.home));
});

// --- Wiring -----------------------------------------------------------------------------------

test('a failed fetch warns but still produces a home from the ref already present', (t) => {
  const repo = makeRepo(t);

  const result = ensureOrchestratorHome({
    cwd: repo.primary,
    path: repo.home,
    remote: 'no-such-remote',
    branch: 'main',
  });

  // The remote does not exist, so both the fetch and the ref lookup fail - the fetch failure is
  // reported as a warning rather than swallowed, which is the half that must never regress.
  assert.equal(result.fetched, false);
  assert.ok(result.fetchError, 'a failed fetch must be carried in the result');
  assert.match(formatResult(result).join('\n'), /WARN {2}fetch failed/);
});

test('the home is never reported as work in flight, even while local main lags', async (t) => {
  const repo = makeRepo(t);
  // The DEFAULT path is safe here: `cwd` is a throwaway clone, so this creates
  // `<temp>/repo/.claude/worktrees/orchestrator` and never the machine's real one.
  const created = ensureOrchestratorHome({ cwd: repo.primary });
  assert.equal(created.status, 'created');

  // Land something on origin/main and refresh the home, WITHOUT pulling local `main` - the exact
  // window in which a detached worktree at origin/main otherwise reads as in-flight work.
  advanceOrigin(repo, 'landed-elsewhere');
  assert.equal(ensureOrchestratorHome({ cwd: repo.primary }).status, 'updated');

  const scanned = await scanActivity(repo.primary);
  assert.deepEqual(
    scanned.worktrees.filter((entry) => samePath(entry.root, created.path)),
    [],
    'the orchestrator home must never appear as another session\'s work',
  );
});

test('the default path is the one permanent home under the primary checkout', (t) => {
  const repo = makeRepo(t);
  assert.equal(HOME_RELATIVE_PATH, '.claude/worktrees/orchestrator');
  // Resolved from a LINKED worktree, the default must still be the primary checkout's path -
  // one home per repository, never one per session.
  const linked = join(repo.primary, '.claude', 'worktrees', 'some-session');
  mkdirSync(join(repo.primary, '.claude', 'worktrees'), { recursive: true });
  runGit(repo.primary, 'worktree', 'add', '-b', 'claude/some-session', linked, 'main');
  assert.ok(samePath(primaryRoot(linked), repo.primary));
});
