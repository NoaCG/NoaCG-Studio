import type { SpxTemplate } from '../model/types';
import { writeOutData } from '../templates/shared/animRuntime';
import type { AnimLoop, AnimStep } from './animData';
import { hasMovingKeys, validAuthoredLoop, type RangedLoop } from './animLoopTiming';
import { animationSource, animationTarget, trackOwner } from './editorAnimation';

const LOOP_CHANNELS = new Set(['x', 'y', 'xPercent', 'yPercent', 'scale', 'scaleX', 'scaleY', 'rotation', 'opacity', 'autoAlpha']);
const round = (value: number) => Math.round(value * 1000) / 1000;

export interface LoopOperation {
  kind: 'loop.set';
  selector: string;
  step: number;
  /** Omit the property to edit all moving tracks of the layer together. */
  property?: string;
  loop: RangedLoop | null;
}

function supportedTrack(property: string, keys: AnimStep['layers'][string][string]) {
  return LOOP_CHANNELS.has(property) && hasMovingKeys(keys) && keys.every(key => typeof key.value === 'number');
}

export function loopTracks(step: AnimStep, owner: string) {
  return Object.entries(step.layers[owner] ?? {}).filter(([property, keys]) => supportedTrack(property, keys)).map(([property]) => property);
}

export function loopSelection(step: AnimStep, owner: string, property?: string) {
  const tracks = step.layers[owner] ?? {};
  const properties = property ? [property] : Object.keys(tracks).filter(name => hasMovingKeys(tracks[name]));
  if (!properties.length || properties.some(name => !tracks[name] || !supportedTrack(name, tracks[name]))) return null;
  if (properties.some(name => name === 'scale' ? tracks.scaleX?.length || tracks.scaleY?.length
      : name === 'scaleX' || name === 'scaleY' ? tracks.scale?.length
      : name === 'opacity' ? tracks.autoAlpha?.length : name === 'autoAlpha' && tracks.opacity?.length)) return null;
  const keys = properties.flatMap(name => tracks[name]);
  const range: [number, number] = [Math.min(...keys.map(key => key.time)), Math.max(...keys.map(key => key.time))];
  if (range[1] <= range[0] || range[1] > step.duration) return null;
  const current = properties.map(name => step.loops?.[owner]?.[name]);
  const common = current[0] && current.every(loop => JSON.stringify(loop) === JSON.stringify(current[0])) ? current[0] : undefined;
  return { properties, range, common, hasLoop: current.some(Boolean) };
}

export function applyEditorLoop(template: SpxTemplate, operation: LoopOperation): SpxTemplate {
  const data = animationSource(template);
  const { selector, step: index, property } = operation;
  const step = data.steps[index];
  if (!step || !Number.isInteger(index) || (data.steps.length > 1 && index === data.steps.length - 1)) {
    throw new Error('Choose a cue before Out for this loop.');
  }
  const owner = trackOwner(template, data, selector);
  const selection = loopSelection(step, owner, property);
  if (!selection) throw new Error('Choose supported moving tracks without competing transform or opacity channels.');
  // A loop edit changes playback of existing keys. Check their ownership as before
  // looping, while retaining every machine/call/measured-motion guard.
  const forOwnership = { ...data, steps: data.steps.map(cue => ({ ...cue, loops: undefined })) };
  animationTarget(template, forOwnership, selector, selection.properties);
  const loop = operation.loop;
  let next: AnimLoop | null = null;
  if (loop) {
    const inputDelay = loop.repeatDelay ?? 0, delay = round(inputDelay);
    if (!Number.isSafeInteger(loop.repeat) || loop.repeat < -1 ||
        !Number.isFinite(inputDelay) || inputDelay < 0 || !Number.isFinite(delay)) {
      throw new Error('Enter a whole repeat count and a finite nonnegative delay.');
    }
    if (!Array.isArray(loop.range) || loop.range.length !== 2 || !loop.range.every(Number.isFinite) ||
        !Number.isFinite(loop.phase ?? 0) || (loop.phase ?? 0) < 0 ||
        (loop.yoyo !== undefined && typeof loop.yoyo !== 'boolean')) {
      throw new Error('Enter a valid loop range, phase and direction.');
    }
    const [start, end] = loop.range.map(round);
    const range: RangedLoop = { repeat: loop.repeat, range: [start, end] };
    if (loop.yoyo) range.yoyo = true;
    if (delay) range.repeatDelay = delay;
    if (loop.phase) range.phase = round(loop.phase);
    if (!selection.properties.every(name => validAuthoredLoop(range, step.duration, step.layers[owner][name]))) {
      throw new Error('Keep the keys inside the loop range and the phase inside its playback.');
    }
    next = range;
  }
  if (!next && !selection.hasLoop) return template;
  const loops = step.loops ??= {};
  const settings = loops[owner] ??= {};
  for (const name of selection.properties) {
    if (next) settings[name] = next;
    else delete settings[name];
  }
  if (!Object.keys(settings).length) delete loops[owner];
  if (!Object.keys(loops).length) delete step.loops;
  const js = writeOutData(template.js, data);
  if (js === null) throw new Error('This loop needs the supported animation runtime. The source is preserved.');
  return js === template.js ? template : { ...template, js };
}
