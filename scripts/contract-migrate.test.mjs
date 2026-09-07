// The migration gate's rules, pinned. Every failure here is silent by construction: a row that
// dropped a rule and a row that moved it both leave a smaller contract and a green build, and the
// only thing that tells them apart is this comparison.
import assert from 'node:assert/strict';
import test from 'node:test';

import { areaOf, survivingTokens, tokensOf } from './contract-migrate.mjs';

test('tokens are the backticked spans, normalized, and a fenced block is not one', () => {
  const text = [
    'A rule about `src/model/types.ts` and `npm run build`.',
    '',
    '```ts',
    'const example = `not a claim about the repository`;',
    'import { x } from "./y";',
    '```',
    '',
    'And `  spaced   token ` counts once.',
  ].join('\n');
  const tokens = tokensOf(text);
  assert.ok(tokens.has('src/model/types.ts'));
  assert.ok(tokens.has('npm run build'));
  assert.ok(tokens.has('spaced token'), 'whitespace is normalized so one token is one entry');
  assert.ok(!tokens.has('not a claim about the repository'), 'a fenced block is an example, not a claim');
  assert.equal(tokens.size, 3);
  assert.deepEqual([...tokensOf('')], []);
});

test('a token the replacement carries survives; one nothing carries is reported', () => {
  const { missing, allowed, problems } = survivingTokens({
    before: ['src/a.ts', 'src/b.ts', 'npm run x'],
    after: ['src/a.ts', 'npm run x'],
  });
  assert.deepEqual(missing, ['src/b.ts']);
  assert.deepEqual(allowed, []);
  assert.deepEqual(problems, []);
});

test('a deliberate drop needs a reason worth reading, and is then not a failure', () => {
  const withReason = survivingTokens({
    before: ['src/b.ts'],
    after: [],
    allow: { 'src/b.ts': 'the same helper is named by the rule that replaced both mentions' },
  });
  assert.deepEqual(withReason.missing, []);
  assert.deepEqual(withReason.allowed, ['src/b.ts']);
  assert.deepEqual(withReason.problems, []);

  const withoutReason = survivingTokens({ before: ['src/b.ts'], after: [], allow: { 'src/b.ts': 'moved' } });
  assert.deepEqual(withoutReason.missing, [], 'a thin reason still allows the drop');
  assert.equal(withoutReason.problems.length, 1, 'but it is reported, so the next reader can judge it');
  assert.match(withoutReason.problems[0], /no reason worth reading/);
});

test('an allowance for a token that did not drop is reported, so the list cannot rot', () => {
  const { problems } = survivingTokens({
    before: ['src/a.ts'],
    after: ['src/a.ts'],
    allow: { 'src/a.ts': 'this was true during an earlier row and is not any more' },
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /did not drop - delete the entry/);
});

test('the comparison is a subset test, so the store gaining tokens is never a failure', () => {
  const { missing } = survivingTokens({ before: ['a'], after: ['a', 'b', 'c'] });
  assert.deepEqual(missing, []);
});

test('missing tokens come back sorted, so two runs of the same row read the same', () => {
  const { missing } = survivingTokens({ before: ['z', 'a', 'm'], after: [] });
  assert.deepEqual(missing, ['a', 'm', 'z']);
});

test('a contract maps to the store folder its rules live under', () => {
  assert.equal(areaOf('AGENTS.md'), 'root');
  assert.equal(areaOf('src/templates/AGENTS.md'), 'templates');
  assert.equal(areaOf('src/components/wizard/AGENTS.md'), 'components-wizard');
  assert.equal(areaOf('e2e/AGENTS.md'), 'e2e');
  assert.equal(areaOf('src\\model\\AGENTS.md'), 'model', 'a Windows path names the same area');
});
