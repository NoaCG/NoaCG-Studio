/**
 * THE SEND THAT KNOWS WHAT IT IS REPLACING (protocol 2, `control_send_seq`, migration 0070).
 *
 * Measured (docs/PLAYOUT_ISOLATION_RESEARCH.md §5.3, §5.6): a Take held 6 s on its way to the
 * database aired after the Out pressed 1.5 s behind it, and four presses waiting on a lock aired in
 * whatever order the lock released them, so air ended on the wrong press. Nothing on the server
 * could tell a stale press from a new one. Now every press says who pressed it and what it saw:
 *
 *   id     one uuid per page load, held in memory only. Persisting it (sessionStorage copies into a
 *          duplicated tab) would make two pages one sender, and a reload restarting the press
 *          count under a kept id would answer new presses as "already applied".
 *   press  one number per RPC payload, strictly increasing on this page, reused only by that
 *          payload's own resends. A resend of a press that applied is answered as applied.
 *   base   per graphic, the revision this page had seen WHEN THE OPERATOR PRESSED (the resolve,
 *          frames, its own answers). A press is refused as `stale` when another screen changed
 *          that graphic since; not when the only changes since were this page's own earlier
 *          presses (the chain), which the page has by definition "seen".
 *   epoch  the head's epoch: a republished production is a new log, and a press made against the
 *          old one knows nothing current.
 *
 * Plain functions over plain data, importing nothing, so scripts/seq-send.test.mjs runs them in
 * Node. The wiring is `sendControlVerb` in hostedControl.ts.
 */

import type { HeadSummary } from './seqFollow';

/** What a page knows about one production's head, per slug. */
export interface SeqSession {
  /** The epoch the page follows; null until the production has a head. */
  epoch: string | null;
  /** Per graphic, the highest revision this page has seen in that epoch. */
  revs: Map<string, number>;
}

export function createSeqSession(epoch: string | null, graphics: Record<string, HeadSummary> | null | undefined): SeqSession {
  const session: SeqSession = { epoch, revs: new Map() };
  learnHead(session, epoch, graphics);
  return session;
}

/**
 * Learn from a resolve, a frame or an answer. Within one epoch revisions only grow, so a frame
 * that arrives after a newer answer cannot pull a revision back; a new epoch starts over.
 */
export function learnHead(
  session: SeqSession,
  epoch: string | null,
  graphics: Record<string, HeadSummary> | null | undefined,
): void {
  if (epoch !== session.epoch) {
    // A head that did not exist yet (null) becoming known is the same log's first number, not a
    // new log: keep what was learned. Anything else is a republish.
    if (session.epoch !== null) session.revs.clear();
    session.epoch = epoch;
  }
  for (const [graphic, summary] of Object.entries(graphics ?? {})) {
    const rev = summary?.rev;
    if (typeof rev === 'number' && Number.isFinite(rev) && rev > (session.revs.get(graphic) ?? 0)) {
      session.revs.set(graphic, rev);
    }
  }
}

/** The `p_sender` body for one payload, read at press time. */
export interface SenderBody {
  id: string;
  press: number;
  epoch: string | null;
  base: Record<string, number>;
  all_out?: true;
}

export function senderBody(session: SeqSession, id: string, press: number, graphics: readonly string[], allOut: boolean): SenderBody {
  const base: Record<string, number> = {};
  for (const graphic of graphics) base[graphic] = session.revs.get(graphic) ?? 0;
  return { id, press, epoch: session.epoch, base, ...(allOut ? { all_out: true as const } : {}) };
}

/** A uuid for this page load: `randomUUID` where it exists, else v4 from `getRandomValues`, else
 *  from `Math.random` (the server refuses anything that is not a uuid, so the shape matters). */
export function mintSenderId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** What `control_send_seq` answered. */
export type SendAnswer =
  | { ok: true; duplicate: boolean; epoch: string | null; graphics: Record<string, HeadSummary>; skipped: string[] }
  | {
      ok: false;
      refused: 'stale' | 'superseded';
      epoch: string | null;
      graphics: Record<string, HeadSummary>;
      /** The graphics another screen changed (all of them when the epoch did). */
      stale: string[];
      /** The production was published again since this page learned its epoch. */
      epochChanged: boolean;
    };

