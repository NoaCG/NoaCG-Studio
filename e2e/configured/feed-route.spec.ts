// covers: api/_lib/feedFetch.ts, api/data/?...path?.ts, supabase/migrations/0099_feed_cache.sql
//
// THE NEWS FEED ROUTE against the real database of the configured stack (data-sources C4, AC-6;
// migration 0099). Two readers asking at once for an address nobody has read make ONE upstream
// fetch through the shared `feed_cache` row and both get the headlines; the row keeps the
// validators, and once its wait has passed the next read is a conditional request that a 304
// answers without changing the headlines; an address on a private network is refused before
// anything is requested.
//
// The route runs in this process, as the tick spec drives the tick: the handler is the deployed
// one and the database is the stack's, so the claim is Postgres's own conditional update. The
// upstream feed is a stub this spec serves itself (configured-suite.yml reaches no real feed): the
// reader's network door is replaced, so the guard still resolves and checks every address it is
// handed, and the stub answers only the public address it was checked against.

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { haveCreds, SERVICE_ROLE_KEY, SUPABASE_URL } from './_helpers';
import dataRoute from '../../api/data/[...path]';
import { feedKey, feedNetwork, type FeedNet } from '../../api/_lib/feedFetch';

test.skip(!haveCreds || !SERVICE_ROLE_KEY, 'E2E_EMAIL / E2E_PASSWORD / SUPABASE_SERVICE_ROLE_KEY unset - configured-mode spec');

const admin = () => createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PUBLIC = '93.184.215.14';
const ADDRESS = `https://feeds.noacg-e2e.example/news-${Date.now()}.xml`;
const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Stub</title>
<item><title>Storm warning &amp; ferry stops</title><guid>1</guid></item>
<item><title><![CDATA[Markets close higher]]></title><guid>2</guid></item></channel></rss>`;

/** The stub upstream: counts requests, answers after `gate` opens, 304 for a matching ETag. */
function stubUpstream() {
  const upstream = { requests: [] as { address: string; ifNoneMatch?: string }[], open: () => {} };
  let gate = new Promise<void>((resolve) => (upstream.open = resolve));
  const net: FeedNet = {
    lookup: async (host) => (host === 'feeds.noacg-e2e.example' ? [{ address: PUBLIC, family: 4 }] : host === 'intranet.noacg-e2e.example' ? [{ address: '10.20.30.40', family: 4 }] : []),
    request: async ({ address, headers }) => {
      upstream.requests.push({ address, ifNoneMatch: headers['if-none-match'] });
      await gate;
      gate = Promise.resolve();
      const notModified = headers['if-none-match'] === 'W/"stub-1"';
      async function* body() {
        if (!notModified) yield new TextEncoder().encode(RSS);
      }
      return { status: notModified ? 304 : 200, headers: { etag: 'W/"stub-1"', 'content-type': 'application/rss+xml' }, body: body(), cancel: () => {} };
    },
  };
  return { upstream, net };
}

const read = (address: string, client: string) =>
  dataRoute.fetch(new Request(`http://127.0.0.1/api/data/feed?url=${encodeURIComponent(address)}`, { headers: { 'x-forwarded-for': client } }));

let realNet: FeedNet;
test.beforeAll(() => {
  process.env.SUPABASE_URL ??= SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= SERVICE_ROLE_KEY;
  realNet = feedNetwork.current;
});
test.afterAll(async () => {
  feedNetwork.current = realNet;
  await admin().from('feed_cache').delete().like('address', 'https://feeds.noacg-e2e.example/%');
});

test('two readers at once make one upstream fetch; the row keeps the validators; a stale row is read conditionally; a private address is refused', async () => {
  test.setTimeout(60_000);
  const { upstream, net } = stubUpstream();
  feedNetwork.current = net;

  // Two readers (two serverless instances in production) ask at once for an address nobody read.
  const first = read(ADDRESS, '198.51.100.1');
  const second = read(ADDRESS, '198.51.100.2');
  await expect.poll(() => upstream.requests.length).toBe(1);
  upstream.open();
  const answers = await Promise.all([first, second]);
  for (const answer of answers) {
    expect(answer.status).toBe(200);
    expect(await answer.json()).toMatchObject({ ok: true, items: ['Storm warning & ferry stops', 'Markets close higher'] });
  }
  expect(upstream.requests).toEqual([{ address: PUBLIC, ifNoneMatch: undefined }]);

  // The shared row: the headlines, the validator, the 5-minute wait, no claim left behind.
  const { data: row, error } = await admin().from('feed_cache').select('*').eq('key', feedKey(ADDRESS)).single();
  if (error) throw new Error(error.message);
  expect(row.items).toEqual(['Storm warning & ferry stops', 'Markets close higher']);
  expect(row.etag).toBe('W/"stub-1"');
  const wait = Date.parse(row.next_allowed_at) - Date.parse(row.fetched_at);
  expect(wait).toBeGreaterThanOrEqual(5 * 60_000 - 1000);
  expect(wait).toBeLessThanOrEqual(5 * 60_000 + 1000);
  expect(Date.parse(row.claimed_until)).toBeLessThanOrEqual(Date.now());

  // Read again inside the wait: served from the row, nothing upstream.
  expect((await (await read(ADDRESS, '198.51.100.3')).json()).items).toHaveLength(2);
  expect(upstream.requests).toHaveLength(1);

  // The wait passes: one conditional request, a 304, the same headlines checked now.
  const passed = new Date(Date.now() - 1000).toISOString();
  const { error: aged } = await admin().from('feed_cache').update({ next_allowed_at: passed }).eq('key', feedKey(ADDRESS));
  if (aged) throw new Error(aged.message);
  const again = await (await read(ADDRESS, '198.51.100.4')).json();
  expect(again.items).toEqual(['Storm warning & ferry stops', 'Markets close higher']);
  expect(upstream.requests).toHaveLength(2);
  expect(upstream.requests[1].ifNoneMatch).toBe('W/"stub-1"');
  expect(Date.parse(again.fetchedAt)).toBeGreaterThan(Date.parse(row.fetched_at));

  // A name that answers a private address is refused, and nothing is requested from it.
  const refused = await read('https://intranet.noacg-e2e.example/feed.xml', '198.51.100.5');
  expect(refused.status).toBe(400);
  expect((await refused.json()).error).toMatch(/not on the public internet/);
  expect(upstream.requests).toHaveLength(2);
  await admin().from('feed_cache').delete().eq('key', feedKey('https://intranet.noacg-e2e.example/feed.xml'));
});
