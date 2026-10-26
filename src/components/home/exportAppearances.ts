// PLACE AND SIZE FOR A PACKAGE (docs/work-specs/playout-adjustments/spec.md, phase 1b): the export
// dialog measures each adjusted graphic with the values its package loads with (the overlay's
// baked sample, the definition's defaults everywhere else), and each of its cues with the cue's own
// values when the package carries a controller, then resolves through
// control/exportAppearance.ts. One hidden frame at a time (./measureCue.ts), each document and set
// of values once; a fold that needs no box (a nudge up or down alone) is never measured.

import { adjustedGraphics, exportAppearances, needsBox, type ExportAppearances } from '../../control/exportAppearance';
import type { Measurement } from '../../control/cueAdjust';
import { activeEntryValues, CONTROLLER_TARGET } from '../../export/showExport';
import { loadGraphics, templateForSavedGraphic } from '../../model/library';
import type { Show } from '../../model/shows';
import { measureCue } from './measureCue';

export async function measureExportAppearances(show: Show, targetId: string): Promise<ExportAppearances | undefined> {
  const cues = show.cues ?? [];
  const adjusted = adjustedGraphics(show.graphics, cues);
  if (adjusted.length === 0) return undefined;
  const lib = loadGraphics();
  const templates = new Map(adjusted.map((g) => [g.id, templateForSavedGraphic(g, lib)]));
  const seen = new Map<string, Promise<Measurement | null>>();
  const measure = (graphicId: string, values: Record<string, string>) => {
    const key = `${graphicId}\n${JSON.stringify(values)}`;
    if (!seen.has(key)) seen.set(key, measureCue(templates.get(graphicId)!, values));
    return seen.get(key)!;
  };
  const graphics: Record<string, Measurement | null> = {};
  const measured: Record<string, Measurement | null> = {};
  for (const g of adjusted) {
    if (needsBox(g.adjust)) graphics[g.id] = await measure(g.id, targetId === CONTROLLER_TARGET ? activeEntryValues(g, lib) : {});
    if (targetId !== CONTROLLER_TARGET) continue;
    for (const c of cues) {
      if (c.sourceId === g.id && c.source !== 'playout' && needsBox(g.adjust, c.adjust)) measured[c.id] = await measure(g.id, c.values);
    }
  }
  return exportAppearances(show, (id) => templates.get(id)!.resolution, { graphics, cues: measured });
}
