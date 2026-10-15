-- GRAPHIC SETS - several graphics delivered to the library as ONE idempotent operation
-- (docs/AGENT_SAVE.md §10, docs/work-specs/agent-delivery/spec.md Phase 3).
--
-- `noacg save a b c` sends every graphic of a set in one request under an operation id the CLI
-- named before it wrote. What has to hold is that a set arrives whole or not at all, and that
-- sending it again - after a timeout, a lost answer or a restarted agent - never puts a second copy
-- in the library. One function call is one transaction, so `agent_deliver_graphics` claims the
-- operation, inserts every library record and records every receipt together; any failure rolls
-- all of it back, the claim included, and the same request may simply be sent again.
--
-- THE CLAIM. `agent_operations` holds one row per (account, operation): which key sent it and a
-- hash of what it sent. A second call under the same operation with the same hash and key is a
-- replay and answers the first call's library ids in their order; a different hash or another key
-- is a conflict and writes nothing. Two identical calls at once serialise on the primary key: the
-- second waits for the first to commit and then replays it.
--
-- The hash is the API's (api/_lib/me/graphicSets.ts), over the records as stored minus what the
-- server mints (ids, timestamps), so the same packages built again give the same hash. The function
-- never reads the graphic's code; it stores the bodies the API already shape-checked.
--
-- ACCESS POSTURE. Service role only: the API checks the credential and its `graphics:create`
-- permission, then calls this. Nothing is granted to `anon` or `authenticated`; the browser never
-- sees the claim table (receipts stay readable through `agent_deliveries`, 0092).
--
-- Additive: one table, one nullable column on `agent_deliveries` (the item's place in its set, so a
-- readback lists a set in the order it was sent; null for a single save), one function. Revert:
-- drop the function and the table; the column is harmless left in place.
set lock_timeout = '2s';
set statement_timeout = '30s';

alter table public.agent_deliveries add column if not exists position integer;

create table if not exists public.agent_operations (
  user_id       uuid not null references auth.users (id) on delete cascade,
  -- Named by the CLI before it wrote (`x-noacg-operation`); unique per account.
  operation_id  uuid not null,
  -- The agent key that sent it; null for a session or a key since deleted.
  key_id        uuid references public.agent_keys (id) on delete set null,
  -- sha256 hex of the payload as the API stored it, minus server-minted ids and timestamps.
  payload_hash  text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  item_count    integer not null check (item_count between 1 and 40),
  created_at    timestamptz not null default now(),
  primary key (user_id, operation_id)
);

