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
