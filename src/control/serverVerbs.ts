// ONE VERB ON THE PLAYOUT SERVER AND ITS FOLD: what the production page does around
// ./serverPlayout.ts `runServerVerb` - the refusal said at the press, the settings read at the
// press, the draft saved after the verb (live-publishing W1), a Play-through folder's stray copies taken off first, each accepted
// action folded into the store, and the server read again at once (docs/BRIDGE.md §5,
// docs/CLIP_PLAYBACK_PLAN.md §6.6).
//
// Moved out of ProductionPage with its behaviour and its order unchanged (production-page
// refactor, phase 5). The Bridge's `act`, the settings, the clock and the state poll come in
// through `io`, with the draft's flush and `cueView` from control/cueDraft.ts. Runtime imports carry
// `.ts` so Node resolves them; everything else is a type.

import type { PlayoutItem, ShowCue } from '../model/shows';
import type { PlayoutResult, PlayoutSettings } from './playoutLink';
import type { PlayoutAction } from './playoutProtocol';
import type { ServerPlayoutStore } from './serverPlayoutStore';
import type { TakeContext } from './takeBlockers';
import { folderRun, runServerVerb, sequenceAction, sequenceMembers, type SequenceMember, type ServerVerb, type ServerVerbOutcome } from './serverPlayout.ts';
import { applyAccepted, applyClearedSlot } from './serverState.ts';
import { slotAddress } from './playoutSlots.ts';
import { effectiveEnd, segmentSeconds } from './cuePlayback.ts';

export interface ServerVerbIo {
  act: (settings: PlayoutSettings, action: PlayoutAction) => Promise<PlayoutResult>;
  /** The studio's settings as they stand now. */
  loadSettings: () => PlayoutSettings;
  /** The page's own clock (ms), for the folds. */
  now: () => number;
  /** Read the server at once. */
  wake: () => void;
  /** Save the typed draft (`cueDraft.flush`) and close the history group: started once the verb
   *  is answered, never awaited by it (W1). */
  flush: () => Promise<unknown>;
  /** The cue as typed, draft included (`cueDraft.view`). */
  cueView: (cue: ShowCue) => { values: Record<string, string> };
}

/** What was pressed, captured at the press with the render that handled it. */
export interface ServerVerbIntent {
  cue: ShowCue;
  item: PlayoutItem;
  verb: ServerVerb;
  label: string;
  options?: { cut?: boolean; takenAt?: number; direct?: boolean };
  /** A Take's refusal (./takeBlockers.ts), asked at the press: null when it may go. Read for a
   *  Take only, since no other verb is refused. Required, so no caller can leave it unasked. */
  blocked: string | null;
  /** The Bridge reads the server (control/playoutLink.ts `stateReadable`). */
  readable: boolean;
  rundown: Pick<TakeContext, 'cues' | 'items' | 'folders' | 'members' | 'places' | 'itemOf' | 'slots'>;
}

export interface VmixAllOutCut {
  settings: PlayoutSettings;
  pairing: NonNullable<ReturnType<ServerPlayoutStore['vmixBinding']>>;
  instance: string;
  current: () => boolean;
}

/** Keep the accepted player instances and their pairing until the last cut settles, including
 *  after the production unmounts. An intervening pairing change revokes every remaining cut. */
export async function finishVmixAllOut(
  store: ServerPlayoutStore,
  settings: PlayoutSettings,
  watchPairing: (changed: () => void) => () => void,
  allOut: (cut: (cue: ShowCue) => Promise<boolean>) => Promise<void>,
  cut: (cue: ShowCue, scope: VmixAllOutCut) => Promise<boolean>,
): Promise<void> {
  const pairing = store.vmixBinding();
  const original = store.ownership.get().onAir;
  let paired = true;
  const stop = watchPairing(() => { paired = false; });
  try {
    await allOut(async cue => {
      const owner = original[cue.sourceId];
      if (!pairing || !owner?.instance || owner.cueId !== cue.id || owner.slot.adapter !== 'vmix') return false;
      const current = () => paired && store.ownership.get().onAir[cue.sourceId] === owner;
      return cut(cue, { settings, pairing, instance: owner.instance, current });
    });
  } finally {
    stop();
  }
}

