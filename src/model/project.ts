// The current working project, autosaved locally (Era 5.2b) so a reload restores your last graphic
// instead of a blank default. The wizard-first startup is unchanged — closing the wizard drops you
// back onto your last work. One "current project" slot: creating a new graphic overwrites it (save
// important shows into Packets, which are kept and synced separately). Cloud sync of this single
// 'project' record lands next, alongside brand, via the singleton mechanism.

import { readableWorkspace, workspaceDocument, projectFromDocument, WORKSPACE_REFUSAL, type AuthoringWorkspace, type AuthoringDocument } from './authoringDocument';
import type { SpxTemplate } from './types';
import type { GenerationSpec } from './generationSpec';
import type { AiThread } from './aiThread';
import type { ProjectLegibility } from './designRules';
import { durable, lastDurableWrite, libraryInUse } from './durableStore';
import { reconcileWorkspace, sameWorkspaceValue, WORKSPACE_CHANGED } from './workspaceStage';
import { uuid } from './id';
import { graphicIdTaken } from './library';
import { readDeviceIds, writeDeviceIds, type DeviceIdsRead } from './deviceIds';

export interface SavedProject {
  /** Additive v1 multi-document envelope; legacy slots have none. */
  workspace?: AuthoringWorkspace;
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
interface WorkspaceStage {
  base: AuthoringWorkspace | undefined;
  value: AuthoringWorkspace | undefined;
  generation: number;
  dirty: boolean;
  document?: string;
  acceptedRaw?: string;
  acceptedSequence: number;
  writes: Map<number, string>;
}
const workspaceStages = new Map<string | null, WorkspaceStage>();
function workspaceStage(): WorkspaceStage {
  const owner = libraryInUse();
  let stage = workspaceStages.get(owner);
  if (!stage) {
    const value = loadProject()?.workspace;
    stage = { base: value && structuredClone(value), value, generation: 0, dirty: false,
      document: readableWorkspace(value) ? value.active ?? undefined : undefined, acceptedSequence: 0, writes: new Map() };
    workspaceStages.set(owner, stage);
  }
  return stage;
}
function ownWorkspaceWrite(stage: WorkspaceStage): boolean {
  const raw = durable.getItem(STORAGE_KEY);
  return raw !== null && (raw === stage.acceptedRaw || [...stage.writes.values()].includes(raw));
}
function resolvedWorkspace(stage = workspaceStage()): AuthoringWorkspace | undefined {
  const adopted = loadProject()?.workspace;
  if (adopted !== undefined && !readableWorkspace(adopted) || stage.value !== undefined && !readableWorkspace(stage.value)) throw new Error(WORKSPACE_REFUSAL);
  if (!stage.dirty || !stage.value) return adopted;
  return ownWorkspaceWrite(stage) ? stage.value : reconcileWorkspace(stage.base, stage.value, adopted);
}
export function authoringWorkspace(): AuthoringWorkspace | undefined {
  try { return resolvedWorkspace(); }
  catch { return workspaceStage().value ?? loadProject()?.workspace; } // Keep pending work readable for recovery; writers use the refusal below.
}
export function stageAuthoringWorkspace(value: AuthoringWorkspace | undefined): void {
  if (value === undefined) { workspaceStages.delete(libraryInUse()); return; }
  const stage = workspaceStage();
  stage.value = value; stage.dirty = true; stage.generation++;
}
/** The private document actually loaded in this tab, independent of an adopted active pointer. */
export function bindWorkspaceDocument(id: string | undefined, loaded?: AuthoringDocument): void {
  const stage = workspaceStage();
  stage.document = id;
  if (stage.dirty || !loaded) return;
  try {
    const value = resolvedWorkspace(stage);
    // Only an explicit load of that exact adopted bundle can refresh its authority.
    if (readableWorkspace(value) && sameWorkspaceValue(value.documents.find(d => d.id === id), loaded)) {
      stage.base = value; stage.value = value;
    }
  } catch { /* An unreadable adopted envelope stays protected, including during boot. */ }
}
export function workspaceGeneration(): number { return workspaceStage().generation; }
/** Invalidate pending operations without inventing a workspace for a legacy view. */
export function markWorkspaceViewChanged(id: string): void {
  const stage = workspaceStage();
  if (stage.document === id) stage.generation++;
}
export function workspaceDocumentOwner(): string | undefined { return workspaceStage().document; }
/** Undo only an unchanged refused replacement, preserving later drafts and journals. */
export function restoreRefusedDocument(submitted: AuthoringDocument, live: AuthoringDocument, active: string | null): void {
  const w = authoringWorkspace();
  if (!readableWorkspace(w) || !sameWorkspaceValue(w.documents.find(d => d.id === submitted.id), submitted)) return;
  const priorActive = active === null || w.documents.some(d => d.id === active) ? active : null;
  stageAuthoringWorkspace({ ...w, active: w.active === null ? priorActive : w.active,
    documents: w.documents.map(d => d.id === submitted.id ? live : d) });
}
/** A submitted retention is not ownership until its complete snapshot is confirmed. */
export function workspaceDocumentRetained(id: string): boolean {
  const stage = workspaceStage();
  return !workspaceRefusal() && readableWorkspace(stage.base) && stage.base.documents.some(d => d.id === id);
}
export function workspaceRefusal(): string | null {
  try {
    const stage = workspaceStage(), adopted = loadProject()?.workspace;
    resolvedWorkspace(stage); // Unknown durable formats are checked even when old staging exists.
    if (!ownWorkspaceWrite(stage) && stage.document && readableWorkspace(stage.base) && readableWorkspace(adopted) &&
      !sameWorkspaceValue(stage.base.documents.find(d => d.id === stage.document), adopted.documents.find(d => d.id === stage.document))) return WORKSPACE_CHANGED;
    return null;
  } catch (error) { return error instanceof Error ? error.message : WORKSPACE_REFUSAL; }
}
/** One lifecycle for every ordinary slot writer. Optimistic mirror receipt is not confirmation. */
function writeLocalProject(project: SavedProject): void {
  const refusal = workspaceRefusal();
  if (refusal) throw new Error(refusal);
  const stage = workspaceStage(), owner = libraryInUse(), workspace = resolvedWorkspace(stage);
  // A rebased candidate must be visible before another slot writer can read our optimistic raw.
  if (!sameWorkspaceValue(stage.value, workspace)) { stage.value = workspace; stage.generation++; }
  const selected = workspaceDocument(workspace);
  const projected = selected ? projectFromDocument(project, selected) : project;
  const generation = stage.generation, raw = JSON.stringify({ ...projected, ...(workspace !== undefined ? { workspace } : {}) });
  const previous = lastDurableWrite(STORAGE_KEY);
  durable.setItem(STORAGE_KEY, raw);
  const receipt = lastDurableWrite(STORAGE_KEY);
  if (!receipt || receipt === previous || receipt.account !== owner) return;
  stage.writes.set(receipt.sequence, raw);
  void receipt.settled.then(error => {
    stage.writes.delete(receipt.sequence);
    if (error || receipt.sequence < stage.acceptedSequence) return;
    stage.acceptedSequence = receipt.sequence; stage.acceptedRaw = raw;
    // Advancing the baseline keeps later deltas. Never reinstall the older captured value.
    stage.base = workspace;
    if (stage.generation === generation) { stage.value = workspace; stage.dirty = false; }
  });
}
/** Publish the candidate before any local writer or await can read its predecessor. */
export function writeAuthoringWorkspace(workspace: AuthoringWorkspace): void {
  const p = loadProject();
  if (!p || workspaceRefusal()) throw new Error(workspaceRefusal() ?? 'Open a graphic first.');
  stageAuthoringWorkspace(workspace);
  writeLocalProject({ ...p, updatedAt: new Date().toISOString() });
  notifyDataChanged();
}


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
let reservation: { id: string; baseline: SpxTemplate | undefined; minting: boolean; owner?: string } | null = null;
export function reservedGraphicId(baseline: SpxTemplate | undefined): string {
  if (!reservation || reservation.baseline !== baseline || (!reservation.minting && graphicIdTaken(reservation.id))) {
    reservation = { id: uuid(), baseline, minting: false, owner: workspaceDocumentOwner() };
    rememberDeviceId(OWN_RESERVATIONS_KEY, reservation.id);
    rememberDeviceId(OWN_RESERVATIONS_KEY, reservation.id, true);
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
function readList(key: string, tab = false): DeviceIdsRead {
  try {
    return readDeviceIds((tab ? sessionStorage : localStorage).getItem(key));
  } catch {
    return { ids: [], writable: false };
  }
}
function deviceIds(key: string, tab = false): string[] {
  return readList(key, tab).ids;
}
function rememberDeviceId(key: string, id: string, tab = false): void {
  const list = readList(key, tab);
  // A newer build's list stays as it wrote it; the id is then not recorded here.
  if (!list.writable) return;
  try {
    (tab ? sessionStorage : localStorage).setItem(key, writeDeviceIds([id, ...list.ids.filter((kept) => kept !== id)].slice(0, IDS_KEPT)));
  } catch {
    // If neither local list can record ownership, reload asks for a name rather than trusting
    // an account-synced reservation (a second record at worst, nothing overwritten).
  }
}
/** Did THIS device make the reservation `id`? The tab-local mirror survives a reload when the
 *  device list is lost, damaged or belongs to a newer build. Both lists use the same versioned
 *  format and neither syncs. A closed tab still needs the device list; the synced slot alone
 *  never proves ownership. Existing source/mint guards still decide whether to relink. */
export function isOwnReservation(id: string | undefined): boolean {
  return !!id && (deviceIds(OWN_RESERVATIONS_KEY).includes(id) || deviceIds(OWN_RESERVATIONS_KEY, true).includes(id));
}
/** Boot: the slot's persisted reservation, when it is this device's own, is the document's, so a
 *  reload before its first Save keeps naming the same id. A fresh one here would leave the slot's earlier writes naming an id
 *  the mint never takes, and a double refusal after the reload could not relink. */
export function resumeReservation(id: string, baseline: SpxTemplate | undefined): void {
  reservation = { id, baseline, minting: false, owner: workspaceDocumentOwner() };
}
/** A first Save / Save As takes the reserved id. Until `endMint`, this tab's slot writes say so
 *  (`mintingReserved`), so a reload after its link write was refused trusts the record. */
export function mintReservedGraphicId(baseline: SpxTemplate | undefined): string {
  const id = reservedGraphicId(baseline);
  reservation!.minting = true;
  return id;
}
/** Observe an existing exact-owner reservation without allocating or touching device IDs. */
export function peekDocumentReservation(id: string, baseline: SpxTemplate | undefined) {
  if (workspaceDocumentOwner() !== id || reservation?.owner !== id || reservation.baseline !== baseline) return undefined;
  return { reservedGraphicId: reservation.id, mintingReserved: reservation.minting ? true as const : undefined };
}
export function documentReservation(baseline: SpxTemplate | undefined) {
  const id = reservedGraphicId(baseline);
  reservation!.owner = workspaceDocumentOwner();
  return { reservedGraphicId: id, ...(reservation?.minting ? { mintingReserved: true } : {}) };
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

let cachedProject: { raw: string; value: SavedProject } | null = null;
export function loadProject(): SavedProject | null {
  try {
    const raw = durable.getItem(STORAGE_KEY);
    if (!raw) return null;
    if (cachedProject?.raw === raw) return cachedProject.value;
    const p = JSON.parse(raw) as SavedProject;
    if (!p.template || !p.id) return null;
    cachedProject = { raw, value: p };
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
  owner?: AuthoringDocument,
  detach = false,
): void {
  try {
    const existing = loadProject();
    if (workspaceRefusal()) return;
    const rec: SavedProject = {
      id: existing?.id ?? uuid(),
      ...(authoringWorkspace() ? { workspace: authoringWorkspace() } : {}),
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
      ...(owner ? { reservedGraphicId: owner.reservedGraphicId, mintingReserved: owner.mintingReserved } : documentReservation(baseline)),
    };
    const w = authoringWorkspace();
    if (owner && readableWorkspace(w)) {
      if (workspaceDocumentOwner() !== owner.id) return;
      if (w.documents.some(d => d.id === owner.id)) {
        const next = { ...w, active: detach ? null : w.active, documents: w.documents.map(d => d.id === owner.id ? owner : d) };
        if (!sameWorkspaceValue(w, next)) stageAuthoringWorkspace(next);
      } else if (w.active !== null) return; // A selected destination cannot claim an unretained caller.
    }
    writeLocalProject(owner ? projectFromDocument(rec, owner) : rec);
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
  const workspace = loadProject()?.workspace;
  if (workspace !== undefined && !readableWorkspace(workspace)) return;
  try {
    const { mintingReserved: _mark, ...pulled } = project;
    // A pull brings no trusted mint mark, including marks nested in dormant documents.
    const incoming = readableWorkspace(pulled.workspace) ? { ...pulled.workspace,
      documents: pulled.workspace.documents.map(({ mintingReserved: _mint, ...d }) => d) } : pulled.workspace;
    const effective = incoming !== undefined ? incoming : workspace;
    const own = loadProject()?.reservedGraphicId;
    const next = { ...pulled, ...(effective !== undefined ? { workspace: effective } : {}), ...(isOwnReservation(own) ? { reservedGraphicId: own } : {}) };
    const selected = workspaceDocument(effective);
    durable.setItem(STORAGE_KEY, JSON.stringify(selected ? projectFromDocument(next, selected) : next));
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
  if (workspaceRefusal()) return false;
  const p = loadProject();
  const workspace = authoringWorkspace();
  let workspaceChanged = false;
  if (workspace && readableWorkspace(workspace)) {
    const documents = workspace.documents.map(d => {
      const linked = !!d.saved.graphicId && lostLinks(graphicId).includes(d.saved.graphicId);
      if (!linked && d.reservedGraphicId !== graphicId) return d;
      workspaceChanged = true;
      const next = { ...d, saved: linked ? linkAfterLoss(d, copy) : d.saved };
      if (!linked && copy && !d.saved.graphicId && (!linkAfterLoss(d, copy).dirty || d.mintingReserved)) next.saved = linkAfterLoss(d, copy);
      if (d.reservedGraphicId === graphicId) { delete next.reservedGraphicId; delete next.mintingReserved; }
      return next;
    });
    if (workspaceChanged) stageAuthoringWorkspace({ ...workspace, documents });
  }
  const linked = !!p?.graphicId && lostLinks(graphicId).includes(p.graphicId);
  let rewritten = false;
  if (p && (linked || p.reservedGraphicId === graphicId)) {
    const rec: SavedProject = { ...p, ...(authoringWorkspace() ? { workspace: authoringWorkspace() } : {}), updatedAt: new Date().toISOString() };
    const link = linkAfterLoss(p, copy);
    if (linked) Object.assign(rec, link);
    else if (copy && !p.graphicId && (!link.dirty || p.mintingReserved)) Object.assign(rec, link);
    if (p.reservedGraphicId === graphicId) {
      delete rec.reservedGraphicId;
      delete rec.mintingReserved;
    }
    try {
      writeLocalProject(rec);
      notifyDataChanged();
      rewritten = true;
    } catch {
      // Non-fatal: the live link below still moves, and the next autosave writes it.
    }
  }
  if (!rewritten && workspaceChanged && authoringWorkspace() && p) {
    try { writeAuthoringWorkspace(authoringWorkspace()!); rewritten = true; } catch { /* next autosave retains the repair */ }
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
  // Removing the legacy current slot must never erase independently retained documents.
  if (authoringWorkspace() !== undefined || workspaceRefusal()) return;
  try {
    durable.removeItem(STORAGE_KEY);
    notifyDataChanged();
  } catch {
    // Non-fatal.
  }
}
