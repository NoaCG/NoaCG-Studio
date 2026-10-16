// guards: src/model/importTemplate.ts
//
// A PACKAGE'S PREVIEW FRAME IS NEVER ONE OF ITS SOURCES (#1233).
//
// `noacg validate --screenshots` writes `thumbnail.png` beside the sources and names it in the
// OGraf manifest's `thumbnails`. Reading the package as a folder skips it (cli/src/workspace.ts
// `zipDirectory`); reading the same package as a zip imported it as an asset, so the frame of an
// old validate travelled on as part of the graphic and was written back over the fresh one. The
// zip importer now leaves out what a NoaCG manifest names as a thumbnail, and nothing else: a real
// image that happens to be a png still imports, and so does a `thumbnail.png` no manifest names or
// somebody else's manifest names (their page may show it).
//
// No browser: the importer is zip in, template out. Rolldown bundles the real module.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import JSZip from 'jszip';
import { rawSuffix } from './rolldown-raw.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The importer, bundled. JSZip stays outside and is pointed at the copy this file imports: a
 *  data: module has no folder to resolve a bare `jszip` from. */
async function load(entry) {
  const bundle = await rolldown({ input: entry, platform: 'neutral', external: ['jszip'], plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  const code = output[0].code.replace(/from "jszip"/g, `from ${JSON.stringify(import.meta.resolve('jszip'))}`);
  return import(`data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`);
}

const { importZipTemplate } = await load(path.join(projectRoot, 'src/model/importTemplate.ts'));

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A NoaCG-shaped package zip: `lower/lower.html` with a logo, plus whatever `extra` adds. */
async function packageZip(extra = {}) {
  const zip = new JSZip();
  zip.file('lower/lower.html', '<html><head><title>Lower</title></head><body><img src="images/logo.png"></body></html>');
  zip.file('lower/images/logo.png', PNG);
  for (const [name, data] of Object.entries(extra)) zip.file(name, data);
  return zip.generateAsync({ type: 'arraybuffer' });
}

/** A NoaCG manifest (it carries `v_noacg`, as export/noacgPackage.ts writes it), or a foreign one. */
const manifest = (thumbnails, { foreign = false } = {}) => JSON.stringify({
  name: 'Lower', main: 'graphic.mjs', thumbnails,
  ...(foreign ? {} : { v_noacg: { format: 'noacg-graphic', version: 1, type: 'lower-third' } }),
});
const assetPaths = (template) => template.assets.map((a) => a.path).sort();

test('the thumbnail the manifest names is not imported, a sibling png is', async () => {
  const { template, noacg } = await importZipTemplate('lower.zip', await packageZip({
    'lower/lower.ograf.json': manifest([{ file: 'thumbnail.png', resolution: { width: 1920, height: 1080 } }]),
    'lower/thumbnail.png': PNG,
  }));
  assert.deepEqual(assetPaths(template), ['images/logo.png']);
  assert.equal(noacg?.type, 'lower-third', 'the same manifest still gives the graphic its type');
  assert.equal(template.type, 'lower-third');
});

test('a thumbnail somebody else\'s manifest names stays an asset', async () => {
  const { template } = await importZipTemplate('lower.zip', await packageZip({
    'lower/lower.ograf.json': manifest([{ file: 'images/logo.png' }], { foreign: true }),
  }));
  assert.deepEqual(assetPaths(template), ['images/logo.png']);
});

test('a thumbnail named with ./ or in a subfolder is left out too', async () => {
  const { template } = await importZipTemplate('lower.zip', await packageZip({
    'lower/lower.ograf.json': manifest([{ file: './thumbnail.png' }, { file: 'previews/small.png' }]),
    'lower/thumbnail.png': PNG,
    'lower/previews/small.png': PNG,
  }));
  assert.deepEqual(assetPaths(template), ['images/logo.png']);
});

test('a thumbnail.png no manifest names stays an asset', async () => {
  const { template } = await importZipTemplate('lower.zip', await packageZip({ 'lower/thumbnail.png': PNG }));
  assert.deepEqual(assetPaths(template), ['images/logo.png', 'thumbnail.png']);
});

test('a manifest without thumbnails leaves every asset in', async () => {
  const { template } = await importZipTemplate('lower.zip', await packageZip({
    'lower/lower.ograf.json': manifest(undefined),
    'lower/thumbnail.png': PNG,
  }));
  assert.deepEqual(assetPaths(template), ['images/logo.png', 'thumbnail.png']);
});