-- Covers the key foreign key (the advisors' unindexed_foreign_keys).
create index if not exists agent_operations_key_idx on public.agent_operations (key_id);

alter table public.agent_operations enable row level security;

-- Stated, not inherited (0051), and the revoke first (0052). No policy: nobody but the service
-- role reads or writes it.
revoke all on table public.agent_operations from public, anon, authenticated;
grant select, insert on table public.agent_operations to service_role;

-- Deliver a set: returns { outcome: 'created' | 'replayed' | 'conflict', ids: [library ids] }.
-- `p_graphics` is the shaped records in order, each { id, name, body }, ids minted by the API.
create or replace function public.agent_deliver_graphics(
  p_user_id uuid,
  p_key_id uuid,
  p_operation_id uuid,
  p_payload_hash text,
  p_graphics jsonb
)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_count integer;
  v_key   uuid;
  v_hash  text;
  v_ids   jsonb;
begin
  if p_user_id is null or p_operation_id is null or jsonb_typeof(p_graphics) is distinct from 'array' then
    raise exception 'agent_deliver_graphics: user, operation and an array of graphics are required';
  end if;
  v_count := jsonb_array_length(p_graphics);
  if v_count < 1 or v_count > 40 then
    raise exception 'agent_deliver_graphics: a set holds 1 to 40 graphics, not %', v_count;
  end if;

  -- An operation id a single save already used (0092 receipts with no claim) is not this set's.
  if exists (
    select 1 from public.agent_deliveries d
     where d.user_id = p_user_id and d.operation_id = p_operation_id
  ) and not exists (
    select 1 from public.agent_operations o
     where o.user_id = p_user_id and o.operation_id = p_operation_id
  ) then
    return jsonb_build_object('outcome', 'conflict', 'ids', '[]'::jsonb);
  end if;

  insert into public.agent_operations (user_id, operation_id, key_id, payload_hash, item_count)
  values (p_user_id, p_operation_id, p_key_id, p_payload_hash, v_count)
  on conflict (user_id, operation_id) do nothing;

  if not found then
    select o.key_id, o.payload_hash into v_key, v_hash
      from public.agent_operations o
     where o.user_id = p_user_id and o.operation_id = p_operation_id;
    if v_hash is distinct from p_payload_hash or v_key is distinct from p_key_id then
      return jsonb_build_object('outcome', 'conflict', 'ids', '[]'::jsonb);
    end if;
    select coalesce(jsonb_agg(d.resource_id order by d.position), '[]'::jsonb) into v_ids
      from public.agent_deliveries d
     where d.user_id = p_user_id and d.operation_id = p_operation_id and d.kind = 'graphic';
    return jsonb_build_object('outcome', 'replayed', 'ids', v_ids);
  end if;

  insert into public.documents (id, user_id, kind, name, body, deleted)
  select (g.item ->> 'id')::uuid, p_user_id, 'graphic', g.item ->> 'name', g.item -> 'body', false
    from jsonb_array_elements(p_graphics) with ordinality as g (item, ord)
   order by g.ord;

  insert into public.agent_deliveries (operation_id, user_id, key_id, kind, resource_id, state, position)
  select p_operation_id, p_user_id, p_key_id, 'graphic', (g.item ->> 'id')::uuid, 'saved', (g.ord - 1)::integer
    from jsonb_array_elements(p_graphics) with ordinality as g (item, ord);

  select coalesce(jsonb_agg((g.item ->> 'id')::uuid order by g.ord), '[]'::jsonb) into v_ids
    from jsonb_array_elements(p_graphics) with ordinality as g (item, ord);
  return jsonb_build_object('outcome', 'created', 'ids', v_ids);
end;
$$;
revoke execute on function public.agent_deliver_graphics(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.agent_deliver_graphics(uuid, uuid, uuid, text, jsonb) to service_role;

-- Self-check: the posture.
do $$
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'agent_operations' and c.relrowsecurity
  ) then
    raise exception '0093: agent_operations missing or RLS off';
  end if;
  if has_table_privilege('authenticated', 'public.agent_operations', 'SELECT')
     or has_table_privilege('authenticated', 'public.agent_operations', 'INSERT')
     or has_table_privilege('anon', 'public.agent_operations', 'SELECT')
     or has_table_privilege('anon', 'public.agent_operations', 'INSERT') then
    raise exception '0093: a browser role holds a privilege on agent_operations';
  end if;
  if has_function_privilege('anon', 'public.agent_deliver_graphics(uuid, uuid, uuid, text, jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.agent_deliver_graphics(uuid, uuid, uuid, text, jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.agent_deliver_graphics(uuid, uuid, uuid, text, jsonb)', 'execute') then
    raise exception '0093: only service_role may execute agent_deliver_graphics';
  end if;
end $$;

-- Self-check, the behaviour, against a real owner: a set of two is created whole; the same call
-- again replays the same ids and writes nothing; a changed payload under the operation is refused;
-- and a set that fails on its second record (a duplicate id, the injected failure) leaves nothing
-- at all - no claim, no record, no receipt - so it can be sent again. Everything is rolled back by
-- a sentinel the block catches, so nothing here deletes. Skipped on an instance with no account yet
-- (0036's pattern).
do $$
declare
  v_owner  uuid;
  v_op     uuid := '00000000-0093-4000-8000-000000000001';
  v_failed uuid := '00000000-0093-4000-8000-000000000002';
  v_a      uuid := '00000000-0093-4000-8000-00000000000a';
  v_b      uuid := '00000000-0093-4000-8000-00000000000b';
  v_c      uuid := '00000000-0093-4000-8000-00000000000c';
  v_hash   text := repeat('a', 64);
  v_set    jsonb;
  v_answer jsonb;
begin
  select id into v_owner from auth.users limit 1;
  if v_owner is null then
    raise notice '0093 set self-check skipped: no account on this instance';
    return;
  end if;
  begin
    v_set := jsonb_build_array(
      jsonb_build_object('id', v_a, 'name', '0093 self-check A', 'body', jsonb_build_object('id', v_a)),
      jsonb_build_object('id', v_b, 'name', '0093 self-check B', 'body', jsonb_build_object('id', v_b)));
    v_answer := public.agent_deliver_graphics(v_owner, null, v_op, v_hash, v_set);
    if v_answer ->> 'outcome' <> 'created' or v_answer -> 'ids' <> jsonb_build_array(v_a, v_b) then
      raise exception '0093: a new set was not created whole: %', v_answer;
    end if;
    if (select count(*) from public.documents d where d.id in (v_a, v_b) and d.user_id = v_owner and d.kind = 'graphic') <> 2
       or (select count(*) from public.agent_deliveries d where d.operation_id = v_op and d.user_id = v_owner and d.state = 'saved') <> 2 then
      raise exception '0093: the set''s records or receipts are missing';
    end if;

    v_answer := public.agent_deliver_graphics(v_owner, null, v_op, v_hash, v_set);
    if v_answer ->> 'outcome' <> 'replayed' or v_answer -> 'ids' <> jsonb_build_array(v_a, v_b) then
      raise exception '0093: the same set again did not replay the same ids: %', v_answer;
    end if;
    if (select count(*) from public.agent_deliveries d where d.operation_id = v_op and d.user_id = v_owner) <> 2 then
      raise exception '0093: a replay wrote again';
    end if;

    v_answer := public.agent_deliver_graphics(v_owner, null, v_op, repeat('b', 64), v_set);
    if v_answer ->> 'outcome' <> 'conflict' then
      raise exception '0093: a changed payload under one operation was not refused: %', v_answer;
    end if;

    -- The injected failure: the second record repeats the first's id, so its insert fails.
    begin
      perform public.agent_deliver_graphics(v_owner, null, v_failed, v_hash, jsonb_build_array(
        jsonb_build_object('id', v_c, 'name', '0093 self-check C', 'body', '{}'::jsonb),
        jsonb_build_object('id', v_c, 'name', '0093 self-check C again', 'body', '{}'::jsonb)));
      raise exception '0093: a set with a failing record was accepted';
    exception when unique_violation then
      null;
    end;
    if exists (select 1 from public.agent_operations o where o.operation_id = v_failed)
       or exists (select 1 from public.documents d where d.id = v_c)
       or exists (select 1 from public.agent_deliveries d where d.operation_id = v_failed) then
      raise exception '0093: a failed set left part of itself behind';
    end if;

    raise exception '0093 self-check rollback';
  exception when raise_exception then
    if sqlerrm <> '0093 self-check rollback' then raise; end if;
  end;
end $$;
