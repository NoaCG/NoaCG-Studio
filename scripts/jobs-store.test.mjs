// The queue's arithmetic, pinned. Every failure mode here is one that reads as "nothing is
// happening" from outside, which is exactly the situation the queue exists to make legible -
// so a wrong answer is not just wrong, it is invisible.
//
// The clock and the free-RAM reading are INJECTED, so no test depends on wall time or on how
// much memory the machine running it happens to have.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  COST,
  FOREGROUND_WAIT_CAP_MS,
  JOB_RETENTION_MS,
  MAX_LANDING_RETRIES,
  NO_VERDICT_EXIT,
  POLICY,
  addJob,
  adoptOrphanedLandings,
  cancelVerdict,
  capacity,
  classifyRefusal,
  costOf,
  devServerPrecheck,
  ensureJobsDir,
  expiredJobIds,
  finishedSince,
  flagValue,
  giveUpReason,
  hasFlag,
  landingRow,
  landingStateFor,
  orderHoldDecision,
  pending,
  pruneJobs,
  readJobs,
  reapDead,
  refusalForWorktree,
  refusalGuidance,
  requeueDecision,
  retryLandingFor,
  schedule,
  timedOutRecord,
  waitVerdict,
  writeJob,
  readReviewStamp,
  stampGap,
} from './jobs-store.mjs';

const NIGHT = 3; // 03:00 local
const DAY = 14; // 14:00 local
const PLENTY = 12_000; // MB free

/**
 * A job in whatever state the case needs.
 *
 * The default command is a real e2e invocation, because that is the expensive case the budget
 * exists for. Naming it keeps these tests honest about WHICH cost they are exercising: a fixture
 * with no command falls to the unknown-command default and is charged one WALK (`COST.walk`, half
 * a suite), not one suite (`COST.browser`), so a case that means to exercise the suite cost has to
 * say a suite.
 */
function job(id, over = {}) {
  return {
    id,
    kind: 'gate',
    command: 'npm run test:e2e:affected',
    checkout: `/wt/${id}`,
    state: 'waiting',
    after: [],
    enqueuedAt: Number(id.slice(2)),
    pid: null,
    ...over,
  };
}

/**
 * The command every walk fixture runs: a script this repository DOES NOT HAVE, on purpose.
 *
 * What these cases pin is the default for a command `command-match.mjs` cannot recognise, so the
 * fixture has to stay unrecognisable. That is also the real shape of the case that made the rule:
 * j-0888 was queued from a branch whose script had not landed yet.
 *
 * IT USED TO NAME A REAL SCRIPT - `ograf-external-walk`, j-0888's command verbatim - and that is
 * how this file went red. On 2026-09-10 `main` landed that script and, in the same commit, added
 * it to `SWEEP_SCRIPTS`, which is the right call for it: two servers and two pages. The two
 * branches merged without one line of text conflict and four cases here started asserting a
 * battery's price against a walk's. A fixture that names a real script is asserting that script's
 * classification, and that belongs to whoever owns the script - not here.
 */
const WALK_COMMAND = 'node scripts/a-walk-this-repo-has-never-seen.mjs';

/** A single browser walk - one dev server and one page, the middle weight. */
function walk(id, over = {}) {
  return job(id, { command: `${WALK_COMMAND} --server C:/tmp/walk-${id}`, ...over });
}

/** A landing job - the cheap, network-bound kind that the weighting exists to let through. */
function merge(id, over = {}) {
  return job(id, { kind: 'merge', command: `node scripts/land-watch.mjs --pr 12 --branch b-${id}`, ...over });
}

function tempQueue() {
  return ensureJobsDir(mkdtempSync(join(tmpdir(), 'noacg-jobs-')));
}

test('the walk fixture is a command the classifier does not recognise - the premise every walk case rests on', () => {
  // Every case below that uses `walk()` is really asking what the queue does with a command it
  // has never seen. If the classifier ever learns this name, those cases quietly start pricing a
  // battery and read as a broken mechanism instead of a stale fixture - which is exactly what
  // happened on 2026-09-10 and cost this branch four landing attempts (j-0903 to j-0906, every
  // one of them a land-watch pinned to the same sha).
  //
  // It was hard to read because the two CI runs on the SAME commit disagreed: `push` was green and
  // `pull_request` was red. Nothing was flaky. `actions/checkout` takes the branch alone on a push
  // and the branch MERGED WITH THE BASE on a pull request, so only the second run had a classifier
  // that knew the name. The premise is asserted once, here, where its failure says what to do.
  assert.equal(
    costOf(walk('j-0001')),
    COST.walk,
    `${WALK_COMMAND} is now recognised by command-match.mjs. Rename the fixture to a script this `
      + 'repository still does not have. Do NOT re-price the mechanism: these cases are about the '
      + 'default for an UNKNOWN command, not about what any real script weighs.',
  );
});

test('capacity is one by day, two at night', () => {
  assert.equal(capacity({ hour: DAY, freeMemMb: PLENTY }), 1);
  assert.equal(capacity({ hour: NIGHT, freeMemMb: PLENTY }), 2);
  // The boundaries themselves, since an off-by-one here silently halves a night's throughput.
  assert.equal(capacity({ hour: POLICY.nightFrom, freeMemMb: PLENTY }), 2, '00:00 is night');
  assert.equal(capacity({ hour: POLICY.nightTo, freeMemMb: PLENTY }), 1, '07:00 is day again');
  assert.equal(capacity({ hour: POLICY.nightTo - 1, freeMemMb: PLENTY }), 2, '06:00 is still night');
});

test('the RAM floor is an admission check on a job, not a cut to the budget', () => {
  // Zeroing the budget also stopped the cheapest jobs, which is the opposite of what the floor
  // is for - so the budget is now purely the clock, and the floor is applied per job in
  // `schedule`, scaled by that job's cost.
  assert.equal(capacity({ hour: NIGHT }), 2);
  assert.equal(capacity({ hour: DAY }), 1);
});

test('work started outside the queue is subtracted from capacity', () => {
  // Another coding agent, or a hand-run suite. Invisible to us, visible to the process table.
  assert.equal(capacity({ hour: NIGHT, freeMemMb: PLENTY, outsideRuns: 1 }), 1);
  assert.equal(capacity({ hour: NIGHT, freeMemMb: PLENTY, outsideRuns: 2 }), 0);
  assert.equal(capacity({ hour: NIGHT, freeMemMb: PLENTY, outsideRuns: 5 }), 0, 'never negative');
  assert.equal(capacity({ hour: DAY, freeMemMb: PLENTY, outsideRuns: 1 }), 0);
});

test('by day one suite starts and the rest say why they are waiting', () => {
  const jobs = [job('j-0001'), job('j-0002'), job('j-0003')];
  const { start, waiting, slots } = schedule(jobs, { hour: DAY, freeMemMb: PLENTY });
  assert.deepEqual(start.map((j) => j.id), ['j-0001']);
  assert.equal(slots, 1);
  assert.deepEqual(waiting.map((w) => w.job.id), ['j-0002', 'j-0003']);
  assert.match(waiting[0].reason, /budget 1\/1 used/);
});

test('at night two start together', () => {
  const jobs = [job('j-0001'), job('j-0002'), job('j-0003')];
  const { start } = schedule(jobs, { hour: NIGHT, freeMemMb: PLENTY });
  assert.deepEqual(start.map((j) => j.id), ['j-0001', 'j-0002']);
});

test('a running suite occupies the whole day budget', () => {
  const jobs = [job('j-0001', { state: 'running', pid: 1 }), job('j-0002')];
  const { start, waiting } = schedule(jobs, { hour: DAY, freeMemMb: PLENTY });
  assert.deepEqual(start, []);
  assert.match(waiting[0].reason, /budget 1\/1 used/);
});

test('two merges never overlap, whatever the clock says', () => {
  // This is what makes "land one branch at a time" structural instead of remembered.
  const two = [merge('j-0001'), merge('j-0002')];
  const { start, waiting } = schedule(two, { hour: NIGHT, freeMemMb: PLENTY });
  assert.deepEqual(start.map((j) => j.id), ['j-0001']);
  assert.match(waiting[0].reason, /another landing is in flight/);

  const oneRunning = [merge('j-0001', { state: 'running', pid: 1 }), merge('j-0002')];
  assert.deepEqual(schedule(oneRunning, { hour: NIGHT, freeMemMb: PLENTY }).start, []);
});

test('a landing runs beside a suite in ANOTHER checkout, but never in its own', () => {
  // The overnight case: five branches to land is five jobs that are almost entirely idle in
  // `gh run watch`. Charging them a full slot each would queue them behind a suite for no reason.
  const elsewhere = [job('j-0001', { state: 'running', pid: 1, checkout: '/wt/a' }), merge('j-0002', { checkout: '/wt/b' })];
  assert.deepEqual(
    schedule(elsewhere, { hour: NIGHT, freeMemMb: PLENTY }).start.map((j) => j.id),
    ['j-0002'],
    'a landing in another worktree is harmless beside a suite',
  );

  // Same checkout is a different matter: the merge rewrites the tree the suite is reading.
  const sameTree = [job('j-0001', { state: 'running', pid: 1, checkout: '/wt/a' }), merge('j-0002', { checkout: '/wt/a' })];
  const { start, waiting } = schedule(sameTree, { hour: NIGHT, freeMemMb: PLENTY });
  assert.deepEqual(start, []);
  assert.match(waiting[0].reason, /using that checkout/);

  // And nothing else starts in a checkout a landing is already using.
  const mergeFirst = [merge('j-0001', { state: 'running', pid: 1, checkout: '/wt/a' }), job('j-0002', { checkout: '/wt/a' })];
  assert.deepEqual(schedule(mergeFirst, { hour: NIGHT, freeMemMb: PLENTY }).start, []);
});

test('a landing is not charged against the suite budget', () => {
  // One suite elsewhere used to consume the whole day budget and stall every landing behind it,
  // which is the opposite of what "merge latency is the bottleneck" asks for. A landing is a
  // couple of git commands and then ten minutes waiting on GitHub; its concurrency is governed
  // by rules that are stricter where it matters, not by the RAM budget.
  const busy = [job('j-0001', { state: 'running', pid: 1, checkout: '/wt/a' }), merge('j-0002', { checkout: '/wt/b' })];
  assert.deepEqual(schedule(busy, { hour: DAY, freeMemMb: PLENTY }).start.map((j) => j.id), ['j-0002']);

  // Even with the budget fully spent by work OUTSIDE the queue.
  const outside = [merge('j-0001', { checkout: '/wt/b' })];
  assert.deepEqual(
    schedule(outside, { hour: DAY, freeMemMb: PLENTY, outsideRuns: 2 }).start.map((j) => j.id),
    ['j-0001'],
  );

  // A non-merge job is still charged, so the exemption cannot be used as a general escape.
  const cheap = [job('j-0001', { state: 'running', pid: 1 }), job('j-0002', { command: 'npm run build' })];
  assert.deepEqual(schedule(cheap, { hour: DAY, freeMemMb: PLENTY }).start, []);
});

