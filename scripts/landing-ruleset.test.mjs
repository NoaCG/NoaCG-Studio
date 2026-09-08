// The ruleset on main: its shape is pinned so a change to how main is landed is a visible diff.
//
// Run by `npm run test:landing-gates`. It was in no runner at all until 2026-09-09 - the pin above
// was a claim nothing checked, which is the same as no pin.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { desiredRuleset, findExisting, rulesetDrift, rulesetFacts, RULESET_NAME } from './landing-ruleset.mjs';

test('main is landed by the merge queue, with CI gate and Reviewed required, and only the admin bypasses', () => {
  const r = desiredRuleset();
  assert.equal(r.name, RULESET_NAME);
  assert.equal(r.enforcement, 'active');
  assert.deepEqual(r.conditions.ref_name.include, ['refs/heads/main']);
  assert.deepEqual(r.rules.map((x) => x.type), ['deletion', 'non_fast_forward', 'merge_queue', 'required_status_checks']);
  const queue = r.rules.find((x) => x.type === 'merge_queue').parameters;
  // Decided 2026-09-09 against squash, and the reason is containment, not CI: `cleanup-worktrees`,
  // `jobs` and `merge-order` all decide "this landed" with `rev-list --not origin/main`, which a
  // squashed branch never satisfies. Read the comment on the parameter before changing this line.
  assert.equal(queue.merge_method, 'MERGE', 'only a merge commit makes a landed branch an ancestor of origin/main');
  assert.equal(queue.max_entries_to_merge, 5);
  const checks = r.rules.find((x) => x.type === 'required_status_checks').parameters.required_status_checks.map((c) => c.context);
  assert.deepEqual(checks, ['CI gate', 'Reviewed']);
  assert.deepEqual(r.bypass_actors.map((a) => `${a.actor_type}:${a.actor_id}:${a.bypass_mode}`), ['RepositoryRole:5:always']);
});

test('the bootstrap shape requires only CI gate, for the landing that brings the Reviewed job', () => {
  const checks = desiredRuleset({ withReview: false }).rules.find((x) => x.type === 'required_status_checks').parameters.required_status_checks.map((c) => c.context);
  assert.deepEqual(checks, ['CI gate']);
});

test('findExisting matches by name only', () => {
  assert.equal(findExisting([{ id: 1, name: 'other' }]), null);
  assert.equal(findExisting([{ id: 1, name: RULESET_NAME }, { id: 2, name: 'other' }]).id, 1);
  assert.equal(findExisting([{ id: 1, name: 'other' }, { id: 2, name: RULESET_NAME }]).id, 2);
  assert.equal(findExisting(null), null);
});

test('a ruleset that matches the file drifts on nothing', () => {
  assert.deepEqual(rulesetDrift(desiredRuleset(), desiredRuleset()), []);
});

test('a merge method changed on GitHub is named, which is the whole point of the check', () => {
  const held = structuredClone(desiredRuleset());
  held.rules.find((r) => r.type === 'merge_queue').parameters.merge_method = 'SQUASH';
  assert.deepEqual(rulesetDrift(held, desiredRuleset()), [
    'merge method: GitHub has SQUASH, this file wants MERGE',
  ]);
});

test('a dropped check, a relaxed enforcement and an extra bypass each get their own line', () => {
  const held = structuredClone(desiredRuleset());
  held.enforcement = 'evaluate';
  held.rules.find((r) => r.type === 'required_status_checks').parameters.required_status_checks = [{ context: 'CI gate' }];
  held.bypass_actors.push({ actor_id: 1, actor_type: 'OrganizationAdmin', bypass_mode: 'always' });
  assert.deepEqual(rulesetDrift(held, desiredRuleset()), [
    'enforcement: GitHub has evaluate, this file wants active',
    'required checks: GitHub has CI gate, this file wants CI gate, Reviewed',
    'bypass: GitHub has RepositoryRole:5:always, OrganizationAdmin:1:always, this file wants RepositoryRole:5:always',
  ]);
});

test('a rule deleted on GitHub shows as a missing rule, not as a silent match', () => {
  const held = structuredClone(desiredRuleset());
  held.rules = held.rules.filter((r) => r.type !== 'merge_queue');
  const drift = rulesetDrift(held, desiredRuleset());
  assert.ok(drift.some((line) => line.startsWith('rules: ')), drift.join('; '));
  assert.ok(drift.some((line) => line === 'merge method: GitHub has (nothing), this file wants MERGE'), drift.join('; '));
});

test('no ruleset at all is drift with a reason, never an empty list', () => {
  assert.deepEqual(rulesetDrift(null, desiredRuleset()), ['no ruleset of this name exists on GitHub']);
});

test('the facts ignore what GitHub adds and this file never sets', () => {
  const held = { ...structuredClone(desiredRuleset()), id: 22389043, node_id: 'x', created_at: 'y', _links: {} };
  assert.deepEqual(rulesetFacts(held), rulesetFacts(desiredRuleset()));
});
