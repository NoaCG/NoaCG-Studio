// guards: src/control/feedSource.ts, src/control/sheetSource.ts, src/model/productionData.ts
//
// A NEWS FEED AS A SOURCE IN THE BROWSER (docs/work-specs/data-sources/spec.md, phase C4; AC-5,
// AC-11), run in Node against the real module with a fake clock, route and lease storage.
//
// What is pinned: a pasted address is checked before it is sent; the page asks NoaCG's feed route,
// never the feed itself, and reads the route's answer as one row per headline; the reader asks at
// once and then every 5 minutes, writing `feed.<id>.lines` only when the headlines change; a failed
// read writes nothing, keeps the list and says since when, and three missed reads (15 minutes)
// mark it stale; a valid feed with no items writes "" and clears the ticker; an answer arriving
// after Disconnect or Stop writes nothing; one tab reads under a lease of three reads (15 minutes),
// so a second tab reads nothing until the first is gone. The source's paths are its own
// (`feed.<id>.`), recognised by the same helpers as a Sheet's.

import assert from 'node:assert/strict';
import test from 'node:test';
import './lib/tsResolve.mjs';

const { createFeedReader, feedRead, feedRouteUrl, parseFeedLink, readFeedRoute } = await import('../src/control/feedSource.ts');
const { isSourcePath, sourceIdOf, sourcePaths, sourcePrefix } = await import('../src/model/productionData.ts');
const { offeredValues, sheetContent } = await import('../src/control/sheetSource.ts');

const MIN = 60_000;
const FEED = 'https://news.example/feed.xml';

/** A clock whose timers run when the test moves time, each after the promises before it. */
function fakeClock() {
  let now = 1_000_000;
  let seq = 0;
  const timers = new Map();
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  return {
    now: () => now,
    setTimer: (run, ms) => {
      const id = ++seq;
      timers.set(id, { at: now + ms, run });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    async advance(ms) {
      const end = now + ms;
      await settle();
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        timers.delete(due[0]);
        now = Math.max(now, due[1].at);
        due[1].run();
        await settle();
        await settle();
      }
      now = end;
      await settle();
    },
  };
}

const respond = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });

/** One browser: its lease storage and the route, whose answer the test sets. */
function browser() {
  const clock = fakeClock();
  const leases = new Map();
  const route = { answer: { ok: true, items: ['One', 'Two'], fetchedAt: '2026-10-22T12:00:00.000Z' }, status: 200, asked: [], hold: null, offline: false };
  const io = {
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    fetch: async (url) => {
      route.asked.push(url);
      if (route.hold) await route.hold.promise;
      if (route.offline) throw new TypeError('Failed to fetch');
      return respond(route.status, route.answer);
    },
    readLease: (key) => (leases.has(key) ? structuredClone(leases.get(key)) : null),
    writeLease: (key, lease) => leases.set(key, structuredClone(lease)),
  };
  return { clock, leases, route, io };
}

