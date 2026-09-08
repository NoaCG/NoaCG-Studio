#!/usr/bin/env node
// The local shadow of a landing: a merge job that follows the pull request through the queue.
//
//   node scripts/land-watch.mjs --pr 58 --branch claude/x     # what `npm run queue:merge` enqueues
//
// The landing itself is GitHub's merge queue (docs/WORKFLOW_ARCHITECTURE.md §5.2). But eleven
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

const POLL_MS = 30_000;
const CAP_MS = 60 * 60_000;

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
    return { verdict: 'refused', reason: 'the pull request conflicts with main and cannot enter the queue - integrate main, resolve, and queue again' };
  }
  // Auto-merge is the request; once the queue takes the pull request the request reads null and
  // the queue entry carries the state (AWAITING_CHECKS, MERGEABLE, ...). Either one is waiting.
  if (pr.state === 'OPEN' && (pr.autoMergeRequest || pr.mergeQueueEntry)) return { verdict: 'waiting' };
  const failed = (checks ?? []).filter((c) => /^(FAILURE|ERROR|CANCELLED|TIMED_OUT)$/i.test(c.conclusion ?? c.state ?? ''));
  const reason = failed.length > 0
    ? `${failed.map((c) => c.name ?? c.context).join(', ')} failed on the pull request`
    : `the pull request is ${String(pr.state).toLowerCase()} and no longer queued for auto-merge`;
  return { verdict: 'refused', reason };
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

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function main() {
  const args = process.argv.slice(2);
  const pr = args[args.indexOf('--pr') + 1];
  const branch = args[args.indexOf('--branch') + 1];
  const expectSha = args.indexOf('--expect-sha') >= 0 ? args[args.indexOf('--expect-sha') + 1] : null;
  if (!pr || args.indexOf('--pr') < 0) {
    console.error('Usage: node scripts/land-watch.mjs --pr <number> --branch <name> [--expect-sha <commit>]');
    return 2;
  }
  const started = Date.now();
  let lastSaid = '';
  while (Date.now() - started < CAP_MS) {
    const view = viewPr(pr);
    const { verdict, sha } = watchVerdict(view, [], { expectSha });
    if (verdict === 'landed') {
      const dir = jobsDir();
      if (dir) {
        appendFileSync(join(dir, 'landed.jsonl'), `${JSON.stringify({ branch, sha, worktree: process.cwd(), at: Date.now(), pr: Number(pr) })}\n`);
      }
      console.log(`land-watch: ${branch} landed on main as ${String(sha).slice(0, 8)} (${view.url})`);
      return 0;
    }
    if (verdict === 'refused') {
      const checks = gh(['pr', 'view', String(pr), '--json', 'statusCheckRollup'])?.statusCheckRollup ?? [];
      const detail = watchVerdict(view, checks, { expectSha });
      console.error(`land-watch: the landing of ${branch} was refused: ${detail.reason}`);
      console.error(`  ${view?.url ?? ''} - fix it, run /check, and npm run queue:merge again.`);
      return 1;
    }
    const line = view ? `waiting in the merge queue - ${view.url}` : 'waiting (gh gave no answer this tick)';
    if (line !== lastSaid) {
      console.log(`land-watch: ${line}`);
      lastSaid = line;
    }
    await sleep(POLL_MS);
  }
  console.error(`land-watch: ${branch} is still queued on GitHub after an hour - the watcher is put back once (gh pr view ${pr}).`);
  return NO_VERDICT_EXIT;
}

if (process.argv[1] && process.argv[1].replaceAll('\\', '/').endsWith('/scripts/land-watch.mjs')) {
  process.exit(await main());
}
