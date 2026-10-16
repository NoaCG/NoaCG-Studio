// gate: factory
// needs: browser
// guards: src/assets/svgImport.ts, src/templates/behaviours/**, src/templates/importedDesign/**, src/components/wizard/import/draft.ts, src/preview/composeDocument.ts
//
// A LIVE-VOTE BOARD KEEPS EVERY BAR IT DREW, AND ITS ROUNDED BARS KEEP THEIR SHAPE (issue #784).
//
// Two faults on the board a student draws for a live vote:
//
//   - The import kept only the twelve widest rectangles. A bar drawn at full length is exactly as
//     wide as its track, and the tracks come first, so on a board of more than five options the
//     last bars were in no list at all: the vote could neither propose them nor be pointed at
//     them, and those rows never moved. A named shape past the twelve is now kept.
//   - A bar drawn with rounded ends arrives as a <path> (that is how Illustrator writes a rounded
//     rectangle), and a path gauge was SCALED, which squashed the rounded ends as the bar moved.
//     It now moves its far half in, the way a path panel grows, and keeps the ends as drawn.
//
// Both run on the real import, the real proposal and the real composer, in Chromium, on a clock
// this file drives (scripts/driven-clock.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { withBundledPage } from './catalog-emit.mjs';
import { installDrivenPage } from './driven-clock.mjs';
import { measured } from './measured.mjs';

const entry = (rel) => fileURLToPath(new URL(`../src/${rel}`, import.meta.url));
const SPECS = [
  { entry: entry('assets/svgImport.ts'), globalName: 'NOACG_SVG' },
  { entry: entry('templates/behaviours/naming.ts'), globalName: 'NOACG_NAMING' },
  { entry: entry('components/wizard/import/draft.ts'), globalName: 'NOACG_DRAFT' },
  { entry: entry('templates/importedDesign/svg.ts'), globalName: 'NOACG_IMPORTED' },
  { entry: entry('preview/composeDocument.ts'), globalName: 'NOACG_COMPOSE' },
];

const OPTIONS = 8;
/** A rounded bar as Illustrator writes one: a path, never a rect with rx. */
const pill = (x, y, w, h) => {
  const r = h / 2;
  return `M${x + r},${y}H${x + w - r}C${x + w - r / 2},${y} ${x + w},${y + r / 2} ${x + w},${y + r}`
    + `S${x + w - r / 2},${y + h} ${x + w - r},${y + h}H${x + r}C${x + r / 2},${y + h} ${x},${y + h - r / 2} ${x},${y + r}`
    + `S${x + r / 2},${y} ${x + r},${y}Z`;
};

/** A full-frame vote board drawn the ordinary way: a plate, a question, and per option a label,
 *  a track and a bar at full length over it, every part named the way the docs teach. */