function tab(b, name, { paths = ['feed.f1.lines'] } = {}) {
  const t = { writes: [], statuses: [], connected: new Set(paths), paused: false, frozen: false };
  // A tab whose page froze runs no timers, as a suspended tab does.
  const io = { ...b.io, setTimer: (run, ms) => b.io.setTimer(() => (t.frozen ? undefined : run()), ms) };
  t.reader = createFeedReader({
    key: 'prod-1:f1',
    sourceId: 'f1',
    url: FEED,
    tab: name,
    world: 'local',
    io,
    connected: () => t.connected,
    paused: () => t.paused,
    write: async (patch) => {
      t.writes.push(patch);
      return true;
    },
    onStatus: (s) => t.statuses.push(s),
  });
  t.status = () => t.statuses.at(-1);
  return t;
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

// ── The address and the route ─────────────────────────────────────────────────

test('a pasted address is checked before it is sent, and the page asks NoaCG’s route for it', () => {
  assert.deepEqual(parseFeedLink(' https://news.example/feed.xml#x '), { url: FEED });
  for (const bad of ['', 'news', 'ftp://news.example/feed', 'javascript:alert(1)']) assert.ok('error' in parseFeedLink(bad), bad);
  assert.equal(feedRouteUrl(FEED), `/api/data/feed?url=${encodeURIComponent(FEED)}`);
});

test('the route’s answer is a read: one row per headline, or the failure with its fix even beside older headlines', async () => {
  assert.deepEqual(feedRead({ ok: true, items: ['A', 'B'] }), { ok: true, rows: [['A'], ['B']] });
  assert.deepEqual(feedRead({ ok: true, items: [] }), { ok: true, rows: [] });
  const failed = feedRead({ ok: false, error: 'the feed answered 500', fix: 'Reading carries on by itself.', items: ['Old'] });
  assert.equal(failed.ok, false);
  assert.equal(failed.error, 'the feed answered 500');
  const signal = new AbortController().signal;
  const asked = [];
  const fetcher = (answer, status = 200) => async (url) => (asked.push(url), respond(status, answer));
  assert.deepEqual(await readFeedRoute(fetcher({ ok: true, items: ['A'] }), FEED, signal), { ok: true, rows: [['A']] });
  assert.equal(asked[0], `/api/data/feed?url=${encodeURIComponent(FEED)}`);
  assert.match((await readFeedRoute(fetcher({ error: { code: 'rate_limited', message: 'x' } }, 429), FEED, signal)).error, /too many/);
  assert.match((await readFeedRoute(fetcher('<html>', 502), FEED, signal)).error, /answered 502/);
  assert.match((await readFeedRoute(async () => { throw new TypeError('Failed to fetch'); }, FEED, signal)).error, /offline/);
});

test('a feed’s paths are its own: `feed.<id>.lines`, recognised like a Sheet’s', () => {
  assert.equal(sourcePrefix('f1', 'feed'), 'feed.f1');
  assert.equal(isSourcePath('f1', 'feed.f1.lines'), true);
  assert.equal(isSourcePath('f1', 'sheet.f1.lines'), true);
  assert.equal(isSourcePath('f1', 'feed.f10.lines'), false);
  assert.equal(sourceIdOf('feed.f1.lines'), 'f1');
  assert.equal(sourceIdOf('feedback.score'), null);
  assert.deepEqual(sourcePaths({ Ticker: { f0: 'feed.f1.lines' } }, 'f1'), [{ graphic: 'Ticker', fieldId: 'f0', path: 'feed.f1.lines' }]);
  const offered = offeredValues('f1', 'lines', sheetContent('lines', [['One'], ['Two']]), 'feed');
  assert.deepEqual(offered.map((o) => [o.path, o.sample]), [['feed.f1.lines', 'One\nTwo']]);
});

// ── The reader ────────────────────────────────────────────────────────────────

test('the reader asks at once and then every 5 minutes, and writes the headlines only when they change', async () => {
  const b = browser();
  const a = tab(b, 'A');
  await b.clock.advance(0);
  assert.equal(b.route.asked.length, 1);
  assert.deepEqual(a.writes, [{ feed: { f1: { lines: 'One\nTwo' } } }]);
  assert.equal(a.status().state, 'ok');
  await b.clock.advance(5 * MIN - 1);
  assert.equal(b.route.asked.length, 1, 'not before 5 minutes');
  await b.clock.advance(1);
  assert.equal(b.route.asked.length, 2, 'at 5 minutes');
  assert.equal(a.writes.length, 1, 'unchanged headlines write nothing');
  b.route.answer = { ok: true, items: ['Three', 'One', 'Two'] };
  await b.clock.advance(5 * MIN);
  assert.deepEqual(a.writes.at(-1), { feed: { f1: { lines: 'Three\nOne\nTwo' } } });
  a.reader.stop();
});

test('a failed fetch keeps the list and says since when; three misses (15 minutes) mark it stale; a good read clears it', async () => {
  const b = browser();
  const a = tab(b, 'A');
  await b.clock.advance(0);
  const written = a.writes.length;
  b.route.status = 502;
  b.route.answer = { ok: false, error: 'the feed answered 500', fix: 'Reading carries on by itself.', failingSince: null, items: ['One', 'Two'] };
  const failedAt = b.clock.now() + 5 * MIN;
  await b.clock.advance(5 * MIN);
  assert.equal(a.writes.length, written, 'a failed read writes nothing: the list holds');
  assert.equal(a.status().state, 'failing');
  assert.equal(a.status().failingSince, failedAt);
  assert.equal(a.status().error, 'the feed answered 500');
  assert.equal(a.status().stale, false);
  await b.clock.advance(5 * MIN);
  assert.equal(a.status().stale, false, 'two misses');
  await b.clock.advance(5 * MIN);
  assert.equal(a.status().stale, true, 'three misses');
  assert.equal(a.status().failingSince, failedAt);
  b.route.status = 200;
  b.route.answer = { ok: true, items: ['One', 'Two'] };
  await b.clock.advance(5 * MIN);
  assert.equal(a.status().state, 'ok');
  assert.equal(a.status().stale, false);
  assert.equal(a.writes.length, written, 'the same headlines after a failure write nothing');
  a.reader.stop();
});

test('a valid feed with no items writes "" and clears the ticker', async () => {
  const b = browser();
  const a = tab(b, 'A');
  await b.clock.advance(0);
  b.route.answer = { ok: true, items: [] };
  await b.clock.advance(5 * MIN);
  assert.deepEqual(a.writes.at(-1), { feed: { f1: { lines: '' } } });
  assert.equal(a.status().state, 'empty');
  a.reader.stop();
});

test('an answer that arrives after Disconnect or Stop writes nothing', async () => {
  const b = browser();
  const a = tab(b, 'A');
  await b.clock.advance(0);
  b.route.answer = { ok: true, items: ['Late'] };
  b.route.hold = deferred();
  await b.clock.advance(5 * MIN);
  a.connected = new Set();
  b.route.hold.resolve();
  await b.clock.advance(0);
  assert.ok(!a.writes.some((w) => w.feed.f1.lines === 'Late'), 'disconnected meanwhile');
  a.connected = new Set(['feed.f1.lines']);
  b.route.answer = { ok: true, items: ['Later'] };
  b.route.hold = deferred();
  await b.clock.advance(5 * MIN);
  a.reader.stop();
  b.route.hold.resolve();
  await b.clock.advance(0);
  assert.ok(!a.writes.some((w) => w.feed.f1.lines === 'Later'), 'stopped meanwhile');
});

test('one tab reads: a second waits out the first’s lease of 15 minutes and then takes over', async () => {
  const b = browser();
  const a = tab(b, 'A');
  await b.clock.advance(0);
  const c = tab(b, 'C');
  await b.clock.advance(0);
  assert.equal(b.route.asked.length, 1, 'the second tab does not read');
  assert.equal(c.status().reader, 'other');
  // A's page freezes (a suspended tab runs no timers and no cleanup): its lease runs out 15
  // minutes after its last read, and only then does C read.
  a.frozen = true;
  await b.clock.advance(15 * MIN - 1);
  assert.ok(c.statuses.every((s) => s.reader !== 'this'), 'C waits while the lease lasts');
  assert.equal(b.route.asked.length, 1);
  await b.clock.advance(1);
  assert.equal(c.status().reader, 'this', 'C reads once the lease lapsed');
  assert.equal(b.route.asked.length, 2);
  c.reader.stop();
});
