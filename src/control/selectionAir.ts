// WHAT AN AIRED LIVE CANDIDATE FOLLOWS (docs/work-specs/playout-election-package/spec.md, E7.1;
// AC-2, AC-3): the instance a Take captured, and the folds that keep it on its own entity.
//
// A Take of a cue with a selection captures that cue's selector, the revision it was resolved from
// and the values it sent, per graphic layer. From then on the layer follows THAT selector, never
// the cue's current one: preview, a draft or another cue selecting B cannot retarget the aired A.
// Only an explicit Update replaces the captured selector, and only after the full replacement
// resolves (`selectionTake`). A newer accepted revision of A is sent as one update carrying every
// mapped field; an older or a repeated revision is not (an out-of-order read, a reader handover or a
// recovered network re-reads what was already aired). When A cannot be resolved (it was deleted,
// the list is empty, the record is partial, the collection is malformed or of another schema), the
// layer keeps its picture and the instance is HELD: the page shows what is held and since when, off
// air, until the operator decides. Nothing here takes, advances or clears a layer.
//
// The instances survive a reload and an app restart in this browser (`readSelectionAir`), so a
// recovered program follows the aired selector, not the current selection. A page that did not
// take the layer has no instance and sends nothing for it.
//
// Pure: no DOM, no storage of its own; the page hands in what it reads. scripts/keyed-selection
// .test.mjs drives it.

import { resolveSelection, selectionGate, type SelectionResolve } from './sourceMapping.ts';
import type { CueSelection } from '../model/productionData';
import type { FieldDescriptor } from '../model/fieldModel';
import type { LiveCueMap } from './liveCue';
import type { StorePart } from './storePart';

/** One graphic layer's aired live candidate. */
export interface AiredSelection {
  /** The cue the layer airs. */
  cueId: string;
  /** The selector captured at Take (or by the Update that replaced it). */
  selection: CueSelection;
  /** The captured entity (`entityOf` of its key). */
  entity: string;
  /** The accepted revision the aired values came from. */
  revision: number;
  /** The mapped fields' values as last sent. */
  values: Record<string, string>;
  /** When those values were sent, ms. */
  at: number;
  /** Set while the entity cannot be resolved: why, since when, and the revision that said so. */
  held?: { reason: string; since: number; revision: number | null };
  /** Captured at the press, its send not answered yet: the marker may not have moved, so the
   *  instance is not forgotten for a marker that still names the cue it replaces. */
  pending?: true;
}

/** Every aired instance, by graphic name (the wire key, which is the layer). */
export type SelectionAir = Readonly<Record<string, AiredSelection>>;

/** One correction to send: the values, and the instance before and after it (`unsentSelection`). */
export interface SelectionSend {
  graphic: string;
  values: Record<string, string>;
  advanced: AiredSelection;
  before: AiredSelection;
}

/** What a Take or an Update of one cue may send for its selection. */
export type SelectionTake =
  | { status: 'none' }
  | { status: 'ok'; selection: CueSelection; entity: string; revision: number; values: Record<string, string> }
  | { status: 'refused'; reason: string };

/** The facts a selection is resolved against: the production's recipes and bindings, the live
 *  tree, and a graphic's fields as the reader sees them. */
export interface SelectionFacts {
  collections: readonly unknown[] | undefined;
  bindings: Record<string, Record<string, string>> | undefined;
  tree: unknown;
  fieldsOf: (graphic: string) => FieldDescriptor[] | null;
  /** False while a published tree is still unread: the tree held then may be older than the
   *  server's, so nothing is taken, updated or judged from it. Absent: readable. */
  readable?: boolean;
}

/** Resolve one selector on one graphic, with its gate. */
function resolveOn(selection: unknown, graphic: string, facts: SelectionFacts): SelectionTake & { hold?: SelectionResolve } {
  const gate = selectionGate({ selection }, facts.collections, graphic, facts.bindings);
  if (gate.status === 'none') return { status: 'none' };
  if (gate.status !== 'ok') return { status: 'refused', reason: gate.reason };
  const resolved = resolveSelection({ recipe: gate.recipe, tree: facts.tree, key: gate.selection.key, fields: facts.fieldsOf(graphic) });
  if (resolved.status !== 'ok') return { status: 'refused', reason: `Not ready: ${resolved.reason}.`, hold: resolved };
  return { status: 'ok', selection: gate.selection, entity: resolved.entity, revision: resolved.revision, values: resolved.values };
}

