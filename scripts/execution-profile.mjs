// Execution-site resources and the cloud verification policy (#1301; resources by the owner's
// decision of 2026-10-17). Read this worker's kernel/runtime, never a coordinator-supplied profile.
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { availableParallelism, freemem, totalmem } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MiB = 2 ** 20;
const readText = (file) => { try { return readFileSync(file, 'utf8').trim(); } catch { return null; } };
const unescapeMount = (s) => s.replace(/\\([0-7]{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
const number = (s) => s !== null && s !== '' && Number.isFinite(Number(s)) ? Number(s) : null;

// A mount can expose a subtree. Translate membership relative to its mount root, then
// walk to the visible mount boundary, not filesystem / or a sibling controller mount.
export function cgroupDirectories(mount, membership) {
  const root = path.posix.resolve('/', mount.root), member = path.posix.resolve('/', membership);
  if (member !== '/' && member !== root && !member.startsWith(root === '/' ? '/' : `${root}/`)) return [];
  const relative = member === '/' ? '' : path.posix.relative(root, member);
  const point = path.posix.resolve('/', mount.point);
  let current = path.posix.join(point, relative);
  const dirs = [];
  while (true) {
    dirs.push(current);
    if (current === point) break;
    const parent = path.posix.dirname(current);
    if (parent === current) return []; // malformed mount boundary must not loop at /
    current = parent;
  }
  return dirs;
}

export function readResources({ read = readText, affinity = availableParallelism(), hostMemoryBytes = totalmem(), hostFreeBytes = freemem() } = {}) {
  const memberships = (read('/proc/self/cgroup') ?? '').split('\n').flatMap((line) => {
    const m = /^(\d+):([^:]*):(\/.*)$/.exec(line);
    return m ? [{ controllers: m[2].split(','), member: m[3] }] : [];
  });
  const mounts = (read('/proc/self/mountinfo') ?? '').split('\n').flatMap((line) => {
    const [left, right] = line.split(' - ');
    if (!right) return [];
    const fields = left.split(' '), fs = right.split(' ');
    if (!['cgroup', 'cgroup2'].includes(fs[0])) return [];
    return [{ root: unescapeMount(fields[3]), point: unescapeMount(fields[4]), v2: fs[0] === 'cgroup2', controllers: fs.slice(1).join(',').split(',') }];
  });
  // The machine's own totals stand in for any reading that fails, so a cloud worker is never
  // sized below what it has. A cgroup reading only ever lowers them; an unlimited one is no cap.
  const reasons = [];
  let cpus = affinity, memory = hostMemoryBytes, available = hostFreeBytes;
  let cpuSeen = false, memorySeen = false, valid = true;
  for (const controller of ['cpu', 'memory']) {
    // The kernel binds a controller to v1 or v2, never both: a v1 hybrid's empty cgroup2
    // mount does not carry a controller this process holds through a v1 hierarchy.
    const onV1 = memberships.some((m) => m.controllers[0] !== '' && m.controllers.includes(controller));
    const candidates = mounts.filter((m) => m.v2 ? !onV1 : m.controllers.includes(controller));
    let seen = false;
    for (const mount of candidates) {
      const membership = memberships.find((m) => mount.v2 ? m.controllers[0] === '' : m.controllers.includes(controller));
      if (!membership) continue;
      const dirs = cgroupDirectories(mount, membership.member);
      if (!dirs.length) continue;
      seen = true;
      // Claude cloud runs the session's commands in this child of the session's memory cgroup,
      // and its hooks in the parent: read the child too, so a hook reports what commands get.
      const commands = `${dirs[0]}/claude-code-bash`;
      if (controller === 'memory' && read(`${commands}/${mount.v2 ? 'memory.max' : 'memory.limit_in_bytes'}`) !== null) dirs.unshift(commands);
      // Hidden ancestors may impose a lower limit than any visible file; the profile says it
      // could not see them, and the machine's totals stand in for them.
      if (mount.root !== '/') { valid = false; reasons.push(`${controller}: hidden ancestors above ${mount.root}`); }
      for (const dir of dirs) {
        if (controller === 'cpu') {
          const raw = mount.v2 ? read(`${dir}/cpu.max`) : read(`${dir}/cpu.cfs_quota_us`);
          const [q, p] = mount.v2 ? (raw ?? '').split(/\s+/) : [raw, read(`${dir}/cpu.cfs_period_us`)];
          const quota = number(q), period = number(p);
          if (raw === null || !(period > 0) || !(q === 'max' || (!mount.v2 && quota === -1) || quota > 0)) valid = false;
          else if (quota > 0) cpus = Math.min(cpus, quota / period);
        } else {
          const raw = read(`${dir}/${mount.v2 ? 'memory.max' : 'memory.limit_in_bytes'}`);
          const used = number(read(`${dir}/${mount.v2 ? 'memory.current' : 'memory.usage_in_bytes'}`));
          const limit = number(raw);
          const unlimited = raw === 'max' || (!mount.v2 && limit >= 2 ** 60);
          if (raw === null || !(unlimited || limit > 0) || used === null || used < 0) valid = false;
          else if (!unlimited) {
            memory = Math.min(memory, limit);
            available = Math.min(available, Math.max(0, limit - used));
          }
        }
      }
    }
    if (controller === 'cpu') cpuSeen = seen; else memorySeen = seen;
  }
  valid &&= cpuSeen && memorySeen;
  if (!valid) reasons.push('some cgroup readings failed; the machine totals stand in for them');
  return { effectiveCpus: cpus, memoryLimitBytes: memory, availableMemoryBytes: Math.max(0, available), limitsObserved: valid, reasons };
}

export function executionProfile({ env = process.env, platform = process.platform, exists = existsSync, resources, freeBytes = freemem() } = {}) {
  // GitHub's established profile/gates are authoritative and unchanged. CI=true alone is
  // not cloud identity. A forwarded coordinator profile is deliberately never consulted.
  let provider = null;
  if (env.GITHUB_ACTIONS === 'true') return { kind: 'ci' };
  if (platform === 'linux' && env.CODEX_ENVIRONMENT_ID?.startsWith('ccarenv_') && exists('/run/codex-environment')) provider = 'codex';
  else if (platform === 'linux' && env.CLAUDE_CODE_REMOTE === 'true') provider = 'claude';
  if (!provider) return { kind: 'local' };
  const limits = resources ?? readResources();
  const known = limits.limitsObserved === true;
  const freeMb = Math.floor(Math.min(freeBytes, limits.availableMemoryBytes) / MiB);
  return { kind: 'cloud', provider, limits, known, freeMb, workers: cloudWorkers(limits.effectiveCpus, freeMb), smallMinutes: 5,
    broaderMinutes: 12, buildMinutes: provider === 'claude' ? 10 : 5 };
}

// A cloud worker spends what it has (owner, 2026-10-17): no fixed cap, no RAM floor, as many
// browser workers as its memory headroom holds and one for every two visible CPUs, because the dev
// server compiles on the same CPUs and past that point a worker buys failures, not time. Only the
// laptop keeps the memory ladder. Measured on a 4 vCPU, 13.36 GiB Claude VM:
//   - CPU, 2026-10-17, wizard-shell + downloads (27 tests): 4 workers failed 4 boot checks (7 s)
//     on both runs in 1.3 min; 3 workers failed 0, 1 and 1 in 1.4-1.5 min; 2 workers passed all
//     27 twice in 1.5 min. Starved boots are the trap docs/VERIFICATION.md names.
//   - Memory (cloud-execution evidence/claude-measurements.md): cgroup peak 3.33 / 4.55 / 5.62 GiB
//     at 2 / 4 / 6 workers, so about 2.1 GiB of dev server, runner and cache plus 0.6 GiB a worker;
//     each figure here carries about half a gigabyte more.
export const CLOUD_BASE_MB = 2560, CLOUD_WORKER_MB = 640;
export function cloudWorkers(cpus, freeMb) {
  return Math.max(1, Math.min(Math.floor(cpus / 2), Math.floor((freeMb - CLOUD_BASE_MB) / CLOUD_WORKER_MB)));
}

export function buildRisk(files) {
  return files.some((file) => /^(?:src\/(?:main\.tsx|(?:admin|output|join|ograf|bridge)\/main\.tsx?|docs\/docs\.ts|downloads\/downloads\.ts|landing\/motion\.ts)|package(?:-lock)?\.json|(?:vite|tsconfig|eslint)[^/]*\.[^/]+|(?:app|admin|output|join|ograf|bridge|index|docs|downloads)\.html|(?:cli|render-worker|player-host)\/(?:package(?:-lock)?\.json|(?:vite|tsconfig|eslint)[^/]*\.[^/]+|index\.html|src\/(?:main|index|worker)\.[cm]?[jt]sx?)|scripts\/(?:build[^/]*|gates|compile-contracts)\.mjs)$/.test(file));
}

export function queuedVerificationProblem(job, admission, { head, dirty = false } = {}) {
  if (!admission.verification) return null;
  if (!job.verification || job.verification.kind !== admission.verification) return 'Cloud build/broader job lacks reviewed source admission; reconcile it before running';
  if (head !== job.verification.source || dirty) return 'Queued verification source state moved; inspect this job and re-review';
  return null;
}

export function cloudPlanAdmission({ profile, boundMinutes, job, source }) {
  if (profile.kind !== 'cloud') return null;
  if (!job || job.state !== 'running') return 'Cloud browser execution must use the existing job queue; list the plan first, then queue the selection';
  if (job.capMinutes < boundMinutes) return `Queue this selection with --cap ${boundMinutes}; the current job cap is too small`;
  if (boundMinutes > 5 && (job.verification?.kind !== 'broader' || job.verification.source !== source)) return 'Broader selection needs reviewed source admission in the existing queue';
  return null;
}

export function cloudBuildAdmission({ profile, job, source, dirty = false }) {
  if (profile.kind !== 'cloud') return;
  if (!job || job.state !== 'running') throw Error('Cloud production build must use the existing job queue');
  const admission = cloudJobPolicy({ profile, build: true, requestedCap: job.capMinutes });
  const problem = queuedVerificationProblem(job, admission, { head: source, dirty });
  if (problem) throw Error(problem);
}

export function cloudBrowserAdmission({ profile, args = [], job, source, dirty = false }) {
  if (profile.kind !== 'cloud' || args.some((a) => ['--list', '--help', '--version'].includes(a))) return {};
  if (!args.includes('test') && !job) return {}; // inspection/import, not a Playwright execution
  const problem = cloudPlanAdmission({ profile, boundMinutes: job?.capMinutes ?? 5, job, source });
  if (problem) throw Error(problem);
  const admission = cloudJobPolicy({ profile, browser: true, requestedCap: job.capMinutes });
  const stateProblem = queuedVerificationProblem(job, admission, { head: source, dirty });
  if (stateProblem) throw Error(stateProblem);
  const maximum = admission.capMinutes * 60_000;
  for (let i = 0; i < args.length; i++) {
    const raw = args[i].startsWith('--global-timeout=') ? args[i].slice('--global-timeout='.length)
      : args[i] === '--global-timeout' ? args[++i] : null;
    if (raw !== null && (!Number.isFinite(Number(raw)) || Number(raw) <= 0 || Number(raw) > maximum)) throw Error(`Cloud global timeout must be positive and at most ${maximum} milliseconds`);
  }
  return { globalTimeout: maximum };
}

export function workerRequestsInCommand(command) {
  return [...command.matchAll(/(?:^|[\s;&|])(?:--workers(?:=|\s+)|-j(?:=|\s+)?|E2E_WORKERS=)([^\s;&|]+)/g)].map((match) => match[1]);
}

export function requestedWorkerCounts(args) {
  const values = [];
  for (let i = 0; i < args.length; i++) {
    const match = /^(?:--workers=|-j=?)(.+)$/.exec(args[i]);
    if (match) values.push(match[1]);
    else if (['--workers', '-j'].includes(args[i])) values.push(args[++i] ?? '');
  }
  return values;
}

export function cloudJobPolicy({ command, browser = false, build = false, requestedCap, profile, requestedWorkers = [] }) {
  if (profile.kind !== 'cloud') return { capMinutes: requestedCap ?? 45 };
  for (const workers of requestedWorkers) if (!Number.isInteger(Number(workers)) || Number(workers) < 1 || Number(workers) > profile.workers) {
    throw Error(`Cloud browser worker count must be 1..${profile.workers} on the executing worker`);
  }
  const maximum = build ? profile.buildMinutes : browser ? profile.broaderMinutes : null;
  const capMinutes = requestedCap ?? (browser ? 5 : maximum ?? 45);
  if (!Number.isFinite(capMinutes) || capMinutes <= 0 || (maximum && capMinutes > maximum)) throw Error(`Cloud ${build ? 'build' : 'browser'} cap exceeds ${maximum} minutes`);
  return { capMinutes, verification: build ? 'build' : browser && capMinutes > 5 ? 'broader' : null, command };
}

export async function enforceCloudBuildAdmission() {
  const profile = executionProfile();
  if (profile.kind !== 'cloud') return;
  const { jobsDir, readJobs } = await import('./jobs-store.mjs');
  const job = readJobs(jobsDir()).find((j) => j.id === process.env.NOACG_QUEUED_JOB_ID && path.resolve(j.checkout) === path.resolve(process.cwd()));
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', windowsHide: true }).trim();
  cloudBuildAdmission({ profile, job, source: job ? git('rev-parse', 'HEAD') : null, dirty: job ? Boolean(git('status', '--porcelain')) : false });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(executionProfile(), null, 2));
