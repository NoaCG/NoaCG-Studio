// `npm run test:e2e:affected` is the PER-MERGE gate (docs/DEPLOYMENT.md, AGENTS.md "Verifying
// changes"), and it can spawn TWO Playwright processes: the mapped-or-full suite, then the
// catalog calibration tripwire under its own config. Whatever it exits with is the whole verdict
// a person or a CI step reads.
//
// That makes the aggregation a silent-failure surface: report only the LAST run's status and a
// red suite followed by a green catalog gate exits 0. Nobody would notice - the failure list is
// thousands of lines above the prompt, and the headline says the gate passed. The repo has
// already been burned twice by trusting a headline over a failure list (~/.claude memory,
// "Pipe masks exit codes"), so the rule is pinned here rather than left to a careful reading of
// the runner.
//
// `runPlan` takes its spawner as an argument for exactly this reason: the behaviour can be
// driven with fake exit codes, with no dev server, no browser and no minutes on the clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAX_SHARDS,
  branchBase,
  changedFilesSince,
  headIsMainMerge,
  integrationBase,
  packShards,
  parseArgs,
  planFor,
  runPlan,
  runsFor,
  shardsFor,
  specFilterArg,
  summariseRuns,
} from './e2e-affected.mjs';
import {
  budgetMinutes,
  predictShardMinutes,
  readTable,
  specFilesOnDisk,
  SHARD_CAP_MINUTES,
  SHARD_SAFETY_MINUTES,
} from './e2e-durations.mjs';

const E2E_DIR = fileURLToPath(new URL('../e2e/', import.meta.url));

/**
 * Specs that ENUMERATE a catalog collection - `CATALOG`, `TYPES`, `KITS` or `PACKS` - rather
 * than pulling one design out by id. They are the specs whose assertions move when a design is
 * added, so they are exactly the specs a `src/templates/` change has to select.
 */
function catalogEnumeratingSpecs() {
  const collection = /(?:import|const)\s*\{[^}]*\b(?:CATALOG|TYPES|KITS|PACKS)\b[^}]*\}/;
  return readdirSync(E2E_DIR)
    .filter((f) => f.endsWith('.spec.ts'))
    .filter((f) => collection.test(readFileSync(join(E2E_DIR, f), 'utf8')));
}

/**
 * Specs that RECONSTRUCT a preset's emitted region - they import the preset registry and call
 * `emit()` themselves to build a legacy twin, then measure it against the interpreter that
 * actually ships. The emitted region is authored under `src/templates/`, so those specs' whole
 * subject moves when a preset there changes.
 */
function emitReconstructingSpecs() {
  return readdirSync(E2E_DIR)
    .filter((f) => f.endsWith('.spec.ts'))
    .filter((f) => readFileSync(join(E2E_DIR, f), 'utf8').includes('presetRegistry'));
}

/** A spawner that returns canned statuses in order, and records what it was asked to run. */
function fakeRunner(...statuses) {
  const seen = [];
  const run = (r) => {
    seen.push(r.name);
    return statuses.length > 0 ? statuses.shift() : 0;
  };
  run.seen = seen;
  return run;
}

const SUBSET_WITH_CATALOG = { mode: 'subset', specs: ['sports.spec.ts'], catalog: true };

test('a failed suite is not hidden by a catalog gate that passes afterwards', () => {
  const run = fakeRunner(1, 0);
  const { status, runs } = runPlan(SUBSET_WITH_CATALOG, run);

  assert.equal(status, 1, 'the overall status must stay red');
  assert.deepEqual(run.seen, ['suite', 'catalog gate'], 'both runs still execute');
  assert.deepEqual(
    runs.map((r) => [r.name, r.status]),
    [
      ['suite', 1],
      ['catalog gate', 0],
    ],
  );
});

test('the first failure keeps its own exit code, rather than being flattened to 1', () => {
  // Playwright exits 1 for test failures but other codes exist (e.g. a config or worker fault).
  // Reporting the FIRST failure's code keeps that distinction reachable.
  const { status } = runPlan(SUBSET_WITH_CATALOG, fakeRunner(2, 1));
  assert.equal(status, 2);
});

test('a failure in the second run is reported too', () => {
  const { status } = runPlan(SUBSET_WITH_CATALOG, fakeRunner(0, 1));
  assert.equal(status, 1);
});

test('all-successful runs still return success', () => {
  const run = fakeRunner(0, 0);
  const { status } = runPlan(SUBSET_WITH_CATALOG, run);
  assert.equal(status, 0);
  assert.deepEqual(run.seen, ['suite', 'catalog gate']);
});

test('a spawn that never reported an exit code counts as a failure', () => {
  // spawnSync reports `status: null` when the process was killed by a signal or failed to start.
  // Treating that as 0 is the same false green by another route.
  assert.equal(runPlan(SUBSET_WITH_CATALOG, fakeRunner(null, 0)).status, 1);
  assert.equal(runPlan(SUBSET_WITH_CATALOG, fakeRunner(undefined, 0)).status, 1);
});

test('the run list matches the plan - and an empty spec list never reaches Playwright', () => {
  // `full` deliberately runs Playwright with no spec arguments (that IS the whole suite); a
  // `subset` with an empty list must run NOTHING, because those two spell the same command line.
  assert.deepEqual(runsFor({ mode: 'full', specs: [], catalog: true }).map((r) => r.name), [
    'suite',
    'catalog gate',
  ]);
  assert.deepEqual(runsFor({ mode: 'subset', specs: ['ux.spec.ts'], catalog: false }).map((r) => r.args), [
    ['playwright', 'test', 'ux.spec.ts'],
  ]);
  assert.deepEqual(runsFor({ mode: 'none', specs: [], catalog: true }).map((r) => r.name), ['catalog gate']);
  assert.deepEqual(runsFor({ mode: 'none', specs: [], catalog: false }), []);
});

