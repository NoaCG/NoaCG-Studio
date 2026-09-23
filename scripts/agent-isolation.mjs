// "Am I actually running where the launch said I would?" - the probe that turns a silently
// dropped `isolation` into a loud failure.
//
// WHY THIS EXISTS. The Agent tool takes an `isolation` parameter, and on 2026-09-04 a call asking
// for `remote` was ACCEPTED, reported success, and ran on the laptop in an ordinary local
// worktree. Nothing in the launch result, the agent's output or the listing said the request had
// been dropped. That is the expensive shape of failure for a wave: rows routed to "cloud" to spend
// somebody else's RAM all run here instead, the machine hits its three-to-four session ceiling
// anyway, and the plan still reads as honoured. The same shape had already cost this repo twice on
// 2026-09-03 (the agent registry a session cannot see, and `isolation: worktree` minting its own
// branch name), which is why the launch contract keeps a list of them.
//
// A row that asked for remote runs `node scripts/agent-isolation.mjs --expect remote` as its first
// step. Being told at second one costs nothing; discovering it in the morning report costs a wave.
//
// THE DECISIVE SIGNAL IS THE LANDING QUEUE, not the hostname. The queue directory lives INSIDE
// `.git` (`<git-common-dir>/noacg-jobs`, see `jobsDir` in jobs-store.mjs), so git never clones it
// and never transfers it. A process that can read those job records is therefore on the machine
// that runs the queue, which is exactly the property that matters: sharing the queue means sharing
// the RAM and the one browser-driving slot the whole machine gets. Hostname and platform are
// reported because they are useful to a reader, but they decide nothing - they would tell you the
// machine's NAME, and the question is whether you are ON it.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { hostname, platform } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** How a job record is named in the queue directory, so a sidecar like `last-seen.json` is ignored. */
const JOB_RECORD = /^j-\d+\.json$/;

/**
 * The verdict, from facts alone. Pure so the reasoning is unit-tested rather than trusted.
 *
 * Two signals, either of which settles it, because either one alone is enough to prove presence on
 * the machine and neither can be faked by a clone:
 *
 *   - queue records, as above;
 *   - sibling worktrees, because `git worktree list` answers from the same `.git` the queue lives
 *     in, and a fresh clone in a container registers exactly one.
 *
 * Their ABSENCE is weaker than their presence, and the verdict says so rather than hiding it: a
 * checkout on this machine that has never queued a job and has no second worktree looks, to this
 * probe, exactly like a container. That case is called out in `reasons` instead of being smoothed
 * over, because a probe that overstates its confidence is the thing being fixed here.
 *
 * A THIRD SIGNAL, and the only positive one for remote: a Claude Code cloud session sets
 * `CLAUDE_CODE_REMOTE=true` in its container (measured in one on 2026-09-23, where the two local
 * signals were both absent and the verdict could only be the weak one). It settles remote with
 * confidence - but the local signals still win when they are present, because they are facts about
 * the disk and the variable is only something the environment says about itself.
 */
export function classifyLocation({ queueRecords = 0, worktrees = 0, remoteFlag = false } = {}) {
  const reasons = [];
  if (queueRecords > 0) reasons.push(`${queueRecords} job record(s) in the machine's landing queue, which git never clones`);
  if (worktrees > 1) reasons.push(`${worktrees} worktrees registered against this .git, so this is the machine hosting the sessions`);
  if (reasons.length > 0) {
    if (remoteFlag) reasons.push('CLAUDE_CODE_REMOTE=true is set as well, but the disk says this machine hosts the queue');
    return { verdict: 'local', confident: true, reasons };
  }
  if (remoteFlag) {
    return {
      verdict: 'remote',
      confident: true,
      reasons: ['CLAUDE_CODE_REMOTE=true: a Claude Code cloud session container, with no landing queue and no sibling worktrees'],
    };
  }
  return {
    verdict: 'remote',
    confident: false,
    reasons: [
      'no landing-queue records and no sibling worktrees, which is what a fresh clone looks like',
      'a local checkout that has never queued a job and has no second worktree looks identical, so treat this as weak',
    ],
  };
}