/** Read an answer, or null when it is not one (never trusted blindly: it came over the wire). */
export function readSendAnswer(raw: unknown): SendAnswer | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as {
    ok?: unknown;
    duplicate?: unknown;
    refused?: unknown;
    why?: unknown;
    epoch?: unknown;
    graphics?: unknown;
    skipped?: unknown;
    stale?: unknown;
    head?: { graphics?: unknown } | null;
  };
  const epoch = typeof a.epoch === 'string' ? a.epoch : null;
  const summaries = (value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, HeadSummary>) : {};
  const names = (value: unknown) => (Array.isArray(value) ? value.filter((g): g is string => typeof g === 'string') : []);
  if (a.ok === true) {
    return { ok: true, duplicate: a.duplicate === true, epoch, graphics: summaries(a.head?.graphics), skipped: names(a.skipped) };
  }
  if (a.ok === false && (a.refused === 'stale' || a.refused === 'superseded')) {
    return {
      ok: false,
      refused: a.refused,
      epoch,
      graphics: summaries(a.graphics),
      stale: names(a.stale),
      epochChanged: a.why === 'epoch',
    };
  }
  return null;
}

/**
 * WHAT THE OPERATOR READS when another screen changed a graphic after they last saw it: plain
 * words, and what happened to air. Whether this page's own monitor moved anyway (it applies most
 * presses before the round trip) is the page's half of the sentence (`staleSentence`).
 */
export function staleNotice(graphics: readonly string[], epochChanged = false): string {
  if (epochChanged) return 'This production was published again while this page was open, so air did not change.';
  const named = graphics.length === 1 ? graphics[0] : graphics.length === 2 ? `${graphics[0]} and ${graphics[1]}` : 'These graphics';
  const verb = graphics.length === 1 ? 'was' : 'were';
  return `${named} ${verb} changed from another screen, so air did not change.`;
}

/** The whole notice a page shows for a stale refusal, given whether the press moved its monitor. */
export function staleSentence(e: Error, aired: boolean): string {
  return aired
    ? `${e.message} Your press is on this monitor only. Press again if you still want it.`
    : `${e.message} Press again if you still want it.`;
}

/** An Error for a stale refusal, carrying the plain sentence and the flag the pages word by. */
export function staleError(graphics: readonly string[], epochChanged = false): Error {
  return Object.assign(new Error(staleNotice(graphics, epochChanged)), { stale: true });
}

export function isStale(e: unknown): boolean {
  return (e as { stale?: unknown } | null)?.stale === true;
}

/**
 * WHAT A PAGE DOES WITH AN ANSWER: learn from it whatever it says, then
 *   landed      applied now, or a resend of a press that already applied (idempotent);
 *   superseded  this page's own LATER press on that graphic already stands, so this one must not
 *               air and nothing needs saying: what the operator pressed last is on air;
 *   throws      stale: another screen changed a touched graphic after this page last saw it (the
 *               sentence names those graphics), or the production was published again.
 * `skipped` is what an All out left alone because this page pressed those graphics again since.
 */
export function settleAnswer(
  session: SeqSession,
  answer: SendAnswer | null,
  graphics: readonly string[],
): { outcome: 'landed' | 'superseded'; skipped: string[] } {
  if (!answer) throw new Error('the server answered in a way this page cannot read');
  learnHead(session, answer.epoch, answer.graphics);
  if (answer.ok) return { outcome: 'landed', skipped: answer.skipped };
  if (answer.refused === 'superseded') return { outcome: 'superseded', skipped: [] };
  throw staleError(answer.stale.length > 0 ? answer.stale : graphics, answer.epochChanged);
}

/**
 * ONE SEND IN FLIGHT PER PAGE AND GRAPHIC.
 *
 * The server's chain rule lets a page's later press through without the page having seen its
 * earlier one's answer, which is right for every verb that REPLACES the one before (play, stop,
 * snap, a whole-field update) and wrong for the one that accumulates: two Nexts arriving in the
 * wrong order would be one Next refused (review finding ordering:F6). So the next payload for a
 * graphic leaves when the previous one answers, or when its attempt has run `releaseAfterMs`
 * without an answer (the attempt's own deadline, failedSends.ts): a stalled send must not hold the
 * next press, and if the stalled one lands after all, the chain rule refuses it as superseded.
 * A payload touching several graphics waits for all of them. All out does not queue (it is the
 * panic control, and the server never lets it undo this page's later press).
 */
export function createGraphicFifo(releaseAfterMs: number) {
  const tails = new Map<string, Promise<void>>();
  return {
    run<T>(graphics: readonly string[], send: () => Promise<T>): Promise<T> {
      const before = graphics.map((g) => tails.get(g) ?? Promise.resolve());
      let release!: () => void;
      const released = new Promise<void>((resolve) => (release = resolve));
      for (const g of graphics) tails.set(g, released);
      void released.then(() => {
        for (const g of graphics) if (tails.get(g) === released) tails.delete(g);
      });
      return Promise.all(before).then(() => {
        const timer = setTimeout(release, releaseAfterMs);
        const sent = send();
        sent.then(
          () => {
            clearTimeout(timer);
            release();
          },
          () => {
            clearTimeout(timer);
            release();
          },
        );
        return sent;
      });
    },
    /** Graphics with a send queued or in flight (tests). */
    get busy(): number {
      return tails.size;
    },
  };
}
