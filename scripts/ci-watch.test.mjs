// The CI watch is the Monitor contract applied to GitHub: one line per red run, once per run id,
// nothing on a quiet poll, a cancelled run is not a verdict, reds already old at arming are
// history, main turning green after a red is an event, and a failed poll speaks up once.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_EVERY_SECONDS,
  REVIEWED_ONLY,
  baseline,
  describeRun,
  errorLines,
  fetchPr,
  parseArgs,
  queuedFromPr,
  redLine,
  step,
} from './ci-watch.mjs';

const T0 = Date.parse('2026-09-05T20:00:00Z');
const minutes = (n) => new Date(T0 - n * 60_000).toISOString();

function run(id, over = {}) {
  return {
    databaseId: id,
    status: 'completed',
    conclusion: 'success',
    headBranch: 'claude/x',
    headSha: `${id}abcdef0123456789`,
    name: 'CI',
    workflowName: 'CI',
    url: `https://github.com/o/r/actions/runs/${id}`,
    createdAt: minutes(5),
    updatedAt: minutes(1),
    ...over,
  };
}

test('parseArgs defaults and refuses a too-fast interval', () => {
  assert.equal(parseArgs([]).every, DEFAULT_EVERY_SECONDS);
  assert.equal(parseArgs(['--every', '120', '--since', '0', '--limit', '10']).limit, 10);
  assert.throws(() => parseArgs(['--every', '5']), /at least 30 seconds/);
  assert.throws(() => parseArgs(['--limit', '500']), /between 1 and 100/);
  assert.throws(() => parseArgs(['--nonsense']), /unknown argument/);
});

test('the baseline treats reds older than --since as history, and recent reds as events', () => {
  const runs = [run(3, { conclusion: 'failure', updatedAt: minutes(2) }), run(2, { conclusion: 'failure', updatedAt: minutes(120) }), run(1)];
  const state = baseline(runs, { now: T0, sinceMs: 60 * 60_000 });
  const { lines } = step(state, runs);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^CI RED - CI on claude\/x \(3abcdef0\) - open the run - https:/);
});

test('a red run prints once per id, a cancelled run never, a quiet poll nothing', () => {
  const state = baseline([run(1)], { now: T0 });
  const red = run(2, { conclusion: 'failure', headBranch: 'main' });
  const cancelled = run(3, { conclusion: 'cancelled' });
  const first = step(state, [cancelled, red, run(1)], { describe: () => 'e2e/anim-engine.spec.ts' });
  assert.deepEqual(first.lines, [redLine(red, 'e2e/anim-engine.spec.ts')]);
  const again = step(first.state, [cancelled, red, run(1)]);
  assert.deepEqual(again.lines, []);
});

test('an in-flight run is not a verdict until it completes', () => {
  const state = baseline([], { now: T0 });
  const running = run(4, { status: 'in_progress', conclusion: '' });
  assert.deepEqual(step(state, [running]).lines, []);
  const failed = { ...running, status: 'completed', conclusion: 'timed_out' };
  assert.equal(step(state, [failed]).lines.length, 1);
});

test('main turning green after a red is an event; green after green is not', () => {
  const red = run(5, { conclusion: 'failure', headBranch: 'main' });
  const state = baseline([red], { now: T0, sinceMs: 0 });
  assert.equal(state.mainVerdict.get('CI').verdict, 'red');
  const green = run(6, { headBranch: 'main' });
  const flip = step(state, [green, red]);
  assert.deepEqual(flip.lines, ['CI GREEN - main is green again on CI (6abcdef0) - https://github.com/o/r/actions/runs/6']);
  assert.deepEqual(step(flip.state, [run(7, { headBranch: 'main' }), green, red]).lines, []);
});

test('a cancelled main run does not hide the last real verdict', () => {
  const red = run(8, { conclusion: 'failure', headBranch: 'main' });
  const state = baseline([red], { now: T0, sinceMs: 0 });
  const cancelled = run(9, { conclusion: 'cancelled', headBranch: 'main' });
  const next = step(state, [cancelled, red]);
  assert.deepEqual(next.lines, []);
  assert.equal(next.state.mainVerdict.get('CI').verdict, 'red');
});

