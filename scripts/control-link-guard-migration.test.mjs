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

/** The latest definition of every `public` function: name -> { file, head, body }. */
const functions = new Map();
for (const { file, sql } of migrations) {
  for (const m of sql.matchAll(/create or replace function public\.(\w+)\(([\s\S]*?)\$\$([\s\S]*?)\$\$/g)) {
    functions.set(m[1], { file, head: m[2], body: m[3] });
  }
}
function latest(name) {
  const found = functions.get(name);
  assert.ok(found, `no migration defines public.${name}`);
  return found;
}

test('the control link door checks the value it writes, not only the path', () => {
  const { file, body } = latest('control_data_patch_by_slug');
  // Both roads, the exact bound path and a bound leaf inside an array, ask the same question.
  assert.equal((body.match(/production_data_may_replace\(/g) ?? []).length, 2, `${file}: a road writes without asking what it replaces`);
  assert.match(body, /position\('\.' in \w+\)/, `${file}: a dotted patch key can pass for a bound path`);
  assert.match(body, /for no key update/, `${file}: the stored tree is read without the row lock control_data_apply takes`);
  assert.doesNotMatch(body, /control_data_apply\(v_show, p_patch/, `${file}: the caller's own patch reaches the apply unchecked`);
});

test('what a press may write over is a field value or nothing, and a list only over a list', () => {
  const { file, body } = latest('production_data_may_replace');
  assert.match(body, /production_data_is_value\(p_new\)/, `${file}: null, {} or a branch may be written`);
  assert.match(body, /jsonb_typeof\(p_new\) <> 'array' or jsonb_typeof\(p_old\) = 'array'/, `${file}: [] may erase a scalar`);
});

test('every definer function that writes for the signed-in account refuses a suspended one first', () => {
  // Writes that stay open on purpose, as deletes do (0018): taking one's own pack down, and the
  // moderator's own verbs, which a moderator is stripped of rather than suspended from.
  const open = new Set(['community_pack_withdraw', 'community_pack_decide', 'community_pack_reports_dismiss']);
  const writers = [...functions.entries()].filter(
    ([, f]) => /security definer/.test(f.head) && /auth\.uid\(\)/.test(f.body) && /\b(insert into|update) (public|storage)\./.test(f.body),
  );
  assert.ok(writers.some(([name]) => name === 'team_join'), 'the function parser found no account writers');
  for (const [name, { file, body }] of writers) {
    if (open.has(name)) continue;
    const gate = body.search(/is_suspended\(\)|feature_denied\(/);
    const write = body.search(/\b(insert into|update) (public|storage)\./);
    assert.ok(gate >= 0 && gate < write, `${file}: ${name} writes for the caller without asking whether they are suspended`);
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
