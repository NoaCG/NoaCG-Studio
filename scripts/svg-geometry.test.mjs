// guards: src/assets/svgGeometry.ts
//
// Self-tests for src/assets/svgGeometry.ts - the transform arithmetic the SVG import uses to work
// out where a drawn shape actually is. Pure math, no DOM, no network.
//
// The case that bought this module is the last test: the owner's hand-drawn quiz board, whose
// question plate is written as a portrait rectangle plus an 88.68 degree rotation, and which the
// import used to inventory at the size it has BEFORE that rotation.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildApiRuntime } from './api-runtime-build.mjs';

const runtime = await buildApiRuntime(['src/assets/svgGeometry.ts']);
const emitted = ['svgGeometry.js', 'src/assets/svgGeometry.js']
  .map((p) => path.join(runtime.outputDir, p))
  .find((p) => existsSync(p));
const g = await import(pathToFileURL(emitted).href);
after(async () => { await runtime.cleanup(); });

const UNIT = { x: 0, y: 0, width: 10, height: 20 };
const near = (actual, expected, tol = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${actual} is not within ${tol} of ${expected}`);
const nearBox = (actual, expected, tol = 0.01) => {
  near(actual.x, expected.x, tol);
  near(actual.y, expected.y, tol);
  near(actual.width, expected.width, tol);
  near(actual.height, expected.height, tol);
};

test('no transform leaves the box exactly as drawn', () => {
  nearBox(g.boxInUserSpace(UNIT, []), UNIT);
  nearBox(g.boxInUserSpace(UNIT, [null, '', undefined]), UNIT);
});

test('translate moves it and changes no size', () => {
  nearBox(g.boxInUserSpace(UNIT, ['translate(5 7)']), { x: 5, y: 7, width: 10, height: 20 });
  // One argument means y = 0, per the spec.
  nearBox(g.boxInUserSpace(UNIT, ['translate(5)']), { x: 5, y: 0, width: 10, height: 20 });
});

test('scale takes one argument as both axes', () => {
  nearBox(g.boxInUserSpace(UNIT, ['scale(2)']), { x: 0, y: 0, width: 20, height: 40 });
  nearBox(g.boxInUserSpace(UNIT, ['scale(2 0.5)']), { x: 0, y: 0, width: 20, height: 10 });
});

test('a quarter turn swaps the axes of the box around it', () => {
  const turned = g.boxInUserSpace(UNIT, ['rotate(90)']);
  near(turned.width, 20);
  near(turned.height, 10);
});

test('rotate about a point leaves that point where it was', () => {
  const m = g.parseTransform('rotate(37 100 50)');
  near(m.a * 100 + m.c * 50 + m.e, 100);
  near(m.b * 100 + m.d * 50 + m.f, 50);
});

test('functions inside one attribute apply left to right', () => {
  // translate then rotate: the rotation happens in the translated system, so the corner lands at
  // the translation. Reversed, it does not - which is the whole reason order matters here.
  nearBox(g.boxInUserSpace({ x: 0, y: 0, width: 10, height: 10 }, ['translate(100 0) rotate(90)']), {
    x: 90,
    y: 0,
    width: 10,
    height: 10,
  });
  nearBox(g.boxInUserSpace({ x: 0, y: 0, width: 10, height: 10 }, ['rotate(90) translate(100 0)']), {
    x: -10,
    y: 100,
    width: 10,
    height: 10,
  });
});

test('an ancestor chain composes outermost first', () => {
  // The list is [root-most ... the shape itself], and a scale on the ancestor multiplies the
  // child's translation the way it does in a real document.
  nearBox(g.boxInUserSpace(UNIT, ['scale(2)', 'translate(10 0)']), {
    x: 20,
    y: 0,
    width: 20,
    height: 40,
  });
});

test('matrix is read verbatim, and minified numbers separate correctly', () => {
  nearBox(g.boxInUserSpace(UNIT, ['matrix(1,0,0,1,3,4)']), { x: 3, y: 4, width: 10, height: 20 });
  // Illustrator writes "1-2" for two numbers, with no separator before the minus.
  nearBox(g.boxInUserSpace(UNIT, ['translate(1-2)']), { x: 1, y: -2, width: 10, height: 20 });
});

test('an unreadable function is skipped, never thrown on', () => {
  nearBox(g.boxInUserSpace(UNIT, ['ref(svg) translate(5 0)']), { x: 5, y: 0, width: 10, height: 20 });
  nearBox(g.boxInUserSpace(UNIT, ['translate()']), UNIT);
  nearBox(g.boxInUserSpace(UNIT, ['not a transform at all']), UNIT);
});

test('skew leans the box and widens what it covers', () => {
  const leaned = g.boxInUserSpace({ x: 0, y: 0, width: 10, height: 10 }, ['skewX(45)']);
  near(leaned.width, 20);
  near(leaned.height, 10);
});

test("the owner's quiz board: the question plate is a wide band, not a tall one", () => {
  // Straight out of e2e/fixtures/svg-corpus/home-made/quizbgchess2.svg.
  const local = { x: 715.43, y: -458.56, width: 230.59, height: 1233.2 };
  const painted = g.boxInUserSpace(local, ['translate(653.61 984.91) rotate(-88.68)']);
  near(painted.width, 1238.2, 0.5);
  near(painted.height, 258.9, 0.5);
  // Where it sits on a 1570 x 700 artboard - inside it, which is what tells the growth cap how
  // much margin the design left.
  near(painted.x, 211.7, 0.5);
  near(painted.y, 28.6, 0.5);
  // And the answer to beat: reading the attributes alone said 231 x 1233, a portrait plate.
  assert.notEqual(Math.round(painted.width), Math.round(local.width));
});
