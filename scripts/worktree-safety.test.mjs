import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  applyPlan,
  applySelf,
  assess,
  assessSelf,
  assessmentRisks,
  classifyIgnored,
  infrastructureReason,
  managedBranch,
  ORIGIN_FRESHNESS_MS,
  originFreshness,
} from './cleanup-worktrees.mjs';
import { HOME_RELATIVE_PATH } from './orchestrator-home.mjs';
import {
  ARCHIVE_BYTES_CEILING,
  archiveAndVerify,
  compareTrees,
  planArchive,
  walkFiles,
} from './cleanup-archive.mjs';
import {
  DEFAULT_MIN_IDLE_MINUTES,
  minIdleMinutes,
  projectDirName,
  resetSessionScanCache,
  sessionHold,
} from './session-liveness.mjs';

/**
 * The process signal, stubbed. Every test below is about the FILE-based guards, and letting them
 * reach the real `claude agents --json` would spawn a subprocess per run and make the result
 * depend on which sessions happen to be open on the machine.
 */
const NO_INVENTORY = Object.freeze({ available: false, rows: [] });

/** An inventory that says one live session is sitting in `cwd`. */
const inventoryHolding = (cwd, pid = 4242) => ({
  available: true,
  rows: [{ pid, cwd, kind: 'interactive', sessionId: 'live-session' }],
});
import { assessReattach } from './reattach-main.mjs';
import { overlapping, scanActivity } from './worktree-activity.mjs';
import {
  inspectLeftoverFolders,
  normalize,
  sweepEmptyLeftoverFolders,
  worktreeRoots,
} from './worktree-cleanup-lib.mjs';

function runGit(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(
    result.status,
    0,
    `git ${args.join(' ')} failed:\n${result.stderr || result.stdout}`,
  );
  return result.stdout.trim();
}

function makeRepo(t) {
  const root = mkdtempSync(join(tmpdir(), 'noacg-worktree-safety-'));
  const origin = join(root, 'origin.git');
  const primary = join(root, 'repo');
  runGit(root, 'init', '--bare', '--initial-branch=main', origin);
  runGit(root, 'clone', origin, primary);
  runGit(primary, 'config', 'user.name', 'Safety Tests');
  runGit(primary, 'config', 'user.email', 'safety-tests@example.invalid');
  writeFileSync(join(primary, 'README.md'), 'initial\n');
  runGit(primary, 'add', 'README.md');
  runGit(primary, 'commit', '-m', 'Initial commit');
  runGit(primary, 'push', '-u', 'origin', 'main');
  // Containment is only evidence against a FRESHLY fetched origin/main, and every assessment
  // refuses a stale one. A clone does not necessarily leave a FETCH_HEAD behind, so make the
  // fetch explicit - the same thing the CLI does before it assesses anything.
  runGit(primary, 'fetch', 'origin');

  // Each test gets its own archive root, so nothing here can reach the real one on this machine.
  const archive = join(root, 'archive');
  const previousArchive = process.env.NOACG_CLEANUP_ARCHIVE;
  process.env.NOACG_CLEANUP_ARCHIVE = archive;
  resetSessionScanCache();

  t.after(() => {
    if (previousArchive === undefined) delete process.env.NOACG_CLEANUP_ARCHIVE;
    else process.env.NOACG_CLEANUP_ARCHIVE = previousArchive;
    resetSessionScanCache();
    rmSync(root, { recursive: true, force: true });
  });
  return { origin, primary, root, archive };
}

function addWorktree(primary, name, prefix = 'codex') {
  const branch = `${prefix}/${name}`;
  const path = join(primary, '.claude', 'worktrees', name);
  mkdirSync(join(primary, '.claude', 'worktrees'), { recursive: true });
  runGit(primary, 'worktree', 'add', '-b', branch, path, 'main');
  return { branch, path };
}

function commitInWorktree(worktree, message = 'Feature commit') {
  writeFileSync(join(worktree, 'feature.txt'), `${message}\n`);
  runGit(worktree, 'add', 'feature.txt');
  runGit(worktree, 'commit', '-m', message);
}

// --- Self cleanup: the worktree a finished session removes at handoff ------------------------
//
// This is the one path allowed to delete the caller's own worktree, so each guard gets a test
// that makes it fire. A guard nobody has watched refuse is not a guard.

test('self cleanup approves and removes a clean, merged, pushed worktree', (t) => {
  const { primary } = makeRepo(t);
  const worktree = addWorktree(primary, 'finished');
  commitInWorktree(worktree.path);
  runGit(worktree.path, 'push', '-u', 'origin', worktree.branch);
  runGit(primary, 'merge', '--ff-only', worktree.branch);
  runGit(primary, 'push', 'origin', 'main');

  const plan = assessSelf(worktree.path);
  assert.deepEqual(plan.reasons, []);
  assert.equal(plan.ok, true);
  assert.equal(plan.branch, worktree.branch);

  const done = applySelf(plan, { prunePorts: () => [], refreshRemote: () => ({ ok: true }) });
  assert.deepEqual(done.errors, []);
  assert.equal(done.removedWorktree, true);
  assert.equal(done.deletedBranch, worktree.branch);
  assert.equal(done.deletedRemoteBranch, worktree.branch);
  // No process is holding it in a test, so the folder goes too - the husk is a Windows-only tail.
  assert.equal(existsSync(worktree.path), false);
  assert.equal(runGit(primary, 'branch', '--list', worktree.branch), '');
  assert.equal(
    runGit(primary, 'ls-remote', '--heads', 'origin', `refs/heads/${worktree.branch}`),
    '',
  );
});

test('self cleanup archives unrebuildable output, and its secret dies unread', (t) => {
  const { primary, archive } = makeRepo(t);
  // The ignore rules must predate the branch, or the worktree is simply behind main.
  writeFileSync(join(primary, '.gitignore'), 'bench-out/\n.env\nnode_modules/\n');
  runGit(primary, 'add', '.gitignore');
  runGit(primary, 'commit', '-m', 'Ignore build output');
  // The primary keeps the .env every worktree copies, so deleting a worktree's copy loses nothing.
  writeFileSync(join(primary, '.env'), 'TOKEN=the-real-one\n');
  const worktree = addWorktree(primary, 'has-data');
  commitInWorktree(worktree.path);
  runGit(primary, 'merge', '--ff-only', worktree.branch);
  runGit(primary, 'push', 'origin', 'main');

  // Exactly the shape that used to need a human: git reports a clean tree, and removal would
  // still take a paid bench directory and a .env with it.
  mkdirSync(join(worktree.path, 'bench-out', 'round'), { recursive: true });
  writeFileSync(join(worktree.path, 'bench-out', 'result.json'), 'paid for this\n');
  writeFileSync(join(worktree.path, 'bench-out', 'round', 'frame.png'), 'bytes\n');
  writeFileSync(join(worktree.path, '.env'), 'TOKEN=a-copy\n');
  mkdirSync(join(worktree.path, 'node_modules'), { recursive: true });
  writeFileSync(join(worktree.path, 'node_modules', 'x.js'), 'regenerable\n');
  assert.equal(runGit(worktree.path, 'status', '--porcelain'), '', 'git must call this clean');

  const plan = assessSelf(worktree.path);
  assert.deepEqual(plan.reasons, []);
  assert.deepEqual(plan.ignored.valuable.map((entry) => entry.path), ['bench-out/']);
  assert.deepEqual(plan.ignored.secrets.map((entry) => entry.path), ['.env']);
  assert.deepEqual(plan.ignored.unbackedSecrets, [], 'the primary still has a .env to hand out');
  assert.deepEqual(plan.ignored.regenerable, ['node_modules/'], 'node_modules is rebuildable');
  assert.equal(plan.archive.files, 2, 'both bench files are in the copy plan');

  const done = applySelf(plan, { prunePorts: () => [], refreshRemote: () => ({ ok: true }) });
  assert.deepEqual(done.errors, []);
  assert.equal(done.removedWorktree, true);
  assert.equal(done.archived.ok, true);
  assert.equal(done.archived.files, 2);

  // The archive holds the paid output, byte for byte, and holds no secret at all.
  const copied = join(done.archived.destination, 'bench-out');
  assert.equal(readFileSync(join(copied, 'result.json'), 'utf8'), 'paid for this\n');
  assert.equal(readFileSync(join(copied, 'round', 'frame.png'), 'utf8'), 'bytes\n');
  assert.equal(existsSync(join(done.archived.destination, '.env')), false, 'a secret is never copied');
  assert.equal(
    walkFiles(archive).some((file) => /(^|\/)\.env$/.test(file.path)),
    false,
    'no .env may reach the archive by any path',
  );
});

