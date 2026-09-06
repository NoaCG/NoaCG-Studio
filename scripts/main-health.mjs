#!/usr/bin/env node
// IS MAIN ITSELF GREEN RIGHT NOW? The question the landing gate never asked.
//
//   node scripts/main-health.mjs [--json]
//
// WHY THIS EXISTS. `auto-merge.mjs` gates hard on the INTEGRATED sha - is this branch, merged with
// main, green? - and that is the right question about the branch. It is not a question about main.
// So when main went red on 2026-08-27, every queued landing integrated a red main, gated green on
// its own merge commit (the failing spec was not in that branch's affected plan), pushed, and
// started another main run that failed the same way. `ci.yml` sets `cancel-in-progress: false` for
// main deliberately, so nothing collapsed those, and GitHub mailed a CheckSuite failure for each.
//
// ONE defect, 35 hours, 27 emails (docs/CI_STABILITY.md, measured 2026-08-15..29). The mechanism
// that turns those 27 back into 1 is this file: a red main stops the queue until a person fixes
// main. Refusing is not the cost - the landings were never going to be safe to promote onto a red
// main anyway; all the queue was doing was re-reporting somebody else's bug under new sha names.
//
// WHAT IT DELIBERATELY DOES NOT DO:
//   - It never treats "no answer" as red. No completed run (a fresh repo, a fresh main), an
//     unreachable `gh`, a run still in flight - all proceed, with a printed note. This gate makes
//     the inbox quieter; it must never make the queue mysteriously stop.
//   - It never treats a CANCELLED run as a verdict, the standing rule in docs/VERIFICATION.md.
//   - It is not the safety gate. The branch's own green gate on the integrated sha still decides
//     whether the branch may land, exactly as before, and nothing here relaxes it.
//
// THE THIRD ANSWER, added 2026-09-04. Skipping cancelled runs is right and stays. What was wrong
// is that skipping had no floor: this file walked back through as many cancelled runs as it took
// to find a verdict and then quoted it as the present tense. On 2026-09-04 it answered "main is
// green" citing run 30964711888 - from 2026-08-05, four weeks and a different commit earlier -
// because concurrency cancellation and shard-cap kills had become common enough to fill the whole
// 30-run window. Nobody could tell that answer apart from a genuine green.
//
// So `green` now means "a recent verdict says success", and a verdict too old or buried under too
// many unjudged runs reports `stale` instead. Stale PROCEEDS, like `unknown` - the rule above that
// this gate must never mysteriously stop the queue is untouched - but it says what it does not
// know rather than dressing an old fact up as a current one. Both numbers ride along in every
// message, green ones included, so the fact is visible before it crosses a threshold.

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describeFailureSet, fetchFailureSet } from './ci-failure-set.mjs';

/** A conclusion that says the code is at fault. `cancelled` is not here on purpose. */
const RED = new Set(['failure', 'timed_out', 'startup_failure']);

/**
 * How old a green verdict may be before it stops describing main.
 *
 * Twelve hours, from what a day here actually looks like: over the 30 ci.yml runs on main from
 * 2026-09-02 23:06 to 2026-09-04 02:23, consecutive runs were minutes to a couple of hours apart,
 * so half a day of silence is already far outside normal and means either nothing is landing or
 * nothing is finishing. Both are worth saying out loud; neither is worth stopping the queue for.
 */
export const STALE_AFTER_HOURS = 12;

/**
 * How many unjudged runs may sit on top of a verdict before it stops describing main.
 *
 * A cancelled run still moved main - every landing pushes - so the verdict is about a commit five
 * or more merges behind the tip by the time this fires. In the same 30-run window the largest real
 * gap was two, so five is comfortably clear of an ordinary bad patch and nowhere near the
 * twenty-nine it took to reach a month-old run.
 */
export const STALE_AFTER_SKIPPED = 5;

