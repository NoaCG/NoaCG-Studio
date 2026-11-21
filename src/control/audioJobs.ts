// THE PAGE'S SIDE OF THE BRIDGE'S AUDIO JOBS (docs/AUDIO_TIMELINE_LOUDNESS_PLAN.md §3.1, §3.4): start a
// waveform or a loudness measurement of a server file, follow it, cancel it. The read itself runs in
// NoaCG Bridge, one file at a time, through the server's linked media folder.
//
// A WAVEFORM IS A CACHE, never part of the production: kept in this browser's IndexedDB, keyed by the
// server, the file's name and its size and date as the server lists them. A file replaced on the
// server lists another size or date, so it is read again; another computer reads it once itself.
// Everything here fails soft: a browser that refuses IndexedDB reads the file each time it is asked.

import { cancelAudioJob, listLibrary, readAudioJob, startAudioJob, targetOf, type PlayoutSettings } from './playoutLink';
import type { AudioJobReply, AudioJobRequest, AudioMeasure, AudioWaveform } from './playoutProtocol';

/** How often a running job is asked how it stands. */
const POLL_MS = 250;
/** How long a job may go on with no word from the Bridge before it is given up. */
const SILENT_LIMIT_MS = 30_000;

export interface JobFollow {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export type JobOutcome =
  | { ok: true; job: AudioJobReply }
  | { ok: false; detail: string; cancelled?: true; code?: string };

/** Run one job to its end: started, followed every quarter second, cancelled with `signal`. */
export async function runAudioJob(settings: PlayoutSettings, request: AudioJobRequest, follow: JobFollow = {}): Promise<JobOutcome> {
  const started = await startAudioJob(settings, request);
  if (!started.job) return { ok: false, detail: started.result.detail };
  let job = started.job;
  // Cancelled while the start was on its way: the Bridge has a job nobody will collect, so stop it.
  if (follow.signal?.aborted) {
    void cancelAudioJob(settings, job.id);
    return { ok: false, detail: 'Cancelled.', cancelled: true };
  }
  let heard = Date.now();
  const cancel = () => void cancelAudioJob(settings, job.id);
  follow.signal?.addEventListener('abort', cancel, { once: true });
  try {
    while (job.state === 'queued' || job.state === 'running') {
      if (follow.signal?.aborted) return { ok: false, detail: 'Cancelled.', cancelled: true };
      follow.onProgress?.(job.progress);
      await new Promise((r) => setTimeout(r, POLL_MS));
      const now = await readAudioJob(settings, job.id);
      if (now.job) {
        job = now.job;
        heard = Date.now();
      } else if (Date.now() - heard > SILENT_LIMIT_MS) return { ok: false, detail: now.result.detail };
    }
  } finally {
    follow.signal?.removeEventListener('abort', cancel);
  }
  // Cancelled while the last answer was on its way: the caller asked for no result.
  if (follow.signal?.aborted) return { ok: false, detail: 'Cancelled.', cancelled: true };
  if (job.state === 'done') return { ok: true, job };
  if (job.state === 'cancelled') return { ok: false, detail: 'Cancelled.', cancelled: true };
  return { ok: false, detail: job.problem?.detail ?? 'NoaCG Bridge could not read the file.', code: job.problem?.code };
}

/** The file's size and date as the server lists them now, `bytes:changed`, or null. */
export async function listedFileKey(settings: PlayoutSettings, name: string): Promise<string | null> {
  const { items } = await listLibrary(settings, 'media');
  const item = items?.find((i) => i.name === name);
  return item?.bytes !== undefined ? `${item.bytes}:${item.changed ?? ''}` : null;
}

// --- The waveform cache ---------------------------------------------------------------------------

/** Persisted name: never rename (src rule `model/never-rename-persisted-deployed-identifiers-storage`). */
const DB = 'spx-gfx-waveforms';
const STORE = 'waveforms';

interface CachedWaveform {
  fileKey: string;
  waveform: AudioWaveform;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB refused'));
  });
}

async function store<T>(mode: IDBTransactionMode, act: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    const db = await openDb();
    try {
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = act(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  } catch {
    return undefined;
  }
}

const cacheKey = (settings: PlayoutSettings, name: string) => {
  const t = targetOf(settings);
  return `${t.host.toLowerCase()}:${t.port}|${name}`;
};

/** The columns a waveform is read in: enough for the widest cue panel at one per pixel. */
export const WAVEFORM_BINS = 1200;

/**
 * A file's waveform: from this browser's cache when the server still lists the same file, else read
 * by the Bridge (with progress) and kept. `detail` says why there is none.
 */
export async function loadWaveform(settings: PlayoutSettings, name: string, follow: JobFollow = {}): Promise<{ waveform: AudioWaveform } | { detail: string; cancelled?: true; code?: string }> {
  const key = cacheKey(settings, name);
  const listed = await listedFileKey(settings, name);
  const cached = await store<CachedWaveform | undefined>('readonly', (s) => s.get(key) as IDBRequest<CachedWaveform | undefined>);
  if (listed && cached?.fileKey === listed) return { waveform: cached.waveform };
  const r = await runAudioJob(settings, { kind: 'waveform', name, bins: WAVEFORM_BINS }, follow);
  if (!r.ok) return { detail: r.detail, ...(r.cancelled ? { cancelled: true as const } : {}), ...(r.code ? { code: r.code } : {}) };
  const waveform = r.job.waveform;
  if (!waveform) return { detail: 'NoaCG Bridge returned no waveform.' };
  const fileKey = r.job.fileKey;
  if (fileKey) await store('readwrite', (s) => s.put({ fileKey, waveform } satisfies CachedWaveform, key));
  return { waveform };
}

/** The loudness of the part that airs, as the Bridge measures it, with the file's key. */
export async function measurePart(
  settings: PlayoutSettings,
  name: string,
  part: { trimIn?: number; trimOut?: number },
  follow: JobFollow = {},
): Promise<{ measure: AudioMeasure; fileKey?: string } | { detail: string; cancelled?: true; code?: string }> {
  const r = await runAudioJob(settings, { kind: 'measure', name, ...part }, follow);
  if (!r.ok) return { detail: r.detail, ...(r.cancelled ? { cancelled: true as const } : {}), ...(r.code ? { code: r.code } : {}) };
  if (!r.job.measure) return { detail: 'NoaCG Bridge returned no measurement.' };
  return { measure: r.job.measure, ...(r.job.fileKey ? { fileKey: r.job.fileKey } : {}) };
}
