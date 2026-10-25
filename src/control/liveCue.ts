// THE LIVE MAP'S PURE FOLDS: which cue is on air on each layer, and when an answer may write it.
//
// Moved out of ./hostedControl.ts, which Node cannot import (its imports are extensionless and
// reach the backend), so the folds a Take, an Out and a raced answer rest on can be tested in Node
// (production-page refactor, spec §2 and §5.2). hostedControl.ts re-exports all of it, so its
// callers are unchanged. No imports: keep it that way, or Node loses it again.

/**
 * Which cue is on air ON EACH LAYER — the row-persisted snapshot, keyed by the graphic NAME
 * (the 0008 wire key, which is also the layer identity). An absent key means that layer is off
 * air; a production with three graphics up has three entries.
 *
 * Format 2 (migration 0034). A pre-0034 row carries 0031's single `{cue, graphic}` snapshot and
 * MIGRATES ON READ into the one-entry map it describes, so an unupgraded server still reports
 * its one live layer correctly (rule 6). An empty map is the honest reading of both "nothing on
 * air" and "no snapshot yet" — the cue rows on the log correct it either way.
 */
export type LiveCueMap = Record<string, string>;

/**
 * Normalize the row-persisted cue snapshot into the per-layer map (docs/CLOUD_PLAYOUT.md §4).
 * Three shapes reach this: format 2 (`{v:2, layers:{…}}`, migration 0034), format 1 (0031's
 * single `{cue, graphic}`, migrated here into the one entry it means), and nothing at all
 * (a pre-0031 server, or a production that has never taken a cue). An unrecognised version
 * degrades to an empty map rather than throwing — the log's cue rows repopulate it.
 */
export function readLiveCue(value: unknown): LiveCueMap {
  if (!value || typeof value !== 'object') return {};
  const v = value as { v?: number; layers?: unknown; cue?: string | null; graphic?: string | null };
  if ((v.v ?? 1) >= 2) {
    const layers = v.layers;
    if (!layers || typeof layers !== 'object') return {};
    const out: LiveCueMap = {};
    for (const [graphic, entry] of Object.entries(layers as Record<string, unknown>)) {
      const cue = (entry as { cue?: unknown } | null)?.cue;
      if (typeof cue === 'string' && cue) out[graphic] = cue;
    }
    return out;
  }
  return v.graphic && v.cue ? { [v.graphic]: v.cue } : {};
}

/** Apply one cue marker to the per-layer map: a cue id puts that layer on air, `null` takes it
 *  off. Off air is an ABSENT key, never a stored null, so "is this layer up" is one question.
 *  Returns the SAME map when nothing changed, so a repeated marker re-renders nothing. */
export function withLiveCue(map: LiveCueMap, graphic: string, cue: string | null): LiveCueMap {
  if (!cue) {
    if (!(graphic in map)) return map;
    const next = { ...map };
    delete next[graphic];
    return next;
  }
  return map[graphic] === cue ? map : { ...map, [graphic]: cue };
}

/**
 * WHAT A VERB'S SEND CAME TO, beyond landing (protocol 2 only; every list is empty on protocol 1).
 * A caller that writes a picture after the answer (a chip, a cue marked on or off air) must not
 * write it for any list (`leftAlone`): what stands there is this page's LATER press, which moved
 * the picture when it was pressed, and a write now would overwrite it with this older one.
 */
export interface VerbSent {
  /** Graphics the server left as this page's later press left them, the rest of the batch applied. */
  skipped: string[];
  /** Graphics of a batch refused whole: this page pressed it before its own All out. */
  superseded: string[];
  /** Graphics this page pressed again while the send was on its way: the batch landed, and the
   *  later press, applied after it, is what stands (seqSend.ts `createPressBook`). */
  pressedAgain: string[];
}

/** Every graphic a send left alone, for a caller about to write what the send changed. */
export function leftAlone(sent: VerbSent): string[] {
  return [...sent.skipped, ...sent.superseded, ...sent.pressedAgain];
}

/** Whether a send's values reached `graphic`'s output: not failed (null), and not skipped or
 *  superseded, which leave the output as a later press set it. A graphic pressed again after the
 *  send did get it; the later press then replaces it. */
export function reachedOutput(sent: { readonly skipped: readonly string[]; readonly superseded: readonly string[] } | null, graphic: string): boolean {
  return !!sent && !sent.skipped.includes(graphic) && !sent.superseded.includes(graphic);
}

/** How a send failed (control/selectionAir.ts `SendFailure`). */
interface OutFailure {
  uncertain?: true;
  stale?: true;
}

