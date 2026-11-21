-- live-path: a before trigger on control_shows (control_shows_team_designs_guard) and its two control_ helpers; it refuses only an unmarked signed-in publish-shaped write of a production whose team record is split, so nothing changes while no record is split
--
-- THE TEAM RECORD WITHOUT ITS DESIGNS (docs/work-specs/live-publishing/designs/G5-team-record.md,
-- issue #2614).
--
-- A team production's record carried every graphic's full template, so every save sent and
-- rewrote megabytes (0.57 MB at 6 graphics, 5.12 MB at 60). Here each design is stored once per
-- production under a name the server computes from its content, and a SPLIT record names it with
-- `designRef` in place of `template`:
--
--   team_production_designs          (production, name) -> the design, added once, never changed
--   team_productions.doc_form        null: a whole record (every row before this); 1: split.
--                                    Set by a trigger from the content alone, on every write.
--   team_designs_put / _read         store designs and answer their names / read named designs
--   team_production_store            the compare-and-swap of team_production_save for a split
--                                    record (pages built for this, switch on)
--   team_designs_state               installed, whether the request carries the designs mark, the
--                                    switch
--   team_production_unsplit          service role only: a split record written back whole (revert)
--   control_shows_team_designs_guard an older page cannot publish, unpublish or delete a production
--                                    whose record is split
--
-- Pages built for this send the header `x-noacg-team-designs: 1` (the designs mark). An older page
-- is never handed a split record: a restrictive select policy raises "Reload this page to edit"
-- for an unmarked API request that would read one, and team_production_save and
-- team_production_patch refuse it the same way before answering.
--
-- The switch is a system_settings row, key `team_designs`, value {"on": true}; absent is off.
-- Turning it on in production is the owner's step (G5 section 7). While it is off nothing is split,
-- and the policy, the refusals and the guard never act.
--
-- Additive: one table, one nullable column with no default (no table rewrite), one restrictive
-- policy that passes every row while doc_form is null, two triggers, new functions, and the bodies
-- of team_production_save and team_production_patch (0117, 0119) and of #2615's
-- team_production_save_v2 and team_production_patch_v2 (0124) replaced with the same signatures and
-- answers plus the checks of G5 section 2. team_production_changes (0124) runs with the caller's
-- rights, so the read policy covers it as it covers a table read. No stored record is rewritten; a record is split only when a
-- page built for this next saves it with the switch on.
--
-- Revert (G5 section 7): switch off; as the service role, for each id of
-- `select id from public.team_productions where doc_form is not null`, run
-- `select public.team_production_unsplit(id)`; then a migration that raises while any doc_form is
-- set and drops the guard trigger and its functions, the policy, the form trigger, the new
-- functions and team_production_designs, keeps the column doc_form, and restores 0117's
-- team_production_save, 0119's team_production_patch and 0124's team_production_save_v2 and
-- team_production_patch_v2.

set lock_timeout = '2s';
set statement_timeout = '30s';

alter table public.team_productions add column if not exists doc_form smallint;

create table if not exists public.team_production_designs (
  production_id uuid not null references public.team_productions (id) on delete cascade,
  name          text not null,
  body          jsonb not null,
  bytes         int not null,
  created_at    timestamptz not null default now(),
  primary key (production_id, name)
);
alter table public.team_production_designs enable row level security;
revoke all on table public.team_production_designs from public, anon, authenticated;
grant select, insert, delete on table public.team_production_designs to service_role;

-- ── The switch and the mark ─────────────────────────────────────────────────────────────────────
create or replace function public.team_designs_on()
returns boolean
language sql security definer set search_path = '' stable as $$
  select coalesce((select (s.value->>'on')::boolean from public.system_settings s where s.key = 'team_designs'), false);
$$;
revoke all on function public.team_designs_on() from public, anon, authenticated;

-- Whether the calling API request carries the designs mark (0115's production_copies_marked shape).
create or replace function public.team_designs_marked()
returns boolean
language plpgsql set search_path = '' stable as $$
declare
  v_headers text := nullif(current_setting('request.headers', true), '');
begin
  if v_headers is null then return false; end if;
  return coalesce(v_headers::jsonb->>'x-noacg-team-designs', '') = '1';
exception when others then
  return false;
end $$;
revoke all on function public.team_designs_marked() from public, anon, authenticated;

-- What a page reads: installed, its own mark, the switch. Three booleans and nothing else.
create or replace function public.team_designs_state()
returns jsonb
language sql security definer set search_path = '' stable as $$
  select jsonb_build_object('installed', true, 'mark', public.team_designs_marked(), 'on', public.team_designs_on());
$$;
revoke all on function public.team_designs_state() from public, anon, authenticated;
grant execute on function public.team_designs_state() to authenticated;

-- The refusal an older page meets.
create or replace function public.team_designs_reload()
returns void
language plpgsql set search_path = '' immutable as $$
begin
  raise exception 'Reload this page to edit' using errcode = 'P0001',
    hint = 'This page was opened before an update. Takes still work; reload it to edit the production.';
end $$;
revoke all on function public.team_designs_reload() from public, anon, authenticated;

-- Whether a record names any design (its form, by content). A path query: it reads the record in
-- place, where extracting `graphics` would copy megabytes of a whole record on every save.
create or replace function public.team_doc_split(p_doc jsonb)
returns boolean
language sql set search_path = '' immutable as $$
  -- Strict, silent: no `graphics`, or one that is not an array, answers false rather than raising.
  select coalesce(jsonb_path_exists(p_doc, 'strict $.graphics[*] ? (exists(@.designRef))', '{}', true), false);
$$;
revoke all on function public.team_doc_split(jsonb) from public, anon, authenticated;

-- The design names a record carries that its production does not hold.
create or replace function public.team_designs_missing_in(p_id uuid, p_doc jsonb)
returns text[]
language sql security definer set search_path = '' stable as $$
  select coalesce(array_agg(distinct g->>'designRef'), '{}')
    from jsonb_array_elements(case when jsonb_typeof(p_doc->'graphics') = 'array' then p_doc->'graphics' else '[]'::jsonb end) g
   where jsonb_typeof(g) = 'object' and g ? 'designRef'
     and not exists (select 1 from public.team_production_designs d
                      where d.production_id = p_id and d.name = g->>'designRef');
$$;
revoke all on function public.team_designs_missing_in(uuid, jsonb) from public, anon, authenticated;

-- ── The form trigger: the one check of a split record's content (G5 section 2) ─────────────────
create or replace function public.team_productions_doc_form()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.team_doc_split(new.doc) then
    new.doc_form := null;
    return new;
  end if;
  if tg_op = 'INSERT' then
    raise exception 'a new team production must be saved whole' using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(new.doc->'graphics') g
              where jsonb_typeof(g) <> 'object' or jsonb_typeof(g->'designRef') is distinct from 'string' or g ? 'template') then
    raise exception 'a split team production names every design and carries none' using errcode = 'check_violation';
  end if;
  if cardinality(public.team_designs_missing_in(new.id, new.doc)) > 0 then
    raise exception 'a split team production names a design it does not hold' using errcode = 'check_violation';
  end if;
  new.doc_form := 1;
  return new;
end $$;
revoke all on function public.team_productions_doc_form() from public, anon, authenticated;

drop trigger if exists team_productions_doc_form on public.team_productions;
create trigger team_productions_doc_form
  before insert or update of doc, doc_form on public.team_productions
  for each row execute function public.team_productions_doc_form();

-- ── The read policy ─────────────────────────────────────────────────────────────────────────────
-- True for a marked request or a statement that is not an API request; false for a row of a team
-- the caller is not in (the permissive policy hides it anyway); otherwise the read is refused, so
-- an older page keeps what it shows instead of holding a record without its designs.
create or replace function public.team_record_readable(p_team uuid)
returns boolean
language plpgsql security definer set search_path = '' stable as $$
begin
  if nullif(current_setting('request.headers', true), '') is null then return true; end if;
  if public.team_designs_marked() then return true; end if;
  if not public.is_team_member(p_team) then return false; end if;
  perform public.team_designs_reload();
  return false;
end $$;
revoke all on function public.team_record_readable(uuid) from public, anon, authenticated;
-- A policy expression runs with the querying role's privileges (supabase/AGENTS.md).
grant execute on function public.team_record_readable(uuid) to authenticated;

drop policy if exists "team_productions_split_marked_select" on public.team_productions;
create policy "team_productions_split_marked_select" on public.team_productions
  as restrictive for select to authenticated
  using (doc_form is null or public.team_record_readable(team_id));

-- ── Designs ─────────────────────────────────────────────────────────────────────────────────────
-- The checks every team function opens with: signed in, not suspended, the production exists, the
-- caller is a member of its team.
create or replace function public.team_production_member(p_id uuid)
returns void
language plpgsql security definer set search_path = '' stable as $$
declare
  v_team uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'saving a team production needs a signed-in account' using errcode = '42501';
  end if;
  if public.is_suspended() then
    raise exception 'this account is suspended' using errcode = '42501';
  end if;
  select p.team_id into v_team from public.team_productions p where p.id = p_id;
  if v_team is null then
    raise exception 'unknown team production' using errcode = 'no_data_found';
  end if;
  if not public.is_team_member(v_team) then
    raise exception 'not a member of the team that holds this production' using errcode = '42501';
  end if;
end $$;
revoke all on function public.team_production_member(uuid) from public, anon, authenticated;

create or replace function public.team_designs_put(p_id uuid, p_bodies jsonb)
returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  v_names text[] := '{}';
  v_body  jsonb;
  v_text  text;
  v_name  text;
begin
  perform public.team_production_member(p_id);
  if jsonb_typeof(p_bodies) is distinct from 'array' then
    raise exception 'designs must be a list' using errcode = 'check_violation';
  end if;
  for v_body in select b from jsonb_array_elements(p_bodies) b loop
    if jsonb_typeof(v_body) is distinct from 'object' then
      raise exception 'a design must be a JSON object' using errcode = 'check_violation';
    end if;
    v_text := v_body::text;
    if octet_length(v_text) > 40000000 then
      raise exception 'this design is too large to save' using errcode = 'check_violation';
    end if;
    v_name := encode(extensions.digest(convert_to(v_text, 'UTF8'), 'sha256'), 'hex');
    insert into public.team_production_designs (production_id, name, body, bytes)
    values (p_id, v_name, v_body, octet_length(v_text))
    on conflict (production_id, name) do nothing;
    v_names := v_names || v_name;
  end loop;
  return v_names;
end $$;
revoke all on function public.team_designs_put(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.team_designs_put(uuid, jsonb) to authenticated;

create or replace function public.team_designs_read(p_id uuid, p_names text[])
returns jsonb
language plpgsql security definer set search_path = '' stable as $$
begin
  perform public.team_production_member(p_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object('name', d.name, 'body', d.body))
      from public.team_production_designs d
     where d.production_id = p_id and d.name = any(coalesce(p_names, '{}'))), '[]'::jsonb);
