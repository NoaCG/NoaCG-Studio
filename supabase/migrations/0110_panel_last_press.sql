-- WHERE A PANEL'S PRESSES START (issue #2140; docs/work-specs/hardware-panel-control/protocol.md §6.2).
--
-- WHAT CHANGES. The answering page runs one panel's presses in press order, by the number in the
-- press id (`<instance>:<n>`). Until now the first press a page heard from a panel set that count,
-- so when the first two presses after the page opened arrived reversed (the relay sends each press
-- as its own broadcast; about 8% of pairs 50 ms apart arrive reversed on hosted runs), the later one
-- ran first and the earlier one ran after it, ending on the wrong cue. Now:
-- - `panel_press` records, on the key's own row, the newest press id the relay took from it
--   (`panel_keys.last_press`), in the same write as its burst cap and last use;
-- - `panel_lease` answers those ids (`last_presses`), so the page starts each panel's count after
--   the last press it will never hear, and holds a later press that arrives first.
-- A press refused by the burst cap or for want of a page (slow-down, no-page) is recorded too: its
-- number is spent, so the page must not wait for it. One refused before that (bad-press,
-- not-a-panel-verb) is not; like a press lost on the way, it costs the next press one 500 ms wait.
-- A key with no press since this applied names nothing, and its first press sets the count as
-- before.
--
-- WHAT DOES NOT. Every press is checked, refused, rate-limited and broadcast exactly as 0103 does it,
-- and `panel_lease` decides exactly as 0081 does; it only answers one more field, which a page built
-- before this ignores. One nullable column on `panel_keys`, which only the panel functions touch. No
-- policy, grant or topic changes; no `control_*` object is created, altered or granted, so this is
-- not a live-path migration.
--
-- Rollback: a later migration restores 0103's `panel_press` and 0081's `panel_lease` bodies; pages
-- then fall back to the first press setting the count. The column can stay.

set lock_timeout = '2s';
set statement_timeout = '30s';

alter table public.panel_keys add column if not exists last_press text;

-- ── 1. The relay records each panel's last press ──────────────────────────────────────────────

