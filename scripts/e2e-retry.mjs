#!/usr/bin/env node
// WHICH SPEC FILES A RED RUN'S SHARDS FAILED ON - read from their own blob reports, so the retry
// job re-runs exactly those files on the same commit and nothing else.
//
//   node scripts/e2e-retry.mjs --blobs <dir> --shards <n> [--changed <base>] [--github-output]
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
// THREE REFUSALS, each one a case where a green retry would let the gate read more than it knows:
//   - fewer blob reports than shards: a shard died before Playwright reported, and its files never
//     ran on this commit; re-running the other shards' failures says nothing about them;
//   - no failing spec in the reports: the failure was not a test, so there is nothing to re-run;
//   - a failing spec that this change itself touched (`--changed <base>`): a flake in a spec the
//     change wrote or edited is the change's, not the suite's; it is bounced to its author, never
//     quarantined on the strength of a second run.
import { spawnSync } from 'node:child_process';
import { appendFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { changedFilesSince } from './e2e-affected.mjs';
import { parseArgs } from './e2e-quarantine.mjs';
import { editedSpecs, planIdentity, specFilterArg, specPath } from './e2e-spec-names.mjs';

/**
 * The failing spec files of a Playwright JSON report, sorted, as repo-relative paths.
 * @param {{ suites?: any[] }} report
 */
export function failedSpecFiles(report) {
  const files = new Set();
  const walk = (suite) => {
    for (const spec of suite?.specs ?? []) {
      const failed = (spec.tests ?? []).some((t) => t?.status === 'unexpected');
      const file = String(spec.file ?? suite.file ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
      if (failed && file) files.add(specPath(file));
    }
    for (const child of suite?.suites ?? []) walk(child);
  };
  for (const suite of report?.suites ?? []) walk(suite);
  return [...files].sort();
}

/**
 * What to re-run, or why not. Pure: the decision the gate's verdict rests on.
 * @param {{ failed: string[], reports: number, shards: number, changed?: string[] }} input
 * @returns {{ ok: true, specs: string[] } | { ok: false, reason: string }}
 */
export function retryPlan({ failed, reports, shards, changed = [] }) {
  if (shards > 0 && reports < shards) {
    return { ok: false, reason: `${reports} of ${shards} shards uploaded a report - a shard died before Playwright reported, so its files never ran on this commit and a second run of the others proves nothing about them` };
  }
  if (failed.length === 0) {
    return { ok: false, reason: 'the shard reports name no failing spec - the failure was not a test, so there is nothing to re-run' };
  }
  const edited = editedSpecs(changed);
  const touched = failed.filter((spec) => edited.has(planIdentity(spec)));
  if (touched.length > 0) {
    return { ok: false, reason: `${touched.join(', ')} failed and this change edits ${touched.length === 1 ? 'it' : 'them'} - a flake in a spec the change wrote is the change's to fix, not the suite's to quarantine` };
  }
  return { ok: true, specs: failed };
}

/** Merge the blob reports in `dir` into one JSON report, with the Playwright the shards used. */
function mergeBlobReports(dir) {
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

/** What the change touched, from the planner's own reader; an unusable base is "nothing known". */
function changedSince(base) {
  if (!base || /^0{40}$/.test(base)) return [];
  try {
    return changedFilesSince(base);
  } catch {
    return [];
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { flags } = parseArgs(process.argv.slice(2));
  const dir = flags.get('--blobs');
  if (typeof dir !== 'string') {
    console.error('usage: e2e-retry.mjs --blobs <directory of blob reports> --shards <n> [--changed <base>] [--github-output]');
    process.exit(2);
  }
  const reports = readdirSync(dir).filter((f) => /^report-\d+\.zip$/.test(f)).length;
  const shards = Number(flags.get('--shards') ?? 0);
  const plan = retryPlan({ failed: failedSpecFiles(mergeBlobReports(dir)), reports, shards, changed: changedSince(flags.get('--changed')) });
  if (!plan.ok) {
    console.error(`e2e-retry: not re-running - ${plan.reason}.`);
    process.exit(1);
  }
  const filters = plan.specs.map(specFilterArg);
  const out = process.env.GITHUB_OUTPUT;
  if (flags.has('--github-output') && out) {
    appendFileSync(out, `specs=${JSON.stringify(plan.specs)}\nfilters=${filters.join(' ')}\n`);
  }
  process.stdout.write(`${JSON.stringify({ specs: plan.specs, filters })}\n`);
}
