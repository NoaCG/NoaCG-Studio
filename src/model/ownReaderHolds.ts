// GRAPHICS WHOSE OWN SHEET READER MAY STILL RUN ON THE PUBLISHED OUTPUT (data-sources C6), per
// production, in this browser.
//
// Only the Playout page observes the output: the payload it last saw published and the outputs'
// version reports (components/home/ProductionPage.tsx, `ownSheetReader`). The binding write path
// (shows.ts `applyBindings`) and the Data view, which opens in its own tab, cannot, so the Playout
// page writes here the graphics Connect data… holds back, and they read it: no door binds a field
// that the old reader may still write. A device-local fact, never synced: another browser has its
// own Playout page to observe its own outputs.

const KEY_PREFIX = 'spx-gfx-own-reader-holds:';
/** The graphics seen with a reader whose outputs are not yet verified on a reader-free version: kept
 *  across a reload, because a reloaded page sees only clean scripts while an output may still run
 *  an old on-air frame. */
const FORMER_PREFIX = 'spx-gfx-own-reader-former:';

function readList(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeList(key: string, graphics: Iterable<string>): void {
  try {
    const list = [...graphics];
    const next = list.length > 0 ? JSON.stringify(list.sort()) : null;
    if (localStorage.getItem(key) === next) return;
    if (next === null) localStorage.removeItem(key);
    else localStorage.setItem(key, next);
  } catch {
    // Storage refused: the binding doors then read the design and the copy only.
  }
}

/** The graphics held for this production, by name. Empty when nothing is recorded or storage is
 *  unavailable. */
export function ownReaderHolds(showId: string): Set<string> {
  return readList(KEY_PREFIX + showId);
}

/** Record the graphics held for this production (the Playout page, whenever its answer changes). */
export function setOwnReaderHolds(showId: string, graphics: readonly string[]): void {
  writeList(KEY_PREFIX + showId, graphics);
}

/** The graphics this browser has seen with a reader for this production, not yet verified gone
 *  from every output. */
export function formerReaders(showId: string): Set<string> {
  return readList(FORMER_PREFIX + showId);
}

export function setFormerReaders(showId: string, graphics: Iterable<string>): void {
  writeList(FORMER_PREFIX + showId, graphics);
}

/** Calls back when another tab records new holds (the `storage` event); answers the unsubscribe. */
export function subscribeOwnReaderHolds(showId: string, onChange: () => void): () => void {
  const listener = (e: StorageEvent) => {
    if (e.key === KEY_PREFIX + showId) onChange();
  };
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}
