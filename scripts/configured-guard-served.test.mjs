// gate: factory
// needs: browser
// guards: e2e/_configured-guard.ts, scripts/configured-target.mjs
//
// LEG 2 OF THE CONFIGURED GUARD, RUN RATHER THAN READ (issue #2495). The rule itself, and the
// wiring that makes each run meet it, are in scripts/configured-target.test.mjs. This file holds
// the one case that needs a browser: the guard reads the backend back out of a real page, because
// the environment this process holds is not the environment the dev server serves - Vite fills
// anything missing out of the environment file, so a page can be built against a backend this
// process never named, and a run admitted on a clean localhost environment would then sign in
// through that page and write there.
//
// Its own file, and the factory tier, because the build tier has no browser. The server below is
// a stub, the production ref is the one already committed to this repository, and nothing here
// reaches a network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KEY_VARS, URL_VARS } from './configured-target.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The shape of the 2026-11-13 incident, as the page would hold it. */
const PRODUCTION_URL = 'https://kprolrchuldgfrzspthy.supabase.co';

test('a server that SERVES a backend this run does not own is refused, whatever this process holds', async (t) => {
  // LEG 2, RUN RATHER THAN READ. Leg 1 judges this process's environment; leg 2 judges what the
  // dev server hands the browser, and it is the half that catches what leg 1 structurally cannot -
  // a server whose environment this process never named (Vite fills anything missing out of the
  // environment file). Source-text matches cannot see that leg work: returning this process's own
  // URL from the probe, or swallowing a probe failure, leaves every spelling in place. So the
  // probe gets a real page to read, from a server small enough to live here: readiness, a document
  // at /app, and the module the guard evaluates inside it.
  const serving = (url, rootStatus = 200) =>
    new Promise((resolve) => {
      const server = createServer((request, response) => {
        // `/` answers with whatever status the case asks for. Playwright admits a webServer on
        // anything up to 403, so a 401 at the root is a server the specs will drive.
        if (request.url === '/' && rootStatus !== 200) {
          response.writeHead(rootStatus, { 'content-type': 'text/plain' });
          response.end('nope');
          return;
        }
        if (request.url?.startsWith('/e2e/_env-probe.ts')) {
          // `url` of null: a server that answers, and whose probe module will not load. The guard
          // must not take that for an answer.
          if (url === null) {
            response.writeHead(200, { 'content-type': 'text/html' });
            response.end('<!doctype html><title>not a module</title>');
            return;
          }
          response.writeHead(200, { 'content-type': 'text/javascript' });
          response.end(`export const VITE_SUPABASE_URL = ${JSON.stringify(url)};\n`);
          return;
        }
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end('<!doctype html><title>stub</title>');
      });
      server.listen(0, '127.0.0.1', () => resolve(server));
    });

  const before = { ...process.env };
  for (const name of [...URL_VARS, ...KEY_VARS]) delete process.env[name];
  // A CLEAN LOCAL environment, so leg 1 admits the run and only the served backend can refuse it.
  process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:54321';
  t.after(() => {
    for (const name of [...URL_VARS, ...KEY_VARS]) delete process.env[name];
    Object.assign(process.env, before);
  });
  const guard = (await import(path.join(ROOT, 'e2e/_configured-guard.ts'))).default;
  const run = async (served, rootStatus) => {
    const server = await serving(served, rootStatus);
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      return await guard({ projects: [{ use: { baseURL: base } }] }).then(() => null, (error) => error);
    } finally {
      server.close();
    }
  };

  const refused = await run(PRODUCTION_URL);
  assert.ok(refused instanceof Error, 'a page built against production must stop the run');
  assert.match(refused.message, /SERVES a backend this run does not own/);
  assert.match(refused.message, /PRODUCTION project/);
  // And the same server serving the stack this run was admitted on is fine: the refusal is about
  // the backend, not about being probed.
  assert.equal(await run('http://127.0.0.1:54321'), null);

  // A SERVER THAT ANSWERS AND CANNOT BE READ IS NOT A PASS. The guard fails open for one case
  // only - nothing listening at all, where there is no served backend to judge and the run is
  // about to fail on the server that did not start. Here something IS listening, so its backend
  // is unknown rather than absent, and swallowing the probe's failure would wave through exactly
  // the server this leg exists to catch.
  const unreadable = await run(null);
  assert.ok(unreadable instanceof Error, 'a server whose backend cannot be read must stop the run');
  assert.doesNotMatch(unreadable.message, /WAS NOT CHECKED/, 'that is the skip for an absent server, not an unreadable one');

  // NOR IS A SERVER THAT ANSWERS WITH A STATUS NOBODY LIKES. Playwright admits a webServer on
  // anything from 200 to 403, so a root that answers 401 is a server the specs are about to
  // drive. Reading only a 2xx as "listening" would skip this leg there and then report that
  // nothing answered, which is the one sentence that sends the next person to the wrong place.
  const guarded = await run(PRODUCTION_URL, 401);
  assert.ok(guarded instanceof Error, 'a 401 at the root is a server, not an absence');
  assert.match(guarded.message, /SERVES a backend this run does not own/);
});
