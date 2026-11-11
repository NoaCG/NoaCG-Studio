import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { rolldown } from 'rolldown';
import { rawSuffix } from '../scripts/rolldown-raw.mjs';

const entry = resolve('.noacg/e1-center-base-virtual.mjs');
const bundle = await rolldown({ input: entry, platform: 'browser', logLevel: 'silent', plugins: [{
  name: 'center-control',
  resolveId(id) { return id === entry ? id : null; },
  load(id) { return id === entry ? `export { anchorOperations, editAnchorAtPlayhead } from '../src/components/editorFoundation/animationAuthoring.ts';
    export { emitAnimRegion } from '../src/templates/shared/animRuntime.ts';
    export { baseValues } from '../src/blocks/baseEdits.ts';` : null; },
}, rawSuffix] });
const { output } = await bundle.generate({ format: 'iife', name: 'CENTER_PROBE', codeSplitting: false });
await bundle.close();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.addScriptTag({ content: output[0].code });
  const result = await page.evaluate(() => {
    const api = window.CENTER_PROBE;
    const data = { version: 2, speed: 1, root: '#root', steps: [{ name: 'In', duration: 1, ease: 'none', layers: {} }, { name: 'Out', duration: .5, ease: 'none', layers: {} }] };
    const source = { name: 'Center anchor', type: 'lower-third', resolution: { width: 1920, height: 1080 }, fps: 25,
      html: '<!doctype html><html><head></head><body><div id="root"><div id="a" data-gfx></div></div></body></html>',
      css: '#a {position:absolute;left:20px;top:20px;width:320px;height:100px}', js: api.emitAnimRegion(data), fields: [], settings: { steps: '1' }, assets: [], layers: [] };
    const center = { x: 160, y: 50 }, base = api.baseValues(source, '#a');
    const expected = api.anchorOperations('#a', center);
    const actual = api.editAnchorAtPlayhead(source, base, center, center, 0);
    return { expected, actual };
  });
  console.log(JSON.stringify({ head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim(), ...result }, null, 2));
  if (JSON.stringify(result.actual) !== JSON.stringify(result.expected)) process.exitCode = 1;
} finally { await browser.close(); }
