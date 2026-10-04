import type { GraphicSoundBinding, ProductionSounds, SpxTemplate, SoundAssetRef } from '../model/types';
import { parseAnimData } from './animData';
import { parseBehaviourData } from './behaviourData';
import { soundTargets, type SoundTarget } from './soundEdit';
import { soundTopology, productionSoundSourceError } from '../assets/productionSounds';
import { isSoundAssetRef } from '../assets/soundAssets';

export function quizSoundMetadata(template: SpxTemplate): ProductionSounds['visuals'][string]['quiz'] {
  const data = parseAnimData(template.js), behaviour = parseBehaviourData(template.js);
  const fields = behaviour?.fields;
  // Only the declared quiz recipe, or the shipped quiz categories, speak these semantics.
  const declared = behaviour?.recipe === 'quiz' && typeof fields?.selectedAnswer === 'string' && typeof fields?.correctAnswer === 'string';
  if (!declared && !['quiz','quiz-board','quiz-show'].includes(template.type)) return;
  const selected = declared ? fields!.selectedAnswer as string : template.fields.find(f => f.title === 'Selected answer')?.field;
  const correct = declared ? fields!.correctAnswer as string : template.fields.find(f => f.title === 'Correct answer')?.field;
  const main = data?.machine?.groups[0];
  const revealState = main?.defaultPath?.[1];
  if (selected && correct && revealState && main?.states.some(s => s.id === 'selected')) return { selected, correct, selectionState: 'selected', revealState };
}

export function productionSoundTargets(template: SpxTemplate): SoundTarget[] {
  const data = parseAnimData(template.js);
  const targets: SoundTarget[] = [{ key: 'in', label: 'In', loop: true }, { key: 'out', label: 'Out', loop: false }];
  const legacy = soundTargets(template);
  if (data) {
    targets[0].sound = data.steps[0].sound;
    targets[1].sound = data.steps[data.steps.length - 1].sound;
    targets.push(...legacy.filter(t => ![JSON.stringify(['step',0]),JSON.stringify(['step',data.steps.length - 1])].includes(t.key)).map(t => ({ ...t, reason: undefined })));
  }
  if (quizSoundMetadata(template)) targets.push(...['Selection','Correct','Wrong'].map(label => ({ key: label.toLowerCase(), label, loop: false })));
  if (template.js.includes('function startClock()') && template.js.includes('function tickClock()')) targets.push(
    { key: 'countdown-running', label: 'Countdown running', loop: true },
    { key: 'countdown-paused', label: 'Countdown paused', loop: true },
    { key: 'countdown-expired', label: 'Countdown finished', loop: false });
  return targets;
}

/** References stay on the visual. Save a complete binding atomically, never a half-upload. */
export function setProductionSound(template: SpxTemplate, config: ProductionSounds, visual: string, trigger: string, sound?: GraphicSoundBinding, asset?: SoundAssetRef): ProductionSounds {
  const sourceError = productionSoundSourceError(template); if (sound && sourceError) throw new Error(sourceError);
  const target = productionSoundTargets(template).find(t => t.key === trigger);
  if (!target && sound) throw new Error('This trigger changed. Choose it again.');
  if (sound && (!Number.isInteger(sound.levelDb) || sound.levelDb < -60 || sound.levelDb > 6 || !['one-shot','loop'].includes(sound.mode) || (sound.mode === 'loop' && !target?.loop))) throw new Error('Use a valid playback mode and a level from -60 to +6 dB.');
  const next: ProductionSounds = JSON.parse(JSON.stringify(config));
  if (asset) {
    if (!isSoundAssetRef(asset)) throw new Error('Invalid sound asset.');
    if (!next.assets.some(a => a.hash === asset.hash)) next.assets.push(asset);
  }
  if (sound && asset) sound = { ...sound, asset: soundPath(next.assets.find(a=>a.hash === asset.hash)!) };
  if (sound && !next.assets.some(a => sound.asset === soundPath(a))) throw new Error('Choose a prepared sound asset.');
  const previous = next.visuals[visual];
  const previouslyBound = !!previous && Object.keys(previous.bindings).length > 0;
  if (previouslyBound && previous.topology !== soundTopology(template) && sound) throw new Error('Sound triggers changed. Remove the affected bindings and attach them again.');
  const bindings = { ...previous?.bindings };
  if (sound) bindings[trigger] = { ...sound }; else delete bindings[trigger];
  // An empty production override suppresses inherited library sounds too.
  next.visuals[visual] = { topology: previouslyBound && Object.keys(bindings).length ? previous.topology : soundTopology(template), bindings, ...(quizSoundMetadata(template) ? { quiz: quizSoundMetadata(template) } : {}) };
  return next;
}

export function soundPath(asset: SoundAssetRef): string { return `assets/sound-${asset.hash}.${asset.name.split('.').pop()!.toLowerCase()}`; }