test('self cleanup refuses when the only copy of a secret is the one it would delete', (t) => {
  const { primary } = makeRepo(t);
  writeFileSync(join(primary, '.gitignore'), '.env\n');
  runGit(primary, 'add', '.gitignore');
  runGit(primary, 'commit', '-m', 'Ignore local env');
  const worktree = addWorktree(primary, 'lone-secret');
  commitInWorktree(worktree.path);
  runGit(primary, 'merge', '--ff-only', worktree.branch);
  runGit(primary, 'push', 'origin', 'main');
  writeFileSync(join(worktree.path, '.env'), 'TOKEN=nowhere-else\n'); // the primary has none

  const plan = assessSelf(worktree.path);
  assert.equal(plan.ok, false);
  assert.deepEqual(plan.ignored.secrets, []);
  assert.deepEqual(plan.ignored.unbackedSecrets.map((entry) => entry.path), ['.env']);
  assert.ok(
    plan.reasons.some((reason) => /the primary checkout has no copy of it/.test(reason)),
    `expected a lone-secret refusal, got ${JSON.stringify(plan.reasons)}`,
  );

  const done = applySelf(plan, { prunePorts: () => [], refreshRemote: () => ({ ok: true }) });
  assert.equal(done.removedWorktree, false);
  assert.equal(existsSync(join(worktree.path, '.env')), true);
});

test('a copy that cannot be proven stops the removal, and no flag overrides it', (t) => {
  const { primary } = makeRepo(t);
  writeFileSync(join(primary, '.gitignore'), 'bench-out/\n');
  runGit(primary, 'add', '.gitignore');
  runGit(primary, 'commit', '-m', 'Ignore bench output');
  const worktree = addWorktree(primary, 'bad-copy');
  commitInWorktree(worktree.path);
  runGit(primary, 'merge', '--ff-only', worktree.branch);
  runGit(primary, 'push', 'origin', 'main');
  mkdirSync(join(worktree.path, 'bench-out'), { recursive: true });
  writeFileSync(join(worktree.path, 'bench-out', 'result.json'), 'paid for this\n');

  const plan = assessSelf(worktree.path);
  assert.equal(plan.ok, true);

  const done = applySelf(plan, {
    prunePorts: () => [],
    refreshRemote: () => ({ ok: true }),
    archive: () => ({ ok: false, reason: 'file count 1 source / 0 archived', destination: null, files: 0, bytes: 0 }),
  });
  assert.equal(done.removedWorktree, false);
  assert.equal(done.deletedBranch, null);
  assert.ok(
    done.errors.some((error) => /source \/ 0 archived/.test(error)),
    `expected an archive refusal, got ${JSON.stringify(done.errors)}`,
  );
  assert.equal(readFileSync(join(worktree.path, 'bench-out', 'result.json'), 'utf8'), 'paid for this\n');
});

test('a half-written archive is caught by the verify, not trusted because the copy returned', (t) => {
  const { primary, archive } = makeRepo(t);
  const source = join(primary, 'bench-out');
  mkdirSync(join(source, 'round'), { recursive: true });
  writeFileSync(join(source, 'result.json'), 'paid for this\n');
  writeFileSync(join(source, 'round', 'frame.png'), 'bytes\n');

  const plan = planArchive({ worktreePath: primary, entries: [{ path: 'bench-out/' }], root: archive });
  assert.equal(plan.ok, true);
  assert.equal(plan.files, 2);

  // A copy that "succeeds" while dropping a file - the exact failure an unverified archive hides.
  const truncated = archiveAndVerify(plan, {
    copy: (from, to) => {
      mkdirSync(to, { recursive: true });
      writeFileSync(join(to, 'result.json'), readFileSync(join(from, 'result.json')));
    },
  });
  assert.equal(truncated.ok, false);
  assert.match(truncated.reason, /2 file\(s\) in the source, 1 archived/);

  // And a copy that keeps the count but corrupts a size is caught too.
  assert.equal(
    compareTrees([{ path: 'a', bytes: 10 }], [{ path: 'a', bytes: 9 }]),
    'a is 10 bytes in the source and 9 archived',
  );
  assert.equal(compareTrees([{ path: 'a', bytes: 10 }], [{ path: 'b', bytes: 10 }]), 'path a is missing from the archive');
  assert.equal(compareTrees([{ path: 'a', bytes: 10 }], [{ path: 'a', bytes: 10 }]), null);
});

test('an existing archive is re-proven, never overwritten, and never blocks forever', (t) => {
  const { primary, archive } = makeRepo(t);
  mkdirSync(join(primary, 'bench-out'), { recursive: true });
  writeFileSync(join(primary, 'bench-out', 'result.json'), 'paid for this\n');

  const first = planArchive({ worktreePath: primary, entries: [{ path: 'bench-out/' }], root: archive });
  assert.equal(archiveAndVerify(first).ok, true);

  // The `git worktree remove` after a good copy can fail on Windows, so the very next run meets
  // its own archive. Refusing that outright turned one busy folder into a permanent human
  // decision - the exact outcome this mechanism exists to remove. It is re-proven instead.
  const again = planArchive({ worktreePath: primary, entries: [{ path: 'bench-out/' }], root: archive });
  assert.equal(again.ok, true);
  assert.equal(again.alreadyArchived, true);
  const reused = archiveAndVerify(again);
  assert.equal(reused.ok, true);
  assert.equal(reused.reused, true);

  // An existing folder that does NOT match is still refused, and still not overwritten.
  writeFileSync(join(first.destination, 'bench-out', 'stray.json'), 'not from the source\n');
  const mismatched = planArchive({ worktreePath: primary, entries: [{ path: 'bench-out/' }], root: archive });
  assert.equal(mismatched.ok, false);
  assert.match(mismatched.refuse, /already exists and is not a faithful copy/);
  assert.equal(archiveAndVerify(mismatched).ok, false, 'a refused plan never copies anything');
  assert.equal(readFileSync(join(first.destination, 'bench-out', 'stray.json'), 'utf8'), 'not from the source\n');

  const huge = planArchive({
    worktreePath: primary,
    entries: [{ path: 'bench-out/' }],
    root: join(archive, 'other'),
    ceiling: 1,
  });
  assert.equal(huge.ok, false);
  assert.match(huge.refuse, /more than an unattended run copies/);
  assert.equal(ARCHIVE_BYTES_CEILING, 2 * 1024 * 1024 * 1024, 'the ceiling is a pinned number, not a vibe');
});

test('a half-written archive is set aside, not deleted and not left blocking the next run', (t) => {
  const { primary, archive } = makeRepo(t);
  mkdirSync(join(primary, 'bench-out'), { recursive: true });
  writeFileSync(join(primary, 'bench-out', 'a.json'), 'one\n');
  writeFileSync(join(primary, 'bench-out', 'b.json'), 'two\n');

  const plan = planArchive({ worktreePath: primary, entries: [{ path: 'bench-out/' }], root: archive });
  const failed = archiveAndVerify(plan, {
    copy: (from, to) => {
      mkdirSync(to, { recursive: true });
      writeFileSync(join(to, 'a.json'), readFileSync(join(from, 'a.json')));
    },
  });
  assert.equal(failed.ok, false);
  assert.match(failed.reason, /the partial copy is at .*unverified-/);
  assert.equal(existsSync(plan.destination), false, 'the name is free again');

  const quarantined = failed.reason.match(/the partial copy is at (.+)\)$/)[1];
  assert.equal(readFileSync(join(quarantined, 'bench-out', 'a.json'), 'utf8'), 'one\n', 'nothing is deleted');

  // The next run is not blocked by the wreckage of the last one.
  const retry = planArchive({ worktreePath: primary, entries: [{ path: 'bench-out/' }], root: archive });
  assert.equal(retry.ok, true);
  assert.equal(archiveAndVerify(retry).ok, true);
});