/**
 * Whether a cue may be taken (or its selection put on air by Update), and with which values: a
 * cue with no selection is `none`; one this build cannot read, or whose entity does not resolve
 * in the tree as it is now, is refused with the reason (an unknown B is never ready).
 */
export function selectionTake(cue: { selection?: unknown }, graphic: string | null, facts: SelectionFacts): SelectionTake {
  if (cue.selection === undefined) return { status: 'none' };
  if (!graphic) return { status: 'refused', reason: 'This cue’s graphic is gone.' };
  if (facts.readable === false) return { status: 'refused', reason: 'This production’s shared values are still loading.' };
  const { hold: _hold, ...take } = resolveOn(cue.selection, graphic, facts);
  return take;
}

/** The layer now airs this cue's resolved selection, pending until its send is answered. */
export function captureSelection(air: SelectionAir, graphic: string, cueId: string, take: Extract<SelectionTake, { status: 'ok' }>, now: number): SelectionAir {
  return { ...air, [graphic]: { cueId, selection: take.selection, entity: take.entity, revision: take.revision, values: take.values, at: now, pending: true } };
}

/** The send that captured `inst` was answered: it is followed and judged like any other now. */
export function landedSelection(air: SelectionAir, graphic: string, inst: AiredSelection): SelectionAir {
  if (air[graphic] !== inst) return air;
  const { pending: _pending, ...landed } = inst;
  return { ...air, [graphic]: landed };
}

/** The send that wrote `inst` failed: the layer gets back what it had, unless something else has
 *  written it since (another press, a follow), which then stands. */
export function undoSelection(air: SelectionAir, graphic: string, inst: AiredSelection | undefined, before: AiredSelection | undefined): SelectionAir {
  if (air[graphic] !== inst) return air;
  if (!before) return dropSelection(air, graphic);
  return { ...air, [graphic]: before };
}

/** A correction's send failed: the instance keeps the revision that IS on air, held with the
 *  reason, so the next read sends the newer one again. */
export function unsentSelection(air: SelectionAir, graphic: string, advanced: AiredSelection, before: AiredSelection, now: number): SelectionAir {
  if (air[graphic] !== advanced) return air;
  return { ...air, [graphic]: { ...before, held: { reason: `the correction to revision ${advanced.revision} was not sent`, since: before.held?.since ?? now, revision: advanced.revision } } };
}

/** The layer no longer airs a captured selection (an Out, or a cue without one taken onto it). */
export function dropSelection(air: SelectionAir, graphic: string): SelectionAir {
  if (!(graphic in air)) return air;
  const next = { ...air };
  delete next[graphic];
  return next;
}

/**
 * Forget instances whose layer airs another cue now, or, once the page knows what is live
 * (`seeded`), is off air. Returns the same object when nothing changed.
 */
export function reconcileSelection(air: SelectionAir, liveCue: LiveCueMap, seeded: boolean): SelectionAir {
  let next = air;
  for (const [graphic, inst] of Object.entries(air)) {
    if (inst.pending) continue;
    const live = liveCue[graphic];
    if ((live !== undefined && live !== inst.cueId) || (live === undefined && seeded)) next = dropSelection(next, graphic);
  }
  return next;
}

/**
 * Follow the tree for every aired instance whose layer still airs its cue: resolve the CAPTURED
 * selector (never the cue's current one), send a newer revision whole, hold on anything else.
 * Returns the new instances and the updates to send, one per graphic.
 */
export function followSelection(air: SelectionAir, liveCue: LiveCueMap, facts: SelectionFacts, now: number): { air: SelectionAir; sends: SelectionSend[] } {
  let next = air;
  const sends: SelectionSend[] = [];
  for (const [graphic, inst] of Object.entries(air)) {
    if (inst.pending || liveCue[graphic] !== inst.cueId) continue;
    const take = resolveOn(inst.selection, graphic, facts);
    if (take.status === 'ok') {
      if (take.revision > inst.revision) {
        const advanced: AiredSelection = { ...inst, revision: take.revision, values: take.values, at: now, held: undefined };
        next = { ...next, [graphic]: advanced };
        sends.push({ graphic, values: take.values, advanced, before: inst });
      } else if (take.revision === inst.revision && inst.held) {
        // The aired revision reads well again (a malformed answer passed): nothing new to send.
        next = { ...next, [graphic]: { ...inst, held: undefined } };
      }
      // An older revision is a re-read of what was aired before: rejected, nothing changes.
      continue;
    }
    if (take.status === 'none') continue;
    const revision = take.hold?.revision ?? null;
    // An older revision that does not resolve says nothing about the newer one on air.
    if (revision !== null && revision < inst.revision) continue;
    const reason = take.hold?.status === 'hold' ? take.hold.reason : take.reason;
    if (inst.held && inst.held.reason === reason && inst.held.revision === revision) continue;
    next = { ...next, [graphic]: { ...inst, held: { reason, since: inst.held?.since ?? now, revision } } };
  }
  return { air: next, sends };
}

