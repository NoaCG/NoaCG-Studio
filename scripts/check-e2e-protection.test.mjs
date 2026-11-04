// guards: scripts/check-e2e-protection.mjs, scripts/alarm-owner.mjs, scripts/growth-ceilings.json, docs/work-specs/e2e-suite-budget/spec.md
// Coverage leaves the gate only with a current maintenance entry: what the check counts as removed
// protection (tests counted by Playwright, so a looped test counts), what it lets through, and
// which entries cover a spec (owned, justified, not expired).
import assert from 'node:assert/strict';
import test from 'node:test';

import { ENTRY_MAX_DAYS, TIMEOUT_CEILING_MS, configFor, countReport, deletedSpecs, entryProblem, findings, parseMaintenance, readDiff, refusalMessage, renamedSpecs, verdict } from './check-e2e-protection.mjs';

const TODAY = '2026-11-04';
const OWNER = { today: TODAY, ownerLogin: 'miwco' };
const diff = (file, body, { deleted = false } = {}) => [`diff --git a/${file} b/${file}`, deleted ? 'deleted file mode 100644' : 'index 1..2 100644', `--- a/${file}`, `+++ b/${file}`, '@@ -1,3 +1,3 @@', ...body].join('\n');

test('fewer runtime tests, unconditional skips and raised timeouts are findings; conditional skips and added tests are not', () => {
  const files = readDiff([
    diff('e2e/a.spec.ts', ['-test(\'one\', async () => {});']),
    diff('e2e/b.spec.ts', ['+  test.skip(true, OLD_EDITOR_SKIP);', '+  skipOldEditor();']),
    diff('e2e/c.spec.ts', ['+  test.skip(!haveCreds, \'needs a backend\');', '+test(\'three\', async () => {});']),
    diff('e2e/d.spec.ts', ['+  test.setTimeout(360_000);', '+  test.slow();']),
    diff('e2e/configured/e.spec.ts', ['+  test.setTimeout(300000);']),
  ].join('\n'));
  const counts = new Map([['e2e/a.spec.ts', { before: 5, after: 3 }], ['e2e/c.spec.ts', { before: 1, after: 2 }], ['e2e/b.spec.ts', { before: 4, after: 4 }]]);
  const found = findings(files, [], counts);
  assert.deepEqual(found.get('e2e/a.spec.ts'), ['2 test(s) fewer than before (5 -> 3, counted by playwright --list)']);
  assert.equal(found.get('e2e/b.spec.ts').length, 2);
  assert.equal(found.has('e2e/c.spec.ts'), false, 'a conditional skip and an added test remove nothing');
  assert.deepEqual(found.get('e2e/d.spec.ts'), [
    `a per-test timeout of 360000 ms is added, above the gate's ${TIMEOUT_CEILING_MS} ms ceiling`,
    `test.slow() is added (three times the default, above the gate's ${TIMEOUT_CEILING_MS} ms ceiling)`,
  ]);
  assert.equal(found.has('e2e/configured/e.spec.ts'), false, 'the timeout ceiling is the offline gate\'s, not the configured suite\'s');
});

test('a deleted spec file is a finding, from the diff header or from name-status; a rename inside e2e/ maps to its old path', () => {
  const files = readDiff(diff('e2e/gone.spec.ts', ['-test(\'x\', async () => {});'], { deleted: true }));
  assert.deepEqual(findings(files).get('e2e/gone.spec.ts'), ['the spec file is deleted']);
  const status = 'D\te2e/gone.spec.ts\nM\te2e/kept.spec.ts\nR100\te2e/old.spec.ts\tdocs/research/old.spec.ts\nR090\te2e/x.spec.ts\te2e/y.spec.ts';
  assert.deepEqual(deletedSpecs(status), ['e2e/gone.spec.ts', 'e2e/old.spec.ts']);
  assert.deepEqual([...renamedSpecs(status)], [['e2e/y.spec.ts', 'e2e/x.spec.ts']]);
  assert.deepEqual(findings(new Map(), ['e2e/gone.spec.ts']).get('e2e/gone.spec.ts'), ['the spec file is deleted or moved out of e2e/']);
});

test('files outside e2e/ and non-spec files are ignored', () => {
  const files = readDiff([diff('src/x.ts', ['-test(\'not a spec\')']), diff('e2e/_create.ts', ['+  test.skip(true, OLD_EDITOR_SKIP);'])].join('\n'));
  assert.equal(files.size, 0);
});

