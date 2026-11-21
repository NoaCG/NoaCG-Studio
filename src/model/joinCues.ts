// WHICH CUE "ADD JOIN CARD TO RUNDOWN" WRITES (docs/work-specs/svg-template-library/spec.md,
// "Pickers and targets"; phase TL1).
//
// A Join card is any pool graphic with a field titled `Join link`: the catalog's Join card and an
// imported design with a `QR` layer (templates/importedDesign/svgQr.ts) alike. The press puts the
// production's CURRENT link into that card's Join cue:
//
//  - The card is the one the operator just picked (`chosen`), else the remembered `joinTarget`
//    while it is still a Join card, else the production's only Join card. With none, the caller
//    offers the Join picker (saved designs and the built-in); with several, it asks once and the
//    pick is remembered.
//  - One Join cue per card: the card's first cue is updated, so a second press, a renamed link or
//    a reload never adds a blank or second cue. A card with no cue gets one.
//
// Decided on the production as stored when the write runs (model/shows.ts `stageShowJoin`), like a
// result cue (./resultCues.ts). Pure: type imports only (scripts/audience-pickers.test.mjs).

import type { Show } from './shows';

type Field = { field: string; title?: string };

/** The field a Join card's link goes in: the title the QR layer and the catalog card share. */
export const JOIN_LINK_TITLE = 'Join link';

/** The LAST field titled Join link (an imported design appends it after the artwork's fields), or
 *  null when the graphic is not a Join card. */
export function joinLinkField(fields: readonly Field[]): string | null {
  let found: string | null = null;
  for (const f of fields) if ((f.title ?? '').trim().toLowerCase() === JOIN_LINK_TITLE.toLowerCase()) found = f.field;
  return found;
}

export type JoinPlan =
  /** Write the link into this cue of the card. */
  | { kind: 'update'; cueId: string; graphicId: string }
  /** The card has no cue: add one holding the link. */
  | { kind: 'add'; graphicId: string }
  /** No Join card in the production: offer the picker (or the built-in when nothing is saved). */
  | { kind: 'none' }
  /** Several Join cards and none remembered: the operator picks once. */
  | { kind: 'choose' };

/** The production's Join cards, in pool order. */
export function joinCards(show: Pick<Show, 'graphics'>): { graphicId: string; name: string }[] {
  return show.graphics.filter((g) => joinLinkField(g.template.fields ?? [])).map((g) => ({ graphicId: g.id, name: g.name }));
}

/** The Join card a press would fill, without writing: chosen, remembered, or the only one. */
export function joinCardOf(show: Pick<Show, 'graphics' | 'joinTarget'>, chosen: string | null = null): string | null | 'choose' {
  const cards = joinCards(show).map((c) => c.graphicId);
  if (chosen && cards.includes(chosen)) return chosen;
  if (show.joinTarget && cards.includes(show.joinTarget)) return show.joinTarget;
  if (cards.length === 1) return cards[0];
  return cards.length === 0 ? null : 'choose';
}

/**
 * Decide where the link goes. `adopt` is a cue on the chosen card that this press should fill
 * (a design copied in a moment ago arrives with its one seeded cue).
 */
export function planJoinCue(show: Pick<Show, 'graphics' | 'cues' | 'joinTarget'>, chosen: string | null = null, adopt: string | null = null): JoinPlan {
  const card = joinCardOf(show, chosen);
  if (card === null) return { kind: 'none' };
  if (card === 'choose') return { kind: 'choose' };
  const cues = (show.cues ?? []).filter((c) => c.sourceId === card);
  const cue = cues.find((c) => c.id === adopt) ?? cues[0];
  return cue ? { kind: 'update', cueId: cue.id, graphicId: card } : { kind: 'add', graphicId: card };
}
