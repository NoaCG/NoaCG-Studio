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
  stage.remove();
  style.remove();
  return { banner: label(banner), boxes: byTitle };
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
