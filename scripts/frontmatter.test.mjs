// The front-matter parser: scalars, folded blocks, quoted values that run on across lines, escapes,
// and the trailing-comment rule that applies only to an unquoted value.
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseFrontmatter } from './frontmatter.mjs';

test('parseFrontmatter reads scalars, folded blocks and trailing comments', () => {
  const parsed = parseFrontmatter('---\nsource: owner\nstate: unstarted   # still\nasked: >-\n  make the byte budget\n  real\n---\n# T\n');
  assert.equal(parsed.data.source, 'owner');
  assert.equal(parsed.data.state, 'unstarted');
  assert.equal(parsed.data.asked, 'make the byte budget real');
  assert.equal(parsed.body, '# T\n');
  assert.equal(parseFrontmatter('# no front matter\n'), null);
});

test('a quoted value keeps its hash, an unquoted one loses a trailing comment, and a byte order mark is tolerated', () => {
  const quoted = parseFrontmatter('---\nasked: "fix the #ticker kicker bug (#42)"\nnote: plain # a real comment\n---\n');
  assert.equal(quoted.data.asked, 'fix the #ticker kicker bug (#42)');
  assert.equal(quoted.data.note, 'plain');
  const bom = parseFrontmatter('﻿---\nsource: owner\n---\n# T\n');
  assert.equal(bom.data.source, 'owner');
});

test('a quoted value runs on to its closing quote instead of losing every continuation line', () => {
  // The shape twelve real files used. The old parser kept the opening quote and dropped lines 2-4.
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
  // matter that is merely malformed must not silently lose the next field.
  const unclosed = parseFrontmatter('---\nasked: "it never closes\n  and runs on\nstate: unstarted\n---\n');
  assert.equal(unclosed.data.asked, 'it never closes and runs on');
  assert.equal(unclosed.data.state, 'unstarted');
  // An ESCAPED quote at the end of a line does not close the scalar, and reaches the report as the
  // character it means; truncating there would be the same silent loss in a new place.
  const escaped = parseFrontmatter('---\nfound: "he said \\"it never gets taller\\"\n  and the rest MUST survive"\n---\n');
  assert.equal(escaped.data.found, 'he said "it never gets taller" and the rest MUST survive');
  // The single-quoted spelling of the same thing: `\'\'` is one literal quote, not the end.
  const doubled = parseFrontmatter("---\nnote: 'it''s not done\n  yet'\n---\n");
  assert.equal(doubled.data.note, "it's not done yet");
  assert.equal(parseFrontmatter('---\nasked: "\\\\ and \\"quoted\\""\n---\n').data.asked, '\\ and "quoted"');
});

test('a trailing hash comment on an unquoted value is read as YAML and named in commented', () => {
  const parsed = parseFrontmatter('---\nstate: unstarted   # still\nnote: landed abc1234 # and the rest\n---\n');
  assert.deepEqual(parsed.commented, ['state', 'note']);
  assert.equal(parsed.data.note, 'landed abc1234');
});