create or replace function public.panel_press(p_key text, p_press jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_key public.panel_keys;
  v_room public.panel_rooms;
  v_owner uuid;
  v_verb text := p_press->>'verb';
  v_target text := p_press->>'target';
  v_seen jsonb := p_press->'seen';
  v_id text := p_press->>'id';
  v_count int;
  v_fault text;
begin
  v_key := public.panel_key_row(p_key);
  if v_key.id is null then return jsonb_build_object('ok', false, 'refused', 'unknown-key'); end if;
  if v_key.revoked_at is not null then return jsonb_build_object('ok', false, 'refused', 'revoked'); end if;
  -- Checked in steps: SQL does not promise to evaluate an OR left to right, and `seen` is cast only
  -- once it is known to be a number.
  if jsonb_typeof(p_press) is distinct from 'object' or jsonb_typeof(v_seen) is distinct from 'number'
     or v_target is null or v_target !~ '^[^[:cntrl:]]{0,128}$'
     or coalesce(v_id, '') !~ '^[a-z0-9]{6,24}:[0-9]{1,12}$' then
    return jsonb_build_object('ok', false, 'refused', 'bad-press');
  end if;
  if v_seen::numeric < 0 or v_seen::numeric <> trunc(v_seen::numeric) then
    return jsonb_build_object('ok', false, 'refused', 'bad-press');
  end if;
  -- One list of the verbs this relay takes: `panel_relay`'s, which a page reads too.
  if v_verb is null or not (public.panel_relay()->'verbs') ? v_verb then
    return jsonb_build_object('ok', false, 'refused', 'not-a-panel-verb');
  end if;
  if v_verb = 'graphic-action' then
    v_fault := public.panel_action_fault(p_press);
    if v_fault is not null then return jsonb_build_object('ok', false, 'refused', 'bad-press', 'note', v_fault); end if;
  end if;
  -- The burst cap, the last use and the last press, in one write of the key's own row.
  update public.panel_keys k set
      window_count = case when k.window_start > now() - interval '2 seconds' then k.window_count + 1 else 1 end,
      window_start = case when k.window_start > now() - interval '2 seconds' then k.window_start else now() end,
      last_used_at = now(),
      -- The panel's count (issue #2140): the newest press of its module start. Two calls of one
      -- instance can commit out of order, so a lower number never replaces a higher one.
      last_press = case
        when split_part(k.last_press, ':', 1) = split_part(v_id, ':', 1)
         and split_part(k.last_press, ':', 2)::bigint > split_part(v_id, ':', 2)::bigint then k.last_press
        else v_id end
    where k.id = v_key.id
    returning k.window_count into v_count;
  if v_count > 20 then return jsonb_build_object('ok', false, 'refused', 'slow-down'); end if;
  select s.owner_id into v_owner from public.control_shows s where s.id = v_key.show_id;
  -- FOR SHARE: a claim being taken right now commits first, so the press carries the claim that
  -- answers when it is sent, never one a page is in the middle of losing.
  select * into v_room from public.panel_rooms r where r.show_id = v_key.show_id for share;
  if v_room.show_id is null or not public.panel_room_live(v_room) or public.feature_denied_for(v_owner, 'control.hosted') then
    return jsonb_build_object('ok', false, 'refused', 'no-page');
  end if;
  -- `press_id`, never `id`: Realtime puts its own message id at `id` in every payload the database
  -- broadcasts (seen on the preview branch), which would replace the press id the page dedupes by.
  if v_verb = 'graphic-action' then
    perform realtime.send(
      jsonb_build_object('v', 2, 'verb', v_verb, 'target', v_target, 'seen', v_seen, 'press_id', v_id,
        'claim', v_room.claim, 'panel', jsonb_build_object('id', v_key.id, 'label', v_key.label),
        'cap', p_press->>'cap', 'instance', p_press->>'instance', 'args', coalesce(p_press->'args', '{}'::jsonb)),
      'press', 'pnp-' || v_room.press_token, true);
  else
    perform realtime.send(
      jsonb_build_object('v', 1, 'verb', v_verb, 'target', v_target, 'seen', v_seen, 'press_id', v_id,
        'claim', v_room.claim, 'panel', jsonb_build_object('id', v_key.id, 'label', v_key.label)),
      'press', 'pnp-' || v_room.press_token, true);
  end if;
  return jsonb_build_object('ok', true, 'claim', v_room.claim);
end $$;

-- ── 2. The lease answers them ─────────────────────────────────────────────────────────────────

create or replace function public.panel_lease(p_slug text, p_page text, p_where text, p_label text, p_move boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_room public.panel_rooms;
  v_label text := left(btrim(coalesce(p_label, '')), 60);
  v_lease constant interval := interval '15 seconds';
begin
  if coalesce(p_page, '') !~ '^[a-z0-9]{16}$' or coalesce(p_where, '') not in ('production', 'control') then
    raise exception 'not a page' using errcode = '22023';
  end if;
  v_room := public.panel_room_for_slug(p_slug);
  -- FOR UPDATE: two pages opening together queue here, and the second sees the first's lease.
  select * into v_room from public.panel_rooms r where r.show_id = v_room.show_id for update;
  if public.panel_room_live(v_room) and v_room.claim_page = p_page then
    -- Already this page's (a renewal, or the same tab reloaded): the same claim, a fresh lease.
    update public.panel_rooms r set lease_until = now() + v_lease, claim_where = p_where, claim_label = v_label
     where r.show_id = v_room.show_id
     returning * into v_room;
  elsif public.panel_room_live(v_room) and not coalesce(p_move, false) then
    return jsonb_build_object('ok', false, 'refused', 'held',
      'answering', jsonb_build_object('page', v_room.claim_page, 'where', v_room.claim_where,
        'label', v_room.claim_label, 'at', v_room.claimed_at));
  else
    -- Free, lapsed, or moved here: a new claim, announced so a previous holder stops answering.
    update public.panel_rooms r set claim = r.claim + 1, answering = true, claim_page = p_page,
        claim_where = p_where, claim_label = v_label, claimed_at = now(), lease_until = now() + v_lease
      where r.show_id = v_room.show_id
      returning * into v_room;
    perform realtime.send(jsonb_build_object('v', 1, 'claim', v_room.claim, 'page', p_page, 'where', p_where, 'label', v_label),
      'claim', 'pnp-' || v_room.press_token, true);
  end if;
  -- Each panel's last press the relay took, read after the claim above is settled: a press stamped
  -- with an earlier claim never reaches this page, and every press after this does (panel_press
  -- writes the key, then reads the room FOR SHARE, so a press in flight waits for this to commit).
  return jsonb_build_object('ok', true, 'claim', v_room.claim,
    'press_topic', 'pnp-' || v_room.press_token, 'feedback_topic', 'pfb-' || v_room.feedback_token,
    'last_presses', coalesce((select jsonb_agg(k.last_press order by k.created_at) from public.panel_keys k
      where k.show_id = v_room.show_id and k.revoked_at is null and k.last_press is not null), '[]'::jsonb));
end $$;

-- ── 3. Prove it ───────────────────────────────────────────────────────────────────────────────
-- Shape and grants, then CALL what can be called without a production (supabase/AGENTS.md). A press
-- that reaches a key row needs a production, and inserting one would make this file live-path; the
-- configured suite presses through a paired key on a local stack and reopens the page
-- (e2e/configured/panel-production-page.spec.ts).
do $$
begin
  if not exists (select 1 from information_schema.columns c
                  where c.table_schema = 'public' and c.table_name = 'panel_keys' and c.column_name = 'last_press') then
    raise exception '0110 self-check failed: panel_keys has no last_press';
  end if;
  if not has_function_privilege('anon', 'public.panel_press(text,jsonb)', 'execute')
     or not has_function_privilege('anon', 'public.panel_lease(text,text,text,text,boolean)', 'execute') then
    raise exception '0110 self-check failed: anon cannot call the relay or the lease';
  end if;
  if has_table_privilege('anon', 'public.panel_keys', 'select') or has_table_privilege('authenticated', 'public.panel_keys', 'select') then
    raise exception '0110 self-check failed: panel_keys is readable by clients';
  end if;
  if public.panel_press('ncpk_selfcheck', '{"verb":"take","target":"","seen":1,"id":"selfcheck:1"}')->>'refused' is distinct from 'unknown-key' then
    raise exception '0110 self-check failed: an unknown key was not refused';
  end if;
end $$;
