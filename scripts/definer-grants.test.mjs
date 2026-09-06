// guards: supabase/migrations/**
//
// A SECURITY DEFINER function in `public` is exposed the moment it is created: Supabase's default
// privileges hand EXECUTE to `anon`, `authenticated` and `service_role` as explicit per-role grants,
// so `revoke ... from public` removes nothing and silence means "open to the internet". That defect
// shipped twice - 0039 (fixed by 0041) and 0040 (fixed by 0042) - and both times the migration read
// as if it had locked the function down.
//
// This is the guard that makes the omission loud: every definer function the migrations create must
// name BOTH client roles somewhere in a grant or revoke, whether to open it deliberately or to
// close it. It is a check for an ANSWER, not for a particular answer - the capability RPCs behind
// the join link and the output URL are meant to be anon-callable, and they say so.

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const dir = new URL('../supabase/migrations/', import.meta.url);
const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

/** Prose about revoking a role reads exactly like a revoke to a regex, so strip the comments. */
const statementsOf = (text) => text.replace(/--[^\n]*/g, '');

const corpus = (
  await Promise.all(files.map(async (f) => statementsOf(await readFile(new URL(f, dir), 'utf8'))))
).join('\n');

/** Every `public.` function whose header carries SECURITY DEFINER, by name. */
const definerFunctions = () => {
  const found = new Set();
  const re = /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(([\s\S]*?)\bas\s+\$/gi;
  let m;
  while ((m = re.exec(corpus))) {
    if (/security\s+definer/i.test(m[0])) found.add(m[1]);
  }
  return [...found].sort();
};

/** Every grant/revoke statement naming that function. */
const privilegeStatements = (name) => {
  const re = new RegExp(
    String.raw`\b(?:grant|revoke)\b[\s\S]{0,80}?\bon\s+function\s+public\.${name}\s*\([^)]*\)[^;]*;`,
    'gi',
  );
  return corpus.match(re) ?? [];
};

test('the migrations create SECURITY DEFINER functions at all (the scan still finds them)', () => {
  // A regex that quietly stops matching would turn every assertion below into a no-op.
  const names = definerFunctions();
  assert.ok(names.length > 40, `expected the definer surface, found ${names.length}`);
  assert.ok(names.includes('control_send'), 'the hosted-control RPCs should be in the scan');
  assert.ok(names.includes('storage_within_quota'), 'the storage quota predicate should be in the scan');
});

test('every definer function decides, in SQL, what anon may do with it', () => {
  const undecided = definerFunctions().filter(
    (name) => !privilegeStatements(name).some((s) => /\banon\b/i.test(s)),
  );
  assert.deepEqual(
    undecided,
    [],
    'these SECURITY DEFINER functions never name `anon` in a grant or revoke, so they carry ' +
      'Supabase\'s default EXECUTE grant to the anonymous role by accident',
  );
});

test('every definer function decides, in SQL, what authenticated may do with it', () => {
  const undecided = definerFunctions().filter(
    (name) => !privilegeStatements(name).some((s) => /\bauthenticated\b/i.test(s)),
  );
  assert.deepEqual(undecided, [], 'these SECURITY DEFINER functions never name `authenticated`');
});

test('the identity triggers 0040 left open are closed to both client roles', () => {
  for (const name of ['control_show_record_identity', 'control_show_restore_identity']) {
    const revokes = privilegeStatements(name).filter((s) => /^revoke/i.test(s.trim()));
    assert.ok(revokes.length > 0, `${name} is never revoked`);
    assert.ok(
      revokes.some((s) => /\banon\b/i.test(s) && /\bauthenticated\b/i.test(s)),
      `${name} must be revoked from anon AND authenticated - a trigger fires without EXECUTE`,
    );
  }
});

test('0042 proves the triggers still fire rather than asserting the grants look right', async () => {
  const sql = statementsOf(await readFile(new URL('0042_identity_trigger_grants.sql', dir), 'utf8'));
  // The revoke is only safe because a trigger needs no EXECUTE at fire time. That is behaviour, so
  // the migration has to publish a production as `authenticated` and read the slug back.
  assert.match(sql, /set local role authenticated/i);
  assert.match(sql, /insert into public\.control_shows/i);
  assert.match(sql, /0042 self-check \(b\) FAILED/);
  // And it must put the APPLYING role back - on the exception path too. `reset role` is the wrong
  // way home: it lands on session_user, which during `supabase db push` is a temporary login role
  // holding no grants, so the next statement fails as if the revoke had broken something.
  assert.doesNotMatch(sql, /reset\s+role/i, 'reset role restores session_user, not the applying role');
  assert.match(sql, /v_role\s+text\s*:=\s*current_role/i);
  assert.ok(
    (sql.match(/set local role %I', v_role/gi) ?? []).length >= 2,
    'the applying role must be restored on the exception path too',
  );
});
