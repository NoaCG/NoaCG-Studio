// THE PRODUCTION'S LIVE TREE ON THE PAGE: its key, its two write roads, and the dispatch of what it
// resolves to (docs/PRODUCTION_DATA_PLAN.md; production-page refactor phase 7).
//
// Held in the playout session's `data` part (./playoutSession.ts) rather than in the Data
// workspace, because the one sender is the production page's and the Data tab unmounts the
// playout surface. Runtime state: it is read from and written to model/productionState.ts or the
// server, never to the show record, which syncs and would churn per tick.
//
// PUBLISHED vs UNPUBLISHED is one fact, whether the production has a data key. Unpublished, the
// tree is localStorage and this page resolves and dispatches it. Published, `control_shows.data` is
// the authority: an edit goes out as a PATCH, the RPC writes the log rows itself, and this page
// must not also dispatch or every write doubles.
//
// Every browser door arrives through `io` (spec D5, D7): the key read, the two endpoints, the
// operator's door, localStorage and the other tabs' `storage` event. Only pure `.ts` modules are
// imported, so `scripts/production-data-session.test.mjs` drives it with fakes.

import { applyPatch, diffResolved, getPath, replacementPatch, withTreeWrites, type JsonObject, type ResolvedValues, type TreeWrite } from '../model/productionData.ts';
import { SHARED_NOT_MOVED } from './liveControls.ts';
import type { ControlSendItem } from './hostedControl';
import type { adjustProductionDataBySlug, BoundPressFailure, BoundPressWire, fetchProductionData, patchProductionData, patchProductionDataBySlug, productionDataKey } from './productionDataApi';
import type { DataPart, PlayoutSession } from './playoutSession';

/** How long a path the published row refused stays out of source writes before it is tried
 *  again: a minute, so a republish that binds it resumes it without a reload. */
const UNBOUND_RETRY_MS = 60_000;

/** THE BOUND-PRESS QUEUE (#2617; docs/work-specs/live-publishing/evidence/fix-2617.md R1 to R11).
 *  At most this many presses ride one call. */
export const PRESS_BATCH = 50;
/** A call with no answer by then is given up on and sent again: the server's own statement limit
 *  (8 s signed in) answers before it, so this only ends a lost connection. */
export const PRESS_ATTEMPT_MS = 15_000;
/** The resend's first wait and its ceiling; it doubles in between. */
export const PRESS_BACKOFF_MS = 500;
export const PRESS_BACKOFF_MAX_MS = 8_000;
/** A press never goes after this: the server keeps its id 24 hours, so a resend cannot outlive it. */
export const PRESS_MAX_AGE_MS = 60 * 60_000;

/** A press on a bound field: "add N to this path" or "make this path this text". */
export type BoundPress = { path: string; by: number } | { path: string; text: string };

/** The page's figure for presses folded onto a tree, as the server folds them (migration 0123):
 *  `adjustedValue`'s arithmetic and `retypeLeaf`'s types. */
export function foldPresses(tree: JsonObject, presses: readonly BoundPress[]): JsonObject {
  let out = tree;
  for (const press of presses) {
    const write: TreeWrite =
      'by' in press
        ? { path: press.path, text: String((parseInt(String(getPath(out, press.path) ?? ''), 10) || 0) + press.by), verb: 'adjust' }
        : { path: press.path, text: press.text, verb: 'set' };
    out = withTreeWrites(out, [write]);
  }
  return out;
}

const plural = (n: number) => (n === 1 ? '1 press' : `${n} presses`);

export interface ProductionDataIo {
  /** False in a build with no backend: then no production has a key to read. */
  backendConfigured: boolean;
  loadLiveData: (productionId: string) => JsonObject;
  saveLiveData: (productionId: string, data: JsonObject) => void;
  /** The doors of control/productionDataApi.ts, as they are there. */
  productionDataKey: typeof productionDataKey;
  /** The relative door (migration 0123). Absent, the session writes figures as today (R10). */
  adjustProductionDataBySlug?: typeof adjustProductionDataBySlug;
  fetchProductionData: typeof fetchProductionData;
  patchProductionData: typeof patchProductionData;
  patchProductionDataBySlug: typeof patchProductionDataBySlug;
  /** Hear the live tree written in another tab; answers the unsubscribe. */
  onStorage: (listener: () => void) => () => void;
  /** Tell the operator something went wrong (the page's note line). */
  note: (text: string) => void;
  /** Run `run` every `ms` until the answer is called: the timer a poll uses. */
  every?: (ms: number, run: () => void) => () => void;
  /** Run `run` once after `ms` unless the answer is called first (default: setTimeout). */
  after?: (ms: number, run: () => void) => () => void;
  /** The clock (default: Date.now). */
  now?: () => number;
  /** A press id, a uuid (default: crypto.randomUUID). */
  pressId?: () => string;
}

