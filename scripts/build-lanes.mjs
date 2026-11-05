#!/usr/bin/env node
// THE BUILD'S INDEPENDENT CHECKS, SIDE BY SIDE (cicd-followup cf13, cf03 rank 2).
//
//   node scripts/build-lanes.mjs "<command>" "<command>" ...
//
// Runs each argument as a shell command, all at once, and waits for every one. The first lane
// streams its output as it runs, so a long lane reads in the log exactly as it did when it ran
// alone. Every other lane is held and printed as one block when it ends, so two tools never
// interleave their lines. Each lane prints its time and status. The exit status is the first
// failing lane's, in argument order, or 0; no lane is stopped early, so one run shows every
// failure. SIGINT or SIGTERM to this runner (a cancelled job, Ctrl-C) reaches every process of
// every lane, not only its shell, so the tool an `&&` chain is running stops too: on POSIX the
// lane's descendants are read from `ps`, on Windows `taskkill /T` ends the tree. The lanes stay in
// the caller's process group on purpose, so the job queue's group kill (scripts/jobs.mjs
// `killTree`) still reaches them.
//
// WHY. The Build job ran its gates' tests (about 4.6 minutes on Actions) and then typecheck,
// lint and the dependency check (about 1.8 minutes) one after the other, on a runner with four
// cores, and it is the critical path of every change with no E2E shard (cf03 section 3.5). The
// two have no input in common: the gates read the tree, and tsc, ESLint and dependency-cruiser
// read src/ and api/. Run together they finish when the longer one does.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Every process under `root`, from one `ps` listing (POSIX). */
export function descendantsOf(root) {
  const listing = spawnSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8', windowsHide: true }).stdout ?? '';
  const children = new Map();
  for (const line of listing.split('\n')) {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number);
    if (!pid) continue;
    if (!children.has(ppid)) children.set(ppid, []);
    children.get(ppid).push(pid);
  }
  const found = [];
  const stack = [...(children.get(root) ?? [])];
  while (stack.length) {
    const pid = stack.pop();
    found.push(pid);
    stack.push(...(children.get(pid) ?? []));
  }
  return found;
}

/**
 * @param {string[]} commands shell commands; the first streams, the rest print when done
 * @param {{ out?: NodeJS.WritableStream, err?: NodeJS.WritableStream }} [io]
 * @returns {Promise<number>} the first non-zero exit status in argument order, or 0
 */
export async function runLanes(commands, { out = process.stdout, err = process.stderr } = {}) {
  if (commands.length === 0) throw new Error('build-lanes: give at least one command');
  const children = [];
  const lanes = commands.map((command, index) => new Promise((resolve) => {
    const started = Date.now();
    const live = index === 0;
    const held = [];
    const child = spawn(command, { shell: true, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    children.push(child);
    child.stdout.on('data', (chunk) => (live ? out.write(chunk) : held.push(chunk)));
    child.stderr.on('data', (chunk) => (live ? err.write(chunk) : held.push(chunk)));
    let done = false;
    const finish = (status) => {
      if (done) return; // a spawn error can be followed by close
      done = true;
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      if (!live) {
        out.write(`\n[lanes] output of: ${command}\n`);
        for (const chunk of held) out.write(chunk);
      }
      out.write(`[lanes] ${status === 0 ? 'ok' : `failed (exit ${status})`} (${seconds}s): ${command}\n`);
      resolve(status);
    };
    child.on('error', (error) => {
      const line = `build-lanes: ${error.message}\n`;
      if (live) err.write(line);
      else held.push(Buffer.from(line));
      finish(1);
    });
    child.on('close', (code, signal) => finish(code ?? (signal ? 1 : 0)));
  }));
  const forward = (signal) => {
    for (const child of children) {
      if (child.exitCode !== null || child.signalCode !== null || !child.pid) continue;
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
        continue;
      }
      for (const pid of [...descendantsOf(child.pid), child.pid]) {
        try {
          process.kill(pid, signal);
        } catch {
          // already gone
        }
      }
    }
  };
  process.on('SIGTERM', forward);
  process.on('SIGINT', forward);
  try {
    const statuses = await Promise.all(lanes);
    return statuses.find((status) => status !== 0) ?? 0;
  } finally {
    process.off('SIGTERM', forward);
    process.off('SIGINT', forward);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runLanes(process.argv.slice(2)).then(
    (status) => process.exit(status),
    (error) => {
      console.error(error.message);
      process.exit(2);
    },
  );
}
