-- live-path: a new table control_data_presses (keyed to control_shows by a foreign key, which locks it for an instant), a new function control_data_adjust_by_slug, and control_send_seq's body replaced with its signature, grants and answers unchanged
--
-- A BOUND PRESS IS A RELATIVE OPERATION, LANDED ONCE (#2617; docs/work-specs/live-publishing/
-- evidence/fix-2617.md, Rules R1 to R11).
--
-- Until now a Goal on a bound score was written as an ABSOLUTE figure the page computed from its
-- own tree, in one attempt, so under a slow database presses were lost (phase 9 on staging: 199
-- presses, score 55). Here the page sends "add N to this path" or "make this path this text", each
-- with a press id, and resends until it lands:
--
--   control_data_presses          (production, press id) for every press applied, kept 24 hours
--   control_data_adjust_by_slug   the presses, folded under the row lock onto the stored tree and
--                                 written as ONE absolute merge patch through today's operator door
--                                 (control_data_patch_by_slug), so every guard and the command
--                                 budget stay; an id already held is answered as landed, not
--                                 applied again
--
-- The tree write itself stays an absolute merge patch, so `src/model/productionData.ts` and its
-- rule that a write is absolute state are unchanged: the increment becomes that patch here, under
-- the lock, and the press id is what keeps a resend from counting twice.
--
-- control_send_seq (0071) gains one step, 7b (R5a): while it holds the head, it replaces every
-- field bound to the production's tree that an `update` item already carries with the stored
-- tree's text. A data write changes `data` before its update rows take the head (0071's
-- control_events_seq), so whichever of a Take's row and a data write's row lands last carries the
-- server's newest figure, and air ends on the tree. Nothing else changes: no field is added, typed
-- data and every other key of the message stay as sent, and a production with no bindings, or a
-- batch with no `update` carrying data, runs exactly 0071's path.
--
-- Additive: a new table and function, and one function body replaced with its signature and
-- grants unchanged. Old pages keep calling control_data_patch_by_slug and control_send_many, which
-- are untouched. Revert: restore 0071's control_send_seq body (copy it from 0071 section 5), then
-- drop function control_data_adjust_by_slug and the helpers below, and drop table
-- control_data_presses.

set lock_timeout = '2s';
set statement_timeout = '30s';

-- ── 1. The ids of the presses applied ─────────────────────────────────────────────────────────
create table if not exists public.control_data_presses (
  show_id    uuid not null references public.control_shows (id) on delete cascade,
  press_id   uuid not null,
  created_at timestamptz not null default now(),
  primary key (show_id, press_id)
);
alter table public.control_data_presses enable row level security;   -- no policy: the function only
revoke all on table public.control_data_presses from public, anon, authenticated;
create index if not exists control_data_presses_age on public.control_data_presses (show_id, created_at);

