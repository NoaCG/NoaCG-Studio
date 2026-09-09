// guards: src/components/wizard/import/fieldAutoMap.ts
//
// THE UNMATCHED NOTICE'S COUNT IS A CLAIM ABOUT SOMEBODY'S FILE, and this is what says it stays
// true. `fillGap` prints "the file has N layers nothing is using" and the step gates the sentence
// at three empty boxes so that it only appears when the reader will act on it - so an inflated N
// sends somebody hunting for layers that do not exist, at exactly the moment they will look.
//
// A vote board is where it went wrong: an empty `bar` role pools EVERY drawing in the file, so the
// full-bleed plate the board is drawn on was counted as a layer whose name fell short
// (docs/backlog/the-vote-notice-counts-plates-as-spare-layers.md). What is pinned here is the
// plate rule that fixes it and the two directions it must not overreach in - a hidden moment is
// still counted, and a caller that measured nothing still gets the count it always had.
//
// The threshold itself (0.95 of the artwork's ink) is measured, not argued:
// `scripts/svg-plate-share-spike.mjs` prints the distribution over the 77 artwork files in the
// repo, and `fieldAutoMap.ts` records what it said beside the constant. The two cases at the ends
// of this file are the boundary that measurement chose.
//
// No browser. `fillGap` is arithmetic over boxes the step hands it; what needs a real Chromium is
// whether the step measures those boxes correctly, which `e2e/import-svg-behaviour.spec.ts` walks.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** One TypeScript module of the app's graph, importable here. */
async function load(entry) {
  const bundle = await rolldown({ input: entry, platform: 'neutral', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  return import(`data:text/javascript;base64,${Buffer.from(output[0].code, 'utf8').toString('base64')}`);
}

const { fillGap, proposeFill } = await load(path.join(projectRoot, 'src/components/wizard/import/fieldAutoMap.ts'));

/** A box in the artwork's own px, written the way the step measures it. */
const box = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height });

// THE BOARD THE BACKLOG DESCRIBES: a 1920x1080 vote graphic a student drew, with a full-bleed
// plate behind everything, a rule under the title, a track per row and a bar drawn over each
// track. Nothing is named for a vote role, which is why the reader picked the behaviour by hand
// and why every picker below is empty.
const PLATE = { id: 's0', label: 'Backplate', box: box(0, 0, 1920, 1080) };
const RULE = { id: 's1', label: 'Header rule', box: box(160, 250, 1600, 8) };
const TRACKS = [0, 1, 2].map((i) => ({ id: `s${2 + i}`, label: `Track ${i + 1}`, box: box(160, 360 + i * 140, 1600, 60) }));
const METERS = [0, 1, 2].map((i) => ({ id: `s${5 + i}`, label: `Meter ${i + 1}`, box: box(160, 360 + i * 140, 1600, 60) }));
const DRAWN = [PLATE, RULE, ...TRACKS, ...METERS];
const TEXT = [
  { id: 'c0', label: 'Prompt', box: box(160, 150, 900, 70) },
  ...[0, 1, 2].map((i) => ({ id: `c${1 + i}`, label: `Nimi ${i + 1}`, box: box(200, 370 + i * 140, 400, 40) })),
  ...[0, 1, 2].map((i) => ({ id: `c${4 + i}`, label: `Luku ${i + 1}`, box: box(1600, 370 + i * 140, 120, 40), numeric: true })),
];
/** The vote's boxes for two option rows, all of them empty - what picking "Live vote" by hand
 *  seeds (MapSvgFieldsStep.tsx: "A fresh vote starts with two empty option rows"). */
const VOTE_PICKERS = [
  { role: 'question', value: '' },
  ...['1', '2'].flatMap((key) =>
    ['option', 'bar', 'percent', 'winner'].map((role) => ({ role, key, value: '' })),
  ),
  { role: 'total', value: '' },
  { role: 'badge', value: '' },
];

/** The same layers as the step handed them before geometry reached the notice. */
const stripBoxes = (layers) => layers.map((l) => ({ ...l, box: undefined }));

