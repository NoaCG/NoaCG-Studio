import type { SavedProject } from './project';
import type { SpxTemplate } from './types';
import type { GenerationSpec } from './generationSpec';
import type { AiThread } from './aiThread';
import type { ProjectLegibility } from './designRules';
import type { ProjectInstallation } from './projectInstallation';

/** View receipts belong to a draft's editor history, never to graphic source or exports. */
export interface DocumentView { selectedParts: string[]; time: number; cue?: number; sampleData?: Record<string, string> }
export interface HistoryViews { past: { before: DocumentView; after: DocumentView }[]; future: { before: DocumentView; after: DocumentView }[] }
export interface AuthoringDocument {
  id: string;
  template: SpxTemplate;
  baseline: SpxTemplate;
  history: SpxTemplate[];
  future: SpxTemplate[];
  saved: { graphicId: string | null; dirty: boolean };
  sampleData: Record<string, string>;
  aiSpec: GenerationSpec | null | undefined;
  aiThread: AiThread | null | undefined;
  legibility: ProjectLegibility | null | undefined;
  reservedGraphicId?: string;
  mintingReserved?: boolean;
  views?: HistoryViews;
  view?: DocumentView;
}
export interface AuthoringProject { id: string; name: string; documents: string[] }
export interface AuthoringWorkspace {
  v: 1;
  projects: AuthoringProject[];
  documents: AuthoringDocument[];
  active: string | null;
  installations?: ProjectInstallation[];
}
export const WORKSPACE_REFUSAL = 'This project was saved by a newer or unreadable editor. Export a backup and open it in that version.';
function templateShape(value: SpxTemplate): boolean {
  return !!value && typeof value.html === 'string' && typeof value.css === 'string' && typeof value.js === 'string' && Array.isArray(value.assets) && Array.isArray(value.fields);
}
function viewShape(value: DocumentView): boolean {
  return !!value && Array.isArray(value.selectedParts) && value.selectedParts.every(s => typeof s === 'string') && Number.isFinite(value.time) &&
    (value.cue === undefined || Number.isInteger(value.cue) && value.cue >= 0);
}
function historyShape(value: HistoryViews): boolean {
  return !!value && Array.isArray(value.past) && Array.isArray(value.future) && [...value.past, ...value.future].every(v => v && viewShape(v.before) && viewShape(v.after));
}
/** An absent payload is the legacy working slot. Unknown versions stay untouched. */
export function readableWorkspace(value: unknown): value is AuthoringWorkspace {
  if (!value || typeof value !== 'object') return false;
  const w = value as AuthoringWorkspace;
  if (w.v !== 1 || !Array.isArray(w.projects) || !Array.isArray(w.documents) || !(w.active === null || typeof w.active === 'string')) return false;
  const ids = new Set<string>();
  for (const d of w.documents) {
    if (!d || typeof d.id !== 'string' || ids.has(d.id) || !templateShape(d.template) || !templateShape(d.baseline) || !Array.isArray(d.history) || !Array.isArray(d.future) || ![...d.history, ...d.future].every(templateShape) || !d.saved || !(d.saved.graphicId === null || typeof d.saved.graphicId === 'string') || typeof d.saved.dirty !== 'boolean' || !d.sampleData || d.views !== undefined && !historyShape(d.views) || d.view !== undefined && !viewShape(d.view)) return false;
    ids.add(d.id);
  }
  const projects = new Set<string>();
  for (const p of w.projects) {
    if (!p || typeof p.id !== 'string' || projects.has(p.id) || typeof p.name !== 'string' || !Array.isArray(p.documents) || new Set(p.documents).size !== p.documents.length || p.documents.some(id => !ids.has(id))) return false;
    projects.add(p.id);
  }
  if (w.installations !== undefined && (!Array.isArray(w.installations) || w.installations.some(p => !p || p.v !== 1 || typeof p.id !== 'string' || typeof p.target !== 'string' ||
    !p.before || !p.after || p.before.id !== p.target || p.after.id !== p.target || p.rollback !== undefined && (!p.rollback || p.rollback.id !== p.target || !Number.isFinite(Date.parse(p.rollback.updatedAt))) || !Array.isArray(p.sources) || !['prepared', 'confirmed', 'rolled-back', 'conflict'].includes(p.status)))) return false;
  return w.active === null || ids.has(w.active);
}
export function workspaceDocument(value: unknown): AuthoringDocument | undefined {
  return readableWorkspace(value) ? value.documents.find(d => d.id === value.active) : undefined;
}

/** The active bundle is authoritative, including absent optional source metadata. */
export function projectFromDocument(slot: SavedProject, d: AuthoringDocument): SavedProject {
  return { ...slot, name: d.template.name, template: d.template, baseline: d.baseline,
    graphicId: d.saved.graphicId, dirty: d.saved.dirty, aiSpec: d.aiSpec ?? null,
    aiThread: d.aiThread ?? null, legibility: d.legibility ?? undefined,
    reservedGraphicId: d.reservedGraphicId, mintingReserved: d.mintingReserved };
}
