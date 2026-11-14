import { readableWorkspace, WORKSPACE_REFUSAL, type AuthoringWorkspace } from './authoringDocument';

export const WORKSPACE_CHANGED = 'This project changed in another tab. Your draft is still open. Export it before reloading.';
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, canonical(value)]));
  return value;
}
export const sameWorkspaceValue = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/** Three-way comparison of whole owned units: never splice a document's revisions together. */
function owned<T extends { id: string }>(before: T[], local: T[], adopted: T[]): T[] {
  const B = new Map(before.map(value => [value.id, value])), L = new Map(local.map(value => [value.id, value])), R = new Map(adopted.map(value => [value.id, value]));
  const result: T[] = [];
  for (const id of new Set([...R.keys(), ...L.keys(), ...B.keys()])) {
    const b = B.get(id), l = L.get(id), r = R.get(id);
    let next: T | undefined;
    if (sameWorkspaceValue(l, b)) next = r;
    else if (sameWorkspaceValue(r, b) || sameWorkspaceValue(l, r)) next = l;
    else throw new Error(WORKSPACE_CHANGED);
    if (next) result.push(next);
  }
  return result;
}
export function reconcileWorkspace(before: AuthoringWorkspace | undefined, local: AuthoringWorkspace, adopted: AuthoringWorkspace | undefined): AuthoringWorkspace {
  if (!readableWorkspace(local) || before !== undefined && !readableWorkspace(before) || adopted !== undefined && !readableWorkspace(adopted)) throw new Error(WORKSPACE_REFUSAL);
  if (adopted === undefined || sameWorkspaceValue(before, adopted)) return local;
  const base = before ?? { v: 1 as const, projects: [], documents: [], active: null };
  const next: AuthoringWorkspace = { v: 1, projects: owned(base.projects, local.projects, adopted.projects),
    documents: owned(base.documents, local.documents, adopted.documents), active: local.active,
    ...((base.installations || local.installations || adopted.installations) ? { installations: owned(base.installations ?? [], local.installations ?? [], adopted.installations ?? []) } : {}) };
  if (!readableWorkspace(next)) throw new Error(WORKSPACE_CHANGED);
  return next;
}
