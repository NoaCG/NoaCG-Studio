-- What a chat client's CONNECTOR may do for a user (docs/REMOTE_MCP_PLAN.md, key decision 3).
--
-- A chat client (Claude.ai, ChatGPT) signs in through the Supabase Auth OAuth server, and its
-- token proves who the user is and nothing more: OAuth scopes there are identity-only. What the
-- connector may do is NoaCG's own decision, recorded here when the user presses Allow on NoaCG's
-- consent page (`/?authorization_id=`): one row per user and OAuth client, carrying the NoaCG
-- permissions the page showed (`graphics:read`, `graphics:create`). The MCP route resolves a
-- token carrying `client_id` to a principal only through a LIVE row here
-- (api/_lib/principal.ts): no row, or a revoked one, is anonymous. Revoke in Settings sets
-- `revoked_at` (effective on the next call, because every call reads this row) and asks Supabase
-- Auth to end the client's sessions, so its refresh token dies too.
--
-- ACCESS POSTURE: RLS on and NO policies - the service role (the function at api/me) is the only
-- reader and writer, exactly as agent_keys (0050). A connector token cannot reach this table
-- either way: its database role (0089) holds no privileges. The resolve RPC takes its lookup
-- values in the RPC body, never in a URL query string (the 0047 rule), and stamps last_used_at in
-- the same statement.
--
-- Additive: one new table, its indexes and one function. Revert: drop the function and the table.
set lock_timeout = '2s';
set statement_timeout = '30s';

create table if not exists public.connector_grants (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  -- The OAuth client the grant is for, as Supabase Auth names it (`client_id` in the token).
  client_id     text not null,
  -- What the client called itself at registration ("Claude"); display only, self-declared.
  client_name   text not null default '',
  -- NoaCG permissions (src/entitlements/permissions.ts CONNECTOR_PERMISSIONS). Live playout is
  -- refused structurally, whatever a later consent page offers (NEVER_ON_AGENT_KEYS).
  permissions   text[] not null default '{}'
                check (not ('playout:operate' = any (permissions))),
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);
-- One live grant per user and client; a revoked row stays as the record of what was allowed.
create unique index if not exists connector_grants_live_idx
  on public.connector_grants (user_id, client_id) where revoked_at is null;
alter table public.connector_grants enable row level security;
-- No policies on purpose: service role only.

-- Stated, not inherited (0051), and the revoke first (0052).
revoke all on table public.connector_grants from public, anon, authenticated;
grant select, insert, update on table public.connector_grants to service_role;

-- A presented connector token -> its live grant, and the last-used stamp. A revoked grant
-- resolves to nothing: that is how a revoke takes effect on the next call.
create or replace function public.connector_grant_resolve(p_user_id uuid, p_client_id text)
returns table (id uuid, permissions text[])
language plpgsql security definer set search_path = '' as $$
begin
  return query
    update public.connector_grants g
       set last_used_at = now()
     where g.user_id = p_user_id
       and g.client_id = p_client_id
       and p_user_id is not null
       and p_client_id is not null
       and g.revoked_at is null
    returning g.id, g.permissions;
end $$;
revoke execute on function public.connector_grant_resolve(uuid, text) from public, anon, authenticated;
grant execute on function public.connector_grant_resolve(uuid, text) to service_role;

-- Self-check: CALL the body and prove the posture, not just that the DDL parsed.
do $$
declare
  v_count int;
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'connector_grants' and c.relrowsecurity
  ) then
    raise exception '0090: connector_grants missing or RLS off';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'connector_grants') then
    raise exception '0090: connector_grants must carry no client policies (service role only)';
  end if;
  if has_table_privilege('anon', 'public.connector_grants', 'select')
     or has_table_privilege('authenticated', 'public.connector_grants', 'select') then
    raise exception '0090: a client role can read connector_grants';
  end if;
  select count(*) into v_count from public.connector_grant_resolve(null, null);
  if v_count <> 0 then raise exception '0090: connector_grant_resolve answered a null lookup'; end if;
  select count(*) into v_count
    from public.connector_grant_resolve('00000000-0000-0000-0000-000000000000', 'self-check-no-such-client');
  if v_count <> 0 then raise exception '0090: connector_grant_resolve answered an unknown grant'; end if;
  if has_function_privilege('anon', 'public.connector_grant_resolve(uuid, text)', 'execute')
     or has_function_privilege('authenticated', 'public.connector_grant_resolve(uuid, text)', 'execute')
     or not has_function_privilege('service_role', 'public.connector_grant_resolve(uuid, text)', 'execute') then
    raise exception '0090: only service_role may execute connector_grant_resolve';
  end if;
end $$;
