#!/usr/bin/env node
// The local shadow of a cloud landing: a merge job that follows the pull request.
//
//   node scripts/land-watch.mjs --pr 58 --branch claude/x     # what `npm run queue:merge` enqueues
//
// The landing itself happens on GitHub (.github/workflows/land.yml, scripts/land.mjs). But eleven
// things on this machine key on a LOCAL merge job for the branch - the hook that freezes a queued
// branch, the tick's QUEUED and LANDED events, stop-wait's "unqueued" warning, the night report,
// the session-start notice - and none of them should have to learn a second shape. So queueing
// still enqueues a merge job, and this is its command: it polls the pull request until it is
// merged (exit 0, and the landing goes in the ledger with THIS checkout as its session), or the
// `land` label is gone without a merge (exit 1, with the lander's refusal comment as the reason).
// Nothing here lands anything; a laptop that is off just does not watch.
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
 */
export function watchVerdict(pr, comments = []) {
  if (!pr) return { verdict: 'waiting' };
  if (pr.state === 'MERGED' || pr.mergedAt) return { verdict: 'landed', sha: pr.mergeCommit?.oid ?? pr.headRefOid };
  const labelled = (pr.labels ?? []).some((l) => l.name === 'land');
  if (labelled && pr.state === 'OPEN') return { verdict: 'waiting' };
  const refusal = [...comments].reverse().find((c) => /Landing refused/.test(c.body ?? ''));
  const reason = refusal ? refusal.body.replace(/\*\*Landing refused\*\*:\s*/, '').split('\n')[0] : `the pull request is ${String(pr.state).toLowerCase()} and no longer labelled`;
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

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function main() {
  const args = process.argv.slice(2);
  const pr = args[args.indexOf('--pr') + 1];
  const branch = args[args.indexOf('--branch') + 1];
  if (!pr || args.indexOf('--pr') < 0) {
    console.error('Usage: node scripts/land-watch.mjs --pr <number> --branch <name>');
    return 2;
  }
  const started = Date.now();
  let lastSaid = '';
  while (Date.now() - started < CAP_MS) {
    const view = gh(['pr', 'view', String(pr), '--json', 'state,mergedAt,mergeCommit,headRefOid,labels,url']);
    const { verdict, sha } = watchVerdict(view, []);
    if (verdict === 'landed') {
      const dir = jobsDir();
      if (dir) {
        appendFileSync(join(dir, 'landed.jsonl'), `${JSON.stringify({ branch, sha, worktree: process.cwd(), at: Date.now(), pr: Number(pr) })}\n`);
      }
      console.log(`land-watch: ${branch} landed on main as ${String(sha).slice(0, 8)} (${view.url})`);
      return 0;
    }
    if (verdict === 'refused') {
      const comments = gh(['pr', 'view', String(pr), '--json', 'comments'])?.comments ?? [];
      const detail = watchVerdict(view, comments);
      console.error(`land-watch: the landing of ${branch} was refused: ${detail.reason}`);
      console.error(`  ${view?.url ?? ''} - fix it, run /check, and npm run queue:merge again.`);
      return 1;
    }
    const line = view ? `waiting on GitHub - ${view.url}` : 'waiting (gh gave no answer this tick)';
    if (line !== lastSaid) {
      console.log(`land-watch: ${line}`);
      lastSaid = line;
    }
    await sleep(POLL_MS);
  }
  console.error(`land-watch: ${branch} is still queued on GitHub after an hour - the watcher is put back once (gh run list --workflow land.yml).`);
  return NO_VERDICT_EXIT;
}

if (process.argv[1] && process.argv[1].replaceAll('\\', '/').endsWith('/scripts/land-watch.mjs')) {
  process.exit(await main());
}
