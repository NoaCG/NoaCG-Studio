// guards: src/blocks/templateInsert.ts, src/templates/shared/stageFit.ts
// Every staged catalog design carries the stage-fit runtime outside its animation region.
// "Add template graphic" treats that runtime as shared scaffold only when each of its
// functions is on SCAFFOLD_FUNCTIONS; a missing name disables every staged design's card.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('every stage-fit runtime function is allowed as insert scaffold', () => {
  const stageFit = read('../src/templates/shared/stageFit.ts');
  const runtime = [...stageFit.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1]);
  assert.ok(runtime.length > 5, 'found the stage-fit runtime functions');
  const insert = read('../src/blocks/templateInsert.ts');
  const set = insert.match(/const SCAFFOLD_FUNCTIONS = new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(set, 'found SCAFFOLD_FUNCTIONS');
  const allowed = new Set([...set[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
  assert.deepEqual(runtime.filter((n) => !allowed.has(n)), []);
});
