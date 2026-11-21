// THE AUDIENCE PICKERS (docs/work-specs/svg-template-library/spec.md, D6 and "Pickers and
// targets"; phase TL1).
//
// Join card, Vote results, Message and Word cloud each ask the operator which design to use. One
// list for all four, in this order: the production's compatible graphics, the active user's SAVED
// compatible graphics, then the built-in designs. "Compatible" is the feature's existing matcher
// (Join link; the vote fields; Message and Name minus quiz boards; the word cloud's fields), so a
// design is offered exactly where staging would accept it.
//
// A saved design already in the production (its copy links back to it by `graphicId`) is offered
// once, as the production's: choosing it again reuses that copy by IDENTITY, never by name. A
// saved design is copied in under a free name, because adding a graphic whose name the pool
// already holds would replace that graphic's design under its existing cues (model/shows.ts
// `addGraphicToShow`, model/poolIdentity.ts).
//
// Pure and Node-importable (scripts/audience-pickers.test.mjs): it reads records, writes nothing.

import type { Show } from '../model/shows';
import { joinCards, joinLinkField } from '../model/joinCues';
import { wordCloudFields } from '../model/wordCloud';
import { freeName } from '../model/poolIdentity';
import { messageDestinations, MESSAGE_CARDS, takesMessages } from './messageStaging';
import { pollFieldMap, resultDestinations, RESULT_BOARDS } from './resultStaging';
import { WORD_CLOUDS, wordDestinations } from './wordStaging';

type Field = { field: string; title?: string };

export type PickerKind = 'join' | 'results' | 'message' | 'words';

/** The catalog Join card (templates/audience/joinCard.ts). */
export const JOIN_CARDS: readonly { id: string; name: string }[] = [{ id: 'jc01', name: 'House Join Card' }];

/** A saved library design, as much of it as a picker reads (model/graphicDoc.ts). */
export interface SavedDesign {
  id: string;
  name: string;
  deleted?: boolean;
  template: { fields?: readonly Field[] };
}

export type PickerGroup = 'production' | 'saved' | 'built-in';

export interface PickerItem {
  group: PickerGroup;
  /** What the button shows. */
  name: string;
  /** The button's accessible name: what it does, the design and where it comes from, unique in
   *  the list so a screen reader can tell two "House Vote" buttons apart (AC-10). */
  label: string;
  /** A production graphic's pool id, a saved design's library id, or a built-in's catalog id (for
   *  Messages, the built-in card's catalog name, which is what the card adder looks up). */
  id: string;
}

/** Whether a design's fields fit the feature: the matcher staging itself uses. */
export function fitsPicker(kind: PickerKind, fields: readonly Field[]): boolean {
  if (kind === 'join') return joinLinkField(fields) !== null;
  if (kind === 'results') return pollFieldMap(fields) !== null;
  if (kind === 'message') return takesMessages(fields);
  return wordCloudFields(fields) !== null;
}

const VERB: Record<PickerKind, string> = { join: 'Join card on', results: 'Results on', message: 'Prepare on', words: 'Word cloud on' };
const FROM: Record<PickerGroup, string> = { production: 'in this production', saved: 'saved design', 'built-in': 'built-in' };

/** The production's own graphics the feature can use, as staging names them. */
function productionDesigns(show: Pick<Show, 'graphics' | 'bindings' | 'messageTarget'>, kind: PickerKind): { id: string; name: string }[] {
  const pool =
    kind === 'join' ? joinCards(show) : kind === 'results' ? resultDestinations(show) : kind === 'message' ? messageDestinations(show) : wordDestinations(show);
  return pool.map((d) => ({ id: d.graphicId, name: d.name }));
}

function builtIns(kind: PickerKind): { id: string; name: string }[] {
  if (kind === 'join') return [...JOIN_CARDS];
  if (kind === 'results') return [...RESULT_BOARDS];
  if (kind === 'message') return MESSAGE_CARDS.map((name) => ({ id: name, name }));
  return [...WORD_CLOUDS];
}

/** Whether a saved design already has its copy in the production (linked by identity). */
export function linkedCopy(show: Pick<Show, 'graphics'>, savedId: string): string | null {
  return show.graphics.find((g) => g.graphicId === savedId && !g.sceneCopyOf)?.id ?? null;
}

/** Every design the picker offers: production first, then saved, then built-in (D6). */
export function pickerItems(
  show: Pick<Show, 'graphics' | 'bindings' | 'messageTarget'>,
  library: readonly SavedDesign[],
  kind: PickerKind,
): PickerItem[] {
  const raw: { group: PickerGroup; id: string; name: string }[] = [
    ...productionDesigns(show, kind).map((d) => ({ group: 'production' as const, ...d })),
    ...library
      .filter((doc) => !doc.deleted && fitsPicker(kind, doc.template.fields ?? []) && !linkedCopy(show, doc.id))
      .map((doc) => ({ group: 'saved' as const, id: doc.id, name: doc.name })),
    ...builtIns(kind).map((d) => ({ group: 'built-in' as const, ...d })),
  ];
  const used = new Set<string>();
  return raw.map((item) => {
    const label = freeName(used, `${VERB[kind]} ${item.name}, ${FROM[item.group]}`);
    used.add(label);
    return { ...item, label };
  });
}

/**
 * How a saved design comes into the production: its linked copy when there is one (reused by
 * identity), else a new copy under a name no pool graphic holds.
 */
export function savedCopyPlan(show: Pick<Show, 'graphics'>, saved: Pick<SavedDesign, 'id' | 'name'>): { reuse: string } | { name: string } {
  const copy = linkedCopy(show, saved.id);
  if (copy) return { reuse: copy };
  return { name: freeName(show.graphics.map((g) => g.name), saved.name) };
}

/**
 * The cue a pick should fill on a graphic it just brought in: the graphic's only cue while that
 * cue is still exactly what adding the graphic seeded and no question's result maps to it. A copy
 * made a moment ago, or one a failed save left behind, is filled rather than left blank beside a
 * second cue.
 */
export function seededCue(
  show: Pick<Show, 'cues' | 'resultCues'>,
  graphicId: string,
  seed: Record<string, string>,
): string | null {
  const cues = (show.cues ?? []).filter((c) => c.sourceId === graphicId);
  if (cues.length !== 1) return null;
  const [cue] = cues;
  if (Object.values(show.resultCues ?? {}).includes(cue.id)) return null;
  const values = cue.values ?? {};
  const keys = new Set([...Object.keys(values), ...Object.keys(seed)]);
  for (const k of keys) if ((values[k] ?? '') !== (seed[k] ?? '')) return null;
  return cue.id;
}
