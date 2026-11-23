-- COMPANION CONNECTION HEALTH (docs/work-specs/live-production-reliability/spec.md P4;
-- docs/work-specs/hardware-panel-control/protocol.md §4 and §7.5).
--
-- WHY. The production page's green panel chip meant only that the page held the panel lease. Nothing
-- told it whether a Companion was connected: `last_used_at` moves only on hello and on a press, so a
-- Companion that stopped, or held a revoked key, looked the same as one ready to press.
--
-- WHAT CHANGES.
-- - `panel_seen(p_key, p_version, p_status)`: the module's liveness report, every 15 s and on a
--   change of status. It stamps `last_seen_at` with the module's version and status on the key's own
--   row, at most once per key in 2 s (a report inside that is answered and not written). A revoked
--   key's report is written too and answered `revoked`, so the page can say a Companion still holds a
--   refused key; an unknown key is answered `unknown-key` and writes nothing.
-- - `panel_list` also answers, per listed panel, `last_seen_at`, `seen_s` (seconds since, by the
--   database's clock, so a page with a wrong clock still reads it right), `module_version` and
--   `module_status`; and `refused_s`, the seconds since a revoked key of this production last
--   reported after it was revoked, or null.
--
-- WHAT DOES NOT. Hello, press, pairing, the lease and the topics are exactly as 0081, 0103 and 0110
-- left them. A module built before this never calls `panel_seen` and keeps working; its panel lists
-- with `last_seen_at` null. A page built before this ignores the new fields. Three nullable columns
-- on `panel_keys`, which only the panel functions touch. No policy or topic changes, and no
-- `control_*` object is created, altered or granted, so this is not a live-path migration.
--
-- Rollback: a later migration restores 0081's `panel_list` and drops `panel_seen`; the columns can stay.

set lock_timeout = '2s';
set statement_timeout = '30s';

alter table public.panel_keys add column if not exists last_seen_at timestamptz;
alter table public.panel_keys add column if not exists module_version text;
alter table public.panel_keys add column if not exists module_status text;

-- ── 1. The liveness report ─────────────────────────────────────────────────────────────────────
create or replace function public.panel_seen(p_key text, p_version text, p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_key public.panel_keys;
  -- Only what the module could have sent is stored: anything else is kept as unknown.
  v_version text := case when coalesce(p_version, '') ~ '^[0-9A-Za-z.+-]{1,32}$' then p_version end;
  v_status text := case when p_status in ('pairing', 'connecting', 'ok', 'no-page', 'revoked', 'offline', 'outdated')
    then p_status end;
begin
  v_key := public.panel_key_row(p_key);
  if v_key.id is null then return jsonb_build_object('ok', false, 'refused', 'unknown-key'); end if;
  update public.panel_keys k set last_seen_at = now(), module_version = v_version, module_status = v_status
   where k.id = v_key.id and (k.last_seen_at is null or k.last_seen_at <= now() - interval '2 seconds');
  if v_key.revoked_at is not null then return jsonb_build_object('ok', false, 'refused', 'revoked'); end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.panel_seen(text, text, text) from public, anon, authenticated;
grant execute on function public.panel_seen(text, text, text) to anon, authenticated;

-- ── 2. The list says when each panel was last seen ───────────────────────────────────────────
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
        'created_at', k.created_at, 'last_used_at', k.last_used_at,
        'last_seen_at', k.last_seen_at,
        'seen_s', floor(extract(epoch from now() - k.last_seen_at))::bigint,
        'module_version', k.module_version, 'module_status', k.module_status) order by k.created_at)
      from public.panel_keys k where k.show_id = v_room.show_id and k.revoked_at is null), '[]'::jsonb),
    'refused_s', (select floor(extract(epoch from now() - max(k.last_seen_at)))::bigint
      from public.panel_keys k
     where k.show_id = v_room.show_id and k.revoked_at is not null and k.last_seen_at > k.revoked_at));
end $$;

-- ── 3. Prove it, or refuse to apply ──────────────────────────────────────────────────────────
-- Shape and grants, then one CALL of each function on a throwaway account, production and keys,
-- inside a block that always rolls back (as 0110 does): nothing it writes survives and no real row
-- is read or written. Nothing here broadcasts.
do $$
declare
  v_user uuid := gen_random_uuid();
  v_show uuid := gen_random_uuid();
  v_live text := 'ncpk_' || left(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 43);
  v_gone text := 'ncpk_' || left(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 43);
  v_old text := 'ncpk_' || left(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 43);
  v_slug text;
  v_got jsonb;
  v_row public.panel_keys;
