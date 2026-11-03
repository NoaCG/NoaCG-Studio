// guards: scripts/e2e-selection-misses.mjs, docs/work-specs/cicd-improvement/evidence/phase-ci07.md
// The AC-4 miss audit (cicd-improvement ci07, evidence/phase-ci07.md Rules A1 to A5 and Q5): red full
// runs on main against their culprits' ORIGINAL plans, and the audit window from the latest reset.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  auditStatus,
  budgetedGh,
  ghStrict,
  classifyAgainst,
  configuredFailures,
  latestReset,
  mergeConfigured,
  newlyFailing,
  originalPlanOf,
  parsePrintedPlan,
  resetOf,
  SELECTION_CODE,
  summarize,
} from './e2e-selection-misses.mjs';

const subset = (specs, extra = {}) => ({ mode: 'subset', specs, quarantined: [], ...extra });

test('a spec counts for the run that turned it red, not for the landings that inherited a red main', () => {
  const runs = [
    { sha: 'a', conclusion: 'success', specs: [] },
    { sha: 'b', conclusion: 'failure', specs: ['e2e/x.spec.ts'] },
    { sha: 'c', conclusion: 'failure', specs: ['e2e/x.spec.ts', 'e2e/y.spec.ts'] },
  ];
  assert.deepEqual(newlyFailing(runs), [{ sha: 'b', specs: ['e2e/x.spec.ts'] }, { sha: 'c', specs: ['e2e/y.spec.ts'] }]);
  // A run whose failure set is unread keeps what came before: the next red run inherits, not introduces.
  const unread = [runs[1], { sha: 'u', conclusion: 'failure', specs: null }, { sha: 'd', conclusion: 'failure', specs: ['e2e/x.spec.ts'] }];
  assert.deepEqual(newlyFailing(unread), [{ sha: 'b', specs: ['e2e/x.spec.ts'] }, { sha: 'd', specs: [] }]);
});

test('Rule A1: the original plan is the one the merge-group CI run printed, read from its plan job log', () => {
  const log = '2026-11-01T03:57:02.1Z echo "plan: $PLAN"\n2026-11-01T03:57:02.7Z plan: {"mode":"subset","specs":["a.spec.ts"],"quarantined":[]}\n';
  assert.deepEqual(parsePrintedPlan(log), subset(['a.spec.ts']));
  assert.equal(parsePrintedPlan('no plan here'), null);
  assert.equal(parsePrintedPlan('plan: {"mode":"subset","specs":'), null, 'a cut line is unread, not empty');
  assert.equal(parsePrintedPlan('plan: {"specs":[]}'), null, 'no mode is not a plan');
  const calls = [];
  const gh = (args) => { calls.push(args[0]); return args[0].includes('/runs?head_sha=') ? [11] : [22]; };
  const plan = originalPlanOf('abc', { repo: 'o/r', gh, rawLog: (job) => (job === 22 ? log : '') });
  assert.deepEqual(plan, subset(['a.spec.ts']));
  assert.match(calls[0], /runs\?head_sha=abc&event=merge_group/);
  assert.equal(originalPlanOf('abc', { repo: 'o/r', gh: () => [], rawLog: () => log }), null, 'no merge-group run: unread');
  assert.equal(originalPlanOf('abc', { repo: 'o/r', gh: () => { throw new Error('403'); }, rawLog: () => log }), null);
});

