import { useCallback, useEffect, useMemo, useState } from 'react';
import { asSpaceMode, SPACE_FACES, spaceAction, type SpaceAction, type SpaceMode } from '../control/spaceMode';
import { loadPrefs, savePrefs } from '../model/prefs';
import { cueShortcutBindings, normalizeCueShortcut, pressIdentities } from '../model/cueShortcuts';
import type { ShowCue } from '../model/shows';

/**
 * THE VERB KEYS of the playout dashboard (docs/PLAYOUT_DASHBOARD.md §2), as one implementation.
 *
 * The dashboard ships three times - the in-app production page, the hosted control page and the
 * exported controller - and the contract says they must not diverge. The exported controller is
 * vanilla JS and carries its own copy by necessity (`control/productionControllerHtml.ts`); the
 * two React surfaces share THIS one, because a second keymap written by hand is exactly how the
 * hosted page ended up with no keys at all: an operator who learned the app could not walk the
 * rundown on the page a class actually operates from.
 */
export type PlayoutVerb =
  | 'take'
  | 'retake'
  | 'update'
  | 'next'
  | 'out'
  | 'select-prev'
  | 'select-next'
  // A server clip's Pause and Resume. Named verbs through the same dispatcher as the rest, so a
  // key, a button or a hardware panel reaches them one way (docs/backlog/companion-and-stream-deck.md).
  // The hosted page has no server cues to pause, and its dispatcher ignores all three.
  | 'pause'
  | 'resume'
  // `P`: pause the server clip on air, or resume it (docs/CLIP_PLAYBACK_PLAN.md §16, phase 3).
  | 'pause-toggle'
  // `H`: hold the timed cue's countdown that fires soonest, or resume the one held last
  // (docs/RUNDOWN_AUTOMATION_PLAN.md §2.8). It acts on the countdown, never on the selected cue's
  // layer. A surface with no countdowns ignores it.
  | 'hold'
  // A rundown's folders (docs/CLIP_PLAYBACK_PLAN.md §16, phase 4), with no key yet: make a folder of
  // the selected cues, and collapse or open the folder the cursor is on. A folder's Take and Out are
  // `take` and `out` with a folder row selected. The hosted page has no folders and ignores both.
  | 'folder-new'
  | 'folder-toggle'
  // The panic control, with no key on purpose (docs/CLIP_PLAYBACK_PLAN.md §20.1): the header's ■ All
  // out as a named verb, so a hardware panel presses the same thing. The hosted page ignores it.
  | 'all-out'
  // A hardware panel's per-cue keys, with no key on the keyboard (docs/work-specs/
  // hardware-panel-control/spec.md D4): select a named cue, airing nothing, or take it, which airs
  // it whatever the SPACE mode and, pressed while it is on air, takes it off. The cue rides on
  // `VerbPress.cue`. A surface without them ignores both.
  | 'select-cue'
  | 'take-cue'
  | 'trigger-cue'
  // Editing the rundown (docs/CLIP_PLAYBACK_PLAN.md §20.2): copy, cut and paste the selection
  // (Ctrl or Cmd with C, X, V), Escape to drop it, Shift with Up or Down to extend it. Nothing here
  // airs. The hosted page has no rundown to edit and ignores them.
  | 'copy'
  | 'cut'
  | 'paste'
  | 'select-clear'
  | 'extend-prev'
  | 'extend-next';

/** How a verb was pressed: `repeat` for a key's auto-repeat while it is held, which a surface may
 *  refuse for a verb that must happen once (a folder's Take fires several actions). */
export interface VerbPress {
  repeat: boolean;
  /** What a hardware panel's key named: the row `select-cue` and `take-cue` act on, or the clip
   *  `pause-toggle` pauses (its cue's id). Absent from a key or a button. */
  cue?: string;
}

/**
 * True when the keystroke belongs to whatever the operator is typing into, not to the verbs.
 *
 * A checkbox, a radio or a button is an INPUT that nobody types into, and it keeps focus after
 * a click - so without this carve-out the SPACE after ticking any box on the surface (the
 * SPACE-mode checkbox, a toggle field in the cue editor) flipped the box back instead of
 * taking. The verb handler calls preventDefault, which is what stops the native toggle.
 */
export function typingInto(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.tagName === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return type !== 'checkbox' && type !== 'radio' && type !== 'button';
  }
  return el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