/** Outs on these graphics, as presses on their live candidates' layers (control/selectionAir.ts
 *  `pressSelection`): no correction follows them out or overtakes them. Settle with what the
 *  send came to. */
export function pressOuts(
  aired: (graphic: string, cueId: string, take: { status: 'none' }, moves: boolean) => { landed: () => void; undo: (failed?: OutFailure) => void },
  graphics: readonly string[],
): (sent: { ok: true; skipped: readonly string[]; superseded: readonly string[] } | ({ ok: false } & OutFailure)) => void {
  const presses = graphics.map((graphic) => [graphic, aired(graphic, '', { status: 'none' }, true)] as const);
  return (sent) => {
    for (const [graphic, press] of presses) {
      if (!sent.ok) press.undo(sent);
      else if (reachedOutput(sent, graphic)) press.landed();
      else press.undo();
    }
  };
}

/** One press of this page that writes a graphic's marker (a Take's cue, or null for an Out), by
 *  its number in press order. */
interface MarkerPress {
  n: number;
  cue: string | null;
}

/**
 * THIS PAGE'S MARKER PRESSES ON ONE GRAPHIC, from the first one pressed while none was out (#1696).
 * The fast road moves the marker at the press (./airState.ts `claimAndApply`), so the answers must
 * leave it where this page's presses left the output: on the newest that landed, never under a
 * newer one still out, and back when one fails.
 */
export interface MarkerTrack {
  /** The marker when the first of them was pressed: what stands when none of them lands. */
  before: string | null;
  /** Not answered yet, in press order. */
  out: MarkerPress[];
  /** The newest that landed. */
  landed: MarkerPress | null;
  /** Every cue they and `before` named: a marker naming another was moved by another screen. */
  named: (string | null)[];
}

/** Per graphic, while a marker press of this page is out on it. */
export type MarkerBook = Readonly<Record<string, MarkerTrack>>;

/** A press of number `n` sent a marker naming `cue` on `graphic`; `live` is the marker as it stood. */
export function pressMarker(book: MarkerBook, live: LiveCueMap, graphic: string, n: number, cue: string | null): MarkerBook {
  const t = book[graphic];
  const before = live[graphic] ?? null;
  const track: MarkerTrack = t ?? { before, out: [], landed: null, named: [before] };
  return { ...book, [graphic]: { ...track, out: [...track.out, { n, cue }], named: [...track.named, cue] } };
}

/**
 * Press `n`'s answer on `graphic`: `landed` when its values reached the output. Returns the book and
 * what the marker must now name (undefined: leave it). A press that landed names its cue, unless a
 * newer press of this page landed (a late older answer) or is still out (its own answer decides).
 * One that did not land puts the marker back on the newest that landed, or on what stood before
 * them, unless a newer press stands or the marker names a cue none of them did: another screen
 * moved it since. An older press still out does not count: the marker names it once it lands.
 */
export function answerMarker(book: MarkerBook, live: LiveCueMap, graphic: string, n: number, landed: boolean): { book: MarkerBook; write?: string | null } {
  const t = book[graphic];
  const press = t?.out.find((p) => p.n === n);
  if (!t || !press) return { book };
  const out = t.out.filter((p) => p.n !== n);
  const newerLanded = t.landed !== null && t.landed.n > n;
  const kept = landed && !newerLanded ? press : t.landed;
  let next: MarkerBook;
  if (out.length > 0) next = { ...book, [graphic]: { ...t, out, landed: kept } };
  else {
    const { [graphic]: _done, ...rest } = book;
    next = rest;
  }
  if (newerLanded || out.some((p) => p.n > n)) return { book: next };
  if (landed) return { book: next, write: press.cue };
  const now = live[graphic] ?? null;
  if (!t.named.includes(now)) return { book: next };
  const write = t.landed ? t.landed.cue : t.before;
  return write === now ? { book: next } : { book: next, write };
}

/** Press `n`, which got no answer, was heard landing after all: an older press still out no longer
 *  marks over it when it lands, and a newer one that fails puts it back. */
export function landedLate(book: MarkerBook, graphic: string, n: number, cue: string | null): MarkerBook {
  const t = book[graphic];
  if (!t || (t.landed !== null && t.landed.n > n)) return book;
  return { ...book, [graphic]: { ...t, landed: { n, cue }, named: [...t.named, cue] } };
}

/** Commands heard back from the server, without the cue markers `own` claims: the sender writes
 *  those from its answers and from the rows of presses that got none (graphicVerbs.ts `heard`). */
export function withoutOwnMarkers<T extends { graphic: string; msg: { t: string } }>(items: readonly T[], own: (item: T) => boolean): T[] {
  return items.filter((item) => item.msg.t !== 'cue' || !own(item));
}
