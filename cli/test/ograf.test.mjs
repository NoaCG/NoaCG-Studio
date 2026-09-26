// NoaCG Bridge's OGraf adapter (cli/src/playout/adapters/ograf.ts): every verb's exact Server
// API request, and the honest results, against the fake OGraf server the Playwright spec uses
// too (e2e/fixtures/ograf-server/server.mjs). No network, no browser, no real OGraf server.
// Run `npm run build` first.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clearRequest,
  createOgrafAdapter,
  instanceRequest,
  loadRequest,
  ografApiBase,
  targetInfoRequest,
} from '../dist/playout/adapters/ograf.js';
import { readAction, readTarget } from '../dist/playout/server.js';
import { casparcgAdapter } from '../dist/playout/adapters/casparcg.js';
import { startFakeOgrafServer } from '../../e2e/fixtures/ograf-server/server.mjs';

const slot = { adapter: 'ograf', rendererId: 'renderer-0', renderTarget: { layerId: '1' } };
const graphic = { kind: 'template', name: 'hairline-l3' };

// ── The pure mapping ───────────────────────────────────────────────────────────────────────

test('the base URL gains the standard prefix unless it already ends in it, and refuses what is not an API root', () => {
  assert.equal(ografApiBase('http://gfx:8080'), 'http://gfx:8080/ograf/v1');
  assert.equal(ografApiBase('http://gfx:8080/'), 'http://gfx:8080/ograf/v1');
  assert.equal(ografApiBase('http://gfx:8080/ograf/v1/'), 'http://gfx:8080/ograf/v1');
  // SuperFly.tv's reference server mounts the standard under /api.
  assert.equal(ografApiBase('https://gfx.local/api/ograf/v1'), 'https://gfx.local/api/ograf/v1');
  assert.throws(() => ografApiBase('gfx:8080'), /http or https/);
  assert.throws(() => ografApiBase('not a url'), /not a URL/);
  assert.throws(() => ografApiBase('http://user:pw@gfx:8080'), /user name and password/);
  assert.throws(() => ografApiBase('http://gfx:8080/?x=1'), /no query/);
});

test('every verb is the standard route with the standard body', () => {
  assert.deepEqual(clearRequest(slot), {
    method: 'PUT',
    path: '/renderers/renderer-0/target/graphicInstance/clear',
    body: { filters: [{ renderTarget: { layerId: '1' } }] },
  });
  assert.deepEqual(loadRequest(slot, 'hairline-l3', { f0: 'Ada' }), {
    method: 'POST',
    path: '/renderers/renderer-0/target/graphicInstance/load',
    body: { renderTarget: { layerId: '1' }, graphicId: 'hairline-l3', params: { data: { f0: 'Ada' } } },
  });
  // A take without data still sends the `data` the standard requires.
  assert.deepEqual(loadRequest(slot, 'x').body.params, { data: {} });
  const on = (verb, extra = {}) => instanceRequest({ verb, slot, ...extra }, 'gi-7');
  const body = (params) => ({ renderTarget: { layerId: '1' }, graphicInstanceId: 'gi-7', params });
  assert.deepEqual(on('take', { item: graphic }), { method: 'POST', path: '/renderers/renderer-0/target/graphicInstance/playAction', body: body({}) });
  assert.deepEqual(on('update', { data: { f0: 'B' } }), { method: 'POST', path: '/renderers/renderer-0/target/graphicInstance/updateAction', body: body({ data: { f0: 'B' } }) });
  assert.deepEqual(on('next'), { method: 'POST', path: '/renderers/renderer-0/target/graphicInstance/playAction', body: body({ delta: 1 }) });
  assert.deepEqual(on('out'), { method: 'POST', path: '/renderers/renderer-0/target/graphicInstance/stopAction', body: body({}) });
  assert.throws(() => on('pause'), /no "pause"/);
  // The render target is read with its identifier JSON-stringified in the query, and a renderer
  // id is a path segment, escaped.
  assert.deepEqual(targetInfoRequest({ ...slot, rendererId: 'a b/c' }), {
    method: 'GET',
    path: `/renderers/a%20b%2Fc/target?renderTarget=${encodeURIComponent('{"layerId":"1"}')}`,
  });
});

