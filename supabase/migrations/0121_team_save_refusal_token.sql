-- A REFUSED TEAM SAVE ANSWERS WITH ITS TOKEN, AND THE PAGE READS ONLY WHAT CHANGED (#2615,
-- docs/work-specs/live-publishing/evidence/fix-2615.md, rules R1 to R9).
--
-- `team_production_save` (0117) and `team_production_patch` (0119) answer a lost compare-and-swap
-- with the whole stored record: 5 MB at 60 graphics, about 780 MB in 20 s with seven writers on the
-- local stack. This adds:
--
--   team_production_save_v2(id, expected, doc)   0117's save; a refusal answers saved, updated_at,
--                                                updated_by and rev only, and decides it without
--                                                reading the document
--   team_production_patch_v2(id, expected, ops)  0119's patch, the same way
--   team_production_changes(id, map)             one stored version: its token, author, revision
--                                                and, as G4 patch operations, the units of its
--                                                document whose hash differs from `map`
--
-- The read's map is `{"f": "s1", "m": {member: entry}}`, an entry a hash or `{by, order, d}`. A hash
-- is SHA-256 of the unit's stored JSON text, first 128 bits, hex: not G4's hash, so these maps never
-- mix with `doc_units`. A map of another shape reads as empty, and the answer is every member.
--
-- The old functions are unchanged, so a page built before this works as before; a page built after
-- it falls back to them on an instance without these. Not live-path: no `control_*` object and no
-- live-path helper is defined, altered or granted here.
--
-- Additive: three new functions. Revert: drop the three functions; pages fall back to the old ones.

set lock_timeout = '2s';
set statement_timeout = '30s';

