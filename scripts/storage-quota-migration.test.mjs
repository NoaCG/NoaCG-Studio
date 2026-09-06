// guards: supabase/migrations/**
//
// Migration 0039 is what keeps hosted usage inside the plan's included quota, and every rule in it
// is invisible until the day it matters - a policy that quietly stopped being RESTRICTIVE, or a
// prune job that lost its schedule, would look exactly like a working system right up to the
// invoice. These assertions pin the parts that carry the guarantee.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile(
  new URL('../supabase/migrations/0039_storage_quota_and_retention.sql', import.meta.url),
  'utf8',
);

const anonRevoke = await readFile(
  new URL('../supabase/migrations/0041_storage_quota_anon_revoke.sql', import.meta.url),
  'utf8',
);

/** The statements only. These migrations explain themselves at length, and prose about revoking a
 *  role reads exactly like a revoke to a regex - so what a grant test asserts on must be SQL. */
const statementsOf = (text) => text.replace(/--[^\n]*/g, '');

test('both buckets get a per-file ceiling', () => {
  assert.match(sql, /update storage\.buckets\s+set file_size_limit = 8 \* 1024 \* 1024/i);
  assert.match(sql, /where id in \('user-assets', 'community-assets'\)/i);
});

test('the accumulation ceilings are enforced, not merely recorded', () => {
  // RESTRICTIVE is the whole point: a PERMISSIVE policy would OR with the ownership policies and
  // hand every over-quota upload a second way in.
  const restrictive = /as restrictive for (insert|update) to authenticated/gi;
  assert.equal((sql.match(restrictive) ?? []).length, 2, 'insert AND update must both be restricted');
  // upsert:true replaces an object in place - unguarded, that is an unmetered way to grow a folder.
  assert.match(sql, /create policy storage_quota_update on storage\.objects/i);
  assert.match(sql, /create policy storage_quota_insert on storage\.objects/i);
});

test('the querying role can execute the function its policy calls', () => {
  // An RLS policy runs as the querying role; without this grant every upload fails closed.
  assert.match(sql, /grant execute on function public\.storage_within_quota\(text, text\) to authenticated/i);
  assert.match(sql, /revoke all on function public\.storage_within_quota\(text, text\) from public/i);
});

test('and nobody else can - anon is revoked by ROLE, not by PUBLIC', () => {
  // Supabase's default privileges grant EXECUTE to anon/authenticated/service_role at CREATE
  // time as explicit per-role grants, so revoking PUBLIC (which 0039 did, and which is kept
  // above) removes nothing. 0041 revokes the role that actually holds the grant. Without this,
  // an unauthenticated caller can run an aggregate over every row of a bucket, once per request.
  assert.match(anonRevoke, /revoke execute on function public\.storage_within_quota\(text, text\) from anon/i);
  // authenticated must NOT be revoked anywhere - the RESTRICTIVE policies would fail closed.
  assert.doesNotMatch(statementsOf(anonRevoke), /revoke[^;]*\bfrom\b[^;]*authenticated/i);
});

test('the ceilings stay under the plan quota, and are tunable without a migration', () => {
  assert.match(sql, /create table if not exists public\.storage_quotas/i);
  assert.match(sql, /alter table public\.storage_quotas enable row level security/i);
  // 70 GB + 10 GB = 80 GB of writes, below the 100 GB where Storage starts billing.
  assert.match(sql, /70::bigint \* 1024 \* 1024 \* 1024/);
  assert.match(sql, /10::bigint \* 1024 \* 1024 \* 1024/);
});

test('every unbounded table gets a daily prune', () => {
  const jobs = [
    ['noacg-prune-control-events', 'control_events', '14 days'],
    ['noacg-prune-render-jobs', 'render_jobs', '30 days'],
    ['noacg-prune-gateway-requests', 'ai_gateway_requests', '180 days'],
    ['noacg-prune-ai-generations', 'ai_generations', '365 days'],
  ];
  for (const [job, table, window] of jobs) {
    assert.match(sql, new RegExp(`cron\\.schedule\\(\\s*'${job}'`, 'i'), `${job} must be scheduled`);
    assert.match(
      sql,
      new RegExp(`delete from public\\.${table} where created_at < now\\(\\) - interval '${window}'`, 'i'),
      `${table} must be pruned at ${window}`,
    );
  }
  // Re-applying the migration must replace the jobs, never duplicate them.
  assert.match(sql, /cron\.unschedule\(v_job\)/i);
  assert.match(sql, /create extension if not exists pg_cron with schema extensions/i);
});

test('the control log prune stays weaker than the publish path it backs up', () => {
  // docs/CLOUD_PLAYOUT.md §6: the publish path already deletes control_events older than 7 days.
  // A cron window shorter than that would be deleting rows the app still expects to prune itself.
  const window = sql.match(/delete from public\.control_events where created_at < now\(\) - interval '(\d+) days'/i);
  assert.ok(window, 'the control-events prune must state its window');
  assert.ok(Number(window[1]) > 7, `expected a window wider than the publish path's 7 days, got ${window[1]}`);
});
