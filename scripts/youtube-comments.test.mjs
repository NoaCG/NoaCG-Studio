// guards: src/audience/youtubeComments.ts
//
// YOUTUBE COMMENTS ON A VIDEO (audience-flow AC-4, AC-8; data-sources C3), on recorded answers.
// The fixtures in scripts/fixtures/youtube/ carry the shapes, counts and times the Q record measured
// (docs/work-specs/data-sources/evidence/youtube.md); their text, names and ids are invented, and
// no test calls the live API. What is pinned: one call asks for the newest 100 as plain text; the
// first page is kept whole and sorted by its own times, so the old pinned comment the record found
// in the first slot goes last; each comment's identity is its thread id; the platform word is
// provenance, never the name; each refusal says what to do next; a fetch costs one unit.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const { COMMENTS_SOURCE, commentsUrl, fetchComments, readCommentThreads } = await import('../src/audience/youtubeComments.ts');

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/youtube/${name}`, import.meta.url), 'utf8'));
const answer = (status, body) => async () => ({ ok: status < 300, status, json: async () => body });

test('one call asks for the newest 100 comments as plain text, with the key as a parameter', () => {
  const url = new URL(commentsUrl('jNQXAC9IVRw', 'KEY'));
  assert.equal(url.origin + url.pathname, 'https://www.googleapis.com/youtube/v3/commentThreads');
  assert.equal(url.searchParams.get('videoId'), 'jNQXAC9IVRw');
  assert.equal(url.searchParams.get('maxResults'), '100');
  assert.equal(url.searchParams.get('order'), 'time');
  assert.equal(url.searchParams.get('textFormat'), 'plainText');
  assert.equal(url.searchParams.get('part'), 'snippet');
  assert.equal(url.searchParams.get('key'), 'KEY');
});

test('the first page is kept whole, newest first, and the old pinned comment goes last', async () => {
  const page = fixture('comment-threads-page.json');
  assert.equal(page.items.length, 100);
  assert.equal(page.items[0].snippet.topLevelComment.snippet.publishedAt.slice(0, 10), '2020-02-17');
  const read = await fetchComments(answer(200, page), 'jNQXAC9IVRw', 'KEY');
  assert.equal(read.ok, true);
  assert.equal(read.items.length, 100);
  assert.equal(read.items[0].body, 'Comment number 1');
  assert.equal(read.items[98].body, 'Comment number 99');
  assert.equal(read.items[99].body, 'Comment number 0', 'the 2020 comment is the oldest, not the newest');
  assert.equal(new Set(read.items.map((i) => i.externalId)).size, 100);
  // Whatever order the page holds them in, the candidates come out newest first.
  const shuffled = { ...page, items: [...page.items].reverse() };
  const again = readCommentThreads(shuffled).map((i) => i.body);
  assert.deepEqual(again, read.items.map((i) => i.body));
});

test('a comment is its thread id, its author without the @, and "YouTube comments" as provenance', () => {
  const [item] = readCommentThreads(fixture('comment-threads-page.json'));
  assert.deepEqual(item, { author: 'viewer1', body: 'Comment number 1', externalId: 'yt:Ugthread0001', source: 'YouTube comments' });
  assert.equal(COMMENTS_SOURCE, 'YouTube comments');
  assert.doesNotMatch(item.author, /YouTube/);
});

test('an empty comment and a thread without an id are skipped', () => {
  const page = fixture('comment-threads-page.json');
  page.items[1].snippet.topLevelComment.snippet.textOriginal = '  ';
  page.items[1].snippet.topLevelComment.snippet.textDisplay = '';
  delete page.items[2].id;
  delete page.items[2].snippet.topLevelComment.id;
  assert.equal(readCommentThreads(page).length, 98);
});

test('each refusal names the problem and the next action; a fetch costs one unit', async () => {
  const cases = [
    [404, 'error-video-not-found.json', /No such video/, /Check the link/],
    [401, 'error-authorization-required.json', /sign-in/, /public video/],
    [403, 'error-quota-exceeded.json', /quota for today/, /midnight Pacific/],
  ];
  for (const [status, name, error, fix] of cases) {
    const read = await fetchComments(answer(status, fixture(name)), 'jNQXAC9IVRw', 'KEY');
    assert.equal(read.ok, false, name);
    assert.match(read.error, error, name);
    assert.match(read.fix, fix, name);
    assert.equal(read.units, 1, name);
  }
  const disabled = await fetchComments(answer(403, { error: { errors: [{ reason: 'commentsDisabled' }] } }), 'x', 'KEY');
  assert.match(disabled.error, /Comments are turned off/);
  const badKey = await fetchComments(answer(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', errors: [{ reason: 'badRequest' }] } }), 'x', 'KEY');
  assert.match(badKey.error, /API key was not accepted/);
  const ok = await fetchComments(answer(200, fixture('comment-threads-page.json')), 'x', 'KEY');
  assert.equal(ok.units, 1);
});

test('no key, or no network, costs nothing and says what to do', async () => {
  let called = false;
  const none = await fetchComments(async () => ((called = true), null), 'x', '  ');
  assert.equal(called, false);
  assert.equal(none.units, 0);
  assert.match(none.fix, /API key/);
  const offline = await fetchComments(async () => {
    throw new TypeError('fetch failed');
  }, 'x', 'KEY');
  assert.equal(offline.ok, false);
  assert.equal(offline.units, 0);
  assert.match(offline.error, /Could not reach YouTube/);
});
