#!/usr/bin/env node
// THE WATCH LOOP'S ONE COMMAND - the whole observation leg of an orchestrator tick, and only
// observation (docs/ORCHESTRATION_NEXT.md §3; .agent-workflows/orchestrator/night.md "The watch loop").
//
//   node scripts/wave-tick.mjs             # fetch, look at everything, print what CHANGED
//   node scripts/wave-tick.mjs --no-fetch  # same, without touching the network
//
// Before this existed a tick was several commands the orchestrator ran and parsed itself - fetch,
// per-branch ancestor checks, `npm run jobs`, `blocked-sessions` - most of whose output restated
// what the previous tick already said. This script keeps the previous tick's snapshot in
// `<git-common-dir>/noacg-jobs/wave-tick-state.json` (beside the job store, same lifetime rules)
// and prints only the DELTA: what landed, what was queued, what gave up and why, who started or
// stopped waiting, and any branch that looks finished but was never queued. A tick where nothing
// changed prints one line. The judgement about what to DO with an event never lives here - this
// script launches nothing, kills nothing, merges nothing, and messages nobody.
//
// EVENTS ARE DURABLE, NOT JUST PRINTED. Every event line is also appended to
// `<git-common-dir>/noacg-jobs/wave-tick-events.log` with its timestamp, because stdout goes to a
// session whose context can be compacted or interrupted - and the state file has already recorded
// the event as "seen", so no later tick will repeat it. Without the log, an event caught between
// the script exiting and the model reading would be announced exactly zero times; the morning
// report reads the log instead of hoping the loop's context survived the night.
//
// THE FINISHED-BUT-UNQUEUED CHECK is the mechanism for the most repeated 2026-08-30 failure:
// three sessions finished their work, armed a background watcher, and ENDED - each leaving a
// green branch committed and never queued. An in-session Stop hook was considered and rejected
// (it fires at every turn end, so it would warn on every mid-work pause, and a crashed session
// never fires it at all); from out here the state is unambiguous to observe and cheap to
// re-check. "Finished-looking" is deliberately modest: ahead of main, clean tree, no commit for
// QUIET_MINUTES, not queued, not landed. Whether it is actually done is the orchestrator's
// judgement - this only makes the shape visible while somebody can still act on it.

import { spawnSync } from 'node:child_process';
import { existsSync, appendFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureJobsDir, findRunner, jobsDir, pending, readJobs, readLandings, landingStateFor } from './jobs-store.mjs';
import { syncLandings } from './landings.mjs';
import { nodeProcesses } from './e2e-runs.mjs';
import { git, worktreeEntries } from './worktree-cleanup-lib.mjs';
import { wavePlansDir } from './wave-plan-store.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');

// v2 added `ahead` to each stored branch - the positive "this branch had a commit of its own"
// receipt the LANDED event now requires. A v1 file is discarded rather than migrated (`main` warns
// and starts fresh), which costs one tick of silence and cannot resurrect the phantom below.
export const STATE_VERSION = 2;

/** No commit for this long, on a clean unqueued branch ahead of main, is worth a delta line. */
export const QUIET_MINUTES = 30;

// ── Pure decisions ───────────────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const args = { fetch: true, json: false, quietMinutes: QUIET_MINUTES, statePath: null, wavePlan: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = () => argv[index += 1];
    if (token === '--no-fetch') args.fetch = false;
    else if (token === '--json') args.json = true;
    else if (token === '--quiet-minutes') args.quietMinutes = Number(next());
    else if (token === '--state') args.statePath = next();
    else if (token === '--wave-plan') args.wavePlan = next();
    else if (token === '--help' || token === '-h') args.help = true;
    else throw new Error(`unknown argument: ${token}`);
  }
  if (!Number.isFinite(args.quietMinutes) || args.quietMinutes <= 0) {
    throw new Error('--quiet-minutes must be a positive number');
  }
  return args;
}

