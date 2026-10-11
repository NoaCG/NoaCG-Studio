// guards: src/assets/animationLiteral.ts, src/blocks/animData.ts, src/templates/shared/animRuntime.ts, src/validation/validateTemplate.ts, src/validation/runtimeBench.ts, src/validation/engineSupport.ts, src/validation/templateBench.ts, src/validation/designRulesWarnings.ts, src/validation/readiness.ts
//
// The graphic validators decide WHETHER to check from a marker or a registry, and an empty answer
// there reads exactly like a clean graphic: no findings. These pin the three cheapest guards
// against that (issue #803):
//   - the animation block's declaration is one constant, and what the emitter writes is what the
//     validator looks for - so changing the emitter cannot disarm the animation rules unnoticed;
//   - the engine feature table and the unsafe-JS table are not empty, and each is still consulted;
//   - the design-rules warnings say "not checked" when they had no frame to read, and the
//     readiness report claims that finding rather than passing over it (issue #840).
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

const [anim, { emitAnimRegion }, { validateTemplate }, { ENGINE_FEATURES, scanEngineSupport }, { UNSAFE_JS, unsafeJsConstructs }, rules, readiness] = await Promise.all([
  'src/blocks/animData.ts',
  'src/templates/shared/animRuntime.ts',
  'src/validation/validateTemplate.ts',
  'src/validation/engineSupport.ts',
  'src/validation/templateBench.ts',
  'src/validation/designRulesWarnings.ts',
  'src/validation/readiness.ts',
].map(load));

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

const TEMPLATE = {
  name: 't', type: 'lower-third', resolution: { width: 1920, height: 1080 }, fps: 50,
  html: '', css: '', js: '', fields: [{ field: 'f0', ftype: 'textfield', title: 'Name', value: 'Ana' }],
  settings: {}, assets: [],
};

test('the design-rules warnings say "not checked" when there is no frame to read', async () => {
  // Node has no DOM: the export panel's measurement cannot mount a frame here, which is exactly
  // the case that used to come back as an empty list - the answer a clean graphic gets.
  const offline = await rules.checkTemplateLegibility(TEMPLATE, null);
  assert.deepEqual(offline.map((w) => w.rule), [rules.LEGIBILITY_UNMEASURED]);
  const unrendered = rules.designRulesWarnings({ defaultView: null, body: null }, TEMPLATE, null);
  assert.deepEqual(unrendered.map((w) => w.rule), [rules.LEGIBILITY_UNMEASURED]);
});

test('the readiness report claims "not checked" on the legibility row instead of passing', () => {
  const warning = { rule: rules.LEGIBILITY_UNMEASURED, message: 'Legibility was not checked: test.' };
  const validation = { ok: true, errors: [], warnings: [warning] };
  const row = readiness.readinessRows(validation, true).find((r) => r.id === 'legibility');
  assert.equal(row.state, 'warn');
  assert.deepEqual(row.messages, [warning.message]);
  assert.deepEqual(readiness.unclaimedFindings(validation), []);
});
