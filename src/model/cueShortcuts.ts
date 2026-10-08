import type { ShowCue } from './shows';

/**
 * A CUE SHORTCUT, stored in `ShowCue.hotkey` in one of two forms (docs/work-specs/
 * playout-workflow-simplification D13):
 *
 * - LOGICAL, the original: a letter or digit, case independent, optionally with Shift (`v`, `1`,
 *   `shift+f`). Still read and still fired, so no saved rundown changes meaning.
 * - PHYSICAL: the key's `KeyboardEvent.code` with its Ctrl, Alt and Shift state, and the character
 *   the layout printed when it was assigned (`ctrl+shift+@KeyK:K`, `@BracketLeft:Å`,
 *   `shift+@Digit1:1`, `@F2:F2`). It fires by position, so Å, Ä and Ö work on the layout that
 *   has them, and the label is what the operator saw when they pressed it.
 *
 * An older build reads the physical form as no shortcut at all, never as a different key.
 */
const LOGICAL = /^(?:[a-z0-9]|shift\+[a-z])$/;
const PHYSICAL = /^((?:ctrl\+)?(?:alt\+)?(?:shift\+)?)@([A-Z][A-Za-z0-9]{0,24}):([^\s:@]{1,16})$/u;

export function normalizeCueShortcut(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (PHYSICAL.test(value)) return value;
  const key = value.toLowerCase();
  return LOGICAL.test(key) ? key : null;
}

/** What two shortcuts share when they are the same press: modifiers and position, never the label. */
export function cueShortcutIdentity(stored: string): string {
  const m = PHYSICAL.exec(stored);
  return m ? `${m[1]}@${m[2]}` : stored;
}

/** The key a saved-by-character shortcut names: a plain letter or digit (a letter with Shift)
 *  assigned by position is the same key an old `v` or `shift+f` names on that layout, so the two
 *  are one shortcut for "Used by" and for conflicts. Anything else is its identity. */
function cueShortcutAlias(stored: string): string {
  const m = PHYSICAL.exec(stored);
  if (!m || m[1].includes('ctrl') || m[1].includes('alt')) return cueShortcutIdentity(stored);
  const legacy = `${m[1]}${m[3].toLowerCase()}`;
  return LOGICAL.test(legacy) ? legacy : cueShortcutIdentity(stored);
}

/** The same press, whichever form either was saved in. */
export function sameCueShortcut(a: string, b: string): boolean {
  return cueShortcutIdentity(a) === cueShortcutIdentity(b) || cueShortcutAlias(a) === cueShortcutAlias(b);
}

export function cueShortcutLabel(key: string): string {
  const m = PHYSICAL.exec(key);
  if (!m) return key.replace('shift+', 'Shift+').toUpperCase();
  return cueShortcutParts(key).join('+');
}

/** The keycaps of a shortcut, in order: `['Ctrl', 'Shift', 'Å']`. */
export function cueShortcutParts(key: string): string[] {
  const m = PHYSICAL.exec(key);
  if (!m) return key.split('+').map((part) => (part === 'shift' ? 'Shift' : part.toUpperCase()));
  const mods = m[1].split('+').filter(Boolean).map((mod) => mod[0].toUpperCase() + mod.slice(1));
  return [...mods, m[3]];
}

