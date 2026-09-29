-- live-path: a new table, control_heads, with a foreign key to control_shows (locks it briefly)
--
-- THE PER-PRODUCTION HEAD: one small row per published production that will hold its command
-- sequence and a summary of what each graphic's last command did. This file only creates the table.
-- Nothing reads or writes it until 0070, which is why the two are separate files: a migration that
-- held strong locks on control_shows and control_events at once could deadlock with the old
-- writers, which take those two tables in both orders (docs/PLAYOUT_ISOLATION_RESEARCH.md §5.3,
-- docs/work-specs/playout-runtime-reliability/step-2-design.md).
--
-- WHY A NEW ROW AND NOT control_shows. That row is the hot row today: every Take and Out updates
-- its live_cue, every renderer report rewrites its live column, and a publish rewrites its payload.
-- Held by any of those (a publish holds it for the whole multi-megabyte write), every Take waits,
-- and at the anon role's 3 s statement timeout every Take fails (research §5.3). The head carries
-- only what the command path needs, so a publish or a data merge no longer stands in its way.
--
-- THE LOCK ORDER EVERY WRITER KEEPS (0070 enforces it; written here because this table is where
-- it matters): the control_shows row first (KEY SHARE, NO KEY UPDATE or FOR UPDATE), then the
-- head row, and after the head only the same head row, control_events inserts and
-- realtime.messages inserts. Nothing that holds a head row ever waits for a control_shows row.
--
-- WHAT LOCKS THIS TAKES ON AIR. `create table ... references control_shows` takes SHARE ROW
-- EXCLUSIVE on control_shows for the few milliseconds the rest of this file needs: inserts into
-- control_events (their foreign-key checks) pass it, and updates of control_shows (a Take's live_cue
-- write, a renderer report) wait that long. It waits at most lock_timeout for the lock itself and
-- then gives up with 55P03, which db-push retries; 500 ms is below the 1 s deadlock_timeout, so a
-- live backend never becomes the victim of a deadlock check against this file.
--
-- EPOCH. A head is created lazily by the first write after 0070, and deleted with its production
-- (on delete cascade). Unpublish and republish keep the same id, slugs and topics (0040), so a
-- recreated head restarts its sequence at 1; its new epoch is how an open follower tells "a new
-- log" from "nothing new" (0070).
--
-- NO BACKFILL AND NO INDEX: a head appears on a production's first write, and the only lookup is
-- by primary key.
set lock_timeout = '500ms';
set statement_timeout = '5s';

create table public.control_heads (
  show_id    uuid primary key references public.control_shows (id) on delete cascade,
  -- New on every (re)creation of the head: unpublish + republish can never read as "nothing new".
  epoch      uuid not null default gen_random_uuid(),
  -- The last sequence number allocated to this production's log (0 = none yet).
  seq        bigint not null default 0,
  -- Per graphic, what its last command did: {rev, on, cue, step, by, press}.
  graphics   jsonb not null default '{}'::jsonb,
  -- Per graphic, the renderer's last report: {data, state, at, seq, event}.
  live       jsonb not null default '{}'::jsonb,
  -- The last 64 "sender:press" keys applied, so a resent press is answered as applied.
  recent     jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
) with (fillfactor = 70);

-- Definer RPCs only: no client role reads or writes a head directly, and no policy exists.
alter table public.control_heads enable row level security;
revoke all on public.control_heads from public, anon, authenticated;
grant all on public.control_heads to service_role;

comment on table public.control_heads is
  'Per-production command head (Phase 6 Step 2): sequence, epoch, per-graphic summary and renderer reports. Written only by the control_* definer functions of 0070.';

-- ── Prove it, or refuse to apply ─────────────────────────────────────────────────────────────
-- Shape only, because nothing writes the table until 0070 (whose self-check CALLS every path).
-- The grants are asserted by ABSENCE as well as presence (supabase/AGENTS.md).
do $$
begin
  if to_regclass('public.control_heads') is null then
    raise exception '0069 self-check failed: control_heads was not created';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'control_heads' and c.relrowsecurity
  ) then
    raise exception '0069 self-check failed: RLS is off on control_heads';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'control_heads') then
    raise exception '0069 self-check failed: control_heads has a policy; it is written only by definer functions';
  end if;
  if has_table_privilege('anon', 'public.control_heads', 'select')
     or has_table_privilege('anon', 'public.control_heads', 'insert')
     or has_table_privilege('anon', 'public.control_heads', 'update')
     or has_table_privilege('anon', 'public.control_heads', 'delete')
     or has_table_privilege('authenticated', 'public.control_heads', 'select')
     or has_table_privilege('authenticated', 'public.control_heads', 'insert')
     or has_table_privilege('authenticated', 'public.control_heads', 'update')
     or has_table_privilege('authenticated', 'public.control_heads', 'delete') then
    raise exception '0069 self-check failed: a client role holds a privilege on control_heads';
  end if;
  if not has_table_privilege('service_role', 'public.control_heads', 'select') then
    raise exception '0069 self-check failed: service_role cannot read control_heads';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.control_heads'::regclass and contype = 'f'
       and confrelid = 'public.control_shows'::regclass and confdeltype = 'c'
  ) then
    raise exception '0069 self-check failed: control_heads does not cascade with its production';
  end if;
end $$;
