#!/usr/bin/env node
// WHAT IS ACTUALLY BROKEN IN A CI RUN, as a stable set and a stable hash.
//
//   node scripts/ci-failure-set.mjs --run <run-id> [--json]
//
// WHY THIS EXISTS. Two places need the same answer and neither could get it from a conclusion
// alone. `main is red` says nothing a person can act on; `main is red on e2e/anim-engine.spec.ts`
// sends them to the file. And "have we already said this?" cannot be answered by the commit sha -
// every landing is a new sha, which is exactly how one defect was reported 27 times in 35 hours
// (docs/CI_STABILITY.md, measured 2026-08-15..29).
//
// The set is built from the run's own CHECK ANNOTATIONS rather than from its logs. Playwright's
// `github` reporter (playwright.config.ts) emits one `::error file=<spec>` per failing test, so
// GitHub already holds the per-spec truth in a structured form; grepping a shard log for it would
// be a second, worse parser of the same fact.
//
// THE HASH FAILS OPEN. An empty or unreadable set hashes to `unknown`, and every caller treats
// `unknown` as "say it out loud" rather than "nothing to see". A dedup that silently swallows a
// failure it could not classify is worse than no dedup at all - the owner's constraint, verbatim
// on 2026-08-29: "it's fine to turn off any extra emails, but I do not want to close my eyes if we
// have problems".

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Conclusions that mean a job reported a fault about the code, rather than no verdict. */
const FAILED = new Set(['failure', 'timed_out']);

/**
 * The gate job is DERIVED - it fails precisely because something else did, so it names no fault
 * of its own. Including it would put one constant member in every set, which weakens nothing but
 * says nothing either; excluding it means a run whose ONLY failure is the gate hashes to
 * `unknown` and therefore always speaks up. That is the right direction to be wrong in.
 */
const DERIVED_JOBS = new Set(['CI gate']);

/**
 * Main's completed PUSH runs of one workflow, newest first, one per commit. Only pushes count - a
 * dispatched run on main is somebody asking a question, not a landing - and only completed ones:
 * the run asking is itself still in progress. Shared by the revert's last-verdict walk and the
 * quarantine's pass history, so what "a main run" means is spelled once.
 * @returns {{ head_sha: string, conclusion: string }[]}
 */
export function mainPushRuns({ repo, workflow = 'ci.yml', limit = 40, gh = ghJsonLines }) {
  const seen = new Set();
  const runs = [];
  for (const run of gh([`repos/${repo}/actions/workflows/${workflow}/runs?branch=main&event=push&status=completed&per_page=${limit}`, '--jq', '.workflow_runs[] | {head_sha, conclusion}'])) {
    if (!run?.head_sha || seen.has(run.head_sha)) continue;
    seen.add(run.head_sha);
    runs.push(run);
  }
  return runs;
}

/**
 * One failing job's contribution to the set, as a stable identity.
 *
 * A shard index is not part of the identity: Playwright splits by test COUNT, so the same spec
 * lands in shard 3 today and shard 6 after one spec file is added. Keying on the index would make
 * every re-split look like a new failure and defeat the dedup on exactly the runs it is for.
 */
export function jobIdentity(name) {
  return String(name ?? 'unknown job')
    .replace(/^E2E \d+\/\d+.*$/, 'E2E shard')
    .trim();
}

/**
 * The failing SPEC FILES and unattributable jobs of one run, sorted, plus a stable short hash.
 *
 * `annotationsFor` is injected rather than fetched here so the decision is testable without a
 * network: these few lines decide whether the owner hears about a regression, and a rule that can
 * only be exercised against live GitHub is a rule nobody checks.
 *
 * A failing job that produced spec annotations contributes THOSE (the fault is in the spec, not in
 * the runner that happened to hold it). A failing job with no annotations at all - the build, the
 * factory gates, a shard that died before Playwright reported - contributes its own name, so a
 * red build is never mistaken for a red spec.
 */
