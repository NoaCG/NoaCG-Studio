-- live-path: a new table control_cue_arms (keyed to control_shows by a foreign key, added last, which locks it for an instant) and new control_* functions beside the old ones; no existing function, table, policy, trigger or topic changes
-- live-path add: control_cue_arms, control_cue_arm, control_cue_arms_for, control_cue_spec, control_cue_arm_wire (docs/work-specs/live-safe-migrations/spec.md L2)
--
-- TIMED GRAPHIC CUES ON A PUBLISHED PRODUCTION (docs/RUNDOWN_AUTOMATION_PLAN.md §2.0, §2.4 to §2.6).
-- A graphic cue may end by itself: a length counted from when an output has it on air, then Out,
-- the next graphic cue, or both. Phase 1 ran that on an unpublished production, where one page is
-- the only surface. Published, every open operator page counts the same countdown, and the end
-- action must run EXACTLY ONCE across those pages and a reload, never more than 5 s late.
--
-- WHAT THIS ADDS, and nothing it replaces:
-- - control_cue_arms: one row per production and graphic layer ("lane"), the countdown of the
--   timed cue on it. RLS on and no policy, no client grant: only the two functions below touch it.
-- - control_cue_arm(slug, lane, cue, op): every arm operation, under the production's head lock in
--   0071's lock order (the control_shows row at KEY SHARE, then the head FOR UPDATE), so two pages
--   asking at once are served one after the other and see each other's answer.
--     arm     make sure the arm exists for the lane's latest Take marker (a no-op once it does);
--     aired   stamp the on-air anchor: the time of the first renderer report whose baseline covers
--             the Take (its `seq` in control_heads.live), or, once 3 s have passed with none, the
--             Take marker's own time;
--     hold    freeze the remainder (a running arm already due answers `due` and changes nothing);
--     resume  count the frozen remainder from now;
--     cancel  Manual: the timed end is dropped for this airing, missed or not;
--     fire    THE COMPARE-AND-SET: `ok` to exactly one caller from the deadline to 5 s after it,
--             which then sends the end action through control_send_seq like a press (its
--             stale-press refusal still applies); after that window it marks the arm missed and
--             answers `late`, and nothing ever runs it.
--   The arm is never trusted from the caller: it is read off the lane's latest Take marker in the
--   log (`{t:'cue', cue, auto:{then, ms, next}}`, the row the page's own Take wrote through
--   control_send_seq), and an arm whose Take is no longer the lane's latest marker is history.
--   Every change writes one cue row, `{t:'cue', cue, arm: <op>, then, auto?: <the arm>}`, numbered
--   under the head lock exactly as control_send_seq numbers its own, so 0071's statement trigger
--   broadcasts it on `seq-<show id>` and every follower sees it in order with no new topic. The
--   row keeps the lane's cue, so the head, the live_cue view and an older page all read the layer
--   as they did (an older page's activity log words it as a take until it reloads).
-- - control_cue_arms_for(slug): the recovery read a reloading page asks, every lane's live arm.
-- - control_cue_spec and control_cue_arm_wire: internal, no client reaches them.
--
-- WHY IT CANNOT HURT A SHOW ON AIR. New names only: nobody calls them yet, and no old page or
-- renderer meets a changed RPC. The self-check works on its own throwaway production. The one
-- lock on an existing table is the foreign key's SHARE ROW EXCLUSIVE on control_shows, taken by
-- the LAST statement, so it is held only for the commit (a send's KEY SHARE passes it; an old
-- writer's UPDATE of the row waits for that instant); lock_timeout makes it give up rather than
-- queue in front of a Take. Revert: drop the two RPCs, the two helpers and the table; nothing else
-- depends on them.
set lock_timeout = '500ms';
set statement_timeout = '1s';

-- ── 1. The arms ───────────────────────────────────────────────────────────────────────────────
-- Phase, read in this order: ended (fire or cancel: gone), missed_at (missed), held_ms (held),
-- from_at null (waiting for air), else running. `ms` is the length still to count from from_at;
-- `rev` the seq of the last row that changed it, which a page orders an answer against its rows by.
create table if not exists public.control_cue_arms (
  show_id    uuid not null,
  lane       text not null,
  cue        text not null,
  take_seq   bigint not null,
  take_at    timestamptz not null,
  action     text not null check (action in ('out', 'next', 'out-next')),
  ms         integer not null check (ms between 1 and 86400000),
  next_cue   text,
  from_at    timestamptz,
  held_ms    integer check (held_ms between 0 and 86400000),
  missed_at  timestamptz,
  ended      text check (ended in ('fire', 'cancel')),
  fired_by   text,
  rev        bigint not null,
  updated_at timestamptz not null default now(),
  primary key (show_id, lane)
);
alter table public.control_cue_arms enable row level security;
revoke all on table public.control_cue_arms from public, anon, authenticated;

comment on table public.control_cue_arms is
  'Timed graphic cues (0075): one countdown per production and graphic layer, written only by control_cue_arm under the head lock.';

-- ── 2. What a Take marker arms, read off the marker, never off the caller ────────────────────
-- Null for a marker that arms nothing: a manual cue, an Out, or a shape this file cannot read.
-- Nested CASEs, because a WHERE-style AND may evaluate the cast before the type test.
create or replace function public.control_cue_spec(p_auto jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_auto) = 'object' and jsonb_typeof(p_auto->'ms') = 'number'
                   and p_auto->>'then' in ('out', 'next', 'out-next') then
    case when (p_auto->>'ms')::numeric between 500 and 86400000 then
      jsonb_strip_nulls(jsonb_build_object(
        'then', p_auto->>'then',
        'ms', round((p_auto->>'ms')::numeric),
        'next', case when p_auto->>'then' <> 'out' and jsonb_typeof(p_auto->'next') = 'string'
                     then p_auto->>'next' end))
    end
  end
$$;
revoke all on function public.control_cue_spec(jsonb) from public, anon, authenticated;

-- An arm as every page reads it, in epoch milliseconds of the server's clock; null once it ended.
-- running: from; held: held + ms (the frozen remainder); missed: due; waiting: neither.
create or replace function public.control_cue_arm_wire(p_arm public.control_cue_arms)
returns jsonb language sql immutable set search_path = '' as $$
  select case when p_arm.lane is null or p_arm.ended is not null then null else
    jsonb_strip_nulls(jsonb_build_object(
      'cue', p_arm.cue,
      'then', p_arm.action,
      'ms', coalesce(p_arm.held_ms, p_arm.ms),
      'next', p_arm.next_cue,
      'take', p_arm.take_seq,
      'take_at', round(extract(epoch from p_arm.take_at) * 1000),
      'from', case when p_arm.missed_at is null and p_arm.held_ms is null and p_arm.from_at is not null
                   then round(extract(epoch from p_arm.from_at) * 1000) end,
      'held', case when p_arm.missed_at is null and p_arm.held_ms is not null then true end,
      'due', case when p_arm.missed_at is not null
                  then round(extract(epoch from p_arm.from_at + p_arm.ms * interval '1 millisecond') * 1000) end))
  end
$$;
revoke all on function public.control_cue_arm_wire(public.control_cue_arms) from public, anon, authenticated;

-- ── 3. Every arm operation, under the head lock ───────────────────────────────────────────────
create or replace function public.control_cue_arm(p_slug text, p_lane text, p_cue text, p_op text, p_by text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_show     uuid;
  v_owner    uuid;
  v_head     public.control_heads%rowtype;
  v_take_seq bigint;
  v_take_at  timestamptz;
  v_take_msg jsonb;
  v_spec     jsonb;
  v_arm      public.control_cue_arms%rowtype;
  v_have     boolean;
  v_phase    text;
  v_now      timestamptz;
  v_left     bigint;
  v_due      timestamptz;
  v_report   jsonb;
  v_from     timestamptz;
  v_mark     text;
  v_reason   text;
  v_wait     bigint;
  v_recent   int;
  v_msg      jsonb;
  v_seq      bigint;
  v_refire   boolean := false;
begin
  if p_op is null or p_op not in ('arm', 'aired', 'hold', 'resume', 'cancel', 'fire') then
    raise exception 'not an arm operation' using errcode = '22023';
  end if;
  if coalesce(p_lane, '') = '' or coalesce(p_cue, '') = '' then
    raise exception 'not a control command';
  end if;
  -- 1. Who: control_send_seq's checks, word for word.
  select s.id, s.owner_id into v_show, v_owner from public.control_shows s where s.slug = p_slug;
  if v_show is null then raise exception 'unknown control page'; end if;
  if public.feature_denied_for(v_owner, 'control.hosted') then
    raise exception 'hosted control is switched off for this page' using errcode = '42501';
  end if;

  -- 2. 0071's lock order: the production's row at KEY SHARE, then the head. Each wait 1 s at most
  --    (55P03, and the page asks again), then nothing held here waits long.
  perform set_config('lock_timeout', '1000', true);
  perform 1 from public.control_shows s where s.id = v_show for key share;
  if not found then raise exception 'unknown control page'; end if;
  insert into public.control_heads (show_id) values (v_show) on conflict (show_id) do nothing;
  select * into v_head from public.control_heads h where h.show_id = v_show for update;
  perform set_config('lock_timeout', '250ms', true);
  -- The clock AFTER the lock: a deadline is judged when the answer is decided, not when asked.
  v_now := clock_timestamp();

  -- 3. The lane's latest TAKE marker: its newest cue row that is not an arm row. Written by any
  --    writer, old or new, every such row is numbered, and the head lock held here means none can
  --    commit under us. The arm is the one that marker makes, or nothing.
  select e.seq, e.created_at, e.msg into v_take_seq, v_take_at, v_take_msg
    from public.control_events e
   where e.show_id = v_show and e.seq is not null and e.graphic = p_lane
     and e.msg->>'t' = 'cue' and not (e.msg ? 'arm')
   order by e.seq desc
   limit 1;
  select * into v_arm from public.control_cue_arms a where a.show_id = v_show and a.lane = p_lane;
  v_have := found;
  if v_have and v_arm.take_seq is distinct from v_take_seq then
    -- An arm from an older Take: the layer has had a new marker since (a re-take, a manual Take,
    -- an Out), and that marker decides.
    delete from public.control_cue_arms a where a.show_id = v_show and a.lane = p_lane;
    v_have := false;
  end if;
  v_spec := case when v_take_msg->>'cue' = p_cue and v_head.graphics->p_lane->>'cue' = p_cue
                 then public.control_cue_spec(v_take_msg->'auto') end;
  if v_spec is null then
    return jsonb_build_object('ok', false, 'reason', 'gone', 'arm', null, 'rev', v_head.seq,
      'at', round(extract(epoch from v_now) * 1000));
  end if;
  if not v_have then
    insert into public.control_cue_arms as a (show_id, lane, cue, take_seq, take_at, action, ms, next_cue, rev)
      values (v_show, p_lane, p_cue, v_take_seq, v_take_at, v_spec->>'then', (v_spec->>'ms')::int,
              v_spec->>'next', v_take_seq)
      returning * into v_arm;
  end if;

  v_phase := case when v_arm.ended is not null then 'gone'
                  when v_arm.missed_at is not null then 'missed'
                  when v_arm.held_ms is not null then 'held'
                  when v_arm.from_at is null then 'waiting'
                  else 'running' end;
  v_due := v_arm.from_at + v_arm.ms * interval '1 millisecond';

  -- 4. The operation. `v_mark` names the row to write; `v_reason` refuses with nothing written.
  if v_phase = 'gone' then
    -- The page that won a fire and never heard its answer asks again (`p_by`, minted per page):
    -- while the lane still holds the cue, so its end action has not gone out, it is told `ok`
    -- again and sends it, once. Every other caller, and any caller once the action has gone out
    -- (an Out replaces the marker), finds it gone.
    if p_op = 'fire' and v_arm.ended = 'fire' and p_by is not null and v_arm.fired_by = p_by then
      v_refire := true;
    else
      v_reason := 'gone';
    end if;
  elsif p_op = 'aired' then
    if v_phase = 'waiting' then
      v_report := v_head.live->p_lane;
      if jsonb_typeof(v_report) = 'object' and jsonb_typeof(v_report->'seq') = 'number'
         and (v_report->>'seq')::bigint >= v_arm.take_seq and jsonb_typeof(v_report->'at') = 'string' then
        v_from := greatest(v_arm.take_at, (v_report->>'at')::timestamptz);
      elsif v_now >= v_arm.take_at + interval '3 seconds' then
        v_from := v_arm.take_at;
      else
        v_reason := 'waiting';
        v_wait := ceil(extract(epoch from (v_arm.take_at + interval '3 seconds' - v_now)) * 1000);
      end if;
      if v_from is not null then
        update public.control_cue_arms a set from_at = v_from where a.show_id = v_show and a.lane = p_lane
          returning * into v_arm;
        v_mark := 'aired';
      end if;
    end if;
  elsif p_op = 'hold' then
    if v_phase = 'running' then
      v_left := floor(extract(epoch from (v_due - v_now)) * 1000);
      if v_now > v_due + interval '5 seconds' then
        -- Nothing fired it in time: missed, exactly as a late fire marks it.
        update public.control_cue_arms a set missed_at = v_now where a.show_id = v_show and a.lane = p_lane
          returning * into v_arm;
        v_mark := 'late';
        v_reason := 'late';
      elsif v_left <= 0 then
        v_reason := 'due';
      else
        update public.control_cue_arms a set held_ms = v_left, from_at = null
         where a.show_id = v_show and a.lane = p_lane returning * into v_arm;
        v_mark := 'hold';
      end if;
    elsif v_phase = 'waiting' then
      update public.control_cue_arms a set held_ms = a.ms where a.show_id = v_show and a.lane = p_lane
        returning * into v_arm;
      v_mark := 'hold';
    elsif v_phase = 'missed' then
      v_reason := 'missed';
    end if;
  elsif p_op = 'resume' then
    if v_phase = 'held' then
      update public.control_cue_arms a set ms = a.held_ms, held_ms = null, from_at = v_now
       where a.show_id = v_show and a.lane = p_lane returning * into v_arm;
      v_mark := 'resume';
    elsif v_phase = 'missed' then
      v_reason := 'missed';
    end if;
  elsif p_op = 'cancel' then
    update public.control_cue_arms a set ended = 'cancel' where a.show_id = v_show and a.lane = p_lane
      returning * into v_arm;
    v_mark := 'cancel';
  elsif p_op = 'fire' then
    if v_phase <> 'running' then
      v_reason := v_phase;
    elsif v_now < v_due then
      v_reason := 'early';
      v_wait := ceil(extract(epoch from (v_due - v_now)) * 1000);
    elsif v_now > v_due + interval '5 seconds' then
      -- MISSED: nothing fired it in time, so nothing ever will (the owner's 5 s rule, §2.5).
      update public.control_cue_arms a set missed_at = v_now where a.show_id = v_show and a.lane = p_lane
        returning * into v_arm;
      v_mark := 'late';
      v_reason := 'late';
    else
      update public.control_cue_arms a set ended = 'fire', fired_by = p_by where a.show_id = v_show and a.lane = p_lane
        returning * into v_arm;
      v_mark := 'fire';
    end if;
  end if;

  -- 5. The row every follower sees, numbered under the lock as control_send_seq numbers its own.
  --    The burst cap is that function's, so hold and resume pressed over and over cannot flood the
  --    log any more than presses can.
  if v_mark is not null then
    select count(*) into v_recent
      from (select e.created_at from public.control_events e
             where e.show_id = v_show and e.msg->>'t' is distinct from 'live'
             order by e.id desc limit 51) t
     where t.created_at > now() - interval '5 seconds';
    if v_recent + 1 > 50 then
      raise exception 'too many commands — slow down' using errcode = 'check_violation';
    end if;
    v_seq := v_head.seq + 1;
    -- `then` on every arm row, so the log can word a fire or a Manual, whose arm has ended.
    v_msg := jsonb_build_object('t', 'cue', 'cue', p_cue, 'arm', v_mark, 'then', v_arm.action);
    if public.control_cue_arm_wire(v_arm) is not null then
      v_msg := v_msg || jsonb_build_object('auto', public.control_cue_arm_wire(v_arm));
    end if;
    update public.control_heads h
       set seq = v_seq, graphics = public.control_head_effect(h.graphics, p_lane, v_msg, 'arm', 0), updated_at = now()
     where h.show_id = v_show;
    insert into public.control_events (show_id, graphic, msg, seq, created_at)
      values (v_show, p_lane, v_msg, v_seq, clock_timestamp());
    update public.control_cue_arms a set rev = v_seq, updated_at = now() where a.show_id = v_show and a.lane = p_lane
      returning * into v_arm;
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'ok', v_reason is null,
    'reason', v_reason,
    'ms', v_wait,
    'op', coalesce(v_mark, case when v_refire then 'fire' end),
    'rev', coalesce(v_seq, v_head.seq),
    'at', round(extract(epoch from v_now) * 1000)))
    || jsonb_build_object('arm', coalesce(public.control_cue_arm_wire(v_arm), 'null'::jsonb));
end $$;
revoke all on function public.control_cue_arm(text, text, text, text, text) from public;
grant execute on function public.control_cue_arm(text, text, text, text, text) to anon, authenticated;

-- ── 4. The recovery read: every lane's live arm, as a reloading page needs it ─────────────────
-- STABLE: one snapshot. An arm whose Take is no longer its lane's latest marker is left out, as is
-- one that ended; a running arm past its deadline is answered as it stands, and the page's `fire`
-- then gets `ok` or `late` from the function above.
create or replace function public.control_cue_arms_for(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_show  uuid;
  v_owner uuid;
  v_head  public.control_heads%rowtype;
  v_lane  text;
  v_seq   bigint;
  v_at    timestamptz;
  v_msg   jsonb;
  v_spec  jsonb;
  v_arm   public.control_cue_arms%rowtype;
  v_arms  jsonb := '{}'::jsonb;
begin
  select s.id, s.owner_id into v_show, v_owner from public.control_shows s where s.slug = p_slug;
  if v_show is null then raise exception 'unknown control page'; end if;
  if public.feature_denied_for(v_owner, 'control.hosted') then
    raise exception 'hosted control is switched off for this page' using errcode = '42501';
  end if;
  select * into v_head from public.control_heads h where h.show_id = v_show;
  -- Every lane with a cue on air, by its latest Take marker: the stored arm when it is that
  -- marker's, else the marker's own arm, still WAITING (no operation has touched it yet, so the
  -- row does not exist: a page reloading straight after a Take must count it all the same).
  for v_lane in select g.key from jsonb_each(case when jsonb_typeof(v_head.graphics) = 'object' then v_head.graphics else '{}'::jsonb end) g
                 where jsonb_typeof(g.value->'cue') = 'string' loop
    select e.seq, e.created_at, e.msg into v_seq, v_at, v_msg
      from public.control_events e
     where e.show_id = v_show and e.seq is not null and e.graphic = v_lane
       and e.msg->>'t' = 'cue' and not (e.msg ? 'arm')
     order by e.seq desc
     limit 1;
    if v_msg->>'cue' is distinct from v_head.graphics->v_lane->>'cue' then
      continue;
    end if;
    select * into v_arm from public.control_cue_arms a where a.show_id = v_show and a.lane = v_lane;
    if found and v_arm.take_seq = v_seq then
      if public.control_cue_arm_wire(v_arm) is not null then
        v_arms := v_arms || jsonb_build_object(v_lane, public.control_cue_arm_wire(v_arm));
      end if;
      continue;
    end if;
    v_spec := public.control_cue_spec(v_msg->'auto');
    if v_spec is not null then
      v_arms := v_arms || jsonb_build_object(v_lane, v_spec || jsonb_build_object(
        'cue', v_msg->>'cue', 'take', v_seq, 'take_at', round(extract(epoch from v_at) * 1000)));
    end if;
  end loop;
  return jsonb_build_object('arms', v_arms, 'rev', coalesce(v_head.seq, 0), 'epoch', v_head.epoch,
    'at', round(extract(epoch from clock_timestamp()) * 1000));
end $$;
revoke all on function public.control_cue_arms_for(text) from public;
grant execute on function public.control_cue_arms_for(text) to anon, authenticated;

-- ── 5. Prove it, or refuse to apply ───────────────────────────────────────────────────────────
-- CALLS every path on a throwaway production, as a signed-out page would (supabase/AGENTS.md: a
-- self-check proves shape, never behaviour). Time is moved by writing the arm's own row, never by
-- sleeping. Server cues are not timed (plan §2.0), so no lane here is anything but a graphic.
do $$
declare
  v_role  text := current_role;
  v_owner uuid;
  v_show  uuid := gen_random_uuid();
  v_out   text;
  v_slug  text;
  v_page  uuid := '00000000-0075-4000-8000-00000000000a';
  v_epoch uuid;
  v_ans   jsonb;
  v_n     int;
  v_seq   bigint;
  v_take_at timestamptz;
  v_sig   text;
  v_timed jsonb := '[{"graphic":"Bug","msg":{"t":"update","data":{"f0":"x"}}},
                     {"graphic":"Bug","msg":{"t":"play"}},
                     {"graphic":"Bug","msg":{"t":"cue","cue":"cue-a","auto":{"then":"out-next","ms":4000,"next":"cue-b"}}}]';
  v_off   jsonb := '[{"graphic":"Bug","msg":{"t":"stop"}},{"graphic":"Bug","msg":{"t":"cue","cue":null}}]';
begin
  -- (a) SHAPE, including what a client must NOT reach.
  if to_regprocedure('public.control_cue_arm(text,text,text,text,text)') is null
     or to_regprocedure('public.control_cue_arms_for(text)') is null then
    raise exception '0075 self-check failed: a new RPC is missing';
  end if;
  if not has_function_privilege('anon', 'public.control_cue_arm(text,text,text,text,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.control_cue_arm(text,text,text,text,text)', 'execute')
     or not has_function_privilege('anon', 'public.control_cue_arms_for(text)', 'execute') then
    raise exception '0075 self-check failed: a signed-out page cannot reach an RPC it needs';
  end if;
  foreach v_sig in array array['public.control_cue_spec(jsonb)', 'public.control_cue_arm_wire(public.control_cue_arms)'] loop
    if has_function_privilege('anon', v_sig, 'execute') or has_function_privilege('authenticated', v_sig, 'execute') then
      raise exception '0075 self-check failed: an internal function is reachable from a client (%)', v_sig;
    end if;
  end loop;
  if has_table_privilege('anon', 'public.control_cue_arms', 'select') or has_table_privilege('authenticated', 'public.control_cue_arms', 'select')
     or has_table_privilege('anon', 'public.control_cue_arms', 'insert') or has_table_privilege('authenticated', 'public.control_cue_arms', 'update')
     or not (select c.relrowsecurity from pg_class c where c.oid = 'public.control_cue_arms'::regclass) then
    raise exception '0075 self-check failed: a client can reach control_cue_arms directly';
  end if;

  -- (b) CALL it, as an owner hosted control is open to. An instance with no such account cannot own
  -- a production that sends, and must still apply.
  select u.id into v_owner from auth.users u where not public.feature_denied_for(u.id, 'control.hosted') limit 1;
  if v_owner is null then
    raise notice '0075 self-check skipped the live half: no account on this instance may use hosted control';
    return;
  end if;
  insert into public.control_shows (id, owner_id, title, output)
    values (v_show, v_owner, '0075 self-check', '{"v":1,"graphics":[{"key":"Bug"}],"cues":[]}'::jsonb)
    returning slug, output_slug into v_slug, v_out;

  set local role anon;
  -- (c) A timed Take, through the ordinary send. Its marker arms the lane WAITING for air.
  v_ans := public.control_send_seq(v_slug, v_timed, jsonb_build_object('id', v_page, 'press', 1, 'base', '{}'::jsonb));
  if v_ans->>'ok' <> 'true' then raise exception '0075 self-check failed: the timed Take was refused (%)', v_ans; end if;
  v_epoch := (v_ans->>'epoch')::uuid;
  -- A page reloading straight after the Take, before any operation made the arm's row, counts it.
  if public.control_cue_arms_for(v_slug)->'arms'->'Bug'->>'take' is distinct from '3'
     or public.control_cue_arms_for(v_slug)->'arms'->'Bug' ? 'from' then
    raise exception '0075 self-check failed: the recovery read did not see a fresh Take (%)', public.control_cue_arms_for(v_slug);
  end if;
  v_ans := public.control_cue_arm(v_slug, 'Bug', 'cue-a', 'arm');
  if v_ans->>'ok' <> 'true' or v_ans->'arm'->>'then' <> 'out-next' or (v_ans->'arm'->>'ms')::int <> 4000
     or v_ans->'arm'->>'next' <> 'cue-b' or v_ans->'arm' ? 'from' or v_ans->'arm'->>'take' <> '3' or v_ans ? 'op' then
    raise exception '0075 self-check failed: arm did not read the Take marker (%)', v_ans;
  end if;
  -- Not on air yet: no fire, and no anchor before a report or 3 s.
  v_ans := public.control_cue_arm(v_slug, 'Bug', 'cue-a', 'fire');
  if v_ans->>'reason' <> 'waiting' then raise exception '0075 self-check failed: a waiting arm fired (%)', v_ans; end if;
  v_ans := public.control_cue_arm(v_slug, 'Bug', 'cue-a', 'aired');
  if v_ans->>'reason' <> 'waiting' or (v_ans->>'ms')::int not between 1 and 3000 then
    raise exception '0075 self-check failed: aired stamped with no covering report (%)', v_ans;
  end if;
  -- A claim about another cue on the lane is refused, whoever makes it.
  v_ans := public.control_cue_arm(v_slug, 'Bug', 'cue-z', 'fire');
  if v_ans->>'reason' <> 'gone' then raise exception '0075 self-check failed: a fire for a cue not on the lane (%)', v_ans; end if;

  -- (d) A renderer report whose baseline covers the Take: aired stamps its time, once.
  perform public.control_output_report_seq(v_out, 'Bug', '{"f0":"x"}'::jsonb, null, 3, null, v_epoch);
  v_ans := public.control_cue_arm(v_slug, 'Bug', 'cue-a', 'aired');
  if v_ans->>'ok' <> 'true' or v_ans->>'op' <> 'aired' or not (v_ans->'arm' ? 'from') then
    raise exception '0075 self-check failed: aired did not stamp the covering report (%)', v_ans;
  end if;
  v_seq := (v_ans->>'rev')::bigint;
  execute format('set local role %I', v_role);
  if (select e.msg->>'arm' from public.control_events e where e.show_id = v_show and e.seq = v_seq) is distinct from 'aired'
     or (select e.msg->'auto'->>'from' from public.control_events e where e.show_id = v_show and e.seq = v_seq) is distinct from v_ans->'arm'->>'from'
     or (select h.seq from public.control_heads h where h.show_id = v_show) <> v_seq
     or (select h.graphics->'Bug'->>'cue' from public.control_heads h where h.show_id = v_show) <> 'cue-a' then
    raise exception '0075 self-check failed: the aired row was not numbered, or moved the head''s cue';
  end if;
  set local role anon;
  v_ans := public.control_cue_arm(v_slug, 'Bug', 'cue-a', 'aired');
  if v_ans->>'ok' <> 'true' or v_ans ? 'op' or (v_ans->>'rev')::bigint <> v_seq then
    raise exception '0075 self-check failed: a second aired wrote again (%)', v_ans;
  end if;

  -- (e) Early, with the wait; then hold carries the remainder and resume counts it from now.
  v_ans := public.control_cue_arm(v_slug, 'Bug', 'cue-a', 'fire');
  if v_ans->>'reason' <> 'early' or (v_ans->>'ms')::int not between 1 and 4000 then
    raise exception '0075 self-check failed: an early fire (%)', v_ans;
  end if;
  v_take_at := to_timestamp((v_ans->'arm'->>'take_at')::numeric / 1000);
  v_ans := public.control_cue_arm(v_slug, 'Bug', 'cue-a', 'hold');
  if v_ans->>'op' <> 'hold' or v_ans->'arm'->>'held' <> 'true' or (v_ans->'arm'->>'ms')::int not between 1 and 4000
     or v_ans->'arm' ? 'from' then
    raise exception '0075 self-check failed: hold (%)', v_ans;
  end if;
  v_n := (v_ans->'arm'->>'ms')::int;
  v_ans := public.control_cue_arm(v_slug, 'Bug', 'cue-a', 'fire');
  if v_ans->>'reason' <> 'held' then raise exception '0075 self-check failed: a held arm fired (%)', v_ans; end if;
  v_ans := public.control_cue_arm(v_slug, 'Bug', 'cue-a', 'resume');
  if v_ans->>'op' <> 'resume' or (v_ans->'arm'->>'ms')::int <> v_n or not (v_ans->'arm' ? 'from')
     or to_timestamp((v_ans->'arm'->>'take_at')::numeric / 1000) <> v_take_at then
    raise exception '0075 self-check failed: resume did not carry the remainder, or moved the Take (%)', v_ans;
  end if;

  -- (f) At the deadline: exactly one ok, and the arm is gone for every later caller.
  execute format('set local role %I', v_role);
  update public.control_cue_arms a set from_at = clock_timestamp() - (a.ms + 1000) * interval '1 millisecond'
   where a.show_id = v_show and a.lane = 'Bug';
  set local role anon;
  v_ans := public.control_cue_arm(v_slug, 'Bug', 'cue-a', 'fire', 'page-1');
  if v_ans->>'ok' <> 'true' or v_ans->>'op' <> 'fire' or v_ans->'arm' <> 'null'::jsonb then
    raise exception '0075 self-check failed: a fire in its window (%)', v_ans;
  end if;
  -- The winner whose answer was lost asks again and is told ok again, writing nothing more.
  v_ans := public.control_cue_arm(v_slug, 'Bug', 'cue-a', 'fire', 'page-1');
  if v_ans->>'ok' <> 'true' or v_ans->>'op' <> 'fire' then
    raise exception '0075 self-check failed: the winner asking again (%)', v_ans;
  end if;
  v_ans := public.control_cue_arm(v_slug, 'Bug', 'cue-a', 'fire');
  if v_ans->>'reason' <> 'gone' then raise exception '0075 self-check failed: a second fire (%)', v_ans; end if;
  v_ans := public.control_cue_arm(v_slug, 'Bug', 'cue-a', 'arm');
  if v_ans->>'reason' <> 'gone' then raise exception '0075 self-check failed: a fired arm came back (%)', v_ans; end if;
  execute format('set local role %I', v_role);
  if (select count(*) from public.control_events e where e.show_id = v_show and e.msg->>'arm' = 'fire') <> 1 then
    raise exception '0075 self-check failed: not exactly one fire row';
  end if;
  set local role anon;

  -- (g) Late: a re-take arms afresh; more than 5 s past its deadline it is marked missed, once,
  -- and Manual clears it.
  v_ans := public.control_send_seq(v_slug, v_timed, jsonb_build_object('id', v_page, 'press', 2, 'epoch', v_epoch, 'base', '{}'::jsonb));
  if v_ans->>'ok' <> 'true' then raise exception '0075 self-check failed: the re-take was refused (%)', v_ans; end if;
  v_ans := public.control_cue_arm(v_slug, 'Bug', 'cue-a', 'arm');
  if v_ans->>'ok' <> 'true' or v_ans->'arm' ? 'from' then raise exception '0075 self-check failed: a re-take did not re-arm (%)', v_ans; end if;
  execute format('set local role %I', v_role);
  update public.control_cue_arms a set from_at = clock_timestamp() - (a.ms + 6000) * interval '1 millisecond'
   where a.show_id = v_show and a.lane = 'Bug';
  set local role anon;
  v_ans := public.control_cue_arm(v_slug, 'Bug', 'cue-a', 'fire');
  if v_ans->>'reason' <> 'late' or v_ans->>'op' <> 'late' or not (v_ans->'arm' ? 'due') then
    raise exception '0075 self-check failed: a late fire (%)', v_ans;
  end if;
  v_ans := public.control_cue_arm(v_slug, 'Bug', 'cue-a', 'fire');
  if v_ans->>'reason' <> 'missed' or v_ans ? 'op' then raise exception '0075 self-check failed: a missed arm fired, or wrote again (%)', v_ans; end if;
  if public.control_cue_arms_for(v_slug)->'arms'->'Bug'->>'due' is null then
    raise exception '0075 self-check failed: the recovery read lost a missed arm';
  end if;
  v_ans := public.control_cue_arm(v_slug, 'Bug', 'cue-a', 'cancel');
  if v_ans->>'op' <> 'cancel' or v_ans->'arm' <> 'null'::jsonb or public.control_cue_arms_for(v_slug)->'arms' <> '{}'::jsonb then
    raise exception '0075 self-check failed: cancel of a missed arm (%)', v_ans;
  end if;
  -- A hold pressed long after the deadline marks it missed too, rather than promising an end.
  v_ans := public.control_send_seq(v_slug, v_timed, jsonb_build_object('id', v_page, 'press', 3, 'epoch', v_epoch, 'base', '{}'::jsonb));
  perform public.control_cue_arm(v_slug, 'Bug', 'cue-a', 'arm');
  execute format('set local role %I', v_role);
  update public.control_cue_arms a set from_at = clock_timestamp() - (a.ms + 6000) * interval '1 millisecond'
   where a.show_id = v_show and a.lane = 'Bug';
  set local role anon;
  v_ans := public.control_cue_arm(v_slug, 'Bug', 'cue-a', 'hold');
  if v_ans->>'reason' <> 'late' or v_ans->>'op' <> 'late' or not (v_ans->'arm' ? 'due') then
    raise exception '0075 self-check failed: a hold long after the deadline (%)', v_ans;
  end if;
  perform public.control_cue_arm(v_slug, 'Bug', 'cue-a', 'cancel');

  -- (h) A manual Out, then a fire due by the clock: gone, because the Out is the lane's marker now.
  v_ans := public.control_send_seq(v_slug, v_timed, jsonb_build_object('id', v_page, 'press', 4, 'epoch', v_epoch, 'base', '{}'::jsonb));
  perform public.control_cue_arm(v_slug, 'Bug', 'cue-a', 'arm');
  if public.control_cue_arms_for(v_slug)->'arms'->'Bug'->>'cue' is distinct from 'cue-a' then
    raise exception '0075 self-check failed: the recovery read did not answer a waiting arm';
  end if;
  execute format('set local role %I', v_role);
  update public.control_cue_arms a set from_at = clock_timestamp() - (a.ms + 1000) * interval '1 millisecond'
   where a.show_id = v_show and a.lane = 'Bug';
  set local role anon;
  v_ans := public.control_send_seq(v_slug, v_off, jsonb_build_object('id', v_page, 'press', 5, 'epoch', v_epoch, 'base', '{}'::jsonb));
  if v_ans->>'ok' <> 'true' then raise exception '0075 self-check failed: the Out was refused (%)', v_ans; end if;
  v_ans := public.control_cue_arm(v_slug, 'Bug', 'cue-a', 'fire');
  if v_ans->>'reason' <> 'gone' or public.control_cue_arms_for(v_slug)->'arms' <> '{}'::jsonb then
    raise exception '0075 self-check failed: a fire after a manual Out (%)', v_ans;
  end if;
  -- A manual cue's marker arms nothing.
  v_ans := public.control_send_seq(v_slug, '[{"graphic":"Bug","msg":{"t":"play"}},{"graphic":"Bug","msg":{"t":"cue","cue":"cue-m"}}]'::jsonb,
    jsonb_build_object('id', v_page, 'press', 6, 'epoch', v_epoch, 'base', '{}'::jsonb));
  if public.control_cue_arm(v_slug, 'Bug', 'cue-m', 'hold')->>'reason' <> 'gone' then
    raise exception '0075 self-check failed: a manual cue was armed';
  end if;
  execute format('set local role %I', v_role);

  -- The throwaway goes. Its arm already went: the fire after the Out found it history and removed
  -- it, which is also why nothing is left for the foreign key below to cascade.
  if exists (select 1 from public.control_cue_arms a where a.show_id = v_show) then
    raise exception '0075 self-check failed: an arm outlived the marker that replaced it';
  end if;
  delete from public.control_shows where id = v_show;
exception when others then
  execute format('set local role %I', v_role);
  raise;
end $$;

-- ── 6. LAST: an unpublished production takes its arms with it ────────────────────────────────
-- Last because the key takes SHARE ROW EXCLUSIVE on control_shows, held to the commit, and after
-- such a lock nothing but the commit may follow (live-safe-migrations L3). It validates against
-- an empty table.
alter table public.control_cue_arms
  add constraint control_cue_arms_show_fk foreign key (show_id) references public.control_shows (id) on delete cascade;
