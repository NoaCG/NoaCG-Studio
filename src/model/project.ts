// The current working project, autosaved locally (Era 5.2b) so a reload restores your last graphic
// instead of a blank default. The wizard-first startup is unchanged — closing the wizard drops you
// back onto your last work. One "current project" slot: creating a new graphic overwrites it (save
// important shows into Packets, which are kept and synced separately). Cloud sync of this single
// 'project' record lands next, alongside brand, via the singleton mechanism.

import type { SpxTemplate } from './types';
import type { GenerationSpec } from './generationSpec';
import type { AiThread } from './aiThread';
import type { ProjectLegibility } from './designRules';
import { durable } from './durableStore';
import { uuid } from './id';

export interface SavedProject {
  id: string;
  name: string;
  updatedAt: string; // ISO
  template: SpxTemplate;
  /** The pristine template as this project was created/imported — the Reset target.
   *  Optional so projects saved before this existed still load (Reset falls back to the
   *  loaded template in that case). */
  baseline?: SpxTemplate;
  /** Which library graphic (model/library.ts GraphicDoc) this working document IS — the Save
   *  button writes there. null/absent = never saved (a fresh creation). Additive optional. */
  graphicId?: string | null;
  /** True when the working document has changed since its last explicit Save. Persisted so a
   *  reload keeps the honest "Unsaved changes" badge. Additive optional. */
  dirty?: boolean;
  /** The AI generation spec this project was created from (the "More control" setup), kept
   *  so a later refine can start from the same structured decisions. Additive optional. */
  aiSpec?: GenerationSpec | null;
  /** The Create-with-AI conversation this project was created from (model/aiThread.ts), kept
   *  so the graphic carries the reasoning that produced it. Additive optional — same rails as
   *  aiSpec. */
  aiThread?: AiThread | null;
  /** The project's legibility settings (viewing target + the size-floor tri-state,
   *  model/designRules.ts). Additive optional, same rails as aiSpec — and the default state
   *  serializes to NOTHING (normalizeLegibility), so an untouched project's record is
   *  unchanged. */
  legibility?: ProjectLegibility | null;
  /** The id a first Save or Save As is about to mint, written BEFORE its record (#1383). The
   *  link write that follows can be refused; a reload then finds the record by this id instead
   *  of minting a second one (templateStore's initial link). Every later slot write drops it,
   *  since it carries the live link. Additive optional. */
  reservedGraphicId?: string;
  /** Soft-delete tombstone (for cloud sync parity — see Packet.deleted). */
  deleted?: boolean;
}

const STORAGE_KEY = 'spx-gfx-project';

function notifyDataChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('spx-data-changed'));
}

export function loadProject(): SavedProject | null {
  try {
    const raw = durable.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as SavedProject;
    if (!p.template || !p.id) return null;
    return p;
  } catch {
    return null;
  }
}

/**
 * Persist the working template as the current project, keeping the existing project id (so it stays
 * ONE slot / one cloud row). Non-fatal if storage is full — the working doc just won't persist.
 * `link` records which library graphic this document is and whether it has unsaved changes;
 * omitted, both carry over from the existing slot (a plain autosave).
 */
export function saveProject(
  template: SpxTemplate,
  baseline?: SpxTemplate,
  link?: { graphicId: string | null; dirty: boolean },
  aiSpec?: GenerationSpec | null,
  aiThread?: AiThread | null,
  legibility?: ProjectLegibility | null,
  reservedGraphicId?: string,
): void {
  try {
    const existing = loadProject();
    const rec: SavedProject = {
      id: existing?.id ?? uuid(),
      name: template.name,
      updatedAt: new Date().toISOString(),
      template,
      // Keep the baseline stable across autosaves; fall back to the existing one.
      baseline: baseline ?? existing?.baseline,
      graphicId: link ? link.graphicId : existing?.graphicId ?? null,
      dirty: link ? link.dirty : existing?.dirty ?? false,
      // undefined = a plain autosave carries the spec over; null explicitly clears it.
      aiSpec: aiSpec === undefined ? existing?.aiSpec ?? null : aiSpec,
      // Same rule for the conversation: carry it over on a plain autosave, clear on explicit null.
      aiThread: aiThread === undefined ? existing?.aiThread ?? null : aiThread,
      // Same rule again; an explicit null (the default state) drops the key entirely.
      legibility: (legibility === undefined ? existing?.legibility : legibility) ?? undefined,
      ...(reservedGraphicId ? { reservedGraphicId } : {}),
    };
    durable.setItem(STORAGE_KEY, JSON.stringify(rec));
    notifyDataChanged();
  } catch {
    // Storage full or unavailable — non-fatal.
  }
}

/** Write a whole SavedProject to the slot (used by the sync engine's put('project') on a pull). */
export function upsertProject(project: SavedProject): void {
  try {
    durable.setItem(STORAGE_KEY, JSON.stringify(project));
    notifyDataChanged();
  } catch {
    // Non-fatal.
  }
}

export function clearProject(): void {
  try {
    durable.removeItem(STORAGE_KEY);
    notifyDataChanged();
  } catch {
    // Non-fatal.
  }
}