begin
  if not exists (select 1 from information_schema.columns c
                  where c.table_schema = 'public' and c.table_name = 'panel_keys' and c.column_name = 'last_seen_at') then
    raise exception '0128 self-check failed: panel_keys has no last_seen_at';
  end if;
  if not has_function_privilege('anon', 'public.panel_seen(text,text,text)', 'execute')
     or not has_function_privilege('anon', 'public.panel_list(text)', 'execute') then
    raise exception '0128 self-check failed: anon cannot report or list';
  end if;
  if has_table_privilege('anon', 'public.panel_keys', 'select') or has_table_privilege('authenticated', 'public.panel_keys', 'select') then
    raise exception '0128 self-check failed: panel_keys is readable by clients';
  end if;
  if public.panel_seen('ncpk_selfcheck', '0.4.0', 'ok')->>'refused' is distinct from 'unknown-key' then
    raise exception '0128 self-check failed: an unknown key was not refused';
  end if;

  begin
    begin
      insert into auth.users (id, instance_id, aud, role, email)
      values (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '0128-self-check@noacg.invalid');
    exception when others then
      raise notice '0128 self-check: no throwaway account could be made (%), skipping the behavioural half', sqlerrm;
      return;
    end;
    insert into public.control_shows (id, owner_id, title) values (v_show, v_user, '0128 self-check')
      returning slug into v_slug;
    if public.feature_denied_for(v_user, 'control.hosted') then
      raise notice '0128 self-check: hosted control is switched off on this instance, skipping the behavioural half';
      raise exception '0128 self-check passed';
    end if;
    insert into public.panel_keys (show_id, label, key_hash, created_at, last_used_at) values
      (v_show, 'live', extensions.digest(v_live, 'sha256'), now() - interval '3 minutes', null),
      (v_show, 'gone', extensions.digest(v_gone, 'sha256'), now() - interval '2 minutes', null),
      (v_show, 'old', extensions.digest(v_old, 'sha256'), now() - interval '1 minute', now() - interval '1 minute');

    -- A report stamps the key with its version and status; one that is not a version or a status
    -- the module has is stored as unknown, never as sent.
    v_got := public.panel_seen(v_live, '0.4.0', 'ok');
    select * into v_row from public.panel_keys k where k.show_id = v_show and k.label = 'live';
    if (v_got->>'ok')::boolean is not true or v_row.last_seen_at is distinct from now()
       or v_row.module_version is distinct from '0.4.0' or v_row.module_status is distinct from 'ok' then
      raise exception '0128 self-check failed: a report answered % and left %', v_got, to_jsonb(v_row);
    end if;
    -- A second report inside 2 s is answered and not written (now() is this transaction's start).
    v_got := public.panel_seen(v_live, '<script>', 'nonsense');
    select * into v_row from public.panel_keys k where k.show_id = v_show and k.label = 'live';
    if (v_got->>'ok')::boolean is not true or v_row.module_version is distinct from '0.4.0' then
      raise exception '0128 self-check failed: a report inside 2 s was written: %', to_jsonb(v_row);
    end if;
    update public.panel_keys k set last_seen_at = now() - interval '1 minute' where k.id = v_row.id;
    perform public.panel_seen(v_live, '<script>', 'nonsense');
    select * into v_row from public.panel_keys k where k.show_id = v_show and k.label = 'live';
    if v_row.module_version is not null or v_row.module_status is not null or v_row.last_seen_at is distinct from now() then
      raise exception '0128 self-check failed: a malformed report was stored as sent: %', to_jsonb(v_row);
    end if;
    -- Seen 40 s ago, as the list reads it below.
    update public.panel_keys k set last_seen_at = now() - interval '40 seconds', module_version = '0.4.0', module_status = 'ok'
     where k.id = v_row.id;

    -- A revoked key's report is written and refused; the list counts it as refused only when it
    -- came after the revoke.
    update public.panel_keys k set revoked_at = now() - interval '1 minute', last_seen_at = now() - interval '90 seconds'
     where k.show_id = v_show and k.label = 'gone';
    v_got := public.panel_list(v_slug);
    if v_got->'refused_s' <> 'null'::jsonb then
      raise exception '0128 self-check failed: a key seen only before its revoke counted as refused: %', v_got;
    end if;
    v_got := public.panel_seen(v_gone, '0.4.0', 'revoked');
    if v_got->>'refused' is distinct from 'revoked' then
      raise exception '0128 self-check failed: a revoked key''s report answered %', v_got;
    end if;

    -- The list: each live panel with when it was last seen, and the refused key apart.
    v_got := public.panel_list(v_slug);
    if (v_got->>'ok')::boolean is not true or jsonb_array_length(v_got->'panels') <> 2
       or (v_got->>'refused_s')::bigint <> 0
       or (v_got->'panels'->0->>'seen_s')::bigint <> 40
       or v_got->'panels'->0->>'module_version' <> '0.4.0'
       or v_got->'panels'->0->>'module_status' <> 'ok'
       or v_got->'panels'->0->>'last_seen_at' is null
       -- A module from before the report: used, never seen.
       or v_got->'panels'->1->'seen_s' <> 'null'::jsonb
       or v_got->'panels'->1->>'last_used_at' is null then
      raise exception '0128 self-check failed: the list answered %', v_got;
    end if;
    raise exception '0128 self-check passed';
  exception when others then
    if sqlerrm <> '0128 self-check passed' then raise; end if;
  end;
end $$;
