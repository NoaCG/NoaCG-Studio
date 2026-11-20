// gate: factory
// needs: browser
// guards: src/templates/importedDesign/runtime/svgFit.js, src/templates/importedDesign/svg.ts, src/components/wizard/import/stageMeasure.ts
//
// A LONGER NAME KEEPS ITS DRAWN SIZE WHILE THE GRAPHIC HAS ROOM FOR IT (owner, 2026-11-20).
//
// A student's lower third shrank its name on the first extra letter, with most of the bar empty
// beside it. Three ways a hand-made file is drawn, each of which used to leave the line with NO
// panel, so its room was its own drawn width:
//
//   tight    the name is drawn a touch taller than its bar
//   left     the name starts a few units left of its bar's edge
//   nopanel  the bar is a picture, so no shape holds the line: the graphic's own length is the room
//
// And `wrap: false` (NOACG_LAYOUT.lines, the mapping step's "stays on one line") keeps a long value
// on one line where the same line otherwise wraps.
//
//   node --test scripts/svg-loose-room.test.mjs
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

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const PAGE = `<!doctype html><html><head><style>
  body{margin:0} .${TOKENS.PREFIX}-art svg{display:block;width:1000px;height:300px}
</style></head><body><div class="${TOKENS.PREFIX}-box"><div class="${TOKENS.PREFIX}-art">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300" font-family="sans-serif" fill="#fff">
  <rect id="tight" x="100" y="100" width="600" height="40" fill="#123"/>
  <rect id="left" x="100" y="180" width="600" height="80" fill="#123"/>
  <image id="pic" x="750" y="10" width="240" height="280" href="${PIXEL}"/>
  <text id="f1" x="120" y="136" font-size="44">Anna</text>
  <text id="f2" x="88" y="230" font-size="36">Anna</text>
  <text id="f3" x="760" y="60" font-size="24">Caption</text>
</svg></div></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 300 } });
await page.setContent(PAGE);
await page.addScriptTag({ content: FIT });
test.after(() => browser.close());

/** Each value written into a line and fitted: its painted size, line count and right edge. */
const STEP = ({ id, drawn, values, oneLine }) => {
  window.NOACG_LAYOUT = oneLine ? { version: 1, rules: [], lines: [{ el: id, wrap: false }] } : undefined;
  const el = document.getElementById(id);
  el.textContent = drawn;
  window.svgRestAndMeasure();
  window.fitSvgText();
  const rows = values.map((value) => {
    el.textContent = value;
    window.fitSvgText();
    return {
      value,
      size: parseFloat(getComputedStyle(el).fontSize),
      lines: el.querySelectorAll('tspan[data-noacg-line]').length || 1,
      right: el.getBoundingClientRect().right,
    };
  });
  el.textContent = drawn;
  window.fitSvgText();
  return { rows, room: window.svgFitRoom[id].width, drawn: window.svgFitWidths[id], panel: window.svgFitContainer(el)?.id ?? null };
};

for (const [id, cause, size] of [['f1', 'tight', 44], ['f2', 'left', 36]]) {
  test(`${cause}: a longer name on its bar keeps ${size}px, and a name the bar cannot hold stops before its end`, async () => {
    const got = await page.evaluate(STEP, { id, drawn: 'Anna', values: ['Anna Virtanen-Korhonen', 'Anna Maria Virtanen-Korhonen-Lindqvist af Ekenstam-Wallenberg'] });
    assert.equal(got.panel, cause, 'the line is measured on the bar it sits on');
    const [longer, huge] = got.rows;
    assert.equal(longer.size, size, `"${longer.value}" paints at the drawn size (room ${got.room.toFixed(1)})`);
    assert.ok(huge.size < size, `a name the bar cannot hold still shrinks (${huge.size})`);
    assert.ok(huge.right <= 700 + 0.5, `and stays on the bar (right edge ${huge.right.toFixed(1)})`);
  });
}

test('nopanel: a line no shape holds gets the graphic\'s length, not its own drawn width', async () => {
  const got = await page.evaluate(STEP, { id: 'f3', drawn: 'Caption', values: ['Caption and more'] });
  assert.equal(got.panel, null, 'no shape holds the caption');
  assert.ok(got.room > got.drawn * 2, `room ${got.room.toFixed(1)} is well past the drawn ${got.drawn.toFixed(1)}`);
  assert.equal(got.rows[0].size, 24, 'a longer caption keeps its drawn size');
  assert.ok(got.rows[0].right <= 990 + 0.5, 'and stays inside the graphic');
});

test('wrap: false keeps a long value on one line where the same line otherwise wraps', async () => {
  const long = 'A caption far too long for the picture it sits on, in several words';
  const wraps = await page.evaluate(STEP, { id: 'f3', drawn: 'Caption', values: [long] });
  const one = await page.evaluate(STEP, { id: 'f3', drawn: 'Caption', values: [long], oneLine: true });
  assert.ok(wraps.rows[0].lines > 1, `without it the caption wraps (${wraps.rows[0].lines} lines)`);
  assert.equal(one.rows[0].lines, 1, 'with it the caption stays on one line');
  assert.ok(one.rows[0].size < 24, `and gets smaller instead (${one.rows[0].size})`);
});
