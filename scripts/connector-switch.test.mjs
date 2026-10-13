// The owner's connector switch against a fake Management API, Auth and site: no network.
import assert from 'node:assert/strict';
import test from 'node:test';

import { main, projectRefs, PRODUCTION_SITE, STEPS } from './connector-switch.mjs';

const PROD = 'kprolrchuldgfrzspthy';
const STAGING = 'garafohbzmsybtysxphb';
const BRANCH = 'catyisoerledmvnhturi';
const FILE_ENV = { VITE_SUPABASE_URL: `https://${PROD}.supabase.co`, SUPABASE_ACCESS_TOKEN: 'sbp_test\r' };

const OFF_CONFIG = () => ({
  oauth_server_enabled: false, oauth_server_allow_dynamic_registration: false, oauth_server_authorization_path: null,
  hook_custom_access_token_enabled: false, hook_custom_access_token_uri: null,
  ...Object.fromEntries(Object.keys(STEPS.on[0][1]).map((k) => [k, false])),
  jwt_exp: 3600,
});

/**
 * A stateful fake: per-ref Auth config with the Management API's pairing rule and its habit of
 * ignoring unknown keys, discovery that follows the config, and a site that follows production.
 */
function fakeWorld({ refuse = null, hold = {}, site = null, discovery = null, algorithm = 'ES256', branches = [BRANCH], lagMs = 0 } = {}) {
  const configs = { [PROD]: OFF_CONFIG(), [STAGING]: OFF_CONFIG(), [BRANCH]: OFF_CONFIG() };
  const calls = [];
  let clock = 0;
  const stale = {}; // ref -> { config, until }: like the API, GET config may lag a PATCH
  const out = [];
  const err = [];
  const reply = (status, body, pretty = false) => ({
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body, null, pretty ? 2 : 0)),
  });
  const fetch = async (url, { method, headers, body }) => {
    const sent = body ? JSON.parse(body) : undefined;
    calls.push({ method, url, body: sent, auth: headers?.Authorization });
    let m = /^https:\/\/api\.supabase\.com\/v1\/projects\/([a-z]+)\/(.*)$/.exec(url);
    if (m) {
      const [, ref, rest] = m;
      if (rest === 'branches') return reply(200, branches.map((b) => ({ name: `rehearsal-${b}`, project_ref: b, is_default: false })).concat({ name: 'main', project_ref: PROD, is_default: true }));
      if (rest === 'config/auth/signing-keys') return reply(200, { keys: [{ algorithm: 'HS256', status: 'previously_used' }, { algorithm, status: 'in_use' }] });
      if (rest === 'config/auth' && method === 'GET') return reply(200, clock < (stale[ref]?.until ?? 0) ? stale[ref].config : configs[ref], true);
      if (rest === 'config/auth' && method === 'PATCH') {
        const refusal = refuse?.(sent);
        if (refusal) return reply(400, { message: refusal });
        if (('oauth_server_enabled' in sent) !== ('oauth_server_authorization_path' in sent)) {
          return reply(400, { message: 'Both OAUTH_SERVER_ENABLED and OAUTH_SERVER_AUTHORIZATION_PATH must be provided together when updating OAuth configuration' });
        }
        if (lagMs) stale[ref] = { config: structuredClone(configs[ref]), until: clock + lagMs };
        for (const [k, v] of Object.entries(sent)) if (Object.hasOwn(configs[ref], k)) configs[ref][k] = hold[k] ?? v;
        return reply(200, configs[ref]);
      }
    }
    m = /^https:\/\/([a-z]+)\.supabase\.co\/auth\/v1\/\.well-known\/oauth-authorization-server$/.exec(url);
    if (m) {
      const c = configs[m[1]];
      const on = discovery ? discovery(clock) : c.oauth_server_enabled;
      return on ? reply(200, { issuer: 'x', ...(c.oauth_server_allow_dynamic_registration ? { registration_endpoint: 'x/register' } : {}) }) : reply(404, { message: 'not found' });
    }
    if (url === `${PRODUCTION_SITE}/mcp`) return reply(site ? site(clock) : configs[PROD].oauth_server_enabled ? 401 : 503, {});
    throw new Error(`unexpected request ${method} ${url}`);
  };
  const io = (shellEnv = {}, fileEnv = FILE_ENV) => ({
    fetch, fileEnv, shellEnv, envPath: 'C:/checkout/.env',
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  });
  return { configs, calls, out, err, io, get clock() { return clock; } };
}

const patches = (world) => world.calls.filter((c) => c.method === 'PATCH');
const touchedRefs = (world) => new Set(world.calls.map((c) => /(?:projects\/|https:\/\/)([a-z]{20})[./]/.exec(c.url)?.[1]).filter(Boolean));

