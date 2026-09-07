#!/usr/bin/env node
// The E2E TIME BUDGET - the tripwire that makes suite growth visible while it happens.
//
//   node scripts/e2e-budget.mjs <merged-report.json> [--max-avg-ms N]
//
// It reads a Playwright JSON report (the nightly merges its eight shard blobs into one) and
// answers two DIFFERENT questions that a single "total time" number conflates:
//
//   ADDING TESTS is healthy. A pack that ships a spec is doing the right thing, and a budget
//   that fails on it teaches everyone to raise the budget - which is how a gate becomes a
//   formality. So the total is REPORTED, never enforced.
//
//   TESTS GETTING SLOWER is the regression. That shows up as the mean per-test duration
//   rising, independently of how many there are, and that is what this ENFORCES.
//
// Measured 2026-07-31 on the first green nightly: 615 tests, 41.4 min aggregate, 4.04 s mean.
// (591 tests / 45.5 min / 4.62 s the day before - more tests, less time, because the preview
// debounce dropped from 350 ms to 50 ms under test.) The ceiling below sits ~24% above the
// current mean: far enough that runner-to-runner variance cannot trip it, close enough that a
// real slowdown does.
//
// RAISING IT IS A DELIBERATE ACT. If this fails, the question is "what got slower", and the
// slowest-files table below is the first place to look. Bumping the number is the answer only
// when the work genuinely costs more per test and everyone agrees to pay it - say so in the
// commit.
//
// RE-CALIBRATED 2026-09-07, and the reason is worth reading before touching it again. The 5,000 ms
// ceiling was set when the mean was 4,040 ms, "~24% above the current mean: far enough that
// runner-to-runner variance cannot trip it". Neither half of that was still true. Ten consecutive
// nightlies measured 4.58, 4.75, 4.79, 4.80, 4.84, 4.90, 4.92, 4.96 and 5.22 s: a median of 4.80
// with a standard deviation of 0.11, so the old ceiling sat 0.8% above the highest ordinary night
// and WOULD have fired on noise within days. It is now set from that measured band rather than
// from a memory of one.
//
// THE DRIFT IS THE THING NOBODY WAS WATCHING, and it is why this file now prints it every night
// instead of only at the threshold. The mean rose 19% between the two baselines below while the
// suite grew 10%, so the tests really are getting slower per test - slowly, in a way a single
// pass/fail number at the top of the range could never report. A gate that speaks once a quarter
// teaches people to explain it away; one that prints the trend every night is arguing from the
// same evidence each time.
const DEFAULT_MAX_AVG_MS = 5500;

/**
 * Measured baselines, oldest first, for the drift line. Add one when the gate is re-calibrated;
 * never quietly replace the old one, because the distance between them IS the report.
 */
const BASELINES = [
  { on: '2026-07-31', avgMs: 4040, note: 'the first green nightly, 615 tests' },
  { on: '2026-09-07', avgMs: 4800, note: 'median of the nine nightlies before the ceiling was re-set' },
];

import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const reportPath = args.find((a) => !a.startsWith('--'));
const maxAvgArg = args.indexOf('--max-avg-ms');
const maxAvg = maxAvgArg >= 0 ? Number(args[maxAvgArg + 1]) : DEFAULT_MAX_AVG_MS;

if (!reportPath) {
  console.error('usage: node scripts/e2e-budget.mjs <merged-report.json> [--max-avg-ms N]');
  process.exit(2);
}

/** Every test's total duration, flattened out of Playwright's nested suites. A test that
 *  retried would sum its attempts; this suite runs with retries: 0, so it is one result. */
function collect(report) {
  const out = [];
  const walk = (suite, file) => {
    for (const spec of suite.specs ?? []) {
      const ms = (spec.tests ?? [])
        .flatMap((t) => t.results ?? [])
        .reduce((a, r) => a + (r.duration ?? 0), 0);
      out.push({ file: file ?? suite.file ?? '(unknown)', title: spec.title, ms });
    }
    for (const child of suite.suites ?? []) walk(child, file ?? suite.file);
  };
  for (const suite of report.suites ?? []) walk(suite, suite.file);
  return out;
}

const tests = collect(JSON.parse(readFileSync(reportPath, 'utf8')));
if (tests.length === 0) {
  console.error('e2e-budget: the report contains no tests - refusing to report a budget on nothing.');
  process.exit(2);
}

const totalMs = tests.reduce((a, t) => a + t.ms, 0);
const avgMs = totalMs / tests.length;

const byFile = new Map();
for (const t of tests) {
  const cur = byFile.get(t.file) ?? { n: 0, ms: 0 };
  cur.n += 1;
  cur.ms += t.ms;
  byFile.set(t.file, cur);
}
const slowest = [...byFile.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 10);

console.log('E2E time budget');
console.log(`  tests            ${tests.length}`);
console.log(`  aggregate        ${(totalMs / 60000).toFixed(1)} min   (reported, never enforced)`);
console.log(`  mean per test    ${(avgMs / 1000).toFixed(2)} s   (ceiling ${(maxAvg / 1000).toFixed(2)} s)`);
for (const base of BASELINES) {
  const pct = ((avgMs - base.avgMs) / base.avgMs) * 100;
  const dir = pct >= 0 ? 'above' : 'below';
  console.log(`  drift            ${Math.abs(pct).toFixed(0)}% ${dir} the ${(base.avgMs / 1000).toFixed(2)} s baseline of ${base.on} (${base.note})`);
}
console.log('  slowest spec files:');
for (const [file, v] of slowest) {
  console.log(
    `    ${(v.ms / 60000).toFixed(2).padStart(6)} min  ${String(v.n).padStart(4)} tests  ${(v.ms / v.n / 1000).toFixed(1).padStart(5)} s/test  ${file}`,
  );
}

if (avgMs > maxAvg) {
  console.error(
    `\n::error title=E2E budget::Mean per-test time is ${(avgMs / 1000).toFixed(2)} s, over the ${(maxAvg / 1000).toFixed(2)} s ceiling. ` +
      'Tests got SLOWER - this does not fire merely because the suite grew. Start with the slowest files above.',
  );
  process.exit(1);
}
console.log('\nWithin budget.');
