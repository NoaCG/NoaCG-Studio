// Where a community pack's graphics come from (docs/work-specs/community-packs/spec.md D7): the
// maker's Home folders and personal productions, and only the graphics the maker made - never a
// team production (another member's work) and never a graphic installed from the shelf.

import { loadGraphics, templateForSavedGraphic, type GraphicDoc } from '../model/library';
import { graphicLayer, loadShows } from '../model/shows';
import { ownGraphic, ownLibrarySource, type PackSource } from './librarySource';

export type { LibrarySource, PackSource, SourceGraphic } from './librarySource';

/** A pool graphic is the maker's own unless it links to a library record that is stamped, or to
 *  one this library does not hold (a teammate's graphic in a personal copy of a team production,
 *  or an install whose records were deleted). A copy with no link at all was made here. */
const ownPooled = (graphicId: string | undefined, byId: Map<string, GraphicDoc>) =>
  graphicId === undefined || (byId.has(graphicId) && ownGraphic(byId.get(graphicId)));

/** Every folder and personal production holding at least one graphic the maker may submit. */
export function packSources(): PackSource[] {
  const library = loadGraphics();
  const byId = new Map(library.map((g) => [g.id, g]));
  const folders = new Map<string, GraphicDoc[]>();
  for (const g of library) {
    if (!g.folder) continue;
    const list = folders.get(g.folder) ?? [];
    list.push(g);
    folders.set(g.folder, list);
  }
  const sources: PackSource[] = [...folders.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, docs]) => ownLibrarySource(docs, name).source)
    .filter((s) => s.graphics.length > 0);

  for (const show of loadShows()) {
    if (show.teamId) continue;
    const graphics = show.graphics
      .filter((g) => ownPooled(g.graphicId, byId))
      .map((g) => ({ key: g.id, name: g.name, template: templateForSavedGraphic(g, library), layer: graphicLayer(g) }));
    if (graphics.length) sources.push({ id: `production:${show.id}`, kind: 'production', name: show.name, graphics });
  }
  return sources;
}
