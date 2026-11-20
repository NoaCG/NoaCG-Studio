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
  SVG_BACKPLATE_SHARE: constant('src/templates/importedDesign/svg.ts', 'SVG_BACKPLATE_SHARE'),
  PANEL_SAFE: constant('src/templates/importedDesign/svgLayout.ts', 'PANEL_SAFE'),
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
  return { rows, room: window.svgFitRoom[id].width, drawn: window.svgFitWidths[id], panel: window.svgFitPanel(el)?.id ?? null };
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

// ── THE SECOND-OPINION CASES (review of 2026-11-20) ──────────────────────────────────────────
// Each mounts its own artwork on a fresh page, frame-sized, and asks what a long value paints.

/** Mount one artwork, W x H, and fit `id` through each value; the layout table is optional. */
async function fitOn({ w, h, body, id, values, layout }) {
  const p = await browser.newPage({ viewport: { width: Math.max(w, 400), height: Math.max(h, 200) } });
  await p.setContent(`<!doctype html><html><head><style>
    body{margin:0} .${TOKENS.PREFIX}-art svg{display:block;width:${w}px;height:${h}px}
  </style></head><body><div class="${TOKENS.PREFIX}-box"><div class="${TOKENS.PREFIX}-art">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" font-family="sans-serif" fill="#fff">${body}</svg>
  </div></div></body></html>`);
  if (layout) await p.addScriptTag({ content: `var NOACG_LAYOUT = ${JSON.stringify(layout)};` });
  await p.addScriptTag({ content: FIT });
  const got = await p.evaluate(({ id, values }) => {
    const el = document.getElementById(id);
    window.svgRestAndMeasure();
    window.fitSvgText();
    const drawn = el.getBoundingClientRect();
    const rows = values.map((value) => {
      const set = typeof value === 'string' ? { [id]: value } : value;
      for (const [k, v] of Object.entries(set)) document.getElementById(k).textContent = v;
      window.fitSvgText();
      const read = (k) => {
        const n = document.getElementById(k);
        const r = n.getBoundingClientRect();
        return { size: parseFloat(getComputedStyle(n).fontSize), left: r.left, right: r.right, top: r.top, lines: n.querySelectorAll('tspan[data-noacg-line]').length || 1, over: !!window.svgFitOver[k] };
      };
      return Object.fromEntries(Object.keys(set).map((k) => [k, read(k)]));
    });
    return { rows, drawn: { left: drawn.left, right: drawn.right, top: drawn.top }, room: window.svgFitRoom[id].width, panel: window.svgFitPanel(el)?.id ?? null };
  }, { id, values });
  await p.close();
  return got;
}
const LONG = 'Anna Maria Virtanen-Korhonen-Lindqvist af Ekenstam-Wallenberg';

test('1a: a name on a picture bar stops at the bar, whatever else the graphic draws far away', async () => {
  const got = await fitOn({
    w: 1920, h: 1080, id: 'f0', values: [LONG],
    body: `<image x="100" y="840" width="1000" height="130" href="${PIXEL}"/>
      <rect x="1700" y="40" width="180" height="100" fill="#f60"/>
      <text id="f0" x="130" y="900" font-size="48">Anna Virtanen</text>`,
  });
  const r = got.rows[0].f0;
  assert.ok(r.right <= 1100 + 0.5, `the name ends on the bar (right ${r.right.toFixed(1)})`);
});

test('1b: text never leaves the frame, even over a picture that bleeds past it', async () => {
  const wide = await fitOn({
    w: 1920, h: 1080, id: 'f0', values: [LONG + ' ' + LONG],
    body: `<image x="100" y="840" width="2300" height="130" href="${PIXEL}"/>
      <text id="f0" x="130" y="900" font-size="48">Anna Virtanen</text>`,
  });
  assert.ok(wide.rows[0].f0.right <= 1920 + 0.5, `inside a 1920 frame (right ${wide.rows[0].f0.right.toFixed(1)})`);
  const small = await fitOn({
    w: 500, h: 200, id: 'f0', values: [LONG],
    body: `<image x="0" y="60" width="700" height="80" href="${PIXEL}"/>
      <text id="f0" x="20" y="110" font-size="30">Anna</text>`,
  });
  assert.ok(small.rows[0].f0.right <= 500 + 0.5, `inside a 500 frame (right ${small.rows[0].f0.right.toFixed(1)})`);
});

test('1c: a line that is the widest thing drawn still gets room, up to what is beside it', async () => {
  const ada = await fitOn({
    w: 800, h: 300, id: 'f0', values: ['Ada Lovelace'],
    body: `<circle cx="20" cy="20" r="4" fill="#f60"/>
      <text id="f0" x="40" y="120" font-size="48">Ada</text>
      <text id="f1" x="390" y="120" font-size="24">LIVE</text>`,
  });
  assert.ok(ada.room > 250, `room reaches towards LIVE at 390, not Ada's own width (room ${ada.room.toFixed(1)})`);
  assert.equal(ada.rows[0].f0.size, 48, '"Ada Lovelace" keeps 48px');
  assert.ok(ada.rows[0].f0.right <= 390, 'and stops before LIVE');
  const caption = await fitOn({
    w: 1920, h: 1080, id: 'f0', values: ['A caption a little longer than drawn'],
    body: `<rect x="1800" y="40" width="20" height="20" fill="#f60"/>
      <text id="f0" x="100" y="900" font-size="30">A caption as drawn</text>`,
  });
  assert.equal(caption.rows[0].f0.size, 30, `a slightly longer caption keeps its size (room ${caption.room.toFixed(1)})`);
});

