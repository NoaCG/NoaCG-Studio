// The guard on `npm run db:push` is this classifier, not the prose that describes it.
//
// `scripts/db-push.mjs` applies pending migrations to the hosted project unattended. The only thing
// standing between that and a `drop table documents` is `classifyStatement`, so the dangerous cases
// are FIXTURES here rather than sentences there. Two halves, and both matter:
//
//   1. The dangerous shapes are refused, and the near-misses that read like them are not. `for
//      delete` in a policy, `on delete cascade` in a column, `grant delete` and the word "drop" in
//      a comment all look exactly like the real thing to a regex - and a guard that cries wolf on
//      the ordinary migration is a guard somebody switches off.
//   2. Every migration in the repository classifies with no UNKNOWN statement. The classifier fails
//      CLOSED, so an unrecognised statement shape refuses the push; that is only tolerable if the
//      recognised set actually covers what this project's migrations do. This half is what keeps it
//      covering them as more are written - a new statement shape fails HERE, at build time, rather
//      than at the moment somebody is trying to land something.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import {
  FIRST_LIVE_PATH_MIGRATION,
  FIRST_TIMED_MIGRATION,
  HOLD_ALARM_HOURS,
  LIVE_PATH_FUNCTIONS,
  LIVE_PATH_PREFIX,
  LOCK_RETRY_WAITS_MS,
  PUSH_ARGS,
  classifyMigration,
  classifyStatement,
  holdAlarms,
  holdOverdue,
  ledgerDrift,
  liveHold,
  livePathHeader,
  livePathNames,
  livePathProblem,
  lockTimeoutFailure,
  normalize,
  readQuietWindow,
  splitStatements,
  stagedWorkdir,
  timeoutMs,
  unknownArgs,
} from './db-push.mjs';

// ── The arguments: an unknown one stops the run before it contacts anything ─────────────────────

test('an argument db:push does not know stops it, because no argument means apply to production', () => {
  assert.deepEqual(unknownArgs(['--help']), []);
  assert.deepEqual(unknownArgs(['-h']), []);
  assert.deepEqual(unknownArgs(['--dry-run', '--json', '--ref', 'abc', '--allow', '0052', '--live', '0068,0069']), []);
  // A valued flag consumes its value, even one that looks like a flag of its own.
  assert.deepEqual(unknownArgs(['--ref', '--dry-run']), []);
  assert.deepEqual(unknownArgs(['--usage']), ['--usage']);
  assert.deepEqual(unknownArgs(['--dryrun']), ['--dryrun']);
  assert.deepEqual(unknownArgs(['0052']), ['0052']);
});

const verdict = (sql, created = []) => classifyStatement(sql, new Set(created)).verdict;
const reasons = (sql, created = []) => classifyStatement(sql, new Set(created)).reasons.map((r) => r.id);
// A version before FIRST_TIMED_MIGRATION, so a fixture about another rule is judged on that rule
// alone; the timeout rule has its own fixtures below.
const LEGACY = '0001';

// ── The lexer: a statement this cannot see whole is a statement it cannot judge ───────────────────

test('splits on semicolons outside quotes, comments and dollar-quoted bodies', () => {
  const sql = `
    create table a (id int);
    -- a comment with ; in it
    /* a /* nested */ block ; comment */
    insert into a values (1);
    do $$ begin perform 1; perform 2; end $$;
    select 'a ; b', "col;name" from a;
  `;
  const parts = splitStatements(sql);
  assert.equal(parts.length, 4);
  assert.match(parts[0].raw, /create table a/);
  assert.match(parts[2].raw, /do \$\$/);
  // The DO block is ONE statement, not three: a body split into pieces would be classified in
  // pieces, and the pieces of a dangerous body look harmless.
  assert.match(parts[2].raw, /perform 2/);
});

test('a dollar-quote with a tag closes only on the same tag', () => {
  const sql = `create function f() returns void language plpgsql as $fn$ begin perform $$x$$; end $fn$;`;
  assert.equal(splitStatements(sql).length, 1);
});

test('normalize keeps quoted identifiers but blanks string contents', () => {
  const { code } = normalize(`insert into t values ('drop table documents')`);
  assert.equal(code, "insert into t values ('')");
  assert.match(normalize(`alter table "documents" drop column "x"`).code, /alter table documents drop column x/);
});

test('a comment mentioning a dangerous verb is prose, not a statement', () => {
  assert.equal(verdict('-- we never drop or truncate anything\ncreate index i on t (c)'), 'safe');
  assert.equal(verdict('/* dropping this would lose data */ grant select on table public.t to anon'), 'safe');
});

// ── The dangerous set ────────────────────────────────────────────────────────────────────────────

