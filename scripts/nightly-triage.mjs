#!/usr/bin/env node
// Classify a nightly Playwright JSON report into FOCUS vs PAUSED failures (docs/GOALS_ARCHIVE.md
// "Student release"; the focus list is scripts/e2e-lists.mjs, shared with e2e-affected.mjs so
// the two consumers cannot drift), and say whether the sweep FINISHED.
//
//   node scripts/nightly-triage.mjs nightly-report.json [--blobs <dir> --shards <n>] > nightly-triage.md
//
// Prints a markdown verdict body to stdout and writes nightly-triage.json (the failed-file
// sets plus a stable failure-set hash) beside the cwd. The nightly verdict job appends the
// markdown to the rolling issue and uses the hash to post only when the failure SET changed -
// paused-area drift is reported once per change of drift, never once per night. A night with
// any focus failure always posts.
//
// Mass-failure promotion: a paused-area failure count above MASS_THRESHOLD is promoted out of
// the collapsed details block - dozens of paused specs failing at once is a broken foundation
// (an e2e helper, the shell), never "drift", and must not be filed under a fold. The threshold
// is absolute rather than night-over-night because this script sees one night at a time.
//
// AN UNFINISHED SWEEP IS NOT A GREEN ONE. On 2026-09-30 one shard hit its job cap and was
// cancelled, a cancelled shard uploads no report, and this script read the other seven and printed
// "every spec file green" under a verdict of "Full E2E suite: cancelled" (issue #568). So it now
// names three things a failure list cannot show: a shard whose report never arrived (`--blobs`
// and `--shards`: the blobs are `report-<n>.zip`, named by nightly.yml), an error Playwright
// raised outside any test (its own global timeout, a web server that never started), and tests
// that were due to run and did not finish. All three go into the failure-set hash, so a night
// that stops short in a new place posts again and one that repeats the same gap does not.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { FOCUS } from './e2e-lists.mjs';

const MASS_THRESHOLD = 10;

/** Walk a merged report's suite tree, calling `visit(fileBasename, spec)` for every spec. */
function eachSpec(report, visit) {
  const walk = (suite, inherited) => {
    const file = suite.file ?? inherited;
    for (const spec of suite.specs ?? []) visit(path.basename(spec.file ?? file ?? 'unknown'), spec);
    for (const child of suite.suites ?? []) walk(child, file);
  };
  for (const suite of report.suites ?? []) walk(suite, suite.file);
}

/** Spec files with a spec whose verdict is not ok. */
export function failedFiles(report) {
  const failed = new Set();
  eachSpec(report, (file, spec) => {
    if (spec.ok === false) failed.add(file);
  });
  return failed;
}

/**
 * Tests that were due to run and did not finish, counted per spec file.
 *
 * Playwright reports both an interrupted test and one it never reached as `status: 'skipped'`
 * with `ok: true`, which is why a stopped run otherwise reads as green. What tells them from a
 * deliberate skip is `expectedStatus`: `test.skip`, `test.fixme` and a runtime `test.skip()` all
 * set it to 'skipped', and a test that was simply not reached keeps 'passed' (checked against
 * Playwright 1.61's own JSON on 2026-09-30).
 *
 * @returns {Map<string, number>}
 */
export function unfinishedByFile(report) {
  const counts = new Map();
  eachSpec(report, (file, spec) => {
    for (const test of spec.tests ?? []) {
      if (test.status === 'skipped' && test.expectedStatus !== 'skipped') counts.set(file, (counts.get(file) ?? 0) + 1);
    }
  });
  return counts;
}

