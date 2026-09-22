// NoaCG Bridge (cli/src/playout/, docs/BRIDGE.md): the CasparCG adapter's exact wire, and the
// HTTP surface's refusals, against a fake AMCP listener and a Bridge on port 0. No network, no
// browser, no CasparCG. Run `npm run build` first.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { casparcgAdapter, casparLine, LIST_TIMEOUT_MS } from '../dist/playout/adapters/casparcg.js';
import { amcpQuote } from '../dist/playout/amcp.js';
import { PLAYOUT_V } from '../dist/playout/protocol.js';
import { allowedOrigins, createBridgeServer, originAllowed, readAction } from '../dist/playout/server.js';
import { fakeCaspar } from './_fakeCaspar.mjs';

const slot = { adapter: 'casparcg', channel: 1, layer: 20 };

test('the protocol file is mirrored byte for byte into the studio', async () => {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const norm = (s) => s.replace(/\r\n/g, '\n');
  const cli = norm(await readFile(new URL('../src/playout/protocol.ts', import.meta.url), 'utf8'));
  const app = norm(await readFile(`${here}/../../src/control/playoutProtocol.ts`, 'utf8'));
  assert.equal(app, cli, 'src/control/playoutProtocol.ts has drifted from cli/src/playout/protocol.ts - copy one over the other');
});

// ── Every verb's exact AMCP line ───────────────────────────────────────────────────────────

test('take: a URL is the HTML producer, a template is CG ADD with play-on-load, a clip is PLAY', () => {
  assert.equal(
    casparLine({ verb: 'take', item: { kind: 'url', name: 'https://noacg.studio/output?production=s' }, slot }),
    'PLAY 1-20 [HTML] "https://noacg.studio/output?production=s"',
  );
  assert.equal(
    casparLine({ verb: 'take', item: { kind: 'template', name: 'HOUSE_STRAP/HOUSE_STRAP' }, slot, data: { f0: 'He said "hi"\nline two ä' } }),
    'CG 1-20 ADD 1 "HOUSE_STRAP/HOUSE_STRAP" 1 "{\\"f0\\":\\"He said \\\\\\"hi\\\\\\"\\\\nline two ä\\"}"',
  );
  assert.equal(casparLine({ verb: 'take', item: { kind: 'template', name: 'T' }, slot }), 'CG 1-20 ADD 1 "T" 1');
  assert.equal(casparLine({ verb: 'take', item: { kind: 'media', name: 'Jääkiekko' }, slot: { ...slot, layer: 10 } }), 'PLAY 1-10 "Jääkiekko"');
  assert.equal(casparLine({ verb: 'take', item: { kind: 'media', name: 'BUMPER' }, slot, loop: true }), 'PLAY 1-20 "BUMPER" LOOP');
});

test('update, next, out, pause and resume', () => {
  assert.equal(casparLine({ verb: 'update', slot, data: { f0: 'x' } }), 'CG 1-20 UPDATE 1 "{\\"f0\\":\\"x\\"}"');
  assert.equal(casparLine({ verb: 'next', slot }), 'CG 1-20 NEXT 1');
  // Out plays a template's exit through its CG layer, and cuts a clip or a page on the video layer.
  assert.equal(casparLine({ verb: 'out', slot, item: { kind: 'template', name: 'T' } }), 'CG 1-20 STOP 1');
  assert.equal(casparLine({ verb: 'out', slot, item: { kind: 'media', name: 'M' } }), 'STOP 1-20');
  assert.equal(casparLine({ verb: 'out', slot }), 'STOP 1-20');
  assert.equal(casparLine({ verb: 'pause', slot }), 'PAUSE 1-20');
  assert.equal(casparLine({ verb: 'resume', slot }), 'RESUME 1-20');
});

test('a carriage return in a name is refused - it would end the command - and data is safe by construction', () => {
  assert.throws(() => casparLine({ verb: 'take', item: { kind: 'media', name: 'x\r\nSTOP 1-20' }, slot }), /carriage return|newline/);
  // Data goes through JSON first, which turns a raw CR into the two characters `\r`, so no line
  // break can reach the wire from a field value however it was typed.
  const line = casparLine({ verb: 'update', slot, data: { f0: 'a\rb\nc' } });
  assert.ok(!/[\r\n]/.test(line), line);
  assert.equal(line, `CG 1-20 UPDATE 1 ${amcpQuote(JSON.stringify({ f0: 'a\rb\nc' }))}`);
});