test('DROP of an object is refused, in every spelling', () => {
  assert.equal(verdict('drop table public.documents'), 'dangerous');
  assert.equal(verdict('drop table if exists public.documents cascade'), 'dangerous');
  assert.equal(verdict('alter table public.documents drop column body'), 'dangerous');
  assert.equal(verdict('alter table public.documents drop body'), 'dangerous');
  assert.equal(verdict('drop policy "documents_select_own" on public.documents'), 'dangerous');
  assert.equal(verdict('drop function public.is_moderator()'), 'dangerous');
  assert.equal(verdict('drop index if exists public.assets_user_idx'), 'dangerous');
  assert.deepEqual(reasons('drop table public.documents'), ['drop']);
});

test('DROP DEFAULT and DROP NOT NULL relax a constraint and remove no object', () => {
  assert.equal(verdict('alter table public.documents alter column name drop default'), 'safe');
  assert.equal(verdict('alter table public.documents alter column name drop not null'), 'safe');
});

test('TRUNCATE, DELETE FROM, a type change and a rename are refused', () => {
  assert.equal(verdict('truncate table public.control_events'), 'dangerous');
  assert.equal(verdict('delete from public.control_events where created_at < now()'), 'dangerous');
  assert.equal(verdict('alter table public.assets alter column bytes type bigint'), 'dangerous');
  assert.equal(verdict('alter table public.assets alter column bytes set data type bigint'), 'dangerous');
  assert.equal(verdict('alter table public.assets rename to attachments'), 'dangerous');
  assert.equal(verdict('alter table public.assets rename column bytes to size_bytes'), 'dangerous');
});

test('turning RLS off, changing an owner and setting a database option are refused', () => {
  assert.equal(verdict('alter table public.documents disable row level security'), 'dangerous');
  assert.equal(verdict('alter function public.is_moderator() owner to postgres'), 'dangerous');
  // `db reset` wipes schemas but NOT database settings, so this outlives every reset and quietly
  // does a later fix's work for it (supabase/AGENTS.md).
  assert.equal(verdict("alter database postgres set search_path to 'public, extensions'"), 'dangerous');
});

test('a dangerous statement hidden in a dollar-quoted body is still found', () => {
  assert.equal(verdict('do $$ begin drop table public.documents; end $$'), 'dangerous');
  assert.equal(verdict('do $$ begin delete from public.documents; end $$'), 'dangerous');
  assert.equal(
    verdict('create function f() returns void language plpgsql as $$ begin drop table public.assets; end $$'),
    'dangerous',
  );
  // …but prose and message strings inside a body are not SQL.
  assert.equal(
    verdict("do $$ begin -- never drop this\n  raise exception 'refusing to truncate'; end $$"),
    'safe',
  );
});

test('a DO block runs now; a function body runs later, so only the DO block is judged on rows', () => {
  // The retention crons are functions that delete old rows on a schedule (0037, 0039). Creating
  // one removes nothing - the deleting happens later, on rows that do not exist yet - so treating
  // a function body's DELETE as a push-time loss would refuse every retention migration forever.
  assert.equal(
    verdict('create function public.prune() returns void language sql as $$ delete from public.control_events where created_at < now() - interval \'14 days\' $$'),
    'safe',
  );
  // A DO block executes during the push, so the same statement inside one is a real deletion.
  assert.equal(verdict('do $$ begin delete from public.control_events; end $$'), 'dangerous');
  // The schema rules still reach a function body: what it will DROP is not future behaviour a
  // later migration can undo by adding one.
  assert.equal(
    verdict('create function public.f() returns void language sql as $$ drop table public.documents $$'),
    'dangerous',
  );
});

test('a self-check that inserts a throwaway row and deletes it again is the documented shape', () => {
  // supabase/AGENTS.md: "a self-check proves SHAPE, never behaviour - so CALL the thing", which
  // means insert a row against a real owner, run the function, assert the effect, delete the row.
  const selfCheck = `do $$
    begin
      insert into public.control_shows (id, owner_id, title) values ('…', '…', 'self-check');
      perform public.control_show_by_slug('x');
      delete from public.control_shows where id = '…';
    end $$`;
  assert.equal(verdict(selfCheck), 'safe');
  // Deleting from a table the block never inserted into is not that shape, and is not excused.
  const sweep = `do $$
    begin
      insert into public.control_shows (id) values ('…');
      delete from public.documents where user_id is null;
    end $$`;
  assert.equal(verdict(sweep), 'dangerous');
});

test('drop-and-recreate is a replacement; a bare drop is a removal', () => {
  // A trigger, a policy and a constraint have no `create or replace`, so redefining one means
  // dropping it first. Net, nothing is removed - and refusing this shape would make the override
  // the normal path.
  const replaced = `
    drop trigger if exists t_updated_at on public.t;
    create trigger t_updated_at before update on public.t for each row execute function public.set_updated_at();
  `;
  assert.equal(classifyMigration(LEGACY, 'replace', replaced).blocked, false);
  const removed = `drop trigger if exists t_updated_at on public.t;`;
  assert.equal(classifyMigration(LEGACY, 'remove', removed).blocked, true);
});

