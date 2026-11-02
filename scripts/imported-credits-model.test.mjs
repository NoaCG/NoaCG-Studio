// needs: browser
// guards: src/templates/importedDesign/creditsRoll.ts
// guards: src/templates/importedDesign/designTypes.ts
// guards: src/templates/behaviours/credits.ts
// guards: src/templates/importedDesign/svg.ts
// guards: src/templates/importedDesign/svgBind.ts
//
// IMPORTED CREDITS IN THE ARTWORK'S OWN STYLING: the model (jev-svg-import row 16, AC-13).
//
// The designer draws a few roles and names as separate text layers; `analyseCreditsStyle` reads
// the repeated role and name looks, the layout (role above or beside its names), the alignment and
// the spacing, with each layer as a stable source anchor, and turns the sample into ONE list in the
// native credits format. A drawing it cannot describe is refused by name and stays the artwork it
// is; nothing is converted to a catalog design. `validateCreditsBinding` checks a saved binding
// against the markup, and the saved editable and original-artwork credits must build exactly as
// they did before any of this existed (the pins below).
//
// No dev server: the modules are bundled onto one blank Chromium page, because reading SVG needs
// a real DOM (scripts/catalog-emit.mjs explains why). `CREDITS_SRC=<tree>/src/` builds the pins
// from another checkout, which is how they were taken on main.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hash, withBundledPage } from './catalog-emit.mjs';
import * as prettier from 'prettier';

const SRC = process.env.CREDITS_SRC ?? fileURLToPath(new URL('../src/', import.meta.url));
const fixture = (rel) => readFileSync(fileURLToPath(new URL(`../e2e/fixtures/${rel}`, import.meta.url)), 'utf8');
const EXPECT = JSON.parse(fixture('jev-svg/dev.expect.json'));
const DEV = ['credits-1', 'credits-2', 'credits-3'].map((id) => {
  const design = EXPECT.designs.find((d) => d.id === id);
  return { id, markup: fixture(`jev-svg/${design.svg}`), expected: design.expected };
});
const LEGACY = fixture('credits-roll.svg');
const ARTWORK = fixture('credits-artwork.svg');

const svg = (body, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800" viewBox="0 0 1000 800" font-family="sans-serif" fill="#fff"${extra}>${body}</svg>`;
const t = (x, y, size, text, more = '') => `<text x="${x}" y="${y}" font-size="${size}"${more}>${text}</text>`;
/** Synthetic drawings, each with every text layer chosen as an anchor. */
const CASES = {
  // A whole block turned as one: the shared angle is undone, so it reads as drawn.
  turned: svg(`<g transform="translate(100 100) rotate(-8)">${t(0, 0, 24, 'Design', ' fill="#fc0"')}${t(0, 60, 40, 'Jun Harbor')}${t(0, 110, 40, 'Ida Lake')}${t(0, 230, 24, 'Music', ' fill="#fc0"')}${t(0, 290, 40, 'Sol Reed')}</g>`),
  // Illustrator's centring: no text-anchor, each line its own x. Only drawn widths show it.
  centred: svg(`${t(0, 100, 24, 'Camera', ' fill="#fc0"')}${t(0, 160, 40, 'Jonas Bergström')}${t(0, 210, 40, 'Lena Fors')}`),
  // Zero, one and several names: a role with none stays in the list.
  zero: svg(`${t(100, 100, 24, 'Director', ' fill="#fc0"')}${t(100, 160, 40, 'Alex Rivera')}${t(100, 260, 24, 'Producer', ' fill="#fc0"')}${t(100, 360, 24, 'Editor', ' fill="#fc0"')}${t(100, 420, 40, 'Mia Holt')}${t(100, 470, 40, 'Ola Berg')}`),
  // The anchor stated by a stylesheet class, and a run's own x drawn over the text's.
  classed: svg(`<style>.c{text-anchor:middle}</style>${t(500, 100, 24, 'Camera', ' fill="#fc0" class="c"')}${t(500, 160, 40, 'Jonas Berg', ' class="c"')}${t(500, 210, 40, 'Lena Fors', ' class="c"')}`),
  runX: svg(`<text x="50" y="0" font-size="24" fill="#fc0"><tspan x="300" y="100">Camera</tspan></text><text x="0" y="0" font-size="40"><tspan x="300" y="160">Jonas Berg</tspan></text>`),
  // Positions stated as relative steps, in units and in ems (Inkscape writes them).
  // A run's own step replaces the text's for the first character; the two are never summed. The
  // role's run states x and dx, so the text's dx is not used; the second name's run states dy.
  steps: svg(`<text x="50" y="100" dx="30" font-size="24" fill="#fc0"><tspan x="100" dx="0">Director</tspan></text><text x="100" y="100" font-size="40"><tspan dy="60">Alex Rivera</tspan></text><text x="100" y="100" font-size="40" dy="1em"><tspan dy="2.75em">Ida Lake</tspan></text>`),
  // Roles set apart by paint alone: half-transparent fill, same size and colour.
  paint: svg(`${t(100, 100, 40, 'Director', ' fill-opacity="0.5"')}${t(100, 160, 40, 'Alex Rivera')}${t(100, 260, 40, 'Sound', ' fill-opacity="0.5"')}${t(100, 320, 40, 'Ari Moss')}`),
  // Roles set apart only by what an enclosing element does: a translucent group, an underline
  // on the text around its run. Neither is inherited, so the run's own value would read as none.
  groupOpacity: svg(`<g opacity="0.5"><text x="100" y="100" font-size="40"><tspan>Director</tspan></text></g>${t(100, 160, 40, 'Alex Rivera')}<g opacity="0.5"><text x="100" y="260" font-size="40"><tspan>Sound</tspan></text></g>${t(100, 320, 40, 'Ari Moss')}`),
  underline: svg(`<text x="100" y="100" font-size="40" text-decoration="underline"><tspan>Director</tspan></text>${t(100, 160, 40, 'Alex Rivera')}`),
  // Right-to-left credits centred on one x (Hebrew role and names).
  hebrew: svg(`${t(500, 100, 24, 'במאי', ' fill="#fc0" text-anchor="middle" direction="rtl"')}${t(500, 160, 40, 'דנה לוי', ' text-anchor="middle" direction="rtl"')}${t(500, 210, 40, 'יוסי כהן', ' text-anchor="middle" direction="rtl"')}`),
  // ... and set against their start, which is the right end.
  hebrewStart: svg(`${t(900, 100, 24, 'במאי', ' fill="#fc0" direction="rtl"')}${t(900, 160, 40, 'דנה לוי', ' direction="rtl"')}${t(900, 210, 40, 'יוסי כהן', ' direction="rtl"')}`),
  // One name look spelt by two classes that set the same values.
  twoSpellings: svg(`<style>.a{fill:#fff}.b{fill:#fff}</style>${t(100, 100, 24, 'Cast', ' fill="#fc0"')}${t(100, 160, 40, 'Ada Holm', ' class="a"')}${t(100, 210, 40, 'Bo Lind', ' class="b"')}`),
  oneLook: svg(`${t(100, 100, 40, 'Director')}${t(100, 160, 40, 'Alex Rivera')}`),
  manyLooks: svg(`${t(100, 100, 24, 'Director', ' fill="#fc0"')}${t(100, 160, 40, 'Alex Rivera')}${t(100, 220, 40, 'Ida Lake', ' fill="#f00"')}`),
  sideBySide: svg(`${t(100, 100, 24, 'Cast', ' fill="#fc0"')}${t(100, 160, 40, 'Ada')}${t(400, 160, 40, 'Bo')}`),
  mixed: svg(`${t(100, 100, 24, 'Director', ' fill="#fc0"')}${t(400, 100, 40, 'Alex Rivera')}${t(100, 220, 24, 'Sound', ' fill="#fc0"')}${t(100, 280, 40, 'Ari Moss')}`),
  misaligned: svg(`${t(100, 100, 24, 'Director', ' fill="#fc0"')}${t(160, 160, 40, 'Alex Rivera')}`),
  format: svg(`${t(100, 100, 24, 'Director', ' fill="#fc0"')}${t(100, 160, 40, 'Note: Alex')}`),
  tooFew: svg(t(100, 100, 24, 'Director')),
  // Several lines in one layer, hidden in a wrapper run the importer keeps (it positions the
  // first line) or drawn partly as loose text.
  nestedLines: svg(`<text x="100" y="100" font-size="24" fill="#fc0"><tspan x="100" y="100"><tspan>Director</tspan><tspan x="100" y="160">Alex</tspan></tspan></text>${t(100, 220, 40, 'Ida Lake')}`),
  looseLines: svg(`<text x="100" y="100" font-size="24" fill="#fc0">Director<tspan x="100" y="160">Alex</tspan></text>${t(100, 220, 40, 'Ida Lake')}`),
};

/** Row 19's drawings: a bold role look set by a stylesheet class, names drawn in a group of
 *  their own (so a copy must carry the group's look), and the two #1941 reader cases. */
const STYLED_CASES = {
  bold: svg(`<style>.r{font-weight:700;fill:#fc0}</style>${t(500, 100, 24, 'Director', ' class="r" text-anchor="middle"')}${t(500, 160, 40, 'Alex Rivera', ' text-anchor="middle"')}${t(500, 210, 40, 'Ida Lake', ' text-anchor="middle"')}${t(500, 330, 24, 'Sound', ' class="r" text-anchor="middle"')}${t(500, 390, 40, 'Ari Moss', ' text-anchor="middle"')}`),
  grouped: svg(`${t(100, 100, 24, 'Director', ' fill="#fc0"')}<g fill="#9cf" opacity="0.5" font-style="italic">${t(100, 160, 40, 'Alex Rivera')}${t(100, 210, 40, 'Ida Lake')}</g>`),
  // Styles set through the layers' ids (a copy has none), and names whose runs sit in a translucent
  // group: the group's opacity is the row's once, never again on its run.
  idGroup: svg(`<style>#rl{fill:#fc0;font-weight:700}</style><text id="rl" x="100" y="100" font-size="24"><tspan>Director</tspan></text><g opacity="0.5"><text x="100" y="160" font-size="40"><tspan>Alex Rivera</tspan></text><text x="100" y="210" font-size="40"><tspan>Ida Lake</tspan></text></g>`),
  // The first role in a translucent group of its own: names built beside it must not take it.
  roleGroup: svg(`<g opacity="0.5">${t(100, 100, 24, 'Director', ' fill="#fc0"')}</g>${t(100, 160, 40, 'Alex Rivera')}${t(100, 210, 40, 'Ida Lake')}`),
  // Loose characters painted before the first run take the text's look, not the run's.
  loose: svg(`<text x="100" y="100" font-size="40" fill="#fc0">Dir<tspan fill="#fff">ector</tspan></text>${t(100, 160, 40, 'Alex Rivera')}`),
  // One name look spelt two ways: the parsed reading compares colours, not spellings.
  spellings: svg(`${t(100, 100, 24, 'Cast', ' fill="#fc0"')}${t(100, 160, 40, 'Ada Holm', ' fill="white"')}${t(100, 210, 40, 'Bo Lind', ' fill="#ffffff"')}`),
  // Row 20, role beside. Roles set against their end at 300, names from 340: two edges.
  besideEnd: svg(`${t(300, 100, 24, 'Director', ' fill="#fc0" text-anchor="end"')}${t(340, 100, 40, 'Alex Rivera')}${t(340, 155, 40, 'Ida Lake')}${t(300, 270, 24, 'Sound', ' fill="#fc0" text-anchor="end"')}${t(340, 270, 40, 'Ari Moss')}`),
  // Names on the left, roles on the right: either column could be the roles (the one choice).
  namesLeft: svg(`${t(100, 100, 40, 'Alex Rivera')}${t(600, 100, 24, 'Director', ' fill="#fc0"')}${t(100, 155, 40, 'Ida Lake')}${t(100, 270, 40, 'Ari Moss')}${t(600, 270, 24, 'Sound', ' fill="#fc0"')}`),
  // A title drawn in the role look above the block, which a picked name must not pull in.
  headingAbove: svg(`${t(100, 60, 24, 'CREDITS', ' fill="#fc0"')}${t(100, 140, 24, 'Director', ' fill="#fc0"')}${t(100, 200, 40, 'Alex Rivera')}${t(100, 320, 24, 'Sound', ' fill="#fc0"')}${t(100, 380, 40, 'Ari Moss')}`),
  // The names-left drawing with a last name on a line of its own, and with a title in the role
  // look above it.
  namesLeftTail: svg(`${t(100, 100, 40, 'Alex Rivera')}${t(600, 100, 24, 'Director', ' fill="#fc0"')}${t(100, 155, 40, 'Ida Lake')}${t(100, 270, 40, 'Ari Moss')}${t(600, 270, 24, 'Sound', ' fill="#fc0"')}${t(100, 325, 40, 'Sol Reed')}`),
  namesLeftTitled: svg(`${t(600, 40, 24, 'CREDITS', ' fill="#fc0"')}${t(100, 100, 40, 'Alex Rivera')}${t(600, 100, 24, 'Director', ' fill="#fc0"')}${t(100, 155, 40, 'Ida Lake')}${t(100, 270, 40, 'Ari Moss')}${t(600, 270, 24, 'Sound', ' fill="#fc0"')}`),
  // Role above under a title in the NAME look, and the names-left drawing under one.
  titledNameLook: svg(`${t(100, 40, 40, 'THE TEAM')}${t(100, 140, 24, 'Director', ' fill="#fc0"')}${t(100, 200, 40, 'Alex Rivera')}${t(100, 250, 40, 'Ida Lake')}${t(100, 370, 24, 'Sound', ' fill="#fc0"')}${t(100, 430, 40, 'Ari Moss')}`),
  namesLeftNameTitle: svg(`${t(100, 40, 40, 'THE TEAM')}${t(100, 100, 40, 'Alex Rivera')}${t(600, 100, 24, 'Director', ' fill="#fc0"')}${t(100, 155, 40, 'Ida Lake')}${t(100, 270, 40, 'Ari Moss')}${t(600, 270, 24, 'Sound', ' fill="#fc0"')}`),
  // A role with no names among others (consecutive role lines), and a right-to-left drawing with
  // the names on the right, the roles on the left, and a last name on its own line.
  tightThree: svg(`${t(100, 120, 24, 'Director', ' fill="#fc0"')}${t(100, 175, 40, 'Alex Rivera')}${t(100, 225, 24, 'Sound', ' fill="#fc0"')}${t(100, 280, 40, 'Ari Moss')}${t(100, 330, 40, 'Bo Lind')}${t(100, 380, 24, 'Editor', ' fill="#fc0"')}${t(100, 435, 40, 'Sol Reed')}`),
  tightEmptyEnd: svg(`${t(100, 100, 24, 'Director', ' fill="#fc0"')}${t(100, 170, 40, 'Alex Rivera')}${t(100, 220, 24, 'Sound', ' fill="#fc0"')}${t(100, 290, 40, 'Ari Moss')}${t(100, 340, 24, 'Editor', ' fill="#fc0"')}`),
  tightThreeCodex: svg(`${t(100, 100, 24, 'Director', ' fill="#fc0"')}${t(100, 170, 40, 'Alex Rivera')}${t(100, 220, 24, 'Sound', ' fill="#fc0"')}${t(100, 290, 40, 'Ari Moss')}${t(100, 340, 24, 'Editor', ' fill="#fc0"')}${t(100, 410, 40, 'Sol Reed')}`),
  evenTitledName: svg(`${t(100, 40, 40, 'THE TEAM')}${t(100, 100, 24, 'Director', ' fill="#fc0"')}${t(100, 160, 40, 'Alex Rivera')}${t(100, 220, 24, 'Sound', ' fill="#fc0"')}${t(100, 280, 40, 'Ari Moss')}`),
  tightTitledName: svg(`${t(100, 30, 40, 'THE TEAM')}${t(100, 100, 24, 'Director', ' fill="#fc0"')}${t(100, 170, 40, 'Alex Rivera')}${t(100, 220, 24, 'Sound', ' fill="#fc0"')}${t(100, 290, 40, 'Ari Moss')}`),
  evenCentredTitled: svg(`${t(500, 40, 40, 'THE TEAM', ' text-anchor="middle"')}${t(500, 100, 24, 'Director', ' fill="#fc0" text-anchor="middle"')}${t(500, 160, 40, 'Alex Rivera', ' text-anchor="middle"')}${t(500, 220, 24, 'Sound', ' fill="#fc0" text-anchor="middle"')}${t(500, 280, 40, 'Ari Moss', ' text-anchor="middle"')}`),
  evenThree: svg(`${t(100, 100, 24, 'Director', ' fill="#fc0"')}${t(100, 160, 40, 'Alex Rivera')}${t(100, 220, 24, 'Sound', ' fill="#fc0"')}${t(100, 280, 40, 'Ari Moss')}${t(100, 340, 24, 'Editor', ' fill="#fc0"')}${t(100, 400, 40, 'Sol Reed')}`),
  evenAbove: svg(`${t(100, 100, 24, 'Director', ' fill="#fc0"')}${t(100, 160, 40, 'Alex Rivera')}${t(100, 220, 24, 'Sound', ' fill="#fc0"')}${t(100, 280, 40, 'Ari Moss')}`),
  tightAbove: svg(`${t(100, 100, 24, 'Director', ' fill="#fc0"')}${t(100, 170, 40, 'Alex Rivera')}${t(100, 220, 24, 'Sound', ' fill="#fc0"')}${t(100, 290, 40, 'Ari Moss')}`),
  emptyRoleTitled: svg(`${t(100, 20, 40, 'THE TEAM')}${t(100, 100, 24, 'Director', ' fill="#fc0"')}${t(100, 160, 40, 'Alex Rivera')}${t(100, 260, 24, 'Producer', ' fill="#fc0"')}${t(100, 360, 24, 'Editor', ' fill="#fc0"')}${t(100, 420, 40, 'Mia Holt')}`),
  emptyRole: svg(`${t(100, 100, 24, 'Director', ' fill="#fc0"')}${t(100, 160, 40, 'Alex Rivera')}${t(100, 260, 24, 'Producer', ' fill="#fc0"')}${t(100, 360, 24, 'Editor', ' fill="#fc0"')}${t(100, 420, 40, 'Mia Holt')}`),
  rtlNamesRight: svg(`${t(900, 100, 40, 'דנה לוי', ' direction="rtl"')}${t(300, 100, 24, 'במאי', ' fill="#fc0" direction="rtl"')}${t(900, 270, 40, 'יוסי כהן', ' direction="rtl"')}${t(300, 270, 24, 'צילום', ' fill="#fc0" direction="rtl"')}${t(900, 325, 40, 'רון בר', ' direction="rtl"')}`),
  // Role-above credits under a title line holding one word in each look, the name-look word first.
  twoLookTitle: svg(`${t(100, 40, 40, 'THE TEAM')}${t(600, 40, 24, 'CREDITS', ' fill="#fc0"')}${t(100, 140, 24, 'Director', ' fill="#fc0"')}${t(100, 200, 40, 'Alex Rivera')}${t(100, 250, 40, 'Ida Lake')}${t(100, 370, 24, 'Sound', ' fill="#fc0"')}${t(100, 430, 40, 'Ari Moss')}`),
  // Right to left: the role column on the right, read first.
  hebrewBeside: svg(`${t(900, 100, 24, 'במאי', ' fill="#fc0" direction="rtl"')}${t(600, 100, 40, 'דנה לוי', ' direction="rtl"')}${t(600, 155, 40, 'יוסי כהן', ' direction="rtl"')}`),
};

/** Plays one styled document on its own page and reads back what the rows show. Positions are in
 *  the artwork's own units, through the screen, so the roll's window is crossed honestly. */
async function playStyled(context, built) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.setContent(built.doc);
    await page.evaluate(() => document.fonts.ready);
    return { errors, ...(await page.evaluate(readStyled, { field: built.field.field })) };
  } finally {
    await page.close();
  }
}

