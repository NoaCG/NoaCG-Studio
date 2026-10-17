import test from 'node:test';
import assert from 'node:assert/strict';
import { cgroupDirectories, readResources, executionProfile, cloudJobPolicy, buildRisk } from './execution-profile.mjs';
import { chooseWorkers } from './e2e-workers.mjs';
import { localRunPolicy } from './e2e-affected.mjs';
import { schedule } from './jobs-store.mjs';

const GiB = 2 ** 30;
function fixture(v2 = true) {
  const files = new Map();
  if (v2) {
    files.set('/proc/self/cgroup', '0::/team/job');
    files.set('/proc/self/mountinfo', '1 0 0:1 / /cg rw - cgroup2 cgroup rw');
    for (const dir of ['/cg', '/cg/team', '/cg/team/job']) {
      files.set(`${dir}/cpu.max`, 'max 100000'); files.set(`${dir}/memory.max`, 'max'); files.set(`${dir}/memory.current`, '0');
    }
    files.set('/cg/team/cpu.max', '200000 100000');
    files.set('/cg/team/memory.max', String(4 * GiB)); files.set('/cg/team/memory.current', String(2 * GiB));
    files.set('/cg/team/job/cpu.max', '400000 100000'); files.set('/cg/team/job/memory.max', String(16 * GiB));
  } else {
    files.set('/proc/self/cgroup', '5:cpu,cpuacct:/team/job\n4:memory:/team/job');
    files.set('/proc/self/mountinfo', '1 0 0:1 / /cpu rw - cgroup cgroup rw,cpu,cpuacct\n2 0 0:2 / /mem rw - cgroup cgroup rw,memory');
    for (const suffix of ['', '/team', '/team/job']) {
      files.set(`/cpu${suffix}/cpu.cfs_quota_us`, '-1'); files.set(`/cpu${suffix}/cpu.cfs_period_us`, '100000');
      files.set(`/mem${suffix}/memory.limit_in_bytes`, String(2 ** 62)); files.set(`/mem${suffix}/memory.usage_in_bytes`, '0');
    }
    files.set('/cpu/team/cpu.cfs_quota_us', '150000');
    files.set('/mem/team/memory.limit_in_bytes', String(3 * GiB)); files.set('/mem/team/memory.usage_in_bytes', String(GiB));
  }
  return { files, read: (file) => files.get(file) ?? null, affinity: 8, hostMemoryBytes: 64 * GiB, hostFreeBytes: 32 * GiB };
}
const known = (cpus = 4, free = 12 * GiB) => ({ effectiveCpus: cpus, memoryLimitBytes: 16 * GiB, availableMemoryBytes: free, limitsObserved: true });
const cloud = (resources = known(), provider = 'codex', extra = {}) => executionProfile({ platform: 'linux', exists: () => true, freeBytes: 32 * GiB, resources,
  env: provider === 'codex' ? { CODEX_ENVIRONMENT_ID: 'ccarenv_worker', ...extra } : { CLAUDE_CODE_REMOTE: 'true', ...extra } });

