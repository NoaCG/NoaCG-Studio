// The CasparCG servers NoaCG Bridge remembers connecting to (cli/src/playout/servers.ts,
// docs/work-specs/bridge-casparcg-connect/spec.md AC-1 and AC-5): the file, `/servers` and
// `/connect`; since 0.8.0 each server's studio setup and `/studio` (studio-day-playout AC-11), and
// `/pair-link`. Against a fake AMCP listener and a Bridge on port 0 over a temporary file - never the
// operator's own config. Run `npm run build` first.

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { casparcgAdapter } from '../dist/playout/adapters/casparcg.js';
import { PLAYOUT_V } from '../dist/playout/protocol.js';
import { createBridgeServer } from '../dist/playout/server.js';
import { fileServerMemory, MAX_SERVERS } from '../dist/playout/servers.js';
import { PairingCodes } from '../dist/playout/token.js';
import { fakeCaspar } from './_fakeCaspar.mjs';

async function withFile(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'noacg-servers-'));
  try {
    await fn(path.join(dir, 'caspar-servers.json'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function withBridge(file, fn) {
  const server = createBridgeServer(
    { token: 'secret-token', origins: ['https://noacg.studio'], adapters: [casparcgAdapter], version: '0.0.0-test', servers: fileServerMemory(file) },
    () => {},
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const post = async (base, route, body, headers = {}) => {
  const res = await fetch(`${base}${route}`, {
    method: 'POST',
    headers: { Origin: 'https://noacg.studio', Authorization: 'Bearer secret-token', 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

const target = (port) => ({ adapter: 'casparcg', host: '127.0.0.1', port });
const answersVersion = () => fakeCaspar('201 VERSION OK\r\n2.5.0.0 abc Stable\r\n');

test('the list keeps the newest first, once each, at most eight, and a bad file reads as none', async () => {
  await withFile(async (file) => {
    const memory = fileServerMemory(file);
    assert.deepEqual(await memory.list(), [], 'no file yet');
    await memory.remember({ host: '192.168.1.20', port: 5250 });
    await memory.remember({ host: '192.168.1.30', port: 5250 });
    // The same server again moves to the top rather than appearing twice.
    assert.deepEqual(await memory.remember({ host: '192.168.1.20', port: 5250 }), [
      { host: '192.168.1.20', port: 5250 },
      { host: '192.168.1.30', port: 5250 },
    ]);
    // A machine name is the same server whatever case it is typed in; another port is another server.
    await memory.remember({ host: 'Studio-PC', port: 5250 });
    await memory.remember({ host: 'studio-pc', port: 5250 });
    await memory.remember({ host: '192.168.1.20', port: 5251 });
    assert.deepEqual((await memory.list()).map((s) => `${s.host}:${s.port}`), [
      '192.168.1.20:5251',
      'studio-pc:5250',
      '192.168.1.20:5250',
      '192.168.1.30:5250',
    ]);
    for (let i = 0; i < MAX_SERVERS + 2; i += 1) await memory.remember({ host: `10.0.0.${i}`, port: 5250 });
    const list = await memory.list();
    assert.equal(list.length, MAX_SERVERS);
    assert.deepEqual(list[0], { host: `10.0.0.${MAX_SERVERS + 1}`, port: 5250 });

    // Two Connects at once (two tabs): both servers are kept, not only the one written last.
    await Promise.all([memory.remember({ host: 'tab-a.local', port: 5250 }), memory.remember({ host: 'tab-b.local', port: 5250 })]);
    assert.deepEqual((await memory.list()).slice(0, 2).map((s) => s.host), ['tab-b.local', 'tab-a.local']);

    await writeFile(file, '{ not json', 'utf8');
    assert.deepEqual(await memory.list(), []);
    await writeFile(file, JSON.stringify({ servers: [{ host: 'ok.local', port: 5250 }, { host: '', port: 1 }, { host: 'x', port: 99999 }, 'junk'] }), 'utf8');
    assert.deepEqual(await memory.list(), [{ host: 'ok.local', port: 5250 }], 'a malformed row is dropped, the rest kept');
  });
});

test('/connect remembers a server that answered, sends it nothing but VERSION, and a restart keeps it', async () => {
  const caspar = await answersVersion();
  await withFile(async (file) => {
    await withBridge(file, async (base) => {
      const noToken = await post(base, '/servers', {}, { Authorization: '' });
      assert.equal(noToken.status, 401, 'the list is behind the token');
      assert.deepEqual((await post(base, '/servers', {})).body, { ok: true, v: PLAYOUT_V, servers: [] });

      const connected = await post(base, '/connect', { target: target(caspar.port) });
      assert.equal(connected.status, 200);
      assert.equal(connected.body.ok, true);
      assert.equal(connected.body.version, '2.5.0.0 abc Stable');
      assert.deepEqual(connected.body.servers, [{ host: '127.0.0.1', port: caspar.port }]);
      assert.deepEqual((await post(base, '/servers', {})).body.servers, [{ host: '127.0.0.1', port: caspar.port }]);
    });
    // AC-5: connecting is a VERSION round trip and nothing else - no PLAY, LOAD or STOP.
    assert.deepEqual(caspar.seen, ['VERSION']);
    // A restarted Bridge reads the same file.
    await withBridge(file, async (base) => {
      assert.deepEqual((await post(base, '/servers', {})).body.servers, [{ host: '127.0.0.1', port: caspar.port }]);
    });
    assert.match(await readFile(file, 'utf8'), /"servers"/);
  });
  await caspar.close();
});

test('a Test (/status) and a server that does not answer change nothing', async () => {
  const caspar = await answersVersion();
  await withFile(async (file) => {
    await withBridge(file, async (base) => {
      const tested = await post(base, '/status', { target: target(caspar.port) });
      assert.equal(tested.body.ok, true);
      assert.equal(tested.body.servers, undefined, 'a status reply carries no list');
      // Port 1 on loopback: nothing listens there.
      const refused = await post(base, '/connect', { target: target(1) });
      assert.equal(refused.body.ok, false);
      assert.equal(refused.body.error.hop, 'target');
      assert.deepEqual((await post(base, '/servers', {})).body.servers, []);
    });
  });
  await caspar.close();
});

// ── The studio's setup per server (0.8.0, docs/work-specs/studio-day-playout AC-11, D7, D18) ──────

const STUDIO_A = {
  channels: [
    { channel: 1, name: 'Graphics' },
    { channel: 2, name: 'Inserts' },
  ],
  output: { channel: 1, layer: 20 },
  newMedia: 2,
};
const STUDIO_B = { channels: [{ channel: 1, name: 'Channel 1' }], output: { channel: 1, layer: 30 }, newMedia: 1 };

test('a setup is kept per server, survives a Connect and a restart, and a server never connected to is refused', async () => {
  const a = await answersVersion();
  const b = await answersVersion();
  await withFile(async (file) => {
    await withBridge(file, async (base) => {
      // A setup for a server this Bridge never connected to: refused, and nothing is written.
      const unknown = await post(base, '/studio', { target: target(a.port), studio: STUDIO_A });
      assert.equal(unknown.status, 400);
      assert.equal(unknown.body.error.code, 'usage');
      assert.match(unknown.body.error.detail, /has not connected to 127\.0\.0\.1:\d+\. Connect to it first/);
      assert.deepEqual((await post(base, '/servers', {})).body.servers, []);

      await post(base, '/connect', { target: target(a.port) });
      await post(base, '/connect', { target: target(b.port) });
      const keptA = await post(base, '/studio', { target: target(a.port), studio: STUDIO_A });
      assert.equal(keptA.status, 200);
      // Its place in the list stays: only a Connect moves a server to the top.
      assert.deepEqual(keptA.body.servers, [
        { host: '127.0.0.1', port: b.port },
        { host: '127.0.0.1', port: a.port, studio: STUDIO_A },
      ]);
      await post(base, '/studio', { target: target(b.port), studio: STUDIO_B });
      // Connecting to A again raises it and keeps its setup, and B keeps its own: two servers apart.
      const again = await post(base, '/connect', { target: target(a.port) });
      assert.deepEqual(again.body.servers, [
        { host: '127.0.0.1', port: a.port, studio: STUDIO_A },
        { host: '127.0.0.1', port: b.port, studio: STUDIO_B },
      ]);

      // A malformed setup is refused, never stored half.
      for (const studio of [
        null,
        {},
        { ...STUDIO_A, channels: [] },
        { ...STUDIO_A, output: { channel: 1, layer: 1.5 } },
        { ...STUDIO_A, newMedia: 0 },
        { ...STUDIO_A, channels: [{ channel: 1, name: 'x'.repeat(61) }] },
      ]) {
        const r = await post(base, '/studio', { target: target(a.port), studio });
        assert.equal(r.status, 400, JSON.stringify(studio));
      }
      assert.deepEqual((await post(base, '/servers', {})).body.servers[0].studio, STUDIO_A);
    });
    // A restarted Bridge hands the same setups back.
    await withBridge(file, async (base) => {
      const servers = (await post(base, '/servers', {})).body.servers;
      assert.deepEqual(servers.map((s) => s.studio), [STUDIO_A, STUDIO_B]);
    });
  });
  // Keeping a setup contacts no server: each heard its Connects' VERSION and nothing else.
  assert.deepEqual(a.seen, ['VERSION', 'VERSION']);
  assert.deepEqual(b.seen, ['VERSION']);
  await a.close();
  await b.close();
});

test('the file keeps what a newer Bridge wrote, and a setup it cannot read is no setup', async () => {
  await withFile(async (file) => {
    await writeFile(
      file,
      JSON.stringify({
        servers: [
          { host: 'a.local', port: 5250, studio: STUDIO_A, playlists: ['kept'] },
          { host: 'b.local', port: 5250, studio: { channels: 'nonsense' } },
        ],
        written: 'by 0.9.0',
      }),
      'utf8',
    );
    const memory = fileServerMemory(file);
    assert.deepEqual(await memory.list(), [
      { host: 'a.local', port: 5250, studio: STUDIO_A },
      { host: 'b.local', port: 5250 },
    ]);
    await memory.remember({ host: 'B.local', port: 5250 });
    await memory.setStudio({ host: 'a.local', port: 5250 }, STUDIO_B);
    const written = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(written.written, 'by 0.9.0', 'a field of the file this Bridge does not know stays');
    assert.deepEqual(written.servers[0], { host: 'B.local', port: 5250, studio: { channels: 'nonsense' } }, 'a setup it cannot read is left as it was');
    assert.deepEqual(written.servers[1], { host: 'a.local', port: 5250, studio: STUDIO_B, playlists: ['kept'] });
    // A 0.7.0 file, host and port only, reads as servers with no setup.
    await writeFile(file, JSON.stringify({ servers: [{ host: 'c.local', port: 5250 }] }), 'utf8');
    assert.deepEqual(await memory.list(), [{ host: 'c.local', port: 5250 }]);
    assert.equal(await memory.setStudio({ host: 'd.local', port: 5250 }, STUDIO_A), null);
  });
});

// ── A pairing link for another browser (0.8.0, D19) ───────────────────────────────────────────────

test('/pair-link opens one more one-time code behind the token, and the first link still works', async () => {
  await withFile(async (file) => {
    const pairings = new PairingCodes();
    const first = pairings.mint();
    const server = createBridgeServer(
      { token: 'secret-token', origins: ['https://noacg.studio'], adapters: [casparcgAdapter], version: '0.0.0-test', servers: fileServerMemory(file), pairings },
      () => {},
    );
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const pair = (code) => post(base, '/pair', { code }, { Authorization: '' });
      assert.equal((await post(base, '/pair-link', {}, { Authorization: '' })).status, 401, 'only a paired page asks for a link');
      const link = await post(base, '/pair-link', {});
      assert.equal(link.status, 200);
      assert.match(link.body.code, /^[0-9a-f]{32}$/);
      assert.equal(link.body.expiresIn, 120);
      assert.notEqual(link.body.code, first.code);
      // Making a link for one browser never spends the one another browser was about to use.
      assert.equal((await pair(first.code)).status, 200);
      assert.equal((await pair(link.body.code)).status, 200);
      // Each works once.
      const spent = await pair(link.body.code);
      assert.equal(spent.status, 401);
      assert.match(spent.body.error.detail, /used or is more than two minutes old/);
      assert.equal((await pair(first.code)).status, 401);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});

test('a pairing code lives two minutes, and the oldest open codes give way to new ones', () => {
  let now = 1_000;
  const codes = new PairingCodes(() => now);
  const old = codes.mint();
  now += 2 * 60_000 + 1;
  assert.equal(codes.spend(old.code), false, 'two minutes and a moment: gone');
  const many = Array.from({ length: 9 }, () => codes.mint());
  assert.equal(codes.spend(many[0].code), false, 'the ninth open code pushed out the first');
  assert.equal(codes.spend(many[8].code), true);
  assert.equal(codes.spend(''), false);
});
