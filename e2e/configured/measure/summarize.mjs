#!/usr/bin/env node
// Turn the measurement results (MEASURE_OUT, default /tmp/noacg-measure) into the receipt's tables.
//   node e2e/configured/measure/summarize.mjs [dir] > tables.md
// A group's samples may come from several jobs (`-part<k>` files); they are merged from the raw
// samples before any statistic is taken. Milliseconds unless a column says bytes; p50 / p95 over
// the samples that completed, failures counted beside them.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? process.env.MEASURE_OUT ?? '/tmp/noacg-measure';
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
const load = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const CASES = ['typical-fast', 'typical-slow', 'large-fast', 'large-slow'];
const caseName = { 'typical-fast': 'Typical, unthrottled', 'typical-slow': 'Typical, throttled', 'large-fast': 'Large, unthrottled', 'large-slow': 'Large, throttled' };
/** Every part file of one group and case. */
const parts = (group, c) => files.filter((f) => f.startsWith(`${group}-${c}-part`)).map(load);

const pct = (values, q) => {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[Math.min(v.length - 1, Math.max(0, Math.ceil((q / 100) * v.length) - 1))] : null;
};
const stat = (values, failures = 0) => ({ n: values.filter(Number.isFinite).length, failures, p50: pct(values, 50), p95: pct(values, 95) });
const ms = (v) => (v === null || v === undefined || Number.isNaN(v) ? 'n/a' : v >= 100 ? String(Math.round(v)) : v.toFixed(1));
const size = (v) => (v === null || v === undefined ? 'n/a' : v >= 1_048_576 ? `${(v / 1_048_576).toFixed(2)} MB` : `${(v / 1024).toFixed(1)} kB`);
const s = (x) => (x && x.n ? `${ms(x.p50)} / ${ms(x.p95)}` : 'n/a');
const n = (x) => (x ? `${x.n}${x.failures ? ` (${x.failures} failed)` : ''}` : 'n/a');
const out = [];
const p = (line = '') => out.push(line);

/** The samples of one takes path in one case, over every part. */
function takeSamples(group, path, c) {
  const all = parts(group, c).flatMap((f) => f.paths?.[path]?.samples ?? []);
  if (!all.length) return null;
  const ok = all.filter((x) => !('failed' in x));
  const failed = all.length - ok.length;
  return {
    total: stat(ok.map((x) => x.total), failed),
    own: stat(ok.map((x) => x.own), failed),
    kept: {
      inflight: ok.filter((x) => x.kept.inflight).length,
      road: ok.filter((x) => x.kept.road).length,
      ordered: ok.filter((x) => x.kept.ordered).length,
      ms: stat(ok.filter((x) => x.keptMs > 0).map((x) => x.keptMs)),
    },
    others: [...new Set(ok.flatMap((x) => x.others))].filter((o) => o !== 'frame-stamped'),
    failures: all.filter((x) => 'failed' in x).map((x) => x.failed),
  };
}

p('### Fixtures as built');
p();
p('| Case | Graphics | Image files | Stored output (published JSON text) | First publish of the fixture |');
p('|---|---|---|---|---|');
for (const c of CASES) {
  const facts = files.filter((f) => f.includes(`-${c}-part`)).map(load).map((x) => x.fixtureFacts).filter(Boolean);
  if (!facts.length) continue;
  const f = facts[0];
  p(`| ${caseName[c]} | ${f.graphics} | ${size(f.imageFileBytes)} | ${size(f.storedOutputBytes)} | ${s(stat(facts.map((x) => x.build.publishMs)))} (n ${facts.length}) |`);
}
p();