/** The sender the page hands in: the graphic verbs' `run` (control/graphicVerbs.ts). */
export type DataSend = (batches: ControlSendItem[][], label: string) => unknown;

export interface ProductionDataSession {
  /** Enter a mode: `slug` null is unpublished, a slug is published. Re-seeds the tree and the
   *  dispatch baseline, reads the key when published, and answers the stop of this mode. */
  published: (slug: string | null) => () => void;
  /** The owner editing the tree (the Data workspace): one call, one write. */
  setLiveData: (next: JsonObject) => void;
  /** An operator press moving a bound value by an ABSOLUTE write: a list's `add` or `remove`.
   *  Answers false when the write did not land (the note line says why). */
  patchBoundValues: (writes: TreeWrite[]) => Promise<boolean>;
  /** An operator press moving a bound value by a RELATIVE operation (the ± stepper, an event's
   *  `adjust` or `set`). Published, it is queued with a press id and sent until it lands; answers
   *  true when every press landed, false when one was refused or dropped (the note line says
   *  why). Unpublished, the local tree moves at once. */
  pressBound: (presses: BoundPress[]) => Promise<boolean>;
  /** A SOURCE READER's write (control/sheetSource.ts): a merge patch of the connected paths that
   *  changed. Answers true when it landed, false when nothing did (it is tried again), or the
   *  paths the published row does not bind yet, which were left out while the rest landed.
   *  Published, a reader writes under its lease on the row instead (`holdServerTree`); this road is
   *  its fallback on an instance that has not run migration 0097. */
  applySourcePatch: (patch: JsonObject) => Promise<boolean | string[]>;
  /** Hold the tree a published source write answered with (control/hostedControl.ts
   *  `publishedLeaseDoor`), when it is this mode's slug's: the server's answer, never an
   *  optimistic tree, so a value the row refused cannot reach PREVIEW or a Take. */
  holdServerTree: (slug: string, tree: JsonObject) => void;
  /** Pull the server's tree in: at the key's arrival, and whenever a feed row says it moved. */
  refresh: () => Promise<void>;
  /** Read the published tree every `ms` while this lasts (answers the stop), at each tick only if
   *  `wanted` answers true. A row says when a bound value moved, but a value nothing binds moves
   *  silently: a live candidate's collection (control/selectionAir.ts, E7.1) is read this way.
   *  Nothing while unpublished. */
  poll: (ms: number, wanted?: () => boolean) => () => void;
  /** Put the bound fields' CHANGES on the wire, unpublished only. `resolved` is what `tree` resolves
   *  to; a tree the part no longer holds is passed over, since the render for the newer one follows. */
  dispatch: (resolved: ResolvedValues, tree: JsonObject, send: DataSend) => void;
}

