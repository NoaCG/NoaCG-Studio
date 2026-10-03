import type { AssetFile, SpxTemplate } from '../model/types';
import { isDataUrl, isImageAsset, parseDataUrl, uniqueAssetPath } from '../assets/assetUtils';
import { referenceCount } from '../assets/assetInfo';
import { artworkNode, artworkRange } from './artworkEdits';
import { creationParent, insertArtworkChild } from './baseEdits';
import { addPlacedImageSlot, placeLine, setSlotSize } from './designLayout';
import { addFieldToDefinition, addLayer, appendCss, nextFieldId, setCssDeclaration, setFieldDefault } from './edit';
import { moveAsset } from './assetOps';
import { losslessAnimData, spliceAnimData } from './animData';

export function requireAssetPath(path: string) {
  if (typeof path !== 'string' || !/^(images|fonts|videos|lottie|assets)\/(?:[\w-]+\/)*[\w.-]+$/.test(path) || path.split('/').some(p => p === '.' || p === '..')) throw new Error('Use a safe relative asset path.');
}
export function importAssets(template: SpxTemplate, incoming: readonly AssetFile[]): { template: SpxTemplate; paths: string[] } {
  if (!incoming.length || incoming.length > 100) throw new Error('Provide a bounded asset batch.');
  const assets = [...template.assets], paths: string[] = [];
  for (const asset of incoming) {
    requireAssetPath(asset.path);
    if (!isDataUrl(asset.data) || !asset.data.slice(asset.data.indexOf(',') + 1)) throw new Error('Import valid embedded asset bytes.');
    const bytes = parseDataUrl(asset.data)!.base64;
    const identical = assets.find(a => typeof a.data === 'string' && parseDataUrl(a.data)?.base64 === bytes);
    if (identical) { paths.push(identical.path); continue; }
    const path = assets.some(a => a.path === asset.path) ? uniqueAssetPath(asset.path.split('/').pop()!, assets, asset.path.split('/').slice(1, -1).join('/')) : asset.path;
    assets.push({ ...asset, path }); paths.push(path);
  }
  return { template: assets.length === template.assets.length ? template : { ...template, assets }, paths };
}
export function removeUnusedAsset(template: SpxTemplate, path: string): SpxTemplate {
  if (!template.assets.some(a => a.path === path)) throw new Error('This asset is missing.');
  if (referenceCount(template, path) || template.fields.some(f => String(f.value ?? '').includes(path))) throw new Error('This asset is used in the graphic. Replace its references before removing it.');
  return { ...template, assets: template.assets.filter(a => a.path !== path) };
}
export function renameGraphicAsset(template: SpxTemplate, from: string, to: string) {
  requireAssetPath(to);
  if (!template.assets.some(a => a.path === from)) throw new Error('This asset is missing.');
  return moveAsset(template, from, to).template;
}

/** Frame pixels map into the root's drawing space, which can sit below the frame. */
export function imagePlacement(template: SpxTemplate, natural: { width: number; height: number }, point: { x: number; y: number }, space: readonly number[]) {
  if (![natural.width, natural.height].every(n => Number.isFinite(n) && n > 0)) throw new Error('Use a positive finite image size.');
  if (space.length !== 6 || ![...space, point.x, point.y].every(Number.isFinite)) throw new Error('The drawing surface is not ready.');
  const [a, b, c, d, tx, ty] = space, determinant = a * d - b * c;
  const unit = Math.hypot(a, b);
  if (Math.abs(determinant) < 1e-8 || !unit || Math.abs(unit - Math.hypot(c, d)) > 1e-5 || Math.abs(a * c + b * d) > 1e-5) throw new Error('This drawing surface is singular or distorts images. Restore uniform parent scale.');
  const ratio = Math.min(1, template.resolution.width / 4 / natural.width, template.resolution.height / 4 / natural.height);
  const width = natural.width * ratio / unit, height = natural.height * ratio / unit;
  return { x: (d * (point.x - tx) - c * (point.y - ty)) / determinant - width / 2,
    y: (-b * (point.x - tx) + a * (point.y - ty)) / determinant - height / 2, width, height };
}

