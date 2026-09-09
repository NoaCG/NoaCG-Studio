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

import { ROOT, auditGates, emptyPopulation, measuredArguments, measuresNothing, parseHeader, runTests } from './gates.mjs';
import { parseReceipts, receiptRow } from './measured-receipt.mjs';

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

// A repository that is honest about everything except what the test at hand is asking: one test
// file in each tier that has to hold some, and a gate body that reports what it measured.
const WIRED = {
  buildLine: 'node scripts/gates.mjs run && tsc && node scripts/gates.mjs run --gate after-build',
  workflowText: (name) => (name === 'ci.yml' ? 'run: node scripts/gates.mjs run --gate factory\n' : null),
  tracked: ['scripts/blind.mjs', 'scripts/x.test.mjs', 'scripts/f.test.mjs'],
  tests: [
    { kind: 'test', name: 'scripts/x.test.mjs', entry: 'scripts/x.test.mjs', header: parseHeader('// gate: build'), derivedGuards: ['scripts/blind.mjs'] },
    { kind: 'test', name: 'scripts/f.test.mjs', entry: 'scripts/f.test.mjs', header: { ...parseHeader('// needs: browser'), gate: 'factory' }, derivedGuards: ['scripts/blind.mjs'] },
  ],
};

test('the audit refuses a gate that neither reports nor declares why it cannot', () => {
  const wired = WIRED;
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

// ---------------------------------------------------------------------------------------------
// The holes four reviews found in the mechanism the night it landed. Each test below is the
// reproduction first: the shape that passed on 2026-09-08, asserted to fail now.
// ---------------------------------------------------------------------------------------------

/** One check with the given header and body, audited in an otherwise honest repository. */
const auditOne = (header, body) => auditGates({
  ...WIRED,
  checks: [{ kind: 'check', name: 'check:blind', names: ['check:blind'], entry: 'scripts/blind.mjs', exists: true, header: parseHeader(header) }],
  read: () => body,
});
const HONEST = '// gate: build\n// guards: scripts/blind.mjs';

test('the runner and the audit read an exemption with ONE reader, so a thin reason exempts nobody', () => {
  // The hole: the audit wanted 20 characters of reason, `measuresNothing` wanted one. A gate
  // carrying `measures: none - x` was exempt to the runner and a failure to the audit - and three
  // gates (type-floor, overflow-sweep, field-coverage) run straight from workflows, where only the
  // weaker of the two readings is in force.
  const thin = parseHeader('// measures: none - x');
  assert.equal(measuresNothing(thin), false, 'a reason too thin for the audit cannot exempt the gate from the receipt');
  assert.equal(auditOne(`${HONEST}\n// measures: none - x`, 'console.log("ok");').filter((p) => p.includes('without a reason a reader can act on')).length, 1);

  // A malformed line exempts nothing either: the failure direction is always "still measured".
  assert.equal(measuresNothing(parseHeader('// measures: catalog variants')), false);
  const malformed = auditOne(`${HONEST}\n// measures: catalog variants`, 'console.log("ok");');
  assert.equal(malformed.filter((p) => p.includes('may only say')).length, 1);
  assert.equal(malformed.filter((p) => p.includes('never says how much it measured')).length, 0, 'one problem per gate, naming the line that is wrong');

  const real = '// measures: none - it compares two reads of the same table for a disagreement';
  assert.equal(measuresNothing(parseHeader(real)), true);
  assert.deepEqual(auditOne(`${HONEST}\n${real}`, 'console.log("ok");'), []);
});

test('a tier that holds no gates is refused by property, not by being called `build`', () => {
  // The hole: the refusal was `if (tier !== 'build') return 0`. The factory tier holds five
  // browser test files and is run by CI; one header rename would have emptied it, printed a
  // notice and exited 0 - the type-floor bug, one tier over.
  assert.equal(runTests([], 'factory'), 1, 'an empty factory tier is a broken filter, not a pass');
  assert.equal(runTests([], 'build'), 1);
  assert.equal(runTests([], 'after-build'), 0, 'after-build holds checks over dist/, and says so in EMPTY_TIERS');
  assert.equal(emptyPopulation('factory', 'checks', 0).fatal, false, 'no check: script declares the factory tier, and that is written down');
  assert.equal(emptyPopulation('build', 'checks', 0).fatal, true);
  assert.equal(emptyPopulation('factory', 'tests', 5), null);

  // And the audit asks it at build time, where an emptied factory tier is otherwise invisible
  // until a CI job on another machine runs the tier that no longer exists.
  const audited = (tests) => auditGates({ ...WIRED, tests, checks: [], read: () => '' });
  assert.equal(audited(WIRED.tests.filter((t) => t.header.gate === 'build')).filter((p) => /no test file declares `gate: factory`/.test(p)).length, 1);
  assert.deepEqual(audited(WIRED.tests), []);
  const stale = audited([...WIRED.tests, { ...WIRED.tests[0], name: 'scripts/late.test.mjs', header: { ...parseHeader(''), gate: 'after-build' } }]);
  assert.equal(stale.filter((p) => /EMPTY_TIERS says the after-build tier/.test(p)).length, 1, 'an exemption that has stopped being true is itself a problem');

  // Both kinds, both directions - a stale exemption over CHECKS would otherwise sit unread until
  // a rename emptied that tier for real and the runner printed the stale reason as a notice.
  const factoryCheck = auditGates({
    ...WIRED,
    checks: [{ kind: 'check', name: 'check:f', names: ['check:f'], entry: 'scripts/blind.mjs', exists: true, header: parseHeader('// gate: factory\n// guards: scripts/blind.mjs\n// measures: none - it drives a browser and asserts on one rendered page') }],
    read: () => '',
  });
  assert.equal(factoryCheck.filter((p) => /EMPTY_TIERS says the factory tier holds no checks/.test(p)).length, 1);
});

test('the static scan wants an import and a call outside a comment, and refuses a count that cannot be zero', () => {
  const blind = (body) => auditOne(HONEST, body).filter((p) => p.includes('never says how much it measured')).length;
  // The hole: the audit tested for the SUBSTRING `measured.mjs` and a `measured(` anywhere in the
  // file, so a sentence about the helper, in a comment, with no import, satisfied both halves.
  assert.equal(blind("// measured.mjs: we should call measured( ) on the variants here one day\nconsole.log('ok');"), 1);
  assert.equal(blind("import { measured } from './measured.mjs';\n// measured(files.length, 'files') - once this reads the catalog\n"), 1, 'a call written only in a comment is not a call');
  assert.equal(blind("measured(files.length, 'files');\n"), 1, 'a call to something this file never imported measures nothing');
  assert.equal(blind("import { measured } from './measured.mjs';\nmeasured(files.length, 'files');"), 0);

  // A count that cannot come out zero is not a measurement, however honestly it is reported.
  const counts = (arg) => auditOne(HONEST, `import { measured } from './measured.mjs';\nmeasured(${arg}, 'files');`).filter((p) => p.includes('measured('));
  assert.match(counts('items.length || 1')[0], /fallback to a non-zero count/);
  assert.match(counts('items.length ?? 1')[0], /fallback to a non-zero count/);
  assert.match(counts('Math.max(1, items.length)')[0], /flooring the count at one/);
  assert.match(counts('1')[0], /literal count is not a measurement/);
  assert.deepEqual(counts('items.length'), []);
  // `?? 0` is the honest form of the same reach, and keeps the empty case failing.
  assert.deepEqual(counts('[a, b].reduce((total, rules) => total + (rules?.length ?? 0), 0)'), []);
  assert.deepEqual(measuredArguments("measured(a.length, 'a');\nmeasured.optional(b.length, 'b', why);"), ['a.length', 'b.length']);

  // A COUNT THIS CANNOT READ IS NOT A COUNT IT GUESSES AT. A bracket walk cannot see that
  // `split('(')` holds a quoted bracket, so the walk would run past the call and quote unrelated
  // lines back at an honest gate. An unreadable argument is `null` - still a call, never judged.
  assert.deepEqual(measuredArguments("measured(text.split('(').length, 'segments');\nconst n = Math.max(1, other.length);\n"), [null]);
  assert.deepEqual(counts("text.split('(').length"), [], 'a quoted bracket fails no gate');
  assert.equal(blind("import { measured } from './measured.mjs';\nmeasured(text.split('(').length, 'segments');"), 0, 'and it still counts as a call');

  // WHAT REMAINS OPEN, on the record rather than in a claim the code does not keep: no reading of
  // the text can say whether a call is REACHED. This one passes the audit, and the runner sees a
  // receipt of 1 rather than the zero that would have failed. Both halves together catch a gate
  // that reports NOTHING; neither catches a gate that reports something it did not look at.
  assert.equal(blind("import { measured } from './measured.mjs';\nif (nothing) measured(items.length, 'items');"), 0);
});

test('one module owns the receipt format, so both writers and the reader cannot drift apart', () => {
  // The hole: `measured.mjs` and `gates-test-count.mjs` each spelled `\t` themselves and
  // `gates.mjs` split on it, so a subject holding a tab quietly became a fourth column - and a
  // receipt the reader drops reads to the runner as a gate that measured nothing.
  const rows = parseReceipts(receiptRow(3, 'rules\tin\nthe store') + receiptRow(0, 'items', true));
  assert.deepEqual(rows, [
    { count: 3, subject: 'rules in the store', optional: false },
    { count: 0, subject: 'items', optional: true },
  ]);
  assert.deepEqual(parseReceipts('7\ttoo\tmany\tcolumns\nnot a receipt at all\n'), [], 'a row that is not a receipt is dropped, which fails the gate rather than inventing a count');

  // Both writers are this function, which is the only reason the reader can be one function.
  const written = readFileSync(path.join(ROOT, 'scripts', 'gates-test-count.mjs'), 'utf8');
  assert.match(written, /receiptRow\(/);
  assert.doesNotMatch(written, /\\t/, 'the reporter no longer spells the delimiter');
  assert.doesNotMatch(readFileSync(path.join(ROOT, 'scripts', 'measured.mjs'), 'utf8'), /appendFileSync/, 'the helper no longer writes the row itself');
  // The name of the variable the receipt travels through is part of that format: the runner sets
  // it and the writer reads it, so the two have to be the same string by construction.
  const runner = readFileSync(path.join(ROOT, 'scripts', 'gates.mjs'), 'utf8');
  assert.match(runner, /\[RECEIPT_ENV]: receiptFile/);
  assert.doesNotMatch(runner, /GATE_MEASURED_FILE/, 'only measured-receipt.mjs names the variable');
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