// ── The near-misses: shapes that read like the dangerous set and are not ──────────────────────────

test('the word "delete" as a privilege, a policy command or an FK action is not a DELETE', () => {
  assert.equal(verdict('grant select, insert, update, delete on table public.documents to authenticated'), 'safe');
  assert.equal(verdict('create policy "d" on public.assets for delete to authenticated using (true)'), 'safe');
  assert.equal(verdict('create table t (doc uuid references public.documents (id) on delete cascade)'), 'safe');
});

test('the ordinary migration vocabulary passes', () => {
  assert.equal(verdict('create table if not exists public.t (id uuid primary key)'), 'safe');
  assert.equal(verdict('create index if not exists t_idx on public.t (id)'), 'safe');
  assert.equal(verdict('alter table public.t enable row level security'), 'safe');
  assert.equal(verdict('alter table public.t add column extra text not null default \'\''), 'safe');
  assert.equal(verdict('create policy "p" on public.t for select to authenticated using (true)'), 'safe');
  assert.equal(verdict('create or replace function public.f() returns int language sql as $$ select 1 $$'), 'safe');
  assert.equal(verdict('comment on table public.t is \'a table\''), 'safe');
  assert.equal(verdict('create extension if not exists pgcrypto with schema extensions'), 'safe');
  assert.equal(verdict('insert into public.storage_quotas (bucket) values (\'user-assets\')'), 'safe');
  assert.equal(verdict('update public.plans set label = \'Free\' where key = \'free\''), 'safe');
});

// ── REVOKE: the rule that decides whether the lock-down idiom is noise or a finding ───────────────

test('a REVOKE on an object the same migration created removes nothing', () => {
  const sql = `
    create table public.new_table (id uuid primary key);
    revoke all on table public.new_table from public, anon, authenticated;
    grant select, insert on table public.new_table to service_role;
  `;
  // This is the idiom every table from 0010 on uses. If it refused, the guard would refuse almost
  // every migration that adds a table, and the override would become routine.
  assert.equal(classifyMigration(LEGACY, 'new_table', sql).blocked, false);
});

test('a REVOKE on a pre-existing object is refused, and says which', () => {
  const sql = `revoke truncate, references, trigger on table public.documents from anon, authenticated;`;
  const result = classifyMigration(LEGACY, 'tighten', sql);
  assert.equal(result.blocked, true);
  assert.deepEqual(result.findings[0].reasons.map((r) => r.id), ['revoke']);
  assert.match(result.findings[0].reasons[0].why, /documents/);
  assert.match(result.findings[0].reasons[0].why, /anon, authenticated/);
});

test('a REVOKE listing several new tables clears every one of them, not just the first', () => {
  // Each object after a comma arrives with a leading space, so a name that keeps its `public.`
  // prefix misses what the migration created and the lock-down idiom starts refusing itself.
  const sql = `
    create table public.a (id uuid primary key);
    create table public.b (id uuid primary key);
    revoke all on table public.a, public.b from public, anon, authenticated;
  `;
  assert.equal(classifyMigration(LEGACY, 'two_tables', sql).blocked, false);
});

test('a REVOKE naming one new table and one old one is refused for the old one', () => {
  const sql = `
    create table public.new_table (id uuid primary key);
    revoke all on table public.new_table, public.documents from anon;
  `;
  assert.equal(classifyMigration(LEGACY, 'mixed', sql).blocked, true);
});

test('REVOKE ... ON ALL TABLES IN SCHEMA cannot be limited to this migration', () => {
  const sql = `
    create table public.new_table (id uuid primary key);
    revoke all on all tables in schema public from anon;
  `;
  assert.equal(classifyMigration(LEGACY, 'sweeping', sql).blocked, true);
});

test('a REVOKE of function EXECUTE follows the same rule', () => {
  const created = `
    create function public.f() returns int language sql as $$ select 1 $$;
    revoke all on function public.f() from public, anon, authenticated;
  `;
  assert.equal(classifyMigration(LEGACY, 'definer', created).blocked, false);
  // Revoking EXECUTE on a predicate a policy names is an OUTAGE, not a hardening
  // (supabase/AGENTS.md) - exactly the class that must reach a human.
  assert.equal(verdict('revoke execute on function public.is_suspended() from authenticated'), 'dangerous');
});

// ── Shapes that read differently than they parse ─────────────────────────────────────────────────

