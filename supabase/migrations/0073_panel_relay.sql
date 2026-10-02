-- live-path: four new panel_* tables (three keyed to control_shows by a foreign key, which locks it for an instant) and three policies on realtime.messages for the new pnp- and pfb- topics; no existing function, table, policy or topic changes
--
-- HARDWARE PANELS: PAIRING, PANEL KEYS AND THE PRESS RELAY (docs/work-specs/hardware-panel-control/
-- spec.md, decided by the owner on 2026-10-01; the wire protocol is protocol.md beside it).
--
-- WHAT THIS ADDS, and nothing it replaces:
-- - A NoaCG Companion module pairs with a production through a one-time code the operator page
--   shows (panel_pair_start, panel_pair_finish) and keeps a panel key. The key can only ask the
--   ANSWERING operator page to run a named verb (panel_press) and learn where that page publishes
--   its feedback (panel_hello). It never reaches the command log, the control slug, the show id,
--   NoaCG Bridge or AMCP: a press is relayed to the page, which runs it through its own dispatcher
--   exactly as a key press, so the page's refusals and the server's Step 2 refusals both apply.
-- - Exactly one page answers: panel_claim numbers each "Answer the panel on this page" switch, the
--   relay stamps every press with the current claim, and a page runs only its own. With no page
--   answering, a press is refused here and nothing is queued (a broadcast is never stored).
-- - The page lists and revokes keys by the control slug it already holds (panel_list,
--   panel_revoke); revoking replaces the feedback topic, so a revoked panel hears nothing more.
--
-- HOW A KEY THAT IS NOT A JWT REACHES A PRIVATE TOPIC (protocol.md §2): the topic NAME is the
-- capability. Each production has two random 128-bit tokens. Presses ride `pnp-<token>`: readable
-- by whoever knows the token (only control-slug holders are told it), and written by nothing but
-- this file's functions (realtime.send), since no INSERT policy names it. Feedback rides
-- `pfb-<token>`: the answering page broadcasts there and paired panels read it; its token is handed
-- out only against a valid key or the control slug, and replaced on every revoke.
--
-- THE BOUNDARY. The panel tables have RLS on and no policy: only these SECURITY DEFINER functions
-- touch them. A key is stored as its SHA-256; a code likewise. Bounds: 20 presses per key in 2 s,
-- 5 republish requests (`want`) per key in 10 s, 300 failed code exchanges a minute in all and 10
-- per gateway address, 5 open codes per production, labels of 60. Against guessing, the bound that
-- matters is the code space: 31^8 codes, five minutes each, at most five open per production.
--
-- WHY IT CANNOT HURT A SHOW ON AIR. New tables nobody reads yet, new functions nobody calls yet,
-- and three policies on topic shapes nothing uses yet. The foreign keys to control_shows take a
-- SHARE ROW EXCLUSIVE lock on it for an instant, and `create policy` one on realtime.messages; the
-- timeouts below make both give up rather than queue in front of a Take. Revert: drop the
-- functions, the policies and the tables; nothing else depends on them.
set lock_timeout = '500ms';
set statement_timeout = '15s';

