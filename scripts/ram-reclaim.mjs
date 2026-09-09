// WHAT A STARVED RUNNER MAY RECLAIM, AND WHAT STAYS A PERSON'S CALL.
//
// The queue stops starting work below a free-RAM floor, which is right - two suites on a 16 GB
// laptop take it to 35 MB free rather than sharing it. What was missing is the other half: when
// nothing can start for a quarter of an hour, SOMETHING is holding the memory, and on this
// machine it is routinely nothing at all - a killed run's browser shells, a dev server whose CLI
// was taken away, the `cmd /c` shims above it. Those hold gigabytes and belong to nobody, and the
// queue used to wait for them as patiently as it waits for real work.
//
// THE RULE, AND IT IS THE WHOLE DESIGN: this kills only processes a NAMED detector has already
// proved orphaned, and it fails CLOSED - anything the classifier does not recognise is kept,
// including a process it merely suspects. Sessions are never closed and never asked to close
// themselves; what is left holding the RAM is NAMED and left alone, because "which of my windows
// should I shut" is a judgement about work in flight that no classifier can make.
//
// The detectors live in `e2e-runs.mjs` (`orphanProcesses`, `orphanedDevServers`,
// `orphanedCodexTrees`), which already answer "is this a leftover?" for `--kill-orphans` and only
// ever say yes on a proof: no Playwright CLI is running at all, a dev server's launch chain has
// no living owner, or - for a Codex delegation's process family - the launch RECORDED which pids
// it started and when, the delegation has since finished, and the machine still agrees each pid is
// that same process. This module is the decision layer over them: when to look, what may be
// killed, and what to say about the rest.

/**
 * How long the queue must be starved before it reclaims anything.
 *
 * Fifteen minutes, not one: a suite finishing frees several gigabytes at once, and the ordinary
 * case for a low reading is a job that is about to end. Waiting a quarter of an hour costs a
 * quarter of an hour and removes every reason to guess.
 */
export const RECLAIM_AFTER_MS = 15 * 60_000;

/**
 * The process kinds a starved runner may close, each one a leftover by construction.
 *
 * A closed vocabulary on purpose. Adding to it means writing a detector that proves the thing is
 * orphaned - not a pattern that matches something expensive-looking.
 */
export const RECLAIMABLE = Object.freeze({
  'playwright-worker': 'a Playwright worker with no CLI to belong to',
  'headless-browser-shell': 'a headless Chromium shell left behind by a killed run',
  'orphaned-dev-server-chain': 'a dev server (and its shims) whose launch chain has no living owner',
  'stale-conhost': 'a console host whose process is already gone',
  'orphaned-codex-delegation-tree':
    'a process we recorded launching for a Codex delegation that has since finished',
});

/**
 * May this candidate be closed?
 *
 * FAILS CLOSED, and that is the only interesting property. An unknown kind, a missing pid, a
 * candidate that still has a live owner - all keep. The cost of being wrong in the other
 * direction is somebody's running work, which no amount of free RAM is worth.
 */
export function classifyForReclaim(candidate) {
  if (!candidate || !Number.isInteger(candidate.pid) || candidate.pid <= 0) {
    return { action: 'keep', reason: 'no usable pid - nothing is killed on a guess' };
  }
  if (!Object.hasOwn(RECLAIMABLE, candidate.kind ?? '')) {
    return { action: 'keep', reason: `unrecognised kind (${candidate.kind ?? 'none'}) - the classifier fails closed` };
  }
  if (candidate.hasLiveOwner) {
    return { action: 'keep', reason: 'a live session owns it' };
  }
  return { action: 'kill', reason: RECLAIMABLE[candidate.kind] };
}

/**
 * What to do about a starved queue right now.
 *
 * `holders` is who is still using the machine - live runs and the sessions they belong to. They
 * are reported, never touched: closing a session is the one part of this that stays human.
 */
export function planReclaim({
  starvedSince = null,
  now = Date.now(),
  candidates = [],
  holders = [],
  after = RECLAIM_AFTER_MS,
} = {}) {
  if (!starvedSince || now - starvedSince < after) {
    return { action: 'wait', kill: [], keep: [], holders };
  }
  // NOTHING IS CLOSED WHILE BROWSER WORK IS LIVE ANYWHERE ON THIS MACHINE.
  //
  // The orphan detectors stand down when a Playwright CLI is running, which is the right check
  // for the human `--kill-orphans` command and NOT enough here: a catalog sweep drives Chromium
  // through the playwright LIBRARY, so it has no CLI, and its browser shells look exactly like a
  // killed run's. `holders` is the same `activeRuns` list that DOES see a sweep - so a plan that
  // named a holder and killed its processes in the same breath was one hand-run sweep away from
  // happening. When anything is live, this reports and closes nothing.
  const live = holders.length > 0;
  const decisions = candidates.map((candidate) => ({
    candidate,
    ...(live ? { action: 'keep', reason: 'live browser work is on this machine' } : classifyForReclaim(candidate)),
  }));
  return {
    action: 'reclaim',
    kill: decisions.filter((d) => d.action === 'kill'),
    keep: decisions.filter((d) => d.action === 'keep'),
    holders,
  };
}

/** The lines a reclaim prints - what was freed, and who is holding the rest. */
export function describeReclaim(plan) {
  const lines = [];
  if (plan.action !== 'reclaim') return lines;
  if (plan.kill.length === 0) {
    lines.push('  RAM-starved for 15 minutes and nothing here is safely reclaimable.');
  } else {
    lines.push(`  RAM-starved for 15 minutes - closing ${plan.kill.length} orphaned process(es):`);
    for (const { candidate, reason } of plan.kill) lines.push(`    pid ${candidate.pid}  ${reason}`);
  }
  for (const { candidate, reason } of plan.keep) {
    lines.push(`    kept pid ${candidate.pid} - ${reason}`);
  }
  if (plan.holders.length > 0) {
    lines.push('  The rest of the memory is held by live work, which is nobody\'s to close but its own session:');
    for (const holder of plan.holders) lines.push(`    ${holder}`);
  }
  return lines;
}