/** Plays a fixed-artwork credits document: where every drawn text is at rest and halfway through
 *  the roll, and what writing every field does to the drawn words. */
async function playFixed(context, built) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.setContent(built.doc);
    await page.evaluate(() => document.fonts.ready);
    const rest = await page.evaluate(() => {
      const all = [...document.querySelectorAll('.imported-design-art text')];
      const words = all.map((t) => t.textContent);
      // Every field the definition offers, written: the drawn block takes none of it.
      const fields = window.SPXGCTemplateDefinition?.DataFields ?? [];
      window.update(JSON.stringify(Object.fromEntries(fields.map((f) => [f.field, 'Written']))));
      return {
        top: all.map((t) => t.getBoundingClientRect().top),
        block: all.map((t) => t.classList.contains('imported-design-credits')),
        ids: all.map((t) => t.getAttribute('id')),
        words,
        afterWrite: all.map((t) => t.textContent),
      };
    });
    // The take: the roll starts once the entrance has settled.
    await page.evaluate(() => window.play());
    // Polled on a timer: a page in the background gets no animation frames to poll on.
    await page.waitForFunction(() => !!(window.noacgCreditsLast && window.noacgCreditsTween), null, { timeout: 15000, polling: 100 });
    const mid = await page.evaluate(() => {
      window.noacgCreditsTween.pause();
      window.noacgCreditsTween.progress(0.5);
      const all = [...document.querySelectorAll('.imported-design-art text')];
      return { top: all.map((t) => t.getBoundingClientRect().top), last: { ...window.noacgCreditsLast } };
    });
    return { errors, rest, mid };
  } finally {
    await page.close();
  }
}