test('staging and production map to refs through supabase-projects, and the shell may not disagree with .env', () => {
  assert.deepEqual(projectRefs(FILE_ENV, {}), { production: PROD, staging: STAGING });
  assert.deepEqual(projectRefs(FILE_ENV, { STAGING_SUPABASE_PROJECT_REF: 'abcdefghijabcdefghij' }).staging, 'abcdefghijabcdefghij');
  assert.throws(() => projectRefs(FILE_ENV, { VITE_SUPABASE_URL: `https://${BRANCH}.supabase.co` }), /ambiguous/);
  assert.equal(projectRefs({}, {}).production, '');
});

test('on production: the project first, signing key, then emails, hook and OAuth server in that order, then 401 at the site', async () => {
  const world = fakeWorld();
  assert.equal(await main(['production', 'on'], world.io()), 0, world.err.join('\n'));
  assert.equal(world.out[0], `== production (${PROD}): on`);
  assert.deepEqual(patches(world).map((c) => c.body), STEPS.on.map(([, body]) => body));
  const order = world.calls.map((c) => `${c.method} ${c.url.replace(/^https:\/\/[^/]+/, '')}`);
  assert.equal(order[0], `GET /v1/projects/${PROD}/config/auth/signing-keys`);
  // Each change is read back before the next one is sent.
  assert.deepEqual(order.slice(1, 7).map((s) => s.split(' ')[0]), ['PATCH', 'GET', 'PATCH', 'GET', 'PATCH', 'GET']);
  assert.ok(world.calls.every((c) => !c.auth || c.auth === 'Bearer sbp_test'), 'the token reaches the API without its CR');
  assert.deepEqual([...touchedRefs(world)], [PROD]);
  assert.equal(world.calls.at(-1).url, `${PRODUCTION_SITE}/mcp`);
  assert.ok(world.clock >= 65_000, 'waits out the site cache before trusting its answer');
  assert.equal(world.out.at(-1), `production (${PROD}): connector on`);
});

test('an unknown project or action refuses before any request', async () => {
  for (const argv of [['prodution', 'off'], ['production', 'of'], ['off'], ['production', 'on', '--hook-off'], ['production', 'off', '--force']]) {
    const world = fakeWorld();
    assert.equal(await main(argv, world.io()), 1, argv.join(' '));
    assert.match(world.err[0], /^REFUSED: /);
    assert.equal(world.calls.length, 0);
  }
});

test('a missing token refuses after naming the project, with no request', async () => {
  const world = fakeWorld();
  assert.equal(await main(['staging', 'off'], world.io({}, { VITE_SUPABASE_URL: FILE_ENV.VITE_SUPABASE_URL })), 1);
  assert.equal(world.out[0], `== staging (${STAGING}): off`);
  assert.match(world.err[0], /^REFUSED: no SUPABASE_ACCESS_TOKEN .*nothing was changed/);
  assert.equal(world.calls.length, 0);
});

test("a refused body prints Auth's code and message and stops before the OAuth server", async () => {
  const world = fakeWorld({ refuse: (body) => ('hook_custom_access_token_uri' in body ? 'Invalid hook URI' : null) });
  assert.equal(await main(['staging', 'on'], world.io()), 1);
  assert.match(world.err[0], /^REFUSED: PATCH \/v1\/projects\/garafohbzmsybtysxphb\/config\/auth: HTTP 400: Invalid hook URI$/);
  assert.ok(!patches(world).some((c) => 'oauth_server_enabled' in c.body), 'the OAuth server is never sent after a refusal');
});

test('a setting Auth holds differently, or does not know, is REFUSED and stops the run', async () => {
  const mismatch = fakeWorld({ hold: { hook_custom_access_token_enabled: false } });
  assert.equal(await main(['staging', 'on'], mismatch.io()), 1);
  assert.match(mismatch.err[0], /REFUSED: access token hook on: sent hook_custom_access_token_enabled=true, Auth holds false/);
  assert.ok(!patches(mismatch).some((c) => 'oauth_server_enabled' in c.body));

  const typed = fakeWorld({ hold: { oauth_server_enabled: 'true' } });
  assert.equal(await main(['staging', 'on'], typed.io()), 1);
  assert.match(typed.err[0], /sent oauth_server_enabled=true, Auth holds "true"/);

  const unknown = fakeWorld();
  delete unknown.configs[STAGING].mailer_notifications_phone_changed_enabled;
  assert.equal(await main(['staging', 'on'], unknown.io()), 1);
  assert.match(unknown.err[0], /Auth holds no setting named mailer_notifications_phone_changed_enabled/);
  assert.equal(patches(unknown).length, 1);
});

test('the config read back may lag the PATCH: it is read again, and a read that never agrees is REFUSED', async () => {
  const lagging = fakeWorld({ lagMs: 10_000 });
  assert.equal(await main(['staging', 'on'], lagging.io()), 0, lagging.err.join('\n'));
  assert.ok(lagging.out.includes('...  access token hook on: Auth stored it; reading the config back (up to 60 s)'));

  const stuck = fakeWorld({ lagMs: 10 * 60_000 });
  assert.equal(await main(['staging', 'on'], stuck.io()), 1);
  assert.match(stuck.err[0], /^REFUSED: security notification emails on: read back after 60 s: sent mailer_notifications_password_changed_enabled=true, Auth holds false/);
  assert.equal(patches(stuck).length, 1);
});

