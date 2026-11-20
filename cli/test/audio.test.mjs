// The Bridge's sound reading (cli/src/playout/audio/, docs/AUDIO_TIMELINE_LOUDNESS_PLAN.md §3.1),
// run against the audio-only ffmpeg built by cli/ffmpeg/build.sh: the same recipe the exe ships.
// CI builds it and sets NOACG_FFMPEG_DIR. On a developer machine without it, these tests say how
// to build it and skip; on CI a missing build fails.
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { AudioJobError, measure, probe, waveform } from '../dist/playout/audio/analyse.js';
import { audioTools, unpackTools } from '../dist/playout/audio/tools.js';
import { createHash } from 'node:crypto';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'audio');
const tools = await audioTools();
if (!tools && process.env.CI) throw new Error('NOACG_FFMPEG_DIR is not set: CI must build cli/ffmpeg/build.sh linux <dir> first.');
const needsTools = tools ? {} : { skip: 'no audio tools: run cli/ffmpeg/build.sh linux <dir> and set NOACG_FFMPEG_DIR=<dir>' };

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'noacg-audio-'));
test.after(() => fs.rm(tmp, { recursive: true, force: true }));

/** A 32-bit float WAV, `sample(channel, seconds)` per sample. */
async function wav(name, { rate = 48000, channels = 2, seconds = 1, sample }) {
  const frames = Math.round(rate * seconds);
  const data = Buffer.alloc(frames * channels * 4);
  for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) data.writeFloatLE(sample(c, i / rate), (i * channels + c) * 4);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(3, 20);
  head.writeUInt16LE(channels, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * channels * 4, 28);
  head.writeUInt16LE(channels * 4, 32);
  head.writeUInt16LE(32, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  const file = path.join(tmp, name);
  await fs.writeFile(file, Buffer.concat([head, data]));
  return file;
}

const db = (x) => 10 ** (x / 20);
const tone = (amplitude, f = 997) => (_c, t) => amplitude * Math.sin(2 * Math.PI * f * t);
const close = (actual, expected, within, what) => assert.ok(Math.abs(actual - expected) <= within, `${what}: ${actual}, expected ${expected} ± ${within}`);

test('a stereo 997 Hz tone at -23 dBFS reads -23.0 LUFS and a -23 dBTP peak (EBU Tech 3341, case 1)', needsTools, async () => {
  const file = await wav('ebu-23.wav', { seconds: 3, sample: tone(db(-23)) });
  const r = await measure(tools, file);
  assert.equal(r.kind, 'measured');
  close(r.integrated, -23, 0.1, 'integrated');
  close(r.truePeak, -23, 0.2, 'true peak');
  close(r.seconds, 3, 0.01, 'length');
});

test('a mono file airs on the left leg alone, so it reads 3 LU under the same tone on both legs', needsTools, async () => {
  const mono = await wav('mono.wav', { channels: 1, seconds: 2, sample: tone(db(-23)) });
  const r = await measure(tools, mono);
  close(r.integrated, -26, 0.1, 'mono');
});

test('a 5.1 file counts channels 1 and 2 only, as a stereo programme carries them', needsTools, async () => {
  const loud = [db(-23), db(-23), db(-6), 0.5, 0.5, 0.5];
  const file = await wav('surround.wav', { channels: 6, seconds: 2, sample: (c, t) => loud[c] * Math.sin(2 * Math.PI * 997 * t) });
  const r = await measure(tools, file);
  close(r.integrated, -23, 0.1, '5.1 front pair');
});

test('two mono tracks (MXF) are merged as CasparCG merges them, not read as the first track alone', needsTools, async () => {
  // Track 1 is the lavfi tone (amplitude 1/8), track 2 the same 6 dB lower: L and R of the programme.
  const r = await measure(tools, path.join(fixtures, 'two-tracks.mxf'));
  const power = (a) => (a * a) / 2;
  const expected = 10 * Math.log10(power(0.125) + power(0.125 * db(-6)));
  close(r.integrated, expected, 0.2, 'merged tracks');
  const firstOnly = 10 * Math.log10(power(0.125));
  assert.ok(Math.abs(r.integrated - firstOnly) > 0.8, 'reads differently from the first track alone');
});

test('compressed files a playout server holds read as a full ffmpeg reads them (fixtures/audio/reference.json)', needsTools, async () => {
  const reference = JSON.parse(await fs.readFile(path.join(fixtures, 'reference.json'), 'utf8'));
  for (const [name, want] of Object.entries(reference)) {
    const r = await measure(tools, path.join(fixtures, name));
    assert.equal(r.kind, 'measured', name);
    close(r.integrated, want.integrated, 0.1, `${name} integrated`);
    close(r.truePeak, want.truePeak, 0.1, `${name} true peak`);
  }
  const info = await probe(tools, path.join(fixtures, 'clip-aac.mov'));
  assert.deepEqual(info.audio.map((s) => [s.codec, s.channels]), [['aac', 2]]);
  close(info.seconds, 1, 0.05, 'mov length');
});