export function failureSet(jobs, annotationsFor = () => []) {
  const own = (jobs ?? []).filter((job) => !DERIVED_JOBS.has(job?.name));
  // EXHAUSTED IS NOT FAILED. A job killed by its own `timeout-minutes` is recorded by GitHub as
  // `cancelled`, and one cancelled job makes the whole RUN cancelled - so a run where four E2E
  // shards ran out of clock and everything else passed reaches this function with nothing in
  // FAILED at all. Until 2026-09-04 that produced an empty set, which hashes to `unknown`, which
  // every caller reads as "say it out loud"; on run 33829325663 it opened issue #52 reporting
  // "a failure this gate could not name" against a commit where nothing had failed.
  //
  // The distinction the callers need is between "something broke and I could not identify it"
  // and "nothing broke, the run just never finished". Both have an empty item set; only the first
  // is news. `exhausted` is the second.
  const cancelled = [...new Set(own.filter((job) => job?.conclusion === 'cancelled').map((job) => String(job.name)))].sort();
  const anyFailed = own.some((job) => FAILED.has(job?.conclusion));

  const items = new Set();
  for (const job of own) {
    if (!FAILED.has(job?.conclusion)) continue;
    const paths = (annotationsFor(job.id) ?? [])
      // FAILURE ANNOTATIONS ONLY. Measured on run 33205116363 (2026-08-28, the red main this
      // whole file exists for): the failing shard also emitted a `Slow Test` WARNING whose path
      // was `[chromium] > e2e/ai.spec.ts` and a `Playwright Run Summary` NOTICE. Counting those
      // would put a different, timing-dependent member in the set on most runs - so the hash would
      // change nightly, nothing would ever dedup, and the fix would look installed while doing
      // nothing. `.github` is GitHub's placeholder path for an annotation with no file.
      .filter((a) => a?.annotation_level === 'failure')
      .filter((a) => typeof a?.path === 'string' && a.path !== '.github')
      // Normalize BEFORE the emptiness test, so a path that is nothing but a project prefix is
      // dropped rather than added to the set as an empty string.
      .map((a) => normalizePath(a.path))
      .filter((p) => p !== '');
    if (paths.length > 0) for (const p of paths) items.add(p);
    else items.add(`job: ${jobIdentity(job.name)}`);
  }
  const sorted = [...items].sort();
  return {
    items: sorted,
    // `unknown` is load-bearing - see the header. It is NOT a hash of the empty string, because a
    // caller comparing hashes must never find two unclassifiable runs equal to each other.
    hash: sorted.length === 0 ? 'unknown' : createHash('sha1').update(sorted.join('\n')).digest('hex').slice(0, 12),
    /** Jobs that were cancelled - a shard at its cap, or a run superseded mid-flight. */
    cancelled,
    /** Nothing reported a fault, and at least one job never got to finish. */
    exhausted: !anyFailed && cancelled.length > 0,
  };
}

/**
 * One spec path, as the set stores it: forward slashes, and no Playwright project prefix.
 *
 * The prefix (`[chromium] > `) belongs to a project, not a file, and the same spec failing under
 * two projects is one broken file - which is also how nightly-triage.mjs counts. The LINE number
 * is deliberately not part of the identity either: a spec that moves down four lines when
 * something above it is edited is not a new failure.
 */
function normalizePath(path) {
  return String(path).replaceAll('\\', '/').replace(/^\[[^\]]+\]\s*[›>]\s*/, '').trim();
}

/** The set in one line a person can read in a refusal message or an issue title. */
export function describeFailureSet(items, { max = 3 } = {}) {
  const list = items ?? [];
  if (list.length === 0) return 'something this gate could not name - open the run';
  const shown = list.slice(0, max).join(', ');
  return list.length > max ? `${shown} (+${list.length - max} more)` : shown;
}

/**
 * Ask GitHub. Every call goes through `gh`, and a failure at any step is an EMPTY answer rather
 * than an exception: the callers are a landing gate and an alarm step, and neither may crash
 * because the API was slow. An empty answer hashes to `unknown`, which both treat as "speak up".
 */
export function fetchFailureSet(runId, { repo = process.env.GH_REPO, gh = ghJsonLines } = {}) {
  // No answer is not an exhausted run: `exhausted` false keeps the fail-open direction the header
  // promises, so an unreachable API still reaches the callers as "speak up".
  if (!runId || !repo) return { items: [], hash: 'unknown', cancelled: [], exhausted: false };
  const jobs = gh([`repos/${repo}/actions/runs/${runId}/jobs?per_page=100`, '--jq', '.jobs[] | {id, name, conclusion}']);
  return failureSet(jobs, (id) => gh([`repos/${repo}/check-runs/${id}/annotations?per_page=100`, '--jq', '.[] | {path, annotation_level}']));
}

/**
 * `gh api ... --jq` prints one JSON value per line; unreadable output is no answer, not a crash.
 * Shared with the quarantine and the revert, which read the same API the same way.
 */
export function ghJsonLines(args) {
  const res = spawnSync('gh', ['api', ...args], { encoding: 'utf8', windowsHide: true });
  if (res.status !== 0) return [];
  return String(res.stdout ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

// Only ask GitHub when run directly. Importing this module - which is how the tests and the two
// gates reach the pure decisions above - must never make a network call.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const runId = argv[argv.indexOf('--run') + 1];
  const set = fetchFailureSet(runId);
  if (argv.includes('--json')) process.stdout.write(`${JSON.stringify(set)}\n`);
  else console.log(`${set.hash}  ${describeFailureSet(set.items, { max: 20 })}`);
}
