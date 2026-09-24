-- THE COMMAND LOG, DELIVERED ON A PRIVATE TOPIC - the first half of closing its public read.
--
-- WHAT IS WRONG. 0008 made `control_events` readable to anon and authenticated with `using (true)`,
-- on the reasoning that a follower only ever asks for one production's rows by its show id, which
-- is unguessable. RLS does not require the id, though: `GET /rest/v1/control_events?select=*` with
-- the public anon key lists every production's log - field values sent to air, staged data that
-- has not aired, live reports - and every show id with it.
--
-- WHY IT CANNOT SIMPLY BE REVOKED. Every following surface - the /output renderer on air, the
-- hosted operator page, the production dashboard - receives log rows through Realtime
-- `postgres_changes`, and Postgres Changes delivers a row only to a subscriber whose RLS can SELECT
-- it. Revoking the read today would drop every non-fast command, staging sync, live report and
-- production-data update to the 30 s poll floor, silently.
--
-- SO THIS HALF ONLY ADDS. Every new row is ALSO broadcast by the database on the production's own
-- PRIVATE topic `log-<show id>`, readable by exactly the reach the log's read policy was meant to
-- have - a holder of the show id, which a follower learns only through its control or output slug
-- - and writable by nobody but the database. Followers listen there beside `postgres_changes` and
-- keep deduplicating by row id, so the same row arriving twice changes nothing. Once this road is
-- proven on a live production and the renderers already on air have reloaded, a later migration
-- replaces the public read with an owner-and-team one and the leak is closed.
--
-- A BROADCAST CAN NEVER BLOCK THE LOG. `realtime.send` swallows its own errors into a warning
-- (0056), and the call sits in its own exception block besides, so a Realtime fault costs speed on
-- this road and never a command.

-- ── 1. Every inserted row goes out on `log-<show id>` ─────────────────────────────────────────
create or replace function public.control_events_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object('id', new.id, 'graphic', new.graphic, 'msg', new.msg, 'created_at', new.created_at),
      'row',
      'log-' || new.show_id::text,
      true
    );
  exception when others then
    null; -- the durable row is already written; the poll floor and the old road still deliver it
  end;
  return null;
end $$;
-- A trigger fires without the inserting role holding EXECUTE, so no client role needs it.
revoke all on function public.control_events_broadcast() from public, anon, authenticated;

drop trigger if exists control_events_broadcast on public.control_events;
create trigger control_events_broadcast
  after insert on public.control_events
  for each row execute function public.control_events_broadcast();

-- ── 2. Who may READ the log topic ──────────────────────────────────────────────────────────────
-- The same reach as 0056's command topic, and scoped the same way: the exact topic shape, never a
-- blanket read on realtime.messages that would authorize a private topic nobody has designed yet.
drop policy if exists "control_log_readable" on realtime.messages;
create policy "control_log_readable" on realtime.messages
  for select to anon, authenticated
  using (realtime.topic() ~ '^log-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

-- ── 3. Prove it, or refuse to apply ────────────────────────────────────────────────────────────
do $$
declare
  v_writes text;
begin
  if to_regprocedure('realtime.send(jsonb, text, text, boolean)') is null then
    raise exception 'command log broadcast self-check failed: realtime.send is not available on this instance';
  end if;
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relname = 'control_events' and t.tgname = 'control_events_broadcast' and not t.tgisinternal
  ) then
    raise exception 'command log broadcast self-check failed: the trigger is not installed';
  end if;
  -- Nobody but the database may write to any private topic (0056's rule, re-asserted because this
  -- migration adds a second topic that relies on it).
  select string_agg(policyname, ', ') into v_writes from pg_policies
   where schemaname = 'realtime' and tablename = 'messages'
     and cmd in ('INSERT', 'ALL')
     and (roles::text[] && array['anon', 'authenticated', 'public']);
  if v_writes is not null then
    raise exception 'command log broadcast self-check failed: a client can write to realtime.messages (%)', v_writes;
  end if;
end $$;
