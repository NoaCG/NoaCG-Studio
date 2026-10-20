-- MESSAGES THE OPERATOR ADDS - pasted now, imported later (docs/work-specs/data-sources/spec.md,
-- phase C0, "Operator insert").
--
-- A published production's inbox is 0035's `audience_submissions`, and until now only a viewer
-- could put a row in it, through `audience_submit` behind the JOIN slug, an open round and the
-- viewer caps. None of that applies to an operator pasting a message from a chat window, so this
-- adds the operator's own door: `audience_operator_add(p_slug, p_items)`, keyed on the CONTROL
-- slug and resolved by `audience_owner_for_control`, so the capability and the kill switch are
-- checked exactly as for every other operator function. It inserts candidates and nothing else:
-- no command-log row, no production value. A candidate airs only as a cue the operator prepares
-- and takes, as every message does.
--
-- Its own bound: at most 100 items a call, each clamped to the 0035 limits (author 40, body 500).
-- Three optional provenance columns ride with each row - `external_id` (the platform's id for an
-- imported item; an id already in this production's inbox is skipped), `source` (a label such as
-- "Pasted") and `reference` (a private note such as a phone number). They are shown small to the
-- operator and never put on a graphic. C3 adds the unique index on `external_id`.
--
-- The guard trigger keeps every viewer cap. The two burst caps count arrivals per production and
-- per device, which a 100-row paste would trip by design, so they are skipped for a row this
-- function inserts: it raises a transaction-local flag around its own insert. A client cannot
-- raise it - PostgREST sets only `request.*` settings, and no exposed function sets this one.
--
-- `audience_list` gains the three columns. A table function's columns cannot change in place, so
-- it is dropped and recreated in this one transaction; a client that reads the old columns by name
-- is unaffected.
--
-- Additive and live-safe: nullable columns, one new function, two functions widened. Revert: drop
-- `audience_operator_add`, restore 0035's `audience_guard` and `audience_list`, drop the columns.

set lock_timeout = '2s';
set statement_timeout = '30s';

alter table public.audience_submissions
  add column if not exists external_id text,
  add column if not exists source      text,
  add column if not exists reference   text;

-- 0035's guard, unchanged for a viewer's row; an operator's row skips the burst caps, and every
-- row's provenance is trimmed and capped (empty is null).
create or replace function public.audience_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  recent_show   int;
  recent_device int;
  bad           text;
  operator_row  boolean := coalesce(current_setting('noacg.audience_operator', true), '') = 'on';
begin
  if new.device_token !~ '^[A-Za-z0-9_-]{8,128}$' then
    raise exception 'invalid device' using errcode = 'check_violation';
  end if;
  new.author := btrim(left(coalesce(new.author, ''), 40));
  new.body   := btrim(left(coalesce(new.body, ''), 500));
  if new.body = '' then
    raise exception 'nothing to send' using errcode = 'check_violation';
  end if;
  new.external_id := nullif(btrim(left(coalesce(new.external_id, ''), 200)), '');
  new.source      := nullif(btrim(left(coalesce(new.source, ''), 60)), '');
  new.reference   := nullif(btrim(left(coalesce(new.reference, ''), 200)), '');

  if not operator_row then
    select count(*) into recent_show from public.audience_submissions
      where show_id = new.show_id and created_at > now() - interval '10 seconds';
    if recent_show >= 20 then
      raise exception 'too many messages' using errcode = 'check_violation';
    end if;
    select count(*) into recent_device from public.audience_submissions
      where show_id = new.show_id and device_token = new.device_token
        and created_at > now() - interval '30 seconds';
    if recent_device >= 3 then
      raise exception 'too many messages' using errcode = 'check_violation';
    end if;
  end if;

  for bad in select word from public.chat_blocklist loop
    new.body := regexp_replace(new.body, bad, repeat('*', char_length(bad)), 'gi');
  end loop;

  new.broadcast_author := new.author;
  new.broadcast_body   := new.body;
  new.status           := 'new';
  new.shortlisted      := false;
  new.used_at          := null;
  new.skipped_at       := null;
  new.moderated_at     := null;
  return new;
