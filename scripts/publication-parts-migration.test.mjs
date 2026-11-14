// guards: supabase/migrations/0120_publication_parts.sql, supabase/migrations/0119_record_patches.sql
//
// THE SHAPE OF A PUBLISH IN PARTS (docs/work-specs/live-publishing/designs/G4.md R17, section 4
// "Small reads only"). Read off the migration's text, as scripts/control-link-guard-migration.test.mjs
// reads 0071: the publish locks the production row only with its one final UPDATE, takes no lock on
// control_heads (a Take's), and the output's reads never open the whole payload.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/0120_publication_parts.sql', import.meta.url), 'utf8');
const records = readFileSync(new URL('../supabase/migrations/0119_record_patches.sql', import.meta.url), 'utf8');

/** The body of one function, from its `create or replace` to the end of its `$$` block. */
function body(source, name) {
  const start = source.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `${name} is defined`);
  const open = source.indexOf('$$', start);
  const close = source.indexOf('$$', open + 2);
  return source.slice(open + 2, close);
}

test('the publish locks the production row only in its one final UPDATE', () => {
  const publish = body(sql, 'control_publish_parts');
  assert.equal(publish.match(/update public\.control_shows/g)?.length, 1);
  assert.doesNotMatch(publish, /for (no key )?update|for share/i);
  assert.doesNotMatch(publish, /control_heads/);
  // Nothing after the UPDATE but marking which parts the landed head names.
  const after = publish.slice(publish.indexOf('update public.control_shows'));
  assert.doesNotMatch(after.slice(after.indexOf('get diagnostics')), /delete from/);
});

test('helpers that touch the new tables check the caller first', () => {
  for (const name of ['control_asset_put', 'control_assets_missing', 'control_parts_put', 'control_compose_graphics', 'control_parts_settle']) {
    const b = body(sql, name);
    assert.match(b.slice(0, 400), /control_may_publish\(p_show\)/, `${name} checks may publish`);
  }
});

test("an output's reads name small columns, never the payload", () => {
  for (const name of ['control_output_head', 'control_output_parts', 'control_output_assets']) {
    assert.doesNotMatch(body(sql, name), /\boutput\b(?!_slug)/, `${name} reads no output column`);
  }
});

test('the migration is marked live-path and sets its timeouts first', () => {
  assert.match(sql.split('\n')[0], /^-- live-path:/);
  assert.match(sql, /set lock_timeout = '2s';\s*set statement_timeout = '30s';/);
  assert.doesNotMatch(records.split('\n')[0], /^-- live-path:/);
  assert.match(records, /set lock_timeout = '2s';\s*set statement_timeout = '30s';/);
});

test('the prune deletes only rows it locked, images after a fresh snapshot', () => {
  const prune = body(sql, 'control_assets_prune');
  assert.match(prune, /for update skip locked\) gone/);
  const images = prune.slice(prune.indexOf('into v_locked'));
  assert.match(images, /for update skip locked/);
  assert.match(images, /delete from public\.control_assets a\s+where a\.hash = any\(v_locked\)\s+and not exists/);
});
