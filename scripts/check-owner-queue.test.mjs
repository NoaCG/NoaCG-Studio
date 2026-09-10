// The owner-queue front-matter gate's RULES, pinned - for the same reason `scripts/check-docs-
// index.test.mjs` pins its own: every failure mode here is silent by construction. A gate that
// reports OK over an item missing `kind:`/`date:` is indistinguishable from a complete one, and
// the whole point of the two keys is that `/walk` cannot sort or filter without them.
//
// `auditOwnerQueueItem` is pure, so the rules are driven with literal file text - no owner-queue
// directory, no fixtures on disk.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  auditOwnerQueueItem,
  KINDS,
  NEEDS,
  OWN_ROUTE,
  WALK_BECAUSE,
  QUEUE_DIR,
  SERVES,
  placeOf,
  routeTextOf,
} from './check-owner-queue.mjs';

test('a file with no front matter at all fails', () => {
  const problems = auditOwnerQueueItem('# A title\n\nSome body text.\n');
  assert.deepEqual(problems, ['missing front matter (kind: and date:)']);
});

test('a file with both keys, a known kind, passes clean', () => {
  const text = '---\nkind: walk\ndate: 2026-08-27\n---\n# A title\n\nBody.\n';
  assert.deepEqual(auditOwnerQueueItem(text), []);
});

for (const kind of KINDS) {
  test(`kind: ${kind} is accepted`, () => {
    const text = `---\nkind: ${kind}\ndate: 2026-08-27\n---\n# A title\n`;
    assert.deepEqual(auditOwnerQueueItem(text), []);
  });
}

test('front matter present but missing kind: is reported', () => {
  const text = '---\ndate: 2026-08-27\n---\n# A title\n';
  assert.deepEqual(auditOwnerQueueItem(text), ['missing kind:']);
});

test('front matter present but missing date: is reported', () => {
  const text = '---\nkind: walk\n---\n# A title\n';
  assert.deepEqual(auditOwnerQueueItem(text), ['missing date:']);
});

test('an unrecognised kind is reported by name', () => {
  const text = '---\nkind: tooling\ndate: 2026-08-27\n---\n# A title\n';
  // The expected message is built from KINDS rather than typed out, so widening the vocabulary
  // does not require editing a literal in two places - the point of this test is that an unknown
  // value is named and the legal set is printed, not what the legal set happens to be today.
  assert.deepEqual(auditOwnerQueueItem(text), [`kind: 'tooling' is not one of ${KINDS.join(', ')}`]);
});

// The 2026-09-02 widening added `walk-p` and `agent`. It must stay a WIDENING: seven sibling
// sessions were filing items against the older three values while it landed, so dropping one
// would red-gate a build for a line those prompts never saw. Driven through the rule rather than
// through `KINDS.includes`, so narrowing the vocabulary fails HERE and not only in a loop that
// reads the same list it is checking.
for (const kind of ['walk', 'owner-action', 'hardware', 'walk-p', 'agent']) {
  test(`the widened vocabulary still accepts kind: ${kind}`, () => {
    assert.deepEqual(auditOwnerQueueItem(`---\nkind: ${kind}\ndate: 2026-09-02\n---\n# T\n`), []);
  });
}

// `serves:` is the priority mechanism, and its failure mode is silent by construction: a misspelt
// value sorts the item last and nothing reads wrong. These pin that the key is OPTIONAL and that
// the only accepted value is the one the contract documents.
test('an item with no serves: key passes - the key is optional', () => {
  assert.deepEqual(auditOwnerQueueItem('---\nkind: walk\ndate: 2026-09-02\n---\n# T\n'), []);
});

test(`serves: ${SERVES} passes`, () => {
  assert.deepEqual(auditOwnerQueueItem(`---\nkind: walk\ndate: 2026-09-02\nserves: ${SERVES}\n---\n# T\n`), []);
});

test('a misspelt serves: value is reported rather than silently sorting last', () => {
  const problems = auditOwnerQueueItem('---\nkind: walk\ndate: 2026-09-02\nserves: NOW\n---\n# T\n');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^serves: 'NOW' is not 'now'/);
});