test('a retention cron scheduled through a function call is a schedule, not a deletion', () => {
  // 0037 and 0039 register prunes this way. The DELETE is the cron's future behaviour on rows that
  // do not exist yet; nothing is removed by scheduling it.
  const schedule = `select cron.schedule('prune', '0 3 * * *', $$ delete from public.control_events where created_at < now() - interval '14 days' $$)`;
  assert.equal(verdict(schedule), 'safe');
  // The schema rules still reach the same body.
  assert.equal(verdict(`select cron.schedule('x', '0 3 * * *', $$ drop table public.documents $$)`), 'dangerous');
});

test('case and a byte-order mark do not change a verdict', () => {
  assert.equal(verdict('DROP TABLE Public.Documents'), 'dangerous');
  // A Windows editor writes a BOM, and without stripping it the FIRST statement of a file is the
  // one that misreads - which is the statement most likely to be the `drop`.
  assert.equal(verdict('﻿drop table public.documents'), 'dangerous');
  assert.equal(verdict('﻿create table public.t (id uuid primary key)'), 'safe');
});

// ── The ledger: pushing onto a drifted one is the worst documented failure ───────────────────────

test('a ledger whose versions match the filenames is not drift', () => {
  const remote = [{ version: '0001', name: 'documents' }, { version: '0002', name: 'auth_allowlist' }];
  assert.equal(ledgerDrift(remote, ['0001', '0002', '0003']), null, 'behind is not drifted - 0003 is simply pending');
});

test('a generated timestamp version stops the push before anything is applied', () => {
  // What a Supabase MCP `apply_migration` or an SQL-editor paste records. Everything looks fine
  // until the NEXT push, which sees those files as pending and re-runs them against the live
  // database - and `create policy` has no `if not exists`, so it dies partway through.
  const remote = [{ version: '0001', name: 'documents' }, { version: '20260730062721', name: '0002_auth_allowlist.sql' }];
  const drift = ledgerDrift(remote, ['0001', '0002']);
  assert.equal(drift.status, 'drifted');
  assert.deepEqual(drift.badVersions, ['20260730062721 (0002_auth_allowlist.sql)']);
});

test('a version applied on the project with no file on disk is drift too', () => {
  // The same disease from the other end: an applied migration was deleted or renamed, or something
  // wrote a version this repository never had.
  const remote = [{ version: '0001', name: 'documents' }, { version: '0002', name: 'gone' }];
  const drift = ledgerDrift(remote, ['0001']);
  assert.equal(drift.status, 'drifted');
  assert.deepEqual(drift.orphans, ['0002 (gone)']);
});

// ── Fail closed ──────────────────────────────────────────────────────────────────────────────────

test('an unrecognised statement shape refuses rather than passing', () => {
  const result = classifyStatement('cluster public.documents using documents_pkey');
  assert.equal(result.verdict, 'unknown');
  assert.deepEqual(result.reasons.map((r) => r.id), ['unrecognised']);
});

test('an empty or comment-only statement is not a finding', () => {
  assert.equal(verdict('   '), 'safe');
  assert.equal(verdict('-- just a note'), 'safe');
});

// ── Session timeouts: no migration may queue a live show behind a lock ──────────────────────────

const TIMED = "-- 0068: a header comment\nset lock_timeout = '2s';\nset statement_timeout = '30s';\n";
const ALTER = 'alter table public.control_events add column note text;\n';
const timeoutIds = (version, text) =>
  classifyMigration(version, 'x', text).findings.flatMap((f) => f.reasons.map((r) => r.id)).filter((id) => id === 'timeouts');

test('a migration from 0068 on that sets both timeouts first is not refused for them', () => {
  assert.deepEqual(timeoutIds('0068', TIMED + ALTER), []);
  assert.deepEqual(timeoutIds('0068', "SET lock_timeout TO 2000;\nset local statement_timeout = '10min';\n" + ALTER), []);
});

test('a migration from 0068 on without lock_timeout or statement_timeout is refused', () => {
  assert.deepEqual(timeoutIds('0068', ALTER), ['timeouts']);
  assert.deepEqual(timeoutIds('0068', "set lock_timeout = '2s';\n" + ALTER), ['timeouts']);
  assert.deepEqual(timeoutIds('0068', "set statement_timeout = '30s';\n" + ALTER), ['timeouts']);
  // It blocks the push and names the fix.
  const result = classifyMigration('0070', 'x', ALTER);
  assert.equal(result.blocked, true);
  assert.match(result.findings[0].reasons[0].why, /set lock_timeout = '2s'/);
});

test('a timeout set AFTER the first real statement protects nothing, so it does not count', () => {
  assert.deepEqual(timeoutIds('0068', ALTER + TIMED), ['timeouts']);
});