/** Runs in the played document. */
function readStyled({ field }) {
  const art = document.querySelector('.imported-design-art');
  const toArt = (el, x, y) => {
    const m = art.getScreenCTM().inverse().multiply(el.getScreenCTM());
    return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
  };
  const round = (n) => Math.round(n * 100) / 100;
  const startOf = (el) => {
    const p = el.getStartPositionOfChar(0);
    const q = toArt(el, p.x, p.y);
    return { x: round(q.x), y: round(q.y) };
  };
  const painted = (el) => {
    let node = el;
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.nodeValue.trim()) { node = n.parentNode; break; }
    let opacity = 1;
    for (let e = node; e && e !== art; e = e.parentNode) opacity *= parseFloat(getComputedStyle(e).opacity);
    const cs = getComputedStyle(node);
    return { fill: cs.fill, size: cs.fontSize, weight: cs.fontWeight, style: cs.fontStyle, family: cs.fontFamily, opacity: round(opacity) };
  };
  // Where a layer's drawn ink starts and ends along its line, in the artwork's units.
  const inkOf = (el) => {
    const b = el.getBBox();
    const y = el.getStartPositionOfChar(0).y;
    const xs = [toArt(el, b.x, y).x, toArt(el, b.x + b.width, y).x];
    return [round(Math.min(...xs)), round(Math.max(...xs))];
  };
  // Where a row's advance ends, for an edge set against the end.
  const endOf = (el) => {
    const p = el.getStartPositionOfChar(0);
    return round(toArt(el, p.x + el.getComputedTextLength(), p.y).x);
  };
  const sources = () => [...document.querySelectorAll('[data-noacg-credit]')].map((el) => ({
    mark: el.getAttribute('data-noacg-credit'), text: el.textContent, outer: el.outerHTML, visibility: getComputedStyle(el).visibility, start: startOf(el), look: painted(el), ink: inkOf(el),
  }));
  const rows = () => [...document.querySelectorAll('.imported-design-credits-row')].map((el) => ({
    kind: el.getAttribute('data-noacg-credits'), text: el.textContent, start: startOf(el), end: endOf(el), look: painted(el), id: el.getAttribute('id'),
    width: round(el.getBBox().width * Math.sqrt(Math.abs(toArt(el, 1, 0).x - toArt(el, 0, 0).x) ** 2 + Math.abs(toArt(el, 1, 0).y - toArt(el, 0, 0).y) ** 2)),
  }));
  const write = (list) => window.update(JSON.stringify({ [field]: list }));
  const atRest = { sources: sources(), rows: rows() };
  // Repeated roles and names, a role with none, a heading and a section break.
  write('Research:\nNia Vale\nTomas Fen\nIda Lake\nSound:\nAri Moss\nMusic:\n\nResearch:\nSol Reed');
  const repeated = rows();
  // Long names, measured against the drawn name look itself: each one's natural width is what the
  // first name layer draws when it holds those words.
  const nameLayer = [...document.querySelectorAll('[data-noacg-credit]')].find((el) => el.getAttribute('data-noacg-credit').endsWith(' name'));
  const roleLayer = [...document.querySelectorAll('[data-noacg-credit]')].find((el) => el.getAttribute('data-noacg-credit').endsWith(' role'));
  const natural = (words, layer = nameLayer) => {
    const first = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
    let node = first.nextNode();
    while (node && !node.nodeValue.trim()) node = first.nextNode();
    const was = node.nodeValue;
    node.nodeValue = words;
    const w = layer.getBBox().width;
    node.nodeValue = was;
    const unit = Math.hypot(toArt(layer, 1, 0).x - toArt(layer, 0, 0).x, toArt(layer, 1, 0).y - toArt(layer, 0, 0).y);
    return round(w * unit);
  };
  const long = [1, 3, 5, 14].map((n) => Array(n).fill('Aurelia Vantongeren').join(' '));
  write(`Research:\n${long.join('\n')}`);
  const longRows = rows();
  const longFit = window.noacgCreditsFit.map((f) => ({ ...f }));
  const naturals = long.map((w) => natural(w));
  const overLong = window.noacgTextOverflow();
  write('Research:\nNia Vale');
  const overShort = window.noacgTextOverflow();
  // A role too long for its room, measured the same way against the drawn role look (the list
  // format reads a role of up to 48 characters).
  const longRole = 'Aurelia Vantongeren Aurelia Vantongeren';
  write(`${longRole}:\nNia Vale`);
  const roleFit = { fit: { ...window.noacgCreditsFit[0] }, natural: natural(longRole, roleLayer), width: rows()[0].width, over: window.noacgTextOverflow() };
  // A marked heading, then loose names.
  write('# SPECIAL THANKS TO EVERYONE AT THE STUDIO\nNia Vale\nTomas Fen');
  const heading = { rows: rows(), fit: window.noacgCreditsFit.map((f) => ({ ...f })) };
  // A reset that clears every inline style (the editor's snap and reset) leaves the rows as built.
  write(`Research:\n${long[2]}`);
  const beforeReset = rows().map((r) => [r.start, r.look]);
  window.gsap.set([document.body.querySelector('div'), ...document.body.querySelector('div').querySelectorAll('*')], { clearProps: 'all' });
  const afterReset = rows().map((r) => [r.start, r.look]);
  // The take: the roll moves its own group; the source layers stay exactly as they were.
  write('Research:\nNia Vale\nTomas Fen\nSound:\nAri Moss');
  const before = sources().map((x) => x.outer);
  const tween = window.noacgCreditsRoll();
  const first = { ...window.noacgCreditsLast };
  const target = tween && tween.targets()[0].getAttribute('class');
  const again = window.noacgCreditsRoll();
  const second = { ...window.noacgCreditsLast };
  window.stopCreditsRoll();
  const stopped = window.noacgCreditsTween === null && again.isActive() === false;
  return {
    atRest, repeated, longRows, longFit, naturals, overLong, overShort, roleFit, heading, field,
    take: { ok: !!tween, first, second, target, stopped, sourcesKept: JSON.stringify(sources().map((x) => x.outer)) === JSON.stringify(before) },
    reset: { before: beforeReset, after: afterReset },
    holder: document.getElementById(field)?.className,
  };
}

