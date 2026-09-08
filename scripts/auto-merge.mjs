#!/usr/bin/env node
// LAND ONE BRANCH, MECHANICALLY - the boring path of the safe-merge workflow, as a command a
// job runner can spawn.
//
//   node scripts/auto-merge.mjs --branch <branch> [--dry-run] [--no-wait] [--no-db-push] [--onto-red-main]
//
// WHY THIS EXISTS. `.agent-workflows/safe-merge.md` is a procedure for a reader: it stops for
// judgement calls, and most of a landing is not a judgement call. Queued as
// `jobs.mjs add "node scripts/auto-merge.mjs --branch <b>" --kind merge`, several branches drain
// overnight in merge order, one at a time, and the owner wakes up to them landed.
//
// WHAT IT WILL NOT DO, and this is the whole design. It refuses - loudly, changing nothing
// further - on every case where the workflow would have asked a person:
//
//   - a merge-order verdict that is not `clear` (a stacked branch, a duplicate migration
//     number, a rename over another branch's edits - the cases the old collisions came from);
//   - any failed check in `safe-merge-preflight.mjs` phase 1, 3 or 4;
//   - a dirty worktree on either side;
//   - a CONFLICT integrating main (it aborts the merge and stops);
//   - a red, missing, damaged or shard-skipping CI run;
//   - MAIN ITSELF being red (`scripts/main-health.mjs`, exit 4) - see below;
//   - main moving under it at any point.
//
// It never force-pushes, never resets, never deletes a branch or a worktree, and the only merge
// it makes into main is `--ff-only`, which git refuses unless the branch already contains main.
//
// Publishing PAST main - npm publish, money - is never done here. MIGRATIONS ARE THE EXCEPTION,
// and deliberately so since 2026-08-25: after a successful landing this applies whatever
// production is missing, through `scripts/db-push.mjs`, which classifies every statement and
// refuses anything that can remove something. So the unattended run can do strictly less than an
// attended one, and the thing it removes is the gap where a landed migration waits for somebody
// to remember it. A refusal is reported and never fails the landing. `--no-db-push` opts out.
// `noacg-staging` gets the same treatment after production, since 2026-09-02 - it drifted the
// same way and only a twice-weekly red run said so, a day late and wearing the wrong diagnosis.

import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cancelledRunCulprits, cancelledRunDidWork, onlyMainIntegrationsBetween, parseWorktrees, selectCiRun,
} from './safe-merge-preflight.mjs';
import { jobsDir, pending, readJobs } from './jobs-store.mjs';
import { planMainHealth, readMainHealth } from './main-health.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const argv = process.argv.slice(2);
const branch = valueOf('--branch');
const dryRun = argv.includes('--dry-run');
const noWait = argv.includes('--no-wait');
/**
 * How many times to re-integrate when main moves under this branch mid-gate.
 *
 * Three, not unbounded: on a busy day an unbounded retry is a machine that never lands anything
 * while looking busy. Each attempt is a full re-verification, which the fork-point recovery in
 * ci.yml (`06a1cb31`) made cheap for a small branch - it used to be ten minutes of full suite.
 */
const attempts = Math.max(1, Number(valueOf('--attempts') ?? 3));
/**
 * Verdict reason KINDS a person has weighed and accepted, comma-separated.
 *
 * Not a severity override: `--accept shared-registry` says "I have looked at that specific
 * collision", and any OTHER reason in the same verdict still refuses. Exists because two
 * branches touching one registry both read `hold` symmetrically, so neither can go first and
 * the queue deadlocks until a human breaks the tie.
 */
