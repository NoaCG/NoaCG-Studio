// Save a SET of templates as one production — the shared ending of every multi-graphic door.
//
// The wizard's kit, a NoaCG Pro package and a downloadable graphics pack all finish the same
// way: every graphic saved to the library, all of them pooled into one production, nothing
// opened in the editor. This lives in the model layer so the wizard and the pack importer run
// literally the same claimed-write path — two copies would be two chances for one of them to
// forget the durable-write claim (`components/never-report-save-storage-layer-has`).

import { commitDurableWrites } from './durableStore';
import { createGraphic } from './library';
import { captureLookFromTemplate } from './packets';
import {
  addGraphicToShow,
  createShowNamedChecked,
  loadShows,
  setShowLook,
  type Show,
} from './shows';
import type { SpxTemplate } from './types';

/** Where a saved set lands: an existing production, or a new one with the given name. */
export type ProductionDest = { kind: 'existing'; id: string } | { kind: 'new'; name: string };

/**
 * Save every template to the library, then pool all of them into one production.
 * Returns the production; THROWS with a user-readable message when any write fails.
 *
 * It deliberately does NOT touch the editor — no applyTemplate, no working project. A set's
 * outcome is a production of several graphics, and silently opening one of them would pick
 * for the user and leave the other N−1 looking like they had not been made.
 *
 * Graphics are written straight through `createGraphic` rather than the store's save path,
 * because that path saves THE OPEN PROJECT and there is exactly one of those. Every write is
 * CLAIMED (`commitDurableWrites`) before the next step: the durable store accepts a write and
 * confirms it a moment later, so continuing on the synchronous answer would build a
 * production on top of graphics that never landed.
 */
export async function saveTemplateSetToProduction(
  templates: SpxTemplate[],
  fallbackName: string,
  dest: ProductionDest,
): Promise<Show> {
  if (!templates.length) throw new Error('There are no graphics to save.');

  // Library records first, so the production is only created once every graphic in it
  // saved — a quota failure mid-way never leaves an empty production on Home.
  const docs = [];
  for (const template of templates) {
    const { doc, error } = createGraphic(template, { name: template.name, packageId: null });
    const failure = error ?? (await commitDurableWrites());
    if (failure || !doc) throw new Error(failure ?? 'The graphic could not be saved.');
    docs.push(doc);
  }

  // A set usually IS a new production, and that stays the default — but the caller can aim it
  // AT one (a production page's "+ New graphic"), and building a second production beside the
  // one the user started from is not what they asked for. An existing pick that has since been
  // deleted (another tab) falls back to a new one rather than dropping the work on the floor.
  let show = dest.kind === 'existing' ? loadShows().find((s) => s.id === dest.id) : undefined;
  if (!show) {
    const made = createShowNamedChecked(dest.kind === 'new' ? dest.name : fallbackName);
    const showError = made.error ?? (await commitDurableWrites());
    if (showError) throw new Error(showError);
    show = made.show;
  }
  const target = show;

  // Pool each copy with its library back-link — the same construction the production page's
  // own add uses, cue auto-seeding included. Pool order follows the set's own order, which is
  // also the layer paint order (index 0 furthest back).
  for (const doc of docs) {
    const { error } = addGraphicToShow(target.id, doc.template, { graphicId: doc.id });
    const failure = error ?? (await commitDurableWrites());
    if (failure) throw new Error(failure);
  }

  // The set's look becomes the production's look, so a graphic later made FOR this production
  // inherits it — but never overwrite a look the production already has, which is the rule the
  // single-graphic door follows for the same reason.
  if (!target.look && docs[0]) {
    setShowLook(target.id, captureLookFromTemplate(docs[0].template));
    const lookError = await commitDurableWrites();
    if (lookError) throw new Error(lookError);
  }

  return target;
}
