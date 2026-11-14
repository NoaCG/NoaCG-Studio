#!/usr/bin/env node
// node docs/work-specs/cicd-followup/evidence/dev-server-plan-replay.mjs <dir of <run id>/nightly-report.json> <da87aaaa8 e2e-durations.json>
// (gh run download <id> --name nightly-report-json for each run named below; the table from
// `git show da87aaaa8:scripts/e2e-durations.json`.)
// Replay: plan dev_server run 43587039825 as the workflow would, then weigh each planned shard
// by what that run (and the dev_server run before it) actually measured.
import fs from 'node:fs';
import { devServerWeights, planNightly } from '../../../../scripts/nightly-shards.mjs';
import { minutesByFile, predictShardMinutes, readTable, specFilesOnDisk } from '../../../../scripts/e2e-durations.mjs';
import { unfinishedByFile } from '../../../../scripts/nightly-triage.mjs';
const [dir, tablePath] = process.argv.slice(2);
const read = (id) => JSON.parse(fs.readFileSync(`${dir}/${id}/nightly-report.json`));
const window = ['43587029966', '43578476041', '43578470126', '43566704154', '43548883139'].map(read); // newest first
const table = readTable(tablePath);
const suite = specFilesOnDisk();
// Actual dev-server minutes: the slower of the two dev_server runs, and a file 43587039825 left
// unfinished takes the other run's finished minutes when larger.
const a = minutesByFile(read('43587039825')), b = minutesByFile(read('43578476041'));
const actual = Object.fromEntries(suite.map((f) => [f, Math.max(a[f] ?? 0, b[f] ?? 0)]));
const unseen = suite.filter((f) => !(f in a) && !(f in b));
for (const [name, plan] of [
  ['pinned table only (#2544)', planNightly({ suite, table })],
  ['devServerWeights (this PR)', planNightly({ suite, table: { ...table, minutes: devServerWeights(table.minutes, window) } })],
]) {
  const real = plan.shardSpecs.map((bin) => predictShardMinutes(bin.reduce((s, f) => s + (actual[f] ?? 0), 0), table));
  console.log(`${name}: ${plan.shardSpecs.length} shards, planned ${Math.min(...plan.predicted)}-${Math.max(...plan.predicted)} min,`,
    `actual ${Math.min(...real).toFixed(1)}-${Math.max(...real).toFixed(1)} min, over 20: ${real.filter((m) => m > 20).length}, over 17: ${real.filter((m) => m > 17).length}`);
}
console.log(`files neither dev run timed: ${unseen.length}`);
