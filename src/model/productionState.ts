// The production's LIVE data tree - runtime state, deliberately NOT part of the Show record.
//
// WHY THIS FILE EXISTS AT ALL: `Show` syncs record-level last-write-wins with conflict copies,
// and a conflict copy drops the production's capability slugs (docs/INTERACTIVE_PLAYOUT_PLAN.md
// D3). Live values move at feed rate - a clock, a score during a period - so writing them into
// the show document would bump `updatedAt` per tick, push a document sync per tick, and make a
// two-operator production mint a conflict copy that unpublishes itself mid-show. The authored
// SEED lives on the record (it is authored, it should travel, it should be exported and
// duplicated); what is true right now lives here.
//
// Plain localStorage, not the durable IndexedDB store: this is small, per-machine, never
// synced, and it changes often enough that queueing every write into the durable store's
// commit path would be churn with nothing to show for it. It survives a reload, which is the
// one durability property runtime state actually needs.

import type { JsonObject } from './productionData';

const KEY = 'spx-gfx-production-data';

/** The localStorage key the tree lives under, so another TAB can recognise a write to it.
 *  Exported because the production page listens for `storage` to pick up a value typed on the
 *  Data workspace, which now opens in its own browser tab. */
export const PRODUCTION_DATA_KEY = KEY;

type Store = Record<string, JsonObject>;

function readStore<T = Store>(key = KEY): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {} as T;
    const parsed: unknown = JSON.parse(raw);
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}) as T;
  } catch {
    // A corrupted or unreadable key is an empty tree, never a crash on the way into a
    // production page: the seed can always restore it (`Reset`).
    return {} as T;
  }
}

function writeStore(store: object, key = KEY): void {
  try {
    localStorage.setItem(key, JSON.stringify(store));
  } catch {
    // Quota or a private-mode refusal. The in-memory tree keeps working for this session; the
    // alternative - throwing into the operator's edit - would be worse on air.
  }
}

/** This production's live tree. Absent = it has not been started, which reads as `{}`. */
export function loadLiveData(showId: string): JsonObject {
  const value = readStore()[showId];
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/** Replace this production's live tree. */
export function saveLiveData(showId: string, data: JsonObject): void {
  const store = readStore();
  store[showId] = data;
  writeStore(store);
}

/** Forget this production's live tree entirely (a deleted production, or a hard clear). */
export function clearLiveData(showId: string): void {
  const store = readStore();
  if (!(showId in store)) return;
  delete store[showId];
  writeStore(store);
}

// The live candidates a page aired (control/selectionAir.ts, E7.1), per production: runtime
// state like the tree above, kept in this browser so a reload or an app restart follows the aired
// selector rather than the cue's current one. Never synced; its own key and its own `v` inside.
const SELECTION_AIR_KEY = 'spx-gfx-selection-air';

/** This production's aired live candidates as kept (selectionAir `writeSelectionAir`), or null. */
export function loadSelectionAir(showId: string): string | null {
  const value = readStore<Record<string, string>>(SELECTION_AIR_KEY)[showId];
  return typeof value === 'string' ? value : null;
}

export function saveSelectionAir(showId: string, kept: string): void {
  const store = readStore<Record<string, string>>(SELECTION_AIR_KEY);
  store[showId] = kept;
  // Quota: the page keeps following in memory; only a reload loses it.
  writeStore(store, SELECTION_AIR_KEY);
}
