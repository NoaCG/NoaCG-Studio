// gate: build
// guards: src/format/formatCode.ts
//
// The Prettier formatting layer (src/format/formatCode.ts), run in Node: the three formatters,
// the animation-region refusal and formatTemplate's defaults. The service is house-aware on
// purpose: it formats HTML freely, but it must NEVER silently rewrite the right-aligned CSS
// comment style or the timeline's JS animation region. These were e2e/format.spec.ts's cases
// until the formatter ran in Node (#800); the format-on-create journey stays there.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildApiRuntime } from './api-runtime-build.mjs';

const runtime = await buildApiRuntime(['src/format/formatCode.ts']);
// The module imports only types from the model, so tsc may collapse rootDir; accept either shape.
const emitted = ['formatCode.js', 'format/formatCode.js', 'src/format/formatCode.js']
  .map((p) => path.join(runtime.outputDir, p))
  .find((p) => existsSync(p));
const { formatHtml, formatCss, formatJs, formatTemplate, hasProtectedRegion } = await import(pathToFileURL(emitted).href);
after(async () => { await runtime.cleanup(); });

test('formatHtml / formatCss / formatJs normalize messy code', async () => {
  const html = await formatHtml('<div   class="a"><span>x</span></div>');
  // HTML: collapsed attribute whitespace (the extra spaces before `class` are gone).
  assert.ok(html.includes('<div class="a">'));
  assert.ok(!html.includes('<div  '));
  // CSS: expanded block, one property per line.
  const css = await formatCss('.a{color:red}');
  assert.ok(css.includes('.a {'));
  assert.ok(css.includes('\n  color: red;'));
  // JS: spacing + braces normalized, single quotes, ES5 preserved.
  assert.equal(await formatJs('var x=1;function f(){return  1}'), 'var x = 1;\nfunction f() {\n  return 1;\n}\n');
});

test('formatJs refuses any file that owns an animation region', async () => {
  // A data-block template: strict-JSON NOACG_ANIM literal the timeline reads with JSON.parse.
  const dataJs = 'var animSpeed=1;\nvar NOACG_ANIM = {"version":1,"root":".x","speed":1,"steps":[]};';
  // A legacy template: the marked ANIMATION region.
  const legacyJs = 'var a=1;\n/* == ANIMATION == */\nfunction buildInTimeline(){return  1}\n/* == END ANIMATION == */';
  assert.equal(hasProtectedRegion(dataJs), true);
  assert.equal(await formatJs(dataJs), dataJs); // never reflow the timeline's JSON
  assert.equal(hasProtectedRegion(legacyJs), true);
  assert.equal(await formatJs(legacyJs), legacyJs);
});

test('formatTemplate formats HTML but leaves CSS and JS alone by default', async () => {
  // formatTemplate copies the template and formats its code strings alone, so the three
  // strings are the whole fixture.
  const messy = { html: '<div    id="f0">x</div>', css: '.a{color:red}', js: 'var x=1' };
  const result = await formatTemplate(messy);
  assert.ok(result.html.includes('<div id="f0">')); // HTML is safe to format automatically
  assert.equal(result.css, '.a{color:red}'); // CSS keeps its house right-aligned comments
  assert.equal(result.js, 'var x=1'); // JS is left for an explicit, region-aware format
});
