// The CasparCG servers NoaCG Bridge remembers connecting to (cli/src/playout/servers.ts,
// docs/work-specs/bridge-casparcg-connect/spec.md AC-1 and AC-5): the file, `/servers` and
// `/connect`, against a fake AMCP listener and a Bridge on port 0 over a temporary file - never the
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
