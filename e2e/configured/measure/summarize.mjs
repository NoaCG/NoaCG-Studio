#!/usr/bin/env node
// Turn the measurement results (MEASURE_OUT, default /tmp/noacg-measure) (written by baseline.measure.ts) into the receipt's tables.
//   node e2e/configured/measure/summarize.mjs [dir] > tables.md
// Numbers are milliseconds unless a column says bytes; p50/p95 over the samples that completed,
// with the failures counted beside them.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? process.env.MEASURE_OUT ?? '/tmp/noacg-measure';
const files = readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('probe'));
const load = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const CASES = ['typical-fast', 'typical-slow', 'large-fast', 'large-slow'];
const caseName = { 'typical-fast': 'Typical, unthrottled', 'typical-slow': 'Typical, 20 Mbit/s 50 ms', 'large-fast': 'Large, unthrottled', 'large-slow': 'Large, 20 Mbit/s 50 ms' };
const get = (group, c) => (files.includes(`${group}-${c}.json`) ? load(`${group}-${c}.json`) : null);
const ms = (v) => (v === null || v === undefined || Number.isNaN(v) ? 'n/a' : v >= 100 ? String(Math.round(v)) : v.toFixed(1));
const kb = (v) => (v === null || v === undefined ? 'n/a' : v >= 1_048_576 ? `${(v / 1_048_576).toFixed(2)} MB` : `${(v / 1024).toFixed(1)} kB`);
const s = (x) => (x ? `${ms(x.p50)} / ${ms(x.p95)}` : 'n/a');
const n = (x) => (x ? `${x.n}${x.failures ? ` (${x.failures} failed)` : ''}` : 'n/a');
const out = [];
const p = (line = '') => out.push(line);

// Merge the bytes parts of one case.
function bytesOf(c) {
  const parts = files.filter((f) => f.startsWith(`bytes-${c}-part`)).map(load);
  if (!parts.length) return null;
  const rows = parts.flatMap((x) => x.rows);
  return { rows, fixtureFacts: parts[0].fixtureFacts };
}
const pct = (values, q) => {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[Math.min(v.length - 1, Math.max(0, Math.ceil((q / 100) * v.length) - 1))] : null;
};
const sum = (values) => ({ n: values.filter(Number.isFinite).length, failures: 0, p50: pct(values, 50), p95: pct(values, 95) });

p('### Fixtures as built');
p();
p('| Case | Graphics | Image files | Stored output (published JSON) | Fixture publish |');
p('|---|---|---|---|---|');
for (const c of CASES) {
  const any = ['takes-a', 'takes-b', 'takes-c', 'render', 'publish', 'boot'].map((g) => get(g, c)).find(Boolean);
  const f = any?.fixtureFacts;
  if (f) p(`| ${caseName[c]} | ${f.graphics} | ${kb(f.imageFileBytes)} | ${kb(f.storedOutputBytes)} | ${ms(f.build.publishMs)} |`);
}
p();

p('### Take paths: press to sent (p50 / p95, ms)');
p();
p('"Own" is press to sent minus the time a kept ordering wait overlapped it (W1: road discovery, one send in flight per graphic, a folder\'s earlier sends). "Kept" counts the samples in which a kept wait added time.');
p();
p('| Path | Case | n | Own | Total | Kept adds time |');
p('|---|---|---|---|---|---|');
const PATHS = [
  ['takes-a', 'graphic', 'Graphic cue Take'],
  ['takes-a', 'folder', 'Folder Take (2 cues, together)'],
  ['takes-a', 'picture', 'Picture cue Take'],
  ['takes-a', 'server', 'Server cue Take (fake Bridge `/act`)'],
  ['takes-b', 'quick', 'Quick button (Goal)'],
  ['takes-b', 'quickSecondOfTwo', 'Quick button, second of two fast'],
  ['takes-b', 'plusOne', '+1'],
  ['takes-b', 'plusOneSecondOfTwo', '+1, second of two fast'],
  ['takes-c', 'next', 'Next'],
  ['takes-c', 'panel', 'Hardware panel Take (scripted)'],
];
for (const [group, path, label] of PATHS) {
  for (const c of CASES) {
    const r = get(group, c)?.paths?.[path];
    if (!r) continue;
    const k = r.keptAdds;
    const kept = [k.inflight && `in flight ${k.inflight}`, k.road && `road ${k.road}`, k.ordered && `ordered ${k.ordered}`].filter(Boolean).join(', ') || '0';
    p(`| ${label} | ${caseName[c]} | ${n(r.total)} | ${s(r.own)} | ${s(r.total)} | ${kept}${k.anyMs?.n ? ` (${s(k.anyMs)})` : ''} |`);
  }
}
p();
p('Other requests seen inside press..sent, per path: ' + PATHS.map(([g, path, label]) => {
  const seen = new Set(CASES.flatMap((c) => get(g, c)?.paths?.[path]?.otherRequests ?? []));
  seen.delete('frame-stamped');
  return seen.size ? `${label}: ${[...seen].join(', ')}` : null;
}).filter(Boolean).join('; ') + '.');
p();

