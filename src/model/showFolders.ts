// FOLDERS IN THE RUNDOWN (docs/CLIP_PLAYBACK_PLAN.md §7, phase 4): the rules that keep a folder's
// cues together in the flat cue list, and the way a record that breaks them is read.
//
// A folder holds no list of its cues. Each cue names its folder (`ShowCue.folderId`), and a folder's
// cues stand together in `Show.cues`, where the first of them places it. Every writer in ./shows.ts
// keeps them so through the steps below, and the team merge (./teamShowMerge.ts) gathers what a merge
// tore apart. A record from an older build can still hold a folder split in two, a folderId naming no
// folder, or a folder no cue names; the reader shows each as it is (`rundownRows`) and nothing
// reorders on read. The next move gathers it.
//
// PURE, AND IMPORTING NOTHING BUT TYPES, so both ./shows.ts and ./teamShowMerge.ts can import it and
// scripts/team-show-merge.test.mjs and scripts/show-folders.test.mjs run it in Node without a browser.
// Keep it that way: shows.ts brings the durable store with it. Only what is erasable TypeScript, and
// ES2020 (tsconfig `lib`).

import type { PlayoutItem, ShowCue, ShowFolder } from './shows';

/** What these rules need of a cue: its id and the folder it names. */
export type FolderMember = Pick<ShowCue, 'id' | 'folderId'>;

/** How a folder plays, read safely: a word this build does not know (a newer build's) reads as One by
 *  one, which sends exactly what each of its cues sends. */
export function folderMode(folder: Pick<ShowFolder, 'mode'>): ShowFolder['mode'] {
  return folder.mode === 'through' || folder.mode === 'together' ? folder.mode : 'manual';
}

/** A new folder's name: `Folder N`, one past the highest N in use, so two folders made one after
 *  another are never both `Folder 3`, and a name in use is never given twice. */
export function nextFolderName(folders: readonly Pick<ShowFolder, 'name'>[] | undefined): string {
  let highest = 0;
  for (const f of folders ?? []) {
    const m = /^Folder (\d+)$/.exec(f.name.trim());
    if (m) highest = Math.max(highest, Number(m[1]));
  }
  return `Folder ${highest + 1}`;
}

/** The ids of the folders a record really has: each one named by a folder entry AND by a cue. */
export function liveFolderIds(cues: readonly FolderMember[], folders: readonly Pick<ShowFolder, 'id'>[] | undefined): Set<string> {
  const named = new Set(cues.map((c) => c.folderId).filter((id): id is string => !!id));
  return new Set((folders ?? []).map((f) => f.id).filter((id) => named.has(id)));
}

/** The folder a cue reads as being in: the one it names when that folder exists, else none. */
export function folderIdOf(cue: FolderMember, live: ReadonlySet<string>): string | undefined {
  return cue.folderId && live.has(cue.folderId) ? cue.folderId : undefined;
}

/** Whether every folder's cues stand together in the flat list. */
export function foldersContiguous(cues: readonly FolderMember[]): boolean {
  const closed = new Set<string>();
  let open: string | undefined;
  for (const c of cues) {
    if (c.folderId !== open) {
      if (open) closed.add(open);
      if (c.folderId && closed.has(c.folderId)) return false;
      open = c.folderId;
    }
  }
  return true;
}

/**
 * GATHER each folder's cues at its first member's position, in their flat order: the cues of a
 * folder torn apart by an older build or a merge are brought together where the folder starts, and
 * everything else keeps its order. The same array comes back when nothing had to move.
 */
export function gatherFolders<T extends FolderMember>(cues: readonly T[]): readonly T[] {
  if (foldersContiguous(cues)) return cues;
  const byFolder = new Map<string, T[]>();
  for (const c of cues) if (c.folderId) byFolder.set(c.folderId, [...(byFolder.get(c.folderId) ?? []), c]);
  const placed = new Set<string>();
  const out: T[] = [];
  for (const c of cues) {
    if (!c.folderId) out.push(c);
    else if (!placed.has(c.folderId)) {
      placed.add(c.folderId);
      out.push(...byFolder.get(c.folderId)!);
    }
  }
  return out;
}

/**
 * TIDY what a write left: a folder no cue names goes (a folder is never empty), a second entry of one
 * folder id goes (the first is the one read), and a folderId that names no folder is cleared (the cue
 * reads as in none anyway). Nothing is reordered. Returns what changed, and leaves the arrays as they
 * were when nothing did.
 */