end $$;
revoke execute on function public.audience_guard() from public, anon, authenticated;

drop function if exists public.audience_list(text);
create function public.audience_list(p_slug text)
returns table (
  id uuid, created_at timestamptz, author text, body text,
  broadcast_author text, broadcast_body text, anonymize boolean,
  status text, shortlisted boolean, used_at timestamptz, skipped_at timestamptz,
  external_id text, source text, reference text
) language plpgsql security definer set search_path = '' stable as $$
declare
  v_show uuid;
begin
  select o.show_id into v_show from public.audience_owner_for_control(p_slug) o;
  -- device_token is deliberately NOT selected (0035): the operator moderates words, not devices.
  return query
    select x.id, x.created_at, x.author, x.body, x.broadcast_author, x.broadcast_body,
           x.anonymize, x.status, x.shortlisted, x.used_at, x.skipped_at,
           x.external_id, x.source, x.reference
    from public.audience_submissions x
    where x.show_id = v_show
    order by x.created_at;
end $$;
revoke execute on function public.audience_list(text) from public;
grant execute on function public.audience_list(text) to anon, authenticated;

-- The operator's insert. `p_items` is a JSON array of { author?, body, external_id?, source?,
-- reference? }. Returns the rows it added, in the shape `audience_list` returns.
create or replace function public.audience_operator_add(p_slug text, p_items jsonb)
returns table (
  id uuid, created_at timestamptz, author text, body text,
  broadcast_author text, broadcast_body text, anonymize boolean,
  status text, shortlisted boolean, used_at timestamptz, skipped_at timestamptz,
  external_id text, source text, reference text
) language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
  v_item jsonb;
  v_ext  text;
  v_row  public.audience_submissions%rowtype;
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'items must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'at most 100 messages at a time' using errcode = '22023';
  end if;
  select o.show_id into v_show from public.audience_owner_for_control(p_slug) o;

  perform set_config('noacg.audience_operator', 'on', true);
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or btrim(coalesce(v_item->>'body', '')) = '' then
      continue;
    end if;
    v_ext := nullif(btrim(left(coalesce(v_item->>'external_id', ''), 200)), '');
    if v_ext is not null and exists (
      select 1 from public.audience_submissions x where x.show_id = v_show and x.external_id = v_ext
    ) then
      continue;
    end if;
    insert into public.audience_submissions (show_id, author, body, device_token, external_id, source, reference)
      values (
        v_show,
        coalesce(v_item->>'author', ''),
        v_item->>'body',
        'operator_' || replace(gen_random_uuid()::text, '-', ''),
        v_ext,
        v_item->>'source',
        v_item->>'reference'
      )
      returning * into v_row;
    id := v_row.id; created_at := v_row.created_at; author := v_row.author; body := v_row.body;
    broadcast_author := v_row.broadcast_author; broadcast_body := v_row.broadcast_body;
    anonymize := v_row.anonymize; status := v_row.status; shortlisted := v_row.shortlisted;
    used_at := v_row.used_at; skipped_at := v_row.skipped_at;
    external_id := v_row.external_id; source := v_row.source; reference := v_row.reference;
    return next;
  end loop;
  perform set_config('noacg.audience_operator', 'off', true);
end $$;
revoke execute on function public.audience_operator_add(text, jsonb) from public;
grant execute on function public.audience_operator_add(text, jsonb) to anon, authenticated;

-- ── Self-check ───────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_result text;
  v_leak   text;
  v_def    text;
