// The wave plan check's guard: a plan in the contract's shape passes, and each shape the contract
// forbids produces its own named problem - a missing pool, a duplicate mint, a path that does not
// exist, a prompt that does not end on QUEUE, an unclassified handoff, an unmentioned owner ask.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  browserWord, checkPlan, economyNotes, mintsOf, parsePromptBlocks, parseWaveTable, pathProbe, promptPathProblems, tableUnder,
  touchProblems,
} from './wave-plan-check.mjs';

const NOW = Date.parse('2026-09-02T12:00:00');
const FILES = new Set(['src/a.ts', 'src/b.ts', 'scripts/x.mjs', 'docs/SVG_AUTHORING.md', 'src/components/wizard', 'e2e/import.spec.ts']);
const exists = (relative) => FILES.has(relative);

const GOOD = `# Wave plan - 2026-09-02 night wave

Pools at plan time: Codex weekly 64% (snapshot 07:33), agy pools available, Opus ample.

## Wave table

| L | goal | START | TOUCHES | MINTS | POOL | browser |
|---|---|---|---|---|---|---|
| A | thing one | now | src/a.ts, e2e/import.spec.ts | scripts/e2e-lists.mjs (new) | opus | yes |
| B | thing two | on slot free | src/b.ts, src/components/wizard/**, docs/NEW_THING.md (new) | - | agy-gemini + opus | no |
| C | follow-on | on claude/a-thing landing | scripts/x.mjs | migration 0055 | opus | no |

## Handoffs

- consumed: 2026-09-01-a-thing.md -> row A
- spent: 2026-09-01-d-thing.md - traced to c9ff21a5

Owner receipts: agents-md-byte-headroom is held for the next wave (lands alone).

## Prompts

\`\`\`
SESSION A - thing one
BRANCH claude/a-thing
MODEL  opus high - design judgement
START  now
TOUCHES src/a.ts
GOAL   done means x.
DO     1. do it.
GATE   npm run build
QUEUE  1. /check; 2. handoff; 3. /queue-merge last.
\`\`\`

\`\`\`
SESSION B - thing two
BRANCH claude/b-thing
MODEL  opus medium - the doing is delegated to agy-gemini, fallback opus
DO     1. delegate; 2. re-derive.
QUEUE  1. /check; 2. handoff; 3. /queue-merge last.
\`\`\`

\`\`\`
SESSION C - follow-on
BRANCH claude/c-thing
DO     1. thing.
QUEUE  last.
\`\`\`
`;

const handoffs = [
  { name: '2026-09-01-a-thing.md', at: NOW },
  { name: '2026-09-01-d-thing.md', at: NOW },
];
const receipts = [
  { receipt: true, kind: 'ask', slug: 'agents-md-byte-headroom', state: 'unstarted', ageDays: 1 },
  // A finding is never something a plan has to account for by name - it is not his requirement.
  { receipt: true, kind: 'finding', slug: 'a-bug-found-on-the-way', state: 'unstarted', ageDays: 9 },
];

test('a plan in the contract shape passes', () => {
  const verdict = checkPlan(GOOD, { exists, handoffs, receipts, now: NOW });
  assert.deepEqual(verdict.problems, []);
  assert.equal(verdict.rows, 3);
  assert.deepEqual(verdict.pools, ['opus', 'agy-gemini']);
});

test('parseWaveTable accepts # or L as the letter column and names a missing column', () => {
  const { rows, problems } = parseWaveTable('## Wave table\n\n| # | goal | START | TOUCHES | MINTS | browser |\n|---|---|---|---|---|---|\n| A | g | now | src/a.ts | - | no |\n');
  assert.equal(rows[0].letter, 'A');
  assert.deepEqual(problems, ['the wave table lacks a POOL column']);
  assert.deepEqual(parseWaveTable('# nothing here').problems, ['no "## Wave table" heading']);
  // The heading may be worded the way the core names section 1, and header cells may be bold.
  const worded = parseWaveTable('## 1. The wave table\n\n| **L** | **goal** | **START** | **TOUCHES** | **MINTS** | **POOL** | **browser** |\n|---|---|---|---|---|---|---|\n| A | g | now | src/a.ts | none | opus | no |\n');
  assert.deepEqual(worded.problems, []);
  assert.equal(worded.rows[0].pool, 'opus');
});