test('the Bridge reads an ograf target and slot field by field', () => {
  const adapters = [casparcgAdapter, createOgrafAdapter()];
  assert.deepEqual(readTarget({ target: { adapter: 'ograf', baseUrl: ' http://gfx:8080 ' } }, adapters), { adapter: 'ograf', baseUrl: 'http://gfx:8080' });
  assert.throws(() => readTarget({ target: { adapter: 'ograf' } }, adapters), /no base URL/);
  assert.throws(() => readTarget({ target: { adapter: 'ograf', baseUrl: 'file:///etc/passwd' } }, adapters), /http or https/);
  assert.throws(() => readTarget({ target: { adapter: 'ograf', baseUrl: 'http://x' } }, [casparcgAdapter]), /no adapter "ograf"/);
  assert.deepEqual(readAction({ action: { verb: 'clear', slot } }), { verb: 'clear', slot });
  assert.deepEqual(readAction({ action: { verb: 'next', slot: { ...slot, renderTarget: { bank: 1, layer: 14, on: true } } } }).slot.renderTarget, { bank: 1, layer: 14, on: true });
  // Only a shallow object: the standard says so, and a nested one is no identifier.
  assert.throws(() => readAction({ action: { verb: 'next', slot: { ...slot, renderTarget: { layer: { id: 1 } } } } }), /only strings, numbers and booleans/);
  assert.throws(() => readAction({ action: { verb: 'next', slot: { ...slot, renderTarget: 3 } } }), /renderTarget object/);
  assert.throws(() => readAction({ action: { verb: 'next', slot: { ...slot, rendererId: ' ' } } }), /names its renderer/);
});

// ── The adapter against the fake server ────────────────────────────────────────────────────

async function withServer(fn, options) {
  const server = await startFakeOgrafServer(options);
  try {
    await fn(server, { adapter: 'ograf', baseUrl: server.url });
  } finally {
    await server.close();
  }
}

test('status reads the server, list reads its graphics and renderers', () =>
  withServer(async (server, target) => {
    const ograf = createOgrafAdapter();
    assert.deepEqual((await ograf.status(target)).value, { version: 'Fake OGraf Server 1.0.0' });
    const listed = await ograf.list(target, 'template');
    assert.deepEqual(listed.value, [
      { name: 'hairline-l3', kind: 'graphic', label: 'Hairline lower third' },
      { name: 'house-strap', kind: 'graphic', label: 'House strap' },
    ]);
    const renderers = await ograf.renderers(target);
    assert.equal(renderers.value.length, 1);
    assert.equal(renderers.value[0].id, 'renderer-0');
    assert.equal(renderers.value[0].targets.length, 5);
    assert.deepEqual(renderers.value[0].targets[0], { renderTarget: { layerId: '1' }, name: 'Layer 1' });
    assert.deepEqual(renderers.value[0].renderTargetSchema.required, ['layerId']);
    assert.deepEqual(
      server.requests.map((r) => `${r.method} ${r.path}`),
      ['GET /', 'GET /graphics', 'GET /renderers', 'GET /renderers/renderer-0'],
    );
    assert.equal((await ograf.list(target, 'media')).error.code, 'unsupported');
  }));

