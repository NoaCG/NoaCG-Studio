-- THE PANEL OWNERSHIP LEASE (docs/work-specs/panel-ownership-lease/spec.md, agreed with the owner on
-- 2026-10-08; it changes docs/work-specs/hardware-panel-control/spec.md D2 and AC-6).
--
-- WHAT CHANGES. A paired Stream Deck used to answer on whichever page last switched "Answer the
-- panel on this page" on, for as long as that claim stood: it never expired, so a crashed page held
-- it for good, and any page could take it from another. Now the claim is a LEASE:
-- - panel_lease takes it when it is free or expired, and keeps it for a page that already holds it
--   (a reload keeps its page id for the tab, so it carries on under the same claim). Held by another
--   live page, it is refused ('held'), unless the caller asks to move it ("Use here"), which numbers
--   a new claim exactly as panel_claim did, so the previous page hears `claim` and stops answering.
-- - panel_renew extends the lease of the page whose claim is still current; a page whose claim has
--   moved on hears 'lost'. A lease not renewed for LEASE_SECONDS lapses by itself: presses are then
--   refused 'no-page', hello and the list say nobody answers, and the next page may take it.
-- - panel_claim, which pages built before this still call, obeys the lease: it takes a free panel
--   (for 12 hours, since those pages do not renew) and raises 'held' rather than take a live one.
--
-- Which pages take a free lease by themselves (only the production page; the phone by "Use here") is
-- the page's decision, not this file's: any page holding the control slug may call panel_lease.
--
-- WHY IT CANNOT HURT A SHOW ON AIR. One nullable column on panel_rooms, which only these functions
-- touch, and functions nothing reads on the command path. A claim from before this, standing with no
-- expiry, is given one: 12 hours from when it was taken. Revert: drop panel_lease and panel_renew,
-- the column, and restore the four functions from 0073.
set lock_timeout = '2s';
set statement_timeout = '30s';

-- ── 1. The lease ──────────────────────────────────────────────────────────────────────────────
alter table public.panel_rooms add column if not exists lease_until timestamptz;
-- A claim taken before leases existed stands for at most 12 hours from its taking.
update public.panel_rooms r set lease_until = coalesce(r.claimed_at, now()) + interval '12 hours'
 where r.answering and r.lease_until is null;

-- Whether a room has a page answering right now: one that took it and whose lease has not lapsed.
create or replace function public.panel_room_live(p_room public.panel_rooms)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(p_room.answering, false) and (p_room.lease_until is null or p_room.lease_until > now())
$$;
revoke all on function public.panel_room_live(public.panel_rooms) from public, anon, authenticated;

-- ── 2. Take, keep or move ─────────────────────────────────────────────────────────────────────
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
  return jsonb_build_object('ok', true, 'claim', v_room.claim,
    'press_topic', 'pnp-' || v_room.press_token, 'feedback_topic', 'pfb-' || v_room.feedback_token);
end $$;

