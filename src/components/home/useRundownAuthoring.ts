// AUTHORING THE RUNDOWN of the playout dashboard (home/ProductionPage.tsx): its edits, the
// selection's range, the clipboard, the pictures upload and the cloud refresh (parent spec
// docs/work-specs/production-page-refactor/spec.md, phase 8). Nothing here airs: a removal takes
// what it removes off air first through the page's `offAir(graphic)` and `serverOut(cue)`, and
// every write waits for the cue being typed through `flush`.
//
// Two parts, as home/useProductionPublish.ts has, because the page returns early while its
// production is missing and a hook cannot be called after that return. `useRundownAuthoring`
// holds the state and is called where that state always stood, so the page's hooks keep their
// order. `rundownActions` is called by the page after the return on every render, so each handler
// closes over that render's values exactly as the inline code did.

import { useRef, useState, type RefObject } from 'react';
import {
  addShowCue,
  addFolderFromSelection,
  loadShows,
  moveInRundown,
  pasteInRundown,
  removeFolder,
  removePlayoutItemChecked,
  removeShowCuesChecked,
  removeShowGraphicChecked,
  setFolderCollapsed,
  takeCuesOutOfFolders,
  updateShowCue,
  type PlayoutItem,
  type Show,
  type ShowCue,
  type ShowFolder,
} from '../../model/shows';
import type { Movable, Place } from '../../model/showFolders';
import { rangeCueIds, rowTestId, type RundownView } from '../../model/rundownRows';
import { clipSize, copyClip, cutClip, type CueClip } from '../../model/cueClipboard';
import { canAuthorAccount, commitDurableWrites } from '../../model/durableStore';
import type { Resolution } from '../../model/types';
import { DEFAULT_GRAPHICS_RESOLUTION } from '../../model/projectFormat';
import { templateForSavedGraphic, type loadGraphics } from '../../model/library';
import { serverCueLive, type ServerOnAir } from '../../control/serverPlayout';
import { addReadyGraphicToShow as addGraphicToShow } from '../../control/productionAdmission';
import { importImageFile } from '../../assets/imageImport';
import {
  addPictureToTemplate,
  createPictureTemplate,
  MAX_PICTURES,
  PICTURE_FIELD,
  PICTURE_GRAPHIC_NAME,
  pictureLabel,
} from '../../templates/picture';
import { pictureUploadTarget } from '../../templates/pictureTarget';
import { flushTeamProduction, refreshTeams, getTeamState } from '../../backend/teamProductions';
import { syncNow, getSyncState } from '../../backend/syncController';
import { revealCue, stepSelection, type PlayoutVerb } from '../playoutKeys';
import type { AuthUiState } from '../auth/useAuthState';
import type { useAuthUi } from '../auth/authUi';
import type { useRundownHistory } from './useRundownHistory';

/** The rundown's authoring state: the range, the clipboard, what authoring last said, and the
 *  refresh in flight. Page memory, never saved. `owner` is who the page is for in this render (the
 *  page's `publishOwner`): a refresh whose answer arrives for another is dropped. */
export function useRundownAuthoring(owner: { id: string; userId: string | undefined }) {
  /** THE SHIFT-CLICK RANGE (owner, 2026-09-28), by cue id as it was when clicked: what New folder
   *  takes. No on-air verb reads it, so a stray shift-click changes nothing that airs. */
  const [rangeIds, setRangeIds] = useState<readonly string[]>([]);
  /** The far end of the range Shift with Up or Down walks, by row id; the cursor is the other end. */
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  /** THE RUNDOWN'S CLIPBOARD (docs/CLIP_PLAYBACK_PLAN.md §20.2): what Ctrl+C or Ctrl+X last took, in
   *  this page's memory only (model/cueClipboard.ts). */
  const [clip, setClip] = useState<CueClip | null>(null);
  const pendingClip = useRef<Promise<CueClip | null> | null>(null);
  /** What the rundown's authoring last said: a refused drop, or a folder write that did not land. */
  const [rundownNote, setRundownNote] = useState<string | null>(null);
  const rundownFeedback = useRef<HTMLDivElement>(null);
  const [refreshingRundown, setRefreshingRundown] = useState(false);
  const refreshingId = useRef<string | null>(null);
  const pageOwner = useRef(owner);
  pageOwner.current = owner;
  return {
    rangeIds, setRangeIds, rangeEnd, setRangeEnd, clip, setClip, pendingClip,
    rundownNote, setRundownNote, rundownFeedback, refreshingRundown, setRefreshingRundown, refreshingId, pageOwner,
  };
}