-- ── 1. The tables ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.panel_rooms (
  show_id         uuid primary key references public.control_shows (id) on delete cascade,
  press_token     text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  feedback_token  text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  claim           bigint not null default 0,
  answering       boolean not null default false,
  claim_page      text,
  claim_where     text,
  claim_label     text,
  claimed_at      timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists public.panel_keys (
  id            uuid primary key default gen_random_uuid(),
  show_id       uuid not null references public.control_shows (id) on delete cascade,
  label         text not null,
  key_hash      bytea not null unique,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  window_start  timestamptz not null default now(),
  window_count  int not null default 0,
  hello_start   timestamptz not null default now(),
  hello_count   int not null default 0
);
create index if not exists panel_keys_show_idx on public.panel_keys (show_id);

create table if not exists public.panel_codes (
  code_hash   bytea primary key,
  show_id     uuid not null references public.control_shows (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);
create index if not exists panel_codes_show_idx on public.panel_codes (show_id);
create index if not exists panel_codes_created_idx on public.panel_codes (created_at);

create table if not exists public.panel_pair_failures (
  bucket        text primary key,
  window_start  timestamptz not null,
  failures      int not null
);

alter table public.panel_rooms enable row level security;
alter table public.panel_keys enable row level security;
alter table public.panel_codes enable row level security;
alter table public.panel_pair_failures enable row level security;
revoke all on public.panel_rooms, public.panel_keys, public.panel_codes, public.panel_pair_failures
  from public, anon, authenticated;
grant all on public.panel_rooms, public.panel_keys, public.panel_codes, public.panel_pair_failures to service_role;

-- ── 2. Helpers, callable only from the functions below ───────────────────────────────────────
-- The production behind a control slug, with its room made on first use. Raises as the control_*
-- RPCs do for an unknown slug or hosted control switched off.
create or replace function public.panel_room_for_slug(p_slug text)
returns public.panel_rooms language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
  v_owner uuid;
  v_room public.panel_rooms;
begin
  select s.id, s.owner_id into v_show, v_owner from public.control_shows s where s.slug = p_slug;
  if v_show is null then raise exception 'unknown control page'; end if;
  if public.feature_denied_for(v_owner, 'control.hosted') then
    raise exception 'hosted control is switched off for this page' using errcode = '42501';
  end if;
  insert into public.panel_rooms (show_id) values (v_show) on conflict (show_id) do nothing;
  select * into v_room from public.panel_rooms r where r.show_id = v_show;
  return v_room;
end $$;

-- A key row by the key itself; null for anything that is not a key we minted.
create or replace function public.panel_key_row(p_key text)
returns public.panel_keys language sql security definer set search_path = '' stable as $$
  select k.* from public.panel_keys k
   where coalesce(p_key, '') ~ '^ncpk_[A-Za-z0-9_-]{43}$'
     and k.key_hash = extensions.digest(p_key, 'sha256');
$$;

revoke all on function public.panel_room_for_slug(text) from public, anon, authenticated;
revoke all on function public.panel_key_row(text) from public, anon, authenticated;

-- ── 3. Pairing ────────────────────────────────────────────────────────────────────────────────
create or replace function public.panel_pair_start(p_slug text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_room public.panel_rooms;
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text := '';
  v_expires timestamptz := now() + interval '5 minutes';
begin
  v_room := public.panel_room_for_slug(p_slug);
  -- One pairing start per production at a time, so two pages pressing at once cannot both pass
  -- the five-code cap. An advisory lock, not the room row, so presses never wait on it.
  perform pg_advisory_xact_lock(hashtextextended('panel_pair_start:' || v_room.show_id::text, 0));
  delete from public.panel_codes c where c.created_at < now() - interval '1 day';
  if (select count(*) from public.panel_codes c
       where c.show_id = v_room.show_id and c.used_at is null and c.expires_at > now()) >= 5 then
    return jsonb_build_object('ok', false, 'refused', 'slow-down',
      'note', 'Five pairing codes are already waiting. Use one, or wait five minutes.');
  end if;
  -- A fresh code; one that matches a code kept from the last day (any production) is drawn again.
  loop
    v_code := '';
    v_bytes := extensions.gen_random_bytes(8);
    for i in 0..7 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 31) + 1, 1);
    end loop;
    insert into public.panel_codes (code_hash, show_id, expires_at)
      values (extensions.digest(v_code, 'sha256'), v_room.show_id, v_expires)
      on conflict (code_hash) do nothing;
    exit when found;
  end loop;
  return jsonb_build_object('ok', true, 'code', substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4),
    'expires_at', v_expires);
end $$;

