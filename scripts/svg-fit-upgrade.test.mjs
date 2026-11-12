// guards: src/assets/svgFitUpgrade.ts, src/templates/importedDesign/runtime/svgFit.js, src/blocks/animMigration.ts
//
// The score-size fix (#2355) reaches graphics saved before it: prepareOutRuntime swaps the two
// pre-#2355 fit passages for the live ones, and touches nothing else.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SVG_FIT_CENTRED_V1,
  SVG_FIT_CENTRED_V2,
  SVG_FIT_CONTAINER_V1,
  SVG_FIT_CONTAINER_V2,
  upgradeSvgFitRuntime,
} from '../src/assets/svgFitUpgrade.ts';

// The runtime as a graphic imported today carries it: the class prefix filled in.
const live = readFileSync(new URL('../src/templates/importedDesign/runtime/svgFit.js', import.meta.url), 'utf8')
  .replace(/__PREFIX__/g, 'imported-design');
const count = (text, part) => text.split(part).length - 1;

test('the upgraded passages are the live runtime, word for word', () => {
  assert.equal(count(live, SVG_FIT_CONTAINER_V2), 1, 'the panel search and its two helpers');
  assert.equal(count(live, SVG_FIT_CENTRED_V2), 1, 'the centred figure rule');
  assert.equal(count(live, SVG_FIT_CONTAINER_V1), 0);
  assert.equal(count(live, SVG_FIT_CENTRED_V1), 0);
});

test('a graphic saved before #2355 gets the live fit through prepareOutRuntime', () => {
  const saved = live.replace(SVG_FIT_CONTAINER_V2, SVG_FIT_CONTAINER_V1).replace(SVG_FIT_CENTRED_V2, SVG_FIT_CENTRED_V1);
  assert.notEqual(saved, live);
  assert.equal(upgradeSvgFitRuntime(saved), live);
  // Every preview, save and export reaches it through prepareOutRuntime (whose module's
  // extensionless imports keep it out of a plain node test): the call is its second statement.
  const migration = readFileSync(new URL('../src/blocks/animMigration.ts', import.meta.url), 'utf8');
  assert.match(migration, /export function prepareOutRuntime\(js: string\): string \{\n[^\n]*\n  js = upgradeSvgFitRuntime\(js\);/);
  assert.equal(upgradeSvgFitRuntime(saved.replace(/\n/g, '\r\n')), live, 'a Windows-saved file too');
});

test('anything else is left exactly as it is', () => {
  assert.equal(upgradeSvgFitRuntime(live), live, 'already upgraded');
  const half = live.replace(SVG_FIT_CONTAINER_V2, SVG_FIT_CONTAINER_V1);
  assert.equal(upgradeSvgFitRuntime(half), half, 'only one old passage: someone edited it, keep it');
  const other = 'function update(d) { return d; }\n';
  assert.equal(upgradeSvgFitRuntime(other), other);
});
