-- TWO READS THAT REACHED PAST THE ACCOUNT THAT OWNS THE DATA.
--
-- ── 1. A team production is read by the team as it is NOW ────────────────────────────────────────
-- 0054 widened `control_shows_owner_all` to `auth.uid() = owner_id OR is_team_member(team_id)`.
-- On a team row `owner_id` is whoever published FIRST (TEAMS_PLAN §4), so the first branch kept
-- that person in after they left the team or were removed: they could still read the row - the
-- control, output and join slugs, the data key, staged and live state, the pinned payload - and,
-- through `control_events_owner_delete`, still prune its command log. Rotating the data key did not
-- evict them, because they could read the new one.
--
-- USING now says exactly what WITH CHECK already said: a personal row belongs to its owner, a
-- team row to the team's CURRENT members. The team owner is always a member (`team_join` writes
-- their row when the team is created, and `team_members_leave_or_remove` stops them leaving), so
-- nobody who should see a team production loses it. ALTER POLICY rather than drop-and-create, for
-- the reason 0054 gives: the table is never without the policy, and db-push reads it as a change.
alter policy "control_shows_owner_all" on public.control_shows
  using (case
           when team_id is null then (select auth.uid()) = owner_id
           else public.is_team_member(team_id)
         end);

alter policy "control_events_owner_delete" on public.control_events
  using (exists (
    select 1 from public.control_shows s
    where s.id = show_id
      and case
            when s.team_id is null then (select auth.uid()) = s.owner_id
            else public.is_team_member(s.team_id)
          end
  ));

-- ── 2. The storage quota answers only about the caller's own folder ─────────────────────────────
-- 0039's `storage_within_quota(bucket, owner)` is granted to `authenticated` because the restrictive
-- upload policies call it, and a policy runs with the querying role's privileges. That grant also
-- made it callable directly, with ANY owner: a signed-in account could ask whether somebody else's
-- folder was full - the same shape of probe 0020 removed from `is_suspended(uuid)`.
--
-- Revoking EXECUTE would take every upload down (supabase/AGENTS.md, "A policy expression runs with
-- the QUERYING role's privileges"), so the SHAPE changes instead: asked about a folder that is not
-- the caller's, it answers true and measures nothing. That opens no write, because the policy is
-- RESTRICTIVE - it can only subtract from the ownership policies, and those already refuse any
-- folder but the caller's own (0001 `user-assets`, 0004 `community-assets`). `service_role` never
-- reaches it: it bypasses RLS, and `auth.uid()` is null there, which also answers true.
create or replace function public.storage_within_quota(p_bucket text, p_owner text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_owner is distinct from (select auth.uid())::text then true
    else coalesce(
      (
        select coalesce(
                 sum((o.metadata->>'size')::bigint)
                   filter (where (storage.foldername(o.name))[1] = p_owner),
                 0
               ) < q.per_owner_bytes
           and coalesce(sum((o.metadata->>'size')::bigint), 0) < q.per_bucket_bytes
        from public.storage_quotas q
        left join storage.objects o on o.bucket_id = q.bucket
        where q.bucket = p_bucket
        group by q.per_owner_bytes, q.per_bucket_bytes
      ),
      true
    )
  end;
$$;

-- Unchanged from 0039 and 0041: the upload policies need `authenticated` to hold EXECUTE.
revoke all on function public.storage_within_quota(text, text) from public, anon;
grant execute on function public.storage_within_quota(text, text) to authenticated;
