// guards: src/backend/assets.ts
//
// The two ways Supabase Storage can refuse an asset once the capacity ceilings of migration 0039
// are in force, and how we describe them to a person.
//
// The error shapes below are not invented: they were captured from the live project on 2026-08-12
// by uploading a 9 MB file (per-file limit) and by uploading while the account was over its quota
// (both the insert and the upsert path). That is the whole point of this test - the classifier
// matches on `statusCode`, and if a future Storage release moves the code or rewords the message,
// the app silently goes back to showing "new row violates row-level security policy" to a user.
// A pinned shape turns that into a failed build.
//
// The module is TypeScript and imports nothing, so the test transpiles the REAL FILE and imports
// the result - the same technique as scripts/join-name.test.mjs, for the same reason.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = readFileSync(fileURLToPath(new URL('../src/backend/assets.ts', import.meta.url)), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { classifyAssetRefusal } = await import(`data:text/javascript,${encodeURIComponent(js)}`);

/** Exactly what @supabase/storage-js hands back, fields and all. */
const TOO_LARGE = {
  name: 'StorageApiError',
  message: 'The object exceeded the maximum allowed size',
  status: 400,
  statusCode: '413',
};
const OVER_QUOTA = {
  name: 'StorageApiError',
  message: 'new row violates row-level security policy',
  status: 400,
  statusCode: '403',
};

test('a file over the per-file limit is named as such, and never re-sent', () => {
  const refusal = classifyAssetRefusal(TOO_LARGE);
  assert.ok(refusal, 'the per-file refusal must be classified');
  assert.match(refusal.reason, /larger than the cloud accepts/);
  assert.ok(refusal.fix.length > 0, 'a refusal a person can fix must say how');
  // The same bytes are refused every time, so the caller may cache it and skip the upload.
  assert.equal(refusal.permanent, true);
});

test('an account over its quota is named as such, and stays retryable', () => {
  const refusal = classifyAssetRefusal(OVER_QUOTA);
  assert.ok(refusal, 'the quota refusal must be classified');
  assert.match(refusal.reason, /out of cloud storage/);
  // Deleting anything frees space, so this one must NOT be cached as permanent.
  assert.equal(refusal.permanent, false);
});

test('the raw policy text never reaches a person', () => {
  const refusal = classifyAssetRefusal(OVER_QUOTA);
  assert.doesNotMatch(refusal.reason, /row-level security/i);
  assert.doesNotMatch(refusal.fix, /row-level security/i);
});

test('a transient failure is left alone for the ordinary retry', () => {
  // Anything that is not one of the two ceilings must classify as null, or the sync engine would
  // stop retrying failures that a retry would in fact fix.
  assert.equal(classifyAssetRefusal({ message: 'Failed to fetch' }), null);
  assert.equal(classifyAssetRefusal({ message: 'Internal Server Error', status: 500, statusCode: '500' }), null);
  assert.equal(classifyAssetRefusal(null), null);
  assert.equal(classifyAssetRefusal(undefined), null);
  assert.equal(classifyAssetRefusal('boom'), null);
});

test('the message is matched too, so a dropped statusCode is not a silent regression', () => {
  assert.ok(classifyAssetRefusal({ message: TOO_LARGE.message }), 'per-file refusal by message alone');
  assert.ok(classifyAssetRefusal({ message: OVER_QUOTA.message }), 'quota refusal by message alone');
});
