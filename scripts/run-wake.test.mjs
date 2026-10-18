import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { holdable, holdAwake, holderScript, QUIET_VERDICTS, readWake, usageStopIn, WAKE_CRON, WAKE_TASK_ID, WAKE_TITLE, wakeRepo, wakeReport, wakeTask, wakeVerdict, writeWake } from './run-wake.mjs';

const NOW = Date.parse('2026-10-12T20:00:00Z');
const OPENED = '# Plan run editor 2026-10-12\n\nWindow starts: 2026-10-12T15:00:00Z\nWindow ends: 2026-10-13T06:30:00+03:00\nSession: aaa\n\nPrompt: x\n';
const WAKE = { host: 'local_1', session: 'bbb', resume: '/plan-run editor until 2026-10-13T06:30:00+03:00' };
const WAVE = writeWake(OPENED, WAKE);
const inventory = (...ids) => ({ available: true, rows: ids.map((sessionId, pid) => ({ sessionId, pid: pid + 100 })) });
const verdict = (overrides) => wakeVerdict({ text: WAVE, inventory: inventory('wake'), now: NOW, stopped: () => null, ...overrides });

test('arming writes one Wake line under the session lines, and re-arming replaces it', () => {
  assert.match(WAVE, /^Session: aaa\nWake: local_1 bbb \/plan-run editor until 2026-10-13T06:30:00\+03:00\n\nPrompt: x/m);
  assert.deepEqual(readWake(WAVE), WAKE);
  const again = writeWake(WAVE, { ...WAKE, host: 'local_2' });
  assert.equal(again.match(/^Wake:/gm).length, 1);
  assert.equal(readWake(again).host, 'local_2');
  assert.equal(writeWake('# no window\n', WAKE), null);
  // A Wake: line anywhere else, such as in a quoted prompt, arms nothing and is left alone.
  const quoted = `${OPENED}Wake: local_x yyy /orchestrator\n`;
  assert.equal(readWake(quoted), null);
  const armed = writeWake(quoted, WAKE);
  assert.deepEqual(readWake(armed), WAKE);
  assert.ok(armed.endsWith('Prompt: x\nWake: local_x yyy /orchestrator\n'));
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

test('a transcript that ends on the usage-limit error reports when the limit resets', () => {
  const line = (entry) => JSON.stringify(entry);
  const limited = line({ type: 'assistant', error: 'rate_limit', isApiErrorMessage: true, quotaLimits: { resetsAt: 1791000000 } });
  const tail = [
    '{"cut by the tail read',
    line({ type: 'user', message: { content: 'go on' } }),
    limited,
    line({ type: 'assistant', isSidechain: true, message: {} }),
    line({ type: 'bridge-session', sessionId: 'x' }),
  ].join('\n');
  assert.deepEqual(usageStopIn(tail), { resetsAt: 1791000000000 });
  assert.deepEqual(usageStopIn(line({ type: 'assistant', error: 'rate_limit' })), { resetsAt: null });
  // Anything after the error on the main chain means the conversation went on.
  assert.equal(usageStopIn(`${limited}\n${line({ type: 'user', message: { content: 'retry' } })}`), null);
  assert.equal(usageStopIn(line({ type: 'assistant', message: {} })), null);
  assert.equal(usageStopIn(''), null);
  // A grace notice counts only while it is the last turn's latest limit note.
  const note = (usageLimitNote) => line({ type: 'user', promptId: 'p1', isMeta: true, usageLimitNote, timestamp: '2026-10-17T20:11:14Z' });
  assert.equal(usageStopIn(note('wrap_up')).resetsAt, Date.parse('2026-10-17T21:11:14Z'));
  assert.equal(usageStopIn(`${note('wrap_up')}\n${note('release')}`), null);
  assert.equal(usageStopIn(`${note('wrap_up')}\n${line({ type: 'user', promptId: 'p2', message: { content: 'go on' } })}`), null);
  // An earlier error's reset is used only while it still lay ahead at the notice.
  const error = (iso) => line({ type: 'assistant', error: 'rate_limit', quotaLimits: { resetsAt: Date.parse(iso) / 1000 } });
  assert.equal(usageStopIn(`${error('2026-10-17T20:00:00Z')}\n${note('wrap_up')}`).resetsAt, Date.parse('2026-10-17T21:11:14Z'));
  assert.deepEqual(usageStopIn(`${error('2026-10-17T21:50:00Z')}\n${note('wrap_up')}`), { resetsAt: Date.parse('2026-10-17T21:50:00Z') });
});

test('fixture transcripts, read where the harness files them: grace waits for the reset, the error is unchanged, an owner wait stays alive', () => {
  const config = mkdtempSync(path.join(tmpdir(), 'run-wake-config-'));
  const previous = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = config;
  try {
    const folder = path.join(config, 'projects', 'C--claude-NoaCG-Studio');
    mkdirSync(folder, { recursive: true });
    // The fixture as the transcript of the run's one listed session on the night of 2026-10-17, checked at `now`.
    const night = (fixture, now) => {
      const id = `coordinator-${fixture}`;
      writeFileSync(path.join(folder, `${id}.jsonl`), readFileSync(new URL(`./fixtures/run-wake/${fixture}.jsonl`, import.meta.url)));
      const text = writeWake(`# Plan run harness-ladder\n\nWindow ends: 2026-10-18T22:00:00+03:00\nSession: ${id}\n`, { host: 'local_1', session: id, resume: '/plan-run harness-ladder' });
      return wakeVerdict({ text, inventory: inventory(id, 'firing'), now: Date.parse(now) });
    };
    // Grace notice, then a clean end: the earlier rate-limit error records the reset, 21:50Z.
    assert.match(night('grace-after-error', '2026-10-17T21:39:00Z').why, /stopped on the usage limit, which resets at 2026-10-17T21:50:00.000Z$/);
    const resumed = night('grace-after-error', '2026-10-17T23:39:00Z');
    assert.equal(resumed.verdict, 'resume');
    assert.equal(resumed.usage, true);
    // A grace notice with no error recorded: an hour after the notice.
    const guessed = night('grace-no-reset', '2026-10-17T20:39:00Z');
    assert.equal(guessed.verdict, 'waiting');
    assert.match(guessed.why, /resets at 2026-10-17T21:11:14.147Z \(an hour after the grace notice, which records no reset\)/);
    assert.equal(night('grace-no-reset', '2026-10-17T21:39:00Z').verdict, 'resume');
    // The rate-limit error, unchanged: waiting until the reset it records, then resume.
    assert.match(night('rate-limit-error', '2026-10-17T21:39:00Z').why, /which resets at 2026-10-17T22:00:00.000Z$/);
    assert.equal(night('rate-limit-error', '2026-10-17T22:09:00Z').verdict, 'resume');
    // Waiting on the owner after an earlier grace: alive however long it is quiet.
    assert.equal(night('owner-wait', '2026-10-18T04:09:00Z').verdict, 'alive');
  } finally {
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = previous;
    rmSync(config, { recursive: true, force: true });
  }
});

test('a running coordinator stopped on the usage limit waits for the reset, then is resumed', () => {
  const resetsAt = NOW + 3_600_000;
  const stopped = (id) => (id === 'aaa' ? { resetsAt } : null);
  const waiting = verdict({ inventory: inventory('aaa'), stopped });
  assert.equal(waiting.verdict, 'waiting');
  assert.match(waiting.why, /aaa stopped on the usage limit, which resets at 2026-10-12T21:00:00.000Z/);
  const resumed = verdict({ inventory: inventory('aaa'), stopped, now: resetsAt + 1 });
  assert.equal(resumed.verdict, 'resume');
  assert.equal(resumed.usage, true);
  assert.equal(resumed.host, 'local_1');
  assert.match(wakeReport([{ file: 'run.md', ...resumed }])[2], /^message: Wake-up: you stopped on the usage limit, which should have reset by now/);
  // A limit with no recorded reset is resumed at once; another recorded session still working keeps it alive.
  assert.equal(verdict({ inventory: inventory('aaa'), stopped: () => ({ resetsAt: null }) }).verdict, 'resume');
  assert.equal(verdict({ inventory: inventory('aaa', 'bbb'), stopped }).verdict, 'alive');
  assert.match(wakeReport([{ file: 'a', verdict: 'alive', why: 'up' }, { file: 'b', ...waiting }])[0], /^waiting: /);
  assert.deepEqual([...QUIET_VERDICTS].sort(), ['alive', 'unknown', 'waiting']);
});

test('an inventory that did not answer, or answered empty, is unknown and does nothing', () => {
  assert.equal(verdict({ inventory: { available: false, rows: [], why: 'no claude' } }).verdict, 'unknown');
  assert.equal(verdict({ inventory: inventory() }).verdict, 'unknown');
});

test('the inventory is asked only for an open armed run', () => {
  let asked = 0;
  const ask = () => { asked += 1; return inventory('aaa'); };
  assert.equal(verdict({ text: OPENED, inventory: ask }).verdict, 'over');
  assert.equal(asked, 0);
  assert.equal(verdict({ inventory: ask }).verdict, 'alive');
  assert.equal(asked, 1);
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
  assert.equal(task.title, WAKE_TITLE);
  assert.ok(task.prompt.includes('run exactly, in C:\\repo: node scripts/run-wake.mjs check'));
  assert.ok(task.prompt.includes('mcp__ccd_session_mgmt__send_message'));
  assert.ok(task.prompt.includes(`list_task_runs (taskId ${WAKE_TASK_ID}, limit 50)`));
  // A firing runs unattended in the default mode, so every tool it calls is allowed without a prompt
  // (archive_session by the primary checkout's own local settings).
  const settings = JSON.parse(readFileSync(new URL('../.claude/settings.json', import.meta.url), 'utf8'));
  for (const tool of ['Bash', 'PowerShell']) assert.ok(settings.permissions.allow.includes(`${tool}(node scripts/run-wake.mjs check)`), tool);
  for (const tool of ['mcp__ccd_session_mgmt__send_message', 'mcp__scheduled-tasks__list_task_runs', 'mcp__scheduled-tasks__update_scheduled_task']) {
    assert.ok(settings.permissions.allow.includes(tool), tool);
  }
});

test('the keep-awake holder runs to the window end, and is released by the report or an ended window', () => {
  const script = holderScript("2026-10-13T06:30:00+03:00'");
  assert.ok(script.includes("Parse('2026-10-13T06:30:00+03:00''')"));
  assert.ok(script.includes('[uint32]2147483649'));
  assert.deepEqual(holdable(WAVE, NOW), { until: '2026-10-13T06:30:00+03:00' });
  assert.match(holdable(`${WAVE}## Report\n`, NOW).why, /report/);
  assert.match(holdable(WAVE, Date.parse('2026-10-14T00:00:00Z')).why, /ended/);
  assert.equal(holdable(`${WAVE}## Earlier report\n`, NOW).why, undefined);
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

test('arm names the primary checkout, also when run from a linked worktree', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'run-wake-repo-'));
  try {
    const primary = path.join(dir, 'primary');
    const admin = path.join(primary, '.git', 'worktrees', 'wt');
    const linked = path.join(primary, '.claude', 'worktrees', 'wt');
    mkdirSync(admin, { recursive: true });
    mkdirSync(path.join(linked, 'scripts'), { recursive: true });
    writeFileSync(path.join(admin, 'commondir'), '../..\n');
    writeFileSync(path.join(linked, '.git'), `gitdir: ${admin}\n`);
    assert.equal(wakeRepo(path.join(linked, 'scripts')), primary);
    assert.equal(wakeRepo(path.join(primary, 'scripts')), primary);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  // From this very checkout, the answer holds the script the task's runs will call.
  assert.ok(existsSync(path.join(wakeRepo(), 'scripts', 'run-wake.mjs')));
});
