// guards: src/templates/importedDesign/behaviour.ts, src/templates/behaviours/rotation.ts
//
// WHICH FIELDS A ROTATION'S SLIDE COVERS (svg-template-library TL6, Rule T3): a field belongs to
// slide k when it is one of a SET named for slide 1 and another slide (`Story 1`, `Story 2`). A
// lone number is not a set: the importer numbers a repeated name from its second copy
// (`Kicker 2`) and names an unnamed layer `Text 3`, and neither may vanish with a slide.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function load(rel) {
  const bundle = await rolldown({ input: path.join(root, rel), platform: 'neutral', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  return import(`data:text/javascript;base64,${Buffer.from(output[0].code, 'utf8').toString('base64')}`);
}

const { rowFieldOwners } = await load('src/templates/importedDesign/behaviour.ts');
const fields = (...titles) => titles.map((title, i) => ({ field: `f${i}`, title }));
const owners = (titles, rows) => Object.fromEntries(rowFieldOwners(fields(...titles), rows));

test('a set named for every slide belongs to the slides, one field each', () => {
  assert.deepEqual(owners(['Label', 'Story 1', 'Story 2', 'Story 3'], ['1', '2', '3']), { f1: '1', f2: '2', f3: '3' });
  // Several sets on one slide, and pictures alike (an `f:` prefix is gone from the title).
  assert.deepEqual(owners(['Headline 1', 'Details 1', 'Headline 2', 'Details 2', 'Sponsor 1', 'Sponsor 2'], ['1', '2']), { f0: '1', f1: '1', f2: '2', f3: '2', f4: '1', f5: '2' });
});

test('a lone number is not a set: a repeated name, an unnamed layer and a title for one slide stay on air', () => {
  // The importer's second copy of a repeated name, with no `Kicker 1`.
  assert.deepEqual(owners(['Story 1', 'Story 2', 'Kicker', 'Kicker 2'], ['1', '2']), { f0: '1', f1: '2' });
  // Unnamed layers, which the importer names `Text n` and `Picture n`, even as a full set.
  assert.deepEqual(owners(['Text 1', 'Text 2', 'Picture 1', 'Picture 2', 'Story 1', 'Story 2'], ['1', '2']), { f4: '1', f5: '2' });
  // A name used for slide 1 alone, or for another slide alone.
  assert.deepEqual(owners(['Hall 1', 'Room 2', 'Story 1', 'Story 2'], ['1', '2']), { f2: '1', f3: '2' });
});

test('a number is read whole, and the case of a name does not matter', () => {
  assert.deepEqual(owners(['Story 1', 'story 2', 'Story 11', 'Story 12'], ['1', '2']), { f0: '1', f1: '2' });
});
