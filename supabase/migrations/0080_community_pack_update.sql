-- Community packs, updates (docs/work-specs/community-packs/spec.md AC-11, D11) and the
-- `community.publish` switch on submit.
--
-- An update is a new row in the live pack's lineage, one version up. It waits for review like a
-- first submission while the live version stays on the shelf; approving it moves the old live row
-- to `replaced`, which `community_pack_decide` (0079) already does. Only the maker of a pack that
-- is live now may update it, and one update at a time waits. A pack that leaves the shelf takes
-- its waiting update with it: withdrawing the live version withdraws the update, and a takedown
-- takes the update down with the same reason, so no approval can bring the pack back.
--
-- The shelf and the review queue also answer each row's lineage, so Install can stamp one id for
-- every version of a pack (`fromPack`, spec D7) and the stamp's version means something.
--
-- Submit now also refuses an account whose `community.publish` is denied (an admin's per-account
-- switch, the instance-wide kill switch, or suspension: `feature_denied`, 0022), as the closed
-- gallery's publish path did. Submitting stays moderator-only until the design lock lands (D12).
--
-- Submit gains an argument and the two readers gain a column, so those three are dropped and
-- created again with 0079's grants. `p_update_of` defaults to null, so a first submission calls
-- submit as before.
set lock_timeout = '2s';
set statement_timeout = '30s';

