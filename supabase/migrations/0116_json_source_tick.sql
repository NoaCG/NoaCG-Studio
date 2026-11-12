-- live-path: control_data_tick_due also lists connector sources NoaCG reads, once due; control_source_registration_refusal refuses an agent such a source (same signatures, same grants)
--
-- A PUBLIC JSON ADDRESS READ BY NOACG (docs/work-specs/obs-scenes/spec.md, OS5a; AC-9, rules R10,
-- R12). A connector source (`kind: 'external'`, `config.v` 1) whose registration carries
-- `read: { everyMs }` is read by NoaCG itself: by the production page holding its lease, and by
-- the server tick when no page does (api/_lib/dataTick.ts, src/control/jsonSource.ts).
--
-- 1. `control_data_tick_due` is 0099's, with one more kind listed: such a source, only once it is
--    due, so a source waiting out its interval never takes one of the tick's places from a Sheet or
--    a feed. Due: its row has no good read yet (`status.checkedAt` is not a number), or that read is
--    at least its interval less 15 s old (the tick runs once a minute; the interval is clamped to
--    10 s at least and an hour at most, as the reader clamps it). A good read stamped more than a
--    minute ahead of the database's clock counts as never read. Each listed JSON source carries the
--    production's collection recipes, so its line can say their cards are not filled.
-- 2. `control_source_registration_refusal` is 0101's, with one more refusal: an agent's claim or
--    report for a source NoaCG reads (its `config.read.everyMs` is a number, the test the tick's
--    list and the page's reader use too) is refused `read_by_noacg`, so NoaCG's read and an agent's never
--    take turns on one source (R12). Removing `read` gives the source back to its agent.
--
-- Additive and live-safe: two function bodies widened, signatures and grants unchanged. Nothing
-- lists or refuses differently for a source without `read`. Revert: restore 0099's
-- `control_data_tick_due` and 0101's `control_source_registration_refusal`.

set lock_timeout = '2s';
set statement_timeout = '30s';

-- ── 1. The tick lists a due JSON source ───────────────────────────────────────────────────────
create or replace function public.control_data_tick_due(p_limit integer)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(d.item order by d.read_at nulls first), '[]'::jsonb)
  from (
    select jsonb_build_object(
             'slug', s.slug,
             'source', e.value,
             'bindings', coalesce(s.bindings, '{}'::jsonb),
             -- A JSON source says when a collection recipe reads it (its cards are an agent's only).
             'collections', case when e.value->>'kind' = 'external' then coalesce(s.collections, '[]'::jsonb) end,
             'fields', (select coalesce(jsonb_object_agg(g.value->>'name', coalesce(g.value->'fields', '[]'::jsonb)), '{}'::jsonb)
                          from jsonb_array_elements(case jsonb_typeof(s.panel) when 'array' then s.panel else '[]'::jsonb end) g
                         where g.value->>'name' is not null)) as item,
           r.updated_at as read_at
      from public.control_shows s
      cross join lateral jsonb_array_elements(case jsonb_typeof(s.sources) when 'array' then s.sources else '[]'::jsonb end) e
      left join public.control_source_reads r on r.show_id = s.id and r.source_id = e.value->>'id'
     where s.slug is not null
       and s.sources <> '[]'::jsonb
       and (e.value->>'kind' in ('sheet', 'feed')
            or (e.value->>'kind' = 'external'
                and (e.value->'config'->'v') = '1'::jsonb
                and jsonb_typeof(e.value->'config'->'read'->'everyMs') = 'number'
                -- A checkedAt more than a minute ahead of this clock (a page whose clock runs fast
                -- wrote it) reads as never read, so a skewed page cannot park the source.
                and case when jsonb_typeof(r.status->'checkedAt') = 'number'
                              and (r.status->>'checkedAt')::numeric <= extract(epoch from now()) * 1000 + 60000
                         then (r.status->>'checkedAt')::numeric
                              + least(greatest((e.value->'config'->'read'->>'everyMs')::numeric, 10000), 3600000) - 15000
                              <= extract(epoch from now()) * 1000
                         else true end))
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

-- ── 2. An agent is refused a source NoaCG reads ──────────────────────────────────────────────
-- 0101's rules, with `read_by_noacg` before the config revision is compared. The same rules as
-- src/control/externalSource.ts `readExternalRegistration`, which keeps `read` (the review and
-- NoaCG's reader read the registration); this one refuses the agent.
create or replace function public.control_source_registration_refusal(p_entry jsonb, p_config_revision integer)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_entry is null or p_entry->>'kind' is distinct from 'external' then 'gone'
    when jsonb_typeof(p_entry->'config') is distinct from 'object' then 'unsupported'
    when (p_entry->'config'->'v') is distinct from '1'::jsonb then 'unsupported'
    -- One path segment: `external.e1.` must never also be the start of another source's paths.
    when coalesce(p_entry->>'id', '') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then 'registration'
    when (p_entry->'config') ? 'mode' or (p_entry->'config') ? 'caFile' then 'local_refused'
    when jsonb_typeof(p_entry->'config'->'endpoint') is distinct from 'string'
         or (p_entry->'config' ? 'lists' and (jsonb_typeof(p_entry->'config'->'lists') is distinct from 'object'
             or exists (select 1 from jsonb_each(p_entry->'config'->'lists') l
                         where l.key !~ '^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$'
                            or l.value not in ('"lines"'::jsonb, '"schedule"'::jsonb, '"credits"'::jsonb)))) then 'registration'
    -- NoaCG reads it itself (obs-scenes OS5a, R12): never an agent at the same time.
    -- The same test as the tick's list and the page's reader: an interval that is a number.
    when jsonb_typeof(p_entry->'config'->'read'->'everyMs') = 'number' then 'read_by_noacg'
    when jsonb_typeof(p_entry->'config'->'configRevision') is distinct from 'number'
         or (p_entry->'config'->'configRevision') is distinct from to_jsonb(p_config_revision) then 'config'
    else null
  end;
$$;
revoke execute on function public.control_source_registration_refusal(jsonb, integer) from public, anon, authenticated;
grant execute on function public.control_source_registration_refusal(jsonb, integer) to service_role;

-- ── 3. Self-check ──────────────────────────────────────────────────────────────────────────────
-- supabase/AGENTS.md: a self-check proves shape, so CALL the thing. The behavioural half runs in a
-- block that is always rolled back.
do $$
declare
  v_user uuid := gen_random_uuid();
  v_show uuid := '00000000-0116-4000-8000-000000000116';
  v_now numeric := extract(epoch from now()) * 1000;
  v_due jsonb;
  v_read jsonb := '{"id":"j1","kind":"external","label":"Scores","config":{"v":1,"configRevision":1,"endpoint":"https://example.com/s.json","read":{"everyMs":60000}}}';
begin
  -- (a) Shape: the grants are as before.
  if has_function_privilege('anon', 'public.control_data_tick_due(integer)', 'execute')
     or has_function_privilege('authenticated', 'public.control_data_tick_due(integer)', 'execute')
     or not has_function_privilege('service_role', 'public.control_data_tick_due(integer)', 'execute') then
    raise exception '0116 self-check failed: control_data_tick_due gained or lost a grant';
  end if;
  if has_function_privilege('anon', 'public.control_source_registration_refusal(jsonb,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.control_source_registration_refusal(jsonb,integer)', 'execute')
     or not has_function_privilege('service_role', 'public.control_source_registration_refusal(jsonb,integer)', 'execute') then
    raise exception '0116 self-check failed: control_source_registration_refusal gained or lost a grant';
  end if;

  -- (b) The refusal: a source NoaCG reads is refused to an agent; one without `read` is as before.
  if public.control_source_registration_refusal(v_read, 1) is distinct from 'read_by_noacg' then
    raise exception '0116 self-check failed: an agent may claim a source NoaCG reads';
  end if;
  if public.control_source_registration_refusal(jsonb_set(v_read, '{config,read}', '{}'::jsonb), 1) is not null
     or public.control_source_registration_refusal(jsonb_set(v_read, '{config,read}', '{"everyMs":"30000"}'::jsonb), 1) is not null then
    raise exception '0116 self-check failed: an agent is refused a source no reader of NoaCG reads';
  end if;
  if public.control_source_registration_refusal(v_read #- '{config,read}', 1) is not null
     or public.control_source_registration_refusal(v_read #- '{config,read}', 2) is distinct from 'config' then
    raise exception '0116 self-check failed: a connector without read is refused differently';
  end if;

  -- (c) The tick's list, always rolled back.
  begin
    begin
      insert into auth.users (id, instance_id, aud, role, email)
      values (v_user, '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', '0116-self-check@noacg.invalid');
    exception when others then
      raise notice '0116 self-check: no throwaway account could be made (%), skipping the tick half', sqlerrm;
      raise exception '0116 self-check passed';
    end;
    if public.feature_denied_for(v_user, 'control.hosted') then
      raise notice '0116 self-check: hosted control is switched off on this instance, skipping the tick half';
      raise exception '0116 self-check passed';
    end if;
    insert into public.control_shows (id, owner_id, title, data, bindings, sources)
      values (v_show, v_user, '0116 self-check', '{}'::jsonb,
              '{"Board":{"f0":"external.j1.home","f1":"external.a1.home","f2":"feed.f1.lines"}}'::jsonb,
              jsonb_build_array(v_read,
                '{"id":"a1","kind":"external","label":"Agent","config":{"v":1,"configRevision":1,"endpoint":"https://example.com/a.json"}}'::jsonb,
                '{"id":"f1","kind":"feed","label":"News","config":{"url":"https://example.com/feed.xml"}}'::jsonb));
    -- Never read: due. A connector its agent reads is never listed; a feed still is.
    v_due := public.control_data_tick_due(200);
    if not exists (select 1 from jsonb_array_elements(v_due) d where d.value->'source'->>'id' = 'j1') then
      raise exception '0116 self-check failed: the tick does not list a JSON source never read';
    end if;
    if exists (select 1 from jsonb_array_elements(v_due) d where d.value->'source'->>'id' = 'a1') then
      raise exception '0116 self-check failed: the tick lists a connector its agent reads';
    end if;
    if not exists (select 1 from jsonb_array_elements(v_due) d where d.value->'source'->>'id' = 'f1') then
      raise exception '0116 self-check failed: the tick no longer lists a feed';
    end if;
    -- Read 30 s ago with a 60 s interval: not due. Read 50 s ago: due (within 15 s of it).
    insert into public.control_source_reads (show_id, source_id, status)
      values (v_show, 'j1', jsonb_build_object('state', 'ok', 'checkedAt', v_now - 30000));
    if exists (select 1 from jsonb_array_elements(public.control_data_tick_due(200)) d where d.value->'source'->>'id' = 'j1') then
      raise exception '0116 self-check failed: the tick lists a JSON source before its interval';
    end if;
    update public.control_source_reads set status = jsonb_build_object('state', 'ok', 'checkedAt', v_now - 50000)
      where show_id = v_show and source_id = 'j1';
    if not exists (select 1 from jsonb_array_elements(public.control_data_tick_due(200)) d where d.value->'source'->>'id' = 'j1') then
      raise exception '0116 self-check failed: the tick does not list a JSON source once due';
    end if;
    -- A status that is not a number, or stamped an hour ahead, reads as never read; a paused source
    -- is never listed.
    update public.control_source_reads set status = '{"checkedAt":"soon"}'::jsonb where show_id = v_show and source_id = 'j1';
    if not exists (select 1 from jsonb_array_elements(public.control_data_tick_due(200)) d where d.value->'source'->>'id' = 'j1') then
      raise exception '0116 self-check failed: an unreadable status hides a JSON source';
    end if;
    update public.control_source_reads set status = jsonb_build_object('state', 'ok', 'checkedAt', v_now + 3600000)
      where show_id = v_show and source_id = 'j1';
    if not exists (select 1 from jsonb_array_elements(public.control_data_tick_due(200)) d where d.value->'source'->>'id' = 'j1') then
      raise exception '0116 self-check failed: a page clock an hour fast parks a JSON source';
    end if;
    update public.control_shows set sources = jsonb_build_array(v_read || '{"paused":true}'::jsonb) where id = v_show;
    if exists (select 1 from jsonb_array_elements(public.control_data_tick_due(200)) d where d.value->'source'->>'id' = 'j1') then
      raise exception '0116 self-check failed: the tick lists a paused JSON source';
    end if;

    raise exception '0116 self-check passed';
  exception when others then
    if sqlerrm <> '0116 self-check passed' then raise; end if;
  end;
end $$;