const accept = (valueOf('--accept') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
/**
 * The commit the branch was at when a person queued it, if they said.
 *
 * A landing is queued to mean "this work is finished". Without pinning the sha, a session that
 * queues and then keeps working would have whatever it had committed by the time its turn came
 * landed for it - which is the thing queueing was supposed to prevent. If the branch moved, the
 * job refuses and asks for a fresh queue rather than guessing which commits were meant.
 */
const expectSha = valueOf('--expect-sha') ?? null;
/**
 * Land without applying what production is missing.
 *
 * For a machine that should never write to the hosted project - a second laptop, a checkout
 * pointed at someone else's `.env`. The push is otherwise the default, because a migration that
 * lands and is not applied is the failure this whole path exists to remove.
 */
const noDbPush = argv.includes('--no-db-push');

/**
 * Land even though main's own CI is red.
 *
 * The one legitimate case, and it has to exist or the gate deadlocks the thing it protects: when
 * THIS branch is the fix for what made main red, refusing to land it means main stays red for
 * ever. Deliberately a flag a person types rather than a condition the script infers - "does this
 * branch fix that spec?" is not a question a diff can answer, and guessing it wrong is how a gate
 * quietly stops being a gate.
 */
const ontoRedMain = argv.includes('--onto-red-main');


/**
 * Exit code the runner reads as "not my turn yet - put me back in the queue".
 *
 * Distinct from a failure on purpose: a landing blocked by a branch that is ITSELF still waiting
 * is a turn-order problem that resolves as soon as that branch lands, and treating it as a
 * failure would mean queueing five branches and hand-re-queueing the three that lost.
 */
const BLOCKED_EXIT = 3;

/**
 * Exit code for "main itself is red - this is not about your branch".
 *
 * Its own code rather than a plain refusal so `npm run jobs` can say WHICH refusal happened
 * without anyone opening a log (scripts/jobs-store.mjs `giveUpReason`). Five branches queued
 * overnight against a red main all stop with the same reason, and reading five identical lines
 * saying "main is red, fix main" is how the owner learns the fault is upstream of all of them.
 */
const RED_MAIN_EXIT = 4;

/**
 * Exit code for "CI never gave a verdict on the integrated commit".
 *
 * Its own code because it is the one refusal that says nothing about the branch and everything
 * about the machine: the run was still going when the budget ended, every run was a cancelled
 * shell, no run ever appeared, or a run did its work and was cancelled by a job's own timeout.
 * `waitForCi` returning false means exactly that set and nothing else - a RED run is conclusive
 * and leaves it through 'judge', for phase 3 to refuse with exit 1.
 *
 * Separating it is what makes the landing recoverable without its session: the queue re-runs a
 * landing that reached no verdict (scripts/jobs-store.mjs `retryLandingFor`) and never re-runs
 * one that was judged. Folded into exit 1, the two are indistinguishable and a retry would mean
 * re-landing branches CI had already refused.
 */
const NO_VERDICT_EXIT = 5;

/**
 * How many poll ticks the push webhook gets before the gate creates the run itself.
 *
 * Short on purpose. The verified sha is a merge commit this job just pushed, so its run arrives
 * by GitHub's push webhook - and webhook delivery is not bounded: on 2026-08-26 they ran 28-40
 * minutes late, which spent the whole wait budget hoping and then refused in words that read as
 * a tree fault. A `workflow_dispatch` is created by the API immediately, with no webhook in the
 * path, so after this grace the gate stops hoping and hands itself a run
 * (`.agent-workflows/queue-merge.md` documents the same move done by hand).
 *
 * DECLARED ABOVE THE ENTRY GUARD, deliberately: `await main()` below runs mid-module-evaluation,
 * so any `const` after the guard is still in its temporal dead zone when a real landing reaches
 * `waitForCi` - a crash only direct execution can see, because tests import (which evaluates the
 * whole module first). j-0102 died exactly this way on 2026-08-27.
 */
const DISPATCH_GRACE_TICKS = 3;

/**
 * Every refusal this script can make, as one machine-readable name each.
 *
 * WHY EVERY ONE, and not only the two the queue already acted on. Measured over the seven days to
 * 2026-09-04: 51 merge jobs did not exit 0, and 37 of them carried `refusal: null`. A refusal with
 * no kind is a sentence in a log nobody opens, so the queue treated a dirty worktree, a CI run that
 * gated nothing and a red gate as one undifferentiated "auto-merge said no" - and three of those
 * four have a mechanical recovery it could have run. The kind is what lets the queue tell recovery
 * from escalation, and it is what lets the branch's own session read WHY without the log.
 *
 * The names are grouped by what a reader has to DO about them, because that is the only question
 * a kind exists to answer:
 *
 *   - RECOVERABLE BY THE QUEUE: `order-blocked` (held until a blocker moves), `stale-pin` (re-pin
 *     and re-run), `shards-skipped` (dispatch a full run and re-gate).
 *   - THE BRANCH'S SESSION DECIDES, never the owner (ruling 2026-09-05): `order-caution` (a
 *     `hold` - a plain caution now lands in queue order), `dirty-tree`, `merge-conflict`,
 *     `preflight-1`, `ci-red`.
 *   - THE MACHINE FAILED, and retrying is honest: `main-fetch`, `main-churn`, `push-failed`,
 *     `worktree-unavailable`, `no-main-worktree`, `ff-refused`, `sha-mismatch`, `main-push-failed`,
 *     `order-no-verdict`.
 *
 * DECLARED ABOVE THE ENTRY GUARD for the reason `DISPATCH_GRACE_TICKS` is: `await main()` runs
 * mid-module-evaluation, so a `const` below the guard is still in its temporal dead zone when a
 * real landing reaches the refusal that names it.
 */
export const REFUSAL = {
  orderNoVerdict: 'order-no-verdict',
  orderBlocked: 'order-blocked',
  orderCaution: 'order-caution',
  stalePin: 'stale-pin',
  noMainWorktree: 'no-main-worktree',
  dirtyTree: 'dirty-tree',
  worktreeUnavailable: 'worktree-unavailable',
  preflight1: 'preflight-1',
  mainChurn: 'main-churn',
  mainFetch: 'main-fetch',
  mergeConflict: 'merge-conflict',
  pushFailed: 'push-failed',
  ciRed: 'ci-red',
  shardsSkipped: 'shards-skipped',
  ffRefused: 'ff-refused',
  shaMismatch: 'sha-mismatch',
  mainPushFailed: 'main-push-failed',
};

/**
 * The phase-3 check whose failure means "the run was green but gated nothing".
 *
 * Matched as a string rather than inferred, because the two phase-3 refusals recover in opposite
 * directions and guessing between them is worse than not splitting them at all. A run that gated
 * nothing is fixed by asking for a full one; a red run is fixed by a person. `scripts/auto-merge.test.mjs`
 * asserts `safe-merge-preflight.mjs` still prints this exact label.
 */
export const SKIPPED_SHARDS_CHECK = 'the skipped shards are accounted for';

/**
 * The phase-3 check that says the run itself was green.
 *
 * Read together with the one above, never alone: zero shards RAN is also true of a run whose
 * shards failed, so the skipped-shard line appears under a red run too.
 */
export const GREEN_RUN_CHECK = 'CI run verifies exactly this commit, green, gate included';

// Only land when invoked directly. Importing this module - which is how `scripts/auto-merge.test.mjs`
// reaches the decisions above - must never merge anything.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!branch) {
    console.error('usage: node scripts/auto-merge.mjs --branch <branch> [--dry-run] [--no-wait] [--no-db-push] [--onto-red-main]');
    process.exit(2);
  }
  const outcome = await main();
  process.exit(
    outcome === 'blocked' ? BLOCKED_EXIT
      : outcome === 'red-main' ? RED_MAIN_EXIT
        : outcome === 'no-verdict' ? NO_VERDICT_EXIT
          : outcome,
  );
}

/**
 * What the merge-order verdict licenses: proceed, wait for a turn, or refuse.
 *
 * Pure, and lifted out of `main` for the reason `planMigrationPush` was: these three answers are
 * the difference between a night that lands five branches and one that quietly drops four of
 * them, and no test can reach them through a function that also performs a real merge.
 */
export function planOrderDecision(
  verdict,
  { accept: accepted = [], isAheadOfMain = () => false, isQueuedForLanding = () => false } = {},
) {
  if (!verdict) {
    return {
      action: 'refuse',
      refusal: { kind: REFUSAL.orderNoVerdict },
      message: 'merge-order gave no verdict for this branch',
    };
  }
  if (verdict.severity === 'clear') return { action: 'proceed', message: 'merge-order: clear' };

  // A NAMED risk a person has already weighed may be accepted; nothing else can.
  //
  // Two branches editing one shared registry both read `hold`, symmetrically, so neither can
  // ever be the one that goes first - the queue deadlocks and only a human can break it. That
  // is the tool asking the right question, but it needs an answer it can accept. `--accept
  // <kind>` is that answer, and it is deliberately per-KIND rather than a blanket override:
  // saying "I have looked at the shared-registry collision" must not also wave through a
  // stacked branch or a duplicate migration number that happens to be in the same verdict.
  const unaccepted = (verdict.reasons ?? []).filter((r) => !accepted.includes(r.kind));
  if (unaccepted.length === 0) {
    return {
      action: 'proceed',
      message: `merge-order says ${verdict.severity}, accepted by hand: ${verdict.reasons.map((r) => r.kind).join(', ')}`,
    };
  }

  // BLOCKED BY A BRANCH THAT IS ITSELF STILL WAITING? Then this is not a refusal, it is a
  // turn-order problem that solves itself. Queue several landings at once and most of them
  // start out blocked by each other; each one that lands frees the next. Failing them
  // outright would mean the owner queues five, three fail, and he re-queues by hand - which
  // is the manual tracking this whole thing exists to remove.
  //
  // BUT ONLY IF SOMETHING IS COMING TO UNBLOCK IT. Deferring is a bet that the queue itself
  // will land the blocker; when no landing is queued for it, the bet cannot pay and each turn
  // just burns a deferral. A landing blocked by an unqueued branch used to spin through its
  // whole deferral budget in minutes and then vanish - the queue read empty and the branch read
  // "not queued", indistinguishable from unfinished work. So: at least one still-waiting
  // blocker QUEUED for landing means wait; none queued means refuse now, naming the blocker,
  // because that is a person's call (queue the blocker from its own session, or --accept).
  const blockers = [...(verdict.blockedBy ?? []), verdict.landFirst].filter(Boolean);
  const stillWaiting = blockers.filter((b) => isAheadOfMain(b));
  if (stillWaiting.length > 0) {
    if (stillWaiting.some((b) => isQueuedForLanding(b))) {
      return {
        action: 'blocked',
        message: `waiting its turn - ${stillWaiting.join(', ')} ${stillWaiting.length === 1 ? 'is' : 'are'} still ahead of main.`,
      };
    }
    // REFUSED HERE, PARKED BY THE QUEUE. This script cannot wait - it is one process with one
    // exit code - and re-running it on a timer against facts that have not moved is the busy-spin
    // the deferral bound exists to stop. So it states the refusal and names the blockers in a
    // machine-readable form, and the queue holds the job until one of them lands or is queued
    // (`orderHoldDecision` in scripts/jobs-store.mjs). The refusal is unchanged; what the queue
    // does with it is the part that was wrong.
    return {
      action: 'refuse',
      refusal: { kind: REFUSAL.orderBlocked, blockers: stillWaiting },
      message:
        `blocked by ${stillWaiting.join(', ')} - still ahead of main, and NO landing is queued for it, ` +
        'so waiting cannot change anything right now.\n' +
        '  Only that branch\'s own session queues it (queue-merge) when its work is finished. The queue\n' +
        '  holds this landing until one of them lands or is queued, and surfaces it if neither happens.\n' +
        '  A person who has weighed the collision can pass --accept <kind> instead.',
    };
  }
  // CAUTION LANDS IN QUEUE ORDER. A `caution` says "landing this first leaves a conflict or a
  // union for ANOTHER branch to resolve" - nothing is wrong with this branch, and the queue's
  // answer to who goes first is always the same: the one whose turn it is. Until 2026-09-05 this
  // refused and waited for a person to pass `--accept`; nine of the refusals behind the week's
  // slow landings were exactly that wait (`scripts/landing-latency.mjs`), and the owner ruled
  // the same day that a merge question never reaches him: the later branch integrates main and
  // resolves what it finds, or its resolver row does (`docs/OWNER_RULINGS.md`, 2026-09-05).
  if (verdict.severity === 'caution') {
    return {
      action: 'proceed',
      message:
        `merge-order says caution - landing in queue order, the later branch integrates: ` +
        unaccepted.map((r) => `[${r.kind}] ${r.text}`).join('; '),
    };
  }
  return {
    action: 'refuse',
    // No blockers on this one, deliberately. `blockers` means BRANCH NAMES everywhere else - the
    // hold releases on them and the listing prints them - and anything still ahead of main left
    // through the block above, so by here there are none. A `hold` is a caution with a blast
    // radius (HOLD_CONFLICT_FILES or more files, or a stacked branch): the branch's OWN session
    // settles it - integrate main here, or pass --accept <kind> after reading the reasons - and
    // it is never routed to the owner.
    refusal: { kind: REFUSAL.orderCaution },
    message:
      `merge-order says ${verdict.severity}: ${unaccepted.map((r) => `[${r.kind}] ${r.text}`).join('; ')}` +
      (verdict.landFirst ? `\n  land ${verdict.landFirst} first` : '') +
      `\n  this branch's session settles it: integrate main here and re-queue, or pass --accept <kind>`,
  };
}