test('take replaces the target, loads and plays; update, next and out find the instance first', () =>
  withServer(async (server, target) => {
    const ograf = createOgrafAdapter();
    const take = await ograf.act(target, { verb: 'take', item: graphic, slot, data: { f0: 'Ada' } });
    assert.equal(take.ok, true, JSON.stringify(take));
    assert.equal(take.raw, 'load 200 Loaded OK (gi-1); playAction 200 Playing');
    const infoPath = targetInfoRequest(slot).path;
    const at = (route) => `/renderers/renderer-0/target/graphicInstance/${route}`;
    const instance = (params) => ({ renderTarget: { layerId: '1' }, graphicInstanceId: 'gi-1', params });
    assert.deepEqual(server.requests, [
      { method: 'PUT', path: at('clear'), body: { filters: [{ renderTarget: { layerId: '1' } }] }, contentType: 'application/json' },
      { method: 'POST', path: at('load'), body: { renderTarget: { layerId: '1' }, graphicId: 'hairline-l3', params: { data: { f0: 'Ada' } } }, contentType: 'application/json' },
      { method: 'POST', path: at('playAction'), body: instance({}), contentType: 'application/json' },
    ]);

    server.requests.length = 0;
    assert.equal((await ograf.act(target, { verb: 'update', slot, data: { f0: 'Grace' } })).ok, true);
    assert.equal((await ograf.act(target, { verb: 'next', slot, item: graphic })).ok, true);
    assert.equal((await ograf.act(target, { verb: 'out', slot, item: graphic })).ok, true);
    assert.deepEqual(server.requests, [
      { method: 'GET', path: infoPath, renderTarget: { layerId: '1' } },
      { method: 'POST', path: at('updateAction'), body: instance({ data: { f0: 'Grace' } }), contentType: 'application/json' },
      { method: 'GET', path: infoPath, renderTarget: { layerId: '1' } },
      { method: 'POST', path: at('playAction'), body: instance({ delta: 1 }), contentType: 'application/json' },
      { method: 'GET', path: infoPath, renderTarget: { layerId: '1' } },
      { method: 'POST', path: at('stopAction'), body: instance({}), contentType: 'application/json' },
    ]);
    assert.deepEqual(server.instances[0].data, { f0: 'Grace' });

    // All out clears the render target.
    server.requests.length = 0;
    const clear = await ograf.act(target, { verb: 'clear', slot });
    assert.equal(clear.raw, 'clear 200 (1 cleared)');
    assert.deepEqual(server.requests, [
      { method: 'PUT', path: at('clear'), body: { filters: [{ renderTarget: { layerId: '1' } }] }, contentType: 'application/json' },
    ]);
    assert.equal(server.instances.length, 0);

    // With nothing loaded, out has nothing left to do and update has nothing to act on.
    assert.equal((await ograf.act(target, { verb: 'out', slot })).ok, true);
    assert.equal((await ograf.act(target, { verb: 'update', slot, data: { f0: 'x' } })).error.code, 'not-found');
  }));

test('what an OGraf server cannot do is refused before anything is sent', () =>
  withServer(async (server, target) => {
    const ograf = createOgrafAdapter();
    for (const action of [
      { verb: 'take', item: { kind: 'media', name: 'CLIP' }, slot },
      { verb: 'take', item: { kind: 'url', name: 'https://noacg.studio/output' }, slot },
      { verb: 'pause', slot },
      { verb: 'take', item: graphic, slot: { adapter: 'casparcg', channel: 1, layer: 20 } },
    ]) {
      const r = await ograf.act(target, action);
      assert.equal(r.ok, false);
      assert.equal(r.error.hop, 'agent', JSON.stringify(action));
      assert.equal(r.error.code, 'usage');
    }
    assert.equal(server.requests.length, 0);
  }));

test('a lost answer to a command is uncertain and never retried; a lost answer to a read is unreachable', () =>
  withServer(async (server, target) => {
    const ograf = createOgrafAdapter({ timeoutMs: 300 });
    server.fault('playAction', 'hang');
    const take = await ograf.act(target, { verb: 'take', item: graphic, slot });
    assert.equal(take.error.code, 'uncertain');
    assert.match(take.error.detail, /is loaded \(gi-1\) but did not play/);
    assert.equal(server.requests.filter((r) => r.path.endsWith('/playAction')).length, 1, 'never retried');

    server.clearFaults();
    server.fault('stopAction', 'drop');
    assert.equal((await ograf.act(target, { verb: 'out', slot })).error.code, 'uncertain');

    server.fault('graphics', 'hang');
    assert.equal((await ograf.list(target, 'template')).error.code, 'unreachable');

    // A 200 that does not say what the graphic did is not a success.
    server.clearFaults();
    server.fault('updateAction', { status: 200, body: {} });
    assert.equal((await ograf.act(target, { verb: 'update', slot, data: {} })).error.code, 'uncertain');
  }));

