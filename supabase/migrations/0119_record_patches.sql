-- ONLY WHAT CHANGED, FOR SAVES (docs/work-specs/live-publishing/designs/G4.md sections 1, 2 and 7).
--
-- A production record is saved as a PATCH: only the units (a top-level member, or one element of a
-- keyed list: an array of objects with one unique `id`, else `key`, else `name`) whose content
-- changed, applied by the server only to the revision the patch was built against (`rev`, 0117, for
-- a personal record; the compare-and-swap token for a team one). Anything else answers `replaced`
-- and writes nothing, and the page saves whole, as before.
--
--   unit_patch_apply(doc, ops)        the patch, applied; raises 'unit patch refused' when the stored
--                                     member is not the list the patch names, an order is not the
--                                     list's identities or the length is not the writer's
--   unit_map_apply(map, ops, doc)     the unit map after the patch (each unit's digest, as the
--                                     writer computed it, and each keyed list's order)
--   documents_show_patch(...)         a personal record (security invoker: the row policy, the 0115
--                                     guard and the 0117 revision trigger act as on any save)
--   team_production_patch(...)        a team record, the compare-and-swap of team_production_save
--   documents_show_units_set(...)     the map after a whole save, kept only for that revision
--   team_production_units_set(...)    the same for a team record
--   partial_writes_state()            installed, and the `partial_writes` switch
--
-- Each record keeps its map beside it (`documents.body_units`, `team_productions.doc_units`), with
-- the revision it describes in `rev`. A map whose revision is not the row's is no base: an older page
-- wrote the record whole since.
--
-- Additive: two nullable columns with no default (no rewrite), new functions. Nothing calls them
-- until the app reads `partial_writes_state()` with the switch on. Revert: drop the functions and
-- the two columns.

set lock_timeout = '2s';
set statement_timeout = '30s';

alter table public.documents add column if not exists body_units jsonb;
alter table public.team_productions add column if not exists doc_units jsonb;

-- One keyed list operation: replace in place, append new, remove deleted, then reorder.
create or replace function public.unit_patch_keyed(p_cur jsonb, p_op jsonb)
returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_by    text := p_op->>'by';
  v_put   jsonb := '{}'::jsonb;
  v_del   text[];
  v_next  jsonb;
  v_n     int;
  v_len   int;
begin
  if v_by is null or v_by not in ('id', 'key', 'name') or jsonb_typeof(p_cur) is distinct from 'array' then
    raise exception 'unit patch refused: % is not a keyed list', p_op->>'m';
  end if;
  -- The stored list must be keyed by that identity: objects, string identities, all distinct.
  select count(*), count(distinct e->>v_by) filter (where jsonb_typeof(e) = 'object' and jsonb_typeof(e->v_by) = 'string')
    into v_n, v_len
    from jsonb_array_elements(p_cur) e;
  if v_n <> v_len then
    raise exception 'unit patch refused: % is not keyed by %', p_op->>'m', v_by;
  end if;
  select coalesce(jsonb_object_agg(p->'v'->>v_by, p->'v'), '{}'::jsonb)
    into v_put
    from jsonb_array_elements(coalesce(p_op->'put', '[]'::jsonb)) p
   where jsonb_typeof(p->'v'->v_by) = 'string';
  if v_put = '{}'::jsonb and jsonb_array_length(coalesce(p_op->'put', '[]'::jsonb)) > 0
     or (select count(*) from jsonb_object_keys(v_put)) <> jsonb_array_length(coalesce(p_op->'put', '[]'::jsonb)) then
    raise exception 'unit patch refused: % puts an element without a distinct %', p_op->>'m', v_by;
  end if;
  select coalesce(array_agg(x), '{}') into v_del from jsonb_array_elements_text(coalesce(p_op->'del', '[]'::jsonb)) x;
  -- In place, then the new ones in the order they were put.
  select coalesce(jsonb_agg(case when v_put ? (e->>v_by) then v_put->(e->>v_by) else e end order by i), '[]'::jsonb)
    into v_next
    from jsonb_array_elements(p_cur) with ordinality t(e, i)
   where not ((e->>v_by) = any(v_del));
  select v_next || coalesce(jsonb_agg(p->'v' order by j), '[]'::jsonb)
    into v_next
    from jsonb_array_elements(coalesce(p_op->'put', '[]'::jsonb)) with ordinality u(p, j)
   where not exists (select 1 from jsonb_array_elements(p_cur) c where c->>v_by = p->'v'->>v_by);
  if p_op ? 'order' then
    if jsonb_typeof(p_op->'order') <> 'array'
       or jsonb_array_length(p_op->'order') <> jsonb_array_length(v_next)
       or (select count(distinct o) from jsonb_array_elements_text(p_op->'order') o) <> jsonb_array_length(v_next)
       or exists (select 1 from jsonb_array_elements_text(p_op->'order') o
                   where not exists (select 1 from jsonb_array_elements(v_next) x where x->>v_by = o)) then
      raise exception 'unit patch refused: % has an order that is not its identities', p_op->>'m';
    end if;
    select jsonb_agg(x order by k)
      into v_next
      from jsonb_array_elements_text(p_op->'order') with ordinality o(id, k)
      join jsonb_array_elements(v_next) x on x->>v_by = o.id;
  end if;
  if coalesce(jsonb_typeof(p_op->'len'), 'missing') <> 'number' or jsonb_array_length(v_next) <> (p_op->>'len')::int then
    raise exception 'unit patch refused: % has % elements, the writer has %', p_op->>'m', jsonb_array_length(v_next), p_op->>'len';
  end if;
  return v_next;
end $$;

create or replace function public.unit_patch_apply(p_doc jsonb, p_ops jsonb)
returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_doc jsonb := p_doc;
  v_op  jsonb;
  v_m   text;
begin
  if jsonb_typeof(v_doc) is distinct from 'object' or jsonb_typeof(p_ops) is distinct from 'array' then
    raise exception 'unit patch refused: not a document and a list of operations';
  end if;
  for v_op in select o from jsonb_array_elements(p_ops) o loop
    v_m := v_op->>'m';
    if v_m is null then raise exception 'unit patch refused: an operation names no member'; end if;
    if v_op ? 'set' then
      v_doc := v_doc || jsonb_build_object(v_m, v_op->'set');
    elsif v_op->'drop' = 'true'::jsonb then
      v_doc := v_doc - v_m;
    elsif v_op ? 'by' then
      v_doc := v_doc || jsonb_build_object(v_m, public.unit_patch_keyed(v_doc->v_m, v_op));
    else
      raise exception 'unit patch refused: an operation on % does nothing known', v_m;
    end if;
  end loop;
  return v_doc;
end $$;

-- The map after the patch: what the writer computed for what it sent, the rest kept. A keyed list's
-- order is read from the patched document itself.
create or replace function public.unit_map_apply(p_map jsonb, p_ops jsonb, p_doc jsonb)
returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_m   jsonb := coalesce(p_map->'m', '{}'::jsonb);
  v_op  jsonb;
  v_k   text;
  v_by  text;
  v_d   jsonb;
begin
  for v_op in select o from jsonb_array_elements(p_ops) o loop
    v_k := v_op->>'m';
    if v_op ? 'set' then
      v_m := v_m || jsonb_build_object(v_k, v_op->'u');
    elsif v_op->'drop' = 'true'::jsonb then
      v_m := v_m - v_k;
    else
      v_by := v_op->>'by';
      v_d := coalesce(v_m->v_k->'d', '{}'::jsonb) - coalesce(array(select jsonb_array_elements_text(coalesce(v_op->'del', '[]'::jsonb))), '{}');
      select v_d || coalesce(jsonb_object_agg(p->'v'->>v_by, p->'d'), '{}'::jsonb) into v_d
        from jsonb_array_elements(coalesce(v_op->'put', '[]'::jsonb)) p;
      v_m := v_m || jsonb_build_object(v_k, jsonb_build_object(
        'by', v_by,
        'order', (select coalesce(jsonb_agg(e->v_by order by i), '[]'::jsonb) from jsonb_array_elements(p_doc->v_k) with ordinality t(e, i)),
        'd', v_d));
    end if;
  end loop;
  return jsonb_build_object('f', 1, 'm', v_m);
end $$;

revoke all on function public.unit_patch_keyed(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.unit_patch_apply(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.unit_map_apply(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.unit_patch_keyed(jsonb, jsonb) to authenticated;
grant execute on function public.unit_patch_apply(jsonb, jsonb) to authenticated;
grant execute on function public.unit_map_apply(jsonb, jsonb, jsonb) to authenticated;

-- A personal production record, patched. Invoker: the row policy decides whose record it is, and the
-- 0115 guard and the 0117 trigger see an ordinary update of `body`. Answers {rev, updated_at} or
-- {replaced: true, rev}; a refused patch is `replaced` too, with nothing written.
create or replace function public.documents_show_patch(p_id uuid, p_base bigint, p_ops jsonb)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_body  jsonb;
  v_rev   bigint;
  v_units jsonb;
  v_new   jsonb;
  v_map   jsonb;
begin
  select d.body, d.rev, d.body_units into v_body, v_rev, v_units
    from public.documents d
   where d.id = p_id and d.kind = 'show' and not d.deleted
   for no key update;
  if v_body is null then
    return jsonb_build_object('replaced', true, 'rev', null);
  end if;
  if p_base is null or v_rev is distinct from p_base then
    return jsonb_build_object('replaced', true, 'rev', v_rev);
  end if;
  begin
    v_new := public.unit_patch_apply(v_body, p_ops);
  exception when raise_exception then
    if sqlerrm like 'unit patch refused%' then
      return jsonb_build_object('replaced', true, 'rev', v_rev, 'why', sqlerrm);
    end if;
    raise;
  end;
  update public.documents d
     set body = v_new,
         name = coalesce(case when jsonb_typeof(v_new->'name') = 'string' then v_new->>'name' end, d.name)
   where d.id = p_id and d.rev = p_base
   returning d.rev into v_rev;
  if v_rev is null then
    return jsonb_build_object('replaced', true, 'rev', (select d.rev from public.documents d where d.id = p_id));
  end if;
  -- The map follows only from a map that described the base; otherwise nobody may trust it.
  v_map := case when v_units->>'f' = '1' and (v_units->>'rev')::bigint = p_base
                then public.unit_map_apply(v_units, p_ops, v_new) || jsonb_build_object('rev', v_rev)
                end;
  update public.documents d set body_units = v_map where d.id = p_id;
  return jsonb_build_object('rev', v_rev, 'updated_at', v_new->'updatedAt', 'units', v_map is not null);
end $$;
revoke all on function public.documents_show_patch(uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.documents_show_patch(uuid, bigint, jsonb) to authenticated;

-- The map of a whole save, kept only while the row is still that revision.
create or replace function public.documents_show_units_set(p_id uuid, p_rev bigint, p_units jsonb)
returns boolean
language plpgsql security invoker set search_path = '' as $$
declare v_n int;
begin
  update public.documents d
     set body_units = jsonb_build_object('f', 1, 'm', p_units->'m', 'rev', p_rev)
   where d.id = p_id and d.kind = 'show' and d.rev = p_rev and jsonb_typeof(p_units->'m') = 'object';
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;
revoke all on function public.documents_show_units_set(uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.documents_show_units_set(uuid, bigint, jsonb) to authenticated;

-- A team production record, patched: 0117's team_production_save with the document patched.
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
  if p_expected is null or v_row.updated_at is distinct from p_expected then
    return jsonb_build_object('saved', false, 'updated_at', v_row.updated_at, 'updated_by', v_row.updated_by, 'doc', v_row.doc, 'rev', v_row.rev);
  end if;
  begin
    v_new := public.unit_patch_apply(v_row.doc, p_ops);
  exception when raise_exception then
    if sqlerrm like 'unit patch refused%' then
      -- No document back: the writer saves whole next, and needs none (G4 section 2).
      return jsonb_build_object('saved', false, 'replaced', true, 'updated_at', v_row.updated_at, 'updated_by', v_row.updated_by, 'rev', v_row.rev);
    end if;
    raise;
  end;
  update public.team_productions p
     set doc = v_new,
         updated_by = v_user,
         updated_at = greatest(date_trunc('milliseconds', clock_timestamp()), p.updated_at + interval '1 millisecond')
   where p.id = p_id and p.updated_at = p_expected
   returning p.updated_at, p.rev into v_stamp, v_rev;
  v_map := case when v_row.doc_units->>'f' = '1' and (v_row.doc_units->>'rev')::bigint = v_row.rev
                then public.unit_map_apply(v_row.doc_units, p_ops, v_new) || jsonb_build_object('rev', v_rev)
                end;
  update public.team_productions p set doc_units = v_map where p.id = p_id;
  return jsonb_build_object('saved', true, 'updated_at', v_stamp, 'updated_by', v_user, 'rev', v_rev, 'units', v_map is not null);
end $$;
revoke all on function public.team_production_patch(uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.team_production_patch(uuid, timestamptz, jsonb) to authenticated;

create or replace function public.team_production_units_set(p_id uuid, p_rev bigint, p_units jsonb)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_team uuid;
  v_n    int;
begin
  select p.team_id into v_team from public.team_productions p where p.id = p_id;
  -- The checks of team_production_save: a signed-in member, not suspended.
  if auth.uid() is null or public.is_suspended() or v_team is null or not public.is_team_member(v_team) then return false; end if;
  update public.team_productions p
     set doc_units = jsonb_build_object('f', 1, 'm', p_units->'m', 'rev', p_rev)
   where p.id = p_id and p.rev = p_rev and jsonb_typeof(p_units->'m') = 'object';
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;
revoke all on function public.team_production_units_set(uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.team_production_units_set(uuid, bigint, jsonb) to authenticated;

-- The switch. Definer, because system_settings has RLS on and is the service role's.
create or replace function public.partial_writes_on()
returns boolean
language sql security definer set search_path = '' stable as $$
  select coalesce((select (s.value->>'on')::boolean from public.system_settings s where s.key = 'partial_writes'), false);
$$;
revoke all on function public.partial_writes_on() from public, anon, authenticated;

create or replace function public.partial_writes_state()
returns jsonb
language sql security definer set search_path = '' stable as $$
  -- Installed once both files are in: the publish of 0120, a live-path file that may wait for a
  -- quiet window, included (G4 section 7).
  select jsonb_build_object('installed', to_regprocedure('public.control_publish_parts(uuid, bigint, jsonb, jsonb, jsonb, jsonb, jsonb)') is not null,
                            'on', public.partial_writes_on());
$$;
revoke all on function public.partial_writes_state() from public, anon, authenticated;
grant execute on function public.partial_writes_state() to authenticated;

-- Self-check: privileges always; behaviour on a throwaway record when an account exists (0117's
-- pattern), undone by a sentinel the block catches.
do $$
declare
  v_owner uuid;
  v_id    uuid := '00000000-0119-4000-8000-000000000001';
  v_tp    uuid := '00000000-0119-4000-8000-000000000002';
  v_team  uuid := '00000000-0119-4000-8000-000000000003';
  v_at    timestamptz;
  v_rev   bigint;
  v_got   jsonb;
  v_ops   jsonb;
begin
  if has_function_privilege('anon', 'public.documents_show_patch(uuid, bigint, jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.documents_show_patch(uuid, bigint, jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.team_production_patch(uuid, timestamptz, jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.team_production_patch(uuid, timestamptz, jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.partial_writes_state()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.partial_writes_state()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.partial_writes_on()', 'EXECUTE')
     or has_function_privilege('anon', 'public.unit_patch_apply(jsonb, jsonb)', 'EXECUTE') then
    raise exception '0119: EXECUTE on a patch function is wrong for a client role';
  end if;
  -- The apply, by itself: in place, appended, deleted, reordered; a wrong length refused.
  v_got := public.unit_patch_apply('{"a":1,"cues":[{"id":"x","t":1},{"id":"y","t":2}]}',
    '[{"m":"a","set":2,"u":"d"},{"m":"cues","by":"id","put":[{"v":{"id":"y","t":3},"d":"d"},{"v":{"id":"z","t":4},"d":"d"}],"del":["x"],"order":["z","y"],"len":2}]');
  if v_got <> '{"a":2,"cues":[{"id":"z","t":4},{"id":"y","t":3}]}'::jsonb then
    raise exception '0119: unit_patch_apply answered %', v_got;
  end if;
  begin
    perform public.unit_patch_apply('{"cues":[{"id":"x"}]}', '[{"m":"cues","by":"id","put":[],"del":[],"len":2}]');
    raise exception '0119: a wrong length was applied';
  exception when raise_exception then
    if sqlerrm not like 'unit patch refused%' then raise; end if;
  end;

  select id into v_owner from auth.users limit 1;
  if v_owner is null then
    raise notice '0119 self-check skipped: no account on this instance';
    return;
  end if;
  begin
    insert into public.documents (id, user_id, kind, body) values (v_id, v_owner, 'show', '{"name":"a","updatedAt":"t1","cues":[{"id":"x","t":1}]}');
    select d.rev into v_rev from public.documents d where d.id = v_id;
    if not public.documents_show_units_set(v_id, v_rev, '{"m":{"name":"n1","updatedAt":"u1","cues":{"by":"id","order":["x"],"d":{"x":"dx"}}}}') then
      raise exception '0119: the map of a whole save was not kept';
    end if;
    v_ops := '[{"m":"updatedAt","set":"t2","u":"u2"},{"m":"cues","by":"id","put":[{"v":{"id":"x","t":2},"d":"dx2"}],"del":[],"len":1}]';
    -- A base the record is not at: nothing written.
    v_got := public.documents_show_patch(v_id, v_rev - 1, v_ops);
    if v_got->>'replaced' is distinct from 'true' or (select d.body->>'updatedAt' from public.documents d where d.id = v_id) <> 't1' then
      raise exception '0119: a patch on another revision answered % and wrote', v_got;
    end if;
    -- Its own base: applied, the revision up, the map kept for the new revision.
    v_got := public.documents_show_patch(v_id, v_rev, v_ops);
    if v_got->>'updated_at' <> 't2' or (v_got->>'rev')::bigint <= v_rev
       or (select d.body->'cues'->0->>'t' from public.documents d where d.id = v_id) <> '2'
       or (select (d.body_units->>'rev')::bigint from public.documents d where d.id = v_id) <> (v_got->>'rev')::bigint
       or (select d.body_units->'m'->'cues'->'d'->>'x' from public.documents d where d.id = v_id) <> 'dx2' then
      raise exception '0119: a patch on its base answered %', v_got;
    end if;
    -- A shape the record cannot take: replaced, nothing written.
    v_rev := (v_got->>'rev')::bigint;
    v_got := public.documents_show_patch(v_id, v_rev, '[{"m":"name","by":"id","put":[],"del":[],"len":0}]');
    if v_got->>'replaced' is distinct from 'true' or (select d.rev from public.documents d where d.id = v_id) <> v_rev then
      raise exception '0119: a refused patch answered % or wrote', v_got;
    end if;
    -- A team record: its map set, a patch on its token, and a refused shape answered without the
    -- document. The account acts through the claims a request would carry (no request headers, so
    -- the 0115 guard stands aside as for any migration).
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    insert into public.teams (id, name, owner_id) values (v_team, '0119 self-check', v_owner);
    insert into public.team_members (team_id, user_id, display_name, role) values (v_team, v_owner, 'self-check', 'owner') on conflict do nothing;
    insert into public.team_productions (id, team_id, doc, updated_by) values (v_tp, v_team, '{"name":"a","updatedAt":"t1","cues":[{"id":"x","t":1}]}', v_owner);
    select p.rev, p.updated_at into v_rev, v_at from public.team_productions p where p.id = v_tp;
    if public.is_suspended() then
      raise exception 'self-check-done';
    end if;
    if not public.team_production_units_set(v_tp, v_rev, '{"m":{"name":"n1","updatedAt":"u1","cues":{"by":"id","order":["x"],"d":{"x":"dx"}}}}') then
      raise exception '0119: the map of a team record was not kept';
    end if;
    v_got := public.team_production_patch(v_tp, v_at, '[{"m":"updatedAt","set":"t2","u":"u2"},{"m":"cues","by":"id","put":[{"v":{"id":"x","t":2},"d":"dx2"}],"del":[],"len":1}]');
    if v_got->>'saved' is distinct from 'true'
       or (select p.doc->'cues'->0->>'t' from public.team_productions p where p.id = v_tp) <> '2'
       or (select (p.doc_units->>'rev')::bigint from public.team_productions p where p.id = v_tp) <> (v_got->>'rev')::bigint then
      raise exception '0119: a team patch on its token answered %', v_got;
    end if;
    v_got := public.team_production_patch(v_tp, (v_got->>'updated_at')::timestamptz, '[{"m":"name","by":"id","put":[],"del":[],"len":0}]');
    if v_got->>'replaced' is distinct from 'true' or v_got ? 'doc' then
      raise exception '0119: a refused team patch answered %', v_got;
    end if;
    raise exception 'self-check-done';
  exception when raise_exception then
    if sqlerrm <> 'self-check-done' then raise; end if;
  end;
end $$;