/**
 * The conditions that must hold before main is touched at all: the branch is still the commit a
 * person queued, main has a worktree, and no worktree in play is dirty. A branch with no worktree
 * is answered with a plan to make a temporary one rather than a refusal (see below).
 *
 * Pure for the same reason, and ORDERED on purpose. The pin comes first because it is the only
 * one of the three that says "this is not the work that was queued", which stays true however
 * clean the trees are.
 */
export function planPreconditions({
  branch: name,
  expectSha: pinned = null,
  currentSha = null,
  mainWorktree = null,
  branchWorktree = null,
  isDirty = () => false,
  temporaryWorktreeBase = null,
  pathExists = () => false,
  isLandingIntegration = () => false,
} = {}) {
  // A LANDING THAT FAILED ALREADY MOVED THE TIP, and it is the only thing allowed to have.
  //
  // The pin asks "did the session commit more work after declaring this finished?", and the
  // answer must be no. But every landing pushes an integrated commit before it gates, so a
  // landing that died after that point leaves the branch one merge ahead of its own pin - and a
  // second attempt then refuses with "commits arrived after it was queued", naming commits the
  // FIRST ATTEMPT made. Found on 2026-09-03: `claude/d-queue-walks-itself` was pinned at a878b17
  // and sitting at 8a06da8a, which is that branch's own killed landing, not a line of new work.
  // Without this carve-out the retry mechanism is decorative - it re-queues a job that cannot
  // proceed.
  //
  // `isLandingIntegration` is narrow and structural, not a tolerance: every commit between the
  // pin and the tip must be a MERGE whose other side is already in main. Session work is either
  // an ordinary commit or a merge of something main does not have, and neither can pass.
  if (pinned && currentSha !== pinned && !isLandingIntegration(pinned, currentSha)) {
    return {
      action: 'refuse',
      // Named for the queue, which treats a stale pin ON A RETRY as an attempt that never happened
      // rather than one of the branch's tries spent (`retryLandingFor` in scripts/jobs-store.mjs).
      refusal: { kind: REFUSAL.stalePin },
      message:
        `${name} has moved since it was queued (${pinned.slice(0, 8)} -> ${String(currentSha).slice(0, 8)}), ` +
        'and not by a landing integrating main.\n' +
        '  Queueing a landing means the work is finished; commits arrived after that, so this is\n' +
        '  no longer the thing that was queued. Queue it again when it is done.',
    };
  }
  if (!mainWorktree) {
    return {
      action: 'refuse',
      refusal: { kind: REFUSAL.noMainWorktree },
      message: 'main is checked out nowhere - the human flow handles that case',
    };
  }
  if (isDirty(mainWorktree)) {
    return {
      action: 'refuse',
      refusal: { kind: REFUSAL.dirtyTree },
      message: `main's worktree is dirty (${mainWorktree})`,
    };
  }

  // NO WORKTREE IS NOT A REFUSAL ANY MORE - it is the temporary-worktree carve-out the human flow
  // has always had (`root/work-feature-branch-own-worktree-made`). A closed session leaves its
  // branch behind with nowhere to integrate main and run the gate, and refusing meant that branch could never land through the
  // queue at all: `editor-blank-stage-note` sat stuck behind exactly this on 2026-08-28, and the
  // outstanding listing said "not queued" for work that was finished. The carve-out is narrow on
  // purpose - the run makes ONE worktree, at a path it computes and nobody else owns, and removes
  // THAT SAME PATH at the end, never another, never with --force.
  if (!branchWorktree) {
    const temporary = planTemporaryWorktree({ branch: name, base: temporaryWorktreeBase, exists: pathExists });
    if (temporary.action === 'refuse') return temporary;
    // A worktree that does not exist yet cannot be dirty, so there is nothing more to check on
    // that side; main was checked above.
    return { action: 'proceed', temporaryWorktree: temporary };
  }
  if (isDirty(branchWorktree)) {
    return {
      action: 'refuse',
      refusal: { kind: REFUSAL.dirtyTree },
      message: `${name}'s worktree is dirty (${branchWorktree})`,
    };
  }
  return { action: 'proceed', temporaryWorktree: null };
}

/**
 * The folder name a temporary landing worktree gets.
 *
 * Derived from the branch and PREFIXED, so the path is unmistakably this script's own and can
 * never collide with a worktree a person made: `.claude/worktrees/<name>` is where sessions live,
 * and removing one of those by accident would destroy somebody's uncommitted work.
 */
export function temporaryWorktreeName(branch) {
  const slug = String(branch).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `auto-merge-tmp-${slug || 'branch'}`;
}

/**
 * May this run make a temporary worktree for `branch`, and where?
 *
 * Fails CLOSED on both ways it can be wrong. Without a base directory it does not guess one, and
 * an EXISTING path is refused rather than reused: a folder already there is either a leftover this
 * script must not silently adopt (its contents are unknown) or, worse, something else's. The whole
 * safety of the carve-out is that the path is created by this run and therefore known to be
 * disposable by it.
 */
