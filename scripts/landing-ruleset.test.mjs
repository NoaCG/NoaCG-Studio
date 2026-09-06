// The ruleset on main: its shape is pinned so a change to how main is landed is a visible diff.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { desiredRuleset, findExisting, RULESET_NAME } from './landing-ruleset.mjs';

test('main is landed by the merge queue, with CI gate and Reviewed required, and only the admin bypasses', () => {
  const r = desiredRuleset();
  assert.equal(r.name, RULESET_NAME);
  assert.equal(r.enforcement, 'active');
  assert.deepEqual(r.conditions.ref_name.include, ['refs/heads/main']);
  assert.deepEqual(r.rules.map((x) => x.type), ['deletion', 'non_fast_forward', 'merge_queue', 'required_status_checks']);
  const queue = r.rules.find((x) => x.type === 'merge_queue').parameters;
  assert.equal(queue.merge_method, 'MERGE', 'a merge commit keeps what CI verified; a squash rewrites it');
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
  assert.equal(findExisting([{ id: 1, name: 'other' }, { id: 2, name: RULESET_NAME }]).id, 2);
  assert.equal(findExisting(null), null);
});