export function pruneFolders<T extends FolderMember, F extends Pick<ShowFolder, 'id'>>(
  cues: readonly T[],
  folders: readonly F[] | undefined,
): { cues: readonly T[]; folders: readonly F[]; changed: boolean } {
  const all = folders ?? [];
  const live = liveFolderIds(cues, all);
  const seen = new Set<string>();
  const unique = all.filter((f) => !seen.has(f.id) && !!seen.add(f.id));
  const keptFolders = unique.length === all.length && all.length === live.size ? all : unique.filter((f) => live.has(f.id));
  let keptCues: readonly T[] = cues;
  if (cues.some((c) => c.folderId && !live.has(c.folderId))) {
    keptCues = cues.map((c) => {
      if (!c.folderId || live.has(c.folderId)) return c;
      const { folderId: _orphan, ...rest } = c;
      return rest as T;
    });
  }
  return { cues: keptCues, folders: keptFolders, changed: keptCues !== cues || keptFolders !== all };
}

/** Gather and prune in one step: what the merge runs on its result, and every move on the record. */
export function settleFolders<T extends FolderMember, F extends Pick<ShowFolder, 'id'>>(
  cues: readonly T[],
  folders: readonly F[] | undefined,
): { cues: readonly T[]; folders: readonly F[]; changed: boolean } {
  const pruned = pruneFolders(cues, folders);
  const gathered = gatherFolders(pruned.cues);
  return { cues: gathered, folders: pruned.folders, changed: pruned.changed || gathered !== pruned.cues };
}

/**
 * Why a cue cannot be in a Play-through folder, or null (plan §6.6): the folder plays its files one
 * after another on one slot, so only a clip or an audio file joins. A graphic is taken by the
 * operator, a server template has no end, and a still never ends. A clip whose kind the server's list
 * has not given yet may join; the folder's Take waits for its kind (control/serverPlayout.ts).
 */
export function throughRefusal(
  cue: Pick<ShowCue, 'label' | 'source' | 'sourceId'>,
  items: readonly Pick<PlayoutItem, 'id' | 'kind' | 'mediaKind'>[],
): string | null {
  const what = throughMisfit(cue, items);
  return what ? `${cue.label} is ${what}, and a folder that plays through plays clips and audio files only.` : null;
}

/** What a cue is that keeps it out of a Play-through folder, in words (`a graphic`), or null. */
export function throughMisfit(
  cue: Pick<ShowCue, 'source' | 'sourceId'>,
  items: readonly Pick<PlayoutItem, 'id' | 'kind' | 'mediaKind'>[],
): string | null {
  if (cue.source !== 'playout') return 'a graphic';
  const item = items.find((i) => i.id === cue.sourceId);
  if (!item) return 'a server file this production no longer lists';
  return item.kind !== 'media' ? 'a server template' : item.mediaKind === 'still' ? 'a still, which never ends' : null;
}

/** Where a block of cues may go back into a list without splitting a folder: `at` itself, or - when
 *  that falls inside a folder's run - the end of that run. Folders do not nest. */
function clearOfFolders(cues: readonly FolderMember[], at: number): number {
  let i = at;
  while (i > 0 && i < cues.length && cues[i].folderId && cues[i - 1].folderId === cues[i].folderId) i += 1;
  return i;
}

/**
 * NEW FOLDER FROM SELECTION (plan §7): the chosen cues, in their rundown order, become one folder
 * where the first of them stood - or, when that is inside another folder, right after that folder,
 * since folders do not nest. A chosen cue in another folder leaves it. Null when nothing is chosen.
 */
export function foldSelection<T extends FolderMember>(cues: readonly T[], ids: ReadonlySet<string>, folderId: string): T[] | null {
  const chosen = cues.filter((c) => ids.has(c.id));
  if (!chosen.length) return null;
  const rest = cues.filter((c) => !ids.has(c.id));
  const at = clearOfFolders(rest, cues.findIndex((c) => ids.has(c.id)));
  return [...rest.slice(0, at), ...chosen.map((c) => ({ ...c, folderId })), ...rest.slice(at)];
}

// ── EACH WRITER'S CUE-ORDER STEP. ./shows.ts runs these inside its writes, and
// scripts/show-folders.test.mjs pins that each keeps every folder whole. ──