test('a lock_timeout of zero, or longer than 5 s, is a queue again', () => {
  assert.deepEqual(timeoutIds('0068', "set lock_timeout = '0';\nset statement_timeout = '30s';\n" + ALTER), ['timeouts']);
  assert.deepEqual(timeoutIds('0068', "set lock_timeout = '1min';\nset statement_timeout = '30s';\n" + ALTER), ['timeouts']);
  assert.deepEqual(timeoutIds('0068', "set lock_timeout = '5s';\nset statement_timeout = '30s';\n" + ALTER), []);
});

test('a statement_timeout of zero is no bound, so it is refused too', () => {
  assert.deepEqual(timeoutIds('0068', "set lock_timeout = '2s';\nset statement_timeout = 0;\n" + ALTER), ['timeouts']);
  assert.deepEqual(timeoutIds('0068', "set lock_timeout = '2s';\nset statement_timeout = default;\n" + ALTER), ['timeouts']);
});

test('migrations before 0068 are exempt: they are applied everywhere already', () => {
  assert.equal(FIRST_TIMED_MIGRATION, '0068');
  assert.deepEqual(timeoutIds('0067', ALTER), []);
});

test('Postgres time units read as milliseconds', () => {
  assert.equal(timeoutMs('2s'), 2000);
  assert.equal(timeoutMs('2000'), 2000);
  assert.equal(timeoutMs('1min'), 60_000);
  assert.equal(timeoutMs('250ms'), 250);
  assert.equal(timeoutMs('soon'), null);
});

// The CLI's own words, captured from `supabase db push --linked` (2.111) on a preview branch whose
// control_events was held by a reader: the push gave up after lock_timeout instead of queueing.
const CLI_LOCK_TIMEOUT = [
  '{"_tag":"Error","error":{"code":"LegacyDbPushApplyError","message":"ERROR: canceling statement due to lock timeout (SQLSTATE 55P03)\\nAt statement: 2\\nalter table public.control_events add column if not exists lock_probe text"}}',
  'Initialising login role...',
  'Connecting to remote database...',
  'Applying migration 0068_lock_probe.sql...',
].join('\n');

test('a lock timeout is recognised, and names the file that could not get its lock', () => {
  assert.deepEqual(lockTimeoutFailure(CLI_LOCK_TIMEOUT), { file: '0068_lock_probe.sql' });
});

test('any other failure is not a lock timeout, so it is not retried', () => {
  assert.equal(lockTimeoutFailure('ERROR: column "x" of relation "y" already exists (SQLSTATE 42701)\nApplying migration 0068_x.sql...'), null);
  assert.equal(lockTimeoutFailure('ERROR: canceling statement due to statement timeout (SQLSTATE 57014)'), null);
  // The CLI echoes the failing statement; a comment in it is not the server's answer.
  assert.equal(lockTimeoutFailure('ERROR: syntax error (SQLSTATE 42601)\n-- retried on a lock timeout\nalter tabel x'), null);
});

test('a lock timeout is retried a bounded number of times', () => {
  assert.ok(LOCK_RETRY_WAITS_MS.length >= 1 && LOCK_RETRY_WAITS_MS.length <= 3);
});

// ── The repository's own migrations ───────────────────────────────────────────────────────────────

const dir = new URL('../supabase/migrations/', import.meta.url);
const files = (await readdir(dir)).filter((f) => /^[0-9]+_.*\.sql$/.test(f)).sort();

test('every shipped migration parses into statements this guard can judge', async () => {
  const unrecognised = [];
  for (const file of files) {
    const [, version, name] = /^([0-9]+)_(.*)\.sql$/.exec(file);
    const result = classifyMigration(version, name, await readFile(new URL(file, dir), 'utf8'));
    for (const finding of result.findings) {
      if (finding.verdict === 'unknown') unrecognised.push(`${file}:${finding.line} ${finding.excerpt}`);
    }
  }
  assert.deepEqual(
    unrecognised,
    [],
    'These statements are neither recognised as safe nor matched by a danger rule, so db-push would\n' +
      'refuse them and every migration behind them. Either add the shape to SAFE_VERBS in\n' +
      'scripts/db-push.mjs (with a reason it cannot lose anything) or give it a danger rule:\n  ' +
      unrecognised.join('\n  '),
  );
});

// THE PRE-MERGE HALF of the timeout rule. db-push runs after the landing, so a migration that
// forgot its timeouts would otherwise be found only when production refused it; this fails the
// build that adds it instead.
test('every shipped migration from 0068 on sets its own lock_timeout and statement_timeout first', async () => {
  const missing = [];
  for (const file of files) {
    const [, version, name] = /^([0-9]+)_(.*)\.sql$/.exec(file);
    const result = classifyMigration(version, name, await readFile(new URL(file, dir), 'utf8'));
    for (const finding of result.findings) {
      const timeouts = finding.reasons.find((r) => r.id === 'timeouts');
      if (timeouts) missing.push(`${file}: ${timeouts.why}`);
    }
  }
  assert.deepEqual(missing, [], `db-push would refuse these after the landing:\n  ${missing.join('\n  ')}`);
});