test('a shell comment inside a prompt does not end the block, and "none" mints nothing', () => {
  const plan = GOOD
    .replace('GATE   npm run build\nQUEUE  1. /check; 2. handoff; 3. /queue-merge last.', 'GATE   npm run build\n# a comment line in the prompt\nQUEUE  1. /check; 2. handoff; 3. /queue-merge last.')
    .replace('| B | thing two | on slot free | src/b.ts, src/components/wizard/**, docs/NEW_THING.md (new) | - |', '| B | thing two | on slot free | src/b.ts, src/components/wizard/**, docs/NEW_THING.md (new) | none |')
    .replace('| C | follow-on | on claude/a-thing landing | scripts/x.mjs | migration 0055 |', '| C | follow-on | on claude/a-thing landing | scripts/x.mjs | n/a |');
  const { problems } = checkPlan(plan, { exists, handoffs, receipts, now: NOW });
  assert.deepEqual(problems, []);
});

test('parsePromptBlocks keys blocks by letter and records the last keyword', () => {
  const blocks = parsePromptBlocks(GOOD);
  assert.deepEqual([...blocks.keys()], ['A', 'B', 'C']);
  assert.equal(blocks.get('A').lastKey, 'QUEUE');
  assert.match(blocks.get('B').text, /fallback opus/);
});

test('touchProblems checks paths and globs, and skips free text and (new)', () => {
  const row = { letter: 'Z', touches: 'src/a.ts, src/missing.ts, src/components/wizard/**, docs/gone/**, the AGENTS.md chain, docs/X.md (new)' };
  assert.deepEqual(touchProblems(row, exists), [
    'row Z: TOUCHES names src/missing.ts, which does not exist (mark it (new) if the row creates it)',
    'row Z: TOUCHES names docs/gone/**, which does not exist (mark it (new) if the row creates it)',
  ]);
});

