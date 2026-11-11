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
// What a verb reads: `view`, which reads the part as it stands at that moment, never a render's
// copy. A Take path reads it at once and calls `flush` after its send (live-publishing W1); an
// Update or a snap awaits `flush` first. A Take path's button takes the focus as it is pressed, and
// the save that blur owes, or an idle save falling due then, waits until the press has run
// (`blurred`, #2388). While the save is out the draft stays and `view` answers it;
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

/** The longest a save waits for a press that sends first to end (#2388): a pointer held longer is
 *  not a quick press, and the save then goes as usual. */
export const PRESS_HOLD_MAX_MS = 2000;

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
  /** Its typed OGraf data (model/shows.ts `ShowCue.typed`, E1.2a), when it has some. */
  typed?: unknown;
}

/** An edit: a new label, a new note, or some fields' values. */
export type CueEdit = Partial<Pick<CueText, 'label' | 'note'>> & { values?: Record<string, string> };

/** What a save writes. */
export interface CueFields {
  label: string;
  note: string | null;
  values: Record<string, string>;
}

/** An owed edit as kept over a reload: the cue, the texts it may hold under the edit (its text
 *  when the typing started, then each part of the typing handed to the store), the typed text. */
export interface OwedEdit {
  cueId: string;
  bases: CueFields[];
  fields: CueFields;
}

/** Whether `cue` holds `text`: the label, the note and each of the text's values. */
function holds(cue: CueRecord, text: CueFields): boolean {
  return cue.label === text.label && (cue.note || null) === (text.note || null) && Object.entries(text.values).every(([k, v]) => cue.values[k] === v);
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
  /** The owed edit kept where a reload cannot drop it (model/owedCueEdit.ts): record it, read it
   *  back (null when none of a known version is there), and remove it. One per production. */
  owed: {
    keep: (edit: OwedEdit) => void;
    read: () => OwedEdit | null;
    forget: () => void;
  };
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (timer: unknown) => void;
}

