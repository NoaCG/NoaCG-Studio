// guards: scripts/measured.mjs, scripts/gates.mjs, scripts/gates-test-count.mjs
//
// The measurement rule, pinned - and pinned by SPAWNING, because what is being asserted is an
// exit code and a receipt file, and a helper that "returns an error" instead of ending the
// process would satisfy an in-process assertion while leaving the gate green. The behaviour under
// test is exactly the behaviour that was missing on 2026-09-08, so every test here is a
// reproduction of a gate that would have passed while measuring nothing.
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { ROOT, auditGates, measuresNothing, parseHeader } from './gates.mjs';

// A file:// URL, because the throwaway gate is written to the temp directory and imports the
// helper by absolute path - which Windows will not accept as a bare `C:\...` specifier.
const HELPER = pathToFileURL(path.join(ROOT, 'scripts', 'measured.mjs')).href;

/** Run a one-off gate that imports the real helper, and report what the process did. */
function runGate(body, { receipt = null } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'measured-test-'));
  const file = path.join(dir, 'gate.mjs');
  writeFileSync(file, `import { measured } from '${HELPER}';\n${body}\n`, 'utf8');
  const env = { ...process.env };
  if (receipt) env.GATE_MEASURED_FILE = path.join(dir, receipt);
  const res = spawnSync(process.execPath, [file], { encoding: 'utf8', env, windowsHide: true });
  const receiptPath = receipt ? path.join(dir, receipt) : null;
  const rows = receiptPath && existsSync(receiptPath) ? readFileSync(receiptPath, 'utf8') : null;
  rmSync(dir, { recursive: true, force: true });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr, rows };
}

test('a gate that measured something passes and says how much - on stderr, because stdout may be data', () => {
  const run = runGate("measured(502, 'catalog variants');\nconsole.log('{\"mode\":\"full\"}');");
  assert.equal(run.status, 0);
  assert.match(run.stderr, /\[measured] 502 catalog variants/);
  // ci.yml captures some gates' stdout whole and hands it to JSON.parse.
  assert.equal(run.stdout.trim(), '{"mode":"full"}');
});

test('a gate that measured NOTHING fails, and names the resolution rather than the count', () => {
  const run = runGate("measured(0, 'catalog variants');\nconsole.log('PASS');");
  assert.equal(run.status, 1, 'zero must end the process, not be reported and stepped over');
  assert.match(run.stderr, /MEASURED NOTHING/);
  assert.match(run.stderr, /constant, a file name, a marker string, a glob/);
  assert.doesNotMatch(run.stdout, /PASS/, 'nothing after the failed measurement may run');
});

test('a count that is not a whole number of things is the same failure', () => {
  for (const bad of ['undefined', 'NaN', '-1', "'12'"]) {
    const run = runGate(`measured(${bad}, 'things');`);
    assert.equal(run.status, 1, `measured(${bad}) must fail`);
  }
});

test('measured.optional lets zero through, but only behind a reason a reader can act on', () => {
  const why = 'the queue is empty whenever every item has been accepted by the owner';
  const ok = runGate(`measured.optional(0, 'queued items', ${JSON.stringify(why)});\nconsole.log('PASS');`);
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /PASS/);

  for (const thin of ['undefined', "''", "'because'"]) {
    const run = runGate(`measured.optional(0, 'queued items', ${thin});`);
    assert.equal(run.status, 1, `measured.optional with ${thin} as the reason must fail`);
    assert.match(run.stderr, /reason a reader can act on/);
  }
});

test('the receipt the runner reads carries the count, the subject and whether zero was allowed', () => {
  const why = 'the backlog is empty whenever every item has been drained into a wave';
  const run = runGate(
    `measured(3, 'rules');\nmeasured.optional(0, 'items', ${JSON.stringify(why)});`,
    { receipt: 'receipt.tsv' },
  );
  assert.equal(run.status, 0);
  assert.equal(run.rows, '3\trules\trequired\n0\titems\toptional\n');
});

test('a gate that never reports leaves no receipt at all - which is how the runner tells it apart from measuring zero', () => {
  const run = runGate("console.log('quietly fine');", { receipt: 'receipt.tsv' });
  assert.equal(run.status, 0, 'the helper cannot fail a gate that never called it - only the runner sees that');
  assert.equal(run.rows, null);
});

test('`measures: none` is read off the header, and only as an exemption with a reason', () => {
  const h = parseHeader(['// gate: build', '// measures: none - it compares two git reads for a disagreement', '// guards: **'].join('\n'));
  assert.equal(h.measures, 'none - it compares two git reads for a disagreement');
  assert.ok(measuresNothing(h));
  assert.ok(!measuresNothing(parseHeader('// gate: build')), 'a gate that says nothing is not exempt');
  assert.ok(!measuresNothing(parseHeader('// measures: none')), 'a bare `none` carries no reason, so it exempts nothing');
  assert.ok(!measuresNothing(parseHeader('// measures: catalog variants')), 'the line may only say none - <why>');
});

