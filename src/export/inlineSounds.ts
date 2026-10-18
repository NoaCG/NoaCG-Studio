import type { SpxTemplate } from '../model/types';
import { inlineAssetRefs, fileToDataUrl as blobToDataUrl } from '../assets/assetUtils';

/** Generated data is embedded in an HTML script body, not just parsed as JavaScript. */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/** Inline each sound once. Descriptors keep logical paths and resolve to the shared bytes. */
export async function inlineSounds(template: SpxTemplate): Promise<string> {
  const urls: Record<string,string> = {};
  for (const a of template.assets.filter(a=>a.audio)) {
    if (typeof a.data === 'string' && !a.data.startsWith('data:')) throw new Error(`Sound is not packaged: ${a.audio!.name}`);
    urls[a.path] = typeof a.data === 'string' ? a.data : await blobToDataUrl(a.data);
  }
  const images = template.assets.filter(a=>!a.audio);
  let js = template.js;
  const start = js.indexOf('var NOACG_PRODUCTION_SOUNDS = '), end = js.indexOf(';\nvar noacgSoundConfigError',start);
  if (start >= 0 && end > start) {
    const prefix = 'var NOACG_PRODUCTION_SOUNDS = ';
    const config = JSON.parse(js.slice(start + prefix.length,end));
    // An inlined picture's update values are data URLs. Its selector follows the same pass.
    config.visuals = Object.fromEntries(Object.entries(config.visuals).map(([key,value])=>[inlineAssetRefs(key,images),value]));
    const tail = js.slice(end);
    const selector = /noacgSoundVisual = ("(?:[^"\\]|\\.)*")/.exec(tail);
    // Inline authored source separately: a raw replacement after JSON encoding could undo it
    // or change logical sound paths, topology and binding keys inside the configuration.
    const inlinedTail = selector
      ? inlineAssetRefs(tail.slice(0,selector.index),images) + `noacgSoundVisual = ${jsonForScript(inlineAssetRefs(JSON.parse(selector[1]),images))}` + inlineAssetRefs(tail.slice(selector.index + selector[0].length),images)
      : inlineAssetRefs(tail,images);
    js = inlineAssetRefs(js.slice(0,start),images) + prefix + jsonForScript(config) + inlinedTail;
  } else js = inlineAssetRefs(js,images);
  const resolver = Object.keys(urls).length ? `window.noacgResolveSound = function (path) { return ${jsonForScript(urls)}[path] || path; };\n` : '';
  return resolver + js;
}
