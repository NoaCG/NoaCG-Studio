-- DELIVERY RECEIPTS - what a coding agent delivered to an account, and what became of it
-- (docs/AGENT_SAVE.md §9, docs/work-specs/agent-delivery/spec.md Phase 2).
--
-- `noacg save` (0050) and `noacg pack --save` (0065) answer with an id and a link, and nothing
-- could ask about that id afterwards: a key may create, never read, and installing a waiting
-- package deleted its row, so "is it really there?" had no answer. One row here per delivered
-- resource is that answer. The server writes it after the library or package INSERT, with the
-- operation id the CLI sent and the key that wrote it; `GET /api/me/deliveries` reads it back for
-- THAT key only (api/_lib/me/deliveries.ts), so a key learns the state of what it created and
-- nothing else in the library. Installing or dismissing a package on Home settles it through
-- `agent_package_settle`, which deletes the waiting row and records the outcome (and the
-- production Install made) in one statement - the durable install receipt.
--
-- ACCESS POSTURE. The service role writes (the function at api/me). A signed-in user may READ
-- their own receipts and nothing else; there is no browser insert, update or delete, so a receipt
-- says what the server saw. `agent_package_settle` is the service role's alone: the browser asks
-- the function, which checks the session, and the function calls it.
--
-- Additive: one new table, its indexes and one function. Older studios still delete a waiting
-- row directly; its receipt then stays `pending_install` while the package is gone, and the
-- readback reports that honestly as `missing`. Revert: drop the function and the table.
set lock_timeout = '2s';
set statement_timeout = '30s';