test('the migrations that reshape a live security record are the ones flagged', async () => {
  const flagged = [];
  for (const file of files) {
    const [, version, name] = /^([0-9]+)_(.*)\.sql$/.exec(file);
    const result = classifyMigration(version, name, await readFile(new URL(file, dir), 'utf8'));
    if (result.blocked) flagged.push(file);
  }
  // Not a fixed list - a newly flagged migration is a real event, not a test to update blindly.
  // What this asserts is the RATIO: if most of the catalog were flagged, the override would be the
  // normal path and the guard would mean nothing. Six of fifty-one flag today, and every one is a
  // change to a live security record or a real row deletion: 0020, 0041 and 0042 revoke EXECUTE on
  // functions that already existed, 0030 makes the audit log append-only by revoking from
  // service_role, 0037 deletes funnel rows outright, and 0040's self-check deletes from a table a
  // trigger - not the block itself - had filled.
  assert.ok(
    flagged.length <= files.length / 4,
    `${flagged.length} of ${files.length} migrations are flagged; the override is supposed to be ` +
      `rare:\n  ${flagged.join('\n  ')}`,
  );
});

// ── The live-path class: what renderers and operator pages hold open for hours ───────────────────

const TIMED_HEAD = "set lock_timeout = '2s';\nset statement_timeout = '30s';\n";
const isLive = (sql) => livePathNames(normalize(sql).code).length > 0;

test('a statement that changes or locks a named live-path object is live-path', () => {
  // The four shapes the research measured hurting a show (§5.3, §11.1).
  assert.ok(isLive(`create policy "live_readable" on realtime.messages for select to authenticated using (true)`));
  assert.ok(isLive('create trigger control_events_seq before insert on public.control_events for each row execute function public.control_events_seq()'));
  assert.ok(isLive('create or replace function public.control_send_many(p_slug text, p_items jsonb) returns void language sql as $$ select 1 $$'));
  assert.ok(isLive('revoke select on table public.control_events from anon'));
  // A new table under the prefix, and an index or column on an existing one.
  assert.ok(isLive('create table if not exists public.control_heads (show_id uuid primary key)'));
  assert.ok(isLive('alter table public.control_events add column if not exists seq bigint'));
  assert.ok(isLive('create index if not exists control_events_seq_idx on public.control_events (show_id, seq)'));
  assert.ok(isLive('alter publication supabase_realtime add table public.control_events'));
  // A foreign key to control_shows takes a lock on it that every Take waits behind.
  assert.ok(isLive('create table public.notes (show_id uuid references public.control_shows (id) on delete cascade)'));
  // Rows written at migration time: an insert into control_events is a command to every renderer.
  assert.ok(isLive('insert into public.control_events (show_id, kind) values (null, null)'));
  // The predicates the live tables' policies call count when they are the SUBJECT.
  assert.ok(isLive('create or replace function public.is_suspended() returns boolean language sql as $$ select false $$'));
  assert.ok(isLive('revoke execute on function public.is_team_member(uuid) from authenticated'));
});

test('an unrelated statement, or one that only calls or mentions the contract, is not live-path', () => {
  assert.equal(isLive('create table public.agent_packages (id uuid primary key)'), false);
  assert.equal(isLive('alter table public.documents add column note text'), false);
  // A new table's own trigger CALLS set_updated_at; only redefining it changes control_shows.
  assert.equal(isLive('create trigger t_updated_at before update on public.t for each row execute function public.set_updated_at()'), false);
  // A policy elsewhere that calls a live predicate.
  assert.equal(isLive('create policy "p" on public.t for insert to authenticated with check (not public.is_suspended())'), false);
  // A function BODY that reads the contract is behaviour, not a contract change.
  assert.equal(isLive('create function public.report() returns bigint language sql as $$ select count(*) from public.control_events $$'), false);
  // Calling, reading and commenting take no lock that blocks a Take.
  assert.equal(isLive('select public.control_unpublish_deleted()'), false);
  assert.equal(isLive("comment on table public.control_events is 'the log'"), false);
  assert.equal(isLive('-- control_events is not touched here\ncreate table public.t (id int)'), false);
  // A name that merely contains the prefix.
  assert.equal(isLive('create table public.team_control_notes (id int)'), false);
});

test('the header is a line in the leading comment, and only there', () => {
  assert.equal(
    livePathHeader("-- 0068: presence\n-- live-path: two policies on realtime.messages for live- topics\nset lock_timeout = '2s';"),
    'two policies on realtime.messages for live- topics',
  );
  assert.equal(livePathHeader('﻿-- live-path: x\n'), 'x');
  assert.equal(livePathHeader('-- live-path:   \nselect 1;'), null, 'an empty description is no declaration');
  assert.equal(livePathHeader('select 1;\n-- live-path: too late\n'), null);
});