/**
 * A branch "looks finished and was never queued" - the ended-expecting-a-watcher shape. Modest by
 * design: this cannot know the build was green or the session's intent, only that work stopped
 * arriving and nothing was handed to the queue. `clean` may be null (not measured, or the status
 * command failed) and null never classifies - a claim this check cannot back stays unmade.
 */
/**
 * Is there nothing in the queue for this branch's CURRENT work?
 *
 * `not-queued` is the obvious half. `landed` is the other one, and it only means this alongside
 * the caller's own `!branch.landed`: together they say the newest merge job SUCCEEDED and yet the
 * branch is still not on main, so commits arrived after that landing and nobody has queued them.
 * Before 2026-09-01 such a branch read as `gave-up` and got a (wrongly worded) event; once
 * success stopped being reported as failure it would have gone silent in BOTH directions - no
 * LANDING GAVE UP, correctly, and no FINISHED-LOOKING either.
 *
 * Exported and shared because the two places that ask this question must agree: the `git status`
 * gate in the tick decides whether `clean` is ever MEASURED, and a gate stricter than the
 * classifier below leaves `clean` null, which silently makes the classifier unable to fire.
 */
/**
 * Does this branch carry a commit of its own that `origin/main` does not have?
 *
 * THE SET AND THE SHA ARE TWO DIFFERENT ANSWERS, AND THE SECOND IS THE ONE THAT COUNTS.
 * `listedAsMerged` comes from one `git branch --merged` read covering every branch at once, which
 * is what keeps the tick to a handful of git calls - but that read happens at ONE MOMENT, and a
 * branch created after it is missing from the set for a reason that has nothing to do with its
 * commits. So wherever the set says a branch is not contained, ask git about that exact sha
 * instead. The probe runs only for the few the set already calls ahead (four of 53 branches on the
 * night this was written), so the batched read still does the work.
 *
 * `inMain` erring reads as NOT contained, matching `landingStateFor`: the set already said ahead,
 * and an unreadable second opinion should not overturn a readable first one.
 */
export function aheadOfMain({ sha, listedAsMerged }, inMain) {
  if (listedAsMerged) return false;
  return !inMain(sha);
}

export function nothingQueuedFor(landingState) {
  return landingState === 'not-queued' || landingState === 'landed';
}

export function looksFinishedUnqueued(branch, { now, quietMinutes = QUIET_MINUTES } = {}) {
  return Boolean(
    !branch.landed
    // A BRANCH WITH NO COMMITS OF ITS OWN HAS NO FINISHED WORK ON IT. A row's worktree branch is
    // cut at main's tip, so `lastCommitMs` is MAIN's last commit - already hours old the moment the
    // row starts - and every other leg here (clean tree, nothing queued) is true of an empty branch
    // too. Without this leg a row that had been running for two minutes could be announced as a
    // session that ended without queueing. See `ahead` below for how it is measured.
    && branch.ahead === true
    && branch.worktree
    && branch.worktree.clean === true
    && nothingQueuedFor(branch.landingState)
    && Number.isFinite(branch.lastCommitMs)
    && now - branch.lastCommitMs >= quietMinutes * 60_000,
  );
}

/**
 * The delta between two snapshots, as printable events. Every event names its branch or session,
 * because the reader is deciding what to do next, not admiring a dashboard.
 *
 * `current.landedUnknown` means the merged-into-main question could not be answered this tick
 * (origin/main missing or the git call failing). Every event that RESTS on that answer is
 * suppressed rather than guessed: a false FINISHED-LOOKING on an already-landed branch would send
 * the orchestrator re-queueing landed work, which is worse than one quiet tick.
 */