function imageAsset(template: SpxTemplate, path: string) {
  const asset = template.assets.find(a => a.path === path);
  if (!asset || !isImageAsset(path)) throw new Error('Choose an image asset in this graphic.');
  return asset;
}
export function imageCapability(template: SpxTemplate, selector: string): { supported: boolean; reason: string } {
  try {
    const node = artworkNode(template, selector), tag = node.tagName.toLowerCase();
    if (!['img', 'image'].includes(tag)) throw new Error('This artwork is not a replaceable image element. Editable SVG artwork uses Import graphic.');
    const field = template.fields.find(f => f.field === node.id);
    if (field && field.ftype !== 'filelist') throw new Error('This image is controlled by a different field type.');
    if (node.hasAttribute('srcset') || node.closest('picture')) throw new Error('This image uses responsive sources. Replace them in source to preserve the design.');
    const escaped = (node.id || selector).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!field && new RegExp(escaped + "[\\s\\S]{0,100}\\.(?:src|setAttribute)\\b").test(template.js)) throw new Error('This image source is driven by code. Replace it in source.');
    artworkRange(template.html, node);
    return { supported: true, reason: '' };
  } catch (error) { return { supported: false, reason: error instanceof Error ? error.message : String(error) }; }
}

/** Patch only the addressed opening tag, retaining imported siblings and comments byte-for-byte. */
function attribute(template: SpxTemplate, selector: string, name: string, value: string): SpxTemplate {
  const node = artworkNode(template, selector), range = artworkRange(template.html, node);
  const opening = template.html.slice(range.start, range.content);
  const escaped = value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const pattern = new RegExp('\\s' + name + '\\s*=\\s*(?:"[^"]*"|\x27[^\x27]*\x27|[^\\s>]+)', 'i');
  const replacement = ' ' + name + '="' + escaped + '"';
  const patched = pattern.test(opening) ? opening.replace(pattern, replacement) : opening.replace(/\s*\/?>$/, replacement + (opening.endsWith('/>') ? ' />' : '>'));
  return { ...template, html: template.html.slice(0, range.start) + patched + template.html.slice(range.content) };
}
export function replaceGraphicImage(template: SpxTemplate, selector: string, path: string, box?: { width: number; height: number }): SpxTemplate {
  imageAsset(template, path);
  const capability = imageCapability(template, selector);
  if (!capability.supported) throw new Error(capability.reason);
  const node = artworkNode(template, selector), svg = node.tagName.toLowerCase() === 'image';
  const field = template.fields.find(f => f.field === node.id);
  const binding = field ? { ...template, fields: template.fields.map(f => f.field === field.field ? { ...f, extension: path.split('.').pop()!, assetfolder: './' + path.slice(0, path.lastIndexOf('/') + 1) } : f) } : template;
  let next = field ? setFieldDefault(binding, field.field, path) : template;
  next = attribute(next, selector, svg ? 'href' : 'src', path);
  if (svg) {
    if (node.hasAttribute('xlink:href')) next = attribute(next, selector, 'xlink:href', path);
    next = attribute(next, selector, 'preserveAspectRatio', 'xMidYMid meet');
  } else {
    let style = (node as HTMLElement).style;
    // Keep the authored slot; a raster artwork with height:auto needs its current box pinned.
    if (box) {
      if (![box.width, box.height].every(n => Number.isFinite(n) && n > 0 && n <= 100000)) throw new Error('Wait for the image box to render before replacing it.');
      const doc = new DOMParser().parseFromString('<div></div>', 'text/html');
      const holder = doc.body.firstElementChild as HTMLElement;
      holder.setAttribute('style', node.getAttribute('style') ?? ''); style = holder.style;
      style.setProperty('width', box.width + 'px'); style.setProperty('height', box.height + 'px');
    }
    style.setProperty('object-fit', 'contain');
    next = attribute(next, selector, 'style', style.cssText);
    next = { ...next, css: setCssDeclaration(next.css, selector, 'object-fit', 'contain') };
  }
  return next;
}

