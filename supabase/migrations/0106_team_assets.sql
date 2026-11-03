set lock_timeout = '2s';
set statement_timeout = '30s';

-- TEAM ASSETS IN STORAGE (docs/work-specs/team-save-load/spec.md).
--
-- A team save carried every image and font inside `team_productions.doc`, so one edit of a large
-- production rewrote megabytes. Personal sync moved its files to `user-assets` long ago, under the
-- owner's folder, which a teammate cannot read. This adds one more folder shape to that bucket,
-- `team/<team id>/...`, readable and writable by the team's members, with its own ceiling.
--
-- Additive: two functions and three policies. The personal policies are untouched, and the
-- restrictive suspension policies from 0020 and 0088 already cover every row of this bucket.
--
-- THE TEAM ID IS READ THROUGH A FUNCTION, NEVER CAST IN THE POLICY. A permissive policy runs against
-- rows of every bucket and SQL promises no order for AND, so `(foldername(name))[2]::uuid` in the
-- policy itself could raise on somebody else's object and fail their whole read. The function
-- answers NULL for anything that is not this exact shape.

create or replace function public.team_asset_team(p_bucket text, p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_bucket = 'user-assets'
     and p_name ~ '^team/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[^/]+$'
    then split_part(p_name, '/', 2)::uuid
  end;
$$;
revoke all on function public.team_asset_team(text, text) from public, anon;
grant execute on function public.team_asset_team(text, text) to authenticated, service_role;

-- 200 MB a team. `storage_within_quota` answers true for any folder but the caller's own (0063), so
-- without this a team folder would have no ceiling at all. Like that function it measures only what
-- the caller may see: for a team the caller is not in it answers true and reads nothing, and the
-- member policy refuses that write anyway.
create or replace function public.team_assets_within_quota(p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not public.is_team_member(p_team)
      or coalesce(
           (select sum((o.metadata->>'size')::bigint)
              from storage.objects o
             where o.bucket_id = 'user-assets'
               and o.name like 'team/' || p_team::text || '/%'),
           0
         ) < 200::bigint * 1024 * 1024;
$$;
revoke all on function public.team_assets_within_quota(uuid) from public, anon;
grant execute on function public.team_assets_within_quota(uuid) to authenticated, service_role;

create policy "team_assets_member_select" on storage.objects
  for select to authenticated
  using (public.is_team_member(public.team_asset_team(bucket_id, name)));

create policy "team_assets_member_insert" on storage.objects
  for insert to authenticated
  with check (public.is_team_member(public.team_asset_team(bucket_id, name)));

create policy "team_assets_within_quota" on storage.objects
  as restrictive for insert to authenticated
  with check (
    public.team_asset_team(bucket_id, name) is null
    or public.team_assets_within_quota(public.team_asset_team(bucket_id, name))
  );

-- Self-check: the shape the policies depend on, and absence for everything else.
do $$
begin
  if public.team_asset_team('user-assets', 'team/00000000-0000-0000-0000-000000000001/abc-12') is null then
    raise exception '0106: a team asset path did not resolve to its team';
  end if;
  if public.team_asset_team('user-assets', '00000000-0000-0000-0000-000000000001/abc') is not null
     or public.team_asset_team('user-assets', 'team/not-a-uuid/abc') is not null
     or public.team_asset_team('community-assets', 'team/00000000-0000-0000-0000-000000000001/abc') is not null
     or public.team_asset_team('user-assets', 'team/00000000-0000-0000-0000-000000000001/a/b') is not null then
    raise exception '0106: a path outside the team shape resolved to a team';
  end if;
end $$;