test('the plate the board is drawn on is not a layer nothing is using', () => {
  // Fifteen unclaimed layers - seven text and eight drawings - of which one is the plate.
  const measured = fillGap('vote', VOTE_PICKERS, TEXT, DRAWN);
  assert.equal(measured.empty, 11);
  assert.equal(measured.spare, 14);

  // Unmeasured, which is what the step handed it before geometry reached the notice: the plate
  // is counted, and the reader is sent to name a rectangle that has no role to fill.
  const blind = fillGap('vote', VOTE_PICKERS, stripBoxes(TEXT), stripBoxes(DRAWN));
  assert.equal(blind.empty, 11);
  assert.equal(blind.spare, 15);
});

test('the rules and row furniture stay counted - a track really could be the bar', () => {
  // The rule refuses only the drawing everything else sits on. Every other rectangle on the board
  // is a layer the author could name into a role, and the notice is right to say so: over the
  // repo's corpus the two populations do not separate anywhere below the top of the range.
  const { spare } = fillGap('vote', VOTE_PICKERS, TEXT, DRAWN);
  const withoutPlate = fillGap('vote', VOTE_PICKERS, TEXT, DRAWN.filter((l) => l !== PLATE));
  assert.equal(spare, withoutPlate.spare);
});

test('a HIDDEN drawing across the whole board is still counted', () => {
  // A designer does not hide the base look, so an exported-hidden layer is a moment they drew -
  // and a moment nothing is using is exactly what this notice exists to name. The corpus holds
  // two of these: a "Time up" state over 67% of its board and a "Goal" over 75%.
  const moment = { id: 'g0', label: 'Voting closed', hidden: true, box: box(0, 0, 1920, 1080) };
  const { spare } = fillGap('vote', VOTE_PICKERS, TEXT, [...DRAWN, moment]);
  assert.equal(spare, 15);
});

test('0.95 of the artwork is the line, and it is measured against the INK', () => {
  // The ink is the union of every measured box, never the frame: the same plate is 7.6% of the
  // frame on a nameplate drawn into a 1920x1080 artboard and 100% on a full-bleed board, and the
  // vote band that filed this defect draws its plate across 31.5% of the frame.
  // Here the artwork is a band across the bottom third, so the frame says 32% and the ink 100%.
  const band = { id: 's0', label: 'Backplate', box: box(0, 740, 1920, 340) };
  const bar = { id: 's1', label: 'Track 1', box: box(560, 880, 1000, 36) };
  const words = [{ id: 'c0', label: 'Kemijoki', box: box(200, 880, 300, 36) }];
  assert.equal(fillGap('vote', VOTE_PICKERS, words, [band, bar]).spare, 2);

  // Either side of the line, on one artwork: a drawing over 95% of the ink is the plate, one
  // under it is still something drawn on the board. 0.9747 and 0.9330 of a 1000x1000 ink.
  const ink = { id: 'c0', label: 'Prompt', box: box(0, 0, 1000, 1000) };
  const over = { id: 's0', label: 'Big', box: box(0, 0, 987, 987) };
  const under = { id: 's1', label: 'Nearly', box: box(0, 0, 966, 966) };
  assert.equal(fillGap('vote', VOTE_PICKERS, [ink], [over]).spare, 1);
  assert.equal(fillGap('vote', VOTE_PICKERS, [ink], [under]).spare, 2);
});

test('the fill leaves its last box empty rather than binding the board itself', () => {
  // `proposeFill` rule 5 fills a rowless drawing role when exactly one empty box and exactly one
  // unused drawing remain, and a meter's Bar is that shape. Bound to the plate, a gauge would
  // scale the whole graphic with the figure - which is the refusal rule 4 already makes for a
  // per-row bar ("a drawing that spans the words end to end is the row's own plate").
  const words = [{ id: 'c0', label: 'Osuus', box: box(200, 900, 300, 40) }];
  const pickers = [
    { role: 'bar', value: '' },
    { role: 'percent', value: 'c0' },
  ];
  const plate = { id: 's0', label: 'Backplate', box: box(0, 0, 1920, 1080) };
  assert.deepEqual(proposeFill('meter', pickers, words, [plate]), []);

  // A drawing that is not the board is still the one drawing left, and still taken.
  const tube = { id: 's1', label: 'Tube', box: box(400, 500, 1000, 60) };
  const picks = proposeFill('meter', pickers, words, [tube]);
  assert.deepEqual(picks.map((p) => [p.role, p.candidateId, p.reason]), [['bar', 's1', 'the one drawing left']]);
});
