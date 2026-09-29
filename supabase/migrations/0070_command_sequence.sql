-- live-path: control_events.seq, two triggers on control_events, new control_* RPCs beside the old ones, control_data_apply's row lock, and the old resolves reading control_heads
--
-- A PER-PRODUCTION SEQUENCE THAT COMMITS IN ORDER, AND A SEND THAT CAN TELL A STALE PRESS FROM A
-- NEW ONE (docs/work-specs/playout-runtime-reliability/spec.md AC-12 to AC-17, D4 to D6; the design
-- and every decision behind it: step-2-design.md in the same folder).
--
-- WHAT WAS WRONG (docs/PLAYOUT_ISOLATION_RESEARCH.md §5.1, §5.3, §5.6):
-- - control_events.id is taken at INSERT and is global, so commit order is not id order: a Take
--   waiting on the production's control_shows row committed seconds after a later Update, and a
--   watcher's durable log never recorded it (5 of 5 trials).
-- - Every other busy production leaves "holes" in every production's ids: +92 ms per Take while
--   the follower reads a tail to fill a gap that was never there, and the fast road switched off.
-- - Every Take and Out writes control_shows.live_cue, so a publish or a renderer report holding
--   that row failed every Take for as long as it held it.
-- - Nothing on the server can tell a stale Take from a new one: a Take held 6 s airs after the Out
--   pressed behind it, and presses waiting on a lock air in any order when it releases.
--
-- WHAT THIS ADDS, and nothing it replaces (D6: old pages and old outputs keep today's contract):
-- - control_events.seq, numbered per production under the head row's lock (0069), so a row with a
--   higher seq can never commit before a lower one. Old writers are numbered by a BEFORE trigger;
--   the new send numbers its own rows. The per-row `log-` broadcast (0064) and the `cmd-` fast
--   frame (0056) keep running for old followers.
-- - One `batch` frame per inserting statement on the private topic `live-<show id>` (0068's read
--   policy), carrying the rows with their seq, the head's epoch, and a summary of every graphic
--   the statement touched: {rev, on, cue, step, by, press}.
-- - control_send_seq: the same batch as control_send_many, plus the sender's id, press number,
--   epoch and the revision it last saw per graphic. A press made without seeing a change another
--   screen made is refused as `stale` and says what is on air now; the same page's earlier press
--   arriving after its later one is refused as `superseded`; a resent press is answered as
--   applied. All out is never refused, but never undoes the same page's later press.
-- - control_show_resolve / control_output_resolve / control_tail_seq / control_output_tail_seq /
--   control_output_report_seq: the reads and the report for a follower that follows by seq.
--   Reports now live in control_heads.live, off the hot row.
-- - control_show_by_slug and control_output_by_slug keep their shapes and answer from both homes:
--   `live` per graphic from whichever report is newer, `live_cue` per layer from the head when the
--   head has seen that layer's cue, else from the column.
-- - control_data_apply locks the production row FOR NO KEY UPDATE instead of FOR UPDATE, so a data
--   merge no longer blocks the new send's KEY SHARE. The body is otherwise 0060's, unchanged.
--
-- NOT REDEFINED: control_send_many, control_send, control_stage, control_report,
-- control_output_report, control_data_send, control_data_patch*. Their bodies are exactly as
-- applied; the trigger keeps the head right for every one of them, including a call already
-- running when this file commits (plpgsql keeps the body a call started with, and this file's
-- trigger fires on its insert anyway).
--
-- ── THE LOCK ORDER (the invariant that rules out deadlocks between old and new writers) ────────
--   1. the control_shows row: KEY SHARE (the new send and report), NO KEY UPDATE (the old writers,
--      through their own UPDATE or this file's trigger) or FOR UPDATE (an old publish upsert);
--   2. then the control_heads row;
--   3. after the head, only: the same head row, control_events inserts, realtime.messages inserts.
-- Nothing that holds a head ever waits for a control_shows row. The trigger takes NO KEY UPDATE on
-- the show row BEFORE the head for exactly that reason: an old send body updates live_cue after its
-- insert, so it must already hold that lock when it takes the head.
-- Still able to delay a Take (listed, not fixed): an old bundle's publish upsert (FOR UPDATE), a
-- join-name claim or a data-key rotation (key changes), and unpublish.
--
-- ── WHAT LOCKS THIS FILE TAKES ON AIR ────────────────────────────────────────────────────────
-- The `add column` is first and is the only strong lock: ACCESS EXCLUSIVE on control_events, held
-- to the end of this file (milliseconds: no rewrite, no scan, no index, no backfill). Sends queue
-- behind it for that long. The lock wait is capped by lock_timeout (500 ms, below the 1 s
-- deadlock_timeout, so a live backend is never the victim of a deadlock check against this file);
-- a timeout is 55P03, which db-push retries, and nothing in this file applies. control_shows is not
-- locked by any statement here. The self-check works on its own throwaway production only.
--
-- ── PRE-MIGRATION ROWS ───────────────────────────────────────────────────────────────────────
-- Rows written before this file keep seq null; nothing numbers them (no backfill under a lock).
-- control_output_resolve says `legacy: true` when a renderer would need one of them, and that
-- renderer follows by id for the session, exactly as today; the 7-day prune removes them.
set lock_timeout = '500ms';
set statement_timeout = '5s';

alter table public.control_events add column seq bigint;

comment on column public.control_events.seq is
  'Per-production sequence (0070), allocated under the control_heads row lock, so commit order equals seq order. Null on rows written before 0070.';

-- ── 1. One row's effect on the summary: one rule, used by the trigger and by the new send ─────
-- cue sets the layer's cue (null = off air, kept as an entry so it overrides the old column);
-- play and snap put it on (step 0); stop takes it off; next counts a step. The revision counts
-- every operator command and nothing else: a data feed's or a data press's rows carry `src` and
-- do not make an operator's next press stale; cue, staged and live rows are status, not commands.
create or replace function public.control_head_effect(
  p_graphics jsonb, p_graphic text, p_msg jsonb, p_by text, p_press bigint)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_t text := p_msg->>'t';
  v_all jsonb := case when jsonb_typeof(p_graphics) = 'object' then p_graphics else '{}'::jsonb end;
  v_cur jsonb;
  v_rev boolean;
begin
  if coalesce(p_graphic, '') = '' or v_t is null then
    return v_all;
  end if;
  v_rev := v_t in ('update', 'play', 'stop', 'next', 'event', 'snap') and not (p_msg ? 'src');
  if not v_rev and v_t not in ('cue', 'play', 'stop', 'next', 'snap') then
    return v_all;
  end if;
  v_cur := case when jsonb_typeof(v_all->p_graphic) = 'object' then v_all->p_graphic else '{}'::jsonb end;
  if v_t = 'cue' then
    v_cur := v_cur || jsonb_build_object('cue', coalesce(p_msg->'cue', 'null'::jsonb));
  elsif v_t in ('play', 'snap') then
    v_cur := v_cur || '{"on": true, "step": 0}'::jsonb;
  elsif v_t = 'stop' then
    v_cur := v_cur || '{"on": false}'::jsonb;
  elsif v_t = 'next' then
    v_cur := v_cur || jsonb_build_object('step',
      case when jsonb_typeof(v_cur->'step') = 'number' then (v_cur->>'step')::numeric else 0 end + 1);
  end if;
  if v_rev then
    v_cur := v_cur || jsonb_build_object(
      'rev', case when jsonb_typeof(v_cur->'rev') = 'number' then (v_cur->>'rev')::numeric else 0 end + 1,
      'by', p_by,
      'press', p_press);
  end if;
  return v_all || jsonb_build_object(p_graphic, v_cur);
end $$;
revoke all on function public.control_head_effect(jsonb, text, jsonb, text, bigint) from public, anon, authenticated;

-- The named graphics' summaries, for an answer or a frame.
create or replace function public.control_head_pick(p_graphics jsonb, p_names text[])
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(n.name, p_graphics->n.name), '{}'::jsonb)
  from unnest(p_names) as n(name)
  where jsonb_typeof(p_graphics) = 'object' and p_graphics ? n.name;
$$;
revoke all on function public.control_head_pick(jsonb, text[]) from public, anon, authenticated;

-- ── 2. Every old writer's rows get their number, in the lock order above ─────────────────────
-- WHEN (new.seq is null): the new send and report number their own rows under the head lock they
-- already hold, so they skip this entirely.
create or replace function public.control_events_seq()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- (a) The production's row FIRST, and at NO KEY UPDATE: every old writer either holds it already
  --     (report, stage, data) or takes it after its insert (a send's live_cue write), so taking it
  --     here is what puts every writer in the same order.
  perform 1 from public.control_shows s where s.id = new.show_id for no key update;
  -- (b) Then the head, to commit: the number and the summary in one write.
  insert into public.control_heads as h (show_id, seq, graphics)
    values (new.show_id, 1, public.control_head_effect('{}'::jsonb, new.graphic, new.msg, 'legacy', 0))
    on conflict (show_id) do update
      set seq = h.seq + 1,
          graphics = public.control_head_effect(h.graphics, new.graphic, new.msg, 'legacy', 0),
          updated_at = now()
    returning h.seq into new.seq;
  -- Stamped after the head lock, so created_at never runs backwards in seq order (a clock's origin
  -- is derived from it).
  new.created_at := clock_timestamp();
  return new;
end $$;
revoke all on function public.control_events_seq() from public, anon, authenticated;

create trigger control_events_seq
  before insert on public.control_events
  for each row when (new.seq is null)
  execute function public.control_events_seq();

-- ── 3. One frame per inserting statement on `live-<show id>` ──────────────────────────────────
-- realtime.send swallows its own errors into a warning, so a Realtime fault costs this road and
-- never a command; a short lock_timeout around it keeps a stall on realtime.messages from holding
-- the head (and so every Take of this production) for long.
create or replace function public.control_events_frame()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
  v_rows jsonb;
  v_touched text[];
  v_payload jsonb;
  v_lock text;
begin
  for v_show, v_rows, v_touched in
    select f.show_id,
           jsonb_agg(jsonb_build_object('id', f.id, 'seq', f.seq, 'graphic', f.graphic, 'msg', f.msg,
                                        'created_at', f.created_at) order by f.seq),
           array_agg(distinct f.graphic)
      from fresh f
     where f.seq is not null
     group by f.show_id
  loop
    select jsonb_build_object(
             'epoch', h.epoch,
             'rows', v_rows,
             'head', jsonb_build_object('seq', h.seq, 'graphics', public.control_head_pick(h.graphics, v_touched)))
      into v_payload
      from public.control_heads h
     where h.show_id = v_show;
    if v_payload is null then
      continue;
    end if;
    v_lock := current_setting('lock_timeout');
    perform set_config('lock_timeout', '250ms', true);
    perform realtime.send(v_payload, 'batch', 'live-' || v_show::text, true);
    perform set_config('lock_timeout', v_lock, true);
  end loop;
  return null;
end $$;
revoke all on function public.control_events_frame() from public, anon, authenticated;

create trigger control_events_frame
  after insert on public.control_events
  referencing new table as fresh
  for each statement
  execute function public.control_events_frame();

-- ── 4. A data merge no longer blocks a Take: FOR NO KEY UPDATE, 0060's body otherwise ──────────
-- Two merges still serialise (NO KEY UPDATE conflicts with itself); what changes is that the new
-- send's KEY SHARE passes it. Its rows are numbered by the trigger, which re-takes the same lock.
create or replace function public.control_data_apply(p_show uuid, p_patch jsonb, p_src text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_owner_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_bindings jsonb;
  v_recent int;
  v_ingest int;
  v_graphic text;
  v_changes jsonb;
  v_changed jsonb;
  v_id bigint;
  v_writes jsonb := '[]'::jsonb;
  v_pending int;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'not a data patch';
  end if;
  if p_src is null or p_src not in ('api', 'operator') then
    raise exception 'unknown data source';
  end if;
  -- NO KEY UPDATE serialises two feeds (or a feed and an operator) racing on the same production
  -- exactly as FOR UPDATE did, and lets a Take's KEY SHARE through (0070).
  select s.owner_id, s.data, s.bindings
    into v_owner_id, v_before, v_bindings
    from public.control_shows s
    where s.id = p_show
    for no key update;
  if v_owner_id is null then raise exception 'unknown production'; end if;
  if public.feature_denied_for(v_owner_id, 'control.hosted') then
    raise exception 'hosted control is switched off for this page' using errcode = '42501';
  end if;

  v_after := public.jsonb_merge_patch(coalesce(v_before, '{}'::jsonb), p_patch);

  select coalesce(jsonb_object_agg(g.graphic, g.fields), '{}'::jsonb), count(*)
    into v_changes, v_pending
  from (
    select a.graphic, jsonb_object_agg(a.field, a.value) as fields
    from public.production_data_resolve(v_after, v_bindings) a
    left join public.production_data_resolve(v_before, v_bindings) b
      on b.graphic = a.graphic and b.field = a.field
    where b.value is distinct from a.value
    group by a.graphic
  ) g;

  if v_pending > 0 then
    select count(*), count(*) filter (where e.msg->>'src' = 'api')
      into v_recent, v_ingest
      from public.control_events e
      where e.show_id = p_show and e.created_at > now() - interval '5 seconds';
    if v_recent + v_pending > 50 then
      raise exception 'too many commands — slow down' using errcode = 'check_violation';
    end if;
    if p_src = 'api' and v_ingest + v_pending > 25 then
      raise exception 'data budget spent — the operator keeps priority' using errcode = 'check_violation';
    end if;
  end if;

  if v_after is distinct from v_before then
    update public.control_shows s set data = v_after where s.id = p_show;
  end if;

  for v_graphic, v_changed in select key, value from jsonb_each(v_changes) loop
    insert into public.control_events (show_id, graphic, msg)
      values (p_show, v_graphic, jsonb_build_object('t', 'update', 'data', v_changed, 'src', p_src))
      returning public.control_events.id into v_id;
    v_writes := v_writes || jsonb_build_object('graphic', v_graphic, 'event', v_id, 'applied', v_changed);
  end loop;

  return jsonb_build_object('data', v_after, 'writes', v_writes);
end $$;

-- ── 5. The send that knows what it is replacing ─────────────────────────────────────────────
-- p_sender = {id: uuid minted per page load, press: strictly increasing per page and reused only
-- by that payload's resends, epoch: the head epoch the page follows (or null), base: {graphic: the
-- rev this page last saw}, all_out?: true}.
create or replace function public.control_send_seq(p_slug text, p_items jsonb, p_sender jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
  v_owner uuid;
  v_count int;
  v_item jsonb;
  v_sender uuid;
  v_press bigint;
  v_epoch uuid;
  v_all_out boolean;
  v_base jsonb;
  v_key text;
  v_head public.control_heads%rowtype;
  v_touched text[];
  v_g text;
  v_cur jsonb;
  v_mine boolean;
  v_cur_press numeric;
  v_stale boolean := false;
  v_superseded boolean := false;
  v_skip text[] := '{}';
  v_items jsonb;
  v_n int;
  v_recent int;
  v_graphics jsonb;
  v_recent_keys jsonb;
  v_from bigint;
  v_fast jsonb;
begin
  -- 1. Who, and what: 0057's checks, word for word, then the sender.
  select s.id, s.owner_id into v_show, v_owner from public.control_shows s where s.slug = p_slug;
  if v_show is null then raise exception 'unknown control page'; end if;
  if public.feature_denied_for(v_owner, 'control.hosted') then
    raise exception 'hosted control is switched off for this page' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'not a command batch';
  end if;
  v_count := jsonb_array_length(p_items);
  if v_count < 1 or v_count > 8 then
    raise exception 'not a command batch';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(v_item->'msg'->>'t', '') not in ('update', 'play', 'stop', 'next', 'event', 'snap', 'cue')
       or coalesce(v_item->>'graphic', '') = '' then
      raise exception 'not a control command';
    end if;
  end loop;
  if p_sender is null or jsonb_typeof(p_sender) <> 'object'
     or coalesce(p_sender->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or jsonb_typeof(p_sender->'press') is distinct from 'number' then
    raise exception 'not a sender' using errcode = '22023';
  end if;
  v_sender := (p_sender->>'id')::uuid;
  v_press := (p_sender->>'press')::bigint;
  v_epoch := case when jsonb_typeof(p_sender->'epoch') = 'string' then (p_sender->>'epoch')::uuid end;
  v_all_out := coalesce(p_sender->'all_out' = 'true'::jsonb, false);
  v_base := case when jsonb_typeof(p_sender->'base') = 'object' then p_sender->'base' else '{}'::jsonb end;
  v_key := v_sender::text || ':' || v_press::text;
  select array_agg(distinct x.value->>'graphic') into v_touched from jsonb_array_elements(p_items) x;
  -- A press that cannot get the head within 2 s answers 55P03 and is sent again by the page: the
  -- send is idempotent, so that is safe, and it keeps a stalled head from eating the role's
  -- whole statement timeout.
  perform set_config('lock_timeout', '2000', true);

  -- 2. The lock order: the production's row at KEY SHARE (a publish's or a report's NO KEY UPDATE
  --    passes it), then the head.
  perform 1 from public.control_shows s where s.id = v_show for key share;
  insert into public.control_heads (show_id) values (v_show) on conflict (show_id) do nothing;
  select * into v_head from public.control_heads h where h.show_id = v_show for update;

  -- 3. A press already applied is answered as applied, and applied once.
  if v_head.recent ? v_key or (
       select bool_and(coalesce(v_head.graphics->t.name->>'by' = v_sender::text
                                and v_head.graphics->t.name->>'press' = v_press::text, false))
         from unnest(v_touched) as t(name)) then
    return jsonb_build_object('ok', true, 'duplicate', true, 'epoch', v_head.epoch,
      'head', jsonb_build_object('seq', v_head.seq, 'graphics', public.control_head_pick(v_head.graphics, v_touched)));
  end if;

  -- 4. A page following another epoch (the production was unpublished and published again) knows
  --    nothing current: it re-learns from this answer.
  if v_epoch is not null and v_epoch <> v_head.epoch then
    return jsonb_build_object('ok', false, 'refused', 'stale', 'epoch', v_head.epoch,
      'graphics', public.control_head_pick(v_head.graphics, v_touched));
  end if;

  -- 5. The revision, per touched graphic: applied when nothing changed since this page last
  --    looked, or when every change since was this page's own earlier press. All out is never
  --    refused, but a graphic this page has pressed again since is left as that press left it.
  foreach v_g in array v_touched loop
    v_cur := case when jsonb_typeof(v_head.graphics->v_g) = 'object' then v_head.graphics->v_g else '{}'::jsonb end;
    v_mine := coalesce(v_cur->>'by' = v_sender::text, false);
    v_cur_press := case when jsonb_typeof(v_cur->'press') = 'number' then (v_cur->>'press')::numeric else 0 end;
    if v_all_out then
      if v_mine and v_cur_press > v_press then
        v_skip := v_skip || v_g;
      end if;
    elsif not (
        (case when jsonb_typeof(v_base->v_g) = 'number' then (v_base->>v_g)::numeric else 0 end)
          = (case when jsonb_typeof(v_cur->'rev') = 'number' then (v_cur->>'rev')::numeric else 0 end)
        or (v_mine and v_cur_press < v_press)) then
      if v_mine then v_superseded := true; else v_stale := true; end if;
    end if;
  end loop;
  if v_stale or v_superseded then
    return jsonb_build_object('ok', false,
      'refused', case when v_stale then 'stale' else 'superseded' end,
      'epoch', v_head.epoch,
      'graphics', public.control_head_pick(v_head.graphics, v_touched));
  end if;

  select coalesce(jsonb_agg(x.value order by x.ord), '[]'::jsonb) into v_items
    from jsonb_array_elements(p_items) with ordinality as x(value, ord)
   where not ((x.value->>'graphic') = any (v_skip));
  v_n := jsonb_array_length(v_items);
  if v_n = 0 then
    return jsonb_build_object('ok', true, 'epoch', v_head.epoch, 'skipped', to_jsonb(v_skip),
      'head', jsonb_build_object('seq', v_head.seq, 'graphics', public.control_head_pick(v_head.graphics, v_touched)));
  end if;

  -- 6. The burst cap, 0057's rule over at most the last 51 rows (the (show_id, id) index), so it
  --    costs the same on a production with a long log.
  select count(*) into v_recent
    from (select e.created_at from public.control_events e
           where e.show_id = v_show order by e.id desc limit 51) t
   where t.created_at > now() - interval '5 seconds';
  if v_recent + v_n > 50 then
    raise exception 'too many commands — slow down' using errcode = 'check_violation';
  end if;

  -- 7. The numbers and the summary, in one write of the head.
  v_graphics := v_head.graphics;
  for v_item in select x.value from jsonb_array_elements(v_items) with ordinality as x(value, ord) order by x.ord loop
    v_graphics := public.control_head_effect(v_graphics, v_item->>'graphic', v_item->'msg', v_sender::text, v_press);
  end loop;
  v_recent_keys := v_head.recent || to_jsonb(v_key);
  if jsonb_array_length(v_recent_keys) > 64 then
    v_recent_keys := v_recent_keys - 0;
  end if;
  v_from := v_head.seq + 1;
  update public.control_heads h
     set seq = v_head.seq + v_n, graphics = v_graphics, recent = v_recent_keys, updated_at = now()
   where h.show_id = v_show;

  -- 8. The rows, numbered, in ONE statement: one frame on live-<show id>.
  insert into public.control_events (show_id, graphic, msg, seq, created_at)
    select v_show, x.value->>'graphic', x.value->'msg', v_from + x.ord - 1, clock_timestamp()
      from jsonb_array_elements(v_items) with ordinality as x(value, ord)
     order by x.ord;

  -- 9. The fast frame on cmd-<show id>, exactly as 0057 sends it, for old followers.
  select jsonb_agg(jsonb_build_object('graphic', x.value->>'graphic', 'msg', x.value->'msg') order by x.ord)
    into v_fast
    from jsonb_array_elements(v_items) with ordinality as x(value, ord)
   where x.value->'fast' = 'true'::jsonb;
  if v_fast is not null then
    perform realtime.send(jsonb_build_object('items', v_fast), 'cmd', 'cmd-' || v_show::text, true);
  end if;

  -- 10. What this press made of the touched graphics.
  return jsonb_build_object('ok', true, 'epoch', v_head.epoch, 'seq_from', v_from, 'seq_to', v_from + v_n - 1,
    'skipped', to_jsonb(v_skip),
    'head', jsonb_build_object('seq', v_from + v_n - 1, 'graphics', public.control_head_pick(v_graphics, v_touched)));
end $$;
grant execute on function public.control_send_seq(text, jsonb, jsonb) to anon, authenticated;

-- ── 6. The renderer's report, off the hot row ─────────────────────────────────────────────────
-- control_output_report's write, moved to the head: the report (with the seq AND the log row it
-- had applied, so an old reader keeps a dated baseline) and its `live` status row, numbered.
create or replace function public.control_output_report_seq(
  p_output_slug text, p_graphic text, p_data jsonb, p_state jsonb, p_seq bigint, p_event bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
  v_owner uuid;
  v_entry jsonb;
  v_seq bigint;
begin
  select s.id, s.owner_id into v_show, v_owner
    from public.control_shows s where s.output_slug = p_output_slug and p_output_slug is not null;
  if v_show is null then raise exception 'unknown output page'; end if;
  if public.feature_denied_for(v_owner, 'control.hosted') then
    raise exception 'hosted control is switched off for this page' using errcode = '42501';
  end if;
  if coalesce(p_graphic, '') = '' then raise exception 'not a control command'; end if;
  perform set_config('lock_timeout', '2000', true);
  v_entry := jsonb_build_object(
    'data', coalesce(p_data, '{}'::jsonb),
    'state', p_state,
    'at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  if p_seq is not null then v_entry := v_entry || jsonb_build_object('seq', p_seq); end if;
  if p_event is not null then v_entry := v_entry || jsonb_build_object('event', p_event); end if;
  perform 1 from public.control_shows s where s.id = v_show for key share;
  insert into public.control_heads (show_id) values (v_show) on conflict (show_id) do nothing;
  update public.control_heads h
     set seq = h.seq + 1,
         live = jsonb_set(case when jsonb_typeof(h.live) = 'object' then h.live else '{}'::jsonb end,
                          array[p_graphic], v_entry),
         updated_at = now()
   where h.show_id = v_show
  returning h.seq into v_seq;
  insert into public.control_events (show_id, graphic, msg, seq, created_at)
    values (v_show, p_graphic, jsonb_build_object('t', 'live', 'data', p_data, 'state', p_state), v_seq, clock_timestamp());
end $$;
grant execute on function public.control_output_report_seq(text, text, jsonb, jsonb, bigint, bigint) to anon, authenticated;

-- ── 7. The reports and the cue snapshot, read from both homes ────────────────────────────────
-- Per graphic, the newer report by `at` (both writers stamp it the same way). An old reader keeps
-- reading `event` as its baseline; head entries carry it too.
create or replace function public.control_live_merged(p_col jsonb, p_head jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  with c as (select case when jsonb_typeof(p_col) = 'object' then p_col else '{}'::jsonb end as v),
       h as (select case when jsonb_typeof(p_head) = 'object' then p_head else '{}'::jsonb end as v)
  select coalesce(jsonb_object_agg(k.key,
           case
             when h.v->k.key is null then c.v->k.key
             when c.v->k.key is null then h.v->k.key
             when coalesce(h.v->k.key->>'at', '') >= coalesce(c.v->k.key->>'at', '') then h.v->k.key
             else c.v->k.key
           end), '{}'::jsonb)
  from c, h, (select jsonb_object_keys(c.v) as key from c union select jsonb_object_keys(h.v) from h) k;
$$;
revoke all on function public.control_live_merged(jsonb, jsonb) from public, anon, authenticated;

-- live_cue per layer: the head's cue where the head has seen that layer's cue (null = off air),
-- else the column (0034's format 2; format 1 read by 0034's rule). With no head cue at all the
-- column is answered exactly as stored, as it always was.
create or replace function public.control_live_cue_view(p_col jsonb, p_graphics jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_layers jsonb;
  v_name text;
  v_entry jsonb;
  v_any boolean := false;
begin
  if jsonb_typeof(p_graphics) = 'object' then
    select bool_or(jsonb_typeof(g.value) = 'object' and g.value ? 'cue') into v_any from jsonb_each(p_graphics) g;
  end if;
  if not coalesce(v_any, false) then
    return p_col;
  end if;
  if p_col is null or jsonb_typeof(p_col) <> 'object' then
    v_layers := '{}'::jsonb;
  elsif jsonb_typeof(p_col->'v') = 'number' and (p_col->>'v')::numeric >= 2 then
    v_layers := case when jsonb_typeof(p_col->'layers') = 'object' then p_col->'layers' else '{}'::jsonb end;
  elsif p_col->>'graphic' is not null and p_col->>'cue' is not null then
    v_layers := jsonb_build_object(p_col->>'graphic', jsonb_build_object('cue', p_col->'cue', 'at', p_col->'at'));
  else
    v_layers := '{}'::jsonb;
  end if;
  for v_name, v_entry in select g.key, g.value from jsonb_each(p_graphics) g loop
    if jsonb_typeof(v_entry) = 'object' and v_entry ? 'cue' then
      if jsonb_typeof(v_entry->'cue') = 'null' then
        v_layers := v_layers - v_name;
      else
        v_layers := v_layers || jsonb_build_object(v_name, jsonb_build_object('cue', v_entry->'cue'));
      end if;
    end if;
  end loop;
  return jsonb_build_object('v', 2, 'layers', v_layers);
end $$;
revoke all on function public.control_live_cue_view(jsonb, jsonb) from public, anon, authenticated;

-- Every merged report with its seq baseline: its own, or mapped from its `event` (the id of the
-- last row it had applied) to the last seq below the first numbered row after that id. That is a
-- lower bound: every row at or below it has an id at or below `event`, so nothing the report did
-- not contain is skipped; at worst a row it did contain is replayed.
create or replace function public.control_live_seq(p_show uuid, p_live jsonb, p_head_seq bigint)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_out jsonb := '{}'::jsonb;
  v_name text;
  v_entry jsonb;
begin
  if jsonb_typeof(p_live) is distinct from 'object' then return '{}'::jsonb; end if;
  for v_name, v_entry in select g.key, g.value from jsonb_each(p_live) g loop
    if jsonb_typeof(v_entry) = 'object' and jsonb_typeof(v_entry->'seq') is distinct from 'number'
       and jsonb_typeof(v_entry->'event') = 'number' then
      v_entry := v_entry || jsonb_build_object('seq', coalesce(
        (select min(e.seq) from public.control_events e
          where e.show_id = p_show and e.id > (v_entry->>'event')::bigint and e.seq is not null),
        coalesce(p_head_seq, 0) + 1) - 1);
    end if;
    v_out := v_out || jsonb_build_object(v_name, v_entry);
  end loop;
  return v_out;
end $$;
revoke all on function public.control_live_seq(uuid, jsonb, bigint) from public, anon, authenticated;

-- Would a renderer following by seq miss a command? Only a row written before 0070 (seq null) can
-- be missed, and only a renderer COMMAND of a graphic whose report baseline is below it (a graphic
-- with no report replays from the log's start, so any such row of it counts).
create or replace function public.control_head_legacy(p_show uuid, p_live jsonb)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.control_events e
     where e.show_id = p_show and e.seq is null
       and e.msg->>'t' in ('update', 'play', 'stop', 'next', 'event', 'snap')
       and e.id > coalesce(case when jsonb_typeof(p_live->e.graphic->'event') = 'number'
                                then (p_live->e.graphic->>'event')::bigint end, 0));
$$;
revoke all on function public.control_head_legacy(uuid, jsonb) from public, anon, authenticated;

-- ── 8. The old resolves: same shapes, both homes ─────────────────────────────────────────────
create or replace function public.control_show_by_slug(p_slug text)
returns table (id uuid, title text, panel jsonb, staged jsonb, live jsonb, last_event_id bigint,
               output jsonb, output_seen_at timestamptz, live_cue jsonb, profile jsonb)
language sql security definer set search_path = '' stable as $$
  select s.id, s.title, s.panel, s.staged, public.control_live_merged(s.live, h.live),
         coalesce((select max(e.id) from public.control_events e where e.show_id = s.id), 0),
         s.output, s.output_seen_at, public.control_live_cue_view(s.live_cue, h.graphics), s.profile
  from public.control_shows s
  left join public.control_heads h on h.show_id = s.id
  where s.slug = p_slug;
$$;

create or replace function public.control_output_by_slug(p_output_slug text)
returns table (id uuid, title text, output jsonb, live jsonb, last_event_id bigint)
language sql security definer set search_path = '' stable as $$
  select s.id, s.title, s.output, public.control_live_merged(s.live, h.live),
         coalesce((select max(e.id) from public.control_events e where e.show_id = s.id), 0)
  from public.control_shows s
  left join public.control_heads h on h.show_id = s.id
  where s.output_slug = p_output_slug and p_output_slug is not null;
$$;

-- ── 9. The new resolves and tails (proto 2). STABLE: every query in one call reads ONE snapshot,
-- so the head, the reports and the rows it answers agree with each other. ──────────────────────
create or replace function public.control_show_resolve(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_s public.control_shows%rowtype;
  v_h public.control_heads%rowtype;
begin
  select * into v_s from public.control_shows s where s.slug = p_slug and p_slug is not null;
  if v_s.id is null then return null; end if;
  select * into v_h from public.control_heads h where h.show_id = v_s.id;
  return jsonb_build_object(
    'proto', 2,
    'id', v_s.id, 'title', v_s.title, 'panel', v_s.panel, 'staged', v_s.staged,
    'live', public.control_live_merged(v_s.live, v_h.live),
    'last_event_id', coalesce((select max(e.id) from public.control_events e where e.show_id = v_s.id), 0),
    'output', v_s.output, 'output_seen_at', v_s.output_seen_at,
    'live_cue', public.control_live_cue_view(v_s.live_cue, v_h.graphics),
    'profile', v_s.profile,
    'epoch', v_h.epoch, 'seq', coalesce(v_h.seq, 0), 'graphics', coalesce(v_h.graphics, '{}'::jsonb));
end $$;
grant execute on function public.control_show_resolve(text) to anon, authenticated;

create or replace function public.control_output_resolve(p_output_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_s public.control_shows%rowtype;
  v_h public.control_heads%rowtype;
  v_live jsonb;
begin
  select * into v_s from public.control_shows s where s.output_slug = p_output_slug and p_output_slug is not null;
  if v_s.id is null then return null; end if;
  select * into v_h from public.control_heads h where h.show_id = v_s.id;
  v_live := public.control_live_merged(v_s.live, v_h.live);
  return jsonb_build_object(
    'proto', 2,
    'id', v_s.id, 'title', v_s.title, 'output', v_s.output,
    'live', public.control_live_seq(v_s.id, v_live, coalesce(v_h.seq, 0)),
    'last_event_id', coalesce((select max(e.id) from public.control_events e where e.show_id = v_s.id), 0),
    'epoch', v_h.epoch, 'seq', coalesce(v_h.seq, 0), 'graphics', coalesce(v_h.graphics, '{}'::jsonb),
    'legacy', public.control_head_legacy(v_s.id, v_live));
end $$;
grant execute on function public.control_output_resolve(text) to anon, authenticated;

-- Rows after a seq, in seq order, at most 500. The answer is authoritative: a gap inside or before
-- it is a deletion (the 7-day prune, a cascade), never a row still to come, because a row cannot
-- commit before a lower seq. A different epoch answers `reset`.
create or replace function public.control_tail_seq_for(p_show uuid, p_after bigint, p_epoch uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_epoch uuid;
  v_seq bigint;
  v_after bigint := greatest(coalesce(p_after, 0), 0);
  v_want bigint;
  v_rows jsonb;
  v_found int;
begin
  select h.epoch, h.seq into v_epoch, v_seq from public.control_heads h where h.show_id = p_show;
  if v_epoch is null then
    return jsonb_build_object('epoch', null, 'rows', '[]'::jsonb, 'reset', p_epoch is not null);
  end if;
  if p_epoch is not null and p_epoch <> v_epoch then
    return jsonb_build_object('epoch', v_epoch, 'rows', '[]'::jsonb, 'reset', true);
  end if;
  v_want := least(greatest(v_seq - v_after, 0), 500);
  if v_want = 0 then
    return jsonb_build_object('epoch', v_epoch, 'rows', '[]'::jsonb);
  end if;
  -- The newest rows by id, through the (show_id, id) index: seq order and id order differ only by
  -- rows in flight together, which 64 covers. Anything short of what the head says exists falls
  -- back to the per-production read below.
  select coalesce(jsonb_agg(r order by r.seq), '[]'::jsonb), count(*) into v_rows, v_found
    from (select t.id, t.seq, t.graphic, t.msg, t.created_at
            from (select e.id, e.seq, e.graphic, e.msg, e.created_at
                    from public.control_events e
                   where e.show_id = p_show
                   order by e.id desc
                   limit (v_seq - v_after) + 64) t
           where t.seq > v_after
           order by t.seq
           limit 500) r;
  if v_found < v_want then
    select coalesce(jsonb_agg(r order by r.seq), '[]'::jsonb) into v_rows
      from (select e.id, e.seq, e.graphic, e.msg, e.created_at
              from public.control_events e
             where e.show_id = p_show and e.seq > v_after
             order by e.seq
             limit 500) r;
  end if;
  return jsonb_build_object('epoch', v_epoch, 'rows', v_rows);
end $$;
revoke all on function public.control_tail_seq_for(uuid, bigint, uuid) from public, anon, authenticated;

create or replace function public.control_tail_seq(p_slug text, p_after bigint, p_epoch uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_show uuid;
begin
  select s.id into v_show from public.control_shows s where s.slug = p_slug and p_slug is not null;
  if v_show is null then raise exception 'unknown control page'; end if;
  return public.control_tail_seq_for(v_show, p_after, p_epoch);
end $$;
grant execute on function public.control_tail_seq(text, bigint, uuid) to anon, authenticated;

create or replace function public.control_output_tail_seq(p_output_slug text, p_after bigint, p_epoch uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_show uuid;
begin
  select s.id into v_show from public.control_shows s where s.output_slug = p_output_slug and p_output_slug is not null;
  if v_show is null then raise exception 'unknown output page'; end if;
  return public.control_tail_seq_for(v_show, p_after, p_epoch);
end $$;
grant execute on function public.control_output_tail_seq(text, bigint, uuid) to anon, authenticated;

-- ── 10. Prove it, or refuse to apply ──────────────────────────────────────────────────────────
-- CALLS every path on a throwaway production (supabase/AGENTS.md: a self-check proves shape, never
-- behaviour). The live- read policy is 0068's; this file only asserts it (creating or re-creating
-- a policy on realtime.messages would lock all of Realtime's database traffic).
do $$
declare
  v_role  text := current_role;
  v_owner uuid;
  v_show  uuid := '00000000-0070-4000-8000-000000000070';
  v_a     uuid := '00000000-0070-4000-8000-00000000000a';
  v_b     uuid := '00000000-0070-4000-8000-00000000000b';
  v_slug  text;
  v_out   text;
  v_epoch uuid;
  v_ans   jsonb;
  v_res   jsonb;
  v_n     int;
  v_id    bigint;
  v_err   text;
  v_state text;
  v_rt    boolean;
  v_live  bigint;
  v_frame jsonb;
  v_row   record;
  v_take  jsonb := '[{"graphic":"Bug","msg":{"t":"update","data":{"f0":"y"}},"fast":true},
                     {"graphic":"Bug","msg":{"t":"play"},"fast":true},
                     {"graphic":"Bug","msg":{"t":"cue","cue":"cue-b"},"fast":true}]';
  v_off   jsonb := '[{"graphic":"Bug","msg":{"t":"stop"},"fast":true},
                     {"graphic":"Bug","msg":{"t":"cue","cue":null},"fast":true}]';
begin
  -- (a) SHAPE, including what a client must NOT reach.
  if to_regprocedure('public.control_send_seq(text,jsonb,jsonb)') is null
     or to_regprocedure('public.control_show_resolve(text)') is null
     or to_regprocedure('public.control_output_resolve(text)') is null
     or to_regprocedure('public.control_tail_seq(text,bigint,uuid)') is null
     or to_regprocedure('public.control_output_tail_seq(text,bigint,uuid)') is null
     or to_regprocedure('public.control_output_report_seq(text,text,jsonb,jsonb,bigint,bigint)') is null then
    raise exception '0070 self-check failed: a new RPC is missing';
  end if;
  if not has_function_privilege('anon', 'public.control_send_seq(text,jsonb,jsonb)', 'execute')
     or not has_function_privilege('anon', 'public.control_show_resolve(text)', 'execute')
     or not has_function_privilege('anon', 'public.control_output_resolve(text)', 'execute')
     or not has_function_privilege('anon', 'public.control_tail_seq(text,bigint,uuid)', 'execute')
     or not has_function_privilege('anon', 'public.control_output_tail_seq(text,bigint,uuid)', 'execute')
     or not has_function_privilege('anon', 'public.control_output_report_seq(text,text,jsonb,jsonb,bigint,bigint)', 'execute')
     or not has_function_privilege('authenticated', 'public.control_send_seq(text,jsonb,jsonb)', 'execute')
     or not has_function_privilege('anon', 'public.control_show_by_slug(text)', 'execute')
     or not has_function_privilege('anon', 'public.control_output_by_slug(text)', 'execute') then
    raise exception '0070 self-check failed: a signed-out page cannot reach an RPC it needs';
  end if;
  if has_function_privilege('anon', 'public.control_tail_seq_for(uuid,bigint,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.control_tail_seq_for(uuid,bigint,uuid)', 'execute')
     or has_function_privilege('anon', 'public.control_head_effect(jsonb,text,jsonb,text,bigint)', 'execute')
     or has_function_privilege('anon', 'public.control_live_seq(uuid,jsonb,bigint)', 'execute')
     or has_function_privilege('anon', 'public.control_data_apply(uuid,jsonb,text)', 'execute') then
    raise exception '0070 self-check failed: an internal function is reachable from a client';
  end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.control_events'::regclass
                  and t.tgname = 'control_events_seq' and not t.tgisinternal)
     or not exists (select 1 from pg_trigger t where t.tgrelid = 'public.control_events'::regclass
                  and t.tgname = 'control_events_frame' and not t.tgisinternal)
     or not exists (select 1 from pg_trigger t where t.tgrelid = 'public.control_events'::regclass
                  and t.tgname = 'control_events_broadcast' and not t.tgisinternal) then
    raise exception '0070 self-check failed: a trigger on control_events is missing';
  end if;
  -- The frames go to live-<show id>; a follower can read them only through 0068's policy.
  if not exists (select 1 from pg_policies p where p.schemaname = 'realtime' and p.tablename = 'messages'
                  and p.cmd in ('SELECT', 'ALL') and p.qual like '%live-%') then
    raise exception '0070 self-check failed: no read policy admits the live- topic (0068 must apply first)';
  end if;
  -- And no client may put a broadcast on any private topic (0056's rule): a client insert policy
  -- on realtime.messages is admissible only for Presence (0068).
  if exists (select 1 from pg_policies p where p.schemaname = 'realtime' and p.tablename = 'messages'
              and p.cmd in ('INSERT', 'ALL') and (p.roles::text[] && array['anon', 'authenticated', 'public'])
              and coalesce(p.with_check, '') not like '%presence%') then
    raise exception '0070 self-check failed: a client can broadcast on realtime.messages';
  end if;

  -- (b) CALL it. An instance with no account cannot own a production, and must still apply.
  select u.id into v_owner from auth.users u limit 1;
  if v_owner is null then
    raise notice '0070 self-check skipped the live half: no account on this instance';
    return;
  end if;
  insert into public.control_shows (id, owner_id, title, output, bindings)
    values (v_show, v_owner, '0070 self-check', '{"v":1,"graphics":[{"key":"Bug"},{"key":"Card"}],"cues":[]}'::jsonb,
            '{"Bug":{"f0":"score"}}'::jsonb)
    returning slug, output_slug into v_slug, v_out;

  -- (c) An OLD writer, unchanged: a Take through control_send_many is numbered 1..3 in order.
  perform public.control_send_many(v_slug, '[{"graphic":"Bug","msg":{"t":"update","data":{"f0":"x"}},"fast":true},
    {"graphic":"Bug","msg":{"t":"play"},"fast":true},{"graphic":"Bug","msg":{"t":"cue","cue":"cue-a"},"fast":true}]'::jsonb);
  if (select array_agg(e.seq order by e.id) from public.control_events e where e.show_id = v_show) is distinct from array[1,2,3]::bigint[] then
    raise exception '0070 self-check failed: an old send''s rows were not numbered 1, 2, 3';
  end if;
  select h.epoch into v_epoch from public.control_heads h where h.show_id = v_show;
  if (select h.seq from public.control_heads h where h.show_id = v_show) <> 3
     or (select h.graphics->'Bug' from public.control_heads h where h.show_id = v_show)
          is distinct from '{"rev":2,"on":true,"step":0,"cue":"cue-a","by":"legacy","press":0}'::jsonb then
    raise exception '0070 self-check failed: the head did not follow an old send (%)',
      (select h.graphics from public.control_heads h where h.show_id = v_show);
  end if;
  if (select s.live_cue->'layers'->'Bug'->>'cue' from public.control_shows s where s.id = v_show) is distinct from 'cue-a' then
    raise exception '0070 self-check failed: the old send stopped writing live_cue';
  end if;
  -- One frame per statement on live-, one row per row on log-, the marked items on cmd-. Asserted
  -- where Realtime can write at all (a stack whose realtime.messages has no partition for today
  -- cannot, and that is not this file's fault).
  select count(*) > 0 into v_rt from realtime.messages m where m.topic = 'log-' || v_show::text;
  if v_rt then
    if (select count(*) from realtime.messages m where m.topic = 'log-' || v_show::text) <> 3
       or (select count(*) from realtime.messages m where m.topic = 'cmd-' || v_show::text) <> 1
       or (select count(*) from realtime.messages m where m.topic = 'live-' || v_show::text) <> 1 then
      raise exception '0070 self-check failed: an old send did not write 3 log-, 1 cmd- and 1 live- messages';
    end if;
    select m.payload into v_frame from realtime.messages m where m.topic = 'live-' || v_show::text;
    if v_frame->>'epoch' is distinct from v_epoch::text
       or (select array_agg((r.value->>'seq')::bigint order by r.ord) from jsonb_array_elements(v_frame->'rows') with ordinality r(value, ord))
            is distinct from array[1,2,3]::bigint[]
       or v_frame->'head'->'graphics'->'Bug'->>'cue' is distinct from 'cue-a'
       or (v_frame->'head'->>'seq')::bigint <> 3 then
      raise exception '0070 self-check failed: the live- frame is not the rows in seq order with the head (%)', v_frame;
    end if;
  else
    raise notice '0070 self-check: realtime.messages took no row on this instance; the frame counts are not asserted';
  end if;

  -- (d) control_send still answers the id it inserted, and that row is numbered 4.
  v_id := public.control_send(v_slug, 'Card', '{"t":"update","data":{}}'::jsonb);
  if (select e.seq from public.control_events e where e.id = v_id) is distinct from 4 then
    raise exception '0070 self-check failed: control_send''s row was not numbered 4';
  end if;

  -- (e) control_send_seq accepts a press made on the current revision (Bug rev 2).
  v_ans := public.control_send_seq(v_slug, v_take,
    jsonb_build_object('id', v_a, 'press', 1, 'epoch', v_epoch, 'base', jsonb_build_object('Bug', 2)));
  if v_ans->>'ok' <> 'true' or (v_ans->>'seq_from')::bigint <> 5 or (v_ans->>'seq_to')::bigint <> 7
     or (v_ans->'head'->'graphics'->'Bug'->>'rev')::int <> 4 then
    raise exception '0070 self-check failed: a current press was not accepted as 5..7 (%)', v_ans;
  end if;
  if (select bool_and(x.ok) from (select e.created_at >= lag(e.created_at) over (order by e.seq) as ok
                                     from public.control_events e where e.show_id = v_show) x where x.ok is not null) is not true then
    raise exception '0070 self-check failed: created_at runs backwards in seq order';
  end if;
  if v_rt and ((select count(*) from realtime.messages m where m.topic = 'live-' || v_show::text) <> 3
       or (select count(*) from realtime.messages m where m.topic = 'cmd-' || v_show::text) <> 2
       or (select count(*) from realtime.messages m where m.topic = 'log-' || v_show::text) <> 7) then
    raise exception '0070 self-check failed: the new send did not write one live- frame, one cmd- frame and a log- row per row';
  end if;
  -- The head, not the old column, now says which cue is up, and the old resolve answers the head.
  if (select r.live_cue->'layers'->'Bug'->>'cue' from public.control_show_by_slug(v_slug) r) is distinct from 'cue-b' then
    raise exception '0070 self-check failed: control_show_by_slug did not answer the head''s cue';
  end if;

  -- (f) Another screen's press made without seeing that change is refused as stale, and inserts nothing.
  v_ans := public.control_send_seq(v_slug, v_off,
    jsonb_build_object('id', v_b, 'press', 1, 'epoch', v_epoch, 'base', jsonb_build_object('Bug', 2)));
  if v_ans->>'refused' is distinct from 'stale' or (v_ans->'graphics'->'Bug'->>'rev')::int <> 4
     or (select count(*) from public.control_events e where e.show_id = v_show) <> 7 then
    raise exception '0070 self-check failed: a stale press was not refused (%)', v_ans;
  end if;

  -- (g) The same page's next press is accepted on its own chain, without having seen its answer.
  v_ans := public.control_send_seq(v_slug, v_off,
    jsonb_build_object('id', v_a, 'press', 2, 'epoch', v_epoch, 'base', jsonb_build_object('Bug', 2)));
  if v_ans->>'ok' <> 'true' or (v_ans->>'seq_from')::bigint <> 8 then
    raise exception '0070 self-check failed: the page''s own next press was refused (%)', v_ans;
  end if;
  if (select r.live_cue->'layers' ? 'Bug' from public.control_show_by_slug(v_slug) r)
     or (select s.live_cue->'layers'->'Bug'->>'cue' from public.control_shows s where s.id = v_show) is distinct from 'cue-a' then
    raise exception '0070 self-check failed: an Out through the head did not take the layer off in the resolve';
  end if;

  -- (h) The page's later press (4) lands first; its earlier one (3) arriving after it is superseded.
  v_ans := public.control_send_seq(v_slug, '[{"graphic":"Bug","msg":{"t":"update","data":{"f0":"z"}}}]'::jsonb,
    jsonb_build_object('id', v_a, 'press', 4, 'epoch', v_epoch, 'base', '{}'::jsonb));
  if v_ans->>'ok' <> 'true' then
    raise exception '0070 self-check failed: a chained press was refused (%)', v_ans;
  end if;
  v_ans := public.control_send_seq(v_slug, '[{"graphic":"Bug","msg":{"t":"play"}}]'::jsonb,
    jsonb_build_object('id', v_a, 'press', 3, 'epoch', v_epoch, 'base', '{}'::jsonb));
  if v_ans->>'refused' is distinct from 'superseded' then
    raise exception '0070 self-check failed: an earlier press arriving late was not superseded (%)', v_ans;
  end if;

  -- (i) A resend of a press that applied is answered as applied, and inserts nothing.
  v_n := (select count(*) from public.control_events e where e.show_id = v_show);
  v_ans := public.control_send_seq(v_slug, '[{"graphic":"Bug","msg":{"t":"update","data":{"f0":"z"}}}]'::jsonb,
    jsonb_build_object('id', v_a, 'press', 4, 'epoch', v_epoch, 'base', '{}'::jsonb));
  if v_ans->>'duplicate' is distinct from 'true' or (select count(*) from public.control_events e where e.show_id = v_show) <> v_n then
    raise exception '0070 self-check failed: a resent press was not answered as applied (%)', v_ans;
  end if;

  -- (j) A late All out (press 3) is never refused, but leaves Bug as the page's later press 4 left it.
  v_ans := public.control_send_seq(v_slug,
    '[{"graphic":"Bug","msg":{"t":"stop"}},{"graphic":"Bug","msg":{"t":"cue","cue":null}},
      {"graphic":"Card","msg":{"t":"stop"}},{"graphic":"Card","msg":{"t":"cue","cue":null}}]'::jsonb,
    jsonb_build_object('id', v_a, 'press', 3, 'epoch', v_epoch, 'base', '{}'::jsonb, 'all_out', true));
  if v_ans->>'ok' <> 'true' or v_ans->'skipped' <> '["Bug"]'::jsonb
     or (select count(*) from public.control_events e where e.show_id = v_show and e.seq > v_n) <> 2
     or exists (select 1 from public.control_events e where e.show_id = v_show and e.seq > v_n and e.graphic = 'Bug') then
    raise exception '0070 self-check failed: All out undid the page''s later press, or was refused (%)', v_ans;
  end if;

  -- (k) Another epoch is stale; a sender that is not a uuid, and the two batch refusals, still raise.
  v_ans := public.control_send_seq(v_slug, v_off,
    jsonb_build_object('id', v_a, 'press', 9, 'epoch', gen_random_uuid(), 'base', '{}'::jsonb));
  if v_ans->>'refused' is distinct from 'stale' or v_ans->>'epoch' is distinct from v_epoch::text then
    raise exception '0070 self-check failed: another epoch was not refused as stale (%)', v_ans;
  end if;
  v_err := null;
  begin
    perform public.control_send_seq(v_slug, v_off, '{"id":"legacy","press":1}'::jsonb);
  exception when others then v_err := sqlerrm;
  end;
  if v_err is distinct from 'not a sender' then
    raise exception '0070 self-check failed: a sender that is not a uuid was accepted (%)', v_err;
  end if;
  v_err := null;
  begin
    perform public.control_send_seq(v_slug, '[]'::jsonb, jsonb_build_object('id', v_a, 'press', 10));
  exception when others then v_err := sqlerrm;
  end;
  if v_err is distinct from 'not a command batch' then
    raise exception '0070 self-check failed: an empty batch was not refused (%)', v_err;
  end if;
  v_err := null;
  begin
    perform public.control_send_seq(v_slug, '[{"graphic":"Bug","msg":{"t":"nope"}}]'::jsonb, jsonb_build_object('id', v_a, 'press', 10));
  exception when others then v_err := sqlerrm;
  end;
  if v_err is distinct from 'not a control command' then
    raise exception '0070 self-check failed: an unknown command was not refused (%)', v_err;
  end if;

  -- (l) Reports: the new one lands on the head with its seq and row; the old one still on the
  --     column; the old resolves answer both, each from its newer home.
  select e.id, e.seq into v_row from public.control_events e where e.show_id = v_show order by e.seq desc limit 1;
  perform public.control_output_report_seq(v_out, 'Bug', '{"f0":"z"}'::jsonb, '{"groups":{"g":"s"}}'::jsonb, v_row.seq, v_row.id);
  if (select h.live->'Bug'->>'seq' from public.control_heads h where h.show_id = v_show) is distinct from v_row.seq::text
     or not exists (select 1 from public.control_events e where e.show_id = v_show and e.graphic = 'Bug'
                     and e.msg->>'t' = 'live' and e.seq = (select h.seq from public.control_heads h where h.show_id = v_show)) then
    raise exception '0070 self-check failed: the new report did not land on the head with a numbered live row';
  end if;
  perform public.control_output_report(v_out, 'Card', '{"f0":"c"}'::jsonb, null, v_id);
  select r.live into v_res from public.control_show_by_slug(v_slug) r;
  if v_res->'Bug'->>'seq' is distinct from v_row.seq::text or v_res->'Card'->>'event' is distinct from v_id::text then
    raise exception '0070 self-check failed: control_show_by_slug did not merge the two report homes (%)', v_res;
  end if;
  if (select r.live from public.control_output_by_slug(v_out) r) is distinct from v_res then
    raise exception '0070 self-check failed: control_output_by_slug answers other reports than control_show_by_slug';
  end if;

  -- (m) A production-data merge still merges and appends, numbered, and does not make a press stale.
  v_n := (select (h.graphics->'Bug'->>'rev')::int from public.control_heads h where h.show_id = v_show);
  v_ans := public.control_data_apply(v_show, '{"score": 7}'::jsonb, 'operator');
  if v_ans->'data'->>'score' is distinct from '7' or jsonb_array_length(v_ans->'writes') <> 1
     or (select e.seq from public.control_events e where e.id = (v_ans->'writes'->0->>'event')::bigint)
          is distinct from (select h.seq from public.control_heads h where h.show_id = v_show)
     or (select (h.graphics->'Bug'->>'rev')::int from public.control_heads h where h.show_id = v_show) <> v_n then
    raise exception '0070 self-check failed: control_data_apply did not merge, append and leave the revision (%)', v_ans;
  end if;

  -- (n) The proto 2 reads, called as a signed-out page would call them.
  set local role anon;
  v_res := public.control_output_resolve(v_out);
  v_ans := public.control_show_resolve(v_slug);
  v_live := (v_res->>'seq')::bigint;
  v_frame := public.control_tail_seq(v_slug, 0, v_epoch);
  v_state := public.control_output_tail_seq(v_out, v_live - 2, v_epoch)::text;
  v_err := (public.control_output_tail_seq(v_out, 0, gen_random_uuid()))::text;
  v_id := null;
  v_ans := v_ans || jsonb_build_object('_send', public.control_send_seq(v_slug, '[{"graphic":"Card","msg":{"t":"next"}}]'::jsonb,
    jsonb_build_object('id', v_b, 'press', 2, 'epoch', v_epoch,
      'base', jsonb_build_object('Card', (v_ans->'graphics'->'Card'->>'rev')::int))));
  execute format('set local role %I', v_role);
  if v_res->>'proto' <> '2' or v_res->>'epoch' is distinct from v_epoch::text or (v_res->>'legacy')::boolean
     or v_res->'live'->'Bug'->>'seq' is distinct from v_row.seq::text
     or v_res->'live'->'Card'->>'seq' is distinct from '4' then
    raise exception '0070 self-check failed: control_output_resolve (%)', v_res;
  end if;
  if v_ans->>'proto' <> '2' or (v_ans->>'seq')::bigint <> v_live or v_ans->'live_cue'->'layers' ? 'Bug'
     or v_ans->'_send'->>'ok' <> 'true' then
    raise exception '0070 self-check failed: control_show_resolve, or a send as anon (%)', v_ans;
  end if;
  if jsonb_array_length(v_frame->'rows') <> v_live
     or (select bool_and((r.value->>'seq')::bigint = r.ord) from jsonb_array_elements(v_frame->'rows') with ordinality r(value, ord)) is not true then
    raise exception '0070 self-check failed: control_tail_seq did not answer every row in seq order';
  end if;
  if jsonb_array_length((v_state::jsonb)->'rows') <> 2 or ((v_err::jsonb)->>'reset')::boolean is not true then
    raise exception '0070 self-check failed: control_output_tail_seq (% / %)', v_state, v_err;
  end if;

  -- (o) Unpublish takes the head with it; a republish under the same id starts a new epoch at 1.
  delete from public.control_shows where id = v_show;
  if exists (select 1 from public.control_heads h where h.show_id = v_show) then
    raise exception '0070 self-check failed: the head outlived its production';
  end if;
  insert into public.control_shows (id, owner_id, title) values (v_show, v_owner, '0070 self-check')
    returning slug into v_slug;
  perform public.control_send_many(v_slug, v_off);
  if (select h.seq from public.control_heads h where h.show_id = v_show) <> 2
     or (select h.epoch from public.control_heads h where h.show_id = v_show) = v_epoch then
    raise exception '0070 self-check failed: a republished production did not start a new epoch at 1';
  end if;

  delete from public.control_shows where id = v_show;
exception when others then
  execute format('set local role %I', v_role);
  raise;
end $$;
