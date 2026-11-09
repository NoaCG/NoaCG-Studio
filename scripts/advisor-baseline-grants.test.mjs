// guards: supabase/migrations/**, supabase/advisor-baseline.json
//
// The advisor baseline names exactly the SECURITY DEFINER functions the migrations leave callable
// by `anon` and by `authenticated`, signature for signature.
//
// Why offline. The advisor gate (scripts/supabase-advisors.mjs) can only read the live project, so
// it runs in post-land, after the merge. Migration 0111 changed the audience_submit and
// audience_vote signatures and added three operator functions, and the baseline was not updated in
// the same pull request: the first anyone heard of it was post-land run 42627967625 going red on the
// landing. Every one of those grants was meant. What was missing was the record, and the record can
// be checked from the files alone: replay the migrations' create, drop, grant and revoke statements
// for public functions and compare the result with the two definer classes of the baseline.
//
// The replay models what Supabase does: a newly created function in `public` carries EXECUTE for
// PUBLIC, `anon` and `authenticated` (its default privileges, see definer-grants.test.mjs), `create
// or replace` keeps the grants of the signature it replaces, and `drop function` takes them away.
// Comments are stripped first, so prose about a grant is not read as one.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

import { canonicalKey } from './supabase-advisors.mjs';

const dir = new URL('../supabase/migrations/', import.meta.url);
const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
const migrations = await Promise.all(
  files.map(async (f) => (await readFile(new URL(f, dir), 'utf8')).replace(/--[^\n]*/g, '')),
);
const baseline = JSON.parse(await readFile(new URL('../supabase/advisor-baseline.json', import.meta.url), 'utf8'));

const DEFINER_CLASSES = /^(anon|authenticated)_security_definer_function_executable_/;

/** Split an argument list on its top-level commas (a type such as numeric(10, 2) keeps its own). */
const splitArgs = (list) => {
  const out = [];
  let depth = 0;
  let current = '';
  for (const c of list) {
    if (c === '(') depth += 1;
    if (c === ')') depth -= 1;
    if (c === ',' && depth === 0) {
      out.push(current);
      current = '';
    } else current += c;
  }
  if (current.trim()) out.push(current);
  return out;
};

/**
 * The identity arguments of a create or a grant: `name type` where a name is given, defaults and
 * OUT arguments dropped, as pg_get_function_identity_arguments writes them (canonicalKey then
 * spells each type Postgres's way).
 */
const argsOf = (list) =>
  splitArgs(list)
    .map((raw) => {
      let arg = raw.replace(/\s+default\s+[\s\S]*$/i, '').replace(/\s*=\s*[\s\S]*$/, '').trim().replace(/\s+/g, ' ');
      const mode = /^(in|out|inout|variadic) /i.exec(arg);
      if (mode) arg = arg.slice(mode[0].length);
      return { out: mode?.[1].toLowerCase() === 'out', text: arg.toLowerCase() };
    })
    .filter((a) => !a.out)
    .map((a) => a.text);

/** A signature is the function name and its argument TYPES: a grant names types, a create names both. */
const looksLikeType = (word) => /^(text|uuid|jsonb?|int\w*|bigint|smallint|numeric|boolean|bool|timestamp\w*|time\w*|date|real|double|character|varchar|bytea|public\.)/.test(word);
const typeOf = (arg) => {
  const [first, ...rest] = arg.split(' ');
  return rest.length && !looksLikeType(first) ? rest.join(' ') : arg;
};
const signature = (name, args) => canonicalKey(`${name}(${args.map((a) => ` ${typeOf(a)}`).join(',')}`);

const STATEMENT = new RegExp(
  [
    String.raw`create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(([\s\S]*?)\)\s*(returns[\s\S]*?)\bas\s+\$`,
    String.raw`drop\s+function\s+(?:if\s+exists\s+)?public\.(\w+)\s*\(([^)]*)\)`,
    String.raw`(grant|revoke)\s+(?:execute|all(?:\s+privileges)?)\s+on\s+function\s+([^;]*?)\s+(?:to|from)\s+([^;]+);`,
  ].join('|'),
  'gi',
);

/** Replay every migration; return the definer functions with the client roles that may run them. */
const replay = () => {
  const functions = new Map();
  for (const sql of migrations) {
    for (const m of sql.matchAll(STATEMENT)) {
      if (m[1]) {
        const args = argsOf(m[2]);
        const key = signature(m[1], args);
        const definer = /security\s+definer/i.test(m[3]);
        const known = functions.get(key);
        if (known) Object.assign(known, { definer, args });
        else functions.set(key, { name: m[1], args, definer, roles: new Set(['public', 'anon', 'authenticated']) });
      } else if (m[4]) {
        functions.delete(signature(m[4], argsOf(m[5])));
      } else if (m[6]) {
        const grant = m[6].toLowerCase() === 'grant';
        const roles = m[8].split(',').map((r) => r.trim().toLowerCase());
        for (const target of m[7].matchAll(/public\.(\w+)\s*\(([^)]*)\)/gi)) {
          const fn = functions.get(signature(target[1], argsOf(target[2])));
          if (!fn) continue;
          for (const role of roles) grant ? fn.roles.add(role) : fn.roles.delete(role);
        }
      }
    }
  }
  return functions;
};

const expectedKeys = () => {
  const keys = new Set();
  for (const fn of replay().values()) {
    if (!fn.definer) continue;
    const identity = fn.args.join(', ');
    for (const role of ['anon', 'authenticated']) {
      if (fn.roles.has('public') || fn.roles.has(role)) {
        keys.add(canonicalKey(`${role}_security_definer_function_executable_public_${fn.name}_${identity}`));
      }
    }
  }
  return keys;
};

const recordedKeys = () =>
  new Set(Object.keys(baseline.entries).filter((k) => DEFINER_CLASSES.test(k)).map(canonicalKey));

test('the replay finds the client-callable definer surface (it still parses the migrations)', () => {
  const keys = expectedKeys();
  // A replay that silently stopped matching would make the comparison below vacuous.
  assert.ok(keys.size > 100, `expected the capability RPCs, found ${keys.size}`);
  assert.ok(
    [...keys].some((k) => k.startsWith('anon_security_definer_function_executable_public_control_send_seq_')),
    'control_send_seq is an anon slug door and should be in the replay',
  );
  assert.ok(![...keys].some((k) => k.includes('_public_admin_overview_state_')), 'admin_overview_state is service_role only');
});

test('every client-callable definer function the migrations leave is in the advisor baseline', () => {
  const recorded = recordedKeys();
  const missing = [...expectedKeys()].filter((k) => !recorded.has(k)).sort();
  assert.deepEqual(
    missing,
    [],
    'these SECURITY DEFINER functions are callable by a client role after the migrations, but the ' +
      'advisor baseline does not accept them, so post-land will red on the landing that applies ' +
      'them. If the grant is meant, say why in ACCEPTED_CLASSES (scripts/supabase-advisors.mjs) and ' +
      'add the entry to supabase/advisor-baseline.json in the same pull request; if not, revoke it.',
  );
});

test('the advisor baseline accepts no definer function the migrations no longer expose', () => {
  const expected = expectedKeys();
  const stale = [...recordedKeys()].filter((k) => !expected.has(k)).sort();
  assert.deepEqual(
    stale,
    [],
    'these baseline entries name a signature the migrations dropped, revoked or changed; remove ' +
      'them (and record the new signature) in the pull request that changes it',
  );
});