/** A key press as the shortcut code reads it. */
export interface ShortcutPress {
  code: string;
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

/** The ids a press can be bound under: its physical form first, then the logical one when it has one. */
export function pressIdentities(p: ShortcutPress): string[] {
  const physical = `${p.ctrl ? 'ctrl+' : ''}${p.alt ? 'alt+' : ''}${p.shift ? 'shift+' : ''}@${p.code}`;
  const logical = !p.ctrl && !p.alt && p.key.length === 1 ? `${p.shift ? 'shift+' : ''}${p.key.toLowerCase()}` : null;
  return logical && LOGICAL.test(logical) ? [physical, logical] : [physical];
}

const MODIFIER_CODES = /^(?:Shift|Control|Alt|Meta|OS|AltGraph|CapsLock|NumLock|ScrollLock|Fn)/;
const BROWSER_F_KEYS = new Set(['F5', 'F11', 'F12']);
const BROWSER_CTRL = new Set(['KeyN', 'KeyT', 'KeyW', 'Tab']);

/** The label a layout prints on a physical key: a digit by position (Shift+1 prints "!"), a letter
 *  as this layout prints it (AZERTY's A on KeyQ, Å on BracketLeft) or by position where a modifier
 *  changed the character, else the key's own name. */
function labelOf(p: ShortcutPress): string {
  const digit = /^Digit(\d)$/.exec(p.code);
  if (digit) return digit[1];
  const numpad = /^Numpad(\d)$/.exec(p.code);
  if (numpad) return `Num${numpad[1]}`;
  if (/^F\d{1,2}$/.test(p.code)) return p.code;
  if (/^\p{L}$/u.test(p.key)) return p.key.toUpperCase();
  const letter = /^Key([A-Z])$/.exec(p.code);
  if (letter) return letter[1];
  if (p.key.length === 1) return p.key.toUpperCase();
  return p.key.slice(0, 16);
}

/**
 * What a press in the shortcut dialog assigns, or why it cannot, in one line; null for a press
 * that is not an answer (a modifier on its own, Tab, Enter, Escape, Cmd). `verbKeys` are the
 * operator's own keys (`playoutKeys` KEY_MAP), which no cue may take, with or without Shift.
 */
export function shortcutFromPress(
  p: ShortcutPress & { meta?: boolean },
  verbKeys: ReadonlySet<string>,
): { value: string } | { refused: string } | null {
  if (p.meta || MODIFIER_CODES.test(p.code) || !p.code) return null;
  if (!p.ctrl && !p.alt && (p.code === 'Tab' || p.code === 'Enter' || p.code === 'NumpadEnter' || p.code === 'Escape')) return null;
  if (p.ctrl && p.alt) return { refused: 'Ctrl+Alt is AltGr on many keyboards.' };
  if (BROWSER_F_KEYS.has(p.code)) return { refused: 'F5, F11 and F12 belong to the browser.' };
  if (p.ctrl && BROWSER_CTRL.has(p.code)) return { refused: 'The browser keeps Ctrl+N, T, W and Tab.' };
  if (p.ctrl && (['KeyC', 'KeyX', 'KeyV', 'KeyZ', 'KeyY'].includes(p.code))) return { refused: 'The rundown uses Ctrl+C, X, V, Z and Y.' };
  // The rundown's own Delete (playoutKeys `useRundownEditKeys`), which a cue would take first.
  if (!p.ctrl && !p.alt && !p.shift && p.code === 'Delete') return { refused: 'The rundown uses Delete.' };
  if (!p.ctrl && !p.alt && (verbKeys.has(p.key.toLowerCase()) || VERB_CODES.has(p.code))) {
    return { refused: `${labelOf(p) === ' ' || p.code === 'Space' ? 'Space' : labelOf(p)} is an operator key.` };
  }
  const label = labelOf(p);
  if (/[\s:@]/.test(label)) return { refused: 'That key cannot be a shortcut.' };
  return { value: `${p.ctrl ? 'ctrl+' : ''}${p.alt ? 'alt+' : ''}${p.shift ? 'shift+' : ''}@${p.code}:${label}` };
}

/** The operator keys by position as well as by character, so another layout cannot reach them. */
const VERB_CODES = new Set(['Space', 'KeyR', 'KeyU', 'KeyN', 'Digit0', 'Numpad0', 'KeyP', 'KeyH', 'ArrowUp', 'ArrowDown']);

/** A concurrent edit may create duplicates, and an old letter shortcut may name the key a new
 *  physical one names (`sameCueShortcut`). Neither cue gets that key until resolved. Bindings are
 *  keyed by identity (`cueShortcutIdentity`); conflicts are named by their label. */
export function cueShortcutBindings(cues: readonly Pick<ShowCue, 'id' | 'hotkey'>[]): { bindings: Record<string, string>; conflicts: string[] } {
  const keys = new Map<string, { ids: string[]; label: string; alias: string }>();
  for (const cue of cues) {
    const key = normalizeCueShortcut(cue.hotkey);
    if (!key) continue;
    const id = cueShortcutIdentity(key);
    const seen = keys.get(id);
    keys.set(id, { ids: [...(seen?.ids ?? []), cue.id], label: seen?.label ?? cueShortcutLabel(key), alias: cueShortcutAlias(key) });
  }
  const byAlias = new Map<string, number>();
  for (const k of keys.values()) byAlias.set(k.alias, (byAlias.get(k.alias) ?? 0) + 1);
  const clash = (k: { ids: string[]; alias: string }) => k.ids.length > 1 || (byAlias.get(k.alias) ?? 0) > 1;
  return {
    bindings: Object.fromEntries([...keys].filter(([, k]) => !clash(k)).map(([key, k]) => [key, k.ids[0]])),
    conflicts: [...new Set([...keys.values()].filter(clash).map((k) => k.label))],
  };
}

/** Secondary takes never launch a rundown sequence. Their own trim/level/fades/loop still apply. */
export function directCue(cue: ShowCue): ShowCue {
  return { ...cue, folderId: undefined, auto: cue.auto?.then === 'out' ? cue.auto : cue.auto?.then === 'out-next' ? { ...cue.auto, then: 'out' } : undefined,
    ...(cue.playback?.end === 'next' ? { playback: { ...cue.playback, end: 'hold' as const } } : {}) };
}
