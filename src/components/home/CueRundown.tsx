import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { useRouter } from '../../app/router';
import { useTemplateStore } from '../../store/templateStore';
import {
  addGraphicToShow,
  addPlayoutItem,
  addShowCue,
  graphicLayer,
  type PlayoutItem,
  type Show,
  type ShowCue,
  type ShowFolder,
} from '../../model/shows';
import type { SavedGraphic } from '../../model/packets';
import type { GraphicDoc } from '../../model/library';
import { graphicKindLabel } from '../../model/types';
import { folderMode, placeRefusal, type Movable, type Place } from '../../model/showFolders';
import { bandAt, folderName, headerBandAt, planDrop, rowCueIds, rowTestId, type DropPlan, type RundownRow, type RundownView } from '../../model/rundownRows';
import { fieldDescriptors } from '../../control/controlModel';
import {
  channelLabel,
  channelOf,
  channelTitle,
  defaultChannelFor,
  itemSlot,
  loadPlayoutSettings,
  playoutConfigured,
  slotAddress,
  type PlayoutSettings,
} from '../../control/playoutLink';
import type { LiveCueMap } from '../../control/hostedControl';
import { serverCueLive, THROUGH_END, type ThroughRole } from '../../control/serverPlayout';
import type { ServerOwnership, ServerTiming, StorePart } from '../../control/serverPlayoutStore';
import { namesItem } from '../../control/serverState';
import { asFolderMember, effectiveEnd, segmentSeconds, type ClipEnd } from '../../control/cuePlayback';
import type { FolderAir } from '../../control/folderAir';
import { MAX_PICTURES } from '../../templates/picture';
import LibMenu from './LibMenu';
import { SlotRemaining } from './ClipClock';
import FolderRow from './FolderRow';
import { lengthText } from './clipLength';
import PlayoutItemPicker from './PlayoutItemPicker';
import { ArmedTag, RowAutoChip } from './CueTiming';
import { armedNext, readAuto, type CueArms } from '../../control/cueAuto';

