// gate: factory
// needs: browser
// guards: src/templates/importedDesign/behaviourRuntime.ts, src/templates/behaviours/bingo.ts, e2e/fixtures/svg-shows/bingo-board.svg
//
// A CALLED BINGO NUMBER IS READABLE ON ITS AMBER PLATE (issue #784).
//
// The sample bingo board draws its numerals white for the dark board and lights an amber plate
// under a number when it is called. White on amber is the one pairing on that board below 3:1,
// on exactly the tile a player in the room is looking for. The behaviour runtime now gives a
// readout a dark or a light ink while a lit look of its own row sits under it and its drawn ink
// is unreadable there, and gives the drawn ink back when the look goes.
//
// The board runs through the real import, the real proposal and the real composer, in Chromium,
// on a clock this file drives: call 7, call 12, take 12 back, then a new game.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { withBundledPage } from './catalog-emit.mjs';
import { installDrivenPage } from './driven-clock.mjs';
import { measured } from './measured.mjs';
import { contrastRatio, parseCssColor } from '../src/model/cssVars.ts';

const entry = (rel) => fileURLToPath(new URL(`../src/${rel}`, import.meta.url));
const SPECS = [
  { entry: entry('assets/svgImport.ts'), globalName: 'NOACG_SVG' },
  { entry: entry('components/wizard/import/draft.ts'), globalName: 'NOACG_DRAFT' },
  { entry: entry('templates/importedDesign/svg.ts'), globalName: 'NOACG_IMPORTED' },
  { entry: entry('preview/composeDocument.ts'), globalName: 'NOACG_COMPOSE' },
];
const BOARD = readFileSync(new URL('../e2e/fixtures/svg-shows/bingo-board.svg', import.meta.url), 'utf8');

/** Runs in the browser: build the board as the wizard would, then call numbers and read inks. */
const CALLS = async ({ markup, calls }) => {
  const svg = window.NOACG_SVG.importSvgMarkup(markup);
  const draft = window.__importDraft(svg);
  const behaviour = draft.svgBehaviour;
  const template = window.NOACG_IMPORTED.IMPORTED_SVG.create({ designSvg: window.NOACG_DRAFT.svgDesignOptions(draft) });
  const called = template.fields.find((f) => f.title === 'Called numbers');
  if (!called) return { error: `no Called numbers field (behaviour ${JSON.stringify(behaviour?.recipe ?? behaviour?.kind)})` };

  const w = await window.__mountDesign(template);
  const numeral = (n) => w.document.querySelector(`[data-name="Number ${n}"], #Number_x20_${n}`);
  const plate = (n) => w.document.querySelector(`[data-name="Called ${n}"] rect, #Called_x20_${n} rect`);
  // The numeral's ink and the fill under it: the plate when it is lit, else the board's tile.
  const read = (n) => {
    const p = plate(n);
    const lit = p && w.getComputedStyle(p).display !== 'none' && w.getComputedStyle(p.parentElement).display !== 'none';
    const under = lit ? p : w.document.querySelector('#Board rect, [data-name="Board"] rect');
    return { n, lit: !!lit, ink: w.getComputedStyle(numeral(n)).fill, under: w.getComputedStyle(under).fill };
  };
  w.update(JSON.stringify({}));
  w.play();
  w.__advance(3000);
  const drawn = read(7);
  const steps = [];
  for (const list of calls) {
    w.update(JSON.stringify({ [called.field]: list.join('\n') }));
    w.__advance(1000);
    steps.push({ list, tiles: [7, 12, 13].map(read) });
  }
  document.getElementById('fx')?.remove();
  return { drawn, steps };
};

const run = await withBundledPage(SPECS, async (page) => {
  await installDrivenPage(page);
  return page.evaluate(CALLS, { markup: BOARD, calls: [['7'], ['7', '12'], ['7'], []] });
});
for (const step of run.steps ?? []) {
  for (const t of step.tiles) t.contrast = Math.round(contrastRatio(parseCssColor(t.ink), parseCssColor(t.under)) * 10) / 10;
}

measured(run.steps?.length ?? 0, 'bingo calls read');

test('the board builds as a bingo caller', () => {
  assert.equal(run.error, undefined);
});

test('every called tile is lit and its numeral reads at 3:1 or better on the plate', () => {
  const bad = [];
  for (const step of run.steps) {
    for (const t of step.tiles) {
      const called = step.list.includes(String(t.n));
      if (called !== t.lit) bad.push(`after [${step.list}] tile ${t.n} is ${t.lit ? 'lit' : 'dark'}`);
      else if (t.contrast < 3) bad.push(`after [${step.list}] tile ${t.n}: ${t.ink} on ${t.under} is ${t.contrast}:1`);
    }
  }
  assert.deepEqual(bad, []);
});

test('a tile that is not called, or is taken back, keeps the ink it was drawn in', () => {
  const changed = [];
  for (const step of run.steps) {
    for (const t of step.tiles) if (!t.lit && t.ink !== run.drawn.ink) changed.push(`after [${step.list}] tile ${t.n}: ${t.ink}, drawn ${run.drawn.ink}`);
  }
  assert.deepEqual(changed, []);
});
