-- live-path: a before trigger on control_shows for publish-shaped and source writes only, inert until the production_copies switch is on
--
-- OLD PAGES ONLY PLAY OUT (docs/work-specs/live-publishing/designs/G1.md section 4; spec W2, S2).
--
-- From live-publishing phase 4 the production's own copy of each graphic is the only truth. A page
-- loaded from an earlier bundle still copies library designs into a production when it publishes.
-- Once the switch below is on, such a page's production-authoring writes are refused with "Reload
-- this page to edit", and its Takes, reports, heartbeats, data writes and a data source's Pause
-- or Resume keep working.
--
-- How a write says which build sent it: the app built for copy truth adds the header
-- `x-noacg-production-copies: 1` to its REST API requests; older bundles send none. A header cannot
-- be echoed back from stored data, and PostgREST hands it to the database as `request.headers`.
--
-- The guard refuses a write when all of these hold: the switch is on; the statement comes from an
-- API request (`request.headers` is set; a migration's self-check sets claims but no headers);
-- the request's JWT role is `authenticated`; and the request carries no mark. It acts on:
--   documents          a row of kind `show`: insert, update of body or deleted, delete (a delete of
--                      a row that is already a tombstone passes: the purge is one statement across
--                      every kind, and removing a tombstone is not authoring);
--   team_productions   insert, update of doc, delete (a whole team's delete cascades here too);
--   control_shows      insert, delete, and an update naming output, panel, title, profile,
--                      bindings, sources or collections, unless the only change is a source's
--                      `paused` member (Pause and Resume are live controls).
-- Every other write passes untouched, and so does every server-side writer (service role).
--
-- The switch is a system_settings row, key `production_copies`, value {"on": true}. Installing this
-- file changes nothing; turning the switch on is a separate step, taken only after the app that sends
-- the mark is live and `production_copies_state()` has reported the mark on production (G1 section
-- 6). Back out: delete the row or set "on" to false, instantly, no deploy.
--
-- Additive: new functions and triggers, no column, signature, grant or policy of an existing object
-- changes. Revert: drop the three triggers and the four functions.

set lock_timeout = '2s';
set statement_timeout = '30s';

-- Whether the switch is on. Definer, because system_settings has RLS on and is the service role's.
create or replace function public.production_copies_on()
returns boolean
language sql security definer set search_path = '' stable as $$
  select coalesce((select (s.value->>'on')::boolean from public.system_settings s where s.key = 'production_copies'), false);
$$;
revoke all on function public.production_copies_on() from public, anon, authenticated;

-- Whether the calling API request carries the mark.
create or replace function public.production_copies_marked()
returns boolean
language plpgsql set search_path = '' stable as $$
declare
  v_headers text := nullif(current_setting('request.headers', true), '');
begin
  if v_headers is null then return false; end if;
  return coalesce(v_headers::jsonb->>'x-noacg-production-copies', '') = '1';
exception when others then
  return false;
end $$;
revoke all on function public.production_copies_marked() from public, anon, authenticated;

-- What a page and the rollout read: does this request carry the mark, and is the switch on. Two
-- booleans and nothing else. Recorded in supabase/advisor-baseline.json as a meant definer grant.
create or replace function public.production_copies_state()
returns jsonb
language sql security definer set search_path = '' stable as $$
  select jsonb_build_object('mark', public.production_copies_marked(), 'on', public.production_copies_on());
$$;
revoke all on function public.production_copies_state() from public, anon, authenticated;
-- Signed-in pages only: the rollout check and adoption run signed in.
grant execute on function public.production_copies_state() to authenticated;

-- A sources list with every source's `paused` member taken out: what Connect and Disconnect change
-- and Pause and Resume do not.
create or replace function public.production_sources_unpaused(p_sources jsonb)
returns jsonb
language sql set search_path = '' immutable as $$
  select case
    when p_sources is null or jsonb_typeof(p_sources) <> 'array' then p_sources
    else (select coalesce(jsonb_agg(case when jsonb_typeof(e) = 'object' then e - 'paused' else e end order by n), '[]'::jsonb)
            from jsonb_array_elements(p_sources) with ordinality as t(e, n))
  end;
$$;
revoke all on function public.production_sources_unpaused(jsonb) from public, anon, authenticated;

create or replace function public.production_authoring_guard()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row    record := case when tg_op = 'DELETE' then old else new end;
  v_claims jsonb;
begin
  -- Not an API request (a migration, a cron job, a definer called by the server): never refused.
  if nullif(current_setting('request.headers', true), '') is null then return v_row; end if;
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    v_claims := null;
  end;
  if coalesce(v_claims->>'role', '') <> 'authenticated' then return v_row; end if;
  if public.production_copies_marked() then return v_row; end if;

  if tg_table_name = 'documents' then
    if tg_op = 'DELETE' then
      if old.kind <> 'show' or old.deleted then return old; end if;
    elsif new.kind <> 'show' and (tg_op = 'INSERT' or old.kind <> 'show') then
      return new;
    end if;
  elsif tg_table_name = 'control_shows' and tg_op = 'UPDATE' then
    if new.output is not distinct from old.output
       and new.panel is not distinct from old.panel
       and new.title is not distinct from old.title
       and new.profile is not distinct from old.profile
       and new.bindings is not distinct from old.bindings
       and new.collections is not distinct from old.collections
       and public.production_sources_unpaused(new.sources) is not distinct from public.production_sources_unpaused(old.sources) then
      return new; -- a source's Pause or Resume, or nothing at all
    end if;
  end if;

  -- The switch is read last, so a write that passes for any other reason never reads it.
  if not public.production_copies_on() then return v_row; end if;
  raise exception 'Reload this page to edit' using errcode = 'P0001',
    hint = 'This page was opened before an update. Takes still work; reload it to edit the production.';
end $$;
revoke all on function public.production_authoring_guard() from public, anon, authenticated;

create trigger documents_production_authoring_guard
  before insert or update of body, deleted or delete on public.documents
  for each row execute function public.production_authoring_guard();

create trigger team_productions_production_authoring_guard
  before insert or update of doc or delete on public.team_productions
  for each row execute function public.production_authoring_guard();

create trigger control_shows_production_authoring_guard
  before insert or delete or update of output, panel, title, profile, bindings, sources, collections on public.control_shows
  for each row execute function public.production_authoring_guard();

-- Self-check: CALL it (supabase/AGENTS.md). Each route as a signed-in API request without the mark
-- is refused with the switch on and passes with the switch off; with the mark, as service role, and
-- outside an API request it passes; a Pause passes and a Connect does not; other kinds and a
-- heartbeat pass. All undone by a sentinel the block catches, which also removes the switch row and
-- the request settings. Skipped on an instance with no account yet (0036's shape).
do $$
declare
  v_owner  uuid;
  v_show   uuid := '00000000-0115-4000-8000-000000000001';
  v_look   uuid := '00000000-0115-4000-8000-000000000002';
  v_kept   jsonb;
  v_failed boolean;
  v_signed text;
  v_bare   text := '{"accept":"application/json"}';
  v_marked text := '{"accept":"application/json","x-noacg-production-copies":"1"}';
begin
  select id into v_owner from auth.users limit 1;
  if v_owner is null then
    raise notice '0115 self-check skipped: no account on this instance';
    return;
  end if;
  v_signed := jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text;
  begin
    -- The state function answers off and unmarked outside a request.
    if public.production_copies_state() <> '{"mark": false, "on": false}'::jsonb then
      raise exception '0115: production_copies_state answered % outside a request', public.production_copies_state();
    end if;

    -- Switch off: an unmarked signed-in write passes.
    perform set_config('request.headers', v_bare, true);
    perform set_config('request.jwt.claims', v_signed, true);
    insert into public.documents (id, user_id, kind, body) values (v_show, v_owner, 'show', '{"updatedAt":"2026-11-12T00:00:00.000Z"}');
    insert into public.control_shows (id, owner_id, title, output, sources)
    values (v_show, v_owner, '0115 self-check', '{"v":1}', '[{"id":"s1","kind":"feed","label":"x","config":{"url":"u"}}]');

    insert into public.system_settings (key, value) values ('production_copies', '{"on": true}')
    on conflict (key) do update set value = excluded.value;

    -- Switch on, unmarked: each authoring route is refused with the words.
    v_failed := false;
    begin
      update public.documents set body = '{"updatedAt":"2026-11-12T00:00:01.000Z"}' where id = v_show;
    exception when raise_exception then
      if sqlerrm <> 'Reload this page to edit' then raise; end if;
      v_failed := true;
    end;
    if not v_failed then raise exception '0115: an unmarked production save passed with the switch on'; end if;

    v_failed := false;
    begin
      update public.control_shows set output = '{"v":2}' where id = v_show;
    exception when raise_exception then
      if sqlerrm <> 'Reload this page to edit' then raise; end if;
      v_failed := true;
    end;
    if not v_failed then raise exception '0115: an unmarked publish passed with the switch on'; end if;

    v_failed := false;
    begin
      update public.control_shows set sources = '[{"id":"s1","kind":"feed","label":"y","config":{"url":"u"}}]' where id = v_show;
    exception when raise_exception then
      if sqlerrm <> 'Reload this page to edit' then raise; end if;
      v_failed := true;
    end;
    if not v_failed then raise exception '0115: an unmarked Connect passed with the switch on'; end if;

    -- A Pause, a heartbeat and another kind pass.
    update public.control_shows set sources = '[{"id":"s1","kind":"feed","label":"x","config":{"url":"u"},"paused":true}]' where id = v_show;
    update public.control_shows set output_seen_at = now() where id = v_show;
    insert into public.documents (id, user_id, kind, body) values (v_look, v_owner, 'look', '{}');
    select s.sources into v_kept from public.control_shows s where s.id = v_show;
    if v_kept->0->>'paused' is distinct from 'true' then raise exception '0115: a Pause did not land: %', v_kept; end if;

    -- With the mark, it passes.
    perform set_config('request.headers', v_marked, true);
    if public.production_copies_state() <> '{"mark": true, "on": true}'::jsonb then
      raise exception '0115: production_copies_state answered % for a marked request', public.production_copies_state();
    end if;
    update public.documents set body = '{"updatedAt":"2026-11-12T00:00:02.000Z"}' where id = v_show;
    update public.control_shows set output = '{"v":3}' where id = v_show;

    -- As the service role, unmarked, it passes; and outside an API request too.
    perform set_config('request.headers', v_bare, true);
    perform set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);
    update public.documents set body = '{"updatedAt":"2026-11-12T00:00:03.000Z"}' where id = v_show;
    perform set_config('request.jwt.claims', v_signed, true);
    perform set_config('request.headers', '', true);
    update public.documents set body = '{"updatedAt":"2026-11-12T00:00:04.000Z"}' where id = v_show;

    -- A tombstone's delete passes, unmarked and signed in.
    perform set_config('request.headers', v_bare, true);
    perform set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);
    update public.documents set deleted = true where id = v_show;
    perform set_config('request.jwt.claims', v_signed, true);
    delete from public.documents where id = v_show;

    raise exception '0115 self-check rollback';
  exception when raise_exception then
    if sqlerrm <> '0115 self-check rollback' then raise; end if;
  end;
  perform set_config('request.headers', '', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
