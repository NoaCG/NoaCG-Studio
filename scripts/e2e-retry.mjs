#!/usr/bin/env node
// WHICH SPEC FILES A RED RUN'S SHARDS FAILED ON - read from their own blob reports, so the retry
// job re-runs exactly those files on the same commit and nothing else.
//
//   node scripts/e2e-retry.mjs --blobs <dir> --shards <n> [--shard-specs <json>] [--changed <base>] [--github-output]
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
// A SHARD THAT DIED IS RE-RUN WHOLE. A shard killed at its 20-minute cap, or one that failed before
// Playwright reported, uploads no blob, so its files have no verdict on this commit at all. Until
// 2026-10-03 that refused the whole retry, and twice that day (runs 37096120413 and 37118148332)
// one slow shard beside one flaky spec left main red with nothing re-run. Now the files the plan
// assigned to the dead shard (`--shard-specs`, the plan's own `shardSpecs`) come back as
// `unreported`, and ci.yml runs them in a step of their own. That is their FIRST run: a failure
// there keeps the run red but is never read as a failure confirmed by a second run, and a pass is
// never a flake to quarantine. Only the `specs` that failed in a shard are quarantined.
//
// THREE REFUSALS, each one a case where a green retry would let the gate read more than it knows:
//   - more than one shard without a report, or a dead shard whose files the plan does not name:
//     one second run cannot cover several runners' worth of files inside its own time limit, and
//     a file list that cannot be named cannot be re-run;
//   - nothing to re-run: no failing spec in the reports and no dead shard - the failure was not a
//     test;
//   - a failing spec that this change itself touched (`--changed <base>`): a flake in a spec the
//     change wrote or edited is the change's, not the suite's; it is bounced to its author, never
//     quarantined on the strength of a second run.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
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

/** How many shards may die and still be re-run: one runner's worth of files fits the retry's cap. */
export const MAX_DEAD_SHARDS = 1;

/**
 * What to re-run, or why not. Pure: the decision the gate's verdict rests on.
 *
 * `specs` failed in a shard and get their SECOND run; `unreported` are the files of a shard that
 * uploaded no report, which get their FIRST. `reported` is the 1-based indices of the shards that
 * uploaded one, and `shardSpecs` the plan's assignment, one file list per shard in shard order.
 * @param {{ failed: string[], reported: number[], shards: number, shardSpecs?: string[][] | null, changed?: string[] }} input
 * @returns {{ ok: true, specs: string[], unreported: string[], dead: number[] } | { ok: false, reason: string }}
 */
export function retryPlan({ failed, reported, shards, shardSpecs = null, changed = [] }) {
  const have = new Set(reported);
  const dead = Array.from({ length: Math.max(0, shards) }, (_, i) => i + 1).filter((n) => !have.has(n));
  if (dead.length > MAX_DEAD_SHARDS) {
    return { ok: false, reason: `${dead.length} of ${shards} shards uploaded no report (${dead.join(', ')}) - more than one runner died, and one second run cannot cover their files inside its own time limit` };
  }
  const unnamed = dead.filter((n) => !Array.isArray(shardSpecs?.[n - 1]) || shardSpecs[n - 1].length === 0);
  if (unnamed.length > 0) {
    return { ok: false, reason: `shard ${unnamed.join(', ')} uploaded no report and the plan does not name its files, so they cannot be re-run` };
  }
  const failing = new Set(failed);
  const unreported = [...new Set(dead.flatMap((n) => shardSpecs[n - 1].map(specPath)))].filter((s) => !failing.has(s)).sort();
  if (failed.length === 0 && unreported.length === 0) {
    return { ok: false, reason: 'the shard reports name no failing spec - the failure was not a test, so there is nothing to re-run' };
  }
  const edited = editedSpecs(changed);
  const touched = failed.filter((spec) => edited.has(planIdentity(spec)));
  if (touched.length > 0) {
    return { ok: false, reason: `${touched.join(', ')} failed and this change edits ${touched.length === 1 ? 'it' : 'them'} - a flake in a spec the change wrote is the change's to fix, not the suite's to quarantine` };
  }
  return { ok: true, specs: failed, unreported, dead };
}

