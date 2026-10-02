// THE RUNDOWN'S CLIPBOARD (docs/CLIP_PLAYBACK_PLAN.md §20.2): what Ctrl+C and Ctrl+X hold, and what a
// paste of copies writes. The page keeps the clipboard itself, in its own memory: never the system
// clipboard, never saved, and a paste works within the production it was copied from.
//
// A COPY is new cues on the same graphic or server file - a new id each, their own values, note and
// clip settings, the label as it was, nothing on air - because a cue's id is what the air, folders
// and the data API point at, and a copy must never share it. A CUT is not a delete: it holds
// the cues' ids, and the paste MOVES them (shows.ts `pasteInRundown`), so nothing is removed until
// the paste lands and whatever points at them keeps pointing at them.
//
// Pure, importing only types and ./showFolders.ts, so scripts/cue-clipboard.test.mjs runs it in Node.

import type { PlayoutItem, ShowCue, ShowFolder } from './shows';
import { folderIdOf, joinRefusal, joins, landBlock, liveFolderIds, settleFolders, wholeFolders, type Place } from './showFolders.ts';

/** One copied cue: what it is made of, and the copied folder it came in, when it came in one whole. */
export type ClipCue = Pick<ShowCue, 'sourceId' | 'source' | 'label' | 'values' | 'note' | 'playback' | 'auto'> & { folderKey?: string };
/** One folder every cue of which was copied: it pastes as a new folder with its mode and settings. */
export type ClipFolder = Pick<ShowFolder, 'name' | 'mode' | 'end' | 'slot'> & { key: string };

export type CueClip =
  | { kind: 'copy'; showId: string; cues: readonly ClipCue[]; folders: readonly ClipFolder[] }
  | { kind: 'cut'; showId: string; ids: readonly string[] };

/**
 * COPY these cues of a production, in rundown order. A folder all of whose cues are among them comes
 * as a folder; the cues of one only partly copied come loose. `relabel` names the copies (Duplicate's
 * `… copy`); a plain copy keeps each label as it was. Null when none of them is there.
 */
export function copyClip(
  show: { id: string; cues?: readonly ShowCue[]; folders?: readonly ShowFolder[] },
  ids: readonly string[],
  relabel: (label: string) => string = (label) => label,
): CueClip | null {
  // Settled first, like every move: a folder an older build split is copied whole and in one run.
  const cues = settleFolders(show.cues ?? [], show.folders).cues;
  const live = liveFolderIds(cues, show.folders);
  const chosen = new Set(ids);
  const picked = cues.filter((c) => chosen.has(c.id));
  if (!picked.length) return null;
  const whole = wholeFolders(cues, chosen, (c) => folderIdOf(c, live));
  const folders: ClipFolder[] = [];
  for (const f of show.folders ?? []) {
    if (!whole.has(f.id) || folders.some((x) => x.key === f.id)) continue;
    folders.push({ key: f.id, name: f.name, mode: f.mode, ...(f.end ? { end: f.end } : {}), ...(f.slot ? { slot: { ...f.slot } } : {}) });
  }
  return {
    kind: 'copy',
    showId: show.id,
    folders,
    cues: picked.map((c) => {
      const folder = folderIdOf(c, live);
      return {
        sourceId: c.sourceId,
        ...(c.source ? { source: c.source } : {}),
        label: relabel(c.label),
        values: { ...c.values },
        ...(c.note ? { note: c.note } : {}),
        ...(c.playback ? { playback: { ...c.playback } } : {}),
        ...(c.auto ? { auto: { ...c.auto } } : {}),
        ...(folder && whole.has(folder) ? { folderKey: folder } : {}),
      };
    }),
  };
}

/** CUT these cues: their ids, which the paste moves. */
export function cutClip(showId: string, ids: readonly string[]): CueClip {
  return { kind: 'cut', showId, ids: [...ids] };
}

/** How many cues a clip carries. */
export function clipSize(clip: CueClip): number {
  return clip.kind === 'cut' ? clip.ids.length : clip.cues.length;
}

/**
 * WHAT A PASTE OF COPIES WRITES: new cues - and a new folder for each folder copied whole - landed at
 * the place as a dropped block would be (./showFolders.ts `landBlock`), or why it cannot: a graphic
 * or server file the production no longer has, a Play-through folder's refusal, a place that has
 * gone. `newId` mints every id. Settles the record first, like every move.
 */
export function pasteCopies(
  record: {
    cues?: readonly ShowCue[];
    folders?: readonly ShowFolder[];
    graphics: readonly { id: string }[];
    playoutItems?: readonly Pick<PlayoutItem, 'id' | 'kind' | 'mediaKind'>[];
  },
  clip: Extract<CueClip, { kind: 'copy' }>,
  place: Place,
  newId: () => string,
): { cues: ShowCue[]; folders: ShowFolder[]; added: string[] } | { refused: string } {
  const folderIds = new Map(clip.folders.map((f) => [f.key, newId()] as const));
  const block: ShowCue[] = [];
  for (const c of clip.cues) {
    const there = c.source === 'playout' ? (record.playoutItems ?? []).some((i) => i.id === c.sourceId) : record.graphics.some((g) => g.id === c.sourceId);
    if (!there) return { refused: `${c.label} plays something this production no longer has, so it was not pasted.` };
    const folderId = c.folderKey ? folderIds.get(c.folderKey) : undefined;
    block.push({
      id: newId(),
      sourceId: c.sourceId,
      ...(c.source ? { source: c.source } : {}),
      label: c.label,
      values: { ...c.values },
      ...(c.note ? { note: c.note } : {}),
      ...(c.playback ? { playback: { ...c.playback } } : {}),
      ...(c.auto ? { auto: { ...c.auto } } : {}),
      ...(folderId ? { folderId } : {}),
    });
  }
  const settled = settleFolders(record.cues ?? [], record.folders);
  const keep = new Set(folderIds.values());
  if (!keep.size) {
    const refused = joinRefusal(record, block, joins(settled.cues, place));
    if (refused) return { refused };
  }
  const cues = landBlock(settled.cues, block, keep, place);
  if (!cues) return { refused: 'The row to paste after has gone. Select a row and paste again.' };
  const folders: ShowFolder[] = [
    ...settled.folders,
    ...clip.folders.map((f) => ({
      id: folderIds.get(f.key)!,
      name: `${f.name} copy`,
      mode: f.mode,
      ...(f.end ? { end: f.end } : {}),
      ...(f.slot ? { slot: { ...f.slot } } : {}),
    })),
  ];
  return { cues, folders, added: block.map((c) => c.id) };
}

/** Why a cut cannot be pasted at a place, or null: somewhere inside what was cut. */
export function cutPlaceRefusal(cues: readonly Pick<ShowCue, 'id' | 'folderId'>[], ids: readonly string[], place: Place): string | null {
  const cut = new Set(ids);
  const beside = 'before' in place ? place.before : 'after' in place ? place.after : undefined;
  const folder = 'into' in place ? place.into : undefined;
  const inside = beside !== undefined ? cut.has(beside) : folder !== undefined && cues.filter((c) => c.folderId === folder).every((c) => cut.has(c.id));
  return inside ? 'Paste somewhere outside what you cut.' : null;
}