test('from 0068 on, a live-path file without the header fails the build, and so does a stale header', () => {
  assert.equal(FIRST_LIVE_PATH_MIGRATION, '0068');
  const policy = 'create policy "live_readable" on realtime.messages for select to authenticated using (true);\n';
  const declared = '-- live-path: presence policies on realtime.messages\n';
  const unrelated = 'create table public.agent_notes (id uuid primary key);\n';

  assert.match(livePathProblem(classifyMigration('0068', 'x', TIMED_HEAD + policy)), /live-path: <what it changes/);
  assert.equal(livePathProblem(classifyMigration('0068', 'x', declared + TIMED_HEAD + policy)), null);
  assert.match(livePathProblem(classifyMigration('0069', 'x', declared + TIMED_HEAD + unrelated)), /stale/);
  assert.equal(livePathProblem(classifyMigration('0069', 'x', TIMED_HEAD + unrelated)), null);
  // Older files are grandfathered: they are applied everywhere already.
  assert.equal(livePathProblem(classifyMigration('0067', 'x', policy)), null);
});

test('the live-path class composes with the refusals: a live-path DROP is still refused', () => {
  const sql = '-- live-path: drops the old send\n' + TIMED_HEAD + 'drop function public.control_send(text, jsonb);\n';
  const result = classifyMigration('0070', 'x', sql);
  assert.equal(result.livePath.is, true);
  assert.equal(result.blocked, true);
  assert.deepEqual(result.findings.flatMap((f) => f.reasons.map((r) => r.id)), ['drop']);
});

test('the migrations the research names as live-path changes classify as live-path', async () => {
  const classify = async (prefix) => {
    const file = files.find((f) => f.startsWith(prefix));
    const [, version, name] = /^([0-9]+)_(.*)\.sql$/.exec(file);
    return classifyMigration(version, name, await readFile(new URL(file, dir), 'utf8')).livePath.is;
  };
  // 0056 redefined control_send_many and added a policy on realtime.messages; 0057 restored the
  // live_cue mirror 0056 dropped; 0064 added the log broadcast trigger and policy; 0066 revoked the
  // read renderers used (§5.3, §11.1).
  for (const version of ['0056', '0057', '0064', '0066']) assert.equal(await classify(version), true, version);
  assert.equal(await classify('0065'), false, '0065 adds agent packages and touches nothing live');
});

