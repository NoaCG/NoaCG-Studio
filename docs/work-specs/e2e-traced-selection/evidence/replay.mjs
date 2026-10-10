// Proof (#927) and cost replay for the traced map (scripts/e2e-traced.mjs), as recorded in this
// directory. Run from the repository root with a fetched origin/main:
//   node docs/work-specs/e2e-traced-selection/evidence/replay.mjs scripts/e2e-traced.json [landings]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const { parseSpecHeader, coverageOf, FOCUS } = await imp('scripts/e2e-lists.mjs');
const { planFor, planMinutes } = await imp('scripts/e2e-affected.mjs');
const { tracedFrom } = await imp('scripts/e2e-traced.mjs');
const { readTable, specFilesOnDisk } = await imp('scripts/e2e-durations.mjs');

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }).trim();
const lines = (s) => s.split('\n').filter(Boolean);
const map = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const landings = Number(process.argv[3] ?? 150);
const now = Date.parse(map.tracedAt);
const table = readTable();
const suite = specFilesOnDisk();

function tracedAt(share, escalate = false) {
  const t = tracedFrom(map, now);
  t.broadEscalates = escalate;
  const limit = share * (map.specs || 1);
  t.broad = new Set([...t.files].filter(([, s]) => s.length > limit).map(([f]) => f));
  return t;
}

// ── The map itself ──
const counts = Object.values(map.files).map((s) => s.length).sort((a, b) => a - b);
const q = (p) => counts[Math.floor(p * (counts.length - 1))];
console.log(`map: ${map.specs} specs traced, ${counts.length} files; specs per file p50 ${q(0.5)}, p75 ${q(0.75)}, p90 ${q(0.9)}, max ${q(1)}; untraced ${map.untraced.length}, carried ${map.carried.length}`);
for (const share of [0.1, 0.25, 0.33, 0.5]) console.log(`  files over ${share} of specs: ${counts.filter((c) => c > share * map.specs).length}`);

// ── #927 with the headers as they were at #927 ──
const REF = '6dd97b7d5';
const headers = new Map();
for (const f of lines(git('ls-tree', '-r', '--name-only', REF, 'e2e')).filter((f) => /^e2e\/[^/]+\.spec\.ts$/.test(f))) {
  headers.set(f.slice(4), parseSpecHeader(git('show', `${REF}:${f}`), f));
}
const oldCoverage = coverageOf(headers);
const changed927 = lines(git('diff', '--name-only', `${REF}^1`, REF));
console.log(`\n#927 (${REF}) changed: ${changed927.join(', ')}`);
console.log(`map entry for src/templates/importedDesign/svg.ts: ${(map.files['src/templates/importedDesign/svg.ts'] ?? []).join(', ')}`);
for (const sprintFocus of [true, false]) {
  const without = planFor(changed927, { coverage: oldCoverage, specsOnDisk: suite, sprintFocus });
  const withMap = planFor(changed927, { coverage: oldCoverage, specsOnDisk: suite, sprintFocus, traced: tracedAt(0.5) });
  const has = (p) => p.mode === 'full' || p.specs.includes('editor-fidelity-trim.spec.ts');
  console.log(`  sprintFocus=${sprintFocus}: curated ${without.mode}/${without.specs.length} selects it: ${has(without)}; with map ${withMap.mode}/${withMap.specs.length} selects it: ${has(withMap)}; traced added: ${withMap.traced.join(', ')}; broad: ${withMap.tracedBroad.join(', ') || 'none'}`);
}

// ── Cost replay over recent landings, current headers, sprint focus as CI runs it ──
const cases = [];
for (const sha of lines(git('rev-list', '--first-parent', '-n', String(landings), 'origin/main'))) {
  const parents = git('rev-list', '--parents', '-n', '1', sha).split(/\s+/);
  if (parents.length < 2) continue;
  cases.push({ sha, changed: lines(git('diff', '--name-only', parents[1], sha)) });
}
const mins = (p) => (p.mode === 'none' ? 0 : planMinutes(p, table, suite));
const variants = [['curated', null], ['union, broad>0.5 keep covers (chosen)', 0.5], ['union, broad>0.5 escalate like core', 0.5, true], ['union, no broad rule', 2]];
console.log(`\nreplay: ${cases.length} first-parent landings to origin/main, sprint focus on`);
console.log('| variant | none | subset | focus-escalated | median min | p75 min | p90 min | total min | landings that grew |');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
const base = cases.map((c) => planFor(c.changed, { specsOnDisk: suite, sprintFocus: true }));
for (const [name, share, escalate] of variants) {
  const plans = cases.map((c, i) => (share === null ? base[i] : planFor(c.changed, { specsOnDisk: suite, sprintFocus: true, traced: tracedAt(share, escalate) })));
  const m = plans.map(mins).sort((a, b) => a - b);
  const qq = (p) => m[Math.floor(p * (m.length - 1))].toFixed(1);
  const grew = plans.filter((p, i) => p.specs.length > base[i].specs.length).length;
  console.log(`| ${name} | ${plans.filter((p) => p.mode === 'none').length} | ${plans.filter((p) => p.mode === 'subset' && !p.focusApplied).length} | ${plans.filter((p) => p.focusApplied).length} | ${qq(0.5)} | ${qq(0.75)} | ${qq(0.9)} | ${m.reduce((a, b) => a + b, 0).toFixed(0)} | ${grew} |`);
}
console.log(`(focus set: ${FOCUS.length} specs, ${planMinutes({ mode: 'subset', specs: FOCUS }, table, suite).toFixed(1)} min; full suite ${planMinutes({ mode: 'full', specs: [] }, table, suite).toFixed(1)} min)`);
