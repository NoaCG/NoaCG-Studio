// A PRODUCTION DELIVERED WITH ITS GRAPHICS (docs/AGENT_SAVE.md §11): the production record the
// set door writes when a delivery names a production destination (`noacg save a b c
// --production <name>`, api/_lib/me/graphicSets.ts).
//
// It is the record the studio itself makes when a set of graphics becomes a production
// (model/templateSet.ts, packs/graphicsPack.ts `installPack`): a new production holding a POOL
// entry per library graphic - a copy of its template, linked back by `graphicId`, on its own layer
// number - and the cue RUNDOWN over that pool. Built here, rather than by calling the model's
// mutators, because the server has no browser storage to run them in; the rules are the model's:
//
//   - layers: a layer the request names, else the next free number from 20 up (`nextFreeLayer`),
//     so no two graphics of the production start on one layer;
//   - cues: the request's ordered rundown, each row's values over its graphic's field defaults
//     (`setShowCues`), then one default row for a graphic the rundown never names, so every pool
//     graphic is reachable (`installPack`); without a rundown, one seeded cue per graphic in order
//     (`addGraphicToShow`).
//
// PURE: no storage, no clock, no ids of its own - the caller passes them - so the server's record
// and the mapping tests (scripts/production-delivery.test.mjs) see the same function. Nothing here
// publishes or plays: the record carries no slugs, so it is an unpublished production like any new
// one.

import type { SpxTemplate, TemplateType } from './types';

// The record's shapes, written out: model/shows.ts `Show`, `ShowCue` and packets.ts `SavedGraphic`,
// narrowed to what this record holds. They are not imported because the server typechecks this
// file without the DOM, which shows.ts needs; the configured agent journey opens the record in the
// studio, which is what proves the two agree.

/** A pool entry (`SavedGraphic`). */
export interface DeliveredPoolEntry {
  id: string;
  name: string;
  type: TemplateType;
  savedAt: string;
  template: SpxTemplate;
  graphicId: string;
  layer: number;
}

/** A rundown row (`ShowCue`). */
export interface DeliveredCueRow {
  id: string;
  sourceId: string;
  label: string;
  values: Record<string, string>;
  note?: string;
}

/** The production record (`Show`, version 2), as a new unpublished production has it. */
export interface DeliveredShow {
  id: string;
  name: string;
  version: 2;
  graphics: DeliveredPoolEntry[];
  cues: DeliveredCueRow[];
  outputSetup: { v: 1; destinations: never[] };
  updatedAt: string;
}

/** One row of a delivered rundown: the graphic it cues, by its name in the delivery. */
export interface DeliveredCue {
  graphic: string;
  label: string;
  values?: Record<string, string>;
  note?: string;
}

/** What a delivery asks for: a new production of this name, optionally with each graphic's layer
 *  (in the delivery's order) and an ordered rundown. */
export interface ProductionRequest {
  name: string;
  layers?: number[];
  cues?: DeliveredCue[];
}

/** A library record the same delivery saves: its id, name and template. */
export interface DeliveredGraphic {
  id: string;
  name: string;
  template: SpxTemplate;
}

/** The default layer and the range a layer may take (model/shows.ts). */
const DEFAULT_LAYER = 20;
const MIN_LAYER = 1;
const MAX_LAYER = 100;

/** A cue's starting values: the template's own field defaults (model/shows.ts `seedValues`). */
function seedValues(template: SpxTemplate): Record<string, string> {
  const values: Record<string, string> = {};
  for (const f of template.fields) values[f.field] = f.value ?? '';
  return values;
}

/** The lowest layer not in `used`, from the default upward (model/shows.ts `nextFreeLayer`). */
function freeLayer(used: Set<number>): number {
  for (let n = DEFAULT_LAYER; n <= MAX_LAYER; n++) if (!used.has(n)) return n;
  for (let n = MIN_LAYER; n < DEFAULT_LAYER; n++) if (!used.has(n)) return n;
  return DEFAULT_LAYER;
}

/**
 * The production record for a delivery. `graphics` are the library records the same delivery
 * saves, in its order; `request` was shape-checked by the caller (every cue names one of them,
 * their names are unique). `mintId` mints the pool and cue ids; `at` is the server's clock.
 */
