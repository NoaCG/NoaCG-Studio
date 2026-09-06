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

import { describeFailureSet, fetchFailureSet } from './ci-failure-set.mjs';
import { revertLanding } from './revert-landing.mjs';

export const TITLE = 'CI is red on main';

const ZERO_SHA = '0'.repeat(40);

/**
 * SHOULD THIS RUN REVERT THE BATCH IT TESTED? Pure, for the same reason `planRedMainComment` is:
 * a revert is the one thing here that changes `main`, and the rule must be checkable by hand.
 *
 * The evidence a revert needs (docs/WORKFLOW_ARCHITECTURE.md §3, "sheriffs + auto-revert"): this
 * is a push to main, so there IS a batch (`before..sha`); something failed - a run that only ran
 * out of clock has no verdict and reverts nothing; the failed specs were already re-run once on
 * this commit and failed again, or the failure was never a spec (a red build is deterministic);
 * and the run before this batch was GREEN, so the batch is the culprit by the only evidence there
 * is. A main that was already red is not this batch's doing, and stacking a revert on a red main
 * would revert an innocent landing; that case is written into the issue instead.
 */
export function shouldRevert({ event = '', ref = '', before = '', previous = 'unknown', exhausted = false, retry = 'skipped' } = {}) {
  if (event !== 'push' || ref !== 'refs/heads/main') return { revert: false, reason: 'not a push to main, so no batch landed here' };
  if (exhausted) return { revert: false, reason: 'the run reached no verdict, so nothing is known to be broken' };
  if (!before || before === ZERO_SHA) return { revert: false, reason: 'the push names no `before` commit, so the batch cannot be bounded' };
  if (retry === 'success') return { revert: false, reason: 'the failed specs passed on their second run - a flake, quarantined rather than reverted' };
  if (previous === 'failure') return { revert: false, reason: 'main was already red before this batch, so the batch is not the culprit - fix main forward' };
  if (previous !== 'success') return { revert: false, reason: 'the run before this batch has no verdict, so the batch cannot be blamed on this evidence' };
  return { revert: true, reason: 'the run before this batch was green and the failure survived a second run on the same commit' };
}

/**
 * The verdict of the completed main push run BEFORE this one: `success`, `failure` or `unknown`.
 * Cancelled and skipped runs are walked past (a superseded run is no verdict), and only pushes
 * count - a dispatched run on main is somebody asking a question, not a landing.
 */
export function previousMainVerdict({ repo, runId, gh = ghJsonLines, limit = 15 } = {}) {
  if (!repo) return 'unknown';
  const runs = gh([`repos/${repo}/actions/workflows/ci.yml/runs?branch=main&event=push&status=completed&per_page=${limit}`, '--jq', '.workflow_runs[] | {id, conclusion}']);
  for (const run of runs) {
    if (String(run?.id) === String(runId)) continue;
    if (run?.conclusion === 'success' || run?.conclusion === 'failure') return run.conclusion;
  }
  return 'unknown';
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
export function issueBody({ sha, runUrl, items, hash, retry = 'skipped', revert = null }) {
  const lines = [`Commit ${sha} failed CI: ${runUrl}`, '', `Failing: ${describeFailureSet(items, { max: 12 })}`];
  if (retry === 'failure') lines.push('', 'The failed specs were re-run once on this same commit and failed again, so this is not a flake.');
  else if (retry === 'skipped') lines.push('', 'No second run: the failure was not in the E2E shards, or this was not a main push.');
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

/** `gh api ... --jq` prints one JSON value per line; unreadable output is no answer, not a crash. */
function ghJsonLines(args) {
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

  // THE REVERT, decided before the issue is written so the issue can name it. `previousMainVerdict`
  // is asked only when the cheaper rules have not already said no: it is two API calls.
  const event = process.env.EVENT ?? '';
  const ref = process.env.REF ?? '';
  const before = process.env.BEFORE ?? '';
  let verdict = shouldRevert({ event, ref, before, previous: 'success', exhausted, retry });
  if (verdict.revert) verdict = shouldRevert({ event, ref, before, previous: previousMainVerdict({ repo, runId: process.env.RUN_ID }), exhausted, retry });
  let revert;
  if (verdict.revert) {
    console.log(`Reverting the batch: ${verdict.reason}`);
    revert = revertLanding({ before, sha, runUrl, failing: describeFailureSet(items, { max: 4 }) });
    console.log(revert.status === 'queued' ? `Revert queued: ${revert.url}` : `::warning title=Revert::${revert.status}: ${revert.reason}`);
  } else {
    revert = { status: 'skipped', reason: verdict.reason };
    console.log(`::notice title=Revert::not reverting - ${verdict.reason}`);
  }
  const body = issueBody({ sha, runUrl, items, hash, retry, revert });

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