test('1d: a bar drawn as a stroked line is the room, not the whole frame', async () => {
  const got = await fitOn({
    w: 1920, h: 1080, id: 'f0', values: [LONG],
    body: `<line x1="100" y1="900" x2="1100" y2="900" stroke="#123" stroke-width="120"/>
      <text id="f0" x="130" y="915" font-size="48">Anna Virtanen</text>`,
  });
  assert.ok(got.rows[0].f0.right <= 1100 + 0.5, `the name ends on the stroked bar (right ${got.rows[0].f0.right.toFixed(1)})`);
});

test('1e: two unboxed lines growing towards each other never overlap', async () => {
  const facing = await fitOn({
    w: 800, h: 300, id: 'f0', values: [{ f0: 'Alexandra Montgomery-Smith', f1: 'LIVE FROM HELSINKI' }],
    body: `<text id="f0" x="40" y="100" font-size="30">Alex</text>
      <text id="f1" x="420" y="100" font-size="30" text-anchor="end">LIVE</text>`,
  });
  const { f0, f1 } = facing.rows[0];
  assert.ok(f0.right <= f1.left + 0.5, `start line ends ${f0.right.toFixed(1)}, end line starts ${f1.left.toFixed(1)}`);
  const centred = await fitOn({
    w: 800, h: 300, id: 'f0', values: [{ f0: 'Alexandra Montgomery-Smith' }],
    body: `<text id="f0" x="200" y="100" font-size="30" text-anchor="middle">Alex</text>
      <text id="f1" x="330" y="100" font-size="30">LIVE</text>`,
  });
  assert.ok(centred.rows[0].f0.right <= 330 + 0.5, `a centred line stops before what is beside it (right ${centred.rows[0].f0.right.toFixed(1)})`);
});

test('5a: a loose line sits on the bar under its baseline, not on a badge it grazes', async () => {
  const got = await fitOn({
    w: 800, h: 300, id: 'f0', values: [],
    body: `<rect id="bar" x="100" y="100" width="335" height="46" fill="#123"/>
      <rect id="badge" x="104" y="161" width="94" height="40" fill="#f60"/>
      <text id="f0" x="110" y="150" font-size="56">Al</text>`,
  });
  assert.equal(got.panel, 'bar');
});

test('5b: an alignment the author chose moves a loose line', async () => {
  const body = `<rect id="bar" x="100" y="100" width="500" height="160" fill="#123"/>
    <text id="f0" x="90" y="150" font-size="40">Anna</text>`;
  const top = await fitOn({ w: 800, h: 300, id: 'f0', values: ['Anna'], body, layout: { version: 1, rules: [], lines: [{ el: 'f0', h: 'start', v: 'top' }] } });
  const bottom = await fitOn({ w: 800, h: 300, id: 'f0', values: ['Anna'], body, layout: { version: 1, rules: [], lines: [{ el: 'f0', h: 'start', v: 'bottom' }] } });
  assert.equal(top.panel, 'bar');
  assert.ok(bottom.rows[0].f0.top - top.rows[0].f0.top > 40, `bottom (${bottom.rows[0].f0.top.toFixed(1)}) sits well below top (${top.rows[0].f0.top.toFixed(1)})`);
});

test('6: a frame-sized unfilled rectangle does not beat the bar a tall name sits on', async () => {
  const got = await fitOn({
    w: 1920, h: 1080, id: 'f0', values: [LONG],
    body: `<rect fill="none" width="1920" height="1080"/>
      <rect id="bar" x="100" y="860" width="1000" height="56" fill="#123"/>
      <text id="f0" x="130" y="905" font-size="56">Anna Virtanen</text>`,
  });
  assert.equal(got.panel, 'bar');
  assert.ok(got.rows[0].f0.right <= 1100 + 0.5, `the name ends on the bar (right ${got.rows[0].f0.right.toFixed(1)})`);
});

test('wrap: the runtime wraps where the step offers the choice, and not where it does not', async () => {
  const long = 'Which of these chess openings begins with the moves one e four e five two knight f three';
  const tall = await fitOn({
    w: 1920, h: 1080, id: 'f0', values: [long],
    body: `<rect x="100" y="700" width="1000" height="300" fill="#123"/>
      <text id="f0" x="130" y="760" font-size="40">Who won?</text>`,
  });
  assert.ok(tall.rows[0].f0.lines > 1, `a long question wraps in its tall box (${tall.rows[0].f0.lines} lines)`);
  const body = `<rect x="100" y="840" width="1000" height="130" fill="#123"/>
      <text id="f0" x="130" y="900" font-size="48">Anna Virtanen</text>
      <text id="f1" x="130" y="950" font-size="30">Reporter</text>`;
  const free = await fitOn({ w: 1920, h: 1080, id: 'f0', values: [long], body });
  const one = await fitOn({ w: 1920, h: 1080, id: 'f0', values: [long], body, layout: { version: 1, rules: [], lines: [{ el: 'f0', wrap: false }] } });
  assert.equal(free.rows[0].f0.lines, 1, 'a name with its title right under it stays on one line');
  assert.equal(free.rows[0].f0.size, one.rows[0].f0.size, 'and "wraps" paints exactly what "one line" paints');
});
