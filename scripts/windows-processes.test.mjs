// The machine's side of the process helpers, against a stubbed PowerShell: what the script asks
// for, how each row is mapped, and that closing goes in batches a command line can carry.
import test from 'node:test';
import assert from 'node:assert/strict';

import { closeProcesses, listProcesses } from './windows-processes.mjs';

/** A stand-in for spawnSync that records the decoded script and answers `stdout`. */
function powershell(answer) {
  const scripts = [];
  const run = (_command, args) => {
    scripts.push(Buffer.from(args.at(-1), 'base64').toString('utf16le'));
    return { status: 0, stdout: typeof answer === 'function' ? answer(scripts.at(-1)) : answer, stderr: '' };
  };
  return { run, scripts };
}

test('each row maps to one process, with its identity and CPU time', () => {
  const row = { pid: 7, ppid: 1, name: 'node.exe', exe: 'C:/node.exe', command: 'node x', createdMs: 1788985273109, kernel: 20_000_000, user: 5_000_000, cwd: 'C:/w' };
  const { run, scripts } = powershell(JSON.stringify(row));
  const listed = listProcesses({ platform: 'win32', run });
  assert.equal(listed.ok, true, listed.why);
  assert.deepEqual(listed.processes, [{ pid: 7, ppid: 1, name: 'node.exe', exe: 'C:/node.exe', command: 'node x', createdMs: 1788985273109, cpuSeconds: 2.5, cwd: 'C:/w' }]);
  assert.match(scripts[0], /Add-Type/);
  assert.match(scripts[0], /\[NoacgProcesses\]::Cwd/);
});

test('a list without working directories compiles nothing', () => {
  const { run, scripts } = powershell(JSON.stringify([{ pid: 7, ppid: 1, name: 'x', createdMs: null, kernel: null, user: null, cwd: null }]));
  const listed = listProcesses({ platform: 'win32', run, cwd: false });
  assert.deepEqual([listed.processes[0].cpuSeconds, listed.processes[0].cwd], [null, null]);
  assert.doesNotMatch(scripts[0], /Add-Type|NoacgProcesses/);
});

test('a failed or unreadable answer is never an empty machine', () => {
  const failed = listProcesses({ platform: 'win32', run: () => ({ status: 1, stdout: '', stderr: 'Access denied\nmore' }) });
  assert.deepEqual([failed.ok, failed.supported, failed.why], [false, true, 'could not list processes: Access denied']);
  const stalled = listProcesses({ platform: 'win32', run: () => ({ status: null, signal: 'SIGTERM' }), timeoutMs: 10_000 });
  assert.match(stalled.why, /within 10s/);
  assert.equal(listProcesses({ platform: 'win32', run: () => ({ status: 0, stdout: 'not json' }) }).ok, false);
});

test('closing goes in batches a command line can carry, and a failed batch fails only its own', () => {
  const entries = Array.from({ length: 250 }, (_, i) => ({ pid: 1_000_000 + i, createdMs: 1788985273109, name: 'chrome.exe' }));
  const encoded = [];
  const run = (_command, args) => {
    encoded.push(args.at(-1));
    if (encoded.length === 2) return { status: 1, stdout: '', stderr: 'boom' };
    const script = Buffer.from(args.at(-1), 'base64').toString('utf16le');
    return { status: 0, stdout: [...script.matchAll(/::Close\((\d+),/g)].map(([, pid]) => `${pid}=closed`).join('\r\n'), stderr: '' };
  };
  const { closed, failed } = closeProcesses(entries, { platform: 'win32', run });
  assert.equal(encoded.length, 3, 'three batches of at most 100');
  for (const command of encoded) assert.ok(command.length < 30_000, `an encoded batch of ${command.length} characters`);
  assert.equal(closed.length, 150);
  assert.deepEqual(failed.map((e) => e.pid), entries.slice(100, 200).map((e) => e.pid));
  assert.ok(failed.every((e) => e.result === 'boom'));
});

test('on Windows the list carries what the diagnostics and the reaper pin to, with or without directories', { skip: process.platform !== 'win32' && 'Windows only' }, () => {
  const me = listProcesses({ cwd: false }).processes.find((p) => p.pid === process.pid);
  assert.ok(me, 'this process is in the list');
  assert.ok(Number.isFinite(me.createdMs) && Number.isFinite(me.cpuSeconds), JSON.stringify(me));
  assert.equal(me.cwd, null);
});
