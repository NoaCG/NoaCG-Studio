#!/usr/bin/env node
// Turn a Playwright JSON report from the configured suite into a VERDICT.
//
// WHY THIS IS A SCRIPT AND NOT INLINE YAML. Two workflows now run the same specs against different
// backends - configured-suite.yml against a local `supabase start` stack, hosted-latency.yml
// against the hosted staging project - and both must judge the result identically. Eighty lines of
// jq duplicated across two files is exactly the shape that drifts: on 2026-08-25 a shared e2e
// helper was fixed for one of its two callers and broke the other, in a file whose own header says
// the two walks must not drift. One implementation, two callers, and a test that pins the
// behaviour.
//
// WHAT IT JUDGES, and why each one exists:
//   - NOTHING SKIPPED outside an explicit allowlist. Every spec calls `test.skip(!haveCreds, …)`,
//     so a run with the environment unset executes NOTHING and exits 0. A job reading only the
//     exit code is permanently, silently green - the hole that let five specs sit on main
//     unverified.
//   - AT LEAST minTests ran. Catches what the skip check cannot: a spec file that stops being
//     collected at all.
//   - Zero failures and zero FLAKES. A flake is a real signal here; it is the repeat REPORTING
//     that is suppressed elsewhere, never the verdict. The one exception is the quarantine, which
//     only configured-suite.yml asks for (`--quarantine`, see `quarantineSplit`): there a flake is
//     recorded in e2e/quarantine.json instead of reddening the run, as ci.yml does for the main
//     suite.
//
// It also fingerprints the failure set so the caller can tell "the same known problem again" from
// "something new" - see the rolling-issue step in either workflow.
//
// THE FLOOR AND THE ALLOWLIST LIVE IN ONE FILE, e2e/configured/expected-run.json, which both
// workflows pass. They used to be each workflow's own MIN_TESTS and ALLOWED_SKIPS, and the copies
// drifted: bridge-real-server.spec.ts was allowlisted in configured-suite.yml on 2026-09-22 and
// never in hosted-latency.yml, so every hosted run from then on was red with 0 failed (issue #382),
// and that job's floor sat at 33 against 54 tests.
//
//   node scripts/configured-verdict.mjs <report.json> --expect e2e/configured/expected-run.json
//
// Writes a human summary to stdout, GitHub `::error` lines to stdout, a markdown block to
// $GITHUB_STEP_SUMMARY and key=value pairs to $GITHUB_OUTPUT when those are set. Exits 0 always:
// the CALLER decides what a non-green verdict costs, because the two workflows differ there.
import { appendFileSync, readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { quarantinedSpecs, readStore } from './e2e-quarantine.mjs';
import { changedSince } from './e2e-retry.mjs';
import { editedSpecs, specPath } from './e2e-spec-names.mjs';

/** Every spec in the report, at any nesting depth. Playwright nests suites per file and per
 *  describe, so a flat pick of `.specs[]` from every object is the honest way to reach them all. */
export function allSpecs(report) {
  const found = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.specs)) found.push(...node.specs);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  };
  walk(report);
  return found;
}

const statuses = (spec) => (spec.tests ?? []).flatMap((t) => (t.results ?? []).map((r) => r.status));

/**
 * A spec that actually RAN and went wrong, as opposed to one that never ran.
 *
 * `isUnclean` below is deliberately wider - it is true of a skipped spec too, because the
 * fingerprint has to tell "everything skipped" apart from a clean run. An ANNOTATION cannot be
 * that wide: when the local stack does not come up every spec skips, and naming all of them as
 * failing specs would put innocent files into the failure set, the rolling issue and the
 * cross-commit report - where an environment fault, which repeats across commits by its nature,
 * would headline as a flaky spec.
 */
const reallyFailed = (spec) => statuses(spec).some((s) => s !== 'passed' && s !== 'skipped');

/** A spec is "not clean" if ANY attempt failed - a flake is `failed > passed`, so reading only the
 *  LAST status sees `passed` and fingerprints the empty set. Written that way first and caught
 *  against two real reports that each held a flaky spec and both hashed to SHA1(""). */
export const isUnclean = (spec) => statuses(spec).some((s) => s !== 'passed');
const lastStatus = (spec) => statuses(spec).at(-1) ?? 'not run';

