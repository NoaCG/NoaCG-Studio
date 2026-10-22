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

/** The graphics held for this production, by name. Empty when nothing is recorded or storage is
 *  unavailable. */
export function ownReaderHolds(showId: string): Set<string> {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + showId);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Record the graphics held for this production (the Playout page, whenever its answer changes). */
export function setOwnReaderHolds(showId: string, graphics: readonly string[]): void {
  try {
    const key = KEY_PREFIX + showId;
    const next = graphics.length > 0 ? JSON.stringify([...graphics].sort()) : null;
    if (localStorage.getItem(key) === next) return;
    if (next === null) localStorage.removeItem(key);
    else localStorage.setItem(key, next);
  } catch {
    // Storage refused: the binding doors then read the design and the copy only.
  }
}

/** Calls back when another tab records new holds (the `storage` event); answers the unsubscribe. */
export function subscribeOwnReaderHolds(showId: string, onChange: () => void): () => void {
  const listener = (e: StorageEvent) => {
    if (e.key === KEY_PREFIX + showId) onChange();
  };
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}