test('nothing to run is a pass, and spawns nothing', () => {
  const run = fakeRunner();
  const { status, runs } = runPlan({ mode: 'none', specs: [], catalog: false }, run);
  assert.equal(status, 0);
  assert.deepEqual(runs, []);
  assert.deepEqual(run.seen, []);
});

test('the summary names which run went red', () => {
  const { status, runs } = runPlan(SUBSET_WITH_CATALOG, fakeRunner(1, 0));
  const line = summariseRuns(runs, status);
  assert.match(line, /suite FAILED \(exit 1\)/);
  assert.match(line, /catalog gate passed/);
  assert.match(line, /Overall: FAILED \(exit 1\)/);

  const green = runPlan(SUBSET_WITH_CATALOG, fakeRunner(0, 0));
  assert.match(summariseRuns(green.runs, green.status), /Overall: passed/);
});

// ── The mapping's own hole, pinned ──────────────────────────────────────────
//
// THE RULE: adding a design must select every spec that enumerates the catalog. Those specs
// assert over the collection the design was added to, so they are the ones whose expectations a
// catalog change can invalidate - and a mapping that omits one produces the failure mode this
// script says it does not have, running FEWER specs with no alarm attached.
//
// Six of them were omitted for months. On 2026-08-08 ten designs landed on
// claude/new-session-d34962, `competition-pack.spec.ts` went stale on its per-category counts,
// and every gate stayed green: the local affected run never named the spec, and neither did any
// CI branch run. It surfaced only because that branch's FIRST push gave CI no diff base
// (`github.event.before` was all zeroes) and the fallback escalated to the full suite - luck,
// not coverage.
//
// The detector is derived, not a list, so a NEW pack spec is covered the day it is written
// rather than the day someone remembers this file.
test('a design added under src/templates selects every spec that enumerates the catalog', () => {
  const enumerating = catalogEnumeratingSpecs();
  assert.ok(enumerating.length >= 10, `expected the detector to find the pack specs, got ${enumerating.length}`);

  const { mode, specs } = planFor(['src/templates/competition/esp09.ts']);
  assert.equal(mode, 'subset', 'a template file is mapped, so it must not escalate');

  const missing = enumerating.filter((s) => !specs.includes(s));
  assert.deepEqual(
    missing,
    [],
    `these specs enumerate the catalog but no src/templates/ change selects them - add them to the src/templates rule in e2e-affected.mjs: ${missing.join(', ')}`,
  );
});

// THE RULE: a preset change under src/templates must RUN the specs that reconstruct its emit.
//
// This is the catalog hole above one layer down, and it cost main a full day of red. The
// count-from-zero fix (2026-08-27) changed how an infographic's counting builder is positioned;
// anim-engine.spec.ts is the only place the emitted region and the interpreter that replaced it
// are measured against each other, and it was reachable from src/blocks/ alone. Every branch plan
// for that change therefore skipped the one spec whose subject it was, the branch landed green,
// and the nightly found four mismatches on main the next morning.
//
// Derived from the import, not from a list: a second spec that starts building legacy twins is
// covered the day it is written.
test('a preset change under src/templates selects every spec that reconstructs an emit', () => {
  const reconstructing = emitReconstructingSpecs();
  assert.ok(reconstructing.length >= 1, 'expected the detector to find the legacy-twin specs');

  const { mode, specs } = planFor(['src/templates/infographics/igPresets.ts']);
  assert.equal(mode, 'subset', 'a template file is mapped, so it must not escalate');

  const missing = reconstructing.filter((s) => !specs.includes(s));
  assert.deepEqual(
    missing,
    [],
    `these specs rebuild a preset's emitted region but no src/templates/ change selects them - add them to the src/templates rule in e2e-affected.mjs: ${missing.join(', ')}`,
  );
});

// THE RULE: a change whose only coverage lives in e2e/configured must SAY so. That suite is
// ignored by this planner and unrunnable in CI, so hosted Pro's door, its metering and its
// allowance read-back can break while the offline specs that pin their ABSENCE stay green -
// the quiet failure, one directory over from the catalog hole above.
test('a change only a configured deployment can cover raises the configured flag', () => {
  for (const file of [
    'src/ai/pro/session.ts',
    'api/_lib/pro/status.ts',
    'src/components/wizard/steps/AiStep.tsx',
    'e2e/configured/pro-wizard.spec.ts',
  ]) {
    assert.equal(planFor([file]).configured, true, `${file} must raise the configured flag`);
  }
  // e2e/configured/** is IGNORED for the offline plan, and the flag has to survive that: the
  // spec files themselves are exactly the change whose suite most needs naming.
  const { mode, configured } = planFor(['e2e/configured/pro-wizard.spec.ts']);
  assert.equal(mode, 'none', 'the configured suite is reported, never run by this gate');
  assert.equal(configured, true);
  // And it stays off for an ordinary change, or the line is noise nobody reads.
  assert.equal(planFor(['src/templates/competition/esp09.ts']).configured, false);
});

// THE RULE: a change to the catalog gate's own specs must RUN the catalog gate. Those specs sit
// outside the default suite, so nothing in the spec mapping selects them; left unmapped the change
// escalates to `full`, and a `full` escalation under sprint focus deliberately drops the catalog
// coupling - so editing a catalog spec would be the one change that never executes it. The same
// hole `playwright.catalog.config.ts` was added to close, one directory over.
test('a change to the catalog gate\'s own specs raises the catalog flag', () => {
  for (const file of ['e2e/catalog/catalog-bench.spec.ts', 'e2e/catalog/mark-height.spec.ts']) {
    assert.equal(planFor([file]).catalog, true, `${file} must raise the catalog flag`);
  }
  // …and it stays off for a change that cannot touch catalog output, or the flag means nothing.
  assert.equal(planFor(['src/landing/motion.ts']).catalog, false);
});

