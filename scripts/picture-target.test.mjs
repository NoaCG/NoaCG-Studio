// guards: src/templates/pictureTarget.ts, src/model/poolIdentity.ts
//
// ADDING A PICTURE ON THE PRODUCTION PAGE KEEPS EVERY LIBRARY LINK (issue #762). The upload adds to
// the production's own picture graphic. One pooled from the library is left as it is: re-pooling it
// with the new picture used to drop its `graphicId`, and the picture still did not air, because a
// publish resolves that graphic out of the library. Pure, run here in Node.

import test from 'node:test';
import assert from 'node:assert/strict';

const { pictureUploadTarget } = await import('../src/templates/pictureTarget.ts');
const { isOwnPictureGraphic, poolPlacement } = await import('../src/model/poolIdentity.ts');

const lowerThird = { id: 'p1', name: 'Lower third', type: 'lower-third', graphicId: 'lib-lt' };
const ownPictures = { id: 'p2', name: 'Pictures', type: 'picture' };
const libraryPictures = { id: 'p3', name: 'Pictures', type: 'picture', graphicId: 'lib-pics' };

test('the production adds to its own picture graphic', () => {
  assert.equal(pictureUploadTarget([lowerThird, ownPictures], ['Lower third'], 'Pictures').existing, ownPictures);
});

test('a picture graphic pooled from the library is never the target, so its link stays', () => {
  const target = pictureUploadTarget([lowerThird, libraryPictures], ['Lower third', 'Pictures'], 'Pictures');
  assert.equal(target.existing, null);
  assert.equal(target.name, 'Pictures 2');
  // Beside one of the production's own, that one is still the target.
  assert.equal(pictureUploadTarget([libraryPictures, { ...ownPictures, name: 'Pictures 2' }], ['Pictures'], 'Pictures').existing.name, 'Pictures 2');
});

test('a new picture graphic is named free of the library and of the pool', () => {
  // The library record was renamed, so only the pool still holds "Pictures": replacing by that name
  // would overwrite the linked graphic.
  assert.equal(pictureUploadTarget([libraryPictures], ['Holding slides'], 'Pictures').name, 'Pictures 2');
  assert.equal(pictureUploadTarget([lowerThird], ['Pictures', 'Pictures 2'], 'Pictures').name, 'Pictures 3');
  assert.equal(pictureUploadTarget([], [], 'Pictures').name, 'Pictures');
});

// A LIBRARY GRAPHIC OF THE SAME NAME NEVER CAPTURES THE PRODUCTION'S OWN PICTURE GRAPHIC (issue
// #1055). A "Pictures" saved or imported into the library after the upload used to take over the
// production's graphic of that name: a publish resolved it to the library record, and adding that
// library graphic replaced it in the pool. Either way the uploaded pictures stopped airing.

test('adding a same-named library graphic keeps the production picture graphic and adds a separate one', () => {
  const pool = [lowerThird, ownPictures];
  for (const incoming of [
    { name: 'Pictures', type: 'lower-third', graphicId: 'lib-other' },
    { name: 'Pictures', type: 'picture', graphicId: 'lib-pics' },
  ]) {
    // Added as a new graphic under its library name; the production's own one moves to a free
    // name, because the output and the live state key pool graphics by name.
    assert.deepEqual(poolPlacement(pool, incoming), { replace: -1, name: 'Pictures', rename: { index: 1, name: 'Pictures 2' } });
  }
  // An upload still adds to the production's own one, also when a library copy sits first.
  const mixed = [libraryPictures, lowerThird, { ...ownPictures, name: 'Pictures 2' }];
  assert.deepEqual(poolPlacement(mixed, { name: 'Pictures 2', type: 'picture' }), { replace: 2, name: 'Pictures 2', rename: null });
  // And an unlinked picture graphic arriving under a library copy's name never replaces that copy.
  assert.deepEqual(poolPlacement([libraryPictures], { name: 'Pictures', type: 'picture' }), { replace: -1, name: 'Pictures 2', rename: null });
});

test('adding a library graphic again still updates its copy in place', () => {
  const pool = [lowerThird, libraryPictures, { ...ownPictures, name: 'Pictures 2' }];
  assert.deepEqual(poolPlacement(pool, { name: 'Pictures', type: 'picture', graphicId: 'lib-pics' }), { replace: 1, name: 'Pictures', rename: null });
  assert.deepEqual(poolPlacement(pool, { name: 'Lower third', type: 'lower-third', graphicId: 'lib-lt' }), { replace: 0, name: 'Lower third', rename: null });
  // A copy from before the library link is still matched by its name.
  assert.equal(poolPlacement([{ id: 'p9', name: 'Score', type: 'scoreboard' }], { name: 'Score', type: 'scoreboard', graphicId: 'lib-s' }).replace, 0);
});

test('only the production picture graphic is its own: no library name stands for it', () => {
  assert.equal(isOwnPictureGraphic(ownPictures), true);
  assert.equal(isOwnPictureGraphic(libraryPictures), false);
  assert.equal(isOwnPictureGraphic({ name: 'Score', type: 'scoreboard' }), false);
});
