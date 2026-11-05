-- live-path: one new function, control_heads_announce, and a pg_cron job that calls it every 4 s; no table, column, trigger or policy changes
--
-- A FRAME LOST WITH NO LATER ROW IS FOUND IN SECONDS, NOT AT THE 30 s POLL (#1802, the follow-up
-- to #1797 and #1801).
--
-- WHAT WAS WRONG. A follower of `seq-<show>` (0071) learns that it missed a frame only when a later
-- frame arrives with a gap in front of it, or at its 30 s poll (CONTROL_POLL_MS in
-- src/control/hostedControl.ts). The last value before a production goes quiet has no later frame,
-- so when its frame is lost the board shows the older figure for up to 30 s with nothing marking it
-- stale: past the 10 s ceiling a bound field is held to. A frame can be lost two ways, and this
-- covers both without needing to know which: control_events_frame (0071) gives realtime.send
-- 250 ms on realtime.messages and swallows a failure (a stall there, such as Realtime altering a
-- partition), and Realtime can drop a frame on its way.
--
-- WHAT THIS ADDS. Every 4 s, for each production whose head moved in the last 10 s, one `head`
-- message `{epoch, seq}` on its `seq-<show id>` topic. A follower behind that seq reads the tail
-- (src/control/seqFollow.ts `announce`); a follower level with it does nothing. A write is
-- announced two or three times (at ages a and a + 4 s, and a + 8 s when that is still under 10 s,
-- for some a up to 4 s), so a lost frame reaches its followers within about 4 s, and within about
-- 8 s when the first announcement is lost as well: inside the 10 s ceiling either way.
--
-- WHY NOT A FASTER POLL, OR THE 60 s HEARTBEAT. A poll costs every following surface a read per
-- interval, almost all of them empty (CONTROL_POLL_MS's comment: about 60 req/s at 100 productions
-- for a 5 s poll), and the renderer's 60 s heartbeat is slower than the poll it would replace. This
-- costs one scan of control_heads every 4 s (one row per production; no index on updated_at,
-- because that would cost every Take its HOT update) and two or three small broadcasts after each
-- write, which Realtime fans out. A follower that is level spends nothing.
--
-- OLD FOLLOWERS listen only for `batch` on this topic and never hear `head`. The message carries
-- nothing new: a follower that reads the tail learns the same seq.
--
-- pg_cron records every run in cron.job_run_details (21,600 a day at 4 s), so a second job deletes
-- this one's records older than a day, once a day.
--
-- Revert: unschedule `noacg-control-heads-announce`; followers go back to waiting for the poll.
--
-- ── WHAT LOCKS THIS FILE TAKES ON AIR ────────────────────────────────────────────────────────
-- `create function`, `grant`, `revoke` and two cron.job rows: no lock on control_shows,
-- control_events or control_heads. The function reads control_heads without a row lock, and its
-- broadcasts insert into realtime.messages, each waiting at most 500 ms. The self-check writes its
-- own throwaway production only.
set lock_timeout = '500ms';
set statement_timeout = '5s';

create or replace function public.control_heads_announce()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_started timestamptz := clock_timestamp();
  v_head record;
  v_sent integer := 0;
begin
  -- A stall on realtime.messages (one way a frame is lost) must not hold this job: each broadcast
  -- waits at most 500 ms for its lock, and a run stops after 2 s. The next run, 4 s on, tries again.
  perform set_config('lock_timeout', '500ms', true);
  for v_head in
    select h.show_id, h.epoch, h.seq
      from public.control_heads h
     where h.updated_at > now() - interval '10 seconds'
       and h.seq > 0
  loop
    exit when clock_timestamp() - v_started > interval '2 seconds';
    begin
      perform realtime.send(jsonb_build_object('epoch', v_head.epoch, 'seq', v_head.seq),
                            'head', 'seq-' || v_head.show_id::text, true);
      v_sent := v_sent + 1;
    exception when others then
      null; -- realtime.send swallows its own failures; this guards a version that does not
    end;
  end loop;
  return v_sent;
end $$;
revoke all on function public.control_heads_announce() from public, anon, authenticated;

do $$
declare
  v_job bigint;
begin
  for v_job in
    select jobid from cron.job
     where jobname in ('noacg-control-heads-announce', 'noacg-prune-heads-announce-runs')
  loop
    perform cron.unschedule(v_job);
  end loop;
end $$;

select cron.schedule(
  'noacg-control-heads-announce',
  '4 seconds',
  $$select public.control_heads_announce()$$
);

select cron.schedule(
  'noacg-prune-heads-announce-runs',
  '47 3 * * *',
  $$delete from cron.job_run_details d using cron.job j
     where d.jobid = j.jobid and j.jobname = 'noacg-control-heads-announce'
       and d.end_time < now() - interval '1 day'$$
);

-- ── Prove it, or refuse to apply ──────────────────────────────────────────────────────────────
-- Shape, the schedule, and one CALL on a throwaway production (supabase/AGENTS.md: a self-check
-- proves shape, never behaviour, so call the thing).
do $$
declare
  v_owner uuid;
  v_show  uuid := gen_random_uuid();
  v_slug  text;
  v_head  public.control_heads%rowtype;
  v_sent  integer;
  v_msg   jsonb;
begin
  if to_regprocedure('public.control_heads_announce()') is null then
    raise exception '0109 self-check failed: control_heads_announce is missing';
  end if;
  if has_function_privilege('anon', 'public.control_heads_announce()', 'execute')
     or has_function_privilege('authenticated', 'public.control_heads_announce()', 'execute') then
    raise exception '0109 self-check failed: a client can call control_heads_announce';
  end if;
  if not exists (select 1 from cron.job j where j.jobname = 'noacg-control-heads-announce'
                  and j.schedule = '4 seconds' and j.active) then
    raise exception '0109 self-check failed: the announce job is not scheduled every 4 seconds';
  end if;
  if not exists (select 1 from cron.job j where j.jobname = 'noacg-prune-heads-announce-runs' and j.active) then
    raise exception '0109 self-check failed: the announce job''s run records are never pruned';
  end if;

  select u.id into v_owner from auth.users u where not public.feature_denied_for(u.id, 'control.hosted') limit 1;
  if v_owner is null then
    raise notice '0109 self-check skipped the call: no account on this instance may use hosted control';
    return;
  end if;
  insert into public.control_shows (id, owner_id, title, output)
    values (v_show, v_owner, '0109 self-check', '{"v":1,"graphics":[{"key":"Bug"}],"cues":[]}'::jsonb)
    returning slug into v_slug;
  perform public.control_send_many(v_slug, '[{"graphic":"Bug","msg":{"t":"play"}}]'::jsonb);
  select * into v_head from public.control_heads h where h.show_id = v_show;
  if v_head.seq is distinct from 1::bigint then
    raise exception '0109 self-check failed: the throwaway production has no head at seq 1 (%)', v_head.seq;
  end if;

  v_sent := public.control_heads_announce();
  if v_sent < 1 then
    raise exception '0109 self-check failed: a head moved this moment was not announced';
  end if;
  -- Asserted where Realtime can write at all (0071's rule: a stack whose realtime.messages has no
  -- partition for today cannot, and that is not this file's fault). Bounded to this apply's minute,
  -- the partition key.
  if exists (select 1 from realtime.messages m where m.inserted_at >= now() - interval '1 minute'
              and m.topic = 'seq-' || v_show::text and m.event = 'batch') then
    select m.payload into v_msg from realtime.messages m
     where m.inserted_at >= now() - interval '1 minute' and m.topic = 'seq-' || v_show::text and m.event = 'head';
    if v_msg is null or v_msg->>'epoch' is distinct from v_head.epoch::text or (v_msg->>'seq')::bigint <> v_head.seq then
      raise exception '0109 self-check failed: the head was not announced as {epoch, seq} on its seq- topic (%)', v_msg;
    end if;
  else
    raise notice '0109 self-check: realtime.messages took no row on this instance; the announcement is not asserted';
  end if;

  delete from public.control_shows where id = v_show;
end $$;