export function deltaBetween(previous, current, { quietMinutes = QUIET_MINUTES } = {}) {
  const events = [];
  const prevBranches = previous?.branches ?? {};
  const prevBlocked = new Set(previous?.blocked ?? []);
  const prevUnqueued = new Set(previous?.finishedUnqueued ?? []);
  const currentNames = new Set(current.branches.map((branch) => branch.name));

  for (const branch of current.branches) {
    const before = prevBranches[branch.name];
    if (!current.landedUnknown) {
      // A LANDING IS A BRANCH THAT ONCE HAD A COMMIT OF ITS OWN AND IS NOW IN MAIN - both halves,
      // measured, not one inferred from the other. `!before.landed` is the transition key
      // night.md describes, and `before.ahead === true` is the receipt that the transition was
      // real: the previous tick asked git directly whether that exact sha was an ancestor of
      // origin/main and got NO. The two can disagree, and their disagreement is the whole bug.
      //
      // MEASURED 2026-09-09T20:19:58Z, ticks 345 and 346. `claude/ac-harness-verdict` had just
      // been created at main's tip and had committed nothing. Tick 345 read the merged-branch SET
      // first and built the branch inventory about a second later - the branch was born inside
      // that window, so it was in the inventory and not in the set, and read as ahead of main.
      // Tick 346 found it in both and called it LANDED. It landed for real an hour later at tick
      // 368, so the night loop was told the same branch landed twice, and the first time it had
      // no commits at all. night.md fires a planned follow-on when its trigger branch lands and
      // counts the row's slot free, so a phantom launches a follow-on against work that does not
      // exist. The related trap - incidents.md "the empty branch that read as landed" - is why
      // the transition key exists; this is the case the key alone does not cover, because the
      // previous tick's "ahead" reading was itself wrong.
      if (branch.landed && before && !before.landed && before.ahead === true) events.push(`LANDED ${branch.name}`);
      // NEW BRANCH gets the same requirement, for the same reason: it fired on that same phantom.
      // Keyed on the ahead TRANSITION rather than on first sighting, so a row's empty branch is
      // announced when it makes its first commit instead of when the harness mints it - later,
      // but true. A branch that lands and then grows fresh commits says so in its own words.
      if (branch.ahead && !before?.ahead) {
        events.push(before
          ? `AHEAD OF MAIN ${branch.name} - commits of its own that origin/main does not have`
          : `NEW BRANCH ahead of main: ${branch.name}`);
      }
    }
    if (before && before.landingState !== branch.landingState) {
      if (branch.landingState === 'queued') events.push(`QUEUED ${branch.name}`);
      // NOT FOR A BRANCH MAIN ALREADY CONTAINS, whatever the job store thinks. `landingStateFor`
      // is given the same containment check now and answers `landed` for these, so this arm is
      // the invariant rather than the fix: one tick may not say LANDED and LANDING GAVE UP about
      // the same branch, which is what it did for `claude/f-contracts-point` on 2026-09-04 -
      // handing the reader a re-queue command for work already on main. The check is here, where
      // the events are emitted, so no future disagreement between the two halves can print both.
      if (branch.landingState === 'gave-up' && !branch.landed) {
        events.push(`LANDING GAVE UP ${branch.name} - ${branch.landingReason ?? 'no reason recorded'}`
          + (branch.requeue ? ` (re-queue: ${branch.requeue})` : ''));
      }
      if (branch.landingState === 'withdrawn') events.push(`LANDING WITHDRAWN ${branch.name} - a person cancelled it`);
      // `landed` deliberately emits NOTHING. The `merge-base --is-ancestor` check above is the
      // authoritative answer to "did this branch land", it fires exactly once on the transition,
      // and it does not depend on the job store at all - so a second success event here would be
      // the same news twice, against night.md's promise that an event is announced once. Until
      // 2026-09-01 this transition fell into the `gave-up` arm and announced a landing as a
      // refusal WITH a re-queue command; silence is the correct amount of noise, not an oversight.
    }
  }
  // A branch that vanished between ticks still gets its story told: the queue landing it and
  // cleanup deleting it in the same gap is the NORMAL night rhythm, and dropping the LANDED
  // event there loses the one signal follow-ons key on.
  for (const [name, before] of Object.entries(prevBranches)) {
    if (currentNames.has(name)) continue;
    if (current.landedBranchNames?.includes(name) || before.landed) {
      // Same requirement as the live path above: a landing job for a branch the loop never saw
      // carrying a commit of its own is not news it should act on.
      if (!before.landed && before.ahead === true) events.push(`LANDED ${name} (branch already cleaned up)`);
    } else {
      events.push(`BRANCH GONE ${name} - deleted since last tick with no landing recorded for it`);
    }
  }
  for (const session of current.blocked) {
    if (!prevBlocked.has(session.key)) events.push(`WAITING ${session.key} - ${session.detail}`);
  }
  for (const key of prevBlocked) {
    if (!current.blocked.some((session) => session.key === key)) events.push(`NO LONGER WAITING ${key}`);
  }
  // A DEAD RUNNER IS A DEFECT, NOT A QUIET NIGHT, and from outside it looks exactly like a slow
  // landing: jobs sit, nothing moves, no line says anything is wrong. On 2026-09-04 the runner
  // could not start at all (a temporal-dead-zone throw in `jobs.mjs`, swallowed by
  // `stdio: 'ignore'`) and j-0550 sat in `starting` across reads four minutes apart while the only
  // signal was an inline note in a listing nobody was reading. The tick is the thing that IS read,
  // so the tick says it - once on the way in, once on the way out, like every other event here.
  if (current.queueStalled && !previous?.queueStalled) {
    events.push(`QUEUE STALLED - ${current.queueStalled} job(s) queued and no runner is draining them. `
      + 'Nothing will run until one is live: node scripts/jobs.mjs --runner');
  }
  if (!current.queueStalled && previous?.queueStalled) events.push('QUEUE MOVING AGAIN - a runner is live');
  if (!current.landedUnknown) {
    for (const branch of current.branches) {
      if (looksFinishedUnqueued(branch, { now: current.at, quietMinutes }) && !prevUnqueued.has(branch.name)) {
        // The line says what it did NOT measure, because on 2026-09-08 it fired three times and
        // was wrong three times: each row was reading its CI run before queueing, which from here
        // is indistinguishable from a session that ended. Whether that leg gets measured is filed
        // in docs/backlog/finished-looking-needs-a-ci-leg.md; until then the reader confirms.
        events.push(`FINISHED-LOOKING AND UNQUEUED ${branch.name} - clean tree, no commit for `
          + `${Math.floor((current.at - branch.lastCommitMs) / 60_000)} min, nothing queued. Not checked: a CI run `
          + 'on its tip, or a live session - a row reading its CI before it queues looks exactly like this, so '
          + 'confirm with night.md\'s three-signal test first. If its session ended believing a watcher would '
          + 'queue it, nothing will.');
      }
    }
  }
  return events;
}

