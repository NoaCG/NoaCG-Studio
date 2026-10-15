// The quarantine's rules, pinned: what enters, what leaves, how passes are counted off the commit
// statuses quarantine.yml posts, and that the stored shape survives a round trip. All pure - the
// store on disk is exercised only through the serializer, and the status history through an
// injected `gh`.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  ENTER_BRANCH_PREFIX,
  RELEASE_AFTER,
  STALE_AFTER_DAYS,
  STORE_VERSION,
  staleEntries,
  staleIssueBody,
  closePassedEnters,
  consecutivePasses,
  dueForRelease,
  enteredBy,
  emptyStore,
  enter,
  matrixOf,
  passHistories,
  quarantinedSpecs,
  queueStoreChange,
  readStore,
  release,
  serializeStore,
  shardsPassed,
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
  const asked = [];
  const gh = (args) => {
    asked.push(args[0]);
    if (args[0].includes('/workflows/quarantine.yml/runs')) return runs;
    const n = Number(args[0].match(/commits\/sha(\d+)\/status$/)[1]);
    // The two newest commits carry no status yet; the third failed A; the rest passed both.
    if (n >= 99) return [{ context: 'Vercel', state: 'success' }];
    if (n === 98) return [{ context: statusContext(A), state: 'failure' }, { context: statusContext(B), state: 'success' }];
    return [{ context: statusContext(A), state: 'success' }, { context: statusContext(B), state: 'success' }];
  };
  const histories = passHistories({ repo: 'o/r', specs: [A, B], gh, need: 5 });
  assert.deepEqual(histories.get(A).slice(0, 4), [null, null, 'failure', 'success']);
  assert.equal(consecutivePasses(histories.get(A)), 0, 'the failure at sha98 ends A\'s streak');
  assert.equal(consecutivePasses(histories.get(B)), 5);
  assert.equal(asked.length, 1 + 7, 'one runs call, then one combined-status call per commit until every spec has five answers');
  assert.ok(asked[1].endsWith('/status'), 'the combined endpoint, one latest state per context');
  assert.equal(statusContext('anim-engine.spec.ts'), `noacg/quarantine/${A}`);
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

test('an open enter pull request is closed once a main run after it ran every shard green, and not before', () => {
  const branchStore = (specs) => Buffer.from(serializeStore(enter(emptyStore(), specs, { date: '2026-10-14', run: 'r' }).store)).toString('base64');
  const shards = (conclusions) => conclusions.map((conclusion, i) => ({ name: `E2E ${i + 1}/${conclusions.length} (chromium)`, conclusion }));
  assert.equal(shardsPassed(shards(['success', 'success'])), true);
  assert.equal(shardsPassed(shards(['success', 'failure'])), false);
  assert.equal(shardsPassed(shards(['success', 'skipped'])), false, 'a shard that did not run proves nothing');
  assert.equal(shardsPassed([{ name: 'Build', conclusion: 'success' }]), false, 'a run with no shards says nothing about a spec');
  assert.deepEqual(enteredBy(JSON.parse(Buffer.from(branchStore([A, B]), 'base64')), enter(emptyStore(), [B]).store), [A], 'what main already holds is not the pull request\'s');

  const world = (runs) => {
    const closes = [];
    const gh = (args) => {
      const url = args[0];
      if (url.includes('/pulls?')) return [
        { number: 7, url: 'u7', ref: `${ENTER_BRANCH_PREFIX}2026-10-14-aaaa`, created_at: '2026-10-14T01:58:40Z' },
        { number: 8, url: 'u8', ref: `${ENTER_BRANCH_PREFIX}2026-10-14-bbbb`, created_at: '2026-10-14T01:58:40Z' },
      ];
      if (url.includes('/contents/')) return [url.includes('aaaa') ? branchStore([A]) : serializeStore(emptyStore())];
      if (url.includes('/workflows/ci.yml/runs')) return runs;
      return url.includes('/runs/1/') ? shards(['success', 'success']) : shards(['failure', 'success']);
    };
    const ghRun = (args) => { closes.push(args); return { status: 0, out: '', err: '' }; };
    return { gh, ghRun, closes };
  };

  const passed = world([
    { id: 3, html_url: 'run3', created_at: '2026-10-14T05:00:00Z' },
    { id: 1, html_url: 'run1', created_at: '2026-10-14T03:00:00Z' },
    { id: 0, html_url: 'run0', created_at: '2026-10-14T01:00:00Z' },
  ]);
  const closed = closePassedEnters({ repo: 'o/r', mainStore: emptyStore(), gh: passed.gh, ghRun: passed.ghRun });
  assert.deepEqual(closed.map((c) => [c.number, c.specs, c.run]), [[7, [A], 'run1']], 'run3 failed a shard, run1 passed; the pull request adding nothing is left alone');
  assert.deepEqual(passed.closes[0].slice(0, 5), ['pr', 'close', '7', '-R', 'o/r']);
  assert.ok(passed.closes[0].includes('--delete-branch'), 'so the spec can enter again if it flakes again');

  const before = world([{ id: 1, html_url: 'run1', created_at: '2026-10-14T01:00:00Z' }]);
  assert.deepEqual(closePassedEnters({ repo: 'o/r', mainStore: emptyStore(), gh: before.gh, ghRun: before.ghRun }), [], 'a pass from before the pull request opened is not a pass since');
  assert.deepEqual(before.closes, []);
});