create or replace function public.panel_pair_finish(p_code text, p_label text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_headers jsonb;
  v_bucket text;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  v_row public.panel_codes;
  v_refused text;
  v_owner uuid;
  v_title text;
  v_room public.panel_rooms;
  v_key text;
  v_id uuid;
  v_label text := left(btrim(coalesce(p_label, '')), 60);
begin
  -- The caller's address, as PostgREST hands the request's headers on; one shared bucket without.
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  -- The LAST x-forwarded-for entry is the one the gateway appended; the entries before it are
  -- whatever the caller chose to send, so keying on the first would let a caller pick a new bucket
  -- per request. At worst the last is a proxy many callers share, which only makes it stricter.
  -- The real bound is the code space (31^8, five minutes, five open codes a production) and the
  -- global cap `*`, which no header can move.
  v_bucket := coalesce(nullif(btrim(regexp_replace(coalesce(v_headers->>'x-forwarded-for', ''), '^.*,', '')), ''), 'shared');
  -- Both rows locked to the end of this call, so parallel guesses are counted one after another.
  insert into public.panel_pair_failures (bucket, window_start, failures)
    values (v_bucket, now(), 0), ('*', now(), 0) on conflict (bucket) do nothing;
  perform 1 from public.panel_pair_failures f where f.bucket in (v_bucket, '*') order by f.bucket for update;
  if exists (select 1 from public.panel_pair_failures f
              where f.window_start > now() - interval '1 minute'
                and ((f.bucket = v_bucket and f.failures >= 10) or (f.bucket = '*' and f.failures >= 300))) then
    return jsonb_build_object('ok', false, 'refused', 'slow-down');
  end if;

  if v_code ~ '^[A-Z0-9]{8}$' then
    select * into v_row from public.panel_codes c where c.code_hash = extensions.digest(v_code, 'sha256') for update;
  end if;
  v_refused := case
    when v_row.code_hash is null then 'unknown-code'
    when v_row.used_at is not null then 'used-code'
    when v_row.expires_at <= now() then 'expired-code'
  end;
  if v_refused is null then
    select s.owner_id, s.title into v_owner, v_title from public.control_shows s where s.id = v_row.show_id;
    if v_owner is null or public.feature_denied_for(v_owner, 'control.hosted') then v_refused := 'unknown-code'; end if;
  end if;
  if v_refused is not null then
    -- Count it in both rows (locked above): a fresh minute starts the count again.
    update public.panel_pair_failures f set
        failures = case when f.window_start > now() - interval '1 minute' then f.failures + 1 else 1 end,
        window_start = case when f.window_start > now() - interval '1 minute' then f.window_start else now() end
      where f.bucket in (v_bucket, '*');
    return jsonb_build_object('ok', false, 'refused', v_refused);
  end if;

  update public.panel_codes c set used_at = now() where c.code_hash = v_row.code_hash;
  insert into public.panel_rooms (show_id) values (v_row.show_id) on conflict (show_id) do nothing;
  select * into v_room from public.panel_rooms r where r.show_id = v_row.show_id;
  v_key := 'ncpk_' || rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  insert into public.panel_keys (show_id, label, key_hash)
    values (v_row.show_id, coalesce(nullif(v_label, ''), 'Companion'), extensions.digest(v_key, 'sha256'))
    returning id into v_id;
  return jsonb_build_object('ok', true, 'key', v_key, 'key_id', v_id,
    'label', coalesce(nullif(v_label, ''), 'Companion'), 'title', v_title,
    'feedback_topic', 'pfb-' || v_room.feedback_token);
end $$;

-- ── 4. A panel's two calls ────────────────────────────────────────────────────────────────────
create or replace function public.panel_hello(p_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_key public.panel_keys;
  v_room public.panel_rooms;
  v_title text;
  v_owner uuid;
  v_wants int;
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
  -- The last use, and the want cap: at most five wants per key in ten seconds, so a module calling
  -- hello in a loop cannot make the page republish without end. A connect takes two.
  update public.panel_keys k set
      last_used_at = now(),
      hello_count = case when k.hello_start > now() - interval '10 seconds' then k.hello_count + 1 else 1 end,
      hello_start = case when k.hello_start > now() - interval '10 seconds' then k.hello_start else now() end
    where k.id = v_key.id
    returning k.hello_count into v_wants;
  -- The answering page republishes its state and rows for a panel that just (re)connected.
  if v_room.answering and v_wants <= 5 then
    perform realtime.send(jsonb_build_object('v', 1, 'panel', jsonb_build_object('id', v_key.id, 'label', v_key.label)),
      'want', 'pnp-' || v_room.press_token, true);
  end if;
  return jsonb_build_object('ok', true, 'key_id', v_key.id, 'label', v_key.label, 'title', v_title,
    'feedback_topic', 'pfb-' || v_room.feedback_token, 'answering', v_room.answering);
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
       'pause', 'resume', 'pause-toggle', 'all-out', 'select-cue', 'take-cue') then
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

-- ── 5. The page's calls, on the control slug it already holds ────────────────────────────────
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
    'answering', case when v_room.answering then jsonb_build_object('page', v_room.claim_page,
      'where', v_room.claim_where, 'label', v_room.claim_label, 'at', v_room.claimed_at) end,
    'panels', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'label', k.label,
        'created_at', k.created_at, 'last_used_at', k.last_used_at) order by k.created_at)
      from public.panel_keys k where k.show_id = v_room.show_id and k.revoked_at is null), '[]'::jsonb));
