// The unattended worktree sweep: finished work goes by itself, and nothing else does.
// guards: scripts/cleanup-worktrees.mjs, scripts/worktree-cleanup-lib.mjs, scripts/session-liveness.mjs
//
// docs/work-specs/worktree-lifecycle/spec.md. Every case builds a real repository with a local
// bare "origin" and lands branches the way the merge queue does: origin/main moves, the local main
// does not, and GitHub deletes the branch at merge. The owner's rules (2026-10-08): a landed agent
// worktree goes after 2 quiet hours, any other landed worktree after 24, one with no commits of its
// own after 3 days; never one a process is in; never one outside .claude/worktrees; never anything
// that needs a person.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join } from 'node:path';
import test from 'node:test';

import { closeAbandonedProcesses, listProcesses } from './agent-processes.mjs';
import { runUnattended, unattendedRule, UNATTENDED_IDLE_MINUTES } from './cleanup-worktrees.mjs';
import { projectDirName, resetSessionScanCache } from './session-liveness.mjs';
import {
  acquireSweepLock,
  lastSweepStart,
  markSweepStart,
  normalize,
  SWEEP_THROTTLE_MS,
  triggerUnattendedSweep,
} from './worktree-cleanup-lib.mjs';

const NO_INVENTORY = Object.freeze({ available: false, rows: [] });
const noDelegations = () => ({ status: 0, stdout: 'No stale Codex jobs found.', stderr: '' });
const HOUR = 60;

function runGit(cwd, ...args) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  assert.equal(res.status, 0, `git ${args.join(' ')} failed:\n${res.stderr || res.stdout}`);
  return res.stdout.trim();
}

function makeRepo(t) {
  const root = mkdtempSync(join(tmpdir(), 'noacg-unattended-'));
  const origin = join(root, 'origin.git');
  const primary = join(root, 'repo');
  runGit(root, 'init', '--bare', '--initial-branch=main', origin);
  runGit(root, 'clone', origin, primary);
  runGit(primary, 'config', 'user.name', 'Unattended Tests');
  runGit(primary, 'config', 'user.email', 'unattended-tests@example.invalid');
  writeFileSync(join(primary, 'README.md'), 'initial\n');
  writeFileSync(join(primary, '.gitignore'), '.claude/\n');
  runGit(primary, 'add', '.');
  runGit(primary, 'commit', '-m', 'Initial commit');
  runGit(primary, 'push', '-u', 'origin', 'main');
  runGit(primary, 'fetch', 'origin');

  const previousArchive = process.env.NOACG_CLEANUP_ARCHIVE;
  process.env.NOACG_CLEANUP_ARCHIVE = join(root, 'archive');
  resetSessionScanCache();
  const repo = { root, primary, stateDir: join(root, 'cleanup-state'), projects: join(root, 'projects'), beforeRemove: null };
  t.after(async () => {
    if (previousArchive === undefined) delete process.env.NOACG_CLEANUP_ARCHIVE;
    else process.env.NOACG_CLEANUP_ARCHIVE = previousArchive;
    resetSessionScanCache();
    await repo.beforeRemove?.();
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });
  return repo;
}

/** A worktree the way the harness makes one: from origin/main, a branch with NO upstream. */
function addWorktree(primary, name, branch = `claude/${name}`, parent = join(primary, '.claude', 'worktrees')) {
  const path = join(parent, name);
  mkdirSync(parent, { recursive: true });
  runGit(primary, 'worktree', 'add', '--no-track', '-b', branch, path, 'origin/main');
  return { path, branch };
}

/**
 * Land a worktree's branch the way the queue does: a commit, pushed; origin/main moves to it; the
 * GitHub branch is deleted at merge; the LOCAL main is left behind.
 */
function land(primary, wt) {
  writeFileSync(join(wt.path, `${wt.branch.replace(/\W/g, '-')}.txt`), 'work\n');
  runGit(wt.path, 'add', '.');
  runGit(wt.path, 'commit', '-m', `Work on ${wt.branch}`);
  runGit(wt.path, 'push', 'origin', `${wt.branch}:${wt.branch}`);
  runGit(primary, 'fetch', 'origin');
  runGit(primary, 'push', 'origin', `refs/remotes/origin/${wt.branch}:refs/heads/main`);
  runGit(primary, 'push', 'origin', '--delete', wt.branch);
  runGit(primary, 'fetch', 'origin', '--prune');
}

