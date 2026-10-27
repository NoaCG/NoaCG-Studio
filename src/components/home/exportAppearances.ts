// PLACE AND SIZE FOR A PACKAGE (docs/work-specs/playout-adjustments/spec.md, phase 1b): the export
// dialog measures each adjusted graphic with the values its package loads with (the overlay's
// baked sample, the definition's defaults everywhere else), and each of its cues with the cue's own
// values when the package carries a controller, each in the type its fold sets, then resolves through
// control/exportAppearance.ts. One hidden frame at a time (./measureCue.ts), each document and set
// of values once; a fold that needs no box (a nudge up or down alone) is never measured.

import { adjustedGraphics, exportAppearances, needsBox, type ExportAppearances } from '../../control/exportAppearance';
import { appearanceOf, effectiveAdjust, measureStyleKey, type Measurement } from '../../control/cueAdjust';
import { activeEntryValues, CONTROLLER_TARGET } from '../../export/showExport';
import { loadGraphics, templateForSavedGraphic } from '../../model/library';
import type { Show } from '../../model/shows';
import { measureCue, type PreviewStyle } from './measureCue';
import { assetDataIn, facesCss, resolveStyle } from '../../control/cueStyle';
import { lookForOf, lookStyleContext, withLookAssets } from '../../control/productionLook';

export async function measureExportAppearances(show: Show, targetId: string): Promise<ExportAppearances | undefined> {
  const cues = show.cues ?? [];
  const lib = loadGraphics();
  const pool = show.graphics.map((g) => templateForSavedGraphic(g, lib));
  // The production look, as on air: each graphic takes what its stylesheet paints with.
  const lookFor = lookForOf(show, pool);
  const adjusted = adjustedGraphics(show.graphics, cues, lookFor);
  if (adjusted.length === 0) return undefined;
  const templates = new Map(show.graphics.map((g, i) => [g.id, pool[i]] as const));
  const imported = lookStyleContext(show, pool).imported;
  const assetData = assetDataIn(withLookAssets(show, pool));
  // Each box in the type it will be drawn in: a face or a weight moves the text, so the fold's
  // style goes into the hidden document and into the key (a colour does neither).
  const styleOf = (graphicId: string, graphicAdjust: unknown, cueAdjust?: unknown): PreviewStyle | null => {
    const style = resolveStyle(effectiveAdjust(graphicAdjust, cueAdjust, lookFor?.(graphicId)), imported);
    return style ? { id: measureStyleKey(appearanceOf(null, style)), vars: style.vars ?? null, faces: facesCss(style.fonts, assetData) } : null;
  };
  const seen = new Map<string, Promise<Measurement | null>>();
  const measure = (graphicId: string, values: Record<string, string>, style: PreviewStyle | null) => {
    const key = `${graphicId}\n${JSON.stringify(values)}\n${style?.id ?? ''}`;
    if (!seen.has(key)) seen.set(key, measureCue(templates.get(graphicId)!, values, style));
    return seen.get(key)!;
  };
  const graphics: Record<string, Measurement | null> = {};
  const measured: Record<string, Measurement | null> = {};
  for (const g of adjusted) {
    if (needsBox(g.adjust)) graphics[g.id] = await measure(g.id, targetId === CONTROLLER_TARGET ? activeEntryValues(g, lib) : {}, styleOf(g.id, g.adjust));
    if (targetId !== CONTROLLER_TARGET) continue;
    for (const c of cues) {
      if (c.sourceId === g.id && c.source !== 'playout' && needsBox(g.adjust, c.adjust)) measured[c.id] = await measure(g.id, c.values, styleOf(g.id, g.adjust, c.adjust));
    }
  }
  return exportAppearances(show, (id) => templates.get(id)!.resolution, { graphics, cues: measured }, imported, lookFor);
}
