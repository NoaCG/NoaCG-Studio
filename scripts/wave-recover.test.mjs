import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { recoverRows, recoverWave, branchFacts } from './wave-recover.mjs';
import { recordLaunch, recordProgress, readLaunches, readProgress, currentProgress } from './wave-launch.mjs';
import { ensureWavePlansDir } from './wave-plan-store.mjs';
import { digest } from './work-spec.mjs';

const text = `Window starts: 2026-09-13T10:00:00Z
Window ends: 2026-09-13T12:00:00Z
## Wave table
| L | goal | START | TOUCHES | MINTS | POOL | browser |
| - | - | - | - | - | - | - |
| A | Deliver outcome | now | scripts/a.mjs | - | codex | no |
\`\`\`
SESSION A - outcome
BRANCH codex/a
GOAL Deliver outcome
QUEUE queue-merge
\`\`\`
`;
const sha = 'a'.repeat(40);
const input = { text, plan: path.resolve('plan'), launches: [{ letter: 'A', branch: 'codex/a', at: 1, plan: path.resolve('plan') }], jobs: [], landings: [], branches: { 'codex/a': { sha, inMain: true } } };

test('landed slices retain open or invalid parent acceptance during recovery', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wave-recover-parent-'));
  try {
    const plan = path.join(ensureWavePlansDir(dir), '2026-09-13-day-wave-plan.local.md');
    const record = 'docs/work-specs/outcome/work.json';
    const spec = '# Outcome\n### AC-1: Integrated scenario\n';
    mkdirSync(path.join(dir, 'docs/work-specs/outcome'), { recursive: true });
    writeFileSync(path.join(dir, 'docs/work-specs/outcome/spec.md'), spec);
    writeFileSync(path.join(dir, record), JSON.stringify({ version: 2, specSha256: digest(spec), authority: { source: 'owner request', status: 'agreed' } }));
    writeFileSync(plan, text.replace('GOAL Deliver outcome', `SPEC ${record} AC-1\nGOAL Deliver outcome`));
    recordLaunch(dir, { letter: 'A', branch: 'codex/a', size: 'small', plan, now: 1 });
    writeFileSync(path.join(dir, 'landed.jsonl'), JSON.stringify({ branch: 'codex/a', at: 2, sha }) + '\n');
    const options = { dir, plan, root: dir, branches: input.branches };
    const result = recoverWave(options);
    assert.equal(result.rows[0].state, 'landed');
    assert.equal(result.features[0].status, 'open');
    assert.deepEqual(result.features[0].openCriteria, ['AC-1']);
    assert.match(result.nextAction, /before claiming parent completion/);
    writeFileSync(path.join(dir, record), '{bad');
    assert.equal(recoverWave(options).features[0].status, 'invalid');
    writeFileSync(plan, text);
    assert.deepEqual(recoverWave(options).features, []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('empty branch at main and unknown owner do not claim completion or free capacity', () => {
  const [row] = recoverRows(input);
  assert.equal(row.state, 'unknown');
  assert.equal(row.owner.liveness, 'unqueried');
  assert.match(row.nextAction, /do not relaunch/);
});

test('stale landing pins and terminal transport success do not verify current work', () => {
  const job = { kind: 'merge', branch: 'codex/a', enqueuedAt: 2, state: 'done', command: `--expect-sha ${sha}` };
  assert.equal(recoverRows({ ...input, jobs: [job] })[0].state, 'unknown');
  assert.equal(recoverRows({ ...input, jobs: [{ ...job, state: 'running', command: `--expect-sha ${'b'.repeat(40)}` }] })[0].state, 'unknown');
  assert.equal(recoverRows({ ...input, jobs: [{ ...job, state: 'running' }] })[0].state, 'landing');
  assert.equal(recoverRows({ ...input, landings: [{ branch: 'codex/a', at: 3, sha: 'merge-commit' }] })[0].state, 'landed');
});

test('a fresh reader reconstructs identity and deadline from files without any transcript', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wave-recover-'));
  try {
    const plan = path.join(ensureWavePlansDir(dir), '2026-09-13-day-wave-plan.local.md');
    writeFileSync(plan, text);
    recordLaunch(dir, { letter: 'A', branch: 'codex/a', size: 'small', plan,
      host: 'codex', workerId: 'worker-1', worktree: dir, resultPath: path.join(dir, 'result.json'), now: 1 });
    const first = recoverWave({ dir, plan, branches: input.branches, now: Date.parse('2026-09-13T13:00:00Z') });
    assert.equal(first.rows[0].owner.workerId, 'worker-1');
    assert.equal(first.window.expired, true);
    assert.equal(first.observation, null);
    const child = spawnSync(process.execPath, ['--input-type=module', '-e',
      `import { recoverWave } from ${JSON.stringify(new URL('./wave-recover.mjs', import.meta.url).href)}; console.log(JSON.stringify(recoverWave(JSON.parse(process.argv[1]))));`,
      JSON.stringify({ dir, plan, branches: input.branches, now: Date.parse('2026-09-13T13:00:00Z') })], { encoding: 'utf8', windowsHide: true });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), first, 'a new process needs no master memory');
    assert.deepEqual(recoverWave({ dir, plan, branches: input.branches, now: Date.parse('2026-09-13T13:00:00Z') }), first);
    assert.throws(() => recoverWave({ dir, plan: path.join(dir, 'outside.md') }), /shared wave-plan store/);
    assert.throws(() => recordLaunch(dir, { branch: 'codex/a', size: 'small', worktree: 'relative' }), /absolute/);
    const report = { branch: 'codex/a', worktree: dir, workerId: 'worker-1', sha,
      state: 'ready', nextAction: 'inspect result then queue', now: 2 };
    recordProgress(dir, report);
    assert.equal(readLaunches(dir).length, 1, 'state changes never inflate launch/retry metrics');
    assert.equal(readProgress(dir).length, 1);
    assert.equal(Object.keys(currentProgress(readLaunches(dir), readProgress(dir), input.branches)).length, 1);
    assert.deepEqual(currentProgress(readLaunches(dir), readProgress(dir), { 'codex/a': { sha: 'b'.repeat(40) } }), {});
    assert.equal(recoverWave({ dir, plan, branches: input.branches }).rows[0].state, 'ready');
    assert.equal(recoverWave({ dir, plan, branches: { 'codex/a': { sha: 'b'.repeat(40) } } }).rows[0].state, 'unknown');
    assert.throws(() => recordProgress(dir, { ...report, workerId: 'old-worker' }), /no launch is recorded/);
    recordLaunch(dir, { letter: 'A', branch: 'codex/a', size: 'small', plan, host: 'claude', workerId: 'replacement', worktree: dir, now: 3 });
    assert.deepEqual(currentProgress(readLaunches(dir), readProgress(dir), input.branches), {});
    assert.equal(recoverWave({ dir, plan, branches: input.branches }).rows[0].state, 'unknown');
    assert.throws(() => recordProgress(dir, { ...report, now: 4 }), /replaced/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('branch cleanup preserves pinned landing recovery, but receipts alone prove nothing', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wave-recover-git-'));
  try {
    const run = (...args) => {
      const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8', windowsHide: true });
      assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
    };
    run('init');
    run('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-m', 'Fixture');
    const pin = run('rev-parse', 'HEAD');
    run('update-ref', 'refs/remotes/origin/main', pin);
    const jobs = [{ kind: 'merge', branch: 'codex/a', enqueuedAt: 2, state: 'done', command: `--expect-sha ${pin}` }];
    const branches = branchFacts(dir, jobs);
    assert.equal(branches['codex/a'].source, 'landing-pin');
    assert.equal(recoverRows({ ...input, jobs, branches, landings: [{ branch: 'codex/a', at: 3 }] })[0].state, 'landed');
    assert.equal(recoverRows({ ...input, jobs, branches, landings: [] })[0].state, 'unknown');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