/** A Claude Code transcript for `path`, last written `minutesAgo` minutes ago. */
function sessionLastActive(projects, path, minutesAgo) {
  const dir = join(projects, projectDirName(path));
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'session.jsonl');
  writeFileSync(file, `${JSON.stringify({ cwd: path })}\n`);
  const when = (Date.now() - minutesAgo * 60_000) / 1000;
  utimesSync(file, when, when);
}

/** Its session AND its git activity last happened `minutesAgo` minutes ago. */
function quiet(repo, path, minutesAgo) {
  sessionLastActive(repo.projects, path, minutesAgo);
  const when = (Date.now() - minutesAgo * 60_000) / 1000;
  for (const name of ['logs/HEAD', 'HEAD']) {
    const located = runGit(path, 'rev-parse', '--git-path', name);
    const file = isAbsolute(located) ? located : join(path, located);
    if (existsSync(file)) utimesSync(file, when, when);
  }
}

/** No process to close: what agents leave running is judged in agent-processes.test.mjs and below. */
const nothingRunning = () => ({ ok: true, supported: true, closed: [], kept: [], failed: [], why: null });
const noneAbandoned = () => ({ ok: true, closed: [], failed: [], why: null });

/** `realProcesses` lets the sweep list and close this machine's processes for real. */
function sweep(repo, { landed = [], jobs = [], realProcesses = false, processes = nothingRunning, abandoned = noneAbandoned } = {}) {
  resetSessionScanCache();
  return runUnattended(repo.primary, {
    stateDir: repo.stateDir,
    landings: () => landed.map((branch) => ({ branch })),
    jobs: () => jobs,
    liveness: { root: repo.projects, inventory: NO_INVENTORY },
    abandoned: realProcesses ? undefined : abandoned,
    applyOptions: { prunePorts: () => [{ port: 5180 }], reap: noDelegations, ...(realProcesses ? {} : { processes }) },
  });
}

/**
 * Start processes the way an agent leaves them behind: from a launcher that exits at once, so
 * their parent is gone and nothing in this test's own process tree holds them. Returns their pids.
 */
function startOrphans(specs) {
  const launcher =
    "const { spawn } = require('node:child_process');" +
    'const pids = JSON.parse(process.argv[1]).map((s) => {' +
    "  const child = spawn(s.file, s.args, { cwd: s.cwd, detached: true, stdio: 'ignore', windowsHide: true });" +
    '  child.unref(); return child.pid; });' +
    'process.stdout.write(JSON.stringify(pids));';
  const res = spawnSync(process.execPath, ['-e', launcher, JSON.stringify(specs)], { encoding: 'utf8', windowsHide: true });
  assert.equal(res.status, 0, res.stderr);
  return JSON.parse(res.stdout);
}

/** This machine's processes whose command line carries `marker`; closed by `t.after` whatever happens. */
function leftovers(marker) {
  const listed = listProcesses();
  assert.equal(listed.ok, true, listed.why);
  return listed.processes.filter((p) => p.pid !== process.pid && String(p.command).toLowerCase().includes(marker.toLowerCase()));
}

/** Before the fixture is deleted, close whatever this test started that is still running. */
function closeLeftovers(repo, marker) {
  repo.beforeRemove = async () => {
    for (const p of leftovers(marker)) {
      try {
        process.kill(p.pid);
      } catch {
        // already gone
      }
    }
    await settle(() => leftovers(marker));
  };
}

async function settle(check, ms = 8000) {
  const until = Date.now() + ms;
  for (;;) {
    const value = check();
    if (value.length === 0 || Date.now() > until) return value;
    await new Promise((done) => setTimeout(done, 250));
  }
}

const GIT_BASH = 'C:\\Program Files\\Git\\bin\\bash.exe';
const HEADLESS = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');

