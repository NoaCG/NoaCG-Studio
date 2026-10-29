// The pieces every LIVE-STATUS bug shares: the three hidden word sources, their SPX fields,
// and the class-driven look the machine switches between.
//
// Why the words are FIELDS and not values baked into the machine: an operator event carries
// state, not copy. A Norwegian channel wants DIREKTE, a sports feed wants REPLAY vs REPRISE,
// and a school stream wants RECORDING — so each mode owns an ordinary text field the operator
// can edit, and the runtime (bugRuntimes.ts) copies the entered mode's word into the visible
// status element. Nothing about the wording is hard-coded anywhere.

import type { SpxField } from '../../model/types';

/** The `fN` ids a live bug's four status fields compiled to. */
export interface StatusIds {
  /** The VISIBLE status element — the word currently on air. */
  status: string;
  live: string;
  replay: string;
  standby: string;
}

/** The three hidden word sources: SPX writes into them, the runtime reads them, nothing
 *  renders them. */
export function statusSourcesHtml(ids: StatusIds, indent = '    '): string {
  return (
    `${indent}<!-- The three status words. Hidden sources: SPX writes the operator's wording\n` +
    `${indent}     here, and the machine copies the entered mode's word into #${ids.status}. -->\n` +
    `${indent}<div id="${ids.live}" class="corner-bug-source">LIVE</div>\n` +
    `${indent}<div id="${ids.replay}" class="corner-bug-source">REPLAY</div>\n` +
    `${indent}<div id="${ids.standby}" class="corner-bug-source">STANDBY</div>`
  );
}

/**
 * The rule that hides those sources.
 *
 * A CSS CLASS, deliberately not an inline `style="display: none"`: the editor returns a
 * graphic to its resting state by clearing GSAP's inline properties on the whole root subtree
 * (historically the retired simulator's resetGraphic), which wipes the style attribute, and an
 * inline-hidden data holder then comes back VISIBLE on the canvas. A stylesheet rule cannot be
 * cleared that way, so the holders stay hidden in the editor, in SPX, and in every export.
 */
export const STATUS_SOURCE_CSS = `/* The status word sources — data holders the operator edits, never drawn.
   The rule lives in the stylesheet on purpose: an inline display:none would be wiped by the
   editor's entrance reset (it clears inline props) and the words would appear on screen. */
.corner-bug-source {
  display: none;                   /* input only: read by the machine, never rendered */
}`;

/** The SPX fields behind those sources — plain text fields, so the wording stays editable. */
export function statusSourceFields(ids: StatusIds): SpxField[] {
  return [
    { field: ids.live, ftype: 'textfield', title: 'Live word', value: 'LIVE' },
    { field: ids.replay, ftype: 'textfield', title: 'Replay word', value: 'REPLAY' },
    { field: ids.standby, ftype: 'textfield', title: 'Standby word', value: 'STANDBY' },
  ];
}

/**
 * The look of the three states. The machine only ever re-tags the root (`is-live` /
 * `is-replay` / `is-standby`); everything visual happens here, so the modes can be restyled
 * without touching the machine — and an untagged graphic (before any switch) reads as live,
 * which is what a bug that is on air should say.
 */
export function statusStateCss(): string {
  return `/* ── The status states ─────────────────────────────────────────────────────
   The machine tags the root with is-live / is-replay / is-standby; these rules are
   the whole visual difference. Untagged = live, so the bug reads correctly the
   moment it goes on air. */
.corner-bug.is-replay .corner-bug-dot,
.corner-bug.is-standby .corner-bug-dot {
  background: var(--text-dim);     /* off-air modes give up the accent lamp */
  box-shadow: none;                /* …and its glow */
  animation: none;                 /* nothing breathes when nothing is live */
}
.corner-bug.is-standby .corner-bug-name {
  color: var(--text-dim);          /* standby is the quietest of the three */
}`;
}
