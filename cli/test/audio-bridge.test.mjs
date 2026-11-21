// The Bridge's side of the waveform and Normalize (docs/AUDIO_TIMELINE_LOUDNESS_PLAN.md §3.1-3.4):
// a server's media name found in its shared folder, the folder's states, the audio jobs (one at a
// time, progress, cancel, a file changed during a read) and the +20 dB gain. Against a fake share
// (a temporary folder), a fake CasparCG that lists its files, and the real audio reader where the
// test measures (NOACG_FFMPEG_DIR, as in audio.test.mjs).
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { casparcgAdapter } from '../dist/playout/adapters/casparcg.js';
import { AudioJobError } from '../dist/playout/audio/analyse.js';
import { AudioJobs } from '../dist/playout/audio/jobs.js';
import { checkMediaFolder, MediaFileError, resolveMediaFile } from '../dist/playout/audio/mediaFiles.js';
import { audioTools } from '../dist/playout/audio/tools.js';
import { createBridgeServer } from '../dist/playout/server.js';
import { fileServerMemory } from '../dist/playout/servers.js';
import { fakeCaspar } from './_fakeCaspar.mjs';

const tools = await audioTools();
if (!tools && process.env.CI) throw new Error('NOACG_FFMPEG_DIR is not set: CI must build cli/ffmpeg/build.sh linux <dir> first.');
const needsTools = tools ? {} : { skip: 'no audio tools: run cli/ffmpeg/build.sh linux <dir> and set NOACG_FFMPEG_DIR=<dir>' };

const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'noacg-share-')));
test.after(() => fs.rm(base, { recursive: true, force: true }));

/** A 16-bit stereo WAV of a 997 Hz tone at `dbfs`, `seconds` long. */
function toneWav(dbfs, seconds = 1, rate = 48000) {
  const frames = Math.round(rate * seconds);
  const data = Buffer.alloc(frames * 4);
  const a = 10 ** (dbfs / 20) * 32767;
  for (let i = 0; i < frames; i++) {
    const v = Math.round(a * Math.sin((2 * Math.PI * 997 * i) / rate));
    data.writeInt16LE(v, i * 4);
    data.writeInt16LE(v, i * 4 + 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22); head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

/** A share: `files` maps a relative path to its content. */
async function share(name, files) {
  const root = path.join(base, name);
  await fs.mkdir(root, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), content);
  }
  return root;
}

const code = (c) => (e) => e instanceof MediaFileError && e.code === c;

test('a server name finds its one file: subfolders and letter case as on disk, any extension, the listed size', async () => {
  const root = await share('names', { 'Sports/Goal_Replay.mov': 'x'.repeat(10), 'Sports/goal_replay.wav': 'y'.repeat(20), 'Jingle.mp3': 'z' });
  const a = await resolveMediaFile(root, 'SPORTS/GOAL_REPLAY', 10);
  assert.equal(a.file, path.join(root, 'Sports', 'Goal_Replay.mov'));
  const b = await resolveMediaFile(root, 'SPORTS/GOAL_REPLAY', 20);
  assert.equal(path.basename(b.file), 'goal_replay.wav', 'the size tells two files of one name apart');
  assert.equal((await resolveMediaFile(root, 'jingle')).bytes, 1, 'without a listed size the name must be unique, and here is');
  await assert.rejects(resolveMediaFile(root, 'SPORTS/GOAL_REPLAY'), code('ambiguous'), 'two files, no size to choose by');
  await assert.rejects(resolveMediaFile(root, 'SPORTS/GOAL_REPLAY', 30), code('differs'), 'the name, a different size: another copy');
  await assert.rejects(resolveMediaFile(root, 'SPORTS/OTHER', 10), code('missing'));
  await assert.rejects(resolveMediaFile(root, 'NEWS/GOAL_REPLAY', 10), code('missing'), 'a renamed folder is not searched for');
  await assert.rejects(resolveMediaFile(root, 'GOAL_REPLAY', 10), code('missing'), 'never found by bare name in another folder');
  await assert.rejects(resolveMediaFile(root, '../names/JINGLE'), code('missing'));
  await assert.rejects(resolveMediaFile('', 'JINGLE'), code('not-linked'));
  await assert.rejects(resolveMediaFile(path.join(base, 'no-such-share'), 'JINGLE'), code('offline'));
});

