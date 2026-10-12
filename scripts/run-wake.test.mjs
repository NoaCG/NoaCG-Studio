import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { holdAwake, holderScript, WAKE_CRON, wakeTask, wakeTaskId, wakeVerdict } from './run-wake.mjs';

const NOW = Date.parse('2026-10-12T20:00:00Z');
const WAVE = '# Plan run editor 2026-10-12\n\nWindow starts: 2026-10-12T15:00:00Z\nWindow ends: 2026-10-13T06:30:00+03:00\nSession: aaa\nSession: bbb\n';
const inventory = (...ids) => ({ available: true, rows: ids.map((sessionId, pid) => ({ sessionId, pid: pid + 100 })) });

test('a recorded session that is still running keeps the run alive, and nothing is started', () => {
  const result = wakeVerdict({ text: WAVE, sessions: ['aaa', 'bbb'], inventory: inventory('zzz', 'aaa'), now: NOW });
  assert.equal(result.verdict, 'alive');
  assert.match(result.why, /aaa .*pid 101/);
});

test('no recorded session running, with the inventory answering, resumes the run', () => {
  // The wake-up's own session is always listed, so a live inventory is never empty.
  const result = wakeVerdict({ text: WAVE, sessions: ['aaa', 'bbb'], inventory: inventory('wake'), now: NOW });
  assert.equal(result.verdict, 'resume');
  assert.match(result.why, /aaa, bbb/);
});

test('an inventory that did not answer, or answered empty, or no recorded session, is unknown and starts nothing', () => {
  assert.equal(wakeVerdict({ text: WAVE, sessions: ['aaa'], inventory: { available: false, rows: [], why: 'no claude' }, now: NOW }).verdict, 'unknown');
  assert.equal(wakeVerdict({ text: WAVE, sessions: ['aaa'], inventory: inventory(), now: NOW }).verdict, 'unknown');
  assert.equal(wakeVerdict({ text: WAVE, sessions: [], inventory: inventory('wake'), now: NOW }).verdict, 'unknown');
  assert.equal(wakeVerdict({ text: '# no window\n', sessions: ['aaa'], inventory: inventory('wake'), now: NOW }).verdict, 'unknown');
});

test('a written report or an ended window is over, whatever is running', () => {
  assert.equal(wakeVerdict({ text: `${WAVE}\n## Report\n\ndone\n`, sessions: ['aaa'], inventory: inventory('wake'), now: NOW }).verdict, 'over');
  assert.equal(wakeVerdict({ text: WAVE, sessions: ['aaa'], inventory: inventory('aaa'), now: Date.parse('2026-10-13T03:30:00Z') }).verdict, 'over');
  // An earlier window's report, demoted by a new window, does not end the run.
  assert.equal(wakeVerdict({ text: `${WAVE}\n## Earlier report\n`, sessions: ['aaa'], inventory: inventory('wake'), now: NOW }).verdict, 'resume');
});

test('the task fires every 30 minutes, tells nobody, names its run and carries the resume command', () => {
  const file = path.join('C:', 'store', '2026-10-12-plan-remote-mcp-wave-plan.local.md');
  assert.equal(wakeTaskId(file), 'run-wake-2026-10-12-plan-remote-mcp');
  const task = wakeTask({ file, resume: '/plan-run remote-mcp until 2026-10-13T06:30:00+03:00', repo: path.join('C:', 'repo') });
  assert.equal(task.cronExpression, WAKE_CRON);
  assert.equal(task.notifyOnCompletion, false);
  assert.ok(task.prompt.includes(`check "${file}"`));
  assert.ok(task.prompt.includes('/plan-run remote-mcp until 2026-10-13T06:30:00+03:00'));
  assert.ok(task.prompt.includes('delete_scheduled_task'));
});

test('the keep-awake holder quotes its paths and stops at the window end or the report', () => {
  const script = holderScript({ file: "C:\\it's\\wave.md", until: '2026-10-13T06:30:00+03:00' });
  assert.ok(script.includes("'C:\\it''s\\wave.md'"));
  assert.ok(script.includes("Parse('2026-10-13T06:30:00+03:00')"));
  assert.ok(script.includes('[uint32]2147483649'));
  assert.ok(script.includes('[Rr]eport'));
});

test('no holder is started for a window that has ended or a run that reported', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'run-wake-'));
  try {
    const file = path.join(dir, 'wave.md');
    writeFileSync(file, WAVE);
    assert.match(holdAwake(file, { now: Date.parse('2026-10-14T00:00:00Z') }), /ended/);
    writeFileSync(file, `${WAVE}## Report\n`);
    assert.match(holdAwake(file, { now: NOW }), /report/);
    writeFileSync(file, WAVE);
    assert.match(holdAwake(file, { now: NOW, platform: 'plan9' }), /by hand until 2026-10-13T06:30:00\+03:00/);
    assert.equal(readFileSync(file, 'utf8'), WAVE);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