/** Runs in the browser: every answer the tests below read, from one page. */
async function inPage({ dev, cases, legacy, artwork }) {
  const { NOACG_SVG: R, NOACG_IMPORTED: I, NOACG_ROLL: C } = window;
  const imported = (markup) => R.importSvgMarkup(markup);
  const parsed = (markup) => new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
  const laidOut = (markup) => {
    const host = document.createElement('div');
    host.innerHTML = markup;
    document.body.appendChild(host);
    return host.firstElementChild;
  };
  const fieldsOf = (imp) => imp.candidates.map((c) => ({ candidateId: c.id, title: c.label, sample: c.sample, numeric: c.numeric }));
  const base = (imp, behaviour) => ({ markup: imp.markup, width: imp.width, height: imp.height, fields: fieldsOf(imp), images: [], outlines: [], fonts: [], ...(behaviour ? { behaviour } : {}) });
  // The html as a tree: elements, their attributes sorted, and text. Namespace declarations are
  // left out because Chromium builds order them differently when serializing the inlined SVG
  // (the corpus records' html moves between the pinned and newer builds; css and js do not).
  const canonical = (node) => {
    if (node.nodeType === 3) return JSON.stringify(node.nodeValue);
    if (node.nodeType === 8) return `<!--${node.nodeValue}-->`;
    if (node.nodeType !== 1) return '';
    const attrs = [...node.attributes].filter((a) => a.name !== 'xmlns' && !a.name.startsWith('xmlns:')).map((a) => `${a.name}=${JSON.stringify(a.value)}`).sort();
    return `<${node.localName} ${attrs.join(' ')}>${[...node.childNodes].map(canonical).join('')}</${node.localName}>`;
  };
  const build = (designSvg) => {
    const tpl = I.IMPORTED_SVG.create({ designSvg });
    return { html: canonical(new DOMParser().parseFromString(tpl.html, 'text/html').documentElement), css: tpl.css, js: tpl.js, fields: tpl.fields };
  };

  // Pins: what saved credits and plain imports build today.
  const legacyImp = imported(legacy);
  const credits = legacyImp.candidates.findIndex((c) => c.label === 'Credits');
  const box = legacyImp.shapes.find((s) => /box/i.test(s.label))?.id;
  const artImp = imported(artwork);
  const pins = {
    editable: build(base(legacyImp, { kind: 'recipe', recipe: 'credits', layers: box ? { box } : {}, fields: { credits } })),
    artwork: build(base(artImp, { kind: 'recipe', recipe: 'credits', layers: {}, fields: { credits: artImp.candidates.findIndex((c) => c.label === 'Programme text') }, options: { artwork: true } })),
    ...Object.fromEntries(dev.map((d) => [`fixed:${d.id}`, build(base(imported(d.markup)))])),
  };
  if (!C || typeof C.analyseCreditsStyle !== 'function') return { pins };

  const parser = new Function(`${window.NOACG_PARSER.CREDITS_PARSER_JS}\nreturn parseCredits;`)();
  const parse = (list) => parser(list, (s) => s);
  const analyse = (markup, root, pick) => {
    const imp = imported(markup);
    const ids = pick ? pick(imp) : imp.candidates.map((c) => c.id);
    const doc = root(imp.markup);
    const readings = C.readCreditsAnchors(doc, ids);
    const out = C.analyseCreditsStyle(readings, ids);
    return { ids, samples: Object.fromEntries(imp.candidates.map((c) => [c.id, c.sample])), out, parsed: out.ok ? parse(out.style.list) : null };
  };
  // A dev fixture's anchors are the layers its expectation names, matched by their drawn words.
  const devPick = (d) => (imp) => d.expected.fields[0].source_anchors.map((a) => imp.candidates.find((c) => c.sample === a.default).id);
  const devResults = Object.fromEntries(dev.map((d) => [d.id, {
    parsed: analyse(d.markup, parsed, devPick(d)),
    laid: analyse(d.markup, laidOut, devPick(d)),
  }]));
  // Centre the `centred` case as Illustrator does: each line's own x, half its drawn width left of
  // the middle, and no text-anchor stated anywhere.
  const centre = (markup) => {
    const el = laidOut(markup);
    for (const text of el.querySelectorAll('text')) text.setAttribute('x', String(500 - text.getComputedTextLength() / 2));
    const out = el.outerHTML;
    el.parentElement.remove();
    return out;
  };
  const caseMarkup = { ...cases, centred: centre(cases.centred) };
  const caseResults = Object.fromEntries(Object.entries(caseMarkup).map(([k, m]) => [k, { parsed: analyse(m, parsed), laid: analyse(m, laidOut) }]));
  // One layer drawing several lines: the editable roll's own sample.
  const severalIds = [legacyImp.candidates[credits].id, legacyImp.candidates.find((c, i) => i !== credits).id];
  const several = C.analyseCreditsStyle(C.readCreditsAnchors(parsed(legacyImp.markup), severalIds), severalIds);
  const unknown = C.analyseCreditsStyle(C.readCreditsAnchors(parsed(legacyImp.markup), ['t0', 'nope']), ['t0', 'nope']);

  // Bindings: the credits-1 drawing, its first role layer carrying the one content field.
  const d1 = dev[0];
  const imp1 = imported(d1.markup);
  const a1 = analyse(d1.markup, parsed, devPick(d1)).out.style;
  const contentId = a1.anchors[0].candidateId;
  const fields1 = fieldsOf(imp1).filter((f) => f.candidateId === contentId);
  const binding = (credits, extra = {}) => ({
    markup: imp1.markup, width: imp1.width, height: imp1.height, fields: fields1, images: [], outlines: [], fonts: [],
    behaviour: { kind: 'recipe', recipe: 'credits', layers: {}, fields: { credits: 0 }, credits, ...extra },
  });
  const good = { v: 1, layout: 'role-above', playback: 'roll', anchors: a1.anchors };
  const check = (svg) => C.validateCreditsBinding(svg);
  const validation = {
    good: check(binding(good)),
    cards: check(binding({ ...good, playback: 'cards' })),
    cards2: check(binding({ ...good, playback: 'cards', advance: 2 })),
    cards60: check(binding({ ...good, playback: 'cards', advance: 60 })),
    cards1: check(binding({ ...good, playback: 'cards', advance: 1.9 })),
    cards61: check(binding({ ...good, playback: 'cards', advance: 61 })),
    cardsNaN: check(binding({ ...good, playback: 'cards', advance: Number.NaN })),
    rollTimed: check(binding({ ...good, advance: 5 })),
    playback: check(binding({ ...good, playback: 'loop' })),
    layout: check(binding({ ...good, layout: 'columns' })),
    version: check(binding({ ...good, v: 2 })),
    artwork: check(binding(good, { options: { artwork: true } })),
    staleLayout: check(binding({ ...good, layout: 'role-beside' })),
    staleAnchors: check(binding({ ...good, anchors: good.anchors.map((x, i) => (i === 1 ? { ...x, kind: 'role' } : x)) })),
    reordered: check(binding({ ...good, anchors: [...good.anchors].reverse() })),
    unknown: check(binding({ ...good, anchors: [...good.anchors, { candidateId: 'zz', kind: 'name' }] })),
    duplicate: check(binding({ ...good, anchors: [...good.anchors, good.anchors[1]] })),
    perName: check({ ...binding(good), fields: fieldsOf(imp1).filter((f) => a1.anchors.some((x) => x.candidateId === f.candidateId)) }),
    noContent: check({ ...binding(good), behaviour: { ...binding(good).behaviour, fields: {} } }),
    unsupported: (() => {
      const d3 = dev[2];
      const imp3 = imported(d3.markup);
      const ids = devPick(d3)(imp3);
      return C.validateCreditsBinding({ ...base(imp3), fields: fieldsOf(imp3).filter((f) => f.candidateId === ids[0]), behaviour: { kind: 'recipe', recipe: 'credits', layers: {}, fields: { credits: 0 }, credits: { v: 1, layout: 'role-above', playback: 'static', anchors: ids.map((candidateId, i) => ({ candidateId, kind: i % 2 ? 'name' : 'role' })) } } });
    })(),
    plain: C.validateCreditsBinding(base(imp1)),
  };
  // Reading never rewrites the designer's transforms.
  const turnedRoot = parsed(imported(cases.turned).markup);
  const before = [...turnedRoot.querySelectorAll('[transform]')].map((el) => el.getAttribute('transform'));
  C.readCreditsAnchors(turnedRoot, imported(cases.turned).candidates.map((c) => c.id));
  const after = [...turnedRoot.querySelectorAll('[transform]')].map((el) => el.getAttribute('transform'));
  // A saved binding of Illustrator-style centring validates without a root: it is laid out.
  const centredImp = imported(caseMarkup.centred);
  const centredStyle = analyse(caseMarkup.centred, laidOut).out.style;
  const centredFields = fieldsOf(centredImp).filter((f) => f.candidateId === centredStyle.anchors[0].candidateId);
  const centredCheck = C.validateCreditsBinding({ ...base(centredImp), fields: centredFields, behaviour: { kind: 'recipe', recipe: 'credits', layers: {}, fields: { credits: 0 }, credits: { v: 1, layout: centredStyle.layout, playback: 'static', anchors: centredStyle.anchors } } });
  // A run inside a name layer carrying its own id is still that name's layer.
  const nameId = good.anchors[1].candidateId;
  const runMarkup = imp1.markup.replace(new RegExp(`(<text[^>]*data-noacg-candidate="${nameId}"[^>]*>)([^<]*)<`), '$1<tspan data-noacg-candidate="run9">$2</tspan><');
  const runBinding = (credits, extraFields = []) => ({ ...binding(credits), markup: runMarkup, fields: [...fields1, ...extraFields] });
  const run = {
    perName: C.validateCreditsBinding(runBinding(good, [{ candidateId: 'run9', title: 'x', sample: 'x', numeric: false }])),
    duplicate: C.validateCreditsBinding(runBinding({ ...good, anchors: [...good.anchors, { candidateId: 'run9', kind: 'name' }] })),
    markupChanged: runMarkup !== imp1.markup,
  };
  const engine = {
    none: C.creditsEngine(base(imp1)),
    quiz: C.creditsEngine(base(imp1, { kind: 'recipe', recipe: 'meter', layers: {} })),
    editable: C.creditsEngine(base(imp1, { kind: 'recipe', recipe: 'credits', layers: {}, fields: { credits: 0 } })),
    artwork: C.creditsEngine(base(imp1, { kind: 'recipe', recipe: 'credits', layers: {}, fields: { credits: 0 }, options: { artwork: true } })),
    styled: C.creditsEngine(binding(good)),
    both: C.creditsEngine(binding(good, { options: { artwork: true } })),
  };
  // ROW 19: the styled engine, role above. Each binding is the reading the wizard saves: the
  // anchors `creditsPreview` reads from the first role layer down, one Credits field, a roll.
  const styledOf = (markup, roleWord, choice = {}) => {
    const imp = imported(markup);
    const content = imp.candidates.find((c) => c.sample === roleWord).id;
    const host = laidOut(imp.markup);
    const preview = C.creditsPreview(host, imp.candidates.map((c) => c.id), content, choice);
    host.parentElement.remove();
    const sources = new Set(preview.styled ? preview.anchors.map((a) => a.candidateId) : []);
    const fields = fieldsOf(imp).filter((f) => !sources.has(f.candidateId) || f.candidateId === content);
    const svg = {
      markup: imp.markup, width: imp.width, height: imp.height, fields, images: [], outlines: [], fonts: [],
      behaviour: { kind: 'recipe', recipe: 'credits', layers: {}, fields: { credits: fields.findIndex((f) => f.candidateId === content) }, credits: { v: 1, layout: preview.layout, playback: 'roll', anchors: preview.anchors } },
    };
    const tpl = I.IMPORTED_SVG.create({ designSvg: svg });
    const field = tpl.fields.find((f) => f.ftype === 'textarea');
    return { preview, engine: C.creditsEngine(svg), errors: C.validateCreditsBinding(svg), doc: window.NOACG_COMPOSE.composeDocument(tpl), html: tpl.html, css: tpl.css, js: tpl.js, field, fieldCount: tpl.fields.length, sourceMarkup: imp.markup, anchors: preview.anchors };
  };
  if (typeof C.styledCredits !== 'function') return { pins };
  // Previews only: the reading of a pick, as the drawn answer and as the other column.
  const previewOf = (markup, word, choice = {}) => {
    const imp = imported(markup);
    const host = laidOut(imp.markup);
    const out = C.creditsPreview(host, imp.candidates.map((c) => c.id), imp.candidates.find((c) => c.sample === word).id, choice);
    host.parentElement.remove();
    return out;
  };
  const previews = {
    tailAsRead: previewOf(cases.namesLeftTail, 'Sol Reed'),
    tailChosen: previewOf(cases.namesLeftTail, 'Sol Reed', { swap: true }),
    titledAsRead: previewOf(cases.namesLeftTitled, 'Director'),
    titledChosen: previewOf(cases.namesLeftTitled, 'Director', { swap: true }),
    nameTitleRole: previewOf(cases.titledNameLook, 'Director'),
    roleTitleRole: previewOf(cases.headingAbove, 'Director'),
    namesLeftNameTitle: previewOf(cases.namesLeftNameTitle, 'Director'),
    namesLeftNameTitleChosen: previewOf(cases.namesLeftNameTitle, 'Director', { swap: true }),
    emptyEditor: previewOf(cases.emptyRole, 'Editor'),
    emptyTitledFirst: previewOf(cases.emptyRoleTitled, 'Director'),
    evenFirst: previewOf(cases.evenAbove, 'Director'),
    tightFirst: previewOf(cases.tightAbove, 'Director'),
    evenMiddle: previewOf(cases.evenThree, 'Sound'),
    tightMiddle: previewOf(cases.tightThree, 'Sound'),
    tightMiddleCodex: previewOf(cases.tightThreeCodex, 'Sound'),
    tightEmptyEnd: previewOf(cases.tightEmptyEnd, 'Sound'),
    twoLookFirst: previewOf(cases.twoLookTitle, 'Director'),
    twoLookFirstOther: previewOf(cases.twoLookTitle, 'Director', { swap: true }),
    twoLookLater: previewOf(cases.twoLookTitle, 'Sound'),
    twoLookLaterOther: previewOf(cases.twoLookTitle, 'Sound', { swap: true }),
    evenTitledName: previewOf(cases.evenTitledName, 'Director'),
    tightTitledName: previewOf(cases.tightTitledName, 'Director'),
    evenCentredTitled: previewOf(cases.evenCentredTitled, 'Director'),
    emptyProducer: previewOf(cases.emptyRole, 'Producer'),
    rtlTailAsRead: previewOf(cases.rtlNamesRight, 'רון בר'),
    rtlTailChosen: previewOf(cases.rtlNamesRight, 'רון בר', { swap: true }),
  };
  const styled = {
    one: styledOf(dev[0].markup, 'Research'),
    bold: styledOf(cases.bold, 'Director'),
    grouped: styledOf(cases.grouped, 'Director'),
    roleGroup: styledOf(cases.roleGroup, 'Director'),
    idGroup: styledOf(cases.idGroup, 'Director'),
    // Row 20: role beside, the dev sample and three drawings of it; the column choice both ways;
    // a name layer picked as Credits.
    beside: styledOf(dev[1].markup, 'Réalisation'),
    besideEnd: styledOf(cases.besideEnd, 'Director'),
    hebrewBeside: styledOf(cases.hebrewBeside, 'במאי'),
    namesLeftAsRead: styledOf(cases.namesLeft, 'Alex Rivera'),
    namesLeft: styledOf(cases.namesLeft, 'Alex Rivera', { swap: true }),
    pickName: styledOf(dev[0].markup, 'Nia Vale'),
    pickBesideName: styledOf(dev[1].markup, 'Émilie Lac'),
    pickLaterRole: styledOf(dev[0].markup, 'Sound'),
    idaAsRead: styledOf(cases.namesLeft, 'Ida Lake'),
    idaChosen: styledOf(cases.namesLeft, 'Ida Lake', { swap: true }),
    tailChosen: styledOf(cases.namesLeftTail, 'Sol Reed', { swap: true }),
  };
  // #1958: credits that could be styled, kept as fixed artwork by the author's choice. As the
  // wizard saves them: every text layer stays a field, and the binding names the block's other
  // layers, read by `creditsPreview` from the Credits pick.
  const fixedOf = (markup, roleWord) => {
    const imp = imported(markup);
    const content = imp.candidates.find((c) => c.sample === roleWord).id;
    const host = laidOut(imp.markup);
    const preview = C.creditsPreview(host, imp.candidates.map((c) => c.id), content);
    host.parentElement.remove();
    const fields = fieldsOf(imp);
    const block = preview.anchors.map((a) => a.candidateId);
    const svg = {
      markup: imp.markup, width: imp.width, height: imp.height, fields, images: [], outlines: [], fonts: [],
      behaviour: { kind: 'recipe', recipe: 'credits', layers: {}, fields: { credits: fields.findIndex((f) => f.candidateId === content) }, options: { artwork: true }, artworkLayers: block.filter((id) => id !== content) },
    };
    const tpl = I.IMPORTED_SVG.create({ designSvg: svg });
    const blockFields = fields.flatMap((f, i) => (block.includes(f.candidateId) ? [tpl.fields[i]] : []));
    return { engine: C.creditsEngine(svg), styled: preview.styled, words: block.map((id) => imp.candidates.find((c) => c.id === id).sample), blockFields, doc: window.NOACG_COMPOSE.composeDocument(tpl) };
  };
  const fixedBlocks = { above: fixedOf(dev[0].markup, 'Research'), beside: fixedOf(dev[1].markup, 'Réalisation') };
  // What does NOT build styled: a playback or layout no row renders yet, and a stale binding.
  const notYet = (credits) => C.creditsEngine({ ...binding(credits) });
  const fallbacks = {
    static: notYet({ ...good, playback: 'static' }),
    cards: notYet({ ...good, playback: 'cards' }),
    stale: notYet({ ...good, anchors: [...good.anchors].reverse() }),
  };
  const staticBuild = I.IMPORTED_SVG.create({ designSvg: binding({ ...good, playback: 'static' }) });
  // ...which is the editable roll it built before any styled engine existed, byte for byte.
  fallbacks.staticBuildsEditable = staticBuild.js.includes('function creditsSampleLines(') && !staticBuild.js.includes('NOACG_CREDITS_STYLE');
  const unstyled = binding(good);
  delete unstyled.behaviour.credits;
  fallbacks.staticSameAsUnstyled = JSON.stringify(staticBuild) === JSON.stringify(I.IMPORTED_SVG.create({ designSvg: unstyled }));
  // #1941: loose characters before the first run, and colour spellings in the parsed reading.
  const loose = analyse(cases.loose, parsed);
  const looseLaid = analyse(cases.loose, laidOut);
  const spellings = analyse(cases.spellings, parsed);

  return {
    styled,
    fixedBlocks,
    previews,
    fallbacks,
    issue1941: { loose: loose.out, looseLaid: looseLaid.out, spellings: spellings.out },
    pins,
    devResults,
    caseResults,
    several,
    unknown,
    validation,
    engine,
    transforms: { before, after },
    centredCheck,
    run,
    overflow: C.CREDITS_OVERFLOW,
    constants: { layouts: window.NOACG_RECIPE.CREDITS_LAYOUTS, playbacks: window.NOACG_RECIPE.CREDITS_PLAYBACKS, seconds: window.NOACG_RECIPE.CREDITS_CARD_SECONDS },
    intent: window.NOACG_CONTRACT.SVG_INTENT.credits,
  };
}

