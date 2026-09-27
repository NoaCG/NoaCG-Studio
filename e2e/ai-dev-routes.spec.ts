// A function ADDED, RENAMED or MOVED under api/ai changes what the dev server can reach, and
// nothing but this spec would notice.
// covers: api/{ai/**,_lib/ai*{,/**}}
//
// The dev server's own route RESOLVER. ai-dev-routes.spec.ts drives the real middleware instead
// of mocking it, which is the only thing that can prove a route is reachable at all - every
// other AI spec mocks at the network level, which is why an allowlist hid three surfaces.
// covers: scripts/{aiDevPlugin.mjs,apiRouteTable.mjs}

import { expect, test } from '@playwright/test';

// THE DEV SERVER SERVES WHAT THE DEPLOYMENT SERVES - proved by driving the real middleware.
//
// `scripts/aiDevPlugin.mjs` used to decide reachability from a hand-kept allowlist, and that list
// hid a whole surface three times: the imported-graphic-analysis task shipped with no entries;
// hosted Pro was a 404 in every dev server and the entire e2e suite while production served it,
// so the tier's door never appeared locally; and `/api/ai/consent` was never routed at all. Every
// existing spec that touches these paths MOCKS them at the network level, which is exactly why
// none of the three was ever caught - a mocked route is green whether or not a server would
// answer it. These tests deliberately do not mock: they ask the dev server.
//
// The claim under test is REACHED A HANDLER, not what the handler said. Offline (which is what
// the suite pins) most of these answer 503 or 401, and that is a routed answer; the middleware's
// own refusal is a 404 carrying `not_found`, and that is the defect.

/** The dev middleware's own refusal - the one answer that means "no handler ran". */
async function refusedByTheMiddleware(body: string): Promise<boolean> {
  try {
    return JSON.parse(body)?.error?.code === 'not_found';
  } catch {
    return false;
  }
}

test('every api/ai function is reachable in development', async ({ request }) => {
  const routes = [
    '/api/ai/config',
    '/api/ai/credentials',
    '/api/ai/models',
    // Never routed in a dev server before this: the consent endpoint the disclosure notice posts to.
    '/api/ai/consent',
    // Hosted Pro's three, missing from the allowlist since the day the tier shipped.
    '/api/ai/pro-status',
    '/api/ai/lite/status',
  ];
  for (const route of routes) {
    const response = await request.get(route);
    expect(await refusedByTheMiddleware(await response.text()), `${route} never reached a handler`)
      .toBe(false);
    expect(response.status(), route).not.toBe(404);
  }
});

test('a path the platform will not route is refused here too', async ({ request }) => {
  // Measured on production 2026-08-14: a [...path].ts function routes exactly ONE segment, so
  // `/api/ai/pro/status` reaches no code at all and gets the platform's NOT_FOUND. A dev server
  // that answered it would HIDE the defect that shipped hosted Pro broken - which is what the old
  // whole-path dispatcher did.
  for (const route of ['/api/ai/pro/status', '/api/ai/lite/a/b', '/api/ai/tasks/import-analysis/status']) {
    const response = await request.get(route);
    expect(response.status(), route).toBe(404);
    expect(await refusedByTheMiddleware(await response.text()), `${route} was served`).toBe(true);
  }
});

test('an unknown NAME is answered by the real dispatcher, in its own vocabulary', async ({ request }) => {
  // Production answers this with Lite's LiteError shape, which is what the browser client parses.
  // A dev server refusing it itself would train the page - and whoever tests against it - on a
  // 404 body that does not exist in production.
  const response = await request.get('/api/ai/lite/nonexistent');
  expect(response.status()).toBe(404);
  expect((await response.json())?.error?.code).toBe('invalid_request');
});

test('the task routes reach their handler rather than the middleware', async ({ request }) => {
  // GET is not allowed on the analyze endpoint, and a 405 is a handler answering.
  const response = await request.get('/api/ai/tasks/import-analysis');
  expect(response.status()).not.toBe(404);
  expect(await refusedByTheMiddleware(await response.text())).toBe(false);
});
