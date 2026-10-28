#!/usr/bin/env node
// DIAGNOSTIC ONLY (#1798), never landed: the three-snapshot technique over heap snapshots.
// Objects allocated between snapshot A and B (ids in B, not in A) that are still alive in C,
// grouped by type and name, with sample retainer chains from C.
//   node scripts/diag-heap-diff.mjs a.heapsnapshot b.heapsnapshot c.heapsnapshot
import { readFileSync } from 'node:fs';

const load = (file) => {
  const s = JSON.parse(readFileSync(file, 'utf8'));
  const m = s.snapshot.meta;
  const nf = m.node_fields.length;
  const ef = m.edge_fields.length;
  const types = m.node_types[0];
  const etypes = m.edge_types[0];
  const iType = m.node_fields.indexOf('type');
  const iName = m.node_fields.indexOf('name');
  const iId = m.node_fields.indexOf('id');
  const iSize = m.node_fields.indexOf('self_size');
  const iEc = m.node_fields.indexOf('edge_count');
  const eType = m.edge_fields.indexOf('type');
  const eName = m.edge_fields.indexOf('name_or_index');
  const eTo = m.edge_fields.indexOf('to_node');
  const n = s.nodes.length / nf;
  const node = (i) => ({ type: types[s.nodes[i * nf + iType]], name: s.strings[s.nodes[i * nf + iName]], id: s.nodes[i * nf + iId], size: s.nodes[i * nf + iSize] });
  return { s, nf, ef, n, node, iId, iSize, iEc, eType, eName, eTo, etypes };
};

const ids = (h) => {
  const out = new Set();
  for (let i = 0; i < h.n; i++) out.add(h.s.nodes[i * h.nf + h.iId]);
  return out;
};

const [fa, fb, fc] = process.argv.slice(2);
const A = load(fa);
const idsA = ids(A);
const B = load(fb);
const idsB = ids(B);
const C = load(fc);
const total = (h) => {
  let t = 0;
  for (let i = 0; i < h.n; i++) t += h.s.nodes[i * h.nf + h.iSize];
  return t;
};
console.log(`total self size: A ${total(A)} B ${total(B)} C ${total(C)}; nodes A ${A.n} B ${B.n} C ${C.n}`);

// Reverse edges for C.
const firstEdge = new Uint32Array(C.n + 1);
for (let i = 0, e = 0; i < C.n; i++) {
  firstEdge[i] = e;
  e += C.s.nodes[i * C.nf + C.iEc];
  firstEdge[i + 1] = e;
}
const retainers = Array.from({ length: C.n }, () => []);
for (let i = 0; i < C.n; i++) {
  for (let e = firstEdge[i]; e < firstEdge[i + 1]; e++) {
    const base = e * C.ef;
    const type = C.etypes[C.s.edges[base + C.eType]];
    if (type === 'weak') continue;
    const to = C.s.edges[base + C.eTo] / C.nf;
    const nameOrIndex = C.s.edges[base + C.eName];
    const label = type === 'element' || type === 'hidden' ? `[${nameOrIndex}]` : C.s.strings[nameOrIndex];
    retainers[to].push({ from: i, label, type });
  }
}

const groups = new Map();
for (let i = 0; i < C.n; i++) {
  const id = C.s.nodes[i * C.nf + C.iId];
  if (idsA.has(id) || !idsB.has(id)) continue;
  const nd = C.node(i);
  const key = `${nd.type} ${nd.name.slice(0, 80)}`;
  const g = groups.get(key) ?? { count: 0, size: 0, samples: [] };
  g.count++;
  g.size += nd.size;
  if (g.samples.length < 3) g.samples.push(i);
  groups.set(key, g);
}
const ranked = [...groups].sort((x, y) => y[1].size - x[1].size);
let sum = 0;
for (const [, g] of ranked) sum += g.size;
console.log(`survivors allocated between A and B, alive in C: ${ranked.reduce((a, [, g]) => a + g.count, 0)} objects, ${sum} bytes`);
const chain = (i) => {
  const out = [];
  const seen = new Set();
  let at = i;
  for (let d = 0; d < 14; d++) {
    const r = retainers[at].find((x) => !seen.has(x.from) && C.node(x.from).type !== 'hidden') ?? retainers[at].find((x) => !seen.has(x.from));
    if (!r) break;
    seen.add(r.from);
    const nd = C.node(r.from);
    out.push(`${r.label} <- ${nd.type}:${nd.name.slice(0, 60)}`);
    at = r.from;
  }
  return out.join('  |  ');
};
for (const [key, g] of ranked.slice(0, 40)) {
  console.log(`\n${g.size} bytes, ${g.count} x ${key}`);
  for (const i of g.samples.slice(0, 2)) console.log(`   ${chain(i)}`);
}
