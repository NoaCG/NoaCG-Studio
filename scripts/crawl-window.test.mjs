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
//     its line by sin 3 degrees of the run's length, 52 units for a 1000-unit run);
//   * a text anchored at its end by a style (Inkscape writes it inline; the import moves it into
//     a class, which outranks the attribute) is laid as one anchored at its start would be;
//   * a window and a text turned 30 degrees together are covered along the line, not across the
//     frame, where the box is narrower than along it;
//   * a short run drawn far inside its window is laid back to the window's leading edge, so no
//     part of the window is ever left empty (one copy before the start left 900 units blank);
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
const END_ANCHORED = PLAIN.replace(/<text id="Crawl" x="284" y="1007" text-anchor="start"/, '<text id="Crawl" x="1840" y="1007" style="text-anchor:end"');
const INSET = PLAIN.replace(/<text id="Crawl" x="284"/, '<text id="Crawl" x="1200"');
/** The Crawl box and the text each turned 30 degrees about the text's start, a short run: across
 *  the frame the box is only 1428 units wide, along its line 1608. */
const BOTH_TURNED = PLAIN.replace('<rect id="Crawl_box"', '<rect id="Crawl_box" transform="rotate(30 284 1007)"').replace('<text id="Crawl"', '<text id="Crawl" transform="rotate(30 284 1007)"');
const TURNED = PLAIN.replace(/(<g id="Board")/, '<g id="Turn" transform="rotate(3 960 540)">\n$1').replace(/<\/svg>\s*$/, '</g>\n</svg>');
/** The drawn Crawl box, in the frame of the layer the run moves in. */
const BOX = [[252, 960], [1860, 960], [1860, 1032], [252, 1032]];
/** The box as each case draws it in that frame. */
const turn = (deg, [cx, cy]) => ([x, y]) => {
  const t = (deg * Math.PI) / 180;
  return [cx + (x - cx) * Math.cos(t) - (y - cy) * Math.sin(t), cy + (x - cx) * Math.sin(t) + (y - cy) * Math.cos(t)];
};
const BOX_OF = { bothTurned: BOX.map(turn(30, [284, 1007])) };
const SLOPE_OF = { textTurned: Math.tan((3 * Math.PI) / 180), bothTurned: Math.tan((30 * Math.PI) / 180) };

const RUN = async (files) => {
  const out = {};
  for (const [name, { markup, items: list, relist }] of Object.entries(files)) {
    const t = window.NOACG_IMPORTED.IMPORTED_SVG.create({ designSvg: window.NOACG_DRAFT.svgDesignOptions(window.__importDraft(window.NOACG_SVG.importSvgMarkup(markup))) });
    const items = t.fields.find((f) => f.title === 'Items').field;
    const w = await window.__mountDesign(t);
    w.update(JSON.stringify({ [items]: list }));
    w.play();
    w.__advance(3000);
    const doc = w.document;
    const clip = doc.querySelector('clipPath[id^="noacg-crawl-"] polygon');
    const offset = () => doc.querySelector('[data-noacg-role~="crawl"]').parentNode.transform.baseVal.consolidate()?.matrix ?? { e: 0, f: 0 };
    const x = () => offset().e;
    // A tenth of a second: shorter than any run here takes, so no wrap falls inside it.
    const a = x();
    w.__advance(100);
    const b = x();
    const travel = offset();
    // The run's left edge in the window's frame, at tenth-second steps: never inside the box.
    const runEl = doc.querySelector('[data-noacg-role~="crawl"]');
    // Where the run stands against the window, in the text's own frame (so along its baseline):
    // its left edge less the window's leading one, and its right edge less the window's far one.
    const outerEl = runEl.parentNode.parentNode;
    const corners = Array.from(clip ? clip.points : [], (pt) => [pt.x, pt.y]);
    const cover = () => {
      const m = runEl.getScreenCTM().inverse().multiply(outerEl.getScreenCTM());
      const xs = corners.map(([px, py]) => m.a * px + m.c * py + m.e);
      const bb = runEl.getBBox();
      return [bb.x - Math.min(...xs), bb.x + bb.width - Math.max(...xs)];
    };
    let lead = -Infinity, trail = Infinity;
    for (let i = 0; i < 12; i++) { { const [l, r] = cover(); lead = Math.max(lead, l); trail = Math.min(trail, r); } w.__advance(100); }
    w.stop();
    w.__advance(10);
    const c = x();
    w.__advance(100);
    const d = x();
    // K3: a new list of the same length keeps the run where it is, mid-run, and the copies before
    // the start are counted as from the run's zero offset, so the window stays filled loop after loop.
    // It runs under the exit, where the run keeps moving (K6), as it would on air.
    let relistAt = null;
    if (relist) {
      // Late in a run: three quarters of a copy past the start, past the slack one copy leaves.
      const run = runEl.getStartPositionOfChar(runEl.textContent.indexOf('Hi', 1)).x - runEl.getStartPositionOfChar(0).x;
      for (let i = 0; i < 200 && offset().e > -0.75 * run; i++) w.__advance(10);
      relistAt = offset().e / run;
      w.update(JSON.stringify({ [items]: relist }));
      for (let i = 0; i < 30; i++) { { const [l, r] = cover(); lead = Math.max(lead, l); trail = Math.min(trail, r); } w.__advance(100); }
    }
    // An empty list puts the text back where it was drawn, on both axes (K5).
    w.update(JSON.stringify({ [items]: '' }));
    w.__advance(100);
    const rest = offset();
    out[name] = { relistAt, rest: [rest.e, rest.f], lead, trail, slope: travel.e ? travel.f / travel.e : null, points: clip ? clip.getAttribute('points').split(' ').map((p) => p.split(',').map(Number)) : null, moving: b - a, underExit: d - c };
    document.getElementById('fx')?.remove();
  }
  return out;
};

