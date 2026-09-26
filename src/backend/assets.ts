// Asset externalization for cloud sync (Era 5.2b).
//
// A template's embedded fonts/images live in its assets as base64 data-URL strings. Storing those
// inline in the documents.body jsonb bloats rows (a multi-graphic packet is multi-MB) and wrecks
// sync/egress. So before a record is written to the cloud we UPLOAD each data-URL asset to the
// private `user-assets` Storage bucket (keyed by a content hash, so the same font is stored once per
// user) and replace the inline data with a small reference; on read we DOWNLOAD and restore it.
//
// The LOCAL store always keeps the real data-URLs — sentinels only ever exist in a cloud row — so
// the offline preview/export path is completely unchanged.

/** asset.data === `${SENTINEL}${storageKey}` means "the bytes live in Storage under storageKey". */
export const STORAGE_SENTINEL = 'spx-storage:';

/** Fast, dependency-free content hash (FNV-1a, 32-bit). Not cryptographic — just a stable dedupe
 *  key for a user's own assets, and it works in non-secure contexts (crypto.subtle doesn't). */
export function contentHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** An AssetFile-shaped node found while walking a record body. */
type AssetNode = { data: string };

/** Deep-walk a body, collecting every AssetFile-shaped node ({ path: string, data: string }) so the
 *  same logic handles packets (graphics[].template.assets[]), looks (brand.customFont.asset), and
 *  the future project kind without hardcoding any shape. */
function collectAssetNodes(value: unknown, out: AssetNode[]): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) collectAssetNodes(item, out);
    return;
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.path === 'string' && typeof obj.data === 'string') out.push(obj as AssetNode);
  for (const key of Object.keys(obj)) collectAssetNodes(obj[key], out);
}

export type Uploader = (key: string, dataUrl: string) => Promise<void>;
export type Downloader = (key: string) => Promise<string | null>;

/** Return a deep copy of `body` with every base64 data-URL asset uploaded and replaced by a
 *  Storage reference. Non-base64 data-URLs (e.g. inline SVG) are left inline. */
export async function externalizeAssets(body: unknown, uid: string, upload: Uploader): Promise<unknown> {
  const clone = JSON.parse(JSON.stringify(body ?? null));
  const nodes: AssetNode[] = [];
  collectAssetNodes(clone, nodes);
  for (const node of nodes) {
    const data = node.data;
    if (typeof data !== 'string' || !data.startsWith('data:') || !data.includes(';base64,')) continue;
    const key = `${uid}/${contentHash(data)}`;
    await upload(key, data);
    node.data = STORAGE_SENTINEL + key;
  }
  return clone;
}

/**
 * True when `body` still holds at least one Storage sentinel — bytes that live in Storage and
 * have not been rehydrated yet.
 *
 * The sync engine uses this to decide whether a record actually needs its per-record `get()`.
 * A cloud `list()` already returns the whole row; the ONLY thing `get()` adds is
 * `rehydrateAssets`, so a body with no sentinel has nothing to gain from the extra round trip.
 *
 * A plain string scan rather than a tree walk: it runs once per pulled record, and on a large body
 * one `JSON.stringify` is still far cheaper than the network request it avoids. It can only over-report (a literal "spx-storage:" in ordinary text
 * costs one needless fetch), never under-report, which is the safe direction.
 */
export function hasStorageSentinel(body: unknown): boolean {
  if (body === null || body === undefined) return false;
  try {
    return JSON.stringify(body).includes(STORAGE_SENTINEL);
  } catch {
    // Unserializable (a cycle, a BigInt): assume it needs the full fetch rather than risk
    // dropping an asset. Failing towards the slow-but-correct path is the whole point.
    return true;
  }
}

/** Return a deep copy of `body` with every Storage-referenced asset downloaded and restored to its
 *  data-URL. A missing object resolves to '' so the runtime simply hides that image. */
export async function rehydrateAssets(body: unknown, download: Downloader): Promise<unknown> {
  const clone = JSON.parse(JSON.stringify(body ?? null));
  const nodes: AssetNode[] = [];
  collectAssetNodes(clone, nodes);
  for (const node of nodes) {
    const data = node.data;
    if (typeof data !== 'string' || !data.startsWith(STORAGE_SENTINEL)) continue;
    const key = data.slice(STORAGE_SENTINEL.length);
    node.data = (await download(key)) ?? '';
  }
  return clone;
}

// ── data-URL ⇄ Blob (for the Supabase Storage transport) ─────────────────────────────────────────

export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const head = dataUrl.slice(0, comma);
  const b64 = dataUrl.slice(comma + 1);
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// ── refusals (the capacity ceilings from migration 0039) ─────────────────────────────────────────
// Storage can now say no for two reasons that no amount of retrying will fix: the file is over the
// bucket's per-file limit, or the account is over its storage quota. Both arrive as a generic
// `StorageApiError`, and the raw text of the second one ("new row violates row-level security
// policy") tells a user nothing at all. Translating them is what turns a permanently red sync pill
// into something someone can act on.
//
// The two shapes, captured from the live project on 2026-08-12 (both carry HTTP status 400 and put
// the real code in `statusCode`, as a string):
//   over the per-file limit  → statusCode '413', "The object exceeded the maximum allowed size"
//   over the account quota   → statusCode '403', "new row violates row-level security policy"

/** Why Storage refused an upload, when the reason is one a person can do something about. */
export interface AssetRefusal {
  /** Sentence fragment naming the cause; each caller adds its own consequence. */
  reason: string;
  /** What the person can do about it - a whole sentence, for surfaces that have room for one. */
  fix: string;
  /**
   * True when the same bytes will be refused every time, so the caller can fail fast instead of
   * re-sending them. Only the per-file limit qualifies: a quota refusal depends on how much the
   * account is holding right now, which changes as soon as anything is deleted.
   */
  permanent: boolean;
}

/**
 * Classify a Supabase Storage error. Returns null for everything else - a network blip or a 5xx is
 * transient, and the sync engine's ordinary retry is the right answer for those.
 *
 * Note on the 403: an RLS refusal could in principle also mean "not your folder", but every upload
 * path in this app keys objects under the signed-in user's own uid, so quota is the only way a real
 * session reaches it.
 */
export function classifyAssetRefusal(error: unknown): AssetRefusal | null {
  if (!error || typeof error !== 'object') return null;
  const { message, statusCode } = error as { message?: unknown; statusCode?: unknown };
  const text = typeof message === 'string' ? message : '';
  const code = typeof statusCode === 'string' ? statusCode : '';

  if (code === '413' || /exceeded the maximum allowed size/i.test(text)) {
    return {
      reason: 'a file in it is larger than the cloud accepts in one upload',
      fix: 'Replace that image or video with a smaller one.',
      permanent: true,
    };
  }
  if (code === '403' || /row-level security/i.test(text)) {
    return {
      reason: 'this account is out of cloud storage',
      fix: 'Delete graphics you no longer need from the cloud, then try again.',
      permanent: false,
    };
  }
  return null;
}
