// The evidence limit on hand-written contracts: which lines count, and that growth and
// shrinkage are reported apart.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compare, evidenceLines } from './check-contract-evidence.mjs';

test('a line counts when it carries a date, a run id or a measurement', () => {
  const text = [
    'A rule with no evidence at all.',
    'Measured 2026-09-06, the corpus was large.',
    'Run 33905531739 went red on the ninth shard.',
    'The chain has 8,364 bytes free.',
    'Another plain rule.\nStill the same paragraph, 4 KB in it.',
    '- a bullet dated 2026-09-01\n- a bullet dated 2026-09-02',
    'A quarter is 40% of it.',
  ].join('\n\n');
  assert.equal(evidenceLines(text).length, 7);
  assert.equal(evidenceLines('nothing here\r\n\r\nor here').length, 0);
});

test('compare reports growth and shrinkage separately and ignores unchanged files', () => {
  const baseline = { 'AGENTS.md': 10, 'e2e/AGENTS.md': 3, 'src/x/AGENTS.md': 1 };
  const actual = { 'AGENTS.md': 11, 'e2e/AGENTS.md': 3, 'src/y/AGENTS.md': 2 };
  const { grew, shrank } = compare(baseline, actual);
  assert.deepEqual(grew, [
    { file: 'AGENTS.md', was: 10, now: 11 },
    { file: 'src/y/AGENTS.md', was: 0, now: 2 },
  ]);
  assert.deepEqual(shrank, [{ file: 'src/x/AGENTS.md', was: 1, now: 0 }]);
  assert.deepEqual(compare(baseline, baseline), { grew: [], shrank: [] });
});