test('an action from the wire is read field by field, never forwarded on trust', () => {
  assert.deepEqual(readAction({ action: { verb: 'take', item: { kind: 'media', name: 'M' }, slot, data: { f0: 1 } } }), {
    verb: 'take',
    item: { kind: 'media', name: 'M' },
    slot,
    data: { f0: '1' },
    loop: false,
  });
  assert.throws(() => readAction({ action: { verb: 'take', item: { kind: 'scene', name: 'x' }, slot } }), /Unknown item kind/);
  assert.throws(() => readAction({ action: { verb: 'take', item: { kind: 'media', name: 'x' }, slot: { adapter: 'casparcg', channel: '1', layer: 20 } } }), /whole channel/);
  assert.throws(() => readAction({ action: { verb: 'update', slot } }), /carries data/);
  assert.throws(() => readAction({ action: { verb: 'launch', slot } }), /Unknown verb/);
});

// ── The adapter against a fake server ──────────────────────────────────────────────────────

const target = (port) => ({ adapter: 'casparcg', host: '127.0.0.1', port });

test('status reads the version; list reads templates and media; a 404 is not-found', async () => {
  const caspar = await fakeCaspar((line) => {
    if (line === 'VERSION') return '201 VERSION OK\r\n2.5.0 69e8ad5 Stable\r\n';
    if (line === 'TLS') return '200 TLS OK\r\nBK/SB01\r\nHOUSE_STRAP/HOUSE_STRAP\r\n\r\n';
    if (line === 'CLS') return '200 CLS OK\r\n"GIORNO"  MOVIE  10485760 20260814221648 1500 25/1\r\n\r\n';
    if (line.startsWith('THUMBNAIL RETRIEVE')) return '201 THUMBNAIL RETRIEVE OK\r\niVBORw0KGgo=\r\n';
    if (line === 'PLAY 1-10 "NOSUCHCLIP"') return '404 PLAY FAILED\r\n';
    return '202 CG OK\r\n';
  });
  const t = target(caspar.port);
  const status = await casparcgAdapter.status(t);
  assert.deepEqual(status, { ok: true, value: { version: '2.5.0 69e8ad5 Stable' }, raw: '201 VERSION OK' });
  const templates = await casparcgAdapter.list(t, 'template');
  assert.deepEqual(templates.value, [
    { name: 'BK/SB01', kind: 'template' },
    { name: 'HOUSE_STRAP/HOUSE_STRAP', kind: 'template' },
  ]);
  const media = await casparcgAdapter.list(t, 'media');
  assert.deepEqual(media.value, [{ name: 'GIORNO', kind: 'movie', frames: 1500, fps: 25, bytes: 10485760, changed: '20260814221648' }]);
  const thumb = await casparcgAdapter.thumbnail(t, 'GIORNO');
  assert.deepEqual(thumb.value, { png: 'iVBORw0KGgo=' });
  const missing = await casparcgAdapter.act(t, { verb: 'take', item: { kind: 'media', name: 'NOSUCHCLIP' }, slot: { ...slot, layer: 10 } });
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, 'not-found');
  assert.equal(missing.error.raw, '404 PLAY FAILED');
  await caspar.close();
});

test('a 501 on a list is the media scanner missing, told apart from a dead server', async () => {
  // Measured 2026-09-22 on 2.5.0 with scanner.exe stopped: VERSION answers, TLS answers
  // `501 TLS FAILED` about 5 s later. The list wait is longer than that on purpose.
  assert.ok(LIST_TIMEOUT_MS > 6000);
  const caspar = await fakeCaspar((line) => (line === 'TLS' ? '501 TLS FAILED\r\n' : '201 VERSION OK\r\n2.5.0\r\n'));
  const r = await casparcgAdapter.list(target(caspar.port), 'template');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'no-media-scanner');
  assert.match(r.error.detail, /media scanner is not running/);
  await caspar.close();

  const dead = await casparcgAdapter.status(target(1));
  assert.equal(dead.ok, false);
  assert.equal(dead.error.code, 'unreachable');
});

// ── The Bridge's own refusals ───────────────────────────────────────────────────────────────

const ORIGINS = ['https://noacg.studio'];

test('the origin allowlist takes the deployment and loopback, and nothing else', () => {
  assert.deepEqual(allowedOrigins(['https://staging.example/']).slice(-1), ['https://staging.example']);
  assert.equal(originAllowed('https://noacg.studio', ORIGINS), true);
  assert.equal(originAllowed('https://noacg.studio/', ORIGINS), true);
  assert.equal(originAllowed('http://localhost:5184', ORIGINS), true);
  assert.equal(originAllowed('http://127.0.0.1:5184', ORIGINS), true);
  assert.equal(originAllowed(undefined, ORIGINS), true); // a terminal, which the token gates
  assert.equal(originAllowed('https://evil.example', ORIGINS), false);
  assert.equal(originAllowed('https://noacg.studio.evil.example', ORIGINS), false);
});