test('two folders that differ only in letter case are refused, not guessed between', async (t) => {
  const root = await share('cases', { 'Clips/a.wav': 'a', 'CLIPS/a.wav': 'b' });
  const entries = await fs.readdir(root);
  if (entries.length < 2) return t.skip('this filesystem folds letter case');
  await assert.rejects(resolveMediaFile(root, 'clips/a'), code('ambiguous'));
});

test('a file reached through a link out of the share is not read', async () => {
  const outside = await share('outside', { 'secret.wav': 'secret' });
  const root = await share('linked', {});
  await fs.symlink(path.join(outside, 'secret.wav'), path.join(root, 'secret.wav'));
  await assert.rejects(resolveMediaFile(root, 'SECRET'), code('missing'));
});

test('the folder check: not linked, offline, not this server, a different copy, and linked', async () => {
  const root = await share('check', { 'A.wav': '1234', 'B.wav': '12345678' });
  assert.equal((await checkMediaFolder(undefined, [])).state, 'not-linked');
  assert.equal((await checkMediaFolder(path.join(base, 'gone'), [])).state, 'offline');
  assert.equal((await checkMediaFolder(root, [{ name: 'C', bytes: 4 }])).state, 'not-this-server');
  const copy = await checkMediaFolder(root, [{ name: 'A', bytes: 5 }]);
  assert.equal(copy.state, 'not-this-server');
  assert.match(copy.detail, /different copy of A/);
  const ok = await checkMediaFolder(root, [{ name: 'A', bytes: 4 }, { name: 'B', bytes: 8 }, { name: 'GONE', bytes: 3 }]);
  assert.equal(ok.state, 'linked');
  assert.match(ok.detail, /2 of 3 checked/);
});

/** Jobs over fake reads that wait until the test lets them finish. */
function gatedJobs() {
  const gates = [];
  const started = [];
  const fakeTools = { ffmpeg: 'x', ffprobe: 'x', source: 'env', verify: async () => {} };
  const read = (kind) => (_t, file, _p, opts) => new Promise((resolve, reject) => {
    started.push(file);
    opts?.onProgress?.(0.5);
    opts?.signal?.addEventListener('abort', () => reject(new AudioJobError('The job was cancelled.', 'cancelled')));
    gates.push(() => resolve(kind === 'measure' ? { kind: 'measured', integrated: -20, truePeak: -3, seconds: 1, layout: 'stereo' } : { seconds: 1, min: [], max: [] }));
  });
  const jobs = new AudioJobs({ tools: async () => fakeTools, measure: read('measure'), waveform: (t, f, _b, o) => read('waveform')(t, f, {}, o) });
  return { jobs, gates, started };
}

test('jobs run one file at a time, the same request is the same job, and a waiting one can be cancelled', async () => {
  const root = await share('jobs', { 'A.wav': 'a', 'B.wav': 'b', 'C.wav': 'c' });
  const prepare = (n) => async () => ({ file: await resolveMediaFile(root, n), fileKey: `1:${n}` });
  const { jobs, gates, started } = gatedJobs();
  const a = jobs.start('s', { kind: 'measure', name: 'A' }, prepare('A'));
  const again = jobs.start('s', { kind: 'measure', name: 'A' }, prepare('A'));
  assert.equal(again.id, a.id, 'asked twice, read once');
  const b = jobs.start('s', { kind: 'waveform', name: 'B' }, prepare('B'));
  const c = jobs.start('s', { kind: 'measure', name: 'C' }, prepare('C'));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(started.length, 1, 'only one file is read at once');
  assert.equal(jobs.get(a.id).state, 'running');
  assert.equal(jobs.get(a.id).progress, 0.5, 'progress is reported while it runs');
  assert.equal(jobs.get(b.id).state, 'queued');
  assert.equal(jobs.cancel(c.id).state, 'cancelled', 'a waiting job is dropped at once');
  gates.shift()();
  await new Promise((r) => setTimeout(r, 20));
  const done = jobs.get(a.id);
  assert.equal(done.state, 'done');
  assert.equal(done.fileKey, '1:A');
  assert.equal(done.measure.integrated, -20);
  assert.equal(jobs.get(b.id).state, 'running');
  jobs.cancel(b.id);
  await jobs.idle();
  assert.equal(jobs.get(b.id).state, 'cancelled', 'a running job stops when cancelled');
  assert.equal(started.length, 2, 'the cancelled waiting job never read its file');
});

