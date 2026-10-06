import type { SpxTemplate } from '../model/types';
import { artworkNode, artworkRange, removeArtworkFields } from './artworkEdits';
import { placedLines } from './designLayout';
import { locateAnimData } from './animData';
import { addFieldToDefinition } from './edit';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function artworkLayerNode(template: SpxTemplate, selector: string) {
  const node = artworkNode(template, selector);
  const placed = placedLines(template.html, template.css)[selector];
  const wrapper = placed ? node.ownerDocument.getElementById(placed.wrapperId) : null;
  // Catalog masks belong to their sole text line, not to the surrounding panel.
  const mask = node.parentElement;
  let target = wrapper ?? (mask?.className && typeof mask.className === 'string' && /(?:^|\s)[\w-]+-mask(?:\s|$)/.test(mask.className) && mask.children.length === 1 ? mask : node);
  while (target.parentElement?.hasAttribute('data-noacg-carrier') && target.parentElement.children.length === 1) target = target.parentElement;
  if (!target.parentElement || target.closest('defs') || target === node.ownerDocument.body || /-box$/.test(target.className?.toString() ?? '')) throw new Error('Select an artwork layer inside the graphic, not its container.');
  return target;
}

export function reorderArtwork(template: SpxTemplate, selector: string, direction: 'forward' | 'backward'): SpxTemplate {
  const node = artworkLayerNode(template, selector);
  const sibling = direction === 'forward' ? node.nextElementSibling : node.previousElementSibling;
  if (!sibling || ['script', 'style', 'defs'].includes(sibling.tagName.toLowerCase())) return template;
  const a = artworkRange(template.html, node), b = artworkRange(template.html, sibling);
  const first = a.start < b.start ? a : b, last = a.start < b.start ? b : a;
  const html = template.html.slice(0, first.start) + template.html.slice(last.start, last.end) +
    template.html.slice(first.end, last.start) + template.html.slice(first.start, first.end) + template.html.slice(last.end);
  return { ...template, html };
}

/** References in handwritten behavior are not guessed. Known animation data is patched as
 * raw JSON, retaining extensions and the existing interpreter verbatim. */
function references(template: SpxTemplate, ids: string[], markup: string) {
  const location = locateAnimData(template.js);
  const outside = (location ? template.js.slice(0, location.start) + template.js.slice(location.end) : template.js)
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, token => token.startsWith('/') ? '' : token);
  for (const id of ids) {
    if (new RegExp('["\'`][^"\'`]*?(?<![\\w-])' + escape(id) + '(?![\\w-])[^"\'`]*?["\'`]').test(outside)) throw new Error('This layer is referenced by custom behavior. Keep it or edit that behavior in source first.');
    const rest = template.html.replace(markup, '') + template.css;
    if (new RegExp('(?:href=["\']#|url\\(["\']?#)' + escape(id) + '(?:["\')])').test(rest)) throw new Error('Other artwork references this layer. Remove that reference before changing its structure.');
  }
  if (location) {
    const raw = JSON.parse(template.js.slice(location.start, location.end));
    const inspect = (value: unknown, parent = '') => {
      if (Array.isArray(value)) { value.forEach(v => inspect(v, parent)); return; }
      if (value && typeof value === 'object') { Object.entries(value).forEach(([k, v]) => inspect(v, k)); return; }
      if (typeof value === 'string' && ids.some(id => new RegExp('(?<![\\w-])' + escape(id) + '(?![\\w-])').test(value)) && !['reveals', 'hides'].includes(parent)) {
        throw new Error('Animation behavior refers to this layer outside ordinary tracks. Preserve it or edit that reference in source.');
      }
    };
    inspect(raw);
  }
  return location;
}

function editMotion(template: SpxTemplate, mapping: Map<string, string>, remove: boolean): string {
  const location = locateAnimData(template.js);
  if (!location) return template.js;
  const raw = JSON.parse(template.js.slice(location.start, location.end));
  const replace = (s: string) => {
    for (const [old, next] of mapping) s = s.replace(new RegExp('#' + escape(old) + '(?![\\w-])', 'g'), '#' + next);
    return s;
  };
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.flatMap(item => {
      if (typeof item === 'string' && replace(item) !== item) return remove ? [] : [item, replace(item)];
      return [visit(item)];
    });
    if (value && typeof value === 'object') {
      const result: Record<string, unknown> = Object.create(null);
      for (const [key, entry] of Object.entries(value)) {
        const changed = replace(key);
        if (changed !== key) {
          if (!remove) { result[key] = entry; result[changed] = structuredClone(entry); }
        } else result[key] = visit(entry);
      }
      return result;
    }
    return value;
  };
  const next = visit(raw);
  if (JSON.stringify(next) === JSON.stringify(raw)) return template.js;
  return template.js.slice(0, location.start) + JSON.stringify(next, null, 2) + template.js.slice(location.end);
}

