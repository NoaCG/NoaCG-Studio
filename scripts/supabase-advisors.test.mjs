// The advisor alarm's exit code is decided by `judge`, not by the prose around it.
//
// Post-land reds on exit 1, so the rule that decides it is the whole of what makes that red mean
// something. Two halves: a new member of any class still fails, because that is the case the
// check exists to catch; and `unused_index` never fails, because a usage counter that reads zero
// for every new index and for every index after a statistics reset carries no signal
// (WARN_ONLY_CLASSES in the script says why).
import assert from 'node:assert/strict';
import test from 'node:test';

import { WARN_ONLY_CLASSES, canonicalKey, judge } from './supabase-advisors.mjs';

const finding = (name, level = 'WARN') => ({ name, level, detail: `${name} detail` });
const report = (entries) => new Map(Object.entries(entries));

const baseline = new Set(['rls_enabled_no_policy_public_a', 'unused_index_public_a_idx']);

test('a report equal to the baseline exits 0', () => {
  const seen = report({
    rls_enabled_no_policy_public_a: finding('rls_enabled_no_policy', 'INFO'),
    unused_index_public_a_idx: finding('unused_index', 'INFO'),
  });
  const verdict = judge(seen, baseline);
  assert.equal(verdict.exitCode, 0);
  assert.deepEqual(verdict.added, []);
});

test('a new unused_index is a warning and exits 0', () => {
  const seen = report({
    rls_enabled_no_policy_public_a: finding('rls_enabled_no_policy', 'INFO'),
    unused_index_public_a_idx: finding('unused_index', 'INFO'),
    unused_index_public_b_idx: finding('unused_index', 'INFO'),
    unused_index_public_c_idx: finding('unused_index', 'INFO'),
  });
  const verdict = judge(seen, baseline);
  assert.equal(verdict.exitCode, 0);
  assert.deepEqual(verdict.warnings, ['unused_index_public_b_idx', 'unused_index_public_c_idx']);
  assert.deepEqual(verdict.failing, []);
});

test('a new member of an accepted class still fails, beside any number of unused indexes', () => {
  const seen = report({
    rls_enabled_no_policy_public_a: finding('rls_enabled_no_policy', 'INFO'),
    rls_enabled_no_policy_public_b: finding('rls_enabled_no_policy', 'INFO'),
    unused_index_public_a_idx: finding('unused_index', 'INFO'),
    unused_index_public_b_idx: finding('unused_index', 'INFO'),
  });
  const verdict = judge(seen, baseline);
  assert.equal(verdict.exitCode, 1);
  assert.deepEqual(verdict.failing, ['rls_enabled_no_policy_public_b']);
  assert.deepEqual(verdict.warnings, ['unused_index_public_b_idx']);
});

test('a finding in a class nobody accepted fails', () => {
  const seen = report({
    rls_enabled_no_policy_public_a: finding('rls_enabled_no_policy', 'INFO'),
    unused_index_public_a_idx: finding('unused_index', 'INFO'),
    security_definer_view_public_v: finding('security_definer_view', 'ERROR'),
  });
  assert.equal(judge(seen, baseline).exitCode, 1);
});

test('a cleared finding is reported and never fails', () => {
  const seen = report({ rls_enabled_no_policy_public_a: finding('rls_enabled_no_policy', 'INFO') });
  const verdict = judge(seen, baseline);
  assert.equal(verdict.exitCode, 0);
  assert.deepEqual(verdict.cleared, ['unused_index_public_a_idx']);
});

test('every accepted finding gone at once is a comparison against nothing, exit 3', () => {
  const seen = report({ unused_index_public_z_idx: finding('unused_index', 'INFO') });
  const verdict = judge(seen, baseline);
  assert.equal(verdict.comparedAgainstNothing, true);
  assert.equal(verdict.exitCode, 3);
});

test('an empty baseline is honest: new findings still decide the exit code', () => {
  const seen = report({ rls_enabled_no_policy_public_a: finding('rls_enabled_no_policy', 'INFO') });
  assert.equal(judge(seen, new Set()).exitCode, 1);
  assert.equal(judge(new Map(), new Set()).exitCode, 0);
});

test('unused_index is the only class that never fails', () => {
  assert.deepEqual([...WARN_ONLY_CLASSES], ['unused_index']);
});

test("a hand-written key with a type alias matches the advisors' own spelling", () => {
  const live = 'authenticated_security_definer_function_executable_public_f_p_id uuid, p_until timestamp with time zone';
  assert.equal(canonicalKey('authenticated_security_definer_function_executable_public_f_p_id uuid, p_until timestamptz'), live);
  assert.equal(canonicalKey('x_public_g_p_n int, p_ids int8[], p_on bool'), 'x_public_g_p_n integer, p_ids bigint[], p_on boolean');
  // Only a whole argument type: names that contain an alias stay as they are.
  assert.equal(canonicalKey('unused_index_public_int_idx'), 'unused_index_public_int_idx');
  assert.equal(canonicalKey('x_public_h_p_int text, p_bool_flag text'), 'x_public_h_p_int text, p_bool_flag text');
  // A length or precision goes, as the identity arguments drop it; the advisors' spelling is kept.
  assert.equal(canonicalKey('x_public_k_p_a varchar(20), p_b numeric(10,2), p_c timestamp'),
    'x_public_k_p_a character varying, p_b numeric, p_c timestamp without time zone');
  for (const canonical of [live, 'x_public_m_p_a time with time zone, p_b time without time zone, p_c character varying']) {
    assert.equal(canonicalKey(canonical), canonical);
  }
  // And judge compares in that spelling, so the 0086 hand entry would not have read as new.
  const seen = new Map([[live, finding('authenticated_security_definer_function_executable')]]);
  const verdict = judge(seen, new Set([live.replace('timestamp with time zone', 'timestamptz')]));
  assert.equal(verdict.exitCode, 0);
  assert.deepEqual(verdict.cleared, []);
});
