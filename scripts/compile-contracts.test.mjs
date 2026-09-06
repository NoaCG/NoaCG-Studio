// The rule store and its compiler: the format a rule must have, what the compiler refuses, and
// the shape of what it writes. Fixtures are built in a temp directory so the real store is never
// touched, and every refusal is pinned in BOTH directions (the fault, and the innocent case).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  compileOutputs, findDuplicates, globMatches, groupSlug, idOf, loadRules, parseRule, rulesFor, similarity, splitList, symbolsOf,
} from './contracts-lib.mjs';
import { drift, plan, write } from './compile-contracts.mjs';

const GOOD = `---
v: 1
scope: src/components/wizard/**, src/templates/shared/base.ts
kind: trap
fires: contract
status: active
since: 2026-09-02
---
An input-only value lives in a holder carrying \`class="noacg-data-source"\`, never an inline \`style="display:none"\`.
`;

const withBody = (text) => GOOD.replace(/^An input.*$/m, text);

function store(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'contracts-'));
  for (const [rel, text] of Object.entries(files)) {
    const file = path.join(root, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text, 'utf8');
  }
  return root;
}

test('idOf derives the id from the path and nothing else', () => {
  assert.equal(idOf('contracts/rules/wizard/data-source-holder.md'), 'wizard/data-source-holder');
  assert.equal(idOf('contracts\\rules\\wizard\\x.md'), 'wizard/x');
  assert.equal(idOf('contracts/rules/x.md'), null);
  assert.equal(idOf('docs/x.md'), null);
});

test('a well-formed rule parses with no problems and keeps its symbols; CRLF reads the same', () => {
  const { rule, problems } = parseRule('contracts/rules/wizard/data-source-holder.md', GOOD);
  assert.deepEqual(problems, []);
  assert.equal(rule.id, 'wizard/data-source-holder');
  assert.equal(rule.v, 1);
  assert.deepEqual(rule.scope, ['src/components/wizard/**', 'src/templates/shared/base.ts']);
  assert.deepEqual(rule.symbols, ['class="noacg-data-source"', 'style="display:none"']);
  const crlf = parseRule('contracts/rules/wizard/data-source-holder.md', GOOD.replace(/\n/g, '\r\n'));
  assert.deepEqual(crlf.problems, []);
  assert.equal(crlf.rule.body, rule.body);
});

test('the format is versioned: a missing v reads as 1, an unknown v is refused', () => {
  assert.deepEqual(parseRule('contracts/rules/a/b.md', GOOD.replace('v: 1\n', '')).problems, []);
  const { problems } = parseRule('contracts/rules/a/b.md', GOOD.replace('v: 1', 'v: 2'));
  assert.match(problems[0], /format version 2 is not 1/);
});

test('splitList keeps a brace group whole, so a scope agrees with the matcher', () => {
  assert.deepEqual(splitList('src/**/*.{ts,tsx}, e2e/*.ts'), ['src/**/*.{ts,tsx}', 'e2e/*.ts']);
  assert.deepEqual(splitList(' a ,, b '), ['a', 'b']);
  assert.deepEqual(splitList(undefined), []);
  const { rule } = parseRule('contracts/rules/a/b.md', GOOD.replace(/scope: .*/, 'scope: src/**/*.{ts,tsx}'));
  assert.deepEqual(rule.scope, ['src/**/*.{ts,tsx}']);
  assert.equal(rulesFor([rule], 'src/a/b.tsx').length, 1);
});

test('a rule carrying evidence is refused, naming what it carries', () => {
  for (const [text, expect] of [
    ['Measured 2026-09-03, keep the holder hidden.', 'a date'],
    ['Run 33905531739 showed the holder airing.', 'a run id'],
    ['The chain must keep 4 KB free.', 'a measurement'],
    ['A quarter is 40% of the corpus.', 'a measurement'],
    ['It took 12 minutes.', 'a measurement'],
  ]) {
    const { problems } = parseRule('contracts/rules/a/b.md', withBody(text));
    assert.equal(problems.length, 1, text);
    assert.match(problems[0], new RegExp(expect));
  }
  const allowed = GOOD.replace('---\nAn', 'allow-numbers: true\n---\nKeep 4 KB free. An');
  assert.deepEqual(parseRule('contracts/rules/a/b.md', allowed).problems, []);
  assert.deepEqual(parseRule('contracts/rules/a/b.md', withBody('Prefer `minutes` over `ms` in copy.')).problems, [], 'a unit word alone is not a measurement');
});