-- ── 2. The arithmetic and the types, as the page has them ──────────────────────────────────────
-- `adjustedValue` (src/control/controlModel.ts): the leading integer of the value's text, or 0,
-- plus N. The leaf keeps its type (`retypeLeaf` with the verb 'adjust'): a number stays a number,
-- a text stays a text, a missing or null leaf starts as a number. Any other leaf answers null,
-- which refuses the press.
create or replace function public.production_data_adjusted(p_old jsonb, p_by numeric)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_lead numeric;
begin
  if p_old is null or jsonb_typeof(p_old) = 'null' then
    return to_jsonb(p_by);
  end if;
  if jsonb_typeof(p_old) not in ('number', 'string') then
    return null;
  end if;
  v_lead := coalesce(substring(p_old #>> '{}' from '^\s*([+-]?[0-9]+)')::numeric, 0);
  if jsonb_typeof(p_old) = 'number' then
    return to_jsonb(v_lead + p_by);
  end if;
  return to_jsonb((v_lead + p_by)::text);
end $$;
revoke execute on function public.production_data_adjusted(jsonb, numeric) from public, anon, authenticated;

-- `retypeLeaf` with the verb 'set': the text in the type the stored leaf has. A list of plain
-- values (or an empty one) takes the text's lines, each in the type of the list's first value; a
-- number takes the number when the text is one; a boolean takes text = 'true'; anything else, a
-- missing leaf included, takes the text.
create or replace function public.production_data_set_text(p_old jsonb, p_text text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_like jsonb;
  v_out jsonb := '[]'::jsonb;
  v_line text;
begin
  if jsonb_typeof(p_old) = 'array'
     and (jsonb_array_length(p_old) = 0 or not exists (
       select 1 from jsonb_array_elements(p_old) e where jsonb_typeof(e) not in ('string', 'number', 'boolean'))) then
    if p_text = '' then return '[]'::jsonb; end if;
    v_like := p_old->0;
    foreach v_line in array string_to_array(p_text, E'\n') loop
      v_out := v_out || jsonb_build_array(public.production_data_set_text(v_like, v_line));
    end loop;
    return v_out;
  end if;
  if jsonb_typeof(p_old) = 'number' then
    if btrim(p_text) = '' then return '0'::jsonb; end if;
    if p_text ~ '^\s*[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?\s*$' then
      return to_jsonb(btrim(p_text)::numeric);
    end if;
    return to_jsonb(p_text);
  end if;
  if jsonb_typeof(p_old) = 'boolean' then
    return to_jsonb(p_text = 'true');
  end if;
  return to_jsonb(p_text);
end $$;
revoke execute on function public.production_data_set_text(jsonb, text) from public, anon, authenticated;

-- A value at a path, as the nested object a merge patch says it with.
create or replace function public.production_data_nested(p_at text[], p_value jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v jsonb := p_value;
  i int;
begin
  for i in reverse coalesce(array_length(p_at, 1), 0) .. 1 loop
    v := jsonb_build_object(p_at[i], v);
  end loop;
  return v;
end $$;
revoke execute on function public.production_data_nested(text[], jsonb) from public, anon, authenticated;

-- `setPath` (src/model/productionData.ts): the value at a path, making what is missing on the way:
-- a list index past the end pads the list, anything else that is not an object becomes one.
create or replace function public.production_data_set_path(p_node jsonb, p_at text[], p_value jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_head text;
  v_rest text[];
  v_list jsonb;
  v_base jsonb;
  v_i int;
begin
  if coalesce(array_length(p_at, 1), 0) = 0 then return p_value; end if;
  v_head := p_at[1];
  v_rest := p_at[2:];
  if jsonb_typeof(p_node) = 'array' and v_head ~ '^[0-9]+$' then
    v_i := v_head::int;
    v_list := p_node;
    while jsonb_array_length(v_list) <= v_i loop
      v_list := v_list || 'null'::jsonb;
    end loop;
    return jsonb_set(v_list, array[v_head], public.production_data_set_path(v_list->v_i, v_rest, p_value));
  end if;
  v_base := case when jsonb_typeof(p_node) = 'object' then p_node else '{}'::jsonb end;
  return v_base || jsonb_build_object(v_head, public.production_data_set_path(v_base->v_head, v_rest, p_value));
end $$;
revoke execute on function public.production_data_set_path(jsonb, text[], jsonb) from public, anon, authenticated;

-- The part of a path a merge patch can name: up to the first segment that indexes into a list,
-- whose whole value the patch then carries (a merge patch cannot address one element).
create or replace function public.production_data_patch_unit(p_tree jsonb, p_at text[])
returns text[] language plpgsql immutable set search_path = '' as $$
declare
  i int;
begin
  for i in 2 .. coalesce(array_length(p_at, 1), 0) loop
    if jsonb_typeof(p_tree #> p_at[1:i - 1]) = 'array' then
      return p_at[1:i - 1];
    end if;
  end loop;
  return p_at;
end $$;
revoke execute on function public.production_data_patch_unit(jsonb, text[]) from public, anon, authenticated;

-- ── 3. The presses ────────────────────────────────────────────────────────────────────────────
-- p_presses: at most 50 of {id: uuid, path: 'a.b.c', by: number} or {id, path, text: string}, in
-- press order. Answers {data, writes, landed: [ids], refused: [{id, reason}]}. Any error other than
-- a path the operator door refuses (the command budget, a statement or lock timeout, hosted control
-- switched off) ends the whole call with nothing written or recorded, so the page sends it again.
create or replace function public.control_data_adjust_by_slug(p_slug text, p_presses jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
  v_owner uuid;
  v_tree jsonb;
  v_count int;
  v_recent int;
  v_press jsonb;
  v_id text;
  v_path text;
  v_at text[];
  v_new jsonb;
  v_landed jsonb := '[]'::jsonb;
  v_refused jsonb := '[]'::jsonb;
  v_applied jsonb := '[]'::jsonb;          -- [{id, path, press}] folded, not yet written
  v_stored jsonb;                          -- the tree as stored, which every fold starts from
  v_gone jsonb;
  v_seen text[] := '{}';
  v_units text[] := '{}';                  -- each patch unit once, as its dotted text
  v_unit text;
  v_patch jsonb;
  v_result jsonb;
  v_named text;
  v_tries int := 0;
begin
  if p_presses is null or jsonb_typeof(p_presses) <> 'array' then
    raise exception 'not a press batch' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_presses);
  if v_count < 1 or v_count > 50 then
    raise exception 'not a press batch' using errcode = '22023';
  end if;

  -- 1. The row's lock first, waiting at most 4 s (an attempt the page gave up on leaves the queue
  --    soon), then hosted control, before anything is read.
  perform set_config('lock_timeout', '4000', true);
  select s.id, s.owner_id, coalesce(s.data, '{}'::jsonb) into v_show, v_owner, v_tree
    from public.control_shows s where s.slug = p_slug and p_slug is not null
    for no key update;
  if v_show is null then raise exception 'unknown control slug'; end if;
  if public.feature_denied_for(v_owner, 'control.hosted') then
    raise exception 'hosted control is switched off for this page' using errcode = '42501';
  end if;
  select count(*) into v_recent from public.control_data_presses p
   where p.show_id = v_show and p.created_at > now() - interval '5 seconds';
  if v_recent + v_count > 100 then
    raise exception 'too many presses, slow down' using errcode = 'check_violation';
  end if;

  -- 2 and 3. Each press in order: refused on its own when malformed, landed when already held,
  --    else folded onto the tree.
  v_stored := v_tree;
  for v_press in select value from jsonb_array_elements(p_presses) loop
    v_id := v_press->>'id';
    v_path := v_press->>'path';
    if jsonb_typeof(v_press) <> 'object' or coalesce(v_id, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_refused := v_refused || jsonb_build_object('id', v_id, 'reason', 'not a press');
      continue;
    end if;
    if v_id = any (v_seen) or exists (select 1 from public.control_data_presses p where p.show_id = v_show and p.press_id = v_id::uuid) then
      v_landed := v_landed || to_jsonb(v_id);
      continue;
    end if;
    v_seen := v_seen || v_id;
    if jsonb_typeof(v_press->'path') <> 'string' or v_path !~ '^[^.]+(\.[^.]+)*$'
       or not (jsonb_typeof(v_press->'by') = 'number' or jsonb_typeof(v_press->'text') = 'string') then
      v_refused := v_refused || jsonb_build_object('id', v_id, 'reason', 'not a press');
      continue;
    end if;
    v_at := string_to_array(v_path, '.');
    v_new := case when jsonb_typeof(v_press->'by') = 'number'
                  then public.production_data_adjusted(v_tree #> v_at, (v_press->>'by')::numeric)
                  else public.production_data_set_text(v_tree #> v_at, v_press->>'text') end;
    if v_new is null then
      v_refused := v_refused || jsonb_build_object('id', v_id, 'reason', 'not a number: ' || v_path);
      continue;
    end if;
    v_tree := public.production_data_set_path(v_tree, v_at, v_new);
    v_applied := v_applied || jsonb_build_object('id', v_id, 'path', v_path, 'press', v_press);
  end loop;

  -- 4 and 5. ONE absolute merge patch through the operator door, each unit once. A path the door
  --    refuses (not a bound path, not a field value) refuses the presses on it, above it or below
  --    it, and only those: the others are folded again from the stored tree and written. Any other
  --    error ends the call.
  loop
    v_tree := v_stored;
    v_units := '{}';
    for v_press in select x.value->'press' from jsonb_array_elements(v_applied) x loop
      v_at := string_to_array(v_press->>'path', '.');
      v_new := case when jsonb_typeof(v_press->'by') = 'number'
                    then public.production_data_adjusted(v_tree #> v_at, (v_press->>'by')::numeric)
                    else public.production_data_set_text(v_tree #> v_at, v_press->>'text') end;
      v_tree := public.production_data_set_path(v_tree, v_at, v_new);
      v_unit := array_to_string(public.production_data_patch_unit(v_tree, v_at), '.');
      if not v_unit = any (v_units) then v_units := v_units || v_unit; end if;
    end loop;
    exit when cardinality(v_units) = 0;
    v_tries := v_tries + 1;
    v_patch := '{}'::jsonb;
    foreach v_unit in array v_units loop
      v_patch := public.jsonb_merge_patch(v_patch,
        public.production_data_nested(string_to_array(v_unit, '.'), v_tree #> string_to_array(v_unit, '.')));
    end loop;
    begin
      v_result := public.control_data_patch_by_slug(p_slug, v_patch);
      exit;
    exception when sqlstate '42501' then
      v_named := substring(sqlerrm from '^not a (?:bound path|field value): (.+)$');
      if v_named is null or v_tries > 50 then raise; end if;
      select coalesce(jsonb_agg(x.value), '[]'::jsonb) into v_gone
        from jsonb_array_elements(v_applied) x
       where x.value->>'path' = v_named or starts_with(x.value->>'path', v_named || '.')
             or starts_with(v_named, (x.value->>'path') || '.');
      -- The door named a path no press is on (a branch above a whole list): the presses under the
      -- unit it belongs to go, as nothing narrower can be told apart.
      if jsonb_array_length(v_gone) = 0 then
        select coalesce(jsonb_agg(x.value), '[]'::jsonb) into v_gone
          from jsonb_array_elements(v_applied) x, unnest(v_units) u
         where (v_named = u or starts_with(v_named, u || '.') or starts_with(u, v_named || '.'))
           and (x.value->>'path' = u or starts_with(x.value->>'path', u || '.'));
      end if;
      if jsonb_array_length(v_gone) = 0 then raise; end if;
      select v_refused || coalesce(jsonb_agg(jsonb_build_object('id', g.value->>'id', 'reason', sqlerrm)), '[]'::jsonb)
        into v_refused from jsonb_array_elements(v_gone) g;
      select coalesce(jsonb_agg(x.value), '[]'::jsonb) into v_applied
        from jsonb_array_elements(v_applied) x
       where not (x.value in (select g.value from jsonb_array_elements(v_gone) g));
    end;
  end loop;

  -- A press the door's answer does not hold (a leaf inside a list that nothing binds, which the
  -- door leaves alone) did not land: refused, never recorded.
  if v_result is not null then
    select coalesce(jsonb_agg(a.value), '[]'::jsonb) into v_refused
      from (select value from jsonb_array_elements(v_refused)
            union all
            select jsonb_build_object('id', x.value->>'id', 'reason', 'not a bound path: ' || (x.value->>'path'))
              from jsonb_array_elements(v_applied) x
             where (v_result->'data') #> string_to_array(x.value->>'path', '.')
                   is distinct from v_tree #> string_to_array(x.value->>'path', '.')) a;
    select coalesce(jsonb_agg(x.value), '[]'::jsonb) into v_applied
      from jsonb_array_elements(v_applied) x
     where (v_result->'data') #> string_to_array(x.value->>'path', '.')
           is not distinct from v_tree #> string_to_array(x.value->>'path', '.');
  end if;

  -- 6. The ids, the prune, the answer.
  insert into public.control_data_presses (show_id, press_id)
    select v_show, (x.value->>'id')::uuid from jsonb_array_elements(v_applied) x
    on conflict do nothing;
  delete from public.control_data_presses p
   where p.show_id = v_show and p.created_at < now() - interval '24 hours';
  select v_landed || coalesce(jsonb_agg(x.value->'id'), '[]'::jsonb) into v_landed from jsonb_array_elements(v_applied) x;
  if v_result is null then
    select jsonb_build_object('data', coalesce(s.data, '{}'::jsonb), 'writes', '[]'::jsonb) into v_result
      from public.control_shows s where s.id = v_show;
  end if;
  return jsonb_build_object('data', v_result->'data', 'writes', coalesce(v_result->'writes', '[]'::jsonb),
    'landed', v_landed, 'refused', v_refused);
end $$;
revoke execute on function public.control_data_adjust_by_slug(text, jsonb) from public;
grant execute on function public.control_data_adjust_by_slug(text, jsonb) to anon, authenticated, service_role;

-- ── 4. A Take's bound figures are the stored tree's at its row (R5a) ──────────────────────────
-- One `update` item with its bound fields rewritten: only keys already in `msg.data` that the
-- graphic binds to a path the tree holds. Every other key of the item and its message stays.
create or replace function public.control_bound_item(p_item jsonb, p_tree jsonb, p_bound jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_data jsonb;
  v_key text;
  v_path jsonb;
  v_text text;
begin
  if p_item->'msg'->>'t' is distinct from 'update' or jsonb_typeof(p_item->'msg'->'data') is distinct from 'object'
     or jsonb_typeof(p_bound) is distinct from 'object' then
    return p_item;
  end if;
  v_data := p_item->'msg'->'data';
  for v_key, v_path in select key, value from jsonb_each(p_bound) loop
    continue when not (v_data ? v_key) or jsonb_typeof(v_path) is distinct from 'string' or v_path #>> '{}' = '';
    v_text := public.production_data_format(p_tree #> string_to_array(v_path #>> '{}', '.'));
    continue when v_text is null;
    v_data := jsonb_set(v_data, array[v_key], to_jsonb(v_text));
  end loop;
  return jsonb_set(p_item, '{msg,data}', v_data);
end $$;
revoke execute on function public.control_bound_item(jsonb, jsonb, jsonb) from public, anon, authenticated;

-- 0071's body, with step 7b added after the skip filter; every other line as 0071 has it.
create or replace function public.control_send_seq(p_slug text, p_items jsonb, p_sender jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
  v_owner uuid;
  v_count int;
  v_item jsonb;
  v_sender uuid;
  v_press bigint;
  v_epoch uuid;
  v_all_out boolean;
  v_base jsonb;
  v_key text;
  v_head public.control_heads%rowtype;
  v_touched text[];
  v_g text;
  v_cur jsonb;
  v_mine boolean;
  v_cur_press numeric;
  v_stale text[] := '{}';
  v_wall bigint;
  v_panic jsonb;
  v_skip text[] := '{}';
  v_items jsonb;
  v_n int;
  v_recent int;
  v_graphics jsonb;
  v_recent_keys jsonb;
  v_from bigint;
  v_fast jsonb;
  v_tree jsonb;
  v_bindings jsonb;
begin
  -- 1. Who, and what: 0057's checks, word for word, then the sender.
  select s.id, s.owner_id into v_show, v_owner from public.control_shows s where s.slug = p_slug;
  if v_show is null then raise exception 'unknown control page'; end if;
  if public.feature_denied_for(v_owner, 'control.hosted') then
    raise exception 'hosted control is switched off for this page' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'not a command batch';
  end if;
  v_count := jsonb_array_length(p_items);
  if v_count < 1 or v_count > 8 then
    raise exception 'not a command batch';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(v_item->'msg'->>'t', '') not in ('update', 'play', 'stop', 'next', 'event', 'snap', 'cue')
       or coalesce(v_item->>'graphic', '') = '' then
      raise exception 'not a control command';
    end if;
  end loop;
  if p_sender is null or jsonb_typeof(p_sender) <> 'object'
     or coalesce(p_sender->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or jsonb_typeof(p_sender->'press') is distinct from 'number' then
    raise exception 'not a sender' using errcode = '22023';
  end if;
  v_sender := (p_sender->>'id')::uuid;
  v_press := (p_sender->>'press')::bigint;
  v_epoch := case when jsonb_typeof(p_sender->'epoch') = 'string' then (p_sender->>'epoch')::uuid end;
  v_all_out := coalesce(p_sender->'all_out' = 'true'::jsonb, false);
  v_base := case when jsonb_typeof(p_sender->'base') = 'object' then p_sender->'base' else '{}'::jsonb end;
  v_key := v_sender::text || ':' || v_press::text;
  select array_agg(distinct x.value->>'graphic') into v_touched from jsonb_array_elements(p_items) x;
  -- Each lock wait below is bounded at 1 s, which answers 55P03, and the page sends again: the
  -- send is idempotent, so that is safe. 1 s is below the page's 1.5 s attempt (failedSends.ts
  -- ATTEMPT_TIMEOUT_MS) less a round trip, so one stalled lock answers before the page gives up.
  -- The bound is per lock, not per call: a press that waits for the show row AND the head can take
  -- about 2 s, outlive its attempt and commit late. That is safe too: a resend of it is answered
  -- as a duplicate, and a later press of the same page already on the head skips it (step 6).
  perform set_config('lock_timeout', '1000', true);

  -- 2. The lock order: the production's row at KEY SHARE (a publish's or a report's NO KEY UPDATE
  --    passes it), then the head. The row can be gone since the lookup above (an unpublish).
  perform 1 from public.control_shows s where s.id = v_show for key share;
  if not found then raise exception 'unknown control page'; end if;
  insert into public.control_heads (show_id) values (v_show) on conflict (show_id) do nothing;
  select * into v_head from public.control_heads h where h.show_id = v_show for update;
  -- HOLDING THE HEAD, nothing may wait long: every other send and report of this production is
  -- queued behind it. What remains takes only this transaction's own rows and realtime.messages
  -- (the per-row log- broadcast, the seq- frame, the cmd- frame), each through realtime.send,
  -- which swallows a lock timeout into a warning: under a stall on realtime.messages each of them
  -- gives up after 250 ms and the head is free, and the press commits without that frame (its
  -- followers find the rows on the next frame or the 30 s poll, design K3).
  perform set_config('lock_timeout', '250ms', true);

  -- 3. A press already applied is answered as applied, and applied once.
  if v_head.recent ? v_key or (
       select bool_and(coalesce(v_head.graphics->t.name->>'by' = v_sender::text
                                and v_head.graphics->t.name->>'press' = v_press::text, false))
         from unnest(v_touched) as t(name)) then
    return jsonb_build_object('ok', true, 'duplicate', true, 'epoch', v_head.epoch,
      'head', jsonb_build_object('seq', v_head.seq, 'graphics', public.control_head_pick(v_head.graphics, v_touched)));
  end if;

  -- 4. A page following another epoch (the production was unpublished and published again) knows
  --    nothing current: it re-learns from this answer. Not All out, which is never refused.
  if v_epoch is not null and v_epoch <> v_head.epoch and not v_all_out then
    return jsonb_build_object('ok', false, 'refused', 'stale', 'why', 'epoch', 'epoch', v_head.epoch,
      'stale', to_jsonb(v_touched), 'graphics', public.control_head_pick(v_head.graphics, v_touched));
  end if;

  -- 5. Nothing a page pressed before its own All out airs after it. Every All out a sender lands
  --    leaves its press in the head (`panic`); a later-arriving press of that sender numbered below
  --    it is refused whole as superseded, whatever it touches: a Take queued behind another send
  --    must not put a graphic back on air after the panic control (review 2 ordering:F2).
  select max((p->>'p')::bigint) into v_wall
    from jsonb_array_elements(v_head.panic) p where p->>'s' = v_sender::text;
  if not v_all_out and v_wall is not null and v_press < v_wall then
    return jsonb_build_object('ok', false, 'refused', 'superseded', 'epoch', v_head.epoch,
      'stale', '[]'::jsonb, 'graphics', public.control_head_pick(v_head.graphics, v_touched));
  end if;

  -- 6. Per touched graphic. One this page has pressed again since (its own LATER press stands) is
  --    left as that press left it and named in `skipped`; the batch's other graphics still apply,
  --    so an Out of nine graphics loses none of them to a re-Take of one (review 3 client:F1).
  --    Otherwise it applies when nothing changed since this page last looked, or when every change
  --    since was this page's own earlier press. A change another screen made that this page had
  --    not seen refuses the whole batch as stale; All out is never refused.
  foreach v_g in array v_touched loop
    v_cur := case when jsonb_typeof(v_head.graphics->v_g) = 'object' then v_head.graphics->v_g else '{}'::jsonb end;
    v_mine := coalesce(v_cur->>'by' = v_sender::text, false);
    v_cur_press := case when jsonb_typeof(v_cur->'press') = 'number' then (v_cur->>'press')::numeric else 0 end;
    if v_mine and v_cur_press > v_press then
      v_skip := v_skip || v_g;
    elsif not v_all_out and not (
        (case when jsonb_typeof(v_base->v_g) = 'number' then (v_base->>v_g)::numeric else 0 end)
          = (case when jsonb_typeof(v_cur->'rev') = 'number' then (v_cur->>'rev')::numeric else 0 end)
        or (v_mine and v_cur_press < v_press)) then
      v_stale := v_stale || v_g;
    end if;
  end loop;
  if cardinality(v_stale) > 0 then
    return jsonb_build_object('ok', false, 'refused', 'stale', 'epoch', v_head.epoch,
      'stale', to_jsonb(v_stale),
      'graphics', public.control_head_pick(v_head.graphics, v_touched));
  end if;

  -- An All out raises its sender's panic mark, the newest 16 senders kept.
  v_panic := v_head.panic;
  if v_all_out then
    select coalesce(jsonb_agg(p order by o), '[]'::jsonb) into v_panic
      from jsonb_array_elements(v_head.panic) with ordinality x(p, o) where p->>'s' <> v_sender::text;
    v_panic := v_panic || jsonb_build_array(jsonb_build_object('s', v_sender::text, 'p', greatest(v_press, coalesce(v_wall, v_press))));
    while jsonb_array_length(v_panic) > 16 loop
      v_panic := v_panic - 0;
    end loop;
  end if;

  select coalesce(jsonb_agg(x.value order by x.ord), '[]'::jsonb) into v_items
    from jsonb_array_elements(p_items) with ordinality as x(value, ord)
   where not ((x.value->>'graphic') = any (v_skip));
  v_n := jsonb_array_length(v_items);
  if v_n = 0 then
    if v_all_out then
      update public.control_heads h set panic = v_panic, updated_at = now() where h.show_id = v_show;
    end if;
    return jsonb_build_object('ok', true, 'epoch', v_head.epoch, 'skipped', to_jsonb(v_skip),
      'head', jsonb_build_object('seq', v_head.seq, 'graphics', public.control_head_pick(v_head.graphics, v_touched)));
  end if;

  -- 7b. (0123, R5a) The bound figures are the stored tree's at this row. Read, as its own statement
  --     after the head lock, only when an `update` item carries data; a data write changes `data`
  --     before its own update rows take the head, so the row that lands last carries the newest.
  if exists (select 1 from jsonb_array_elements(v_items) x
              where x.value->'msg'->>'t' = 'update' and jsonb_typeof(x.value->'msg'->'data') = 'object'
                and x.value->'msg'->'data' <> '{}'::jsonb) then
    select s.data, s.bindings into v_tree, v_bindings from public.control_shows s where s.id = v_show;
    if jsonb_typeof(v_bindings) = 'object' and v_bindings <> '{}'::jsonb and jsonb_typeof(v_tree) = 'object' then
      select jsonb_agg(public.control_bound_item(x.value, v_tree, v_bindings->(x.value->>'graphic')) order by x.ord)
        into v_items
        from jsonb_array_elements(v_items) with ordinality as x(value, ord);
    end if;
  end if;

  -- 7. The burst cap, 0057's rule over at most the last 51 COMMAND rows (the (show_id, id) index),
  --    so it costs the same on a production with a long log. A renderer's report (`live`) is not
  --    an operator's command: counted, a burst of reports (every renderer re-banking after a
  --    republish) refused the operator's Takes (review 3 client:F2).
  select count(*) into v_recent
    from (select e.created_at from public.control_events e
           where e.show_id = v_show and e.msg->>'t' is distinct from 'live'
           order by e.id desc limit 51) t
   where t.created_at > now() - interval '5 seconds';
  if v_recent + v_n > 50 then
    raise exception 'too many commands — slow down' using errcode = 'check_violation';
  end if;

  -- 8. The numbers and the summary, in one write of the head.
  v_graphics := v_head.graphics;
  for v_item in select x.value from jsonb_array_elements(v_items) with ordinality as x(value, ord) order by x.ord loop
    v_graphics := public.control_head_effect(v_graphics, v_item->>'graphic', v_item->'msg', v_sender::text, v_press);
  end loop;
  v_recent_keys := v_head.recent || to_jsonb(v_key);
  if jsonb_array_length(v_recent_keys) > 64 then
    v_recent_keys := v_recent_keys - 0;
  end if;
  v_from := v_head.seq + 1;
  update public.control_heads h
     set seq = v_head.seq + v_n, graphics = v_graphics, recent = v_recent_keys, panic = v_panic, updated_at = now()
   where h.show_id = v_show;

  -- 9. The rows, numbered, in ONE statement: one frame on seq-<show id>.
  insert into public.control_events (show_id, graphic, msg, seq, created_at)
    select v_show, x.value->>'graphic', x.value->'msg', v_from + x.ord - 1, clock_timestamp()
      from jsonb_array_elements(v_items) with ordinality as x(value, ord)
     order by x.ord;

  -- 10. The fast frame on cmd-<show id>, exactly as 0057 sends it, for old followers.
  select jsonb_agg(jsonb_build_object('graphic', x.value->>'graphic', 'msg', x.value->'msg') order by x.ord)
    into v_fast
    from jsonb_array_elements(v_items) with ordinality as x(value, ord)
   where x.value->'fast' = 'true'::jsonb;
  if v_fast is not null then
    perform realtime.send(jsonb_build_object('items', v_fast), 'cmd', 'cmd-' || v_show::text, true);
  end if;

  -- 11. What this press made of the touched graphics.
  return jsonb_build_object('ok', true, 'epoch', v_head.epoch, 'seq_from', v_from, 'seq_to', v_from + v_n - 1,
    'skipped', to_jsonb(v_skip),
    'head', jsonb_build_object('seq', v_from + v_n - 1, 'graphics', public.control_head_pick(v_graphics, v_touched)));
end $$;
grant execute on function public.control_send_seq(text, jsonb, jsonb) to anon, authenticated;

-- ── 5. Prove it, or refuse to apply ───────────────────────────────────────────────────────────
-- CALLS each path on a throwaway production, as a signed-out page would (supabase/AGENTS.md).
do $$
declare
  v_role  text := current_role;
  v_owner uuid;
  v_show  uuid := gen_random_uuid();
  v_slug  text;
  v_page  uuid := '00000000-0123-4000-8000-00000000000a';
  v_a     text := '00000000-0123-4000-8000-000000000001';
  v_b     text := '00000000-0123-4000-8000-000000000002';
  v_c     text := '00000000-0123-4000-8000-000000000003';
  v_d     text := '00000000-0123-4000-8000-000000000004';
  v_ans   jsonb;
  v_row   jsonb;
begin
  -- (a) SHAPE, including what a client must NOT reach.
  if not has_function_privilege('anon', 'public.control_data_adjust_by_slug(text,jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'public.control_data_adjust_by_slug(text,jsonb)', 'execute')
     or not has_function_privilege('anon', 'public.control_send_seq(text,jsonb,jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'public.control_send_seq(text,jsonb,jsonb)', 'execute')
     or not has_function_privilege('anon', 'public.control_data_patch_by_slug(text,jsonb)', 'execute') then
    raise exception '0123 self-check failed: a page cannot reach an RPC it needs';
  end if;
  if has_function_privilege('anon', 'public.control_bound_item(jsonb,jsonb,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.production_data_adjusted(jsonb,numeric)', 'execute')
     or has_function_privilege('authenticated', 'public.production_data_set_text(jsonb,text)', 'execute')
     or has_table_privilege('anon', 'public.control_data_presses', 'select')
     or has_table_privilege('authenticated', 'public.control_data_presses', 'insert')
     or not (select c.relrowsecurity from pg_class c where c.oid = 'public.control_data_presses'::regclass) then
    raise exception '0123 self-check failed: a client can reach an internal function or the press ids';
  end if;

  -- (b) CALL it, as an owner hosted control is open to.
  select u.id into v_owner from auth.users u where not public.feature_denied_for(u.id, 'control.hosted') limit 1;
  if v_owner is null then
    raise notice '0123 self-check skipped the live half: no account on this instance may use hosted control';
    return;
  end if;
  insert into public.control_shows (id, owner_id, title, output, data, bindings)
    values (v_show, v_owner, '0123 self-check', '{"v":1,"graphics":[{"key":"Score"}],"cues":[]}'::jsonb,
            '{"home":{"score":4},"teams":[{"g":1},{"g":"2"}],"label":"x","grid":[]}'::jsonb,
            '{"Score":{"f1":"home.score","f2":"teams.0.g","f3":"teams.1.g","f4":"grid.0.gap"}}'::jsonb)
    returning slug into v_slug;
  set local role anon;

  -- Two adjusts and a set on one path, folded in order; two leaves under one list in one call.
  v_ans := public.control_data_adjust_by_slug(v_slug, jsonb_build_array(
    jsonb_build_object('id', v_a, 'path', 'home.score', 'by', 1),
    jsonb_build_object('id', v_b, 'path', 'teams.0.g', 'by', 2),
    jsonb_build_object('id', v_c, 'path', 'teams.1.g', 'by', 3)));
  if v_ans->'data'->'home'->'score' <> '5'::jsonb or v_ans->'data'->'teams' <> '[{"g":3},{"g":"5"}]'::jsonb
     or jsonb_array_length(v_ans->'landed') <> 3 or v_ans->'refused' <> '[]'::jsonb then
    raise exception '0123 self-check failed: the presses did not fold (%)', v_ans;
  end if;
  -- The same ids again: landed, applied once.
  v_ans := public.control_data_adjust_by_slug(v_slug, jsonb_build_array(
    jsonb_build_object('id', v_a, 'path', 'home.score', 'by', 1)));
  if v_ans->'data'->'home'->'score' <> '5'::jsonb or v_ans->'landed' <> jsonb_build_array(v_a) then
    raise exception '0123 self-check failed: a resend counted twice (%)', v_ans;
  end if;
  -- An unbound path refuses its own press only; a set keeps the leaf's type.
  v_ans := public.control_data_adjust_by_slug(v_slug, jsonb_build_array(
    jsonb_build_object('id', v_d, 'path', 'label', 'by', 1),
    jsonb_build_object('id', gen_random_uuid(), 'path', 'home.score', 'text', '0')));
  if v_ans->'data'->'home'->'score' <> '0'::jsonb or v_ans->'data'->>'label' <> 'x'
     or jsonb_array_length(v_ans->'refused') <> 1 or v_ans->'refused'->0->>'id' <> v_d then
    raise exception '0123 self-check failed: an unbound path (%)', v_ans;
  end if;

  -- A list element that does not exist yet is made, as the page's setPath makes it.
  v_ans := public.control_data_adjust_by_slug(v_slug, jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'path', 'grid.0.gap', 'by', 2)));
  if v_ans->'data'->'grid' <> '[{"gap":2}]'::jsonb or jsonb_array_length(v_ans->'landed') <> 1 then
    raise exception '0123 self-check failed: a press on a new list element (%)', v_ans;
  end if;
  -- One list leaf the door refuses (not a field value) keeps its valid sibling in the same list.
  v_ans := public.control_data_adjust_by_slug(v_slug, jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'path', 'teams.0.g', 'by', 1),
    jsonb_build_object('id', gen_random_uuid(), 'path', 'teams.1.g.deep', 'by', 1)));
  if v_ans->'data'->'teams'->0->'g' <> '4'::jsonb or jsonb_array_length(v_ans->'landed') <> 1 then
    raise exception '0123 self-check failed: a refused list leaf dropped its sibling (%)', v_ans;
  end if;
  -- A leaf inside a list that nothing binds is not held by the answer: refused, never landed.
  v_ans := public.control_data_adjust_by_slug(v_slug, jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'path', 'teams.0.other', 'by', 1)));
  if jsonb_array_length(v_ans->'landed') <> 0 or jsonb_array_length(v_ans->'refused') <> 1 then
    raise exception '0123 self-check failed: an unbound leaf in a list landed (%)', v_ans;
  end if;

  -- (c) A Take's bound field carries the stored figure; an unbound one and every other key stay.
  v_ans := public.control_send_seq(v_slug,
    '[{"graphic":"Score","msg":{"t":"update","data":{"f1":"9","f9":"keep"},"oid":"o-1"}},{"graphic":"Score","msg":{"t":"play"}}]'::jsonb,
    jsonb_build_object('id', v_page, 'press', 1, 'base', '{}'::jsonb));
  if v_ans->>'ok' <> 'true' then raise exception '0123 self-check failed: the Take was refused (%)', v_ans; end if;
  execute format('set local role %I', v_role);
  select e.msg into v_row from public.control_events e
   where e.show_id = v_show and e.msg->>'t' = 'update' and e.msg->>'oid' = 'o-1';
  if v_row is distinct from '{"t":"update","data":{"f1":"0","f9":"keep"},"oid":"o-1"}'::jsonb then
    raise exception '0123 self-check failed: the Take row (%)', v_row;
  end if;
  -- An update with no data and a graphic nothing binds, beside one that is bound: both as sent.
  set local role anon;
  v_ans := public.control_send_seq(v_slug,
    '[{"graphic":"Score","msg":{"t":"update","data":{"f1":"9"},"oid":"o-2"}},{"graphic":"Score","msg":{"t":"update","oid":"o-3"}},{"graphic":"Other","msg":{"t":"update","data":{"f1":"7"},"oid":"o-4"}}]'::jsonb,
    jsonb_build_object('id', v_page, 'press', 2, 'base', '{}'::jsonb));
  if v_ans->>'ok' <> 'true' then raise exception '0123 self-check failed: a mixed batch was refused (%)', v_ans; end if;
  execute format('set local role %I', v_role);
  if (select count(*) from public.control_events e where e.show_id = v_show and e.msg->>'oid' in ('o-2', 'o-3', 'o-4')) <> 3
     or (select e.msg from public.control_events e where e.show_id = v_show and e.msg->>'oid' = 'o-3') is distinct from '{"t":"update","oid":"o-3"}'::jsonb
     or (select e.msg->'data'->>'f1' from public.control_events e where e.show_id = v_show and e.msg->>'oid' = 'o-4') is distinct from '7' then
    raise exception '0123 self-check failed: a mixed batch was not sent as it came';
  end if;
  delete from public.control_shows where id = v_show;
exception when others then
  execute format('set local role %I', v_role);
  raise;
end $$;
