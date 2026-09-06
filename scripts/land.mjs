#!/usr/bin/env node
// THE LANDER - the one writer of `main`, run by .github/workflows/land.yml on GitHub's runners.
//
//   node scripts/land.mjs --pr 123            # in the workflow; GH_TOKEN and GH_REPO are set
//   node scripts/land.mjs --pr 123 --dry-run  # anywhere: the decisions, no push, no dispatch
//
// WHY THIS EXISTS (docs/WORKFLOW_ARCHITECTURE.md §5.2). Until 2026-09-06 the only thing that could
// land a branch was `scripts/auto-merge.mjs` running on the owner's laptop: one runner per
// machine, dead when the lid closed, and a red main froze every landing for about 78 hours a
// month. The mechanical path it ran is ported here unchanged in substance - merge main into the
// branch, get a green `ci.yml` run on EXACTLY that commit, fast-forward main - and only the
// machine changes. Landing stays serialized (the workflow's `landing` concurrency group), stays
// fast-forward (history keeps the shape every metric script reads), and stays gated by the same
// run a push would have had.
//
// HOW A BRANCH GETS HERE. `npm run queue:merge` (scripts/jobs.mjs add-merge) pushes the branch,
// opens or reuses its pull request, posts the `/check` stamp as the `noacg/reviewed` commit
// status on the tip, and adds the `land` label. The label is the declaration; this script is
// what acts on it.
//
// TWO GITHUB FACTS THE SHAPE RESTS ON. A push made with the workflow's own token starts no
// workflow run, so the merge commit this script pushes gets its `ci.yml` run by DISPATCH, with
// `diff_base` set to the main sha it integrated - the same stand-in `auto-merge.mjs` used when the
// push webhook was late. And a ruleset (scripts/landing-ruleset.mjs) lets only this workflow and
// the repository admin push `main`, so a second lander cannot exist by accident.
//
// EVERY REFUSAL IS WRITTEN ON THE PULL REQUEST and the label is removed, so the session that
// queued the branch reads why in the one place it will look. Nothing here retries a verdict:
// a red run is a person's problem, a conflict is the session's, and only "CI never answered"
// is retried, by re-queueing (re-adding the label).

import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cancelledRunDidWork, selectCiRun } from './safe-merge-preflight.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LAND_LABEL = 'land';
export const REVIEWED_CONTEXT = 'noacg/reviewed';
/** How long to wait for a `ci.yml` verdict, and how often to ask. The landing cap was 45 min. */
const WAIT_TICKS = 135;
const TICK_MS = 20_000;
/** Ticks with no run at all before dispatching one (the push webhook can be late or absent). */
const DISPATCH_GRACE_TICKS = 3;
const ATTEMPTS = 3;

// --- pure decisions, tested in land.test.mjs ----------------------------------------------------

/** Why a pull request may not land yet, or null. */
export function planPreconditions(pr, { label = LAND_LABEL } = {}) {
  if (!pr) return 'the pull request could not be read';
  if (pr.state !== 'OPEN') return `the pull request is ${String(pr.state).toLowerCase()}, not open`;
  if (pr.isDraft) return 'the pull request is a draft';
  if (pr.baseRefName !== 'main') return `the pull request targets ${pr.baseRefName}, not main`;
  if (!(pr.labels ?? []).some((l) => l.name === label)) return `the pull request does not carry the \`${label}\` label`;
  return null;
}

/**
 * Is the tip reviewed? The `/check` stamp travels as a commit status; a landing that carries no
 * review is queued with `--unreviewed "<reason>"`, which posts the same context with the reason
 * in its description - visible, never silent - so the status is required either way.
 */
export function reviewedGap(statuses, sha) {
  const mine = (statuses ?? []).filter((s) => s.context === REVIEWED_CONTEXT);
  if (mine.length === 0) return `no \`${REVIEWED_CONTEXT}\` status on ${sha.slice(0, 8)} - queue with npm run queue:merge, which posts the /check stamp`;
  const latest = mine[0];
  if (latest.state !== 'success') return `the \`${REVIEWED_CONTEXT}\` status on ${sha.slice(0, 8)} is "${latest.state}": ${latest.description ?? ''}`;
  return null;
}