test('both keys missing reports both', () => {
  const text = '---\nother: value\n---\n# A title\n';
  assert.deepEqual(auditOwnerQueueItem(text), ['missing kind:', 'missing date:']);
});

// The gate has to be true of the REAL directory, not only of literals - otherwise it can pass
// its unit tests while the build check it backs is broken.
test('every real file under docs/acceptance/owner-queue/ carries kind: and date:', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const dir = `${root}${QUEUE_DIR}`;
  // A missing directory is the same "nothing queued" pass main() reports, not a test failure -
  // the gate and this test must not disagree on that edge case.
  let names;
  try {
    names = readdirSync(dir).filter((name) => name.endsWith('.md'));
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  const failures = names.flatMap((name) => {
    const text = readFileSync(`${dir}/${name}`, 'utf8');
    return auditOwnerQueueItem(text).map((problem) => `${name}: ${problem}`);
  });
  assert.deepEqual(failures, []);
});

// --- `because:` - WHY a walk item is his (owner ruling, 2026-09-10) ---
// The same shape as `needs:` one list further in. Before it, everything observable reached him by
// default and the queue passed eighty. These pin all four directions: required where it applies,
// validated wherever it appears, refused on a kind that cannot carry it, and date-gated so items
// filed before the rule still read clean.

const walkItem = (front) => `---\n${front}\n---\n# A title\n\n## The route, under a minute\n\nOpen /app.\n`;

test('a walk item filed after the rule must name a reason', () => {
  const problems = auditOwnerQueueItem(walkItem('kind: walk\ndate: 2026-09-11'));
  assert.match(problems.join(' '), /needs a reason/);
  assert.match(problems.join(' '), /it is not his: decide it/);
});

test('a walk-p item filed after the rule must name a reason too', () => {
  const problems = auditOwnerQueueItem(walkItem('kind: walk-p\ndate: 2026-09-11'));
  assert.match(problems.join(' '), /needs a reason/);
});

for (const because of WALK_BECAUSE) {
  test(`because: ${because} satisfies a walk item`, () => {
    assert.deepEqual(auditOwnerQueueItem(walkItem(`kind: walk\ndate: 2026-09-11\nbecause: ${because}`)), []);
  });
}

test('a misspelt reason is refused at any date, which an absent one is not', () => {
  const problems = auditOwnerQueueItem(walkItem('kind: walk\ndate: 2026-08-29\nbecause: decision'));
  assert.match(problems.join(' '), /is not one of taste, scope, direction, money/);
});

test('a reason on a kind that cannot carry one says which kind it is', () => {
  const problems = auditOwnerQueueItem(walkItem('kind: agent\ndate: 2026-09-11\nbecause: taste'));
  assert.match(problems.join(' '), /only belongs on kind: walk or walk-p/);
});

test('a walk item filed before the rule needs no reason', () => {
  assert.deepEqual(auditOwnerQueueItem(walkItem('kind: walk\ndate: 2026-09-10')), []);
});

// --- `needs:` - WHY an owner-action item is his (owner ruling, 2026-09-04) ---
// A technical problem is never his, so `owner-action` has to name which of four real reasons it
// is. These pin both directions: the reason is required where it applies, it is refused where it
// does not, and it is date-gated so an item filed before the rule existed still reads clean.

test('an owner-action item filed after the rule must name a reason', () => {
  const text = '---\nkind: owner-action\ndate: 2026-09-05\n---\n# A title\n';
  const problems = auditOwnerQueueItem(text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /needs a reason/);
  assert.match(problems[0], /it is not an owner action: do the work instead/);
});

for (const needs of NEEDS) {
  test(`needs: ${needs} satisfies an owner-action item`, () => {
    const text = `---\nkind: owner-action\ndate: 2026-09-05\nneeds: ${needs}\n---\n# A title\n`;
    assert.deepEqual(auditOwnerQueueItem(text), []);
  });
}

