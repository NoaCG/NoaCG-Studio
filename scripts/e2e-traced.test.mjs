// The traced spec map (scripts/e2e-traced.mjs), pinned: what a script URL names, what one run's
// trace and one night's merge keep, when the planner may trust a map, and how it lands.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BROAD_ESCALATES,
  BROAD_SHARE,
  MAP_BRANCH,
  MAP_PATH,
  MAX_AGE_DAYS,
  mergeRefusal,
  mergeTraces,
  MIN_FRESH_SHARE,
  queueTracedMap,
  readRecords,
  readTracedMap,
  repoFileOf,
  serializeMap,
  traceOf,
  tracedFrom,
} from './e2e-traced.mjs';
import { planFor } from './e2e-affected.mjs';

const ROOT = '/repo';
const onDisk = (...files) => (abs) => files.some((f) => abs.replaceAll('\\', '/').endsWith(`/repo/${f}`));

test('a dev-server module URL names its repository file; dependencies, Vite internals and other hosts name none', () => {
  const exists = onDisk('src/templates/importedDesign/svg.ts', 'src/main.tsx', 'public/player-host/index.html');
  assert.equal(repoFileOf('http://127.0.0.1:5244/src/templates/importedDesign/svg.ts?t=17', ROOT, exists), 'src/templates/importedDesign/svg.ts');
  assert.equal(repoFileOf('http://localhost:5244/@fs/repo/src/main.tsx', ROOT, exists), 'src/main.tsx');
  assert.equal(repoFileOf('http://127.0.0.1:5244/@fs/elsewhere/src/main.tsx', ROOT, exists), null);
  assert.equal(repoFileOf('http://127.0.0.1:5244/node_modules/.vite/deps/react.js', ROOT, () => true), null);
  assert.equal(repoFileOf('http://127.0.0.1:5244/@vite/client', ROOT, () => true), null);
  assert.equal(repoFileOf('http://127.0.0.1:5244/app', ROOT, exists), null, 'a page is not a file');
  assert.equal(repoFileOf('https://cdn.example.com/src/main.tsx', ROOT, () => true), null);
  assert.equal(repoFileOf('', ROOT, () => true), null);
});

test('one run: every record of a spec is unioned, and a spec that did not finish says so', () => {
  const records = [
    { spec: 'a.spec.ts', urls: ['http://127.0.0.1:1/src/x.ts', 'http://127.0.0.1:1/node_modules/y.js'] },
    { spec: 'a.spec.ts', urls: ['http://127.0.0.1:1/src/z.ts'] },
    { spec: 'b.spec.ts', urls: ['http://127.0.0.1:1/src/x.ts'] },
  ];
  const complete = new Map([['a.spec.ts', true], ['b.spec.ts', false], ['c.spec.ts', false]]);
  const trace = traceOf(records, complete, (url) => repoFileOf(url, ROOT, onDisk('src/x.ts', 'src/z.ts')));
  assert.deepEqual(trace.specs, {
    'a.spec.ts': { complete: true, files: ['src/x.ts', 'src/z.ts'] },
    'b.spec.ts': { complete: false, files: ['src/x.ts'] },
    'c.spec.ts': { complete: false, files: [] },
  });
});

test('the fixture records are read from every worker file and nothing else', () => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-traced-records-'));
  writeFileSync(join(dir, 'worker-0.jsonl'), `${JSON.stringify({ spec: 'a.spec.ts', urls: ['u1'] })}\n`);
  writeFileSync(join(dir, 'worker-3.jsonl'), `${JSON.stringify({ spec: 'b.spec.ts', urls: [] })}\n\n`);
  writeFileSync(join(dir, 'trace.json'), '{}');
  assert.deepEqual(readRecords(dir).map((r) => r.spec), ['a.spec.ts', 'b.spec.ts']);
  assert.deepEqual(readRecords(join(dir, 'missing')), []);
});

