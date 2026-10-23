// ONE VERB ON THE PLAYOUT SERVER AND ITS FOLD: what the production page does around
// ./serverPlayout.ts `runServerVerb` - the refusal said at the press, the draft's head start, the
// settings read after the wait, a Play-through folder's stray copies taken off first, each accepted
// action folded into the store, and the server read again at once (docs/BRIDGE.md §5,
// docs/CLIP_PLAYBACK_PLAN.md §6.6).
//
// Moved out of ProductionPage with its behaviour and its order unchanged (production-page
// refactor, phase 5). The Bridge's `act`, the settings, the clock and the state poll come in
// through `io`, with the draft's flush and `cueView` while the page still owns the draft (until
// phase 13). Runtime imports carry `.ts` so Node resolves them; everything else is a type.

import type { PlayoutItem, ShowCue } from '../model/shows';
import type { PlayoutResult, PlayoutSettings } from './playoutLink';
import type { PlayoutAction } from './playoutProtocol';
import type { ServerPlayoutStore } from './serverPlayoutStore';
import type { SlotRules, TakeContext } from './takeBlockers';
import { folderRun, runServerVerb, sequenceAction, sequenceMembers, type SequenceMember, type ServerVerb, type ServerVerbOutcome } from './serverPlayout.ts';
import { applyAccepted } from './serverState.ts';
import { slotAddress } from './playoutSlots.ts';
import { effectiveEnd, segmentSeconds } from './cuePlayback.ts';

/** How long a native cue's verb lets the local save run before it sends (AC-14). */
export const LOCAL_SAVE_HEAD_START_MS = 250;

export interface ServerVerbIo {
  act: (settings: PlayoutSettings, action: PlayoutAction) => Promise<PlayoutResult>;
  /** The studio's settings as they stand now. */
  loadSettings: () => PlayoutSettings;
  /** The page's own clock (ms), for the folds. */
  now: () => number;
  /** Read the server at once. */
  wake: () => void;
  /** Save the typed draft and close the history group (temporary, until phase 13). */
  flush: () => Promise<unknown>;
  /** The cue as typed, draft included (temporary, until phase 13). */
  cueView: (cue: ShowCue) => { values: Record<string, string> };
  slots: SlotRules;
}

/** What was pressed, captured at the press with the render that handled it. */
export interface ServerVerbIntent {
  cue: ShowCue;
  item: PlayoutItem;
  verb: ServerVerb;
  label: string;
  options?: { cut?: boolean; takenAt?: number; direct?: boolean };
  /** A Take's refusal (./takeBlockers.ts), asked at the press; never for another verb. */
  blocked?: string | null;
  /** The Bridge reads the server (control/playoutLink.ts `stateReadable`). */
  readable: boolean;
  rundown: Pick<TakeContext, 'cues' | 'items' | 'folders' | 'members' | 'places' | 'itemOf'>;
}

/**
 * ONE VERB ON THE PLAYOUT SERVER, reporting nothing: ./serverPlayout.ts decides what it sends and
 * how the on-air map moves, through NoaCG Bridge with the settings as they stand now. The outcome
 * carries the note line's sentence; the page says it, and a folder's Take says all of its cues' at
 * once.
 *
 * A clip of a Play-through folder is taken by the folder's rules (docs/CLIP_PLAYBACK_PLAN.md §6.6):
 * from itself to the folder's end - round again with Loop the folder - on the folder's slot.
 */
