import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { aliasPinnedChromium, freshen } from './cloud-session-setup.mjs';

/** A browsers folder shaped like the cloud image's: build 1194 in the old `chrome-linux` layout. */
function imageWith1194() {
  const dir = mkdtempSync(join(tmpdir(), 'pw-browsers-'));
  for (const [folder, exe] of [['chromium', 'chrome'], ['chromium_headless_shell', 'headless_shell']]) {
    const bin = join(dir, `${folder}-1194`, 'chrome-linux');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, exe), '');
    writeFileSync(join(bin, 'icudtl.dat'), '');
    writeFileSync(join(dir, `${folder}-1194`, 'INSTALLATION_COMPLETE'), '');
  }
  return dir;
}

/** The alias is made of symlinks, and it only ever runs on the Linux cloud image. A Windows account
 *  without the symlink privilege (no Developer Mode, not elevated) refuses every one with EPERM,
 *  so there the test says why it skipped instead of failing the local build. */
function symlinksRefused() {
  const dir = mkdtempSync(join(tmpdir(), 'symlink-probe-'));
  try {
    writeFileSync(join(dir, 'target'), '');
    symlinkSync(join(dir, 'target'), join(dir, 'link'));
    return false;
  } catch (e) {
    return e.code === 'EPERM';
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const NO_SYMLINKS = symlinksRefused() ? 'this machine refuses symlinks (EPERM); the alias only runs on the Linux cloud image' : false;

test('a missing pinned build is pointed at the image build, under the new layout names', { skip: NO_SYMLINKS }, () => {
  const dir = imageWith1194();
  try {
    const linked = aliasPinnedChromium(dir, { chromium: '1228', 'chromium-headless-shell': '1228' });
    assert.deepEqual(linked, ['chromium-1228 -> chromium-1194', 'chromium_headless_shell-1228 -> chromium_headless_shell-1194']);
    // The executables Playwright 1228 launches, and the files beside them.
    assert.equal(readlinkSync(join(dir, 'chromium-1228', 'chrome-linux64', 'chrome')), join(dir, 'chromium-1194', 'chrome-linux', 'chrome'));
    assert.equal(
      readlinkSync(join(dir, 'chromium_headless_shell-1228', 'chrome-headless-shell-linux64', 'chrome-headless-shell')),
      join(dir, 'chromium_headless_shell-1194', 'chrome-linux', 'headless_shell'),
    );
    assert.ok(existsSync(join(dir, 'chromium-1228', 'chrome-linux64', 'icudtl.dat')));
    assert.ok(existsSync(join(dir, 'chromium-1228', 'INSTALLATION_COMPLETE')));
    // Idempotent: a second session start finds nothing to do.
    assert.deepEqual(aliasPinnedChromium(dir, { chromium: '1228', 'chromium-headless-shell': '1228' }), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a pinned build the image really has is left alone, and a missing folder is not an error', () => {
  const dir = imageWith1194();
  try {
    assert.deepEqual(aliasPinnedChromium(dir, { chromium: '1194', 'chromium-headless-shell': '1194' }), []);
    assert.deepEqual(aliasPinnedChromium(join(dir, 'nope'), { chromium: '1228' }), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- Step 0: freshness ------------------------------------------------------------------------
//
// A real repository in a temp folder: an "origin" with two commits on main, a primary clone that
// is one commit behind, and a linked worktree cut from that older commit, the shape the desktop
// app leaves a scheduled run in.

const run = (cwd, ...args) => {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`git ${args.join(' ')}: ${res.stderr}`);
  return res.stdout.trim();
};

function staleWorktree() {
  const base = mkdtempSync(join(tmpdir(), 'freshen-'));
  const origin = join(base, 'origin');
  mkdirSync(origin);
  run(origin, 'init', '-q', '-b', 'main');
  run(origin, 'config', 'user.email', 'test@example.com');
  run(origin, 'config', 'user.name', 'test');
  writeFileSync(join(origin, 'AGENTS.md'), 'old rules\n');
  run(origin, 'add', '.');
  run(origin, 'commit', '-q', '-m', 'one');
  const primary = join(base, 'primary');
  run(base, 'clone', '-q', origin, primary);
  writeFileSync(join(origin, 'AGENTS.md'), 'new rules\n');
  run(origin, 'commit', '-q', '-am', 'two');
  const worktree = join(primary, 'wt');
  run(primary, 'worktree', 'add', '-q', '-b', 'claude/scheduled', worktree);
  run(worktree, 'config', 'user.email', 'test@example.com');
  run(worktree, 'config', 'user.name', 'test');
  return { base, origin, primary, worktree };
}

test('freshness fast-forwards a clean stale worktree and re-prints a changed root AGENTS.md', () => {
  const { base, origin, worktree } = staleWorktree();
  try {
    const out = freshen(worktree, { source: 'startup' });
    assert.equal(run(worktree, 'rev-parse', 'HEAD'), run(origin, 'rev-parse', 'HEAD'));
    assert.match(out.line, /started 1 commit\(s\) behind origin\/main/);
    assert.match(out.line, /REPLACES the startup copy[\s\S]*new rules/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('freshness never moves the primary checkout, a detached HEAD, own work, a dirty tree or a resumed session', () => {
  const { base, origin, primary, worktree } = staleWorktree();
  try {
    const before = run(primary, 'rev-parse', 'HEAD');
    assert.equal(freshen(primary, { source: 'startup' }).line, '');
    assert.equal(run(primary, 'rev-parse', 'HEAD'), before, 'the primary checkout belongs to the merge queue');

    assert.equal(freshen(worktree, { source: 'resume' }).line, '');
    assert.equal(run(worktree, 'rev-parse', 'HEAD'), before, 'a resumed session is mid-work');

    writeFileSync(join(worktree, 'AGENTS.md'), 'an edit in progress\n');
    assert.match(freshen(worktree, { source: 'startup' }).line, /holds its own work, so it was left as it is/);
    run(worktree, 'checkout', '-q', '--', 'AGENTS.md');

    writeFileSync(join(worktree, 'mine.txt'), 'x\n');
    run(worktree, 'add', 'mine.txt');
    run(worktree, 'commit', '-q', '-m', 'own work');
    assert.match(freshen(worktree, { source: 'startup' }).line, /holds its own work/);
    assert.notEqual(run(worktree, 'rev-parse', 'HEAD'), run(origin, 'rev-parse', 'HEAD'));

    run(worktree, 'checkout', '-q', '--detach', before);
    assert.equal(freshen(worktree, { source: 'startup' }).line, '');
    assert.equal(run(worktree, 'rev-parse', 'HEAD'), before, 'a detached HEAD is pinned on purpose');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('freshness says so when origin cannot be reached, and moves nothing', () => {
  const { base, primary, worktree } = staleWorktree();
  try {
    run(primary, 'remote', 'set-url', 'origin', join(base, 'nowhere'));
    const before = run(worktree, 'rev-parse', 'HEAD');
    assert.match(freshen(worktree, { source: 'startup' }).line, /could not fetch origin\/main/);
    assert.equal(run(worktree, 'rev-parse', 'HEAD'), before);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
