-- live-path: control_shows gains `sources`; two new control_* tables (a published source's read state and the tick's run record) and five new control_* functions; control_data_apply accepts the source label 'sheet' (same signature, same grants, every existing caller unchanged)
--
-- PUBLISHED SOURCES AND THE SERVER TICK (docs/work-specs/data-sources/spec.md, phase C2;
-- docs/work-specs/sheet-data-flow/spec.md, "While the show runs" and "Status and Pause").
--
-- `control_shows.sources` is the production's `Show.sources` (src/model/shows.ts), written at
-- publish and again at once on connect, disconnect and Pause, beside `bindings`, by the owner's
-- page through the owner's row policy. Like `bindings` it is the operators' only: no output or
-- audience function selects it, and the row has no anon read.
--
-- `control_source_reads` is a published source's READ STATE, one row per source: the lease (who
-- reads it, under which claim, until when), the snapshot the diff runs against (connected path ->
-- the text last written there), the tab content's fingerprint and the status a reload shows. One
-- row for every reader, so the browser and the tick hand over with the snapshot, and an unchanged
-- cell after a handover never undoes an operator's override (sheet AC-5).
--
-- THE LEASE is one function, `control_source_lease`, that browser readers (on the control slug, as
-- every operator function is), the tick (service role) and later E4's agent all call. A reader
-- takes or renews the lease when it is free, expired or already its own, and is told who holds it
-- otherwise; ttl 0 lets go of its own. THE WRITE is `control_source_commit` (the browser, through
-- the operator's door `control_data_patch_by_slug`, so every value guard stays) or
-- `control_source_tick_commit` (service role only, through `control_data_apply` with the label
-- 'sheet'). Both check the claim and the write under one row lock: an answer that arrives after
-- the lease moved, after Disconnect (the path is no longer bound) or after Pause writes nothing
-- and cannot replace the new owner's snapshot or status (sheet AC-5). A path the row does not
-- bind yet is left out and keeps its snapshot, so it is written once it is bound.
--
-- THE TICK reads `control_data_tick_due` (published, unpaused Sheet sources with no live lease,
-- oldest read first) and records each authenticated run in `control_data_ticks` (start, wall-clock
-- duration, the sources it read) through `control_data_tick_record`, which keeps seven days. Its
-- switch is the `data_tick_until` system setting (api/_lib/systemSettings.ts): no column, no row
-- here, so it ships off. `data_tick_on()` restates the switch's rule for the sources line, which
-- must say when closed-page reading is off; the tick itself reads the switch in TypeScript.
--
-- Additive and live-safe: a column with a constant default, two new tables, new functions, and
-- `control_data_apply` widened by one label. Revert: drop the five functions, `data_tick_on`, the
-- two tables and the column, and restore 0071's `control_data_apply`.

set lock_timeout = '2s';
set statement_timeout = '30s';

-- ── 1. The sources on the row ──────────────────────────────────────────────────────────────────
alter table public.control_shows
  add column if not exists sources jsonb not null default '[]'::jsonb;

-- ── 2. A published source's read state ─────────────────────────────────────────────────────────
create table if not exists public.control_source_reads (
  show_id     uuid not null references public.control_shows (id) on delete cascade,
  source_id   text not null,
  owner       text,
  claim       text,
  lease_until timestamptz not null default '-infinity',
  snapshot    jsonb not null default '{}'::jsonb,
  content     text,
  status      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (show_id, source_id)
);
alter table public.control_source_reads enable row level security;   -- no policy: functions only
revoke all on table public.control_source_reads from public, anon, authenticated;
grant select, insert, update, delete on table public.control_source_reads to service_role;

-- ── 3. The tick's run record ───────────────────────────────────────────────────────────────────
create table if not exists public.control_data_ticks (
  id          bigint generated always as identity primary key,
  started_at  timestamptz not null,
  duration_ms integer not null,
  sources     jsonb not null default '[]'::jsonb
);
alter table public.control_data_ticks enable row level security;
revoke all on table public.control_data_ticks from public, anon, authenticated;
grant select, insert, delete on table public.control_data_ticks to service_role;

-- ── 4. The switch, as the sources line needs it ────────────────────────────────────────────────
-- api/_lib/systemSettings.ts `dataTickOnAt` is the tick's rule; this is the same rule: on only
-- while `until` lies ahead and at most 48 hours ahead, off on anything unreadable.
create or replace function public.data_tick_on()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_until timestamptz;
begin
  select (s.value->>'until')::timestamptz into v_until
    from public.system_settings s where s.key = 'data_tick_until';
  return coalesce(v_until > now() and v_until <= now() + interval '48 hours', false);
exception when others then
  return false;
end $$;
revoke execute on function public.data_tick_on() from public, anon, authenticated;
grant execute on function public.data_tick_on() to service_role;

-- ── 5. The label 'sheet': 0071's body, one word wider ──────────────────────────────────────────
create or replace function public.control_data_apply(p_show uuid, p_patch jsonb, p_src text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_owner_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_bindings jsonb;
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
  select s.owner_id, s.data, s.bindings
    into v_owner_id, v_before, v_bindings
    from public.control_shows s
    where s.id = p_show
    for no key update;
  if v_owner_id is null then raise exception 'unknown production'; end if;
  if public.feature_denied_for(v_owner_id, 'control.hosted') then
    raise exception 'hosted control is switched off for this page' using errcode = '42501';
  end if;

  v_after := public.jsonb_merge_patch(coalesce(v_before, '{}'::jsonb), p_patch);

  select coalesce(jsonb_object_agg(g.graphic, g.fields), '{}'::jsonb), count(*)
    into v_changes, v_pending
  from (
    select a.graphic, jsonb_object_agg(a.field, a.value) as fields
    from public.production_data_resolve(v_after, v_bindings) a
    left join public.production_data_resolve(v_before, v_bindings) b
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

  if v_after is distinct from v_before then
    update public.control_shows s set data = v_after where s.id = p_show;
  end if;

  for v_graphic, v_changed in select key, value from jsonb_each(v_changes) loop
    insert into public.control_events (show_id, graphic, msg)
      values (p_show, v_graphic, jsonb_build_object('t', 'update', 'data', v_changed, 'src', p_src))
      returning public.control_events.id into v_id;
    v_writes := v_writes || jsonb_build_object('graphic', v_graphic, 'event', v_id, 'applied', v_changed);
  end loop;

  return jsonb_build_object('data', v_after, 'writes', v_writes);
end $$;

-- ── 6. The lease: one function for every reader ────────────────────────────────────────────────
-- Answers {ok: true, claim, handed, snapshot, content, status, tick} when the caller holds the
-- lease now (`handed`: a new claim, so the caller starts from the snapshot it is handed), or
-- {ok: false, owner, status, tick} while another reader holds it, or {ok: false, gone: true} when
-- the row no longer lists the source. `tick` says whether closed-page reading is on.
create or replace function public.control_source_lease(p_slug text, p_source text, p_owner text, p_claim text, p_ttl_ms integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
  v_sources jsonb;
  v_read public.control_source_reads%rowtype;
  v_mine boolean;
  v_claim text;
begin
  select s.id, s.sources into v_show, v_sources
    from public.control_shows s where s.slug = p_slug and p_slug is not null;
  if v_show is null then raise exception 'unknown control slug'; end if;
  if p_owner is null or p_owner !~ '^[A-Za-z0-9:_-]{1,64}$' then raise exception 'not a reader'; end if;
  if p_source is null or not exists (
       select 1 from jsonb_array_elements(case jsonb_typeof(v_sources) when 'array' then v_sources else '[]'::jsonb end) e
        where e.value->>'id' = p_source) then
    return jsonb_build_object('ok', false, 'gone', true);
  end if;

  insert into public.control_source_reads (show_id, source_id) values (v_show, p_source)
    on conflict (show_id, source_id) do nothing;
  select * into v_read from public.control_source_reads r
    where r.show_id = v_show and r.source_id = p_source for update;

  if v_read.owner is distinct from p_owner and v_read.lease_until > now() then
    return jsonb_build_object('ok', false, 'owner', v_read.owner, 'status', v_read.status, 'tick', public.data_tick_on());
  end if;
  if coalesce(p_ttl_ms, 0) <= 0 then
    if v_read.owner = p_owner then
      update public.control_source_reads r set lease_until = now(), updated_at = now()
        where r.show_id = v_show and r.source_id = p_source;
    end if;
    return jsonb_build_object('ok', false, 'released', true);
  end if;

  v_mine := v_read.owner = p_owner and v_read.claim = p_claim and v_read.lease_until > now();
  v_claim := case when v_mine then v_read.claim
                  else p_owner || ':' || translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/', '-_') end;
  update public.control_source_reads r
     set owner = p_owner, claim = v_claim,
         lease_until = now() + make_interval(secs => least(p_ttl_ms, 60000) / 1000.0), updated_at = now()
   where r.show_id = v_show and r.source_id = p_source;
  return jsonb_build_object('ok', true, 'claim', v_claim, 'handed', not v_mine, 'snapshot', v_read.snapshot,
                            'content', v_read.content, 'status', v_read.status, 'tick', public.data_tick_on());
end $$;
revoke execute on function public.control_source_lease(text, text, text, text, integer) from public;
grant execute on function public.control_source_lease(text, text, text, text, integer) to anon, authenticated, service_role;

-- ── 7. The write under the lease ───────────────────────────────────────────────────────────────
-- p_writes: connected path -> the text it now holds (only what changed). p_state: {snapshot,
-- content, status} as the reader would keep them. Answers {ok: true, data (the tree, or null when
-- nothing was written), skipped (paths the row does not bind)} or {ok: false, moved | paused}.
create or replace function public.control_source_settle(p_show uuid, p_slug text, p_source text, p_claim text,
                                                        p_writes jsonb, p_state jsonb, p_src text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_read public.control_source_reads%rowtype;
  v_entry jsonb;
  v_bindings jsonb;
  v_bound text[];
  v_path text;
  v_value jsonb;
  v_one jsonb;
  v_seg text[];
  v_i int;
  v_patch jsonb := '{}'::jsonb;
  v_skipped text[] := '{}';
  v_snapshot jsonb;
  v_result jsonb;
begin
  if p_writes is null or jsonb_typeof(p_writes) <> 'object' or p_state is null or jsonb_typeof(p_state) <> 'object'
     or jsonb_typeof(coalesce(p_state->'snapshot', '{}'::jsonb)) <> 'object' then
    raise exception 'not a source write';
  end if;
  if octet_length(p_writes::text) + octet_length(p_state::text) > 262144 then
    raise exception 'source write too large';
  end if;
  select * into v_read from public.control_source_reads r
    where r.show_id = p_show and r.source_id = p_source for update;
  if v_read.claim is null or v_read.claim is distinct from p_claim or v_read.lease_until <= now() then
    return jsonb_build_object('ok', false, 'moved', true);
  end if;
  select e.value, s.bindings into v_entry, v_bindings
    from public.control_shows s
    cross join lateral jsonb_array_elements(case jsonb_typeof(s.sources) when 'array' then s.sources else '[]'::jsonb end) e
   where s.id = p_show and e.value->>'id' = p_source;
  if v_entry is null then return jsonb_build_object('ok', false, 'moved', true); end if;
  if coalesce((v_entry->>'paused')::boolean, false) and p_writes <> '{}'::jsonb then
    return jsonb_build_object('ok', false, 'paused', true);
  end if;

  select coalesce(array_agg(distinct f.value), '{}') into v_bound
  from jsonb_each(coalesce(v_bindings, '{}'::jsonb)) g
  cross join lateral jsonb_each_text(case when jsonb_typeof(g.value) = 'object' then g.value else '{}'::jsonb end) f;

  for v_path, v_value in select w.key, w.value from jsonb_each(p_writes) w loop
    if jsonb_typeof(v_value) <> 'string' then raise exception 'not a source write'; end if;
    if not (v_path = any(v_bound)) then
      v_skipped := v_skipped || v_path;
      continue;
    end if;
    v_seg := string_to_array(v_path, '.');
    v_one := v_value;
    for v_i in reverse coalesce(array_length(v_seg, 1), 0) .. 1 loop
      v_one := jsonb_build_object(v_seg[v_i], v_one);
    end loop;
    v_patch := public.jsonb_merge_patch(v_patch, v_one);
  end loop;

  if v_patch <> '{}'::jsonb then
    v_result := case when p_src = 'operator' then public.control_data_patch_by_slug(p_slug, v_patch)
                     else public.control_data_apply(p_show, v_patch, p_src) end;
  end if;

  -- A path left out keeps what the snapshot held for it, so it is written once it is bound.
  v_snapshot := coalesce(p_state->'snapshot', '{}'::jsonb);
  foreach v_path in array v_skipped loop
    v_snapshot := case when v_read.snapshot ? v_path then jsonb_set(v_snapshot, array[v_path], v_read.snapshot->v_path)
                       else v_snapshot - v_path end;
  end loop;
  update public.control_source_reads r
     set snapshot = v_snapshot, content = p_state->>'content',
         status = coalesce(p_state->'status', '{}'::jsonb), updated_at = now()
   where r.show_id = p_show and r.source_id = p_source;
  return jsonb_build_object('ok', true, 'data', v_result->'data', 'skipped', to_jsonb(v_skipped));
end $$;
revoke execute on function public.control_source_settle(uuid, text, text, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.control_source_settle(uuid, text, text, text, jsonb, jsonb, text) to service_role;

-- A browser reader's write: the control slug is the authorization, and the values go through the
-- operator's door with all its guards.
create or replace function public.control_source_commit(p_slug text, p_source text, p_claim text, p_writes jsonb, p_state jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
begin
  select s.id into v_show from public.control_shows s where s.slug = p_slug and p_slug is not null;
  if v_show is null then raise exception 'unknown control slug'; end if;
  return public.control_source_settle(v_show, p_slug, p_source, p_claim, p_writes, p_state, 'operator');
end $$;
revoke execute on function public.control_source_commit(text, text, text, jsonb, jsonb) from public;
grant execute on function public.control_source_commit(text, text, text, jsonb, jsonb) to anon, authenticated, service_role;

-- The tick's write: service role only, labelled 'sheet'.
create or replace function public.control_source_tick_commit(p_slug text, p_source text, p_claim text, p_writes jsonb, p_state jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
begin
  select s.id into v_show from public.control_shows s where s.slug = p_slug and p_slug is not null;
  if v_show is null then raise exception 'unknown control slug'; end if;
  return public.control_source_settle(v_show, p_slug, p_source, p_claim, p_writes, p_state, 'sheet');
end $$;
revoke execute on function public.control_source_tick_commit(text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.control_source_tick_commit(text, text, text, jsonb, jsonb) to service_role;

-- ── 8. What the tick reads, and its record ─────────────────────────────────────────────────────
-- Published, unpaused Sheet sources whose lease is free, the least recently read first, each with
-- its production's bindings and each graphic's published fields (never the panel's code).
create or replace function public.control_data_tick_due(p_limit integer)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(d.item order by d.read_at nulls first), '[]'::jsonb)
  from (
    select jsonb_build_object(
             'slug', s.slug,
             'source', e.value,
             'bindings', coalesce(s.bindings, '{}'::jsonb),
             'fields', (select coalesce(jsonb_object_agg(g.value->>'name', coalesce(g.value->'fields', '[]'::jsonb)), '{}'::jsonb)
                          from jsonb_array_elements(case jsonb_typeof(s.panel) when 'array' then s.panel else '[]'::jsonb end) g
                         where g.value->>'name' is not null)) as item,
           r.updated_at as read_at
      from public.control_shows s
      cross join lateral jsonb_array_elements(case jsonb_typeof(s.sources) when 'array' then s.sources else '[]'::jsonb end) e
      left join public.control_source_reads r on r.show_id = s.id and r.source_id = e.value->>'id'
     where s.slug is not null
       and s.sources <> '[]'::jsonb
       and e.value->>'kind' = 'sheet'
       and e.value->>'id' is not null
       and coalesce((e.value->>'paused')::boolean, false) = false
       and (r.lease_until is null or r.lease_until <= now())
       and not public.feature_denied_for(s.owner_id, 'control.hosted')
     order by r.updated_at nulls first
     limit greatest(least(coalesce(p_limit, 0), 200), 0)
  ) d;
$$;
revoke execute on function public.control_data_tick_due(integer) from public, anon, authenticated;
grant execute on function public.control_data_tick_due(integer) to service_role;

create or replace function public.control_data_tick_record(p_started timestamptz, p_duration_ms integer, p_sources jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.control_data_ticks (started_at, duration_ms, sources)
    values (p_started, greatest(coalesce(p_duration_ms, 0), 0),
            case jsonb_typeof(p_sources) when 'array' then p_sources else '[]'::jsonb end);
  delete from public.control_data_ticks t where t.started_at < now() - interval '7 days';
end $$;
revoke execute on function public.control_data_tick_record(timestamptz, integer, jsonb) from public, anon, authenticated;
grant execute on function public.control_data_tick_record(timestamptz, integer, jsonb) to service_role;

-- ── 9. Self-check ──────────────────────────────────────────────────────────────────────────────
-- supabase/AGENTS.md: a self-check proves shape, so CALL the thing. The behavioural half runs in a
-- block that is always rolled back.
do $$
declare
  v_user uuid := gen_random_uuid();
  v_show uuid := '00000000-0097-4000-8000-000000000097';
  v_slug text;
  v_a jsonb;
  v_b jsonb;
  v_got jsonb;
  v_n int;
begin
  -- (a) Shape: who may call what.
  if not has_function_privilege('anon', 'public.control_source_lease(text,text,text,text,integer)', 'execute')
     or not has_function_privilege('anon', 'public.control_source_commit(text,text,text,jsonb,jsonb)', 'execute') then
    raise exception '0097 self-check failed: a browser reader cannot reach the lease or its write';
  end if;
  if has_function_privilege('anon', 'public.control_source_tick_commit(text,text,text,jsonb,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.control_source_tick_commit(text,text,text,jsonb,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.control_source_settle(uuid,text,text,text,jsonb,jsonb,text)', 'execute')
     or has_function_privilege('authenticated', 'public.control_source_settle(uuid,text,text,text,jsonb,jsonb,text)', 'execute')
     or has_function_privilege('anon', 'public.control_data_tick_due(integer)', 'execute')
     or has_function_privilege('authenticated', 'public.control_data_tick_due(integer)', 'execute')
     or has_function_privilege('anon', 'public.control_data_tick_record(timestamptz,integer,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.control_data_tick_record(timestamptz,integer,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.data_tick_on()', 'execute')
     or has_function_privilege('authenticated', 'public.data_tick_on()', 'execute') then
    raise exception '0097 self-check failed: a server-only function is reachable from a client';
  end if;
  if exists (select 1 from information_schema.role_table_grants g
              where g.table_schema = 'public' and g.table_name in ('control_source_reads', 'control_data_ticks')
                and g.grantee in ('anon', 'authenticated', 'PUBLIC')) then
    raise exception '0097 self-check failed: a client role holds a privilege on the read state or the tick record';
  end if;
  if not has_function_privilege('service_role', 'public.control_data_apply(uuid,jsonb,text)', 'execute')
     or has_function_privilege('anon', 'public.control_data_apply(uuid,jsonb,text)', 'execute') then
    raise exception '0097 self-check failed: control_data_apply lost or gained a grant';
  end if;

  -- (b) Behaviour, always rolled back.
  begin
    begin
      insert into auth.users (id, instance_id, aud, role, email)
      values (v_user, '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', '0097-self-check@noacg.invalid');
    exception when others then
      raise notice '0097 self-check: no throwaway account could be made (%), skipping the behavioural half', sqlerrm;
      return;
    end;
    if public.feature_denied_for(v_user, 'control.hosted') then
      raise notice '0097 self-check: hosted control is switched off on this instance, skipping the behavioural half';
      raise exception '0097 self-check passed';
    end if;

    insert into public.control_shows (id, owner_id, title, data, bindings, sources)
      values (v_show, v_user, '0097 self-check', '{}'::jsonb,
              '{"News":{"f0":"sheet.s1.lines"}}'::jsonb,
              '[{"id":"s1","kind":"sheet","label":"News","config":{"sheetId":"x","gid":null,"shape":"lines"}}]'::jsonb)
      returning slug into v_slug;

    -- The switch ships off, and reads off far ahead and once passed.
    if public.data_tick_on() then raise exception '0097 self-check failed: the tick switch reads on with no setting'; end if;
    insert into public.system_settings (key, value) values ('data_tick_until', jsonb_build_object('until', now() + interval '49 hours'))
      on conflict (key) do update set value = excluded.value;
    if public.data_tick_on() then raise exception '0097 self-check failed: the switch reads on more than 48 hours ahead'; end if;
    update public.system_settings set value = jsonb_build_object('until', now() - interval '1 second') where key = 'data_tick_until';
    if public.data_tick_on() then raise exception '0097 self-check failed: the switch reads on after its expiry'; end if;
    update public.system_settings set value = '"garbage"'::jsonb where key = 'data_tick_until';
    if public.data_tick_on() then raise exception '0097 self-check failed: the switch reads on from garbage'; end if;
    update public.system_settings set value = jsonb_build_object('until', now() + interval '1 hour') where key = 'data_tick_until';
    if not public.data_tick_on() then raise exception '0097 self-check failed: the switch reads off inside its window'; end if;

    -- A unknown source is gone; the first reader takes the lease, a second is told who holds it.
    if (public.control_source_lease(v_slug, 'nope', 'tab-a', null, 15000)->>'gone')::boolean is not true then
      raise exception '0097 self-check failed: an unlisted source was leased';
    end if;
    v_a := public.control_source_lease(v_slug, 's1', 'tab-a', null, 15000);
    if (v_a->>'ok')::boolean is not true or (v_a->>'handed')::boolean is not true then
      raise exception '0097 self-check failed: a free source was not leased (%)', v_a;
    end if;
    v_b := public.control_source_lease(v_slug, 's1', 'tick', null, 30000);
    if (v_b->>'ok')::boolean or v_b->>'owner' <> 'tab-a' then
      raise exception '0097 self-check failed: a live lease was taken over (%)', v_b;
    end if;
    if exists (select 1 from jsonb_array_elements(public.control_data_tick_due(50)) d where d->>'slug' = v_slug) then
      raise exception '0097 self-check failed: the tick is offered a leased source';
    end if;
    -- Renewing keeps the claim.
    if public.control_source_lease(v_slug, 's1', 'tab-a', v_a->>'claim', 15000)->>'claim' <> v_a->>'claim' then
      raise exception '0097 self-check failed: a renewal changed the claim';
    end if;

    -- A write under the claim lands once, labelled as the operator's.
    v_got := public.control_source_commit(v_slug, 's1', v_a->>'claim', '{"sheet.s1.lines":"One"}'::jsonb,
                                          '{"snapshot":{"sheet.s1.lines":"One"},"content":"c1","status":{"state":"ok"}}'::jsonb);
    if (v_got->>'ok')::boolean is not true or v_got #>> '{data,sheet,s1,lines}' <> 'One' then
      raise exception '0097 self-check failed: a write under the lease did not land (%)', v_got;
    end if;
    select count(*) into v_n from public.control_events e
      where e.show_id = v_show and e.graphic = 'News' and e.msg #>> '{data,f0}' = 'One' and e.msg->>'src' = 'operator';
    if v_n <> 1 then raise exception '0097 self-check failed: the write made % update rows', v_n; end if;

    -- An unbound path is left out and keeps its snapshot.
    v_got := public.control_source_commit(v_slug, 's1', v_a->>'claim', '{"sheet.s1.values.x":"7"}'::jsonb,
                                          '{"snapshot":{"sheet.s1.lines":"One","sheet.s1.values.x":"7"},"content":"c2","status":{}}'::jsonb);
    if v_got->'skipped' <> '["sheet.s1.values.x"]'::jsonb
       or (select r.snapshot from public.control_source_reads r where r.show_id = v_show) <> '{"sheet.s1.lines":"One"}'::jsonb then
      raise exception '0097 self-check failed: an unbound path was written or remembered (%)', v_got;
    end if;

    -- The lease lapses; the tick takes it with the snapshot, and the old owner's late answer
    -- writes nothing and keeps the tick's state.
    update public.control_source_reads set lease_until = now() - interval '1 second' where show_id = v_show;
    if not exists (select 1 from jsonb_array_elements(public.control_data_tick_due(50)) d where d->>'slug' = v_slug) then
      raise exception '0097 self-check failed: the tick is not offered an expired source';
    end if;
    v_b := public.control_source_lease(v_slug, 's1', 'tick', null, 30000);
    if (v_b->>'ok')::boolean is not true or v_b->'snapshot' <> '{"sheet.s1.lines":"One"}'::jsonb then
      raise exception '0097 self-check failed: the tick did not take the expired lease with its snapshot (%)', v_b;
    end if;
    v_got := public.control_source_tick_commit(v_slug, 's1', v_b->>'claim', '{"sheet.s1.lines":"Two"}'::jsonb,
                                               '{"snapshot":{"sheet.s1.lines":"Two"},"content":"c3","status":{"state":"ok"}}'::jsonb);
    if (v_got->>'ok')::boolean is not true or not exists (select 1 from public.control_events e
         where e.show_id = v_show and e.msg #>> '{data,f0}' = 'Two' and e.msg->>'src' = 'sheet') then
      raise exception '0097 self-check failed: the tick write did not land as sheet (%)', v_got;
    end if;
    v_got := public.control_source_commit(v_slug, 's1', v_a->>'claim', '{"sheet.s1.lines":"Stale"}'::jsonb,
                                          '{"snapshot":{"sheet.s1.lines":"Stale"},"content":"old","status":{"state":"failing"}}'::jsonb);
    if (v_got->>'moved')::boolean is not true
       or (select s.data #>> '{sheet,s1,lines}' from public.control_shows s where s.id = v_show) <> 'Two'
       or (select r.content from public.control_source_reads r where r.show_id = v_show) <> 'c3' then
      raise exception '0097 self-check failed: a late answer after a handover wrote (%)', v_got;
    end if;

    -- Paused on the row: no write lands and the tick is offered nothing.
    update public.control_shows set sources = jsonb_set(sources, '{0,paused}', 'true') where id = v_show;
    v_got := public.control_source_tick_commit(v_slug, 's1', v_b->>'claim', '{"sheet.s1.lines":"Three"}'::jsonb, '{"snapshot":{}}'::jsonb);
    if (v_got->>'paused')::boolean is not true then
      raise exception '0097 self-check failed: a paused source was written (%)', v_got;
    end if;
    update public.control_source_reads set lease_until = now() - interval '1 second' where show_id = v_show;
    if exists (select 1 from jsonb_array_elements(public.control_data_tick_due(50)) d where d->>'slug' = v_slug) then
      raise exception '0097 self-check failed: the tick is offered a paused source';
    end if;

    -- Letting go: ttl 0 frees the caller's own lease only.
    update public.control_shows set sources = jsonb_set(sources, '{0,paused}', 'false') where id = v_show;
    v_a := public.control_source_lease(v_slug, 's1', 'tab-a', null, 15000);
    perform public.control_source_lease(v_slug, 's1', 'tick', null, 0);
    if (select r.lease_until from public.control_source_reads r where r.show_id = v_show) <= now() then
      raise exception '0097 self-check failed: another reader let go of the lease';
    end if;
    perform public.control_source_lease(v_slug, 's1', 'tab-a', null, 0);
    if (select r.lease_until from public.control_source_reads r where r.show_id = v_show) > now() then
      raise exception '0097 self-check failed: the owner could not let go';
    end if;

    perform public.control_data_tick_record(now(), 1234, '[{"source":"s1","outcome":"read"}]'::jsonb);
    if not exists (select 1 from public.control_data_ticks t where t.duration_ms = 1234) then
      raise exception '0097 self-check failed: a tick run was not recorded';
    end if;

    raise exception '0097 self-check passed';
  exception when others then
    if sqlerrm <> '0097 self-check passed' then raise; end if;
  end;
end $$;