/** The verdict of a completed run, from its jobs: the `CI gate` job is the one that requires every other. */
export function judgeRun(run, jobs) {
  if (!run || run.status !== 'completed') return { ok: false, why: 'the run has not completed' };
  if (run.conclusion !== 'success') return { ok: false, why: `the run concluded "${run.conclusion}"` };
  const gate = (jobs ?? []).find((j) => j.name === 'CI gate');
  if (!gate) return { ok: false, why: 'the run has no "CI gate" job, so it gated nothing' };
  if (gate.conclusion !== 'success') return { ok: false, why: `"CI gate" concluded "${gate.conclusion}"` };
  return { ok: true, why: null };
}

// --- the OS half --------------------------------------------------------------------------------

function sh(cmd, args, { allowFailure = false, input } = {}) {
  const result = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', input, windowsHide: true });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`${cmd} ${args.join(' ')} failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  return result;
}

const git = (args, opts) => sh('git', args, opts);
const gh = (args, opts) => sh('gh', args, opts);
const ghJson = (args) => {
  const out = gh(args, { allowFailure: true });
  try {
    return JSON.parse(out.stdout);
  } catch {
    return null;
  }
};

function say(message) {
  console.log(`land: ${message}`);
}

function output(name, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function readPr(number) {
  return ghJson(['pr', 'view', String(number), '--json', 'number,state,isDraft,baseRefName,headRefName,headRefOid,labels,url']);
}

function statusesOn(sha) {
  const combined = ghJson(['api', `repos/{owner}/{repo}/commits/${sha}/status`]);
  return combined?.statuses ?? [];
}

function postReviewed(sha, description) {
  gh(['api', `repos/{owner}/{repo}/statuses/${sha}`, '-f', 'state=success', '-f', `context=${REVIEWED_CONTEXT}`, '-f', `description=${description.slice(0, 140)}`]);
}

function runsFor(branch, sha) {
  return ghJson(['run', 'list', '--workflow', 'ci.yml', '--branch', branch, '--commit', sha, '--limit', '20', '--json', 'databaseId,status,conclusion,event']) ?? [];
}

function jobsOf(id) {
  return ghJson(['run', 'view', String(id), '--json', 'jobs'])?.jobs ?? null;
}

function dispatchCi(branch, diffBase) {
  gh(['workflow', 'run', 'ci.yml', '--ref', branch, '--field', `diff_base=${diffBase}`]);
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Wait for a verdict on `sha`: { ok, why, runId }. */
async function waitForVerdict(branch, sha, diffBase, { dryRun }) {
  let dispatched = false;
  const classified = new Set();
  for (let tick = 0; tick < WAIT_TICKS; tick += 1) {
    const picked = selectCiRun(runsFor(branch, sha));
    if (picked.action === 'judge') {
      const verdict = judgeRun(picked.run, jobsOf(picked.run.databaseId));
      return { ...verdict, runId: picked.run.databaseId };
    }
    if (picked.action === 'watch') {
      if (tick % 6 === 0) say(`run ${picked.run.databaseId} is ${picked.run.status}...`);
    } else if (picked.run && !classified.has(picked.run.databaseId)) {
      classified.add(picked.run.databaseId);
      const jobs = jobsOf(picked.run.databaseId);
      if (jobs && cancelledRunDidWork({ jobs }) && !dispatched) {
        say(`run ${picked.run.databaseId} was cancelled by a job's own timeout - asking for a fresh run`);
        if (!dryRun) dispatchCi(branch, diffBase);
        dispatched = true;
      }
    } else if (!dispatched && tick >= DISPATCH_GRACE_TICKS) {
      say('no CI run for this commit - dispatching one');
      if (dryRun) return { ok: false, why: 'dry run: would dispatch ci.yml and wait', runId: null };
      dispatchCi(branch, diffBase);
      dispatched = true;
    }
    await sleep(TICK_MS);
  }
  return { ok: false, why: 'CI gave no verdict within the landing cap - re-queue to try again', runId: null };
}

function comment(number, body) {
  gh(['pr', 'comment', String(number), '--body', body]);
}

function refuse(pr, why, { dryRun }) {
  say(`REFUSED: ${why}`);
  if (!dryRun) {
    comment(pr.number, `**Landing refused**: ${why}\n\nFix it and re-add the \`${LAND_LABEL}\` label (\`npm run queue:merge\` does that), or land another way on purpose.`);
    gh(['pr', 'edit', String(pr.number), '--remove-label', LAND_LABEL], { allowFailure: true });
  }
  output('landed', '');
  return 1;
}

export async function main(argv = process.argv.slice(2)) {
  const number = argv[argv.indexOf('--pr') + 1];
  const dryRun = argv.includes('--dry-run');
  if (!number || argv.indexOf('--pr') === -1) {
    console.error('Usage: node scripts/land.mjs --pr <number> [--dry-run]');
    return 2;
  }
  const pr = readPr(number);
  const precondition = planPreconditions(pr);
  if (precondition) return refuse(pr ?? { number }, precondition, { dryRun });
  const branch = pr.headRefName;
  say(`${pr.url}: ${branch} at ${pr.headRefOid.slice(0, 8)}`);

  const gap = reviewedGap(statusesOn(pr.headRefOid), pr.headRefOid);
  if (gap) return refuse(pr, gap, { dryRun });

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    git(['fetch', '--no-tags', 'origin', `+refs/heads/main:refs/remotes/origin/main`, `+refs/heads/${branch}:refs/remotes/origin/${branch}`]);
    const mainSha = git(['rev-parse', 'origin/main']).stdout.trim();
    git(['checkout', '-q', '-B', 'landing', `origin/${branch}`]);
    const tip = git(['rev-parse', 'HEAD']).stdout.trim();
    say(`attempt ${attempt}: main is ${mainSha.slice(0, 8)}, branch tip is ${tip.slice(0, 8)}`);

    const merge = git(['merge', '--no-edit', 'origin/main'], { allowFailure: true });
    if (merge.status !== 0) {
      git(['merge', '--abort'], { allowFailure: true });
      return refuse(pr, `integrating main (${mainSha.slice(0, 8)}) conflicts - resolve it on the branch and queue again`, { dryRun });
    }
    const verified = git(['rev-parse', 'HEAD']).stdout.trim();
    if (verified !== tip) {
      say(`merged main in as ${verified.slice(0, 8)}`);
      if (dryRun) {
        say('dry run: would push the merge commit, carry the reviewed status and dispatch ci.yml');
        return 0;
      }
      git(['push', 'origin', `HEAD:refs/heads/${branch}`]);
      postReviewed(verified, `carried from ${tip.slice(0, 8)} across a clean merge of main ${mainSha.slice(0, 8)}`);
      dispatchCi(branch, mainSha);
    } else {
      say('the branch already contains main');
    }

    const verdict = await waitForVerdict(branch, verified, mainSha, { dryRun });
    if (!verdict.ok) {
      const link = verdict.runId ? ` (run ${verdict.runId})` : '';
      return refuse(pr, `${verdict.why}${link}`, { dryRun });
    }
    say(`CI is green on ${verified.slice(0, 8)} (run ${verdict.runId})`);

    git(['fetch', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main']);
    if (git(['rev-parse', 'origin/main']).stdout.trim() !== mainSha) {
      say('main moved while the gate ran - integrating again');
      continue;
    }
    if (dryRun) {
      say(`dry run: would fast-forward main to ${verified.slice(0, 8)}`);
      return 0;
    }
    const push = git(['push', 'origin', `HEAD:refs/heads/main`, `--force-with-lease=refs/heads/main:${mainSha}`], { allowFailure: true });
    if (push.status !== 0) {
      say('the push to main was refused (main moved between the check and the push) - integrating again');
      continue;
    }
    say(`landed ${branch} on main as ${verified.slice(0, 8)}`);
    comment(pr.number, `Landed on \`main\` as ${verified} (CI run ${verdict.runId}).`);
    gh(['pr', 'edit', String(pr.number), '--remove-label', LAND_LABEL], { allowFailure: true });
    output('landed', verified);
    return 0;
  }
  return refuse(pr, `main moved ${ATTEMPTS} times while this landing ran - queue again`, { dryRun });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await main());
}

