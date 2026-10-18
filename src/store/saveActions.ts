// The SAVE / OPEN actions over the graphics library (docs/SAVED_CONTENT_MODEL.md §2), plus
// the small UI store that sequences their dialogs. templateStore holds the live template and
// the save LINK (`saved`); this module owns the semantics: what Save writes, what opening a
// library graphic loads, and when the "unsaved changes" guard must interpose.
//
// The autosave slot (model/project.ts) is the crash-safety net and is never conflated with
// Save: document replacement and leaving the mounted editor resolve unsaved work before
// proceeding. Other surfaces do not ask merely because a working document exists.

import { create } from 'zustand';
import { flushPendingProject, useTemplateStore } from './templateStore';
import {
  createGraphic,
  graphicById,
  updateGraphic,
  type GraphicDoc,
} from '../model/library';
import { conflictCopyOf, endMint, isConflictCopy, isGraphicSuperseded, linkAfterLoss, mintReservedGraphicId, releaseReservation, saveProject } from '../model/project';
import { designLocked } from '../model/graphicDoc';
import { captureDurableWrites, commitDurableReceipt, commitDurableWrites, unsettledWrites, type DurableWriteReceipt } from '../model/durableStore';
import { normalizeThread } from '../model/aiThread';
import { useDocKindStore } from './docKindStore';
import { validateProjectFormat } from '../model/projectFormat';
import { prepareOutRuntime } from '../blocks/animMigration';
import { createDefaultTemplate } from '../templates/defaultTemplate';

function prepareEmptyOut() {
  const store = useTemplateStore.getState();
  const js = prepareOutRuntime(store.template.js);
  if (js !== store.template.js) store.applyTemplate({ ...store.template, js });
}

/** Persist the working slot's save link NOW — the autosave subscription only fires on a
 *  template change, and a Save that changes nothing else must still survive a reload. */
function persistLink(): void {
  const s = useTemplateStore.getState();
  saveProject(s.template, s.baseline, { graphicId: s.saved.graphicId, dirty: s.saved.dirty }, s.aiSpec, s.aiThread, s.legibility);
}

const LIBRARY_KEY = 'spx-gfx-graphics' as const;
const SLOT_KEY = 'spx-gfx-project' as const;

/** Wait for the puts this save made, and claim their failure. Never every pending write: a
 *  slower autosave can outlast the generic announcement, which then takes the Save's refusal
 *  and the Save reads as landed (#1351). Another write's failure stays that write's, announced
 *  by the app. */
async function commitSaveWrites(receipts: DurableWriteReceipt[]): Promise<string | null> {
  // No put recorded means nothing reached storage, as Discard treats it.
  if (!receipts.length) return 'Your work could not be saved to browser storage.';
  return settleClaimed(receipts.map(commitDurableReceipt));
}

/** The first failure among writes already claimed (`commitDurableReceipt` claims on call). */
async function settleClaimed(claims: Promise<string | null>[]): Promise<string | null> {
  return (await Promise.all(claims)).find(Boolean) ?? null;
}