/** Keep local commands ordered and check that the accepted cue at the press still owns the player. */
export function runVmixAndRecord(
  store: ServerPlayoutStore,
  io: ServerVerbIo,
  intent: ServerVerbIntent,
  current: () => boolean,
): Promise<ServerVerbOutcome> {
  const { item, cue, verb, label } = intent;
  const settings = io.loadSettings();
  const slot = intent.rundown.slots.itemSlot(settings, item);
  const refused = (reason: string): ServerVerbOutcome => ({ ok: false, note: `${label} was not sent: ${reason}`, accepted: [] });
  if (slot.adapter !== 'vmix' || !('player' in slot)) return Promise.resolve(refused('This cue has no vMix player.'));
  if (verb === 'update' || verb === 'next') return Promise.resolve(refused('This control is unavailable for vMix media.'));
  const expected = store.ownership.get().onAir[item.id];
  const owns = () => verb === 'take' || (!!expected && expected.cueId === cue.id && store.ownership.get().onAir[item.id] === expected);
  return store.runVmix(slot.player, () => {
    if (!current()) return Promise.resolve(refused('The vMix connection changed.'));
    if (!owns()) return Promise.resolve(refused('This cue is no longer on its vMix player.'));
    return runAndRecord(store, {
      ...io,
      loadSettings: () => settings,
      act: async (sendSettings, action) => {
        if (!current() || !owns()) return { state: 'config', detail: 'This vMix action was cancelled.' };
        const result = await io.act(sendSettings, action);
        if (!current()) return { state: 'config', detail: 'The vMix connection changed.' };
        if (result.playerUncertain) store.apply(parts => applyClearedSlot(parts, { slot }));
        return result;
      },
    }, intent, current);
  });
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
  current?: () => boolean,
): Promise<ServerVerbOutcome> {
  // A Take never goes the old way with a setting dropped (docs/CLIP_PLAYBACK_PLAN.md §6.9). SPACE,
  // the button and Re-take all come through here, so the check is made once, where it cannot be
  // stepped round; taking a cue OFF and staging it on PREVIEW are never held up by it. Refused, it
  // touches nothing, the draft included.
  if (intent.verb === 'take' && intent.blocked) return { ok: false, note: `${intent.label} was not sent: ${intent.blocked}`, accepted: [] };
  try {
    return await runVerb(store, io, intent, current);
  } finally {
    // A save that fails reports itself through the save state; it never holds or aborts the verb.
    void io.flush().catch(() => undefined);
  }
}

async function runVerb(
  store: Pick<ServerPlayoutStore, 'ownership' | 'apply'>,
  io: ServerVerbIo,
  intent: ServerVerbIntent,
  current?: () => boolean,
): Promise<ServerVerbOutcome> {
  const { cue, item, verb, label, options = {}, readable } = intent;
  const { cues, items: playoutItems, folders, places } = intent.rundown;
  // A NATIVE CUE NEVER WAITS ON THE PAGE'S OWN WORK (playout-workflow-simplification AC-14,
  // live-publishing W1). Its values come from this page's own draft (`cueView`), so the save starts
  // once the verb is answered (`runAndRecord`), on any network.
  const settings = io.loadSettings();
  const through = !options.direct && verb === 'take' && item.kind === 'media' ? places.get(cue.id)?.folder : undefined;
  const run = through ? folderRun(through, cues, playoutItems, cue.id) : null;
  if (run && !run.ok) return { ok: false, note: `${label} was not sent: ${run.reason}`, accepted: [] };
  const first: SequenceMember = run?.ok ? run.run.members[0] : { cue, item };
  // Play next: the clips a Take plays one after another, found in the rundown as it stands NOW
  // (docs/CLIP_PLAYBACK_PLAN.md §6.6). The Take is off with the reason when they cannot be found.
  const chain =
    !options.direct && !run && verb === 'take' && item.kind === 'media' && effectiveEnd(cue, item) === 'next'
      ? sequenceMembers(cues, playoutItems, cue.id, (i) => slotAddress(intent.rundown.slots.itemSlot(settings, i)), folders)
      : null;
  const members = run?.ok ? (run.run.members.length > 1 ? run.run.members : undefined) : chain?.ok && chain.members.length > 1 ? chain.members : undefined;
  const loop = !!run?.ok && run.run.loop;
  const slotNow = through ? intent.rundown.slots.folderSlot(settings, through) : intent.rundown.slots.itemSlot(settings, item);
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
  // A pairing can change between the action reply and this synchronous acceptance fold.
  if (current && !current()) return { ok: false, note: `${label}: The vMix connection changed.`, accepted: [] };
  for (const a of outcome.accepted) {
    store.apply((parts) =>
      applyAccepted(parts, {
        ...a,
        itemId: item.id,
        cueId: cue.id,
        // The take's own count until the server's first reading: the part of the file it plays.
        length: item.adapter === 'vmix' ? undefined : segmentSeconds(first.cue, item),
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
