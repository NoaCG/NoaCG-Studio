// gate: factory
// needs: browser
// guards: src/validation/markLegibility.ts, src/assets/assetInfo.ts
//
// A LOGO THAT BRINGS ITS OWN PLATE IS MEASURED ON ITS PLATE, NOT ON THE TILE AROUND IT.
//
// `bench-mark-unreadable` fired on both real logos tried in the clean coding-agent runs of
// 2026-10-16 (docs/work-specs/agent-onboarding/evidence/baseline-runs.md, gap 3): a roller-derby
// badge that is a solid dark-teal disc with a pink ring, placed on a teal block, and a club crest
// on a white tile. Both read clearly in the rendered frames, and every agent overrode the
// warning - which teaches agents to ignore warnings. The probe called a mark "own-field" only
// when 98% of its BOX was opaque, so a round badge (a disc fills 78% of its square, the corners
// are transparent) was judged as transparent ink, and its ink was averaged into one grey and
// held against the tile.
//
// Widening an exemption is how a gate goes blind, so the other direction is pinned harder: a
// knockout wordmark on a light tile, a plate with nothing drawn on it, a badge whose name is
// knocked out of its disc so the tile shows through, a two-ink shape that is not a plate and two
// separate tiles must all still warn - one fixture per condition of the plate test, each
// mutation-checked to fail alone when its condition is removed.
//
// The DOM is the point: the probe reads the PAINTED image through a canvas, at the downscale the
// product reads it at, and the surface walk reads computed style.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { withBundledPage } from './catalog-emit.mjs';

const SPECS = [
  { entry: fileURLToPath(new URL('../src/validation/markLegibility.ts', import.meta.url)), globalName: 'NOACG_MARK' },
];

const svg = (body, w = 600, h = 600) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;

/** The badge from the run, as its SVG source: a dark disc, a pink ring, the club's name on it. */
const BADGE = svg(
  '<circle cx="300" cy="300" r="280" fill="#0B3B3C"/>'
  + '<circle cx="300" cy="300" r="258" fill="none" stroke="#FF2E88" stroke-width="14"/>'
  + '<g transform="translate(300 250)"><circle r="92" fill="#0FB5AE"/><circle r="40" fill="#0B3B3C"/>'
  + '<path d="M-150 30 L-110 -40 L-60 -40" fill="none" stroke="#FF2E88" stroke-width="16" stroke-linecap="round"/>'
  + '<path d="M150 30 L110 -40 L60 -40" fill="none" stroke="#FF2E88" stroke-width="16" stroke-linecap="round"/></g>'
  + '<text x="300" y="440" text-anchor="middle" font-family="Arial" font-weight="900" font-size="96" fill="#FFFFFF">KALLIO</text>'
  + '<text x="300" y="505" text-anchor="middle" font-family="Arial" font-weight="900" font-size="58" fill="#FF2E88">ROLLERS</text>',
);

/** A club crest: a blue roundel with a white ring and white letters, padded in its file. */
const CREST = svg(
  '<circle cx="300" cy="300" r="250" fill="#2A62B8"/>'
  + '<circle cx="300" cy="300" r="216" fill="none" stroke="#FFFFFF" stroke-width="32"/>'
  + '<text x="300" y="360" text-anchor="middle" font-family="Arial" font-weight="900" font-size="170" fill="#FFFFFF">FCK</text>',
);

/** The defect the gate exists for: one light ink, nothing behind it. */
const KNOCKOUT = svg(
  '<rect x="0" y="26" width="64" height="14" fill="#ffffff"/>'
  + '<text x="90" y="76" font-family="Arial" font-size="58" font-weight="700" fill="#ffffff">Meridian</text>',
  480, 120,
);

/** A disc in ONE ink with nothing on it: the shape is the ink, and on its own tone it is gone. */
const BLANK_DISC = svg('<circle cx="300" cy="300" r="280" fill="#0B3B3C"/>');

/** A badge with its name KNOCKED OUT of the disc: two inks and one piece (letters without
 *  enclosed counters, so no island is cut loose), but the name is a hole the tile shows through,
 *  so on a tile of the disc's own tone the name is gone. */
const KNOCKED_OUT_NAME = svg(
  '<mask id="m"><rect width="600" height="600" fill="#fff"/>'
  + '<text x="300" y="360" text-anchor="middle" font-family="Arial" font-weight="900" font-size="130" fill="#000">STILL</text></mask>'
  + '<circle cx="300" cy="300" r="280" fill="#0B3B3C" mask="url(#m)"/>'
  + '<circle cx="300" cy="300" r="250" fill="none" stroke="#FF2E88" stroke-width="30"/>',
);

