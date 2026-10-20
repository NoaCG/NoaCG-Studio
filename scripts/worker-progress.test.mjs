// gate: build
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { launchedAt, main, observe, progress } from './worker-progress.mjs';

const NOW = Date.parse('2030-01-01T12:00:00Z');
const minutesAgo = (m) => new Date(NOW - m * 60_000).toISOString();
// A fake git/gh: each command answers with what it was given, or fails. `gh api` is the pull
// request lookup, a merge_group run list the merge queue's runs, any other gh call the branch's runs.
const fake = (answers) => (command, args) => {
  const key = command !== 'gh' ? args[0] : args[0] === 'api' ? 'pr' : args.includes('merge_group') ? 'queue' : 'ci';
  const answer = answers[key];
  return answer === undefined ? { status: 1, stdout: '' } : { status: 0, stdout: `${answer}\n` };
};
const runs = (...list) => JSON.stringify(list.map(([status, minutes, started = minutes]) => ({ status, createdAt: minutesAgo(started), updatedAt: minutesAgo(minutes) })));
const branchAt = (minutes) => ({ 'ls-remote': `${'a'.repeat(40)}\trefs/heads/feature`, fetch: '', log: minutesAgo(minutes) });

test('the newest activity decides; 30 minutes without any is idle', () => {
  assert.equal(progress([{ source: 'commit', at: minutesAgo(45) }, { source: 'ci', at: minutesAgo(5) }], NOW).state, 'progressing');
  const idle = progress([{ source: 'commit', at: minutesAgo(45) }, { source: 'ci', at: minutesAgo(31) }], NOW);
  assert.equal(idle.state, 'idle');
  assert.equal(idle.idleMinutes, 31);
  assert.equal(idle.lastActivity, minutesAgo(31));
  assert.equal(progress([{ source: 'commit', at: minutesAgo(31) }], NOW, 60).state, 'progressing');
});

test('nothing readable is unknown, never idle', () => {
  assert.equal(progress([], NOW).state, 'unknown');
  assert.equal(progress([], NOW, 30, minutesAgo(90)).state, 'unknown');
  assert.deepEqual(observe({ branch: 'feature' }, fake({})), []);
  // No branch yet and no CI runs: the coordinator reconciles the worker instead of replacing it.
  assert.deepEqual(observe({ branch: 'feature' }, fake({ ci: '[]' })), []);
  assert.equal(main(['--branch', 'feature', '--since', minutesAgo(90)], { now: NOW, run: fake({ ci: '[]' }), print() {} }), 2);
});

test('the clock starts at the launch: a fresh branch cut from main is not idle at once', () => {
  // The branch tip is main's last commit, two hours old; the worker was launched five minutes ago.
  const sources = observe({ branch: 'feature' }, fake(branchAt(120)));
  assert.equal(progress(sources, NOW).state, 'idle');
  const fresh = progress(sources, NOW, 30, minutesAgo(5));
  assert.equal(fresh.state, 'progressing');
  assert.equal(fresh.lastActivity, minutesAgo(5));
  // Still nothing 31 minutes after the launch is idle, counted from the launch.
  const stale = progress(sources, NOW, 30, minutesAgo(31));
  assert.deepEqual([stale.state, stale.idleMinutes], ['idle', 31]);
  assert.equal(main(['--branch', 'feature', '--since', minutesAgo(5)], { now: NOW, run: fake(branchAt(120)), print() {} }), 0);
});