/** The format the instances are kept in, per production, in this browser. */
const SELECTION_AIR_V = 1;

/** The instances as they are kept. */
export const writeSelectionAir = (air: SelectionAir): string => JSON.stringify({ v: SELECTION_AIR_V, graphics: air });

/** The kept instances, or none: anything this build did not write reads as no instance, so a
 *  restored page holds rather than follows what it cannot read. */
export function readSelectionAir(raw: string | null): SelectionAir {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  const kept = parsed as { v?: unknown; graphics?: unknown } | null;
  const graphics = kept?.graphics;
  if (kept?.v !== SELECTION_AIR_V || !graphics || typeof graphics !== 'object') return {};
  const out: Record<string, AiredSelection> = {};
  for (const [graphic, value] of Object.entries(graphics as Record<string, unknown>)) {
    const inst = value as Partial<AiredSelection> | null;
    const sane =
      !!inst &&
      typeof inst.cueId === 'string' &&
      typeof inst.entity === 'string' &&
      Number.isInteger(inst.revision) &&
      typeof inst.at === 'number' &&
      !!inst.selection &&
      typeof inst.selection === 'object' &&
      !!inst.values &&
      typeof inst.values === 'object' &&
      Object.values(inst.values).every((v) => typeof v === 'string');
    // A press still unanswered when the page went away is judged as landed: the marker decides.
    if (sane) {
      const { pending: _pending, ...kept } = inst as AiredSelection;
      out[graphic] = kept;
    }
  }
  return out;
}

// ── The page's two doors onto the instances, over the session's `selections` part ──────────────

/** The part the instances live in, how a change is kept (set and stored), and the clock. */
export interface SelectionAirIo {
  part: StorePart<SelectionAir>;
  keep: (air: SelectionAir) => void;
  now: () => number;
  /** Follow the newest tree at once: a revision that arrived while a press was pending was passed
   *  over then, and nothing else may come to follow it. */
  followNow?: () => void;
}

/** A Take or an Update put this cue's selection on the layer (none drops what it followed). Only
 *  this layer's entry is written back by `undo`, and only while it is still the one this press
 *  wrote; `landed` ends its pending state. */
export function pressSelection(io: SelectionAirIo, graphic: string, cueId: string, take: SelectionTake): { landed: () => void; undo: () => void } {
  const before = io.part.get()[graphic];
  const written = take.status === 'ok' ? captureSelection(io.part.get(), graphic, cueId, take, io.now()) : dropSelection(io.part.get(), graphic);
  io.keep(written);
  const inst = written[graphic];
  return {
    landed: () => {
      if (!inst) return;
      io.keep(landedSelection(io.part.get(), graphic, inst));
      io.followNow?.();
    },
    undo: () => io.keep(undoSelection(io.part.get(), graphic, inst, before)),
  };
}

/**
 * One pass of following, run whenever the tree, the rundown or what is live moves: forget what is
 * no longer aired, then, once the tree is one this page may judge (`facts.readable`), send each newer revision through `send` and hold a correction whose send
 * failed (`send` answers null). Before that, nothing is judged, so no false hold is shown.
 */
export function followAired(
  io: SelectionAirIo,
  o: { liveCue: LiveCueMap; seeded: boolean; facts: SelectionFacts; send: (graphic: string, values: Record<string, string>) => Promise<unknown> },
): void {
  const before = io.part.get();
  const reconciled = reconcileSelection(before, o.liveCue, o.seeded);
  const { air, sends } = o.facts.readable !== false ? followSelection(reconciled, o.liveCue, o.facts, io.now()) : { air: reconciled, sends: [] };
  if (air !== before) io.keep(air);
  for (const one of sends) {
    void o.send(one.graphic, one.values).then((sent) => {
      if (!sent) io.keep(unsentSelection(io.part.get(), one.graphic, one.advanced, one.before, io.now()));
    });
  }
}
