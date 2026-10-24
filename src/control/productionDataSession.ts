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
import type { ControlSendItem } from './hostedControl';
import type { fetchProductionData, patchProductionData, patchProductionDataBySlug, productionDataKey } from './productionDataApi';
import type { DataPart, PlayoutSession } from './playoutSession';

/** How long a path the published row refused stays out of source writes before it is tried
 *  again: a minute, so a republish that binds it resumes it without a reload. */
const UNBOUND_RETRY_MS = 60_000;

export interface ProductionDataIo {
  /** False in a build with no backend: then no production has a key to read. */
  backendConfigured: boolean;
  loadLiveData: (productionId: string) => JsonObject;
  saveLiveData: (productionId: string, data: JsonObject) => void;
  /** The doors of control/productionDataApi.ts, as they are there. */
  productionDataKey: typeof productionDataKey;
  fetchProductionData: typeof fetchProductionData;
  patchProductionData: typeof patchProductionData;
  patchProductionDataBySlug: typeof patchProductionDataBySlug;
  /** Hear the live tree written in another tab; answers the unsubscribe. */
  onStorage: (listener: () => void) => () => void;
  /** Tell the operator something went wrong (the page's note line). */
  note: (text: string) => void;
}

/** The sender the page hands in: the graphic verbs' `run` (control/graphicVerbs.ts). */
export type DataSend = (batches: ControlSendItem[][], label: string) => unknown;

export interface ProductionDataSession {
  /** Enter a mode: `slug` null is unpublished, a slug is published. Re-seeds the tree and the
   *  dispatch baseline, reads the key when published, and answers the stop of this mode. */
  published: (slug: string | null) => () => void;
  /** The owner editing the tree (the Data workspace): one call, one write. */
  setLiveData: (next: JsonObject) => void;
  /** An operator press moving a bound value (the ± stepper, an event's `adjust`). */
  patchBoundValues: (writes: TreeWrite[]) => Promise<void>;
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

  /** Reads of the published tree, numbered as they start: an answer that started before one
   *  already held is older than it, and is passed over (a slow read must not put an older tree
   *  back, E7.1). */
  let reads = 0;
  let readHeld = 0;
  const refresh = async (): Promise<void> => {
    const from = mode;
    const key = part.get().dataKey;
    if (!key) return;
    const n = ++reads;
    const current = await io.fetchProductionData(key);
    if (!current || n < readHeld) return;
    readHeld = n;
    write(from, { liveData: current.data as JsonObject, treeRead: true });
  };

  /** The operator's road for a tree change: optimistic on both, so the figure on screen moves at
   *  once and the next press counts from it. Answers whether it landed. */
  const operatorWrite = async (from: number, next: JsonObject, patch: JsonObject, failed: string): Promise<boolean> => {
    write(from, { liveData: next });
    if (!slug) {
      io.saveLiveData(session.key, next);
      return true;
    }
    try {
      // The ANSWER is what we hold: a feed tick that landed in the same moment is already merged
      // into it, so this write cannot silently overwrite the feed's.
      const server = await io.patchProductionDataBySlug(slug, patch);
      write(from, { liveData: server as JsonObject });
      return from === mode;
    } catch (error) {
      if (!session.alive()) return false;
      io.note(`${failed}: ${(error as Error).message}`);
      void refresh();
      return false;
    }
  };

  return {
    published: (next) => {
      if (!session.alive()) return () => {};
      mode += 1;
      const from = mode;
      slug = next;
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
      // Optimistic either way, so typing stays immediate.
      write(from, { liveData: next });
      if (!dataKey) {
        io.saveLiveData(session.key, next);
        return;
      }
      // Published: say the change as a PATCH - including the removals, which a merge patch can
      // only express by naming them (replacementPatch). The ANSWER is what we then hold: a feed
      // tick that landed in the same moment is already merged into it, so the operator's edit
      // cannot silently overwrite the feed's.
      const patch = replacementPatch(before, next);
      if (Object.keys(patch).length === 0) return;
      void io
        .patchProductionData(dataKey, patch, session.key)
        .then((server) => write(from, { liveData: server as JsonObject }))
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
      if (writes.length === 0) return;
      const before = part.get().liveData;
      const next = withTreeWrites(before, writes);
      const patch = replacementPatch(before, next);
      if (Object.keys(patch).length === 0) return;
      await operatorWrite(mode, next, patch, 'The shared value did not move');
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
        try {
          const server = await io.patchProductionDataBySlug(slug, send);
          write(from, { liveData: server as JsonObject });
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
      if (session.alive() && slug !== null && from === slug) write(mode, { liveData: tree });
    },

    refresh,

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
