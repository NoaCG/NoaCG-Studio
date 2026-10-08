// guards: src/assets/animationLiteral.ts, src/blocks/animData.ts, src/templates/shared/animRuntime.ts, src/validation/validateTemplate.ts, src/validation/runtimeBench.ts, src/validation/engineSupport.ts, src/validation/templateBench.ts
//
// The graphic validators decide WHETHER to check from a marker or a registry, and an empty answer
// there reads exactly like a clean graphic: no findings. These pin the three cheapest guards
// against that (issue #803):
//   - the animation block's declaration is one constant, and what the emitter writes is what the
//     validator looks for - so changing the emitter cannot disarm the animation rules unnoticed;
//   - the engine feature table and the unsafe-JS table are not empty, and each is still consulted.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function load(entry) {
  const bundle = await rolldown({ input: path.join(root, entry), platform: 'neutral', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  return import(`data:text/javascript;base64,${Buffer.from(output[0].code, 'utf8').toString('base64')}`);
}

const anim = await load('src/blocks/animData.ts');
const { emitAnimRegion } = await load('src/templates/shared/animRuntime.ts');
const { validateTemplate } = await load('src/validation/validateTemplate.ts');
const { ENGINE_FEATURES, scanEngineSupport } = await load('src/validation/engineSupport.ts');
const { UNSAFE_JS, unsafeJsConstructs } = await load('src/validation/templateBench.ts');

const data = { version: 2, root: '.g', speed: 1, steps: [
  { name: 'In', duration: 1, ease: 'none', layers: { '#gone': { opacity: [{ time: 0, value: 0 }, { time: 1, value: 1 }] } } },
  { name: 'Out', duration: 1, ease: 'none', layers: {} },
] };

test('the emitter writes the animation declaration the validators look for', () => {
  const region = emitAnimRegion(data);
  assert.ok(region.includes(`${anim.ANIM_DECLARATION} = `), 'the emitted region declares the block with the shared constant');
  assert.ok(anim.locateAnimData(region), 'the locator finds what the emitter wrote');
  assert.ok(anim.parseAnimData(region), 'and the parser reads it back');
  // Armed, not just present: the animation rules run on an emitted block and report a finding.
  const template = { html: '<div class="g"></div>', css: '', js: region, fields: [], settings: {}, assets: [] };
  const rules = validateTemplate(template).warnings.map((w) => w.rule);
  assert.ok(rules.includes('anim-data-target'), `a layer aimed at a missing element is reported (got ${rules.join(', ') || 'nothing'})`);
});

test('the engine feature table is populated and consulted', () => {
  assert.ok(ENGINE_FEATURES.length > 0, 'an empty table would certify every template for every engine');
  for (const where of ['css', 'js']) assert.ok(ENGINE_FEATURES.some((f) => f.where === where), `no ${where} feature is listed`);
  const template = { html: '', css: '.a{color:color-mix(in srgb, red, blue)}', js: '', fields: [], settings: {}, assets: [] };
  assert.ok(scanEngineSupport(template).findings.some((f) => f.feature.id === 'css-color-mix'));
});

test('the unsafe-JS table is populated and consulted', () => {
  assert.ok(UNSAFE_JS.length > 0, 'an empty table would pass every network call and frame escape');
  assert.ok(unsafeJsConstructs('fetch("/x")').some((c) => c.rule === 'unsafe-js-network'));
});
