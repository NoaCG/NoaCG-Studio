-- live-path: control_shows gains data_paused, data_pending, data_held and data_received_at; control_data_apply and control_data_send hold the API's writes while paused (same signatures, same grants); two new control_* functions, control_data_pause_by_slug and control_data_owner_patch
--
-- PAUSE FOR PUSHED DATA (docs/work-specs/data-sources/spec.md, phase C5, AC-7; docs/DATA_API.md
-- "Pause"). The data key is ONE source, "Another system", and Pause holds everything it sends.
-- While paused, `data` stays the tree that is ON AIR, so everything that reads it (a Take, an
-- Update, the operator pages, `/state`) shows air, never a held value:
--
-- - `/patch` (control_data_patch -> control_data_apply with the label 'api') merges into
--   `data_pending`, the tree as the API sees it (the tree at Pause plus everything written since),
--   and appends no row: no update, no budget spent. It answers that tree with `paused: true`.
-- - `/update` (control_data_send) keeps its values in `data_held`, a per-graphic last-write map
--   ({graphic: {field: value}}), and answers NULL instead of an event id (the route says held).
-- - Everything else airs at once, exactly as unpaused: an operator press ('operator', also the
--   browser Sheet reader's write and the owner's Data view through control_data_owner_patch) and
--   the server tick ('sheet'). Each such write is also merged into `data_pending`, so a press
--   after a held value wins, and a held value after a press wins: the final value is the last one.
-- - A held `/update` field is dropped when a later write names that field's path (a press, the
--   tick, or a `/patch`, a null that deletes it included), even when the value does not change,
--   for the same reason.
-- - Resume (control_data_pause_by_slug(slug, false)) diffs `data_pending` against `data`, lays the
--   held `/update` values over the result, appends ONE update row per graphic marked 'api' (exactly
--   the final values, once) and makes `data_pending` the tree. It never refuses: the rows are
--   bounded by the production's graphics, and a Resume that failed would leave the source held.
--   A null the API sent while paused deleted its path, and a missing path resolves to nothing, so
--   it sends nothing, as an unpaused null does (the field keeps what it shows).
--
-- `data_received_at` is when the API last wrote anything, held or not (at most once a second when
-- nothing changed): the "Received N s ago" of the "Another system" card. The owner's page reads the
-- columns through its row policy.
--
-- control_data_pause_by_slug takes the control slug, as every operator function does, and is
-- anon-callable for the same reason (scripts/supabase-advisors.mjs ACCEPTED_CLASSES).
-- control_data_owner_patch is the signed-in owner's (or team member's) Data view on a published
-- production: the row policy's own test, then control_data_apply as 'operator', so the owner's
-- typing airs while the API is paused and is never counted as a receipt from Another system.
--
-- Additive and backwards compatible: new columns are nullable or have a constant default, the two
-- widened functions keep their signatures and grants and, while `data_paused` is false, write the
-- same tree and the same rows as before (the API's writes also stamp `data_received_at`), and a
-- build that never calls the new functions never pauses. Revert: drop the two functions,
-- production_data_changes, production_data_addressed, production_data_held_without and the four columns, and restore 0097's
-- control_data_apply and 0047's control_data_send (a production left paused then airs the API's
-- next write as before; its held values are lost).

set lock_timeout = '2s';
set statement_timeout = '30s';

-- ── 1. The pause state on the row ──────────────────────────────────────────────────────────────
alter table public.control_shows
  add column if not exists data_paused boolean not null default false,
  add column if not exists data_pending jsonb,
  add column if not exists data_held jsonb,
  add column if not exists data_received_at timestamptz;

