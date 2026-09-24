-- THE COMMAND LOG STOPS BEING PUBLICLY READABLE - the second half of what 0064 started.
--
-- WHAT WAS WRONG. 0008 made `control_events` readable to anon and authenticated with `using (true)`,
-- so `GET /rest/v1/control_events?select=*` with the public anon key listed every production's
-- log: field values sent to air, staged data that had not aired, live reports, and every show id
-- with them. A show id is what the private `cmd-` and `log-` topics are keyed by, so the same read
-- also handed out the address of every production's live traffic.
--
-- WHY IT COULD NOT SIMPLY BE REVOKED UNTIL NOW. Every following surface received log rows through
-- Realtime `postgres_changes`, which only delivers a row the subscriber's RLS can SELECT. 0064
-- added a second road that does not depend on this read: the database broadcasts every inserted
-- row on the production's private topic `log-<show id>`. The app now follows the log on that topic
-- alone (src/control/hostedControl.ts `subscribeControlEvents`), and the gap-filling tail was
-- never a table read - it goes through `control_tail` / `control_output_tail`, which are SECURITY
-- DEFINER and authorised by the slug. So nothing a follower does needs this policy any more.
--
-- WHO STILL READS THE TABLE, AND WHY THE POLICY IS NARROWED RATHER THAN DROPPED. The production's
-- owner, and on a team production its CURRENT members: publishing prunes rows older than seven days
-- (`publishHostedShow`), and a DELETE under RLS only reaches rows a SELECT policy also admits, so
-- without a read the prune would quietly delete nothing and the log would grow without bound. The
-- predicate is 0063's, word for word - a personal row belongs to its owner, a team row to the
-- team's current members - so the read and the delete can never disagree about who owns a log.
--
-- THE `anon` TABLE GRANT STAYS (0051). With no policy admitting anon, the grant reads nothing: a
-- signed-out `GET /rest/v1/control_events` now answers `[]`. Revoking it as well would change that
-- answer to a 42501 and buy nothing, and it would risk the one thing still worth keeping for graphics
-- exported between 2026-07-21 and 2026-08-05, which carry a baked receiver that joins
-- `postgres_changes` as anon (src/control/hostedReceiver.ts). With the grant in place that join
-- still succeeds, so those graphics still rebuild from the tail RPC every time they (re)connect;
-- they only stop receiving rows live. The table stays in the `supabase_realtime` publication for
-- the same reason: taken out, that join could be refused outright.
--
-- ALTER POLICY rather than drop-and-create, for the reason 0054 gives: the table is never without
-- the policy, and db-push reads it as a change rather than as a removal.

alter policy "control_events_read" on public.control_events
  to authenticated
  using (exists (
    select 1 from public.control_shows s
    where s.id = show_id
      and case
            when s.team_id is null then (select auth.uid()) = s.owner_id
            else public.is_team_member(s.team_id)
          end
  ));

-- ── Prove it, or refuse to apply ────────────────────────────────────────────────────────────────
do $$
declare
  v_open text;
begin
  -- No permissive policy may let a signed-out caller read the log. `public` counts: a policy
  -- granted to PUBLIC applies to anon as well.
  select string_agg(policyname, ', ') into v_open from pg_policies
   where schemaname = 'public' and tablename = 'control_events'
     and permissive = 'PERMISSIVE'
     and cmd in ('SELECT', 'ALL')
     and (roles::text[] && array['anon', 'public']);
  if v_open is not null then
    raise exception 'command log read self-check failed: a signed-out caller can still read control_events (%)', v_open;
  end if;

  -- The read that remains is an ownership check, never `true` again.
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'control_events' and policyname = 'control_events_read'
       and roles::text[] = array['authenticated'] and qual ilike '%owner_id%' and qual ilike '%is_team_member%'
  ) then
    raise exception 'command log read self-check failed: control_events_read is not the owner-or-team read';
  end if;

  -- The road every follower now depends on must be there: 0064's trigger and its read policy.
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'control_events' and t.tgname = 'control_events_broadcast' and not t.tgisinternal
  ) then
    raise exception 'command log read self-check failed: the log broadcast trigger (0064) is missing, so no follower would receive a row';
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'realtime' and tablename = 'messages' and policyname = 'control_log_readable'
  ) then
    raise exception 'command log read self-check failed: the log topic read policy (0064) is missing, so no follower could join it';
  end if;
end $$;
