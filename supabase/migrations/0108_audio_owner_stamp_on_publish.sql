-- live-path: control_stamp_audio_owner fires only when a statement names output or audio_owner_id; what it stamps is unchanged
--
-- A HEARTBEAT STOPS OPENING THE PUBLISHED PAYLOAD (docs/work-specs/database-work-per-user/spec.md).
--
-- 0076's trigger runs before every update of a control_shows row and asks whether `output` changed.
-- Comparing two jsonb values fetches and decompresses both, so each renderer heartbeat (one a minute
-- per output), each report and each stage opened the whole published payload twice, holding the row.
-- Those rows average 680 kB stored and reach 5.2 MB. On a 7 MB payload on a throwaway Postgres a
-- heartbeat cost 1880 blocks and 7.3 ms against 5 blocks and 0.04 ms once narrowed.
--
-- A statement that does not name `output` or `audio_owner_id` cannot change them, and no other trigger
-- on this table writes them, so the function's answer for such a statement was always "no change".
-- The function stays as it is: a publish still compares and still stamps. Backwards compatible with
-- every open page, since no signature, column or policy changes. Revert: create the trigger again
-- without `of output, audio_owner_id`.

set lock_timeout = '2s';
set statement_timeout = '30s';

create or replace trigger control_stamp_audio_owner
  before insert or update of output, audio_owner_id on public.control_shows
  for each row execute function public.control_stamp_audio_owner();

-- Self-check: who the stamp names shows whether it ran. Undone by a sentinel the block catches, which
-- restores the claim as well. Skipped on an instance with fewer than two accounts (0054's shape).
do $$
declare
  v_users uuid[];
  v_show  uuid := '00000000-0108-4000-8000-000000000001';
  v_stamp uuid;
begin
  select array_agg(u.id) into v_users from (select id from auth.users limit 2) u;
  if coalesce(array_length(v_users, 1), 0) < 2 then
    raise notice '0108 self-check skipped: needs two accounts on this instance';
    return;
  end if;
  begin
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_users[1])::text, true);
    insert into public.control_shows (id, owner_id, title, output)
    values (v_show, v_users[1], '0108 self-check', '{"v":1}');

    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_users[2])::text, true);
    update public.control_shows set output_seen_at = now() where id = v_show;
    select s.audio_owner_id into v_stamp from public.control_shows s where s.id = v_show;
    if v_stamp is distinct from v_users[1] then
      raise exception '0108: a heartbeat moved the audio owner to %', v_stamp;
    end if;

    update public.control_shows set output = '{"v":2}' where id = v_show;
    select s.audio_owner_id into v_stamp from public.control_shows s where s.id = v_show;
    if v_stamp is distinct from v_users[2] then
      raise exception '0108: a publish did not stamp its publisher: %', v_stamp;
    end if;

    raise exception '0108 self-check rollback';
  exception when raise_exception then
    if sqlerrm <> '0108 self-check rollback' then raise; end if;
  end;
end $$;