/** A real test browser if Playwright has one installed here, else null. */
function headlessShell() {
  if (!existsSync(HEADLESS)) return null;
  for (const dir of readdirSync(HEADLESS).filter((name) => name.startsWith('chromium_headless_shell-')).sort().reverse()) {
    const exe = join(HEADLESS, dir, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
    if (existsSync(exe)) return exe;
  }
  return null;
}

const branchExists = (primary, branch) =>
  spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: primary, windowsHide: true }).status === 0;
const registered = (primary, path) => runGit(primary, 'worktree', 'list', '--porcelain').includes(normalize(path));

test('a landed session worktree goes - worktree, branch and port - once it has been quiet a day', (t) => {
  const repo = makeRepo(t);
  const wt = addWorktree(repo.primary, 'desktop-chat');
  land(repo.primary, wt);
  assert.notEqual(runGit(repo.primary, 'rev-parse', 'main'), runGit(repo.primary, 'rev-parse', 'origin/main'), 'local main must lag, as it does');

  quiet(repo, wt.path, 3 * HOUR);
  const early = sweep(repo, { landed: [wt.branch] });
  assert.equal(early.ran, true);
  assert.deepEqual(early.done.removedWorktrees, [], 'a desktop chat quiet for 3 hours was removed');
  assert.ok(existsSync(join(wt.path, 'README.md')));

  quiet(repo, wt.path, 25 * HOUR);
  const result = sweep(repo, { landed: [wt.branch] });
  assert.deepEqual(result.done.removedWorktrees.map(normalize), [normalize(wt.path)]);
  assert.equal(existsSync(wt.path), false);
  assert.equal(registered(repo.primary, wt.path), false);
  assert.deepEqual(result.done.deletedBranches, [wt.branch]);
  assert.equal(
    runGit(repo.primary, 'rev-parse', 'main'),
    runGit(repo.primary, 'rev-parse', 'origin/main'),
    'the sweep fast-forwards a clean primary main, as a handoff does by hand',
  );
  assert.deepEqual(result.done.releasedPorts, [5180]);
  const last = JSON.parse(readFileSync(join(repo.stateDir, 'last.json'), 'utf8'));
  assert.deepEqual(last.removed.map(normalize), [normalize(wt.path)]);
  assert.deepEqual(last.needsPerson, []);
});

test('a landed agent worktree goes after two quiet hours', (t) => {
  const repo = makeRepo(t);
  const wt = addWorktree(repo.primary, 'agent-a1b2c3', 'claude/row-x');
  land(repo.primary, wt);
  quiet(repo, wt.path, 1 * HOUR);
  assert.deepEqual(sweep(repo, { landed: [wt.branch] }).done.removedWorktrees, []);
  quiet(repo, wt.path, 3 * HOUR);
  assert.deepEqual(sweep(repo, { landed: [wt.branch] }).done.removedWorktrees.map(normalize), [normalize(wt.path)]);
  assert.equal(branchExists(repo.primary, wt.branch), false);
});

test('a worktree with no commits of its own goes after three quiet days, not before', (t) => {
  const repo = makeRepo(t);
  const wt = addWorktree(repo.primary, 'never-committed');
  quiet(repo, wt.path, 2 * 24 * HOUR);
  assert.deepEqual(sweep(repo).done.removedWorktrees, []);
  quiet(repo, wt.path, 4 * 24 * HOUR);
  assert.deepEqual(sweep(repo).done.removedWorktrees.map(normalize), [normalize(wt.path)]);
});

test('no transcript is not the same as quiet: a worktree made a minute ago stays', (t) => {
  // Made with `git worktree add`, or worked in from a plain shell or Codex: no Claude transcript
  // exists for it at all, so only its git activity can say it is new.
  const repo = makeRepo(t);
  const wt = addWorktree(repo.primary, 'just-made');
  const result = sweep(repo);
  assert.deepEqual(result.done.removedWorktrees, []);
  const entry = result.plan.worktrees.find((w) => normalize(w.path) === normalize(wt.path));
  assert.match(entry.why, /HEAD last moved \d+ minute\(s\) ago/);
});

