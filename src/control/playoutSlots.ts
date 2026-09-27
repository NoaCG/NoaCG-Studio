// A PLAYOUT SLOT as the operator reads it, and the order live slots are named in.
//
// Kept apart from playoutLink.ts, which reads the studio's settings from storage and talks to the
// Bridge, so the rules built on a slot stay importable with no browser at all: control/serverPlayout.ts
// and its Node tests import this file, never the link (docs/CLIP_PLAYBACK_PLAN.md §10).
// playoutLink.ts re-exports both functions, so every caller that already imports them from there
// keeps doing so.

import type { CasparSlot, OgrafSlot, Slot } from './playoutProtocol';

/** `1-20` - what the operator sees on the button, and what CasparCG calls the layer. An OGraf
 *  slot reads as its renderer and the render target's own fields: `renderer-0 layerId=1`. */
export function slotAddress(slot: Pick<CasparSlot, 'channel' | 'layer'> | OgrafSlot): string {
  if ('rendererId' in slot) {
    return [slot.rendererId, ...Object.entries(slot.renderTarget).map(([k, v]) => `${k}=${String(v)}`)].join(' ');
  }
  return `${slot.channel}-${slot.layer}`;
}

/** The order live slots are named in: by channel and then front to back, the way the server
 *  stacks them. An OGraf slot has no channel, so it follows, by its address. */
export function compareSlots(a: Slot, b: Slot): number {
  if (a.adapter === 'casparcg' && b.adapter === 'casparcg') return a.channel - b.channel || b.layer - a.layer;
  if (a.adapter !== b.adapter) return a.adapter === 'casparcg' ? -1 : 1;
  return slotAddress(a).localeCompare(slotAddress(b));
}