test('Rule A2: offline, the newest candidate decides alone: quarantined, full, selected, miss or unknown; a flake keeps its verdict', () => {
  const spec = 'e2e/x.spec.ts';
  const verdict = (plans) => classifyAgainst(spec, plans).verdict;
  assert.equal(verdict([subset([], { quarantined: [spec] })]), 'quarantined');
  assert.equal(verdict([{ mode: 'full', specs: [], quarantined: [spec] }]), 'quarantined', 'a full plan still left the quarantined spec out');
  assert.equal(verdict([{ mode: 'full', specs: [] }]), 'full');
  assert.equal(verdict([subset(['x.spec.ts'])]), 'selected');
  assert.equal(verdict([subset(['y.spec.ts'])]), 'miss');
  assert.equal(verdict([null]), 'unknown', 'an unread plan never reads as selected or miss');
  assert.equal(verdict([]), 'unknown', 'no candidate read at all');
  // Newest first. An older landing that ran the spec and passed was cleared by that pass: a newer
  // landing that left it out is the miss, whatever the older plans said.
  assert.equal(verdict([subset([]), subset(['x.spec.ts'])]), 'miss');
  assert.equal(verdict([subset([]), { mode: 'full', specs: [] }]), 'miss');
  assert.equal(verdict([subset(['x.spec.ts']), subset([])]), 'selected', 'the newest ran it on the failing tree');
  assert.equal(verdict([subset(['x.spec.ts']), null]), 'selected', 'an unread older range does not change the newest answer');
  assert.equal(verdict([null, subset(['x.spec.ts'])]), 'unknown');
  const flake = classifyAgainst(spec, [subset([])], { flaky: new Set(['x.spec.ts']) });
  assert.deepEqual([flake.verdict, flake.flake], ['miss', true], 'a quarantined flake is investigated, not dropped');
  assert.deepEqual(classifyAgainst(spec, [subset([]), subset(['x.spec.ts'])]).answers, ['not-selected', 'selected'], 'every candidate answer is kept for the record');
  assert.equal(classifyAgainst('job: Build', [subset([])]).verdict, 'not-a-spec');
});

test('Rule A3: a configured failure is judged against the printed configured manifest; before ci06 it had none', () => {
  const spec = 'e2e/configured/grants.spec.ts';
  const withManifest = (specs, quarantined = []) => subset([], { configured: { mode: specs.length ? 'subset' : 'none', specs, quarantined } });
  const opts = { kind: 'configured' };
  assert.equal(classifyAgainst(spec, [withManifest(['grants.spec.ts'])], opts).verdict, 'selected');
  assert.equal(classifyAgainst(spec, [withManifest([], [spec])], opts).verdict, 'quarantined');
  assert.equal(classifyAgainst(spec, [withManifest([])], opts).verdict, 'miss');
  // No merge group ran it, so each candidate's own pull request must have selected it.
  assert.equal(classifyAgainst(spec, [withManifest(['grants.spec.ts']), withManifest([])], opts).verdict, 'miss', 'an older landing that left it out may be the culprit');
  assert.equal(classifyAgainst(spec, [withManifest(['grants.spec.ts']), withManifest(['grants.spec.ts'])], opts).verdict, 'selected');
  assert.equal(classifyAgainst(spec, [withManifest(['grants.spec.ts']), null], opts).verdict, 'unknown');
  assert.equal(classifyAgainst(spec, [subset([])], opts).verdict, 'no-selection', 'a pre-ci06 plan carries no manifest');
  assert.equal(classifyAgainst(spec, [{ mode: 'full', specs: [] }], opts).verdict, 'no-selection', 'an offline full plan is not a configured selection');
  assert.equal(classifyAgainst(spec, [subset([]), null], opts).verdict, 'unknown');
  // The configured question reads the pull request's run: the merge group skips the configured job.
  const asked = [];
  const gh = (args) => { asked.push(args[0]); return [1]; };
  originalPlanOf('prhead', { repo: 'o/r', gh, rawLog: () => '', event: 'pull_request' });
  assert.match(asked[0], /head_sha=prhead&event=pull_request/);
  assert.equal(originalPlanOf(null, { repo: 'o/r', gh, rawLog: () => 'plan: {"mode":"subset","specs":[]}', event: 'pull_request' }), null, 'no pull request head: unread');
  const log = [
    '2026-10-31T22:32:33.4Z Ran 118 tests (118 passed, 0 failed, 0 flaky), 1 skipped.',
    '2026-10-31T22:32:33.5Z failure set (ede21a9ed8c4):',
    '2026-10-31T22:32:33.5Z   connector-grants.spec.ts::a deployment answers 503',
    '2026-10-31T22:32:33.5Z   account.spec.ts::signs in',
    '2026-10-31T22:32:33.6Z ##[group]Run actions/upload-artifact@v4',
    '2026-10-31T22:32:33.7Z   other.spec.ts::not in the set',
  ].join('\n');
  // The failure set fingerprints a run and holds skips: alone it names no failure.
  assert.deepEqual(configuredFailures(log), []);
  const annotated = [
    '2026-10-06T00:30:00.1Z ##[error]0 failed, 1 flaky.',
    '2026-10-06T00:30:00.2Z ##[error]live-health.spec.ts - an output says who it is (failed then passed)',
    '2026-10-06T00:30:00.3Z ##[error]bridge-real-server.spec.ts - airs a template (skipped)',
    log,
  ].join('\n');
  assert.deepEqual(configuredFailures(annotated), ['e2e/configured/live-health.spec.ts'], 'an older log: the annotated real failures only');
  const capped = `${annotated}\n2026-10-06T00:30:00.4Z ##[error]4 further spec(s) were not clean - the full list is in this log.`;
  assert.deepEqual(configuredFailures(capped, { allowedSkips: new Set(['connector-grants.spec.ts']) }), ['e2e/configured/account.spec.ts', 'e2e/configured/live-health.spec.ts'], 'past the cap: the set minus allowed skips joins');
  const exact = `${capped}\n2026-11-02T00:00:00.5Z failing specs:\n2026-11-02T00:00:00.6Z   panel-lease.spec.ts::two writers\n2026-11-02T00:00:00.7Z ##[group]Run next`;
  assert.deepEqual(configuredFailures(exact), ['e2e/configured/panel-lease.spec.ts'], 'the uncapped list, when the verdict prints it, is read alone');
  assert.match(readFileSync(new URL('./configured-verdict.mjs', import.meta.url), 'utf8'), /out\('failing specs:'\);\n\s+for \(const spec of v\.failing\) out\(` {2}\$\{spec\.file\}::\$\{spec\.title\}`\);/, 'the verdict prints the uncapped list');
  // Past the verdict's annotation cap, the log names the rest: both are merged, never one alone.
  assert.deepEqual(mergeConfigured(['e2e/configured/account.spec.ts', 'job: Configured E2E (authenticated, local Supabase)', 'job: Configured E2E shard 4/4'], configuredFailures(exact)),
    ['e2e/configured/account.spec.ts', 'e2e/configured/panel-lease.spec.ts', 'job: Configured E2E shard 4/4']);
  assert.deepEqual(mergeConfigured(['job: Configured E2E (x)'], []), ['job: Configured E2E (x)'], 'no log set: the items stand');
});

