import { useEffect, useRef, useState } from 'react';
import { beginTeamRundownEdit, commitTeamRundownEdit, restoreTeamRundown, subscribeTeamState, getTeamState, type TeamRundownReceipt } from '../../backend/teamProductions';
import { canAuthorAccount, commitDurableReceipt, captureDurableWrites, libraryInUse, isDurableStoreActive } from '../../model/durableStore';
import { loadShows, restorePersonalRundown, type Show } from '../../model/shows';
import { RundownHistory, rundownSlice, sameRundown, RUNDOWN_CHANGED, type RundownSlice } from '../../model/rundownHistory';

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
  const [, redraw] = useState(0);
  const changed = () => redraw(n => n + 1);
  const fresh = () => loadShows().find(s => s.id === show?.id && s.teamId === show?.teamId);
  const invalidate = (message = RUNDOWN_CHANGED) => {
    history.current.clear(); if (group.current) group.current.valid = false; group.current = null; pendingTeam.current = null;
    epoch.current.value++; callbacks.current.cancelDraft(); callbacks.current.note(message); changed();
  };
  const reconcile = () => {
    if (owner.current !== identity || queue.current.count) return;
    const current = fresh();
    const pending = pendingTeam.current;
    if (pending) {
      if (!current || (!sameRundown(rundownSlice(current), pending.after) && !sameRundown(rundownSlice(current), pending.before))) { invalidate(); return; }
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
    if (expected && (!current || !sameRundown(rundownSlice(current), expected))) invalidate();
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

  function enqueue<T>(operation: () => Promise<T>, stale: T): Promise<T> {
    const scope = identity, generation = epoch.current.value, held = queue.current;
    held.count++; changed();
    const result = held.tail.then(async () => {
      if (owner.current !== scope || generation !== epoch.current.value || !canAuthorAccount()) return stale;
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
  const perform = async (write: () => WriteResult, label: string, held?: Group, failed = label): Promise<boolean> => {
    const current = fresh(); if (!current) return false;
    const before = rundownSlice(current), scope = owner.current, generation = epoch.current.value;
    const pending = pendingTeam.current;
    const expected = pending?.after ?? held?.after ?? history.current.peek('undo')?.after ?? history.current.peek('redo')?.before;
    if (expected && !sameRundown(before, expected)) { invalidate(); return false; }
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
    if (!error && team && intended && (pending || !sameRundown(before, intended))) error = await commitTeamRundownEdit(team, intended);
    if (owner.current !== scope || generation !== epoch.current.value) return false;
    const accepted = fresh(); callbacks.current.update(loadShows());
    if (error) {
      if (team && intended && accepted && sameRundown(rundownSlice(accepted), intended) && !sameRundown(before, intended)) {
        pendingTeam.current = { before: pending?.before ?? held?.before ?? before, after: intended, label, receipt: team, group: held, closed: !held, confirming: false };
      }
      callbacks.current.note(result.refused ?? `${failed}: ${error}`); return false;
    }
    if (!intended || !accepted || !sameRundown(rundownSlice(accepted), intended)) { invalidate(); return false; }
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
    if (!held) return enqueue(() => perform(write, 'Save cue'), false);
    return enqueue(() => perform(write, 'Edit cue', held), false);
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
      callbacks.current.cancelDraft();
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
      if (!accepted || !sameRundown(rundownSlice(accepted), replacement)) { invalidate(); return false; }
      history.current.accepted(direction, entry); callbacks.current.note(`✓ ${direction === 'undo' ? 'Undid' : 'Redid'}: ${entry.label}`); changed(); return true;
    }, false);
  };
  const available = !!show && canAuthorAccount() && (!!show.teamId || isDurableStoreActive());
  return {
    write, writeDraft, beginGroup, closeGroup, restore,
    settle: async () => { await queue.current.tail; },
    busy: queue.current.count > 0,
    canUndo: available && !pendingTeam.current && queue.current.count === 0 && (!!history.current.peek('undo') || !!group.current),
    canRedo: available && !pendingTeam.current && queue.current.count === 0 && !!history.current.peek('redo'),
  };
}
