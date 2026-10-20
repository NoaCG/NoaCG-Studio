// gate: build
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { launchedAt, main, observe, progress } from './worker-progress.mjs';

const NOW = Date.parse('2030-01-01T12:00:00Z');
const minutesAgo = (m) => new Date(NOW - m * 60_000).toISOString();
// A fake git/gh: each command answers with what it was given, or fails.
const fake = (answers) => (command, args) => {
  const key = command === 'gh' ? 'ci' : args[0];
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

test('a queued or running Actions run is activity however long it has run', () => {
  // A 60-minute endurance run, last updated at its start 40 minutes ago.
  for (const status of ['in_progress', 'queued']) {
    const sources = observe({ branch: 'feature' }, fake({ ...branchAt(50), ci: runs([status, 40], ['completed', 45]) }));
    const result = progress(sources, NOW, 30, minutesAgo(55));
    assert.deepEqual([result.state, result.idleMinutes, result.lastActivity], ['progressing', 0, minutesAgo(0)], status);
  }
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

test('the command exits 1 for an idle worker, 0 for a progressing one, 2 for bad input', () => {
  const printed = [];
  assert.equal(main(['--branch', 'feature'], { now: NOW, run: fake(branchAt(90)), print: (s) => printed.push(s) }), 1);
  assert.equal(JSON.parse(printed[0]).state, 'idle');
  assert.equal(main(['--branch', 'feature'], { now: NOW, run: fake(branchAt(3)), print() {} }), 0);
  for (const argv of [['--nope', 'x'], ['--branch', 'feature', '--idle-minutes', '30m'], ['--idle-minutes', '30'], ['--branch', 'feature', '--since', 'yesterday'], ['--branch', 'feature', '--since', minutesAgo(5), '--wave', 'w.md']]) {
    assert.equal(main(argv, { now: NOW, run: fake(branchAt(90)), print() {} }), 2);
  }
});
