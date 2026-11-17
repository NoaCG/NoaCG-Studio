import { useEffect, useRef, useState } from 'react';
import { beginTeamRundownEdit, bindTeamCueDraft, commitTeamRundownEdit, restoreTeamRundown, subscribeTeamState, getTeamState, confirmedTeamCueText, type TeamRundownReceipt } from '../../backend/teamProductions';
import { canAuthorAccount, commitDurableReceipt, captureDurableWrites, libraryInUse, isDurableStoreActive, unsettledWrites, type DurableWriteReceipt } from '../../model/durableStore';
import { loadShows, recoverPersonalCueDraft, restorePersonalRundown, type CueDraftWriteOptions, type Show } from '../../model/shows';
import type { CueFields, CueRecord, OwedEdit } from '../../control/cueDraft';
import type { DraftCommitId } from '../../model/cueDraftCommit';
import { RundownHistory, cueFieldsKey, draftSaveOvertaken, cueTextKey, landedReplacement, rundownSlice, sameRundown, RUNDOWN_CHANGED, type RundownSlice } from '../../model/rundownHistory';

type WriteResult = { shows: Show[]; error: string | null; refused?: string | null };
type Group = { key: string; before: RundownSlice; after: RundownSlice; valid: boolean };
type Typing = {
  cueId: string;
  text: string | null;
  staged?: { text: string; committedText?: () => string | null; commit?: DraftCommitId };
  retaining?: Promise<boolean>;
  /** Where in the queue the latest save of this typing was handed over (#2589). */
  lastSaveAt?: number;
};
type PendingTeamEdit = { before: RundownSlice; after: RundownSlice; label: string; receipt: TeamRundownReceipt; group?: Group; closed: boolean; confirming: boolean };

type ObserveCue = (cue: CueRecord) => void;
type DraftWrite = (expectedText: string, options?: CueDraftWriteOptions) => WriteResult;
type DraftSave = { typing: Typing; confirm?: ObserveCue; commit?: DraftCommitId };

function receiptCue(bytes: string | null, show: Show, cueId: string): CueRecord | undefined {
  try {
    const value = JSON.parse(bytes ?? 'null');
    const stored: Show | undefined = show.teamId
      ? value?.edits?.[show.id]?.local : value?.find((candidate: Show) => candidate.id === show.id);
    if (stored?.id === show.id && stored.teamId === show.teamId) return stored.cues?.find(cue => cue.id === cueId);
  } catch { /* An unreadable snapshot cannot confirm a draft. */ }
}

function draftReceipt(receipts: readonly DurableWriteReceipt[], show: Show, cueId: string, text: string) {
  for (const receipt of receipts) {
    const cue = receiptCue(receipt.value, show, cueId);
    if (cue && cueFieldsKey(cue) === text) return receipt;
  }
  return undefined;
}

function committedCue(receipt: DurableWriteReceipt, show: Show, cueId: string) {
  return receiptCue(receipt.committedValue ? receipt.committedValue() : receipt.value, show, cueId);
}

