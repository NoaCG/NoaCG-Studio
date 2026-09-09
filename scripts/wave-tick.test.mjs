// The watch tick's guard: the DELTA is the product, so what is pinned here is which state
// transitions produce an event, which do not, and that the finished-but-unqueued classifier
// stays as modest as its comment claims. A tick that re-announces old news every time trains the
// orchestrator to skim, which is the failure the delta design exists to prevent - and a tick
// that GUESSES when git cannot answer sends the orchestrator re-queueing landed work, which is
// the failure the landedUnknown suppression exists to prevent.
import assert from 'node:assert/strict';
import test from 'node:test';

import { landingStateFor } from './jobs-store.mjs';
import {
  QUIET_MINUTES,
  nothingQueuedFor,
  STATE_VERSION,
  deltaBetween,
  heartbeatLine,
  looksFinishedUnqueued,
  nextState,
  parseArgs,
  summaryLine,
  wavePlanFresh,
} from './wave-tick.mjs';

const NOW = Date.parse('2026-09-01T22:00:00Z');
const MINUTE = 60_000;

const branch = (over = {}) => ({
  name: 'claude/a-thing',
  sha: 'abc123',
  landed: false,
  landingState: 'not-queued',
  landingReason: null,
  requeue: null,
  worktree: { path: 'C:/w', clean: true },
  lastCommitMs: NOW - 45 * MINUTE,
  ...over,
});

const snapshot = (over = {}) => ({
  at: NOW,
  branches: [],
  jobs: [],
  blocked: [],
  landedUnknown: false,
  landedBranchNames: [],
  finishedUnqueuedCarried: [],
  ...over,
});

const state = (snap, tick = 1) => nextState(snap, { tick, quietMinutes: QUIET_MINUTES });

// ── looksFinishedUnqueued: every leg of the conjunction matters ──────────────────────────────────

test('a clean, quiet, unqueued branch ahead of main looks finished', () => {
  assert.equal(looksFinishedUnqueued(branch(), { now: NOW }), true);
});

test('any single leg failing clears the classification', () => {
  assert.equal(looksFinishedUnqueued(branch({ landed: true }), { now: NOW }), false);
  assert.equal(looksFinishedUnqueued(branch({ worktree: null }), { now: NOW }), false);
  assert.equal(looksFinishedUnqueued(branch({ worktree: { path: 'C:/w', clean: false } }), { now: NOW }), false);
  assert.equal(looksFinishedUnqueued(branch({ landingState: 'queued' }), { now: NOW }), false);
  assert.equal(looksFinishedUnqueued(branch({ lastCommitMs: NOW - 5 * MINUTE }), { now: NOW }), false);
  assert.equal(looksFinishedUnqueued(branch({ lastCommitMs: null }), { now: NOW }), false);
});

test('an unmeasured or failed clean check never classifies - null is not true', () => {
  assert.equal(looksFinishedUnqueued(branch({ worktree: { path: 'C:/w', clean: null } }), { now: NOW }), false);
});

test('a branch whose landing gave up is NOT finished-unqueued - it has its own louder event', () => {
  assert.equal(looksFinishedUnqueued(branch({ landingState: 'gave-up' }), { now: NOW }), false);
});

// ── deltaBetween: transitions fire once, standing states stay silent ─────────────────────────────

test('a landing fires LANDED exactly once', () => {
  const before = state(snapshot({ branches: [branch()] }));
  const after = snapshot({ branches: [branch({ landed: true })] });
  const events = deltaBetween(before, after);
  assert.equal(events.filter((event) => event.startsWith('LANDED')).length, 1);
  assert.equal(deltaBetween(state(after, 2), after).filter((event) => event.startsWith('LANDED')).length, 0);
});

test('a branch deleted between ticks still gets its LANDED event when the queue landed it', () => {
  const before = state(snapshot({ branches: [branch()] }));
  const goneAndLanded = snapshot({ landedBranchNames: ['claude/a-thing'] });
  assert.match(deltaBetween(before, goneAndLanded).join('\n'), /LANDED claude\/a-thing \(branch already cleaned up\)/);
  const goneUnexplained = snapshot();
  assert.match(deltaBetween(before, goneUnexplained).join('\n'), /BRANCH GONE claude\/a-thing - deleted since last tick with no landing recorded/);
});

test('a branch present in both snapshots and still unqueued produces no NEW BRANCH event', () => {
  const quiet = branch({ lastCommitMs: NOW - 5 * MINUTE });
  assert.deepEqual(deltaBetween(state(snapshot({ branches: [quiet] })), snapshot({ branches: [quiet] })), []);
});