/** What the next tick compares against. Only what the delta needs - never a second job store. */
export function nextState(current, { tick, quietMinutes = QUIET_MINUTES }) {
  const branches = {};
  for (const branch of current.branches) {
    branches[branch.name] = {
      sha: branch.sha,
      landed: branch.landed,
      // Recorded as its own fact rather than left to be re-derived from `landed`: the next tick's
      // LANDED event rests on it, and the two are measured differently on purpose.
      ahead: branch.ahead === true,
      landingState: branch.landingState,
    };
  }
  return {
    v: STATE_VERSION,
    tick,
    at: new Date(current.at).toISOString(),
    branches,
    blocked: current.blocked.map((session) => session.key),
    queueStalled: current.queueStalled ?? 0,
    finishedUnqueued: current.landedUnknown ? (current.finishedUnqueuedCarried ?? []) : current.branches
      .filter((branch) => looksFinishedUnqueued(branch, { now: current.at, quietMinutes }))
      .map((branch) => branch.name),
  };
}

export function summaryLine(current) {
  const ahead = current.branches.filter((branch) => branch.ahead);
  const running = current.jobs.filter((job) => job.state === 'running').length;
  const waiting = current.jobs.filter((job) => job.state === 'waiting').length;
  return `${ahead.length} branch(es) ahead of main, ${running} job(s) running, ${waiting} waiting, `
    + `${current.blocked.length} session(s) waiting on a call`;
}

