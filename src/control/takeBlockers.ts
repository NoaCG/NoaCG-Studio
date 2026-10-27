// WHY A TAKE WOULD NOT GO: the refusal rules the production page asks before a Take, a direct
// trigger or a One-by-one step sends anything (docs/CLIP_PLAYBACK_PLAN.md §6.9).
//
// PLAIN FUNCTIONS OVER ONE RENDER'S FACTS, moved out of ProductionPage with their behaviour
// unchanged (production-page refactor, phase 5). The page builds a `TakeContext` each render from
// what it already holds - the rundown, the server's ownership, the studio's settings, what the
// Bridge can do, the CasparCG switch - and asks these. Where a slot is worked out from the
// settings, the page hands in `slots` (control/playoutLink.ts `itemSlot` and `folderSlot`), since
// the link reads storage and cannot be imported in Node. Runtime imports carry `.ts` so Node
// resolves them; everything else is a type.

import type { PlayoutItem, ShowCue, ShowFolder } from '../model/shows';
import type { PlayoutSettings } from './playoutLink';
import type { Slot } from './playoutProtocol';
import type { PlaybackAbility } from './cuePlayback';
import type { ServerOwnership } from './serverState';
import { folderMode } from '../model/showFolders.ts';
import { folderRun, sequenceMembers, takeBlocker, type ThroughRole } from './serverPlayout.ts';
import { airClash } from './serverState.ts';
import { outputSlotRefusal, slotAddress } from './playoutSlots.ts';
import { effectiveEnd } from './cuePlayback.ts';
import { FOREIGN_NOT_PLAYABLE } from '../model/foreignPackage.ts';

/** Where an item, and a Play-through folder, play by the settings given (control/playoutLink.ts). */
export interface SlotRules {
  itemSlot: (settings: PlayoutSettings, item: { channel?: number; layer: number }) => Slot;
  folderSlot: (settings: PlayoutSettings, folder: Pick<ShowFolder, 'slot'>) => Slot;
}

/** One render's facts, as the page holds them. */
export interface TakeContext {
  cues: readonly ShowCue[];
  items: readonly PlayoutItem[];
  folders: readonly ShowFolder[];
  /** Each folder's cues, as the rundown draws them (model/rundownRows.ts `members`). */
  members: ReadonlyMap<string, readonly ShowCue[]>;
  /** Every clip's place in its Play-through folder (./serverPlayout.ts `throughPlaces`). */
  places: ReadonlyMap<string, { folder: ShowFolder; role: ThroughRole }>;
  ownership: Pick<ServerOwnership, 'onAir' | 'sequences'>;
  settings: PlayoutSettings;
  /** What the Bridge and its server can do: null while it is still being asked. */
  ability: PlaybackAbility | null;
  /** The production's CasparCG switch. */
  casparOn: boolean;
  /** The Bridge has answered, and not with ok. */
  bridgeDown: boolean;
  itemOf: (cue: ShowCue) => PlayoutItem | null;
  /** A graphic cue's pool graphic, null when the production no longer has it. `foreign`: it is a
   *  stranger's OGraf package (model/foreignPackage.ts). */
  graphicOf: (cue: ShowCue) => { name: string; layer: number; foreign?: boolean } | null;
  slots: SlotRules;
  /** Why a graphic cue's live candidate is not ready to Take, or null (control/selectionAir.ts
   *  `selectionTake`): read-only, unknown or not resolving now. Absent: no cue has one. */
  selectionBlocker?: (cue: ShowCue) => string | null;
}

/** The first graphic cue of this cue, or of this folder's cues, that is not ready to Take: over a
 *  stranger's OGraf package, whose outputs are E3.2a's (docs/work-specs/playout-ograf-rundown/
 *  spec.md), or with a live candidate that is not ready. */
const selectionRefusal = (target: ShowCue | ShowFolder, ctx: TakeContext): string | null => {
  const cues = 'sourceId' in target ? [target] : (ctx.members.get(target.id) ?? []);
  for (const cue of cues) {
    const why = cue.source === 'playout' ? null : ctx.graphicOf(cue)?.foreign ? FOREIGN_NOT_PLAYABLE : (ctx.selectionBlocker?.(cue) ?? null);
    if (why) return 'sourceId' in target ? why : `${cue.label}: ${why}`;
  }
  return null;
};

/** Where a server item plays on its own by the render's settings, `2-10`. */
const addressOf = (ctx: TakeContext) => (i: PlayoutItem) => slotAddress(ctx.slots.itemSlot(ctx.settings, i));

/** A native cue is not taken while the production's CasparCG switch is off (AC-4): the one place
 *  that says so, read by the TAKE button's title, the cue editor, a One-by-one step and the send.
 *  An All-together folder still takes its other cues and marks such a member NOT TAKEN. */
export const casparOffRefusal = (cue: ShowCue, casparOn: boolean): string | null =>
  cue.source === 'playout' && !casparOn ? 'CasparCG is off for this production.' : null;

