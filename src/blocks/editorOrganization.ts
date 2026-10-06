import type { SpxTemplate } from '../model/types';
import { getTemplateParts, type TemplatePart } from '../model/structure';
import { readOrganization, writeOrganization, validBin, type EditorOrganization } from '../model/editorOrganization';
import { groupHierarchy } from './editorGroups';
import { renameGraphicAsset } from './editorImages';

export type OrganizationOperation =
  | { kind: 'folder.create'; name: string; scope: string | null; members: string[]; parent?: string | null }
  | { kind: 'folder.rename'; id: string; name: string }
  | { kind: 'folder.remove'; id: string }
  | { kind: 'folder.move'; members: string[]; folder: string | null }
  | { kind: 'folder.reorder'; id: string; direction: 'up' | 'down' }
  | { kind: 'bin.create'; dir: string }
  | { kind: 'bin.rename'; from: string; to: string }
  | { kind: 'bin.remove'; dir: string };
const directory = (path: string) => path.slice(0, path.lastIndexOf('/'));
export const assetBinDirs = (template: SpxTemplate, organization = readOrganization(template)) => [...new Set([
  ...organization.bins, ...template.assets.map(asset => directory(asset.path)).filter(validBin),
])].sort();
function nameOf(name: string) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80 || [...name].some(character => character.charCodeAt(0) < 32)) throw new Error('Use a folder name of 1 to 80 characters.');
  return name.trim();
}
function memberScope(organization: EditorOrganization, member: string, parts: TemplatePart[], hierarchy: ReturnType<typeof groupHierarchy>): string | null {
  if (member.startsWith('folder:')) {
    const folder = organization.folders.find(folder => folder.id === member);
    if (!folder) throw new Error('This folder no longer exists. Inspect the hierarchy again.');
    return folder.scope;
  }
  const part = parts.find(part => part.selector === member);
  if (!part || part.kind === 'root') throw new Error('Select existing artwork layers, not the Composition root.');
  return hierarchy.parent[member] ?? null;
}
export function applyOrganization(template: SpxTemplate, operation: OrganizationOperation) {
  const organization = structuredClone(readOrganization(template));
  let next = template;
  const folderOf = (id: string) => {
    const folder = organization.folders.find(folder => folder.id === id);
    if (!folder) throw new Error('This folder no longer exists. Inspect the hierarchy again.');
    return folder;
  };
  const uniqueName = (name: string, scope: string | null, parent: string | null, ignore?: string) => {
    if (organization.folders.some(folder => folder.id !== ignore && folder.scope === scope && folder.parent === parent && folder.name === name)) throw new Error('A folder with this name already exists here.');
  };
  const move = (members: string[], target: string | null, scope?: string | null) => {
    if (!Array.isArray(members) || !members.length || members.length > 1000 || new Set(members).size !== members.length) throw new Error('Choose a bounded selection of distinct folder members.');
    const parts = getTemplateParts(template.html, template.fields, true), hierarchy = groupHierarchy(template);
    const parent = target ? folderOf(target) : null;
    const expectedScope = parent ? parent.scope : scope !== undefined ? scope : memberScope(organization, members[0], parts, hierarchy);
    for (const member of members) {
      if (memberScope(organization, member, parts, hierarchy) !== expectedScope) throw new Error('Choose layers in the same group or in Composition.');
      if (member.startsWith('folder:')) {
        const folder = folderOf(member); let ancestor = parent;
        while (ancestor) { if (ancestor.id === member) throw new Error('A folder cannot contain itself or its parent.'); ancestor = ancestor.parent ? folderOf(ancestor.parent) : null; }
        uniqueName(folder.name, folder.scope, target, folder.id); folder.parent = target;
      } else {
        organization.folders.forEach(folder => { folder.members = folder.members.filter(item => item !== member); });
        parent?.members.push(member);
      }
    }
  };
  if (operation.kind === 'folder.create') {
    const name = nameOf(operation.name), parent = operation.parent ?? null;
    if (operation.scope !== null && !groupHierarchy(template).groups.has(operation.scope)) throw new Error('Choose an existing group context.');
    if (parent && folderOf(parent).scope !== operation.scope) throw new Error('The parent folder belongs to another group context.');
    uniqueName(name, operation.scope, parent);
    let index = 1; while (organization.folders.some(folder => folder.id === 'folder:' + index)) index++;
    const folder = { id: 'folder:' + index, name, scope: operation.scope, parent, members: [] as string[] };
    organization.folders.push(folder);
    if (operation.members.length) move(operation.members, folder.id, operation.scope);
  } else if (operation.kind === 'folder.rename') {
    const folder = folderOf(operation.id), name = nameOf(operation.name); uniqueName(name, folder.scope, folder.parent, folder.id); folder.name = name;
  } else if (operation.kind === 'folder.move') move(operation.members, operation.folder);
  else if (operation.kind === 'folder.remove') {
    const folder = folderOf(operation.id);
    if (folder.parent) folderOf(folder.parent).members.push(...folder.members);
    organization.folders = organization.folders.filter(item => item.id !== folder.id);
    organization.folders.forEach(child => {
      if (child.parent === folder.id) {
        uniqueName(child.name, child.scope, folder.parent, child.id);
        child.parent = folder.parent;
      }
    });
  } else if (operation.kind === 'folder.reorder') {
    const folder = folderOf(operation.id), siblings = organization.folders.filter(item => item.parent === folder.parent && item.scope === folder.scope);
    const index = siblings.indexOf(folder), other = siblings[index + (operation.direction === 'up' ? -1 : 1)];
    if (other) { const a = organization.folders.indexOf(folder), b = organization.folders.indexOf(other); [organization.folders[a], organization.folders[b]] = [organization.folders[b], organization.folders[a]]; }
  } else {
    const dirs = assetBinDirs(template, organization);
    if (operation.kind === 'bin.create') {
      if (!validBin(operation.dir)) throw new Error('Use letters, numbers, underscores or hyphens in the bin name.');
      if (dirs.includes(operation.dir)) throw new Error('An asset bin with this name already exists.');
      organization.bins.push(operation.dir);
    } else if (operation.kind === 'bin.rename') {
      if (!dirs.includes(operation.from) || !validBin(operation.to) || operation.from.split('/')[0] !== operation.to.split('/')[0]) throw new Error('Rename an existing bin within its asset bucket.');
      if (operation.from === operation.to) return template;
      if (dirs.some(dir => dir === operation.to || dir.startsWith(operation.to + '/') && !dir.startsWith(operation.from + '/'))) throw new Error('An asset bin with this name already exists.');
      const moving = template.assets.filter(asset => asset.path.startsWith(operation.from + '/'));
      const paths = new Set(moving.map(asset => asset.path));
      const target = (path: string) => operation.to + path.slice(operation.from.length);
      if (moving.some(asset => template.assets.some(other => !paths.has(other.path) && other.path === target(asset.path)))) throw new Error('This rename would collide with another asset.');
      for (const asset of moving) next = renameGraphicAsset(next, asset.path, target(asset.path));
      organization.bins = organization.bins.filter(dir => dir !== operation.from).map(dir => dir.startsWith(operation.from + '/') ? target(dir) : dir);
      organization.bins.push(operation.to);
    } else if (operation.kind === 'bin.remove') {
      if (!dirs.includes(operation.dir)) throw new Error('This asset bin no longer exists.');
      if (template.assets.some(asset => asset.path.startsWith(operation.dir + '/'))) throw new Error('Move the assets out before removing this bin.');
      organization.bins = organization.bins.filter(dir => dir !== operation.dir && !dir.startsWith(operation.dir + '/'));
    }
  }
  return writeOrganization(next, organization);
}