test('an owner-action item filed BEFORE the rule is left alone', () => {
  const text = '---\nkind: owner-action\ndate: 2026-08-29\n---\n# A title\n';
  assert.deepEqual(auditOwnerQueueItem(text), []);
});

test('a reason outside the closed set is refused, at any date', () => {
  const text = '---\nkind: owner-action\ndate: 2026-08-29\nneeds: decision\n---\n# A title\n';
  const problems = auditOwnerQueueItem(text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /needs: 'decision' is not one of account, money, identity, harness/);
});

test('a reason on a walk item is refused - that is the wrong kind dressed up', () => {
  const text = '---\nkind: walk\ndate: 2026-09-05\nneeds: account\n---\n# A title\n';
  const problems = auditOwnerQueueItem(text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /only belongs on kind: owner-action/);
});

test('the date gate compares dates, not string length or arrival order', () => {
  const before = '---\nkind: owner-action\ndate: 2026-09-04\n---\n# A title\n';
  const on = '---\nkind: owner-action\ndate: 2026-09-05\n---\n# A title\n';
  const after = '---\nkind: owner-action\ndate: 2026-12-31\n---\n# A title\n';
  assert.deepEqual(auditOwnerQueueItem(before), []);
  assert.equal(auditOwnerQueueItem(on).length, 1);
  assert.equal(auditOwnerQueueItem(after).length, 1);
});

// --- THE ROUTE, AND THE PLACE IT OPENS ---
// `/walk` groups the queue by where each route sends the owner, so these rules decide which
// screen he is taken to. Every one of them is silent when wrong: a misread route does not fail
// anything, it just puts an item in a group whose screen does not show it.

test('a route section is found in both shapes the queue uses', () => {
  assert.match(routeTextOf('---\nkind: walk\n---\n# T\n\n## The route, under a minute\n\nOpen /app.\n'), /Open \/app/);
  assert.match(routeTextOf('# T\n\n**Route, under a minute.** Open /app.\n'), /Open \/app/);
  assert.equal(routeTextOf('# T\n\nSome body with no route at all.\n'), null);
});

test('a heading about routing is not mistaken for a route', () => {
  assert.equal(routeTextOf('# T\n\n## What the router does\n\nBody.\n'), null);
});

// Found by filing this change's own queue item and watching it group as "on their own": its title
// is "A walk now covers a route, not an item", and a heading pattern that merely CONTAINED the
// word read the title as the route, stopped at the next heading, and grouped the item on three
// words of prose. The heading has to OPEN with it.
test('a title that mentions a route is not the route section', () => {
  const text = '# A walk now covers a route, not an item\n\n## What changed\n\nBody.\n\n' +
    '## The route, under a minute\n\n```bash\nnpm run something\n```\n';
  assert.match(routeTextOf(text), /npm run something/);
  assert.equal(placeOf(text).id, 'checkout');
});

// The regression this pins is real and it was found by reading the output: the receipts item's
// route is ONE command in a terminal, and the "what to look at" paragraph under it mentions the
// editor and the studio while describing a list of bugs. Read as one blob it grouped as "the
// studio", which would have sent the owner to a screen the item is not about.
test('the route stops where "what to look at" starts', () => {
  const text =
    '# T\n\n## The route, under a minute\n\n    node scripts/owner-receipts.mjs\n\n' +
    '**What to look at.** Three rows: the editor that reported a bad canvas, and the studio ' +
    'looking identical signed in and out.\n';
  assert.doesNotMatch(routeTextOf(text), /the editor/);
  assert.equal(placeOf(text).id, 'checkout');
});

test('the most specific place wins - that ordering IS the rule', () => {
  const place = (route) => placeOf(`# T\n\n## The route\n\n${route}\n`).id;
  // /docs before the site that hosts it.
  assert.equal(place('Open <https://noacg.studio/docs#svg-vote>.'), 'docs');
  assert.equal(place('Open <https://noacg.studio> and scroll to the footer.'), 'site');
  // The import wizard before the studio that contains it.
  assert.equal(place('`/app` -> **Import graphic** -> drop a board.'), 'import');
  assert.equal(place('`/app` -> **Templates** -> Credits & thanks.'), 'studio');
  // The studio before a checkout, because half the studio routes start by starting the server.
  assert.equal(place('`npm run dev`, open `/app`, then Browse.'), 'studio');
  assert.equal(place('```bash\nnpm run alignment:pending\n```'), 'checkout');
  assert.equal(place('Open the newest merged pull request on https://github.com/NoaCG/x/pulls.'), 'github');
});

