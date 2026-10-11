// A queued branch is frozen, verified the way docs/MISTAKE_TRIGGERS.md asks: real event JSON into
// the REAL guard files, against a throwaway git repository and a throwaway job store
// (NOACG_JOBS_DIR), so nothing here can touch the live queue. Pinned: a waiting or running
// landing refuses both a commit and an edit in that branch's checkout, and the refusal names the
// job and the way out; a landed, failed or cancelled job frees the branch; main and a detached
// HEAD are never frozen; no store at all fails open.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { runHook } from './test-lib.mjs';
import { frozenMessage } from './frozen-branch.mjs';

const COMMIT = new URL('./guard-command.mjs', import.meta.url);
const EDIT = new URL('./guard-edit.mjs', import.meta.url);

const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};

/** A fresh repository on branch `claude/frozen`, and an empty job store beside it. */
function scene() {
  const root = mkdtempSync(join(tmpdir(), 'frozen-'));
  const repo = join(root, 'repo');
  const store = join(root, 'jobs');
  mkdirSync(repo);
  mkdirSync(join(store, 'logs'), { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'root');
  git(repo, 'checkout', '-q', '-b', 'claude/frozen');
  writeFileSync(join(repo, 'note.txt'), 'x\n');
  return { root, repo, store };
}

function job(store, state, id = 'j-9001') {
  writeFileSync(join(store, `${id}.json`), JSON.stringify({
    id, kind: 'merge', branch: 'claude/frozen', state,
    command: 'node scripts/auto-merge.mjs --branch claude/frozen --expect-sha 0123456789abcdef',
    enqueuedAt: Date.now() - 60_000, startedAt: state === 'running' ? Date.now() - 30_000 : null,
    finishedAt: ['done', 'failed', 'cancelled'].includes(state) ? Date.now() - 1_000 : null,
    exitCode: state === 'done' ? 0 : state === 'failed' ? 1 : null,
  }));
}

const commitEvent = (repo) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: repo, tool_input: { command: 'git commit -m "more"' } });
const editEvent = (repo) => ({ hook_event_name: 'PreToolUse', tool_name: 'Edit', cwd: repo, tool_input: { file_path: join(repo, 'note.txt'), old_string: 'x', new_string: 'y' } });

test('a waiting landing freezes the branch: commit and edit are both refused, naming the job and the way out', () => {
  const { root, repo, store } = scene();
  try {
    job(store, 'waiting');
    const env = { NOACG_JOBS_DIR: store };
    const commit = runHook(COMMIT, commitEvent(repo), env, { cwd: repo });
    assert.equal(commit.status, 2, commit.message);
    assert.match(commit.message, /claude\/frozen is FROZEN - landing job j-9001 is waiting/);
    assert.match(commit.message, /node scripts\/jobs\.mjs cancel j-9001/);
    const edit = runHook(EDIT, editEvent(repo), env, { cwd: repo });
    assert.equal(edit.status, 2, edit.message);
    assert.match(edit.message, /Editing note\.txt/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a running landing freezes too, and says to let it finish', () => {
  const { root, repo, store } = scene();
  try {
    job(store, 'running');
    const commit = runHook(COMMIT, commitEvent(repo), { NOACG_JOBS_DIR: store }, { cwd: repo });
    assert.equal(commit.status, 2);
    assert.match(commit.message, /Let j-9001 finish/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a landed, failed or cancelled job frees the branch', () => {
  for (const state of ['done', 'failed', 'cancelled']) {
    const { root, repo, store } = scene();
    try {
      job(store, state);
      assert.equal(runHook(COMMIT, commitEvent(repo), { NOACG_JOBS_DIR: store }, { cwd: repo }).status, 0, state);
      assert.equal(runHook(EDIT, editEvent(repo), { NOACG_JOBS_DIR: store }, { cwd: repo }).status, 0, state);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('main and a detached HEAD are never frozen, and an empty store fails open', () => {
  const { root, repo, store } = scene();
  try {
    job(store, 'waiting');
    git(repo, 'checkout', '-q', 'main');
    assert.equal(runHook(COMMIT, commitEvent(repo), { NOACG_JOBS_DIR: store }, { cwd: repo }).status, 0);
    git(repo, 'checkout', '-q', '--detach');
    assert.equal(runHook(EDIT, editEvent(repo), { NOACG_JOBS_DIR: store }, { cwd: repo }).status, 0);
    git(repo, 'checkout', '-q', 'claude/frozen');
    assert.equal(runHook(COMMIT, commitEvent(repo), { NOACG_JOBS_DIR: join(root, 'nowhere') }, { cwd: repo }).status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('frozenMessage names the job, the state, and the way out', () => {
  const waiting = frozenMessage({ branch: 'claude/x', job: { id: 'j-1', state: 'waiting' }, what: 'commit' });
  assert.match(waiting, /^Blocked: claude\/x is FROZEN - landing job j-1 is waiting/);
  assert.match(waiting, /cancel j-1/);
  const running = frozenMessage({ branch: 'claude/x', job: { id: 'j-2', state: 'running' }, what: 'src/a.ts' });
  assert.match(running, /editing src\/a\.ts/i);
  assert.match(running, /Let j-2 finish/);
});
