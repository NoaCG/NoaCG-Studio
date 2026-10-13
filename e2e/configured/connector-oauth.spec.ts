// covers: supabase/config.toml, supabase/migrations/0089_connector_token_role.sql, supabase/migrations/0091_connector_token_account_lock.sql, scripts/connector-oauth-spike.mjs
//
// THE REMOTE MCP CONNECTOR'S SIGN-IN, on the runner's local stack (docs/REMOTE_MCP_PLAN.md, AC-1
// and key decision 4). A chat client registers itself, a throwaway account approves it, and the
// token it gets carries `client_id`, is signed ES256, and holds the `noacg_connector` role, which
// PostgREST and Storage refuse outright; the same reads with a first-party token still work, and
// a refresh keeps both. THE ACCOUNT LOCK (issue #1083, migration 0091): the same token is refused
// by Supabase Auth's own account endpoints - the user read and changed (metadata and password),
// MFA enrolment, the client's grants, another client's request read and approved, sign-out - and
// the account's metadata and password are unchanged afterwards. The flow is
// scripts/connector-oauth-spike.mjs, which a person runs against `npx supabase@2.111.0 start` the
// same way; this spec keeps it passing on every landing and prints its evidence into the run log.
// No page: what is under test is Supabase Auth and the database. It skips on hosted staging
// (hosted-latency.yml), whose Auth configuration nothing here touches, and runs on a hosted
// preview branch only when NOACG_CONNECTOR_BRANCH_REF names it.

import { test, expect } from '@playwright/test';
import { failedChecks, isConnectorTestStack, runConnectorSpike } from '../../scripts/connector-oauth-spike.mjs';
import { SERVICE_ROLE_KEY, SUPABASE_URL } from './_helpers';

const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';

test('a chat client signs in with PKCE and its token reaches no table, function or object directly', async () => {
  test.skip(!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY, 'needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY');
  test.skip(!isConnectorTestStack(SUPABASE_URL), 'local stack or a named preview branch only: the spike creates OAuth clients');
  const lines: string[] = [];
  let report: Awaited<ReturnType<typeof runConnectorSpike>>;
  try {
    report = await runConnectorSpike({
      apiUrl: SUPABASE_URL,
      anonKey: ANON_KEY,
      serviceKey: SERVICE_ROLE_KEY,
      log: (line: string) => lines.push(line),
    });
  } finally {
    // Printed even when a step throws, so the log says how far the flow got.
    console.log(`connector OAuth spike:\n${lines.join('\n')}`);
  }
  await test.info().attach('connector-oauth-spike.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  const failed = failedChecks(report);
  expect(failed, lines.join('\n')).toEqual([]);
});