create table if not exists public.agent_deliveries (
  id             uuid primary key default gen_random_uuid(),
  -- The operation the CLI named before it wrote (`x-noacg-operation`), or one the server minted.
  -- Several resources may share one operation; a set delivery (Phase 3) is exactly that.
  operation_id   uuid not null,
  user_id        uuid not null references auth.users (id) on delete cascade,
  -- The agent key that wrote it; null for a session or a key since deleted. Readback by a key is
  -- scoped to this column, which is what keeps a key from reading the rest of the library.
  key_id         uuid references public.agent_keys (id) on delete set null,
  kind           text not null check (kind in ('graphic', 'package')),
  -- The library record (documents.id) or the waiting package (agent_packages.id).
  resource_id    uuid not null,
  state          text not null check (state in ('saved', 'pending_install', 'installed', 'dismissed')),
  -- The production Install created from a package (the studio's own id, a uuid).
  production_id  uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (kind, resource_id)
);

create index if not exists agent_deliveries_user_operation_idx
  on public.agent_deliveries (user_id, operation_id);
-- The readback by resource id (the unique index leads with `kind`, which the readback lacks).
create index if not exists agent_deliveries_user_resource_idx
  on public.agent_deliveries (user_id, resource_id);
-- Covers the key foreign key (the advisors' unindexed_foreign_keys) and the per-key readback.
create index if not exists agent_deliveries_key_idx
  on public.agent_deliveries (key_id);

alter table public.agent_deliveries enable row level security;

create policy "agent_deliveries_select_own" on public.agent_deliveries
  for select to authenticated using ((select auth.uid()) = user_id);

-- Stated, not inherited (0051), and the revoke first (0052).
revoke all on table public.agent_deliveries from public, anon, authenticated;
grant select on table public.agent_deliveries to authenticated;
grant select, insert, update on table public.agent_deliveries to service_role;

-- Install or Dismiss: the waiting row goes and the receipt says what happened, in one statement.
-- `p_production` is the production Install made; null means the user dismissed the package.
-- A package uploaded before this table existed has no receipt yet, and gets one here. Returns
-- whether the user's package was still waiting (false: unknown, someone else's, or already gone).
create or replace function public.agent_package_settle(p_user_id uuid, p_package_id uuid, p_production_id uuid)
returns boolean
language sql security invoker set search_path = '' as $$
  with gone as (
    delete from public.agent_packages p
     where p.id = p_package_id and p.user_id = p_user_id
    returning p.id, p.user_id
  ), settled as (
    insert into public.agent_deliveries (operation_id, user_id, kind, resource_id, state, production_id)
    select gen_random_uuid(), gone.user_id, 'package', gone.id,
           case when p_production_id is null then 'dismissed' else 'installed' end, p_production_id
      from gone
    on conflict (kind, resource_id) do update
       set state = excluded.state,
           production_id = excluded.production_id,
           updated_at = now()
     where public.agent_deliveries.user_id = excluded.user_id
    returning 1
  )
  select exists (select 1 from gone);
$$;
revoke execute on function public.agent_package_settle(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.agent_package_settle(uuid, uuid, uuid) to service_role;

-- Self-check: the posture, and CALL the function.
do $$
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'agent_deliveries' and c.relrowsecurity
  ) then
    raise exception '0092: agent_deliveries missing or RLS off';
  end if;
  if not has_table_privilege('authenticated', 'public.agent_deliveries', 'SELECT') then
    raise exception '0092: authenticated cannot read its own receipts';
  end if;
  if has_table_privilege('authenticated', 'public.agent_deliveries', 'INSERT')
     or has_table_privilege('authenticated', 'public.agent_deliveries', 'UPDATE')
     or has_table_privilege('authenticated', 'public.agent_deliveries', 'DELETE') then
    raise exception '0092: a browser could write a delivery receipt';
  end if;
  if has_table_privilege('anon', 'public.agent_deliveries', 'SELECT')
     or has_table_privilege('anon', 'public.agent_deliveries', 'INSERT') then
    raise exception '0092: anon holds a privilege on agent_deliveries';
  end if;
  if has_function_privilege('anon', 'public.agent_package_settle(uuid, uuid, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.agent_package_settle(uuid, uuid, uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.agent_package_settle(uuid, uuid, uuid)', 'execute') then
    raise exception '0092: only service_role may execute agent_package_settle';
  end if;
  if public.agent_package_settle('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', null) then
    raise exception '0092: agent_package_settle settled a package nobody owns';
  end if;
end $$;

-- Self-check, the behaviour: a real owner's throwaway package is installed through the function,
-- which must delete the waiting row and leave an `installed` receipt naming the production; a
-- second settle finds nothing. Everything it wrote is rolled back by raising a sentinel the block
-- catches, so no row is left and nothing here deletes. Skipped on an instance with no account yet
-- (0036's pattern), where there is nobody to own the package.
do $$
declare
  v_owner      uuid;
  v_package    uuid := '00000000-0092-4000-8000-000000000092';
  v_production uuid := '00000000-0092-4000-8000-000000000093';
begin
  select id into v_owner from auth.users limit 1;
  if v_owner is null then
    raise notice '0092 settle self-check skipped: no account on this instance';
    return;
  end if;
  begin
  insert into public.agent_packages (id, user_id, name, graphic_count, body)
    values (v_package, v_owner, '0092 self-check', 1, '{}'::jsonb);
  if not public.agent_package_settle(v_owner, v_package, v_production) then
    raise exception '0092: agent_package_settle did not settle its owner''s waiting package';
  end if;
  if exists (select 1 from public.agent_packages p where p.id = v_package) then
    raise exception '0092: agent_package_settle left the waiting row behind';
  end if;
  if not exists (
    select 1 from public.agent_deliveries d
     where d.kind = 'package' and d.resource_id = v_package and d.user_id = v_owner
       and d.state = 'installed' and d.production_id = v_production
  ) then
    raise exception '0092: agent_package_settle recorded no installed receipt naming the production';
  end if;
  if public.agent_package_settle(v_owner, v_package, null) then
    raise exception '0092: agent_package_settle settled the same package twice';
  end if;
  raise exception '0092 self-check rollback';
  exception when raise_exception then
    if sqlerrm <> '0092 self-check rollback' then raise; end if;
  end;
end $$;