/**
 * One spec's path as the rest of the repo names it - `e2e/configured/production-links.spec.ts`.
 *
 * Playwright writes `spec.file` relative to the config's `rootDir`, which is an absolute runner
 * path (`/home/runner/work/NoaCG-Studio/NoaCG-Studio/e2e/configured`). The failure set, the
 * quarantine and the annotations all key on the REPO-RELATIVE path, so the prefix has to come
 * back - and it comes from the workspace root the caller passes, never from a hardcoded
 * `e2e/configured`, which would go on looking right the day the config's testDir moves.
 *
 * Null when the workspace is unknown or the report was written somewhere else entirely. A wrong
 * prefix is worse than none: `production-links.spec.ts` and `e2e/configured/production-links.
 * spec.ts` are two identities, and a set that mixes them dedups against nothing.
 */
export function repoRelative(file, rootDir, workspace) {
  const dir = String(rootDir ?? '').replaceAll('\\', '/').replace(/\/+$/, '');
  const root = String(workspace ?? '').replaceAll('\\', '/').replace(/\/+$/, '');
  if (!file || !dir || !root) return null;
  if (dir === root) return String(file);
  return dir.startsWith(`${root}/`) ? `${dir.slice(root.length + 1)}/${file}` : null;
}

/**
 * One not-clean spec as the rolling issue prints it.
 *
 * BOTH statuses, never just the last one. A flake ends `passed` and is red here on purpose, so
 * printing the last status alone would put "passed" beside a spec the suite went red over.
 * Exported because the issue body and its test must not drift - a test that rebuilt this string
 * itself would pass while the real one was wrong.
 */
export const failingLine = (s) =>
  `- \`${s.file}\` - ${s.title} (${s.statuses.join(' then ')})`;

/**
 * The expected run, parsed from its JSON text and checked, because a missing or mistyped floor
 * would otherwise read as 0 and pass anything. Throws with the reason; the CLI turns that into a
 * red verdict. Returns the shape `verdict` takes.
 */
export function readExpectations(text) {
  const parsed = JSON.parse(text);
  const { minTests, allowedSkips } = parsed ?? {};
  if (!Number.isInteger(minTests) || minTests < 1) {
    throw new Error(`minTests must be a positive integer, got ${JSON.stringify(minTests)}`);
  }
  if (!allowedSkips || typeof allowedSkips !== 'object' || Array.isArray(allowedSkips)) {
    throw new Error('allowedSkips must be an object of spec file -> reason');
  }
  const unexplained = Object.entries(allowedSkips).filter(([, why]) => typeof why !== 'string' || !why.trim());
  if (unexplained.length) {
    throw new Error(`every allowed skip needs its reason: ${unexplained.map(([file]) => file).join(', ')}`);
  }
  return { minTests, allowedSkips: Object.keys(allowedSkips).join(' ') };
}

/**
 * THE QUARANTINE, for the one caller that keeps it (configured-suite.yml; hosted-latency.yml passes
 * none and keeps every flake red). The same rule ci.yml applies to the main suite
 * (scripts/e2e-quarantine.mjs): a spec file that failed and then passed on one commit is a flake,
 * not a regression. Here the second run is the config's own `retries: 1`, so the receipt is in this
 * report already. Decided per spec FILE, because the store's identity is the file:
 *
 *   - a file already in the quarantine is excused whatever it did, and its outcome becomes its
 *     commit status (`success` only when every test of it ran clean; a file that only skipped
 *     says nothing), which is what earns its release;
 *   - a file whose every unclean test failed and then passed is a flake, named for entry - but
 *     only when nothing else in the run is red (ci.yml quarantines only behind a green gate);
 *   - neither applies to a file the change under test edits (a flake in a spec the change wrote
 *     is the change's, as ci.yml's retry and the planner's quarantine split both hold) or one
 *     whose repository path is unknown;
 *   - anything else that failed stays red, exactly as before.
 *
 * @param {object[]} specs every spec in the report
 * @param {{ quarantined: string[], edited: Set<string>, rootDir?: string, workspace?: string }} opts
 *   `quarantined` and `edited` are repo-relative paths
 * @returns {{ held: Set<object>, flakes: Set<object>, enter: string[], outcomes: Record<string, 'success'|'failure'> }}
 *   `held` and `flakes` are the excusable specs; `enter` names the flakes' files
 */