// ── The save transaction ─────────────────────────────────────────────────────────────────────
//
// Save, Save As, first-Save naming, the leave guard's Save & continue, the wizard's Finish doors
// and Discard are ONE operation each, and they run one at a time (`transaction`). Five checks
// each failed on a new ordering of their separate durable writes, so the order is fixed here,
// once, for every caller:
//
//   1. claim the working-slot writes already in flight (an autosave whose timer had fired);
//   2. first Save / Save As only: RESERVE the record's id in the slot, queued before the record
//      (#1383). Every earlier slot write of the document carries the same id, so it is durable
//      even when this write is refused too;
//   3. write the library record and wait for both;
//   4. wait for the writes claimed in 1, so the link write lands after them;
//   5. write the draft's link and wait for it;
//   6. flush the source's pending autosave (an edit's timer, or the one the name adoption
//      scheduled) and wait for it, so nothing of this source is written after the answer.
//
// The answer (saved / failed, with `saved.dirty` for stale) comes only after every write it made
// or claimed has settled, and their refusals are the operation's own, answered by its dialog
// rather than by the app's notice once the leave has gone on (#1382). Writes that anything else
// makes meanwhile stay theirs, announced by the app.
// An idle store starts the operation in the caller's turn, as these functions always did: its
// writes reach the mirror before the call returns (e2e/project-format.spec.ts reads the record
// straight after an unawaited `saveGraphicAs`). A busy one queues it behind the running one.
//
// While any of them is unsettled, `useSaveUi.inFlight` says so, and the leave guard asks rather
// than reading `saved.dirty`, which a Save clears before its link write settles (#1392). The flag
// drops before the operation's caller hears the answer, so a continuation that goes back through
// the guard sees the settled state.
let running: Promise<void> | null = null;
let unsettled = 0;
function transaction<T>(operation: () => Promise<T>): Promise<T> {
  if (unsettled++ === 0) useSaveUi.setState({ inFlight: true });
  const counted = () => operation().finally(() => { if (--unsettled === 0) useSaveUi.setState({ inFlight: false }); });
  const run = running ? running.then(counted) : counted();
  const settled: Promise<void> = run.then(() => undefined, () => undefined).then(() => { if (running === settled) running = null; });
  running = settled;
  return run;
}

/** Step 1: the slot writes in flight now. The link write rewrites the slot after them, so a
 *  refusal among them loses nothing once the save lands, and must not be announced after it. */
function claimInFlight(): Promise<string | null> {
  return settleClaimed(unsettledWrites(SLOT_KEY).map(commitDurableReceipt));
}

/** Step 6, once the link landed: the source's pending autosave would otherwise fire after the
 *  answer, over Home, where its refusal read as an unsaved graphic (#1382). It carries what the
 *  link write just made durable, so its refusal loses nothing and is claimed. A newer edit's
 *  autosave is left to its own timer: that save is stale and its caller stays to ask again. */
async function settleTrailingAutosave(linked: EditingContext): Promise<void> {
  if (changedSince(linked)) return;
  await settleClaimed(captureDurableWrites(SLOT_KEY, flushPendingProject).receipts.map(commitDurableReceipt));
}

type EditingContext = ReturnType<typeof useTemplateStore.getState>;

/** Has the working document changed since `before` was taken? Save and Discard both wait for
 *  storage, and the editor can accept an edit meanwhile. Save then marks clean only the source
 *  it wrote (#1359), and Discard refuses rather than erase the edit (#1147). */
function changedSince(before: EditingContext): boolean {
  const now = useTemplateStore.getState();
  return now.template !== before.template || now.baseline !== before.baseline ||
    now.saved.graphicId !== before.saved.graphicId || now.aiSpec !== before.aiSpec ||
    now.aiThread !== before.aiThread || now.legibility !== before.legibility;
}

/** Was the working document REPLACED meanwhile (another graphic opened, a new one made)? Its
 *  link is then not the waiting save's to settle. */
function replacedSince(before: EditingContext): boolean {
  const now = useTemplateStore.getState();
  return (now.saved.graphicId !== before.saved.graphicId && !movedToCopy(before, now)) || now.baseline !== before.baseline;
}

/** A sync pass moved the draft from a record that lost a conflict to the "(conflicted copy)"
 *  holding its work (#1466): the same document, so a save waiting on it still settles. */
function movedToCopy(before: EditingContext, now: EditingContext): boolean {
  return !!before.saved.graphicId && conflictCopyOf(before.saved.graphicId)?.id === now.saved.graphicId;
}

/** How long a save waits for a "(conflicted copy)" to reach this tab's library. Its write
 *  commits and is announced in well under a second; past this, the save asks for a name. */
const COPY_ARRIVAL_MS = 10_000;

/** A "(conflicted copy)" another tab's sync pass wrote reaches this tab's library mirror only once
 *  that write commits and is announced (model/durableStore.ts), and the draft's link to it can
 *  arrive first (#1466). Until then a save into it finds no record and would ask for a name, and a
 *  discard would find nothing to restore. Resolves once the copy is readable here (or the wait
 *  runs out); null when there is nothing to wait for, so the caller stays in its own turn. */
