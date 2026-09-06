// guards: supabase/migrations/**, api/_lib/**
//
// A table in `public` is UNREACHABLE the moment it is created: Postgres grants a new table to
// nobody but its owner. Hosted Supabase hides that, because its bootstrap sets
//
//   alter default privileges in schema public grant all on tables to anon, authenticated, service_role
//
// so on that one host every table a migration creates arrives already granted, and a migration that
// says nothing about roles still works. Take the same SQL to `supabase start` - the command
// supabase/README.md gives self-hosters - and the schema is inert: `documents` exists, RLS is on,
// the policies are correct, and every signed-in read returns `42501 permission denied for table
// documents`. That shipped from 0001 until 0051 and cost 17 of the 32 configured specs.
//
// This is the guard that makes the omission loud, and it is the mirror image of
// definer-grants.test.mjs: there the inherited grant was MORE than a migration meant to give, here
// it is the only reason the app can read its own rows. A policy that names `anon` or `authenticated`
// for a command is the schema's own statement that the role may run it - so somewhere in the
// migrations there must be a grant that lets it. A policy without its grant can never fire.

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const dir = new URL('../supabase/migrations/', import.meta.url);
const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

/** Prose about granting a role reads exactly like a grant to a regex, so strip the comments. */
const statementsOf = (text) => text.replace(/--[^\n]*/g, '');

const corpus = (
  await Promise.all(files.map(async (f) => statementsOf(await readFile(new URL(f, dir), 'utf8'))))
).join('\n');

const CLIENT_ROLES = ['anon', 'authenticated'];
const DML = ['select', 'insert', 'update', 'delete'];

/** Every PERMISSIVE policy that names a client role, as {table, role, command} triples.
 *  Restrictive policies only ever subtract, so they are not a claim that a role may reach a table. */
const policyClaims = () => {
  const claims = [];
  const re =
    /create\s+policy\s+"[^"]+"\s+on\s+public\.(\w+)\s+(?:as\s+(\w+)\s+)?for\s+(\w+)\s+to\s+([\w\s,]+?)\s*(?:using|with\s+check)\b/gi;
  let m;
  while ((m = re.exec(corpus))) {
    const [, table, kind, command, roleList] = m;
    if (kind && kind.toLowerCase() === 'restrictive') continue;
    const roles = roleList.split(',').map((r) => r.trim().toLowerCase());
    const commands = command.toLowerCase() === 'all' ? DML : [command.toLowerCase()];
    for (const role of roles) {
      if (!CLIENT_ROLES.includes(role)) continue;
      for (const c of commands) claims.push({ table, role, command: c });
    }
  }
  return claims;
};

/** Every privilege any migration grants, as a Set of "role:privilege:table". A single statement may
 *  name several privileges and several tables (`grant select, insert on table public.a, public.b`). */
const grantedPrivileges = () => {
  const held = new Set();
  const re = /\bgrant\s+([\w\s,]+?)\s+on\s+(?:table\s+)?((?:public\.\w+\s*,\s*)*public\.\w+)\s+to\s+([\w\s,]+?)\s*;/gi;
  let m;
  while ((m = re.exec(corpus))) {
    const privileges = m[1].split(',').map((p) => p.trim().toLowerCase());
    const tables = [...m[2].matchAll(/public\.(\w+)/g)].map((t) => t[1]);
    const roles = m[3].split(',').map((r) => r.trim().toLowerCase());
    for (const role of roles) {
      for (const table of tables) {
        for (const privilege of privileges) {
          const expand = privilege === 'all' ? DML : [privilege];
          for (const p of expand) held.add(`${role}:${p}:${table}`);
        }
      }
    }
  }
  return held;
};

test('the scan still finds the policies and the grants it is asserting about', () => {
  // A regex that quietly stops matching would turn every assertion below into a no-op.
  const claims = policyClaims();
  assert.ok(claims.length > 25, `expected the client policy surface, found ${claims.length}`);
  for (const table of ['documents', 'assets', 'shows', 'control_shows', 'chat_submissions']) {
    assert.ok(
      claims.some((c) => c.table === table),
      `${table} has client policies in the migrations but the scan missed them`,
    );
  }
  assert.ok(
    claims.some((c) => c.table === 'control_events' && c.role === 'anon'),
    'the anon read on control_events should be in the scan',
  );

  // Deliberately below the pre-0051 surface (49 privileges), so this stays a check that the SCAN
  // works and never doubles as a check that 0051 is present - that is test 2's job, and a sanity
  // test that fails for the same reason as the real one tells you nothing.
  const held = grantedPrivileges();
  assert.ok(held.size > 40, `expected the grant surface, found ${held.size}`);
  assert.ok(held.has('service_role:select:ai_generations'), 'the 0010 service_role grant is in the scan');
});

test('every policy that names a client role has the grant that lets it fire', () => {
  const held = grantedPrivileges();
  const unreachable = [
    ...new Set(
      policyClaims()
        .filter((c) => !held.has(`${c.role}:${c.command}:${c.table}`))
        .map((c) => `${c.role} may ${c.command} public.${c.table}`),
    ),
  ].sort();

  assert.deepEqual(
    unreachable,
    [],
    'these tables ship an RLS policy admitting a client role to a command that no migration ever ' +
      'grants, so the policy can only fire on a host whose bootstrap granted the table for them - ' +
      'hosted Supabase does, `supabase start` does not',
  );
});

test('the server role is granted the tables the server actually reaches', () => {
  const held = grantedPrivileges();
  // Not every table - service_role reaches these with the service key from api/, and the same
  // default-privilege inheritance was carrying them.
  const serverTables = ['documents', 'assets', 'render_jobs', 'agent_keys', 'agent_auth_codes', 'storage_quotas'];
  const missing = serverTables.filter((t) => !held.has(`service_role:select:${t}`));
  assert.deepEqual(missing, [], 'api/_lib reads these with the service key, so they must be granted to it');
});

test('0028 and 0030 keep their deliberately narrow service_role grants', () => {
  // Both tables are append-only BY PRIVILEGE - the property the two migrations assert at apply
  // time. A later blanket grant would undo it silently, which is exactly the shape of change this
  // file's own migration (0051) had to be careful not to make.
  const held = grantedPrivileges();
  for (const table of ['admin_audit_log', 'user_feedback']) {
    assert.ok(held.has(`service_role:insert:${table}`), `${table} should still be writable`);
    assert.ok(
      !held.has(`service_role:delete:${table}`),
      `${table} is append-only by privilege (0030 / 0028); a migration granting DELETE undoes that`,
    );
  }
});
