-- live-path: two columns, two before triggers and a version read on control_shows, inert until a publish names its revision
--
-- A PUBLICATION NEVER REPLACES A NEWER ONE (docs/work-specs/live-publishing/designs/G3.md section 2).
--
-- From live-publishing phase 6 every publish from a new page names the saved revision it was built
-- from (`output.ver.r`, the `rev` of 0116). Two columns on control_shows:
--   published_rev  the saved revision the publication shows, kept by the guard below;
--   published_ver  a copy of `output->'ver'`, so a page or an output reads the stamp without the
--                  server decompressing the whole payload (reading one key of a jsonb value reads
--                  all of it).
--
-- Two before triggers, each naming its columns, so a statement that names neither (a Take's
-- heartbeat, a report, a Pause, a sources write) never runs them, and no payload is ever compared:
--   control_publication_guard_a_rev     an update naming published_rev (a revision-only update: the
--                                       content is the same, only the revision it shows moves) is
--                                       skipped unless the new value is set, not lower than the old
--                                       one and not greater than the record's own revision;
--   control_publication_guard_b_output  an insert, or an update naming output (a publish), copies the
--                                       stamp into published_ver and then by `ver.r`:
--                                         greater than the record's revision   refused;
--                                         lower than published_rev             skipped, nothing written;
--                                         otherwise                            published_rev := r;
--                                         absent, switch on, published_rev set refused, "Reload this page to edit";
--                                         absent otherwise                     lands, published_rev := null.
-- A skipped row is what the writer's own filter would answer: no row. The writer reads the stamp
-- again and decides (G3 section 3). The write keeps its lock (FOR NO KEY UPDATE, which a Take's
-- KEY SHARE passes, 0071); the triggers take no lock and read only the record's revision by primary
-- key and the switch.
--
-- control_output_version(p_output_slug) answers {ver, rev} for an output, from the two small
-- columns, for an output's periodic check (G3 section 6). auto_publish_state() answers whether this
-- guard is installed and whether the `auto_publish` switch (a system_settings row, value
-- {"on": true}) is on; signed-in pages only. Installing this file changes nothing visible: the
-- refusal needs the switch, and the skip needs a `ver.r` that only the new app writes. Turning the
-- switch on is a separate step (G3 section 8). Back out: delete the row or set "on" to false.
--
-- Additive: two nullable columns, new functions and triggers; no existing column, signature, grant
-- or policy changes. The backfill of published_ver leaves updated_at alone (0107's pattern).
-- Revert: drop the two triggers, the five functions and the two columns.

set lock_timeout = '2s';
set statement_timeout = '60s';

alter table public.control_shows add column if not exists published_rev bigint;
alter table public.control_shows add column if not exists published_ver jsonb;

alter table public.control_shows disable trigger control_shows_set_updated_at;
update public.control_shows set published_ver = output->'ver' where output ? 'ver' and published_ver is null;
alter table public.control_shows enable trigger control_shows_set_updated_at;

-- Whether the switch is on. Definer, because system_settings is the service role's.
create or replace function public.auto_publish_on()
returns boolean
language sql security definer set search_path = '' stable as $$
  select coalesce((select (s.value->>'on')::boolean from public.system_settings s where s.key = 'auto_publish'), false);
$$;
revoke all on function public.auto_publish_on() from public, anon, authenticated;

create or replace function public.auto_publish_state()
returns jsonb
language sql security definer set search_path = '' stable as $$
  select jsonb_build_object('installed', true, 'on', public.auto_publish_on());
$$;
revoke all on function public.auto_publish_state() from public, anon, authenticated;
grant execute on function public.auto_publish_state() to authenticated;

-- The production record's current saved revision, personal or team (0116).
create or replace function public.control_record_rev(p_id uuid)
returns bigint
language sql security definer set search_path = '' stable as $$
  select greatest(
    (select d.rev from public.documents d where d.id = p_id and d.kind = 'show'),
    (select t.rev from public.team_productions t where t.id = p_id));
$$;
revoke all on function public.control_record_rev(uuid) from public, anon, authenticated;

create or replace function public.control_publication_guard_rev()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.published_rev is null
     or (old.published_rev is not null and new.published_rev < old.published_rev)
     or new.published_rev > coalesce(public.control_record_rev(new.id), 0) then
    return null;
  end if;
  return new;
end $$;
revoke all on function public.control_publication_guard_rev() from public, anon, authenticated;

create or replace function public.control_publication_guard_output()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ver jsonb := new.output->'ver';
  v_r   bigint;
begin
  new.published_ver := v_ver;
  if v_ver is null or v_ver->>'r' is null then
    if tg_op = 'UPDATE' and old.published_rev is not null and public.auto_publish_on() then
      raise exception 'Reload this page to edit' using errcode = 'P0001',
        hint = 'This page was opened before automatic updates. Takes still work; reload it to edit the production.';
    end if;
    new.published_rev := null;
    return new;
  end if;
  v_r := (v_ver->>'r')::bigint;
  if v_r > coalesce(public.control_record_rev(new.id), 0) then
    raise exception 'This publication names a save that does not exist' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and old.published_rev is not null and v_r < old.published_rev then
    return null;
  end if;
  new.published_rev := v_r;
  return new;
end $$;
revoke all on function public.control_publication_guard_output() from public, anon, authenticated;

drop trigger if exists control_publication_guard_a_rev on public.control_shows;
create trigger control_publication_guard_a_rev
  before update of published_rev on public.control_shows
  for each row execute function public.control_publication_guard_rev();

drop trigger if exists control_publication_guard_b_output on public.control_shows;
create trigger control_publication_guard_b_output
  before insert or update of output on public.control_shows
  for each row execute function public.control_publication_guard_output();

-- What an output's periodic check reads: the published stamp and revision, never the payload.
create or replace function public.control_output_version(p_output_slug text)
returns jsonb
language sql security definer set search_path = '' stable as $$
  select jsonb_build_object('ver', s.published_ver, 'rev', s.published_rev)
  from public.control_shows s
  where s.output_slug = p_output_slug and p_output_slug is not null;
$$;
revoke all on function public.control_output_version(text) from public, anon, authenticated;
grant execute on function public.control_output_version(text) to anon, authenticated;

-- Self-check: privileges always; every branch of the guard on a throwaway production when an
-- account exists, undone by a sentinel the block catches.
do $$
declare
  v_owner uuid;
  v_show  uuid := '00000000-0117-4000-8000-000000000001';
  v_slug  text;
  v_r1    bigint;
  v_r2    bigint;
  v_n     int;
  v_got   jsonb;
  v_rev   bigint;
  v_failed boolean;
begin
  if has_function_privilege('anon', 'public.auto_publish_state()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.auto_publish_state()', 'EXECUTE') then
    raise exception '0117: EXECUTE on auto_publish_state is wrong for a client role';
  end if;
  if not has_function_privilege('anon', 'public.control_output_version(text)', 'EXECUTE') then
    raise exception '0117: an output cannot read its version';
  end if;
  if has_function_privilege('authenticated', 'public.control_record_rev(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.control_record_rev(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.auto_publish_on()', 'EXECUTE') then
    raise exception '0117: a client role can call a guard helper';
  end if;
  if public.auto_publish_state()->'installed' is distinct from 'true'::jsonb then
    raise exception '0117: auto_publish_state answered %', public.auto_publish_state();
  end if;

  select id into v_owner from auth.users limit 1;
  if v_owner is null then
    raise notice '0117 self-check skipped: no account on this instance';
    return;
  end if;
  begin
    insert into public.system_settings (key, value) values ('auto_publish', '{"on": false}')
    on conflict (key) do update set value = excluded.value;
    insert into public.documents (id, user_id, kind, body) values (v_show, v_owner, 'show', '{"name":"a"}');
    select d.rev into v_r1 from public.documents d where d.id = v_show;
    -- A first publish naming its revision.
    insert into public.control_shows (id, owner_id, title, output)
    values (v_show, v_owner, '0117 self-check', jsonb_build_object('v', 1, 'ver', jsonb_build_object('n', 1, 'h', 'h1', 'r', v_r1)));
    select s.published_rev, s.output_slug into v_rev, v_slug from public.control_shows s where s.id = v_show;
    if v_rev is distinct from v_r1 then raise exception '0117: an insert did not record its revision (%)', v_rev; end if;
    v_got := public.control_output_version(v_slug);
    if v_slug is not null and (v_got->'ver'->>'n' <> '1' or (v_got->>'rev')::bigint <> v_r1) then
      raise exception '0117: control_output_version answered %', v_got;
    end if;

    -- A newer save, published.
    update public.documents set body = '{"name":"b"}' where id = v_show;
    select d.rev into v_r2 from public.documents d where d.id = v_show;
    update public.control_shows set output = jsonb_build_object('v', 1, 'ver', jsonb_build_object('n', 2, 'h', 'h2', 'r', v_r2)) where id = v_show;
    select s.published_rev into v_rev from public.control_shows s where s.id = v_show;
    if v_rev is distinct from v_r2 then raise exception '0117: a newer publication was not recorded'; end if;

    -- An older one after it: skipped, nothing written.
    update public.control_shows set output = jsonb_build_object('v', 1, 'ver', jsonb_build_object('n', 3, 'h', 'h1', 'r', v_r1)) where id = v_show;
    get diagnostics v_n = row_count;
    select s.published_ver into v_got from public.control_shows s where s.id = v_show;
    if v_n <> 0 or v_got->>'h' <> 'h2' then raise exception '0117: an older publication replaced a newer one'; end if;

    -- A revision the record does not have: refused.
    v_failed := false;
    begin
      update public.control_shows set output = jsonb_build_object('v', 1, 'ver', jsonb_build_object('n', 3, 'h', 'h3', 'r', v_r2 + 1000)) where id = v_show;
    exception when raise_exception then
      if sqlerrm <> 'This publication names a save that does not exist' then raise; end if;
      v_failed := true;
    end;
    if not v_failed then raise exception '0117: a publication named a future revision'; end if;

    -- A revision-only update: lower skipped, future skipped, equal lands.
    update public.control_shows set published_rev = v_r1 where id = v_show;
    get diagnostics v_n = row_count;
    if v_n <> 0 then raise exception '0117: a revision-only update moved the revision down'; end if;
    update public.control_shows set published_rev = v_r2 + 1000 where id = v_show;
    get diagnostics v_n = row_count;
    if v_n <> 0 then raise exception '0117: a revision-only update named a future revision'; end if;
    update public.control_shows set published_rev = v_r2 where id = v_show;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception '0117: a revision-only update at the same revision was refused'; end if;

    -- Not a publication: the revision stays.
    update public.control_shows set title = '0117 self-check (renamed)' where id = v_show;
    select s.published_rev into v_rev from public.control_shows s where s.id = v_show;
    if v_rev is distinct from v_r2 then raise exception '0117: an update of another column moved the revision'; end if;

    -- No revision, switch on: refused with the words.
    update public.system_settings set value = '{"on": true}' where key = 'auto_publish';
    v_failed := false;
    begin
      update public.control_shows set output = '{"v":1,"ver":{"n":4,"h":"h4"}}' where id = v_show;
    exception when raise_exception then
      if sqlerrm <> 'Reload this page to edit' then raise; end if;
      v_failed := true;
    end;
    if not v_failed then raise exception '0117: an unversioned publish passed with the switch on'; end if;

    -- No revision, switch off: lands and clears the revision.
    update public.system_settings set value = '{"on": false}' where key = 'auto_publish';
    update public.control_shows set output = '{"v":1,"ver":{"n":4,"h":"h4"}}' where id = v_show;
    select s.published_rev, s.published_ver into v_rev, v_got from public.control_shows s where s.id = v_show;
    if v_rev is not null or v_got->>'h' <> 'h4' then raise exception '0117: an unversioned publish left a revision claim'; end if;

    raise exception 'self-check-done';
  exception when raise_exception then
    if sqlerrm <> 'self-check-done' then raise; end if;
  end;
end $$;