/** An append: at the end, in no folder, so it never lands inside one. */
export function appendCue<T extends FolderMember>(cues: readonly T[], cue: T): T[] {
  const { folderId: _none, ...loose } = cue;
  return [...cues, loose as T];
}

/** Right after the cue `afterId`, in that cue's folder, so the folder's run goes on through it; at
 *  the end, in no folder, when that cue is gone. Duplicate's step. */
export function insertAfter<T extends FolderMember>(cues: readonly T[], afterId: string, cue: T): T[] {
  const at = cues.findIndex((c) => c.id === afterId);
  if (at < 0) return appendCue(cues, cue);
  const { folderId: _none, ...loose } = cue;
  const placed = (cues[at].folderId ? { ...loose, folderId: cues[at].folderId } : loose) as T;
  return [...cues.slice(0, at + 1), placed, ...cues.slice(at + 1)];
}

/** Remove a folder and keep its cues where they stand, in no folder. */
export function unfold<T extends FolderMember>(cues: readonly T[], folderId: string): T[] {
  return cues.map((c) => {
    if (c.folderId !== folderId) return c;
    const { folderId: _gone, ...rest } = c;
    return rest as T;
  });
}

/** What a drag moves: one cue, or a whole folder with its cues. */
export type Movable = { cueId: string } | { folderId: string };

/**
 * Where a drag puts it. `before`/`after` a cue joins that cue's folder, or none; `into` a folder puts
 * a cue last in it; `beforeFolder`/`afterFolder` put it beside a whole folder, in none; `end` is the
 * end of the rundown, in none.
 */
export type Place =
  | { before: string }
  | { after: string }
  | { into: string }
  | { beforeFolder: string }
  | { afterFolder: string }
  | { end: true };

/** First and last index of a folder's run in a list where it is whole, or null when it has no cue. */
function runOf(cues: readonly FolderMember[], folderId: string): [number, number] | null {
  const first = cues.findIndex((c) => c.folderId === folderId);
  if (first < 0) return null;
  let last = first;
  while (last + 1 < cues.length && cues[last + 1].folderId === folderId) last += 1;
  return [first, last];
}

/** The folder a cue joins at a place: the cue it lands beside's folder, the folder it goes into, or none. */
function joins(cues: readonly FolderMember[], place: Place): string | undefined {
  if ('into' in place) return place.into;
  const beside = 'before' in place ? place.before : 'after' in place ? place.after : undefined;
  return beside === undefined ? undefined : cues.find((c) => c.id === beside)?.folderId;
}

/**
 * THE DRAG'S ONE WRITE (plan §7): move a cue or a whole folder to a place, and set or clear the cue's
 * folder in the same step. The record is settled first, so any move gathers a folder an older build
 * split and forgets a folderId that names nothing; a folder never lands inside another; a folder a
 * move empties goes (the writer prunes it). Null when nothing would change, or the place is gone or
 * inside what moves.
 */
export function placeInOrder<T extends FolderMember>(
  cues: readonly T[],
  folders: readonly Pick<ShowFolder, 'id'>[] | undefined,
  what: Movable,
  place: Place,
): T[] | null {
  const whole = settleFolders(cues, folders).cues;
  const moving = 'cueId' in what ? whole.filter((c) => c.id === what.cueId) : whole.filter((c) => c.folderId === what.folderId);
  if (!moving.length) return null;
  const moved = new Set(moving.map((c) => c.id));
  const target = 'before' in place ? place.before : 'after' in place ? place.after : undefined;
  if (target !== undefined && moved.has(target)) return null;
  const folderTarget = 'into' in place ? place.into : 'beforeFolder' in place ? place.beforeFolder : 'afterFolder' in place ? place.afterFolder : undefined;
  if ('folderId' in what && folderTarget === what.folderId) return null;
  const rest = whole.filter((c) => !moved.has(c.id));
  let at: number;
  if ('end' in place) at = rest.length;
  else if (target !== undefined) {
    const i = rest.findIndex((c) => c.id === target);
    if (i < 0) return null;
    at = 'before' in place ? i : i + 1;
  } else {
    const run = runOf(rest, folderTarget!);
    if (run) at = 'beforeFolder' in place ? run[0] : run[1] + 1;
    // The folder's last cue leaving it, above or below: it stays where it stands, in no folder.
    else if ('cueId' in what && moving[0].folderId === folderTarget) at = whole.indexOf(moving[0]);
    else return null;
  }
  let block: T[];
  if ('folderId' in what) {
    // A folder goes beside another, never inside it.
    at = clearOfFolders(rest, at);
    block = moving;
  } else {
    const folderId = joins(whole, place);
    const { folderId: _was, ...loose } = moving[0];
    block = [(folderId ? { ...loose, folderId } : loose) as T];
  }
  const out = [...rest.slice(0, at), ...block, ...rest.slice(at)];
  const same = out.length === cues.length && out.every((c, i) => c.id === cues[i].id && c.folderId === cues[i].folderId);
  return same ? null : out;
}