-- Keep the lease of the page whose claim is still current. One whose claim has moved on is told so.
-- A lapsed lease nobody took since is still this page's to keep: the claim did not move.
create or replace function public.panel_renew(p_slug text, p_page text, p_claim bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_room public.panel_rooms;
  v_show uuid;
begin
  v_room := public.panel_room_for_slug(p_slug);
  v_show := v_room.show_id;
  update public.panel_rooms r set lease_until = now() + interval '15 seconds'
   where r.show_id = v_show and r.answering and r.claim = p_claim and r.claim_page = p_page
   returning * into v_room;
  if not found then
    -- An UPDATE that matched nothing has emptied v_room: read the room again by its id.
    select * into v_room from public.panel_rooms r where r.show_id = v_show;
    return jsonb_build_object('ok', false, 'refused', 'lost',
      'answering', case when public.panel_room_live(v_room) then jsonb_build_object('page', v_room.claim_page,
        'where', v_room.claim_where, 'label', v_room.claim_label, 'at', v_room.claimed_at) end);
  end if;
  return jsonb_build_object('ok', true, 'claim', v_room.claim);
end $$;

-- ── 3. The calls from 0073 that read "a page answers": a lapsed lease is no page ──────────────
-- Each is its latest definition (panel_press as 0077 left it, with `trigger-cue`), changed only
-- where it reads whether a page answers.
create or replace function public.panel_claim(p_slug text, p_page text, p_where text, p_label text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_room public.panel_rooms;
  v_label text := left(btrim(coalesce(p_label, '')), 60);
begin
  if coalesce(p_page, '') !~ '^[a-z0-9]{16}$' or coalesce(p_where, '') not in ('production', 'control') then
    raise exception 'not a page' using errcode = '22023';
  end if;
  v_room := public.panel_room_for_slug(p_slug);
  select * into v_room from public.panel_rooms r where r.show_id = v_room.show_id for update;
  -- A page built before leases: it may take a free panel, never one another page holds.
  if public.panel_room_live(v_room) and v_room.claim_page is distinct from p_page then
    -- Said to a page that has no Use here yet: a reload gives it one.
    raise exception 'The panel answers on % now. Reload this page to move it here with Use here.', coalesce(nullif(v_room.claim_label, ''), 'another page')
      using errcode = '55006';
  end if;
  -- Such a page never renews, so its lease covers a show.
  update public.panel_rooms r set claim = r.claim + 1, answering = true, claim_page = p_page,
      claim_where = p_where, claim_label = v_label, claimed_at = now(), lease_until = now() + interval '12 hours'
    where r.show_id = v_room.show_id
    returning * into v_room;
  perform realtime.send(jsonb_build_object('v', 1, 'claim', v_room.claim, 'page', p_page, 'where', p_where, 'label', v_label),
    'claim', 'pnp-' || v_room.press_token, true);
  return jsonb_build_object('ok', true, 'claim', v_room.claim,
    'press_topic', 'pnp-' || v_room.press_token, 'feedback_topic', 'pfb-' || v_room.feedback_token);
end $$;

create or replace function public.panel_release(p_slug text, p_claim bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_room public.panel_rooms;
begin
  v_room := public.panel_room_for_slug(p_slug);
  update public.panel_rooms r set answering = false, lease_until = null
   where r.show_id = v_room.show_id and r.claim = p_claim and r.answering;
  if not found then return jsonb_build_object('ok', true, 'released', false); end if;
  perform realtime.send(jsonb_build_object('v', 1, 'claim', p_claim), 'released', 'pnp-' || v_room.press_token, true);
  return jsonb_build_object('ok', true, 'released', true);
end $$;

create or replace function public.panel_list(p_slug text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_room public.panel_rooms;
begin
  v_room := public.panel_room_for_slug(p_slug);
  return jsonb_build_object('ok', true,
    'press_topic', 'pnp-' || v_room.press_token,
    'feedback_topic', 'pfb-' || v_room.feedback_token,
    'claim', v_room.claim,
    'answering', case when public.panel_room_live(v_room) then jsonb_build_object('page', v_room.claim_page,
      'where', v_room.claim_where, 'label', v_room.claim_label, 'at', v_room.claimed_at) end,
    'panels', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'label', k.label,
        'created_at', k.created_at, 'last_used_at', k.last_used_at) order by k.created_at)
      from public.panel_keys k where k.show_id = v_room.show_id and k.revoked_at is null), '[]'::jsonb));
end $$;

