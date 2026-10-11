// A follow-up in a chat whose work has landed: the session start gives it somewhere to work.
// guards: scripts/worktree-followup.mjs, scripts/hooks/session-start.mjs
//
// The owner, 2026-10-08: a session whose work landed must not "just disappear" - he often comes
// back to the same desktop chat. These cases drive the real SessionStart hook against a scratch
// repository the way Claude Code calls it (JSON on stdin), for both shapes: the worktree is still
// there on a landed branch, and the worktree was cleaned up before the chat was resumed. What the
// DESKTOP APP does when it reopens a chat whose folder is gone cannot be driven from here; that is
// recorded in docs/work-specs/worktree-lifecycle/evidence/.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { freshBranchName, lastWorkplace, moveOffLandedBranch, recoverRemovedWorktree } from './worktree-followup.mjs';
import { normalize } from './worktree-cleanup-lib.mjs';

const hook = join(dirname(fileURLToPath(import.meta.url)), 'hooks', 'session-start.mjs');

function runGit(cwd, ...args) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  assert.equal(res.status, 0, `git ${args.join(' ')} failed:\n${res.stderr || res.stdout}`);
  return res.stdout.trim();
}

function makeRepo(t) {
  const root = mkdtempSync(join(tmpdir(), 'noacg-followup-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const origin = join(root, 'origin.git');
  const primary = join(root, 'repo');
  runGit(root, 'init', '--bare', '--initial-branch=main', origin);
  runGit(root, 'clone', origin, primary);
  runGit(primary, 'config', 'user.name', 'Followup Tests');
  runGit(primary, 'config', 'user.email', 'followup-tests@example.invalid');
  writeFileSync(join(primary, '.gitignore'), '.claude/\n');
  runGit(primary, 'add', '.');
  runGit(primary, 'commit', '-m', 'Initial commit');
  runGit(primary, 'push', '-u', 'origin', 'main');
  const jobs = join(root, 'jobs');
  mkdirSync(jobs, { recursive: true });
  return { root, primary, jobs };
}

/** A worktree whose branch has landed: committed, pushed, origin/main moved to it, branch deleted on GitHub. */
function landedWorktree(primary, name) {
  const path = join(primary, '.claude', 'worktrees', name);
  const branch = `claude/${name}`;
  mkdirSync(dirname(path), { recursive: true });
  runGit(primary, 'worktree', 'add', '--no-track', '-b', branch, path, 'origin/main');
  writeFileSync(join(path, `${name}.txt`), 'work\n');
  runGit(path, 'add', '.');
  runGit(path, 'commit', '-m', `Work in ${name}`);
  runGit(path, 'push', 'origin', `${branch}:main`);
  runGit(primary, 'fetch', 'origin');
  return { path, branch };
}

function transcriptFor(root, cwd, branch, minutesAgo) {
  const file = join(root, `session-${Math.random().toString(36).slice(2)}.jsonl`);
  const at = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  writeFileSync(
    file,
    [
      JSON.stringify({ type: 'user', cwd, gitBranch: branch, timestamp: at }),
      JSON.stringify({ type: 'assistant', cwd, gitBranch: branch, timestamp: at }),
    ].join('\n') + '\n',
  );
  return file;
}

function runHook(repo, input) {
  const env = { ...process.env, NOACG_NO_AUTO_CLEANUP: '1', NOACG_JOBS_DIR: repo.jobs };
  delete env.CLAUDE_ENV_FILE;
  return spawnSync(process.execPath, [hook], { cwd: input.cwd, input: JSON.stringify(input), encoding: 'utf8', env, windowsHide: true });
}

test('a fresh branch name never reuses one that exists or has landed', () => {
  const taken = new Set(['claude/x-2', 'claude/x-3']);
  assert.equal(freshBranchName('claude/x', (name) => taken.has(name)), 'claude/x-4');
  assert.equal(freshBranchName('claude/x-7', () => false), 'claude/x-8');
});

test('a worktree on a landed branch moves to a fresh branch from origin/main - only when nothing would be lost', (t) => {
  const repo = makeRepo(t);
  const wt = landedWorktree(repo.primary, 'chat');
  const landed = new Set([wt.branch]);
  const noFetch = () => {};

  writeFileSync(join(wt.path, 'draft.txt'), 'unsaved\n');
  assert.equal(moveOffLandedBranch({ root: wt.path, branch: wt.branch, landed, refresh: noFetch }).kept, true);
  rmSync(join(wt.path, 'draft.txt'));

  assert.equal(moveOffLandedBranch({ root: wt.path, branch: wt.branch, landed: new Set(), refresh: noFetch }), null);

  const moved = moveOffLandedBranch({ root: wt.path, branch: wt.branch, landed, refresh: noFetch });
  assert.deepEqual(moved, { from: wt.branch, to: `${wt.branch}-2` });
  assert.equal(runGit(wt.path, 'rev-parse', '--abbrev-ref', 'HEAD'), `${wt.branch}-2`);
  assert.equal(runGit(wt.path, 'rev-parse', 'HEAD'), runGit(wt.path, 'rev-parse', 'origin/main'));

  // New commits after the landing are work in progress, not something to move away from.
  writeFileSync(join(wt.path, 'more.txt'), 'more\n');
  runGit(wt.path, 'add', '.');
  runGit(wt.path, 'commit', '-m', 'More work');
  assert.equal(
    moveOffLandedBranch({ root: wt.path, branch: `${wt.branch}-2`, landed: new Set([`${wt.branch}-2`]), refresh: noFetch }).kept,
    true,
  );
});

test('the session-start hook moves a resumed chat off its landed branch', (t) => {
  const repo = makeRepo(t);
  const wt = landedWorktree(repo.primary, 'resumed-chat');
  writeFileSync(join(repo.jobs, 'landed.jsonl'), `${JSON.stringify({ branch: wt.branch, sha: 'x', at: Date.now(), pr: 1 })}\n`);
  const res = runHook(repo, { cwd: wt.path, source: 'resume', hook_event_name: 'SessionStart' });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /moved to a fresh branch claude\/resumed-chat-2, cut from origin\/main/);
  assert.equal(runGit(wt.path, 'rev-parse', '--abbrev-ref', 'HEAD'), 'claude/resumed-chat-2');
});

test('a resumed chat whose worktree was cleaned up gets a fresh one at the same path', (t) => {
  const repo = makeRepo(t);
  const wt = landedWorktree(repo.primary, 'gone-chat');
  // What the sweep does once the chat has been quiet a day.
  runGit(repo.primary, 'worktree', 'remove', wt.path);
  runGit(repo.primary, 'merge', '--ff-only', '--quiet', 'origin/main');
  runGit(repo.primary, 'branch', '-d', wt.branch);
  assert.equal(existsSync(wt.path), false);
  writeFileSync(join(repo.jobs, 'landed.jsonl'), `${JSON.stringify({ branch: wt.branch, sha: 'x', at: Date.now(), pr: 2 })}\n`);
  const transcript = transcriptFor(repo.root, wt.path, wt.branch, 26 * 60);

  // Claude Code resumes a session whose worktree is gone in the directory it was launched from -
  // for a desktop chat, the repository itself.
  const res = runHook(repo, { cwd: repo.primary, source: 'resume', transcript_path: transcript, hook_event_name: 'SessionStart' });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /A fresh\s+worktree is ready at that path on branch claude\/gone-chat-2/);
  assert.match(res.stdout, /EnterWorktree/);
  assert.ok(runGit(repo.primary, 'worktree', 'list', '--porcelain').includes(normalize(wt.path)));
  assert.equal(runGit(wt.path, 'rev-parse', '--abbrev-ref', 'HEAD'), 'claude/gone-chat-2');
  assert.equal(runGit(wt.path, 'rev-parse', 'HEAD'), runGit(repo.primary, 'rev-parse', 'origin/main'));

  // Resumed again, nothing more happens: the worktree is there.
  assert.equal(
    recoverRemovedWorktree({ sessionCwd: repo.primary, primaryRoot: repo.primary, transcriptPath: transcript, landed: new Set(), refresh: () => {} }),
    null,
  );
});

test('a folder git does not know that still holds files is somebody\'s - it is never reused', (t) => {
  const repo = makeRepo(t);
  const path = join(repo.primary, '.claude', 'worktrees', 'stub');
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, 'notes.txt'), 'mine\n');
  const transcript = transcriptFor(repo.root, path, 'claude/stub', 60);
  assert.equal(recoverRemovedWorktree({ sessionCwd: repo.primary, primaryRoot: repo.primary, transcriptPath: transcript, landed: new Set(), refresh: () => {} }), null);
  assert.equal(lastWorkplace(transcript).branch, 'claude/stub');
  // Entries the resume itself wrote are not where the session WAS.
  assert.equal(lastWorkplace(transcript, { beforeMs: Date.now() - 2 * 60 * 60_000 }), null);
});
