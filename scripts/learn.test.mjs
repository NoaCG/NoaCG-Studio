// The write path for a lesson: what `learn` decides, pinned in both directions - the lesson that
// becomes a new rule, the one that is already a rule and only adds evidence, and every refusal.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { featuresOf, parseRule } from './contracts-lib.mjs';
import { decide, renderRecord, renderRule, slugOf } from './learn.mjs';

const body = 'An input-only value lives in a holder carrying `class="noacg-data-source"`, never an inline `style="display:none"`.';
const EXISTING = {
  id: 'wizard/data-source-holder',
  path: 'contracts/rules/wizard/data-source-holder.md',
  area: 'wizard',
  scope: ['src/components/wizard/**'],
  kind: 'trap',
  fires: 'contract',
  status: 'active',
  since: '2026-09-02',
  supersedes: [],
  record: '',
  body,
  features: featuresOf(body),
};

const input = (overrides = {}) => ({
  area: 'wizard',
  scope: ['src/components/wizard/**'],
  kind: 'trap',
  fires: 'contract',
  rule: 'A wizard step never writes the draft from a render; it calls `onDraft` from an event handler.',
  supersedes: [],
  allowNumbers: false,
  ...overrides,
});

function root(files = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'learn-'));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text, 'utf8');
  }
  return dir;
}

test('slugOf is six significant words, symbols and stopwords excluded, and never empty', () => {
  assert.equal(slugOf('A wizard step never writes the `draft` from a render; it calls `onDraft`.'), 'wizard-step-never-writes-render-calls');
  assert.equal(slugOf('`x`'), 'rule');
});

test('a fresh lesson becomes a new rule with an id nobody else would mint', () => {
  const verdict = decide(input(), [EXISTING]);
  assert.equal(verdict.action, 'new');
  assert.equal(verdict.id, 'wizard/wizard-step-never-writes-draft-render');
  assert.match(verdict.text, /^---\nv: 1\n/);
});

test('a lesson that is already a rule appends evidence to that rule instead of minting a second', () => {
  const paraphrase = 'Use `class="noacg-data-source"` on an input-only holder instead of an inline `style="display:none"`.';
  const verdict = decide(input({ rule: paraphrase }), [EXISTING]);
  assert.equal(verdict.action, 'append');
  assert.equal(verdict.rule.id, EXISTING.id);
  assert.ok(verdict.score >= 0.6);
  assert.equal(decide(input({ rule: paraphrase, distinct: true }), [EXISTING]).action, 'new', '--distinct overrides the match');
});

test('evidence in the rule text is refused and pointed at the record', () => {
  const verdict = decide(input({ rule: 'Since 2026-09-03 a step calls `onDraft` from a handler.' }), []);
  assert.equal(verdict.action, 'refuse');
  assert.match(verdict.problems[0], /carries a date/);
});

test('every missing field is named in one refusal, with the same words the compiler uses', () => {
  const verdict = decide({ area: '', scope: [], kind: 'story', fires: 'contract', rule: '', supersedes: [], allowNumbers: false }, []);
  assert.equal(verdict.action, 'refuse');
  assert.match(verdict.problems.join('\n'), /--area is required/);
  assert.match(verdict.problems.join('\n'), /--rule is required/);
  assert.match(verdict.problems.join('\n'), /scope is empty/);
  assert.match(verdict.problems.join('\n'), /kind must be one of/);
});

test('a fires: target must exist in the tree; a present one passes', () => {
  const dir = root({ 'scripts/hooks/guard-edit.mjs': '// exists' });
  assert.equal(decide(input({ fires: 'hook:guard-edit' }), [], dir).action, 'new');
  const missing = decide(input({ fires: 'gate:check-nothing' }), [], dir);
  assert.equal(missing.action, 'refuse');
  assert.match(missing.problems[0], /scripts\/check-nothing\.mjs does not exist/);
  rmSync(dir, { recursive: true, force: true });
});

test('--supersedes skips the duplicate check and must name a real rule', () => {
  const paraphrase = 'Use `class="noacg-data-source"` on an input-only holder instead of an inline `style="display:none"`.';
  const ok = decide(input({ rule: paraphrase, supersedes: [EXISTING.id] }), [EXISTING]);
  assert.equal(ok.action, 'new');
  const bad = decide(input({ supersedes: ['wizard/nope'] }), [EXISTING]);
  assert.equal(bad.action, 'refuse');
  assert.match(bad.problems[0], /no such rule/);
});

test('what learn writes is what the compiler parses', () => {
  const text = renderRule({ ...input(), since: '2026-09-06', record: 'contracts/records/wizard/2026-09-06-x.md' });
  const { rule, problems } = parseRule('contracts/rules/wizard/x.md', text);
  assert.deepEqual(problems, []);
  assert.equal(rule.v, 1);
  assert.equal(rule.record, 'contracts/records/wizard/2026-09-06-x.md');
  assert.equal(rule.kind, 'trap');
  const record = renderRecord({ id: 'wizard/x', date: '2026-09-06', evidence: 'The raw value aired.', branch: 'claude/x', sha: 'abc1234' });
  assert.match(record, /^# wizard\/x\n/);
  assert.match(record, /Recorded 2026-09-06 on `claude\/x` at abc1234\./);
});
