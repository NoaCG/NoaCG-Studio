// `rules.text(id)` is what a hook or gate prints when it refuses, so it must return the rule's
// sentence alone - no frontmatter - and throw rather than print nothing for an id that is gone.
// `folderContracts` is how a Codex session started at the root receives a folder's hand-written
// contract, so it must give each one on the paths exactly once.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { GENERATED_MARKER } from './contracts-lib.mjs';
import { folderContracts, text } from './rules.mjs';

test('text returns the rule sentence without its frontmatter', () => {
  const sentence = text('root/validate-before-export-block-export-errors');
  assert.match(sentence, /^Validate before export/);
  assert.doesNotMatch(sentence, /scope:|---/);
});

test('text throws on an id that is not in the store', () => {
  assert.throws(() => text('root/no-such-rule-anywhere'), /no rule `root\/no-such-rule-anywhere`/);
});

test('folderContracts gives each hand-written contract on the paths once, and skips generated ones and the root', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'rules-'));
  const put = (rel, body) => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), body);
  };
  put('AGENTS.md', '# root\n');
  put('src/AGENTS.md', `<!-- ${GENERATED_MARKER} -->\n# src\n`);
  put('src/templates/tickers/AGENTS.md', '# tickers\nA colon ends a kicker.\n');
  put('src/templates/tickers/tk01.ts', '');
  put('src/templates/tickers/tk02.ts', '');
  const found = folderContracts(['src/templates/tickers/tk01.ts', 'src/templates/tickers/tk02.ts', 'src/templates/tickers'], root);
  assert.deepEqual(found.map((c) => c.contract), ['src/templates/tickers/AGENTS.md']);
  assert.match(found[0].text, /A colon ends a kicker/);
  rmSync(root, { recursive: true, force: true });
});
