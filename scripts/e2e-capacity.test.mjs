// guards: scripts/e2e-capacity.mjs, scripts/repair-wake.mjs, docs/work-specs/e2e-suite-budget/spec.md
// The capacity line: what counts as usage, when a change is warned or refused, how an exception
// covers it, and that an unmeasured spec in a partial report counts at the p90, never the median.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { EXCEPTION_MAX_DAYS, HARD_SHARE, MAIN_RUNNERS, WARN_SHARE, applyOfflineStop, assess, capacityMinutes, exceptionFor, finalVerdict, ownerKinds, parseExceptions, repoView, specAssessment, summarize } from './e2e-capacity.mjs';
import { TIERS, landingDispatched, ledgerChanges, priceAdditions } from './growth-controls.mjs';
import { OWNER_KIND } from './repair-wake.mjs';
import CEILINGS from './growth-ceilings.json' with { type: 'json' };

// A table whose budget is easy to reason about: jobMinutes 0.42 and testFactor 1.01 give
// budgetMinutes 16.416 and, on 13 runners, a capacity of 213.40 table-minutes.
const overhead = { jobMinutes: 0.42, testFactor: 1.01, medianJobMinutes: 0.3, samples: 10 };
function table(total, n = 100) {
  const minutes = {};
  for (let i = 0; i < n; i++) minutes[`s${i}.spec.ts`] = total / n;
  return { source: {}, minutes, overhead };
}
const suiteOf = (t, extra = []) => [...Object.keys(t.minutes), ...extra].sort();

test('capacity is runners times the budget, and the lines sit where the spec says', () => {
  assert.equal(MAIN_RUNNERS, 13);
  assert.equal(WARN_SHARE, 0.85);
  assert.equal(HARD_SHARE, 0.95);
  assert.ok(Math.abs(capacityMinutes(table(100)) - 213.40) < 0.05);
});

test('below the warning line a change that adds a spec is ok, and the added minutes are reported', () => {
  const t = table(100);
  const r = assess({ table: t, suite: suiteOf(t, ['new.spec.ts']), changed: ['e2e/new.spec.ts'], today: '2026-10-12' });
  assert.equal(r.status, 'ok');
  assert.equal(r.details[0].how, 'unmeasured - estimated at the median until the run reports');
  assert.ok(Math.abs(r.added - 1) < 1e-9, 'the median of a flat table is one minute');
});

test('between the lines every change is warned, whether or not it adds minutes', () => {
  const t = table(189);
  assert.equal(assess({ table: t, suite: suiteOf(t), today: '2026-10-12' }).status, 'warn');
  assert.equal(assess({ table: t, suite: suiteOf(t, ['new.spec.ts']), changed: ['e2e/new.spec.ts'], today: '2026-10-12' }).status, 'warn');
});

test('above the hard line a change is refused only when it ADDS minutes without an exception', () => {
  const t = table(204);
  const quiet = assess({ table: t, suite: suiteOf(t), today: '2026-10-12' });
  assert.equal(quiet.status, 'warn', 'a change that adds nothing is never refused, whoever made it');
  const adds = assess({ table: t, suite: suiteOf(t, ['new.spec.ts']), changed: ['e2e/new.spec.ts'], today: '2026-10-12' });
  assert.equal(adds.status, 'refuse');
  assert.match(adds.reason, /without a budget exception for new\.spec\.ts/);
  const edited = assess({ table: t, suite: suiteOf(t), changed: ['e2e/s1.spec.ts'], measured: { 's1.spec.ts': 1.0 }, today: '2026-10-12' });
  assert.equal(edited.status, 'warn', 'editing a spec without making it slower adds nothing');
  const faster = assess({ table: t, suite: suiteOf(t), changed: ['e2e/s1.spec.ts'], measured: { 's1.spec.ts': 0.2 }, today: '2026-10-12' });
  assert.ok(faster.after < faster.before + 1e-9, 'a spec made faster lowers the usage');
});

