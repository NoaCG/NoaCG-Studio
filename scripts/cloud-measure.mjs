// Explicit owner-authorized, bounded Linux measurement, not a shared verification policy.
// Browser measurements must be queued with --kind sweep. Never set CI to evade local guards.
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { availableParallelism, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const read = (path) => { try { return readFileSync(path, 'utf8').trim(); } catch { return null; } };

export function effectiveLimits({ affinity, hostMemoryBytes, cpuMax, memoryMax }) {
  const [quota, period] = (cpuMax ?? '').split(/\s+/).map(Number);
  const quotaCpus = quota > 0 && period > 0 ? quota / period : null;
  const memory = Number(memoryMax);
  return {
    affinityCpus: affinity,
    quotaCpus,
    effectiveCpus: Math.min(affinity, quotaCpus ?? Infinity),
    hostMemoryBytes,
    memoryLimitBytes: Math.min(hostMemoryBytes, memory > 0 ? memory : Infinity),
  };
}

export function machine() {
  const cpuMax = read('/sys/fs/cgroup/cpu.max');
  const memoryMax = read('/sys/fs/cgroup/memory.max');
  return {
    ...effectiveLimits({ affinity: availableParallelism(), hostMemoryBytes: totalmem(), cpuMax, memoryMax }),
    cpuMax, memoryMax, cgroup: read('/proc/self/cgroup'),
    // A missing v2 root is not proof of an unlimited container. Do not infer cloud profiles here.
    containerLimitsObserved: cpuMax !== null && memoryMax !== null,
    node: process.version, platform: process.platform,
  };
}

export function parseRun(args) {
  const separator = args.indexOf('--');
  if (separator !== 4 || args[0] !== '--seconds' || args[2] !== '--out') {
    throw new Error('Usage: cloud-measure.mjs --seconds <1..1800> --out <receipt.json> -- <command> [args]');
  }
  const seconds = Number(args[1]);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 1800) throw new Error('Measurement needs a 1..1800 second bound');
  const command = args.slice(separator + 1);
  if (!command.length) throw new Error('Missing measurement command');
  // This is a measurement entry, not an alternate arbitrary job runner or a whole-suite bypass.
  const build = command.join(' ') === 'npm run build';
  const changedGates = command.length === 5 && command.slice(0, 4).join(' ') === 'node scripts/gates.mjs run --changed' && /^[\w/.-]+$/.test(command[4]);
  const e2e = command[0] === 'node' && command[1] === 'node_modules/@playwright/test/cli.js' && command[2] === 'test';
  if (!build && !changedGates && !e2e) throw new Error('Only production build, changed gates or an explicit E2E selection may be measured');
  if (e2e) {
    const rest = command.slice(3);
    const specs = rest.filter((arg) => /^e2e\/[\w/.-]+\.spec\.ts$/.test(arg));
    if (!specs.length || rest.some((arg) => !specs.includes(arg) && !/^--(?:workers=[1-8]|reporter=json|global-timeout=\d+|max-failures=\d+)$/.test(arg))) {
      throw new Error('E2E measurement requires explicit spec paths and bounded worker/report options');
    }
  }
  return { seconds, output: args[3], command };
}

// Sum simultaneously resident processes in the new process group, including server and browsers.
// RSS includes shared pages more than once. PSS apportions them; null means it was unavailable.
export function processGroupSample(group, procRoot = '/proc') {
  let rssBytes = 0, pssBytes = 0, count = 0, pssComplete = true;
  for (const pid of readdirSync(procRoot).filter((name) => /^\d+$/.test(name))) {
    const stat = read(`${procRoot}/${pid}/stat`);
    if (!stat) continue;
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(/\s+/);
    if (Number(fields[2]) !== group || fields[0] === 'Z') continue;
    const status = read(`${procRoot}/${pid}/status`);
    const rss = /^VmRSS:\s+(\d+)/m.exec(status ?? '');
    if (!rss) continue;
    count++;
    rssBytes += Number(rss[1]) * 1024;
    const pss = /^Pss:\s+(\d+)/m.exec(read(`${procRoot}/${pid}/smaps_rollup`) ?? '');
    if (pss) pssBytes += Number(pss[1]) * 1024;
    else pssComplete = false;
  }
  return { count, rssBytes, pssBytes: pssComplete ? pssBytes : null };
}

