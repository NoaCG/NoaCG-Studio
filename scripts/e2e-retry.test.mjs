// Which files the retry re-runs, read off a Playwright JSON report. The shape is the reporter's
// (suites nest, specs carry tests, tests carry a final `status`), and the two traps e2e/AGENTS.md
// names are the cases: `ok` says nothing about a skipped spec, and a spec that passed after a
// retry is `flaky`, not `unexpected`.
import assert from 'node:assert/strict';
import test from 'node:test';

import { failedSpecFiles } from './e2e-retry.mjs';

const spec = (file, status) => ({ file, ok: status === 'expected', tests: [{ status }] });

test('only specs whose final verdict is unexpected are named, once per file, sorted', () => {
  const report = {
    suites: [
      { file: 'e2e/b.spec.ts', specs: [spec('e2e/b.spec.ts', 'unexpected'), spec('e2e/b.spec.ts', 'expected')] },
      { file: 'e2e/a.spec.ts', specs: [spec('e2e/a.spec.ts', 'expected')], suites: [{ file: 'e2e/a.spec.ts', specs: [spec('e2e/a.spec.ts', 'unexpected')] }] },
      { file: 'e2e/c.spec.ts', specs: [spec('e2e/c.spec.ts', 'skipped'), spec('e2e/c.spec.ts', 'flaky')] },
    ],
  };
  assert.deepEqual(failedSpecFiles(report), ['e2e/a.spec.ts', 'e2e/b.spec.ts']);
});

test('paths are normalized to the repo-relative e2e/ form whatever the reporter wrote', () => {
  const report = { suites: [{ file: 'e2e\\x.spec.ts', specs: [spec('e2e\\x.spec.ts', 'unexpected')] }, { file: 'y.spec.ts', specs: [{ tests: [{ status: 'unexpected' }] }] }] };
  assert.deepEqual(failedSpecFiles(report), ['e2e/x.spec.ts', 'e2e/y.spec.ts']);
});

test('an empty or malformed report names nothing rather than crashing', () => {
  assert.deepEqual(failedSpecFiles({}), []);
  assert.deepEqual(failedSpecFiles({ suites: [{}] }), []);
  assert.deepEqual(failedSpecFiles(null), []);
});