function conflictCopyArriving(id: string | null): Promise<void> | null {
  if (!id || typeof window === 'undefined' || graphicById(id) || !isConflictCopy(id)) return null;
  return new Promise((resolve) => {
    const settle = () => {
      window.removeEventListener('spx-data-changed', check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => { if (graphicById(id)) settle(); };
    const timer = setTimeout(settle, COPY_ARRIVAL_MS);
    window.addEventListener('spx-data-changed', check);
  });
}

/** A refused save leaves the link as it is NOW: an edit made during the wait stays dirty. */
function markSaveFailed(before: EditingContext): void {
  if (replacedSince(before)) return;
  const now = useTemplateStore.getState();
  now.setSaved({ ...now.saved, status: 'failed' });
}

/** Steps 5 and 6: link the draft to the record that landed, persist the link and wait for it,
 *  then settle the source's trailing autosave. Unwaited, the link's refusal reached the app's
 *  generic notice after the leave had gone on (#1367). Refused, the draft stays linked to the
 *  record, so a retry writes into it rather than minting another, but it reads unsaved and the
 *  save reports the refusal as its own. */
async function commitLink(link: Omit<EditingContext['saved'], 'status'>): Promise<string | null> {
  useTemplateStore.getState().setSaved({ ...link, status: 'saving' });
  const linked = useTemplateStore.getState();
  const failure = await commitSaveWrites(captureDurableWrites(SLOT_KEY, () => persistLink()).receipts);
  // Replaced meanwhile: the slot is the new document's, written after this one, so the record
  // that landed is the whole answer.
  if (replacedSince(linked)) return null;
  // The live flag: an edit made during this wait has already set `dirty`.
  const now = useTemplateStore.getState().saved;
  if (failure) {
    linked.setSaved({ ...now, dirty: true, status: 'failed' });
    return failure;
  }
  await settleTrailingAutosave(linked);
  // 'Saved' shows only once nothing of this save is still being written. Another write's
  // refusal, announced during the wait, keeps its 'failed'.
  const settled = useTemplateStore.getState().saved;
  if (!replacedSince(linked) && settled.status === 'saving') linked.setSaved({ ...settled, status: 'idle' });
  return null;
}

/** Where a first save / Save As puts the graphic. Packages are retired (docs/GOALS_ARCHIVE.md
 *  "Student release" step 3): every save is standalone in the flat library, and grouping
 *  happens in a PRODUCTION's own pool. The envelope type stays so every caller keeps one
 *  signature. */
export type SaveDestination = { kind: 'standalone' };

/**
 * Save the working template into its linked library record. Returns 'needs-name' when the
 * document has never been saved — the caller opens the save dialog instead.
 *
 * ASYNC because the durable store confirms a write a moment after taking it
 * (model/durableStore.ts): the save transaction above waits for every write it made or claimed
 * (the record, the draft's link and its trailing autosave) and CLAIMS their failure, so this
 * still answers 'failed' for a save that did not land — the caller makes the same decision it
 * always did, one await later, rather than being told 'saved' and corrected by a dialog
 * afterwards.
 */
export function saveCurrentGraphic(opts?: {
  /** Write the record's NAME too. The wizard passes the name in its Finish field, which the
   *  reader may have changed since the record was made: without this the record would keep the
   *  old name while its template carried the new one, so Home, the topbar and the exported
   *  folder would disagree. ONE write, not two - `updateGraphic` sets `template.name` from it. */
  name?: string;
}): Promise<'saved' | 'needs-name' | 'failed'> {
  return transaction(() => saveLinked(opts?.name));
}

async function saveLinked(name?: string): Promise<'saved' | 'needs-name' | 'failed'> {
  if (!useTemplateStore.getState().saved.graphicId) return 'needs-name';
  const arriving = conflictCopyArriving(useTemplateStore.getState().saved.graphicId);
  if (arriving) {
    // The wait shows as saving; whatever follows sets the status it ends in.
    const { saved, setSaved } = useTemplateStore.getState();
    setSaved({ ...saved, status: 'saving' });
    await arriving;
    const now = useTemplateStore.getState().saved;
    if (now.status === 'saving') setSaved({ ...now, status: saved.status });
  }
  prepareEmptyOut();
  const s = useTemplateStore.getState();
  if (!s.saved.graphicId) return 'needs-name';
  // A community pack's record keeps its design (spec AC-5). A working document still linked to
  // one (opened before the lock) saves as a new graphic instead, which Save As stamps the same.
  if (designLocked(graphicById(s.saved.graphicId))) return 'needs-name';
  const inFlight = claimInFlight();
  s.setSaved({ ...s.saved, status: 'saving' });
  // The key is ADDED rather than set to undefined: `updateGraphic` copies the patch with
  // Object.assign, which would write an undefined name straight onto the record.
  const patch = { template: s.template, baseline: s.baseline, aiSpec: s.aiSpec, aiThread: s.aiThread, legibility: s.legibility };
  const graphicId = s.saved.graphicId;
  const { result: { doc, error }, receipts } = captureDurableWrites(LIBRARY_KEY, () => updateGraphic(graphicId, name ? { ...patch, name } : patch));
  const failure = error ?? (await commitSaveWrites(receipts));
  if (!doc) {
    // The record vanished (deleted on another device): fall back to naming it fresh.
    s.setSaved({ graphicId: null, dirty: true, status: 'idle' });
    await inFlight;
    return 'needs-name';
  }
  if (failure) {
    markSaveFailed(s);
    await inFlight;
    return 'failed';
  }
  await inFlight;
  // An unknown catalogue format is not a broken document, so the save LANDS and reports it.
  // Recorded on the save rather than derived live because the save word answers "what did the
  // write you just made carry", not "what is this document" - the format's own live surfaces are
  // the topbar line and the canvas chip (components/ProjectFormatMeta.tsx). That is also why
  // openGraphicDoc below leaves it unset: opening a graphic is not a save.
  const formatIssues = validateProjectFormat(s.template.resolution, s.template.fps);
  if (replacedSince(s)) return 'saved';
  // A sync pass found the record taken by another device's version while it was written, and
  // moved the draft to the "(conflicted copy)" holding its work (#1466): the save settles there.
  const now = useTemplateStore.getState(), moved = movedToCopy(s, now);
  const link = moved ? { graphicId: now.saved.graphicId, dirty: now.saved.dirty } : { graphicId: doc.id, dirty: changedSince(s) };
  return (await commitLink({ ...link, formatIssues })) ? 'failed' : 'saved';
}

/** First save or Save As: mint a new library record and link the working document to it. The
 *  answer carries the record's id whenever one was minted, whether or not its link landed, so a
 *  caller that retries writes into it rather than minting again. */
export function saveGraphicAs(name: string, _dest: SaveDestination): Promise<{ ok: boolean; error: string | null; graphicId?: string }> {
  // Failed, replaced or linked, the mint is over: this tab's later writes no longer speak for
  // its record.
  return transaction(() => mintGraphic(name).finally(endMint));
}

async function mintGraphic(name: string): Promise<{ ok: boolean; error: string | null; graphicId?: string }> {
  prepareEmptyOut();
  const s = useTemplateStore.getState();
  const inFlight = claimInFlight();
  // Step 2: the id is in the slot BEFORE its record exists. A refused link write after a landed
  // record used to leave the slot unlinked, and after a reload the next Save minted a second
  // record (#1383). Every slot write of the document has carried it since its first one, the
  // autosaves that fire while this save waits included (model/project.ts `reservedGraphicId`),
  // so this write is only the last of them: when it and the link write are both refused, the
  // slot still names the record. It is queued in the same turn as the record, and IndexedDB
  // commits transactions on one store in the order they were made, so it lands first. Its
  // refusal is claimed and fails nothing: the earlier writes and the link write name the record
  // too. An id another record already holds (a second tab minted it) is never minted again, and
  // only this tab's writes made during the mint say that the record is this draft's (#1402).
  const id = mintReservedGraphicId(s.baseline);
  const reserved = captureDurableWrites(SLOT_KEY, persistLink).receipts.map(commitDurableReceipt);
  const { result: { doc, error }, receipts } = captureDurableWrites(LIBRARY_KEY, () => createGraphic(s.template, {
    id,
    name,
    packageId: null,
    baseline: s.baseline,
    aiSpec: s.aiSpec,
    aiThread: s.aiThread,
    legibility: s.legibility,
    // A copy of a community pack's graphic is still the pack's (spec AC-5), as Duplicate keeps it.
    fromPack: s.saved.graphicId ? graphicById(s.saved.graphicId)?.fromPack ?? null : null,
  }));
  const failure = error ?? (await commitSaveWrites(receipts));
  await Promise.all([inFlight, settleClaimed(reserved)]);
  if (failure) {
    markSaveFailed(s);
    return { ok: false, error: failure };
  }
  if (replacedSince(s)) return { ok: true, error: null, graphicId: doc.id };
  const dirty = changedSince(s), now = useTemplateStore.getState().template;
  // The working template adopts the saved name so the topbar and the record agree. It is the
  // CURRENT template, so an edit made during the wait is kept; a rename made then stays too.
  if (doc.template.name !== now.name && now.name === s.template.name) {
    useTemplateStore.setState({ template: { ...now, name: doc.name } });
  }
  // An unknown catalogue format is not a broken document, so the save lands and reports it.
  const formatIssues = validateProjectFormat(doc.template.resolution, doc.template.fps);
  // The record took the id: the link write names it, and carries the document's next one.
  releaseReservation();
  // A sync pass that ran while the record was written found the id taken by another device's
  // record (#1443): the draft links to the "(conflicted copy)" that holds its work, clean when it
  // holds exactly that (#1466). A copy this tab never heard of leaves it unlinked.
  const copy = conflictCopyOf(doc.id);
  const lost = copy || isGraphicSuperseded(doc.id);
  const linkFailure = await commitLink({ ...(lost ? linkAfterLoss(useTemplateStore.getState(), copy) : { graphicId: doc.id, dirty }), formatIssues });
  // The record is minted: a retry writes into `graphicId` (SaveDialog) instead of minting again.
  return { ok: !linkFailure, error: linkFailure, graphicId: doc.id };
}


/**
 * Load a library graphic into the editor as the working document. The caller has already
 * cleared the unsaved-changes guard. Applies the doc's ACTIVE control entry (if any) into
 * the sample data, so the active data reaches the editor preview.
 */
export function openGraphicDoc(doc: GraphicDoc, opts?: { keepGalleryOpen?: boolean }): void {
  applyGraphicDoc(doc, opts);
  persistLink();
}

function applyGraphicDoc(doc: GraphicDoc, opts?: { keepGalleryOpen?: boolean }): void {
  const store = useTemplateStore.getState();
  store.applyTemplate(doc.template, { resetSampleData: true, keepGalleryOpen: opts?.keepGalleryOpen });
  useDocKindStore.getState().setKind('spx');
  if (doc.baseline) useTemplateStore.setState({ baseline: doc.baseline });
  // The swap cleared the working spec and conversation; a saved AI creation brings its own back.
  useTemplateStore.setState({ aiSpec: doc.aiSpec ?? null, aiThread: normalizeThread(doc.aiThread) });
  useTemplateStore.getState().setLegibility(doc.legibility ?? null);
  const entry = doc.activeEntryId ? doc.entries.find((e) => e.id === doc.activeEntryId) : null;
  if (entry) {
    for (const [field, value] of Object.entries(entry.values)) {
      useTemplateStore.getState().setSampleValue(field, value);
    }
  }
  useTemplateStore.getState().setSaved({ graphicId: doc.id, dirty: false, status: 'idle' });
}

export function openGraphicById(id: string): boolean {
  const doc = graphicById(id);
  // A community pack's graphic is never the working document: its design is locked (spec AC-5).
  if (!doc || designLocked(doc)) return false;
  openGraphicDoc(doc);
  return true;
}

/** Discard the working draft, never its library or production copies. A navigation does
 * not replace the document, so clearing only `dirty` would retain the discarded artwork. */
export function discardCurrentGraphic(): Promise<string | null> {
  // The editing context the user chose to discard, taken at the click, before any wait: an
  // edit accepted during a wait (a save ahead of it, or either wait below) must refuse the
  // discard rather than be erased (#1147).
  const before = useTemplateStore.getState();
  return transaction(() => discardDraft(before));
}

async function discardDraft(before: EditingContext): Promise<string | null> {
  // Drain a pending autosave before staging the replacement, otherwise its timer can
  // overwrite the discard while its durable confirmation is still pending.
  flushPendingProject();
  const pendingFailure = await commitDurableWrites();
  if (pendingFailure) return pendingFailure;
  const arriving = conflictCopyArriving(before.saved.graphicId);
  if (arriving) await arriving;
  const doc = before.saved.graphicId ? graphicById(before.saved.graphicId) : null;
  const template = doc?.template ?? createDefaultTemplate();
  // Changing source or baseline clears the editor's private command history. Persist
  // first: rolling back the visible store cannot roll back a disposed editor session.
  const { receipts } = captureDurableWrites(SLOT_KEY, () => saveProject(
    template, doc?.baseline ?? template, { graphicId: doc?.id ?? null, dirty: false },
    doc?.aiSpec ?? null, normalizeThread(doc?.aiThread), doc?.legibility ?? null,
  ));
  if (!receipts.length) return 'Could not discard. Your changes are still open. Try again.';
  const failures = await Promise.all(receipts.map(commitDurableReceipt));
  const failure = failures.find(Boolean);
  if (failure) return failure;
  if (changedSince(before)) {
    // The slot now holds the replacement. Refuse only once the newer draft is durable again,
    // so a reload straight after the refusal cannot reopen the discarded copy.
    const { receipts: restored } = captureDurableWrites(SLOT_KEY, () => persistLink());
    const restoreFailure = restored.length
      ? (await Promise.all(restored.map(commitDurableReceipt))).find(Boolean)
      : 'Could not save your changes to this browser. They are still open. Save them before leaving.';
    return restoreFailure ?? 'The graphic changed while discarding. Your changes are still open. Try again.';
  }
  // The pending continuation owns navigation. Keep a wizard open until it runs.
  if (doc) applyGraphicDoc(doc, { keepGalleryOpen: true });
  else {
    before.applyTemplate(template, { resetSampleData: true, keepGalleryOpen: true });
    useTemplateStore.getState().setSaved({ graphicId: null, dirty: false, status: 'idle' });
  }
  useTemplateStore.setState({ history: [], future: [], selectedParts: [], selectedPart: null });
  return null;
}

/**
 * Would replacing the working document lose something the user did? This is the guard's
 * question, and `saved.dirty` alone answers a different one.
 *
 * A LINKED document (it has a library record) has lost work exactly when it drifted from that
 * record, which is what `dirty` says. A NEVER-SAVED one is dirty from birth: the whole-project
 * swap that made it marks it so (templateStore `applyTemplate`), because it is in no library and
 * the Save button must say so. The wizard's "Edit this graphic" door makes exactly that, by
 * design - it saves nothing (e2e/editor-base-edits.spec.ts B01). Guarding on `dirty` then asked
 * "has unsaved changes. Save them?" on the next + New graphic from Home with nothing edited at
 * all (owner, 2026-10-07), on every visit, since the flag persists. Until it is edited such a
 * document is still the pristine baseline it was created as, so it is compared with that:
 * equal means nothing anyone did is at risk, and the switch goes ahead without asking.
 */
export function hasUnsavedWork(state: Pick<EditingContext, 'saved' | 'template' | 'baseline'> = useTemplateStore.getState()): boolean {
  const { saved, template, baseline } = state;
  if (!saved.dirty) return false;
  if (saved.graphicId) return true;
  return JSON.stringify(template) !== JSON.stringify(baseline);
}

/**
 * The leave guard's Save & continue. A Save-family operation still running when the leave was
 * asked for (a topbar Save, Ctrl+S) is waited for first: if it landed what the draft holds, its
 * answer is this one, and nothing is written twice. Otherwise, a refusal included, this saves.
 */
export async function saveBeforeLeave(): Promise<'saved' | 'needs-name' | 'failed'> {
  if (running) await running;
  // A refused save of a clean graphic leaves `dirty` false, and is retried all the same.
  const failed = useTemplateStore.getState().saved.status === 'failed';
  return hasUnsavedWork() || failed ? saveCurrentGraphic() : 'saved';
}

// ── The save/guard UI store ──────────────────────────────────────────────────────────────────

export interface SaveUiState {
  /** The name-and-destination dialog: first save, or an explicit Save As. `then` runs after a
   *  successful save (the guard's "Save first, then continue" continuation). */
  saveDialog: { mode: 'first' | 'save-as'; then?: () => void } | null;
  /** The unsaved-changes guard: `proceed` performs the destructive switch when confirmed;
   *  `cancel` runs when the user backs out (e.g. a route-driven open rewinds the URL). With
   *  `resume`, what is at risk is a wizard walk left mid-way (`heldWalk`), not the working
   *  document, and `resume` is the way back into it. */
  confirmSwitch: { proceed: () => void; cancel?: () => void; resume?: () => void } | null;
  /**
   * The wizard was LEFT mid-walk (its Home door, or browser Back) with work in it. It keeps the
   * walk in memory, but every open wipes it for a fresh one, so a door that opens the wizard
   * would discard that work. The wizard sets this as it closes and clears it as it opens.
   */
  heldWalk: boolean;
  /** One-shot for the wizard's next open: go back into the held walk instead of starting fresh. */
  resumeWalk: boolean;
  /** A Save, Save As or Discard is running or queued (`transaction`): its writes are unsettled. */
  inFlight: boolean;
  openSaveDialog: (mode: 'first' | 'save-as', then?: () => void) => void;
  closeSaveDialog: () => void;
  /** Dismiss the guard without proceeding (runs its `cancel`, if any). */
  closeConfirm: () => void;
  /** Dismiss the guard because the switch happened (never runs `cancel`). */
  settleConfirm: () => void;
  /**
   * Run `proceed` (leaving the editor or replacing its document) behind the guard: a document
   * with work the switch would lose asks first (`hasUnsavedWork`), and so does any switch while a
   * save is still unsettled (`inFlight`): its refusal must find the user where it can be answered,
   * not at the destination (#1392). Any other switches at once.
   * A door that opens the wizard FRESH passes `resume` as well, so a held walk is asked about
   * first, under the same rule: the wizard holds it only when it has work in it.
   */
  requestSwitch: (proceed: () => void, cancel?: () => void, resume?: () => void) => void;
}

export const useSaveUi = create<SaveUiState>((set, get) => ({
  saveDialog: null,
  confirmSwitch: null,
  heldWalk: false,
  resumeWalk: false,
  inFlight: false,
  openSaveDialog: (mode, then) => set({ saveDialog: { mode, then } }),
  closeSaveDialog: () => set({ saveDialog: null }),
  closeConfirm: () => {
    const cancel = get().confirmSwitch?.cancel;
    set({ confirmSwitch: null });
    cancel?.();
  },
  settleConfirm: () => set({ confirmSwitch: null }),
  requestSwitch: (proceed, cancel, resume) => {
    // Browser navigation can arrive through an open modal. Keep the first decision and
    // its destination instead of stacking guards or replacing a first-save continuation.
    if (get().confirmSwitch || get().saveDialog) return;
    if (resume && get().heldWalk) set({ confirmSwitch: { proceed, cancel, resume } });
    else if (get().inFlight || hasUnsavedWork()) set({ confirmSwitch: { proceed, cancel } });
    else proceed();
  },
}));
