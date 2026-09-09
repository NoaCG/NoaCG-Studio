// The candidates evaluator turns the planner's ordered list into one launch pick. What is pinned:
// the table parses into files/specs/size, the pick respects the planner's order, a collision or a
// size that no longer fits is held, a top unit that does not fit falls through to a smaller one,
// a candidate already in the launch ledger is never picked again, and a candidate that needs the
// machine's one browser slot is held while a running row holds it - derived from its specs by
// default, overridden only by an explicit yes or no.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  belongsToWave, evaluate, heldBrowser, holdLine, needsBrowser, parseCandidates, runningRows, unrecordedBrowserRows,
  waveRowHoldsBrowser, waveSpan,
} from './candidates.mjs';
import { parseWaveTable } from './wave-plan-check.mjs';

const TABLE = `# Wave plan

Window ends: 2026-09-05T07:00:00+03:00

## Candidates

| L | size | serves | TOUCHES | SPECS | goal |
|---|---|---|---|---|---|
| M | standard | NOW | src/big.ts, src/big2.ts | big.spec.ts | the big one |
| N | small | P6 | src/small.ts | - | the small one |
| P | small | NOW | src/other.ts | e2e/other.spec.ts | another small |
`;

test('parseCandidates reads letter, size, serves, files and specs from the table', () => {
  const rows = parseCandidates(TABLE);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { letter: 'M', size: 'standard', serves: 'NOW', files: ['src/big.ts', 'src/big2.ts'], specs: ['big.spec.ts'], goal: 'the big one', browser: '' });
  assert.deepEqual(rows[1].files, ['src/small.ts']);
  assert.deepEqual(rows[1].specs, []); // the "-" cell is empty
  assert.deepEqual(rows[2].specs, ['other.spec.ts']); // the e2e/ prefix is stripped
});

test('a bold or backticked letter cell still reads as its letter', () => {
  const rows = parseCandidates('## Candidates\n\n| L | size | TOUCHES | SPECS | goal |\n|---|---|---|---|---|\n| **Q** | small | `src/q.ts` | - | q |\n');
  assert.equal(rows[0].letter, 'Q');
  assert.deepEqual(rows[0].files, ['src/q.ts']);
});

test('no Candidates section parses to nothing', () => {
  assert.deepEqual(parseCandidates('# Plan\n\nno table here\n'), []);
});

const durations = { small: { n: 6, p90: 70 }, standard: { n: 6, p90: 200 }, large: { n: 0, p90: null } };
const latency = { gate: { n: 10, p90: 12 }, wait: { n: 10, p90: 6 } };

test('with room for everything the pick is the first candidate in the planner\'s order', () => {
  const { pick } = evaluate(parseCandidates(TABLE), { entries: [], durations, latency, remainingMin: 300 });
  assert.equal(pick.letter, 'M'); // standard needs 200+12+6+30=248 <= 300
});

test('a top unit that no longer fits falls through to a smaller one that does', () => {
  // 150 min: standard needs 248 (no), small needs 70+12+6+30=118 (yes).
  const { pick, results } = evaluate(parseCandidates(TABLE), { entries: [], durations, latency, remainingMin: 150 });
  assert.equal(results[0].verdict, 'HOLD');
  assert.equal(results[0].heldOn, 'window');
  assert.match(results[0].reason, /no longer fits/);
  assert.equal(pick.letter, 'N'); // the first small one in order
});

test('a candidate that collides with a running row is held', () => {
  // A running row is editing src/big.ts, so M collides; N and P are disjoint, N is first and fits.
  const entries = [{ branch: 'claude/x', files: ['src/big.ts'] }];
  const { pick, results } = evaluate(parseCandidates(TABLE), { entries, durations, latency, remainingMin: 300 });
  assert.equal(results[0].verdict, 'HOLD');
  assert.match(results[0].reason, /collides with claude\/x/);
  assert.equal(pick.letter, 'N');
});

test('when nothing is clear and fitting, there is no pick, and the closing line names the window', () => {
  // 30 min: nothing fits at all.
  const { pick, results } = evaluate(parseCandidates(TABLE), { entries: [], durations, latency, remainingMin: 30 });
  assert.equal(pick, null);
  assert.match(holdLine(results, []), /fits the window/);
});