const R = await withBundledPage(
  [
    ['assets/svgImport.ts', 'NOACG_SVG'],
    ['templates/importedDesign/svg.ts', 'NOACG_IMPORTED'],
    ['templates/importedDesign/creditsRoll.ts', 'NOACG_ROLL'],
    ['templates/endCredits/shared.ts', 'NOACG_PARSER'],
    ['templates/behaviours/credits.ts', 'NOACG_RECIPE'],
    ['ai/svgInterpretation/contract.ts', 'NOACG_CONTRACT'],
    ['preview/composeDocument.ts', 'NOACG_COMPOSE'],
  ].map(([rel, globalName]) => ({ entry: `${SRC}${rel}`, globalName })),
  async (page) => {
    const out = await page.evaluate(inPage, { dev: DEV, cases: { ...CASES, ...STYLED_CASES }, legacy: LEGACY, artwork: ARTWORK });
    // The styled documents play on pages of their own, as an output would show them.
    if (out.styled) {
      const context = await page.context().browser().newContext();
      try {
        for (const built of Object.values(out.styled)) built.played = await playStyled(context, built);
        for (const built of Object.values(out.fixedBlocks)) built.played = await playFixed(context, built);
      } finally {
        await context.close();
      }
    }
    return out;
  },
);

const sha = (o) => hash(JSON.stringify(o));

/** Taken on main e680acd1 before this row, and equal on this branch: saved editable and original-
 *  artwork credits, and each dev drawing imported as plain artwork, build byte for byte as before. */
const PINS = {
  editable: '0c878096aa7d0a8b',
  artwork: '68a2d80cedb3ac53',
  'fixed:credits-1': '82aa9a1f71492d37',
  'fixed:credits-2': 'f8df6ae2dc07db8f',
  'fixed:credits-3': 'f6535d6218476819',
};

if (process.env.CREDITS_PRINT_STYLED) console.log(JSON.stringify({ styled: R.styled, fallbacks: R.fallbacks, issue1941: R.issue1941 }, (k, v) => (['doc', 'html', 'css', 'js', 'sourceMarkup', 'outer'].includes(k) ? undefined : v), 1));
if (process.env.CREDITS_PRINT_PINS) console.log(JSON.stringify(Object.fromEntries(Object.entries(R.pins).map(([k, v]) => [k, sha(v)]))));

test('saved editable and original-artwork credits, and plain imports, build exactly as before', () => {
  for (const [k, pin] of Object.entries(PINS)) assert.equal(sha(R.pins[k]), pin, k);
  // The editable roll still has its one list field; the artwork roll offers no list to type.
  assert.ok(R.pins.editable.js.includes('function noacgCreditsRoll()'));
  assert.ok(R.pins.artwork.js.includes('function stopCreditsRoll()'));
});

const content = (expected) => expected.fields[0].content;
const asContent = (sections) => sections.flat().map((e) => ({ role: e.role, names: e.names }));

test('role above: repeated looks, multiple names and spacing read off credits-1', () => {
  for (const mode of ['parsed', 'laid']) {
    const { out, parsed, ids } = R.devResults['credits-1'][mode];
    assert.equal(out.ok, true, `${mode}: ${out.message}`);
    assert.equal(out.style.layout, 'role-above');
    assert.deepEqual(out.style.anchors.map((a) => a.kind), ['role', 'name', 'name', 'role', 'name']);
    assert.deepEqual(out.style.anchors.map((a) => a.candidateId), ids, 'anchors are the chosen layers in reading order');
    assert.deepEqual(out.style.align, { role: 'middle', name: 'middle' });
    assert.deepEqual(out.style.steps, { roleToName: 65, nameToName: 55, groupGap: 150 });
    assert.equal(out.style.list, 'Research:\nNia Vale\nTomas Fen\nSound:\nAri Moss');
    assert.deepEqual(asContent(parsed), content(DEV[0].expected), 'the list reads back as the expected content');
  }
});

test('role beside: a role column and a name column read off credits-2, multilingual', () => {
  for (const mode of ['parsed', 'laid']) {
    const { out, parsed } = R.devResults['credits-2'][mode];
    assert.equal(out.ok, true, `${mode}: ${out.message}`);
    assert.equal(out.style.layout, 'role-beside');
    assert.deepEqual(out.style.anchors.map((a) => a.kind), ['role', 'name', 'role', 'name', 'name']);
    assert.deepEqual(out.style.align, { role: 'start', name: 'start' });
    assert.deepEqual(out.style.steps, { nameToName: 55, groupGap: 170, column: 350 });
    assert.deepEqual(asContent(parsed), content(DEV[1].expected));
  }
});

test('islands at different angles are refused by name and stay artwork (credits-3)', () => {
  for (const mode of ['parsed', 'laid']) {
    const { out, ids } = R.devResults['credits-3'][mode];
    assert.equal(out.ok, false);
    assert.equal(out.code, 'mixed-angles');
    assert.equal(out.fallback, 'artwork');
    assert.ok(out.anchors.length > 0 && out.anchors.every((id) => ids.includes(id)));
    assert.deepEqual(Object.keys(out).sort(), ['anchors', 'code', 'fallback', 'message', 'ok'], 'no preset or catalog design is offered');
  }
  assert.ok(DEV[2].expected.unsupported.length > 0, 'the fixture itself declares the pattern unsupported');
});

test('a block turned as a whole reads as drawn', () => {
  const { out } = R.caseResults.turned.parsed;
  assert.equal(out.ok, true, out.message);
  assert.equal(out.style.layout, 'role-above');
  assert.deepEqual(out.style.steps, { roleToName: 60, nameToName: 50, groupGap: 120 });
  assert.equal(out.style.list, 'Design:\nJun Harbor\nIda Lake\nMusic:\nSol Reed');
});

test('centring drawn without a text-anchor needs the laid-out widths', () => {
  assert.equal(R.caseResults.centred.parsed.out.code, 'misaligned', 'without widths it is not guessed');
  const { out } = R.caseResults.centred.laid;
  assert.equal(out.ok, true, out.message);
  assert.deepEqual(out.style.align, { role: 'middle', name: 'middle' });
});

test('zero, one and several names per role keep their order in the one list', () => {
  const { out, parsed } = R.caseResults.zero.parsed;
  assert.equal(out.ok, true, out.message);
  assert.equal(out.style.list, 'Director:\nAlex Rivera\nProducer:\nEditor:\nMia Holt\nOla Berg');
  assert.deepEqual(asContent(parsed), [
    { role: 'Director', names: ['Alex Rivera'] },
    { role: 'Producer', names: [] },
    { role: 'Editor', names: ['Mia Holt', 'Ola Berg'] },
  ]);
});

test('every pattern no one style describes is refused by name, never converted', () => {
  const want = {
    oneLook: 'one-look',
    manyLooks: 'many-looks',
    sideBySide: 'side-by-side',
    mixed: 'mixed-layout',
    misaligned: 'misaligned',
    format: 'not-list-format',
    tooFew: 'too-few',
    nestedLines: 'several-lines',
    looseLines: 'several-lines',
  };
  for (const [k, code] of Object.entries(want)) {
    for (const mode of ['parsed', 'laid']) {
      const { out } = R.caseResults[k][mode];
      assert.equal(out.ok, false, `${k} ${mode}`);
      assert.equal(out.code, code, `${k} ${mode}: ${out.message}`);
      assert.equal(out.fallback, 'artwork');
    }
  }
  assert.equal(R.several.code, 'several-lines', 'the editable roll\'s one-layer sample is not this model');
  assert.equal(R.unknown.code, 'unknown-anchor');
  assert.deepEqual(R.unknown.anchors, ['nope']);
});

test('a saved binding is checked whole against the markup', () => {
  const v = R.validation;
  assert.deepEqual(v.good, []);
  assert.deepEqual(v.cards, [], 'cards default to the operator\'s Next');
  assert.deepEqual(v.cards2, []);
  assert.deepEqual(v.cards60, []);
  const has = (list, code) => assert.ok(list.some((e) => e.startsWith(`${code}:`)), `${code} in ${JSON.stringify(list)}`);
  for (const k of ['cards1', 'cards61', 'cardsNaN', 'rollTimed']) has(v[k], 'invalid-advance');
  has(v.playback, 'invalid-playback');
  has(v.layout, 'invalid-layout');
  has(v.version, 'unknown-version');
  has(v.artwork, 'conflicting-engine');
  has(v.staleLayout, 'stale-layout');
  has(v.staleAnchors, 'stale-anchors');
  has(v.reordered, 'stale-anchors');
  has(v.unknown, 'unknown-anchor');
  has(v.duplicate, 'duplicate-anchor');
  has(v.perName, 'field-per-name');
  has(v.noContent, 'no-content-field');
  has(v.unsupported, 'mixed-angles');
  assert.deepEqual(v.plain, [], 'a design without a styled binding has nothing to check');
});

test('reading leaves the designer\'s transforms as they are', () => {
  assert.ok(R.transforms.before.length > 0);
  assert.deepEqual(R.transforms.after, R.transforms.before);
});

test('a stylesheet anchor and a run\'s own position are read as drawn', () => {
  const classed = R.caseResults.classed.laid.out;
  assert.equal(classed.ok, true, classed.message);
  assert.deepEqual(classed.style.align, { role: 'middle', name: 'middle' });
  const runX = R.caseResults.runX.parsed.out;
  assert.equal(runX.ok, true, runX.message);
  assert.deepEqual(runX.style.steps, { roleToName: 60 });
});

test('two class spellings of one look are one look once laid out', () => {
  const { out } = R.caseResults.twoSpellings.laid;
  assert.equal(out.ok, true, out.message);
  assert.deepEqual(out.style.anchors.map((a) => a.kind), ['role', 'name', 'name']);
  assert.equal(R.caseResults.twoSpellings.parsed.out.code, 'many-looks', 'parsed, a class is all there is to compare');
});

test('positions are read as SVG draws them: the nearest step, either direction, both readings agreeing', () => {
  // Laid out, the position is the browser's own; the parsed reading must agree with it.
  for (const mode of ['parsed', 'laid']) {
    const { out } = R.caseResults.steps[mode];
    assert.equal(out.ok, true, `${mode}: ${out.message}`);
    assert.equal(out.style.layout, 'role-above');
    assert.deepEqual(out.style.align, { role: 'start', name: 'start' });
    assert.deepEqual(out.style.steps, { roleToName: 60, nameToName: 50 });
  }
  // Every drawing reads the same both ways, except where only the page can see the difference:
  // centring drawn without an anchor (widths) and two class spellings of one look (styles).
  for (const k of Object.keys(R.caseResults)) {
    const { parsed, laid } = R.caseResults[k];
    if (k !== 'centred' && k !== 'twoSpellings') {
      assert.equal(parsed.out.ok, laid.out.ok, `${k}: both readings accept or refuse`);
      assert.equal(parsed.out.code, laid.out.code, `${k}: both readings refuse for one reason`);
    }
    if (parsed.out.ok && laid.out.ok) assert.deepEqual(parsed.out.style.steps, laid.out.style.steps, `${k}: parsed and laid-out steps agree`);
  }
  for (const k of ['hebrew', 'hebrewStart']) {
    for (const mode of ['parsed', 'laid']) {
      const { out } = R.caseResults[k][mode];
      assert.equal(out.ok, true, `${k} ${mode}: ${out.message}`);
      assert.deepEqual(out.style.align, k === 'hebrew' ? { role: 'middle', name: 'middle' } : { role: 'start', name: 'start' }, `${k} ${mode}`);
    }
  }
});