async function withBridge(fn, extra = {}) {
  const server = createBridgeServer(
    { token: 'secret-token', origins: ORIGINS, adapters: [casparcgAdapter], version: '0.0.0-test', ...extra },
    () => {},
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const post = (base, path, body, headers = {}) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { Origin: 'https://noacg.studio', Authorization: 'Bearer secret-token', 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

test('presence answers any origin without a token and says nothing about the studio', async () => {
  await withBridge(async (base) => {
    const health = await fetch(`${base}/health`, { headers: { Origin: 'https://another-noacg.example' } });
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('access-control-allow-origin'), 'https://another-noacg.example');
    assert.deepEqual(await health.json(), { ok: true, agent: 'noacg-bridge', v: PLAYOUT_V, version: '0.0.0-test', adapters: ['casparcg'] });

    const noToken = await fetch(`${base}/status`, { method: 'POST', headers: { Origin: 'https://noacg.studio' } });
    assert.equal(noToken.status, 401);
    const wrong = await post(base, '/status', {}, { Authorization: 'Bearer nope' });
    assert.equal(wrong.status, 401);
  });
});

test('a foreign origin is refused with no CORS headers at all, so a guessed token still reads nothing', async () => {
  await withBridge(async (base) => {
    const res = await post(base, '/status', {}, { Origin: 'https://evil.example' });
    assert.equal(res.status, 403);
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  });
});

test('a forged Host header is refused, so a name resolving to 127.0.0.1 cannot reach in', async () => {
  await withBridge(async (base) => {
    const url = new URL(base);
    const status = await new Promise((resolve, reject) => {
      const req = httpRequest(
        { host: '127.0.0.1', port: Number(url.port), path: '/health', method: 'GET', headers: { Host: 'rebind.evil.example', Origin: 'https://noacg.studio' } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on('error', reject);
      req.end();
    });
    assert.equal(status, 403);
  });
});

test('pairing spends a one-time code for the token, once, and only while it is fresh', async () => {
  const pairing = { code: 'fresh-code', expiresAt: Date.now() + 60_000, used: false };
  await withBridge(async (base) => {
    const wrong = await post(base, '/pair', { code: 'guess' }, { Authorization: '' });
    assert.equal(wrong.status, 401);
    const first = await post(base, '/pair', { code: 'fresh-code' }, { Authorization: '' });
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { ok: true, v: PLAYOUT_V, token: 'secret-token' });
    const again = await post(base, '/pair', { code: 'fresh-code' }, { Authorization: '' });
    assert.equal(again.status, 401);
  }, { pairing });
  await withBridge(async (base) => {
    const stale = await post(base, '/pair', { code: 'old-code' }, { Authorization: '' });
    assert.equal(stale.status, 401);
  }, { pairing: { code: 'old-code', expiresAt: Date.now() - 1, used: false } });
});

test('every request names its target, and an action reaches AMCP as exactly one line', async () => {
  const caspar = await fakeCaspar('202 CG OK\r\n');
  await withBridge(async (base) => {
    const noTarget = await post(base, '/act', { action: { verb: 'next', slot } });
    assert.equal(noTarget.status, 400);
    assert.equal((await noTarget.json()).error.code, 'usage');

    const res = await post(base, '/act', {
      target: target(caspar.port),
      action: { verb: 'take', item: { kind: 'template', name: 'BK/SB01' }, slot: { adapter: 'casparcg', channel: 2, layer: 30 }, data: { f0: 'Home', f1: '3' } },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, v: PLAYOUT_V, raw: '202 CG OK' });
    assert.deepEqual(caspar.seen, ['CG 2-30 ADD 1 "BK/SB01" 1 "{\\"f0\\":\\"Home\\",\\"f1\\":\\"3\\"}"']);
  });
  await caspar.close();
});

test('CasparCG being absent is reported on the target hop - the Bridge itself is fine', async () => {
  await withBridge(async (base) => {
    const res = await post(base, '/status', { target: target(1) });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.error.hop, 'target');
    assert.equal(body.error.code, 'unreachable');
    assert.match(body.error.detail, /ECONNREFUSED|EACCES/);
  });
});
