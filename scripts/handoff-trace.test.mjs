// The notice that fires when a handoff is destroyed. Both directions are pinned because both are
// expensive in opposite ways:
//
//   too shy   - a handoff holding the only copy of an analysis is deleted and nothing says so.
//               That happened on 2026-09-01: thirteen files were classified `spent` from their
//               headings, four were not, and one held the only analysis of an unfixed OGraf
//               defect. It was restored by hand.
//   too eager - a wave row whose whole job is to drain the folder gets a notice per file, and a
//               session updating its own handoff gets one every time. A notice that fires on the
//               ordinary case is a notice people stop reading, and this one has no other use.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classificationOf,
  isHandoff,
  listsOpenItems,
  loadPlans,
  openSections,
  recordsTheTrace,
  verdict,
} from './handoff-trace.mjs';
import { parseHandoffSection } from './handoff-drain.mjs';

/** The shape of the file that was nearly lost on 2026-09-01, headings and all. */
const OGRAF_HANDOFF = [
  '# Handoff - Session N: the ograf.dev 83-rule checker pass (2026-08-29)',
  '',
  '## What happened',
  'Ran the checker over the export.',
  '',
  '## THE ONE REAL THING THIS FOUND - and it needs a decision, not a patch',
  'The exporter injects TEMPLATE_CSS verbatim into the light DOM, so the last graphic loaded wins',
  'the host page body across layers. Two candidate fixes, both with tradeoffs.',
  '',
  '## Also open',
  'Preview images, a root LICENCE, gddType, the local ajv mismatch.',
  '',
  '## Verification',
  'Build green.',
].join('\n');

/** A handoff that says, in the folder's own words, that it leaves nothing behind. */
const NOTHING_LEFT = [
  '# 2026-09-01 - session D - prompt rigor',
  '',
  '## What landed',
  'Four commits.',
  '',
  '## What is left',
  'Nothing outstanding on this branch. No owner-queue item: nothing here is observable in the product.',
].join('\n');

test('a handoff is the tracked .md files in that one folder, and nothing else', () => {
  assert.ok(isHandoff('docs/handoffs/2026-09-02-d-thing.md'));
  assert.ok(isHandoff('docs\\handoffs\\2026-09-02-d-thing.md'));
  // A `.local.md` is gitignored session state that nobody inherits - deleting one loses nothing.
  assert.ok(!isHandoff('docs/handoffs/2026-09-02-day-wave-plan.local.md'));
  assert.ok(!isHandoff('https://github.com/NoaCG/NoaCG-Studio/blob/745c6f2dcd9ce5e82cc6655c652e08f0568800fd/docs/backlog/mistake-trigger-hooks.md'));
  assert.ok(!isHandoff('docs/handoffs/archive/old.md'));
  assert.ok(!isHandoff('src/model/spx.ts'));
});

test('open items are read from the SECTION BODY, not from the heading', () => {
  // The 2026-09-01 error in one line: the classification was written from the headings, so it
  // could not disagree with them. `What is left` saying "Nothing outstanding" is not an open item,
  // and a heading with no such word is not the absence of one.
  assert.deepEqual(openSections(NOTHING_LEFT), []);
  assert.ok(!listsOpenItems(NOTHING_LEFT));
  assert.deepEqual(openSections(OGRAF_HANDOFF), [
    'THE ONE REAL THING THIS FOUND - and it needs a decision, not a patch',
    'Also open',
  ]);

  // A section that opens with a denial and then keeps going is not empty. This is how a
  // "nothing to report, except…" handoff would otherwise read as safe to destroy.
  const denialThenDefect = [
    '## What is left',
    'Nothing blocking. Except the countdown re-arm, which still drops a frame on the second take',
    'and is the reason the scoreboard row was cut; the analysis is only here, and nobody has',
    'reproduced it outside the live rig yet, so it needs a fresh pair of eyes before the demo.',
  ].join('\n');
  assert.ok(listsOpenItems(denialThenDefect));

  // No open-item section at all, and an empty one, both say nothing is owed.
  assert.ok(!listsOpenItems('# A handoff\n\n## What landed\nEverything.\n'));
  assert.ok(!listsOpenItems('## What is left\n\n## Cost\n40 minutes.\n'));
});

