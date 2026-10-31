// guards: scripts/e2e-affected.mjs, scripts/e2e-lists.mjs, scripts/configured-verdict.mjs, scripts/configured-shards.mjs, .github/workflows/ci.yml
//
// THE SELECTED CONFIGURED PR CHECK (cicd-improvement ci06), pinned end to end: what the planner
// selects and why, the manifest the plan carries, the exact verdict over a run's report, and the
// two shell steps in ci.yml that turn the plan into a flag and the flag into the gate's answer.
// The shell steps are read out of ci.yml itself and run under bash, so the test cannot pass on a
// copy that drifted from the workflow.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { configuredFullFor, configuredManifest, configuredToolchain, planFor } from './e2e-affected.mjs';
import { CONFIGURED_HEADERS, CONFIGURED_SPECS } from './e2e-lists.mjs';
import { manifestProblems, verdict } from './configured-verdict.mjs';
import { CONFIGURED_SHARDS, selectedShardCount } from './configured-shards.mjs';

const CI_YML = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const plan = (files, opts = {}) => planFor(files, { traced: null, helpers: null, readers: null, ...opts });

// ── (a) every configured spec declares, and the selection names specs, not a boolean ────────────

test('ci06: every configured spec declares covers or a reasoned none', () => {
  const silent = [...CONFIGURED_HEADERS].filter(([, h]) => h.covers.length === 0 && h.none === null).map(([s]) => s);
  assert.deepEqual(silent, []);
  assert.equal(CONFIGURED_SPECS.length, CONFIGURED_HEADERS.size);
});

test('ci06: an edited configured spec runs itself, and a deleted one plans nothing', () => {
  const p = plan(['e2e/configured/teams.spec.ts']);
  assert.deepEqual(p.configuredSpecs, ['teams.spec.ts']);
  assert.equal(p.configuredAll, false);
  assert.deepEqual(p.configuredReasons.files, { 'e2e/configured/teams.spec.ts': ['teams.spec.ts'] });
  // Its screenshot baselines are its own input too.
  assert.deepEqual(plan(['e2e/configured/teams.spec.ts-snapshots/a.png']).configuredSpecs, ['teams.spec.ts']);
  // Gone from disk: nothing of it is left to run, and nothing escalates for it.
  const gone = plan(['e2e/configured/teams.spec.ts'], { configuredOnDisk: CONFIGURED_SPECS.filter((s) => s !== 'teams.spec.ts') });
  assert.deepEqual(gone.configuredSpecs, []);
  assert.equal(gone.configured, false);
});

test('ci06: a covers line selects exactly its specs, by name', () => {
  const p = plan(['src/control/logFollow.ts']);
  assert.equal(p.configuredAll, false);
  assert.deepEqual(p.configuredSpecs, ['follow-status-is-visible.spec.ts', 'output-cold-boot.spec.ts', 'output-realtime-floor.spec.ts', 'relay-cold-boot.spec.ts']);
  // A file no configured header names and the offline plan maps selects nothing (the untriggered case).
  const quiet = plan(['docs/GOALS.md']);
  assert.equal(quiet.configured, false);
  assert.deepEqual(quiet.configuredSpecs, []);
});