// THE SAME RULE ONE STEP OUT: the bench is the catalog gate's measurement, and a bench rule that
// keeps its measurement in its own module would otherwise be editable without ever running the
// gate that proves it stays quiet on 502 shipped designs.
test('the modules the runtime bench measures through raise the catalog flag', () => {
  for (const file of ['src/validation/runtimeBench.ts', 'src/validation/occlusion.ts']) {
    assert.equal(planFor([file]).catalog, true, `${file} must raise the catalog flag`);
  }
});

test('public legal pages select their clean-URL and responsive-layout spec', () => {
  for (const file of ['terms.html', 'privacy.html', 'src/legal.css']) {
    const { mode, specs } = planFor([file]);
    assert.equal(mode, 'subset');
    assert.deepEqual(specs, ['legal.spec.ts']);
  }
});

// The practice library lives under `docs/`, which is ignored wholesale, but three specs load
// files straight out of it. On 2026-08-30 the branch that grew it from 5 samples to 23 got a
// green CI run with every E2E shard SKIPPED - the plan saw only ignored paths. The carve-out is
// what makes an edit to a file a spec loads plan that spec; the rest of `docs/` stays ignored,
// and so does this folder's own README.
test('the SVG practice library plans the specs that load it, while the rest of docs stays ignored', () => {
  const { mode, specs } = planFor(['docs/svg-samples/scorebug.svg']);
  assert.equal(mode, 'subset');
  assert.deepEqual(specs, ['import-svg-behaviour.spec.ts', 'import-svg.spec.ts', 'motion-presets.spec.ts']);
  assert.equal(planFor(['docs/svg-samples/README.md']).mode, 'none');
  assert.equal(planFor(['docs/VERIFICATION.md']).mode, 'none');
  assert.equal(planFor(['docs/acceptance/owner-queue/example.txt']).mode, 'none');
});

// THE RULE: a change no spec can observe runs no specs, and the agent harness is that kind of
// change for the same reason `.github/` is. Measured over the 119 first-parent commits on `main`
// to 2026-09-04, eight escalated on nothing but `.claude/settings.json` or `.codex/config.toml`
// and each ran the 55-spec, 36.9-minute focus set to prove something Playwright cannot see.
// The regex stops at the directory boundary so `.claude-plugin/` - the PUBLISHED plugin manifest,
// which has a MAP rule of its own - is not swept up by a prefix match on `.claude`.
test('the agent harness plans nothing at all', () => {
  for (const file of [
    '.claude/settings.json',
    '.codex/config.toml',
    '.codex/environments/environment.toml',
    '.agents/skills/safe-merge/agents/openai.yaml',
    '.agent-workflows/queue-merge.md',
  ]) {
    const plan = planFor([file], { sprintFocus: true });
    assert.equal(plan.mode, 'none', `${file} should plan nothing`);
    assert.deepEqual(plan.unmapped, [], `${file} should be ignored outright, not escalate`);
  }
});

// THE RULE: a test cannot change the thing it tests. The suite-critical carve-out matches on a
// NAME, so `scripts/e2e-affected.test.mjs` was pulled back out of the wholesale `scripts/` ignore
// and escalated to the focus set - an accident of the regex, not a decision. The module it tests
// still escalates, because a mistake THERE is the one mistake that reports `mode: none` and goes
// green having run nothing.
test('a script test plans nothing, while the script it tests still escalates', () => {
  assert.equal(planFor(['scripts/e2e-affected.test.mjs']).mode, 'none');
  assert.equal(planFor(['scripts/e2e-durations.test.mjs']).mode, 'none');
  assert.equal(planFor(['scripts/dev-port.test.mjs']).mode, 'none');
  assert.equal(planFor(['scripts/e2e-affected.mjs']).mode, 'full');
  const focused = planFor(['scripts/e2e-affected.mjs'], { sprintFocus: true });
  assert.equal(focused.mode, 'subset');
  assert.ok(focused.focusApplied);
});

// The public docs screenshots belong to the docs.html edge: regenerating one must plan the specs
// that load and cross-link it without widening a merely similar public path into that subset.
test('public docs screenshots plan the docs edge without matching similar paths', () => {
  const screenshot = planFor(['public/docs/svg-drop.png']);
  assert.equal(screenshot.mode, 'subset');
  assert.deepEqual(screenshot.specs, ['docs.spec.ts', 'landing.spec.ts']);
  assert.equal(screenshot.catalog, false);

  const page = planFor(['docs.html']);
  assert.equal(page.mode, 'subset');
  assert.deepEqual(page.specs, ['docs.spec.ts', 'landing.spec.ts']);

  const lookalike = 'public/docs.png';
  const guard = planFor([lookalike]);
  assert.equal(guard.mode, 'full');
  assert.deepEqual(guard.unmapped, [lookalike]);
});