test('an unknown branch fires NEW BRANCH, and queueing fires QUEUED on the transition only', () => {
  const appeared = snapshot({ branches: [branch({ lastCommitMs: NOW - MINUTE })] });
  assert.match(deltaBetween(state(snapshot()), appeared).join('\n'), /NEW BRANCH ahead of main: claude\/a-thing/);

  const queued = snapshot({ branches: [branch({ landingState: 'queued', lastCommitMs: NOW - MINUTE })] });
  assert.match(deltaBetween(state(appeared, 2), queued).join('\n'), /QUEUED claude\/a-thing/);
  assert.deepEqual(deltaBetween(state(queued, 3), queued), []);
});

test('a landing that gave up is announced once, with the queue\'s own reason and re-queue command', () => {
  const before = state(snapshot({ branches: [branch({ landingState: 'queued', lastCommitMs: NOW - MINUTE })] }));
  const after = snapshot({
    branches: [branch({
      landingState: 'gave-up',
      landingReason: 'main itself is red - fix main first (gh run list --workflow ci.yml --branch main --limit 5)',
      requeue: 'node scripts/jobs.mjs add-merge claude/a-thing',
      lastCommitMs: NOW - MINUTE,
    })],
  });
  const failure = deltaBetween(before, after).find((event) => event.startsWith('LANDING GAVE UP'));
  assert.match(failure, /claude\/a-thing/);
  assert.match(failure, /main itself is red/);
  assert.match(failure, /add-merge claude\/a-thing/);
  assert.equal(deltaBetween(state(after, 2), after).some((event) => event.startsWith('LANDING GAVE UP')), false);
});

test('a queue with work and no runner is reported, once, and so is its recovery', () => {
  // A dead runner and a slow landing look identical from outside. On 2026-09-04 the runner could
  // not start at all and j-0550 sat in `starting` across reads four minutes apart, with the only
  // signal an inline note in a listing nobody was reading.
  const quiet = snapshot();
  const stalled = snapshot({ queueStalled: 3 });
  const events = deltaBetween(state(quiet), stalled);
  assert.equal(events.filter((e) => e.startsWith('QUEUE STALLED')).length, 1);
  assert.ok(events.find((e) => e.startsWith('QUEUE STALLED')).includes('3 job(s) queued and no runner'));

  // Once, not every tick: a repeated alarm is one the reader learns to skim past.
  assert.deepEqual(deltaBetween(state(stalled), stalled).filter((e) => e.startsWith('QUEUE STALLED')), []);
  // And the recovery is news too, so a reader who saw the alarm knows it is over.
  assert.deepEqual(deltaBetween(state(stalled), quiet), ['QUEUE MOVING AGAIN - a runner is live']);
});

test('a landing REAPED after it pushed produces LANDED and nothing else', () => {
  // Measured on 2026-09-04: one tick printed "LANDED claude/f-contracts-point" and, two lines
  // later, "LANDING GAVE UP claude/f-contracts-point - its process vanished ... (re-queue: ...)".
  // j-0533 had run the landing to completion and the runner reaped it without seeing the exit, so
  // the two halves of the tick read two different sources and disagreed - git said the branch was
  // in main, the job record said the landing failed, and the wrong one carried the instruction.
  //
  // Built through landingStateFor with the same containment check the tick now gives it, because
  // that is the seam the defect lived in.
  const reaped = [{
    id: 'j-0533', kind: 'merge', branch: 'claude/a-thing', state: 'failed', finishedAt: NOW,
    exitCode: null, reapedAsDead: true,
    command: 'node scripts/land-watch.mjs --pr 12 --branch claude/a-thing --expect-sha e5ace753',
  }];
  const landing = landingStateFor('claude/a-thing', reaped, { inMain: (sha) => sha === 'e5ace753' });
  assert.equal(landing.state, 'landed');
  const before = state(snapshot({ branches: [branch({ landingState: 'queued', lastCommitMs: NOW - MINUTE })] }));
  const after = snapshot({
    branches: [branch({
      landed: true,
      landingState: landing.state,
      landingReason: landing.reason,
      requeue: landing.requeue,
      lastCommitMs: NOW - MINUTE,
    })],
  });
  const events = deltaBetween(before, after);
  assert.deepEqual(events.filter((e) => e.startsWith('LANDED')), ['LANDED claude/a-thing']);
  assert.equal(events.some((event) => event.startsWith('LANDING GAVE UP')), false);
  assert.equal(events.some((event) => /re-queue/.test(event)), false);
});

