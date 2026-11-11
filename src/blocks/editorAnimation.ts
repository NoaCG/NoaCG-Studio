import type { SpxTemplate } from '../model/types';
import { getTemplateParts } from '../model/structure';
import { SVG_GROUP_PIVOT_ATTRIBUTE, SVG_GROUP_PIVOT_UNITS } from '../model/svgGroupTransform';
import { losslessAnimData, spliceAnimData, type AnimData } from './animData';
import { captureKeys, deleteKeyframe, easeKeys, EPS, setKeyframe, moveKeys, moveLayerSpan, pasteKeys, trimLayerSpan, type CopiedKey, type KeyEasePreset, type KeyRef } from './animEdit';
import { resolveValue } from './animEval';
import { artworkNode, editArtworkStyle } from './artworkEdits';
import { anchorCssReason, baseValues, editBase, settleSvgOffset, TRANSFORM_CHANNELS, type BasePatch } from './baseEdits';
import { allTimelines } from './animMachine';
import { canWriteAnchorData, hasAnchorRuntime, ORDINARY_ANCHOR_CHANNELS, withAnchorRuntime, writeAnimData, writeOutData } from '../templates/shared/animRuntime';
import { locateBehaviourData, parseBehaviourData } from './behaviourData';
import { behaviourSequenceReason, claimReason, claimRelations, recipeClaims, requireUserTracksOnly, sequenceOwned, stamped, SEQUENCE_REFUSAL, type RecipeClaim } from './behaviourKeys';

/** A transform or opacity control of the inspector and canvas. */
export type NumericProperty = 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation' | 'opacity';
export const SVG_GROUP_ANCHOR_CHANNELS = { x: '--base-anchor-x', y: '--base-anchor-y' } as const;
export { ORDINARY_ANCHOR_CHANNELS as ANCHOR_CHANNELS };
export type AnchorChannel = typeof ORDINARY_ANCHOR_CHANNELS['x' | 'y'] | typeof SVG_GROUP_ANCHOR_CHANNELS['x' | 'y'];
type ControlProperty = NumericProperty | AnchorChannel;
const ordinaryAnchor = (property: string) => property === ORDINARY_ANCHOR_CHANNELS.x || property === ORDINARY_ANCHOR_CHANNELS.y;
export const isAnchorChannel = (property: string): property is AnchorChannel => ordinaryAnchor(property) || property === SVG_GROUP_ANCHOR_CHANNELS.x || property === SVG_GROUP_ANCHOR_CHANNELS.y;
export const anchorChannels = (base: { svgGroupPivot?: boolean }) => base.svgGroupPivot ? SVG_GROUP_ANCHOR_CHANNELS : ORDINARY_ANCHOR_CHANNELS;
export const anchorAxis = (property: AnchorChannel) => property === ORDINARY_ANCHOR_CHANNELS.x || property === SVG_GROUP_ANCHOR_CHANNELS.x ? 'x' : 'y';
/** A runtime track a control reads and writes (R1.2a.6, docs/research/editor-r1-2a-6). */
export type Channel = ControlProperty | 'xPercent' | 'yPercent' | 'scale' | 'autoAlpha';
/** One preset over a key selection, as one transaction (R1.2a.2, docs/research/editor-r1-2a-2). */
export type KeyEaseOperation = { kind: 'key.ease'; keys: KeyRef[]; preset: KeyEasePreset };
/** Keys moved by one stored delta on the ruler, across flags too (R1.2a.5, docs/research/editor-r1-2a-5). */
export type KeyMoveOperation = { kind: 'key.move'; keys: KeyRef[]; delta: number };
export type ClipboardKey = CopiedKey & { artwork: string };
export type KeyPasteOperation = { kind: 'key.paste'; keys: readonly ClipboardKey[]; step: number; time: number };
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
export const CONTROL_CHANNELS: Readonly<Record<ControlProperty, readonly Channel[]>> = {
  x: ['x', 'xPercent'], y: ['y', 'yPercent'], scaleX: ['scaleX', 'scale'], scaleY: ['scaleY', 'scale'], rotation: ['rotation'], opacity: ['opacity', 'autoAlpha'],
  [ORDINARY_ANCHOR_CHANNELS.x]: [ORDINARY_ANCHOR_CHANNELS.x], [ORDINARY_ANCHOR_CHANNELS.y]: [ORDINARY_ANCHOR_CHANNELS.y],
  [SVG_GROUP_ANCHOR_CHANNELS.x]: [SVG_GROUP_ANCHOR_CHANNELS.x], [SVG_GROUP_ANCHOR_CHANNELS.y]: [SVG_GROUP_ANCHOR_CHANNELS.y],
};
const CONTROLS = Object.keys(CONTROL_CHANNELS) as ControlProperty[];
/** The controls a channel belongs to: `scale` is both Scale axes. */
export const controlsOf = (channel: string) => CONTROLS.filter(control => CONTROL_CHANNELS[control].includes(channel as Channel));
/** The pose field a control's channel shows in: the runtime reports `scale` as each Scale axis and
 *  `autoAlpha` as opacity. */
