// The candidates evaluator turns the planner's ordered list into one launch pick. What is pinned:
// the table parses into files/specs/size, the pick respects the planner's order, a collision or a
// size that no longer fits is held, a top unit that does not fit falls through to a smaller one,
// and a candidate that needs the machine's one browser slot is held while a running row holds it -
// derived from its specs by default, overridden only by an explicit `yes`/`no`.
import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluate, heldBrowser, needsBrowser, parseCandidates, recordedLetters, runningRows, waveRowHoldsBrowser } from './candidates.mjs';
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

test('when nothing is clear and fitting, there is no pick', () => {
  // 30 min: nothing fits at all.
  const { pick } = evaluate(parseCandidates(TABLE), { entries: [], durations, latency, remainingMin: 30 });
  assert.equal(pick, null);
});

// ── The browser slot: what a candidate needs ─────────────────────────────────────────────────────

test('needsBrowser derives from the specs when the planner said nothing, and fails closed', () => {
  assert.deepEqual(needsBrowser({ specs: ['a.spec.ts'] }), { needs: true, source: 'specs' });
  assert.deepEqual(needsBrowser({ specs: [] }), { needs: false, source: 'specs' });
  // Only `yes` and `no` are the planner's word. A dash or a stray value is not a `no`: a
  // placeholder that read as "no browser" would be the forgotten cell failing open again.
  assert.deepEqual(needsBrowser({ specs: ['a.spec.ts'], browser: '-' }), { needs: true, source: 'specs' });
  assert.deepEqual(needsBrowser({ specs: ['a.spec.ts'], browser: '?' }), { needs: true, source: 'specs' });
  assert.deepEqual(needsBrowser({ specs: ['a.spec.ts'], browser: 'no' }), { needs: false, source: 'column' });
  assert.deepEqual(needsBrowser({ specs: [], browser: 'yes' }), { needs: true, source: 'column' });
  assert.deepEqual(needsBrowser({ specs: [], browser: 'YES' }), { needs: true, source: 'column' });
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

test('a wave-table row holds the browser through its browser column or a MINTS cell naming it', () => {
  assert.equal(waveRowHoldsBrowser({ browser: 'yes', mints: '-' }), true);
  assert.equal(waveRowHoldsBrowser({ browser: 'no', mints: 'the browser slot, the e2e spec registry' }), true);
  assert.equal(waveRowHoldsBrowser({ browser: 'no', mints: 'the build gate' }), false);
  assert.equal(waveRowHoldsBrowser({ browser: '', mints: '' }), false);
});

// ── The browser slot: who holds it ───────────────────────────────────────────────────────────────

const NOW = Date.parse('2026-09-08T21:20:00Z');
const MINUTE = 60_000;
const PLAN = 'C:/store/2026-09-08-night-wave-plan.local.md';

test('runningRows keeps launched, unqueued, unlanded rows the scan still sees, and only this wave\'s', () => {
  const launches = [
    { at: NOW - 60 * MINUTE, letter: 'G', branch: 'claude/g-import-name', size: 'standard', plan: PLAN },
    { at: NOW - 60 * MINUTE, letter: 'K', branch: 'claude/k-allowlist', size: 'small', plan: PLAN },
    { at: NOW - 60 * MINUTE, letter: 'F', branch: 'claude/f-gates', size: 'standard', plan: PLAN },
    { at: NOW - 50 * MINUTE, letter: 'R', branch: 'claude/r-rewound', size: 'small', plan: PLAN },
    { at: NOW - 40 * MINUTE, letter: 'G', branch: 'claude/g-other-wave', size: 'standard', plan: 'C:/store/2026-09-07-night-wave-plan.local.md' },
    { at: NOW - 3 * 24 * 60 * MINUTE, letter: 'G', branch: 'claude/g-stale', size: 'standard', plan: null },
  ];
  const jobs = [{ kind: 'merge', branch: 'claude/k-allowlist', enqueuedAt: NOW - 10 * MINUTE, state: 'done' }];
  const landings = [{ branch: 'claude/f-gates', at: NOW - 5 * MINUTE }];
  const entries = ['claude/g-import-name', 'claude/k-allowlist', 'claude/f-gates', 'claude/g-other-wave', 'claude/g-stale']
    .map((branch) => ({ branch, files: [] }));
  const running = runningRows({ launches, jobs, landings, entries, planPath: PLAN, now: NOW });
  assert.deepEqual(running, [{ letter: 'G', branch: 'claude/g-import-name' }]);
  // K queued, F landed, R's branch is gone from the scan, the 09-07 record names another plan,
  // and the three-day-old record is older than a plan can live. Only G is running.
});

test('a later ledger line for the same branch supersedes the earlier one', () => {
  const launches = [
    { at: NOW - 90 * MINUTE, letter: 'G', branch: 'claude/g-thing', size: 'small', plan: PLAN },
    { at: NOW - 60 * MINUTE, letter: 'G', branch: 'claude/g-thing', size: 'standard', plan: PLAN },
  ];
  const running = runningRows({ launches, jobs: [], landings: [], entries: [{ branch: 'claude/g-thing', files: [] }], planPath: PLAN, now: NOW });
  assert.deepEqual(running, [{ letter: 'G', branch: 'claude/g-thing' }]);
});

const NIGHT_PLAN = `# Night wave - 2026-09-08

Window ends: 2026-09-09T03:30:00Z

## Wave table

| L | goal | START | TOUCHES | MINTS | POOL | browser |
|---|---|---|---|---|---|---|
| F | No gate can report PASS while it measured nothing | now | scripts/gates.mjs | the build gate | opus | no |
| G | Importing under a name a production already uses cannot replace its cue | now | src/model/importTemplate.ts | the browser slot, the e2e spec registry | opus | yes |
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
  const held = heldBrowser({ waveRows: parseWaveTable(NIGHT_PLAN).rows, candidates, running });
  assert.deepEqual(held.holders, [{ letter: 'G', branch: 'claude/g-import-name' }]);
  assert.deepEqual(held.unrecorded, []);

  // 250 min: standard needs 248 and small 118, so L and M would have been LAUNCH on time alone.
  const { pick, results } = evaluate(candidates, { entries: nightEntries, durations, latency, remainingMin: 250, held: { browser: held.holders } });
  const byLetter = Object.fromEntries(results.map((result) => [result.letter, result]));
  assert.equal(byLetter.L.verdict, 'HOLD');
  assert.match(byLetter.L.reason, /needs the browser .*held by G \(claude\/g-import-name\)/);
  assert.equal(byLetter.M.verdict, 'HOLD');
  assert.match(byLetter.M.reason, /held by G/);
  assert.notEqual(pick.letter, 'L');
  assert.notEqual(pick.letter, 'M');
  // O is the closed failure, chosen on purpose: a code-only row covered by e2e specs is held too,
  // and the reason says how the planner overrides it. The pick falls through to P.
  assert.equal(byLetter.O.verdict, 'HOLD');
  assert.match(byLetter.O.reason, /from its specs; a browser column cell of no overrides/);
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
  const held = heldBrowser({ waveRows: parseWaveTable(NIGHT_PLAN).rows, candidates, running });
  // O is running too and derives as a browser row, so it is a holder as well - the closed side.
  assert.deepEqual(held.holders.map((row) => row.letter), ['L', 'O']);
  const entries = [
    { branch: 'claude/l-panel-that-never-grows', files: ['src/render/plate.ts'] },
    { branch: 'claude/o-ticker-speed-field', files: ['src/templates/tickers/shared.ts'] },
  ];
  const { results } = evaluate(candidates, { entries, durations, latency, remainingMin: 250, held: { browser: held.holders } });
  const m = results.find((result) => result.letter === 'M');
  assert.equal(m.verdict, 'HOLD');
  assert.match(m.reason, /held by L \(claude\/l-panel-that-never-grows\), O \(claude\/o-ticker-speed-field\)/);
});

test('with the browser free, a browser candidate launches as before', () => {
  const candidates = parseCandidates(NIGHT_PLAN);
  const { pick } = evaluate(candidates, { entries: nightEntries, durations, latency, remainingMin: 250, held: { browser: [] } });
  assert.equal(pick.letter, 'L');
  assert.equal(evaluate(candidates, { entries: nightEntries, durations, latency, remainingMin: 250 }).pick.letter, 'L');
});

test('a wave-table browser row with no launch record is reported, never silently held or ignored', () => {
  const waveRows = parseWaveTable(NIGHT_PLAN).rows;
  const candidates = parseCandidates(NIGHT_PLAN);
  const held = heldBrowser({ waveRows, candidates, running: [], recorded: new Set() });
  assert.deepEqual(held.holders, []);
  assert.deepEqual(held.unrecorded, ['G']);
  // A browser row that launched and has since queued or landed is recorded, not running, and not
  // a caution: on the real 2026-09-08 plan the first cut of this printed G as unrecorded after it
  // had landed, which is a false alarm in the instrument that exists to remove one.
  const launches = [{ at: NOW - 60 * MINUTE, letter: 'G', branch: 'claude/g-import-name', size: 'standard', plan: PLAN }];
  const recorded = recordedLetters({ launches, planPath: PLAN, now: NOW });
  assert.deepEqual(heldBrowser({ waveRows, candidates, running: [], recorded }), { holders: [], unrecorded: [] });
  // A record from another plan or older than a wave can live does not count as this wave's.
  assert.equal(recordedLetters({ launches: [{ ...launches[0], plan: 'C:/store/other.local.md' }], planPath: PLAN, now: NOW }).size, 0);
  assert.equal(recordedLetters({ launches: [{ ...launches[0], at: NOW - 3 * 24 * 60 * MINUTE, plan: null }], planPath: PLAN, now: NOW }).size, 0);
});

test('a collision is reported before the slot, and the slot before the window', () => {
  // The reasons are ordered by how hard the fact is: a real diff beats a slot beats the clock.
  const candidates = parseCandidates(NIGHT_PLAN);
  const held = { browser: [{ letter: 'G', branch: 'claude/g-import-name' }] };
  const colliding = [{ branch: 'claude/g-import-name', files: ['src/render'] }];
  const { results } = evaluate(candidates, { entries: colliding, durations, latency, remainingMin: 250, held });
  assert.match(results.find((result) => result.letter === 'L').reason, /^collides with/);
  const short = evaluate(candidates, { entries: nightEntries, durations, latency, remainingMin: 100, held });
  assert.match(short.results.find((result) => result.letter === 'M').reason, /^needs the browser/);
});