test('one tick never says LANDED and LANDING GAVE UP about the same branch', () => {
  // The invariant, independent of who classified the landing. The fix above is in landingStateFor,
  // but the promise belongs where the events are emitted: a branch git says is in main may not be
  // handed a re-queue command, however a future disagreement between the two halves arises.
  const before = state(snapshot({ branches: [branch({ landingState: 'queued', lastCommitMs: NOW - MINUTE })] }));
  const after = snapshot({
    branches: [branch({
      landed: true,
      landingState: 'gave-up',
      landingReason: 'its process vanished - the runner died or the machine slept',
      requeue: 'node scripts/jobs.mjs requeue claude/a-thing',
      lastCommitMs: NOW - MINUTE,
    })],
  });
  const events = deltaBetween(before, after);
  assert.deepEqual(events, ['LANDED claude/a-thing']);
});

test('a successful landing produces LANDED and nothing else - never a fabricated LANDING GAVE UP', () => {
  // Measured on 2026-09-01: one tick printed "LANDED claude/orchestrator-skill-redesign-a416a6"
  // and, two lines later, "LANDING GAVE UP ... auto-merge refused it (exit 0) (re-queue: ...)" -
  // two contradictory claims about one branch, the wrong one carrying the instruction.
  //
  // The branch is built the way the tick itself builds it (wave-tick.mjs's inventory), from a
  // real finished merge job through landingStateFor, because the defect lived in that seam: the
  // delta could only print what the classification handed it. A hand-written landingState here
  // would pass whatever the classifier did.
  const jobs = [{ id: 'j-0126', kind: 'merge', branch: 'claude/a-thing', state: 'done', finishedAt: NOW, exitCode: 0 }];
  const landing = landingStateFor('claude/a-thing', jobs);
  const before = state(snapshot({ branches: [branch({ landingState: 'queued', lastCommitMs: NOW - MINUTE })] }));
  const after = snapshot({
    branches: [branch({
      landed: true,
      landingState: landing.state,
      landingReason: landing.reason,
      requeue: landing.requeue,
      lastCommitMs: NOW - MINUTE,
    })],
  });
  const events = deltaBetween(before, after);
  assert.equal(events.some((event) => event.startsWith('LANDING GAVE UP')), false);
  assert.equal(events.some((event) => /re-queue/.test(event)), false);
  // The ancestor check is the AUTHORITATIVE landing signal, so the queued -> landed transition
  // adds no event of its own: night.md promises an event is announced exactly once, and two
  // success events for one landing is the same news twice.
  assert.deepEqual(events, ['LANDED claude/a-thing']);
});

test('nothingQueuedFor answers for every landing state, and only the two that mean "nothing in flight"', () => {
  // Shared on purpose. The tick spends a `git status` per branch only on candidates, and that
  // gate used to spell this condition out separately - so a gate stricter than the classifier
  // left `clean` at null and made the classifier structurally unable to fire, with no test and
  // no output anywhere saying so. One predicate is what stops the two drifting apart again.
  assert.equal(nothingQueuedFor('not-queued'), true);
  assert.equal(nothingQueuedFor('landed'), true, 'a landing that succeeded queues nothing for commits made since');
  assert.equal(nothingQueuedFor('queued'), false);
  assert.equal(nothingQueuedFor('gave-up'), false, 'a dead landing has its own louder event');
  assert.equal(nothingQueuedFor('withdrawn'), false);
});

test('a landed branch is not finished-unqueued, but a landed branch that MOVED SINCE is', () => {
  // On main and its landing succeeded: nothing to say.
  assert.equal(looksFinishedUnqueued(branch({ landed: true, landingState: 'landed' }), { now: NOW }), false);
  // The landing succeeded and yet the branch is still ahead of main - commits arrived after it
  // landed and nothing is queued for them. This is the case that went silent in BOTH directions
  // once success stopped being reported as a failure, so it is pinned rather than left to follow
  // from the conjunction.
  assert.equal(looksFinishedUnqueued(branch({ landed: false, landingState: 'landed' }), { now: NOW }), true);
});

test('a withdrawn landing reads as a deliberate act, not as unfinished work', () => {
  const before = state(snapshot({ branches: [branch({ landingState: 'queued', lastCommitMs: NOW - MINUTE })] }));
  const after = snapshot({ branches: [branch({ landingState: 'withdrawn', lastCommitMs: NOW - MINUTE })] });
  assert.match(deltaBetween(before, after).join('\n'), /LANDING WITHDRAWN claude\/a-thing - a person cancelled it/);
});

test('waiting sessions are announced on arrival and on clearing, never in between', () => {
  const waiting = { key: 'C:/t/sess.jsonl', detail: 'agent a1 waiting 42 min on Bash' };
  const during = snapshot({ blocked: [waiting] });
  assert.match(deltaBetween(state(snapshot()), during).join('\n'), /WAITING .*42 min on Bash/);
  assert.deepEqual(deltaBetween(state(during, 2), during), []);
  assert.match(deltaBetween(state(during, 3), snapshot()).join('\n'), /NO LONGER WAITING/);
});

