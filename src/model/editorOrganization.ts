import type { SpxTemplate } from './types';

/** Editor organization is inert source metadata, never an artwork/animation model. */
export interface LayerFolder { id: string; name: string; scope: string | null; parent: string | null; members: string[] }
export interface EditorOrganization { version: 1; folders: LayerFolder[]; bins: string[] }
const marker = /<!-- NOACG_ORGANIZATION ([\s\S]*?) -->\r?\n?/g;
const empty = (): EditorOrganization => ({ version: 1, folders: [], bins: [] });
const keysAre = (value: object, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
export const validBin = (dir: string) => /^(images|fonts|videos|sounds|lottie|assets)\/[\w-]+(?:\/[\w-]+)*$/.test(dir);

/** Keep the inert source header opaque when rewriting artwork references. */
export function splitOrganizationHtml(html: string): [string, string] {
  const first = html.matchAll(marker).next().value;
  return first?.index === 0 ? [first[0], html.slice(first[0].length)] : ['', html];
}

/** Old documents migrate on read to empty v1. Unknown/malformed versions are read-only. */
export function readOrganization(template: Pick<SpxTemplate, 'html'>): EditorOrganization {
  const matches = [...template.html.matchAll(marker)];
  if (!matches.length) return empty();
  try {
    if (matches.length !== 1 || matches[0].index !== 0) throw new Error();
    const value = JSON.parse(matches[0][1]) as EditorOrganization;
    if (!value || value.version !== 1 || !keysAre(value, ['version', 'folders', 'bins']) ||
        !Array.isArray(value.folders) || value.folders.length > 200 || !Array.isArray(value.bins) || value.bins.length > 200 ||
        value.bins.some(dir => typeof dir !== 'string' || !validBin(dir)) || new Set(value.bins).size !== value.bins.length) throw new Error();
    const ids = new Set<string>(), members = new Set<string>();
    for (const folder of value.folders) {
      if (!folder || !keysAre(folder, ['id', 'name', 'scope', 'parent', 'members']) ||
          typeof folder.id !== 'string' || !/^folder:\d+$/.test(folder.id) || ids.has(folder.id) ||
          typeof folder.name !== 'string' || !folder.name.trim() || folder.name.length > 80 ||
          !(folder.scope === null || typeof folder.scope === 'string') || !(folder.parent === null || typeof folder.parent === 'string') ||
          !Array.isArray(folder.members) || folder.members.length > 1000 || folder.members.some(member => typeof member !== 'string' || !member || members.has(member))) throw new Error();
      ids.add(folder.id); folder.members.forEach(member => { if (members.has(member)) throw new Error(); members.add(member); });
    }
    for (const folder of value.folders) {
      const visited = new Set([folder.id]); let parent = folder.parent;
      while (parent) {
        const ancestor = value.folders.find(item => item.id === parent);
        if (!ancestor || ancestor.scope !== folder.scope || visited.has(parent)) throw new Error();
        visited.add(parent); parent = ancestor.parent;
      }
    }
    return value;
  } catch { throw new Error('This source has unsupported organization metadata. Its source is preserved.'); }
}
export function inspectOrganization(template: Pick<SpxTemplate, 'html'>) {
  try { return { ...readOrganization(template), reason: '' }; }
  catch (cause) { return { ...empty(), reason: cause instanceof Error ? cause.message : String(cause) }; }
}
export function writeOrganization(template: SpxTemplate, value: EditorOrganization): SpxTemplate {
  readOrganization(template);
  // Escaping every hyphen/angle bracket prevents comment termination in user names.
  const json = JSON.stringify(value).replace(/-/g, '\\u002d').replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  const comment = value.folders.length || value.bins.length ? '<!-- NOACG_ORGANIZATION ' + json + ' -->\n' : '';
  const existing = [...template.html.matchAll(marker)];
  const html = existing.length ? template.html.replace(marker, comment) : comment + template.html;
  if (html === template.html) return template;
  const next = { ...template, html }; readOrganization(next); return next;
}
