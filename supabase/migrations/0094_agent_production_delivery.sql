-- PRODUCTION DELIVERY - a set of graphics and the production made of them, as ONE idempotent
-- operation (docs/AGENT_SAVE.md §11, docs/work-specs/agent-delivery/spec.md Phase 4).
--
-- `noacg save a b c --production <name>` asks the set door (0093) for a ready production as well:
-- the library graphics, a production pooling them on their layers, and its ordered rundown, with no
-- Install step. What has to hold is what 0093 holds for the set, now for the production too: it
-- arrives whole or not at all, and sending the same request again never makes a second production.
-- So `agent_deliver_production` runs `agent_deliver_graphics` (the claim, the records, the receipts)
-- and, in the same transaction, inserts the production's `show` document and names it on every
-- graphic's receipt (`agent_deliveries.production_id`, 0092's column, until now only an installed
-- package's). A failure anywhere rolls all of it back, the claim included.
--
-- REPLAY. The same operation, hash and key replays the set's ids and answers the production the
-- first call made; the hash is the API's over the records AND the production asked for
-- (api/_lib/me/graphicSets.ts), so the same graphics with another production, or without one, are a
-- conflict under that operation.
--
-- The production body is built by the API (src/model/productionDelivery.ts) from the records it
-- shape-checked: a new, unpublished production record (no slugs), exactly what the studio's own
-- Install writes. The function never reads graphic code.
--
-- ACCESS POSTURE. Service role only, as 0093: the API checks the credential's `graphics:create`
-- AND `productions:create` before calling it. Nothing is granted to `anon` or `authenticated`.
--
-- Additive: one function, nothing else. Revert: drop the function; delivered productions are
-- ordinary productions and stay.
set lock_timeout = '2s';
set statement_timeout = '30s';

-- Deliver a set and its production: { outcome, ids: [library ids], production: <id> } - or
-- { outcome: 'conflict', ids: [] }. `p_production` is { id, name, body } with body.id = id.
create or replace function public.agent_deliver_production(
  p_user_id uuid,
  p_key_id uuid,
  p_operation_id uuid,
  p_payload_hash text,
  p_graphics jsonb,
  p_production jsonb
)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_answer     jsonb;
  v_production uuid;
begin
  if jsonb_typeof(p_production) is distinct from 'object'
     or jsonb_typeof(p_production -> 'body') is distinct from 'object'
     or (p_production ->> 'id') is null
     or (p_production -> 'body' ->> 'id') is distinct from (p_production ->> 'id') then
    raise exception 'agent_deliver_production: a production { id, name, body } whose body carries its id is required';
  end if;

  -- The set: claim, records and receipts, or the replay of an earlier call, or a conflict.
  v_answer := public.agent_deliver_graphics(p_user_id, p_key_id, p_operation_id, p_payload_hash, p_graphics);
  if v_answer ->> 'outcome' = 'conflict' then
    return v_answer;
  end if;

  if v_answer ->> 'outcome' = 'replayed' then
    select d.production_id into v_production
      from public.agent_deliveries d
     where d.user_id = p_user_id and d.operation_id = p_operation_id and d.kind = 'graphic'
       and d.position is not null and d.production_id is not null
     limit 1;
    -- The same hash names the same production request, so this cannot happen; refuse rather than
    -- answer a production that does not exist.
    if v_production is null then
      return jsonb_build_object('outcome', 'conflict', 'ids', '[]'::jsonb);
    end if;
    return v_answer || jsonb_build_object('production', v_production);
  end if;

  v_production := (p_production ->> 'id')::uuid;
  insert into public.documents (id, user_id, kind, name, body, deleted)
  values (v_production, p_user_id, 'show', coalesce(p_production ->> 'name', ''), p_production -> 'body', false);

  update public.agent_deliveries d
     set production_id = v_production, updated_at = now()
   where d.user_id = p_user_id and d.operation_id = p_operation_id and d.kind = 'graphic'
     and d.position is not null;

  return v_answer || jsonb_build_object('production', v_production);
