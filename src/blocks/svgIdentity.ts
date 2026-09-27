import type { SpxTemplate } from '../model/types';
import { artworkNode, artworkRange } from './artworkEdits';

/** Mint only for a committed edit, without serializing the surrounding SVG. */
export function commitSvgIdentity(template: SpxTemplate, selector: string) {
  if (!selector.startsWith('body:nth-of-type(')) return { template, selector };
  const node = artworkNode(template, selector);
  if (node.namespaceURI !== 'http://www.w3.org/2000/svg') return { template, selector };
  const doc = node.ownerDocument;
  const attributes = [...doc.querySelectorAll('*')].flatMap(element => [...element.attributes]);
  const markupValues = attributes.map(attribute => attribute.value).join('\n');
  const styles = template.css + [...doc.querySelectorAll('style')].map(style => style.textContent).join('\n');
  // CSSOM normalizes hexadecimal identifier escapes. Read it only; never emit it.
  const sheet = new CSSStyleSheet(); sheet.replaceSync(styles);
  const normalizedStyles = [...sheet.cssRules].map(rule => rule.cssText).join('\n');
  // Adding an ID can also activate [id] or substring rules on an unnamed node.
  if (/\[\s*id\s*(?:[~|^$*]?=|\])/i.test(normalizedStyles)) {
    throw new Error('ID-sensitive CSS references prevent safely assigning this artwork an identity; nothing changed.');
  }
  if (node.id) {
    const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escaped = escape(node.id);
    const reference = new RegExp('#(?:' + [node.id, CSS.escape(node.id), encodeURIComponent(node.id)].map(escape).join('|') + ')(?![\\w-])');
    const scriptReference = new RegExp('["\'`][^"\'`]*?(?<![\\w-])' + escaped + '(?![\\w-])[^"\'`]*?["\'`]');
    const idList = attributes.some(attribute => /^(?:for|aria-labelledby|aria-describedby|aria-controls|aria-owns|aria-activedescendant)$/.test(attribute.name) && attribute.value.split(/\s+/).includes(node.id));
    if (reference.test(template.html + template.css + template.js + markupValues + normalizedStyles) || idList || scriptReference.test(template.js) || template.fields.some(field => field.field === node.id)) {
      throw new Error('This duplicate or nonstandard ID has possible references. Resolve its identity in source before editing; nothing changed.');
    }
  }
  let index = 1;
  // A dangling reference must stay dangling, rather than acquiring this new target.
  const reserved = [template.html, template.css, template.js, markupValues, normalizedStyles].join('\n').replace(/%([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  while (doc.getElementById('artwork-' + index) || reserved.includes('artwork-' + index)) index++;
  const id = 'artwork-' + index;
  const range = artworkRange(template.html, node);
  const opening = template.html.slice(range.start, range.content);
  const attribute = /\s+id\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i;
  const changed = node.hasAttribute('id') ? opening.replace(attribute, ' id="' + id + '"')
    : opening.replace(/\s*\/?>$/, end => ' id="' + id + '"' + end);
  if (changed === opening) throw new Error('The artwork ID cannot be patched safely.');
  return { template: { ...template, html: template.html.slice(0, range.start) + changed + template.html.slice(range.content) }, selector: '#' + id };
}
