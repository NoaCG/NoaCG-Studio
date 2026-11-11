// THE OWED CUE EDIT: a typed cue edit not yet confirmed saved when the page may be going, kept in
// localStorage so a reload cannot drop it (live-publishing phase 3, repair 2).
//
// The page-hide save writes the production to the durable store, but IndexedDB takes tens of
// milliseconds to commit and a reload aborts every write still committing. localStorage is written
// synchronously and the next page reads it. One small record per production: the cue, the text it
// held when the typing started (`base`) and the typed text (`fields`). The production page takes it
// on its next visit (control/cueDraft.ts `recover`). Device-local, never synced, one key per
// account (accountScope.ts `ACCOUNT_LOCAL_KEYS`).

import { accountKey } from './accountScope.ts';

/** A cue's text, as a save writes it. */
export interface OwedCueText {
  label: string;
  note: string | null;
  values: Record<string, string>;
}

/** One production's record. */
export interface OwedCueEdit {
  cueId: string;
  base: OwedCueText;
  fields: OwedCueText;
}

export const OWED_CUE_EDITS_KEY = 'spx-gfx-owed-cue-edits';
/** The stored format. A store of another version is never read, written over or cleared here. */
const VERSION = 1;

type Stored = { v: number; shows: Record<string, OwedCueEdit> };

function load(): Stored | null {
  try {
    const raw = localStorage.getItem(accountKey(OWED_CUE_EDITS_KEY));
    if (!raw) return { v: VERSION, shows: {} };
    const s = JSON.parse(raw) as Partial<Stored> | null;
    if (!s || s.v !== VERSION || typeof s.shows !== 'object' || s.shows === null) return null;
    return { v: VERSION, shows: s.shows };
  } catch {
    return null;
  }
}

function save(s: Stored): void {
  try {
    const key = accountKey(OWED_CUE_EDITS_KEY);
    if (Object.keys(s.shows).length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(s));
  } catch {
    // No storage, or full: the store's own save is all there is, as before.
  }
}

const text = (t: unknown): OwedCueText | null => {
  const x = t as Partial<OwedCueText> | null;
  if (!x || typeof x.label !== 'string' || typeof x.values !== 'object' || x.values === null) return null;
  return { label: x.label, note: typeof x.note === 'string' ? x.note : null, values: { ...x.values } };
};

/** Record a production's owed edit, replacing any earlier one. Never throws. */
export function keepOwedCueEdit(showId: string, edit: OwedCueEdit): void {
  const s = load();
  if (!s) return;
  s.shows[showId] = edit;
  save(s);
}

/** A production's record, if a readable one is there. */
export function readOwedCueEdit(showId: string): OwedCueEdit | null {
  const e = load()?.shows[showId];
  if (!e || typeof e.cueId !== 'string') return null;
  const base = text(e.base), fields = text(e.fields);
  return base && fields ? { cueId: e.cueId, base, fields } : null;
}

/** Remove a production's record. Never throws. */
export function forgetOwedCueEdit(showId: string): void {
  const s = load();
  if (!s || !(showId in s.shows)) return;
  delete s.shows[showId];
  save(s);
}
