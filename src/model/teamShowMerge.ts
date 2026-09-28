// Re-applying a refused team save (docs/TEAMS_PLAN.md §3, "writes are compare-and-swap").
//
// `team_production_save` refuses a write whose token is stale and hands back what is really
// stored. The plan's answer is to re-apply the edit to that document instead of eating it. The
// studio's mutators edit a record in place rather than logging verbs, so the re-apply is done the
// other way round: a THREE-WAY MERGE of three documents this tab already has -
//   base   - the server document this tab last saw (what the local edit started from),
//   ours   - the local document, base plus whatever this operator changed,
//   theirs - the document a teammate saved in the meantime.
//
// THE RULE, per top-level field: whichever side left it as it was in `base` takes the other
// side's value. Both sides changing it to different things is a real conflict, and it is never
// silent - `lost` names it so the page can say whose version stood.
//
// THE LISTS ARE MERGED PER ITEM, because a rundown is the field two students edit at once: Anna
// adding a cue and Ben retyping another must both survive. `graphics`, `cues`, `datasets` and
// `playoutItems` are arrays of objects with an `id`, and each item gets the same three-way rule.
// Only the same ITEM changed differently on both sides is a conflict, and there theirs stands.
//
// FOLDERS STAY WHOLE (docs/CLIP_PLAYBACK_PLAN.md §7). A folder's cues stand together in the flat cue
// list, and a merge can tear them apart - one teammate folders A and B while the other orders A, C,
// B, D - or leave a folder no cue names, or a cue naming a folder that is gone. So the merged record
// is settled at the end, whichever side each list came from, and a settle is reported as `gathered`:
// nothing of either side was replaced by it, so it is never one of the `lost` fields.
//
// Pure - no storage, no clock beyond the stamp it is given - so the one place it can be wrong is
// here, on a page of code. Its one runtime import is the folder rules, which are pure too; the `.ts`
// is what lets Node resolve it.

import type { Show } from './shows';
import { settleFolders } from './showFolders.ts';

/** A top-level field's readable name, for the "your change to … was replaced" line. */
const FIELD_LABEL: Record<string, string> = {
  name: 'the name',
  graphics: 'the graphics',
  cues: 'the rundown',
  folders: 'the folders',
  datasets: 'the data tables',
  playoutItems: 'the playout items',
  data: 'the production data',
  bindings: 'the field bindings',
  profile: 'the control panel layout',
  look: 'the look',
  brandId: 'the brand',
};

/** Fields the merge never decides: the stamp is written fresh, and `teamId` is the server's. */
const IGNORED = new Set(['updatedAt', 'version', 'teamId']);

