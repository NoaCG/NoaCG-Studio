import type { SpxTemplate } from '../model/types';
import { losslessAnimData, type AnimData } from './animData';
import { deleteKeyframe, easeKeys, EPS, setKeyframe, moveKeys, moveLayerSpan, trimLayerSpan, type KeyEasePreset, type KeyRef } from './animEdit';
import { resolveValue } from './animEval';
import { artworkNode, editArtworkStyle } from './artworkEdits';
import { baseValues, editBase, type BasePatch } from './baseEdits';
import { writeAnimData, writeOutData } from '../templates/shared/animRuntime';

/** A transform or opacity control of the inspector and canvas. */
export type NumericProperty = 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation' | 'opacity';
/** A runtime track a control reads and writes (R1.2a.6, docs/research/editor-r1-2a-6). */
export type Channel = NumericProperty | 'xPercent' | 'yPercent' | 'scale' | 'autoAlpha';
/** One preset over a key selection, as one transaction (R1.2a.2, docs/research/editor-r1-2a-2). */
export type KeyEaseOperation = { kind: 'key.ease'; keys: KeyRef[]; preset: KeyEasePreset };
/** Keys moved by one stored delta on the ruler, across flags too (R1.2a.5, docs/research/editor-r1-2a-5). */
export type KeyMoveOperation = { kind: 'key.move'; keys: KeyRef[]; delta: number };
export interface NumericPose { x: number; y: number; scaleX: number; scaleY: number; rotation: number; opacity: number; xPercent?: number; yPercent?: number }
/** `animation.key`: `set` writes `value` to the channel `property` (the one `writeChannel` names for
 *  its control); `remove` and `disable` name a control and act on all its channels, keeping the
 *  displayed pose (`value` for opacity, `baseValues` for the rest) as the base where its motion ends. */
export type AnimationOperation =
  | { kind: 'animation.key'; selector: string; step: number; property: Channel; time: number; value: number; action: 'set' | 'remove' | 'disable'; baseValues?: BasePatch }
  | { kind: 'layer.move'; selector: string; step: number; delta: number }
  | { kind: 'layer.trim'; selector: string; step: number; interval: number; edge: 'start' | 'end'; time: number };

/** The runtime channels each control reads (D03): pixels and a percent of the layer's own box for
 *  Position, the per-axis and the shared scale for Scale, opacity or autoAlpha for Opacity. */
export const CONTROL_CHANNELS: Readonly<Record<NumericProperty, readonly Channel[]>> = {
  x: ['x', 'xPercent'], y: ['y', 'yPercent'], scaleX: ['scaleX', 'scale'], scaleY: ['scaleY', 'scale'], rotation: ['rotation'], opacity: ['opacity', 'autoAlpha'],
};
const CONTROLS = Object.keys(CONTROL_CHANNELS) as NumericProperty[];
/** The controls a channel belongs to: `scale` is both Scale axes. */
export const controlsOf = (channel: string) => CONTROLS.filter(control => CONTROL_CHANNELS[control].includes(channel as Channel));
/** The pose field a control's channel shows in: the runtime reports `scale` as each Scale axis and
 *  `autoAlpha` as opacity. */
export const poseKey = (channel: Channel, control: NumericProperty): keyof NumericPose => channel === 'scale' || channel === 'autoAlpha' ? control : channel as keyof NumericPose;
const NAMES: Record<NumericProperty, string> = { x: 'Position X', y: 'Position Y', scaleX: 'Scale X', scaleY: 'Scale Y', rotation: 'Rotation', opacity: 'Opacity' };
const animates = (data: AnimData | null, owner: string, channel: string) => !!data?.steps.some(step => step.layers[owner]?.[channel]?.length);

export function animationSource(template: SpxTemplate): AnimData {
  const data = losslessAnimData(template.js);
  if (!data) throw new Error('This animation contains data the writer cannot preserve exactly.');
  return data;
}
/** The channels of a control a layer animates (under its owner), the pixel or per-axis one first. */
export function armedChannels(data: AnimData | null, owner: string, property: NumericProperty): Channel[] {
  return CONTROL_CHANNELS[property].filter(channel => animates(data, owner, channel));
}
export function isArmed(data: AnimData | null, owner: string, property: NumericProperty) {
  return armedChannels(data, owner, property).length > 0;
}
/** Whether any channel of a control has a key at a time on a cue's clock. */
export function keyedAt(data: AnimData | null, owner: string, property: NumericProperty, step: number, time: number) {
  return CONTROL_CHANNELS[property].some(channel => data?.steps[step]?.layers[owner]?.[channel]?.some(k => Math.abs(k.time - time) < EPS));
}
/** A pose value at a cue time as the runtime reports it: a `scale` track reports as both Scale axes
 *  and `autoAlpha` as opacity. */
