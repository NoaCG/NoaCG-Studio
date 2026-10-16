import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { effectiveLimits, parseRun, processGroupSample } from './cloud-measure.mjs';

test('effective limits use quota and container memory rather than host totals', () => {
  const limits = effectiveLimits({ affinity: 5, hostMemoryBytes: 64 * 2 ** 30, cpuMax: '400000 100000', memoryMax: String(16 * 2 ** 30) });
  assert.equal(limits.effectiveCpus, 4);
  assert.equal(limits.memoryLimitBytes, 16 * 2 ** 30);
  assert.equal(effectiveLimits({ affinity: 2, hostMemoryBytes: 1000, cpuMax: 'max 100000', memoryMax: 'max' }).effectiveCpus, 2);
});

test('measurement requires a time bound and explicit browser files without changing guards', () => {
  const prefix = ['--seconds', '1200', '--out', '/tmp/receipt.json', '--'];
  assert.throws(() => parseRun([...prefix, 'node', 'node_modules/@playwright/test/cli.js', 'test']), /explicit/);
  assert.throws(() => parseRun([...prefix, 'bash', '-c', 'npm run build']), /Only production/);
  assert.throws(() => parseRun(['--seconds', '1801', ...prefix.slice(2), 'npm', 'run', 'build']), /bound/);
  assert.throws(() => parseRun([...prefix, 'node', 'node_modules/@playwright/test/cli.js', 'test', 'e2e/landing.spec.ts', '--workers=40']), /bounded/);
  assert.deepEqual(parseRun([...prefix, 'npm', 'run', 'build']).command, ['npm', 'run', 'build']);
});

test('memory aggregates simultaneous server and browser processes, excluding other groups', () => {
  const root = mkdtempSync(join(tmpdir(), 'cloud-measure-'));
  try {
    for (const [pid, group, rss] of [[11, 11, 100], [12, 11, 200], [13, 99, 900]]) {
      const dir = join(root, String(pid)); mkdirSync(dir);
      writeFileSync(join(dir, 'stat'), `${pid} (name with ) spaces) S 1 ${group} 0`);
      writeFileSync(join(dir, 'status'), `VmRSS: ${rss} kB\n`);
      writeFileSync(join(dir, 'smaps_rollup'), `Pss: ${rss / 2} kB\n`);
    }
    assert.deepEqual(processGroupSample(11, root), { count: 2, rssBytes: 300 * 1024, pssBytes: 150 * 1024 });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
