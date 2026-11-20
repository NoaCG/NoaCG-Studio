// guards: supabase/migrations/0125_relative_presses.sql
//
// A BOUND PRESS AS A RELATIVE OPERATION, AND A TAKE'S BOUND FIGURES FROM THE STORED TREE (#2617;
// docs/work-specs/live-publishing/evidence/fix-2617.md R2, R3, R5a, R5b). Read off the migration's
// text, as scripts/publication-parts-migration.test.mjs reads 0120. What it does when called is
// the migration's own self-check (it calls each path on a throwaway production) and the configured
// spec e2e/configured/playout-adjust-race.spec.ts.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/0125_relative_presses.sql', import.meta.url), 'utf8');
const seq = readFileSync(new URL('../supabase/migrations/0071_command_sequence.sql', import.meta.url), 'utf8');

/** One function's whole definition, from its `create or replace` to the end of its `$$` block. */
function definition(source, name) {
  const start = source.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `${name} is defined`);
  const open = source.indexOf('$$', start);
  const close = source.indexOf('$$', open + 2);
  return source.slice(start, close + 2);
}
const body = (source, name) => {
  const whole = definition(source, name);
  return whole.slice(whole.indexOf('$$') + 2, -2);
};

test('control_send_seq is 0071\'s, line for line, but for step 7b and its two variables (R5b.4)', () => {
  const now = definition(sql, 'control_send_seq');
  const step = now.slice(now.indexOf('  -- 7b.'), now.indexOf('  -- 7. The burst cap'));
  assert.ok(step.length > 0, 'step 7b is there');
  const without = now.replace(step, '').replace('  v_tree jsonb;\n  v_bindings jsonb;\n', '');
  assert.equal(without, definition(seq, 'control_send_seq'));
});

test('step 7b reads the tree after the head lock, after the skip filter and before the numbers, only for an update carrying data (R5a)', () => {
  const now = body(sql, 'control_send_seq');
  const at = (text) => {
    const i = now.indexOf(text);
    assert.ok(i >= 0, text);
    return i;
  };
  const read = at('select s.data, s.bindings into v_tree, v_bindings from public.control_shows s where s.id = v_show;');
  assert.ok(at("from public.control_heads h where h.show_id = v_show for update") < read, 'after the head is held');
  assert.ok(at('where not ((x.value->>\'graphic\') = any (v_skip));') < read, 'on the items left after the skip filter');
  assert.ok(read < at('-- 8. The numbers and the summary'), 'before the head summary, the rows and the fast frame');
  const step = now.slice(now.indexOf('-- 7b.'), now.indexOf('-- 7. The burst cap'));
  assert.match(step, /x\.value->'msg'->>'t' = 'update'/);
  assert.match(step, /x\.value->'msg'->'data' <> '\{\}'::jsonb/);
  // A plain read: no lock is added under the head.
  assert.doesNotMatch(step, /for (no key )?update|for (key )?share/);
});

test('a bound item is sent as it came, followed only when a bound figure differs by a correction of those fields (R5a, R5b.1)', () => {
  const item = body(sql, 'control_bound_item');
  assert.match(item, /p_item->'msg'->>'t' is distinct from 'update'/);
  assert.match(item, /continue when not \(v_data \? v_key\)/, 'never adds a field');
  assert.match(item, /continue when v_text is null or v_data->>v_key is not distinct from v_text;/, 'a path the tree lacks, or a figure already right, adds nothing');
  assert.match(item, /if v_fix = '\{\}'::jsonb then return jsonb_build_array\(p_item\); end if;/);
  // The item itself is returned untouched, so its command id still says it is the page's own.
  assert.match(item, /return jsonb_build_array\(p_item,/);
  assert.doesNotMatch(item, /jsonb_set\(p_item/);
  // The correction is a data write's row: only the differing fields, `src`, no command id, never fast.
  assert.match(item, /return jsonb_build_array\(p_item,\s*jsonb_build_object\('graphic', p_item->'graphic', 'msg', jsonb_build_object\('t', 'update', 'data', v_fix, 'src', 'operator'\)\)\);/);
  assert.doesNotMatch(item.replace(/--.*$/gm, ''), /oid|typed|appearance|'fast'/);
  // The batch takes the corrections in place, and its count follows them.
  const send = body(sql, 'control_send_seq');
  assert.match(send, /order by x\.ord, e\.ord/);
  assert.match(send, /v_n := jsonb_array_length\(v_items\);\s*end if;\s*end if;/);
});

test('the press function locks the row before reading ids, checks hosted control first, and bounds its lock wait below the page\'s give-up (R2, R4)', () => {
  const press = body(sql, 'control_data_adjust_by_slug');
  const lock = press.indexOf('for no key update');
  assert.ok(lock > 0);
  assert.ok(press.indexOf("perform set_config('lock_timeout', '4000', true);") < lock);
  assert.ok(lock < press.indexOf("feature_denied_for(v_owner, 'control.hosted')"));
  assert.ok(press.indexOf("feature_denied_for(v_owner, 'control.hosted')") < press.indexOf('from public.control_data_presses'));
  assert.ok(press.indexOf('from public.control_data_presses') < press.indexOf('control_data_patch_by_slug(p_slug, v_patch)'));
  // Only the door's own path refusals refuse a path; anything else ends the call.
  assert.match(press, /exception when sqlstate '42501' then/);
  assert.match(press, /substring\(sqlerrm from '\^not a \(\?:bound path\|field value\): \(\.\+\)\$'\)/);
  assert.match(press, /if v_named is null or v_tries > 50 then raise; end if;/);
  assert.match(press, /if v_count < 1 or v_count > 50 then/);
  assert.match(press, /if v_recent \+ v_count > 100 then/);
  assert.match(press, /created_at < now\(\) - interval '24 hours'/);
});

test('the press ids are the function\'s alone, and the migration is live-path with its timeouts first (R3, R11)', () => {
  assert.match(sql, /primary key \(show_id, press_id\)/);
  assert.match(sql, /alter table public\.control_data_presses enable row level security;/);
  assert.match(sql, /revoke all on table public\.control_data_presses from public, anon, authenticated;/);
  assert.doesNotMatch(sql, /create policy/);
  assert.match(sql, /grant execute on function public\.control_data_adjust_by_slug\(text, jsonb\) to anon, authenticated, service_role;/);
  for (const helper of ['production_data_adjusted(jsonb, numeric)', 'production_data_set_text(jsonb, text)', 'production_data_nested(text[], jsonb)', 'production_data_set_path(jsonb, text[], jsonb)', 'production_data_patch_unit(jsonb, text[])', 'control_bound_item(jsonb, jsonb, jsonb)']) {
    assert.match(sql, new RegExp(`revoke execute on function public\\.${helper.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} from public, anon, authenticated;`), helper);
  }
  assert.match(sql.split('\n')[0], /^-- live-path:/);
  assert.match(sql, /set lock_timeout = '2s';\s*set statement_timeout = '30s';/);
  // The old door stays exactly as it was: old pages call it.
  assert.doesNotMatch(sql, /create or replace function public\.control_data_patch_by_slug\(/);
  assert.doesNotMatch(sql, /create or replace function public\.control_send_many\(/);
});
