// THE RUNDOWN AS IT IS DRAWN (docs/CLIP_PLAYBACK_PLAN.md §6.2 and §7, phase 4): the rows the production
// page's cue list shows - a header for each run of a folder, then its cues, or the header alone while
// the folder is collapsed - where the keyboard stands on them, what a shift-click covers, and where a
// drag lands.
//
// It only READS. One pass over the flat cue list, and nothing reorders: a folder an older build split
// shows each run under its own header, the second marked "(continued)", until the next move gathers it
// (./showFolders.ts). A folderId that names no folder reads as none, and a folder no cue names is not
// drawn.
//
// Pure, importing only types and ./showFolders.ts, so scripts/rundown-rows.test.mjs runs it in Node.
// The team merge never imports it.

import type { PlayoutItem, ShowCue, ShowFolder } from './shows';
import { folderIdOf, liveFolderIds, placeInOrder, placeRefusal, type Movable, type Place } from './showFolders.ts';

export interface CueRow {
  kind: 'cue';
  /** The cue's own id, so a rundown without folders draws exactly its cues. */
  id: string;
  cue: ShowCue;
  /** Its place in the flat rundown, 1-based: the number every surface names it by. */
  no: number;
  /** The folder it reads as being in, or null. */
  folderId: string | null;
}

export interface FolderRow {
  kind: 'folder';
  /** `folder:<id>`, then `folder:<id>:1`, `:2`… for each later run of a split folder. */
  id: string;
  folder: ShowFolder;
  /** 0 for the folder's first run; later runs are drawn "(continued)". */
  run: number;
  /** This run's cues, in flat order. */
  runCues: ShowCue[];
}

export type RundownRow = CueRow | FolderRow;

export interface RundownView {
  /** What is drawn, top to bottom. */
  rows: RundownRow[];
  /** Every cue id to the drawn row that shows it: its own, or its run's header while collapsed. */
  rowOf: ReadonlyMap<string, string>;
  /** The folders that read as present, by id; the first entry of a repeated id. */
  folders: ReadonlyMap<string, ShowFolder>;
  /** Each present folder's cues, every run, in flat order. */
  members: ReadonlyMap<string, ShowCue[]>;
  /** Each cue's flat index. */
  indexOf: ReadonlyMap<string, number>;
}

export function folderRowId(folderId: string, run = 0): string {
  return run ? `folder:${folderId}:${run}` : `folder:${folderId}`;
}

/** A folder's name as drawn: a blank one is "Untitled folder". */
export function folderName(folder: Pick<ShowFolder, 'name'>): string {
  return folder.name.trim() || 'Untitled folder';
}

/** The test id a row wears, and what the keys reveal: `cue-<id>`, `folder-row-<id>[-<run>]`. */
export function rowTestId(row: RundownRow): string {
  return row.kind === 'cue' ? `cue-${row.id}` : row.run ? `folder-row-${row.folder.id}-${row.run}` : `folder-row-${row.folder.id}`;
}

export function rundownView(record: { cues?: readonly ShowCue[]; folders?: readonly ShowFolder[] }): RundownView {
  const cues = record.cues ?? [];
  const live = liveFolderIds(cues, record.folders);
  const folders = new Map<string, ShowFolder>();
  for (const f of record.folders ?? []) if (live.has(f.id) && !folders.has(f.id)) folders.set(f.id, f);
  const rows: RundownRow[] = [];
  const rowOf = new Map<string, string>();
  const members = new Map<string, ShowCue[]>();
  const indexOf = new Map<string, number>();
  const runs = new Map<string, number>();
  let header: FolderRow | null = null;
  cues.forEach((cue, i) => {
    indexOf.set(cue.id, i);
    const folderId = folderIdOf(cue, live) ?? null;
    if (!folderId) header = null;
    else {
      if (header?.folder.id !== folderId) {
        const run = runs.get(folderId) ?? 0;
        runs.set(folderId, run + 1);
        header = { kind: 'folder', id: folderRowId(folderId, run), folder: folders.get(folderId)!, run, runCues: [] };
        rows.push(header);
      }
      header.runCues.push(cue);
      members.set(folderId, [...(members.get(folderId) ?? []), cue]);
    }
    if (header?.folder.collapsed === true) rowOf.set(cue.id, header.id);
    else {
      rows.push({ kind: 'cue', id: cue.id, cue, no: i + 1, folderId });
      rowOf.set(cue.id, cue.id);
    }
  });
  return { rows, rowOf, folders, members, indexOf };
}

/** Where the keyboard stands: the held folder row while its folder is there, else the row that shows
 *  the selected cue - its own, or its collapsed folder's header. */
export function cursorRowId(view: RundownView, held: { folderId: string; rowId: string } | null, cueId: string | null): string | null {
  if (held && view.folders.has(held.folderId)) return view.rows.some((r) => r.id === held.rowId) ? held.rowId : folderRowId(held.folderId);
  return cueId ? (view.rowOf.get(cueId) ?? null) : null;
}

/** The cues a row stands for: a cue its own, a header every cue of its folder. */
function cuesOfRow(view: RundownView, row: RundownRow): string[] {
  return row.kind === 'cue' ? [row.cue.id] : (view.members.get(row.folder.id) ?? []).map((c) => c.id);
}

