// The actual configs must keep endpoint identity and offline/configured separation together.
// The hanging-HTTP regression is exercised through the queued diagnostic config, not here.
// guards: playwright.config.ts, playwright.catalog.config.ts, playwright.live.config.ts, e2e/_offline-guard.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import offline from '../playwright.config.ts';
import catalog from '../playwright.catalog.config.ts';
import live from '../playwright.live.config.ts';
import { devPort, livePort } from './dev-port.mjs';

for (const [name, config, port] of [
  ['offline', offline, devPort()],
  ['catalog', catalog, devPort()],
  ['configured', live, livePort()],
]) {
  test(`${name} server and client agree on the allocated IPv4 endpoint`, () => {
    assert.equal(config.use.baseURL, `http://127.0.0.1:${port}`);
    assert.equal(config.webServer.url, config.use.baseURL);
    assert.match(config.webServer.command, /--host 127\.0\.0\.1(?:\s|$)/);
    assert.equal(config.webServer.timeout, 60_000);
    assert.equal(config.webServer.reuseExistingServer, true);
  });
}

test('offline pins remain identical and configured mode inherits its own environment', () => {
  for (const [key, value] of Object.entries(catalog.webServer.env)) {
    assert.equal(offline.webServer.env[key], value, key);
  }
  assert.equal(offline.webServer.env.VITE_SUPABASE_URL, '');
  assert.equal(offline.webServer.env.VITE_SUPABASE_ANON_KEY, '');
  assert.equal(offline.webServer.env.VITE_RENDER_API, '1');
  // Only the no-watch switch (#2094): no Supabase or AI pin, so configured mode keeps its own .env.
  assert.deepEqual(live.webServer.env, { NOACG_E2E_SERVER: '1' });
  assert.match(live.webServer.command, new RegExp(`--port ${livePort()} --strictPort$`));
});
