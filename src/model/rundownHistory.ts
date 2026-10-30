import type { Show, ShowCue, ShowFolder, PlayoutItem } from './shows';
import type { SavedGraphic } from './packets';
import { foldersContiguous, throughRefusal } from './showFolders.ts';
import { selectionFrozen, selectionKeep, selectionReadOnly } from './productionData.ts';
import { typedFrozen, typedKeep, typedValuesOf } from './ografTyped.ts';

/** Only prepared rundown data. Air, publication, datasets and production metadata stay outside. */
export interface RundownSlice {
  cues: ShowCue[];
  folders: Omit<ShowFolder, 'collapsed'>[];
  graphics: SavedGraphic[];
  playoutItems: PlayoutItem[];
}

export const RUNDOWN_CHANGED = 'The rundown changed elsewhere. Undo history was cleared.';

export function rundownSlice(show: Show): RundownSlice {
  return structuredClone({
    cues: show.cues ?? [],
    folders: (show.folders ?? []).map(({ collapsed: _collapsed, ...folder }) => folder),
    graphics: show.graphics,
    playoutItems: show.playoutItems ?? [],
  });
}

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, ordered(v)]),
  );
  return value;
}
export const sliceKey = (slice: RundownSlice): string => JSON.stringify(ordered(slice));
export const sameRundown = (a: RundownSlice, b: RundownSlice): boolean => sliceKey(a) === sliceKey(b);

export interface RundownLiveState { cues: ReadonlySet<string>; sources: ReadonlySet<string>; folders: ReadonlySet<string>; unidentifiedServer: boolean }
/** An inverse changes preparation only. Refuse data that current air or a running folder uses. */
export function liveRundownRefusal(expected: RundownSlice, replacement: RundownSlice, live: RundownLiveState): string | null {
  for (const id of live.cues) {
    const before = expected.cues.find(c => c.id === id), after = replacement.cues.find(c => c.id === id);
    if (before && (!after || after.sourceId !== before.sourceId || after.source !== before.source)) return 'Take the affected cue off air before undoing this edit.';
  }
  for (const id of live.sources) {
    const before = [...expected.graphics, ...expected.playoutItems].find(s => s.id === id);
    const after = [...replacement.graphics, ...replacement.playoutItems].find(s => s.id === id);
    // Its place and size do not touch air by themselves (the next Take or Update carries them), so
    // undoing an adjustment of a graphic on air is allowed (playout adjustments: "Undo").
    if (before && JSON.stringify(ordered(withoutAdjust(before))) !== JSON.stringify(ordered(after && withoutAdjust(after)))) return 'Take the affected source off air before undoing this edit.';
  }
  for (const id of live.folders) {
    const members = (slice: RundownSlice) => slice.cues.filter(c => c.folderId === id).map(c => c.id);
    if (JSON.stringify(members(expected)) !== JSON.stringify(members(replacement)) ||
        JSON.stringify(ordered(expected.folders.find(f => f.id === id))) !== JSON.stringify(ordered(replacement.folders.find(f => f.id === id)))) return 'Stop the affected folder before undoing this edit.';
  }
  if (live.unidentifiedServer && JSON.stringify(ordered(expected.playoutItems)) !== JSON.stringify(ordered(replacement.playoutItems))) return 'Clear the unidentified server output before undoing this edit.';
  return null;
}

function withoutAdjust<T extends object>(source: T): T {
  if (!('adjust' in source)) return source;
  const { adjust: _adjust, ...rest } = source as T & { adjust?: unknown };
  return rest as T;
}

export function rundownRefusal(slice: RundownSlice): string | null {
  const unique = (rows: readonly { id: string }[]) => rows.every(r => !!r.id) && new Set(rows.map(r => r.id)).size === rows.length;
  if (![slice.cues, slice.folders, slice.graphics, slice.playoutItems].every(unique)) return 'The saved rundown has duplicate or missing identifiers.';
  if (!foldersContiguous(slice.cues)) return 'The saved rundown splits a folder.';
  const graphics = new Set(slice.graphics.map(g => g.id)), items = new Set(slice.playoutItems.map(i => i.id));
  const folders = new Map(slice.folders.map(f => [f.id, f]));
  for (const cue of slice.cues) {
    if (!(cue.source === 'playout' ? items : graphics).has(cue.sourceId)) return 'The saved rundown references a missing source.';
    if (cue.folderId && !folders.has(cue.folderId)) return 'The saved rundown references a missing folder.';
    if (cue.folderId && folders.get(cue.folderId)?.mode === 'through') {
      const refused = throughRefusal(cue, slice.playoutItems);
      if (refused) return refused;
    }
  }
  if (slice.folders.some(f => !slice.cues.some(c => c.folderId === f.id))) return 'The saved rundown has an empty folder.';
  return null;
}

