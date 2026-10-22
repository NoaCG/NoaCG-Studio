// guards: src/audience/youtubeChat.ts
//
// YOUTUBE LIVE CHAT (audience-flow AC-4, AC-9; data-sources C3), driven on recorded answers and a
// fake clock. The fixtures in scripts/fixtures/youtube/ carry the shapes, counts, intervals and
// times the Q record measured (docs/work-specs/data-sources/evidence/youtube.md: a first page of 68
// messages over 7.6 minutes, server hints of 2,853 to 3,145 ms, a token on every page); their text,
// names and ids are invented, and no test calls the live API. Pinned, each against a literal so a
// changed constant goes red: the first page is delivered and marked earlier; later pages are not;
// the reader waits at least 5 s whatever the hint, and honours a longer one; a refusal stops it with
// a next action; units are 1 for the lookup and 5 a page; the estimate of chat left today counts
// 3,600 units an hour against 10,000, from this browser's spend since midnight Pacific time.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const {
  chatMinutesLeft,
  pacificDay,
  quotaLine,
  recordSpend,
  rememberKey,
  rememberedKey,
  spentToday,
  youtubeChatDriver,
} = await import('../src/audience/youtubeChat.ts');

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/youtube/${name}`, import.meta.url), 'utf8'));

/** A driver on a script of answers, with the timers held for the test to fire. */
function harness(answers) {
  const calls = [];
  const timers = [];
  const messages = [];
  const statuses = [];
  const spent = [];
  const io = {
    fetch: async (url) => {
      calls.push(url);
      const next = answers.shift();
      if (!next) throw new Error('no more answers');
      if (next === 'offline') throw new TypeError('fetch failed');
      const [status, body] = next;
      return { ok: status < 300, status, json: async () => body };
    },
    setTimer: (run, ms) => {
      const t = { run, ms, cleared: false };
      timers.push(t);
      return t;
    },
    clearTimer: (t) => {
      if (t) t.cleared = true;
    },
  };
  const handlers = {
    onMessage: (m) => messages.push(m),
    onStatus: (s, detail) => statuses.push(detail ? `${s}: ${detail}` : s),
    onSpend: (u) => spent.push(u),
  };
  const settle = () => new Promise((r) => setTimeout(r, 0));
  const fire = async () => {
    const t = timers.filter((x) => !x.cleared).at(-1);
    t.cleared = true;
    t.run();
    await settle();
    await settle();
  };
  return { io, handlers, calls, timers, messages, statuses, spent, settle, fire, pending: () => timers.filter((x) => !x.cleared) };
}

test('the first page is delivered, every line marked earlier; the next page is new', async () => {
  const h = harness([[200, fixture('video-live.json')], [200, fixture('chat-first-page.json')], [200, fixture('chat-later-page.json')]]);
  youtubeChatDriver('https://www.youtube.com/watch?v=4xDzrJKXOOY', 'KEY', h.handlers, h.io);
  await h.settle();
  await h.settle();
  assert.equal(h.messages.length, 68, 'the whole first page is kept');
  assert.ok(h.messages.every((m) => m.earlier === true));
  assert.equal(h.messages[0].id, 'LCC.msg0000');
  assert.equal(h.messages[0].authorName, 'Chatter 0');
  await h.fire();
  assert.equal(h.messages.length, 71);
  assert.ok(h.messages.slice(68).every((m) => m.earlier === undefined));
  // The page token is followed.
  assert.match(h.calls[2], /pageToken=GOCx0Nb/);
  assert.equal(h.statuses.at(-1), 'live');
});

test('the reader waits 5 s at least, whatever the API suggests, and honours a longer wait', async () => {
  const later = fixture('chat-empty-page.json');
  const slow = { ...later, pollingIntervalMillis: 8000 };
  const h = harness([[200, fixture('video-live.json')], [200, fixture('chat-first-page.json')], [200, later], [200, slow], [200, later]]);
  youtubeChatDriver('4xDzrJKXOOY', 'KEY', h.handlers, h.io);
  await h.settle();
  await h.settle();
  assert.equal(h.pending()[0].ms, 5000, 'a 2,853 ms hint waits 5 s');
  await h.fire();
  assert.equal(h.pending()[0].ms, 5000, 'a 2,990 ms hint waits 5 s');
  await h.fire();
  assert.equal(h.pending()[0].ms, 8000, 'an 8 s hint waits 8 s');
});

test('units: 1 for the video lookup, 5 for each chat page', async () => {
  const h = harness([[200, fixture('video-live.json')], [200, fixture('chat-first-page.json')], [200, fixture('chat-empty-page.json')]]);
  youtubeChatDriver('4xDzrJKXOOY', 'KEY', h.handlers, h.io);
  await h.settle();
  await h.settle();
  await h.fire();
  assert.deepEqual(h.spent, [1, 5, 5]);
});

test('a refusal stops the reader with a next action, and spends nothing more', async () => {
  const quota = harness([[200, fixture('video-live.json')], [403, fixture('error-quota-exceeded.json')]]);
  youtubeChatDriver('4xDzrJKXOOY', 'KEY', quota.handlers, quota.io);
  await quota.settle();
  await quota.settle();
  assert.match(quota.statuses.at(-1), /^error: The key has spent its quota for today\. It resets at midnight Pacific time/);
  assert.equal(quota.pending().length, 0, 'no further poll');

  const missing = harness([[404, fixture('error-video-not-found.json')]]);
  youtubeChatDriver('4xDzrJKXOOY', 'KEY', missing.handlers, missing.io);
  await missing.settle();
  assert.match(missing.statuses.at(-1), /No such video\. Check the link/);

  const notLive = harness([[200, fixture('video-not-live.json')]]);
  youtubeChatDriver('jNQXAC9IVRw', 'KEY', notLive.handlers, notLive.io);
  await notLive.settle();
  assert.match(notLive.statuses.at(-1), /no open live chat\. Connect it while the stream is live, or read its comments/);

  const auth = harness([[200, fixture('video-live.json')], [401, fixture('error-authorization-required.json')]]);
  youtubeChatDriver('4xDzrJKXOOY', 'KEY', auth.handlers, auth.io);
  await auth.settle();
  await auth.settle();
  assert.match(auth.statuses.at(-1), /sign-in.*public video or stream/);

  const ended = harness([[200, fixture('video-live.json')], [200, { ...fixture('chat-empty-page.json'), offlineAt: '2026-10-20T22:00:00Z' }]]);
  youtubeChatDriver('4xDzrJKXOOY', 'KEY', ended.handlers, ended.io);
  await ended.settle();
  await ended.settle();
  assert.match(ended.statuses.at(-1), /The live chat has ended\. Connect the stream again/);
  assert.equal(ended.pending().length, 0);
});

test('a dropped connection says so and tries again at 10 s', async () => {
  const h = harness([[200, fixture('video-live.json')], 'offline']);
  youtubeChatDriver('4xDzrJKXOOY', 'KEY', h.handlers, h.io);
  await h.settle();
  await h.settle();
  assert.match(h.statuses.at(-1), /Could not reach YouTube/);
  assert.equal(h.pending()[0].ms, 10000);
});

test('Pause stops the polling; Resume reads at once; stop ends it', async () => {
  const h = harness([[200, fixture('video-live.json')], [200, fixture('chat-first-page.json')], [200, fixture('chat-later-page.json')]]);
  const driver = youtubeChatDriver('4xDzrJKXOOY', 'KEY', h.handlers, h.io);
  await h.settle();
  await h.settle();
  driver.setPaused(true);
  assert.equal(h.pending().length, 0);
  driver.setPaused(false);
  await h.settle();
  await h.settle();
  assert.equal(h.messages.length, 71);
  driver.stop();
  assert.equal(h.pending().length, 0);
});

test('without a video or a key nothing is called', async () => {
  const h = harness([]);
  youtubeChatDriver('not a video', 'KEY', h.handlers, h.io);
  youtubeChatDriver('4xDzrJKXOOY', ' ', h.handlers, h.io);
  for (const t of h.timers) t.run();
  assert.equal(h.calls.length, 0);
  assert.match(h.statuses[0], /Not a YouTube video/);
  assert.match(h.statuses[1], /An API key is needed/);
});

test('the estimate: 3,600 units an hour against 10,000 is 2 h 46 min on a fresh day', () => {
  assert.equal(chatMinutesLeft(0), 166);
  assert.equal(chatMinutesLeft(611), 156, 'after the Q run spent 611');
  assert.equal(chatMinutesLeft(3600), 106, 'an hour of chat spends 3,600');
  assert.equal(chatMinutesLeft(9999), 0);
  assert.equal(chatMinutesLeft(12000), 0);
  assert.equal(quotaLine('chat'), "Live chat costs about 3,600 units an hour, so your key's 10,000 a day last about 2 h 46 min.");
  assert.equal(quotaLine('comments'), "Each fetch of the newest 100 comments costs 1 unit of your key's 10,000 a day.");
  assert.equal(
    quotaLine('chat', 611),
    "About 2 h 36 min of chat left today, counting this browser's use since midnight Pacific time; other users of the key are not counted.",
  );
  assert.match(quotaLine('chat', 9000), /^About 16 min of chat left today/);
});

test("the day is Pacific time: this browser's spend resets at midnight there", () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  const beforeMidnight = Date.parse('2026-10-21T06:59:00Z'); // 23:59 PDT on the 20th
  const afterMidnight = Date.parse('2026-10-21T07:00:00Z'); // 00:00 PDT on the 21st
  assert.equal(pacificDay(beforeMidnight), '2026-10-20');
  assert.equal(pacificDay(afterMidnight), '2026-10-21');
  recordSpend(storage, 5, beforeMidnight);
  recordSpend(storage, 5, beforeMidnight);
  assert.equal(spentToday(storage, beforeMidnight), 10);
  assert.equal(spentToday(storage, afterMidnight), 0);
  recordSpend(storage, 1, afterMidnight);
  assert.equal(spentToday(storage, afterMidnight), 1);
  // Winter time: midnight Pacific is 08:00 UTC.
  assert.equal(pacificDay(Date.parse('2026-12-01T07:59:00Z')), '2026-11-30');
  assert.equal(pacificDay(Date.parse('2026-12-01T08:00:00Z')), '2026-12-01');
  storage.setItem('spx-gfx-youtube-spend', 'not json');
  assert.equal(spentToday(storage, afterMidnight), 0);
});

test('the key is remembered only when asked, and forgotten on request', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  assert.equal(rememberedKey(storage), null);
  rememberKey(storage, ' KEY ');
  assert.equal(rememberedKey(storage), 'KEY');
  assert.equal(store.get('spx-gfx-youtube-key'), JSON.stringify({ v: 1, key: 'KEY' }));
  rememberKey(storage, null);
  assert.equal(rememberedKey(storage), null);
  assert.equal(store.size, 0);
});