function stagedCue(text: string, receipt: DurableWriteReceipt, show: Show, cueId: string, commit?: DraftCommitId): NonNullable<Typing['staged']> {
  const stored = receipt.committedValue;
  return { text, commit, committedText: !show.teamId && stored ? () => {
    const cue = receiptCue(stored(), show, cueId);
    return cue ? cueFieldsKey(cue) : null;
  } : undefined };
}

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
  /** Every operation queued so far, in order: where a typed save stands among them (#2589). */
  const queued = useRef(0);
  const queue = useRef({ identity, count: 0, tail: Promise.resolve() as Promise<unknown> });
  if (queue.current.identity !== identity) queue.current = { identity, count: 0, tail: Promise.resolve() };
  const callbacks = useRef({ update, note, safety, cancelDraft }); callbacks.current = { update, note, safety, cancelDraft };
  const shown = useRef(show); shown.current = show;
  const [, redraw] = useState(0);
  const changed = () => redraw(n => n + 1);
  const fresh = () => loadShows().find(s => s.id === show?.id && s.teamId === show?.teamId);
  /** The cue being typed and its text as this page last knew it (#2572): taken when typing starts
   *  on a cue, moved by every write of this page (gone with the cue), and kept through every change
   *  made elsewhere that leaves that text alone. Cleared when the typing is discarded. */
  const typing = useRef<Typing | null>(null);
  const keptAt = useRef<RundownSlice | null>(null);
  const lifetime = useRef({ generation: 0 });
  const matchesTyping = (draft: Typing | null, now: RundownSlice | null): boolean =>
    !!now && !!draft && draft.text !== null && cueTextKey(now, draft.cueId) === draft.text;
  const discardDraft = () => {
    if (typing.current) typing.current.text = null;
    typing.current = null;
    callbacks.current.cancelDraft();
  };
  /** A history invalidation can leave the current draft and the other queued drafts valid. */
  const invalidate = (message = RUNDOWN_CHANGED, keepAt: RundownSlice | null = null) => {
    history.current.clear(); if (group.current) group.current.valid = false; group.current = null; pendingTeam.current = null;
    epoch.current.value++; keptAt.current = keepAt; if (!keepAt) discardDraft(); callbacks.current.note(message); changed();
  };
  const changedElsewhere = (now: RundownSlice | null) =>
    invalidate(RUNDOWN_CHANGED, matchesTyping(typing.current, now) ? now : null);
  const reconcile = () => {
    if (owner.current !== identity || queue.current.count) return;
    const current = fresh();
    const now = current ? rundownSlice(current) : null;
    const pending = pendingTeam.current;
    if (pending) {
      if (!current || !now || (!sameRundown(now, pending.after) && !sameRundown(now, pending.before))) { changedElsewhere(now); return; }
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
    const expected = group.current?.after ?? history.current.peek('undo')?.after ?? history.current.peek('redo')?.before ?? keptAt.current;
    if (expected && (!now || !sameRundown(now, expected))) changedElsewhere(now);
  };
  useEffect(() => {
    const retained = history.current, generation = epoch.current, session = lifetime.current;
    retained.clear(); group.current = null; pendingTeam.current = null; generation.value++; changed();
    const onChange = () => reconcile();
    const off = subscribeTeamState(onChange);
    window.addEventListener('spx-data-changed', onChange);
    const pause = () => {
      session.generation++;
      invalidate('Account editing paused. Undo history was cleared.');
    };
    window.addEventListener('noacg-account-authoring', pause);
    return () => {
      session.generation++; generation.value++; retained.clear();
      off(); window.removeEventListener('spx-data-changed', onChange);
      window.removeEventListener('noacg-account-authoring', pause);
    };
    // A session follows this identity, never a render's mutable show object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  /** `draft`: the typed cue's save, which a cleared history does not void; `perform` judges it
   *  against the rundown it finds (#2572, D5). */
  function enqueue<T>(operation: () => Promise<T>, stale: T, draft = false): Promise<T> {
    const generation = epoch.current.value, held = queue.current, session = lifetime.current.generation;
    const canFinish = () => held === queue.current && session === lifetime.current.generation;
    held.count++; queued.current++; changed();
    const result = held.tail.then(async () => {
      if (!canFinish() || (!draft && generation !== epoch.current.value) || !canAuthorAccount()) return stale;
      return operation();
    }).catch((error: unknown) => {
      if (canFinish() && (draft || generation === epoch.current.value)) callbacks.current.note(error instanceof Error ? error.message : 'The rundown edit was not saved.');
      return stale;
    });
    held.tail = result.finally(() => { held.count--; if (canFinish()) { changed(); reconcile(); } });
    return result;
  }
  function record(before: RundownSlice, after: RundownSlice, label: string) {
    const result = history.current.record(before, after, label);
    if (result === 'too-large') callbacks.current.note('This edit is too large to undo. Undo history was cleared.');
    changed();
  }
  const perform = async (write: (options?: CueDraftWriteOptions) => WriteResult, label: string, held?: Group, failed = label, save?: DraftSave): Promise<boolean> => {
    const draft = save?.typing ?? null;
    const current = fresh(); if (!current) return false;
    const before = rundownSlice(current);
    // A typing group whose history was cleared no longer says what the rundown should be (D5).
    if (held && !held.valid) held = undefined;
    let pending = pendingTeam.current;
    const expected = pending?.after ?? held?.after ?? history.current.peek('undo')?.after ?? history.current.peek('redo')?.before ?? keptAt.current;
    let keptNote = !!draft && !!keptAt.current;
    if (draft && !matchesTyping(draft, before)) {
      draft.text = null;
      changedElsewhere(before);
      return false;
    }
    if (expected && !sameRundown(before, expected)) {
      changedElsewhere(before);
      if (!draft) return false;
      keptNote = true;
      pending = null; held = undefined;
    }
    const session = lifetime.current.generation, queueAtWrite = queue.current, generation = epoch.current.value;
    const activeAtWrite = typing.current;
    const ownsWrite = () => session === lifetime.current.generation && queueAtWrite === queue.current;
    const team = current.teamId ? beginTeamRundownEdit(current.id) : null;
    const key = team ? 'spx-gfx-team-outbox' : 'spx-gfx-shows';
    const captured = captureDurableWrites(key, () => write({ commit: save?.commit }));
    const result = captured.result;
    callbacks.current.update(result.shows);
    const intendedShow = result.shows.find(s => s.id === current.id && s.teamId === current.teamId);
    const intended = intendedShow ? rundownSlice(intendedShow) : null;
    let error = result.refused ?? result.error;
    const stagedText = draft && !error && intended ? cueTextKey(intended, draft.cueId) : null;
    const receipt = draft && stagedText !== null ? draftReceipt(captured.receipts, current, draft.cueId, stagedText) : undefined;
    if (!error && draft && !receipt) {
      error = 'This rundown save has not been confirmed.';
    }
    const staged = !error && draft && receipt && stagedText !== null ? stagedCue(stagedText, receipt, current, draft.cueId, save?.commit) : undefined;
    if (draft && staged) {
      draft.staged = staged;
      if (team) bindTeamCueDraft(team, draft.cueId, staged.text);
    }
    for (const receipt of captured.receipts) {
      const failed = await commitDurableReceipt(receipt);
      error ??= failed;
    }
    if (!error && !team && intended && !sameRundown(before, intended) && !captured.receipts.length) error = 'This rundown save has not been confirmed.';
    if (!ownsWrite()) return false;
    const locallyAccepted = !error;
    if (!error && team && intended && (pending || !sameRundown(before, intended))) error = await commitTeamRundownEdit(team, intended);
    if (!ownsWrite()) return false;
    const localCue = draft && receipt && locallyAccepted && !team ? committedCue(receipt, current, draft.cueId) : undefined;
    if (localCue && draft) {
      save?.confirm?.(localCue);
      if (matchesTyping(draft, before)) draft.text = cueFieldsKey(localCue);
      // A later local transaction can temporarily hide this commit in the mirror. Wait for
      // those already staged writes before judging the visible history or discarding typing.
      if (cueTextKey(fresh() ?? {}, draft.cueId) !== draft.text) {
        await Promise.all(unsettledWrites('spx-gfx-shows').map(write => write.settled));
      }
    }
    if (draft && draft.staged === staged) draft.staged = undefined;
    if (!ownsWrite()) return false;
    const accepted = fresh();
    const acceptedSlice = accepted ? rundownSlice(accepted) : null;
    const confirmedText = team && draft && stagedText !== null
      ? error === RUNDOWN_CHANGED ? confirmedTeamCueText(team, draft.cueId, stagedText) : !error ? stagedText : null
      : localCue ? cueFieldsKey(localCue) : null;
    const actualCue = draft && accepted?.cues?.find(cue => cue.id === draft.cueId);
    const typedLanded = Boolean(actualCue && confirmedText !== null && cueFieldsKey(actualCue) === confirmedText);
    if (team && actualCue && typedLanded && locallyAccepted && (!error || error === RUNDOWN_CHANGED)) save?.confirm?.(actualCue);
    // Advance only the drafts this write knew, over text that is still the accepted text.
    if (locallyAccepted && intended && acceptedSlice) {
      for (const saved of new Set([draft, activeAtWrite])) {
        if (!saved || !matchesTyping(saved, before)) continue;
        const text = saved === draft && confirmedText !== null ? confirmedText : cueTextKey(intended, saved.cueId);
        if (cueTextKey(acceptedSlice, saved.cueId) === text) saved.text = text;
      }
    }
    // The history moved while the save was out: a change made elsewhere. A stored typed text whose
    // cue is untouched counts as sent; anything else is as today (D5, D6).
    if (generation !== epoch.current.value) return !error && typedLanded;
    callbacks.current.update(loadShows());
    if (error) {
      // The team confirmed a revision holding this save merged with a change made elsewhere: the
      // typed text is on the server; the history is cleared with the typing kept (D5). A storage or
      // network failure, or a refusal, is as today (D6).
      if (draft && error === RUNDOWN_CHANGED) {
        changedElsewhere(acceptedSlice);
        return !!team && locallyAccepted && typedLanded;
      }
      if (team && intended && accepted && acceptedSlice && sameRundown(acceptedSlice, intended) && !sameRundown(before, intended)) {
        pendingTeam.current = { before: pending?.before ?? held?.before ?? before, after: intended, label, receipt: team, group: held, closed: !held, confirming: false };
      }
      callbacks.current.note(result.refused ?? `${failed}: ${error}`); return false;
    }
    if (!intended || !accepted || !acceptedSlice || !sameRundown(acceptedSlice, intended)) {
      // Changed elsewhere while the save was out: the typed text that landed stays typed (D5).
      changedElsewhere(acceptedSlice);
      return typedLanded;
    }
    pendingTeam.current = null; keptAt.current = null;
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
      if (!now || !sameRundown(now, held.after)) { changedElsewhere(now); return false; }
      record(held.before, held.after, 'Edit cue'); return true;
    }, false);
  };
  const beginGroup = (key: string, freshCue: CueRecord | null) => {
    // An idle save can clear the draft while the undo group stays open.
    if (freshCue) typing.current = { cueId: freshCue.id, text: cueFieldsKey(freshCue) };
    if (group.current?.key === key) return;
    void closeGroup();
    const current = fresh(); if (!current) return;
    const slice = rundownSlice(current);
    group.current = { key, before: slice, after: slice, valid: true };
    // A restored draft can already be open before the history sees its first edit.
    const cueId = key.slice(0, key.indexOf(':'));
    if (typing.current?.cueId !== cueId) typing.current = { cueId, text: cueTextKey(slice, cueId) };
    changed();
  };
  const writeDraft = (cueId: string, write: DraftWrite, recoveredFrom?: CueRecord, confirm?: ObserveCue, commit?: DraftCommitId, laterSaves?: () => number): Promise<boolean> => {
    const draft = recoveredFrom ? { cueId, text: cueFieldsKey(recoveredFrom) } : typing.current;
    if (draft?.cueId !== cueId) return Promise.resolve(false);
    const held = group.current ?? undefined, label = held ? 'Edit cue' : 'Save cue';
    const session = lifetime.current.generation, queueAtWrite = queue.current;
    let position = 0;
    const saved = enqueue(async () => {
      if (draft.retaining) await draft.retaining;
      // Later saves of this typing follow this one in the queue with newer text (#2589, D9).
      if (laterSaves && draftSaveOvertaken(position, laterSaves(), draft.lastSaveAt)) return false;
      const expectedText = draft.text;
      if (session !== lifetime.current.generation || queueAtWrite !== queue.current || expectedText === null) return false;
      return perform(options => write(expectedText, options), label, held, label, { typing: draft, confirm, commit });
    }, false, true);
    position = queued.current;
    if (laterSaves) draft.lastSaveAt = position;
    return saved;
  };
  const recoverDraft = (edit: OwedEdit & { commit: DraftCommitId }, stillOwed: () => boolean): Promise<boolean> => {
    const id = show?.id, scope = lifetime.current.generation;
    if (!id || show?.teamId) return Promise.resolve(false);
    const owns = () => owner.current === identity && lifetime.current.generation === scope;
    const valid = () => owns() && stillOwed();
    return enqueue(async () => {
      if (!valid()) return false;
      const result = await recoverPersonalCueDraft(id, edit, valid);
      if (!owns()) return result.settled;
      callbacks.current.update(loadShows());
      if (!result.settled && valid() && result.error) callbacks.current.note(result.error);
      if (result.change && valid()) {
        const current = fresh();
        if (current && sameRundown(rundownSlice(current), result.change.after)) {
          record(result.change.before, result.change.after, 'Save cue');
        }
      }
      return result.settled;
    }, false, true);
  };
  /** A closing write may follow the exact local result of this draft's checked write. */
  const retainDraft = (cueId: string, write: DraftWrite, confirm?: ObserveCue, commit?: DraftCommitId): false | Promise<boolean> => {
    const draft = typing.current;
    const current = fresh(), account = libraryInUse();
    if (!current || draft?.cueId !== cueId || draft.text === null || JSON.stringify([current.id, current.teamId, account]) !== identity) return false;
    const before = cueTextKey(current, cueId);
    if (before === null || (before !== draft.text && before !== draft.staged?.text)) return false;
    const key = current.teamId ? 'spx-gfx-team-outbox' : 'spx-gfx-shows';
    const prior = draft.staged;
    const predecessor = before === prior?.text ? prior : undefined;
    const session = lifetime.current.generation;
    const ownsWrite = () => libraryInUse() === account && owner.current === identity && session === lifetime.current.generation;
    const { result, receipts } = captureDurableWrites(key, () => write(before, {
      committedPredecessor: predecessor?.committedText, expectedPredecessor: predecessor?.commit?.revision, commit,
    }));
    const text = cueTextKey(result.shows.find(show => show.id === current.id && show.teamId === current.teamId) ?? {}, cueId);
    const receipt = text === null ? undefined : draftReceipt(receipts, current, cueId, text);
    if (result.error || result.refused || text === null || !receipt) return false;
    const staged = stagedCue(text, receipt, current, cueId, commit);
    draft.staged = staged;
    const settled = Promise.all(receipts.map(commitDurableReceipt)).then(errors => {
      const cue = libraryInUse() === account && !errors.some(Boolean) ? committedCue(receipt, current, cueId) : undefined;
      const actual = cue ? cueFieldsKey(cue) : null;
      const accepted = ownsWrite() && actual !== null && cueTextKey(fresh() ?? {}, cueId) === actual;
      if (cue && (!current.teamId || accepted)) confirm?.(cue);
      if (draft.staged === staged) {
        draft.staged = undefined;
        if (accepted && draft.text !== null) draft.text = actual;
      }
      return accepted;
    });
    draft.retaining = settled;
    void settled.then(() => { if (draft.retaining === settled) draft.retaining = undefined; });
    return settled;
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
    const held = queue.current, session = lifetime.current.generation;
    void (async () => {
      if (!(await before())) return;
      await held.tail;
      if (held === queue.current && session === lifetime.current.generation && can(direction)) await restore(direction);
    })();
    return true;
  };
  return {
    write, writeDraft, recoverDraft, retainDraft, beginGroup, closeGroup, restore, press,
    hasUnstoredDraft: (cueId: string, text: CueFields) => cueTextKey(fresh() ?? {}, cueId) !== cueFieldsKey(text),
    settle: async () => { await queue.current.tail; },
  };
}
