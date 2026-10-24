// THE CUE BEING TYPED: the selected cue's unsaved edits, echoed at once and saved to the record on a
// 300 ms idle, on a switch, before a verb reads it and when the page may go (production-page
// refactor spec §2, phase 13).
//
// Moved out of ProductionPage with its order, timing and guards unchanged. The draft lives in the
// session's `draft` part, written only here with one `session.apply` each, so the editor, the
// rundown rows and the PREVIEW monitor each subscribe to it themselves and typing re-renders none of
// the page (D12). The page subscribes to one value only (its `useDrawnDraft` over `unsentNow`), which
// changes when the list of unsent fields does and not with every character. Whether a save is owed
// and its idle timer are this module's: nothing draws them.
//
// What a verb reads: it awaits `flush` and then reads `view`, which reads the part as it stands at
// that moment, never a render's copy. While the save is out the draft stays and `view` answers it;
// once the save is confirmed the draft goes and `view` answers the newest record the page rendered.
// The history hands the page that record when the store accepts the write, before it confirms it,
// so the record holds the text unless the store confirms before React renders (as the page's old
// `cueView` relied on too).
//
// The page's refs and callbacks, mapped:
//
//   draft state, draftRef            the `draft` part
//   draftPending, flushTimer         `pending` and `timer` here
//   draftOwner (the save's guard)    the session: a session is one production, and its end drops
//                                    every late answer. The page's `writeCue` still checks it,
//                                    because the history it writes through is the page's and moves
//                                    to the next production before this session ends
//   editDraft                        `edit(cue, patch)`
//   flushDraft, cancelDraft          `flush()`, `cancel()`
//   retainClosingDraft               the synchronous save on `onPageHide` and at the session's end
//   cueView, cueLabel's draft half   `view(cue)`, `label(cueId)`
//   unsentOf                         `unsent(cue, aired, bound)`, and `unsentNow` for the page
//
// Browser IO comes in through `io` (the history's write, the store's synchronous write, the account
// gate, the newest record) and the browser's events and timers through adapters, so a Node test
// drives it with fakes. Only types are imported.

import type { DraftPart, PlayoutSession } from './playoutSession';

/** How long typing must pause before the draft is saved. */
export const FLUSH_DELAY_MS = 300;

/** A cue's text as the editor shows it. */
export type CueText = Omit<DraftPart, 'cueId'>;

/** A cue's record, as much of it as the draft reads. */
export interface CueRecord {
  id: string;
  label: string;
  note?: string | null;
  values: Record<string, string>;
  /** A live candidate's selector (model/shows.ts `ShowCue.selection`), when it has one. */
  selection?: unknown;
}

/** An edit: a new label, a new note, or some fields' values. */
export type CueEdit = Partial<Pick<CueText, 'label' | 'note'>> & { values?: Record<string, string> };

/** What a save writes. */
export interface CueFields {
  label: string;
  note: string | null;
  values: Record<string, string>;
}

/** The browser half the page hands in. */
export interface CueDraftIo {
  /** Whether this account may write the record now. */
  canWrite: () => boolean;
  /** An edit is starting: tell the account's sync, and open (or continue) the history's edit group. */
  editing: (group: string) => void;
  /** Save through the rundown history, answering whether the store confirmed it. */
  writeCue: (cueId: string, fields: CueFields) => Promise<boolean>;
  /** Save at once, with no history and nothing to await: whether the store accepted it. */
  retainCue: (cueId: string, fields: CueFields) => boolean;
  /** The newest record of a cue, if the production holds it. */
  record: (cueId: string) => CueRecord | undefined;
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (timer: unknown) => void;
}

/** The browser's moments, for `listen`; each answers its unsubscribe. */
export interface CueDraftAdapters {
  /** The page may be gone before a promise settles: it is hidden, closing, or the account pauses. */
  onPageHide: (run: () => void) => () => void;
  /** The account asks every surface to save what it holds. */
  onFlushAsked: (run: () => void) => () => void;
}

export interface CueDraft {
  /** The edit being typed (`session.draft`), or null. */
  part: PlayoutSession['draft'];
  /** Type into `cue`: the draft starts from it, or carries on if it is already this cue's. */
  edit: (cue: CueRecord, patch: CueEdit) => void;
  /** Save now if a save is owed; answers whether the record holds the draft (true if nothing was owed). */
  flush: () => Promise<boolean>;
  /** Drop the draft unsaved. */
  cancel: () => void;
  /** The cue as the operator sees it: the draft over the newest record. */
  view: (cue: CueRecord) => CueText;
  /** A cue's label as the operator sees it, null if the production has no such cue. */
  label: (cueId: string) => string | null;
  /** The fields of `cue` whose values differ from what air was sent, bound fields aside. */
  unsent: (cue: CueRecord, aired: Readonly<Record<string, string>> | undefined, bound: Readonly<Record<string, string>>) => string[];
  /** Listen to the browser's moments while the page shows this draft; the stop answered also saves
   *  at once what is owed. */
  listen: (adapters: CueDraftAdapters) => () => void;
}

/** A cue's text from the draft when the draft is this cue's, else from the record. */
export function viewOf(draft: DraftPart | null, cue: CueRecord): CueText {
  return draft && draft.cueId === cue.id ? draft : { label: cue.label, note: cue.note ?? '', values: cue.values };
}

