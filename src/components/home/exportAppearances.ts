// PLACE AND SIZE FOR A PACKAGE (docs/work-specs/playout-adjustments/spec.md, phase 1b): the export
// dialog measures each adjusted graphic once, with the values its package loads with, and each of
// its cues with the cue's own values when the package carries a controller, then resolves through
// control/exportAppearance.ts. One hidden frame at a time (./measureCue.ts); a fold that needs no
// box (a nudge alone) is never measured.

import { adjustedGraphics, exportAppearances, needsBox, type ExportAppearances } from '../../control/exportAppearance';
import type { Measurement } from '../../control/cueAdjust';
import { activeEntryValues } from '../../export/showExport';
import { loadGraphics, templateForSavedGraphic } from '../../model/library';
import type { Show } from '../../model/shows';
import { measureCue } from './measureCue';

/** Only this target's package has a controller that sends a cue's own appearance. */
export const CUE_APPEARANCE_TARGET = 'html-overlay';

export async function measureExportAppearances(show: Show, targetId: string): Promise<ExportAppearances | undefined> {
  const cues = show.cues ?? [];
  const adjusted = adjustedGraphics(show.graphics, cues);
  if (adjusted.length === 0) return undefined;
  const lib = loadGraphics();
  const graphics: Record<string, Measurement | null> = {};
  const measured: Record<string, Measurement | null> = {};
  for (const g of adjusted) {
    const template = templateForSavedGraphic(g, lib);
    if (needsBox(g.adjust)) graphics[g.id] = await measureCue(template, activeEntryValues(g, lib));
    if (targetId !== CUE_APPEARANCE_TARGET) continue;
    for (const c of cues) {
      if (c.sourceId === g.id && c.source !== 'playout' && needsBox(g.adjust, c.adjust)) measured[c.id] = await measureCue(template, c.values);
    }
  }
  const pool = new Map(show.graphics.map((g) => [g.id, g]));
  return exportAppearances(show, (id) => templateForSavedGraphic(pool.get(id)!, lib).resolution, { graphics, cues: measured });
}
