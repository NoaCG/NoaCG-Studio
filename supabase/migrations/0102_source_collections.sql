-- live-path: control_shows gains `collections`; control_source_context_by_key answers it and control_source_report_by_key also writes a published collection leaf of its own source (same signatures, same grants, every existing caller unchanged)
--
-- A LIVE CANDIDATE'S COLLECTION THROUGH THE SOURCE ROUTE (docs/work-specs/playout-election-package/
-- spec.md, phase E7.2b; AC-4 through E4's authenticated acquisition and E5's mapping).
--
-- A cue of a shared card selects one entity of a collection recipe (`Show.collections`, E7.1) and
-- the page reads that collection from the tree at `external.<source>.<from>`, as the JSON text of
-- one accepted revision. No field binds that leaf, so 0101's report wrote nothing there: it writes a
-- path only when `control_shows.bindings` names it. Here:
--
-- - `control_shows.collections` is the production's `Show.collections`, written by the owner's
--   page beside `bindings` and `sources` (publish, connect, Pause), through the owner's row policy.
--   Like `sources` it is the operators' only: no output or audience function selects it. NULL is
--   "never written" (a row published before this migration, or by an older page): nothing new is
--   written for it until its next publish.
-- - `control_source_context_by_key` answers it beside the bindings, so the route's evaluator
--   (src/control/sourceMapping.ts) projects each published recipe's leaf of the source.
-- - `control_source_report_by_key` writes such a leaf too, as text: only under this source's own
--   prefix, only a `from` that a v 1 published recipe of THIS source names, from a list of at most
--   64 (anything else names none), in place of nothing, an earlier revision's text or a seed's
--   object. Every fence and limit is 0101's, unchanged: the claim, the epoch, the config revision,
--   the revision gap, 256 KiB of payload, the 64 KiB row and the shared budget. An unbound leaf
--   resolves to no field, so it appends no update row: outputs keep receiving resolved values only.
--
-- Additive: one nullable column and two functions replaced with the same signatures and grants.
-- A row without `collections` behaves exactly as under 0101. Revert: the app stops writing and
-- reading the column, which is then read by nothing; restore 0101's two functions to stop the
-- report writing collection leaves.

set lock_timeout = '2s';
set statement_timeout = '30s';

-- ── 1. The collections on the row ──────────────────────────────────────────────────────────────
alter table public.control_shows
  add column if not exists collections jsonb;

-- ── 2. What the route evaluates a payload against, with the collections ────────────────────────
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
    'payload', (select p.payload from public.production_source_snapshots p where p.show_id = v_row.id and p.source_id = p_source),
    'bindings', coalesce(v_row.bindings, '{}'::jsonb),
    -- E7.2b: the published collection recipes, as the page wrote them (null: never written).
    'collections', v_row.collections,
    'fields', (select coalesce(jsonb_object_agg(g.value->>'name', coalesce(g.value->'fields', '[]'::jsonb)), '{}'::jsonb)
                 from jsonb_array_elements(case jsonb_typeof(v_row.panel) when 'array' then v_row.panel else '[]'::jsonb end) g
                where g.value->>'name' is not null));
end $$;
revoke execute on function public.control_source_context_by_key(text, text) from public, anon, authenticated;
grant execute on function public.control_source_context_by_key(text, text) to service_role;

