// guards: src/components/wizard/import/fieldAutoMap.ts
//
// THE UNMATCHED NOTICE'S COUNT IS A CLAIM ABOUT SOMEBODY'S FILE, and this is what says it stays
// true. `fillGap` prints "the file has N layers nothing is using" and the step gates the sentence
// at three empty boxes so that it only appears when the reader will act on it - so an inflated N
// sends somebody hunting for layers that do not exist, at exactly the moment they will look.
//
// A vote board is where it went wrong: an empty `bar` role pools EVERY drawing in the file, so the
// full-bleed plate the board is drawn on was counted as a layer whose name fell short
// (the walk: docs/acceptance/owner-queue/2026-09-09-c-the-unmatched-count-stops-naming-plates.md).
// What is pinned here is the plate rule that fixes it and the three directions it must not
// overreach in: a hidden moment is still counted, a lone drawing is not a plate on itself, and a
// caller that measured nothing still gets the count it always had.
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

const { artworkInk, fillGap, proposeFill } = await load(
  path.join(projectRoot, 'src/components/wizard/import/fieldAutoMap.ts'),
);

/** A box in the artwork's own px, written the way the step measures it. */
const box = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height });
/** The ink the step would hand in: every box it measured, which here is every layer. */
const inkOf = (...layers) => artworkInk(layers.flat().map((l) => l.box));

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

const INK = inkOf(TEXT, DRAWN);

test('the plate the board is drawn on is not a layer nothing is using', () => {
  // Fifteen unclaimed layers - seven text and eight drawings - of which one is the plate.
  const measured = fillGap('vote', VOTE_PICKERS, TEXT, DRAWN, [], INK);
  assert.equal(measured.empty, 11);
  assert.equal(measured.spare, 14);

  // No ink, which is what a caller that measured nothing hands in - and what the step handed
  // before geometry reached this notice: the plate is counted, and the reader is sent to name a
  // rectangle that has no role to fill.
  const blind = fillGap('vote', VOTE_PICKERS, TEXT, DRAWN);
  assert.equal(blind.empty, 11);
  assert.equal(blind.spare, 15);
});

test('the rules and row furniture stay counted - a track really could be the bar', () => {
  // The rule refuses only the drawing everything else sits on. Every other rectangle on the board
  // is a layer the author could name into a role, and the notice is right to say so: over the
  // repo's corpus the two populations do not separate anywhere below the top of the range.
  const { spare } = fillGap('vote', VOTE_PICKERS, TEXT, DRAWN, [], INK);
  const rest = DRAWN.filter((l) => l !== PLATE);
  assert.equal(spare, fillGap('vote', VOTE_PICKERS, TEXT, rest, [], inkOf(TEXT, rest)).spare);
});

test('a HIDDEN drawing across the whole board is still counted', () => {
  // A designer does not hide the base look, so an exported-hidden layer is a moment they drew -
  // and a moment nothing is using is exactly what this notice exists to name. The corpus holds
  // two of these: a "Time up" state over 67% of its board and a "Goal" over 75%.
  const moment = { id: 'g0', label: 'Voting closed', hidden: true, box: box(0, 0, 1920, 1080) };
  const drawn = [...DRAWN, moment];
  assert.equal(fillGap('vote', VOTE_PICKERS, TEXT, drawn, [], inkOf(TEXT, drawn)).spare, 15);
});

