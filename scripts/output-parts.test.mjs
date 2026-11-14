// guards: src/output/payloadReader.ts
//
// AN OUTPUT READS ONLY WHAT IT LACKS (docs/work-specs/live-publishing/designs/G4.md section 5, rules
// R12 and R13). The reader's worker body runs here against a small simulated server: it reads the
// head, then only the parts and images neither side holds, composes them with images inline, keeps
// only what the head it read and the one before name, reads the head once more on a missing part,
// and answers `whole` on a second miss, on no current head, or on two failed answers.

import test from 'node:test';
import assert from 'node:assert/strict';
import './lib/tsResolve.mjs';

const { readerMain } = await import('../src/output/payloadReader.ts');

/** A server holding parts and images, with a head the test sets, counting every call. */
function server() {
  const s = { head: null, parts: {}, images: {}, calls: [], fail: {}, hideParts: 0 };
  s.fetch = async (url, init) => {
    const fn = url.split('/rpc/')[1];
    const args = JSON.parse(init.body);
    s.calls.push({ fn, args });
    if (s.fail[fn] > 0) {
      s.fail[fn] -= 1;
      return { ok: false, status: 503, json: async () => ({}) };
    }
    let body = null;
    if (fn === 'control_output_head') body = { head: s.head };
    if (fn === 'control_output_resolve') body = { output: { whole: true } };
    if (fn === 'control_output_parts') {
      body = {};
      for (const d of args.p_digests) if (s.parts[d] && !(s.hideParts > 0)) body[d] = s.parts[d];
      if (s.hideParts > 0) s.hideParts -= 1;
    }
    if (fn === 'control_output_assets') {
      // At most two images an answer, the rest listed in `more`.
      const assets = {};
      const more = [];
      for (const h of args.p_hashes) {
        if (!(h in s.images)) continue;
        if (Object.keys(assets).length < 2) assets[h] = s.images[h];
        else more.push(h);
      }
      body = { assets, more };
    }
    return { ok: true, status: 200, json: async () => body };
  };
  return s;
}

/** The worker body, started with its own `self`; `ask` posts a message and resolves its answer. */
function worker(srv) {
  const answers = new Map();
  const scope = { onmessage: null, postMessage: (m) => answers.get(m.id)?.(m) };
  globalThis.self = scope;
  globalThis.fetch = srv.fetch;
  readerMain();
  let id = 0;
  return (hold = []) =>
    new Promise((resolve) => {
      id += 1;
      answers.set(id, resolve);
      scope.onmessage({ data: { id, url: 'http://x', key: 'k', slug: 's', mode: 'parts', hold } });
    });
}

const part = (key, images) => ({ key, html: `<p>${key}</p>`, assets: images.map((h, i) => ({ path: `img/${i}.png`, h })) });
const count = (srv, fn) => srv.calls.filter((c) => c.fn === fn).length;
const reset = (srv) => (srv.calls.length = 0);

test('R12: the first read takes every part and image once, composed with images inline', async () => {
  const srv = server();
  srv.parts = { pa: part('A', ['h1', 'h2']), pb: part('B', ['h2', 'h3']) };
  srv.images = { h1: 'data:1', h2: 'data:2', h3: 'data:3' };
  srv.head = { cues: [], graphics: [{ key: 'A', p: 'pa' }, { key: 'B', p: 'pb' }], ver: { n: 1 } };
  const ask = worker(srv);
  const a = await ask();
  assert.equal(a.ok, true);
  assert.deepEqual(Object.keys(a.specs).sort(), ['pa', 'pb']);
  assert.deepEqual(a.specs.pb.assets.map((x) => x.data), ['data:2', 'data:3']);
  assert.ok(a.specs.pb.assets.every((x) => !('h' in x)));
  // Three images in answers of two: asked twice, each image once.
  const asked = srv.calls.filter((c) => c.fn === 'control_output_assets').flatMap((c) => c.args.p_hashes);
  assert.equal(count(srv, 'control_output_assets'), 2);
  assert.deepEqual([...new Set(asked)].sort(), ['h1', 'h2', 'h3']);
});

