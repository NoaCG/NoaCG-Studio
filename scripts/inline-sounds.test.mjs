// guards: src/export/inlineSounds.ts, src/export/selfContained.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { rolldown } from 'rolldown';
const bundle = await rolldown({ input: 'src/export/inlineSounds.ts', platform: 'neutral', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
await bundle.close();
const { inlineSounds } = await import('data:text/javascript;base64,' + Buffer.from(output[0].code).toString('base64'));
const audio = (path, data) => ({ path, data, audio: { name: 'test.wav' } });
const template = (js, assets = []) => ({ js, assets });
const evaluate = (js) => { const scope = { window: {} }; vm.runInNewContext(js, scope); return scope; };

test('sound resolver keeps HTML parser control sequences as exact data', async () => {
  for (const text of ['</ScRiPt><script>window.injected=true</script>', '<!--<script>', '<script>']) {
    const key = 'sounds/' + text + '.wav', value = 'data:audio/wav;base64,' + text;
    const js = await inlineSounds(template('window.authored = 1 < 2;', [audio(key, value)]));
    assert.equal(js.slice(0, js.indexOf('window.authored')).includes('<'), false);
    const { window } = evaluate(js);
    assert.equal(window.noacgResolveSound(key), value);
    assert.equal(window.noacgResolveSound('missing.wav'), 'missing.wav');
    assert.equal(window.authored, true);
  }
});

test('picture remapping preserves metadata and cannot rewrite serialized data', async () => {
  const path = 'images/picture.png', image = 'data:image/png;base64,</script>"\\<!--<script>';
  const selector = 'picture:' + path;
  const config = { visuals: { [selector]: { topology: path, bindings: { [path]: { asset: path } } } } };
  const source = `var NOACG_PRODUCTION_SOUNDS = ${JSON.stringify(config).replace(/\//g, '\\u002f')};\nvar noacgSoundConfigError = null;\nvar noacgSoundVisual = ${JSON.stringify(selector).replace(/\//g, '\\u002f')};`;
  const js = await inlineSounds(template(source, [{ path, data: image }]));
  assert.equal(js.includes('<'), false);
  const scope = evaluate(js);
  assert.equal(scope.noacgSoundVisual, 'picture:' + image);
  assert.deepEqual(JSON.parse(JSON.stringify(scope.NOACG_PRODUCTION_SOUNDS)), { visuals: { ['picture:' + image]: config.visuals[selector] } });
});

test('normal audio, image references and authored JavaScript keep their existing behavior', async () => {
  const data = 'data:audio/wav;base64,UklGRg==', image = 'data:image/png;base64,cG5n';
  const source = 'window.picture = "images/a.png"; window.authored = 1 < 2;';
  const js = await inlineSounds(template(source, [audio('sounds/a.wav', data), { path: 'images/a.png', data: image }]));
  const { window } = evaluate(js);
  assert.equal(window.noacgResolveSound('sounds/a.wav'), data);
  assert.equal(window.picture, image);
  assert.equal(window.authored, true);
  assert.equal(await inlineSounds(template('window.authored = 1 < 2;')), 'window.authored = 1 < 2;');
  await assert.rejects(inlineSounds(template('', [audio('sounds/a.wav', 'unpackaged')])), /Sound is not packaged/);
});
