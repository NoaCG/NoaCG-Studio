import type { GraphicSoundBinding, ProductionSounds, SpxTemplate } from '../model/types';
import { locateAnimData } from './animationLiteral';
import { SOUND_RUNTIME_JS } from './graphicSoundRuntime';
import { SOUND_RUNTIME_V1_JS } from './graphicSoundRuntimeV1';
import { AUDIO_REF_PREFIX, isSoundAssetRef } from './soundAssets';
import { PRODUCTION_SOUND_HOOKS } from './productionSoundHooks';

type Step = { name: string; sound?: GraphicSoundBinding };
type Group = { id: string; initial: string; defaultPath?: string[]; states: { id: string; name?: string; timeline?: Step }[]; transitions: { from: string; to: string; trigger: string; event?: string; after?: number; sound?: GraphicSoundBinding }[] };
type Animation = { version: number; steps: Step[]; machine?: { groups: Group[] } };

function animation(js: string): Animation | null {
  const location = locateAnimData(js);
  if (!location) return null;
  try {
    const value = JSON.parse(js.slice(location.start, location.end));
    return value.version === 2 && Array.isArray(value.steps) && value.steps.every((s: Step)=>s && typeof s.name === 'string') &&
      (!value.machine || (Array.isArray(value.machine.groups) && value.machine.groups.every((g: Group)=>g && Array.isArray(g.states) && g.states.every(s=>s && typeof s.id === 'string') && Array.isArray(g.transitions) && g.transitions.every(t=>t && typeof t.trigger === 'string')))) ? value : null;
  }
  catch { return null; }
}

/** Only target identity/order/meaning, never keyframe timing, styling or field values. */
export function soundTopology(template: SpxTemplate): string {
  const data = animation(template.js);
  return JSON.stringify([data?.steps.map(s => s.name) ?? ['In','Out'],
    data?.machine?.groups.map(g => [g.id,g.initial,g.defaultPath,g.states.map(s => [s.id,s.name]),
      g.transitions.filter(t => t.trigger !== 'lifecycle').map(t => [t.from,t.to,t.trigger,t.event,t.after])]),
    template.fields.map(f => [f.field,f.title])]);
}

export function upgradeSoundRuntime(js: string): string {
  const normalized = js.replace(/\r\n/g, '\n');
  return normalized.includes(SOUND_RUNTIME_V1_JS) ? normalized.replace(SOUND_RUNTIME_V1_JS, SOUND_RUNTIME_JS) : js;
}

export function productionSoundSourceError(template: SpxTemplate): string | null {
  const js = upgradeSoundRuntime(template.js).replace(/\r\n/g,'\n');
  return /\/\/ Capability: graphic-sound-v[12]/.test(js) && !js.includes(SOUND_RUNTIME_JS) ? 'Custom sound code needs review before production attachments can play. Its source is preserved.' : null;
}

export function isProductionSounds(value: unknown): value is ProductionSounds {
  const c = value as ProductionSounds | null;
  return !!c && c.v === 1 && Array.isArray(c.assets) && c.assets.every(isSoundAssetRef) && !!c.visuals && typeof c.visuals === 'object' && !Array.isArray(c.visuals) && Object.values(c.visuals).every(v =>
    v && typeof v.topology === 'string' && (!v.quiz || [v.quiz.selected,v.quiz.correct,v.quiz.selectionState,v.quiz.revealState].every(s=>typeof s === 'string' && s.length > 0)) && v.bindings && typeof v.bindings === 'object' && !Array.isArray(v.bindings) && Object.entries(v.bindings).every(([key,b]) => {
      if (key.startsWith('[')) { try { if (!Array.isArray(JSON.parse(key))) return false; } catch { return false; } }
      return b && typeof b.id === 'string' && typeof b.enabled === 'boolean' && ['one-shot','loop'].includes(b.mode) && Number.isInteger(b.levelDb) && b.levelDb >= -60 && b.levelDb <= 6 && c.assets.some(a => b.asset === `assets/sound-${a.hash}.${a.name.split('.').pop()!.toLowerCase()}`);
    }));
}

/** Read only our generated strict JSON prefix, never execute authored code. */
export function productionSoundConfig(js: string): ProductionSounds | null {
  const marker = 'var NOACG_PRODUCTION_SOUNDS = ', start = js.indexOf(marker), end = js.indexOf(';\nvar noacgSoundConfigError',start);
  if (start < 0 || end < start) return null;
  try { const c = JSON.parse(js.slice(start + marker.length,end)); return isProductionSounds(c) ? c : null; }
  catch { return null; }
}

export function hasProductionSound(js: string): boolean {
  return Object.values(productionSoundConfig(js)?.visuals ?? {}).some(v=>Object.values(v.bindings).some(b=>b.enabled));
}

const overlays = new WeakMap<SpxTemplate, Map<string,SpxTemplate>>();

/** Keep the resolver's stable identity: unrelated operator updates must not reload previews. */
export function withProductionSounds(template: SpxTemplate, config?: ProductionSounds): SpxTemplate {
  let key: string;
  try { key = JSON.stringify(config ?? null); } catch { return productionOverlay(template,config); }
  let versions = overlays.get(template);
  const cached = versions?.get(key); if (cached) return cached;
  const result = productionOverlay(template,config);
  if (!versions) { versions = new Map(); overlays.set(template,versions); }
  if (versions.size >= 4) versions.clear();
  versions.set(key,result); return result;
}