/** The sentence a caller gets when the launch asked for one thing and the process is somewhere else. */
export function mismatchReport({ expected, verdict, confident, reasons }) {
  if (expected === verdict) return null;
  const dropped = expected === 'remote' && verdict === 'local';
  return [
    `ISOLATION MISMATCH: the launch asked for ${expected}, this process is ${verdict}.`,
    ...reasons.map((reason) => `  - ${reason}`),
    dropped
      ? '  The isolation was dropped and the launch still reported success. This row is spending the'
        + "\n  local machine's RAM and its single browser slot, so treat the wave's capacity plan as wrong."
      : '  Confirm which side is wrong before trusting anything this row measured about the machine.',
    confident ? '' : '  (The verdict rests on absent signals, which is the weak direction - read the reasons.)',
  ].filter(Boolean).join('\n');
}

/** Count the queue's job records, tolerating a queue directory that was never created. */
function queueRecordCount(gitCommonDir) {
  if (!gitCommonDir) return 0;
  const dir = join(gitCommonDir, 'noacg-jobs');
  if (!existsSync(dir)) return 0;
  try {
    return readdirSync(dir).filter((name) => JOB_RECORD.test(name)).length;
  } catch {
    return 0;
  }
}

function git(args) {
  const res = spawnSync('git', args, { encoding: 'utf8', windowsHide: true });
  return res.status === 0 ? res.stdout.trim() : null;
}

/** Everything the verdict is drawn from, plus the context a reader wants beside it. */
export function observe() {
  const gitCommonDir = git(['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const worktreeList = git(['worktree', 'list', '--porcelain']);
  const worktrees = worktreeList ? worktreeList.split('\n').filter((line) => line.startsWith('worktree ')).length : 0;
  const queueRecords = queueRecordCount(gitCommonDir);
  return {
    host: hostname(),
    platform: platform(),
    cwd: process.cwd(),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    gitCommonDir,
    worktrees,
    queueRecords,
    ...classifyLocation({ queueRecords, worktrees, remoteFlag: process.env.CLAUDE_CODE_REMOTE === 'true' }),
  };
}

function main() {
  const args = process.argv.slice(2);
  // The flag's PRESENCE and its VALUE are read separately on purpose. Reading only the value means
  // a bare `--expect` yields undefined, skips the comparison, and exits 0 - a probe against silent
  // failure that fails silently itself. Present-but-unusable is a usage error, never a pass.
  const asked = args.includes('--expect');
  const expected = asked ? args[args.indexOf('--expect') + 1] : null;
  if (asked && !['local', 'remote'].includes(expected)) {
    console.error(`--expect takes local or remote, not ${expected === undefined ? '(nothing)' : expected}.`);
    console.error('Usage: node scripts/agent-isolation.mjs [--expect local|remote] [--json]');
    process.exit(2);
  }
  const facts = observe();

  if (args.includes('--json')) {
    console.log(JSON.stringify({ ...facts, expected }, null, 1));
  } else {
    console.log(`Running ${facts.verdict} - ${facts.host} (${facts.platform}), ${facts.cwd}`);
    console.log(`  branch ${facts.branch ?? 'unknown'}, ${facts.worktrees} worktree(s), ${facts.queueRecords} queue record(s)`);
    for (const reason of facts.reasons) console.log(`  - ${reason}`);
  }

  const mismatch = expected ? mismatchReport({ expected, ...facts }) : null;
  if (mismatch) {
    console.error(`\n${mismatch}`);
    process.exit(1);
  }
}

// Dispatched at the BOTTOM, after every declaration above it - the trap `jobs.mjs` documents over
// `main()`, where a command that reached a `const` declared below the dispatch threw in its first
// millisecond and the runner could not start at all.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