export type RundownAuthoringState = ReturnType<typeof useRundownAuthoring>;

/** What the handlers read of the page's render: its values as they stand, and the page's own verbs. */
export interface RundownActionsIo {
  id: string;
  show: Show;
  setShows: (shows: Show[]) => void;
  setNote: (note: string | null) => void;
  /** The cue editor's draft: a removal drops it. */
  setDraft: (draft: null) => void;
  library: ReturnType<typeof loadGraphics>;
  cues: readonly ShowCue[];
  graphicByPoolId: ReadonlyMap<string, Show['graphics'][number]>;
  playoutItems: readonly PlayoutItem[];
  serverOnAir: ServerOnAir;
  playoutItemFor: (cue: ShowCue) => PlayoutItem | null;
  rundown: RundownView;
  range: ReadonlySet<string>;
  cursorRow: string | null;
  selectedCue: ShowCue | null;
  selectedFolder: ShowFolder | null;
  heldMembers: readonly ShowCue[];
  inRundownOrder: (ids: Iterable<string>) => string[];
  selectCue: (cueId: string) => void;
  history: ReturnType<typeof useRundownHistory>;
  /** Land the cue being typed; false when it did not. */
  flush: () => Promise<boolean>;
  /** The production this page is on now, for an answer that arrives after a switch. */
  draftOwner: RefObject<string>;
  backendConfigured: boolean;
  user: AuthUiState['user'];
  openSignIn: ReturnType<typeof useAuthUi.getState>['openSignIn'];
  /** Take a graphic off air, if it is up (the page's `takeOffAir`). */
  offAir: (graphic: string) => Promise<void>;
  /** A server cue's own Out (the page's `playoutVerb(cue, 'out', 'Out')`). */
  serverOut: (cue: ShowCue) => Promise<unknown>;
}

