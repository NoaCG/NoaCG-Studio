-- IMPORTED MESSAGES KEEP ONE IDENTITY (docs/work-specs/data-sources/spec.md, phase C3; audience
-- spec, "Identity").
--
-- C0's `audience_operator_add` (0095) skips an item whose `external_id` is already in the
-- production's inbox, by looking first. Two pages adding the same Sheet row or YouTube comment at
-- the same moment could both look, find nothing and both insert. This file makes the identity the
-- database's own: a unique index per production on `external_id`, and the insert skips a clash
-- (`on conflict do nothing`) instead of failing the whole batch.
--
-- A message Sheet is read whole, so its rows also LEAVE. `audience_operator_settle(p_slug,
-- p_prefix, p_present)` takes one Sheet source's rows as they stand now (their external ids, all
-- under the prefix `sheet:<source id>:`) and applies the audience spec's rule: an unused candidate
-- whose row is gone leaves the inbox; a used one is the operator's record, keeps its original and
-- is marked `withdrawn_at` ("no longer in the Sheet"); a withdrawn one whose row is back is
-- unmarked. It adds nothing (arrivals go through `audience_operator_add`), touches only rows under
-- a Sheet prefix of this production, and reaches no command log and no production value. Its
-- bound: 2,000 ids a call, the longest message Sheet the page follows.
--
-- `audience_list` and `audience_operator_add` return `withdrawn_at` too. A table function's
-- columns cannot change in place, so each is dropped and recreated in this file.
--
-- HOW THIS FILE RUNS. `create index concurrently` cannot run in a transaction; the CLI commits
-- the statements before it, runs it alone, then runs the rest with the ledger row
-- (supabase/AGENTS.md, "A concurrent statement runs on its own"; 0074 is the worked example).
--   1. the timeouts, the new column, a duplicate id cleared (below), and the drop of a leftover
--      index from a failed build;
--   2. the build: SHARE UPDATE EXCLUSIVE on audience_submissions, which no insert or read waits on;
--   3. the proof the index is valid, the three functions and the self-checks.
-- If the build fails (a duplicate inserted after step 1), nothing after it applies and the next
-- landing retries from the top, where step 1 clears it.
--
-- Additive: a nullable column, an index, one new function, two functions widened. Revert: drop
-- `audience_operator_settle` and the index, restore 0095's `audience_list` and
-- `audience_operator_add`, drop the column.

set lock_timeout = '2s';
set statement_timeout = '30s';

alter table public.audience_submissions
  add column if not exists withdrawn_at timestamptz;

-- A duplicate already in the table (C0's look-first insert could let two simultaneous adds of one
-- id through) would fail the unique build. The first row of each pair keeps the id; a later one
-- keeps its row, its text and its moderation, and gives up only the id it shared, so it becomes an
-- ordinary candidate that no source settles. Nothing is deleted. A clash inserted by an old page
-- between this and the build fails the build, and the file re-run from the top clears it.
update public.audience_submissions x set external_id = null
 where x.external_id is not null
   and exists (
     select 1 from public.audience_submissions y
      where y.show_id = x.show_id and y.external_id = x.external_id
        and (y.created_at, y.id) < (x.created_at, x.id));

drop index if exists public.audience_submissions_external_idx;

set statement_timeout = '5min';

create unique index concurrently audience_submissions_external_idx
  on public.audience_submissions (show_id, external_id) where external_id is not null;

set statement_timeout = '30s';

do $$
begin
  if not exists (
    select 1 from pg_index i
     where i.indexrelid = to_regclass('public.audience_submissions_external_idx')
       and i.indisvalid and i.indisready and i.indisunique) then
    raise exception '0098: audience_submissions_external_idx is missing or invalid after its build';
  end if;
end $$;

drop function if exists public.audience_list(text);
create function public.audience_list(p_slug text)
returns table (
  id uuid, created_at timestamptz, author text, body text,
  broadcast_author text, broadcast_body text, anonymize boolean,
  status text, shortlisted boolean, used_at timestamptz, skipped_at timestamptz,
  external_id text, source text, reference text, withdrawn_at timestamptz
) language plpgsql security definer set search_path = '' stable as $$
declare
  v_show uuid;
begin
  select o.show_id into v_show from public.audience_owner_for_control(p_slug) o;
  -- device_token is deliberately NOT selected (0035): the operator moderates words, not devices.
  return query
    select x.id, x.created_at, x.author, x.body, x.broadcast_author, x.broadcast_body,
           x.anonymize, x.status, x.shortlisted, x.used_at, x.skipped_at,
           x.external_id, x.source, x.reference, x.withdrawn_at
    from public.audience_submissions x
    where x.show_id = v_show
    order by x.created_at;
