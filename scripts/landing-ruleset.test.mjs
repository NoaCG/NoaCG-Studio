// The ruleset on main: its shape is pinned so a change to who may push main is a visible diff.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { desiredRuleset, findExisting, RULESET_NAME } from './landing-ruleset.mjs';

test('the ruleset restricts main to the lander and the admin, and forbids deletion and rewrites', () => {
  const r = desiredRuleset();
  assert.equal(r.name, RULESET_NAME);
  assert.equal(r.enforcement, 'active');
  assert.deepEqual(r.conditions.ref_name.include, ['refs/heads/main']);
  assert.deepEqual(r.rules.map((x) => x.type).sort(), ['deletion', 'non_fast_forward', 'update']);
  assert.deepEqual(r.bypass_actors.map((a) => `${a.actor_type}:${a.actor_id}:${a.bypass_mode}`), [
    'Integration:15368:always',
    'RepositoryRole:5:always',
  ]);
});

test('findExisting matches by name only', () => {
  assert.equal(findExisting([{ id: 1, name: 'other' }]), null);
  assert.equal(findExisting([{ id: 1, name: 'other' }, { id: 2, name: RULESET_NAME }]).id, 2);
  assert.equal(findExisting(null), null);
});
