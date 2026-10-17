// The freshness gate catches a contract naming a durable thing that is gone, and does NOT fire on
// prose, patterns, or transient-by-design files. What is pinned: which backticked tokens are read
// as checkable references, and that a missing one is flagged while a present one is not.
import assert from 'node:assert/strict';
import test from 'node:test';

import { extractRefs, staleRefs, TRANSIENT_PREFIXES, withoutRetiredRows } from './check-contract-freshness.mjs';

test('extractRefs reads repo paths and npm-run names, and ignores prose and patterns', () => {
  const text = [
    'Run `npm run build` after editing `scripts/wave-tick.mjs`.',
    'The field `f0` maps to `id="fN"` - neither is a path.',
    'See `docs/GOALS.md` and the `src/components/wizard/` area.',
    'A glob `src/templates/**/*.ts` and a placeholder `<git-common-dir>/noacg-jobs/` are skipped.',
    'A brace `benchmarks/pro/round-2026-08-0{8,9,10}/` is a pattern, not a path.',
    'A new file `docs/NEW_THING.md (new)` is exempt.',
  ].join('\n');
  const refs = extractRefs(text);
  assert.deepEqual(refs.npmScripts, ['build']);
  assert.ok(refs.paths.includes('scripts/wave-tick.mjs'));
  assert.ok(refs.paths.includes('docs/GOALS.md'));
  assert.ok(refs.dirs.includes('src/components/wizard'));
  // Not paths: the field name, the id attribute, the glob, the placeholder, the brace, the (new).
  assert.ok(!refs.paths.includes('f0'));
  assert.ok(!refs.paths.some((path) => path.includes('*')));
  assert.ok(!refs.paths.some((path) => path.includes('<')));
  assert.ok(!refs.paths.some((path) => path.includes('{')));
  assert.ok(!refs.paths.some((path) => path.includes('NEW_THING')));
});

test('a transient-by-design reference is skipped', () => {
  assert.ok(TRANSIENT_PREFIXES.includes('docs/handoffs/'));
  const refs = extractRefs('See `docs/handoffs/2026-08-29-a-thing.md` and `docs/backlog/old-idea.md`.');
  assert.deepEqual(refs.paths, []);
});

test('staleRefs flags a missing script, doc or directory and passes a present one', () => {
  const world = {
    tracked: new Set(['scripts/live.mjs', 'docs/REAL.md']),
    trackedDirs: new Set(['scripts', 'docs', 'src', 'src/here']),
    definedScripts: new Set(['build', 'test']),
  };
  const stale = staleRefs(
    { paths: ['scripts/live.mjs', 'scripts/gone.mjs', 'docs/REAL.md', 'docs/GONE.md'], dirs: ['src/here', 'src/nowhere'], npmScripts: ['build', 'ghost'] },
    world,
  );
  const refs = stale.map((entry) => entry.ref).sort();
  assert.deepEqual(refs, ['docs/GONE.md', 'npm run ghost', 'scripts/gone.mjs', 'src/nowhere/']);
  // The live ones are absent from the stale list.
  assert.ok(!refs.includes('scripts/live.mjs'));
  assert.ok(!refs.includes('src/here/'));
});

test('the rule index is checked without its retired rows, whose scopes are history', () => {
  // A retired rule keeps the scope of the code it pinned after that code is deleted (the old code
  // editor's rules name AppShell.tsx), and the index prints it in backticks like every other row.
  const index = [
    '| id | kind | fires | status | scope | rule |',
    '|---|---|---|---|---|---|',
    '| `a/live` | rule | contract | active | `src/real/thing.ts` | Keep it. |',
    '| `a/gone` | rule | contract | retired | `src/components/AppShell.tsx` | Bind undo in AppShell. |',
  ].join('\n');
  const refs = extractRefs(withoutRetiredRows(index));
  assert.deepEqual(refs.paths, ['src/real/thing.ts']);
  assert.ok(extractRefs(index).paths.includes('src/components/AppShell.tsx'), 'the raw index still names it');
});
