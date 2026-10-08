// THE TWO SPACE MODES (docs/PLAYOUT_DASHBOARD.md §2f; owner, 2026-09-10) - the one decision and
// the one set of words, shared by every surface the playout dashboard ships on.
//
// It lives in `control/` rather than in the keymap because the exported controller is generated
// HERE, from a TypeScript string, and interpolates this module into its own vanilla JS: the
// decision as a table of its outcomes (`spaceActionTable`), the button faces and the checkbox's
// words. The two React surfaces reach the same things through `components/playoutKeys.ts`.
// Nothing about the mode is written twice.

import type { SpaceMode } from '../model/prefs';

export type { SpaceMode };

/** What one press of SPACE (or the TAKE button - the button IS the key) is about to do. */
export type SpaceAction = 'preview' | 'take' | 'take-off';

/** A stored value read back as a mode: the two words, and anything else is the default. */
export function asSpaceMode(value: unknown): SpaceMode {
  return value === 'preview-then-take' ? 'preview-then-take' : 'take';
}

/**
 * Decide the press from the SELECTED cue's state alone.
 *
 * 'take' mode is the toggle the dashboard has had since 2026-08-06: selecting a cue previews
 * it, SPACE airs it, SPACE again takes it off. 'preview-then-take' is the owner's mixer cut:
 * walking the rundown previews nothing, SPACE puts the selected cue on PREVIEW, SPACE again
 * airs it, and SPACE on a cue that is on air takes it off and leaves it on PREVIEW. Off-air
 * is the same gesture in both modes on purpose - a hand that learned "SPACE takes a live cue
 * off" in one mode must not find a second press between it and a clean screen in the other.
 *
 * "Previewed" is ONE cue on every surface - the last one put on PREVIEW - and it is held
 * synchronously, never read back off a wire: the owner's gesture is two presses in a row, and
 * a decision that waited for a poll would preview twice and air nothing.
 */
export function spaceAction(mode: SpaceMode, selected: { live: boolean; previewed: boolean }): SpaceAction {
  if (selected.live) return 'take-off';
  if (mode === 'preview-then-take' && !selected.previewed) return 'preview';
  return 'take';
}

/**
 * The decision's every outcome, as data the exported controller can carry: per mode, the four
 * states in the order off+fresh, off+previewed, live+fresh, live+previewed. Computed FROM
 * `spaceAction` at generation time, so the controller runs this table rather than a copy of the
 * function, and a change to the function is a change to what it ships.
 */
export function spaceActionTable(): Record<SpaceMode, [SpaceAction, SpaceAction, SpaceAction, SpaceAction]> {
  const row = (mode: SpaceMode): [SpaceAction, SpaceAction, SpaceAction, SpaceAction] => [
    spaceAction(mode, { live: false, previewed: false }),
    spaceAction(mode, { live: false, previewed: true }),
    spaceAction(mode, { live: true, previewed: false }),
    spaceAction(mode, { live: true, previewed: true }),
  ];
  return { take: row('take'), 'preview-then-take': row('preview-then-take') };
}

/** The TAKE button's words for each action. The `SPACE` key chip is rendered beside `text`. */
export const SPACE_FACES: Record<SpaceAction, { text: string; title: string }> = {
  'take-off': { text: '■ TAKE OFF', title: 'Take this cue off' },
  // Amber on every surface, never red: red means "this puts something on air", and this press
  // does not.
  preview: { text: '→ PREVIEW', title: 'Show the selected cue on PREVIEW. SPACE again takes it' },
  take: { text: '⟳ TAKE', title: 'Take the previewed cue' },
};

/** The checkbox's tooltip: the two modes as presses, never as their internal names. */
export const SPACE_MODE_TITLE =
  'Checked: SPACE puts the selected cue on PREVIEW, and SPACE again takes it. ' +
  'Unchecked: selecting a cue previews it and SPACE takes it.';

/** What the PREVIEW label reads in 'preview-then-take' mode before SPACE has put anything there. */
export const PREVIEW_EMPTY_LABEL = 'nothing in preview';

/** The exported controller's own storage key. It runs on the relay's origin, so it cannot share
 *  the app's prefs; interpolated at generation time so the generator and the page agree. */
export const CONTROLLER_SPACE_MODE_KEY = 'spx-gfx-space-mode';
