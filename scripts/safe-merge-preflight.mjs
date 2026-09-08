#!/usr/bin/env node
// THE MECHANICAL CHECKS OF THE safe-merge WORKFLOW, RUN RATHER THAN NARRATED.
//
//   node scripts/safe-merge-preflight.mjs --branch <branch>              # Phase 1 - assess
//   node scripts/safe-merge-preflight.mjs --branch <branch> --phase 4 \
//     --verified-sha <sha> --integrated-main-sha <sha>                   # Phase 4 - re-check
//
// WHY THIS EXISTS. `.agent-workflows/safe-merge.md` spells out its conditions precisely, and an
// agent following it reports them in prose. Prose is not evidence: a condition that was checked
// and one that was merely claimed read identically, and the only way to tell them apart was to
// re-run the commands by hand. On 2026-08-21 a run verified `main == origin/main` instead of
// running the prescribed `git pull --ff-only origin main` - harmless there, because the two were
// already equal, but invisible in the report either way. This script makes the difference
// visible: every condition prints PASS, FAIL or the value it found, and the exit code is the
// verdict.
//
// IT IS NOT A REPLACEMENT FOR THE WORKFLOW. It covers the checks a machine can settle - clean
// trees, sync state, fast-forwardability, SHA identity. The judgement calls stay with the
// workflow and the human: whether a CI run is a verdict or damaged, whether a conflict is
// mechanically resolvable, whether a `hold` from merge-order should be waved through.
//
// IT CHANGES NOTHING. Every command here is a read, except `git fetch` (which touches no working
// tree and no branch history, and which the workflow itself runs in the same phases). There is no
// checkout, no merge, no reset, no push. Pass --no-fetch to skip even that.
//
// SPEED IS THE POINT. Landing a branch is already the slow part of the day, so this must never
// add to it: the git reads are local and sub-second, and the one network call is the fetch the
// workflow performs anyway. `--skip-order` drops the merge-order ranking, the only step that
// costs seconds rather than milliseconds.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// The affected planner, imported rather than reimplemented: Phase 3 has to answer "should shards
// have run for this file list", and the only answer worth having is the one CI plans with.
import { planFor } from './e2e-affected.mjs';
import { changedBacklogFiles, receiptsFor, servesVerdict } from './owner-receipts.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', ...opts }).trim();
}

/** `git`, but a non-zero exit is an answer rather than an exception. */
function gitOk(args) {
  try {
    git(args, { stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

/**
 * Every worktree as `{ path, branch }`, `branch` being null for a detached HEAD.
 *
 * The porcelain form is the only reliable source here: a worktree's directory name says nothing
 * about which branch it holds, and this repo's names routinely disagree with their branches.
 */
export function parseWorktrees(porcelain) {
  const worktrees = [];
  let current = null;
  for (const line of porcelain.split('\n')) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length).trim(), branch: null };
      worktrees.push(current);
    } else if (line.startsWith('branch ') && current) {
      current.branch = line.slice('branch '.length).trim();
    }
  }
  return worktrees;
}

/**
 * The MAIN_SYNC rule as a verdict: how local `main` stands against `origin/main`.
 *
 * Ahead and diverged both mean a later `git push origin main` would publish commits nobody asked
 * this run to publish, which is why neither is a pass.
 */
export function classifyMainSync(ahead, behind) {
  if (ahead > 0 && behind > 0) return { state: 'diverged', ok: false, stop: true };
  if (ahead > 0) return { state: 'ahead', ok: false, stop: true };
  if (behind > 0) return { state: 'behind', ok: true, stop: false };
  return { state: 'in-sync', ok: true, stop: false };
}

/** Reject anything that is not one plain local branch name this flow is allowed to merge. */
export function validateBranchName(branch) {
  if (!branch) return 'no branch given';
  if (branch.startsWith('-')) return 'starts with "-"';
  if (branch === 'main') return 'is main itself';
  if (branch.includes('..') || branch.includes('~') || branch.includes('^') || branch.includes(':')) {
    return 'looks like a revision expression, not a branch name';
  }
  return null;
}

/**
 * The one-word verdict from `merge-order.mjs`, read WITHOUT assuming it exited 0.
 *
 * THE CHECK THAT COULD NOT SURVIVE THE THING IT CHECKS FOR. `merge-order` sets `exitCode = 3`
 * to SIGNAL a hold, and this file ran it through `execFileSync`, which throws on any non-zero
 * exit. So the one verdict the caller exists to catch was the one that crashed it: a Node stack
 * trace, no verdict line, and the run over before it reported anything. Hit for real on
 * 2026-08-21 landing a three-branch stack, where the hold was a self-reference between branches
 * in one lineage - the case a human most needs the report for.
 *
 * A thrown `execFileSync` error still carries the child's `stdout`, so the verdict is there
 * either way. Taking it from both paths is what makes exit 3 an ANSWER rather than an accident;
 * anything genuinely broken (no output at all) reads as `unknown`, which the caller treats as
 * not-a-hold rather than inventing one.
 */
export function mergeOrderVerdict(run) {
  let out;
  try {
    out = run();
  } catch (error) {
    out = typeof error?.stdout === 'string' ? error.stdout : '';
  }
  return /VERDICT: (\w+)/.exec(out ?? '')?.[1] ?? 'unknown';
}