test('v2 uses tighter CPU and memory ancestors and ancestor headroom', () => {
  const r = readResources(fixture());
  assert.equal(r.limitsObserved, true); assert.equal(r.effectiveCpus, 2);
  assert.equal(r.memoryLimitBytes, 4 * GiB); assert.equal(r.availableMemoryBytes, 2 * GiB);
});
test('v1 independent controller mounts, unlimited sentinels and fractional ancestor quota', () => {
  const r = readResources(fixture(false));
  assert.equal(r.limitsObserved, true); assert.equal(r.effectiveCpus, 1.5);
  assert.equal(r.memoryLimitBytes, 3 * GiB); assert.equal(r.availableMemoryBytes, 2 * GiB);
});
test('mount roots map membership without escaping and hidden ancestors stay unknown', () => {
  assert.deepEqual(cgroupDirectories({ root: '/team', point: '/cg' }, '/team/job'), ['/cg/job', '/cg']);
  assert.deepEqual(cgroupDirectories({ root: '/team', point: '/cg' }, '/other/job'), []);
  assert.deepEqual(cgroupDirectories({ root: '/team', point: '/cg' }, '/'), ['/cg']);
  assert.deepEqual(cgroupDirectories({ root: '/team', point: '/cg/' }, '/team/job'), ['/cg/job', '/cg']);
  const f = fixture(); f.files.set('/proc/self/mountinfo', '1 0 0:1 /team /cg rw - cgroup2 cgroup rw');
  assert.equal(readResources(f).limitsObserved, false);
});
test('v1 hybrid ignores a cgroup2 mount that does not carry the controller (#1361)', () => {
  // Measured in a Claude Code cloud VM: v1 controllers plus an empty cgroup2 at /sys/fs/cgroup/unified.
  const id = '/process_api/01a1', leaf = `${id}/claude-code-bash`, cg = '/sys/fs/cgroup', MiB = 2 ** 20;
  const v1 = ['cpu', 'cpuacct', 'cpuset', 'memory', 'devices', 'freezer', 'blkio', 'pids', 'name=systemd'];
  const files = new Map([
    ['/proc/self/cgroup', `9:name=systemd:/\n8:pids:/\n7:blkio:/\n6:freezer:/\n5:devices:/\n4:memory:${leaf}\n3:cpuset:/\n2:cpuacct:/\n1:cpu:/\n0::/`],
    ['/proc/self/mountinfo', [`37 24 0:29 / ${cg} rw,relatime - tmpfs tmpfs rw,mode=755`,
      ...v1.map((c, i) => `${38 + i} 37 0:${30 + i} / ${cg}/${c.replace('name=', '')} rw,relatime - cgroup cgroup rw,${c}`),
      `47 37 0:39 / ${cg}/unified rw,relatime - cgroup2 cgroup2 rw`].join('\n')],
    [`${cg}/unified/cgroup.controllers`, 'hugetlb'],
    [`${cg}/cpu/cpu.cfs_quota_us`, '-1'], [`${cg}/cpu/cpu.cfs_period_us`, '100000'],
    [`${cg}/memory/memory.limit_in_bytes`, '9223372036854771712'], [`${cg}/memory/memory.usage_in_bytes`, String(670 * MiB)],
    [`${cg}/memory/process_api/memory.limit_in_bytes`, '9223372036854771712'], [`${cg}/memory/process_api/memory.usage_in_bytes`, String(712 * MiB)],
    [`${cg}/memory${id}/memory.limit_in_bytes`, '9223372036854771712'], [`${cg}/memory${id}/memory.usage_in_bytes`, String(670 * MiB)],
    [`${cg}/memory${leaf}/memory.limit_in_bytes`, '14343688192'], [`${cg}/memory${leaf}/memory.usage_in_bytes`, String(45 * MiB)],
  ]);
  const env = { read: (file) => files.get(file) ?? null, affinity: 4, hostMemoryBytes: 16 * GiB, hostFreeBytes: 15 * GiB };
  const r = readResources(env);
  assert.equal(r.limitsObserved, true); assert.equal(r.effectiveCpus, 4);
  assert.equal(r.memoryLimitBytes, 14343688192); assert.equal(r.availableMemoryBytes, 14343688192 - 45 * MiB);
  // Once cpu is not held through v1, the cgroup2 mount carries it: a missing reading there stays unknown.
  files.set('/proc/self/cgroup', files.get('/proc/self/cgroup').replace('1:cpu:/\n', ''));
  assert.equal(readResources(env).limitsObserved, false);
  files.set(`${cg}/unified/cpu.max`, '200000 100000');
  assert.equal(readResources(env).effectiveCpus, 2);
});
test('missing or malformed ancestor readings never become host-sized cloud memory', () => {
  for (const [file, raw] of [['/cg/team/cpu.max', null], ['/cg/memory.current', null], ['/cg/team/memory.max', 'garbage']]) {
    const f = fixture(); if (raw === null) f.files.delete(file); else f.files.set(file, raw);
    const r = readResources(f); assert.equal(r.limitsObserved, false); assert.equal(r.memoryLimitBytes, null);
    const p = cloud(r); assert.equal(p.workers, 1); assert.equal(p.broaderMinutes, 5); assert.equal(p.buildMinutes, null); assert.ok(p.freeMb <= 2048);
  }
});
test('resource selection belongs to the executing worker, not coordinator hints', () => {
  const p = cloud(known(), 'codex', { NOACG_EXECUTION_PROFILE: 'local', NOACG_COORDINATOR_PROFILE: 'laptop', E2E_WORKERS: '20' });
  assert.equal(p.kind, 'cloud'); assert.equal(p.workers, 4);
  assert.equal(cloud(known(2)).workers, 2); assert.equal(cloud(known(4, 4 * GiB)).workers, 2);
  assert.equal(cloud(known(1)).workers, 1); assert.equal(cloud(known(), 'claude').buildMinutes, 10);
  assert.equal(executionProfile({ env: { CODEX_ENVIRONMENT_ID: 'ccarenv_coordinator' }, platform: 'linux', exists: () => false }).kind, 'local');
  assert.equal(executionProfile({ env: { NOACG_EXECUTION_PROFILE: 'cloud', CI: 'true' }, platform: 'win32' }).kind, 'local');
  assert.equal(executionProfile({ env: { GITHUB_ACTIONS: 'true' } }).kind, 'ci');
});
test('cloud worker caps cannot be inflated by overrides; local ladder remains unchanged', () => {
  assert.equal(chooseWorkers({ freeMb: 32000, override: '8', profile: cloud(known(2)) }).workers, 2);
  assert.equal(chooseWorkers({ freeMb: 300, override: '8' }).workers, 8);
  assert.equal(chooseWorkers({ freeMb: 5300 }).workers, 6);
  assert.throws(() => cloudJobPolicy({ browser: true, profile: cloud(), requestedWorkers: ['8'] }), /worker count/);
  assert.throws(() => cloudJobPolicy({ browser: true, profile: cloud(), requestedWorkers: ['50%'] }), /worker count/);
});
test('cloud time bounds, unknown limits and build triggers preserve CI/local policies', () => {
  assert.equal(cloudJobPolicy({ browser: true, profile: cloud() }).capMinutes, 5);
  assert.equal(cloudJobPolicy({ browser: true, profile: cloud(), requestedCap: 12 }).verification, 'broader');
  assert.throws(() => cloudJobPolicy({ browser: true, profile: cloud(), requestedCap: 13 }), /exceeds/);
  assert.throws(() => cloudJobPolicy({ build: true, profile: cloud({ limitsObserved: false }) }), /Unknown/);
  assert.equal(cloudJobPolicy({ build: true, profile: cloud(known(), 'claude') }).capMinutes, 10);
  assert.equal(cloudJobPolicy({ browser: true, profile: { kind: 'local' }, requestedCap: 20 }).capMinutes, 20);
  assert.equal(buildRisk(['docs/note.md', 'src/copy.ts']), false);
  assert.equal(buildRisk(['package-lock.json']), true); assert.equal(buildRisk(['vite.config.ts']), true);
  assert.equal(buildRisk(['app.html']), true); assert.equal(buildRisk(['scripts/build-player-host.mjs']), true);
});
test('affected planner leaves larger/unknown selections and whole suites to CI', () => {
  const plan = { mode: 'subset', specs: ['e2e/downloads.spec.ts'] };
  assert.equal(localRunPolicy(plan, { profile: cloud(), minutes: 4 }).boundMinutes, 5);
  assert.equal(localRunPolicy(plan, { profile: cloud(), minutes: 8 }).boundMinutes, 12);
  assert.match(localRunPolicy(plan, { profile: cloud(), minutes: 13 }).refusal, /GitHub Actions/);
  assert.match(localRunPolicy(plan, { profile: cloud({ limitsObserved: false }), minutes: 8 }).refusal, /5-minute/);
  assert.equal(localRunPolicy(plan, { minutes: 100 }).refusal, null);
  assert.ok(localRunPolicy({ mode: 'full' }, { profile: cloud() }).refusal);
  assert.equal(localRunPolicy({ mode: 'full' }, { ci: true, profile: cloud() }).refusal, null);
});
test('scheduler uses executing-worker headroom and ignores laptop presence/clock for cloud', () => {
  const job = { id: 'j-0001', command: 'npm run test:e2e -- e2e/downloads.spec.ts', kind: 'sweep', state: 'waiting', checkout: '/worker', after: [] };
  const opts = { freeMemMb: 32000, now: Date.parse('2026-10-16T07:00:00Z'), presence: 'present' };
  const a = schedule([job], { ...opts, execution: cloud() });
  assert.equal(a.start.length, 1); assert.equal(a.budget.mode, 'cloud');
  assert.equal(schedule([job], { ...opts, execution: cloud(known(4, GiB)) }).start.length, 0);
  const unknown = schedule([job], { ...opts, execution: cloud({ limitsObserved: false }) });
  assert.equal(unknown.start.length, 0); assert.equal(unknown.dead.length, 1);
  assert.equal(schedule([job], opts).budget.mode, 'modest');
});