/**
 * ONE STEP up or down (`moveShowCue`), which never splits a folder: a cue in a folder swaps with its
 * neighbour in the folder, and at the folder's edge it steps out of the folder where it stands; a cue
 * in none steps over a whole folder as one block. Settles first, like every move. Null at the end of
 * the list.
 */
export function stepInOrder<T extends FolderMember>(
  cues: readonly T[],
  folders: readonly Pick<ShowFolder, 'id'>[] | undefined,
  cueId: string,
  dir: -1 | 1,
): T[] | null {
  const whole = [...settleFolders(cues, folders).cues];
  const i = whole.findIndex((c) => c.id === cueId);
  if (i < 0) return null;
  const cue = whole[i];
  const next = whole[i + dir];
  if (cue.folderId) {
    if (next?.folderId === cue.folderId) {
      [whole[i], whole[i + dir]] = [whole[i + dir], whole[i]];
      return whole;
    }
    const { folderId: _left, ...loose } = cue;
    whole[i] = loose as T;
    return whole;
  }
  if (!next) return null;
  if (next.folderId) {
    const [first, last] = runOf(whole, next.folderId)!;
    const rest = whole.filter((c) => c !== cue);
    const at = dir > 0 ? last : first;
    return [...rest.slice(0, at), cue, ...rest.slice(at)];
  }
  [whole[i], whole[i + dir]] = [whole[i + dir], whole[i]];
  return whole;
}

/** A folder's cues in rundown order, across every run of a split folder; none for a folder that reads
 *  as absent, and never a cue whose folderId names no folder. */
export function folderMembers<T extends FolderMember>(cues: readonly T[], folders: readonly Pick<ShowFolder, 'id'>[] | undefined, folderId: string): T[] {
  const live = liveFolderIds(cues, folders);
  return cues.filter((c) => folderIdOf(c, live) === folderId);
}

/**
 * WHY A DRAG CANNOT PUT IT THERE, or null - asked while it hovers, so the refusal is read before it is
 * let go, and again by the writer. A piece or a place that has gone (a teammate's save) is refused;
 * so is a folder inside another folder; and a cue that cannot play through is refused at a
 * Play-through folder's door, naming it. A cue already in that folder may move within it or leave.
 */
export function placeRefusal(
  record: { cues?: readonly ShowCue[]; folders?: readonly ShowFolder[]; playoutItems?: readonly Pick<PlayoutItem, 'id' | 'kind' | 'mediaKind'>[] },
  what: Movable,
  place: Place,
): string | null {
  const cues = record.cues ?? [];
  const live = liveFolderIds(cues, record.folders);
  const gone = 'The rundown changed while you dragged. Drag it again.';
  const piece = 'cueId' in what ? cues.find((c) => c.id === what.cueId) : live.has(what.folderId) ? what : undefined;
  if (!piece) return gone;
  const beside = 'before' in place ? place.before : 'after' in place ? place.after : undefined;
  const folderTarget = 'into' in place ? place.into : 'beforeFolder' in place ? place.beforeFolder : 'afterFolder' in place ? place.afterFolder : undefined;
  if (beside !== undefined && !cues.some((c) => c.id === beside)) return gone;
  if (folderTarget !== undefined && !live.has(folderTarget)) return gone;
  const joining = 'into' in place ? place.into : beside !== undefined ? folderIdOf(cues.find((c) => c.id === beside)!, live) : undefined;
  if ('folderId' in what) {
    return ('into' in place && place.into !== what.folderId) || (joining && joining !== what.folderId) ? 'A folder cannot go inside another folder.' : null;
  }
  const cue = piece as ShowCue;
  const folder = joining ? record.folders?.find((f) => f.id === joining) : undefined;
  if (!folder || folderMode(folder) !== 'through' || folderIdOf(cue, live) === joining) return null;
  return throughRefusal(cue, record.playoutItems ?? []);
}