/**
 * Would merging `branch` into `main` conflict? The ANSWER IS AN EXIT CODE, never a text scan.
 *
 * `git merge-tree --write-tree` exits 0 for a clean merge and 1 when there are conflicts, and
 * names the conflicted paths. The naive version of this check grepped the old merge-tree output
 * for `<<<<<<<` and reported a conflict the first time this very file was merged - because the
 * marker it was looking for appears, as a string literal, in the line right above. Content that
 * TALKS about conflicts is not a conflict.
 *
 * It writes a tree object into the object store and nothing else: no working tree, no index, no
 * ref. An unreferenced tree is collected by `git gc` and is invisible to every checkout.
 */
export function previewConflicts(branch, runner = git) {
  try {
    runner(['merge-tree', '--write-tree', '--name-only', 'main', branch]);
    return { clean: true, detail: 'no conflicts' };
  } catch (error) {
    if (error.status === 1) {
      // The output has three sections: the tree OID, the conflicted path names, and - after a
      // BLANK line - informational messages ("Auto-merging x", "CONFLICT (content): ..."). Stop
      // at the separator rather than filtering it out: filtering kept the messages in the count,
      // and one real conflict read as "8 conflicted path(s)" - the number a person uses to judge
      // whether a refusal is worth chasing.
      const lines = String(error.stdout ?? '').split('\n').slice(1).map((l) => l.trimEnd());
      const separator = lines.indexOf('');
      const paths = (separator === -1 ? lines : lines.slice(0, separator)).filter(Boolean);
      return { clean: false, detail: `${paths.length} conflicted path(s): ${paths.slice(0, 5).join(', ')}` };
    }
    return { clean: false, detail: `merge-tree failed: ${error.message.split('\n')[0]}` };
  }
}

/**
 * Which of the several runs a commit can carry is THE one to act on - and how.
 *
 * `gh run list --limit 1` answers this with creation order, and creation order lies twice. A
 * commit also carries deploy-verify runs, so the caller must already have filtered to ci.yml -
 * and even then, a push run and a dispatched run created in the same SECOND sort arbitrarily, so
 * the tie can break toward the push run the dispatch just CANCELLED (the ci.yml concurrency group
 * is the ref). That tie refused a real landing on 2026-08-26. `databaseId` is minted in strict
 * creation order, so it is the tiebreak; and a cancelled run is never the one to act on while any
 * other run exists - it proves nothing either way, like a damaged run.
 *
 * The answer, newest first by databaseId:
 *   - a run still going -> `watch` it: the set of evidence is not settled yet;
 *   - otherwise a conclusive non-cancelled run -> `judge` it (green OR red - preferring green
 *     here would weaken the gate, so the newest verdict wins whatever it says);
 *   - otherwise `none`: nothing, or only cancelled shells. `run` still carries the newest shell
 *     so a caller refusing can name what it saw.
 */
export function selectCiRun(runs) {
  const sorted = [...(runs ?? [])]
    .filter((r) => r?.databaseId != null)
    .sort((a, b) => Number(b.databaseId) - Number(a.databaseId));
  const live = sorted.find((r) => r.status && r.status !== 'completed');
  if (live) return { action: 'watch', run: live };
  const conclusive = sorted.find((r) => r.conclusion && r.conclusion !== 'cancelled');
  if (conclusive) return { action: 'judge', run: conclusive };
  return { action: 'none', run: sorted[0] ?? null };
}

/**
 * Is everything added between `pinned` and `current` an integration of main that a landing made?
 *
 * The question to ask when a branch pinned for landing has MOVED: was it the session committing
 * more work, or was it this branch's own earlier landing? Every landing pushes an integrated
 * commit before it gates, so a landing killed mid-gate always leaves the tip one merge past the
 * sha it was queued at - and reading that as "the session pushed" refuses a branch for what the
 * queue itself did to it. Measured 2026-09-03: `claude/d-queue-walks-itself` was pinned at
 * a878b17 and sitting at 8a06da8a, which is its own killed landing, not a line of new work.
 *
 * Structural, and it can only ever be true of the commits a landing actually makes:
 *
 *   1. `pinned` must still be an ancestor. Anything rebased, amended or reset is not "moved
 *      forward", it is a different branch, and it refuses.
 *   2. Walking FIRST PARENTS from the tip back to the pin, every commit must have exactly two
 *      parents - a merge - and its second parent must already be contained in main. Ordinary work
 *      has one parent, and a merge of another branch has a second parent main does not contain.
 *      First-parent order is checked implicitly: `git merge main` puts the branch's own history
 *      on the FIRST parent, so work committed after an integration shows up on the walk as a
 *      one-parent commit and refuses.
 *   3. Each merge must be TRIVIAL - its tree exactly what git would have written on its own.
 *      Without this the check admits a merge whose conflicts a person resolved by hand, and a
 *      conflict resolution is arbitrary new code in the merge commit's tree, which (1) and (2)
 *      never look inside. That is exactly the undeclared work the pin exists to catch, and
 *      sessions do merge main in by hand - the root AGENTS.md tells them to.
 *
 * Lives HERE, beside the other shared landing facts, because both the landing script and the
 * QUEUE need it and they need it to agree. The queue's need is the load-bearing one: a retry runs
 * in the branch's own checkout, so it executes that branch's copy of `auto-merge.mjs` - and a
 * branch that predates this rule would refuse its own retry on the pin. Measured, not predicted:
 * j-0519 did exactly that. So the queue re-pins before it queues rather than trusting the tooling
 * on the other side.
 *
 * Any git failure answers false. A question about safety that cannot be answered is answered no.
 */
