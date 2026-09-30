-- live-path: adds two policies on realtime.messages for the new private topic live-<show id> (read, and a Presence-only track); no function, table, grant or existing topic changes behaviour
--
-- THE LIVE TOPIC: every page on a production's live path announces itself here (Phase 6 Step 1,
-- docs/work-specs/playout-runtime-reliability/spec.md AC-8 to AC-10, decision D3).
--
-- WHY. The one output health signal an operator had was `control_shows.output_seen_at`: one
-- timestamp any renderer overwrites, written over REST, read by the production page alone. With
-- Realtime refused and REST fine, Takes reached the output 12 to 26 s late while that signal
-- stayed green (docs/PLAYOUT_ISOLATION_RESEARCH.md §5.6). Realtime PRESENCE is the carrier §9.2
-- names: one entry per page, held by the socket rather than written to Postgres, gone when the
-- page is. Outputs report their engine, build, whether their log and command channels are joined,
-- and their per-road counters; operator pages read them into one health line
-- (src/control/livePath.ts, src/components/control/OutputHealth.tsx).
--
-- THE BOUNDARY. A private topic is authorised through RLS on realtime.messages:
--   * SELECT, for anon and authenticated, on the exact shape `live-<uuid>` - the reach the `cmd-`
--     (0056) and `log-` (0064) topics already have: a holder of the show id, which a page learns
--     only through its control or output slug.
--   * INSERT, for the same roles and the same shape, and ONLY for `extension = 'presence'`. A
--     Presence track is authorised as an insert with that extension; a client broadcast would be
--     one with `extension = 'broadcast'`, which no policy admits. So capability holders can announce
--     themselves on this topic and still nobody but the database can broadcast on any topic.
-- What a holder of the show id can do with it: put an entry of their own in this production's
-- health line. That is report-only today and is the accepted cost of D3; the entry is read as
-- untrusted input (`readLiveEntry`).
--
-- WHY IT CANNOT HURT A SHOW ON AIR. Two new policies on a topic shape nothing uses yet. The `cmd-`
-- and `log-` policies, every function and every table are untouched. `create policy` takes a lock
-- on realtime.messages for an instant; the timeouts below make it give up rather than queue in
-- front of Realtime's own reads. A client from before this migration never joins `live-`; a client
-- after it that meets a server without it has its join refused and falls back to the heartbeat.
--
-- GRANTS. Realtime owns realtime.messages (supabase_realtime_admin) and already grants SELECT and
-- INSERT on it to anon and authenticated; the policies need exactly those, so they are granted here
-- again, explicitly, as the dependency this file has. Nothing is revoked: every other privilege on
-- the table is Realtime's, and under RLS a privilege with no policy admits nothing.
--
-- BEHAVIOUR is proven by the Realtime client, not here: a Presence track is authorised by the
-- Realtime server's own query, which a migration cannot stand in for. e2e/configured/live-health.spec.ts
-- joins, tracks and reads the topic on a real backend; this file's self-check proves the shape.
set lock_timeout = '500ms';
set statement_timeout = '10s';

grant select, insert on realtime.messages to anon, authenticated;

-- ── 1. Who may READ the live topic (join it, and hear its Presence) ─────────────────────────────
drop policy if exists "live_topic_readable" on realtime.messages;
create policy "live_topic_readable" on realtime.messages
  for select to anon, authenticated
  using (realtime.topic() ~ '^live-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

-- ── 2. Who may TRACK on it: Presence only, never a broadcast ────────────────────────────────────
drop policy if exists "live_topic_presence" on realtime.messages;
create policy "live_topic_presence" on realtime.messages
  for insert to anon, authenticated
  with check (
    realtime.topic() ~ '^live-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and realtime.messages.extension = 'presence'
  );

-- ── 3. Prove the shape, or refuse to apply ──────────────────────────────────────────────────────
do $$
declare
  v_writes text;
begin
  if not exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages'
                  and policyname = 'live_topic_readable' and cmd = 'SELECT') then
    raise exception 'live topic self-check failed: the read policy is missing';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages'
                  and policyname = 'live_topic_presence' and cmd = 'INSERT') then
    raise exception 'live topic self-check failed: the presence policy is missing';
  end if;
  -- Broadcast writes stay database-only (0056's rule, narrowed by exactly this file): every
  -- client-role policy that can admit an INSERT must be limited to Presence on the live topic.
  select string_agg(policyname, ', ') into v_writes from pg_policies
   where schemaname = 'realtime' and tablename = 'messages'
     and cmd in ('INSERT', 'ALL')
     and (roles::text[] && array['anon', 'authenticated', 'public'])
     and not (
       cmd = 'INSERT'
       and coalesce(with_check, '') ~ 'extension = ''presence'''
       and coalesce(with_check, '') ~ '\^live-'
     );
  if v_writes is not null then
    raise exception 'live topic self-check failed: a client can write to realtime.messages beyond Presence on the live topic (%)', v_writes;
  end if;
  if not (has_table_privilege('anon', 'realtime.messages', 'SELECT')
          and has_table_privilege('anon', 'realtime.messages', 'INSERT')
          and has_table_privilege('authenticated', 'realtime.messages', 'SELECT')
          and has_table_privilege('authenticated', 'realtime.messages', 'INSERT')) then
    raise exception 'live topic self-check failed: anon and authenticated need SELECT and INSERT on realtime.messages';
  end if;
end $$;