-- ── 3. One report, fenced, with the collection leaves ──────────────────────────────────────────
-- p_report: {claim, ownerEpoch, configRevision, acceptedRevision, providerSequence?, status,
-- providerEventTime?, error?, payload?}. p_writes: bound path or published collection leaf -> the
-- text the evaluator made of the payload. Answers {ok: true, ...} or {ok: false, refused, ...}; the only raise is the
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
  v_collections jsonb;
  v_collected text[];
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
  v_in jsonb := p_writes;
  v_fill boolean := false;
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
  select s.bindings, s.collections, coalesce(s.data, '{}'::jsonb), s.data_paused, s.data_pending, coalesce(s.data_held, '{}'::jsonb),
         (select e.value from jsonb_array_elements(case jsonb_typeof(s.sources) when 'array' then s.sources else '[]'::jsonb end) e
           where e.value->>'id' = p_source limit 1)
    into v_bindings, v_collections, v_data, v_paused, v_pending_tree, v_held, v_entry
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
    -- A FILL: the route evaluates the accepted payload again at every receipt, so a field bound after
    -- that revision gets its value without a new one. Only paths this source never wrote are filled,
    -- so what it wrote before (and an operator's override of it) is left alone; not while paused.
    -- A fill keeps the receipt gap: a path the rules below skip stays unwritten, so it is tried again
    -- at most every 15 s, never at every read.
    if v_snap.checked_at is not null and v_snap.checked_at > now() - c_receipt_gap then
      return jsonb_build_object('ok', true, 'ignored', true, 'acceptedRevision', v_snap.accepted_revision);
    end if;
    select coalesce(jsonb_object_agg(w.key, w.value), '{}'::jsonb) into v_in
      from jsonb_each(p_writes) w where not (coalesce(v_read.snapshot, '{}'::jsonb) ? w.key);
    v_fill := v_in <> '{}'::jsonb and not coalesce((v_entry->>'paused')::boolean, false);
    if not v_fill then
      update public.production_source_snapshots p
         set checked_at = now(), status = v_state, status_at = now()
       where p.show_id = v_show and p.source_id = p_source;
      return jsonb_build_object('ok', true, 'acceptedRevision', v_snap.accepted_revision);
    end if;
  end if;

  if v_status not in ('changed', 'unchanged') then
    -- A hold or a failure: the status only, when it is news or every 15 s.
    if v_snap.status->>'state' is distinct from v_status or v_snap.status_at is null or v_snap.status_at <= now() - c_receipt_gap then
      update public.production_source_snapshots p set status = v_state, status_at = now()
       where p.show_id = v_show and p.source_id = p_source;
    end if;
    return jsonb_build_object('ok', true, 'acceptedRevision', v_snap.accepted_revision);
  end if;

  -- A changed payload: the fence, then the limits, all before anything moves. (A fill is the
  -- accepted revision's own values and skips the revision fence; the value rules and limits below
  -- apply to it all the same.)
  if v_fill then
    null;
  elsif v_revision <= v_snap.accepted_revision
     or (v_sequence is not null and v_snap.provider_sequence is not null and v_sequence < v_snap.provider_sequence) then
    return jsonb_build_object('ok', false, 'refused', 'old_revision', 'acceptedRevision', v_snap.accepted_revision);
  end if;
  if v_fill then
    null;
  elsif coalesce((v_entry->>'paused')::boolean, false) then
    return jsonb_build_object('ok', false, 'refused', 'paused');
  elsif v_snap.changed_at is not null and v_snap.changed_at > now() - c_revision_gap then
    return jsonb_build_object('ok', false, 'refused', 'too_soon',
                              'retryMs', ceil(extract(epoch from (v_snap.changed_at + c_revision_gap - now())) * 1000));
  end if;
  if not v_fill then
    if p_report->'payload' is null then raise exception 'not a source report'; end if;
    v_bytes := octet_length((p_report->'payload')::text);
    if v_bytes > c_payload_bytes then
      return jsonb_build_object('ok', false, 'refused', 'too_large');
    end if;
  end if;

  select coalesce(array_agg(distinct f.value), '{}') into v_bound
  from jsonb_each(coalesce(v_bindings, '{}'::jsonb)) g
  cross join lateral jsonb_each_text(case when jsonb_typeof(g.value) = 'object' then g.value else '{}'::jsonb end) f;

  -- E7.2b: the leaves of THIS source that a published collection recipe (v 1) reads. No field binds
  -- them: a cue's selection reads the collection from the tree, so they move the tree and append
  -- no update row. A list of more than 64, or anything that is not one, names none (the route
  -- holds the same, src/control/sourceMapping.ts MAX_PUBLISHED_COLLECTIONS).
  select coalesce(array_agg(distinct 'external.' || p_source || '.' || (c.value->>'from')), '{}') into v_collected
  from jsonb_array_elements(case when jsonb_typeof(v_collections) = 'array' and jsonb_array_length(v_collections) <= 64
                                 then v_collections else '[]'::jsonb end) c
  where jsonb_typeof(c.value) = 'object' and c.value->'v' = '1'::jsonb and c.value->>'sourceId' = p_source
    and jsonb_typeof(c.value->'from') = 'string' and c.value->>'from' ~ '^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+){0,7}$';

  v_snapshot := coalesce(v_read.snapshot, '{}'::jsonb);
  for v_path, v_value in select w.key, w.value from jsonb_each(v_in) w loop
    if jsonb_typeof(v_value) <> 'string' or not starts_with(v_path, 'external.' || p_source || '.') then
      raise exception 'not a source report';
    end if;
    -- What this source last wrote here: no write, so an operator's override holds.
    if v_snapshot->v_path = v_value then continue; end if;
    v_seg := string_to_array(v_path, '.');
    if v_path = any(v_bound) then
      v_fits := public.production_data_may_replace(v_data #> v_seg, v_value);
    else
      -- A collection leaf takes the JSON text of one revision, in place of nothing, of the text an
      -- earlier revision left, or of the collection as an object (a pack's starter seed).
      v_fits := v_path = any(v_collected)
        and (v_data #> v_seg is null or jsonb_typeof(v_data #> v_seg) in ('null', 'string', 'object'));
    end if;
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
  if v_fill then
    update public.production_source_snapshots p set checked_at = now(), status = v_state, status_at = now()
     where p.show_id = v_show and p.source_id = p_source;
    return jsonb_build_object('ok', true, 'acceptedRevision', v_snap.accepted_revision, 'filled', true,
                              'writes', coalesce(jsonb_array_length(v_result->'writes'), 0),
                              'paused', coalesce((v_result->>'paused')::boolean, false),
                              'skipped', to_jsonb(v_skipped));
  end if;
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
-- ── 4. Self-check ──────────────────────────────────────────────────────────────────────────────
-- supabase/AGENTS.md: shape, then CALL the thing, in a block that is always rolled back.
do $$
declare
  v_user uuid := gen_random_uuid();
  v_show uuid := '00000000-0102-4000-8000-000000000102';
  v_key text;
  v_c jsonb;
  v_a jsonb;
  v_n int;
  v_report jsonb;
  v_recipe jsonb := '{"v":1,"id":"cands","sourceId":"e1","schemaRevision":1,"graphic":"Card","from":"cands","key":["d","n"],"fields":{"f0":{"from":"name"}}}'::jsonb;
  v_text text := '{"schemaRevision":1,"revision":1,"items":[{"d":"01","n":7,"name":"Aino"}]}';
  v_writes jsonb;
  v_step int := 0;
begin
  -- (a) Shape.
  if not exists (select 1 from information_schema.columns c
                  where c.table_schema = 'public' and c.table_name = 'control_shows' and c.column_name = 'collections' and c.is_nullable = 'YES') then
    raise exception '0102 self-check failed: control_shows.collections is missing or not nullable';
  end if;
  if has_function_privilege('anon', 'public.control_source_report_by_key(text,text,jsonb,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.control_source_report_by_key(text,text,jsonb,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.control_source_context_by_key(text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.control_source_context_by_key(text,text)', 'execute')
     or not has_function_privilege('service_role', 'public.control_source_report_by_key(text,text,jsonb,jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.control_source_context_by_key(text,text)', 'execute') then
    raise exception '0102 self-check failed: a source function has the wrong grants';
  end if;

  -- (b) Behaviour, always rolled back.
  begin
    begin
      insert into auth.users (id, instance_id, aud, role, email)
      values (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '0102-self-check@noacg.invalid');
    exception when others then
      raise notice '0102 self-check: no throwaway account could be made (%), skipping the behavioural half', sqlerrm;
      return;
    end;
    if public.feature_denied_for(v_user, 'control.hosted') then
      raise notice '0102 self-check: hosted control is switched off on this instance, skipping the behavioural half';
      raise exception '0102 self-check passed';
    end if;

    -- A seed's collection as an object, as a pack installs it; the recipe of another source and a
    -- later version beside this source's own.
    insert into public.control_shows (id, owner_id, title, data, bindings, sources, collections)
      values (v_show, v_user, '0102 self-check', '{"external":{"e1":{"cands":{"revision":0,"items":[]}}}}'::jsonb,
              '{"Board":{"f0":"external.e1.count"}}'::jsonb,
              '[{"id":"e1","kind":"external","label":"Results","config":{"v":1,"configRevision":1,"endpoint":"https://results.invalid/r"}}]'::jsonb,
              jsonb_build_array(v_recipe,
                                v_recipe || '{"id":"theirs","sourceId":"e2","from":"theirs"}',
                                v_recipe || '{"id":"later","v":2,"from":"later"}'))
      returning data_key into v_key;
    if public.control_source_context_by_key(v_key, 'e1')->'collections' is distinct from
       (select s.collections from public.control_shows s where s.id = v_show) then
      raise exception '0102 self-check failed: the context does not answer the collections';
    end if;
    v_c := public.control_source_claim_by_key(v_key, 'e1', 1, null, 30000);
    if (v_c->>'ok')::boolean is not true then raise exception '0102 self-check failed: the claim (%)', v_c; end if;
    v_report := jsonb_build_object('claim', v_c->>'claim', 'ownerEpoch', v_c->'ownerEpoch', 'configRevision', 1,
                                   'acceptedRevision', 1, 'status', 'changed', 'payload', '{"count":"60"}'::jsonb);

    -- The collection leaf is written as text over the seed's object, with the bound value; the
    -- other source's leaf, the later version's, an unbound loose leaf and another prefix are not.
    v_writes := jsonb_build_object('external.e1.count', '60', 'external.e1.cands', v_text, 'external.e1.theirs', 'x',
                                   'external.e1.later', 'x', 'external.e1.loose', 'x');
    v_a := public.control_source_report_by_key(v_key, 'e1', v_report, v_writes);
    if (v_a->>'ok')::boolean is not true
       or (select s.data #>> '{external,e1,cands}' from public.control_shows s where s.id = v_show) is distinct from v_text
       or (select s.data #> '{external,e1,count}' from public.control_shows s where s.id = v_show) is distinct from '"60"'::jsonb
       or (select s.data->'external'->'e1' ?| array['theirs', 'later', 'loose'] from public.control_shows s where s.id = v_show)
       or (v_a->'skipped') is distinct from '["external.e1.later", "external.e1.loose", "external.e1.theirs"]'::jsonb then
      raise exception '0102 self-check failed: the collection leaf write (%)', v_a;
    end if;
    -- The leaf appends no update row: one row, the bound field's, for the whole revision.
    select count(*) into v_n from public.control_events e where e.show_id = v_show;
    if v_n <> 1 or (select e.msg->'data' from public.control_events e where e.show_id = v_show) is distinct from '{"f0":"60"}'::jsonb then
      raise exception '0102 self-check failed: the collection leaf appended a row (% rows)', v_n;
    end if;

    -- A bound leaf keeps 0088's value rules: an object there is not replaced by text.
    update public.control_shows set data = jsonb_set(data, '{external,e1,count}', '{"held":true}') where id = v_show;
    update public.production_source_snapshots set changed_at = now() - interval '5 seconds' where show_id = v_show;
    v_a := public.control_source_report_by_key(v_key, 'e1', v_report || '{"acceptedRevision":2}', '{"external.e1.count":"61"}'::jsonb);
    if (v_a->'skipped') is distinct from '["external.e1.count"]'::jsonb then
      raise exception '0102 self-check failed: a bound leaf replaced a record (%)', v_a;
    end if;

    -- A later revision replaces the text; a non-string is still not a source report.
    update public.production_source_snapshots set changed_at = now() - interval '5 seconds' where show_id = v_show;
    v_a := public.control_source_report_by_key(v_key, 'e1', v_report || '{"acceptedRevision":3}',
                                               jsonb_build_object('external.e1.cands', replace(v_text, '"revision":1', '"revision":2')));
    if (select s.data #>> '{external,e1,cands}' from public.control_shows s where s.id = v_show) is distinct from replace(v_text, '"revision":1', '"revision":2') then
      raise exception '0102 self-check failed: a later revision did not replace the collection (%)', v_a;
    end if;
    update public.production_source_snapshots set changed_at = now() - interval '5 seconds' where show_id = v_show;
    begin
      perform public.control_source_report_by_key(v_key, 'e1', v_report || '{"acceptedRevision":4}', '{"external.e1.cands":{"items":[]}}'::jsonb);
      v_step := 1;
    exception when others then
      if sqlerrm <> 'not a source report' then raise; end if;
    end;
    if v_step = 1 then raise exception '0102 self-check failed: an object was written at a collection leaf'; end if;

    -- The fence is 0101's: a report under another claim writes nothing at the leaf.
    update public.production_source_snapshots set changed_at = now() - interval '5 seconds' where show_id = v_show;
    if public.control_source_report_by_key(v_key, 'e1', v_report || '{"acceptedRevision":4,"claim":"agent:other"}',
         jsonb_build_object('external.e1.cands', 'moved'))->>'refused' is distinct from 'moved' then
      raise exception '0102 self-check failed: a moved claim was not refused';
    end if;

    -- A hostile list names nothing: more than 64 recipes, not a list, a path too deep or not a path.
    update public.control_shows set collections = (select jsonb_agg(v_recipe) from generate_series(1, 65)) where id = v_show;
    v_a := public.control_source_report_by_key(v_key, 'e1', v_report || '{"acceptedRevision":4}', jsonb_build_object('external.e1.cands', 'held'));
    if (v_a->'skipped') is distinct from '["external.e1.cands"]'::jsonb then
      raise exception '0102 self-check failed: a list of 65 recipes named a leaf (%)', v_a;
    end if;
    update public.control_shows set collections = (select jsonb_agg(v_recipe) from generate_series(1, 64)) where id = v_show;
    update public.production_source_snapshots set changed_at = now() - interval '5 seconds' where show_id = v_show;
    v_a := public.control_source_report_by_key(v_key, 'e1', v_report || '{"acceptedRevision":5}', jsonb_build_object('external.e1.cands', 'kept'));
    if (v_a->'skipped') is distinct from '[]'::jsonb then
      raise exception '0102 self-check failed: a list of 64 recipes named no leaf (%)', v_a;
    end if;
    update public.production_source_snapshots set changed_at = now() - interval '5 seconds' where show_id = v_show;
    update public.control_shows set collections = v_recipe where id = v_show;
    v_a := public.control_source_report_by_key(v_key, 'e1', v_report || '{"acceptedRevision":6}', jsonb_build_object('external.e1.cands', 'no'));
    if (v_a->'skipped') is distinct from '["external.e1.cands"]'::jsonb then
      raise exception '0102 self-check failed: a recipe that is not in a list named a leaf (%)', v_a;
    end if;
    update public.control_shows set collections = jsonb_build_array(v_recipe || '{"from":"a.b.c.d.e.f.g.h.i"}', v_recipe || jsonb_build_object('from', repeat('a', 100000) || '.'))
     where id = v_show;
    update public.production_source_snapshots set changed_at = now() - interval '5 seconds' where show_id = v_show;
    v_a := public.control_source_report_by_key(v_key, 'e1', v_report || '{"acceptedRevision":7}',
                                               jsonb_build_object('external.e1.a.b.c.d.e.f.g.h.i', 'deep', 'external.e1.' || repeat('a', 100000) || '.', 'bad'));
    if jsonb_array_length(v_a->'skipped') is distinct from 2 then
      raise exception '0102 self-check failed: a path too deep or not a path named a leaf';
    end if;

    raise exception '0102 self-check passed';
  exception when others then
    if sqlerrm <> '0102 self-check passed' then raise; end if;
  end;
end $$;
