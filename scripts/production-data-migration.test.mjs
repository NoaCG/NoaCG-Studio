// Static guards on migration 0048 (the production-data tree's hosted half).
//
// THE ONE THAT EARNS ITS PLACE is the conformance binding: the merge is implemented twice, in
// TypeScript and in plpgsql, and the migration's self-check runs a jsonb literal of the shared
// table from scripts/merge-patch-conformance.mjs. Nothing stops those two copies drifting except
// this file - so adding a case to the shared table fails the build until 0048 carries it too.
//
// The rest are the cheap structural checks the repo has learned to want: a SECURITY DEFINER
// function in `public` is exposed the moment it is created (see definer-grants.test.mjs), and a
// self-check that only reads catalogs proves shape rather than behaviour, so 0048 must actually
// CALL every body it adds.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { MERGE_PATCH_CONFORMANCE } from './merge-patch-conformance.mjs';

const sql = await readFile(new URL('../supabase/migrations/0048_production_data_tree.sql', import.meta.url), 'utf8');
const sql60 = await readFile(new URL('../supabase/migrations/0060_operator_data_patch.sql', import.meta.url), 'utf8');
// A case added to the table after 0048 is answered by a later migration that calls the same
// bodies (0048 is applied history and never edited). Listed in the order they apply.
const LATER_CASES = ['0096_merge_patch_empty_list.sql'];
const later = await Promise.all(
  LATER_CASES.map((name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')),
);

test('0048 and the later conformance migrations embed the SHARED merge-patch table, case for case', () => {
  const embedded = [sql, ...later].flatMap((text, i) => {
    const block = /\$cases\$([\s\S]*?)\$cases\$/.exec(text);
    assert.ok(block, `${i === 0 ? '0048' : LATER_CASES[i - 1]} must carry its cases in a $cases$ dollar-quoted literal`);
    assert.match(text, /public\.jsonb_merge_patch\(v_case->'base', v_case->'patch'\)/, 'and CALL the merge on each of them');
    return JSON.parse(block[1]);
  });

  // Compared as DATA, not as text: formatting differences between the two files are fine,
  // a missing or altered case is not.
  const shape = (c) => ({ name: c.name, base: c.base, patch: c.patch, expect: c.expect });
  assert.deepEqual(
    embedded.map(shape),
    MERGE_PATCH_CONFORMANCE.map(shape),
    'the plpgsql merge no longer answers the same cases as the TypeScript one - answer an added ' +
      'case in a new migration that calls the merge on it (as 0096 does), listed in LATER_CASES',
  );
});

test('0048 adds both columns as NOT NULL jsonb with an object default', () => {
  assert.match(sql, /add column if not exists data jsonb not null default '\{\}'::jsonb/i);
  assert.match(sql, /add column if not exists bindings jsonb not null default '\{\}'::jsonb/i);
});

test('every function 0048 creates is closed to the client roles and opened to service_role', () => {
  const created = [...sql.matchAll(/create\s+or\s+replace\s+function\s+public\.(\w+)\s*\(/gi)].map((m) => m[1]);
  assert.deepEqual(
    [...new Set(created)].sort(),
    ['control_data_patch', 'control_data_read', 'jsonb_merge_patch', 'production_data_format', 'production_data_resolve'],
    '0048 created a different set of functions than this guard knows about',
  );
  for (const name of new Set(created)) {
    const revoke = new RegExp(String.raw`revoke\s+execute\s+on\s+function\s+public\.${name}\s*\([^)]*\)\s+from\s+[^;]*;`, 'i');
    const grant = new RegExp(String.raw`grant\s+execute\s+on\s+function\s+public\.${name}\s*\([^)]*\)\s+to\s+service_role\s*;`, 'i');
    assert.match(sql, revoke, `${name} must revoke execute from the client roles`);
    const revoked = revoke.exec(sql)[0];
    assert.ok(/\banon\b/.test(revoked) && /\bauthenticated\b/.test(revoked), `${name}'s revoke must name anon AND authenticated`);
    assert.match(sql, grant, `${name} must grant execute to service_role`);
  }
});

test('the write path is update-only: no other command type can be emitted', () => {
  // Every `t` this migration can write. A branch emitting 'play'/'stop'/'next' would make the
  // data key an operator credential, which is the one thing docs/DATA_API.md promises it is not.
  const emitted = [...sql.matchAll(/jsonb_build_object\(\s*'t'\s*,\s*'(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(emitted)], ['update'], 'the data path emitted a command other than `update`');
});

test('merge, resolve, diff and append exist ONCE, and both doors are thin wrappers over it', () => {
  // 0060 moved that paragraph into `control_data_apply`. Two copies of it would drift, and the
  // copy that forgets "a path that disappeared writes nothing" blanks a live graphic. A migration
  // file is immutable history, so 0048 still CONTAINS the old body - what has to stay true is that
  // the doors 0060 leaves behind do not, which is what this reads.
  assert.match(sql60, /create or replace function public\.control_data_apply\(/i);
  for (const door of ['control_data_patch', 'control_data_patch_by_slug']) {
    const body = new RegExp(String.raw`create or replace function public\.${door}\([\s\S]*?\$\$;`, 'i').exec(sql60);
    assert.ok(body, `${door} is not defined in 0060`);
    assert.match(body[0], /public\.control_data_apply\(/, `${door} must delegate rather than merge`);
    for (const owned of ['jsonb_merge_patch', 'production_data_resolve', 'insert into public.control_events']) {
      assert.doesNotMatch(
        body[0],
        new RegExp(owned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
        `${door} carries its own ${owned} - that paragraph belongs to control_data_apply alone`,
      );
    }
  }
});

test('the OPERATOR door may only move values the production has BOUND', () => {
  // The slug is a shared operating link, not the owner's key. Before 0060 it reached only the
  // append-only command log; a door forwarding an arbitrary merge patch would let anyone holding
  // it delete a production's authored tree with `{"match": null}`, which no surface would report
  // and no later row could undo. A press can only ever name a bound path, so nothing else is
  // allowed - and the ONE exception is an array, because merge-patch cannot address an element.
  const body = /create or replace function public\.control_data_patch_by_slug\([\s\S]*?\$\$;/i.exec(sql60)[0];
  assert.match(body, /production_data_patch_paths\(/, 'the door must read what the patch names');
  assert.match(body, /not a bound path/, 'the door must refuse a path nothing binds');
  // The carve-out has THREE conditions and every one of them is a hole if it goes. The type, or a
  // scalar replaces a whole branch. The prefix comparison, or the caller's own key is run as a
  // LIKE pattern and `{"%": [1]}` matches every dotted binding there is. The numeric segment, or
  // an array over a branch a binding descends into BY NAME empties it - the same destruction as
  // `{"match": null}`, and silent, because the bound leaves are then gone from the resolve and no
  // `update` row says anything happened.
  assert.match(body, /jsonb_typeof\(p\.value\) = 'array'/, "the carve-out must be the array's alone");
  assert.match(
    body,
    /starts_with\(f\.value, p\.path \|\| '\.'\)/,
    'the carve-out must compare prefixes, never run the caller\'s key as a LIKE pattern',
  );
  assert.match(
    body,
    /split_part\(substr\(f\.value, length\(p\.path\) \+ 2\), '\.', 1\) ~ '\^\[0-9\]\+\$'/,
    'the carve-out belongs to a binding that reaches through an INDEX and to no other',
  );
  assert.doesNotMatch(body, /f\.value like /, 'a LIKE here takes the caller\'s key as a pattern');
  // The FEED's door keeps no such restriction: a data key is the owner's own and says "write this
  // production's state". Asserting the absence is what stops the two doors being levelled by a
  // later edit in either direction.
  const feed = /create or replace function public\.control_data_patch\(p_key[\s\S]*?\$\$;/i.exec(sql60)[0];
  assert.doesNotMatch(feed, /not a bound path/);
  const check = sql60.slice(sql60.lastIndexOf('do $$'));
  for (const refused of ['{"match":null}', '{"match":"gone"}', '{"weather":{"temp":4}}', '{"match":[]}', '{"%":[1]}']) {
    assert.ok(check.includes(refused), `the self-check never tries ${refused} against the operator door`);
  }
  assert.match(check, /\{"drivers":\[\{"gap":"\+1\.204"\}\]\}/, 'the self-check must prove an indexed binding still writes');
});

test('the patch RPC locks the row before merging', () => {
  // Without FOR UPDATE the merge is a read-modify-write across serverless instances, and two
  // feeds racing on one production silently lose an update - the whole reason the merge is in
  // the database at all (docs/PRODUCTION_DATA_PLAN.md §4).
  const body = /create or replace function public\.control_data_patch[\s\S]*?\$\$;/i.exec(sql);
  assert.ok(body, 'control_data_patch body not found');
  assert.match(body[0], /from public\.control_shows s[\s\S]*?for update/i);
});

test('the patch RPC keeps both rate gates, counted against what it is about to write', () => {
  const body = /create or replace function public\.control_data_apply[\s\S]*?\$\$;/i.exec(sql60)[0];
  // A patch can write several rows, so a gate comparing only the trailing count would let one
  // call overshoot the cap by the number of graphics it touches.
  assert.match(body, /v_recent \+ v_pending > 50/, 'the 50-per-5s command cap must account for this call');
  assert.match(body, /v_ingest \+ v_pending > 25/, 'the 25-per-5s ingest budget must account for this call');
});

test('the self-check CALLS every body it adds, not just the catalogs', () => {
  const check = sql.slice(sql.lastIndexOf('do $$'));
  for (const fn of [
    'public.jsonb_merge_patch(',
    'public.production_data_format(',
    'public.production_data_resolve(',
    'public.control_data_patch(',
    'public.control_data_read(',
  ]) {
    assert.ok(check.includes(fn), `the self-check never calls ${fn} - it would prove shape, not behaviour`);
  }
});

// ── 0060: the OPERATOR's door on the same tree ──────────────────────────────────────────────

test('only a FEED spends the ingest budget, and both doors meet the command cap', () => {
  const body = /create or replace function public\.control_data_apply[\s\S]*?\$\$;/i.exec(sql60)[0];
  // The 25-per-5s budget exists so a feed cannot leave the operator unable to act. Charging an
  // operator's own press to it inverts exactly that: a saturated feed would refuse their score.
  assert.match(body, /p_src = 'api' and v_ingest \+ v_pending > 25/, 'only a feed spends the ingest budget');
  // The log's own cap is not anybody's privilege - it is what the log can carry.
  const fifty = /if (.*)v_recent \+ v_pending > 50/.exec(body);
  assert.ok(fifty, 'the 50-per-5s command cap is gone');
  assert.equal(fifty[1].trim(), '', 'the 50-per-5s command cap must apply to BOTH doors');
});

test('0060 writes update rows and nothing else, on either door', () => {
  // The same promise 0048 makes, one credential further out: a door must not become an operator
  // command road with different gates. A branch emitting play/stop/next would be exactly that.
  const emitted = [...sql60.matchAll(/jsonb_build_object\(\s*'t'\s*,\s*'(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(emitted)], ['update'], '0060 emitted a command other than `update`');
});

test('0060 keeps the internal body shut and the operator doors open', () => {
  // `control_data_apply` takes a SHOW ID, so being handed one IS the authorization: a client able
  // to call it could patch any production whose id it guessed. The two slug doors are the
  // opposite case - operating a production needs no account (the ?control= posture, 0008).
  assert.match(sql60, /revoke execute on function public\.control_data_apply\([^)]*\) from public, anon, authenticated;/i);
  for (const fn of ['control_data_patch_by_slug', 'control_data_by_slug']) {
    assert.match(
      sql60,
      new RegExp(String.raw`grant execute on function public\.${fn}\([^)]*\) to anon, authenticated`, 'i'),
      `${fn} must be callable by a signed-out operator page`,
    );
  }
});

test('0060 keeps the feed door at its exact published signature', () => {
  // api/_lib/dataIngest.ts calls rpc('control_data_patch', { p_key, p_patch }). `create or
  // replace` cannot rename an argument at all, so a change here does not break the caller
  // quietly - it fails to apply. This guard is about the OTHER half: nothing may drop it.
  assert.match(sql60, /create or replace function public\.control_data_patch\(p_key text, p_patch jsonb\)/i);
  assert.doesNotMatch(sql60, /drop function[^\n]*control_data_patch/i, '0060 must not drop the shipped door');
});

test("0060's self-check drives a real production through BOTH doors", () => {
  const check = sql60.slice(sql60.lastIndexOf('do $$'));
  for (const fn of [
    'public.control_data_patch(',
    'public.control_data_patch_by_slug(',
    'public.control_data_by_slug(',
    'public.control_data_apply(',
  ]) {
    assert.ok(check.includes(fn), `0060's self-check never calls ${fn} - it would prove shape, not behaviour`);
  }
  // The claim AC-7 actually makes is that ONE press moves EVERY graphic bound to that value. A
  // check with a single bound graphic would pass without ever testing it, so the fixture has to
  // point two different graphics at one path.
  const bindings = /'(\{"Board":[^']*\})'::jsonb/.exec(check);
  assert.ok(bindings, "0060's self-check no longer sets up a bindings fixture");
  const paths = Object.values(JSON.parse(bindings[1])).flatMap((fields) => Object.values(fields));
  assert.ok(
    Object.keys(JSON.parse(bindings[1])).length > 1 && new Set(paths).size < paths.length,
    'two graphics must bind the SAME path, or "every graphic bound to it follows" is never tested',
  );
  assert.match(check, /expected 2/, 'the self-check must assert the row count a shared value produces');
});
