#!/usr/bin/env node
// cicd-followup cf13: judge one candidate's before and after sides with cf03's rule, spread and
// minimum sample sizes, unchanged (phase-cf03.md sections 4.2 and 5).
//
//   node docs/work-specs/cicd-followup/evidence/phase-cf13-sides.mjs --records <records.json> \
//     --group <none|cap|cap+cfg> --before-from <ISO> --land <ISO> [--after-until <ISO>]
//
// The records come from phase-cf03-collect.mjs and phase-cf03-baseline.mjs derive, run over the
// window with CF03_FROM and CF03_UNTIL. A merge sits on a side by `side_at`, the creation of its
// final head's PR run (cf03 section 4.2). `--before-from` is the `merged_at` of the last landing
// whose `ends` include the group (for the metric) before the candidate; `--land` is the
// candidate's `merged_at`; `--after-until` is the next such landing's `merged_at`, or the read
// time. Prints JSON: per metric, n, median and p95 on each side, whether n reaches cf03's minimum,
// and the verdicts cf03 section 5.1 defines.
import { readFileSync } from 'node:fs';

// Copied from phase-cf03-baseline.mjs, which runs its own command line when imported.
const groupOf = (r) => `${r.bucket}${r.configured_jobs > 0 ? '+cfg' : ''}`;
function quantile(values, q) { // nearest rank
  const s = values.filter((v) => v != null).sort((a, b) => a - b);
  if (!s.length) return null;
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
}

// phase-cf03.md section 5.1, unchanged. min: per side for the median, minP95: for the p95 (null: over 120).
export const CF03 = {
  none: { m1: { spread: 1.19, min: 8, minP95: 20 }, m2_wait: { spread: 0.06, min: 9, minP95: null }, m2_exec: { spread: 0.93, min: 9, minP95: 20 }, m3: { spread: 16.75, min: 12, minP95: null } },
  cap: { m1: { spread: 2.59, min: 8, minP95: 40 }, m2_wait: { spread: 0.1, min: 15, minP95: 40 }, m2_exec: { spread: 1.62, min: 8, minP95: 40 }, m3: { spread: 709.74, min: 9, minP95: null } },
  'cap+cfg': { m1: { spread: 1.04, min: 10, minP95: null }, m2_wait: { spread: 0.04, min: 9, minP95: 20 }, m2_exec: { spread: 0.62, min: 11, minP95: null }, m3: { spread: 290.26, min: 12, minP95: null } },
};

/** One-sided Fisher exact p: is the after side's share of flaky merges higher than the before side's? */
export function fisherGreater(afterHits, afterN, beforeHits, beforeN) {
  const hits = afterHits + beforeHits;
  const n = afterN + beforeN;
  const logC = (a, b) => lgamma(a + 1) - lgamma(b + 1) - lgamma(a - b + 1);
  const p = (k) => Math.exp(logC(afterN, k) + logC(beforeN, hits - k) - logC(n, hits));
  let total = 0;
  for (let k = afterHits; k <= Math.min(afterN, hits); k += 1) total += p(k);
  return Math.min(1, total);
}
function lgamma(x) { // Lanczos; exact enough for counts in the hundreds
  const g = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = 0.99999999999980993;
  const t = x + 7.5;
  for (let i = 0; i < 8; i += 1) a += g[i] / (x + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

export function judge(records, { group, beforeFrom, land, afterUntil }) {
  const values = CF03[group];
  if (!values) throw new Error(`cf03 has no spread for group ${group}`);
  const inGroup = records.filter((r) => groupOf(r) === group);
  const before = inGroup.filter((r) => r.side_at >= beforeFrom && r.side_at < land);
  const after = inGroup.filter((r) => r.side_at >= land && (!afterUntil || r.side_at < afterUntil));
  const out = { group, n: { before: before.length, after: after.length }, metrics: {} };
  for (const [metric, { spread, min, minP95 }] of Object.entries(values)) {
    const b = before.map((r) => r[metric]).filter((v) => v != null);
    const a = after.map((r) => r[metric]).filter((v) => v != null);
    const row = {
      spread, minPerSide: min, n: { before: b.length, after: a.length },
      median: { before: quantile(b, 0.5), after: quantile(a, 0.5) },
      p95: { before: quantile(b, 0.95), after: quantile(a, 0.95) },
      measured: b.length >= min && a.length >= min,
      p95Measured: minP95 != null && b.length >= minP95 && a.length >= minP95,
    };
    if (row.measured) {
      const lower = row.median.before - row.median.after;
      row.medianLowerBeyondSpread = lower > spread;
      row.medianHigherBeyondSpread = -lower > spread;
    }
    if (row.p95Measured) {
      const lower = row.p95.before - row.p95.after;
      row.p95LowerBeyondSpread = lower > spread;
      row.p95HigherBeyondSpread = -lower > spread;
    }
    out.metrics[metric] = row;
  }
  const flaky = (r) => (r.flakes ?? []).length + (r.hangs ?? []).length > 0;
  // M4 needs no group (cf03 section 5.2): every merge on each side, by the same times.
  const all = (from, to) => records.filter((r) => r.side_at >= from && (!to || r.side_at < to));
  const mb = all(beforeFrom, land);
  const ma = all(land, afterUntil);
  const bh = mb.filter(flaky).length;
  const ah = ma.filter(flaky).length;
  const p = fisherGreater(ah, ma.length, bh, mb.length);
  out.m4 = { before: `${bh} of ${mb.length}`, after: `${ah} of ${ma.length}`, p: Number(p.toFixed(4)), regressed: ma.length > 0 && mb.length > 0 && ah / ma.length > bh / mb.length && p < 0.05 };
  const m = out.metrics;
  out.improved = Boolean(m.m1.medianLowerBeyondSpread || m.m1.p95LowerBeyondSpread || m.m3.medianLowerBeyondSpread);
  out.regressed = Boolean(m.m2_wait.medianHigherBeyondSpread || m.m2_exec.medianHigherBeyondSpread || m.m2_wait.p95HigherBeyondSpread || m.m2_exec.p95HigherBeyondSpread || out.m4.regressed);
  // Unmeasured when M1 and M3 both miss the minimum on a side: no claim can be made either way.
  out.unmeasured = !m.m1.measured && !m.m3.measured;
  out.verdict = out.unmeasured ? 'unmeasured' : out.improved && !out.regressed ? 'improved' : 'not improved';
  return out;
}

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const records = JSON.parse(readFileSync(arg('--records'), 'utf8')).records;
  console.log(JSON.stringify(judge(records, { group: arg('--group'), beforeFrom: arg('--before-from'), land: arg('--land'), afterUntil: arg('--after-until') }), null, 2));
}
