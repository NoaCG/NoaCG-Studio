// THE TWO ROADS A PUBLISHED VERB TRAVELS, and the id that stops it arriving twice.
//
// Measured on 2026-09-10 (docs/backlog/playout-lag-when-working-the-queue.md): a published Take
// paints in 515 ms and Out in 397 ms, against 30 ms for the same production unpublished in the
// same browser a minute later. The RPC is the smaller half - 220 to 350 ms of every published
// verb is the Realtime fan-out of the inserted row, which `postgres_changes` delivers bimodally
// at about 130 ms or about 600 ms. A `broadcast` on the same backend was 50 ms, twelve times out
// of twelve, with no slow mode.
//
// So a verb now leaves the press on BOTH roads at once:
//
//   the FAST road   a Realtime broadcast on the production's own command channel, which every
//                   following surface applies the moment it lands. The sender applies its own
//                   items straight away and does not wait for anything.
//   the SLOW road   `control_send_many` exactly as before - the durable, ordered truth that
//                   recovery, the tail and a late-joining renderer read. Nothing is removed.
//
// The log keeps being the thing that is RIGHT; the broadcast is the thing that is FAST. That is
// what fixes AIR as well as the operator's own monitor: the output renderer never sent anything
// to be optimistic about, so no amount of local applying on the dashboard could have reached it.
//
// ── WHY THE ID IS MINTED HERE, ON THE CLIENT ───────────────────────────────────────────────────
//
// Both roads carry the same command, so every consumer has to apply it EXACTLY ONCE. That is not
// a detail: **a duplicate `play` leaves no trace on screen**. It re-runs an animation and settles
// on exactly the picture that was already there, so a doubled entrance is pixel-identical to a
// single one and can only be caught by a count (`data-plays`, and
// e2e/configured/playout-both-roads.spec.ts over it).
//
// IT CANNOT BE RECONCILED ON THE ID THE SERVER MINTED. The obvious design - have the RPC return
// its inserted ids and have the follower skip them - loses a race that was measured: the Realtime
// row can arrive BEFORE the RPC that created it answers, reaching a follower whose skip-set is
// still empty. Any skip-set has to exist before the send does, which means the id has to.
//
// So the command carries its own. `control_events.msg` is `jsonb` and `control_send_many`
// validates only `t` and `graphic` before inserting `msg` verbatim, so an extra key rides along
// with no migration and comes back on the row. Every consumer keeps a small set of applied `oid`s
// and applies each one once, whichever road brought it first. That is SYMMETRIC - it does not
// care which road wins - and it degrades to exactly today's behaviour when the broadcast is lost,
// because the durable row still comes.
//
// A message with NO `oid` is always applied. Rows written by the server (the production data API
// appends its own), meta rows, and anything a client from before this change wrote have no id to
// reconcile on, and the honest default for "I cannot tell" is the behaviour that was there first.

/** The command channel's broadcast event name. One event, one shape: `{ items }`. */
export const COMMAND_EVENT = 'cmd';

/**
 * HOW MANY APPLIED IDS A SURFACE REMEMBERS.
 *
 * It has to outlive the slow road's slow mode and it has to be bounded, because a long show is
 * thousands of commands. 400 is the arithmetic rather than a round number: the log caps a
 * production at 50 commands per 5 seconds (migration 0029), so 400 commands cannot be written in
 * under 40 SECONDS however hard the production is driven - and the gap this set has to bridge is
 * the fan-out's slow mode, measured at about 650 ms. Two orders of magnitude of headroom, in a
 * set that costs a few kilobytes at its ceiling.
 */
const REMEMBERED = 400;

/** Mint an id for one command. Uniqueness is the only requirement, so `randomUUID` where it
 *  exists and a counter beside `Math.random` where it does not (older CasparCG CEF builds). */
let minted = 0;
export function mintOid(): string {
  minted += 1;
  const rnd = globalThis.crypto?.randomUUID?.();
  return rnd ?? `${Date.now().toString(36)}-${minted}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Put a freshly minted id on one command. */
export function withOid<M extends object>(msg: M): M & { oid: string } {
  return { ...msg, oid: mintOid() };
}

/** The id a command carries, or null when it carries none. */
export function oidOf(msg: unknown): string | null {
  const oid = (msg as { oid?: unknown } | null)?.oid;
  return typeof oid === 'string' && oid.length > 0 ? oid : null;
}

/**
 * READ A BROADCAST FRAME, or refuse it.
 *
 * Everything on this road arrives from another CLIENT rather than from the database, so it is
 * checked the way any other untrusted input is: an array of `{graphic, msg}` where `graphic` is a
 * non-empty string and `msg` is an object naming a command in `t`. Anything else is dropped in
 * silence - a malformed frame must cost a following surface nothing, and it certainly must not
 * reach a stage.
 *
 * This is a SHAPE check and not an authorisation one. The command channel is public, joined with
 * the publishable key, and isolated by its topic being derived from the production's own id - the
 * same capability model `realtimeControl.ts` ships for exported graphics, and with the same
 * consequence written down there: anybody who knows the topic can send on it. The durable log is
 * unaffected either way, because writing THAT still needs the control slug and passes RLS.
 */
export function readCommandFrame<M>(payload: unknown): { graphic: string; msg: M }[] | null {
  const items = (payload as { items?: unknown } | null)?.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > 64) return null;
  const read: { graphic: string; msg: M }[] = [];
  for (const item of items) {
    const graphic = (item as { graphic?: unknown } | null)?.graphic;
    const msg = (item as { msg?: unknown } | null)?.msg;
    if (typeof graphic !== 'string' || graphic.length === 0) return null;
    if (!msg || typeof msg !== 'object' || typeof (msg as { t?: unknown }).t !== 'string') return null;
    read.push({ graphic, msg: msg as M });
  }
  return read;
}

/** One surface's memory of what it has already applied. */
export interface AppliedOnce {
  /**
   * Offer a command. True means APPLY IT - this surface has not seen it on either road. False
   * means it is the echo of one already applied, and applying it again would double an entrance.
   * A command with no id is always applied.
   */
  claim(msg: unknown): boolean;
  /** How many ids are remembered. For tests and for reasoning about the bound. */
  readonly size: number;
}

export function createAppliedOnce(): AppliedOnce {
  // Insertion-ordered, so evicting the oldest is reading the first key. A plain Set would do the
  // same; a Map keeps the door open for a value later without changing any call site.
  const seen = new Map<string, true>();
  return {
    claim(msg: unknown): boolean {
      const oid = oidOf(msg);
      if (oid === null) return true;
      if (seen.has(oid)) return false;
      seen.set(oid, true);
      if (seen.size > REMEMBERED) {
        const oldest = seen.keys().next();
        if (!oldest.done) seen.delete(oldest.value);
      }
      return true;
    },
    get size() {
      return seen.size;
    },
  };
}
