// What NoaCG Bridge reads off the server for the clip clock (docs/CLIP_PLAYBACK_PLAN.md §6.7,
// phase 2): INFO read into the protocol's words, the slot memory that makes a reading usable, and
// the `/state` route, token and origin rules included. The parser is pinned against INFO answers
// captured from the real CasparCG 2.5.0 (cli/test/fixtures/info/), never against the fake; the
// route runs the real Bridge against the stateful fake. Run `npm run build` first.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { test } from 'node:test';
import { casparcgAdapter, readsState, slotReading } from '../dist/playout/adapters/casparcg.js';
import { parseInfo } from '../dist/playout/info.js';
import { createBridgeServer } from '../dist/playout/server.js';
import { LOADING_GRACE_MS, playsItem, SlotMemoryBank } from '../dist/playout/slots.js';
import { fakeCasparServer } from './_fakeCasparServer.mjs';

const FIXTURES = new URL('./fixtures/info/', import.meta.url);

/** One captured reply: the XML that followed `201 INFO OK`, and what made it. */
function fixture(name) {
  const f = JSON.parse(readFileSync(new URL(`${name}.json`, FIXTURES), 'utf8'));
  const body = f.reply.slice(f.reply.indexOf('\r\n') + 2).replace(/\r\n$/, '');
  return { ...f, body, slots: parseInfo(body).layers.map(slotReading) };
}

test('every captured INFO answer parses, and the channel says its own rate', () => {
  const names = readdirSync(FIXTURES).filter((f) => f.endsWith('.json') && f !== 'info-timing.json');
  assert.ok(names.length >= 17, `only ${names.length} fixtures`);
  for (const name of names) {
    const f = fixture(name.replace(/\.json$/, ''));
    assert.equal(f.server, '2.5.0 69e8ad5 Stable');
    const info = parseInfo(f.body);
    assert.equal(info.format, '1080p5000', name);
    assert.equal(info.fps, 50, name);
  }
  assert.deepEqual(fixture('empty-channel').slots, []);
});

test('a playing clip: the segment, and the position INTO it', () => {
  assert.deepEqual(fixture('video-playing').slots, [
    { layer: 10, producer: 'video', file: 'NOACG_FIXTURE/COUNT30', segment: { start: 0, length: 30 }, position: 1.08, paused: false, loop: false },
  ]);
  // An audio file is the same producer as a clip on 2.5.0: the page tells them apart by its list.
  assert.deepEqual(fixture('audio').slots, [
    { layer: 5, producer: 'video', file: 'NOACG_FIXTURE/SILENCE20', segment: { start: 0, length: 20 }, position: 1.12, paused: false, loop: false },
  ]);
});

test('THE SEGMENT ARITHMETIC: a trimmed clip counts its own length, never the file\'s', () => {
  // `SEEK 250 LENGTH 375` on a 25 fps file in a 50p channel: file/time [6.04, 30], file/clip
  // [5, 7.5]. 1.04 s into a 7.5 s segment, so 6.46 s remain - not 30 - 6.04 = 23.96.
  const [trimmed] = fixture('video-trimmed').slots;
  assert.deepEqual(trimmed.segment, { start: 5, length: 7.5 });
  assert.equal(trimmed.position, 1.04);
  assert.equal(Math.round((trimmed.segment.length - trimmed.position) * 100) / 100, 6.46);
  // `IN 250 OUT 625` reads back the same: OUT is a frame of the file, not a length.
  assert.deepEqual(fixture('video-in-out').slots[0].segment, { start: 5, length: 7.5 });
  // A segment that has played out holds its last frame, and its position sits at its length.
  const [held] = fixture('video-ended-holding').slots;
  assert.deepEqual(held.segment, { start: 2, length: 0.5 });
  assert.equal(held.position, 0.5);
});

test('paused, looping, and what waits behind a clip - with AUTO or without', () => {
  assert.equal(fixture('video-paused').slots[0].paused, true);
  assert.equal(fixture('video-looping').slots[0].loop, true);
  assert.deepEqual(fixture('video-queued-background').slots[0].queued, { file: 'NOACG_FIXTURE/COUNT30', auto: true });
  assert.deepEqual(fixture('video-queued-no-auto').slots[0].queued, { file: 'NOACG_FIXTURE/COUNT30', auto: false });
  const [pq] = fixture('video-paused-queued').slots;
  assert.equal(pq.paused, true);
  assert.deepEqual(pq.queued, { file: 'NOACG_FIXTURE/COUNT30', auto: true });
});