/** Errors Playwright raised outside any test, without the terminal colour codes it writes them in. */
export function runErrors(report) {
  // eslint-disable-next-line no-control-regex
  return (report.errors ?? []).map((e) => String(e.message ?? e.value ?? e).replace(/\u001b\[[0-9;]*m/g, '').trim()).filter(Boolean);
}

/** Shard numbers in 1..shards with no `report-<n>.zip` among `blobNames`. */
export function missingShards(blobNames, shards) {
  const present = new Set(blobNames.map((f) => /^report-(\d+)\.zip$/.exec(f)?.[1]).filter(Boolean).map(Number));
  return Array.from({ length: shards }, (_, i) => i + 1).filter((n) => !present.has(n));
}

/**
 * The verdict body and the JSON beside it.
 *
 * @param {object} report merged Playwright JSON report
 * @param {{ missing?: number[], shards?: number }} [completeness]
 */
export function triage(report, { missing = [], shards = 0 } = {}) {
  const failed = failedFiles(report);
  const focusSet = new Set(FOCUS);
  const focusFailed = [...failed].filter((f) => focusSet.has(f)).sort();
  const pausedFailed = [...failed].filter((f) => !focusSet.has(f)).sort();
  const unfinished = [...unfinishedByFile(report)].sort(([a], [b]) => (a < b ? -1 : 1));
  const errors = runErrors(report);
  const incomplete = missing.length > 0 || errors.length > 0 || unfinished.length > 0;

  const setMembers = [
    ...[...failed].sort(),
    ...missing.map((n) => `missing shard ${n}`),
    ...unfinished.map(([file]) => `unfinished ${file}`),
  ];
  const hash = createHash('sha1').update(setMembers.join('\n')).digest('hex').slice(0, 12);

  const lines = [];
  if (incomplete) {
    lines.push('**The sweep did not finish, so anything below speaks only for the tests that ran.**');
    for (const n of missing) {
      lines.push(`- Shard ${n} of ${shards} sent no report: it was stopped before Playwright could write one (the job's time cap, or a runner fault). None of its spec files are in this triage.`);
    }
    for (const e of errors) lines.push(`- Playwright stopped outside any test: ${e.split('\n')[0]}`);
    if (unfinished.length > 0) {
      const total = unfinished.reduce((sum, [, n]) => sum + n, 0);
      lines.push(`- ${total} test(s) were due to run and did not finish, in: ${unfinished.map(([f, n]) => `${f} (${n})`).join(', ')}`);
    }
    lines.push('');
  }
  if (failed.size === 0) {
    lines.push(incomplete ? 'Nightly triage: no spec file failed among the tests that ran.' : 'Nightly triage: every spec file green.');
  } else {
    if (focusFailed.length > 0) {
      lines.push(`**Sprint-relevant failures (fix now) - ${focusFailed.length} spec file(s):**`);
      for (const f of focusFailed) lines.push(`- ${f}`);
      lines.push('');
    }
    if (pausedFailed.length > MASS_THRESHOLD) {
      lines.push(`**PAUSED-AREA MASS FAILURE - ${pausedFailed.length} spec files red at once.** That is a broken shared foundation, not sprint drift - investigate now:`);
      for (const f of pausedFailed) lines.push(`- ${f}`);
      lines.push('');
    } else if (pausedFailed.length > 0) {
      lines.push('<details>');
      lines.push(`<summary>Paused-area failures (${pausedFailed.length}) - areas paused during the student-release sprint, swept at sprint end</summary>`);
      lines.push('');
      for (const f of pausedFailed) lines.push(`- ${f}`);
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }
  }
  lines.push(`<!-- nightly-failure-set: ${hash} -->`);
  return {
    markdown: lines.join('\n'),
    json: { hash, focusFailed, pausedFailed, complete: !incomplete, missingShards: missing, unfinished: Object.fromEntries(unfinished) },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values, positionals } = parseArgs({
    options: { blobs: { type: 'string' }, shards: { type: 'string' } },
    allowPositionals: true,
  });
  const reportPath = positionals[0];
  if (!reportPath) {
    console.error('usage: node scripts/nightly-triage.mjs <playwright-json-report> [--blobs <dir> --shards <n>]');
    process.exit(2);
  }

  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch (err) {
    // A missing or unreadable report is itself a finding, not a crash: emit an honest body so
    // the verdict job still has something to file.
    console.log(`Nightly triage: could not read ${reportPath} (${err.message}) - per-spec classification unavailable.`);
    writeFileSync('nightly-triage.json', JSON.stringify({ hash: 'no-report', focusFailed: [], pausedFailed: [], complete: false }));
    process.exit(0);
  }

  const shards = Number(values.shards ?? 0);
  let missing = [];
  if (values.blobs && shards > 0) {
    let names = [];
    try {
      names = readdirSync(values.blobs);
    } catch {
      // No directory at all is every shard missing, which is what the list below then says.
    }
    missing = missingShards(names, shards);
  }

  const { markdown, json } = triage(report, { missing, shards });
  writeFileSync('nightly-triage.json', JSON.stringify(json, null, 2));
  console.log(markdown);
}