test('missing or wrong frontmatter fields are each named', () => {
  const bad = GOOD.replace('kind: trap', 'kind: story').replace('since: 2026-09-02', 'since: yesterday').replace('fires: contract', 'fires: magic');
  const { problems } = parseRule('contracts/rules/a/b.md', bad);
  assert.equal(problems.length, 3);
  assert.match(problems.join('\n'), /kind must be one of/);
  assert.match(problems.join('\n'), /since must be a date/);
  assert.match(problems.join('\n'), /fires must be/);
});

test('similarity is high for a paraphrase about the same symbols and low for unrelated rules', () => {
  const a = 'A hidden holder carries `class="noacg-data-source"`, never an inline `style="display:none"`.';
  const b = 'Use `class="noacg-data-source"` on the holder instead of an inline `style="display:none"`.';
  const c = 'Every persisted format carries a version and a breaking change ships its migration.';
  assert.ok(similarity(a, b) >= 0.6, `paraphrase scored ${similarity(a, b)}`);
  assert.ok(similarity(a, c) < 0.2, `unrelated scored ${similarity(a, c)}`);
  assert.equal(symbolsOf(c).length, 0);
});

test('loadRules refuses a fires: target that is not in the tree, accepts one that is, and marks it carried', () => {
  const root = store({
    'contracts/rules/a/hooked.md': GOOD.replace('fires: contract', 'fires: hook:guard-edit'),
    'contracts/rules/a/gated.md': GOOD.replace('fires: contract', 'fires: gate:check-copy').replace('holder', 'panel'),
    'scripts/check-copy.mjs': '// exists',
  });
  const { rules, problems } = loadRules(root);
  assert.equal(rules.length, 2);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /scripts\/hooks\/guard-edit\.mjs does not exist/);
  assert.equal(rules.find((r) => r.id === 'a/gated').carried, true);
  assert.equal(rules.find((r) => r.id === 'a/hooked').carried, false);
  rmSync(root, { recursive: true, force: true });
});

test('two active rules that read as one fail the plan; a retired twin does not; outputs are rendered either way', () => {
  const twin = GOOD.replace('never an inline', 'and never an inline');
  const root = store({ 'contracts/rules/a/one.md': GOOD, 'contracts/rules/a/two.md': twin });
  const { rules } = loadRules(root);
  assert.equal(findDuplicates(rules).length, 1);
  const first = plan(root);
  assert.match(first.problems.join('\n'), /read as the same rule/);
  assert.ok(first.outputs.size > 0, 'a plan with problems still renders, so write() can never erase the tree');
  writeFileSync(path.join(root, 'contracts/rules/a/two.md'), twin.replace('status: active', 'status: retired'), 'utf8');
  const second = plan(root);
  assert.deepEqual(second.problems, []);
  rmSync(root, { recursive: true, force: true });
});