test('a secret buried inside an ignored directory refuses the archive instead of riding along', (t) => {
  const { primary, archive } = makeRepo(t);
  // git collapses an ignored DIRECTORY to one porcelain line and never names what is inside, so
  // this is the only place a .env under bench-out/ is ever seen.
  mkdirSync(join(primary, 'bench-out', 'rig'), { recursive: true });
  writeFileSync(join(primary, 'bench-out', 'result.json'), 'paid for this\n');
  writeFileSync(join(primary, 'bench-out', 'rig', '.env.bench.local'), 'TOKEN=secret\n');

  const plan = planArchive({ worktreePath: primary, entries: [{ path: 'bench-out/' }], root: archive });
  assert.equal(plan.ok, false);
  assert.match(plan.refuse, /contains what looks like a secret \(rig\/\.env\.bench\.local\)/);
  assert.equal(existsSync(archive), false, 'not one byte is copied');
});

test('a symlink is compared, not silently skipped on both sides of the proof', (t) => {
  const { primary } = makeRepo(t);
  const tree = join(primary, 'linked');
  mkdirSync(tree, { recursive: true });
  writeFileSync(join(tree, 'real.json'), 'content\n');

  const walked = walkFiles(tree);
  assert.deepEqual(walked, [{ path: 'real.json', bytes: 8, kind: 'file' }]);

  // A copy that turned a link into real files used to verify clean, because neither walk saw it.
  assert.match(
    compareTrees([{ path: 'x', bytes: 0, kind: 'link' }], [{ path: 'x', bytes: 12, kind: 'file' }]),
    /is a link in the source and a file archived/,
  );
});

test('self cleanup needs no ceremony when only rebuildable artifacts are present', (t) => {
  const { primary } = makeRepo(t);
  writeFileSync(join(primary, '.gitignore'), 'dist/\nnode_modules/\n');
  runGit(primary, 'add', '.gitignore');
  runGit(primary, 'commit', '-m', 'Ignore build output');
  const worktree = addWorktree(primary, 'only-artifacts');
  commitInWorktree(worktree.path);
  runGit(primary, 'merge', '--ff-only', worktree.branch);
  runGit(primary, 'push', 'origin', 'main');
  mkdirSync(join(worktree.path, 'dist'), { recursive: true });
  writeFileSync(join(worktree.path, 'dist', 'bundle.js'), 'built\n');

  const plan = assessSelf(worktree.path);
  assert.deepEqual(plan.ignored.valuable, [], 'a build directory is nothing to archive');
  assert.deepEqual(plan.ignored.secrets, []);
  assert.equal(plan.archive.destination, null, 'nothing to copy means no archive folder at all');

  const done = applySelf(plan, { prunePorts: () => [], refreshRemote: () => ({ ok: true }) });
  assert.deepEqual(done.errors, []);
  assert.equal(done.removedWorktree, true);
});

test('the managed namespaces cover the harness\'s own branches, and stop at human-named ones', () => {
  // Deletion needs containment AND ownership. These are the namespaces nothing but a harness
  // writes into: the two session prefixes, plus the branch an agent's isolated worktree mints.
  assert.equal(managedBranch('claude/x-something'), true);
  assert.equal(managedBranch('codex/x-something'), true);
  assert.equal(managedBranch('worktree-agent-a01fa11bd8cc5d99a'), true);

  // A name a person chose is reported, never deleted - containment says the commits are safe,
  // not whose branch it is.
  assert.equal(managedBranch('main'), false);
  assert.equal(managedBranch('analyze_noacg_project_onboarding'), false);
  assert.equal(managedBranch('worktree-agent'), false);
  assert.equal(managedBranch('my-worktree-agent-notes'), false);
});

test('self cleanup refuses the primary checkout', (t) => {
  const { primary } = makeRepo(t);
  const plan = assessSelf(primary);
  assert.equal(plan.ok, false);
  assert.ok(
    plan.reasons.some((reason) => /primary checkout|on main/.test(reason)),
    `expected a primary/main refusal, got ${JSON.stringify(plan.reasons)}`,
  );
});

test('self cleanup refuses a worktree with uncommitted work', (t) => {
  const { primary } = makeRepo(t);
  const worktree = addWorktree(primary, 'busy');
  commitInWorktree(worktree.path);
  runGit(primary, 'merge', '--ff-only', worktree.branch);
  runGit(primary, 'push', 'origin', 'main');
  writeFileSync(join(worktree.path, 'scratch.txt'), 'unsaved\n');

  const plan = assessSelf(worktree.path);
  assert.equal(plan.ok, false);
  assert.ok(
    plan.reasons.some((reason) => /uncommitted/.test(reason)),
    `expected an uncommitted refusal, got ${JSON.stringify(plan.reasons)}`,
  );
});

test('self cleanup refuses work that never reached origin/main', (t) => {
  const { primary } = makeRepo(t);
  const worktree = addWorktree(primary, 'unpushed');
  commitInWorktree(worktree.path);
  runGit(primary, 'merge', '--ff-only', worktree.branch); // merged locally, never pushed

  const plan = assessSelf(worktree.path);
  assert.equal(plan.ok, false);
  assert.ok(
    plan.reasons.some((reason) => /not backed up off this machine/.test(reason)),
    `expected a backup refusal, got ${JSON.stringify(plan.reasons)}`,
  );
});

test('self cleanup refuses a branch with commits that never landed', (t) => {
  const { primary } = makeRepo(t);
  const worktree = addWorktree(primary, 'unmerged');
  commitInWorktree(worktree.path);

  const plan = assessSelf(worktree.path);
  assert.equal(plan.ok, false);
  assert.ok(
    plan.reasons.some((reason) => /commits that are not in origin\/main/.test(reason)),
    `expected an unmerged refusal, got ${JSON.stringify(plan.reasons)}`,
  );
});

test('self cleanup refuses a detached worktree, which may hold unnamed work', (t) => {
  const { primary } = makeRepo(t);
  const worktree = addWorktree(primary, 'detached');
  commitInWorktree(worktree.path);
  runGit(primary, 'merge', '--ff-only', worktree.branch);
  runGit(primary, 'push', 'origin', 'main');
  runGit(worktree.path, 'checkout', '--detach');

  const plan = assessSelf(worktree.path);
  assert.equal(plan.ok, false);
  assert.ok(
    plan.reasons.some((reason) => /detached/.test(reason)),
    `expected a detached refusal, got ${JSON.stringify(plan.reasons)}`,
  );
});

test('self cleanup re-verifies at apply time and deletes nothing if the tree went dirty', (t) => {
  const { primary } = makeRepo(t);
  const worktree = addWorktree(primary, 'raced');
  commitInWorktree(worktree.path);
  runGit(primary, 'merge', '--ff-only', worktree.branch);
  runGit(primary, 'push', 'origin', 'main');

  const plan = assessSelf(worktree.path);
  assert.equal(plan.ok, true);

  // The session writes a file between assessment and apply - the classic stale-plan race.
  writeFileSync(join(worktree.path, 'late.txt'), 'written after assessment\n');

  const done = applySelf(plan, { prunePorts: () => [], refreshRemote: () => ({ ok: true }) });
  assert.equal(done.removedWorktree, false);
  assert.equal(done.deletedBranch, null);
  assert.ok(
    done.errors.some((error) => /state changed since assessment/.test(error)),
    `expected a stale-plan refusal, got ${JSON.stringify(done.errors)}`,
  );
  assert.equal(existsSync(worktree.path), true, 'the worktree must survive a refused apply');
});

test('self cleanup refuses when origin cannot be refreshed, rather than trusting stale containment', (t) => {
  const { primary } = makeRepo(t);
  const worktree = addWorktree(primary, 'offline');
  commitInWorktree(worktree.path);
  runGit(primary, 'merge', '--ff-only', worktree.branch);
  runGit(primary, 'push', 'origin', 'main');

  const plan = assessSelf(worktree.path);
  const done = applySelf(plan, { prunePorts: () => [], refreshRemote: () => ({ ok: false, stderr: 'network down' }) });
  assert.equal(done.removedWorktree, false);
  assert.ok(done.errors.some((error) => /could not refresh origin/.test(error)));
  assert.equal(existsSync(worktree.path), true);
});

test('cleanup assessment refuses a primary checkout that is not on main', (t) => {
  const { primary } = makeRepo(t);
  runGit(primary, 'switch', '-c', 'codex/not-main');

  const plan = assess(primary);

  assert.equal(plan.ok, false);
  assert.match(plan.reason, /must be on main/);
});

