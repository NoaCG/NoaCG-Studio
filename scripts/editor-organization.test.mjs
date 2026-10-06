// guards: src/model/editorOrganization.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transform } from 'sucrase';

const compiled = transform(readFileSync('src/model/editorOrganization.ts', 'utf8'), { transforms: ['typescript'] }).code;
const { readOrganization, writeOrganization, inspectOrganization } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
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