test('a night: a finished spec is tonight alone, an unfinished or silent one keeps its previous entry, a deleted one leaves', () => {
  const previous = { files: { 'src/old.ts': ['a.spec.ts', 'b.spec.ts', 'gone.spec.ts'], 'src/x.ts': ['c.spec.ts'] } };
  const shards = [
    { specs: { 'a.spec.ts': { complete: true, files: ['src/x.ts'] } } },
    { specs: { 'b.spec.ts': { complete: false, files: ['src/new.ts'] } } },
  ];
  const map = mergeTraces(shards, previous, { sha: 's', tracedAt: 't', specsOnDisk: ['a.spec.ts', 'b.spec.ts', 'c.spec.ts', 'd.spec.ts'] });
  assert.deepEqual(map.files, {
    'src/new.ts': ['b.spec.ts'],
    'src/old.ts': ['b.spec.ts'],
    'src/x.ts': ['a.spec.ts', 'c.spec.ts'],
  });
  assert.deepEqual(map.carried, ['b.spec.ts', 'c.spec.ts']);
  assert.deepEqual(map.untraced, ['d.spec.ts']);
  assert.equal(map.specs, 3);
});

// A night that traced nothing must not re-date carried-over content, or the age limit never fires.
test('a night that traced too little of the suite is refused rather than dated as new', () => {
  const previous = { files: { 'src/x.ts': ['a.spec.ts', 'b.spec.ts'] } };
  const specsOnDisk = ['a.spec.ts', 'b.spec.ts', 'c.spec.ts'];
  const empty = mergeTraces([], previous, { sha: 's', tracedAt: 't', specsOnDisk });
  assert.equal(empty.fresh, 0);
  assert.match(mergeRefusal(empty, specsOnDisk), /only 0 of 3/);
  const enough = mergeTraces([{ specs: { 'a.spec.ts': { complete: true, files: [] }, 'b.spec.ts': { complete: true, files: [] } } }], previous, { sha: 's', tracedAt: 't', specsOnDisk });
  assert.equal(mergeRefusal(enough, specsOnDisk), null);
  assert.equal(MIN_FRESH_SHARE <= 2 / 3, true);
});

test('the committed form is one file per line and parses back to the same map', () => {
  const map = mergeTraces([{ specs: { 'a.spec.ts': { complete: true, files: ['src/x.ts', 'src/y.ts'] } } }], null, { sha: 's', tracedAt: '2026-10-10T00:00:00Z', specsOnDisk: ['a.spec.ts'] });
  const text = serializeMap(map);
  assert.deepEqual(JSON.parse(text), map);
  assert.match(text, /\n {4}"src\/x\.ts": \["a\.spec\.ts"\],\n {4}"src\/y\.ts": \["a\.spec\.ts"\]\n/);
});

test('a map is trusted only when it is the right version, dated and younger than the limit', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  const map = { version: 1, sha: 'abc', tracedAt: '2026-10-09T03:00:00Z', specs: 2, files: { 'src/x.ts': ['a.spec.ts'] } };
  assert.equal(tracedFrom(map, now).problem, null);
  assert.deepEqual(tracedFrom(map, now).files.get('src/x.ts'), ['a.spec.ts']);
  const old = { ...map, tracedAt: new Date(now - (MAX_AGE_DAYS + 0.5) * 86_400_000).toISOString() };
  assert.match(tracedFrom(old, now).problem, /days old/);
  assert.match(tracedFrom({ ...map, version: 0 }, now).problem, /version/);
  assert.match(tracedFrom({ ...map, tracedAt: 'soon' }, now).problem, /tracedAt/);
  assert.equal(tracedFrom(old, now).files.size, 0, 'a distrusted map lends no specs');
});

test('a missing or unreadable map file is a problem, never an empty map', () => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-traced-read-'));
  assert.match(readTracedMap({ file: join(dir, 'none.json') }).problem, /no traced spec map/);
  writeFileSync(join(dir, 'bad.json'), '{');
  assert.match(readTracedMap({ file: join(dir, 'bad.json') }).problem, /unreadable/);
});