end $$;
revoke all on function public.team_designs_read(uuid, text[]) from public, anon, authenticated;
grant execute on function public.team_designs_read(uuid, text[]) to authenticated;

-- ── Saves ───────────────────────────────────────────────────────────────────────────────────────
-- A split record under the compare-and-swap of team_production_save (0054, 0117). Marked requests
-- only. Answers, in this order: off, the token (stale; the record is read with
-- team_production_changes, as #2615's saves do), missing, saved.
create or replace function public.team_production_store(p_id uuid, p_expected timestamptz, p_doc jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user    uuid := (select auth.uid());
  v_row     public.team_productions%rowtype;
  v_missing text[];
  v_stamp   timestamptz;
  v_rev     bigint;
begin
  if not public.team_designs_marked() then perform public.team_designs_reload(); end if;
  -- Asked here as well as in team_production_member: a write for the caller asks first (0088).
  if public.is_suspended() then
    raise exception 'this account is suspended' using errcode = '42501';
  end if;
  perform public.team_production_member(p_id);
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' then
    raise exception 'a team production document must be a JSON object' using errcode = 'check_violation';
  end if;
  select * into v_row from public.team_productions p where p.id = p_id for no key update;
  if not public.team_designs_on() then
    return jsonb_build_object('saved', false, 'off', true, 'updated_at', v_row.updated_at, 'updated_by', v_row.updated_by, 'rev', v_row.rev);
  end if;
  if p_expected is null or v_row.updated_at is distinct from p_expected then
    -- The token only (#2615): the page reads the record through team_production_changes.
    return jsonb_build_object('saved', false, 'updated_at', v_row.updated_at, 'updated_by', v_row.updated_by, 'rev', v_row.rev);
  end if;
  v_missing := public.team_designs_missing_in(p_id, p_doc);
  if cardinality(v_missing) > 0 then
    return jsonb_build_object('saved', false, 'missing', to_jsonb(v_missing), 'updated_at', v_row.updated_at,
                              'updated_by', v_row.updated_by, 'rev', v_row.rev);
  end if;
  -- The form trigger checks the record again and raises on mixed content: nothing is written then.
  update public.team_productions p
     set doc = p_doc,
         updated_by = v_user,
         updated_at = greatest(date_trunc('milliseconds', clock_timestamp()), p.updated_at + interval '1 millisecond')
   where p.id = p_id and p.updated_at = p_expected
   returning p.updated_at, p.rev into v_stamp, v_rev;
  return jsonb_build_object('saved', true, 'updated_at', v_stamp, 'updated_by', v_user, 'rev', v_rev);
end $$;
revoke all on function public.team_production_store(uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.team_production_store(uuid, timestamptz, jsonb) to authenticated;

-- 0117's team_production_save, for whole records only: the row locked first; an unmarked request on
-- a split row refused before any answer; a record naming a design refused. A marked whole save of a
-- split row makes it whole (the form trigger sets doc_form null). The refusal answer also carries
-- doc_form.
create or replace function public.team_production_save(p_id uuid, p_expected timestamptz, p_doc jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user  uuid := (select auth.uid());
  v_row   public.team_productions%rowtype;
  v_stamp timestamptz;
  v_rev   bigint;
begin
  if v_user is null then
    raise exception 'saving a team production needs a signed-in account' using errcode = '42501';
  end if;
  if public.is_suspended() then
    raise exception 'this account is suspended' using errcode = '42501';
  end if;
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' then
    raise exception 'a team production document must be a JSON object' using errcode = 'check_violation';
  end if;
  select * into v_row from public.team_productions p where p.id = p_id for no key update;
  if v_row.id is null then
    raise exception 'unknown team production' using errcode = 'no_data_found';
  end if;
  if not public.is_team_member(v_row.team_id) then
    raise exception 'not a member of the team that holds this production' using errcode = '42501';
  end if;
  if v_row.doc_form is not null and not public.team_designs_marked() then
    perform public.team_designs_reload();
  end if;
  if public.team_doc_split(p_doc) then
    raise exception 'team_production_save stores whole records only' using errcode = 'check_violation';
  end if;
  if p_expected is null or v_row.updated_at is distinct from p_expected then
    return jsonb_build_object(
      'saved', false,
      'updated_at', v_row.updated_at,
      'updated_by', v_row.updated_by,
      'doc', v_row.doc,
      'doc_form', v_row.doc_form,
      'rev', v_row.rev
    );
  end if;
  update public.team_productions p
     set doc = p_doc,
         updated_by = v_user,
         updated_at = greatest(date_trunc('milliseconds', clock_timestamp()),
                               p.updated_at + interval '1 millisecond')
   where p.id = p_id and p.updated_at = p_expected
   returning p.updated_at, p.rev into v_stamp, v_rev;
  return jsonb_build_object('saved', true, 'updated_at', v_stamp, 'updated_by', v_user, 'rev', v_rev);
end $$;
revoke all on function public.team_production_save(uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.team_production_save(uuid, timestamptz, jsonb) to authenticated;

-- 0119's team_production_patch: an unmarked request on a split row refused before any answer; a
-- patch never changes a record's form, and a result the form trigger refuses is `replaced`. It
-- reads no switch.
create or replace function public.team_production_patch(p_id uuid, p_expected timestamptz, p_ops jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user  uuid := (select auth.uid());
  v_row   public.team_productions%rowtype;
  v_new   jsonb;
  v_stamp timestamptz;
  v_rev   bigint;
  v_map   jsonb;
  v_replaced jsonb;
begin
  if v_user is null then
    raise exception 'saving a team production needs a signed-in account' using errcode = '42501';
  end if;
  if public.is_suspended() then
    raise exception 'this account is suspended' using errcode = '42501';
  end if;
  select * into v_row from public.team_productions p where p.id = p_id for no key update;
  if v_row.id is null then
    raise exception 'unknown team production' using errcode = 'no_data_found';
  end if;
  if not public.is_team_member(v_row.team_id) then
    raise exception 'not a member of the team that holds this production' using errcode = '42501';
  end if;
  if v_row.doc_form is not null and not public.team_designs_marked() then
    perform public.team_designs_reload();
  end if;
  if p_expected is null or v_row.updated_at is distinct from p_expected then
    return jsonb_build_object('saved', false, 'updated_at', v_row.updated_at, 'updated_by', v_row.updated_by, 'doc', v_row.doc,
                              'doc_form', v_row.doc_form, 'rev', v_row.rev);
  end if;
  v_replaced := jsonb_build_object('saved', false, 'replaced', true, 'updated_at', v_row.updated_at, 'updated_by', v_row.updated_by, 'rev', v_row.rev);
  begin
    v_new := public.unit_patch_apply(v_row.doc, p_ops);
  exception when raise_exception then
    if sqlerrm like 'unit patch refused%' then return v_replaced; end if;
    raise;
  end;
  if public.team_doc_split(v_new) is distinct from (v_row.doc_form is not null) then
    return v_replaced;
  end if;
  begin
    update public.team_productions p
       set doc = v_new,
           updated_by = v_user,
           updated_at = greatest(date_trunc('milliseconds', clock_timestamp()), p.updated_at + interval '1 millisecond')
     where p.id = p_id and p.updated_at = p_expected
     returning p.updated_at, p.rev into v_stamp, v_rev;
  exception when check_violation then
    return v_replaced;
  end;
  v_map := case when v_row.doc_units->>'f' = '1' and (v_row.doc_units->>'rev')::bigint = v_row.rev
                then public.unit_map_apply(v_row.doc_units, p_ops, v_new) || jsonb_build_object('rev', v_rev)
                end;
  update public.team_productions p set doc_units = v_map where p.id = p_id;
  return jsonb_build_object('saved', true, 'updated_at', v_stamp, 'updated_by', v_user, 'rev', v_rev, 'units', v_map is not null);
end $$;
revoke all on function public.team_production_patch(uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.team_production_patch(uuid, timestamptz, jsonb) to authenticated;

-- #2615's saves (0124), with the same checks as the two above: the row locked first; an unmarked
-- request on a split row refused before any answer; a whole save never writes a design reference;
-- a patch never changes a record's form. Their refusals carry the token only, as in 0124.
create or replace function public.team_production_save_v2(p_id uuid, p_expected timestamptz, p_doc jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user  uuid := (select auth.uid());
  v_team  uuid;
  v_at    timestamptz;
  v_by    uuid;
  v_rev   bigint;
  v_form  smallint;
  v_stamp timestamptz;
begin
  if v_user is null then
    raise exception 'saving a team production needs a signed-in account' using errcode = '42501';
  end if;
  if public.is_suspended() then
    raise exception 'this account is suspended' using errcode = '42501';
  end if;
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' then
    raise exception 'a team production document must be a JSON object' using errcode = 'check_violation';
  end if;
  select p.team_id, p.updated_at, p.updated_by, p.rev, p.doc_form into v_team, v_at, v_by, v_rev, v_form
    from public.team_productions p where p.id = p_id for no key update;
  if v_team is null then
    raise exception 'unknown team production' using errcode = 'no_data_found';
  end if;
  if not public.is_team_member(v_team) then
    raise exception 'not a member of the team that holds this production' using errcode = '42501';
  end if;
  if v_form is not null and not public.team_designs_marked() then
    perform public.team_designs_reload();
  end if;
  if public.team_doc_split(p_doc) then
    raise exception 'team_production_save_v2 stores whole records only' using errcode = 'check_violation';
  end if;
  if p_expected is null or v_at is distinct from p_expected then
    return jsonb_build_object('saved', false, 'updated_at', v_at, 'updated_by', v_by, 'rev', v_rev);
  end if;
  update public.team_productions p
     set doc = p_doc,
         updated_by = v_user,
         updated_at = greatest(date_trunc('milliseconds', clock_timestamp()),
                               p.updated_at + interval '1 millisecond')
   where p.id = p_id and p.updated_at = p_expected
   returning p.updated_at, p.rev into v_stamp, v_rev;
  return jsonb_build_object('saved', true, 'updated_at', v_stamp, 'updated_by', v_user, 'rev', v_rev);
end $$;
revoke all on function public.team_production_save_v2(uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.team_production_save_v2(uuid, timestamptz, jsonb) to authenticated;

create or replace function public.team_production_patch_v2(p_id uuid, p_expected timestamptz, p_ops jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user  uuid := (select auth.uid());
  v_team  uuid;
  v_at    timestamptz;
  v_by    uuid;
  v_rev   bigint;
  v_form  smallint;
  v_doc   jsonb;
  v_units jsonb;
  v_new   jsonb;
  v_stamp timestamptz;
  v_new_rev bigint;
  v_map   jsonb;
  v_replaced jsonb;
begin
  if v_user is null then
    raise exception 'saving a team production needs a signed-in account' using errcode = '42501';
  end if;
  if public.is_suspended() then
    raise exception 'this account is suspended' using errcode = '42501';
  end if;
  select p.team_id, p.updated_at, p.updated_by, p.rev, p.doc_form into v_team, v_at, v_by, v_rev, v_form
    from public.team_productions p where p.id = p_id for no key update;
  if v_team is null then
    raise exception 'unknown team production' using errcode = 'no_data_found';
  end if;
  if not public.is_team_member(v_team) then
    raise exception 'not a member of the team that holds this production' using errcode = '42501';
  end if;
  if v_form is not null and not public.team_designs_marked() then
    perform public.team_designs_reload();
  end if;
  if p_expected is null or v_at is distinct from p_expected then
    return jsonb_build_object('saved', false, 'updated_at', v_at, 'updated_by', v_by, 'rev', v_rev);
  end if;
  v_replaced := jsonb_build_object('saved', false, 'replaced', true, 'updated_at', v_at, 'updated_by', v_by, 'rev', v_rev);
  select p.doc, p.doc_units into v_doc, v_units from public.team_productions p where p.id = p_id;
  begin
    v_new := public.unit_patch_apply(v_doc, p_ops);
  exception when raise_exception then
    if sqlerrm like 'unit patch refused%' then return v_replaced; end if;
    raise;
  end;
  if public.team_doc_split(v_new) is distinct from (v_form is not null) then
    return v_replaced;
  end if;
  begin
    update public.team_productions p
       set doc = v_new,
           updated_by = v_user,
           updated_at = greatest(date_trunc('milliseconds', clock_timestamp()), p.updated_at + interval '1 millisecond')
     where p.id = p_id and p.updated_at = p_expected
     returning p.updated_at, p.rev into v_stamp, v_new_rev;
  exception when check_violation then
    return v_replaced;
  end;
  v_map := case when v_units->>'f' = '1' and (v_units->>'rev')::bigint = v_rev
                then public.unit_map_apply(v_units, p_ops, v_new) || jsonb_build_object('rev', v_new_rev)
                end;
  update public.team_productions p set doc_units = v_map where p.id = p_id;
  return jsonb_build_object('saved', true, 'updated_at', v_stamp, 'updated_by', v_user, 'rev', v_new_rev, 'units', v_map is not null);
end $$;
revoke all on function public.team_production_patch_v2(uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.team_production_patch_v2(uuid, timestamptz, jsonb) to authenticated;

-- The revert: a split record made whole from its designs, written like a save (the token and rev
-- advance). Service role only.
create or replace function public.team_production_unsplit(p_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.team_productions%rowtype;
  v_doc jsonb;
begin
  select * into v_row from public.team_productions p where p.id = p_id and p.doc_form is not null for no key update;
  if v_row.id is null then return false; end if;
  if cardinality(public.team_designs_missing_in(p_id, v_row.doc)) > 0 then
    raise exception 'team production % names a design it does not hold', p_id;
  end if;
  select v_row.doc || jsonb_build_object('graphics', coalesce(jsonb_agg(
           case when jsonb_typeof(g->'designRef') = 'string'
                then (g - 'designRef') || jsonb_build_object('template', d.body)
                else g end order by i), '[]'::jsonb))
    into v_doc
    from jsonb_array_elements(v_row.doc->'graphics') with ordinality t(g, i)
    left join public.team_production_designs d on d.production_id = p_id and d.name = g->>'designRef';
  update public.team_productions p
     set doc = v_doc,
         updated_at = greatest(date_trunc('milliseconds', clock_timestamp()), p.updated_at + interval '1 millisecond')
   where p.id = p_id;
  return true;
end $$;
revoke all on function public.team_production_unsplit(uuid) from public, anon, authenticated;
grant execute on function public.team_production_unsplit(uuid) to service_role;

-- ── The publish guard (live-path) ───────────────────────────────────────────────────────────────
create or replace function public.control_team_designs_marked()
returns boolean
language plpgsql set search_path = '' stable as $$
declare
  v_headers text := nullif(current_setting('request.headers', true), '');
begin
  if v_headers is null then return false; end if;
  return coalesce(v_headers::jsonb->>'x-noacg-team-designs', '') = '1';
exception when others then
  return false;
end $$;
revoke all on function public.control_team_designs_marked() from public, anon, authenticated;

create or replace function public.control_team_record_split(p_id uuid)
returns boolean
language sql security definer set search_path = '' stable as $$
  select coalesce((select t.doc_form is not null from public.team_productions t where t.id = p_id), false);
$$;
revoke all on function public.control_team_record_split(uuid) from public, anon, authenticated;

-- On the events and columns of 0115's control_shows trigger: an authenticated, unmarked API write
-- of a production whose team record is split is refused; a source's Pause or Resume passes.
create or replace function public.control_shows_team_designs_guard()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_id     uuid := case when tg_op = 'DELETE' then old.id else new.id end;
  v_claims jsonb;
begin
  -- Every pass returns the row it was given, never a copy: a copy of a 5 MB output costs a publish
  -- tens of milliseconds (#2616). A marked page leaves at the third test, before any comparison.
  if nullif(current_setting('request.headers', true), '') is not null then
    begin
      v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    exception when others then
      v_claims := null;
    end;
    if coalesce(v_claims->>'role', '') = 'authenticated'
       and not public.control_team_designs_marked()
       and public.control_team_record_split(v_id)
       and not (tg_op = 'UPDATE'
                and new.output is not distinct from old.output
                and new.panel is not distinct from old.panel
                and new.title is not distinct from old.title
                and new.profile is not distinct from old.profile
                and new.bindings is not distinct from old.bindings
                and new.collections is not distinct from old.collections
                and public.production_sources_unpaused(new.sources) is not distinct from public.production_sources_unpaused(old.sources)) then
      raise exception 'Reload this page to edit' using errcode = 'P0001',
        hint = 'This page was opened before an update. Takes still work; reload it to edit the production.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.control_shows_team_designs_guard() from public, anon, authenticated;

drop trigger if exists control_shows_team_designs_guard on public.control_shows;
create trigger control_shows_team_designs_guard
  before insert or delete or update of output, panel, title, profile, bindings, sources, collections on public.control_shows
  for each row execute function public.control_shows_team_designs_guard();

-- ── Self-check: CALL every route (supabase/AGENTS.md; G5 section 8) ─────────────────────────────
-- On a throwaway team and production as a signed-in member, with and without the mark, the switch
-- on and off; undone by a sentinel the block catches. Every simulated request also carries G1's
-- copies mark, so the 0115 guard stands aside whatever its switch says. Skipped with no account.
do $$
declare
  v_owner   uuid;
  v_role    text := current_role;
  v_team    uuid := '00000000-0126-4000-8000-000000000001';
  v_tp      uuid := '00000000-0126-4000-8000-000000000002';
  v_other   uuid := '00000000-0126-4000-8000-000000000003';
  v_signed  text;
  v_old     text := '{"accept":"application/json","x-noacg-production-copies":"1"}';
  v_new     text := '{"accept":"application/json","x-noacg-production-copies":"1","x-noacg-team-designs":"1"}';
  v_names   text[];
  v_got     jsonb;
  v_at      timestamptz;
  v_rev     bigint;
  v_err     text;
  v_err2    text;
  v_n       int;
  v_whole   jsonb;
  v_split   jsonb;
begin
  if has_table_privilege('anon', 'public.team_production_designs', 'SELECT')
     or has_table_privilege('authenticated', 'public.team_production_designs', 'SELECT')
     or has_table_privilege('authenticated', 'public.team_production_designs', 'INSERT')
     or has_table_privilege('authenticated', 'public.team_production_designs', 'UPDATE')
     or has_table_privilege('authenticated', 'public.team_production_designs', 'DELETE') then
    raise exception '0126: a client role holds a privilege on team_production_designs';
  end if;
  if has_function_privilege('anon', 'public.team_designs_put(uuid, jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.team_designs_put(uuid, jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.team_designs_read(uuid, text[])', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.team_production_store(uuid, timestamptz, jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.team_designs_state()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.team_record_readable(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.team_production_unsplit(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.team_designs_on()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.control_shows_team_designs_guard()', 'EXECUTE') then
    raise exception '0126: EXECUTE on a team designs function is wrong for a client role';
  end if;
  if public.team_designs_state() <> '{"installed": true, "mark": false, "on": false}'::jsonb then
    raise exception '0126: team_designs_state answered % outside a request', public.team_designs_state();
  end if;

  select id into v_owner from auth.users limit 1;
  if v_owner is null then
    raise notice '0126 self-check skipped: no account on this instance';
    return;
  end if;
  v_signed := jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text;
  v_whole := '{"name":"w","graphics":[{"id":"g1","template":{"html":"<p>a</p>"}},{"id":"g2","template":{"html":"<p>b</p>"}}],"cues":[]}';
  begin
    perform set_config('request.jwt.claims', v_signed, true);
    insert into public.teams (id, name, owner_id) values (v_team, '0126 self-check', v_owner);
    insert into public.team_members (team_id, user_id, display_name, role) values (v_team, v_owner, 'self-check', 'owner') on conflict do nothing;
    if public.is_suspended() then raise exception 'self-check-done'; end if;

    -- An insert naming a design: refused. A client doc_form: recomputed.
    v_err := null;
    begin
      insert into public.team_productions (id, team_id, doc, updated_by) values (v_other, v_team, '{"graphics":[{"id":"g1","designRef":"x"}]}', v_owner);
    exception when check_violation then v_err := sqlerrm;
    end;
    if v_err is null then raise exception '0126: an insert naming a design was stored'; end if;
    insert into public.team_productions (id, team_id, doc, updated_by, doc_form) values (v_tp, v_team, v_whole, v_owner, 1);
    if (select p.doc_form from public.team_productions p where p.id = v_tp) is not null then
      raise exception '0126: an insert kept a client doc_form';
    end if;

    -- Designs: server names, one row per body, read answers only stored names.
    v_names := public.team_designs_put(v_tp, '[{"html":"<p>a</p>"},{"html":"<p>b</p>"},{"html":"<p>a</p>"}]');
    if cardinality(v_names) <> 3 or v_names[1] <> v_names[3] or v_names[1] = v_names[2]
       or v_names[1] <> encode(extensions.digest(convert_to('{"html": "<p>a</p>"}', 'UTF8'), 'sha256'), 'hex') then
      raise exception '0126: team_designs_put answered %', v_names;
    end if;
    if (select count(*) from public.team_production_designs d where d.production_id = v_tp) <> 2 then
      raise exception '0126: a body put twice was stored twice';
    end if;
    if jsonb_array_length(public.team_designs_read(v_tp, array[v_names[1], 'nope'])) <> 1 then
      raise exception '0126: team_designs_read answered a name not stored';
    end if;
    v_split := jsonb_build_object('name', 's', 'cues', '[]'::jsonb, 'graphics', jsonb_build_array(
      jsonb_build_object('id', 'g1', 'designRef', v_names[1]), jsonb_build_object('id', 'g2', 'designRef', v_names[2])));

    -- Store: unmarked refused; switch off answers off.
    select p.updated_at into v_at from public.team_productions p where p.id = v_tp;
    perform set_config('request.headers', v_old, true);
    v_err := null;
    begin
      perform public.team_production_store(v_tp, v_at, v_split);
    exception when raise_exception then v_err := sqlerrm;
    end;
    if v_err is distinct from 'Reload this page to edit' then raise exception '0126: an unmarked store answered %', v_err; end if;
    perform set_config('request.headers', v_new, true);
    if public.team_designs_state() <> '{"installed": true, "mark": true, "on": false}'::jsonb then
      raise exception '0126: team_designs_state answered % for a marked request', public.team_designs_state();
    end if;
    v_got := public.team_production_store(v_tp, v_at, v_split);
    if v_got->>'off' is distinct from 'true' then raise exception '0126: a store with the switch off answered %', v_got; end if;
    insert into public.system_settings (key, value) values ('team_designs', '{"on": true}')
    on conflict (key) do update set value = excluded.value;
    -- Stale token: the token only (#2615), nothing written. Unknown name: missing, nothing written.
    v_got := public.team_production_store(v_tp, v_at - interval '1 second', v_split);
    if v_got->>'saved' <> 'false' or v_got ? 'doc' or v_got ? 'missing' or v_got->>'updated_at' is null then raise exception '0126: a stale store answered %', v_got; end if;
    v_got := public.team_production_store(v_tp, v_at, jsonb_set(v_split, '{graphics,1,designRef}', '"nope"'));
    if v_got->'missing' <> '["nope"]'::jsonb then raise exception '0126: a store naming an unknown design answered %', v_got; end if;
    -- Mixed content: raises, nothing written.
    v_err := null;
    begin
      perform public.team_production_store(v_tp, v_at, jsonb_set(v_split, '{graphics,1}', '{"id":"g2","template":{}}'));
    exception when check_violation then v_err := sqlerrm;
    end;
    if v_err is null then raise exception '0126: a mixed record was stored'; end if;
    -- On its token: written, split, token and rev advance.
    select p.rev into v_rev from public.team_productions p where p.id = v_tp;
    v_got := public.team_production_store(v_tp, v_at, v_split);
    if v_got->>'saved' <> 'true' or (v_got->>'rev')::bigint <= v_rev or (v_got->>'updated_at')::timestamptz <= v_at
       or (select p.doc_form from public.team_productions p where p.id = v_tp) is distinct from 1::smallint then
      raise exception '0126: a store on its token answered %', v_got;
    end if;
    v_at := (v_got->>'updated_at')::timestamptz;

    -- The form trigger directly: a split doc naming an unknown design, or with a template, refused.
    v_err := null;
    begin
      update public.team_productions set doc = jsonb_set(v_split, '{graphics,0,designRef}', '"nope"') where id = v_tp;
    exception when check_violation then v_err := sqlerrm;
    end;
    if v_err is null then raise exception '0126: the form trigger let an unknown design through'; end if;

    -- Save: unmarked on split refused before answering; a record naming a design refused.
    perform set_config('request.headers', v_old, true);
    v_err := null;
    begin
      perform public.team_production_save(v_tp, v_at - interval '1 second', v_whole);
    exception when raise_exception then v_err := sqlerrm;
    end;
    if v_err is distinct from 'Reload this page to edit' then raise exception '0126: an unmarked save of a split record answered %', v_err; end if;
    perform set_config('request.headers', v_new, true);
    v_err := null;
    begin
      perform public.team_production_save(v_tp, v_at, v_split);
    exception when check_violation then v_err := sqlerrm;
    end;
    if v_err is null then raise exception '0126: team_production_save stored a split record'; end if;

    -- Patch: unmarked on split refused; a result changing form, or naming an unknown design, replaced.
    perform set_config('request.headers', v_old, true);
    v_err := null;
    begin
      perform public.team_production_patch(v_tp, v_at, '[{"m":"name","set":"p","u":"u"}]');
    exception when raise_exception then v_err := sqlerrm;
    end;
    if v_err is distinct from 'Reload this page to edit' then raise exception '0126: an unmarked patch of a split record answered %', v_err; end if;
    perform set_config('request.headers', v_new, true);
    v_got := public.team_production_patch(v_tp, v_at, jsonb_build_array(jsonb_build_object('m', 'graphics', 'set', v_whole->'graphics', 'u', 'u')));
    if v_got->>'replaced' is distinct from 'true' then raise exception '0126: a patch turning a split record whole answered %', v_got; end if;
    v_got := public.team_production_patch(v_tp, v_at, '[{"m":"graphics","by":"id","put":[{"v":{"id":"g2","designRef":"nope"},"d":"d"}],"del":[],"len":2}]');
    if v_got->>'replaced' is distinct from 'true' then raise exception '0126: a patch naming an unknown design answered %', v_got; end if;
    v_got := public.team_production_patch(v_tp, v_at, '[{"m":"graphics","by":"id","put":[{"v":{"id":"g2","template":{}},"d":"d"}],"del":[],"len":2}]');
    if v_got->>'replaced' is distinct from 'true' then raise exception '0126: a patch putting a template in a split record answered %', v_got; end if;
    v_got := public.team_production_patch(v_tp, v_at, '[{"m":"name","set":"p","u":"u"}]');
    if v_got->>'saved' <> 'true' or (select p.doc->>'name' from public.team_productions p where p.id = v_tp) <> 'p' then
      raise exception '0126: a patch of a split record on its token answered %', v_got;
    end if;
    v_at := (v_got->>'updated_at')::timestamptz;
    -- #2615's saves (0124): the same refusals and checks.
    perform set_config('request.headers', v_old, true);
    v_err := null;
    begin
      perform public.team_production_save_v2(v_tp, v_at - interval '1 second', v_whole);
    exception when raise_exception then v_err := sqlerrm;
    end;
    if v_err is distinct from 'Reload this page to edit' then raise exception '0126: an unmarked save_v2 of a split record answered %', v_err; end if;
    v_err := null;
    begin
      perform public.team_production_patch_v2(v_tp, v_at, '[{"m":"name","set":"p","u":"u"}]');
    exception when raise_exception then v_err := sqlerrm;
    end;
    if v_err is distinct from 'Reload this page to edit' then raise exception '0126: an unmarked patch_v2 of a split record answered %', v_err; end if;
    perform set_config('request.headers', v_new, true);
    v_err := null;
    begin
      perform public.team_production_save_v2(v_tp, v_at, v_split);
    exception when check_violation then v_err := sqlerrm;
    end;
    if v_err is null then raise exception '0126: team_production_save_v2 stored a split record'; end if;
    v_got := public.team_production_patch_v2(v_tp, v_at, jsonb_build_array(jsonb_build_object('m', 'graphics', 'set', v_whole->'graphics', 'u', 'u')));
    if v_got->>'replaced' is distinct from 'true' then raise exception '0126: a patch_v2 turning a split record whole answered %', v_got; end if;
    v_got := public.team_production_patch_v2(v_tp, v_at, '[{"m":"graphics","by":"id","put":[{"v":{"id":"g2","designRef":"nope"},"d":"d"}],"del":[],"len":2}]');
    if v_got->>'replaced' is distinct from 'true' then raise exception '0126: a patch_v2 naming an unknown design answered %', v_got; end if;
    v_got := public.team_production_patch_v2(v_tp, v_at - interval '1 second', '[]');
    if v_got->>'saved' <> 'false' or v_got ? 'doc' then raise exception '0126: a stale patch_v2 answered %', v_got; end if;
    v_got := public.team_production_patch_v2(v_tp, v_at, '[{"m":"name","set":"p2","u":"u"}]');
    if v_got->>'saved' <> 'true' or (select p.doc_form from public.team_productions p where p.id = v_tp) is distinct from 1::smallint then
      raise exception '0126: a patch_v2 of a split record on its token answered %', v_got;
    end if;
    v_at := (v_got->>'updated_at')::timestamptz;
    select p.rev into v_rev from public.team_productions p where p.id = v_tp;
    if not public.team_production_units_set(v_tp, v_rev, '{"m":{"name":"n"}}') then
      raise exception '0126: the map of a split record was not kept at its revision';
    end if;

    -- The select policy, as the authenticated role: unmarked refused on a split row; marked reads.
    set local role authenticated;
    perform set_config('request.headers', v_old, true);
    v_err := null;
    begin
      perform 1 from public.team_productions p where p.team_id = v_team;
    exception when raise_exception then v_err := sqlerrm;
    end;
    v_err2 := null;
    begin
      perform public.team_production_changes(v_tp, null);
    exception when raise_exception then v_err2 := sqlerrm;
    end;
    perform set_config('request.headers', v_new, true);
    select count(*) into v_n from public.team_productions p where p.team_id = v_team;
    v_got := public.team_production_changes(v_tp, null);
    execute format('set local role %I', v_role);
    if v_err2 is distinct from 'Reload this page to edit' then raise exception '0126: an unmarked read of changes of a split record answered %', coalesce(v_err2, 'ops'); end if;
    if not (v_got->'ops' @> '[{"m":"graphics"}]') or (v_got->'ops')::text like '%"template"%' then
      raise exception '0126: a marked read of changes answered %', v_got;
    end if;
    if v_err is distinct from 'Reload this page to edit' then raise exception '0126: an unmarked read of a split record answered %', coalesce(v_err, 'rows'); end if;
    if v_n <> 1 then raise exception '0126: a marked read of a split record saw % rows', v_n; end if;

    -- The publish guard: unmarked publish refused; a Pause, a heartbeat and a marked publish pass.
    insert into public.control_shows (id, owner_id, team_id, title, output, sources)
    values (v_tp, v_owner, v_team, '0126 self-check', '{"v":1}', '[{"id":"s1","kind":"feed","label":"x","config":{"url":"u"}}]');
    perform set_config('request.headers', v_old, true);
    v_err := null;
    begin
      update public.control_shows set output = '{"v":2}' where id = v_tp;
    exception when raise_exception then v_err := sqlerrm;
    end;
    if v_err is distinct from 'Reload this page to edit' then raise exception '0126: an unmarked publish of a split production answered %', v_err; end if;
    v_err := null;
    begin
      delete from public.control_shows where id = v_tp;
    exception when raise_exception then v_err := sqlerrm;
    end;
    if v_err is distinct from 'Reload this page to edit' then raise exception '0126: an unmarked unpublish of a split production answered %', v_err; end if;
    update public.control_shows set sources = '[{"id":"s1","kind":"feed","label":"x","config":{"url":"u"},"paused":true}]' where id = v_tp;
    update public.control_shows set output_seen_at = now() where id = v_tp;
    perform set_config('request.headers', v_new, true);
    update public.control_shows set output = '{"v":3}' where id = v_tp;

    -- Switch off: a marked whole save makes the record whole.
    update public.system_settings set value = '{"on": false}' where key = 'team_designs';
    v_got := public.team_production_save(v_tp, v_at, v_whole);
    if v_got->>'saved' <> 'true' or (select p.doc_form from public.team_productions p where p.id = v_tp) is not null then
      raise exception '0126: a marked whole save of a split record answered %', v_got;
    end if;

    -- Unsplit: split again with the switch on, then made whole by the revert function.
    update public.system_settings set value = '{"on": true}' where key = 'team_designs';
    v_at := (v_got->>'updated_at')::timestamptz;
    v_got := public.team_production_store(v_tp, v_at, v_split);
    if v_got->>'saved' <> 'true' then raise exception '0126: a second store answered %', v_got; end if;
    v_at := (v_got->>'updated_at')::timestamptz;
    -- Called first, on its own: the sub-selects below may be planned before the call.
    if not public.team_production_unsplit(v_tp) then
      raise exception '0126: unsplit found no split record';
    end if;
    if (select p.doc_form from public.team_productions p where p.id = v_tp) is not null
       or (select p.doc->'graphics'->1->'template'->>'html' from public.team_productions p where p.id = v_tp) <> '<p>b</p>'
       or (select p.updated_at from public.team_productions p where p.id = v_tp) <= v_at then
      raise exception '0126: unsplit did not make the record whole with a new token';
    end if;

    -- A suspended member: refused by the new functions.
    perform set_config('request.headers', '', true);
    insert into public.user_accounts (user_id, state) values (v_owner, 'suspended')
    on conflict (user_id) do update set state = 'suspended';
    v_err := null;
    begin
      perform public.team_designs_put(v_tp, '[{"x":1}]');
    exception when insufficient_privilege then v_err := sqlerrm;
    end;
    if v_err is distinct from 'this account is suspended' then raise exception '0126: a suspended account put a design (%)', v_err; end if;

    raise exception 'self-check-done';
  exception when others then
    execute format('set local role %I', v_role);
    if sqlerrm <> 'self-check-done' then raise; end if;
  end;
end $$;
