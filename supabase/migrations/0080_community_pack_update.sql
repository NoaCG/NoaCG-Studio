-- Community packs, updates (docs/work-specs/community-packs/spec.md AC-11, D11) and the
-- `community.publish` switch on submit.
--
-- An update is a new row in the live pack's lineage, one version up. It waits for review like a
-- first submission while the live version stays on the shelf; approving it moves the old live row
-- to `replaced`, which `community_pack_decide` (0079) already does. Only the maker of a pack that
-- is live now may update it, and one update at a time waits.
--
-- Submit now also refuses an account whose `community.publish` is denied (an admin's per-account
-- switch, the instance-wide kill switch, or suspension: `feature_denied`, 0022), as the closed
-- gallery's publish path did. Submitting stays moderator-only until the design lock lands (D12).
--
-- The function gains an argument, so the old signature is dropped and the new one created with
-- the same grants. `p_update_of` defaults to null, so a first submission calls it as before.
set lock_timeout = '2s';
set statement_timeout = '30s';

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
    if exists (select 1 from public.community_packs c where c.lineage = v_live.lineage and c.state = 'in_review') then
      raise exception 'An update of this pack is already waiting for review.';
    end if;
    v_lineage := v_live.lineage;
    select max(c.version) + 1 into v_version from public.community_packs c where c.lineage = v_live.lineage;
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

-- Self-check, part one: still closed to anon, still open to a signed-in caller.
do $$
begin
  if has_function_privilege('anon', 'public.community_pack_submit(text, text, text, jsonb, uuid)', 'execute') then
    raise exception '0080 self-check: anon may submit';
  end if;
  if not has_function_privilege('authenticated', 'public.community_pack_submit(text, text, text, jsonb, uuid)', 'execute') then
    raise exception '0080 self-check: a signed-in caller cannot reach submit';
  end if;
end;
$$;

-- Self-check, part two: CALL the doors as an existing account made a moderator for the moment.
-- A live pack takes one update, which waits beside it; a second waits for nothing; approval
-- replaces the old version on the shelf; a denied `community.publish` refuses. Everything happens
-- inside a block that ends by raising, so every row and grant rolls back.
do $$
declare
  v_user uuid;
  v_first uuid;
  v_update uuid;
  v_pack jsonb := '{"format":"noacg-pack","version":1,"name":"x","graphics":[{"name":"A"}]}'::jsonb;
  v_refused boolean;
begin
  select u.id into v_user from auth.users u
   where not exists (select 1 from public.user_accounts a where a.user_id = u.id and a.state = 'suspended')
     and not public.feature_denied_for(u.id, 'community.publish')
     -- One active grant per key (0021), so the denying one below needs a free slot.
     and not exists (select 1 from public.user_grants g
                      where g.user_id = u.id and g.key = 'community.publish' and g.revoked_at is null)
   limit 1;
  if v_user is null then
    raise notice '0080 behaviour self-check skipped: no account on this instance';
    return;
  end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    insert into public.moderators (user_id, note) values (v_user, '0080 self-check') on conflict (user_id) do nothing;

    v_first := public.community_pack_submit('Self-check', 'Self-check pack', 'Self-check', v_pack);
    v_refused := false;
    begin
      perform public.community_pack_submit('Early', 'd', 'Self-check', v_pack, v_first);
    exception when raise_exception then
      v_refused := true;
    end;
    if not v_refused then
      raise exception '0080 self-check failed: a pack in review took an update';
    end if;

    perform public.community_pack_decide(v_first, 'live', null);
    v_update := public.community_pack_submit('Self-check v2', 'Self-check pack', 'Self-check', v_pack, v_first);
    if (select c.version from public.community_packs c where c.id = v_update) is distinct from 2
       or (select c.lineage from public.community_packs c where c.id = v_update)
          is distinct from (select c.lineage from public.community_packs c where c.id = v_first) then
      raise exception '0080 self-check failed: an update is not the next version of its pack';
    end if;
    if not exists (select 1 from public.community_pack_shelf() s where s.id = v_first)
       or exists (select 1 from public.community_pack_shelf() s where s.id = v_update) then
      raise exception '0080 self-check failed: the live version did not stay while its update waits';
    end if;

    v_refused := false;
    begin
      perform public.community_pack_submit('Second', 'd', 'Self-check', v_pack, v_first);
    exception when raise_exception then
      v_refused := true;
    end;
    if not v_refused then
      raise exception '0080 self-check failed: a second update was taken while one waits';
    end if;

    perform public.community_pack_decide(v_update, 'live', null);
    if (select c.state from public.community_packs c where c.id = v_first) is distinct from 'replaced'
       or not exists (select 1 from public.community_pack_shelf() s where s.id = v_update) then
      raise exception '0080 self-check failed: approving an update did not replace the old version';
    end if;

    insert into public.user_grants (user_id, kind, key, value, reason)
    values (v_user, 'feature', 'community.publish', '{"value": false}'::jsonb, '0080 self-check');
    v_refused := false;
    begin
      perform public.community_pack_submit('Denied', 'd', 'Self-check', v_pack);
    exception when raise_exception then
      v_refused := sqlerrm = 'This account cannot submit packs.';
    end;
    if not v_refused then
      raise exception '0080 self-check failed: an account with community.publish off could submit';
    end if;

    raise exception '0080-self-check-passed';
  exception when raise_exception then
    if sqlerrm <> '0080-self-check-passed' then
      raise;
    end if;
  end;
end;
$$;
