// The quarantine's rules, pinned: what enters, what leaves, how passes are counted off the commit
// statuses quarantine.yml posts, and that the stored shape survives a round trip. All pure - the
// store on disk is exercised only through the serializer, and the status history through an
// injected `gh`.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { coverageGaps, incidentIssueAction, incidentIssueBody, quarantineIncidents } from './e2e-quarantine.mjs';

import {
  RELEASE_AFTER,
  STALE_AFTER_DAYS,
  STORE_VERSION,
  staleEntries,
  staleIssueBody,
  consecutivePasses,
  dueForRelease,
  emptyStore,
  enter,
  matrixOf,
  passHistories,
  quarantinedSpecs,
  queueStoreChange,
  readStore,
  release,
  serializeStore,
  slugOf,
  statusContext,
} from './e2e-quarantine.mjs';
import { editedSpecs, planIdentity, specFilterArg, specPath } from './e2e-spec-names.mjs';

const A = 'e2e/anim-engine.spec.ts';
const B = 'e2e/import-svg.spec.ts';

test('entering records the date, the run and a count; a spec already in is left as it was', () => {
  const first = enter(emptyStore(), [A, 'import-svg.spec.ts'], { date: '2026-09-06', run: 'https://run/1' });
  assert.deepEqual(first.entered, [A, B]);
  assert.deepEqual(first.store.specs[A], { since: '2026-09-06', count: 1, run: 'https://run/1' });
  assert.equal(first.store.specs[B].count, 1, 'a bare planner name is stored under its e2e/ path');
  const again = enter(first.store, [A], { date: '2026-09-07', run: 'https://run/2' });
  assert.deepEqual(again.entered, []);
  assert.deepEqual(again.store.specs[A], first.store.specs[A]);
});

test('a released spec that comes back carries its count up by one', () => {
  const { store: inOnce } = enter(emptyStore(), [A], { date: '2026-09-01', run: 'r1' });
  const { store: out, released } = release(inOnce, A, { date: '2026-09-05' });
  assert.equal(released, true);
  assert.deepEqual(quarantinedSpecs(out), []);
  assert.deepEqual(out.released[A], { count: 1, last: '2026-09-05' });
  const { store: back } = enter(out, [A], { date: '2026-09-06', run: 'r2' });
  assert.equal(back.specs[A].count, 2);
  assert.equal(back.released[A], undefined);
  assert.equal(release(emptyStore(), A).released, false, 'releasing what is not there is a no-op');
});

test('passes are counted newest first, a commit without the status is skipped, the first failure ends the streak', () => {
  assert.equal(consecutivePasses([]), 0);
  assert.equal(consecutivePasses(['success', 'success', null, 'success', 'failure', 'success']), 3);
  assert.equal(consecutivePasses(['failure', 'success']), 0);
  assert.equal(consecutivePasses([null, null]), 0);
});

test('release is due at RELEASE_AFTER consecutive passes and not one earlier', () => {
  const { store } = enter(emptyStore(), [A, B], { date: '2026-09-01' });
  const history = { [A]: Array(RELEASE_AFTER).fill('success'), [B]: Array(RELEASE_AFTER - 1).fill('success') };
  assert.deepEqual(dueForRelease(store, (spec) => history[spec]), [A]);
});

test('the status history reads one statuses call per commit for every spec, and stops once each has enough answers', () => {
  const runs = Array.from({ length: 30 }, (_, i) => ({ head_sha: `sha${100 - i}` }));
  const store = enter(emptyStore(), [A, B], { date: '2026-10-19', run: 'https://github.com/o/r/actions/runs/100' }).store;
  const asked = [];
  const gh = (args) => {
    if (args[0].includes('/contents/e2e/quarantine.json')) return [{ encoding: 'base64', content: Buffer.from(serializeStore(store)).toString('base64') }];
    asked.push(args[0]);
    if (args[0].includes('/workflows/quarantine.yml/runs')) return runs;
    const n = Number(args[0].match(/commits\/sha(\d+)\/status$/)[1]);
    // The two newest commits carry no status yet; the third failed A; the rest passed both.
    if (n >= 99) return [{ context: 'Vercel', state: 'success' }];
    if (n === 98) return [{ context: statusContext(A), state: 'failure' }, { context: statusContext(B), state: 'success' }];
    return [{ context: statusContext(A), state: 'success' }, { context: statusContext(B), state: 'success' }];
  };
  const histories = passHistories({ repo: 'o/r', specs: [A, B], store, gh, need: 5 });
  assert.deepEqual(histories.get(A).slice(0, 4), [null, null, 'failure', 'success']);
  assert.equal(consecutivePasses(histories.get(A)), 0, 'the failure at sha98 ends A\'s streak');
  assert.equal(consecutivePasses(histories.get(B)), 5);
  assert.equal(asked.length, 1 + 7, 'one runs call, then one combined-status call per commit until every spec has five answers');
  assert.ok(asked[1].endsWith('/status'), 'the combined endpoint, one latest state per context');
  assert.equal(statusContext('anim-engine.spec.ts'), `noacg/quarantine/${A}`);
});

