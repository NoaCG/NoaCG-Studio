import type { SpxTemplate } from '../model/types';
import { getTemplateParts } from '../model/structure';
import { FONTS, fontStack, ensureFontFace } from '../model/fonts';
import { setCssDeclaration, setFieldDefault } from './edit';
import { lineFontSize, setLineTextStyle } from './designLayout';
import { replaceDefinitionInHtml } from '../model/spxDefinition';
import { BEHAVIOUR_ROLE_ATTR, parseBehaviourData } from './behaviourData';
import { parseAnimData } from './animData';

export function artworkNode(template: SpxTemplate, selector: string): Element {
  const doc = new DOMParser().parseFromString(template.html, 'text/html');
  const nodes = doc.querySelectorAll(selector);
  if (nodes.length !== 1 || !getTemplateParts(template.html, template.fields).some(p => p.selector === selector)) {
    throw new Error('Select a uniquely addressable artwork layer.');
  }
  return nodes[0];
}

/** Match source offsets to the parsed node, without serializing unrelated artwork. */
export function artworkRange(html: string, node: Element) {
  const tag = node.tagName.toLowerCase();
  const peers = [...node.ownerDocument.getElementsByTagName(tag)];
  const ordinal = peers.indexOf(node);
  const tokens = /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<\/?([\w:-]+)\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi;
  let seen = -1, depth = 0, start = -1, content = -1;
  const verified = (close: number, end: number) => {
    const snippet = html.slice(start, end);
    const holder = node.ownerDocument.createElement('template');
    holder.innerHTML = node.namespaceURI === 'http://www.w3.org/2000/svg' ? '<svg>' + snippet + '</svg>' : snippet;
    const parsed = node.namespaceURI === 'http://www.w3.org/2000/svg' ? holder.content.firstElementChild?.firstElementChild : holder.content.firstElementChild;
    if (!parsed?.isEqualNode(node)) throw new Error('This markup has an ambiguous source range. Edit it in source to preserve the document.');
    return { start, content, close, end };
  };
  for (const match of html.matchAll(tokens)) {
    if (match[2]?.toLowerCase() !== tag) continue;
    const close = match[0].startsWith('</');
    if (!close) {
      seen++;
      if (seen === ordinal) {
        start = match.index; content = start + match[0].length;
        if (/\/>$/.test(match[0]) || /^(img|br|hr|input)$/.test(tag)) return verified(content, content);
        depth = 1; continue;
      }
    }
    if (start >= 0) {
      depth += close ? -1 : /\/>$/.test(match[0]) ? 0 : 1;
      if (!depth) return verified(match.index, match.index + match[0].length);
    }
  }
  throw new Error('This source cannot be patched without rewriting its markup.');
}

export function artworkText(template: SpxTemplate, selector: string) {
  const node = artworkNode(template, selector);
  if (!['span', 'div', 'text', 'tspan'].includes(node.tagName.toLowerCase()) || node.children.length) return null;
  const field = template.fields.find(f => f.field === node.id);
  if (!field && !node.textContent?.trim()) return null;
  if (field && !['textfield', 'textarea'].includes(field.ftype)) return null;
  if (/(?:^|\s)[\w-]+-(?:clock|credits)(?:\s|$)/.test(node.getAttribute('class') ?? '')) return null;
  const behavior = parseBehaviourData(template.js);
  const roles = (node.getAttribute(BEHAVIOUR_ROLE_ATTR) ?? '').split(/\s+/).map(role => role.split('/')[0]);
  if (behavior?.paint.some(rule => 'write' in rule && roles.includes(rule.write))) return null;
  return { text: field ? String(field.value ?? '') : (node.textContent ?? '').trim(), field: field?.field ?? null };
}

export function editArtworkText(template: SpxTemplate, selector: string, text: string): SpxTemplate {
  if (typeof text !== 'string' || text.length > 10000) throw new Error('Use at most 10,000 characters.');
  const info = artworkText(template, selector);
  if (!info) throw new Error('Select a plain text layer. Outlined, styled runs and driven values retain their source.');
  let next = info.field ? setFieldDefault(template, info.field, text) : template;
  const node = artworkNode(next, selector), range = artworkRange(next.html, node);
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  next = { ...next, html: next.html.slice(0, range.content) + escaped + next.html.slice(range.close) };
  return next;
}

