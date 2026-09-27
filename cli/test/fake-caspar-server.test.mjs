// The stateful fake CasparCG (./_fakeCasparServer.mjs), driven through the REAL Bridge adapter
// over a real socket. It pins the fake's model against docs/CLIP_PLAYBACK_PLAN.md §4 before any
// runner leans on it: a test double that is wrong about the server would make every later guard
// test prove the wrong thing. Run `npm run build` first.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { amcpSend } from '../dist/playout/amcp.js';
import { casparcgAdapter } from '../dist/playout/adapters/casparcg.js';
import { fakeCasparServer, manualClock, tokenize } from './_fakeCasparServer.mjs';

const MEDIA = {
  GIORNO: { kind: 'movie', seconds: 60, fps: 25 },
  INTRO_VT: { kind: 'movie', seconds: 20, fps: 25 },
  STING: { kind: 'audio', seconds: 4, fps: 25 },
  'JÄÄKIEKKO': { kind: 'still' },
};

/** A fresh fake, closed when the test ends however it ends: a failed assertion must not leave a
 *  listening socket holding the test process open. */
async function start(t, extra = {}) {
  const caspar = await fakeCasparServer({ media: MEDIA, templates: ['HOUSE_STRAP/HOUSE_STRAP'], channels: { 1: { fps: 25 }, 2: { fps: 50 } }, ...extra });
  const target = { adapter: 'casparcg', host: '127.0.0.1', port: caspar.port };
  const send = (line) => amcpSend({ host: '127.0.0.1', port: caspar.port }, line);
  t.after(() => caspar.close());
  return { caspar, target, send };
}

const slot = (channel, layer) => ({ adapter: 'casparcg', channel, layer });

test('the tokenizer reads quotes and escapes the way the server does', () => {
  assert.deepEqual(
    tokenize('PLAY 1-10 "A \\"B\\" C" LOOP').map((t) => t.text),
    ['PLAY', '1-10', 'A "B" C', 'LOOP'],
  );
  assert.equal(tokenize('LOADBG 1-10 "Jääkiekko"')[2].text, 'Jääkiekko');
});

test('the adapter\'s own lines drive the model: take, pause, resume and out on a clip', async (t) => {
  const { caspar, target } = await start(t);
  const take = await casparcgAdapter.act(target, { verb: 'take', item: { kind: 'media', name: 'GIORNO' }, slot: slot(2, 10) });
  assert.equal(take.ok, true);
  caspar.advance(12_000);
  let l = caspar.layer(2, 10);
  assert.equal(l.foreground.file, 'GIORNO');
  assert.equal(l.foreground.position, 12);
  assert.equal((await casparcgAdapter.act(target, { verb: 'pause', slot: slot(2, 10) })).ok, true);
  caspar.advance(5_000);
  assert.equal(caspar.layer(2, 10).foreground.position, 12, 'paused, the clip does not move');
  assert.equal(caspar.layer(2, 10).foreground.paused, true);
  await casparcgAdapter.act(target, { verb: 'resume', slot: slot(2, 10) });
  caspar.advance(3_000);
  l = caspar.layer(2, 10);
  assert.equal(l.foreground.position, 15);
  assert.equal(l.foreground.paused, false);
  await casparcgAdapter.act(target, { verb: 'out', slot: slot(2, 10), item: { kind: 'media', name: 'GIORNO' } });
  assert.equal(caspar.layer(2, 10).foreground, null);
  assert.deepEqual(caspar.seen, ['PLAY 2-10 "GIORNO"', 'PAUSE 2-10', 'RESUME 2-10', 'STOP 2-10']);
});

test('a clip that reaches its end holds its last frame; a looping one never ends', async (t) => {
  const { caspar, send } = await start(t);
  await send('PLAY 1-10 "INTRO_VT"');
  caspar.advance(25_000);
  const held = caspar.layer(1, 10).foreground;
  assert.equal(held.file, 'INTRO_VT');
  assert.equal(held.position, 20);
  assert.equal(held.ended, true);
  await send('PLAY 1-11 "INTRO_VT" LOOP');
  caspar.advance(45_000);
  const looping = caspar.layer(1, 11).foreground;
  assert.equal(looping.loop, true);
  assert.equal(looping.ended, false);
  assert.equal(looping.position, 5);
});