// ── The merge-commit blind spot, pinned against a REAL merge ────────────────
//
// THE RULE: a run whose HEAD took `main` in must plan from the FORK POINT, so the plan covers
// both sides' changes. Otherwise the diff base is the pre-merge branch tip, the file list is
// only what MAIN brought in, and a branch whose own work was a catalog change gets
// `catalog: false` - the calibration gate skipped, and a green verdict that was earned by the
// run BEFORE the merge.
//
// It is not hypothetical: replaying the last 120 merge-of-main commits in this repository
// through `planFor` from both bases, 71 of them (59%) would have been planned differently - 17
// of those skipping the catalog gate the combined tree needed, and 8 skipping E2E entirely with
// `mode: none`. Local `--integration` always did the right thing; CI passed an explicit base,
// which used to switch integration off.
//
// The test drives the real CLI over a real git repository with a real merge, because the thing
// under test IS the base resolution - `planFor` cannot see it. The `--no-integration` half is
// the mutation: it reproduces the old behaviour and proves the guard has something to catch.
test('a merge commit plans from the fork point, so the catalog gate is not skipped', () => {
  const repo = mkdtempSync(join(tmpdir(), 'e2e-affected-merge-'));
  // stderr is swallowed on purpose: git narrates every checkout and every CRLF conversion, and
  // this test's output should be its assertions, not a second git log.
  const git = (...args) =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const write = (rel, body) => {
    mkdirSync(dirname(join(repo, rel)), { recursive: true });
    writeFileSync(join(repo, rel), body);
  };
  const cli = fileURLToPath(new URL('./e2e-affected.mjs', import.meta.url));
  const plan = (...args) =>
    JSON.parse(execFileSync(process.execPath, [cli, ...args], { cwd: repo, encoding: 'utf8' }));

  try {
    git('init', '-b', 'main');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'Test');
    git('config', 'commit.gpgsign', 'false');
    write('README.md', 'base\n');
    git('add', '-A');
    git('commit', '-m', 'base');

    // The branch's OWN work is the catalog change - the half a post-merge diff cannot see.
    git('checkout', '-b', 'feature');
    write('src/templates/competition/esp09.ts', 'export const esp09 = {};\n');
    git('add', '-A');
    git('commit', '-m', 'add a design');
    const branchTip = git('rev-parse', 'HEAD');

    // …and main moves on, touching something that maps nowhere near the catalog.
    git('checkout', 'main');
    write('src/landing/motion.ts', 'export const motion = {};\n');
    git('add', '-A');
    git('commit', '-m', 'landing motion');

    git('checkout', 'feature');
    git('merge', '--no-ff', '-m', 'Merge branch main into feature', 'main');

    // THE MUTATION: the old behaviour, reproduced by switching integration off. CI passed
    // `github.event.before` - the pre-merge branch tip - and got exactly this.
    const pushBase = plan('--json', '--no-integration', branchTip);
    assert.equal(pushBase.catalog, false, 'the mutation must reproduce the skipped catalog gate');
    assert.ok(
      !pushBase.specs.includes('catalog-baseline.spec.ts'),
      'the mutation must also lose the catalog specs, or this test proves nothing',
    );

    // THE GUARD: the same base, with integration asked for. The fork point is an ancestor of the
    // push base, so the plan can only grow.
    const forked = plan('--json', '--integration', branchTip);
    assert.equal(forked.catalog, true, 'the merged tree carries a catalog change - the gate must run');
    assert.ok(forked.specs.includes('catalog-baseline.spec.ts'));
    assert.ok(forked.specs.includes('landing.spec.ts'), "main's side of the merge must be covered too");
    assert.equal(forked.base, git('merge-base', branchTip, 'main'));

    // …and with no base at all, which is how a person runs it, the same answer.
    assert.equal(plan('--json', '--integration').catalog, true);

    // A branch that has merged nothing from main keeps the base it was given: `--integration`
    // must not silently rewrite an explicit ref when there is no merge to integrate.
    git('checkout', 'main');
    assert.equal(plan('--json', '--integration', 'HEAD~1').base, 'HEAD~1');

    // …AND A MERGE THAT IS ALREADY ON MAIN IS SOMEBODY ELSE'S INTEGRATION. Land the feature
    // branch, cut a fresh branch from the resulting merge commit, and change one harmless file:
    // the inherited merge must not drag that branch's plan back to a fork point from the work
    // that landed. Measured failing on run 32301201748 - a six-file push planned six shards
    // instead of three because `main`'s tip happened to be a merge commit.
    git('merge', '--no-ff', '-m', 'Merge branch feature into main', 'feature');
    const landed = git('rev-parse', 'HEAD');
    git('checkout', '-b', 'fresh');
    write('src/legal.css', '/* tweak */\n');
    git('add', '-A');
    git('commit', '-m', 'tweak the legal page');
    const fresh = plan('--json', '--integration', landed);
    assert.equal(fresh.base, landed, 'an inherited merge is not this branch\'s integration');
    assert.deepEqual(fresh.specs, ['legal.spec.ts']);
    assert.equal(fresh.catalog, false);
  } finally {
    rmSync(repo, { recursive: true, force: true, maxRetries: 5 });
  }
});

// ── Shard sizing, pinned to what it is FOR ─────────────────────────────────
//
// THE RULE: the runner count follows measured minutes, not a file count. The old rule capped a
// subset at four shards however big it was, and under sprint focus plus the curated map a subset
// is routinely 70-100 of the 128 spec files - so 80% of the suite ran on 44% of the runners and
// finished later than the full suite beside it (run 32174589727: 103 specs, 58.3 min, 4 shards,
// 14.6 min per shard, against 7.4 min on the full run).
const FAKE_TABLE = { minutes: { 'a.spec.ts': 8, 'b.spec.ts': 4, 'c.spec.ts': 2, 'd.spec.ts': 1 } };
// A full plan's minutes come from the SUITE ON DISK, not from the table's keys, so a fake table
// needs a fake suite beside it - the third argument the real callers fill from `specFilesOnDisk`.
const FAKE_SUITE = ['a.spec.ts', 'b.spec.ts', 'c.spec.ts', 'd.spec.ts'];

