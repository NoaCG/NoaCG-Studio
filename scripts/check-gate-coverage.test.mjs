// The gate-coverage guard's RULES, pinned - and pinned for the reason the guard itself exists.
// Every failure mode here is silent by construction: a guard that reports OK over a gate nobody
// runs is indistinguishable from one where every gate has a home, which is exactly the state the
// repo was in on 2026-09-06 when a wave landed red.
//
// `auditGateCoverage` is pure, so the rules are driven with literal package.json and workflow
// text - no repository state, no fixtures on disk.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { auditGateCoverage, entryPointsOf, gateNames, EXEMPT } from './check-gate-coverage.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

test('a gate the build runs is covered', () => {
  const scripts = {
    build: 'node scripts/check-thing.mjs && tsc',
    'check:thing': 'node scripts/check-thing.mjs',
  };
  assert.deepEqual(auditGateCoverage({ scripts, workflowText: '', exempt: {} }), []);
});

test('a gate a workflow names is covered', () => {
  const scripts = { build: 'tsc', 'test:thing': 'node --test scripts/thing.test.mjs' };
  const workflowText = '      - run: npm run test:thing\n';
  assert.deepEqual(auditGateCoverage({ scripts, workflowText, exempt: {} }), []);
});

test('a gate a workflow runs by its script PATH is covered', () => {
  const scripts = { build: 'tsc', 'check:thing': 'node scripts/check-thing.mjs' };
  const workflowText = '      - run: node scripts/check-thing.mjs\n';
  assert.deepEqual(auditGateCoverage({ scripts, workflowText, exempt: {} }), []);
});

test('a gate nothing runs is a problem that names the two ways out', () => {
  const scripts = { build: 'tsc', 'check:orphan': 'node scripts/orphan.mjs' };
  const problems = auditGateCoverage({ scripts, workflowText: '', exempt: {} });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"check:orphan" is run by nothing/);
  assert.match(problems[0], /EXEMPT/);
});

test('THE REGRESSION: a gate that needs a browser, so is outside the build, still needs a home', () => {
  // This is the shape of `test:use-case-search` on 2026-09-06 - the gate that would have caught
  // the occasion widening the credits vocabulary, sitting outside the build because it needs
  // Chromium, and named by no workflow. Nine hours and one red landing.
  const scripts = { build: 'tsc', 'test:use-case-search': 'node --test scripts/use-case-search.test.mjs' };
  const problems = auditGateCoverage({ scripts, workflowText: 'npm run check:catalog-emit\n', exempt: {} });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /test:use-case-search/);
});

test('an exemption with a reason silences it; an empty reason does not', () => {
  const scripts = { build: 'tsc', 'check:orphan': 'node scripts/orphan.mjs' };
  assert.deepEqual(
    auditGateCoverage({ scripts, workflowText: '', exempt: { 'check:orphan': 'reports, never gates' } }),
    [],
  );
  const empty = auditGateCoverage({ scripts, workflowText: '', exempt: { 'check:orphan': '   ' } });
  assert.equal(empty.length, 1);
  assert.match(empty[0], /empty reason/);
});

test('an exemption for a script that no longer exists is a problem', () => {
  const problems = auditGateCoverage({
    scripts: { build: 'tsc' },
    workflowText: '',
    exempt: { 'check:deleted': 'it used to need a secret' },
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /not a script in package.json any more/);
});

test('an exemption for a gate that HAS been wired up since is a problem', () => {
  // The list rots the moment it can carry an entry that is no longer true.
  const problems = auditGateCoverage({
    scripts: { build: 'tsc', 'check:thing': 'node scripts/check-thing.mjs' },
    workflowText: 'npm run check:thing\n',
    exempt: { 'check:thing': 'nothing runs it' },
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /runs it now - delete the entry/);
});

test('a wrapper is credited only when EVERY script it runs has a home', () => {
  // A `:queued` wrapper chains the machine-wide queue wait onto the real runner. Crediting it
  // for the half CI runs would exempt the half CI cannot run at all.
  const scripts = {
    build: 'tsc',
    'test:thing:queued': 'node scripts/queue-wait.mjs --wait && node scripts/thing.mjs',
  };
  const workflowText = 'node scripts/thing.mjs\n';
  const problems = auditGateCoverage({ scripts, workflowText, exempt: {} });
  assert.equal(problems.length, 1, 'the queue wait has no CI home, so the wrapper is not covered');
});

test('only check: and test: scripts are judged', () => {
  const scripts = { build: 'tsc', dev: 'vite', lint: 'eslint .', 'record:thing': 'node scripts/thing.mjs' };
  assert.deepEqual(auditGateCoverage({ scripts, workflowText: '', exempt: {} }), []);
  assert.deepEqual(gateNames(scripts), []);
});

test('entryPointsOf finds dotted test filenames, which a naive pattern misses', () => {
  assert.deepEqual(entryPointsOf('node --test scripts/hooks/guard-question.test.mjs'), [
    'scripts/hooks/guard-question.test.mjs',
  ]);
  assert.deepEqual(entryPointsOf('playwright test'), []);
});

test('every EXEMPT entry carries a reason a reader can act on', () => {
  for (const [name, reason] of Object.entries(EXEMPT)) {
    assert.ok(reason && reason.trim().length > 20, `"${name}" needs a real reason, got "${reason}"`);
    assert.doesNotMatch(reason, /not wired|todo|later/i, `"${name}" gives a delay, not a reason`);
  }
});

test('the real repository passes its own guard', () => {
  const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts;
  const dir = new URL('../.github/workflows/', import.meta.url);
  const workflowText = readdirSync(dir)
    .filter((name) => name.endsWith('.yml'))
    .map((name) => readFileSync(new URL(name, dir), 'utf8'))
    .join('\n');
  assert.deepEqual(auditGateCoverage({ scripts, workflowText }), []);
  assert.ok(ROOT.length > 0);
});
