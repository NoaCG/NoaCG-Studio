// guards: src/export/fieldReference.ts, src/export/showExport.ts, src/export/targets/casparcg.ts, src/export/targets/h2r.ts, src/export/targets/htmlOverlay.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { rolldown } from 'rolldown';
const bundle = await rolldown({ input: new URL('../src/export/fieldReference.ts', import.meta.url).pathname, platform: 'neutral', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
await bundle.close();
const { fieldReferenceMd, fieldTableMd, showFieldReferenceMd } = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);
const template = { name: 'Authored receiving graphic', fields: [
  { field: 'f0', title: 'Heading', ftype: 'textfield', value: 'Harbour' },
  { field: 'f5', title: 'Logo', ftype: 'filelist', value: 'images/harbour.svg' },
], settings: { steps: '2' } };

test('a single-file field contract never recommends a nonexistent image path as its default or input', () => {
  const before = JSON.stringify(template);
  const md = fieldReferenceMd(template, undefined, { inlineAssets: true });
  assert.match(md, /\| `f5` \| Logo \| image file \| _Kept when omitted_ \|/);
  assert.match(md, /omit it to keep the current image, or send an image data URL/);
  assert.match(md, /This HTML has no `images\/` folder/);
  assert.doesNotMatch(md, /`images\/harbour\.svg`|takes a file name/);
  assert.match(md, /"f0": "Harbour"/);
  assert.equal(JSON.stringify(template), before);
});

test('folder packages retain their real path contract, while production single-file flavours inherit the note', () => {
  const folder = fieldTableMd(template);
  assert.match(folder, /`images\/harbour\.svg`/);
  assert.match(folder, /takes a file name from this package's `images\/` folder/);
  assert.equal(fieldTableMd(template, { inlineAssets: false }), folder);
  const md = showFieldReferenceMd('Receiving production', [{ template, layer: 20, file: 'receiving/receiving.html' }], { inlineAssets: true });
  assert.match(md, /_Kept when omitted_/); assert.doesNotMatch(md, /`images\/harbour\.svg`|takes a file name/);
  const empty = fieldTableMd({ ...template, fields: [{ ...template.fields[1], value: '' }] }, { inlineAssets: true });
  assert.match(empty, /_\(empty\)_/);
});