// ── The ledger is the loop's memory ──────────────────────────────────────────────────────────────

const NOW = Date.parse('2026-09-08T21:20:00Z');
const MINUTE = 60_000;

test('a candidate already in the launch ledger is held as launched, and the pick moves on', () => {
  // 2026-09-05: W was launched and recorded at 11:39Z, and the very next pick printed LAUNCH W;
  // an hour later, on another freed slot, LAUNCH W again. Its branch had no diff yet, so no
  // collision - the ledger is the only thing that knows.
  const launched = new Map([['M', { branch: 'claude/m-the-big-one', at: NOW - 3 * MINUTE }]]);
  const { pick, results } = evaluate(parseCandidates(TABLE), { entries: [], durations, latency, remainingMin: 300, launched });
  assert.equal(results[0].verdict, 'HOLD');
  assert.equal(results[0].heldOn, 'launched');
  assert.match(results[0].reason, /already launched as claude\/m-the-big-one at 21:17Z/);
  assert.equal(pick.letter, 'N');
});

// ── The browser slot: what a candidate needs ─────────────────────────────────────────────────────

test('needsBrowser derives from the specs when the planner said nothing, and fails closed', () => {
  assert.deepEqual(needsBrowser({ specs: ['a.spec.ts'] }), { needs: true, source: 'specs' });
  assert.deepEqual(needsBrowser({ specs: [] }), { needs: false, source: 'specs' });
  // Only a cell starting with yes or no is the planner's word. A dash or a stray value is not a
  // `no`: a placeholder that read as "no browser" would be the forgotten cell failing open again.
  assert.deepEqual(needsBrowser({ specs: ['a.spec.ts'], browser: '-' }), { needs: true, source: 'specs' });
  assert.deepEqual(needsBrowser({ specs: ['a.spec.ts'], browser: '?' }), { needs: true, source: 'specs' });
  assert.deepEqual(needsBrowser({ specs: ['a.spec.ts'], browser: 'not sure' }), { needs: true, source: 'specs' });
  assert.deepEqual(needsBrowser({ specs: ['a.spec.ts'], browser: 'no' }), { needs: false, source: 'column' });
  assert.deepEqual(needsBrowser({ specs: [], browser: 'yes' }), { needs: true, source: 'column' });
  assert.deepEqual(needsBrowser({ specs: [], browser: 'YES' }), { needs: true, source: 'column' });
  assert.deepEqual(needsBrowser({ specs: [], browser: 'yes - drives the running app' }), { needs: true, source: 'column' });
  assert.deepEqual(needsBrowser({ specs: ['a.spec.ts'], browser: 'no, queued form only' }), { needs: false, source: 'column' });
  assert.deepEqual(needsBrowser({ specs: [], browser: '`yes`' }), { needs: true, source: 'column' });
});

test('the optional browser column parses, and its absence reads as empty rather than as no', () => {
  const withColumn = parseCandidates(`## Candidates

| L | size | serves | TOUCHES | SPECS | browser | goal |
|---|---|---|---|---|---|---|
| O | small | NOW | src/t.ts | e2e/anim.spec.ts | no | a code-only row |
| Q | small | NOW | src/u.ts | - | yes | a bench that drives the browser |
`);
  assert.equal(withColumn[0].browser, 'no');
  assert.equal(needsBrowser(withColumn[0]).needs, false);
  assert.equal(withColumn[1].browser, 'yes');
  assert.equal(needsBrowser(withColumn[1]).needs, true);
  assert.equal(parseCandidates(TABLE)[0].browser, '');
});

