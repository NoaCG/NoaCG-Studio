// guards: scripts/cleanup-worktrees.mjs
//
// THE CLEANUP CAN NOW CLOSE PROCESSES, and that is a different kind of power from deleting a
// folder it has proved empty. What is pinned here is the shape of the one call it makes: it names
// the worktree being removed and NOTHING else, it never asks for every workspace on the machine,
// and it cannot take a cleanup down with it however badly the reap goes.
//
// The decision itself - which processes may be closed at all - is not here and must not be: it
// lives in `orphanedCodexTrees` (e2e-runs.test.mjs), where it is judged against real process
// tables including the owner's desktop Codex app.
import assert from 'node:assert/strict';
import test from 'node:test';

import { reapDelegationTrees, samePath } from './worktree-cleanup-lib.mjs';

const WORKTREE = 'C:/claude/NoaCG-Studio/.claude/worktrees/agent-abc123';

test('the reap is scoped to the worktree being removed, and to nothing else', () => {
  let seen = null;
  const out = reapDelegationTrees(WORKTREE, {
    run: (command, args) => {
      seen = { command, args };
      return { status: 0, stdout: 'No stale Codex jobs found.\n', stderr: '' };
    },
  });
  assert.equal(out.ok, true);
  assert.equal(out.output, 'No stale Codex jobs found.');
  assert.match(seen.args[0], /codex-rescue\.mjs$/);
  assert.deepEqual(seen.args.slice(1), ['reap', '--workspace', WORKTREE]);
  assert.equal(seen.args.includes('--all-workspaces'), false, 'never every workspace on the machine');
});

test('a reap that fails is reported, never thrown - the worktree still goes', () => {
  const threw = reapDelegationTrees(WORKTREE, {
    run: () => { throw new Error('spawn ENOENT'); },
  });
  assert.equal(threw.ok, false);
  assert.match(threw.output, /spawn ENOENT/);

  const failed = reapDelegationTrees(WORKTREE, {
    run: () => ({ status: 1, stdout: '', stderr: 'taskkill refused' }),
  });
  assert.equal(failed.ok, false);
  assert.match(failed.output, /taskkill refused/);

  // A timeout kills the child and leaves no output at all; that is still an answer, not a throw.
  const quiet = reapDelegationTrees(WORKTREE, { run: () => ({ status: null }) });
  assert.equal(quiet.ok, false);
  assert.equal(quiet.output, 'nothing to collect');
});

test('with no worktree path there is nothing to scope a reap to, so none is run', () => {
  let ran = false;
  const out = reapDelegationTrees('', { run: () => { ran = true; return { status: 0 }; } });
  assert.equal(ran, false);
  assert.equal(out.ok, false);
});

test('worktree paths compare the way Windows compares them', () => {
  // The reap's scope is matched against a recorded workspace path, so the two spellings this
  // machine produces - backslashes from git, forward slashes from the plugin - are one path.
  assert.equal(samePath('C:/claude/NoaCG-Studio', 'C:\\claude\\NoaCG-Studio'), true);
  assert.equal(samePath('C:/claude/NoaCG-Studio', 'c:/CLAUDE/noacg-studio'), true);
  assert.equal(samePath('C:/claude/NoaCG-Studio', 'C:/claude/NoaCG-Studio-2'), false);
});