/** "A, B and C" — a warning an operator reads under pressure has to be a sentence. */
export function nameList(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** How long the list stays where the operator scrolled it before it follows the air again. */
const FOLLOW_PAUSE_MS = 10_000;

/** Whether a hand scrolled the list within the pause, as of now. */
function scrolledLately(at: number): boolean {
  return Date.now() - at < FOLLOW_PAUSE_MS;
}


/** A clip's own end on its row, after its name; Hold is the default and wears nothing. */
const END_MARKS: Partial<Record<ClipEnd, { glyph: string; says: string; testid: string }>> = {
  loop: { glyph: '⟲', says: 'Loops until Out', testid: 'cue-loop' },
  next: { glyph: '→', says: 'Plays the next clip on its layer', testid: 'cue-next-mark' },
  clear: { glyph: '⌀', says: 'Clears at its end', testid: 'cue-clear-mark' },
};

/**
 * EACH CHANNEL'S TONE (docs/CLIP_PLAYBACK_PLAN.md §20.3), on a row's slot and in the legend: clear of
 * red, amber and green, which already mean on air, preview and published. Keyed by the channel's
 * number, so a channel keeps its tone whatever else the rundown holds.
 */
const CHANNEL_TONES = ['#7dd3fc', '#c4b5fd', '#5eead4', '#a5b4fc'];
export function channelTone(channel: number): string {
  return CHANNEL_TONES[(Math.max(1, channel) - 1) % CHANNEL_TONES.length];
}

/** Where a drag is aimed, and what it would do there. */
interface Aim {
  key: string;
  rowId: string | 'end';
  plan: DropPlan | null;
}

/**
 * THE CUE RUNDOWN of the playout dashboard (docs/PLAYOUT_DASHBOARD.md §2 and §4): the rows, the
 * drag reorder, each row's ⋯ menu, and the rail foot, which is how graphics, pictures and server
 * items get in. Moved out of ProductionPage by phase 1 of docs/backlog/production-page-phases.md.
 *
 * It owns only its own menus and pickers, where the list is scrolled, and where a drag is aimed. What
 * it changes goes to the record through `setShows` or through the page's callbacks, and what is ON
 * AIR comes in as values it only reads: `liveCue` is the Take contract and never leaves the page, so
 * the rundown is handed this render's map and has no way to change it.
 *
 * ONE LINE A ROW (docs/CLIP_PLAYBACK_PLAN.md §6.2), so about twenty rows show at 1080p where ten
 * did. What the old second line carried is moved, never dropped: the kind and the graphic's name
 * are the kind icon's accessible name and tooltip, the operator note is the ✎ mark's, the layer
 * or the server address is the slot at the row's end (still the clash warning when two graphics
 * share a layer), and ON AIR / PVW stay as words beside the tint. e2e/playout-rail-width.spec.ts
 * holds that table.
 *
 * THE SERVER'S WORD (plan §6.2 and §6.7, phase 2): a clip that is up counts its remaining time in
 * the length column, a clip waiting on the server behind another wears NEXT ON SERVER, a cue whose
 * slot something else took over says it was replaced on the server, and whatever stands on a
 * rundown slot that no cue here put there is listed above the rows as an unidentified item. The
 * rows read the store's OWNERSHIP part as a prop; each remaining time subscribes to the TIMING
 * part itself, so the list around it never redraws with the clock.
 *
 * FOLDERS (plan §6.2, §6.6 and §7, phase 4): the rows come from `rundownView` - a header for each run
 * of a folder, its cues indented under it unless it is collapsed - so a folder is one row for the
 * keys, the drag and a Take. A shift-click marks a range and moves nothing. A drag lands by the third
 * of the row it is over and is ONE write however far it goes (`moveInRundown`), with a line showing
 * where; a drop a Play-through folder refuses says why while it hovers.
 */
export default function CueRundown({
  show,
  cues,
  rundown,
  graphicByPoolId,
  library,
  playoutSettings,
  liveCue,
  unsentOnAir,
  serverOwnership,
  serverTiming,
  selectedCueId,
  previewCueId,
  selectedGraphicId,
  heldFolderRowId,
  cursorRowId,
  range,
  cutIds,
  folderAir,
  takeMisses,
  cueArms,
  toggleHold,
  manualLane,
  stepNext,
  rundownNote,
  clashes,
  offstage,
  cueView,
  cueGraphicName,
  playoutItemFor,
  folderSlotOf,
  throughRoleOf,
  selectCue,
  clickRow,
  clearRange,
  onLayerRepair,
  removeCue,
  removeCues,
  removeGraphic,
  newFolder,
  duplicateCues,
  takeOutOfFolders,
  removeFolder,
  moveRundown,
  toggleFolder,
  setRundownNote,
  uploadPictures,
  flushDraft,
  setShows,
}: {
  show: Show;
  cues: ShowCue[];
  /** The rows as drawn (model/rundownRows.ts). */
  rundown: RundownView;
  graphicByPoolId: ReadonlyMap<string, SavedGraphic>;
  library: GraphicDoc[];
  playoutSettings: PlayoutSettings;
  /** Which cue is on air on each graphic's layer. Read-only here. */
  liveCue: LiveCueMap;
  /** The ON-AIR cues edited since they were sent (the editor's "not on air yet", said on the row). */
  unsentOnAir: ReadonlySet<string>;
  /** What this page put up on the playout server, and what the server says besides. Read-only. */
  serverOwnership: ServerOwnership;
  /** Where each server clip is, for the remaining times - subscribed to by those cells alone. */
  serverTiming: StorePart<ServerTiming>;
  /** The selected cue - null while a folder row is held. */
  selectedCueId: string | null;
  /** The cue on PREVIEW, which in 'preview-then-take' mode the cursor may have left. */
  previewCueId: string | null;
  /** The selected cue's pool graphic, which ＋ adds a cue on. Null on a server cue or a folder. */
  selectedGraphicId: string | null;
  /** The folder header the operator holds, if any. */
  heldFolderRowId: string | null;
  /** Where the keyboard stands: a cue row, a header, or a collapsed header hiding the selected cue. */
  cursorRowId: string | null;
  /** The shift-click range, by cue id. */
  range: ReadonlySet<string>;
  /** The cues Ctrl+X marked, which the next paste moves. */
  cutIds: ReadonlySet<string>;
  /** What is on air of each folder (control/folderAir.ts). */
  folderAir: Readonly<Record<string, FolderAir>>;
  /** Why each cue of the last folder Take did not go on air, by cue id. */
  takeMisses: Readonly<Record<string, string>>;
  /** Each graphic layer's timed-cue countdown (control/cueAuto.ts), or null where timed cues do not
   *  run (a published production, until the wire lands), and then no row wears timing words. */
  cueArms: CueArms | null;
  /** A live row's chip: hold its countdown, or resume it. */
  toggleHold: (graphic: string) => void;
  /** A missed row's chip: clear it. */
  manualLane: (graphic: string) => void;
  /** The cue each started One-by-one folder takes at its next press (control/folderStep.ts). */
  stepNext: ReadonlySet<string>;
  /** What the rundown's authoring last said: a refused drop, a write that did not land. */
  rundownNote: string | null;
  /** Layers two or more graphics share (model/shows `duplicateLayers`). */
  clashes: ReadonlyMap<number, SavedGraphic[]>;
  /** A workspace is in front: the rail stays mounted, out of sight. */
  offstage: boolean;
  cueView: (cue: ShowCue) => { label: string; note: string; values: Record<string, string> };
  cueGraphicName: (cue: ShowCue) => string | null;
  playoutItemFor: (cue: ShowCue) => PlayoutItem | null;
  /** Where a Play-through folder plays, `2-10`. */
  folderSlotOf: (folder: ShowFolder) => string;
  /** A clip's place in its Play-through folder, or null. */
  throughRoleOf: (cue: ShowCue) => { folder: ShowFolder; role: ThroughRole } | null;
  /** Select a cue by id: one just added or duplicated, whose row is not drawn yet. */
  selectCue: (cueId: string) => void;
  /** A row was clicked: with shift it extends the range, with Ctrl (Cmd) it adds or drops the row. */
  clickRow: (row: RundownRow, shift: boolean, toggle: boolean) => void;
  clearRange: () => void;
  /** A row's clash badge was pressed: select that cue and put its layer repair in front. */
  onLayerRepair: (cueId: string) => void;
  removeCue: (cue: ShowCue) => Promise<void>;
  /** Remove the selected cues, in one write, each taken off air first as one removal would be. */
  removeCues: (cueIds: readonly string[]) => Promise<void>;
  removeGraphic: (poolId: string) => Promise<void>;
  newFolder: (cueIds: readonly string[]) => Promise<void>;
  /** Copies of the selected cues right after the last of them, selected when they land. */
  duplicateCues: (cueIds: readonly string[]) => Promise<void>;
  /** Take the selected cues out of their folders. */
  takeOutOfFolders: (cueIds: readonly string[]) => Promise<void>;
  removeFolder: (folderId: string) => Promise<unknown>;
  moveRundown: (what: Movable, place: Place) => Promise<unknown>;
  toggleFolder: (folderId: string) => void;
  setRundownNote: (note: string | null) => void;
  uploadPictures: (files: File[]) => Promise<void>;
  flushDraft: () => void;
  setShows: (shows: Show[]) => void;
}) {
  const navigate = useRouter((s) => s.navigate);
  const [addPick, setAddPick] = useState('');
  /** The hidden file input behind "＋ Add pictures…". */
  const pictureInput = useRef<HTMLInputElement>(null);
  /** The open ⋯ menu, by ROW id: a cue's, or a folder header's. */
  const [menuRowId, setMenuRowId] = useState<string | null>(null);
  /** Which removal in the open row menu is ARMED (`cue` / `graphic`). A cue holds values somebody
   *  typed and there is no undo behind the rundown, so a removal that also takes uploaded
   *  pictures or a whole graphic's rows asks twice — the same two-step Home's delete uses. */
  const [armedRemove, setArmedRemove] = useState<'cue' | 'graphic' | 'range' | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  /** Each pool graphic's WORD fields, in the template's order: what a row's dim summary reads. */
  const wordFields = useMemo(() => {
    const out = new Map<string, { key: string; defaultValue: string }[]>();
    for (const [id, g] of graphicByPoolId) {
      out.set(
        id,
        fieldDescriptors(g.template.fields)
          .filter((d) => d.kind === 'text' || d.kind === 'lines')
          .map((d) => ({ key: d.key, defaultValue: String(d.defaultValue ?? '') })),
      );
    }
    return out;
  }, [graphicByPoolId]);
  /** The length column is there only when the rundown holds a server clip (plan §6.8). */
  const timed = cues.some((c) => playoutItemFor(c)?.kind === 'media');
  /** The channel a cue plays on: a graphic the output's (the graphics channel), a server item its
   *  own, a clip of a Play-through folder the folder's. */
  const channelOfCue = (cue: ShowCue): number => {
    const item = playoutItemFor(cue);
    if (!item) return playoutSettings.channel;
    const through = item.kind === 'media' ? throughRoleOf(cue) : null;
    return through ? Number(folderSlotOf(through.folder).split('-')[0]) : channelOf(playoutSettings, item);
  };
  /** The channels the rundown plays on, when a server is set up. Rows say theirs only when there are
   *  two or more to tell apart (plan §20.3). */
  const channelsUsed = playoutConfigured(playoutSettings) ? [...new Set(cues.map(channelOfCue))].sort((a, b) => a - b) : [];
  const toneChannels = channelsUsed.length > 1;
  const serverOnAir = serverOwnership.onAir;
  const replacedCues = new Map(Object.values(serverOwnership.replaced).map((r) => [r.cueId, r] as const));
  /** The cues a timed cue's Next cue will take, each with the lane that will take it. */
  const armedBy = cueArms ? armedNext(cueArms) : new Map<string, string>();

  // ── THE LIST FOLLOWS THE AIR (plan §6.2). A cue that goes on air off-screen is scrolled into
  // view, so a take from the keys, a folder's All together or another operator never leaves the
  // operator hunting for the red row. It holds still while the operator is working IN the list:
  // a row being dragged, a menu open, focus in the rundown, or ten seconds after they scrolled
  // it by hand. Only the list scrolls - never the page, which on a phone is the column the verbs
  // are pinned to. A cue hidden in a collapsed folder is followed to its header, and the folder
  // never opens by itself: that would move rows under the operator and write the record.
  const rail = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  /** The row being dragged, by row id. An id and not a flag: a row removed mid-drag (a teammate's
   *  save) never gets its dragend, and a flag would then hold the list still for good. */
  const draggingRow = useRef<string | null>(null);
  /** What the drag moves. `getData` is empty during `dragover`, so it is kept here from `dragstart`. */
  const dragWhat = useRef<Movable | null>(null);
  const [aim, setAim] = useState<Aim | null>(null);
  const scrolledAt = useRef(-Infinity);
  // A menu counts while its row is drawn: one left open on a row a collapse then hid holds nothing still.
  const menuOpen = (menuRowId !== null && rundown.rows.some((r) => r.id === menuRowId)) || pickerOpen;
  const liveIds = new Set(
    cues
      .filter((cue) => {
        const graphic = cueGraphicName(cue);
        return (!!graphic && liveCue[graphic] === cue.id) || serverCueLive(serverOnAir, playoutItemFor(cue), cue);
      })
      .map((cue) => cue.id),
  );
  const liveKey = [...liveIds].join(' ');
  const wasLive = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const now = new Set(liveKey ? liveKey.split(' ') : []);
    const arrived = [...now].find((id) => !wasLive.current.has(id));
    wasLive.current = now;
    if (!arrived || offstage) return;
    const dragged = draggingRow.current;
    const held =
      (!!dragged && rundown.rows.some((r) => r.id === dragged)) ||
      menuOpen ||
      !!rail.current?.contains(document.activeElement) ||
      scrolledLately(scrolledAt.current);
    const box = list.current;
    const rowId = rundown.rowOf.get(arrived);
    const row = rowId ? box?.querySelector<HTMLElement>(`[data-row="${CSS.escape(rowId)}"]`) : null;
    if (held || !box || !row) return;
    const b = box.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    if (r.top < b.top) box.scrollTop -= b.top - r.top + 8;
    else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 8;
    // `rundown` is read for the drag check and the row lookup only, as of this render; following is
    // decided when the live set changes, not whenever the rundown does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey, offstage, menuOpen]);

  // ── THE DRAG (plan §7): aimed by the row under the pointer and the third of it, drawn as a line
  // where it will land, and one write at the drop. A pointer in the gap between two rows keeps the
  // aim it had, so the line never flickers to the end of the list and back. ──
  const startDrag = (row: RundownRow, e: DragEvent<HTMLDivElement>) => {
    // No state is set here: re-rendering the drag source inside dragstart can cancel the drag.
    draggingRow.current = row.id;
    // A row in the selection carries the whole selection, in its order (docs/CLIP_PLAYBACK_PLAN.md
    // §20.2); any other row moves alone.
    const carries = range.size > 1 && rowCueIds(rundown, row).every((id) => range.has(id));
    dragWhat.current = carries ? { cueIds: [...range] } : row.kind === 'cue' ? { cueId: row.cue.id } : { folderId: row.folder.id };
    e.dataTransfer.setData(row.kind === 'cue' ? 'text/noacg-cue' : 'text/noacg-folder', row.kind === 'cue' ? row.cue.id : row.folder.id);
  };
  const endDrag = () => {
    draggingRow.current = null;
    dragWhat.current = null;
    setAim(null);
  };
  /** Which row, and which third of it, the pointer is over - or the end of the list. Null for a gap. */
  const aimAt = (e: DragEvent<HTMLDivElement>): { rowId: string; band: ReturnType<typeof bandAt> } | 'end' | null => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-drop-end]')) return 'end';
    const rowEl = target.closest<HTMLElement>('[data-row]');
    if (rowEl) {
      const rect = rowEl.getBoundingClientRect();
      const y = e.clientY - rect.top;
      // A folder's header: its top quarter above the folder, the rest into it.
      return { rowId: rowEl.dataset.row!, band: rowEl.classList.contains('pd-folder') ? headerBandAt(y, rect.height) : bandAt(y, rect.height) };
    }
    const rows = list.current?.querySelectorAll<HTMLElement>('[data-row]');
    const last = rows?.[rows.length - 1];
    return last && e.clientY > last.getBoundingClientRect().bottom ? 'end' : null;
  };
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const what = dragWhat.current;
    if (!what) return;
    const at = aimAt(e);
    if (!at) return;
    const key = at === 'end' ? 'end' : `${at.rowId}:${at.band}`;
    if (aim?.key === key) return;
    setAim({ key, rowId: at === 'end' ? 'end' : at.rowId, plan: planDrop(show, rundown, what, at) });
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const types = e.dataTransfer.types;
    const cueId = types.includes('text/noacg-cue') ? e.dataTransfer.getData('text/noacg-cue') : '';
    const folderId = types.includes('text/noacg-folder') ? e.dataTransfer.getData('text/noacg-folder') : '';
    // A selection is carried in memory: the transfer names only the row that was grabbed.
    const carried = dragWhat.current;
    const what: Movable | null = carried && 'cueIds' in carried ? carried : cueId ? { cueId } : folderId ? { folderId } : carried;
    const at = aimAt(e) ?? (aim ? (aim.rowId === 'end' ? 'end' : null) : null);
    const plan = what && at ? planDrop(show, rundown, what, at) : (aim?.plan ?? null);
    endDrag();
    if (!what || !plan) return;
    if (plan.refused) {
      setRundownNote(plan.refused);
      return;
    }
    void moveRundown(what, plan.place);
  };
  /** A row's drop mark: the line where the drop LANDS, which for a folder moved beside another is that
   *  folder's edge rather than the row under the pointer; a refusal on the row under the pointer. */
  const markFor = (rowId: string) => {
    const plan = aim?.plan;
    if (!plan) return null;
    if (plan.refused) return aim.rowId === rowId ? { refused: true as const } : null;
    return plan.mark.rowId === rowId ? plan.mark : null;
  };

  /** The folder a drop into by its header lights whole, while the drag hovers there. */
  const litFolder = aim?.plan && !aim.plan.refused ? (aim.plan.mark.folder ?? null) : null;

  /** The folders a cue could be moved into from its menu: every other folder there is. */
  const otherFolders = (folderId: string | null) => [...rundown.folders.values()].filter((f) => f.id !== folderId);

  const rangeCount = range.size;
  /** Some cue of the selection is in a folder: its menu offers to take them out. */
  const rangeInFolder = [...range].some((id) => !!rundown.rowOf.get(id) && cues.some((c) => c.id === id && !!c.folderId && rundown.folders.has(c.folderId)));

  return (
    <aside ref={rail} id="pd-rundown" className={`pd-rail pd-rundown${offstage ? ' pd-offstage' : ''}`}>
      <div className="pd-rail-head">
        <h2>Cue rundown</h2>
        <span className="muted">{cues.length}</span>
        {/* Which tone is which channel, in the studio's words (plan §20.3). */}
        {toneChannels && (
          <span className="pd-ch-legend" data-testid="channel-legend">
            {channelsUsed.map((ch) => (
              <span key={ch} style={{ '--pd-ch': channelTone(ch) } as CSSProperties} title={channelTitle(playoutSettings, ch)}>
                {channelLabel(playoutSettings, ch)}
              </span>
            ))}
          </span>
        )}
        <div className="spacer" />
        <button
          className="pd-icon"
          title="Add a cue on the selected graphic"
          disabled={!selectedGraphicId}
          onClick={() => {
            if (!selectedGraphicId) return;
            const { shows: next, cueId } = addShowCue(show.id, selectedGraphicId);
            setShows(next);
            if (cueId) selectCue(cueId);
          }}
          data-testid="add-cue"
        >
          ＋
        </button>
      </div>

      {cues.length === 0 && (
        <p className="hint pd-cues-empty" data-testid="no-cues">
          No cues yet. Add a graphic below, then add cues on it.
        </p>
      )}

      {/* UNIDENTIFIED ITEMS (plan §6.7): something plays on a slot this rundown uses, and nothing
          says which cue put it there - another client's take, or this page's own from before a
          Bridge restart. Named by its slot and file, never matched to a cue by its name. */}
      {serverOwnership.unidentified.length > 0 && (
        <div className="pd-unidentified" data-testid="server-unidentified">
          {serverOwnership.unidentified.map((u) => {
            // A Bridge restart stopped a run: named by the folder its cue played in, when it did.
            const stoppedIn = u.sequenceStopped && u.cueId ? cues.find((c) => c.id === u.cueId) : undefined;
            const stoppedFolder = stoppedIn ? throughRoleOf(stoppedIn)?.folder : undefined;
            return (
              <div
                key={slotAddress(u.slot)}
                className="pd-unidentified-row"
                title={`${slotAddress(u.slot)} plays ${u.file ?? 'something'} on the playout server, and this page cannot say which cue put it there. Take a cue on that slot to replace it.`}
              >
                <span className="pd-unidentified-what">Unidentified item on {slotAddress(u.slot)}</span>
                {u.file && <span className="pd-cue-sum">{u.file}</span>}
                {/* The Bridge restarted during a run: what the server had queued still plays, and
                    nothing after it (plan §6.10, rule 7). */}
                {u.sequenceStopped && (
                  <span className="pd-cue-sum" data-testid="server-sequence-stopped">
                    {stoppedFolder ? `${folderName(stoppedFolder)} stopped` : 'Play next stopped'}: NoaCG Bridge restarted
                  </span>
                )}
                <span className="pd-cue-len">
                  <SlotRemaining timing={serverTiming} slot={slotAddress(u.slot)} fallback="" />
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div
        ref={list}
        className={`pd-cues${timed ? ' pd-cues--timed' : ''}`}
        data-testid="cue-list"
        // A HAND on the list, not the list moving: the follow's own scrolling fires `scroll` too,
        // so only a wheel or a touch counts as the operator having looked somewhere on purpose.
        onWheel={() => (scrolledAt.current = Date.now())}
        onTouchMove={() => (scrolledAt.current = Date.now())}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragLeave={(e) => {
          if (!list.current?.contains(e.relatedTarget as Node | null)) setAim(null);
        }}
        // A press on the list's own background clears the range, as Home's library does.
        onPointerDown={(e) => {
          if (e.target === e.currentTarget && rangeCount) clearRange();
        }}
      >
        {rundown.rows.map((row) => {
          if (row.kind === 'folder') {
            const { folder } = row;
            const hidden = folder.collapsed === true ? row.runCues : [];
            const hiddenSelected = hidden.find((c) => c.id === selectedCueId);
            // A clash never hides behind a collapsed header (§6.2): the header carries it.
            const hiddenClash = hidden
              .map((c) => ({ c, g: graphicByPoolId.get(c.sourceId) }))
              .find(({ g }) => g && (clashes.get(graphicLayer(g))?.length ?? 0) > 1);
            const hiddenReplaced = hidden.map((c) => replacedCues.get(c.id)).find(Boolean);
            const members = rundown.members.get(folder.id) ?? [];
            const missed = members.filter((c) => takeMisses[c.id]).length;
            return (
              <FolderRow
                key={row.id}
                row={row}
                air={folderAir[folder.id]}
                missed={missed}
                selected={heldFolderRowId !== null && cursorRowId === row.id}
                holdsCursor={hiddenSelected ? hiddenSelected.label : null}
                inRange={members.every((c) => range.has(c.id))}
                timed={timed}
                slot={folderMode(folder) === 'through' ? folderSlotOf(folder) : null}
                slotTone={toneChannels && folderMode(folder) === 'through' ? channelTone(Number(folderSlotOf(folder).split('-')[0])) : null}
                clash={
                  hiddenClash
                    ? {
                        title: `${hiddenClash.c.label} shares layer ${graphicLayer(hiddenClash.g!)} with another graphic. On air they replace each other. Click to repair.`,
                        onRepair: () => {
                          toggleFolder(folder.id);
                          onLayerRepair(hiddenClash.c.id);
                        },
                      }
                    : null
                }
                replaced={hiddenReplaced ? `${hiddenReplaced.cueId ? cues.find((c) => c.id === hiddenReplaced.cueId)?.label ?? 'A cue' : 'A cue'} was replaced on the server.` : null}
                drop={markFor(row.id)}
                menuOpen={menuRowId === row.id}
                onSelect={(shift, toggle) => {
                  setRundownNote(null);
                  clickRow(row, shift, toggle);
                }}
                onToggle={() => toggleFolder(folder.id)}
                onMenu={() => setMenuRowId((m) => (m === row.id ? null : row.id))}
                onCloseMenu={() => setMenuRowId(null)}
                onRemove={() => {
                  setMenuRowId(null);
                  void removeFolder(folder.id);
                }}
                onDragStart={(e) => startDrag(row, e)}
                onDragEnd={endDrag}
              />
            );
          }
          const { cue } = row;
          const view = cueView(cue);
          const cueGraphic = cueGraphicName(cue);
          const poolEntry = graphicByPoolId.get(cue.sourceId);
          const playoutItem = playoutItemFor(cue);
          const cueIsLive = liveIds.has(cue.id);
          const isSelected = cue.id === (selectedCueId ?? '');
          // The amber tally is the cue ON PREVIEW - the selection in 'take' mode, and in
          // 'preview-then-take' mode the cue SPACE put there, which the cursor may have left.
          const isPreviewed = cue.id === (previewCueId ?? '');
          // Removal wording, decided per row. How many cues the graphic has says whether this
          // one takes the graphic with it (shows.ts removeShowCue) and whether removing the
          // graphic outright is a distinct gesture at all; pictures live ONLY in their pool
          // graphic, so losing it loses the uploads and the operator has to be told.
          const siblingCues = cues.filter((c) => c.sourceId === cue.sourceId).length;
          const pictures = poolEntry?.type === 'picture' ? poolEntry.template.assets.length : 0;
          const layer = poolEntry ? graphicLayer(poolEntry) : 0;
          const clashWith = poolEntry ? (clashes.get(layer) ?? []).filter((g) => g.id !== poolEntry.id) : [];
          // A clip of a Play-through folder plays on the folder's slot, not its own (plan §6.6), so
          // everything that says where it plays names the folder's.
          const through = playoutItem?.kind === 'media' ? throughRoleOf(cue) : null;
          const address = through ? folderSlotOf(through.folder) : playoutItem ? slotAddress(itemSlot(playoutSettings, playoutItem)) : '';
          // THE KIND, in words for whoever cannot see the glyph: the icon's accessible name and
          // its tooltip carry what the old second line printed ("Lower third · Hairline").
          const kind = poolEntry
            ? { glyph: 'T', tone: 'graphic', name: `${graphicKindLabel(poolEntry.type)} · ${poolEntry.name}` }
            : playoutItem?.kind === 'media'
              ? playoutItem.mediaKind === 'audio'
                ? { glyph: '♪', tone: 'audio', name: `Server audio · ${address}` }
                : { glyph: '▶', tone: 'clip', name: `Server clip · ${address}` }
              : playoutItem
                ? { glyph: 'T', tone: 'server', name: `Server template · ${address}` }
                : { glyph: '?', tone: 'missing', name: 'Missing graphic' };
          // THE DIM SUMMARY after the name: what tells two cues of one graphic apart at a glance -
          // a graphic's first words ("Alexandra Riva"), a server item's own name. A graphic with
          // no words (a logo, a picture) falls back to its name, as the old second line did.
          const summary = poolEntry
            ? (wordFields.get(poolEntry.id) ?? [])
                .map((d) => (view.values[d.key] ?? d.defaultValue).split('\n')[0].replace(/\s+/g, ' ').trim())
                .filter(Boolean)
                .slice(0, 2)
                .join(' · ') || cueGraphic || ''
            : (playoutItem?.name ?? 'missing graphic');
          // What the cue plays of its file: a trimmed clip reads its own length.
          const length = playoutItem?.kind === 'media' ? lengthText(segmentSeconds(cue, playoutItem)) : '';
          // WHAT HAPPENS AT ITS END, after the name (plan §6.2): loops, plays the next, clears. Hold
          // is the default and wears nothing. Read by the loop rule of the record (control/cuePlayback.ts);
          // in a Play-through folder, by the folder.
          // The last clip of a folder that ends keeps its own ending, with Play next read as Hold, as its
          // panel says (control/cuePlayback.ts asFolderMember).
          const folderEnd = through ? THROUGH_END[through.role] : undefined;
          const ownEnd = playoutItem?.kind === 'media' ? effectiveEnd(through?.role === 'last' ? asFolderMember(cue, playoutItem, true) : cue, playoutItem) : 'hold';
          const endMark = folderEnd
            ? { glyph: folderEnd.glyph, says: folderEnd.words, testid: through!.role === 'middle' ? 'cue-next-mark' : 'cue-loop' }
            : (END_MARKS[ownEnd] ?? null);
          // Where this clip is up, if it is: the slot it was TAKEN to, whatever its editor says now.
          const upAt = cueIsLive && playoutItem?.kind === 'media' ? serverOnAir[playoutItem.id]?.slot : undefined;
          // Waiting on the server behind whatever plays on its slot (`LOADBG`). In a folder's run the
          // same file can wait twice, so the run's own next entry names the cue.
          const next = !cueIsLive && playoutItem?.kind === 'media' ? serverOwnership.queued[address] : undefined;
          const nextHere = through
            ? !!next && serverOwnership.sequences[address]?.next[0]?.cueId === cue.id
            : !!next && !!playoutItem && namesItem(playoutItem.name, next.file);
          const replaced = replacedCues.get(cue.id);
          const miss = !cueIsLive ? takeMisses[cue.id] : undefined;
          // A TIMED CUE (docs/RUNDOWN_AUTOMATION_PLAN.md §2.1), only where timed cues run: its length and
          // end, or its own lane's countdown while it is the cue that armed it.
          const timedAuto = cueArms && cueGraphic ? readAuto(cue) : null;
          const lane = cueArms && cueGraphic ? cueArms[cueGraphic] : undefined;
          const laneArm = lane && lane.cue === cue.id ? lane : undefined;
          const rowMenuId = row.id;
          const inFolder = !!row.folderId;
          const ownFolder = row.folderId ? rundown.folders.get(row.folderId) : undefined;
          const takesRange = range.has(cue.id) && rangeCount > 1;
          const drop = markFor(row.id);
          /** The channel's tone on the slot, when the rundown has two or more channels. */
          const ch = toneChannels ? { 'data-ch': channelOfCue(cue), style: { '--pd-ch': channelTone(channelOfCue(cue)) } as CSSProperties } : {};
          return (
            <div
              key={cue.id}
              className={`pd-cue${isSelected ? ' selected' : ''}${cueIsLive ? ' on-air' : isPreviewed ? ' on-pvw' : ''}${inFolder ? ' in-folder' : ''}${range.has(cue.id) ? ' in-range' : ''}${cutIds.has(cue.id) ? ' cut' : ''}`}
              data-testid={rowTestId(row)}
              data-row={row.id}
              {...(drop ? { 'data-drop': 'refused' in drop ? 'refused' : drop.edge } : {})}
              {...(drop && !('refused' in drop) ? { 'data-drop-inside': String(drop.inside) } : {})}
              {...(litFolder && row.folderId === litFolder ? { 'data-drop-target': '' } : {})}
              draggable
              onDragStart={(e) => startDrag(row, e)}
              onDragEnd={endDrag}
              // A right-click opens the row's own ⋯ menu (docs/CLIP_PLAYBACK_PLAN.md §20.2).
              onContextMenu={(e) => {
                e.preventDefault();
                setArmedRemove(null);
                setMenuRowId(rowMenuId);
              }}
            >
              {/* A folder's cues hang from a line under its header (plan §20.3). */}
              {inFolder && <span className="pd-fold-guide" aria-hidden="true" />}
              <span className="pd-grip" aria-hidden="true">⣿</span>
              <span className="pd-cue-no">{cueIsLive ? '●' : row.no}</span>
              <span
                className={`pd-cue-kind pd-cue-kind--${kind.tone}`}
                role="img"
                aria-label={kind.name}
                title={kind.name}
                data-testid="cue-kind"
              >
                {kind.glyph}
              </span>
              {/* aria-current, not aria-selected: this is a list of cues the operator moves a
                  cursor through, and "the one I am holding" is exactly what current means. It
                  is also the non-visual half of the ring the CSS draws — a tally colour tells a
                  screen reader nothing. */}
              <button
                className="pd-cue-label"
                // A shift-click extends the selection; it must not also select the text under it.
                onMouseDown={(e) => e.shiftKey && e.preventDefault()}
                onClick={(e) => {
                  setRundownNote(null);
                  clickRow(row, e.shiftKey, e.ctrlKey || e.metaKey);
                }}
                data-testid="select-cue"
                aria-current={isSelected ? 'true' : undefined}
              >
                <strong>{view.label}</strong>
                {/* What the clip does at its end, after its name: a loop is stopped by Out alone, a
                    clip that plays the next one hands over by itself, and a clear leaves the layer
                    empty. */}
                {endMark && (
                  <span className="pd-cue-mark" role="img" aria-label={endMark.says} title={endMark.says} data-testid={endMark.testid}>
                    {endMark.glyph}
                  </span>
                )}
                {/* The OPERATOR NOTE ("after the intro") is a mark with the note in its tooltip
                    and its accessible name, so it is announced with the row. */}
                {view.note && (
                  <span className="pd-cue-mark" role="img" aria-label={`Note: ${view.note}`} title={view.note} data-testid="cue-note-mark">
                    ✎
                  </span>
                )}
                {/* NEXT ON SERVER, after the name (plan §6.2): this clip waits behind whatever
                    plays on its slot, and plays by itself at the end when the server says AUTO. */}
                {nextHere && (
                  <span
                    className="pd-cue-next"
                    title={next!.auto ? `Queued on ${address}: it plays by itself when the clip before it ends.` : `Loaded on ${address} behind the clip that plays there.`}
                    data-testid="cue-next-on-server"
                  >
                    NEXT ON SERVER
                  </span>
                )}
                {summary && summary !== view.label && <span className="pd-cue-sum">{summary}</span>}
              </button>
              {/* A TIMED CUE (docs/RUNDOWN_AUTOMATION_PLAN.md §2.1): its length and end, counting
                  while it is on air, and a press holds it. The cue Next cue will take is ARMED. */}
              {laneArm || timedAuto ? (
                <RowAutoChip auto={timedAuto} arm={laneArm} onToggle={() => toggleHold(cueGraphic!)} onClear={() => manualLane(cueGraphic!)} />
              ) : null}
              {cueArms && armedBy.has(cue.id) && !cueIsLive && <ArmedTag arm={cueArms[armedBy.get(cue.id)!]} />}
              {/* The row was ON AIR until something else took its slot on the server: said next
                  to where the ON AIR tag stood, so the operator sees it where they last looked -
                  and beside PVW too, since the cue may well be the one on PREVIEW again. */}
              {replaced && !cueIsLive && (
                <span
                  className="pd-cue-replaced"
                  title={`Replaced on the server: ${slotAddress(replaced.slot)} now plays ${replaced.file ?? 'something else'}, which this page did not take. Take the cue again to put it back.`}
                  data-testid="cue-replaced"
                >
                  replaced on the server
                </span>
              )}
              {cueIsLive && unsentOnAir.has(cue.id) && (
                // AIR IS BEHIND THIS ROW: its cue was edited after it was sent. Said here, beside
                // ON AIR, because the editor's "not on air yet" leaves with the selection
                // (docs/research/control-surfaces-review-2026-10-02 S1, slice 1).
                <span
                  className="pd-tag unsent"
                  title="Edited since it was sent: air still shows the old values. Select it and press ✎ Update to send the edit."
                  aria-label="Edited, not sent"
                  data-testid="cue-unsent-mark"
                >
                  EDITED
                </span>
              )}
              {cueIsLive ? (
                <span className="pd-tag air">ON AIR</span>
              ) : miss ? (
                // A folder's Take did not put this cue on air: said on its own row, with why.
                <span className="pd-tag miss" title={miss} aria-label={`Not taken: ${miss}`} data-testid="cue-take-miss">
                  NOT TAKEN
                </span>
              ) : isPreviewed ? (
                <span className="pd-tag pvw">PVW</span>
              ) : stepNext.has(cue.id) ? (
                // A One-by-one folder's next press takes this cue (docs/CLIP_PLAYBACK_PLAN.md §20.1).
                <span className="pd-tag next" title={`${ownFolder ? folderName(ownFolder) : 'Its folder'} takes this cue at the next press of its header.`} data-testid="cue-step-next">
                  NEXT
                </span>
              ) : null}
              {timed && (
                <span className="pd-cue-len" data-testid="cue-length">
                  {/* While the clip is up, the time it has LEFT, counting between readings. */}
                  {upAt ? <SlotRemaining timing={serverTiming} slot={slotAddress(upAt)} fallback={length} /> : length}
                </span>
              )}
              {/* The LAYER, and the one place a shared layer is announced now that the layer
                  list is gone (§5): two graphics on one number replace each other on air, so both
                  rows wear the warning where the operator is already looking, and the badge IS
                  the door to the repair - it selects the cue and opens its layer under Advanced. */}
              {poolEntry &&
                (clashWith.length ? (
                  <button
                    className="pd-cue-layer clash"
                    {...ch}
                    onClick={() => onLayerRepair(cue.id)}
                    title={`Shares layer ${layer} with ${nameList(clashWith.map((g) => g.name))}. On air they replace each other. Click to repair.`}
                    data-testid="cue-layer"
                  >
                    L{layer}
                  </button>
                ) : (
                  <span
                    className="pd-cue-layer"
                    {...ch}
                    title={`${poolEntry.name} airs on layer ${layer}${toneChannels ? `, ${channelTitle(playoutSettings, playoutSettings.channel)}` : ''}`}
                    data-testid="cue-layer"
                  >
                    L{layer}
                  </span>
                ))}
              {/* A server item wears its CasparCG address, channel and layer, the way the
                  server itself writes it (`2-10`): a rundown that airs on two channels has to
                  say which one at a glance. */}
              {playoutItem && (
                <span
                  className="pd-cue-layer"
                  {...ch}
                  title={
                    through
                      ? `${playoutItem.name} plays on ${address}, the slot of ${folderName(through.folder)}`
                      : `${playoutItem.name} plays on the playout server, ${channelTitle(playoutSettings, channelOf(playoutSettings, playoutItem))}, layer ${playoutItem.layer}`
                  }
                  data-testid="cue-layer"
                >
                  {address}
                </span>
              )}
              <div className="pd-cue-menu-host">
                <button
                  className="pd-icon pd-cue-more"
                  onClick={() => {
                    setArmedRemove(null);
                    setMenuRowId((m) => (m === rowMenuId ? null : rowMenuId));
                  }}
                  title="More"
                  aria-label={`More actions for ${view.label}`}
                  data-testid="cue-menu"
                >
                  ⋯
                </button>
                {/* The rundown SCROLLS, so the last cue's ⋯ is at the bottom of the rail by
                    arithmetic — the same defect the library's bulk bar had, on the surface an
                    operator uses live. The shell measures which way to open. */}
                <LibMenu
                  open={menuRowId === rowMenuId}
                  onClose={() => {
                    setArmedRemove(null);
                    setMenuRowId(null);
                  }}
                  testid="cue-actions-menu"
                >
                  <button
                    role="menuitem"
                    onClick={() => {
                      // The selection's row: copies of all of it, right after the last of them.
                      if (takesRange) {
                        setMenuRowId(null);
                        void duplicateCues([...range]);
                        return;
                      }
                      flushDraft();
                      const v = cueView(cue);
                      // The copy is of the cue, its playback too, and goes right after it - in its
                      // folder when it is in one (plan §7).
                      const { shows: next, cueId } = addShowCue(
                        show.id,
                        cue.sourceId,
                        { label: `${v.label} copy`, values: v.values, note: v.note || undefined, ...(cue.playback ? { playback: cue.playback } : {}) },
                        cue.id,
                      );
                      setShows(next);
                      setMenuRowId(null);
                      if (cueId) selectCue(cueId);
                    }}
                  >
                    {takesRange ? `Duplicate the ${rangeCount} selected cues` : 'Duplicate'}
                  </button>
                  {/* A FOLDER from this cue, or from the shift-click range when this row is in it. */}
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuRowId(null);
                      void newFolder(takesRange ? [...range] : [cue.id]);
                    }}
                    title="Shift-click another cue to select several."
                    data-testid="cue-new-folder"
                  >
                    {takesRange ? `New folder from the ${rangeCount} selected cues` : 'New folder from this cue'}
                  </button>
                  {menuRowId === rowMenuId && otherFolders(takesRange ? null : row.folderId).map((f) => {
                    // The selection's row moves all of it (docs/CLIP_PLAYBACK_PLAN.md §20.2).
                    const what: Movable = takesRange ? { cueIds: [...range] } : { cueId: cue.id };
                    const refused = placeRefusal(show, what, { into: f.id });
                    return (
                      <button
                        key={f.id}
                        role="menuitem"
                        disabled={!!refused}
                        title={refused ?? `Put ${takesRange ? `the ${rangeCount} selected cues` : view.label} last in ${folderName(f)}`}
                        onClick={() => {
                          setMenuRowId(null);
                          void moveRundown(what, { into: f.id });
                        }}
                        data-testid="cue-into-folder"
                        data-folder={f.id}
                      >
                        {takesRange ? `Move the ${rangeCount} selected into` : 'Move into'} ▤ {folderName(f)}
                        {refused ? ' (clips and audio only)' : ''}
                      </button>
                    );
                  })}
                  {takesRange && rangeInFolder && (
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenuRowId(null);
                        void takeOutOfFolders([...range]);
                      }}
                      title="Put each selected cue right after its folder, in no folder"
                      data-testid="cue-out-of-folder"
                    >
                      Take the {rangeCount} selected out of their folders
                    </button>
                  )}
                  {!takesRange && ownFolder && (
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenuRowId(null);
                        void moveRundown({ cueId: cue.id }, { afterFolder: ownFolder.id });
                      }}
                      title={`Put ${view.label} right after ${folderName(ownFolder)}, in no folder`}
                      data-testid="cue-out-of-folder"
                    >
                      Take out of ▤ {folderName(ownFolder)}
                    </button>
                  )}
                  {/* Removing the LAST cue removes the graphic too, so the label says so
                      rather than letting it be discovered. A picture graphic carries the
                      uploads themselves, which is the one removal that destroys content
                      with no copy in the library — it asks twice, naming the count. */}
                  {takesRange ? (
                    // The selection's row removes all of it, and always asks twice: several cues, and
                    // perhaps the graphics whose last cues they are, with no undo behind them.
                    <button
                      role="menuitem"
                      onClick={() => {
                        if (armedRemove !== 'range') {
                          setArmedRemove('range');
                          return;
                        }
                        void removeCues([...range]);
                        setArmedRemove(null);
                        setMenuRowId(null);
                      }}
                      title="Remove the selected cues. A graphic whose last cue is among them leaves the production with it."
                      data-testid="delete-cue"
                    >
                      {armedRemove === 'range' ? `Remove the ${rangeCount} selected cues. Confirm?` : `Remove the ${rangeCount} selected cues`}
                    </button>
                  ) : (
                  <>
                  <button
                    role="menuitem"
                    onClick={() => {
                      if (siblingCues === 1 && pictures > 0 && armedRemove !== 'cue') {
                        setArmedRemove('cue');
                        return;
                      }
                      void removeCue(cue);
                      setArmedRemove(null);
                      setMenuRowId(null);
                    }}
                    title={
                      siblingCues === 1
                        ? `The last cue on ${cueGraphic ?? playoutItem?.name ?? 'this graphic'}. The graphic leaves the production with it.`
                        : 'Remove this cue; the graphic and its other cues stay'
                    }
                    data-testid="delete-cue"
                  >
                    {armedRemove === 'cue'
                      ? `Also deletes ${pictures} picture${pictures === 1 ? '' : 's'}. Confirm?`
                      : siblingCues === 1
                        ? 'Remove cue and graphic'
                        : 'Remove cue'}
                  </button>
                  {/* One gesture for getting a graphic out of the production. Offered only
                      where it differs from the item above: with a single cue, that one
                      already takes the graphic. */}
                  {siblingCues > 1 && (
                    <button
                      role="menuitem"
                      onClick={() => {
                        if (armedRemove !== 'graphic') {
                          setArmedRemove('graphic');
                          return;
                        }
                        void removeGraphic(cue.sourceId);
                        setArmedRemove(null);
                        setMenuRowId(null);
                      }}
                      title={`Remove ${cueGraphic ?? playoutItem?.name ?? 'this graphic'} from the production, with every cue prepared against it`}
                      data-testid="delete-graphic"
                    >
                      {armedRemove === 'graphic'
                        ? `Remove ${siblingCues} cues${pictures > 0 ? ` and ${pictures} pictures` : ''}. Confirm?`
                        : `Remove graphic and its ${siblingCues} cues`}
                    </button>
                  )}
                  </>
                  )}
                </LibMenu>
              </div>
            </div>
          );
        })}
        {/* While a row is dragged, the list ends with a place to drop it: the one way out at the
            bottom when the list ends in a folder. */}
        {aim && (
          <div
            className="pd-drop-end"
            data-drop-end
            {...(aim.rowId === 'end' && aim.plan ? { 'data-drop': aim.plan.refused ? 'refused' : 'into' } : {})}
            data-testid="rundown-drop-end"
          >
            Move to the end
          </div>
        )}
      </div>

      {/* The rundown's own note: why a drop is refused - read while it hovers, and kept after - or a
          folder write that did not land. Under the list, where it is never clipped. */}
      {(aim?.plan?.refused ?? rundownNote) && (
        <p className="status-bad pd-rundown-note" role="status" data-testid="rundown-note">
          {aim?.plan?.refused ?? rundownNote}
        </p>
      )}

      {/* THE RANGE (owner, 2026-09-28): while a shift-click selection stands, its count and its verb,
          as Home's library shows them - no checkboxes, and nothing at rest. */}
      {rangeCount > 0 && (
        <div className="pd-range-bar" data-testid="rundown-range">
          <span data-testid="range-count">{rangeCount} selected</span>
          <div className="spacer" />
          <button onClick={() => void newFolder([...range])} data-testid="new-folder">
            ▤ New folder
          </button>
          <button onClick={clearRange} data-testid="range-clear">
            Clear
          </button>
        </div>
      )}

      {/* The foot is how graphics GET IN. It used to carry a layer list as well — a second
          list of the same graphics, in a corner the rundown wanted for itself. The layer is
          typed beside the graphic's content, every rundown row wears its number, and removal
          lives in the row's ⋯ menu, so the rundown is the only list (§5). */}
      <div className="pd-rail-foot">
        <div className="row">
          <select value={addPick} onChange={(e) => setAddPick(e.target.value)} data-testid="add-graphic-pick">
            <option value="">Add a graphic from your library…</option>
            {library.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <button
            disabled={!addPick}
            onClick={() => {
              const doc = library.find((g) => g.id === addPick);
              if (!doc) return;
              const { shows: next } = addGraphicToShow(show.id, doc.template, { graphicId: doc.id });
              setShows(next);
              setAddPick('');
            }}
            data-testid="add-graphic"
          >
            ＋ Add
          </button>
        </div>
        <button
          className="pd-new-graphic"
          onClick={() => {
            useTemplateStore.setState({ pendingProductionId: show.id });
            navigate({ view: 'new' });
          }}
          title="Create a new graphic for this production - the wizard uses its look and adds it here"
          data-testid="production-new-graphic"
        >
          ＋ New graphic for this production…
        </button>
        {/* Pictures, straight into the rundown — one still per cue, on the production's own
            picture layer. The editor is never opened for this, which is the whole point.
            A real <button> driving a hidden input, so it is the same control as its sibling
            rather than a label wearing a button's clothes. */}
        <button
          className="pd-new-graphic"
          onClick={() => pictureInput.current?.click()}
          title={`Add pictures to this production. Each one becomes a cue (up to ${MAX_PICTURES}).`}
          data-testid="add-pictures"
        >
          ＋ Add pictures…
        </button>
        {/* The playout server's own library - templates and clips already on the CasparCG box,
            through NoaCG Bridge (docs/BRIDGE.md §5). Present only once a server is configured
            under Settings -> Playout: a dead door on the busiest surface would be worse than none. */}
        {playoutConfigured(playoutSettings) && (
          <div className="pd-picker-host">
            <button
              className="pd-new-graphic"
              onClick={() => setPickerOpen((o) => !o)}
              title="Add a template or a clip that is already on the playout server"
              data-testid="add-from-server"
            >
              ＋ From the playout server…
            </button>
            <PlayoutItemPicker
              open={pickerOpen}
              onClose={() => setPickerOpen(false)}
              library={library}
              onAdd={(item) => {
                // The studio's default channel for its kind: media to the "New media" channel, a
                // template to the NoaCG output's channel. Stored as a number, so the item stays
                // where it was put when the studio later moves its output; and never defaulted
                // onto the output's own layer, which playing it would replace.
                const settings = loadPlayoutSettings();
                const channel = defaultChannelFor(settings, item.kind);
                const { shows: next, cueId } = addPlayoutItem(
                  show.id,
                  { adapter: 'casparcg', ...item, channel },
                  { output: { channel: settings.channel, layer: settings.layer } },
                );
                setShows(next);
                if (cueId) selectCue(cueId);
              }}
            />
          </div>
        )}
        <input
          ref={pictureInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            // COPIED out of the live FileList first: clearing `value` empties that list in
            // place, so reading it afterwards hands the handler nothing at all.
            const files = Array.from(e.target.files ?? []);
            // Cleared so choosing the SAME file again still fires a change event.
            e.target.value = '';
            void uploadPictures(files);
          }}
          data-testid="add-pictures-input"
        />
      </div>
    </aside>
  );
}
