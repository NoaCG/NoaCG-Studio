// gate: factory
// needs: browser
// guards: src/templates/importedDesign/runtime/svgFit.js, src/templates/importedDesign/svg.ts
//
// A SCORE KEEPS ITS DRAWN SIZE WHEN ITS DIGIT COUNT GROWS, WHILE ITS PLATE HOLDS IT.
//
// The downloadable scoreboard (docs/tutorials/svg-examples/SVG/scoreboard.svg) painted "10" at
// 59% of the drawn size and "100" at 37%, in a plate that held both. Two causes, one line each
// below, both drawn the way exporters draw a score - one "0", centred in its own plate:
//
//   snug     the type's LINE box (ascent to descent) pokes past a snug plate while its em box
//            sits inside, so svgFitContainer found no plate and the room was the drawn "0"
//   centred  a plate found, but a centred line kept half its type as margin on each side, so a
//            40px "0" in a 96px plate had 56px of room
//
// And a centred line of WORDS keeps the half-type margin it had, which is the control.
//
//   node --test scripts/svg-figure-fit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
function constant(rel, name) {
  const m = new RegExp(`export const ${name} = (?:'([^']*)'|([0-9.]+));`).exec(readFileSync(root(rel), 'utf8'));
  if (!m) throw new Error(`${rel} declares no ${name}`);
  return m[1] ?? m[2];
}
const TOKENS = {
  PREFIX: constant('src/templates/importedDesign/shared.ts', 'PREFIX'),
  SVG_ALIGN_TOL: constant('src/templates/importedDesign/svg.ts', 'SVG_ALIGN_TOL'),
  SVG_LINE_HEIGHT: constant('src/templates/importedDesign/svg.ts', 'SVG_LINE_HEIGHT'),
};
let FIT = readFileSync(root('src/templates/importedDesign/runtime/svgFit.js'), 'utf8').replace(/\r\n/g, '\n');
for (const [name, value] of Object.entries(TOKENS)) FIT = FIT.split(`__${name}__`).join(value);
assert.equal(/__[A-Z][A-Z0-9_]*__/.exec(FIT), null, 'every runtime token is filled');

// The x of each "0" is where it sits centred in its plate; the runtime snaps it there anyway.
const PAGE = `<!doctype html><html><head><style>
  body{margin:0} .${TOKENS.PREFIX}-art svg{display:block;width:1000px;height:300px}
</style></head><body><div class="${TOKENS.PREFIX}-box"><div class="${TOKENS.PREFIX}-art">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300" font-family="sans-serif" fill="#000">
  <rect x="0" y="0" width="1000" height="300" fill="#1d2b53"/>
  <rect id="snug" x="100" y="100" width="96" height="44" fill="#fc0"/>
  <rect id="roomy" x="300" y="80" width="96" height="80" fill="#fc0"/>
  <rect id="words" x="500" y="80" width="300" height="80" fill="#fc0"/>
  <text id="f1" x="148" y="136" text-anchor="middle" font-size="40">0</text>
  <text id="f2" x="348" y="134" text-anchor="middle" font-size="40">0</text>
  <text id="f3" x="650" y="134" text-anchor="middle" font-size="40">HOME</text>
</svg></div></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 300 } });
await page.setContent(PAGE);
await page.addScriptTag({ content: FIT });
test.after(() => browser.close());

/** Each value written into a line and fitted: its painted size, whether it is reported, and
 *  whether its advance stays inside its plate. */
const STEP = ({ id, values }) => {
  const el = document.getElementById(id);
  window.svgRestAndMeasure();
  window.fitSvgText();
  const out = values.map((value) => {
    el.textContent = value;
    window.fitSvgText();
    return { value, size: parseFloat(getComputedStyle(el).fontSize), over: !!window.svgFitOver[id], width: el.getComputedTextLength() };
  });
  el.textContent = '0';
  window.fitSvgText();
  return { rows: out, room: window.svgFitRoom[id].width, panel: window.svgFitContainer(el)?.id ?? null };
};

for (const [id, cause] of [['f1', 'snug'], ['f2', 'roomy']]) {
  test(`${cause}: a centred score keeps 40px through 9, 10 and 100, and shrinks only when the plate cannot hold it`, async () => {
    const got = await page.evaluate(STEP, { id, values: ['9', '10', '100', '1000000'] });
    assert.equal(got.panel, cause, 'the score is measured in its own plate');
    const [nine, ten, hundred, huge] = got.rows;
    for (const r of [nine, ten, hundred]) {
      assert.equal(r.size, 40, `${r.value} paints at the drawn size (room ${got.room.toFixed(1)}, advance ${r.width.toFixed(1)})`);
      assert.equal(r.over, false, `${r.value} is not reported too long`);
    }
    assert.ok(hundred.width <= 96, `"100" fits the 96-unit plate (${hundred.width.toFixed(1)})`);
    assert.ok(huge.size < 40, `a value the plate cannot hold still shrinks (${huge.size})`);
    assert.ok(huge.width <= got.room + 0.5, 'and stays inside its room');
  });
}

test('words: a centred line of words keeps half its type as margin on each side', async () => {
  const got = await page.evaluate(STEP, { id: 'f3', values: [] });
  assert.equal(got.panel, 'words');
  assert.ok(Math.abs(got.room - (300 - 40)) < 0.5, `room is the plate less half the type each side (${got.room})`);
});

test('the mapping step and the runtime spell "a figure" the same way', () => {
  // The return line of each function, which is the whole rule.
  const rule = (rel, name) => {
    const m = new RegExp(`function ${name}\\([^)]*\\)[^{]*\\{[\\s\\S]*?\\n\\s*(return [^\\n]*)\\n\\}`).exec(readFileSync(root(rel), 'utf8'));
    assert.ok(m, `${rel} spells the figure rule in ${name}`);
    return m[1].replace(/\bvalue\b|\bs\b/g, 'v');
  };
  assert.equal(rule('src/templates/importedDesign/runtime/svgFit.js', 'svgIsFigure'), rule('src/templates/importedDesign/svg.ts', 'isSvgFigure'));
});