test('ci06: helpers, live config, setup, workflows and the toolchain select the whole configured set', () => {
  for (const file of [
    'e2e/configured/_helpers.ts',
    'e2e/configured/expected-run.json',
    'playwright.live.config.ts',
    'supabase/config.toml',
    'supabase/migrations/9999_new.sql',
    'supabase/seed.sql',
    '.github/workflows/ci.yml',
    '.github/workflows/configured-suite.yml',
    '.github/actions/configured-stack/action.yml',
    'package.json',
    'package-lock.json',
    'vite.config.ts',
    'scripts/configured-verdict.mjs',
    'scripts/configured-shards.mjs',
    'scripts/e2e-affected.mjs',
    'scripts/e2e-lists.mjs',
    'scripts/e2e-run-integrity.mjs',
  ]) {
    const p = plan([file]);
    assert.equal(p.configuredAll, true, `${file} must select the whole configured set`);
    assert.deepEqual(p.configuredSpecs, [...CONFIGURED_SPECS].sort(), file);
    assert.deepEqual(p.configuredReasons.whole, [file], `${file} is named as the reason`);
  }
  // The toolchain is read off imports: the verdict's own imports are in it.
  for (const f of ['scripts/e2e-quarantine.mjs', 'scripts/e2e-spec-names.mjs', 'scripts/nightly-triage.mjs']) {
    assert.ok(configuredToolchain().has(f), `${f} is imported by the configured toolchain`);
    assert.ok(configuredFullFor(f), f);
  }
  // A spec file under e2e/configured/ is NOT shared ground: it runs itself.
  assert.equal(configuredFullFor('e2e/configured/teams.spec.ts'), false);
  assert.equal(configuredFullFor('e2e/configured/teams.spec.ts-snapshots/a.png'), false);
});

test('ci06: an uncertain shared change (any offline escalation) selects the whole configured set', () => {
  for (const file of ['src/brand-new-area/thing.ts', 'src/model/shows.ts', 'src/store/index.ts', 'src/components/spaceKey.ts']) {
    for (const sprintFocus of [false, true]) {
      const p = plan([file], { sprintFocus });
      assert.equal(p.configuredAll, true, `${file} (focus ${sprintFocus})`);
      assert.ok(p.configuredReasons.whole.includes(file));
      assert.equal(p.configuredSpecs.length, CONFIGURED_SPECS.length);
    }
  }
  // A stale traced map escalates every file it would have mapped, and so selects the whole set.
  const stale = plan(['src/components/home/RowMenu.tsx'], { traced: { files: new Map(), broad: new Set(), problem: 'stale' } });
  assert.equal(stale.configuredAll, true);
});

test('ci06: the manifest drops a quarantined spec unless the change edits it, and says so', () => {
  const p = plan(['src/control/failedSends.ts']);
  assert.ok(p.configuredSpecs.includes('late-send-abandoned.spec.ts'));
  const q = ['e2e/configured/late-send-abandoned.spec.ts'];
  const m = configuredManifest(p, q, ['src/control/failedSends.ts']);
  assert.equal(m.mode, 'subset');
  assert.ok(!m.specs.includes('late-send-abandoned.spec.ts'));
  assert.deepEqual(m.quarantined, q);
  const edited = configuredManifest(plan(['e2e/configured/late-send-abandoned.spec.ts']), q, ['e2e/configured/late-send-abandoned.spec.ts']);
  assert.deepEqual(edited.specs, ['late-send-abandoned.spec.ts']);
  // Selected only quarantined specs: nothing blocks, and the manifest is 'none' with them named.
  const only = configuredManifest({ configuredSpecs: ['late-send-abandoned.spec.ts'], configuredAll: false }, q, []);
  assert.equal(only.mode, 'none');
  assert.deepEqual(only.quarantined, q);
  // The whole set is 'all', never a narrower mode.
  assert.equal(configuredManifest(plan(['supabase/config.toml']), [], []).mode, 'all');
  assert.equal(configuredManifest({}, [], []).mode, 'none');
});

test('ci06: the planner CLI carries the manifest in its JSON, the whole set for --all', () => {
  const run = (args) => JSON.parse(spawnSync(process.execPath, ['scripts/e2e-affected.mjs', '--json', ...args], { encoding: 'utf8', windowsHide: true }).stdout);
  const one = run(['--files', 'e2e/configured/teams.spec.ts']);
  assert.equal(one.mode, 'none', 'the offline plan has nothing to run');
  assert.deepEqual(one.configured.specs, ['teams.spec.ts']);
  assert.equal(one.configured.mode, 'subset');
  const all = run(['--all']);
  assert.equal(all.configured.mode, 'all');
  assert.ok(all.configured.specs.length >= CONFIGURED_SPECS.length - all.configured.quarantined.length);
});