export function planTemporaryWorktree({ branch, base, exists = () => false }) {
  if (!branch || !base) {
    return {
      action: 'refuse',
      refusal: { kind: REFUSAL.worktreeUnavailable },
      message: `${branch ?? 'the branch'} has no worktree, and no place was given to make a temporary one`,
    };
  }
  const path = join(base, temporaryWorktreeName(branch));
  if (exists(path)) {
    // A leftover that git still REGISTERS for this branch never reaches here - the branch then
    // has a worktree, and `main` adopts it (see `isTemporaryWorktree`) so it is cleaned up
    // rather than blocking the next landing. What is left at this point is a directory git knows
    // nothing about, whose contents are nobody's to assume.
    return {
      action: 'refuse',
      refusal: { kind: REFUSAL.worktreeUnavailable },
      message:
        `${branch} has no worktree, and the temporary path is already taken by something else: ${path}\n` +
        '  Remove it by hand once you know what it holds, then queue again.',
    };
  }
  return { action: 'create', path, branch };
}

/**
 * What removal is allowed to do, as a decision separate from doing it.
 *
 * The rule is one line and it is the reason this is a function: remove the EXACT path this run
 * created, or nothing. `git worktree remove` with a wrong path, or with `--force`, is how a
 * cleanup step turns into data loss, and no unattended run ever needs either.
 */
export function planTemporaryWorktreeRemoval(created, path) {
  if (!created) return { action: 'skip', message: 'nothing was created' };
  if (!path || created.path !== path) {
    return {
      action: 'refuse',
      message: `refusing to remove ${path ?? '(nothing)'} - this run created ${created.path}, and it removes only that`,
    };
  }
  // No --force, ever: the point of removal refusing on a dirty tree is that something unexpected
  // is in there, and an unattended run must leave that for a person.
  return { action: 'remove', args: ['worktree', 'remove', created.path] };
}

/** Make the temporary worktree the plan describes. Returns the created record, or null. */
/** Is this worktree one THIS mechanism made - and therefore this run's to take away again? */
export function isTemporaryWorktree(path, branch) {
  if (!path) return false;
  const name = String(path).replaceAll('\\', '/').replace(/\/$/, '').split('/').pop();
  return name === temporaryWorktreeName(branch);
}

export function createTemporaryWorktree(plan, { root = ROOT, run: runCmd = run } = {}) {
  if (plan?.action !== 'create') return null;
  say(`${plan.branch} has no worktree - making a temporary one at ${plan.path}`);
  const added = runCmd('git', ['-C', root, 'worktree', 'add', plan.path, plan.branch]);
  if (added.status === 0) return { path: plan.path, branch: plan.branch };
  // A killed run can leave a REGISTRATION whose directory is gone, and git then refuses this
  // path while `existsSync` says it is free - a permanent block on landing that branch. Prune
  // ONLY after such a failure, never as routine: it is a repo-wide edit made for one branch, and
  // pruning speculatively could forget a registration another session is looking at.
  if (runCmd('git', ['-C', root, 'worktree', 'prune']).status !== 0) return null;
  const retried = runCmd('git', ['-C', root, 'worktree', 'add', plan.path, plan.branch]);
  return retried.status === 0 ? { path: plan.path, branch: plan.branch } : null;
}

/** Remove the temporary worktree this run made - that one, and only that one. */
export function removeTemporaryWorktree(created, { root = ROOT, run: runCmd = run } = {}) {
  const decision = planTemporaryWorktreeRemoval(created, created?.path ?? null);
  if (decision.action !== 'remove') return decision;
  const res = runCmd('git', ['-C', root, ...decision.args]);
  if (res.status !== 0) {
    console.error(
      `auto-merge: could not remove the temporary worktree ${created.path} - it is left in place for a person to look at.`,
    );
    return { action: 'failed', message: decision.message };
  }
  say(`removed the temporary worktree ${created.path}`);
  return { action: 'removed' };
}

async function main() {
  // --- 1. Order. A `clear` verdict is the licence; anything else is a person's call. ---------
  const order = planOrderDecision(mergeOrderVerdict(branch), {
    accept,
    isAheadOfMain: aheadOfMain,
    isQueuedForLanding: queuedForLanding,
  });
  if (order.action === 'refuse') return refuse(order.message, order.refusal);
  if (order.action === 'blocked') {
    console.error(`auto-merge: ${order.message}`);
    return 'blocked';
  }
  say(order.message);

  // --- 2. Assess. The preflight settles every mechanical condition and prints each one. ------
  //
  // `--skip-order` only when a person has already accepted the order verdict above: the preflight
  // runs merge-order itself and blocks on a `hold`, so without this the acceptance would be
  // overruled one step later by the same fact. Every OTHER preflight check still runs - this
  // drops the one question that has already been answered, not the assessment.
  const preflight = ['scripts/safe-merge-preflight.mjs', '--branch', branch];
  if (accept.length > 0) preflight.push('--skip-order');
  if (run('node', preflight).status !== 0) {
    return refuse('preflight phase 1 failed - see its output above', { kind: REFUSAL.preflight1 });
  }

  // The pin is checked ONCE, here, before any attempt: the retry loop legitimately moves the
  // branch tip by integrating main, so it cannot live inside the loop.
  const mainWt = worktreeFor('main');
  let branchWt = worktreeFor(branch);
  const pre = planPreconditions({
    branch,
    expectSha,
    currentSha: expectSha ? git(['rev-parse', branch]) : null,
    mainWorktree: mainWt,
    branchWorktree: branchWt,
    isDirty: (wt) => git(['-C', wt, 'status', '--porcelain']) !== '',
    temporaryWorktreeBase: join(ROOT, '.claude', 'worktrees'),
    pathExists: existsSync,
    isLandingIntegration: onlyMainIntegrationsBetween,
  });
  if (pre.action === 'refuse') return refuse(pre.message, pre.refusal);

  // --- 2b. IS MAIN ITSELF GREEN? The question this gate never asked until 2026-08-29. -------
  //
  // Everything above is about the branch. This one is about the TARGET, and it is the gate the
  // measurement in docs/CI_STABILITY.md asked for: 27 of 40 red-main runs in a fortnight were one
  // defect re-reported, because landings kept arriving onto a red main and each push started
  // another run that failed the same way. Nothing here judges the branch; it declines to promote
  // anything onto a tree that is already broken.
  //
  // BEFORE the dry-run exit on purpose, so `--dry-run` proves the check rather than skipping it -
  // it reads GitHub and changes nothing, which is exactly what a dry run is allowed to do.
  const { health, failing } = readMainHealth();
  const mainHealth = planMainHealth(health, { failing, allowRed: ontoRedMain, branch });
  if (mainHealth.action === 'refuse') {
    console.error(`auto-merge REFUSED: ${mainHealth.message}`);
    return 'red-main';
  }
  say(mainHealth.message);

  if (dryRun) {
    if (pre.temporaryWorktree) {
      say(`dry run: ${branch} has no worktree; a real run would make one at ${pre.temporaryWorktree.path} and remove it again.`);
    }
    say('dry run: everything up to the first state change passed. Stopping before touching main.');
    return 0;
  }

  // Making the worktree IS a state change, so it happens after the dry-run exit - and whatever
  // the landing does, the same path is removed again in `finally`.
  let temporary = null;
  if (pre.temporaryWorktree) {
    temporary = createTemporaryWorktree(pre.temporaryWorktree);
    if (!temporary) {
      return refuse(
        `could not make a temporary worktree for ${branch} at ${pre.temporaryWorktree.path}`,
        { kind: REFUSAL.worktreeUnavailable },
      );
    }
    branchWt = temporary.path;
  } else if (isTemporaryWorktree(branchWt, branch)) {
    // A landing killed at its cap runs no cleanup, so the worktree it made is still registered
    // next time - and the branch then looks like it has one. It is still ours: adopt it, land in
    // it, and take it away at the end, rather than leaving a husk behind on every retry.
    temporary = { path: branchWt, branch };
    say(`reusing the temporary worktree a previous run left at ${branchWt}`);
  }

  // --- 3-5. Integrate, verify, land - retried ONLY when main moved underneath. ---------------
  //
  // A serial queue on a busy day loses this race constantly: another branch lands while this
  // one's gate runs, and phase 4 correctly refuses. Measured on the first two real landings -
  // the second one lost to a branch that landed during its ten-minute CI run. Without a retry
  // the job just fails and nothing re-queues it, so a queue would quietly drop landings one
  // after another while looking busy.
  //
  // There is no honest shortcut around re-verifying: a new main means a new tree, and a clean
  // merge is not proof the integration worked. So a retry is a full re-integration.
  //
  // ONLY this refusal retries. Every other one - a conflict, a red gate, a dirty tree - stops
  // dead, because the whole design is that anything needing judgement stops.
  try {
    return await landWithRetries(attempts, () => attemptLanding(mainWt, branchWt));
  } finally {
    // Whether it landed or refused, the worktree this run made is this run's to take away - and
    // ONLY that one. A refusal leaves the BRANCH exactly as it was, which is what a person needs
    // to look at; the empty checkout beside it helps nobody.
    if (temporary) removeTemporaryWorktree(temporary);
  }
}

