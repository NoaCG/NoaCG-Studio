import { useEffect, useRef, useState } from 'react';
import { beginTeamRundownEdit, commitTeamRundownEdit, restoreTeamRundown, subscribeTeamState, getTeamState, type TeamRundownReceipt } from '../../backend/teamProductions';
import { canAuthorAccount, commitDurableReceipt, captureDurableWrites, libraryInUse, isDurableStoreActive } from '../../model/durableStore';
import { loadShows, restorePersonalRundown, type Show } from '../../model/shows';
import { RundownHistory, landedReplacement, rundownSlice, sameRundown, typedCueUnchanged, RUNDOWN_CHANGED, type RundownSlice } from '../../model/rundownHistory';

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
  /** Clear the history. The cue being typed goes with it unless `keepTyping` says the change was
   *  made elsewhere and left that cue exactly as the history expected it (#2572, D1). */
  const invalidate = (message = RUNDOWN_CHANGED, keepTyping = false) => {
    history.current.clear(); if (group.current) group.current.valid = false; group.current = null; pendingTeam.current = null;
    epoch.current.value++; if (!keepTyping) discardDraft(); callbacks.current.note(message); changed();
  };
  /** How many times the cue being typed was discarded here. A draft save queued before a discard
   *  is dropped; one queued before a history that was only cleared still lands (#2572, D3, D5). */
  const discards = useRef(0);
  const discardDraft = () => { discards.current++; callbacks.current.cancelDraft(); };
  /** The cue a typing group edits: its key is `<cue id>:<fields>` (control/cueDraft.ts `editGroup`). */
  const typedCue = (held: Group | null | undefined) => (held ? held.key.slice(0, held.key.indexOf(':')) : null);
  /** Whether a change made elsewhere left the text of the cue a typing group edits as `expected`
   *  held it (#2572, D1, D3), so the typed text can still be saved over the new rundown. */
  const leavesTyping = (held: Group | null | undefined, now: RundownSlice, expected: RundownSlice) => {
    const cueId = typedCue(held);
    return !!cueId && typedCueUnchanged(cueId, now, expected);
  };
  const reconcile = () => {
    if (owner.current !== identity || queue.current.count) return;
    const current = fresh();
    const pending = pendingTeam.current;
    if (pending) {
      if (!current || (!sameRundown(rundownSlice(current), pending.after) && !sameRundown(rundownSlice(current), pending.before))) {
        invalidate(RUNDOWN_CHANGED, !!current && leavesTyping(group.current, rundownSlice(current), pending.after)); return;
      }
      if (sameRundown(rundownSlice(current), pending.before)) pendingTeam.current = null;
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
    if (expected && (!current || !sameRundown(rundownSlice(current), expected))) {
      invalidate(RUNDOWN_CHANGED, !!current && leavesTyping(group.current, rundownSlice(current), expected));
    }
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
      if (owner.current === scope && generation === epoch.current.value) callbacks.current.note(error instanceof Error ? error.message : 'The rundown edit was not saved.');
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
  const perform = async (write: () => WriteResult, label: string, held?: Group, failed = label, draft = false): Promise<boolean> => {
    const current = fresh(); if (!current) return false;
    const before = rundownSlice(current);
    const cueId = draft ? typedCue(held) : null;
    // A typing group whose history was cleared no longer says what the rundown should be (D5).
    if (held && !held.valid) held = undefined;
    let pending = pendingTeam.current;
    const expected = pending?.after ?? held?.after ?? history.current.peek('undo')?.after ?? history.current.peek('redo')?.before;
    if (expected && !sameRundown(before, expected)) {
      // The typed cue's own save over a rundown changed elsewhere, that cue untouched (#2572, D1):
      // the history goes and the save goes on, as a step of its own. Anything else refuses (D3, D6).
      if (!leavesTyping(held, before, expected)) { invalidate(); return false; }
      invalidate(RUNDOWN_CHANGED, true);
      pending = null; held = undefined;
    }
    const scope = owner.current, generation = epoch.current.value;
    const team = current.teamId ? beginTeamRundownEdit(current.id) : null;
    const key = team ? 'spx-gfx-team-outbox' : 'spx-gfx-shows';
    const captured = captureDurableWrites(key, write), result = captured.result;
    callbacks.current.update(result.shows);
    const intendedShow = result.shows.find(s => s.id === current.id && s.teamId === current.teamId);
    const intended = intendedShow ? rundownSlice(intendedShow) : null;
    let error = result.refused ?? result.error;
    for (const receipt of captured.receipts) {
      const failed = await commitDurableReceipt(receipt);
      error ??= failed;
    }
    if (!error && !team && intended && !sameRundown(before, intended) && !captured.receipts.length) error = 'This rundown save has not been confirmed.';
    /** This browser's storage holds the write (a team production's outbox included). */
    const stored = !error;
    if (!error && team && intended && (pending || !sameRundown(before, intended))) error = await commitTeamRundownEdit(team, intended);
    if (owner.current !== scope) return false;
    // The typed text stored, and a change made elsewhere while its save was out (#2572, D5): the
    // record still holds what was typed, so the draft has nothing left to send, whatever the
    // history or the team's confirmation of this exact rundown did. A storage failure is not this.
    const typedLanded = () => {
      const now = fresh();
      return stored && !!cueId && !!intended && !!now && typedCueUnchanged(cueId, rundownSlice(now), intended);
    };
    if (generation !== epoch.current.value) return typedLanded();
    const accepted = fresh(); callbacks.current.update(loadShows());
    if (error) {
      if (team && intended && accepted && sameRundown(rundownSlice(accepted), intended) && !sameRundown(before, intended)) {
        pendingTeam.current = { before: pending?.before ?? held?.before ?? before, after: intended, label, receipt: team, group: held, closed: !held, confirming: false };
      }
      callbacks.current.note(result.refused ?? `${failed}: ${error}`);
      // Only a change made elsewhere lets the stored text count as sent (D5), and it clears the
      // history as any change elsewhere does, the typing kept (D1, D2). Any other failure is as
      // today (D6).
      if (!accepted || !intended || sameRundown(rundownSlice(accepted), intended) || !typedLanded()) return false;
      invalidate(RUNDOWN_CHANGED, true); return true;
    }
    if (!intended || !accepted || !sameRundown(rundownSlice(accepted), intended)) {
      // Changed elsewhere while the save was out: the typed text that landed stays typed (D5).
      const kept = typedLanded();
      invalidate(RUNDOWN_CHANGED, kept); return kept;
    }
    pendingTeam.current = null;
    callbacks.current.note(null);
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
      if (!current || !sameRundown(rundownSlice(current), held.after)) { invalidate(); return false; }
      record(held.before, held.after, 'Edit cue'); return true;
    }, false);
  };
  const beginGroup = (key: string) => {
    if (group.current?.key === key) return;
    void closeGroup();
    const current = fresh(); if (!current) return;
    const slice = rundownSlice(current);
    group.current = { key, before: slice, after: slice, valid: true }; changed();
  };
  const writeDraft = (write: () => WriteResult): Promise<boolean> => {
    const held = group.current;
    const at = discards.current;
    const still = () => at === discards.current;
    if (!held) return enqueue(async () => still() && perform(write, 'Save cue', undefined, 'Save cue', true), false, true);
    return enqueue(async () => still() && perform(write, 'Edit cue', held, 'Edit cue', true), false, true);
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
