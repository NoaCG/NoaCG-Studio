-- live-path: control_source_report_by_key writes a bound path's value as the JSON the route sends, not only as text (same signature, same grants, every existing caller unchanged)
--
-- TYPED SOURCE VALUES FOR A FOREIGN OGRAF FIELD (docs/work-specs/playout-ograf-contract/spec.md,
-- phase E1.2a: E5's typed values reach a foreign field in E1's envelope, never as E5's strings).
--
-- The source route's evaluator (src/control/sourceMapping.ts `projectSource`) writes a bound leaf
-- that only typed fields read (a published panel field carrying its manifest's property schema,
-- `typed`) as the JSON value the provider sent, checked against that schema, instead of text. The
-- page reads it from the tree when it takes or updates the cue and puts it in the cue's envelope.
-- 0102's report refused any value that was not a string. Here a BOUND path takes any value
-- 0088's rules allow there (`production_data_may_replace`: a string, a number, a boolean or a list
-- of them, over nothing or a value of its kind), which is what /patch has always written into the
-- tree; a published collection leaf still takes text only. A record is still never written at a
-- bound path: it would replace a subtree, so the route reports it as skipped, as before.
--
-- Nothing else moves: the fences, the limits (256 KiB of payload, the 64 KiB row, the shared budget)
-- and the rows. A bound path a native field also reads resolves to text in its update row exactly
-- as a number /patch wrote does (0048's resolve). An older route sends text only and reads as
-- before. The route of this build, meeting a database without 0104 (a held live-path apply),
-- catches its refusal and sends the text alone, saying the typed values wait (api/data/[...path].ts).
--
-- Additive: one function replaced with the same signature and grants. Revert: restore 0102's
-- function, and the route falls back to text as it does before this migration applies.

set lock_timeout = '2s';
set statement_timeout = '30s';

-- ── 1. One report, fenced, whose bound values may be typed ─────────────────────────────────────
-- p_report: {claim, ownerEpoch, configRevision, acceptedRevision, providerSequence?, status,
-- providerEventTime?, error?, payload?}. p_writes: bound path or published collection leaf -> the
-- text the evaluator made of the payload, or for a bound path the typed value (0104). Answers {ok: true, ...} or {ok: false, refused, ...}; the only raise is the
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
  where jsonb_typeof(c.value) = 'object' and c.value->'v' = '1'::jsonb and c.value->'sourceId' = to_jsonb(p_source)
    and jsonb_typeof(c.value->'from') = 'string' and c.value->>'from' ~ '^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+){0,7}$';

  v_snapshot := coalesce(v_read.snapshot, '{}'::jsonb);
  for v_path, v_value in select w.key, w.value from jsonb_each(v_in) w loop
    -- 0104: a bound path takes a typed value, judged by 0088's rules below (a record or a null is
    -- skipped there, never written); a collection leaf, and anything that is neither, takes text.
    if not starts_with(v_path, 'external.' || p_source || '.')
       or (jsonb_typeof(v_value) <> 'string' and not v_path = any(v_bound)) then
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
      -- Never above or below a bound path or another collection's leaf: text there would replace
      -- that subtree, or land inside text.
      v_fits := v_path = any(v_collected)
        and (v_data #> v_seg is null or jsonb_typeof(v_data #> v_seg) in ('null', 'string', 'object'))
        and not exists (select 1 from unnest(v_bound || v_collected) o(path)
                         where starts_with(o.path, v_path || '.') or starts_with(v_path, o.path || '.'));
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

-- ── 2. Self-check ──────────────────────────────────────────────────────────────────────────────
-- supabase/AGENTS.md: shape, then CALL the thing, in a block that is always rolled back.
do $$
declare
  v_user uuid := gen_random_uuid();
  v_show uuid := '00000000-0104-4000-8000-000000000104';
  v_key text;
  v_c jsonb;
  v_a jsonb;
  v_n int;
  v_report jsonb;
  v_recipe jsonb := '{"v":1,"id":"cands","sourceId":"e1","schemaRevision":1,"graphic":"Card","from":"cands","key":["d","n"],"fields":{"f0":{"from":"name"}}}'::jsonb;
  v_step int := 0;
begin
  -- (a) Shape.
  if has_function_privilege('anon', 'public.control_source_report_by_key(text,text,jsonb,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.control_source_report_by_key(text,text,jsonb,jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.control_source_report_by_key(text,text,jsonb,jsonb)', 'execute') then
    raise exception '0104 self-check failed: the report has the wrong grants';
  end if;

  -- (b) Behaviour, always rolled back.
  begin
    begin
      insert into auth.users (id, instance_id, aud, role, email)
      values (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '0104-self-check@noacg.invalid');
    exception when others then
      raise notice '0104 self-check: no throwaway account could be made (%), skipping the behavioural half', sqlerrm;
      return;
    end;
    if public.feature_denied_for(v_user, 'control.hosted') then
      raise notice '0104 self-check: hosted control is switched off on this instance, skipping the behavioural half';
      raise exception '0104 self-check passed';
    end if;

    insert into public.control_shows (id, owner_id, title, bindings, sources, collections)
      values (v_show, v_user, '0104 self-check',
              '{"Board":{"score":"external.e1.score","teams":"external.e1.teams","live":"external.e1.live","count":"external.e1.count"}}'::jsonb,
              '[{"id":"e1","kind":"external","label":"Results","config":{"v":1,"configRevision":1,"endpoint":"https://results.invalid/r"}}]'::jsonb,
              jsonb_build_array(v_recipe))
      returning data_key into v_key;
    v_c := public.control_source_claim_by_key(v_key, 'e1', 1, null, 30000);
    if (v_c->>'ok')::boolean is not true then raise exception '0104 self-check failed: the claim (%)', v_c; end if;
    v_report := jsonb_build_object('claim', v_c->>'claim', 'ownerEpoch', v_c->'ownerEpoch', 'configRevision', 1,
                                   'acceptedRevision', 1, 'status', 'changed', 'payload', '{"score":2}'::jsonb);

    -- A number, a boolean and a list at bound paths are written as they are, text beside them as
    -- before; a record at a bound path is skipped, never written.
    v_a := public.control_source_report_by_key(v_key, 'e1', v_report,
             '{"external.e1.score":2,"external.e1.live":true,"external.e1.teams":["H","A"],"external.e1.count":"60","external.e1.meta":"x"}'::jsonb);
    if (v_a->>'ok')::boolean is not true
       or (select s.data #> '{external,e1}' from public.control_shows s where s.id = v_show)
          is distinct from '{"score":2,"live":true,"teams":["H","A"],"count":"60"}'::jsonb then
      raise exception '0104 self-check failed: typed values at bound paths (%)', v_a;
    end if;
    -- One update row for the graphic, its fields resolved to text as a /patch number is.
    select count(*) into v_n from public.control_events e where e.show_id = v_show;
    if v_n <> 1 or (select e.msg->'data'->>'score' from public.control_events e where e.show_id = v_show) is distinct from '2' then
      raise exception '0104 self-check failed: the update row (% rows)', v_n;
    end if;
    update public.production_source_snapshots set changed_at = now() - interval '5 seconds' where show_id = v_show;
    v_a := public.control_source_report_by_key(v_key, 'e1', v_report || '{"acceptedRevision":2}', '{"external.e1.score":{"home":3}}'::jsonb);
    if (v_a->'skipped') is distinct from '["external.e1.score"]'::jsonb
       or (select s.data #> '{external,e1,score}' from public.control_shows s where s.id = v_show) is distinct from '2'::jsonb then
      raise exception '0104 self-check failed: a record was written at a bound path (%)', v_a;
    end if;

    -- Text only at a collection leaf, and at a path nothing binds.
    update public.production_source_snapshots set changed_at = now() - interval '5 seconds' where show_id = v_show;
    begin
      perform public.control_source_report_by_key(v_key, 'e1', v_report || '{"acceptedRevision":3}', '{"external.e1.cands":7}'::jsonb);
      v_step := 1;
    exception when others then
      if sqlerrm <> 'not a source report' then raise; end if;
    end;
    if v_step = 1 then raise exception '0104 self-check failed: a number was written at a collection leaf'; end if;
    begin
      perform public.control_source_report_by_key(v_key, 'e1', v_report || '{"acceptedRevision":3}', '{"external.e1.loose":7}'::jsonb);
      v_step := 2;
    exception when others then
      if sqlerrm <> 'not a source report' then raise; end if;
    end;
    if v_step = 2 then raise exception '0104 self-check failed: a number was written at an unbound path'; end if;

    raise exception '0104 self-check passed';
  exception when others then
    if sqlerrm <> '0104 self-check passed' then raise; end if;
  end;
end $$;
