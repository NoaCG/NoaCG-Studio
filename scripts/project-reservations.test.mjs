// guards: src/model/project.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';

const bundle = await rolldown({ input: 'src/model/project.ts', platform: 'neutral', plugins: [rawSuffix], logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
await bundle.close();
const project = await import('data:text/javascript;base64,' + Buffer.from(output[0].code).toString('base64'));
const key = 'spx-gfx-reservations';
const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
function setup(t) {
  const before = [globalThis.localStorage, globalThis.sessionStorage];
  globalThis.localStorage = storage(); globalThis.sessionStorage = storage();
  project.releaseReservation();
  t.after(() => {
    [globalThis.localStorage, globalThis.sessionStorage] = before;
    project.releaseReservation();
  });
}

for (const damaged of [null, '{"version":1,"ids":[', '{"version":2,"ids":["newer"]}']) {
  test(`a tab retains its allocated reservation after device list becomes ${damaged}`, t => {
    setup(t);
    const id = project.reservedGraphicId(undefined);
    if (damaged === null) localStorage.removeItem(key); else localStorage.setItem(key, damaged);
    assert.equal(project.isOwnReservation(id), true);
    assert.equal(localStorage.getItem(key), damaged);
    sessionStorage.removeItem(key);
    assert.equal(project.isOwnReservation(id), false);
  });
}

test('neither a synced id nor an unknown-version tab list establishes ownership', t => {
  setup(t);
  sessionStorage.setItem(key, '{"version":2,"ids":["foreign"]}');
  assert.equal(project.isOwnReservation('foreign'), false);
  const id = project.reservedGraphicId(undefined);
  assert.equal(project.isOwnReservation(id), true);
  assert.equal(sessionStorage.getItem(key), '{"version":2,"ids":["foreign"]}');
  localStorage.removeItem(key);
  assert.equal(project.isOwnReservation(id), false);
});

test('one refused list does not prevent the other recording ownership; both refused fail closed', t => {
  setup(t);
  localStorage.setItem = () => { throw new Error('unavailable'); };
  const id = project.reservedGraphicId(undefined);
  assert.equal(project.isOwnReservation(id), true);
  sessionStorage.removeItem(key);
  sessionStorage.setItem = localStorage.setItem;
  project.releaseReservation();
  const unknown = project.reservedGraphicId(undefined);
  assert.equal(project.isOwnReservation(unknown), false);
});
