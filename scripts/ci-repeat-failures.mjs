#!/usr/bin/env node
// WHAT FAILED ON MORE THAN ONE COMMIT this week - a report for a person, and nothing else.
//
//   node scripts/ci-repeat-failures.mjs [--days 7] [--workflows ci.yml,configured-suite.yml]
//                                       [--limit 60] [--json] [--markdown]
//   node scripts/ci-repeat-failures.mjs --since 2026-09-04 --until 2026-09-08   # a past window
//
// WHY THIS EXISTS AND WHY IT IS NOT THE QUARANTINE. `scripts/e2e-quarantine.mjs` admits a spec on
// a fail-then-pass receipt ON THE SAME SHA: ci.yml re-runs a red main run's failed specs on that
// commit, and a green second attempt is proof that the code did not decide the outcome. That rule
// is right and it is the reason the quarantine replaced a hand-kept table nobody read.
//
// It cannot see the other shape. A spec that fails ONCE on each of several different commits
// leaves no same-sha pair, so it never enters `e2e/quarantine.json` and appears in no report.
// Measured 2026-09-08 over 2026-09-04..08: `e2e/import-svg.spec.ts` failed on four distinct shas
// across four lines of work, one of them main, and one single test inside it failed on two of
// them - and nothing anywhere raised it. The quarantine could not, correctly.
//
// THIS DOES NOT LOOSEN THAT RULE, BECAUSE IT DECIDES NOTHING. Cross-sha evidence is strictly
// weaker than a same-sha receipt: "failed on four commits" is equally consistent with a flake and
// with a real defect that four branches independently tripped over - which is exactly what the
// 2026-09-08 measurement could not tell apart. Quarantining on evidence that weak would take a
// spec out of the blocking plan, where it stops testing the thing it was written for and leaves
// only by passing RELEASE_AFTER times in a row, and nobody would notice. So this prints a list and
// a person reads it. The report is the product.
//
// THE TWO COUNTING RULES, both learned from the same measurement:
//   - DISTINCT COMMITS, never runs. Two runs of one commit are a re-run, which is the quarantine's
//     business and not this file's.
//   - TWO LINES OF WORK, not two failures. `e2e/wizard-filters.spec.ts` failed three times on
//     three shas of ONE branch in that window, which is a branch failing its own tests - it is
//     visible to its owner and it is not evidence about the repository. `import-svg` failed across
//     four different branches, which no single owner can see. Main is its own line of work: two
//     reds on two commits of main are two independent landings with the same symptom, so they
//     count even though the branch name is one.
//
// Spec items and job items are reported apart. `job: Build` shows up constantly because unrelated
// branches break the build for unrelated reasons, and letting it headline would bury the specs
// under the one item nobody can act on.
//
// WHAT IT CANNOT SEE, said plainly so nobody reads an empty report as a clean week. A run whose
// failed jobs were RE-RUN to green has conclusion `success`, and this asks GitHub for
// `status=failure` - so a manually re-run red is invisible here (docs/CI_STABILITY.md measured the
// same hole in the by-hand sweep: four of six occurrences behind its relay row live in runs that
// finished green). That shape is the quarantine's anyway - red then green on one commit is its
// admission receipt - so the two instruments are blind in opposite directions, which is the
// intended arrangement rather than a gap in either.

import { describeFailureSet, fetchFailureSet, ghJsonLines, resolveRepo } from './ci-failure-set.mjs';

/** Which workflows are asked by default: the two that run the e2e specs against a real app. */
export const DEFAULT_WORKFLOWS = ['ci.yml', 'configured-suite.yml'];

/** A set member that names a job rather than a spec file - `failureSet` writes them `job: <name>`. */
const isJobItem = (item) => item.startsWith('job: ');

/**
 * The failed runs of one workflow inside a window, newest first.
 *
 * `status=failure` is GitHub's own filter on the CONCLUSION, so a cancelled run - a shard at its
 * own `timeout-minutes`, a run superseded mid-flight - never reaches the grouping. That matches
 * what `failureSet` would say about one anyway (`exhausted`, nothing named), and it keeps the
 * request count down to the runs that can contribute a member.
 */