test('cleanup does not remove work backed up only by local main', (t) => {
  const { primary } = makeRepo(t);
  const worktree = addWorktree(primary, 'local-only');
  commitInWorktree(worktree.path);
  runGit(primary, 'merge', '--ff-only', worktree.branch);

  const plan = assess(primary);
  const worktreeEntry = plan.worktrees.find((entry) => entry.branch === worktree.branch);
  const branchEntry = plan.branches.find((entry) => entry.name === worktree.branch);

  assert.equal(plan.ok, true);
  assert.equal(plan.mainSync.state, 'ahead');
  assert.equal(worktreeEntry.action, 'skip');
  assert.match(worktreeEntry.why, /only contained in local main/);
  assert.equal(branchEntry.action, 'skip');
  assert.match(branchEntry.why, /not backed up to origin\/main/);
  assert.ok(assessmentRisks(plan).length >= 3);
});

test('cleanup removes only a clean, remotely backed-up managed worktree and branch', (t) => {
  const { primary } = makeRepo(t);
  const worktree = addWorktree(primary, 'merged');
  commitInWorktree(worktree.path);
  runGit(worktree.path, 'push', '-u', 'origin', worktree.branch);
  runGit(primary, 'merge', '--ff-only', worktree.branch);
  runGit(primary, 'push', 'origin', 'main');

  const plan = assess(primary);
  assert.equal(plan.ok, true);
  assert.equal(assessmentRisks(plan).length, 0);
  assert.equal(
    plan.worktrees.find((entry) => entry.branch === worktree.branch).action,
    'remove',
  );
  assert.equal(
    plan.branches.find((entry) => entry.name === worktree.branch).action,
    'delete',
  );
  assert.equal(
    plan.remoteBranches.find((entry) => entry.name === worktree.branch).action,
    'delete',
  );

  const result = applyPlan(plan, primary, { prunePorts: () => [] });

  assert.deepEqual(result.errors, []);
  assert.equal(existsSync(worktree.path), false);
  assert.equal(runGit(primary, 'branch', '--list', worktree.branch), '');
  assert.deepEqual(result.deletedRemoteBranches, [worktree.branch]);
  assert.equal(
    runGit(primary, 'ls-remote', '--heads', 'origin', `refs/heads/${worktree.branch}`),
    '',
  );
});

test('cleanup never deletes an unmerged GitHub branch', (t) => {
  const { primary } = makeRepo(t);
  const worktree = addWorktree(primary, 'remote-unmerged');
  commitInWorktree(worktree.path, 'Remote work that has not landed');
  runGit(worktree.path, 'push', '-u', 'origin', worktree.branch);

  const plan = assess(primary);
  const remote = plan.remoteBranches.find((entry) => entry.name === worktree.branch);
  assert.equal(remote.action, 'skip');
  assert.match(remote.why, /not contained in both/);

  const result = applyPlan(plan, primary, {
    prunePorts: () => [],
    refreshRemote: () => ({ ok: true }),
  });
  assert.deepEqual(result.deletedRemoteBranches, []);
  assert.notEqual(
    runGit(primary, 'ls-remote', '--heads', 'origin', `refs/heads/${worktree.branch}`),
    '',
  );
});

test('cleanup refuses a GitHub branch that moved after assessment', (t) => {
  const { origin, primary, root } = makeRepo(t);
  const worktree = addWorktree(primary, 'remote-race');
  commitInWorktree(worktree.path, 'Merged feature');
  runGit(worktree.path, 'push', '-u', 'origin', worktree.branch);
  runGit(primary, 'merge', '--ff-only', worktree.branch);
  runGit(primary, 'push', 'origin', 'main');

  const plan = assess(primary);
  assert.equal(
    plan.remoteBranches.find((entry) => entry.name === worktree.branch).action,
    'delete',
  );

  const other = join(root, 'other');
  runGit(root, 'clone', origin, other);
  runGit(other, 'config', 'user.name', 'Concurrent Pusher');
  runGit(other, 'config', 'user.email', 'concurrent@example.invalid');
  runGit(other, 'checkout', worktree.branch);
  writeFileSync(join(other, 'concurrent.txt'), 'new remote work\n');
  runGit(other, 'add', 'concurrent.txt');
  runGit(other, 'commit', '-m', 'Concurrent remote work');
  runGit(other, 'push', 'origin', worktree.branch);
  const movedHead = runGit(other, 'rev-parse', 'HEAD');

  const result = applyPlan(plan, primary, { prunePorts: () => [] });

  assert.deepEqual(result.deletedRemoteBranches, []);
  assert.match(result.errors.join('\n'), /origin\/codex\/remote-race.*changed - skipped/);
  assert.match(
    runGit(primary, 'ls-remote', '--heads', 'origin', `refs/heads/${worktree.branch}`),
    new RegExp(`^${movedHead}`),
  );
});

// --- The autonomous half: freshness, liveness, and archive-before-delete in the SWEEP ---------
//
// These four are the safety condition the removed "only the user starts a cleanup" rule used to
// stand in for. Each one has to be watched refusing, or it is not a guard.

test('a branch that is not on main is refused, however finished the worktree looks', (t) => {
  const { primary } = makeRepo(t);
  const worktree = addWorktree(primary, 'never-landed');
  commitInWorktree(worktree.path, 'Work that no merge has taken');
  // Clean tree, pushed branch, nothing in flight - everything except the one thing that counts.
  runGit(worktree.path, 'push', '-u', 'origin', worktree.branch);
  runGit(primary, 'fetch', 'origin');

  const plan = assess(primary);
  const entry = plan.worktrees.find((w) => w.branch === worktree.branch);
  assert.equal(entry.action, 'skip');
  assert.match(entry.why, /has commits not in origin\/main/);
  assert.equal(plan.branches.find((b) => b.name === worktree.branch).action, 'skip');

  const result = applyPlan(plan, primary, { prunePorts: () => [] });
  assert.deepEqual(result.removedWorktrees, []);
  assert.equal(existsSync(worktree.path), true);
  assert.notEqual(runGit(primary, 'branch', '--list', worktree.branch), '');
});

test('a worktree with NO branch is refused by rule, not by whether its commit landed', (t) => {
  const { primary } = makeRepo(t);
  // The shape the eligibility rule assumed away, and the shape the permanent orchestrator
  // worktree will have: detached at origin/main, because git will not let a second worktree hold
  // `main` while the primary checkout has it. Its commit IS on main - that is the point - and it
  // must still never be removed.
  // Deliberately NOT named `orchestrator`: that name is refused by the infrastructure LIST, and
  // this test is about the shape rule catching a detached worktree nobody thought to name.
  const infra = join(primary, '.claude', 'worktrees', 'some-detached-worktree');
  mkdirSync(join(primary, '.claude', 'worktrees'), { recursive: true });
  runGit(primary, 'worktree', 'add', '--detach', infra, 'origin/main');
  assert.equal(runGit(infra, 'status', '--porcelain'), '', 'clean, contained, and still not disposable');

  const plan = assess(primary);
  const entry = plan.worktrees.find((w) => w.path.endsWith('some-detached-worktree'));
  assert.equal(entry.action, 'skip');
  assert.match(entry.why, /it has no branch/);
  assert.match(entry.why, /wrong reason to delete/);
  assert.equal(entry.needsPerson, false, 'infrastructure is not a decision to escalate');

  // The self path refuses it by the same rule, from the same predicate.
  const selfPlan = assessSelf(infra);
  assert.equal(selfPlan.ok, false);
  assert.ok(selfPlan.reasons.some((reason) => /it has no branch/.test(reason)));

  // And the primary checkout itself is refused with the hazard named, rather than skipped
  // silently: the landing queue mutates that working tree during every integration.
  const main = plan.worktrees.find((w) => w.path.toLowerCase() === normalize(primary).toLowerCase());
  assert.equal(main.action, 'skip');
  assert.match(main.why, /primary checkout/);
  assert.match(main.why, /MERGES, BUILDS and RESETS/);

  const result = applyPlan(plan, primary, { prunePorts: () => [] });
  assert.deepEqual(result.removedWorktrees, []);
  assert.equal(existsSync(infra), true);
  assert.equal(existsSync(primary), true);
});

test('the orchestrator home is infrastructure by NAME, not only while it stays detached', () => {
  // Two guards where the design wants two. The branchless rule already refuses it while it is
  // detached at origin/main; this one still refuses it the day somebody reattaches it to a branch,
  // and the name comes from the module that creates the home, so the two cannot drift apart.
  const home = `C:/repo/${HOME_RELATIVE_PATH}`;
  assert.match(
    infrastructureReason({ path: home, primaryRoot: 'C:/repo', branch: 'claude/whatever' }),
    /named as permanent infrastructure/,
  );
  assert.match(
    infrastructureReason({ path: home, primaryRoot: 'C:/repo', branch: null }),
    /named as permanent infrastructure/,
  );
  // An ordinary session's worktree on a branch is not infrastructure.
  assert.equal(
    infrastructureReason({ path: 'C:/repo/.claude/worktrees/agent-x', primaryRoot: 'C:/repo', branch: 'claude/x' }),
    null,
  );
});

