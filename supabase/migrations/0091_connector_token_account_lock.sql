-- Connector tokens cannot reach Supabase Auth's account endpoints (issue #1083,
-- docs/REMOTE_MCP_PLAN.md phase 5).
--
-- 0089 closed the database to a token issued to an OAuth client: its role `noacg_connector` is
-- one PostgREST and Storage cannot switch to. Auth's own endpoints never read the role. Every
-- endpoint that acts as the signed-in user (GET and PUT /user, so password and email change;
-- /factors, /logout, /user/oauth/grants, and the consent endpoint that approves another client)
-- first loads the user by the token's `sub` and the session by its `session_id`. So on a token
-- that carries `client_id`, this hook now also
--
--   * moves the user id to `noacg_uid`, the claim NoaCG's /mcp reads (api/_lib/connectorAuth.ts
--     `connectorUserId`), and sets `sub` to `noacg-connector:<user id>`, which is not a UUID:
--     Auth answers `400 bad_jwt "sub claim must be a UUID"` before it reads anything;
--   * sets `session_id` to a fresh random UUID, which names no session. Never empty and never the
--     nil UUID: Auth reads either as "no session" and would still serve the user.
--
-- `client_id`, `role`, `aal`, `amr` and the rest pass through. A refresh at /oauth/token reads
-- the refresh token, not the access token, and runs this hook again, so refreshed tokens are
-- rewritten the same way. The ID token is not an access token and is not touched. NoaCG's /mcp
-- verifies a connector token locally against the issuer's JWKS and a live `connector_grants` row
-- (phase 2), never by asking Auth who it is, so it keeps working. First-party sessions (no
-- `client_id`) pass through unchanged.
--
-- On a hosted project the hook stays off until the owner enables it (the runbook in
-- docs/REMOTE_MCP_PLAN.md); until then this only replaces an unused function. Replaces 0089's
-- function in place, same signature; VOLATILE because it draws a random UUID. Revert: re-apply
-- 0089's function body (the connector then stops working at /mcp, which requires `noacg_uid`).
set lock_timeout = '2s';
set statement_timeout = '30s';

create or replace function public.connector_access_token(event jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  claims jsonb := event -> 'claims';
begin
  if nullif(claims ->> 'client_id', '') is not null then
    claims := claims || jsonb_build_object(
      'role', 'noacg_connector',
      'noacg_uid', claims ->> 'sub',
      'sub', 'noacg-connector:' || (claims ->> 'sub'),
      'session_id', pg_catalog.gen_random_uuid()::text
    );
  end if;
  return jsonb_build_object('claims', claims);
end;
$$;

grant execute on function public.connector_access_token(jsonb) to supabase_auth_admin;
revoke execute on function public.connector_access_token(jsonb) from public, anon, authenticated;

-- Self-check: CALL the hook for both kinds of token.
do $$
declare
  first_party jsonb := '{"claims": {"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated", "aud": "authenticated", "session_id": "00000000-0000-0000-0000-0000000000a1"}}';
  connector jsonb := '{"claims": {"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated", "aud": "authenticated", "session_id": "00000000-0000-0000-0000-0000000000a1", "client_id": "00000000-0000-0000-0000-0000000000c1"}}';
  issued jsonb := public.connector_access_token(connector) -> 'claims';
  again jsonb := public.connector_access_token(connector) -> 'claims';
begin
  -- IS DISTINCT FROM, never <>: a key the hook dropped compares as NULL and would pass.
  if public.connector_access_token(first_party) -> 'claims' is distinct from first_party -> 'claims' then
    raise exception '0091: a first-party token''s claims must pass through unchanged';
  end if;
  if issued ->> 'role' is distinct from 'noacg_connector'
     or issued ->> 'client_id' is distinct from '00000000-0000-0000-0000-0000000000c1'
     or issued ->> 'noacg_uid' is distinct from '00000000-0000-0000-0000-000000000001'
     or issued ->> 'aud' is distinct from 'authenticated' then
    raise exception '0091: a connector token must get role noacg_connector, keep client_id and aud, and carry the user in noacg_uid';
  end if;
  -- Auth parses `sub` as a UUID first. Its parser takes 32, 36, 38, 41 or 45 characters (bare,
  -- hyphenated, braced, `urn:uuid:`); this one is 52 and parses as none of them.
  if issued ->> 'sub' is distinct from 'noacg-connector:00000000-0000-0000-0000-000000000001' then
    raise exception '0091: a connector token''s sub must be noacg-connector:<user id>, which is not a UUID';
  end if;
  if issued ->> 'session_id' is null
     or issued ->> 'session_id' in ('', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a1')
     or (issued ->> 'session_id')::uuid is null
     or issued ->> 'session_id' = again ->> 'session_id' then
    raise exception '0091: a connector token''s session_id must be a fresh UUID naming no session';
  end if;
  if not has_function_privilege('supabase_auth_admin', 'public.connector_access_token(jsonb)', 'execute')
     or has_function_privilege('anon', 'public.connector_access_token(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.connector_access_token(jsonb)', 'execute') then
    raise exception '0091: only supabase_auth_admin may execute connector_access_token';
  end if;
end;
$$;
