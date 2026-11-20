-- live-path: control_stamp_audio_owner and production_authoring_guard stop opening or copying the whole output when they need not; no signature, column, grant, policy or trigger condition changes
--
-- A PUBLISH NO LONGER READS THE STORED OUTPUT BACK (#2616,
-- docs/work-specs/live-publishing/evidence/fix-2616.md, rules R2, R3, R6).
--
-- A whole publish is one UPDATE of control_shows.output (5 MB at 60 graphics). Two BEFORE triggers
-- read the stored value to learn whether the output changed, which decompresses it, and the
-- authoring guard copied the 5 MB row into a record and returned the copy. On hosted staging the
-- statement took 3.4 to 5.6 s idle and passed the 8 s limit under load.
--
--   control_stamp_audio_owner     a write whose new published_ver differs from the stored one
--                                 counts as changing the output, without opening the stored value;
--                                 equal stamps compare the whole output as before. It assigns the
--                                 audio owner only when that value moves (an assignment copies the row).
--   production_authoring_guard    the same stamp-first test in its control_shows branch only, and it
--                                 returns the row it was given instead of a copy. The documents and
--                                 team_productions branches are unchanged.
--
-- Why the stamp tells: 0118's control_publication_guard_b_output sets published_ver from
-- output->'ver' on every write naming output, and fires before both (triggers fire by name; the
-- self-check asserts the order). Every publish moves the stamp. The stamps can differ while the
-- outputs are equal only on a row whose published_ver an owner wrote by hand, which no page does;
-- then the answer is an extra stamp naming the caller, or an extra refusal for an unmarked page on
-- that owner's own row: never a missed stamp, never a change let through. What each guards is
-- otherwise unchanged (0076/0108, 0115). 0118 and 0120 are untouched.
--
-- Backwards compatible with every open page: no signature, column, grant, policy or trigger
-- condition changes. Revert: create the two functions again as 0076 and 0115 define them.

set lock_timeout = '2s';
set statement_timeout = '30s';

create or replace function public.control_stamp_audio_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
begin
  if tg_op = 'INSERT' then
    v_owner := coalesce(auth.uid(), new.owner_id);
  elsif new.audio_owner_id is distinct from old.audio_owner_id
     or new.published_ver is distinct from old.published_ver then
    -- A different stamp is a different output (0118 sets published_ver from output): no need to
    -- open the stored value.
    v_owner := coalesce(auth.uid(), old.audio_owner_id, old.owner_id);
  elsif new.output is distinct from old.output then
    v_owner := coalesce(auth.uid(), old.audio_owner_id, old.owner_id);
  else
    return new;
  end if;
  -- Assigning copies the row; skip it when the owner stays.
  if new.audio_owner_id is distinct from v_owner then
    new.audio_owner_id := v_owner;
  end if;
  return new;
end;
$$;
revoke all on function public.control_stamp_audio_owner() from public, anon, authenticated;

create or replace function public.production_authoring_guard()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_claims jsonb;
begin
  -- Every pass leaves this block and returns the row it was given (not a copy).
  <<decide>>
  begin
    -- Not an API request (a migration, a cron job, a definer called by the server): never refused.
    if nullif(current_setting('request.headers', true), '') is null then exit decide; end if;
    begin
      v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    exception when others then
      v_claims := null;
    end;
    if coalesce(v_claims->>'role', '') <> 'authenticated' then exit decide; end if;
    if public.production_copies_marked() then exit decide; end if;

    if tg_table_name = 'documents' then
      if tg_op = 'DELETE' then
        if old.kind <> 'show' or old.deleted then return old; end if;
      elsif new.kind <> 'show' and (tg_op = 'INSERT' or old.kind <> 'show') then
        return new;
      end if;
    elsif tg_table_name = 'control_shows' and tg_op = 'UPDATE' then
      -- A moved stamp is a changed output (0118): only equal stamps compare the whole output.
      if new.published_ver is not distinct from old.published_ver then
        if new.output is not distinct from old.output
           and new.panel is not distinct from old.panel
           and new.title is not distinct from old.title
           and new.profile is not distinct from old.profile
           and new.bindings is not distinct from old.bindings
           and new.collections is not distinct from old.collections
           and public.production_sources_unpaused(new.sources) is not distinct from public.production_sources_unpaused(old.sources) then
          return new; -- a source's Pause or Resume, or nothing at all
        end if;
      end if;
    end if;

    -- The switch is read last, so a write that passes for any other reason never reads it.
    if not public.production_copies_on() then exit decide; end if;
    raise exception 'Reload this page to edit' using errcode = 'P0001',
      hint = 'This page was opened before an update. Takes still work; reload it to edit the production.';
  end;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.production_authoring_guard() from public, anon, authenticated;