test('shard count follows measured minutes, and a full plan still lands on nine', () => {
  // 15 measured minutes over the whole fake suite -> ceil(15 / 3) = 5.
  assert.equal(shardsFor({ mode: 'full', specs: [] }, FAKE_TABLE, FAKE_SUITE), 5);
  // A spec on disk the table has never measured counts as the MEDIAN (4 here), not as zero -
  // otherwise a stale table under-asks for runners exactly when it is least able to afford it.
  assert.equal(shardsFor({ mode: 'full', specs: [] }, FAKE_TABLE, [...FAKE_SUITE, 'new.spec.ts']), 7);
  // ...and an entry left behind by a deleted spec is not counted for work nobody will do.
  assert.equal(shardsFor({ mode: 'full', specs: [] }, FAKE_TABLE, ['a.spec.ts', 'b.spec.ts']), 4);
  // The real table is what CI uses, and it must reproduce the nine shards ci.yml has run since
  // 2026-08-08 - this change is about how a SUBSET is sized, not about resizing the full run.
  assert.equal(shardsFor({ mode: 'full', specs: [] }), 9);

  // A subset is sized by ITS OWN minutes, so a heavy plan gets more runners than a light one.
  assert.equal(shardsFor({ mode: 'subset', specs: ['a.spec.ts', 'b.spec.ts'] }, FAKE_TABLE), 4);
  assert.equal(shardsFor({ mode: 'subset', specs: ['d.spec.ts'] }, FAKE_TABLE), 1);
  // A plan too small to be worth splitting is not split: an extra runner costs about a minute
  // of setup, so below ~3 minutes of tests a second shard makes the answer arrive later.
  assert.equal(shardsFor({ mode: 'subset', specs: ['c.spec.ts'] }, FAKE_TABLE), 1);

  // The old cap is gone: a subset covering most of the suite gets most of the runners.
  const nearlyEverything = Object.keys(readTable().minutes).slice(0, 100);
  assert.ok(
    shardsFor({ mode: 'subset', specs: nearlyEverything }) > 4,
    'a subset worth more than four shards must be allowed to have them',
  );
});

test('shard count never leaves a plan with no runner, and never exceeds the ceiling', () => {
  assert.equal(shardsFor({ mode: 'none', specs: [] }, FAKE_TABLE), 1);
  assert.equal(shardsFor({ mode: 'subset', specs: [] }, FAKE_TABLE), 1);
  // Every entry unknown: each counts as the MEDIAN rather than as zero, or a plan made entirely
  // of brand-new spec files would ask for a single runner.
  const brandNew = ['new-1.spec.ts', 'new-2.spec.ts', 'new-3.spec.ts', 'new-4.spec.ts'];
  assert.ok(shardsFor({ mode: 'subset', specs: brandNew }, FAKE_TABLE) >= 2);
  // A table that has been deleted or emptied degrades to one shard rather than to a crash.
  assert.equal(shardsFor({ mode: 'full', specs: [] }, { minutes: {} }), 1);
  assert.ok(shardsFor({ mode: 'subset', specs: Object.keys(readTable().minutes) }) <= MAX_SHARDS);
});

// THE RULE: a shard is sized against the JOB CAP as well as against the throughput target, because
// the cap is what actually kills it. Run 33854844447 is the case: nine bins of 9.8 measured
// minutes, which the throughput target called comfortable, each behind a ten-minute install - two
// of them died at exactly 20 minutes and the whole run was recorded as cancelled.
test('the shard count answers the job cap too, not only the throughput target', () => {
  // 15 measured minutes with a normal per-job cost: the 3-minute throughput target asks for five
  // runners and the cap asks for one, so nothing changes.
  assert.equal(shardsFor({ mode: 'full', specs: [] }, FAKE_TABLE, FAKE_SUITE), 5);

  // The same suite with a per-job cost that eats most of the cap. A shard can now carry only a
  // minute of tests, so the cap - not the target - decides, and it asks for more runners.
  const expensive = { ...FAKE_TABLE, overhead: { jobMinutes: 16, testFactor: 1 } };
  assert.equal(budgetMinutes(expensive), 1);
  assert.equal(shardsFor({ mode: 'full', specs: [] }, expensive, FAKE_SUITE), 9); // 15 bins wanted, 9 given

  // And the ceiling still holds however bad the reading gets: this function decides a runner
  // count, never which tests run, so it must not be able to ask for an unbounded matrix.
  const absurd = { ...FAKE_TABLE, overhead: { jobMinutes: 1000, testFactor: 1 } };
  assert.equal(shardsFor({ mode: 'full', specs: [] }, absurd, FAKE_SUITE), MAX_SHARDS);
});

test('the plan states the wall clock it expects, and says when that does not fit', () => {
  const suite = ['a.spec.ts', 'b.spec.ts', 'c.spec.ts', 'd.spec.ts'];
  // Four bins, one spec each: 8, 4, 2 and 1 measured minutes, plus one minute of job overhead at
  // a factor of one.
  const cheap = { ...FAKE_TABLE, overhead: { jobMinutes: 1, testFactor: 1 } };
  const bins = packShards(suite, 4, cheap);
  const predicted = bins.map((bin) => predictShardMinutes(bin.reduce((sum, s) => sum + cheap.minutes[s], 0), cheap));
  assert.deepEqual(predicted, [9, 5, 3, 2]);
  assert.equal(predicted.filter((m) => m > SHARD_CAP_MINUTES - SHARD_SAFETY_MINUTES).length, 0);

  // The same assignment behind a ten-minute install is the run that died: the heaviest bin is now
  // predicted at 18 minutes, inside the 20-minute cap but through the variance margin, which is
  // the point at which the plan has to say so rather than find out.
  const costly = { ...FAKE_TABLE, overhead: { jobMinutes: 10, testFactor: 1 } };
  const worst = predictShardMinutes(8, costly);
  assert.equal(worst, 18);
  assert.ok(worst > SHARD_CAP_MINUTES - SHARD_SAFETY_MINUTES);
});

