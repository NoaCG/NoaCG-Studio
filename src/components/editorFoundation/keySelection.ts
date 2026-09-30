import type { AnimData } from '../../blocks/animData';
import { cueStarts, EPS, landingCue, planKeyEase, type KeyEasePreset, type KeyRef } from '../../blocks/animEdit';

// Key selection is editor UI state (R1.2a.2, docs/research/editor-r1-2a-2): it names keys by cue,
// layer, property and stored time, and is never written into the document.

export const keyId = (key: KeyRef) => [key.step, key.selector, key.property, key.time].join('\n');

/** The keys of one layer, per animated property in the order they first appear. */
export function layerKeys(data: AnimData | null, selector: string): { property: string; keys: KeyRef[] }[] {
  const rows = new Map<string, KeyRef[]>();
  data?.steps.forEach((step, index) => Object.entries(step.layers[selector] ?? {}).forEach(([property, keys]) => {
    rows.set(property, [...rows.get(property) ?? [], ...keys.map(key => ({ step: index, selector, property, time: key.time }))]);
  }));
  return [...rows].map(([property, keys]) => ({ property, keys }));
}

/** The selection, less any key an undo or another edit has removed since. */
export function liveKeys(data: AnimData | null, keys: KeyRef[]): KeyRef[] {
  return data ? keys.filter(key => data.steps[key.step]?.layers[key.selector]?.[key.property]?.some(k => Math.abs(k.time - key.time) < EPS)) : [];
}

/** Where keys are after moving by a stored delta (animEdit.ts moveKeys): each track's key at its new
 *  time on the ruler, in the cue holding that time (on a flag, on the side it came from). */
export function movedKeys(data: AnimData | null, keys: KeyRef[], delta: number): KeyRef[] {
  if (!data) return [];
  const last = data.steps.length - 1, starts = cueStarts(data);
  return addKeys([], keys.flatMap(key => {
    const at = starts[key.step] + key.time + delta, cue = landingCue(starts, at, key.step);
    const found = data.steps[cue].layers[key.selector]?.[key.property]?.find(k => Math.abs(k.time - (at - starts[cue])) < EPS);
    if (!found) return [];
    // A key on a flag and the next cue's copy of it are one key on the ruler.
    const copy = cue < last && Math.abs(at - starts[cue + 1]) < EPS ? data.steps[cue + 1].layers[key.selector]?.[key.property]?.[0] : undefined;
    return [{ step: cue, selector: key.selector, property: key.property, time: found.time },
      ...copy && copy.time < EPS && copy.value === found.value ? [{ step: cue + 1, selector: key.selector, property: key.property, time: copy.time }] : []];
  }));
}

/** Toggle a group of keys: all of them leave when all are selected, else all join. */
export function toggleKeys(selection: KeyRef[], keys: KeyRef[]): KeyRef[] {
  const chosen = new Set(selection.map(keyId)), ids = new Set(keys.map(keyId));
  return [...ids].every(id => chosen.has(id)) ? selection.filter(key => !ids.has(keyId(key))) : addKeys(selection, keys);
}
/** The selection with `keys` added, each key once. */
export function addKeys(selection: KeyRef[], keys: KeyRef[]): KeyRef[] {
  const chosen = new Set(selection.map(keyId));
  return [...selection, ...keys.filter(key => !chosen.has(keyId(key)))];
}

// When several presets would change nothing (a key eased on both sides also has each one side),
// the one covering the most names it.
const PREFERENCE: KeyEasePreset[] = ['easyEase', 'linear', 'easeIn', 'easeOut', 'bounce', 'overshoot', 'hold'];
/** The preset every selected key already has, read by applying each one and changing nothing. */
export function currentPreset(data: AnimData | null, keys: KeyRef[]): KeyEasePreset | null {
  if (!data || !keys.length) return null;
  return PREFERENCE.find(preset => { try { return !planKeyEase(data, keys, preset).length; } catch { return false; } }) ?? null;
}
