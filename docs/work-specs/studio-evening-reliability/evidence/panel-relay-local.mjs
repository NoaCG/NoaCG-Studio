// Local SQL behavior evidence. No network, credentials, hosted database or migration ledger.
// npm install --prefix bench-health/studio-night/runtime --no-save --package-lock=false --ignore-scripts @electric-sql/pglite@0.5.8
// node docs/work-specs/studio-evening-reliability/evidence/panel-relay-local.mjs bench-health/studio-night/runtime
// Repeat on Postgres 17 with @electric-sql/pglite@0.3.15 in a separate runtime17 directory.
// Fixtures replace unchanged crypto/feature dependencies and capture realtime.send calls.
// This is not proof of Supabase transport, deployed schema compatibility or lock contention.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (!process.argv[2]) throw new Error('Supply the isolated PGlite installation directory.');
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2], 'node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite();
const root = new URL('../../../../', import.meta.url);
const migration = name => readFileSync(new URL(`supabase/migrations/${name}`, root), 'utf8');
const checks = [];
const check = async (name, fn) => { await fn(); checks.push(name); console.log(`PASS ${name}`); };
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const owner = '11111111-1111-4111-8111-111111111111';
const show = '22222222-2222-4222-8222-222222222222';
const payload = (verb = 'trigger-cue', extra = {}) => ({ verb, target: 'cue_a', seen: 1, id: 'localtest:1', ...extra });
let key;
let keyId;
const press = async (p = payload(), k = key) => (await one('select public.panel_press($1, $2::jsonb) as answer', [k, JSON.stringify(p)])).answer;

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    alter default privileges in schema public grant execute on functions to service_role;
    create schema auth;
    create schema extensions;
    create schema realtime;
    create schema fixture;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('${owner}');
    create table public.control_shows(
      id uuid primary key, owner_id uuid references auth.users(id), title text,
      output jsonb, slug text unique not null default gen_random_uuid()::text
    );
    create table fixture.flags(denied boolean not null);
    insert into fixture.flags values (false);
    create function public.feature_denied_for(uuid,text) returns boolean language sql
      as 'select denied from fixture.flags';
    create function extensions.digest(text,text) returns bytea language sql strict
      as 'select sha256(convert_to($1,''UTF8''))';
    create function extensions.gen_random_bytes(integer) returns bytea language sql
      as 'select substring(sha256(convert_to(gen_random_uuid()::text,''UTF8'')) for $1)';
    create table fixture.sends(payload jsonb, event text, topic text, private boolean);
    create function realtime.send(jsonb,text,text,boolean) returns void language sql
      as 'insert into fixture.sends values ($1,$2,$3,$4)';
    create function realtime.topic() returns text language sql
      as 'select current_setting(''realtime.topic'',true)';
    create table realtime.messages(topic text, extension text, payload jsonb);
    alter table realtime.messages enable row level security;
    grant usage on schema realtime to anon, authenticated;
  `);
  console.log((await one('select version() as version')).version);
  await check('unchanged 0073 executes including its call self-checks', async () => {
    await db.exec(migration('0073_panel_relay.sql'));
    assert.equal((await one('select count(*)::int as n from public.control_shows')).n, 0);
  });
  await db.query('insert into public.control_shows(id,owner_id,title,slug) values($1,$2,$3,$4)', [show, owner, 'Local relay evidence', 'local-relay']);
  const code = (await one("select public.panel_pair_start('local-relay') as a")).a.code;
  const paired = (await one('select public.panel_pair_finish($1,$2) as a', [code, 'Local evidence'])).a;
  assert.equal(paired.ok, true);
  key = paired.key;
  keyId = paired.key_id;
  await one("select public.panel_claim('local-relay','localpage0000001','production','Local evidence')");
  await check('before 0077 the new verb is refused', async () => assert.equal((await press()).refused, 'not-a-panel-verb'));
  const before = await one("select proacl::text as grants from pg_proc where oid='public.panel_press(text,jsonb)'::regprocedure");
  await check('exact 0077 executes including its call self-checks', async () => await db.exec(migration('0077_direct_cue_trigger.sql')));
  await check('replacement retains grants and private helpers', async () => {
    assert.deepEqual(await one("select proacl::text as grants from pg_proc where oid='public.panel_press(text,jsonb)'::regprocedure"), before);
    assert.equal((await one("select has_function_privilege('anon','public.panel_key_row(text)','execute') as allowed")).allowed, false);
    assert.equal((await one("select has_table_privilege('anon','public.panel_keys','select') as allowed")).allowed, false);
    assert.equal((await one("select has_function_privilege('authenticated','public.panel_key_row(text)','execute') as allowed")).allowed, false);
    assert.equal((await one("select has_table_privilege('authenticated','public.panel_keys','select') as allowed")).allowed, false);
    assert.equal((await one("select has_function_privilege('service_role','public.panel_press(text,jsonb)','execute') as allowed")).allowed, true);
  });
  await db.exec('truncate fixture.sends');
  await check('anon direct cue forwards only the permitted fields', async () => {
    await db.exec('set role anon');
    let answer;
    try { answer = await press(payload('trigger-cue', { claim: 999, arbitrary: 'discard' })); }
    finally { await db.exec('reset role'); }
    assert.equal(answer.ok, true);
    const sent = await one("select * from fixture.sends where event='press'");
    assert.deepEqual(Object.keys(sent.payload).sort(), ['v','verb','target','seen','press_id','claim','panel'].sort());
    assert.equal(sent.payload.verb, 'trigger-cue');
    assert.equal(sent.payload.claim, answer.claim);
    assert.equal(sent.payload.press_id, 'localtest:1');
    assert.match(sent.topic, /^pnp-[0-9a-f]{32}$/);
    assert.equal(sent.private, true);
  });
  await check('legacy take-cue remains accepted', async () => assert.equal((await press(payload('take-cue'))).ok, true));
  await check('foreign editing verb is refused without a send', async () => {
    const n = (await one('select count(*)::int as n from fixture.sends')).n;
    assert.equal((await press(payload('paste'))).refused, 'not-a-panel-verb');
    assert.equal((await one('select count(*)::int as n from fixture.sends')).n, n);
  });
  await check('malformed payloads are refused without a send', async () => {
    const n = (await one('select count(*)::int as n from fixture.sends')).n;
    for (const p of [null, [], {}, payload('trigger-cue', { seen: '1' }), payload('trigger-cue', { seen: -1 }),
      payload('trigger-cue', { seen: 1.5 }), payload('trigger-cue', { target: 'x'.repeat(129) }),
      payload('trigger-cue', { target: 'a\u0007b' }), payload('trigger-cue', { id: 'invalid' })]) {
      assert.equal((await press(p)).refused, 'bad-press');
    }
    assert.equal((await one('select count(*)::int as n from fixture.sends')).n, n);
  });
  await check('unknown key is refused', async () => assert.equal((await press(payload(), `ncpk_${'a'.repeat(43)}`)).refused, 'unknown-key'));
  await check('no answering page is refused', async () => {
    await db.query('update public.panel_rooms set answering=false where show_id=$1', [show]);
    assert.equal((await press()).refused, 'no-page');
    await db.query('update public.panel_rooms set answering=true where show_id=$1', [show]);
  });
  await check('disabled hosted control is refused', async () => {
    await db.exec('update fixture.flags set denied=true');
    assert.equal((await press()).refused, 'no-page');
    await db.exec('update fixture.flags set denied=false');
  });
  await check('press burst cap refuses the twenty-first call', async () => {
    await db.query('update public.panel_keys set window_start=now(), window_count=0 where id=$1', [keyId]);
    await db.exec('truncate fixture.sends');
    await db.exec('begin');
    try {
      for (let i = 1; i <= 20; i++) assert.equal((await press(payload('trigger-cue', { id: `localtest:${i}` }))).ok, true);
      assert.equal((await press(payload('trigger-cue', { id: 'localtest:21' }))).refused, 'slow-down');
      await db.exec('commit');
    } catch (error) { await db.exec('rollback'); throw error; }
    assert.equal((await one("select count(*)::int as n from fixture.sends where event='press'")).n, 20);
  });
  await check('revoked key is refused', async () => {
    await one('select public.panel_revoke($1,$2)', ['local-relay', keyId]);
    assert.equal((await press()).refused, 'revoked');
  });
  await check('0077 can execute twice without changing relay privileges', async () => {
    await db.exec(migration('0077_direct_cue_trigger.sql'));
    assert.deepEqual(await one("select proacl::text as grants from pg_proc where oid='public.panel_press(text,jsonb)'::regprocedure"), before);
  });
  console.log(JSON.stringify({ passed: checks.length, checks, limits: ['fixture dependencies','captured sends','single connection','not a hosted backend rehearsal'] }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: checks.length, error: error.message, code: error.code, where: error.where }, null, 2));
  process.exitCode = 1;
} finally { await db.close(); }