/** A pure replacement used by both conditional storage paths. Preserve current collapse state. */
export function replaceRundown(show: Show, expected: RundownSlice, replacement: RundownSlice): { show: Show | null; refused: string | null } {
  if (show.deleted || !sameRundown(rundownSlice(show), expected)) return { show: null, refused: RUNDOWN_CHANGED };
  const refused = rundownRefusal(replacement);
  if (refused) return { show: null, refused };
  const collapse = new Map((show.folders ?? []).map(f => [f.id, f.collapsed]));
  const copy = structuredClone(replacement);
  const next = {
    ...show, ...copy,
    folders: copy.folders.map(f => ({ ...f, ...(collapse.has(f.id) ? { collapsed: collapse.get(f.id) } : {}) })),
    updatedAt: new Date().toISOString(),
  };
  // An undo is a write like any other, except that a cue it brings back keeps the selection the
  // record had: history copies are the record's own bytes. So does a cue whose live candidate the
  // writer moved (E7.2a): undone or redone, it goes back to the selection it had, a cue of a later
  // version excepted (`selectionFrozen` never rewrites one).
  const moved = new Map<string, string>();
  for (const cue of copy.cues) {
    const now = show.cues?.find((c) => c.id === cue.id);
    const to = JSON.stringify(cue.selection ?? null);
    if (now && JSON.stringify(now.selection ?? null) !== to && !selectionReadOnly(cue, show.collections)) moved.set(cue.id, to);
  }
  // So does a cue whose typed values the form changed (E2.1): undone or redone, it goes back to the
  // envelope the record had. Only between two envelopes this build reads: turning typed data on or
  // off is still refused here, and a later version's is never rewritten.
  const typedMoved = new Map<string, string>();
  for (const cue of copy.cues) {
    const now = show.cues?.find((c) => c.id === cue.id);
    const to = JSON.stringify(cue.typed ?? null);
    if (now && typedValuesOf(now.typed) && typedValuesOf(cue.typed) && JSON.stringify(now.typed) !== to) typedMoved.set(cue.id, to);
  }
  const restored = new Set(copy.cues.map((c) => c.id));
  const frozen = selectionFrozen(selectionKeep(show), next, restored, moved.size ? { cues: moved } : undefined) ?? typedFrozen(typedKeep(show), next, restored, typedMoved);
  return frozen ? { show: null, refused: frozen } : { show: next, refused: null };
}

export interface RundownHistoryEntry { before: RundownSlice; after: RundownSlice; label: string }
/** Session-local retention, with adjacent snapshots shared between entries. */
export class RundownHistory {
  undo: RundownHistoryEntry[] = [];
  redo: RundownHistoryEntry[] = [];
  readonly limit: number;
  readonly byteLimit: number;
  constructor(limit = 50, byteLimit = 20 * 1024 * 1024) { this.limit = limit; this.byteLimit = byteLimit; }
  clear(): void { this.undo = []; this.redo = []; }
  bytes(): number {
    const slices = new Set([...this.undo, ...this.redo].flatMap(e => [e.before, e.after]));
    return [...slices].reduce((n, s) => n + new TextEncoder().encode(JSON.stringify(s)).byteLength, 0);
  }
  record(before: RundownSlice, after: RundownSlice, label: string): 'recorded' | 'unchanged' | 'too-large' {
    if (sameRundown(before, after)) return 'unchanged';
    const previous = this.undo[this.undo.length - 1];
    const entry = { before: previous && sameRundown(previous.after, before) ? previous.after : structuredClone(before), after: structuredClone(after), label };
    this.redo = [];
    this.undo.push(entry);
    while (this.undo.length > this.limit || this.bytes() > this.byteLimit) {
      this.undo.shift();
      if (!this.undo.length) { this.clear(); return 'too-large'; }
    }
    return 'recorded';
  }
  peek(direction: 'undo' | 'redo'): RundownHistoryEntry | undefined { return this[direction][this[direction].length - 1]; }
  accepted(direction: 'undo' | 'redo', entry: RundownHistoryEntry): void {
    if (this.peek(direction) !== entry) return;
    this[direction].pop();
    this[direction === 'undo' ? 'redo' : 'undo'].push(entry);
  }
}
