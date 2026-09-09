// guards: scripts/gates.mjs, scripts/check-gate-coverage.mjs, package.json, .github/workflows/ci.yml
//
// The discovery and the audit, pinned - and pinned for the reason the audit exists. Every
// failure mode here is silent by construction: a runner that quietly drops a test file, or an
// audit that reports OK over a gate that declares nothing, is indistinguishable from one where
// every gate has a home. The rules are driven with literal scripts, headers and file lists; the
// last test runs the real repository through the real audit.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { ROOT, audit, auditGates, discoverChecks, discoverTests, entryPointsOf, guardsHit, guardsOf, matchesGuard, parseHeader, relativeImports, testFilesOnDisk, tierMechanisms } from './gates.mjs';

const workflows = (map) => (name) => (Object.hasOwn(map, name) ? map[name] : null);
const WIRED = { buildLine: 'node scripts/gates.mjs run && tsc && node scripts/gates.mjs run --gate after-build', ci: 'run: node scripts/gates.mjs run --gate factory\n' };
const mk = (name, entry, header) => ({ kind: 'check', name, names: [name], entry, exists: true, header: parseHeader(header) });
// The audit fixtures below are about TIERS and GUARDS. Each hands the audit a gate body that
// already reports what it measured, and one test file, so the measurement rules stay out of their
// counts; those rules have their own tests in scripts/measured.test.mjs.
const REPORTS = () => "import { measured } from './measured.mjs';\nmeasured(files.length, 'files');";
// One test file per tier that is required to hold some: an empty tier is itself a problem now
// (`EMPTY_TIERS`), so a fixture about tiers and guards has to model a repository with both.
const tierTests = (guard) => [
  { kind: 'test', name: 'scripts/b.test.mjs', entry: 'scripts/b.test.mjs', exists: true, header: { ...parseHeader(''), gate: 'build' }, derivedGuards: [guard] },
  { kind: 'test', name: 'scripts/f.test.mjs', entry: 'scripts/f.test.mjs', exists: true, header: { ...parseHeader('// needs: browser'), gate: 'factory' }, derivedGuards: [guard] },
];

test('a header is read for its tier, its workflow, its reason, its guards and its needs - from the leading comment block only', () => {
  const h = parseHeader(['#!/usr/bin/env node', '// gate: workflow weekly-audit.yml', '// guards: src/assets/**, docs/X.md', '// needs: browser', '//', '// prose'].join('\n'));
  assert.deepEqual(h, { gate: 'workflow', workflow: 'weekly-audit.yml', reason: null, guards: ['src/assets/**', 'docs/X.md'], needs: ['browser'], measures: null });
  assert.deepEqual(parseHeader('// gate: none - reports, never gates\n').reason, 'reports, never gates');
  assert.deepEqual(parseHeader('import x from "y";\n'), { gate: null, workflow: null, reason: null, guards: [], needs: [], measures: null });
  // A `gate:` after the first line of code is prose, however long the header before it.
  assert.equal(parseHeader(`${'// prose\n'.repeat(100)}// gate: build\n`).gate, 'build', 'a long header is still the header');
  assert.equal(parseHeader('import a from "b";\n// gate: build\n').gate, null, 'a declaration below the code is not honoured');
});

