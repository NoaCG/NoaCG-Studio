#!/usr/bin/env node
// The local shadow of a landing: a merge job that follows the pull request through the queue.
//
//   node scripts/land-watch.mjs --pr 58 --branch claude/x     # what `npm run queue:merge` enqueues
//
// The landing itself is GitHub's merge queue (docs/WORKFLOW_ARCHITECTURE.md §5). But eleven
// things on this machine key on a LOCAL merge job for the branch - the hook that freezes a queued
// branch, the tick's QUEUED and LANDED events, stop-wait's "unqueued" warning, the night report,
// the session-start notice - and none of them should have to learn a second shape. So queueing
// still enqueues a merge job, and this is its command: it polls the pull request until it is
// merged (exit 0, and the landing goes in the ledger with THIS checkout as its session), or
// auto-merge is off without a merge - GitHub drops an entry whose checks failed and disables
// auto-merge on it (exit 1, with the failing check as the reason). Nothing here lands anything;
// a laptop that is off just does not watch.
//
// Exit 5 (`NO_VERDICT_EXIT`) after the cap means "still queued on GitHub" - the store retries
// that once, which re-runs this watcher, exactly as it retried a landing CI never answered.

import { appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { jobsDir, NO_VERDICT_EXIT } from './jobs-store.mjs';
import { REQUIRED_CHECKS } from './landing-ruleset-reader.mjs';
import { primaryCheckout } from './primary-checkout.mjs';
import { triggerUnattendedSweep } from './worktree-cleanup-lib.mjs';

const POLL_MS = 30_000;
const CAP_MS = 60 * 60_000;
const CONFIRM_MS = 10_000;

/**
 * Pure: what the pull request's state means for the watcher.
 * { verdict: 'landed' | 'refused' | 'waiting', sha?, reason? }
 *
 * `expectSha` is the commit the session declared finished when it queued (`--expect-sha`, written
 * by `add-merge`). A pull request whose head has moved off it is carrying commits that were never
 * declared - the branch was pushed after queueing - and the queue must not watch that to a landing
 * as though it were the declared work. GitHub refuses it too, because `noacg/reviewed` is a
 * required check posted on the exact tip and a commit status cannot follow a new commit; this says
 * so on the first tick instead of leaving a reader to work out which check went missing and why.
 * A MERGED pull request is answered before the pin: what landed, landed.
 */
export function watchVerdict(pr, checks = [], { expectSha = null } = {}) {
  if (!pr) return { verdict: 'waiting' };
  if (pr.state === 'MERGED' || pr.merged || pr.mergedAt) return { verdict: 'landed', sha: pr.mergeCommit?.oid ?? pr.headRefOid };
  if (expectSha && pr.headRefOid && pr.headRefOid !== expectSha) {
    return {
      verdict: 'refused',
      reason: `the branch moved after it was declared finished (${String(expectSha).slice(0, 8)} -> ${String(pr.headRefOid).slice(0, 8)})`
        + ' - run /check on the new tip and queue again',
    };
  }
  // A pull request that conflicts with `main` keeps its auto-merge request and never enters the
  // queue, so without this it would read as waiting until the cap, be retried once, and read as
  // waiting again - for ever, on a branch only its own session can fix. The conflict is the verdict.
  if (pr.state === 'OPEN' && pr.mergeable === 'CONFLICTING') {
    return { verdict: 'refused', reason: 'the pull request conflicts with main and cannot enter the queue - in the branch\'s worktree merge origin/main, regenerate generated files, run /check and queue again (.agent-workflows/queue-merge.md, section 4)' };
  }
  const failed = (checks ?? []).filter(red);
  const failedNames = [...new Set(failed.map(nameOf))];
  // A REQUIRED CHECK THAT FAILED ON THE PULL REQUEST IS THE SAME TRAP AS THE CONFLICT ABOVE: the
  // auto-merge request stands, the queue never takes the pull request, and it read as waiting
  // until the cap - an hour of this machine's one landing slot, with every other session's
  // landing and every local suite parked behind a verdict GitHub had already given. Measured
  // 2026-09-19 on #332: `CI gate` failed at 20:08 UTC and the watcher was still "waiting in the
  // merge queue" at 20:28. Only while the queue has NOT taken it, because inside the queue the
  // pull request's own checks are history and the merge group's run is what decides. Which
  // checks, and when they are a verdict, is `requiredRefusal` below.
  const refusedOn = pr.state === 'OPEN' && pr.autoMergeRequest && !pr.mergeQueueEntry ? requiredRefusal(checks) : [];
  if (refusedOn.length > 0) {
    const others = failedNames.filter((name) => !refusedOn.includes(name));
    const also = others.length > 0 ? ` (also red: ${others.join(', ')})` : '';
    return { verdict: 'refused', reason: `${refusedOn.join(', ')} failed on the pull request${also}, so the queue never took it` };
  }
  // Auto-merge is the request; once the queue takes the pull request the request reads null and
  // the queue entry carries the state (AWAITING_CHECKS, MERGEABLE, ...). Either one is waiting.
  if (pr.state === 'OPEN' && (pr.autoMergeRequest || pr.mergeQueueEntry)) return { verdict: 'waiting' };
  const reason = failed.length > 0
    ? `${failedNames.join(', ')} failed on the pull request`
    : `the pull request is ${String(pr.state).toLowerCase()} and no longer queued for auto-merge`;
  return { verdict: 'refused', reason };
}

/** Every conclusion that blocks a required check; SKIPPED and NEUTRAL pass it. */
const FAILED = /^(FAILURE|ERROR|CANCELLED|TIMED_OUT|STARTUP_FAILURE|ACTION_REQUIRED|STALE)$/i;
const red = (c) => FAILED.test(c.conclusion || c.state || '');
/** A check run carries a name, a commit status a context. */
const nameOf = (c) => c.name ?? c.context;
const required = (c) => REQUIRED_CHECKS.includes(nameOf(c));
/** A run that cannot change any more: not queued or running, and not a status nobody answered. */
const settled = (c) => (c.status ?? 'COMPLETED').toUpperCase() === 'COMPLETED'
  && !/^(|PENDING|EXPECTED)$/i.test(c.conclusion || c.state || '');
/** When GitHub last touched a run: a re-run job can carry a start later than its old completion. */
const touched = (c) => [c.startedAt, c.completedAt].filter(Boolean).sort().at(-1) ?? '';

/**
 * Pure: the checks the landing ruleset requires (scripts/landing-ruleset-reader.mjs: `CI gate`
 * and `Reviewed`, not the gate alone) on which GitHub has already refused the pull request, or
 * none.
 *
 * A push run and a pull_request run of ci.yml both report under each name, and GitHub reads the
 * most recently updated run of a name. So: nothing in a workflow that reports a required check may
 * still be going - a pending or re-running check is not a verdict, and neither is one run's red
 * gate while the other run's shards are still working towards a gate that does not exist yet -
 * and then a required check whose newest run is red is one. Until 2026-10-02 this asked for EVERY run of the gate
 * to be red, on the guess that a green run would be the newer one. On #609 the push run's gate
 * went red one second AFTER the pull_request run's went green, GitHub held the pull request out
 * of the queue for seven hours on it, and the watcher read that as waiting for its full hour,
 * twice, with the machine's one landing slot. A tie counts as red: if GitHub read the green run
 * instead, every required check is green and the queue takes the pull request before the
 * watcher's confirming read.
 */
function requiredRefusal(checks) {
  const all = checks ?? [];
  const workflows = new Set(all.filter(required).map((c) => c.workflowName).filter(Boolean));
  if (!all.filter((c) => required(c) || workflows.has(c.workflowName)).every(settled)) return [];
  return REQUIRED_CHECKS.filter((name) => {
    const runs = all.filter((c) => nameOf(c) === name);
    const newest = (wanted) => runs.filter((c) => red(c) === wanted).map(touched).sort().at(-1);
    const lastRed = newest(true);
    return lastRed !== undefined && !(newest(false) > lastRed);
  });
}

function gh(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8', windowsHide: true, timeout: 20_000 });
  if (result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

/**
 * The pull request as the queue sees it. `gh pr view --json` does not expose the queue entry, so
 * this is one GraphQL query; the repository is whatever `gh` resolves for this checkout.
 */
function viewPr(number) {
  const slug = spawnSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], { encoding: 'utf8', windowsHide: true, timeout: 20_000 }).stdout?.trim();
  if (!slug) return null;
  const [owner, name] = slug.split('/');
  const query = `{ repository(owner:"${owner}",name:"${name}"){ pullRequest(number:${Number(number)}){ state merged mergeable url headRefOid mergeCommit{ oid } autoMergeRequest{ enabledAt } mergeQueueEntry{ state position } } } }`;
  return gh(['api', 'graphql', '-f', `query=${query}`])?.data?.repository?.pullRequest ?? null;
}

/** The pull request's checks as `gh` reports them, or none when it gives no answer. */
function rollup(number) {
  return gh(['pr', 'view', String(number), '--json', 'statusCheckRollup'])?.statusCheckRollup ?? [];
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** The landing, in the ledger the tick, the night report and the session-start notice read. */
function recordLanding(entry) {
  const dir = jobsDir();
  if (dir) appendFileSync(join(dir, 'landed.jsonl'), `${JSON.stringify(entry)}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const pr = args[args.indexOf('--pr') + 1];
  const branch = args[args.indexOf('--branch') + 1];
  const expectSha = args.indexOf('--expect-sha') >= 0 ? args[args.indexOf('--expect-sha') + 1] : null;
  if (!pr || args.indexOf('--pr') < 0) {
    console.error('Usage: node scripts/land-watch.mjs --pr <number> --branch <name> [--expect-sha <commit>]');
    return 2;
  }
  // A landing is the moment finished work exists, so it starts the unattended cleanup sweep
  // (docs/work-specs/worktree-lifecycle/spec.md). The sweep holds a just-landed worktree for its
  // idle window, so what it removes now is earlier work; this one goes on a later run.
  const afterLanding = () => triggerUnattendedSweep({ primaryRoot: primaryCheckout(process.cwd()) });
  return watch({ pr, branch, expectSha }, { afterLanding });
}

/**
 * The polling loop, with GitHub and the clock passed in so a night's pull request can be replayed
 * tick by tick (land-watch.test.mjs). Returns the exit code.
 */
export async function watch({ pr, branch, expectSha }, io = {}) {
  const {
    view: readView = viewPr,
    checks: readChecks = rollup,
    wait = sleep,
    now = Date.now,
    record = recordLanding,
    afterLanding = () => {},
  } = io;
  const started = now();
  let lastSaid = '';
  let refusedOnce = false;
  while (now() - started < CAP_MS) {
    const view = readView(pr);
    // The checks are only read while they can decide something: an open pull request the queue
    // has not taken. Inside the queue they are history, and one `gh` call a tick is enough.
    const undecided = view?.state === 'OPEN' && !view.mergeQueueEntry;
    const { verdict, sha, reason } = watchVerdict(view, undecided ? readChecks(pr) : [], { expectSha });
    if (verdict === 'landed') {
      record({ branch, sha, worktree: process.cwd(), at: now(), pr: Number(pr) });
      console.log(`land-watch: ${branch} landed on main as ${String(sha).slice(0, 8)} (${view.url})`);
      try {
        const sweep = afterLanding();
        if (sweep?.started) console.log('land-watch: started the unattended worktree cleanup in the background.');
      } catch {
        // Housekeeping never turns a landing into a failure.
      }
      return 0;
    }
    // A REFUSAL IS READ TWICE BEFORE IT IS BELIEVED. In the moment the queue merges a pull
    // request GitHub has already cleared the auto-merge request and the queue entry while the
    // state still reads OPEN - which is, field for field, what a pull request dropped from the
    // queue looks like. #342 was reported "refused: open and no longer queued for auto-merge" in
    // the same minute it merged (2026-09-20), and a session acting on that would have re-queued
    // landed work. A real refusal is still there ten seconds later; a merge is not.
    if (verdict === 'refused' && !refusedOnce) {
      refusedOnce = true;
      await wait(CONFIRM_MS);
      continue;
    }
    if (verdict === 'refused') {
      // A pull request the queue let go is read without its checks; read them now to name them.
      const why = undecided ? reason : watchVerdict(view, readChecks(pr), { expectSha }).reason;
      console.error(`land-watch: the landing of ${branch} was refused: ${why}`);
      console.error(`  ${view?.url ?? ''} - fix it, run /check, and npm run queue:merge again.`);
      return 1;
    }
    refusedOnce = false;
    const line = view ? `waiting in the merge queue - ${view.url}` : 'waiting (gh gave no answer this tick)';
    if (line !== lastSaid) {
      console.log(`land-watch: ${line}`);
      lastSaid = line;
    }
    await wait(POLL_MS);
  }
  console.error(`land-watch: ${branch} is still queued on GitHub after an hour - the watcher is put back once (gh pr view ${pr}).`);
  return NO_VERDICT_EXIT;
}

if (process.argv[1] && process.argv[1].replaceAll('\\', '/').endsWith('/scripts/land-watch.mjs')) {
  process.exit(await main());
}
