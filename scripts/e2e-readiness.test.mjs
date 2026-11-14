// The actual configs must keep endpoint identity and offline/configured separation together.
// The hanging-HTTP regression is exercised through the queued diagnostic config, not here.
// guards: playwright.config.ts, playwright.catalog.config.ts, playwright.live.config.ts, e2e/_offline-guard.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import offline from '../playwright.config.ts';
import catalog from '../playwright.catalog.config.ts';
import live from '../playwright.live.config.ts';
import { devPort, livePort } from './dev-port.mjs';

/** The app's server: the offline config lists it first, beside the build run's dev-project server
 *  (playwright.config.ts); the other configs have one. */
const appServer = (config) => (Array.isArray(config.webServer) ? config.webServer[0] : config.webServer);

// `reuse` is per suite since issue #2495. The offline and catalog suites still adopt a server
// already on their port, which saves a start: they pin their server's environment empty, and
// `_offline-guard.ts` refuses an adopted server that serves anything else - the half it can SEE,
// which is the browser's. An adopted server's api half is invisible from inside a page, so it is
// accepted unjudged; that is #2511, not a safety this test should imply. The configured suite
// WRITES, and an adopted server decides where - through those same api/ handlers - so it starts
// its own, as the endurance configs do.
for (const [name, config, port, reuse] of [
  ['offline', offline, devPort(), true],
  ['catalog', catalog, devPort(), true],
  ['configured', live, livePort(), false],
]) {
  test(`${name} server and client agree on the allocated IPv4 endpoint`, () => {
    assert.equal(config.use.baseURL, `http://127.0.0.1:${port}`);
    assert.equal(appServer(config).url, config.use.baseURL);
    assert.match(appServer(config).command, /--host 127\.0\.0\.1(?:\s|$)/);
    assert.equal(appServer(config).timeout, 60_000);
    assert.equal(appServer(config).reuseExistingServer, reuse);
  });
}

test('offline pins remain identical and configured mode inherits its own environment', () => {
  for (const [key, value] of Object.entries(appServer(catalog).env)) {
    assert.equal(appServer(offline).env[key], value, key);
  }
  assert.equal(appServer(offline).env.VITE_SUPABASE_URL, '');
  assert.equal(appServer(offline).env.VITE_SUPABASE_ANON_KEY, '');
  assert.equal(appServer(offline).env.VITE_RENDER_API, '1');
  // The server's own half as well (issue #2495): the api/ handlers these dev servers mount read
  // these, not the VITE_ pair, and Playwright MERGES webServer.env over the shell. Pinned empty,
  // neither suite can hand its own server a backend whatever the shell holds. BOTH configs are
  // named: the loop above only walks catalog's keys, so a key deleted there shrinks it silently.
  for (const [suite, config] of [['offline', offline], ['catalog', catalog]]) {
    for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
      assert.equal(appServer(config).env[name], '', `${suite}: ${name}`);
    }
  }
  // Only the no-watch switch (#2094): no Supabase or AI pin, so configured mode keeps its own .env.
  assert.deepEqual(appServer(live).env, { NOACG_E2E_SERVER: '1' });
  assert.match(appServer(live).command, new RegExp(`--port ${livePort()} --strictPort$`));
});