test('a running Actions run is activity however long it has run; a queued one for its first hour', () => {
  // A 60-minute endurance run, last updated at its start 40 minutes ago, or a run queued as long.
  for (const status of ['in_progress', 'queued']) {
    const sources = observe({ branch: 'feature' }, fake({ ...branchAt(50), ci: runs([status, 40], ['completed', 45]) }));
    const result = progress(sources, NOW, 30, minutesAgo(55));
    assert.deepEqual([result.state, result.idleMinutes, result.lastActivity], ['progressing', 0, minutesAgo(0)], status);
  }
  // Running for 80 minutes is still the worker's; queued for 80 is GitHub's capacity, not the worker.
  const long = (status) => progress(observe({ branch: 'feature' }, fake({ ...branchAt(85), ci: runs([status, 80]) })), NOW, 30, minutesAgo(90));
  assert.equal(long('in_progress').state, 'progressing');
  assert.deepEqual([long('queued').state, long('queued').idleMinutes], ['queued', 80]);
  assert.equal(main(['--branch', 'feature', '--since', minutesAgo(90)], { now: NOW, run: fake({ ...branchAt(85), ci: runs(['queued', 80]) }), print() {} }), 3);
  // One waiting for approval, or queued since before the launch, is not this worker's activity.
  for (const ci of [runs(['waiting', 40]), runs(['queued', 40, 90])]) {
    assert.equal(progress(observe({ branch: 'feature' }, fake({ ...branchAt(50), ci })), NOW, 30, minutesAgo(55)).state, 'idle');
  }
  const finished = observe({ branch: 'feature' }, fake({ ...branchAt(50), ci: runs(['completed', 40]) }));
  assert.equal(progress(finished, NOW, 30, minutesAgo(55)).state, 'idle');
});

