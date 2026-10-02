// State renders: `screenshot --event/--at/--background` and `validate --screenshots`' state walk,
// on the built CLI against a live NoaCG bridge (NOACG_URL); skips when none answers, like
// smoke.test.mjs. Run `npm run build` first.
//
// The fixture (fixtures/state-timer) is a small machine graphic with THREE groups: `main`
// (on air -> Revealed, a green bar), `timer` (hidden <-> running, a countdown from Seconds (f1)
// that paints ceil(seconds left)), and `score` (Add point, which carries f2+1). Its time-offset
// checks compare two renders that must show the SAME countdown digit by different roads, so they
// prove the offset without reading any text off the frame.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { inflateSync } from 'node:zlib';
import { test } from 'node:test';

const exec = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, '..', 'dist', 'index.js');
const fixture = path.join(here, 'fixtures', 'state-timer');
const url = process.env.NOACG_URL?.replace(/\/+$/, '');

async function bridgeUp() {
  if (!url) return false;
  try {
    const res = await fetch(`${url}/bridge`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function run(args) {
  try {
    const { stdout, stderr } = await exec(process.execPath, [cli, ...args], { maxBuffer: 64 * 1024 * 1024 });
    return { code: 0, stdout, stderr };
  } catch (e) {
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

/** Decode an 8-bit, non-interlaced RGB or RGBA PNG (what Chromium writes) into RGBA pixels. */
function decodePng(buf) {
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, 'bit depth 8');
      colorType = data[9];
      assert.ok(colorType === 6 || colorType === 2, `colour type ${colorType}`);
      assert.equal(data[12], 0, 'not interlaced');
    } else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const px = Buffer.alloc(width * height * bpp);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = v & 0xff;
    }
  }
  const at = (x, y) => {
    const i = (y * width + x) * bpp;
    return [px[i], px[i + 1], px[i + 2], bpp === 4 ? px[i + 3] : 255];
  };
  return { width, height, at, pixels: px, bpp };
}

const up = await bridgeUp();
const skip = up ? false : `no NoaCG bridge at NOACG_URL=${url ?? '(unset)'} - start a dev server and set NOACG_URL`;
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'noacg-states-'));

async function shot(name, ...args) {
  const file = path.join(dir, `${name}.png`);
  const r = await run(['screenshot', fixture, '--out', file, '--json', ...args]);
  assert.equal(r.code, 0, r.stderr);
  return { json: JSON.parse(r.stdout), png: await fs.readFile(file), file };
}

/** The same picture, pixel for pixel. */
function samePixels(a, b, label) {
  const pa = decodePng(a);
  const pb = decodePng(b);
  assert.equal(pa.width, pb.width);
  assert.ok(pa.pixels.equals(pb.pixels) && pa.bpp === pb.bpp, label);
}

test('an event sequence airs the state it names, and says so', { skip }, async () => {
  const onair = await shot('onair');
  const revealed = await shot('revealed', '--event', 'reveal');
  assert.deepEqual(revealed.json.events, ['take', 'reveal']);
  assert.equal(revealed.json.machine.groups.main, 'revealed');
  assert.equal(revealed.json.machine.groups.timer, 'hidden');
  assert.ok(!onair.png.equals(revealed.png), 'the revealed frame differs from on air');
});

test('a press carries its payload and the next press counts from it', { skip }, async () => {
  const pressed = await shot('two-points', '--event', 'addPoint', '--event', 'addPoint');
  // Take, two presses 1.5 s apart, shutter 1.5 s later = 4.5 s after the Take.
  const typed = await shot('typed-points', '--data', 'f2=2', '--at', '4.5s');
  samePixels(pressed.png, typed.png, 'two Add point presses look exactly like f2=2');
});

test('--at is exact: the countdown shows the same digit by two roads', { skip }, async () => {
  // 30 s timer, 10.5 s after Start: ceil(19.5) = 20. A 21 s timer 1.5 s after Start: ceil(19.5) = 20.
  const late = await shot('timer-late', '--event', 'startTimer', '--at', '10.5s');
  const short = await shot('timer-short', '--data', 'f1=21', '--event', 'startTimer', '--at', '1.5s');
  samePixels(late.png, short.png, '30 s at 10.5 s = 21 s at 1.5 s');
  assert.equal(late.json.atMs, 10_500);
  assert.equal(late.json.machine.groups.timer, 'running');
  const early = await shot('timer-early', '--event', 'startTimer', '--at', '1.5s');
  assert.ok(!early.png.equals(late.png), 'a different offset is a different frame');
  // Two minutes on costs seconds, not two minutes, and `wait:` adds time between ops.
  const started = Date.now();
  const done = await shot('timer-done', '--event', 'startTimer', '--event', 'wait:1m', '--at', '1m');
  assert.ok(Date.now() - started < 60_000, `a two-minute offset took ${Date.now() - started} ms`);
  const zero = await shot('timer-zero', '--data', 'f1=1', '--event', 'startTimer', '--at', '5s');
  samePixels(done.png, zero.png, 'both timers have run out');
});

