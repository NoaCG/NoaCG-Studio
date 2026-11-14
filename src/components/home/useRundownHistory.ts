import { useEffect, useRef, useState } from 'react';
import { beginTeamRundownEdit, commitTeamRundownEdit, restoreTeamRundown, subscribeTeamState, getTeamState, type TeamRundownReceipt } from '../../backend/teamProductions';
import { canAuthorAccount, commitDurableReceipt, captureDurableWrites, libraryInUse, isDurableStoreActive } from '../../model/durableStore';
import { loadShows, restorePersonalRundown, type Show } from '../../model/shows';
import { RundownHistory, cueTextKey, landedReplacement, rundownSlice, sameRundown, RUNDOWN_CHANGED, type RundownSlice } from '../../model/rundownHistory';

type WriteResult = { shows: Show[]; error: string | null; refused?: string | null };
type Group = { key: string; before: RundownSlice; after: RundownSlice; valid: boolean };
type PendingTeamEdit = { before: RundownSlice; after: RundownSlice; label: string; receipt: TeamRundownReceipt; group?: Group; closed: boolean; confirming: boolean };

/** One authoring queue and one history per mounted production/account. Persistence stays in
 * the model/backend; this hook records only exact acknowledged results and never dispatches air. */
export function useRundownHistory(
  show: Show | null,
  update: (shows: Show[]) => void,
  note: (message: string | null) => void,
  safety: (expected: RundownSlice, replacement: RundownSlice) => string | null,
  cancelDraft: () => void,
) {
  const identity = JSON.stringify([show?.id, show?.teamId, libraryInUse()]);
  const owner = useRef(identity); owner.current = identity;
  const history = useRef(new RundownHistory());
  const group = useRef<Group | null>(null);
  const pendingTeam = useRef<PendingTeamEdit | null>(null);
  const epoch = useRef({ value: 0 });
  const queue = useRef({ identity, count: 0, tail: Promise.resolve() as Promise<unknown> });
  if (queue.current.identity !== identity) queue.current = { identity, count: 0, tail: Promise.resolve() };
  const callbacks = useRef({ update, note, safety, cancelDraft }); callbacks.current = { update, note, safety, cancelDraft };
  const shown = useRef(show); shown.current = show;
  const [, redraw] = useState(0);
  const changed = () => redraw(n => n + 1);
  const fresh = () => loadShows().find(s => s.id === show?.id && s.teamId === show?.teamId);
  /** The cue being typed and its text as this page last knew it (#2572): taken when typing starts
   *  on a cue, moved by this page's own save of it, and kept through every change made elsewhere
   *  that leaves that text alone. Cleared when the typing is discarded or its group closes. */
  const typing = useRef<{ cueId: string; text: string | null } | null>(null);
  /** Whether a change made elsewhere, now in `now`, left the typed cue's text as this page last
   *  knew it, so the typing stays (D1); a change to that text or the cue's removal does not (D3). */
  const keepsTyping = (now: RundownSlice | null) => {
    const t = typing.current;
    return !!now && !!t && t.text !== null && cueTextKey(now, t.cueId) === t.text;
  };
  /** Whether the typed cue's text changed elsewhere since this page last knew it (D3). */
  const typedChangedElsewhere = (now: RundownSlice | null) => !!typing.current && !keepsTyping(now);
  /** How many times the typing was discarded here. A draft save queued before a discard is dropped;
   *  one queued before a history that was only cleared still lands (D3, D5). */
  const discards = useRef(0);
  const discardDraft = () => { discards.current++; typing.current = null; callbacks.current.cancelDraft(); };
  /** Clear the history, and the typing with it unless `keepTyping` (a change made elsewhere that
   *  left the typed cue's text alone, D1, D2). */
  const invalidate = (message = RUNDOWN_CHANGED, keepTyping = false) => {
    history.current.clear(); if (group.current) group.current.valid = false; group.current = null; pendingTeam.current = null;
    epoch.current.value++; if (!keepTyping) discardDraft(); callbacks.current.note(message); changed();
  };
  const reconcile = () => {
    if (owner.current !== identity || queue.current.count) return;
    const current = fresh();
    const now = current ? rundownSlice(current) : null;
    const pending = pendingTeam.current;
    if (pending) {
      if (!current || !now || (!sameRundown(now, pending.after) && !sameRundown(now, pending.before))) { invalidate(RUNDOWN_CHANGED, keepsTyping(now)); return; }
      if (sameRundown(now, pending.before)) pendingTeam.current = null;
      else {
        // A failed team save retains its outbox and its old stacks. Only its own exact later
        // acknowledgement may become a step; inverse stays unavailable while it is unconfirmed.
        const state = getTeamState();
        if (!state.saving[current.id] && state.heads[current.id] && pending.receipt.token && state.heads[current.id].updatedAt !== pending.receipt.token && !pending.confirming) {
          pending.confirming = true;
          void enqueue(async () => {
            const error = await commitTeamRundownEdit(pending.receipt, pending.after);
            if (pendingTeam.current !== pending) return false;
            if (error) { invalidate(error); return false; }
            pendingTeam.current = null;
            if (pending.group && !pending.closed && pending.group.valid) pending.group.after = pending.after;
            else record(pending.before, pending.after, pending.label);
            callbacks.current.note(null); return true;
          }, false);
        }
        return;
      }
    }
    const expected = group.current?.after ?? history.current.peek('undo')?.after ?? history.current.peek('redo')?.before;
    if (expected && (!now || !sameRundown(now, expected))) { invalidate(RUNDOWN_CHANGED, keepsTyping(now)); return; }
    // After a kept change the history expects nothing, but the typed cue's own text still counts (D3).
    if (typedChangedElsewhere(now)) invalidate();
  };
  useEffect(() => {
    const retained = history.current, generation = epoch.current;
    retained.clear(); group.current = null; pendingTeam.current = null; generation.value++; changed();
    const onChange = () => reconcile();
    const off = subscribeTeamState(onChange);
    window.addEventListener('spx-data-changed', onChange);
    const pause = () => invalidate('Account editing paused. Undo history was cleared.');
    window.addEventListener('noacg-account-authoring', pause);
    return () => {
      generation.value++; retained.clear();
      off(); window.removeEventListener('spx-data-changed', onChange);
      window.removeEventListener('noacg-account-authoring', pause);
    };
    // A session follows this identity, never a render's mutable show object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  /** `draft`: the typed cue's save, which a cleared history does not void; `perform` judges it
   *  against the rundown it finds (#2572, D5). */
  function enqueue<T>(operation: () => Promise<T>, stale: T, draft = false): Promise<T> {
    const scope = identity, generation = epoch.current.value, held = queue.current;
    held.count++; changed();
    const result = held.tail.then(async () => {
      if (owner.current !== scope || (!draft && generation !== epoch.current.value) || !canAuthorAccount()) return stale;
      return operation();
    }).catch((error: unknown) => {
      if (owner.current === scope && (draft || generation === epoch.current.value)) callbacks.current.note(error instanceof Error ? error.message : 'The rundown edit was not saved.');
      return stale;
    });
    held.tail = result.finally(() => { held.count--; if (owner.current === scope) { changed(); reconcile(); } });
    return result;
  }
  function record(before: RundownSlice, after: RundownSlice, label: string) {
    const result = history.current.record(before, after, label);
    if (result === 'too-large') callbacks.current.note('This edit is too large to undo. Undo history was cleared.');
    changed();
  }
  /** `cueId`: this is the typed cue's own save (the draft's), not another write (#2572). */
  const perform = async (write: () => WriteResult, label: string, held?: Group, failed = label, cueId: string | null = null): Promise<boolean> => {
    const current = fresh(); if (!current) return false;
    const before = rundownSlice(current);
    // A typing group whose history was cleared no longer says what the rundown should be (D5).
    if (held && !held.valid) held = undefined;
    let pending = pendingTeam.current;
    const expected = pending?.after ?? held?.after ?? history.current.peek('undo')?.after ?? history.current.peek('redo')?.before;
    /** The history was cleared here for a change made elsewhere, the typing kept: its note stays. */
    let keptNote = false;
    // The typed cue's text changed elsewhere since this page last knew it: today's discard (D3).
    if (cueId && typedChangedElsewhere(before)) { invalidate(); return false; }
    if (expected && !sameRundown(before, expected)) {
      // The typed cue's own save over a rundown changed elsewhere, that cue's text untouched (D1):
      // the history goes and the save goes on, as a step of its own. Anything else refuses (D6).
      if (!cueId || !keepsTyping(before)) { invalidate(); return false; }
      invalidate(RUNDOWN_CHANGED, true); keptNote = true;
      pending = null; held = undefined;
    }
    const scope = owner.current, generation = epoch.current.value;
    const team = current.teamId ? beginTeamRundownEdit(current.id) : null;
    const key = team ? 'spx-gfx-team-outbox' : 'spx-gfx-shows';
    const captured = captureDurableWrites(key, write), result = captured.result;
    callbacks.current.update(result.shows);
    const intendedShow = result.shows.find(s => s.id === current.id && s.teamId === current.teamId);
    const intended = intendedShow ? rundownSlice(intendedShow) : null;
    // This page's own save of the typed cue moves what it knows of that cue's text.
    if (cueId && intended && typing.current?.cueId === cueId) typing.current = { cueId, text: cueTextKey(intended, cueId) };
    let error = result.refused ?? result.error;
    for (const receipt of captured.receipts) {
      const failed = await commitDurableReceipt(receipt);
      error ??= failed;
    }
    if (!error && !team && intended && !sameRundown(before, intended) && !captured.receipts.length) error = 'This rundown save has not been confirmed.';
    if (!error && team && intended && (pending || !sameRundown(before, intended))) error = await commitTeamRundownEdit(team, intended);
    if (owner.current !== scope) return false;
    /** The typed text this save stored is still the typed cue's text (D5). */
    const typedLanded = (now: RundownSlice | null) => !!cueId && !!intended && !!now && cueTextKey(now, cueId) === cueTextKey(intended, cueId);
    const accepted = fresh();
    const acceptedSlice = accepted ? rundownSlice(accepted) : null;
    // The history moved while the save was out: a change made elsewhere. A stored typed text whose
    // cue is untouched counts as sent; anything else is as today (D5, D6).
    if (generation !== epoch.current.value) return !error && typedLanded(acceptedSlice);
    callbacks.current.update(loadShows());
    if (error) {
      // The team confirmed a revision holding this save merged with a change made elsewhere: the
      // typed text is on the server; the history is cleared with the typing kept (D5). A storage or
      // network failure, or a refusal, is as today (D6).
      if (cueId && error === RUNDOWN_CHANGED && intended && acceptedSlice && !sameRundown(acceptedSlice, intended) && typedLanded(acceptedSlice)) {
        invalidate(RUNDOWN_CHANGED, true); return true;
      }
      if (team && intended && accepted && acceptedSlice && sameRundown(acceptedSlice, intended) && !sameRundown(before, intended)) {
        pendingTeam.current = { before: pending?.before ?? held?.before ?? before, after: intended, label, receipt: team, group: held, closed: !held, confirming: false };
      }
      callbacks.current.note(result.refused ?? `${failed}: ${error}`); return false;
    }
    if (!intended || !accepted || !acceptedSlice || !sameRundown(acceptedSlice, intended)) {
      // Changed elsewhere while the save was out: the typed text that landed stays typed (D5).
      const kept = typedLanded(acceptedSlice);
      invalidate(RUNDOWN_CHANGED, kept); return kept;
    }
    pendingTeam.current = null;
    if (!keptNote) callbacks.current.note(null);
    if (held) { if (held.valid) { if (pending) held.before = pending.before; held.after = intended; } }
    else record(pending?.before ?? before, intended, label);
    return true;
  };
  const closeGroup = (): Promise<boolean> => {
    const held = group.current; group.current = null;
    if (!held) return Promise.resolve(true);
    return enqueue(async () => {
      if (!held.valid) return false;
      if (pendingTeam.current?.group === held) { pendingTeam.current.closed = true; return false; }
      const current = fresh();
      const now = current ? rundownSlice(current) : null;
      if (!now || !sameRundown(now, held.after)) { invalidate(RUNDOWN_CHANGED, keepsTyping(now)); return false; }
      record(held.before, held.after, 'Edit cue'); return true;
    }, false);
  };
  const beginGroup = (key: string) => {
    if (group.current?.key === key) return;
    void closeGroup();
    const current = fresh(); if (!current) return;
    const slice = rundownSlice(current);
    group.current = { key, before: slice, after: slice, valid: true };
    // Typing starts on a cue (its key is `<cue id>:<fields>`, control/cueDraft.ts `editGroup`): what
    // this page knows of its text is the record's now. Another field of the same cue keeps it.
    const cueId = key.slice(0, key.indexOf(':'));
    if (typing.current?.cueId !== cueId) typing.current = { cueId, text: cueTextKey(slice, cueId) };
    changed();
  };
  /** The typed cue's save (the cue draft's). Queued before a discard it is dropped; queued before a
   *  history that was only cleared it still runs, and `perform` judges it (#2572, D3, D5). */
  const writeDraft = (cueId: string, write: () => WriteResult): Promise<boolean> => {
    const held = group.current ?? undefined, label = held ? 'Edit cue' : 'Save cue', at = discards.current;
    return enqueue(async () => at === discards.current && perform(write, label, held, label, cueId), false, true);
  };
  const write = (mutation: () => WriteResult, label: string, failed = label): Promise<boolean> => {
    void closeGroup();
    return enqueue(() => perform(mutation, label, undefined, failed), false);
  };
  const restore = (direction: 'undo' | 'redo'): Promise<boolean> => {
    void closeGroup();
    return enqueue(async () => {
      const entry = history.current.peek(direction); if (!entry) return false;
      const expected = direction === 'undo' ? entry.after : entry.before;
      const replacement = direction === 'undo' ? entry.before : entry.after;
      const current = fresh();
      if (!current || !sameRundown(rundownSlice(current), expected)) { invalidate(); return false; }
      const refused = callbacks.current.safety(expected, replacement);
      if (refused) { callbacks.current.note(refused); return false; }
      discardDraft();
      const scope = owner.current, generation = epoch.current.value;
      const valid = () => scope === owner.current && generation === epoch.current.value && canAuthorAccount() && !callbacks.current.safety(expected, replacement);
      const result = current.teamId
        ? await restoreTeamRundown(current.id, expected, replacement, valid)
        : await restorePersonalRundown(current.id, expected, replacement, valid);
      if (scope !== owner.current || generation !== epoch.current.value) return false;
      callbacks.current.update(loadShows());
      const accepted = fresh();
      if (result.status !== 'saved') {
        if (!accepted || !sameRundown(rundownSlice(accepted), expected) || result.error === RUNDOWN_CHANGED) invalidate();
        else callbacks.current.note(result.error);
        return false;
      }
      // What the restore lands as: the replacement less any hidden word (W11, `replaceRundown`). The
      // history keeps that, so the next step compares against what is stored.
      const landed = landedReplacement(current, replacement);
      if (!accepted || !sameRundown(rundownSlice(accepted), landed)) { invalidate(); return false; }
      history.current.accepted(direction, entry, landed); callbacks.current.note(`✓ ${direction === 'undo' ? 'Undid' : 'Redid'}: ${entry.label}`); changed(); return true;
    }, false);
  };
  /** Whether there is a step that way to take, read from the stacks as they stand. */
  const can = (direction: 'undo' | 'redo') => {
    const current = shown.current;
    const available = !!current && canAuthorAccount() && (!!current.teamId || isDurableStoreActive());
    return available && !pendingTeam.current &&
      (direction === 'undo' ? !!history.current.peek('undo') || !!group.current : !!history.current.peek('redo'));
  };
  /** Undo or Redo pressed. A press while a write is still landing waits for it and is then judged on
   *  the history as it stands: a write's queue ends a moment after its durable save settles, and the
   *  last render's flags lag that end, so judging the press there dropped it in silence (#1649).
   *  `before` runs first (the draft's save); false stops the step. Answers whether the key was taken. */
  const press = (direction: 'undo' | 'redo', before: () => Promise<boolean>): boolean => {
    if (queue.current.count === 0 && !can(direction)) return false;
    void (async () => {
      if (!(await before())) return;
      await queue.current.tail;
      if (can(direction)) await restore(direction);
    })();
    return true;
  };
  return {
    write, writeDraft, beginGroup, closeGroup, restore, press,
    settle: async () => { await queue.current.tail; },
  };
}
