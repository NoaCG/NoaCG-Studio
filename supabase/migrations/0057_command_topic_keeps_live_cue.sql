-- PUT THE LIVE-CUE MIRRORING BACK. 0056 dropped it, and this is the fix.
--
-- 0056 added the private-topic broadcast to `control_send_many` by taking 0029's body and
-- appending to it. 0029 was not the current definition: **0034 had redefined the same function**
-- to mirror every `cue` marker in a batch into `control_shows.live_cue`, which is the row-persisted
-- snapshot of which cue is on air on each layer. `create or replace` took the older text whole, so
-- from 0056 that column stopped moving.
--
-- WHAT THAT BROKE, and why nothing went red. The log is unaffected - every command is still
-- written, and every open surface still follows it - so a running show looks perfectly correct.
-- The damage is to RESUMING one: `control_show_by_slug` and `control_output_by_slug` answer
-- `live_cue` from that column, so a reloaded production page, an operator opening the hosted URL
-- and a browser source rebooting mid-programme all rebuild from a snapshot frozen at whenever 0056
-- applied. The chips read "nothing on air" over a live graphic, and the recovery walk re-airs
-- whatever was live back then. `control_send` (the single-command RPC) still mirrored, which would
-- have made it look intermittent rather than broken.
--
-- 0056 stays exactly as it was applied and this migration is the fix, per supabase/AGENTS.md.
--
-- THE LESSON IS THE SELF-CHECK, and this file's is the shape AGENTS.md asks for: 0056's block
-- proved that `realtime.send` exists, that RLS is on and that no client can write - all true, all
-- of it about the change and none of it about the function it replaced. **A shape check cannot
-- see a behaviour that was removed.** The block at the bottom CALLS the function against a
-- throwaway production and asserts what it must do: the rows land, the cue marker reaches
-- `live_cue`, and clearing that layer empties it again.

-- ── The current body: 0034's, with 0056's broadcast on the end. ──────────────────────────────
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

  -- EVERY cue marker in the batch, in order (0034): a multi-layer verb carries one per layer, and
  -- keeping only the last would leave the others reading as on air after a reload.
  for v_item in
    select item.value from jsonb_array_elements(p_items) with ordinality as item(value, ord) order by item.ord
  loop
    if v_item->'msg'->>'t' = 'cue' then
      update public.control_shows
         set live_cue = public.control_live_cue_set(live_cue, v_item->>'graphic', v_item->'msg'->'cue')
       where id = v_show;
    end if;
  end loop;

  -- THE SAME COMMANDS, ON THE FAST ROAD (0056): in the order they were sent, and only the ones
  -- the caller marked. The comparison is against the jsonb literal rather than a cast, so an item
  -- carrying anything other than `true` is simply not fast - a malformed flag must never fail
  -- somebody's Take.
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

-- ── Prove the BODY, by calling it. ───────────────────────────────────────────────────────────
do $$
declare
  v_owner uuid;
  v_show  uuid := '00000000-0057-4000-8000-000000000057';
  v_slug  text;
begin
  select id into v_owner from auth.users limit 1;
  if v_owner is null then
    raise notice 'control_send_many self-check skipped: no account on this instance';
    return;
  end if;
  insert into public.control_shows (id, owner_id, title) values (v_show, v_owner, 'Send-many self-check');
  select slug into v_slug from public.control_shows where id = v_show;

  -- A Take on one layer: the data, the entrance, and the cue marker that says which cue is up.
  perform public.control_send_many(v_slug, jsonb_build_array(
    jsonb_build_object('graphic', 'Bug', 'msg', jsonb_build_object('t', 'update', 'data', '{}'::jsonb), 'fast', true),
    jsonb_build_object('graphic', 'Bug', 'msg', jsonb_build_object('t', 'play'), 'fast', true),
    jsonb_build_object('graphic', 'Bug', 'msg', jsonb_build_object('t', 'cue', 'cue', 'cue-a'), 'fast', true)));
  if (select count(*) from public.control_events where show_id = v_show) <> 3 then
    raise exception 'send-many self-check failed: the batch did not reach the log';
  end if;
  if (select live_cue->'layers'->'Bug'->>'cue' from public.control_shows where id = v_show) <> 'cue-a' then
    raise exception 'send-many self-check failed: a batched cue marker did not reach live_cue';
  end if;

  -- …and an Out clears that layer again, rather than leaving it reading as on air.
  perform public.control_send_many(v_slug, jsonb_build_array(
    jsonb_build_object('graphic', 'Bug', 'msg', jsonb_build_object('t', 'stop'), 'fast', true),
    jsonb_build_object('graphic', 'Bug', 'msg', jsonb_build_object('t', 'cue', 'cue', null), 'fast', true)));
  if (select live_cue->'layers' ? 'Bug' from public.control_shows where id = v_show) then
    raise exception 'send-many self-check failed: clearing a layer left it on air';
  end if;

  -- The throwaway production goes, and its log rows go with it (0008: on delete cascade).
  delete from public.control_shows where id = v_show;
end $$;