test('a wave-table row holds the browser through its browser column or a MINTS token naming the slot', () => {
  assert.equal(waveRowHoldsBrowser({ browser: 'yes', mints: '-' }), true);
  assert.equal(waveRowHoldsBrowser({ browser: '`yes`', mints: '-' }), true);
  assert.equal(waveRowHoldsBrowser({ browser: 'no', mints: 'the browser slot, the e2e spec registry' }), true);
  assert.equal(waveRowHoldsBrowser({ browser: 'no', mints: 'browser' }), true);
  assert.equal(waveRowHoldsBrowser({ browser: 'no', mints: 'the build gate' }), false);
  // A whole token, never a substring: a path or a note that mentions the browser mints nothing.
  assert.equal(waveRowHoldsBrowser({ browser: 'no', mints: 'docs/browser-support.md' }), false);
  assert.equal(waveRowHoldsBrowser({ browser: 'no', mints: 'the e2e registry (not the browser)' }), false);
  assert.equal(waveRowHoldsBrowser({ browser: '', mints: '' }), false);
});

// ── Which wave a ledger line belongs to ──────────────────────────────────────────────────────────

const PLAN = 'C:\\claude\\NoaCG-Studio\\.git\\noacg-jobs\\wave-plans\\2026-09-08-night-wave-plan.local.md';
const PLAN_TEXT = 'Window ends: 2026-09-09T03:30:00Z\n';

test('waveSpan reads the plan\'s name, the local midnight of its date and its window end', () => {
  const span = waveSpan(PLAN, PLAN_TEXT);
  assert.equal(span.name, '2026-09-08-night-wave-plan.local.md');
  assert.equal(span.startMs, Date.parse('2026-09-08T00:00:00'));
  assert.equal(span.endMs, Date.parse('2026-09-09T03:30:00Z'));
  assert.equal(waveSpan('C:/x/undated-plan.local.md', 'nothing').startMs, null);
  assert.equal(waveSpan('C:/x/undated-plan.local.md', 'nothing').endMs, null);
});

test('a record naming a plan matches by file name, so a typed path in another spelling still counts', () => {
  // The ledger writes the store's absolute path; the operator types whatever the shell had. On
  // Windows those differ in drive-letter case and slash direction (path.resolve keeps the case,
  // measured), and a mismatch empties the running set - the open failure, silently.
  const record = { at: NOW - 60 * MINUTE, plan: PLAN };
  const typed = waveSpan('c:/claude/noacg-studio/.git/noacg-jobs/wave-plans/2026-09-08-night-wave-plan.local.md', PLAN_TEXT);
  assert.equal(belongsToWave(record, typed, { now: NOW }), true);
  assert.equal(belongsToWave(record, waveSpan('C:/store/2026-09-07-night-wave-plan.local.md', PLAN_TEXT), { now: NOW }), false);
  // A joined row carries launchedAt rather than at, and is read the same way.
  assert.equal(belongsToWave({ launchedAt: NOW - 60 * MINUTE, plan: PLAN }, typed, { now: NOW }), true);
});

test('a record with no plan (every line before 2026-09-09) matches by the wave\'s window', () => {
  const span = waveSpan(PLAN, PLAN_TEXT);
  assert.equal(belongsToWave({ at: NOW - 60 * MINUTE, plan: null }, span, { now: NOW }), true);
  // Last night's letters recur tonight: a record from the previous evening is before this plan's
  // day began, and one after the window closed is the next wave's.
  assert.equal(belongsToWave({ at: Date.parse('2026-09-07T22:00:00'), plan: null }, span, { now: NOW }), false);
  assert.equal(belongsToWave({ at: Date.parse('2026-09-09T05:00:00Z'), plan: null }, span, { now: NOW }), false);
  // No date in the name and no window: two plan lifetimes back from now is the only bound left.
  const undated = waveSpan('C:/x/plan.local.md', '');
  assert.equal(belongsToWave({ at: NOW - 3 * 24 * 60 * MINUTE, plan: null }, undated, { now: NOW }), false);
  assert.equal(belongsToWave({ at: NOW - 60 * MINUTE, plan: null }, undated, { now: NOW }), true);
});

// ── The browser slot: who holds it ───────────────────────────────────────────────────────────────

const launch = (letter, branch, over = {}) => ({ letter, branch, launchedAt: NOW - 60 * MINUTE, toQueueMin: null, toLandMin: null, plan: PLAN, ...over });

