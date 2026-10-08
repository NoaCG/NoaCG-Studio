-- Close the Era 5.5 community gallery (0004) to new publishing, and keep what is already there
-- read-only. Owner decision 2026-10-08: the gallery let any signed-in user publish a single graphic
-- straight to 'approved' with no human review, against the 2026-10-02 ruling that the community
-- shares reviewed packs only (docs/research/community-packs-2026-10-07/README.md).
--
-- Production count before this migration (2026-10-08, read-only): 0 rows in community_templates,
-- so 0 publishers and 0 imports; 0 reports, 0 moderators; one orphaned 70-byte object in the
-- community-assets bucket from 2026-07-07. Nothing is deleted here.
--
-- What changes, all as RESTRICTIVE policies, so they AND with every policy already on these tables
-- (0004, 0005, 0020, 0022):
--   * INSERT on community_templates is refused for every signed-in user, moderators included.
--   * UPDATE is left to moderators only: an existing row stays as published (read-only), and a
--     moderator can still take it down. Its author can still withdraw it (DELETE is untouched).
--   * INSERT into the public community-assets bucket is refused, since a world-readable upload is
--     publishing too.
-- The browse RPCs (community_list / community_get), reports and moderation are unchanged in the
-- database. Their UI (CommunityGallery, ModerationQueue) lives in the old code editor, which no
-- route renders since 2026-09-24, so in the product an author's own list in Home is what remains.
--
-- Revert: drop the three policies by name. No column, grant or row changes, so that is the whole
-- undo.
set lock_timeout = '2s';
set statement_timeout = '30s';

create policy "community_publishing_closed" on public.community_templates
  as restrictive for insert to authenticated
  with check (false);

create policy "community_read_only" on public.community_templates
  as restrictive for update to authenticated
  using (public.is_moderator()) with check (public.is_moderator());

create policy "community_assets_closed" on storage.objects
  as restrictive for insert to authenticated
  with check (bucket_id is distinct from 'community-assets');

-- Self-check: CALL the boundary as a signed-in user, rather than reading the policy back. A
-- synthetic subject is enough, because auth.uid() reads the claim, and the refusal comes before any
-- foreign key is looked at. The role is restored BY NAME on every path out,
-- failing ones included (supabase/AGENTS.md, "A migration must
-- never change the session role").
do $$
declare
  v_role        constant text := current_role;
  v_prev_claims constant text := current_setting('request.jwt.claims', true);
  v_subject     constant uuid := gen_random_uuid();
  v_refused     boolean;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_subject, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- (a) A publish through the table, exactly as the retired client sent it.
  v_refused := false;
  begin
    insert into public.community_templates (author_id, kind, name, body)
      values (v_subject, 'graphic', '0078 self-check', '{}'::jsonb);
  exception when insufficient_privilege then
    -- THIS policy's refusal, not some other one that happens to deny this subject.
    v_refused := sqlerrm like '%community_publishing_closed%';
  end;
  if not v_refused then
    execute format('set local role %I', v_role);
    raise exception '0078 self-check (a) FAILED: a signed-in user could still publish to the gallery';
  end if;

  -- (b) An upload into the public bucket under the caller's own folder, which 0004 allowed.
  v_refused := false;
  begin
    insert into storage.objects (bucket_id, name, owner_id)
      values ('community-assets', v_subject::text || '/0078-self-check', v_subject::text);
  exception when insufficient_privilege then
    v_refused := sqlerrm like '%community_assets_closed%';
  end;
  if not v_refused then
    execute format('set local role %I', v_role);
    raise exception '0078 self-check (b) FAILED: a signed-in user could still upload to community-assets';
  end if;

  execute format('set local role %I', v_role);
  perform set_config('request.jwt.claims', v_prev_claims, true);
end $$;

-- Self-check, read-only half: an already-published row refuses its author's edit (a restrictive
-- USING hides the row, so the UPDATE matches nothing rather than raising) and still accepts its
-- author's withdrawal. It needs a real account for the foreign key; the probe row lives in a
-- subtransaction that is always undone, so nothing is left behind and nothing is deleted here.
do $$
declare
  v_role        constant text := current_role;
  v_prev_claims constant text := current_setting('request.jwt.claims', true);
  v_author      uuid;
  v_id          uuid := gen_random_uuid();
  v_edited      int := -1;
  v_withdrawn   int := -1;
begin
  select u.id into v_author from auth.users u limit 1;
  if v_author is null then
    raise notice '0078 self-check: no auth.users row, skipping the read-only walk';
    return;
  end if;
  begin
    insert into public.community_templates (id, author_id, kind, name, body)
      values (v_id, v_author, 'graphic', '0078 self-check', '{}'::jsonb);
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_author, 'role', 'authenticated')::text, true);
    set local role authenticated;
    update public.community_templates t set name = '0078 edited' where t.id = v_id;
    get diagnostics v_edited = row_count;
    delete from public.community_templates t where t.id = v_id;
    get diagnostics v_withdrawn = row_count;
    execute format('set local role %I', v_role);
    raise exception using errcode = 'P0078', message = '0078 self-check undo';
  exception when sqlstate 'P0078' then
    null;   -- the probe row and the claim are rolled back with the subtransaction
  end;
  perform set_config('request.jwt.claims', v_prev_claims, true);
  if current_role is distinct from v_role then
    raise exception '0078 self-check: the applying role was not restored (now %)', current_role;
  end if;
  if v_edited <> 0 then
    raise exception '0078 self-check (c) FAILED: an author could still edit a published row (% rows)', v_edited;
  end if;
  if v_withdrawn <> 1 then
    raise exception '0078 self-check (d) FAILED: an author could no longer withdraw a row (% rows)', v_withdrawn;
  end if;
end $$;