test('paint opacity, an enclosing opacity or an enclosing underline sets a look apart', () => {
  for (const [k, kinds] of [['paint', ['role', 'name', 'role', 'name']], ['groupOpacity', ['role', 'name', 'role', 'name']], ['underline', ['role', 'name']]]) {
    for (const mode of ['parsed', 'laid']) {
      const { out } = R.caseResults[k][mode];
      assert.equal(out.ok, true, `${k} ${mode}: ${out.message}`);
      assert.deepEqual(out.style.anchors.map((a) => a.kind), kinds, `${k} ${mode}`);
    }
  }
});

test('a saved centred binding validates on its own, laid out', () => {
  assert.deepEqual(R.centredCheck, []);
});

test('a run inside an anchor layer counts as that layer', () => {
  assert.ok(R.run.markupChanged);
  assert.ok(R.run.perName.some((e) => e.startsWith('field-per-name:')), JSON.stringify(R.run.perName));
  assert.ok(R.run.duplicate.some((e) => e.startsWith('duplicate-anchor:')), JSON.stringify(R.run.duplicate));
});

test('one engine per design: styled, original artwork or editable, never two', () => {
  // Carrying both is refused by validation; the engine answer is the one the assembler builds.
  assert.deepEqual(R.engine, { none: null, quiz: null, editable: 'editable', artwork: 'artwork', styled: 'styled', both: 'artwork' });
});

test('overflow is defined for every playback and never drops, clips or switches', () => {
  assert.deepEqual(R.overflow, {
    roll: { wide: 'shrink-report', tall: 'run-through' },
    static: { wide: 'shrink-report', tall: 'shrink-then-refuse' },
    cards: { wide: 'shrink-report', tall: 'next-card' },
  });
});

test('the model spells layout and playback as the proposal contract does', () => {
  const values = (key) => R.intent[key].filter((v) => v !== 'default' && v !== 'unresolved');
  assert.deepEqual(R.constants.layouts, values('layout'));
  assert.deepEqual(R.constants.playbacks, values('playback'));
  assert.deepEqual(R.constants.seconds, { min: 2, max: 60 });
});

// ── Row 19: role-above credits rendered in the artwork's own styling ─────────────────────────

const near = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;
const ROLE_ABOVE = ['one', 'bold', 'grouped', 'roleGroup', 'idGroup'];

test('row 19: a role-above binding builds the styled engine, one Credits field holding the drawn list', () => {
  for (const k of ROLE_ABOVE) {
    const b = R.styled[k];
    assert.equal(b.preview.layout, 'role-above', k);
    assert.deepEqual(b.errors, [], k);
    assert.equal(b.engine, 'styled', k);
    assert.ok(b.js.includes('var NOACG_CREDITS_STYLE = '), `${k}: the styled runtime is emitted`);
    assert.ok(!b.js.includes('function creditsSampleLines(') && !b.js.includes('function creditsArtwork('), `${k}: and neither other engine`);
    assert.match(b.js, /"call":\s*"stopCreditsRoll"/, `${k}: Out stops the roll`);
    assert.deepEqual(b.played.errors, [], `${k}: no page errors`);
    assert.equal(b.played.holder, 'noacg-data-source', `${k}: the list lives in a hidden holder`);
  }
  // One textarea for the list, the drawn title as its own field, and Scroll speed: never a field per name.
  assert.equal(R.styled.one.field.value, 'Research:\nNia Vale\nTomas Fen\nSound:\nAri Moss');
  assert.equal(R.styled.one.fieldCount, 3);
  assert.equal(R.styled.bold.fieldCount, 2);
});

test('row 19: the sample list rebuilds exactly where and how the designer drew it', () => {
  for (const k of ROLE_ABOVE) {
    const { rows, sources } = R.styled[k].played.atRest;
    assert.equal(rows.length, sources.length, k);
    rows.forEach((row, i) => {
      const src = sources[i];
      assert.equal(row.text, src.text, `${k} ${i}`);
      assert.equal(row.kind, src.mark.split(' ')[1], `${k} ${i}: kind`);
      assert.ok(near(row.start.x, src.start.x) && near(row.start.y, src.start.y), `${k} ${i}: drawn at ${JSON.stringify(src.start)}, row at ${JSON.stringify(row.start)}`);
      assert.deepEqual(row.look, src.look, `${k} ${i}: the look is the drawn layer's`);
      assert.equal(row.id, null, `${k} ${i}: no id is copied`);
    });
  }
});

test('row 19: bold roles, and names drawn in a group of their own, keep their looks', () => {
  const bold = R.styled.bold.played.atRest.rows;
  assert.deepEqual(bold.map((r) => r.look.weight), ['700', '400', '400', '700', '400'], 'a stylesheet class sets the roles bold');
  const grouped = R.styled.grouped.played.atRest.rows;
  assert.deepEqual(grouped.map((r) => [r.look.fill, r.look.style, r.look.opacity]), [
    ['rgb(255, 204, 0)', 'normal', 1],
    ['rgb(153, 204, 255)', 'italic', 0.5],
    ['rgb(153, 204, 255)', 'italic', 0.5],
  ], 'the group\'s fill, italic and opacity travel with the names');
  const roleGroup = R.styled.roleGroup.played.atRest.rows;
  assert.deepEqual(roleGroup.map((r) => r.look.opacity), [0.5, 1, 1], 'a role\'s own group stays its own');
  const idGroup = R.styled.idGroup.played.atRest.rows;
  assert.deepEqual(idGroup.map((r) => [r.look.fill, r.look.weight, r.look.opacity]), [
    ['rgb(255, 204, 0)', '700', 1],
    ['rgb(255, 255, 255)', '400', 0.5],
    ['rgb(255, 255, 255)', '400', 0.5],
  ], 'an id-selected look reaches the copies, and a group\'s opacity applies once');
});

test('row 19: repeated roles and names follow the sample\'s spacing', () => {
  const rows = R.styled.one.played.repeated;
  assert.deepEqual(rows.map((r) => [r.kind, r.text]), [
    ['role', 'Research'], ['name', 'Nia Vale'], ['name', 'Tomas Fen'], ['name', 'Ida Lake'],
    ['role', 'Sound'], ['name', 'Ari Moss'],
    ['role', 'Music'],
    ['role', 'Research'], ['name', 'Sol Reed'],
  ], 'the drawn roles carry no colon, so the rows carry none');
  const ys = rows.map((r) => r.start.y);
  const steps = ys.slice(1).map((y, i) => Math.round((y - ys[i]) * 100) / 100);
  // credits-1: role to name 65, name to name 55, last name to the next role 150. A role with no
  // names (Music) is followed at the group gap; the blank line before the second Research is a
  // section break, which before a role is that same gap.
  assert.deepEqual(steps, [65, 55, 55, 150, 65, 150, 150, 65]);
  for (const r of rows) assert.ok(near(r.start.y - Math.round(r.start.y), 0), 'baselines sit on the drawn units');
});

test('row 19: a name too wide shrinks to its measured room, is reported past 55% and stops at the 30% floor', () => {
  const p = R.styled.one.played;
  // credits-1 centres every layer on x=400 in an 800-wide frame: a centred row may spend 400 to
  // each side, less half its type (35/2) at each edge.
  const room = 2 * 400 - 35;
  const names = p.longFit.filter((f) => f.kind === 'name');
  assert.equal(names.length, p.naturals.length);
  const regimes = new Set();
  names.forEach((fit, i) => {
    const natural = p.naturals[i];
    const want = Math.min(1, Math.max(0.3, room / natural));
    assert.ok(Math.abs(fit.scale - want) < 0.005, `${fit.words.length} chars: scale ${fit.scale}, measured ${want}`);
    assert.equal(fit.reported, want < 0.55, `${fit.words.length} chars: reported only past 55%`);
    const width = p.longRows[i + 1].width;
    if (want === 1) assert.ok(near(width, natural, 0.5), 'a name that fits is drawn at its own size');
    else if (want > 0.3) assert.ok(width <= room + 0.5 && width >= room - 3, `shrunk to the room: ${width} of ${room}`);
    else assert.ok(near(width, natural * 0.3, 1), 'at the floor it stops shrinking');
    regimes.add(want === 1 ? 'fits' : want >= 0.55 ? 'shrinks' : want > 0.3 ? 'reported' : 'floor');
  });
  assert.deepEqual([...regimes].sort(), ['shrinks', 'fits', 'floor', 'reported'].sort(), 'the names cover every rung');
  assert.deepEqual(p.overLong, [p.field], 'the overflow report names the one Credits field');
  assert.deepEqual(p.overShort, [], 'and clears when the list fits again');
});

test('row 19: the roll keeps the source layers and their original text, and replays the same', () => {
  for (const k of ROLE_ABOVE) {
    const { take, atRest } = R.styled[k].played;
    assert.equal(take.ok, true, k);
    assert.equal(take.target, 'imported-design-credits-roll', `${k}: the roll moves its own group`);
    assert.equal(take.sourcesKept, true, `${k}: the take leaves every source layer as it was`);
    assert.deepEqual(take.second, take.first, `${k}: a second take measures the same roll`);
    assert.equal(take.stopped, true, `${k}: Out stops the roll`);
    assert.deepEqual(R.styled[k].played.reset.after, R.styled[k].played.reset.before, `${k}: a reset of inline styles leaves the rows as built`);
    assert.ok(take.first.distance > 0 && take.first.duration > 0, k);
    for (const src of atRest.sources) assert.equal(src.visibility, 'hidden', `${k}: a source layer is laid out, never painted`);
  }
  assert.equal(R.styled.one.played.take.first.step, 55, 'the pace rides the drawn name step');
  // The source layers in the built html are the import's own text elements, word for word, with
  // their attributes kept; the engine adds only its class and its mark.
  for (const k of ROLE_ABOVE) {
    const b = R.styled[k];
    const doc = new Map();
    for (const m of b.html.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) doc.set(m[2], m[1]);
    for (const m of b.sourceMarkup.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
      const id = /data-noacg-candidate="([^"]+)"/.exec(m[1])?.[1];
      if (!b.anchors.some((a) => a.candidateId === id)) continue;
      const built = doc.get(m[2]);
      assert.ok(built !== undefined, `${k}: ${m[2]} is still in the file as drawn`);
      const attrs = (s) => [...s.matchAll(/([\w:-]+)="([^"]*)"/g)].filter(([, n]) => n !== 'class' && !n.startsWith('data-noacg')).map(([, n, v]) => `${n}=${v}`).sort();
      assert.deepEqual(attrs(built), attrs(m[1]), `${k}: ${m[2]} keeps its attributes`);
      assert.match(built, /data-noacg-credit="\d+ (role|name)"/);
    }
  }
});

test('row 19: what no row renders yet builds what it built before, never an untested picture', () => {
  // Static is row 22, cards row 23; a stale binding likewise. Each keeps the
  // editable roll of its one list field, exactly as before row 19.
  assert.deepEqual(R.fallbacks, { static: 'editable', cards: 'editable', stale: 'editable', staticBuildsEditable: true, staticSameAsUnstyled: true });
});

