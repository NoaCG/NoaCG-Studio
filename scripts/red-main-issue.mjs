#!/usr/bin/env node
// THE RED-MAIN ALARM: file it once, say each distinct thing once, never go quiet on a new fault.
//
//   node scripts/red-main-issue.mjs            (from ci.yml's gate job; reads the env below)
//
// Env: GH_REPO, GH_TOKEN (for `gh`), RUN_ID, SHA, RUN_URL.
//
// WHY THIS IS A SCRIPT AND NOT SIX LINES OF BASH. It used to be six lines of bash, and they
// deduped by COMMIT SHA: a re-run of the same commit stayed silent, a new commit always commented.
// Every landing is a new commit, so between 2026-08-27 and 2026-08-28 one defect
// (`e2e/anim-engine.spec.ts:656`) produced 27 separate reports of itself as branch after branch
// landed onto the red main - two thirds of the owner's CI email for the fortnight
// (docs/CI_STABILITY.md). The sha was never the right key. WHAT IS FAILING is.
//
// The rule, and each half of it matters:
//   - a failure set nobody has reported yet ALWAYS comments - including a new spec appearing
//     alongside a familiar one, because that set is not the reported set;
//   - a set this gate could not classify ALWAYS comments - `unknown` is never equal to anything;
//   - a byte-identical repeat of the LATEST reported set comments nothing. The run is still red,
//     the issue is still open, the commit status is still red. Only the notification is withheld.
//
// This is the owner's constraint made mechanical, stated by him on 2026-08-29: "it's fine to turn
// off any extra emails, but I do not want to close my eyes if we have problems; I want to know
// about it." So: say each distinct problem loudly, once. Never say nothing about a new one.

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describeFailureSet, fetchFailureSet, ghJsonLines, mainPushRuns } from './ci-failure-set.mjs';
import { spawnRunner } from './queue-pr.mjs';
import { revertLanding } from './revert-landing.mjs';

export const TITLE = 'CI is red on main';

/**
 * SHOULD THIS RUN REVERT WHAT IT TESTED? Pure, for the same reason `planRedMainComment` is: a
 * revert is the one thing here that changes `main`, and the rule must be checkable by hand.
 *
 * The evidence a revert needs (docs/WORKFLOW_ARCHITECTURE.md §3, "sheriffs + auto-revert"):
 *   - a push to main, so something landed here;
 *   - a verdict: a run that only ran out of clock reverts nothing;
 *   - a SECOND RUN that happened and failed, for at least one of the things that failed. For a
 *     spec, the retry job re-ran the failed specs (`retried` > 0) and they failed again. For a
 *     failed Build or Factory job, ci.yml's `rerun` job ran that job's steps again on the same
 *     commit (`rerun`) and they failed again. A second run that passed is a flake; one that was
 *     cancelled, skipped, or refused before re-running anything (a shard that died before
 *     reporting, a spec the change itself edited) is no verdict, so nothing is reverted on it.
 *     A flake on one side never shields a failure confirmed on the other: a build that broke twice
 *     beside a spec that flaked is still a break.
 *
 *     THERE IS NO FAILURE THAT IS DETERMINISTIC ON ITS OWN. This rule used to say a red build
 *     was, and skipped the second run for it. Run 34537651787 refuted that on 2026-09-10: on
 *     e06cd2d4 one unit test of 1592 failed inside the Build job, the identical tree was green on
 *     re-run, and this rule had already queued pull request 246 reverting a landed row;
 *   - the last main commit WITH a verdict was green, so everything since it is the culprit by the
 *     only evidence there is. A main that was already red is not this landing's doing, and
 *     stacking a revert on a red main would revert an innocent landing; that case is written into
 *     the issue instead. `previous` may be a function, called only once the cheaper rules have
 *     passed - it costs API calls and a git walk.
 *
 * @returns {{ revert: boolean, reason: string, since?: string }}
 */
