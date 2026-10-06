import { durable, libraryInUse } from './durableStore';
import type { Show } from './shows';

export interface PendingTeamEdit {
  token: string;
  base: Show;
  local: Show;
  teamId: string;
  updatedBy: string | null;
}
const KEY = 'spx-gfx-team-outbox';
interface Outbox { v: 1; owner: string; edits: Record<string, PendingTeamEdit> }

function read(owner: string): Outbox {
  if (owner !== libraryInUse()) throw new Error('Pending team work belongs to another account.');
  const raw = durable.getItem(KEY);
  if (!raw) return { v: 1, owner, edits: {} };
  const parsed = JSON.parse(raw) as Outbox;
  if (parsed.v !== 1 || parsed.owner !== owner || !parsed.edits || typeof parsed.edits !== 'object') {
    throw new Error('Pending team work cannot be read by this build. Its saved data is preserved.');
  }
  for (const [id, edit] of Object.entries(parsed.edits)) {
    if (!edit || typeof edit.token !== 'string' || typeof edit.teamId !== 'string' || edit.base?.id !== id || edit.local?.id !== id || edit.local.teamId !== edit.teamId || !Array.isArray(edit.local.graphics) || !Array.isArray(edit.base.graphics)) {
      throw new Error('Pending team work has an unreadable record. Its saved data is preserved; export it before attempting recovery.');
    }
  }
  return parsed;
}
export function pendingTeamEdits(owner: string): Record<string, PendingTeamEdit> {
  return read(owner).edits;
}
/** Recovery stays available even if a newer or damaged outbox cannot be interpreted. */
export function exportPendingTeamWork(owner: string): string | null {
  if (owner !== libraryInUse()) throw new Error('Pending team work belongs to another account.');
  return durable.getItem(KEY);
}
export function retainTeamEdit(owner: string, id: string, edit: PendingTeamEdit): void {
  const box = read(owner);
  box.edits[id] = edit;
  durable.setItem(KEY, JSON.stringify(box));
}
/** A late acknowledgement may remove only the revision it actually saved. */
export function acknowledgeTeamEdit(owner: string, id: string, local: Show): void {
  const box = read(owner);
  if (JSON.stringify(box.edits[id]?.local) !== JSON.stringify(local)) return;
  delete box.edits[id];
  durable.setItem(KEY, JSON.stringify(box));
}
