// gate: build
// guards: src/templates/importedDesign/runtime/svgShapeShift.js
//
// The point shifter a grown PATH panel rides on (docs/SVG_IMPORT_PLAN.md, section 6c): every
// point on the growing side of the shape's middle moves by the grant and nothing else changes,
// so the rounded rectangle Illustrator writes as a path keeps the corner curves the designer
// drew. The live half (the plate in the preview still carries its curves once grown) is the
// wider-and-taller case in e2e/import-svg-corpus.spec.ts; this is the arithmetic, read from the
// data itself, where an end point moved with its control points left behind would show.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  path.join(here, '../src/templates/importedDesign/runtime/svgShapeShift.js'),
  'utf8',
);
// ES5 with no dependencies, injected as text into every imported graphic: run it as that text.
const { svgShiftPathD } = new Function(`${source}\nreturn { svgShiftPathD: svgShiftPathD };`)();

/** The corpus plate (effects-gradient-shadow-lower-third): relative runs and four corner cubics. */
const PLATE =
  'M148,760h1024c4.4,0,8,3.6,8,8v174c0,4.4-3.6,8-8,8H148c-4.4,0-8-3.6-8-8V768C140,763.6,143.6,760,148,760z';

/** A path as absolute segments, relative commands resolved and H/V read as the lines they are. */
function segments(d) {
  const tokens = d.match(/[MmLlHhVvCcZz]|-?(?:\d*\.\d+|\d+)/g);
  const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, Z: 0 };
  const out = [];
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let cmd = '';
  for (let i = 0; i < tokens.length; ) {
    if (/^[a-z]$/i.test(tokens[i])) cmd = tokens[i++];
    const upper = cmd.toUpperCase();
    const rel = cmd !== upper;
    if (upper === 'Z') {
      out.push({ cmd: 'Z', points: [] });
      x = sx;
      y = sy;
      continue;
    }
    const nums = tokens.slice(i, i + ARITY[upper]).map(Number);
    i += ARITY[upper];
    let points;
    if (upper === 'H') points = [[rel ? x + nums[0] : nums[0], y]];
    else if (upper === 'V') points = [[x, rel ? y + nums[0] : nums[0]]];
    else {
      points = [];
      for (let p = 0; p < nums.length; p += 2) {
        points.push([rel ? x + nums[p] : nums[p], rel ? y + nums[p + 1] : nums[p + 1]]);
      }
    }
    [x, y] = points[points.length - 1];
    if (upper === 'M') {
      sx = x;
      sy = y;
      cmd = rel ? 'l' : 'L';
    }
    out.push({ cmd: upper === 'H' || upper === 'V' ? 'L' : upper, points });
  }
  return out;
}

/** Each corner cubic as a shape: its control points' offsets from its own end point. */
function corners(segs) {
  return segs
    .filter((s) => s.cmd === 'C')
    .map((s) => s.points.map(([x, y]) => [round(x - s.points[2][0]), round(y - s.points[2][1])]));
}
const round = (v) => Math.round(v * 1000) / 1000;
const near = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) <= 0.001, `${what}: ${actual} is not ${expected}`);

// The plate spans 140..1180 by 760..950, so its middles are 660 and 855.
for (const [axis, split, dir, delta, says] of [
  ['x', 660, 1, 200, 'wider to the right'],
  ['y', 855, 1, 60, 'taller downwards'],
  ['y', 855, -1, 60, 'taller upwards, the near half moving the other way'],
]) {
  test(`growing a path panel ${says} moves only the growing side, by the grant, and keeps every corner curve as drawn`, () => {
    const rest = segments(PLATE);
    const grown = segments(svgShiftPathD(PLATE, axis, split, dir, delta));
    assert.equal(grown.length, rest.length, 'the segment list changed length');
    rest.forEach((seg, i) => {
      assert.equal(grown[i].cmd, seg.cmd, `segment ${i} changed command`);
      seg.points.forEach(([x, y], p) => {
        const v = axis === 'y' ? y : x;
        const moves = dir < 0 ? v < split : v > split;
        const want = moves ? v + dir * delta : v;
        near(grown[i].points[p][axis === 'y' ? 1 : 0], want, `segment ${i} point ${p} along the axis`);
        near(grown[i].points[p][axis === 'y' ? 0 : 1], axis === 'y' ? x : y, `segment ${i} point ${p} across the axis`);
      });
    });
    assert.equal(corners(rest).length, 4, 'the drawn plate has four corner curves');
    assert.deepEqual(corners(grown), corners(rest), 'a corner curve changed shape');
  });
}