test('a subsection is part of the section above it, not the end of it', () => {
  // Found in review. Closing the section at ANY heading meant open items written one subsection
  // each read as an EMPTY section, so the notice stayed silent on exactly the handoff it exists
  // to protect. No file in docs/handoffs/ uses that shape yet, which is why nothing caught it.
  const subsections = [
    '# A handoff',
    '',
    '## What is left',
    '',
    '### The countdown re-arm',
    'It drops a frame on the second take. The analysis is only here.',
    '',
    '### The scoreboard row',
    'Cut for time.',
    '',
    '## Cost',
    '40 minutes.',
  ].join('\n');
  assert.deepEqual(openSections(subsections), ['What is left']);

  // A deeper heading inside a section that is NOT about open items is still judged on its own.
  assert.deepEqual(openSections('## What landed\nEverything.\n\n### Not done here\nThe second half.\n'), [
    'Not done here',
  ]);
});

test('a bulleted denial is a LIST, not an empty section', () => {
  // Also found in review. Stripping the list marker before the "nothing" test made
  // `- None of the checker work is done` read as "None", and the section as empty. Erring towards
  // firing is the right side of this one: the cost of staying silent is a lost analysis.
  assert.deepEqual(openSections('## Also open\n\n- None of the OGraf checker work is done; see the backlog.\n'), [
    'Also open',
  ]);
  // The folder's own plain-prose spelling still reads as empty.
  assert.deepEqual(openSections('## What is left\n\nNothing outstanding on this branch.\n'), []);
  assert.deepEqual(openSections('## What is left\n\n> None.\n'), []);
});

test('what counts as a recorded trace, and what only looks like one', () => {
  // `consumed` and `owner` ARE the trace: a row was written from it, or a person was handed it.
  assert.ok(recordsTheTrace({ cls: 'consumed', trace: '-> row C' }));
  assert.ok(recordsTheTrace({ cls: 'owner', trace: 'owner-queue item x' }));
  assert.ok(recordsTheTrace({ cls: 'spent', trace: '- every open item is in docs/backlog/x.md' }));

  // A bare `spent:` is the 2026-09-01 shape exactly - a class written from the headings with
  // nothing after it to check.
  assert.ok(!recordsTheTrace({ cls: 'spent', trace: '' }));
  // `deferred` is a decision to KEEP the file, so it records nothing about destroying it.
  assert.ok(!recordsTheTrace({ cls: 'deferred', trace: 'SVG area held elsewhere' }));
  assert.ok(!recordsTheTrace(null));
});

test('THE 2026-09-01 CASE: deleting the OGraf handoff on that day fires', () => {
  // Classified `spent` from its headings, with nothing after the colon. This is the deletion that
  // destroyed the only analysis of an unfixed defect.
  const plan = '## Handoffs\n\n- spent: https://github.com/NoaCG/NoaCG-Studio/blob/b0750116f7d3e60be8a70103eff21fc36cee22c1/docs/handoffs/2026-08-30-n-ograf-checker.md\n';
  const { entry } = classificationOf(
    '2026-08-30-n-ograf-checker.md',
    loadPlans(['plan'], parseHandoffSection, () => plan),
  );
  const message = verdict({
    rel: 'https://github.com/NoaCG/NoaCG-Studio/blob/b0750116f7d3e60be8a70103eff21fc36cee22c1/docs/handoffs/2026-08-30-n-ograf-checker.md',
    before: OGRAF_HANDOFF,
    after: null,
    entry,
  });
  assert.ok(message, 'the wrong deletion must be reported');
  assert.match(message, /Also open/);
  assert.match(message, /git restore docs\/handoffs\/2026-08-30-n-ograf-checker\.md/);
  assert.match(message, /with no trace after it/);

  // The same file with NO plan line at all - the other half of the same failure.
  assert.ok(verdict({ rel: 'https://github.com/NoaCG/NoaCG-Studio/blob/b0750116f7d3e60be8a70103eff21fc36cee22c1/docs/handoffs/2026-08-30-n-ograf-checker.md', before: OGRAF_HANDOFF, after: null, entry: null }));
});