// ── (b) the verdict is exact over the selected manifest ───────────────────────────────────────

const t = (file, title, status, id = `${file}#${title}`) => ({ id, file, title, line: 1, tests: [{ status: status === 'passed' ? 'expected' : status === 'skipped' ? 'skipped' : 'unexpected', results: status === 'none' ? [] : [{ status }] }] });
const reportOf = (specs) => ({ config: { rootDir: '/w/e2e/configured' }, stats: { expected: specs.filter((s) => s.tests[0].results[0]?.status === 'passed').length, unexpected: specs.filter((s) => s.tests[0].results[0]?.status === 'failed').length, flaky: 0, skipped: specs.filter((s) => s.tests[0].results[0]?.status === 'skipped').length }, suites: [{ specs }] });
const listOf = (specs) => ({ suites: [{ specs: specs.map((s) => ({ ...s, tests: [{ results: [] }] })) }] });
const EXPECT = { minTests: 133, allowedSkips: 'bridge-real-server.spec.ts' };

test('ci06: a selection that ran every listed test, and nothing else, is green below the full floor', () => {
  const listed = [t('a.spec.ts', 'one', 'passed'), t('b.spec.ts', 'two', 'passed')];
  const v = verdict(reportOf(listed), { ...EXPECT, manifest: { selected: ['a.spec.ts', 'b.spec.ts'], listed: listOf(listed) } });
  assert.equal(v.green, true, JSON.stringify(v.problems));
  // Without the manifest the same report fails the full suite's floor: the manifest is what judges a selection.
  assert.equal(verdict(reportOf(listed), EXPECT).green, false);
});

test('ci06: missing, empty, mismatched or unexpectedly skipped results are each red', () => {
  const a = t('a.spec.ts', 'one', 'passed');
  const b = t('b.spec.ts', 'two', 'passed');
  const listed = listOf([a, b]);
  const judge = (ran, selected = ['a.spec.ts', 'b.spec.ts'], list = listed) => verdict(reportOf(ran), { ...EXPECT, manifest: { selected, listed: list } });
  const titles = (v) => v.problems.map((p) => p.title);
  // Missing: a shard's tests never reported.
  assert.deepEqual(titles(judge([a])), ['Selected tests missing from the report']);
  // Empty: nothing ran at all, and an empty listing or selection.
  assert.ok(titles(judge([])).includes('Selected tests missing from the report'));
  assert.deepEqual(titles(judge([a, b], [], listed)), ['Empty selection']);
  assert.deepEqual(titles(judge([], ['a.spec.ts'], listOf([]))), ['Empty selection']);
  // Mismatched: a test that was not selected, or a selected file that lists nothing.
  assert.deepEqual(titles(judge([a, b, t('c.spec.ts', 'three', 'passed')])), ['Report does not match the selection']);
  assert.deepEqual(titles(judge([a], ['a.spec.ts', 'z.spec.ts'], listOf([a]))), ['Selected spec lists no test']);
  // The same title under another identity is a different test.
  assert.deepEqual(titles(judge([a, t('b.spec.ts', 'two', 'passed', 'other-id')])), ['Selected tests missing from the report', 'Report does not match the selection']);
  // Unexpectedly skipped; an allowed skip stays allowed.
  assert.deepEqual(titles(judge([a, t('b.spec.ts', 'two', 'skipped')])), ['Unexpected skip']);
  const bridge = t('bridge-real-server.spec.ts', 'walk', 'skipped');
  assert.equal(judge([a, bridge], ['a.spec.ts', 'bridge-real-server.spec.ts'], listOf([a, bridge])).green, true);
  // Failed.
  assert.deepEqual(titles(judge([a, t('b.spec.ts', 'two', 'failed')])), ['Configured suite is red']);
});