export interface ArtworkStyle { fontId?: string; fontSize?: number; color?: string; fill?: string; opacity?: number }
export function editArtworkStyle(template: SpxTemplate, selector: string, patch: ArtworkStyle): SpxTemplate {
  const node = artworkNode(template, selector), text = artworkText(template, selector);
  const svg = node.namespaceURI === 'http://www.w3.org/2000/svg';
  if (!Object.keys(patch).length) throw new Error('Choose an appearance change.');
  if ((patch.fontId !== undefined || patch.fontSize !== undefined || patch.color !== undefined) && !text) throw new Error('Typography requires a plain text layer.');
  if (patch.fontSize !== undefined && (!Number.isFinite(patch.fontSize) || patch.fontSize < 1 || patch.fontSize > 2000)) throw new Error('Font size must be between 1 and 2000.');
  if (patch.opacity !== undefined) {
    if (!Number.isFinite(patch.opacity) || patch.opacity < 0 || patch.opacity > 1) throw new Error('Opacity must be between 0 and 100%.');
    const motion = parseAnimData(template.js);
    if (motion && (node.matches(motion.root) || motion.steps.some(step => Object.entries(step.layers).some(([target, tracks]) => node.matches(target) && ('opacity' in tracks || 'autoAlpha' in tracks))))) {
      throw new Error('Opacity is animated on this layer. Preserve that motion or change its animation in source.');
    }
  }
  for (const color of [patch.color, patch.fill]) if (color !== undefined && !/^#[\da-f]{6}$/i.test(color)) throw new Error('Choose a solid six-digit hex colour.');
  if (patch.fill !== undefined && (text || !['div', 'rect', 'ellipse', 'circle', 'path', 'polygon'].includes(node.tagName.toLowerCase()))) throw new Error('Select a solid shape to change its fill.');
  const properties = [patch.fontId !== undefined && 'font-family', patch.fontSize !== undefined && 'font-size', patch.color !== undefined && (svg ? 'fill' : 'color'), patch.fill !== undefined && (svg ? 'fill' : 'background'), patch.opacity !== undefined && 'opacity'].filter(Boolean) as string[];
  if (properties.some(prop => (node as HTMLElement).style.getPropertyValue(prop))) throw new Error('This layer has inline appearance rules. Edit its source to preserve their priority.');
  let next = template;
  if (!svg && text) next = setLineTextStyle(next, node.id, patch) ?? next;
  let css = next.css;
  if (patch.fontId !== undefined) {
    const font = FONTS.find(f => f.id === patch.fontId);
    if (!font) throw new Error('Choose an available bundled font.');
    css = ensureFontFace(setCssDeclaration(css, selector, 'font-family', fontStack(font)), font);
  }
  if (patch.fontSize !== undefined) {
    const scaled = !svg && lineFontSize(template.css, node.id)?.scaled;
    css = setCssDeclaration(css, selector, 'font-size', scaled ? `calc(${patch.fontSize}px * var(--scale))` : patch.fontSize + 'px');
  }
  if (patch.color !== undefined) css = setCssDeclaration(css, selector, svg ? 'fill' : 'color', patch.color);
  if (patch.fill !== undefined) css = setCssDeclaration(css, selector, svg ? 'fill' : 'background', patch.fill);
  if (patch.opacity !== undefined) css = setCssDeclaration(css, selector, 'opacity', String(patch.opacity));
  return { ...next, css };
}

export function removeArtworkFields(template: SpxTemplate, ids: string[]): SpxTemplate {
  const fields = template.fields.filter(f => !ids.includes(f.field));
  return { ...template, fields, html: replaceDefinitionInHtml(template.html, template.settings, fields),
    layers: template.layers.filter(layer => !ids.includes(layer.id)) };
}