/** The fields whose values differ from what air was sent. A BOUND field is not a cue value (plan
 *  §2.7): Take and ✎ Update air the tree's figure for it, so its stored value differing from air is
 *  not an edit anyone made and never "unsent". */
export function unsentFields(
  values: Readonly<Record<string, string>>,
  aired: Readonly<Record<string, string>> | undefined,
  bound: Readonly<Record<string, string>>,
): string[] {
  return Object.entries(values)
    .filter(([field, value]) => !bound[field] && (aired?.[field] ?? '') !== value)
    .map(([field]) => field);
}

/** The history group an edit belongs to: one per cue and per thing typed into, so a run of
 *  keystrokes in one box is one undo step. */
export function editGroup(cueId: string, patch: CueEdit): string {
  return `${cueId}:${patch.label !== undefined ? 'label' : patch.note !== undefined ? 'note' : Object.keys(patch.values ?? {}).sort().join(',')}`;
}

/** What the page needs to know of the draft (D12): the edited cue's unsent fields and the on-air
 *  cues that have any. The page compares it by value, so it renders only when a list changes. */
export function unsentNow(
  draft: CueDraft,
  editing: { cue: CueRecord; graphic: string } | null,
  onAir: readonly { cue: CueRecord; graphic: string }[],
  aired: Readonly<Record<string, Readonly<Record<string, string>>>>,
  /** A graphic's fields that are never unsent for this cue: bound to the tree, or its live candidate's. */
  boundOf: (graphic: string, cue: CueRecord) => Readonly<Record<string, string>>,
): { fields: string[]; cues: string[] } {
  return {
    fields: editing ? draft.unsent(editing.cue, aired[editing.graphic], boundOf(editing.graphic, editing.cue)) : [],
    cues: onAir.filter(({ cue, graphic }) => draft.unsent(cue, aired[graphic], boundOf(graphic, cue)).length > 0).map(({ cue }) => cue.id),
  };
}

const fieldsOf = (d: DraftPart): CueFields => ({ label: d.label, note: d.note || null, values: d.values });

export function createCueDraft(session: PlayoutSession, io: CueDraftIo): CueDraft {
  const part = session.draft;
  /** Whether the draft holds edits the record does not have yet. */
  let pending = false;
  let timer: unknown = null;
  const set = (draft: DraftPart | null) => session.apply((parts) => ({ ...parts, draft }));
  const stopTimer = () => {
    if (timer !== null) io.clearTimeout(timer);
    timer = null;
  };

  const flush = (): Promise<boolean> => {
    stopTimer();
    const d = part.get();
    // After the session's end nothing is owed: the end saved it, and an edit starts nothing.
    if (!d || !pending || !io.canWrite()) return Promise.resolve(true);
    pending = false;
    return io.writeCue(d.cueId, fieldsOf(d)).then((saved) => {
      // Typing went on during the save, or the session ended: the newer draft is still owed.
      if (part.get() === d && session.alive()) {
        if (saved) set(null);
        else pending = true;
      }
      return saved;
    });
  };

  /** Save synchronously what is owed: pausing and teardown cannot await a microtask. The draft
   *  stays; no history survives this boundary. */
  const retain = () => {
    const d = part.get();
    if (d && pending && io.canWrite() && io.retainCue(d.cueId, fieldsOf(d))) pending = false;
  };

  const view = (cue: CueRecord) => viewOf(part.get(), io.record(cue.id) ?? cue);

  // The session's end: what is owed is saved now, the idle save never comes, and every answer
  // after this changes nothing (the part takes no fold once the session ended).
  session.onDispose(() => {
    retain();
    stopTimer();
    pending = false;
  });

  return {
    part,
    edit: (cue, patch) => {
      if (!session.alive() || !io.canWrite()) return;
      const d = part.get();
      io.editing(editGroup(cue.id, patch));
      const base: DraftPart = d && d.cueId === cue.id ? d : { cueId: cue.id, label: cue.label, note: cue.note ?? '', values: { ...cue.values } };
      // Set before the timer, so a flush in this same tick sees the edit.
      set({ ...base, ...patch, values: { ...base.values, ...(patch.values ?? {}) } });
      pending = true;
      stopTimer();
      timer = io.setTimeout(() => void flush(), FLUSH_DELAY_MS);
    },
    flush,
    // Nothing is owed without a draft, and the next edit owes its own.
    cancel: () => {
      stopTimer();
      set(null);
    },
    view,
    label: (cueId) => {
      // The DRAFT wins: a verb runs in the same tick as the flush before it, so reading the record
      // alone logged the name the cue had BEFORE the rename just made.
      const d = part.get();
      if (d && d.cueId === cueId) return d.label;
      return io.record(cueId)?.label ?? null;
    },
    unsent: (cue, aired, bound) => unsentFields(view(cue).values, aired, bound),
    listen: (adapters) => {
      const offHide = adapters.onPageHide(retain);
      const offFlush = adapters.onFlushAsked(() => void flush());
      // The page stops showing this draft (it left, or moved to another production): what is owed
      // is saved at once, as when the page hides.
      return () => {
        offHide();
        offFlush();
        retain();
      };
    },
  };
}