begin
  -- (a) The three columns exist and are nullable.
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'audience_submissions'
         and column_name in ('external_id', 'source', 'reference') and is_nullable = 'YES') <> 3 then
    raise exception 'audience operator self-check failed: the provenance columns are missing or not nullable';
  end if;

  -- (b) The list returns them, and still nothing a capability must not see.
  v_result := pg_get_function_result(to_regprocedure('public.audience_list(text)'));
  if v_result not like '%external_id%' or v_result not like '%source%' or v_result not like '%reference%' then
    raise exception 'audience operator self-check failed: audience_list returns %', v_result;
  end if;
  for v_result in
    select pg_get_function_result(to_regprocedure(p)) from unnest(array[
      'public.audience_list(text)', 'public.audience_operator_add(text, jsonb)'
    ]) as p
  loop
    for v_leak in select w from unnest(array['show_id', 'slug', 'correct', 'counts', 'device', 'staged', 'output']) as w
    loop
      if v_result like '%' || v_leak || '%' then
        raise exception 'audience operator self-check failed: an operator read returns % (%)', v_leak, v_result;
      end if;
    end loop;
  end loop;

  -- (c) The operator insert resolves the CONTROL slug through 0035's resolver and reaches no
  --     command log and no production value.
  v_def := pg_get_functiondef(to_regprocedure('public.audience_operator_add(text, jsonb)'));
  if v_def not like '%audience_owner_for_control(p_slug)%' then
    raise exception 'audience operator self-check failed: audience_operator_add does not resolve the control slug';
  end if;
  if v_def like '%control_events%' or v_def like '%control_data%' or v_def like '%join_slug%' then
    raise exception 'audience operator self-check failed: audience_operator_add reaches past the inbox';
  end if;

  -- (d) Behaviour, without a production: the bound is refused, and an unknown slug is refused.
  begin
    perform public.audience_operator_add(
      'no-such-control-page',
      (select jsonb_agg(jsonb_build_object('body', 'x')) from generate_series(1, 101))
    );
    raise exception 'audience operator self-check failed: 101 items were accepted';
  exception when sqlstate '22023' then
    null;
  end;
  begin
    perform public.audience_operator_add('no-such-control-page', '[{"body": "hello"}]'::jsonb);
    raise exception 'audience operator self-check failed: an unknown control slug was accepted';
  exception when raise_exception then
    if sqlerrm like 'audience operator self-check failed%' then raise; end if;
  end;

  -- (e) The trigger and the resolver stay unreachable from a client role.
  for v_leak in select p from unnest(array['public.audience_guard()', 'public.audience_owner_for_control(text)']) as p
  loop
    if has_function_privilege('anon', v_leak, 'execute')
       or has_function_privilege('authenticated', v_leak, 'execute') then
      raise exception 'audience operator self-check failed: % is callable by a client role', v_leak;
    end if;
  end loop;
end $$;

-- Prove the BODY (supabase/AGENTS.md, "CALL the thing"): a throwaway production against a real
-- owner takes 25 pasted items in one call - past the viewer burst cap of 20, which an operator's
-- paste must not meet - with one repeated external id skipped, and writes no command-log row.
do $$
declare
  v_owner uuid;
  v_show  uuid := '00000000-0095-4000-8000-000000000095';
  v_slug  text;
  v_items jsonb;
  v_added int;
begin
  select id into v_owner from auth.users limit 1;
  if v_owner is null then
    raise notice 'audience_operator_add self-check skipped: no account on this instance';
    return;
  end if;
  insert into public.control_shows (id, owner_id, title) values (v_show, v_owner, 'Operator add self-check');
  select slug into v_slug from public.control_shows where id = v_show;

  v_items := (select jsonb_agg(jsonb_build_object('author', 'Sam', 'body', 'Message ' || n, 'source', 'Pasted',
                                                  'reference', '+358 40 000 ' || n, 'external_id', 'x' || n))
              from generate_series(1, 24) n)
             || '[{"body": "Repeat", "external_id": "x1"}, {"body": "   "}]'::jsonb;
  select count(*) into v_added from public.audience_operator_add(v_slug, v_items);
  if v_added <> 24 then
    raise exception 'audience operator self-check failed: % of 24 items were added', v_added;
  end if;
  if (select count(*) from public.audience_list(v_slug) l where l.source = 'Pasted' and l.status = 'new'
        and l.reference like '+358%') <> 24 then
    raise exception 'audience operator self-check failed: the list does not return the pasted rows with their provenance';
  end if;
  if exists (select 1 from public.control_events e where e.show_id = v_show) then
    raise exception 'audience operator self-check failed: adding messages wrote to the command log';
  end if;

  delete from public.control_shows where id = v_show;
end $$;
