// WHAT AN AIRED LIVE CANDIDATE FOLLOWS (docs/work-specs/playout-election-package/spec.md, E7.1;
// AC-2, AC-3): per graphic layer, what the output shows, the sends still out, and one reducer.
//
// A Take of a cue with a selection captures that cue's selector, the revision it was resolved from
// and the values it sent. From then on the layer follows THAT selector, never the cue's current
// one: preview, a draft or another cue selecting B cannot retarget the aired A. Only an explicit
// Update replaces the captured selector, and only after the full replacement resolves
// (`selectionTake`). A newer accepted revision of A is sent as one update carrying every mapped
// field; an older or a repeated revision is not (an out-of-order read, a reader handover or a
// recovered network re-reads what was already judged). When A cannot be resolved (it was deleted,
// the list is empty, the record is partial, the collection is malformed or of another schema), the
// layer keeps its picture and is HELD: the page shows what is held and since when, off air, until
// the operator decides. Nothing here takes, advances or clears a layer.
//
// THE MODEL. A layer records two facts and derives the rest:
//   - `onAir`, what the output shows: the target of the landed send with the highest number. Every
//     send this page makes is numbered in press order and the server skips a press older than one
//     it already applied (seqSend.ts), so among landed sends the highest number is what airs.
//   - `out`, the sends not answered yet, in send order: presses (a Take, an Update, or a cue with
//     no selection taken onto the layer) and corrections.
// What the page believes airs is the newest send still out, or `onAir`. An answer only ever adds
// to or removes from those two facts, so no answer can orphan another, and an undo never restores
// a snapshot that went stale while it was out. Each entity's bound (the newest revision judged,
// below which nothing is sent) is derived from what airs, what is out and what a hold judged, so
// a send that fails gives back exactly what it raised. A reload
// with a press to another entity unanswered cannot know which one airs: the layer holds, sends
// nothing, and waits for the marker or an operator press to decide (`unknown`).
//
// The layers survive a reload and an app restart in this browser (`readSelectionAir`). A page
// that did not take the layer has none and sends nothing for it.
//
// Pure: no DOM, no storage of its own; the page hands in what it reads. scripts/keyed-selection
// .test.mjs drives it, with generated walks over every kind of event against a model of the output.

import { resolveSelection, selectionGate, type SelectionResolve } from './sourceMapping.ts';
import type { CueSelection } from '../model/productionData';
import type { FieldDescriptor } from '../model/fieldModel';
import { reachedOutput, type LiveCueMap } from './liveCue.ts';
import { ATTEMPT_TIMEOUT_MS, RESEND_WINDOW_MS } from './failedSends.ts';
import type { StorePart } from './storePart';

/** One candidate a layer may show: the cue, its captured selector and entity, and the values of
 *  one revision, as sent at `at`. */
export interface AiredTarget {
  cueId: string;
  selection: CueSelection;
  /** The recipe it was resolved through (id, source, schema revision, leaf): another recipe's
   *  revisions and holds are not this one's, even for the same key. */
  scope: string;
  entity: string;
  revision: number;
  values: Record<string, string>;
  at: number;
}

/** A send not answered yet, for `cueId`. `target` null: a cue with no selection taken onto the
 *  layer. */
interface Sent {
  seq: number;
  press: boolean;
  cueId: string;
  target: AiredTarget | null;
  /** A Take or an Out: it moved this page's marker when it was sent (airState.ts
   *  `claimAndApply`), and nothing puts the marker back if it does not land (#1696). */
  moves?: true;
  /** When a press was sent. */
  at?: number;
}

/** Why a layer is held, since when, and the revision that said so (`unsent`: a correction whose
 *  send failed, which the next read of that revision sends again). */
export interface SelectionHold {
  reason: string;
  since: number;
  revision: number | null;
  unsent?: true;
}

/** What one entity's reads have held: the newest revision a hold judged (`heldAt`, which a
 *  rolled-back send never lowers) and the hold itself. The entity's bound, the newest revision
 *  judged, below which nothing is sent, is derived (`boundOf`), never stored. */
interface Marks {
  heldAt: number;
  /** The newest revision of a send whose answer was lost with a reload: it may air, so nothing
   *  older is sent, and it is sent once more (it may not). */
  lostAt?: number;
  held?: SelectionHold;
}

/** One graphic layer's live candidate. */
export interface SelectionLayer {
  /** What the output shows, by the landed send with the highest number; null: nothing captured. */
  onAir: AiredTarget | null;
  /** The sends not answered yet, in send order. */
  out: Sent[];
  /** Per entity the layer may show (`markKey`). */
  marks: Record<string, Marks>;
  /** Restored with a press to another cue or entity unanswered: one of these airs, or a cue
   *  without a selection taken onto the layer (`plains`), which is not known. Held, nothing sent,
   *  until the marker or an operator press decides. */
  unknown?: { since: number; candidates: AiredTarget[]; plains?: string[] };
  /** Restored with sends whose answers were lost: until then one of them may still reach the
   *  server (a page left and reopened inside its resend window), so nothing is decided or sent. */
  settling?: number;
  /** Since when nothing is sent on its own, until an operator press of this page lands: another
   *  screen changed the graphic (`stale`: when this page last learned so, a refusal or a command
   *  heard, on this page's clock), or a Take or an Out did not land, so the marker it moved says
   *  nothing about what airs (`moved`: the newest such press's number); both may hold. A later
   *  press of this page that lands ends `moved`; only one sent after `stale` ends `stale`.
   *  `reopened`: the page was reopened (a reload, another production and back, an app restart),
   *  and what other screens did while it was closed is not known here; it ends as `stale` does. */
  blocked?: { since: number; stale?: number; moved?: number; reopened?: true };
}

