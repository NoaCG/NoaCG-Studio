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
import { graphicIdTaken } from './library';

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
  /** The id this document's next first Save or Save As will mint (#1383). Every slot write of
   *  the document carries it, so it is durable BEFORE its record is written: when the save's own
   *  slot writes (the reservation and the link) are both refused, a reload still finds the record
   *  by this id instead of minting a second one (templateStore's initial link). The link write
   *  of a mint carries a fresh one. Additive optional. */
  reservedGraphicId?: string;
  /** Set on a slot write made while this tab's save was minting `reservedGraphicId` for this
   *  draft (the save's own reservation write, and an autosave that fired during it). Only such a
   *  write proves the record is this draft's own, edited since or not; any other slot naming an
   *  existing record is trusted only when it holds that record's source (templateStore's initial
   *  link, #1402). Additive optional. */
  mintingReserved?: boolean;
  /** Soft-delete tombstone (for cloud sync parity — see Packet.deleted). */
  deleted?: boolean;
}

const STORAGE_KEY = 'spx-gfx-project';

/** The record id this document's next first Save / Save As mints (store/saveActions.ts),
 *  carried by EVERY slot write of the document from its first one on. A reservation written only
 *  by the save itself was lost when that write and the link write were both refused, and a
 *  reload then minted a second record (#1383, sixth check S6). It belongs to the document whose
 *  baseline it was taken for: a replaced document's writes take a fresh one, so they never point
 *  at a record minted for another document.
 *
 *  It is a pointer to a record that does not exist YET. Two tabs on one draft both resume it
 *  from the slot, and once one of them mints it, the other's writes must stop naming it, or a
 *  reload links the other tab's draft to that record and its Save overwrites it (#1402). So an
 *  id a record already holds is dropped for a fresh one, unless this tab is minting it now. */
let reservation: { id: string; baseline: SpxTemplate | undefined; minting: boolean } | null = null;
export function reservedGraphicId(baseline: SpxTemplate | undefined): string {
  if (!reservation || reservation.baseline !== baseline || (!reservation.minting && graphicIdTaken(reservation.id))) {
    reservation = { id: uuid(), baseline, minting: false };
  }
  return reservation.id;
}
/** Boot: the slot's persisted reservation is the document's, so a reload before its first Save
 *  keeps naming the same id. A fresh one here would leave the slot's earlier writes naming an id
 *  the mint never takes, and a double refusal after the reload could not relink. */
export function resumeReservation(id: string, baseline: SpxTemplate | undefined): void {
  reservation = { id, baseline, minting: false };
}
/** A first Save / Save As takes the reserved id. Until `endMint`, this tab's slot writes say so
 *  (`mintingReserved`), so a reload after its link write was refused trusts the record. */
export function mintReservedGraphicId(baseline: SpxTemplate | undefined): string {
  const id = reservedGraphicId(baseline);
  reservation!.minting = true;
  return id;
}
export function endMint(): void {
  if (reservation) reservation.minting = false;
}
/** A mint took the reserved id: the document's next mint reserves a fresh one. */
export function releaseReservation(): void {
  reservation = null;
}

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
      reservedGraphicId: reservedGraphicId(baseline),
      ...(reservation?.minting ? { mintingReserved: true } : {}),
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
