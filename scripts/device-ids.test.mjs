// guards: src/model/deviceIds.ts
//
// THE DEVICE-LOCAL ID LISTS ARE A VERSIONED FORMAT (#1443). model/project.ts keeps the
// reservations this device made and the graphics that lost a sync conflict here in localStorage.
// Version 1 is written; a bare array (the first, unversioned shape) still reads; a newer version
// reads as empty and is never written over.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_IDS_VERSION, readDeviceIds, writeDeviceIds } from '../src/model/deviceIds.ts';

test('writes the current version', () => {
  assert.deepEqual(JSON.parse(writeDeviceIds(['a', 'b'])), { version: DEVICE_IDS_VERSION, ids: ['a', 'b'] });
  assert.equal(DEVICE_IDS_VERSION, 1);
});

test('reads what it writes', () => {
  assert.deepEqual(readDeviceIds(writeDeviceIds(['a', 'b'])), { ids: ['a', 'b'], writable: true });
});

test('reads nothing stored, and a bare array as version 0', () => {
  assert.deepEqual(readDeviceIds(null), { ids: [], writable: true });
  assert.deepEqual(readDeviceIds('["a", 3, "b"]'), { ids: ['a', 'b'], writable: true });
});

test('a newer version reads as empty and is not written over', () => {
  assert.deepEqual(readDeviceIds(JSON.stringify({ version: 2, ids: ['a'] })), { ids: [], writable: false });
});

test('a damaged value reads as empty, never throws', () => {
  for (const raw of ['{', '"a"', 'null', '{"version":1,"ids":"a"}', '{"ids":["a"]}']) {
    assert.deepEqual(readDeviceIds(raw).ids, [], raw);
  }
});