/** The badge with its disc at half opacity: the same shape, but the tile shows through the
 *  plate, so it is no plate. */
const TRANSLUCENT_BADGE = BADGE.replace('fill="#0B3B3C"/>', 'fill="#0B3B3C" fill-opacity="0.5"/>');

/** Two inks in one piece with no hole, but a cross leaves most of its box open: a shape, not a
 *  plate, so its inks are what meet the tile. */
const CROSS = svg(
  '<rect x="200" y="20" width="200" height="560" fill="#0B3B3C"/>'
  + '<rect x="20" y="200" width="560" height="200" fill="#FF2E88"/>',
);

/** Two tiles in two inks that fill their box between them, but as two pieces with nothing drawn
 *  on either: each one is just ink. */
const SPLIT_TILES = svg(
  '<rect x="20" y="20" width="270" height="560" fill="#0B3B3C"/>'
  + '<rect x="310" y="20" width="270" height="560" fill="#FF2E88"/>',
);

/** Mount one logo on one tile and run the product's own measurement. Runs in the browser. */
const MEASURE = async ({ svgText, tile }) => {
  document.getElementById('fx')?.remove();
  const frame = document.createElement('iframe');
  frame.id = 'fx';
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1920px;height:1080px;border:0;';
  const src = `data:image/svg+xml;base64,${btoa(svgText)}`;
  await new Promise((resolve) => {
    frame.onload = resolve;
    frame.srcdoc = '<!doctype html><html><head><style>html,body{margin:0}'
      + `.tile{position:absolute;left:120px;top:780px;padding:24px;background:${tile}}`
      + '.tile img{display:block;width:180px;height:auto}</style></head>'
      + `<body><div class="tile"><img id="logo" src="${src}"></div></body></html>`;
    document.body.appendChild(frame);
  });
  return window.NOACG_MARK.markLegibilityFindings(frame.contentDocument, frame.contentWindow);
};

const CASES = {
  badgeOnTeal: { svgText: BADGE, tile: '#0FB5AE' },
  crestOnWhite: { svgText: CREST, tile: '#ffffff' },
  knockoutOnLight: { svgText: KNOCKOUT, tile: '#f5f2ec' },
  blankDiscOnItsTone: { svgText: BLANK_DISC, tile: '#0E4546' },
  knockedOutNameOnItsTone: { svgText: KNOCKED_OUT_NAME, tile: '#0E4546' },
  translucentBadgeOnTeal: { svgText: TRANSLUCENT_BADGE, tile: '#0FB5AE' },
  crossOnMidGrey: { svgText: CROSS, tile: '#707070' },
  splitTilesOnMidGrey: { svgText: SPLIT_TILES, tile: '#707070' },
};

const measured = await withBundledPage(SPECS, async (page) => {
  const out = {};
  for (const [name, args] of Object.entries(CASES)) out[name] = await page.evaluate(MEASURE, args);
  return out;
});

test('a badge on its own disc is not reported, on the tile the run placed it on', () => {
  assert.deepEqual(measured.badgeOnTeal, []);
});

test('a crest on its own roundel is not reported on a white tile', () => {
  assert.deepEqual(measured.crestOnWhite, []);
});

test('a knockout wordmark on a light tile is still reported', () => {
  assert.equal(measured.knockoutOnLight.length, 1, JSON.stringify(measured));
  assert.ok(measured.knockoutOnLight[0].ratio < 3);
});

test('a plate with nothing drawn on it is ink, and is still reported on its own tone', () => {
  assert.equal(measured.blankDiscOnItsTone.length, 1, JSON.stringify(measured));
});

test('a disc with its name knocked out brings no plate, and is still reported on its own tone', () => {
  assert.equal(measured.knockedOutNameOnItsTone.length, 1, JSON.stringify(measured));
});

test('a two-ink shape that leaves most of its box open is no plate, and is still reported', () => {
  assert.equal(measured.crossOnMidGrey.length, 1, JSON.stringify(measured));
});

test('two separate pieces are no plate, however much of the box they fill, and are still reported', () => {
  assert.equal(measured.splitTilesOnMidGrey.length, 1, JSON.stringify(measured));
});

test('a plate the tile shows through is no plate, and is still reported', () => {
  assert.equal(measured.translucentBadgeOnTeal.length, 1, JSON.stringify(measured));
});