test('a file most of the traced suite executes is broad', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  const specs = ['a', 'b', 'c', 'd'].map((s) => `${s}.spec.ts`);
  const map = { version: 1, sha: 's', tracedAt: '2026-10-10T00:00:00Z', specs: 4, files: { 'src/shell.ts': specs, 'src/narrow.ts': specs.slice(0, 1) } };
  const { broad } = tracedFrom(map, now);
  assert.equal(BROAD_SHARE < 1, true);
  assert.deepEqual([...broad], ['src/shell.ts']);
});

// THE PLANNER'S HALF. A spec the curated headers miss is added; a map that cannot be trusted, or a
// broad file, escalates; CENTRAL source never asks.
const fresh = (files, broad = []) => ({ files: new Map(Object.entries(files)), broad: new Set(broad), problem: null });

test('the traced map adds the spec a covers header missed - the #927 shape', () => {
  // src/templates/importedDesign/svg.ts was covered by the import specs and not by
  // editor-fidelity-trim.spec.ts, whose SVG drop runs it.
  const coverage = [{ spec: 'import-svg.spec.ts', test: (f) => f === 'src/templates/importedDesign/svg.ts' }];
  const file = 'src/templates/importedDesign/svg.ts';
  const curated = planFor([file], { coverage });
  assert.deepEqual(curated.specs, ['import-svg.spec.ts']);
  const traced = planFor([file], { coverage, traced: fresh({ [file]: ['editor-fidelity-trim.spec.ts', 'import-svg.spec.ts'] }) });
  assert.equal(traced.mode, 'subset');
  assert.deepEqual(traced.specs, ['editor-fidelity-trim.spec.ts', 'import-svg.spec.ts']);
  assert.deepEqual(traced.traced, ['editor-fidelity-trim.spec.ts'], 'the plan says what tracing added');
});

test('a stale, missing or unreadable map escalates every file that would have asked it', () => {
  const coverage = [{ spec: 'legal.spec.ts', test: (f) => f === 'src/legal.css' }];
  const plan = planFor(['src/legal.css', 'docs/notes.md'], { coverage, traced: { files: new Map(), broad: new Set(), problem: 'the traced spec map is 9.0 days old' } });
  assert.equal(plan.mode, 'full');
  assert.deepEqual(plan.tracedEscalated, ['src/legal.css'], 'an ignored doc never asks the map');
  assert.match(plan.tracedProblem, /days old/);
  const focus = planFor(['src/legal.css'], { coverage, sprintFocus: true, traced: { files: new Map(), broad: new Set(), problem: 'x' } });
  assert.equal(focus.focusApplied, true, 'under sprint focus it is the focus set, the existing escalation');
});

test('a broad file keeps its covers selection and is named, or escalates like core when BROAD_ESCALATES says so', () => {
  const coverage = [{ spec: 'legal.spec.ts', test: (f) => f === 'src/shell.tsx' }];
  const map = { 'src/shell.tsx': ['a.spec.ts', 'b.spec.ts'] };
  const kept = planFor(['src/shell.tsx'], { coverage, traced: fresh(map, ['src/shell.tsx']) });
  assert.equal(kept.mode, 'subset');
  assert.deepEqual(kept.specs, ['legal.spec.ts'], 'never fewer than the headers, and none of the broad list');
  assert.deepEqual(kept.tracedBroad, ['src/shell.tsx']);
  const escalated = planFor(['src/shell.tsx'], { coverage, traced: { ...fresh(map, ['src/shell.tsx']), broadEscalates: true } });
  assert.equal(escalated.mode, 'full');
  assert.equal(BROAD_ESCALATES, tracedFrom({ version: 1, sha: 's', tracedAt: new Date().toISOString(), specs: 1, files: {} }).broadEscalates);
});

