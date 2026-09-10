// What the merge driver does with a conflicted generated contract, and what it refuses to guess.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DRIVER_NAME, install, isInstalled } from './contracts-merge-driver.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRIVER = path.join(ROOT, 'scripts', 'contracts-merge-driver.mjs');

// Both streams: the driver reports a target it cannot produce on stderr, and that report is the
// whole behaviour under test - a merge that carries on quietly is the failure it exists to avoid.
const run = (args, cwd = ROOT, env = process.env) => {
  const result = spawnSync(process.execPath, [DRIVER, ...args], { cwd, env, encoding: 'utf8', windowsHide: true });
  return { status: result.status, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
};

test('installing registers a command with the four placeholders git passes, and is idempotent', () => {
  // Use a disposable repository. The checkout running the suite may deliberately expose its Git
  // metadata read-only, and a test of the installer must not mutate the developer's real config.
  const dir = mkdtempSync(path.join(tmpdir(), 'merge-driver-install-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, encoding: 'utf8' });
    assert.equal(install(dir), true);
    const configured = execFileSync('git', ['config', '--get', `merge.${DRIVER_NAME}.driver`], {
      cwd: dir,
      encoding: 'utf8',
    }).trim();
    assert.match(configured, /contracts-merge-driver\.mjs" %O %A %B %P$/);
    assert.equal(isInstalled(dir), true);
    assert.equal(install(dir), true, 'registering twice is a no-op, so every compile can do it');
    assert.equal(run(['--install'], ROOT, { ...process.env, GIT_DIR: path.join(dir, '.git') }).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('called with nothing useful it refuses rather than writing a file it guessed at', () => {
  const bad = run([]);
  assert.equal(bad.status, 2);
  assert.match(bad.out, /expects git's %O %A %B %P/);
});

test('a conflicted generated contract is replaced by what the store currently renders', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'merge-driver-'));
  const ours = path.join(dir, 'ours.md');
  writeFileSync(ours, '<<<<<<< HEAD\nboth sides of a file neither side is right about\n>>>>>>> theirs\n', 'utf8');
  // The target is a real generated file in this checkout, which is what the driver regenerates.
  const result = run([path.join(dir, 'base.md'), ours, path.join(dir, 'theirs.md'), '.claude/rules/everywhere.md']);
  assert.equal(result.status, 0);
  const written = readFileSync(ours, 'utf8');
  assert.ok(!written.includes('<<<<<<<'), 'the conflict is gone');
  assert.equal(written, readFileSync(path.join(ROOT, '.claude/rules/everywhere.md'), 'utf8'));
  rmSync(dir, { recursive: true, force: true });
});

test('a target the merged store no longer produces leaves the file to git and says so', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'merge-driver-'));
  const ours = path.join(dir, 'ours.md');
  writeFileSync(ours, 'whatever git wrote', 'utf8');
  const result = run([path.join(dir, 'base.md'), ours, path.join(dir, 'theirs.md'), '.claude/rules/no-such-group.md']);
  assert.equal(result.status, 0, 'a merge never stops dead on a generated file');
  assert.match(result.out, /no longer produces/);
  assert.equal(readFileSync(ours, 'utf8'), 'whatever git wrote');
  rmSync(dir, { recursive: true, force: true });
});