drop function if exists public.community_pack_shelf();
create function public.community_pack_shelf()
returns table (id uuid, lineage uuid, name text, description text, author_name text, graphics integer, version integer,
               decided_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.lineage, p.name, p.description, p.author_name, p.graphics, p.version, p.decided_at
  from public.community_packs p
  where p.state = 'live'
  order by p.decided_at desc nulls last, p.submitted_at desc;
$$;
revoke all on function public.community_pack_shelf() from public;
grant execute on function public.community_pack_shelf() to anon, authenticated;

drop function if exists public.community_pack_waiting();
create function public.community_pack_waiting()
returns table (id uuid, lineage uuid, name text, description text, author_name text, graphics integer, version integer,
               submitted_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.lineage, p.name, p.description, p.author_name, p.graphics, p.version, p.submitted_at
  from public.community_packs p
  where p.state = 'in_review' and public.is_moderator()
  order by p.submitted_at;
$$;
revoke all on function public.community_pack_waiting() from public, anon;
grant execute on function public.community_pack_waiting() to authenticated;

-- The maker takes their own pack off the queue or the shelf at once (spec D6). Withdrawing the
-- live version withdraws the update waiting beside it too; withdrawing the update alone leaves
-- the live version on the shelf.
create or replace function public.community_pack_withdraw(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.community_packs%rowtype;
begin
  select * into v_row from public.community_packs p
   where p.id = p_id and p.author_id = (select auth.uid()) and p.state in ('in_review', 'live')
     for update;
  if not found then
    raise exception 'That pack is not yours to withdraw, or it is no longer offered.';
  end if;
  update public.community_packs p
     set state = 'withdrawn'
   where p.id = p_id
      or (v_row.state = 'live' and p.lineage = v_row.lineage and p.state = 'in_review');
end;
$$;
revoke all on function public.community_pack_withdraw(uuid) from public, anon;
grant execute on function public.community_pack_withdraw(uuid) to authenticated;

-- 0079's decide, with one addition: taking a live pack down takes the update waiting beside it
-- down with the same reason.
create or replace function public.community_pack_decide(p_id uuid, p_state text, p_reason text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_row public.community_packs%rowtype;
begin
  if v_uid is null or not public.is_moderator() then
    raise exception 'Only a NoaCG admin can decide on a pack.';
  end if;
  if p_state not in ('live', 'not_accepted', 'taken_down') then
    raise exception 'Unknown decision.';
  end if;
  if p_state <> 'live' and v_reason is null then
    raise exception 'Give the maker a reason.';
  end if;
  if v_reason is not null and char_length(v_reason) > 300 then
    raise exception 'Keep the reason under 300 characters.';
  end if;
  select * into v_row from public.community_packs c where c.id = p_id for update;
  if not found then
    raise exception 'That pack no longer exists.';
  end if;
  if (p_state in ('live', 'not_accepted') and v_row.state <> 'in_review')
     or (p_state = 'taken_down' and v_row.state <> 'live') then
    raise exception 'That pack is no longer in the state this decision needs.';
  end if;
  if p_state = 'live' then
    update public.community_packs c
       set state = 'replaced'
     where c.lineage = v_row.lineage and c.state = 'live' and c.id <> p_id;
  end if;
  update public.community_packs c
     set state = p_state, reason = v_reason, decided_at = now(), decided_by = v_uid
   where c.id = p_id
      or (p_state = 'taken_down' and c.lineage = v_row.lineage and c.state = 'in_review');
end;
$$;
revoke all on function public.community_pack_decide(uuid, text, text) from public, anon;
grant execute on function public.community_pack_decide(uuid, text, text) to authenticated;

drop function if exists public.community_pack_submit(text, text, text, jsonb);

create function public.community_pack_submit(p_name text, p_description text, p_author text, p_pack jsonb,
                                             p_update_of uuid default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := btrim(coalesce(p_description, ''));
  v_author text := btrim(coalesce(p_author, ''));
  v_count integer;
  v_lineage uuid := gen_random_uuid();
  v_version integer := 1;
  v_live public.community_packs%rowtype;
  v_waiting boolean;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to submit a pack.';
  end if;
  if not public.is_moderator() then
    raise exception 'Submitting packs is open to NoaCG only for now.';
  end if;
  -- Suspension, the instance-wide switch, or an admin's per-account switch (0022).
  if public.feature_denied('community.publish') then
    raise exception 'This account cannot submit packs.';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'The pack needs a name of at most 80 characters.';
  end if;
  if char_length(v_description) not between 1 and 200 then
    raise exception 'The pack needs a description of at most 200 characters.';
  end if;
  if char_length(v_author) not between 1 and 60 then
    raise exception 'The pack needs the name it is shown under, at most 60 characters.';
  end if;
  if p_pack is null or jsonb_typeof(p_pack) <> 'object' or p_pack->>'format' is distinct from 'noacg-pack'
     or jsonb_typeof(p_pack->'graphics') is distinct from 'array' then
    raise exception 'That is not a NoaCG graphics pack.';
  end if;
  v_count := jsonb_array_length(p_pack->'graphics');
  if v_count not between 1 and 50 then
    raise exception 'A pack holds between 1 and 50 graphics.';
  end if;
  -- A community pack is a set of graphics with no rundown (spec D2): prepared cue values would
  -- reach air on every install without passing the graphic checks, so the server refuses them.
  if p_pack ? 'cues' or p_pack ? 'rundown'
     or exists (select 1 from jsonb_array_elements(p_pack->'graphics') g where jsonb_typeof(g) <> 'object' or g ? 'cues') then
    raise exception 'A community pack carries graphics only, with no cues.';
  end if;
  -- The sheet holds packs to 8 MB of compact JSON; this text rendering spaces it out, so the
  -- server's ceiling sits above that rather than refusing what the sheet allowed.
  if octet_length(p_pack::text) > 10485760 then
    raise exception 'The pack is larger than 8 MB.';
  end if;
  if (select count(*) from public.community_packs c where c.author_id = v_uid and c.state = 'in_review') >= 10 then
    raise exception 'Ten packs are already waiting for review. Wait for a decision first.';
  end if;
  if p_update_of is not null then
    -- Locking the live row serialises two updates of one pack sent at the same moment.
    select * into v_live from public.community_packs c
     where c.id = p_update_of and c.author_id = v_uid and c.state = 'live'
       for update;
    if not found then
      raise exception 'Only a live pack of yours can be updated.';
    end if;
    select max(c.version) + 1, coalesce(bool_or(c.state = 'in_review'), false) into v_version, v_waiting
      from public.community_packs c where c.lineage = v_live.lineage;
    if v_waiting then
      raise exception 'An update of this pack is already waiting for review.';
    end if;
    v_lineage := v_live.lineage;
  end if;
  insert into public.community_packs (lineage, version, author_id, author_name, name, description, graphics, pack)
  values (
    v_lineage, v_version, v_uid, v_author, v_name, v_description, v_count,
    p_pack || jsonb_build_object('name', v_name, 'description', v_description, 'author', v_author, 'license', 'CC-BY-4.0')
  )
  returning community_packs.id into v_id;
  return v_id;
end;
$$;
revoke all on function public.community_pack_submit(text, text, text, jsonb, uuid) from public, anon;
grant execute on function public.community_pack_submit(text, text, text, jsonb, uuid) to authenticated;

-- One waiting version per pack, held by the table and not only by submit's own check.
create unique index if not exists community_packs_one_in_review_idx
  on public.community_packs (lineage) where state = 'in_review';

-- Self-check, part one: the grants 0079 gave, on the functions created again here.
do $$
begin
  if has_function_privilege('anon', 'public.community_pack_submit(text, text, text, jsonb, uuid)', 'execute')
     or has_function_privilege('anon', 'public.community_pack_waiting()', 'execute')
     or has_function_privilege('anon', 'public.community_pack_withdraw(uuid)', 'execute')
     or has_function_privilege('anon', 'public.community_pack_decide(uuid, text, text)', 'execute') then
    raise exception '0080 self-check: anon may submit, withdraw, decide or read the review queue';
  end if;
  if not has_function_privilege('authenticated', 'public.community_pack_submit(text, text, text, jsonb, uuid)', 'execute')
     or not has_function_privilege('anon', 'public.community_pack_shelf()', 'execute') then
    raise exception '0080 self-check: a signed-in caller cannot submit, or the shelf is not readable signed out';
  end if;
end;
$$;

-- Self-check, part two: CALL the doors as an existing account made a moderator for the moment.
-- A live pack takes one update, which waits beside it; a second waits for nothing; approval
-- replaces the old version on the shelf; withdrawing or taking down a live pack takes its waiting
-- update with it; a denied `community.publish` refuses. Everything happens inside a block that
-- ends by raising, so every row and grant rolls back.
do $$
declare
  v_user uuid;
  v_first uuid;
  v_update uuid;
  v_third uuid;
  v_other uuid;
  v_other_update uuid;
  v_pack jsonb := '{"format":"noacg-pack","version":1,"name":"x","graphics":[{"name":"A"}]}'::jsonb;
  v_error text;
begin
  select u.id into v_user from auth.users u
   where not exists (select 1 from public.user_accounts a where a.user_id = u.id and a.state = 'suspended')
     and not public.feature_denied_for(u.id, 'community.publish')
     -- One active grant per key (0021), so the denying one below needs a free slot.
     and not exists (select 1 from public.user_grants g
                      where g.user_id = u.id and g.key = 'community.publish' and g.revoked_at is null)
     -- Room under submit's limit of ten waiting packs for the two this check sends at once.
     and (select count(*) from public.community_packs c where c.author_id = u.id and c.state = 'in_review') <= 8
   limit 1;
  if v_user is null then
    raise notice '0080 behaviour self-check skipped: no account on this instance';
    return;
  end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    insert into public.moderators (user_id, note) values (v_user, '0080 self-check') on conflict (user_id) do nothing;

    v_first := public.community_pack_submit('Self-check', 'Self-check pack', 'Self-check', v_pack);
    v_error := null;
    begin
      perform public.community_pack_submit('Early', 'd', 'Self-check', v_pack, v_first);
    exception when raise_exception then
      v_error := sqlerrm;
    end;
    if v_error is distinct from 'Only a live pack of yours can be updated.' then
      raise exception '0080 self-check failed: a pack in review took an update (%)', v_error;
    end if;

    perform public.community_pack_decide(v_first, 'live', null);
    v_update := public.community_pack_submit('Self-check v2', 'Self-check pack', 'Self-check', v_pack, v_first);
    if not exists (select 1 from public.community_packs u join public.community_packs f on f.lineage = u.lineage
                    where u.id = v_update and f.id = v_first and u.version = 2) then
      raise exception '0080 self-check failed: an update is not the next version of its pack';
    end if;
    if not exists (select 1 from public.community_pack_shelf() s where s.id = v_first)
       or exists (select 1 from public.community_pack_shelf() s where s.id = v_update) then
      raise exception '0080 self-check failed: the live version did not stay while its update waits';
    end if;

    v_error := null;
    begin
      perform public.community_pack_submit('Second', 'd', 'Self-check', v_pack, v_first);
    exception when raise_exception then
      v_error := sqlerrm;
    end;
    if v_error is distinct from 'An update of this pack is already waiting for review.' then
      raise exception '0080 self-check failed: a second update was taken while one waits (%)', v_error;
    end if;

    perform public.community_pack_decide(v_update, 'live', null);
    if (select c.state from public.community_packs c where c.id = v_first) is distinct from 'replaced'
       or not exists (select 1 from public.community_pack_shelf() s where s.id = v_update) then
      raise exception '0080 self-check failed: approving an update did not replace the old version';
    end if;

    -- Withdrawing the live version, now version 2, withdraws the update waiting beside it.
    v_third := public.community_pack_submit('Self-check v3', 'Self-check pack', 'Self-check', v_pack, v_update);
    perform public.community_pack_withdraw(v_update);
    if (select c.state from public.community_packs c where c.id = v_third) is distinct from 'withdrawn' then
      raise exception '0080 self-check failed: an update kept waiting after its pack was withdrawn';
    end if;

    -- Taking a live pack down takes its waiting update down with the same reason.
    v_other := public.community_pack_submit('Self-check B', 'Self-check pack', 'Self-check', v_pack);
    perform public.community_pack_decide(v_other, 'live', null);
    v_other_update := public.community_pack_submit('Self-check B2', 'Self-check pack', 'Self-check', v_pack, v_other);
    perform public.community_pack_decide(v_other, 'taken_down', 'Self-check');
    if (select c.state || ':' || c.reason from public.community_packs c where c.id = v_other_update)
       is distinct from 'taken_down:Self-check' then
      raise exception '0080 self-check failed: an update kept waiting after its pack was taken down';
    end if;

    insert into public.user_grants (user_id, kind, key, value, reason)
    values (v_user, 'feature', 'community.publish', '{"value": false}'::jsonb, '0080 self-check');
    v_error := null;
    begin
      perform public.community_pack_submit('Denied', 'd', 'Self-check', v_pack);
    exception when raise_exception then
      v_error := sqlerrm;
    end;
    if v_error is distinct from 'This account cannot submit packs.' then
      raise exception '0080 self-check failed: an account with community.publish off could submit (%)', v_error;
    end if;

    raise exception '0080-self-check-passed';
  exception when raise_exception then
    if sqlerrm <> '0080-self-check-passed' then
      raise;
    end if;
  end;
end;
$$;