test('an event the machine does not answer is reported, not passed off as a state', { skip }, async () => {
  const r = await shot('refused', '--event', 'hideTimer');
  assert.equal(r.json.machine.groups.timer, 'hidden');
  assert.equal(r.json.notes.length, 1);
  assert.match(r.json.notes[0], /hideTimer did not move the machine/);
});

test('backgrounds: transparent, a colour, an image, the checker and the video plate', { skip }, async () => {
  const corner = (png) => decodePng(png).at(1900, 20);
  assert.equal(corner((await shot('bg-none', '--event', 'reveal')).png)[3], 0, 'transparent stays alpha 0');
  const red = await shot('bg-red', '--event', 'reveal', '--background', '#ff0000');
  assert.deepEqual(corner(red.png), [255, 0, 0, 255]);
  assert.equal(red.json.background, '#ff0000');
  // The graphic is painted OVER the ground: the plate pixel is not red.
  assert.notDeepEqual(decodePng(red.png).at(130, 870), [255, 0, 0, 255]);
  const image = await shot('bg-image', '--background', red.file);
  assert.deepEqual(corner(image.png), [255, 0, 0, 255], 'an image file covers the frame');
  const checker = decodePng((await shot('bg-checker', '--background', 'checker')).png);
  assert.notDeepEqual(checker.at(1900, 10), checker.at(1900, 40), 'checker cells alternate');
  assert.equal(checker.at(1900, 10)[3], 255);
  const video = decodePng((await shot('bg-video', '--background', 'video')).png);
  const samples = [video.at(300, 200), video.at(1100, 640), video.at(200, 1000), video.at(1700, 950)];
  for (const s of samples) assert.equal(s[3], 255, 'the plate is opaque');
  assert.ok(new Set(samples.map((s) => s.slice(0, 3).join())).size === samples.length, 'the plate is not one flat colour');
  // A plain still takes the background too, and without one it is exactly today's frame.
  const still = await shot('still-video', '--state', 'stress', '--background', 'video');
  assert.equal(decodePng(still.png).at(1900, 20)[3], 255);
});

test('validate --screenshots writes one frame per state the events reach', { skip }, async () => {
  const pkg = path.join(dir, 'pkg');
  await fs.cp(fixture, pkg, { recursive: true });
  const shots = path.join(dir, 'shots');
  const r = await run(['validate', pkg, '--screenshots', shots, '--background', 'video', '--json']);
  assert.ok(r.code === 0 || r.code === 1, r.stderr);
  const json = JSON.parse(r.stdout);
  const files = await fs.readdir(shots);
  for (const name of ['off.png', 'onair.png', 'stress.png', 'main-revealed.png', 'timer-running.png']) assert.ok(files.includes(name), `${name} in ${files.join(', ')}`);
  const timer = json.stateFrames.find((f) => f.reached.some((s) => s.group === 'timer' && s.state === 'running'));
  assert.deepEqual(timer.via, ['startTimer']);
  assert.equal(json.screenshots['timer-running'], path.join(shots, 'timer-running.png'));
  // Every frame is over the plate; the package's thumbnail is still the graphic alone.
  assert.equal(decodePng(await fs.readFile(path.join(shots, 'timer-running.png'))).at(1900, 20)[3], 255);
  assert.equal(decodePng(await fs.readFile(path.join(pkg, 'thumbnail.png'))).at(1900, 20)[3], 0);
});

test('usage errors name what there is to choose from', { skip }, async () => {
  const out = path.join(dir, 'never.png');
  const unknown = await run(['screenshot', fixture, '--out', out, '--event', 'goalA']);
  assert.equal(unknown.code, 2);
  assert.match(unknown.stderr, /reveal, startTimer, hideTimer, addPoint/);
  const field = await run(['screenshot', fixture, '--out', out, '--event', 'f9=1']);
  assert.equal(field.code, 2);
  assert.match(field.stderr, /Fields: f0, f1, f2/);
  const bare = await run(['screenshot', fixture, '--event', '--out', out]);
  assert.equal(bare.code, 2, 'a bare --event is refused, not dropped for a plain still');
  assert.match(bare.stderr, /--event needs a value/);
  const off = await run(['screenshot', fixture, '--out', out, '--state', 'off', '--event', 'reveal']);
  assert.equal(off.code, 2);
  const duration = await run(['screenshot', fixture, '--out', out, '--at', 'soon']);
  assert.equal(duration.code, 2);
  const colour = await run(['screenshot', fixture, '--out', out, '--background', 'notacolour']);
  assert.equal(colour.code, 2);
  assert.match(colour.stderr, /not a CSS colour/);
});