test('several landings fit inside one suite-equivalent', () => {
  // 0.15 each: the day budget of 1.0 holds six of them, and they still drain one at a time
  // because two merges never overlap.
  const many = [merge('j-0001'), merge('j-0002'), merge('j-0003')];
  const { start } = schedule(many, { hour: DAY, freeMemMb: PLENTY });
  assert.deepEqual(start.map((j) => j.id), ['j-0001'], 'serial by the merge rule, not by the budget');
  assert.ok(costOf(many[0]) * 3 < 1, 'three landings cost less than one suite');
});

test('cost is read from the command, and an unrecognised command is assumed to be ONE browser', () => {
  assert.equal(costOf({ command: 'npm run test:e2e:affected', kind: 'gate' }), COST.browser);
  assert.equal(costOf({ command: 'node scripts/l3-sweep.mjs scoreboard', kind: 'sweep' }), COST.browser);
  assert.equal(costOf({ command: 'npm run build', kind: 'gate' }), COST.other);
  assert.equal(costOf({ command: 'node --test scripts/x.test.mjs', kind: 'gate' }), COST.other);
  assert.equal(costOf({ command: 'node scripts/land-watch.mjs --pr 12 --branch x', kind: 'merge' }), COST.merge);
  // THE DEFAULT FOR AN UNKNOWN COMMAND. Suite-sized work is enumerated - the e2e suites and the
  // batteries in `SWEEP_SCRIPTS` - so a command neither list knows is not one of them, and its
  // worst case is a dev server and one browser page. It is not free either, so a night cannot
  // fill with eight of them.
  assert.equal(costOf({ command: 'some-tool-nobody-listed', kind: 'gate' }), COST.walk);
  assert.ok(COST.walk > 0 && COST.walk < COST.browser, 'a walk is neither free nor a whole suite');
  assert.equal(costOf({ command: 'npm run build', kind: 'gate', cost: 0.9 }), 0.9, 'an explicit cost wins');
});

test('a declared cost is written to the record and read back off it', () => {
  // The half this mechanism was missing until 2026-09-09: `costOf` read `job.cost` and nothing
  // ever wrote it, so a session that knew its job was small had no way to say so.
  const dir = tempQueue();
  const declared = addJob(dir, { command: walk('j-0001').command, checkout: '/wt/a', cost: 0.25, now: 1 });
  assert.equal(declared.cost, 0.25);
  const [onDisk] = readJobs(dir);
  assert.equal(onDisk.cost, 0.25, 'the number survives the trip through the file');
  assert.equal(costOf(onDisk), 0.25);

  // A job that declared nothing carries no `cost` key at all, so it keeps reading the default
  // and picks up a later change to it instead of freezing today's guess onto the record.
  const silent = addJob(dir, { command: walk('j-0002').command, checkout: '/wt/b', now: 2 });
  assert.ok(!('cost' in silent), 'nothing invented for a job that declared nothing');
  assert.equal(costOf(silent), COST.walk);

  // A retry or an adopted landing spreads the old record back through `addJob`, which is the
  // only path a declared cost has to survive on.
  const retry = addJob(dir, { ...declared, retryOf: declared.id, now: 3 });
  assert.equal(retry.cost, 0.25, 'a retry inherits what the original declared');
  rmSync(dir, { recursive: true, force: true });
});

test('a flag is read whether it was written with a space or an equals sign', () => {
  // The 2026-09-10 hole, and the reason this parsing is in the store rather than in the CLI: the
  // CLI read only `--cost 0.5`, so `--cost=0.5` matched nothing, no cost reached the record, and
  // the job queued at the classifier's guess while printing "queued". A dropped declaration is
  // precisely what the `--cost` refusals exist to prevent, so the spelling is pinned here.
  for (const written of [['--cost', '0.5'], ['--cost=0.5']]) {
    assert.equal(hasFlag(written, '--cost'), true, written.join(' '));
    assert.equal(flagValue(written, '--cost'), '0.5', written.join(' '));
  }

  // An absent flag is `undefined`; a flag written with nothing after the `=` is an empty string,
  // which the CLI refuses as a missing value rather than reading `Number('')` as zero.
  assert.equal(hasFlag(['--kind', 'sweep'], '--cost'), false);
  assert.equal(flagValue(['--kind', 'sweep'], '--cost'), undefined);
  assert.equal(hasFlag(['--cost='], '--cost'), true, 'written, so the refusal is about the value');
  assert.equal(flagValue(['--cost='], '--cost'), '');

  // A flag written LAST has nothing after it, which is how `--cost` came to be silently dropped
  // in the first place. It reads as absent-valued, and the CLI turns that into a refusal.
  assert.equal(flagValue(['add', 'cmd', '--cost'], '--cost'), undefined);
  // A name that merely PREFIXES another is not that other one.
  assert.equal(flagValue(['--cost-cap=3'], '--cost'), undefined);
  // A value that looks like a flag is still returned, so the caller can say so by name.
  assert.equal(flagValue(['--cost', '--kind'], '--cost'), '--kind');
  // An `=` inside the value survives, since a path or a query may carry one.
  assert.equal(flagValue(['--branch=feature/a=b'], '--branch'), 'feature/a=b');
});

test('a nonsense declared cost is refused where it is written, not trusted by every reader after', () => {
  // `costOf` trusts the record, and the listing, the budget and the scaled RAM floor all trust
  // `costOf`. A bad number written once is a job that never starts or starves the rest.
  const dir = tempQueue();
  const bad = (cost) => () => addJob(dir, { command: 'npm run build', checkout: '/wt/a', cost, now: 1 });
  assert.throws(bad(0), /suite-equivalents/);
  assert.throws(bad(-1), /suite-equivalents/);
  assert.throws(bad(Number.NaN), /suite-equivalents/);
  assert.throws(bad('0.5'), /suite-equivalents/, 'a string is not a cost');
  // Over a suite-equivalent is refused rather than accepted and silently unstartable: the day
  // budget is 1, so such a job would wait for ever with nothing saying why.
  assert.throws(bad(1.5), /suite-equivalents/);
  // And under a landing's cost is refused too, because the same number is the RAM admission
  // threshold: `--cost 0.01` would let a session waive that check on its own job.
  assert.throws(bad(0.01), /at least 0\.15/);
  assert.equal(addJob(dir, { command: 'npm run build', checkout: '/wt/a', cost: COST.merge, now: 1 }).cost, COST.merge);
  assert.equal(addJob(dir, { command: 'npm run build', checkout: '/wt/a', cost: 1, now: 1 }).cost, 1, 'a whole suite is allowed');
  rmSync(dir, { recursive: true, force: true });
});

test('a single browser walk starts on the RAM a suite is rightly refused', () => {
  // THE 2026-09-09 REGRESSION, both directions in one case. j-0888 was one OGraf renderer walk
  // and sat refused for about three hours - "only 2.0-3.2 GB RAM free, needs 4.0" - because an
  // unrecognised command was charged a whole suite and the floor scales with the cost. The fix
  // is per-job accounting, NOT a lower floor: at the same 3.2 GB a real suite must still wait.
  const short = { hour: NIGHT, freeMemMb: 3277 }; // 3.2 GB, the reading j-0888 was refused on
  assert.deepEqual(schedule([walk('j-0001')], short).start.map((j) => j.id), ['j-0001']);
  assert.deepEqual(schedule([job('j-0001')], short).start, [], 'a suite is still refused on 3.2 GB');
  assert.match(schedule([job('j-0001')], short).waiting[0].reason, /3\.2 GB RAM free, needs 4\.0/);

  // And a session that declares a smaller cost gets a smaller floor with it.
  const declared = walk('j-0001', { cost: 0.25 });
  assert.deepEqual(schedule([declared], { hour: NIGHT, freeMemMb: 1100 }).start.map((j) => j.id), ['j-0001']);
});

test('each job admitted in one pass spends the free memory the last one took', () => {
  // Every candidate used to be tested against the SAME reading, so N jobs that each fit the free
  // memory all started at once - four walks on 2.1 GB free, which is not four walks' worth of
  // machine. The floor is only a backstop if the pass subtracts what it has already let through.
  const four = [walk('j-0001'), walk('j-0002'), walk('j-0003'), walk('j-0004')];
  const { start, waiting } = schedule(four, { hour: NIGHT, freeMemMb: 2150 }); // 2.1 GB
  assert.deepEqual(start.map((j) => j.id), ['j-0001'], 'one walk fits 2.1 GB, not four');
  // The reason names BOTH figures. Reporting the pass's remainder as though it were the machine's
  // free memory sent a reader hunting for 2 GB that was never missing - the box has 2.1 GB free
  // and the walk ahead of this one claimed it, which the next poll may well undo.
  assert.match(waiting[0].reason, /only 0\.1 GB of 2\.1 GB free RAM unclaimed this pass, needs 2\.0/);

  // With room for two, two go - the accounting is a subtraction, not a one-job cap.
  assert.deepEqual(
    schedule(four, { hour: NIGHT, freeMemMb: 4200 }).start.map((j) => j.id),
    ['j-0001', 'j-0002'],
  );
});

test('a landing is not refused on memory the jobs ahead of it claimed in the same pass', () => {
  // Found by the pre-merge review, and it is this branch's own regression: the running figure
  // above was subtracted for EVERY admission, so a landing queued behind two walks was refused
  // with "only 0.2 GB RAM free, needs 0.6" on a box with 4.3 GB free. That is the stall the
  // whole change exists to remove, re-created one layer down - and `COST.merge` is 0.15 precisely
  // so that landings are the thing that always gets through.
  const two = [walk('j-0001'), walk('j-0002'), merge('j-0003')];
  assert.deepEqual(
    schedule(two, { hour: NIGHT, freeMemMb: 4300 }).start.map((j) => j.id),
    ['j-0001', 'j-0002', 'j-0003'],
  );

  // The physical backstop is kept, though: a landing on a genuinely short box still waits, and
  // says the machine's real reading rather than a bookkeeping remainder.
  const short = schedule([merge('j-0001')], { hour: NIGHT, freeMemMb: 300 });
  assert.deepEqual(short.start, []);
  assert.match(short.waiting[0].reason, /only 0\.3 GB RAM free, needs 0\.6/);

  // And exempting it cannot admit a crowd, because two merges never overlap whatever the memory
  // says - that rule runs before this one and is what keeps landings serial.
  assert.deepEqual(
    schedule([merge('j-0001'), merge('j-0002')], { hour: NIGHT, freeMemMb: PLENTY }).start.map((j) => j.id),
    ['j-0001'],
  );
});

test('a job queued AS a sweep is charged a battery, whatever its command looks like', () => {
  // `SWEEP_SCRIPTS` has missed a suite-sized script many times over (`command-match.mjs` reads as
  // a log of them), so a session that knows must be able to say so. The kind is already on the
  // record; before this it was ignored and an honestly-declared battery read as one browser page.
  assert.equal(costOf({ command: 'node scripts/brand-new-battery.mjs', kind: 'sweep' }), COST.browser);
  assert.equal(costOf({ command: 'node scripts/brand-new-battery.mjs', kind: 'gate' }), COST.walk);
});

