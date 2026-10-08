// What a landing pull request says to the person who opens it.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GENERATED_MARKER, firstSentences, isGeneratedBody, pullRequestBody, pullRequestTitle, riskFromBody, riskText } from './pr-description.mjs';

test('the title is the first commit on the branch, because the last one is usually a tail', () => {
  assert.equal(pullRequestTitle(['Add the scoreboard behaviour', 'Fix the review findings'], 'b'), 'Add the scoreboard behaviour');
  assert.equal(pullRequestTitle([], 'claude/some-branch'), 'claude/some-branch');
  assert.equal(pullRequestTitle(['x'.repeat(200)], 'b').length, 120);
});

test('the description is two sentences, a Risk line and a closed details block', () => {
  const body = pullRequestBody({
    subjects: ['Add the scoreboard behaviour'],
    message: 'The scoreboard now holds two scores. Operators no longer retype them.\n\nA third sentence that must be cut.',
    tested: 'reviewed by /check at abc12345 (pass)',
    risk: 'low, one field changed',
  });
  assert.equal(body, [
    'The scoreboard now holds two scores. Operators no longer retype them.',
    '',
    'Risk: low, one field changed',
    '',
    '<details>',
    '<summary>Details</summary>',
    '',
    'Tested: reviewed by /check at abc12345 (pass)',
    'GitHub runs the build and every test this change can affect before the queue merges it.',
    '',
    '- Add the scoreboard behaviour',
    '',
    '</details>',
    '',
    GENERATED_MARKER,
  ].join('\n'));
  assert.ok(!body.includes('##'), 'no template sections');
  assert.ok(!body.includes('!['), 'no image by default');
  assert.ok(!body.includes('<details open'), 'details stay closed');
});

test('a body longer than two sentences is cut to two', () => {
  assert.equal(firstSentences('One. Two! Three? Four.'), 'One. Two!');
  assert.equal(firstSentences('Version 1.2 ships. Done. More.'), 'Version 1.2 ships. Done.');
  assert.equal(firstSentences('Only one sentence'), 'Only one sentence');
});

test('an empty body falls back to the main commit subject as a sentence', () => {
  assert.ok(pullRequestBody({ subjects: ['Add the scoreboard'], message: '  \n' }).startsWith('Add the scoreboard.\n\n<details>'));
  assert.ok(pullRequestBody({ subjects: ['', ' '] }).startsWith('This branch has no commits of its own.'));
});

test('the Risk line is the session\'s sentence, else certain from the paths, else absent', () => {
  assert.equal(riskText('  Risk:  a failed save could\n lose an edit. '), 'a failed save could lose an edit.');
  assert.equal(riskText('', ['docs/GOALS.md', 'docs/whats-new/2026-10-08.md']), 'low, docs only.');
  assert.equal(riskText('medium, the save path', ['docs/A.md']), 'medium, the save path', 'a given sentence wins');
  assert.equal(riskText('', ['docs/A.md', 'scripts/jobs.mjs']), '', 'code is never guessed at');
  assert.equal(riskText('', ['AGENTS.md']), '', 'Markdown outside docs/ steers agents, so it is not docs');
  assert.equal(riskText('', ['docs/shot.png']), '');
  assert.equal(riskText('', []), '', 'no diff derives nothing');

  const derived = pullRequestBody({ subjects: ['Tidy the goals'], paths: ['docs/GOALS.md'] });
  assert.ok(derived.startsWith('Tidy the goals.\n\nRisk: low, docs only.\n\n<details>'));
  const none = pullRequestBody({ subjects: ['Fix the save'], paths: ['src/save.ts'] });
  assert.ok(!none.includes('Risk:'), 'no line rather than "not assessed"');
});

test('queueing again keeps the Risk line an earlier queueing wrote', () => {
  const earlier = pullRequestBody({ subjects: ['a'], risk: 'a failed save could lose an edit.' });
  assert.equal(riskFromBody(earlier), 'a failed save could lose an edit.');
  assert.equal(riskFromBody(pullRequestBody({ subjects: ['a'] })), '');
  assert.equal(riskFromBody('Risk: typed by a person, not ours'), '', 'a typed body is never read as ours');
  assert.equal(riskFromBody(undefined), '');
});

test('an image appears only when one is given', () => {
  assert.match(pullRequestBody({ subjects: ['a'], image: 'https://x/y.png' }), /!\[Screenshot\]\(https:\/\/x\/y\.png\)/);
  assert.ok(!pullRequestBody({ subjects: ['a'] }).includes('!['));
});

test('a why goes into the details, and a long branch counts the rest', () => {
  const subjects = Array.from({ length: 15 }, (_, i) => `Change ${i + 1}`);
  const body = pullRequestBody({ subjects, why: 'The old field could not hold two scores.' });
  assert.match(body, /Why: The old field could not hold two scores\./);
  assert.match(body, /- Change 12\n- and 3 more\n/);
  assert.ok(!body.includes('- Change 13'));
});

test('queueing again rewrites a description we wrote, and never one a person typed', () => {
  assert.equal(isGeneratedBody(pullRequestBody({ subjects: ['a'], tested: 't' })), true);
  assert.equal(isGeneratedBody(''), true, 'an empty body is ours to fill');
  assert.equal(isGeneratedBody('Landed by the queue (`npm run queue:merge`). reviewed by /check at abc (pass).'), true, 'the pre-marker one-liner');
  assert.equal(isGeneratedBody('Mirko: hold this one until the demo is over.'), false);
  assert.ok(pullRequestBody({ subjects: ['a'], tested: 't' }).includes(GENERATED_MARKER));
});