/** Keep organization references coherent when existing structural tools change artwork. */
export function reconcileOrganization(before: SpxTemplate, after: SpxTemplate, identities: Record<string, string>, replacement?: { from: string[]; to: string[] }) {
  if (!before.html.includes('<!-- NOACG_ORGANIZATION ')) return after;
  const organization = structuredClone(readOrganization(after)), hierarchy = groupHierarchy(after), previous = groupHierarchy(before);
  const parts = new Set(getTemplateParts(after.html, after.fields, true).map(part => part.selector));
  for (const folder of organization.folders) {
    folder.scope = folder.scope ? identities[folder.scope] ?? folder.scope : null;
    folder.members = folder.members.map(member => identities[member] ?? member);
  }
  // Ungrouping releases local folders under the group's former organizational parent.
  // Keep their original ownership before replacing the outer group's member with children.
  for (const folder of organization.folders.filter(folder => folder.scope && !hierarchy.groups.has(folder.scope))) {
    const removed = folder.scope!;
    let scope = previous.parent[removed] ?? null;
    while (scope && !hierarchy.groups.has(scope)) scope = previous.parent[scope] ?? null;
    const container = organization.folders.find(item => item.scope === scope && item.members.includes(removed));
    folder.scope = scope;
    if (!folder.parent) folder.parent = container?.id ?? null;
  }
  for (const folder of organization.folders) {
    if (replacement && replacement.from.every(member => folder.members.includes(member))) {
      const released = replacement.to.filter(member => !organization.folders.some(other => other !== folder && other.members.includes(member)));
      folder.members = [...folder.members.filter(member => !replacement.from.includes(member)), ...released];
    }
    folder.members = folder.members.filter(member => parts.has(member) && (hierarchy.parent[member] ?? null) === folder.scope);
  }
  if (organization.folders.some((folder, index) => organization.folders.slice(index + 1).some(other => other.scope === folder.scope && other.parent === folder.parent && other.name === folder.name))) throw new Error('A folder with this name already exists here. Rename it before changing this group.');
  return writeOrganization(after, organization);
}