/**
 * Merge the blob reports in `dir` into one JSON report, with the Playwright the shards used.
 *
 * The reporter writes to a FILE (`PLAYWRIGHT_JSON_OUTPUT_FILE`), never to stdout. On the Linux
 * runner, stdout captured through a pipe stops at 146,176 bytes of a 2.2 MB report, every time
 * (runs 36246036302 and 36253812414), while a file receives all of it: `JSON.parse` then failed on
 * the cut-off document, and a one-spec flake turned main red. Windows receives the whole report,
 * which is why it could not be reproduced there.
 */
function mergeBlobReports(dir) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'e2e-retry-'));
  const file = path.join(tmp, 'merged.json');
  try {
    const res = spawnSync('npx', ['--no-install', 'playwright', 'merge-reports', '--reporter=json', dir], {
      encoding: 'utf8',
      windowsHide: true,
      shell: process.platform === 'win32',
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: file },
    });
    if (res.status !== 0) {
      throw new Error(`merge-reports failed: ${String(res.stderr ?? '').trim() || `exit ${res.status}`}`);
    }
    return JSON.parse(readFileSync(file, 'utf8'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * What the change touched, from the planner's own reader. An unusable base is "nothing known", and
 * says so, because it switches the edited-spec refusal off: run 37118148332 hit that silently, on
 * a one-commit checkout with no base to diff against (ci.yml now fetches the history).
 */
function changedSince(base) {
  if (!base || /^0{40}$/.test(base)) return [];
  try {
    return changedFilesSince(base);
  } catch (e) {
    console.error(`e2e-retry: cannot tell what this change edits (base ${base}): ${String(e?.message ?? e).split('\n')[0]}`);
    return [];
  }
}

/** The plan's per-shard assignment, or null when it is absent or unreadable. */
function parseShardSpecs(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    const bins = JSON.parse(raw);
    return Array.isArray(bins) ? bins : null;
  } catch {
    return null;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { flags } = parseArgs(process.argv.slice(2));
  const dir = flags.get('--blobs');
  if (typeof dir !== 'string') {
    console.error('usage: e2e-retry.mjs --blobs <directory of blob reports> --shards <n> [--shard-specs <json>] [--changed <base>] [--github-output]');
    process.exit(2);
  }
  // No directory is no shard reporting at all, which the plan refuses or re-runs like any other.
  const zips = existsSync(dir) ? readdirSync(dir).filter((f) => /^report-\d+\.zip$/.test(f)) : [];
  const shards = Number(flags.get('--shards') ?? 0);
  const plan = retryPlan({
    failed: zips.length > 0 ? failedSpecFiles(mergeBlobReports(dir)) : [],
    reported: zips.map((f) => Number(/\d+/.exec(f)[0])),
    shards,
    shardSpecs: parseShardSpecs(flags.get('--shard-specs')),
    changed: changedSince(flags.get('--changed')),
  });
  if (!plan.ok) {
    console.error(`e2e-retry: not re-running - ${plan.reason}.`);
    process.exit(1);
  }
  for (const n of plan.dead) {
    console.error(`e2e-retry: shard ${n} uploaded no report, so its files never ran on this commit - they run once now, as their first verdict.`);
  }
  const filters = plan.specs.map(specFilterArg);
  const unreportedFilters = plan.unreported.map(specFilterArg);
  const out = process.env.GITHUB_OUTPUT;
  if (flags.has('--github-output') && out) {
    appendFileSync(
      out,
      `specs=${JSON.stringify(plan.specs)}\nfilters=${filters.join(' ')}\n` +
        `unreported=${JSON.stringify(plan.unreported)}\nunreported_filters=${unreportedFilters.join(' ')}\n`,
    );
  }
  process.stdout.write(`${JSON.stringify({ specs: plan.specs, filters, unreported: plan.unreported, unreportedFilters })}\n`);
}
