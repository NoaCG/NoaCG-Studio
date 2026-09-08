// The owner receipt's guard: a backlog file that credits the owner must carry a valid receipt, the
// receipt's states each demand the field that makes them meaningful, an ask and a finding are never
// printed as the same thing, and the listing puts the oldest standing ask first - the one line a
// planner must not miss.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  distinctiveWords,
  formatReceipts,
  isStanding,
  parseFrontmatter,
  formatSuspects,
  receiptFrom,
  servesVerdict,
  sortReceipts,
  suspectMatches,
  wrapAfter,
} from './owner-receipts.mjs';

const NOW = Date.parse('2026-09-02T12:00:00');

const receipt = (fields, body = '# A thing the owner asked for\n\n**Filed:** 2026-09-01. **Source:** owner ruling.\n\n## Why\n\nBecause.\n') =>
  `---\n${Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join('\n')}\n---\n${body}`;

/** A valid version 2 ask, so a test can vary one field and mean it. */
const ask = (fields) => receipt({ v: 2, source: 'owner', kind: 'ask', raised: '2026-09-01', state: 'unstarted', asked: 'x', ...fields });

test('parseFrontmatter reads scalars, folded blocks and trailing comments', () => {
  const parsed = parseFrontmatter('---\nsource: owner\nstate: unstarted   # still\nasked: >-\n  make the byte budget\n  real\n---\n# T\n');
  assert.equal(parsed.data.source, 'owner');
  assert.equal(parsed.data.state, 'unstarted');
  assert.equal(parsed.data.asked, 'make the byte budget real');
  assert.equal(parsed.body, '# T\n');
  assert.equal(parseFrontmatter('# no front matter\n'), null);
});

test('a quoted ask keeps its hash, a byte order mark is tolerated, and a future version is a problem', () => {
  const quoted = parseFrontmatter('---\nasked: "fix the #ticker kicker bug (#42)"\nnote: plain # a real comment\n---\n');
  assert.equal(quoted.data.asked, 'fix the #ticker kicker bug (#42)');
  assert.equal(quoted.data.note, 'plain');
  const bom = parseFrontmatter('﻿---\nsource: owner\n---\n# T\n');
  assert.equal(bom.data.source, 'owner');
  const future = receiptFrom('f.md', ask({ v: 3 }), { now: NOW });
  assert.ok(future.problems.some((p) => p.startsWith('v: 3')));
  assert.deepEqual(receiptFrom('c.md', ask({}), { now: NOW }).problems, []);
});

test('a quoted value runs on to its closing quote instead of losing every continuation line', () => {
  // Verbatim shape from docs/backlog/playout-lag-when-working-the-queue.md, which is how eleven
  // other receipts are written too. The old parser kept the opening quote and dropped lines 2-4.
  const parsed = parseFrontmatter([
    '---',
    'state: unstarted',
    'asked: "I noticed some lag when I was playing out the quiz graphics, moving around the queue,',
    '  and playing and stopping graphics. It\'s very important that our layout system is lag-free.',
    '  The lag happened when I tried to play out the graphic (#42)."',
    'raised: 2026-09-05',
    '---',
    '# Lag working the queue',
    '',
  ].join('\n'));
  assert.equal(parsed.data.state, 'unstarted');
  assert.equal(
    parsed.data.asked,
    'I noticed some lag when I was playing out the quiz graphics, moving around the queue, and ' +
      "playing and stopping graphics. It's very important that our layout system is lag-free. " +
      'The lag happened when I tried to play out the graphic (#42).',
  );
  // The key AFTER the run-on value is still read, and the body still starts after the block.
  assert.equal(parsed.data.raised, '2026-09-05');
  assert.equal(parsed.body, '# Lag working the queue\n');
  // Single quotes fold the same way.
  const single = parseFrontmatter("---\nnote: 'landed on claude/x;\n  the ask still stands'\n---\n");
  assert.equal(single.data.note, 'landed on claude/x; the ask still stands');
  // A quote that never closes gives back what it read rather than swallowing the next key: front
  // matter that is merely malformed must not silently delete a receipt's state.
  const unclosed = parseFrontmatter('---\nasked: "it never closes\n  and runs on\nstate: unstarted\n---\n');
  assert.equal(unclosed.data.asked, 'it never closes and runs on');
  assert.equal(unclosed.data.state, 'unstarted');
  // An ESCAPED quote at the end of a line does not close the scalar, and reaches the report as the
  // character it means. Receipts really are written this way, and truncating there would be the
  // same silent loss in a new place.
  const escaped = parseFrontmatter('---\nfound: "he said \\"it never gets taller\\"\n  and the rest MUST survive"\n---\n');
  assert.equal(escaped.data.found, 'he said "it never gets taller" and the rest MUST survive');
  // The single-quoted spelling of the same thing: `\'\'` is one literal quote, not the end.
  const doubled = parseFrontmatter("---\nnote: 'it''s not done\n  yet'\n---\n");
  assert.equal(doubled.data.note, "it's not done yet");
  assert.equal(parseFrontmatter('---\nasked: "\\\\ and \\"quoted\\""\n---\n').data.asked, '\\ and "quoted"');
});