-- Self-check: CALL it (supabase/AGENTS.md). The trigger order R2 rests on, always. Where an account
-- exists: every branch of both functions, and that a publish moving the stamp opens the stored
-- output fewer times than one keeping it (TOAST index scans in this transaction; equal on 0076's
-- and 0115's functions), as a plain call and as an unmarked signed-in request. Undone by a sentinel
-- the block catches, which also removes the switch row and the request settings.
do $$
declare
  v_order  text[];
  v_users  uuid[];
  v_show   uuid := '00000000-0121-4000-8000-000000000001';
  v_doc    uuid := '00000000-0121-4000-8000-000000000002';
  v_idx    oid;
  v_big    jsonb;
  v_stamp  uuid;
  v_failed boolean;
  v_bare   text := '{"accept":"application/json"}';
  v_marked text := '{"accept":"application/json","x-noacg-production-copies":"1"}';
  v_as1    text;
  v_as2    text;
  s0 bigint; s1 bigint; s2 bigint;
  v_moved bigint;
  v_kept  bigint;
begin
  select array_agg(t.tgname::text order by t.tgname collate "C") into v_order
    from pg_trigger t
   where t.tgrelid = 'public.control_shows'::regclass and not t.tgisinternal
     and t.tgname in ('control_publication_guard_b_output', 'control_shows_production_authoring_guard', 'control_stamp_audio_owner');
  if v_order is distinct from array['control_publication_guard_b_output', 'control_shows_production_authoring_guard', 'control_stamp_audio_owner'] then
    raise exception '0121: published_ver must be set before the guard and the stamp read it; triggers fire as %', v_order;
  end if;

  select array_agg(u.id) into v_users from (select id from auth.users order by created_at limit 2) u;
  if v_users is null then
    raise notice '0121 self-check skipped: no account on this instance';
    return;
  end if;
  v_as1 := jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text;
  v_as2 := jsonb_build_object('sub', coalesce(v_users[2], v_users[1]), 'role', 'authenticated')::text;
  select i.indexrelid into v_idx from pg_class c join pg_index i on i.indrelid = c.reltoastrelid
   where c.oid = 'public.control_shows'::regclass;
  -- A payload stored out of line (about 1 MB), as a real one is.
  select jsonb_build_object('graphics', jsonb_agg(jsonb_build_object('k', i, 's', md5(i::text)))) into v_big
    from generate_series(1, 20000) i;

  begin
    insert into public.system_settings (key, value) values ('production_copies', '{"on": false}')
    on conflict (key) do update set value = excluded.value;

    -- G3: an insert stamps the caller.
    perform set_config('request.jwt.claims', v_as1, true);
    insert into public.control_shows (id, owner_id, title, output)
    values (v_show, v_users[1], '0121 self-check', v_big || '{"ver":{"n":1,"h":"a"}}');
    select s.audio_owner_id into v_stamp from public.control_shows s where s.id = v_show;
    if v_stamp is distinct from v_users[1] then raise exception '0121: an insert stamped %', v_stamp; end if;

    -- R2 and R6: TOAST index scans of the stored output for two writes of the same size, one moving
    -- the stamp and one keeping it. A plain call: keeping it opens the stored value once more than
    -- moving it (the audio stamp's comparison). An unmarked signed-in request: moving it opens no
    -- more than the plain call (the guard adds nothing), keeping it opens one more (the guard's
    -- comparison). On 0076's and 0115's functions the moved writes equal the kept ones.
    s0 := pg_stat_get_xact_numscans(v_idx);
    update public.control_shows set output = v_big || '{"ver":{"n":2,"h":"b"},"x":1}' where id = v_show;
    s1 := pg_stat_get_xact_numscans(v_idx);
    update public.control_shows set output = v_big || '{"ver":{"n":2,"h":"b"},"x":2}' where id = v_show;
    s2 := pg_stat_get_xact_numscans(v_idx);
    v_moved := s1 - s0;
    v_kept := s2 - s1;
    perform set_config('request.headers', v_bare, true);
    update public.control_shows set output = v_big || '{"ver":{"n":3,"h":"c"},"x":3}' where id = v_show;
    s0 := pg_stat_get_xact_numscans(v_idx);
    update public.control_shows set output = v_big || '{"ver":{"n":3,"h":"c"},"x":4}' where id = v_show;
    s1 := pg_stat_get_xact_numscans(v_idx);
    perform set_config('request.headers', '', true);
    if v_kept = 0 then
      raise notice '0121 scan check skipped: this server counts no index scans (track_counts off)';
    elsif v_kept - v_moved <> 1 or s0 - s2 <> v_moved or s1 - s0 <> v_kept + 1 then
      raise exception '0121: a publish moving the stamp read the stored output (plain: % moved, % kept; unmarked: % moved, % kept)',
        v_moved, v_kept, s0 - s2, s1 - s0;
    end if;

    -- G3 with two accounts: who publishes is stamped when the output changes, by stamp or by value.
    if v_users[2] is not null then
      perform set_config('request.jwt.claims', v_as2, true);
      update public.control_shows set output_seen_at = now() where id = v_show;
      select s.audio_owner_id into v_stamp from public.control_shows s where s.id = v_show;
      if v_stamp is distinct from v_users[1] then raise exception '0121: a heartbeat moved the audio owner'; end if;
      update public.control_shows set output = v_big || '{"ver":{"n":4,"h":"d"}}' where id = v_show;
      select s.audio_owner_id into v_stamp from public.control_shows s where s.id = v_show;
      if v_stamp is distinct from v_users[2] then raise exception '0121: a publish moving the stamp did not stamp its publisher'; end if;
      perform set_config('request.jwt.claims', v_as1, true);
      update public.control_shows set output = v_big || '{"ver":{"n":4,"h":"d"}}' where id = v_show;
      select s.audio_owner_id into v_stamp from public.control_shows s where s.id = v_show;
      if v_stamp is distinct from v_users[2] then raise exception '0121: the same output again moved the audio owner'; end if;
      update public.control_shows set output = v_big || '{"ver":{"n":4,"h":"d"},"x":5}' where id = v_show;
      select s.audio_owner_id into v_stamp from public.control_shows s where s.id = v_show;
      if v_stamp is distinct from v_users[1] then raise exception '0121: a changed output under the same stamp did not stamp its publisher'; end if;
      perform set_config('request.jwt.claims', v_as2, true);
      update public.control_shows set audio_owner_id = null where id = v_show;
      select s.audio_owner_id into v_stamp from public.control_shows s where s.id = v_show;
      if v_stamp is distinct from v_users[2] then raise exception '0121: a changed audio owner was not stamped to the caller'; end if;
    end if;

    -- G4, switch on, unmarked and signed in: a publish moving the stamp, one keeping it with another
    -- output, and a production save are refused; the same output again, a heartbeat, another kind
    -- and a marked request pass (a Pause is 0115's self-check; that comparison is unchanged).
    perform set_config('request.jwt.claims', v_as1, true);
    perform set_config('request.headers', v_bare, true);
    update public.system_settings set value = '{"on": true}' where key = 'production_copies';
    v_failed := false;
    begin
      update public.control_shows set output = v_big || '{"ver":{"n":9,"h":"z"}}' where id = v_show;
    exception when raise_exception then
      if sqlerrm <> 'Reload this page to edit' then raise; end if;
      v_failed := true;
    end;
    if not v_failed then raise exception '0121: an unmarked publish moving the stamp passed with the switch on'; end if;
    v_failed := false;
    begin
      update public.control_shows set output = output || '{"y":1}' where id = v_show;
    exception when raise_exception then
      if sqlerrm <> 'Reload this page to edit' then raise; end if;
      v_failed := true;
    end;
    if not v_failed then raise exception '0121: an unmarked publish keeping the stamp passed with the switch on'; end if;
    update public.control_shows set output = output, title = title where id = v_show;
    update public.control_shows set output_seen_at = now() where id = v_show;
    insert into public.documents (id, user_id, kind, body) values (v_doc, v_users[1], 'look', '{}');
    update public.documents set body = '{"a":1}' where id = v_doc;
    v_failed := false;
    begin
      insert into public.documents (id, user_id, kind, body) values (v_show, v_users[1], 'show', '{}');
    exception when raise_exception then
      if sqlerrm <> 'Reload this page to edit' then raise; end if;
      v_failed := true;
    end;
    if not v_failed then raise exception '0121: an unmarked production save passed with the switch on'; end if;
    perform set_config('request.headers', v_marked, true);
    update public.control_shows set output = v_big || '{"ver":{"n":10,"h":"m"}}' where id = v_show;

    raise exception '0121 self-check rollback';
  exception when raise_exception then
    if sqlerrm <> '0121 self-check rollback' then raise; end if;
  end;
  perform set_config('request.headers', '', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
