// guards: scripts/gates.mjs, scripts/check-gate-coverage.mjs, package.json
//
// The discovery and the audit, pinned - and pinned for the reason the audit exists. Every
// failure mode here is silent by construction: a runner that quietly drops a test file, or an
// audit that reports OK over a gate that declares nothing, is indistinguishable from one where
// every gate has a home. The rules are driven with literal scripts, headers and file lists; the
// last test runs the real repository through its own audit.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { ROOT, TIERS, auditGates, discoverChecks, discoverTests, entryPointsOf, guardsHit, guardsOf, parseHeader, relativeImports, testFilesOnDisk } from './gates.mjs';

const workflows = (map) => (name) => (Object.hasOwn(map, name) ? map[name] : null);

test('a header is read for its tier, its workflow, its reason, its guards and its needs', () => {
  const h = parseHeader(['#!/usr/bin/env node', '// gate: workflow weekly-audit.yml', '// guards: src/assets/**, docs/X.md', '// needs: browser', '//', '// prose'].join('\n'));
  assert.deepEqual(h, { gate: 'workflow', workflow: 'weekly-audit.yml', reason: null, guards: ['src/assets/**', 'docs/X.md'], needs: ['browser'] });
  assert.deepEqual(parseHeader('// gate: none - reports, never gates\n').reason, 'reports, never gates');
  assert.deepEqual(parseHeader('import x from "y";\n'), { gate: null, workflow: null, reason: null, guards: [], needs: [] });
  // Only the header counts: a `gate:` line deep in the body is prose.
  assert.equal(parseHeader(`${'//\n'.repeat(100)}// gate: build\n`).gate, null);
});

test('checks are the gate-shaped scripts whose entry is a script, and a composite of other scripts is not judged twice', () => {
  const scripts = {
    build: 'node scripts/gates.mjs run',
    'check:a': 'node scripts/check-a.mjs',
    'check:b': 'node scripts/b.mjs --check',
    'check:both': 'node scripts/check-a.mjs && node scripts/b.mjs --check',
    'test:file': 'node --test scripts/x.test.mjs',
    'test:e2e': 'playwright test',
    'test:wrapped': 'node scripts/wait.mjs --wait && playwright test',
    dev: 'vite',
  };
  const read = (file) => (file === 'scripts/missing.mjs' ? null : '// gate: build\n// guards: src/**\n');
  const checks = discoverChecks(scripts, read);
  assert.deepEqual(checks.map((c) => c.name), ['check:a', 'check:b', 'test:wrapped']);
  assert.equal(checks[0].entry, 'scripts/check-a.mjs');
  assert.equal(checks[2].entry, 'scripts/wait.mjs', 'a wrapper is judged by the script it runs; playwright itself has no entry');
});

test('a test file is a build gate by default, a browser need moves it to the factory, and its guards are what it imports plus its sibling', () => {
  const files = ['scripts/plain.test.mjs', 'scripts/browser.test.mjs', 'scripts/gates.test.mjs'];
  const read = (file) => {
    if (file === 'scripts/browser.test.mjs') return "// needs: browser\nimport { x } from './e2e-durations.mjs';\n";
    if (file === 'scripts/gates.test.mjs') return "// guards: package.json\nimport { y } from './gates.mjs';\n";
    return 'import test from "node:test";\n';
  };
  const tests = discoverTests(read, files);
  assert.equal(tests[0].header.gate, 'build');
  assert.deepEqual(guardsOf(tests[0]), [], 'no sibling, no import, no header: nothing guards it - the audit says so');
  assert.equal(tests[1].header.gate, 'factory');
  assert.deepEqual(guardsOf(tests[1]), ['scripts/e2e-durations.mjs']);
  assert.deepEqual(guardsOf(tests[2]).sort(), ['package.json', 'scripts/gates.mjs']);
});

test('relative imports resolve to repo paths and only to files that exist', () => {
  const found = relativeImports('scripts/x.test.mjs', "import a from './gates.mjs';\nimport b from './nope.mjs';\nconst c = await import('./check-gate-coverage.mjs');\n");
  assert.deepEqual(found, ['scripts/check-gate-coverage.mjs', 'scripts/gates.mjs']);
});

