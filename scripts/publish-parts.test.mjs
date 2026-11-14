// guards: src/control/publishParts.ts
// A publish in parts (live-publishing G4 section 4) names only images the server stores by content
// (base64 data URLs); a sound's reference or a text file stays inline in its part.
import test from 'node:test';
import assert from 'node:assert/strict';
import './lib/tsResolve.mjs';

const { publishInParts, forgetPublishedParts } = await import('../src/control/publishParts.ts');

function fakeServer() {
  const calls = [];
  // No stored publication: the first publish sends the head whole.
  const none = { select: () => none, eq: () => none, maybeSingle: async () => ({ data: null, error: null }) };
  const sb = {
    from: () => none,
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'control_assets_missing') return { data: args.p_hashes, error: null, status: 200 };
      if (name === 'control_asset_put') return { data: 'h', error: null, status: 200 };
      if (name === 'control_publish_parts') return { data: { landed: true, n: 2, brand: null }, error: null, status: 200 };
      return { data: null, error: { code: 'PGRST202', message: 'no such function' }, status: 404 };
    },
  };
  return { sb, calls };
}

test('only a base64 image is put and named by its content; a sound reference stays inline', async () => {
  forgetPublishedParts();
  const { sb, calls } = fakeServer();
  const image = 'data:image/png;base64,AAAA';
  const built = {
    v: 2,
    cues: [],
    graphics: [{ key: 'A', html: '<p></p>', css: '', js: '', assets: [{ path: 'a.png', data: image }, { path: 's.mp3', data: 'noacg-audio:abc' }, { path: 'n.txt', data: 'plain text' }] }],
  };
  const stamp = { n: 2, h: 'h', at: 't', g: { A: 'gA' }, t: {} };
  const got = await publishInParts(sb, 'show', built, [], stamp, null, { title: 't', bindings: {}, sources: [], collections: [], profile: null });
  assert.equal(got.kind, 'landed');
  const puts = calls.filter((c) => c.name === 'control_asset_put');
  assert.deepEqual(puts.map((c) => c.args.p_data), [image], 'only the image is put');
  const publish = calls.find((c) => c.name === 'control_publish_parts');
  const assets = publish.args.p_parts[0].body.assets;
  assert.equal(typeof assets[0].h, 'string');
  assert.equal(assets[0].data, undefined);
  assert.deepEqual(assets.slice(1), [{ path: 's.mp3', data: 'noacg-audio:abc' }, { path: 'n.txt', data: 'plain text' }]);
  assert.deepEqual(publish.args.p_parts[0].assets, [assets[0].h], 'the part names only the image');
});

// The stored boxes a publish builds with (phase 7 repair, #2532): read afresh when the production
// opens, waited for by a publish, read by the publish itself when there is none, and a failed read
// is not kept.
const { readPublishedBoxes, prefetchPublishedBoxes, storedBoxes } = await import('../src/control/publishParts.ts');
const HD = { width: 1920, height: 1080 };
const cueWith = (id, y) => ({ id, adjust: { graphicId: 'g1', box: { info: { x: 0, y, w: 10, h: 10 }, paint: null, minText: null }, frame: HD, stage: HD } });
/** A server whose stored cues are `cues()` at each read; `fail` answers an error; `hold` delays it. */
function boxesServer(cues, opts = {}) {
  let reads = 0;
  const q = { select: () => q, eq: () => q, maybeSingle: async () => {
    reads++;
    if (opts.hold) await opts.hold;
    return opts.fail?.() ? { data: null, error: { message: 'down' } } : { data: { cues: cues() }, error: null };
  } };
  return { sb: { from: () => q }, reads: () => reads };
}

test('a production opened again reads the stored boxes afresh', async () => {
  forgetPublishedParts();
  let y = 1;
  const server = boxesServer(() => [cueWith('c1', y)]);
  await prefetchPublishedBoxes(server.sb, 's1');
  y = 2; // a publish of this page load, before the production is opened again
  await prefetchPublishedBoxes(server.sb, 's1');
  assert.equal((await storedBoxes('s1', async () => server.sb)).get('c1').box.info.y, 2);
  assert.equal(server.reads(), 2);
});

test('a publish waits for the read the opening started, and reads itself when there is none', async () => {
  forgetPublishedParts();
  let release;
  const hold = new Promise((r) => (release = r));
  const server = boxesServer(() => [cueWith('c1', 5)], { hold });
  void prefetchPublishedBoxes(server.sb, 's2');
  const waiting = storedBoxes('s2', async () => server.sb);
  release();
  assert.equal((await waiting).get('c1').box.info.y, 5);
  assert.equal(server.reads(), 1, 'the publish took the opening read');
  const other = boxesServer(() => [cueWith('c1', 7)]);
  assert.equal((await storedBoxes('s3', async () => other.sb)).get('c1').box.info.y, 7);
});

test('a failed read is not kept: the next publish reads again', async () => {
  forgetPublishedParts();
  let down = true;
  const server = boxesServer(() => [cueWith('c1', 9)], { fail: () => down });
  assert.equal(await readPublishedBoxes(server.sb, 's4'), null);
  await new Promise((r) => setTimeout(r));
  down = false;
  assert.equal((await storedBoxes('s4', async () => server.sb)).get('c1').box.info.y, 9);
  assert.equal(server.reads(), 2);
});