export function channelValue(data: AnimData, owner: string, property: keyof NumericPose, step: number, time: number) {
  const value = resolveValue(data, owner, property, step, time);
  const shared = property === 'scaleX' || property === 'scaleY' ? 'scale' : property === 'opacity' ? 'autoAlpha' : null;
  return value === null && shared ? resolveValue(data, owner, shared, step, time) : value;
}
/**
 * The channel a key on this control writes: the pixel or per-axis channel when the layer animates
 * it, else the percent, shared-scale or autoAlpha channel it animates, else the control's own. Throws
 * where no channel can take the key exactly: a raw transform string (a matrix is not keyed one
 * property at a time), and two tracks owning one control.
 */
export function writeChannel(data: AnimData | null, owner: string, property: NumericProperty): Channel {
  if (property !== 'opacity' && animates(data, owner, 'transform')) {
    throw new Error(`${owner} animates a raw transform string, which cannot be keyed one property at a time. Its source is preserved.`);
  }
  const armed = armedChannels(data, owner, property);
  const axis = (property === 'scaleX' || property === 'scaleY') && animates(data, owner, 'scale') ? (['scaleX', 'scaleY'] as const).find(c => animates(data, owner, c)) : undefined;
  const clash = axis ? ['scale', axis] : property === 'opacity' && armed.length > 1 ? armed : null;
  if (clash) throw new Error(`${owner} animates ${NAMES[property]} with both ${clash[0]} and ${clash[1]} tracks, so a key could not say which one it changes. Its source is preserved.`);
  return armed[0] ?? property;
}
export function sequenceAuthoringReason(data: AnimData | null): string | null {
  if (!data) return 'This source has no supported animation data.';
  return data.machine || data.steps.some(step => step.calls?.length || step.dynamics?.length || Object.keys(step.loops ?? {}).length)
    ? 'This sequence has calls, measured motion, loops or state-machine ownership. Canvas edits base placement; its animation is preserved.' : null;
}
const documents = new Map<string, Document>();
/** The template's document, parsed once per html. */
function parsed(html: string) {
  let doc = documents.get(html);
  if (!doc) { doc = new DOMParser().parseFromString(html, 'text/html'); documents.clear(); documents.set(html, doc); }
  return doc;
}
/** Whether a layer sits inside another in the template's document, parsed once per html. */
export function documentContains(html: string) {
  return (ancestor: string, selector: string) => {
    try { return Array.from(parsed(html).querySelectorAll(selector)).some(element => !!element.parentElement?.closest(ancestor)); } catch { return false; }
  };
}
/** Every selector the data names an element by: tracks, bars, loops, reveals and hides. */
function dataSelectors(data: AnimData) {
  return [...new Set(data.steps.flatMap(step => [...Object.keys(step.layers), ...Object.keys(step.spans ?? {}), ...Object.keys(step.loops ?? {}), ...step.reveals ?? [], ...step.hides ?? []]))];
}
/**
 * The data selector a layer's motion lives under (R1.2a.6): its own, or the one other selector the
 * data names the same element by (a catalog class such as `.audience-question` for `#f1`). `names`
 * says what a data selector selects: `this` (the layer alone), `several` (the layer and others) or
 * `none`. A selector that also selects other layers, or two selectors naming this one, refuse: an
 * edit to one would move the others, or could not tell which owns what it changes.
 */
export function layerOwner(data: AnimData, selector: string, names: (key: string) => 'this' | 'several' | 'none'): string {
  const owners: string[] = [];
  for (const key of dataSelectors(data)) {
    const named = key === selector ? 'this' : names(key);
    if (named === 'several') throw new Error(`${key} animates ${selector} together with other layers, so an edit here would move several layers at once. Edit its source to preserve them.`);
    if (named === 'this') owners.push(key);
  }
  owners.sort((a, b) => Number(b === selector) - Number(a === selector));
  if (owners.length > 1) throw new Error(`${selector} is animated under two selectors, ${owners[0]} and ${owners[1]}, so an edit could not tell which one owns it. Edit its source to preserve both.`);
  return owners[0] ?? selector;
}
/** What each data selector selects in the template's document, each queried once: for a layer, the
 *  `names` function `layerOwner` takes. */