test('checks are judged once per entry file, a composite of other scripts adds nothing, and a file-less script is reported for the workflow rule', () => {
  const scripts = {
    build: 'node scripts/gates.mjs run',
    'check:a': 'node scripts/check-a.mjs',
    'check:b': 'node scripts/b.mjs --check',
    'check:both': 'node scripts/check-a.mjs && node scripts/b.mjs --check',
    'test:e2e:affected': 'node scripts/e2e-affected.mjs',
    'test:e2e:focus': 'node scripts/e2e-affected.mjs --focus',
    'test:file': 'node --test scripts/x.test.mjs',
    'test:e2e': 'playwright test',
    'test:wrapped': 'node scripts/wait.mjs --wait && playwright test',
    dev: 'vite',
  };
  const read = () => '// gate: build\n// guards: src/**\n';
  const { checks, entryless } = discoverChecks(scripts, read);
  assert.deepEqual(checks.map((c) => [c.entry, c.names, c.command]), [
    ['scripts/check-a.mjs', ['check:a', 'check:both'], 'node scripts/check-a.mjs'],
    ['scripts/b.mjs', ['check:b', 'check:both'], 'node scripts/b.mjs --check'],
    ['scripts/e2e-affected.mjs', ['test:e2e:affected', 'test:e2e:focus'], 'node scripts/e2e-affected.mjs'],
    ['scripts/wait.mjs', ['test:wrapped'], 'node scripts/wait.mjs'],
  ]);
  assert.deepEqual(entryless.map((s) => s.name), ['test:e2e'], 'a bare playwright suite has no header to carry');
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

test('relative imports are read off import statements, resolve to repo paths, and only to files that exist', () => {
  const text = [
    "import a from './gates.mjs';",
    "import b from './nope.mjs';",
    "const c = await import('./check-gate-coverage.mjs');",
    "const fixture = \"import { x } from './e2e-durations.mjs';\"; // a string, not an import",
  ].join('\n');
  assert.deepEqual(relativeImports('scripts/x.test.mjs', text), ['scripts/check-gate-coverage.mjs', 'scripts/gates.mjs']);
});

test('the audit refuses a missing tier, an unknown tier, a browser need in the build tier, a workflow that does not name the gate, a reason-less none, and a guard that matches nothing', () => {
  const tracked = ['package.json', 'src/a.ts', 'scripts/check-x.mjs', 'scripts/check-y.mjs'];
  const checks = [
    mk('check:x', 'scripts/check-x.mjs', '// guards: src/**\n'),
    mk('check:y', 'scripts/check-y.mjs', '// gate: nightly\n// guards: src/**\n'),
    mk('check:z', 'scripts/check-z.mjs', '// gate: workflow ci.yml\n// guards: src/**\n'),
    mk('check:w', 'scripts/check-w.mjs', '// gate: workflow gone.yml\n// guards: src/**\n'),
    mk('check:n', 'scripts/check-n.mjs', '// gate: none - later\n// guards: src/**\n'),
    mk('check:g', 'scripts/check-g.mjs', '// gate: build\n// guards: src/nothing/**\n'),
    mk('check:e', 'scripts/check-e.mjs', '// gate: build\n'),
    mk('check:c', 'scripts/check-c.mjs', '// gate: build\n// needs: browser\n// guards: src/**\n'),
  ];
  const problems = auditGates({ checks, tests: tierTests('package.json'), tracked, read: REPORTS, workflowText: workflows({ 'ci.yml': `run: npm run check:other\n${WIRED.ci}` }), buildLine: WIRED.buildLine });
  const has = (re) => assert.ok(problems.some((p) => re.test(p)), `expected a problem matching ${re}\n${problems.join('\n')}`);
  has(/"check:x".*declares no tier/);
  has(/"check:y".*gate: nightly.*not one of/);
  has(/"check:z".*names neither `npm run check:z` nor scripts\/check-z\.mjs/);
  has(/"check:w".*gone\.yml.*does not exist/);
  has(/"check:n".*without a reason/);
  has(/"check:g".*src\/nothing\/\*\*.*matches no file/);
  has(/"check:e".*declares no guards/);
  has(/"check:c".*needs: browser.*build tier has no browser/);
  assert.equal(problems.length, 8, problems.join('\n'));
});

test('an honest declaration passes, in every tier, and a composite\'s second name counts for the workflow rule', () => {
  const tracked = ['package.json', 'src/a.ts', 'scripts/check-a.mjs', 'scripts/b.mjs', 'scripts/b.test.mjs', '.github/workflows/ci.yml'];
  const checks = [
    mk('check:a', 'scripts/check-a.mjs', '// gate: build\n// guards: src/**\n'),
    { ...mk('check:c', 'scripts/c.mjs', '// gate: workflow ci.yml\n// guards: src/a.ts\n'), names: ['check:c', 'check:all'] },
    mk('check:n', 'scripts/n.mjs', '// gate: none - reports what a design costs and never gates\n// guards: **\n'),
    mk('check:l', 'scripts/l.mjs', '// gate: after-build\n// guards: package.json\n'),
  ];
  const problems = auditGates({ checks, tests: tierTests('scripts/b.mjs'), tracked, read: REPORTS, workflowText: workflows({ 'ci.yml': `run: npm run check:all\n${WIRED.ci}` }), buildLine: WIRED.buildLine });
  assert.deepEqual(problems, []);
});

test('a script with no file must be named by a workflow, and a header no script reaches is refused', () => {
  const base = { checks: [], tests: tierTests('scripts/orphan.mjs'), tracked: ['scripts/orphan.mjs', 'scripts/b.test.mjs'], workflowText: workflows({ 'ci.yml': WIRED.ci }), buildLine: WIRED.buildLine };
  const unnamed = auditGates({ ...base, entryless: [{ kind: 'script', name: 'test:e2e:catalog', command: 'playwright test --config=x' }], allWorkflowText: 'run: npm run test:e2e\n' });
  assert.equal(unnamed.length, 1);
  assert.match(unnamed[0], /"test:e2e:catalog" runs no script file.*none does/);
  const named = auditGates({ ...base, entryless: [{ kind: 'script', name: 'test:e2e:catalog', command: 'playwright test' }], allWorkflowText: 'run: npm run test:e2e:catalog\n' });
  assert.deepEqual(named, []);
  const orphan = auditGates({ ...base, scriptFiles: ['scripts/orphan.mjs', 'scripts/plain.mjs'], read: (f) => (f === 'scripts/orphan.mjs' ? '// gate: build\n' : 'export const x = 1;\n') });
  assert.equal(orphan.length, 1);
  assert.match(orphan[0], /scripts\/orphan\.mjs declares `gate: build` but no check: or test: script names it/);
});

test('each runnable tier has one mechanism, checked once', () => {
  assert.deepEqual(tierMechanisms({ buildLine: WIRED.buildLine, ciText: WIRED.ci }), []);
  const none = tierMechanisms({ buildLine: 'tsc', ciText: '' });
  assert.equal(none.length, 3);
  assert.match(none[0], /build tier has no mechanism/);
  assert.match(none[1], /after-build tier has no mechanism/);
  assert.match(none[2], /factory tier has no mechanism/);
  assert.equal(tierMechanisms({ buildLine: 'node scripts/gates.mjs run --gate factory && node scripts/gates.mjs run --gate after-build', ciText: WIRED.ci }).length, 1, 'a build line whose first runner call names another tier has no build tier');
});

test('one matcher answers every guard question: glob, exact path, and ** for everything', () => {
  assert.equal(matchesGuard('src/a/b.ts', 'src/**'), true);
  assert.equal(matchesGuard('src/a.ts', 'src/a.ts'), true);
  assert.equal(matchesGuard('src/a.ts', 'docs/**'), false);
  assert.equal(matchesGuard('anything', '**'), true);
  assert.equal(matchesGuard('README.md', '*'), true);
  assert.equal(matchesGuard('src/README.md', '*'), false);
  assert.equal(matchesGuard('AGENTS.md', '**/AGENTS.md'), true);
  assert.equal(guardsHit(['docs/**', 'src/a.ts'], ['src/a.ts']), true);
  assert.equal(guardsHit([], ['src/a.ts']), false);
});

test('entryPointsOf finds dotted test filenames and cli scripts, which a naive pattern misses', () => {
  assert.deepEqual(entryPointsOf('node --test scripts/hooks/guard-question.test.mjs'), ['scripts/hooks/guard-question.test.mjs']);
  assert.deepEqual(entryPointsOf('node cli/scripts/build-skill.mjs --check'), ['cli/scripts/build-skill.mjs']);
  assert.deepEqual(entryPointsOf('playwright test'), []);
});

test('the real repository passes the real audit, discovers every test file on disk, and the build line names the runner and no test', () => {
  const scripts = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts;
  assert.match(scripts.build, /^node scripts\/gates\.mjs run && /, 'the build line starts with discovery');
  assert.ok(!/\.test\.mjs/.test(scripts.build), 'no test file is named on the build line any more');
  const files = testFilesOnDisk();
  assert.ok(files.includes('scripts/gates.test.mjs'));
  assert.ok(files.every((f) => f.endsWith('.test.mjs') && f.startsWith('scripts/')));
  const { problems, checks, tests } = audit();
  assert.deepEqual(problems, []);
  assert.equal(tests.length, files.length);
  assert.ok(checks.some((c) => c.entry === 'scripts/check-gate-coverage.mjs' && c.header.gate === 'build'));
});
