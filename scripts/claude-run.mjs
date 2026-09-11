#!/usr/bin/env node
/** Foreground Claude worker for other harnesses. Keep the exec session alive until completion.
 * Usage: node scripts/claude-run.mjs run --cwd <feature-worktree> --prompt-file <file>
 *        [--timeout-seconds 3600] [--model <model>] [--effort <level>] [--read-only]
 *        node scripts/claude-run.mjs status|result --cwd <worktree> --id <id>
 * Records are local operational state, never proof that a branch is verified or ready to land.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveClaude } from './claude-agents.mjs';

function git(cwd, args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || 'Git lookup failed');
  return result.stdout.trim();
}

export function workspace(cwd) {
  if (!cwd) throw new Error('--cwd is required');
  const resolved = realpathSync(cwd);
  const root = realpathSync(git(resolved, ['rev-parse', '--show-toplevel']));
  if (resolved !== root) throw new Error('--cwd must be the worktree root');
  const branch = git(root, ['branch', '--show-current']);
  const common = git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const gitDirectory = git(root, ['rev-parse', '--absolute-git-dir']);
  return { cwd: root, branch, linkedWorktree: realpathSync(gitDirectory) !== realpathSync(common), directory: path.join(common, 'noacg-jobs', 'claude-workers') };
}

function atomicJson(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, file);
}

export function classifyResult(stdout, exitCode, timedOut = false) {
  if (timedOut) return { status: 'timed_out', reason: 'Worker exceeded its time budget' };
  let result;
  try { result = JSON.parse(stdout); } catch { return { status: 'failed', reason: 'Claude did not return a JSON result' }; }
  if (Array.isArray(result)) result = result.findLast((row) => row.type === 'result');
  if (!result || result.type !== 'result') return { status: 'failed', reason: 'Missing Claude result record' };
  if (result.permission_denials?.length) return { status: 'needs_permission', reason: 'Configured permissions denied required tools', result };
  if (exitCode !== 0 || result.is_error || result.subtype !== 'success') return { status: 'failed', reason: 'Claude reported a failed run', result };
  return { status: 'completed', result };
}

export function readStatus(info, id, alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } }) {
  if (!/^[a-zA-Z0-9-]+$/.test(id ?? '')) throw new Error('Invalid worker id');
  const metadata = JSON.parse(readFileSync(path.join(info.directory, id, 'metadata.json'), 'utf8'));
  // A missing process never establishes successful completion, and PID reuse is not identity proof.
  if (metadata.status === 'running') return { ...metadata, status: 'unknown', processPresent: Boolean(metadata.pid && alive(metadata.pid)), reason: 'No terminal receipt yet; process presence alone cannot establish worker identity' };
  return metadata;
}

export async function runWorker(options, dependencies = {}) {
  for (const key of ['cwd', 'promptFile', 'model', 'effort', 'timeoutSeconds']) {
    if (options[key] !== undefined && (!String(options[key]).trim() || String(options[key]).trim().startsWith('-'))) throw new Error(`Invalid value for ${key}`);
  }
  const info = workspace(options.cwd);
  if (!info.linkedWorktree || !info.branch || ['main', 'master'].includes(info.branch)) throw new Error('A dedicated feature branch worktree is required');
  if (!options.promptFile) throw new Error('--prompt-file is required');
  const prompt = readFileSync(options.promptFile, 'utf8');
  if (!prompt.trim()) throw new Error('Prompt file is empty');
  const seconds = Number(options.timeoutSeconds ?? 3600);
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 86400) throw new Error('Timeout must be between 1 and 86400 seconds');
  const launcher = dependencies.launcher ?? resolveClaude();
  if (!launcher || launcher.shell || /\.(cmd|bat)$/i.test(launcher.command)) throw new Error('A directly executable Claude installation is required; shell launchers are refused');
  const prefix = launcher.args ?? [];
  const help = spawnSync(launcher.command, [...prefix, '--help'], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  if (help.status !== 0 || !help.stdout.includes('--permission-prompts') || !help.stdout.includes('--output-format')) throw new Error('Claude must support --permission-prompts and --output-format');
  const args = [...prefix, '--print', '--output-format', 'json', '--permission-prompts', 'none'];
  // This narrows built-in tools. Empty MCP configuration also prevents unrelated connector tools.
  if (options.readOnly) args.push('--tools', 'Read,Grep,Glob', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}');
  if (options.model) args.push('--model', options.model);
  if (options.effort) args.push('--effort', options.effort);
  mkdirSync(info.directory, { recursive: true });
  const key = createHash('sha256').update(process.platform === 'win32' ? info.cwd.toLowerCase() : info.cwd).digest('hex');
  const lock = path.join(info.directory, `${key}.lock`);
  const id = randomUUID();
  // Never steal stale locks: an interrupted parent may have left a live worker behind.
  try { writeFileSync(lock, JSON.stringify({ id, cwd: info.cwd, pid: process.pid }), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code === 'EEXIST') throw new Error(`Worker lock exists: ${lock}. Inspect its worker and process before manual recovery.`, { cause: error }); throw error; }
  const directory = path.join(info.directory, id);
  let metadata;
  let child;
  let timer;
  let terminationTimer;
  let resolveStopped;
  let closed = false;
  let preserveLock = false;
  let timedOut = false;
  let interrupted = false;
  const stop = () => {
    if (!child?.pid || closed || terminationTimer) return;
    try {
      if (dependencies.terminate) dependencies.terminate(child);
      else if (process.platform === 'win32') {
        const killed = spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 10000 });
        if (killed.status !== 0) preserveLock = true;
      } else process.kill(-child.pid, 'SIGKILL');
    } catch { preserveLock = true; }
    // A failed OS kill must not leave the supervisor waiting on inherited pipe handles forever.
    // Keep the ownership lock and an unknown receipt when termination cannot be confirmed.
    terminationTimer = setTimeout(() => {
      preserveLock = true;
      child.stdin.destroy();
      child.stdout.destroy();
      child.stderr.destroy();
      child.unref(); // Failure recovery only, never the normal worker launch lifecycle.
      resolveStopped?.(null);
    }, dependencies.terminationGraceMs ?? 5000);
  };
  const interrupt = () => { interrupted = true; stop(); };
  try {
    mkdirSync(directory);
    metadata = { version: 1, id, cwd: info.cwd, branch: info.branch, pid: process.pid, status: 'running', startedAt: new Date().toISOString(), timeoutSeconds: seconds };
    atomicJson(path.join(directory, 'metadata.json'), metadata);
    dependencies.onStarted?.(metadata);
    let stdout = '';
    const stdoutFile = path.join(directory, 'stdout.json');
    const stderrFile = path.join(directory, 'stderr.log');
    writeFileSync(stdoutFile, '', { mode: 0o600 });
    writeFileSync(stderrFile, '', { mode: 0o600 });
    // POSIX detached creates a process group so timeout kills inherited descendants too.
    // It does not detach our supervision: the child remains referenced and awaited.
    child = spawn(launcher.command, args, { cwd: info.cwd, windowsHide: true, detached: process.platform !== 'win32', shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    metadata.childPid = child.pid ?? null;
    atomicJson(path.join(directory, 'metadata.json'), metadata);
    child.stdout.on('data', (data) => { stdout += data; appendFileSync(stdoutFile, data); });
    child.stderr.on('data', (data) => { appendFileSync(stderrFile, data); });
    child.stdin.on('error', () => {}); // Early CLI failure closes stdin; the exit/result carries the failure.
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', interrupt);
    timer = setTimeout(() => { timedOut = true; stop(); }, seconds * 1000);
    const exitCode = await new Promise((resolve, reject) => {
      resolveStopped = resolve;
      child.once('error', reject);
      child.once('close', (code) => { closed = true; clearTimeout(terminationTimer); resolve(code); });
      child.stdin.end(prompt);
    });
    const outcome = preserveLock ? { status: 'unknown', reason: 'Worker tree termination unconfirmed; ownership lock retained for manual recovery' } : interrupted ? { status: 'interrupted', reason: 'Parent received a stop signal' } : classifyResult(stdout, exitCode, timedOut);
    // Do not persist environment/auth values. Output files contain task content and stay in local git state.
    atomicJson(path.join(directory, 'result.json'), outcome);
    metadata = { ...metadata, status: outcome.status, reason: outcome.reason, exitCode, finishedAt: new Date().toISOString() };
    atomicJson(path.join(directory, 'metadata.json'), metadata);
    return { ...metadata, directory };
  } catch (error) {
    if (child?.pid && !closed) { preserveLock = true; stop(); }
    if (metadata) {
      const status = preserveLock ? 'unknown' : 'failed';
      atomicJson(path.join(directory, 'result.json'), { status, reason: error.message });
      atomicJson(path.join(directory, 'metadata.json'), { ...metadata, status, reason: error.message, finishedAt: new Date().toISOString() });
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (!preserveLock || closed) clearTimeout(terminationTimer);
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    if (!preserveLock) unlinkSync(lock);
  }
}

async function main(argv) {
  const command = argv.shift();
  const options = {};
  const keys = { '--cwd': 'cwd', '--prompt-file': 'promptFile', '--timeout-seconds': 'timeoutSeconds', '--model': 'model', '--effort': 'effort', '--id': 'id' };
  while (argv.length) {
    const flag = argv.shift();
    if (flag === '--read-only') { options.readOnly = true; continue; }
    if (!keys[flag] || !argv.length || !argv[0].trim() || argv[0].trim().startsWith('-')) throw new Error(`Unknown or incomplete option: ${flag}`);
    options[keys[flag]] = argv.shift();
  }
  if (command === 'run') {
    const result = await runWorker(options, { onStarted: (row) => console.log(JSON.stringify(row)) });
    console.log(JSON.stringify(result));
    process.exitCode = result.status === 'completed' ? 0 : 1;
  } else if (command === 'status' || command === 'result') {
    const info = workspace(options.cwd);
    const metadata = readStatus(info, options.id);
    console.log(JSON.stringify(command === 'result' && metadata.finishedAt ? JSON.parse(readFileSync(path.join(info.directory, options.id, 'result.json'), 'utf8')) : metadata, null, 2));
  } else throw new Error('Expected run, status, or result');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