test('values compare by value, not by how Auth formats its answer', async () => {
  const world = fakeWorld(); // the fake answers GET config pretty-printed, with spaces after colons
  assert.equal(await main(['staging', 'on'], world.io()), 0, world.err.join('\n'));
  assert.ok(world.out.some((l) => l === 'ok   OAuth server on: Auth reads back 3 settings as sent'));
});

test('off sends the paired body; --hook-off sends the hook only after Auth reads the OAuth server off', async () => {
  const world = fakeWorld();
  world.configs[PROD] = { ...world.configs[PROD], oauth_server_enabled: true, oauth_server_allow_dynamic_registration: true, oauth_server_authorization_path: '/', hook_custom_access_token_enabled: true };
  assert.equal(await main(['production', 'off', '--hook-off'], world.io()), 0, world.err.join('\n'));
  assert.deepEqual(patches(world).map((c) => c.body), [
    { oauth_server_enabled: false, oauth_server_allow_dynamic_registration: false, oauth_server_authorization_path: '/' },
    { hook_custom_access_token_enabled: false },
  ]);
  const hookAt = world.calls.findIndex((c) => c.method === 'PATCH' && 'hook_custom_access_token_enabled' in c.body);
  const authOffAt = world.calls.findIndex((c) => c.url.includes('oauth-authorization-server'));
  assert.ok(authOffAt > 0 && authOffAt < hookAt, 'discovery read off before the hook goes');
  assert.equal(world.out.at(-1), `production (${PROD}): connector off`);
});

test('the ending check fails loudly: NOT off when the site stays 401, NOT on when Auth never flips', async () => {
  const stuck = fakeWorld({ site: () => 401 });
  assert.equal(await main(['production', 'off'], stuck.io()), 1);
  assert.equal(stuck.err[0], `NOT off: ${PRODUCTION_SITE}/mcp answers 401, not 503`);

  const neverOn = fakeWorld({ discovery: () => false });
  assert.equal(await main(['staging', 'on'], neverOn.io()), 1);
  assert.match(neverOn.err[0], /^NOT on: staging \(garafohbzmsybtysxphb\), Auth's discovery reads off after 3 minutes$/);
  assert.ok(!neverOn.calls.some((c) => c.url.startsWith(PRODUCTION_SITE)), 'staging has no site check');
});

test('status only reads, and says production is off with the site at 503', async () => {
  const world = fakeWorld();
  assert.equal(await main(['production', 'status'], world.io()), 0, world.err.join('\n'));
  assert.ok(world.calls.every((c) => c.method === 'GET' || (c.method === 'POST' && c.url === `${PRODUCTION_SITE}/mcp`)));
  assert.ok(world.out.includes(`${PRODUCTION_SITE}/mcp 503`));
  assert.equal(world.out.at(-1), `production (${PROD}): connector off`);
});

test('status says NOT safe when the OAuth server runs without the hook', async () => {
  const world = fakeWorld();
  Object.assign(world.configs[STAGING], { oauth_server_enabled: true, oauth_server_allow_dynamic_registration: true });
  assert.equal(await main(['staging', 'status'], world.io()), 1);
  assert.match(world.err[0], /^NOT safe: /);
});

test('--ref takes only a preview branch of production and touches nothing else', async () => {
  const world = fakeWorld();
  assert.equal(await main(['--ref', BRANCH, 'on'], world.io()), 0, world.err.join('\n'));
  assert.equal(world.out[0], `== branch ${BRANCH}, throwaway preview branch only: on`);
  assert.deepEqual(patches(world).map((c) => c.url), Array(3).fill(`https://api.supabase.com/v1/projects/${BRANCH}/config/auth`));
  assert.ok(!world.calls.some((c) => c.url.startsWith(PRODUCTION_SITE)));

  const refusals = { [PROD]: /is production; name it/, [STAGING]: /is staging; name it/, abcdefghijabcdefghij: /not a preview branch of production/, nope: /not a project ref/ };
  for (const [ref, reason] of Object.entries(refusals)) {
    const refused = fakeWorld();
    assert.equal(await main(['--ref', ref, 'off'], refused.io()), 1, ref);
    assert.match(refused.err[0], reason);
    assert.ok(!refused.calls.some((c) => c.method === 'PATCH'), ref);
  }
});

test('an HS256 signing key refuses on before anything changes', async () => {
  const world = fakeWorld({ algorithm: 'HS256' });
  assert.equal(await main(['staging', 'on'], world.io()), 1);
  assert.match(world.err[0], /HS256/);
  assert.equal(patches(world).length, 0);
});
