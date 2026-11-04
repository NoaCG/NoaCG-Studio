// gate: factory
// needs: browser
// guards: src/templates/importedDesign/runtime/svgFit.js
//
// AN OPERATOR'S LINE BREAKS ARE KEPT ON AIR (#1977), AND A VALUE WITHOUT ONE IS PAINTED AS BEFORE.
//
// The owner's ruling: "preserve intentional line breaks while retaining the existing wrapping,
// fitting and shrinking rules". So each break in a value is a hard line boundary, the ladder wraps
// and shrinks within and across those lines as it always has, and a value with no break takes
// exactly the path it took before. This loads the fit runtime alone, filled the way svg.ts fills
// it, into a blank page with one plate and one bound block, and drives its own functions:
//
//   wrap       svgWrapLines starts a line at every break, wraps a long line inside the count, and
//              answers a break-free value line for line as the previous greedy fill did
//   readback   svgFitValue reads a painted block back with its breaks, and without one as before
//   ladder     fitSvgText paints three typed lines as three lines, paints a break-free value the
//              same with the new greedy fill as with the previous one, and shrinks a block whose
//              breaks need more lines than the room holds - past the 55% floor where it has to,
//              since condensing cannot make a block shorter - rather than dropping a break
//
// The proof that the whole ladder is unchanged for break-free values is corpus-wide: the
// `runtime` record of scripts/svg-import-passes.test.mjs, which this change leaves as it was.
//
//   node --test scripts/svg-hard-lines.test.mjs
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

/** The greedy fill as it was before #1977, to hold a break-free value to the same lines. */
const OLD_WRAP = `function oldWrapLines(el, value, budget, max) {
  var words = value.split(/\\s+/);
  var lines = [];
  var line = '';
  for (var i = 0; i < words.length; i++) {
    var next = line ? line + ' ' + words[i] : words[i];
    el.textContent = next;
    if (line && el.getComputedTextLength() > budget && lines.length + 1 < max) {
      lines.push(line);
      line = words[i];
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}`;

/** The multiline.svg qualification fixture's plate and body block, in the artwork's own units. */
const PAGE = `<!doctype html><html><head><style>
  body{margin:0} .${TOKENS.PREFIX}-art svg{display:block;width:1100px;height:500px}
</style></head><body><div class="${TOKENS.PREFIX}-box"><div class="${TOKENS.PREFIX}-art">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 500" font-family="sans-serif" fill="#fff">
  <rect x="0" y="0" width="1100" height="500" fill="#122036"/>
  <rect x="45" y="45" width="1010" height="410" fill="#243b5a"/>
  <text x="85" y="195" font-size="34" id="f1"><tspan x="85" dy="0" data-noacg-line="">Doors open at 18:00</tspan><tspan x="85" dy="70" data-noacg-line="">Entry from the courtyard</tspan><tspan x="85" dy="70" data-noacg-line="">Step-free access on the east side</tspan></text>
</svg></div></div></body></html>`;

const LONG = 'Which of these famous chess openings begins with the moves one e four, e five, two knight f three, and is named after an Italian player?';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 500 } });
await page.setContent(PAGE);
await page.addScriptTag({ content: `${FIT}\n${OLD_WRAP}` });
test.after(() => browser.close());

test('wrap: a break starts a line, a long line wraps inside the count, and a break-free value wraps as before', async () => {
  const got = await page.evaluate((long) => {
    const el = document.getElementById('f1');
    const run = (value, budget, max) => {
      const lines = window.svgWrapLines(el, value, budget, max);
      return { lines: lines.slice(), breaks: Object.keys(lines.breaks).map(Number) };
    };
    return {
      three: run('Doors open at 19:00\nEntry from the main gate\nTickets at the door', 2000, 3),
      crlf: run('Doors open at 19:00\r\n\r\nTickets at the door\n', 2000, 5),
      wrapped: run(`Doors open at 19:00\n${long}`, 500, 6),
      tight: run(`Doors open at 19:00\n${long}`, 500, 2),
      // A PLACED line is an HTML span with a width alone: it never wraps, so a break never splits it.
      placed: window.svgHardLines(document.createElement('span'), 'Doors open\nTickets at the door'),
      plain: [200, 500, 900].map((budget) => [2, 3, 6].map((max) => [run(long, budget, max).lines, window.oldWrapLines(el, long, budget, max)])),
    };
  }, LONG);
  assert.deepEqual(got.three, { lines: ['Doors open at 19:00', 'Entry from the main gate', 'Tickets at the door'], breaks: [1, 2] });
  assert.deepEqual(got.crlf, { lines: ['Doors open at 19:00', 'Tickets at the door'], breaks: [1] }, 'CRLF and blank lines fold into one break');
  assert.equal(got.wrapped.lines[0], 'Doors open at 19:00');
  assert.ok(got.wrapped.lines.length > 2, 'the long second line wraps');
  assert.deepEqual(got.wrapped.breaks, [1], 'and only its first line starts at a break');
  assert.deepEqual(got.tight.lines, ['Doors open at 19:00', LONG], 'a count with no spare line keeps the break and leaves the width to the shrink');
  assert.deepEqual(got.placed, ['Doors open\nTickets at the door'], 'a placed HTML line keeps the old path');
  for (const row of got.plain) for (const [now, before] of row) assert.deepEqual(now, before, 'a break-free value wraps line for line as before');
});