/** key -> verb. `arrowup`/`arrowdown` walk the rundown; SPACE is the take TOGGLE. */
const KEY_MAP: Record<string, PlayoutVerb> = {
  // There is no PREVIEW key, and no Preview button on the two React surfaces (2026-08-22).
  // Their PVW monitor is a local stage that already follows the selection, so the verb only
  // ever re-selected the cue that was on it - and it was sitting second-loudest on a live bar
  // saying almost nothing. Selecting a cue in the rundown IS previewing it; the arrow keys walk
  // that selection. The EXPORTED controller keeps its own → Preview, where the word means
  // something else: it puts the cue on a real second output stream.
  //
  // The 'preview-then-take' SPACE mode (2026-09-16, `spaceAction` below) does not bring the
  // key back: SPACE stays the one verb and the mode changes what its first press on a fresh
  // cue does. The map is the same in both modes by design - an operator switching modes
  // relearns one press, never the keyboard.
  ' ': 'take',
  // RE-TAKE is a key of its own, never the toggle wearing a second meaning. It replays a live
  // cue's entrance, which is a different intention from "put this on" and from "take it off",
  // and an operator with a finger on SPACE must never discover which of the three they got.
  r: 'retake',
  u: 'update',
  n: 'next',
  '0': 'out',
  // A TOGGLE, so a held key must not repeat it: an auto-repeating P would pause and resume the clip
  // on air ten times a second (see NO_REPEAT).
  p: 'pause-toggle',
  // A TOGGLE too: a held H would hold and resume the countdown over and over.
  h: 'hold',
  // Walking the rundown from the keyboard is what makes the whole surface operable without a
  // mouse - and, since a Stream Deck is a keyboard emulator, what makes these verbs reachable
  // from one. Form controls keep their own arrows (`typingInto` covers input, textarea, select
  // and contenteditable), so a layer number still steps normally.
  arrowup: 'select-prev',
  arrowdown: 'select-next',
  escape: 'select-clear',
};

/** Ctrl (Cmd on a Mac) with a key: the rundown's clipboard. */
const MOD_MAP: Record<string, PlayoutVerb> = { c: 'copy', x: 'cut', v: 'paste' };

/** Text is selected on the page: Ctrl+C then copies that text, as it always did. */
function textSelected(): boolean {
  const sel = window.getSelection();
  return !!sel && !sel.isCollapsed && sel.toString().trim() !== '';
}

/** Verbs a held key fires once, not once per auto-repeat: each press means the opposite of the last. */
const NO_REPEAT = new Set<PlayoutVerb>(['take', 'retake', 'update', 'next', 'out', 'trigger-cue', 'pause-toggle', 'hold']);

/** The operator's own keys, by character: no cue shortcut may take one, with or without Shift. */
export const VERB_KEYS: ReadonlySet<string> = new Set(Object.keys(KEY_MAP));

export function cueShortcutReserved(key: string): boolean {
  return !normalizeCueShortcut(key) || !!KEY_MAP[key.replace('shift+', '')];
}

/** The rundown's cue shortcuts, live: an assignment works the moment it is saved, here and on the
 *  hosted page (playout-workflow-simplification AC-11). The focus, modal, menu and view guards in
 *  `usePlayoutVerbKeys` are what keep a key from firing by accident, not a second press. */
export function useCueShortcutSet(cues: readonly Pick<ShowCue, 'id' | 'hotkey'>[]) {
  return useMemo(() => cueShortcutBindings(cues), [cues]);
}

/**
 * Bind the verb keys while the playout surface is the one ON SCREEN. Never while typing - the
 * cue title and the fields live on these same surfaces, and SPACE inside a name must stay a
 * space.
 *
 * `enabled` exists because "mounted" was the wrong condition, and the difference put a graphic
 * on air by accident. The production page's SHELL renders on the Data and Audience workspaces
 * too, with the playout column hidden behind them rather than unmounted (which is right - see
 * ProductionPage, unmounting restarts every live graphic). So the keys stayed bound on a screen
 * with no monitors on it: standing on the Data tab with focus anywhere but an input, SPACE ran
 * Take and a cue went to air with nothing visible saying so. Measured 2026-08-21 - three rows
 * on the wire and the chip reading "on air" - and it is the concrete hazard behind the owner's
 * read of these workspaces the same day: "the buttons that we have and the side pages we have
 * feel a bit dangerous to swap between."
 *
 * A verb acts on what the operator can SEE. When they cannot see PROGRAM, the keys are not
 * theirs to press.
 */