/**
 * WHAT A SHIFT-CLICK COVERS (owner, 2026-09-28): the drawn rows from the anchor to the clicked one, in
 * either direction - a cue row its cue, a header its whole folder, hidden cues and other runs
 * included - in flat order. With no anchor drawn, the clicked row alone.
 */
export function rangeCueIds(view: RundownView, anchorRowId: string | null, toRowId: string): string[] {
  const to = view.rows.findIndex((r) => r.id === toRowId);
  if (to < 0) return [];
  const from = anchorRowId === null ? -1 : view.rows.findIndex((r) => r.id === anchorRowId);
  const [a, b] = from < 0 ? [to, to] : from < to ? [from, to] : [to, from];
  const ids = new Set<string>();
  for (let i = a; i <= b; i++) for (const id of cuesOfRow(view, view.rows[i])) ids.add(id);
  return [...ids].sort((x, y) => (view.indexOf.get(x) ?? 0) - (view.indexOf.get(y) ?? 0));
}

/** Which third of a row the pointer is in. */
export type DropBand = 'top' | 'middle' | 'bottom';

export function bandAt(offsetY: number, height: number): DropBand {
  return offsetY < height / 3 ? 'top' : offsetY > (height * 2) / 3 ? 'bottom' : 'middle';
}

/** Where the drop line is drawn: on a row's edge, around a collapsed header, or on the end strip.
 *  `inside`: the landing joins a folder, so the line is indented. */
export interface DropMark {
  rowId: string | 'end';
  edge: 'before' | 'after' | 'into';
  inside: boolean;
}

export interface DropPlan {
  place: Place;
  mark: DropMark;
  /** Why it cannot land there, said while it hovers; null when it can. */
  refused: string | null;
}

/**
 * WHERE A DRAG LANDS, from the row the pointer is over and which third of it. The middle third is
 * the drag as it always was: a row moving down lands after the row, one moving up before it. The
 * top and bottom thirds land before and after, joining that row's folder. On a folder's header the
 * top third lands above the folder, outside it; the rest lands first in an open folder and last in a
 * collapsed one. A folder dragged onto another folder lands beside it, never inside. Null when the
 * drop would change nothing.
 */
export function planDrop(
  record: { cues?: readonly ShowCue[]; folders?: readonly ShowFolder[]; playoutItems?: readonly Pick<PlayoutItem, 'id' | 'kind' | 'mediaKind'>[] },
  view: RundownView,
  what: Movable,
  aim: { rowId: string; band: DropBand } | 'end',
): DropPlan | null {
  let place: Place;
  let mark: DropMark;
  if (aim === 'end') {
    place = { end: true };
    mark = { rowId: 'end', edge: 'into', inside: false };
  } else {
    const row = view.rows.find((r) => r.id === aim.rowId);
    if (!row) return null;
    const firstOf = (w: Movable) => ('cueId' in w ? (view.indexOf.get(w.cueId) ?? -1) : Math.min(...(view.members.get(w.folderId) ?? []).map((c) => view.indexOf.get(c.id) ?? -1)));
    const rowFirst = row.kind === 'cue' ? (view.indexOf.get(row.cue.id) ?? -1) : (view.indexOf.get(row.runCues[0].id) ?? -1);
    const down = firstOf(what) < rowFirst;
    const byBand = (before: Place, after: Place) => (aim.band === 'top' ? before : aim.band === 'bottom' ? after : down ? after : before);
    if ('folderId' in what) {
      const other = row.kind === 'folder' ? row.folder.id : row.folderId;
      if (other === what.folderId) return null;
      if (!other) {
        const r = row as CueRow;
        place = byBand({ before: r.cue.id }, { after: r.cue.id });
        mark = { rowId: r.id, edge: 'before' in place ? 'before' : 'after', inside: false };
      } else {
        place = row.kind === 'folder' && aim.band === 'top' ? { beforeFolder: other } : byBand({ beforeFolder: other }, { afterFolder: other });
        const runRows = view.rows.filter((r) => (r.kind === 'folder' ? r.folder.id : r.folderId) === other);
        mark = 'beforeFolder' in place ? { rowId: runRows[0].id, edge: 'before', inside: false } : { rowId: runRows[runRows.length - 1].id, edge: 'after', inside: false };
      }
    } else if (row.kind === 'folder') {
      if (aim.band === 'top') {
        place = { beforeFolder: row.folder.id };
        mark = { rowId: row.id, edge: 'before', inside: false };
      } else if (row.folder.collapsed === true) {
        place = { into: row.folder.id };
        mark = { rowId: row.id, edge: 'into', inside: true };
      } else {
        place = { before: row.runCues[0].id };
        mark = { rowId: row.id, edge: 'after', inside: true };
      }
    } else {
      if (row.cue.id === what.cueId) return null;
      place = byBand({ before: row.cue.id }, { after: row.cue.id });
      mark = { rowId: row.id, edge: 'before' in place ? 'before' : 'after', inside: !!row.folderId };
    }
  }
  const refused = placeRefusal(record, what, place);
  if (!refused && !placeInOrder(record.cues ?? [], record.folders, what, place)) return null;
  return { place, mark, refused };
}