test('each spec is listed under the config that runs it, and a JSON listing is counted per file, nested suites and all', () => {
  assert.equal(configFor('e2e/configured/x.spec.ts'), 'playwright.live.config.ts');
  assert.equal(configFor('e2e/catalog/x.spec.ts'), 'playwright.catalog.config.ts');
  assert.equal(configFor('e2e/x.spec.ts'), 'playwright.config.ts');
  const report = { config: { rootDir: '/r/e2e' }, suites: [
    { file: 'a.spec.ts', specs: [{ file: 'a.spec.ts', tests: [{}] }, { file: 'a.spec.ts', tests: [{}] }], suites: [{ file: 'a.spec.ts', specs: [{ file: 'a.spec.ts', tests: [{}] }] }] },
    { file: 'sub/b.spec.ts', specs: [{ file: 'sub/b.spec.ts', tests: [{}] }] },
  ] };
  assert.deepEqual([...countReport(report, '/r')], [['e2e/a.spec.ts', 3], ['e2e/sub/b.spec.ts', 1]]);
});

test('an entry needs a justification, the accountable owner and an expiry within the window; legacy lines are kept but cover nothing', () => {
  const md = ['# Spec', '', '## Test maintenance', '',
    '- 2026-10-12 e2e/old-walk.spec.ts: group and ungroup kept by editor-groups journeys; receipt evidence/groups.md',
    '- `e2e/current.spec.ts`: retired with the old editor surface; editor-x keeps the walk, owner miwco, expires 2026-11-20',
    '- e2e/lapsed.spec.ts: moved to unit tests, owner miwco, expires 2026-11-01',
    '- e2e/far.spec.ts: moved to unit tests, owner miwco, expires 2027-01-01',
    '- e2e/agent.spec.ts: moved to unit tests, owner claude, expires 2026-11-20',
    '- e2e/bare.spec.ts: -, owner miwco, expires 2026-11-20',
    '- not a spec line', '', '## Budget exceptions', '', '- e2e/budget.spec.ts: 3 min, protects x, expires 2026-11-20'].join('\n');
  const entries = parseMaintenance(md).map((e) => ({ ...e, from: 'docs/work-specs/x/spec.md' }));
  assert.deepEqual(entries.map((e) => e.spec), ['e2e/old-walk.spec.ts', 'e2e/current.spec.ts', 'e2e/lapsed.spec.ts', 'e2e/far.spec.ts', 'e2e/agent.spec.ts', 'e2e/bare.spec.ts']);
  assert.deepEqual(entries.map((e) => entryProblem(e, OWNER)), [
    'it has no owner and expiry',
    null,
    'it expired on 2026-11-01',
    `its expiry 2027-01-01 is more than ${ENTRY_MAX_DAYS} days after today (2026-11-04)`,
    'its owner "claude" is not the accountable owner (miwco, scripts/growth-ceilings.json)',
    'it gives no justification (what stays protected and by what)',
  ]);
  assert.equal(entryProblem(entries[1], { ...OWNER, today: '2026-11-20' }), null, 'an entry still counts on its expiry day');
  assert.equal(entryProblem(entries[1], { ...OWNER, today: '2026-11-21' }), 'it expired on 2026-11-20', 'and not the day after');

  const found = new Map(['e2e/old-walk.spec.ts', 'e2e/current.spec.ts', 'e2e/lapsed.spec.ts', 'e2e/budget.spec.ts', 'e2e/sub/current.spec.ts'].map((s) => [s, ['1 test(s) fewer than before (2 -> 1, counted by playwright --list)']]));
  const v = verdict(found, entries, OWNER);
  assert.deepEqual(v.allowed.map((a) => a.spec), ['e2e/current.spec.ts']);
  assert.deepEqual(v.refused.map((r) => r.spec), ['e2e/old-walk.spec.ts', 'e2e/lapsed.spec.ts', 'e2e/budget.spec.ts', 'e2e/sub/current.spec.ts'], 'legacy and expired lines, budget exceptions and a same-named file elsewhere cover nothing');
});

test('an expired entry fails with a message naming the entry, its expiry and what to write', () => {
  const entry = { spec: 'e2e/lapsed.spec.ts', text: 'x', justification: 'moved to unit tests', owner: 'miwco', expires: '2026-11-01', from: 'docs/work-specs/x/spec.md' };
  const { refused } = verdict(new Map([['e2e/lapsed.spec.ts', ['1 test(s) fewer than before (2 -> 1, counted by playwright --list)']]]), [entry], OWNER);
  const message = refusalMessage(refused[0], OWNER);
  assert.match(message, /^e2e\/lapsed\.spec\.ts: 1 test\(s\) fewer than before/);
  assert.match(message, /The entry for it in docs\/work-specs\/x\/spec\.md does not count: it expired on 2026-11-01\./);
  assert.match(message, /Restore the protection, or/);
  assert.match(message, /"- e2e\/lapsed\.spec\.ts: <what stays protected and by what; receipt>, owner miwco, expires <a date from 2026-11-04 to 2026-12-04>"/);
});
