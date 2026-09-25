// `rules.text(id)` is what a hook or gate prints when it refuses, so it must return the rule's
// sentence alone - no frontmatter - and throw rather than print nothing for an id that is gone.
import assert from 'node:assert/strict';
import test from 'node:test';

import { text } from './rules.mjs';

test('text returns the rule sentence without its frontmatter', () => {
  const sentence = text('root/validate-before-export-block-export-errors');
  assert.match(sentence, /^Validate before export/);
  assert.doesNotMatch(sentence, /scope:|---/);
});

test('text throws on an id that is not in the store', () => {
  assert.throws(() => text('root/no-such-rule-anywhere'), /no rule `root\/no-such-rule-anywhere`/);
});
