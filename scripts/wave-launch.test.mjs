// The launch ledger's arithmetic: percentile edges, joining a launch to its queueing and landing,
// and the per-size stats the horizon reads. The point of the file is that a night can MEASURE how
// long a unit takes instead of the loop guessing, so what is pinned is that the join takes the
// right merge job and the stats count only finished rows.
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { joinDurations, percentile, readProgress, recordLaunch, recordProgress, statsBySize } from './wave-launch.mjs';

const T = (min) => Date.parse('2026-09-04T20:00:00Z') + min * 60_000;

test('percentile is nearest-rank and empty answers null, never zero', () => {
  assert.equal(percentile([], 0.9), null);
  assert.equal(percentile([5], 0.9), 5);
  assert.equal(percentile([10, 20, 30, 40, 50], 0.9), 50);
  assert.equal(percentile([10, 20, 30, 40, 50], 0.5), 30);
});

test('repair attempts preserve original elapsed time, even when the ledger is out of order', () => {
  const launches = [
    { branch: 'claude/a', at: T(123), letter: 'A', size: 'small' },
    { branch: 'claude/a', at: T(0), letter: 'A', size: 'standard' },
  ];
  const jobs = [
    { kind: 'merge', branch: 'claude/a', enqueuedAt: T(-3) }, // before the task - ignored
    { kind: 'merge', branch: 'claude/a', enqueuedAt: T(128) },
  ];
  const landings = [{ branch: 'claude/a', at: T(160) }];
  const [row] = joinDurations(launches, jobs, landings);
  assert.equal(row.toQueueMin, 128);
  assert.equal(row.toLandMin, 160);
  assert.equal(row.size, 'standard', 'a small repair does not reclassify the entire task');
  assert.deepEqual(row.attempts.map((attempt) => attempt.launchedAt), [T(0), T(123)]);
});

test('a repair after queueing retains first declaration and separately records attempts', () => {
  const launches = [0, 123, 123].map((min) => ({ v: 1, branch: 'claude/a', at: T(min), size: 'standard' }));
  const jobs = [95, 128].map((min) => ({ kind: 'merge', branch: 'claude/a', enqueuedAt: T(min) }));
  const [row] = joinDurations(launches, jobs, []);
  assert.equal(row.toQueueMin, 95);
  assert.equal(row.attempts.length, 2, 'duplicate records do not inflate the attempt count');
  assert.equal(row.toLandMin, null);
});

test('a launched row with no merge yet reports null, so the caller can count what is still running', () => {
  const [row] = joinDurations([{ branch: 'claude/b', at: T(0), size: 'small' }], [], []);
  assert.equal(row.toQueueMin, null);
  assert.equal(row.toLandMin, null);
});

test('statsBySize counts only finished rows, per size', () => {
  const rows = [
    { size: 'small', toQueueMin: 60 },
    { size: 'small', toQueueMin: 90 },
    { size: 'small', toQueueMin: null }, // still running - not counted
    { size: 'standard', toQueueMin: 150 },
  ];
  const stats = statsBySize(rows);
  assert.equal(stats.small.n, 2);
  assert.equal(stats.small.p90, 90);
  assert.equal(stats.standard.n, 1);
  assert.equal(stats.large.n, 0);
  assert.equal(stats.large.p90, null);
});

// PROGRESS FROM A ROW WHOSE WORKTREE DID NOT EXIST AT LAUNCH. The Claude Agent tool creates a
// row's worktree only after the call that starts it, so a coordinator cannot pass `--worktree`
// when it records the launch first, and a record written after the call races the row's first
// report. Night wave 2026-09-28 recorded first: every progress report from rows H to Q was refused
// with one message, because the launch had no worktree to compare. On 2026-09-26 row K reported
// seven seconds before its after-the-call record existed, from the harness branch it had not yet
// renamed, and was refused the same way.
const SHA = 'a'.repeat(40);

