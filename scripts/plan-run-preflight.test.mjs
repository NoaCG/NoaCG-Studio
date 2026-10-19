// gate: build
// guards: .agent-workflows/plan-run.md, .agents/skills/plan-run/**, .claude/commands/plan-run.md
// measures: none - execution qualification behavior, not a countable subject
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { preflight, main, PROBE_TIMEOUT_MS } from './plan-run-preflight.mjs';

const NOW = Date.parse('2026-10-19T07:00:00Z');
const UNTIL = '2026-10-19T23:59:00+03:00';
const options = { context: 'coordinator', until: UNTIL, now: NOW };
const pass = (command) => ({ status: 0, stdout: command === 'git'
  ? `${'a'.repeat(40)}\trefs/heads/main\n` : command === 'gh' ? '12\n' : 'workspace-child-ok\n' });

test('qualifies this invocation with bounded child IO and independent Git/API reads', () => {
  const calls = [];
  const result = preflight({ ...options, env: { HTTPS_PROXY: 'http://proxy:8080' },
    run(command, args, settings) { calls.push({ command, args, settings }); return pass(command); } });
  assert.equal(result.ok, true);
  assert.equal(result.context, 'coordinator');
  assert.equal(result.scope, 'this invocation only');
  assert.deepEqual(calls.map(({ command }) => command), [process.execPath, 'git', 'gh']);
  for (const { settings } of calls) {
    assert.ok(settings.timeout > 0 && settings.timeout <= PROBE_TIMEOUT_MS);
    assert.equal(settings.windowsHide, true);
    assert.equal(settings.env.GIT_TERMINAL_PROMPT, '0');
    assert.equal(settings.env.GH_PROMPT_DISABLED, '1');
    assert.equal(settings.env.HTTPS_PROXY, 'http://proxy:8080');
  }
});

test('denied child, command timeout and malformed success stay blocked without hiding network results', () => {
  for (const failure of [{ error: { code: 'EPERM' } }, { error: { code: 'ETIMEDOUT' } },
    { status: 0, stdout: 'not a receipt' }]) {
    const result = preflight({ ...options, run: (command) => command === process.execPath ? failure : pass(command) });
    assert.equal(result.ok, false);
    assert.equal(result.checks[0].ok, false);
    assert.ok(result.checks.slice(1).every(({ ok }) => ok));
  }
});

test('network failures remain independent and never expose responses or exception messages', () => {
  const secret = 'credential-canary-DO-NOT-PRINT';
  const result = preflight({ ...options, run(command) {
    if (command === 'git') throw Object.assign(new Error(secret), { code: 'EACCES' });
    if (command === 'gh') return { status: 1, stderr: `HTTP 403 ${secret}`, stdout: secret };
    return pass(command);
  } });
  assert.equal(result.ok, false);
  assert.equal(result.checks[0].ok, true);
  assert.equal(result.checks[1].ok, false);
  assert.equal(result.checks[2].ok, false);
  assert.ok(!JSON.stringify(result).includes(secret));
});

test('local permission and capacity failures name the local blocker without requesting network access', () => {
  for (const failure of [{ error: { code: 'EPERM' } }, { error: { code: 'EACCES' } },
    { status: 1, stderr: 'workspace-permission' }]) {
    const result = preflight({ ...options, run: (command) => command === process.execPath ? failure : pass(command) });
    assert.match(result.checks[0].detail, /^permission:.*(?:subprocess|workspace)/);
    assert.doesNotMatch(result.checks[0].detail, /network/);
  }
  for (const failure of [{ error: { code: 'ENOMEM' } }, { status: 1, stderr: 'workspace-capacity' }]) {
    const result = preflight({ ...options, run: (command) => command === process.execPath ? failure : pass(command) });
    assert.equal(result.checks[0].category, 'capacity');
    assert.match(result.checks[0].detail, /^capacity:/);
    assert.equal(result.ok, false);
  }
});

test('invalid, expired and overlong windows refuse before launching any command', () => {
  for (const until of [undefined, 'garbled', '2026-10-19T07:00:00Z', '2026-10-21T07:00:00Z']) {
    const result = preflight({ ...options, until, run() { assert.fail('must not execute'); } });
    assert.equal(result.ok, false);
    assert.equal(result.checks[0].name, 'Run window');
  }
  for (const until of ['2026-10-19T06:00:00Z', '2026-10-19T07:00:00Z']) {
    assert.match(preflight({ ...options, until, run() { assert.fail('expired'); } }).checks[0].detail, /window expired/);
  }
});

test('a resumed wave uses its own deadline and ledger, and is never mutated', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'plan-run-preflight-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const wave = path.join(dir, 'wave.md');
  const header = `Window starts: 2026-10-19T06:00:00Z\nWindow ends: ${UNTIL}\n\n## Phases\n1. Example\n\n## Log\n`;
  for (const events of ['', '- 2026-10-19T06:01:00Z phase 1 stop owner decision\n',
    '- 2026-10-19T06:01:00Z phase 1 build branch/worktree\n- 2026-10-19T06:02:00Z phase 1 landed #1 sha\n- 2026-10-19T06:03:00Z phase 1 check independent\n- 2026-10-19T06:04:00Z phase 1 pass verified\n']) {
    writeFileSync(wave, header + events);
    const result = preflight({ context: 'worker', wave, now: NOW, run: pass });
    assert.equal(result.ok, events === '');
    assert.equal(readFileSync(wave, 'utf8'), header + events);
  }
  writeFileSync(wave, header);
  assert.equal(preflight({ context: 'worker', wave, now: Date.parse(UNTIL), run() { assert.fail('expired'); } }).ok, false);
});

test('real child IO runs in the selected worktree and parent cleans even after child timeout', (t) => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'plan-run-child-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const result = preflight({ ...options, cwd, run: (command, args, settings) => command === process.execPath
    ? spawnSync(command, args, { ...settings, windowsHide: true }) : pass(command) });
  assert.equal(result.ok, true);
  assert.deepEqual(readdirSync(cwd), []);
  const timedOut = preflight({ ...options, cwd, run(command, args) {
    if (command !== process.execPath) return pass(command);
    writeFileSync(args[2], 'interrupted child');
    return { error: { code: 'ETIMEDOUT' } };
  } });
  assert.equal(timedOut.ok, false);
  assert.deepEqual(readdirSync(cwd), []);
});

test('CLI refuses unknown arguments and prints only a fixed failure receipt', () => {
  const lines = [];
  const print = (line) => lines.push(line);
  assert.equal(main(['--context', 'coordinator', '--until', UNTIL, '--surprise'], { print }), 2);
  assert.equal(main(['--context', 'credential-canary', '--until', UNTIL], { now: NOW, print }), 1);
  assert.ok(!lines.at(-1).includes('credential-canary'));
  assert.equal(main(['--context', 'worker', '--until', UNTIL], { now: NOW, run: () => ({ error: { code: 'ETIMEDOUT' } }), print }), 1);
  assert.match(lines.at(-1), /timeout/);
  assert.equal(JSON.parse(lines.at(-1)).ok, false);
});
