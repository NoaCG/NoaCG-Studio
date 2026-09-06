#!/usr/bin/env node
// WHICH SPEC FILES A RED RUN'S SHARDS FAILED ON - read from their own blob reports, so the retry
// job re-runs exactly those files on the same commit and nothing else.
//
//   node scripts/e2e-retry.mjs --blobs <dir>       # prints one JSON object: { specs, filters }
//
// The shards upload `blob-report-<n>` artifacts (playwright.config.ts); ci.yml's `e2e-retry` job
// downloads them into one directory and asks Playwright to merge them into a JSON report, which
// is the same merge the combined HTML report is made from and needs no network. From that report
// the failing spec FILES are collected - files, not test titles, because the retry runs whole
// files and the quarantine is kept per file, the unit the planner and the durations table use.
//
// A test is failed when Playwright's verdict for it is `unexpected`: that is the status after
// every result of the test is weighed, and it is what the `ok` flag on a spec does NOT say - `ok`
// is true for a skipped spec (e2e/AGENTS.md, "A suite that skips itself exits 0").
//
// Nothing to retry is an error, not an empty answer: a shard that died before Playwright reported
// has no failing spec, and re-running "nothing" would let the gate read the retry as green.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { specFilterArg } from './e2e-affected.mjs';
import { planIdentity, specPath } from './e2e-quarantine.mjs';

/**
 * The failing spec files of a Playwright JSON report, sorted, as repo-relative paths.
 * @param {{ suites?: any[] }} report
 */
export function failedSpecFiles(report) {
  const files = new Set();
  const walk = (suite) => {
    for (const spec of suite?.specs ?? []) {
      const failed = (spec.tests ?? []).some((t) => t?.status === 'unexpected');
      if (failed) files.add(specPath(String(spec.file ?? suite.file ?? '').replaceAll('\\', '/').replace(/^\.\//, '')));
    }
    for (const child of suite?.suites ?? []) walk(child);
  };
  for (const suite of report?.suites ?? []) walk(suite);
  files.delete('e2e/');
  return [...files].sort();
}

/** Merge the blob reports in `dir` into one JSON report, with the Playwright the shards used. */
export function mergeBlobReports(dir) {
  const res = spawnSync('npx', ['--no-install', 'playwright', 'merge-reports', '--reporter=json', dir], {
    encoding: 'utf8',
    windowsHide: true,
    shell: process.platform === 'win32',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (res.status !== 0) {
    throw new Error(`merge-reports failed: ${String(res.stderr ?? '').trim() || `exit ${res.status}`}`);
  }
  return JSON.parse(res.stdout);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const dir = argv[argv.indexOf('--blobs') + 1];
  if (!dir || argv.indexOf('--blobs') < 0) {
    console.error('usage: e2e-retry.mjs --blobs <directory of blob reports>');
    process.exit(2);
  }
  const specs = failedSpecFiles(mergeBlobReports(dir));
  if (specs.length === 0) {
    console.error('e2e-retry: the shard reports name no failing spec - the failure was not a test (a shard that died before reporting, or a job outside E2E), so there is nothing to re-run.');
    process.exit(1);
  }
  process.stdout.write(`${JSON.stringify({ specs, filters: specs.map((s) => specFilterArg(planIdentity(s))) })}\n`);
}