/** Every layer with a live candidate, by graphic name (the wire key, which is the layer). */
export type SelectionAir = Readonly<Record<string, SelectionLayer>>;

/** What a Take or an Update of one cue may send for its selection. */
export type SelectionTake =
  | { status: 'none' }
  | { status: 'ok'; selection: CueSelection; scope: string; entity: string; revision: number; values: Record<string, string> }
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
  /** False when this page's sends are not ordered per graphic (a page on protocol 1,
   *  hostedControl.ts `sendsInOrder`): a correction is then never sent on its own, the layer
   *  holds what airs, and the operator's own presses still go. Absent: ordered. */
  ordered?: boolean;
}

/** Resolve one selector on one graphic, with its gate. */
function resolveOn(selection: unknown, graphic: string, facts: SelectionFacts): SelectionTake & { hold?: SelectionResolve } {
  const gate = selectionGate({ selection }, facts.collections, graphic, facts.bindings);
  if (gate.status === 'none') return { status: 'none' };
  if (gate.status !== 'ok') return { status: 'refused', reason: gate.reason };
  const resolved = resolveSelection({ recipe: gate.recipe, tree: facts.tree, key: gate.selection.key, fields: facts.fieldsOf(graphic) });
  if (resolved.status !== 'ok') return { status: 'refused', reason: `Not ready: ${resolved.reason}.`, hold: resolved };
  // The field map and key belong to the recipe's identity: a field dropped from the map since leaves
  // that field on air at the old count, which only a Take or an Update may change.
  const { id, sourceId, schemaRevision, from, key, fields } = gate.recipe;
  const map = Object.entries(fields).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return { status: 'ok', selection: gate.selection, scope: JSON.stringify([id, sourceId, schemaRevision, from, key, map]), entity: resolved.entity, revision: resolved.revision, values: resolved.values };
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

// ── The layer ──────────────────────────────────────────────────────────────────────────────────

/** One entity on one cue through one recipe: the marks' key. */
const markKey = (t: AiredTarget): string => JSON.stringify([t.cueId, t.scope, t.entity]);
const sameEntity = (a: AiredTarget | null, b: AiredTarget | null): boolean => !!a && !!b && markKey(a) === markKey(b);

/** What the page believes airs: the newest send still out, or what the output shows. */
const believedOf = (l: SelectionLayer): AiredTarget | null => (l.out.length > 0 ? l.out[l.out.length - 1].target : l.onAir);

/** The layer may show any candidate it holds, whatever the marker names: a press is out, it does
 *  not know which airs, it is settling, or it is blocked (a marker this page moved, or another
 *  screen's change). */
const mayShowAny = (l: SelectionLayer): boolean => pressOut(l) || !!l.unknown || l.settling !== undefined || l.blocked !== undefined;

const pressOut = (l: SelectionLayer): boolean => l.out.some((s) => s.press);

const UNKNOWN_REASON = 'it is not known which candidate is on air after the page reloaded';
const REOPENED_REASON = 'the page reopened: press Update to follow again';
const MOVED_REASON = 'a Take or an Out did not go through, so this page does not know what airs: take or update the card to send it';
const UNANSWERED_REASON = 'a send got no answer, so it is not known which candidate is on air: press Update to send it';
const STALE_REASON = 'another screen changed this card, so a newer count is not sent on its own: press Update to send it';
const UNORDERED_REASON = 'a newer count arrived, and this page cannot send it on its own (it sends without per-graphic order): press Update to send it';

/** Keep only the marks of the entities the layer may still show. */
function pruned(l: SelectionLayer): SelectionLayer {
  const keys = new Set<string>();
  for (const t of [l.onAir, ...l.out.map((s) => s.target), ...(l.unknown?.candidates ?? [])]) if (t) keys.add(markKey(t));
  const kept = Object.keys(l.marks).filter((k) => keys.has(k));
  if (kept.length === Object.keys(l.marks).length) return l;
  return { ...l, marks: Object.fromEntries(kept.map((k) => [k, l.marks[k]])) };
}

/** No revision judged yet: finite, so the marks survive being kept as JSON. */
const NONE = Number.MIN_SAFE_INTEGER;
const marksOf = (l: SelectionLayer, t: AiredTarget): Marks => l.marks[markKey(t)] ?? { heldAt: NONE };
/** Kept as JSON reads back as it was: no key holds undefined. */
const withMarks = (l: SelectionLayer, t: AiredTarget, m: Marks): SelectionLayer => {
  const kept: Marks = { heldAt: m.heldAt };
  if (m.lostAt !== undefined) kept.lostAt = m.lostAt;
  if (m.held) kept.held = m.held;
  return { ...l, marks: { ...l.marks, [markKey(t)]: kept } };
};
/** An operator press landed: it decides what airs, and nothing older can still arrive over it
 *  (the server skips an older press once a later one applied). */
const settledLayer = ({ unknown: _unknown, settling: _settling, blocked: _blocked, ...l }: SelectionLayer): SelectionLayer => l;

/**
 * A send whose outcome is not known (lost with a reload, or failed with no answer: it may still
 * commit), folded into what the layer may show, so nothing is sent over it until that settles.
 * For the candidate on air, its revision is kept as a bound (`lostAt`); a press to another cue,
 * person or recipe makes the layer not know which airs (`unknown`).
 */
function lost(l: SelectionLayer, sends: readonly Sent[], settling: number): SelectionLayer {
  if (sends.length === 0) return l;
  if (!l.unknown && l.onAir && sends.every((s) => sameEntity(s.target, l.onAir))) {
    const m = marksOf(l, l.onAir);
    const lostAt = Math.max(m.lostAt ?? NONE, ...sends.map((s) => s.target?.revision ?? NONE));
    return withMarks({ ...l, settling: Math.max(l.settling ?? 0, settling) }, l.onAir, { ...m, ...(lostAt > l.onAir.revision ? { lostAt } : {}) });
  }
  const candidates = [...(l.unknown?.candidates ?? []), l.onAir, ...sends.map((s) => s.target)].filter((t): t is AiredTarget => t !== null);
  const plains = [...new Set([...(l.unknown?.plains ?? []), ...sends.flatMap((s) => (s.target === null ? [s.cueId] : []))])];
  if (candidates.length === 0) return l;
  return { ...l, settling: Math.max(l.settling ?? 0, settling), unknown: { since: l.unknown?.since ?? settling - SETTLE_MS, candidates, ...(plains.length > 0 ? { plains } : {}) } };
}

/** The newest revision sent for one entity: what airs and what is out for it (`t` itself counts
 *  only where it airs or is out). */
function sentOf(l: SelectionLayer, t: AiredTarget): number {
  let sent = NONE;
  for (const x of [l.onAir, ...l.out.map((s) => s.target)]) if (x && sameEntity(x, t)) sent = Math.max(sent, x.revision);
  return sent;
}
/** The newest revision judged for one entity: sent, or what a hold judged. */
const boundOf = (l: SelectionLayer, t: AiredTarget): number => Math.max(marksOf(l, t).heldAt, sentOf(l, t));

/** The events one layer changes by. */
export type SelectionEvent =
  /** A Take or an Update put this cue's selection on the layer (`take` none: a cue without one),
   *  as send `seq`. */
  | { t: 'press'; cueId: string; take: SelectionTake; seq: number; moves?: boolean; now: number }
  /** A send on another road was refused because another screen changed the graphic, or this page
   *  heard another screen's command on it. */
  | { t: 'stale'; now: number }
  /** The send numbered `seq` was answered: it reached the output, or it did not. `uncertain`: it
   *  failed without the server saying no (no answer in time), so it may still commit; `stale`:
   *  the server refused it because another screen changed the graphic since. */
  | { t: 'answer'; seq: number; landed: boolean; uncertain?: boolean; stale?: boolean; now: number }
  /** One read of the tree, with what the layer's graphic airs now and whether that is known yet;
   *  `mint` numbers a correction it sends. */
  | { t: 'follow'; live: string | undefined; seeded: boolean; facts: SelectionFacts; mint: () => number; now: number };

/** What one event did: the layer (undefined: gone), the number of a press, a correction to send. */
interface Step {
  layer: SelectionLayer | undefined;
  seq?: number;
  send?: { seq: number; values: Record<string, string> };
}

function press(l0: SelectionLayer | undefined, cueId: string, take: SelectionTake, seq: number, now: number, moves = false): Step {
  if (take.status === 'refused') return { layer: l0 };
  const target: AiredTarget | null = take.status === 'ok' ? { cueId, selection: take.selection, scope: take.scope, entity: take.entity, revision: take.revision, values: take.values, at: now } : null;
  // A cue without a selection onto a layer with none: nothing to follow.
  if (!l0 && !target) return { layer: undefined };
  const l = l0 ?? { onAir: null, out: [], marks: {} };
  // An explicit press is the operator's decision: the entity's hold ends with it once it lands (a
  // later read judges again; one that fails keeps the hold, so the held revision still goes).
  return { layer: { ...l, out: [...l.out, { seq, press: true, cueId, target, at: now, ...(moves ? { moves: true as const } : {}) }] }, seq };
}

function answer(l: SelectionLayer | undefined, seq: number, landed: boolean, now: number, uncertain = false, stale = false): Step {
  const sent = l?.out.find((s) => s.seq === seq);
  if (!l || !sent) return { layer: l };
  // Every send still out is newer than the last that landed (a landing takes every older send
  // out), so one that lands is what airs now.
  if (landed) {
    // Every older send still out was made before it and can no longer show (the server skips a
    // press older than one it applied).
    let next: SelectionLayer = { ...l, onAir: sent.target, out: l.out.filter((s) => s.seq > seq) };
    // What airs now is at or above a revision whose answer was lost: that bound is spent.
    const m = sent.target ? next.marks[markKey(sent.target)] : undefined;
    if (sent.target && m?.lostAt !== undefined && sent.target.revision >= m.lostAt) next = withMarks(next, sent.target, { ...m, lostAt: undefined });
    // A press landed: its entity's hold ends, and its bound stays at least what airs, so an older
    // read is still rejected.
    // A hold judged at a newer revision than the press's stays: that revision still goes.
    if (sent.press && sent.target) {
      const { held, ...kept } = marksOf(next, sent.target);
      if (!held || held.revision === null || held.revision <= sent.target.revision) next = withMarks(next, sent.target, kept);
    }
    // A press sent before the block began (or before another screen's change it was told of) does
    // not supersede that change: the block stays.
    // A Take or an Out that did not land is superseded by any later press of this page that lands
    // (its marker move came after); another screen's change only by a press sent after it.
    const b = l.blocked;
    const keepMoved = b?.moved !== undefined && seq <= b.moved;
    const keepStale = b?.stale !== undefined && (sent.at ?? NONE) < b.stale;
    const block =
      b && (keepMoved || keepStale)
        ? { blocked: { since: b.since, ...(keepStale ? { stale: b.stale } : {}), ...(keepMoved ? { moved: b.moved } : {}) } }
        : {};
    return { layer: pruned(sent.press ? { ...settledLayer(next), ...block } : next) };
  }
  const left: SelectionLayer = { ...l, out: l.out.filter((s) => s.seq !== seq) };
  // A Take or an Out that did not land left the marker where this page moved it when it sent, so
  // the marker can no longer decide what airs; another screen's change means the same.
  const moved = sent.press && sent.moves === true;
  const block =
    moved || stale
      ? { blocked: { ...left.blocked, since: left.blocked?.since ?? now, ...(stale ? { stale: Math.max(left.blocked?.stale ?? NONE, now) } : {}), ...(moved ? { moved: Math.max(left.blocked?.moved ?? 0, seq) } : {}) } }
      : {};
  const next: SelectionLayer = { ...left, ...block };
  // A press that failed with no answer may still commit: it is not known not to have aired, nor,
  // if it did, whether the sends before it (still out) aired first. Their answers no longer decide
  // (a later one landing may be overtaken by it); the marker or a newer press that lands does.
  if (!landed && uncertain && sent.press) {
    const before = next.out.filter((s) => s.seq < seq);
    const after = { ...next, out: next.out.filter((s) => s.seq > seq) };
    return { layer: pruned(lost(after, [...before, sent], now + SETTLE_MS)) };
  }
  // A correction that failed with no answer may have aired: nothing older goes over it.
  const kept = !landed && uncertain && !sent.press && sent.target ? (() => {
    const m = marksOf(next, sent.target);
    return withMarks(next, sent.target, { ...m, lostAt: Math.max(m.lostAt ?? NONE, sent.target.revision) });
  })() : next;
  return failedCorrection(kept, sent, landed, now);
}

function failedCorrection(next: SelectionLayer, sent: Sent, landed: boolean, now: number): Step {
  // A failed send gives back the bound it raised (derived). A failed correction that nothing newer
  // of its entity stands over is said off air "not sent" until that revision goes again, unless
  // a hold has judged a newer one since.
  // A hold at that very revision (a field was missing, then it read well and went) does not stand
  // over it; a hold at a newer one does.
  if (!landed && !sent.press && sent.target && sentOf(next, sent.target) < sent.target.revision && marksOf(next, sent.target).heldAt <= sent.target.revision) {
    const m = marksOf(next, sent.target);
    const held: SelectionHold = { reason: `the correction to revision ${sent.target.revision} was not sent`, since: m.held?.since ?? now, revision: null, unsent: true };
    return { layer: pruned(withMarks(next, sent.target, { ...m, held })) };
  }
  return { layer: pruned(next) };
}

function follow(l: SelectionLayer, graphic: string, live: string | undefined, seeded: boolean, facts: SelectionFacts, mint: () => number, now: number): Step {
  // A press is out: the marker has not moved yet and the page does not know what airs; its own
  // answer settles the layer, and the follow runs again then.
  if (pressOut(l)) return { layer: l };
  if (l.settling !== undefined) {
    if (now < l.settling) return { layer: l };
    const { settling: _settling, ...settled } = l;
    return follow(settled, graphic, live, seeded, facts, mint, now);
  }
  // A Take or an Out of this page did not land: the marker is where this page moved it, so it can
  // neither decide what airs nor drop the layer (its fields stay protected) until a press lands.
  if (l.blocked?.moved) return { layer: l };
  if (l.unknown) {
    if (live === undefined) return { layer: seeded ? undefined : l };
    const matches = l.unknown.candidates.filter((c) => c.cueId === live);
    const plain = l.unknown.plains?.includes(live) ?? false;
    if (matches.length === 0) return { layer: undefined };
    // The marker's cue was also taken without a selection: it cannot tell which airs.
    if (plain) return { layer: l };
    // The marker names a cue only one entity could be: that one airs, at its OLDEST revision any
    // send could have left (which of them landed is not known), so the follow sends anything newer
    // again and never takes a newer revision for aired when it was not.
    if (matches.every((c) => sameEntity(c, matches[0]))) {
      const onAir = matches.reduce((a, b) => (b.revision < a.revision ? b : a));
      const newest = Math.max(...matches.map((c) => c.revision));
      const m = marksOf(l, onAir);
      const lostAt = Math.max(m.lostAt ?? NONE, newest);
      const { unknown: _unknown, ...known } = l;
      // Its hold stays: a revision held for a field that comes back is still sent then.
      const { lostAt: _lost, ...kept } = m;
      const decided = pruned(withMarks({ ...known, onAir }, onAir, { ...kept, ...(lostAt > onAir.revision ? { lostAt } : {}) }));
      return follow(decided, graphic, live, seeded, facts, mint, now);
    }
    return { layer: l };
  }
  const believed = believedOf(l);
  if (!believed) return { layer: undefined };
  if ((live !== undefined && live !== believed.cueId) || (live === undefined && seeded)) return { layer: undefined };
  if (facts.readable === false || live !== believed.cueId) return { layer: l };
  if (l.blocked !== undefined) return { layer: l };
  const m = marksOf(l, believed);
  const take = resolveOn(believed.selection, graphic, facts);
  const floor = Math.max(boundOf(l, believed), m.lostAt ?? NONE);
  if (take.status === 'ok' && take.scope !== believed.scope) {
    // The recipe the captured selector names was changed under it: another source's or schema's
    // values are not this candidate's. Held until the operator takes it again.
    const reason = 'its collection recipe changed since it was taken';
    if (m.held?.reason === reason) return { layer: l };
    return { layer: withMarks(l, believed, { ...m, held: { reason, since: m.held?.since ?? now, revision: null } }) };
  }
  if (take.status === 'ok') {
    const sent = sentOf(l, believed);
    // A hold that this very revision set (the graphic's fields were missing, say) or that no
    // revision set ends when it reads well; a "not sent" hold ends only by sending.
    const lifts = !!m.held && !m.held.unsent && (m.held.revision === null || m.held.revision === take.revision);
    // A revision whose send was lost may not have aired: it goes once more, nothing older does.
    // So does one held "not sent", at the revision that bounds it.
    const newer = take.revision > floor || (take.revision === floor && take.revision > sent && (lifts || !!m.held?.unsent || take.revision === m.lostAt));
    if (newer && take.entity === believed.entity && facts.ordered === false) {
      // Nothing may send on its own: what airs is held, said off air, for the operator to take.
      if (m.held?.reason === UNORDERED_REASON) return { layer: l };
      return { layer: withMarks(l, believed, { ...m, held: { reason: UNORDERED_REASON, since: m.held?.since ?? now, revision: null } }) };
    }
    if (newer && take.entity === believed.entity) {
      const seq = mint();
      const target: AiredTarget = { ...believed, revision: take.revision, values: take.values, at: now };
      // Its hold ends; a lost revision still bounds until a send at or above it has landed.
      const next = withMarks({ ...l, out: [...l.out, { seq, press: false, cueId: believed.cueId, target }] }, believed, { ...m, held: undefined });
      return { layer: next, send: { seq, values: take.values } };
    }
    // The aired revision, newest judged, reads well again (a malformed read passed, or the
    // graphic's fields came back): the hold ends. An older revision is a re-read: nothing changes.
    if (take.revision === floor && take.revision === believed.revision && lifts) {
      return { layer: withMarks(l, believed, { ...m, held: undefined }) };
    }
    return { layer: l };
  }
  if (take.status === 'none') return { layer: l };
  const revision = take.hold?.revision ?? null;
  // An older revision that does not resolve says nothing about the newer one judged.
  if (revision !== null && revision < floor) return { layer: l };
  const reason = take.hold?.status === 'hold' ? take.hold.reason : take.reason;
  if (m.held && m.held.reason === reason && m.held.revision === revision) return { layer: l };
  const held: SelectionHold = { reason, since: m.held?.since ?? now, revision };
  const raised = revision ?? NONE;
  return { layer: withMarks(l, believed, { ...m, heldAt: Math.max(m.heldAt, raised), held }) };
}

/** One layer, one event. */
export function reduceLayer(l: SelectionLayer | undefined, graphic: string, ev: SelectionEvent): Step {
  if (ev.t === 'press') return press(l, ev.cueId, ev.take, ev.seq, ev.now, ev.moves);
  if (ev.t === 'stale') {
    if (!l) return { layer: l };
    return { layer: { ...l, blocked: { ...l.blocked, since: l.blocked?.since ?? ev.now, stale: Math.max(l.blocked?.stale ?? NONE, ev.now) } } };
  }
  if (ev.t === 'answer') return answer(l, ev.seq, ev.landed, ev.now, ev.uncertain, ev.stale);
  return l ? follow(l, graphic, ev.live, ev.seeded, ev.facts, ev.mint, ev.now) : { layer: undefined };
}

/**
 * THE reducer: a press or an answer changes one layer; a follow reads every layer against what
 * its graphic airs now (`liveCue`) and returns the corrections to send. The same object comes
 * back when nothing changed. Send numbers come from the caller, in send order and never reused
 * (`mintSend`), so an answer to a send of a layer since removed can never settle a later one.
 */
export function reduceSelection(
  air: SelectionAir,
  ev: Exclude<SelectionEvent, { t: 'follow' }> & { graphic: string },
): { air: SelectionAir; seq?: number };
export function reduceSelection(
  air: SelectionAir,
  ev: { t: 'follow'; liveCue: LiveCueMap; seeded: boolean; facts: SelectionFacts; mint: () => number; now: number },
): { air: SelectionAir; sends: { graphic: string; seq: number; values: Record<string, string> }[] };
export function reduceSelection(
  air: SelectionAir,
  ev: (Exclude<SelectionEvent, { t: 'follow' }> & { graphic: string }) | { t: 'follow'; liveCue: LiveCueMap; seeded: boolean; facts: SelectionFacts; mint: () => number; now: number },
): { air: SelectionAir; seq?: number; sends?: { graphic: string; seq: number; values: Record<string, string> }[] } {
  const put = (a: SelectionAir, graphic: string, layer: SelectionLayer | undefined): SelectionAir => {
    if (a[graphic] === layer) return a;
    const next = { ...a };
    if (layer) next[graphic] = layer;
    else delete next[graphic];
    return next;
  };
  if (ev.t !== 'follow') {
    const step = reduceLayer(air[ev.graphic], ev.graphic, ev);
    return { air: put(air, ev.graphic, step.layer), seq: step.seq };
  }
  let next = air;
  const sends: { graphic: string; seq: number; values: Record<string, string> }[] = [];
  for (const [graphic, layer] of Object.entries(air)) {
    const step = follow(layer, graphic, ev.liveCue[graphic], ev.seeded, ev.facts, ev.mint, ev.now);
    next = put(next, graphic, step.layer);
    if (step.send) sends.push({ graphic, ...step.send });
  }
  return { air: next, sends };
}

/** What the page shows for a layer: the candidate it believes airs, with its hold. `known` false:
 *  restored without knowing which candidate airs, so its values are nobody's to send. Null: no
 *  live candidate on that layer. */
export interface AiredView extends AiredTarget {
  held?: SelectionHold;
  pending: boolean;
  known: boolean;
  /** The revision the output shows of this candidate and since when, by the last landed send
   *  (a newer send may still be out); absent when it is not known to show this candidate. */
  showing?: { revision: number; at: number };
}

export function airedOf(air: SelectionAir, graphic: string): AiredView | null {
  const l = air[graphic];
  if (!l) return null;
  if (l.unknown) {
    const last = l.unknown.candidates[l.unknown.candidates.length - 1];
    return { ...last, held: { reason: l.blocked?.moved ? UNANSWERED_REASON : UNKNOWN_REASON, since: l.unknown.since, revision: null }, pending: pressOut(l), known: false };
  }
  const believed = believedOf(l);
  if (!believed) return null;
  const held = l.blocked ? { reason: l.blocked.moved ? MOVED_REASON : l.blocked.reopened ? REOPENED_REASON : STALE_REASON, since: l.blocked.since, revision: null } : l.marks[markKey(believed)]?.held;
  const showing = l.onAir && sameEntity(l.onAir, believed) ? { revision: l.onAir.revision, at: l.onAir.at } : undefined;
  return { ...believed, held, pending: pressOut(l), known: true, ...(showing ? { showing } : {}) };
}

/**
 * The values a Snap or an event may send for a candidate's fields on `cueId`: what the output
 * shows, and only while that is known for certain (nothing out, not unknown, no lost send above
 * it).
 * Otherwise none, and the verbs leave those fields alone: the newest send still out may never
 * land, and a restored layer may trail what airs.
 */
export function airedValues(air: SelectionAir, graphic: string, cueId: string): Record<string, string> | null {
  const l = air[graphic];
  // Another screen changed the graphic since: what airs is not known to be these values.
  if (!l || l.unknown || l.blocked !== undefined || l.out.length > 0 || !l.onAir || l.onAir.cueId !== cueId) return null;
  // A send whose answer was lost may have put a newer revision on air (a restored layer that is
  // settling and not unknown lost sends for the candidate on air; at its own revision they carry
  // its own values).
  const lostAt = l.marks[markKey(l.onAir)]?.lostAt;
  return lostAt !== undefined && lostAt > l.onAir.revision ? null : l.onAir.values;
}

/**
 * The selectors whose fields nothing typed or pressed may move on a layer: a candidate's values
 * there are its source's, never an operator's. While a press is out, not known or settling, every
 * candidate the layer may show, whatever cue the marker names; otherwise the one shown, when the
 * marker names its cue.
 */
export function protectedSelections(air: SelectionAir, graphic: string, live: string | undefined): CueSelection[] {
  const l = air[graphic];
  if (!l) return [];
  if (mayShowAny(l)) {
    const all = [l.onAir, ...l.out.map((s) => s.target), ...(l.unknown?.candidates ?? [])].filter((t): t is AiredTarget => t !== null);
    return [...new Map(all.map((t) => [JSON.stringify(t.selection), t.selection])).values()];
  }
  const believed = believedOf(l);
  return believed && live === believed.cueId ? [believed.selection] : [];
}

/** The fields of every candidate `protectedSelections` names, by the values captured with it: the
 *  cue's recipe may have changed or gone since, and these are the fields it put on air. */
export function protectedFields(air: SelectionAir, graphic: string, live: string | undefined): string[] {
  const l = air[graphic];
  if (!l) return [];
  const keys = (mayShowAny(l)
    ? [l.onAir, ...l.out.map((s) => s.target), ...(l.unknown?.candidates ?? [])]
    : [believedOf(l)].filter((t) => t && live === t.cueId)
  ).flatMap((t) => (t ? Object.keys(t.values) : []));
  return [...new Set(keys)];
}

/** How often a published production with live candidates reads its tree: a collection nothing
 *  binds moves it without a row to say so. The connector's own default read cadence, 5 s
 *  (docs/work-specs/playout-external-connectors/spec.md), so a revision waits at most one read. */
export const CANDIDATE_READ_MS = 5000;

/** Whether the page reads the tree on that cadence: a cue has a selection, or a layer still airs
 *  a candidate although its cue was deleted (the layer keeps airing it). */
export const followsCandidates = (cues: readonly { selection?: unknown }[], air: SelectionAir): boolean =>
  cues.some((c) => c.selection !== undefined) || Object.keys(air).length > 0;

// ── Kept across a reload ───────────────────────────────────────────────────────────────────────

/** The format the layers are kept in, per production, in this browser. */
const SELECTION_AIR_V = 2;

/** The layers as they are kept. */
export const writeSelectionAir = (air: SelectionAir): string => JSON.stringify({ v: SELECTION_AIR_V, graphics: air });

const isTarget = (t: unknown): t is AiredTarget => {
  const x = t as Partial<AiredTarget> | null;
  return (
    !!x &&
    typeof x.cueId === 'string' &&
    typeof x.scope === 'string' &&
    typeof x.entity === 'string' &&
    Number.isInteger(x.revision) &&
    typeof x.at === 'number' &&
    !!x.selection &&
    typeof x.selection === 'object' &&
    !!x.values &&
    typeof x.values === 'object' &&
    Object.values(x.values).every((v) => typeof v === 'string')
  );
};
const isMarks = (m: unknown): m is Marks => {
  const x = m as Partial<Marks> | null;
  return !!x && typeof x.heldAt === 'number' && (x.lostAt === undefined || typeof x.lostAt === 'number') && (x.held === undefined || (typeof x.held.reason === 'string' && typeof x.held.since === 'number'));
};

/**
 * One layer as a restored page holds it. Its sends' answers are gone with the page that made
 * them. Every send still out was for the entity on air (a correction, an Update of the same
 * candidate): what the output shows stands and the follow sends the newest revision again, the
 * bound back to what a hold judged. A press to another cue or entity was out: which one airs is
 * not known, and the layer holds.
 */
function restored(raw: SelectionLayer, now: number): SelectionLayer {
  // A reopened page reads the marker from the server, so it decides again, and a marker this page
  // moved no longer blocks it. What other screens did while it was closed is not known here
  // (nothing read at boot can say so for certain), so it holds what airs until an operator press
  // of this page lands (AC-3: nothing is taken, advanced or reset, and the hold is shown).
  const { blocked: _blocked, ...rest } = raw;
  const l: SelectionLayer = { ...rest, blocked: { since: now, stale: now, reopened: true } };
  // Sends this layer folded into what it does not know may still arrive from the page that went
  // away: it settles again from the reload.
  if (l.out.length === 0) return l.unknown ? { ...l, settling: Math.max(l.settling ?? 0, now + SETTLE_MS) } : l;
  // Already not known (a reload before this one): every candidate it had still may air. A layer
  // that showed nothing and had only a cue without a selection out has nothing to follow.
  return pruned(lost({ ...l, out: [] }, l.out, now + SETTLE_MS));
}

/** How long a restored layer whose sends' answers were lost waits before it decides or sends: a
 *  send of the page that went away is attempted no later than its resend window after its press,
 *  and every attempt ends by the attempt timeout. A request the server took before that and
 *  commits later is closed off by the server itself: any later send of this page supersedes it,
 *  and a new page's sends make it stale (seqSend.ts). */
export const SETTLE_MS = 2 * (RESEND_WINDOW_MS + ATTEMPT_TIMEOUT_MS);

/** When the next layer stops settling (restored, or a press failed with no answer), for one follow
 *  pass then: a quiet tree moves nothing else. Null: none is settling. */
export const nextSettle = (air: SelectionAir): number | null => {
  const at = Object.values(air).flatMap((l) => (l.settling !== undefined ? [l.settling] : []));
  return at.length > 0 ? Math.min(...at) : null;
};

/** The browser's timer, given to `watchSettling`. */
export interface SettleTimers {
  setTimeout: (run: () => void, ms: number) => number;
  clearTimeout: (id: number | undefined) => void;
}

/**
 * Follow once when the earliest settling layer stops settling, re-armed whenever the layers
 * change. Returns the stop.
 */
export function watchSettling(part: StorePart<SelectionAir>, io: { now: () => number; follow: () => void } & SettleTimers): () => void {
  let timer: number | undefined;
  let armed: number | null = null;
  const arm = () => {
    const at = nextSettle(part.get());
    if (at === armed) return;
    io.clearTimeout(timer);
    armed = at;
    // A margin past the deadline, so the follow then finds it passed.
    if (at !== null)
      timer = io.setTimeout(() => {
        armed = null;
        io.follow();
      }, Math.max(0, at - io.now()) + 100);
  };
  arm();
  const stop = part.subscribe(arm);
  return () => {
    stop();
    io.clearTimeout(timer);
  };
}

/** The kept layers, or none: anything this build did not write reads as no layer, so a restored
 *  page holds rather than follows what it cannot read. */
export function readSelectionAir(raw: string | null, now: number = Date.now()): SelectionAir {
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
  const out: Record<string, SelectionLayer> = {};
  for (const [graphic, value] of Object.entries(graphics as Record<string, unknown>)) {
    const l = value as Partial<SelectionLayer> | null;
    const sane =
      !!l &&
      (l.onAir === null || isTarget(l.onAir)) &&
      Array.isArray(l.out) &&
      l.out.every((s) => !!s && Number.isInteger(s.seq) && typeof s.press === 'boolean' && typeof s.cueId === 'string' && (s.target === null || isTarget(s.target))) &&
      !!l.marks &&
      typeof l.marks === 'object' &&
      Object.values(l.marks).every(isMarks) &&
      (l.settling === undefined || typeof l.settling === 'number') &&
      (l.blocked === undefined || (!!l.blocked && typeof l.blocked.since === 'number' && (l.blocked.stale === undefined || typeof l.blocked.stale === 'number') && (l.blocked.moved === undefined || typeof l.blocked.moved === 'number'))) &&
      (l.unknown === undefined ||
        (typeof l.unknown.since === 'number' &&
          Array.isArray(l.unknown.candidates) &&
          l.unknown.candidates.length > 0 &&
          l.unknown.candidates.every(isTarget) &&
          (l.unknown.plains === undefined || (Array.isArray(l.unknown.plains) && l.unknown.plains.every((c) => typeof c === 'string')))));
    if (!sane) continue;
    const layer = restored(l as SelectionLayer, now);
    if (layer.onAir || layer.unknown || layer.out.length > 0) out[graphic] = layer;
  }
  return out;
}

// ── The page's two doors onto the layers, over the session's `selections` part ──────────────────

/** The part the layers live in, how a change is kept (set and stored), and the clock. */
export interface SelectionAirIo {
  part: StorePart<SelectionAir>;
  keep: (air: SelectionAir) => void;
  now: () => number;
  /** Follow the newest tree at once: a revision that arrived while a press was out was passed
   *  over then, and nothing else may come to follow it. */
  followNow?: () => void;
  /** False once the page's session is disposed: a late answer then writes nothing, so it cannot
   *  overwrite what a reopened page of this production captured since (playoutSession.ts). */
  alive?: () => boolean;
}

/** Send numbers for this page: increasing, never reused while it lives. A restored page's layers
 *  have no send out, so numbering afresh after a reload meets no old send. */
let minted = 0;
export const mintSend = (): number => ++minted;

const keepIn = (io: SelectionAirIo, air: SelectionAir): void => {
  if (io.alive?.() !== false && air !== io.part.get()) io.keep(air);
};

/** How a send failed: `uncertain`, the server did not answer, so it may still commit; `stale`, the
 *  server refused it because another screen changed the graphic first (graphicVerbs.ts `Sent`). */
export interface SendFailure {
  uncertain?: true;
  stale?: true;
}

/** A Take, an Out or an Update put this cue's selection on the layer (none: a cue without one, or
 *  nothing). Its answer is `landed` or `undo` (with how it failed, if it did), once; each follows
 *  the newest tree after. `moves`: a Take or an Out, which moves this page's marker as it sends. */
export function pressSelection(io: SelectionAirIo, graphic: string, cueId: string, take: SelectionTake, moves = false): { landed: () => void; undo: (failed?: SendFailure) => void } {
  const { air, seq } = reduceSelection(io.part.get(), { t: 'press', graphic, cueId, take, seq: mintSend(), moves, now: io.now() });
  keepIn(io, air);
  let answered = false;
  const settle = (landed: boolean, failed?: SendFailure) => {
    if (answered || seq === undefined) return;
    answered = true;
    keepIn(io, reduceSelection(io.part.get(), { t: 'answer', graphic, seq, landed, uncertain: failed?.uncertain === true, stale: failed?.stale === true, now: io.now() }).air);
    io.followNow?.();
  };
  return { landed: () => settle(true), undo: (failed) => settle(false, failed) };
}

/** What a correction's send came to (graphicVerbs.ts `Sent`). */
export type FollowSent = { ok: true; skipped: readonly string[]; superseded: readonly string[] } | ({ ok: false } & SendFailure);

/**
 * One pass of following, run whenever the tree, the rundown or what is live moves: forget what is
 * no longer aired, then, once the tree is one this page may judge (`facts.readable`), send each
 * newer revision through `send` and settle it by its answer: failed (with no answer it may still
 * land; refused as stale, another screen changed the graphic), or this graphic skipped or
 * superseded by a later press, did not land.
 */
export function followAired(
  io: SelectionAirIo,
  o: { liveCue: LiveCueMap; seeded: boolean; facts: SelectionFacts; send: (graphic: string, values: Record<string, string>) => Promise<FollowSent> },
): void {
  const { air, sends } = reduceSelection(io.part.get(), { t: 'follow', liveCue: o.liveCue, seeded: o.seeded, facts: o.facts, mint: mintSend, now: io.now() });
  keepIn(io, air);
  for (const one of sends) {
    void o.send(one.graphic, one.values).then((sent) => {
      const failed = sent.ok ? {} : { uncertain: sent.uncertain === true, stale: sent.stale === true };
      keepIn(io, reduceSelection(io.part.get(), { t: 'answer', graphic: one.graphic, seq: one.seq, landed: sent.ok && reachedOutput(sent, one.graphic), ...failed, now: io.now() }).air);
    });
  }
}

/** A send on any road was refused because another screen changed these graphics: this page
 *  learned their head, so a correction would pass the server's check; nothing goes on its own
 *  there until an operator press of this page lands. */
export function staleSelection(io: SelectionAirIo, graphics: readonly string[]): void {
  let air = io.part.get();
  for (const graphic of graphics) air = reduceSelection(air, { t: 'stale', graphic, now: io.now() }).air;
  keepIn(io, air);
}

/** Whether an update's values for a live candidate's fields are none of the candidates the layer
 *  holds: someone else put them there. Values equal to one it holds (this page's own send heard
 *  late, after a reload; another desk following the same candidate) change nothing. */
function fromElsewhere(l: SelectionLayer, msg: { t: string }): boolean {
  if (msg.t !== 'update' || !(msg as { snd?: unknown }).snd) return false;
  const data = (msg as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return false;
  const held = [l.onAir, ...l.out.map((s) => s.target), ...(l.unknown?.candidates ?? [])].filter((t): t is AiredTarget => t !== null);
  const fields = new Set(held.flatMap((t) => Object.keys(t.values)));
  const keys = Object.keys(data).filter((key) => fields.has(key));
  if (keys.length === 0) return false;
  return !held.some((t) => keys.every((key) => String((data as Record<string, unknown>)[key]) === t.values[key]));
}

/** Commands this page heard for the first time that it did not send (`mine`: its own echo), from
 *  a stamped sender (server-written rows carry no stamp): an update that writes values of a live
 *  candidate's fields that are none of its candidates' makes it not this page's alone, so nothing
 *  goes there on its own until an operator press of this page, sent after hearing it, lands. A
 *  command that moves no field (a Next, an event, a marker) blocks nothing: a marker that moves
 *  makes the follow drop the layer. */
export function foreignSelection(io: SelectionAirIo, items: readonly { graphic: string; msg: { t: string } }[], mine: (msg: unknown) => boolean): void {
  let air = io.part.get();
  for (const { graphic, msg } of items) {
    const l = air[graphic];
    if (!l || mine(msg) || !fromElsewhere(l, msg)) continue;
    air = reduceSelection(air, { t: 'stale', graphic, now: io.now() }).air;
  }
  keepIn(io, air);
}


/** Whether an action carries field values (it reads some into its payload, or moves some): such
 *  an action cannot go from a page that does not know the cue on air, since the values would be
 *  another cue's (the hosted page, when a live candidate airs: control/hostedControl.ts leaves
 *  candidate cues out of what it publishes). */
export const actionCarriesValues = (button: { payload?: readonly string[]; adjust?: object; set?: object; add?: object; remove?: object }): boolean =>
  (button.payload?.length ?? 0) > 0 || [button.adjust, button.set, button.add, button.remove].some((moves) => !!moves && Object.keys(moves).length > 0);