test('runningRows keeps launched rows whose branch exists and that are neither landed nor in the queue', () => {
  const launches = [
    launch('G', 'claude/g-import-name'),
    launch('K', 'claude/k-allowlist', { toQueueMin: 50 }),
    launch('F', 'claude/f-gates', { toQueueMin: 40, toLandMin: 55 }),
    launch('R', 'claude/r-rewound'),
    launch('V', 'claude/v-gave-up', { toQueueMin: 30 }),
    launch('W', 'claude/w-withdrawn', { toQueueMin: 30 }),
  ];
  const jobs = [
    { kind: 'merge', branch: 'claude/k-allowlist', enqueuedAt: NOW - 10 * MINUTE, state: 'running' },
    { kind: 'merge', branch: 'claude/f-gates', enqueuedAt: NOW - 20 * MINUTE, state: 'done', finishedAt: NOW - 5 * MINUTE, exitCode: 0 },
    { kind: 'merge', branch: 'claude/v-gave-up', enqueuedAt: NOW - 30 * MINUTE, state: 'failed', finishedAt: NOW - 25 * MINUTE, exitCode: 1 },
    { kind: 'merge', branch: 'claude/w-withdrawn', enqueuedAt: NOW - 30 * MINUTE, state: 'cancelled', finishedAt: NOW - 25 * MINUTE },
    // A landing of the same branch name from an earlier wave, before this launch: not this row's.
    { kind: 'merge', branch: 'claude/g-import-name', enqueuedAt: NOW - 3 * 24 * 60 * MINUTE, state: 'done', finishedAt: NOW - 3 * 24 * 60 * MINUTE, exitCode: 0 },
  ];
  const branches = new Set(['claude/g-import-name', 'claude/k-allowlist', 'claude/f-gates', 'claude/v-gave-up', 'claude/w-withdrawn']);
  const running = runningRows({ launches, jobs, branches });
  // K is in the queue, F landed, R's branch is gone. V's landing gave up and W's was withdrawn:
  // those sessions may be back at work, so both still run - the closed direction.
  assert.deepEqual(running.map((row) => row.letter), ['G', 'V', 'W']);
  assert.deepEqual(running[0], { letter: 'G', branch: 'claude/g-import-name', at: NOW - 60 * MINUTE });
});

test('a freshly launched row with no diff yet is running: existence is the test, not activity', () => {
  // Launch L at 23:10, a slot frees at 23:12, L has no commit and no edit - it is still the row
  // driving the browser, and the bad picks happened in exactly these minutes.
  const running = runningRows({ launches: [launch('L', 'claude/l-plate', { launchedAt: NOW - 2 * MINUTE })], jobs: [], branches: new Set(['claude/l-plate']) });
  assert.deepEqual(running.map((row) => row.letter), ['L']);
});

const NIGHT_PLAN = `# Night wave - 2026-09-08

Window ends: 2026-09-09T03:30:00Z

## Wave table

| L | goal | START | TOUCHES | MINTS | POOL | browser |
|---|---|---|---|---|---|---|
| F | No gate can report PASS while it measured nothing | now | scripts/gates.mjs | the build gate | opus | no |
| G | Importing under a name a production already uses cannot replace its cue | now | src/model/importTemplate.ts | the browser slot, the e2e spec registry | opus | yes |
| J | Squash or merge for landing | on slot free | scripts/landing-ruleset.mjs | the landing ruleset | opus | yes |
| K | A mechanical git operation stops no autonomous row again | now | .claude/settings.json | the allowlist | opus | no |

## Candidates

| L | size | serves | TOUCHES | SPECS | goal |
|---|---|---|---|---|---|
| L | standard | NOW | src/templates, src/render | e2e/import-svg-behaviour.spec.ts | Both modes that promise a taller panel make the plate taller |
| M | standard | playout-lag | src/output, src/app | e2e/production-controls.spec.ts | Take and Out answer at once when the queue is being worked |
| N | large | shrinking-mechanism | contracts/rules, contracts/records | - | Phase 2b's next contract area |
| O | small | scrolling-speed | src/templates/tickers/shared.ts | e2e/anim-engine.spec.ts, e2e/catalog-baseline.spec.ts | Every ticker design emits the operator speed field |
| P | small | NOW | docs/handoffs, docs/backlog | - | Tonight's spent handoffs deleted |
`;