/** The rundown's authoring handlers, over one render of the page. */
export function rundownActions(state: RundownAuthoringState, io: RundownActionsIo) {
  const { clip, setClip, pendingClip, rangeEnd, setRangeIds, setRangeEnd, setRundownNote, setRefreshingRundown, refreshingId, pageOwner } = state;
  const {
    id, show, setShows, setNote, setDraft, library, cues, graphicByPoolId, playoutItems, serverOnAir, playoutItemFor, rundown, range, cursorRow,
    selectedCue, selectedFolder, heldMembers, inRundownOrder, selectCue, history, flush: flushDraft, draftOwner,
    backendConfigured, user, openSignIn, offAir: takeOffAir, serverOut,
  } = io;

  const refreshRundown = async () => {
    if (refreshingId.current || !show) return;
    if (!backendConfigured) { setRundownNote('This is a local workspace. There is no cloud rundown to refresh.'); return; }
    if (!user || !canAuthorAccount()) { openSignIn('Sign in to refresh your rundown. Pending work is preserved.', 'resume'); return; }
    const owner = { id, userId: user.id };
    refreshingId.current = id;
    setRefreshingRundown(true);
    setRundownNote('Refreshing rundown…');
    try {
      window.dispatchEvent(new CustomEvent('noacg-account-authoring-flush'));
      await history.settle();
      const storageError = await commitDurableWrites();
      if (storageError) throw new Error(storageError);
      if (show.teamId) {
        const saveError = await flushTeamProduction(id);
        if (saveError) throw new Error(saveError);
        await refreshTeams();
        const fresh = getTeamState();
        if (fresh.loadError || fresh.saving[id]) throw new Error(fresh.loadError ?? fresh.notes[id] ?? 'Saving is not yet confirmed.');
        if (!fresh.heads[id]) throw new Error('This production is no longer available to your account.');
      } else {
        // Applying a cloud pull announces a durable change and schedules a confirmation
        // pass. Await that pass too; receiving new cues must not itself look like failure.
        for (let pass = 0; pass < 3; pass++) {
          await syncNow();
          if (getSyncState().phase !== 'pending') break;
        }
        const fresh = getSyncState();
        if (fresh.phase !== 'synced') throw new Error(fresh.detail ?? 'The current cloud revision could not be confirmed.');
      }
      if (pageOwner.current.id !== owner.id || pageOwner.current.userId !== owner.userId) return;
      setShows(loadShows());
      setRundownNote('Rundown refreshed from cloud.');
    } catch (error) {
      if (pageOwner.current.id === owner.id && pageOwner.current.userId === owner.userId) setRundownNote(`Refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally { refreshingId.current = null; setRefreshingRundown(false); }
  };

  /**
   * Upload pictures into the production (the PICTURE graphic — src/templates/picture.ts).
   *
   * ONE picture graphic per production, holding every uploaded still, with one CUE per picture.
   * That is the cue model as designed: many cues over one pool graphic means taking picture 3
   * replaces picture 1 on the same layer instead of stacking a second still over it.
   *
   * It is deliberately NOT a library graphic. The production page may not write into a document
   * it only references (the rule the cue editor's image picker states), so the picture graphic
   * belongs to the pool instead — which also means `templateForSavedGraphic` resolves the POOL
   * copy, the one this handler updates. A picture graphic pooled FROM the library is left alone,
   * and a new one is named so no lookup by name can capture it (templates/pictureTarget.ts).
   */
  const uploadPictures = async (files: File[]) => {
    if (files.length === 0) return;
    // The production's OWN picture graphic, never one pooled from the library (pictureTarget.ts).
    const { existing, name } = pictureUploadTarget(show.graphics, library.map((d) => d.name), PICTURE_GRAPHIC_NAME);
    // The stage the pictures are drawn on, derived the way the output payload derives it, so an
    // upload into a 4K production keeps 4K pixels instead of being capped at 1080.
    const stage = show.graphics.reduce<Resolution>((r, g) => {
      const res = templateForSavedGraphic(g, library).resolution;
      return { width: Math.max(r.width, res.width), height: Math.max(r.height, res.height), label: r.label };
    }, DEFAULT_GRAPHICS_RESOLUTION);
    let template = existing ? existing.template : { ...createPictureTemplate('', stage), name };
    const room = MAX_PICTURES - template.assets.length;
    if (room <= 0) {
      setNote(`This production already holds ${MAX_PICTURES} pictures. Remove one before adding another.`);
      return;
    }
    const chosen = files.slice(0, room);
    const added: { path: string; label: string }[] = [];
    for (const file of chosen) {
      // Downscaled here, in the browser, before the bytes ever leave the tab: every picture is
      // base64'd into the published output row, so an untouched phone photo would cost megabytes
      // on every renderer AND operator page load.
      const { data } = await importImageFile(file, Math.max(stage.width, stage.height));
      const result = addPictureToTemplate(template, { fileName: file.name, data });
      template = result.template;
      added.push({ path: result.path, label: pictureLabel(file.name, added.length) });
    }
    // Replacing by NAME keeps the pool id, the layer and every cue already prepared against it.
    // Each step waits for its durable write, so no cue is written over a picture graphic that did
    // not land and the ✓ below is never said over a refused save
    // (components/never-report-save-storage-layer-has).
    const { shows: afterPool, error } = addGraphicToShow(show.id, template, {});
    setShows(afterPool);
    const poolFailure = error ?? (await commitDurableWrites());
    if (poolFailure) {
      setNote(`The pictures were not added: ${poolFailure}`);
      return;
    }
    const poolId = afterPool
      .find((s) => s.id === show.id)
      ?.graphics.find((g) => g.name === template.name)?.id;
    if (poolId) {
      // A NEW graphic arrives with one cue already seeded from its field defaults, and the first
      // picture IS that default — so only the pictures after it need cues of their own.
      const needCues = existing ? added : added.slice(1);
      let next = afterPool;
      if (!existing && added.length > 0) {
        // That seeded cue is labelled after the GRAPHIC ("Pictures"), which is the right default
        // for a lower third and the wrong one here: an operator scanning the rundown is looking
        // for the picture's own name.
        const seeded = next.find((s) => s.id === show.id)?.cues?.find((c) => c.sourceId === poolId);
        if (seeded) next = updateShowCue(show.id, seeded.id, { label: added[0].label });
      }
      for (const picture of needCues) {
        next = addShowCue(show.id, poolId, {
          label: picture.label,
          values: { [PICTURE_FIELD]: picture.path },
        }).shows;
      }
      setShows(next);
      const cueFailure = await commitDurableWrites();
      if (cueFailure) {
        setNote(`The pictures were added, but not all of their cues were saved: ${cueFailure}`);
        return;
      }
    }
    const skipped = files.length - chosen.length;
    setNote(
      `✓ ${chosen.length} picture${chosen.length === 1 ? '' : 's'} added` +
        (skipped > 0 ? `, ${skipped} skipped (${MAX_PICTURES} per production)` : '') +
        // Assets are pinned at publish, so a picture does not reach a running renderer until
        // the production is published again — said here rather than discovered on air. An
        // unpublished production has nothing to re-publish, so it is not told to.
        (show.outputSlug ? '. Publish again to put them on the output.' : '.'),
    );
  };

  /** Remove one cue. When it is its graphic's LAST cue the graphic goes with it (shows.ts
   *  removeShowCue): the rundown is the only list of what a production holds, so nothing may
   *  survive out of sight of it. */
  const removeCue = async (cue: ShowCue) => {
    const entry = graphicByPoolId.get(cue.sourceId);
    const isLast = cues.filter((c) => c.sourceId === cue.sourceId).length === 1;
    if (isLast && entry) await takeOffAir(entry.name);
    // A server cue that is up goes off with its row, the same courtesy a graphic gets.
    if (serverCueLive(serverOnAir, playoutItemFor(cue), cue)) await serverOut(cue);
    setDraft(null);
    await writeRundown(() => removeShowCuesChecked(show.id, [cue.id]), 'Delete cue');
  };

  /** Remove a graphic and every cue prepared against it — the one gesture for getting a graphic
   *  out of the production without deleting its rows one by one. */
  const removeGraphic = async (poolId: string) => {
    const entry = graphicByPoolId.get(poolId);
    if (!entry) {
      // The same gesture over a playout item: its cues go, and whatever is up goes off first.
      const live = cues.find((c) => c.id === serverOnAir[poolId]?.cueId);
      if (live) await serverOut(live);
      if (playoutItems.some((i) => i.id === poolId)) {
        setDraft(null);
        await writeRundown(() => removePlayoutItemChecked(show.id, poolId), 'Delete source');
      }
      return;
    }
    await takeOffAir(entry.name);
    setDraft(null);
    await writeRundown(() => removeShowGraphicChecked(show.id, poolId), 'Delete source');
  };

  // ── THE RUNDOWN'S FOLDERS, as authored (plan §7). Making, moving and removing one tells the operator
  // only once the durable write has landed (components/never-report-save-storage-layer-has). ──
  /** One authoring write of the rundown, said only once it lands. True when it did. */
  const writeRundown = async (write: () => { shows: Show[]; error: string | null; refused?: string | null }, label: string, failed = 'The edit was not saved'): Promise<boolean> => {
    if (!(await flushDraft())) return false;
    return history.write(write, label, failed);
  };

  // ── EDITING THE RUNDOWN (docs/CLIP_PLAYBACK_PLAN.md §20.2): the selection's menu actions, and copy,
  // cut and paste. Nothing here airs, and none of it moves the cursor or PREVIEW. ──
  /** The production as saved once the edit being typed has landed: what a copy is made of. */
  const freshShow = async () => {
    await flushDraft(); await history.settle();
    return loadShows().find((s) => s.id === show.id) ?? show;
  };
  /** The cues an edit takes: the selection, else the held folder's cues, else the cursor's cue. */
  const editIds = (): string[] =>
    range.size ? inRundownOrder(range) : selectedFolder ? heldMembers.map((c) => c.id) : selectedCue ? [selectedCue.id] : [];
  /** Where a paste lands: after the cursor's cue, joining its folder; last in a held folder; at the end. */
  const pastePlace = (): Place => (selectedFolder ? { into: selectedFolder.id } : selectedCue ? { after: selectedCue.id } : { end: true });
  /** Paste a clip at a place, one write; what landed becomes the selection. */
  const pasteAt = async (what: CueClip, place: Place, failed: string, selectSingle = false) => {
    let landed: string[] = [];
    const ok = await writeRundown(() => {
      const r = pasteInRundown(show.id, what, place);
      landed = r.cueIds;
      return r;
    }, failed);
    if (!ok) return;
    if (what.kind === 'cut') setClip(null);
    if (selectSingle && landed.length === 1) selectCue(landed[0]);
    else setRangeIds(landed);
    setRangeEnd(null);
  };
  const duplicateCues = async (ids: readonly string[]) => {
    const copies = copyClip(await freshShow(), ids, (label) => `${label} copy`);
    const last = inRundownOrder(ids).pop();
    if (copies && last) await pasteAt(copies, { after: last }, 'Duplicate cues', ids.length === 1);
  };
  const takeOutOfFolders = async (ids: readonly string[]) => {
    await writeRundown(() => takeCuesOutOfFolders(show.id, ids), 'Move cues', 'The move was not saved');
  };
  /** Remove several cues: each goes off air first as one removal would - a graphic whose last cue is
   *  among them, and any server cue that is up - then one write. */
  const removeCues = async (ids: readonly string[]) => {
    const gone = new Set(ids);
    const leaving = cues.filter((c) => gone.has(c.id));
    const staying = new Set(cues.filter((c) => !gone.has(c.id)).map((c) => c.sourceId));
    for (const sourceId of new Set(leaving.map((c) => c.sourceId))) {
      const entry = graphicByPoolId.get(sourceId);
      if (entry && !staying.has(sourceId)) await takeOffAir(entry.name);
    }
    for (const c of leaving) if (serverCueLive(serverOnAir, playoutItemFor(c), c)) await serverOut(c);
    setDraft(null);
    setRangeIds([]);
    await writeRundown(() => removeShowCuesChecked(show.id, ids), 'Delete cues');
  };
  /** The cues Ctrl+X marked, still in the rundown. */
  const cutIds = new Set(clip?.kind === 'cut' ? clip.ids : []);
  const newFolder = async (cueIds: readonly string[]) => {
    if (!cueIds.length) return;
    setRangeIds([]);
    await writeRundown(() => addFolderFromSelection(show.id, cueIds), 'Create folder', 'The folder was not saved');
  };
  const removeFolderOf = (folderId: string) => writeRundown(() => removeFolder(show.id, folderId), 'Remove folder', 'The folder was not removed');
  const moveRundown = (what: Movable, place: Place) => writeRundown(() => moveInRundown(show.id, what, place), 'Move cues', 'The move was not saved');
  /** Collapse or open a folder: a background write that reports nothing. */
  const toggleFolder = (folderId: string) => {
    if (!canAuthorAccount()) return;
    const folder = rundown.folders.get(folderId);
    if (folder) setShows(setFolderCollapsed(show.id, folderId, folder.collapsed !== true));
  };

  /** The rundown-editing keys of the verb dispatcher (docs/CLIP_PLAYBACK_PLAN.md §20.2), which air
   *  nothing: true when `key` was one of them, whatever it then did. */
  const editVerb = (key: PlayoutVerb): boolean => {
    if (!canAuthorAccount() && ['copy', 'cut', 'paste', 'folder-new', 'folder-toggle'].includes(key)) {
      setNote('Account editing is paused. Sign in again; playout remains available.');
      return true;
    }
    if (key === 'copy' || key === 'cut') {
      const ids = editIds();
      const copied = (async () => {
        const taken = key === 'copy' ? copyClip(await freshShow(), ids) : ids.length ? cutClip(show.id, ids) : null;
        if (!taken || draftOwner.current !== show.id) return null;
        setClip(taken);
        const n = clipSize(taken), what = `${n} cue${n === 1 ? '' : 's'}`;
        setNote(key === 'copy' ? `✓ ${what} copied. Ctrl+V pastes after the selected row.` : `✓ ${what} ready to move. Still in place until you paste. Select a row, then Ctrl+V to move after it, or select a folder to move into it. Esc cancels the move.`);
        return taken;
      })();
      pendingClip.current = copied;
      void copied.finally(() => { if (pendingClip.current === copied) pendingClip.current = null; });
      return true;
    }
    if (key === 'paste') {
      const copying = pendingClip.current, place = pastePlace();
      void (async () => {
        const taken = copying ? await copying : clip;
        if (taken && draftOwner.current === show.id) await pasteAt(taken, place, 'Paste cues');
      })();
      return true;
    }
    if (key === 'select-clear') {
      if (clip?.kind === 'cut') {
        setClip(null);
        setNote('✓ Move cancelled. The cues stayed in place.');
      }
      setRangeIds([]);
      setRangeEnd(null);
      return true;
    }
    if (key === 'extend-prev' || key === 'extend-next') {
      const from = range.size && rangeEnd && rundown.rows.some((r) => r.id === rangeEnd) ? rangeEnd : cursorRow;
      const next = stepSelection(rundown.rows, from, key === 'extend-next' ? 1 : -1);
      if (!next) return true;
      setRangeIds(rangeCueIds(rundown, cursorRow, next.id));
      setRangeEnd(next.id);
      revealCue(rowTestId(next));
      return true;
    }
    // A rundown's folders. New folder takes the range, or the cue the cursor is on.
    if (key === 'folder-new') {
      void newFolder(range.size ? [...range] : selectedCue && !selectedCue.folderId ? [selectedCue.id] : []);
      return true;
    }
    if (key === 'folder-toggle') {
      const row = cursorRow ? rundown.rows.find((r) => r.id === cursorRow) : undefined;
      const folderId = row?.kind === 'folder' ? row.folder.id : row?.kind === 'cue' ? row.folderId : undefined;
      if (folderId) toggleFolder(folderId);
      return true;
    }
    return false;
  };

  return {
    refreshRundown, uploadPictures, removeCue, removeGraphic, writeRundown, freshShow, editIds, pastePlace, pasteAt,
    duplicateCues, takeOutOfFolders, removeCues, cutIds, newFolder, removeFolderOf, moveRundown, toggleFolder, editVerb,
  };
}
