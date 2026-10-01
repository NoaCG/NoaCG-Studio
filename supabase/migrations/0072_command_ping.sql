-- live-path: one new function, control_ping_seq, beside control_send_seq; no table, column, trigger or policy changes
--
-- A PING THROUGH THE COMMAND PATH THAT AIRS NOTHING (docs/work-specs/playout-ready/spec.md R9,
-- AC-12, AC-13; READY's guarantee 7 in docs/PLAYOUT_ISOLATION_RESEARCH.md §9).
--
-- WHAT WAS MISSING: READY could say an output is joined to the live topic, but not that a command
-- pressed now would reach it. Presence and the command path are different roads: an output can be
-- present while its log subscription is dead and it lives on the 30 s poll.
--
-- WHAT THIS ADDS, and nothing else:
-- - control_ping_seq(slug, id): one row `{t: 'ping', id, at}` with an EMPTY graphic, numbered under
--   the head exactly as control_send_seq numbers a Take: the production's row at KEY SHARE, then
--   the head FOR UPDATE, the same lock bounds, the same burst cap, and the same statement's triggers
--   (the per-row `log-` broadcast for old followers, one `batch` frame on `seq-<show id>`). So the
--   ping takes the road a Take takes, on both protocols, and says how long that road is now.
--   `at` is the server's clock at the commit, in milliseconds; each output answers with the ping's
--   id and how long after `at` it received the row.
-- - It changes no graphic, revision, cue or report: control_head_effect ignores an empty graphic,
--   so only the head's `seq` moves (a follower would otherwise see a hole). Old outputs and pages
--   already ignore a row type they do not know, and a row whose graphic names nothing they hold.
-- - Prepare for Live sends it, once per press. Never on a timer.
--
-- Revert: stop calling it. Nothing reads it but a page that sent one.
--
-- ── WHAT LOCKS THIS FILE TAKES ON AIR ────────────────────────────────────────────────────────
-- Only `create function` and `grant`: no lock on control_shows, control_events or control_heads.
-- The self-check writes its own throwaway production only.
set lock_timeout = '500ms';
set statement_timeout = '5s';

create or replace function public.control_ping_seq(p_slug text, p_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
  v_owner uuid;
  v_head public.control_heads%rowtype;
  v_recent int;
  v_at bigint;
  v_seq bigint;
begin
  -- 1. Who, and what: control_send_seq's checks.
  select s.id, s.owner_id into v_show, v_owner from public.control_shows s where s.slug = p_slug;
  if v_show is null then raise exception 'unknown control page'; end if;
  if public.feature_denied_for(v_owner, 'control.hosted') then
    raise exception 'hosted control is switched off for this page' using errcode = '42501';
  end if;
  if coalesce(p_id, '') !~ '^[a-z0-9]{8,40}$' then
    raise exception 'not a ping id' using errcode = '22023';
  end if;
  -- 2. control_send_seq's lock order and bounds: the production's row at KEY SHARE, then the head.
  perform set_config('lock_timeout', '1000', true);
  perform 1 from public.control_shows s where s.id = v_show for key share;
  if not found then raise exception 'unknown control page'; end if;
  insert into public.control_heads (show_id) values (v_show) on conflict (show_id) do nothing;
  select * into v_head from public.control_heads h where h.show_id = v_show for update;
  perform set_config('lock_timeout', '250ms', true);
  -- 3. The burst cap a Take meets, so the ping can never be a way around it.
  select count(*) into v_recent
    from (select e.created_at from public.control_events e
           where e.show_id = v_show and e.msg->>'t' is distinct from 'live'
           order by e.id desc limit 51) t
   where t.created_at > now() - interval '5 seconds';
  if v_recent + 1 > 50 then
    raise exception 'too many commands, slow down' using errcode = 'check_violation';
  end if;
  -- 4. The number, then the row: one statement, one frame. The summary does not move.
  v_seq := v_head.seq + 1;
  v_at := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  update public.control_heads h set seq = v_seq, updated_at = now() where h.show_id = v_show;
  insert into public.control_events (show_id, graphic, msg, seq, created_at)
    values (v_show, '', jsonb_build_object('t', 'ping', 'id', p_id, 'at', v_at), v_seq, clock_timestamp());
  return jsonb_build_object('ok', true, 'seq', v_seq, 'epoch', v_head.epoch, 'at', v_at);
end $$;
revoke all on function public.control_ping_seq(text, text) from public, anon, authenticated;
grant execute on function public.control_ping_seq(text, text) to anon, authenticated;

-- ── Prove it, or refuse to apply ──────────────────────────────────────────────────────────────
-- Shape, and one CALL on a throwaway production (supabase/AGENTS.md: a self-check proves shape,
-- never behaviour).
do $$
declare
  v_owner uuid;
  v_show  uuid := gen_random_uuid();
  v_slug  text;
  v_before public.control_heads%rowtype;
  v_after public.control_heads%rowtype;
  v_ans   jsonb;
  v_row   record;
begin
  if to_regprocedure('public.control_ping_seq(text,text)') is null then
    raise exception '0072 self-check failed: control_ping_seq is missing';
  end if;
  if not has_function_privilege('anon', 'public.control_ping_seq(text,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.control_ping_seq(text,text)', 'execute') then
    raise exception '0072 self-check failed: a page cannot reach control_ping_seq';
  end if;

  select u.id into v_owner from auth.users u where not public.feature_denied_for(u.id, 'control.hosted') limit 1;
  if v_owner is null then
    raise notice '0072 self-check skipped the call: no account on this instance may use hosted control';
    return;
  end if;
  insert into public.control_shows (id, owner_id, title, output)
    values (v_show, v_owner, '0072 self-check', '{"v":1,"graphics":[{"key":"Bug"}],"cues":[]}'::jsonb)
    returning slug into v_slug;
  perform public.control_send_many(v_slug, '[{"graphic":"Bug","msg":{"t":"play"},"fast":true}]'::jsonb);
  select * into v_before from public.control_heads h where h.show_id = v_show;

  v_ans := public.control_ping_seq(v_slug, 'selfcheck0072');
  select * into v_after from public.control_heads h where h.show_id = v_show;
  if (v_ans->>'ok')::boolean is not true or (v_ans->>'seq')::bigint <> v_before.seq + 1 or v_after.seq <> v_before.seq + 1 then
    raise exception '0072 self-check failed: the ping did not take the next number (%)', v_ans;
  end if;
  if v_after.graphics is distinct from v_before.graphics or v_after.recent is distinct from v_before.recent then
    raise exception '0072 self-check failed: the ping moved a graphic''s summary';
  end if;
  select e.graphic, e.msg, e.seq into v_row from public.control_events e where e.show_id = v_show order by e.seq desc limit 1;
  if v_row.graphic <> '' or v_row.msg->>'t' <> 'ping' or v_row.msg->>'id' <> 'selfcheck0072'
     or jsonb_typeof(v_row.msg->'at') <> 'number' or v_row.seq <> v_after.seq then
    raise exception '0072 self-check failed: the ping row is not {t: ping, id, at} under the head''s number';
  end if;
  begin
    perform public.control_ping_seq(v_slug, 'Not An Id!');
    raise exception '0072 self-check failed: a malformed ping id was accepted';
  exception when sqlstate '22023' then
    null;
  end;

  delete from public.control_shows where id = v_show;
end $$;