/**
 * WHICH phase-3 refusal this was: the run gated nothing, or the run said no.
 *
 * Measured over the seven days to 2026-09-04: eight landings refused here, every one of them
 * reported as the same sentence - "red, damaged, or it skipped every shard" - which is three
 * different faults wearing one name. They are not the same fault and they do not recover the
 * same way, so the queue could do nothing with any of them.
 *
 * `shards-skipped` is the recoverable one. The run was GREEN; it simply planned no behavioural
 * work, so it proves the build and nothing else, and phase 3's own detail line already names the
 * cure. A dispatched run has no push base and escalates to the full suite by design, so asking
 * for one is the whole recovery. Everything else - red, damaged, missing, unreadable - is a
 * verdict or a fault a person reads, and re-running it just spends another CI wait to hear the
 * same answer.
 */
export function planPhase3Refusal(output, name = branch) {
  const text = String(output ?? '');
  // BOTH CONDITIONS, and the first is the one that matters. Phase 3 counts a shard as having run
  // only when it concluded `success`, so a run whose E2E shards FAILED also reports zero shards -
  // and then asks `classifyEmptyPlan` about them, which refuses. The two FAIL lines appear
  // together, and reading the second alone turns a red gate into the recoverable kind: the queue
  // would spend a full suite re-running a branch with a failing spec, and tell its session CI was
  // green. So the green line must have PASSED before the skipped-shard line means what it says.
  const gateGreen = text.includes(`[PASS] ${GREEN_RUN_CHECK}`);
  if (gateGreen && text.includes(`[FAIL] ${SKIPPED_SHARDS_CHECK}`)) {
    return {
      kind: REFUSAL.shardsSkipped,
      message:
        'preflight phase 3: the CI run is green but gated nothing - it skipped every E2E shard, so ' +
        'nothing has proved this tree\'s behaviour.\n' +
        `  Force a full run and gate again: gh workflow run ci.yml --ref ${name}`,
    };
  }
  return {
    kind: REFUSAL.ciRed,
    message: 'preflight phase 3 refused the CI run - it is red, damaged, or there is none for this commit',
  };
}

/**
 * Run one landing pass, re-running it ONLY while main keeps moving underneath, and at most
 * `attempts` times.
 *
 * Separated so the bound itself can be tested: an unbounded version of this is a machine that
 * looks busy all night and lands nothing, and that failure is invisible from the outside.
 */
export async function landWithRetries(attempts, attempt) {
  for (let n = 1; n <= attempts; n += 1) {
    if (n > 1) say(`main moved - re-integrating (attempt ${n} of ${attempts})`);
    const outcome = await attempt(n);
    if (outcome !== 'main-moved') return outcome;
  }
  return refuse(
    `main moved under this branch ${attempts} times running - giving up rather than looping. ` +
      'Land it by hand, or queue it when the machine is quieter.',
    { kind: REFUSAL.mainChurn },
  );
}

/**
 * One full integrate-verify-land pass. Returns 0, 1, or 'main-moved' when the target moved.
 *
 * Every command it issues arrives through `deps`, defaulting to the real ones. That is not
 * ceremony: the refusals below - a conflict, a red gate, a fast-forward git itself declines, a
 * main that moved - ARE this script, they run unattended at night, and a test that cannot reach
 * them without performing a real merge is not testing the part that lands branches.
 */