create or replace function public.panel_hello(p_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_key public.panel_keys;
  v_room public.panel_rooms;
  v_title text;
  v_owner uuid;
  v_wants int;
  v_live boolean;
begin
  v_key := public.panel_key_row(p_key);
  if v_key.id is null then return jsonb_build_object('ok', false, 'refused', 'unknown-key'); end if;
  if v_key.revoked_at is not null then return jsonb_build_object('ok', false, 'refused', 'revoked'); end if;
  select s.title, s.owner_id into v_title, v_owner from public.control_shows s where s.id = v_key.show_id;
  -- Hosted control switched off for the account: as panel_press, no page can answer.
  if public.feature_denied_for(v_owner, 'control.hosted') then
    return jsonb_build_object('ok', false, 'refused', 'no-page');
  end if;
  insert into public.panel_rooms (show_id) values (v_key.show_id) on conflict (show_id) do nothing;
  select * into v_room from public.panel_rooms r where r.show_id = v_key.show_id;
  v_live := public.panel_room_live(v_room);
  -- The last use, and the want cap: at most five wants per key in ten seconds, so a module calling
  -- hello in a loop cannot make the page republish without end. A connect takes two.
  update public.panel_keys k set
      last_used_at = now(),
      hello_count = case when k.hello_start > now() - interval '10 seconds' then k.hello_count + 1 else 1 end,
      hello_start = case when k.hello_start > now() - interval '10 seconds' then k.hello_start else now() end
    where k.id = v_key.id
    returning k.hello_count into v_wants;
  -- The answering page republishes its state and rows for a panel that just (re)connected.
  if v_live and v_wants <= 5 then
    perform realtime.send(jsonb_build_object('v', 1, 'panel', jsonb_build_object('id', v_key.id, 'label', v_key.label)),
      'want', 'pnp-' || v_room.press_token, true);
  end if;
  return jsonb_build_object('ok', true, 'key_id', v_key.id, 'label', v_key.label, 'title', v_title,
    'feedback_topic', 'pfb-' || v_room.feedback_token, 'answering', v_live);
end $$;

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
  if v_verb is null or v_verb not in ('take', 'retake', 'update', 'next', 'out', 'select-prev', 'select-next',
       'pause', 'resume', 'pause-toggle', 'all-out', 'select-cue', 'take-cue', 'trigger-cue') then
    return jsonb_build_object('ok', false, 'refused', 'not-a-panel-verb');
  end if;
  -- The burst cap and the last use, in one write of the key's own row.
  update public.panel_keys k set
      window_count = case when k.window_start > now() - interval '2 seconds' then k.window_count + 1 else 1 end,
      window_start = case when k.window_start > now() - interval '2 seconds' then k.window_start else now() end,
      last_used_at = now()
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
  perform realtime.send(
    jsonb_build_object('v', 1, 'verb', v_verb, 'target', v_target, 'seen', v_seen, 'press_id', v_id,
      'claim', v_room.claim, 'panel', jsonb_build_object('id', v_key.id, 'label', v_key.label)),
    'press', 'pnp-' || v_room.press_token, true);
  return jsonb_build_object('ok', true, 'claim', v_room.claim);
end $$;

revoke all on function public.panel_lease(text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.panel_renew(text, text, bigint) from public, anon, authenticated;
grant execute on function public.panel_lease(text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.panel_renew(text, text, bigint) to anon, authenticated;

-- ── 4. Prove the shape ────────────────────────────────────────────────────────────────────────
-- Shape and grants only. Calling these needs a production, and inserting one would make this file a
-- live-path migration (scripts/db-push.mjs) held for a quiet window; the configured suite calls
-- every one of them against a local stack (e2e/configured/panel-lease.spec.ts).
do $$
declare
  v_fn text;
begin
  if not exists (select 1 from information_schema.columns c
                  where c.table_schema = 'public' and c.table_name = 'panel_rooms' and c.column_name = 'lease_until') then
    raise exception '0081 self-check failed: panel_rooms has no lease_until';
  end if;
  foreach v_fn in array array['panel_lease(text,text,text,text,boolean)', 'panel_renew(text,text,bigint)', 'panel_claim(text,text,text,text)',
      'panel_release(text,bigint)', 'panel_list(text)', 'panel_hello(text)', 'panel_press(text,jsonb)'] loop
    if not has_function_privilege('anon', 'public.' || v_fn, 'execute') then
      raise exception '0081 self-check failed: anon cannot call %', v_fn;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.panel_room_live(public.panel_rooms)', 'execute') then
    raise exception '0081 self-check failed: a helper is callable by clients';
  end if;
  if exists (select 1 from public.panel_rooms r where r.answering and r.lease_until is null) then
    raise exception '0081 self-check failed: a standing claim was left without a lease';
  end if;
end $$;
