// guards: src/validation/validateTemplate.ts, src/validation/templateBench.ts, src/validation/publishGate.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';

async function load(input) {
  const bundle = await rolldown({ input, platform: 'neutral', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  return import('data:text/javascript;base64,' + Buffer.from(output[0].code).toString('base64'));
}
const { publishGate } = await load('src/validation/publishGate.ts');
const { validateTemplate, inlineClassicScripts } = await load('src/validation/validateTemplate.ts');
const { runBench } = await load('src/validation/templateBench.ts');
const runtime = 'function play(){} function stop(){} function update(data){}';
const definition = 'window.SPXGCTemplateDefinition={description:"Imported",DataFields:[]}';
const fixture = (code = runtime) => ({ html: `<div></div><script>${definition};${code}</script>`, css: 'body{margin:0}', js: '', fields: [], settings: {}, assets: [] });

test('an imported runtime beside its SPX definition passes every gate without rewriting source', () => {
  const template = fixture();
  const before = JSON.stringify(template);
  assert.equal(validateTemplate(template).ok, true);
  assert.equal(publishGate(template, true).ok, true);
  assert.equal(JSON.stringify(template), before);
});

test('only executable inline classic scripts supply runtime entry points and each is syntax checked', () => {
  assert.deepEqual(inlineClassicScripts(`<script data-note='src="not-a-url"' TYPE="text/javascript">${runtime}</script><script type=application/json>${runtime}</script><script type=module>${runtime}</script><script src="runtime.js">${runtime}</script>`), [runtime]);
  const dataOnly = { ...fixture(''), html: fixture('').html + `<script type="application/json">${runtime}</script>` };
  assert.ok(validateTemplate(dataOnly).errors.some(e => e.rule === 'runtime'));
  assert.ok(validateTemplate(fixture(runtime + ' const broken = ;')).errors.some(e => e.rule === 'syntax'));
  const separate = { ...fixture(), html: fixture().html + '<script>"use strict";</script><script>with({}){}</script>' };
  assert.equal(validateTemplate(separate).ok, true);
});

test('inline runtime meets the same network and frame safety checks as the JavaScript pane', () => {
  for (const code of ['fetch("/private")', 'parent.document.body.innerHTML=""']) {
    assert.ok(publishGate(fixture(runtime + code), true).errors.some(e => e.rule.startsWith('unsafe-js')));
    const module = { ...fixture(), html: fixture().html + `<script type="module">${code}</script>` };
    assert.ok(publishGate(module, true).errors.some(e => e.rule.startsWith('unsafe-js')));
  }
  assert.ok(publishGate(fixture(runtime + 'const source="https://example.com/asset";'), true).errors.some(e => e.rule === 'external-dependency'));
});

test('inline code is counted once against the unchanged UTF-8 512 KB budget', () => {
  const template = fixture();
  const bytes = new TextEncoder().encode(template.html + template.css + template.js).length;
  template.html += ' '.repeat(512 * 1024 - bytes);
  assert.equal(runBench(template, true).ok, true);
  template.html += 'é';
  assert.ok(runBench(template, true).errors.some(e => e.rule === 'too-large'));
});