export function placeGraphicImage(template: SpxTemplate, path: string, geometry: { x: number; y: number; width: number; height: number }, time: number) {
  imageAsset(template, path);
  if (![geometry.x, geometry.y, geometry.width, geometry.height, time].every(n => Number.isFinite(n) && Math.abs(n) <= 100000) || geometry.width <= 0 || geometry.height <= 0 || time < 0) throw new Error('Use a positive finite image size and placement time.');
  const parent = creationParent(template);
  const added = addPlacedImageSlot(template, { title: 'Image' });
  let next = added?.template ?? template;
  let fieldId = added?.fieldId ?? nextFieldId(next.fields);
  if (!added) {
    const doc = new DOMParser().parseFromString(next.html, 'text/html');
    while (doc.getElementById(fieldId) || doc.getElementById('fw' + fieldId.slice(1))) fieldId = 'f' + (Number(fieldId.slice(1)) + 1);
  }
  const wrapper = 'fw' + fieldId.slice(1), selector = '#' + fieldId;
  if (added) {
    const node = new DOMParser().parseFromString(next.html, 'text/html').getElementById(wrapper)!;
    const range = artworkRange(next.html, node), markup = next.html.slice(range.start, range.end);
    next = { ...next, html: insertArtworkChild(next.html.slice(0, range.start) + next.html.slice(range.end), parent, markup) };
  } else {
    if (new DOMParser().parseFromString(next.html, 'text/html').getElementById(wrapper)) throw new Error('The new image wrapper identifier is already used.');
    next = { ...next, html: insertArtworkChild(next.html, parent, '\n<!-- Editable image slot -->\n<div id="' + wrapper + '"><img id="' + fieldId + '" data-gfx alt="" /></div>'),
      css: appendCss(next.css, 'Image slot; position and size in root pixels.', '#' + wrapper + ' { position: absolute; left: 0px; top: 0px; width: 120px; height: 120px; overflow: hidden; }\n' + selector + ' { display: block; width: 100%; height: 100%; object-fit: contain; }') };
    next = addFieldToDefinition(next, { field: fieldId, ftype: 'filelist', title: 'Image', value: '', assetfolder: './images/', extension: path.split('.').pop()! });
    next = addLayer(next, { id: fieldId, type: 'image', label: 'Image', fieldId, styles: {} });
  }
  next = placeLine(next, wrapper, geometry.x, geometry.y, false);
  next = setSlotSize(next, wrapper, geometry.width, geometry.height, false);
  next = { ...next, css: setCssDeclaration(next.css, '#' + wrapper, 'transform-origin', '50% 50%') };
  next = replaceGraphicImage(next, selector, path);
  const data = losslessAnimData(next.js);
  if (!data) throw new Error('This source has no supported layer timeline that the writer can preserve exactly. Its code is preserved.');
  const stored = Math.round(time * data.speed * 1000) / 1000;
  let elapsed = 0;
  const steps = data.steps.map(step => {
    const duration = step.duration, local = Math.max(0, stored - elapsed);
    // The format stores positive intervals at millisecond precision. At an arriving hold,
    // include its last stored millisecond so the new layer is visible at the held endpoint.
    const start = Math.abs(local - duration) < 1e-6 ? Math.max(0, duration - .001) : local;
    elapsed += duration;
    return { ...step, layers: { ...step.layers, [selector]: { opacity: [{ time: 0, value: 1, ease: 'none' }] } },
      spans: { ...step.spans, [selector]: start >= duration ? [] : [{ start, end: duration }] } };
  });
  const js = spliceAnimData(next.js, { ...data, steps });
  if (js === null) throw new Error('The layer timeline cannot be preserved.');
  return { template: { ...next, js }, selector };
}
