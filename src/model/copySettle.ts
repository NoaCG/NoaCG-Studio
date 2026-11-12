// THE SEND-TIME SETTLE (live-publishing W2, docs/work-specs/live-publishing/designs/G1.md section 3).
//
// The production's copy of each graphic is the only truth. A page built before that rule (an "old
// build") could still pull a library design into a copy: its publish copied newer library designs
// in, and adding a held graphic again replaced the copy's design. Such a write never sets the
// design stamp (`designAt`), so the copy reads unstamped.
//
// Before any send of a production record (a team save, a move to a team, a personal sync push, a
// publish, an export), every copy that the base (the server's copy of the same production) also
// holds is settled: an unstamped copy whose design differs from the base's takes the base's design
// members, all four together, so a pulled design is dropped. A stamped copy is a copy-truth build's
// own design change and stays; so does a copy the base does not hold (an added graphic) and the
// one old-page design edit E3 keeps, the exact own-reader removal (its script is the base's with
// the Sheet block stripped). The template's own `name` is placement: it is left out of every
// comparison and always set to the pool name.
//
// Pure: no storage and no clock beyond the stamp it is given (scripts/copy-settle.test.mjs).

import type { SavedGraphic } from './packets';
import type { SpxTemplate } from './types';
import { canonical } from './publishedRecord.ts';
import { stripLiveData } from './liveDataMark.ts';

/** The design members of a copy (designs/G1.md, Terms). */
export const DESIGN_MEMBERS = ['template', 'savedAt', 'designAt', 'graphicId'] as const;

/** A copy whose design a copy-truth build set. */
export function stamped(g: Pick<SavedGraphic, 'savedAt' | 'designAt'>): boolean {
  return g.designAt !== undefined && g.designAt === g.savedAt;
}

/** Two templates are the same design when they are equal apart from their own `name`. */
export function sameTemplate(a: SpxTemplate, b: SpxTemplate): boolean {
  return a === b || canonical({ ...a, name: '' }) === canonical({ ...b, name: '' });
}

/** The design members of two copies are equal (`template.name` aside). */
export function sameDesign(a: SavedGraphic, b: SavedGraphic): boolean {
  return a.savedAt === b.savedAt && a.designAt === b.designAt && a.graphicId === b.graphicId && sameTemplate(a.template, b.template);
}

/** The exact own-reader removal (data-sources C6): the copy's template is the base's except its
 *  script, and that script is the base's with the Sheet block stripped. */
export function isOwnReaderRemoval(copy: SpxTemplate, base: SpxTemplate): boolean {
  const js = base.js ?? '';
  const stripped = stripLiveData(js);
  if (stripped === js || (copy.js ?? '') !== stripped) return false;
  return sameTemplate({ ...copy, js: '' }, { ...base, js: '' });
}

/** `graphic` carrying `from`'s design members, its own placement, and the pool name. */
export function withDesignOf(graphic: SavedGraphic, from: SavedGraphic): SavedGraphic {
  const next: SavedGraphic = { ...graphic, template: { ...from.template, name: graphic.name }, savedAt: from.savedAt };
  if (from.designAt === undefined) delete next.designAt;
  else next.designAt = from.designAt;
  if (from.graphicId === undefined) delete next.graphicId;
  else next.graphicId = from.graphicId;
  return next;
}

/**
 * Settle `graphics` against `base`. Answers the graphics to send and whether any copy changed.
 * `at` stamps a kept own-reader removal.
 */
export function settleGraphics(
  graphics: readonly SavedGraphic[],
  base: readonly SavedGraphic[] | null,
  at: string,
): { graphics: SavedGraphic[]; changed: boolean } {
  if (!base) return { graphics: [...graphics], changed: false };
  const byId = new Map(base.map((g) => [g.id, g]));
  let changed = false;
  const out = graphics.map((g) => {
    const b = byId.get(g.id);
    if (!b || stamped(g) || sameDesign(g, b)) return g;
    changed = true;
    if (isOwnReaderRemoval(g.template, b.template)) {
      return { ...g, template: { ...g.template, name: g.name }, savedAt: at, designAt: at };
    }
    return withDesignOf(g, b);
  });
  return { graphics: out, changed };
}

/** Whether a record holds a copy that a send would have to settle (an unstamped copy). A record
 *  holding none needs no base. */
export function needsSettle(graphics: readonly SavedGraphic[]): boolean {
  return graphics.some((g) => !stamped(g));
}
