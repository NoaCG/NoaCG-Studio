// guards: scripts/check-e2e-protection.mjs, scripts/alarm-owner.mjs, scripts/growth-ceilings.json, docs/work-specs/e2e-suite-budget/spec.md
// Coverage leaves the gate only with a current maintenance entry: what the check counts as removed
// protection (tests counted by Playwright, so a looped test counts), what it lets through, and
// which entries cover a spec (owned, justified, not expired).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { CONFIGS, listingEnv, ENTRY_MAX_DAYS, TIMEOUT_CEILING_MS, broadens, configFor, parseList, deletedSpecs, entryProblem, findings, parseMaintenance, readDiff, refusalMessage, renamedSpecs, verdict } from './check-e2e-protection.mjs';

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

test('a deleted spec file is a finding, read from name-status; a rename inside e2e/ maps to its old path', () => {
  const status = 'D\te2e/gone.spec.ts\nM\te2e/kept.spec.ts\nR100\te2e/old.spec.ts\tdocs/research/old.spec.ts\nR090\te2e/x.spec.ts\te2e/y.spec.ts';
  assert.deepEqual(deletedSpecs(status), ['e2e/gone.spec.ts', 'e2e/old.spec.ts']);
  assert.deepEqual([...renamedSpecs(status)], [['e2e/y.spec.ts', 'e2e/x.spec.ts']]);
  assert.deepEqual(findings(new Map(), ['e2e/gone.spec.ts']).get('e2e/gone.spec.ts'), ['the spec file is deleted or moved out of e2e/']);
  assert.deepEqual(deletedSpecs('R100\te2e/old name.spec.ts\tdocs/old name.spec.ts'), ['e2e/old name.spec.ts'], 'a path with a space is one path');
});

test('a move into another suite is a finding, a move inside one is not, and a count drop is found in a spec the diff never touched', () => {
  const renamed = new Map([['e2e/configured/auth.spec.ts', 'e2e/auth.spec.ts'], ['e2e/sub/x.spec.ts', 'e2e/x.spec.ts']]);
  const found = findings(new Map(), [], new Map([['e2e/untouched.spec.ts', { before: 9, after: 6 }], ['e2e/same.spec.ts', { before: 2, after: 2 }]]), renamed);
  assert.deepEqual(found.get('e2e/configured/auth.spec.ts'), ['the spec moves from e2e/auth.spec.ts under playwright.config.ts to playwright.live.config.ts, a different suite']);
  assert.equal(found.has('e2e/sub/x.spec.ts'), false);
  assert.deepEqual(found.get('e2e/untouched.spec.ts'), ['3 test(s) fewer than before (9 -> 6, counted by playwright --list)']);
  assert.equal(found.has('e2e/same.spec.ts'), false);
});

test('a helper, fixture or Playwright config change counts every spec; a spec or product change does not', () => {
  assert.equal(broadens('e2e/_saveMatrix.ts'), true);
  assert.equal(broadens('e2e/fixtures/a.svg'), true);
  assert.equal(broadens('playwright.config.ts'), true);
  assert.equal(broadens('playwright.live.config.ts'), true);
  assert.equal(broadens('e2e/a.spec.ts'), false);
  assert.equal(broadens('src/app.ts'), false);
  assert.equal(broadens('playwright.endurance.config.ts'), false);
});

test('files outside e2e/ and non-spec files are ignored', () => {
  const files = readDiff([diff('src/x.ts', ['-test(\'not a spec\')']), diff('e2e/_create.ts', ['+  test.skip(true, OLD_EDITOR_SKIP);'])].join('\n'));
  assert.equal(files.size, 0);
});

test('each spec is listed under the config that runs it, whose testDir is the one the config file declares', () => {
  assert.equal(configFor('e2e/configured/x.spec.ts'), 'playwright.live.config.ts');
  assert.equal(configFor('e2e/catalog/x.spec.ts'), 'playwright.catalog.config.ts');
  assert.equal(configFor('e2e/x.spec.ts'), 'playwright.config.ts');
  for (const [config, dir] of Object.entries(CONFIGS)) assert.match(readFileSync(new URL(`../${config}`, import.meta.url), 'utf8'), new RegExp(`testDir: '\\./${dir.replace('/', '\\/')}'`), config);
});

test('a --list output is counted per file and must add up to its own Total line', () => {
  const out = ['[e2e] 2 workers', 'Listing tests:', '  [chromium] › a.spec.ts:3:1 › one', '  [chromium] › a.spec.ts:9:5 › group › two › with › arrows', '  sub/b.spec.ts:4:1 › three', 'Total: 3 tests in 2 files'].join('\n');
  assert.deepEqual([...parseList(out)], [['a.spec.ts', 2], ['sub/b.spec.ts', 1]]);
  assert.deepEqual([...parseList('Listing tests:\nTotal: 0 tests in 0 files\n')], []);
  assert.throws(() => parseList(out.replace('Total: 3', 'Total: 4')), /says 4 tests but 3 test lines were read/);
  assert.throws(() => parseList('Listing tests:\n'), /no "Total:" line/);
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
  const entry = { spec: 'e2e/lapsed.spec.ts', justification: 'moved to unit tests', owner: 'miwco', expires: '2026-11-01', from: 'docs/work-specs/x/spec.md' };
  const { refused } = verdict(new Map([['e2e/lapsed.spec.ts', ['1 test(s) fewer than before (2 -> 1, counted by playwright --list)']]]), [entry], OWNER);
  const message = refusalMessage(refused[0], OWNER);
  assert.match(message, /^e2e\/lapsed\.spec\.ts: 1 test\(s\) fewer than before/);
  assert.match(message, /The entry for it in docs\/work-specs\/x\/spec\.md does not count: it expired on 2026-11-01\./);
  assert.match(message, /Restore the protection, or/);
  assert.match(message, /"- e2e\/lapsed\.spec\.ts: <what stays protected and by what; receipt>, owner miwco, expires <a date from 2026-11-04 to 2026-12-04>"/);
});

test('each listing compiles into its own Playwright cache, inside its own temporary directory', () => {
  const a = listingEnv({ PATH: '/bin', PWTEST_CACHE_DIR: '/tmp/shared' }, '/tmp/list-a');
  const b = listingEnv({ PATH: '/bin' }, '/tmp/list-b');
  assert.equal(a.PWTEST_CACHE_DIR, '/tmp/list-a/playwright-cache');
  assert.equal(b.PWTEST_CACHE_DIR, '/tmp/list-b/playwright-cache');
  assert.equal(a.PATH, '/bin');
});