test('a job two askers share is stopped only when both have cancelled it', async () => {
  const root = await share('shared', { 'A.wav': 'a' });
  const { jobs, gates } = gatedJobs();
  const prepare = async () => ({ file: await resolveMediaFile(root, 'A') });
  const first = jobs.start('s', { kind: 'waveform', name: 'A' }, prepare);
  const second = jobs.start('s', { kind: 'waveform', name: 'A' }, prepare);
  assert.equal(second.id, first.id);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(jobs.cancel(first.id).state, 'running', 'the other asker still waits for it');
  gates.shift()();
  await jobs.idle();
  assert.equal(jobs.get(first.id).state, 'done');
  const again = jobs.start('s', { kind: 'waveform', name: 'A' }, prepare);
  await new Promise((r) => setTimeout(r, 20));
  jobs.cancel(again.id);
  await jobs.idle();
  assert.equal(jobs.get(again.id).state, 'cancelled', 'its only asker stops it');
});

test('a file that changes while it is read gives no result, and a Bridge without a reader says so', async () => {
  const root = await share('changes', { 'A.wav': 'a' });
  const { jobs, gates } = gatedJobs();
  const job = jobs.start('s', { kind: 'measure', name: 'A' }, async () => ({ file: await resolveMediaFile(root, 'A') }));
  await new Promise((r) => setTimeout(r, 20));
  await fs.writeFile(path.join(root, 'A.wav'), 'longer now');
  gates.shift()();
  await jobs.idle();
  assert.equal(jobs.get(job.id).state, 'failed');
  assert.equal(jobs.get(job.id).problem.code, 'changed');
  const none = new AudioJobs({ tools: async () => null });
  const j = none.start('s', { kind: 'measure', name: 'A' }, async () => assert.fail('never prepared'));
  await none.idle();
  assert.equal(none.get(j.id).problem.code, 'no-reader');
});

// --- Through the Bridge ---------------------------------------------------------------------------

/** A CasparCG that answers VERSION, and CLS with the files of `root` as the server lists them. */
async function casparOver(root, names) {
  return fakeCaspar((line) => {
    if (line.startsWith('VERSION')) return '201 VERSION OK\r\n2.5.0.0 abc Stable\r\n';
    if (line.startsWith('CLS')) {
      const rows = names.map(([name, bytes]) => `"${name}"  AUDIO  ${bytes} 20261120120000 48000 1/48000`);
      return `200 CLS OK\r\n${rows.join('\r\n')}\r\n\r\n`;
    }
    return '400 ERROR\r\n';
  });
}