test('a still and the EMPTY colour never end, so AUTO behind them never fires', async (t) => {
  const { caspar, send } = await start(t);
  await send('PLAY 1-10 "JÄÄKIEKKO"');
  await send('LOADBG 1-10 "INTRO_VT" AUTO');
  caspar.advance(3_600_000);
  assert.equal(caspar.layer(1, 10).foreground.producer, 'still');
  assert.equal(caspar.layer(1, 10).background.file, 'INTRO_VT');
  await send('PLAY 1-11 EMPTY');
  await send('LOADBG 1-11 "INTRO_VT" AUTO');
  caspar.advance(3_600_000);
  assert.equal(caspar.layer(1, 11).foreground.producer, 'colour');
});

test('LOADBG … AUTO plays the background at the end, and at the instant it was due', async (t) => {
  const { caspar, send } = await start(t);
  await send('PLAY 1-10 "STING"');
  await send('LOADBG 1-10 "INTRO_VT" AUTO');
  caspar.advance(3_000);
  assert.equal(caspar.layer(1, 10).foreground.file, 'STING');
  // One jump well past the end: the follower started when the sting ended (a cut switches one
  // frame before the end, so the last frame is shown), not when the test looked.
  caspar.advance(7_000);
  const l = caspar.layer(1, 10);
  assert.equal(l.foreground.file, 'INTRO_VT');
  assert.equal(l.foreground.playedAt, 4_000 - 40);
  assert.equal(l.background, null);
  assert.equal(l.auto, false);
});

test('with MIX, AUTO starts the transition that many frames before the end', async (t) => {
  const { caspar, send } = await start(t);
  await send('PLAY 1-10 "STING"');
  await send('LOADBG 1-10 "INTRO_VT" MIX 25 AUTO');
  caspar.advance(2_999);
  assert.equal(caspar.layer(1, 10).foreground.file, 'STING');
  caspar.advance(1);
  assert.equal(caspar.layer(1, 10).foreground.file, 'INTRO_VT', 'a 25-frame MIX at 25p starts 1 s before the end');
});

test('LOADBG … AUTO onto an EMPTY layer plays at once', async (t) => {
  const { caspar, send } = await start(t);
  await send('LOADBG 1-10 "INTRO_VT" AUTO');
  assert.equal(caspar.layer(1, 10).foreground.file, 'INTRO_VT');
  // …and so does one queued onto a layer that was STOPPED: stop empties the foreground.
  await send('PLAY 1-11 "GIORNO"');
  await send('STOP 1-11');
  await send('LOADBG 1-11 "INTRO_VT" AUTO');
  assert.equal(caspar.layer(1, 11).foreground.file, 'INTRO_VT');
});

test('a PLAY of a missing file answers 404 and leaves the background and its AUTO armed', async (t) => {
  const { caspar, target, send } = await start(t);
  await send('PLAY 1-10 "STING"');
  await send('LOADBG 1-10 "INTRO_VT" AUTO');
  const refused = await casparcgAdapter.act(target, { verb: 'take', item: { kind: 'media', name: 'NOSUCHCLIP' }, slot: slot(1, 10) });
  assert.equal(refused.ok, false);
  assert.equal(refused.error.code, 'not-found');
  let l = caspar.layer(1, 10);
  assert.equal(l.foreground.file, 'STING');
  assert.equal(l.background.file, 'INTRO_VT');
  assert.equal(l.auto, true);
  caspar.advance(5_000);
  assert.equal(caspar.layer(1, 10).foreground.file, 'INTRO_VT', 'the old follower still airs');
  // A successful PLAY consumes the background and switches AUTO off.
  await send('LOADBG 1-10 "GIORNO" AUTO');
  await send('PLAY 1-10 "STING"');
  l = caspar.layer(1, 10);
  assert.equal(l.background, null);
  assert.equal(l.auto, false);
});

test('LOADBG without AUTO switches it off; STOP keeps the background; CLEAR removes both', async (t) => {
  const { caspar, send } = await start(t);
  await send('PLAY 1-10 "STING"');
  await send('LOADBG 1-10 "INTRO_VT" AUTO');
  await send('LOADBG 1-10 "GIORNO"');
  caspar.advance(10_000);
  let l = caspar.layer(1, 10);
  assert.equal(l.foreground.file, 'STING');
  assert.equal(l.background.file, 'GIORNO');
  assert.equal(l.auto, false);
  await send('STOP 1-10');
  l = caspar.layer(1, 10);
  assert.equal(l.foreground, null);
  assert.equal(l.background.file, 'GIORNO');
  await send('CLEAR 1-10');
  l = caspar.layer(1, 10);
  assert.equal(l.foreground, null);
  assert.equal(l.background, null);
});