test('a branch on main with only rebuildable ignored content is eligible', (t) => {
  const { primary } = makeRepo(t);
  writeFileSync(join(primary, '.gitignore'), 'node_modules/\ndist/\n');
  runGit(primary, 'add', '.gitignore');
  runGit(primary, 'commit', '-m', 'Ignore build output');
  const worktree = addWorktree(primary, 'rebuildable-only');
  commitInWorktree(worktree.path);
  runGit(worktree.path, 'push', '-u', 'origin', worktree.branch);
  runGit(primary, 'merge', '--ff-only', worktree.branch);
  runGit(primary, 'push', 'origin', 'main');
  mkdirSync(join(worktree.path, 'dist'), { recursive: true });
  writeFileSync(join(worktree.path, 'dist', 'bundle.js'), 'built\n');

  const plan = assess(primary);
  const entry = plan.worktrees.find((w) => w.branch === worktree.branch);
  assert.equal(entry.action, 'remove');
  assert.deepEqual(entry.ignored.valuable, []);
  assert.equal(entry.archive.files, 0, 'nothing here needs a copy');
  assert.deepEqual(assessmentRisks(plan), []);

  const result = applyPlan(plan, primary, { prunePorts: () => [] });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.archived, [], 'no archive folder is made for rebuildable output');
  assert.equal(existsSync(worktree.path), false);
});

test('the sweep archives and verifies a worktree\'s paid output before removing it', (t) => {
  const { primary } = makeRepo(t);
  writeFileSync(join(primary, '.gitignore'), 'bench-out/\nnode_modules/\n');
  runGit(primary, 'add', '.gitignore');
  runGit(primary, 'commit', '-m', 'Ignore bench output');
  const worktree = addWorktree(primary, 'paid-round');
  commitInWorktree(worktree.path);
  runGit(worktree.path, 'push', '-u', 'origin', worktree.branch);
  runGit(primary, 'merge', '--ff-only', worktree.branch);
  runGit(primary, 'push', 'origin', 'main');
  mkdirSync(join(worktree.path, 'bench-out'), { recursive: true });
  writeFileSync(join(worktree.path, 'bench-out', 'round.jsonl'), '{"cost":"real"}\n');

  const plan = assess(primary);
  const entry = plan.worktrees.find((w) => w.branch === worktree.branch);
  assert.equal(entry.action, 'remove');
  assert.equal(entry.archive.files, 1);

  const result = applyPlan(plan, primary, { prunePorts: () => [] });
  assert.deepEqual(result.errors, []);
  assert.equal(result.archived.length, 1);
  assert.equal(existsSync(worktree.path), false, 'only now may the worktree go');
  assert.equal(
    readFileSync(join(result.archived[0].destination, 'bench-out', 'round.jsonl'), 'utf8'),
    '{"cost":"real"}\n',
  );
});

test('a failed archive verification leaves the sweep\'s worktree and branch exactly where they were', (t) => {
  const { primary } = makeRepo(t);
  writeFileSync(join(primary, '.gitignore'), 'bench-out/\n');
  runGit(primary, 'add', '.gitignore');
  runGit(primary, 'commit', '-m', 'Ignore bench output');
  const worktree = addWorktree(primary, 'unprovable');
  commitInWorktree(worktree.path);
  runGit(worktree.path, 'push', '-u', 'origin', worktree.branch);
  runGit(primary, 'merge', '--ff-only', worktree.branch);
  runGit(primary, 'push', 'origin', 'main');
  mkdirSync(join(worktree.path, 'bench-out'), { recursive: true });
  writeFileSync(join(worktree.path, 'bench-out', 'round.jsonl'), '{"cost":"real"}\n');

  const plan = assess(primary);
  const result = applyPlan(plan, primary, {
    prunePorts: () => [],
    archive: (archivePlan) =>
      archivePlan.items.length === 0
        ? { ok: true, reason: null, destination: null, files: 0, bytes: 0, verified: [] }
        : { ok: false, reason: 'the archived copy cannot be read back', destination: null, files: 0, bytes: 0 },
  });

  assert.deepEqual(result.removedWorktrees, []);
  assert.deepEqual(result.archived, []);
  assert.ok(
    result.errors.some((error) => /cannot be read back.*nothing removed/.test(error)),
    `expected an archive refusal, got ${JSON.stringify(result.errors)}`,
  );
  assert.equal(existsSync(join(worktree.path, 'bench-out', 'round.jsonl')), true);
  assert.notEqual(runGit(primary, 'branch', '--list', worktree.branch), '');
});

test('containment measured against a stale origin is not evidence, and every assessment says so', (t) => {
  const { primary } = makeRepo(t);
  const worktree = addWorktree(primary, 'stale-refs');
  commitInWorktree(worktree.path);
  runGit(worktree.path, 'push', '-u', 'origin', worktree.branch);
  runGit(primary, 'merge', '--ff-only', worktree.branch);
  runGit(primary, 'push', 'origin', 'main');

  const fresh = assess(primary);
  assert.equal(fresh.ok, true);
  assert.equal(fresh.freshness.fresh, true);

  // Age the fetch by an hour. Nothing else about the repository changes.
  const fetchHead = join(primary, '.git', 'FETCH_HEAD');
  const anHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  utimesSync(fetchHead, anHourAgo, anHourAgo);

  const stale = assess(primary);
  assert.equal(stale.ok, false);
  assert.match(stale.reason, /last fetched \d+ minute\(s\) ago/);
  assert.deepEqual(assessmentRisks(stale), [stale.reason]);

  const selfPlan = assessSelf(worktree.path);
  assert.equal(selfPlan.ok, false);
  assert.ok(selfPlan.reasons.some((reason) => /last fetched/.test(reason)));

  assert.equal(originFreshness(primary, { maxAgeMs: 2 * 60 * 60 * 1000 }).fresh, true, 'the window is the only variable');
});

test('a locked worktree is refused rather than forced, in the sweep and in self cleanup', (t) => {
  const { primary } = makeRepo(t);
  const worktree = addWorktree(primary, 'held-open');
  commitInWorktree(worktree.path);
  runGit(worktree.path, 'push', '-u', 'origin', worktree.branch);
  runGit(primary, 'merge', '--ff-only', worktree.branch);
  runGit(primary, 'push', 'origin', 'main');
  runGit(primary, 'worktree', 'lock', worktree.path);

  const plan = assess(primary);
  const entry = plan.worktrees.find((w) => w.branch === worktree.branch);
  assert.equal(entry.action, 'skip');
  assert.match(entry.why, /locked - a session is holding it/);

  const selfPlan = assessSelf(worktree.path);
  assert.equal(selfPlan.ok, false);
  assert.ok(selfPlan.reasons.some((reason) => /locked/.test(reason)));

  const result = applyPlan(plan, primary, { prunePorts: () => [] });
  assert.deepEqual(result.removedWorktrees, []);
  assert.equal(existsSync(worktree.path), true);
});

test('a worktree a session is still sitting in is left alone, however merged its branch is', (t) => {
  const { primary } = makeRepo(t);
  const worktree = addWorktree(primary, 'still-open');
  commitInWorktree(worktree.path);
  runGit(worktree.path, 'push', '-u', 'origin', worktree.branch);
  runGit(primary, 'merge', '--ff-only', worktree.branch);
  runGit(primary, 'push', 'origin', 'main');

  // A transcript tree shaped exactly like Claude Code's, with a turn written a minute ago in
  // this worktree - the case containment cannot see, because nothing is uncommitted or unmerged.
  const projects = join(primary, 'fake-projects');
  const sessionDir = join(projects, projectDirName(worktree.path));
  mkdirSync(sessionDir, { recursive: true });
  writeFileSync(join(sessionDir, 'session.jsonl'), '{"cwd":"x"}\n');

  const busy = sessionHold(worktree.path, { root: projects, minIdleMinutes: 120, inventory: NO_INVENTORY });
  assert.equal(busy.busy, true);
  assert.match(busy.why, /a session was active here/);

  // The same worktree, once the session has been quiet long enough, is nobody's.
  const idle = sessionHold(worktree.path, { root: projects, minIdleMinutes: 0, inventory: NO_INVENTORY });
  assert.equal(idle.busy, false);

  // And a machine with no transcript tree at all falls back to containment rather than refusing
  // everything - the one place this fails open, because it protects politeness, not work.
  const nowhere = sessionHold(worktree.path, { root: join(primary, 'no-such-dir'), inventory: NO_INVENTORY });
  assert.equal(nowhere.busy, false);
  assert.equal(nowhere.activity.available, false);
});

