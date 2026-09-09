// The gate is only worth its build seconds if it would have caught the bug that caused it, so the
// first test is the three lines `scripts/owner-receipts.mjs` actually shipped on 2026-09-09,
// copied verbatim. The rest fence the two ways a scanner like this goes wrong: refusing a use that
// is right, and excusing one it should refuse.

import assert from 'node:assert/strict';
import test from 'node:test';

import { ALLOWED, IS_TEST, SCANNED, findBareMainRevisions, judge } from './check-landed-ref.mjs';

const shapes = (text) => findBareMainRevisions('scripts/x.mjs', text).map((hit) => hit.shape);

test('the three lines that shipped the receipts bug are all caught', () => {
  // Verbatim from scripts/owner-receipts.mjs before the fix.
  const before = [
    "  const args = ['log', '--no-merges', `--since=${since}`, '--name-only', `--format=${format}`];",
    "  const log = gitRead([...args, 'main'], root) ?? gitRead([...args, 'origin/main'], root);",
    '  const before = gitRead([\'show\', `main:${entry.path}`], root);',
    "  const diff = gitRead(['diff', '--name-status', `main...${branch}`, '--', BACKLOG_DIR], root);",
  ].join('\n');
  const found = findBareMainRevisions('scripts/owner-receipts.mjs', before);
  assert.deepEqual(found.map((hit) => hit.line), [2, 3, 4]);
  assert.deepEqual(found.map((hit) => hit.shape), [
    'a bare revision in a git argv',
    'a revision range or path',
    'a revision range or path',
  ]);
});

test('every revision suffix git reads is a hit, and the fixed form is not', () => {
  assert.deepEqual(shapes('const d = git([`main...${b}`]);'), ['a revision range or path']);
  assert.deepEqual(shapes("const d = git(['main..HEAD']);"), ['a revision range or path']);
  assert.deepEqual(shapes('const d = git([`main:${p}`]);'), ['a revision range or path']);
  assert.deepEqual(shapes("const d = git(['main^']);"), ['a revision range or path']);
  assert.deepEqual(shapes("const d = git(['main~2']);"), ['a revision range or path']);
  // What the fix looks like: the ref is a value, and `origin/main` is not the local branch.
  assert.deepEqual(shapes('const d = git([`${landedRef(root)}...${b}`]);'), []);
  assert.deepEqual(shapes('const d = git([`origin/main...${b}`]);'), []);
});

test('a comparison against the current branch name is never a hit, however close a git verb sits', () => {
  assert.deepEqual(shapes("const sha = git(['rev-parse', 'HEAD']);\nif (branch === 'main') return null;"), []);
  assert.deepEqual(shapes("const sha = git(['rev-list', '--count', ref]);\nif (name !== 'main') keep();"), []);
});

test('a bare argv main is a hit only near a verb that consumes a revision', () => {
  assert.deepEqual(shapes("const r = git(['merge-base', 'HEAD', 'main']);"), ['a bare revision in a git argv']);
  // Split across lines, which is how the receipts bug was written.
  assert.deepEqual(shapes("const args = ['rev-list', '--count'];\nconst r = git([...args, 'main']);"), ['a bare revision in a git argv']);
  // Beyond the window, and with no verb at all: a scanner cannot see these, and says so.
  assert.deepEqual(shapes("const args = ['rev-list'];\n\n\n\nconst r = git([...args, 'main']);"), []);
  assert.deepEqual(shapes("gh(['pr', 'create', '--base', 'main']);"), []);
});

test('the local branch spelled in full is the same branch, and a refspec is not', () => {
  assert.deepEqual(shapes('const d = git([`refs/heads/main...${b}`]);'), ['a revision range or path']);
  assert.deepEqual(shapes("const r = git(['merge-base', 'HEAD', 'refs/heads/main']);"), ['a bare revision in a git argv']);
  // A fetch refspec names main ON THE SERVER; it is what keeps origin/main fresh.
  assert.deepEqual(shapes("git(['fetch', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main']);"), []);
  // A revision-and-path is still a hit, and looks superficially similar.
  assert.deepEqual(shapes('const t = git([`main:refs.md`]);'), ['a revision range or path']);
});

test('a comment may name the bug it explains', () => {
  assert.deepEqual(shapes('// never diff `main...${branch}` here - read the landed ref\nconst r = 1;'), []);
  assert.deepEqual(shapes(' * `changed` is `git diff --name-status main...<branch>`\nconst r = 1;'), []);
});

test('the scan covers shipped scripts and skips their tests', () => {
  assert.ok(SCANNED.test('scripts/jobs.mjs'));
  assert.ok(SCANNED.test('cli/scripts/build-skill.mjs'));
  assert.ok(!SCANNED.test('src/model/design.ts'));
  assert.ok(!SCANNED.test('scripts/notes.md'));
  // Tests build their own repositories, where a local `main` is the only ref there is.
  assert.ok(IS_TEST.test('scripts/merge-order.test.mjs'));
});

test('an exemption excuses its own line and nothing else', () => {
  const allowed = [{ file: 'scripts/a.mjs', fragment: "'--quiet', 'main'", why: 'an existence probe.' }];
  const hits = [
    { file: 'scripts/a.mjs', text: "git(['rev-parse', '--verify', '--quiet', 'main']);", line: 1 },
    { file: 'scripts/b.mjs', text: "git(['rev-parse', '--verify', '--quiet', 'main']);", line: 1 },
  ];
  const verdict = judge(hits, allowed);
  assert.equal(verdict.exempt, 1);
  assert.deepEqual(verdict.problems.map((hit) => hit.file), ['scripts/b.mjs']);
  assert.deepEqual(verdict.stale, []);
});

test('an exemption that matches nothing is itself a failure, so it cannot outlive its line', () => {
  const allowed = [{ file: 'scripts/a.mjs', fragment: "'main'", why: 'fixed since.' }];
  const verdict = judge([], allowed);
  assert.equal(verdict.stale.length, 1);
});

test('every shipped exemption names a file, a fragment and a reason a reader can act on', () => {
  assert.ok(ALLOWED.length > 0, 'an empty allowlist means the gate stopped resolving its exemptions');
  for (const entry of ALLOWED) {
    assert.match(entry.file, /^(scripts|cli)\//);
    assert.ok(entry.fragment.length > 0);
    assert.ok(entry.why.length > 40, `${entry.file}: the reason must say why the bare ref is right, not that it is`);
  }
});
