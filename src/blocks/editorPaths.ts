import type { SpxTemplate } from '../model/types';
import { artworkNode, artworkRange } from './artworkEdits';
import { creationParent, insertArtworkChild, precise } from './baseEdits';
import { appendCss } from './edit';
import { losslessAnimData, spliceAnimData } from './animData';
import { parsePath, pathBounds, pathSource, validatePath, type PathGeometry } from './pathGeometry';

export function pathNode(template: SpxTemplate, selector: string): Element | null {
  const node = artworkNode(template, selector);
  return node.tagName.toLowerCase() === 'path' ? node : node.hasAttribute('data-pen-path') ? node.querySelector(':scope > svg > path') : null;
}
function cssOwns(template: SpxTemplate, node: Element, property: string) {
  const sheet = new CSSStyleSheet(); sheet.replaceSync(template.css + '\n' + [...node.ownerDocument.querySelectorAll('style')].map(style => style.textContent).join('\n'));
  const inline = (node as SVGElement).style;
  const animations = (rules: CSSRuleList): string[] => [...rules].flatMap(rule => rule instanceof CSSStyleRule
    ? node.matches(rule.selectorText) ? rule.style.animationName.split(',') : [] : rule instanceof CSSGroupingRule ? animations(rule.cssRules) : []);
  const names = new Set([...inline.animationName.split(','), ...animations(sheet.cssRules)].map(name => name.trim()));
  const visit = (rules: CSSRuleList): boolean => [...rules].some(rule => rule instanceof CSSStyleRule
    ? node.matches(rule.selectorText) && !!rule.style.getPropertyValue(property)
    : rule instanceof CSSKeyframesRule && names.has(rule.name) ? [...rule.cssRules].some(frame => !!(frame as CSSKeyframeRule).style.getPropertyValue(property))
    : rule instanceof CSSGroupingRule && visit(rule.cssRules));
  return !!inline.getPropertyValue(property) || visit(sheet.cssRules);
}
export function inspectPath(template: SpxTemplate, selector: string) {
  const node = pathNode(template, selector);
  if (!node) return null;
  let geometry: PathGeometry | null, reason = '';
  try {
    for (let ancestor: Element | null = node; ancestor?.namespaceURI === 'http://www.w3.org/2000/svg'; ancestor = ancestor.parentElement) {
      if (['scale', 'rotate', 'translate'].some(property => cssOwns(template, ancestor!, property))) throw new Error('This path has independent SVG scale, rotation or translation that point editing cannot measure exactly. Its source is preserved.');
    }
    if (cssOwns(template, node, 'd') || node.querySelector('animate[attributeName="d"], animateMotion')) throw new Error('This path geometry is driven by CSS or SVG animation. Its source is preserved.');
    const names = [node.id, ...node.classList, selector.startsWith('#') ? selector.slice(1) : ''].filter(Boolean);
    const driven = /morphSVG|setAttribute\s*\([^)]*["']d["']|\battr\s*:|\.d\s*=/.test(template.js);
    if (driven && (!names.length || names.some(name => template.js.includes(name)))) throw new Error('This path geometry is driven by code. Its source is preserved.');
    geometry = parsePath(node.getAttribute('d') ?? '');
    artworkRange(template.html, node);
  } catch (cause) { geometry = null; reason = cause instanceof Error ? cause.message : String(cause); }
  return { geometry, reason };
}
/** Patch only an opening token. Source offsets are verified by artworkRange first. */
export function patchPathAttribute(opening: string, name: string, value: string): string {
  if (!['d', 'fill', 'stroke', 'stroke-width'].includes(name) || /["<>]/.test(value)) throw new Error('Use a supported, literal path attribute.');
  const attribute = new RegExp('(\\s' + name + '\\s*=\\s*)(["\x27])(.*?)\\2', 'gis');
  const matches = [...opening.matchAll(attribute)];
  if (matches.length > 1) throw new Error('This path has ambiguous duplicate attributes. Its source is preserved.');
  return matches.length ? opening.replace(attribute, (_match, prefix) => prefix + '"' + value + '"') : opening.replace(/\s*\/?>$/, tail => ' ' + name + '="' + value + '"' + tail);
}
function attribute(template: SpxTemplate, selector: string, name: string, value: string) {
  const node = pathNode(template, selector);
  if (!node) throw new Error('Select a single SVG path.');
  const range = artworkRange(template.html, node), opening = template.html.slice(range.start, range.content);
  const changed = patchPathAttribute(opening, name, value);
  return changed === opening ? template : { ...template, html: template.html.slice(0, range.start) + changed + template.html.slice(range.content) };
}
export function editPath(template: SpxTemplate, selector: string, geometry: PathGeometry): SpxTemplate {
  const info = inspectPath(template, selector);
  if (!info?.geometry) throw new Error(info?.reason || 'Select a single SVG path.');
  validatePath(geometry);
  if (geometry.closed !== info.geometry.closed || geometry.points.length !== info.geometry.points.length) throw new Error('Point edits retain this path topology. Draw a new path to change it.');
  if (JSON.stringify(geometry) === JSON.stringify(info.geometry)) return template;
  return attribute(template, selector, 'd', pathSource(geometry));
}
export interface PathPaint { fill?: string; stroke?: string; width?: number }
export function editPathPaint(template: SpxTemplate, selector: string, paint: PathPaint): SpxTemplate {
  const node = pathNode(template, selector);
  if (!node) throw new Error('Select a single SVG path.');
  if (!Object.values(paint).some(value => value !== undefined) || Object.keys(paint).some(key => !['fill', 'stroke', 'width'].includes(key))) throw new Error('Choose a path paint change.');
  for (const value of [paint.fill, paint.stroke]) if (value !== undefined && !/^(none|#[\da-f]{6})$/i.test(value)) throw new Error('Choose None or a solid six-digit hex colour.');
  if (paint.width !== undefined && (!Number.isFinite(paint.width) || paint.width < 0 || paint.width > 1000)) throw new Error('Stroke width must be from 0 to 1000 pixels.');
  let next = template;
  for (const [key, value] of Object.entries(paint)) {
    if (value === undefined) continue;
    const name = key === 'width' ? 'stroke-width' : key;
    if (cssOwns(template, node, name)) throw new Error('This path has CSS ' + name + ' rules. Edit its source to preserve their priority.');
    next = attribute(next, selector, name, String(value));
  }
  return next;
}
export function createPath(template: SpxTemplate, geometry: PathGeometry, time: number) {
  validatePath(geometry);
  if (!Number.isFinite(time) || time < 0 || time > 100000) throw new Error('Use a finite, nonnegative path placement time.');
  const data = losslessAnimData(template.js);
  if (!data) throw new Error('This source has no supported layer timeline that the writer can preserve exactly. Its code is preserved.');
  const parent = creationParent(template), doc = new DOMParser().parseFromString(template.html, 'text/html');
  let n = 1; while (doc.getElementById('pen-' + n)) n++;
  const selector = '#pen-' + n, box = pathBounds(geometry);
  const local = (p: { x: number; y: number }) => ({ x: precise(p.x - box.x), y: precise(p.y - box.y) });
  const points = geometry.points.map(p => ({ ...local(p), ...p.in ? { in: local(p.in) } : {}, ...p.out ? { out: local(p.out) } : {} }));
  const snippet = '\n<!-- Editable SVG path; layer transforms use its initial centered frame. -->\n<div id="' + selector.slice(1) + '" data-gfx data-pen-path><svg xmlns="http://www.w3.org/2000/svg" width="' + precise(box.width) + '" height="' + precise(box.height) + '" viewBox="0 0 ' + precise(box.width) + ' ' + precise(box.height) + '" style="display:block;overflow:visible"><path d="' + pathSource({ ...geometry, points }) + '" fill="' + (geometry.closed ? '#8bd5f6' : 'none') + '" stroke="#8bd5f6" stroke-width="3" /></svg></div>';
  const html = insertArtworkChild(template.html, parent, snippet);
  const css = appendCss(template.css, 'Path layer; geometry and transform frame are independent.', selector + ' { position: absolute; left: ' + precise(box.x) + 'px; top: ' + precise(box.y) + 'px; width: ' + precise(box.width) + 'px; height: ' + precise(box.height) + 'px; transform-origin: 50% 50%; }');
  const stored = Math.round(time * data.speed * 1000) / 1000;
  let elapsed = 0;
  const steps = data.steps.map(step => {
    const local = Math.max(0, stored - elapsed), duration = step.duration;
    const start = Math.abs(local - duration) < 1e-6 ? Math.max(0, duration - .001) : local;
    elapsed += duration;
    return { ...step, layers: { ...step.layers, [selector]: { opacity: [{ time: 0, value: 1, ease: 'none' }] } }, spans: { ...step.spans, [selector]: start >= duration ? [] : [{ start, end: duration }] } };
  });
  const js = spliceAnimData(template.js, { ...data, steps });
  if (js === null) throw new Error('The layer timeline cannot be preserved.');
  return { template: { ...template, html, css, js }, selector };
}