function selections(html: string, data: AnimData) {
  const doc = parsed(html), found = new Map<string, Element[]>(dataSelectors(data).map(key => {
    try { return [key, Array.from(doc.querySelectorAll(key))]; } catch { return [key, []]; }
  }));
  return (selector: string) => {
    const node = doc.querySelector(selector);
    return (key: string) => {
      const list = found.get(key) ?? [];
      return !node || !list.includes(node) ? 'none' : list.length === 1 ? 'this' : 'several';
    };
  };
}
/** `layerOwner` over the template's document. */
export function trackOwner(template: SpxTemplate, data: AnimData, selector: string): string {
  return layerOwner(data, selector, selections(template.html, data)(selector));
}
/** Every layer's owner; a layer no edit can own keeps its own selector, and its edits refuse. */
export function trackOwners(template: SpxTemplate, data: AnimData, selectors: string[]): Record<string, string> {
  const names = selections(template.html, data);
  return Object.fromEntries(selectors.map(selector => {
    try { return [selector, layerOwner(data, selector, names(selector))]; } catch { return [selector, selector]; }
  }));
}
/** Refuse what playback owns and return the layer's owner. */
export function animationTarget(template: SpxTemplate, data: AnimData, selector: string) {
  const node = artworkNode(template, selector);
  if (node.matches(data.root)) throw new Error('The graphic root is owned by playback. Animate an artwork layer.');
  const reason = sequenceAuthoringReason(data);
  if (reason) throw new Error(reason);
  return trackOwner(template, data, selector);
}
/** Throws unless a layer's Scale handles can key it: both axes have a channel to write. */
export function requireScaleWritable(template: SpxTemplate, selector: string) {
  const data = animationSource(template), owner = animationTarget(template, data, selector);
  writeChannel(data, owner, 'scaleX'); writeChannel(data, owner, 'scaleY');
}
/** Where removing a Position axis's motion keeps its displayed pose as a pixel base, its percent
 *  channel must be 0 there: any other share of the layer's box is a different distance for other text. */
function requireZeroPercent(data: AnimData, owner: string, property: NumericProperty, step: number, time: number) {
  const channel = property === 'x' ? 'xPercent' : property === 'y' ? 'yPercent' : null;
  if (!channel || !animates(data, owner, channel)) return;
  const value = resolveValue(data, owner, channel, step, time) ?? 0;
  if (typeof value !== 'number' || Math.abs(value) >= EPS) {
    throw new Error(`${NAMES[property]} here includes a ${channel} offset of ${typeof value === 'number' ? Math.round(value * 10) / 10 + '%' : `"${value}"`} of ${owner}'s ${property === 'x' ? 'width' : 'height'}, which is a different distance for other text, so no fixed base keeps it. Turn it off where the offset is 0%. Its source is preserved.`);
  }
}
/**
 * The data half of an animation operation on a layer whose motion lives under `owner` (R1.2a.6):
 * bars move and trim on every channel but autoAlpha's; `set` writes the channel its control writes;
 * `remove` and `disable` act on every channel of their control. Returns the new data and the controls
 * whose motion it ended, which keep their displayed pose as the base. `minimum` is a frame in stored
 * seconds. Pure: a refusal throws before anything is written.
 */
