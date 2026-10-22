-- live-path: control_data_tick_due also lists published feed sources (same signature, same grants; its only caller is the server tick)
--
-- NEWS FEEDS: ONE CACHED READ PER ADDRESS (docs/work-specs/data-sources/spec.md, phase C4, "One
-- cached read per address across serverless instances"; AC-5, AC-6).
--
-- `feed_cache` holds one row per normalized feed address, keyed by the address's SHA-256: the last
-- good headlines (plain text, newest first, at most 20), the feed's ETag and Last-Modified for the
-- next conditional request, when it was last read well (`fetched_at`), when it may next be fetched
-- (`next_allowed_at`: the 5-minute floor, or later when the feed asks), the last failure and since
-- when, and `claimed_until`, the lease one instance takes with a conditional update before it
-- fetches a stale row, so two readers at once make one upstream fetch while the others serve the
-- stale row with its age (api/_lib/feedFetch.ts). The two lease times default to the epoch rather
-- than NULL so the conditional update is one plain comparison each. `refused` marks a failure that
-- is the guard refusing the address itself. A row whose wait ended a day ago is an address nobody
-- reads any more (any address in use is fetched at least hourly), and the reader deletes it.
--
-- It is reached only by the service role, from the public route `/api/data/feed` and the server
-- tick. Clients get nothing: RLS on with no policy is deny-all, and every client privilege is
-- revoked (the advisors report `rls_enabled_no_policy`, accepted in supabase/advisor-baseline.json
-- for this table as for the other service-role tables). It holds public headlines and addresses
-- someone typed, nothing about a production, so it has no foreign key and no owner.
--
-- `control_data_tick_due` is 0097's, with feed sources listed beside Sheet sources, so the tick
-- reads a published feed while every page is closed (it reads through the same cache).
--
-- Additive: a new table and one function body widened. Revert: drop the table and restore 0097's
-- `control_data_tick_due` (`kind = 'sheet'`).

set lock_timeout = '2s';
set statement_timeout = '30s';

-- ── 1. The cache ───────────────────────────────────────────────────────────────────────────────
create table if not exists public.feed_cache (
  key             text primary key check (key ~ '^[0-9a-f]{64}$'),
  address         text not null check (char_length(address) <= 2048),
  items           jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  etag            text,
  last_modified   text,
  fetched_at      timestamptz,
  next_allowed_at timestamptz not null default 'epoch',
  claimed_until   timestamptz not null default 'epoch',
  error           text,
  fix             text,
  failing_since   timestamptz,
  refused         boolean not null default false
);
alter table public.feed_cache enable row level security;   -- no policy: the service role only
revoke all on table public.feed_cache from public, anon, authenticated;
grant select, insert, update, delete on table public.feed_cache to service_role;

-- ── 2. The tick lists feed sources too ─────────────────────────────────────────────────────────
-- 0097's body; only the kind filter is wider.
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
       and e.value->>'kind' in ('sheet', 'feed')
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

-- ── 3. Self-check ──────────────────────────────────────────────────────────────────────────────
-- supabase/AGENTS.md: a self-check proves shape, so CALL the thing. The behavioural half runs in a
-- block that is always rolled back.
do $$
declare
  v_user uuid := gen_random_uuid();
  v_show uuid := '00000000-0099-4000-8000-000000000099';
  v_key text := repeat('0', 63) || '9';
  v_n int;
  v_due jsonb;
begin
  -- (a) Shape: no client reaches the cache or the tick's list.
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.feed_cache'::regclass) then
    raise exception '0099 self-check failed: feed_cache has row level security off';
  end if;
  if exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'feed_cache') then
    raise exception '0099 self-check failed: feed_cache has a policy';
  end if;
  if exists (select 1 from information_schema.role_table_grants g
              where g.table_schema = 'public' and g.table_name = 'feed_cache'
                and g.grantee in ('anon', 'authenticated', 'PUBLIC')) then
    raise exception '0099 self-check failed: a client role holds a privilege on feed_cache';
  end if;
  if not has_table_privilege('service_role', 'public.feed_cache', 'select, insert, update, delete') then
    raise exception '0099 self-check failed: the service role cannot use feed_cache';
  end if;
  if has_function_privilege('anon', 'public.control_data_tick_due(integer)', 'execute')
     or has_function_privilege('authenticated', 'public.control_data_tick_due(integer)', 'execute')
     or not has_function_privilege('service_role', 'public.control_data_tick_due(integer)', 'execute') then
    raise exception '0099 self-check failed: control_data_tick_due gained or lost a grant';
  end if;

  -- (b) Behaviour, always rolled back.
  begin
    -- The claim: a conditional update takes it once; a second while it holds takes nothing.
    insert into public.feed_cache (key, address) values (v_key, 'https://example.com/feed.xml');
    update public.feed_cache set claimed_until = now() + interval '20 seconds'
      where key = v_key and claimed_until < now() and next_allowed_at <= now();
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception '0099 self-check failed: a free row could not be claimed'; end if;
    update public.feed_cache set claimed_until = now() + interval '20 seconds'
      where key = v_key and claimed_until < now() and next_allowed_at <= now();
    get diagnostics v_n = row_count;
    if v_n <> 0 then raise exception '0099 self-check failed: a held claim was taken again'; end if;
    -- A read row inside its wait is not claimed either.
    update public.feed_cache set claimed_until = 'epoch', fetched_at = now(), next_allowed_at = now() + interval '5 minutes' where key = v_key;
    update public.feed_cache set claimed_until = now() + interval '20 seconds'
      where key = v_key and claimed_until < now() and next_allowed_at <= now();
    get diagnostics v_n = row_count;
    if v_n <> 0 then raise exception '0099 self-check failed: a fresh row was claimed for fetching'; end if;
    begin
      insert into public.feed_cache (key, address) values ('not-a-hash', 'x');
      raise exception '0099 self-check failed: a key that is not a hash was kept';
    exception when check_violation then null;
    end;

    -- The tick lists a published, unpaused feed source with no live lease.
    begin
      insert into auth.users (id, instance_id, aud, role, email)
      values (v_user, '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', '0099-self-check@noacg.invalid');
    exception when others then
      raise notice '0099 self-check: no throwaway account could be made (%), skipping the tick half', sqlerrm;
      raise exception '0099 self-check passed';
    end;
    if public.feature_denied_for(v_user, 'control.hosted') then
      raise notice '0099 self-check: hosted control is switched off on this instance, skipping the tick half';
      raise exception '0099 self-check passed';
    end if;
    insert into public.control_shows (id, owner_id, title, data, bindings, sources)
      values (v_show, v_user, '0099 self-check', '{}'::jsonb,
              '{"News":{"f0":"feed.f1.lines"}}'::jsonb,
              '[{"id":"f1","kind":"feed","label":"News","config":{"url":"https://example.com/feed.xml"}},
                {"id":"y1","kind":"youtube","label":"Chat","config":{"videoId":"x","mode":"chat"},"inbox":true}]'::jsonb);
    v_due := public.control_data_tick_due(200);
    if not exists (select 1 from jsonb_array_elements(v_due) d where d.value->'source'->>'id' = 'f1') then
      raise exception '0099 self-check failed: the tick does not list a published feed source';
    end if;
    if exists (select 1 from jsonb_array_elements(v_due) d where d.value->'source'->>'id' = 'y1') then
      raise exception '0099 self-check failed: the tick lists a YouTube source';
    end if;

    raise exception '0099 self-check passed';
  exception when others then
    if sqlerrm <> '0099 self-check passed' then raise; end if;
  end;
end $$;