test('a cue edit reads the head and no graphic; a design update reads one part and only its new image', async () => {
  const srv = server();
  srv.parts = { pa: part('A', ['h1']), pb: part('B', ['h2']) };
  srv.images = { h1: 'data:1', h2: 'data:2', h3: 'data:3' };
  srv.head = { cues: [], graphics: [{ key: 'A', p: 'pa' }, { key: 'B', p: 'pb' }], ver: { n: 1 } };
  const ask = worker(srv);
  await ask();
  reset(srv);
  srv.head = { cues: [{ id: 'c', label: 'new' }], graphics: [{ key: 'A', p: 'pa' }, { key: 'B', p: 'pb' }], ver: { n: 2 } };
  const b = await ask(['pa', 'pb']);
  assert.deepEqual(srv.calls.map((c) => c.fn), ['control_output_head']);
  assert.deepEqual(b.specs, {});
  reset(srv);
  srv.parts.pb2 = part('B', ['h1', 'h3']);
  srv.head = { cues: [], graphics: [{ key: 'A', p: 'pa' }, { key: 'B', p: 'pb2' }], ver: { n: 3 } };
  const c = await ask(['pa', 'pb']);
  assert.deepEqual(Object.keys(c.specs), ['pb2']);
  assert.deepEqual(srv.calls.find((x) => x.fn === 'control_output_parts').args.p_digests, ['pb2']);
  // h1 is held already (part A): only h3 is read.
  assert.deepEqual(srv.calls.filter((x) => x.fn === 'control_output_assets').flatMap((x) => x.args.p_hashes), ['h3']);
});

test('R13: a missing part reads the head once more; a second miss answers whole', async () => {
  const srv = server();
  srv.parts = { pa: part('A', []) };
  srv.head = { graphics: [{ key: 'A', p: 'pa' }], ver: { n: 1 } };
  srv.hideParts = 1;
  const ask = worker(srv);
  const once = await ask();
  assert.equal(count(srv, 'control_output_head'), 2);
  assert.deepEqual(Object.keys(once.specs), ['pa']);
  const srv2 = server();
  srv2.parts = { pa: part('A', []) };
  srv2.head = { graphics: [{ key: 'A', p: 'pa' }], ver: { n: 1 } };
  srv2.hideParts = 2;
  const twice = await worker(srv2)();
  assert.equal(twice.whole, true);
});

test('R13: no current head answers whole; two failed answers to one request fail the read', async () => {
  const srv = server();
  srv.head = null;
  assert.equal((await worker(srv)()).whole, true);
  const srv2 = server();
  srv2.head = { graphics: [], ver: { n: 1 } };
  srv2.fail.control_output_head = 2;
  const failed = await worker(srv2)();
  assert.equal(failed.ok, false);
  const srv3 = server();
  srv3.head = { graphics: [], ver: { n: 1 } };
  srv3.fail.control_output_head = 1;
  assert.equal((await worker(srv3)()).ok, true, 'one failed answer is asked again');
});

test('R13: it keeps only what the head it read and the one before name', async () => {
  const srv = server();
  srv.parts = { p1: part('A', ['h1']), p2: part('A', ['h2']), p3: part('A', ['h3']) };
  srv.images = { h1: 'data:1', h2: 'data:2', h3: 'data:3' };
  const ask = worker(srv);
  for (const p of ['p1', 'p2', 'p3']) {
    srv.head = { graphics: [{ key: 'A', p }], ver: { n: 1 } };
    await ask();
  }
  // p1 was named two heads ago: dropped, so naming it again reads it again (and its image).
  reset(srv);
  srv.head = { graphics: [{ key: 'A', p: 'p1' }], ver: { n: 4 } };
  await ask();
  assert.equal(count(srv, 'control_output_parts'), 1);
  assert.deepEqual(srv.calls.filter((x) => x.fn === 'control_output_assets').flatMap((x) => x.args.p_hashes), ['h1']);
  // p3 was named by the head before: still held, read from the worker's own copy.
  reset(srv);
  srv.head = { graphics: [{ key: 'A', p: 'p3' }], ver: { n: 5 } };
  await ask();
  assert.equal(count(srv, 'control_output_parts'), 0);
});