export function heartbeatLine({ tick, at, summary, events = 0 }) {
  return `- tick ${tick} at ${new Date(at).toISOString()}: ${events} event(s); ${summary}`;
}

/** A wave plan more than a wave-window old is a LEFTOVER awaiting the next orchestrator, not the
 *  live wave - heartbeats appended to it pollute a record someone will read as that night's. The
 *  age comes from the DATE IN THE NAME (the orchestrator writes `<date>-wave-plan.local.md`),
 *  never the mtime, which anything touching the file resets - including this script's own
 *  heartbeat appends. The date is parsed as LOCAL midnight, because the orchestrator names the
 *  file by the machine's local date; a UTC parse loses hours of the window on either side. */
export const WAVE_PLAN_MAX_AGE_MS = 24 * 3_600_000;

export function wavePlanFresh(name, now, { maxAgeMs = WAVE_PLAN_MAX_AGE_MS } = {}) {
  const dated = /^(\d{4}-\d{2}-\d{2})/.exec(name);
  if (!dated) return false;
  const day = Date.parse(`${dated[1]}T00:00:00`); // no offset = LOCAL time, matching the filename
  // The stamp is the wave's START, and a wave runs into the next day - so the window is measured
  // from the end of the named day, giving a plan written at 23:00 its whole night.
  return Number.isFinite(day) && now - (day + 24 * 3_600_000) <= maxAgeMs;
}

// ── The side-effecting shell ─────────────────────────────────────────────────────────────────────

/**
 * Every branch this repo should be watching, in ONE for-each-ref: local heads plus origin's
 * remote refs, because a closed session's branch can exist only on origin (its worktree and
 * local ref cleaned up) and `jobs.mjs` learned the hard way that a remote-only ref can sit
 * unmentioned for weeks. The committer date rides along so no per-branch `git log` is needed -
 * measured at 2.7 s for 69 branches the spawn-per-branch way, 63 ms this way.
 */
function branchInventory() {
  const refs = git(
    ['for-each-ref', 'refs/heads', 'refs/remotes/origin', '--format=%(refname) %(refname:short) %(objectname) %(committerdate:unix)'],
    REPO_ROOT,
  );
  if (!refs.ok) return [];
  const byName = new Map();
  for (const line of refs.stdout.split('\n').filter(Boolean)) {
    const [full, ref, sha, committed] = line.split(' ');
    // `refs/remotes/origin/HEAD` is the remote's default-branch POINTER, not a branch, and its
    // short name is the bare remote name `origin` - which does not start with `origin/`, so it
    // used to enter the inventory as a local branch called "origin" sitting at main's tip. It was
    // in the state file for months, counted in every "N branch(es) ahead of main" summary, and
    // with the containment probe below it would cost a git spawn every tick to re-learn that it is
    // main. The full refname is the only thing that tells the two apart, so the format carries it.
    if (full === 'refs/remotes/origin/HEAD') continue;
    const remote = ref.startsWith('origin/');
    const name = remote ? ref.slice('origin/'.length) : ref;
    if (name === 'main' || name === 'HEAD') continue;
    // A local ref wins over the remote one of the same name: it is the one a worktree can hold.
    if (remote && byName.has(name)) continue;
    byName.set(name, { name, sha, lastCommitMs: Number(committed) * 1000, remoteOnly: remote });
  }
  return [...byName.values()];
}