const out = await withBundledPage(SPECS, async (page) => {
  await installDrivenPage(page);
  const two = 'Gates open at noon\nLast train 23:40';
  return page.evaluate(RUN, {
    plain: { markup: PLAIN, items: two },
    turned: { markup: TURNED, items: two },
    textTurned: { markup: TEXT_TURNED, items: two },
    bothTurned: { markup: BOTH_TURNED, items: 'Hi' },
    endAnchored: { markup: END_ANCHORED, items: two },
    inset: { markup: INSET, items: 'Hi', relist: 'iH' },
  });
});

measured(Object.keys(out).length, 'crawl builds');

for (const name of ['plain', 'turned', 'textTurned', 'bothTurned', 'endAnchored', 'inset']) {
  test(`${name}: the clip is the drawn Crawl box; the run fills it, keeps moving under the exit along its baseline, and rests where drawn`, () => {
    const r = out[name];
    assert.ok(r.points, 'a clip');
    assert.equal(r.points.length, 4);
    r.points.forEach(([px, py], i) => {
      const box = BOX_OF[name] ?? BOX;
      assert.ok(Math.abs(px - box[i][0]) < 0.5 && Math.abs(py - box[i][1]) < 0.5, `corner ${i}: ${px},${py}`);
    });
    assert.ok(r.moving < -5, `it travels left: ${r.moving}`);
    assert.ok(Math.abs(r.underExit - r.moving) < 1, `the same pace after the stop: ${r.underExit} against ${r.moving}`);
    // Along the text's own baseline: level for a level text, at its turn for a turned one.
    const slope = SLOPE_OF[name] ?? 0;
    assert.ok(Math.abs(r.slope - slope) < 0.002, `it travels along its baseline: slope ${r.slope}, drawn ${slope}`);
    assert.deepEqual(r.rest, [0, 0], 'an empty list puts it back where it was drawn');
    if (r.relistAt !== null) assert.ok(r.relistAt <= -0.75, `the list changed late in a run: ${r.relistAt} of a copy`);
    // Along its baseline the run always spans the window, from its leading edge to its far one.
    assert.ok(r.lead <= 0.5, `the run reaches the window's leading edge: ${r.lead} short`);
    assert.ok(r.trail >= -0.5, `the run reaches the window's far edge: ${-r.trail} short`);
  });
}