/** The browser's moments, for `listen`; each answers its unsubscribe. */
export interface CueDraftAdapters {
  /** The page may be gone before a promise settles: it is hidden or closing (`going`), or the
   *  account pauses (the page stays). */
  onPageHide: (run: (going: boolean) => void) => () => void;
  /** The page is shown again after it was hidden: it did not go. */
  onPageShown: (run: () => void) => () => void;
  /** The account asks every surface to save what it holds. */
  onFlushAsked: (run: () => void) => () => void;
  /** A pointer goes down (`true`, on a control whose press sends first; `false` on any other), or
   *  the press ends (`false`): told before the press's handlers, and never before the press has
   *  moved the focus. */
  onSendsFirstPress: (run: (down: boolean) => void) => () => void;
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
  /** The editor now shows `cueId` (or no cue). When that changed and the draft is another cue's,
   *  its save starts at once through `save` (the page's save and history close, as a selection
   *  change runs them). The draft is kept until its save is confirmed, so a failed save stays owed
   *  and the page going still saves it. */
  showing: (cueId: string | null, save: () => void) => void;
  /** The editor lost focus and owes `save` (the draft's save and the history group's close). Run
   *  at once, unless a press that sends first took the focus (live-publishing W1, #2388): then the
   *  save waits until that press is over and its handlers have run, so the send goes before the
   *  save's synchronous store write. The draft stays owed meanwhile, so the page closing or
   *  reloading saves it at once. */
  blurred: (save: () => void) => void;
  /** The cue as the operator sees it: the draft over the newest record. */
  view: (cue: CueRecord) => CueText;
  /** A cue's label as the operator sees it, null if the production has no such cue. */
  label: (cueId: string) => string | null;
  /** The fields of `cue` whose values differ from what air was sent, bound fields aside. */
  unsent: (cue: CueRecord, aired: Readonly<Record<string, string>> | undefined, bound: Readonly<Record<string, string>>) => string[];
  /** The page shows this production, as first loaded: an edit recorded when a page of it last
   *  went is written to its cue, through the history, if the cue still holds the text the typing
   *  started from. The record is removed once that write is confirmed, or at once when the cue
   *  holds anything else. While the account may not write, or the write is not confirmed, it stays. */
  recover: () => void;
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
  /** The draft whose save is out through the history and not yet confirmed. The history writes
   *  it from its queue, a moment after `flush`, so the page going meanwhile still owes it. */
  let out: DraftPart | null = null;
  /** The texts the draft's cue may hold under it: the text when the draft started, then each
   *  part of the typing handed to the store (it may or may not have landed when the page goes).
   *  What a recorded edit may be applied over on the next visit, and nothing else. */
  let startedFrom: { cueId: string; texts: { from: DraftPart | null; text: CueFields }[] } | null = null;
  /** The owed-edit record this page last wrote when it hid, as stored, or null. */
  let recorded: string | null = null;
  /** Remove the record only if it is still the one this page wrote: another tab of the same
   *  production may have written its own since. */
  const forgetOwn = () => {
    if (recorded !== null && JSON.stringify(io.owed.read()) === recorded) io.owed.forget();
    recorded = null;
  };
  /** Whether this page is hidden or going: from its hide until it is shown again. */
  let leaving = false;
  const copyOf = (d: DraftPart): CueFields => ({ ...fieldsOf(d), values: { ...d.values } });
  const started = (d: DraftPart) => {
    startedFrom = { cueId: d.cueId, texts: [{ from: null, text: copyOf(d) }] };
  };
  /** The store was given `d`'s text while typing in its cue goes on. */
  const handed = (d: DraftPart) => {
    if (startedFrom?.cueId !== d.cueId) return;
    startedFrom = { cueId: d.cueId, texts: [...startedFrom.texts, { from: d, text: copyOf(d) }] };
  };
  /** The store confirmed `d`'s save while typing goes on: the store can no longer hold a text
   *  listed before it, so only it and later ones stay listed. */
  const confirmed = (d: DraftPart) => {
    const at = startedFrom?.texts.findIndex((t) => t.from === d) ?? -1;
    if (startedFrom && at > 0) startedFrom = { cueId: startedFrom.cueId, texts: startedFrom.texts.slice(at) };
  };
  let timer: unknown = null;
  const set = (draft: DraftPart | null) => session.apply((parts) => ({ ...parts, draft }));
  const stopTimer = () => {
    if (timer !== null) io.clearTimeout(timer);
    timer = null;
  };
  /** The cue the editor last showed (`showing`). */
  let shown: string | null = null;
  /** Whether a pointer is down on a control whose press sends first. */
  let pressing = false;
  /** The save waiting for presses that send first to pause, its wait and its cap. */
  let held: (() => void) | null = null;
  let heldWait: unknown = null;
  let holdCap: unknown = null;
  const hold = (save: () => void) => {
    held = save;
    if (holdCap === null) holdCap = io.setTimeout(() => runHeld(true), PRESS_HOLD_MAX_MS);
  };
  const dropHeld = () => {
    for (const t of [heldWait, holdCap]) if (t !== null) io.clearTimeout(t);
    heldWait = holdCap = null;
    held = null;
  };
  /** The held save runs once presses pause, never during one (a second fast press must not wait
   *  for the first one's save either), and at the cap whatever happens. */
  function runHeld(capped: boolean) {
    heldWait = null;
    if (pressing && !capped) return;
    const save = held;
    dropHeld();
    if (save && session.alive()) save();
  }
  /** A press is over: the held save waits the idle delay from here, which a next press restarts. */
  function release() {
    if (!held) return;
    if (heldWait !== null) io.clearTimeout(heldWait);
    heldWait = io.setTimeout(() => runHeld(false), FLUSH_DELAY_MS);
  }

  const flush = (): Promise<boolean> => {
    stopTimer();
    const d = part.get();
    // After the session's end nothing is owed: the end saved it, and an edit starts nothing.
    if (!d || !pending || !io.canWrite()) return Promise.resolve(true);
    pending = false;
    out = d;
    // The store may hold this text from here on, before the history confirms it (a team
    // production's local outbox lands before the server answers): typing on may be applied over it.
    handed(d);
    return io.writeCue(d.cueId, fieldsOf(d)).then((saved) => {
      if (out === d) out = null;
      // Typing went on during the save, or the session ended: the newer draft is still owed.
      if (part.get() === d && session.alive()) {
        if (saved) {
          set(null);
          // The store holds the latest text: a record of it must never be applied over later work.
          forgetOwn();
        }
        else pending = true;
      } else if (saved) {
        confirmed(d);
      }
      return saved;
    });
  };

  /** Save synchronously what is owed: pausing and teardown cannot await a microtask. The draft
   *  stays; no history survives this boundary. When the page may be gone (`hiding`), a save still
   *  out through the history is owed too: the history would write it only after the page is gone. */
  const retain = (hiding = false) => {
    const d = part.get();
    if (!d || !(pending || (hiding && out === d)) || !io.canWrite()) return;
    // Recorded where a reload cannot drop it: the store's write may still be committing when the
    // page goes, and a reload aborts it.
    if (hiding && startedFrom && startedFrom.cueId === d.cueId) {
      io.owed.keep({ cueId: d.cueId, bases: startedFrom.texts.map((t) => t.text), fields: fieldsOf(d) });
      recorded = JSON.stringify(io.owed.read());
    }
    if (io.retainCue(d.cueId, fieldsOf(d))) {
      pending = false;
      if (out === d) out = null;
      // The store is given this text (the record above covers a page that goes before it lands):
      // typing on in this cue may be applied over it.
      handed(d);
    }
  };