end $$;

create or replace function public.panel_revoke(p_slug text, p_key_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_room public.panel_rooms;
  v_token text := encode(extensions.gen_random_bytes(16), 'hex');
begin
  v_room := public.panel_room_for_slug(p_slug);
  update public.panel_keys k set revoked_at = now()
   where k.id = p_key_id and k.show_id = v_room.show_id and k.revoked_at is null;
  if not found then return jsonb_build_object('ok', false, 'refused', 'unknown-key'); end if;
  update public.panel_rooms r set feedback_token = v_token where r.show_id = v_room.show_id;
  perform realtime.send(jsonb_build_object('v', 1, 'feedback_topic', 'pfb-' || v_token),
    'rotated', 'pnp-' || v_room.press_token, true);
  return jsonb_build_object('ok', true, 'feedback_topic', 'pfb-' || v_token);
end $$;

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
  update public.panel_rooms r set claim = r.claim + 1, answering = true, claim_page = p_page,
      claim_where = p_where, claim_label = v_label, claimed_at = now()
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
  update public.panel_rooms r set answering = false
   where r.show_id = v_room.show_id and r.claim = p_claim and r.answering;
  if not found then return jsonb_build_object('ok', true, 'released', false); end if;
  perform realtime.send(jsonb_build_object('v', 1, 'claim', p_claim), 'released', 'pnp-' || v_room.press_token, true);
  return jsonb_build_object('ok', true, 'released', true);
end $$;

revoke all on function public.panel_pair_start(text) from public, anon, authenticated;
revoke all on function public.panel_pair_finish(text, text) from public, anon, authenticated;
revoke all on function public.panel_hello(text) from public, anon, authenticated;
revoke all on function public.panel_press(text, jsonb) from public, anon, authenticated;
revoke all on function public.panel_list(text) from public, anon, authenticated;
revoke all on function public.panel_revoke(text, uuid) from public, anon, authenticated;
revoke all on function public.panel_claim(text, text, text, text) from public, anon, authenticated;
revoke all on function public.panel_release(text, bigint) from public, anon, authenticated;
grant execute on function public.panel_pair_start(text) to anon, authenticated;
grant execute on function public.panel_pair_finish(text, text) to anon, authenticated;
grant execute on function public.panel_hello(text) to anon, authenticated;
grant execute on function public.panel_press(text, jsonb) to anon, authenticated;
grant execute on function public.panel_list(text) to anon, authenticated;
grant execute on function public.panel_revoke(text, uuid) to anon, authenticated;
grant execute on function public.panel_claim(text, text, text, text) to anon, authenticated;
grant execute on function public.panel_release(text, bigint) to anon, authenticated;

-- ── 6. The two topics ─────────────────────────────────────────────────────────────────────────
grant select, insert on realtime.messages to anon, authenticated;

drop policy if exists "panel_press_topic_readable" on realtime.messages;
create policy "panel_press_topic_readable" on realtime.messages
  for select to anon, authenticated
  using (realtime.topic() ~ '^pnp-[0-9a-f]{32}$');

drop policy if exists "panel_feedback_topic_readable" on realtime.messages;
create policy "panel_feedback_topic_readable" on realtime.messages
  for select to anon, authenticated
  using (realtime.topic() ~ '^pfb-[0-9a-f]{32}$');

-- Broadcast only, never Presence, and only on the feedback topic.
drop policy if exists "panel_feedback_topic_broadcast" on realtime.messages;
create policy "panel_feedback_topic_broadcast" on realtime.messages
  for insert to anon, authenticated
  with check (
    realtime.topic() ~ '^pfb-[0-9a-f]{32}$'
    and realtime.messages.extension = 'broadcast'
  );

-- ── 7. Prove it, or refuse to apply ──────────────────────────────────────────────────────────
-- Shape, then one CALL of every function on a throwaway production (supabase/AGENTS.md: a
-- self-check proves shape, never behaviour).
do $$
declare
  v_fn text;
  v_writes text;
  v_owner uuid;
  v_show uuid := gen_random_uuid();
  v_slug text;
  v_a jsonb;
  v_code text;
  v_key text;
  v_key_id uuid;
  v_claim bigint;
  v_topic text;
begin
  foreach v_fn in array array['panel_pair_start(text)', 'panel_pair_finish(text,text)', 'panel_hello(text)',
      'panel_press(text,jsonb)', 'panel_list(text)', 'panel_revoke(text,uuid)', 'panel_claim(text,text,text,text)',
      'panel_release(text,bigint)'] loop
    if not has_function_privilege('anon', 'public.' || v_fn, 'execute') then
      raise exception '0073 self-check failed: anon cannot call %', v_fn;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.panel_key_row(text)', 'execute')
     or has_function_privilege('anon', 'public.panel_room_for_slug(text)', 'execute') then
    raise exception '0073 self-check failed: a helper is callable by clients';
  end if;
  if has_table_privilege('anon', 'public.panel_keys', 'select') or has_table_privilege('authenticated', 'public.panel_keys', 'select')
     or has_table_privilege('anon', 'public.panel_codes', 'select') or has_table_privilege('anon', 'public.panel_rooms', 'select') then
    raise exception '0073 self-check failed: a client can read a panel table';
  end if;
  -- Nothing a client holds may write on realtime.messages except Presence on live- and broadcasts
  -- on pfb-: an allow-list, as 0070's, so pnp- can never be written by a client.
  select string_agg(policyname, ', ') into v_writes from pg_policies
   where schemaname = 'realtime' and tablename = 'messages'
     and cmd in ('INSERT', 'ALL')
     and (roles::text[] && array['anon', 'authenticated', 'public'])
     and not (cmd = 'INSERT' and coalesce(with_check, '') ~ 'extension = ''presence''' and coalesce(with_check, '') ~ '\^live-'
              and coalesce(with_check, '') !~ '(seq|pnp)')
     and not (cmd = 'INSERT' and coalesce(with_check, '') ~ 'extension = ''broadcast''' and coalesce(with_check, '') ~ '\^pfb-'
              and coalesce(with_check, '') !~ '(seq|pnp|live|cmd|log)');
  if v_writes is not null then
    raise exception '0073 self-check failed: a client can write on realtime.messages beyond Presence on live- and broadcast on pfb- (%)', v_writes;
  end if;

  select u.id into v_owner from auth.users u where not public.feature_denied_for(u.id, 'control.hosted') limit 1;
  if v_owner is null then
    raise notice '0073 self-check skipped the calls: no account on this instance may use hosted control';
    return;
  end if;
  insert into public.control_shows (id, owner_id, title, output)
    values (v_show, v_owner, '0073 self-check', '{"v":1,"graphics":[],"cues":[]}'::jsonb)
    returning slug into v_slug;

  -- Pairing: a code, spent once.
  v_a := public.panel_pair_start(v_slug);
  v_code := v_a->>'code';
  if (v_a->>'ok')::boolean is not true or v_code !~ '^[A-Z0-9]{4}-[A-Z0-9]{4}$' then
    raise exception '0073 self-check failed: pair_start answered %', v_a;
  end if;
  v_a := public.panel_pair_finish(lower(v_code), ' Self-check deck ');
  v_key := v_a->>'key';
  v_key_id := (v_a->>'key_id')::uuid;
  if (v_a->>'ok')::boolean is not true or v_key !~ '^ncpk_[A-Za-z0-9_-]{43}$' or v_a->>'label' <> 'Self-check deck'
     or v_a->>'feedback_topic' !~ '^pfb-[0-9a-f]{32}$' then
    raise exception '0073 self-check failed: pair_finish answered %', v_a;
  end if;
  v_topic := v_a->>'feedback_topic';
  if public.panel_pair_finish(v_code, 'again')->>'refused' <> 'used-code' then
    raise exception '0073 self-check failed: a code worked twice';
  end if;
  if public.panel_pair_finish('ZZZZ-ZZZZ', 'x')->>'refused' <> 'unknown-code' then
    raise exception '0073 self-check failed: an unknown code was not refused as such';
  end if;
  if (select k.key_hash from public.panel_keys k where k.id = v_key_id) <> extensions.digest(v_key, 'sha256') then
    raise exception '0073 self-check failed: the key is not stored as its hash';
  end if;

  -- No page: hello says so, a press is refused.
  v_a := public.panel_hello(v_key);
  if (v_a->>'ok')::boolean is not true or (v_a->>'answering')::boolean or v_a->>'feedback_topic' <> v_topic then
    raise exception '0073 self-check failed: hello answered %', v_a;
  end if;
  v_a := public.panel_press(v_key, '{"verb":"take","target":"cue_a","seen":3,"id":"selfcheck:1"}');
  if v_a->>'refused' <> 'no-page' then raise exception '0073 self-check failed: a press with no page answered %', v_a; end if;

  -- A page answers: the press is relayed with its claim; malformed and foreign verbs are refused.
  v_a := public.panel_claim(v_slug, 'selfcheck0000001', 'production', 'Self-check page');
  v_claim := (v_a->>'claim')::bigint;
  if (v_a->>'ok')::boolean is not true or v_claim < 1 or v_a->>'press_topic' !~ '^pnp-[0-9a-f]{32}$' then
    raise exception '0073 self-check failed: claim answered %', v_a;
  end if;
  v_a := public.panel_press(v_key, '{"verb":"take","target":"cue_a","seen":3,"id":"selfcheck:2"}');
  if (v_a->>'ok')::boolean is not true or (v_a->>'claim')::bigint <> v_claim then
    raise exception '0073 self-check failed: a press with a page answered %', v_a;
  end if;
  if public.panel_press(v_key, '{"verb":"paste","target":"","seen":3,"id":"selfcheck:3"}')->>'refused' <> 'not-a-panel-verb'
     or public.panel_press(v_key, jsonb_build_object('verb', 'take', 'target', repeat('x', 129), 'seen', 3, 'id', 'selfcheck:4'))->>'refused' <> 'bad-press'
     or public.panel_press(v_key, jsonb_build_object('verb', 'take', 'target', 'a' || chr(7), 'seen', 3, 'id', 'selfcheck:8'))->>'refused' <> 'bad-press'
     or public.panel_press(v_key, '{"verb":"take","target":"","seen":-1,"id":"selfcheck:5"}')->>'refused' <> 'bad-press'
     or public.panel_press(v_key, '{"verb":"take","target":"","seen":1,"id":"NOT AN ID"}')->>'refused' <> 'bad-press' then
    raise exception '0073 self-check failed: a malformed press or a foreign verb was relayed';
  end if;
  if public.panel_press('ncpk_' || repeat('a', 43), '{"verb":"take","target":"","seen":1,"id":"selfcheck:6"}')->>'refused' <> 'unknown-key' then
    raise exception '0073 self-check failed: a wrong key was not refused';
  end if;
  v_a := public.panel_list(v_slug);
  if jsonb_array_length(v_a->'panels') <> 1 or v_a->'answering'->>'page' <> 'selfcheck0000001' then
    raise exception '0073 self-check failed: list answered %', v_a;
  end if;

  -- Revoke: the key is refused and the feedback topic is replaced.
  v_a := public.panel_revoke(v_slug, v_key_id);
  if (v_a->>'ok')::boolean is not true or v_a->>'feedback_topic' = v_topic then
    raise exception '0073 self-check failed: revoke answered %', v_a;
  end if;
  if public.panel_press(v_key, '{"verb":"take","target":"","seen":1,"id":"selfcheck:7"}')->>'refused' <> 'revoked'
     or public.panel_hello(v_key)->>'refused' <> 'revoked' then
    raise exception '0073 self-check failed: a revoked key still works';
  end if;
  if jsonb_array_length(public.panel_list(v_slug)->'panels') <> 0 then
    raise exception '0073 self-check failed: a revoked key is still listed';
  end if;

  -- Release: only the current claim lets go.
  if (public.panel_release(v_slug, v_claim - 1)->>'released')::boolean
     or not (public.panel_release(v_slug, v_claim)->>'released')::boolean then
    raise exception '0073 self-check failed: release did not follow the claim';
  end if;

  -- The two refused exchanges above counted in their bucket and in `*`; both lapse within a minute.
  delete from public.control_shows where id = v_show;
end $$;