end $$;
revoke execute on function public.audience_list(text) from public;
grant execute on function public.audience_list(text) to anon, authenticated;

-- 0095's insert, with the clash skipped by the index rather than only by the look before it.
drop function if exists public.audience_operator_add(text, jsonb);
create function public.audience_operator_add(p_slug text, p_items jsonb)
returns table (
  id uuid, created_at timestamptz, author text, body text,
  broadcast_author text, broadcast_body text, anonymize boolean,
  status text, shortlisted boolean, used_at timestamptz, skipped_at timestamptz,
  external_id text, source text, reference text, withdrawn_at timestamptz
) language plpgsql security definer set search_path = '' as $$
-- The conflict target names columns that are also this function's OUT names (`external_id`), and
-- an index target cannot be table-qualified: inside SQL here a bare name is the column.
#variable_conflict use_column
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
      on conflict (show_id, external_id) where external_id is not null do nothing
      returning * into v_row;
    if not found then
      continue;
    end if;
    id := v_row.id; created_at := v_row.created_at; author := v_row.author; body := v_row.body;
    broadcast_author := v_row.broadcast_author; broadcast_body := v_row.broadcast_body;
    anonymize := v_row.anonymize; status := v_row.status; shortlisted := v_row.shortlisted;
    used_at := v_row.used_at; skipped_at := v_row.skipped_at;
    external_id := v_row.external_id; source := v_row.source; reference := v_row.reference;
    withdrawn_at := v_row.withdrawn_at;
    return next;
  end loop;
  perform set_config('noacg.audience_operator', 'off', true);
end $$;
revoke execute on function public.audience_operator_add(text, jsonb) from public;
grant execute on function public.audience_operator_add(text, jsonb) to anon, authenticated;

-- One Sheet source's rows as they stand now. Returns how many candidates it changed.
create or replace function public.audience_operator_settle(p_slug text, p_prefix text, p_present text[])
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_show    uuid;
  v_present text[] := coalesce(p_present, '{}');
  v_count   integer;
  v_changed integer := 0;
begin
  if p_prefix is null or p_prefix !~ '^sheet:[A-Za-z0-9_-]{1,80}:$' then
    raise exception 'not an imported source' using errcode = '22023';
  end if;
  if cardinality(v_present) > 2000 then
    raise exception 'at most 2000 rows at a time' using errcode = '22023';
  end if;
  select o.show_id into v_show from public.audience_owner_for_control(p_slug) o;

  -- A plain prefix compare: `_` in a source id is a LIKE wildcard.
  delete from public.audience_submissions x
   where x.show_id = v_show and left(x.external_id, length(p_prefix)) = p_prefix
     and x.used_at is null and not (x.external_id = any(v_present));
  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  update public.audience_submissions x set withdrawn_at = now()
   where x.show_id = v_show and left(x.external_id, length(p_prefix)) = p_prefix
     and x.used_at is not null and x.withdrawn_at is null and not (x.external_id = any(v_present));
  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  update public.audience_submissions x set withdrawn_at = null
   where x.show_id = v_show and left(x.external_id, length(p_prefix)) = p_prefix
     and x.withdrawn_at is not null and x.external_id = any(v_present);
  get diagnostics v_count = row_count;
  return v_changed + v_count;
end $$;
revoke execute on function public.audience_operator_settle(text, text, text[]) from public;
grant execute on function public.audience_operator_settle(text, text, text[]) to anon, authenticated;

-- ── Self-check ───────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_result text;
  v_leak   text;
  v_def    text;
