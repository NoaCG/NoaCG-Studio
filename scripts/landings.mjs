// Keep the local landing ledger fed from GitHub (docs/WORKFLOW_ARCHITECTURE.md §5.2).
//
// Eleven scripts read `<git-common-dir>/noacg-jobs/landed.jsonl` - the listing, the tick, the
// night report, the session-start notice, the latency metric. The laptop lander wrote it; the
// cloud lander cannot. So the readers that already talk to GitHub pull the merged, `land`-labelled
// pull requests and append the ones the ledger lacks, in the ledger's own shape:
// `{ branch, sha, worktree: null, at, pr }`. Bounded (one `gh` call, a page of pull requests,
// ten seconds) and silent when `gh` cannot answer - a ledger that is briefly behind is not a
// failure, and nothing here may stall a hook.

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const LEDGER = 'landed.jsonl';

/**
 * The merge commit a landed pull request produced: the ff push moved main to the head sha. The
 * worktree is the session the landing belongs to (the session-start notice keys on it); the
 * watcher job records it directly, and this fills it from the branch's checkout when one exists.
 */
function entryFor(pr, worktreeOf) {
  return {
    branch: pr.headRefName,
    sha: pr.mergeCommit?.oid ?? pr.headRefOid,
    worktree: worktreeOf(pr.headRefName),
    at: Date.parse(pr.mergedAt) || Date.now(),
    pr: pr.number,
  };
}

/** branch -> checkout path, from `git worktree list`; null when the branch has no checkout here. */
export function worktreeLookup(porcelain) {
  const map = new Map();
  let current = null;
  for (const line of String(porcelain ?? '').split('\n')) {
    if (line.startsWith('worktree ')) current = line.slice('worktree '.length).trim().replaceAll('\\', '/');
    else if (line.startsWith('branch refs/heads/') && current) map.set(line.slice('branch refs/heads/'.length).trim(), current);
  }
  return (branch) => map.get(branch) ?? null;
}

function localWorktrees() {
  const result = spawnSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf8', windowsHide: true, timeout: 10_000 });
  return worktreeLookup(result.status === 0 ? result.stdout : '');
}

/** Pure: the entries the ledger lacks, oldest first. */
export function missingEntries(ledgerLines, prs, worktreeOf = () => null) {
  const known = new Set();
  for (const line of ledgerLines) {
    try {
      const entry = JSON.parse(line);
      if (entry?.sha) known.add(entry.sha);
      if (entry?.pr) known.add(`pr:${entry.pr}`);
    } catch {
      // a torn line is not this reader's problem
    }
  }
  return (prs ?? [])
    .filter((pr) => pr.mergedAt && pr.headRefName)
    .map((pr) => entryFor(pr, worktreeOf))
    .filter((e) => !known.has(e.sha) && !known.has(`pr:${e.pr}`))
    .sort((a, b) => a.at - b.at);
}

function fetchLanded(limit) {
  const result = spawnSync(
    'gh',
    ['pr', 'list', '--state', 'merged', '--label', 'land', '--limit', String(limit), '--json', 'number,headRefName,headRefOid,mergeCommit,mergedAt'],
    { encoding: 'utf8', windowsHide: true, timeout: 10_000 },
  );
  if (result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

/** Append what GitHub landed that the ledger does not know. Returns the entries added. */
export function syncLandings(dir, { limit = 40, fetch = fetchLanded, worktrees = localWorktrees } = {}) {
  const file = join(dir, LEDGER);
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
  const prs = fetch(limit);
  if (!prs) return [];
  const missing = missingEntries(lines, prs, worktrees());
  if (missing.length > 0) appendFileSync(file, `${missing.map((e) => JSON.stringify(e)).join('\n')}\n`);
  return missing;
}