p('### Take paths: press to sent (p50 / p95, ms)');
p();
p('| Path | Case | n | Page\'s own | Total | Samples a kept wait added time to |');
p('|---|---|---|---|---|---|');
const PATHS = [
  ['takes-a', 'graphic', 'Graphic cue Take'],
  ['takes-a', 'picture', 'Picture cue Take'],
  ['takes-a', 'folder', 'Folder Take (two cues, together)'],
  ['takes-a', 'server', 'Server cue Take (fake Bridge)'],
  ['takes-b', 'quick', 'Quick button (Goal)'],
  ['takes-b', 'quickSecondOfTwo', 'Quick button, second of two fast'],
  ['takes-b', 'plusOne', '+1'],
  ['takes-b', 'plusOneSecondOfTwo', '+1, second of two fast'],
  ['takes-c', 'next', 'Next'],
  ['takes-c', 'panel', 'Hardware panel Take (scripted)'],
];
const failures = [];
for (const [group, path, label] of PATHS) {
  for (const c of CASES) {
    const r = takeSamples(group, path, c);
    if (!r) continue;
    const k = r.kept;
    const kept = [k.inflight && `send in flight ${k.inflight}`, k.road && `road ${k.road}`, k.ordered && `earlier send ${k.ordered}`].filter(Boolean).join(', ') || 'none';
    p(`| ${label} | ${caseName[c]} | ${n(r.total)} | ${s(r.own)} | ${s(r.total)} | ${kept}${k.ms.n ? ` (adds ${s(k.ms)})` : ''} |`);
    if (r.failures.length) failures.push(`${label}, ${caseName[c]}: ${[...new Set(r.failures)].join('; ')}`);
  }
}
p();
const others = PATHS.map(([g, path, label]) => {
  const seen = new Set(CASES.flatMap((c) => takeSamples(g, path, c)?.others ?? []));
  return seen.size ? `${label}: ${[...seen].join(', ')}` : null;
}).filter(Boolean);
p(`Other requests running inside press..sent: ${others.length ? others.join('; ') : 'none'}.`);
p();

p('### Sent to render dispatch to first seen (p50 / p95, ms)');
p();
p('| Case | n | Sent to play() | Sent to render dispatch | Sent to first seen | Capture gap after the first seen frame |');
p('|---|---|---|---|---|---|');
for (const c of CASES) {
  const ps = parts('render', c);
  if (!ps.length) continue;
  const rows = ps.flatMap((x) => x.rows ?? []);
  const failed = ps.reduce((a, x) => a + (x.failureCount ?? 0), 0);
  p(`| ${caseName[c]} | ${n(stat(rows.map((r) => r.sentToSeen), failed))} | ${s(stat(rows.map((r) => r.sentToPlay)))} | ${s(stat(rows.map((r) => r.sentToDispatch)))} | ${s(stat(rows.map((r) => r.sentToSeen)))} | ${s(stat(rows.map((r) => r.gapAfter)))} |`);
  for (const x of ps) if (x.failures?.length) failures.push(`render, ${caseName[c]}: ${x.failures.join('; ')}`);
}
p();

p('### Press to sent during a publish (graphic cue Take, p50 / p95, ms)');
p();
p('| Case | n | Total, during a publish | Total, no publish (from the table above) | Publish duration | Publishes |');
p('|---|---|---|---|---|---|');
for (const c of CASES) {
  const ps = parts('publish', c);
  if (!ps.length) continue;
  const all = ps.flatMap((x) => x.paths.duringPublish.samples);
  const ok = all.filter((x) => !('failed' in x));
  const durations = ps.flatMap((x) => x.publishes.durations ?? []);
  const base = takeSamples('takes-a', 'graphic', c);
  const pubErrors = ps.reduce((a, x) => a + (x.publishes.errorCount ?? x.publishes.errors?.length ?? 0), 0);
  if (pubErrors) failures.push(`publish loop, ${caseName[c]}: ${pubErrors} publishes failed (${[...new Set(ps.flatMap((x) => x.publishes.errors ?? []))].join('; ')})`);
  const failedPresses = all.filter((x) => 'failed' in x).map((x) => x.failed);
  if (failedPresses.length) failures.push(`press during a publish, ${caseName[c]}: ${[...new Set(failedPresses)].join('; ')}`);
  p(`| ${caseName[c]} | ${n(stat(ok.map((x) => x.total), all.length - ok.length))} | ${s(stat(ok.map((x) => x.total)))} | ${s(base?.total)} | ${s(stat(durations))} | ${durations.length} |`);
}
p();