async function withBridge(fn, audio) {
  const dir = await fs.mkdtemp(path.join(base, 'bridge-'));
  const server = createBridgeServer(
    { token: 't', origins: ['https://noacg.studio'], adapters: [casparcgAdapter], version: '0.0.0-test', servers: fileServerMemory(path.join(dir, 'servers.json')), ...(audio ? { audio } : {}) },
    () => {},
  );
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const post = async (url, route, body) => (await fetch(`${url}${route}`, { method: 'POST', headers: { Origin: 'https://noacg.studio', Authorization: 'Bearer t', 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();

test('a readable folder is never called linked while the server cannot list its files', async () => {
  const root = await share('unlisted', { 'A.wav': '1234' });
  const caspar = await fakeCaspar((line) => (line.startsWith('VERSION') ? '201 VERSION OK\r\n2.5.0.0\r\n' : line.startsWith('CLS') ? '501 CLS FAILED\r\n' : '400 ERROR\r\n'));
  try {
    await withBridge(async (url) => {
      const target = { adapter: 'casparcg', host: '127.0.0.1', port: caspar.port };
      await post(url, '/connect', { target });
      const r = await post(url, '/media-folder', { target, folder: root });
      assert.equal(r.check.state, 'unchecked', JSON.stringify(r.check));
      assert.match(r.check.detail, /did not list its files/);
    });
  } finally {
    await caspar.close();
  }
});

test('/health lists gain-20 and media-folder always, and audio only with a reader', async () => {
  await withBridge(async (url) => {
    const health = await (await fetch(`${url}/health`)).json();
    assert.ok(health.features.includes('gain-20') && health.features.includes('media-folder'));
    assert.ok(!health.features.includes('audio'));
  }, async () => null);
  await withBridge(async (url) => {
    const health = await (await fetch(`${url}/health`)).json();
    assert.ok(health.features.includes('audio'));
  }, async () => ({ ffmpeg: 'x', ffprobe: 'x', source: 'env', verify: async () => {} }));
});

test('a take carries a gain up to +20 dB (10), and nothing above', async () => {
  const caspar = await fakeCaspar((line) => (line.startsWith('PLAY') ? '202 PLAY OK\r\n' : '201 VERSION OK\r\n2.5.0.0\r\n'));
  try {
    await withBridge(async (url) => {
      const act = (gain) => post(url, '/act', { target: { adapter: 'casparcg', host: '127.0.0.1', port: caspar.port }, action: { verb: 'take', slot: { adapter: 'casparcg', channel: 1, layer: 5 }, item: { kind: 'media', name: 'A' }, playback: { gain } } });
      const ok = await act(10);
      assert.equal(ok.ok, true, JSON.stringify(ok));
      assert.ok(caspar.seen.some((l) => l.includes('volume=10')), caspar.seen.join('\n'));
      const refused = await act(10.01);
      assert.equal(refused.ok, false);
      assert.match(refused.error.detail, /from 0 to 10/);
    });
  } finally {
    await caspar.close();
  }
});

test('link a server\'s media folder, check it, then read a waveform and a measurement through the Bridge', needsTools, async () => {
  const tone = toneWav(-23, 2);
  const root = await share('bridge', { 'Music/Bed.wav': tone, 'Other.wav': 'not sound' });
  const caspar = await casparOver(root, [['MUSIC/BED', tone.length], ['OTHER', 9]]);
  try {
    await withBridge(async (url) => {
      const target = { adapter: 'casparcg', host: '127.0.0.1', port: caspar.port };
      const unknown = await post(url, '/media-folder', { target, folder: root });
      assert.equal(unknown.ok, false, 'a server the Bridge never connected to keeps no folder');
      await post(url, '/connect', { target });
      const before = await post(url, '/media-folder', { target });
      assert.equal(before.check.state, 'not-linked');
      const linked = await post(url, '/media-folder', { target, folder: root });
      assert.equal(linked.check.state, 'linked', JSON.stringify(linked.check));
      assert.equal(linked.servers[0].mediaFolder, root, 'kept with the server, for every paired browser');
      const notLinkedJob = await post(url, '/audio/start', { target, job: { kind: 'measure', name: 'NOPE' } });
      const wait = async (id) => {
        for (let i = 0; i < 200; i++) {
          const r = await post(url, '/audio/job', { target, id });
          if (r.state !== 'queued' && r.state !== 'running') return r;
          await new Promise((res) => setTimeout(res, 25));
        }
        throw new Error('the job never finished');
      };
      assert.equal((await wait(notLinkedJob.id)).problem.code, 'missing');
      const measured = await wait((await post(url, '/audio/start', { target, job: { kind: 'measure', name: 'MUSIC/BED', trimIn: 0.5 } })).id);
      assert.equal(measured.state, 'done', JSON.stringify(measured));
      assert.ok(Math.abs(measured.measure.integrated + 23) <= 0.15, `measured ${measured.measure.integrated}`);
      assert.ok(Math.abs(measured.measure.seconds - 1.5) < 0.01, 'the part after the trim');
      assert.equal(measured.fileKey, `${tone.length}:20261120120000`);
      const wave = await wait((await post(url, '/audio/start', { target, job: { kind: 'waveform', name: 'MUSIC/BED', bins: 100 } })).id);
      assert.equal(wave.waveform.max.length, 100);
      assert.ok(wave.waveform.max.every((v) => v > 0.05), 'the tone fills every column');
      const bad = await wait((await post(url, '/audio/start', { target, job: { kind: 'measure', name: 'OTHER' } })).id);
      assert.equal(bad.problem.code, 'unreadable');
      const refused = await post(url, '/audio/start', { target, job: { kind: 'measure', name: 'MUSIC/BED', trimIn: 2, trimOut: 1 } });
      assert.equal(refused.ok, false);
      const forgot = await post(url, '/media-folder', { target, folder: null });
      assert.equal(forgot.check.state, 'not-linked');
      assert.equal(forgot.servers[0].mediaFolder, undefined);
    });
  } finally {
    await caspar.close();
  }
});