/** Branch names merged into origin/main - local and remote - or `null` when git cannot answer. */
function mergedBranchNames() {
  const local = git(['branch', '--merged', 'origin/main', '--format=%(refname:short)'], REPO_ROOT);
  const remote = git(['branch', '-r', '--merged', 'origin/main', '--format=%(refname:short)'], REPO_ROOT);
  if (!local.ok || !remote.ok) return null;
  const names = new Set(local.stdout.split('\n').filter(Boolean));
  for (const ref of remote.stdout.split('\n').filter(Boolean)) {
    if (ref.startsWith('origin/')) names.add(ref.slice('origin/'.length));
  }
  return names;
}

/**
 * Is this commit already in `origin/main`? The receipt that outranks a job record.
 *
 * `origin/main` and not local `main`, so that both halves of one tick answer from the same ref.
 * On 2026-09-04 they did not: `branch.landed` read git and said LANDED `claude/f-contracts-point`,
 * while `landingState` read a job record that had been reaped after its landing pushed and said
 * LANDING GAVE UP for the same branch in the same tick - with a re-queue command for a branch
 * already in main. A tick that contradicts itself is worse than a quiet one.
 */
function containedInMain(sha) {
  return git(['merge-base', '--is-ancestor', sha, 'origin/main'], REPO_ROOT).ok;
}

