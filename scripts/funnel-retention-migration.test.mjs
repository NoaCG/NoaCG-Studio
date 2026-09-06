// guards: supabase/migrations/**

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile(
  new URL('../supabase/migrations/0037_funnel_opt_in_retention.sql', import.meta.url),
  'utf8',
);

test('funnel retention is enforced immediately and every day', () => {
  const cleanup = /delete from public\.funnel_events\s+where created_at < now\(\) - interval '90 days'/gi;
  assert.equal((sql.match(cleanup) ?? []).length, 2, 'expected migration-time and scheduled cleanup');
  assert.match(sql, /create extension if not exists pg_cron with schema extensions/i);
  assert.match(sql, /cron\.schedule\(\s*'noacg-prune-funnel-events',\s*'23 3 \* \* \*'/i);
});

test('funnel withdrawal can delete through the service-only API path', () => {
  assert.match(sql, /grant delete on table public\.funnel_events to service_role/i);
  assert.match(sql, /cron\.unschedule\(v_job\)/i, 'the named cron job must be replaceable on reapply');
});
