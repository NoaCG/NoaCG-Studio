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
import { readDeviceIds, writeDeviceIds, type DeviceIdsRead } from './deviceIds';

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
   *  of a mint carries a fresh one. The slot syncs to the account's other devices with it, but
   *  only the device that made it honours it (`isOwnReservation`, #1443). Additive optional. */
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
    rememberDeviceId(OWN_RESERVATIONS_KEY, reservation.id);
  }
  return reservation.id;
}

// ── Whose device a reservation is (#1443) ────────────────────────────────────────────────────
//
// The working slot syncs to every device on the account (backend/storage.ts SINGLETON_KINDS), and
// the reservation rides it as data. Another device cannot see a record this device minted until
// its next sync pass, so `graphicIdTaken` there cannot stop it minting the same id: a pulled
// reservation must never be minted or relinked anywhere but on the device that made it. The
// device keeps its own reservations here, in localStorage, which never syncs; boot honours the
// slot's reservation only when it is one of them (templateStore), and a pull keeps the device's
// own (`upsertProject`).
const OWN_RESERVATIONS_KEY = 'spx-gfx-reservations';
/** The ids of graphics whose record lost a sync conflict on this device (`graphicSuperseded`). */
const SUPERSEDED_KEY = 'spx-gfx-superseded';
/** A handful is enough: boot reads the slot's current reservation, or one a mint took moments
 *  before a refused link write. */
const IDS_KEPT = 20;
/** A list's ids (model/deviceIds.ts owns the format). */
function readList(key: string): DeviceIdsRead {
  try {
    return readDeviceIds(localStorage.getItem(key));
  } catch {
    return { ids: [], writable: false };
  }
}
function deviceIds(key: string): string[] {
  return readList(key).ids;
}
function rememberDeviceId(key: string, id: string): void {
  const list = readList(key);
  // A newer build's list stays as it wrote it; the id is then not recorded here.
  if (!list.writable) return;
  try {
    localStorage.setItem(key, writeDeviceIds([id, ...list.ids.filter((kept) => kept !== id)].slice(0, IDS_KEPT)));
  } catch {
    // Not recorded: this device's reload treats its own reservation as another device's, so the
    // draft asks for a name rather than relinking (a second record at worst, nothing overwritten).
  }
}
/** Did THIS device make the reservation `id`? */
export function isOwnReservation(id: string | undefined): boolean {
  return !!id && deviceIds(OWN_RESERVATIONS_KEY).includes(id);
}
/** Boot: the slot's persisted reservation, when it is this device's own, is the document's, so a
 *  reload before its first Save keeps naming the same id. A fresh one here would leave the slot's earlier writes naming an id
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

/** Write a pulled SavedProject to the slot (the sync engine's put('project')). The draft is the
 *  cloud's; the reservation is not (#1443). A slot holding this device's own reservation keeps
 *  it, and no pull brings a mint mark, which speaks only for the draft this device was minting.
 *  Another device's reservation can arrive with the draft as data; nothing here honours it. */
export function upsertProject(project: SavedProject): void {
  try {
    const { mintingReserved: _mark, ...pulled } = project;
    const own = loadProject()?.reservedGraphicId;
    durable.setItem(STORAGE_KEY, JSON.stringify(isOwnReservation(own) ? { ...pulled, reservedGraphicId: own } : pulled));
    notifyDataChanged();
  } catch {
    // Non-fatal.
  }
}

/** What a "(conflicted copy)" holds: the source of the record that lost a sync conflict
 *  (backend/sync.ts), now under its own id (#1466). */
export interface ConflictCopy extends DraftSource {
  id: string;
}
/** What a Save writes of the draft, and so what its link's `dirty` speaks for. */
interface DraftSource {
  template: SpxTemplate;
  legibility?: ProjectLegibility | null;
  aiSpec?: GenerationSpec | null;
  aiThread?: AiThread | null;
}
const sourceOf = ({ template, legibility, aiSpec, aiThread }: DraftSource) =>
  JSON.stringify([template, legibility ?? null, aiSpec ?? null, aiThread ?? null]);
/** The link of a draft whose record lost a sync conflict: the copy that holds its saved work,
 *  clean only when the draft holds exactly that (an edit made since the losing Save stays
 *  unsaved, as it was). With no copy known, none, so its next Save asks for a name. */
export function linkAfterLoss(draft: DraftSource, copy: ConflictCopy | null): { graphicId: string | null; dirty: boolean } {
  return copy ? { graphicId: copy.id, dirty: sourceOf(draft) !== sourceOf(copy) } : { graphicId: null, dirty: true };
}

/** The copy each superseded record's work went to, as this tab heard it. In memory: a Save whose
 *  record write a pass overlapped settles there (store/saveActions.ts). */