// THE RULE: a component that lives outside every directory rule must name its own surfaces.
// `MotionPresetPicker.tsx` sits directly under src/components/, which no wide rule covers, so
// its line in MAP is the whole of its coverage - and a line that names only the component's own
// spec is indistinguishable from one that is right. On 2026-08-23 it was the former: the picker
// grew a direction-arrow row in the wizard Travel box's class and ux.spec.ts, which walks that
// step, went red on a shard nothing had planned.
// A MAP rule naming a path that no longer exists is silent: it matches nothing, the file falls
// through to the unmapped escalation, and the plan looks conservative rather than broken. That is
// what happened to the timeline dock's five components when they moved into
// `src/components/timeline/` - both rules kept naming `src/components/<Name>` and every timeline
// change ran the full suite to prove nothing. Pinned by DIRECTORY, so the next move fails here
// instead of going quiet again.
test('the timeline dock components are mapped at the path they actually live at', () => {
  for (const file of [
    'src/components/timeline/StepTimeline.tsx',
    'src/components/timeline/LegacyTimeline.tsx',
    'src/components/timeline/Inspector.tsx',
    'src/components/timeline/PlayoutSimulator.tsx',
    'src/components/timeline/MachineGraph.tsx',
  ]) {
    const { mode, specs } = planFor([file]);
    assert.equal(mode, 'subset', `${file} is mapped, so it must not escalate to the full suite`);
    assert.ok(specs.length > 0, `${file} planned no specs at all`);
  }
  // The dock's own specs, and the key contract StepTimeline holds half of.
  const { specs } = planFor(['src/components/timeline/StepTimeline.tsx']);
  for (const spec of ['timeline-v2.spec.ts', 'anim-engine.spec.ts', 'keyboard.spec.ts']) {
    assert.ok(specs.includes(spec), `${spec} must be planned by a StepTimeline change`);
  }
});

test('the universal motion picker plans the wizard steps that MOUNT it, not just its own spec', () => {
  const { mode, specs } = planFor(['src/components/MotionPresetPicker.tsx']);
  assert.equal(mode, 'subset', 'the picker is mapped, so it must not escalate to the full suite');
  for (const spec of ['motion-presets.spec.ts', 'ux.spec.ts', 'wizard-preview.spec.ts']) {
    assert.ok(specs.includes(spec), `${spec} renders the picker and must be planned by a picker change`);
  }
});

// ── The ARGUMENT gate ───────────────────────────────────────────────────────
//
// THE RULE: an argument this CLI does not recognise stops it, and never falls through to the
// plan. This was the most expensive fail-open in the repository. Unrecognised flags were
// dropped by a `startsWith('--')` filter and never looked at again, so a misspelt PLAN-ONLY
// flag left `listOnly` false and the command RAN: `--print` is not `--list`, and on 2026-08-30
// it spawned `npx playwright test` with no spec arguments - which is not "no tests", it is all
// 1179 of them - plus the 25-minute catalog gate, beside another session's live run on a
// RAM-bound laptop where one browser job per machine is the standing rule (AGENTS.md
// "Verifying changes" rule 3). Two sessions hit it within hours.
//
// `parseArgs` is pure and exported so the refusal is pinned without a git repo, a browser or a
// minute on the clock - the same reason `planFor` and `runPlan` are.

test('an unrecognised flag is refused, and the refusal names it', () => {
  const r = parseArgs(['--print']);
  assert.equal(r.ok, false);
  assert.equal(r.help, false);
  assert.match(r.message, /unrecognised flag: --print/);
  // The message has to be actionable, or the next person guesses again.
  assert.match(r.message, /--list/);
  assert.match(r.message, /--json/);
});

test('a single-dash argument is a flag, not a base ref', () => {
  // No git ref may begin with '-', so `-h` reaching `git diff` as a base was never anything but
  // a confusing crash. It is now a named refusal.
  for (const arg of ['-h', '-j', '-list']) {
    const r = parseArgs([arg]);
    assert.equal(r.ok, false, `${arg} must be refused`);
    assert.match(r.message, new RegExp(`unrecognised flag: ${arg}`));
  }
});

test('one bad flag among good ones still stops the run', () => {
  const r = parseArgs(['--json', '--print', '--focus']);
  assert.equal(r.ok, false, 'a valid --json must not excuse the flag beside it');
  assert.match(r.message, /--print/);
});

test('every unrecognised flag is named, not just the first', () => {
  const r = parseArgs(['--print', '--dry-run']);
  assert.equal(r.ok, false);
  assert.match(r.message, /--print/);
  assert.match(r.message, /--dry-run/);
});

test('a second base ref is refused rather than silently dropped', () => {
  // The old parser took the FIRST non-flag argument and ignored the rest, so correcting a ref
  // by typing another one planned from the ref you had just replaced.
  const r = parseArgs(['abc123', 'def456']);
  assert.equal(r.ok, false);
  assert.match(r.message, /at most one base ref/);
  assert.match(r.message, /abc123, def456/);
});

test('--help is a clean exit, not an error', () => {
  const r = parseArgs(['--help']);
  assert.equal(r.ok, false, 'help does not produce a plan');
  assert.equal(r.help, true, 'but it is not a failure either');
  assert.match(r.message, /usage: node scripts\/e2e-affected\.mjs/);
});

