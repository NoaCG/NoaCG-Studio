// gate: factory
// needs: browser
// guards: src/components/wizard/import/stageMeasure.ts, src/assets/svgImport.ts, src/components/wizard/import/draft.ts
//
// WHAT THE MAPPING STEP PROPOSES FOR A HAND-MADE LOWER THIRD, AND WHICH BOX IT NAMES.
//
// The growth default is measured on the step's own render (`proposeBannerGrowth`), and so is the
// box each line is grouped under (`panelOfEachLine`). Both run here on artwork drawn the way a
// student draws it, through the real importer and the real step code, on a blank page:
//
//   strap     a start-anchored name with a date and a time beside it still grows its bar: two
//             figures on a graphic do not make it a scoreboard
//   player    a player strap with a shirt number and an age grows too
//   centred   a centred name on its bar grows, and the answer does not flip on a pixel of the
//             bar's width
//   board     a scoreboard's period strip, centred under a score row, does not grow
//   artboard  an unfilled frame-sized rectangle never beats the bar a tall name sits on
//   wrap      the per-field wrap choice is offered only where wrapping can change the picture: a
//             name with its title drawn right under it, a lone caption and curved text cannot
//
//   node --test scripts/svg-step-proposal.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { withBundledPage } from './catalog-emit.mjs';

const root = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const SPECS = [
  ['assets/svgImport.ts', 'NOACG_SVG'],
  ['components/wizard/import/draft.ts', 'NOACG_DRAFT'],
  ['components/wizard/import/stageMeasure.ts', 'NOACG_STAGE'],
].map(([rel, globalName]) => ({ entry: root(`src/${rel}`), globalName }));

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" font-family="sans-serif" fill="#fff">${body}</svg>`;

const CASES = {
  strap: svg(`<rect id="Bar" x="100" y="840" width="900" height="130" fill="#123"/>
    <text id="Name" x="130" y="900" font-size="48">Anna Virtanen</text>
    <text id="Title" x="130" y="950" font-size="30">Reporter</text>
    <rect id="Tab" x="1000" y="840" width="260" height="60" fill="#f60"/>
    <text id="Date" x="1020" y="880" font-size="28">20.11.</text>
    <text id="Time" x="1240" y="880" font-size="28" text-anchor="end">19:30</text>`),
  player: svg(`<rect id="Number plate" x="100" y="840" width="130" height="130" fill="#f60"/>
    <text id="Number" x="165" y="925" font-size="64" text-anchor="middle">17</text>
    <rect id="Bar" x="230" y="840" width="800" height="130" fill="#123"/>
    <text id="Name" x="260" y="900" font-size="48">Anna Virtanen</text>
    <text id="Age" x="260" y="950" font-size="30">24</text>`),
  centred500: svg(`<rect id="Bar" x="100" y="840" width="500" height="100" fill="#123"/>
    <text id="Name" x="350" y="885" font-size="36" text-anchor="middle">Anna Virtanen</text>
    <text id="Title" x="350" y="925" font-size="24" text-anchor="middle">Reporter</text>`),
  centred499: svg(`<rect id="Bar" x="100" y="840" width="499" height="100" fill="#123"/>
    <text id="Name" x="349.5" y="885" font-size="36" text-anchor="middle">Anna Virtanen</text>
    <text id="Title" x="349.5" y="925" font-size="24" text-anchor="middle">Reporter</text>`),
  centredWide: svg(`<rect id="Bar" x="100" y="840" width="1000" height="130" fill="#123"/>
    <text id="Name" x="600" y="900" font-size="48" text-anchor="middle">Anna Virtanen</text>
    <text id="Title" x="600" y="950" font-size="30" text-anchor="middle">Reporter</text>`),
  board: readFileSync(root('e2e/fixtures/svg-corpus/student-illustrator-scoreboard.svg'), 'utf8'),
  nameOverTitle: svg(`<rect id="Bar" x="100" y="840" width="1000" height="130" fill="#123"/>
    <text id="Name" x="130" y="900" font-size="48">Anna Virtanen</text>
    <text id="Title" x="130" y="950" font-size="30">Reporter</text>`),
  nameOverTitleSerif: svg(`<rect id="Bar" x="100" y="840" width="1000" height="130" fill="#123"/>
    <text id="Name" x="130" y="900" font-size="48" font-family="serif">Anna Virtanen</text>
    <text id="Title" x="130" y="950" font-size="30" font-family="serif">Reporter</text>`),
  tallBox: svg(`<rect id="Board" x="100" y="700" width="1000" height="300" fill="#123"/>
    <text id="Question" x="130" y="760" font-size="40">Who won?</text>`),
  curved: svg(`<defs><path id="arc" d="M200,600 Q960,300 1720,600"/></defs>
    <rect id="Board" x="100" y="300" width="1720" height="500" fill="#123"/>
    <text id="Headline" font-size="80"><textPath href="#arc">CHAMPIONS</textPath></text>`),
  artboard: svg(`<rect fill="none" width="1920" height="1080"/>
    <rect id="Bar" x="100" y="860" width="1000" height="56" fill="#123"/>
    <text id="Name" x="130" y="905" font-size="56">Anna Virtanen</text>`),
};

