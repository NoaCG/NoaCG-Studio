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
const { validateTemplate, inlineClassicScripts, inlineScripts } = await load('src/validation/validateTemplate.ts');
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

// These are executable under the HTML parser even when a start/end-tag regexp misses them.
test('HTML parser states cannot hide executable inline code from the publication screen', () => {
  const unsafe = 'localStorage.getItem("screen-regression")';
  const variants = [
    `<script data-note=" src=x>">${unsafe}</script>`,
    `<script>${unsafe}</script ignored>`,
    `<script>${unsafe}</script/>`,
    `<script type="text&#47;javascript">${unsafe}</script>`,
    `<script type="text/javascript1.0">${unsafe}</script>`,
    `<script type="application/x-javascript">${unsafe}</script>`,
    `<script><!--<script></script>\n-->\n${unsafe}</script>`,
    `<script type="module">${unsafe}</script>`,
    `<svg><script src="ignored">${unsafe}</script>`,
    `<svg><script language="python">${unsafe}</script>`,
    `<svg xmlns:xlink="http://www.w3.org/1999/xlink"><script xlink:type="application/json">${unsafe}</script>`,
    `<svg><script type="text/javascript" xlink:type="application/json">${unsafe}</script>`,
  ];
  for (const html of variants) {
    const template = { ...fixture(), html: fixture().html + html };
    const before = JSON.stringify(template);
    assert.ok(publishGate(template, true).errors.some(e => e.rule === 'unsafe-js-data'), html);
    assert.equal(JSON.stringify(template), before);
  }
});

test('script inventory respects inert contexts, first attributes, MIME types and external scripts', () => {
  const code = 'window.example = 1';
  const inert = [
    `<!--<script>${code}</script>-->`,
    `<textarea><script>${code}</script></textarea>`,
    `<template><script>${code}</script></template>`,
    `<noscript><script>${code}</script></noscript>`,
    `<script type="application/json">${code}</script>`,
    `<script type="text/javascript; charset=utf-8">${code}</script>`,
    `<script type="application/json" type="text/javascript">${code}</script>`,
    `<script language="python">${code}</script>`,
    `<script src="">${code}</script>`,
  ];
  for (const html of inert) assert.deepEqual(inlineScripts(html), [], html);
  assert.deepEqual(inlineClassicScripts(`<script type="text/javascript" type="application/json">${code}</script>`), [code]);
  assert.deepEqual(inlineClassicScripts(`<script type="" language="python">${code}</script>`), [code]);
  assert.deepEqual(inlineScripts(`<script type="module">${code}</script>`), [{ code, classic: false }]);
  assert.deepEqual(inlineClassicScripts('<div>'.repeat(12000) + `<script>${code}</script>` + '</div>'.repeat(12000)), [code]);
});