test('one verb shares one time budget across its requests, so the page never waits past it', () =>
  withServer(async (server, target) => {
    // Each request alone fits the 400 ms budget; the take's clear and load together do not.
    const ograf = createOgrafAdapter({ timeoutMs: 400 });
    server.fault('clear', { delayMs: 250 });
    server.fault('load', { delayMs: 250 });
    const began = Date.now();
    const take = await ograf.act(target, { verb: 'take', item: graphic, slot });
    assert.equal(take.error.code, 'uncertain');
    assert.match(take.error.detail, /cleared first/);
    assert.ok(Date.now() - began < 700, `took ${Date.now() - began} ms`);
  }));

test('a gateway timeout is uncertain, a redirect is refused and never followed, and a dot is no renderer id', () =>
  withServer(async (server, target) => {
    const ograf = createOgrafAdapter();
    server.fault('clear', { status: 504, body: { title: 'Gateway Timeout' } });
    assert.equal((await ograf.act(target, { verb: 'clear', slot })).error.code, 'uncertain');
    server.fault('clear', { status: 307, headers: { Location: 'http://127.0.0.1:1/elsewhere' } });
    const moved = await ograf.act(target, { verb: 'clear', slot });
    assert.equal(moved.error.code, 'refused');
    assert.equal(moved.error.raw, '307');
    server.clearFaults();
    server.requests.length = 0;
    for (const rendererId of ['.', '..']) {
      assert.equal((await ograf.act(target, { verb: 'clear', slot: { ...slot, rendererId } })).error.code, 'usage');
    }
    assert.equal(server.requests.length, 0);
  }));

test('out stops whatever the render target holds, even a graphic another controller put there', () =>
  withServer(async (server, target) => {
    const ograf = createOgrafAdapter();
    assert.equal((await ograf.act(target, { verb: 'take', item: { kind: 'template', name: 'house-strap' }, slot })).ok, true);
    const out = await ograf.act(target, { verb: 'out', slot, item: graphic });
    assert.equal(out.raw, 'target 200 (1 loaded); stopAction 200 Stopped');
  }));

test('the graphic refusing, the server refusing, and no server at all', () =>
  withServer(async (server, target) => {
    const ograf = createOgrafAdapter();
    server.fault('load', { status: 550, body: { title: 'GraphicError', detail: 'load() threw: no font' } });
    const threw = await ograf.act(target, { verb: 'take', item: graphic, slot });
    assert.equal(threw.error.code, 'refused');
    assert.match(threw.error.detail, /graphic itself failed POST .*\/load: GraphicError: load\(\) threw: no font/);
    // A 200 whose statusCode is not 2xx is the graphic refusing.
    server.fault('load', { status: 200, body: { graphicInstanceId: 'gi-9', statusCode: 400, statusMessage: 'Bad data' } });
    assert.match((await ograf.act(target, { verb: 'take', item: graphic, slot })).error.detail, /graphic refused load: 400 Bad data/);
    server.clearFaults();
    const missing = await ograf.act(target, { verb: 'take', item: { kind: 'template', name: 'nope' }, slot });
    assert.equal(missing.error.code, 'not-found');
    const elsewhere = await ograf.act(target, { verb: 'take', item: graphic, slot: { ...slot, rendererId: 'renderer-9' } });
    assert.equal(elsewhere.error.code, 'not-found');
    await server.close();
    const gone = await ograf.status(target);
    assert.equal(gone.error.code, 'unreachable');
    // Nothing was sent, so a command to a server that is not there is certain: unreachable.
    assert.equal((await ograf.act(target, { verb: 'clear', slot })).error.code, 'unreachable');
  }));