export function quarantineSplit(specs, { quarantined, edited, rootDir, workspace }) {
  const inStore = new Set(quarantined);
  const byFile = new Map();
  for (const s of specs) {
    const path = repoRelative(s.file, rootDir, workspace);
    if (!byFile.has(s.file)) byFile.set(s.file, { path, specs: [] });
    byFile.get(s.file).specs.push(s);
  }
  const held = new Set();
  const flakes = new Set();
  const enter = [];
  const outcomes = {};
  for (const { path, specs: own } of byFile.values()) {
    if (!path) continue;
    const unclean = own.filter(reallyFailed);
    if (inStore.has(path)) {
      if (unclean.length) outcomes[path] = 'failure';
      else if (own.some((s) => statuses(s).includes('passed'))) outcomes[path] = 'success';
      if (!edited.has(path)) own.forEach((s) => held.add(s));
    } else if (!edited.has(path) && unclean.length && unclean.every((s) => lastStatus(s) === 'passed')) {
      own.forEach((s) => flakes.add(s));
      enter.push(path);
    }
  }
  return { held, flakes, enter: enter.sort(), outcomes };
}

/**
 * How many tests in `specs` failed, and how many failed and then passed, by each test's own
 * outcome as Playwright reported it (`unexpected`, `flaky`), so the count agrees with its stats.
 * A test without one (a hand-built fixture) is read off its results.
 */
function counts(specs) {
  let unexpected = 0;
  let flaky = 0;
  for (const s of specs) {
    for (const t of s.tests ?? []) {
      const outcome = outcomeOf(t);
      if (outcome === 'unexpected') unexpected += 1;
      else if (outcome === 'flaky') flaky += 1;
    }
  }
  return { unexpected, flaky };
}

function outcomeOf(test) {
  if (test.status) return test.status;
  const st = (test.results ?? []).map((r) => r.status);
  const last = st.at(-1);
  if (!last || last === 'skipped') return 'skipped';
  if (last !== 'passed') return 'unexpected';
  return st.every((x) => x === 'passed') ? 'expected' : 'flaky';
}

