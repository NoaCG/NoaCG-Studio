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

import { diffResolved, replacementPatch, resolveBindings, withTreeWrites, type JsonObject, type ProductionBindings, type TreeWrite } from '../model/productionData.ts';
import type { ControlSendItem } from './hostedControl';
import type { DataPart, PlayoutSession } from './playoutSession';

export interface ProductionDataIo {
  /** False in a build with no backend: then no production has a key to read. */
  backendConfigured: boolean;
  loadLiveData: (productionId: string) => JsonObject;
  saveLiveData: (productionId: string, data: JsonObject) => void;
  /** The owner's own data key, or null (control/productionDataApi.ts). */
  productionDataKey: (productionId: string) => Promise<string | null>;
  fetchProductionData: (key: string) => Promise<{ data: Record<string, unknown> } | null>;
  patchProductionData: (key: string, patch: JsonObject) => Promise<Record<string, unknown>>;
  patchProductionDataBySlug: (slug: string, patch: JsonObject) => Promise<Record<string, unknown>>;
  /** Hear the live tree written in another tab; answers the unsubscribe. */
  onStorage: (listener: () => void) => () => void;
  /** Tell the operator something went wrong (the page's note line). */
  note: (text: string) => void;
}

/** The page's sender, for now (a temporary interface: the page's `runVerb`). */
export type DataSend = (batches: ControlSendItem[][], label: string) => unknown;

export interface ProductionDataSession {
  /** Enter a mode: `slug` null is unpublished, a slug is published. Re-seeds the tree and the
   *  dispatch baseline, reads the key when published, and answers the stop of this mode. */
  published: (slug: string | null) => () => void;
  /** The owner editing the tree (the Data workspace): one call, one write. */
  setLiveData: (next: JsonObject) => void;
  /** An operator press moving a bound value (the ± stepper, an event's `adjust`). */
  patchBoundValues: (writes: TreeWrite[]) => Promise<void>;
  /** Pull the server's tree in: at the key's arrival, and whenever a feed row says it moved. */
  refresh: () => Promise<void>;
  /** Put the bound fields' CHANGES on the wire, unpublished only. */
  dispatch: (bindings: ProductionBindings | undefined, send: DataSend) => void;
}

export function createProductionDataSession(session: PlayoutSession, io: ProductionDataIo): ProductionDataSession {
  const part = session.data;
  /** The mode this session is in: its slug, and a number that moves with every mode change, so an
   *  answer that left in an earlier mode cannot write into this one. */
  let slug: string | null = null;
  let mode = 0;
  /** What was last put on the wire, per graphic per field: the dispatch's baseline. Nothing renders
   *  from it, so it is held here and not in the part. */
  let lastResolved: Record<string, Record<string, string>> = {};

  const write = (from: number, patch: Partial<DataPart>) => {
    if (from !== mode) return;
    session.apply((parts) => {
      const moved = (Object.keys(patch) as (keyof DataPart)[]).some((field) => !Object.is(parts.data[field], patch[field]));
      // Nothing moved is no new object, so the part's listeners hear nothing.
      return moved ? { ...parts, data: { ...parts.data, ...patch } } : parts;
    });
  };

  const refresh = async (): Promise<void> => {
    const from = mode;
    const key = part.get().dataKey;
    if (!key) return;
    const current = await io.fetchProductionData(key);
    if (current) write(from, { liveData: current.data as JsonObject, treeRead: true });
  };

  return {
    published: (next) => {
      if (!session.alive()) return () => {};
      mode += 1;
      const from = mode;
      slug = next;
      const id = session.key;
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
      write(from, { liveData: id && !next ? io.loadLiveData(id) : {}, dataKey: readsKey ? undefined : null, treeRead: false });

      // THE LIVE TREE, WRITTEN IN ANOTHER TAB. The Data workspace opens in its own browser tab, and
      // an unpublished production's tree lives in localStorage; this page is the one sender, so a
      // value typed on Data has to reach it. `storage` fires in the OTHER tabs only, which is
      // exactly the ones that need telling. Published, the server's copy is the authority and the
      // API answer is what this page holds.
      const stopStorage = id && !next ? io.onStorage(() => write(from, { liveData: io.loadLiveData(id) })) : () => {};
      if (readsKey) {
        void io.productionDataKey(id).then((key) => {
          write(from, { dataKey: key });
          if (from === mode && key) void refresh();
        });
      }
      let off = () => {};
      const stop = () => {
        stopStorage();
        if (from === mode) mode += 1;
        off();
      };
      off = session.onDispose(stop);
      return stop;
    },

    /**
     * ONE CALL, ONE WRITE. This charges a persist - and, published, an HTTP PATCH against the
     * production's ingest budget - every time it is called, and it deliberately does not coalesce:
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
        .patchProductionData(dataKey, patch)
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
      const from = mode;
      const before = part.get().liveData;
      const next = withTreeWrites(before, writes);
      const patch = replacementPatch(before, next);
      if (Object.keys(patch).length === 0) return;
      // Optimistic on both roads, so the figure on screen moves with the press, and the NEXT press
      // counts from it: a round trip is long enough for several.
      write(from, { liveData: next });
      if (!slug) {
        io.saveLiveData(session.key, next);
        return;
      }
      try {
        // The ANSWER is what we hold: a feed tick that landed in the same moment is already merged
        // into it, so the press cannot silently overwrite the feed's write.
        const server = await io.patchProductionDataBySlug(slug, patch);
        write(from, { liveData: server as JsonObject });
      } catch (error) {
        if (!session.alive()) return;
        io.note(`The shared value did not move: ${(error as Error).message}`);
        void refresh();
      }
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
     * The values are resolved here from the part's own tree, so the tree and the key a dispatch
     * reads are always one moment's: a render's older tree can never pair with a newer key.
     */
    dispatch: (bindings, send) => {
      if (!session.alive()) return;
      const { liveData, dataKey } = part.get();
      // PUBLISHED, the SERVER does this half: control_data_patch resolves the bindings and appends
      // the update rows itself, and the log follower brings them back. Dispatching locally too
      // would double every write. `undefined` = the key has not resolved yet, so we do not know
      // which world we are in and must not guess: guessing "offline" airs the stale local tree.
      if (dataKey !== null) return;
      const resolved = resolveBindings(liveData, bindings);
      const changes = diffResolved(lastResolved, resolved);
      const graphics = Object.keys(changes);
      if (graphics.length === 0) return;
      lastResolved = resolved;
      void send([graphics.map((graphic) => ({ graphic, msg: { t: 'update' as const, data: changes[graphic] } }))], 'Data');
    },
  };
}
