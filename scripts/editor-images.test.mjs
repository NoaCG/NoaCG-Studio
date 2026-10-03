// guards: src/blocks/editorImages.ts, src/blocks/assetOps.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = await rolldown({ input: path.join(root, 'src/blocks/editorImages.ts'), platform: 'neutral', plugins: [rawSuffix], logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
await bundle.close();
const { importAssets, removeUnusedAsset, imagePlacement } = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);
const template = () => ({ html: '', css: '', js: '', fields: [], assets: [], resolution: { width: 1920, height: 1080 } });
const red = 'data:image/png;base64,cmVk', blue = 'data:image/png;base64,Ymx1ZQ==';
test('asset import settles names and deduplicates bytes through a complete batch', () => {
  const t = template();
  const result = importAssets(t, [{ path: 'images/logo.png', data: red }, { path: 'images/logo.png', data: red }, { path: 'images/logo.png', data: blue }]);
  assert.equal(result.template.assets.length, 2);
  assert.deepEqual(result.paths, ['images/logo.png', 'images/logo.png', 'images/logo-1.png']);
  assert.equal(t.assets.length, 0);
  assert.equal(importAssets(result.template, [{ path: 'images/other.png', data: red }]).template, result.template);
  assert.equal(importAssets(result.template, [{ path: 'images/other.png', data: red.replace('image/png', 'application/octet-stream') }]).template, result.template);
});
test('invalid asset batches refuse without modifying their input', () => {
  for (const path of ['C:/logo.png', '../logo.png', 'images/../logo.png', '/logo.png', 'images/a".png', 'images/a<.png']) {
    const t = template(); assert.throws(() => importAssets(t, [{ path, data: red }]), /path/i); assert.equal(t.assets.length, 0);
  }
  assert.throws(() => importAssets(template(), [{ path: 'images/logo.png', data: 'bad' }]), /data|bytes/i);
  assert.throws(() => importAssets(template(), [{ path: 'images/logo.png', data: 'data:image/png;base64,' }]), /bytes/i);
  assert.throws(() => importAssets(template(), []), /batch/i);
  assert.throws(() => importAssets(template(), Array.from({ length: 101 }, () => ({ path: 'images/a.png', data: red }))), /batch/i);
});
test('referenced and missing assets cannot be removed, unused removal keeps other assets', () => {
  const t = { ...template(), assets: [{ path: 'images/logo.png', data: red }, { path: 'images/spare.png', data: blue }] };
  for (const file of ['html', 'css', 'js']) assert.throws(() => removeUnusedAsset({ ...t, [file]: './images/logo.png' }, 'images/logo.png'), /used|referenced/i);
  assert.throws(() => removeUnusedAsset({ ...t, fields: [{ field: 'f0', value: 'images/logo.png' }] }, 'images/logo.png'), /used|referenced/i);
  assert.throws(() => removeUnusedAsset(t, 'images/missing.png'), /missing/i);
  assert.deepEqual(removeUnusedAsset(t, 'images/spare.png').assets, [t.assets[0]]);
  assert.equal(t.assets.length, 2);
});
test('placement never stretches or enlarges and maps frame center through the drawing space', () => {
  const t = template();
  const p = imagePlacement(t, { width: 4000, height: 1000 }, { x: 800, y: 400 }, [1, 0, 0, 1, 0, 900]);
  assert.deepEqual(p, { x: 560, y: -560, width: 480, height: 120 });
  assert.deepEqual(imagePlacement(t, { width: 80, height: 240 }, { x: 100, y: 100 }, [1, 0, 0, 1, 0, 0]), { x: 60, y: -20, width: 80, height: 240 });
  for (const size of [{ width: 0, height: 1 }, { width: NaN, height: 1 }, { width: 1, height: Infinity }]) assert.throws(() => imagePlacement(t, size, { x: 0, y: 0 }, [1, 0, 0, 1, 0, 0]), /size/i);
  assert.throws(() => imagePlacement(t, { width: 1, height: 1 }, { x: 0, y: 0 }, [0, 0, 0, 0, 0, 0]), /singular|surface/i);
  assert.throws(() => imagePlacement(t, { width: 1, height: 1 }, { x: NaN, y: 0 }, [1, 0, 0, 1, 0, 0]), /surface/i);
  assert.throws(() => imagePlacement(t, { width: 1, height: 1 }, { x: 0, y: 0 }, [2, 0, 0, 1, 0, 0]), /surface/i);
});