export async function attemptLanding(mainWt, branchWt, deps = {}) {
  const {
    branch: name = branch,
    noWait: skipCi = noWait,
    run: runCmd = run,
    runCaptured: gateCmd = runCaptured,
    git: gitCmd = git,
    waitForCi: awaitCi = waitForCi,
    afterLanding = (entry) => {
      recordLanding(entry);
      applyPendingMigrations();
    },
  } = deps;
  if (runCmd('git', ['-C', mainWt, 'pull', '--ff-only', 'origin', 'main']).status !== 0) {
    return refuse('could not fast-forward main from origin', { kind: REFUSAL.mainFetch });
  }
  const integratedMainSha = gitCmd(['rev-parse', 'main']);
  say(`main is ${integratedMainSha.slice(0, 8)}`);

  if (runCmd('git', ['-C', branchWt, 'merge', '--no-edit', 'main']).status !== 0) {
    runCmd('git', ['-C', branchWt, 'merge', '--abort']);
    return refuse(
      'integrating main conflicted - aborted, nothing changed. A person resolves this.',
      { kind: REFUSAL.mergeConflict },
    );
  }
  const verifiedSha = gitCmd(['rev-parse', name]);
  say(`verified sha will be ${verifiedSha.slice(0, 8)}`);

  // Gate on CI, green on EXACTLY that commit.
  if (runCmd('git', ['-C', branchWt, 'push', 'origin', name]).status !== 0) {
    return refuse('could not push the branch for CI', { kind: REFUSAL.pushFailed });
  }
  // `diffBase` is the main sha just merged in, so a dispatched stand-in run plans exactly what
  // this push planned rather than escalating to the full suite (`waitForCi`'s `dispatchRun`).
  //
  // A false answer is NO VERDICT, never a red one - `waitForCi` leaves through 'judge' the moment
  // a run concludes either way, so everything that reaches here is the machine failing to answer.
  // Hence its own outcome rather than `refuse`: the queue retries a landing nobody judged.
  if (!skipCi && !(await awaitCi(verifiedSha, { diffBase: integratedMainSha }))) {
    console.error('auto-merge REFUSED: CI gave no verdict on the integrated commit - see the sentence above.');
    return 'no-verdict';
  }
  // CAPTURED, not merely inherited, and this is the one place worth the extra machinery: phase 3
  // holds two refusals with OPPOSITE recoveries behind one exit code. "The run gated nothing"
  // is fixed by asking for a full run; "the run went red" is fixed by a person. The output is
  // echoed as it is read, so the job's log reads exactly as it did before.
  const gate = gateCmd('node', ['scripts/safe-merge-preflight.mjs', '--branch', name, '--phase', '3', '--verified-sha', verifiedSha]);
  if (gate.status !== 0) {
    const said = planPhase3Refusal(gate.output, name);
    return refuse(said.message, { kind: said.kind });
  }

  // Re-check, fast-forward, push.
  if (
    runCmd('node', [
      'scripts/safe-merge-preflight.mjs', '--branch', name, '--phase', '4',
      '--verified-sha', verifiedSha, '--integrated-main-sha', integratedMainSha,
    ]).status !== 0
  ) {
    console.error('auto-merge: main moved while the gate ran.');
    return 'main-moved';
  }
  if (runCmd('git', ['-C', mainWt, 'merge', '--ff-only', name]).status !== 0) {
    return refuse('the fast-forward merge was refused by git', { kind: REFUSAL.ffRefused });
  }
  if (gitCmd(['rev-parse', 'main']) !== verifiedSha) {
    return refuse('main is not the verified commit after the merge - NOT pushing', { kind: REFUSAL.shaMismatch });
  }
  if (runCmd('git', ['-C', mainWt, 'push', 'origin', 'main']).status !== 0) {
    return refuse(
      'the push to origin/main failed - main is landed locally, resolve by hand',
      { kind: REFUSAL.mainPushFailed },
    );
  }

  say(`landed ${name} on main as ${verifiedSha.slice(0, 8)}`);
  // A worktree this run MADE is its own to take away again (`main`'s `finally`); anybody else's
  // is left exactly as it was, which is what cleanup-worktrees owns.
  const ownWorktree = isTemporaryWorktree(branchWt, name);
  say(
    ownWorktree
      ? 'the branch is left alone; the temporary worktree this run made is removed below.'
      : 'the branch and its worktree are left alone - cleanup-worktrees owns that.',
  );
  // Only now, with the merge on origin/main: the ledger line, then whatever migration production
  // is missing. Neither may fail the landing - see `applyPendingMigrations`.
  // The ledger's `worktree` is read as "which SESSION was this" - so a path this run invented and
  // is about to delete must not be written there; there is no session behind it.
  afterLanding({ branch: name, sha: verifiedSha, worktree: ownWorktree ? null : branchWt, at: Date.now() });
  return 0;
}

/** One project's decision, from its already-parsed slice of the drift report. */
function planOne(label, drift) {
  if (!drift) return { label, action: 'skip' };
  if (drift.status === 'ok') return { label, action: 'skip' };
  if (drift.status !== 'drift') {
    // No token, no network, an offline laptop. Said once per project, so a reader knows the push
    // was considered and stood down rather than silently skipped.
    return { label, action: 'report', message: `${label} migration push not attempted: ${drift.detail}` };
  }
  return { label, action: 'push', drift };
}

/**
 * Which projects need a push, in the order they should get one.
 *
 * STAGING IS IN THE LIST because it drifts exactly the same way and nothing else was watching it:
 * the teams migrations sat unapplied on `noacg-staging` for a day and turned the twice-weekly
 * `hosted-latency` job red on a missing table, which from the alarm email is indistinguishable
 * from the hosted-only latency regression that job exists to catch. Production first, always - it
 * is the one with users on it, and a staging failure must not stand between a landing and them.
 */
export function planMigrationPushes(driftReport, { noDbPush: optedOut } = {}) {
  if (optedOut) return [];

  let report;
  try {
    report = JSON.parse(driftReport);
  } catch {
    // The drift script never fails its caller, so an unreadable report means it did not run at
    // all. Say so rather than treating silence as "production is fine" - that reading is the
    // failure the script is named after, and it would be worse here than there.
    return [{
      label: 'production',
      action: 'report',
      message: 'could not read the migration drift report - run `npm run db:push` by hand if a migration just landed.',
    }];
  }
  const { staging, ...production } = report;
  return [planOne('production', production), planOne('staging', staging)]
    .filter((target) => target.action !== 'skip');
}

/**
 * Apply whatever migration a hosted project is missing, now that one may have just landed.
 *
 * WHY HERE. `npm run db:push` removed the JUDGEMENT from applying a migration - it classifies
 * every statement and refuses anything that can lose something - but it left the TRIGGER with a
 * person, and a person is exactly what was missing. `0051` sat on main and unapplied for hours on
 * 2026-08-25; the drift check that found it can only report. This is the moment the gap opens:
 * main just moved, the runner is on a machine whose `.env` has the token, and nobody is watching.
 * Closing it here means the state a migration is written for is the state the next request meets.
 * `noacg-staging` joined production in that on 2026-09-02, for the same reason a day later.
 *
 * WHY IT ASKS THE DRIFT CHECK RATHER THAN DIFFING THIS BRANCH. "Did this landing add a migration"
 * is the wrong question - it would keep missing the case this exists for, which is a migration
 * that landed at some point and was never applied. "Is the project behind" is the right one, and
 * it is already answered by a script that never fails its caller.
 *
 * WHY IT CANNOT FAIL THE LANDING. The merge is pushed. Whatever happens now, that is true, and
 * turning a successful landing into a failed job would make the job's exit code mean two things
 * at once - the same reasoning `recordLanding` above is written under. A REFUSED push is not an
 * error either: it is the guard doing its work, and it is reported so the next person sees it.
 */
function applyPendingMigrations() {
  const targets = planMigrationPushes(capture('node', ['scripts/migration-drift.mjs', '--json']), { noDbPush });
  for (const target of targets) {
    if (target.action === 'report') {
      say(target.message);
      continue;
    }
    const { drift, label } = target;
    say(`${label} is missing ${drift.missing.join(', ')} - applying`);
    // Name the project outright. `db-push` defaults to whatever `VITE_SUPABASE_URL` says, which is
    // production, so a staging push that inherited the default would apply to the wrong database.
    const pushed = run('node', ['scripts/db-push.mjs', '--ref', drift.ref]);
    if (pushed.status === 0) {
      say(`migrations applied to ${drift.ref}`);
      continue;
    }
    console.error(
      `\nauto-merge: ${branch} LANDED, but the ${label} migration push did not go through.\n` +
        '  This is not a failed landing, and it may not be a failure at all - db-push refuses any\n' +
        '  migration that can remove something and reports instead. Read what it printed above, then:\n' +
        `      npm run db:push -- --ref ${drift.ref} --allow ${drift.missing.join(',')}\n` +
        `  if you accept what it does. Until then ${label} stays one or more migrations behind,\n` +
        '  which the safe-merge preflight will keep saying on every landing.',
    );
  }
}

/**
 * Append one line to the landed ledger.
 *
 * WHY. Automating the merge moved the decision off the owner's desk and, as a side effect, took
 * the ANSWER with it: with landings happening in a background runner, "which branches are in, and
 * therefore which sessions are finished?" stopped being something he could see. The ledger is
 * what SessionStart and `npm run jobs` read to put that back - a session whose branch has landed
 * says so loudly and suggests a handoff, so "done" is announced rather than inferred.
 *
 * Append-only JSONL, and a failure here never fails the landing: the merge is already pushed, and
 * losing a notification must not turn a successful landing into a failed job.
 */