test('a valid exception covers the added spec; an expired or too-long one does not', () => {
  const t = table(204);
  const ex = (expires) => [{ spec: 'e2e/new.spec.ts', minutes: 2, protects: 'the saved graphic reopening', expires, from: 'docs/work-specs/x/spec.md' }];
  const covered = assess({ table: t, suite: suiteOf(t, ['new.spec.ts']), changed: ['e2e/new.spec.ts'], exceptions: ex('2026-11-01'), today: '2026-10-12' });
  assert.equal(covered.status, 'warn');
  assert.equal(covered.details[0].exception.expires, '2026-11-01');
  assert.equal(assess({ table: t, suite: suiteOf(t, ['new.spec.ts']), changed: ['e2e/new.spec.ts'], exceptions: ex('2026-10-11'), today: '2026-10-12' }).status, 'refuse', 'expired yesterday');
  assert.equal(assess({ table: t, suite: suiteOf(t, ['new.spec.ts']), changed: ['e2e/new.spec.ts'], exceptions: ex('2026-12-31'), today: '2026-10-12' }).status, 'refuse', `longer than ${EXCEPTION_MAX_DAYS} days is not an exception`);
  assert.equal(exceptionFor(ex('2026-10-12'), 'e2e/new.spec.ts', '2026-10-12')?.expires, '2026-10-12', 'the expiry day itself still counts');
});

test('a partial report counts a changed spec it does not carry at the p90, never the median', () => {
  const minutes = {};
  for (let i = 0; i < 100; i++) minutes[`s${i}.spec.ts`] = i < 90 ? 0.5 : 5; // median 0.5, p90 5
  const t = { source: {}, minutes, overhead };
  const r = assess({ table: t, suite: suiteOf(t, ['new.spec.ts']), changed: ['e2e/new.spec.ts'], measured: { 's1.spec.ts': 0.5 }, today: '2026-10-12' });
  assert.equal(r.details[0].now, 5);
  assert.match(r.details[0].how, /p90/);
  const estimate = assess({ table: t, suite: suiteOf(t, ['new.spec.ts']), changed: ['e2e/new.spec.ts'], today: '2026-10-12' });
  assert.equal(estimate.details[0].now, 0.5, 'before any run the median stands in');
});

test('exception lines parse from the work spec section and nothing else', () => {
  const md = [
    '# Spec', '', '## Budget exceptions', '',
    '- e2e/editor-foo.spec.ts: 3.4 min, protects the saved graphic reopening as it was, expires 2026-11-10',
    '- `e2e/bar.spec.ts`: 1 min, protects the take, expires 2026-11-01',
    '- e2e/bad.spec.ts: three minutes, protects nothing, expires soon',
    '', '## Test maintenance', '', '- e2e/not-an-exception.spec.ts: 9 min, protects x, expires 2026-11-01',
  ].join('\n');
  assert.deepEqual(parseExceptions(md).map((e) => [e.spec, e.minutes, e.expires]), [['e2e/editor-foo.spec.ts', 3.4, '2026-11-10'], ['e2e/bar.spec.ts', 1, '2026-11-01']]);
  assert.deepEqual(parseExceptions('# nothing here'), []);
});

test('the summary keeps execution, runner minutes and wall clock apart', () => {
  const t = table(100);
  const r = assess({ table: t, suite: suiteOf(t, ['new.spec.ts']), changed: ['e2e/new.spec.ts'], today: '2026-10-12' });
  const text = summarize(r, { runnerMinutes: 42.5, wallMinutes: 9.1 });
  assert.match(text, /Execution: 101\.0 of 213\.4 table-minutes/);
  assert.match(text, /Runner minutes of this run: 42\.5/);
  assert.match(text, /Wall clock of this run so far: 9\.1 min/);
  assert.match(text, /\| `new\.spec\.ts` \| - \| 1\.00 \| \+1\.00 \|/);
});