function board(rounded) {
  const rows = Array.from({ length: OPTIONS }, (_, i) => {
    const n = i + 1;
    const y = 200 + i * 100;
    const bar = rounded
      ? `<path id="Bar_x20_${n}" data-name="Bar ${n}" fill="#F6A623" d="${pill(400, y, 1200, 48)}"/>`
      : `<rect id="Bar_x20_${n}" data-name="Bar ${n}" x="400" y="${y}" width="1200" height="48" fill="#F6A623"/>`;
    return `<text id="Option_x20_${n}" data-name="Option ${n}" x="120" y="${y + 36}" font-size="32" fill="#fff">Option ${n}</text>`
      + `<text id="Figure_x20_${n}" data-name="Percent ${n}" x="1640" y="${y + 36}" font-size="32" fill="#fff">0%</text>`
      + `<rect id="Track_x20_${n}" data-name="Track ${n}" x="400" y="${y}" width="1200" height="48" fill="#1B2431"/>`
      + bar;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">`
    + `<rect id="Backplate" x="0" y="0" width="1920" height="1080" fill="#0D1017"/>`
    + `<text id="Question" x="120" y="120" font-size="56" fill="#fff">Which one?</text>`
    + rows.join('')
    + `</svg>`;
}

/** Runs in the browser: import, propose, and say which bars the vote can bind. */
const PROPOSE = ({ markup }) => {
  const svg = window.NOACG_SVG.importSvgMarkup(markup);
  const label = (id) => svg.shapes.find((s) => s.id === id)?.label ?? null;
  const proposal = window.NOACG_NAMING.bestProposal(svg);
  const bars = proposal?.layers?.bar ?? {};
  return {
    inventory: svg.shapes.map((s) => s.label),
    recipe: proposal?.recipe ?? null,
    bound: Object.keys(bars).sort((a, b) => a - b).map((k) => `${k}: ${label(bars[k])}`),
  };
};

/** Runs in the browser: build the board as the wizard would, take it, land a vote, and measure
 *  every bar against the length it was drawn at. */
const VOTE = async ({ markup, shares }) => {
  const svg = window.NOACG_SVG.importSvgMarkup(markup);
  const draft = window.__importDraft(svg);
  const behaviour = draft.svgBehaviour;
  const template = window.NOACG_IMPORTED.IMPORTED_SVG.create({ designSvg: window.NOACG_DRAFT.svgDesignOptions(draft) });
  const options = template.fields.find((f) => f.title === 'Options');
  if (!options) return { error: `no Options field (behaviour ${JSON.stringify(behaviour?.kind)})` };

  const w = await window.__mountDesign(template);
  const bars = [...w.document.querySelectorAll('[data-name^="Bar "], [id^="Bar_x20_"]')]
    .filter((el, i, all) => all.indexOf(el) === i && /^(rect|path)$/i.test(el.tagName));
  // Each bar's width, horizontal scale and height on screen.
  const measure = (el) => {
    const r = el.getBoundingClientRect();
    const m = el.getScreenCTM();
    return { width: r.width, scaleX: Math.round(Math.hypot(m.a, m.b) * 1000) / 1000, height: r.height };
  };
  const drawn = bars.map(measure);
  const round = JSON.stringify({ [options.field]: shares.map((s, i) => `Option ${i + 1} | ${s}`).join('\n') });
  w.update(round);
  w.play();
  w.__advance(4000);
  // The bars move on a data repaint with the board on air, which is how a round lands.
  w.update(round);
  w.__advance(4000);
  const after = bars.map(measure);
  const base = drawn[0]?.scaleX ?? 1;
  document.getElementById('fx')?.remove();
  const total = shares.reduce((a, b) => a + b, 0);
  return {
    bars: bars.length,
    rows: after.map((a, i) => ({
      want: Math.round((drawn[i].width * shares[i]) / total),
      got: Math.round(a.width),
      // The bar's own drawing is not scaled sideways: its ends stay as they were drawn.
      squashed: Math.abs(a.scaleX - base) > 0.01,
      height: Math.round(a.height) === Math.round(drawn[i].height),
    })),
  };
};

const SHARES = [5, 10, 15, 20, 25, 10, 10, 5];

const runs = await withBundledPage(SPECS, async (page) => {
  await installDrivenPage(page);
  return {
    square: await page.evaluate(PROPOSE, { markup: board(false) }),
    rounded: await page.evaluate(PROPOSE, { markup: board(true) }),
    roundedVote: await page.evaluate(VOTE, { markup: board(true), shares: SHARES }),
    squareVote: await page.evaluate(VOTE, { markup: board(false), shares: SHARES }),
  };
});

measured(OPTIONS * 2, 'vote board bars proposed, square and rounded');

const wanted = Array.from({ length: OPTIONS }, (_, i) => `${i + 1}: Bar ${i + 1}`);

test('an eight-option vote board proposes every bar it drew', () => {
  assert.equal(runs.square.recipe, 'vote');
  assert.deepEqual(runs.square.bound, wanted, `inventory: ${runs.square.inventory.join(', ')}`);
});

test('so does the same board with rounded bars drawn as paths', () => {
  assert.equal(runs.rounded.recipe, 'vote');
  assert.deepEqual(runs.rounded.bound, wanted, `inventory: ${runs.rounded.inventory.join(', ')}`);
});

for (const kind of ['square', 'rounded']) {
  test(`every ${kind} bar moves to its share of the vote`, () => {
    const run = runs[`${kind}Vote`];
    assert.equal(run.error, undefined);
    assert.equal(run.bars, OPTIONS);
    const off = run.rows.map((r, i) => (Math.abs(r.got - r.want) > 3 ? `Bar ${i + 1}: ${r.got}px for ${r.want}px` : null)).filter(Boolean);
    assert.deepEqual(off, []);
  });
}

test('a rounded bar is never squashed sideways while it is longer than its own ends', () => {
  const squashed = runs.roundedVote.rows.map((r, i) => (r.squashed || !r.height ? `Bar ${i + 1}` : null)).filter(Boolean);
  assert.deepEqual(squashed, []);
});