export function failedRuns({ repo, workflow, since, until = null, limit = 100, gh = ghJsonLines }) {
  // GitHub's `created` filter takes its search syntax: `>=DATE`, or `DATE..DATE` for a closed
  // window. The closed form is what makes a past measurement reproducible - the 2026-09-04..08
  // window this file was built against is re-derivable a week later, which a rolling `--days`
  // cannot be.
  const created = until ? `${since}..${until}` : `%3E%3D${since}`;
  const page = Math.min(limit, 100);
  const query = `status=failure&created=${created}&per_page=${page}`;
  const runs = gh([`repos/${repo}/actions/workflows/${workflow}/runs?${query}`, '--jq', '.workflow_runs[] | {id, head_sha, head_branch, created_at, html_url, name}']).filter((run) => run?.id && run?.head_sha);
  // A FULL PAGE MEANS THERE MAY BE MORE. One page is asked for on purpose - this walks jobs and
  // annotations per run and paging the window would multiply that - but a silently short answer
  // under-reports, and under-reporting here prints a clean week. docs/CI_STABILITY.md measured the
  // same trap in the by-hand sweep: `--paginate` over an open window returned 82 of ~100 runs and
  // stopped dead, reporting no error.
  return { runs, truncated: runs.length >= page };
}

/**
 * Every item that failed on two or more distinct commits across two or more lines of work.
 *
 * `runs` are `{ id, head_sha, head_branch, items }` - the failure set of each already fetched, so
 * this decision is testable without a network. It returns what it saw and asserts nothing about
 * why; the caller prints it and a person decides whether it is a flake, a defect, or a branch
 * that was mid-repair all week.
 */
export function repeatOffenders(runs, { minShas = 2 } = {}) {
  const byItem = new Map();
  for (const run of runs ?? []) {
    for (const item of run?.items ?? []) {
      if (!byItem.has(item)) byItem.set(item, { item, shas: new Set(), branches: new Set(), mainShas: new Set(), runs: [] });
      const entry = byItem.get(item);
      entry.shas.add(run.head_sha);
      entry.branches.add(run.head_branch ?? '(no branch)');
      if (run.head_branch === 'main') entry.mainShas.add(run.head_sha);
      entry.runs.push({ id: run.id, sha: run.head_sha, branch: run.head_branch, url: run.html_url, workflow: run.name });
    }
  }

  const reported = [...byItem.values()]
    .filter((e) => e.shas.size >= minShas && (e.branches.size >= 2 || e.mainShas.size >= minShas))
    .map((e) => ({
      item: e.item,
      kind: isJobItem(e.item) ? 'job' : 'spec',
      shas: [...e.shas],
      branches: [...e.branches].sort(),
      mainShas: e.mainShas.size,
      runs: e.runs,
    }))
    // Most commits first, then most lines of work, then by name so the report is stable enough to
    // diff one week against the next.
    .sort((a, b) => b.shas.length - a.shas.length || b.branches.length - a.branches.length || a.item.localeCompare(b.item));

  return {
    specs: reported.filter((e) => e.kind === 'spec'),
    jobs: reported.filter((e) => e.kind === 'job'),
    /** Every item seen, reported or not - the denominator, so "nothing to report" can be trusted. */
    seen: byItem.size,
  };
}