test('a live process holds a worktree the transcripts have already given up on', (t) => {
  const { primary } = makeRepo(t);
  const worktree = addWorktree(primary, 'process-open');
  commitInWorktree(worktree.path);
  runGit(worktree.path, 'push', '-u', 'origin', worktree.branch);
  runGit(primary, 'merge', '--ff-only', worktree.branch);
  runGit(primary, 'push', 'origin', 'main');

  // No transcript tree at all - the fail-open case the file-based guard cannot help with, and the
  // one that let a worktree-isolated subagent read as nobody's on this machine.
  const noTranscripts = { root: join(primary, 'no-such-dir') };

  const held = sessionHold(worktree.path, { ...noTranscripts, inventory: inventoryHolding(worktree.path) });
  assert.equal(held.busy, true, 'a running process holds the folder it is running in');
  assert.match(held.why, /a live session is running here \(pid 4242\)/);

  // It does not age out. The transcript guard releases at zero idle minutes; a process does not.
  const stillHeld = sessionHold(worktree.path, {
    ...noTranscripts,
    minIdleMinutes: 0,
    inventory: inventoryHolding(worktree.path),
  });
  assert.equal(stillHeld.busy, true, 'a process signal has no idle window to expire');

  // A session in a SUBDIRECTORY of the worktree still holds it.
  const deeper = sessionHold(worktree.path, {
    ...noTranscripts,
    inventory: inventoryHolding(join(worktree.path, 'src')),
  });
  assert.equal(deeper.busy, true);

  // A session in an unrelated folder does not, and neither does the inventory's SILENCE: an
  // absent verdict is evidence a session ended, and evidence never authorises a deletion here.
  const elsewhere = sessionHold(worktree.path, {
    ...noTranscripts,
    inventory: inventoryHolding(join(primary, 'somewhere-else')),
  });
  assert.equal(elsewhere.busy, false);
  assert.equal(
    sessionHold(worktree.path, { ...noTranscripts, inventory: { available: true, rows: [] } }).busy,
    false,
  );
});

test('the sweep itself consults the liveness guard - not just the helper in isolation', (t) => {
  const { primary } = makeRepo(t);
  const worktree = addWorktree(primary, 'session-open');
  commitInWorktree(worktree.path);
  runGit(worktree.path, 'push', '-u', 'origin', worktree.branch);
  runGit(primary, 'merge', '--ff-only', worktree.branch);
  runGit(primary, 'push', 'origin', 'main');

  const projects = join(primary, 'fake-projects');
  const sessionDir = join(projects, projectDirName(worktree.path));
  mkdirSync(sessionDir, { recursive: true });
  writeFileSync(join(sessionDir, 'session.jsonl'), '{"cwd":"x"}\n');
  const liveness = { root: projects, minIdleMinutes: 120, inventory: NO_INVENTORY };

  const plan = assess(primary, { liveness });
  const entry = plan.worktrees.find((w) => w.branch === worktree.branch);
  assert.equal(entry.action, 'skip', 'assess() must ask, or the guard is decoration');
  assert.match(entry.why, /a session was active here/);
  assert.deepEqual(assessmentRisks(plan), [], 'somebody being at their desk is not a risk to report');

  // And the apply-time re-check asks again, on a plan made when nobody was there.
  resetSessionScanCache();
  const openPlan = assess(primary, { liveness: { root: join(primary, 'nothing-here'), inventory: NO_INVENTORY } });
  assert.equal(openPlan.worktrees.find((w) => w.branch === worktree.branch).action, 'remove');
  const result = applyPlan(openPlan, primary, { prunePorts: () => [], liveness });
  assert.deepEqual(result.removedWorktrees, []);
  assert.ok(result.errors.some((error) => /safety state changed after assessment/.test(error)));
  assert.equal(existsSync(worktree.path), true);
});

test('the numbers that decide the blast radius are pinned, not left to drift', () => {
  assert.equal(DEFAULT_MIN_IDLE_MINUTES, 120);
  assert.equal(ORIGIN_FRESHNESS_MS, 10 * 60 * 1000);
  // An env var set to an empty string used to mean "no idle window at all", silently.
  assert.equal(minIdleMinutes({ env: {} }), 120);
  assert.equal(minIdleMinutes({ env: { NOACG_CLEANUP_MIN_IDLE_MINUTES: '' } }), 120);
  assert.equal(minIdleMinutes({ env: { NOACG_CLEANUP_MIN_IDLE_MINUTES: '   ' } }), 120);
  assert.equal(minIdleMinutes({ env: { NOACG_CLEANUP_MIN_IDLE_MINUTES: 'nonsense' } }), 120);
  assert.equal(minIdleMinutes({ env: { NOACG_CLEANUP_MIN_IDLE_MINUTES: '5' } }), 5);
});

test('a bisect leaves a clean tree on a contained commit, and is still refused', (t) => {
  const { primary } = makeRepo(t);
  const worktree = addWorktree(primary, 'bisecting');
  commitInWorktree(worktree.path);
  runGit(worktree.path, 'push', '-u', 'origin', worktree.branch);
  runGit(primary, 'merge', '--ff-only', worktree.branch);
  runGit(primary, 'push', 'origin', 'main');
  runGit(worktree.path, 'bisect', 'start');
  runGit(worktree.path, 'bisect', 'bad');
  assert.equal(runGit(worktree.path, 'status', '--porcelain'), '', 'a bisect leaves no symptom');

  const plan = assess(primary);
  const entry = plan.worktrees.find((w) => w.path.endsWith('bisecting'));
  assert.equal(entry.action, 'skip');
  assert.match(entry.why, /BISECT_LOG operation is in progress/);
  assert.equal(entry.needsPerson, true);
  assert.ok(assessmentRisks(plan).some((risk) => /BISECT_LOG/.test(risk)));
});

test('an unreadable irreplaceable path reaches the stop-and-ask list, not just the skip list', (t) => {
  const { primary } = makeRepo(t);
  const worktree = addWorktree(primary, 'unreadable-out');
  commitInWorktree(worktree.path);
  runGit(primary, 'merge', '--ff-only', worktree.branch);

  // The blocker wording is checked by a FLAG, not by matching prose - the substring test this
  // replaced read "could not read" and the blocker says "could not be read", so an unattended
  // --apply sailed past it.
  const risks = assessmentRisks({
    ok: true,
    mainSync: { ahead: 0, behind: 0, state: 'in-sync' },
    worktrees: [
      { path: worktree.path, action: 'skip', needsPerson: true, why: 'bench-out/ could not be read, so its copy could never be proven' },
      { path: '/elsewhere', action: 'skip', needsPerson: false, why: 'the worktree is locked - a session is holding it' },
    ],
    branches: [],
    remoteBranches: [],
    emptyFolders: { empty: [], nonEmpty: [], unreadable: [] },
  });
  assert.equal(risks.length, 1);
  assert.match(risks[0], /could not be read/);
});

test('an isolated agent\'s worktree is seen through its parent session\'s transcript', (t) => {
  const { primary } = makeRepo(t);
  const worktree = addWorktree(primary, 'subagent-held');
  // A worktree-isolated subagent gets no directory of its own: its transcript is filed under the
  // PARENT session's directory, so only the cwd inside the file identifies the worktree.
  const projects = join(primary, 'fake-projects');
  const parentDir = join(projects, projectDirName(primary), 'session-id', 'subagents');
  mkdirSync(parentDir, { recursive: true });
  writeFileSync(
    join(parentDir, 'agent.jsonl'),
    `{"type":"assistant","cwd":${JSON.stringify(worktree.path)},"message":{"role":"assistant"}}\n`,
  );

  resetSessionScanCache();
  const hold = sessionHold(worktree.path, { root: projects, minIdleMinutes: 120, inventory: NO_INVENTORY });
  assert.equal(hold.busy, true, 'the by-name lookup alone would have called this idle');
  assert.match(hold.why, /a session was active here/);
});