export const poseKey = (channel: Channel, control: NumericProperty): keyof NumericPose => channel === 'scale' || channel === 'autoAlpha' ? control : channel as keyof NumericPose;
const NAMES: Record<ControlProperty, string> = { x: 'Position X', y: 'Position Y', scaleX: 'Scale X', scaleY: 'Scale Y', rotation: 'Rotation', opacity: 'Opacity',
  [ORDINARY_ANCHOR_CHANNELS.x]: 'Anchor X', [ORDINARY_ANCHOR_CHANNELS.y]: 'Anchor Y', [SVG_GROUP_ANCHOR_CHANNELS.x]: 'Anchor X', [SVG_GROUP_ANCHOR_CHANNELS.y]: 'Anchor Y' };
const animates = (data: AnimData | null, owner: string, channel: string) => !!data?.steps.some(step => step.layers[owner]?.[channel]?.length);

export function animationSource(template: SpxTemplate): AnimData {
  const data = losslessAnimData(template.js);
  if (!data) throw new Error('This animation contains data the writer cannot preserve exactly.');
  return data;
}
/** The channels of a control a layer animates (under its owner), the pixel or per-axis one first. */
export function armedChannels(data: AnimData | null, owner: string, property: ControlProperty): Channel[] {
  return CONTROL_CHANNELS[property].filter(channel => animates(data, owner, channel));
}
export function isArmed(data: AnimData | null, owner: string, property: ControlProperty) {
  return armedChannels(data, owner, property).length > 0;
}
/** Whether any channel of a control has a key at a time on a cue's clock. */
export function keyedAt(data: AnimData | null, owner: string, property: ControlProperty, step: number, time: number) {
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
export function writeChannel(data: AnimData | null, owner: string, property: ControlProperty): Channel {
  if (property !== 'opacity' && animates(data, owner, 'transform')) {
    throw new Error(`${owner} animates a raw transform string, which cannot be keyed one property at a time. Its source is preserved.`);
  }
  const armed = armedChannels(data, owner, property);
  const axis = (property === 'scaleX' || property === 'scaleY') && animates(data, owner, 'scale') ? (['scaleX', 'scaleY'] as const).find(c => animates(data, owner, c)) : undefined;
  const clash = axis ? ['scale', axis] : property === 'opacity' && armed.length > 1 ? armed : null;
  if (clash) throw new Error(`${owner} animates ${NAMES[property]} with both ${clash[0]} and ${clash[1]} tracks, so a key could not say which one it changes. Its source is preserved.`);
  return armed[0] ?? property;
}
/** Whether the editor may change the sequence's STRUCTURE: cues, Set Out, bars and group pivots.
 *  A machine, calls, measured motion or loops keep it as authored (R1.1c; on a behaviour graphic
 *  K3 of docs/research/editor-behaviour-keys). Keys ask `keyAuthoringReason`. */
export function sequenceAuthoringReason(data: AnimData | null): string | null {
  if (!data) return 'This source has no supported animation data.';
  return sequenceOwned(data) ? SEQUENCE_REFUSAL : null;
}
/** The behaviour paint runtime's own entry point, which a recipe's table needs to mean anything. */
const BEHAVIOUR_RUNTIME = /function noacgRepaint\(/;
/**
 * Whether keys may be authored on this sequence (#1982): a plain one, or an owned one where a
 * behaviour recipe is every writer and each is known (K1, K2). Which layers and properties are
 * the user's is `keyAuthoringReason`.
 */
export function keySequenceReason(template: SpxTemplate, data: AnimData | null): string | null {
  const reason = sequenceAuthoringReason(data);
  if (!reason || !data) return reason;
  if (!sequenceOwned(data, false)) return null;
  return behaviourSequenceReason(data, parseBehaviourData(template.js), BEHAVIOUR_RUNTIME.test(template.js));
}
/** The recipe's claims on one template, read once per source (#1982): a drag asks per frame. */
let claimed: { js: string; html: string; claims: RecipeClaim[] } | null = null;
function claimsOf(template: SpxTemplate, doc: Document): RecipeClaim[] {
  if (claimed?.js !== template.js || claimed.html !== template.html) {
    claimed = { js: template.js, html: template.html, claims: recipeClaims(parseBehaviourData(template.js)!, token => !!doc.querySelector(stamped(token))) };
  }
  return claimed.claims;
}
/**
 * K4 to K6: the reason a key on `channel` of the layers `selector` matches is refused on a
 * behaviour graphic, or null where they are the user's. Null on a plain sequence; the sequence's
 * own reason where keys are refused whole.
 */
export function keyAuthoringReason(template: SpxTemplate, data: AnimData | null, selector: string, channel: string): string | null {
  const reason = keySequenceReason(template, data);
  if (reason || !data || !sequenceOwned(data, false)) return reason;
  const doc = parsed(template.html);
  let layers: Element[];
  try { layers = Array.from(doc.querySelectorAll(selector)); } catch { return SEQUENCE_REFUSAL; }
  if (!layers.length) return SEQUENCE_REFUSAL;
  const relations = claimRelations(doc, layers);
  return claimReason(claimsOf(template, doc).map(claim => ({ claim, relations: relations(claim.selector) })), channel);
}
/** The reason a control of a layer cannot be keyed: the first of its channels that refuses. */
export function controlKeyReason(template: SpxTemplate, data: AnimData | null, selector: string, control: NumericProperty): string | null {
  for (const channel of CONTROL_CHANNELS[control]) { const reason = keyAuthoringReason(template, data, selector, channel); if (reason) return reason; }
  return null;
}
/** K7: on an owned sequence, an edit may change only tracks that are the user's, checked on every
 *  element each changed track's selector matches. */
function requireUserEdit(template: SpxTemplate, before: AnimData, after: AnimData) {
  if (!sequenceOwned(before, false)) return;
  requireUserTracksOnly(before, after, (owner, channel) => !keyAuthoringReason(template, before, owner, channel));
}
/** K7: the paint table a key edit leaves exactly as it was. */
function keepRecipe(before: SpxTemplate, after: SpxTemplate): SpxTemplate {
  const table = (js: string) => { const at = locateBehaviourData(js); return at ? js.slice(at.start, at.end) : null; };
  if (table(before.js) !== table(after.js)) throw new Error('This edit would change what the behaviour owns. No keys changed.');
  return after;
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
/** Refuse what playback owns and return the layer's owner. Keys on `channels` ask whose they
 *  are (#1982); without channels the edit is structural (a bar), which an owned sequence keeps. */
export function animationTarget(template: SpxTemplate, data: AnimData, selector: string, channels?: readonly string[]) {
  const node = artworkNode(template, selector);
  if (node.matches(data.root)) throw new Error('The graphic root is owned by playback. Animate an artwork layer.');
  const reason = channels?.length ? channels.map(channel => keyAuthoringReason(template, data, selector, channel)).find(Boolean) ?? null : sequenceAuthoringReason(data);
  if (reason) throw new Error(reason);
  return trackOwner(template, data, selector);
}

/** The CSS pivot and its keyed variables must be on the same layer as its other motion. */
export function anchorKeyReason(template: SpxTemplate, selector: string): string | null {
  try {
    const data = animationSource(template), owner = animationTarget(template, data, selector);
    const base = baseValues(template, selector);
    if (base.anchorReason) return base.anchorReason;
    if (base.groupFrame && !base.svgGroupPivot) return base.mode === 'svg'
      ? 'This older SVG group keeps its saved pivot. Set its pivot in the base.' : 'This group uses a shared pivot. Set its pivot in the base.';
    if ((base.mode === 'svg' && !base.cssSvgAnchor && !base.svgGroupPivot) || base.target !== selector || (base.svgGroupPivot && owner !== selector)) {
      return 'This layer uses a separate transform origin. Its pivot can only be set in the base.';
    }
    if (base.scaleX === 0 || base.scaleY === 0) return 'Restore a nonzero scale before animating this pivot.';
    const channels = anchorChannels(base);
    if (!base.svgGroupPivot && Object.values(SVG_GROUP_ANCHOR_CHANNELS).some(channel => animates(data, owner, channel))) {
      return 'This layer already has a raw pivot track. Its source is preserved.';
    }
    if (!base.svgGroupPivot && !hasAnchorRuntime(template.js) && Object.values(ORDINARY_ANCHOR_CHANNELS).some(channel => template.js.includes(channel))) {
      return 'This source already uses an editor pivot channel name with another interpreter. Its source is preserved.';
    }
    for (const channel of Object.values(channels)) {
      if (data.steps.some(step => step.layers[owner]?.[channel]?.some(key => typeof key.value !== 'number'))) return 'This pivot has nonnumeric keys in its source.';
      if (!base.anchor && animates(data, owner, channel)) return 'This pivot has keys but no editable base value.';
    }
    writeChannel(data, owner, channels.x);
    if (!canWriteAnchorData(template.js)) return 'This interpreter cannot animate the pivot without changing unknown source.';
    return anchorCssReason(template, base, true);
  } catch (cause) { return cause instanceof Error ? cause.message : String(cause); }
}
/** Throws unless a layer's Scale handles can key it: both axes have a channel to write. */
export function requireScaleWritable(template: SpxTemplate, selector: string) {
  const data = animationSource(template), owner = animationTarget(template, data, selector, [...CONTROL_CHANNELS.scaleX, ...CONTROL_CHANNELS.scaleY]);
  writeChannel(data, owner, 'scaleX'); writeChannel(data, owner, 'scaleY');
}
/** Where removing a Position axis's motion keeps its displayed pose as a pixel base, its percent
 *  channel must be 0 there: any other share of the layer's box is a different distance for other text. */
function requireZeroPercent(data: AnimData, owner: string, property: ControlProperty, step: number, time: number) {
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
export function animateLayer(source: AnimData, owner: string, operation: AnimationOperation, minimum: number, contains?: (ancestor: string, selector: string) => boolean): { data: AnimData; ended: ControlProperty[] } {
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
/** Placed text keys its text, which turns and scales inside its box about the text's own centre: where
 *  the box has an anchor of its own (R1.2b.1), a Rotation or Scale key there would not turn about it. */
function requireTextPivot(template: SpxTemplate, selector: string, channel: Channel) {
  // Only a declared anchor can refuse, and it names its custom properties: most graphics skip the inspection.
  if (!['rotation', 'scale', 'scaleX', 'scaleY'].includes(channel) || !template.css.includes('--base-anchor-')) return;
  let base;
  try { base = baseValues(template, selector); } catch { return; }
  if (base.mode === 'placed' && base.anchor) throw new Error(`${selector} has its anchor on its placed box, but a ${channel} key turns or scales its text inside that box about the text's own centre, not the anchor. Its source is preserved.`);
}
export function applyAnimation(template: SpxTemplate, operation: AnimationOperation): SpxTemplate {
  const original = template;
  const source = animationSource(template), { selector, step } = operation;
  if (operation.kind === 'animation.key' && operation.action === 'set') {
    requireTextPivot(template, selector, operation.property);
    if (TRANSFORM_CHANNELS.includes(operation.property)) {
      const artwork = template.html.includes(SVG_GROUP_PIVOT_ATTRIBUTE) ? artworkNode(template, selector) : null;
      const marked = artwork?.hasAttribute('data-noacg-group') && artwork.hasAttribute(SVG_GROUP_PIVOT_ATTRIBUTE);
      let base;
      if (marked) base = baseValues(template, selector);
      else if (template.css.includes('--base-anchor-')) {
        try { base = baseValues(template, selector); } catch { /* A track can be editable without base placement. */ }
      }
      if (base?.svgGroupPivot === false) throw new Error(base.anchorReason!);
      if (base?.cssSvgAnchor && base.anchor) throw new Error('This SVG member has a CSS pivot. A GSAP transform key would replace it, so its source is preserved.');
    }
  }
  if (operation.kind === 'animation.key' && isAnchorChannel(operation.property)) {
    const reason = anchorKeyReason(template, selector);
    if (reason) throw new Error(reason);
    if (Math.abs(operation.value) > 100000) throw new Error('Enter a finite anchor coordinate.');
    const base = baseValues(template, selector);
    if (!Object.values(anchorChannels(base)).includes(operation.property)) throw new Error('This pivot channel has a different source owner. Its source is preserved.');
    if (operation.action === 'set' && !base.anchor) {
      const { anchorX, anchorY } = operation.baseValues ?? {};
      if (anchorX === undefined || anchorY === undefined) throw new Error('A current rendered pivot is required to create the first anchor key.');
      template = editBase(template, selector, { anchorX, anchorY });
    }
    if (operation.action === 'set') {
      if (base.svgGroupPivot) operation = { ...operation, value: operation.value * SVG_GROUP_PIVOT_UNITS };
      else template = { ...template, js: withAnchorRuntime(template.js)! };
    }
  }
  const channels = operation.kind !== 'animation.key' ? undefined : operation.action === 'set' ? [operation.property] : CONTROL_CHANNELS[operation.property as ControlProperty] ?? [operation.property];
  const owner = animationTarget(template, source, selector, channels);
  // The first key on an SVG layer's transform keeps its base offset (#2062). The key's value is
  // GSAP's reading before the offset moved into the transform it reads, so it moves with it.
  if (operation.kind === 'animation.key' && operation.action === 'set' && owner === selector && TRANSFORM_CHANNELS.includes(operation.property) && !allTimelines(source).some(step => TRANSFORM_CHANNELS.some(c => step.layers[owner]?.[c]?.length))) {
    const settled = settleSvgOffset(template, selector);
    template = settled.template;
    if (operation.property === 'x' || operation.property === 'y') operation = { ...operation, value: operation.value + settled[operation.property] };
  }
  const { data, ended } = animateLayer(source, owner, operation, source.speed / template.fps, documentContains(template.html));
  requireUserEdit(template, source, data);
  // The controls whose motion ended (only a key removal ends any) keep the displayed pose as their base.
  if (ended.length && operation.kind === 'animation.key') {
    const js = writeAnimData(template.js, data);
    if (js === null) throw new Error('The animation region cannot be written.');
    template = { ...template, js };
    if (ended.includes('opacity')) template = editArtworkStyle(template, selector, { opacity: operation.value });
    const patch: BasePatch = {};
    for (const c of ended) if (c !== 'opacity') {
      const axis = isAnchorChannel(c) ? anchorAxis(c) === 'x' ? 'anchorX' : 'anchorY' : c;
      const shown = operation.baseValues?.[axis];
      if (!Number.isFinite(shown)) throw new Error('A current rendered base pose is required to remove the last key.');
      patch[axis] = shown;
    }
    if (patch.anchorX !== undefined || patch.anchorY !== undefined) {
      const base = baseValues(template, selector).anchor;
      if (!base) throw new Error('The anchor base no longer exists.');
      patch.anchorX ??= base.x;
      patch.anchorY ??= base.y;
    }
    if (Object.keys(patch).length) { baseValues(template, selector); template = editBase(template, selector, patch); }
  }
  const js = step > 0 && step === data.steps.length - 1 ? writeOutData(template.js, data) : writeAnimData(template.js, data);
  if (js === null) throw new Error('The animation region cannot be written without replacing source.');
  return keepRecipe(original, { ...template, js });
}

/** Resolve a data track to the one artwork layer the editor can safely change. */
function keyArtworkResolver(template: SpxTemplate, data: AnimData) {
  const parts = getTemplateParts(template.html, template.fields, true).filter(part => part.kind !== 'root').map(part => part.selector);
  const owners = trackOwners(template, data, parts);
  return (key: { selector: string; property: string }) => {
    const matches = parts.filter(part => owners[part] === key.selector);
    if (matches.length !== 1 || animationTarget(template, data, matches[0], [key.property]) !== key.selector) {
      throw new Error('A selected track has no unique editable artwork. Its source is preserved.');
    }
    return matches[0];
  };
}

function requireAnchorArtwork(template: SpxTemplate, selectors: string[]) {
  for (const selector of new Set(selectors)) {
    const reason = anchorKeyReason(template, selector);
    if (reason) throw new Error(reason);
  }
}

function ownedAnchorTracks<T extends { property: string; selector: string }>(template: SpxTemplate, keys: readonly T[]) {
  const ownedOrdinary = keys.some(key => ordinaryAnchor(key.property)) && hasAnchorRuntime(template.js);
  return keys.filter(key => {
    if (ordinaryAnchor(key.property)) return ownedOrdinary;
    if (!isAnchorChannel(key.property) || !template.html.includes(SVG_GROUP_PIVOT_ATTRIBUTE)) return false;
    try { return [...parsed(template.html).querySelectorAll(key.selector)].some(node => node.hasAttribute(SVG_GROUP_PIVOT_ATTRIBUTE)); }
    catch { return false; }
  });
}

/** Refuse a key selection unless every key is on a track that is the user's (#1982). */
function requireUserKeys(template: SpxTemplate, data: AnimData, keys: KeyRef[]) {
  const selected = Array.isArray(keys) ? keys : [];
  const reason = keySequenceReason(template, data) ?? selected.map(key => keyAuthoringReason(template, data, key.selector, key.property)).find(Boolean);
  if (reason) throw new Error(reason);
  const pivots = ownedAnchorTracks(template, selected);
  if (pivots.length) requireAnchorArtwork(template, pivots.map(keyArtworkResolver(template, data)));
}

/** Capture the animation owner and the uniquely editable artwork it names. */
export function captureKeyClipboard(template: SpxTemplate, refs: readonly KeyRef[]): ClipboardKey[] {
  const data = animationSource(template), keys = captureKeys(data, refs);
  const artwork = keyArtworkResolver(template, data);
  const copied = keys.map(key => ({ ...key, artwork: artwork(key) }));
  requireAnchorArtwork(template, ownedAnchorTracks(template, copied).map(key => key.artwork));
  return copied;
}

/** Paste one batch without changing ownership, field data or interpreter bytes. */
export function applyKeyPaste(template: SpxTemplate, operation: KeyPasteOperation): SpxTemplate {
  const data = animationSource(template);
  for (const key of operation.keys) {
    if (animationTarget(template, data, key.artwork, [key.property]) !== key.selector) {
      throw new Error('A copied track has changed owner. No keys changed.');
    }
  }
  requireAnchorArtwork(template, ownedAnchorTracks(template, operation.keys).map(key => key.artwork));
  const next = pasteKeys(data, operation.keys, operation.step, operation.time);
  requireUserEdit(template, data, next);
  const exit = data.steps.length > 1 && operation.step === data.steps.length - 1;
  const patched = writeKeys(template, next, exit, 'the pasted keys');
  if (patched.js !== spliceAnimData(template.js, next)) {
    throw new Error('Paste would upgrade this animation’s interpreter. Its source is preserved.');
  }
  return patched;
}

/** Move the selected keys, across flags too. An older known interpreter is re-emitted where Out
 *  changes, as Set Out does, and a custom one refuses there. */
export function applyKeyMove(template: SpxTemplate, operation: KeyMoveOperation): SpxTemplate {
  const data = animationSource(template);
  requireUserKeys(template, data, operation.keys);
  const next = moveKeys(data, operation.keys, operation.delta);
  if (next === data) return template;
  requireUserEdit(template, data, next);
  const out = next.steps.length - 1;
  return writeKeys(template, next, out > 0 && JSON.stringify(next.steps[out]) !== JSON.stringify(data.steps[out]), 'the moved keys');
}

/** Ease the selected key sides. Changing nothing leaves the source as it is, an older known
 *  interpreter is re-emitted to play the new forms, and a custom one refuses. */
export function applyKeyEase(template: SpxTemplate, operation: KeyEaseOperation): SpxTemplate {
  const data = animationSource(template);
  if (!Array.isArray(operation.keys) || !operation.keys.length) throw new Error('Select keys to ease. No ease changed.');
  requireUserKeys(template, data, operation.keys);
  const next = easeKeys(data, operation.keys, operation.preset);
  if (next === data) return template;
  requireUserEdit(template, data, next);
  return writeKeys(template, next, data.steps.length > 1 && operation.keys.some(key => key.step === data.steps.length - 1), 'the new eases');
}

/** Write keys an edit changed: where Out changed, an older known interpreter is re-emitted as Set
 *  Out does; a custom one refuses. */
function writeKeys(template: SpxTemplate, next: AnimData, exit: boolean, what: string): SpxTemplate {
  const js = exit ? writeOutData(template.js, next) : writeAnimData(template.js, next);
  if (js === null) throw new Error(`This interpreter has custom source, so ${what} cannot be written safely. Its source is preserved.`);
  return keepRecipe(template, { ...template, js });
}
