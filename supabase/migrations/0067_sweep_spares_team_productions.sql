-- The nightly unpublish sweep (0061) must not take a TEAM production off air.
--
-- WHAT WAS WRONG. Moving a production into a team (docs/TEAMS_PLAN.md §4) copies it into
-- `team_productions` and TOMBSTONES the mover's personal `documents` row - one home per production,
-- so the personal copy cannot come back on another device. The production keeps its id, because the
-- published row is keyed by it and its four links must not move. `control_unpublish_deleted()` then
-- found exactly its pattern: a tombstoned 'show' document, owned by the same account as the
-- `control_shows` row, deleted more than a day ago. So a day after somebody moved a published
-- production into their class's team, the sweep would have unpublished it - the output URL in every
-- teammate's OBS preset going dark overnight, for a production nobody deleted.
--
-- 0061's own header already meant to spare team rows ("a team production published by one account
-- and owned by another is never matched"), but that holds only when the owners differ. After a move
-- they are the same person: the mover published it and the mover's tombstone is the one left behind.
--
-- WHAT THIS DOES. One more condition: a row stamped with a team (`team_id is not null`) is never
-- swept. A team production is taken down by the TEAM OWNER, through the ordinary unpublish (0054's
-- restrictive delete policy), or by deleting the team, which unstamps its rows (`on delete set
-- null`) and hands them back to this sweep's ordinary rules. Everything 0061 listed as never
-- touched stays untouched; the function is otherwise character for character the same, and so are
-- its grants and its schedule, which this migration does not restate.

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
    and (cs.output_seen_at is null or cs.output_seen_at < now() - interval '1 day')
    -- A production that moved into a team left this tombstone behind on purpose (0067 header).
    and cs.team_id is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.control_unpublish_deleted() is
  'Unpublishes personal productions their owner deleted more than a day ago and no output has shown for a day; team-stamped rows are never swept (0067). Run daily by pg_cron (noacg-unpublish-deleted-productions). docs/CLOUD_PLAYOUT.md, Publication lifecycle.';

-- CREATE OR REPLACE keeps the existing ACL, so the 0061 revoke still stands - repeated anyway,
-- because this function deletes other people's rows and the claim is cheap to make true twice.
revoke all on function public.control_unpublish_deleted() from public, anon, authenticated;

-- Self-check. SHAPE first: the grants.
do $$
begin
  if has_function_privilege('anon', 'public.control_unpublish_deleted()', 'execute')
     or has_function_privilege('authenticated', 'public.control_unpublish_deleted()', 'execute') then
    raise exception '0067: control_unpublish_deleted() must not be executable by anon or authenticated';
  end if;
end $$;

-- Then BEHAVIOUR (supabase/AGENTS.md: a self-check proves shape unless it CALLS the thing). Two
-- published rows over two day-old tombstones of the same owner - one team-stamped, one personal -
-- and one run of the sweep: the team row must survive and the personal one must go. The whole
-- block runs inside a subtransaction that is then rolled back on purpose, so neither the
-- throwaway rows nor anything the real sweep would have matched are changed by applying this.
-- The rows go in as the applying role, which never meets the client policies, and the role is never
-- changed (supabase/AGENTS.md). A fresh stack has no auth.users row to own them and says so rather
-- than failing.
do $$
declare
  v_owner uuid;
  v_team  uuid := gen_random_uuid();
  v_team_show uuid := gen_random_uuid();
  v_own_show  uuid := gen_random_uuid();
begin
  select id into v_owner from auth.users limit 1;
  if v_owner is null then
    raise notice '0067 self-check: no auth.users rows on this database, behaviour check skipped';
    return;
  end if;
  begin
    insert into public.teams (id, name, owner_id) values (v_team, '0067 self-check', v_owner);
    insert into public.control_show_identity (id, owner_id, slug)
      values (v_team_show, v_owner, '0067-self-check-' || replace(v_team_show::text, '-', '')),
             (v_own_show, v_owner, '0067-self-check-' || replace(v_own_show::text, '-', ''));
    insert into public.control_shows (id, owner_id, title, team_id)
      values (v_team_show, v_owner, '0067 self-check (team)', v_team),
             (v_own_show, v_owner, '0067 self-check (personal)', null);
    insert into public.documents (id, user_id, kind, name, body, deleted, updated_at)
      values (v_team_show, v_owner, 'show', '', '{}'::jsonb, true, now() - interval '3 days'),
             (v_own_show, v_owner, 'show', '', '{}'::jsonb, true, now() - interval '3 days');

    perform public.control_unpublish_deleted();

    if not exists (select 1 from public.control_shows s where s.id = v_team_show) then
      raise exception '0067 self-check FAILED: the sweep unpublished a production that moved into a team';
    end if;
    if exists (select 1 from public.control_shows s where s.id = v_own_show) then
      raise exception '0067 self-check FAILED: the sweep no longer unpublishes a deleted personal production';
    end if;
    raise exception '0067-self-check-rollback';
  exception when others then
    if sqlerrm <> '0067-self-check-rollback' then
      raise;
    end if;
  end;
end $$;