test('the compiler groups by scope set, writes paths-scoped files, and spends nothing on a carried rule', () => {
  const root = store({
    'contracts/rules/wizard/holder.md': GOOD,
    'contracts/rules/wizard/other.md': GOOD.replace('kind: trap', 'kind: taste').replace(/^An input.*$/m, 'Prefer the plain word in wizard copy.'),
    'contracts/rules/root/version.md': GOOD.replace(/scope: .*/, 'scope: **').replace('kind: trap', 'kind: invariant').replace(/^An input.*$/m, 'Every persisted format carries a version.'),
    'contracts/rules/e2e/carried.md': GOOD.replace(/scope: .*/, 'scope: e2e/**').replace('fires: contract', 'fires: gate:check-copy').replace(/^An input.*$/m, 'A commit message never carries an em dash.'),
    'scripts/check-copy.mjs': '// exists',
  });
  const { rules, problems } = loadRules(root);
  assert.deepEqual(problems, []);
  const outputs = compileOutputs(rules);
  const files = [...outputs.keys()].sort();
  const wizardSlug = groupSlug(['src/components/wizard/**', 'src/templates/shared/base.ts']);
  assert.match(wizardSlug, /^src-components-wizard-[a-z0-9]{1,4}$/);
  assert.deepEqual(files, ['.claude/rules/everywhere.md', `.claude/rules/${wizardSlug}.md`, 'contracts/index.md'].sort());
  const wizard = outputs.get(`.claude/rules/${wizardSlug}.md`);
  assert.match(wizard, /^---\npaths:\n {2}- "src\/components\/wizard\/\*\*"\n {2}- "src\/templates\/shared\/base\.ts"\n---\n/);
  assert.match(wizard, /GENERATED by scripts\/compile-contracts\.mjs/);
  assert.ok(wizard.indexOf('**trap**') < wizard.indexOf('**taste**'), 'traps come before taste');
  const everywhere = outputs.get('.claude/rules/everywhere.md');
  assert.ok(!everywhere.startsWith('---'), 'a ** scope has no paths frontmatter, so it loads at launch');
  assert.ok(![...outputs.keys()].some((f) => f.includes('e2e')), 'a rule a gate carries produces no contract file');
  assert.match(outputs.get('contracts/index.md'), /gate:check-copy \(carried\)/);
  rmSync(root, { recursive: true, force: true });
});

test('the index keeps a wrapped rule on one table row', () => {
  const { rule } = parseRule('contracts/rules/a/b.md', withBody('Keep the holder\nhidden by class. Then more.'));
  rule.carried = false;
  const index = compileOutputs([rule]).get('contracts/index.md');
  assert.match(index, /\| Keep the holder hidden by class\. \|/);
});

test('write then check is clean; a hand edit or a stale file is drift', () => {
  const root = store({ 'contracts/rules/wizard/holder.md': GOOD });
  const first = plan(root);
  write(first.outputs, root);
  assert.deepEqual(drift(first.outputs, root), { changed: [], stale: [] });
  writeFileSync(path.join(root, '.claude/rules/stray.md'), 'hand-written', 'utf8');
  const generated = [...first.outputs.keys()].find((f) => f.startsWith('.claude/rules/'));
  writeFileSync(path.join(root, generated), 'edited by hand', 'utf8');
  const d = drift(first.outputs, root);
  assert.deepEqual(d.changed, [generated]);
  assert.deepEqual(d.stale, ['.claude/rules/stray.md']);
  write(first.outputs, root);
  assert.deepEqual(drift(first.outputs, root), { changed: [], stale: [] });
  rmSync(root, { recursive: true, force: true });
});

test('globMatches and rulesFor answer the on-demand lookup', () => {
  assert.ok(globMatches('src/components/wizard/**', 'src/components/wizard/steps/AiStep.tsx'));
  assert.ok(globMatches('src/components/wizard/**', 'src/components/wizard/draft.ts'));
  assert.ok(!globMatches('src/components/wizard/**', 'src/components/home/ProductionPage.tsx'));
  assert.ok(globMatches('**/*.{ts,tsx}', 'src/a/b.tsx'));
  assert.ok(!globMatches('**/*.{ts,tsx}', 'src/a/b.css'));
  assert.ok(globMatches('*.md', 'README.md'));
  assert.ok(!globMatches('*.md', 'docs/README.md'));
  const { rule } = parseRule('contracts/rules/wizard/holder.md', GOOD);
  assert.equal(rulesFor([rule], 'src/templates/shared/base.ts').length, 1);
  assert.equal(rulesFor([rule], 'src/templates/lt01.ts').length, 0);
});