test('the three classes of ignored content are told apart by name, never by reading them', (t) => {
  const { primary } = makeRepo(t);
  writeFileSync(join(primary, '.gitignore'), 'bench-out/\n.env\n.env.local\nnode_modules/\ndist/\n');
  runGit(primary, 'add', '.gitignore');
  runGit(primary, 'commit', '-m', 'Ignore local files');
  writeFileSync(join(primary, '.env'), 'TOKEN=the-real-one\n');
  const worktree = addWorktree(primary, 'mixed-bag');
  writeFileSync(join(worktree.path, '.env'), 'TOKEN=a-copy\n');
  writeFileSync(join(worktree.path, '.env.local'), 'TOKEN=another\n'); // no copy in the primary
  mkdirSync(join(worktree.path, 'bench-out'), { recursive: true });
  writeFileSync(join(worktree.path, 'bench-out', 'round.jsonl'), '{"cost":"real"}\n');
  mkdirSync(join(worktree.path, 'node_modules'), { recursive: true });
  writeFileSync(join(worktree.path, 'node_modules', 'x.js'), 'regenerable\n');

  const ignored = classifyIgnored(worktree.path, { primaryRoot: primary });
  assert.deepEqual(ignored.regenerable, ['node_modules/']);
  assert.deepEqual(ignored.secrets.map((entry) => entry.path), ['.env']);
  assert.deepEqual(ignored.unbackedSecrets.map((entry) => entry.path), ['.env.local']);
  assert.deepEqual(ignored.valuable.map((entry) => entry.path), ['bench-out/']);
  assert.equal(ignored.valuable[0].files, 1);
  assert.equal(ignored.valuable[0].bytes, readFileSync(join(worktree.path, 'bench-out', 'round.jsonl')).length);
});

test('cleanup apply rechecks a worktree that became dirty after assessment', (t) => {
  const { primary } = makeRepo(t);
  const worktree = addWorktree(primary, 'changed-after-plan');
  commitInWorktree(worktree.path);
  runGit(primary, 'merge', '--ff-only', worktree.branch);
  runGit(primary, 'push', 'origin', 'main');
  const plan = assess(primary);
  writeFileSync(join(worktree.path, 'late-change.txt'), 'do not remove\n');

  const result = applyPlan(plan, primary, { prunePorts: () => [] });

  assert.ok(
    result.errors.some((error) => error.includes('safety state changed after assessment')),
  );
  assert.equal(existsSync(worktree.path), true);
  assert.notEqual(runGit(primary, 'branch', '--list', worktree.branch), '');
});

test('cleanup apply refuses every action if the primary checkout leaves main', (t) => {
  const { primary } = makeRepo(t);
  const worktree = addWorktree(primary, 'main-moved');
  commitInWorktree(worktree.path);
  runGit(primary, 'merge', '--ff-only', worktree.branch);
  runGit(primary, 'push', 'origin', 'main');
  const plan = assess(primary);
  runGit(primary, 'switch', '-c', 'admin/not-main');

  const result = applyPlan(plan, primary, { prunePorts: () => [] });

  assert.deepEqual(result.removedWorktrees, []);
  assert.deepEqual(result.deletedBranches, []);
  assert.match(result.errors[0], /no longer on main/);
  assert.equal(existsSync(worktree.path), true);
  assert.notEqual(runGit(primary, 'branch', '--list', worktree.branch), '');
});

test('cleanup apply preserves a branch whose ref moved after assessment', (t) => {
  const { primary } = makeRepo(t);
  writeFileSync(join(primary, 'second.txt'), 'second\n');
  runGit(primary, 'add', 'second.txt');
  runGit(primary, 'commit', '-m', 'Second main commit');
  runGit(primary, 'push', 'origin', 'main');
  runGit(primary, 'branch', 'codex/ref-moved');
  const plan = assess(primary);
  runGit(primary, 'branch', '-f', 'codex/ref-moved', 'HEAD~1');

  const result = applyPlan(plan, primary, { prunePorts: () => [] });

  assert.ok(result.errors.some((error) => error.includes('state changed after assessment')));
  assert.notEqual(runGit(primary, 'branch', '--list', 'codex/ref-moved'), '');
});

test('cleanup treats dirty worktrees as a blocking risk', (t) => {
  const { primary } = makeRepo(t);
  const worktree = addWorktree(primary, 'dirty', 'claude');
  writeFileSync(join(worktree.path, 'uncommitted.txt'), 'keep me\n');

  const plan = assess(primary);
  const entry = plan.worktrees.find((item) => item.branch === worktree.branch);

  assert.equal(entry.action, 'skip');
  assert.match(entry.why, /uncommitted changes/);
  assert.ok(assessmentRisks(plan).some((risk) => risk.includes('uncommitted changes')));
});

test('leftover-folder dry run reports empty and non-empty folders without deleting either', (t) => {
  const { primary } = makeRepo(t);
  const base = join(primary, '.claude', 'worktrees');
  const empty = join(base, 'empty');
  const nonEmpty = join(base, 'non-empty');
  mkdirSync(empty, { recursive: true });
  mkdirSync(nonEmpty, { recursive: true });
  writeFileSync(join(nonEmpty, 'keep.txt'), 'keep\n');

  const inspection = inspectLeftoverFolders({
    primaryRoot: primary,
    registeredRoots: worktreeRoots(primary),
    protect: [primary],
  });

  assert.deepEqual(inspection.empty, [normalize(empty)]);
  assert.deepEqual(inspection.nonEmpty, [normalize(nonEmpty)]);
  assert.equal(existsSync(empty), true);
  assert.equal(existsSync(nonEmpty), true);

  const sweep = sweepEmptyLeftoverFolders({
    primaryRoot: primary,
    registeredRoots: worktreeRoots(primary),
    protect: [primary],
  });
  assert.deepEqual(sweep.removed, [normalize(empty)]);
  assert.equal(existsSync(empty), false);
  assert.equal(existsSync(nonEmpty), true);
});

test('activity scan reports other worktrees committed and uncommitted work, never its own', async (t) => {
  const { primary } = makeRepo(t);
  const busy = addWorktree(primary, 'busy');
  commitInWorktree(busy.path, 'Committed but unmerged');
  writeFileSync(join(busy.path, 'src with space.ts'), 'draft\n');
  const idle = addWorktree(primary, 'idle'); // branched off main, nothing done
  writeFileSync(join(primary, 'own-work.txt'), 'own\n');

  const { worktrees, branches } = await scanActivity(primary);

  assert.deepEqual(
    worktrees.map((entry) => entry.branch),
    [busy.branch],
    'only the worktree with work in flight is reported',
  );
  const [entry] = worktrees;
  // Untracked, uncommitted and committed-but-unmerged all count as in flight; the scanning
  // checkout's own files never do, and a path with a space survives intact.
  assert.deepEqual(entry.files, ['feature.txt', 'src with space.ts']);
  assert.equal(entry.uncommitted, 1);
  assert.equal(entry.ahead, 1);
  assert.equal(entry.lastCommit.subject, 'Committed but unmerged');
  assert.equal(existsSync(idle.path), true);
  // Both busy and idle have a worktree, so neither belongs in the worktree-less list.
  assert.deepEqual(branches, []);

  // Scanned from the busy worktree itself, its own work is what must NOT be listed - the
  // primary checkout sits on main, so it cannot prove the self-exclusion on its own.
  assert.deepEqual((await scanActivity(busy.path)).worktrees, []);
});

test('activity scan still sees unmerged work after its worktree is gone', async (t) => {
  const { primary } = makeRepo(t);
  const abandoned = addWorktree(primary, 'abandoned');
  commitInWorktree(abandoned.path, 'Work left behind');
  assert.equal((await scanActivity(primary)).worktrees.length, 1);

  // A closed session leaves the branch behind and frees its worktree - the exact case a
  // worktree-only scan goes blind to.
  runGit(primary, 'worktree', 'remove', abandoned.path);

  const { worktrees, branches } = await scanActivity(primary);
  assert.deepEqual(worktrees, [], 'the worktree is gone, so it reports no worktree activity');
  assert.deepEqual(
    branches.map((entry) => ({ branch: entry.branch, ahead: entry.ahead, files: entry.files })),
    [{ branch: abandoned.branch, ahead: 1, files: ['feature.txt'] }],
    'the unmerged work is still reported, now as a worktree-less branch',
  );
  assert.equal(branches[0].lastCommit.subject, 'Work left behind');

  // Once it lands in main it is not in flight any more, by either route.
  runGit(primary, 'merge', '--ff-only', abandoned.branch);
  assert.deepEqual((await scanActivity(primary)).branches, []);
});

