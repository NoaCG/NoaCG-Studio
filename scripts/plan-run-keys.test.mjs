// gate: build
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { main, SHEETS } from './plan-run-keys.mjs';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const SHEET_IDS = Array.from({ length: SHEETS }, (_, i) => `sheet-${i}`);
const ENV = {
  SUPABASE_ACCESS_TOKEN: 'sbp_secret-token',
  YOUTUBE_API_KEY: 'yt-secret-key',
  NOACG_TEST_SHEET_IDS: SHEET_IDS.join(', '),
  GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    client_email: 'robot@example.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    token_uri: 'https://oauth2.example/token',
  }),
};
const reply = (status, body = {}) => ({ status, json: async () => body });

// A fake Google and Supabase: each answers 200 only to the credential ENV holds.
function fake({ readOnly = [], unshared = [], signIn = 200, down = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push(url);
    if (down) throw new Error(`connect failed ${url}`);
    const { hostname, pathname, searchParams } = new URL(url);
    const bearer = init.headers?.Authorization;
    if (hostname === 'api.supabase.com') return reply(bearer === `Bearer ${ENV.SUPABASE_ACCESS_TOKEN}` ? 200 : 401);
    if (pathname.startsWith('/youtube/')) return reply(searchParams.get('key') === ENV.YOUTUBE_API_KEY ? 200 : 400);
    if (hostname === 'oauth2.example') {
      const assertion = init.body.get('assertion');
      return assertion?.split('.').length === 3 ? reply(signIn, { access_token: 'ya29.access' }) : reply(400);
    }
    if (bearer !== 'Bearer ya29.access') return reply(401);
    const id = decodeURIComponent(pathname.split('/').pop());
    if (hostname === 'sheets.googleapis.com') return reply(unshared.includes(id) ? 403 : 200);
    if (pathname.startsWith('/drive/')) return unshared.includes(id) ? reply(404) : reply(200, { capabilities: { canEdit: !readOnly.includes(id) } });
    return reply(404);
  };
  return { calls, fetchImpl };
}
const run = async (env, fetchImpl) => {
  const lines = [];
  return { code: await main(env, fetchImpl, (line) => lines.push(line)), lines };
};
const secrets = [ENV.SUPABASE_ACCESS_TOKEN, ENV.YOUTUBE_API_KEY, 'BEGIN PRIVATE KEY', 'robot@', 'ya29', ...SHEET_IDS];

test('every key passes its own authenticated read, and no value is printed', async () => {
  const { code, lines } = await run(ENV, fake().fetchImpl);
  assert.equal(code, 0);
  assert.deepEqual(lines, [
    'SUPABASE_ACCESS_TOKEN: pass (200)',
    'YOUTUBE_API_KEY: pass (200)',
    `NOACG_TEST_SHEET_IDS: pass (${SHEETS} IDs)`,
    `GOOGLE_SERVICE_ACCOUNT_JSON: pass (read ${SHEETS}/${SHEETS}, editable ${SHEETS}/${SHEETS})`,
  ]);
  for (const secret of secrets) assert.ok(!lines.join('\n').includes(secret), secret);
});

test('a revoked key fails although it is set', async () => {
  const { code, lines } = await run({ ...ENV, SUPABASE_ACCESS_TOKEN: 'sbp_revoked', YOUTUBE_API_KEY: 'old' }, fake().fetchImpl);
  assert.equal(code, 1);
  assert.equal(lines[0], 'SUPABASE_ACCESS_TOKEN: fail (401)');
  assert.equal(lines[1], 'YOUTUBE_API_KEY: fail (400)');
});

test('the service account must read and may edit every Sheet, not only the first', async () => {
  const readOnly = await run(ENV, fake({ readOnly: [SHEET_IDS[3]] }).fetchImpl);
  assert.equal(readOnly.code, 1);
  assert.equal(readOnly.lines[3], `GOOGLE_SERVICE_ACCOUNT_JSON: fail (read ${SHEETS}/${SHEETS}, editable ${SHEETS - 1}/${SHEETS})`);
  const unshared = await run(ENV, fake({ unshared: [SHEET_IDS[5]] }).fetchImpl);
  assert.equal(unshared.lines[3], `GOOGLE_SERVICE_ACCOUNT_JSON: fail (read ${SHEETS - 1}/${SHEETS}, editable ${SHEETS - 1}/${SHEETS})`);
  const refused = await run(ENV, fake({ signIn: 401 }).fetchImpl);
  assert.equal(refused.lines[3], 'GOOGLE_SERVICE_ACCOUNT_JSON: fail (sign-in 401)');
});

test('the Sheet list must name six', async () => {
  const { code, lines } = await run({ ...ENV, NOACG_TEST_SHEET_IDS: SHEET_IDS.slice(1).join(',') }, fake().fetchImpl);
  assert.equal(code, 1);
  assert.equal(lines[2], `NOACG_TEST_SHEET_IDS: fail (${SHEETS - 1} IDs)`);
});

test('unset keys fail without a request', async () => {
  const { calls, fetchImpl } = fake();
  const { code, lines } = await run({}, fetchImpl);
  assert.equal(code, 1);
  assert.deepEqual(lines, [
    'SUPABASE_ACCESS_TOKEN: fail (unset)',
    'YOUTUBE_API_KEY: fail (unset)',
    'NOACG_TEST_SHEET_IDS: fail (0 IDs)',
    'GOOGLE_SERVICE_ACCOUNT_JSON: fail (unset)',
  ]);
  assert.deepEqual(calls, []);
  assert.equal((await run({ ...ENV, GOOGLE_SERVICE_ACCOUNT_JSON: '{"type":"user"}' }, fetchImpl)).lines[3], 'GOOGLE_SERVICE_ACCOUNT_JSON: fail (not a service account)');
});

test('a network failure is a fail that never prints the URL', async () => {
  const { code, lines } = await run(ENV, fake({ down: true }).fetchImpl);
  assert.equal(code, 1);
  assert.deepEqual(lines.slice(0, 2), ['SUPABASE_ACCESS_TOKEN: fail (network)', 'YOUTUBE_API_KEY: fail (network)']);
  assert.equal(lines[3], 'GOOGLE_SERVICE_ACCOUNT_JSON: fail (sign-in network)');
  for (const secret of secrets) assert.ok(!lines.join('\n').includes(secret), secret);
});
