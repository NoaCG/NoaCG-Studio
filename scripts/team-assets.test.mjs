// guards: src/backend/assets.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'src/backend/assets.ts', platform: 'neutral', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
await bundle.close();
const { externalizeSharedAssets, rehydrateAssets, rehydrateSharedAssets, sharedAssetKey, STORAGE_SENTINEL } = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);

const dataUrl = (bytes, fill = 'A') => `data:image/png;base64,${fill.repeat(bytes)}`;
const FOLDER = 'team/00000000-0000-0000-0000-000000000001';

/** The shape of the 2026-11-03 document: 3.08 MB of assets among 0.89 MB of template text. */
function incidentDoc() {
  const graphics = Array.from({ length: 8 }, (_, i) => ({
    id: `g${i}`,
    template: {
      js: 'x'.repeat(92_000),
      css: 'y'.repeat(12_000),
      assets: [{ path: `a${i}.png`, data: dataUrl(385_000, String.fromCharCode(65 + i)) }],
    },
  }));
  return { id: 'show', name: 'Show', graphics };
}

test('a large document saves in under 1 MB and keeps everything else', async () => {
  const doc = incidentDoc();
  const before = JSON.stringify(doc).length;
  const uploaded = new Map();
  const stored = await externalizeSharedAssets(doc, FOLDER, async (key, data) => { uploaded.set(key, data); return true; });
  assert.ok(before > 3_900_000, `fixture is ${before} bytes`);
  assert.ok(JSON.stringify(stored).length < 1_000_000, `saved ${JSON.stringify(stored).length} bytes`);
  assert.equal(uploaded.size, 8);
  assert.equal(stored.graphics[3].template.js, doc.graphics[3].template.js);
  assert.ok(stored.graphics[0].template.assets[0].data.startsWith(`${STORAGE_SENTINEL}${FOLDER}/`));
  assert.ok(doc.graphics[0].template.assets[0].data.startsWith('data:'), 'the local copy must keep its bytes');
});

test('a round trip restores the identical document', async () => {
  const doc = incidentDoc();
  const bucket = new Map();
  const stored = await externalizeSharedAssets(doc, FOLDER, async (key, data) => { bucket.set(key, data); return true; });
  assert.deepEqual(await rehydrateSharedAssets(stored, async key => bucket.get(key) ?? null), doc);
});

test('a refused upload keeps that asset inline, so the save still carries it', async () => {
  const doc = incidentDoc();
  const refused = sharedAssetKey(FOLDER, doc.graphics[1].template.assets[0].data);
  const stored = await externalizeSharedAssets(doc, FOLDER, async key => key !== refused);
  assert.equal(stored.graphics[1].template.assets[0].data, doc.graphics[1].template.assets[0].data);
  assert.ok(stored.graphics[0].template.assets[0].data.startsWith(STORAGE_SENTINEL));
});

test('a failed download fails the read instead of clearing an asset', async () => {
  const stored = { graphics: [{ template: { assets: [{ path: 'a.png', data: `${STORAGE_SENTINEL}${FOLDER}/k` }] } }] };
  await assert.rejects(rehydrateSharedAssets(stored, async () => { throw new Error('503'); }), /503/);
});

test('an object that is really gone keeps its reference, so a later save cannot erase it', async () => {
  const reference = `${STORAGE_SENTINEL}${FOLDER}/gone`;
  const stored = { graphics: [{ template: { assets: [{ path: 'a.png', data: reference }] } }] };
  const read = await rehydrateSharedAssets(stored, async () => null);
  assert.equal(read.graphics[0].template.assets[0].data, reference);
  const saved = await externalizeSharedAssets(read, FOLDER, async () => { throw new Error('nothing to upload'); });
  assert.equal(saved.graphics[0].template.assets[0].data, reference);
});

test('a document from before this change, with inline assets, reads unchanged', async () => {
  const doc = incidentDoc();
  assert.deepEqual(await rehydrateSharedAssets(doc, async () => { throw new Error('nothing to download'); }), doc);
});

test('inline SVG stays inline, and two files of equal hash input length differ by key', async () => {
  const svg = { path: 'a.svg', data: 'data:image/svg+xml,<svg/>' };
  const stored = await externalizeSharedAssets({ assets: [svg] }, FOLDER, async () => { throw new Error('not uploaded'); });
  assert.equal(stored.assets[0].data, svg.data);
  assert.notEqual(sharedAssetKey(FOLDER, dataUrl(10)), sharedAssetKey(FOLDER, dataUrl(11)));
});

/** A personal record with a sound and an image in Storage, as a sync pass pulls it. */
const withSound = () => ({
  sting: { hash: 'a'.repeat(64), name: 'sting.wav', bytes: 4, mime: 'audio/wav', storageKey: 'u/audio-a' },
  template: { assets: [{ path: 'a.png', data: `${STORAGE_SENTINEL}u/img` }] },
});
const NO_ANSWER = 'Cloud get(asset) failed: The cloud did not answer.';
const stopsRead = (error) => error instanceof Error && error.message.includes('The cloud did not answer.');

test('a sound the cloud does not answer for fails the read, and nothing more is asked (#2152)', async () => {
  const asked = [];
  const read = rehydrateAssets(withSound(), async (key) => { asked.push(key); if (key === 'u/audio-a') throw new Error(NO_ANSWER); return dataUrl(4); }, stopsRead);
  await assert.rejects(read, (error) => error.message === NO_ANSWER);
  assert.deepEqual(asked, ['u/audio-a']);
});

test('a record with several sounds fails once, after asking them together, when one gets no answer', async () => {
  const body = { ...withSound(), bed: { hash: 'b'.repeat(64), name: 'bed.wav', bytes: 4, mime: 'audio/wav', storageKey: 'u/audio-b' } };
  const asked = [];
  let inFlight = 0;
  let most = 0;
  const read = rehydrateAssets(body, async (key) => {
    asked.push(key);
    inFlight += 1;
    most = Math.max(most, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    if (key === 'u/audio-a') throw new Error(NO_ANSWER);
    return dataUrl(4);
  }, stopsRead);
  await assert.rejects(read, (error) => error.message === NO_ANSWER);
  assert.deepEqual(asked.sort(), ['u/audio-a', 'u/audio-b'], 'both sounds asked, no image');
  assert.equal(most, 2, 'asked together, so the wait is one limit, not one per sound');
});

test('a sound that is gone or refused keeps its reference, and the rest of the record still reads', async () => {
  for (const failure of [async () => null, async () => { throw new Error('Cloud get(asset) failed: 503'); }]) {
    const read = await rehydrateAssets(withSound(), async (key) => (key === 'u/audio-a' ? failure() : dataUrl(4)), stopsRead);
    assert.equal(read.sting.storageKey, 'u/audio-a');
    assert.equal(read.template.assets[0].data, dataUrl(4));
  }
});