function recordLanding(entry) {
  try {
    const dir = jobsDir();
    if (dir) appendFileSync(join(dir, 'landed.jsonl'), `${JSON.stringify(entry)}\n`);
  } catch {
    // Reported nowhere on purpose - see above.
  }
}

/**
 * Wait for the CI run on this exact commit - and after a short grace, MAKE one rather than
 * hoping. Never the verdict: whether what ran passed is the phase 3 preflight's call.
 *
 * THE LISTING IS THE TRUTH, THE WATCH IS AN OPTIMISATION. `gh run watch --exit-status` blocks on
 * a running job far cheaper than a poll loop, but it returns immediately on a run still `pending`
 * with zero jobs (j-0088, 2026-08-26) and its exit code conflates a red run with its own failure
 * - so the loop only ever RETURNS on what a fresh listing says, and it sleeps a tick after every
 * watch so an instant return cannot burn the budget in seconds.
 *
 * WHICH run to act on is `selectCiRun`'s call, over ci.yml runs only: the old `--limit 1` with
 * no workflow filter could watch a deploy-verify run - done in seconds, proving nothing - and
 * then hand phase 3 a CI run still in flight, a refusal that reads as a tree fault. It returns
 * true only once a CONCLUSIVE non-cancelled run exists (green or red - phase 3 judges it), keeps
 * waiting through cancelled shells (the ref-scoped concurrency group makes those, and a
 * replacement is normally seconds away), and gives up - a refusal, exactly as before - when the
 * budget ends with nothing conclusive.
 */
/**
 * The `gh` arguments that ask GitHub for a CI run on a branch.
 *
 * `--ref` targets the branch TIP, which right after a landing's own push IS the verified sha.
 *
 * `diff_base` is what keeps this dispatch from being a landing-killer. A `workflow_dispatch` run
 * has no `github.event.before`, and ci.yml escalates a baseless run to the FULL suite ON PURPOSE
 * - that is the manual door for demanding everything, and it stays. But a landing's dispatch is
 * not somebody asking for everything: it is a stand-in for a push run the webhook never
 * delivered, and it should plan exactly what that push would have. The integrated main sha does
 * that - ci.yml measures from it through `--integration`, the same base the push run's own
 * fork-point recovery produces, so the two runs plan identically. No base (the manual button, and
 * any caller that passes none) leaves the full-suite door exactly as it was.
 *
 * Its own function because the whole fix IS these two arguments, and a default buried in a
 * destructuring pattern is a thing no test can reach.
 */
export function dispatchArgs(name, diffBase = null) {
  return ['workflow', 'run', 'ci.yml', '--ref', name,
    ...(diffBase ? ['--field', `diff_base=${diffBase}`] : [])];
}

export async function waitForCi(sha, deps = {}) {
  const {
    branch: name = branch,
    ticks = 60,
    graceTicks = DISPATCH_GRACE_TICKS,
    // The commit a dispatched run should measure FROM - `attemptLanding` passes the main sha it
    // integrated, which is what the push run's own fork-point recovery would have found. See
    // `dispatchRun` below for why a dispatch without it is a landing-killer.
    diffBase = null,
    listRuns = () => {
      const out = capture('gh', ['run', 'list', '--workflow', 'ci.yml', '--branch', name,
        '--commit', sha, '--limit', '20', '--json', 'databaseId,status,conclusion']);
      try {
        return JSON.parse(out);
      } catch {
        return []; // gh failing is "no answer yet", and the tick budget bounds how long we ask
      }
    },
    watchRun = (id) => run('gh', ['run', 'watch', '--exit-status', String(id)]),
    // The jobs of one run, for classifying a cancelled one. Its own dep because it is a SECOND
    // call to `gh` - `gh run list` cannot return jobs - and a test must be able to answer it.
    runJobs = (id) => {
      const out = capture('gh', ['run', 'view', String(id), '--json', 'jobs']);
      try {
        return JSON.parse(out);
      } catch {
        return null; // Same posture as `listRuns`: a gh failure is "no answer", never "no work".
      }
    },
    dispatchRun = () => run('gh', dispatchArgs(name, diffBase)),
    sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
  } = deps;

  say('waiting for CI on the integrated commit...');
  let dispatched = false;
  // The STRONGEST evidence seen across the whole wait, never merely the last tick's: `listRuns`
  // answers a failed `gh` with `[]`, so one rate-limited listing on the final tick would
  // otherwise erase fifty-nine ticks of watching a real run and report that none ever existed.
  const seen = { live: null, cancelled: null, exhausted: null };
  // A cancelled run is classified ONCE. `runJobs` is a second network call per run, and the wait
  // sees the same cancelled run on every one of its sixty ticks.
  const classified = new Set();
  for (let attempt = 0; attempt < ticks; attempt += 1) {
    const picked = selectCiRun(listRuns());
    if (picked.action === 'judge') return true;
    if (picked.action === 'watch') {
      // The watch is an optimisation, never the truth: `gh run watch --exit-status` returns
      // IMMEDIATELY on a run still `pending` with zero jobs (measured on j-0088, 2026-08-26),
      // and exits non-zero for a red run and a gh failure alike. So whatever it claims, the
      // next LISTING decides - and the unconditional tick of sleep keeps an instant return
      // from burning the whole budget in seconds.
      seen.live = picked.run;
      watchRun(picked.run.databaseId);
      await sleep(10_000);
      continue;
    }
    // No run at all, or only cancelled shells - `selectCiRun` hands back the newest either way,
    // and which of the two it was is what the give-up sentence below turns on.
    if (picked.run) {
      seen.cancelled = picked.run;
      // ...except a cancelled run is only a SHELL if it never did anything. One whose shards ran
      // for twenty minutes and were killed by the shard job's own `timeout-minutes` wears the
      // same `cancelled`. Telling them apart decides what to do next, and the two answers are
      // opposite: a shell has a replacement coming, so wait; an exhausted run has nothing coming
      // for this commit ever, so waiting is the one thing that cannot work.
      const id = picked.run.databaseId;
      if (!classified.has(id)) {
        const detail = runJobs(id);
        // Only a real answer is remembered. `runJobs` hands back null when `gh` fails, and that
        // means "no answer yet", never "no work" - caching it would let one rate-limited call on
        // the tick this run first appears disable the check for the whole wait.
        if (detail) classified.add(id);
        if (detail && cancelledRunDidWork(detail)) {
          const exhausted = { ...picked.run, jobs: detail.jobs ?? [] };
          if (!dispatched) {
            // ASK FOR A FRESH RUN AT ONCE, without sitting out the webhook grace: there is no
            // webhook coming. Re-running is the only answer a timed-out shard has, and this is
            // now a cheap thing to ask for - the dispatch carries `diff_base`, so it plans this
            // change's subset rather than the full suite that killed j-0438 and j-0445.
            //
            // This is also what makes the queue's retry work at all. A retry re-runs the landing
            // against an unmoved main, so the merge is a no-op, the push is a no-op and the
            // verified sha is the same commit - and without this line the retry would find the
            // same cancelled run, stop again in seconds, and strand the branch having spent its
            // one retry on nothing.
            say(`CI run ${id} did its work and was cancelled by a job's own timeout - asking for a fresh run`);
            dispatchRun();
            dispatched = true;
            await sleep(10_000);
            continue;
          }
          // Twice in one attempt is not a flake. Stop with the verdict; the queue gives the
          // branch a whole fresh budget rather than this one spending itself on a third run.
          seen.exhausted = exhausted;
          break;
        }
      }
    }
    // Give the push webhook its grace, then stop waiting passively and create the run
    // ourselves - dispatch is idempotent-enough at once per landing, and a failed dispatch
    // just leaves us polling as before.
    if (!dispatched && attempt >= graceTicks) {
      say('no CI run has appeared - dispatching one (gh workflow run ci.yml) rather than waiting on the push webhook');
      dispatchRun();
      dispatched = true;
    }
    await sleep(10_000);
  }
  // A run still going, nothing ever appearing, and every run being cancelled are three facts
  // asking three different things, and printing one sentence for all of them is why this class
  // of refusal read as a fault in the branch. None of them is red: a red run is CONCLUSIVE and
  // left the loop above through 'judge', for phase 3 to give the verdict on.
  say(giveUpOnCi(seen, sha));
  return false;
}

