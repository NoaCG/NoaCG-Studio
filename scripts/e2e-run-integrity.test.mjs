// guards: playwright.config.ts, playwright.catalog.config.ts, playwright.live.config.ts, playwright.production.config.ts
//
// The run-integrity reporter, driven the way Playwright drives it, with the disk STUBBED: a full
// disk is simulated by a statfs that reports almost nothing free and by an ENOSPC write error,
// never by filling a real one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import RunIntegrity, { DISK_FLOOR_BYTES, mentionsEnospc, runProblems } from './e2e-run-integrity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roomy = () => ({ bavail: 50 * 1024 ** 2, bsize: 4096 }); // 200 GB free
const full = () => ({ bavail: 10, bsize: 4096 });

const fakeTest = (results) => ({ results });
function run({ tests, statfs = roomy, mode = 'test', status = 'passed', feed = () => {} }) {
  const reporter = new RunIntegrity({ _mode: mode, statfs });
  reporter.onBegin({ rootDir: root }, { allTests: () => tests });
  feed(reporter);
  const errors = [];
  const original = console.error;
  console.error = (line) => errors.push(String(line));
  try {
    return { verdict: reporter.onEnd({ status }), printed: errors.join('\n') };
  } finally {
    console.error = original;
  }
}

test('a complete run on a roomy disk keeps its own status', () => {
  const { verdict } = run({ tests: [fakeTest([{ status: 'passed' }]), fakeTest([{ status: 'skipped' }])] });
  assert.equal(verdict, undefined);
});

test('an ENOSPC write error turns a passing run into a failed one, and says why last', () => {
  const enospc = { message: "ENOSPC: no space left on device, write 'test-results/trace.zip'" };
  for (const feed of [
    (r) => r.onError(enospc),
    (r) => r.onTestEnd(fakeTest([]), { errors: [enospc] }),
    (r) => r.onStdErr(Buffer.from('Error: ENOSPC: no space left on device')),
  ]) {
    const { verdict, printed } = run({ tests: [fakeTest([{ status: 'passed' }])], feed });
    assert.deepEqual(verdict, { status: 'failed' });
    assert.match(printed, /NOT A VERDICT[\s\S]*ENOSPC/);
  }
});

test('a planned test that never reported a result means the run was cut short', () => {
  const { verdict, printed } = run({ tests: [fakeTest([{ status: 'passed' }]), fakeTest([])] });
  assert.deepEqual(verdict, { status: 'failed' });
  assert.match(printed, /1 of 2 planned test\(s\) never reported a result/);
});

test('a disk under the floor at the end is not a verdict, whatever the tests said', () => {
  const { verdict, printed } = run({ tests: [fakeTest([{ status: 'passed' }])], statfs: full });
  assert.deepEqual(verdict, { status: 'failed' });
  assert.match(printed, /MB is free on the disk the run writes to/);
});

test('a run that already failed, a listing and a merge are left alone', () => {
  assert.equal(run({ tests: [fakeTest([])], statfs: full, status: 'failed' }).verdict, undefined);
  assert.equal(run({ tests: [fakeTest([])], mode: 'list' }).verdict, undefined);
  assert.equal(run({ tests: [fakeTest([])], mode: 'merge' }).verdict, undefined);
});

test('an unreadable disk is not a problem by itself, and the floor is a real number', () => {
  const unreadable = () => { throw new Error('EPERM'); };
  assert.equal(run({ tests: [fakeTest([{ status: 'passed' }])], statfs: unreadable }).verdict, undefined);
  assert.ok(DISK_FLOOR_BYTES > 0);
  assert.deepEqual(runProblems({ planned: 1, unreported: 0, enospc: false, free: DISK_FLOOR_BYTES }), []);
  assert.equal(mentionsEnospc({ message: 'Timed out 5000ms' }), false);
  // Linux's inotify limit borrows the code; the disk is fine.
  assert.equal(mentionsEnospc('Error: ENOSPC: System limit for number of file watchers reached'), false);
});

test('every Playwright config wires the reporter in', () => {
  for (const config of ['playwright.config.ts', 'playwright.catalog.config.ts', 'playwright.live.config.ts', 'playwright.production.config.ts']) {
    assert.match(readFileSync(path.join(root, config), 'utf8'), /scripts\/e2e-run-integrity\.mjs/, config);
  }
});
