-- THE FAST ROAD BECOMES A PRIVATE TOPIC THAT ONLY THE DATABASE WRITES TO.
--
-- 0055 and everything before it isolated realtime traffic by ADDRESS: the topic carried an
-- unguessable id, and knowing it was the whole of the authorization (0008: "the isolation is the
-- show_id, an unguessable uuid learned only via the slug RPC"). That posture is sound while a
-- topic only carries STATUS - a durable row that has already passed RLS on its way in, echoed to
-- whoever holds the address. It stopped being sound on 2026-09-10, when a verb started travelling
-- a second road: a client-sent Realtime BROADCAST on `control-<show id>`, applied by every
-- following surface the moment it lands (docs/backlog/playout-lag-when-working-the-queue.md).
--
-- WHAT THAT OPENED. A published production mints two capabilities (0029): the control slug, which
-- OPERATES the show, and the output slug, which only RENDERS it - "so an output URL pasted into
-- CasparCG/OBS cannot operate the show". But `control_output_by_slug` answers the output slug
-- with the show's uuid, because a renderer needs it to follow the log. The show id is therefore
-- reachable from the READ-ONLY capability, and on a public topic anyone who can join can send. A
-- link handed to the venue's playout machine or pasted into a chat could push `{"t":"play"}` onto
-- every screen in the building. The durable log was never at risk - writing THAT still needs the
-- control slug and passes through `control_send_many` - but a forged command that is never
-- recorded still puts a graphic on air during a live programme, which is the one thing this
-- product must not let a stranger do.
--
-- THE FIX, and it is a boundary rather than a better secret. The command frame moves to a PRIVATE
-- Realtime topic, `cmd-<show id>`, whose access Realtime resolves through RLS on
-- `realtime.messages`:
--
--   READ    a policy for anon and authenticated, so any surface that can already read the log's
--           rows can read the same commands a few hundred milliseconds earlier. This grants
--           nothing new: `control_events` has been readable to anon since 0008 under exactly this
--           reasoning, and the broadcast carries the same commands the row does.
--   WRITE   NO POLICY AT ALL, which under RLS is a refusal. anon and authenticated hold the
--           INSERT *privilege* on realtime.messages (Supabase grants it to every project), so the
--           policy - or rather its absence - is the entire boundary, in the same way it is for
--           every table in this schema.
--
-- The only writer left is `control_send_many` itself, below: a SECURITY DEFINER function owned by
-- postgres, which the caller reaches only by holding the CONTROL slug. So the fast road now
-- carries exactly the authority the durable road always carried, and the two are written in ONE
-- TRANSACTION - a command that fails to log is no longer a command that aired.
--
-- Realtime keeps a private topic and a public topic of the same name as separate channels and
-- passes nothing between them, so this closes the road rather than renaming it: a frame pushed on
-- `control-<id>` by anybody at all now reaches no listener, because no surface binds a command
-- handler there any more (src/control/hostedControl.ts).
--
-- WHAT IT COSTS. The client's own broadcast left the laptop's socket and reached another surface
-- in about 50 ms. This one is emitted by the database at the end of the insert, so it cannot beat
-- the RPC there; the measurement is written up in the same backlog file and in
-- docs/handoffs/2026-09-10-bn-private-command-topic.md. The trade was made deliberately: a road
-- that is a little slower and cannot be forged beats a road that is fast and can.

-- ── 1. The command frame, emitted by the database. ───────────────────────────────────────────
--
-- Same body as 0029's, with the broadcast appended. Two things about it are load-bearing:
--
-- WHICH ITEMS RIDE. The caller marks them, with an item-level `"fast": true` beside `graphic` and
-- `msg`. The rule for what may be fast belongs to the SENDER (src/control/hostedControl.ts): a
-- machine `event` needs the row's own server time and takes the durable road, and a graphic that
-- has just been sent one stays behind it briefly so a Take cannot overtake it. Keeping that rule
-- in one place, on the side that knows what it just pressed, is why this reads a flag rather than
-- deciding for itself. The flag is transport only - the INSERT below reads `graphic` and `msg`
-- and nothing else, so it is never written to the log and never reaches a receiver.
--
-- AND IT CANNOT FAIL THE VERB. `realtime.send` swallows its own errors into a WARNING (read its
-- body: the INSERT is wrapped in an exception block). A broadcast that cannot be written is
-- therefore invisible here and the verb still commits, which is the right way round - the durable
-- road is the truth and must not be lost to a fast road that had a bad moment - but it does mean
-- "the picture was slow" is the only symptom, and `scripts/playout-wire-probe.mjs` is what tells
-- you which road went quiet.
create or replace function public.control_send_many(p_slug text, p_items jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
  v_owner uuid;
  v_recent int;
  v_count int;
  v_item jsonb;
  v_fast jsonb;
begin
  select id, owner_id into v_show, v_owner from public.control_shows where slug = p_slug;
  if v_show is null then raise exception 'unknown control page'; end if;
  if public.feature_denied_for(v_owner, 'control.hosted') then
    raise exception 'hosted control is switched off for this page' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'not a command batch';
  end if;
  v_count := jsonb_array_length(p_items);
  -- A verb is a handful of commands; anything bigger is an ingest pattern this API is not.
  if v_count < 1 or v_count > 8 then
    raise exception 'not a command batch';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(v_item->'msg'->>'t', '') not in ('update', 'play', 'stop', 'next', 'event', 'snap', 'cue')
       or coalesce(v_item->>'graphic', '') = '' then
      raise exception 'not a control command';
    end if;
  end loop;
  select count(*) into v_recent from public.control_events
    where show_id = v_show and created_at > now() - interval '5 seconds';
  if v_recent + v_count > 50 then
    raise exception 'too many commands — slow down' using errcode = 'check_violation';
  end if;
  insert into public.control_events (show_id, graphic, msg)
    select v_show, item.value->>'graphic', item.value->'msg'
    from jsonb_array_elements(p_items) with ordinality as item(value, ord)
    order by item.ord;

  -- THE SAME COMMANDS, ON THE FAST ROAD. In the order they were sent, and only the marked ones.
  -- The comparison is against the jsonb literal rather than a cast, so an item carrying anything
  -- other than `true` is simply not fast - a malformed flag must never fail somebody's Take.
  select jsonb_agg(jsonb_build_object('graphic', item.value->>'graphic', 'msg', item.value->'msg')
                   order by item.ord)
    into v_fast
    from jsonb_array_elements(p_items) with ordinality as item(value, ord)
    where item.value->'fast' = 'true'::jsonb;
  if v_fast is not null then
    perform realtime.send(jsonb_build_object('items', v_fast), 'cmd', 'cmd-' || v_show::text, true);
  end if;
end $$;
grant execute on function public.control_send_many(text, jsonb) to anon, authenticated;

-- ── 2. Who may READ the command topic. ───────────────────────────────────────────────────────
--
-- Every following surface: the operator's dashboard, another operator on the hosted control URL,
-- and the browser output renderer - none of which is signed in as anybody in particular, all of
-- which hold an unguessable slug and, through it, the show id. That is the same reach the log's
-- own read policy grants (0008), so this adds no readership; it moves an existing one onto a road
-- that arrives sooner.
--
-- SCOPED TO THIS TOPIC SHAPE ON PURPOSE. `realtime.messages` is one table for every private topic
-- the project will ever have, and a policy written `using (true)` here would silently authorize
-- reading a feature that has not been designed yet. The pattern is exact: `cmd-` and a uuid.
drop policy if exists "control_commands_readable" on realtime.messages;
create policy "control_commands_readable" on realtime.messages
  for select to anon, authenticated
  using (realtime.topic() ~ '^cmd-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

-- NO WRITE POLICY IS DELIBERATE, and it is the whole change. Nothing below grants INSERT on
-- realtime.messages to anon or authenticated, so Realtime refuses their frames on every private
-- topic - which is what makes an output URL a reader again.

-- ── 3. Prove it, or refuse to apply. ─────────────────────────────────────────────────────────
do $$
declare
  v_writes text;
begin
  -- (a) The broadcast function this depends on exists with the signature called above. Without
  --     it the verb would still commit (realtime.send swallows its own errors) and the fast road
  --     would be silently gone, which is exactly the failure this block exists to prevent.
  if to_regprocedure('realtime.send(jsonb, text, text, boolean)') is null then
    raise exception 'private command topic self-check failed: realtime.send is not available on this instance';
  end if;
  -- (b) RLS is ON for realtime.messages. With it off, every policy here is decoration and the
  --     INSERT privilege anon already holds is the whole story.
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'realtime' and c.relname = 'messages' and c.relrowsecurity
  ) then
    raise exception 'private command topic self-check failed: RLS is off on realtime.messages';
  end if;
  -- (c) NOBODY BUT THE DATABASE MAY WRITE. A permissive insert policy for anon or authenticated
  --     on realtime.messages - added here or by any later migration - reopens exactly the hole
  --     this one closes, so it is named rather than assumed absent.
  select string_agg(policyname, ', ') into v_writes from pg_policies
   where schemaname = 'realtime' and tablename = 'messages'
     and cmd in ('INSERT', 'ALL')
     and (roles::text[] && array['anon', 'authenticated', 'public']);
  if v_writes is not null then
    raise exception 'private command topic self-check failed: a client can write to realtime.messages (%)', v_writes;
  end if;
end $$;
