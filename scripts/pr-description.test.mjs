// What a landing pull request says to the person who opens it.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GENERATED_MARKER, isGeneratedBody, pullRequestBody, pullRequestTitle } from './pr-description.mjs';

test('the title is the first commit on the branch, because the last one is usually a tail', () => {
  assert.equal(pullRequestTitle(['Add the scoreboard behaviour', 'Fix the review findings'], 'b'), 'Add the scoreboard behaviour');
  assert.equal(pullRequestTitle([], 'claude/some-branch'), 'claude/some-branch');
  assert.equal(pullRequestTitle(['x'.repeat(200)], 'b').length, 120);
});

test('the description lists the commits, the review and what CI does', () => {
  const body = pullRequestBody({ subjects: ['Add the scoreboard behaviour'], tested: 'reviewed by /check at abc12345 (pass)' });
  assert.match(body, /## What changed\n\n- Add the scoreboard behaviour/);
  assert.match(body, /- reviewed by \/check at abc12345 \(pass\)/);
  assert.match(body, /GitHub runs the build/);
  assert.ok(!body.includes('## Why'), 'no why section when none was given');
});

test('a why is printed when one is given, and only then', () => {
  const body = pullRequestBody({ subjects: ['a'], tested: 't', why: 'The old field could not hold two scores.' });
  assert.match(body, /## Why\n\nThe old field could not hold two scores\./);
});

test('a long branch names twelve commits and counts the rest', () => {
  const subjects = Array.from({ length: 15 }, (_, i) => `Change ${i + 1}`);
  const body = pullRequestBody({ subjects, tested: 't' });
  assert.match(body, /- Change 12\n- and 3 more commits/);
  assert.ok(!body.includes('- Change 13'));
  assert.match(pullRequestBody({ subjects: subjects.slice(0, 13), tested: 't' }), /- and 1 more commit\n/);
});

test('a branch with no commits of its own says so rather than printing an empty list', () => {
  assert.match(pullRequestBody({ subjects: ['', '  '], tested: 't' }), /- Nothing this description can name/);
});

test('queueing again rewrites a description we wrote, and never one a person typed', () => {
  assert.equal(isGeneratedBody(pullRequestBody({ subjects: ['a'], tested: 't' })), true);
  assert.equal(isGeneratedBody(''), true, 'an empty body is ours to fill');
  assert.equal(isGeneratedBody('Landed by the queue (`npm run queue:merge`). reviewed by /check at abc (pass).'), true, 'the pre-marker one-liner');
  assert.equal(isGeneratedBody('Mirko: hold this one until the demo is over.'), false);
  assert.ok(pullRequestBody({ subjects: ['a'], tested: 't' }).includes(GENERATED_MARKER));
});