test('a MIX under way reads as the incoming clip, with how far the mix has got', () => {
  assert.deepEqual(fixture('video-mix-in-progress').slots, [
    {
      layer: 10,
      producer: 'video',
      file: 'NOACG_FIXTURE/COUNT30',
      segment: { start: 10, length: 20 },
      position: 0.6,
      paused: false,
      loop: false,
      transition: { progress: 0.32 },
    },
  ]);
});

test('a still, a web page, the empty colour, and a stopped layer each say what they are', () => {
  assert.deepEqual(fixture('still').slots, [{ layer: 10, producer: 'still', file: 'media\\giorno.jpg', paused: false, loop: false }]);
  assert.deepEqual(fixture('html').slots, [{ layer: 20, producer: 'html', file: 'about:blank', paused: false, loop: false }]);
  assert.deepEqual(fixture('colour-empty').slots, [{ layer: 10, producer: 'colour', paused: false, loop: false }]);
  assert.deepEqual(fixture('video-stopped').slots, [{ layer: 10, producer: 'empty', paused: false, loop: false }]);
  assert.deepEqual(
    fixture('clip-and-audio').slots.map((s) => [s.layer, s.file]),
    [
      [5, 'NOACG_FIXTURE/SILENCE20'],
      [10, 'NOACG_FIXTURE/COUNT30'],
    ],
  );
});

test('XML the Bridge cannot read is refused, never read as an empty channel', () => {
  assert.throws(() => parseInfo('<channel><stage><layer>'), /unclosed/);
  assert.throws(() => parseInfo('<channel></stage>'), /mismatched/);
  assert.throws(() => parseInfo('<?xml version="1.0"?><nothing/>'), /<channel>/);
  // Entities are decoded: a file name with an ampersand in it.
  const [l] = parseInfo('<channel><stage><layer><layer_1><foreground><file><name>A &amp; B</name></file><producer>ffmpeg</producer></foreground></layer_1></layer></stage></channel>')
    .layers.map(slotReading);
  assert.equal(l.file, 'A & B');
});

test('which servers can be read: 2.3 and later', () => {
  assert.equal(readsState('2.5.0 69e8ad5 Stable'), true);
  assert.equal(readsState('2.3.2 4de6d18f Dev'), true);
  assert.equal(readsState('2.2.0'), false);
  assert.equal(readsState(''), false);
  assert.deepEqual(casparcgAdapter.capabilities('2.5.0 69e8ad5 Stable').target, ['state']);
  assert.deepEqual(casparcgAdapter.capabilities('2.0.7').target, []);
});

// ── The slot memory ─────────────────────────────────────────────────────────────────────────

const target = { adapter: 'casparcg', host: '127.0.0.1', port: 5250 };
const slot = (channel, layer) => ({ adapter: 'casparcg', channel, layer });
const clip = { kind: 'media', name: 'NOACG_FIXTURE/COUNT30' };
const reading = (over = {}) => ({ layer: 10, producer: 'video', file: 'NOACG_FIXTURE/COUNT30', segment: { start: 0, length: 30 }, position: 1, paused: false, loop: false, ...over });

test('a still and a template match by their path on the server; a clip by its name', () => {
  assert.equal(playsItem({ kind: 'media', name: 'GIORNO' }, 'media\\giorno.jpg'), true);
  assert.equal(playsItem({ kind: 'media', name: 'SPORTS/GOAL' }, 'media/SPORTS/goal.mov'), true);
  assert.equal(playsItem({ kind: 'template', name: 'HOUSE_STRAP/HOUSE_STRAP' }, 'template/HOUSE_STRAP/HOUSE_STRAP.html'), true);
  assert.equal(playsItem(clip, 'NOACG_FIXTURE/COUNT30'), true);
  assert.equal(playsItem(clip, 'NOACG_FIXTURE/COUNT300'), false);
  assert.equal(playsItem({ kind: 'url', name: 'https://x/output' }, 'https://x/output'), true);
});

