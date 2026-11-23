// gate: factory
// needs: browser
// guards: src/templates/importedDesign/behaviourRuntime.ts, src/templates/behaviours/crawl.ts, docs/tutorials/template-library/SVG/ticker-crawl.svg
//
// THE CRAWL'S WINDOW AND ITS EXIT (svg-template-library TL6, Rules K4 and K6), on the Ticker crawl
// library template built as the wizard builds it:
//   * the clip is the window's own corners in the frame the run moves in, also when the strip is
//     drawn turned three degrees (a box taken in the artwork's units first grew it to 240 units tall);
//   * a text drawn turned itself (Illustrator writes the turn on the text) travels along its own
//     baseline, so each copy lands where the last one was (moved along x alone, it drifted off
//     its line by 52 units a run);
//   * the stop that every exit runs (it kills every tween of the page's elements) leaves the run
//     moving, so the text keeps travelling under the exit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { withBundledPage } from './catalog-emit.mjs';
import { installDrivenPage } from './driven-clock.mjs';
import { measured } from './measured.mjs';

const at = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const SPECS = [
  { entry: at('src/assets/svgImport.ts'), globalName: 'NOACG_SVG' },
  { entry: at('src/components/wizard/import/draft.ts'), globalName: 'NOACG_DRAFT' },
  { entry: at('src/templates/importedDesign/svg.ts'), globalName: 'NOACG_IMPORTED' },
  { entry: at('src/preview/composeDocument.ts'), globalName: 'NOACG_COMPOSE' },
];
const PLAIN = readFileSync(at('docs/tutorials/template-library/SVG/ticker-crawl.svg'), 'utf8');
const TEXT_TURNED = PLAIN.replace('<text id="Crawl"', '<text id="Crawl" transform="rotate(3 284 1007)"');
const TURNED = PLAIN.replace(/(<g id="Board")/, '<g id="Turn" transform="rotate(3 960 540)">\n$1').replace(/<\/svg>\s*$/, '</g>\n</svg>');
/** The drawn Crawl box, in the frame of the layer the run moves in. */
const BOX = [[252, 960], [1860, 960], [1860, 1032], [252, 1032]];

const RUN = async (files) => {
  const out = {};
  for (const [name, markup] of Object.entries(files)) {
    const t = window.NOACG_IMPORTED.IMPORTED_SVG.create({ designSvg: window.NOACG_DRAFT.svgDesignOptions(window.__importDraft(window.NOACG_SVG.importSvgMarkup(markup))) });
    const items = t.fields.find((f) => f.title === 'Items').field;
    const w = await window.__mountDesign(t);
    w.update(JSON.stringify({ [items]: 'Gates open at noon\nLast train 23:40' }));
    w.play();
    w.__advance(3000);
    const doc = w.document;
    const clip = doc.querySelector('clipPath[id^="noacg-crawl-"] polygon');
    const offset = () => doc.querySelector('[data-noacg-role~="crawl"]').parentNode.transform.baseVal.consolidate()?.matrix ?? { e: 0, f: 0 };
    const x = () => offset().e;
    const a = x();
    w.__advance(500);
    const b = x();
    const travel = offset();
    w.stop();
    w.__advance(50);
    const c = x();
    w.__advance(500);
    const d = x();
    out[name] = { slope: travel.e ? travel.f / travel.e : null, points: clip ? clip.getAttribute('points').split(' ').map((p) => p.split(',').map(Number)) : null, moving: b - a, underExit: d - c };
    document.getElementById('fx')?.remove();
  }
  return out;
};

const out = await withBundledPage(SPECS, async (page) => {
  await installDrivenPage(page);
  return page.evaluate(RUN, { plain: PLAIN, turned: TURNED, textTurned: TEXT_TURNED });
});

measured(Object.keys(out).length, 'crawl builds');

for (const name of ['plain', 'turned', 'textTurned']) {
  test(`${name}: the clip is the drawn Crawl box, and the run keeps moving under the exit, along its baseline`, () => {
    const r = out[name];
    assert.ok(r.points, 'a clip');
    assert.equal(r.points.length, 4);
    r.points.forEach(([px, py], i) => {
      assert.ok(Math.abs(px - BOX[i][0]) < 0.5 && Math.abs(py - BOX[i][1]) < 0.5, `corner ${i}: ${px},${py}`);
    });
    assert.ok(r.moving < -10, `it travels left: ${r.moving}`);
    assert.ok(Math.abs(r.underExit - r.moving) < 1, `the same pace after the stop: ${r.underExit} against ${r.moving}`);
    // Along the text's own baseline: level for a level text, three degrees for a turned one.
    const slope = name === 'textTurned' ? Math.tan((3 * Math.PI) / 180) : 0;
    assert.ok(Math.abs(r.slope - slope) < 0.002, `it travels along its baseline: slope ${r.slope}, drawn ${slope}`);
  });
}
