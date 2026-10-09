// A community pack's source taken from the maker's Home library (docs/work-specs/community-packs/
// spec.md D7, slice-4-research.md (a)): a folder or a selection of graphics, keeping only the
// graphics the maker made. A graphic installed from the shelf carries a `fromPack` stamp and is
// left out, and the count left out is kept so the sheet can say so rather than drop it silently.
//
// Pure, importing only graphicDoc's stamp check, so a node test can load it as it is.

import type { GraphicDoc } from '../model/library';
import type { SpxTemplate } from '../model/types';
import { designLocked } from '../model/graphicDoc.ts';

export interface SourceGraphic {
  key: string;
  name: string;
  template: SpxTemplate;
  layer?: number;
}

export interface PackSource {
  /** `folder:<name>`, `production:<id>` or `selection`. */
  id: string;
  kind: 'folder' | 'production' | 'selection';
  name: string;
  graphics: SourceGraphic[];
}

export interface LibrarySource {
  source: PackSource;
  /** How many of the graphics asked for were installed from Community packs and left out. */
  leftOut: number;
}

/** The maker's own graphic: one not installed from Community packs. */
export const ownGraphic = (doc: GraphicDoc | undefined): boolean => !designLocked(doc);

/** The maker's own graphics among `docs`, as one pack source. With `folder` it is that folder;
 *  without, a selection, named after its folder when every graphic in it shares one. */
export function ownLibrarySource(docs: GraphicDoc[], folder?: string): LibrarySource {
  const own = docs.filter((d) => ownGraphic(d));
  const graphics = own.map((d) => ({ key: d.id, name: d.name, template: d.template }));
  const leftOut = docs.length - own.length;
  if (folder !== undefined) return { source: { id: `folder:${folder}`, kind: 'folder', name: folder, graphics }, leftOut };
  const shared = docs[0]?.folder;
  const name = shared && docs.every((d) => d.folder === shared) ? shared : '';
  return { source: { id: 'selection', kind: 'selection', name, graphics }, leftOut };
}
