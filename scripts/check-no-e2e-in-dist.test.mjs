// gate: build
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findMarkers, MARKERS } from './check-no-e2e-in-dist.mjs';

test('a production bundle holding any e2e marker is named, file and marker', () => {
  for (const [word] of MARKERS) {
    const found = findMarkers([['dist/assets/a.js', `x=1;${word};y=2`]]);
    assert.equal(found.length, 1, word);
    assert.match(found[0], /^dist\/assets\/a\.js: /);
  }
});

test('a bundle without the markers passes', () => {
  assert.deepEqual(findMarkers([['dist/assets/a.js', 'window.noacgImport=1;const e2e=false']]), []);
});
