// guards: supabase/migrations/**
//
// Issue #795. Static assertions over the LATEST definition of each object, so a later migration
// that redefines one cannot quietly drop what 0088 added. The behavioural proof is 0088's own
// self-check (it calls the door with every refused shape) and e2e/configured/control-link-guard.spec.ts.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const dir = new URL('../supabase/migrations/', import.meta.url);
const files = (await readdir(dir)).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const migrations = await Promise.all(
  files.map(async (f) => ({ file: f, sql: (await readFile(new URL(f, dir), 'utf8')).replace(/--[^\n]*/g, '').toLowerCase() })),
);

/** The body of the last `create or replace function public.<name>(` across all migrations. */
function latest(name) {
  let found = null;
  const re = new RegExp(`create or replace function public\\.${name}\\(([\\s\\S]*?)\\$\\$([\\s\\S]*?)\\$\\$`, 'g');
  for (const { file, sql } of migrations) for (const m of sql.matchAll(re)) found = { file, body: m[2] };
  assert.ok(found, `no migration defines public.${name}`);
  return found;
}

test('the control link door checks the value it writes, not only the path', () => {
  const { file, body } = latest('control_data_patch_by_slug');
  assert.match(body, /production_data_is_value\(v_named\.value\)/, `${file}: a bound path takes any JSON, null and {} included`);
  assert.match(body, /production_data_is_value\(v_old\)/, `${file}: a bound path may overwrite a whole branch`);
  assert.match(body, /for no key update/, `${file}: the stored tree is read without the row lock control_data_apply takes`);
});

test('an array through the carve-out moves only bound leaves of the stored array', () => {
  const { file, body } = latest('control_data_patch_by_slug');
  // The caller's array is never forwarded: the stored array is the base, bound leaves are copied in.
  assert.match(body, /v_kept := v_stored;/, `${file}: the carve-out does not start from the stored array`);
  assert.match(body, /v_kept := jsonb_set\(v_kept, v_rel, v_new, true\)/, `${file}: bound leaves are not copied one by one`);
  assert.match(body, /control_data_apply\(v_show, v_patch, 'operator'\)/, `${file}: the caller's own patch reaches the apply`);
  assert.doesNotMatch(body, /control_data_apply\(v_show, p_patch/, `${file}: the caller's own patch reaches the apply`);
});

test('the definer functions a suspended account could write through refuse it first', () => {
  for (const [name, write] of [
    ['team_rotate_code', 'update public.teams'],
    ['community_pack_report', 'insert into public.community_pack_reports'],
    ['team_join', 'insert into public.team_members'],
    ['team_production_save', 'update public.team_productions'],
  ]) {
    const { file, body } = latest(name);
    const gate = body.indexOf('is_suspended()');
    assert.ok(gate >= 0, `${file}: ${name} never asks whether the caller is suspended`);
    const at = body.indexOf(write);
    assert.ok(at < 0 || gate < at, `${file}: ${name} writes before it asks whether the caller is suspended`);
  }
});

test('every table suspension gates on INSERT is gated on UPDATE too', () => {
  // authenticated holds no UPDATE on these, so there is no update for a policy to stop.
  const noClientUpdate = new Set(['public.team_productions']);
  const policies = new Map(); // name@table -> { table, cmd, suspended }
  for (const { sql } of migrations) {
    for (const m of sql.matchAll(/drop policy if exists "?([\w]+)"? on ([\w.]+)/g)) policies.delete(`${m[1]}@${m[2]}`);
    for (const m of sql.matchAll(/create policy "?([\w]+)"? on ([\w.]+)\s+as restrictive for (\w+) to [^;]*?;/g)) {
      policies.set(`${m[1]}@${m[2]}`, { table: m[2], cmd: m[3], suspended: /is_suspended\(/.test(m[0]) });
    }
  }
  const gated = (cmd) => new Set([...policies.values()].filter((p) => p.suspended && p.cmd === cmd).map((p) => p.table));
  const inserts = gated('insert');
  const updates = gated('update');
  assert.ok(inserts.has('public.teams') && inserts.has('public.documents'), 'the policy parser found no suspension gates');
  for (const table of inserts) {
    if (noClientUpdate.has(table)) continue;
    assert.ok(updates.has(table), `${table}: a suspended account may not create rows but may still change them`);
  }
});