export function verdict(report, { minTests, allowedSkips, workspace = '', quarantined = null, edited = new Set() }) {
  const stats = report?.stats ?? {};
  const expected = stats.expected ?? 0;
  const unexpected = stats.unexpected ?? 0;
  const flaky = stats.flaky ?? 0;
  const skipped = stats.skipped ?? 0;
  const ran = expected + unexpected + flaky;

  const specs = allSpecs(report);
  const allowed = new Set(allowedSkips.split(/\s+/).filter(Boolean));
  const unexpectedSkips = [
    ...new Set(specs.filter((s) => lastStatus(s) === 'skipped').map((s) => s.file)),
  ]
    .filter((file) => !allowed.has(file))
    .sort();

  // What is red, after the quarantine has excused what it may. Without one, the stats as they are.
  // With one, counted over the specs not excused, never by subtraction from the stats: a count
  // that disagreed with Playwright's by one would otherwise hide a real failure elsewhere.
  const split = quarantined
    ? quarantineSplit(specs, { quarantined, edited, rootDir: report?.config?.rootDir, workspace })
    : { held: new Set(), flakes: new Set(), enter: [], outcomes: {} };
  const redWithout = (set) => counts(specs.filter((s) => !set.has(s)));
  const withFlakes = new Set([...split.held, ...split.flakes]);
  const redWithFlakes = redWithout(withFlakes);
  // A flake is quarantined only from an otherwise green run, as ci.yml enters one only behind a
  // green gate: in a red run it is part of what went wrong, and stays in the failure set.
  const flakesExcused =
    split.flakes.size > 0 && !redWithFlakes.unexpected && !redWithFlakes.flaky && !unexpectedSkips.length && ran >= minTests;
  const excused = flakesExcused ? withFlakes : split.held;
  const enter = flakesExcused ? split.enter : [];
  const { outcomes } = split;
  const red = !quarantined ? { unexpected, flaky } : flakesExcused ? redWithFlakes : redWithout(excused);
  const excusedCounts = counts([...excused]);
  const excusedTests = excusedCounts.unexpected + excusedCounts.flaky;

  const unclean = specs.filter((s) => isUnclean(s) && !excused.has(s));
  const failSet = unclean
    .map((s) => `${s.file}::${s.title}`)
    .sort();

  // The same specs, with everything an ANNOTATION needs. Until 2026-09-09 this suite told GitHub
  // only a count - the failing job's annotations were `.github` placeholders and "0 failed, 1
  // flaky" - so `scripts/ci-failure-set.mjs` could never name more than the job, and every
  // configured red in the repo's history reads `job: Configured E2E (authenticated, local
  // Supabase)`. Measured over the seven days to 2026-09-09: seven reds on seven distinct commits
  // of main, not one of them naming a spec. Playwright's own `github` reporter would not have
  // helped, because a FLAKY test is `ok()` to it and this suite counts flaky as red on purpose.
  const failing = unclean
    .filter(reallyFailed)
    .map((s) => ({
      file: s.file,
      path: repoRelative(s.file, report?.config?.rootDir, workspace),
      title: s.title,
      line: s.line ?? 0,
      status: lastStatus(s),
      statuses: statuses(s),
    }))
    .sort((a, b) => `${a.file}${a.title}`.localeCompare(`${b.file}${b.title}`));
  const failHash = createHash('sha1').update(failSet.join('\n')).digest('hex').slice(0, 12);

  const problems = [];
  if (unexpectedSkips.length) {
    problems.push({
      title: 'Unexpected skip',
      detail: `These spec files skipped:${unexpectedSkips.map((f) => ` ${f}`).join('')}. Nothing should skip - every credential and capability is present by construction, so a skip means the environment did not come up the way this job assumes.`,
    });
  }
  if (ran < minTests) {
    problems.push({
      title: 'Too few tests ran',
      detail: `${ran} test(s) executed, expected at least ${minTests}.`,
    });
  }
  if (red.unexpected !== 0 || red.flaky !== 0) {
    problems.push({ title: 'Configured suite is red', detail: `${red.unexpected} failed, ${red.flaky} flaky.` });
  }

  return {
    green: problems.length === 0,
    ran, expected, unexpected, flaky, skipped,
    // The hard failures that count: the rolling issue keeps its quiet only for a run with none.
    hardFail: red.unexpected,
    problems, failHash, failSet, failing, specs,
    enter,
    outcomes,
    summary: `${ran} ran, ${skipped} skipped, ${unexpected} failed, ${flaky} flaky${excusedTests ? ` (${excusedTests} of them quarantined)` : ''}`,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('configured-verdict.mjs')) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const valueOf = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
  };
  const expectFile = valueOf('--expect', '');
  const label = valueOf('--label', 'Configured suite');
  // The quarantine store, and the base the change under test is diffed from. Both absent for
  // hosted-latency.yml, which keeps every flake red. The edited specs are read exactly as ci.yml's
  // retry reads them (`changedSince`, `editedSpecs`), so the two refusals cannot disagree.
  const quarantineFile = valueOf('--quarantine', '');
  const edited = new Set([...editedSpecs(changedSince(valueOf('--changed', '')))].map(specPath));

  const out = (line) => console.log(line);
  const emit = (name, value) => {
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  };

  /** Nothing could be judged: loud, and not-green rather than thrown, because the CALLER decides
   *  the cost. */
  const unjudged = (title, message, summary) => {
    out(`::error title=${title}::${message}`);
    emit('green', 'false');
    emit('summary', summary);
  };

  let expected = null;
  try {
    expected = readExpectations(readFileSync(expectFile, 'utf8'));
  } catch (error) {
    unjudged('No expected run', `Could not read the expected run from "${expectFile}" (${error.message}), so nothing below can be judged.`, 'no readable expected run - the verdict could not be judged');
    process.exit(0);
  }

  // A MULTILINE output needs the delimiter form, and the delimiter has to be a string the
  // value cannot contain: a spec title carrying it would close the block early and the rest
  // of the list would be read as further key=value pairs.
  const emitBlock = (name, value) => {
    if (!process.env.GITHUB_OUTPUT) return;
    const end = `__${name}_${randomUUID()}__`;
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<${end}\n${value}\n${end}\n`);
  };

  let report = null;
  try {
    report = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    // No report at all is its own verdict, and a loud one: the suite never got far enough to
    // write one.
    unjudged('No report', `Could not read ${file} - the run never produced one (${error.message}).`, 'no JSON report - the run never started');
  }

  // A store this build cannot read quarantines nothing: every flake stays red, the direction that
  // hides nothing.
  let quarantined = null;
  if (quarantineFile) {
    try {
      quarantined = quarantinedSpecs(readStore(quarantineFile));
    } catch (error) {
      out(`::warning title=Quarantine unreadable::${quarantineFile}: ${error.message}. Every flake below counts as red.`);
    }
  }

  if (report) {
    const v = verdict(report, { ...expected, workspace: process.env.GITHUB_WORKSPACE ?? '', quarantined, edited });
    out(`Ran ${v.ran} tests (${v.expected} passed, ${v.unexpected} failed, ${v.flaky} flaky), ${v.skipped} skipped.`);
    for (const p of v.problems) out(`::error title=${p.title}::${p.detail}`);
    for (const spec of v.enter) {
      out(`::warning file=${spec},title=${label}::${spec} failed and then passed on its retry on this commit - a flake, not a regression. It is being quarantined (e2e/quarantine.json).`);
    }
    for (const [spec, outcome] of Object.entries(v.outcomes)) out(`Quarantined: ${spec} ${outcome === 'success' ? 'passed' : 'failed'}.`);
    emit('enter', JSON.stringify(v.enter));
    emit('outcomes', JSON.stringify(v.outcomes));

    // ONE ANNOTATION PER FAILING SPEC, so the repo can name what broke. GitHub turns an
    // `::error file=…` into a check annotation carrying that path, which is exactly what
    // `scripts/ci-failure-set.mjs` reads - so a configured red stops being `job: Configured E2E`
    // and becomes the spec, in the same identity string the quarantine and the cross-commit
    // report use.
    //
    // CAPPED, because GitHub keeps only the first ten error annotations of a step and the
    // problem lines above must not be pushed out by a suite that broke wholesale. Past the cap
    // the count is still said, and the full list is two lines below in the log either way.
    const ANNOTATION_CAP = 6;
    for (const spec of v.failing.slice(0, ANNOTATION_CAP)) {
      const where = spec.path ? `file=${spec.path},line=${spec.line},` : '';
      out(`::error ${where}title=${label}::${spec.file} - ${spec.title} (${spec.statuses.join(' then ')})`);
    }
    if (v.failing.length > ANNOTATION_CAP) out(`::error title=${label}::${v.failing.length - ANNOTATION_CAP} further spec(s) were not clean - the full list is in this log.`);

    out(`failure set (${v.failHash}):`);
    for (const entry of v.failSet) out(`  ${entry}`);

    if (process.env.GITHUB_STEP_SUMMARY) {
      const lines = [
        `### ${label} — tests executed`,
        '',
        `${v.ran} ran, ${v.skipped} skipped, ${v.unexpected} failed, ${v.flaky} flaky.`,
        '',
        ...v.specs
          .map((s) => `- \`${s.file}\` — ${s.title}: ${lastStatus(s)}`)
          .sort(),
        '',
      ];
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
    }

    emit('green', String(v.green));
    emit('summary', v.summary);
    emit('failhash', v.failHash);
    emit('hardfail', String(v.hardFail));
    // WHICH SPECS, not merely how many. The rolling issue carried the summary line alone -
    // "49 ran, 0 skipped, 0 failed, 3 flaky" - so the first question a reader has on opening
    // it, what broke, could only be answered by downloading a job log and reading 900 lines.
    // On 2026-09-20 that cost most of a session, and all three specs had failed the same way:
    // the dashboard stuck on "not on air" with every verb disabled. One line each would have
    // said so. Empty when nothing was unclean, which is the green path and writes no issue.
    // Only when there is something to name. An empty block still yields one empty LINE, and
    // `[ -n ]` in the caller is true for a newline - so a run that went red on unexpected
    // skips, which never populates `failing`, would print the heading with nothing under it.
    if (v.failing.length) emitBlock('failinglist', v.failing.map(failingLine).join('\n'));
  }
}