test('#1941: loose characters before the first run, and colour spellings, read as painted', () => {
  // Point 2: "Dir" is painted in the text's own gold before the white run; the look is gold.
  assert.equal(R.issue1941.loose.ok, true, R.issue1941.loose.message);
  assert.equal(R.issue1941.looseLaid.ok, true, R.issue1941.looseLaid.message);
  assert.deepEqual(R.issue1941.loose.style.anchors.map((a) => a.kind), ['role', 'name']);
  // Point 3: white and #ffffff are one name look in the parsed reading as well.
  assert.equal(R.issue1941.spellings.ok, true, R.issue1941.spellings.message);
  assert.deepEqual(R.issue1941.spellings.style.anchors.map((a) => a.kind), ['role', 'name', 'name']);
});

test('row 19: the list holder keeps its line breaks through the editor\'s code formatter', async () => {
  // The production page formats the template (src/format/formatCode.ts, the same options). A
  // collapsed holder read as one line on any stage reload before the next update().
  const formatted = await prettier.format(R.styled.one.html, { printWidth: 100, tabWidth: 2, endOfLine: 'lf', parser: 'html' });
  const holder = new RegExp(`<div id="${R.styled.one.field.field}"[^>]*>([\\s\\S]*?)</div>`).exec(formatted);
  assert.ok(holder, 'the holder is in the formatted html');
  assert.equal(holder[1], R.styled.one.field.value);
});

// ── Row 20: role-beside credits rendered in the artwork's own styling ────────────────────────

/** Taken on main bc9be3b before this row: row 19's role-above builds, byte for byte. */
const ROLE_ABOVE_PINS = { one: '1bb5cc1c10fe5a29', bold: 'f314ebd9aacb462d', grouped: '95b9c8c2de09a5f0', roleGroup: 'a60241dd7963af1c', idGroup: '0860a942e8c3f6ec' };
const BESIDE = ['beside', 'besideEnd', 'hebrewBeside', 'namesLeft', 'pickBesideName'];

test('row 20: role-above styled credits build exactly as row 19 built them', () => {
  for (const k of ROLE_ABOVE) assert.equal(sha({ html: R.styled[k].html, css: R.styled[k].css, js: R.styled[k].js }), ROLE_ABOVE_PINS[k], k);
});