function layerCss(css: string, mapping: Map<string, string>, remove: boolean) {
  return css.replace(/([^{}]+)\{([^{}]*)\}/g, (rule, prelude: string, body: string) => {
    const selectors = prelude.replace(/\/\*[\s\S]*?\*\//g, '').trim().split(',');
    const changed = (selector: string) => [...mapping.keys()].some(id => new RegExp('#' + escape(id) + '(?![\\w-])').test(selector));
    if (!selectors.some(changed)) return rule;
    if (selectors.some(s => changed(s) && /[()]/.test(s))) throw new Error('This layer has relational CSS selectors. Edit its structure in source to preserve those rules.');
    if (remove) {
      const retained = selectors.filter(s => !changed(s));
      return retained.length ? retained.join(',') + ' {' + body + '}' : '';
    }
    const copies = selectors.filter(changed).map(selector => {
      for (const [old, next] of mapping) selector = selector.replace(new RegExp('#' + escape(old) + '(?![\\w-])', 'g'), '#' + next);
      return selector;
    });
    // Keep cascade order and never repeat unrelated selectors at the end of the sheet.
    return rule + '\n/* Duplicated artwork appearance. */\n' + copies.join(',') + ' {' + body + '}';
  });
}

export function changeArtworkLayer(template: SpxTemplate, selector: string, action: 'duplicate' | 'delete') {
  const node = artworkLayerNode(template, selector), range = artworkRange(template.html, node);
  const markup = template.html.slice(range.start, range.end);
  if (node.matches('[data-noacg-role], [data-noacg-el]') || node.querySelector('[data-noacg-role], [data-noacg-el]')) throw new Error('This layer belongs to a behavior or responsive layout. Keep its structural bindings intact.');
  const ids = [node, ...node.querySelectorAll('[id]')].map(n => n.id).filter(Boolean);
  if (!ids.length || !selector.startsWith('#')) throw new Error('This structural edit requires a layer with a stable ID.');
  if (ids.some(id => node.ownerDocument.querySelectorAll('#' + CSS.escape(id)).length !== 1)) throw new Error('Resolve duplicate source IDs before editing this layer.');
  references(template, ids, markup);
  if (action === 'duplicate') {
    const inlineSheets = [...node.ownerDocument.querySelectorAll('style')].map(s => s.textContent ?? '').join('\n');
    if (ids.some(id => inlineSheets.includes('#' + id))) throw new Error('This layer has ID rules inside the artwork. Duplicate it in source to retain those rules.');
    if (/@(?:media|supports|container|layer)\b/.test(template.css) && ids.some(id => template.css.includes('#' + id))) throw new Error('This layer has conditional CSS. Duplicate it in source to retain those conditions.');
  }
  const mapping = new Map<string, string>();
  for (const id of ids) {
    let n = 1, next = /^f\d+$/.test(id) ? 'f' + n : id + '-copy-' + n;
    while (node.ownerDocument.getElementById(next) || template.fields.some(f => f.field === next) || [...mapping.values()].includes(next)) {
      n++; next = /^f\d+$/.test(id) ? 'f' + n : id + '-copy-' + n;
    }
    mapping.set(id, next);
  }
  if (action === 'delete') return { template: removeArtworkFields({ ...template,
    html: template.html.slice(0, range.start) + template.html.slice(range.end), css: layerCss(template.css, mapping, true), js: editMotion(template, mapping, true) }, ids), selector };
  let copy = markup;
  for (const [old, next] of mapping) {
    copy = copy.replace(new RegExp('(\\s+id\\s*=\\s*["\'])' + escape(old) + '(["\'])', 'g'), '$1' + next + '$2')
      .replace(new RegExp('#' + escape(old) + '(?![\\w-])', 'g'), '#' + next);
  }
  let next = { ...template, html: template.html.slice(0, range.end) + '\n' + copy + template.html.slice(range.end),
    css: layerCss(template.css, mapping, false), js: editMotion(template, mapping, false) };
  for (const field of template.fields.filter(f => mapping.has(f.field))) next = addFieldToDefinition(next, { ...field, field: mapping.get(field.field)!, title: field.title + ' copy' });
  next = { ...next, layers: [...next.layers, ...template.layers.filter(l => mapping.has(l.id)).map(l => ({ ...l, id: mapping.get(l.id)!, ...(l.fieldId ? { fieldId: mapping.get(l.fieldId) ?? l.fieldId } : {}) }))] };
  return { template: next, selector: '#' + mapping.get(selector.slice(1)) };
}