/**
 * WHERE A TAKE OF THIS CUE - OR THIS FOLDER - LANDS on the server: one plan per slot it plays on,
 * with the cues that will hold it. A Play-through folder plays on its own slot; another folder's
 * server cues each on their own; a cue on its Play-through folder's slot when it is in one, else on
 * its own. The cues are worked out only when asked, since only the air-clash check needs them.
 */
export const takePlans = (target: ShowCue | ShowFolder, ctx: TakeContext): { slot: string; cueIds: () => readonly string[]; folderId?: string }[] => {
  const { cues, items: playoutItems, folders, places } = ctx;
  const addressOfItem = addressOf(ctx);
  const folderSlotOf = (folder: ShowFolder) => slotAddress(ctx.slots.folderSlot(ctx.settings, folder));
  if (!('sourceId' in target)) {
    const members = ctx.members.get(target.id) ?? [];
    if (folderMode(target) === 'through') return [{ slot: folderSlotOf(target), cueIds: () => members.map((c) => c.id), folderId: target.id }];
    return members.flatMap((c) => {
      const item = ctx.itemOf(c);
      return item ? [{ slot: addressOfItem(item), cueIds: () => [c.id] }] : [];
    });
  }
  const item = ctx.itemOf(target);
  if (!item) return [];
  const through = places.get(target.id)?.folder;
  if (through) {
    return [
      {
        slot: folderSlotOf(through),
        cueIds: () => {
          const run = folderRun(through, cues, playoutItems, target.id);
          return run.ok ? run.run.members.map((m) => m.cue.id) : [target.id];
        },
        folderId: through.id,
      },
    ];
  }
  return [
    {
      slot: addressOfItem(item),
      cueIds: () => {
        const chain = item.kind === 'media' && effectiveEnd(target, item) === 'next' ? sequenceMembers(cues, playoutItems, target.id, addressOfItem, folders) : null;
        return chain?.ok ? chain.members.map((m) => m.cue.id) : [target.id];
      },
    },
  ];
};

/**
 * WHY A TAKE OF THIS CUE - OR THIS FOLDER - WOULD NOT GO, or null (plan §6.9): a setting nobody here
 * can honour is never dropped on the way to air, a Play next whose clips cannot be found is never
 * taken as a Hold, a folder answers by how it plays, and a file this page already has up on another
 * slot is never taken onto a second. FIRST of all, nothing is taken onto the NoaCG output's own slot,
 * which would replace the output and every graphic on it - so that is the reason the operator reads.
 */
export const takeBlockerFor = (target: ShowCue | ShowFolder | null, ctx: TakeContext): string | null => {
  if (!target) return null;
  const off = 'source' in target ? casparOffRefusal(target, ctx.casparOn) : null;
  if (off) return off;
  const candidate = selectionRefusal(target, ctx);
  if (candidate) return candidate;
  const plans = takePlans(target, ctx);
  for (const plan of plans) {
    const onOutput = outputSlotRefusal(plan.slot, ctx.settings);
    if (onOutput) return onOutput;
  }
  const addressOfItem = addressOf(ctx);
  const blocked = takeBlocker(target, ctx.cues, ctx.items, addressOfItem, ctx.ability, ctx.folders, ctx.graphicOf);
  if (blocked) return blocked;
  const throughFolderIdOf = (cueId: string) => ctx.places.get(cueId)?.folder.id;
  for (const plan of plans) {
    const why = airClash({ slot: plan.slot, cueIds: plan.cueIds(), folderId: plan.folderId }, ctx.ownership, ctx.cues, throughFolderIdOf);
    if (why) return why;
  }
  return null;
};

/** Direct cues use their own route and end action, independently of their folder or neighbours.
 *  The output slot is judged by `settings` as they stand at the press, which the page reads then. */
export const directBlocker = (cue: ShowCue, ctx: TakeContext, settings: PlayoutSettings): string | null => {
  if (cue.source !== 'playout') return !ctx.graphicOf(cue)?.name ? `${cue.label} has no graphic.` : selectionRefusal(cue, ctx);
  const off = casparOffRefusal(cue, ctx.casparOn);
  if (off) return off;
  const item = ctx.itemOf(cue);
  if (!item) return `${cue.label} has no media file.`;
  const addressOfItem = addressOf(ctx);
  return outputSlotRefusal(slotAddress(ctx.slots.itemSlot(settings, item)), settings) ?? takeBlocker(cue, [cue], ctx.items, addressOfItem, ctx.ability, [], ctx.graphicOf);
};

/** Why a step's next cue cannot be taken, or null: its file or graphic gone, NoaCG Bridge not there
 *  for a server cue, or its own Take check. Asked before anything of the step is sent, so a press
 *  that cannot take its cue takes nothing else off either. */
export const stepBlocker = (next: ShowCue, ctx: TakeContext): string | null =>
  next.source === 'playout'
    ? !ctx.itemOf(next)
      ? `${next.label} plays a file this production no longer lists.`
      : ctx.bridgeDown
        ? `${next.label} plays on the playout server, and NoaCG Bridge is not connected.`
        : takeBlockerFor(next, ctx)
    : !ctx.graphicOf(next)?.name
      ? `${next.label} points at a graphic this production no longer has.`
      : takeBlockerFor(next, ctx);
