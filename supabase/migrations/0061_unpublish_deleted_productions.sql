-- A DELETED PRODUCTION STOPS BEING PUBLISHED (docs/CLOUD_PLAYOUT.md, "Publication lifecycle").
--
-- WHAT WAS WRONG. Deleting a production tombstones its synced `documents` row (kind 'show',
-- `deleted = true`) and nothing else. Its `control_shows` row - the pinned output payload, the
-- control page, the audience links - stayed published for good, reachable by anyone holding its
-- output or control URL. Measured on production on 2026-09-23: 5 of the 19 publications belonged
-- to productions their owners had deleted, each for between two and seven weeks.
--
-- WHAT THIS DOES. The studio now unpublishes a published production when it is deleted
-- (ProductionsSection.tsx). That request can miss: the delete may happen offline, on another
-- device that never published, or in a tab that closes first. This sweep is the safety net: once a
-- day it unpublishes a production whose owner deleted it more than a day ago.
--
-- WHY NOT AN EXPIRY. The measurement behind the decision is in the doc named above: an idle
-- publication costs one row (a few hundred kilobytes) and nothing else, while a time-based expiry
-- would take down the output URL an OBS or vMix preset holds for a show that happens once a
-- month. So the only publications this removes are ones their owner already threw away.
--
-- WHAT IT NEVER TOUCHES, and why each condition is there:
--   - A production still in the owner's library. Only a TOMBSTONED document counts.
--   - A delete less than a day old. The tombstone's `updated_at` is when it was deleted; a day
--     leaves room for the owner's own sync to settle.
--   - An output that is being watched. `output_seen_at` is the renderer's heartbeat (0029); a
--     browser source that reported in during the last day keeps its production published even
--     after a delete, so nothing on air goes dark overnight.
--   - Anybody else's production. The document and the publication must have the SAME owner, so
--     a team production published by one account and owned by another is never matched.
--   - The production's ADDRESSES. `control_show_identity` (0040) is not cascaded from this table,
--     so a production restored and published again gets the same four URLs back.
-- The DELETE cascades exactly as the studio's own Unpublish does: the command log and the
-- audience rows go with the publication (0008, 0035).

create extension if not exists pg_cron with schema extensions;

create or replace function public.control_unpublish_deleted()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.control_shows cs
  using public.documents d
  where d.id = cs.id
    and d.user_id = cs.owner_id
    and d.kind = 'show'
    and d.deleted
    and d.updated_at < now() - interval '1 day'
    and (cs.output_seen_at is null or cs.output_seen_at < now() - interval '1 day');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.control_unpublish_deleted() is
  'Unpublishes productions their owner deleted more than a day ago and no output has shown for a day. Run daily by pg_cron (noacg-unpublish-deleted-productions). docs/CLOUD_PLAYOUT.md, Publication lifecycle.';

-- Nobody calls this but the scheduler, which runs as the database owner. A SECURITY DEFINER
-- function is callable by PUBLIC unless revoked, and this one deletes other people's rows.
revoke all on function public.control_unpublish_deleted() from public, anon, authenticated;

-- Re-runnable: drop a job of the same name before scheduling it again.
do $$
declare
  v_job bigint;
begin
  for v_job in select jobid from cron.job where jobname = 'noacg-unpublish-deleted-productions' loop
    perform cron.unschedule(v_job);
  end loop;
end $$;

-- 03:41 UTC, after the other nightly prunes (0039: 03:11 to 03:29), in the quietest hour for a
-- European live show.
select cron.schedule(
  'noacg-unpublish-deleted-productions',
  '41 3 * * *',
  $$select public.control_unpublish_deleted()$$
);

-- The publications already orphaned go now rather than tonight: the rules are the same ones the
-- job applies, so this is the job's first run, not a separate cleanup.
select public.control_unpublish_deleted();

-- Self-check: the job exists, and the function is not callable by the client roles.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'noacg-unpublish-deleted-productions') then
    raise exception '0061: the noacg-unpublish-deleted-productions job was not scheduled';
  end if;
  if has_function_privilege('anon', 'public.control_unpublish_deleted()', 'execute')
     or has_function_privilege('authenticated', 'public.control_unpublish_deleted()', 'execute') then
    raise exception '0061: control_unpublish_deleted() must not be executable by anon or authenticated';
  end if;
end $$;
