import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { holdAwake, holderScript, readWake, WAKE_CRON, WAKE_TASK_ID, wakeReport, wakeTask, wakeVerdict, writeWake } from './run-wake.mjs';

const NOW = Date.parse('2026-10-12T20:00:00Z');
const OPENED = '# Plan run editor 2026-10-12\n\nWindow starts: 2026-10-12T15:00:00Z\nWindow ends: 2026-10-13T06:30:00+03:00\nSession: aaa\n\nPrompt: x\n';
const WAKE = { host: 'local_1', session: 'bbb', resume: '/plan-run editor until 2026-10-13T06:30:00+03:00' };
const WAVE = writeWake(OPENED, WAKE);
const inventory = (...ids) => ({ available: true, rows: ids.map((sessionId, pid) => ({ sessionId, pid: pid + 100 })) });
const verdict = (overrides) => wakeVerdict({ text: WAVE, sessions: ['aaa'], inventory: inventory('wake'), now: NOW, ...overrides });

test('arming writes one Wake line under the session lines, and re-arming replaces it', () => {
  assert.match(WAVE, /^Session: aaa\nWake: local_1 bbb \/plan-run editor until 2026-10-13T06:30:00\+03:00\n\nPrompt: x/m);
  assert.deepEqual(readWake(WAVE), WAKE);
  const again = writeWake(WAVE, { ...WAKE, host: 'local_2' });
  assert.equal(again.match(/^Wake:/gm).length, 1);
  assert.equal(readWake(again).host, 'local_2');
  assert.equal(writeWake('# no window\n', WAKE), null);
});

test('a recorded session that is still running keeps the run alive, and nothing is done', () => {
  assert.equal(verdict({ inventory: inventory('zzz', 'aaa') }).verdict, 'alive');
  // The arming session counts too, recorded or not on a Session line.
  assert.match(verdict({ inventory: inventory('bbb') }).why, /bbb .*pid 100/);
});

test('no recorded session running, with the inventory answering, restarts the coordinator\'s own session', () => {
  // The firing's own session is always listed, so a live inventory is never empty.
  const result = verdict({});
  assert.equal(result.verdict, 'resume');
  assert.equal(result.host, 'local_1');
  assert.match(result.why, /aaa, bbb/);
  const lines = wakeReport([{ file: 'C:/store/run.md', ...result }]);
  assert.match(lines[0], /^resume: /);
  assert.equal(lines[1], 'session_id: local_1');
  assert.match(lines[2], /^message: .*C:\/store\/run\.md .*\/plan-run editor until/);
  assert.equal(lines[3], `command: ${WAKE.resume}`);
});

test('an inventory that did not answer, or answered empty, is unknown and does nothing', () => {
  assert.equal(verdict({ inventory: { available: false, rows: [], why: 'no claude' } }).verdict, 'unknown');
  assert.equal(verdict({ inventory: inventory() }).verdict, 'unknown');
});

test('a written report, an ended window or no Wake line is over, whatever is running', () => {
  assert.equal(verdict({ text: `${WAVE}\n## Report\n\ndone\n` }).verdict, 'over');
  assert.equal(verdict({ now: Date.parse('2026-10-13T03:30:00Z') }).verdict, 'over');
  assert.equal(verdict({ text: OPENED }).verdict, 'over');
  // An earlier window's report, demoted by a new window, does not end the run.
  assert.equal(verdict({ text: `${WAVE}\n## Earlier report\n` }).verdict, 'resume');
});

test('one firing reports idle with no open armed run, otherwise the first resume or what runs', () => {
  assert.deepEqual(wakeReport([]), ['idle: no open run has a wake-up']);
  assert.deepEqual(wakeReport([{ file: 'a', verdict: 'over', why: 'x' }]), ['idle: no open run has a wake-up']);
  assert.match(wakeReport([{ file: 'a', verdict: 'alive', why: 'up' }, { file: 'b', verdict: 'unknown', why: '?' }])[0], /^unknown: a alive \(up\); b unknown/);
  const resume = { file: 'b', verdict: 'resume', why: 'gone', ...WAKE };
  assert.match(wakeReport([{ file: 'a', verdict: 'alive', why: 'up' }, resume])[0], /^resume: gone for b/);
});

test('the one task fires every 30 minutes in the primary checkout, tells nobody, and runs the allowed command', () => {
  const task = wakeTask('C:\\repo');
  assert.equal(task.taskId, WAKE_TASK_ID);
  assert.equal(task.cronExpression, WAKE_CRON);
  assert.equal(task.notifyOnCompletion, false);
  assert.ok(task.prompt.includes('In C:\\repo, run exactly: node scripts/run-wake.mjs check'));
  assert.ok(task.prompt.includes('mcp__ccd_session_mgmt__send_message'));
  const settings = JSON.parse(readFileSync(new URL('../.claude/settings.json', import.meta.url), 'utf8'));
  for (const tool of ['Bash', 'PowerShell']) assert.ok(settings.permissions.allow.includes(`${tool}(node scripts/run-wake.mjs check)`), tool);
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
