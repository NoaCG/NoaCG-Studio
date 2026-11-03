#!/usr/bin/env node
// cicd-followup cf12: what the critical-journey rule would have added to the merges cf03 measured.
//
//   node docs/work-specs/cicd-followup/evidence/phase-cf12-replay.mjs [--shard-fixed <min>] [--report-job <min>]
//
// For every merge in cf03's records (phase-cf03-records.json), it replays today's planner
// (`planFor`, today's headers and maps) on the files that merge changed (its first parent to the
// merge commit), once with the critical journeys and once without, and prices the difference in
// runner-minutes per CI run:
//
//   added test-minutes x the table's testFactor
//   + extra shards x the fixed cost of one shard job (--shard-fixed, default 1.5)
//   + the Combined E2E report job when the plan had no shard before (--report-job, default 0.5)
//
// A merge's CI runs that plan are its PR heads (`heads`, an upper bound: a superseded run is
// cancelled part way) plus its merge-group runs (`queue_entries`). The main push runs the full
// suite and adds nothing. It is an estimate from history, made before the rule landed; the
// measurement on real product changes after enabling is phase-cf12-measure.mjs. Needs the merge
// commits in the local clone (git fetch --shallow-since=2026-10-20 origin main). Reads no API.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { minutesFor, planFor, shardsFor, splitQuarantined } from '../../../../scripts/e2e-affected.mjs';
import { readTable, specFilesOnDisk } from '../../../../scripts/e2e-durations.mjs';
import { quarantinedSpecs, readStore } from '../../../../scripts/e2e-quarantine.mjs';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? Number(process.argv[i + 1]) : dflt;
};
const SHARD_FIXED = arg('--shard-fixed', 1.5);
const REPORT_JOB = arg('--report-job', 0.5);

const table = readTable();
const onDisk = specFilesOnDisk();
const quarantine = quarantinedSpecs(readStore());
const { records } = JSON.parse(readFileSync(new URL('./phase-cf03-records.json', import.meta.url), 'utf8'));
const minutes = (specs) => minutesFor(specs, table); // an unmeasured spec at the median, as the planner prices it

const shardCount = (plan, changed) => {
  if (plan.mode === 'none') return 0;
  if (plan.mode === 'full') return null;
  const { blocking } = splitQuarantined(plan.specs, quarantine, { changed });
  return blocking.length ? shardsFor({ mode: 'subset', specs: blocking }, table, blocking) : 0;
};

// The two journeys cf12 promoted are `// focus` too, so a shared-change plan runs them because of
// cf12 even though the rule itself adds nothing there. Priced here so the estimate holds them.
const PROMOTED = ['ograf-lifecycle.spec.ts', 'output-font-hold.spec.ts'];

const out = [];
for (const r of records) {
  let changed;
  try {
    changed = execFileSync('git', ['diff', '--name-only', `${r.merge_sha}^1`, r.merge_sha], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    out.push({ number: r.number, side: r.side, missing: true });
    continue;
  }
  const opts = { sprintFocus: true, specsOnDisk: onDisk };
  const withRule = planFor(changed, opts);
  const without = planFor(changed, { ...opts, critical: [] });
  const { blocking } = splitQuarantined(withRule.critical.added, quarantine, { changed });
  const before = shardCount(without, changed);
  const after = shardCount(withRule, changed);
  const promoted = withRule.focusApplied ? splitQuarantined(PROMOTED.filter((s) => withRule.specs.includes(s)), quarantine, { changed }).blocking : [];
  const perRun = before === null ? 0
    : (minutes(blocking) + minutes(promoted)) * table.overhead.testFactor + (after - before) * SHARD_FIXED + (before === 0 && after > 0 ? REPORT_JOB : 0);
  const runs = (r.heads ?? 1) + (r.queue_entries ?? 1);
  out.push({ number: r.number, side: r.side, product: withRule.critical.product, mode: without.mode, added: blocking.length, addedTest: Number(minutes(blocking).toFixed(2)), before, after, perRun: Number(perRun.toFixed(2)), runs, perMerge: Number((perRun * runs).toFixed(2)) });
}

const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : null;
};
const summary = (rows) => {
  const per = rows.map((r) => r.perMerge);
  const run = rows.map((r) => r.perRun);
  return {
    n: rows.length,
    perMerge: { median: pct(per, 0.5), p95: pct(per, 0.95), mean: Number((per.reduce((a, b) => a + b, 0) / (per.length || 1)).toFixed(2)), max: Math.max(...per) },
    perRun: { median: pct(run, 0.5), mean: Number((run.reduce((a, b) => a + b, 0) / (run.length || 1)).toFixed(2)), max: Math.max(...run) },
    addedSomething: rows.filter((r) => r.added > 0).length,
  };
};
const product = out.filter((r) => !r.missing && r.product);
console.log(JSON.stringify({
  parameters: { shardFixed: SHARD_FIXED, reportJob: REPORT_JOB, testFactor: table.overhead.testFactor },
  merges: out.length,
  missing: out.filter((r) => r.missing).length,
  product: summary(product),
  productBySide: Object.fromEntries(['B', 'D', 'A', 'A2'].map((s) => [s, summary(product.filter((r) => r.side === s))])),
  rows: out,
}, null, 1));
