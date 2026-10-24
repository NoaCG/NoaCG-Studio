-- live-path: a new table production_source_snapshots (a foreign key to control_shows) and three new control_* functions for /api/data/source, service role only; no existing table, column, function or grant changes
--
-- A TRUSTED JSON SOURCE THROUGH THE EXISTING APPLY PATH (docs/work-specs/playout-external-connectors/
-- spec.md, phase E4.2: "Registration and epoch are C2's lease", "Ingress limits", "Storage, version
-- gate and rollback"; docs/DATA_API.md "/api/data/source").
--
-- A connector source is REGISTERED by the ordinary `Show.sources` write C2 persists to
-- `control_shows.sources`: an entry `{id, kind: "external", label, config: {v: 1, configRevision,
-- endpoint, lists?}, paused?}`. Its agent holds the production's data key and reaches these
-- functions only through the server route (service role):
--
-- - `control_source_claim_by_key` CLAIMS the source through C2's own lease,
--   `control_source_lease` (0097), under the reader name `agent`, and answers the owner epoch, the
--   accepted revision and the provider sequence it must continue from. The epoch is this table's
--   counter, raised every time the lease hands out a new claim, so an agent cannot mint its own and
--   a restarted agent always has a newer one. ttl 0 with the claim lets go.
-- - `control_source_report_by_key` takes one report under the claim, FENCED in one transaction:
--   the claim must hold the live lease, the epoch must be the current one, the registration must be
--   v 1 with the same config revision and no local destination (a `mode` or `caFile` in the
--   production's record is refused: a local destination trusts whoever wrote its config, so only the
--   agent's own file may name one), and a changed payload must carry a revision above the accepted
--   one (and a provider sequence not below it). Then the ingress limits: one accepted revision per
--   source per 5 s, at most 256 KiB of payload, every update row it would append at most 64 KiB, and
--   no more rows than the per-production ingest budget has left (25 api rows in any 5 s, shared
--   with /patch and /update). Every refusal answers {ok: false, refused} before anything is written.
--   An accepted revision goes through `control_data_apply` labelled 'api', the one apply path
--   every API write takes, so the Pause of Another system (0100) holds it in `data_pending` and
--   Resume applies the final diff once. The source's own Pause (its entry's `paused`) refuses
--   application: the agent keeps the latest revision and offers it again. A path is written only
--   when its text differs from what this source last wrote (the read state's snapshot, as for a
--   Sheet), so an operator's override holds until the source's value changes; a path the
--   production does not bind, or that 0088's rules would refuse, is left out and keeps its snapshot.
--   An unchanged report moves `checked_at`, never `changed_at`, at most every 15 s. A held or failed
--   read records its status only.
-- - `control_source_context_by_key` answers what the route needs to evaluate a payload
--   (src/control/sourceMapping.ts): the registration, the bindings and each graphic's published
--   fields. Never the payload's own values: those go back only through the fenced report.
--
-- `production_source_snapshots` holds, per source, the latest accepted revision and its typed
-- payload, the owner epoch and claim, checked-at, changed-at, byte size and the last status. It is
-- not a second live-data store: values on air are the tree's (`control_shows.data`). Rows carry
-- `v` 1; a reader meeting a higher `v` holds the source read-only (applies nothing).
--
-- Additive: one new table and three new functions, all service role only. No existing function,
-- column or grant changes, so every older caller and build behaves as before. Rollback: pause the
-- source or switch its agent off; snapshots and last values stay. There is no destructive down-
-- migration; a revert of the app leaves this table read by nothing.

set lock_timeout = '2s';
set statement_timeout = '30s';

-- ── 1. The snapshot ────────────────────────────────────────────────────────────────────────────
create table if not exists public.production_source_snapshots (
  show_id           uuid not null references public.control_shows (id) on delete cascade,
  source_id         text not null,
  v                 smallint not null default 1,
  config_revision   integer,
  owner_epoch       bigint not null default 0,
  owner_claim       text,
  accepted_revision bigint not null default 0,
  provider_sequence double precision,
  checked_at        timestamptz,
  changed_at        timestamptz,
  status_at         timestamptz,
  byte_size         integer not null default 0,
  payload           jsonb,
  status            jsonb not null default '{}'::jsonb,
  primary key (show_id, source_id)
);
alter table public.production_source_snapshots enable row level security;   -- no policy: functions only
revoke all on table public.production_source_snapshots from public, anon, authenticated;
grant select, insert, update, delete on table public.production_source_snapshots to service_role;

-- ── 2. The registration, as the fence reads it ─────────────────────────────────────────────────
-- Null when the entry may be claimed with this config revision, else the refusal's code. The same
-- rules as src/control/externalSource.ts `readExternalRegistration`; this one refuses.
create or replace function public.control_source_registration_refusal(p_entry jsonb, p_config_revision integer)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_entry is null or p_entry->>'kind' is distinct from 'external' then 'gone'
    when jsonb_typeof(p_entry->'config') is distinct from 'object' then 'unsupported'
    when (p_entry->'config'->'v') is distinct from '1'::jsonb then 'unsupported'
    -- One path segment: `external.e1.` must never also be the start of another source's paths.
    when coalesce(p_entry->>'id', '') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then 'registration'
    when (p_entry->'config') ? 'mode' or (p_entry->'config') ? 'caFile' then 'local_refused'
    when jsonb_typeof(p_entry->'config'->'endpoint') is distinct from 'string'
         or (p_entry->'config' ? 'lists' and (jsonb_typeof(p_entry->'config'->'lists') is distinct from 'object'
             or exists (select 1 from jsonb_each(p_entry->'config'->'lists') l
                         where l.key !~ '^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$'
                            or l.value not in ('"lines"'::jsonb, '"schedule"'::jsonb, '"credits"'::jsonb)))) then 'registration'
    when jsonb_typeof(p_entry->'config'->'configRevision') is distinct from 'number'
         or (p_entry->'config'->'configRevision') is distinct from to_jsonb(p_config_revision) then 'config'
    else null
  end;
$$;
revoke execute on function public.control_source_registration_refusal(jsonb, integer) from public, anon, authenticated;
grant execute on function public.control_source_registration_refusal(jsonb, integer) to service_role;

-- ── 3. What the route evaluates a payload against ──────────────────────────────────────────────
create or replace function public.control_source_context_by_key(p_key text, p_source text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_row public.control_shows%rowtype;
  v_entry jsonb;
begin
  select * into v_row from public.control_shows s where s.data_key = p_key and p_key is not null;
  if v_row.id is null then return null; end if;
  select e.value into v_entry
    from jsonb_array_elements(case jsonb_typeof(v_row.sources) when 'array' then v_row.sources else '[]'::jsonb end) e
   where e.value->>'id' = p_source and p_source is not null
   limit 1;
  return jsonb_build_object(
    'entry', v_entry,
    'bindings', coalesce(v_row.bindings, '{}'::jsonb),
    'fields', (select coalesce(jsonb_object_agg(g.value->>'name', coalesce(g.value->'fields', '[]'::jsonb)), '{}'::jsonb)
                 from jsonb_array_elements(case jsonb_typeof(v_row.panel) when 'array' then v_row.panel else '[]'::jsonb end) g
                where g.value->>'name' is not null));
end $$;
revoke execute on function public.control_source_context_by_key(text, text) from public, anon, authenticated;
grant execute on function public.control_source_context_by_key(text, text) to service_role;

-- ── 4. The claim, through C2's lease ───────────────────────────────────────────────────────────
-- Answers {ok: true, claim, ownerEpoch, acceptedRevision, providerSequence, paused}, or
-- {ok: false, held: true, owner} while another claim holds the lease, or {ok: false, refused}.
-- ttl 0 with the claim lets go ({ok: false, released: true}).
create or replace function public.control_source_claim_by_key(p_key text, p_source text, p_config_revision integer,
                                                             p_claim text, p_ttl_ms integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_show uuid;
  v_slug text;
  v_owner uuid;
  v_entry jsonb;
  v_refusal text;
  v_lease jsonb;
  v_snap public.production_source_snapshots%rowtype;
begin
  select s.id, s.slug, s.owner_id into v_show, v_slug, v_owner
    from public.control_shows s where s.data_key = p_key and p_key is not null;
  if v_show is null then raise exception 'unknown data key'; end if;
  if public.feature_denied_for(v_owner, 'control.hosted') then
    raise exception 'hosted control is switched off for this page' using errcode = '42501';
  end if;
  if coalesce(p_ttl_ms, 0) > 0 then
    select e.value into v_entry
      from public.control_shows s
      cross join lateral jsonb_array_elements(case jsonb_typeof(s.sources) when 'array' then s.sources else '[]'::jsonb end) e
     where s.id = v_show and e.value->>'id' = p_source and p_source is not null
     limit 1;
    v_refusal := public.control_source_registration_refusal(v_entry, p_config_revision);
    if v_refusal is not null then return jsonb_build_object('ok', false, 'refused', v_refusal); end if;
    select * into v_snap from public.production_source_snapshots p where p.show_id = v_show and p.source_id = p_source;
    if v_snap.v > 1 then return jsonb_build_object('ok', false, 'refused', 'unsupported'); end if;
  end if;

  v_lease := public.control_source_lease(v_slug, p_source, 'agent', p_claim, p_ttl_ms);
  if (v_lease->>'ok')::boolean is not true then
    if (v_lease->>'released')::boolean then return jsonb_build_object('ok', false, 'released', true); end if;
    if (v_lease->>'gone')::boolean then return jsonb_build_object('ok', false, 'refused', 'gone'); end if;
    return jsonb_build_object('ok', false, 'held', true, 'owner', v_lease->'owner');
  end if;

  insert into public.production_source_snapshots (show_id, source_id) values (v_show, p_source)
    on conflict (show_id, source_id) do nothing;
  select * into v_snap from public.production_source_snapshots p
   where p.show_id = v_show and p.source_id = p_source for update;
  if (v_lease->>'handed')::boolean or v_snap.owner_claim is distinct from v_lease->>'claim' then
    update public.production_source_snapshots p
       set owner_epoch = p.owner_epoch + 1, owner_claim = v_lease->>'claim', config_revision = p_config_revision
     where p.show_id = v_show and p.source_id = p_source
     returning * into v_snap;
  end if;
  return jsonb_build_object('ok', true, 'claim', v_lease->>'claim', 'ownerEpoch', v_snap.owner_epoch,
                            'acceptedRevision', v_snap.accepted_revision, 'providerSequence', v_snap.provider_sequence,
                            'paused', coalesce((v_lease->>'paused')::boolean, false));
end $$;
revoke execute on function public.control_source_claim_by_key(text, text, integer, text, integer) from public, anon, authenticated;
grant execute on function public.control_source_claim_by_key(text, text, integer, text, integer) to service_role;

-- ── 5. One report, fenced ──────────────────────────────────────────────────────────────────────
-- p_report: {claim, ownerEpoch, configRevision, acceptedRevision, providerSequence?, status,
-- providerEventTime?, error?, payload?}. p_writes: bound path -> the text the evaluator made of the
-- payload (changed only). Answers {ok: true, ...} or {ok: false, refused, ...}; the only raise is the
-- apply's own (the command log's 50-in-5-s cap), which rolls back everything.
create or replace function public.control_source_report_by_key(p_key text, p_source text, p_report jsonb, p_writes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c_lease_ms constant integer := 30000;
  c_revision_gap constant interval := interval '5 seconds';
  c_receipt_gap constant interval := interval '15 seconds';
  c_payload_bytes constant integer := 262144;
  c_row_bytes constant integer := 65536;
  c_budget constant integer := 25;
  v_show uuid;
  v_owner uuid;
  v_read public.control_source_reads%rowtype;
  v_snap public.production_source_snapshots%rowtype;
  v_entry jsonb;
  v_bindings jsonb;
  v_data jsonb;
  v_paused boolean;
  v_pending_tree jsonb;
  v_held jsonb;
  v_refusal text;
  v_status text := p_report->>'status';
  v_revision bigint;
  v_sequence double precision;
  v_bytes integer;
  v_bound text[];
  v_path text;
  v_value jsonb;
  v_one jsonb;
  v_seg text[];
  v_i int;
  v_fits boolean;
  v_patch jsonb := '{}'::jsonb;
  v_skipped text[] := '{}';
  v_snapshot jsonb;
  v_changes jsonb;
  v_graphic text;
  v_changed jsonb;
  v_rows int;
  v_ingest int;
  v_result jsonb;
  v_state jsonb;
begin
  if p_report is null or jsonb_typeof(p_report) <> 'object' or p_writes is null or jsonb_typeof(p_writes) <> 'object'
     or jsonb_typeof(p_report->'ownerEpoch') is distinct from 'number'
     or jsonb_typeof(p_report->'configRevision') is distinct from 'number'
     or jsonb_typeof(p_report->'acceptedRevision') is distinct from 'number'
     or v_status is null or v_status not in ('changed', 'unchanged', 'stale', 'invalid', 'denied', 'refused', 'failed') then
    raise exception 'not a source report';
  end if;
  v_revision := (p_report->>'acceptedRevision')::bigint;
  v_sequence := case jsonb_typeof(p_report->'providerSequence') when 'number' then (p_report->>'providerSequence')::double precision end;

  select s.id, s.owner_id into v_show, v_owner from public.control_shows s where s.data_key = p_key and p_key is not null;
  if v_show is null then raise exception 'unknown data key'; end if;
  if public.feature_denied_for(v_owner, 'control.hosted') then
    raise exception 'hosted control is switched off for this page' using errcode = '42501';
  end if;

  -- The lease first, then the production, then the snapshot: 0097's order, so no deadlock with a
  -- browser reader's or the tick's write.
  select * into v_read from public.control_source_reads r where r.show_id = v_show and r.source_id = p_source for update;
  if v_read.claim is null or v_read.claim is distinct from p_report->>'claim' or v_read.lease_until <= now() then
    return jsonb_build_object('ok', false, 'refused', 'moved');
  end if;
  select s.bindings, coalesce(s.data, '{}'::jsonb), s.data_paused, s.data_pending, coalesce(s.data_held, '{}'::jsonb),
         (select e.value from jsonb_array_elements(case jsonb_typeof(s.sources) when 'array' then s.sources else '[]'::jsonb end) e
           where e.value->>'id' = p_source limit 1)
    into v_bindings, v_data, v_paused, v_pending_tree, v_held, v_entry
    from public.control_shows s where s.id = v_show for no key update;
  v_refusal := public.control_source_registration_refusal(v_entry, (p_report->>'configRevision')::integer);
  if v_refusal is not null then
    -- Disconnected or changed under the claim: the fence goes too, so a reconnect needs a new one.
    update public.control_source_reads r set lease_until = now(), updated_at = now()
     where r.show_id = v_show and r.source_id = p_source;
    return jsonb_build_object('ok', false, 'refused', v_refusal);
  end if;
  select * into v_snap from public.production_source_snapshots p where p.show_id = v_show and p.source_id = p_source for update;
  if v_snap.show_id is null or v_snap.owner_claim is distinct from p_report->>'claim'
     or v_snap.owner_epoch is distinct from (p_report->>'ownerEpoch')::bigint then
    return jsonb_build_object('ok', false, 'refused', 'epoch', 'ownerEpoch', v_snap.owner_epoch);
  end if;
  if v_snap.v > 1 then return jsonb_build_object('ok', false, 'refused', 'unsupported'); end if;

  -- The owner is current: its report renews the lease.
  update public.control_source_reads r set lease_until = now() + make_interval(secs => c_lease_ms / 1000.0), updated_at = now()
   where r.show_id = v_show and r.source_id = p_source;

  v_state := jsonb_strip_nulls(jsonb_build_object('state', v_status, 'checkedAt', p_report->'checkedAt',
                                                  'providerEventTime', p_report->'providerEventTime', 'error', p_report->'error'));

  -- An unchanged read with a newer provider sequence keeps it (a change outside the sent paths still
  -- moves the provider's revision), so a later claim never continues from an older one.
  if v_status = 'unchanged' and v_sequence is not null
     and (v_snap.provider_sequence is null or v_sequence > v_snap.provider_sequence) then
    update public.production_source_snapshots p set provider_sequence = v_sequence
     where p.show_id = v_show and p.source_id = p_source;
  end if;

  if v_status = 'unchanged' then
    if v_snap.checked_at is not null and v_snap.checked_at > now() - c_receipt_gap then
      return jsonb_build_object('ok', true, 'ignored', true, 'acceptedRevision', v_snap.accepted_revision);
    end if;
    update public.production_source_snapshots p
       set checked_at = now(), status = v_state, status_at = now()
     where p.show_id = v_show and p.source_id = p_source;
    return jsonb_build_object('ok', true, 'acceptedRevision', v_snap.accepted_revision);
  end if;

  if v_status <> 'changed' then
    -- A hold or a failure: the status only, when it is news or every 15 s.
    if v_snap.status->>'state' is distinct from v_status or v_snap.status_at is null or v_snap.status_at <= now() - c_receipt_gap then
      update public.production_source_snapshots p set status = v_state, status_at = now()
       where p.show_id = v_show and p.source_id = p_source;
    end if;
    return jsonb_build_object('ok', true, 'acceptedRevision', v_snap.accepted_revision);
  end if;

  -- A changed payload: the fence, then the limits, all before anything moves.
  if v_revision <= v_snap.accepted_revision
     or (v_sequence is not null and v_snap.provider_sequence is not null and v_sequence < v_snap.provider_sequence) then
    return jsonb_build_object('ok', false, 'refused', 'old_revision', 'acceptedRevision', v_snap.accepted_revision);
  end if;
  if coalesce((v_entry->>'paused')::boolean, false) then
    return jsonb_build_object('ok', false, 'refused', 'paused');
  end if;
  if v_snap.changed_at is not null and v_snap.changed_at > now() - c_revision_gap then
    return jsonb_build_object('ok', false, 'refused', 'too_soon',
                              'retryMs', ceil(extract(epoch from (v_snap.changed_at + c_revision_gap - now())) * 1000));
  end if;
  if p_report->'payload' is null then raise exception 'not a source report'; end if;
  v_bytes := octet_length((p_report->'payload')::text);
  if v_bytes > c_payload_bytes then
    return jsonb_build_object('ok', false, 'refused', 'too_large');
  end if;

  select coalesce(array_agg(distinct f.value), '{}') into v_bound
  from jsonb_each(coalesce(v_bindings, '{}'::jsonb)) g
  cross join lateral jsonb_each_text(case when jsonb_typeof(g.value) = 'object' then g.value else '{}'::jsonb end) f;

  v_snapshot := coalesce(v_read.snapshot, '{}'::jsonb);
  for v_path, v_value in select w.key, w.value from jsonb_each(p_writes) w loop
    if jsonb_typeof(v_value) <> 'string' or not starts_with(v_path, 'external.' || p_source || '.') then
      raise exception 'not a source report';
    end if;
    -- What this source last wrote here: no write, so an operator's override holds.
    if v_snapshot->v_path = v_value then continue; end if;
    v_seg := string_to_array(v_path, '.');
    v_fits := v_path = any(v_bound) and public.production_data_may_replace(v_data #> v_seg, v_value);
    for v_i in 1 .. coalesce(array_length(v_seg, 1), 1) - 1 loop
      v_fits := v_fits and coalesce(jsonb_typeof(v_data #> v_seg[1:v_i]), 'null') in ('object', 'null');
    end loop;
    if not v_fits then
      v_skipped := v_skipped || v_path;
      continue;
    end if;
    v_one := v_value;
    for v_i in reverse coalesce(array_length(v_seg, 1), 0) .. 1 loop
      v_one := jsonb_build_object(v_seg[v_i], v_one);
    end loop;
    v_patch := public.jsonb_merge_patch(v_patch, v_one);
    v_snapshot := jsonb_set(v_snapshot, array[v_path], v_value);
  end loop;

  -- The rows it would append. While Another system is paused, none now: Resume sends one row per
  -- graphic with everything held since the Pause, so that row, this revision included, is what
  -- must fit (0100's Resume: the pending tree's diff against air, the held /update values over it).
  if v_paused then
    -- The apply drops every held /update field this patch names (0100), so those are not in the row.
    v_held := public.production_data_held_without(v_held, public.production_data_addressed(v_patch, v_bindings));
    v_changes := public.production_data_changes(public.jsonb_merge_patch(coalesce(v_pending_tree, v_data), v_patch), v_data, v_bindings);
    select coalesce(jsonb_object_agg(k.graphic, coalesce(v_changes->k.graphic, '{}'::jsonb) || coalesce(v_held->k.graphic, '{}'::jsonb)), '{}'::jsonb)
      into v_changes
      from (select jsonb_object_keys(v_changes) as graphic) k;
  else
    v_changes := public.production_data_changes(public.jsonb_merge_patch(v_data, v_patch), v_data, v_bindings);
  end if;
  select count(*) into v_rows from jsonb_object_keys(v_changes);
  for v_graphic, v_changed in select key, value from jsonb_each(v_changes) loop
    if octet_length(jsonb_build_object('t', 'update', 'data', v_changed, 'src', 'api')::text) > c_row_bytes then
      return jsonb_build_object('ok', false, 'refused', 'row_too_large', 'graphic', v_graphic);
    end if;
  end loop;
  if not v_paused and v_rows > 0 then
    select count(*) into v_ingest from public.control_events e
     where e.show_id = v_show and e.created_at > now() - interval '5 seconds' and e.msg->>'src' = 'api';
    if v_ingest + v_rows > c_budget then
      return jsonb_build_object('ok', false, 'refused', 'budget', 'rows', v_rows, 'left', greatest(c_budget - v_ingest, 0));
    end if;
  end if;

  if v_patch <> '{}'::jsonb then
    v_result := public.control_data_apply(v_show, v_patch, 'api');
  end if;
  update public.control_source_reads r set snapshot = v_snapshot, status = v_state, updated_at = now()
   where r.show_id = v_show and r.source_id = p_source;
  update public.production_source_snapshots p
     set accepted_revision = v_revision, provider_sequence = coalesce(v_sequence, p.provider_sequence),
         config_revision = (p_report->>'configRevision')::integer,
         checked_at = now(), changed_at = now(), status = v_state, status_at = now(),
         byte_size = v_bytes, payload = p_report->'payload'
   where p.show_id = v_show and p.source_id = p_source;
  return jsonb_build_object('ok', true, 'acceptedRevision', v_revision,
                            'writes', coalesce(jsonb_array_length(v_result->'writes'), 0),
                            'paused', coalesce((v_result->>'paused')::boolean, false),
                            'skipped', to_jsonb(v_skipped));
end $$;
revoke execute on function public.control_source_report_by_key(text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.control_source_report_by_key(text, text, jsonb, jsonb) to service_role;

-- ── 6. Self-check ──────────────────────────────────────────────────────────────────────────────
-- supabase/AGENTS.md: shape, then CALL the thing, in a block that is always rolled back. `now()` is
-- fixed inside one transaction, so the 5 s and 15 s gaps are moved by writing the times back.
do $$
declare
  v_user uuid := gen_random_uuid();
  v_show uuid := '00000000-0101-4000-8000-000000000101';
  v_key text;
  v_slug text;
  v_c jsonb;
  v_c2 jsonb;
  v_a jsonb;
  v_n int;
  v_report jsonb;
  v_pad int;
begin
  -- (a) Shape: nothing here is reachable from a client.
  if exists (select 1 from information_schema.role_table_grants g
              where g.table_schema = 'public' and g.table_name = 'production_source_snapshots'
                and g.grantee in ('anon', 'authenticated', 'PUBLIC')) then
    raise exception '0101 self-check failed: a client role holds a privilege on production_source_snapshots';
  end if;
  if has_function_privilege('anon', 'public.control_source_claim_by_key(text,text,integer,text,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.control_source_claim_by_key(text,text,integer,text,integer)', 'execute')
     or has_function_privilege('anon', 'public.control_source_report_by_key(text,text,jsonb,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.control_source_report_by_key(text,text,jsonb,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.control_source_context_by_key(text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.control_source_context_by_key(text,text)', 'execute')
     or has_function_privilege('anon', 'public.control_source_registration_refusal(jsonb,integer)', 'execute')
     or not has_function_privilege('service_role', 'public.control_source_report_by_key(text,text,jsonb,jsonb)', 'execute') then
    raise exception '0101 self-check failed: a source function has the wrong grants';
  end if;

  -- (b) Behaviour, always rolled back.
  begin
    begin
      insert into auth.users (id, instance_id, aud, role, email)
      values (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '0101-self-check@noacg.invalid');
    exception when others then
      raise notice '0101 self-check: no throwaway account could be made (%), skipping the behavioural half', sqlerrm;
      return;
    end;
    if public.feature_denied_for(v_user, 'control.hosted') then
      raise notice '0101 self-check: hosted control is switched off on this instance, skipping the behavioural half';
      raise exception '0101 self-check passed';
    end if;

    insert into public.control_shows (id, owner_id, title, data, bindings, sources)
      values (v_show, v_user, '0101 self-check', '{}'::jsonb,
              '{"Board":{"f0":"external.e1.count","f1":"external.e1.status"}}'::jsonb,
              '[{"id":"e1","kind":"external","label":"Results","config":{"v":1,"configRevision":3,"endpoint":"https://results.invalid/r"}}]'::jsonb)
      returning slug, data_key into v_slug, v_key;

    -- A wrong config revision, a local destination and a later version are refused before the lease.
    if public.control_source_claim_by_key(v_key, 'e1', 2, null, 30000)->>'refused' is distinct from 'config' then
      raise exception '0101 self-check failed: an old config revision was claimed';
    end if;
    update public.control_shows set sources = jsonb_set(sources, '{0,config,mode}', '"local"') where id = v_show;
    if public.control_source_claim_by_key(v_key, 'e1', 3, null, 30000)->>'refused' is distinct from 'local_refused' then
      raise exception '0101 self-check failed: a local destination in the production record was claimed';
    end if;
    update public.control_shows set sources = jsonb_set(sources #- '{0,config,mode}', '{0,config,v}', '2') where id = v_show;
    if public.control_source_claim_by_key(v_key, 'e1', 3, null, 30000)->>'refused' is distinct from 'unsupported' then
      raise exception '0101 self-check failed: a v 2 registration was claimed';
    end if;
    update public.control_shows set sources = jsonb_set(sources, '{0,config,v}', '1') where id = v_show;
    update public.control_shows set sources = jsonb_set(sources, '{0,config,lists}', '{"cands":"standings"}') where id = v_show;
    if public.control_source_claim_by_key(v_key, 'e1', 3, null, 30000)->>'refused' is distinct from 'registration' then
      raise exception '0101 self-check failed: a registration with an unknown list adapter was claimed';
    end if;
    update public.control_shows set sources = jsonb_set(sources, '{0,config,lists}', '{"cands":"lines"}') where id = v_show;
    update public.control_shows set sources = jsonb_set(sources, '{0,id}', '"e1.x"') where id = v_show;
    if public.control_source_claim_by_key(v_key, 'e1.x', 3, null, 30000)->>'refused' is distinct from 'registration' then
      raise exception '0101 self-check failed: a dotted source id was claimed';
    end if;
    update public.control_shows set sources = jsonb_set(sources, '{0,id}', '"e1"') where id = v_show;
    if exists (select 1 from public.control_source_reads r where r.show_id = v_show) then
      raise exception '0101 self-check failed: a refused claim took the lease';
    end if;

    -- The claim takes C2's lease and the first epoch; a second agent is told it is held.
    v_c := public.control_source_claim_by_key(v_key, 'e1', 3, null, 30000);
    if (v_c->>'ok')::boolean is not true or (v_c->>'ownerEpoch')::int is distinct from 1 or (v_c->>'acceptedRevision')::int is distinct from 0 then
      raise exception '0101 self-check failed: the first claim (%)', v_c;
    end if;
    if (select r.owner from public.control_source_reads r where r.show_id = v_show) is distinct from 'agent' then
      raise exception '0101 self-check failed: the claim is not C2''s lease';
    end if;
    if (public.control_source_claim_by_key(v_key, 'e1', 3, null, 30000)->>'held')::boolean is not true then
      raise exception '0101 self-check failed: a second agent took a live claim';
    end if;
    -- Renewing with the claim keeps the epoch.
    if (public.control_source_claim_by_key(v_key, 'e1', 3, v_c->>'claim', 30000)->>'ownerEpoch')::int is distinct from 1 then
      raise exception '0101 self-check failed: a renewal raised the epoch';
    end if;

    -- A changed revision lands once, through the apply path, as the API.
    v_report := jsonb_build_object('claim', v_c->>'claim', 'ownerEpoch', 1, 'configRevision', 3, 'acceptedRevision', 1,
                                   'providerSequence', 10, 'status', 'changed', 'checkedAt', '2027-02-20T18:00:00Z',
                                   'payload', '{"count":"60","status":"PRELIMINARY"}'::jsonb);
    v_a := public.control_source_report_by_key(v_key, 'e1', v_report,
                                               '{"external.e1.count":"60","external.e1.status":"PRELIMINARY"}'::jsonb);
    if (v_a->>'ok')::boolean is not true or (v_a->>'writes')::int is distinct from 1 then
      raise exception '0101 self-check failed: an accepted revision did not apply (%)', v_a;
    end if;
    select count(*) into v_n from public.control_events e
     where e.show_id = v_show and e.msg->>'src' = 'api' and e.msg->'data' = '{"f0":"60","f1":"PRELIMINARY"}'::jsonb;
    if v_n <> 1 then raise exception '0101 self-check failed: % rows for the first revision', v_n; end if;

    -- Duplicate and older revisions, an older provider sequence, an old epoch and a moved claim are
    -- refused with nothing written.
    update public.production_source_snapshots set changed_at = now() - interval '6 seconds' where show_id = v_show;
    if public.control_source_report_by_key(v_key, 'e1', v_report, '{"external.e1.count":"61"}'::jsonb)->>'refused' is distinct from 'old_revision'
       or public.control_source_report_by_key(v_key, 'e1', v_report || '{"acceptedRevision":2,"providerSequence":9}', '{"external.e1.count":"61"}'::jsonb)->>'refused' is distinct from 'old_revision'
       or public.control_source_report_by_key(v_key, 'e1', v_report || '{"acceptedRevision":2,"ownerEpoch":0}', '{"external.e1.count":"61"}'::jsonb)->>'refused' is distinct from 'epoch'
       or public.control_source_report_by_key(v_key, 'e1', v_report || '{"acceptedRevision":2,"claim":"agent:other"}', '{"external.e1.count":"61"}'::jsonb)->>'refused' is distinct from 'moved'
       or public.control_source_report_by_key(v_key, 'e1', v_report || '{"acceptedRevision":2,"configRevision":2}', '{"external.e1.count":"61"}'::jsonb)->>'refused' is distinct from 'config' then
      raise exception '0101 self-check failed: a fenced report was not refused';
    end if;
    -- The config refusal took the fence: the agent must claim again, and gets a newer epoch.
    if public.control_source_report_by_key(v_key, 'e1', v_report || '{"acceptedRevision":2}', '{"external.e1.count":"61"}'::jsonb)->>'refused' is distinct from 'moved' then
      raise exception '0101 self-check failed: a changed registration kept the fence';
    end if;
    v_c2 := public.control_source_claim_by_key(v_key, 'e1', 3, null, 30000);
    if (v_c2->>'ownerEpoch')::int is distinct from 2 or (v_c2->>'acceptedRevision')::int is distinct from 1 or (v_c2->>'providerSequence')::numeric is distinct from 10 then
      raise exception '0101 self-check failed: a new claim did not continue from the accepted revision (%)', v_c2;
    end if;
    if public.control_source_report_by_key(v_key, 'e1', v_report || '{"acceptedRevision":2}', '{"external.e1.count":"61"}'::jsonb)->>'refused' is distinct from 'moved' then
      raise exception '0101 self-check failed: the old owner wrote after a new claim';
    end if;
    select count(*) into v_n from public.control_events e where e.show_id = v_show;
    if v_n <> 1 or (select s.data #>> '{external,e1,count}' from public.control_shows s where s.id = v_show) <> '60' then
      raise exception '0101 self-check failed: a refused report wrote';
    end if;
    v_report := v_report || jsonb_build_object('claim', v_c2->>'claim', 'ownerEpoch', 2, 'acceptedRevision', 2, 'providerSequence', 11);

    -- One accepted revision per 5 s.
    update public.production_source_snapshots set changed_at = now() - interval '4.9 seconds' where show_id = v_show;
    if public.control_source_report_by_key(v_key, 'e1', v_report, '{"external.e1.count":"61"}'::jsonb)->>'refused' is distinct from 'too_soon' then
      raise exception '0101 self-check failed: a second revision inside 5 s was accepted';
    end if;
    update public.production_source_snapshots set changed_at = now() - interval '5 seconds' where show_id = v_show;

    -- The limits, each at its edge. With the ingest budget spent (25 api rows in the window), a
    -- payload of exactly 256 KiB and a row of exactly 64 KiB pass their own checks and stop at the
    -- budget; one byte more stops at theirs. Nothing is written either way.
    insert into public.control_events (show_id, graphic, msg)
      select v_show, 'Other', '{"t":"update","data":{},"src":"api"}'::jsonb from generate_series(1, 24);
    v_pad := 262144 - octet_length('{"x": ""}'::jsonb::text);
    if public.control_source_report_by_key(v_key, 'e1', v_report || jsonb_build_object('payload', jsonb_build_object('x', repeat('y', v_pad))),
         '{"external.e1.count":"61"}'::jsonb)->>'refused' is distinct from 'budget'
       or public.control_source_report_by_key(v_key, 'e1', v_report || jsonb_build_object('payload', jsonb_build_object('x', repeat('y', v_pad + 1))),
         '{"external.e1.count":"61"}'::jsonb)->>'refused' is distinct from 'too_large' then
      raise exception '0101 self-check failed: the 256 KiB payload edge';
    end if;
    v_pad := 65536 - octet_length(jsonb_build_object('t', 'update', 'data', jsonb_build_object('f0', ''), 'src', 'api')::text);
    if public.control_source_report_by_key(v_key, 'e1', v_report, jsonb_build_object('external.e1.count', repeat('x', v_pad)))->>'refused' is distinct from 'budget'
       or public.control_source_report_by_key(v_key, 'e1', v_report, jsonb_build_object('external.e1.count', repeat('x', v_pad + 1)))->>'refused' is distinct from 'row_too_large' then
      raise exception '0101 self-check failed: the 64 KiB row edge';
    end if;
    -- One row back: 24 in the window, so the revision below (one row) is the 25th and is accepted.
    delete from public.control_events e where e.id = (select min(x.id) from public.control_events x where x.show_id = v_show and x.graphic = 'Other');
    select count(*) into v_n from public.control_events e where e.show_id = v_show and e.graphic = 'Board';
    if v_n <> 1 then raise exception '0101 self-check failed: a refused limit wrote % rows', v_n - 1; end if;

    -- The source's own Pause refuses application; an unchanged report moves checked-at only, at most
    -- every 15 s; an override holds until the source's value changes.
    update public.control_shows set sources = jsonb_set(sources, '{0,paused}', 'true') where id = v_show;
    if public.control_source_report_by_key(v_key, 'e1', v_report, '{"external.e1.count":"61"}'::jsonb)->>'refused' is distinct from 'paused' then
      raise exception '0101 self-check failed: a paused source applied';
    end if;
    update public.control_shows set sources = jsonb_set(sources, '{0,paused}', 'false') where id = v_show;
    perform public.control_data_apply(v_show, '{"external":{"e1":{"status":"OPERATOR"}}}'::jsonb, 'operator');
    v_a := public.control_source_report_by_key(v_key, 'e1', v_report, '{"external.e1.count":"61","external.e1.status":"PRELIMINARY"}'::jsonb);
    if (v_a->>'ok')::boolean is not true
       or (select s.data->'external'->'e1' from public.control_shows s where s.id = v_show) is distinct from '{"count":"61","status":"OPERATOR"}'::jsonb then
      raise exception '0101 self-check failed: the second revision or the held override (%)', v_a;
    end if;
    update public.production_source_snapshots set checked_at = now() - interval '14.9 seconds' where show_id = v_show;
    if (public.control_source_report_by_key(v_key, 'e1', v_report || '{"status":"unchanged"}', '{}'::jsonb)->>'ignored')::boolean is not true then
      raise exception '0101 self-check failed: an unchanged receipt inside 15 s was written';
    end if;
    update public.production_source_snapshots set checked_at = now() - interval '15 seconds', changed_at = now() - interval '1 minute' where show_id = v_show;
    v_a := public.control_source_report_by_key(v_key, 'e1', v_report || '{"status":"unchanged"}', '{}'::jsonb);
    if (v_a->>'ignored')::boolean or (select p.changed_at > now() - interval '30 seconds' or p.checked_at is distinct from now()
                                        from public.production_source_snapshots p where p.show_id = v_show) then
      raise exception '0101 self-check failed: an unchanged receipt (%)', v_a;
    end if;

    -- An unchanged read with a newer provider sequence raises the fence, inside the 15 s too: a
    -- changed one between the two sequences is then old.
    update public.production_source_snapshots set checked_at = now() where show_id = v_show;
    perform public.control_source_report_by_key(v_key, 'e1', v_report || '{"status":"unchanged","providerSequence":50}', '{}'::jsonb);
    update public.production_source_snapshots set changed_at = now() - interval '5 seconds' where show_id = v_show;
    if (select p.provider_sequence from public.production_source_snapshots p where p.show_id = v_show) is distinct from 50
       or public.control_source_report_by_key(v_key, 'e1', v_report || '{"acceptedRevision":3,"providerSequence":40}', '{"external.e1.count":"62"}'::jsonb)->>'refused' is distinct from 'old_revision' then
      raise exception '0101 self-check failed: an unchanged read did not keep its newer provider sequence';
    end if;

    -- Paused, every revision joins one Resume row per graphic: that row must fit. Two 40 KB values
    -- for two fields of one graphic fit one by one and not together.
    perform public.control_data_pause_by_slug(v_slug, true);
    -- A short held /update for the same field must not mask an oversized value: the apply drops it.
    if public.control_data_send(v_key, 'Board', '{"f0":"x"}'::jsonb) is not null
       or public.control_source_report_by_key(v_key, 'e1', v_report || '{"acceptedRevision":3,"providerSequence":51}',
            jsonb_build_object('external.e1.count', repeat('c', 70000)))->>'refused' is distinct from 'row_too_large' then
      raise exception '0101 self-check failed: a held /update masked an oversized paused value';
    end if;
    v_a := public.control_source_report_by_key(v_key, 'e1', v_report || '{"acceptedRevision":3,"providerSequence":51}',
                                               jsonb_build_object('external.e1.count', repeat('a', 40000)));
    if (v_a->>'ok')::boolean is not true or (v_a->>'paused')::boolean is not true then
      raise exception '0101 self-check failed: a paused revision was not held (%)', v_a;
    end if;
    update public.production_source_snapshots set changed_at = now() - interval '5 seconds' where show_id = v_show;
    if public.control_source_report_by_key(v_key, 'e1', v_report || '{"acceptedRevision":4,"providerSequence":52}',
         jsonb_build_object('external.e1.status', repeat('b', 40000)))->>'refused' is distinct from 'row_too_large' then
      raise exception '0101 self-check failed: a paused revision grew the Resume row past 64 KiB';
    end if;

    -- A later snapshot version holds the source read-only.
    update public.production_source_snapshots set v = 2 where show_id = v_show;
    if public.control_source_report_by_key(v_key, 'e1', v_report || '{"acceptedRevision":3}', '{"external.e1.count":"62"}'::jsonb)->>'refused' is distinct from 'unsupported' then
      raise exception '0101 self-check failed: a v 2 snapshot was written';
    end if;

    raise exception '0101 self-check passed';
  exception when others then
    if sqlerrm <> '0101 self-check passed' then raise; end if;
  end;
end $$;
