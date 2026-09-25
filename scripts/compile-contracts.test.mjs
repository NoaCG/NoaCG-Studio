// The rule store and its compiler: the format a rule must have, what the compiler refuses, and
// the shape of what it writes. Fixtures are built in a temp directory so the real store is never
// touched, and every refusal is pinned in BOTH directions (the fault, and the innocent case).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, statSync, utimesSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  compileOutputs, findDuplicates, globDirectory, globMatches, groupSlug, idOf, KERNEL_MAX_BYTES,
  kernelBudget, loadRules, parseRule, ruleHomes, rulesFor, scopeOwner, similarity, splitList, symbolsOf,
  validateAgainstTree,
} from './contracts-lib.mjs';
import { contractsUnder, degeneratePlan, drift, ownedDirectories, plan, write } from './compile-contracts.mjs';

// THE WALK SHARES THE CHECKOUT WITH EVERYTHING ELSE RUNNING IN IT. On 2026-09-10 a compile died
// inside the merge driver's test on CI (run 34537651787) while the build's other tests were
// creating and deleting `.tmp-api-runtime-*` directories at the root; doing the same by hand
// reproduces it as `ENOENT: scandir`. These pin both halves of the fix without racing for it.
test('the contract walk never enters a scratch directory, and survives one that vanishes under it', () => {
  const root = store({
    'AGENTS.md': 'root\n',
    'src/a/AGENTS.md': 'a\n',
    '.tmp-api-runtime-x/AGENTS.md': 'scratch\n',
    'gone/AGENTS.md': 'listed, then deleted\n',
  });
  try {
    assert.deepEqual(contractsUnder(root).sort(), ['AGENTS.md', 'gone/AGENTS.md', 'src/a/AGENTS.md']);
    // `gone` is listed by its parent and deleted before the walk reads it - the race, on cue.
    const vanishing = (dir, options) => {
      if (path.basename(dir) === 'gone') throw Object.assign(new Error(`ENOENT: scandir '${dir}'`), { code: 'ENOENT' });
      return readdirSync(dir, options);
    };
    assert.deepEqual(contractsUnder(root, '', [], vanishing).sort(), ['AGENTS.md', 'src/a/AGENTS.md']);
    // The ROOT missing is not an empty tree: a compile of nothing would erase every contract.
    assert.throws(() => contractsUnder(path.join(root, 'no-such-root')), /ENOENT/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('write leaves a file whose bytes are already right untouched', () => {
  // A rewrite is made observable by the file's modification time, pinned to a moment long past:
  // a write moves it to now, skipping the write leaves it where it was. (It used to be made
  // read-only and a write expected to THROW - which root ignores, so every cloud container, where
  // sessions run as root, failed this test with nothing wrong.) The second call proves the
  // fixture would catch a write.
  const root = store({ 'same.md': 'unchanged\n' });
  const file = path.join(root, 'same.md');
  const past = new Date('2020-01-01T00:00:00Z');
  utimesSync(file, past, past);
  try {
    write(new Map([['same.md', 'unchanged\n']]), root);
    assert.equal(statSync(file).mtimeMs, past.getTime(), 'an unchanged file was rewritten');
    write(new Map([['same.md', 'changed\n']]), root);
    assert.notEqual(statSync(file).mtimeMs, past.getTime(), 'the fixture did not see a real write');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

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

test('a fires: target must exist AND print the rule before the rule counts as carried', () => {
  const root = store({
    'contracts/rules/a/hooked.md': GOOD.replace('fires: contract', 'fires: hook:guard-edit'),
    'contracts/rules/a/gated.md': GOOD.replace('fires: contract', 'fires: gate:check-copy').replace('holder', 'panel'),
    'scripts/check-copy.mjs': "console.error(rules.text('a/gated'));",
  });
  const { rules, problems } = loadRules(root);
  assert.equal(rules.length, 2);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /scripts\/hooks\/guard-edit\.mjs does not exist/);
  assert.equal(rules.find((r) => r.id === 'a/gated').carried, true);
  assert.equal(rules.find((r) => r.id === 'a/hooked').carried, false);
  rmSync(root, { recursive: true, force: true });
});

// A CARRIED RULE IS DELETED FROM EVERY LOADED SURFACE, so a mechanism that merely EXISTS is not
// enough - four rules vanished that way on 2026-09-08 and reappeared nowhere.
test('a mechanism that exists but never prints the rule is refused, and the rule stays in the contracts', () => {
  const root = store({
    'contracts/rules/a/gated.md': GOOD.replace('fires: contract', 'fires: gate:check-copy'),
    'scripts/check-copy.mjs': '// exists, and says nothing about the rule',
  });
  const { rules, problems } = loadRules(root);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /never prints the rule - it must call `rules\.text\('a\/gated'\)`/);
  assert.equal(rules[0].carried, false, 'an unproven claim leaves the sentence in the contract, where a reader can still find it');
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
    'scripts/check-copy.mjs': "console.error(rules.text('e2e/carried'));",
  });
  const { rules, problems } = loadRules(root);
  assert.deepEqual(problems, []);
  const outputs = compileOutputs(rules);
  const files = [...outputs.keys()].sort();
  const wizardSlug = groupSlug(['src/components/wizard/**', 'src/templates/shared/base.ts']);
  assert.match(wizardSlug, /^src-components-wizard-[a-z0-9]{1,4}$/);
  assert.deepEqual(files, [`.claude/rules/${wizardSlug}.md`, 'contracts/index.md'].sort(), 'a ** rule lives in the root AGENTS.md alone');
  const wizard = outputs.get(`.claude/rules/${wizardSlug}.md`);
  assert.match(wizard, /^---\npaths:\n {2}- "src\/components\/wizard\/\*\*"\n {2}- "src\/templates\/shared\/base\.ts"\n---\n/);
  assert.match(wizard, /GENERATED by scripts\/compile-contracts\.mjs/);
  assert.ok(wizard.indexOf('**trap**') < wizard.indexOf('**taste**'), 'traps come before taste');
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

test('globDirectory takes the fixed part of a glob, and a plain path gives its directory', () => {
  assert.equal(globDirectory('src/templates/versus/**'), 'src/templates/versus');
  assert.equal(globDirectory('src/templates/shared/base.ts'), 'src/templates/shared');
  assert.equal(globDirectory('src/components/wizard/*.tsx'), 'src/components/wizard');
  assert.equal(globDirectory('e2e/**/*.spec.ts'), 'e2e');
  assert.equal(globDirectory('**'), '');
});

test('a rule spanning two directories belongs to their common ancestor; ** belongs to the kernel', () => {
  assert.equal(scopeOwner(['src/templates/versus/**']), 'src/templates/versus');
  assert.equal(scopeOwner(['src/components/wizard/**', 'src/templates/shared/base.ts']), 'src');
  assert.equal(scopeOwner(['**']), '');
});

test('a nested contract is written only for a directory the compiler owns', () => {
  const versus = GOOD.replace(/scope: .*/, 'scope: src/templates/versus/**').replace(/^An input.*$/m, 'A versus design declares steps 1.');
  const { rules } = loadRules(store({ 'contracts/rules/templates-versus/steps.md': versus }));
  const unowned = compileOutputs(rules, new Set());
  assert.ok(![...unowned.keys()].some((f) => f.endsWith('AGENTS.md')), 'an unmigrated directory keeps its hand-written contract');
  const owned = compileOutputs(rules, new Set(['src/templates/versus']));
  assert.ok(owned.has('src/templates/versus/AGENTS.md'));
  assert.ok(owned.has('src/templates/versus/.gitattributes'), 'the merge driver is registered beside the contract, never in the shared root file');
  assert.match(owned.get('src/templates/versus/AGENTS.md'), /GENERATED by scripts\/compile-contracts\.mjs/);
  assert.match(owned.get('src/templates/versus/AGENTS.md'), /A versus design declares steps 1\./);
  assert.match(owned.get('src/templates/versus/.gitattributes'), /AGENTS\.md merge=noacg-contracts/);
  assert.ok(!owned.has('src/templates/versus/CLAUDE.md'), 'Claude reads these from .claude/rules, so a wrapper would charge it twice');
});

test('the deepest owned directory wins, and a rule above every owned one gets no nested file', () => {
  const deep = GOOD.replace(/scope: .*/, 'scope: src/templates/versus/**').replace(/^An input.*$/m, 'Deep rule.');
  const wide = GOOD.replace(/scope: .*/, 'scope: src/templates/**').replace(/^An input.*$/m, 'Wide rule.');
  const { rules } = loadRules(store({
    'contracts/rules/a/deep.md': deep,
    'contracts/rules/a/wide.md': wide,
  }));
  const outputs = compileOutputs(rules, new Set(['src/templates', 'src/templates/versus']));
  assert.match(outputs.get('src/templates/versus/AGENTS.md'), /Deep rule\./);
  assert.ok(!outputs.get('src/templates/versus/AGENTS.md').includes('Wide rule.'), 'a rule sits in one contract, the deepest that owns it');
  assert.match(outputs.get('src/templates/AGENTS.md'), /Wide rule\./);
  const none = compileOutputs(rules, new Set());
  assert.ok(![...none.keys()].some((f) => f.endsWith('AGENTS.md')));
});

test('ownedDirectories reads the marker, and never invents a contract where none stood', () => {
  const root = store({
    'src/templates/versus/AGENTS.md': '<!-- GENERATED by scripts/compile-contracts.mjs -->\n# versus\n',
    'src/templates/lowerThirds/AGENTS.md': '# lowerThirds\n\nHand-written prose.\n',
    'src/store/index.ts': 'export const x = 1;\n',
  });
  const owned = ownedDirectories(root);
  assert.deepEqual([...owned], ['src/templates/versus']);
  assert.ok(!owned.has('src/templates/lowerThirds'), 'a hand-written contract is never overwritten');
  assert.ok(!owned.has('src/store'), 'recording a rule about a directory must not invent a contract there');
  assert.ok(!owned.has('src'), 'and certainly not one in a position forty chains would load');
  rmSync(root, { recursive: true, force: true });
});

test('a nested contract the store stops producing is stale, and write removes it', () => {
  const versus = GOOD.replace(/scope: .*/, 'scope: src/templates/versus/**').replace(/^An input.*$/m, 'A versus design declares steps 1.');
  const root = store({
    'contracts/rules/templates-versus/steps.md': versus,
    // The area is already migrated, which is the only way its contract gets generated at all.
    'src/templates/versus/AGENTS.md': '<!-- GENERATED by scripts/compile-contracts.mjs -->\n',
  });
  const owned = ownedDirectories(root);
  const { rules } = loadRules(root);
  const outputs = compileOutputs(rules, owned);
  write(outputs, root, owned);
  assert.deepEqual(drift(outputs, root, owned), { changed: [], stale: [] });
  // Deleting the area's LAST rule must not strand its contract: ownership is read off the file on
  // disk, so the directory stays owned long enough for the file to be found and removed.
  rmSync(path.join(root, 'contracts/rules/templates-versus/steps.md'));
  const after = plan(root);
  assert.deepEqual([...after.owned], ['src/templates/versus'], 'still owned with no rules left');
  const d = drift(after.outputs, root, after.owned);
  assert.deepEqual(d.stale, [
    '.claude/rules/src-templates-versus.md',
    'src/templates/versus/.gitattributes',
    'src/templates/versus/AGENTS.md',
  ], 'the Claude layer and the Codex contract go together - a rule leaves both');
  write(after.outputs, root, after.owned);
  assert.deepEqual(drift(after.outputs, root, after.owned), { changed: [], stale: [] });
  rmSync(root, { recursive: true, force: true });
});

// On 2026-09-23 seventeen generated files - every owned area's AGENTS.md and .gitattributes -
// were found deleted in two worktrees, committed by nothing and restored by `git checkout --`.
// The compiler resolves ownership by a marker INSIDE the files it removes, so one read that comes
// back empty takes the whole set and the next compile cannot tell the set was ever there.
test('a plan that owns several areas and produces a contract for none of them deletes nothing', () => {
  const versus = GOOD.replace(/scope: .*/, 'scope: src/templates/versus/**').replace(/^An input.*$/m, 'A versus design declares steps 1.');
  const cards = GOOD.replace(/scope: .*/, 'scope: src/templates/cards/**').replace(/^An input.*$/m, 'A card design declares its face 1.');
  const marker = '<!-- GENERATED by scripts/compile-contracts.mjs -->\n';
  const root = store({
    'contracts/rules/templates-versus/steps.md': versus,
    'contracts/rules/templates-cards/face.md': cards,
    'src/templates/versus/AGENTS.md': marker,
    'src/templates/cards/AGENTS.md': marker,
  });
  const before = plan(root);
  write(before.outputs, root, before.owned);
  assert.deepEqual(drift(before.outputs, root, before.owned), { changed: [], stale: [] });

  // The store read as empty, which is the failure: both areas are still plainly owned.
  const empty = compileOutputs([], before.owned);
  assert.equal(degeneratePlan(empty, before.owned), true);
  assert.throws(() => write(empty, root, before.owned), /REFUSED/);
  for (const rel of ['src/templates/versus/AGENTS.md', 'src/templates/cards/AGENTS.md']) {
    assert.ok(existsSync(path.join(root, rel)), `${rel} survives the refusal`);
  }

  // The innocent case, unchanged: ONE area's last rule leaves, and its contract goes with it.
  rmSync(path.join(root, 'contracts/rules/templates-versus/steps.md'));
  const after = plan(root);
  assert.equal(degeneratePlan(after.outputs, after.owned), false, 'cards still produces a contract');
  write(after.outputs, root, after.owned);
  assert.ok(!existsSync(path.join(root, 'src/templates/versus/AGENTS.md')), 'the stale contract is removed');
  assert.ok(existsSync(path.join(root, 'src/templates/cards/AGENTS.md')), 'the live one is not');
  rmSync(root, { recursive: true, force: true });
});

// The ceiling holds whatever the cause. The 2026-09-23 deletions came through a failing
// `git ls-files` inside the build's own contracts test, but a fixture plan handed to the real
// checkout removes the same files, and neither has any business taking seventeen at once.
test('a compile that would delete more than a handful of generated files refuses, and --prune allows it', () => {
  const files = {};
  for (let n = 0; n < 6; n += 1) files[`.claude/rules/group-${n}.md`] = 'generated\n';
  const root = store(files);
  const keep = new Map([['.claude/rules/group-0.md', 'generated\n']]);
  assert.throws(() => write(keep, root), /REFUSED: this compile would delete 5 generated file\(s\)/);
  for (let n = 0; n < 6; n += 1) {
    assert.ok(existsSync(path.join(root, `.claude/rules/group-${n}.md`)), `group-${n} survives`);
  }
  // Nothing is WRITTEN either: a refusal leaves the tree exactly as it found it.
  assert.equal(readdirSync(path.join(root, '.claude/rules')).length, 6);
  write(keep, root, new Set(), { prune: true });
  assert.deepEqual(readdirSync(path.join(root, '.claude/rules')), ['group-0.md']);
  rmSync(root, { recursive: true, force: true });
});

test('the kernel has a byte ceiling, because every session pays for it before touching anything', () => {
  const small = new Map([['AGENTS.md', 'x'.repeat(100)]]);
  assert.deepEqual(kernelBudget(small).problems, []);
  assert.equal(kernelBudget(small).bytes, 100);
  const huge = new Map([['AGENTS.md', 'x'.repeat(KERNEL_MAX_BYTES + 1)]]);
  assert.equal(kernelBudget(huge).problems.length, 1);
  assert.match(kernelBudget(huge).problems[0], /every session pays for it/);
  assert.deepEqual(kernelBudget(new Map()).problems, [], 'an empty store has no kernel and no problem');
});

test('a scope that matches no file is refused, because that rule would never load', () => {
  // A dead scope fails SILENTLY: the store lists the rule, the index prints it, and no session it
  // was written for ever sees it. Found on 2026-09-07 - a rule scoped to `src/components/control/**`
  // when that directory had zero files, written against where the code was going.
  const rule = GOOD.replace(/scope: .*/, 'scope: src/nowhere/**');
  const withFiles = (files) => {
    const { rule: parsed } = parseRule('contracts/rules/a/b.md', rule);
    return validateAgainstTree(parsed, '/tmp/does-not-matter', files);
  };
  assert.match(withFiles(['src/real/thing.ts']).join('\n'), /matches no file in the repository/);
  assert.deepEqual(withFiles(['src/nowhere/thing.ts']), [], 'a scope that matches is fine');
  assert.deepEqual(withFiles([]), [], 'no listing means no checkout - the check stands down rather than refusing everything');
  const everywhere = parseRule('contracts/rules/a/b.md', GOOD.replace(/scope: .*/, 'scope: **')).rule;
  assert.deepEqual(validateAgainstTree(everywhere, '/tmp', ['anything.ts']), [], '** always matches');
});

test('only a ** rule reaches the root contract; a rule spanning two owned folders goes to each', () => {
  const owned = new Set(['', 'src', 'e2e']);
  assert.deepEqual(ruleHomes(['**'], owned), ['']);
  assert.deepEqual(ruleHomes(['src/a/**', 'e2e/b.spec.ts'], owned).sort(), ['e2e', 'src']);
  assert.deepEqual(ruleHomes(['src/a/**', 'docs/x.md'], owned), ['src'], 'a glob no owned folder covers adds no home');
  assert.deepEqual(ruleHomes(['src/a/**', 'src/b/**'], owned), ['src'], 'a common owned ancestor below the root still wins');
  assert.deepEqual(ruleHomes(['docs/x.md'], new Set(['src'])), [], 'no owner at all');
});