/** A take as the server route runs one: the generation moves, the command is answered, and an
 *  accepted take is recorded. */
function takeOn(m, cueId) {
  m.advance(target, slot(2, 10));
  m.settled(target, slot(2, 10));
  return m.started(target, slot(2, 10), clip, cueId);
}

test('generations move before a command, and an instance lives only while its clip plays', () => {
  let now = 0;
  const m = new SlotMemoryBank('s1', () => now);
  assert.equal(m.generation(target, slot(2, 10)), 0);
  assert.equal(m.advance(target, slot(2, 10)), 1);
  m.settled(target, slot(2, 10));
  const id = m.started(target, slot(2, 10), clip, 'cue-7');
  assert.equal(id, 's1.1');
  now += LOADING_GRACE_MS + 1;

  let [s] = m.annotate(target, 2, [reading({ position: 1 })]);
  assert.deepEqual([s.generation, s.instance, s.cueId], [1, 's1.1', 'cue-7']);
  // Still the same clip, moving on: still this Bridge's.
  [s] = m.annotate(target, 2, [reading({ position: 1.5 })]);
  assert.equal(s.instance, 's1.1');
  // Somebody else played the same file again from the top: the position jumped BACK.
  [s] = m.annotate(target, 2, [reading({ position: 0.2 })]);
  assert.equal(s.instance, undefined, 'a restart by another client is not this Bridge\'s clip');
  assert.equal(s.generation, 1);
});

test('just after a take the layer may not hold the clip yet: that is arriving, not gone', () => {
  // The real 2.5.0 answers `202 PLAY OK` before the clip is on the layer: an INFO a few
  // milliseconds later showed the layer empty (measured 2026-09-28). The instance stands through
  // that, and only through that.
  let now = 10_000;
  const m = new SlotMemoryBank('s1', () => now);
  const empty = reading({ producer: 'empty', file: undefined, segment: undefined, position: undefined });
  takeOn(m, 'cue-1');
  let [s] = m.annotate(target, 2, [empty]);
  assert.deepEqual([s.producer, s.instance, s.cueId, s.arriving], ['empty', 's1.1', 'cue-1', true], 'still arriving');
  // The cut into it, from the capture: the clip is there, and it is this Bridge's.
  now += 130;
  const [cut] = parseInfo(fixture('video-just-played').body).layers.map(slotReading);
  [s] = m.annotate(target, 2, [cut]);
  assert.deepEqual([s.producer, s.file, s.instance, s.arriving], ['video', 'NOACG_FIXTURE/COUNT30', 's1.1', undefined]);
  // Once the grace is spent, an empty layer means it is gone.
  now += LOADING_GRACE_MS;
  [s] = m.annotate(target, 2, [empty]);
  assert.equal(s.instance, undefined);

  // A RE-TAKE of the same file: for a moment the layer still shows it at its END. That reading
  // cannot be the new clip yet (it is further in than the time since the take), so it is arriving
  // - and the jump back to the start that follows is the take itself, not somebody else's.
  takeOn(m, 'cue-1');
  [s] = m.annotate(target, 2, [reading({ file: 'NOACG_FIXTURE/COUNT30', position: 30, segment: { start: 0, length: 30 } })]);
  assert.deepEqual([s.instance, s.arriving], ['s1.2', true]);
  now += 200;
  [s] = m.annotate(target, 2, [reading({ file: 'NOACG_FIXTURE/COUNT30', position: 0.2, segment: { start: 0, length: 30 } })]);
  assert.deepEqual([s.instance, s.arriving], ['s1.2', undefined]);

  // And a clip that never arrives is gone once the grace is spent.
  takeOn(m);
  now += LOADING_GRACE_MS + 1;
  [s] = m.annotate(target, 2, [empty]);
  assert.equal(s.instance, undefined);
});