/**
 * The one sentence that says how the CI wait ran out - the fact, and what it asks of a reader.
 *
 * Three outcomes, in the order of what a reader should do about them, and NONE of them is red:
 * a red run is conclusive, so it leaves the wait through 'judge' and phase 3 gives the verdict.
 * A run still in flight is the most common way the budget ends and the least like a fault, so
 * it must never be described as cancelled - that was the original defect wearing a new coat.
 *
 * Takes the evidence gathered across the WHOLE wait rather than the final tick, because the
 * final tick is exactly where a transient `gh` failure lands, and it looks identical to no run
 * ever existing.
 */
export function giveUpOnCi(seen, sha) {
  const commit = String(sha).slice(0, 8);
  // The one outcome that is not about waiting: a run that DID the work and was cancelled by a
  // job hitting its own timeout. It is named first because it is the only one where the reader
  // can see which job, and because it is the outcome that used to arrive as a killed landing.
  if (seen?.exhausted) {
    const id = seen.exhausted.databaseId;
    const culprits = cancelledRunCulprits(seen.exhausted);
    // Longest first, and no claim about WHICH one ran out: cancelling a run cancels everything
    // still in flight, so the list mixes the culprit with its collateral. The order puts the
    // answer at the front and lets the reader draw it.
    const named = culprits.length > 0 ? culprits.join(', ') : 'none it could name';
    return `gave up waiting: CI run ${id} on ${commit} did its work and then went 'cancelled', twice over. `
      + `Cancelled jobs, longest first: ${named}. A job killed at its own timeout-minutes reads as `
      + 'cancelled, and one cancelled job cancels the whole run. That is not a verdict and not a fault '
      + 'in this branch - the rest of the run was green or still going. A shard at its 20-minute cap '
      + 'twice running is the thing to look at; a fresh run was already asked for and went the same way.';
  }
  if (seen?.live) {
    const id = seen.live.databaseId;
    return `gave up waiting: CI run ${id} on ${commit} was still going when the wait ran out. `
      + 'That is not a verdict and not a fault in this branch - the run is slow or the queue is deep. '
      + `Watch it with \`gh run watch ${id}\` and queue the landing again once it concludes.`;
  }
  if (seen?.cancelled) {
    return `gave up waiting: every CI run on ${commit} was cancelled (newest ${seen.cancelled.databaseId}). `
      + 'Cancelled is not red - the branch was never judged, usually because a newer run for the same '
      + 'ref replaced it. Queue the landing again.';
  }
  return `gave up waiting: no CI run ever appeared for ${commit}, not even a dispatched one. `
    + 'That is GitHub or the workflow, not this branch - check `gh run list --workflow ci.yml` before re-queueing.';
}

// --- helpers ----------------------------------------------------------------------------------

/**
 * The merge-order verdict for one branch.
 *
 * Read stdout WHATEVER the exit code: `merge-order.mjs` exits 3 precisely when the answer is
 * `hold`, so treating a non-zero exit as "no answer" would throw away the one verdict that
 * matters most and refuse for the wrong reason.
 */
function mergeOrderVerdict(name) {
  const res = spawnSync('node', ['scripts/merge-order.mjs', '--branch', name, '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  try {
    return JSON.parse(res.stdout).verdict ?? null;
  } catch {
    return null;
  }
}

/**
 * The worktree holding `ref`, or null.
 *
 * Parsed with the preflight's own `parseWorktrees`, which is already unit-tested, rather than a
 * second reader of the same porcelain: this repo's worktree names routinely disagree with their
 * branches, so a directory name is never the answer and two parsers would be two chances to get
 * that wrong.
 */
function worktreeFor(ref) {
  return parseWorktrees(git(['worktree', 'list', '--porcelain'])).find((w) => w.branch === `refs/heads/${ref}`)?.path ?? null;
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}


/**
 * Does the queue hold a live landing for `ref`?
 *
 * The discriminator for the blocked-vs-refuse call above: a blocker with a waiting merge job
 * will be landed by the very queue this job sits in, so deferring resolves; a blocker with no
 * job has a session that has not declared it finished, and no amount of waiting changes that.
 * This job's own row is `running`, never a blocker's - merges never run beside each other.
 */
function queuedForLanding(ref) {
  return pending(readJobs(jobsDir())).some((j) => j.kind === 'merge' && j.branch === ref);
}

/** Is `ref` still unmerged - i.e. is the branch blocking us actually still in the running? */
function aheadOfMain(ref) {
  const res = spawnSync('git', ['rev-list', '--count', `origin/main..${ref}`], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  return res.status === 0 && res.stdout.trim() !== '0';
}

/** Run a command with its output shown, and hand back the result rather than throwing. */
function run(cmd, args) {
  return spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', encoding: 'utf8', windowsHide: true });
}

/**
 * Run a command, show everything it printed, AND hand the text back.
 *
 * The whole output arrives at once instead of streaming, which is why this is used for exactly
 * one call rather than replacing `run`: phase 3 is a handful of `gh` reads, and a landing's log
 * is read after the fact anyway. A long-running child - the build, a CI wait - must keep
 * streaming, or a killed job leaves a log that says nothing about where it got to.
 */
function runCaptured(cmd, args) {
  const res = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  return { status: res.status, output };
}

function capture(cmd, args) {
  const res = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  return res.status === 0 ? res.stdout.trim() : '';
}

function valueOf(name) {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

function say(message) {
  console.log(`auto-merge: ${message}`);
}

/**
 * Stop, say exactly why, and change nothing further.
 *
 * The `refusal` is the same sentence in one machine-readable line - a `kind` from `REFUSAL`, and
 * for an ordering block the branch names that caused it. EVERY refusal carries one now: the queue
 * cannot tell recovery from escalation without it, and neither can the session whose branch was
 * refused. An exit code carries one integer and an ordering block has a payload, so the kind is
 * stated on its own line and `classifyRefusal` (scripts/jobs-store.mjs) reads it back out of the
 * log.
 */
function refuse(reason, refusal = null) {
  if (refusal?.kind) {
    const blockers = (refusal.blockers ?? []).join(',');
    console.error(`auto-merge REFUSAL-KIND: ${refusal.kind}${blockers ? ` ${blockers}` : ''}`);
  }
  console.error(`auto-merge REFUSED: ${reason}`);
  return 1;
}
