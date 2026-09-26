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
import { folderContracts, loadedGuidance, missingRules, text } from './rules.mjs';

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

test('native loads omit only delivered contracts and IDs, preserving missing sibling guidance', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'rules-loaded-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (rel, body) => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), body);
  };
  put('src/AGENTS.md', `<!-- ${GENERATED_MARKER} -->\r\n- **rule** \`a/native\`: Already loaded.\r\n`);
  put('src/tickers/AGENTS.md', '# ticker grammar\n');
  put('e2e/AGENTS.md', '# sibling guidance\n');
  const targets = ['src/tickers/a.ts', 'e2e/a.ts'];
  const loaded = loadedGuidance(['src/AGENTS.md', path.join(root, 'src/tickers/AGENTS.md')], root);
  const remaining = folderContracts(targets, root).filter((c) => !loaded.contracts.has(c.contract));
  assert.deepEqual(remaining.map((c) => c.contract), ['e2e/AGENTS.md']);
  const rule = (id, scope, fires = 'contract') => ({ id, scope, fires, status: 'active' });
  const rules = [
    rule('a/native', ['src/**']), rule('a/sibling', ['e2e/**']),
    rule('a/cross-file', ['src/tickers/a.ts', 'e2e/a.ts']),
    rule('a/root', ['**']), rule('a/carried', ['src/**'], 'gate:carrier'),
    rule('a/unproven', ['src/**'], 'gate:missing'),
  ];
  put('scripts/carrier.mjs', "console.error(rules.text('a/carried'));\n");
  assert.deepEqual(missingRules(rules, targets, loaded, root).map((r) => r.id),
    ['a/cross-file', 'a/unproven', 'a/sibling']);
  assert.ok(missingRules(rules, targets, loadedGuidance([], root), root).some((r) => r.id === 'a/native'),
    'a root-started session must still receive every scoped rule');
  assert.throws(() => loadedGuidance(['../AGENTS.md'], root), /inside this checkout/);
  assert.throws(() => loadedGuidance(['missing/AGENTS.md'], root), /ENOENT/);
});
