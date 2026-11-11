// covers: src/model/owedCueEdit.ts
// The owed cue edit's record (live-publishing phase 3, repair 2): one key per account, a map by
// production, a store of another version never read nor written over.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k),
};
const { setLibraryAccount } = await import('../src/model/accountScope.ts');
const { OWED_CUE_EDITS_KEY, forgetOwedCueEdit, keepOwedCueEdit, readOwedCueEdit } = await import('../src/model/owedCueEdit.ts');

const text = (f0) => ({ label: 'Opener', note: null, values: { f0 } });
const edit = (cueId, f0) => ({ cueId, bases: [text('before')], fields: text(f0) });

test('a record per production, read back as written, and the key goes with the last one', () => {
  store.clear();
  setLibraryAccount(null);
  keepOwedCueEdit('show-a', edit('c1', 'A'));
  keepOwedCueEdit('show-b', edit('c2', 'B'));
  assert.deepEqual(readOwedCueEdit('show-a'), edit('c1', 'A'));
  assert.deepEqual(readOwedCueEdit('show-b'), edit('c2', 'B'));
  keepOwedCueEdit('show-a', edit('c1', 'A2'));
  assert.equal(readOwedCueEdit('show-a').fields.values.f0, 'A2', 'replaced');
  forgetOwedCueEdit('show-a');
  assert.equal(readOwedCueEdit('show-a'), null);
  forgetOwedCueEdit('show-b');
  assert.equal(store.has(OWED_CUE_EDITS_KEY), false);
});

test("each account keeps its own records", () => {
  store.clear();
  setLibraryAccount('acct-1');
  keepOwedCueEdit('show-a', edit('c1', 'One'));
  setLibraryAccount('acct-2');
  assert.equal(readOwedCueEdit('show-a'), null);
  setLibraryAccount('acct-1');
  assert.equal(readOwedCueEdit('show-a').fields.values.f0, 'One');
  assert.ok(store.has(`${OWED_CUE_EDITS_KEY}@acct-1`));
  setLibraryAccount(null);
});

test('a store of another version is never read, written over or cleared', () => {
  store.clear();
  const newer = JSON.stringify({ v: 2, shows: { 'show-a': { anything: true } } });
  store.set(OWED_CUE_EDITS_KEY, newer);
  assert.equal(readOwedCueEdit('show-a'), null);
  keepOwedCueEdit('show-a', edit('c1', 'X'));
  forgetOwedCueEdit('show-a');
  assert.equal(store.get(OWED_CUE_EDITS_KEY), newer);
});

test('an unreadable record reads as none', () => {
  store.clear();
  store.set(OWED_CUE_EDITS_KEY, JSON.stringify({ v: 1, shows: { 'show-a': { cueId: 'c1', bases: [null], fields: text('x') } } }));
  assert.equal(readOwedCueEdit('show-a'), null);
  store.set(OWED_CUE_EDITS_KEY, '{not json');
  assert.equal(readOwedCueEdit('show-a'), null);
});
