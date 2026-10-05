-- Additive direct-cue verb on the existing capability-protected panel relay.
-- Old pages refuse the new verb; all existing commands and privileges stay compatible.
set lock_timeout = '2s';
set statement_timeout = '30s';

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
  if v_room.show_id is null or not v_room.answering or public.feature_denied_for(v_owner, 'control.hosted') then
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

-- Exercise the relay against an isolated production; existing grants and key checks remain.
do $$
declare
  v_owner uuid;
  v_show uuid := gen_random_uuid();
  v_slug text;
  v_key text;
  v_code text;
  v_answer jsonb;
begin
  if not has_function_privilege('anon', 'public.panel_press(text,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.panel_key_row(text)', 'execute') then
    raise exception '0077: relay or helper privileges changed';
  end if;
  select u.id into v_owner from auth.users u where not public.feature_denied_for(u.id, 'control.hosted') limit 1;
  if v_owner is null then
    raise notice '0077: call self-check skipped; no eligible account';
    return;
  end if;
  insert into public.control_shows(id, owner_id, title, output)
    values(v_show, v_owner, '0077 self-check', '{"v":1,"graphics":[],"cues":[]}'::jsonb) returning slug into v_slug;
  v_code := public.panel_pair_start(v_slug)->>'code';
  v_key := public.panel_pair_finish(v_code, '0077 self-check')->>'key';
  perform public.panel_claim(v_slug, 'selfcheck0000001', 'production', '0077 self-check');
  v_answer := public.panel_press(v_key, '{"verb":"trigger-cue","target":"cue_a","seen":1,"id":"selfcheck:1"}');
  if (v_answer->>'ok')::boolean is not true then raise exception '0077: direct cue refused: %', v_answer; end if;
  v_answer := public.panel_press(v_key, '{"verb":"take-cue","target":"cue_a","seen":1,"id":"selfcheck:2"}');
  if (v_answer->>'ok')::boolean is not true then raise exception '0077: legacy take-cue refused: %', v_answer; end if;
  v_answer := public.panel_press(v_key, '{"verb":"paste","target":"cue_a","seen":1,"id":"selfcheck:3"}');
  if v_answer->>'refused' <> 'not-a-panel-verb' then raise exception '0077: editing verb relayed'; end if;
  delete from public.control_shows s where s.id = v_show;
end $$;
