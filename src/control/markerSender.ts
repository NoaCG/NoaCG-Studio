// THE LIVE MARKER FROM A SENDER'S ANSWERS (#1696, #1713): one sender's Takes and Outs, numbered at
// the press, and the marker written from what each came to. The production page's sender
// (./graphicVerbs.ts) and the hosted control page both send through it, so the marker a second
// operator reads names what is on air on either page: a failed press gives back what stood before
// it, a late older answer never marks over a newer press, and on protocol 1 the last answer stands
// (#1721). The folds are ./liveCue.ts's; this is their bookkeeping around one sender.
//
// Runtime imports carry `.ts` so Node resolves them (scripts/marker-sender.test.mjs,
// scripts/graphic-verbs.test.mjs); everything else is a type.

import type { ControlSendItem } from './hostedControl';
import { mintOid, oidOf } from './commandRoads.ts';
import { answerMarker, foreignMarker, landedLate, pressMarker, withoutOwnMarkers, type LiveCueMap, type MarkerBook } from './liveCue.ts';

/** One marker press: its graphic, its number, the cue it names (null for an Out), the batch it left
 *  in and the id its row carries. */
export type MarkerSent = { graphic: string; n: number; cue: string | null; batch: number; oid: string };

export interface MarkerSenderDeps {
  /** The live marker as the page holds it now. */
  live: () => LiveCueMap;
  /** Move the marker for one graphic. */
  mark: (graphic: string, cue: string | null) => void;
  /** Whether this sender's sends go in order per graphic (protocol 2). */
  ordered: () => boolean;
  /** The id a marker press is sent with (a test names it after the press's number). */
  mintOid?: (n: number) => string;
}

export function createMarkerSender(deps: MarkerSenderDeps) {
  let markers: MarkerBook = {};
  let markerPresses = 0;
  /** Per graphic, the number of this sender's newest marker press known to have landed. */
  const newestLanded = new Map<string, number>();
  /** Marker presses that got no answer, by the id their marker was minted with: heard later, one
   *  newer than every press known to have landed on its graphic landed after all. A row heard
   *  before the send gave up already made it a landing (hostedControl.ts `heard`). */
  const unanswered = new Map<string, MarkerSent>();
  /** The ids this sender's markers went with (bounded, the oldest go first): their rows are this
   *  sender's to write from its answers, and every other cue row is somebody else's. */
  const own = new Set<string>();
  const landedOn = (graphic: string, n: number) => newestLanded.set(graphic, Math.max(newestLanded.get(graphic) ?? 0, n));

  return {
    /** Number a send's markers at its press, batch by batch (each lands or fails on its own), and
     *  give each its id, which the send keeps (hostedControl.ts `sendControlVerb`). */
    stamp(batches: ControlSendItem[][]): { batches: ControlSendItem[][]; pressed: MarkerSent[] } {
      const pressed: MarkerSent[] = [];
      const stamped = batches.map((batch, index) =>
        batch.map((item) => {
          if (item.msg.t !== 'cue') return item;
          const n = (markerPresses += 1);
          const oid = deps.mintOid?.(n) ?? mintOid();
          pressed.push({ graphic: item.graphic, n, cue: item.msg.cue ?? null, batch: index, oid });
          return { ...item, msg: { ...item.msg, oid } };
        }),
      );
      return { batches: stamped, pressed };
    },
    /** Book them out, once nothing before the answer can throw. */
    press(pressed: readonly MarkerSent[]): void {
      const live = deps.live();
      for (const m of pressed) {
        markers = pressMarker(markers, live, m.graphic, m.n, m.cue);
        own.add(m.oid);
      }
      for (const old of own) if (own.size > 1024) own.delete(old);
    },
    /** Settle them with what the send came to, and move the marker where the answers leave it. */
    answer(sent: readonly MarkerSent[], landed: (m: MarkerSent) => boolean): void {
      const ordered = deps.ordered();
      for (const m of sent) {
        const reached = landed(m);
        if (reached) landedOn(m.graphic, m.n);
        const step = answerMarker(markers, deps.live(), m.graphic, m.n, reached, ordered);
        markers = step.book;
        if (step.write !== undefined) deps.mark(m.graphic, step.write);
      }
    },
    /** A send with no answer: its batch `batch`'s markers may still commit, and their rows heard
     *  later land them (`heardLate`). */
    unanswered(sent: readonly MarkerSent[], batch: number): void {
      for (const m of sent) if (m.batch === batch) unanswered.set(m.oid, m);
      // Bounded: the oldest go first, as with every remembered id (commandRoads.ts).
      for (const oid of unanswered.keys()) if (unanswered.size > 256) unanswered.delete(oid);
    },
    /** Rows heard back: one of a press that got no answer landed after all. */
    heardLate(items: readonly { graphic: string; msg: { t: string } }[]): void {
      const ordered = deps.ordered();
      for (const item of items) {
        const oid = oidOf(item.msg);
        const u = oid ? unanswered.get(oid) : undefined;
        if (!oid || !u || u.graphic !== item.graphic) continue;
        unanswered.delete(oid);
        // A newer press of this page landed: it stands over this one, on air and on the marker.
        // Not on protocol 1, where the late commit is the last.
        if (ordered && (newestLanded.get(u.graphic) ?? 0) > u.n) continue;
        landedOn(u.graphic, u.n);
        markers = landedLate(markers, u.graphic, u.n, u.cue, ordered);
        // A newer press still out decides with its own answer, and puts this one back if it fails.
        if (!ordered || !markers[u.graphic]?.out.some((p) => p.n > u.n)) deps.mark(u.graphic, u.cue);
      }
    },
    /**
     * The rows the page still applies: all but this sender's own cue markers, which its answers
     * write (applied, a late row of an older press would put its cue back over a newer one, #1696).
     * Every other cue row the page applies now (another screen's, or one from an earlier mount of
     * the page) is what stands over this sender's presses out there until one lands: a failure
     * gives it back. `applied`: the page already applied it, so a second arrival moves nothing.
     */
    withoutOwn<T extends { graphic: string; msg: { t: string } }>(items: readonly T[], applied?: (msg: unknown) => boolean, foreign?: (graphic: string, cue: string | null) => void): T[] {
      const rest = withoutOwnMarkers(items, (item) => own.has(oidOf(item.msg) ?? ''));
      for (const item of rest) {
        if (item.msg.t !== 'cue' || applied?.(item.msg)) continue;
        const cue = (item.msg as { cue?: string | null }).cue ?? null;
        markers = foreignMarker(markers, item.graphic, cue);
        foreign?.(item.graphic, cue);
      }
      return rest;
    },
    /** The cue the layer holds once this sender's presses out there land: the newest marker press
     *  still out on it, else the live marker as it stands. */
    onLayer(graphic: string): string | null {
      const out = markers[graphic]?.out;
      return out && out.length > 0 ? out[out.length - 1].cue : (deps.live()[graphic] ?? null);
    },
    /** The graphics whose marker a press moved and whose answer is not back yet. */
    out: (): string[] => Object.keys(markers),
  };
}

export type MarkerSender = ReturnType<typeof createMarkerSender>;