end;
$$;
revoke execute on function public.agent_deliver_production(uuid, uuid, uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.agent_deliver_production(uuid, uuid, uuid, text, jsonb, jsonb) to service_role;

-- Self-check: the posture.
do $$
begin
  if has_function_privilege('anon', 'public.agent_deliver_production(uuid, uuid, uuid, text, jsonb, jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.agent_deliver_production(uuid, uuid, uuid, text, jsonb, jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.agent_deliver_production(uuid, uuid, uuid, text, jsonb, jsonb)', 'execute') then
    raise exception '0094: only service_role may execute agent_deliver_production';
  end if;
end $$;

-- Self-check, the behaviour, against a real owner: a set of two and its production are created
-- whole, every receipt naming the production; the same call again replays the same ids and the
-- same production and writes nothing; the same set under that operation with another production
-- (another hash) is refused; and a delivery whose production fails to insert (its id repeats a
-- graphic's, the injected failure) leaves nothing at all - no claim, no record, no receipt, no
-- production. Everything is rolled back by a sentinel the block catches, so nothing here deletes.
-- Skipped on an instance with no account yet (0036's pattern).
do $$
declare
  v_owner  uuid;
  v_op     uuid := '00000000-0094-4000-8000-000000000001';
  v_failed uuid := '00000000-0094-4000-8000-000000000002';
  v_a      uuid := '00000000-0094-4000-8000-00000000000a';
  v_b      uuid := '00000000-0094-4000-8000-00000000000b';
  v_c      uuid := '00000000-0094-4000-8000-00000000000c';
  v_p      uuid := '00000000-0094-4000-8000-0000000000aa';
  v_hash   text := repeat('c', 64);
  v_set    jsonb;
  v_prod   jsonb;
  v_answer jsonb;
begin
  select id into v_owner from auth.users limit 1;
  if v_owner is null then
    raise notice '0094 production self-check skipped: no account on this instance';
    return;
  end if;
  begin
    v_set := jsonb_build_array(
      jsonb_build_object('id', v_a, 'name', '0094 self-check A', 'body', jsonb_build_object('id', v_a)),
      jsonb_build_object('id', v_b, 'name', '0094 self-check B', 'body', jsonb_build_object('id', v_b)));
    v_prod := jsonb_build_object('id', v_p, 'name', '0094 self-check', 'body', jsonb_build_object('id', v_p, 'name', '0094 self-check'));
    v_answer := public.agent_deliver_production(v_owner, null, v_op, v_hash, v_set, v_prod);
    if v_answer ->> 'outcome' <> 'created' or v_answer -> 'ids' <> jsonb_build_array(v_a, v_b)
       or (v_answer ->> 'production')::uuid is distinct from v_p then
      raise exception '0094: a new production delivery was not created whole: %', v_answer;
    end if;
    if not exists (select 1 from public.documents d where d.id = v_p and d.user_id = v_owner and d.kind = 'show' and not d.deleted)
       or (select count(*) from public.agent_deliveries d where d.operation_id = v_op and d.user_id = v_owner and d.production_id = v_p) <> 2 then
      raise exception '0094: the production or its receipts are missing';
    end if;

    v_answer := public.agent_deliver_production(v_owner, null, v_op, v_hash, v_set,
      jsonb_build_object('id', v_c, 'name', '0094 self-check', 'body', jsonb_build_object('id', v_c)));
    if v_answer ->> 'outcome' <> 'replayed' or v_answer -> 'ids' <> jsonb_build_array(v_a, v_b)
       or (v_answer ->> 'production')::uuid is distinct from v_p then
      raise exception '0094: the same delivery again did not replay the same production: %', v_answer;
    end if;
    if exists (select 1 from public.documents d where d.id = v_c)
       or (select count(*) from public.documents d where d.user_id = v_owner and d.kind = 'show' and d.name = '0094 self-check') <> 1 then
      raise exception '0094: a replay made a second production';
    end if;

    v_answer := public.agent_deliver_production(v_owner, null, v_op, repeat('d', 64), v_set, v_prod);
    if v_answer ->> 'outcome' <> 'conflict' then
      raise exception '0094: another production under one operation was not refused: %', v_answer;
    end if;

    -- The injected failure: the production's id repeats the first graphic's, so its insert fails.
    begin
      perform public.agent_deliver_production(v_owner, null, v_failed, v_hash,
        jsonb_build_array(jsonb_build_object('id', v_c, 'name', '0094 self-check C', 'body', '{}'::jsonb)),
        jsonb_build_object('id', v_c, 'name', '0094 failing', 'body', jsonb_build_object('id', v_c)));
      raise exception '0094: a delivery whose production failed was accepted';
    exception when unique_violation then
      null;
    end;
    if exists (select 1 from public.agent_operations o where o.operation_id = v_failed)
       or exists (select 1 from public.documents d where d.id = v_c)
       or exists (select 1 from public.agent_deliveries d where d.operation_id = v_failed) then
      raise exception '0094: a failed production delivery left part of itself behind';
    end if;

    raise exception '0094 self-check rollback';
  exception when raise_exception then
    if sqlerrm <> '0094 self-check rollback' then raise; end if;
  end;
end $$;