test('Rule A4: a landing resets the audit for selector code, a focus or critical header line, or a declared trailer', () => {
  const base = { sha: 's', date: '2026-11-01T00:00:00Z', files: ['src/a.ts', 'scripts/e2e-traced.json'], headerLines: [], messages: 'feat: a thing' };
  assert.equal(resetOf(base), null, 'product code and a trace refresh are audited, not a reset');
  assert.match(resetOf({ ...base, files: ['scripts/e2e-affected.mjs'] }).reason, /^selector code: scripts\/e2e-affected\.mjs$/);
  for (const f of SELECTION_CODE) assert.ok(resetOf({ ...base, files: [f] }), f);
  assert.match(resetOf({ ...base, headerLines: ['+// focus'] }).reason, /critical\/shared membership: 1 header line/);
  assert.match(resetOf({ ...base, headerLines: ['-// critical: site-entry'] }).reason, /critical\/shared membership/);
  assert.equal(resetOf({ ...base, headerLines: ['+// covers: src/x/**', '+// focus set, like the rest'] }), null, 'an additive header is not a reset');
  assert.match(resetOf({ ...base, headerLines: ['-// covers: src/x/**'] }).reason, /protection removed or changed: 1 covers line/, 'a removed covers line narrows protection');
  assert.match(resetOf({ ...base, headerLines: ['-// covers: src/x/**', '+// covers: src/x/a.ts'] }).reason, /protection removed or changed/, 'a changed covers line is a reset');
  assert.match(resetOf({ ...base, headerLines: ['-// covers: none - runs only behind BRIDGE_REAL=1'] }).reason, /protection removed or changed/);
  assert.match(resetOf({ ...base, messages: 'fix: map svg.ts\n\nSelection-audit-reset: mapping corrected after miss #927\n' }).reason, /declared: mapping corrected after miss #927/);
  // From git, newest first: the first reset wins, and a shallow boundary is history unread.
  const git = (...a) => {
    if (a[0] === 'log' && a[1] === '--first-parent') return 'c3 2026-11-01T00:00:00Z c2\nc2 2026-10-30T00:00:00Z c1\nc1 2026-10-29T00:00:00Z\n';
    if (a[0] === 'diff' && a[1] === '--name-only') return a[4] === 'c2' ? 'scripts/e2e-lists.mjs\n' : 'src/x.ts\n';
    return '';
  };
  assert.deepEqual(latestReset({ git }), { reset: { sha: 'c2', date: '2026-10-30T00:00:00Z', reason: 'selector code: scripts/e2e-lists.mjs' }, read: true });
  const none = (...a) => (a[0] === 'log' && a[1] === '--first-parent' ? 'c3 2026-11-01T00:00:00Z c2\nc2 2026-10-30T00:00:00Z\n' : a[0] === 'diff' ? 'src/x.ts\n' : '');
  assert.deepEqual(latestReset({ git: none }), { reset: null, read: false });
  assert.deepEqual(latestReset({ git: () => { throw new Error('no git'); } }), { reset: null, read: false });
});

test('Rule A5: clean only with no miss, no unknown and the history read; the days since the reset are reported', () => {
  const reset = { reset: { sha: 'c2', date: '2026-10-25T10:00:00Z', reason: 'selector code' }, read: true };
  const ok = auditStatus({ rows: [{ verdict: 'selected' }, { verdict: 'quarantined' }], incidents: [], reset, today: '2026-11-08' });
  assert.deepEqual(ok, { status: 'clean', misses: 0, unknown: 0, blocking: [], days: 14 });
  assert.equal(auditStatus({ rows: [{ verdict: 'miss' }], incidents: [], reset, today: '2026-11-08' }).status, 'misses');
  assert.equal(auditStatus({ rows: [{ verdict: 'unknown' }], incidents: [], reset, today: '2026-11-08' }).status, 'misses');
  assert.equal(auditStatus({ rows: [], incidents: [], reset: { reset: null, read: false }, today: '2026-11-08' }).status, 'misses', 'unread history is never clean');
  const text = summarize({ rows: [], status: ok, reset });
  assert.match(text, /Latest audit reset: c2 at 2026-10-25T10:00:00Z \(selector code\); 14 day\(s\) since\. Days are reported, not read as qualification\./);
});

test('Rule Q5: any open quarantine incident blocks the audit, whatever the miss count', () => {
  const reset = { reset: { sha: 'c2', date: '2026-10-25T00:00:00Z', reason: 'r' }, read: true };
  const critical = { spec: 'e2e/flows.spec.ts', severity: 'critical', overdue: false };
  const fresh = { spec: 'e2e/y.spec.ts', severity: 'affected', overdue: false };
  assert.deepEqual(auditStatus({ rows: [], incidents: [critical, fresh], reset, today: '2026-11-08' }).blocking, ['e2e/flows.spec.ts', 'e2e/y.spec.ts']);
  assert.equal(auditStatus({ rows: [], incidents: [fresh], reset, today: '2026-11-08' }).status, 'blocked', 'an affected incident inside its repair date still blocks narrowing');
  assert.equal(auditStatus({ rows: [], incidents: [], reset, today: '2026-11-08' }).status, 'clean');
});

test('an unread API answer throws, so it is counted unknown and never read as nothing red', () => {
  assert.throws(() => ghStrict(['repos/o/r/actions/runs?bogus=', '--hostname', 'invalid.invalid']), /gh api .* failed/);
});

test('a collection pass spends at most its call budget, log reads included', () => {
  const gh = budgetedGh(2, () => ['ok']);
  gh(['a']);
  gh(['logs'], { raw: true });
  assert.throws(() => gh(['b']), /call budget of 2 spent/);
  assert.equal(gh.used(), 2);
});
