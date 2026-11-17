// Pool the AC-6 timing runs (five.measure.ts `pair`): press to ran with everyone working against
// the taker's page alone. Every result file of one page count is read, its rounds become pairs
// (one run each way, run back to back), and the judged number is the pooled p95 difference
// (everyone minus alone) over every sample, with a bootstrap over pairs for its 90% range.
//
//   node e2e/configured/measure/summarize-five.mjs [--pages 5] [--net fast] [--build prod|dev] [--dir $MEASURE_OUT]
//
// --build matches the runs' MEASURE_BUILD (default prod here: AC-6 is judged on the bundled build).
//
// The rule (fixed before the runs, coordinator on #2361): within 50 ms, no Take lost.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const dir = arg('dir', process.env.MEASURE_OUT ?? '/tmp/noacg-measure');
const pages = Number(arg('pages', '5'));
const net = arg('net', 'fast');
const build = arg('build', 'prod');

export function pct(values, p) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.min(v.length - 1, Math.max(0, Math.ceil((p / 100) * v.length) - 1))];
}

/** Seeded, so a rerun prints the same range. */
function rng(seed = 0x5eed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export function pooled(pairs) {
  const all = pairs.flatMap((p) => p.all), alone = pairs.flatMap((p) => p.alone);
  const a = pct(all, 95), b = pct(alone, 95);
  return { all: a, alone: b, diff: a === null || b === null ? null : a - b, n: { all: all.length, alone: alone.length } };
}

export function bootstrap(pairs, rounds = 2000) {
  const r = rng();
  const diffs = [];
  for (let i = 0; i < rounds; i++) {
    const pick = Array.from({ length: pairs.length }, () => pairs[Math.floor(r() * pairs.length)]);
    const d = pooled(pick).diff;
    if (d !== null) diffs.push(d);
  }
  return { p5: pct(diffs, 5), p95: pct(diffs, 95) };
}

if (process.argv[1] && process.argv[1].endsWith('summarize-five.mjs')) {
  // The same file name five.measure.ts writes (its TAG).
  const tag = `five-pair-${pages}-${net}` + (build === 'prod' ? '-prod' : '');
  const files = readdirSync(dir).filter((f) => f.startsWith(`${tag}-part`) && f.endsWith('.json'));
  const pairs = [];
  let lost = 0;
  const errors = [];
  for (const f of files.sort()) {
    const data = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const byRound = new Map();
    for (const run of data.rounds) {
      lost += run.lost;
      errors.push(...run.errors);
      if (!byRound.has(run.round)) byRound.set(run.round, {});
      byRound.get(run.round)[run.mode] = run.samples;
    }
    for (const [round, p] of byRound) if (p.all && p.alone) pairs.push({ file: f, round, all: p.all, alone: p.alone });
  }
  if (!pairs.length) {
    console.error(`no ${tag} results in ${dir} (pass --build dev for development-server runs)`);
    process.exit(1);
  }
  const p = pooled(pairs);
  const range = bootstrap(pairs);
  const verdict = lost === 0 && errors.length === 0 && p.diff !== null && p.diff <= 50 ? 'PASS' : 'FAIL';
  console.log(JSON.stringify({ pages, net, files: files.length, pairs: pairs.length, samples: p.n, p95: { everyone: p.all, alone: p.alone }, p50: { everyone: pct(pairs.flatMap((x) => x.all), 50), alone: pct(pairs.flatMap((x) => x.alone), 50) }, diff: p.diff, range90: range, lost, errors: errors.slice(0, 5), perPair: pairs.map((x) => ({ file: x.file, round: x.round, everyone: pct(x.all, 95), alone: pct(x.alone, 95) })), verdict }, null, 2));
}
