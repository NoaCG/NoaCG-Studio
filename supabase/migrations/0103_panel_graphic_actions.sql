-- GRAPHIC ACTIONS THROUGH THE PANEL RELAY (docs/work-specs/playout-companion-actions/spec.md, phase
-- E6.1; docs/work-specs/hardware-panel-control/protocol.md §10).
--
-- WHAT CHANGES. `panel_press` takes one more verb, `graphic-action`: a declared control of one pool
-- graphic (a ⚡ control, a pick option, a ± live number), pressed from a panel through the answering
-- page's own dispatcher. Its press carries the actions protocol `v` 2, the pool graphic as `target`,
-- the capability id (`cap`), the cue the key showed live on that graphic (`instance`) and an
-- argument object (`args`), on top of the four fields every press has. They are checked here, the
-- first of two boundaries (the answering page judges again against what it advertises), and
-- forwarded as `{v: 2, verb, target, seen, press_id, claim, panel, cap, instance, args}`.
--
-- WHAT DOES NOT. Every existing verb is checked, refused, rate-limited and broadcast exactly as 0081
-- does it, `v` 1 and the same seven fields, so an older page and an older module see nothing new.
-- An older page ignores a `graphic-action` press it cannot read; a module offers one only after a
-- page advertised it. No table, policy, grant or topic changes; no `control_*` object is created,
-- altered or granted, so this is not a live-path migration.
--
-- THE BOUNDS (`panel_action_fault`, one place, also called by the self-check): `v` exactly 2; a
-- target of 1 to 128 characters with no control characters; a capability id `event:`, `step:` or
-- `foreign:` and up to 96 such characters; an instance of up to 128; `args` absent or an object of
-- at most 4096 characters of JSON whose containers nest at most 8 deep (the object itself is 1),
-- measured only after the size cap, so the walk is bounded. The same numbers are
-- src/control/panelActions.ts `ACTION_ARGS_MAX_CHARS` and `ACTION_ARGS_MAX_DEPTH`.
--
-- `panel_relay()` answers the verbs this relay takes, so a page can tell a database that has this
-- migration from one that does not and say so, instead of offering keys the relay would refuse.
--
-- Rollback: a later migration restores 0081's `panel_press` body; pages and modules then see
-- `not-a-panel-verb` for a graphic action and say so. Nothing is stored, so nothing is lost.

set lock_timeout = '2s';
set statement_timeout = '30s';

-- ── 1. The bounds of a graphic action ─────────────────────────────────────────────────────────

