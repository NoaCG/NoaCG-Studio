// THE IMPORT GRAPHIC CARD'S DROP DOORS: what a dropped SVG, picture or template file does to the
// wizard's draft. The shell (CreationWizard.tsx) calls these through `./index.ts` and applies
// what they return; it owns the walk (which import mode a drop switches to) and the brand in
// force, which it spreads over the patch through `brandOrClearPatch` (draft/template.ts), so
// this folder takes only the shared draft's types, never its code. Node-tested in
// scripts/import-drop.test.mjs.

import type { AssetFile } from '../../../model/types';
import type { DesignArt } from '../../../model/wizard';
import type { SvgImportResult } from '../../../assets/svgImport';
import type { ImportedTemplateResult } from '../../../model/importTemplate';
import type { DraftPatch } from '../draft/core';
import { svgDraftCleared, svgDraftFromImport } from './draft';

/** A dropped SVG: the draft the mapping step opens on. The SVG road's own function decides it
 *  (fit to the frame, furniture last, the `f:` and `static:` prefixes, the name from the file),
 *  so the shell, the corpus harness and every test build the same draft. */
export function svgDropPatch(
  result: SvgImportResult,
  ctx: Parameters<typeof svgDraftFromImport>[1],
): DraftPatch {
  return svgDraftFromImport(result, ctx);
}

/** The SVG taken back: every answer its drop gave is cleared, and the name it gave goes with it. */
export function clearSvgPatch(draft: Parameters<typeof svgDraftCleared>[0]): DraftPatch {
  return svgDraftCleared(draft);
}

/** A dropped picture: the raster prepare-and-place walk starts over on this artwork. */
export function artDropPatch(designArt: DesignArt, importedImages: AssetFile[]): DraftPatch {
  return {
    // A raster drop replaces any SVG from this walk (and an SVG drop replaces the raster state).
    designSvg: null,
    svgFields: [],
    svgImages: [],
    svgOutlines: [],
    svgBehaviour: null,
    svgExtras: [],
    svgStretch: { on: false, shapeId: null },
    svgFonts: [],
    designArt,
    importedImages,
    // A fresh drop resets the Prepare step: the pristine pixels become the erase's source, and
    // any erase from a previous artwork is meaningless.
    designOriginal: importedImages[0] ?? null,
    designErases: [],
    designKeepBakedText: false,
    designFields: [],
    category: 'imported-design',
    // There is no design to choose (the artwork IS it), so the variant is settled here, and the
    // graphic creates BARE: its fields are added as real placed layers.
    variantId: 'imp01',
    lines: [],
    zone: null,
    animation: { presetId: null, outPresetId: null },
  };
}

/** What reading a dropped template file came to: the file, or the message the card shows. */
export type TemplateFileDrop = { ok: true; file: ImportedTemplateResult } | { ok: false; error: string };

/** A dropped finished template (.html or a package). The reader is injected (it unzips and
 *  parses, `model/importTemplate.ts`), and its refusal becomes the card's message; it never
 *  throws. */
export async function templateFileDropped(
  file: File,
  io: { importTemplateFile: (file: File) => Promise<ImportedTemplateResult> },
): Promise<TemplateFileDrop> {
  try {
    return { ok: true, file: await io.importTemplateFile(file) };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