export function onlyMainIntegrationsBetween(pinned, current, { cwd = ROOT } = {}) {
  const read = (args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  try {
    if (!pinned || !current || pinned === current) return false;
    execFileSync('git', ['merge-base', '--is-ancestor', pinned, current], { cwd, stdio: 'ignore' });
    const walk = read(['rev-list', '--first-parent', `${pinned}..${current}`])
      .split('\n').map((s) => s.trim()).filter(Boolean);
    if (walk.length === 0) return false;
    for (const sha of walk) {
      const parents = read(['rev-list', '--parents', '-n', '1', sha]).split(/\s+/).slice(1);
      if (parents.length !== 2) return false;
      // `main` rather than `origin/main`: the integration merged the LOCAL main, and that ref is
      // shared across every worktree of this repo. main only moves forward, so a second parent
      // contained in main then is contained in main now.
      execFileSync('git', ['merge-base', '--is-ancestor', parents[1], 'main'], { cwd, stdio: 'ignore' });
      if (read(['merge-tree', '--write-tree', parents[0], parents[1]]) !== read(['rev-parse', `${sha}^{tree}`])) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Did a CANCELLED run actually execute this repo's code, or is it an empty shell?
 *
 * The two wear the same `conclusion: cancelled`, and telling them apart is what stopped two
 * landings dead on 2026-09-03. A SHELL is what the ref-scoped concurrency group leaves behind
 * when a newer run replaces an older one: its jobs never got past being queued, a replacement is
 * seconds away, and waiting through it is right. An EXHAUSTED run is the opposite - it ran for
 * half an hour, most of its shards went green, and one hit the shard job's own `timeout-minutes`.
 * GitHub marks a job killed by its own timeout `cancelled`, and one cancelled job makes the whole
 * RUN `cancelled`, so a run that did all its work reads exactly like a shell that did none.
 *
 * That mattered because the caller's response to a shell is to dispatch a replacement, and a
 * dispatched run plans the FULL suite - about three times the work the push run was doing, asked
 * for with minutes left on the landing's clock. j-0438 and j-0445 both died that way; they were
 * the first two landings to time out in 213.
 *
 * The test is structural rather than a duration threshold: a job that reached a conclusion of its
 * own, or a cancelled job that ran a step of THIS REPO's, executed something. `skipped` never
 * counts - a skipped job is the plan being believed, not work being done.
 *
 * An exhausted run is still NOT A VERDICT (`root/read-which-jobs-ran-before-believing`: a job
 * that stops at its own `timeout-minutes` answers nothing about the code). It is a reason to stop
 * and say so, never a reason to judge the branch red.
 */
export function cancelledRunDidWork(run) {
  return (run?.jobs ?? []).some(jobDidWork);
}

/**
 * GitHub's own bookends, which every job runs whether or not it does anything.
 *
 * They must not count as work. `Set up job` concludes `success` the instant a runner picks a job
 * up, so counting it would classify a genuine concurrency shell - jobs cancelled seconds after
 * starting, with a replacement already queued - as a run that did its work, and the wait would
 * stop instead of sitting out the few seconds the replacement needs.
 */
const RUNNER_BOOKEND_STEPS = new Set(['Set up job', 'Complete job']);

function jobDidWork(job) {
  if (job?.conclusion === 'success' || job?.conclusion === 'failure') return true;
  return (job?.steps ?? []).some(
    (s) => !RUNNER_BOOKEND_STEPS.has(s.name)
      && (s.conclusion === 'success' || s.conclusion === 'failure'),
  );
}

/**
 * The cancelled jobs of a run that did work, longest first, each with how long it ran.
 *
 * Only used to write the sentence a person reads, but it is the whole difference between "the
 * landing failed" and "E2E 7/9 ran for 20 minutes, which is the shard job's own cap" - so it
 * lives beside the classifier that found them.
 *
 * LONGEST FIRST, and no claim about which one hit its timeout. Cancelling a run cancels every job
 * still in flight, so the list mixes the job that ran out with the collateral: on j-0438 three
 * shards each sat at 20 minutes and all three were genuine, while a run cancelled for any other
 * reason names shards that had barely started. Ordering by duration puts the answer at the front
 * without the sentence having to assert something it cannot know. Jobs that did nothing at all are
 * dropped - a job cancelled while still queued says nothing about anything.
 */
export function cancelledRunCulprits(run) {
  return (run?.jobs ?? [])
    .filter((job) => job.conclusion === 'cancelled' && jobDidWork(job))
    .map((job) => {
      const started = Date.parse(job.startedAt ?? '');
      const ended = Date.parse(job.completedAt ?? '');
      const minutes = Number.isFinite(started) && Number.isFinite(ended) && ended > started
        ? Math.round((ended - started) / 60_000)
        : null;
      return { name: job.name, minutes };
    })
    .sort((a, b) => (b.minutes ?? -1) - (a.minutes ?? -1))
    .map(({ name, minutes }) => (minutes === null ? name : `${name} (${minutes} min)`));
}

/**
 * What a CI run actually PROVES about the commit being promoted.
 *
 * The three acceptance conditions are mechanical - head SHA, conclusion, the `CI gate` job - and
 * two further things decide whether a green run is evidence at all:
 *
 * 1. WHICH SHARDS RAN. The affected map ignores `scripts/` and `docs/`, so a change confined to
 *    them plans `mode: none` and every E2E shard is SKIPPED. That run is green and proves the
 *    build; it proves nothing about behaviour. It happened twice on 2026-08-21, and each time the
 *    reasoning ("the previous commit ran the full suite and the delta is inert") lived only in
 *    prose. This function only REPORTS the skip; whether it is acceptable is decided by
 *    `classifyEmptyPlan` below, which settles that same reasoning mechanically.
 * 2. WHETHER THE RUN WAS DAMAGED. A job killed while queued, or one whose only failed step is
 *    `Set up job`, is a runner failure and not a verdict on the code (docs/VERIFICATION.md, and
 *    the 2026-08-06 Actions incident). A damaged run must never read as a clean red OR a clean
 *    green.
 */
export function classifyCiRun(run, verifiedSha) {
  const jobs = run.jobs ?? [];
  const blocking = [];
  const warnings = [];

  if (run.headSha !== verifiedSha) {
    blocking.push(`run is for ${String(run.headSha).slice(0, 8)}, not the commit being promoted (${verifiedSha.slice(0, 8)})`);
  }
  if (run.conclusion !== 'success') blocking.push(`run concluded "${run.conclusion}"`);

  const gate = jobs.find((j) => j.name === 'CI gate');
  if (!gate) blocking.push('no "CI gate" job - that job requires every other, so its absence is not a pass');
  else if (gate.conclusion !== 'success') blocking.push(`"CI gate" concluded "${gate.conclusion}"`);

  const shards = jobs.filter((j) => /^E2E \d+\/\d+ /.test(j.name ?? ''));
  const ranShards = shards.filter((j) => j.conclusion === 'success');
  const skippedShardMatrix = jobs.some(
    (j) => j.conclusion === 'skipped' && /^E2E .*(matrix\.shardIndex|\d+\/\d+)/.test(j.name ?? ''),
  );
  if (ranShards.length === 0) {
    warnings.push(
      skippedShardMatrix || shards.length === 0
        ? 'E2E shards were SKIPPED (mode: none) - this run proves the build, NOT behaviour. Whether that is acceptable is `classifyEmptyPlan`, not this line.'
        : 'no E2E shard reported success',
    );
  }

  const damaged = jobs.filter((j) => {
    if (j.conclusion === 'success' || j.conclusion === 'skipped') return false;
    const steps = j.steps ?? [];
    // No steps at all: the job was killed while queued and never executed a line of this repo.
    if (steps.length === 0) return true;
    // Otherwise it is damaged only if something DID fail and the only thing that failed was
    // runner acquisition. `every` on an empty list is vacuously true, so the emptiness check
    // above must stay separate - without the length guard here, a job with no failed steps at
    // all would be excused as damaged.
    const failedSteps = steps.filter((s) => s.conclusion === 'failure');
    return failedSteps.length > 0 && failedSteps.every((s) => s.name === 'Set up job');
  });
  if (damaged.length > 0) {
    warnings.push(
      `${damaged.length} job(s) look DAMAGED rather than failing (${damaged.map((j) => j.name).join(', ')}) - ` +
        'a runner that never started is not a verdict; re-run before concluding anything',
    );
  }

  const mode = /\((\w+)\)\s*$/.exec(shards[0]?.name ?? '')?.[1] ?? (ranShards.length ? 'unknown' : 'none');
  return { ok: blocking.length === 0, blocking, warnings, shardsRan: ranShards.length, mode };
}

/**
 * WHETHER A RUN THAT SKIPPED EVERY SHARD IS STILL EVIDENCE - settled by computation, not prose.
 *
 * `mode: none` has two causes, and until 2026-08-22 the preflight treated them alike (it warned,
 * and the operator wrote the reasoning by hand):
 *
 *   LEGITIMATE - the delta really is confined to paths the affected map ignores, so there was no
 *   behaviour for a spec to observe and skipping was correct. Forcing a 70-minute full run on a
 *   docs-only branch buys nothing.
 *
 *   BLIND - the delta does touch behaviour, but the run planned from the wrong base. An ordinary
 *   push plans from the PREVIOUS push, so a second push made while a run is in flight cancels it
 *   and plans only itself; the changes the cancelled run covered are then gated by nothing. That
 *   is a green tick over unverified `src/`, and it is the last route by which one can reach main.
 *
 * The planner is in this checkout, so the two are told apart by running it: `planFor` is the same
 * tested code CI plans with, and its `mode` for a file list is the answer to "should shards have
 * run for this". Two questions, asked in cost order:
 *
 *   1. Does the WHOLE BRANCH, diffed against `main`, plan `none`? Then nothing behavioural is
 *      being promoted at all and the skip is right on its own terms - no citation needed.
 *   2. Otherwise, is there an EARLIER green run on this branch that did run shards, at a commit
 *      contained in the one being promoted, whose delta up to it plans `none`? That is exactly
 *      the "the nearest run covered it and the delta since is inert" argument, with both halves
 *      checked: the ancestry (so it cannot be a neighbouring commit off this history) and the
 *      inertness (so "inert" is measured rather than asserted).
 *
 * Anything else blocks. `citation` is null when no such run was found.
 *
 * @param {{branchChanged: string[], citation: null|{runId: string, sha: string, mode: string,
 *   shardsRan: number, ancestor: boolean, changed: string[]}}} facts
 */
export function classifyEmptyPlan({ branchChanged, citation, alreadyOnMain = false }) {
  // An empty diff is not an argument. A commit already contained in `origin/main` diffs to
  // nothing against it, so without this line the check would read PASS - "no behavioural files"
  // - for a commit that has no files at all. True, and evidence of nothing.
  if (alreadyOnMain) {
    return { ok: true, detail: 'this commit is already contained in origin/main - there is nothing here to promote, so nothing for a shard to prove' };
  }
  if (planFor(branchChanged).mode === 'none') {
    return {
      ok: true,
      detail: `nothing behavioural is being promoted - all ${branchChanged.length} changed file(s) vs main are ignored by the affected map, so the plan is honestly empty`,
    };
  }
  if (!citation) {
    return {
      ok: false,
      detail: 'the branch changes behaviour and NO earlier green run on it ran a shard - nothing has gated this tree. Force one: gh workflow run ci.yml --ref <branch>',
    };
  }
  if (!citation.ancestor) {
    return {
      ok: false,
      detail: `the nearest shard-running run (${citation.runId}, ${citation.sha.slice(0, 8)}) is NOT an ancestor of this commit, so it verified a different history`,
    };
  }
  const since = planFor(citation.changed);
  if (since.mode !== 'none') {
    return {
      ok: false,
      detail: `run ${citation.runId} (${citation.sha.slice(0, 8)}, ${citation.shardsRan} shard(s)) is the nearest evidence, but ${citation.changed.length} file(s) changed since it and they plan mode ${since.mode} - that behaviour was never gated`,
    };
  }
  return {
    ok: true,
    detail: `carried by run ${citation.runId} on ${citation.sha.slice(0, 8)} (${citation.shardsRan} shard(s), mode ${citation.mode}); the ${citation.changed.length} file(s) changed since it plan mode none`,
  };
}

const results = [];
function check(label, ok, detail = '', { fatal = true } = {}) {
  results.push({ label, ok, detail, fatal });
  const mark = ok ? 'PASS' : fatal ? 'FAIL' : 'WARN';
  console.log(`  [${mark}] ${label}${detail ? ` - ${detail}` : ''}`);
  return ok;
}
function info(label, detail) {
  console.log(`  [ .. ] ${label}${detail ? ` - ${detail}` : ''}`);
}

/** A sha as this repository stores it. Unresolvable input is handed back untouched, so a typo
 *  still fails on its own terms rather than being turned into something else's commit. */
function expandSha(value) {
  if (!value) return value;
  try {
    return git(['rev-parse', '--verify', `${value}^{commit}`], { stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return value;
  }
}

function parseArgs(argv) {
  const args = { phase: 1, fetch: true, order: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--branch') args.branch = argv[++i];
    else if (a === '--phase') args.phase = Number(argv[++i]);
    // EXPANDED, because everything downstream compares SHAs as strings and `gh run list
    // --commit` matches only the full 40 characters. An abbreviated sha typed off a `git log`
    // line would otherwise report "no CI run exists for this commit" - a FAIL that is not true,
    // and the exact shape of mistake this script exists to stop.
    else if (a === '--verified-sha') args.verifiedSha = expandSha(argv[++i]);
    else if (a === '--integrated-main-sha') args.integratedMainSha = expandSha(argv[++i]);
    else if (a === '--no-fetch') args.fetch = false;
    else if (a === '--skip-order') args.order = false;
  }
  return args;
}

function locate(branch) {
  const worktrees = parseWorktrees(git(['worktree', 'list', '--porcelain']));
  const mainWorktree = worktrees.find((w) => w.branch === 'refs/heads/main') ?? null;
  const onBranch = worktrees.filter((w) => w.branch === `refs/heads/${branch}`);
  return { worktrees, mainWorktree, onBranch };
}

function cleanliness(mainWorktree, sourceWorktree) {
  if (mainWorktree) {
    const dirty = git(['status', '--porcelain'], { cwd: mainWorktree.path });
    check('main worktree is clean', dirty === '', dirty === '' ? mainWorktree.path : dirty.split('\n').length + ' dirty path(s)');
  }
  if (sourceWorktree) {
    const dirty = git(['status', '--porcelain'], { cwd: sourceWorktree.path });
    check('source worktree is clean', dirty === '', dirty === '' ? sourceWorktree.path : dirty.split('\n').length + ' dirty path(s)');
  }
}

function phase1(args) {
  const { branch } = args;
  console.log(`safe-merge preflight - PHASE 1 (assess) for ${branch}\n`);

  const nameProblem = validateBranchName(branch);
  if (!check('branch name is a plain local branch', nameProblem === null, nameProblem ?? branch)) return 1;
  if (!check('refs/heads/<branch> exists', gitOk(['show-ref', '--verify', `refs/heads/${branch}`]))) return 1;

  const { mainWorktree, onBranch } = locate(branch);
  check('main is checked out somewhere', Boolean(mainWorktree), mainWorktree?.path ?? 'nowhere - see the workflow\'s "main is not checked out anywhere"');
  if (onBranch.length > 1) {
    check('branch resolves to at most one worktree', false, `${onBranch.length} worktrees hold it`);
    return 1;
  }
  if (onBranch.length === 0) {
    info('branch has no worktree', 'normal here - the workflow creates a TEMPORARY one');
  } else {
    info('source worktree', onBranch[0].path);
  }
  cleanliness(mainWorktree, onBranch[0] ?? null);

  if (args.fetch) git(['fetch', 'origin', '--prune']);
  const [ahead, behind] = git(['rev-list', '--left-right', '--count', 'main...origin/main'])
    .split(/\s+/)
    .map(Number);
  const sync = classifyMainSync(ahead, behind);
  check(
    `local main vs origin/main is safe to promote from (${sync.state})`,
    sync.ok,
    sync.state === 'ahead' || sync.state === 'diverged'
      ? `${ahead} local-only commit(s) would also be published - STOP and confirm with the user`
      : `${ahead} ahead / ${behind} behind`,
  );

  const incoming = git(['log', '--oneline', `main..${branch}`]).split('\n').filter(Boolean);
  const missing = git(['rev-list', '--count', `${branch}..main`]);
  info('commits coming in', String(incoming.length));
  info('commits the branch is missing from main', `${missing} (Phase 2 merges main in)`);

  const base = git(['merge-base', 'main', branch]);
  info('fork point', base.slice(0, 8));
  const oursSide = new Set(git(['diff', '--name-only', base, branch]).split('\n').filter(Boolean));
  const theirsSide = git(['diff', '--name-only', base, 'main']).split('\n').filter(Boolean);
  const overlap = theirsSide.filter((f) => oursSide.has(f));
  check(
    'files changed on both sides',
    true,
    overlap.length === 0 ? 'none' : `${overlap.length}: ${overlap.slice(0, 5).join(', ')}`,
    { fatal: false },
  );
  const preview = previewConflicts(branch);
  check('merge preview is conflict-free', preview.clean, preview.detail);

  if (args.order) {
    const verdict = mergeOrderVerdict(() => execFileSync('node', ['scripts/merge-order.mjs', '--branch', branch], {
      cwd: ROOT,
      encoding: 'utf8',
    }));
    check(`merge-order verdict is not "hold" (${verdict})`, verdict !== 'hold', verdict === 'hold' ? 'STOP and get an explicit go-ahead' : '', {
      fatal: verdict === 'hold',
    });
  }
  reportOwnedReceipts(branch);
  reportMigrationDrift();
  return 0;
}

/**
 * Does this branch say what happened to the owner receipt it owns? FATAL, and narrow enough to be
 * fair: it fires only on a receipt whose own `branch:` names this branch and which this branch's
 * diff leaves untouched. Nothing is guessed from a branch name.
 *
 * A receipt is closed by DELETING its file in the change that lands the work (docs/backlog/
 * README.md, "Landed is not a state"). That is a rule only the branch's own session can follow, and
 * on 2026-09-05 six served receipts were still sitting on the shelf, because by the time anyone
 * counts, the session that knew has ended. Landing is the last moment it is still there.
 *
 * The fix is one line in one file, so a refusal here costs a minute; a receipt that never advances
 * costs every wave plan after it a piece of judgement re-deriving what the shelf should have known.
 */
function reportOwnedReceipts(branch) {
  let verdict;
  try {
    const changed = changedBacklogFiles(branch, ROOT);
    if (changed === null) return;
    verdict = servesVerdict({ branch, receipts: receiptsFor(changed, ROOT), changed });
  } catch {
    info('owner receipts', 'could not be read - skipped');
    return;
  }
  // Only the receipts this branch OWNS are worth a line. A branch may edit the shelf for a dozen
  // other reasons, and a check that reads them all back is a check nobody reads.
  const owned = verdict.served.filter((entry) => !entry.unclaimed);
  const others = verdict.served.length - owned.length;
  const detail = [
    owned.length === 0 ? 'this branch owns none' : owned.map((entry) => `${entry.action} ${entry.slug}`).join(', '),
    others > 0 ? `${others} other backlog file(s) changed` : '',
  ].filter(Boolean).join('; ');
  check('owner receipts this branch owns are answered', verdict.problems.length === 0, verdict.problems[0] ?? detail);
}

/**
 * Do the hosted projects hold every migration the repository has? ADVISORY - it never blocks a
 * landing. PRODUCTION, and `noacg-staging` beside it.
 *
 * Landing is the moment this is worth knowing: a migration reaches `main` and then nothing applies
 * it, because `supabase db push` is a deliberate human act. 0051_client_table_grants.sql sat
 * unapplied on production for hours on 2026-08-25, past a green CI run and a green nightly, and was
 * found only by someone running `supabase migration list` for an unrelated reason. Staging was
 * outside every mechanism until 2026-09-02, when the teams migrations sat unapplied there for a
 * day and the twice-weekly hosted suite went red on a missing table - an alarm that reads like a
 * hosted-only latency regression rather than like a database nobody pushed to.
 *
 * Non-fatal on purpose, and quiet when it cannot tell: the answer needs the account-wide Supabase
 * token from .env, so a machine without one (or without a network) gets a note rather than a
 * refusal. Blocking a merge on an unrelated credential is how a check earns itself a `--skip` flag.
 */
function reportMigrationDrift() {
  let result;
  try {
    result = JSON.parse(execFileSync('node', ['scripts/migration-drift.mjs', '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }));
  } catch {
    info('hosted migration drift', 'not checked (the drift script did not run)');
    return;
  }
  const { staging, ...production } = result;
  // The landing runner applies both, so a drift line here is what a person sees when the runner
  // could not - a refused statement, no token on this machine, an offline laptop.
  const one = (label, project, fix) => {
    if (!project) return;
    if (project.status === 'drift') {
      check(`${label} holds every migration in the repository`, false,
        `MISSING on ${label}: ${project.missing.join(', ')} - apply with \`${fix}\`, which needs no permission (it refuses anything that can remove something and reports instead)`,
        { fatal: false });
    } else if (project.status === 'ok') {
      info(`${label} migration drift`, `none - all ${project.local} applied`);
    } else {
      info(`${label} migration drift`, `not checked (${project.detail})`);
    }
  };
  one('production', production, 'npm run db:push');
  one('staging', staging, `npm run db:push -- --ref ${staging?.ref ?? ''}`.trim());
}

/** Phase 3 - is there a CI run that actually verifies VERIFIED_SHA, and what does it prove? */
function phase3(args) {
  const { branch, verifiedSha } = args;
  console.log(`safe-merge preflight - PHASE 3 (what CI proves) for ${branch}\n`);
  if (!check('--verified-sha given', Boolean(verifiedSha))) return 1;

  let run;
  try {
    // --workflow matters: a commit also carries deploy-verify runs, and `gh run list` returns
    // the NEWEST of any workflow. Judging one of those would ask a deployment check for a
    // verdict it never had - it has no `CI gate` job and runs no shards. WHICH ci.yml run to
    // judge is then `selectCiRun`'s call: creation order ties between a push run and a
    // dispatched run break on databaseId, and a cancelled shell never outranks a real verdict.
    const candidates = JSON.parse(
      execFileSync(
        'gh',
        ['run', 'list', '--workflow', 'ci.yml', '--branch', branch, '--commit', verifiedSha,
          '--limit', '10', '--json', 'databaseId,status,conclusion'],
        { cwd: ROOT, encoding: 'utf8' },
      ),
    );
    const picked = selectCiRun(candidates);
    // `none` with a run is the all-cancelled case: judge the newest shell so the refusal names
    // what happened ("run concluded cancelled") rather than claiming no run exists.
    const id = picked.run?.databaseId ? String(picked.run.databaseId) : '';
    if (!id) {
      check(`a CI run exists for ${verifiedSha.slice(0, 8)}`, false, 'none - push the branch, or use the local fallback (Route B)');
      return 1;
    }
    run = JSON.parse(
      execFileSync('gh', ['run', 'view', id, '--json', 'headSha,conclusion,status,jobs'], {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
      }),
    );
    info('run', `${id} (${run.status})`);
  } catch (error) {
    check('could read the CI run from gh', false, error.message.split('\n')[0]);
    return 1;
  }

  const verdict = classifyCiRun(run, verifiedSha);
  check('CI run verifies exactly this commit, green, gate included', verdict.ok, verdict.blocking.join('; '));
  if (verdict.shardsRan > 0) {
    check(`E2E shards ran (${verdict.shardsRan} shard(s), mode ${verdict.mode})`, true);
  } else {
    // The run itself proves only the build. Whether that is enough is a computed question, so
    // ask it here rather than handing the operator a warning to argue with.
    info('E2E shards', `0 ran (mode ${verdict.mode}) - this run proves the build, NOT behaviour`);
    const empty = classifyEmptyPlan(gatherEmptyPlanFacts(branch, verifiedSha));
    check('the skipped shards are accounted for', empty.ok, empty.detail);
  }
  for (const warning of verdict.warnings.filter((w) => !/mode: none|no E2E shard/.test(w))) {
    check('run is a verdict, not damaged', false, warning, { fatal: false });
  }
  return 0;
}

/**
 * The facts `classifyEmptyPlan` needs, read from git and `gh`.
 *
 * The branch diff comes first and costs nothing, so a docs-only branch - the common legitimate
 * case - never reaches the network at all. Only when behaviour IS being promoted does this go
 * looking for the earlier run that covered it, newest first and no further than the last handful:
 * evidence older than that is not the "nearest run" argument any more.
 */
function gatherEmptyPlanFacts(branch, verifiedSha) {
  const alreadyOnMain = gitOk(['merge-base', '--is-ancestor', verifiedSha, 'origin/main']);
  const base = git(['merge-base', 'origin/main', verifiedSha]);
  const branchChanged = git(['diff', '--name-only', base, verifiedSha]).split('\n').filter(Boolean);
  if (alreadyOnMain || planFor(branchChanged).mode === 'none') return { branchChanged, citation: null, alreadyOnMain };

  let candidates;
  try {
    candidates = JSON.parse(
      execFileSync(
        'gh',
        ['run', 'list', '--workflow', 'ci.yml', '--branch', branch, '--limit', '15',
          '--json', 'databaseId,headSha,conclusion'],
        { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
      ),
    ).filter((r) => r.conclusion === 'success' && r.headSha !== verifiedSha);
  } catch {
    return { branchChanged, citation: null, alreadyOnMain };
  }

  let stray = null;
  for (const candidate of candidates.slice(0, 5)) {
    let earlier;
    try {
      earlier = JSON.parse(
        execFileSync('gh', ['run', 'view', String(candidate.databaseId), '--json', 'headSha,conclusion,jobs'], {
          cwd: ROOT,
          encoding: 'utf8',
          maxBuffer: 32 * 1024 * 1024,
        }),
      );
    } catch {
      continue;
    }
    const earlierVerdict = classifyCiRun(earlier, earlier.headSha);
    if (!earlierVerdict.ok || earlierVerdict.shardsRan === 0) continue;
    // A run can name a commit this checkout has never fetched (a force-pushed or pruned tip).
    // Without the object there is no delta to measure, so it is not evidence here.
    if (!gitOk(['cat-file', '-e', `${earlier.headSha}^{commit}`])) continue;
    const found = {
      runId: String(candidate.databaseId),
      sha: earlier.headSha,
      mode: earlierVerdict.mode,
      shardsRan: earlierVerdict.shardsRan,
      ancestor: gitOk(['merge-base', '--is-ancestor', earlier.headSha, verifiedSha]),
      changed: git(['diff', '--name-only', earlier.headSha, verifiedSha]).split('\n').filter(Boolean),
    };
    // A run on this branch is not automatically ON this commit's history: pushing again while
    // reading a run leaves a DESCENDANT at the head of the list, and a force-push leaves runs
    // from a history that no longer exists. Taking the newest and stopping would block on one of
    // those while the ancestor that really does carry the tree sits one entry further down. Keep
    // the first stray as the fallback, so a branch with nothing but strays still gets told which
    // run it is being refused over rather than a blank "none found".
    if (found.ancestor) return { branchChanged, alreadyOnMain, citation: found };
    stray ??= found;
  }
  return { branchChanged, citation: stray ?? null, alreadyOnMain };
}

function phase4(args) {
  const { branch, verifiedSha, integratedMainSha } = args;
  console.log(`safe-merge preflight - PHASE 4 (re-check before promoting) for ${branch}\n`);
  if (!check('--verified-sha given', Boolean(verifiedSha))) return 1;
  if (!check('--integrated-main-sha given', Boolean(integratedMainSha))) return 1;

  if (args.fetch) git(['fetch', 'origin', '--prune']);
  const { mainWorktree, onBranch } = locate(branch);
  cleanliness(mainWorktree, onBranch[0] ?? null);

  const branchSha = git(['rev-parse', branch]);
  const mainSha = git(['rev-parse', 'main']);
  const originMainSha = git(['rev-parse', 'origin/main']);
  check('branch still points at VERIFIED_SHA', branchSha === verifiedSha, `${branchSha.slice(0, 8)} vs ${verifiedSha.slice(0, 8)}`);
  check('local main still matches origin/main', mainSha === originMainSha, `${mainSha.slice(0, 8)} vs ${originMainSha.slice(0, 8)}`);
  check(
    'main has not moved since it was integrated',
    originMainSha === integratedMainSha,
    `${originMainSha.slice(0, 8)} vs ${integratedMainSha.slice(0, 8)}`,
  );
  check('the merge is still a fast-forward', gitOk(['merge-base', '--is-ancestor', 'main', branch]));
  return 0;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.branch) {
    console.error('usage: node scripts/safe-merge-preflight.mjs --branch <branch> [--phase 1|3|4] ' +
      '[--verified-sha <sha>] [--integrated-main-sha <sha>] [--no-fetch] [--skip-order]');
    return 2;
  }
  const phases = { 1: phase1, 3: phase3, 4: phase4 };
  const early = (phases[args.phase] ?? phase1)(args);
  const failed = results.filter((r) => !r.ok && r.fatal);
  console.log(
    `\n${failed.length === 0 ? 'PREFLIGHT OK' : 'PREFLIGHT BLOCKED'} - ` +
      `${results.filter((r) => r.ok).length} passed, ${failed.length} blocking.`,
  );
  if (failed.length > 0) {
    console.log('Do NOT continue the merge until each blocking line above is resolved.');
    return 1;
  }
  return early;
}

const isEntrypoint =
  Boolean(process.argv[1]) &&
  process.argv[1].replaceAll('\\', '/').toLowerCase().endsWith('safe-merge-preflight.mjs');
if (isEntrypoint) process.exit(main());