function withStore(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'wave-launch-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('a row recorded before the Agent tool made its worktree reports progress (night 2026-09-28, row K)', () => {
  const run = (cwd, args, env = {}) => {
    const res = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, env: { ...process.env, ...env } });
    assert.equal(res.status, 0, res.stderr);
    return res.stdout.trim();
  };
  withStore((dir) => {
    const repo = path.join(dir, 'repo');
    const store = path.join(dir, 'store');
    const script = fileURLToPath(new URL('./wave-launch.mjs', import.meta.url));
    const cli = (cwd, ...args) => spawnSync(process.execPath, [script, ...args], {
      cwd, encoding: 'utf8', windowsHide: true, env: { ...process.env, NOACG_JOBS_DIR: store } });
    run(dir, ['init', '-q', repo]);
    run(repo, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'base']);

    // The coordinator's command that night, verbatim apart from the plan: no --worktree.
    const record = cli(repo, 'record', '--letter', 'K', '--branch', 'claude/k-plain-readme', '--size', 'small',
      '--host', 'claude-code', '--worker-id', 'night-0928-k');
    assert.equal(record.status, 0, record.stderr);

    // Only now does the harness mint the row's worktree, on a branch of its own naming.
    const tree = path.join(dir, 'agent-a40824a7907c462ab');
    run(repo, ['worktree', 'add', '-q', '-b', 'worktree-agent-a40824a7907c462ab', tree]);
    const report = (...extra) => cli(tree, 'progress', '--worker-id', 'night-0928-k', '--state', 'running', ...extra);

    const early = report('--next-action', 'reading before the rename');
    assert.equal(early.status, 0, `a report before the branch rename is accepted: ${early.stderr}`);
    run(tree, ['branch', '-m', 'claude/k-plain-readme']);
    const renamed = report('--next-action', 'Reading README and landing story');
    assert.equal(renamed.status, 0, `the row's own first report is accepted: ${renamed.stderr}`);

    const rows = readProgress(store);
    assert.deepEqual(rows.map((row) => row.branch), ['claude/k-plain-readme', 'claude/k-plain-readme'],
      'a report is filed under its launch, whatever the checkout calls its branch');
    assert.deepEqual(rows.map((row) => row.worktree), [tree, tree], 'the checkout a report came from is kept beside it');
  });
});

test('an old attempt still cannot report for its replacement, and a recorded worktree still binds', () => {
  withStore((dir) => {
    const worktree = path.join(dir, 'row');
    recordLaunch(dir, { letter: 'K', branch: 'claude/k', size: 'small', host: 'claude-code', workerId: 'k-1', now: 1 });
    recordProgress(dir, { worktree, workerId: 'k-1', sha: SHA, state: 'running', nextAction: 'start', now: 2 });

    recordLaunch(dir, { letter: 'K', branch: 'claude/k', size: 'small', host: 'claude-code', workerId: 'k-2', now: 3 });
    assert.throws(() => recordProgress(dir, { worktree, workerId: 'k-1', sha: SHA, state: 'ready', nextAction: 'x', now: 4 }),
      /replaced/);
    recordProgress(dir, { worktree, workerId: 'k-2', sha: SHA, state: 'running', nextAction: 'start', now: 4 });

    assert.throws(() => recordProgress(dir, { worktree, workerId: 'nobody', sha: SHA, state: 'running', nextAction: 'x', now: 5 }),
      /no launch is recorded for worker ID nobody/);

    recordLaunch(dir, { letter: 'C', branch: 'codex/c', size: 'small', host: 'codex', workerId: 'c-1', worktree: path.join(dir, 'assigned'), now: 6 });
    assert.throws(() => recordProgress(dir, { worktree: path.join(dir, 'elsewhere'), workerId: 'c-1', sha: SHA, state: 'running', nextAction: 'x', now: 7 }),
      /names worktree/);
    recordProgress(dir, { worktree: path.join(dir, 'assigned'), workerId: 'c-1', sha: SHA, state: 'running', nextAction: 'x', now: 7 });
  });
});

test('a worker ID names one attempt: recording it again is refused', () => {
  withStore((dir) => {
    recordLaunch(dir, { branch: 'claude/k', size: 'small', workerId: 'k-1', now: 1 });
    assert.throws(() => recordLaunch(dir, { branch: 'claude/k', size: 'small', workerId: 'k-1', now: 2 }), /already names/);
    assert.throws(() => recordLaunch(dir, { branch: 'claude/other', size: 'small', workerId: 'k-1', now: 2 }), /already names/);
  });
});