test('each forbidden shape is its own named problem', () => {
  const broken = GOOD
    .replace('| A | thing one | now | src/a.ts, e2e/import.spec.ts | scripts/e2e-lists.mjs (new) | opus | yes |',
      '| A | thing one | wait for B | src/a.ts, src/nope.ts | migration 0055 |  | yes |')
    .replace('| B | thing two | on slot free | src/b.ts, src/components/wizard/**, docs/NEW_THING.md (new) | - | agy-gemini + opus | no |',
      '| B | thing two | on slot free | src/b.ts | - | codex | no |')
    .replace('MODEL  opus medium - the doing is delegated to agy-gemini, fallback opus', 'MODEL  codex high')
    .replace('QUEUE  1. /check; 2. handoff; 3. /queue-merge last.\n```\n\n```\nSESSION C', 'QUEUE  1. /check; 2. handoff.\nGATE   npm run build\n```\n\n```\nSESSION C')
    .replace('Pools at plan time: Codex weekly 64% (snapshot 07:33), agy pools available, Opus ample.', '')
    .replace('- spent: 2026-09-01-d-thing.md - traced to c9ff21a5', '')
    .replace('Owner receipts: agents-md-byte-headroom is held for the next wave (lands alone).', '');
  const { problems } = checkPlan(broken, { exists, handoffs, receipts, now: NOW });
  const expect = (pattern) => assert.ok(problems.some((p) => pattern.test(p)), `missing problem ${pattern}\n${problems.join('\n')}`);
  expect(/row A: START must be/);
  expect(/row A: no POOL/);
  expect(/rows A and C both mint migration 0055/);
  expect(/row A: TOUCHES names src\/nope\.ts/);
  expect(/row B: a non-Claude pool must name its fallback/);
  expect(/row B: the prompt's last keyword line is GATE, not QUEUE/);
  expect(/no "Pools at plan time:" line/);
  expect(/handoff 2026-09-01-d-thing\.md is not classified/);
  expect(/standing owner ask agents-md-byte-headroom/);
});

test('a prompt block without a row, and a row without a block, are both problems', () => {
  const noBlock = GOOD.replace('SESSION C - follow-on', 'SESSION D - stray');
  const { problems } = checkPlan(noBlock, { exists, handoffs, receipts, now: NOW });
  assert.ok(problems.some((p) => /row C: no prompt block/.test(p)));
  assert.ok(problems.some((p) => /prompt block SESSION D has no wave-table row/.test(p)));
});

test('economy notes name Codex headroom left idle, and a Claude percentage that cannot exist', () => {
  const rows = (...pools) => pools.map((pool) => ({ pool, raw: '' }));
  // The GOOD plan: Codex weekly 64% and no codex row - a note, never a problem.
  const good = checkPlan(GOOD, { exists, handoffs: [], receipts: [], now: NOW });
  assert.equal(good.problems.length, 0);
  assert.equal(good.notes.length, 1);
  assert.match(good.notes[0], /no row names the codex pool/);

  // A codex row silences it; so does the invocation saying Codex is off limits this wave.
  assert.deepEqual(economyNotes('Pools at plan time: Codex weekly 64%, agy ample.', rows('opus', 'codex + opus')), []);
  assert.deepEqual(economyNotes('Pools at plan time: Codex is off limits this wave (owner), agy ample.', rows('opus')), []);
  assert.deepEqual(economyNotes('Pools at plan time: Codex UNKNOWN (no snapshot), agy ample.', rows('opus')), [], 'unknown routes like low and is not headroom');
  assert.deepEqual(economyNotes('Pools at plan time: Codex weekly 96%, 5-hour 80%.', rows('opus')), [], 'a nearly spent week is not headroom');
  assert.equal(economyNotes('Pools at plan time: Codex headroom (weekly 40%).', rows('opus')).length, 1);

  // The 2026-09-03 day plan, as written: Codex's meter attributed to Claude, and no codex row.
  const misread = 'Pools at plan time: Claude 5-hour window 0% used (resets 11:19Z), weekly 64% with 4 days left - Antigravity both pools idle.';
  const notes = economyNotes(misread, rows('opus', 'opus + agy-gemini'));
  assert.equal(notes.length, 2);
  assert.match(notes[0], /Claude Code publishes no rate limit/);
  assert.match(notes[1], /no row names the codex pool/);

  // A line that names Codex's percentage as Codex's is read correctly.
  assert.deepEqual(economyNotes('Pools at plan time: Codex weekly 64%; Claude has no meter.', rows('codex')), []);
  // No snapshot line at all is the plan check's own problem, not a note.
  assert.deepEqual(economyNotes('## Wave table', rows('opus')), []);
});

test('a night plan must carry a Window ends line; a day plan need not', () => {
  // GOOD carries no "Window ends:" line, so it fails only when checked as a night plan.
  const asNight = checkPlan(GOOD, { exists, handoffs, receipts, now: NOW, night: true });
  assert.ok(asNight.problems.some((problem) => /Window ends/.test(problem)), 'a night plan with no window is refused');

  const asDay = checkPlan(GOOD, { exists, handoffs, receipts, now: NOW, night: false });
  assert.ok(!asDay.problems.some((problem) => /Window ends/.test(problem)), 'a day plan is not asked for a window');

  const withWindow = checkPlan(`${GOOD}\nWindow ends: 2026-09-02T07:00:00+03:00\n`, { exists, handoffs, receipts, now: NOW, night: true });
  assert.deepEqual(withWindow.problems, [], 'a night plan with a parseable window passes');
});

test('pathProbe is the one definition of what a token asks the tree about', () => {
  assert.deepEqual(pathProbe('docs/X.md'), { token: 'docs/X.md', probe: 'docs/X.md' });
  assert.deepEqual(pathProbe('(`docs/X.md`),'), { token: 'docs/X.md', probe: 'docs/X.md' });
  assert.deepEqual(pathProbe('scripts/hooks/'), { token: 'scripts/hooks/', probe: 'scripts/hooks' });
  // A glob probes the directory above its first star - the plan check used to probe
  // `docs/handoffs/2026-09-01-`, which never exists, and refused every dated glob.
  assert.deepEqual(pathProbe('docs/handoffs/2026-09-01-*.md'), { token: 'docs/handoffs/2026-09-01-*.md', probe: 'docs/handoffs' });
  assert.deepEqual(pathProbe('src/components/wizard/**'), { token: 'src/components/wizard/**', probe: 'src/components/wizard' });
  // Nothing to probe: no separator, a glob with no directory before its star, absolute, ~, URL.
  for (const raw of ['settings.json', 'e.g.', '*.md', 'e2e*/x.ts', 'C:/x/y.ts', '/tmp/y.ts', '~/.claude/x', 'https://a.b/c.md']) {
    assert.equal(pathProbe(raw), null, raw);
  }
});

test('touchProblems probes a dated glob at its directory, like the launch guard', () => {
  const row = { letter: 'Y', touches: 'docs/handoffs/2026-09-01-*.md, docs/gone/2026-*.md' };
  const files = new Set(['docs/handoffs']);
  assert.deepEqual(touchProblems(row, (rel) => files.has(rel)), [
    'row Y: TOUCHES names docs/gone/2026-*.md, which does not exist (mark it (new) if the row creates it)',
  ]);
});

/** The tree a prompt is probed against: files AND the directories that make a token a path claim. */
const TREE = new Set([...FILES, 'src', 'docs', 'scripts', 'e2e', 'scripts/hooks', 'docs/handoffs']);
const inTree = (rel) => TREE.has(rel);

test('promptPathProblems reads the TOUCHES and READ lines of a prompt, continuations included', () => {
  const prompt = [
    'SESSION R - triggers that fire',
    'BRANCH claude/r-thing',
    'TOUCHES src/a.ts, scripts/hooks/, docs/NEW.md (new, plus its owner-queue file)   MINTS scripts/made-up.mjs, .claude/x.json',
    'READ   docs/SVG_AUTHORING.md (especially "the part" - it is the rule), src/b.ts,',
    '       e2e/import.spec.ts (the spec, e.g. its first test), src/components/wizard/**.',
    'DO     1. read scripts/nowhere.mjs - a DO line is never probed',
  ].join('\n');
  assert.deepEqual(promptPathProblems(prompt, inTree), []);

  const wrong = prompt.replace('src/a.ts', 'src/a.tsx').replace('src/b.ts', 'src/bb.ts');
  assert.deepEqual(promptPathProblems(wrong, inTree), [
    { key: 'TOUCHES', token: 'src/a.tsx', probe: 'src/a.tsx' },
    { key: 'READ', token: 'src/bb.ts', probe: 'src/bb.ts' },
  ]);
});

test('promptPathProblems never reads prose with slashes as a path claim', () => {
  // Found in review, 2026-09-05, against this repository's own contracts. Every token here passed
  // the character test in the first cut; a refusal over any of them blocks every launch on the
  // machine the moment the settings land.
  const prompt = [
    'READ   docs/SVG_AUTHORING.md (the Take/Update/Out buttons, and/or the lock/reveal pair, f0/f1),',
    '       I/O and TCP/IP, read/write, (NEXT/THEN are parked).',
  ].join('\n');
  assert.deepEqual(promptPathProblems(prompt, inTree), []);
  // A path claim is a token whose FIRST SEGMENT the tree has; a misspelt file under a real
  // directory is still caught.
  assert.deepEqual(
    promptPathProblems('READ docs/SVG_AUTHORNG.md and Take/Update/Out', inTree).map((p) => p.token),
    ['docs/SVG_AUTHORNG.md'],
  );
});

test('promptPathProblems leaves alone what is not a relative path of this checkout', () => {
  const prompt = [
    'TOUCHES C:/claude/elsewhere/x.ts, /tmp/y.ts, ~/.claude/settings.json, https://example.com/a.md, settings.json, e.g. 1.2, e2e*/x.ts',
    'READ   the AGENTS.md chain, `docs/SVG_AUTHORING.md`, docs/handoffs/2026-09-01-*.md, src/components/wizard/**/*.tsx',
  ].join('\n');
  assert.deepEqual(promptPathProblems(prompt, inTree), []);
  // No key line, no probe - an Explore brief mentioning folders in prose costs nothing.
  assert.deepEqual(promptPathProblems('Read every file under docs/nowhere/ and report.', inTree), []);
  assert.deepEqual(promptPathProblems(null, inTree), []);
  // A glob whose directory is missing is reported at that directory.
  assert.deepEqual(promptPathProblems('READ docs/nowhere/2026-*.md', inTree).map((p) => p.probe), ['docs/nowhere']);
});

test('a READ block ends at a blank line, an unindented line, a prompt key or a key-shaped word', () => {
  // An indented prompt must not feed every following paragraph to the probe.
  const prompt = [
    '  READ   docs/SVG_AUTHORING.md',
    '  NOTE   docs/nowhere-one.md is discussed here, not read',
    '  READ   src/a.ts',
    '',
    '  docs/nowhere-two.md after a blank line',
    '  READ   src/b.ts',
    'docs/nowhere-three.md unindented',
  ].join('\n');
  assert.deepEqual(promptPathProblems(prompt, inTree), []);
});

test('an answered alignment question the plan never mentions is refused', () => {
  const alignment = [{ id: 'ALIGN-2026-09-15-1', question: 'Still the top of NOW?', answer: 'Yes.' }];
  const { problems } = checkPlan(GOOD, { exists, handoffs, receipts: [], alignment, now: NOW });
  assert.ok(problems.some((p) => /alignment answer ALIGN-2026-09-15-1 is not in docs\/OWNER_RULINGS\.md/.test(p)));

  const mentions = checkPlan(`${GOOD}

Row D records ALIGN-2026-09-15-1.
`, { exists, handoffs, receipts: [], alignment, now: NOW });
  assert.ok(!mentions.problems.some((p) => /alignment answer/.test(p)), 'naming the id is what clears it');
});

test('no pending alignment answers means no alignment problem at all', () => {
  const { problems } = checkPlan(GOOD, { exists, handoffs, receipts: [], now: NOW });
  assert.ok(!problems.some((p) => /alignment answer/.test(p)));
});

// ── The shared table walker and the browser word ─────────────────────────────────────────────────

test('tableUnder returns the first table under a matching heading, keyed by column, and null without one', () => {
  const table = tableUnder('## Candidates\n\ntext\n\n| **L** | size | goal |\n|---|---|---|\n| A | small | g |\n\n## Next\n\n| L |\n|---|\n| Z |\n', /^#{1,6}\s+.*\bcandidates\b/i);
  assert.deepEqual(table.header, ['letter', 'size', 'goal']);
  assert.equal(table.rows.length, 1); // the next heading closes it
  assert.equal(table.rows[0].letter, 'A');
  assert.equal(tableUnder('# Plan\n', /candidates/i), null);
  assert.equal(tableUnder('## Candidates\n\nno table\n', /candidates/i).header, null);
});

test('browserWord reads a cell starting with yes or no, ignores markdown, and is null for anything else', () => {
  assert.equal(browserWord('yes'), true);
  assert.equal(browserWord('`yes`'), true);
  assert.equal(browserWord('**No** - queued form only'), false);
  assert.equal(browserWord('-'), null);
  assert.equal(browserWord('needs it'), null);
  assert.equal(browserWord('not sure'), null);
  assert.equal(browserWord(''), null);
  assert.deepEqual(mintsOf('the browser slot, none, -, docs/GOALS.md'), ['the browser slot', 'docs/GOALS.md']);
});

test('a wave-table browser cell that is not a yes or a no is a problem, because the refill instrument reads it', () => {
  const plan = GOOD.replace('| opus | yes |', '| opus | needs it |');
  const { problems } = checkPlan(plan, { exists, handoffs, receipts: [], now: NOW });
  assert.ok(problems.some((p) => /row A: browser must start with yes or no - got "needs it"/.test(p)), problems.join('\n'));
  assert.ok(!checkPlan(GOOD, { exists, handoffs, receipts: [], now: NOW }).problems.some((p) => /browser must/.test(p)));
});

test('a candidates-table browser cell must be empty, a dash, or start with yes or no', () => {
  const plan = `${GOOD}

## Candidates

| L | size | serves | TOUCHES | SPECS | browser | goal |
|---|---|---|---|---|---|---|
| M | small | NOW | src/a.ts | - |  | fine |
| N | small | NOW | src/a.ts | - | - | fine |
| O | small | NOW | src/a.ts | e2e/x.spec.ts | no | fine |
| P | small | NOW | src/a.ts | e2e/x.spec.ts | shared with F | not fine |
`;
  const { problems } = checkPlan(plan, { exists, handoffs, receipts: [], now: NOW });
  const browserProblems = problems.filter((p) => /candidate .*browser must/.test(p));
  assert.deepEqual(browserProblems, ['candidate P: browser must start with yes or no, or be empty - got "shared with F"']);
});

// The weekly review's candidate rows. Both directions, because getting only one of them right is
// how the 2026-09-08 miss happened: the plans said nothing, and saying nothing read as fine.
const candidates = [
  { id: 'WEEK-2026-09-08-1', n: 1, title: 'the wave plan outlives its worktree', goal: 'a plan is written where it survives' },
  { id: 'WEEK-2026-09-08-2', n: 2, title: 'one walk covers a route', goal: '/walk groups the queue by route' },
];

test('a weekly candidate row the plan says nothing about is refused', () => {
  const { problems } = checkPlan(GOOD, { exists, handoffs, receipts: [], candidates, now: NOW });
  assert.deepEqual(problems.filter((p) => /weekly candidate/.test(p)).length, 2);
  assert.ok(problems.some((p) => /WEEK-2026-09-08-1 \("the wave plan outlives its worktree"\) is not classified/.test(p)));
});

test('a weekly candidate planned into a row, or turned down with a reason, passes', () => {
  const answered = checkPlan(`${GOOD}

## Weekly review

- planned: WEEK-2026-09-08-1 -> row A
- rejected: WEEK-2026-09-08-2 - it needs the route grouping first, and that has no slot this wave
`, { exists, handoffs, receipts: [], candidates, now: NOW });
  assert.deepEqual(answered.problems.filter((p) => /weekly candidate/.test(p)), []);
});

test('a weekly candidate turned down with no reason, or planned into a row that is not there, is refused', () => {
  const { problems } = checkPlan(`${GOOD}

## Weekly review

- planned: WEEK-2026-09-08-1 -> row Z
- rejected: WEEK-2026-09-08-2
`, { exists, handoffs, receipts: [], candidates, now: NOW });
  assert.ok(problems.some((p) => /planned as row Z, and the wave table has no row Z/.test(p)));
  assert.ok(problems.some((p) => /WEEK-2026-09-08-2 .*rejected with no reason/.test(p)));
});

test('no weekly candidates in the window means no candidate problem at all', () => {
  const { problems } = checkPlan(GOOD, { exists, handoffs, receipts: [], now: NOW });
  assert.ok(!problems.some((p) => /weekly candidate/.test(p)));
});