test('a re-run red main run is still red until a run at least as new answers', () => {
  const red = run(10, { conclusion: 'failure', headBranch: 'main', createdAt: minutes(10) });
  const olderGreen = run(9, { headBranch: 'main', createdAt: minutes(40) });
  const state = baseline([red, olderGreen], { now: T0, sinceMs: 0 });
  // The re-run: same id, back in flight. The newest VERDICT is now the older green.
  const rerunning = { ...red, status: 'in_progress', conclusion: '' };
  const during = step(state, [rerunning, olderGreen]);
  assert.deepEqual(during.lines, []);
  assert.equal(during.state.mainVerdict.get('CI').verdict, 'red');
  // The re-run passes: same id, same createdAt, now a green verdict.
  const passed = { ...red, conclusion: 'success' };
  const after = step(during.state, [passed, olderGreen]);
  assert.deepEqual(after.lines, ['CI GREEN - main is green again on CI (10abcdef) - https://github.com/o/r/actions/runs/10']);
});

test('a Reviewed-only red says which of the two shapes it is, and never disappears', () => {
  const queued = describeRun({ items: [REVIEWED_ONLY] }, true);
  const loose = describeRun({ items: [REVIEWED_ONLY] }, false);
  const unknown = describeRun({ items: [REVIEWED_ONLY] }, null);
  assert.match(queued, /IS queued.*runs \/check and queues again/);
  assert.match(loose, /never queued.*stopped after opening it/);
  assert.match(unknown, /open the pull request/);
  // Three different sentences, and every one of them still produces a line: the 2026-09-08
  // measurement was that all three Reviewed reds of that night were true.
  assert.equal(new Set([queued, loose, unknown]).size, 3);
  for (const what of [queued, loose, unknown]) {
    assert.match(redLine(run(1, { conclusion: 'failure' }), what), /^CI RED - /);
  }
});

test('a set with anything besides Reviewed is described by its members as before', () => {
  assert.equal(describeRun({ items: ['e2e/ai.spec.ts'] }, false), 'e2e/ai.spec.ts');
  assert.equal(describeRun({ items: [REVIEWED_ONLY, 'e2e/ai.spec.ts'] }, false), `${REVIEWED_ONLY}, e2e/ai.spec.ts`);
  assert.equal(describeRun({ items: [] }, null), null);
  assert.equal(describeRun(null, null), null);
});

test('a pull request is queued when auto-merge is on or the land label is present', () => {
  assert.equal(queuedFromPr({ autoMergeRequest: { enabledAt: 'now' }, labels: [] }), true);
  assert.equal(queuedFromPr({ autoMergeRequest: null, labels: [{ name: 'land' }] }), true);
  assert.equal(queuedFromPr({ autoMergeRequest: null, labels: [{ name: 'docs' }] }), false);
  assert.equal(queuedFromPr({ autoMergeRequest: null }), false);
  // No answer stays no answer - it must never harden into one of the two definite sentences.
  assert.equal(queuedFromPr(null), null);
  assert.equal(describeRun({ items: [REVIEWED_ONLY] }, queuedFromPr(null)), describeRun({ items: [REVIEWED_ONLY] }, null));
});

test('fetchPr answers null when gh fails, prints nothing usable, or there is no branch', () => {
  assert.equal(fetchPr(''), null);
  assert.equal(fetchPr('claude/x', { run: () => ({ status: 1, stdout: '' }) }), null);
  assert.equal(fetchPr('claude/x', { run: () => ({ status: 0, stdout: 'not json' }) }), null);
  assert.equal(fetchPr('claude/x', { run: () => ({ status: 0, stdout: '[]' }) }), null);
  assert.deepEqual(fetchPr('claude/x', { run: () => ({ status: 0, stdout: '[{"labels":[]}]' }) }), { labels: [] });
});

test('fetchPr asks for OPEN pull requests by head branch, never `pr view`', () => {
  // `pr view` answers with a MERGED pull request when a branch has no open one, and the `land`
  // label outlives the landing - so the state filter is what stops "it cannot land" being printed
  // about a pull request that already did.
  let argv = null;
  fetchPr('claude/x', { run: (_cmd, args) => { argv = args; return { status: 0, stdout: '[]' }; } });
  assert.equal(argv[1], 'list');
  assert.deepEqual(argv.slice(2, 8), ['--head', 'claude/x', '--base', 'main', '--state', 'open']);
});

test('a failed poll prints WATCH ERROR once until gh recovers, then RECOVERED once', () => {
  assert.deepEqual(errorLines({ ok: false, error: 'gh: not logged in' }, null), ['WATCH ERROR - gh run list failed: gh: not logged in']);
  assert.deepEqual(errorLines({ ok: false, error: 'gh: not logged in' }, 'gh: not logged in'), []);
  assert.deepEqual(errorLines({ ok: true, runs: [] }, 'gh: not logged in'), ['WATCH RECOVERED - gh answers again']);
  assert.deepEqual(errorLines({ ok: true, runs: [] }, null), []);
});
