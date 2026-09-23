// What a KIT actually contains, resolved once for everyone who needs to know.
//
// A kit names its library two ways (`src/templates/packs.ts`): `types` are graphic TYPES,
// resolved in the kit's own Style family, and `extras` are catalog variants OUTSIDE the type
// registry that belong in the kit anyway - end credits, the versus card. Both are the kit; a
// consumer that reads only `types` builds a kit missing its extras and, worse, can still show a
// count that includes them. Out of that library, `starter` names the ten or so graphics a user
// gets by default.
//
// This module exists because `packs.ts` deliberately does NOT import the catalog it is a view
// over, so the join has to happen somewhere else - once, rather than in each caller.

import { variantById } from './catalog';
import { resolvePack, type TemplatePack } from './packs';
import { TYPES } from './types/registry';
import type { TemplateVariant } from '../model/wizard';

export interface KitItem {
  /** The picker key it is offered and remembered under (`kitChoiceKey`). */
  key: string;
  /** The catalog design that will be built. */
  variant: TemplateVariant;
  /** The graphic type it is a design of, when it came from the matrix rather than `extras`. */
  typeId: string | null;
}

/**
 * Every graphic in the kit's LIBRARY, in its curated order: the resolved type cells first, then
 * the extras. Throws the way `resolvePack` does - a kit pointing at a design that does not exist
 * is a config error, and config errors fail loudly.
 */
export function kitItems(pack: TemplatePack): KitItem[] {
  const items: KitItem[] = resolvePack(pack).map((cell) => {
    const variant = variantById(cell.designId);
    if (!variant) {
      throw new Error(`Kit "${pack.id}": type "${cell.typeId}" resolves to missing design "${cell.designId}".`);
    }
    return { key: kitChoiceKey(cell.typeId, variant.id), variant, typeId: cell.typeId };
  });

  for (const designId of pack.extras ?? []) {
    const variant = variantById(designId);
    if (!variant) throw new Error(`Kit "${pack.id}": extra "${designId}" is not in the catalog.`);
    items.push({ key: kitChoiceKey(null, variant.id), variant, typeId: null });
  }
  return items;
}

/** What a kit card promises before it is picked: the graphics it starts with, and how many
 *  more its own library holds on top of those. */
export function kitSize(pack: TemplatePack): { starter: number; more: number } {
  const library = pack.types.length + (pack.extras?.length ?? 0);
  return { starter: pack.starter.length, more: library - pack.starter.length };
}

/**
 * ONE row of the kit contents picker: a graphic the kit CAN contain, with a stable key the
 * checkbox state is held under.
 *
 * The key is the graphic TYPE id, or `extra:<designId>` for a catalog variant outside the type
 * registry. Deliberately not the resolved design id and not an index, so the checkbox set stays
 * readable as config (`TemplatePack.starter` is written in the same keys) and survives the offer
 * list being reordered.
 */
export interface KitChoice extends KitItem {
  /** True when the kit's STARTER names it - ticked on arrival. */
  inStarter: boolean;
  /** True when the kit's LIBRARY holds it (types or extras); false for any other graphic type
   *  that happens to resolve in the kit's Style. */
  inPack: boolean;
}

/** The key a type / extra is offered and remembered under. */
export function kitChoiceKey(typeId: string | null, designId: string): string {
  return typeId ?? `extra:${designId}`;
}

/**
 * ONE graphic of a kit by its picker key: a graphic type resolved in the kit's Style, or an
 * `extra:<designId>` by its id. A type is asked through `resolvePack`, the same resolver the
 * create path runs, rather than by reaching into the registry a second time - a second copy is
 * how the picker comes to offer a cell that throws on Create. Null when the key resolves to
 * nothing, which is the answer for a type with no design in this family.
 */
export function kitItemFor(pack: TemplatePack, key: string): KitItem | null {
  const extra = key.startsWith('extra:');
  let designId: string | null = extra ? key.slice('extra:'.length) : null;
  if (!extra) {
    try {
      designId = resolvePack({ id: pack.id, family: pack.family, types: [key] })[0].designId;
    } catch {
      return null;
    }
  }
  const variant = designId ? variantById(designId) : undefined;
  return variant ? { key, variant, typeId: extra ? null : key } : null;
}

/**
 * Every graphic this kit COULD contain, in the order the picker offers them: the STARTER first
 * (in its rundown order), then the rest of the kit's library, then every OTHER graphic type
 * whose cell resolves in the kit's Style - "start from about ten, then edit the set".
 *
 * Only resolvable cells are ever offered: a type with no design in this family would be a
 * guaranteed Create failure.
 */
export function kitChoices(pack: TemplatePack): KitChoice[] {
  const starter = new Set(pack.starter);
  const library: KitChoice[] = kitItems(pack).map((item) => ({
    ...item,
    inStarter: starter.has(item.key),
    inPack: true,
  }));
  const byKey = new Map(library.map((c) => [c.key, c]));
  const choices: KitChoice[] = [
    ...pack.starter.map((key) => byKey.get(key)).filter((c): c is KitChoice => !!c),
    ...library.filter((c) => !c.inStarter),
  ];
  for (const type of TYPES) {
    if (byKey.has(type.id)) continue;
    const item = kitItemFor(pack, type.id);
    if (item) choices.push({ ...item, inStarter: false, inPack: false });
  }
  return choices;
}

/**
 * The graphics a picker SELECTION resolves to, in offer order. This is what gets built, so it
 * is also what the count on screen must come from.
 *
 * An unknown key is dropped rather than throwing, so a selection written before the kit's
 * library changed degrades to what still exists.
 */
export function kitSelection(pack: TemplatePack, keys: readonly string[]): KitItem[] {
  const wanted = new Set(keys);
  return kitChoices(pack)
    .filter((choice) => wanted.has(choice.key))
    .map((choice) => ({ key: choice.key, variant: choice.variant, typeId: choice.typeId }));
}