-- 0117's compare-and-swap save. A refusal carries no document.
create or replace function public.team_production_save_v2(p_id uuid, p_expected timestamptz, p_doc jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user  uuid := (select auth.uid());
  v_team  uuid;
  v_at    timestamptz;
  v_by    uuid;
  v_rev   bigint;
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
  select p.team_id, p.updated_at, p.updated_by, p.rev into v_team, v_at, v_by, v_rev
    from public.team_productions p where p.id = p_id;
  if v_team is null then
    raise exception 'unknown team production' using errcode = 'no_data_found';
  end if;
  if not public.is_team_member(v_team) then
    raise exception 'not a member of the team that holds this production' using errcode = '42501';
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
  if v_stamp is null then
    select p.updated_at, p.updated_by, p.rev into v_at, v_by, v_rev
      from public.team_productions p where p.id = p_id;
    return jsonb_build_object('saved', false, 'updated_at', v_at, 'updated_by', v_by, 'rev', v_rev);
  end if;
  return jsonb_build_object('saved', true, 'updated_at', v_stamp, 'updated_by', v_user, 'rev', v_rev);
end $$;
revoke all on function public.team_production_save_v2(uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.team_production_save_v2(uuid, timestamptz, jsonb) to authenticated;

-- 0119's patch. The refusal is decided on the locked row's token before the document is read.
create or replace function public.team_production_patch_v2(p_id uuid, p_expected timestamptz, p_ops jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user  uuid := (select auth.uid());
  v_team  uuid;
  v_at    timestamptz;
  v_by    uuid;
  v_rev   bigint;
  v_doc   jsonb;
  v_units jsonb;
  v_new   jsonb;
  v_stamp timestamptz;
  v_new_rev bigint;
  v_map   jsonb;
begin
  if v_user is null then
    raise exception 'saving a team production needs a signed-in account' using errcode = '42501';
  end if;
  if public.is_suspended() then
    raise exception 'this account is suspended' using errcode = '42501';
  end if;
  select p.team_id, p.updated_at, p.updated_by, p.rev into v_team, v_at, v_by, v_rev
    from public.team_productions p where p.id = p_id for no key update;
  if v_team is null then
    raise exception 'unknown team production' using errcode = 'no_data_found';
  end if;
  if not public.is_team_member(v_team) then
    raise exception 'not a member of the team that holds this production' using errcode = '42501';
  end if;
  if p_expected is null or v_at is distinct from p_expected then
    return jsonb_build_object('saved', false, 'updated_at', v_at, 'updated_by', v_by, 'rev', v_rev);
  end if;
  select p.doc, p.doc_units into v_doc, v_units from public.team_productions p where p.id = p_id;
  begin
    v_new := public.unit_patch_apply(v_doc, p_ops);
  exception when raise_exception then
    if sqlerrm like 'unit patch refused%' then
      return jsonb_build_object('saved', false, 'replaced', true, 'updated_at', v_at, 'updated_by', v_by, 'rev', v_rev);
    end if;
    raise;
  end;
  update public.team_productions p
     set doc = v_new,
         updated_by = v_user,
         updated_at = greatest(date_trunc('milliseconds', clock_timestamp()), p.updated_at + interval '1 millisecond')
   where p.id = p_id and p.updated_at = p_expected
   returning p.updated_at, p.rev into v_stamp, v_new_rev;
  v_map := case when v_units->>'f' = '1' and (v_units->>'rev')::bigint = v_rev
                then public.unit_map_apply(v_units, p_ops, v_new) || jsonb_build_object('rev', v_new_rev)
                end;
  update public.team_productions p set doc_units = v_map where p.id = p_id;
  return jsonb_build_object('saved', true, 'updated_at', v_stamp, 'updated_by', v_user, 'rev', v_new_rev, 'units', v_map is not null);
end $$;
revoke all on function public.team_production_patch_v2(uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.team_production_patch_v2(uuid, timestamptz, jsonb) to authenticated;

-- One stored version, as the units that differ from the caller's map. The caller's rights: the row
-- policy decides what it may read, as for any read of the table.
create or replace function public.team_production_changes(p_id uuid, p_map jsonb)
returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_doc   jsonb;
  v_at    timestamptz;
  v_by    uuid;
  v_rev   bigint;
  v_map   jsonb := '{}'::jsonb;
  v_ops   jsonb[] := '{}';
  v_m     text;
  v_val   jsonb;
  v_was   jsonb;
  v_key   text;
  v_cand  text;
  v_ok    boolean;
  v_items jsonb;
  v_d     jsonb;
  v_order jsonb;
  v_put   jsonb;
  v_del   jsonb;
  v_hash  text;
begin
  -- One select: the document, its token, its author and its revision are one stored version.
  select p.doc, p.updated_at, p.updated_by, p.rev into v_doc, v_at, v_by, v_rev
    from public.team_productions p where p.id = p_id;
  if not found then
    raise exception 'unknown team production' using errcode = 'no_data_found';
  end if;
  if jsonb_typeof(v_doc) is distinct from 'object' then
    raise exception 'a team production document must be a JSON object' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_map) = 'object' and p_map->>'f' = 's1' and jsonb_typeof(p_map->'m') = 'object' then
    v_map := p_map->'m';
  end if;
  for v_m, v_val in select e.key, e.value from jsonb_each(v_doc) e loop
    v_was := v_map->v_m;
    -- A keyed list (G4, unitPatch.ts keyedBy): a non-empty array of objects whose `id`, else `key`,
    -- else `name`, is a unique string.
    v_key := null;
    if jsonb_typeof(v_val) = 'array' and jsonb_array_length(v_val) > 0 then
      foreach v_cand in array array['id', 'key', 'name'] loop
        select coalesce(bool_and(jsonb_typeof(e) = 'object' and jsonb_typeof(e->v_cand) = 'string'), false)
               and count(distinct e->>v_cand) = count(*)
          into v_ok
          from jsonb_array_elements(v_val) e;
        if v_ok then
          v_key := v_cand;
          exit;
        end if;
      end loop;
    end if;
    if v_key is null then
      v_hash := left(encode(pg_catalog.sha256(convert_to(v_val::text, 'UTF8')), 'hex'), 32);
      if v_was is distinct from to_jsonb(v_hash) then
        v_ops := array_append(v_ops, jsonb_build_object('m', v_m, 'set', v_val, 'u', v_hash));
      end if;
      continue;
    end if;
    select jsonb_agg(jsonb_build_object('id', t.e->>v_key, 'h', left(encode(pg_catalog.sha256(convert_to(t.e::text, 'UTF8')), 'hex'), 32), 'i', t.i) order by t.i)
      into v_items
      from jsonb_array_elements(v_val) with ordinality t(e, i);
    select jsonb_object_agg(x->>'id', x->'h'), jsonb_agg(x->'id' order by (x->>'i')::bigint)
      into v_d, v_order
      from jsonb_array_elements(v_items) x;
    if jsonb_typeof(v_was) is distinct from 'object' or v_was->>'by' is distinct from v_key
       or jsonb_typeof(v_was->'d') is distinct from 'object' or jsonb_typeof(v_was->'order') is distinct from 'array' then
      -- Missing, of another shape or keyed by another identity: the member whole.
      v_ops := array_append(v_ops, jsonb_build_object('m', v_m, 'set', v_val, 'u', jsonb_build_object('by', v_key, 'order', v_order, 'd', v_d)));
      continue;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('v', v_val->((x->>'i')::int - 1), 'd', x->'h') order by (x->>'i')::bigint), '[]'::jsonb)
      into v_put
      from jsonb_array_elements(v_items) x
     where (v_was->'d'->>(x->>'id')) is distinct from x->>'h';
    select coalesce(jsonb_agg(to_jsonb(o.id) order by o.n), '[]'::jsonb)
      into v_del
      from jsonb_array_elements_text(v_was->'order') with ordinality o(id, n)
     where not (v_d ? o.id);
    if jsonb_array_length(v_put) = 0 and jsonb_array_length(v_del) = 0 and v_was->'order' = v_order then
      continue;
    end if;
    v_ops := array_append(v_ops, jsonb_build_object('m', v_m, 'by', v_key, 'put', v_put, 'del', v_del,
                                                    'order', v_order, 'len', jsonb_array_length(v_val)));
  end loop;
  -- A member the map has and the document lacks.
  for v_m in select k from jsonb_object_keys(v_map) k where not (v_doc ? k) loop
    v_ops := array_append(v_ops, jsonb_build_object('m', v_m, 'drop', true));
  end loop;
  return jsonb_build_object('updated_at', v_at, 'updated_by', v_by, 'rev', v_rev, 'ops', to_jsonb(v_ops));
end $$;
revoke all on function public.team_production_changes(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.team_production_changes(uuid, jsonb) to authenticated;

-- Self-check: privileges always; behaviour on a throwaway record when an account exists (0119's
-- pattern), undone by a sentinel the block catches.
do $$
declare
  v_owner uuid;
  v_tp    uuid := '00000000-0121-4000-8000-000000000002';
  v_team  uuid := '00000000-0121-4000-8000-000000000003';
  v_doc0  jsonb := '{"name":"a","n":1,"cues":[{"id":"x","t":1},{"id":"y","t":2}],"gone":true}';
  v_doc1  jsonb := '{"name":"a","n":2,"cues":[{"id":"y","t":3},{"id":"z","t":4}]}';
  v_at    timestamptz;
  v_got   jsonb;
  v_map   jsonb;
  v_ops   jsonb;
begin
  if has_function_privilege('anon', 'public.team_production_save_v2(uuid, timestamptz, jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.team_production_save_v2(uuid, timestamptz, jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.team_production_patch_v2(uuid, timestamptz, jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.team_production_patch_v2(uuid, timestamptz, jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.team_production_changes(uuid, jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.team_production_changes(uuid, jsonb)', 'EXECUTE') then
    raise exception '0121: EXECUTE on a team save or read function is wrong for a client role';
  end if;

  select id into v_owner from auth.users limit 1;
  if v_owner is null then
    raise notice '0121 self-check skipped: no account on this instance';
    return;
  end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    insert into public.teams (id, name, owner_id) values (v_team, '0121 self-check', v_owner);
    insert into public.team_members (team_id, user_id, display_name, role) values (v_team, v_owner, 'self-check', 'owner') on conflict do nothing;
    insert into public.team_productions (id, team_id, doc, updated_by) values (v_tp, v_team, v_doc0, v_owner);
    if public.is_suspended() then
      raise exception 'self-check-done';
    end if;
    select p.updated_at into v_at from public.team_productions p where p.id = v_tp;
    -- A refusal: the token, author and revision, no document.
    v_got := public.team_production_save_v2(v_tp, v_at - interval '1 second', v_doc1);
    if v_got->>'saved' is distinct from 'false' or v_got ? 'doc' or (v_got->>'updated_at')::timestamptz <> v_at or v_got->'rev' is null then
      raise exception '0121: a refused save answered %', v_got;
    end if;
    v_got := public.team_production_patch_v2(v_tp, v_at - interval '1 second', '[]');
    if v_got->>'saved' is distinct from 'false' or v_got ? 'doc' then
      raise exception '0121: a refused patch answered %', v_got;
    end if;
    -- A read with no map: every member, and they rebuild the stored document.
    v_got := public.team_production_changes(v_tp, null);
    v_ops := v_got->'ops';
    if jsonb_array_length(v_ops) <> 4 or public.unit_patch_apply('{}', v_ops) <> v_doc0
       or (v_got->>'updated_at')::timestamptz <> v_at then
      raise exception '0121: a read with no map answered %', v_got;
    end if;
    select jsonb_object_agg(o->>'m', o->'u') into v_map from jsonb_array_elements(v_ops) o;
    -- A landed save, then a read with that map: only what changed, and it rebuilds the new document.
    v_got := public.team_production_save_v2(v_tp, v_at, v_doc1);
    if v_got->>'saved' is distinct from 'true' then
      raise exception '0121: a save on its token answered %', v_got;
    end if;
    v_got := public.team_production_changes(v_tp, jsonb_build_object('f', 's1', 'm', v_map));
    v_ops := v_got->'ops';
    if jsonb_array_length(v_ops) <> 3
       or not (v_ops @> '[{"m":"n","set":2}]' and v_ops @> '[{"m":"gone","drop":true}]'
               and v_ops @> '[{"m":"cues","by":"id","put":[{"v":{"id":"y","t":3}},{"v":{"id":"z","t":4}}],"del":["x"],"order":["y","z"],"len":2}]')
       or jsonb_array_length((select o->'put' from jsonb_array_elements(v_ops) o where o->>'m' = 'cues')) <> 2
       or public.unit_patch_apply(v_doc0, v_ops) <> v_doc1 then
      raise exception '0121: a read with a map answered %', v_got;
    end if;
    -- A map of another kind reads as empty.
    if jsonb_array_length(public.team_production_changes(v_tp, jsonb_build_object('f', 1, 'm', v_map))->'ops') <> 3 then
      raise exception '0121: a map of another kind was used';
    end if;
    raise exception 'self-check-done';
  exception when raise_exception then
    if sqlerrm <> 'self-check-done' then raise; end if;
  end;
end $$;