/**
 * What main's recent ci.yml runs say, newest verdict first.
 *
 * Run selection follows `selectCiRun`'s reasoning (scripts/safe-merge-preflight.mjs): newest by
 * `databaseId` because that is minted in strict creation order, and a run that is still going or
 * was cancelled is skipped rather than judged - neither is a verdict about anything.
 *
 * Returns `{ state: 'green' | 'red' | 'stale' | 'unknown', latest, since, redRuns, skipped,
 * verdictAt }`. `since` is the creation time of the OLDEST run in the current unbroken red streak,
 * which is the honest answer to "since when" - the newest red run's timestamp would say main went
 * red seconds ago when it has been red since yesterday morning.
 *
 * `skipped` counts the runs NEWER than the verdict that carried none of their own, and `verdictAt`
 * is when the verdict was created. Together they are what separates a green from a `stale` - and
 * they are reported on a green too, because the interesting moment is before a threshold trips.
 *
 * A RED VERDICT IS NEVER STALED. Red stops the queue, and an unattended red main is exactly the
 * situation where runs pile up behind it; letting age downgrade it would make the alarm quietest
 * when the problem is worst.
 */
export function assessMain(runs, { now = Date.now() } = {}) {
  const sorted = [...(runs ?? [])]
    .filter((r) => r?.databaseId != null)
    .sort((a, b) => Number(b.databaseId) - Number(a.databaseId));
  // Only settled, non-cancelled runs carry a verdict; everything else is skipped, not counted.
  const settled = sorted.filter(
    (r) => r.status === 'completed' && (r.conclusion === 'success' || RED.has(r.conclusion)),
  );
  const latest = settled[0] ?? null;

  // Runs newer than the verdict that FINISHED without carrying one - cancelled, or any other
  // completed conclusion this file does not judge. With no verdict at all, that is every run.
  //
  // A run still queued or in flight is deliberately NOT counted: it has not failed to produce a
  // verdict, it just has not got there yet, and `main` sets `cancel-in-progress: false` so a queue
  // drain routinely has several stacked up. Counting those would report "no recent verdict" about
  // a green from ten minutes ago, in the one message whose whole job is to be believed.
  const above = latest ? sorted.slice(0, sorted.findIndex((r) => r.databaseId === latest.databaseId)) : sorted;
  const skipped = above.filter((r) => r.status === 'completed').length;

  if (!latest) return { state: 'unknown', latest: null, since: null, redRuns: 0, skipped, verdictAt: null };

  // How long ago the verdict was reached.
  const verdictAt = latest.createdAt ?? null;
  const ageMs = Number.isFinite(Date.parse(verdictAt ?? '')) ? now - Date.parse(verdictAt) : 0;
  const common = { latest, skipped, verdictAt };

  if (latest.conclusion === 'success') {
    const tooOld = ageMs > STALE_AFTER_HOURS * 3_600_000;
    const tooBuried = common.skipped >= STALE_AFTER_SKIPPED;
    if (tooOld || tooBuried) {
      return { ...common, state: 'stale', since: null, redRuns: 0, tooOld, tooBuried };
    }
    return { ...common, state: 'green', since: null, redRuns: 0 };
  }

  // Walk back through consecutive reds. The first green ends the streak; nothing else does,
  // because a cancelled run between two reds did not make main green in between.
  let streak = 0;
  let oldest = latest;
  for (const run of settled) {
    if (!RED.has(run.conclusion)) break;
    streak += 1;
    oldest = run;
  }
  return { ...common, state: 'red', since: oldest.createdAt ?? null, redRuns: streak };
}

/**
 * How current a verdict is, as a parenthetical - " 14 min ago, 2 newer run(s) unjudged".
 *
 * On every state that quotes a verdict, not only on the stale one. A green that is four hours old
 * with three unjudged runs behind it is still a green and still worth landing onto, but a person
 * reading the line should be able to see the drift building before it crosses a threshold.
 */
function freshness(health, now) {
  const age = humanAge(health.verdictAt, now);
  const parts = [];
  if (age) parts.push(`${age} ago`);
  if (health.skipped > 0) parts.push(`${health.skipped} newer run${health.skipped === 1 ? '' : 's'} unjudged`);
  return parts.length ? `, ${parts.join(', ')}` : '';
}

