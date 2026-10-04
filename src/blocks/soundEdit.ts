import type { AssetFile, SpxTemplate } from '../model/types';
import { isAudioAsset } from '../assets/assetUtils';
import { animSounds, isAnimData, parseAnimData, serializeAnimData, type AnimData, type AnimSound, type AnimStep, type AnimTransition } from './animData';
import { importAssets } from './editorImages';
import { writeAnimData } from '../templates/shared/animRuntime';

export type SoundOperation = { kind: 'sound.set'; target: string; sound?: AnimSound; asset?: AssetFile };
export interface SoundTarget { key: string; label: string; sound?: AnimSound; loop: boolean; reason?: string }
type Binding = SoundTarget & { owner: AnimStep | AnimTransition };

function ordered(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(ordered).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + ordered(v)).join(',') + '}';
  return JSON.stringify(value);
}
function editableData(js: string): AnimData | null {
  const data = parseAnimData(js);
  // Normalize the existing lifecycle migration, then refuse anything the writer would drop.
  return data && ordered(data) === ordered(JSON.parse(serializeAnimData(data))) ? data : null;
}
function bindings(data: AnimData): Binding[] {
  const result: Binding[] = data.steps.map((step, index) => ({
    key: JSON.stringify(['step', index]), label: step.name, sound: step.sound,
    loop: index !== data.steps.length - 1, owner: step,
  }));
  for (const [index, group] of (data.machine?.groups ?? []).entries()) {
    for (const state of group.states) {
      if (state.id === group.initial || (index === 0 && group.defaultPath?.includes(state.id))) continue;
      // A pose-only state can own a sound without changing its visual motion.
      const timeline = state.timeline ?? { name: state.name ?? state.id, duration: 0, ease: 'none', layers: {} };
      result.push({ key: JSON.stringify(['state', group.id, state.id]), label: `${group.id} / ${state.name ?? state.id}`,
        sound: timeline.sound, loop: true, owner: timeline });
    }
    for (const edge of group.transitions) {
      const position = index === 0 ? group.defaultPath?.indexOf(edge.to) ?? -1 : -1;
      const destination = position >= 0 ? data.steps[position] : group.states.find(s => s.id === edge.to)?.timeline;
      const verb = edge.event ?? (edge.trigger === 'timer' ? `after ${edge.after}s` : edge.trigger);
      result.push({ key: JSON.stringify(['edge', group.id, edge.trigger, edge.event ?? edge.after, edge.from, edge.to]),
        label: `${group.id} / ${verb}: ${edge.from} → ${edge.to}`, sound: edge.sound, loop: false, owner: edge,
        reason: destination?.sound?.mode === 'loop' ? 'This move enters a state with its own loop. Edit that state’s sound.' : undefined });
    }
  }
  return result;
}

export function soundTargets(template: SpxTemplate): SoundTarget[] {
  const data = editableData(template.js);
  return data ? bindings(data).map(t => ({ key: t.key, label: t.label, sound: t.sound, loop: t.loop, reason: t.reason })) : [];
}

/** One bounded edit, including an optional imported asset, is one undo transaction. */
export function applySound(template: SpxTemplate, operation: SoundOperation): SpxTemplate {
  const data = editableData(template.js);
  if (!data) throw new Error('Sounds need editable animation data. This graphic’s source is preserved.');
  const binding = bindings(data).find(target => target.key === operation.target);
  if (!binding) throw new Error('This move changed. Choose it again.');
  let next = template;
  const sound = operation.sound ? { ...operation.sound } : undefined;
  if (sound) {
    if (binding.reason) throw new Error(binding.reason);
    if (sound.mode === 'loop' && !binding.loop) throw new Error('Out and transition sounds play once. Attach a loop to a state or step.');
    if (operation.asset) {
      const imported = importAssets(template, [operation.asset]); next = imported.template;
      sound.asset = imported.paths[0];
    }
    if (!isAudioAsset(sound.asset) || !next.assets.some(asset => asset.path === sound!.asset)) throw new Error('Choose a sound asset in this graphic.');
    if (animSounds(data).some(s => s.id === sound!.id && s !== binding.sound)) throw new Error('This sound id is already used by another move.');
  }
  if (sound) binding.owner.sound = sound; else delete binding.owner.sound;
  const key = JSON.parse(binding.key) as string[];
  if (key[0] === 'state') {
    const state = data.machine!.groups.find(g => g.id === key[1])!.states.find(s => s.id === key[2])!;
    if (sound) state.timeline = binding.owner as AnimStep;
    // Clearing a sound never deletes authored visual motion.
    else if (state.timeline) delete state.timeline.sound;
  }
  if (!isAnimData(data)) throw new Error('Use a valid sound, a level from -60 to +6 dB, and a packaged audio file.');
  for (const group of data.machine?.groups ?? []) for (const edge of group.transitions) {
    const index = group === data.machine?.groups[0] ? group.defaultPath?.indexOf(edge.to) ?? -1 : -1;
    const step = index >= 0 ? data.steps[index] : group.states.find(s => s.id === edge.to)?.timeline;
    if (edge.sound && step?.sound?.mode === 'loop') throw new Error('Remove the incoming transition sound before attaching a state loop.');
  }
  const js = writeAnimData(next.js, data);
  if (!js) throw new Error('This graphic has custom animation code. Its source is preserved.');
  return { ...next, js };
}
