-- live-path: adds one read policy on realtime.messages for the new private topic seq-<show id>; no function, table, grant or existing topic changes behaviour
--
-- THE NUMBERED LOG'S TOPIC (Phase 6 Step 2, docs/work-specs/playout-runtime-reliability/
-- step-2-design.md D-s). 0071 numbers each production's log and sends one frame per inserting
-- statement on the private topic `seq-<show id>`; on protocol 2 that frame is how a renderer and
-- an operator page hear a command. This file lets them hear it, and nothing else.
--
-- WHY ITS OWN TOPIC. The frames first rode Presence's `live-<show id>` (0068). Realtime closes a
-- channel that goes over its Presence rate limit, and measured on the preview branch the shared
-- channel closed 25 to 27 s after it opened; a third of the Takes pressed before it joined again
-- never played. A topic with no Presence on it cannot be closed for Presence.
--
-- THE BOUNDARY. A private topic is authorised through RLS on realtime.messages:
--   * SELECT, for anon and authenticated, on the exact shape `seq-<uuid>`: the reach the `cmd-`
--     (0056), `log-` (0064) and `live-` (0068) topics have, a holder of the show id, which a page
--     learns only through its control or output slug.
--   * NO INSERT policy of any kind: no client can broadcast here, and no client can track
--     Presence here. Only the database writes to this topic (realtime.send in 0071's trigger).
--
-- WHY IT CANNOT HURT A SHOW ON AIR. One new policy on a topic shape nothing uses until 0071.
-- Every other policy, every function and every table are untouched. `create policy` takes a lock
-- on realtime.messages for an instant; the timeouts below make it give up rather than queue in
-- front of Realtime's own reads (lock_timeout below the 1 s deadlock_timeout, as 0068's).
--
-- GRANTS. Realtime owns realtime.messages and already grants SELECT on it to anon and
-- authenticated (0068 grants it again); the policy needs exactly that, so it is granted here once
-- more, explicitly, as the dependency this file has. Nothing is revoked.
--
-- BEHAVIOUR is proven by the Realtime client, not here: a join is authorised by the Realtime
-- server's own query. e2e/configured/command-sequence.spec.ts joins the topic and hears its frames
-- on a real backend; this file's self-check proves the shape.
set lock_timeout = '500ms';
set statement_timeout = '10s';

grant select on realtime.messages to anon, authenticated;

drop policy if exists "seq_topic_readable" on realtime.messages;
create policy "seq_topic_readable" on realtime.messages
  for select to anon, authenticated
  using (realtime.topic() ~ '^seq-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

-- Prove the shape, or refuse to apply.
do $$
declare
  v_writes text;
begin
  if not exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages'
                  and policyname = 'seq_topic_readable' and cmd = 'SELECT') then
    raise exception 'seq topic self-check failed: the read policy is missing';
  end if;
  -- Nothing a client holds may write on this topic: no policy that can admit an INSERT names it.
  select string_agg(policyname, ', ') into v_writes from pg_policies
   where schemaname = 'realtime' and tablename = 'messages'
     and cmd in ('INSERT', 'ALL')
     and coalesce(with_check, qual, '') ~ 'seq-';
  if v_writes is not null then
    raise exception 'seq topic self-check failed: a policy lets a client write on the seq- topic (%)', v_writes;
  end if;
  if not (has_table_privilege('anon', 'realtime.messages', 'SELECT')
          and has_table_privilege('authenticated', 'realtime.messages', 'SELECT')) then
    raise exception 'seq topic self-check failed: anon and authenticated need SELECT on realtime.messages';
  end if;
end $$;
