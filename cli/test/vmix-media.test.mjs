import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createVmixMedia, vmixMediaName } from '../dist/playout/vmixMedia.js';

async function mediaFixture(t, options = {}) {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'noacg-vmix-media-')));
  const root = path.join(base, 'Videos');
  await fs.mkdir(root);
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  return { base, root, media: createVmixMedia({ defaultFolder: async () => root, ...options }) };
}

function box(kind, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length + 8);
  head.write(kind, 4);
  return Buffer.concat([head, body]);
}
function movie(duration, scale = 1000, long = false) {
  const header = Buffer.alloc(100);
  header[0] = long ? 1 : 0;
  header.writeUInt32BE(scale, long ? 20 : 12);
  if (long) header.writeBigUInt64BE(BigInt(duration), 24);
  else header.writeUInt32BE(duration, 16);
  return box('moov', box('mvhd', header));
}
function wave(bytes, byteRate = 96000) {
  const b = Buffer.alloc(44 + bytes);
  b.write('RIFF');
  b.writeUInt32LE(b.length - 8, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(byteRate / 2, 24);
  b.writeUInt32LE(byteRate, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(bytes, 40);
  return b;
}

test('AC-9: list one level by media extension, with exact MP4, MOV and WAV header lengths', async t => {
  const { root, media } = await mediaFixture(t);
  await fs.mkdir(path.join(root, 'Promos'));
  await Promise.all([
    fs.writeFile(path.join(root, 'movie.mp4'), movie(12500)),
    fs.writeFile(path.join(root, 'movie-long.mov'), movie(9000, 3000, true)),
    fs.writeFile(path.join(root, 'sting.wav'), wave(48000)),
    fs.writeFile(path.join(root, 'still.png'), 'image'),
    fs.writeFile(path.join(root, 'audio.mp3'), 'audio'),
    fs.writeFile(path.join(root, 'ignore.txt'), 'private'),
    fs.writeFile(path.join(root, 'Promos', 'nested.mp4'), movie(7000)),
  ]);
  const items = await media.list(8099);
  assert.equal(items.length, 6);
  const byName = new Map(items.map(item => [item.name, item]));
  for (const item of items) assert.equal(item.path, item.name);
  assert.equal(byName.get('Promos').kind, 'folder');
  for (const [name, seconds] of [['movie.mp4', 12.5], ['movie-long.mov', 3], ['sting.wav', 0.5]]) {
    const item = byName.get(name);
    assert.equal(item.frames / item.fps, seconds);
  }
  assert.equal(byName.get('still.png').kind, 'still');
  assert.equal(byName.get('audio.mp3').kind, 'audio');
  assert.equal(byName.get('audio.mp3').frames, undefined);
  assert.deepEqual((await media.list(8099, 'Promos')).map(item => item.path), ['Promos/nested.mp4']);
});

test('AC-9: refuse every rooted, drive, traversal, stream or malformed relative path', async t => {
  const { media } = await mediaFixture(t);
  for (const name of ['..', '../clip.mp4', 'sub/../clip.mp4', '/clip.mp4', 'C:/clip.mp4', 'C:clip.mp4', '\\\\server\\share\\clip.mp4', '\\\\?\\C:\\clip.mp4', 'clip.mp4:stream', 'sub\\clip.mp4', './clip.mp4', 'a//b.mp4', 'con.mp4', 'LPT1.mp4', 'trailing./clip.mp4', 'space /clip.mp4', 'clip.mp4\0']) {
    assert.equal(vmixMediaName(name), false, name);
    await assert.rejects(media.file(8099, name), /inside the vMix media folder/, name);
    await assert.rejects(media.list(8099, name), /inside the vMix media folder/, name);
  }
});

test('AC-9: a directory link outside is neither browsed nor played and is hidden from the root list', async t => {
  const { base, root, media } = await mediaFixture(t);
  const outside = path.join(base, 'outside');
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'secret.mp4'), movie(3000));
  await fs.symlink(outside, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.deepEqual(await media.list(8099), []);
  await assert.rejects(media.list(8099, 'escape'), /inside the vMix media folder/);
  await assert.rejects(media.file(8099, 'escape/secret.mp4'), /inside the vMix media folder/);
  assert.equal(await media.relativeFile(8099, path.join(outside, 'secret.mp4')), undefined);
});

test('AC-9: genuine missing leaf reaches the checked parent, dangling links and non-directories refuse', async t => {
  const { base, root, media } = await mediaFixture(t);
  await fs.mkdir(path.join(root, 'sub'));
  assert.equal(await media.file(8099, 'sub/missing.mp4'), path.join(root, 'sub', 'missing.mp4'));
  await assert.rejects(media.file(8099, 'missing-parent/clip.mp4'), /inside the vMix media folder/);
  await fs.writeFile(path.join(root, 'file'), 'data');
  await assert.rejects(media.file(8099, 'file/clip.mp4'), /inside the vMix media folder/);
  const target = path.join(base, 'removed');
  await fs.mkdir(target);
  await fs.symlink(target, path.join(root, 'dangling'), process.platform === 'win32' ? 'junction' : 'dir');
  await fs.rmdir(target);
  await assert.rejects(media.file(8099, 'dangling/clip.mp4'), /inside the vMix media folder/);
});

test('AC-9: picker choice survives restart, cancellation preserves it and ports keep their own roots', async t => {
  const { base, root } = await mediaFixture(t);
  const chosen = path.join(base, 'Broadcast');
  await fs.mkdir(chosen);
  await fs.writeFile(path.join(chosen, 'clip.mp4'), movie(1000));
  const file = path.join(base, 'vmix-setup.json');
  const first = createVmixMedia({ file, defaultFolder: async () => root, picker: async () => chosen });
  assert.deepEqual(await first.chooseFolder(8099), { mediaFolder: chosen });
  const restarted = createVmixMedia({ file, defaultFolder: async () => root, picker: async () => undefined });
  assert.equal(await restarted.folder(8099), chosen);
  assert.equal(await restarted.folder(8100), root);
  assert.deepEqual(await restarted.chooseFolder(8099), { mediaFolder: chosen, cancelled: true });
  assert.equal((await restarted.list(8099))[0].name, 'clip.mp4');
});

test('AC-9: one open picker, no competing dialog, atomic field updates keep concurrent player keys', async t => {
  const { base, root } = await mediaFixture(t);
  let finish;
  let opened = 0;
  const chosen = path.join(base, 'Chosen');
  await fs.mkdir(chosen);
  const media = createVmixMedia({
    file: path.join(base, 'vmix-setup.json'), defaultFolder: async () => root,
    picker: () => { opened += 1; return new Promise(resolve => { finish = resolve; }); },
  });
  const picker = media.chooseFolder(8099);
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(media.chooseFolder(8100), /already open/);
  const key = 'fd235886-bd68-4d6b-a2ba-aa1962e09532';
  await media.keepPlayer(8099, 'clips', key, false);
  finish(chosen);
  await picker;
  const stored = await media.setup(8099);
  assert.equal(opened, 1);
  assert.equal(stored.root, chosen);
  assert.equal(stored.players.clips.key, key);
});

test('AC-9: storage writer claim and failed picker preserve the durable root', async t => {
  const { base, root } = await mediaFixture(t);
  const file = path.join(base, 'vmix-setup.json');
  let problem;
  const media = createVmixMedia({ file, defaultFolder: async () => root, picker: async () => { throw Error('blocked'); }, ownershipProblem: () => problem });
  problem = 'another Bridge owns the data directory';
  await assert.rejects(media.keepPlayer(8099, 'clips', 'fd235886-bd68-4d6b-a2ba-aa1962e09532', true), /another Bridge/);
  await assert.rejects(media.chooseFolder(8099), /another Bridge/);
  problem = undefined;
  await assert.rejects(media.chooseFolder(8099), /could not open/);
  assert.equal(await media.folder(8099), root);
  await assert.rejects(fs.stat(file), { code: 'ENOENT' });
});

test('AC-9: malformed and sparse movie headers cannot cause an unbounded read', async t => {
  const { root, media } = await mediaFixture(t);
  await fs.writeFile(path.join(root, 'bad.mp4'), Buffer.from([0, 0, 0, 1, 109, 111, 111, 118]));
  const file = await fs.open(path.join(root, 'sparse.mov'), 'w');
  const header = Buffer.alloc(8);
  header.writeUInt32BE(16 * 1024 * 1024);
  header.write('mdat', 4);
  await file.write(header);
  await file.write(movie(10000), 0, movie(10000).length, 16 * 1024 * 1024);
  await file.close();
  const items = new Map((await media.list(8099)).map(item => [item.name, item]));
  assert.equal(items.get('bad.mp4').frames, undefined);
  assert.equal(items.get('sparse.mov').frames / items.get('sparse.mov').fps, 10);
});

test('AC-9: closing Bridge aborts its owned picker and preserves the media root', async t => {
  const { root } = await mediaFixture(t);
  let signal;
  const media = createVmixMedia({
    defaultFolder: async () => root,
    picker: (initial, pending) => {
      signal = pending;
      return new Promise((resolve, reject) => pending.addEventListener('abort', () => reject(Error('closed')), { once: true }));
    },
  });
  const choosing = media.chooseFolder(8099);
  while (!signal) await new Promise(resolve => setImmediate(resolve));
  media.close();
  await assert.rejects(choosing, /could not open/);
  assert.equal(signal.aborted, true);
  assert.equal(await media.folder(8099), root);
});