begin
  -- (a) The column is nullable; the index is unique per production and partial.
  if not exists (select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'audience_submissions'
         and column_name = 'withdrawn_at' and is_nullable = 'YES') then
    raise exception 'audience identity self-check failed: withdrawn_at is missing or not nullable';
  end if;
  if pg_get_indexdef(to_regclass('public.audience_submissions_external_idx'))
     not like '%UNIQUE%(show_id, external_id) WHERE (external_id IS NOT NULL)%' then
    raise exception 'audience identity self-check failed: the index is %',
      pg_get_indexdef(to_regclass('public.audience_submissions_external_idx'));
  end if;

  -- (b) Both reads return the mark, and still nothing a capability must not see.
  for v_result in
    select pg_get_function_result(to_regprocedure(p)) from unnest(array[
      'public.audience_list(text)', 'public.audience_operator_add(text, jsonb)'
    ]) as p
  loop
    if v_result not like '%withdrawn_at%' then
      raise exception 'audience identity self-check failed: a read returns %', v_result;
    end if;
    for v_leak in select w from unnest(array['show_id', 'slug', 'correct', 'counts', 'device', 'staged', 'output']) as w
    loop
      if v_result like '%' || v_leak || '%' then
        raise exception 'audience identity self-check failed: an operator read returns % (%)', v_leak, v_result;
      end if;
    end loop;
  end loop;

  -- (c) The settle resolves the CONTROL slug and reaches no command log and no production value.
  v_def := pg_get_functiondef(to_regprocedure('public.audience_operator_settle(text, text, text[])'));
  if v_def not like '%audience_owner_for_control(p_slug)%' then
    raise exception 'audience identity self-check failed: audience_operator_settle does not resolve the control slug';
  end if;
  if v_def like '%control_events%' or v_def like '%control_data%' or v_def like '%join_slug%' then
    raise exception 'audience identity self-check failed: audience_operator_settle reaches past the inbox';
  end if;

  -- (d) Its bounds, without a production: a prefix that is not a Sheet source's, and 2,001 ids.
  begin
    perform public.audience_operator_settle('no-such-control-page', 'yt:', '{}');
    raise exception 'audience identity self-check failed: a non-Sheet prefix was accepted';
  exception when sqlstate '22023' then
    null;
  end;
  begin
    perform public.audience_operator_settle('no-such-control-page', 'sheet:s1:',
      (select array_agg('sheet:s1:' || n) from generate_series(1, 2001) n));
    raise exception 'audience identity self-check failed: 2001 ids were accepted';
  exception when sqlstate '22023' then
    null;
  end;
end $$;

-- Prove the BODIES (supabase/AGENTS.md, "CALL the thing"): on a throwaway production against a
-- real owner, a repeated external id adds one row; a settle without a row removes the unused
-- candidate, marks the used one and leaves another source's and a pasted one alone; the row's
-- return unmarks it; nothing reaches the command log.
do $$
declare
  v_owner uuid;
  v_show  uuid := '00000000-0098-4000-8000-000000000098';
  v_slug  text;
  v_added int;
begin
  select id into v_owner from auth.users limit 1;
  if v_owner is null then
    raise notice 'audience identity self-check skipped: no account on this instance';
    return;
  end if;
  insert into public.control_shows (id, owner_id, title) values (v_show, v_owner, 'Audience identity self-check');
  select slug into v_slug from public.control_shows where id = v_show;

  select count(*) into v_added from public.audience_operator_add(v_slug,
    '[{"body": "a", "external_id": "sheet:s1:a#0"}, {"body": "a again", "external_id": "sheet:s1:a#0"},
      {"body": "b", "external_id": "sheet:s1:b#0"}, {"body": "c", "external_id": "sheet:s2:c#0"},
      {"body": "pasted", "source": "Pasted"}]'::jsonb);
  if v_added <> 4 then
    raise exception 'audience identity self-check failed: % of 4 distinct items were added', v_added;
  end if;
  update public.audience_submissions set used_at = now() where show_id = v_show and external_id = 'sheet:s1:b#0';

  perform public.audience_operator_settle(v_slug, 'sheet:s1:', '{}');
  if exists (select 1 from public.audience_submissions where show_id = v_show and external_id = 'sheet:s1:a#0') then
    raise exception 'audience identity self-check failed: an unused candidate outlived its row';
  end if;
  if not exists (select 1 from public.audience_list(v_slug) l where l.external_id = 'sheet:s1:b#0' and l.withdrawn_at is not null) then
    raise exception 'audience identity self-check failed: a used candidate was not kept and marked';
  end if;
  if (select count(*) from public.audience_list(v_slug) l where l.external_id = 'sheet:s2:c#0' or l.source = 'Pasted') <> 2 then
    raise exception 'audience identity self-check failed: the settle reached past its own source';
  end if;

  perform public.audience_operator_settle(v_slug, 'sheet:s1:', array['sheet:s1:b#0']);
  if exists (select 1 from public.audience_submissions where show_id = v_show and withdrawn_at is not null) then
    raise exception 'audience identity self-check failed: a row back in the Sheet stayed withdrawn';
  end if;
  if exists (select 1 from public.control_events e where e.show_id = v_show) then
    raise exception 'audience identity self-check failed: the inbox wrote to the command log';
  end if;

  delete from public.control_shows where id = v_show;
end $$;