export function shouldRevert({ event = '', ref = '', exhausted = false, retry = 'skipped', retried = 0, rerun = 'skipped', items = [], previous = () => ({ sha: null, conclusion: 'unknown' }) } = {}) {
  if (event !== 'push' || ref !== 'refs/heads/main') return { revert: false, reason: 'not a push to main, so nothing landed here' };
  if (exhausted) return { revert: false, reason: 'the run reached no verdict, so nothing is known to be broken' };
  const specFailed = items.some(isSpecItem);
  const jobFailed = items.some((i) => !isSpecItem(i));
  const specConfirmed = specFailed && retry === 'failure' && retried > 0;
  const jobConfirmed = jobFailed && rerun === 'failure';
  if (!specConfirmed && !jobConfirmed) {
    const why = [];
    if (specFailed) why.push(unconfirmedSpecs(retry));
    if (jobFailed) why.push(unconfirmedJob(rerun));
    if (why.length === 0) why.push('no failure was named, so none was confirmed by a second run');
    return { revert: false, reason: why.join('; ') };
  }
  const last = typeof previous === 'function' ? previous() : previous;
  if (last?.conclusion === 'failure') return { revert: false, reason: `main was already red at ${String(last.sha).slice(0, 7)}, before this landing, so it is not the culprit - fix main forward` };
  if (last?.conclusion !== 'success' || !last?.sha) return { revert: false, reason: 'no earlier main commit has a verdict of its own, so nothing can be blamed on this evidence' };
  return { revert: true, since: last.sha, reason: `main was green at ${String(last.sha).slice(0, 7)} and the failure survived a second run on the same commit` };
}

/** A failure the E2E retry job re-runs: a spec file, or an E2E shard that died naming none. */
function isSpecItem(item) {
  return /^e2e\//.test(item) || /^job: E2E/.test(item);
}

/** Why a spec failure is not yet evidence. Only called when it was not confirmed. */
function unconfirmedSpecs(retry) {
  if (retry === 'success') return 'the failed specs passed on their second run - a flake, quarantined rather than reverted';
  if (retry !== 'failure') return `the failed specs never got a second run (retry job: ${retry}), so this may be a flake`;
  return 'the retry job re-ran nothing - a shard died before reporting, or the failing spec is one this landing edited - so the specs have no second verdict';
}

/** Why a failed Build or Factory job is not yet evidence. Only called when it was not confirmed. */
function unconfirmedJob(rerun) {
  if (rerun === 'success') return 'the failed job passed when it was re-run on the same commit - a flaky test, reported rather than reverted';
  return `the failed job never got a second run (re-run job: ${rerun}), so this may be a flake`;
}

/**
 * The nearest main commit before `sha` that a completed push run judged: `{ sha, conclusion }`
 * with `success` or `failure`, or `{ sha: null, conclusion: 'unknown' }`. Walked along main's
 * first-parent history, because the previous PUSH is not the previous verdict: a run whose commit
 * main moved past cancels itself, and two landings a minute apart finish in either order, so the
 * newest completed run can belong to a commit AFTER the one being judged. Only pushes count - a
 * dispatched run on main is somebody asking a question, not a landing.
 */
export function lastVerdictBefore({ repo, sha, gh = ghJsonLines, git = gitLines, limit = 40 } = {}) {
  const none = { sha: null, conclusion: 'unknown' };
  if (!repo || !sha) return none;
  // `success` and `failure` only. A `timed_out` run is exhaustion (scripts/main-health.mjs counts
  // it red for its own question, "may I land onto this?"); for blame it is no verdict, and the
  // walk goes on to the nearest commit that was actually judged.
  const verdicts = new Map();
  for (const run of mainPushRuns({ repo, limit, gh })) {
    if (run.conclusion === 'success' || run.conclusion === 'failure') verdicts.set(run.head_sha, run.conclusion);
  }
  for (const ancestor of git(['log', '--first-parent', '--format=%H', `--max-count=${limit}`, `${sha}^`])) {
    if (verdicts.has(ancestor)) return { sha: ancestor, conclusion: verdicts.get(ancestor) };
  }
  return none;
}

/** One line per commit from git, or nothing when git cannot answer. */
function gitLines(args) {
  return spawnRunner('git')(args, { allowFailure: true }).out.split('\n').map((l) => l.trim()).filter(Boolean);
}

/** The HTML comment that carries the failure set from one run to the next, through the issue. */
export function marker(hash) {
  return `<!-- red-main-failure-set: ${hash} -->`;
}