export function usePlayoutVerbKeys(onKey: (verb: PlayoutVerb, press: VerbPress) => void, enabled = true, shortcuts: Record<string, string> = {}): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.getModifierState('AltGraph') || document.querySelector('[aria-modal="true"]')) return;
      if (typingInto(e.target)) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && MOD_MAP[e.key.toLowerCase()]) {
        if (textSelected()) return;
        e.preventDefault();
        if (!e.repeat) onKey(MOD_MAP[e.key.toLowerCase()], { repeat: false });
        return;
      }
      // The operator's verb keys come first, unmodified; everything else may be a cue shortcut,
      // matched by the key's position with its Ctrl, Alt and Shift (D13), or by the character for
      // a shortcut saved before positions were (`v`, `shift+f`).
      let verb = e.ctrlKey || e.metaKey || e.altKey ? undefined : KEY_MAP[e.key.toLowerCase()];
      if (!verb) {
        if (e.metaKey || document.querySelector('[role="menu"]')) return;
        const ids = pressIdentities({ code: e.code, key: e.key, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey });
        const cue = ids.filter((id) => id.includes('@') || !cueShortcutReserved(id)).map((id) => shortcuts[id]).find(Boolean);
        if (cue) { e.preventDefault(); if (!e.repeat) onKey('trigger-cue', { repeat: false, cue }); }
        return;
      }
      // Shift with Up or Down extends the selection; the cursor stays where it is.
      if (e.shiftKey && verb === 'select-prev') verb = 'extend-prev';
      if (e.shiftKey && verb === 'select-next') verb = 'extend-next';
      // Escape belongs to an open menu or dialog first: one that handled it has marked it so.
      if (verb === 'select-clear' && (e.defaultPrevented || document.querySelector('[role="menu"], [aria-modal="true"]'))) return;
      e.preventDefault();
      if (e.repeat && NO_REPEAT.has(verb)) return;
      onKey(verb, { repeat: e.repeat });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKey, enabled, shortcuts]);
}

export type RundownEditKey = 'delete' | 'undo' | 'redo';
/** Local authoring keys, separate from live verbs and hardware/exported controllers. */
export function useRundownEditKeys(onKey: (key: RundownEditKey) => boolean, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const press = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.isComposing || e.altKey || e.getModifierState('AltGraph') || typingInto(e.target) || document.querySelector('[aria-modal="true"], [role="menu"]')) return;
      const key = e.key.toLowerCase(), modified = e.ctrlKey || e.metaKey;
      const action: RundownEditKey | null = modified
        ? key === 'z' ? e.shiftKey ? 'redo' : 'undo' : key === 'y' && e.ctrlKey && !e.shiftKey ? 'redo' : null
        : key === 'delete' && !e.shiftKey ? 'delete' : null;
      if (action && onKey(action)) e.preventDefault();
    };
    window.addEventListener('keydown', press);
    return () => window.removeEventListener('keydown', press);
  }, [onKey, enabled]);
}

/**
 * Walk a rundown by one step and reveal the row. Shared for the same reason the map is: the two
 * React surfaces disagreed about what Up does from nothing selected, which is the one case an
 * operator meets first.
 */
export function stepSelection<T extends { id: string }>(
  cues: T[],
  selectedId: string | null,
  step: 1 | -1,
): T | null {
  if (!cues.length) return null;
  const at = cues.findIndex((c) => c.id === (selectedId ?? ''));
  // From nothing selected, Down lands on the first cue and Up on the last.
  const next = at < 0 ? (step > 0 ? 0 : cues.length - 1) : Math.min(cues.length - 1, Math.max(0, at + step));
  return cues[next] ?? null;
}

/** Scroll a rundown row into view after the keys moved the selection there. */
export function revealCue(testId: string): void {
  document.querySelector(`[data-testid="${testId}"]`)?.scrollIntoView({ block: 'nearest' });
}

// ── THE TWO SPACE MODES (docs/PLAYOUT_DASHBOARD.md §2f; owner, 2026-09-10). ──
//
// The decision and the words live one layer down, in `control/spaceMode.ts`, because the
// exported controller is generated there and serialises the same faces into its vanilla JS.
// This module is where the two React surfaces reach them, beside the keymap they belong to.

export { spaceAction, type SpaceAction, type SpaceMode };

/** The TAKE button's face for an action: the shared words, plus this stylesheet's class. */
export function takeFace(action: SpaceAction): { text: string; title: string; className: string } {
  const cls =
    action === 'take-off' ? 'pd-verb pd-verb-take pd-verb-live'
    : action === 'preview' ? 'pd-verb pd-verb-take pd-verb-preview'
    : 'pd-verb pd-verb-take';
  return { ...SPACE_FACES[action], className: cls };
}

/**
 * The operator's mode: a device-level preference (`model/prefs.ts`), read when the page opens
 * and written back on change. Deliberately NOT followed live across tabs: a mode arriving from
 * another tab would move the PREVIEW under an operator mid-show without any press of theirs,
 * and the only safe moment to re-seed what is on PREVIEW is the click on this page's own box.
 * Another open tab picks the new habit up when it next loads.
 */
export function useSpaceMode(): [SpaceMode, (mode: SpaceMode) => void] {
  const [mode, setModeState] = useState<SpaceMode>(() => asSpaceMode(loadPrefs().spaceMode));
  const setMode = useCallback((next: SpaceMode) => {
    savePrefs({ spaceMode: next });
    setModeState(next);
  }, []);
  return [mode, setMode];
}