export function deliveredProduction(input: {
  id: string;
  at: string;
  request: ProductionRequest;
  graphics: DeliveredGraphic[];
  mintId: () => string;
}): DeliveredShow {
  const { request, graphics, mintId, at } = input;
  // A layer the request names is the graphic's; the rest take the free numbers around them.
  const used = new Set<number>();
  for (const layer of request.layers ?? []) if (Number.isInteger(layer)) used.add(layer);
  const pool: DeliveredPoolEntry[] = graphics.map((g, i) => {
    const asked = request.layers?.[i];
    const layer = asked !== undefined && Number.isInteger(asked) ? asked : freeLayer(used);
    used.add(layer);
    return {
      id: mintId(),
      name: g.name,
      type: g.template.type,
      savedAt: at,
      template: g.template,
      graphicId: g.id,
      layer,
    };
  });

  const byName = new Map(pool.map((p, i) => [p.name, { entry: p, template: graphics[i].template }]));
  const cue = (sourceId: string, template: SpxTemplate, label: string, values?: Record<string, string>, note?: string): DeliveredCueRow => ({
    id: mintId(),
    sourceId,
    label,
    values: { ...seedValues(template), ...(values ?? {}) },
    ...(note ? { note } : {}),
  });
  let cues: DeliveredCueRow[];
  if (request.cues?.length) {
    cues = request.cues.map((c) => {
      const source = byName.get(c.graphic);
      if (!source) throw new Error(`The cue "${c.label}" names "${c.graphic}", which is not in this delivery.`);
      return cue(source.entry.id, source.template, c.label.trim() || source.entry.name, c.values, c.note);
    });
    const covered = new Set(request.cues.map((c) => c.graphic));
    pool.forEach((p, i) => {
      if (!covered.has(p.name)) cues.push(cue(p.id, graphics[i].template, p.name));
    });
  } else {
    cues = pool.map((p, i) => cue(p.id, graphics[i].template, p.name));
  }

  return {
    id: input.id,
    name: request.name.trim(),
    version: 2,
    graphics: pool,
    cues,
    outputSetup: { v: 1, destinations: [] },
    updatedAt: at,
  };
}

// ── The same delivery, installed again (spec AC-9) ───────────────────────────────────────────

/** A library record, as much of it as identity needs. */
interface LibraryItem {
  id: string;
  name: string;
  deleted?: boolean;
  origin?: { tool: string; item?: string } | null;
}

/** A production, as much of it as "does it pool these graphics" needs. */
interface PoolingProduction {
  deleted?: boolean;
  graphics: ReadonlyArray<{ graphicId?: string }>;
}

/** The library record that IS this graphic, delivered earlier: the same item identity
 *  (graphicDoc.ts GraphicOrigin). Never a name match - two graphics may share a name and be
 *  different work. */
export function deliveredCopy<T extends LibraryItem>(origin: { item?: string } | undefined, library: readonly T[]): T | null {
  const item = origin?.item;
  return item ? library.find((d) => !d.deleted && d.origin?.item === item) ?? null : null;
}

/**
 * What installing a package of these graphics would repeat (packs/graphicsPack.ts
 * `installOverlap`), so the user chooses before Install rather than finds a duplicate after:
 *   - `production`: every graphic is already in the library from its delivery, and a production
 *     already pools all of them - the delivery became a production already;
 *   - `unidentified`: graphics the identity cannot speak for - the package's graphic or the library
 *     record of the same name, made outside the studio, carries no item identity - so a library
 *     graphic of that name MAY be this one. Named for the user, never merged.
 * A graphic the identity finds needs no word: Install pools the library record instead of saving a
 * second copy.
 */
export function deliveryOverlap<S extends PoolingProduction>(
  graphics: ReadonlyArray<{ name: string; origin?: { item?: string } }>,
  library: readonly LibraryItem[],
  productions: readonly S[],
): { production: S | null; unidentified: string[] } {
  const found = graphics.map((g) => deliveredCopy(g.origin, library));
  const unidentified = graphics
    .filter((g, i) => !found[i] && library.some((d) => !d.deleted && d.name === g.name && d.origin && !(d.origin.item && g.origin?.item)))
    .map((g) => g.name);
  const ids = found.flatMap((d) => (d ? [d.id] : []));
  const production = ids.length === graphics.length
    ? productions.find((p) => !p.deleted && ids.every((id) => p.graphics.some((e) => e.graphicId === id))) ?? null
    : null;
  return { production, unidentified };
}