/** Pure production overlay. Authored visual source and its library link remain untouched. */
function productionOverlay(template: SpxTemplate, config?: ProductionSounds): SpxTemplate {
  if (!config) { const js = upgradeSoundRuntime(template.js); return js === template.js ? template : { ...template, js }; }
  if (!isProductionSounds(config)) {
    // Unknown/corrupt metadata must never displace the visual or silently report Ready.
    return { ...template, js: "var noacgSoundConfigError = 'Sound configuration is unreadable. Review Sounds in Playout.';\n" + upgradeSoundRuntime(template.js) + "\nwindow.noacgSoundStatus = function () { return window.noacgSoundMode === 'silent' ? null : noacgSoundConfigError; };" };
  }
  let js = upgradeSoundRuntime(template.js);
  const sourceError = productionSoundSourceError(template);
  if (sourceError) return { ...template, js: js + `\nwindow.noacgSoundStatus = function () { return window.noacgSoundMode === 'silent' ? null : ${JSON.stringify(sourceError)}; };` };
  const ownRuntime = js.includes('// Capability: graphic-sound-v2');
  const data = animation(js), location = locateAnimData(js);
  const visual = config.visuals.graphic;
  const changed = config.v !== 1 || Object.values(config.visuals).some(v => Object.keys(v.bindings).length > 0 && v.topology !== soundTopology(template));
  if (data && location && visual && !changed) {
    data.steps.forEach(s => { delete s.sound; });
    for (const g of data.machine?.groups ?? []) {
      g.states.forEach(s => { if (s.timeline) delete s.timeline.sound; });
      g.transitions.forEach(t => { delete t.sound; });
    }
    for (const [key,sound] of Object.entries(visual.bindings)) {
      if (key === 'in') data.steps[0].sound = sound;
      if (key === 'out') data.steps[data.steps.length - 1].sound = sound;
      if (!key.startsWith('[')) continue;
      const parts = JSON.parse(key) as (string | number)[];
      if (parts[0] === 'step') { const s = data.steps[Number(parts[1])]; if (s) s.sound = sound; }
      const g = data.machine?.groups.find(g => g.id === parts[1]);
      if (parts[0] === 'state') {
        const s = g?.states.find(s => s.id === parts[2]);
        if (s) { s.timeline ??= { name: s.name ?? s.id, duration: 0, ease: 'none', layers: {} } as Step; Object.assign(s.timeline, { sound }); }
      }
      if (parts[0] === 'edge') {
        const t = g?.transitions.find(t => t.trigger === parts[2] && (t.event ?? t.after) === parts[3] && t.from === parts[4] && t.to === parts[5]);
        if (t) t.sound = sound;
      }
    }
    js = js.slice(0,location.start) + JSON.stringify(data) + js.slice(location.end);
  }
  // Keep logical selector/asset keys intact when composers inline the visual's media paths.
  const runtimeConfig = { ...config, assets: config.assets.map(({storageKey: _transport,...ref})=>ref) };
  const prefix = `var NOACG_PRODUCTION_SOUNDS = ${JSON.stringify(runtimeConfig).replace(/\//g, '\\u002f').replace(/</g, '\\u003c')};\nvar noacgSoundConfigError = ${JSON.stringify(changed ? 'Sound triggers changed. Review and rebind in Playout.' : null)};\n`;
  if (!ownRuntime) {
    js = SOUND_RUNTIME_JS + '\n' + js + '\n' + LIFECYCLE_SOUND_JS.replace("noacgSoundVisual = 'graphic'", `noacgSoundVisual = ${JSON.stringify(template.type === 'picture' ? 'picture:' + (template.fields.find(f => f.field === 'f0')?.value ?? '') : 'graphic').replace(/\//g, '\\u002f')}`);
  }
  js += '\n' + PRODUCTION_SOUND_HOOKS;
  const assets = config.assets.map(ref => ({ path: `assets/sound-${ref.hash}.${ref.name.split('.').pop()!.toLowerCase()}`, data: AUDIO_REF_PREFIX + ref.hash, audio: ref }));
  return { ...template, js: prefix + js, assets: [...template.assets.filter(a => !assets.some(b => b.path === a.path)), ...assets] };
}

// Static/custom lifecycle adapter: use the existing playback helper, not a second player.
const LIFECYCLE_SOUND_JS = `
var noacgSoundVisual = 'graphic', noacgSoundOnAir = false;
(function () {
  var previousPlay = window.play, previousStop = window.stop, previousUpdate = window.update;
  window.update = function (data) {
    var fields = typeof data === 'string' ? JSON.parse(data) : data;
    if (fields && Object.prototype.hasOwnProperty.call(fields,'f0') && Object.keys(NOACG_PRODUCTION_SOUNDS.visuals).some(function (k) { return k.indexOf('picture:') === 0; })) {
      var next = 'picture:' + fields.f0;
      if (next !== noacgSoundVisual) noacgSoundStopAll();
      noacgSoundVisual = next;
    }
    return previousUpdate && previousUpdate.apply(this,arguments);
  };
  window.play = function () {
    var result = previousPlay && previousPlay.apply(this,arguments);
    noacgSoundStopAll(); noacgSoundOnAir = true;
    noacgSoundStart(noacgSoundBinding('in'),'visual'); return result;
  };
  window.stop = function () {
    var result = previousStop && previousStop.apply(this,arguments);
    if (noacgSoundOnAir) { noacgSoundOnAir = false; noacgSoundStopAll(); noacgSoundStart(noacgSoundBinding('out'),'out'); }
    return result;
  };
  noacgSoundPrepare().catch(function () {});
})();
`;
