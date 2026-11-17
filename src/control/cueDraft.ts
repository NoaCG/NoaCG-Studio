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
// drives it with fakes.

import type { CueFields, DraftCommitId } from '../model/cueDraftCommit.ts';
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
export type { CueFields } from '../model/cueDraftCommit.ts';

/** An owed edit as kept over a reload: the cue, the texts it may hold under the edit (its text
 *  when the typing started, then each part of the typing handed to the store), the typed text. */
export interface OwedEdit {
  cueId: string;
  bases: CueFields[];
  fields: CueFields;
  commit?: DraftCommitId;
  retired?: true;
}

/** Whether `cue` holds `text`: the label, the note and each of the text's values. */
function holds(cue: CueRecord, text: CueFields): boolean {
  const entries = Object.entries(text.values);
  return cue.label === text.label && (cue.note || null) === (text.note || null)
    && Object.keys(cue.values).length === entries.length && entries.every(([k, v]) => cue.values[k] === v);
}

type ObserveCue = (cue: CueRecord) => void;

/** The browser half the page hands in. */
export interface CueDraftIo {
  /** Whether this account may write the record now. */
  canWrite: () => boolean;
  /** Start or continue an edit group. A fresh draft passes the cue record it starts from. */
  editing: (group: string, freshCue: CueRecord | null) => void;
  /** Save through the rundown history, answering whether the store confirmed it. `overtaken`
   *  answers whether a later save of the same typing has been handed over since: the history then
   *  writes nothing for this one when its turn comes, since the later one carries newer text (#2589). */
  writeCue: (cueId: string, fields: CueFields, recoveredFrom?: CueRecord, confirm?: ObserveCue, commit?: DraftCommitId, overtaken?: () => boolean) => Promise<boolean>;
  /** Save at once, with no history and nothing to await: whether the store accepted it. */
  retainCue: (cueId: string, fields: CueFields, confirm?: ObserveCue, commit?: DraftCommitId) => boolean | Promise<boolean>;
  /** A queued handoff still needs retaining when its value has never reached the local record. */
  hasUnstoredDraft?: (cueId: string, fields: CueFields) => boolean;
  /** The newest record of a cue, if the production holds it. */
  record: (cueId: string) => CueRecord | undefined;
  /** The owed edit kept where a reload cannot drop it (model/owedCueEdit.ts): record it, read it
   *  back (null when none of a known version is there), and remove it. One per production. */
  owed: {
    keep: (edit: OwedEdit) => void;
    read: () => OwedEdit | null;
    forget: () => void;
  };
  commit?: {
    start: () => string | undefined;
    account: () => string | null;
    unused: (stream: string) => boolean;
    recover: (edit: OwedEdit & { commit: DraftCommitId }, stillOwed: () => boolean) => Promise<boolean>;
    forget: (id: DraftCommitId, canRelease: () => boolean) => void;
  };
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (timer: unknown) => void;
}

