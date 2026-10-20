// gate: build
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { main, observe, progress } from './worker-progress.mjs';

const NOW = Date.parse('2030-01-01T12:00:00Z');
const minutesAgo = (m) => new Date(NOW - m * 60_000).toISOString();
// A fake git/gh: each command answers with the time it was given, or fails.
const fake = (answers) => (command, args) => {
  const key = command === 'git' ? (args[0] === 'fetch' ? 'fetch' : 'commit') : args[0] === 'run' ? 'ci' : 'pr';
  const answer = answers[key];
  return answer === undefined ? { status: 1, stdout: '' } : { status: 0, stdout: `${answer}\n` };
};

test('the newest activity decides; 30 minutes without any is idle', () => {
  assert.equal(progress([{ source: 'commit', at: minutesAgo(45) }, { source: 'ci', at: minutesAgo(5) }], NOW).state, 'progressing');
  const idle = progress([{ source: 'commit', at: minutesAgo(45) }, { source: 'pr', at: minutesAgo(31) }], NOW);
  assert.equal(idle.state, 'idle');
  assert.equal(idle.idleMinutes, 31);
  assert.equal(idle.lastActivity, minutesAgo(31));
  assert.equal(progress([{ source: 'commit', at: minutesAgo(31) }], NOW, 60).state, 'progressing');
});

test('nothing readable is unknown, never idle', () => {
  assert.equal(progress([], NOW).state, 'unknown');
  assert.deepEqual(observe({ branch: 'feature', pr: 7 }, fake({})), []);
});

test('commit, CI, PR and session log times are all observed', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'worker-progress-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const log = path.join(dir, 'session.log');
  writeFileSync(log, 'line');
  utimesSync(log, new Date(NOW - 2 * 60_000), new Date(NOW - 2 * 60_000));
  const sources = observe({ branch: 'feature', pr: 7, log }, fake({ fetch: '', commit: minutesAgo(50), ci: minutesAgo(40), pr: minutesAgo(35) }));
  assert.deepEqual(sources.map((s) => s.source), ['commit', 'ci', 'pr', 'log']);
  assert.equal(progress(sources, NOW).state, 'progressing');
});

test('the command exits 1 for an idle worker and 0 for a progressing one', () => {
  const printed = [];
  assert.equal(main(['--branch', 'feature'], { now: NOW, run: fake({ fetch: '', commit: minutesAgo(90) }), print: (s) => printed.push(s) }), 1);
  assert.equal(JSON.parse(printed[0]).state, 'idle');
  assert.equal(main(['--branch', 'feature'], { now: NOW, run: fake({ fetch: '', commit: minutesAgo(3) }), print() {} }), 0);
  assert.equal(main(['--nope', 'x'], { print() {} }), 2);
});
