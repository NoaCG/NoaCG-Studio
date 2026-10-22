-- live-path: control_shows gains data_paused, data_dispatched, data_held and data_received_at; control_data_apply and control_data_send hold the API's writes while paused (same signatures, same grants); one new control_* function, control_data_pause_by_slug
--
-- PAUSE FOR PUSHED DATA (docs/work-specs/data-sources/spec.md, phase C5, AC-7; docs/DATA_API.md
-- "Pause"). The data key is ONE source, "Another system", and Pause holds everything it sends:
--
-- - `/patch` (control_data_patch -> control_data_apply with the label 'api'): while paused the
--   patch is still merged into `data`, so the tree always holds the newest values, but the
--   resolve-diff-append is skipped. No update row, no budget spent.
-- - `/update` (control_data_send): while paused the values are kept in `data_held`, a per-graphic
--   last-write map ({graphic: {field: value}}), newest per field, and no row is written. It answers
--   NULL instead of an event id, which the route reports as held.
-- - Everything else still airs at once: an operator press ('operator', also the browser Sheet
--   reader's write) and the server tick ('sheet'). While paused those are diffed against
--   `data_dispatched`, the tree as it is on air (the tree at Pause, plus every write that aired
--   since), so a press on a path the API holds wins and is never sent twice.
-- - Resume (control_data_pause_by_slug(slug, false)) diffs `data` against `data_dispatched`, lays
--   the held `/update` values over the result (they are applied after), and appends ONE update row
--   per graphic marked 'api': exactly the final values, once. A null the API sent while paused
--   deleted its path from `data`, and a missing path resolves to nothing, so it sends nothing, as an
--   unpaused null does (the field keeps what it shows).
--
-- `data_received_at` is when the API last wrote anything, held or not: the "Received N s ago" of
-- the "Another system" card. The owner's page reads the four columns through its row policy.
--
-- The pause function takes the control slug, as every operator function does, and is
-- anon-callable for the same reason (scripts/supabase-advisors.mjs ACCEPTED_CLASSES): it can
-- only hold or release what the data key sent, which the slug holder could out-write anyway.
--
-- Additive and backwards compatible: the columns are nullable or have a constant default, the two
-- widened functions keep their signatures and grants and behave exactly as before while
-- `data_paused` is false, and a build that never calls the new function never pauses. Revert:
-- drop control_data_pause_by_slug and the four columns, and restore 0097's control_data_apply and
-- 0047's control_data_send (a production left paused then airs the API's next write as before).

set lock_timeout = '2s';
set statement_timeout = '30s';

-- ── 1. The pause state on the row ──────────────────────────────────────────────────────────────
alter table public.control_shows
  add column if not exists data_paused boolean not null default false,
  add column if not exists data_dispatched jsonb,
  add column if not exists data_held jsonb,
  add column if not exists data_received_at timestamptz;