test('readback: a painted block reads back with its breaks, and without one as before', async () => {
  const got = await page.evaluate(() => {
    const el = document.getElementById('f1');
    window.svgShowDrawn(el, window.svgFitDrawn.f1);   // the designer's own lines, as at load
    const drawn = window.svgFitValue(el);
    const hard = ['Doors open at 19:00', 'Entry from the main gate', 'Tickets at the door'];
    hard.breaks = { 1: true, 2: true };
    window.svgPaintLines(el, hard, 34, 70 / 34, null);
    const typed = window.svgFitValue(el);
    const soft = ['Doors open', 'at 19:00'];
    window.svgPaintLines(el, soft, 34, 70 / 34, null);
    return { drawn, typed, soft: window.svgFitValue(el), stamps: [...el.children].map((t) => t.getAttribute('data-noacg-line')) };
  });
  assert.equal(got.drawn, 'Doors open at 18:00 Entry from the courtyard Step-free access on the east side', "the designer's lines read as one value, as before");
  assert.equal(got.typed, 'Doors open at 19:00\nEntry from the main gate\nTickets at the door');
  assert.equal(got.soft, 'Doors open at 19:00');
  assert.deepEqual(got.stamps, ['', ''], 'a soft wrap is stamped exactly as before');
});

test('ladder: three typed lines air as three, a break-free value paints the same bytes, and too many breaks shrink', async () => {
  const got = await page.evaluate((long) => {
    const el = document.getElementById('f1');
    window.svgRestAndMeasure();
    const at = (value) => {
      el.textContent = value;
      window.fitSvgText();
      const once = el.outerHTML;
      window.refitSvgText();
      return {
        lines: [...el.querySelectorAll('tspan')].map((t) => t.textContent),
        size: parseFloat(getComputedStyle(el).fontSize),
        value: window.svgFitValue(el),
        over: window.noacgTextOverflow(),
        settled: once === el.outerHTML,
        html: el.outerHTML,
      };
    };
    const typed = at('Doors open at 19:00\nEntry from the main gate\nTickets at the door');
    const plain = at(long);
    // The previous ladder on the same value: the only difference is which greedy fill it calls.
    const keep = window.svgWrapLines;
    window.svgWrapLines = window.oldWrapLines;
    const before = at(long);
    window.svgWrapLines = keep;
    const many = at(Array.from({ length: 9 }, (_, i) => `Line ${i + 1}`).join('\n'));
    const most = at(Array.from({ length: 14 }, (_, i) => `Line ${i + 1}`).join('\n'));
    most.height = el.getBBox().height;
    most.ceiling = window.svgFitRoom.f1.height;
    return { typed, plain, before, many, most };
  }, LONG);
  assert.deepEqual(got.typed.lines, ['Doors open at 19:00', 'Entry from the main gate', 'Tickets at the door']);
  assert.equal(got.typed.size, 34, 'at the drawn size, since the room holds it');
  assert.equal(got.typed.value, 'Doors open at 19:00\nEntry from the main gate\nTickets at the door', 'and it reads back as typed');
  assert.ok(got.typed.settled, 'a second pass gives the same artwork');
  assert.equal(got.plain.html, got.before.html, 'a break-free value is painted byte for byte as with the previous greedy fill');
  assert.equal(got.many.lines.length, 9, 'nine typed lines stay nine lines');
  assert.ok(got.many.size < 34, 'and the type shrinks to hold them');
  assert.ok(got.many.settled);
  assert.equal(got.most.lines.length, 14, 'fourteen typed lines stay fourteen');
  assert.ok(got.most.size < 34 * 0.55, `and shrink past the 55% floor to fit the room (${got.most.size}px)`);
  assert.ok(got.most.height <= got.most.ceiling + 0.5, `inside the room's height (${got.most.height} of ${got.most.ceiling})`);
  assert.ok(got.most.over.includes('f1'), 'reported too long, as anything past 55% is');
});