test('the audit refuses a missing tier, an unknown tier, a workflow that does not name the gate, a reason-less none, and a guard that matches nothing', () => {
  const tracked = ['package.json', 'src/a.ts', 'scripts/check-x.mjs', 'scripts/check-y.mjs'];
  const mk = (name, entry, header) => ({ kind: 'check', name, entry, exists: true, header: parseHeader(header) });
  const checks = [
    mk('check:x', 'scripts/check-x.mjs', '// guards: src/**\n'),
    mk('check:y', 'scripts/check-y.mjs', '// gate: nightly\n// guards: src/**\n'),
    mk('check:z', 'scripts/check-z.mjs', '// gate: workflow ci.yml\n// guards: src/**\n'),
    mk('check:w', 'scripts/check-w.mjs', '// gate: workflow gone.yml\n// guards: src/**\n'),
    mk('check:n', 'scripts/check-n.mjs', '// gate: none - later\n// guards: src/**\n'),
    mk('check:g', 'scripts/check-g.mjs', '// gate: build\n// guards: src/nothing/**\n'),
    mk('check:e', 'scripts/check-e.mjs', '// gate: build\n'),
    mk('check:ab', 'scripts/check-ab.mjs', '// gate: after-build\n// guards: package.json\n'),
  ];
  const problems = auditGates({ checks, tests: [], tracked, workflowText: workflows({ 'ci.yml': 'run: npm run check:other\n' }), buildLine: 'node scripts/gates.mjs run' });
  const has = (re) => assert.ok(problems.some((p) => re.test(p)), `expected a problem matching ${re}\n${problems.join('\n')}`);
  has(/"check:x".*declares no tier/);
  has(/"check:y".*gate: nightly.*not one of/);
  has(/"check:z".*names neither `npm run check:z` nor scripts\/check-z\.mjs/);
  has(/"check:w".*gone\.yml.*does not exist/);
  has(/"check:n".*without a reason/);
  has(/"check:g".*src\/nothing\/\*\*.*matches no tracked file/);
  has(/"check:e".*declares no guards/);
  has(/"check:ab".*build line does not name/);
  assert.equal(problems.length, 8, problems.join('\n'));
});

test('an honest declaration passes, in every tier', () => {
  const tracked = ['package.json', 'src/a.ts', 'scripts/check-a.mjs', 'scripts/b.mjs', 'scripts/b.test.mjs', '.github/workflows/ci.yml'];
  const mk = (name, entry, header) => ({ kind: 'check', name, entry, exists: true, header: parseHeader(header) });
  const checks = [
    mk('check:a', 'scripts/check-a.mjs', '// gate: build\n// guards: src/**\n'),
    mk('check:c', 'scripts/c.mjs', '// gate: workflow ci.yml\n// guards: src/a.ts\n'),
    mk('check:n', 'scripts/n.mjs', '// gate: none - reports what a design costs and never gates\n// guards: **\n'),
    mk('check:l', 'scripts/l.mjs', '// gate: after-build\n// guards: package.json\n'),
  ];
  const tests = [{ kind: 'test', name: 'scripts/b.test.mjs', entry: 'scripts/b.test.mjs', exists: true, header: { ...parseHeader(''), gate: 'build' }, derivedGuards: ['scripts/b.mjs'] }];
  const problems = auditGates({ checks, tests, tracked, workflowText: workflows({ 'ci.yml': 'run: npm run check:c\n' }), buildLine: 'node scripts/gates.mjs run && node scripts/l.mjs' });
  assert.deepEqual(problems, []);
});

test('a check file with no check: script is a check nobody can run by name', () => {
  const problems = auditGates({ checks: [], tests: [], tracked: ['scripts/check-orphan.mjs', 'scripts/check-orphan.test.mjs'], workflowText: workflows({}), buildLine: '' });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /scripts\/check-orphan\.mjs is a check with no `check:` script/);
});

test('guards reach changed paths by glob, by exact path, and by directory prefix; ** reaches everything', () => {
  assert.equal(guardsHit(['src/**'], ['src/a/b.ts']), true);
  assert.equal(guardsHit(['src/a.ts'], ['src/a.ts']), true);
  assert.equal(guardsHit(['docs/**'], ['src/a.ts']), false);
  assert.equal(guardsHit(['**'], ['anything']), true);
  assert.equal(guardsHit(['*'], ['README.md']), true);
  assert.equal(guardsHit(['*'], ['src/README.md']), false);
  assert.equal(guardsHit([], ['src/a.ts']), false);
});

test('entryPointsOf finds dotted test filenames and cli scripts, which a naive pattern misses', () => {
  assert.deepEqual(entryPointsOf('node --test scripts/hooks/guard-question.test.mjs'), ['scripts/hooks/guard-question.test.mjs']);
  assert.deepEqual(entryPointsOf('node cli/scripts/build-skill.mjs --check'), ['cli/scripts/build-skill.mjs']);
  assert.deepEqual(entryPointsOf('playwright test'), []);
});

test('the tiers are the five the header may name', () => {
  assert.deepEqual(TIERS, ['build', 'factory', 'after-build', 'workflow', 'none']);
});

test('the real repository passes its own audit, discovers every test file on disk, and the build line names the runner', () => {
  const scripts = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts;
  assert.match(scripts.build, /^node scripts\/gates\.mjs run && /, 'the build line starts with discovery and enumerates no test file');
  assert.ok(!/\.test\.mjs/.test(scripts.build), 'no test file is named on the build line any more');
  const files = testFilesOnDisk();
  assert.ok(files.includes('scripts/gates.test.mjs'));
  assert.ok(files.every((f) => f.endsWith('.test.mjs') && f.startsWith('scripts/')));
  const tests = discoverTests();
  assert.equal(tests.length, files.length);
  const checks = discoverChecks(scripts);
  assert.ok(checks.some((c) => c.name === 'check:gate-coverage' && c.header.gate === 'build'));
});