test('the listing prints a quote whole, wrapped, and never cut mid-sentence', () => {
  const long =
    'when we have a ranking, we should be able to reorder them by their position, and it would be ' +
    'quite amazing if we could have a ranking that would also reorder the names and the position ' +
    'number just by adding or subtracting points. That is the future we want to come to.';
  const split = long.lastIndexOf(' ', 90);
  const record = receiptFrom('r.md', ask({ asked: `"${long.slice(0, split)}\n  ${long.slice(split + 1)}"` }), { now: NOW });
  const lines = formatReceipts([record]);
  const printed = lines.slice(2).join(' ').replace(/\s+/g, ' ').trim().replace(/^asked: /, '');
  assert.equal(printed, long);
  // No ellipsis, no stray opening quote, and every line inside the width.
  assert.ok(!lines.some((line) => line.includes('...')));
  assert.ok(!lines.some((line) => /asked: ["']/.test(line)));
  assert.ok(lines.every((line) => line.length <= 100));
  // Continuation lines hang under the quote rather than starting in column one.
  assert.ok(lines.slice(3).every((line) => line.startsWith('                    ')));
  // A word wider than the whole line sits alone instead of looping forever.
  assert.deepEqual(wrapAfter('x: ', 'a'.repeat(140), '  ', 40), ['x: ' + 'a'.repeat(140)]);
});

test('a trailing hash comment on a PROSE field is read as YAML and said out loud', () => {
  const parsed = parseFrontmatter('---\nstate: unstarted   # still\nnote: landed abc1234 # and the rest\n---\n');
  assert.deepEqual(parsed.commented, ['state', 'note']);
  assert.equal(parsed.data.note, 'landed abc1234');
  // Kept as the YAML rule, because that is what the format is - but a prose field losing half of
  // itself to it is reported, so the fix (quote the value) is visible to whoever reads the report.
  const record = receiptFrom('n.md', ask({ state: 'advanced', note: 'landed abc1234 # and the rest' }), { now: NOW });
  assert.deepEqual(record.problems, []);
  assert.equal(record.note, 'landed abc1234');
  assert.ok(record.notes.some((n) => n.startsWith('note: lost a trailing')));
  // A token field's comment is a comment and nothing is said about it.
  assert.deepEqual(receiptFrom('m.md', ask({ state: 'unstarted   # still' }), { now: NOW }).notes, []);
});

test('a version 1 receipt migrates on read and is NOTED, never refused', () => {
  const text = receipt({ v: 1, source: 'owner', raised: '2026-08-30', state: 'unstarted', asked: 'do the thing' });
  const onShelf = receiptFrom('do-the-thing.md', text, { now: NOW });
  assert.equal(onShelf.kind, 'ask');
  assert.equal(onShelf.quote, 'do the thing');
  // A branch in flight files a backlog item against the shape it was launched with. Failing the
  // build for that reds somebody else's work for a line their prompt never saw.
  assert.deepEqual(onShelf.problems, []);
  assert.ok(onShelf.notes.some((n) => n.startsWith('still on receipt format v1')));
  // Nothing can edit a file a commit already deleted, so history is silent about it.
  const inHistory = receiptFrom('do-the-thing.md', text, { now: NOW, historical: true });
  assert.deepEqual(inHistory.problems, []);
  assert.deepEqual(inHistory.notes, []);
  assert.equal(inHistory.kind, 'ask');
  // A receipt with no `v:` at all is version 1 by the same rule, not a kindless version 2.
  const unversioned = receiptFrom('u.md', receipt({ source: 'owner', raised: '2026-08-30', state: 'unstarted', asked: 'x' }), { now: NOW });
  assert.deepEqual(unversioned.problems, []);
  assert.equal(unversioned.kind, 'ask');
  // And a typo in `kind:` on an old receipt still reads as an ask. A row that matched neither kind
  // would vanish from both sections of the listing, which is the one thing this must never do.
  const typo = receiptFrom('t.md', receipt({ v: 1, source: 'owner', kind: 'Ask', raised: '2026-08-30', state: 'unstarted', asked: 'x' }), { now: NOW });
  assert.equal(typo.kind, 'ask');
  assert.equal(formatReceipts([typo]).length, 3);
});

test('active work is owned by a branch or by a programme, and never by prose in branch:', () => {
  const programme = receiptFrom('p.md', ask({ state: 'active', programme: 'P2 Behaviour and Control' }), { now: NOW });
  assert.deepEqual(programme.problems, []);
  assert.match(formatReceipts([programme]).join('\n'), /active .* on P2 Behaviour and Control/);
  // Prose here reads as ownership and can never equal a branch name, so the landing gate that
  // compares the two would match nothing and say nothing.
  const prose = receiptFrom('q.md', ask({ state: 'active', branch: 'programme P2, design rounds' }), { now: NOW });
  assert.ok(prose.problems.some((p) => p.startsWith('branch: must be a branch name')));
  const neither = receiptFrom('r.md', ask({ state: 'active' }), { now: NOW });
  assert.ok(neither.problems.some((p) => p.startsWith('branch: is required while active')));
});

test('a valid unstarted ask reads back with its age', () => {
  const record = receiptFrom('do-the-thing.md', ask({ raised: '2026-08-30', asked: 'do the thing' }), { now: NOW });
  assert.equal(record.receipt, true);
  assert.equal(record.slug, 'do-the-thing');
  assert.equal(record.ageDays, 3);
  assert.equal(record.kind, 'ask');
  assert.deepEqual(record.problems, []);
  assert.equal(isStanding(record), true);
});

test('a finding is quoted under found:, and never under asked:', () => {
  const finding = receiptFrom('bug.md', receipt({
    v: 2, source: 'owner', kind: 'finding', raised: '2026-09-01', state: 'unstarted', found: 'it bugged out again',
  }), { now: NOW });
  assert.deepEqual(finding.problems, []);
  assert.equal(finding.quote, 'it bugged out again');
  // A finding is real work, and never something a plan must account for as his requirement.
  assert.equal(isStanding(finding), false);

  const retroactive = receiptFrom('bug.md', receipt({
    v: 2, source: 'owner', kind: 'finding', raised: '2026-09-01', state: 'unstarted', asked: 'it bugged out again',
  }), { now: NOW });
  assert.ok(retroactive.problems.some((p) => p.startsWith('asked: on a finding')));
  assert.ok(retroactive.problems.some((p) => p.startsWith('found:')));

  const kindless = receiptFrom('k.md', receipt({
    v: 2, source: 'owner', raised: '2026-09-01', state: 'unstarted', asked: 'x',
  }), { now: NOW });
  assert.ok(kindless.problems.some((p) => p.startsWith('kind:')));
});

test('each state demands the field that makes it meaningful', () => {
  const active = receiptFrom('a.md', ask({ state: 'active' }), { now: NOW });
  assert.ok(active.problems.some((p) => p.startsWith('branch:')));
  const parked = receiptFrom('p.md', ask({ state: 'parked' }), { now: NOW });
  assert.ok(parked.problems.some((p) => p.startsWith('note:')));
  const advanced = receiptFrom('adv.md', ask({ state: 'advanced' }), { now: NOW });
  assert.ok(advanced.problems.some((p) => p.startsWith('note: is required when advanced')));
  const advancedWithNote = receiptFrom('adv.md', ask({ state: 'advanced', note: '09091ee3 measured it; the ask stands' }), { now: NOW });
  assert.deepEqual(advancedWithNote.problems, []);
  assert.equal(isStanding(advancedWithNote), true);
  const superseded = receiptFrom('s.md', ask({ state: 'superseded', note: 'by y' }), { now: NOW });
  assert.deepEqual(superseded.problems, []);
  const bad = receiptFrom('b.md', receipt({ v: 2, source: 'owner', kind: 'ask', raised: 'yesterday', state: 'someday' }), { now: NOW });
  assert.equal(bad.problems.length, 3);
});

test('an owner-credited file answers the tell with a receipt or with source: derived', () => {
  const owner = receiptFrom('no-receipt.md', '# Steer users\n\n**Filed:** 2026-08-26. **Source:** owner ruling, in session.\n', { now: NOW });
  assert.equal(owner.receipt, false);
  assert.equal(owner.problems.length, 1);
  const walk = receiptFrom('walk.md', '# The size questionnaire\n\nOwner walk 2026-08-28, on the Style step.\n', { now: NOW });
  assert.equal(walk.receipt, false);
  // The denial that used to have to hide below line fifteen: it says so out loud instead.
  const derived = receiptFrom('correction.md', '---\nsource: derived\n---\n# He never asked for 99%\n\n**Source:** owner ruling, misread.\n', { now: NOW });
  assert.equal(derived, null);
  const plain = receiptFrom('plain.md', '# A gate idea\n\n**Filed:** 2026-08-26. **Source:** the gate that landed the same day.\n', { now: NOW });
  assert.equal(plain, null);
  const queue = receiptFrom('queue.md', '# Front matter\n\n**Source:** a measurement over `docs/acceptance/owner-queue/` files.\n', { now: NOW });
  assert.equal(queue, null);
});

test('sortReceipts puts unstarted, then advanced, oldest first; the listing separates asks from findings', () => {
  const rows = [
    receiptFrom('young.md', ask({ raised: '2026-09-01', asked: 'y' }), { now: NOW }),
    receiptFrom('parked.md', ask({ raised: '2026-08-01', state: 'parked', asked: 'p', note: 'waits' }), { now: NOW }),
    receiptFrom('old.md', ask({ raised: '2026-08-20', asked: 'o' }), { now: NOW }),
    receiptFrom('active.md', ask({ raised: '2026-08-25', state: 'active', asked: 'a', branch: 'claude/a' }), { now: NOW }),
    receiptFrom('moved.md', ask({ raised: '2026-08-28', state: 'advanced', asked: 'm', note: 'abc1234 landed the half of it' }), { now: NOW }),
    receiptFrom('bug.md', receipt({ v: 2, source: 'owner', kind: 'finding', raised: '2026-08-31', state: 'unstarted', found: 'it broke' }), { now: NOW }),
  ];
  // sortReceipts orders by state and age alone - the ask/finding split is the listing's job.
  assert.deepEqual(sortReceipts(rows).map((r) => r.slug), ['old', 'bug', 'young', 'moved', 'active', 'parked']);
  const lines = formatReceipts(rows);
  assert.match(lines[0], /Owner asks \(5 open, 3 standing, 1 of them advanced\)/);
  assert.match(lines[1], /unstarted\s+13d\s+old/);
  assert.match(lines.join('\n'), /active\s+8d\s+active on claude\/a/);
  assert.match(lines.join('\n'), /advanced\s+5d\s+moved - abc1234 landed the half of it/);
  // A finding never appears under an "asked" heading, which is the whole point of the split.
  const findingsAt = lines.findIndex((line) => line.startsWith('Findings raised'));
  assert.ok(findingsAt > 0);
  assert.match(lines[findingsAt + 1], /unstarted\s+2d\s+bug/);
  assert.match(lines[findingsAt + 2], /found: it broke/);
  const compact = formatReceipts(rows, { compact: true });
  assert.equal(compact.length, 8);
  assert.ok(compact.every((line) => !line.includes('asked:') && !line.includes('found:')));
});

test('a receipt whose words turn up in a commit is a SUSPECT, and only a rare word carries it', () => {
  // A log the way this repository's really looks: `catalog` and `step` in a tenth of the subjects,
  // `kicker` and `waterfall` in one. Rarity is what separates a real hit from a coincidence, so the
  // corpus has to be big enough for that to mean anything.
  const commits = [];
  for (let index = 0; index < 400; index += 1) {
    commits.push({
      sha: `c${index}`,
      date: '2026-09-06',
      subject: index % 10 === 0 ? `Count the catalog in the import step, take ${index}` : `Some other change ${index}`,
      paths: ['src/app.ts'],
    });
  }
  commits.unshift({ sha: 'rare1', date: '2026-09-06', subject: 'Draw the kicker waterfall on every plate', paths: ['src/x.ts'] });
  commits.unshift({ sha: 'filed', date: '2026-09-04', subject: 'Pin the kicker waterfall finding', paths: ['docs/backlog/kicker-waterfall-entry.md'] });

  const rare = receiptFrom('kicker-waterfall-entry.md', ask({ raised: '2026-09-03' }), { now: NOW });
  const common = receiptFrom('catalog-import-step.md', ask({ raised: '2026-09-03' }), { now: NOW });
  const served = receiptFrom('kicker-waterfall-entry.md', ask({ raised: '2026-09-03', state: 'advanced', note: 'n' }), { now: NOW });
  const suspects = suspectMatches([rare, common, served], commits);

  // The rare pair clears the bar; the same number of common words does not.
  assert.deepEqual(suspects.map((s) => s.slug), ['kicker-waterfall-entry']);
  assert.deepEqual(suspects[0].commits.map((c) => c.sha), ['rare1']);
  // The commit that FILED the receipt names it by construction and is never evidence of anything.
  assert.ok(!suspects[0].commits.some((c) => c.sha === 'filed'));
  // A commit that predates the ask cannot have served it.
  assert.deepEqual(suspectMatches([receiptFrom('kicker-waterfall-entry.md', ask({ raised: '2026-09-07' }), { now: NOW })], commits), []);
  // Only unstarted receipts are in reach: an advanced one already carries a human's note saying
  // what landed, so guessing at it from a commit subject adds nothing.
  assert.equal(served.state, 'advanced');
  assert.deepEqual(suspectMatches([served], commits), []);

  // It says what it measured and refuses to say more. No word here decides anything, and the
  // receipt's own state is untouched - a false positive that read as fact would retire a live ask.
  const printed = formatSuspects(suspects).join('\n');
  assert.match(printed, /WORD MATCH/);
  assert.match(printed, /not a verdict/);
  assert.match(printed, /Nothing here has been reclassified/);
  // A plural in a slug has to be able to meet its singular in a subject, or a receipt whose work
  // really landed is never flagged. Stripping `es` from everything made `names` into `nam`, which
  // the four-letter floor then threw away entirely.
  assert.deepEqual(distinctiveWords('the-template-names-should-be-editable'), ['template', 'name', 'editable']);
  // A word whose STEM falls under the four-letter floor drops out, `boxes` included. That is the
  // quiet side of the trade on purpose: it can miss a receipt, and it cannot invent one.
  assert.deepEqual(distinctiveWords('quiz-states-and-boxes'), ['quiz', 'state']);
  assert.equal(rare.state, 'unstarted');
  assert.deepEqual(formatSuspects([]), []);
});

test('a branch that owns a receipt and leaves it alone is refused; deleting or advancing it answers', () => {
  const receipts = [
    receiptFrom('owned.md', ask({ state: 'active', branch: 'claude/x', asked: 'a' }), { now: NOW }),
    receiptFrom('other.md', ask({ state: 'active', branch: 'claude/y', asked: 'b' }), { now: NOW }),
  ];
  const untouched = servesVerdict({ branch: 'claude/x', receipts, changed: [{ path: 'src/app.ts', deleted: false }] });
  assert.equal(untouched.problems.length, 1);
  assert.match(untouched.problems[0], /docs\/backlog\/owned\.md says this branch owns it/);
  assert.deepEqual(untouched.served, []);

  const closed = servesVerdict({ branch: 'claude/x', receipts, changed: [{ path: 'docs/backlog/owned.md', deleted: true }] });
  assert.deepEqual(closed.problems, []);
  assert.deepEqual(closed.served, [{ slug: 'owned', action: 'closed' }]);

  const moved = servesVerdict({ branch: 'claude/x', receipts, changed: [{ path: 'docs/backlog/owned.md', deleted: false }] });
  assert.deepEqual(moved.problems, []);
  assert.deepEqual(moved.served, [{ slug: 'owned', action: 'updated' }]);

  // Another branch's receipt is never this branch's business, and a receipt nobody marked active
  // is outside the check's reach by design - it is reported, never refused.
  const unclaimed = servesVerdict({ branch: 'claude/z', receipts, changed: [{ path: 'docs/backlog/other.md', deleted: true }] });
  assert.deepEqual(unclaimed.problems, []);
  assert.deepEqual(unclaimed.served, [{ slug: 'other', action: 'closed', unclaimed: true }]);

  // The shelf's own README is not a receipt, and a branch that edits it has served nothing.
  const readme = servesVerdict({ branch: 'claude/z', receipts, changed: [{ path: 'docs/backlog/README.md', deleted: false }] });
  assert.deepEqual(readme.served, []);
});