export function createProductionDataSession(session: PlayoutSession, io: ProductionDataIo): ProductionDataSession {
  const part = session.data;
  /** The mode this session is in: its slug, and a number that moves with every mode change, so an
   *  answer that left in an earlier mode cannot write into this one. */
  let slug: string | null = null;
  let mode = 0;
  /** What was last put on the wire, per graphic per field: the dispatch's baseline. Nothing renders
   *  from it, so it is held here and not in the part. */
  let lastResolved: ResolvedValues = {};
  /** Paths the published row refused as unbound, each until when it is left out of source writes:
   *  a field connected after publishing reaches the row at the next publish (C2 writes it at once),
   *  and a republish keeps the slug, so the memory lapses by itself rather than waiting for a mode
   *  change. Meanwhile one such field never holds back the connections that already work. */
  let unbound = new Map<string, number>();
  /** Which of them the operator has been told about, so the note is said once a mode. */
  let noted = new Set<string>();

  const write = (from: number, patch: Partial<DataPart>) => {
    if (from !== mode) return;
    session.apply((parts) => {
      const moved = (Object.keys(patch) as (keyof DataPart)[]).some((field) => !Object.is(parts.data[field], patch[field]));
      // Nothing moved is no new object, so the part's listeners hear nothing.
      return moved ? { ...parts, data: { ...parts.data, ...patch } } : parts;
    });
  };

  /** EVERY TREE THE SERVER ANSWERS IS NUMBERED AS ITS REQUEST STARTS: the reads and the PATCHes
   *  alike, in one count. An answer whose request started before the tree already held is older
   *  than it and is passed over, so a slow read cannot put an older tree back over a newer read
   *  or a press's answer, and a slow PATCH answer cannot put one back over a later read (E7.1,
   *  #1572). An optimistic tree holds its write's number too, so a read that left before the press
   *  cannot undo the press on screen; a lease write's tree is numbered as it arrives. Only a write
   *  the server is sent takes a number: a no-op must not pass over the read still on its way. The
   *  answers carry no version of their own, so a write answer passed over is followed by a fresh
   *  read: the read held may have left before the write landed, and an edit to an unbound value
   *  appends no row that would start one. */
  let asked = 0;
  let held = 0;
  const hold = (from: number, n: number, patch: Partial<DataPart>) => {
    if (from !== mode || n < held) return;
    held = n;
    write(from, patch);
  };
  /** A write's answer: held when it is the newest, else read again (see above). */
  const answered = (from: number, n: number, tree: JsonObject) => {
    if (from === mode && n < held) void refresh();
    else hold(from, n, { liveData: tree, treeRead: true });
  };
  /** Reads out now: R10's figure is never counted from a tree a newer read is about to replace. */
  let reading = 0;
  const refresh = async (): Promise<void> => {
    const from = mode;
    const key = part.get().dataKey;
    if (!key) return;
    const n = ++asked;
    reading += 1;
    try {
      const current = await io.fetchProductionData(key);
      if (current) hold(from, n, { liveData: current.data as JsonObject, treeRead: true });
    } finally {
      reading -= 1;
    }
  };

  /** The operator's road for a tree change: optimistic on both, so the figure on screen moves at
   *  once and the next press counts from it. Answers whether it landed. */
  const operatorWrite = async (from: number, next: JsonObject, patch: JsonObject, failed: string): Promise<boolean> => {
    if (!slug) {
      write(from, { liveData: next });
      io.saveLiveData(session.key, next);
      return true;
    }
    const n = ++asked;
    hold(from, n, { liveData: next });
    try {
      // The ANSWER is what we hold: a feed tick that landed in the same moment is already merged
      // into it, so this write cannot silently overwrite the feed's.
      answered(from, n, (await io.patchProductionDataBySlug(slug, patch)) as JsonObject);
      return from === mode;
    } catch (error) {
      if (!session.alive()) return false;
      io.note(`${failed}: ${(error as Error).message}`);
      void refresh();
      return false;
    }
  };

  // ── THE BOUND-PRESS QUEUE (#2617) ────────────────────────────────────────────────────────────
  //
  // A relative press is never in the tree (R5): the tree is the server's, and air takes the figure
  // from the server's rows. What the page holds is the queue, in press order, and its count in the
  // data part. One call is out at a time; one with no answer goes again on a doubling wait; a press
  // the server refuses is dropped and said; a failure never touches the queue or the tree beyond
  // the read every write failure already makes.
  interface Queued {
    id: string;
    press: BoundPress;
    at: number;
    slug: string;
    settle: (landed: boolean) => void;
  }
  const now = () => (io.now ? io.now() : Date.now());
  const after = (ms: number, run: () => void): (() => void) => {
    if (io.after) return io.after(ms, run);
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
  };
  const pressId = () => (io.pressId ? io.pressId() : globalThis.crypto.randomUUID());
  let queue: Queued[] = [];
  let calling = false;
  let waiting: (() => void) | null = null;
  let backoff = 0;
  /** The database has no relative door (PGRST202): figures go as today's absolute write (R10). */
  let absolute = !io.adjustProductionDataBySlug;
  /** R10's figure, computed once for the presses it covers and resent unchanged. */
  let figure: { ids: string[]; patch: JsonObject } | null = null;
  /** R10's attempts given up on but still on their way: one may commit late, so no NEW figure goes
   *  until each has settled, or it could land behind that figure and undo it. */
  const abandoned = new Set<Promise<unknown>>();

  const counted = () => {
    session.apply((parts) => (parts.data.unsent === queue.length ? parts : { ...parts, data: { ...parts.data, unsent: queue.length } }));
  };
  const settle = (ids: ReadonlySet<string>, landed: boolean) => {
    const done = queue.filter((q) => ids.has(q.id));
    if (done.length === 0) return 0;
    queue = queue.filter((q) => !ids.has(q.id));
    for (const q of done) q.settle(landed);
    return done.length;
  };
  const drop = (items: readonly Queued[], why: string) => {
    const n = settle(new Set(items.map((q) => q.id)), false);
    if (n > 0 && session.alive()) io.note(`${plural(n)} not moved: ${why}`);
  };
  const resendLater = () => {
    backoff = backoff ? Math.min(backoff * 2, PRESS_BACKOFF_MAX_MS) : PRESS_BACKOFF_MS;
    waiting = after(backoff, () => {
      waiting = null;
      void pump();
    });
  };

  /** One call out at a time, the oldest presses first; answers when that call has settled. */
  const pump = async (): Promise<void> => {
    if (calling || waiting || !session.alive()) return;
    const old = queue.filter((q) => now() - q.at > PRESS_MAX_AGE_MS);
    if (old.length > 0) drop(old, 'not sent within an hour.');
    const callSlug = slug;
    if (queue.length === 0 || callSlug === null) return counted();
    const batch = queue.filter((q) => q.slug === callSlug).slice(0, PRESS_BATCH);
    const from = mode;
    const n = ++asked;
    calling = true;
    try {
      if (absolute) await sendFigure(batch, callSlug, from, n);
      else await sendRelative(batch, callSlug, from, n);
      // An answer that settled none of the batch is no progress: wait before asking again.
      if (batch.every((q) => queue.includes(q))) resendLater();
      else backoff = 0;
    } catch (error) {
      const failure = (error as Partial<BoundPressFailure>).press;
      if (failure === 'missing') {
        absolute = true;
        backoff = 0;
      } else if (failure === 'refused') {
        drop(batch, (error as Error).message);
      } else {
        resendLater();
      }
    } finally {
      calling = false;
      counted();
    }
    if (!waiting && queue.length > 0) return pump();
  };

  const sendRelative = async (batch: readonly Queued[], callSlug: string, from: number, n: number) => {
    const abort = new AbortController();
    const cancel = after(PRESS_ATTEMPT_MS, () => abort.abort());
    const wire: BoundPressWire[] = batch.map((q) => ({ id: q.id, ...q.press }));
    let answer;
    try {
      answer = await io.adjustProductionDataBySlug!(callSlug, wire, abort.signal);
    } catch (error) {
      if ((error as Partial<BoundPressFailure>).press) throw error;
      throw Object.assign(new Error((error as Error)?.message ?? 'no answer'), { press: 'retry' as const });
    } finally {
      cancel();
    }
    // Settled whether or not its tree is the newest held: the ids landed (R5).
    settle(new Set(answer.landed), true);
    const refused = new Map(answer.refused.map((r) => [r.id, r.reason]));
    if (refused.size > 0) drop(batch.filter((q) => refused.has(q.id)), [...new Set(refused.values())].join('; '));
    answered(from, n, answer.data as JsonObject);
  };

  /** R10: no relative door. The figure the server tree and these presses make, computed once and
   *  resent unchanged, so a resend writes the same value and cannot count twice. */
  const sendFigure = async (batch: readonly Queued[], callSlug: string, from: number, n: number) => {
    const queued = new Set(queue.map((q) => q.id));
    if (!figure || !figure.ids.every((id) => queued.has(id))) {
      // Counted only from a tree read from the server and not about to be replaced, and only once
      // no earlier figure given up on can still land after it.
      if (!part.get().treeRead || reading > 0 || abandoned.size > 0) throw Object.assign(new Error('the tree is being read'), { press: 'retry' as const });
      const tree = part.get().liveData;
      figure = { ids: batch.map((q) => q.id), patch: replacementPatch(tree, foldPresses(tree, batch.map((q) => q.press))) };
    }
    const { ids, patch } = figure;
    let cancel = () => {};
    try {
      // Given up after the attempt's time, like the relative call: the figure is the same on a
      // resend, so a late commit of this one changes nothing.
      const call = Object.keys(patch).length > 0 ? io.patchProductionDataBySlug(callSlug, patch) : null;
      const gaveUp = new Promise<never>((_, reject) => {
        cancel = after(PRESS_ATTEMPT_MS, () => {
          if (call) {
            const settled = call.then(
              () => undefined,
              () => undefined,
            );
            abandoned.add(settled);
            void settled.then(() => abandoned.delete(settled));
          }
          reject(Object.assign(new Error('no answer'), { unanswered: true }));
        });
      });
      const tree = call ? ((await Promise.race([call, gaveUp])) as JsonObject) : null;
      figure = null;
      settle(new Set(ids), true);
      if (tree) answered(from, n, tree);
    } catch (error) {
      const message = (error as Error)?.message ?? '';
      if (/^(not a bound path|not a field value|hosted control is switched off|unknown control slug)/.test(message)) {
        figure = null;
        throw Object.assign(new Error(message), { press: 'refused' as const });
      }
      throw Object.assign(new Error(message || 'no answer'), { press: 'retry' as const });
    } finally {
      cancel();
    }
  };

  /** Whether a queued press of this page is on one of `paths` or inside it. */
  const queuedUnder = (paths: readonly string[]): boolean =>
    queue.some((q) => paths.some((p) => q.press.path === p || q.press.path.startsWith(`${p}.`)));

  session.onDispose(() => {
    waiting?.();
    waiting = null;
    settle(new Set(queue.map((q) => q.id)), false);
  });

  return {
    published: (next) => {
      if (!session.alive()) return () => {};
      mode += 1;
      const from = mode;
      // R9: a new address, or none, takes the old address's presses with it; a republish that
      // keeps the slug keeps them.
      const elsewhere = queue.filter((q) => q.slug !== next);
      if (elsewhere.length > 0) drop(elsewhere, 'the production is no longer published at that address (one already on its way may have landed).');
      slug = next;
      counted();
      void pump();
      const id = session.key;
      const local = Boolean(id) && !next;
      const readsKey = Boolean(next) && io.backendConfigured;
      // The local tree seeds an UNPUBLISHED production only. Published, the server's copy is the
      // authority and arrives a moment later: seeding from localStorage first would show the
      // operator a stale tree and then swap it under them. A different mode is a different
      // baseline too, so the next dispatch reconciles from scratch rather than against the old
      // values.
      //
      // `dataKey` undefined means NOT YET KNOWN, and that is load-bearing: until the key has
      // resolved, nothing may dispatch the local tree to air. A published production opened cold
      // would otherwise spend a moment believing it was offline and push the last LOCAL tree.
      lastResolved = {};
      unbound = new Map();
      noted = new Set();
      write(from, { liveData: local ? io.loadLiveData(id) : {}, dataKey: readsKey ? undefined : null, treeRead: false });

      // THE LIVE TREE, WRITTEN IN ANOTHER TAB. The Data workspace opens in its own browser tab, and
      // an unpublished production's tree lives in localStorage; this page is the one sender, so a
      // value typed on Data has to reach it. `storage` fires in the OTHER tabs only, which is
      // exactly the ones that need telling. Published, the server's copy is the authority and the
      // API answer is what this page holds.
      const stopStorage = local ? io.onStorage(() => write(from, { liveData: io.loadLiveData(id) })) : () => {};
      if (readsKey) {
        void io.productionDataKey(id).then((key) => {
          write(from, { dataKey: key });
          if (from === mode && key) void refresh();
        });
      }
      const end = () => {
        stopStorage();
        if (from === mode) mode += 1;
      };
      const off = session.onDispose(end);
      return () => {
        off();
        end();
      };
    },

    /**
     * ONE CALL, ONE WRITE. This charges a persist - and, published, a write on the production's
     * command budget - every time it is called, and it deliberately does not coalesce:
     * every caller it has is one deliberate gesture (a stepper, Apply JSON, Reset, Clear, Move
     * numbers, a finished edit). A CALLER THAT FIRES AT KEYSTROKE RATE IS THE BUG, not this
     * function's missing debounce. Deferring belongs at the box (components/home/useDeferredEdits.ts),
     * because only the box knows which text a person currently owns.
     */
    setLiveData: (next) => {
      const from = mode;
      const { liveData: before, dataKey } = part.get();
      if (!dataKey) {
        write(from, { liveData: next });
        io.saveLiveData(session.key, next);
        return;
      }
      // Published: say the change as a PATCH - including the removals, which a merge patch can
      // only express by naming them (replacementPatch). The ANSWER is what we then hold: a feed
      // tick that landed in the same moment is already merged into it, so the operator's edit
      // cannot silently overwrite the feed's. Optimistic either way, so typing stays immediate.
      const patch = replacementPatch(before, next);
      if (Object.keys(patch).length === 0) {
        write(from, { liveData: next });
        return;
      }
      const n = ++asked;
      hold(from, n, { liveData: next });
      void io
        .patchProductionData(dataKey, patch, session.key)
        .then((server) => answered(from, n, server as JsonObject))
        .catch((error: Error) => {
          if (!session.alive()) return;
          io.note(`Production data not saved: ${error.message}`);
          void refresh();
        });
    },

    /**
     * A PRESS MOVING THE SHARED VALUE - the ± stepper and an event's `adjust` on a BOUND field
     * (docs/PRODUCTION_DATA_PLAN.md §2.9's Phase 3, AC-7).
     *
     * A second door beside `setLiveData` rather than a flag on it, because the two are different
     * actors with different budgets. `setLiveData` is the OWNER editing the tree, through the
     * integrator endpoint with the owner's own data key. This is the OPERATOR pressing a button,
     * through `control_data_patch_by_slug` (migration 0060) on the control slug: its rows carry no
     * `src:'api'` mark, so a `+1` spends the ordinary command budget and never the feed's ingest
     * budget, and a saturated feed cannot refuse the operator's own score.
     *
     * WHICH WORLD WE ARE IN IS THE SLUG, not the key. A published production's tree lives on the
     * server whether or not this page managed to read its key, so testing the key would have a
     * failed key read quietly write a published production's shared values into localStorage,
     * where nothing would ever air them. The unread case cannot reach here: the page refuses the
     * press first while `treeRead` is false.
     */
    patchBoundValues: async (writes) => {
      if (writes.length === 0) return true;
      // A list write is absolute, computed from the tree as the press saw it: with a press of this
      // page still queued inside that list it would overwrite one that lands meanwhile, so it is
      // refused and said (R1).
      const lists = writes.filter((w) => w.verb === 'list').map((w) => w.path);
      if (slug && lists.length > 0 && queuedUnder(lists)) {
        if (session.alive()) io.note(`${SHARED_NOT_MOVED}: presses on that list are still sending. Press it again once they have landed.`);
        return false;
      }
      const before = part.get().liveData;
      const next = withTreeWrites(before, writes);
      const patch = replacementPatch(before, next);
      if (Object.keys(patch).length === 0) return true;
      return operatorWrite(mode, next, patch, SHARED_NOT_MOVED);
    },

    /**
     * A RELATIVE PRESS ON A BOUND FIELD (#2617): "+1 on this path", or a declared `set`.
     * Unpublished it moves the local tree at once, as a press always has. Published it is queued
     * with a press id minted here and sent until it lands; the tree stays the server's (R5), and
     * the data part's `unsent` counts it meanwhile (R7).
     */
    pressBound: (presses) => {
      if (presses.length === 0) return Promise.resolve(true);
      if (!session.alive()) return Promise.resolve(false);
      if (!slug) {
        const before = part.get().liveData;
        const next = foldPresses(before, presses);
        return operatorWrite(mode, next, replacementPatch(before, next), SHARED_NOT_MOVED);
      }
      const at = now();
      const pressSlug = slug;
      const landed = presses.map(
        (press) =>
          new Promise<boolean>((resolve) => {
            queue.push({ id: pressId(), press, at, slug: pressSlug, settle: resolve });
          }),
      );
      counted();
      void pump();
      return Promise.all(landed).then((all) => all.every(Boolean));
    },

    /**
     * THE SHEET READER'S WRITER (data-sources C1b). The same road as a press, because both write
     * values the operator's production already connected: the local tree when unpublished, and
     * published the operator's door on the control slug, which takes only bound paths and whose
     * rows spend the ordinary command budget. A reader therefore writes only connected paths,
     * and only those whose cell changed (control/sheetSource.ts `sheetWrites`).
     *
     * A merge patch onto the NEWEST tree, never a replacement: a press or a feed that landed since
     * the read began keeps its own paths.
     */
    applySourcePatch: async (patch) => {
      if (!session.alive()) return false;
      const from = mode;
      if (!slug) return operatorWrite(from, applyPatch(part.get().liveData, patch), patch, 'The Sheet’s change was not written');
      const skipped: string[] = [];
      let send = patch;
      for (const [path, until] of unbound) {
        if (until <= Date.now()) unbound.delete(path);
        if (until <= Date.now() || getPath(send, path) === undefined) continue;
        send = withoutPath(send, path);
        skipped.push(path);
      }
      // Published, the server's ANSWER is all this page holds, with no optimistic tree: a path the
      // row refuses must never sit in the local tree, where PREVIEW shows it and a Take airs it.
      // A reader is not a press, and waiting one round trip costs it nothing.
      while (Object.keys(send).length > 0) {
        const n = ++asked;
        try {
          answered(from, n, (await io.patchProductionDataBySlug(slug, send)) as JsonObject);
          break;
        } catch (error) {
          if (!session.alive() || from !== mode) return false;
          // The whole path: a Name/Value key may hold spaces ("Home score").
          const stray = /not a bound path: (.+)$/.exec((error as Error).message)?.[1]?.trim();
          if (stray && getPath(send, stray) !== undefined) {
            unbound.set(stray, Date.now() + UNBOUND_RETRY_MS);
            skipped.push(stray);
            if (!noted.has(stray)) io.note(`A field connected after publishing follows the Sheet once the production is published again (${stray}).`);
            noted.add(stray);
            send = withoutPath(send, stray);
            continue;
          }
          io.note(`The Sheet’s change was not written: ${(error as Error).message}`);
          void refresh();
          return false;
        }
      }
      if (from !== mode) return false;
      return skipped.length > 0 ? skipped : true;
    },

    holdServerTree: (from, tree) => {
      // Numbered as it arrives: a read still in flight left before it, so it is older.
      if (session.alive() && slug !== null && from === slug) hold(mode, ++asked, { liveData: tree, treeRead: true });
    },

    refresh,

    poll: (ms, wanted) => (io.every ? io.every(ms, () => void (!wanted || wanted() ? refresh() : undefined)) : () => {}),

    /**
     * The dispatch: put the CHANGES on the wire, and nothing else.
     *
     * Diffing is not an optimisation. The log caps a production at 50 commands per 5 s (migration
     * 0008) and every row fans out over Realtime to the renderer and to every open operator page,
     * so a tree with one moving value must cost ONE row rather than one per bound graphic per
     * tick. The baseline starts empty on purpose: the first pass after a mode change reconciles
     * every bound field once, which is safe because these are absolute values.
     *
     * The tree and the key a dispatch reads are one moment's: a render's older tree is passed over,
     * so it can never pair with a newer key (a mode change sets both at once).
     */
    dispatch: (resolved, tree, send) => {
      if (!session.alive()) return;
      const { liveData, dataKey } = part.get();
      if (tree !== liveData) return;
      // PUBLISHED, the SERVER does this half: control_data_patch resolves the bindings and appends
      // the update rows itself, and the log follower brings them back. Dispatching locally too
      // would double every write. `undefined` = the key has not resolved yet, so we do not know
      // which world we are in and must not guess: guessing "offline" airs the stale local tree.
      if (dataKey !== null) return;
      const changes = diffResolved(lastResolved, resolved);
      const graphics = Object.keys(changes);
      if (graphics.length === 0) return;
      lastResolved = resolved;
      void send([graphics.map((graphic) => ({ graphic, msg: { t: 'update' as const, data: changes[graphic] } }))], 'Data');
    },
  };
}

/** A merge patch without one of its paths, and without the branches that leaves empty: an empty
 *  object is itself a value to the operator door, which would refuse it. */
function withoutPath(patch: JsonObject, path: string): JsonObject {
  const [head, ...rest] = path.split('.');
  if (!(head in patch)) return patch;
  const out = { ...patch };
  const child = out[head];
  if (rest.length === 0 || typeof child !== 'object' || child === null || Array.isArray(child)) delete out[head];
  else {
    const inner = withoutPath(child, rest.join('.'));
    if (Object.keys(inner).length > 0) out[head] = inner;
    else delete out[head];
  }
  return out;
}