test('unlanded work, a worktree outside .claude/worktrees and a queued job are never touched', (t) => {
  const repo = makeRepo(t);
  const unlanded = addWorktree(repo.primary, 'in-progress');
  writeFileSync(join(unlanded.path, 'work.txt'), 'x\n');
  runGit(unlanded.path, 'add', '.');
  runGit(unlanded.path, 'commit', '-m', 'Not landed');
  const outside = addWorktree(repo.primary, 'elsewhere', 'claude/elsewhere', join(repo.root, 'codex-worktrees'));
  land(repo.primary, outside);
  const queued = addWorktree(repo.primary, 'queued');
  land(repo.primary, queued);
  for (const wt of [unlanded, outside, queued]) quiet(repo, wt.path, 10 * 24 * HOUR);

  const result = sweep(repo, {
    landed: [outside.branch, queued.branch],
    jobs: [{ id: 'j-1', state: 'waiting', checkout: queued.path }],
  });
  assert.deepEqual(result.done.removedWorktrees, []);
  for (const wt of [unlanded, outside, queued]) assert.equal(registered(repo.primary, wt.path), true, wt.path);
  const why = (wt) => result.plan.worktrees.find((entry) => normalize(entry.path) === normalize(wt.path)).why;
  assert.match(why(outside), /not under \.claude\/worktrees/);
  assert.match(why(queued), /queued or running job/);
  assert.match(why(unlanded), /has commits not in origin\/main/);
});

test('a worktree a process is sitting in is left exactly as it is, then goes once it is free', async (t) => {
  const repo = makeRepo(t);
  const wt = addWorktree(repo.primary, 'held-open');
  land(repo.primary, wt);
  quiet(repo, wt.path, 30 * HOUR);

  // A process whose working directory is inside the worktree - a shell, a dev server, a session.
  const holder = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { cwd: wt.path, stdio: 'ignore', windowsHide: true });
  t.after(() => holder.kill());
  await new Promise((done) => holder.once('spawn', done));

  const held = sweep(repo, { landed: [wt.branch] });
  if (process.platform === 'win32') {
    assert.deepEqual(held.done.removedWorktrees, []);
    assert.deepEqual(held.done.held.map((entry) => normalize(entry.path)), [normalize(wt.path)]);
    assert.deepEqual(held.done.errors, [], 'a worktree in use is a skip, not an error');
    assert.ok(existsSync(join(wt.path, 'README.md')), 'a file was deleted from under a running process');
    assert.equal(registered(repo.primary, wt.path), true);
    assert.equal(branchExists(repo.primary, wt.branch), true);
  }

  await new Promise((done) => {
    holder.once('exit', done);
    holder.kill();
  });
  const freed = sweep(repo, { landed: [wt.branch] });
  assert.equal(existsSync(wt.path), false);
  assert.equal(registered(repo.primary, wt.path), false);
  assert.equal(branchExists(repo.primary, wt.branch), false, `${JSON.stringify(freed.done.errors)}`);
});

