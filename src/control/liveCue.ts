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
