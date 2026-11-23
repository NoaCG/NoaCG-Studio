import type { SpxField, SpxTemplate } from '../model/types';
import { definitionScriptBlock, serializeDefinition } from '../model/spxDefinition';
import { artworkRange } from './artworkEdits';
import { BEHAVIOUR_ROLE_ATTR, parseBehaviourData } from './behaviourData';
import { setFieldDefault } from './edit';

export interface PublicTextDefault { id: string; label: string; value: string }
export interface PublicTextDefaults {
  candidates: PublicTextDefault[];
  get(id: string): PublicTextDefault | null;
  write(id: string, value: string): SpxTemplate;
}
const REASON = 'This public text default cannot be changed without rewriting unsupported source.';
const textId = (id: string) => /^f[0-9]+$/.test(id) && id.length <= 200;
const escapeText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ownData = (value: object) => Object.values(Object.getOwnPropertyDescriptors(value)).every(d => 'value' in d);
const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value)) && ownData(value);
const keys = (value: object, allowed: readonly string[]) => Object.keys(value).every(k => allowed.includes(k));
const settingKeys = ['description', 'playserver', 'playchannel', 'playlayer', 'webplayout', 'out', 'steps', 'dataformat', 'uicolor'];
const fieldKeys = ['field', 'ftype', 'title', 'value', 'prvar', 'items', 'assetfolder', 'extension', 'fcall', 'descr'];
function supportedData(template: SpxTemplate) {
  if (!ownData(template) || !plain(template.settings) || !keys(template.settings, settingKeys) ||
    !settingKeys.every(k => typeof (template.settings as unknown as Record<string, unknown>)[k] === 'string')) throw Error(REASON);
  const ids = new Set<string>();
  for (const field of template.fields) {
    if (!plain(field) || !keys(field, fieldKeys) || !['field', 'ftype', 'title', 'value'].every(k => typeof field[k] === 'string') || ids.has(field.field)) throw Error(REASON);
    ids.add(field.field);
    for (const key of ['prvar', 'assetfolder', 'extension', 'fcall', 'descr']) if (field[key] !== undefined && typeof field[key] !== 'string') throw Error(REASON);
    if (field.items !== undefined && (!Array.isArray(field.items) || !field.items.every(item => plain(item) && keys(item, ['text', 'value']) && typeof item.text === 'string' && typeof item.value === 'string'))) throw Error(REASON);
  }
}
interface Range { start: number; end: number; text: string }
// DOMParser disables scripting: noscript can manufacture apparent nodes, including
// across template boundaries. Refuse the entire dependent shape, also in inert content.
function scriptingDependent(root: Document | DocumentFragment): boolean {
  return !!root.querySelector('noscript') || [...root.querySelectorAll('template')].some(node =>
    node.namespaceURI === 'http://www.w3.org/1999/xhtml' && scriptingDependent((node as HTMLTemplateElement).content));
}
const scriptsAgree = (doc: Document, definition: Element) => [...doc.scripts].every(script => script === definition || !script.textContent?.trim());
function replaceRanges(html: string, ranges: Range[]) {
  return [...ranges].sort((a, b) => b.start - a.start).reduce((source, r) => source.slice(0, r.start) + r.text + source.slice(r.end), html);
}

