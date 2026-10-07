// guards: src/model/editorOrganization.ts, src/blocks/assetOps.ts, src/blocks/editorOrganization.ts, src/blocks/editorImages.ts, src/assets/assetUtils.ts, src/assets/assetInfo.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transform } from 'sucrase';

const compiled = transform(readFileSync('src/model/editorOrganization.ts', 'utf8'), { transforms: ['typescript'] }).code;
const modelUrl = 'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64');
const { readOrganization, writeOrganization, inspectOrganization } = await import(modelUrl);
// These assertions exercise the real pure asset functions. Their unrelated browser
// imports are omitted so Node can load them without a DOM/module bundler.
const dataUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
function assetModuleUrl(path, imports = '') {
  const source = readFileSync(path, 'utf8').replace(/^import[\s\S]*?;[ \t]*\r?$/gm, '');
  const code = 'import { readOrganization, writeOrganization, validBin, splitOrganizationHtml } from ' + JSON.stringify(modelUrl) + ';\n' + imports + transform(source, { transforms: ['typescript'] }).code;
  return dataUrl(code);
}
const assetOpsUrl = assetModuleUrl('src/blocks/assetOps.ts');
const { moveAsset } = await import(assetOpsUrl);
const { inlineAssetRefs } = await import(assetModuleUrl('src/assets/assetUtils.ts'));
const { referenceCount } = await import(assetModuleUrl('src/assets/assetInfo.ts'));
const imagesUrl = assetModuleUrl('src/blocks/editorImages.ts', 'import {moveAsset} from ' + JSON.stringify(assetOpsUrl) + ';\n');
const { applyOrganization } = await import(assetModuleUrl('src/blocks/editorOrganization.ts', 'import {renameGraphicAsset} from ' + JSON.stringify(imagesUrl) + ';\n'));
const plain = { html: '<div id="art">Unchanged artwork</div>', css: '#art {color:red}', js: 'window.play=()=>{}', assets: [], fields: [] };
const organization = { version: 1, folders: [{ id: 'folder:1', name: 'Plate --> <dark> & \'quote\'', scope: null, parent: null, members: ['#art'] }], bins: ['images/Sponsors'] };

test('old source migrates on read without a source write', () => {
  assert.deepEqual(readOrganization(plain), { version: 1, folders: [], bins: [] });
  assert.strictEqual(writeOrganization(plain, readOrganization(plain)), plain);
});
test('organization round trip preserves artwork bytes and neutralizes comment terminators', () => {
  const result = writeOrganization(plain, organization);
  assert.deepEqual(readOrganization(result), organization);
  assert.equal(result.html.slice(result.html.indexOf('-->') + 4), plain.html);
  assert.equal(result.css, plain.css); assert.equal(result.js, plain.js);
  assert.strictEqual(writeOrganization(result, organization), result);
  assert.equal(writeOrganization(result, { version: 1, folders: [], bins: [] }).html, plain.html);
});
test('future versions, unknown fields and invalid trees stay read-only', () => {
  for (const value of [{ ...organization, version: 99 }, { ...organization, future: true }, { ...organization, folders: [{ ...organization.folders[0], parent: 'folder:1' }] }, { ...organization, folders: [{ ...organization.folders[0], members: ['#art', '#art'] }] }]) {
    const source = { ...plain, html: '<!-- NOACG_ORGANIZATION ' + JSON.stringify(value) + ' -->\n' + plain.html };
    assert.throws(() => readOrganization(source), /unsupported/); assert.match(inspectOrganization(source).reason, /unsupported/);
    assert.throws(() => writeOrganization(source, organization), /unsupported/);
  }
});
test('a metadata-shaped string inside artwork code cannot be rewritten as a source header', () => {
  const html = '<script>var note=\'<!-- NOACG_ORGANIZATION ' + JSON.stringify({ version: 1, folders: [], bins: ['images/Sponsors'] }) + ' -->\';</script>' + plain.html;
  assert.throws(() => readOrganization({ html }), /unsupported/);
});
test('asset moves and inlining preserve folder labels while rewriting artwork verbatim', () => {
  const path = 'images/First/red.svg', data = 'data:image/svg+xml;base64,PHN2Zy8+';
  const source = writeOrganization({ ...plain, html: '<img src="./' + path + '">', assets: [{ path, data }] }, { ...organization, folders: [{ ...organization.folders[0], name: path }] });
  const moved = moveAsset(source, path, 'images/Second/red.svg').template;
  assert.equal(readOrganization(moved).folders[0].name, path);
  assert.ok(moved.html.endsWith('<img src="./images/Second/red.svg">'));
  const inline = inlineAssetRefs(source.html, source.assets);
  assert.deepEqual(readOrganization({ html: inline }), readOrganization(source));
  assert.ok(inline.endsWith('<img src="' + data + '">'));
  const future = { ...source, html: source.html.replace('"version":1', '"version":99') };
  assert.throws(() => moveAsset(future, path, 'images/Second/red.svg'), /unsupported/);
});
test('inert organization labels do not count as asset references', () => {
  const path = 'images/First/red.svg';
  const source = writeOrganization(plain, { ...organization, folders: [{ ...organization.folders[0], name: path }] });
  assert.equal(referenceCount(source, path), 0);
  assert.equal(referenceCount({ ...source, html: source.html + '<img src="' + path + '">', css: 'url(./' + path + ')' }, path), 2);
});
test('nested bin renames refuse paths occupied by another moving asset', () => {
  const source = writeOrganization({ ...plain, assets: [{ path: 'images/A/C/red.svg', data: 'data:image/svg+xml;base64,PHN2Zy8+' }, { path: 'images/A/B/C/red.svg', data: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }] }, { version: 1, folders: [], bins: ['images/A'] });
  assert.throws(() => applyOrganization(source, { kind: 'bin.rename', from: 'images/A', to: 'images/A/B' }), /collide/);
});
