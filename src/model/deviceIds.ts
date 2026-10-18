// The persisted format of a device-local list of ids (model/project.ts keeps two in localStorage:
// the reservations this device made, and the graphics whose record lost a sync conflict here).
// Never synced. Pure, so the format is pinned by scripts/device-ids.test.mjs.
//
// Versioned like every persisted format: version 1 is `{ version: 1, ids }`. A bare array is the
// unversioned shape the first build of #1443 wrote and reads as version 0. A NEWER version is not
// understood: it reads as holding nothing and is never written over, so the reservations it may
// name count as another device's (the draft asks for a name, which overwrites nothing).

export const DEVICE_IDS_VERSION = 1;

export interface DeviceIdsRead {
  ids: string[];
  /** False for a version this build does not know: the list stays as that build wrote it. */
  writable: boolean;
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];

export function readDeviceIds(raw: string | null): DeviceIdsRead {
  if (raw === null) return { ids: [], writable: true };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ids: [], writable: true };
  }
  if (Array.isArray(parsed)) return { ids: strings(parsed), writable: true };
  const version = (parsed as { version?: unknown } | null)?.version;
  if (version === DEVICE_IDS_VERSION) return { ids: strings((parsed as { ids?: unknown }).ids), writable: true };
  if (typeof version === 'number' && version > DEVICE_IDS_VERSION) return { ids: [], writable: false };
  return { ids: [], writable: true };
}

export function writeDeviceIds(ids: string[]): string {
  return JSON.stringify({ version: DEVICE_IDS_VERSION, ids });
}