test('AC-2: landing a worktree closes the dev server, the shell loop and the test browser running from it', { skip: process.platform !== 'win32' && 'Windows only' }, async (t) => {
  const repo = makeRepo(t);
  const marker = basename(repo.root);
  closeLeftovers(repo, marker);
  const wt = addWorktree(repo.primary, 'agent-landed-with-processes');
  land(repo.primary, wt);
  quiet(repo, wt.path, 30 * HOUR);

  const server = `require('node:http').createServer((q, s) => s.end('ok')).listen(0); // ${marker}`;
  const loop = existsSync(GIT_BASH)
    ? { file: GIT_BASH, args: ['-c', `while true; do sleep 1; done # ${marker}`] }
    : { file: process.execPath, args: ['-e', `setInterval(() => {}, 1000); // ${marker}`] };
  const browser = headlessShell();
  const specs = [
    { file: process.execPath, args: ['-e', server], cwd: wt.path },
    { ...loop, cwd: wt.path },
    browser
      ? { file: browser, args: ['--headless', `--user-data-dir=${join(repo.root, 'profile')}`, '--remote-debugging-port=0', 'about:blank'], cwd: wt.path }
      : { file: process.execPath, args: ['-e', `setInterval(() => {}, 1000); // browser ${marker}`], cwd: wt.path },
  ];
  startOrphans(specs);
  await new Promise((done) => setTimeout(done, 2000));
  assert.ok(leftovers(marker).length >= 3, 'the three processes are running');

  const result = sweep(repo, { landed: [wt.branch], realProcesses: true });
  assert.deepEqual(result.done.held, [], 'the removal must not find the folder in use');
  assert.deepEqual(result.done.errors, []);
  assert.deepEqual(result.done.removedWorktrees.map(normalize), [normalize(wt.path)]);
  assert.equal(existsSync(wt.path), false);
  assert.ok(result.done.closedProcesses.length >= 3, JSON.stringify(result.done.closedProcesses));
  assert.deepEqual((await settle(() => leftovers(marker))).map((p) => `${p.name} ${p.pid}`), [], 'nothing it started still runs');
  const last = JSON.parse(readFileSync(join(repo.stateDir, 'last.json'), 'utf8'));
  assert.ok(last.closedProcesses.length >= 3, 'what was closed is written down');
});

test('AC-3: an abandoned shell loop closes after a quiet hour, and an exempt process of the same age stays', { skip: process.platform !== 'win32' && 'Windows only' }, async (t) => {
  const repo = makeRepo(t);
  const marker = basename(repo.root);
  closeLeftovers(repo, marker);
  const wt = addWorktree(repo.primary, 'agent-left-a-loop');
  mkdirSync(repo.projects, { recursive: true }); // transcripts that can be read, and say nothing
  const [loop, runner] = startOrphans([
    { file: process.execPath, args: ['-e', `setInterval(() => {}, 1000); // loop ${marker}`], cwd: wt.path },
    // Stands in for the job queue runner: exempt by its command line, wherever it runs.
    { file: process.execPath, args: ['-e', `setInterval(() => {}, 1000); // ${marker}`, 'scripts/jobs.mjs', '--runner'], cwd: wt.path },
  ]);
  await new Promise((done) => setTimeout(done, 1000));

  // Now: young and working, nothing closes.
  const early = closeAbandonedProcesses({ primaryRoot: repo.primary, liveness: { root: repo.projects } });
  assert.deepEqual(early.closed, []);

  // The clock moved forward two hours: nothing has touched the worktree since.
  const result = sweep(repo, {
    abandoned: (root) => closeAbandonedProcesses({ primaryRoot: root, now: Date.now() + 2 * 60 * 60_000, liveness: { root: repo.projects } }),
  });
  assert.equal(result.ran, true);
  const still = (await settle(() => leftovers(`loop ${marker}`))).map((p) => p.pid);
  assert.deepEqual(still, [], 'the loop was closed');
  assert.ok(leftovers(marker).some((p) => p.pid === runner), 'the exempt runner still runs');
  assert.ok(existsSync(wt.path), 'closing processes removes no worktree');
  const last = JSON.parse(readFileSync(join(repo.stateDir, 'last.json'), 'utf8'));
  assert.deepEqual(last.closedProcesses.map((p) => p.pid), [loop]);
});

test('a process list that cannot be read keeps the worktree, and says so', (t) => {
  const repo = makeRepo(t);
  const wt = addWorktree(repo.primary, 'agent-unknown-processes');
  land(repo.primary, wt);
  quiet(repo, wt.path, 30 * HOUR);
  const unreadable = () => ({ ok: false, supported: true, closed: [], kept: [], failed: [], why: 'could not list processes: timed out' });
  const result = sweep(repo, { landed: [wt.branch], processes: unreadable });
  assert.deepEqual(result.done.removedWorktrees, []);
  assert.ok(result.done.errors.some((error) => /could not list processes/.test(error)), JSON.stringify(result.done.errors));
  assert.ok(existsSync(join(wt.path, 'README.md')));
});

