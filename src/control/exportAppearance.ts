// PLACE, SIZE, TYPE AND COLOUR IN A PACKAGE (docs/work-specs/playout-adjustments/spec.md, phases 1b
// and 2): what the production export bakes into each graphic's files and what the exported
// controller's cues carry. Style needs no box: it resolves from the record alone.
//
// A package has no `/output` stage: each graphic is a page of its own, at its own resolution, so a
// preset resolves against that page's safe area (the graphic's frame is its stage). For a graphic
// at the production's resolution, the usual case, that is exactly the `/output` stage.
//
// - THE GRAPHIC LEVEL is the pool graphic's default alone, resolved against the box the graphic
//   shows with the values its package loads with: what an overlay, a CasparCG or SPX template and
//   an OGraf Graphic show before anyone sends a cue (`bakeAppearance`, ./appearanceRuntime.ts).
// - THE CUE LEVEL is each cue's fold (its exception over the default) against its own box: what the
//   exported controller's Take and ✎ Update carry on the relay, which replaces the bake (rule 3).
//   An identity travels when nothing moves, so a cue at the authored place takes a moved sibling's
//   placement off (rule 2).
// - A graphic with no record at either scope gets nothing at all: its files, its relay receiver and
//   its cues stay what they always were (AC-10).
//
// Pure and Node-tested (scripts/cue-adjust.test.mjs); the measuring is the caller's.

import { appearanceOf, effectiveAdjust, resolveFrame, type AppliedAppearance, type Measurement, type Size } from './cueAdjust.ts';
import { resolveStyle, type ImportedFace } from './cueStyle.ts';

/** The baked default per pool graphic id, and the appearance per cue id. */
export interface ExportAppearances {
  graphics: Record<string, AppliedAppearance>;
  cues: Record<string, AppliedAppearance>;
}

interface PoolGraphic {
  id: string;
  adjust?: unknown;
}

interface RundownCue {
  id: string;
  sourceId: string;
  source?: string;
  adjust?: unknown;
}

/** A graphic cue with place and size of its own (a playout-server clip has none). */
export const cueAdjusted = (c: Omit<RundownCue, 'id' | 'sourceId'>) => c.source !== 'playout' && c.adjust !== undefined;

/** The pool graphics that hold place and size at either scope. */
export function adjustedGraphics<G extends PoolGraphic>(graphics: readonly G[], cues: readonly RundownCue[]): G[] {
  return graphics.filter((g) => g.adjust !== undefined || cues.some((c) => c.sourceId === g.id && cueAdjusted(c)));
}

/** Whether a fold needs a box to resolve: a preset, a size about the box's own point, or a
 *  sideways nudge, which a band spanning the frame drops (`resolveFrame`), as on the stage. */
export function needsBox(graphicAdjust: unknown, cueAdjust?: unknown): boolean {
  const eff = effectiveAdjust(graphicAdjust, cueAdjust);
  return eff.place !== undefined || (eff.scale !== undefined && eff.scale !== 1) || (eff.x ?? 0) !== 0;
}

/** Resolve every adjusted graphic and its cues; undefined when the production holds none. */
export function exportAppearances(
  show: { graphics: readonly PoolGraphic[]; cues?: readonly RundownCue[] },
  frameOf: (graphicId: string) => Size,
  measured: { graphics: Readonly<Record<string, Measurement | null>>; cues: Readonly<Record<string, Measurement | null>> },
  /** The imported faces the production ships (phase 2's style resolves a face by identity). */
  imported: readonly ImportedFace[] = [],
): ExportAppearances | undefined {
  const cues = show.cues ?? [];
  const adjusted = adjustedGraphics(show.graphics, cues);
  if (adjusted.length === 0) return undefined;
  const out: ExportAppearances = { graphics: {}, cues: {} };
  for (const g of adjusted) {
    const frame = frameOf(g.id);
    const own = effectiveAdjust(g.adjust, undefined);
    out.graphics[g.id] = appearanceOf(resolveFrame(own, measured.graphics[g.id] ?? null, frame, frame), resolveStyle(own, imported));
    for (const c of cues) {
      if (c.sourceId !== g.id || c.source === 'playout') continue;
      const fold = effectiveAdjust(g.adjust, c.adjust);
      out.cues[c.id] = appearanceOf(resolveFrame(fold, measured.cues[c.id] ?? null, frame, frame), resolveStyle(fold, imported));
    }
  }
  return out;
}