test('a short loud sound at the trim point: measuring the part equals measuring the part cut out first', needsTools, async () => {
  // A reviewer's counterexample to rebuilding from 100 ms slices: the same 30 ms burst, 40 ms apart.
  const quiet = db(-50);
  const burst = (from) => (_c, t) => (t >= from && t < from + 0.03 ? 1 : quiet) * Math.sin(2 * Math.PI * 997 * t);
  const results = [];
  for (const [name, from] of [['burst-a', 0.008], ['burst-b', 0.048]]) {
    const whole = await wav(`${name}.wav`, { channels: 1, sample: burst(from) });
    const part = await measure(tools, whole, { trimIn: 0.04, trimOut: 0.56 });
    const cut = await wav(`${name}-cut.wav`, { channels: 1, seconds: 0.52, sample: (c, t) => burst(from)(c, t + 0.04) });
    const reference = await measure(tools, cut);
    close(part.integrated, reference.integrated, 0.15, `${name} part vs cut`);
    close(part.truePeak, reference.truePeak, 0.3, `${name} peak`);
    results.push(part.integrated);
  }
  assert.ok(Math.abs(results[0] - results[1]) > 5, `the two parts differ (${results.join(', ')}): the burst is in one and not the other`);
});

test('silence, a part under 0.4 s and a video with no sound each say what they are', needsTools, async () => {
  const silent = await wav('silent.wav', { sample: () => 0 });
  assert.equal((await measure(tools, silent)).kind, 'silent');
  const loud = await wav('loud.wav', { sample: tone(db(-10)) });
  assert.deepEqual(await measure(tools, loud, { trimIn: 0.2, trimOut: 0.5 }), { kind: 'too-short', seconds: 0.3 });
  assert.deepEqual(await measure(tools, path.join(fixtures, 'no-audio.mov')), { kind: 'no-audio' });
  const flat = await waveform(tools, path.join(fixtures, 'no-audio.mov'), 10);
  assert.equal(flat.silentFile, true);
  close(flat.seconds, 2, 0.05, 'a silent video keeps its length');
});

test('a file name with a colon is read as a file, never as another ffmpeg protocol', needsTools, async () => {
  const dir = await fs.mkdtemp(path.join(tmp, 'colon-'));
  const file = path.join(dir, 'pipe:0');
  await fs.copyFile(await wav('for-colon.wav', { seconds: 1, sample: tone(db(-23)) }), file);
  const r = await measure(tools, file);
  close(r.integrated, -23, 0.1, 'colon name');
});

test('a file that is not sound is refused as unreadable, with a reason', needsTools, async () => {
  const bad = path.join(tmp, 'not-sound.wav');
  await fs.writeFile(bad, 'this is not a wave file');
  await assert.rejects(measure(tools, bad), (e) => e instanceof AudioJobError && e.code === 'unreadable' && e.message.length > 0);
});

test('the waveform keeps a short burst and never cancels opposite legs', needsTools, async () => {
  const file = await wav('wave.wav', { seconds: 2, sample: (c, t) => (t >= 1 && t < 1.01 ? 0.9 : 0.01) * (c === 0 ? 1 : -1) * Math.sin(2 * Math.PI * 997 * t) });
  const w = await waveform(tools, file, 200);
  assert.equal(w.min.length, 200);
  close(w.seconds, 2, 0.01, 'length');
  const loudBins = w.max.map((v, i) => [v, i]).filter(([v]) => v > 0.5).map(([, i]) => i);
  assert.deepEqual(loudBins, [100], 'the 10 ms burst shows in its own bin');
  assert.ok(w.min[100] < -0.85, 'and its negative side too');
  assert.ok(Math.max(...w.max.filter((_, i) => i !== 100)) < 0.02, 'the rest stays low');
});

test('jobs report progress up to 1 and stop when cancelled', needsTools, async () => {
  const long = await wav('long.wav', { channels: 2, seconds: 30, sample: tone(0.2) });
  const seen = [];
  await waveform(tools, long, 100, { onProgress: (f) => seen.push(f) });
  assert.ok(seen.length > 5, 'reports several times');
  assert.deepEqual([...seen].sort((a, b) => a - b), seen, 'never goes backwards');
  assert.equal(seen[seen.length - 1], 1);
  const controller = new AbortController();
  const job = waveform(tools, long, 100, { signal: controller.signal, onProgress: (f) => f > 0.05 && controller.abort() });
  await assert.rejects(job, (e) => e instanceof AudioJobError && e.code === 'cancelled');
  const measured = [];
  await measure(tools, long, {}, { onProgress: (f) => measured.push(f) });
  assert.equal(measured[measured.length - 1], 1);
});

test('the exe unpacks its programs once, checks them before each start and rewrites a changed one', async () => {
  const home = await fs.mkdtemp(path.join(tmp, 'home-'));
  const files = { ffmpeg: Buffer.from('ffmpeg program'), ffprobe: Buffer.from('ffprobe program') };
  const sha = (b) => createHash('sha256').update(b).digest('hex');
  const manifest = { version: '7.1.2', files: { ffmpeg: sha(files.ffmpeg), ffprobe: sha(files.ffprobe) } };
  let reads = 0;
  const read = (name) => (reads++, files[name]);
  const unpacked = await unpackTools(manifest, read, home, '.exe');
  assert.equal(reads, 2);
  assert.equal(await fs.readFile(unpacked.ffmpeg, 'utf8'), 'ffmpeg program');
  assert.match(unpacked.ffmpeg, /7\.1\.2-[0-9a-f]{12}[\\/]ffmpeg\.exe$/);
  await unpacked.verify();
  assert.equal(reads, 2, 'an unchanged program is not rewritten');
  await fs.writeFile(unpacked.ffprobe, 'something else');
  await unpacked.verify();
  assert.equal(await fs.readFile(unpacked.ffprobe, 'utf8'), 'ffprobe program', 'a changed program is rewritten before it runs');
  await assert.rejects(unpackTools({ ...manifest, version: 'x' }, () => Buffer.from('tampered'), home, '.exe'), /does not match its checksum/);
});