test('the audit refuses a gate that neither reports nor declares why it cannot', () => {
  const wired = {
    buildLine: 'node scripts/gates.mjs run && tsc && node scripts/gates.mjs run --gate after-build',
    workflowText: (name) => (name === 'ci.yml' ? 'run: node scripts/gates.mjs run --gate factory\n' : null),
    tracked: ['scripts/blind.mjs', 'scripts/x.test.mjs'],
    tests: [{ kind: 'test', name: 'scripts/x.test.mjs', entry: 'scripts/x.test.mjs', header: parseHeader('// gate: build'), derivedGuards: ['scripts/blind.mjs'] }],
  };
  const check = (text) => [{
    kind: 'check', name: 'check:blind', names: ['check:blind'], entry: 'scripts/blind.mjs', exists: true,
    header: parseHeader(text),
  }];

  const blind = auditGates({ ...wired, checks: check('// gate: build\n// guards: scripts/blind.mjs'), read: () => 'console.log("ok");' });
  assert.equal(blind.filter((p) => p.includes('never says how much it measured')).length, 1);

  // An import is not a call: a gate can name the helper and never reach it, and for the checks at
  // `workflow` and `none` tiers nothing runs the receipt half of the rule.
  const imported = auditGates({ ...wired, checks: check('// gate: build\n// guards: scripts/blind.mjs'), read: () => "import { measured } from './measured.mjs';\nconsole.log('ok');" });
  assert.equal(imported.filter((p) => p.includes('never says how much it measured')).length, 1);

  const reports = auditGates({ ...wired, checks: check('// gate: build\n// guards: scripts/blind.mjs'), read: () => "import { measured } from './measured.mjs';\nmeasured(files.length, 'files');" });
  assert.deepEqual(reports, []);

  const exempt = auditGates({
    ...wired,
    checks: check('// gate: build\n// guards: scripts/blind.mjs\n// measures: none - it detects a disagreement between two reads, never a population'),
    read: () => 'console.log("ok");',
  });
  assert.deepEqual(exempt, []);

  const thin = auditGates({ ...wired, checks: check('// gate: build\n// guards: scripts/blind.mjs\n// measures: none - not yet'), read: () => 'console.log("ok");' });
  assert.equal(thin.filter((p) => p.includes('without a reason a reader can act on')).length, 1);
});

test('an empty test population is a problem, because the runner used to answer it with exit 0', () => {
  const problems = auditGates({
    checks: [], tests: [], tracked: ['package.json'],
    buildLine: 'node scripts/gates.mjs run && tsc && node scripts/gates.mjs run --gate after-build',
    workflowText: (name) => (name === 'ci.yml' ? 'run: node scripts/gates.mjs run --gate factory\n' : null),
  });
  assert.equal(problems.filter((p) => p.includes('would run no tests at all and still pass')).length, 1);
});

test('the test-count reporter counts each file, and a file that registered no tests is absent from its receipt', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'measured-tests-'));
  const has = path.join(dir, 'has.test.mjs');
  const none = path.join(dir, 'none.test.mjs');
  writeFileSync(has, "import test from 'node:test';\nfor (const n of [1, 2]) test(`case ${n}`, () => {});\n", 'utf8');
  // The blind shape: the cases come from a list that resolved to nothing.
  writeFileSync(none, "import test from 'node:test';\nfor (const n of []) test(`case ${n}`, () => {});\n", 'utf8');
  const counts = path.join(dir, 'counts.tsv');
  // NODE_TEST_CONTEXT is set for every process the outer test runner spawns, and it makes a
  // nested `node --test` report to its parent instead of running its own reporters. Dropping it
  // is what lets this test drive the real runner rather than a mock of it.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const res = spawnSync(process.execPath, [
    '--test',
    '--test-reporter=./scripts/gates-test-count.mjs', `--test-reporter-destination=${counts}`,
    has, none,
  ], { cwd: ROOT, encoding: 'utf8', env, windowsHide: true });
  const rows = readFileSync(counts, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
  rmSync(dir, { recursive: true, force: true });

  assert.equal(res.status, 0, 'node --test itself is green over both files - that is the whole problem');
  const named = rows.map(([, file]) => path.basename(file));
  assert.ok(named.includes('has.test.mjs'), 'the file that ran tests is counted');
  assert.ok(!named.includes('none.test.mjs'), 'the file that ran none reports no per-file summary, so the runner sees it as zero');
  assert.equal(rows.find(([, file]) => file.endsWith('has.test.mjs'))[0], '2');
});
