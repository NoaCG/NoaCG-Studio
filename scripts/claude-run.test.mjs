import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { classifyResult, readStatus, runWorker, workspace } from './claude-run.mjs';

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'claude-worker-'));
  t.after(() => {
    assert.equal(path.dirname(directory), tmpdir());
    assert.ok(path.basename(directory).startsWith('claude-worker-'));
    rmSync(directory, { recursive: true, force: true });
  });
  const primary = path.join(directory, 'primary');
  const cwd = path.join(directory, 'worker');
  assert.equal(spawnSync('git', ['init', '--initial-branch=main', primary]).status, 0);
  assert.equal(spawnSync('git', ['-C', primary, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-m', 'Initialize test repository']).status, 0);
  assert.equal(spawnSync('git', ['-C', primary, 'worktree', 'add', '-b', 'feature/test', cwd]).status, 0);
  const promptFile = path.join(cwd, 'prompt.txt');
  writeFileSync(promptFile, 'Review literal `$() & |` text without shell expansion.');
  const fake = path.join(cwd, 'fake.mjs');
  writeFileSync(fake, `
    if (process.argv.includes('--help')) { console.log('--permission-prompts --output-format'); process.exit(0); }
    let prompt = '';
    for await (const chunk of process.stdin) prompt += chunk;
    console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: prompt, argv: process.argv.slice(2) }));
  `);
  return { cwd, primary, promptFile, fake, launcher: { command: process.execPath, args: [fake], shell: false } };
}

test('exit zero does not turn denials, errors, or missing result into success', () => {
  const row = { type: 'result', subtype: 'success', is_error: false };
  assert.equal(classifyResult(JSON.stringify(row), 0).status, 'completed');
  assert.equal(classifyResult(JSON.stringify({ ...row, permission_denials: [{}] }), 0).status, 'needs_permission');
  assert.equal(classifyResult(JSON.stringify({ ...row, is_error: true }), 0).status, 'failed');
  assert.equal(classifyResult(JSON.stringify(row), 1).status, 'failed');
  assert.equal(classifyResult('{}', 0).status, 'failed');
  assert.equal(classifyResult('', 0, true).status, 'timed_out');
});

test('worker sends literal stdin, preserves permission settings, and writes terminal receipts', async (t) => {
  const f = fixture(t);
  const result = await runWorker({ ...f, readOnly: true, model: 'example', effort: 'high' }, f);
  assert.equal(result.status, 'completed');
  const receipt = JSON.parse(readFileSync(path.join(result.directory, 'result.json')));
  assert.equal(receipt.result.result, readFileSync(f.promptFile, 'utf8'));
  assert.deepEqual(receipt.result.argv, ['--print', '--output-format', 'json', '--permission-prompts', 'none', '--tools', 'Read,Grep,Glob', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--model', 'example', '--effort', 'high']);
  assert.equal(readStatus(workspace(f.cwd), result.id).status, 'completed');
});

test('main, unbounded runs, and shell launchers are refused before launch', async (t) => {
  const f = fixture(t);
  await assert.rejects(runWorker({ ...f, timeoutSeconds: 86401 }, f), /Timeout/);
  await assert.rejects(runWorker({ ...f, model: '--dangerously-skip-permissions' }, f), /Invalid value/);
  const cli = spawnSync(process.execPath, ['scripts/claude-run.mjs', 'run', '--model', '--read-only'], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /incomplete option/);
  await assert.rejects(runWorker(f, { launcher: { command: 'claude.cmd', shell: false } }), /shell launchers/);
  spawnSync('git', ['-C', f.primary, 'symbolic-ref', 'HEAD', 'refs/heads/feature/primary']);
  await assert.rejects(runWorker({ ...f, cwd: f.primary }, f), /feature branch/);
  spawnSync('git', ['-C', f.cwd, 'symbolic-ref', 'HEAD', 'refs/heads/main']);
  await assert.rejects(runWorker(f, f), /feature branch/);
});

test('same-worktree duplicate is refused and unfinished state is unknown even with a PID', async (t) => {
  const f = fixture(t);
  let duplicate;
  const result = await runWorker(f, { ...f, onStarted: (row) => {
    const info = workspace(f.cwd);
    assert.equal(readStatus(info, row.id, () => false).status, 'unknown');
    assert.equal(readStatus(info, row.id, () => true).status, 'unknown');
    duplicate = assert.rejects(runWorker(f, f), /Worker lock exists/);
  } });
  await duplicate;
  assert.equal(result.status, 'completed');
});

test('timeout terminates the worker and records failure', async (t) => {
  const f = fixture(t);
  writeFileSync(f.fake, `if (process.argv.includes('--help')) { console.log('--permission-prompts --output-format'); process.exit(0); } setInterval(() => {}, 1000);`);
  const result = await runWorker({ ...f, timeoutSeconds: 1 }, f);
  assert.equal(result.status, 'timed_out');
});

test('timeout kills descendants with inherited output handles', async (t) => {
  const f = fixture(t);
  const heartbeat = path.join(f.cwd, 'heartbeat.txt');
  const descendant = path.join(f.cwd, 'descendant.mjs');
  writeFileSync(descendant, `import { writeFileSync } from 'node:fs'; setInterval(() => writeFileSync(${JSON.stringify(heartbeat)}, String(Date.now())), 30);`);
  writeFileSync(f.fake, `
    import { spawn } from 'node:child_process';
    if (process.argv.includes('--help')) { console.log('--permission-prompts --output-format'); process.exit(0); }
    spawn(process.execPath, [${JSON.stringify(descendant)}], { stdio: 'inherit' });
    setInterval(() => {}, 1000);
  `);
  const started = Date.now();
  const result = await runWorker({ ...f, timeoutSeconds: 1 }, f);
  assert.equal(result.status, 'timed_out');
  assert.ok(Date.now() - started < 10000, 'inherited pipes must not keep the worker open');
  const stopped = readFileSync(heartbeat, 'utf8');
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(readFileSync(heartbeat, 'utf8'), stopped, 'descendant must stop writing');
});

test('unconfirmed termination returns bounded unknown and retains ownership', async (t) => {
  const f = fixture(t);
  writeFileSync(f.fake, `if (process.argv.includes('--help')) { console.log('--permission-prompts --output-format'); process.exit(0); } setInterval(() => {}, 1000);`);
  let result;
  try {
    result = await runWorker({ ...f, timeoutSeconds: 1 }, { ...f, terminate: () => {}, terminationGraceMs: 50 });
    assert.equal(result.status, 'unknown');
    assert.ok(readdirSync(workspace(f.cwd).directory).some((name) => name.endsWith('.lock')));
    await assert.rejects(runWorker(f, f), /Worker lock exists/);
  } finally {
    if (result?.childPid) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(result.childPid), '/T', '/F'], { windowsHide: true });
      else process.kill(-result.childPid, 'SIGKILL');
    }
  }
});