export function animateLayer(source: AnimData, owner: string, operation: AnimationOperation, minimum: number, contains?: (ancestor: string, selector: string) => boolean): { data: AnimData; ended: NumericProperty[] } {
  let data = source;
  const { selector, step } = operation;
  if (step === 1 && data.steps.length === 1) data = { ...data, steps: [...data.steps, { name: 'Out', duration: 0, ease: 'none', layers: {} }] };
  if (!Number.isInteger(step) || !data.steps[step]) throw new Error('The target cue no longer exists.');
  if (operation.kind === 'layer.trim' || operation.kind === 'layer.move') {
    // autoAlpha sets visibility on the same timeline as the bars, so a bar would not decide it.
    if (animates(data, owner, 'autoAlpha')) throw new Error(`${selector} animates autoAlpha, which also sets its visibility, so a moved or trimmed bar would not decide where it shows. Move its keys instead. No keys or spans changed.`);
    data = operation.kind === 'layer.trim' ? trimLayerSpan(data, step, owner, operation.interval, operation.edge, operation.time, minimum)
      : moveLayerSpan(data, step, owner, operation.delta, contains);
    return { data, ended: [] };
  }
  const { property, time, value, action } = operation;
  const controls = controlsOf(property);
  // A key past the end of Out lengthens it.
  if (step > 0 && step === data.steps.length - 1 && action === 'set' && Number.isFinite(time) && time > data.steps[step].duration) {
    data = { ...data, steps: data.steps.map((s, i) => i === step ? { ...s, duration: time } : s) };
  }
  if (!controls.length || !Number.isFinite(value) || !Number.isFinite(time) || time < 0 || time > data.steps[step].duration || (property === 'opacity' || property === 'autoAlpha') && (value < 0 || value > 1)) {
    throw new Error('Enter a finite numeric value and a time inside this cue.');
  }
  if (action === 'set') {
    // A key goes to the channel its control writes; a scale key is both axes'.
    for (const control of controls) {
      const channel = writeChannel(data, owner, control);
      if (channel !== property) throw new Error(`${selector}'s ${NAMES[control]} is animated as ${channel}, so a key on ${property} would compete with it. Its source is preserved.`);
    }
    if (data.steps.some(s => s.layers[owner]?.[property]?.some(k => typeof k.value !== 'number'))) throw new Error('This property contains nonnumeric source.');
    return { data: setKeyframe(data, step, owner, property, time, value), ended: [] };
  }
  if (action !== 'remove' && action !== 'disable') throw new Error('Unknown animation operation.');
  if (property !== controls[0]) throw new Error('Name the control whose keys to remove.');
  const control = controls[0], channels = armedChannels(data, owner, control);
  if (control !== 'opacity') writeChannel(data, owner, control);
  if (action === 'remove' && !keyedAt(data, owner, control, step, time)) throw new Error('There is no key at this time.');
  if (action === 'disable' && !channels.length) throw new Error('This property has no animation to disable.');
  const before = data, armed = CONTROLS.filter(c => isArmed(before, owner, c));
  for (const channel of channels) {
    if (action === 'remove') data = deleteKeyframe(data, step, owner, channel, time);
    else for (let index = 0; index < data.steps.length; index++) {
      for (const key of [...(data.steps[index].layers[owner]?.[channel] ?? [])]) data = deleteKeyframe(data, index, owner, channel, key.time);
    }
  }
  const ended = armed.filter(c => !isArmed(data, owner, c));
  for (const c of ended) requireZeroPercent(before, owner, c, step, time);
  // autoAlpha also sets visibility, which a fixed opacity in the base cannot keep.
  if (ended.includes('opacity') && animates(before, owner, 'autoAlpha')) {
    throw new Error(`${selector} animates autoAlpha, which also sets its visibility, so a fixed opacity cannot keep where it shows. Keep one key, or remove the track in source. Its source is preserved.`);
  }
  return { data, ended };
}
export function applyAnimation(template: SpxTemplate, operation: AnimationOperation): SpxTemplate {
  const source = animationSource(template), { selector, step } = operation;
  const owner = animationTarget(template, source, selector);
  const { data, ended } = animateLayer(source, owner, operation, source.speed / template.fps, documentContains(template.html));
  // The controls whose motion ended (only a key removal ends any) keep the displayed pose as their base.
  if (ended.length && operation.kind === 'animation.key') {
    const js = writeAnimData(template.js, data);
    if (js === null) throw new Error('The animation region cannot be written.');
    template = { ...template, js };
    if (ended.includes('opacity')) template = editArtworkStyle(template, selector, { opacity: operation.value });
    const patch: BasePatch = {};
    for (const c of ended) if (c !== 'opacity') {
      const shown = operation.baseValues?.[c];
      if (!Number.isFinite(shown)) throw new Error('A current rendered base pose is required to remove the last key.');
      patch[c] = shown;
    }
    if (Object.keys(patch).length) { baseValues(template, selector); template = editBase(template, selector, patch); }
  }
  const js = step > 0 && step === data.steps.length - 1 ? writeOutData(template.js, data) : writeAnimData(template.js, data);
  if (js === null) throw new Error('The animation region cannot be written without replacing source.');
  return { ...template, js };
}

/** Move the selected keys, across flags too. An older known interpreter is re-emitted where Out
 *  changes, as Set Out does, and a custom one refuses there. */
export function applyKeyMove(template: SpxTemplate, operation: KeyMoveOperation): SpxTemplate {
  const data = animationSource(template);
  const reason = sequenceAuthoringReason(data);
  if (reason) throw new Error(reason);
  const next = moveKeys(data, operation.keys, operation.delta);
  if (next === data) return template;
  const out = next.steps.length - 1;
  return writeKeys(template, next, out > 0 && JSON.stringify(next.steps[out]) !== JSON.stringify(data.steps[out]), 'the moved keys');
}

/** Ease the selected key sides. Changing nothing leaves the source as it is, an older known
 *  interpreter is re-emitted to play the new forms, and a custom one refuses. */
export function applyKeyEase(template: SpxTemplate, operation: KeyEaseOperation): SpxTemplate {
  const data = animationSource(template);
  const reason = sequenceAuthoringReason(data);
  if (reason) throw new Error(reason);
  if (!Array.isArray(operation.keys) || !operation.keys.length) throw new Error('Select keys to ease. No ease changed.');
  const next = easeKeys(data, operation.keys, operation.preset);
  if (next === data) return template;
  return writeKeys(template, next, data.steps.length > 1 && operation.keys.some(key => key.step === data.steps.length - 1), 'the new eases');
}

/** Write keys an edit changed: where Out changed, an older known interpreter is re-emitted as Set
 *  Out does; a custom one refuses. */
function writeKeys(template: SpxTemplate, next: AnimData, exit: boolean, what: string): SpxTemplate {
  const js = exit ? writeOutData(template.js, next) : writeAnimData(template.js, next);
  if (js === null) throw new Error(`This interpreter has custom source, so ${what} cannot be written safely. Its source is preserved.`);
  return { ...template, js };
}
