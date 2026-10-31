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

// ── ci05: a selected spec cannot disappear (cicd-improvement P1b, AC-4) ──────────
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { expectedSpecs, missingSpecs } from './e2e-run-integrity.mjs';

const located = (file, results = [{ status: 'passed' }]) => ({ results, location: { file: path.join(root, 'e2e', file) } });

test('ci05: a spec the plan selected that planned no test fails a passing run, and says which', () => {
  assert.deepEqual(expectedSpecs(' a.spec.ts\nb.spec.ts,./c.spec.ts '), ['a.spec.ts', 'b.spec.ts', 'c.spec.ts']);
  assert.deepEqual(missingSpecs(['a.spec.ts', 'foo.spec.ts'], [path.join(root, 'e2e/a.spec.ts'), path.join(root, 'e2e/other-foo.spec.ts')]), ['foo.spec.ts'],
    'a name matches whole trailing segments, not a suffix of another file');
  const reporter = new RunIntegrity({ _mode: 'test', statfs: roomy, expected: 'a.spec.ts b.spec.ts' });
  reporter.onBegin({ rootDir: root }, { allTests: () => [located('a.spec.ts')] });
  const errors = [];
  const original = console.error;
  console.error = (line) => errors.push(String(line));
  try {
    assert.deepEqual(reporter.onEnd({ status: 'passed' }), { status: 'failed' });
  } finally {
    console.error = original;
  }
  assert.match(errors.join('\n'), /1 selected spec file\(s\) planned no test, so they never ran: b\.spec\.ts[\s\S]*test\.only/);
  // Every expected file present (one only skipped) keeps the run's own status; no list is no check.
  const complete = new RunIntegrity({ _mode: 'test', statfs: roomy, expected: 'a.spec.ts b.spec.ts' });
  complete.onBegin({ rootDir: root }, { allTests: () => [located('a.spec.ts'), located('b.spec.ts', [{ status: 'skipped' }])] });
  assert.equal(complete.onEnd({ status: 'passed' }), undefined);
  assert.equal(run({ tests: [located('a.spec.ts')] }).verdict, undefined);
});

test('ci05: every Playwright config CI runs forbids a focused test there', () => {
  for (const config of ['playwright.config.ts', 'playwright.catalog.config.ts', 'playwright.live.config.ts', 'playwright.production.config.ts', 'playwright.endurance.config.ts']) {
    assert.match(readFileSync(path.join(root, config), 'utf8'), /^\s*forbidOnly: Boolean\(process\.env\.CI\),$/m, config);
  }
});

// The probes run real Playwright (no browser: the tests take no page) over a scratch directory
// under the ignored test-results/, through the repository's own reporter, and for discovery with
// the real playwright.config.ts's `forbidOnly`. No focused test is committed: the probe writes it.
test('ci05: discovery and verdict probes - a focused or vanished selected spec cannot pass', () => {
  const cli = path.join(path.dirname(createRequire(import.meta.url).resolve('@playwright/test/package.json')), 'cli.js');
  mkdirSync(path.join(root, 'test-results'), { recursive: true });
  const dir = mkdtempSync(path.join(root, 'test-results', 'ci05-probe-'));
  const reporter = path.join(root, 'scripts', 'e2e-run-integrity.mjs').replaceAll('\\', '/');
  try {
    // Discovery loads the real config (a listing, which a cloud worker's admission allows); the
    // verdict probe runs tests, so it takes the repository's reporter on a config of its own with
    // forbidOnly off, as a local run has it.
    const own = `testDir: '.', workers: 1, reporter: [['line'], [${JSON.stringify(reporter)}]], outputDir: './out'`;
    writeFileSync(path.join(dir, 'discovery.config.ts'), `import real from '../../playwright.config.ts';\nexport default { ${own}, forbidOnly: real.forbidOnly };\n`);
    writeFileSync(path.join(dir, 'verdict.config.ts'), `export default { ${own}, forbidOnly: false };\n`);
    const spec = (name, focus = false) =>
      writeFileSync(path.join(dir, name), `import { test } from '@playwright/test';\ntest${focus ? '.only' : ''}('${name}', () => {});\n`);
    spec('a.spec.ts');
    spec('b.spec.ts', true);
    spec('c.spec.ts');
    const pw = (args, env, config = 'verdict.config.ts') => {
      const r = spawnSync(process.execPath, [cli, 'test', '-c', config, ...args], {
        cwd: dir, encoding: 'utf8', timeout: 120_000, windowsHide: true,
        env: { ...process.env, CI: '', NOACG_E2E_EXPECTED_SPECS: '', ...env },
      });
      return { status: r.status, out: `${r.stdout}\n${r.stderr}` };
    };

    // Discovery on CI: the real config's forbidOnly refuses the focused test before anything runs.
    const listed = pw(['--list'], { CI: '1' }, 'discovery.config.ts');
    assert.notEqual(listed.status, 0, listed.out);
    assert.match(listed.out, /forbidOnly|focused item/i, listed.out);

    // Verdict where forbidOnly is off (a local run): b's test.only filters a and c out, Playwright
    // passes what is left, and the reporter refuses it for the two selected files that vanished.
    const focused = pw([], { NOACG_E2E_EXPECTED_SPECS: 'a.spec.ts b.spec.ts c.spec.ts' });
    assert.notEqual(focused.status, 0, focused.out);
    assert.match(focused.out, /2 selected spec file\(s\) planned no test, so they never ran: a\.spec\.ts, c\.spec\.ts/, focused.out);

    // A selected file the filters no longer reach (renamed, or a filter gone wrong) fails the same way.
    const gone = pw(['a.spec.ts', 'c.spec.ts'], { NOACG_E2E_EXPECTED_SPECS: 'a.spec.ts c.spec.ts renamed.spec.ts' });
    assert.notEqual(gone.status, 0, gone.out);
    assert.match(gone.out, /never ran: renamed\.spec\.ts/, gone.out);

    // Control: the same files, all present, pass.
    const control = pw(['a.spec.ts', 'c.spec.ts'], { NOACG_E2E_EXPECTED_SPECS: 'a.spec.ts c.spec.ts' });
    assert.equal(control.status, 0, control.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  // And nothing focused is committed: the scratch directory is gone and git sees no change from it.
  assert.equal(execFileSync('git', ['status', '--porcelain', '--', 'test-results'], { cwd: root, encoding: 'utf8' }), '');
});