/** The browser's moments, for `listen`; each answers its unsubscribe. */
export interface CueDraftAdapters {
  /** The page may be gone before a promise settles: it is hidden or closing (`going`), or the
   *  account pauses (the page stays). */
  onPageHide: (run: (going: boolean, closing?: boolean) => void) => () => void;
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
   *  holds anything else. While the account may not write, or the write is not confirmed, it stays;
   *  the page calls this again when the account may write. */
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
type DraftHandoff = { text: CueFields };
type DraftStream = {
  id: string;
  account: string | null;
  revision: number;
  writes: number;
  retired: boolean;
};
type DraftRevision = { id: DraftCommitId; stream: DraftStream };

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
  let startedFrom: { cueId: string; original: CueFields; texts: DraftHandoff[]; stream?: DraftStream; sends: number } | null = null;
  const commits = new WeakMap<DraftPart, DraftRevision>();
  /** The owed-edit record this page last wrote when it hid, as stored, or null. */
  let recorded: string | null = null;
  let recordedAccount: string | null | undefined;
  /** Remove the record only if it is still the one this page wrote: another tab of the same
   *  production may have written its own since. */
  const forgetOwn = () => {
    if (recorded !== null && io.commit?.account() === recordedAccount && JSON.stringify(io.owed.read()) === recorded) io.owed.forget();
    recorded = null;
  };
  /** Whether this page is hidden or going: from its hide until it is shown again. */
  let leaving = false;
  /** Whether this page has taken the record (or found none): it takes it once, at its start. A
   *  take whose write is not yet confirmed may be asked again; the same text written twice is
   *  harmless, and the first write can be dropped (a remount moves the history on). */
  let recovered = false;
  let eligibility = 0;
  let authoring = 0;
  const copyOf = (d: DraftPart): CueFields => ({ ...fieldsOf(d), values: { ...d.values } });
  const releaseCommit = (id: DraftCommitId, account: string | null) => {
    const canRelease = () => io.commit?.account() === account && !!io.commit?.unused(id.stream);
    if (canRelease()) io.commit?.forget(id, canRelease);
  };
  const prune = (stream: DraftStream) => {
    if (stream.retired && stream.writes === 0) releaseCommit({ stream: stream.id, revision: stream.revision }, stream.account);
  };
  const track = (commit: DraftRevision | undefined) => {
    if (!commit) return () => {};
    const { stream } = commit;
    stream.writes++;
    return () => { stream.writes--; prune(stream); };
  };
  const retire = (stream: DraftStream | undefined) => {
    if (!stream) return;
    stream.retired = true;
    const owed = io.commit?.account() === stream.account ? io.owed.read() : null;
    if (owed?.commit?.stream === stream.id && !owed.retired && JSON.stringify(owed) === recorded) {
      const ended: OwedEdit = { ...owed, retired: true };
      io.owed.keep(ended);
      if (JSON.stringify(io.owed.read()) === JSON.stringify(ended)) recorded = JSON.stringify(ended);
    }
    prune(stream);
  };
  const forgetCommitted = (commit?: DraftRevision) => {
    if (!commit || io.commit?.account() !== commit.stream.account) return;
    const owed = io.owed.read()?.commit;
    if (owed?.stream === commit.id.stream && owed.revision === commit.id.revision) forgetOwn();
  };
  const started = (d: DraftPart) => {
    retire(startedFrom?.stream);
    const original = copyOf(d), id = io.commit?.start();
    const stream = id && io.commit ? { id, account: io.commit.account(), revision: 0, writes: 0, retired: false } : undefined;
    startedFrom = { cueId: d.cueId, original, texts: [{ text: original }], stream, sends: 0 };
  };
  /** The store was given `d`'s text while typing in its cue goes on. */
  const handed = (d: DraftPart) => {
    const entry: DraftHandoff = { text: copyOf(d) };
    if (startedFrom?.cueId === d.cueId) startedFrom.texts.push(entry);
    return entry;
  };
  const bases = () => startedFrom ? startedFrom.stream ? [startedFrom.original] : startedFrom.texts.map(entry => entry.text) : [];
  const textOf = (cue: CueRecord): CueFields => ({ label: cue.label, note: cue.note ?? null, values: { ...cue.values } });
  const refreshOwn = (cueId: string) => {
    const owed = recorded !== null && io.owed.read();
    if (owed && owed.cueId === cueId && JSON.stringify(owed) === recorded) {
      io.owed.keep({ ...owed, bases: bases() });
      recorded = JSON.stringify(io.owed.read());
    }
  };
  /** Only the confirmed handoff and later ones can still be present in storage. */
  const confirmed = (entry: DraftHandoff, actual?: CueRecord) => {
    const at = startedFrom?.texts.indexOf(entry) ?? -1;
    if (!startedFrom || at < 0) return;
    startedFrom.texts = startedFrom.texts.slice(at);
    if (actual) {
      entry.text = textOf(actual);
      if (!startedFrom.stream) refreshOwn(actual.id);
    }
  };
  let timer: unknown = null;
  const replaceDraft = (draft: DraftPart | null) => session.apply((parts) => ({ ...parts, draft }));
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
    const write = handed(d), commit = commits.get(d), finish = track(commit);
    // One save per typed text queued behind a slow team save put the record dozens of texts
    // behind; a save still queued when a newer one of this typing is handed over writes nothing.
    const typing = startedFrom?.cueId === d.cueId ? startedFrom : null;
    const turn = typing ? ++typing.sends : 0;
    let confirmedByReceipt = false;
    return io.writeCue(d.cueId, fieldsOf(d), undefined, cue => {
      confirmedByReceipt = true;
      confirmed(write, cue);
      forgetCommitted(commit);
    }, commit?.id, typing ? () => typing.sends !== turn : undefined).then((saved) => {
      if (out === d) out = null;
      // Typing went on during the save, or the session ended: the newer draft is still owed.
      if (part.get() === d && session.alive()) {
        if (saved) {
          replaceDraft(null);
          // The store holds the latest text: a record of it must never be applied over later work.
          forgetOwn();
          retire(commit?.stream);
        }
        else pending = true;
      } else if (saved && !confirmedByReceipt) {
        confirmed(write);
      }
      return saved;
    }).finally(finish);
  };

  /** Save synchronously what is owed: pausing and teardown cannot await a microtask. The draft
   *  stays; no history survives this boundary. When the page may be gone (`hiding`), a save still
   *  out through the history is owed too: the history would write it only after the page is gone. */
  const retain = (hiding = false) => {
    const d = part.get();
    if (!d || !io.canWrite()) return;
    const fields = fieldsOf(d);
    const queued = out === d && io.hasUnstoredDraft?.(d.cueId, fields);
    if (!pending && !queued && !(hiding && out === d)) return;
    // Recorded where a reload cannot drop it: the store's write may still be committing when the
    // page goes, and a reload aborts it.
    if (hiding && startedFrom && startedFrom.cueId === d.cueId) {
      const commit = commits.get(d)?.id;
      const owed: OwedEdit = { cueId: d.cueId, bases: bases(), fields, ...(commit && { commit }) };
      io.owed.keep(owed);
      const exact = JSON.stringify(owed);
      recorded = JSON.stringify(io.owed.read()) === exact ? exact : null;
      recordedAccount = io.commit?.account();
    }
    const write = handed(d), commit = commits.get(d), finish = track(commit);
    let confirmedByReceipt = false;
    const saved = io.retainCue(d.cueId, fields, cue => {
      confirmedByReceipt = true;
      confirmed(write, cue);
      forgetCommitted(commit);
    }, commit?.id);
    if (saved === false) {
      if (startedFrom) startedFrom.texts = startedFrom.texts.filter(entry => entry !== write);
      finish();
      return;
    }
    pending = false;
    if (out === d) out = null;
    if (saved !== true) {
      void saved.then(accepted => {
        if (accepted) {
          if (!confirmedByReceipt) confirmed(write);
          if (part.get() === d) forgetOwn();
        } else if (part.get() === d && session.alive()) pending = true;
      }).finally(finish);
    } else finish();
  };

  const view = (cue: CueRecord) => viewOf(part.get(), io.record(cue.id) ?? cue);

  // The session's end: what is owed is saved now, the idle save never comes, and every answer
  // after this changes nothing (the part takes no fold once the session ended).
  session.onDispose(() => {
    retain();
    retire(startedFrom?.stream);
    stopTimer();
    dropHeld();
    pending = false;
  });

  return {
    part,
    edit: (cue, patch) => {
      if (!session.alive() || !io.canWrite()) return;
      eligibility++;
      // Typing again after the press, before the held save ran: the typing carries on in the same
      // draft and history group, saved on its own idle delay. Nothing here starts a write: a write
      // queued in the same call as `editing` opens a group would land after that group's snapshot,
      // and the history would then drop the draft. (Another cue's edit never finds this draft
      // owed: the page saves and clears it when the selection moves, `selectCue`.)
      if (held && !pressing) dropHeld();
      const d = part.get();
      const continuing = d?.cueId === cue.id;
      io.editing(editGroup(cue.id, patch), continuing ? null : cue);
      const base: DraftPart = continuing ? d : { cueId: cue.id, label: cue.label, note: cue.note ?? '', values: { ...cue.values } };
      if (base !== d) started(base);
      // Set before the timer, so a flush in this same tick sees the edit.
      const next = { ...base, ...patch, values: { ...base.values, ...(patch.values ?? {}) } };
      const stream = startedFrom?.stream;
      if (stream) commits.set(next, { stream, id: { stream: stream.id, revision: ++stream.revision } });
      replaceDraft(next);
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
      replaceDraft(null);
      // A draft this page recorded is dropped by the operator (an undo, another cue selected): an
      // undo puts the cue back to a text listed under the edit, so the record must not bring it
      // back next visit. Not while the page is hidden or going: the history drops the draft then
      // too, when its queued save finds the cue the hide's save rewrote. A page that recorded
      // nothing (one just opened, before `recover`) leaves the record alone.
      if (!leaving) forgetOwn();
      retire(startedFrom?.stream);
      startedFrom = null;
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
      // Never once this page has hidden or recorded: the record is then this page's own.
      if (recovered || leaving || recorded !== null || !session.alive()) return;
      const e = io.owed.read();
      if (!e) {
        recovered = true;
        return;
      }
      if (!io.canWrite()) return;
      const same = JSON.stringify(e), account = io.commit?.account();
      const sameOwed = () => io.commit?.account() === account && JSON.stringify(io.owed.read()) === same;
      const clear = () => {
        recovered = true;
        if (!sameOwed()) return;
        io.owed.forget();
        if (e.commit && e.retired && account !== undefined) releaseCommit(e.commit, account);
      };
      if (e.commit) {
        if (!io.commit || eligibility !== 0) return;
        const generation = eligibility, permission = authoring;
        const valid = () => eligibility === generation && authoring === permission && session.alive() && io.canWrite() && sameOwed();
        void io.commit.recover({ ...e, commit: e.commit }, valid).then(settled => {
          if (settled) clear();
        }, () => {});
        return;
      }
      const cue = io.record(e.cueId);
      if (!cue || holds(cue, e.fields) || !e.bases.some(base => holds(cue, base))) {
        clear();
        return;
      }
      void io.writeCue(e.cueId, e.fields, cue).then(saved => { if (saved) clear(); });
    },
    listen: (adapters) => {
      // Hidden, going or pausing: what is owed is saved; when the page may go it is also recorded
      // where a reload cannot drop it.
      const offHide = adapters.onPageHide((going, closing) => {
        if (going) { leaving = true; eligibility++; }
        else authoring++;
        retain(going);
        if (closing) retire(startedFrom?.stream);
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
