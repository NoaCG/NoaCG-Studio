// WHICH PICTURE GRAPHIC AN UPLOAD ON THE PRODUCTION PAGE ADDS TO (templates/picture.ts).
//
// The production's own: the pool's picture graphic with NO library link. A picture graphic pooled
// FROM the library (a graphics pack can carry one) is a document the production only references.
// Uploading into it used to re-pool it without its `graphicId`, which cut the link the hosted
// control page and the library's production filter follow, and the new pictures still did not air:
// a publish resolves that graphic's template out of the library, by name once the link is gone
// (issue #762). So such a graphic is left as it is and the upload makes the production a picture
// graphic of its own beside it.
//
// A new one is named so that neither lookup by name can capture it: free in the library (the
// publish's name fallback, `resolveSavedGraphicDoc`) and free in the pool (`addGraphicToShow`
// replaces by name).
//
// Pure, importing only the pure ../model/poolIdentity.ts, so scripts/picture-target.test.mjs runs it
// in Node.

import { freeName, isOwnPictureGraphic } from '../model/poolIdentity.ts';

/** The production's own picture graphic to add to (`existing`, keeping its name), or null and the
 *  name for a new one. */
export function pictureUploadTarget<G extends { name: string; type: string; graphicId?: string | null }>(
  pool: readonly G[],
  libraryNames: Iterable<string>,
  baseName: string,
): { existing: G | null; name: string } {
  const existing = pool.find(isOwnPictureGraphic);
  if (existing) return { existing, name: existing.name };
  return { existing: null, name: freeName([...libraryNames, ...pool.map((g) => g.name)], baseName) };
}