/** "3 h", "2 d 4 h" - or null when there is no timestamp to measure from. */
export function humanAge(since, now = Date.now()) {
  const started = Date.parse(since ?? '');
  if (!Number.isFinite(started)) return null;
  const minutes = Math.max(0, Math.round((now - started) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

/**
 * May this branch land, given what main's own CI says?
 *
 * Pure, and separate from the fetching for the reason every other decision in the landing path is:
 * a wrong condition here costs EVERY future landing, so it has to be reachable by a test that
 * performs no merge and talks to no API.
 */
export function planMainHealth(health, { failing = null, allowRed = false, branch = 'this branch', now = Date.now() } = {}) {
  if (health.state === 'unknown') {
    return {
      action: 'proceed',
      message: 'main has no completed ci.yml verdict to read - that is not red, so landing continues.',
    };
  }
  if (health.state === 'green') {
    return { action: 'proceed', message: `main is green (run ${health.latest?.databaseId ?? '?'}${freshness(health, now)}).` };
  }
  if (health.state === 'stale') {
    // NOT a verdict about main as it stands now, and said as such. Landing continues for the
    // reason `unknown` does - this gate exists to stop a RED main, not to stop an unclear one -
    // but the sentence must never read as a green, because the last time it did, a session was
    // told main was fine on the strength of a run from the previous month.
    return {
      action: 'proceed',
      message:
        `main has no RECENT verdict - the newest one is run ${health.latest?.databaseId ?? '?'} (success${freshness(health, now)}).\n` +
        `  ${health.tooBuried ? `${health.skipped} newer run(s) reached no verdict of their own` : 'it is older than this gate treats as current'}, ` +
        'so this says nothing about the commit you are landing onto.\n' +
        '  Not red, so landing continues. If runs keep reaching no verdict, that is the thing to fix.',
    };
  }

  const what = failing?.items?.length ? describeFailureSet(failing.items) : 'a failure this gate could not name';
  const age = humanAge(health.since, now);
  const when = health.since ? `since ${health.since}${age ? ` (${age} ago)` : ''}` : 'since an unknown time';
  const runs = `${health.redRuns} consecutive red run${health.redRuns === 1 ? '' : 's'}`;
  const where = health.latest?.url ? `\n  latest red run: ${health.latest.url}` : '';
  const headline = `main is red on ${what} ${when} - ${runs}.`;

  if (allowRed) {
    return {
      action: 'proceed',
      message:
        `${headline}${where}\n` +
        '  --onto-red-main was passed, so this lands anyway. Only correct when THIS branch is the fix.',
    };
  }
  return {
    action: 'refuse',
    message:
      `${headline}${where}\n` +
      '  Fix main first, then queue again. Landing onto a red main is how one defect became 27 CI\n' +
      '  emails in 35 hours (docs/CI_STABILITY.md) - every landing pushes main, every push starts a\n' +
      '  run, and every run reports the same bug under a new sha.\n' +
      `  If ${branch} IS the fix for that, land it with:\n` +
      `      node scripts/jobs.mjs add-merge ${branch} --onto-red-main\n` +
      '  (add --unreviewed "<reason>" if /check has not stamped this tip - the queue refuses an unstamped tip)',
  };
}

/**
 * The live answer: main's recent ci.yml runs, and what is failing in the newest red one.
 *
 * Both halves fail soft. `gh` missing, offline, rate-limited - each yields no runs, which reads as
 * `unknown` and lets the landing continue. That direction is deliberate and stated at the top.
 */
export function readMainHealth({ listRuns = defaultListRuns, failureSetFor = fetchFailureSet } = {}) {
  const health = assessMain(listRuns());
  const failing = health.state === 'red' && health.latest ? failureSetFor(health.latest.databaseId) : null;
  return { health, failing };
}

function defaultListRuns() {
  const res = spawnSync(
    'gh',
    ['run', 'list', '--workflow', 'ci.yml', '--branch', 'main', '--limit', '30',
      '--json', 'databaseId,status,conclusion,headSha,createdAt,url'],
    { encoding: 'utf8', windowsHide: true },
  );
  if (res.status !== 0) return [];
  try {
    return JSON.parse(res.stdout);
  } catch {
    return [];
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { health, failing } = readMainHealth();
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ ...health, failing })}\n`);
  } else {
    console.log(planMainHealth(health, { failing }).message);
  }
  process.exit(health.state === 'red' ? 1 : 0);
}