/**
 * What this run should do about the rolling issue.
 *
 * `bodies` is the issue body followed by its comments, oldest first - the issue as a reader sees
 * it. Pure, because this is the decision that either keeps the owner informed or quietly stops
 * telling him things, and it must be checkable without a repository or a network.
 */
export function planRedMainComment({ existing = null, bodies = [], sha = '', hash = 'unknown', exhausted = false, cancelled = [] } = {}) {
  // NOTHING FAILED, SO THERE IS NOTHING TO REPORT. Checked before every other rule, including the
  // create branch, because this is the one case where the alarm's own message would be false.
  //
  // On 2026-09-04 run 33829325663 had four E2E shards killed at the job's 20-minute cap and every
  // other job green. GitHub records a job killed by its own timeout as `cancelled`, one cancelled
  // job makes the RUN cancelled, and the gate read that as red and opened issue #52: "Failing:
  // something this gate could not name - open the run". It could not name one because there was
  // none. That is not the eyes-closed failure the dedup rules below are written against - it is
  // the opposite, an alarm inventing a fault - and the fix for a run that ran out of clock is to
  // make the shards fit, which is ci.yml's business, not the owner's inbox.
  if (exhausted) {
    const what = cancelled.length ? cancelled.join(', ') : 'a job';
    return {
      action: 'withhold',
      reason: `no job reported a fault - the run ran out of time (${what}). Nothing to name, so nothing is filed; the run is still not a pass`,
    };
  }
  if (!existing) return { action: 'create', reason: 'no open red-main issue yet' };

  // THE EXISTING REFUSAL, kept exactly as it was: a re-run of a commit already reported adds
  // nothing at all, whatever it failed on. This is checked first because it is the stronger
  // statement - the same commit failing again is the same event, not a repeat report of one.
  if (sha && bodies.some((b) => String(b ?? '').includes(sha))) {
    return { action: 'withhold', reason: `commit ${sha} is already reported on issue #${existing}` };
  }

  // Unclassifiable never dedups. An `unknown` hash means the annotations could not be read, not
  // that nothing failed, and treating "I could not tell" as "same as last time" is precisely the
  // eyes-closed failure this whole mechanism is written against.
  if (hash === 'unknown') {
    return { action: 'comment', reason: 'this run\'s failure set could not be identified - reporting it rather than guessing' };
  }

  // The LATEST word only, matching configured-suite.yml. A set that came back after something else
  // was reported in between is news again, and should be.
  const last = String(bodies[bodies.length - 1] ?? '');
  if (last.includes(marker(hash))) {
    return {
      action: 'withhold',
      reason: `the same failure set (${hash}) is already the latest word on issue #${existing} - the run is still red, only the comment is withheld`,
    };
  }
  return { action: 'comment', reason: `a failure set not yet reported (${hash})` };
}

/** The issue body / comment text. The failing specs are IN it, so the alarm names the fault. */
export function issueBody({ sha, runUrl, items, hash, retry = 'skipped', retried = 0, rerun = 'skipped', revert = null }) {
  const lines = [`Commit ${sha} failed CI: ${runUrl}`, '', `Failing: ${describeFailureSet(items, { max: 12 })}`];
  // One sentence per kind of failure that is present, each saying what its second run found.
  // Neither sentence may claim a second run the other kind had.
  if (items.some(isSpecItem)) {
    if (retry === 'failure' && retried > 0) lines.push('', `The ${retried} failed spec file(s) were re-run once on this same commit and failed again, so this is not a flake.`);
    else if (retry === 'failure') lines.push('', 'The retry job could not re-run the failed specs (a shard died before reporting, or the failing spec is one this landing edited) - open its log.');
    else if (retry === 'success') lines.push('', 'The failed specs passed when re-run on this same commit - a flake, written into e2e/quarantine.json.');
    else if (retry === 'cancelled') lines.push('', 'The retry job ran out of time, so the failed specs have no second verdict.');
    else lines.push('', 'No second run of the failed specs: this was not a main push.');
  }
  if (items.length === 0 || items.some((i) => !isSpecItem(i))) {
    if (rerun === 'failure') lines.push('', 'The failed job was re-run once on this same commit and failed again, so this is not a flake.');
    else if (rerun === 'success') lines.push('', 'The failed job passed when re-run on this same commit: a flaky test, not this landing. Nothing is reverted for it; the test needs fixing.');
    else if (rerun === 'cancelled') lines.push('', 'The re-run of the failed job ran out of time, so it has no second verdict.');
    else lines.push('', 'No second run of the failed job: this was not a main push, or the re-run job did not start.');
  }
  if (revert?.status === 'queued') {
    lines.push('', `Reverting the batch: ${revert.url} - queued through the merge queue; main is green again when it lands, and this issue closes on that run.`);
  } else if (revert) {
    lines.push('', `Not reverted automatically: ${revert.reason}.`);
  }
  lines.push(
    '',
    'Main stays red until this is fixed or the revert lands. A repeat of this exact failure set',
    'will NOT comment again - a new or changed one always will.',
    '',
    marker(hash),
  );
  return lines.join('\n');
}

