// THE PLAYOUT SERVER'S STATE ON THE PAGE, in two parts that change at two speeds
// (docs/CLIP_PLAYBACK_PLAN.md §10, "two kinds of server state").
//
//   OWNERSHIP  which cue is up on which slot (./serverPlayout `ServerOnAir`), and what else the
//              server says that changes only on an action or a switch: the last accepted
//              generation per slot, a cue replaced on the server, an unidentified item, what waits
//              to play next (./serverState `ServerOwnership`). It is what the verbs, All out and the
//              rundown's ON AIR read.
//   TIMING     where each slot's clip is in its segment, by slot address, from the Bridge's reading
//              twice a second or the page's own count from its Take (./serverState `SlotTiming`).
//
// Each part is its own subscription, so a consumer re-renders only for the part it reads: the
// clip clock and the rows' remaining times subscribe to TIMING, and nothing that decides what a
// verb may do ever does. A page that re-rendered twice a second would retype every field it holds
// (plan §18, case 15).
//
// Both parts are plain data, so everything a hardware panel would light - on air, the clip's
// remaining time, HOLDING, PAUSED, the 10 and 5 second warnings, NEXT ON SERVER - is read from here
// through ./serverState's functions, never from inside a component
// (https://github.com/NoaCG/NoaCG-Studio/issues/809).
//
// No React in here: a surface reads a part with `useSyncExternalStore(part.subscribe, part.get)`.
// Kept plain so a Node test can import it, and one store is made per page, so it lives exactly as
// long as the state it replaced.

import { clearVmixState, NO_OWNERSHIP, type ServerOwnership, type ServerParts, type ServerTiming } from './serverState.ts';
import type { SlotState, VmixPlayer } from './playoutProtocol';
import { slotAddress } from './playoutSlots.ts';
import { storePart, type StorePart } from './storePart.ts';

export type { ServerOwnership, ServerTiming };

// The part primitive lives in ./storePart.ts, shared with the playout session; re-exported here.
export type { StorePart };

export interface ServerPlayoutStore {
  ownership: StorePart<ServerOwnership>;
  timing: StorePart<ServerTiming>;
  /** Move both parts at once with one of ./serverState's folds. Each part's listeners hear only
   *  its own change, so a reading that moved only the clock reaches only the clock. */
  apply: (fold: (parts: ServerParts) => ServerParts) => void;
  bindVmix: (binding: string | null) => void;
  vmixBinding: () => { key: string } | null;
  /** Admission is checked when the reply is ready to fold, using the turn that sent the action. */
  runVmix: <T>(player: VmixPlayer, work: (accept: (session: string, generation: number) => boolean, sessionUnchanged: () => boolean) => Promise<T>) => Promise<T>;
  /** Capture before a read. Admission checks both command fences and the shared Bridge session. */
  observeVmix: () => (session: string, observedAt: number, rows: readonly SlotState[]) => SlotState[];
}

const players = ['clips', 'audio'] as const;

export function createServerPlayoutStore(): ServerPlayoutStore {
  const ownership = storePart<ServerOwnership>(NO_OWNERSHIP);
  const timing = storePart<ServerTiming>({});
  let binding: { key: string } | null = null;
  let bridgeSession: string | undefined;
  const retired = new Set<string>();
  const observed = new Map<VmixPlayer, { generation: number; at: number }>();
  const turns = new Map<VmixPlayer, Promise<void>>();
  const playerEpoch = { clips: 0, audio: 0 };
  const apply: ServerPlayoutStore['apply'] = (fold) => {
    const next = fold({ ownership: ownership.get(), timing: timing.get() });
    timing.set(next.timing);
    ownership.set(next.ownership);
  };
  const admitSession = (next: string, before: string | undefined) => {
    if (next === bridgeSession) return true;
    if (retired.has(next) || before !== bridgeSession) return false;
    const previous = bridgeSession;
    bridgeSession = next;
    if (previous !== undefined) {
      retired.add(previous);
      observed.clear();
      apply(clearVmixState);
    }
    return true;
  };
  const generationOf = (player: VmixPlayer) =>
    ownership.get().generations[slotAddress({ adapter: 'vmix', player })]?.generation ?? 0;

  return {
    ownership,
    timing,
    apply,
    bindVmix: (next) => {
      if (next === (binding?.key ?? null)) return;
      binding = next === null ? null : { key: next };
      bridgeSession = undefined;
      retired.clear();
      observed.clear();
      apply(clearVmixState);
    },
    vmixBinding: () => binding,
    runVmix: (player, work) => {
      // Player verbs act on the current mixer selection. Read ownership and send in the
      // same turn, even when a prior request is still finishing on the old pairing.
      playerEpoch[player] += 1;
      const turn = (turns.get(player) ?? Promise.resolve()).then(() => {
        const before = bridgeSession;
        return work((session, generation) => admitSession(session, before)
          && generation >= Math.max(generationOf(player), observed.get(player)?.generation ?? 0), () => bridgeSession === before);
      });
      const done = turn.then(() => undefined, () => undefined);
      turns.set(player, done);
      return turn.finally(() => { if (turns.get(player) === done) turns.delete(player); });
    },
    observeVmix: () => {
      const scope = binding;
      const before = bridgeSession;
      const eligible = players.filter(player => !turns.has(player));
      const epochs = { ...playerEpoch };
      return (session, observedAt, rows) => {
        if (!scope || binding !== scope) return [];
        const available = rows.filter(row => row.player && eligible.includes(row.player)
          && !turns.has(row.player) && epochs[row.player] === playerEpoch[row.player]);
        if (!available.length || !admitSession(session, before)) return [];
        return available.filter(row => {
          const player = row.player!;
          const last = observed.get(player);
          if (row.generation < Math.max(generationOf(player), last?.generation ?? 0) || observedAt < (last?.at ?? 0)) return false;
          observed.set(player, { generation: row.generation, at: observedAt });
          return true;
        });
      };
    },
  };
}
