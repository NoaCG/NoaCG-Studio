import type { SpxTemplate } from '../model/types';
import { artworkNode, artworkRange } from './artworkEdits';

/** Mint only for a committed edit, without serializing the surrounding SVG. */
export function commitSvgIdentity(template: SpxTemplate, selector: string) {
  if (!selector.startsWith('body:nth-of-type(')) return { template, selector };
  const node = artworkNode(template, selector);
  if (node.namespaceURI !== 'http://www.w3.org/2000/svg') return { template, selector };
  const doc = node.ownerDocument;
  if (node.id) {
    const escaped = node.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const reference = new RegExp('#' + escaped + '(?![\\w-])');
    const scriptReference = new RegExp('["\'`][^"\'`]*?(?<![\\w-])' + escaped + '(?![\\w-])[^"\'`]*?["\'`]');
    if (reference.test(template.html + template.css + template.js) || scriptReference.test(template.js) || template.fields.some(field => field.field === node.id)) {
      throw new Error('This duplicate or nonstandard ID has references. Resolve its identity in source before editing; nothing changed.');
    }
  }
  let index = 1;
  // A dangling reference must stay dangling, rather than acquiring this new target.
  while (doc.getElementById('artwork-' + index) || [template.html, template.css, template.js].some(source => source.includes('artwork-' + index))) index++;
  const id = 'artwork-' + index;
  const range = artworkRange(template.html, node);
  const opening = template.html.slice(range.start, range.content);
  const attribute = /\s+id\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i;
  const changed = node.hasAttribute('id') ? opening.replace(attribute, ' id="' + id + '"')
    : opening.replace(/\s*\/?>$/, end => ' id="' + id + '"' + end);
  if (changed === opening) throw new Error('The artwork ID cannot be patched safely.');
  return { template: { ...template, html: template.html.slice(0, range.start) + changed + template.html.slice(range.content) }, selector: '#' + id };
}