// LIVE_PATH_FUNCTIONS is a hand-kept list; this keeps it complete. A policy on a live-path table
// or a trigger on one that calls a new public helper would otherwise fall outside the class.
test('every public function a live-path policy or trigger calls is in the live-path contract', async () => {
  const called = new Set();
  for (const file of files) {
    for (const { raw } of splitStatements(await readFile(new URL(file, dir), 'utf8'))) {
      const { code } = normalize(raw);
      if (!/^(?:create|alter) (?:policy|trigger)\b.*\bon (?:public\.control_\w+|realtime\.messages)\b/.test(code)) continue;
      for (const m of code.matchAll(/\bpublic\.(\w+)\s*\(/g)) called.add(m[1]);
    }
  }
  const outside = [...called].filter((name) => !name.startsWith(LIVE_PATH_PREFIX) && !LIVE_PATH_FUNCTIONS.includes(name));
  assert.deepEqual(outside, [], `add these to LIVE_PATH_FUNCTIONS in scripts/db-push.mjs: ${outside.join(', ')}`);
  assert.ok(called.has('is_suspended'), 'the scan found the policies it is about');
});

// THE PRE-MERGE HALF of the class: a live-path migration that does not say so fails the build.
test('every shipped migration from 0068 on declares the live-path class exactly when it is one', async () => {
  const problems = [];
  for (const file of files) {
    const [, version, name] = /^([0-9]+)_(.*)\.sql$/.exec(file);
    const problem = livePathProblem(classifyMigration(version, name, await readFile(new URL(file, dir), 'utf8')));
    if (problem) problems.push(`${file}: ${problem}`);
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

// ── The hold: an automatic run applies a live-path file only in a quiet window ───────────────────

const pending = (...specs) => specs.map(([version, live]) => ({ version, name: `m${version}`, livePath: { is: live } }));
const versions = (list) => list.map((m) => m.version);
const answering = (rows) => async () => rows;
const failing = (message) => async () => { throw new Error(message); };

test('the quiet window reads recent heartbeats, and any failure to read it is NOT quiet', async () => {
  let asked = '';
  const quiet = await readQuietWindow(async (sql) => { asked = sql; return []; });
  assert.deepEqual(quiet, { ok: true, shows: [] });
  assert.match(asked, /output_seen_at > now\(\) - interval '10 minutes'/);
  assert.doesNotMatch(asked, /title|name/, 'a CI log gets production ids, never titles');

  assert.deepEqual(await readQuietWindow(answering([{ id: 'a1' }, { id: 'b2' }])), { ok: true, shows: ['a1', 'b2'] });
  assert.equal((await readQuietWindow(failing('management API answered 503'))).ok, false);
  assert.equal((await readQuietWindow(answering({ message: 'nope' }))).ok, false, 'an answer of the wrong shape');
  assert.equal((await readQuietWindow(answering([{ n: 1 }]))).ok, false, 'rows without an id');
});

test('quiet: every pending migration applies, live-path included', async () => {
  const list = pending(['0068', false], ['0069', true], ['0070', false]);
  const hold = liveHold(list, { window: await readQuietWindow(answering([])) });
  assert.deepEqual(versions(hold.apply), ['0068', '0069', '0070']);
  assert.deepEqual(hold.held, []);
});

test('live: the files before the first live-path one apply; it and everything after it are held', async () => {
  const list = pending(['0068', false], ['0069', true], ['0070', false], ['0071', true]);
  const hold = liveHold(list, { window: await readQuietWindow(answering([{ id: 'show-1' }])) });
  assert.deepEqual(versions(hold.apply), ['0068']);
  assert.deepEqual(versions(hold.held), ['0069', '0070', '0071']);
});

test('a failed quiet-window query holds, and never applies', async () => {
  const list = pending(['0069', true], ['0070', false]);
  const hold = liveHold(list, { window: await readQuietWindow(failing('fetch failed')) });
  assert.deepEqual(hold.apply, []);
  assert.deepEqual(versions(hold.held), ['0069', '0070']);
  // No window at all (never read) is not quiet either.
  assert.deepEqual(versions(liveHold(list, {}).held), ['0069', '0070']);
});

test('--live names a file to apply now; the next unnamed live-path file still waits', async () => {
  const list = pending(['0068', true], ['0069', false], ['0070', true]);
  const window = await readQuietWindow(answering([{ id: 'show-1' }]));
  const hold = liveHold(list, { live: new Set(['0068']), window });
  assert.deepEqual(versions(hold.apply), ['0068', '0069']);
  assert.deepEqual(versions(hold.held), ['0070']);
  assert.deepEqual(versions(liveHold(list, { live: new Set(['0068', '0070']), window }).apply), ['0068', '0069', '0070']);
});

test('with no live-path file pending, nothing is held and no window is needed', () => {
  const list = pending(['0068', false], ['0069', false]);
  assert.deepEqual(versions(liveHold(list, {}).apply), ['0068', '0069']);
});

test('a hold turns red after about a day, and an unknown start counts as overdue', () => {
  const now = Date.parse('2026-10-01T12:00:00Z');
  assert.equal(HOLD_ALARM_HOURS, 24);
  assert.equal(holdOverdue('2026-10-01T02:00:00Z', now), false);
  assert.equal(holdOverdue('2026-09-30T11:00:00Z', now), true);
  assert.equal(holdOverdue(null, now), true);
  assert.equal(holdOverdue('not a date', now), true);
});

test('a young hold of live-path files only needs nobody; an ordinary file behind it needs a person', () => {
  const now = Date.parse('2026-10-01T12:00:00Z');
  const recent = '2026-10-01T10:00:00Z';
  assert.deepEqual(holdAlarms(pending(['0069', true], ['0070', true]), recent, now), []);
  // Only the live-path file promised the landed app works without it; 0071's app may need 0071.
  assert.match(holdAlarms(pending(['0069', true], ['0071', false]), recent, now).join(), /1 ordinary migration/);
  assert.match(holdAlarms(pending(['0069', true]), '2026-09-29T10:00:00Z', now).join(), /more than 24 hours/);
});

test('a hold pushes from a staged copy that holds every migration except the held ones', () => {
  const keep = files.slice(0, 3);
  const staged = stagedWorkdir(keep);
  try {
    assert.ok(existsSync(join(staged, 'supabase', 'config.toml')), 'the CLI needs the project config');
    assert.deepEqual(readdirSync(join(staged, 'supabase', 'migrations')).sort(), keep);
  } finally {
    rmSync(staged, { recursive: true, force: true });
  }
});

test("the real push answers the CLI's own confirmation, so a captured hand run cannot hang on a hidden prompt", () => {
  // A hand run hung on 2026-10-02: the CLI asked "push these migrations? [Y/n]" into the captured
  // stdout while it waited on the terminal's stdin.
  assert.deepEqual(PUSH_ARGS.slice(0, 3), ['db', 'push', '--linked']);
  assert.ok(PUSH_ARGS.includes('--yes'));
  assert.ok(!PUSH_ARGS.includes('--dry-run'));
});
