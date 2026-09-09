// Resolving the primary checkout from a linked worktree, without asking git. The three shapes a
// `.git` entry takes are three different answers, and the one that matters - a linked worktree
// reaching its primary checkout - is how a gitignored per-machine file gets read at all.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { gitCommonDir, primaryCheckout } from './primary-checkout.mjs';

const temp = (prefix) => mkdtempSync(path.join(tmpdir(), prefix));

test('a checkout whose .git is a directory is its own primary checkout', () => {
  const root = temp('primary-');
  mkdirSync(path.join(root, '.git'));
  assert.equal(primaryCheckout(root), root);
  assert.equal(gitCommonDir(root), path.join(root, '.git'));
});

test('a linked worktree reaches the checkout that holds the shared git directory', () => {
  const primary = temp('primary-');
  const admin = path.join(primary, '.git', 'worktrees', 'w');
  mkdirSync(admin, { recursive: true });
  writeFileSync(path.join(admin, 'commondir'), '../..\n');
  const worktree = path.join(primary, 'nested', 'w');
  mkdirSync(worktree, { recursive: true });
  writeFileSync(path.join(worktree, '.git'), `gitdir: ${admin}\n`);

  assert.equal(primaryCheckout(worktree), primary);
  assert.equal(gitCommonDir(worktree), path.join(primary, '.git'));
});

test('a relative pointer resolves against the worktree, as --relative-paths writes it', () => {
  const primary = temp('primary-');
  const admin = path.join(primary, '.git', 'worktrees', 'w');
  mkdirSync(admin, { recursive: true });
  writeFileSync(path.join(admin, 'commondir'), '../..\n');
  const worktree = path.join(primary, 'w');
  mkdirSync(worktree);
  writeFileSync(path.join(worktree, '.git'), 'gitdir: ../.git/worktrees/w\n');
  assert.equal(primaryCheckout(worktree), primary);
});

test('a pointer with no commondir is a checkout whose git directory merely lives elsewhere', () => {
  // `--separate-git-dir` and a submodule both look like a linked worktree from the outside. Taking
  // two directories off the pointer would answer somewhere above the git directory, which is how a
  // read of a per-machine file lands in a folder that has never held one.
  const root = temp('separate-');
  const elsewhere = temp('gitdir-');
  writeFileSync(path.join(root, '.git'), `gitdir: ${elsewhere}\n`);
  assert.equal(primaryCheckout(root), root);
  assert.equal(gitCommonDir(root), elsewhere);
});

test('no .git at all answers the directory it was asked about', () => {
  const root = temp('bare-');
  assert.equal(primaryCheckout(root), root);
  assert.equal(gitCommonDir(root), null);
  // A `.git` file that is not a pointer is not a checkout either, and must not throw.
  writeFileSync(path.join(root, '.git'), 'not a gitdir line\n');
  assert.equal(primaryCheckout(root), root);
  assert.equal(gitCommonDir(root), null);
});
