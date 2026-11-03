#!/usr/bin/env node
// THE PRODUCTION DATABASE'S LOAD, read often enough to warn before it stalls.
//
//   npm run load     # the report, now (reads SUPABASE_ACCESS_TOKEN and VITE_SUPABASE_URL)
//
// On 2026-11-03 production stalled at 05:10 UTC and crashed; Supabase's warning email came at
// 06:45. Nothing here looked at memory or disk, and the compute size was the cause nobody could see.
// .github/workflows/production-load.yml runs this every 30 minutes and turns a finding into the
// rolling issue. It only reads: the Management API's metrics, health and add-on endpoints.
//
// The pure half (parsing and judging) is separate so scripts/production-load.test.mjs pins it
// without a network. Node builtins only, so the workflow needs no install.

import { appendFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { productionRef } from './supabase-projects.mjs';

const MB = 1_048_576;
const API = 'https://api.supabase.com/v1/projects';
const SAMPLE_MS = 60_000;

export const LIMITS = {
  memoryAvailableShare: 0.15,
  swapUsedShare: 0.5,
  majorFaultsPerSecond: 100,
  // A share of the compute size's sustained disk throughput, which bursting can exceed only for a
  // limited time each day. Half leaves room to act before that budget runs out.
  diskBaselineShare: 0.5,
};

/** The sum of a Prometheus metric across its label sets, or null when the scrape does not have it. */
export function metric(text, name) {
  let total = null;
  for (const line of String(text ?? '').split('\n')) {
    if (line.startsWith('#')) continue;
    const token = line.split(/[{ ]/, 1)[0];
    if (token !== name) continue;
    const value = Number(line.trim().split(' ').pop());
    if (Number.isFinite(value)) total = (total ?? 0) + value;
  }
  return total;
}

/** The figures a report is made of, from two scrapes `seconds` apart. */
export function readSample(first, second, seconds) {
  const rate = (name) => {
    const a = metric(first, name);
    const b = metric(second, name);
    // A counter that went backwards means the machine restarted between the scrapes.
    return a === null || b === null || b < a ? null : (b - a) / seconds;
  };
  const read = rate('node_disk_read_bytes_total');
  const written = rate('node_disk_written_bytes_total');
  return {
    memoryTotal: metric(second, 'node_memory_MemTotal_bytes'),
    memoryAvailable: metric(second, 'node_memory_MemAvailable_bytes'),
    swapTotal: metric(second, 'node_memory_SwapTotal_bytes'),
    swapFree: metric(second, 'node_memory_SwapFree_bytes'),
    majorFaultsPerSecond: rate('node_vmstat_pgmajfault'),
    diskBytesPerSecond: read === null || written === null ? null : read + written,
  };
}

/**
 * What is wrong, as `{ key, text }`. The keys identify a finding: they are what a repeat is
 * compared by, so a number moving inside a finding does not mail anybody again.
 */
export function judge(sample, { services = [], baselineMbps = null } = {}, limits = LIMITS) {
  const findings = [];
  const { memoryTotal, memoryAvailable, swapTotal, swapFree, majorFaultsPerSecond, diskBytesPerSecond } = sample;

  const down = services.filter((s) => s.status !== 'ACTIVE_HEALTHY').map((s) => s.name);
  if (down.length) findings.push({ key: `down:${[...down].sort().join(',')}`, text: `Not healthy: ${down.join(', ')}.` });

  if (memoryTotal === null || memoryAvailable === null) {
    findings.push({ key: 'unread', text: 'The memory figures could not be read.' });
  } else if (memoryAvailable < memoryTotal * limits.memoryAvailableShare) {
    findings.push({ key: 'memory', text: `Only ${Math.round(memoryAvailable / MB)} of ${Math.round(memoryTotal / MB)} MiB of memory is available.` });
  }
  if (swapTotal && swapFree !== null && swapTotal - swapFree > swapTotal * limits.swapUsedShare) {
    findings.push({ key: 'swap', text: `${Math.round((swapTotal - swapFree) / MB)} of ${Math.round(swapTotal / MB)} MiB of swap is in use.` });
  }
  if (majorFaultsPerSecond !== null && majorFaultsPerSecond > limits.majorFaultsPerSecond) {
    findings.push({ key: 'thrash', text: `${Math.round(majorFaultsPerSecond)} major page faults per second: memory is thrashing.` });
  }
  if (baselineMbps && diskBytesPerSecond !== null) {
    const mbps = (diskBytesPerSecond * 8) / 1_000_000;
    if (mbps > baselineMbps * limits.diskBaselineShare) {
      findings.push({ key: 'disk', text: `Disk traffic is ${Math.round(mbps)} Mbps against a sustained baseline of ${baselineMbps} Mbps.` });
    }
  }
  return findings;
}

/** The report, in Markdown: the findings first, then every figure either way. */
export function formatReport(sample, { services = [], compute = null, baselineMbps = null } = {}, findings = []) {
  const mib = (bytes) => (bytes === null || bytes === undefined ? 'unread' : `${Math.round(bytes / MB)} MiB`);
  const swapUsed = sample.swapTotal === null || sample.swapFree === null ? null : sample.swapTotal - sample.swapFree;
  const disk = sample.diskBytesPerSecond === null ? 'unread' : `${Math.round((sample.diskBytesPerSecond * 8) / 1_000_000)} Mbps`;
  const faults = sample.majorFaultsPerSecond === null ? 'unread' : `${Math.round(sample.majorFaultsPerSecond)}/s`;
  return [
    findings.length ? findings.map((f) => `- ${f.text}`).join('\n') : 'Production database load is healthy.',
    '',
    '| | |',
    '|---|---|',
    `| Compute | ${compute ?? 'none selected'} |`,
    `| Memory available | ${mib(sample.memoryAvailable)} of ${mib(sample.memoryTotal)} |`,
    `| Swap in use | ${mib(swapUsed)} of ${mib(sample.swapTotal)} |`,
    `| Major page faults | ${faults} |`,
    `| Disk traffic | ${disk}${baselineMbps ? ` (baseline ${baselineMbps} Mbps)` : ''} |`,
    `| Services | ${services.map((s) => `${s.name}: ${s.status === 'ACTIVE_HEALTHY' ? 'healthy' : s.status}`).join(', ') || 'unread'} |`,
  ].join('\n');
}

/** A Management API read, retried because its analytics endpoints throttle in bursts. */
async function read(url, token, as) {
  let failure = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((done) => setTimeout(done, 20_000));
    try {
      const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return await response[as]();
      failure = `HTTP ${response.status}`;
    } catch (error) {
      failure = error.name;
    }
  }
  console.error(`Could not read ${new URL(url).pathname.split('/').slice(4).join('/')}: ${failure}`);
  return null;
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = productionRef(process.env);
  if (!token || !ref) {
    console.error('production-load needs SUPABASE_ACCESS_TOKEN and VITE_SUPABASE_URL.');
    process.exit(2);
  }
  const project = `${API}/${ref}`;
  const health = await read(`${project}/health?services=db,rest,auth,realtime,storage`, token, 'json');
  const addons = await read(`${project}/billing/addons`, token, 'json');
  const first = await read(`${project}/analytics/endpoints/metrics`, token, 'text');
  await new Promise((done) => setTimeout(done, SAMPLE_MS));
  const second = await read(`${project}/analytics/endpoints/metrics`, token, 'text');

  const selected = addons?.selected_addons?.find((a) => a.type === 'compute_instance')?.variant;
  const context = {
    services: Array.isArray(health) ? health.map((s) => ({ name: s.name, status: s.status })) : [],
    compute: selected?.name ?? null,
    baselineMbps: selected?.meta?.baseline_disk_io_mbs ?? null,
  };
  const sample = readSample(first, second, SAMPLE_MS / 1000);
  const findings = judge(sample, context);
  if (!Array.isArray(health)) findings.push({ key: 'unread-health', text: 'Service health could not be read.' });

  const report = formatReport(sample, context, findings);
  console.log(report);
  if (process.env.GITHUB_OUTPUT) {
    writeFileSync('load-report.md', report);
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `state=${findings.map((f) => f.key).join(' ')}\n`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
