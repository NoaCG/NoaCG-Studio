// gate: factory
// needs: browser
// guards: src/assets/svgImport.ts, src/templates/importedDesign/artworkFields.ts, src/templates/importedDesign/runtime/svgFit.js
//
// A TEXT BLOCK DRAWN AS STACKED LINES IS ONE MULTI-LINE FIELD, MEASURED IN ITS PLATE (#2078, #2079).
//
// The qualification fixture `multiline.svg` stacks its body's three lines with `dy` steps, the way
// a hand-written or Inkscape file does, rather than with a `y` per line. Built the way the product
// builds it (the real reader, the wizard's draft, the real assembler, the composed document in a
// 1920x1080 frame), this pins:
//
//   stamp   the import reads the three lines as one wrapping block and stamps each drawn line
//   room    the runtime measures the body's room inside its plate (<rect x="45" width="1010">),
//           with a real height to wrap into, rather than one 1196-unit line no plate contains
//   field   the body's operator field is a multi-line box (SPX textarea, control kind `lines`),
//           and the one-line title stays a one-line field
//   breaks  a value typed with line breaks reaches the graphic as those lines
//
//   node --test scripts/imported-multiline-block.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { withBundledPage } from './catalog-emit.mjs';
import './lib/tsResolve.mjs';

const root = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const { fieldDescriptors } = await import('../src/control/controlModel.ts');

const NOTICE = readFileSync(root('e2e/fixtures/jev-svg/qualification/multiline.svg'), 'utf8');
/** The plate the body is drawn on, in the artwork's own units. */
const PLATE = { left: 45, right: 1055, top: 45, bottom: 455 };
/** Where the body is drawn: its x, and so the left of its room. */
const BODY_X = 85;

const SPECS = [
  ['assets/svgImport.ts', 'NOACG_SVG'],
  ['components/wizard/import/draft.ts', 'NOACG_DRAFT'],
  ['templates/importedDesign/svg.ts', 'NOACG_IMPORTED'],
  ['preview/composeDocument.ts', 'NOACG_COMPOSE'],
].map(([rel, globalName]) => ({ entry: root(`src/${rel}`), globalName }));

const RESULT = await withBundledPage(SPECS, async (page) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  return page.evaluate(async (markup) => {
    const { NOACG_SVG: R, NOACG_DRAFT: D, NOACG_IMPORTED: I, NOACG_COMPOSE: C } = window;
    const imported = R.importSvgMarkup(markup);
    const draft = D.svgDraftFromImport(imported, { resolution: { width: 1920, height: 1080 }, previous: { name: '', designSvg: null } });
    const template = I.IMPORTED_SVG.create({ designSvg: D.svgDesignOptions(draft) });
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;';
    await new Promise((resolve) => { frame.onload = resolve; frame.srcdoc = C.composeDocument(template); document.body.appendChild(frame); });
    const w = frame.contentWindow;
    await w.document.fonts.ready;
    await new Promise((resolve) => w.requestAnimationFrame(() => w.requestAnimationFrame(resolve)));
    const body = w.document.getElementById('f1');
    const art = new DOMParser().parseFromString(imported.markup, 'image/svg+xml');
    const stamped = art.querySelectorAll('text > tspan[data-noacg-line]').length;
    w.update(JSON.stringify({ f1: 'Doors open at 19:00\nEntry from the main gate\nTickets at the door' }));
    const lines = [...body.querySelectorAll(':scope > tspan')].map((t) => t.textContent.trim());
    // The same block with its steps written in ems, the usual hand-written and D3 form.
    const inEms = R.importSvgMarkup(markup.replace(/dy="70"/g, 'dy="2.06em"'));
    const emArt = new DOMParser().parseFromString(inEms.markup, 'image/svg+xml');
    const stampedInEms = emArt.querySelectorAll('text > tspan[data-noacg-line]').length;
    return { stamped, stampedInEms, room: w.svgFitRoom.f1, lines, fields: template.fields };
  }, NOTICE);
});

test('stamp: the body drawn as three dy-stacked lines is one wrapping block of three stamped lines', () => {
  assert.equal(RESULT.stamped, 3);
  assert.equal(RESULT.stampedInEms, 3, 'the same steps written in ems');
});

test('room: the body measures a room inside its plate, with height to wrap into', () => {
  const { room } = RESULT;
  assert.ok(room, 'the body has a room');
  assert.ok(room.width > 0 && BODY_X + room.width <= PLATE.right, `room ${room.width} wide from x ${BODY_X} stays inside the plate's right edge ${PLATE.right}`);
  assert.ok(room.height > 0, `room height ${room.height} is above 0`);
  assert.ok(room.height <= PLATE.bottom - PLATE.top, `room height ${room.height} fits the plate's ${PLATE.bottom - PLATE.top}`);
});

test('field: the body is a multi-line box and the title stays one line', () => {
  const byField = Object.fromEntries(RESULT.fields.map((f) => [f.field, f]));
  assert.equal(byField.f0.ftype, 'textfield', 'the one-line title');
  assert.equal(byField.f1.ftype, 'textarea', 'the stacked body');
  const kinds = Object.fromEntries(fieldDescriptors(RESULT.fields).map((d) => [d.key, d.kind]));
  assert.deepEqual(kinds, { f0: 'text', f1: 'lines' });
});

test('breaks: a value typed with line breaks paints as those lines', () => {
  assert.deepEqual(RESULT.lines, ['Doors open at 19:00', 'Entry from the main gate', 'Tickets at the door']);
});