/** Runs in the page: import, render the step's stage, ask the two questions. */
const ASK = async (markup) => {
  const { NOACG_SVG: R, NOACG_DRAFT: D, NOACG_STAGE: S } = window;
  const imported = R.importSvgMarkup(markup);
  const draft = D.svgDraftFromImport(imported, { resolution: { width: 1920, height: 1080 }, previous: { name: '', designSvg: null } });
  const dsvg = draft.designSvg;
  const style = document.createElement('style');
  style.textContent = '.map-svg-stage svg{display:block;width:100%;height:auto;}';
  document.head.appendChild(style);
  const stage = document.createElement('div');
  stage.className = 'map-svg-stage';
  stage.style.cssText = `position:absolute;left:-20000px;top:0;width:${dsvg.width}px;`;
  stage.innerHTML = dsvg.markup;
  document.body.appendChild(stage);
  stage.getBoundingClientRect();
  await document.fonts.ready;
  const on = draft.svgFields.filter((f) => f.on).map((f) => f.candidateId);
  const label = (id) => (id ? dsvg.shapes.find((s) => s.id === id)?.label ?? id : null);
  const banner = S.proposeBannerGrowth(stage, dsvg, on);
  const boxes = S.withoutBackplates(stage, S.panelOfEachLine(stage, dsvg, on));
  const byTitle = Object.fromEntries(draft.svgFields.map((f) => [f.title, label(boxes[f.candidateId] ?? null)]));
  const wraps = Object.fromEntries(draft.svgFields.map((f) => [f.title, S.lineCanWrap(stage, f.candidateId, boxes[f.candidateId] ?? null, on)]));
  stage.remove();
  style.remove();
  return { banner: label(banner), boxes: byTitle, wraps };
};

const answers = await withBundledPage(SPECS, async (page) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const out = {};
  for (const [name, markup] of Object.entries(CASES)) out[name] = await page.evaluate(ASK, markup);
  return out;
});

test('strap: a name beside a date and a time still grows its bar', () => {
  assert.equal(answers.strap.banner, 'Bar', JSON.stringify(answers.strap));
});

test('player: a player strap with a shirt number and an age grows its bar', () => {
  assert.equal(answers.player.banner, 'Bar', JSON.stringify(answers.player));
});

test('centred: a centred lower third grows, and a pixel of bar width does not flip it', () => {
  assert.equal(answers.centredWide.banner, 'Bar', JSON.stringify(answers.centredWide));
  assert.equal(answers.centred500.banner, answers.centred499.banner, `500 wide: ${answers.centred500.banner}, 499 wide: ${answers.centred499.banner}`);
  assert.equal(answers.centred499.banner, 'Bar');
});

test('board: a scoreboard\'s centred period strip keeps its size', () => {
  assert.equal(answers.board.banner, null, JSON.stringify(answers.board));
});

test('artboard: an unfilled frame-sized rectangle never beats the bar a tall name sits on', () => {
  assert.equal(answers.artboard.boxes.Name, 'Bar', JSON.stringify(answers.artboard));
  assert.equal(answers.artboard.banner, 'Bar');
});

test('wrap: offered where the room holds two lines, never where both answers paint the same', () => {
  assert.equal(answers.tallBox.wraps.Question, true, JSON.stringify(answers.tallBox.wraps));
  assert.equal(answers.nameOverTitle.wraps.Name, false, JSON.stringify(answers.nameOverTitle.wraps));
  assert.equal(answers.nameOverTitle.wraps.Title, false);
  // A serif's line box runs a third taller than its size; two lines still do not fit.
  assert.equal(answers.nameOverTitleSerif.wraps.Name, false, JSON.stringify(answers.nameOverTitleSerif.wraps));
  assert.equal(Object.values(answers.curved.wraps).some(Boolean), false, JSON.stringify(answers.curved.wraps));
});

test('the step and the runtime agree on where a value starts being reported too long', () => {
  const runtime = /var SVG_FIT_FLOOR = ([0-9.]+);/.exec(readFileSync(root('src/templates/importedDesign/runtime/svgFit.js'), 'utf8'));
  const step = /export const WRAP_REPORT_FLOOR = ([0-9.]+);/.exec(readFileSync(root('src/components/wizard/import/stageMeasure.ts'), 'utf8'));
  assert.ok(runtime && step);
  assert.equal(step[1], runtime[1]);
});
