-- Reports on community packs (docs/work-specs/community-packs/slice-4-research.md, "The Report
-- link"). Any signed-in account may report a live pack that is not its own, with a reason; a NoaCG
-- admin sees the reported packs beside Waiting for review and takes one down or dismisses its
-- reports. The reporter hears nothing afterwards: there is no notification channel (spec D14).
--
-- Not 0004's `community_reports`: its key points at the closed gallery's `community_templates`.
-- The table grants clients nothing; the three functions below are the only door, as for
-- `community_packs` itself (0079).
set lock_timeout = '2s';
set statement_timeout = '30s';

create table if not exists public.community_pack_reports (
  id           uuid primary key default gen_random_uuid(),
  pack_id      uuid not null references public.community_packs (id) on delete cascade,
  reporter_id  uuid not null references auth.users (id) on delete cascade,
  reason       text not null check (char_length(reason) between 1 and 300),
  created_at   timestamptz not null default now(),
  -- Set when an admin dismisses the reports on a pack they keep.
  dismissed_at timestamptz,
  dismissed_by uuid references auth.users (id) on delete set null
);
create index if not exists community_pack_reports_pack_idx on public.community_pack_reports (pack_id);
create index if not exists community_pack_reports_reporter_idx on public.community_pack_reports (reporter_id, created_at desc);
create index if not exists community_pack_reports_dismissed_by_idx on public.community_pack_reports (dismissed_by);
alter table public.community_pack_reports enable row level security;
revoke all on table public.community_pack_reports from public, anon, authenticated;
grant all on table public.community_pack_reports to service_role;

-- Report a live pack. Signed-in only, never one's own, once per account while its report waits,
-- a reason of 1 to 300 characters (the field's own limit), and at most ten a minute per account
-- (the 0004 shape, inside the function).
create or replace function public.community_pack_report(p_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_reason text := btrim(coalesce(p_reason, ''));
  v_author uuid;
  v_lineage uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to report a pack.';
  end if;
  if char_length(v_reason) not between 1 and 300 then
    raise exception 'Say what is wrong with it, in at most 300 characters.';
  end if;
  select c.author_id, c.lineage into v_author, v_lineage from public.community_packs c where c.id = p_id and c.state = 'live';
  if not found then
    raise exception 'That pack is no longer offered.';
  end if;
  if v_author = v_uid then
    raise exception 'This pack is yours. Withdraw it under Your packs instead.';
  end if;
  -- One voice per account: a second report of a pack whose first still waits would only inflate
  -- the count the admin reads.
  if exists (select 1 from public.community_pack_reports r
               join public.community_packs c on c.id = r.pack_id
              where c.lineage = v_lineage and r.reporter_id = v_uid and r.dismissed_at is null) then
    raise exception 'You have reported this pack already.';
  end if;
  if (select count(*) from public.community_pack_reports r
       where r.reporter_id = v_uid and r.created_at > now() - interval '60 seconds') >= 10 then
    raise exception 'Too many reports in a minute. Wait a moment and try again.';
  end if;
  insert into public.community_pack_reports (pack_id, reporter_id, reason) values (p_id, v_uid, v_reason);
end;
$$;
revoke all on function public.community_pack_report(uuid, text) from public, anon;
grant execute on function public.community_pack_report(uuid, text) to authenticated;

-- What an admin reads: each live pack with reports not yet dismissed, counted as the accounts that
-- reported it across every version of the pack (an approved update replaces the reported row but
-- not the reason), with the three latest reasons and the newest report's time, most recently
-- reported first. Empty for anyone but a moderator.
create or replace function public.community_pack_reported()
returns table (id uuid, lineage uuid, name text, description text, author_name text, graphics integer, version integer,
               reports integer, reasons text[], last_reported timestamptz)
language sql stable security definer set search_path = '' as $$
  select live.id, live.lineage, live.name, live.description, live.author_name, live.graphics, live.version,
         count(distinct r.reporter_id)::integer,
         (array_agg(r.reason order by r.created_at desc))[1:3],
         max(r.created_at)
  from public.community_pack_reports r
  join public.community_packs reported on reported.id = r.pack_id
  join public.community_packs live on live.lineage = reported.lineage and live.state = 'live'
  where r.dismissed_at is null and public.is_moderator()
  group by live.id, live.lineage, live.name, live.description, live.author_name, live.graphics, live.version
  order by max(r.created_at) desc;
$$;
revoke all on function public.community_pack_reported() from public, anon;
grant execute on function public.community_pack_reported() to authenticated;

-- An admin keeps a reported pack: the reports they read, on every version, leave the Reported
-- list. `p_until` is the newest report the admin's list held, so a report filed since stays.
create or replace function public.community_pack_reports_dismiss(p_id uuid, p_until timestamptz)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not public.is_moderator() then
    raise exception 'Only a NoaCG admin can dismiss reports.';
  end if;
  update public.community_pack_reports r
     set dismissed_at = now(), dismissed_by = v_uid
   where r.dismissed_at is null
     and r.created_at <= p_until
     and r.pack_id in (select c.id from public.community_packs c
                        where c.lineage = (select p.lineage from public.community_packs p where p.id = p_id));
end;
$$;
revoke all on function public.community_pack_reports_dismiss(uuid, timestamptz) from public, anon;
grant execute on function public.community_pack_reports_dismiss(uuid, timestamptz) to authenticated;

-- Self-check, part one: the grants. Signed-out callers reach none of the three; the table
-- grants clients nothing.
do $$
begin
  if has_function_privilege('anon', 'public.community_pack_report(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.community_pack_reported()', 'execute')
     or has_function_privilege('anon', 'public.community_pack_reports_dismiss(uuid, timestamptz)', 'execute') then
    raise exception '0086 self-check: anon may reach a report function';
  end if;
  if not has_function_privilege('authenticated', 'public.community_pack_report(uuid, text)', 'execute') then
    raise exception '0086 self-check: a signed-in caller cannot report';
  end if;
  if has_table_privilege('authenticated', 'public.community_pack_reports', 'select')
     or has_table_privilege('anon', 'public.community_pack_reports', 'select') then
    raise exception '0086 self-check: a client can read the reports table';
  end if;
end;
$$;

-- Self-check, part two: CALL them. A maker's live pack is reported by another account, which
-- cannot see the Reported list or dismiss; the maker cannot report their own; a moderator sees it
-- counted and dismisses it. Everything happens inside a block that ends by raising, so every row
-- rolls back.
do $$
declare
  v_maker uuid;
  v_reporter uuid;
  v_admin uuid;
  v_pack uuid;
  v_error text;
  v_count integer;
begin
  select m.user_id into v_admin from public.moderators m limit 1;
  select u.id into v_maker from auth.users u where u.id is distinct from v_admin limit 1;
  select u.id into v_reporter from auth.users u
   where u.id is distinct from v_admin and u.id is distinct from v_maker
     and not exists (select 1 from public.moderators m where m.user_id = u.id)
   limit 1;
  if v_admin is null or v_maker is null or v_reporter is null then
    raise notice '0086 behaviour self-check skipped: needs a moderator and two other accounts on this instance';
    return;
  end if;
  begin
    insert into public.community_packs (author_id, author_name, name, description, graphics, pack, state, decided_at)
    values (v_maker, 'Self-check', 'Self-check', 'Self-check pack', 1, '{"format":"noacg-pack","graphics":[{}]}'::jsonb, 'live', now())
    returning id into v_pack;

    perform set_config('request.jwt.claims', json_build_object('sub', v_reporter, 'role', 'authenticated')::text, true);
    perform public.community_pack_report(v_pack, '  Uses a logo it has no right to  ');
    if (select r.reason from public.community_pack_reports r where r.pack_id = v_pack) is distinct from 'Uses a logo it has no right to' then
      raise exception '0086 self-check failed: the report was not stored as given';
    end if;
    if exists (select 1 from public.community_pack_reported()) then
      raise exception '0086 self-check failed: a reporter can read the Reported list';
    end if;
    v_error := null;
    begin
      perform public.community_pack_report(v_pack, 'Again');
    exception when raise_exception then
      v_error := sqlerrm;
    end;
    if v_error is distinct from 'You have reported this pack already.' then
      raise exception '0086 self-check failed: one account reported a pack twice (%)', v_error;
    end if;
    v_error := null;
    begin
      perform public.community_pack_reports_dismiss(v_pack, now());
    exception when raise_exception then
      v_error := sqlerrm;
    end;
    if v_error is distinct from 'Only a NoaCG admin can dismiss reports.' then
      raise exception '0086 self-check failed: a reporter could dismiss (%)', v_error;
    end if;

    perform set_config('request.jwt.claims', json_build_object('sub', v_maker, 'role', 'authenticated')::text, true);
    v_error := null;
    begin
      perform public.community_pack_report(v_pack, 'Mine');
    exception when raise_exception then
      v_error := sqlerrm;
    end;
    if v_error is distinct from 'This pack is yours. Withdraw it under Your packs instead.' then
      raise exception '0086 self-check failed: a maker could report their own pack (%)', v_error;
    end if;

    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    select r.reports into v_count from public.community_pack_reported() r where r.id = v_pack;
    if v_count is distinct from 1 then
      raise exception '0086 self-check failed: the admin sees % reports, not 1', v_count;
    end if;
    -- A dismissal up to a moment before the report leaves it waiting; up to now clears it.
    perform public.community_pack_reports_dismiss(v_pack, now() - interval '1 second');
    if not exists (select 1 from public.community_pack_reported() r where r.id = v_pack) then
      raise exception '0086 self-check failed: a dismissal cleared a report filed after its moment';
    end if;
    perform public.community_pack_reports_dismiss(v_pack, now());
    if exists (select 1 from public.community_pack_reported() r where r.id = v_pack) then
      raise exception '0086 self-check failed: a dismissed pack is still listed';
    end if;

    raise exception '0086-self-check-passed';
  exception when raise_exception then
    if sqlerrm <> '0086-self-check-passed' then
      raise;
    end if;
  end;
end;
$$;