test('THE CASE THAT MUST NOT FIRE: a classified deletion in a wave row', () => {
  // A wave row that drains the folder deletes several handoffs on purpose, and the plan records
  // where each one's items went. Blocking or nagging that is blocking the mechanism the whole
  // classification exists to serve - and one wave row does exactly this every wave.
  const plan = [
    '## Handoffs',
    '',
    '- consumed: https://github.com/NoaCG/NoaCG-Studio/blob/b0750116f7d3e60be8a70103eff21fc36cee22c1/docs/handoffs/2026-08-30-n-ograf-checker.md -> row C (its "ONE REAL THING" section',
    '  is C\'s why; the other open items are carried in https://github.com/NoaCG/NoaCG-Studio/blob/745c6f2dcd9ce5e82cc6655c652e08f0568800fd/docs/backlog/ograf-checker-83-rules.md)',
    '- spent: https://github.com/NoaCG/NoaCG-Studio/blob/8c0848c0de782b6de8600f3873021717d25e5547/docs/handoffs/2026-09-01-d-prompt-rigor.md - "Nothing outstanding on this branch"',
    '- owner: https://github.com/NoaCG/NoaCG-Studio/blob/8c0848c0de782b6de8600f3873021717d25e5547/docs/handoffs/2026-09-01-f-worktree-preview.md -> the wave-end questionnaire',
    '',
    '## Rows',
  ].join('\n');
  const classified = parseHandoffSection(plan);
  for (const name of [
    '2026-08-30-n-ograf-checker.md',
    '2026-09-01-d-prompt-rigor.md',
    '2026-09-01-f-worktree-preview.md',
  ]) {
    const message = verdict({
      rel: `docs/handoffs/${name}`,
      before: OGRAF_HANDOFF, // the richest possible content, to prove the RECORD is what decides
      after: null,
      entry: classified.get(name) ?? null,
    });
    assert.equal(message, null, `a recorded deletion must be silent: ${name}`);
  }

  // The same file, the same day, two different plans: this is the whole point of keying on the
  // record rather than on the document. Reading the headings can only ever give one answer.
  const sloppy = parseHandoffSection('## Handoffs\n- spent: 2026-08-30-n-ograf-checker.md\n');
  assert.ok(verdict({ rel: 'https://github.com/NoaCG/NoaCG-Studio/blob/b0750116f7d3e60be8a70103eff21fc36cee22c1/docs/handoffs/2026-08-30-n-ograf-checker.md', before: OGRAF_HANDOFF, after: null, entry: sloppy.get('2026-08-30-n-ograf-checker.md') }));
});

test('the ordinary things that must stay silent', () => {
  const rel = 'docs/handoffs/2026-09-02-d-thing.md';
  // A handoff that leaves nothing behind, deleted with no plan at all.
  assert.equal(verdict({ rel, before: NOTHING_LEFT, after: null, entry: null }), null);
  // A file that did not exist before: a Write creating a new handoff.
  assert.equal(verdict({ rel, before: null, after: OGRAF_HANDOFF, entry: null }), null);
  // A session UPDATING its own handoff - the open items survive the write, so nothing was lost.
  // Without this, the notice would fire on every handoff anybody ever edits.
  assert.equal(verdict({ rel, before: OGRAF_HANDOFF, after: `${OGRAF_HANDOFF}\n\n## Cost\n40 minutes.\n`, entry: null }), null);
  // An overwrite that DROPS them is the case the Write half exists for.
  assert.ok(verdict({ rel, before: OGRAF_HANDOFF, after: NOTHING_LEFT, entry: null }));
});

test('the newest plan that mentions the file wins, and an unreadable plan says nothing', () => {
  const plans = ['missing-plan.local.md', 'newer', 'older'];
  const texts = new Map([
    ['newer', '## Handoffs\n- spent: a.md - traced into docs/backlog/x.md\n'],
    ['older', '## Handoffs\n- spent: a.md\n- consumed: b.md -> row A\n'],
  ]);
  const read = (planPath) => {
    if (!texts.has(planPath)) throw new Error('no such plan');
    return texts.get(planPath);
  };

  // A plan that cannot be read is SKIPPED rather than treated as "nothing is classified" - the
  // wave plan is a gitignored file that may simply not be in this checkout.
  const loaded = loadPlans(plans, parseHandoffSection, read);
  assert.equal(loaded.length, 2, 'the unreadable plan is dropped and the other two are kept');
  const found = classificationOf('a.md', loaded);
  assert.equal(found.entry.trace, 'traced into docs/backlog/x.md');
  assert.equal(found.planPath, 'newer');
  // A file no plan mentions comes back null, which is different from an untraced classification.
  assert.equal(classificationOf('c.md', loaded).entry, null);
  // A file only the older plan names is still found there.
  assert.equal(classificationOf('b.md', loaded).planPath, 'older');
});
