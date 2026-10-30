// guards: src/audience/chatIntake.ts
//
// YOUTUBE LINES THROUGH THE OPERATOR DOOR (data-sources C3; audience-flow AC-4, AC-8), on the
// recorded shapes in scripts/fixtures/youtube/ and a fake operator door. Pinned: a page goes in at
// most 100 a call with its platform id as identity, the first page marked earlier and the name
// without the platform word; a door that refuses a whole page for a moment loses nothing, because
// a round of refused chunks is one try, and three retries follow the first send (a page of 400 failing once must not exceed it).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import './lib/tsResolve.mjs';

const { CHAT_ADD_RETRY_MS, CHAT_ADD_TRIES, createChatIntake } = await import('../src/audience/chatIntake.ts');

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/youtube/${name}`, import.meta.url), 'utf8'));

/** A first chat page of `n` lines in the recorded shape, then quiet pages. */
function stubYouTube(n) {
  const first = fixture('chat-first-page.json');
  const template = first.items[0];
  first.items = Array.from({ length: n }, (_, i) => ({
    ...template,
    id: `LCC.big${i}`,
    snippet: { ...template.snippet, displayMessage: `Line ${i}` },
    authorDetails: { ...template.authorDetails, channelId: `UCbig${i}`, displayName: `Chatter ${i}` },
  }));
  let pages = 0;
  globalThis.fetch = async (url) => {
    const body = String(url).includes('/videos?') ? fixture('video-live.json') : pages++ === 0 ? first : fixture('chat-empty-page.json');
    return { ok: true, status: 200, json: async () => body };
  };
}

test('the retry figures are 5 s and three retries', () => {
  assert.equal(CHAT_ADD_RETRY_MS, 5000);
  assert.equal(CHAT_ADD_TRIES, 3);
});

test('a page of 400 refused once arrives whole after one retry, 100 a call, with its identity', async (t) => {
  stubYouTube(400);
  const added = [];
  const calls = [];
  let refuse = true;
  const intake = createChatIntake();
  intake.setAdd(async (items) => {
    calls.push(items.length);
    if (refuse) throw new Error('offline for a moment');
    added.push(...items);
    return items.map((i, n) => ({ id: `row${added.length + n}`, ...i }));
  });
  intake.add({ platform: 'youtube', videoId: '4xDzrJKXOOY', apiKey: 'KEY', sourceId: 'y1' });
  t.after(() => intake.stopAll());
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(calls, [100, 100, 100, 100], 'the first round: four chunks, all refused');
  assert.equal(added.length, 0);
  refuse = false;
  await new Promise((r) => setTimeout(r, CHAT_ADD_RETRY_MS + 200));
  assert.equal(added.length, 400, 'nothing was dropped');
  assert.ok(calls.slice(4).every((n) => n <= 100));
  const [line] = added;
  assert.deepEqual(line, { author: 'Chatter 0', body: 'Line 0', externalId: 'yt:LCC.big0', source: 'YouTube chat · earlier' });
  const state = intake.forSource('y1');
  assert.equal(state.submitted, 400);
  assert.equal(state.dropped, 0);
  intake.stopAll();
});

test('a door that keeps refusing drops the lines after three retries, and says so in the count', async (t) => {
  stubYouTube(5);
  const intake = createChatIntake();
  let calls = 0;
  intake.setAdd(async () => {
    calls += 1;
    throw new Error('down');
  });
  intake.add({ platform: 'youtube', videoId: '4xDzrJKXOOY', apiKey: 'KEY', sourceId: 'y2' });
  t.after(() => intake.stopAll());
  await new Promise((r) => setTimeout(r, 3 * CHAT_ADD_RETRY_MS + 500));
  assert.equal(calls, 4, 'the first send and three retries');
  assert.equal(intake.forSource('y2').dropped, 5);
  intake.stopAll();
});