function gh(args) {
  const res = spawnSync('gh', args, { encoding: 'utf8', windowsHide: true });
  return { ok: res.status === 0, out: String(res.stdout ?? '').trim(), err: String(res.stderr ?? '').trim() };
}

function findIssue() {
  const res = gh(['issue', 'list', '--state', 'open', '--search', `"${TITLE}" in:title`, '--json', 'number', '--jq', '.[0].number']);
  return res.ok && res.out ? res.out : null;
}

function readBodies(number) {
  const res = gh(['issue', 'view', String(number), '--json', 'body,comments', '--jq', '[.body] + [.comments[].body] | .[]']);
  return res.ok ? res.out.split('\n') : [];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sha = process.env.SHA ?? '';
  const runUrl = process.env.RUN_URL ?? '';
  const repo = process.env.GH_REPO;
  const retry = process.env.RETRY_RESULT ?? 'skipped';
  const { items, hash, exhausted, cancelled } = fetchFailureSet(process.env.RUN_ID, { repo });
  const existing = findIssue();
  // `readBodies` on a live issue returns the body plus every comment; joined with newlines by the
  // jq filter above, so a comment is one element per line - which is enough for both the substring
  // checks the decision makes, and cheaper than paging structured comment objects.
  const decision = planRedMainComment({ existing, bodies: existing ? readBodies(existing) : [], sha, hash, exhausted, cancelled });

  // THE REVERT, decided before the issue is written so the issue can name it. The last verdict
  // is looked up lazily, only once the cheaper rules have not already said no.
  const event = process.env.EVENT ?? '';
  const ref = process.env.REF ?? '';
  let retried;
  try {
    retried = JSON.parse(process.env.RETRY_SPECS || '[]').length;
  } catch {
    retried = 0;
  }
  const rerun = process.env.RERUN_RESULT || 'skipped';
  const verdict = shouldRevert({ event, ref, exhausted, retry, retried, rerun, items, previous: () => lastVerdictBefore({ repo, sha }) });
  let revert;
  if (verdict.revert) {
    console.log(`Reverting: ${verdict.reason}`);
    revert = revertLanding({ since: verdict.since, sha, runUrl, failing: describeFailureSet(items, { max: 4 }) });
    console.log(revert.status === 'queued' ? `Revert queued: ${revert.url}` : `::warning title=Revert::${revert.status}: ${revert.reason}`);
  } else {
    revert = { status: 'skipped', reason: verdict.reason };
    console.log(`::notice title=Revert::not reverting - ${verdict.reason}`);
  }
  const body = issueBody({ sha, runUrl, items, hash, retry, retried, revert });

  if (decision.action === 'create') {
    console.log(`Filing the red-main issue: ${decision.reason}`);
    gh(['issue', 'create', '--title', TITLE, '--body', body]);
  } else if (decision.action === 'comment') {
    console.log(`Commenting on issue #${existing}: ${decision.reason}`);
    gh(['issue', 'comment', String(existing), '--body', `Still red. ${body}`]);
  } else {
    // A notice rather than silence: whoever opens the run must be able to see that the alarm
    // CHOSE not to comment, and why. An alarm that suppresses invisibly is indistinguishable
    // from one that is broken.
    console.log(`::notice title=Red-main comment withheld::${decision.reason}`);
  }
}