function cycleHistory({ fresh = 1, failureAt = -1, duplicate = false, missingSource = false, missingRun = false } = {}) {
  const run = 'https://github.com/o/r/actions/runs/200';
  const store = enter(emptyStore(), [A], { date: '2026-10-19', run }).store;
  store.specs[A].count = 12;
  if (missingRun) delete store.specs[A].run;
  // Re-entry on the same calendar day: twenty successes from cycle 11 are not cycle 12.
  const prior = structuredClone(store);
  prior.specs[A] = { since: '2026-10-19', count: 11, run: 'https://github.com/o/r/actions/runs/100' };
  const runs = Array.from({ length: fresh + RELEASE_AFTER }, (_, i) => ({ head_sha: `sha${i}` }));
  if (duplicate) runs.splice(1, 0, runs[0]);
  const gh = (args) => {
    if (args[0].includes('/workflows/quarantine.yml/runs')) return runs;
    if (args[0].includes('/contents/e2e/quarantine.json')) {
      if (missingSource) return [];
      const i = Number(args[0].split('sha')[1]);
      return [{ encoding: 'base64', content: Buffer.from(serializeStore(i < fresh ? store : prior)).toString('base64') }];
    }
    const i = Number(args[0].match(/commits\/sha(\d+)\/status$/)[1]);
    return [{ context: statusContext(A), state: i === failureAt ? 'failure' : 'success' }];
  };
  return { store, histories: passHistories({ repo: 'o/r', specs: [A], store, gh }) };
}

test('a new quarantine entry cannot release from twenty old successes and one fresh success', () => {
  const { store, histories } = cycleHistory();
  assert.equal(consecutivePasses(histories.get(A)), 1);
  assert.deepEqual(dueForRelease(store, spec => histories.get(spec)), []);
});

test('release needs twenty unique successes in the current cycle, and a later failure resets it', () => {
  const ready = cycleHistory({ fresh: RELEASE_AFTER });
  assert.deepEqual(dueForRelease(ready.store, spec => ready.histories.get(spec)), [A]);
  const duplicate = cycleHistory({ fresh: RELEASE_AFTER - 1, duplicate: true });
  assert.deepEqual(dueForRelease(duplicate.store, spec => duplicate.histories.get(spec)), []);
  const failed = cycleHistory({ fresh: RELEASE_AFTER + 1, failureAt: 1 });
  assert.equal(consecutivePasses(failed.histories.get(A)), 1);
  assert.deepEqual(dueForRelease(failed.store, spec => failed.histories.get(spec)), []);
});

test('an unreadable source boundary or missing triggering run cannot earn an automatic release', () => {
  for (const fault of [{ missingSource: true }, { missingRun: true }]) {
    const { store, histories } = cycleHistory({ fresh: RELEASE_AFTER, ...fault });
    assert.deepEqual(dueForRelease(store, spec => histories.get(spec)), []);
  }
});

