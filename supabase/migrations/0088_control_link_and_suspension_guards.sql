-- live-path: control_data_patch_by_slug gets a stricter guard (same signature, same grants, every press the product sends still lands); no table, trigger, topic or other control_* function changes
--
-- Issue #795: a control link could wipe production data, and a suspended account could still write.
--
-- THE CONTROL LINK. 0060's guard on `control_data_patch_by_slug` read the PATH a patch names and
-- never the VALUE, and the slug is a link handed to a class or a second phone. Measured on staging
-- on 2026-09-16, three writes got through that the door exists to refuse:
--   * `{"drivers":[]}` deleted a whole branch through the array carve-out, because `drivers.0.gap`
--     is bound and the carve-out only asked that some binding reach through an index;
--   * `{"drivers":[{"gap":"x"}]}` cut a twenty-car grid to one car, and dropped that car's name;
--   * `{"match":{"home":{"score":null}}}` and `{"panel":{"katri":{"points":{}}}}` erased a bound
--     value without a trace: neither can be formatted into a field, so no `update` row is written,
--     the graphic on air keeps the old figure and the tree no longer holds it.
-- The new guard keeps every press the product sends (src/model/productionData.ts `retypeLeaf`
-- produces only strings, numbers, booleans and arrays of those) and refuses or ignores the rest:
--   1. A path a binding names EXACTLY may receive a field value only - a scalar, an array of
--      scalars, or `[]`, which is the clear press on a bound list - and only over a value that is
--      one already, or over nothing. JSON null and `{}` are refused, and so is replacing a branch
--      someone happened to bind (`grid` bound, `{"grid":"x"}` would replace the whole branch).
--   2. An ARRAY sent over a branch a binding reaches into by index (merge-patch cannot address an
--      element, so a press on `drivers.0.gap` sends the whole array) now moves the BOUND LEAVES of
--      that array and nothing else: the stored array is kept, and only the bound leaves the sent
--      array changes are copied into it. An array that is shorter, longer, or different anywhere a
--      binding does not reach changes nothing there. That also stops a press made from a stale
--      copy of the tree undoing what a feed wrote in the same array meanwhile.
--   3. A patch may not pass through anything but an object on its way to a bound path: the merge
--      replaces whatever is not one, so `{"drivers":{"0":{"gap":"x"}}}` named the bound
--      `drivers.0.gap` and turned the whole grid into an object. A patch key containing a dot is
--      refused too: such a key could pass for a bound path while writing a different key.
-- The row is locked FOR NO KEY UPDATE before it is read, the lock `control_data_apply` takes anyway
-- (0071's lock order), so the stored array the press is merged into cannot move underneath it.
-- Whether emptying a bound list should also blank the graphic (0048's formatter writes nothing for
-- `[]`) is left alone: that is a product question about 0048, not part of this guard.
--
-- SUSPENSION. 0018 made suspension stop every write a signed-in account makes to its own content
-- (reads and deletes stay open), and 0053 says so in its comment. Four writes were left out:
--   * `teams`: renaming a team its owner holds (UPDATE had no restrictive policy, only INSERT);
--   * `team_rotate_code`: a definer function never meets a policy, and unlike `team_join` and
--     `team_production_save` it carried no test - a suspended owner could lock teammates out of
--     joining by rotating the code;
--   * `storage.objects` in `user-assets`: INSERT was gated, UPDATE (an upsert over an existing
--     upload) was not.
--   * `community_pack_report` (0086) writes a report row and carries no test either.
-- Each gets the same test 0018/0053/0079 use. Additive: two new restrictive policies and three
-- function bodies replaced with their signatures and grants unchanged.
--
-- No statement here is one `npm run db:push` refuses: nothing is dropped, revoked from an existing
-- object or deleted. The self-checks below run inside a block that is always rolled back, so they
-- leave nothing behind on any database. Revert: restore control_data_patch_by_slug from 0060,
-- team_rotate_code from 0053 and community_pack_report from 0086, drop the two policies and
-- production_data_is_value.
set lock_timeout = '2s';
set statement_timeout = '30s';

-- ── 1. What a field can hold ──────────────────────────────────────────────────────────────────
-- A scalar, an array of scalars, or the empty list. `production_data_format` (0048) already answers
-- non-null for exactly the first two; `[]` is added because it is the clear press on a bound list.
create or replace function public.production_data_is_value(p_value jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_value = '[]'::jsonb or public.production_data_format(p_value) is not null, false);
$$;
revoke execute on function public.production_data_is_value(jsonb) from public, anon, authenticated;
grant execute on function public.production_data_is_value(jsonb) to service_role;

-- ── 2. The operator's door, guarded by value as well as by path ───────────────────────────────
create or replace function public.control_data_patch_by_slug(p_slug text, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
  v_bindings jsonb;
  v_data jsonb;
  v_patch jsonb := p_patch;
  v_named record;
  v_at text[];
  v_bound text;
  v_rel text[];
  v_stored jsonb;
  v_kept jsonb;
  v_old jsonb;
  v_new jsonb;
  v_i int;
begin
  select s.id, coalesce(s.bindings, '{}'::jsonb), coalesce(s.data, '{}'::jsonb)
    into v_show, v_bindings, v_data
    from public.control_shows s where s.slug = p_slug and p_slug is not null
    for no key update;
  if v_show is null then raise exception 'unknown control slug'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'not a data patch'; end if;

  for v_named in select p.path, p.value from public.production_data_patch_paths(p_patch) p loop
    v_at := string_to_array(v_named.path, '.');
    -- A key with a dot in it names one path in the grammar and writes another key in the tree.
    if p_patch #> v_at is distinct from v_named.value then
      raise exception 'not a bound path: %', v_named.path using errcode = '42501';
    end if;
    -- The merge walks INTO every branch above the path, and replaces whatever there is not an
    -- object: `{"drivers":{"0":{"gap":"x"}}}` names the bound `drivers.0.gap` and would turn the
    -- whole grid into an object holding one gap.
    for v_i in 1 .. coalesce(array_length(v_at, 1), 1) - 1 loop
      if jsonb_typeof(v_data #> v_at[1:v_i]) not in ('object', 'null') then
        raise exception 'not a field value: %', v_named.path using errcode = '42501';
      end if;
    end loop;

    -- (1) A path a binding names exactly: a field value, over a field value or over nothing.
    if exists (
      select 1
      from jsonb_each(v_bindings) g
      cross join lateral jsonb_each_text(
        case when jsonb_typeof(g.value) = 'object' then g.value else '{}'::jsonb end) f
      where f.value = v_named.path
    ) then
      v_old := v_data #> v_at;
      if not public.production_data_is_value(v_named.value)
         or not (v_old is null or v_old in ('null'::jsonb, '{}'::jsonb) or public.production_data_is_value(v_old)) then
        raise exception 'not a field value: %', v_named.path using errcode = '42501';
      end if;
      continue;
    end if;

    -- (2) An array over a branch a binding reaches into BY INDEX (0060's carve-out, with its
    --     prefix test and its index test unchanged): only that array's bound leaves move.
    if jsonb_typeof(v_named.value) = 'array' and exists (
      select 1
      from jsonb_each(v_bindings) g
      cross join lateral jsonb_each_text(
        case when jsonb_typeof(g.value) = 'object' then g.value else '{}'::jsonb end) f
      where starts_with(f.value, v_named.path || '.')
        and split_part(substr(f.value, length(v_named.path) + 2), '.', 1) ~ '^[0-9]+$'
    ) then
      v_stored := v_data #> v_at;
      if jsonb_typeof(v_stored) is distinct from 'array' then
        raise exception 'not a field value: %', v_named.path using errcode = '42501';
      end if;
      v_kept := v_stored;
      for v_bound in
        select distinct f.value
        from jsonb_each(v_bindings) g
        cross join lateral jsonb_each_text(
          case when jsonb_typeof(g.value) = 'object' then g.value else '{}'::jsonb end) f
        where starts_with(f.value, v_named.path || '.')
          and split_part(substr(f.value, length(v_named.path) + 2), '.', 1) ~ '^[0-9]+$'
      loop
        v_rel := string_to_array(substr(v_bound, length(v_named.path) + 2), '.');
        v_new := v_named.value #> v_rel;
        v_old := v_stored #> v_rel;
        -- Not in what was sent, or unchanged: nothing to move.
        continue when v_new is null or v_new is not distinct from v_old;
        -- A leaf the stored array has no place for (an element past its end, a missing branch)
        -- is not created: only a key missing from an object that exists may be added.
        continue when v_old is null
          and jsonb_typeof(v_stored #> v_rel[1:array_length(v_rel, 1) - 1]) is distinct from 'object';
        if not public.production_data_is_value(v_new)
           or not (v_old is null or v_old in ('null'::jsonb, '{}'::jsonb) or public.production_data_is_value(v_old)) then
          raise exception 'not a field value: %', v_bound using errcode = '42501';
        end if;
        v_kept := jsonb_set(v_kept, v_rel, v_new, true);
      end loop;
      v_patch := jsonb_set(v_patch, v_at, v_kept, false);
      continue;
    end if;

    raise exception 'not a bound path: %', v_named.path using errcode = '42501';
  end loop;

  return public.control_data_apply(v_show, v_patch, 'operator');
end $$;

-- ── 3. Suspension stops the four writes it missed ─────────────────────────────────────────────
create policy "teams_not_suspended_update" on public.teams
  as restrictive for update to authenticated
  using (not (select public.is_suspended()))
  with check (not (select public.is_suspended()));

-- Only `user-assets` is the account's own library; every other bucket passes through untouched,
-- because a restrictive policy applies to every row of storage.objects.
create policy "user_assets_not_suspended_update" on storage.objects
  as restrictive for update to authenticated
  using (bucket_id <> 'user-assets' or not (select public.is_suspended()))
  with check (bucket_id <> 'user-assets' or not (select public.is_suspended()));

-- 0053's body, with the test `team_join` and `team_production_save` already carry.
create or replace function public.team_rotate_code(p_team uuid)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_code text;
begin
  if v_user is null then
    raise exception 'rotating a join code needs a signed-in account' using errcode = '42501';
  end if;
  if public.is_suspended() then
    raise exception 'this account is suspended' using errcode = '42501';
  end if;
  update public.teams t
     set join_code = translate(encode(extensions.gen_random_bytes(6), 'base64'), '+/', '-_')
   where t.id = p_team and t.owner_id = v_user
   returning t.join_code into v_code;
  if v_code is null then
    raise exception 'only the team owner may rotate the join code' using errcode = '42501';
  end if;
  return v_code;
end $$;

-- 0086's body, with the test `community_pack_submit` (0079) already carries.
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
  if public.is_suspended() then
    raise exception 'This account cannot report packs.';
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

-- ── 4. Prove it, then roll the proof back ──────────────────────────────────────────────────────
-- supabase/AGENTS.md: a self-check proves shape, so CALL the thing. Everything the behavioural part
-- makes - a throwaway account on an empty instance, a production, a team, a suspension - is made
-- inside a block that ends by raising a sentinel, which rolls the block back; any other error is
-- re-raised and fails the migration. So the proof runs on every instance, production included,
-- and leaves nothing on any of them.
do $$
declare
  v_role text := current_role;
  v_user uuid;
  v_show uuid := '00000000-0088-4000-8000-000000000088';
  v_team uuid := '00000000-0088-4000-8000-000000000089';
  v_slug text;
  v_got jsonb;
  v_n int;
  v_refused text;
  v_case record;
  v_before jsonb;
begin
  -- (a) Shape.
  if to_regprocedure('public.production_data_is_value(jsonb)') is null then
    raise exception '0088 self-check failed: production_data_is_value is missing';
  end if;
  if not has_function_privilege('anon', 'public.control_data_patch_by_slug(text,jsonb)', 'execute') then
    raise exception '0088 self-check failed: the operator door is shut to a signed-out page';
  end if;
  if has_function_privilege('anon', 'public.production_data_is_value(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.production_data_is_value(jsonb)', 'execute') then
    raise exception '0088 self-check failed: production_data_is_value is reachable from a client';
  end if;
  if not has_function_privilege('authenticated', 'public.team_rotate_code(uuid)', 'execute')
     or has_function_privilege('anon', 'public.team_rotate_code(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.community_pack_report(uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.community_pack_report(uuid,text)', 'execute') then
    raise exception '0088 self-check failed: a replaced function lost or gained a grant';
  end if;
  if (select count(*) from pg_policies p
       where p.permissive = 'RESTRICTIVE' and p.cmd = 'UPDATE'
         and ((p.schemaname = 'public' and p.tablename = 'teams' and p.policyname = 'teams_not_suspended_update')
           or (p.schemaname = 'storage' and p.tablename = 'objects' and p.policyname = 'user_assets_not_suspended_update'))) <> 2 then
    raise exception '0088 self-check failed: a suspension gate on UPDATE is missing or permissive';
  end if;

  -- (b) Behaviour, always rolled back.
  begin
    select u.id into v_user from auth.users u order by u.created_at limit 1;
    if v_user is null then
      begin
        insert into auth.users (id, instance_id, aud, role, email)
        values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
                'authenticated', 'authenticated', '0088-self-check@noacg.invalid')
        returning id into v_user;
      exception when others then
        raise notice '0088 self-check: no account and none could be made (%), skipping the behavioural half', sqlerrm;
        v_user := null;
      end;
    end if;

    if v_user is not null then
      -- THE CONTROL LINK. A grid of three, a bound list, and a binding on a whole branch.
      insert into public.control_shows (id, owner_id, title, data, bindings)
        values (v_show, v_user, '0088 self-check',
                '{"match":{"home":{"score":4}},
                  "drivers":[{"name":"Ada","gap":"LEADER"},{"name":"Ben","gap":"+0.5"},{"name":"Cy","gap":"+1.0"}],
                  "panel":{"katri":{"points":3}},
                  "bingo":{"called":["K7"]},
                  "grid":{"rows":2}}'::jsonb,
                '{"Board":{"f1":"match.home.score","f5":"bingo.called","f6":"grid"},
                  "Bug":{"f3":"drivers.0.gap","f4":"drivers.2.gap"},
                  "Panel":{"f2":"panel.katri.points"}}'::jsonb)
        returning slug into v_slug;
      select s.data into v_before from public.control_shows s where s.id = v_show;

      -- Refused, and the tree untouched. The first five are 0060's own rows, still refused.
      for v_case in select * from (values
        ('{"match":null}', 'not a bound path: match'),
        ('{"match":"gone"}', 'not a bound path: match'),
        ('{"match":[]}', 'not a bound path: match'),
        ('{"weather":{"temp":4}}', 'not a bound path: weather.temp'),
        ('{"%":[1]}', 'not a bound path: %'),
        ('{"match":{"home":{"score":null}}}', 'not a field value: match.home.score'),
        ('{"panel":{"katri":{"points":{}}}}', 'not a field value: panel.katri.points'),
        ('{"grid":"x"}', 'not a field value: grid'),
        ('{"drivers":[{"name":"Ada","gap":null}]}', 'not a field value: drivers.0.gap'),
        ('{"drivers":[{"name":"Ada","gap":{}}]}', 'not a field value: drivers.0.gap'),
        ('{"drivers.0":{"gap":"x"}}', 'not a bound path: drivers.0.gap'),
        ('{"drivers":{"0":{"gap":"x"}}}', 'not a field value: drivers.0.gap')
      ) t(patch, expected) loop
        v_refused := null;
        begin
          perform public.control_data_patch_by_slug(v_slug, v_case.patch::jsonb);
        exception when others then v_refused := sqlerrm;
        end;
        if v_refused is distinct from v_case.expected then
          raise exception '0088 self-check failed: % answered "%", expected "%"',
            v_case.patch, coalesce(v_refused, 'accepted'), v_case.expected;
        end if;
      end loop;
      if (select s.data from public.control_shows s where s.id = v_show) is distinct from v_before then
        raise exception '0088 self-check failed: a refused patch moved the tree';
      end if;

      -- An array that would delete, truncate or rename the grid moves nothing but bound leaves.
      perform public.control_data_patch_by_slug(v_slug, '{"drivers":[]}'::jsonb);
      perform public.control_data_patch_by_slug(v_slug, '{"drivers":[{"name":"EVIL","gap":"LEADER"}]}'::jsonb);
      if (select s.data from public.control_shows s where s.id = v_show) is distinct from v_before then
        raise exception '0088 self-check failed: an array over the grid deleted or renamed something';
      end if;
      v_got := public.control_data_patch_by_slug(v_slug, '{"drivers":[{"gap":"+0.1"}]}'::jsonb);
      if v_got #> '{data,drivers}' is distinct from
         '[{"name":"Ada","gap":"+0.1"},{"name":"Ben","gap":"+0.5"},{"name":"Cy","gap":"+1.0"}]'::jsonb then
        raise exception '0088 self-check failed: a short array press did not keep the grid (%)', v_got #> '{data,drivers}';
      end if;
      if not exists (select 1 from public.control_events e
                      where e.show_id = v_show and e.graphic = 'Bug' and e.msg #>> '{data,f3}' = '+0.1') then
        raise exception '0088 self-check failed: the bound leaf moved but its field was not written';
      end if;
      -- What the product actually sends: the whole array, one bound leaf changed.
      v_got := public.control_data_patch_by_slug(v_slug,
        '{"drivers":[{"name":"Ada","gap":"+0.1"},{"name":"Ben","gap":"+0.5"},{"name":"Cy","gap":"+2.0"}]}'::jsonb);
      if v_got #>> '{data,drivers,2,gap}' is distinct from '+2.0' or jsonb_array_length(v_got #> '{data,drivers}') <> 3 then
        raise exception '0088 self-check failed: a whole-array press on drivers.2.gap did not land';
      end if;

      -- The ordinary presses still land: a score, a list add, and the list clear.
      v_got := public.control_data_patch_by_slug(v_slug, '{"match":{"home":{"score":6}}}'::jsonb);
      if v_got #>> '{data,match,home,score}' is distinct from '6' then
        raise exception '0088 self-check failed: a score press did not land';
      end if;
      v_got := public.control_data_patch_by_slug(v_slug, '{"bingo":{"called":["K7","B2"]}}'::jsonb);
      if v_got #> '{data,bingo,called}' is distinct from '["K7","B2"]'::jsonb then
        raise exception '0088 self-check failed: a list press did not land';
      end if;
      v_got := public.control_data_patch_by_slug(v_slug, '{"bingo":{"called":[]}}'::jsonb);
      if v_got #> '{data,bingo,called}' is distinct from '[]'::jsonb then
        raise exception '0088 self-check failed: the list clear press did not land';
      end if;

      -- SUSPENSION. The same account owns a team, and is then suspended.
      insert into public.teams (id, name, owner_id) values (v_team, '0088 self-check', v_user);
      perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
      set local role authenticated;
      -- Not suspended yet: the gates must not deny everybody.
      update public.teams t set name = '0088 renamed' where t.id = v_team;
      get diagnostics v_n = row_count;
      if v_n <> 1 then
        raise exception '0088 self-check failed: an active owner could not rename their team';
      end if;
      execute format('set local role %I', v_role);
      insert into public.user_accounts (user_id, state) values (v_user, 'suspended')
        on conflict (user_id) do update set state = 'suspended';
      set local role authenticated;
      update public.teams t set name = '0088 suspended rename' where t.id = v_team;
      get diagnostics v_n = row_count;
      if v_n <> 0 then
        raise exception '0088 self-check failed: a suspended owner renamed their team';
      end if;
      v_refused := null;
      begin
        perform public.team_rotate_code(v_team);
      exception when others then v_refused := sqlerrm;
      end;
      if v_refused is distinct from 'this account is suspended' then
        raise exception '0088 self-check failed: a suspended owner rotated the join code (%)', coalesce(v_refused, 'accepted');
      end if;
      v_refused := null;
      begin
        perform public.community_pack_report(gen_random_uuid(), 'spam');
      exception when others then v_refused := sqlerrm;
      end;
      if v_refused is distinct from 'This account cannot report packs.' then
        raise exception '0088 self-check failed: a suspended account could file a report (%)', coalesce(v_refused, 'accepted');
      end if;
      execute format('set local role %I', v_role);
    end if;

    raise exception '0088 self-check passed';
  exception when others then
    -- The rollback already undid the SET LOCAL ROLE; said again so no path can leave it changed.
    execute format('set local role %I', v_role);
    if sqlerrm <> '0088 self-check passed' then raise; end if;
  end;
end $$;
