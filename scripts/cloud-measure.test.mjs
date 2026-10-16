import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { effectiveLimits, parseRun, processTreeSample, measure } from './cloud-measure.mjs';

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

test('memory includes detached server/browser descendants, excluding unrelated processes', () => {
  const root = mkdtempSync(join(tmpdir(), 'cloud-measure-'));
  try {
    for (const [pid, ppid, group, rss] of [[11, 1, 11, 100], [12, 11, 99, 200], [13, 1, 99, 900], [14, 12, 100, 300]]) {
      const dir = join(root, String(pid)); mkdirSync(dir);
      const fields = Array(20).fill('0');
      fields[0] = 'S'; fields[1] = ppid; fields[2] = group; fields[19] = pid * 100;
      writeFileSync(join(dir, 'stat'), `${pid} (name with ) spaces) ${fields.join(' ')}`);
      writeFileSync(join(dir, 'status'), `VmRSS: ${rss} kB\n`);
      writeFileSync(join(dir, 'smaps_rollup'), `Pss: ${rss / 2} kB\n`);
    }
    const known = new Map();
    const expected = { count: 3, rssBytes: 600 * 1024, pssBytes: 300 * 1024 };
    assert.deepEqual(processTreeSample(11, root, known), expected);
    const detached = join(root, '12/stat');
    writeFileSync(detached, readFileSync(detached, 'utf8').replace(' S 11 ', ' S 1 '));
    assert.deepEqual(processTreeSample(11, root, known), expected, 'reparented children stay attributed');
    writeFileSync(detached, readFileSync(detached, 'utf8').replace('1200', '99999'));
    assert.equal(processTreeSample(11, root, known).rssBytes, 400 * 1024, 'a reused PID is not the old child');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the time bound ends a child that ignores termination and records failure', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cloud-measure-timeout-'));
  try {
    const output = join(root, 'receipt.json');
    const code = await measure({ seconds: 1, output, command: [process.execPath, '-e', 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'] });
    const receipt = JSON.parse(readFileSync(output, 'utf8'));
    assert.equal(code, 1);
    assert.equal(receipt.timedOut, true);
    assert.equal(receipt.signal, 'SIGKILL');
    assert.ok(receipt.wallSeconds < 10);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
