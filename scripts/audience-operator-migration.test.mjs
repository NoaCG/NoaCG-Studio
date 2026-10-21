// guards: supabase/migrations/0095_audience_operator_add.sql
//
// Static guards on migration 0095, the operator's door into a published production's inbox
// (docs/work-specs/data-sources/spec.md C0, "Operator insert"). The migration's own self-check
// calls the function against a throwaway production; these hold the shape a reviewer relies on
// when reading it: the capability is the CONTROL slug through 0035's resolver, the bound is 100,
// the provenance columns are nullable, the viewer caps still stand for a viewer's row, and
// nothing in it reaches the command log or production values.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { classifyMigration, livePathProblem } from './db-push.mjs';

const sql = await readFile(new URL('../supabase/migrations/0095_audience_operator_add.sql', import.meta.url), 'utf8');
const code = sql.replace(/--[^\n]*/g, '');

const body = (name) => {
  const m = new RegExp(String.raw`create (?:or replace )?function public\.${name}\([\s\S]*?\$\$;`, 'i').exec(code);
  assert.ok(m, `${name} is not defined in 0095`);
  return m[0];
};

test('the three provenance columns are added nullable, with no default and no constraint', () => {
  for (const column of ['external_id', 'source', 'reference']) {
    assert.match(code, new RegExp(String.raw`add column if not exists ${column}\s+text[,;]`, 'i'));
  }
  assert.doesNotMatch(code, /not null default/i);
});

test('the operator insert is keyed on the control slug, bounded at 100, and reaches only the inbox', () => {
  const fn = body('audience_operator_add');
  assert.match(fn, /public\.audience_owner_for_control\(p_slug\)/);
  assert.match(fn, /jsonb_array_length\(p_items\) > 100/);
  assert.match(fn, /insert into public\.audience_submissions/);
  for (const forbidden of ['control_events', 'control_data', 'join_slug', 'audience_submit']) {
    assert.equal(fn.includes(forbidden), false, `audience_operator_add names ${forbidden}`);
  }
  assert.match(code, /grant execute on function public\.audience_operator_add\(text, jsonb\) to anon, authenticated;/);
});

test('the guard keeps the viewer caps for every row the operator insert did not make', () => {
  const guard = body('audience_guard');
  assert.match(guard, /current_setting\('noacg\.audience_operator', true\)/);
  assert.match(guard, /if not operator_row then[\s\S]*recent_show >= 20[\s\S]*recent_device >= 3[\s\S]*end if;/);
  assert.match(code, /revoke execute on function public\.audience_guard\(\) from public, anon, authenticated;/);
});

test('the list returns the provenance and still never the device', () => {
  const list = body('audience_list');
  assert.match(list, /external_id text, source text, reference text/);
  assert.equal(/device/i.test(list.replace(/device_token is deliberately/i, '')), false);
  assert.match(code, /drop function if exists public\.audience_list\(text\);/);
});

test('it is additive, not live-path, and push applies it unattended', () => {
  const classified = classifyMigration('0095', 'audience_operator_add', sql);
  assert.equal(classified.blocked, false, JSON.stringify(classified.findings));
  assert.equal(classified.livePath.is, false);
  assert.equal(livePathProblem(classified), null);
});