test('anything that needs a person is written down, never acted on', (t) => {
  const repo = makeRepo(t);
  const wt = addWorktree(repo.primary, 'landed-but-dirty');
  land(repo.primary, wt);
  writeFileSync(join(wt.path, 'half-done.txt'), 'uncommitted\n');
  quiet(repo, wt.path, 30 * HOUR);

  const result = sweep(repo, { landed: [wt.branch] });
  assert.deepEqual(result.done.removedWorktrees, []);
  assert.ok(existsSync(join(wt.path, 'half-done.txt')));
  const last = JSON.parse(readFileSync(join(repo.stateDir, 'last.json'), 'utf8'));
  assert.ok(last.needsPerson.some((line) => /uncommitted changes/.test(line)), JSON.stringify(last.needsPerson));
});

test('two sweeps never run at once, and the trigger throttles itself', (t) => {
  const repo = makeRepo(t);
  const lock = acquireSweepLock(repo.stateDir);
  assert.equal(lock.ok, true);
  const blocked = sweep(repo);
  assert.equal(blocked.ran, false);
  assert.match(blocked.why, /another worktree cleanup is running/);
  lock.release();
  assert.equal(sweep(repo).ran, true);

  const started = [];
  const start = (...args) => {
    started.push(args);
    return { unref() {} };
  };
  // The primary checkout's own copy is what runs - landed code, never the triggering branch's.
  const script = join(repo.primary, 'scripts', 'cleanup-worktrees.mjs');
  mkdirSync(join(repo.primary, 'scripts'), { recursive: true });
  writeFileSync(script, '// stand-in\n');
  const env = { NOACG_CLEANUP_STATE_DIR: repo.stateDir };
  const common = { primaryRoot: repo.primary, env, start, platform: 'win32', fastForward: () => false };
  markSweepStart(repo.stateDir);
  assert.equal(triggerUnattendedSweep(common).started, false, 'not again within the half hour');
  const later = lastSweepStart(repo.stateDir) + SWEEP_THROTTLE_MS + 1000;
  assert.equal(triggerUnattendedSweep({ ...common, now: later }).started, true);
  assert.deepEqual(started.at(-1)[1], [script, '--unattended']);
  assert.equal(started.at(-1)[2].cwd, repo.primary, 'a sweep runs from the primary checkout');
  const stamped = lastSweepStart(repo.stateDir);
  assert.equal(triggerUnattendedSweep({ ...common, now: stamped + 1000 }).started, false, 'the trigger stamps the start itself');
  const muchLater = later + 2 * SWEEP_THROTTLE_MS;
  assert.equal(triggerUnattendedSweep({ ...common, env: { ...env, NOACG_NO_AUTO_CLEANUP: '1' }, now: muchLater }).started, false);
  assert.equal(
    triggerUnattendedSweep({ ...common, platform: 'linux', now: muchLater }).started,
    false,
    'without Windows refusing to rename a folder in use, nothing may start unattended',
  );
});

test('the owner\'s idle windows are pinned', () => {
  assert.deepEqual({ ...UNATTENDED_IDLE_MINUTES }, { agent: 120, session: 1440, unlanded: 4320 });
  const primaryRoot = 'C:/repo';
  const landed = new Set(['claude/a']);
  assert.equal(unattendedRule({ path: 'C:/repo/.claude/worktrees/agent-1', branch: 'claude/a', primaryRoot, landed }).idleMinutes, 120);
  assert.equal(unattendedRule({ path: 'C:/repo/.claude/worktrees/chat', branch: 'claude/a', primaryRoot, landed }).idleMinutes, 1440);
  assert.equal(unattendedRule({ path: 'C:/repo/.claude/worktrees/chat', branch: 'claude/b', primaryRoot, landed }).idleMinutes, 4320);
  assert.equal(unattendedRule({ path: 'C:/elsewhere/chat', branch: 'claude/a', primaryRoot, landed }).rule, null);
  assert.equal(unattendedRule({ path: 'C:/repo/.claude/worktrees/chat', branch: 'feature/x', primaryRoot, landed }).rule, null);
});