const nightEntries = [
  { branch: 'claude/g-import-name', files: ['src/model/importTemplate.ts'] },
  { branch: 'claude/f-gates', files: ['scripts/gates.mjs'] },
  { branch: 'claude/k-allowlist', files: ['.claude/settings.json'] },
];

test('the four bad picks of 2026-09-08: a browser candidate is held while a planned row holds the browser', () => {
  // The night's shape: G is a wave-table browser row and running; L and M are candidates whose
  // specs are e2e specs. The instrument said LAUNCH M, then LAUNCH L, for four refills in a row.
  const candidates = parseCandidates(NIGHT_PLAN);
  const running = [{ letter: 'G', branch: 'claude/g-import-name' }, { letter: 'F', branch: 'claude/f-gates' }, { letter: 'K', branch: 'claude/k-allowlist' }];
  const holders = heldBrowser({ waveRows: parseWaveTable(NIGHT_PLAN).rows, candidates, running });
  assert.deepEqual(holders, [{ letter: 'G', branch: 'claude/g-import-name' }]);

  // 250 min: standard needs 248 and small 118, so L and M would have been LAUNCH on time alone.
  const { pick, results } = evaluate(candidates, { entries: nightEntries, durations, latency, remainingMin: 250, held: { browser: holders } });
  const byLetter = Object.fromEntries(results.map((result) => [result.letter, result]));
  assert.equal(byLetter.L.verdict, 'HOLD');
  assert.equal(byLetter.L.heldOn, 'browser');
  assert.match(byLetter.L.reason, /needs the browser .*held by G \(claude\/g-import-name\); fits once it frees/);
  assert.equal(byLetter.M.verdict, 'HOLD');
  assert.match(byLetter.M.reason, /held by G/);
  assert.notEqual(pick.letter, 'L');
  assert.notEqual(pick.letter, 'M');
  // O is the closed failure, chosen on purpose: a code-only row covered by e2e specs is held too,
  // and the reason says how the planner overrides it. The pick falls through to P.
  assert.equal(byLetter.O.verdict, 'HOLD');
  assert.match(byLetter.O.reason, /from its specs; a browser cell of no overrides/);
  assert.equal(pick.letter, 'P');
});

test('the planner\'s explicit no releases a specs-derived hold, and the pick moves up', () => {
  const plan = `## Candidates

| L | size | serves | TOUCHES | SPECS | browser | goal |
|---|---|---|---|---|---|---|
| L | standard | NOW | src/templates, src/render | e2e/import-svg-behaviour.spec.ts |  | the plate |
| M | standard | playout-lag | src/output, src/app | e2e/production-controls.spec.ts | - | Take and Out |
| N | large | shrinking-mechanism | contracts/rules | - |  | Phase 2b |
| O | small | scrolling-speed | src/templates/tickers/shared.ts | e2e/anim-engine.spec.ts | no | the speed field |
| P | small | NOW | docs/handoffs | - |  | the drain |
`;
  const candidates = parseCandidates(plan);
  assert.equal(candidates.find((row) => row.letter === 'O').browser, 'no');
  assert.equal(candidates.find((row) => row.letter === 'L').browser, '');
  const held = { browser: [{ letter: 'G', branch: 'claude/g-import-name' }] };
  const { pick, results } = evaluate(candidates, { entries: nightEntries, durations, latency, remainingMin: 250, held });
  assert.equal(results.find((result) => result.letter === 'L').verdict, 'HOLD'); // an empty cell still derives
  assert.equal(pick.letter, 'O');
});

