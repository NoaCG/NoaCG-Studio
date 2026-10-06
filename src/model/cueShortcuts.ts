import type { ShowCue } from './shows';

/** Logical keys, case independent. Ctrl/Alt/Cmd and browser shortcuts are intentionally absent. */
export function normalizeCueShortcut(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const key = value.toLowerCase();
  return /^(?:[a-z0-9]|shift\+[a-z])$/.test(key) ? key : null;
}
export function cueShortcutLabel(key: string): string { return key.replace('shift+', 'Shift+').toUpperCase(); }

/** A concurrent edit may create duplicates. Neither cue gets that key until resolved. */
export function cueShortcutBindings(cues: readonly Pick<ShowCue, 'id' | 'hotkey'>[]): { bindings: Record<string, string>; conflicts: string[] } {
  const keys = new Map<string, string[]>();
  for (const cue of cues) {
    const key = normalizeCueShortcut(cue.hotkey);
    if (key) keys.set(key, [...(keys.get(key) ?? []), cue.id]);
  }
  return {
    bindings: Object.fromEntries([...keys].filter(([, ids]) => ids.length === 1).map(([key, ids]) => [key, ids[0]])),
    conflicts: [...keys].filter(([, ids]) => ids.length > 1).map(([key]) => key),
  };
}

/** Secondary takes never launch a rundown sequence. Their own trim/level/fades/loop still apply. */
export function directCue(cue: ShowCue): ShowCue {
  return { ...cue, folderId: undefined, auto: cue.auto?.then === 'out' ? cue.auto : cue.auto?.then === 'out-next' ? { ...cue.auto, then: 'out' } : undefined,
    ...(cue.playback?.end === 'next' ? { playback: { ...cue.playback, end: 'hold' as const } } : {}) };
}