-- ── 2. Two helpers ─────────────────────────────────────────────────────────────────────────────
-- What a write changes on air: {graphic: {field: value}} for every bound field whose value differs
-- between the two trees (0048's resolve, the diff every apply already ran).
create or replace function public.production_data_changes(p_after jsonb, p_before jsonb, p_bindings jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(g.graphic, g.fields), '{}'::jsonb)
  from (
    select a.graphic, jsonb_object_agg(a.field, a.value) as fields
    from public.production_data_resolve(p_after, p_bindings) a
    left join public.production_data_resolve(p_before, p_bindings) b
      on b.graphic = a.graphic and b.field = a.field
    where b.value is distinct from a.value
    group by a.graphic
  ) g;
$$;
revoke execute on function public.production_data_changes(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.production_data_changes(jsonb, jsonb, jsonb) to service_role;

-- Every bound field a write NAMES: its path is written, or lies under or above a written path
-- (a null that deletes it included), whether or not the value changes. {graphic: {field: true}}.
-- What supersedes a held /update: the later write is the final value even when it repeats one.
create or replace function public.production_data_addressed(p_patch jsonb, p_bindings jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(x.graphic, x.fields), '{}'::jsonb)
  from (
    select g.key as graphic, jsonb_object_agg(f.key, true) as fields
    from jsonb_each(coalesce(p_bindings, '{}'::jsonb)) g
    cross join lateral jsonb_each_text(case when jsonb_typeof(g.value) = 'object' then g.value else '{}'::jsonb end) f
    where exists (
      select 1 from public.production_data_patch_paths(p_patch) w
      where w.path = f.value or starts_with(f.value, w.path || '.') or starts_with(w.path, f.value || '.'))
    group by g.key
  ) x;
$$;
revoke execute on function public.production_data_addressed(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.production_data_addressed(jsonb, jsonb) to service_role;

-- A held /update map without the fields a later write moved; a graphic left with none goes.
create or replace function public.production_data_held_without(p_held jsonb, p_changes jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(h.key, h.kept), '{}'::jsonb)
  from (
    select e.key, e.value - array(select jsonb_object_keys(coalesce(p_changes->e.key, '{}'::jsonb))) as kept
    from jsonb_each(coalesce(p_held, '{}'::jsonb)) e
  ) h
  where h.kept <> '{}'::jsonb;
$$;
revoke execute on function public.production_data_held_without(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.production_data_held_without(jsonb, jsonb) to service_role;

-- ── 3. The apply: 0097's body, holding the API while paused ────────────────────────────────────
create or replace function public.control_data_apply(p_show uuid, p_patch jsonb, p_src text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_owner_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_bindings jsonb;
  v_paused boolean;
  v_pending_tree jsonb;
  v_next_pending jsonb;
  v_held jsonb;
  v_received timestamptz;
  v_recent int;
  v_ingest int;
  v_graphic text;
  v_changes jsonb;
  v_changed jsonb;
  v_id bigint;
  v_writes jsonb := '[]'::jsonb;
  v_pending int;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'not a data patch';
  end if;
  -- 'sheet' is the server tick (0097): its rows ride the ordinary 50-per-5-s cap, never the feed's
  -- ingest budget, like the operator's.
  if p_src is null or p_src not in ('api', 'operator', 'sheet') then
    raise exception 'unknown data source';
  end if;
  -- NO KEY UPDATE serialises two feeds (or a feed and an operator) racing on the same production
  -- exactly as FOR UPDATE did, and lets a Take's KEY SHARE through (0071).
  select s.owner_id, s.data, s.bindings, s.data_paused, s.data_pending, s.data_held, s.data_received_at
    into v_owner_id, v_before, v_bindings, v_paused, v_pending_tree, v_held, v_received
    from public.control_shows s
    where s.id = p_show
    for no key update;
  if v_owner_id is null then raise exception 'unknown production'; end if;
  if public.feature_denied_for(v_owner_id, 'control.hosted') then
    raise exception 'hosted control is switched off for this page' using errcode = '42501';
  end if;

  -- PAUSED, THE API: into the API's own tree, nothing on air (0100). A held /update for a field
  -- this patch moves is superseded by it.
  if v_paused and p_src = 'api' then
    v_pending_tree := coalesce(v_pending_tree, v_before, '{}'::jsonb);
    v_after := public.jsonb_merge_patch(v_pending_tree, p_patch);
    update public.control_shows s
       set data_pending = v_after,
           data_held = public.production_data_held_without(v_held, public.production_data_addressed(p_patch, v_bindings)),
           data_received_at = now()
     where s.id = p_show;
    return jsonb_build_object('data', v_after, 'writes', '[]'::jsonb, 'paused', true);
  end if;

  v_after := public.jsonb_merge_patch(coalesce(v_before, '{}'::jsonb), p_patch);
  v_changes := public.production_data_changes(v_after, v_before, v_bindings);
  select count(*) into v_pending from jsonb_object_keys(v_changes);

  if v_pending > 0 then
    select count(*), count(*) filter (where e.msg->>'src' = 'api')
      into v_recent, v_ingest
      from public.control_events e
      where e.show_id = p_show and e.created_at > now() - interval '5 seconds';
    if v_recent + v_pending > 50 then
      raise exception 'too many commands — slow down' using errcode = 'check_violation';
    end if;
    if p_src = 'api' and v_ingest + v_pending > 25 then
      raise exception 'data budget spent — the operator keeps priority' using errcode = 'check_violation';
    end if;
  end if;

  if v_paused then
    -- An operator write while the API is paused: it airs as usual, joins the API's tree so the
    -- last value wins at Resume, and supersedes any held /update for the fields it names (a press
    -- of the value air already shows still comes after the API's).
    v_pending_tree := coalesce(v_pending_tree, v_before, '{}'::jsonb);
    v_next_pending := public.jsonb_merge_patch(v_pending_tree, p_patch);
    update public.control_shows s
       set data = v_after,
           data_pending = v_next_pending,
           data_held = public.production_data_held_without(v_held, public.production_data_addressed(p_patch, v_bindings))
     where s.id = p_show;
  elsif v_after is distinct from v_before
        or (p_src = 'api' and (v_received is null or v_received < now() - interval '1 second')) then
    update public.control_shows s
       set data = v_after,
           data_received_at = case when p_src = 'api' then now() else s.data_received_at end
     where s.id = p_show;
  end if;

  for v_graphic, v_changed in select key, value from jsonb_each(v_changes) loop
    insert into public.control_events (show_id, graphic, msg)
      values (p_show, v_graphic, jsonb_build_object('t', 'update', 'data', v_changed, 'src', p_src))
      returning public.control_events.id into v_id;
    v_writes := v_writes || jsonb_build_object('graphic', v_graphic, 'event', v_id, 'applied', v_changed);
  end loop;

  return jsonb_build_object('data', v_after, 'writes', v_writes);
end $$;

-- ── 4. /update: 0047's body, held per graphic while paused ─────────────────────────────────────
create or replace function public.control_data_send(p_key text, p_graphic text, p_data jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
  v_owner uuid;
  v_paused boolean;
  v_held jsonb;
  v_recent int;
  v_ingest int;
  v_id bigint;
begin
  select s.id, s.owner_id, s.data_paused, coalesce(s.data_held, '{}'::jsonb)
    into v_show, v_owner, v_paused, v_held
    from public.control_shows s where s.data_key = p_key and p_key is not null
    for no key update;
  if v_show is null then raise exception 'unknown data key'; end if;
  if public.feature_denied_for(v_owner, 'control.hosted') then
    raise exception 'hosted control is switched off for this page' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'not an update';
  end if;
  -- PAUSED: kept, newest per field, and sent once by Resume (0100). NULL says held.
  if v_paused then
    update public.control_shows s
       set data_held = v_held || jsonb_build_object(p_graphic, coalesce(v_held->p_graphic, '{}'::jsonb) || p_data),
           data_received_at = now()
     where s.id = v_show;
    return null;
  end if;
  select count(*),
         count(*) filter (where e.msg->>'src' = 'api')
    into v_recent, v_ingest
    from public.control_events e
    where e.show_id = v_show and e.created_at > now() - interval '5 seconds';
  if v_recent >= 50 then
    raise exception 'too many commands — slow down' using errcode = 'check_violation';
  end if;
  if v_ingest >= 25 then
    raise exception 'data budget spent — the operator keeps priority' using errcode = 'check_violation';
  end if;
  insert into public.control_events (show_id, graphic, msg)
    values (v_show, p_graphic, jsonb_build_object('t', 'update', 'data', p_data, 'src', 'api'))
    returning public.control_events.id into v_id;
  update public.control_shows s set data_received_at = now() where s.id = v_show;
  return v_id;
end $$;

-- ── 5. Pause and Resume, on the control slug ───────────────────────────────────────────────────
-- Answers {paused, writes}. Pausing twice or resuming an unpaused production changes nothing.
create or replace function public.control_data_pause_by_slug(p_slug text, p_paused boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
  v_owner uuid;
  v_data jsonb;
  v_bindings jsonb;
  v_paused boolean;
  v_pending_tree jsonb;
  v_held jsonb;
  v_changes jsonb;
  v_graphic text;
  v_changed jsonb;
  v_id bigint;
  v_writes jsonb := '[]'::jsonb;
begin
  if p_paused is null then raise exception 'not a pause'; end if;
  select s.id, s.owner_id, coalesce(s.data, '{}'::jsonb), s.bindings, s.data_paused,
         s.data_pending, coalesce(s.data_held, '{}'::jsonb)
    into v_show, v_owner, v_data, v_bindings, v_paused, v_pending_tree, v_held
    from public.control_shows s where s.slug = p_slug and p_slug is not null
    for no key update;
  if v_show is null then raise exception 'unknown control slug'; end if;
  if public.feature_denied_for(v_owner, 'control.hosted') then
    raise exception 'hosted control is switched off for this page' using errcode = '42501';
  end if;

  if p_paused then
    if not v_paused then
      update public.control_shows s
         set data_paused = true, data_pending = v_data, data_held = '{}'::jsonb
       where s.id = v_show;
    end if;
    return jsonb_build_object('paused', true, 'writes', '[]'::jsonb);
  end if;
  if not v_paused then
    return jsonb_build_object('paused', false, 'writes', '[]'::jsonb);
  end if;

  -- What changed while paused, per graphic, with the held /update values laid over it.
  v_pending_tree := coalesce(v_pending_tree, v_data);
  v_changes := public.production_data_changes(v_pending_tree, v_data, v_bindings);
  select coalesce(jsonb_object_agg(k.graphic, coalesce(v_changes->k.graphic, '{}'::jsonb) || coalesce(v_held->k.graphic, '{}'::jsonb)), '{}'::jsonb)
    into v_changes
    from (select jsonb_object_keys(v_changes) as graphic
          union select jsonb_object_keys(v_held)) k;

  update public.control_shows s
     set data = v_pending_tree, data_paused = false, data_pending = null, data_held = null
   where s.id = v_show;

  for v_graphic, v_changed in select key, value from jsonb_each(v_changes) loop
    insert into public.control_events (show_id, graphic, msg)
      values (v_show, v_graphic, jsonb_build_object('t', 'update', 'data', v_changed, 'src', 'api'))
      returning public.control_events.id into v_id;
    v_writes := v_writes || jsonb_build_object('graphic', v_graphic, 'event', v_id, 'applied', v_changed);
  end loop;
  return jsonb_build_object('paused', false, 'writes', v_writes);
end $$;
revoke execute on function public.control_data_pause_by_slug(text, boolean) from public, anon, authenticated;
grant execute on function public.control_data_pause_by_slug(text, boolean) to anon, authenticated, service_role;

-- ── 6. The owner's Data view on a published production ─────────────────────────────────────────
-- The row policy's test (control_shows_owner_all, 0063) and the suspension check, then the apply as
-- 'operator': the owner's typing airs while the API is paused and is not a receipt.
create or replace function public.control_data_owner_patch(p_show uuid, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if (select public.is_suspended())
     or not exists (
       select 1 from public.control_shows s
       where s.id = p_show
         and case when s.team_id is null then (select auth.uid()) = s.owner_id
                  else public.is_team_member(s.team_id) end) then
    raise exception 'not your production' using errcode = '42501';
  end if;
  return public.control_data_apply(p_show, p_patch, 'operator');
end $$;
revoke execute on function public.control_data_owner_patch(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.control_data_owner_patch(uuid, jsonb) to authenticated, service_role;

-- ── 7. Self-check ──────────────────────────────────────────────────────────────────────────────
-- supabase/AGENTS.md: CALL the thing. The cases are scripts/data-pause-conformance.mjs, embedded
-- here as written there (scripts/data-pause.test.mjs fails the build when the two differ); each
-- runs on a throwaway production in a block that is always rolled back. A case's steps are
-- `patch` (/patch), `update` (/update), `press` (an operator press), `sheet` (the server tick),
-- `owner` (the owner's Data view), `pause`, `resume`, and `data` (the tree operators read now must
-- be `expect`); `rows` are the update rows it appends, in order, and `data_after` the final tree.
do $$
declare
  v_cases jsonb := $pause$[
    {"name":"a paused patch keeps the tree and writes no row; Resume sends the final value once","bindings":{"Bug":{"f0":"api.bug.score"}},"data":{"api":{"bug":{"score":1}}},"steps":[{"op":"pause"},{"op":"patch","patch":{"api":{"bug":{"score":2}}}},{"op":"patch","patch":{"api":{"bug":{"score":3}}}},{"op":"resume"}],"rows":[{"graphic":"Bug","src":"api","data":{"f0":"3"}}],"data_after":{"api":{"bug":{"score":3}}}},
    {"name":"an operator press airs at once while paused and is not sent again by Resume","bindings":{"Bug":{"f0":"api.bug.score","f1":"show.title"}},"data":{"api":{"bug":{"score":1}},"show":{"title":"A"}},"steps":[{"op":"pause"},{"op":"patch","patch":{"api":{"bug":{"score":2}}}},{"op":"press","patch":{"show":{"title":"B"}}},{"op":"resume"}],"rows":[{"graphic":"Bug","src":"operator","data":{"f1":"B"}},{"graphic":"Bug","src":"api","data":{"f0":"2"}}],"data_after":{"api":{"bug":{"score":2}},"show":{"title":"B"}}},
    {"name":"a press on a path the API holds wins and Resume sends nothing for it","bindings":{"Bug":{"f0":"api.bug.score"}},"data":{"api":{"bug":{"score":1}}},"steps":[{"op":"pause"},{"op":"patch","patch":{"api":{"bug":{"score":2}}}},{"op":"press","patch":{"api":{"bug":{"score":5}}}},{"op":"resume"}],"rows":[{"graphic":"Bug","src":"operator","data":{"f0":"5"}}],"data_after":{"api":{"bug":{"score":5}}}},
    {"name":"a press of the value the API holds still airs, because air is the paused tree","bindings":{"Bug":{"f0":"api.bug.score"}},"data":{"api":{"bug":{"score":1}}},"steps":[{"op":"pause"},{"op":"patch","patch":{"api":{"bug":{"score":3}}}},{"op":"sheet","patch":{"api":{"bug":{"score":3}}}},{"op":"resume"}],"rows":[{"graphic":"Bug","src":"sheet","data":{"f0":"3"}}],"data_after":{"api":{"bug":{"score":3}}}},
    {"name":"a null while paused deletes the path and Resume sends nothing for it, as an unpaused null","bindings":{"Bug":{"f0":"api.bug.score","f1":"api.bug.name"}},"data":{"api":{"bug":{"score":1,"name":"A"}}},"steps":[{"op":"pause"},{"op":"patch","patch":{"api":{"bug":{"score":2,"name":"B"}}}},{"op":"patch","patch":{"api":{"bug":{"score":null}}}},{"op":"resume"}],"rows":[{"graphic":"Bug","src":"api","data":{"f1":"B"}}],"data_after":{"api":{"bug":{"name":"B"}}}},
    {"name":"a value sent after a null while paused is the final value","bindings":{"Bug":{"f0":"api.bug.score"}},"data":{"api":{"bug":{"score":1}}},"steps":[{"op":"pause"},{"op":"patch","patch":{"api":{"bug":{"score":null}}}},{"op":"patch","patch":{"api":{"bug":{"score":4}}}},{"op":"resume"}],"rows":[{"graphic":"Bug","src":"api","data":{"f0":"4"}}],"data_after":{"api":{"bug":{"score":4}}}},
    {"name":"Resume after an unchanged value sends nothing","bindings":{"Bug":{"f0":"api.bug.score"}},"data":{"api":{"bug":{"score":1}}},"steps":[{"op":"pause"},{"op":"patch","patch":{"api":{"bug":{"score":2}}}},{"op":"patch","patch":{"api":{"bug":{"score":1}}}},{"op":"resume"}],"rows":[],"data_after":{"api":{"bug":{"score":1}}}},
    {"name":"an /update while paused is held newest per field and sent after the diff, one row per graphic","bindings":{"Bug":{"f0":"api.bug.score"}},"data":{"api":{"bug":{"score":1}}},"steps":[{"op":"pause"},{"op":"update","graphic":"Card","data":{"f0":"a","f1":"b"}},{"op":"update","graphic":"Card","data":{"f0":"c"}},{"op":"patch","patch":{"api":{"bug":{"score":2}}}},{"op":"resume"}],"rows":[{"graphic":"Bug","src":"api","data":{"f0":"2"}},{"graphic":"Card","src":"api","data":{"f0":"c","f1":"b"}}],"data_after":{"api":{"bug":{"score":2}}}},
    {"name":"a held /update to a bound field is laid over the diff in the same row","bindings":{"Bug":{"f0":"api.bug.score","f1":"api.bug.name"}},"data":{"api":{"bug":{"score":1,"name":"A"}}},"steps":[{"op":"pause"},{"op":"patch","patch":{"api":{"bug":{"score":2,"name":"B"}}}},{"op":"update","graphic":"Bug","data":{"f0":"9"}},{"op":"resume"}],"rows":[{"graphic":"Bug","src":"api","data":{"f0":"9","f1":"B"}}],"data_after":{"api":{"bug":{"score":2,"name":"B"}}}},
    {"name":"pausing twice holds once, and a second Resume sends nothing more","bindings":{"Bug":{"f0":"api.bug.score"}},"data":{"api":{"bug":{"score":1}}},"steps":[{"op":"resume"},{"op":"pause"},{"op":"patch","patch":{"api":{"bug":{"score":2}}}},{"op":"pause"},{"op":"resume"},{"op":"resume"}],"rows":[{"graphic":"Bug","src":"api","data":{"f0":"2"}}],"data_after":{"api":{"bug":{"score":2}}}},
    {"name":"unpaused, a patch and an /update air at once as before","bindings":{"Bug":{"f0":"api.bug.score"}},"data":{"api":{"bug":{"score":1}}},"steps":[{"op":"patch","patch":{"api":{"bug":{"score":2}}}},{"op":"update","graphic":"Card","data":{"f0":"x"}}],"rows":[{"graphic":"Bug","src":"api","data":{"f0":"2"}},{"graphic":"Card","src":"api","data":{"f0":"x"}}],"data_after":{"api":{"bug":{"score":2}}}},
    {"name":"while paused, operators read the on-air tree; Resume makes the API's tree the tree","bindings":{"Bug":{"f0":"api.bug.score"}},"data":{"api":{"bug":{"score":1}}},"steps":[{"op":"pause"},{"op":"patch","patch":{"api":{"bug":{"score":2}}}},{"op":"data","expect":{"api":{"bug":{"score":1}}}},{"op":"resume"},{"op":"data","expect":{"api":{"bug":{"score":2}}}}],"rows":[{"graphic":"Bug","src":"api","data":{"f0":"2"}}],"data_after":{"api":{"bug":{"score":2}}}},
    {"name":"a press after a held /update supersedes it","bindings":{"Bug":{"f0":"api.bug.score"}},"data":{"api":{"bug":{"score":1}}},"steps":[{"op":"pause"},{"op":"update","graphic":"Bug","data":{"f0":"9"}},{"op":"press","patch":{"api":{"bug":{"score":5}}}},{"op":"resume"}],"rows":[{"graphic":"Bug","src":"operator","data":{"f0":"5"}}],"data_after":{"api":{"bug":{"score":5}}}},
    {"name":"a /patch after a held /update moves the field, so the patch's value is final","bindings":{"Bug":{"f0":"api.bug.score"}},"data":{"api":{"bug":{"score":1}}},"steps":[{"op":"pause"},{"op":"update","graphic":"Bug","data":{"f0":"9"}},{"op":"patch","patch":{"api":{"bug":{"score":2}}}},{"op":"resume"}],"rows":[{"graphic":"Bug","src":"api","data":{"f0":"2"}}],"data_after":{"api":{"bug":{"score":2}}}},
    {"name":"a value the API sends after a press is the final value","bindings":{"Bug":{"f0":"api.bug.score"}},"data":{"api":{"bug":{"score":1}}},"steps":[{"op":"pause"},{"op":"press","patch":{"api":{"bug":{"score":5}}}},{"op":"patch","patch":{"api":{"bug":{"score":3}}}},{"op":"resume"}],"rows":[{"graphic":"Bug","src":"operator","data":{"f0":"5"}},{"graphic":"Bug","src":"api","data":{"f0":"3"}}],"data_after":{"api":{"bug":{"score":3}}}},
    {"name":"the owner's Data view airs while paused and is not a receipt","bindings":{"Bug":{"f0":"api.bug.score"}},"data":{"api":{"bug":{"score":1}}},"steps":[{"op":"pause"},{"op":"owner","patch":{"api":{"bug":{"score":4}}}},{"op":"resume"}],"rows":[{"graphic":"Bug","src":"operator","data":{"f0":"4"}}],"data_after":{"api":{"bug":{"score":4}}}},
    {"name":"a press of the value air already shows, after a held /update, still wins","bindings":{"Bug":{"f0":"api.bug.score"}},"data":{"api":{"bug":{"score":1}}},"steps":[{"op":"pause"},{"op":"patch","patch":{"api":{"bug":{"score":2}}}},{"op":"update","graphic":"Bug","data":{"f0":"9"}},{"op":"press","patch":{"api":{"bug":{"score":1}}}},{"op":"resume"}],"rows":[],"data_after":{"api":{"bug":{"score":1}}}},
    {"name":"a null after a held /update deletes the path, so the held value is dropped and the field keeps what it showed","bindings":{"Bug":{"f0":"api.bug.score"}},"data":{"api":{"bug":{"score":1}}},"steps":[{"op":"pause"},{"op":"update","graphic":"Bug","data":{"f0":"9"}},{"op":"patch","patch":{"api":{"bug":{"score":null}}}},{"op":"resume"}],"rows":[],"data_after":{"api":{"bug":{}}}},
    {"name":"a later /patch that repeats the tree's value still supersedes a held /update","bindings":{"Bug":{"f0":"api.bug.score"}},"data":{"api":{"bug":{"score":1}}},"steps":[{"op":"pause"},{"op":"update","graphic":"Bug","data":{"f0":"9"}},{"op":"patch","patch":{"api":{"bug":{"score":1}}}},{"op":"resume"}],"rows":[],"data_after":{"api":{"bug":{"score":1}}}},
    {"name":"a null that deletes a whole branch supersedes a held /update for a field under it","bindings":{"Bug":{"f0":"api.bug.score"}},"data":{"api":{"bug":{"score":1}}},"steps":[{"op":"pause"},{"op":"update","graphic":"Bug","data":{"f0":"9"}},{"op":"patch","patch":{"api":{"bug":null}}},{"op":"resume"}],"rows":[],"data_after":{"api":{}}}
  ]$pause$::jsonb;
  v_user uuid := gen_random_uuid();
  v_case jsonb;
  v_step jsonb;
  v_show uuid;
  v_slug text;
  v_key text;
  v_paused boolean;
  v_ans jsonb;
  v_event bigint;
  v_rows jsonb;
  v_got jsonb;
  v_n int := 0;
begin
  -- (a) Shape: the slug door is reachable from a page; the widened bodies kept their grants.
  if not has_function_privilege('anon', 'public.control_data_pause_by_slug(text,boolean)', 'execute')
     or not has_function_privilege('authenticated', 'public.control_data_pause_by_slug(text,boolean)', 'execute') then
    raise exception '0100 self-check failed: an operator page cannot reach Pause';
  end if;
  if has_function_privilege('anon', 'public.control_data_owner_patch(uuid,jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'public.control_data_owner_patch(uuid,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.production_data_changes(jsonb,jsonb,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.production_data_addressed(jsonb,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.production_data_held_without(jsonb,jsonb)', 'execute') then
    raise exception '0100 self-check failed: the owner door or a helper has the wrong grants';
  end if;
  if has_function_privilege('anon', 'public.control_data_apply(uuid,jsonb,text)', 'execute')
     or has_function_privilege('anon', 'public.control_data_send(text,text,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.control_data_send(text,text,jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.control_data_send(text,text,jsonb)', 'execute') then
    raise exception '0100 self-check failed: control_data_apply or control_data_send lost or gained a grant';
  end if;

  -- (b) Behaviour: every case, always rolled back.
  begin
    begin
      insert into auth.users (id, instance_id, aud, role, email)
      values (v_user, '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', '0100-self-check@noacg.invalid');
    exception when others then
      raise notice '0100 self-check: no throwaway account could be made (%), skipping the behavioural half', sqlerrm;
      return;
    end;
    if public.feature_denied_for(v_user, 'control.hosted') then
      raise notice '0100 self-check: hosted control is switched off on this instance, skipping the behavioural half';
      raise exception '0100 self-check passed';
    end if;

    for v_case in select c.value from jsonb_array_elements(v_cases) c loop
      v_n := v_n + 1;
      v_show := gen_random_uuid();
      insert into public.control_shows (id, owner_id, title, data, bindings)
        values (v_show, v_user, '0100 self-check ' || v_n, v_case->'data', v_case->'bindings')
        returning slug, data_key into v_slug, v_key;
      v_paused := false;
      for v_step in select s.value from jsonb_array_elements(v_case->'steps') s loop
        case v_step->>'op'
          when 'patch' then
            v_ans := public.control_data_patch(v_key, v_step->'patch');
            if v_paused and ((v_ans->>'paused')::boolean is not true or jsonb_array_length(v_ans->'writes') <> 0) then
              raise exception '0100 self-check failed: %: a paused patch did not say so or wrote (%)', v_case->>'name', v_ans;
            end if;
          when 'update' then
            v_event := public.control_data_send(v_key, v_step->>'graphic', v_step->'data');
            if v_paused is distinct from (v_event is null) then
              raise exception '0100 self-check failed: %: an /update answered % while paused=%', v_case->>'name', v_event, v_paused;
            end if;
          when 'press' then perform public.control_data_apply(v_show, v_step->'patch', 'operator');
          when 'owner' then
            perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
            perform public.control_data_owner_patch(v_show, v_step->'patch');
            perform set_config('request.jwt.claims', '', true);
          when 'data' then
            select s.data into v_got from public.control_shows s where s.id = v_show;
            if v_got is distinct from (v_step->'expect') then
              raise exception '0100 self-check failed: % - operators read %, expected %', v_case->>'name', v_got, v_step->'expect';
            end if;
          when 'sheet' then perform public.control_data_apply(v_show, v_step->'patch', 'sheet');
          when 'pause' then
            v_ans := public.control_data_pause_by_slug(v_slug, true);
            v_paused := true;
          when 'resume' then
            v_ans := public.control_data_pause_by_slug(v_slug, false);
            v_paused := false;
          else raise exception '0100 self-check: unknown step %', v_step;
        end case;
      end loop;

      select coalesce(jsonb_agg(jsonb_build_object('graphic', e.graphic, 'src', e.msg->>'src', 'data', e.msg->'data') order by e.id), '[]'::jsonb)
        into v_rows
        from public.control_events e
        where e.show_id = v_show and e.msg->>'t' = 'update';
      if v_rows is distinct from (v_case->'rows') then
        raise exception '0100 self-check failed: % - rows %, expected %', v_case->>'name', v_rows, v_case->'rows';
      end if;
      select s.data into v_got from public.control_shows s where s.id = v_show;
      if v_got is distinct from (v_case->'data_after') then
        raise exception '0100 self-check failed: % - data %, expected %', v_case->>'name', v_got, v_case->'data_after';
      end if;
      -- Left unpaused and empty; a receipt exactly when the API wrote (never for the owner's typing).
      if (select s.data_paused or s.data_pending is not null or s.data_held is not null
                 or (s.data_received_at is null) = exists (
                      select 1 from jsonb_array_elements(v_case->'steps') x where x.value->>'op' in ('patch', 'update'))
            from public.control_shows s where s.id = v_show) is distinct from false then
        raise exception '0100 self-check failed: % - the row was not left unpaused, empty and with an honest receipt', v_case->>'name';
      end if;
    end loop;

    -- The owner's door refuses anyone the row policy would.
    perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
    begin
      perform public.control_data_owner_patch(v_show, '{"x":1}'::jsonb);
      raise exception '0100 self-check failed: a stranger wrote through the owner''s door';
    exception when others then
      if sqlerrm <> 'not your production' then raise; end if;
    end;
    perform set_config('request.jwt.claims', '', true);

    -- An unknown slug is refused before anything is read.
    begin
      perform public.control_data_pause_by_slug('0100-no-such-slug', true);
      raise exception '0100 self-check failed: an unknown slug paused';
    exception when others then
      if sqlerrm <> 'unknown control slug' then raise; end if;
    end;

    raise exception '0100 self-check passed';
  exception when others then
    if sqlerrm <> '0100 self-check passed' then raise; end if;
  end;
end $$;