test('one reviewed build/broader admission is atomic and failed outcomes are not repeated', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawn } = await import('node:child_process');
  const { addJob, readJobs, writeJob } = await import('./jobs-store.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'verification-admission-'));
  const source = 'a'.repeat(40);
  const input = { command: 'npm run build', checkout: '/worker', verification: { source, kind: 'build' }, now: Date.now() };
  try {
    const module = new URL('./jobs-store.mjs', import.meta.url).href;
    const script = `import {addJob} from ${JSON.stringify(module)}; try { console.log(addJob(process.argv[1], JSON.parse(process.argv[2])).id); } catch { process.exitCode = 2; }`;
    const attempts = await Promise.all(Array.from({ length: 6 }, () => new Promise((done) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', script, dir, JSON.stringify(input)], { windowsHide: true });
      child.on('close', (code) => done(code));
    })));
    assert.equal(attempts.filter((code) => code === 0).length, 1);
    const jobs = readJobs(dir); assert.equal(jobs.length, 1);
    writeJob(dir, { ...jobs[0], state: 'failed', exitCode: 1 });
    assert.throws(() => addJob(dir, input), /already has build/);
    assert.ok(addJob(dir, { ...input, verification: { source, kind: 'broader' } }));
    assert.ok(addJob(dir, { ...input, verification: { source: 'b'.repeat(40), kind: 'build' } }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('affinity includes the executing cpuset and caps a larger ancestor quota', () => {
  const f = fixture(); f.affinity = 1;
  assert.equal(readResources(f).effectiveCpus, 1);
});
test('ancestor sibling consumption, not leaf usage, determines safe memory headroom', () => {
  const f = fixture(); f.files.set('/cg/team/memory.current', String(3.5 * GiB));
  f.files.set('/cg/team/job/memory.current', String(0.1 * GiB));
  assert.equal(readResources(f).availableMemoryBytes, 0.5 * GiB);
});
test('Playwright long and short CLI worker overrides cannot defeat the cloud cap', async () => {
  const { validateCloudWorkerRequest } = await import('./e2e-workers.mjs');
  for (const args of [['--workers', '8'], ['--workers=8'], ['-j', '8'], ['-j8'], ['-j=8']]) {
    assert.throws(() => validateCloudWorkerRequest({ profile: cloud(), args, override: '' }), /worker count/);
  }
  assert.doesNotThrow(() => validateCloudWorkerRequest({ profile: cloud(), args: ['--workers=2'], override: '' }));
  assert.throws(() => validateCloudWorkerRequest({ profile: cloud(known(1)), args: [], override: '4' }), /worker count/);
  assert.doesNotThrow(() => validateCloudWorkerRequest({ profile: { kind: 'local' }, args: ['--workers=8'], override: '8' }));
});

test('command worker parsing covers normal overrides without misreading --json', async () => {
  const { workerRequestsInCommand } = await import('./execution-profile.mjs');
  assert.deepEqual(workerRequestsInCommand('node check.mjs --json'), []);
  assert.deepEqual(workerRequestsInCommand('E2E_WORKERS=8 npm run test:e2e -- -j 6'), ['8', '6']);
  assert.deepEqual(workerRequestsInCommand('npm run test:e2e -- --workers=4'), ['4']);
});

test('source entrypoints trigger builds while documentation remains targeted', () => {
  for (const file of ['src/main.tsx', 'src/admin/main.tsx', 'src/output/main.ts', 'src/docs/docs.ts', 'downloads.html', 'player-host/index.html', 'player-host/src/main.tsx', 'cli/src/index.ts', 'player-host/vite.config.ts', 'player-host/tsconfig.json']) assert.equal(buildRisk([file]), true, file);
  assert.equal(buildRisk(['docs/ARCHITECTURE.md']), false);
});
test('runtime refuses legacy/moved build and broader records without reviewed admission', async () => {
  const { queuedVerificationProblem, cloudPlanAdmission } = await import('./execution-profile.mjs');
  const source = 'a'.repeat(40), admission = { verification: 'build' };
  assert.match(queuedVerificationProblem({}, admission, { head: source }), /lacks/);
  const job = { verification: { source, kind: 'build' } };
  assert.equal(queuedVerificationProblem(job, admission, { head: source }), null);
  assert.match(queuedVerificationProblem(job, admission, { head: 'b'.repeat(40) }), /moved/);
  assert.match(queuedVerificationProblem(job, admission, { head: source, dirty: true }), /moved/);
  assert.match(cloudPlanAdmission({ profile: cloud(), boundMinutes: 12, source }), /queue/);
  assert.match(cloudPlanAdmission({ profile: cloud(), boundMinutes: 12, source, job: { state: 'running', capMinutes: 12 } }), /reviewed source/);
  assert.equal(cloudPlanAdmission({ profile: cloud(), boundMinutes: 12, source, job: { state: 'running', capMinutes: 12, verification: { source, kind: 'broader' } } }), null);
});

test('direct Playwright execution needs running queue admission and a bounded global timeout', async () => {
  const { cloudBrowserAdmission } = await import('./execution-profile.mjs');
  const args = ['node', 'playwright/cli.js', 'test', 'e2e/downloads.spec.ts'];
  const source = 'a'.repeat(40), job = { state: 'running', capMinutes: 5 };
  assert.throws(() => cloudBrowserAdmission({ profile: cloud(), args }), /queue/);
  assert.deepEqual(cloudBrowserAdmission({ profile: cloud(), args, job }), { globalTimeout: 300000 });
  for (const more of [['--global-timeout=0'], ['--global-timeout', '720000'], ['--global-timeout=bad']]) assert.throws(() => cloudBrowserAdmission({ profile: cloud(), args: [...args, ...more], job }), /global timeout/);
  assert.throws(() => cloudBrowserAdmission({ profile: cloud(), args, job: { state: 'done', capMinutes: 5 } }), /queue/);
  assert.throws(() => cloudBrowserAdmission({ profile: cloud({ limitsObserved: false }), args, job }), /Unknown/);
  assert.throws(() => cloudBrowserAdmission({ profile: cloud(), args, source, job: { state: 'running', capMinutes: 12 } }), /reviewed source/);
  assert.deepEqual(cloudBrowserAdmission({ profile: cloud(), args, source, job: { state: 'running', capMinutes: 12, verification: { kind: 'broader', source } } }), { globalTimeout: 720000 });
  assert.deepEqual(cloudBrowserAdmission({ profile: cloud(), args: [...args, '--list'] }), {});
  assert.deepEqual(cloudBrowserAdmission({ profile: { kind: 'local' }, args }), {});
  assert.deepEqual(cloudBrowserAdmission({ profile: { kind: 'ci' }, args }), {});
});

test('normal production build entry requires running reviewed queue admission in cloud only', async () => {
  const { cloudBuildAdmission } = await import('./execution-profile.mjs');
  const source = 'a'.repeat(40), job = { state: 'running', capMinutes: 5, verification: { kind: 'build', source } };
  assert.throws(() => cloudBuildAdmission({ profile: cloud() }), /job queue/);
  assert.throws(() => cloudBuildAdmission({ profile: cloud(), job: { ...job, verification: null }, source }), /lacks/);
  assert.throws(() => cloudBuildAdmission({ profile: cloud(), job, source, dirty: true }), /moved/);
  assert.throws(() => cloudBuildAdmission({ profile: cloud(), job: { ...job, capMinutes: 6 }, source }), /exceeds/);
  assert.doesNotThrow(() => cloudBuildAdmission({ profile: cloud(), job, source }));
  assert.doesNotThrow(() => cloudBuildAdmission({ profile: { kind: 'local' } }));
  assert.doesNotThrow(() => cloudBuildAdmission({ profile: { kind: 'ci' } }));
});