test('the day still spends at most one suite-equivalent, whether it is spent whole or sliced', () => {
  // The consequence of pricing a walk at half a suite, pinned on purpose: two of them may run by
  // day where one suite could, and a third may not. The budget is a share of THIS MACHINE, so
  // the day's promise - one suite-equivalent of agent work while the owner is using the laptop -
  // is kept either way.
  const three = [walk('j-0001'), walk('j-0002'), walk('j-0003')];
  const { start, waiting } = schedule(three, { hour: DAY, freeMemMb: PLENTY });
  assert.deepEqual(start.map((j) => j.id), ['j-0001', 'j-0002']);
  assert.match(waiting[0].reason, /budget 1\/1 used/);
});

test('a cheap job runs beside a suite at night', () => {
  const jobs = [job('j-0001', { state: 'running', pid: 1 }), job('j-0002', { command: 'npm run build' })];
  assert.deepEqual(schedule(jobs, { hour: NIGHT, freeMemMb: PLENTY }).start.map((j) => j.id), ['j-0002']);
  // ...but not by day, where the whole budget is one suite.
  assert.deepEqual(schedule(jobs, { hour: DAY, freeMemMb: PLENTY }).start, []);
});

test('a dependency holds a job back until it is green, and names what it waits on', () => {
  const jobs = [job('j-0001', { state: 'running', pid: 1 }), job('j-0002', { after: ['j-0001'] })];
  const { start, waiting } = schedule(jobs, { hour: NIGHT, freeMemMb: PLENTY });
  assert.deepEqual(start, []);
  assert.match(waiting[0].reason, /waiting on j-0001/);

  const done = [job('j-0001', { state: 'done' }), job('j-0002', { after: ['j-0001'] })];
  assert.deepEqual(schedule(done, { hour: DAY, freeMemMb: PLENTY }).start.map((j) => j.id), ['j-0002']);
});

test('a landing chained behind a FAILED one runs once that one is terminal', () => {
  // Measured 2026-08-28: it sat at "a job it depends on did not finish green" for ever, and
  // nothing anywhere said the landing had stopped trying. `--after` on a merge means "not before
  // that one" - a matter of turn, not of permission, because landings are order-free and each is
  // fully re-verified against whatever main it finds.
  for (const bad of ['failed', 'timed-out', 'cancelled']) {
    const jobs = [job('j-0001', { state: bad }), job('j-0002', { after: ['j-0001'], kind: 'merge' })];
    const { start, waiting, dead, released } = schedule(jobs, { hour: NIGHT, freeMemMb: PLENTY });
    assert.deepEqual(start.map((j) => j.id), ['j-0002'], `a ${bad} predecessor must release the landing`);
    assert.deepEqual(waiting, [], 'and never leave it waiting on a state that will never arrive');
    assert.deepEqual(dead, []);
    assert.match(released[0].reason, /landings are order-free/);
  }
});

test('a NON-landing whose dependency died is written off, not left waiting', () => {
  // A gate that was to run after a build cannot mean anything once that build failed. Saying so
  // on every poll for ever is the stall; the job is terminal with the reason on it.
  const jobs = [job('j-0001', { state: 'failed' }), job('j-0002', { after: ['j-0001'], kind: 'gate' })];
  const { start, waiting, dead } = schedule(jobs, { hour: NIGHT, freeMemMb: PLENTY });
  assert.deepEqual(start, []);
  assert.deepEqual(waiting, []);
  assert.deepEqual(dead.map((d) => d.job.id), ['j-0002']);
  assert.match(dead[0].reason, /can never run/);
});

test('a job depending on an id that does not exist is not startable', () => {
  const jobs = [job('j-0002', { after: ['j-0999'] })];
  const { start, dead } = schedule(jobs, { hour: NIGHT, freeMemMb: PLENTY });
  assert.deepEqual(start, []);
  assert.match(dead[0].reason, /did not finish green/);
});

test('no SUITE starts under the RAM floor, and the reason names the memory', () => {
  const { start, waiting } = schedule([job('j-0001')], { hour: NIGHT, freeMemMb: 3174 });
  assert.deepEqual(start, []);
  assert.match(waiting[0].reason, /3\.1 GB RAM free, needs 4\.0/);
});

test('the floor scales with the job, so a landing is not blocked by a suite-sized threshold', () => {
  // The floor stops a dev server and four browser workers starting on a short box. A landing is
  // a few hundred megabytes spending ten minutes waiting on GitHub, and charging it the full
  // 4 GB stalled exactly the work that most needs to finish overnight.
  const tight = { hour: NIGHT, freeMemMb: 2458 }; // 2.4 GB - under the suite floor
  assert.deepEqual(schedule([job('j-0001')], tight).start, [], 'a suite still waits');
  assert.deepEqual(schedule([merge('j-0001')], tight).start.map((j) => j.id), ['j-0001'], 'a landing goes');

  // But a landing is not exempt either - below its own scaled floor it waits too.
  const starved = { hour: NIGHT, freeMemMb: 100 };
  assert.deepEqual(schedule([merge('j-0001')], starved).start, []);
  assert.match(schedule([merge('j-0001')], starved).waiting[0].reason, /needs 0\.6/);
});

test('a running job whose process is gone is reaped, not left holding a slot', () => {
  const jobs = [
    job('j-0001', { state: 'running', pid: 4242 }),
    job('j-0002', { state: 'running', pid: 4243 }),
    job('j-0003', { state: 'done' }),
  ];
  const reaped = reapDead(jobs, (pid) => pid === 4243, 1_000);
  assert.deepEqual(reaped.map((j) => j.id), ['j-0001']);
  assert.equal(reaped[0].state, 'failed');
  assert.equal(reaped[0].finishedAt, 1_000);
  assert.equal(reaped[0].reapedAsDead, true);
});

// ── A landing reaped AFTER it landed ─────────────────────────────────────────────────────────────
//
// j-0533 on 2026-09-04. It ran the landing for `claude/f-contracts-point` to completion - its log
// ends `auto-merge: landed claude/f-contracts-point on main as 6f7efcfd` - and the runner then
// failed to observe the exit and reaped the process. The record read
// `state: "failed", exitCode: null, reapedAsDead: true`, the sweep put a branch already on main
// back into the queue, and in a serialised queue that wasted landing delayed every branch behind it.
//
// Both orders are covered, because they are two different lies. Reaping BEFORE the record is
// written is the writer's job; a record already on disk that says failed is the reader's.

/** A landing whose `sha` reached main and was then reaped, exactly as the runner wrote j-0533. */
const reapedAfterLanding = (sha, over = {}) => merge('j-0533', {
  branch: 'claude/f-contracts-point',
  state: 'running',
  pid: 46044,
  command: `node scripts/land-watch.mjs --pr 58 --branch claude/f-contracts-point --expect-sha ${sha}`,
  ...over,
});
/** Git's answer: main contains e5ace753 and nothing else. */
const mainHas = (sha) => ({ inMain: (asked) => asked === sha });

test('a landing reaped after it pushed is recorded done, not failed', () => {
  const job = reapedAfterLanding('e5ace753');
  const [record] = reapDead([job], () => false, 1_000, mainHas('e5ace753'));
  assert.equal(record.state, 'done', 'the commit is in main - that IS the verdict');
  assert.equal(record.landedBeforeItEnded, true, 'and the record says why it is done with no exit code');
  assert.equal(record.exitCode, null, 'no exit code is invented for a process that never reported one');
  assert.equal(record.reapedAsDead, true, 'how the process ended is a separate fact, and it is kept');

  // The control, and it is the whole safety of this: a landing that had NOT pushed still fails.
  const [unlanded] = reapDead([reapedAfterLanding('deadbeef')], () => false, 1_000, mainHas('e5ace753'));
  assert.equal(unlanded.state, 'failed');
  assert.equal(unlanded.landedBeforeItEnded, undefined);

  // With no git answer at all - a check that could not run - the old behaviour stands. A question
  // about a landing that cannot be answered is never answered yes.
  assert.equal(reapDead([reapedAfterLanding('e5ace753')], () => false, 1_000)[0].state, 'failed');
});

test('a landing killed at its cap after it landed is recorded done too', () => {
  // Same lie, other killer. A watcher whose pull request merged and which then polled on for a
  // verdict it already had is killed at its cap having already succeeded.
  const job = reapedAfterLanding('e5ace753', { state: 'running', capMinutes: 45 });
  const record = timedOutRecord(job, 1_000, mainHas('e5ace753'));
  assert.equal(record.state, 'done');
  assert.equal(record.landedBeforeItEnded, true);
  assert.equal(record.reapedAsDead, undefined, 'the cap is not the reaper, and does not claim to be');
  assert.equal(timedOutRecord(reapedAfterLanding('deadbeef'), 1_000, mainHas('e5ace753')).state, 'timed-out');
});

test('a record already on disk that says failed is corrected when it is read', () => {
  // The other order: j-0533's row was written by a build that did not ask git, and it is kept for
  // a fortnight. Correcting it on read is what makes every reader agree without rewriting history.
  const onDisk = reapedAfterLanding('e5ace753', {
    state: 'failed', exitCode: null, reapedAsDead: true, finishedAt: 100,
  });
  assert.equal(landingStateFor('claude/f-contracts-point', [onDisk]).state, 'gave-up', 'without git, as before');
  const corrected = landingStateFor('claude/f-contracts-point', [onDisk], mainHas('e5ace753'));
  assert.equal(corrected.state, 'landed');
  assert.equal(corrected.requeue, null, 'and no command is offered for a branch already in main');

  // NARROW: an exit code is a verdict, and a red gate stays a failure whatever main contains.
  const refused = reapedAfterLanding('e5ace753', { state: 'failed', exitCode: 1, finishedAt: 100 });
  assert.equal(landingStateFor('claude/f-contracts-point', [refused], mainHas('e5ace753')).state, 'gave-up');
});

test('a landing that already landed is never retried', () => {
  const onDisk = reapedAfterLanding('e5ace753', {
    state: 'failed', exitCode: null, reapedAsDead: true, finishedAt: 100,
  });
  assert.equal(
    retryLandingFor(onDisk, { ...mainHas('e5ace753'), tipOf: () => 'e5ace753' }),
    null,
    'a reaped landing whose commit is in main has nothing left to land',
  );
  // And the sweep never even gets that far, because the branch no longer reads as gave-up.
  assert.deepEqual(
    adoptOrphanedLandings([onDisk], { ...mainHas('e5ace753'), tipOf: () => 'e5ace753' }),
    [],
  );
  // The control: the same job, with main NOT containing it, is still put back.
  assert.equal(
    retryLandingFor(onDisk, { inMain: () => false, tipOf: () => 'e5ace753' }).retryOf,
    'j-0533',
  );
});

