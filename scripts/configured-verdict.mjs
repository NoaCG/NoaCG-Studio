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
//     that is suppressed elsewhere, never the verdict.
//
// It also fingerprints the failure set so the caller can tell "the same known problem again" from
// "something new" - see the rolling-issue step in either workflow.
//
//   node scripts/configured-verdict.mjs <report.json> [--min N] [--allow "a.spec.ts b.spec.ts"]
//
// Writes a human summary to stdout, GitHub `::error` lines to stdout, a markdown block to
// $GITHUB_STEP_SUMMARY and key=value pairs to $GITHUB_OUTPUT when those are set. Exits 0 always:
// the CALLER decides what a non-green verdict costs, because the two workflows differ there.
import { appendFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

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

export function verdict(report, { minTests, allowedSkips, workspace = '' }) {
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

  const unclean = specs.filter(isUnclean);
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
  if (unexpected !== 0 || flaky !== 0) {
    problems.push({ title: 'Configured suite is red', detail: `${unexpected} failed, ${flaky} flaky.` });
  }

  return {
    green: problems.length === 0,
    ran, expected, unexpected, flaky, skipped,
    problems, failHash, failSet, failing, specs,
    summary: `${ran} ran, ${skipped} skipped, ${unexpected} failed, ${flaky} flaky`,
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
  const minTests = Number(valueOf('--min', '0'));
  const allowedSkips = valueOf('--allow', '');
  const label = valueOf('--label', 'Configured suite');

  const out = (line) => console.log(line);
  const emit = (name, value) => {
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  };

  let report = null;
  try {
    report = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    // No report at all is its own verdict, and a loud one: the suite never got far enough to
    // write one. Reported as not-green rather than thrown, because the CALLER decides the cost.
    out(`::error title=No report::Could not read ${file} - the run never produced one (${error.message}).`);
    emit('green', 'false');
    emit('summary', 'no JSON report - the run never started');
  }

  if (report) {
    const v = verdict(report, { minTests, allowedSkips, workspace: process.env.GITHUB_WORKSPACE ?? '' });
    out(`Ran ${v.ran} tests (${v.expected} passed, ${v.unexpected} failed, ${v.flaky} flaky), ${v.skipped} skipped.`);
    for (const p of v.problems) out(`::error title=${p.title}::${p.detail}`);

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
    emit('hardfail', String(v.unexpected));
  }
}
