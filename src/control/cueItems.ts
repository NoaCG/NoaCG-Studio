// WHAT A TAKE, AN OUT AND ALL OUT SEND: each verb as the list of commands it is.
//
// Moved out of ./hostedControl.ts, which Node cannot import, so the wire sequence both playout
// surfaces send is tested in Node (production-page refactor, spec §2 and §5.2). hostedControl.ts
// re-exports it, so its callers are unchanged. Type imports only: keep it that way.

import type { MarkerAuto } from './cueAuto';
import type { ControlSendItem } from './hostedControl';
import type { AppliedAppearance } from './cueAdjust';
import type { TypedValues } from '../model/ografTyped';

// Each verb is defined ONCE, as the list of commands it is — and then either sent to the log or
// applied to a local rehearsal stage (docs/CLOUD_PLAYOUT.md §4a). Keeping the sequence as DATA
// is what makes a rehearsal faithful: rehearsing and airing are the same commands in the same
// order, not two implementations that have to be kept in step by hand.

/**
 * Take a cue: its data, its graphic in, and the shared cue status row. It touches ONE LAYER,
 * its own. Taking a lower third leaves the bug and the ticker on air, because those are other
 * graphics and therefore other layers (docs/CLOUD_PLAYOUT.md §4); taking a second cue on the
 * SAME graphic re-airs that one instance, which is what makes two cues over one lower third
 * replace each other and not stack.
 *
 * Clearing another layer is the operator's own verb (`clearCueItems` / `clearAllCueBatches`),
 * never a side effect of taking this one — an implicit stop is exactly what made a production
 * single-layer.
 */
export function takeCueItems(cue: {
  direct?: boolean;
  id: string;
  graphic: string;
  values: Record<string, string>;
  /** A timed cue's arm (control/cueAuto.ts `markerAuto`), carried on its marker so every follower
   *  learns the countdown from the Take's own row. */
  auto?: MarkerAuto | null;
  /** Its place and size, when the page has one to send (./cueAdjust.ts `appearanceToSend`): absent,
   *  the update is exactly what it always was. */
  appearance?: AppliedAppearance;
  /** Its typed data (model/ografTyped.ts `typedForSend`, E1.2a): absent, the update is exactly what
   *  it always was; present, it rides beside `values`, which are then empty. */
  typed?: TypedValues;
}): ControlSendItem[] {
  return [
    { graphic: cue.graphic, msg: { t: 'update', data: cue.values, ...(cue.appearance ? { appearance: cue.appearance } : {}), ...(cue.typed ? { typed: cue.typed } : {}) } },
    { graphic: cue.graphic, msg: { t: 'play' } },
    { graphic: cue.graphic, msg: { t: 'cue', cue: cue.id, ...(cue.direct ? { direct: true } : {}), ...(cue.auto ? { auto: cue.auto } : {}) } },
  ];
}

/** Out ONE layer: play that graphic off and clear its cue status. */
export function clearCueItems(liveGraphic: string): ControlSendItem[] {
  return [
    { graphic: liveGraphic, msg: { t: 'stop' } },
    { graphic: liveGraphic, msg: { t: 'cue', cue: null } },
  ];
}

/**
 * THE MOST ITEMS ONE `control_send_many` CALL TAKES (migration 0029: a count outside 1..8 raises
 * `not a command batch` and the WHOLE insert is refused). It is a verb, not an ingest API.
 */
const COMMAND_BATCH_MAX = 8;

/** An all-layers clear pays two items per layer, so it goes out in batches of four layers. */
const LAYERS_PER_CLEAR_BATCH = COMMAND_BATCH_MAX / 2;

/**
 * Out EVERY live layer: the "clear the screen" verb a multi-layer production needs, since no
 * single Take does it any more. One batch per four layers, so a production bigger than that
 * clears in log order rather than not at all.
 */
export function clearAllCueBatches(liveGraphics: string[]): ControlSendItem[][] {
  const batches: ControlSendItem[][] = [];
  for (let i = 0; i < liveGraphics.length; i += LAYERS_PER_CLEAR_BATCH) {
    batches.push(liveGraphics.slice(i, i + LAYERS_PER_CLEAR_BATCH).flatMap(g => clearCueItems(g).map(item =>
      item.msg.t === 'stop' ? { ...item, msg: { ...item.msg, sound: false as const } } : item)));
  }
  return batches;
}
