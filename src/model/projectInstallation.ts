import { nextFreeLayer, seedValues, type Show } from './shows';
import type { GraphicDoc } from './library';
import { uuid } from './id';
import { conditionalDurableWrite } from './durableStore';
import { teamShowIds } from './teamShows';

export interface ProjectInstallation {
  v: 1;
  id: string;
  target: string;
  sources: { id: string; updatedAt: string }[];
  before: Show;
  after: Show;
  status: 'prepared' | 'confirmed' | 'rolled-back' | 'conflict';
  error?: string;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
export const sameInstallationTarget = (a: Show, b: Show) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/** Stable identities and both snapshots are prepared once, before any target submission. */
export function planProjectInstallation(before: Show, sources: GraphicDoc[], at = new Date().toISOString()): ProjectInstallation {
  if (before.version !== 2 || before.deleted || before.teamId || teamShowIds().has(before.id)) throw new Error('Choose a personal production for this installation.');
  if (!sources.length || new Set(sources.map(g => g.id)).size !== sources.length) throw new Error('Select saved graphics to install.');
  const after = structuredClone(before);
  for (const doc of sources) {
    // Reinstalling a saved graphic is never an implicit design update.
    if (after.graphics.some(g => g.graphicId === doc.id)) continue;
    if (after.graphics.some(g => g.name === doc.name)) throw new Error(`“${doc.name}” already exists in this production. Rename it or replace its design explicitly in the production.`);
    const graphic = { id: uuid(), name: doc.name, type: doc.type, template: structuredClone(doc.template), savedAt: at, designAt: at,
      graphicId: doc.id, layer: nextFreeLayer(after.graphics) };
    after.graphics.push(graphic);
    after.cues = [...(after.cues ?? []), { id: uuid(), sourceId: graphic.id, label: graphic.name, values: seedValues(graphic.template.fields) }];
  }
  after.updatedAt = at;
  return { v: 1, id: uuid(), target: before.id, sources: sources.map(g => ({ id: g.id, updatedAt: g.updatedAt })), before: structuredClone(before), after, status: 'prepared' };
}

/** Compare the stored production and put its replacement in the same IndexedDB transaction. */
export async function reconcileProjectTarget(plan: ProjectInstallation, rollback = false) {
  if (plan.v !== 1 || plan.target !== plan.before.id || plan.target !== plan.after.id) throw new Error('This installation receipt cannot be read safely.');
  return conditionalDurableWrite('spx-gfx-shows', text => {
    const shows = JSON.parse(text ?? '[]') as Show[];
    if (!Array.isArray(shows)) return { refused: 'The productions could not be read safely.' };
    const index = shows.findIndex(s => s.id === plan.target), current = shows[index];
    if (!current || current.deleted || current.teamId || teamShowIds().has(plan.target)) return { refused: 'The production is no longer editable here.' };
    if (rollback && (current.outputSlug || current.hostedSlug || current.publishedAt)) return { refused: 'This production has been prepared for output. Stop and replace its installed copies explicitly in the production.' };
    const wanted = rollback ? plan.before : plan.after, expected = rollback ? plan.after : plan.before;
    if (!sameInstallationTarget(current, wanted)) {
      if (!sameInstallationTarget(current, expected)) return { refused: 'Installation conflict: newer production edits were preserved. Inspect the production before continuing.' };
      shows[index] = structuredClone(wanted);
    }
    return { value: JSON.stringify(shows) };
  }, () => !teamShowIds().has(plan.target));
}
