// Native picture Fit, including asynchronous LOADBG, refused preparation and ownership.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCasparcgAdapter } from '../dist/playout/adapters/casparcg.js';
import { pictureCanvas, pictureFilter, pictureUrl } from '../dist/playout/picture.js';
import { readAction } from '../dist/playout/server.js';
import { fakeCaspar } from './_fakeCaspar.mjs';

const slot = { adapter: 'casparcg', channel: 2, layer: 90 };
const item = { kind: 'media', name: 'G1/PHOTO' };
const action = { verb: 'take', slot, item, imageFit: 'fit' };
const source = 'C:/Caspar/media/G1/PHOTO.jpg';
const escaped = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const image = path => `<producer>transition</producer><transition><producer>image</producer><type>cut</type><frame>0</frame><frame>1</frame></transition><file><path>${escaped(path)}</path></file>`;
const video = path => `<producer>ffmpeg</producer><file><name>${escaped(path)}</name><clip>0</clip><clip>0.04</clip><time>0.04</time><time>0.04</time></file>`;
const info = (bg, fg = '<producer>color</producer><color>#00ff00</color>') => `201 INFO OK\r\n<channel><format>1080p5000</format><framerate>50</framerate><framerate>1</framerate><stage><layer><layer_90><foreground>${fg}</foreground><background>${bg}</background></layer_90></layer></stage></channel>\r\n`;

test('Fit addresses the server file literally and produces an opaque held frame', () => {
  assert.equal(pictureUrl(source), 'file:C://Caspar/media/G1/PHOTO.jpg');
  assert.equal(pictureUrl('media\\G1\\PHOTO.jpg', 'C:\\Caspar\\'), 'file:C://Caspar/media/G1/PHOTO.jpg');
  assert.equal(pictureUrl('/srv/media/a b.png'), 'file:///srv/media/a b.png');
  assert.equal(pictureUrl('C:\\media\\photo .png'), 'file:C://media/photo .png');
  assert.throws(() => pictureUrl('media/a.png'), /absolute initial path/);
  assert.throws(() => pictureUrl('C:/x.png\rCLEAR 2'), /control character/);
  assert.throws(() => pictureUrl('C:/x.tiff'), /cannot pad/);
  assert.throws(() => pictureCanvas('custom'), /cannot determine/);
  assert.match(pictureFilter(pictureCanvas('1080p5000')), /pad=1920:1080:.*color=black/);
  assert.match(pictureFilter(pictureCanvas('720p5994')), /tpad=stop_mode=clone:stop=-1$/);
});

test('Fit rejects incompatible playback instead of silently dropping it', () => {
  assert.equal(readAction({ action }).imageFit, 'fit');
  for (const extra of [{ loop: true }, { playback: { trim: { in: 1 } } }, { playback: { end: 'clear' } }, { playback: { fadeOut: 1 } }]) {
    assert.throws(() => readAction({ action: { ...action, ...extra } }), /without a loop, trim or automatic ending/);
  }
  for (const invalid of [{ verb: 'out' }, { imageFit: 'crop' }, { item: { kind: 'template', name: 'T' } }]) {
    assert.throws(() => readAction({ action: { ...action, ...invalid } }), /imageFit|still media/);
  }
});

test('Fit waits for the requested background and reports the original still name without a timer', async () => {
  let checks = 0;
  let playing = false;
  const url = pictureUrl(source);
  const server = await fakeCaspar(line => {
    if (line.startsWith('LOADBG')) return '202 LOADBG OK\r\n';
    if (line.startsWith('PLAY')) { playing = true; return '202 PLAY OK\r\n'; }
    if (line === 'INFO 2') return playing ? info('<producer>empty</producer>', video(url)) : info(image(++checks === 1 ? 'C:/Caspar/media/OLD.jpg' : source));
    return '400 ERROR\r\n';
  });
  try {
    const adapter = createCasparcgAdapter();
    const target = { adapter: 'casparcg', host: '127.0.0.1', port: server.port };
    const result = await adapter.act(target, action, { follower: { file: 'NEXT' } });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(result.value, { follower: null });
    assert.equal(checks, 2, 'a stale background must not become the new cue');
    assert.equal(server.seen[0], 'LOADBG 2-90 "G1/PHOTO" SCALE_MODE FIT');
    assert.match(server.seen.at(-1), /^PLAY 2-90 "file:C:\/\/Caspar\/media\/G1\/PHOTO.jpg" VF /);
    assert.ok(!server.seen.some(line => /AUTO|CLEAR/.test(line)));
    const state = await adapter.state(target, 2);
    assert.equal(state.ok, true);
    assert.equal(state.value[0].producer, 'still');
    assert.equal(state.value[0].file, item.name);
    assert.equal(state.value[0].position, undefined);
    assert.equal(state.value[0].segment, undefined);
    assert.ok(adapter.capabilities('2.5.0').target.includes('image-fit'));
    assert.ok(!adapter.capabilities('2.3.3').target.includes('image-fit'));
  } finally { await server.close(); }
});

test('a failed padded Take keeps foreground and disarms the background follower', async () => {
  const server = await fakeCaspar(line => line.startsWith('INFO') ? info(image(source)) : line.startsWith('PLAY') ? '404 PLAY FAILED\r\n' : '202 LOADBG OK\r\n');
  try {
    const adapter = createCasparcgAdapter();
    const result = await adapter.act({ adapter: 'casparcg', host: '127.0.0.1', port: server.port }, action, { follower: { file: 'NEXT' } });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'not-found');
    assert.equal(result.follower, null);
    assert.equal(server.seen.at(-1), 'LOADBG 2-90 EMPTY');
    assert.ok(!server.seen.some(line => /STOP|CLEAR/.test(line)), 'current foreground is never cleared');
  } finally { await server.close(); }
});

test('an unpaddable format is refused before replacing foreground', async () => {
  const server = await fakeCaspar(line => line.startsWith('INFO') ? info(image('C:/Caspar/media/G1/PHOTO.tiff')) : '202 LOADBG OK\r\n');
  try {
    const result = await createCasparcgAdapter().act({ adapter: 'casparcg', host: '127.0.0.1', port: server.port }, action);
    assert.equal(result.ok, false);
    assert.match(result.error.detail, /cannot pad/);
    assert.equal(server.seen.at(-1), 'LOADBG 2-90 EMPTY');
    assert.ok(!server.seen.some(line => line.startsWith('PLAY ')));
  } finally { await server.close(); }
});