// A route section's HEADING beats a bold mention of the word anywhere else in the item. Without
// that rule, an item summarising this very change - "The **route** each item writes is what groups
// it now" - had its summary read as the route and grouped on its own.
test('a passing bold mention of the word does not outrank a real route section', () => {
  const text =
    '# T\n\nThe **route** each item writes is what groups it now.\n\n' +
    '## The route, under a minute\n\n`/app` -> **Import graphic** -> drop a board.\n';
  assert.equal(placeOf(text).id, 'import');
});

test('a bold lead-in still works mid-sentence, which is where half of them are', () => {
  const text = '# T\n\n**Date:** 2026-09-07. **Route:** open `/app` and hover Home.\n';
  assert.equal(placeOf(text).id, 'studio');
});

// The one-paragraph template the queue used before this change wrote "What to look at:" as plain
// prose, and `Route:` as a plain lead-in. Both shapes are still on disk, so the boundary has to
// hold without any bold at all.
test('a plain "What to look at:" ends the route, exactly as the bold one does', () => {
  const text =
    '# T\n\nRoute: run `node scripts/owner-receipts.mjs` in a checkout.\n' +
    'What to look at: the rows where the editor and the studio disagree.\n';
  assert.doesNotMatch(routeTextOf(text), /the editor/);
  assert.equal(placeOf(text).id, 'checkout');
});

// A `#` comment on the first line of a fenced block is not a heading, and reading it as one used
// to truncate the route to its opening fence - which grouped an import route as a checkout.
test('a comment inside a fenced block does not end the route', () => {
  const text =
    '# T\n\n## The route, under a minute\n\n```bash\n# start the studio first\nnpm run dev\n```\n\n' +
    'Then open `/app` and click **Import graphic**.\n';
  assert.match(routeTextOf(text), /Import graphic/);
  assert.equal(placeOf(text).id, 'import');
});

test('an item whose route matches no place is on its own, never forced into one', () => {
  assert.equal(placeOf('# T\n\n## The route\n\nOpen the Scheduled panel in the sidebar.\n').id, OWN_ROUTE.id);
  assert.equal(placeOf('# T\n\nNo route here.\n').id, OWN_ROUTE.id);
});

// The route requirement is a TIGHTENING, so it is date-gated exactly like `needs:` above: items
// filed by branches already in flight must not go red for a line their prompt never saw.
test('a walk item filed from the route date needs a route section', () => {
  const problems = auditOwnerQueueItem('---\nkind: walk\ndate: 2026-09-10\n---\n# T\n\nBody.\n');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /no route section/);
});

test('the same item with a route passes', () => {
  const text = '---\nkind: walk\ndate: 2026-09-10\n---\n# T\n\n## The route, under a minute\n\nOpen `/app`.\n';
  assert.deepEqual(auditOwnerQueueItem(text), []);
});

test('an item filed before the route date is left alone', () => {
  assert.deepEqual(auditOwnerQueueItem('---\nkind: walk\ndate: 2026-09-09\n---\n# T\n\nBody.\n'), []);
});

test('hardware and owner-action need no route - one is blocked, the other is a console', () => {
  assert.deepEqual(auditOwnerQueueItem('---\nkind: hardware\ndate: 2026-12-31\n---\n# T\n'), []);
  const action = '---\nkind: owner-action\ndate: 2026-12-31\nneeds: account\n---\n# T\n';
  assert.deepEqual(auditOwnerQueueItem(action), []);
});

test('a done item is a record, not a walk, so it needs no route', () => {
  assert.deepEqual(auditOwnerQueueItem('---\nkind: walk\ndate: 2026-12-31\ndone: true\n---\n# T\n'), []);
});