/** One ephemeral, read-only source context per request; no identities or scene are cached. */
export function publicTextDefaults(template: SpxTemplate): PublicTextDefaults {
  const unavailable: PublicTextDefaults = { candidates: [], get: () => null, write: () => { throw Error(REASON); } };
  try {
    supportedData(template);
    const doc = new DOMParser().parseFromString(template.html, 'text/html');
    if (scriptingDependent(doc)) return unavailable;
    const ids = new Map<string, Element[]>();
    for (const node of doc.querySelectorAll('[id]')) ids.set(node.id, [...(ids.get(node.id) ?? []), node]);
    const definitions = ids.get('spx-template-definition') ?? [];
    const definition = definitions[0];
    if (definitions.length !== 1 || definition.tagName !== 'SCRIPT' || definition.attributes.length !== 2 ||
      definition.getAttribute('type') !== 'text/javascript' || !scriptsAgree(doc, definition)) return unavailable;
    const open = '<script id="spx-template-definition" type="text/javascript">';
    const start = template.html.indexOf(open), endTag = template.html.indexOf('</script>', start + open.length);
    if (start < 0 || endTag < 0 || template.html.indexOf(open, start + 1) !== -1) return unavailable;
    const end = endTag + '</script>'.length;
    if (definition.outerHTML !== template.html.slice(start, end)) return unavailable;
    const payload = template.html.slice(start + open.length, endTag), lines = payload.split('\n');
    if (lines.length < 3 || lines[0] !== '' || !/^ *$/.test(lines[lines.length - 1])) return unavailable;
    const indent = /^ */.exec(lines[1])![0], closingIndent = lines[lines.length - 1];
    if (!lines.slice(1, -1).every(line => line.startsWith(indent))) return unavailable;
    const serialized = (fields: SpxField[]) => serializeDefinition(template.settings, fields).replace(/</g, '\\u003c');
    if (lines.slice(1, -1).map(line => line.slice(indent.length)).join('\n') !== serialized(template.fields)) return unavailable;
    const renderPayload = (fields: SpxField[]) => '\n' + serialized(fields).split('\n').map(line => indent + line).join('\n') + '\n' + closingIndent;
    const renderDefinition = (fields: SpxField[]) => open + renderPayload(fields) + '</script>';
    const behavior = parseBehaviourData(template.js);
    const nodes = new Map<string, Element>();
    const candidates = template.fields.flatMap(field => {
      const matches = ids.get(field.field) ?? [], node = matches[0];
      if (!textId(field.field) || !['textfield', 'textarea'].includes(field.ftype) || field.value.length > 10000 ||
        field.prvar !== undefined || field.fcall !== undefined || matches.length !== 1 ||
        !['SPAN', 'DIV'].includes(node.tagName) || !doc.body.contains(node) || node.children.length ||
        node.textContent !== field.value || ids.has(field.field + '_gfx')) return [];
      for (let parent: Element | null = node; parent; parent = parent.parentElement) {
        if (parent.matches('[hidden], .noacg-data-source, [data-noacg-hidden="true"]') ||
          /(?:^|\s)[\w-]+-(?:clock|credits)(?:\s|$)/.test(parent.getAttribute('class') ?? '') ||
          (parent as HTMLElement).style?.display === 'none' || (parent as HTMLElement).style?.visibility === 'hidden') return [];
        const roles = (parent.getAttribute(BEHAVIOUR_ROLE_ATTR) ?? '').split(/\s+/).map(role => role.split('/')[0]);
        if (behavior?.paint.some(rule => ('write' in rule && roles.includes(rule.write)) || ('crawl' in rule && roles.includes(rule.crawl)))) return [];
      }
      nodes.set(field.field, node);
      return [{ id: field.field, label: field.title, value: field.value }];
    });
    const qualified = new Map<string, PublicTextDefault | null>();
    const writers = new Map<string, (value: string) => SpxTemplate>();
    const get = (id: string): PublicTextDefault | null => {
      if (qualified.has(id)) return qualified.get(id)!;
      qualified.set(id, null);
      const info = candidates.find(field => field.id === id), node = nodes.get(id);
      if (!info || !node) return null;
      try {
        const range = artworkRange(template.html, node), opening = template.html.slice(range.start, range.content);
        const tag = node.tagName.toLowerCase();
        if (!new RegExp('^<' + tag + '(?:\\s+(?:id|class)="[A-Za-z0-9_ -]*")*\\s*>$').test(opening) ||
          [...opening.matchAll(/\s+id="/g)].length !== 1 || [...opening.matchAll(/\s+class="/g)].length > 1 ||
          template.html.slice(range.close, range.end) !== '</' + tag + '>' ||
          template.html.slice(range.content, range.close) !== escapeText(info.value) ||
          (range.start < end && range.end > start)) return null;
        // Raw ranges can agree on a comment or inert twin. Independently require the
        // actual document nodes to change, without relying on those range candidates.
        const assertActualNodes = (html: string, value: string, fields: SpxField[]) => {
          const output = new DOMParser().parseFromString(html, 'text/html');
          if (scriptingDependent(output)) throw Error(REASON);
          const definitions = output.querySelectorAll('[id="spx-template-definition"]');
          const leaves = output.querySelectorAll('[id="' + id + '"]');
          if (definitions.length !== 1 || leaves.length !== 1 || !output.body.contains(leaves[0]) ||
            !scriptsAgree(output, definitions[0])) throw Error(REASON);
          const expectedDefinition = definition.cloneNode(false), expectedLeaf = node.cloneNode(false);
          expectedDefinition.textContent = renderPayload(fields); expectedLeaf.textContent = value;
          if (!expectedDefinition.isEqualNode(definitions[0]) || !expectedLeaf.isEqualNode(leaves[0])) throw Error(REASON);
        };
        const write = (value: string) => {
          const fields = template.fields.map(field => field.field === id ? { ...field, value } : field);
          const candidate = setFieldDefault(template, id, value);
          const canonical = definitionScriptBlock(template.settings, fields), at = candidate.html.indexOf(canonical);
          if (at < 0 || candidate.html.indexOf(canonical, at + 1) !== -1) throw Error(REASON);
          const html = candidate.html.slice(0, at) + renderDefinition(fields) + candidate.html.slice(at + canonical.length);
          const expected = replaceRanges(template.html, [{ start, end, text: renderDefinition(fields) },
            { start: range.content, end: range.close, text: escapeText(value) }]);
          if (html !== expected || JSON.stringify(candidate.fields) !== JSON.stringify(fields) ||
            Object.entries(template).some(([key, old]) => key !== 'html' && key !== 'fields' && !Object.is((candidate as unknown as Record<string, unknown>)[key], old))) throw Error(REASON);
          assertActualNodes(html, value, fields);
          return { ...candidate, html };
        };
        const noop = write(info.value);
        if (noop.html !== template.html || JSON.stringify(noop.fields) !== JSON.stringify(template.fields)) return null;
        const sentinel = info.value === 'NoaCG <&> "field"\nproof' ? 'NoaCG other proof' : 'NoaCG <&> "field"\nproof';
        write(sentinel);
        qualified.set(id, info); writers.set(id, write);
        return info;
      } catch { return null; }
    };
    return { candidates, get, write(id, value) {
      if (typeof value !== 'string' || value.length > 10000 || !get(id)) throw Error(REASON);
      if (value === qualified.get(id)!.value) return template;
      return writers.get(id)!(value);
    } };
  } catch { return unavailable; }
}
