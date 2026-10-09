-- Community packs open to every maker (docs/work-specs/community-packs/spec.md D12).
--
-- Until the design lock (AC-5) was in, submit admitted moderators only, so no outside pack could
-- go live and be edited after install. The lock is in: an installed pack's graphics offer no door
-- to the editor and keep their stamp through Duplicate, Save As and a production's export and
-- import. So submit now admits every signed-in account. Everything else 0080 checks stays: the
-- `community.publish` switch, the sizes, no cues, ten waiting packs per maker, one waiting update
-- per pack. Approval stays a moderator's (`community_pack_decide`), so nothing reaches the shelf
-- unreviewed.
--
-- Same signature as 0080, so `create or replace` keeps its grants; the self-check asserts them.
set lock_timeout = '2s';
set statement_timeout = '30s';

create or replace function public.community_pack_submit(p_name text, p_description text, p_author text, p_pack jsonb,
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

-- Self-check, part one: signed-out callers still cannot submit; signed-in ones can.
do $$
begin
  if has_function_privilege('anon', 'public.community_pack_submit(text, text, text, jsonb, uuid)', 'execute') then
    raise exception '0082 self-check: anon may submit';
  end if;
  if not has_function_privilege('authenticated', 'public.community_pack_submit(text, text, text, jsonb, uuid)', 'execute') then
    raise exception '0082 self-check: a signed-in caller cannot submit';
  end if;
end;
$$;

-- Self-check, part two: CALL submit as an existing account that is NOT a moderator. It is taken
-- and waits for review, the account cannot approve it, and a denied `community.publish` still
-- refuses. Everything happens inside a block that ends by raising, so every row rolls back.
do $$
declare
  v_user uuid;
  v_id uuid;
  v_pack jsonb := '{"format":"noacg-pack","version":1,"name":"x","graphics":[{"name":"A"}]}'::jsonb;
  v_error text;
begin
  select u.id into v_user from auth.users u
   where not exists (select 1 from public.moderators m where m.user_id = u.id)
     and not exists (select 1 from public.user_accounts a where a.user_id = u.id and a.state = 'suspended')
     and not public.feature_denied_for(u.id, 'community.publish')
     -- One active grant per key (0021), so the denying one below needs a free slot.
     and not exists (select 1 from public.user_grants g
                      where g.user_id = u.id and g.key = 'community.publish' and g.revoked_at is null)
     and (select count(*) from public.community_packs c where c.author_id = u.id and c.state = 'in_review') <= 9
   limit 1;
  if v_user is null then
    raise notice '0082 behaviour self-check skipped: no non-moderator account on this instance';
    return;
  end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

    v_id := public.community_pack_submit('Self-check', 'Self-check pack', 'Self-check', v_pack);
    if (select c.state from public.community_packs c where c.id = v_id) is distinct from 'in_review' then
      raise exception '0082 self-check failed: a maker''s pack is not waiting for review';
    end if;

    v_error := null;
    begin
      perform public.community_pack_decide(v_id, 'live', null);
    exception when raise_exception then
      v_error := sqlerrm;
    end;
    if v_error is distinct from 'Only a NoaCG admin can decide on a pack.' then
      raise exception '0082 self-check failed: a maker approved their own pack (%)', v_error;
    end if;

    insert into public.user_grants (user_id, kind, key, value, reason)
    values (v_user, 'feature', 'community.publish', '{"value": false}'::jsonb, '0082 self-check');
    v_error := null;
    begin
      perform public.community_pack_submit('Denied', 'd', 'Self-check', v_pack);
    exception when raise_exception then
      v_error := sqlerrm;
    end;
    if v_error is distinct from 'This account cannot submit packs.' then
      raise exception '0082 self-check failed: an account with community.publish off could submit (%)', v_error;
    end if;

    raise exception '0082-self-check-passed';
  exception when raise_exception then
    if sqlerrm <> '0082-self-check-passed' then
      raise;
    end if;
  end;
end;
$$;
