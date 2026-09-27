// focus
//
// The Production Data API (docs/DATA_API.md): the routed function, its logic module, and
// the dev middleware that makes the route exist locally at all.
// covers: {api/data/**,api/_lib/dataIngest*,scripts/dataDevPlugin.mjs}

import { expect, test } from '@playwright/test';

// The Production Data API is served in development exactly as deployed (dataDevPlugin
// mounts the real api/data/[...path].ts), so its refusal shapes are pinned here without a
// backend - the suite runs offline, and every answer below is what a misconfigured or
// unauthenticated integrator meets in production too (docs/DATA_API.md, "Errors").
//
// The claim under test is REACHED THE HANDLER and REFUSED HONESTLY - the live write path
// (real key, real log row, the score changing on /output) needs a real Supabase and lives in
// docs/CLOUD_PLAYOUT.md §8 step 9.

test('a request with no key is the handler\'s own 401, not a routing 404', async ({ request }) => {
  const response = await request.post('/api/data/update', { data: { values: { 'Score A': 1 } } });
  expect(response.status()).toBe(401);
  const body = await response.json();
  expect(body?.error?.code).toBe('unauthorized');
});

test('offline (no backend configured) answers 503, after the key was presented', async ({ request }) => {
  const response = await request.post('/api/data/update', {
    headers: { authorization: 'Bearer not-a-real-key' },
    data: { values: { 'Score A': 1 } },
  });
  expect(response.status()).toBe(503);
  expect((await response.json())?.error?.code).toBe('unavailable');
});

test('the endpoint is POST-only and the dispatch table is closed', async ({ request }) => {
  const get = await request.get('/api/data/update');
  expect(get.status()).toBe(405);
  const unknown = await request.post('/api/data/nonsense', { data: {} });
  expect(unknown.status()).toBe(404);
  expect((await unknown.json())?.error?.code).toBe('not_found');
});

// ── The PRODUCTION-DATA verbs (0048): addressed by PATH, never by graphic. Same claim as the
// specs above - REACHED THE HANDLER and REFUSED HONESTLY. The live write path (a real key, a
// real merge, the diff reaching /output) needs a real Supabase and was walked by hand against
// the linked project on 2026-08-19; docs/PRODUCTION_DATA_PLAN.md §13 records what it proved.

test('patch with no key is the handler\'s own 401, not a routing 404', async ({ request }) => {
  const response = await request.patch('/api/data/patch', { data: { match: { home: { score: 4 } } } });
  expect(response.status()).toBe(401);
  expect((await response.json())?.error?.code).toBe('unauthorized');
});

test('patch offline (no backend configured) answers 503, after the key was presented', async ({ request }) => {
  const response = await request.patch('/api/data/patch', {
    headers: { authorization: 'Bearer not-a-real-key' },
    data: { match: { home: { score: 4 } } },
  });
  expect(response.status()).toBe(503);
  expect((await response.json())?.error?.code).toBe('unavailable');
});

test('patch accepts POST as well as PATCH - a proxy that eats PATCH must not strand a feed', async ({ request }) => {
  const response = await request.post('/api/data/patch', {
    headers: { authorization: 'Bearer not-a-real-key' },
    data: { match: { home: { score: 4 } } },
  });
  // 503 offline, never 405: the method got through and the deployment answered for itself.
  expect(response.status()).toBe(503);
});

test('patch refuses a verb that is neither PATCH nor POST', async ({ request }) => {
  const response = await request.get('/api/data/patch');
  expect(response.status()).toBe(405);
});

test('patch answers for the DEPLOYMENT before it judges the body', async ({ request }) => {
  // The refusal ORDER is `/update`'s, deliberately: an offline build says so first, whatever
  // the body was, so one API surface cannot answer the same request two ways. The body rule
  // itself (`parseDataPatch`) is unit-tested in api/_lib/dataIngest.test.ts, where it runs
  // without needing a backend at all.
  const response = await request.patch('/api/data/patch', {
    headers: { authorization: 'Bearer not-a-real-key', 'content-type': 'application/json' },
    data: [1, 2, 3],
  });
  expect(response.status()).toBe(503);
  expect((await response.json())?.error?.code).toBe('unavailable');
});

test('state is GET-only and answers 401 without a key', async ({ request }) => {
  expect((await request.post('/api/data/state')).status()).toBe(405);
  const response = await request.get('/api/data/state');
  expect(response.status()).toBe(401);
  expect((await response.json())?.error?.code).toBe('unauthorized');
});

test('state offline answers 503 once a key is presented', async ({ request }) => {
  const response = await request.get('/api/data/state', {
    headers: { authorization: 'Bearer not-a-real-key' },
  });
  expect(response.status()).toBe(503);
});

test('the dispatch table is closed - an unknown data verb is a 404, not a crash', async ({ request }) => {
  const response = await request.get('/api/data/nonsense');
  expect(response.status()).toBe(404);
  expect((await response.json())?.error?.code).toBe('not_found');
});