/** The report, as lines. Markdown when it is going to a step summary, plain text for a terminal. */
export function renderReport({ specs, jobs, seen }, { window, runs, markdown = false, truncated = [] } = {}) {
  const bullet = markdown ? '- ' : '  ';
  const lines = [];
  const head = `Repeat failures across commits - ${window}, ${runs} failed run(s), ${seen} distinct item(s)`;
  lines.push(markdown ? `### ${head}` : head, '');
  // Said FIRST, because everything under it is then a floor rather than a count.
  if (truncated.length > 0) {
    lines.push(`${markdown ? '**' : ''}Incomplete: ${truncated.join(', ')} filled the page, so older failed runs in this window were not read. Raise --limit or shorten --days.${markdown ? '**' : ''}`, '');
  }

  if (specs.length === 0) {
    lines.push(markdown ? '**No spec failed on two commits across two lines of work.**' : 'No spec failed on two commits across two lines of work.');
  } else {
    lines.push(markdown ? '**Specs to look at.** Each failed on several commits on several lines of work, which no single branch owner can see. This is evidence for a person, not a verdict about any commit - it may be a flake or one defect that several branches tripped over.' : 'Specs to look at (evidence, not a verdict):');
    for (const e of specs) {
      lines.push(`${bullet}${markdown ? `\`${e.item}\`` : e.item} - ${e.shas.length} commit(s) on ${e.branches.length} line(s) of work: ${e.branches.join(', ')}${e.mainShas > 0 ? ` (${e.mainShas} on main)` : ''}`);
      // The runs, which can outnumber the commits: a re-run of one commit is one commit here and
      // two lines below, and seeing both is how a reader tells a re-run from a second landing.
      for (const r of e.runs) lines.push(`${markdown ? '  - ' : '    '}${r.workflow ?? 'run'} ${r.sha.slice(0, 7)} on ${r.branch}: ${r.url ?? r.id}`);
    }
  }

  if (jobs.length > 0) {
    lines.push('', markdown ? '**Jobs, kept apart.** A job item names no spec, and unrelated branches break the build for unrelated reasons - so these repeat by construction and rarely mean one fault.' : 'Jobs, kept apart (these repeat by construction):');
    for (const e of jobs) lines.push(`${bullet}${markdown ? `\`${e.item}\`` : e.item} - ${e.shas.length} commit(s) on ${e.branches.length} line(s) of work: ${e.branches.join(', ')}`);
  }

  lines.push('', markdown ? 'Nothing here is quarantined. The quarantine admits a spec only on a fail-then-pass receipt on the SAME commit (`scripts/e2e-quarantine.mjs`), and this evidence is weaker than that on purpose.' : 'Nothing here is quarantined - see scripts/e2e-quarantine.mjs for the rule that does admit specs.');
  return lines;
}

/** `YYYY-MM-DD`, `days` before now, for GitHub's `created=>=` filter. */
export function windowStart(days, now = new Date()) {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && /ci-repeat-failures\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const argv = process.argv.slice(2);
  // A FLAG IS NEVER A VALUE. `--days --json` read as days="--json" gives NaN, and NaN reaches
  // GitHub as `per_page=NaN` (a 422, an empty answer) or `windowStart(NaN)` (a thrown
  // RangeError) - the first of which prints a clean bill of health from an instrument that asked
  // nothing, which is the exact failure this file exists to prevent.
  const valueOf = (flag, fallback) => {
    const i = argv.indexOf(flag);
    const next = i >= 0 ? argv[i + 1] : undefined;
    return next !== undefined && !next.startsWith('--') ? next : fallback;
  };
  // …and a value that is not a number is not a number. Refusing beats defaulting quietly: a run
  // over the wrong window looks exactly like a run over the right one.
  const positive = (flag, fallback) => {
    const raw = valueOf(flag, String(fallback));
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      console.error(`${flag} wants a positive number, not "${raw}".`);
      process.exit(2);
    }
    return n;
  };
  const days = positive('--days', 7);
  const limit = positive('--limit', 60);
  const workflows = String(valueOf('--workflows', DEFAULT_WORKFLOWS.join(','))).split(',').map((w) => w.trim()).filter(Boolean);

  const { repo, source } = resolveRepo();
  if (!repo) {
    // The same distinction ci-failure-set.mjs now makes: "I could not ask" is not "nothing to
    // report", and a sweep that prints an empty world from a laptop is worse than one that stops.
    console.error('Cannot name the repository: `gh` named none and the git remote is not a GitHub URL. Set GH_REPO.');
    process.exit(1);
  }

  const since = valueOf('--since', windowStart(days));
  const until = valueOf('--until', null);
  const runs = [];
  const truncated = [];
  for (const workflow of workflows) {
    const answer = failedRuns({ repo, workflow, since, until, limit });
    if (answer.truncated) truncated.push(workflow);
    for (const run of answer.runs) {
      // The set of ONE run, through the same code the landing gate and the alarm use, so a spec is
      // named here exactly as it is named there and the two can be compared by string.
      const set = fetchFailureSet(run.id, { repo });
      runs.push({ ...run, items: set.items, reason: set.reason });
    }
  }

  const result = repeatOffenders(runs);
  const markdown = argv.includes('--markdown') || Boolean(process.env.GITHUB_STEP_SUMMARY);
  const window = until ? `${since}..${until}` : `since ${since} (${days} day(s))`;
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ repo, repoSource: source, since, until, runs: runs.length, truncated, ...result }, null, 2)}\n`);
  } else {
    const lines = renderReport(result, { window, runs: runs.length, markdown, truncated });
    console.log(lines.join('\n'));
    if (process.env.GITHUB_STEP_SUMMARY) {
      const { appendFileSync } = await import('node:fs');
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
    }
  }

  // Runs whose failure could not be named at all are worth one line: they are the holes in this
  // report, and after 2026-09-09 they carry a reason rather than one word.
  const unnamed = runs.filter((r) => r.items.length === 0);
  for (const r of unnamed) console.log(`unnamed: ${r.name ?? 'run'} ${r.head_sha.slice(0, 7)} on ${r.head_branch} - ${describeFailureSet([], { reason: r.reason })}`);
}