test('the repository view reads the base from git and the head from disk, so a newly started manual workflow is priced', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'repo-view-'));
  try {
    const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const put = (f, text) => { mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); writeFileSync(path.join(root, f), text); };
    const manual = 'on:\n  workflow_dispatch:\njobs:\n  a:\n    name: Manual\n';
    put('.github/workflows/m.yml', manual);
    put('.github/workflows/ci.yml', 'on:\n  pull_request:\njobs:\n  b:\n    steps:\n      - run: node scripts/kick.mjs\n');
    put('scripts/kick.mjs', 'console.log("nothing yet");\n');
    git('init', '-q');
    git('add', '-A');
    git('commit', '-qm', 'base');
    const base = git('rev-parse', 'HEAD').trim();
    const view = () => repoView(base, root);
    assert.deepEqual(priceAdditions({ workflows: {}, estimates: CEILINGS.estimates, repo: view() }), [], 'nothing changed');
    put('scripts/kick.mjs', 'execSync("gh workflow run m.yml");\n');
    const repo = view();
    assert.deepEqual(Object.keys(repo.base.workflows).sort(), ['ci.yml', 'm.yml']);
    assert.match(repo.base.read('scripts/kick.mjs'), /nothing yet/);
    assert.deepEqual(priceAdditions({ workflows: {}, estimates: CEILINGS.estimates, repo }).map((i) => [i.id, i.perLanding]), [['job:m.yml/Manual', CEILINGS.estimates.newJobMinutes]]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('on this repository, the landing procedure starts cloud-queue-merge.yml and nothing starts alarm-test.yml', () => {
  // Pins the one real route the dispatch search exists for (#2011): an edit that re-wraps or moves
  // the landing procedure's dispatch step must not make cloud-queue-merge.yml free.
  const started = landingDispatched(repoView('HEAD').head, CEILINGS.estimates);
  assert.ok(started.has('cloud-queue-merge.yml'), 'the landing procedure dispatches cloud-queue-merge.yml');
  assert.equal(started.has('alarm-test.yml'), false, 'alarm-test.yml runs only when a person asks');
});

// cf22 fix 2 rule 1: which refusals only the owner can move. Each case states its class by hand,
// on the real producers' output, so a reworded refusal cannot quietly change its class.
const fresh = { today: '2026-10-12' };
const adding = (total, o = {}) => { const t = table(total); return assess({ table: t, suite: suiteOf(t, ['new.spec.ts']), changed: ['e2e/new.spec.ts'], ...fresh, ...o }); };
const quietGrowth = (o = {}) => ({ status: 'ok', reasons: [], tiers: { tiers: {} }, stops: {}, ledger: [], ...o });

test('fix 2: the table is the owner\'s only when it was at its line before the change', () => {
  assert.deepEqual(ownerKinds({ result: adding(204), growth: quietGrowth() }), ['full:table'], 'already at 95%');
  const crossing = adding(202);
  assert.equal(crossing.status, 'refuse');
  assert.deepEqual(ownerKinds({ result: crossing, growth: quietGrowth() }), [], 'crossed by the change\'s own minutes: the agent\'s');
  // A stale table no longer has an 85% line (land-2 B1): at 85-95% nothing refuses, so no kind.
  assert.deepEqual(ownerKinds({ result: adding(182, { tableStale: true }), growth: quietGrowth() }), [], 'a stale table\'s line is 95%, like any other');
  assert.equal(adding(182, { tableStale: true }).status, 'warn');
});

test('fix 2: a tier is the owner\'s when full before the change or stopped; the agent\'s when the change crosses it', () => {
  const ok = adding(10);
  const tier = (o) => ({ status: 'refuse', line: 0.95, share: 0.5, ...o });
  assert.deepEqual(ownerKinds({ result: ok, growth: quietGrowth({ tiers: { tiers: { overhead: tier({ share: 0.95 }) } } }) }), ['full:overhead']);
  assert.deepEqual(ownerKinds({ result: ok, growth: quietGrowth({ tiers: { tiers: { overhead: tier({ share: 0.94 }) } } }) }), []);
  assert.deepEqual(ownerKinds({ result: ok, growth: quietGrowth({ tiers: { tiers: { graphics: tier({ share: 0.99 }) } }, stops: { graphics: 'G2' } }) }), ['stopped:graphics'], 'a stop, even over the line, is named as a stop');
  assert.deepEqual(ownerKinds({ result: ok, growth: quietGrowth({ tiers: { tiers: { backend: tier({ share: null }) } } }) }), [], 'no measurement is #2379\'s alarm, not here');
  assert.deepEqual(ownerKinds({ result: ok, growth: quietGrowth({ tiers: { tiers: { overhead: { status: 'warn', line: 0.95, share: 0.99 } } } }) }), [], 'a warning has no kind');
});

test('fix 2: added offline minutes are the owner\'s when the offline tier is stopped or already full', () => {
  const offline = (share) => quietGrowth({ tiers: { tiers: { offline: { status: 'warn', evidence: 'complete', line: 0.95, share, used: { perLanding: 100 * share, perDay: 100 * share }, ceiling: { perLanding: 100, perDay: 100 } } } } });
  const result = adding(100); // one added minute
  const full = applyOfflineStop(offline(0.97), result);
  assert.equal(full.status, 'refuse');
  assert.deepEqual(ownerKinds({ result, growth: full }), ['full:offline'], 'already at its line before the change');
  const crossed = applyOfflineStop(offline(0.945), result);
  assert.equal(crossed.status, 'refuse');
  assert.deepEqual(ownerKinds({ result, growth: crossed }), [], 'crossed by the change\'s own minutes');
  const stopped = applyOfflineStop({ ...offline(0.1), stops: { offline: 'O1' } }, result);
  assert.deepEqual(ownerKinds({ result, growth: stopped }), ['stopped:offline']);
});

test('fix 2: an unreviewed ceilings revision is the owner\'s; a ledger form error is the agent\'s', () => {
  const ok = adding(10);
  const base = JSON.parse(JSON.stringify(CEILINGS));
  const revision = (head, o) => ownerKinds({ result: ok, growth: quietGrowth({ ledger: ledgerChanges({ base, head, ...o }) }) });
  assert.deepEqual(revision({ ...base, revisions: [], estimates: { ...base.estimates, extra: 1 } }), ['revision'], 'the ceilings changed');
  assert.deepEqual(revision(base, { mainRunners: { base: 13, head: 14 } }), ['revision'], 'MAIN_RUNNERS raised');
  assert.deepEqual(revision(base, { shardCap: { base: 30, head: 40 } }), ['revision'], 'SHARD_CAP_MINUTES raised');
  const withEx = { ...base, exceptions: [{ id: 'E1', tier: 'overhead' }] };
  assert.notEqual(ledgerChanges({ base: withEx, head: base }).length, 0);
  assert.deepEqual(ownerKinds({ result: ok, growth: quietGrowth({ ledger: ledgerChanges({ base: withEx, head: base }) }) }), [], 'a removed entry is its author\'s to restore');
});

test('fix 2: the table is classed on its own verdict, before the growth verdict is merged in', () => {
  const covered = { ...adding(204), status: 'ok' }; // its addition covered by an exception
  const ledgerError = quietGrowth({ status: 'refuse', reasons: ['exception E9 was edited'], ledger: ['exception E9 was edited'] });
  const v = finalVerdict({ result: covered, growth: ledgerError });
  assert.equal(v.status, 'refuse');
  assert.equal(v.owner, '', 'the agent\'s to fix');
  assert.equal(finalVerdict({ result: adding(204), growth: quietGrowth() }).owner, 'full:table');
  assert.equal(finalVerdict({ result: { ...adding(204), status: 'warn' }, growth: quietGrowth({ status: 'warn', reasons: ['x'] }) }).owner, '', 'no refusal, no kind');
});

test('fix 2: every kind ownerKinds can name is one the repair check reads', () => {
  for (const t of TIERS) for (const k of [`full:${t}`, `stopped:${t}`]) assert.match(k, OWNER_KIND);
  for (const k of ['full:table', 'revision']) assert.match(k, OWNER_KIND);
});

test('fix 2: the edges: exactly at the line is full; an offline stop with no added minute is not this refusal', () => {
  assert.deepEqual(ownerKinds({ result: { status: 'refuse', before: 95, capacity: 100, line: 0.95, added: 1 }, growth: quietGrowth() }), ['full:table']);
  const t = table(10);
  const quiet = assess({ table: t, suite: suiteOf(t), ...fresh });
  const growth = quietGrowth({ stops: { offline: 'O1' }, tiers: { tiers: { overhead: { status: 'refuse', line: 0.95, share: 0.96 } } } });
  assert.deepEqual(ownerKinds({ result: quiet, growth }), ['full:overhead'], 'refused for the overhead tier alone');
});

// LANDING OUTRANKS COST (owner, 2026-11-12; cicd-followup land-2a). Phase 4 of live-publishing
// (#2408, run 43155577709) was refused for 0.4 "added" minutes that were an edit to
// e2e/production-data.spec.ts, a spec that existed but had no table row yet, while the offline
// tier read 122% on the week to 2026-11-11. An edit to an existing spec file is never growth.
test('land-2a: an edit to an existing spec is never refused, over the table line or a full offline tier', () => {
  const t = table(204); // 96% before anything changes
  const suite = suiteOf(t, ['production-data.spec.ts']); // on disk, no table row (as on 2026-11-12)
  const edit = { table: t, suite, changed: ['e2e/production-data.spec.ts'], edited: ['e2e/production-data.spec.ts'], ...fresh };
  const r = assess(edit);
  assert.equal(r.status, 'warn', 'over the line it warns, never refuses');
  assert.equal(r.added, 0, 'an edit adds no minutes to decide on');
  assert.equal(r.details[0].now, 2.04, 'it is still priced, at the median, so the usage stays visible');
  assert.match(r.details[0].how, /an edit to an existing spec, never refused/);
  assert.ok(Math.abs(r.after - r.before) < 1e-9, 'an unmeasured existing spec was already in the suite before the change');
  const ex = [{ spec: 'e2e/new.spec.ts', minutes: 2, protects: 'x', expires: '2026-10-20', from: 'docs/work-specs/x/spec.md' }];
  const mixed = assess({ ...edit, suite: suiteOf(t, ['production-data.spec.ts', 'new.spec.ts']), changed: ['e2e/production-data.spec.ts', 'e2e/new.spec.ts'], exceptions: ex });
  assert.equal(mixed.status, 'warn', 'the new spec has its exception, and the edit needs none');
  // On the offline tier too, only the new spec is priced: it alone fits under the 95% line, and
  // the edit's minutes on top would cross it.
  const sum = (items) => ({ tiers: { offline: { addedLanding: items.reduce((a, i) => a + i.perLanding, 0), addedDay: items.reduce((a, i) => a + i.perDay, 0) } } });
  const room = { status: 'ok', reasons: [], stops: {}, ledger: [], items: [], assessWith: sum, estimates: { runsPerLanding: { everyRun: 1 }, scheduledRunsPerDay: { offline: 0 } }, tiers: { tiers: { offline: { status: 'ok', evidence: 'complete', line: 0.95, share: 0.92, used: { perLanding: 92, perDay: 0 }, ceiling: { perLanding: 100, perDay: 1000 } } } } };
  assert.equal(applyOfflineStop(room, mixed, { paths: ['e2e/new.spec.ts', 'e2e/production-data.spec.ts'] }).status, 'ok', `92 + ${mixed.added} new minutes stays under 95; the edit is not priced`);
  const slower = assess({ ...edit, changed: ['e2e/s1.spec.ts'], edited: ['e2e/s1.spec.ts'], suite: suiteOf(t), measured: { 's1.spec.ts': 9 } });
  assert.equal(slower.status, 'warn', 'made slower by the edit, still not refused');
  assert.ok(slower.after > slower.before, 'the slower spec still shows in the usage line');
  const offline = { status: 'ok', reasons: [], stops: {}, ledger: [], estimates: { runsPerLanding: { everyRun: 4.75 }, scheduledRunsPerDay: { offline: 1 } }, tiers: { tiers: { offline: { status: 'warn', evidence: 'complete', line: 0.95, share: 1.22, used: { perLanding: 654.3, perDay: 191.5 }, ceiling: { perLanding: 535, perDay: 215 } } } } };
  assert.equal(applyOfflineStop(offline, r).status, 'ok', 'a full offline tier does not refuse an edit');
  assert.equal(finalVerdict({ result: r, growth: offline }).status, 'warn');
  // A new spec file is still growth worth a decision.
  const added = assess({ ...edit, edited: [] });
  assert.equal(added.status, 'refuse');
  assert.equal(applyOfflineStop(structuredClone(offline), added).status, 'refuse');
});

test('land-2a: only an added spec file is new; a modified one, or one renamed from an offline spec, is an edit', async () => {
  const { specChanges } = await import('./e2e-capacity.mjs');
  assert.equal(typeof specChanges, 'function');
  const dir = mkdtempSync(path.join(tmpdir(), 'e2e-capacity-'));
  try {
    const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', windowsHide: true });
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@example.com');
    git('config', 'user.name', 't');
    mkdirSync(path.join(dir, 'e2e', 'configured'), { recursive: true });
    for (const f of ['e2e/old.spec.ts', 'e2e/moved.spec.ts', 'e2e/configured/back.spec.ts', 'e2e/gone.spec.ts']) writeFileSync(path.join(dir, f), `test('${f}', () => {});\n// ${'x'.repeat(200)}\n`);
    git('add', '.');
    git('commit', '-q', '-m', 'base');
    writeFileSync(path.join(dir, 'e2e', 'old.spec.ts'), 'test("old, edited", () => {});\n');
    writeFileSync(path.join(dir, 'e2e', 'new.spec.ts'), 'test("new", () => {});\n');
    git('mv', 'e2e/moved.spec.ts', 'e2e/renamed.spec.ts');
    git('mv', 'e2e/configured/back.spec.ts', 'e2e/back.spec.ts');
    git('rm', '-q', 'e2e/gone.spec.ts');
    git('add', '.');
    git('commit', '-q', '-m', 'head');
    const { changed, edited } = specChanges('HEAD~1', dir);
    assert.deepEqual([...changed].sort(), ['e2e/back.spec.ts', 'e2e/new.spec.ts', 'e2e/old.spec.ts', 'e2e/renamed.spec.ts']);
    assert.deepEqual([...edited].sort(), ['e2e/old.spec.ts', 'e2e/renamed.spec.ts'], 'a configured spec moved into the offline suite is new offline cost');
    // The CLI's own path: an edit over a full table warns, the added spec beside it is still judged.
    const t = table(204);
    const suite = suiteOf(t, ['old.spec.ts', 'renamed.spec.ts', 'back.spec.ts', 'new.spec.ts']);
    const ex = (spec) => ({ spec, minutes: 3, protects: 'x', expires: '2026-10-20', from: 'docs/work-specs/x/spec.md' });
    const cli = specAssessment({ base: 'HEAD~1', cwd: dir, table: t, suite, exceptions: [ex('e2e/new.spec.ts'), ex('e2e/back.spec.ts')], ...fresh });
    assert.equal(cli.changed.length, 4);
    assert.equal(cli.result.status, 'warn', cli.result.reason);
    assert.ok(Math.abs(cli.result.added - 2 * 2.04) < 1e-9, 'only the two new files count');
    assert.equal(specAssessment({ base: 'HEAD~1', cwd: dir, table: t, suite, exceptions: [ex('e2e/new.spec.ts')], ...fresh }).result.status, 'refuse', 'back.spec.ts is new offline cost');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