test('0.95 of the artwork is the line, and it is measured against the INK', () => {
  // The ink is the union of every measured box, never the frame: the same plate is 7.6% of the
  // frame on a nameplate drawn into a 1920x1080 artboard and 100% on a full-bleed board, and the
  // vote band that filed this defect draws its plate across 31.5% of the frame.
  // Here the artwork is a band across the bottom third, so the frame says 32% and the ink 100%.
  const band = { id: 's0', label: 'Backplate', box: box(0, 740, 1920, 340) };
  const bar = { id: 's1', label: 'Track 1', box: box(560, 880, 1000, 36) };
  const words = [{ id: 'c0', label: 'Kemijoki', box: box(200, 880, 300, 36) }];
  assert.equal(fillGap('vote', VOTE_PICKERS, words, [band, bar], [], inkOf(words, [band, bar])).spare, 2);

  // Either side of the line, on one artwork: a drawing over 95% of the ink is the plate, one
  // under it is still something drawn on the board. 0.9747 and 0.9330 of a 1000x1000 ink.
  const ink = [{ id: 'c0', label: 'Prompt', box: box(0, 0, 1000, 1000) }];
  const chip = { id: 's2', label: 'Chip', box: box(100, 100, 60, 60) };
  const over = { id: 's0', label: 'Big', box: box(0, 0, 987, 987) };
  const under = { id: 's1', label: 'Nearly', box: box(0, 0, 966, 966) };
  assert.equal(fillGap('vote', VOTE_PICKERS, ink, [over, chip], [], inkOf(ink)).spare, 2);
  assert.equal(fillGap('vote', VOTE_PICKERS, ink, [under, chip], [], inkOf(ink)).spare, 3);
});

test('a lone drawing is the artwork itself, and stays counted', () => {
  // The ink is the union of what was measured, so a file whose ONE drawing holds all its text
  // defines that ink by itself and covers 1.0 of it. Calling that a plate would take the single
  // layer an author most needs to name out of the notice AND out of the fill - so a plate must
  // also have something drawn ON it. The corpus agrees: 131 of its 132 plates hold another
  // drawing, and the one that does not is a corner mark that is the only drawing in its file.
  const bar = { id: 's0', label: 'Fuel', box: box(160, 400, 1600, 120) };
  const figure = [{ id: 'c0', label: 'Osuus', box: box(1500, 430, 200, 60), numeric: true }];
  const pickers = [
    { role: 'bar', value: '' },
    { role: 'percent', value: 'c0' },
  ];
  const ink = inkOf(figure, [bar]);
  assert.equal(fillGap('meter', pickers, figure, [bar], [], ink).spare, 1);
  assert.deepEqual(proposeFill('meter', pickers, figure, [bar], [], ink).map((p) => p.candidateId), ['s0']);
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
  // The badge is bound already, so the plate is the one drawing left for the Bar.
  const plate = { id: 's0', label: 'Backplate', box: box(0, 0, 1920, 1080) };
  const badge = { id: 's1', label: 'Kicker', box: box(1500, 100, 200, 80) };
  const bound = [...pickers.slice(1), { role: 'bar', value: '' }];
  const ink = inkOf(words, [plate, badge]);
  assert.deepEqual(proposeFill('meter', bound, words, [plate, badge], ['s1'], ink), []);

  // A drawing that is not the board is still the one drawing left, and still taken.
  const tube = { id: 's2', label: 'Tube', box: box(400, 500, 1000, 60) };
  const picks = proposeFill('meter', bound, words, [plate, badge, tube], ['s0', 's1'], ink);
  assert.deepEqual(picks.map((p) => [p.role, p.candidateId, p.reason]), [['bar', 's2', 'the one drawing left']]);
});

test('the ink is every candidate the step measured, not only what a picker offers', () => {
  // A vote board on a full-bleed photo: the picture is not in either pool, but it is ink a reader
  // sees. Without it the panel behind the rows would define the ink and be dropped as the plate,
  // which is the wrong layer AND a different scale from the corpus the threshold came from.
  const photo = { id: 'i0', label: 'Backdrop', box: box(0, 0, 1920, 1080) };
  const panel = { id: 's0', label: 'Panel', box: box(160, 300, 1600, 500) };
  const bar = { id: 's1', label: 'Track 1', box: box(200, 400, 1200, 40) };
  const words = [{ id: 'c0', label: 'Kemijoki', box: box(220, 405, 300, 30) }];
  const drawn = [panel, bar];
  // Ink from the two pools alone is the panel, so the panel reads as the plate: 2 spare.
  assert.equal(fillGap('vote', VOTE_PICKERS, words, drawn, [], inkOf(words, drawn)).spare, 2);
  // Ink from everything the step measured is the photo, and the panel is a layer to name: 3.
  assert.equal(fillGap('vote', VOTE_PICKERS, words, drawn, [], inkOf(words, drawn, [photo])).spare, 3);
});