test('the ledger names the in-flight step\'s launch, or its latest handoff', () => {
  const ledger = (lines) => `# Plan run\n\n## Phases\n1. One\n\n${lines.map(([m, e]) => `- ${minutesAgo(m)} phase 1 ${e} {"actor":"a"}`).join('\n')}\n`;
  assert.equal(launchedAt(ledger([[90, 'build'], [60, 'landed'], [50, 'check']])), minutesAgo(50));
  assert.equal(launchedAt(ledger([[90, 'build'], [20, 'resume']])), minutesAgo(20));
  assert.equal(launchedAt('# empty\n'), null);
  const dir = mkdtempSync(path.join(tmpdir(), 'worker-progress-wave-'));
  try {
    const wave = path.join(dir, 'wave.md');
    writeFileSync(wave, ledger([[10, 'build']]));
    assert.equal(main(['--branch', 'feature', '--wave', wave], { now: NOW, run: fake(branchAt(120)), print() {} }), 0);
    writeFileSync(wave, '# nothing launched\n');
    assert.equal(main(['--branch', 'feature', '--wave', wave], { now: NOW, run: fake(branchAt(120)), print() {} }), 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('commit, CI and session log times are all observed', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'worker-progress-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const log = path.join(dir, 'session.log');
  writeFileSync(log, 'line');
  utimesSync(log, new Date(NOW - 2 * 60_000), new Date(NOW - 2 * 60_000));
  const sources = observe({ branch: 'feature', log }, fake({ ...branchAt(50), ci: runs(['completed', 40]) }));
  assert.deepEqual(sources.map((s) => s.source), ['commit', 'ci', 'log']);
  assert.equal(progress(sources, NOW).state, 'progressing');
});

test('the session\'s newest event and the pull request\'s merge-queue run are activity too', () => {
  // The worker has pushed nothing for 50 minutes, but its session answered 5 minutes ago.
  const session = observe({ branch: 'feature', eventAt: minutesAgo(5) }, fake(branchAt(50)));
  assert.deepEqual(session.map((s) => s.source), ['commit', 'session']);
  assert.equal(progress(session, NOW, 30, minutesAgo(55)).state, 'progressing');
  assert.equal(main(['--event-at', minutesAgo(5), '--since', minutesAgo(55)], { now: NOW, run: fake({}), print() {} }), 0);
  for (const bad of ['soon', '2030-01-01T11:55:00']) {
    assert.equal(main(['--branch', 'feature', '--event-at', bad], { now: NOW, run: fake(branchAt(50)), print() {} }), 2, `${bad} has no offset`);
  }
  // An event slightly ahead of the clock counts as now.
  const ahead = progress(observe({ eventAt: new Date(NOW + 60_000).toISOString() }, fake({})), NOW);
  assert.equal(ahead.lastActivity, minutesAgo(0));
  // Its pull request #42 waits in the merge queue: the queue's run is running, another PR's is not this worker's.
  const queue = JSON.stringify([
    { headBranch: 'gh-readonly-queue/main/pr-42-abc', status: 'in_progress', createdAt: minutesAgo(10), updatedAt: minutesAgo(10) },
    { headBranch: 'gh-readonly-queue/main/pr-421-abc', status: 'in_progress', createdAt: minutesAgo(10), updatedAt: minutesAgo(10) },
  ]);
  const queued = observe({ branch: 'feature' }, fake({ ...branchAt(50), ci: runs(['completed', 45]), pr: '42', queue }));
  assert.deepEqual(queued.map((s) => [s.source, s.running ?? null]), [['commit', null], ['ci', null], ['merge-queue', minutesAgo(10)]]);
  assert.equal(progress(queued, NOW, 30, minutesAgo(55)).state, 'progressing');
  const other = observe({ branch: 'feature' }, fake({ ...branchAt(50), pr: '7', queue }));
  assert.deepEqual(other.map((s) => s.source), ['commit']);
});

test('a worker that stalls before its first push turns idle from its launch; one with no launch time stays unknown', () => {
  // ls-remote answers with nothing: read, no branch yet. No CI, no log.
  const unpushed = { 'ls-remote': '' };
  const sources = observe({ branch: 'feature' }, fake(unpushed));
  assert.deepEqual(sources, [{ source: 'branch', at: null }]);
  assert.deepEqual([progress(sources, NOW, 30, minutesAgo(40)).state, progress(sources, NOW, 30, minutesAgo(40)).idleMinutes], ['idle', 40]);
  assert.equal(progress(sources, NOW, 30, minutesAgo(10)).state, 'progressing');
  assert.equal(progress(sources, NOW).state, 'unknown', 'no launch time: nothing to count from');
  // git itself unreadable is not "nothing pushed": still unknown.
  assert.equal(progress(observe({ branch: 'feature' }, fake({})), NOW, 30, minutesAgo(40)).state, 'unknown');
  assert.equal(main(['--branch', 'feature', '--since', minutesAgo(40)], { now: NOW, run: fake(unpushed), print() {} }), 1);
});

test('a time far ahead of the clock is ignored, not renewed as now on every poll', () => {
  const ahead = (minutes) => progress(observe({ branch: 'feature', eventAt: new Date(NOW + minutes * 60_000).toISOString() }, fake(branchAt(50))), NOW, 30, minutesAgo(55));
  assert.equal(ahead(2).state, 'progressing', 'two minutes of skew is now');
  assert.deepEqual([ahead(60).state, ahead(60).idleMinutes], ['idle', 50], 'an hour ahead counts for nothing');
  // A launch time written by a fast clock is no floor either: an unpushed branch then has nothing to count from.
  const unpushed = observe({ branch: 'feature' }, fake({ 'ls-remote': '' }));
  assert.equal(progress(unpushed, NOW, 30, new Date(NOW + 40 * 60_000).toISOString()).state, 'unknown');
  // Nor may an old run, from before any real launch, then pass for this worker's activity.
  const old = observe({ branch: 'feature' }, fake({ ...branchAt(90), ci: runs(['in_progress', 80], ['queued', 85]) }));
  assert.equal(progress(old, NOW, 30, new Date(NOW + 40 * 60_000).toISOString()).state, 'unknown');
  assert.equal(progress(unpushed, NOW, 30, new Date(NOW + 60_000).toISOString()).state, 'progressing');
});

test('the command exits 1 for an idle worker, 0 for a progressing one, 2 for bad input', () => {
  const printed = [];
  assert.equal(main(['--branch', 'feature'], { now: NOW, run: fake(branchAt(90)), print: (s) => printed.push(s) }), 1);
  assert.equal(JSON.parse(printed[0]).state, 'idle');
  assert.equal(main(['--branch', 'feature'], { now: NOW, run: fake(branchAt(3)), print() {} }), 0);
  for (const argv of [['--nope', 'x'], ['--branch', 'feature', '--idle-minutes', '30m'], ['--idle-minutes', '30'], ['--branch', 'feature', '--since', 'yesterday'], ['--branch', 'feature', '--since', minutesAgo(5), '--wave', 'w.md']]) {
    assert.equal(main(argv, { now: NOW, run: fake(branchAt(90)), print() {} }), 2);
  }
});