test('the third bad pick: a candidate launched into the slot holds it, by the same rule', () => {
  // Later that night G had landed, L had been launched into the freed slot, and the instrument said
  // LAUNCH M again. L is not in the wave table; its need is derived from its own candidate row.
  const candidates = parseCandidates(NIGHT_PLAN);
  const running = [{ letter: 'L', branch: 'claude/l-panel-that-never-grows' }, { letter: 'O', branch: 'claude/o-ticker-speed-field' }];
  const holders = heldBrowser({ waveRows: parseWaveTable(NIGHT_PLAN).rows, candidates, running });
  // O is running too and derives as a browser row, so it is a holder as well - the closed side.
  assert.deepEqual(holders.map((row) => row.letter), ['L', 'O']);
  const entries = [
    { branch: 'claude/l-panel-that-never-grows', files: ['src/render/plate.ts'] },
    { branch: 'claude/o-ticker-speed-field', files: ['src/templates/tickers/shared.ts'] },
  ];
  const launched = new Map(running.map((row) => [row.letter, { branch: row.branch, at: NOW - 30 * MINUTE }]));
  const { pick, results } = evaluate(candidates, { entries, durations, latency, remainingMin: 250, held: { browser: holders }, launched });
  const m = results.find((result) => result.letter === 'M');
  assert.equal(m.verdict, 'HOLD');
  assert.match(m.reason, /held by L \(claude\/l-panel-that-never-grows\), O \(claude\/o-ticker-speed-field\)/);
  // And L and O themselves are held as launched - never LAUNCH L again into its own slot.
  assert.equal(results.find((result) => result.letter === 'L').heldOn, 'launched');
  assert.equal(results.find((result) => result.letter === 'O').heldOn, 'launched');
  assert.equal(pick.letter, 'P');
});

test('with the browser free, a browser candidate launches as before', () => {
  const candidates = parseCandidates(NIGHT_PLAN);
  const { pick } = evaluate(candidates, { entries: nightEntries, durations, latency, remainingMin: 250, held: { browser: [] } });
  assert.equal(pick.letter, 'L');
  assert.equal(evaluate(candidates, { entries: nightEntries, durations, latency, remainingMin: 250 }).pick.letter, 'L');
});

test('a wave-table browser row due now with no launch record is reported, never silently held or ignored', () => {
  const waveRows = parseWaveTable(NIGHT_PLAN).rows;
  // G is due now and unrecorded: a caution. J also drives the browser but waits on a slot, so it is
  // not due and not a caution - a line that fires every tick for a row legitimately not started is
  // the line the reader learns to skip.
  assert.deepEqual(unrecordedBrowserRows({ waveRows, recorded: new Set() }), ['G']);
  // A browser row that launched and has since queued or landed is recorded and not a caution: on
  // the real 2026-09-08 plan the first cut of this printed G as unrecorded after it had landed.
  assert.deepEqual(unrecordedBrowserRows({ waveRows, recorded: new Set(['G']) }), []);
  assert.deepEqual(heldBrowser({ waveRows, candidates: parseCandidates(NIGHT_PLAN), running: [] }), []);
});

test('the closing line names the slot when the slot is why, so the loop does not read it as the horizon', () => {
  const candidates = parseCandidates(NIGHT_PLAN);
  const holders = [{ letter: 'G', branch: 'claude/g-import-name' }];
  // 200 min: N (large) and standard do not fit; O and P... give P a collision so nothing launches.
  const entries = [...nightEntries, { branch: 'claude/p-drain', files: ['docs/handoffs'] }];
  const { pick, results } = evaluate(candidates, { entries, durations, latency, remainingMin: 200, held: { browser: holders } });
  assert.equal(pick, null);
  const line = holdLine(results, holders);
  assert.match(line, /^Hold - L, M, O wait on the browser slot held by G;/);
  assert.match(line, /Re-check when it frees/);
  assert.doesNotMatch(line, /fits the window/);
});

test('a collision is reported before the slot, and the slot before the window', () => {
  // The reasons are ordered by how hard the fact is: a real diff beats a slot beats the clock.
  const candidates = parseCandidates(NIGHT_PLAN);
  const held = { browser: [{ letter: 'G', branch: 'claude/g-import-name' }] };
  const colliding = [{ branch: 'claude/g-import-name', files: ['src/render'] }];
  const { results } = evaluate(candidates, { entries: colliding, durations, latency, remainingMin: 250, held });
  assert.match(results.find((result) => result.letter === 'L').reason, /^collides with/);
  const short = evaluate(candidates, { entries: nightEntries, durations, latency, remainingMin: 100, held });
  const m = short.results.find((result) => result.letter === 'M');
  assert.equal(m.heldOn, 'browser');
  assert.match(m.reason, /^needs the browser.*; a standard unit no longer fits/);
});
