-- One submit gate for both doors (docs/work-specs/community-packs/spec.md AC-12,
-- slice-4-research.md (b)): the shelf's sheet, which calls with a session, and the agent door
-- `POST /api/me/community-packs`, which calls with the service role on behalf of the account an
-- agent key belongs to. An agent key is not a session, so `auth.uid()` is null there.
--
-- The body of 0082's `community_pack_submit` moves into `community_pack_submit_for(p_uid, ...)`,
-- granted to `service_role` only, with every check naming `p_uid`: the account checks go through
-- the service-only `feature_denied_for(p_uid, 'community.publish')` (0022), which answers
-- suspension, the instance-wide switch and the per-account switch alike. No callable predicate
-- taking a user id is added back; 0020 removed one on purpose. The session function becomes a
-- wrapper passing `auth.uid()`, with the same signature, so its grants and callers stay.
set lock_timeout = '2s';
set statement_timeout = '30s';

create or replace function public.community_pack_submit_for(p_uid uuid, p_name text, p_description text, p_author text,
                                                 p_pack jsonb, p_update_of uuid default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
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
  if p_uid is null then
    raise exception 'Sign in to submit a pack.';
  end if;
  -- Suspension, the instance-wide switch, or an admin's per-account switch (0022).
  if public.feature_denied_for(p_uid, 'community.publish') then
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
  if (select count(*) from public.community_packs c where c.author_id = p_uid and c.state = 'in_review') >= 10 then
    raise exception 'Ten packs are already waiting for review. Wait for a decision first.';
  end if;
  if p_update_of is not null then
    -- Locking the live row serialises two updates of one pack sent at the same moment.
    select * into v_live from public.community_packs c
     where c.id = p_update_of and c.author_id = p_uid and c.state = 'live'
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
    v_lineage, v_version, p_uid, v_author, v_name, v_description, v_count,
    p_pack || jsonb_build_object('name', v_name, 'description', v_description, 'author', v_author, 'license', 'CC-BY-4.0')
  )
  returning community_packs.id into v_id;
  return v_id;
end;
$$;
revoke all on function public.community_pack_submit_for(uuid, text, text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.community_pack_submit_for(uuid, text, text, text, jsonb, uuid) to service_role;

-- The session door: the same gate, for the signed-in caller.
create or replace function public.community_pack_submit(p_name text, p_description text, p_author text, p_pack jsonb,
                                             p_update_of uuid default null)
returns uuid
language sql security definer set search_path = '' as $$
  select public.community_pack_submit_for((select auth.uid()), p_name, p_description, p_author, p_pack, p_update_of);
$$;
revoke all on function public.community_pack_submit(text, text, text, jsonb, uuid) from public, anon;
grant execute on function public.community_pack_submit(text, text, text, jsonb, uuid) to authenticated;

-- Self-check, part one: the grants. Only the service role reaches the uid form; the session form
-- keeps 0082's.
do $$
begin
  if has_function_privilege('anon', 'public.community_pack_submit_for(uuid, text, text, text, jsonb, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.community_pack_submit_for(uuid, text, text, text, jsonb, uuid)', 'execute') then
    raise exception '0084 self-check: a client may submit for another account';
  end if;
  if not has_function_privilege('service_role', 'public.community_pack_submit_for(uuid, text, text, text, jsonb, uuid)', 'execute') then
    raise exception '0084 self-check: the service role cannot submit for an account';
  end if;
  if has_function_privilege('anon', 'public.community_pack_submit(text, text, text, jsonb, uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.community_pack_submit(text, text, text, jsonb, uuid)', 'execute') then
    raise exception '0084 self-check: the session door lost its grants';
  end if;
end;
$$;

-- Self-check, part two: CALL both doors. With no session the uid form submits for a named account,
-- which then waits for review, and refuses a null account and a denied `community.publish`; the
-- session form still submits as the signed-in caller and refuses a signed-out one. Everything
-- happens inside a block that ends by raising, so every row rolls back.
do $$
declare
  v_user uuid;
  v_id uuid;
  v_pack jsonb := '{"format":"noacg-pack","version":1,"name":"x","graphics":[{"name":"A"}]}'::jsonb;
  v_error text;
begin
  select u.id into v_user from auth.users u
   where not public.feature_denied_for(u.id, 'community.publish')
     and not exists (select 1 from public.user_grants g
                      where g.user_id = u.id and g.key = 'community.publish' and g.revoked_at is null)
     and (select count(*) from public.community_packs c where c.author_id = u.id and c.state = 'in_review') <= 8
   limit 1;
  if v_user is null then
    raise notice '0084 behaviour self-check skipped: no account on this instance may submit';
    return;
  end if;
  begin
    perform set_config('request.jwt.claims', '', true);
    v_id := public.community_pack_submit_for(v_user, 'Self-check', 'Self-check pack', 'Self-check', v_pack);
    if (select c.author_id from public.community_packs c where c.id = v_id and c.state = 'in_review') is distinct from v_user then
      raise exception '0084 self-check failed: a pack submitted for an account is not that account''s, waiting';
    end if;

    v_error := null;
    begin
      perform public.community_pack_submit_for(null, 'Nobody', 'd', 'Nobody', v_pack);
    exception when raise_exception then
      v_error := sqlerrm;
    end;
    if v_error is distinct from 'Sign in to submit a pack.' then
      raise exception '0084 self-check failed: a pack with no account was taken (%)', v_error;
    end if;

    v_error := null;
    begin
      perform public.community_pack_submit('Signed out', 'd', 'Nobody', v_pack);
    exception when raise_exception then
      v_error := sqlerrm;
    end;
    if v_error is distinct from 'Sign in to submit a pack.' then
      raise exception '0084 self-check failed: the session door took a signed-out pack (%)', v_error;
    end if;

    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    v_id := public.community_pack_submit('Self-check session', 'Self-check pack', 'Self-check', v_pack);
    if (select c.author_id from public.community_packs c where c.id = v_id) is distinct from v_user then
      raise exception '0084 self-check failed: the session door did not submit as the caller';
    end if;

    insert into public.user_grants (user_id, kind, key, value, reason)
    values (v_user, 'feature', 'community.publish', '{"value": false}'::jsonb, '0084 self-check');
    v_error := null;
    begin
      perform public.community_pack_submit_for(v_user, 'Denied', 'd', 'Self-check', v_pack);
    exception when raise_exception then
      v_error := sqlerrm;
    end;
    if v_error is distinct from 'This account cannot submit packs.' then
      raise exception '0084 self-check failed: an account with community.publish off could submit (%)', v_error;
    end if;

    raise exception '0084-self-check-passed';
  exception when raise_exception then
    if sqlerrm <> '0084-self-check-passed' then
      raise;
    end if;
  end;
end;
$$;