p('### Bytes and time per change');
p();
p('Bytes: every request and response of the production page and the output, from the edit until the output reports the new version prepared and the page has started nothing for 4 s. Time: Publish changes pressed to the output holding the new version, every graphic checked.');
p();
p('| Change | Case | n | Total bytes (p50) | Page up | Page down | Output down | Press to output prepared | New frame load |');
p('|---|---|---|---|---|---|---|---|---|');
const KINDS = [['cue-edit', 'Cue text edit (no publish today)'], ['graphic-add', 'Graphic added'], ['graphic-remove', 'Graphic removed'], ['design-update', 'Design updated']];
const bytesRows = (c) => parts('bytes', c).flatMap((x) => x.rows);
const updateTimes = {};
for (const [kind, label] of KINDS) {
  for (const c of CASES) {
    const rows = bytesRows(c).filter((r) => r.kind === kind);
    if (!rows.length) continue;
    const tot = rows.map((r) => r.op.up + r.op.down + r.output.up + r.output.down);
    const failed = rows.filter((r) => r.failed).length;
    if (failed) failures.push(`${label}, ${caseName[c]}: ${failed} of ${rows.length} never reached the output`);
    const prep = rows.filter((r) => !r.failed).map((r) => r.pressToOutputPrepared);
    if (kind !== 'cue-edit') (updateTimes[c] ??= { v: [], f: 0 }).v.push(...prep), (updateTimes[c].f += failed);
    const loads = rows.flatMap((r) => r.newFrameLoads ?? []);
    p(`| ${label} | ${caseName[c]} | ${rows.length}${failed ? ` (${failed} failed)` : ''} | ${size(pct(tot, 50))} | ${size(pct(rows.map((r) => r.op.up), 50))} | ${size(pct(rows.map((r) => r.op.down), 50))} | ${size(pct(rows.map((r) => r.output.down), 50))} | ${kind === 'cue-edit' ? 'no publish' : s(stat(prep))} | ${loads.length ? s(stat(loads)) : 'none'} |`);
  }
}
p();
p('Output update time over every publishing change (added, removed and updated together):');
p();
p('| Case | n | Press to output prepared (p50 / p95, ms) |');
p('|---|---|---|');
for (const c of CASES) if (updateTimes[c]) p(`| ${caseName[c]} | ${n(stat(updateTimes[c].v, updateTimes[c].f))} | ${s(stat(updateTimes[c].v))} |`);
p();
p('Where the bytes go (p50 per request family over 4 kB):');
p();
p('| Change | Case | Production page | Output |');
p('|---|---|---|---|');
for (const [kind, label] of KINDS) {
  for (const c of CASES) {
    const rows = bytesRows(c).filter((r) => r.kind === kind);
    if (!rows.length) continue;
    const fam = (side) => {
      const names = new Set(rows.flatMap((r) => Object.keys(r[side].byName)));
      return [...names].map((k) => [k, pct(rows.map((r) => (r[side].byName[k]?.up ?? 0) + (r[side].byName[k]?.down ?? 0)), 50)])
        .filter(([, v]) => v > 4096).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${size(v)}`).join(', ') || 'none over 4 kB';
    };
    p(`| ${label} | ${caseName[c]} | ${fam('op')} | ${fam('output')} |`);
  }
}
p();

p('### Output start from a cold cache (p50 / p95, ms)');
p();
p('| Case | n | Navigation to first graphic loaded | Navigation to ready (every graphic checked) | One graphic\'s load (frame inserted to loaded) | Production data down | All bytes (dev-server app code included) |');
p('|---|---|---|---|---|---|---|');
for (const c of CASES) {
  const ps = parts('boot', c);
  if (!ps.length) continue;
  const rows = ps.flatMap((x) => x.rows ?? []);
  const failed = ps.reduce((a, x) => a + (x.failureCount ?? 0), 0);
  p(`| ${caseName[c]} | ${n(stat(rows.map((r) => r.ready), failed))} | ${s(stat(rows.map((r) => r.firstLoaded)))} | ${s(stat(rows.map((r) => r.ready)))} | ${s(stat(rows.flatMap((r) => r.frameLoad)))} | ${size(pct(rows.map((r) => r.dataBytes), 50))} | ${size(pct(rows.map((r) => r.bytes), 50))} |`);
  for (const x of ps) if (x.failures?.length) failures.push(`boot, ${caseName[c]}: ${x.failures.join('; ')}`);
}
p();
p('### Failures');
p();
p(failures.length ? failures.map((f) => `- ${f}`).join('\n') : 'None.');
console.log(out.join('\n'));