test('row 20: a role-beside binding builds the styled engine, one Credits field holding the drawn list', () => {
  for (const k of BESIDE) {
    const b = R.styled[k];
    assert.equal(b.preview.layout, 'role-beside', k);
    assert.deepEqual(b.errors, [], k);
    assert.equal(b.engine, 'styled', k);
    assert.match(b.js, /var NOACG_CREDITS_STYLE = \{[^\n]*"roleToName":0[^\n]*"nameAlign":"(start|middle|end)"/, `${k}: two edges, a role and its first name on one line`);
    assert.ok(!b.js.includes('function creditsSampleLines(') && !b.js.includes('function creditsArtwork('), `${k}: and neither other engine`);
    assert.deepEqual(b.played.errors, [], `${k}: no page errors`);
    assert.equal(b.played.holder, 'noacg-data-source', k);
  }
  assert.equal(R.styled.beside.field.value, 'Réalisation:\nLéa Orme\nImage:\nNoé Rivage\nÉmilie Lac');
  assert.equal(R.styled.beside.fieldCount, 3, 'the drawn title, the one list, Scroll speed');
  assert.equal(R.styled.besideEnd.fieldCount, 2);
});

test('row 20: the sample rebuilds in its two columns, each on its drawn edge and in its drawn look', () => {
  for (const k of BESIDE) {
    const { rows } = R.styled[k].played.atRest;
    // In reading order, which is the document's only where the drawing reads left to right.
    const sources = [...R.styled[k].played.atRest.sources].sort((a, b) => parseFloat(a.mark) - parseFloat(b.mark));
    assert.equal(rows.length, sources.length, k);
    rows.forEach((row, i) => {
      const src = sources[i];
      assert.equal(row.text, src.text, `${k} ${i}`);
      assert.equal(row.kind, src.mark.split(' ')[1], `${k} ${i}: kind`);
      assert.ok(near(row.start.x, src.start.x) && near(row.start.y, src.start.y), `${k} ${i}: drawn at ${JSON.stringify(src.start)}, row at ${JSON.stringify(row.start)}`);
      assert.deepEqual(row.look, src.look, `${k} ${i}: the look is the drawn layer's`);
      assert.equal(row.id, null, `${k} ${i}: no id is copied`);
    });
  }
});

test('row 20: columns, several names per role and the drawn spacing, on every edge', () => {
  const at = (k) => R.styled[k].played.repeated.map((r) => [r.kind, r.text]);
  const want = [
    ['role', 'Research'], ['name', 'Nia Vale'], ['name', 'Tomas Fen'], ['name', 'Ida Lake'],
    ['role', 'Sound'], ['name', 'Ari Moss'], ['role', 'Music'], ['role', 'Research'], ['name', 'Sol Reed'],
  ];
  for (const k of BESIDE) assert.deepEqual(at(k), want, k);
  // credits-2: names 55 apart, 170 from a group's last line to the next role; a role and its first
  // name share a baseline; a role with no names (Music) and a section break are each a group gap.
  const ys = (k) => R.styled[k].played.repeated.map((r) => r.start.y);
  assert.deepEqual(ys('beside'), [195, 195, 250, 305, 475, 475, 645, 815, 815]);
  // Picked from Émilie Lac, the list starts at its role's line (Image, 365). That block draws
  // one group, so it shows no group gap and the name step stands in for it.
  assert.deepEqual(ys('pickBesideName'), [365, 365, 420, 475, 530, 530, 585, 640, 640]);
  const column = (k, kind, edge) => R.styled[k].played.repeated.filter((r) => r.kind === kind).map((r) => (edge === 'end' ? r.end : r.start.x));
  const on = (list, x, msg) => assert.ok(list.every((v) => near(v, x)), `${msg}: ${JSON.stringify(list)} on ${x}`);
  on(column('beside', 'role', 'start'), 90, 'credits-2 roles start at 90');
  on(column('beside', 'name', 'start'), 440, 'credits-2 names start at 440');
  on(column('besideEnd', 'role', 'end'), 300, 'roles set against their end at 300, whatever their length');
  on(column('besideEnd', 'name', 'start'), 340, 'names from 340');
  // Right to left, the start is the right end: every role reaches 900 and every name 600.
  on(column('hebrewBeside', 'role', 'end'), 900, 'right-to-left roles start at 900');
  on(column('hebrewBeside', 'name', 'end'), 600, 'right-to-left names start at 600');
});

test('row 20: a role or name too wide for its column shrinks to the room, is reported past 55% and stops at 30%', () => {
  // A column's room runs from its drawn edge to where the columns meet, halfway across the gutter
  // between the drawn layers' ink, or to the frame; half the row's type is kept at each side.
  const rooms = {
    beside: { W: 1100, name: { size: 32 }, role: { size: 26 } },
    besideEnd: { W: 1000, name: { size: 40 }, role: { size: 24 } },
    namesLeft: { W: 1000, name: { size: 40 }, role: { size: 24 } },
  };
  const regimes = new Set();
  for (const [k, cfg] of Object.entries(rooms)) {
    const p = R.styled[k].played;
    const sources = p.atRest.sources;
    const ink = (kind) => {
      const s = sources.filter((x) => x.mark.endsWith(kind));
      return [Math.min(...s.map((x) => x.ink[0])), Math.max(...s.map((x) => x.ink[1]))];
    };
    const [r, n] = [ink('role'), ink('name')];
    const roleLeft = r[0] + r[1] <= n[0] + n[1];
    const meet = roleLeft ? (r[1] + n[0]) / 2 : (n[1] + r[0]) / 2;
    const roomOf = (kind, edge, x) => {
      const [lo, hi] = (kind === 'role') === roleLeft ? [0, meet] : [meet, cfg.W];
      const margin = cfg[kind].size / 2;
      return edge === 'start' ? hi - x - margin : x - lo - margin;
    };
    const edgeX = (kind) => (k === 'besideEnd' && kind === 'role' ? 300 : sources.find((x) => x.mark.endsWith(kind)).start.x);
    const nameRoom = roomOf('name', 'start', edgeX('name'));
    const names = p.longFit.filter((f) => f.kind === 'name');
    names.forEach((fit, i) => {
      const want = Math.min(1, Math.max(0.3, nameRoom / p.naturals[i]));
      assert.ok(Math.abs(fit.scale - want) < 0.005, `${k} name ${i}: scale ${fit.scale}, measured ${want} (room ${nameRoom})`);
      assert.equal(fit.reported, want < 0.55, `${k} name ${i}: reported only past 55%`);
      const width = p.longRows[i + 1].width;
      if (want < 1 && want > 0.3) assert.ok(width <= nameRoom + 0.5 && width >= nameRoom - 3, `${k}: shrunk to the room: ${width} of ${nameRoom}`);
      regimes.add(want === 1 ? 'fits' : want >= 0.55 ? 'shrinks' : want > 0.3 ? 'reported' : 'floor');
    });
    const roleRoom = roomOf('role', k === 'besideEnd' ? 'end' : 'start', edgeX('role'));
    const roleWant = Math.min(1, Math.max(0.3, roleRoom / p.roleFit.natural));
    assert.ok(Math.abs(p.roleFit.fit.scale - roleWant) < 0.005, `${k} role: scale ${p.roleFit.fit.scale}, measured ${roleWant} (room ${roleRoom})`);
    assert.equal(p.roleFit.fit.reported, roleWant < 0.55, `${k} role: reported only past 55%`);
    if (roleWant < 1) assert.ok(p.roleFit.width <= roleRoom + 0.5 && p.roleFit.width >= roleRoom - 3, `${k}: the role shrunk to its column: ${p.roleFit.width} of ${roleRoom}`);
    assert.deepEqual(p.roleFit.over, roleWant < 0.55 ? [p.field] : [], `${k}: the report names the one Credits field`);
    assert.deepEqual(p.overShort, [], `${k}: and clears when the list fits`);
  }
  assert.deepEqual([...regimes].sort(), ['fits', 'floor', 'reported', 'shrinks'], 'the names cover every rung');
  assert.ok(R.styled.beside.played.roleFit.fit.reported, 'a role past its column on the dev sample is reported');
});

test('row 20: the one column choice decides which drawn column is the roles, and is what the graphic builds', () => {
  const asRead = R.styled.namesLeftAsRead;
  const chosen = R.styled.namesLeft;
  for (const b of [asRead, chosen]) {
    assert.equal(b.preview.ambiguous, true, 'names drawn left of their roles read either way');
    assert.deepEqual(b.errors, [], 'either answer saves a binding that validates');
    assert.equal(b.engine, 'styled');
  }
  // Read as drawn, the left column (the names) is taken for the roles: the output is wrong.
  assert.equal(asRead.field.value, 'Alex Rivera:\nDirector\nIda Lake:\nAri Moss:\nSound');
  assert.deepEqual(asRead.played.repeated.filter((r) => r.kind === 'role').map((r) => [r.start.x, r.look.fill])[0], [100, 'rgb(255, 255, 255)']);
  // The author's answer, the right column: roles in gold at 600, names in white at 100.
  assert.equal(chosen.field.value, 'Director:\nAlex Rivera\nIda Lake\nSound:\nAri Moss');
  const rows = chosen.played.repeated;
  for (const r of rows) {
    const [x, fill] = r.kind === 'role' ? [600, 'rgb(255, 204, 0)'] : [100, 'rgb(255, 255, 255)'];
    assert.ok(near(r.start.x, x) && r.look.fill === fill, `${r.kind} ${r.text}: ${r.start.x} ${r.look.fill}`);
  }
  assert.deepEqual(chosen.anchors.map((a) => a.kind), ['role', 'name', 'name', 'role', 'name']);
  assert.notDeepEqual(chosen.anchors, asRead.anchors, 'the answer is stored in the anchors');
  // The dev sample reads either way too, so its author gets the same question.
  assert.equal(R.styled.beside.preview.ambiguous, true);
  assert.equal(R.styled.one.preview.ambiguous, false, 'role above never asks');
});

test('row 20: a name picked beside reads from its own role; above, every pick reads from itself as on main', () => {
  // Beside, the column answer settles a name: credits-2's last name (alone on its line) reads
  // from Image, as picking Image does.
  // Above, a name and a later role can be drawn alike, so a pick is read from itself, exactly as
  // row 19 read it; credits-1's first name is listed first, which the preview shows.
  assert.equal(R.styled.pickName.preview.anchors[0].candidateId, R.styled.one.preview.anchors[1].candidateId);
  const beside = R.styled.pickBesideName;
  assert.deepEqual(beside.preview.anchors, R.styled.beside.preview.anchors.slice(2));
  assert.equal(beside.field.value, 'Image:\nNoé Rivage\nÉmilie Lac');
  assert.equal(beside.engine, 'styled');
  assert.deepEqual(beside.errors, []);
});

test('row 20: beside, a marked heading spans both columns and the names after it step down', () => {
  const { rows, fit } = R.styled.beside.played.heading;
  assert.deepEqual(rows.map((r) => [r.kind, r.text]), [['role', 'SPECIAL THANKS TO EVERYONE AT THE STUDIO'], ['name', 'Nia Vale'], ['name', 'Tomas Fen']]);
  assert.equal(fit[0].scale, 1, 'the heading has the whole frame, not the role column');
  assert.deepEqual(rows.map((r) => r.start.y), [195, 250, 305], 'the first name is not set beside the heading');
  assert.ok(near(rows[0].start.x, 90) && near(rows[1].start.x, 440), 'the heading on the role edge, names in their column');
});

test('row 20: role beside keeps the source layers and their original text, and replays the same', () => {
  for (const k of BESIDE) {
    const { take, atRest } = R.styled[k].played;
    assert.equal(take.ok, true, k);
    assert.equal(take.target, 'imported-design-credits-roll', `${k}: the roll moves its own group`);
    assert.equal(take.sourcesKept, true, `${k}: the take leaves every source layer as it was`);
    assert.deepEqual(take.second, take.first, `${k}: a second take measures the same roll`);
    assert.equal(take.stopped, true, `${k}: Out stops the roll`);
    assert.deepEqual(R.styled[k].played.reset.after, R.styled[k].played.reset.before, `${k}: a reset of inline styles leaves the rows as built`);
    for (const src of atRest.sources) assert.equal(src.visibility, 'hidden', `${k}: a source layer is laid out, never painted`);
  }
  assert.equal(R.styled.beside.played.take.first.step, 55, 'the pace rides the drawn name step');
});

test('row 20: a picked layer is a role or a name by the drawing\'s role look, never by where a reading starts', () => {
  // Codex on 91fe641: a later role picked read from the previous group's last name, kinds reversed.
  const sound = R.styled.pickLaterRole;
  assert.equal(sound.field.value, 'Sound:\nAri Moss');
  assert.deepEqual(sound.preview.anchors.map((a) => a.kind), ['role', 'name']);
  // Names left of roles, a name alone on its line picked: the question is asked either way, and
  // the answer reads it as a name under Director.
  assert.equal(R.styled.idaAsRead.preview.ambiguous, true);
  assert.equal(R.styled.idaChosen.preview.ambiguous, true);
  assert.equal(R.styled.idaChosen.field.value, 'Director:\nAlex Rivera\nIda Lake\nSound:\nAri Moss');
  for (const k of ['pickLaterRole', 'idaChosen']) {
    assert.equal(R.styled[k].engine, 'styled', k);
    assert.deepEqual(R.styled[k].errors, [], k);
  }
});

test('row 20: a drawing with a role and a name on one line always gets the column question', () => {
  // Codex on ef23674: the question hung on the default reading working, and a title in the role
  // look above the block hid it.
  const { tailAsRead, tailChosen, titledAsRead, titledChosen } = R.previews;
  // A last name on its own line: read as drawn it is a lone role and falls back; the question is
  // still asked, and the answer reads it as a name under Sound.
  assert.equal(tailAsRead.styled, false);
  assert.equal(tailAsRead.ambiguous, true, 'the question is offered although the drawn reading fails');
  assert.equal(tailChosen.styled, true);
  assert.deepEqual(tailChosen.list.flat().map((e) => [e.role, e.names]), [['Sound', ['Ari Moss', 'Sol Reed']]]);
  // A title in the role look above: the question is offered, and the answer reads Director as a role.
  assert.equal(titledAsRead.ambiguous, true);
  assert.equal(titledChosen.styled, true);
  assert.deepEqual(titledChosen.list.flat().map((e) => [e.role, e.names]), [['Director', ['Alex Rivera', 'Ida Lake']], ['Sound', ['Ari Moss']]]);
  // The answer saved for the last name validates and builds styled.
  assert.deepEqual(R.styled.tailChosen.errors, []);
  assert.equal(R.styled.tailChosen.engine, 'styled');
  assert.equal(R.styled.tailChosen.field.value, 'Sound:\nAri Moss\nSol Reed');
});

test('row 20: a title above the credits, in either look, changes neither the kinds nor the question', () => {
  // /so on ef23674: a title in the names' look flipped role-above credits, and a title hid the
  // column question.
  const groups = (p) => p.list.flat().map((e) => [e.role, e.names]);
  const want = [['Director', ['Alex Rivera', 'Ida Lake']], ['Sound', ['Ari Moss']]];
  const P = R.previews;
  for (const k of ['nameTitleRole', 'roleTitleRole']) {
    assert.equal(P[k].styled, true, k);
    assert.deepEqual(groups(P[k]), k === 'roleTitleRole' ? [['Director', ['Alex Rivera']], ['Sound', ['Ari Moss']]] : want, `${k}: the title stays artwork, roles stay roles`);
  }
  assert.equal(P.namesLeftNameTitle.ambiguous, true, 'a title in the name look does not hide the question');
  assert.deepEqual(groups(P.namesLeftNameTitleChosen), want);
});

test('row 20: a role with no names keeps roles as roles; a right-to-left question keeps its labels', () => {
  // Codex on 7e76517: consecutive role lines were taken for names, and the column labels followed
  // whichever reading worked.
  const groups = (p) => p.list.flat().map((e) => [e.role, e.names]);
  const P = R.previews;
  assert.deepEqual(groups(P.emptyEditor), [['Editor', ['Mia Holt']]]);
  // The first role picked under a title in the names' look reads as row 19 read it.
  assert.deepEqual(groups(P.emptyTitledFirst), [['Director', ['Alex Rivera']], ['Producer', []], ['Editor', ['Mia Holt']]]);
  // Evenly spaced, or tighter between groups than from a role to its name: the first role picked
  // still reads as row 19 read it, since nothing is drawn above it.
  for (const k of ['evenFirst', 'tightFirst', 'evenTitledName', 'tightTitledName', 'evenCentredTitled']) assert.deepEqual(groups(P[k]), [['Director', ['Alex Rivera']], ['Sound', ['Ari Moss']]], k);
  // ...and a later role picked on an evenly spaced page reads from itself, as on main.
  assert.deepEqual(groups(P.evenMiddle), [['Sound', ['Ari Moss']], ['Editor', ['Sol Reed']]]);
  // ...and on pages with tighter groups than the role-to-name step (the reading from the name
  // above would only hold by inventing roles with no names).
  assert.deepEqual(groups(P.tightMiddle), [['Sound', ['Ari Moss', 'Bo Lind']], ['Editor', ['Sol Reed']]]);
  assert.deepEqual(groups(P.tightMiddleCodex), [['Sound', ['Ari Moss']], ['Editor', ['Sol Reed']]]);
  assert.deepEqual(groups(P.tightEmptyEnd), [['Sound', ['Ari Moss']], ['Editor', []]], 'a role with no names at the end changes nothing');
  assert.deepEqual(groups(P.emptyProducer), [['Producer', []], ['Editor', ['Mia Holt']]]);
  // Right to left, the drawn reading takes the right column (the names) for roles and fails on
  // the last name; the answer reads it under צילום. Both carry the drawing's direction.
  assert.equal(P.rtlTailAsRead.styled, false);
  assert.equal(P.rtlTailAsRead.ambiguous, true);
  assert.equal(P.rtlTailAsRead.rtl, true, 'the labels follow the drawing, not the reading that worked');
  assert.equal(P.rtlTailChosen.rtl, true);
  assert.deepEqual(groups(P.rtlTailChosen), [['צילום', ['יוסי כהן', 'רון בר']]]);
});

test('row 20: a two-look title line above role-above credits leaves row 19\'s reading, either answer', () => {
  const groups = (p) => p.list.flat().map((e) => [e.role, e.names]);
  const P = R.previews;
  const first = [['Director', ['Alex Rivera', 'Ida Lake']], ['Sound', ['Ari Moss']]];
  for (const k of ['twoLookFirst', 'twoLookFirstOther']) assert.deepEqual(groups(P[k]), first, k);
  for (const k of ['twoLookLater', 'twoLookLaterOther']) assert.deepEqual(groups(P[k]), [['Sound', ['Ari Moss']]], k);
  // Both answers read the same, so the wizard does not ask (BehaviourSection compares them).
  assert.deepEqual(P.twoLookFirst.anchors, P.twoLookFirstOther.anchors);
});

// ── #1958: credits drawn as separate layers, kept as fixed artwork, scroll as one block ──────

test('#1958: fixed-artwork credits drawn as separate role and name layers scroll as one whole block', () => {
  for (const [k, F] of Object.entries(R.fixedBlocks)) {
    const P = F.played;
    assert.deepEqual(P.errors, [], k);
    assert.equal(F.engine, 'artwork', k);
    assert.equal(F.styled, true, `${k}: the drawing could be styled, so the author chose fixed artwork`);
    // Every role and name layer of the block is the artwork's, never an operator field.
    assert.ok(F.blockFields.length >= 3, k);
    for (const f of F.blockFields) assert.equal(f.ftype, 'hidden', `${k}: ${f.title} offers nothing to type`);
    const block = P.rest.block.flatMap((b, i) => (b ? [i] : []));
    assert.equal(block.length, F.words.length, `${k}: every layer of the block scrolls (${F.words.join(', ')})`);
    assert.equal(P.mid.last.layers, block.length, k);
    for (const i of block) assert.doesNotMatch(P.rest.ids[i] ?? '', /^f\d+$/, `${k}: ${P.rest.words[i]} carries no field id, so no write or fit reaches it`);
    assert.deepEqual(block.map((i) => P.rest.afterWrite[i]), block.map((i) => P.rest.words[i]), `${k}: writing every field leaves the block's words as drawn`);
    // Halfway through the roll every layer of the block has moved by the same distance.
    const moved = block.map((i) => P.mid.top[i] - P.rest.top[i]);
    assert.ok(Math.abs(moved[0]) > 50, `${k}: the block moved (${moved[0]})`);
    for (const m of moved) assert.ok(Math.abs(m - moved[0]) < 0.5, `${k}: one block, ${moved.join(', ')}`);
    // A layer outside the block (a title drawn above, as the styled reading leaves it) stays put.
    P.rest.block.forEach((b, i) => { if (!b) assert.ok(Math.abs(P.mid.top[i] - P.rest.top[i]) < 0.5, `${k}: ${P.rest.words[i]} stays where it was drawn`); });
    // And the whole block was measured: it starts below the frame and ends above it.
    assert.ok(P.mid.last.distance > P.mid.last.startY, k);
  }
});
