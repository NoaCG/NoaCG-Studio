// gate: factory
// needs: browser
// guards: src/templates/importedDesign/behaviourRuntime.ts, src/templates/importedDesign/runtime/svgFit.js, src/templates/behaviours/vote.ts, e2e/fixtures/illustrator-exports/live-vote.svg
//
// A READOUT KEEPS THE ALIGNMENT IT WAS DRAWN WITH (issue #2691).
//
// Illustrator writes no text-anchor. The vote board's Percent figures are set against the right
// end of their tracks, and Illustrator saves each as point text at its measured left edge. The
// figures are readouts the behaviour runtime writes, not fitted fields, so the alignment the fit
// reads off the drawing (svgAlignOf) never reached them: "66.7%" started where "0%" started and
// grew past the track, into the winner outline.
//
// The real Illustrator 30 export of the live vote runs through the real import, proposal and
// composer in Chromium. With the figures showing live, a long and a short value are written, and
// each figure's right edge must stay where the designer drew the "0%" sample's right edge, while
// the option labels drawn against the left keep their drawn left edge.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { withBundledPage } from './catalog-emit.mjs';
import { installDrivenPage } from './driven-clock.mjs';
import { measured } from './measured.mjs';
import { POLL_LIVE_ON } from '../src/model/voteFields.ts';

const entry = (rel) => fileURLToPath(new URL(`../src/${rel}`, import.meta.url));
const SPECS = [
  { entry: entry('assets/svgImport.ts'), globalName: 'NOACG_SVG' },
  { entry: entry('components/wizard/import/draft.ts'), globalName: 'NOACG_DRAFT' },
  { entry: entry('templates/importedDesign/svg.ts'), globalName: 'NOACG_IMPORTED' },
  { entry: entry('preview/composeDocument.ts'), globalName: 'NOACG_COMPOSE' },
];
const BOARD = readFileSync(new URL('../e2e/fixtures/illustrator-exports/live-vote.svg', import.meta.url), 'utf8');

/** Runs in the browser: build the board as the wizard would, write two tallies, read the edges. */
const ROUND = async ({ markup, live, tallies }) => {
  const svg = window.NOACG_SVG.importSvgMarkup(markup);
  const draft = window.__importDraft(svg);
  const template = window.NOACG_IMPORTED.IMPORTED_SVG.create({ designSvg: window.NOACG_DRAFT.svgDesignOptions(draft) });
  const field = (title) => template.fields.find((f) => f.title === title)?.field;
  if (!field('Options') || !field('Live figures')) return { error: `no vote fields (${template.fields.map((f) => f.title)})` };

  const w = await window.__mountDesign(template);
  const art = w.document.querySelector('.imported-design-art');
  const layer = (name) => w.document.querySelector(`[data-name="${name}"], #${name}`);
  // Edges in the ARTWORK's own units: Illustrator places each text by a transform.
  const edges = (el) => {
    const b = el.getBBox();
    const m = art.getScreenCTM().inverse().multiply(el.getScreenCTM());
    return { left: m.a * b.x + m.e, right: m.a * (b.x + b.width) + m.e, text: el.textContent };
  };
  const read = () => [1, 2, 3].map((n) => ({ n, option: edges(layer(`Option_${n}`)), percent: edges(layer(`Percent_${n}`)) }));
  // The figures are a look as well as a readout, hidden until they show: shown for the reading.
  const shown = [1, 2, 3].map((n) => layer(`Percent_${n}`));
  for (const el of shown) el.classList.add('imported-design-on');
  const drawn = read();
  for (const el of shown) el.classList.remove('imported-design-on');
  w.update(JSON.stringify({ [field('Live figures')]: live }));
  w.play();
  w.__advance(3000);
  const rounds = [];
  for (const t of tallies) {
    w.update(JSON.stringify({ [field('Live figures')]: live, [field('Options')]: t }));
    w.__advance(2000);
    rounds.push(read());
  }
  document.getElementById('fx')?.remove();
  return { drawn, rounds };
};

const run = await withBundledPage(SPECS, async (page) => {
  await installDrivenPage(page);
  return page.evaluate(ROUND, {
    markup: BOARD,
    live: POLL_LIVE_ON,
    tallies: ['Coast | 2\nForest | 1\nCity | 1', 'Coast | 7\nForest | 2\nCity | 1'],
  });
});

measured(run.rounds?.length ?? 0, 'vote tallies written');

test('the Illustrator live vote builds as a vote board', () => {
  assert.equal(run.error, undefined);
});

test('a right-aligned figure keeps its drawn right edge whatever it says', () => {
  const bad = [];
  for (const round of run.rounds) {
    for (const row of round) {
      const was = run.drawn[row.n - 1].percent;
      if (row.percent.text === was.text) bad.push(`Percent ${row.n} was never written (still "${was.text}")`);
      else if (Math.abs(row.percent.right - was.right) > 0.5) {
        bad.push(`Percent ${row.n} "${row.percent.text}" ends at ${row.percent.right.toFixed(1)}, drawn "${was.text}" ended at ${was.right.toFixed(1)}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('a label drawn against the left keeps its drawn left edge', () => {
  const bad = [];
  for (const round of run.rounds) {
    for (const row of round) {
      const was = run.drawn[row.n - 1].option;
      if (Math.abs(row.option.left - was.left) > 0.5) bad.push(`Option ${row.n} starts at ${row.option.left.toFixed(1)}, drawn at ${was.left.toFixed(1)}`);
    }
  }
  assert.deepEqual(bad, []);
});
