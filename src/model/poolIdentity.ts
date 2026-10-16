// WHICH POOL GRAPHIC A NAME MAY STAND FOR (issue #1055).
//
// A production's pool matches graphics by NAME in two places: a publish resolves a copy with no
// library link to the library record of that name (library.ts `resolveSavedGraphicDoc`), and adding
// a graphic replaces the pool graphic of that name (shows.ts `addGraphicToShow`). Both exist for
// copies of LIBRARY graphics. The production's own picture graphic, the one Upload image adds to,
// was never a library copy: it has no link and its pictures live only in the pool. Picture graphics
// arrived after the library link did, so every library picture graphic in a pool carries its link,
// and a picture graphic without one is always the production's own. A library graphic that later
// takes the same name is a different graphic, so neither lookup may hand it the production's.
//
// Pure, no value imports, so scripts/picture-target.test.mjs runs it in Node.

interface PoolGraphicIdentity {
  name: string;
  type: string;
  graphicId?: string | null;
}

/** The production's own picture graphic: a picture graphic with no library link. */
export function isOwnPictureGraphic(graphic: { type: string; graphicId?: string | null }): boolean {
  return graphic.type === 'picture' && !graphic.graphicId;
}

/** The index of the pool graphic that adding `incoming` replaces, or -1 to add it as a new one. A
 *  name match counts only when both are the production's own picture graphic or neither is. */
export function poolGraphicToReplace(pool: readonly PoolGraphicIdentity[], incoming: PoolGraphicIdentity): number {
  const own = isOwnPictureGraphic(incoming);
  return pool.findIndex((g) => g.name === incoming.name && isOwnPictureGraphic(g) === own);
}
