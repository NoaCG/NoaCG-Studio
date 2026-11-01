// guards: scripts/e2e-contracts.mjs, scripts/e2e-lists.mjs, e2e/*.spec.ts, e2e/configured/*.spec.ts
// The D2 contract map and the critical set (cicd-improvement ci07, evidence/phase-ci07.md Rules K1
// to K5): each Rule line has one test named after it, plus the audit over the real repository.
import assert from 'node:assert/strict';
import test from 'node:test';

import { auditContracts, CONTRACTS, criticalBudget, criticalSpecs, readMinutes } from './e2e-contracts.mjs';
import { CONFIGURED_HEADERS, FOCUS, parseSpecHeader, SPEC_HEADERS } from './e2e-lists.mjs';

const header = (focus, critical) => ({ focus, critical, covers: [], none: null });
const contract = (over = {}) => ({ id: 'c1', title: 'C', proof: 'p', defects: [], layers: ['browser'], checks: [{ path: 'e2e/a.spec.ts', layer: 'browser' }], cadence: '', detection: '', gaps: [], ...over });
const yes = () => true;

test('the real repository: the map and every header agree, and the critical set sits inside the shared-change set', () => {
  assert.deepEqual(auditContracts({ headers: SPEC_HEADERS }), []);
  const critical = criticalSpecs(SPEC_HEADERS);
  assert.ok(critical.length >= CONTRACTS.filter((c) => !c.backend).length, 'one journey per offline contract at least');
  for (const spec of critical) assert.ok(FOCUS.includes(spec), `${spec} is critical and in the shared-change set`);
  assert.equal(CONTRACTS.length, 6, 'the six D2 contracts');
  // Configured specs are never critical journeys: the offline set is what every product change runs.
  for (const [spec, h] of CONFIGURED_HEADERS) assert.deepEqual(h.critical, [], `configured/${spec}`);
});

test('Rule K1: a spec is critical only by its own `critical:` line; a malformed line or an unknown contract fails', () => {
  assert.deepEqual(parseSpecHeader('// focus\n// critical: site-entry, graphics-runtime\ntest();').critical, ['site-entry', 'graphics-runtime']);
  assert.deepEqual(parseSpecHeader('// focus\ntest();\n// critical: site-entry').critical, [], 'below the header is not a declaration');
  assert.deepEqual(parseSpecHeader('// Critical journeys keep this spec honest\ntest();').critical, [], 'prose is left alone');
  for (const bad of ['// critical', '// critical: ', '// critical - site-entry', '// critical: Site Entry', '// critical: site-entry,']) {
    assert.throws(() => parseSpecHeader(`${bad}\ntest();`, 'e2e/x.spec.ts'), /critical: <contract>/, bad);
  }
  const problems = auditContracts({ contracts: [contract()], headers: new Map([['a.spec.ts', header(true, ['c1', 'nope'])]]), exists: yes });
  assert.deepEqual(problems, ['e2e/a.spec.ts is critical for `nope`, which is not a contract in scripts/e2e-contracts.mjs']);
});

test('Rule K2: a critical journey outside the shared-change set fails, so every escalation still plans it', () => {
  const ok = auditContracts({ contracts: [contract()], headers: new Map([['a.spec.ts', header(true, ['c1'])]]), exists: yes });
  assert.deepEqual(ok, []);
  const problems = auditContracts({ contracts: [contract()], headers: new Map([['a.spec.ts', header(false, ['c1'])]]), exists: yes });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /not in the shared-change set/);
});

test('Rule K3: every faithful layer has a check, and a mapped check missing from disk fails', () => {
  const headers = new Map([['a.spec.ts', header(true, ['c1'])]]);
  const gone = auditContracts({ contracts: [contract()], headers, exists: () => false });
  assert.deepEqual(gone, ['c1: e2e/a.spec.ts is not on disk - a mapped check is removed only with this map changed']);
  const noLayer = auditContracts({ contracts: [contract({ layers: ['browser', 'node'] })], headers, exists: yes });
  assert.deepEqual(noLayer, ['c1: no check at its faithful layer `node`']);
  const badLayer = auditContracts({ contracts: [contract({ checks: [{ path: 'e2e/a.spec.ts', layer: 'browser' }, { path: 'x.mjs', layer: 'unit' }] })], headers, exists: yes });
  assert.deepEqual(badLayer, ['c1: x.mjs names an unknown layer `unit`']);
});

test('Rule K4: a contract with no critical journey needs a complete backend exception whose configured specs exist', () => {
  const none = new Map();
  assert.deepEqual(auditContracts({ contracts: [contract()], headers: none, exists: yes }), ['c1: no critical journey and no backend exception']);
  const backend = { specs: ['grants.spec.ts'], runs: 'selected on triggered PRs, full per landing', why: 'needs a real database' };
  assert.deepEqual(auditContracts({ contracts: [contract({ backend })], headers: none, exists: yes }), []);
  assert.deepEqual(auditContracts({ contracts: [contract({ backend: { ...backend, why: '' } })], headers: none, exists: yes }), ['c1: a backend exception names its configured specs, where they run and why']);
  const missing = auditContracts({ contracts: [contract({ backend })], headers: none, exists: (p) => p !== 'e2e/configured/grants.spec.ts' });
  assert.deepEqual(missing, ['c1: backend exception names e2e/configured/grants.spec.ts, which is not on disk']);
  // The real map's one exception is access and durability, carried by existing configured specs.
  assert.deepEqual(CONTRACTS.filter((c) => c.backend).map((c) => c.id), ['access-durability']);
});

test('Rule K5: the critical set is measured against 5 minutes; unmeasured is never 0 and over the target removes nothing', () => {
  const within = criticalBudget(['a.spec.ts', 'b.spec.ts'], { 'a.spec.ts': 1.5, 'b.spec.ts': 2 });
  assert.equal(within.minutes, 3.5);
  assert.equal(within.over, false);
  const unmeasured = criticalBudget(['a.spec.ts', 'b.spec.ts'], { 'a.spec.ts': 1.5 });
  assert.deepEqual(unmeasured.unmeasured, ['b.spec.ts']);
  assert.match(unmeasured.text, /1 unmeasured \(b\.spec\.ts\): the total is a lower bound/);
  const over = criticalBudget(['a.spec.ts', 'b.spec.ts'], { 'a.spec.ts': 3, 'b.spec.ts': 2.5 });
  assert.equal(over.over, true);
  assert.match(over.text, /never met by removing a journey/);
  assert.equal(over.minutes, 5.5, 'every member still counted');
});

test('the critical set today, reported from the committed durations table (never refused for being unmeasured)', (t) => {
  const today = criticalBudget(criticalSpecs(SPEC_HEADERS), readMinutes());
  t.diagnostic(today.text);
  assert.ok(today.minutes > 0);
});