const conflictCopies = new Map<string, ConflictCopy>();
export function conflictCopyOf(graphicId: string): ConflictCopy | null {
  return conflictCopies.get(graphicId) ?? null;
}
/** Is `id` a "(conflicted copy)" this tab heard of? */
export function isConflictCopy(id: string): boolean {
  return [...conflictCopies.values()].some((copy) => copy.id === id);
}
/** The links that stand for the record `graphicId` that lost: itself, and the copy an earlier
 *  loss of it went to. A Save written after a pass listed the library is copied only by the next
 *  pass, and the draft already moved to the first copy then. */
function lostLinks(graphicId: string): string[] {
  const earlier = conflictCopies.get(graphicId);
  return earlier ? [graphicId, earlier.id] : [graphicId];
}

const supersededListeners = new Set<(lost: string[], copy: ConflictCopy | null) => void>();
/** Hear `graphicSuperseded`, in this tab or another (templateStore moves the live link): a draft
 *  linked to one of `lost` takes `linkAfterLoss`. */
export function onGraphicSuperseded(listener: (lost: string[], copy: ConflictCopy | null) => void): void {
  supersededListeners.add(listener);
}
function forgetSuperseded(graphicId: string, copy: ConflictCopy | null): void {
  const lost = lostLinks(graphicId);
  if (copy) conflictCopies.set(graphicId, copy);
  if (reservation?.id === graphicId) reservation = null;
  supersededListeners.forEach((listener) => listener(lost, copy));
}
// Every tab of this browser hears the conflict a pass found in one of them, the copy with it. A
// message, not only the device-local list: a list this build cannot write (a newer build's, or
// localStorage refusing it) told no other tab, and that tab stayed linked to the record that won.
const supersededChannel = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('noacg-graphic-superseded') : null;
if (supersededChannel) {
  supersededChannel.onmessage = (event: MessageEvent<{ graphicId?: unknown; copy?: ConflictCopy | null }>) => {
    if (typeof event.data?.graphicId === 'string') forgetSuperseded(event.data.graphicId, event.data.copy ?? null);
  };
}
// A tab of an older build (open across a deploy) tells only through the list, with no copy: the
// draft linked to that record here is unlinked, as that build does. A tab of this build sends the
// copy on the channel as well, so its message is given the moment it takes to arrive.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== SUPERSEDED_KEY) return;
    const [graphicId] = deviceIds(SUPERSEDED_KEY);
    if (graphicId) setTimeout(() => { if (!conflictCopies.has(graphicId)) forgetSuperseded(graphicId, null); }, 500);
  });
}
/** Did a sync conflict on this device give `graphicId` to another device's record? */
export function isGraphicSuperseded(graphicId: string): boolean {
  return deviceIds(SUPERSEDED_KEY).includes(graphicId);
}
/** A library record lost a sync conflict (backend/sync.ts): another device's version now holds
 *  its id, and this device's own lives on as a "(conflicted copy)", `copy`. The draft linked to
 *  the record links to the copy instead (`linkAfterLoss`), the record that holds its saved work,
 *  so it never writes over the other device's graphic (#1443) and is not asked about as unsaved
 *  work (#1466). A draft that named the record only as its reservation (a first Save whose link
 *  write was refused) links there when it is that save's draft; the reservation is dropped either
 *  way. The slot's time moves, so the next pass shares the rewritten draft. Answers whether the
 *  slot was rewritten. */
export function graphicSuperseded(graphicId: string, copy: ConflictCopy | null = null): boolean {
  rememberDeviceId(SUPERSEDED_KEY, graphicId);
  const p = loadProject();
  const linked = !!p?.graphicId && lostLinks(graphicId).includes(p.graphicId);
  let rewritten = false;
  if (p && (linked || p.reservedGraphicId === graphicId)) {
    const rec: SavedProject = { ...p, updatedAt: new Date().toISOString() };
    const link = linkAfterLoss(p, copy);
    if (linked) Object.assign(rec, link);
    else if (copy && !p.graphicId && (!link.dirty || p.mintingReserved)) Object.assign(rec, link);
    if (p.reservedGraphicId === graphicId) {
      delete rec.reservedGraphicId;
      delete rec.mintingReserved;
    }
    try {
      durable.setItem(STORAGE_KEY, JSON.stringify(rec));
      notifyDataChanged();
      rewritten = true;
    } catch {
      // Non-fatal: the live link below still moves, and the next autosave writes it.
    }
  }
  forgetSuperseded(graphicId, copy);
  try {
    supersededChannel?.postMessage({ graphicId, copy });
  } catch {
    // A copy that cannot be cloned: the other tabs hear the list, and unlink.
  }
  return rewritten;
}

export function clearProject(): void {
  try {
    durable.removeItem(STORAGE_KEY);
    notifyDataChanged();
  } catch {
    // Non-fatal.
  }
}