export async function runAndRecord(
  store: Pick<ServerPlayoutStore, 'ownership' | 'apply'>,
  io: ServerVerbIo,
  intent: ServerVerbIntent,
): Promise<ServerVerbOutcome> {
  const { cue, item, verb, label, options = {}, readable } = intent;
  const { cues, items: playoutItems, folders, places } = intent.rundown;
  // A Take never goes the old way with a setting dropped (docs/CLIP_PLAYBACK_PLAN.md §6.9). SPACE,
  // the button and Re-take all come through here, so the check is made once, where it cannot be
  // stepped round; taking a cue OFF and staging it on PREVIEW are never held up by it.
  if (verb === 'take') {
    const blocked = intent.blocked;
    if (blocked) return { ok: false, note: `${label} was not sent: ${blocked}`, accepted: [] };
  }
  // A NATIVE CUE NEVER WAITS ON THE CLOUD (playout-workflow-simplification AC-14). Its values come
  // from this page's own draft (`cueView`), so the save only has to start first: a team
  // production's save goes to the server, which on a network that swallows requests would hold
  // the Take for seconds. The local write gets a moment, then the Take goes and the save finishes
  // behind it.
  // A save that fails reports itself through the save state; it must not hold or abort the Take.
  const saved = io.flush().catch(() => undefined);
  await Promise.race([saved, new Promise((resolve) => setTimeout(resolve, LOCAL_SAVE_HEAD_START_MS))]);
  const settings = io.loadSettings();
  const through = !options.direct && verb === 'take' && item.kind === 'media' ? places.get(cue.id)?.folder : undefined;
  const run = through ? folderRun(through, cues, playoutItems, cue.id) : null;
  if (run && !run.ok) return { ok: false, note: `${label} was not sent: ${run.reason}`, accepted: [] };
  const first: SequenceMember = run?.ok ? run.run.members[0] : { cue, item };
  // Play next: the clips a Take plays one after another, found in the rundown as it stands NOW
  // (docs/CLIP_PLAYBACK_PLAN.md §6.6). The Take is off with the reason when they cannot be found.
  const chain =
    !options.direct && !run && verb === 'take' && item.kind === 'media' && effectiveEnd(cue, item) === 'next'
      ? sequenceMembers(cues, playoutItems, cue.id, (i) => slotAddress(io.slots.itemSlot(settings, i)), folders)
      : null;
  const members = run?.ok ? (run.run.members.length > 1 ? run.run.members : undefined) : chain?.ok && chain.members.length > 1 ? chain.members : undefined;
  const loop = !!run?.ok && run.run.loop;
  const slotNow = through ? io.slots.folderSlot(settings, through) : io.slots.itemSlot(settings, item);
  if (through) {
    // The folder was moved to another slot while it played: its run there goes first, whichever of
    // its clips is up, so a move is a move and never a second run.
    const own = store.ownership.get().onAir;
    for (const member of intent.rundown.members.get(through.id) ?? []) {
      const m = intent.rundown.itemOf(member);
      const live = m ? own[m.id] : undefined;
      if (!m || !live || live.cueId !== member.id || slotAddress(live.slot) === slotAddress(slotNow)) continue;
      const off = await runServerVerb({ verb: 'out', cue: member, item: m, label, live, slotNow: live.slot, values: () => ({}), act: (action) => io.act(settings, action), cut: true });
      for (const a of off.accepted) store.apply((parts) => applyAccepted(parts, { ...a, itemId: m.id, cueId: member.id, now: io.now(), readable }));
      if (!off.ok) return off;
    }
  }
  const outcome = await runServerVerb({
    verb,
    cue: first.cue,
    item,
    label,
    // Read from the store as it stands now, not from the press: a reading may have moved it
    // while the verb was waiting its turn.
    live: store.ownership.get().onAir[item.id],
    slotNow,
    values: () => io.cueView(cue).values,
    act: (action) => io.act(settings, action),
    sequence: members,
    loop,
    ...(options.cut ? { cut: true } : {}),
  });
  for (const a of outcome.accepted) {
    store.apply((parts) =>
      applyAccepted(parts, {
        ...a,
        itemId: item.id,
        cueId: cue.id,
        // The take's own count until the server's first reading: the part of the file it plays.
        length: segmentSeconds(first.cue, item),
        loop: effectiveEnd(first.cue, item) === 'loop',
        // What this take sent for its end, which the clock says until the next Take.
        end: effectiveEnd(first.cue, item),
        now: io.now(),
        readable,
        ...(options.takenAt !== undefined && a.verb === 'take' ? { takenAt: options.takenAt } : {}),
        ...(a.verb === 'take' && members ? { sequence: { next: sequenceAction(members, a.slot, loop).entries.slice(1), ...(loop ? { loop: true } : {}) } } : {}),
      }),
    );
  }
  // Read the server at once rather than at the next half second: the clock and the rows then
  // show the server's own word for the clip that was just taken.
  if (outcome.accepted.length) io.wake();
  return outcome;
}