-- ── 2. The apply: 0097's body, holding the API while paused ────────────────────────────────────
create or replace function public.control_data_apply(p_show uuid, p_patch jsonb, p_src text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_owner_id uuid;
  v_before jsonb;
  v_bindings jsonb;
  v_paused boolean;
  v_dispatched jsonb;
  v_base jsonb;
  v_next jsonb;
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
  select s.owner_id, s.data, s.bindings, s.data_paused, s.data_dispatched
    into v_owner_id, v_before, v_bindings, v_paused, v_dispatched
    from public.control_shows s
    where s.id = p_show
    for no key update;
  if v_owner_id is null then raise exception 'unknown production'; end if;
  if public.feature_denied_for(v_owner_id, 'control.hosted') then
    raise exception 'hosted control is switched off for this page' using errcode = '42501';
  end if;
  v_before := coalesce(v_before, '{}'::jsonb);

  -- PAUSED, THE API: merge, remember the receipt, write no row (0100).
  if v_paused and p_src = 'api' then
    update public.control_shows s
       set data = public.jsonb_merge_patch(v_before, p_patch), data_received_at = now()
     where s.id = p_show;
    return jsonb_build_object('data', public.jsonb_merge_patch(v_before, p_patch), 'writes', '[]'::jsonb, 'paused', true);
  end if;

  -- What the write is diffed against: the tree, or while paused the tree as it is on air.
  v_base := case when v_paused then coalesce(v_dispatched, '{}'::jsonb) else v_before end;
  v_next := public.jsonb_merge_patch(v_base, p_patch);

  select coalesce(jsonb_object_agg(g.graphic, g.fields), '{}'::jsonb), count(*)
    into v_changes, v_pending
  from (
    select a.graphic, jsonb_object_agg(a.field, a.value) as fields
    from public.production_data_resolve(v_next, v_bindings) a
    left join public.production_data_resolve(v_base, v_bindings) b
      on b.graphic = a.graphic and b.field = a.field
    where b.value is distinct from a.value
    group by a.graphic
  ) g;

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
    update public.control_shows s
       set data = public.jsonb_merge_patch(v_before, p_patch), data_dispatched = v_next
     where s.id = p_show;
    v_next := public.jsonb_merge_patch(v_before, p_patch);
  elsif v_next is distinct from v_before or p_src = 'api' then
    update public.control_shows s
       set data = v_next,
           data_received_at = case when p_src = 'api' then now() else s.data_received_at end
     where s.id = p_show;
  end if;

  for v_graphic, v_changed in select key, value from jsonb_each(v_changes) loop
    insert into public.control_events (show_id, graphic, msg)
      values (p_show, v_graphic, jsonb_build_object('t', 'update', 'data', v_changed, 'src', p_src))
      returning public.control_events.id into v_id;
    v_writes := v_writes || jsonb_build_object('graphic', v_graphic, 'event', v_id, 'applied', v_changed);
  end loop;

  if v_paused then
    return jsonb_build_object('data', v_next, 'writes', v_writes, 'paused', true);
  end if;
  return jsonb_build_object('data', v_next, 'writes', v_writes);
end $$;

-- ── 3. /update: 0047's body, held per graphic while paused ─────────────────────────────────────
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

-- ── 4. Pause and Resume, on the control slug ───────────────────────────────────────────────────
-- Answers {paused, writes}. Pausing twice or resuming an unpaused production changes nothing.
create or replace function public.control_data_pause_by_slug(p_slug text, p_paused boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
  v_owner uuid;
  v_data jsonb;
  v_bindings jsonb;
  v_paused boolean;
  v_dispatched jsonb;
  v_held jsonb;
  v_changes jsonb;
  v_pending int;
  v_recent int;
  v_graphic text;
  v_changed jsonb;
  v_id bigint;
  v_writes jsonb := '[]'::jsonb;
begin
  if p_paused is null then raise exception 'not a pause'; end if;
  select s.id, s.owner_id, coalesce(s.data, '{}'::jsonb), s.bindings, s.data_paused,
         coalesce(s.data_dispatched, '{}'::jsonb), coalesce(s.data_held, '{}'::jsonb)
    into v_show, v_owner, v_data, v_bindings, v_paused, v_dispatched, v_held
    from public.control_shows s where s.slug = p_slug and p_slug is not null
    for no key update;
  if v_show is null then raise exception 'unknown control slug'; end if;
  if public.feature_denied_for(v_owner, 'control.hosted') then
    raise exception 'hosted control is switched off for this page' using errcode = '42501';
  end if;

  if p_paused then
    if not v_paused then
      update public.control_shows s
         set data_paused = true, data_dispatched = v_data, data_held = '{}'::jsonb
       where s.id = v_show;
    end if;
    return jsonb_build_object('paused', true, 'writes', '[]'::jsonb);
  end if;
  if not v_paused then
    return jsonb_build_object('paused', false, 'writes', '[]'::jsonb);
  end if;

  -- What changed while paused, per graphic, with the held /update values laid over it.
  select coalesce(jsonb_object_agg(g.graphic, g.fields), '{}'::jsonb)
    into v_changes
  from (
    select a.graphic, jsonb_object_agg(a.field, a.value) as fields
    from public.production_data_resolve(v_data, v_bindings) a
    left join public.production_data_resolve(v_dispatched, v_bindings) b
      on b.graphic = a.graphic and b.field = a.field
    where b.value is distinct from a.value
    group by a.graphic
  ) g;
  select coalesce(jsonb_object_agg(k.graphic, coalesce(v_changes->k.graphic, '{}'::jsonb) || coalesce(v_held->k.graphic, '{}'::jsonb)), '{}'::jsonb),
         count(*)
    into v_changes, v_pending
    from (select jsonb_object_keys(v_changes) as graphic
          union select jsonb_object_keys(v_held)) k;

  if v_pending > 0 then
    select count(*) into v_recent
      from public.control_events e
      where e.show_id = v_show and e.created_at > now() - interval '5 seconds';
    if v_recent + v_pending > 50 then
      raise exception 'too many commands — slow down' using errcode = 'check_violation';
    end if;
  end if;

  update public.control_shows s
     set data_paused = false, data_dispatched = null, data_held = null
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

-- ── 5. Self-check ──────────────────────────────────────────────────────────────────────────────
-- supabase/AGENTS.md: CALL the thing. The cases are scripts/data-pause-conformance.mjs, embedded
-- here as written there (scripts/data-pause.test.mjs fails the build when the two differ); each
-- runs on a throwaway production in a block that is always rolled back. A case's steps are
-- `patch` (/patch), `update` (/update), `press` (an operator press), `sheet` (the server tick),
-- `pause` and `resume`; `rows` are the update rows it appends, in order, and `data` the final tree.
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
    {"name":"unpaused, a patch and an /update air at once as before","bindings":{"Bug":{"f0":"api.bug.score"}},"data":{"api":{"bug":{"score":1}}},"steps":[{"op":"patch","patch":{"api":{"bug":{"score":2}}}},{"op":"update","graphic":"Card","data":{"f0":"x"}}],"rows":[{"graphic":"Bug","src":"api","data":{"f0":"2"}},{"graphic":"Card","src":"api","data":{"f0":"x"}}],"data_after":{"api":{"bug":{"score":2}}}}
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
      if (select s.data_paused or s.data_dispatched is not null or s.data_held is not null
                 or s.data_received_at is null
            from public.control_shows s where s.id = v_show) is distinct from false then
        raise exception '0100 self-check failed: % - the row was not left unpaused, empty and received', v_case->>'name';
      end if;
    end loop;

    -- An unknown slug and a missing answer are refused before anything is read.
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