export interface TeamShowMerge {
  doc: Show;
  /** Readable names of what this side changed and lost to the other side, one per field. */
  lost: string[];
  /** A folder the two sides had torn apart, emptied or orphaned was put back together. */
  gathered: boolean;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

type Item = { id: string };

function isItemList(value: unknown): value is Item[] {
  return (
    Array.isArray(value) &&
    value.every((v) => v !== null && typeof v === 'object' && typeof (v as Item).id === 'string')
  );
}

/**
 * Merge one list item by item. Returns null when the three lists are not all id-keyed, and the
 * caller then treats the whole field as one value.
 */
function mergeItems(base: unknown, ours: unknown, theirs: unknown): { value: Item[]; conflict: boolean } | null {
  const b = base ?? [];
  const o = ours ?? [];
  const t = theirs ?? [];
  if (!isItemList(b) || !isItemList(o) || !isItemList(t)) return null;
  const byId = (list: Item[]) => new Map(list.map((item) => [item.id, item]));
  const bm = byId(b);
  const om = byId(o);
  const tm = byId(t);
  let conflict = false;

  // THEIR ORDER is the spine, since theirs is what is stored now.
  const result: Item[] = [];
  for (const theirItem of t) {
    const baseItem = bm.get(theirItem.id);
    const ourItem = om.get(theirItem.id);
    if (ourItem) {
      if (same(ourItem, baseItem)) result.push(theirItem);
      else if (same(theirItem, baseItem) || same(theirItem, ourItem)) result.push(ourItem);
      else {
        conflict = true;
        result.push(theirItem);
      }
    } else if (baseItem) {
      // We removed it. If they changed it meanwhile, their edit is kept and the removal is the loss.
      if (!same(theirItem, baseItem)) {
        conflict = true;
        result.push(theirItem);
      }
    } else {
      result.push(theirItem); // They added it.
    }
  }

  // What WE added goes in after the item it followed on our side, or at the end.
  o.forEach((ourItem, index) => {
    if (tm.has(ourItem.id)) return;
    if (bm.has(ourItem.id)) {
      // They removed it. Our edit to it, if any, is the loss; an untouched item just goes.
      if (!same(ourItem, bm.get(ourItem.id))) conflict = true;
      return;
    }
    const before = o.slice(0, index).reverse().find((prev) => result.some((r) => r.id === prev.id));
    const at = before ? result.findIndex((r) => r.id === before.id) + 1 : result.length;
    result.splice(at, 0, ourItem);
  });

  // A REORDER on our side (cue moved up, layer stack shuffled) survives when they did not reorder.
  const common = (list: Item[]) => list.map((item) => item.id).filter((id) => bm.has(id) && om.has(id) && tm.has(id));
  const baseOrder = common(b);
  const ourOrder = common(o);
  const theirOrder = common(t);
  if (!same(ourOrder, baseOrder)) {
    if (same(theirOrder, baseOrder)) {
      const slots = result.map((item, i) => (ourOrder.includes(item.id) ? i : -1)).filter((i) => i >= 0);
      const reordered = ourOrder.map((id) => result.find((item) => item.id === id)!);
      slots.forEach((slot, i) => {
        result[slot] = reordered[i];
      });
    } else if (!same(ourOrder, theirOrder)) {
      conflict = true;
    }
  }
  return { value: result, conflict };
}

// THE LAYER RULE, as shows.ts states it (`graphicLayer`, `nextFreeLayer`, the PLAYOUT_LAYER
// constants). Mirrored rather than imported because this module stays pure: its test loads it
// alone, and shows.ts brings the durable store with it. Change one, change both.
const MIN_LAYER = 1;
const MAX_LAYER = 100;
const DEFAULT_LAYER = 20;

/** `graphicLayer`: the stored number, or the default for a missing or out-of-range one. */
function layerOf(item: Item): number {
  const n = Number((item as Item & { layer?: unknown }).layer);
  return Number.isFinite(n) && n >= MIN_LAYER && n <= MAX_LAYER ? Math.round(n) : DEFAULT_LAYER;
}

/** `nextFreeLayer`: the lowest layer nothing uses, from the default up, then below it. */
function lowestFreeLayer(used: ReadonlySet<number>): number | null {
  for (let n = DEFAULT_LAYER; n <= MAX_LAYER; n++) if (!used.has(n)) return n;
  for (let n = MIN_LAYER; n < DEFAULT_LAYER; n++) if (!used.has(n)) return n;
  return null;
}

/**
 * TWO NEW GRAPHICS, ONE LAYER. A graphic added to a production takes the lowest free layer, so two
 * members who each add one from the same base both pick the same number - and two graphics on one
 * layer replace each other on air. Nobody chose that; the merge made it (found by the three-member
 * walk, e2e/configured/teams.spec.ts). So a graphic WE added that lands on a layer a graphic THEY
 * added holds takes the layer its add would have picked had it seen theirs. Theirs keeps its
 * number: it is saved, and may already be on air. A clash involving any graphic from before is
 * somebody's own layer choice, which the production page warns about, and is left alone.
 */
function separateNewLayers(merged: Item[], base: unknown, theirs: unknown): Item[] {
  const ids = (list: unknown) => new Set(isItemList(list) ? list.map((item) => item.id) : []);
  const inBase = ids(base);
  const inTheirs = ids(theirs);
  const theirNewLayers = new Set(merged.filter((g) => inTheirs.has(g.id) && !inBase.has(g.id)).map(layerOf));
  const used = new Set(merged.map(layerOf));
  return merged.map((g) => {
    // In neither base nor theirs, a merged item can only be one WE added.
    const ourNew = !inBase.has(g.id) && !inTheirs.has(g.id);
    if (!ourNew || !theirNewLayers.has(layerOf(g))) return g;
    const free = lowestFreeLayer(used);
    if (free === null) return g; // Every layer is taken: the page's shared-layer warning says so.
    used.add(free);
    return { ...g, layer: free };
  });
}

/**
 * Merge a refused local document onto the one a teammate saved. `at` becomes the result's
 * `updatedAt`, so the merged record reads as the newest edit it is.
 */
export function mergeTeamShow(base: Show, ours: Show, theirs: Show, at: string): TeamShowMerge {
  const doc: Record<string, unknown> = { ...theirs };
  const lost: string[] = [];
  const b = base as unknown as Record<string, unknown>;
  const o = ours as unknown as Record<string, unknown>;
  const t = theirs as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(b), ...Object.keys(o), ...Object.keys(t)]);
  for (const key of keys) {
    if (IGNORED.has(key)) continue;
    if (same(o[key], b[key])) continue; // Our side did not touch it: theirs, already in `doc`.
    if (same(t[key], b[key]) || same(t[key], o[key])) {
      // Only we changed it (or we both made the same change).
      if (o[key] === undefined) delete doc[key];
      else doc[key] = o[key];
      continue;
    }
    const items = mergeItems(b[key], o[key], t[key]);
    if (items) {
      doc[key] = key === 'graphics' ? separateNewLayers(items.value, b[key], t[key]) : items.value;
      if (items.conflict) lost.push(FIELD_LABEL[key] ?? key);
      continue;
    }
    lost.push(FIELD_LABEL[key] ?? key); // Theirs stands; `doc` already holds it.
  }
  // Whichever side the cues and the folders came from, and however they merged, each folder's cues
  // end up together where its first cue stands, and no folder is left empty or named by nobody.
  const settled = settleFolders((doc.cues ?? []) as NonNullable<Show['cues']>, doc.folders as Show['folders']);
  if (settled.changed) {
    if (doc.cues !== undefined) doc.cues = settled.cues;
    if (settled.folders.length) doc.folders = settled.folders;
    else delete doc.folders;
  }
  doc.updatedAt = at;
  return { doc: doc as unknown as Show, lost, gathered: settled.changed };
}