create or replace function public.panel_action_fault(p_press jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare
  v_args jsonb := p_press->'args';
  v_depth int;
begin
  -- Checked in steps, as panel_press does: SQL does not promise to evaluate an OR left to right.
  if jsonb_typeof(p_press->'v') is distinct from 'number' then return 'version'; end if;
  if p_press->>'v' <> '2' then return 'version'; end if;
  if coalesce(p_press->>'target', '') !~ '^[^[:cntrl:]]{1,128}$' then return 'target'; end if;
  if jsonb_typeof(p_press->'cap') is distinct from 'string' then return 'cap'; end if;
  if p_press->>'cap' !~ '^(event|step|foreign):[^[:cntrl:]]{1,96}$' then return 'cap'; end if;
  if jsonb_typeof(p_press->'instance') is distinct from 'string' then return 'instance'; end if;
  if p_press->>'instance' !~ '^[^[:cntrl:]]{0,128}$' then return 'instance'; end if;
  if v_args is null then return null; end if;
  if jsonb_typeof(v_args) <> 'object' then return 'args'; end if;
  if length(v_args::text) > 4096 then return 'args-size'; end if;
  with recursive walk(v, d) as (
    select v_args, 1
    union all
    select c.value, w.d + 1
      from walk w
      cross join lateral (
        select e.value from jsonb_each(case when jsonb_typeof(w.v) = 'object' then w.v else '{}'::jsonb end) e
        union all
        select a.value from jsonb_array_elements(case when jsonb_typeof(w.v) = 'array' then w.v else '[]'::jsonb end) a
      ) c
     where w.d <= 8 and jsonb_typeof(c.value) in ('object', 'array')
  )
  select max(walk.d) into v_depth from walk;
  if v_depth > 8 then return 'args-depth'; end if;
  return null;
end $$;

revoke all on function public.panel_action_fault(jsonb) from public, anon, authenticated;

-- ── 2. The press ──────────────────────────────────────────────────────────────────────────────

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
  if v_verb is null or v_verb not in ('take', 'retake', 'update', 'next', 'out', 'select-prev', 'select-next',
       'pause', 'resume', 'pause-toggle', 'all-out', 'select-cue', 'take-cue', 'trigger-cue', 'graphic-action') then
    return jsonb_build_object('ok', false, 'refused', 'not-a-panel-verb');
  end if;
  if v_verb = 'graphic-action' then
    v_fault := public.panel_action_fault(p_press);
    if v_fault is not null then return jsonb_build_object('ok', false, 'refused', 'bad-press', 'note', v_fault); end if;
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

-- ── 3. What this relay takes ──────────────────────────────────────────────────────────────────

create or replace function public.panel_relay()
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('ok', true, 'v', 2, 'verbs', jsonb_build_array('take', 'retake', 'update', 'next', 'out',
    'select-prev', 'select-next', 'pause', 'resume', 'pause-toggle', 'all-out', 'select-cue', 'take-cue',
    'trigger-cue', 'graphic-action'))
$$;

revoke all on function public.panel_relay() from public, anon, authenticated;
grant execute on function public.panel_relay() to anon, authenticated;

-- ── 4. Prove it ───────────────────────────────────────────────────────────────────────────────
-- Shape and grants, then CALL the bounds and the relay (supabase/AGENTS.md). A press that reaches a
-- page needs a production, and inserting one would make this file live-path; the configured suite
-- presses through a paired key on a local stack (e2e/configured/panel-graphic-actions.spec.ts).
do $$
declare
  v_ok constant jsonb := '{"v":2,"verb":"graphic-action","target":"Scorebug","seen":3,"id":"selfcheck:1","cap":"event:goal","instance":"cue_a","args":{"option":"A"}}';
  v_deep jsonb := '1'::jsonb;
  i int;
begin
  if not has_function_privilege('anon', 'public.panel_press(text,jsonb)', 'execute')
     or not has_function_privilege('anon', 'public.panel_relay()', 'execute') then
    raise exception '0103 self-check failed: anon cannot call the relay';
  end if;
  if has_function_privilege('anon', 'public.panel_action_fault(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.panel_action_fault(jsonb)', 'execute')
     or has_function_privilege('anon', 'public.panel_key_row(text)', 'execute') then
    raise exception '0103 self-check failed: a helper is callable by clients';
  end if;
  if not (public.panel_relay()->'verbs') ? 'graphic-action' then
    raise exception '0103 self-check failed: panel_relay does not name graphic-action';
  end if;
  -- Within the bounds, with no arguments at all, and at each bound exactly (`{"t": "…"}` is the
  -- string and nine characters).
  if public.panel_action_fault(v_ok) is not null or public.panel_action_fault(v_ok - 'args') is not null
     or public.panel_action_fault(jsonb_set(v_ok, '{target}', to_jsonb(repeat('x', 128)))) is not null
     or public.panel_action_fault(jsonb_set(v_ok, '{cap}', to_jsonb('event:' || repeat('x', 96)))) is not null
     or public.panel_action_fault(jsonb_set(v_ok, '{instance}', to_jsonb(repeat('x', 128)))) is not null
     or public.panel_action_fault(jsonb_set(v_ok, '{args}', jsonb_build_object('t', repeat('x', 4087)))) is not null then
    raise exception '0103 self-check failed: a valid action was faulted: %', public.panel_action_fault(v_ok);
  end if;
  -- Each bound refuses.
  if public.panel_action_fault(jsonb_set(v_ok, '{v}', '1')) is distinct from 'version'
     or public.panel_action_fault(jsonb_set(v_ok, '{v}', '"2"')) is distinct from 'version'
     or public.panel_action_fault(jsonb_set(v_ok, '{target}', '""')) is distinct from 'target'
     or public.panel_action_fault(jsonb_set(v_ok, '{target}', to_jsonb(repeat('x', 129)))) is distinct from 'target'
     or public.panel_action_fault(jsonb_set(v_ok, '{cap}', '"paste:x"')) is distinct from 'cap'
     or public.panel_action_fault(jsonb_set(v_ok, '{cap}', to_jsonb('event:' || repeat('x', 97)))) is distinct from 'cap'
     or public.panel_action_fault(jsonb_set(v_ok, '{instance}', to_jsonb(repeat('x', 129)))) is distinct from 'instance'
     or public.panel_action_fault(jsonb_set(v_ok, '{args}', '[1]')) is distinct from 'args'
     or public.panel_action_fault(jsonb_set(v_ok, '{args}', jsonb_build_object('t', repeat('x', 4088)))) is distinct from 'args-size' then
    raise exception '0103 self-check failed: a bound did not refuse';
  end if;
  -- Depth: the object and seven more levels pass, one more is refused.
  for i in 1..7 loop v_deep := jsonb_build_array(v_deep); end loop;
  if public.panel_action_fault(jsonb_set(v_ok, '{args}', jsonb_build_object('d', v_deep))) is not null then
    raise exception '0103 self-check failed: eight levels were refused';
  end if;
  if public.panel_action_fault(jsonb_set(v_ok, '{args}', jsonb_build_object('d', jsonb_build_array(v_deep)))) is distinct from 'args-depth' then
    raise exception '0103 self-check failed: nine levels were not refused';
  end if;
  -- An unknown key is refused before anything is read, for the old verbs and the new one alike.
  if public.panel_press('ncpk_selfcheck', v_ok)->>'refused' is distinct from 'unknown-key' then
    raise exception '0103 self-check failed: an unknown key was not refused';
  end if;
end $$;