test('the store round-trips through the serializer with sorted keys, and a newer version is refused', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'quarantine-'));
  try {
    const file = path.join(dir, 'quarantine.json');
    const { store } = enter(emptyStore(), [B, A], { date: '2026-09-06', run: 'r' });
    writeFileSync(file, serializeStore(store));
    const text = readFileSync(file, 'utf8');
    assert.ok(text.indexOf(A) < text.indexOf(B), 'keys are sorted so two entries diff as two lines');
    assert.ok(text.endsWith('\n'));
    const back = readStore(file);
    assert.equal(back.version, STORE_VERSION);
    assert.deepEqual(quarantinedSpecs(back), [A, B]);
    writeFileSync(file, JSON.stringify({ version: STORE_VERSION + 1, specs: {} }));
    assert.throws(() => readStore(file), /version/);
    assert.deepEqual(readStore(path.join(dir, 'missing.json')).specs, {}, 'no file is an empty store');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a store change that origin/main already holds is not committed, and a queued or refused branch is left alone', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'quarantine-'));
  try {
    const file = path.join(dir, 'quarantine.json');
    writeFileSync(file, serializeStore(enter(emptyStore(), [A], { date: '2026-09-01', run: 'r' }).store));
    const calls = [];
    const git = (args) => {
      calls.push(args);
      if (args[0] === 'ls-remote') return { status: 0, out: '', err: '' };
      if (args[0] === 'rev-parse') return { status: 0, out: 'm'.repeat(40), err: '' };
      return { status: 0, out: '', err: '' };
    };
    const gh = () => ({ status: 0, out: '[]', err: '' });
    const result = queueStoreChange({ branch: 'quarantine/enter-x', title: 't', body: 'b', mechanism: 'm', mutate: (store) => enter(store, [A]).store, git, gh, file });
    assert.match(result.skipped, /already holds/);
    assert.ok(!calls.some((c) => c[0] === 'commit' || c[0] === 'push'));

    const open = queueStoreChange({
      branch: 'quarantine/enter-x',
      title: 't',
      body: 'b',
      mechanism: 'm',
      mutate: (s) => s,
      git: (args) => (args[0] === 'ls-remote' ? { status: 0, out: 'sha\tref', err: '' } : { status: 0, out: '', err: '' }),
      gh: (args) => ({ status: 0, out: args.includes('open') ? '[{"number":9,"url":"u9"}]' : '[]', err: '' }),
      file,
    });
    assert.match(open.skipped, /already queued as u9/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('identities convert both ways and the branch slug is stable', () => {
  assert.equal(planIdentity(A), 'anim-engine.spec.ts');
  assert.equal(planIdentity('e2e\\anim-engine.spec.ts'), 'anim-engine.spec.ts');
  assert.equal(specPath('anim-engine.spec.ts'), A);
  assert.equal(specPath(A), A);
  assert.equal(specFilterArg(A), specFilterArg('anim-engine.spec.ts'), 'the filter is the same from either name');
  assert.deepEqual([...editedSpecs(['e2e\\x.spec.ts', 'src/a.ts', 'e2e/_helper.ts', 'e2e/configured/y.spec.ts'])], ['x.spec.ts', 'configured/y.spec.ts']);
  assert.equal(slugOf([A, B]), slugOf([B, A]));
  assert.notEqual(slugOf([A]), slugOf([B]));
  assert.match(slugOf([A]), /^[0-9a-f]{8}$/);
});

// A configured spec cannot run in quarantine.yml (it needs configured-suite.yml's local Supabase
// stack), so that workflow's jobs leave it out, while the release job still sees it and counts it.
test('quarantine.yml runs only the specs it can, and still releases the configured ones', () => {
  const C = 'e2e/configured/teams.spec.ts';
  const store = enter(emptyStore(), [A, C], { date: '2026-10-09', run: 'r' }).store;
  assert.deepEqual(matrixOf(store), [A]);
  assert.deepEqual(matrixOf(store, { all: true }), [A, C]);
  const onlyConfigured = enter(emptyStore(), [C], { date: '2026-10-09', run: 'r' }).store;
  assert.deepEqual(matrixOf(onlyConfigured), []);
  assert.deepEqual(matrixOf(onlyConfigured, { all: true }), [C], 'so the release job is not skipped');
});

test('an entry older than STALE_AFTER_DAYS is stale, oldest first, and nothing younger is', () => {
  const store = { ...emptyStore(), specs: {
    'e2e/a.spec.ts': { since: '2026-09-20', count: 2, run: 'https://example/run/1' },
    'e2e/b.spec.ts': { since: '2026-10-01', count: 1 },
    'e2e/c.spec.ts': { since: '2026-09-10', count: 5 },
  } };
  const stale = staleEntries(store, '2026-10-12');
  assert.deepEqual(stale.map((e) => [e.spec, e.days, e.count]), [['e2e/c.spec.ts', 32, 5], ['e2e/a.spec.ts', 22, 2]]);
  assert.deepEqual(staleEntries(store, '2026-09-23'), [], 'nothing is stale before the fourteenth day');
  assert.equal(staleEntries(store, '2026-09-24').length, 1, 'the fourteenth day counts');
  const body = staleIssueBody(stale, '2026-10-12');
  assert.match(body, /\| `e2e\/c\.spec\.ts` \| 2026-09-10 \| 32 \| 5 \| - \|/);
  assert.ok(body.endsWith('<!-- quarantine-stale-set: e2e/a.spec.ts e2e/c.spec.ts -->'), 'the last line identifies the set so a repeat edits nothing');
  assert.equal(STALE_AFTER_DAYS, 14);
});

// --- Quarantine incidents (cicd-improvement ci07, evidence/phase-ci07.md Rules Q1 to Q4) ---

const incidentStore = {
  specs: {
    'e2e/flows.spec.ts': { since: '2026-10-20', count: 1, run: 'r1' },
    'e2e/import-svg.spec.ts': { since: '2026-10-31', count: 5, run: 'r2' },
    'e2e/configured/late-send-abandoned.spec.ts': { since: '2026-10-28', count: 16 },
  },
};
const readText = readFileSync;
const glob = (g) => ({ globs: [g], test: () => true });
const incidentHeaders = new Map([
  ['flows.spec.ts', { critical: ['site-entry'], covers: [glob('src/components/wizard/**')], none: null }],
  ['import-svg.spec.ts', { critical: [], covers: [glob('src/importedDesign/**')], none: null }],
]);
const incidentConfigured = new Map([['late-send-abandoned.spec.ts', { critical: [], covers: [glob('src/control/**')], none: null }]]);
const context = { headers: incidentHeaders, configured: incidentConfigured, today: '2026-11-01', owner: 'the coordinator' };

test('Rule Q1: every quarantined spec is an incident, critical for a critical journey and affected otherwise', () => {
  const incidents = quarantineIncidents(incidentStore, context);
  assert.deepEqual(incidents.map((i) => [i.spec, i.severity]), [
    ['e2e/flows.spec.ts', 'critical'],
    ['e2e/configured/late-send-abandoned.spec.ts', 'affected'],
    ['e2e/import-svg.spec.ts', 'affected'],
  ]);
  assert.equal(quarantineIncidents({ specs: {} }, context).length, 0);
});

test('Rule Q2: an incident has an owner, a bounded repair date and a stated gap, and reads overdue past it', () => {
  const [flows, late, svg] = quarantineIncidents(incidentStore, context);
  assert.equal(flows.owner, 'the coordinator');
  assert.equal(flows.due, '2026-10-27', 'critical: 7 days');
  assert.equal(flows.overdue, true);
  assert.match(flows.gap, /critical journey for site-entry is not blocking/);
  assert.equal(svg.due, '2026-11-14', 'affected: 14 days');
  assert.equal(svg.overdue, false);
  assert.match(svg.gap, /src\/importedDesign\/\*\* merge without it blocking/);
  assert.equal(late.due, '2026-11-11');
  const unknown = quarantineIncidents({ specs: { 'e2e/gone.spec.ts': { since: '2026-11-01' } } }, context)[0];
  assert.match(unknown.gap, /selection is unknown/);
  assert.match(incidentIssueBody([flows], '2026-11-01'), /2026-10-27 \*\*overdue\*\* \| the coordinator/);
});

test('Rule Q3: one rolling issue, opened with the first incident, updated when the set changes, closed only when none is left', () => {
  const incidents = quarantineIncidents(incidentStore, context);
  assert.equal(incidentIssueAction(incidents, null, '2026-11-01').kind, 'create');
  const body = incidentIssueBody(incidents, '2026-11-01');
  assert.equal(incidentIssueAction(incidents, { number: 1, body }, '2026-11-02').kind, 'none', 'same set, no mail');
  const fewer = incidents.slice(1);
  assert.equal(incidentIssueAction(fewer, { number: 1, body }, '2026-11-02').kind, 'edit');
  assert.equal(incidentIssueAction(incidents.slice(2), { number: 1, body }, '2026-11-02').kind, 'edit', 'one incident left keeps the issue open');
  assert.equal(incidentIssueAction([], { number: 1, body }, '2026-11-02').kind, 'close');
  assert.equal(incidentIssueAction([], null, '2026-11-02').kind, 'none');
  // An unread store or issue list throws before any action: the CLI reads both with throwing calls.
  const cli = readText(new URL('./e2e-quarantine.mjs', import.meta.url), 'utf8');
  const block = cli.slice(cli.indexOf("if (command === 'incidents')"), cli.indexOf("if (command === 'release-due')"));
  assert.doesNotMatch(block, /allowFailure/, 'no read in the incidents command may fail quietly');
});

test('Rule Q4: a plan that selects a quarantined spec states each gap on the run, offline and configured', () => {
  const incidents = quarantineIncidents(incidentStore, context);
  const gaps = coverageGaps({ quarantined: ['e2e/flows.spec.ts'], configured: { quarantined: ['e2e/configured/late-send-abandoned.spec.ts'] } }, incidents);
  assert.deepEqual(gaps.map((g) => g.spec), ['e2e/configured/late-send-abandoned.spec.ts', 'e2e/flows.spec.ts']);
  assert.match(gaps[1].warning, /^::warning title=Coverage gap::e2e\/flows\.spec\.ts is quarantined \(critical incident, repair due 2026-10-27 \(overdue\)\)/);
  assert.deepEqual(coverageGaps({ quarantined: [], configured: null }, incidents), []);
  // ci.yml prints them right after the plan, with no retry around them.
  const ci = readText(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(ci, /echo "plan: \$PLAN"\n(?:\s*#.*\n)*\s*node scripts\/e2e-quarantine\.mjs incidents --plan "\$PLAN"\n/);
  const q = readText(new URL('../.github/workflows/quarantine.yml', import.meta.url), 'utf8');
  assert.match(q, /node scripts\/e2e-quarantine\.mjs incidents --issue --run "\$RUN_URL"/);
});
