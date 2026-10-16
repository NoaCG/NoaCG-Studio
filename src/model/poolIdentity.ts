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
// Pool names still stay unique: the output, its cues, the live state, packs and exports key pool
// graphics by name. When the two meet, the production's own picture graphic is the one that takes
// a free name, because nothing finds it by its name.
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

/** `base`, or `base 2`, `base 3`... whichever is first not in `taken`. */
export function freeName(taken: Iterable<string>, base: string): string {
  const used = new Set(taken);
  let name = base;
  for (let n = 2; used.has(name); n += 1) name = `${base} ${n}`;
  return name;
}

/**
 * Where adding `incoming` lands in the pool: the index it replaces (-1 adds it as a new graphic),
 * the name it takes, and a pool graphic to move to a free name first. A name match replaces only
 * when both are the production's own picture graphic or neither is.
 */
export function poolPlacement(
  pool: readonly PoolGraphicIdentity[],
  incoming: PoolGraphicIdentity,
): { replace: number; name: string; rename: { index: number; name: string } | null } {
  const own = isOwnPictureGraphic(incoming);
  const replace = pool.findIndex((g) => g.name === incoming.name && isOwnPictureGraphic(g) === own);
  const holder = replace >= 0 ? -1 : pool.findIndex((g) => g.name === incoming.name);
  if (holder < 0) return { replace, name: incoming.name, rename: null };
  const free = freeName(pool.map((g) => g.name), incoming.name);
  return own ? { replace, name: free, rename: null } : { replace, name: incoming.name, rename: { index: holder, name: free } };
}