test('two adds in the same millisecond produce two distinct jobs', () => {
  // The 'wx' claim is the whole concurrency story: the filesystem decides, and a process that
  // dies mid-claim leaves no lock behind.
  const dir = tempQueue();
  try {
    const a = addJob(dir, { command: 'npm run build', checkout: '/x', now: 1 });
    const b = addJob(dir, { command: 'npm run build', checkout: '/x', now: 1 });
    assert.notEqual(a.id, b.id);
    assert.equal(readdirSync(dir).filter((n) => n.endsWith('.json')).length, 2);
    assert.deepEqual(readJobs(dir).map((j) => j.id), [a.id, b.id]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an unreadable job file is skipped and reported, never fatal', () => {
  // A torn read during someone else's write must cost one job, not the whole queue.
  const dir = tempQueue();
  try {
    addJob(dir, { command: 'npm run build', checkout: '/x', now: 1 });
    writeFileSync(join(dir, 'j-9999.json'), '{ this is not json');
    const seen = [];
    const jobs = readJobs(dir, { onUnreadable: (n) => seen.push(n) });
    assert.equal(jobs.length, 1);
    assert.deepEqual(seen, ['j-9999.json']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a file that is not a job is not read as one', () => {
  // The queue directory carries sidecars - `last-seen.json` is one - and one of them reached
  // every consumer of this list as an entry with an undefined id and state.
  const dir = tempQueue();
  try {
    const real = addJob(dir, { command: 'npm run build', checkout: '/x', now: 1 });
    writeFileSync(join(dir, 'last-seen.json'), JSON.stringify({ at: 1234 }));
    assert.deepEqual(readJobs(dir).map((j) => j.id), [real.id]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('finished jobs older than the retention window are pruned, live ones never', () => {
  const dir = tempQueue();
  try {
    const old = addJob(dir, { command: 'npm run build', checkout: '/x', now: 1 });
    writeJob(dir, { ...old, state: 'done', finishedAt: 1 });
    writeFileSync(join(dir, 'logs', `${old.id}.log`), 'output of a job nobody will read again');
    const stillRunning = addJob(dir, { command: 'npm run build', checkout: '/x', now: 1 });
    writeJob(dir, { ...stillRunning, state: 'running', startedAt: 1 });
    const recent = addJob(dir, { command: 'npm run build', checkout: '/x', now: 1 });
    writeJob(dir, { ...recent, state: 'failed', finishedAt: 1 });

    const now = 1 + JOB_RETENTION_MS + 1;
    // A long-RUNNING job is not stale, at any age - the queue's own reaper decides that.
    assert.deepEqual(expiredJobIds([{ id: 'j-0001', state: 'running', enqueuedAt: 1 }], now), []);
    // The recent one is dated inside the window by moving the clock, not the record.
    assert.deepEqual(expiredJobIds(readJobs(dir), 1 + JOB_RETENTION_MS - 1), []);

    const removed = pruneJobs(dir, { now });
    assert.deepEqual(removed.sort(), [old.id, recent.id].sort());
    assert.deepEqual(readJobs(dir).map((j) => j.id), [stillRunning.id]);
    assert.ok(!existsSync(join(dir, 'logs', `${old.id}.log`)), 'the log goes with the record');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ids continue past the highest one on disk, so a pruned id is not handed straight back', () => {
  // Pruning frees the OLDEST ids. Restarting the scan at the first free number would give a
  // fresh job the id an old log and an old landing record already refer to.
  const dir = tempQueue();
  try {
    const first = addJob(dir, { command: 'npm run build', checkout: '/x', now: 1 });
    const second = addJob(dir, { command: 'npm run build', checkout: '/x', now: 1 });
    assert.deepEqual([first.id, second.id], ['j-0001', 'j-0002']);
    rmSync(join(dir, `${first.id}.json`));
    assert.equal(addJob(dir, { command: 'npm run build', checkout: '/x', now: 1 }).id, 'j-0003');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a job refuses an unknown kind and an empty command', () => {
  const dir = tempQueue();
  try {
    assert.throws(() => addJob(dir, { command: 'x', checkout: '/x', kind: 'nonsense', now: 1 }), /unknown job kind/);
    assert.throws(() => addJob(dir, { command: '   ', checkout: '/x', now: 1 }), /needs a command/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pending and finishedSince split the queue the way the reports read it', () => {
  const jobs = [
    job('j-0001', { state: 'waiting' }),
    job('j-0002', { state: 'running', pid: 1 }),
    job('j-0003', { state: 'done', finishedAt: 500 }),
    job('j-0004', { state: 'failed', finishedAt: 1500 }),
  ];
  assert.deepEqual(pending(jobs).map((j) => j.id), ['j-0001', 'j-0002']);
  assert.deepEqual(finishedSince(jobs, 1000).map((j) => j.id), ['j-0004']);
  assert.deepEqual(finishedSince(jobs, 0).map((j) => j.id), ['j-0003', 'j-0004']);
});

// A landing that died - deferrals exhausted, a refusal, a timeout - used to read exactly like a
// branch nobody had queued, so an exhausted landing VANISHED: queue empty, branch "not queued",
// indistinguishable from unfinished work. These pin the three answers apart.

// --- The foreground wait, and the job that needs a server nobody started ----------------------

test('a foreground wait gives up at the cap instead of running for hours', () => {
  const running = job('j-0001', { state: 'running' });
  assert.deepEqual(waitVerdict({ job: running, waitedMs: 60_000 }), { action: 'wait' });

  const late = waitVerdict({ job: running, waitedMs: FOREGROUND_WAIT_CAP_MS });
  assert.equal(late.action, 'give-up');
  assert.match(late.message, /still running after 30 minutes/);
  assert.match(late.message, /Hand off/);
  assert.match(late.message, /Nothing was interrupted/);

  assert.equal(FOREGROUND_WAIT_CAP_MS, 30 * 60_000, 'the bound is the point of this function');
});

test('a finished job ends the wait at once, whatever it finished as', () => {
  for (const state of ['done', 'failed', 'timed-out', 'cancelled']) {
    const verdict = waitVerdict({ job: job('j-0001', { state, exitCode: state === 'done' ? 0 : 1 }), waitedMs: 0 });
    assert.equal(verdict.action, 'finished');
    assert.equal(verdict.state, state);
  }
  assert.equal(waitVerdict({ job: undefined, waitedMs: 0 }).action, 'unknown');
});

test('a sweep whose dev server is not up fails in its first second, not its whole slot', () => {
  const sweep = job('j-0001', { command: 'node scripts/overflow-sweep.mjs --baseline', checkout: 'C:/wt/x' });
  const dead = devServerPrecheck(sweep, { port: 5183, busy: false });
  assert.equal(dead.action, 'fail');
  assert.match(dead.reason, /nothing is listening on port 5183/);
  assert.match(dead.reason, /Start the dev server in C:\/wt\/x/);

  assert.deepEqual(devServerPrecheck(sweep, { port: 5183, busy: true }), { action: 'go' });
  // Fails OPEN when the port is unknown - a missing generated file must not stop a job.
  assert.deepEqual(devServerPrecheck(sweep, {}), { action: 'go' });
  // And it never speaks for a job that brings its own server.
  assert.deepEqual(devServerPrecheck(job('j-0002', { command: 'npm run test:e2e' }), { port: 5183, busy: false }), {
    action: 'go',
  });
});

test('a live merge job reads as queued', () => {
  const jobs = [job('j-0001', { kind: 'merge', branch: 'claude/x', state: 'waiting' })];
  const answer = landingStateFor('claude/x', jobs);
  assert.equal(answer.state, 'queued');
  assert.equal(answer.job, jobs[0]);
});

test('a dead landing reads as gave-up, never as not-queued', () => {
  const jobs = [
    job('j-0001', { kind: 'merge', branch: 'claude/x', state: 'failed', finishedAt: 100, exitCode: 3 }),
    job('j-0002', { kind: 'merge', branch: 'claude/x', state: 'timed-out', finishedAt: 200, capMinutes: 45 }),
  ];
  const answer = landingStateFor('claude/x', jobs);
  assert.equal(answer.state, 'gave-up');
  assert.equal(answer.job.id, 'j-0002', 'the newest dead landing is the one to read the log of');
});

test('a landing that gave up says WHY and hands back the command that re-queues it', () => {
  // Every one of these vanished at least once on 2026-08-28. A row that only names the job sends
  // a person to a log to learn which of them happened, and a row with no re-queue command sends
  // them to the docs to learn how to put it back.
  const cases = [
    [{ state: 'timed-out', capMinutes: 45 }, /45 min cap/],
    [{ state: 'failed', reapedAsDead: true }, /process vanished/],
    [{ state: 'failed', exitCode: 3 }, /still blocked/],
    // Exit 4 is the red-main gate, and it is worth its own code precisely so this line can say
    // "not your branch": five landings queued against a red main all stop with this reason, and
    // reading five identical rows is how a person sees the fault is upstream of all of them.
    [{ state: 'failed', exitCode: 4 }, /main itself is red/],
    [{ state: 'failed', exitCode: 1 }, /exit 1/],
    [{ state: 'failed', giveUpReason: 'main moved under it three times' }, /main moved under it/],
  ];
  for (const [fields, expected] of cases) {
    const jobs = [job('j-0007', { kind: 'merge', branch: 'claude/x', finishedAt: 100, ...fields })];
    const answer = landingStateFor('claude/x', jobs);
    assert.equal(answer.state, 'gave-up');
    assert.match(answer.reason, expected);
    // `requeue`, not `add-merge`. The declaration was already made and the pin still holds it, so
    // putting this back cannot land anything committed since - which is what lets a session run it
    // without a permission prompt at three in the morning.
    assert.equal(answer.requeue, 'node scripts/jobs.mjs requeue claude/x');
    const row = landingRow('claude/x', jobs);
    assert.match(row, /LANDING FAILED j-0007/);
    assert.match(row, expected);
    assert.match(row, /re-queue: node scripts\/jobs\.mjs requeue claude\/x/);
    assert.doesNotMatch(row, /not queued/);
  }
});

// ── Adopting a landing whose session has gone ───────────────────────────────────────────────────
//
// On 2026-09-03 two landings were killed at their 45-minute cap - the first two to time out in
// 213 - and both owning sessions had already finished. Only a branch's own session may queue it,
// so `claude/d-queue-walks-itself` and `claude/f-contracts-point` became unlandable with nobody
// left to try again. Then it spread: `merge-order.mjs` refuses a branch that collides with one
// still ahead of main and unqueued, so `claude/j-fields-step-per-field` was refused outright for
// touching the same files as F, and three more rows queued behind that.

/** A landing killed at its cap, pinned at `sha`, exactly as `add-merge` writes one. */
const killedLanding = (sha, over = {}) => merge('j-0438', {
  branch: 'claude/d', state: 'timed-out', finishedAt: 100, capMinutes: 45,
  command: `node scripts/land-watch.mjs --pr 12 --branch claude/d --expect-sha ${sha}`,
  ...over,
});

test('a landing killed at its cap is put back, once', () => {
  const dead = killedLanding('a878b17');
  const next = retryLandingFor(dead, { tipOf: () => 'a878b17' });
  // VERBATIM while the branch has not moved. The pin is what makes a retry safe without asking
  // anyone: if the session woke and pushed, the landing refuses rather than taking undeclared work.
  assert.equal(next.command, dead.command);
  assert.equal(next.branch, 'claude/d');
  assert.equal(next.kind, 'merge');
  assert.equal(next.retryOf, 'j-0438');
  assert.equal(next.retryCount, 1);
  assert.deepEqual(next.after, [], 'the jobs it was queued behind are long gone');

  // And exactly once. A second failure is not a flake, and looping is how a queue looks busy all
  // night and lands nothing.
  assert.equal(retryLandingFor({ ...dead, retryCount: MAX_LANDING_RETRIES }, { tipOf: () => 'a878b17' }), null);
});

test('a landing whose command this build cannot run is never put back', () => {
  // Records live a fortnight and a retry copies the command VERBATIM, so records written by the
  // retired laptop lander outlive it. Copying one would spend a serialised merge slot and the
  // branch's single retry on a module-not-found, with no refusal kind to name it.
  const old = killedLanding('a878b17', {
    command: 'node scripts/auto-merge.mjs --branch claude/d --expect-sha a878b17',
  });
  assert.equal(retryLandingFor(old, { tipOf: () => 'a878b17' }), null);
  assert.deepEqual(adoptOrphanedLandings([old], { tipOf: () => 'a878b17' }), []);
  // The control: the same job watching its pull request is put back exactly as before.
  assert.equal(retryLandingFor(killedLanding('a878b17'), { tipOf: () => 'a878b17' }).retryOf, 'j-0438');
});

test('a moved branch is never re-pinned, and is not retried at all', () => {
  // The safety the pin exists for. A session that woke up and committed has not declared THAT work
  // finished, so nobody may land it - not a person, and certainly not a sweep running at four in
  // the morning.
  //
  // The pin used to be allowed to MOVE, over commits that were provably the previous landing's own
  // integration of main (j-0519, 2026-09-04), because the laptop lander merged main into the branch
  // and pushed the result before it gated - so its own first attempt moved the tip out from under
  // the pin. GitHub's merge queue builds its temporary merge on GitHub and never writes the branch,
  // so any movement now is a session's own push and there is nothing left to forgive.
  assert.equal(retryLandingFor(killedLanding('a878b17'), { tipOf: () => 'cafe1234' }), null);
  // A branch whose tip cannot be read is not one to queue a landing for either.
  assert.equal(retryLandingFor(killedLanding('a878b17'), { tipOf: () => null }), null);
  // With no answer available at all, the default is the safe one.
  assert.equal(retryLandingFor(killedLanding('a878b17')), null);
});

test('a landing that was JUDGED is never retried - only one the machine failed to answer', () => {
  const base = { branch: 'claude/d', state: 'failed', finishedAt: 100 };
  // The three ways the machine fails to answer.
  assert.ok(retryLandingFor(merge('j-1', { ...base, state: 'timed-out' })), 'killed at its cap');
  assert.ok(retryLandingFor(merge('j-2', { ...base, reapedAsDead: true })), 'runner died or the laptop slept');
  assert.ok(retryLandingFor(merge('j-3', { ...base, exitCode: NO_VERDICT_EXIT })), 'CI never gave a verdict');
  // And everything CI or the preflight actually decided. Retrying any of these is how a queue
  // lands work that was refused, which is worse than the orphan it would be curing.
  assert.equal(retryLandingFor(merge('j-4', { ...base, exitCode: 1 })), null, 'a red gate or a conflict');
  assert.equal(retryLandingFor(merge('j-5', { ...base, exitCode: 3 })), null, 'blocked has its own deferral loop');
  assert.equal(retryLandingFor(merge('j-6', { ...base, exitCode: 4 })), null, 'a red main is a person\'s fix');
  assert.equal(retryLandingFor(merge('j-7', { ...base, state: 'done', exitCode: 0 })), null, 'it landed');
  assert.equal(retryLandingFor(merge('j-8', { ...base, state: 'cancelled' })), null, 'a person withdrew it');
  // Never anything but a landing: a gate job has an owner watching it.
  assert.equal(retryLandingFor(job('j-9', { state: 'timed-out', branch: 'claude/d' })), null);
});

test('the sweep adopts landings that were ALREADY orphaned, which is the whole point', () => {
  // A hook on the moment a job dies only ever saves the next victim. The two branches this was
  // written for were stuck hours before the mechanism existed.
  const jobs = [
    merge('j-0438', { branch: 'claude/d', state: 'timed-out', finishedAt: 100 }),
    merge('j-0445', { branch: 'claude/f', state: 'timed-out', finishedAt: 200 }),
  ];
  const adopted = adoptOrphanedLandings(jobs);
  assert.deepEqual(adopted.map((a) => a.branch).sort(), ['claude/d', 'claude/f']);
  assert.deepEqual(adopted.map((a) => a.retryOf).sort(), ['j-0438', 'j-0445']);

  // Idempotent: once the retries exist, sweeping again adopts nothing. Without this the runner
  // would queue a landing every five seconds.
  const withRetries = [...jobs, ...adopted.map((a, i) => merge(`j-050${i}`, { ...a, state: 'waiting' }))];
  assert.deepEqual(adoptOrphanedLandings(withRetries), []);
});

test('the sweep stands down for a branch a person is already handling', () => {
  const dead = merge('j-0438', { branch: 'claude/d', state: 'timed-out', finishedAt: 100 });
  // Queued by hand since: the newest job is live, so there is nothing orphaned.
  assert.deepEqual(adoptOrphanedLandings([dead, merge('j-0460', { branch: 'claude/d', state: 'waiting' })]), []);
  // Landed since.
  assert.deepEqual(
    adoptOrphanedLandings([dead, merge('j-0460', { branch: 'claude/d', state: 'done', exitCode: 0, finishedAt: 300 })]),
    [],
  );
  // Withdrawn on purpose - a person said no, and the sweep is not a way around that.
  assert.deepEqual(
    adoptOrphanedLandings([dead, merge('j-0460', { branch: 'claude/d', state: 'cancelled', finishedAt: 300 })]),
    [],
  );
  // A branch nobody ever queued stays untouched. The declaration is the thing being retried, and
  // this branch has not made one.
  assert.deepEqual(adoptOrphanedLandings([job('j-0470', { state: 'timed-out', branch: 'claude/never' })]), []);
});

test('an adopted landing is PENDING, which is what clears the jam behind it', () => {
  // The cascade is the expensive half. `auto-merge.mjs` refuses a branch whose blocker is ahead
  // of main with no landing queued, on the sound reasoning that waiting cannot change it - and it
  // asks that question through `pending()`. So an adopted landing has to show up there, or the
  // branches behind it keep being refused outright instead of deferring their turn. That is what
  // happened to `claude/j-fields-step-per-field` behind `claude/f-contracts-point`.
  const dir = tempQueue();
  const orphan = merge('j-0445', { branch: 'claude/f', state: 'timed-out', finishedAt: 100 });
  writeJob(dir, orphan);
  for (const next of adoptOrphanedLandings(readJobs(dir))) addJob(dir, { ...next, now: 200 });

  const live = pending(readJobs(dir)).filter((j) => j.kind === 'merge' && j.branch === 'claude/f');
  assert.equal(live.length, 1, 'exactly the retry - the dead job is terminal and not pending');
  assert.equal(live[0].retryOf, 'j-0445');
  rmSync(dir, { recursive: true, force: true });
});

test('an automatic retry says so in the listing', () => {
  // Otherwise the row shows a branch queued that no session queued, which reads as work being
  // landed out from under a conversation - exactly what the one-session rule prevents.
  const jobs = [
    merge('j-0438', { branch: 'claude/d', state: 'timed-out', finishedAt: 100 }),
    merge('j-0500', { branch: 'claude/d', state: 'waiting', retryOf: 'j-0438', retryCount: 1 }),
  ];
  assert.equal(landingStateFor('claude/d', jobs).state, 'queued');
  assert.match(landingRow('claude/d', jobs), /QUEUED j-0500 \(retry of j-0438, which reached no verdict\)/);
  // A landing a session queued itself still reads plainly.
  assert.equal(landingRow('claude/d', [merge('j-0501', { branch: 'claude/d', state: 'waiting' })]), 'QUEUED j-0501');
});

test('the row says WHY a landing was put back, and never guesses', () => {
  // Three things mint a retry now - the no-verdict sweep, an ordering block, and a person running
  // `requeue` - and the row used to call all three "reached no verdict". Confident, specific, wrong
  // for two of them, and about the one fact the listing exists to state correctly.
  const reasons = [
    ['was blocked by claude/f', /which was blocked by claude\/f/],
    ['was put back by hand', /which was put back by hand/],
    [undefined, /which reached no verdict/],
  ];
  for (const [retryReason, expected] of reasons) {
    const jobs = [
      merge('j-0438', { branch: 'claude/d', state: 'failed', exitCode: 1, finishedAt: 100 }),
      merge('j-0500', { branch: 'claude/d', state: 'waiting', retryOf: 'j-0438', retryReason }),
    ];
    assert.match(landingRow('claude/d', jobs), expected);
  }
});

test('a HELD landing does not read as an ordinary queued one', () => {
  // It is waiting on a person somewhere else, for up to twelve hours, and this row is the only
  // place that surfaces before the deadline writes it off.
  const jobs = [merge('j-0600', {
    branch: 'claude/j', state: 'waiting', orderHold: { blockers: ['claude/f'] }, blockedSince: 100,
  })];
  assert.match(landingRow('claude/j', jobs), /HELD for claude\/f to land or be queued/);
});

test('exit 5 reads as the machine failing to answer, never as a refusal', () => {
  const jobs = [merge('j-0438', { branch: 'claude/d', state: 'failed', exitCode: NO_VERDICT_EXIT, finishedAt: 100 })];
  const reason = landingStateFor('claude/d', jobs).reason;
  assert.match(reason, /no verdict/);
  assert.doesNotMatch(reason, /refused/, 'a refusal is a judgement, and this is the absence of one');
});



test('a fresh queue after a dead landing wins - the branch is queued again', () => {
  const jobs = [
    job('j-0001', { kind: 'merge', branch: 'claude/x', state: 'failed', finishedAt: 100 }),
    job('j-0002', { kind: 'merge', branch: 'claude/x', state: 'waiting' }),
  ];
  assert.equal(landingStateFor('claude/x', jobs).state, 'queued');
});

test('a withdrawn landing says so - "not queued" may never describe a branch that WAS queued', () => {
  const jobs = [job('j-0001', { kind: 'merge', branch: 'claude/x', state: 'cancelled', finishedAt: 100 })];
  const answer = landingStateFor('claude/x', jobs);
  assert.equal(answer.state, 'withdrawn');
  assert.match(landingRow('claude/x', jobs), /LANDING WITHDRAWN j-0001/);
  assert.equal(answer.requeue, 'node scripts/jobs.mjs add-merge claude/x');
});

test('another branch\'s jobs, and non-merge jobs, never answer for this branch', () => {
  const jobs = [
    job('j-0001', { kind: 'merge', branch: 'claude/other', state: 'failed', finishedAt: 100 }),
    job('j-0002', { kind: 'gate', branch: 'claude/x', state: 'failed', finishedAt: 100 }),
  ];
  assert.equal(landingStateFor('claude/x', jobs).state, 'not-queued');
  assert.equal(landingRow('claude/x', jobs), 'not queued');
});

test('a landing that SUCCEEDED reads as landed - never as a refusal, and never with a re-queue command', () => {
  // Measured on 2026-09-01: branch claude/orchestrator-skill-redesign-a416a6 landed cleanly
  // ("auto-merge: landed ... on main as b84fd883") and the same watch tick reported
  // "LANDING GAVE UP ... auto-merge refused it (exit 0)", with a command to queue it again.
  // Two contradictory claims about one branch, and the WRONG one carried the instruction. The
  // re-queue command is the dangerous half: re-queueing a branch that is already on main is
  // noise at best, and at 07:00 it is a person acting on a failure that never happened.
  const jobs = [job('j-0126', { kind: 'merge', branch: 'claude/x', state: 'done', finishedAt: 100, exitCode: 0 })];
  const answer = landingStateFor('claude/x', jobs);
  assert.equal(answer.state, 'landed');
  assert.equal(answer.job.id, 'j-0126');
  assert.equal(answer.requeue, null, 'a branch already on main must never be handed a re-queue command');
  assert.equal(answer.reason, null, 'a landing that succeeded has nothing to explain');
});

test('the LANDED row says the branch is ahead AGAIN, because that is the only way it can be seen', () => {
  // landingRow's only caller enumerates branches ahead of main (jobs.mjs printOutstanding), so a
  // branch whose landing left it ON main never reaches this row at all. "already on main" would
  // therefore have been false every single time it printed - the same confidently-wrong shape,
  // one state along. Here the re-queue command is CORRECT: this branch has unlanded commits.
  const jobs = [job('j-0126', { kind: 'merge', branch: 'claude/x', state: 'done', finishedAt: 100, exitCode: 0 })];
  const row = landingRow('claude/x', jobs);
  assert.match(row, /LANDED j-0126/);
  assert.match(row, /ahead of main AGAIN/);
  assert.doesNotMatch(row, /already on main/);
  assert.doesNotMatch(row, /refused|FAILED|GAVE UP/);
  assert.match(row, /node scripts\/jobs\.mjs log j-0126/);
  assert.match(row, /node scripts\/jobs\.mjs add-merge claude\/x/);
  assert.doesNotMatch(row, /not queued/);
});

test('the newest merge job answers, so a success after an earlier failure reads as landed', () => {
  const jobs = [
    job('j-0001', { kind: 'merge', branch: 'claude/x', state: 'failed', finishedAt: 100, exitCode: 3 }),
    job('j-0002', { kind: 'merge', branch: 'claude/x', state: 'done', finishedAt: 200, exitCode: 0 }),
  ];
  assert.equal(landingStateFor('claude/x', jobs).state, 'landed');
});

test('giveUpReason never fabricates a refusal out of a zero exit', () => {
  // The other half of the same defect: the exit-code arm rendered success as "auto-merge refused
  // it (exit 0)". Nothing routes a successful landing here any more, but the function is
  // exported, and a lie that SOUNDS like every real refusal is worse than a loud one.
  const reason = giveUpReason(job('j-0126', { kind: 'merge', state: 'done', exitCode: 0 }));
  assert.doesNotMatch(reason, /refused/);
  assert.match(reason, /did not give up/);
});

test('cancelling an already-finished job is refused, so a landed branch is never called withdrawn', () => {
  // The measured shape: `jobs.mjs cancel` wrote `cancelled` with a fresh finishedAt over any id
  // at all. `landingStateFor` sorts terminal jobs by finishedAt and reads `cancelled` as
  // withdrawn - so cancelling a merge job that had already exited 0 made `npm run jobs` announce
  // "LANDING WITHDRAWN" for a branch sitting on main, and offer a command to queue it again.
  for (const state of ['done', 'failed', 'timed-out', 'cancelled']) {
    const answer = cancelVerdict(job('j-0001', { state, finishedAt: 100 }));
    assert.equal(answer.action, 'no-op', `a ${state} job has nothing left to cancel`);
    assert.match(answer.message, new RegExp(state), 'and it says which state it found');
  }
});

test('cancelling a live job is exactly as it was - that is the whole point of the command', () => {
  for (const state of ['waiting', 'running']) {
    assert.equal(cancelVerdict(job('j-0001', { state })).action, 'cancel');
  }
});

test('a finished landing survives a cancel, so the queue keeps calling it landed', () => {
  // The statement over the seam the fault actually crossed: refusing the cancel is only worth
  // anything because it leaves `landingStateFor` reading `done`.
  const landed = job('j-0001', { kind: 'merge', branch: 'claude/x', state: 'done', exitCode: 0, finishedAt: 100 });
  assert.equal(cancelVerdict(landed).action, 'no-op');
  assert.equal(landingStateFor('claude/x', [landed]).state, 'landed');
  // And the counterfactual - this is the lie the write used to tell.
  const overwritten = { ...landed, state: 'cancelled', finishedAt: 200 };
  assert.equal(landingStateFor('claude/x', [overwritten]).state, 'withdrawn');
});

// ── An ordering block is a WAIT ──────────────────────────────────────────────────────────────────
//
// The night of 2026-09-03, and the reason this section exists. `auto-merge.mjs` refuses a branch
// whose blocker is still ahead of main with no landing queued for it - correctly, because deferring
// is a bet the queue will land that blocker and the bet cannot pay. Then the job DIED, and nothing
// brought it back when the blocker was queued twenty minutes later. `claude/j-fields-step-per-field`
// and `claude/p-alignment-across-corpus` sat unlanded for hours for that reason alone, and both
// landed unchanged the next morning the moment a person queued them again. "I cannot land right
// now" and "I must never land" were one state, and only the second of them is a failure.

const NOW = 1_700_000_000_000;

test('a landing refusal names its kind, whether the script marks it or only says it', () => {
  // The marker is what a current landing prints. The prose is what every branch cut before it
  // prints, because a landing runs the copy of auto-merge.mjs in the BRANCH's own checkout - so for
  // a fortnight the prose is the mechanism rather than a fallback.
  assert.deepEqual(
    classifyRefusal('auto-merge REFUSAL-KIND: order-blocked claude/f,claude/p\nauto-merge REFUSED: ...'),
    { kind: 'order-blocked', blockers: ['claude/f', 'claude/p'] },
  );
  assert.deepEqual(classifyRefusal('auto-merge REFUSAL-KIND: stale-pin\n'), { kind: 'stale-pin', blockers: [] });
  assert.deepEqual(
    classifyRefusal('auto-merge REFUSED: blocked by claude/f - still ahead of main, and NO landing is queued for it'),
    { kind: 'order-blocked', blockers: ['claude/f'] },
  );
  assert.equal(
    classifyRefusal('land-watch: the landing of claude/d was refused: the branch moved after it was declared finished (a -> b)').kind,
    'stale-pin',
  );
  // Everything else is an ordinary refusal and must stay one. A null here is what keeps a red gate
  // or a conflict failing exactly as it always did.
  assert.equal(classifyRefusal('auto-merge REFUSED: the gate is red'), null);
  assert.equal(classifyRefusal(''), null);
});

test('a refusal is read from the LAST attempt, never from one the job already recovered from', () => {
  // The log is opened for append and a job is re-run under its own id - a deferral, or a release
  // from a hold - so one file holds every attempt. A second run that refuses in a few lines sits in
  // the same window as the first run's marker, and `exec` finds the FIRST match. Without cutting at
  // the attempt header, a landing released from a hold and then refused for a red main reads as
  // blocked again and is parked for another twelve hours on a refusal that will never resolve.
  const twoAttempts = [
    '=== j-0600 node scripts/land-watch.mjs --pr 12 --branch claude/j',
    'auto-merge REFUSAL-KIND: order-blocked claude/f',
    'auto-merge REFUSED: blocked by claude/f - still ahead of main, and NO landing is queued for it',
    '=== j-0600 node scripts/land-watch.mjs --pr 12 --branch claude/j',
    'auto-merge REFUSED: main itself is red',
  ].join('\n');
  assert.equal(classifyRefusal(twoAttempts, { attemptMark: '=== j-0600 ' }), null, 'the second attempt refused plainly');
  // Without the boundary it reads the stale marker - the defect, stated so it cannot come back.
  assert.equal(classifyRefusal(twoAttempts).kind, 'order-blocked');
  // And an attempt longer than the window has no header in it, which is harmless: everything in
  // the window is that attempt's own output.
  assert.equal(
    classifyRefusal('auto-merge REFUSAL-KIND: stale-pin\n', { attemptMark: '=== j-0600 ' }).kind,
    'stale-pin',
  );
});

/** A landing parked behind `blockers` `minutes` ago - what the runner writes on an ordering block. */
const held = (blockers, minutes = 0, over = {}) => merge('j-0600', {
  branch: 'claude/j',
  state: 'waiting',
  refusal: { kind: 'order-blocked', blockers },
  orderHold: { blockers },
  blockedSince: NOW - minutes * 60_000,
  ...over,
});

test('a held landing waits for its blocker, and re-running it is not what releases it', () => {
  // The release condition is deliberately the weak, checkable one: has anything changed that could
  // make re-running come out DIFFERENTLY? Only two things can. Anything else and the landing pays
  // for a whole CI wait to print the same refusal.
  const holding = orderHoldDecision(held(['claude/f'], 30), { now: NOW });
  assert.equal(holding.action, 'hold');
  assert.match(holding.reason, /claude\/f/);
  assert.match(holding.reason, /30 min/);

  // The blocker landed - it is no longer ahead of main, so it blocks nobody.
  assert.equal(orderHoldDecision(held(['claude/f'], 30), { now: NOW, aheadOfMain: () => false }).action, 'go');
  // Or its own session queued it, which turns this into the ordinary deferral the queue drains.
  assert.equal(orderHoldDecision(held(['claude/f'], 30), { now: NOW, queuedForLanding: () => true }).action, 'go');
  // A job that was never held is not held now. Every landing in the queue goes through this.
  assert.equal(orderHoldDecision(merge('j-0601'), { now: NOW }).action, 'go');
});

test('a hold that nothing ever answers SURFACES rather than waiting for ever', () => {
  // Twelve hours: long enough to outlast the unattended night this exists for, short enough that a
  // branch whose blocker nobody ever queues is on the owner's screen the same day.
  assert.equal(orderHoldDecision(held(['claude/f'], 11 * 60), { now: NOW }).action, 'hold', 'inside the window');
  const spent = orderHoldDecision(held(['claude/f'], 12 * 60), { now: NOW });
  assert.equal(spent.action, 'give-up');
  assert.match(spent.reason, /no landing was ever queued/);
  assert.match(spent.reason, /its own session/, 'and says who can fix it');
});

test('the scheduler holds a parked landing instead of starting it, and says why', () => {
  const { start, waiting, dead } = schedule([held(['claude/f'], 20)], { hour: NIGHT, freeMemMb: PLENTY, now: NOW });
  assert.deepEqual(start, [], 'running it again would print the same refusal at the price of a CI wait');
  assert.deepEqual(dead, []);
  assert.match(waiting[0].reason, /held for claude\/f/);
});

test('a hold that runs out is WRITTEN OFF, so the branch surfaces instead of waiting', () => {
  const { start, waiting, dead } = schedule([held(['claude/f'], 13 * 60)], { hour: NIGHT, freeMemMb: PLENTY, now: NOW });
  assert.deepEqual(start, []);
  assert.deepEqual(waiting, []);
  assert.match(dead[0].reason, /no landing was ever queued/);
});

test('the ordering cascade releases itself - the whole thing, end to end', () => {
  // Reconstructed from the branches it happened to. F's landing died; J touches the same files, so
  // merge-order refuses J while F is ahead of main and unqueued. Today J was FAILED and stayed
  // failed all night. Now J is held, and the moment F is put back - by the sweep, by its own
  // session, by anyone - J is released and takes its turn behind it.
  const jobs = [
    merge('j-0445', { branch: 'claude/f', state: 'timed-out', finishedAt: 100 }),
    held(['claude/f'], 20, { branch: 'claude/j' }),
  ];
  const blocked = schedule(jobs, { hour: NIGHT, freeMemMb: PLENTY, now: NOW });
  assert.deepEqual(blocked.start, [], 'F is dead and unqueued, so nothing has changed for J');
  assert.match(blocked.waiting.find((w) => w.job.branch === 'claude/j').reason, /held for claude\/f/);

  // The sweep adopts F. That is the ONLY new fact, and it is enough.
  const adopted = adoptOrphanedLandings(jobs).map((a, i) => merge(`j-070${i}`, { ...a, state: 'waiting' }));
  assert.equal(adopted.length, 1, 'F is put back');
  const released = schedule([...jobs, ...adopted], { hour: NIGHT, freeMemMb: PLENTY, now: NOW });
  const j = released.waiting.find((w) => w.job.branch === 'claude/j');
  assert.ok(
    released.start.some((s) => s.branch === 'claude/j') || /another landing is in flight/.test(j?.reason ?? ''),
    'J is running, or queued behind F - which is turn order, not death',
  );
  assert.ok(!/held for/.test(j?.reason ?? ''), 'and specifically not still held');
});

test('two landings held behind each other do not read as queued to one another', () => {
  // Otherwise both release, both refuse in seconds and both spend their deferrals - the busy-spin
  // the hold replaces. A genuine mutual block waits out its twelve hours and surfaces for a person,
  // which is the right answer: nothing in the queue can break that tie.
  const jobs = [
    held(['claude/p'], 20, { branch: 'claude/j' }),
    merge('j-0601', {
      branch: 'claude/p',
      state: 'waiting',
      orderHold: { blockers: ['claude/j'] },
      blockedSince: NOW - 20 * 60_000,
    }),
  ];
  const { start, waiting } = schedule(jobs, { hour: NIGHT, freeMemMb: PLENTY, now: NOW });
  assert.deepEqual(start, []);
  assert.equal(waiting.filter((w) => /held for/.test(w.reason)).length, 2);
});

test('a landing that was released and is deferring normally does not read as held', () => {
  // `orderHold` is dropped when the job STARTS, and `blockedSince` is what remembers - because the
  // deferral path writes the whole job back to `waiting`, so a stale hold would make an
  // actively-deferring landing look parked. Anything waiting behind THAT branch would then stay
  // parked for a blocker that was in flight the whole time, and burn its twelve hours doing it.
  const releasedAndDeferring = merge('j-0601', {
    branch: 'claude/f', state: 'waiting', deferrals: 2, blockedSince: NOW - 60 * 60_000,
  });
  const jobs = [releasedAndDeferring, held(['claude/f'], 20, { branch: 'claude/j' })];
  const { waiting } = schedule(jobs, { hour: NIGHT, freeMemMb: PLENTY, now: NOW });
  const j = waiting.find((w) => w.job.branch === 'claude/j');
  assert.ok(!/held for/.test(j?.reason ?? ''), `F is coming, so J is not held - got: ${j?.reason}`);
});

test('a landing held on a branch that is RUNNING its own landing is released', () => {
  // A running blocker is doing the thing right now, so waiting behind it pays. This is the ordinary
  // "another landing is in flight" case, reached from a hold.
  const jobs = [
    merge('j-0602', { branch: 'claude/f', state: 'running', startedAt: NOW - 60_000 }),
    held(['claude/f'], 20, { branch: 'claude/j' }),
  ];
  const { waiting } = schedule(jobs, { hour: NIGHT, freeMemMb: PLENTY, now: NOW });
  assert.match(waiting[0].reason, /another landing is in flight/);
});

test('a stale pin still refuses, and always will', () => {
  // A stale pin means the session committed after declaring the work finished, which is the pin
  // doing exactly what it exists for - and no sweep may land work nobody declared. It is a verdict
  // like any other exit-1 refusal, retried never rather than once: the branch is not stuck, it is
  // ahead of its own declaration, and only its session can make a new one.
  const sessionQueued = merge('j-0438', {
    branch: 'claude/d',
    state: 'failed',
    exitCode: 1,
    finishedAt: 100,
    refusal: { kind: 'stale-pin', blockers: [] },
    command: 'node scripts/land-watch.mjs --pr 12 --branch claude/d --expect-sha a878b17',
  });
  assert.equal(retryLandingFor(sessionQueued, { tipOf: () => 'cafe1234' }), null);
  // And a refusal kind is not a skeleton key: an ordinary exit-1 refusal carrying neither kind is
  // still a verdict, whatever else is on the job.
  assert.equal(
    retryLandingFor({ ...sessionQueued, refusal: null }, { tipOf: () => 'a878b17' }),
    null,
    'a red gate or a conflict, exactly as before',
  );
});

test('a hold that ran its twelve hours out is NOT adopted straight back', () => {
  // Otherwise the deadline is decorative: the write-off keeps the order-blocked refusal on the job,
  // the sweep adopts it, `since` restarts, and the branch is parked for another twelve hours
  // having spent its one automatic retry on a job that never runs. `orderHold` is the discriminator
  // - a job carrying one was already held, and only an expired hold gets written off.
  const expired = merge('j-0600', {
    branch: 'claude/j',
    state: 'failed',
    exitCode: null,
    finishedAt: NOW,
    refusal: { kind: 'order-blocked', blockers: ['claude/f'] },
    orderHold: { blockers: ['claude/f'] },
    blockedSince: NOW - 13 * 3_600_000,
    giveUpReason: 'blocked by claude/f for 13h, and no landing was ever queued for it',
  });
  assert.equal(retryLandingFor(expired, { tipOf: () => 'a878b17' }), null);
  assert.deepEqual(adoptOrphanedLandings([expired]), []);
});

test('an ordering block failed by an OLD runner is adopted back, already held', () => {
  // The sweep doing what a hook cannot, again. Parking happens as the process exits, and only in a
  // runner running this code - while the landing that refuses is the copy of auto-merge.mjs in the
  // BRANCH's checkout. So for a fortnight most ordering blocks still die the old way, and the ones
  // already dead are the branches this row was written for.
  const refused = merge('j-0500', {
    branch: 'claude/j',
    state: 'failed',
    exitCode: 1,
    finishedAt: NOW - 60 * 60_000,
    refusal: { kind: 'order-blocked', blockers: ['claude/f'] },
    command: 'node scripts/land-watch.mjs --pr 12 --branch claude/j --expect-sha a878b17',
  });
  const next = retryLandingFor(refused, { tipOf: () => 'a878b17' });
  assert.deepEqual(next.orderHold.blockers, ['claude/f']);
  // The clock runs from when it first refused, not from when the sweep noticed. A branch blocked
  // since last night must surface this morning, not tomorrow morning.
  assert.equal(next.blockedSince, refused.finishedAt);

  // And it costs nothing while it waits: reborn held, it never runs until a blocker moves.
  const revived = merge('j-0800', { ...next, state: 'waiting' });
  const { start, waiting } = schedule([refused, revived], { hour: NIGHT, freeMemMb: PLENTY, now: NOW });
  assert.deepEqual(start, []);
  assert.match(waiting[0].reason, /held for claude\/f/);
});

// ── Re-running a declaration, which is not making one ────────────────────────────────────────────

test('requeue puts back a landing that gave up, at the commit that was declared', () => {
  const dead = merge('j-0445', {
    branch: 'claude/f',
    state: 'timed-out',
    finishedAt: 100,
    capMinutes: 45,
    checkout: '/wt/f',
    command: 'node scripts/land-watch.mjs --pr 31 --branch claude/f --expect-sha a878b17',
  });
  const decision = requeueDecision('claude/f', [dead], { tipOf: () => 'a878b17' });
  assert.equal(decision.action, 'queue');
  assert.equal(decision.job.branch, 'claude/f');
  assert.equal(decision.job.retryOf, 'j-0445');
  assert.equal(decision.job.checkout, '/wt/f');
  // The original command, VERBATIM. That is what makes this a re-run rather than a new
  // declaration: it watches the pull request the declaration opened, and this command cannot name
  // another - it takes a branch name and refuses every flag.
  assert.equal(decision.job.command, dead.command);
  // A fresh automatic budget, because a person put it back rather than the sweep spending its try.
  assert.equal(decision.job.retryCount, 0);
});

test('requeue re-runs the declaration at its own commit, and refuses over any other', () => {
  const dead = merge('j-0445', {
    branch: 'claude/f',
    state: 'failed',
    exitCode: 1,
    finishedAt: 100,
    command: 'node scripts/land-watch.mjs --pr 31 --branch claude/f --expect-sha a878b17',
  });
  assert.match(
    requeueDecision('claude/f', [dead], { tipOf: () => 'a878b17' }).job.command,
    /--expect-sha a878b17/,
  );
  // A branch that moved is the whole safety of this being allowlistable: commits arrived after the
  // work was declared finished, so re-running the old declaration would land something nobody
  // declared. It refuses, and names the command that CAN say the new work is finished.
  const moved = requeueDecision('claude/f', [dead], { tipOf: () => 'cafe1234' });
  assert.equal(moved.action, 'refuse');
  assert.match(moved.message, /nobody declared/);
  assert.match(moved.message, /add-merge claude\/f/);
});

test('requeue refuses every branch it has no declaration to re-run', () => {
  const cases = [
    [[], /No landing was ever queued/],
    [[merge('j-1', { branch: 'claude/f', state: 'waiting' })], /already queued as j-1/],
    [[merge('j-1', { branch: 'claude/f', state: 'done', exitCode: 0, finishedAt: 100 })], /landed as j-1/],
    [[merge('j-1', { branch: 'claude/f', state: 'cancelled', finishedAt: 100 })], /cancelled by a person/],
  ];
  for (const [jobs, expected] of cases) {
    const decision = requeueDecision('claude/f', jobs, { tipOf: () => 'a878b17' });
    assert.equal(decision.action, 'refuse');
    assert.match(decision.message, expected);
  }
  assert.equal(requeueDecision('main', [], {}).action, 'refuse', 'never main');
});

test('a gate that skipped every shard is recovered by asking for a full run, ONCE', () => {
  // Eight landings refused this way in the week to 2026-09-04 and every one of them stopped dead,
  // although the refusal itself names the cure: a `workflow_dispatch` has no push base, so it runs
  // the full suite. The branch was never at fault - its CI was green, it simply gated nothing.
  const gatedNothing = merge('j-0558', {
    branch: 'claude/c',
    state: 'failed',
    exitCode: 1,
    finishedAt: 100,
    refusal: { kind: 'shards-skipped', blockers: [] },
    command: 'node scripts/land-watch.mjs --pr 12 --branch claude/c --expect-sha a878b17',
  });
  const next = retryLandingFor(gatedNothing, { tipOf: () => 'a878b17' });
  assert.ok(next, 'a run that proved nothing is not a verdict on the branch');
  assert.equal(next.recovery.command, 'gh workflow run ci.yml --ref claude/c');
  assert.equal(next.ciDispatched, true, 'the retry remembers it has already been given one');
  assert.match(next.retryReason, /skipped every shard/);
  // The pin is untouched, which is what keeps this a re-run of the session's own declaration.
  assert.equal(next.command, gatedNothing.command);

  // ONCE. A landing that was handed a full run and STILL refused for the same reason has been
  // answered; asking again is the loop the bound exists to stop, so it surfaces for a person.
  assert.equal(
    retryLandingFor({ ...next, id: 'j-0559', state: 'failed', exitCode: 1, finishedAt: 200 }, { tipOf: () => 'a878b17' }),
    null,
    'a second identical refusal escalates rather than dispatching again',
  );
});

test('the refusals a person must decide are never dressed up as something to re-run', () => {
  // The escalation half, and the one that matters most: a dirty tree, a real conflict and a red
  // gate are verdicts. Handing any of them a command would be the queue talking a person out of
  // reading a refusal that is correct.
  for (const kind of ['dirty-tree', 'merge-conflict', 'ci-red', 'order-caution']) {
    const judged = merge('j-0600', {
      branch: 'claude/c', state: 'failed', exitCode: 1, finishedAt: 100, refusal: { kind, blockers: [] },
    });
    assert.equal(retryLandingFor(judged, { tipOf: () => 'a878b17' }), null, `${kind} must not retry`);
    const said = refusalGuidance({ kind }, 'claude/c');
    assert.ok(said, `${kind} must have a sentence of its own`);
    assert.equal(said.recovery, null, `${kind} is a person's call, so it offers no command`);
  }
  // And a kind nothing here knows about - a branch cut before it existed - answers null rather
  // than a guess, which is what leaves the generic sentence in place for it.
  assert.equal(refusalGuidance({ kind: 'something-later' }), null);
  assert.equal(refusalGuidance(null), null);
});

test('a kind is only marked as the queue\'s to recover if the queue really adopts it', () => {
  // The two halves must agree or the banner lies in the expensive direction: a session told the
  // queue will handle a kind nothing adopts waits all night for a retry that is not coming, which
  // is the failure this row set out to end rather than to reproduce one level up.
  const failed = (kind) => merge('j-0610', {
    branch: 'claude/c', state: 'failed', exitCode: 1, finishedAt: 100, refusal: { kind, blockers: ['claude/f'] },
  });
  for (const kind of [
    'order-blocked', 'shards-skipped', 'stale-pin', 'ci-red', 'dirty-tree', 'merge-conflict',
    'order-caution', 'preflight-1', 'main-churn', 'main-fetch', 'push-failed', 'ff-refused',
    'worktree-unavailable', 'no-main-worktree', 'order-no-verdict', 'main-push-failed', 'sha-mismatch',
  ]) {
    const said = refusalGuidance({ kind }, 'claude/c');
    assert.ok(said, `${kind} needs a sentence`);
    if (!said.byQueue) continue;
    assert.ok(
      retryLandingFor(failed(kind), { tipOf: () => 'a878b17' }),
      `${kind} claims the queue recovers it, but the queue does not adopt it`,
    );
  }
  // Stale pin is never the queue's to recover, and its recovery must not name `requeue`: that verb
  // re-runs the declaration the branch has already moved past, so it refuses on the same pin. Only
  // the branch's own session can declare the new commits finished.
  assert.equal(refusalGuidance({ kind: 'stale-pin' }, 'claude/c').byQueue, false);
  assert.match(refusalGuidance({ kind: 'stale-pin' }, 'claude/c').recovery, /queue:merge/);
  assert.doesNotMatch(refusalGuidance({ kind: 'stale-pin' }, 'claude/c').recovery, /requeue/);
});

test('a refusal is addressed to the session that owns the branch', () => {
  // The missing half of "THIS WORKTREE'S BRANCH HAS LANDED". A landing runs in a background
  // runner, so its refusal is printed into a log nobody opens, and the one session that can act
  // on a dirty tree or a conflict was never told. The job record has carried `checkout` all along.
  const jobs = [
    merge('j-0700', {
      branch: 'claude/other', checkout: '/wt/other', state: 'failed', exitCode: 1, finishedAt: 200,
      refusal: { kind: 'dirty-tree', blockers: [] },
    }),
    merge('j-0701', {
      branch: 'claude/mine', checkout: 'C:\\wt\\Mine', state: 'failed', exitCode: 1, finishedAt: 300,
      refusal: { kind: 'shards-skipped', blockers: [] },
    }),
  ];
  // Windows hands the hook a path with backslashes and whatever case the shell used, and the job
  // was written by a different process - so the comparison has to survive both.
  const mine = refusalForWorktree(jobs, 'c:/wt/mine');
  assert.equal(mine.job.id, 'j-0701');
  assert.equal(mine.kind, 'shards-skipped');
  assert.equal(mine.recovery, 'gh workflow run ci.yml --ref claude/mine');
  assert.equal(mine.held, false);

  // Somebody else's refusal is never shown here: it belongs to the session that can act on it.
  assert.equal(refusalForWorktree(jobs, '/wt/nobody'), null);
  assert.equal(refusalForWorktree(jobs, ''), null);
  // Already read once. A banner that repeats every session start stops being read at all.
  assert.equal(refusalForWorktree(jobs, 'c:/wt/mine', { since: 400 }), null);

  // A landing still WAITING has not refused this time round, whatever it did last time - except a
  // held one, which is waiting precisely because it refused and is the state a session most needs
  // to hear about, since nothing will move it until a blocker does.
  const waiting = [merge('j-0702', {
    branch: 'claude/mine', checkout: '/wt/mine', state: 'waiting', enqueuedAt: 500,
    refusal: { kind: 'order-blocked', blockers: ['claude/f'] },
    orderHold: { blockers: ['claude/f'] },
  })];
  assert.equal(refusalForWorktree(waiting, '/wt/mine').held, true);
  assert.equal(
    refusalForWorktree([{ ...waiting[0], orderHold: null }], '/wt/mine'),
    null,
    'a landing simply queued again says nothing',
  );

  // AND A BRANCH THAT WENT ON TO LAND SAYS NOTHING EITHER. This is the flow the whole mechanism is
  // for: refused at 01:00, adopted and landed at 02:00, read at 09:00. Both banners firing would
  // say the branch is on main and then invite the session to re-queue it.
  assert.equal(refusalForWorktree(jobs, 'c:/wt/mine', { landedAt: 400 }), null);
  assert.ok(refusalForWorktree(jobs, 'c:/wt/mine', { landedAt: 200 }), 'a landing BEFORE the refusal settles nothing');
});

test('an ordering block is still a hold, not a dispatch - the recovery it already had', () => {
  // Named because this row added recoveries beside it: the fix for a blocked landing is to WAIT,
  // and a landing given a CI run it does not need would burn a full suite to refuse identically.
  const blocked = merge('j-0601', {
    branch: 'claude/c',
    state: 'failed',
    exitCode: 1,
    finishedAt: 100,
    refusal: { kind: 'order-blocked', blockers: ['claude/f'] },
  });
  const next = retryLandingFor(blocked, { tipOf: () => 'a878b17' });
  assert.ok(next);
  assert.deepEqual(next.orderHold, { blockers: ['claude/f'] });
  assert.equal(next.recovery, undefined, 'a hold asks for nothing to be run');
  assert.equal(next.ciDispatched, undefined);
  assert.equal(refusalGuidance(blocked.refusal, 'claude/c').recovery, null);
});

// ---------------------------------------------------------------------------------------------
// The /check stamp, read by add-merge: a stamp covers a tip when its sha is a prefix of the tip
// (sessions have written 8, 10 and 40 characters), at least seven hex characters, and the
// verdict is a pass. Pinned in both directions.

test('stampGap: a full or abbreviated sha that prefixes the tip with a passing verdict covers it', () => {
  const tip = '012bb5d1aa00bb11cc22dd33ee44ff5566778899';
  assert.equal(stampGap({ reviewedSha: tip, verdict: 'pass' }, tip), null);
  assert.equal(stampGap({ reviewedSha: '012bb5d1', verdict: 'green' }, tip), null);
  assert.equal(stampGap({ reviewedSha: '012BB5D1AA', verdict: 'pass' }, tip), null);
  assert.equal(stampGap({ reviewedSha: '012bb5d1' }, tip), null, 'a stamp with no verdict field is a pass');
});

test('stampGap: names the gap - no stamp, an unresolved tip, a short or wrong sha, a failing verdict', () => {
  const tip = '012bb5d1aa00bb11cc22dd33ee44ff5566778899';
  assert.match(stampGap(null, tip), /no \/check stamp/);
  assert.match(stampGap({ reviewedSha: '012bb5d1' }, null), /tip could not be resolved/);
  assert.match(stampGap({ reviewedSha: '012bb' }, tip), /is not a sha/);
  assert.match(stampGap({ reviewedSha: 'deadbeef' }, tip), /reviewed deadbeef, but the tip is 012bb5d1/);
  assert.match(stampGap({ reviewedSha: '012bb5d1', verdict: 'fail' }, tip), /verdict is "fail", not a pass/);
});

test('readReviewStamp: reads checks/<branch-with-dashes>.json and treats an unreadable one as absent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stamp-'));
  assert.equal(readReviewStamp(dir, 'claude/x'), null);
  const checks = join(dir, 'checks');
  mkdirSync(checks, { recursive: true });
  writeFileSync(join(checks, 'claude-x.json'), JSON.stringify({ v: 1, reviewedSha: 'abc1234', verdict: 'pass' }));
  writeFileSync(join(checks, 'claude-y.json'), 'not json');
  writeFileSync(join(checks, 'claude-z.json'), JSON.stringify({ v: 1 }));
  assert.equal(readReviewStamp(dir, 'claude/x').reviewedSha, 'abc1234');
  assert.equal(readReviewStamp(dir, 'claude/y'), null);
  assert.equal(readReviewStamp(dir, 'claude/z'), null, 'a stamp without reviewedSha proves nothing');
  rmSync(dir, { recursive: true, force: true });
});