test('another file, an empty layer or a cleared one ends the instance; a loop may wrap', () => {
  // Every reading here comes well after its take: each look at the clock moves it past the grace.
  let t = 0;
  const m = new SlotMemoryBank('s1', () => (t += LOADING_GRACE_MS + 1));
  takeOn(m);
  // A loop wraps to its start every time round: that is not a restart.
  let [s] = m.annotate(target, 2, [reading({ position: 29, loop: true })]);
  [s] = m.annotate(target, 2, [reading({ position: 0.1, loop: true })]);
  assert.equal(s.instance, 's1.1');
  [s] = m.annotate(target, 2, [reading({ file: 'OTHER' })]);
  assert.equal(s.instance, undefined);

  takeOn(m);
  [s] = m.annotate(target, 2, [reading({ producer: 'empty', file: undefined })]);
  assert.equal(s.instance, undefined);

  // The server no longer reports the layer at all: it is reported empty, with its generation, so
  // a page still learns the slot moved on.
  takeOn(m);
  assert.deepEqual(m.annotate(target, 2, []), [{ layer: 10, producer: 'empty', paused: false, loop: false, generation: 3 }]);
  // Nothing of another channel leaks into this one.
  assert.deepEqual(m.annotate(target, 20, []), []);
});

// ── The route, against the stateful fake ────────────────────────────────────────────────────

const TOKEN = 'a'.repeat(64);

async function bridge(t, caspar) {
  // The Bridge's clock is the fake server's, so a test that moves the server's time moves the
  // Bridge's with it: a reading four seconds into a clip comes four seconds after its take.
  const server = createBridgeServer(
    {
      token: TOKEN,
      origins: ['https://noacg.studio'],
      adapters: [casparcgAdapter],
      version: '0.4.2',
      memory: new SlotMemoryBank('b1', () => caspar.clock.now()),
    },
    () => {},
  );
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const port = server.address().port;
  const call = (path, body, headers = {}) =>
    new Promise((resolve, reject) => {
      const data = body === undefined ? undefined : JSON.stringify(body);
      const req = httpRequest(
        {
          host: '127.0.0.1',
          port,
          path,
          method: data === undefined ? 'GET' : 'POST',
          headers: {
            host: `127.0.0.1:${port}`,
            ...(data === undefined ? {} : { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }),
            ...headers,
          },
        },
        (res) => {
          let raw = '';
          res.on('data', (c) => (raw += c));
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: raw ? JSON.parse(raw) : null }));
        },
      );
      req.on('error', reject);
      req.end(data);
    });
  const casparTarget = { adapter: 'casparcg', host: '127.0.0.1', port: caspar.port };
  return { call, casparTarget };
}

test('/health says the Bridge reads state; /status says this server can be read', async (t) => {
  const caspar = await fakeCasparServer({ media: { GIORNO: { kind: 'movie', seconds: 60, fps: 25 } }, channels: { 2: { fps: 50 } } });
  t.after(() => caspar.close());
  const { call, casparTarget } = await bridge(t, caspar);
  const health = await call('/health');
  assert.deepEqual(health.body.features, ['state']);
  const status = await call('/status', { target: casparTarget });
  assert.deepEqual(status.body.capabilities, ['state']);
});

test('/state reads a channel, and every action\'s reply carries the slot\'s generation', async (t) => {
  const caspar = await fakeCasparServer({ media: { GIORNO: { kind: 'movie', seconds: 60, fps: 25 } }, channels: { 2: { fps: 50 } } });
  t.after(() => caspar.close());
  const { call, casparTarget } = await bridge(t, caspar);
  const at = { adapter: 'casparcg', channel: 2, layer: 10 };

  const take = await call('/act', { target: casparTarget, action: { verb: 'take', item: { kind: 'media', name: 'GIORNO' }, slot: at, cueId: 'cue-1' } });
  assert.deepEqual([take.body.ok, take.body.generation, take.body.session, take.body.instance], [true, 1, 'b1', 'b1.1']);
  caspar.advance(4_000);
  let state = await call('/state', { target: casparTarget, channel: 2 });
  assert.equal(state.body.ok, true);
  assert.equal(state.body.session, 'b1');
  assert.equal(typeof state.body.observedAt, 'number');
  assert.deepEqual(state.body.slots, [
    { layer: 10, producer: 'video', file: 'GIORNO', segment: { start: 0, length: 60 }, position: 4, paused: false, loop: false, generation: 1, instance: 'b1.1', cueId: 'cue-1' },
  ]);

  // Pause does not move the generation; Out does, and ends the instance.
  const pause = await call('/act', { target: casparTarget, action: { verb: 'pause', slot: at } });
  assert.equal(pause.body.generation, 1);
  const out = await call('/act', { target: casparTarget, action: { verb: 'out', slot: at, item: { kind: 'media', name: 'GIORNO' } } });
  assert.deepEqual([out.body.generation, out.body.instance], [2, undefined]);
  state = await call('/state', { target: casparTarget, channel: 2 });
  assert.deepEqual(state.body.slots, [{ layer: 10, producer: 'empty', paused: false, loop: false, generation: 2 }]);

  // A take the server refuses still moved the generation: whatever reading was on its way is older.
  const refused = await call('/act', { target: casparTarget, action: { verb: 'take', item: { kind: 'media', name: 'NOT_THERE' }, slot: at } });
  assert.equal(refused.body.ok, false);
  state = await call('/state', { target: casparTarget, channel: 2 });
  assert.equal(state.body.slots[0].generation, 3);
});

