// WHERE A LOCAL FILE SOURCE'S HANDLE LIVES (issue #2184): this browser's IndexedDB, keyed by the
// source's id. A FileSystemFileHandle can be stored there and nowhere else (it is not JSON), and it
// belongs to this browser on this computer, so it never travels with the production. Another
// computer opening the production finds no handle and says "Choose the file on this computer".
//
// Everything here fails soft: a browser that refuses IndexedDB still reads the file for as long as
// the page stays open (the handle is also kept in memory), and only a reload then asks for it again.

import { FILE_PICKER_TYPES, fileFormatOf, type FileFormat, type FileHandleLike } from './fileSource';

/** Persisted name: never rename (src rule `model/never-rename-persisted-deployed-identifiers-storage`). */
const DB = 'spx-gfx-file-handles';
const STORE = 'handles';

const memory = new Map<string, FileHandleLike>();

/** Whether this browser can link a local file (Chrome and Edge on a computer; not Firefox or Safari). */
export function canPickFiles(): boolean {
  return typeof window !== 'undefined' && typeof (window as { showOpenFilePicker?: unknown }).showOpenFilePicker === 'function';
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB refused'));
  });
}

async function run<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = act(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB refused'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB refused'));
    });
  } finally {
    db.close();
  }
}

/** Keep a source's handle. False when only this page holds it (storage refused). */
export async function saveFileHandle(sourceId: string, handle: FileHandleLike): Promise<boolean> {
  memory.set(sourceId, handle);
  try {
    await run('readwrite', (s) => s.put(handle, sourceId));
    return true;
  } catch {
    return false;
  }
}

/** A source's handle in this browser, or null. */
export async function loadFileHandle(sourceId: string): Promise<FileHandleLike | null> {
  const held = memory.get(sourceId);
  if (held) return held;
  try {
    const handle = (await run('readonly', (s) => s.get(sourceId))) as FileHandleLike | undefined;
    if (handle) memory.set(sourceId, handle);
    return handle ?? null;
  } catch {
    return null;
  }
}

/** Open Chrome's picker for one CSV or .xlsx file. Null when the operator cancelled. */
export async function pickFile(): Promise<{ handle: FileHandleLike; format: FileFormat } | { error: string } | null> {
  const picker = (window as unknown as { showOpenFilePicker: (o: unknown) => Promise<FileHandleLike[]> }).showOpenFilePicker;
  let handles: FileHandleLike[];
  try {
    handles = await picker({ multiple: false, excludeAcceptAllOption: false, types: FILE_PICKER_TYPES });
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') return null;
    return { error: 'The file could not be opened' };
  }
  const handle = handles[0];
  if (!handle) return null;
  const format = fileFormatOf(handle.name);
  if (!format) return { error: `${handle.name} is not a CSV or .xlsx file` };
  return { handle, format };
}

/** Ask Chrome for permission to read the file again (needs the operator's click). */
export async function allowFile(sourceId: string): Promise<boolean> {
  const handle = await loadFileHandle(sourceId);
  if (!handle?.requestPermission) return Boolean(handle);
  return (await handle.requestPermission({ mode: 'read' }).catch(() => 'denied')) === 'granted';
}