export async function measure({ command, seconds, output }) {
  if (process.platform !== 'linux') throw new Error('This explicit measurement path requires Linux /proc');
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', windowsHide: true }).trim();
  const branch = git('branch', '--show-current');
  if (!branch || branch === 'main' || branch === 'master') throw new Error('Measure on an owned feature branch');
  const receipt = {
    version: 1, startedAt: new Date().toISOString(), revision: git('rev-parse', 'HEAD'),
    branch, dirtyPaths: git('status', '--porcelain'), cwd: process.cwd(), machine: machine(),
    command, boundSeconds: seconds, sampleIntervalMs: 250,
    workers: command.find((arg) => arg.startsWith('--workers='))?.split('=')[1] ?? null,
    cgroupMemoryBeforeBytes: Number(read('/sys/fs/cgroup/memory.current')) || null,
    samples: 0, peakProcesses: 0, aggregatePeakRssBytes: 0, aggregatePeakPssBytes: 0,
    cgroupSampledPeakBytes: 0, timedOut: false,
  };
  const start = performance.now();
  const child = spawn(command[0], command.slice(1), { stdio: 'inherit', detached: true, windowsHide: true });
  const signalGroup = (signal) => { try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; } };
  let killTimer;
  const stop = () => { signalGroup('SIGTERM'); killTimer ??= setTimeout(() => signalGroup('SIGKILL'), 2000); };
  const interrupted = () => { receipt.interrupted = true; stop(); };
  process.on('SIGINT', interrupted);
  process.on('SIGTERM', interrupted);
  const sample = () => {
    if (!child.pid) return;
    const row = processGroupSample(child.pid);
    receipt.samples++;
    receipt.peakProcesses = Math.max(receipt.peakProcesses, row.count);
    receipt.aggregatePeakRssBytes = Math.max(receipt.aggregatePeakRssBytes, row.rssBytes);
    if (row.pssBytes !== null) receipt.aggregatePeakPssBytes = Math.max(receipt.aggregatePeakPssBytes, row.pssBytes);
    else receipt.pssIncomplete = true;
    receipt.cgroupSampledPeakBytes = Math.max(receipt.cgroupSampledPeakBytes, Number(read('/sys/fs/cgroup/memory.current')) || 0);
  };
  const interval = setInterval(sample, receipt.sampleIntervalMs);
  const timeout = setTimeout(() => { receipt.timedOut = true; stop(); }, seconds * 1000);
  const result = await new Promise((done) => {
    child.once('error', (error) => done({ code: 1, error: error.message }));
    child.once('exit', (code, signal) => done({ code, signal }));
  });
  sample();
  // A successful runner must not leave servers/browsers beyond the measurement's bound.
  signalGroup('SIGKILL');
  clearInterval(interval);
  clearTimeout(timeout);
  clearTimeout(killTimer);
  process.off('SIGINT', interrupted);
  process.off('SIGTERM', interrupted);
  Object.assign(receipt, result, { wallSeconds: (performance.now() - start) / 1000, finishedAt: new Date().toISOString() });
  writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n');
  process.stderr.write(`[cloud-measure] ${receipt.wallSeconds.toFixed(2)}s; aggregate sampled RSS ${(receipt.aggregatePeakRssBytes / 2 ** 20).toFixed(1)} MiB; ${output}\n`);
  return receipt.code === 0 && !receipt.timedOut && !receipt.interrupted ? 0 : 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.exitCode = await measure(parseRun(process.argv.slice(2))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
