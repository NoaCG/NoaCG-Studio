// guards: src/model/compositionPlacement.ts, src/blocks/compositionEdits.ts, src/preview/composeDocument.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { rolldown } from 'rolldown';
const bundle = await rolldown({ input: 'src/model/compositionPlacement.ts', platform: 'neutral', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm', codeSplitting: false }); await bundle.close();
const { compositionPlacementRule: rule, readCompositionPlacement: read, authoringCompositionCss: authoring } = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);
const resolution = { width: 1920, height: 1080 };
const source = ':root{--sentinel:"} /* {";}\n.foreign{clip-path:inset(2px);}\n';

test('the emitted crop maps onto the fixed output frame for both axes and scales', () => {
  for (const size of [resolution, { width: 1080, height: 1920 }, { width: 3840, height: 2160 }]) {
    for (const values of [{ x: 120, y: -30, scale: .8 }, { x: -80, y: 90, scale: 1.25 }, { x: 100000, y: -100000, scale: .01 }, { x: -100000, y: 100000, scale: 100 }, { x: .1234564, y: -.6543214, scale: 1.3333334 }]) {
      const css = source + rule(values, size), decoded = read(css, size);
      const [top, right, bottom, left] = /clip-path: inset\(([^)]+)\)/.exec(decoded.owned.block)[1].split(' ').map(value => Number(value.slice(0, -2)));
      const { x, y, scale } = decoded.values;
      const boundaries = [x + scale * left, y + scale * top, x + scale * (size.width - right), y + scale * (size.height - bottom)];
      for (const [index, expected] of [0, 0, size.width, size.height].entries()) assert.ok(Math.abs(boundaries[index] - expected) < 1e-9, JSON.stringify({ values, size, boundaries, index }));
      assert.equal(decoded.css, source); assert.equal(rule(decoded.values, size), decoded.owned.block);
    }
  }
});
test('repeated source edits round-trip and normalized identity removes the complete owner', () => {
  let css = source;
  for (let index = 0; index < 12; index++) {
    const decoded = read(css, resolution); assert.equal(decoded.css, source);
    css = decoded.css + rule({ x: index / 4, y: -index / 8, scale: 1 + index / 10 }, resolution);
    assert.equal(read(css, resolution).css, source);
  }
  assert.equal(rule({ x: .0000004, y: -.0000004, scale: 1.0000004 }, resolution), '');
  assert.equal(read(css, resolution).css + rule({ x: 0, y: 0, scale: 1 }, resolution), source);
});
test('nested, duplicated, tampered and incomplete owners are refused without adoption', () => {
  const owned = rule({ x: 120, y: -30, scale: .8 }, resolution);
  const variants = [source + owned + owned, '@media(min-width:99999px){' + owned + '}\n', '@media(min-width:99999px)' + owned,
    '/* parked' + owned + '*/', 'p{content:"' + owned + '";}\n', source + owned + '@media(min-width:1px){',
    source + owned.replace('clip-path: inset(', 'clip-path: inset(1px '), source + owned.replace('  scale: 0.8;', '  scale: 0.8;\n  opacity: 0.5;')];
  for (const css of variants) { assert.throws(() => read(css, resolution)); assert.equal(authoring(css, resolution), css); }
  assert.throws(() => read(source + owned, { width: 1921, height: 1080 }));
  assert.equal(authoring(source + owned, { width: 1921, height: 1080 }), source + owned);
});
test('pasteboard removes only its recognized crop and retains placement and foreign clips', () => {
  const owned = rule({ x: -80, y: 90, scale: 1.25 }, resolution), css = source + owned;
  const result = authoring(css, resolution);
  assert.equal(result, source + owned.replace(/^ {2}clip-path:[^\n]+\n/m, ''));
  assert.ok(result.includes('.foreign{clip-path:inset(2px);}')); assert.ok(result.includes('translate: -80px 90px;')); assert.equal(authoring(source, resolution), source);
});
