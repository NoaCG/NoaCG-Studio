// The quarantine's rules, pinned: what enters, what leaves, how passes are counted, and that the
// stored shape survives a round trip. All pure - the store on disk is exercised only through the
// serializer, and the run history through an injected `gh`.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  RELEASE_AFTER,
  STORE_VERSION,
  consecutivePasses,
  dueForRelease,
  emptyStore,
  enter,
  passHistory,
  planIdentity,
  quarantineJobName,
  quarantinedSpecs,
  readStore,
  release,
  serializeStore,
  slugOf,
  specPath,
} from './e2e-quarantine.mjs';

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

test('passes are counted newest first, a run without the job is skipped, the first failure ends the streak', () => {
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

test('the run history reads each run\'s job for the spec and stops once it has enough answers', () => {
  const runs = Array.from({ length: 30 }, (_, i) => ({ id: 100 - i, conclusion: 'success' }));
  const asked = [];
  const gh = (args) => {
    asked.push(args[0]);
    if (args[0].includes('/workflows/ci.yml/runs')) return runs;
    const id = Number(args[0].match(/runs\/(\d+)\/jobs/)[1]);
    // The two newest runs did not have the job yet; the third failed it; the rest passed.
    if (id >= 99) return [{ name: 'E2E 1/9 (full)', conclusion: 'success' }];
    if (id === 98) return [{ name: quarantineJobName(A), conclusion: 'failure' }];
    return [{ name: quarantineJobName(A), conclusion: 'success' }];
  };
  const history = passHistory({ repo: 'o/r', spec: A, gh, need: 5 });
  assert.deepEqual(history.slice(0, 4), [null, null, 'failure', 'success']);
  assert.equal(history.filter((h) => h !== null).length, 5, 'stops after `need` verdicts');
  assert.equal(consecutivePasses(history), 0, 'the failure at run 98 ends the streak');
  assert.equal(asked.length, 1 + 7, 'one runs call, then one jobs call per run until five answered');
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

test('identities convert both ways and the branch slug is stable', () => {
  assert.equal(planIdentity(A), 'anim-engine.spec.ts');
  assert.equal(planIdentity('e2e\\anim-engine.spec.ts'), 'anim-engine.spec.ts');
  assert.equal(specPath('anim-engine.spec.ts'), A);
  assert.equal(specPath(A), A);
  assert.equal(slugOf([A, B]), slugOf([B, A]));
  assert.notEqual(slugOf([A]), slugOf([B]));
  assert.match(slugOf([A]), /^[0-9a-f]{8}$/);
});