test('finished-but-unqueued fires once, says how long the branch has been quiet, and names the hazard', () => {
  const after = snapshot({ branches: [branch()] });
  const warning = deltaBetween(state(snapshot()), after).find((event) => event.startsWith('FINISHED-LOOKING'));
  assert.match(warning, /claude\/a-thing/);
  assert.match(warning, /45 min/);
  assert.match(warning, /nothing will/);
  // It says what it did not measure. Three alarms on 2026-09-08, all on rows reading their CI
  // before queueing, all wrong - a line that reads as a verdict is one a tired reader obeys.
  assert.match(warning, /Not checked: a CI run on its tip, or a live session/);
  assert.match(warning, /three signals/);
  assert.equal(deltaBetween(state(after, 2), after).some((event) => event.startsWith('FINISHED-LOOKING')), false);
});

test('when git cannot answer the merged question, nothing that rests on it is guessed', () => {
  const before = state(snapshot({ branches: [branch()] }));
  const blind = snapshot({ branches: [branch({ landed: false })], landedUnknown: true });
  const events = deltaBetween(before, blind);
  assert.equal(events.some((event) => /LANDED|NEW BRANCH|FINISHED-LOOKING/.test(event)), false);
  // And the carried set keeps the warning from re-firing for known cases once git recovers.
  const carried = nextState({ ...blind, finishedUnqueuedCarried: ['claude/a-thing'] }, { tick: 2, quietMinutes: QUIET_MINUTES });
  assert.deepEqual(carried.finishedUnqueued, ['claude/a-thing']);
  const recovered = snapshot({ branches: [branch()] });
  assert.equal(deltaBetween(carried, recovered).some((event) => event.startsWith('FINISHED-LOOKING')), false);
});

// ── State and formatting ─────────────────────────────────────────────────────────────────────────

test('nextState carries exactly what the delta needs, versioned, on one quietMinutes channel', () => {
  const snap = snapshot({ branches: [branch({ lastCommitMs: NOW - 100 * MINUTE })], blocked: [{ key: 'k', detail: 'd' }] });
  const wide = nextState(snap, { tick: 7, quietMinutes: 120 });
  assert.equal(wide.v, STATE_VERSION);
  assert.equal(wide.tick, 7);
  assert.deepEqual(wide.blocked, ['k']);
  // 100 quiet minutes is under the caller's 120-minute bar - the state must use the same bar the
  // delta used, or the warning re-fires forever.
  assert.deepEqual(wide.finishedUnqueued, []);
  assert.deepEqual(nextState(snap, { tick: 7, quietMinutes: 30 }).finishedUnqueued, ['claude/a-thing']);
});

test('the summary counts ahead-of-main branches, not landed ones', () => {
  const line = summaryLine(snapshot({
    branches: [branch(), branch({ name: 'claude/b', landed: true })],
    jobs: [{ state: 'running' }, { state: 'waiting' }, { state: 'done' }],
  }));
  assert.match(line, /1 branch\(es\) ahead of main/);
  assert.match(line, /1 job\(s\) running, 1 waiting/);
});

test('the heartbeat line is one line, timestamped, carrying the tick\'s event count', () => {
  const line = heartbeatLine({ tick: 3, at: NOW, summary: 'all quiet', events: 2 });
  assert.equal(line, '- tick 3 at 2026-09-01T22:00:00.000Z: 2 event(s); all quiet');
  assert.equal(line.includes('\n'), false);
});

test('parseArgs refuses what would silently misconfigure the tick', () => {
  assert.throws(() => parseArgs(['--quiet-minutes', '0']), /positive/);
  assert.throws(() => parseArgs(['--nope']), /unknown argument/);
  assert.equal(parseArgs(['--no-fetch']).fetch, false);
  assert.equal(parseArgs([]).quietMinutes, QUIET_MINUTES);
});

test('heartbeats go only to a wave plan whose NAMED date is current - never to a leftover', () => {
  // Local-midnight parses on both sides, so the expectation holds in every timezone.
  const now = Date.parse('2026-09-01T12:00:00');
  assert.equal(wavePlanFresh('2026-09-01-wave-plan.local.md', now), true);
  assert.equal(wavePlanFresh('2026-08-31-wave-plan.local.md', now), true);
  assert.equal(wavePlanFresh('2026-08-30-wave-plan.local.md', now), false);
  assert.equal(wavePlanFresh('wave-plan.local.md', now), false);
});