test('ci06: manifestProblems keys tests by Playwright id, so a listed and a run report agree', () => {
  const listed = { suites: [{ specs: [{ id: 'x1', file: 'a.spec.ts', title: 'one', line: 3 }] }] };
  assert.deepEqual(manifestProblems({ suites: [{ specs: [{ id: 'x1', file: 'a.spec.ts', title: 'one', line: 3 }] }] }, { selected: ['a.spec.ts'], listed }), []);
});

test('ci06: the verdict CLI refuses an unreadable manifest rather than judging without it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ci06-'));
  try {
    writeFileSync(join(dir, 'r.json'), JSON.stringify(reportOf([])));
    const out = join(dir, 'out');
    writeFileSync(out, '');
    const r = spawnSync(process.execPath, ['scripts/configured-verdict.mjs', join(dir, 'r.json'), '--expect', 'e2e/configured/expected-run.json', '--manifest', join(dir, 'missing.json'), '--selected', 'a.spec.ts'], { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: out }, windowsHide: true });
    assert.match(r.stdout, /No manifest/);
    assert.match(readFileSync(out, 'utf8'), /green=false/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ci06: a selection gets one stack per ten measured minutes, never more than a landing gets', () => {
  assert.equal(selectedShardCount(['a.spec.ts']), 1);
  assert.equal(selectedShardCount(CONFIGURED_SPECS), Math.min(CONFIGURED_SHARDS, Math.ceil(CONFIGURED_SPECS.length / 10)));
  const report = { suites: [{ file: 'a.spec.ts', specs: [{ file: 'a.spec.ts', title: 'x', tests: [{ status: 'expected', results: [{ duration: 25 * 60_000 }] }] }] }] };
  assert.equal(selectedShardCount(['a.spec.ts'], [report]), 3);
});

// ── the two ci.yml steps, run as written ───────────────────────────────────────────────────────

/** The `run: |` body of the step named `name` in ci.yml, dedented. */
function stepScript(name) {
  const lines = CI_YML.split('\n');
  const at = lines.findIndex((l) => l.trim() === `- name: ${name}`);
  assert.ok(at >= 0, `ci.yml has a step named ${name}`);
  const runAt = lines.findIndex((l, i) => i > at && l.trim() === 'run: |');
  const indent = lines[runAt].indexOf('run:');
  const body = [];
  for (const l of lines.slice(runAt + 1)) {
    if (l.trim() !== '' && l.length - l.trimStart().length <= indent) break;
    body.push(l);
  }
  const pad = Math.min(...body.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length));
  return body.map((l) => l.slice(pad)).join('\n');
}