test('a branch checked out in a worktree is never double-reported as worktree-less', async (t) => {
  const { primary } = makeRepo(t);
  const busy = addWorktree(primary, 'attached');
  commitInWorktree(busy.path, 'Attached work');

  const { worktrees, branches } = await scanActivity(primary);

  assert.deepEqual(worktrees.map((entry) => entry.branch), [busy.branch]);
  assert.deepEqual(branches, []);
});

test('activity scan drops a branch once its work is merged into main', async (t) => {
  const { primary } = makeRepo(t);
  const landed = addWorktree(primary, 'landed');
  commitInWorktree(landed.path, 'Work that lands');
  assert.equal((await scanActivity(primary)).worktrees.length, 1);

  runGit(primary, 'merge', '--ff-only', landed.branch);

  const { worktrees, branches } = await scanActivity(primary);
  assert.deepEqual(worktrees, []);
  assert.deepEqual(branches, []);
});

test('overlap detection matches only worktrees touching the given files', async (t) => {
  const { primary } = makeRepo(t);
  const busy = addWorktree(primary, 'overlap');
  commitInWorktree(busy.path, 'Touch feature.txt');

  const { worktrees: activity } = await scanActivity(primary);

  const hit = overlapping(activity, ['src/other.ts', 'feature.txt']);
  assert.deepEqual(hit.map((h) => h.entry.branch), [busy.branch]);
  assert.deepEqual(hit[0].files, ['feature.txt']);
  assert.deepEqual(overlapping(activity, ['src/other.ts']), []);
});

test('reattach gate accepts only clean, reachable detached HEAD state', (t) => {
  const { primary } = makeRepo(t);
  runGit(primary, 'switch', '--detach');

  const clean = assessReattach(primary);
  assert.equal(clean.safe, true);

  writeFileSync(join(primary, 'uncommitted.txt'), 'keep\n');
  const dirty = assessReattach(primary);
  assert.equal(dirty.safe, false);
  assert.match(dirty.reason, /not clean/);
});

test('reattach gate rejects a detached commit not reachable from any branch or remote', (t) => {
  const { primary } = makeRepo(t);
  runGit(primary, 'switch', '--detach');
  writeFileSync(join(primary, 'unique.txt'), 'unique\n');
  runGit(primary, 'add', 'unique.txt');
  runGit(primary, 'commit', '-m', 'Unique detached work');

  const assessment = assessReattach(primary);

  assert.equal(assessment.safe, false);
  assert.match(assessment.reason, /not reachable from any branch or remote/);
});

// --- The opt-in `fromBranch` widening -------------------------------------------------------
//
// This one option lets the gate say yes to a state it used to refuse, so every condition it
// still enforces gets a test that makes it fire. Loosening a guard without watching it refuse
// is how a guard quietly becomes decoration.

test('reattach gate accepts the root sitting on the branch the caller named', (t) => {
  const { primary } = makeRepo(t);
  runGit(primary, 'switch', '-c', 'claude/finished-work');

  const strict = assessReattach(primary);
  assert.equal(strict.safe, false, 'without the option this is still refused');
  assert.match(strict.reason, /on branch claude\/finished-work/);

  const opted = assessReattach(primary, { fromBranch: 'claude/finished-work' });
  assert.equal(opted.safe, true);
  assert.equal(opted.attached, true);
  assert.equal(opted.branch, 'claude/finished-work');
});

test('reattach gate refuses a branch other than the one the caller named', (t) => {
  const { primary } = makeRepo(t);
  runGit(primary, 'switch', '-c', 'claude/somebody-elses-work');

  const assessment = assessReattach(primary, { fromBranch: 'claude/finished-work' });

  assert.equal(assessment.safe, false);
  assert.match(assessment.reason, /on branch claude\/somebody-elses-work/);
});

test('reattach gate still refuses a dirty tree, an in-progress op and an occupied main', (t) => {
  const { primary, root } = makeRepo(t);
  const branch = 'claude/finished-work';
  runGit(primary, 'switch', '-c', branch);
  const opts = { fromBranch: branch };
  assert.equal(assessReattach(primary, opts).safe, true, 'baseline must be safe, or nothing below proves anything');

  // Dirty: an untracked file is enough - switching would carry it onto main.
  writeFileSync(join(primary, 'uncommitted.txt'), 'keep\n');
  const dirty = assessReattach(primary, opts);
  assert.equal(dirty.safe, false);
  assert.match(dirty.reason, /not clean/);
  rmSync(join(primary, 'uncommitted.txt'));
  assert.equal(assessReattach(primary, opts).safe, true);

  // Mid-flight git operation: the marker file is what the gate reads, so plant exactly that.
  const gitDir = runGit(primary, 'rev-parse', '--absolute-git-dir');
  writeFileSync(join(gitDir, 'MERGE_HEAD'), `${runGit(primary, 'rev-parse', 'HEAD')}\n`);
  const midMerge = assessReattach(primary, opts);
  assert.equal(midMerge.safe, false);
  assert.match(midMerge.reason, /operation is in progress/);
  rmSync(join(gitDir, 'MERGE_HEAD'));
  assert.equal(assessReattach(primary, opts).safe, true);

  // main taken by another worktree: it is not ours to switch to. It has to live OUTSIDE the
  // primary checkout, or adding it makes the tree dirty and the earlier check answers first.
  runGit(primary, 'worktree', 'add', join(root, 'holds-main'), 'main');
  const occupied = assessReattach(primary, opts);
  assert.equal(occupied.safe, false);
  assert.match(occupied.reason, /checked out in another worktree/);
});

test('reattach gate never treats main itself as a fromBranch', (t) => {
  const { primary } = makeRepo(t);

  // The root is already on main; naming it must not turn "nothing to do" into an action.
  const assessment = assessReattach(primary, { fromBranch: 'main' });

  assert.equal(assessment.safe, false);
  assert.equal(assessment.onMain, true);
  assert.match(assessment.reason, /already on main/);
});

test('a landed worktree is reclaimable however far the local main has drifted behind origin', async (t) => {
  // THE MERGE QUEUE STOPPED FAST-FORWARDING THE LAPTOP. Deletion used to require containment in
  // BOTH the local `main` and `origin/main`, which cost nothing while every landing moved the
  // local ref too. GitHub's queue never touches this machine: the local ref stops dead, the AND
  // turns into a refusal, and the worktrees this command exists to reclaim are the exact ones it
  // starts refusing. Measured with the local ref ten commits behind - three landed worktrees each
  // reported as "has commits not in main", at about a gigabyte apiece.
  const { primary } = makeRepo(t);
  const worktree = addWorktree(primary, 'landed-work');
  commitInWorktree(worktree.path, 'Work the queue has landed');
  runGit(worktree.path, 'push', '-u', 'origin', worktree.branch);

  // The queue lands it on origin. Nothing moves the local main, exactly as now.
  runGit(primary, 'push', 'origin', `${worktree.branch}:main`);
  runGit(primary, 'fetch', 'origin');
  const behind = runGit(primary, 'rev-list', '--count', 'main..origin/main');
  assert.equal(behind, '1', 'the local main is behind, which is the whole point of the case');

  const plan = assess(primary);
  const entry = plan.worktrees.find((w) => w.branch === worktree.branch);
  assert.equal(entry.action, 'remove', entry.why);
  assert.match(entry.why, /contained in main and origin\/main/);
});

test('work that exists only on the local main is still refused - the direction the pair was guarding', async (t) => {
  // Dropping the local half of the test must not drop this: a branch merged into a local main
  // that was never pushed is NOT backed up off this machine, and deleting its worktree loses it.
  const { primary } = makeRepo(t);
  const worktree = addWorktree(primary, 'local-only');
  commitInWorktree(worktree.path, 'Merged locally, never pushed');
  runGit(primary, 'merge', '--no-ff', '-m', 'Local merge', worktree.branch);
  runGit(primary, 'fetch', 'origin');

  const plan = assess(primary);
  const entry = plan.worktrees.find((w) => w.branch === worktree.branch);
  assert.equal(entry.action, 'skip');
  assert.match(entry.why, /only contained in local main, not origin\/main/, entry.why);
});
