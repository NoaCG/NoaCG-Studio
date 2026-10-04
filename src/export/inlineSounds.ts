import type { SpxTemplate } from '../model/types';
import { inlineAssetRefs, fileToDataUrl as blobToDataUrl } from '../assets/assetUtils';

/** Inline each sound once. Descriptors keep logical paths and resolve to the shared bytes. */
export async function inlineSounds(template: SpxTemplate): Promise<string> {
  const urls: Record<string,string> = {};
  for (const a of template.assets.filter(a=>a.audio)) {
    if (typeof a.data === 'string' && !a.data.startsWith('data:')) throw new Error(`Sound is not packaged: ${a.audio!.name}`);
    urls[a.path] = typeof a.data === 'string' ? a.data : await blobToDataUrl(a.data);
  }
  let js = template.js;
  const start = js.indexOf('var NOACG_PRODUCTION_SOUNDS = '), end = js.indexOf(';\nvar noacgSoundConfigError',start);
  if (start >= 0 && end > start) {
    const prefix = 'var NOACG_PRODUCTION_SOUNDS = ';
    const config = JSON.parse(js.slice(start + prefix.length,end));
    // An inlined picture's update values are data URLs. Its selector follows the same pass.
    config.visuals = Object.fromEntries(Object.entries(config.visuals).map(([key,value])=>[inlineAssetRefs(key,template.assets.filter(a=>!a.audio)),value]));
    js = js.slice(0,start) + prefix + JSON.stringify(config).replace(/</g,'\\u003c') + js.slice(end);
    js = js.replace(/noacgSoundVisual = ("(?:[^"\\]|\\.)*")/,(_match,literal: string)=>`noacgSoundVisual = ${JSON.stringify(inlineAssetRefs(JSON.parse(literal),template.assets.filter(a=>!a.audio)))}`);
  }
  const resolver = Object.keys(urls).length ? `window.noacgResolveSound = function (path) { return ${JSON.stringify(urls)}[path] || path; };\n` : '';
  return resolver + inlineAssetRefs(js,template.assets.filter(a=>!a.audio));
}