function runBash(script, env, { path } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ci06-step-'));
  try {
    const out = join(dir, 'output');
    const summary = join(dir, 'summary');
    writeFileSync(out, '');
    writeFileSync(summary, '');
    const r = spawnSync('bash', ['-c', script], { encoding: 'utf8', env: { PATH: path ? `${path}:${process.env.PATH}` : process.env.PATH, HOME: dir, GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: summary, ...env }, cwd: process.cwd(), windowsHide: true });
    return { code: r.status, stdout: r.stdout + r.stderr, output: readFileSync(out, 'utf8'), summary: readFileSync(summary, 'utf8') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const GATE_GREEN = { BUILD_RESULT: 'success', PLAN_RESULT: 'success', E2E_RESULT: 'skipped', RETRY_RESULT: 'skipped', CATALOG_RESULT: 'skipped', FACTORY_RESULT: 'success', GUIDED_MOD_RESULT: 'skipped', CAPACITY_RESULT: '', CAPACITY_REASON: '' };

test('ci06: the CI gate reads the planner flag: a triggered PR needs both configured jobs green', () => {
  const gate = stepScript('Require every gate');
  const run = (env) => runBash(gate, { ...GATE_GREEN, EVENT: 'pull_request', ...env });
  assert.equal(run({ CONFIGURED_FLAG: 'true', CONFIGURED_RESULT: 'success', CONFIGURED_VERDICT: 'success' }).code, 0);
  for (const [shards, verdictResult] of [['success', 'failure'], ['failure', 'failure'], ['skipped', 'skipped'], ['success', 'skipped'], ['failure', 'success'], ['cancelled', 'failure']]) {
    const r = run({ CONFIGURED_FLAG: 'true', CONFIGURED_RESULT: shards, CONFIGURED_VERDICT: verdictResult });
    assert.notEqual(r.code, 0, `triggered with ${shards}/${verdictResult} must not pass`);
  }
  // A cap with no verdict is still not a pass, and says so as a no-verdict warning.
  const capped = run({ CONFIGURED_FLAG: 'true', CONFIGURED_RESULT: 'cancelled', CONFIGURED_VERDICT: 'success' });
  assert.notEqual(capped.code, 0);
  assert.match(capped.stdout, /running out of time/);
});

test('ci06: the gate accepts a skip only when the flag is off, and a merge group must be off', () => {
  const gate = stepScript('Require every gate');
  const run = (env) => runBash(gate, { ...GATE_GREEN, ...env });
  // Untriggered PR: both skipped passes.
  assert.equal(run({ EVENT: 'pull_request', CONFIGURED_FLAG: 'false', CONFIGURED_RESULT: 'skipped', CONFIGURED_VERDICT: 'skipped' }).code, 0);
  // Off but something ran: a mismatch, refused.
  assert.notEqual(run({ EVENT: 'pull_request', CONFIGURED_FLAG: 'false', CONFIGURED_RESULT: 'success', CONFIGURED_VERDICT: 'skipped' }).code, 0);
  // No flag at all: never read as a skip.
  for (const flag of ['', 'maybe']) {
    const r = run({ EVENT: 'pull_request', CONFIGURED_FLAG: flag, CONFIGURED_RESULT: 'skipped', CONFIGURED_VERDICT: 'skipped' });
    assert.notEqual(r.code, 0, `flag '${flag}'`);
    assert.match(r.stdout, /gave no configured flag/);
  }
  // Merge group: exempt with 'false' and skipped jobs; a merge group claiming 'true' is refused.
  assert.equal(run({ EVENT: 'merge_group', CONFIGURED_FLAG: 'false', CONFIGURED_RESULT: 'skipped', CONFIGURED_VERDICT: 'skipped' }).code, 0);
  assert.notEqual(run({ EVENT: 'merge_group', CONFIGURED_FLAG: 'true', CONFIGURED_RESULT: 'success', CONFIGURED_VERDICT: 'success' }).code, 0);
  // Main's push: exempt, configured-suite.yml is its verdict.
  assert.equal(run({ EVENT: 'push', CONFIGURED_FLAG: 'false', CONFIGURED_RESULT: 'skipped', CONFIGURED_VERDICT: 'skipped' }).code, 0);
});

test('ci06: the selection step turns the manifest into the flag, with explicit exemptions', () => {
  const step = stepScript('Configured selection');
  const flagOf = (r) => /^flag=(.*)$/m.exec(r.output)?.[1];
  const subset = JSON.stringify({ mode: 'subset', specs: ['teams.spec.ts'], quarantined: [], reasons: { whole: [], files: { 'src/backend/teams.ts': ['teams.spec.ts'] } } });
  // Merge group, main push and a dispatch on main are exempt whatever the manifest says.
  for (const [EVENT, REF, why] of [['merge_group', 'refs/heads/gh-readonly-queue/main/x', /merge group/], ['push', 'refs/heads/main', /push to main/], ['workflow_dispatch', 'refs/heads/main', /dispatch on main/]]) {
    const r = runBash(step, { EVENT, REF, MANIFEST: subset });
    assert.equal(r.code, 0, r.stdout);
    assert.equal(flagOf(r), 'false', EVENT);
    assert.match(r.summary, why);
  }
  // A pull request with nothing selected: untriggered, flag false, said so.
  const none = runBash(step, { EVENT: 'pull_request', REF: 'refs/pull/1/merge', MANIFEST: JSON.stringify({ mode: 'none', specs: [], quarantined: [], reasons: { whole: [], files: {} } }) });
  assert.equal(none.code, 0, none.stdout);
  assert.equal(flagOf(none), 'false');
  assert.match(none.stdout, /Untriggered/);
  // A pull request whose plan carried no manifest: refused, not read as nothing selected.
  for (const MANIFEST of ['', 'null']) {
    const r = runBash(step, { EVENT: 'pull_request', REF: 'refs/pull/1/merge', MANIFEST });
    assert.notEqual(r.code, 0);
    assert.equal(flagOf(r), undefined);
  }
  // A triggered pull request: flag true, the specs and their shards (gh stubbed: no earlier report).
  const bin = mkdtempSync(join(tmpdir(), 'ci06-bin-'));
  try {
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'gh'), '#!/bin/sh\nexit 1\n');
    chmodSync(join(bin, 'gh'), 0o755);
    const r = runBash(step, { EVENT: 'pull_request', REF: 'refs/pull/1/merge', MANIFEST: subset }, { path: bin });
    assert.equal(r.code, 0, r.stdout);
    assert.equal(flagOf(r), 'true');
    assert.match(r.output, /^specs=teams\.spec\.ts$/m);
    assert.match(r.output, /^shardspecs=\[\["teams\.spec\.ts"\]\]$/m);
    assert.match(r.output, /^matrix=\{"shardIndex":\[1\],"shardTotal":\[1\]\}$/m);
    assert.match(r.summary, /src\/backend\/teams\.ts/);
    // An unknown mode is refused.
    const odd = runBash(step, { EVENT: 'pull_request', REF: 'refs/pull/1/merge', MANIFEST: JSON.stringify({ mode: 'some', specs: ['teams.spec.ts'], quarantined: [], reasons: { whole: [], files: {} } }) }, { path: bin });
    assert.notEqual(odd.code, 0);
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
});

test('ci06: the configured jobs run on the planner flag and read no hosted secret', () => {
  const job = (name) => {
    const at = CI_YML.indexOf(`\n  ${name}:\n`);
    assert.ok(at >= 0, name);
    const next = CI_YML.slice(at + 1).search(/\n {2}[a-z][\w-]*:\n/);
    return CI_YML.slice(at, at + 1 + next);
  };
  const shards = job('configured');
  assert.match(shards, /if: \$\{\{ needs\.plan\.outputs\.configured == 'true' \}\}/);
  assert.match(shards, /uses: \.\/\.github\/actions\/configured-stack/);
  assert.doesNotMatch(shards, /secrets\./);
  assert.match(shards, /NOACG_E2E_EXPECTED_SPECS/);
  const verdictJob = job('configured-verdict');
  assert.match(verdictJob, /--manifest configured-manifest\.json/);
  assert.doesNotMatch(verdictJob, /--quarantine/);
  assert.doesNotMatch(verdictJob, /secrets\./);
  assert.match(job('gate'), /needs: \[[^\]]*\bconfigured, configured-verdict\]/);
  // The landing's full configured run is untouched: configured-suite.yml still runs on every push to main.
  const suite = readFileSync(new URL('../.github/workflows/configured-suite.yml', import.meta.url), 'utf8');
  assert.match(suite, /push:\n {4}branches: \[main\]/);
  assert.match(suite, /node scripts\/configured-shards\.mjs --github-output \$REPORTS/);
  assert.match(suite, /uses: \.\/\.github\/actions\/configured-stack/);
  // The shared stack still asserts migrations, grants and the realtime publication, and the accounts sign in.
  const stack = readFileSync(new URL('../.github/actions/configured-stack/action.yml', import.meta.url), 'utf8');
  for (const must of [/schema_migrations/, /has_table_privilege/, /supabase_realtime/, /pg_default_acl/, /grant_type=password/, /version: 2\.111\.0/]) assert.match(stack, must);
  assert.doesNotMatch(stack, /secrets\./);
});