test('the AUTO check runs before the pause check: paused inside the MIX window it still switches', async (t) => {
  const { caspar, send } = await start(t);
  // Paused BEFORE the window: nothing happens while paused, and the switch follows the resume.
  await send('PLAY 1-10 "STING"');
  await send('LOADBG 1-10 "INTRO_VT" MIX 25 AUTO');
  caspar.advance(2_000);
  await send('PAUSE 1-10');
  caspar.advance(60_000);
  assert.equal(caspar.layer(1, 10).foreground.file, 'STING');
  await send('RESUME 1-10');
  caspar.advance(1_000);
  assert.equal(caspar.layer(1, 10).foreground.file, 'INTRO_VT');

  // Paused, then a follower queued while the clip is already inside its last 25 frames: it
  // starts at once, and the switch clears the pause.
  await send('PLAY 1-11 "STING"');
  caspar.advance(3_500);
  await send('PAUSE 1-11');
  await send('LOADBG 1-11 "INTRO_VT" MIX 25 AUTO');
  const l = caspar.layer(1, 11);
  assert.equal(l.foreground.file, 'INTRO_VT');
  assert.equal(l.foreground.paused, false);
});

test('IN, OUT and LENGTH play a segment of the file, and INFO reports the segment apart from the file', async (t) => {
  const { caspar, send } = await start(t);
  // 250 frames in, 375 frames long at the clip's 25 fps: seconds 10 to 25 of GIORNO.
  await send('PLAY 1-10 "GIORNO" IN 250 LENGTH 375');
  caspar.advance(6_000);
  const l = caspar.layer(1, 10);
  assert.deepEqual(l.foreground.segment, { start: 10, length: 15 });
  assert.equal(l.foreground.position, 6);
  const info = await send('INFO 1');
  assert.equal(info.code, 201);
  const xml = info.lines[0];
  assert.match(xml, /<layer_10><foreground><producer>ffmpeg<\/producer><file><name>GIORNO<\/name>/);
  // file/time is the position in the WHOLE file and the whole file's length; file/clip the segment.
  assert.match(xml, /<time>16<\/time><time>60<\/time><clip>10<\/clip><clip>15<\/clip>/);
  caspar.advance(20_000);
  assert.equal(caspar.layer(1, 10).foreground.ended, true);
});

test('a command on a channel the server does not have is refused, and an unknown one is a 400', async (t) => {
  const { caspar, send } = await start(t);
  assert.equal((await send('PLAY 9-10 "GIORNO"')).code, 401);
  assert.equal((await send('FROB 1-10')).code, 400);
  assert.equal((await send('VERSION')).lines[0], '2.5.0 fake Stable');
});

test('the list commands answer in the shapes the adapter parses', async (t) => {
  const { caspar, target } = await start(t);
  const media = await casparcgAdapter.list(target, 'media');
  assert.equal(media.ok, true);
  const giorno = media.value.find((m) => m.name === 'GIORNO');
  assert.deepEqual({ kind: giorno.kind, frames: giorno.frames, fps: giorno.fps }, { kind: 'movie', frames: 1500, fps: 25 });
  const templates = await casparcgAdapter.list(target, 'template');
  assert.deepEqual(templates.value.map((t) => t.name), ['HOUSE_STRAP/HOUSE_STRAP']);
});

test('an intercept injects a fault without applying the command, and can hold a reply back', async (t) => {
  const clock = manualClock();
  let release;
  const held = new Promise((resolve) => (release = resolve));
  const { caspar, send } = await start(t, {
    clock,
    intercept: async (line) => {
      if (line.startsWith('PLAY 1-11')) return '404 PLAY FAILED\r\n';
      if (line.startsWith('LOADBG')) await held;
      return undefined;
    },
  });
  assert.equal((await send('PLAY 1-11 "GIORNO"')).code, 404);
  assert.equal(caspar.layer(1, 11).foreground, null, 'the refused command changed nothing');
  // A delayed reply: the LOADBG is received now and applied when the test lets it through.
  await send('PLAY 1-10 "STING"');
  const late = send('LOADBG 1-10 "INTRO_VT" AUTO');
  clock.advance(10_000);
  release();
  assert.equal((await late).code, 202);
  // Applied only once released, after the sting had ended: it lands on an ended clip and plays.
  assert.equal(caspar.layer(1, 10).foreground.file, 'INTRO_VT');
  assert.equal(caspar.layer(1, 10).foreground.playedAt, 10_000);
});