function blockedSessions() {
  const run = spawnSync(process.execPath, [path.join(HERE, 'blocked-sessions.mjs'), '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (run.status !== 0) {
    const detail = String(run.stderr ?? '').trim().split('\n')[0] || `exit ${run.status}`;
    return { ok: false, detail, sessions: [] };
  }
  try {
    const rows = JSON.parse(run.stdout);
    if (!Array.isArray(rows)) return { ok: false, detail: 'output was not a JSON array', sessions: [] };
    return {
      ok: true,
      // The transcript file IS the session (docs/AGENT_WORKFLOWS.md - sessionId does not identify
      // one), so it is the stable key a delta can compare across ticks.
      // A LEFTOVER IS NOT A WAIT. `blocked-sessions.mjs` lists every row that qualified - it never
      // drops one - and marks `wrote: 'moved-on'` where the transcript grew after the call, which
      // means the session moved past it and nobody has to answer anything. The tick is an ALARM, so
      // it announces only the real ones: on 2026-09-04 a finished session was announced as blocked
      // for 61 minutes, and a false alarm repeated every tick is how a reader learns to skim the
      // one that matters. Rows from an older build carry no `wrote` at all and are announced as
      // before, which is the safe direction.
      sessions: rows.filter((row) => row.wrote !== 'moved-on').map((row) => ({
        key: row.transcript ?? row.cwd ?? 'unknown-session',
        // The third signal rides along in the delta line, because it changes what the reader does
        // next: a wait behind a live process may still finish or may want an answer, and a wait
        // behind no live process is a row that is not coming back. `blocked-sessions.mjs` fills
        // it in and degrades to `unknown` wherever the harness inventory does not answer.
        detail: `${row.agentId ? `agent ${row.agentId}` : (row.branch || row.cwd || 'a session')} waiting `
          + `${row.waitedMinutes ?? '?'} min on ${row.tool ?? 'a call'}`
          + (row.livenessDetail ? ` - ${row.livenessDetail}` : ''),
      })),
    };
  } catch {
    return { ok: false, detail: 'output was not parseable JSON', sessions: [] };
  }
}

/**
 * The newest fresh wave plan - shared with the handoff drain, the plan check and the session-start
 * hook, so this one function decides where a plan lives for all of them.
 *
 * It reads the STORE and nothing else (`wave-plan-store.mjs`). It used to read the calling
 * checkout's `docs/handoffs/`, which meant the plan's location was "whichever worktree the
 * orchestrator happened to be in" - and a plan in a throwaway worktree dies with it, which is how
 * a week of routing and every decision taken on the owner's behalf went missing (2026-09-08).
 * There is deliberately NO fallback to the old location: a fallback would find a plan written into
 * a worktree, let the wave launch on it, and lose it exactly as before. Reading the old location
 * is the archive's job, and only `orchestrator-week.mjs` still does it.
 *
 * `root` is kept in the signature because four callers pass one, and ignored because the store is
 * the same directory seen from every worktree of this repository.
 */
export function newestWavePlan(now, root = REPO_ROOT) {
  void root;
  const dir = wavePlansDir();
  if (!dir || !existsSync(dir)) return null;
  const candidates = readdirSync(dir)
    .filter((name) => name.includes('wave-plan') && name.endsWith('.local.md') && wavePlanFresh(name, now))
    .sort()
    .reverse();
  return candidates.length ? path.join(dir, candidates[0]) : null;
}

/** Append below a final newline - a plan file whose last line lacks one must not have the
 *  heartbeat glued onto its last row. */
function appendOwnLine(file, line) {
  const text = readFileSync(file, 'utf8');
  appendFileSync(file, `${text.endsWith('\n') || text === '' ? '' : '\n'}${line}\n`, 'utf8');
}

export function main(argv = process.argv.slice(2), { now = Date.now() } = {}) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`wave-tick: ${error.message}\n`);
    return 2;
  }
  if (args.help) {
    process.stdout.write('Usage: node scripts/wave-tick.mjs [--no-fetch] [--json] [--quiet-minutes <n>] [--state <path>] [--wave-plan <path|none>]\n');
    return 0;
  }

  const dir = jobsDir();
  if (!dir) {
    process.stderr.write('wave-tick: not inside a git repository - there is nothing to observe here.\n');
    return 2;
  }
  ensureJobsDir(dir);

  const warnings = [];
  if (args.fetch) {
    const fetch = git(['fetch', 'origin', '--quiet'], REPO_ROOT);
    if (!fetch.ok) warnings.push(`git fetch failed (${fetch.stderr.split('\n')[0] || 'no detail'}) - reading local state only.`);
  }

  // The previous snapshot is read BEFORE the scan, not after, because a tick that cannot measure
  // containment carries the last known answer forward instead of writing "not landed, not ahead"
  // over every branch - which would make the next healthy tick re-announce every landing it had
  // already announced, and would silence a branch that genuinely lands right after the outage.
  const statePath = args.statePath ?? path.join(dir, 'wave-tick-state.json');
  let previous = null;
  if (existsSync(statePath)) {
    try {
      const parsed = JSON.parse(readFileSync(statePath, 'utf8'));
      if (parsed.v === STATE_VERSION) previous = parsed;
      else warnings.push(`state file is v${parsed.v}, this build writes v${STATE_VERSION} - starting fresh, so every event below may be a repeat.`);
    } catch {
      warnings.push('state file was unreadable - starting fresh, so every event below may be a repeat.');
    }
  }
  const known = previous?.branches ?? {};

  const merged = mergedBranchNames();
  const landedUnknown = merged === null;
  if (landedUnknown) {
    warnings.push('cannot list branches merged into origin/main (is origin/main missing?) - landed/new/finished '
      + 'events are suppressed this tick rather than guessed.');
  }
  const worktrees = new Map(
    worktreeEntries(REPO_ROOT).filter((entry) => entry.branch).map((entry) => [entry.branch, entry]),
  );
  const jobs = readJobs(dir);
  syncLandings(dir); // the cloud lander writes nothing locally; pull what GitHub landed first
  const landings = readLandings(dir);
  // Queued work with nothing draining it. Reading the process table costs about three quarters of
  // a second and only when there is work, so a quiet queue pays nothing for the check.
  const stalledCount = pending(jobs).length;
  const queueStalled = stalledCount > 0 && findRunner(nodeProcesses()) === null ? stalledCount : 0;

  const branches = branchInventory().map((branch) => {
    const landing = landingStateFor(branch.name, jobs, { inMain: containedInMain });
    const listedAsMerged = merged ? merged.has(branch.name) : false;
    return {
      ...branch,
      landed: landedUnknown ? known[branch.name]?.landed === true : listedAsMerged,
      // `merged` was read before this inventory, so a branch born between the two reads is here
      // and not there - which on 2026-09-09 made an empty branch read as ahead of main and then
      // "land" four minutes later (see deltaBetween). aheadOfMain settles it against the sha.
      ahead: landedUnknown
        ? known[branch.name]?.ahead === true
        : aheadOfMain({ sha: branch.sha, listedAsMerged }, containedInMain),
      landingState: landing.state,
      landingReason: landing.reason,
      requeue: landing.requeue,
      worktree: worktrees.has(branch.name) ? { path: worktrees.get(branch.name).root, clean: null } : null,
    };
  });
  // The clean-tree check spawns a `git status` per worktree, so it runs only where the answer is
  // consumed: an unlanded, unqueued branch with a worktree whose last commit has gone quiet.
  for (const branch of branches) {
    const candidate = !landedUnknown && !branch.landed && nothingQueuedFor(branch.landingState)
      && branch.worktree && Number.isFinite(branch.lastCommitMs)
      && now - branch.lastCommitMs >= args.quietMinutes * 60_000;
    if (!candidate) continue;
    const status = git(['status', '--porcelain=v1'], branch.worktree.path);
    branch.worktree.clean = status.ok ? status.stdout === '' : null;
  }

  const blocked = blockedSessions();
  if (!blocked.ok) warnings.push(`blocked-sessions.mjs gave no readable answer (${blocked.detail}) - the waiting column is blind this tick.`);

  const current = {
    at: now,
    branches,
    jobs,
    blocked: blocked.sessions,
    landedUnknown,
    queueStalled,
    landedBranchNames: landings.map((landing) => landing.branch),
    // When landed cannot be measured, the previous finished-unqueued set is carried rather than
    // recomputed, so the warning does not re-fire for every known case once git recovers.
    finishedUnqueuedCarried: previous?.finishedUnqueued ?? [],
  };

  const tick = (previous?.tick ?? 0) + 1;
  const events = previous ? deltaBetween(previous, current, { quietMinutes: args.quietMinutes }) : [];
  const summary = summaryLine(current);

  writeFileSync(statePath, `${JSON.stringify(nextState(current, { tick, quietMinutes: args.quietMinutes }), null, 2)}\n`, 'utf8');
  // Durability first: the state file has just recorded these events as seen, so the log is the
  // only place they exist if nothing reads stdout (see the header).
  if (events.length) {
    const stamp = new Date(now).toISOString();
    appendFileSync(path.join(dir, 'wave-tick-events.log'), events.map((event) => `${stamp} tick ${tick} ${event}\n`).join(''), 'utf8');
  }

  const wavePlan = args.wavePlan === 'none' ? null : (args.wavePlan ?? newestWavePlan(now));
  if (wavePlan && existsSync(wavePlan)) {
    appendOwnLine(wavePlan, heartbeatLine({ tick, at: now, summary, events: events.length }));
  } else if (args.wavePlan !== 'none') {
    warnings.push(`no live wave plan in the store ${wavePlansDir() ?? '(no git checkout)'} (dated *wave-plan.local.md within a day) - `
      + 'heartbeat not recorded anywhere. Write the plan at the path `node scripts/wave-plan-store.mjs --path <date> <day|night>` '
      + 'prints, or pass --wave-plan <path>, or --wave-plan none to silence this.');
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify({ tick, at: new Date(now).toISOString(), firstTick: !previous, events, summary, warnings }, null, 2)}\n`);
    return 0;
  }
  const lines = [];
  if (!previous) {
    lines.push(`tick ${tick}: baseline written (no previous state to diff against). ${summary}.`);
  } else if (!events.length) {
    lines.push(`tick ${tick}: no change. ${summary}.`);
  } else {
    lines.push(`tick ${tick}: ${events.length} event(s). ${summary}.`);
    for (const event of events) lines.push(`  ${event}`);
  }
  for (const warning of warnings) lines.push(`  note: ${warning}`);
  process.stdout.write(`${lines.join('\n')}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