p('### Sent to render dispatch to first seen (p50 / p95, ms)');
p();
p('| Case | n | Sent to play() | Sent to render dispatch | Sent to first seen | Capture gap after the first seen frame |');
p('|---|---|---|---|---|---|');
for (const c of CASES) {
  const r = get('render', c);
  if (r) p(`| ${caseName[c]} | ${n(r.sentToSeen)} | ${s(r.sentToPlay)} | ${s(r.sentToDispatch)} | ${s(r.sentToSeen)} | ${s(r.captureGap)} |`);
}
p();

p('### Press to sent during a publish (graphic cue Take, p50 / p95, ms)');
p();
p('| Case | n | Total during a publish | Total, no publish (graphic cue Take above) | Publish duration | Publishes run |');
p('|---|---|---|---|---|---|');
for (const c of CASES) {
  const r = get('publish', c);
  const base = get('takes-a', c)?.paths?.graphic;
  if (r) p(`| ${caseName[c]} | ${n(r.paths.duringPublish.total)} | ${s(r.paths.duringPublish.total)} | ${s(base?.total)} | ${s(r.publishes.ms)} | ${r.publishes.n} |`);
}
p();

p('### Bytes and time per change (both pages and the output, edit until the output holds it and the page is quiet 4 s)');
p();
p('| Change | Case | n | Total bytes p50 | Page up | Page down | Output down | Publish press to output prepared (p50 / p95) | New frame load (p50 / p95) |');
p('|---|---|---|---|---|---|---|---|---|');
const KINDS = [['cue-edit', 'Cue text edit (no publish today)'], ['graphic-add', 'Graphic added'], ['graphic-remove', 'Graphic removed'], ['design-update', 'Design updated']];
const updateTimes = {};
for (const [kind, label] of KINDS) {
  for (const c of CASES) {
    const b = bytesOf(c);
    if (!b) continue;
    const rows = b.rows.filter((r) => r.kind === kind);
    if (!rows.length) continue;
    const tot = rows.map((r) => r.op.up + r.op.down + r.output.up + r.output.down);
    const prep = rows.map((r) => r.pressToOutputPrepared);
    const failed = rows.filter((r) => r.failed).length;
    if (kind !== 'cue-edit') (updateTimes[c] ??= []).push(...prep);
    const loads = rows.flatMap((r) => r.newFrameLoads ?? []);
    p(`| ${label} | ${caseName[c]} | ${rows.length}${failed ? ` (${failed} failed)` : ''} | ${kb(pct(tot, 50))} | ${kb(pct(rows.map((r) => r.op.up), 50))} | ${kb(pct(rows.map((r) => r.op.down), 50))} | ${kb(pct(rows.map((r) => r.output.down), 50))} | ${kind === 'cue-edit' ? 'none' : s(sum(prep))} | ${loads.length ? s(sum(loads)) : 'none'} |`);
  }
}
p();
p('Output update time over every publishing change (add, remove, design update together):');
p();
p('| Case | n | Publish press to output prepared (p50 / p95) |');
p('|---|---|---|');
for (const c of CASES) if (updateTimes[c]) p(`| ${caseName[c]} | ${sum(updateTimes[c]).n} | ${s(sum(updateTimes[c]))} |`);
p();
p('Where the bytes go (p50 per request family, the first case that has rows):');
p();
for (const c of CASES) {
  const b = bytesOf(c);
  if (!b) continue;
  p(`${caseName[c]}:`);
  p();
  p('| Change | Biggest page families (up+down) | Output families (down) |');
  p('|---|---|---|');
  for (const [kind, label] of KINDS) {
    const rows = b.rows.filter((r) => r.kind === kind);
    if (!rows.length) continue;
    const fam = (side) => {
      const names = new Set(rows.flatMap((r) => Object.keys(r[side].byName)));
      return [...names].map((k) => [k, pct(rows.map((r) => (r[side].byName[k]?.up ?? 0) + (r[side].byName[k]?.down ?? 0)), 50)])
        .filter(([, v]) => v > 4096).sort((a, b2) => b2[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${kb(v)}`).join(', ') || 'under 4 kB each';
    };
    p(`| ${label} | ${fam('op')} | ${fam('output')} |`);
  }
  p();
}

p('### Output start from a cold cache (p50 / p95, ms)');
p();
p('| Case | n | Navigation to first graphic loaded | Navigation to ready (every graphic checked) | Single graphic load (frame inserted to loaded) | Production data down | Everything down and up |');
p('|---|---|---|---|---|---|---|');
for (const c of CASES) {
  const r = get('boot', c);
  if (r) p(`| ${caseName[c]} | ${n(r.navigationToReady)} | ${s(r.navigationToFirstGraphicLoaded)} | ${s(r.navigationToReady)} | ${s(r.singleGraphicLoad)} | ${kb(r.bytesProductionData.p50)} | ${kb(r.bytesAll.p50)} |`);
}
p();
console.log(out.join('\n'));