test('the accepted arguments parse into the plan inputs unchanged', () => {
  assert.deepEqual(parseArgs([]), { ok: true, flags: new Set(), base: undefined });
  const r = parseArgs(['--integration', '--focus', 'abc123']);
  assert.equal(r.ok, true);
  assert.equal(r.base, 'abc123');
  assert.deepEqual([...r.flags].sort(), ['--focus', '--integration']);
  // Order must not matter: CI writes the ref last, a person often writes it first.
  assert.deepEqual(parseArgs(['abc123', '--json']).flags, new Set(['--json']));
  assert.equal(parseArgs(['abc123', '--json']).base, 'abc123');
});

// THE RULE THAT KEEPS THE GATE FROM TURNING RED: every flag a REAL caller passes must be in the
// accepted set. A fail-open bug traded for a broken CI step is not an improvement, and the
// callers are the only authority on what is legitimate - so they are read here, not remembered.
// Covers package.json's scripts and the CI workflow; a new caller that invents a flag fails
// here rather than on `main`.
test('every flag the real callers pass is accepted', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const seen = new Set();
  for (const rel of ['package.json', '.github/workflows/ci.yml']) {
    const text = readFileSync(join(root, rel), 'utf8');
    // Each invocation, up to the end of its command: flags only ever follow the script name.
    for (const m of text.matchAll(/e2e-affected\.mjs([^"'\n)]*)/g)) {
      for (const flag of m[1].match(/(?:^|\s)--?[a-z][\w-]*/g) ?? []) seen.add(flag.trim());
    }
  }
  assert.ok(seen.size > 0, 'found no invocations at all - the scan regex has gone stale');
  for (const flag of seen) {
    const r = parseArgs([flag]);
    assert.equal(r.ok || r.help, true, `${flag} is passed by a real caller but the CLI refuses it`);
  }
  // The flags in use when this rule was written, so a caller LOSING one is visible too.
  for (const flag of ['--json', '--all', '--integration', '--focus']) {
    assert.ok(seen.has(flag), `${flag} is no longer passed by any caller - has a caller changed?`);
  }
});

// THE PACKER. Since 2026-09-04 CI hands each runner an explicit spec-file list instead of letting
// Playwright split the plan by test count (ci.yml's `strategy` comment carries the measurement:
// a 1.66x spread across nine shards, four of thirty main runs killed at the 20-minute cap).
//
// That trade buys balance and costs a safety property. Under `--shard=i/n` a wrong duration only
// ever cost wall clock, because Playwright divided the union of the whole plan; under an explicit
// assignment, a spec that falls out of the lists is a spec NOBODY RUNS. Everything below exists to
// make that failure impossible to ship quietly rather than merely unlikely.
const PACK_TABLE = { minutes: { 'a.spec.ts': 6, 'b.spec.ts': 3, 'c.spec.ts': 3, 'd.spec.ts': 2, 'e.spec.ts': 2 } };

test('packing divides the input and never loses or repeats a spec', () => {
  const specs = Object.keys(PACK_TABLE.minutes);
  for (const n of [1, 2, 3, 4, 5]) {
    const bins = packShards(specs, n, PACK_TABLE);
    const flat = bins.flat();
    assert.equal(flat.length, specs.length, `${n} bins: wrong total`);
    assert.deepEqual([...flat].sort(), [...specs].sort(), `${n} bins: membership changed`);
    assert.equal(new Set(flat).size, flat.length, `${n} bins: a spec was assigned twice`);
  }
});

test('every bin has work, so no runner is ever handed an empty filter', () => {
  // An empty argument list is not "no tests" to Playwright, it is EVERY test - so more shards
  // than specs must collapse to fewer bins rather than produce one that runs the whole suite.
  const bins = packShards(['a.spec.ts', 'b.spec.ts'], 9, PACK_TABLE);
  assert.equal(bins.length, 2);
  for (const bin of bins) assert.ok(bin.length > 0);
  assert.deepEqual(packShards([], 9, PACK_TABLE), []);
});

test('packing balances by measured minutes, not by file count', () => {
  // 16 minutes over 4 bins. The point is that the MINUTES come out even and the 6-minute spec,
  // which no split can divide, ends up alone rather than stacked on top of another file.
  const bins = packShards(Object.keys(PACK_TABLE.minutes), 4, PACK_TABLE);
  const totals = bins.map((b) => b.reduce((sum, s) => sum + PACK_TABLE.minutes[s], 0));
  assert.equal(Math.max(...totals), 6, 'the heaviest bin should be the single 6-minute spec');
  assert.equal(totals.reduce((a, b) => a + b, 0), 16);
});

test('a spec the table has never measured is packed, not dropped', () => {
  // The hazard ci.yml refused bin-packing over for three weeks. An unmeasured spec counts as the
  // median - the same convention `shardsFor` uses - and must still reach a runner.
  const specs = [...Object.keys(PACK_TABLE.minutes), 'brand-new.spec.ts'];
  const bins = packShards(specs, 3, PACK_TABLE);
  assert.ok(bins.flat().includes('brand-new.spec.ts'));
  assert.equal(bins.flat().length, specs.length);
});

test('the whole suite on disk packs into nine bins with every file assigned once', () => {
  // Against the REAL table and the REAL directory, which is what CI does. This is the test that
  // fails if a spec file is added while the packer or the table reader is broken.
  const suite = specFilesOnDisk();
  const bins = packShards(suite, MAX_SHARDS, readTable());
  assert.equal(bins.length, MAX_SHARDS);
  assert.deepEqual([...bins.flat()].sort(), [...suite].sort());
});

// PLAYWRIGHT'S POSITIONAL ARGS ARE REGEXES over the whole file path, not file names. Five spec
// files in e2e/ are substrings of others (control, format, import, project, and their longer
// partners), so an unanchored filter would put the same file on two shards.
test('a spec filter matches its own file and not a longer name containing it', () => {
  const re = new RegExp(specFilterArg('control.spec.ts'));
  assert.ok(re.test('/home/runner/work/repo/e2e/control.spec.ts'), 'POSIX path');
  assert.ok(re.test('C:\\repo\\e2e\\control.spec.ts'), 'Windows path');
  assert.ok(!re.test('/home/runner/work/repo/e2e/ai-more-control.spec.ts'));
  assert.ok(!re.test('/home/runner/work/repo/e2e/hosted-control.spec.ts'));
  // The dot is a metacharacter until it is escaped, so `aXspec.ts` must not match `a.spec.ts`.
  assert.ok(!new RegExp(specFilterArg('a.spec.ts')).test('/e2e/aXspec.ts'));
});

test('no two spec files on disk share a filter', () => {
  // The whole assignment rests on each filter selecting exactly one file, so assert it across the
  // real suite rather than against the five collisions that happen to exist today.
  const suite = specFilesOnDisk();
  for (const spec of suite) {
    const re = new RegExp(specFilterArg(spec));
    const hits = suite.filter((other) => re.test(`/e2e/${other}`));
    assert.deepEqual(hits, [spec], `${specFilterArg(spec)} selects ${hits.join(', ')}`);
  }
});

// ── THE BASE RESOLVERS, ASKED OF A NAMED REPOSITORY ─────────────────────────────────────────
//
// `branchBase`, `headIsMainMerge` and `integrationBase` were local to this file's own CLI until
// 2026-09-04, when `scripts/catalog-affected.mjs` came to need the identical answer: after a
// branch takes main in, its merge-base with main IS main's tip, so the pre-land CATALOG gate was
// planning only the branch's own designs and everything main had brought was invisible to it.
// The failure is the silent one - naming too FEW designs measures a smaller slice and nothing
// goes red - which is why the fix is a shared implementation rather than a second copy.
//
// They take a `cwd` for the same reason `changedFilesSince` does: catalog-affected pins every
// git call to the repository root rather than to wherever the process was started, and a base
// resolved in one repository and diffed in another is a crash, not a smaller answer. That
// parameter is also what lets this test drive them over a REAL repository with a REAL merge,
// which is the only way to test base resolution at all.
test('the base resolvers answer for the repository they are given, before and after a merge', () => {
  const repo = mkdtempSync(join(tmpdir(), 'e2e-affected-base-'));
  // stderr swallowed on purpose: git narrates every checkout, and this test's output should be
  // its assertions rather than a second git log.
  const git = (...args) =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const write = (rel, text) => {
    mkdirSync(dirname(join(repo, rel)), { recursive: true });
    writeFileSync(join(repo, rel), text);
  };

  try {
    git('init', '-b', 'main');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'Test');
    git('config', 'commit.gpgsign', 'false');
    write('README.md', 'base\n');
    git('add', '-A');
    git('commit', '-m', 'base');
    const forkPoint = git('rev-parse', 'HEAD');

    git('checkout', '-b', 'feature');
    write('docs/NOTES.md', 'notes\n');
    git('add', '-A');
    git('commit', '-m', 'a doc');

    // BEFORE the merge: the branch base IS the fork point, and there is no integration to do.
    assert.equal(headIsMainMerge(repo), false);
    assert.equal(integrationBase(repo), null);
    assert.equal(branchBase(repo), forkPoint);

    git('checkout', 'main');
    write('src/model/fonts.ts', 'export const FONTS = [];\n');
    git('add', '-A');
    git('commit', '-m', 'a font');
    const mainTip = git('rev-parse', 'HEAD');

    git('checkout', 'feature');
    git('merge', '--no-ff', '-m', 'Merge branch main into feature', 'main');

    // AFTER it: the ordinary base has collapsed onto main's tip, which is exactly the blindness
    // - everything main brought is now "already in the base" and invisible to a plan built on it.
    assert.equal(branchBase(repo), mainTip, 'the mutation: the ordinary base is main itself');
    // The fork point is what restores both sides, and it is an ANCESTOR of that base, so a plan
    // built on it can only grow.
    assert.equal(headIsMainMerge(repo), true);
    assert.equal(integrationBase(repo), forkPoint);
    assert.ok(changedFilesSince(forkPoint, repo).includes('src/model/fonts.ts'));
    assert.ok(!changedFilesSince(mainTip, repo).includes('src/model/fonts.ts'));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

// THE QUARANTINE SPLIT. What the shards get and what the quarantine job gets are one input divided,
// and a quarantined spec the plan never selected is nobody's business.
import { splitQuarantined } from './e2e-affected.mjs';

test('quarantined specs leave the blocking list and are reported as e2e/ paths', () => {
  const split = splitQuarantined(['a.spec.ts', 'b.spec.ts', 'c.spec.ts'], ['e2e/b.spec.ts', 'e2e/zzz.spec.ts']);
  assert.deepEqual(split, { blocking: ['a.spec.ts', 'c.spec.ts'], quarantined: ['e2e/b.spec.ts'] });
  assert.deepEqual(splitQuarantined(['a.spec.ts'], []), { blocking: ['a.spec.ts'], quarantined: [] });
  assert.deepEqual(splitQuarantined([], ['e2e/a.spec.ts']), { blocking: [], quarantined: [] });
});
