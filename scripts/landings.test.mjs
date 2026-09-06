// The ledger sync: what GitHub landed that the local ledger does not know, in the ledger's shape.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { missingEntries, syncLandings, worktreeLookup } from './landings.mjs';

test('worktreeLookup maps a branch to its checkout from git worktree list --porcelain', () => {
  const lookup = worktreeLookup('worktree C:/claude/NoaCG-Studio\nHEAD abc\nbranch refs/heads/main\n\nworktree C:\\claude\\NoaCG-Studio\\.claude\\worktrees\\x\nHEAD def\nbranch refs/heads/claude/x\n\nworktree C:/claude/detached\nHEAD 123\ndetached\n');
  assert.equal(lookup('claude/x'), 'C:/claude/NoaCG-Studio/.claude/worktrees/x');
  assert.equal(lookup('main'), 'C:/claude/NoaCG-Studio');
  assert.equal(lookup('claude/gone'), null);
  assert.equal(worktreeLookup('')('main'), null);
});

const pr = (n, over = {}) => ({
  number: n, headRefName: `claude/b${n}`, headRefOid: `${n}`.repeat(8), mergeCommit: { oid: `m${n}`.repeat(4) },
  mergedAt: `2026-09-06T10:0${n}:00Z`, ...over,
});

test('missingEntries skips shas and pull requests the ledger already holds, and unmerged ones', () => {
  const ledger = [JSON.stringify({ branch: 'claude/b1', sha: 'm1m1m1m1', at: 1 }), JSON.stringify({ branch: 'x', sha: 'zz', pr: 3, at: 2 }), '{torn'];
  const out = missingEntries(ledger, [pr(1), pr(2), pr(3), pr(4, { mergedAt: null })]);
  assert.deepEqual(out.map((e) => e.pr), [2]);
  assert.equal(out[0].sha, 'm2m2m2m2');
  assert.equal(out[0].worktree, null);
  assert.equal(out[0].branch, 'claude/b2');
});

test('syncLandings appends the missing entries and is silent when gh cannot answer', () => {
  const dir = mkdtempSync(join(tmpdir(), 'landings-'));
  const worktrees = () => (branch) => (branch === 'claude/b1' ? 'C:/wt/b1' : null);
  assert.deepEqual(syncLandings(dir, { fetch: () => null, worktrees }), []);
  const added = syncLandings(dir, { fetch: () => [pr(2), pr(1)], worktrees });
  assert.deepEqual(added.map((e) => e.pr), [1, 2], 'oldest first');
  assert.equal(added[0].worktree, 'C:/wt/b1', 'the landing belongs to the checkout that holds the branch');
  assert.equal(added[1].worktree, null);
  const lines = readFileSync(join(dir, 'landed.jsonl'), 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  assert.deepEqual(syncLandings(dir, { fetch: () => [pr(2), pr(1)], worktrees }), [], 'a second sync adds nothing');
  writeFileSync(join(dir, 'landed.jsonl'), `${lines.join('\n')}\n`);
  rmSync(dir, { recursive: true, force: true });
});