test('a reading taken while a take is still in flight counts as from before it', async (t) => {
  // The page's poll can reach the Bridge between a Take's generation moving and its instance being
  // recorded. That reading must carry the OLD generation, or the page reads "your clip is not
  // there" under the new number and takes a clip that just went on air off its rows.
  let release;
  const caspar = await fakeCasparServer({
    media: { GIORNO: { kind: 'movie', seconds: 60, fps: 25 } },
    channels: { 2: { fps: 50 } },
    intercept: async (line) => {
      if (line.startsWith('PLAY')) await new Promise((r) => (release = r));
      return undefined;
    },
  });
  t.after(() => caspar.close());
  const { call, casparTarget } = await bridge(t, caspar);
  const at = { adapter: 'casparcg', channel: 2, layer: 10 };
  const taking = call('/act', { target: casparTarget, action: { verb: 'take', item: { kind: 'media', name: 'GIORNO' }, slot: at, cueId: 'cue-1' } });
  while (!release) await new Promise((r) => setTimeout(r, 5));
  const during = await call('/state', { target: casparTarget, channel: 2 });
  assert.deepEqual(during.body.slots, [{ layer: 10, producer: 'empty', paused: false, loop: false, generation: 0 }]);
  release();
  const take = await taking;
  assert.deepEqual([take.body.generation, take.body.instance], [1, 'b1.1']);
  const after = await call('/state', { target: casparTarget, channel: 2 });
  assert.deepEqual([after.body.slots[0].generation, after.body.slots[0].instance], [1, 'b1.1']);
});

test('/state is token-checked and origin-checked like every other route, and asks for a channel', async (t) => {
  const caspar = await fakeCasparServer({ channels: { 2: { fps: 50 } } });
  t.after(() => caspar.close());
  const { call, casparTarget } = await bridge(t, caspar);
  const noToken = await call('/state', { target: casparTarget, channel: 2 }, { authorization: '' });
  assert.equal(noToken.status, 401);
  const foreign = await call('/state', { target: casparTarget, channel: 2 }, { origin: 'https://evil.example' });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers['access-control-allow-origin'], undefined);
  const noChannel = await call('/state', { target: casparTarget });
  assert.equal(noChannel.status, 400);
  assert.match(noChannel.body.error.detail, /whole channel/);
});

test('a target that cannot report its state says so, on the Bridge\'s own hop', async (t) => {
  const caspar = await fakeCasparServer({ channels: { 2: { fps: 50 } } });
  t.after(() => caspar.close());
  const server = createBridgeServer(
    { token: TOKEN, origins: [], adapters: [{ ...casparcgAdapter, state: undefined }], version: '0.4.2' },
    () => {},
  );
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const port = server.address().port;
  const reply = await fetch(`http://127.0.0.1:${port}/state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ target: { adapter: 'casparcg', host: '127.0.0.1', port: caspar.port }, channel: 2 }),
  }).then((r) => r.json());
  assert.deepEqual(reply.error, { hop: 'agent', code: 'unsupported', detail: 'A casparcg target cannot report what it is playing.' });
});
