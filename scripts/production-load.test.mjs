import test from 'node:test';
import assert from 'node:assert/strict';

import { formatReport, judge, metric, readSample } from './production-load.mjs';

const MB = 1_048_576;
const healthy = {
  memoryTotal: 1835 * MB,
  memoryAvailable: 1378 * MB,
  swapTotal: 1024 * MB,
  swapFree: 1024 * MB,
  majorFaultsPerSecond: 1,
  diskBytesPerSecond: 100_000,
};
const up = [{ name: 'db', status: 'ACTIVE_HEALTHY' }];
const keys = (sample, context = { services: up, baselineMbps: 174 }) => judge(sample, context).map((f) => f.key);

test('a metric sums its label sets, and a longer name is a different metric', () => {
  const text = [
    '# HELP node_disk_read_bytes_total read',
    'node_disk_read_bytes_total{device="nvme0n1"} 1e+03',
    'node_disk_read_bytes_total{device="nvme1n1"} 2000',
    'node_disk_read_bytes_total_other 9',
    'node_load1 0.5',
  ].join('\n');
  assert.equal(metric(text, 'node_disk_read_bytes_total'), 3000);
  assert.equal(metric(text, 'node_load1'), 0.5);
  assert.equal(metric(text, 'node_load15'), null);
  assert.equal(metric(null, 'node_load1'), null);
});

test('rates come from the two scrapes, and a restart between them reads as no rate', () => {
  const scrape = (faults, read, written) =>
    `node_vmstat_pgmajfault ${faults}\nnode_disk_read_bytes_total{device="a"} ${read}\nnode_disk_written_bytes_total{device="a"} ${written}\n`;
  const sample = readSample(scrape(100, 1000, 500), scrape(700, 7000, 500), 60);
  assert.equal(sample.majorFaultsPerSecond, 10);
  assert.equal(sample.diskBytesPerSecond, 100);
  const restarted = readSample(scrape(100, 1000, 500), scrape(5, 10, 1), 60);
  assert.equal(restarted.majorFaultsPerSecond, null);
  assert.equal(restarted.diskBytesPerSecond, null);
});

test('production as measured right after the move to Small is healthy', () => {
  assert.deepEqual(keys(healthy), []);
});

test('each limit reports its own finding', () => {
  assert.deepEqual(keys({ ...healthy, memoryAvailable: 100 * MB }), ['memory']);
  assert.deepEqual(keys({ ...healthy, swapFree: 300 * MB }), ['swap']);
  assert.deepEqual(keys({ ...healthy, majorFaultsPerSecond: 500 }), ['thrash']);
  // 87 Mbps is half of Small's 174; this is about 96.
  assert.deepEqual(keys({ ...healthy, diskBytesPerSecond: 12_000_000 }), ['disk']);
});

test('a compute size with no known baseline does not guess at disk', () => {
  assert.deepEqual(keys({ ...healthy, diskBytesPerSecond: 12_000_000 }, { services: up, baselineMbps: null }), []);
});

test('an unhealthy service names itself, in a stable order', () => {
  const services = [
    { name: 'rest', status: 'UNHEALTHY' },
    { name: 'db', status: 'UNHEALTHY' },
    { name: 'auth', status: 'ACTIVE_HEALTHY' },
  ];
  assert.deepEqual(keys(healthy, { services }), ['down:db,rest']);
});

test('figures that could not be read are a finding, never a healthy report', () => {
  assert.deepEqual(keys(readSample(null, null, 60)), ['unread']);
});

test('the same finding keeps its key when its number moves, so a repeat mails nobody', () => {
  const context = { services: up, baselineMbps: 174 };
  const [a] = judge({ ...healthy, memoryAvailable: 100 * MB }, context);
  const [b] = judge({ ...healthy, memoryAvailable: 90 * MB }, context);
  assert.equal(a.key, b.key);
  assert.notEqual(a.text, b.text);
});

test('the report leads with what is wrong and always carries the figures', () => {
  const context = { services: up, compute: 'Small', baselineMbps: 174 };
  const sick = { ...healthy, memoryAvailable: 100 * MB };
  const report = formatReport(sick, context, judge(sick, context));
  assert.match(report, /^- Only 100 of 1835 MiB/);
  assert.match(report, /Compute \| Small/);
  assert.match(formatReport(healthy, context, []), /^Production database load is healthy\./);
  assert.match(formatReport(readSample(null, null, 60), {}, []), /Disk traffic \| unread/);
});