test('CENTRAL source never consults the map, so a stale map does not escalate it', () => {
  const plan = planFor(['cli/bin/noacg.mjs'], { traced: { files: new Map(), broad: new Set(), problem: 'stale' } });
  assert.equal(plan.mode, 'none');
  assert.deepEqual(plan.tracedEscalated, []);
});

test('a traced spec that is no longer on disk is not planned', () => {
  const coverage = [{ spec: 'b.spec.ts', test: (f) => f === 'src/x.ts' }];
  const plan = planFor(['src/x.ts'], { coverage, specsOnDisk: ['a.spec.ts', 'b.spec.ts'], traced: fresh({ 'src/x.ts': ['a.spec.ts', 'deleted.spec.ts'] }) });
  assert.deepEqual(plan.specs, ['a.spec.ts', 'b.spec.ts']);
});

// Tracing only ever ADDS. A file the curated rules do not know still escalates as unmapped, even
// when the map knows who executes it: the map cannot see what a spec reads from Node or what the
// dev server's own handlers run, so it is not allowed to make a path look mapped.
test('a file only the map knows still escalates as unmapped', () => {
  const plan = planFor(['src/x.ts'], { coverage: [], traced: fresh({ 'src/x.ts': ['a.spec.ts'] }) });
  assert.equal(plan.mode, 'full');
  assert.deepEqual(plan.unmapped, ['src/x.ts']);
});

test('the map lands through one regenerated branch: force-pushed, stamped and queued', () => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-traced-queue-'));
  const file = join(dir, 'map.json');
  writeFileSync(file, '{"version":1}\n');
  const calls = [];
  const runner = (tool) => (args) => {
    calls.push([tool, ...args]);
    if (tool === 'git' && args[0] === 'rev-parse') return { status: 0, out: 'base123', err: '' };
    if (tool === 'gh' && args[0] === 'pr' && args[1] === 'list') return { status: 0, out: '[]', err: '' };
    if (tool === 'gh' && args[0] === 'pr' && args[1] === 'create') return { status: 0, out: 'https://github.com/o/r/pull/7', err: '' };
    return { status: 0, out: '', err: '' };
  };
  const root = mkdtempSync(join(tmpdir(), 'e2e-traced-root-'));
  mkdirSync(join(root, 'scripts'));
  const result = queueTracedMap({ file, runUrl: 'https://run', summary: 'sum', root, git: runner('git'), gh: runner('gh') });
  assert.equal(result.number, 7);
  assert.equal(readFileSync(join(root, MAP_PATH), 'utf8'), '{"version":1}\n');
  const flat = calls.map((c) => c.join(' '));
  assert.ok(flat.includes(`git checkout -q --force -B ${MAP_BRANCH} base123`));
  assert.ok(flat.some((c) => c.startsWith('git push --force origin')), 'the branch is replaced, never merged with');
  assert.ok(flat.some((c) => c.startsWith('gh pr merge 7 --auto')));

  calls.length = 0;
  assert.match(queueTracedMap({ file, root, git: runner('git'), gh: runner('gh') }).skipped, /already holds/, 'an unchanged map proposes nothing');
});

test('the reporter starts from an empty trace directory and writes into it even when no test did', async () => {
  const { default: TraceReporter } = await import('./e2e-trace-reporter.mjs');
  const dir = join(mkdtempSync(join(tmpdir(), 'e2e-traced-reporter-')), 'nested');
  const before = process.env.NOACG_E2E_TRACE;
  process.env.NOACG_E2E_TRACE = dir;
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'worker-0.jsonl'), `${JSON.stringify({ spec: 'stale.spec.ts', urls: [] })}\n`);
    const reporter = new TraceReporter();
    reporter.onBegin({}, { allTests: () => [] });
    reporter.onEnd();
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'trace.json'), 'utf8')).specs, {}, 'a stale record from an earlier run is not this run');
  } finally {
    if (before === undefined) delete process.env.NOACG_E2E_TRACE;
    else process.env.NOACG_E2E_TRACE = before;
  }
});