  const view = (cue: CueRecord) => viewOf(part.get(), io.record(cue.id) ?? cue);

  // The session's end: what is owed is saved now, the idle save never comes, and every answer
  // after this changes nothing (the part takes no fold once the session ended).
  session.onDispose(() => {
    retain();
    stopTimer();
    dropHeld();
    pending = false;
  });

  return {
    part,
    edit: (cue, patch) => {
      if (!session.alive() || !io.canWrite()) return;
      // Typing again after the press, before the held save ran: the typing carries on in the same
      // draft and history group, saved on its own idle delay. Nothing here starts a write: a write
      // queued in the same call as `editing` opens a group would land after that group's snapshot,
      // and the history would then drop the draft. (Another cue's edit never finds this draft
      // owed: the page saves and clears it when the selection moves, `selectCue`.)
      if (held && !pressing) dropHeld();
      const d = part.get();
      io.editing(editGroup(cue.id, patch));
      const base: DraftPart = d && d.cueId === cue.id ? d : { cueId: cue.id, label: cue.label, note: cue.note ?? '', values: { ...cue.values } };
      if (base !== d) started(base);
      // Set before the timer, so a flush in this same tick sees the edit.
      set({ ...base, ...patch, values: { ...base.values, ...(patch.values ?? {}) } });
      pending = true;
      stopTimer();
      // The idle save does not land on a press that sends first either: it waits for it.
      timer = io.setTimeout(() => {
        timer = null;
        if (pressing) hold(held ?? (() => void flush()));
        else void flush();
      }, FLUSH_DELAY_MS);
    },
    flush,
    // Nothing is owed without a draft, and the next edit owes its own.
    cancel: () => {
      stopTimer();
      set(null);
      // A draft this page recorded is dropped by the operator (an undo, another cue selected): an
      // undo puts the cue back to a text listed under the edit, so the record must not bring it
      // back next visit. Not while the page is hidden or going: the history drops the draft then
      // too, when its queued save finds the cue the hide's save rewrote. A page that recorded
      // nothing (one just opened, before `recover`) leaves the record alone.
      if (!leaving) forgetOwn();
    },
    showing: (cueId, save) => {
      if (cueId === shown) return;
      shown = cueId;
      const d = part.get();
      if (!d || d.cueId === cueId) return;
      dropHeld();
      save();
    },
    blurred: (save) => {
      if (!pressing) {
        save();
        return;
      }
      stopTimer();
      hold(save);
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
    recover: () => {
      const e = io.owed.read();
      if (!e || !session.alive() || !io.canWrite()) return;
      const cue = io.record(e.cueId);
      // Saved after all, or changed since the typing started (another tab, a teammate, an undo):
      // what the cue holds stands.
      if (!cue || holds(cue, e.fields) || !e.bases.some((b) => holds(cue, b))) {
        io.owed.forget();
        return;
      }
      // Through the history, so the store confirms it; the record goes only then, and only if no
      // later hide has recorded a newer edit meanwhile. Unconfirmed, it is tried again next visit.
      const same = JSON.stringify(e);
      void io.writeCue(e.cueId, e.fields).then((saved) => {
        if (saved && JSON.stringify(io.owed.read()) === same) io.owed.forget();
      });
    },
    listen: (adapters) => {
      // Hidden or going: what is owed is saved and recorded where a reload cannot drop it.
      const offHide = adapters.onPageHide((going) => {
        if (going) leaving = true;
        retain(going);
      });
      // Back: the record stays (the hide's save may still be committing), and the operator's own
      // drops count again.
      const offShown = adapters.onPageShown(() => {
        leaving = false;
      });
      const offFlush = adapters.onFlushAsked(() => void flush());
      const offPress = adapters.onSendsFirstPress((down) => {
        pressing = down;
        if (!down) release();
      });
      // The page stops showing this draft (it left, or moved to another production): what is owed
      // is saved at once, as when the page hides.
      return () => {
        offHide();
        offShown();
        offFlush();
        offPress();
        pressing = false;
        // What is held is saved at once by `retain`; the history it would close moves on anyway.
        dropHeld();
        retain();
      };
    },
  };
}
