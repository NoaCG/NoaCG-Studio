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
// Pure - no storage, no clock beyond the stamp it is given - so the one place it can be wrong is
// here, on a page of code.

import type { Show } from './shows';

/** A top-level field's readable name, for the "your change to … was replaced" line. */
const FIELD_LABEL: Record<string, string> = {
  name: 'the name',
  graphics: 'the graphics',
  cues: 'the rundown',
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
      doc[key] = items.value;
      if (items.conflict) lost.push(FIELD_LABEL[key] ?? key);
      continue;
    }
    lost.push(FIELD_LABEL[key] ?? key); // Theirs stands; `doc` already holds it.
  }
  doc.updatedAt = at;
  return { doc: doc as unknown as Show, lost };
}
